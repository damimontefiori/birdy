import React, { useEffect, useState } from 'react';
import { CheckCircle2, Download, Image as ImageIcon, Share2, ShieldCheck, Sparkles, X } from 'lucide-react';
import {
  composeSocialShareCard,
  RenderedSocialCard,
  shareRenderedCardNativeOrDownload,
  SocialShareFormat,
  SocialShareVariant,
} from '../services/socialShareComposer';
import { IllustrationStyle, Notebook, Sighting, SpeciesCatalogEntry } from '../types/domain';

interface ShareSightingModalProps {
  notebook: Notebook;
  species: SpeciesCatalogEntry;
  sighting: Sighting;
  illustrationUrl: string;
  style: IllustrationStyle;
  onClose: () => void;
}

export const ShareSightingModal: React.FC<ShareSightingModalProps> = ({
  notebook,
  species,
  sighting,
  illustrationUrl,
  style,
  onClose,
}) => {
  const [variant, setVariant] = useState<SocialShareVariant>('solo_ilustracion');
  const [format, setFormat] = useState<SocialShareFormat>('historia_9_16');
  const [includeDate, setIncludeDate] = useState<boolean>(true);
  const [includePersonalNote, setIncludePersonalNote] = useState<boolean>(false);
  const [rendered, setRendered] = useState<RenderedSocialCard | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    composeSocialShareCard({
      variant,
      format,
      style,
      commonNameAr: species.commonNameAr,
      scientificName: species.scientificName,
      family: species.family,
      illustrationUrl,
      originalPhotoSanitizedUrl: sighting.sanitizedPhotoDataUrl,
      includeDate,
      observedAtIso: sighting.observedAt,
      includePersonalNote,
      personalNote: sighting.personalNote,
      notebookTitle: notebook.title,
      ownerDisplayName: notebook.ownerDisplayName || 'Valeria',
    }).then((card) => {
      if (active) setRendered(card);
    });
    return () => {
      active = false;
    };
  }, [
    variant,
    format,
    style,
    species,
    illustrationUrl,
    sighting,
    includeDate,
    includePersonalNote,
    notebook,
  ]);

  const handleShare = async () => {
    if (!rendered) return;
    const result = await shareRenderedCardNativeOrDownload(rendered, species.commonNameAr);
    setStatusMessage(result.message);
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
        overflowY: 'auto',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Compartir avistamiento en redes"
    >
      <div
        className="notebook-page"
        style={{
          maxWidth: 780,
          width: '100%',
          maxHeight: '92vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h2 className="serif-heading" style={{ fontSize: '1.75rem', margin: 0 }}>
              Compartir lámina de {species.commonNameAr}
            </h2>
            <span style={{ fontSize: '0.88rem', color: 'var(--ink-secondary)' }}>
              Lista para enviar por WhatsApp o publicar en Instagram (sin volver a llamar a la IA)
            </span>
          </div>
          <button className="btn btn-secondary" onClick={onClose} aria-label="Cerrar">
            <X size={18} /> Cerrar
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 20,
            alignItems: 'start',
          }}
        >
          {/* Controles de composición */}
          <div>
            <div className="field-group">
              <label>1. Elegí el diseño de la pieza (CA12)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  type="button"
                  className={`style-option-card ${variant === 'solo_ilustracion' ? 'selected' : ''}`}
                  onClick={() => setVariant('solo_ilustracion')}
                >
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={16} color="#38573E" /> Solo ilustración artística + datos básicos
                  </div>
                  <div className="field-hint">
                    Presenta la lámina naturalista limpia con su nombre y firma del cuaderno.
                  </div>
                </button>

                <button
                  type="button"
                  className={`style-option-card ${variant === 'ilustracion_y_foto' ? 'selected' : ''}`}
                  onClick={() => setVariant('ilustracion_y_foto')}
                >
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ImageIcon size={16} color="#38573E" /> Ilustración artística + fotografía real
                  </div>
                  <div className="field-hint">
                    Combina la lámina con tu foto original en un recuadro estilo estampa de campo.
                  </div>
                </button>
              </div>
            </div>

            <div className="field-group">
              <label>2. Formato para redes</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`btn ${format === 'historia_9_16' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setFormat('historia_9_16')}
                >
                  Historia / Estado (9:16)
                </button>
                <button
                  type="button"
                  className={`btn ${format === 'publicacion_4_5' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setFormat('publicacion_4_5')}
                >
                  Publicación / Feed (4:5)
                </button>
              </div>
            </div>

            <div className="field-group">
              <label>3. Detalles opcionales</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={includeDate}
                  onChange={(e) => setIncludeDate(e.target.checked)}
                />
                Incluir fecha del avistamiento
              </label>

              {sighting.personalNote?.trim() && (
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
                    checked={includePersonalNote}
                    onChange={(e) => setIncludePersonalNote(e.target.checked)}
                  />
                  Incluir mi nota personal («{sighting.personalNote.slice(0, 38)}…»)
                </label>
              )}
            </div>

            <div className="callout-box" style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#28402C' }}>
                <ShieldCheck size={16} /> Privacidad garantizada (CA14)
              </div>
              <div style={{ fontSize: '0.84rem', marginTop: 4 }}>
                Firma incluida: <strong>«{notebook.title} — {notebook.ownerDisplayName || 'Valeria'}»</strong>.
                La imagen exportada nunca incluye coordenadas GPS, dirección postal ni metadatos EXIF.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={handleShare}>
                <Share2 size={17} /> Compartir en Instagram / WhatsApp
              </button>
              {rendered && (
                <a
                  href={rendered.dataUrl}
                  download={`lamina-${species.taxonId}-${variant}.png`}
                  className="btn btn-secondary"
                >
                  <Download size={17} /> Guardar imagen
                </a>
              )}
            </div>

            {statusMessage && (
              <div className="callout-box" style={{ marginTop: 12 }}>
                <CheckCircle2 size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                {statusMessage}
              </div>
            )}
          </div>

          {/* Previsualización exacta de lo que se compartirá */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8, color: 'var(--ink-secondary)' }}>
              Vista previa exacta ({variant === 'solo_ilustracion' ? 'Solo ilustración' : 'Ilustración + foto real'})
            </div>
            {rendered && (
              <div
                style={{
                  background: 'var(--paper-inset)',
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid var(--paper-edge)',
                  display: 'inline-block',
                }}
              >
                <img
                  src={rendered.dataUrl}
                  alt="Previsualización de lámina para compartir"
                  style={{
                    maxWidth: '100%',
                    maxHeight: 420,
                    borderRadius: 8,
                    boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
