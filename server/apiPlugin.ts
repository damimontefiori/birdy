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
  identifyBirdWithGemini,
  isAllowedImageProxyUrl,
  resolveServerEnv,
  searchINaturalistBirds,
  serverFetch,
  type ServerEnv,
} from './secureAiProxy.ts';

const MAX_BODY_BYTES = 12 * 1024 * 1024; // 12 MB

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

async function readRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });

    req.on('error', reject);
  });
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
      message: `La cuenta ${sessionCheck.email} no está autorizada para usar la IA de Birdy.`,
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  // 1. Estado del servidor, IA y autenticación (sin exponer secretos ni correos)
  if (pathname === '/api/health' && method === 'GET') {
    const env = resolveServerEnv();
    sendJson(res, 200, {
      ok: true,
      aiConfigured: Boolean(env.GEMINI_API_KEY),
      provider: 'gemini',
      visionModel: env.GEMINI_VISION_MODEL || 'gemini-2.5-flash',
      imageModel: env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview',
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

    if (!env.GEMINI_API_KEY) {
      sendJson(res, 503, {
        error: 'GEMINI_API_KEY_MISSING',
        message:
          'Falta configurar GEMINI_API_KEY en el archivo .env del servidor para analizar fotografías reales.',
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
      console.error('[Birdy API] /api/identify-bird error:', msg);
      sendJson(res, 502, {
        error: 'IDENTIFICATION_FAILED',
        message: 'No pudimos completar el análisis visual con Gemini en este momento.',
        detail: msg.slice(0, 220),
      });
      return true;
    }
  }

  // 7. Generación de lámina botánica original (PROTEGIDA por sesión Google + allowlist)
  if (pathname === '/api/generate-illustration' && method === 'POST') {
    const env = resolveServerEnv();
    if (enforceAiAuthGuard(req, res, env)) {
      return true;
    }

    if (!env.GEMINI_API_KEY) {
      sendJson(res, 503, {
        error: 'GEMINI_API_KEY_MISSING',
        fallback: true,
      });
      return true;
    }

    try {
      const body = await readJsonBody<{
        commonNameAr?: string;
        scientificName?: string;
        identificationTraits?: string;
        style?: 'acuarela_naturalista' | 'lapiz_grafito';
        version?: number;
      }>(req);

      if (!body.scientificName || !body.commonNameAr) {
        sendJson(res, 400, { error: 'MISSING_SPECIES' });
        return true;
      }

      const generated = await generateNaturalistPlateWithGemini(
        {
          commonNameAr: body.commonNameAr,
          scientificName: body.scientificName,
          identificationTraits: body.identificationTraits || body.commonNameAr,
          style: body.style === 'lapiz_grafito' ? 'lapiz_grafito' : 'acuarela_naturalista',
          version: body.version || 1,
        },
        env
      );
      sendJson(res, 200, generated);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error generando lámina';
      console.error('[Birdy API] /api/generate-illustration error:', msg);
      sendJson(res, 502, {
        error: 'ILLUSTRATION_FAILED',
        fallback: true,
        detail: msg.slice(0, 220),
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
