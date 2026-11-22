import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { exchangeGoogleCredentialForSession } from '../services/authClientService';
import { UserProfile } from '../types/domain';

interface GoogleAccountsIdApi {
  initialize: (config: {
    client_id: string;
    callback?: (response: { credential?: string }) => void;
    ux_mode?: 'popup' | 'redirect';
    login_uri?: string;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      logo_alignment?: 'left' | 'center';
      width?: number;
      locale?: string;
    }
  ) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsIdApi;
      };
    };
  }
}

let gsiScriptPromise: Promise<void> | null = null;

function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiScriptPromise) return gsiScriptPromise;

  gsiScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src^="https://accounts.google.com/gsi/client"]'
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('GSI_LOAD_ERROR')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gsiScriptPromise = null;
      reject(new Error('GSI_LOAD_ERROR'));
    };
    document.head.appendChild(script);
  });

  return gsiScriptPromise;
}

interface GoogleSignInButtonProps {
  googleClientId: string;
  isStandalonePwa: boolean;
  onAuthenticated: (user: UserProfile) => void;
  onAuthError: (message: string) => void;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  googleClientId,
  isStandalonePwa,
  onAuthenticated,
  onAuthError,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loadingScript, setLoadingScript] = useState<boolean>(true);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [scriptFailed, setScriptFailed] = useState<boolean>(false);

  const callbacksRef = useRef({ onAuthenticated, onAuthError });
  callbacksRef.current = { onAuthenticated, onAuthError };

  useEffect(() => {
    let active = true;
    setLoadingScript(true);
    setScriptFailed(false);

    void loadGoogleIdentityScript()
      .then(() => {
        if (!active || !containerRef.current || !window.google?.accounts?.id) return;

        const apiBase = (import.meta.env.VITE_BACKEND_API_URL || '').replace(/\/$/, '');
        const redirectLoginUri = `${apiBase || window.location.origin}/api/auth/google/callback`;

        // En PWA instalada (standalone Android) usar modo 'redirect' evita popups bloqueados o colgados
        if (isStandalonePwa) {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            ux_mode: 'redirect',
            login_uri: redirectLoginUri,
          });
        } else {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            ux_mode: 'popup',
            callback: async (response) => {
              if (!response.credential) {
                callbacksRef.current.onAuthError('Google no devolvió una credencial válida.');
                return;
              }
              setVerifying(true);
              try {
                const res = await exchangeGoogleCredentialForSession(response.credential);
                if (res.ok) {
                  callbacksRef.current.onAuthenticated(res.user);
                } else {
                  callbacksRef.current.onAuthError(res.message);
                }
              } finally {
                if (active) setVerifying(false);
              }
            },
          });
        }

        containerRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          logo_alignment: 'left',
          width: Math.min(310, Math.max(240, window.innerWidth - 72)),
          locale: 'es_419',
        });
        setLoadingScript(false);
      })
      .catch(() => {
        if (!active) return;
        setLoadingScript(false);
        setScriptFailed(true);
      });

    return () => {
      active = false;
    };
  }, [googleClientId, isStandalonePwa]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      {verifying && (
        <div
          className="callout-box"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.86rem' }}
        >
          <Loader2 size={16} className="spin" /> Verificando cuenta autorizada con Google…
        </div>
      )}

      {loadingScript && !scriptFailed && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            color: 'var(--ink-secondary)',
            fontSize: '0.88rem',
            minHeight: 44,
          }}
        >
          <Loader2 size={16} className="spin" /> Cargando inicio de sesión de Google…
        </div>
      )}

      {scriptFailed && (
        <div className="callout-box warning" style={{ fontSize: '0.84rem', textAlign: 'left' }}>
          No pudimos cargar el botón oficial de Google (verificá tu conexión a internet o recargá
          la página).
        </div>
      )}

      <div
        ref={containerRef}
        style={{
          display: verifying || scriptFailed ? 'none' : 'flex',
          justifyContent: 'center',
          minHeight: 44,
        }}
      />
    </div>
  );
};
