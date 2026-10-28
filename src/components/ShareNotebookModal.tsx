import React, { useState } from 'react';
import { Check, Copy, ExternalLink, Globe, Lock, RefreshCw, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { Notebook } from '../types/domain';

interface ShareNotebookModalProps {
  notebook: Notebook;
  onActivateOrUpdateShare: (options: {
    includeOriginalPhotos: boolean;
    includePersonalNotes: boolean;
    regenerateToken?: boolean;
  }) => string;
  onRevokeShare: () => void;
  onOpenGuestPreview: (shareToken: string) => void;
  onClose: () => void;
}

export const ShareNotebookModal: React.FC<ShareNotebookModalProps> = ({
  notebook,
  onActivateOrUpdateShare,
  onRevokeShare,
  onOpenGuestPreview,
  onClose,
}) => {
  const [includePhotos, setIncludePhotos] = useState<boolean>(
    notebook.shareConfig.includeOriginalPhotos
  );
  const [includeNotes, setIncludeNotes] = useState<boolean>(
    notebook.shareConfig.includePersonalNotes
  );
  const [copied, setCopied] = useState<boolean>(false);
  const [revokedNotice, setRevokedNotice] = useState<string | null>(null);
  const [lastRevokedToken, setLastRevokedToken] = useState<string | null>(
    notebook.shareConfig.revokedTokens.length > 0
      ? notebook.shareConfig.revokedTokens[notebook.shareConfig.revokedTokens.length - 1]
      : null
  );

  const isEnabled = notebook.shareConfig.isEnabled && Boolean(notebook.shareConfig.shareToken);
  const shareUrl = isEnabled
    ? `${window.location.origin}/?share=${notebook.shareConfig.shareToken}`
    : '';

  const handleEnable = () => {
    setRevokedNotice(null);
    onActivateOrUpdateShare({
      includeOriginalPhotos: includePhotos,
      includePersonalNotes: includeNotes,
      regenerateToken: !notebook.shareConfig.shareToken,
    });
  };

  const handleToggleOption = (nextPhotos: boolean, nextNotes: boolean) => {
    setIncludePhotos(nextPhotos);
    setIncludeNotes(nextNotes);
    if (isEnabled) {
      onActivateOrUpdateShare({
        includeOriginalPhotos: nextPhotos,
        includePersonalNotes: nextNotes,
        regenerateToken: false,
      });
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      setCopied(true);
    }
  };

  const handleRevoke = () => {
    const tokenBeingRevoked = notebook.shareConfig.shareToken;
    onRevokeShare();
    if (tokenBeingRevoked) {
      setLastRevokedToken(tokenBeingRevoked);
    }
    setRevokedNotice(
      'El enlace fue revocado de inmediato. Cualquier persona que intente abrir la dirección anterior verá que el acceso fue desactivado.'
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(30, 25, 20, 0.62)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 1000,
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Compartir cuaderno completo"
    >
      <div className="notebook-page" style={{ maxWidth: 640, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h2 className="serif-heading" style={{ fontSize: '1.75rem', margin: 0 }}>
              Compartir cuaderno «{notebook.title}»
            </h2>
            <span style={{ fontSize: '0.88rem', color: 'var(--ink-secondary)' }}>
              Enlace web de solo lectura para familiares y amigos (sin instalar la app ni registrarse)
            </span>
          </div>
          <button className="btn btn-secondary" onClick={onClose}>
            <X size={18} /> Cerrar
          </button>
        </div>

        <div className="callout-box" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#28402C' }}>
            <ShieldCheck size={17} /> Qué ven tus invitados vs. tu registro privado (CA14)
          </div>
          <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: '0.88rem' }}>
            <li>
              <strong>Visible por defecto:</strong> Portada del cuaderno, láminas ilustradas ({notebook.style === 'acuarela_naturalista' ? 'Acuarela' : 'Lápiz grafito'}), nombres de las aves y datos educativos.
            </li>
            <li>
              <strong>Siempre privado (nunca se publica):</strong> Ubicación exacta, coordenadas GPS, metadatos EXIF de tus fotos, avistamientos en borrador y tu correo de Google.
            </li>
          </ul>
        </div>

        <div className="field-group">
          <label>Opciones de privacidad para este cuaderno (consentimiento explícito)</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includePhotos}
              onChange={(e) => handleToggleOption(e.target.checked, includeNotes)}
            />
            Incluir mis fotografías originales sanitizadas (sin EXIF ni GPS)
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontWeight: 500,
              marginTop: 6,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={includeNotes}
              onChange={(e) => handleToggleOption(includePhotos, e.target.checked)}
            />
            Incluir mis notas personales de avistamiento
          </label>
        </div>

        {isEnabled && notebook.shareConfig.shareToken ? (
          <div style={{ marginTop: 14 }}>
            <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: 6 }}>
              Enlace HTTPS público activo:
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <input
                type="text"
                readOnly
                className="input-text"
                style={{ flex: 1, minWidth: 220 }}
                value={shareUrl}
                aria-label="URL pública del cuaderno"
              />
              <button type="button" className="btn btn-secondary" onClick={handleCopy}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copiado' : 'Copiar enlace'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onOpenGuestPreview(notebook.shareConfig.shareToken!)}
              >
                <ExternalLink size={16} /> Abrir vista web pública (como invitado)
              </button>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    onActivateOrUpdateShare({
                      includeOriginalPhotos: includePhotos,
                      includePersonalNotes: includeNotes,
                      regenerateToken: true,
                    })
                  }
                  title="Invalida el enlace anterior y crea uno nuevo"
                >
                  <RefreshCw size={15} /> Crear nuevo enlace
                </button>
                <button type="button" className="btn btn-terracotta" onClick={handleRevoke}>
                  <Lock size={16} /> Revocar enlace
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 14 }}>
            <button type="button" className="btn btn-primary" onClick={handleEnable}>
              <Globe size={17} /> Activar enlace público de lectura
            </button>
          </div>
        )}

        {revokedNotice && (
          <div className="callout-box terracotta" style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
              <ShieldAlert size={16} /> Enlace revocado (CA15)
            </div>
            <div style={{ fontSize: '0.88rem', marginTop: 4 }}>{revokedNotice}</div>
            {lastRevokedToken && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: 8, padding: '6px 12px', fontSize: '0.82rem' }}
                onClick={() => onOpenGuestPreview(lastRevokedToken)}
              >
                Comprobar que el enlace revocado ya no permite acceso
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
