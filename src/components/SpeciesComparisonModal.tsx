import React, { useEffect, useState } from 'react';
import { Check, ExternalLink, Loader2, X, ZoomIn } from 'lucide-react';
import {
  findSpeciesByTaxonId,
  getSpeciesGardenEcology,
  getSpeciesGroup,
} from '../data/argentinaBirdsCatalog';
import { fetchReferencePhotosForSpecies } from '../services/speciesReferenceService';
import {
  AICandidate,
  ORGANISM_GROUP_META,
  SpeciesCatalogEntry,
  SpeciesReferencePhoto,
} from '../types/domain';
import { LightboxItem } from './ImageLightbox';
import { SpeciesSoundPlayer } from './SpeciesSoundPlayer';

interface SpeciesComparisonModalProps {
  userPhotoUrl: string;
  species: SpeciesCatalogEntry;
  candidate?: AICandidate;
  onSelectSpecies: (taxonId: string) => void;
  onZoomImages: (items: LightboxItem[], initialIndex?: number) => void;
  onClose: () => void;
}

export const SpeciesComparisonModal: React.FC<SpeciesComparisonModalProps> = ({
  userPhotoUrl,
  species,
  candidate,
  onSelectSpecies,
  onZoomImages,
  onClose,
}) => {
  const catalogMatch = findSpeciesByTaxonId(species.taxonId) || species;
  const initialPhotos =
    (candidate?.referencePhotos?.length ? candidate.referencePhotos : null) ||
    (catalogMatch.referencePhotos?.length ? catalogMatch.referencePhotos : null) ||
    [];

  const [refPhotos, setRefPhotos] = useState<SpeciesReferencePhoto[]>(initialPhotos);
  const [activeRefIdx, setActiveRefIdx] = useState<number>(0);
  const [isLoadingRefs, setIsLoadingRefs] = useState<boolean>(initialPhotos.length === 0);

  useEffect(() => {
    let mounted = true;
    if (refPhotos.length > 0) {
      setIsLoadingRefs(false);
      return;
    }
    setIsLoadingRefs(true);
    fetchReferencePhotosForSpecies(species.scientificName).then((fetched) => {
      if (!mounted) return;
      if (fetched.length > 0) {
        setRefPhotos(fetched);
      }
      setIsLoadingRefs(false);
    });
    return () => {
      mounted = false;
    };
  }, [species.scientificName, refPhotos.length]);

  const activeRefPhoto = refPhotos[activeRefIdx];
  const fallbackPlate = catalogMatch.defaultWatercolorPlate || catalogMatch.defaultGraphitePlate;
  const displayedRefUrl = activeRefPhoto?.url || activeRefPhoto?.thumbUrl || fallbackPlate || '';

  const visualTraits =
    candidate?.keyVisibleTraits?.length
      ? candidate.keyVisibleTraits
      : [
          catalogMatch.sizeLabel,
          catalogMatch.habitatTag,
          catalogMatch.dietTag,
        ].filter((v): v is string => Boolean(v));

  const altNames =
    (catalogMatch.alternativeNames?.length ? catalogMatch.alternativeNames : candidate?.alternativeNames) || [];
  const groupMeta = ORGANISM_GROUP_META[getSpeciesGroup(catalogMatch)];
  const ecologicalRole = catalogMatch.ecologicalRole || candidate?.ecologicalRole;
  const coexistenceNote = catalogMatch.coexistenceNote || candidate?.coexistenceNote;

  const openBothInLightbox = (startOnRef: boolean) => {
    const items: LightboxItem[] = [
      {
        url: userPhotoUrl,
        title: 'Tu fotografía original',
        subtitle: 'Acercá para observar alas, colores, rasgos y silueta',
        badge: 'Tu foto',
      },
    ];
    if (refPhotos.length > 0) {
      refPhotos.forEach((p, idx) => {
        items.push({
          url: p.url || p.thumbUrl,
          title: `${species.commonNameAr} (${species.scientificName})`,
          subtitle: p.attribution ? `Referencia ${idx + 1} · ${p.attribution}` : `Foto de referencia ${idx + 1}`,
          badge: 'Referencia real',
        });
      });
    } else if (fallbackPlate) {
      items.push({
        url: fallbackPlate,
        title: `${species.commonNameAr} (${species.scientificName})`,
        subtitle: 'Lámina de referencia del catálogo',
        badge: 'Lámina',
      });
    }
    onZoomImages(items, startOnRef && items.length > 1 ? 1 + activeRefIdx : 0);
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Comparar tu foto con ${species.commonNameAr}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-sheet compare-modal-sheet">
        <div className="modal-sheet-handle" aria-hidden="true" />

        <div className="modal-sheet-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span
                className="group-pill"
                style={{
                  background: groupMeta.accentBg,
                  color: groupMeta.accentText,
                  borderColor: groupMeta.accentBorder,
                }}
              >
                {groupMeta.emoji} {groupMeta.label}
              </span>
              {candidate?.confidenceBand && (
                <span className="badge badge-subtle">{candidate.confidenceBand}</span>
              )}
            </div>
            <h2 className="serif-heading" style={{ fontSize: '1.65rem', margin: '4px 0 0' }}>
              {species.commonNameAr}
            </h2>
            <div className="scientific-name" style={{ fontSize: '1.02rem' }}>
              {species.scientificName}
              {altNames.length > 0 && (
                <span style={{ fontStyle: 'normal', color: 'var(--ink-muted)', fontSize: '0.84rem' }}>
                  {' '}
                  · También: {altNames.slice(0, 3).join(', ')}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            className="icon-circle-btn"
            onClick={onClose}
            aria-label="Cerrar comparación"
          >
            <X size={20} />
          </button>
        </div>

        {/* Comparador lado a lado (optimizado para pantallas de celular) */}
        <div className="compare-pair-grid">
          <div className="compare-photo-box">
            <span className="compare-photo-label mine">Tu foto</span>
            <button
              type="button"
              className="compare-photo-trigger"
              onClick={() => openBothInLightbox(false)}
              aria-label="Ampliar tu fotografía"
            >
              <img src={userPhotoUrl} alt="Tu fotografía" />
              <span className="zoom-pill">
                <ZoomIn size={13} /> Ampliar
              </span>
            </button>
          </div>

          <div className="compare-photo-box">
            <span className="compare-photo-label ref">Referencia real</span>
            {isLoadingRefs ? (
              <div className="compare-photo-placeholder">
                <Loader2 size={22} className="spin" />
                <span>Buscando fotos reales…</span>
              </div>
            ) : displayedRefUrl ? (
              <button
                type="button"
                className="compare-photo-trigger"
                onClick={() => openBothInLightbox(true)}
                aria-label={`Ampliar foto de referencia de ${species.commonNameAr}`}
              >
                <img
                  src={displayedRefUrl}
                  alt={`Referencia real de ${species.commonNameAr}`}
                />
                <span className="zoom-pill">
                  <ZoomIn size={13} /> Ampliar
                </span>
              </button>
            ) : (
              <div className="compare-photo-placeholder">
                <span>Sin foto remota disponible sin conexión</span>
              </div>
            )}
          </div>
        </div>

        {/* Selector de distintos ángulos reales (iNaturalist) */}
        {refPhotos.length > 1 && (
          <div className="compare-ref-strip">
            <span className="compare-strip-caption">Más fotos de referencia:</span>
            <div className="compare-thumbs-row">
              {refPhotos.map((photo, idx) => (
                <button
                  key={`${photo.thumbUrl}_${idx}`}
                  type="button"
                  className={`compare-thumb-btn ${idx === activeRefIdx ? 'active' : ''}`}
                  onClick={() => setActiveRefIdx(idx)}
                  aria-label={`Ver foto de referencia ${idx + 1}`}
                >
                  <img src={photo.thumbUrl || photo.url} alt="" />
                </button>
              ))}
            </div>
          </div>
        )}

        {activeRefPhoto?.attribution && (
          <div className="compare-credit">Foto de referencia: {activeRefPhoto.attribution}</div>
        )}

        {/* Resumen acotado + sonido de referencia + lista rápida de rasgos clave */}
        <div style={{ marginBottom: 10 }}>
          <SpeciesSoundPlayer
            scientificName={species.scientificName}
            commonNameAr={species.commonNameAr}
            organismGroup={getSpeciesGroup(catalogMatch)}
            compact
          />
        </div>

        <div className="compare-traits-card">
          {(catalogMatch.quickSummary || candidate?.reasoning) && (
            <p className="compare-summary-text">
              {catalogMatch.quickSummary || candidate?.reasoning}
            </p>
          )}

          {visualTraits.length > 0 && (
            <div>
              <div className="compare-traits-title">Puntos clave para confirmar:</div>
              <div className="trait-chips-row">
                {visualTraits.map((trait, idx) => (
                  <span key={idx} className="trait-chip">
                    {trait}
                  </span>
                ))}
              </div>
            </div>
          )}

          {ecologicalRole && (
            <div className="eco-role-inline">
              <strong>Rol en el jardín:</strong> {ecologicalRole}
              {coexistenceNote ? ` · ${coexistenceNote}` : ''}
            </div>
          )}

          {(() => {
            const gEco = candidate?.gardenEcology || getSpeciesGardenEcology(catalogMatch);
            return (
              <div className="garden-ecology-card compact">
                <div className="garden-ecology-header">¿Qué busca en tu jardín?</div>
                <div className="garden-ecology-grid">
                  <div className="garden-ecology-item">
                    <span className="garden-ecology-label">🌸 Flores y plantas</span>
                    <p>{gEco.preferredFlowers}</p>
                  </div>
                  <div className="garden-ecology-item">
                    <span className="garden-ecology-label">🍋 Frutales / árboles</span>
                    <p>{gEco.preferredFruitTrees}</p>
                  </div>
                  <div className="garden-ecology-item" style={{ gridColumn: '1 / -1' }}>
                    <span className="garden-ecology-label">🪲 Qué come / insectos</span>
                    <p>{gEco.insectsOrFoodEaten}</p>
                  </div>
                </div>
              </div>
            );
          })()}

          {candidate?.reasoning && catalogMatch.quickSummary && candidate.reasoning !== catalogMatch.quickSummary && (
            <p className="compare-ai-note">
              <strong>Observado en tu foto:</strong> {candidate.reasoning}
            </p>
          )}

          {catalogMatch.wikipediaUrl && (
            <a
              href={catalogMatch.wikipediaUrl}
              target="_blank"
              rel="noreferrer"
              className="compare-ext-link"
            >
              <ExternalLink size={13} /> Leer más en Wikipedia
            </a>
          )}
        </div>

        {/* Acciones fijas al pie */}
        <div className="modal-sheet-actions">
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={() => {
              onSelectSpecies(species.taxonId);
              onClose();
            }}
          >
            <Check size={18} /> Sí, es {species.commonNameAr}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Seguir comparando
          </button>
        </div>
      </div>
    </div>
  );
};
