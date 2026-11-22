import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import {
  fetchINaturalistPhotosForSpecies,
  generateNaturalistPlateWithGemini,
  identifyBirdWithGemini,
  isAllowedImageProxyUrl,
  resolveServerEnv,
  searchINaturalistBirds,
  serverFetch,
} from './secureAiProxy.ts';

const MAX_BODY_BYTES = 12 * 1024 * 1024; // 12 MB

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
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
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve((raw ? JSON.parse(raw) : {}) as T);
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });

    req.on('error', reject);
  });
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

  // CORS para despliegue separado si se usa server/index.ts con VITE_BACKEND_API_URL
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  // 1. Estado del servidor e IA (sin exponer secretos)
  if (pathname === '/api/health' && method === 'GET') {
    const env = resolveServerEnv();
    sendJson(res, 200, {
      ok: true,
      aiConfigured: Boolean(env.GEMINI_API_KEY),
      provider: 'gemini',
      visionModel: env.GEMINI_VISION_MODEL || 'gemini-2.5-flash',
      imageModel: env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview',
    });
    return true;
  }

  // 2. Identificación multimodal real de aves (Google Gemini + iNaturalist)
  if (pathname === '/api/identify-bird' && method === 'POST') {
    const env = resolveServerEnv();
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

  // 3. Generación de lámina botánica original (Acuarela / Lápiz grafito)
  if (pathname === '/api/generate-illustration' && method === 'POST') {
    const env = resolveServerEnv();
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

  // 4. Búsqueda y fotos reales de referencia (iNaturalist API sin API key)
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

  // 5. Proxy seguro de imágenes de referencia (solo iNaturalist y Wikimedia, para Canvas sin tainting)
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
