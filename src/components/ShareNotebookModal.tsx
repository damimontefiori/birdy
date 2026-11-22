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
      'El enlace fue revocado de inmediato. Cualquier persona que abra la dirección anterior ya no podrá acceder.'
    );
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Compartir cuaderno completo"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-sheet">
        <div className="modal-sheet-handle" aria-hidden="true" />

        <div className="modal-sheet-header">
          <div>
            <h2 className="serif-heading" style={{ fontSize: '1.65rem', margin: 0 }}>
              Compartir «{notebook.title}»
            </h2>
            <span style={{ fontSize: '0.85rem', color: 'var(--ink-secondary)' }}>
              Enlace de solo lectura para familia y amigos, sin registro ni instalación.
            </span>
          </div>
          <button
            type="button"
            className="icon-circle-btn"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="callout-box" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#28402C' }}>
            <ShieldCheck size={16} /> Privacidad protegida
          </div>
          <p style={{ margin: '5px 0 0', fontSize: '0.85rem', color: 'var(--ink-secondary)' }}>
            Por defecto solo se muestran las láminas ilustradas y datos básicos. Nunca se publican
            coordenadas GPS, direcciones, metadatos EXIF ni tu correo.
          </p>
        </div>

        <div className="field-group">
          <label>Qué querés incluir en el enlace</label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={includePhotos}
              onChange={(e) => handleToggleOption(e.target.checked, includeNotes)}
            />
            <span>Incluir mis fotografías reales (sin EXIF ni GPS)</span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={includeNotes}
              onChange={(e) => handleToggleOption(includePhotos, e.target.checked)}
            />
            <span>Incluir mis notas personales</span>
          </label>
        </div>

        {isEnabled && notebook.shareConfig.shareToken ? (
          <div style={{ marginTop: 14 }}>
            <label style={{ fontWeight: 600, fontSize: '0.88rem', display: 'block', marginBottom: 6 }}>
              Enlace público activo:
            </label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                readOnly
                className="input-text"
                style={{ flex: 1, minWidth: 0 }}
                value={shareUrl}
                aria-label="URL pública del cuaderno"
              />
              <button type="button" className="btn btn-secondary btn-compact" onClick={handleCopy}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>

            <div className="modal-sheet-actions" style={{ flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={() => onOpenGuestPreview(notebook.shareConfig.shareToken!)}
              >
                <ExternalLink size={16} /> Ver como invitado
              </button>

              <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() =>
                    onActivateOrUpdateShare({
                      includeOriginalPhotos: includePhotos,
                      includePersonalNotes: includeNotes,
                      regenerateToken: true,
                    })
                  }
                >
                  <RefreshCw size={15} /> Nuevo enlace
                </button>
                <button
                  type="button"
                  className="btn btn-terracotta"
                  style={{ flex: 1 }}
                  onClick={handleRevoke}
                >
                  <Lock size={15} /> Revocar
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={handleEnable}
            >
              <Globe size={17} /> Activar enlace público de lectura
            </button>
          </div>
        )}

        {revokedNotice && (
          <div className="callout-box terracotta" style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
              <ShieldAlert size={16} /> Enlace revocado
            </div>
            <div style={{ fontSize: '0.85rem', marginTop: 4 }}>{revokedNotice}</div>
            {lastRevokedToken && (
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                style={{ marginTop: 8 }}
                onClick={() => onOpenGuestPreview(lastRevokedToken)}
              >
                Comprobar enlace revocado
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
