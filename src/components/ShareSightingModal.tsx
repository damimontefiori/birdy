import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Image as ImageIcon,
  Share2,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
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
  const [variant, setVariant] = useState<SocialShareVariant>('ilustracion_y_foto');
  const [format, setFormat] = useState<SocialShareFormat>('historia_9_16');
  const [includeDate, setIncludeDate] = useState<boolean>(true);
  const [includeSpeciesInfo, setIncludeSpeciesInfo] = useState<boolean>(true);
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
      quickSummary: species.quickSummary || species.identificationTraits,
      sizeLabel: species.sizeLabel,
      habitatTag: species.habitatTag,
      dietTag: species.dietTag,
      includeSpeciesInfo,
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
    includeSpeciesInfo,
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
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Compartir avistamiento en redes"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-sheet share-modal-sheet">
        <div className="modal-sheet-handle" aria-hidden="true" />

        <div className="modal-sheet-header">
          <div>
            <h2 className="serif-heading" style={{ fontSize: '1.65rem', margin: 0 }}>
              Compartir {species.commonNameAr}
            </h2>
            <span style={{ fontSize: '0.84rem', color: 'var(--ink-secondary)' }}>
              Lista para WhatsApp o Instagram · sin datos privados ni EXIF
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

        <div className="share-modal-grid">
          {/* Vista previa arriba en celular */}
          <div className="share-preview-pane">
            {rendered && (
              <div className="share-preview-frame">
                <img
                  src={rendered.dataUrl}
                  alt="Previsualización de lámina para compartir"
                />
              </div>
            )}
          </div>

          {/* Controles compactos */}
          <div>
            <div className="field-group">
              <label>Diseño de la postal</label>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segmented-btn ${variant === 'ilustracion_y_foto' ? 'active' : ''}`}
                  onClick={() => setVariant('ilustracion_y_foto')}
                >
                  <ImageIcon size={15} /> Lámina + Foto
                </button>
                <button
                  type="button"
                  className={`segmented-btn ${variant === 'solo_ilustracion' ? 'active' : ''}`}
                  onClick={() => setVariant('solo_ilustracion')}
                >
                  <Sparkles size={15} /> Solo lámina
                </button>
              </div>
            </div>

            <div className="field-group">
              <label>Formato</label>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segmented-btn ${format === 'historia_9_16' ? 'active' : ''}`}
                  onClick={() => setFormat('historia_9_16')}
                >
                  Historia (9:16)
                </button>
                <button
                  type="button"
                  className={`segmented-btn ${format === 'publicacion_4_5' ? 'active' : ''}`}
                  onClick={() => setFormat('publicacion_4_5')}
                >
                  Feed (4:5)
                </button>
              </div>
            </div>

            <div className="field-group">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={includeSpeciesInfo}
                  onChange={(e) => setIncludeSpeciesInfo(e.target.checked)}
                />
                <span>Incluir ficha breve y datos del ave</span>
              </label>

              <label className="check-row">
                <input
                  type="checkbox"
                  checked={includeDate}
                  onChange={(e) => setIncludeDate(e.target.checked)}
                />
                <span>Incluir fecha del avistamiento</span>
              </label>

              {sighting.personalNote?.trim() && (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={includePersonalNote}
                    onChange={(e) => setIncludePersonalNote(e.target.checked)}
                  />
                  <span>Incluir mi nota («{sighting.personalNote.slice(0, 36)}…»)</span>
                </label>
              )}
            </div>

            <div className="callout-box" style={{ marginBottom: 14, fontSize: '0.82rem' }}>
              <ShieldCheck size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />
              Firma: <strong>{notebook.title} — {notebook.ownerDisplayName || 'Valeria'}</strong> · Sin GPS ni EXIF.
            </div>

            <div className="modal-sheet-actions">
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={handleShare}
              >
                <Share2 size={17} /> Compartir
              </button>
              {rendered && (
                <a
                  href={rendered.dataUrl}
                  download={`lamina-${species.taxonId}-${variant}.png`}
                  className="btn btn-secondary"
                >
                  <Download size={17} /> Guardar
                </a>
              )}
            </div>

            {statusMessage && (
              <div className="callout-box" style={{ marginTop: 10, fontSize: '0.84rem' }}>
                <CheckCircle2 size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                {statusMessage}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
