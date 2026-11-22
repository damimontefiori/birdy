import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { handleBirdyApiRequest } from './apiPlugin.ts';
import { getAuthConfigStatus } from './authService.ts';
import { resolveServerEnv } from './secureAiProxy.ts';

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '0.0.0.0';
const distDir = path.resolve(process.cwd(), 'dist');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function applySecurityHeaders(res: http.ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
}

function serveStaticFile(req: http.IncomingMessage, res: http.ServerResponse): void {
  const parsed = new URL(req.url || '/', 'http://localhost');
  const rawPath = decodeURIComponent(parsed.pathname);
  const safeRelative = path.normalize(rawPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(distDir, safeRelative === '/' ? 'index.html' : safeRelative);

  // Evitar path traversal fuera de dist/
  if (!filePath.startsWith(distDir)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // Fallback SPA para rutas del frontend
    filePath = path.join(distDir, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'Frontend no compilado. Ejecutá "npm run build" antes de iniciar producción.',
      })
    );
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');

  if (rawPath.startsWith('/assets/')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (ext === '.html' || rawPath === '/sw.js' || rawPath === '/manifest.webmanifest') {
    res.setHeader('Cache-Control', 'no-cache');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=86400');
  }

  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  applySecurityHeaders(res);
  void handleBirdyApiRequest(req, res).then((handled) => {
    if (handled || res.writableEnded) return;
    serveStaticFile(req, res);
  });
});

server.listen(port, host, () => {
  const env = resolveServerEnv();
  const auth = getAuthConfigStatus(env);
  console.log(
    `[Birdy Producción] Escuchando en http://${host}:${port} · Gemini: ${
      env.GEMINI_API_KEY ? 'SÍ' : 'NO'
    } · Google Auth: ${
      auth.googleAuthConfigured
        ? `ACTIVO (${auth.allowedEmailsCount} cuentas autorizadas)`
        : 'SIN CONFIGURAR (agregá GOOGLE_CLIENT_ID)'
    }`
  );
});
