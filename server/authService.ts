import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolveServerEnv, serverFetch, type ServerEnv } from './secureAiProxy.ts';

export const SESSION_COOKIE_NAME = 'birdy_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 días

/**
 * Cuentas de Google autorizadas por defecto para acceder a Birdy y usar la cuota de Gemini.
 * Puede sobrescribirse o ampliarse desde la variable de entorno ALLOWED_EMAILS (separada por comas).
 */
export const DEFAULT_ALLOWED_EMAILS: readonly string[] = [
  'valedepadua@gmail.com',
  'damiyvale@gmail.com',
];

export interface AuthenticatedSessionUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  iat: number;
  exp: number;
}

export interface AuthConfigStatus {
  googleAuthConfigured: boolean;
  authRequired: boolean;
  googleClientId: string | null;
  allowedEmailsCount: number;
}

export function resolveAllowedEmails(env: ServerEnv = resolveServerEnv()): string[] {
  const raw = env.ALLOWED_EMAILS?.trim();
  if (!raw) {
    return [...DEFAULT_ALLOWED_EMAILS];
  }
  const parsed = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'));
  return parsed.length > 0 ? Array.from(new Set(parsed)) : [...DEFAULT_ALLOWED_EMAILS];
}

export function isEmailAllowed(email: string | null | undefined, env: ServerEnv = resolveServerEnv()): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return resolveAllowedEmails(env).includes(normalized);
}

/**
 * Determina si los endpoints protegidos de IA deben exigir sesión Google válida.
 * - Siempre obligatorio cuando GOOGLE_CLIENT_ID está configurado.
 * - Siempre obligatorio en producción (NODE_ENV=production) o si REQUIRE_GOOGLE_AUTH=true (fail-closed).
 */
export function isAuthEnforced(env: ServerEnv = resolveServerEnv()): boolean {
  if (env.GOOGLE_CLIENT_ID) return true;
  if (env.REQUIRE_GOOGLE_AUTH === 'true') return true;
  if (process.env.NODE_ENV === 'production') return true;
  return false;
}

export function getAuthConfigStatus(env: ServerEnv = resolveServerEnv()): AuthConfigStatus {
  return {
    googleAuthConfigured: Boolean(env.GOOGLE_CLIENT_ID),
    authRequired: isAuthEnforced(env),
    googleClientId: env.GOOGLE_CLIENT_ID || null,
    allowedEmailsCount: resolveAllowedEmails(env).length,
  };
}

function getSessionSigningKey(env: ServerEnv = resolveServerEnv()): Buffer {
  const explicit = env.AUTH_SESSION_SECRET?.trim();
  if (explicit && explicit.length >= 16) {
    return crypto.createHash('sha256').update(explicit).digest();
  }
  // Clave derivada estable si no se definió AUTH_SESSION_SECRET explícito
  const material = `birdy-session-v1:${env.GOOGLE_CLIENT_ID || 'local'}:${env.GEMINI_API_KEY || 'nokey'}`;
  return crypto.createHash('sha256').update(material).digest();
}

