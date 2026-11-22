import { UserProfile } from '../types/domain';

export interface ServerAuthStatus {
  googleAuthConfigured: boolean;
  authRequired: boolean;
  googleClientId: string | null;
  allowedEmailsCount: number;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  user: UserProfile | null;
  auth: ServerAuthStatus;
}

function getApiBase(): string {
  const custom = import.meta.env.VITE_BACKEND_API_URL;
  return custom ? custom.replace(/\/$/, '') : '';
}

function isTestEnvironment(): boolean {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');
}

/**
 * Consulta si existe una sesión verificada con Google (cookie HttpOnly) y si Google Auth está activo.
 */
export async function fetchCurrentAuthSession(): Promise<AuthSessionResponse | null> {
  if (isTestEnvironment()) {
    return null;
  }
  try {
    const res = await fetch(`${getApiBase()}/api/auth/me`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    return (await res.json()) as AuthSessionResponse;
  } catch {
    return null;
  }
}

/**
 * Envía el Google ID Token (JWT) al backend para verificarlo contra Google + allowlist
 * y emitir la cookie HttpOnly de sesión.
 */
export async function exchangeGoogleCredentialForSession(
  credential: string
): Promise<
  | { ok: true; user: UserProfile }
  | { ok: false; code: string; message: string; email?: string }
> {
  try {
    const res = await fetch(`${getApiBase()}/api/auth/google`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      user?: UserProfile;
      error?: string;
      message?: string;
      email?: string;
    };

    if (res.ok && data.ok && data.user) {
      return { ok: true, user: data.user };
    }

    return {
      ok: false,
      code: data.error || 'AUTH_FAILED',
      message: data.message || 'No se pudo iniciar sesión con esta cuenta de Google.',
      email: data.email,
    };
  } catch {
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: 'Sin conexión con el servidor para verificar tu cuenta de Google.',
    };
  }
}

export async function logoutServerSession(): Promise<void> {
  if (isTestEnvironment()) return;
  try {
    await fetch(`${getApiBase()}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Continuar con cierre de sesión local
  }
}
