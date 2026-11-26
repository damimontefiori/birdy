import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import {
  clearSessionCookie,
  getAuthConfigStatus,
  getAuthenticatedUserFromRequest,
  isAuthEnforced,
  parseCookies,
  setSessionCookie,
  signSessionToken,
  verifyGoogleIdToken,
} from './authService.ts';
import {
  fetchINaturalistPhotosForSpecies,
  generateNaturalistPlateWithGemini,
  getEffectiveAiImageProviders,
  identifyBirdWithGemini,
  inferServerOrganismGroup,
  isAllowedImageProxyUrl,
  resolveActiveVisionModel,
  resolveServerEnv,
  searchINaturalistBirds,
  serverFetch,
  type ServerEnv,
  type ServerIllustrationStyle,
  type ServerOrganismGroup,
} from './secureAiProxy.ts';
import {
  fetchObjectFromR2,
  fetchPublicNotebookFromCloud,
  getCloudStorageStatus,
  isValidMediaObjectKey,
  loadUserCloudStateFromFirestore,
  publishPublicNotebookToCloud,
  revokePublicNotebookInCloud,
  syncUserStateToCloud,
  uploadDataUrlToR2,
  uploadRawBufferToR2,
  type CloudSyncStatePayload,
} from './cloudStorageService.ts';
import {
  isAllowedSoundProxyUrl,
  resolveElevenLabsApiKey,
  resolveSpeciesSound,
} from './speciesSoundService.ts';

const MAX_BODY_BYTES = 24 * 1024 * 1024; // 24 MB para sincronización JSON segura de fotos sanitizadas
const MAX_MEDIA_BINARY_BYTES = 28 * 1024 * 1024; // 28 MB para videos cortos de jardín subidos a R2

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function sendRedirect(res: ServerResponse, location: string): void {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

async function readRawBuffer(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    req.on('error', reject);
  });
}

async function readRawBody(req: IncomingMessage): Promise<string> {
  const buf = await readRawBuffer(req, MAX_BODY_BYTES);
  return buf.toString('utf-8');
}

/**
 * Sirve un Buffer de audio o video soportando cabeceras HTTP Range (206 Partial Content),
 * indispensable para que Safari iOS y Chrome Android reproduzcan y adelanten videos/sonidos.
 */