export function signSessionToken(
  user: Omit<AuthenticatedSessionUser, 'iat' | 'exp'>,
  env: ServerEnv = resolveServerEnv(),
  maxAgeSeconds = SESSION_MAX_AGE_SECONDS
): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: AuthenticatedSessionUser = {
    ...user,
    email: user.email.trim().toLowerCase(),
    iat: nowSec,
    exp: nowSec + maxAgeSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSigningKey(env))
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${sig}`;
}

export function verifySessionToken(
  token: string | null | undefined,
  env: ServerEnv = resolveServerEnv()
): AuthenticatedSessionUser | null {
  if (!token || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, providedSig] = parts;
  if (!encodedPayload || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSessionSigningKey(env))
    .update(encodedPayload)
    .digest('base64url');

  const bufA = Buffer.from(providedSig, 'utf-8');
  const bufB = Buffer.from(expectedSig, 'utf-8');
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf-8')
    ) as AuthenticatedSessionUser;
    if (!parsed?.email || !parsed?.uid || !parsed?.exp) return null;
    if (parsed.exp * 1000 <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

export function isHttpsRequest(req: IncomingMessage): boolean {
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string' && forwardedProto.split(',')[0].trim() === 'https') {
    return true;
  }
  return Boolean((req.socket as { encrypted?: boolean })?.encrypted);
}

export function setSessionCookie(
  req: IncomingMessage,
  res: ServerResponse,
  token: string
): void {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];
  if (isHttpsRequest(req) || process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req: IncomingMessage, res: ServerResponse): void {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isHttpsRequest(req) || process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

/**
 * Extrae y valida la sesión autenticada desde la cookie HttpOnly (y vuelve a verificar allowlist).
 */
export function getAuthenticatedUserFromRequest(
  req: IncomingMessage,
  env: ServerEnv = resolveServerEnv()
): { status: 'ok'; user: AuthenticatedSessionUser } | { status: 'unauthenticated' } | { status: 'forbidden'; email: string } {
  const cookies = parseCookies(req);
  const rawToken = cookies[SESSION_COOKIE_NAME];
  const session = verifySessionToken(rawToken, env);
  if (!session) {
    return { status: 'unauthenticated' };
  }
  if (!isEmailAllowed(session.email, env)) {
    return { status: 'forbidden', email: session.email };
  }
  return { status: 'ok', user: session };
}

/**
 * Verifica criptográficamente un Google ID Token (JWT emitido por Google Identity Services)
 * directamente contra Google y valida audiencia (GOOGLE_CLIENT_ID), emisor, correo verificado y expiración.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  env: ServerEnv = resolveServerEnv()
): Promise<
  | {
      ok: true;
      user: { uid: string; email: string; displayName: string; photoURL?: string };
    }
  | {
      ok: false;
      code: 'AUTH_NOT_CONFIGURED' | 'INVALID_GOOGLE_TOKEN' | 'EMAIL_NOT_VERIFIED' | 'EMAIL_NOT_ALLOWED';
      message: string;
      email?: string;
    }
> {
  if (!env.GOOGLE_CLIENT_ID) {
    return {
      ok: false,
      code: 'AUTH_NOT_CONFIGURED',
      message: 'Falta configurar GOOGLE_CLIENT_ID en el servidor.',
    };
  }

  const trimmed = idToken.trim();
  if (!trimmed || trimmed.split('.').length !== 3) {
    return {
      ok: false,
      code: 'INVALID_GOOGLE_TOKEN',
      message: 'El token de inicio de sesión de Google no es válido.',
    };
  }

  try {
    const res = await serverFetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(trimmed)}`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) {
      return {
        ok: false,
        code: 'INVALID_GOOGLE_TOKEN',
        message: 'Google rechazó o expiró la credencial de inicio de sesión.',
      };
    }

    const payload = (await res.json()) as {
      aud?: string;
      iss?: string;
      sub?: string;
      email?: string;
      email_verified?: string | boolean;
      name?: string;
      given_name?: string;
      picture?: string;
      exp?: string | number;
    };

    if (payload.aud !== env.GOOGLE_CLIENT_ID) {
      return {
        ok: false,
        code: 'INVALID_GOOGLE_TOKEN',
        message: 'El token no corresponde a esta aplicación (GOOGLE_CLIENT_ID distinto).',
      };
    }

    const validIssuer =
      payload.iss === 'https://accounts.google.com' || payload.iss === 'accounts.google.com';
    if (!validIssuer) {
      return {
        ok: false,
        code: 'INVALID_GOOGLE_TOKEN',
        message: 'Emisor de credencial de Google no válido.',
      };
    }

    const expSec = Number(payload.exp || 0);
    if (!expSec || expSec * 1000 <= Date.now()) {
      return {
        ok: false,
        code: 'INVALID_GOOGLE_TOKEN',
        message: 'La credencial de Google venció. Intentá iniciar sesión nuevamente.',
      };
    }

    const verified = payload.email_verified === true || payload.email_verified === 'true';
    const email = (payload.email || '').trim().toLowerCase();
    if (!verified || !email) {
      return {
        ok: false,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'La cuenta de Google no tiene un correo electrónico verificado.',
      };
    }

    if (!isEmailAllowed(email, env)) {
      return {
        ok: false,
        code: 'EMAIL_NOT_ALLOWED',
        email,
        message: `La cuenta ${email} no está autorizada para acceder a Birdy.`,
      };
    }

    const fallbackName = email.split('@')[0];
    return {
      ok: true,
      user: {
        uid: `google_${payload.sub || email}`,
        email,
        displayName: (payload.given_name || payload.name || fallbackName).trim(),
        photoURL: payload.picture || undefined,
      },
    };
  } catch (err) {
    console.error('[Birdy Auth] Error verificando Google ID token:', err instanceof Error ? err.message : err);
    return {
      ok: false,
      code: 'INVALID_GOOGLE_TOKEN',
      message: 'No pudimos validar tu sesión con Google en este momento. Reintentá en unos segundos.',
    };
  }
}