function sendMediaBufferWithRange(
  req: IncomingMessage,
  res: ServerResponse,
  buffer: Buffer,
  contentType: string,
  cacheControl: string
): void {
  const total = buffer.length;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', cacheControl);

  const rangeHeader = req.headers.range;
  if (rangeHeader && /^bytes=\d*-\d*$/.test(rangeHeader.trim())) {
    const [startStr, endStr] = rangeHeader.trim().replace(/^bytes=/, '').split('-');
    let start = startStr ? parseInt(startStr, 10) : 0;
    let end = endStr ? parseInt(endStr, 10) : total - 1;
    if (!startStr && endStr) {
      start = Math.max(0, total - parseInt(endStr, 10));
      end = total - 1;
    }
    if (isNaN(start) || isNaN(end) || start < 0 || start >= total || end < start) {
      res.statusCode = 416;
      res.setHeader('Content-Range', `bytes */${total}`);
      res.end();
      return;
    }
    end = Math.min(end, total - 1);
    const slice = buffer.subarray(start, end + 1);
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', String(slice.length));
    res.end(slice);
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Length', String(total));
  res.end(buffer);
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const raw = await readRawBody(req);
  try {
    return (raw ? JSON.parse(raw) : {}) as T;
  } catch {
    throw new Error('INVALID_JSON');
  }
}

/**
 * Guardia estricta de autenticación en el servidor para proteger la cuota de Google Gemini.
 * Si Google Auth está activo (o en producción), exige cookie HttpOnly firmada de una cuenta autorizada.
 */
function enforceAiAuthGuard(
  req: IncomingMessage,
  res: ServerResponse,
  env: ServerEnv
): boolean {
  if (!isAuthEnforced(env)) {
    return false;
  }

  if (!env.GOOGLE_CLIENT_ID) {
    sendJson(res, 503, {
      error: 'AUTH_NOT_CONFIGURED',
      message:
        'Falta configurar GOOGLE_CLIENT_ID en el servidor para proteger el acceso a Gemini en producción.',
    });
    return true;
  }

  const sessionCheck = getAuthenticatedUserFromRequest(req, env);
  if (sessionCheck.status === 'unauthenticated') {
    sendJson(res, 401, {
      error: 'AUTH_REQUIRED',
      message: 'Iniciá sesión con una cuenta de Google autorizada para usar la identificación por IA.',
    });
    return true;
  }

  if (sessionCheck.status === 'forbidden') {
    clearSessionCookie(req, res);
    sendJson(res, 403, {
      error: 'EMAIL_NOT_ALLOWED',
      message: `La cuenta ${sessionCheck.email} no está autorizada para usar la IA de Bioma.`,
    });
    return true;
  }

  return false;
}

/**
 * Manejador HTTP compartido para los endpoints /api/* de Birdy.
 * Funciona tanto dentro del middleware de Vite (`npm run dev`) como en `server/index.ts`.
 */
export async function handleBirdyApiRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const reqUrl = req.url || '';
  if (!reqUrl.startsWith('/api/')) {
    return false;
  }

  const parsedUrl = new URL(reqUrl, 'http://localhost');
  const pathname = parsedUrl.pathname;
  const method = (req.method || 'GET').toUpperCase();

  // CORS compatible con cookies HttpOnly cuando se despliega en el mismo origen o backend separado
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, X-Sighting-Id, X-Media-Kind');

  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  // 1. Estado del servidor, IA, almacenamiento real en la nube y autenticación (sin exponer secretos ni correos)
  if (pathname === '/api/health' && method === 'GET') {
    const env = resolveServerEnv();
    const visionFallbackProviders: string[] = [];
    if (env.GROQ_API_KEY) visionFallbackProviders.push('Groq Vision (Llama 4 Scout)');
    if (env.OPENROUTER_API_KEY) visionFallbackProviders.push('OpenRouter Vision (:free)');
    if (env.HUGGINGFACE_API_KEY) visionFallbackProviders.push('Hugging Face Vision (Qwen2.5-VL)');

    const imageFallbackProviders = getEffectiveAiImageProviders(env);
    const cloudStorage = getCloudStorageStatus(env);

    sendJson(res, 200, {
      ok: true,
      aiConfigured: Boolean(env.GEMINI_API_KEY || visionFallbackProviders.length > 0),
      illustrationCloudConfigured: Boolean(
        env.GEMINI_API_KEY || imageFallbackProviders.length > 0
      ),
      visionFallbackProviders,
      imageFallbackProviders,
      provider: 'gemini',
      visionModel: resolveActiveVisionModel(env),
      imageModel: env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image',
      soundAiFallbackConfigured: Boolean(resolveElevenLabsApiKey(env)),
      cloudStorage,
      auth: getAuthConfigStatus(env),
    });
    return true;
  }

  // 2. Estado de sesión actual (cookie HttpOnly verificada)
  if (pathname === '/api/auth/me' && method === 'GET') {
    const env = resolveServerEnv();
    const authStatus = getAuthConfigStatus(env);
    const sessionCheck = getAuthenticatedUserFromRequest(req, env);

    if (sessionCheck.status === 'ok') {
      sendJson(res, 200, {
        authenticated: true,
        user: {
          uid: sessionCheck.user.uid,
          email: sessionCheck.user.email,
          displayName: sessionCheck.user.displayName,
          photoURL: sessionCheck.user.photoURL,
        },
        auth: authStatus,
      });
      return true;
    }

    if (sessionCheck.status === 'forbidden') {
      clearSessionCookie(req, res);
    }

    sendJson(res, 200, {
      authenticated: false,
      user: null,
      auth: authStatus,
    });
    return true;
  }

  // 3. Inicio de sesión real con Google Identity Services (flujo Popup / JSON)
  if (pathname === '/api/auth/google' && method === 'POST') {
    const env = resolveServerEnv();
    try {
      const body = await readJsonBody<{ credential?: string }>(req);
      if (!body.credential) {
        sendJson(res, 400, {
          error: 'MISSING_CREDENTIAL',
          message: 'Falta la credencial enviada por Google.',
        });
        return true;
      }

      const verified = await verifyGoogleIdToken(body.credential, env);
      if (!verified.ok) {
        clearSessionCookie(req, res);
        const status =
          verified.code === 'EMAIL_NOT_ALLOWED'
            ? 403
            : verified.code === 'AUTH_NOT_CONFIGURED'
              ? 503
              : 401;
        sendJson(res, status, {
          error: verified.code,
          message: verified.message,
          email: verified.email,
        });
        return true;
      }

      const sessionToken = signSessionToken(verified.user, env);
      setSessionCookie(req, res, sessionToken);
      sendJson(res, 200, {
        ok: true,
        user: verified.user,
      });
      return true;
    } catch {
      sendJson(res, 400, {
        error: 'INVALID_REQUEST',
        message: 'Solicitud de autenticación inválida.',
      });
      return true;
    }
  }

  // 4. Callback de Google Identity Services en modo Redirect (ideal para PWA instalada en Android)
  if (pathname === '/api/auth/google/callback' && method === 'POST') {
    const env = resolveServerEnv();
    try {
      const raw = await readRawBody(req);
      const params = new URLSearchParams(raw);
      const credential = params.get('credential') || '';
      const bodyCsrf = params.get('g_csrf_token') || '';
      const cookies = parseCookies(req);
      const cookieCsrf = cookies['g_csrf_token'] || '';

      if (!bodyCsrf || !cookieCsrf || bodyCsrf !== cookieCsrf) {
        clearSessionCookie(req, res);
        sendRedirect(res, '/?auth_error=csrf_failed');
        return true;
      }

      const verified = await verifyGoogleIdToken(credential, env);
      if (!verified.ok) {
        clearSessionCookie(req, res);
        if (verified.code === 'EMAIL_NOT_ALLOWED') {
          const emailParam = verified.email ? `&auth_email=${encodeURIComponent(verified.email)}` : '';
          sendRedirect(res, `/?auth_error=not_authorized${emailParam}`);
          return true;
        }
        sendRedirect(res, '/?auth_error=invalid_token');
        return true;
      }

      const sessionToken = signSessionToken(verified.user, env);
      setSessionCookie(req, res, sessionToken);
      sendRedirect(res, '/');
      return true;
    } catch {
      clearSessionCookie(req, res);
      sendRedirect(res, '/?auth_error=invalid_token');
      return true;
    }
  }

  // 5. Cerrar sesión
  if (pathname === '/api/auth/logout' && method === 'POST') {
    clearSessionCookie(req, res);
    sendJson(res, 200, { ok: true });
    return true;
  }

  // 6. Identificación multimodal real de aves (PROTEGIDA por sesión Google + allowlist)
  if (pathname === '/api/identify-bird' && method === 'POST') {
    const env = resolveServerEnv();
    if (enforceAiAuthGuard(req, res, env)) {
      return true;
    }

    if (
      !env.GEMINI_API_KEY &&
      !env.GROQ_API_KEY &&
      !env.OPENROUTER_API_KEY &&
      !env.HUGGINGFACE_API_KEY
    ) {
      sendJson(res, 503, {
        error: 'GEMINI_API_KEY_MISSING',
        message:
          'Falta configurar GEMINI_API_KEY (o GROQ_API_KEY) en el servidor para analizar fotografías reales.',
      });
      return true;
    }

    try {
      const body = await readJsonBody<{
        sanitizedPhotoDataUrl?: string;
        generalLocationHint?: string;
        observedAtIso?: string;
      }>(req);

      if (!body.sanitizedPhotoDataUrl) {
        sendJson(res, 400, { error: 'MISSING_PHOTO', message: 'Falta la fotografía a analizar.' });
        return true;
      }

      const result = await identifyBirdWithGemini(
        {
          sanitizedPhotoDataUrl: body.sanitizedPhotoDataUrl,
          generalLocationHint: body.generalLocationHint,
          observedAtIso: body.observedAtIso,
        },
        env
      );
      sendJson(res, 200, result);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error inesperado';
      console.error('[Bioma API] /api/identify-bird error:', msg);
      if (msg.includes('GEMINI_HIGH_DEMAND')) {
        sendJson(res, 503, {
          error: 'GEMINI_HIGH_DEMAND',
          message:
            'Los servidores de Google Gemini tienen un pico momentáneo de demanda. Esperá unos segundos y tocá «Reintentar análisis con IA».',
          detail: msg.slice(0, 220),
        });
        return true;
      }
      if (msg.includes('GEMINI_QUOTA_EXCEEDED')) {
        sendJson(res, 429, {
          error: 'GEMINI_QUOTA_EXCEEDED',
          message:
            'Se alcanzó temporalmente el límite por minuto de tu clave gratuita de Gemini. Esperá 1 minuto y reintentá.',
          detail: msg.slice(0, 220),
        });
        return true;
      }
      sendJson(res, 502, {
        error: 'IDENTIFICATION_FAILED',
        message: 'No pudimos completar el análisis visual en este momento. Probá reintentar.',
        detail: msg.slice(0, 220),
      });
      return true;
    }
  }

  // 7. Generación de lámina botánica original 100% IA (PROTEGIDA por sesión Google + allowlist)
  if (pathname === '/api/generate-illustration' && method === 'POST') {
    const env = resolveServerEnv();
    if (enforceAiAuthGuard(req, res, env)) {
      return true;
    }

    if (
      !env.GEMINI_API_KEY &&
      !env.HUGGINGFACE_API_KEY &&
      !env.CLOUDFLARE_API_TOKEN &&
      !env.OPENAI_API_KEY
    ) {
      sendJson(res, 503, {
        error: 'GEMINI_API_KEY_MISSING',
        fallback: false,
      });
      return true;
    }

    try {
      const body = await readJsonBody<{
        commonNameAr?: string;
        scientificName?: string;
        identificationTraits?: string;
        style?: ServerIllustrationStyle;
        organismGroup?: ServerOrganismGroup;
        version?: number;
      }>(req);

      if (!body.scientificName || !body.commonNameAr) {
        sendJson(res, 400, { error: 'MISSING_SPECIES' });
        return true;
      }

      const resolvedStyle: ServerIllustrationStyle =
        body.style === 'lapiz_grafito'
          ? 'lapiz_grafito'
          : body.style === 'acuarela_naturalista'
            ? 'acuarela_naturalista'
            : 'muralismo_fauna';

      const generated = await generateNaturalistPlateWithGemini(
        {
          commonNameAr: body.commonNameAr,
          scientificName: body.scientificName,
          identificationTraits: body.identificationTraits || body.commonNameAr,
          style: resolvedStyle,
          organismGroup: inferServerOrganismGroup({
            organismGroup: body.organismGroup,
            scientificName: body.scientificName,
            commonName: body.commonNameAr,
          }),
          version: body.version || 1,
        },
        env
      );

      // Si Cloudflare R2 está configurado, subir la obra IA directamente al bucket para evitar DataURLs gigantes
      const cloudStatus = getCloudStorageStatus(env);
      if (cloudStatus.r2BucketConfigured && generated.imageUrl.startsWith('data:image/')) {
        try {
          const session = getAuthenticatedUserFromRequest(req, env);
          const ownerUid =
            session.status === 'ok' ? session.user.uid : 'local-dev-user';
          const safeSlug = body.scientificName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '');
          const uploaded = await uploadDataUrlToR2({
            keyPrefix: `users/${ownerUid.replace(/[^a-zA-Z0-9_.\-:]/g, '_')}/illustrations/${safeSlug}_${resolvedStyle}_v${body.version || 1}_${Date.now()}`,
            dataUrl: generated.imageUrl,
            env,
          });
          if (uploaded) {
            generated.imageUrl = uploaded.url;
          }
        } catch (r2Err) {
          console.warn(
            '[Bioma API] R2 upload skipped for illustration:',
            r2Err instanceof Error ? r2Err.message : r2Err
          );
        }
      }

      sendJson(res, 200, generated);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error generando lámina';
      const isQuota = msg.includes('GEMINI_IMAGE_QUOTA_EXCEEDED');
      console.error('[Bioma API] /api/generate-illustration error:', msg);
      sendJson(res, isQuota ? 429 : 502, {
        error: isQuota ? 'GEMINI_IMAGE_QUOTA_EXCEEDED' : 'ILLUSTRATION_FAILED',
        fallback: false,
        detail: msg.slice(0, 260),
      });
      return true;
    }
  }

  // 8. Búsqueda y fotos reales de referencia (iNaturalist API pública sin cuota Gemini)
  if (pathname === '/api/bird-reference' && method === 'GET') {
    const scientificName = parsedUrl.searchParams.get('scientificName') || '';
    const query = parsedUrl.searchParams.get('q') || '';

    try {
      if (scientificName.trim()) {
        const ref = await fetchINaturalistPhotosForSpecies(scientificName);
        sendJson(res, 200, { species: ref });
        return true;
      }
      if (query.trim()) {
        const results = await searchINaturalistBirds(query);
        sendJson(res, 200, { results });
        return true;
      }
      sendJson(res, 400, { error: 'MISSING_QUERY' });
      return true;
    } catch {
      sendJson(res, 502, { error: 'REFERENCE_FETCH_FAILED', results: [] });
      return true;
    }
  }

  // 9. Proxy seguro de imágenes de referencia (solo iNaturalist y Wikimedia)
  if (pathname === '/api/image-proxy' && method === 'GET') {
    const targetUrl = parsedUrl.searchParams.get('url') || '';
    if (!isAllowedImageProxyUrl(targetUrl)) {
      sendJson(res, 403, { error: 'HOST_NOT_ALLOWED' });
      return true;
    }
    try {
      const upstream = await serverFetch(targetUrl, {
        headers: { 'User-Agent': 'BirdyCuadernoDeAves/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!upstream.ok) {
        res.statusCode = upstream.status;
        res.end();
        return true;
      }
      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.end(buffer);
      return true;
    } catch {
      res.statusCode = 502;
      res.end();
      return true;
    }
  }

  // 9B. Sonidos reales de aves, polinizadores e insectos (iNaturalist + Wikimedia + respaldo ElevenLabs/R2)
  if (pathname === '/api/species-sound' && method === 'GET') {
    const env = resolveServerEnv();
    const scientificName = (parsedUrl.searchParams.get('scientificName') || '').trim();
    const commonNameAr = (parsedUrl.searchParams.get('commonNameAr') || '').trim();
    const rawGroup = (parsedUrl.searchParams.get('organismGroup') || '').trim();

    if (!scientificName) {
      sendJson(res, 400, { error: 'MISSING_SPECIES' });
      return true;
    }

    try {
      const organismGroup = inferServerOrganismGroup({
        organismGroup: rawGroup,
        scientificName,
        commonName: commonNameAr,
      });
      const sound = await resolveSpeciesSound(
        { scientificName, commonNameAr: commonNameAr || scientificName, organismGroup },
        env
      );
      sendJson(res, 200, sound);
      return true;
    } catch (err) {
      console.error('[Bioma API] /api/species-sound error:', err instanceof Error ? err.message : err);
      sendJson(res, 502, {
        status: 'unavailable',
        scientificName,
        commonNameAr,
        acousticSummary: 'No pudimos consultar el archivo sonoro en este momento.',
        tracks: [],
      });
      return true;
    }
  }

  // 9C. Proxy seguro de audio con soporte HTTP Range para reproducción fluida en Android / iOS
  if (pathname === '/api/sound-proxy' && method === 'GET') {
    const targetUrl = parsedUrl.searchParams.get('url') || '';
    if (!isAllowedSoundProxyUrl(targetUrl)) {
      sendJson(res, 403, { error: 'SOUND_HOST_NOT_ALLOWED' });
      return true;
    }
    try {
      const upstream = await serverFetch(targetUrl, {
        headers: { 'User-Agent': 'BiomaCuadernoVivo/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (!upstream.ok) {
        res.statusCode = upstream.status;
        res.end();
        return true;
      }
      const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
      const buffer = Buffer.from(await upstream.arrayBuffer());
      sendMediaBufferWithRange(req, res, buffer, contentType, 'public, max-age=604800');
      return true;
    } catch {
      res.statusCode = 502;
      res.end();
      return true;
    }
  }

  // 10B. Subida binaria directa de videos cortos (y audios) a Cloudflare R2
  if (pathname === '/api/cloud/upload-media' && method === 'POST') {
    const env = resolveServerEnv();
    if (enforceAiAuthGuard(req, res, env)) {
      return true;
    }
    const status = getCloudStorageStatus(env);
    if (!status.r2BucketConfigured) {
      sendJson(res, 200, { configured: false, uploaded: false });
      return true;
    }

    try {
      const contentType = String(req.headers['content-type'] || 'video/mp4').split(';')[0].trim();
      if (!contentType.startsWith('video/') && !contentType.startsWith('audio/')) {
        sendJson(res, 400, { error: 'UNSUPPORTED_MEDIA_TYPE' });
        return true;
      }

      const rawSightingId = String(
        req.headers['x-sighting-id'] || parsedUrl.searchParams.get('sightingId') || `media_${Date.now()}`
      ).replace(/[^a-zA-Z0-9_.\-]/g, '_');

      const session = getAuthenticatedUserFromRequest(req, env);
      const safeUid = (
        session.status === 'ok'
          ? session.user.uid
          : parsedUrl.searchParams.get('uid') || 'google-valeria-ar-01'
      ).replace(/[^a-zA-Z0-9_.\-:]/g, '_');

      const buffer = await readRawBuffer(req, MAX_MEDIA_BINARY_BYTES);
      if (buffer.length === 0) {
        sendJson(res, 400, { error: 'EMPTY_MEDIA_BODY' });
        return true;
      }

      const folder = contentType.startsWith('audio/') ? 'sounds' : 'videos';
      const uploaded = await uploadRawBufferToR2({
        keyPrefix: `users/${safeUid}/${folder}/${rawSightingId}`,
        buffer,
        mimeType: contentType,
        env,
      });

      if (!uploaded) {
        sendJson(res, 502, { error: 'R2_UPLOAD_FAILED' });
        return true;
      }

      sendJson(res, 200, {
        configured: true,
        uploaded: true,
        url: uploaded.url,
        key: uploaded.key,
      });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error subiendo video';
      const isTooLarge = msg === 'PAYLOAD_TOO_LARGE';
      sendJson(res, isTooLarge ? 413 : 502, {
        error: isTooLarge ? 'MEDIA_TOO_LARGE' : 'MEDIA_UPLOAD_FAILED',
        message: isTooLarge
          ? 'El video supera el tamaño máximo permitido (28 MB). Elegí un clip corto de jardín.'
          : msg.slice(0, 200),
      });
      return true;
    }
  }

  // 10. Persistencia real en la nube: cargar estado desde Firestore (PROTEGIDO)
  if (pathname === '/api/cloud/state' && method === 'GET') {
    const env = resolveServerEnv();
    if (enforceAiAuthGuard(req, res, env)) {
      return true;
    }
    const status = getCloudStorageStatus(env);
    if (!status.firestoreConfigured) {
      sendJson(res, 200, { configured: false, state: null, cloudStorage: status });
      return true;
    }

    const session = getAuthenticatedUserFromRequest(req, env);
    const uid =
      session.status === 'ok'
        ? session.user.uid
        : parsedUrl.searchParams.get('uid') || 'google-valeria-ar-01';

    try {
      const state = await loadUserCloudStateFromFirestore(uid, env);
      sendJson(res, 200, { configured: true, state, cloudStorage: status });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error leyendo Firestore';
      console.error('[Bioma API] /api/cloud/state error:', msg);
      sendJson(res, 502, { error: 'CLOUD_LOAD_FAILED', message: msg.slice(0, 220) });
      return true;
    }
  }

  // 11. Persistencia real en la nube: sincronizar cuadernos, fotos (R2) y metadatos (Firestore)
  if (pathname === '/api/cloud/sync' && method === 'POST') {
    const env = resolveServerEnv();
    if (enforceAiAuthGuard(req, res, env)) {
      return true;
    }
    const status = getCloudStorageStatus(env);
    if (!status.firestoreConfigured && !status.r2BucketConfigured) {
      sendJson(res, 200, { configured: false, cloudStorage: status });
      return true;
    }

    try {
      const body = await readJsonBody<CloudSyncStatePayload & { uid?: string }>(req);
      const session = getAuthenticatedUserFromRequest(req, env);
      const uid =
        session.status === 'ok' ? session.user.uid : body.uid || 'google-valeria-ar-01';

      const result = await syncUserStateToCloud(uid, body, env);
      sendJson(res, 200, { configured: true, ...result, cloudStorage: status });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error sincronizando con la nube';
      console.error('[Bioma API] /api/cloud/sync error:', msg);
      sendJson(res, 502, { error: 'CLOUD_SYNC_FAILED', message: msg.slice(0, 240) });
      return true;
    }
  }

  // 12. Publicar o actualizar proyección pública de cuaderno compartido en Firestore + R2
  if (pathname === '/api/cloud/share' && method === 'POST') {
    const env = resolveServerEnv();
    if (enforceAiAuthGuard(req, res, env)) {
      return true;
    }
    const status = getCloudStorageStatus(env);
    if (!status.firestoreConfigured) {
      sendJson(res, 200, { configured: false, published: false });
      return true;
    }

    try {
      const body = await readJsonBody<{ projection?: Record<string, unknown>; uid?: string }>(req);
      if (!body.projection) {
        sendJson(res, 400, { error: 'MISSING_PROJECTION' });
        return true;
      }
      const session = getAuthenticatedUserFromRequest(req, env);
      const uid =
        session.status === 'ok' ? session.user.uid : body.uid || 'google-valeria-ar-01';
      const result = await publishPublicNotebookToCloud(uid, body.projection, env);
      sendJson(res, 200, { configured: true, ...result });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error publicando cuaderno';
      console.error('[Bioma API] /api/cloud/share error:', msg);
      sendJson(res, 502, { error: 'CLOUD_SHARE_FAILED', message: msg.slice(0, 220) });
      return true;
    }
  }

  // 13. Revocar enlace público compartido en Firestore al instante
  if (pathname === '/api/cloud/share/revoke' && method === 'POST') {
    const env = resolveServerEnv();
    if (enforceAiAuthGuard(req, res, env)) {
      return true;
    }
    const status = getCloudStorageStatus(env);
    if (!status.firestoreConfigured) {
      sendJson(res, 200, { configured: false, revoked: false });
      return true;
    }

    try {
      const body = await readJsonBody<{ shareToken?: string; uid?: string }>(req);
      if (!body.shareToken) {
        sendJson(res, 400, { error: 'MISSING_SHARE_TOKEN' });
        return true;
      }
      const session = getAuthenticatedUserFromRequest(req, env);
      const uid =
        session.status === 'ok' ? session.user.uid : body.uid || 'google-valeria-ar-01';
      await revokePublicNotebookInCloud(uid, body.shareToken, env);
      sendJson(res, 200, { configured: true, revoked: true });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error revocando enlace';
      console.error('[Bioma API] /api/cloud/share/revoke error:', msg);
      sendJson(res, 502, { error: 'CLOUD_REVOKE_FAILED', message: msg.slice(0, 220) });
      return true;
    }
  }

  // 14. Lectura pública de un cuaderno compartido (sin requerir sesión Google, para familia/amigos)
  if (pathname.startsWith('/api/public/notebook/') && method === 'GET') {
    const env = resolveServerEnv();
    const token = decodeURIComponent(pathname.slice('/api/public/notebook/'.length)).trim();
    if (!token) {
      sendJson(res, 400, { status: 'not_found' });
      return true;
    }
    try {
      const lookup = await fetchPublicNotebookFromCloud(token, env);
      if (lookup.status === 'unconfigured') {
        sendJson(res, 200, { configured: false, status: 'unconfigured' });
        return true;
      }
      sendJson(res, 200, { configured: true, ...lookup });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error leyendo cuaderno compartido';
      console.error('[Bioma API] /api/public/notebook error:', msg);
      sendJson(res, 502, { status: 'not_found', error: msg.slice(0, 180) });
      return true;
    }
  }

  // 15. Proxy seguro de medios almacenados en Cloudflare R2 privado (/api/media/<key>)
  if (pathname.startsWith('/api/media/') && method === 'GET') {
    const env = resolveServerEnv();
    const key = decodeURIComponent(pathname.slice('/api/media/'.length)).replace(/^\/+/, '');
    if (!isValidMediaObjectKey(key)) {
      sendJson(res, 400, { error: 'INVALID_MEDIA_KEY' });
      return true;
    }

    // Archivos privados bajo users/<uid>/ exigen sesión del propietario cuando la auth está activa;
    // archivos bajo public/<shareToken>/ son legibles públicamente (sanitizados sin EXIF).
    if (!key.startsWith('public/')) {
      if (enforceAiAuthGuard(req, res, env)) {
        return true;
      }
      if (isAuthEnforced(env) && key.startsWith('users/')) {
        const session = getAuthenticatedUserFromRequest(req, env);
        const keyOwner = key.split('/')[1] || '';
        const sessionUid =
          session.status === 'ok'
            ? session.user.uid.replace(/[^a-zA-Z0-9_.\-:]/g, '_')
            : '';
        if (!sessionUid || keyOwner !== sessionUid) {
          sendJson(res, 403, { error: 'FORBIDDEN_MEDIA' });
          return true;
        }
      }
    }

    try {
      const obj = await fetchObjectFromR2(key, env);
      if (!obj) {
        res.statusCode = 404;
        res.end();
        return true;
      }
      sendMediaBufferWithRange(
        req,
        res,
        obj.buffer,
        obj.contentType,
        key.startsWith('public/') ? 'public, max-age=31536000, immutable' : 'private, max-age=86400'
      );
      return true;
    } catch (err) {
      console.error('[Bioma API] /api/media error:', err instanceof Error ? err.message : err);
      res.statusCode = 502;
      res.end();
      return true;
    }
  }

  sendJson(res, 404, { error: 'NOT_FOUND' });
  return true;
}

/**
 * Plugin de Vite que monta los endpoints seguros de Birdy directamente en el dev server y preview server.
 */
export function birdyApiVitePlugin(): Plugin {
  return {
    name: 'birdy-secure-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          next();
          return;
        }
        void handleBirdyApiRequest(req, res).catch(() => {
          if (!res.writableEnded) {
            sendJson(res, 500, { error: 'INTERNAL_SERVER_ERROR' });
          }
        });
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          next();
          return;
        }
        void handleBirdyApiRequest(req, res).catch(() => {
          if (!res.writableEnded) {
            sendJson(res, 500, { error: 'INTERNAL_SERVER_ERROR' });
          }
        });
      });
    },
  };
}
