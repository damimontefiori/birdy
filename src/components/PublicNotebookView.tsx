import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronUp,
  Leaf,
  Lock,
  MapPin,
  ShieldCheck,
  Sparkles,
  Sprout,
  ZoomIn,
} from 'lucide-react';
import {
  fetchPublicNotebookByToken,
  fetchPublicNotebookByTokenAsync,
} from '../services/storageAndSyncService';
import {
  ILLUSTRATION_STYLE_META,
  ORGANISM_GROUP_META,
  ORGANISM_GROUPS_ORDER,
  OrganismGroup,
  PublicNotebookProjection,
  PublicSanitizedSheet,
} from '../types/domain';
import { ImageLightbox, LightboxItem } from './ImageLightbox';

interface PublicNotebookViewProps {
  shareToken: string;
  onExitPublicPreview?: () => void;
}

export const PublicNotebookView: React.FC<PublicNotebookViewProps> = ({
  shareToken,
  onExitPublicPreview,
}) => {
  const [lookup, setLookup] = useState<
    | { status: 'loading' }
    | { status: 'ok'; notebook: PublicNotebookProjection }
    | { status: 'revoked' | 'not_found' }
  >(() => {
    const local = fetchPublicNotebookByToken(shareToken);
    if (local.status === 'ok' || local.status === 'revoked') {
      return local;
    }
    return { status: 'loading' };
  });

  useEffect(() => {
    let active = true;
    void fetchPublicNotebookByTokenAsync(shareToken).then((res) => {
      if (active) setLookup(res);
    });
    return () => {
      active = false;
    };
  }, [shareToken]);
  const [selectedSheet, setSelectedSheet] = useState<PublicSanitizedSheet | null>(null);
  const [activeGroupFilter, setActiveGroupFilter] = useState<OrganismGroup | 'todos'>('todos');
  const [showFieldNotes, setShowFieldNotes] = useState<boolean>(false);
  const [lightboxState, setLightboxState] = useState<{
    items: LightboxItem[];
    index: number;
  } | null>(null);

  const guestBackRef = useRef({ lightboxState, selectedSheet, onExitPublicPreview });
  guestBackRef.current = { lightboxState, selectedSheet, onExitPublicPreview };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.history.pushState({ birdyPublicGuard: true }, '');
    const handlePop = () => {
      const cur = guestBackRef.current;
      if (cur.lightboxState) {
        setLightboxState(null);
        window.history.pushState({ birdyPublicGuard: true }, '');
      } else if (cur.selectedSheet) {
        setSelectedSheet(null);
        setShowFieldNotes(false);
        window.history.pushState({ birdyPublicGuard: true }, '');
      } else if (cur.onExitPublicPreview) {
        cur.onExitPublicPreview();
      }
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  if (lookup.status === 'loading') {
    return (
      <div className="app-shell">
        <div className="notebook-page" style={{ textAlign: 'center', padding: '42px 24px' }}>
          <Sprout size={36} color="#38573E" style={{ marginBottom: 10 }} />
          <h1 className="serif-heading" style={{ fontSize: '1.75rem' }}>
            Abriendo cuaderno compartido…
          </h1>
          <p style={{ color: 'var(--ink-secondary)', margin: '6px auto 0' }}>
            Cargando láminas ilustradas desde Bioma.
          </p>
        </div>
      </div>
    );
  }

  if (lookup.status !== 'ok') {
    return (
      <div className="app-shell">
        <div className="notebook-page" style={{ textAlign: 'center', padding: '42px 24px' }}>
          <Lock size={44} color="#B26249" style={{ marginBottom: 12 }} />
          <h1 className="serif-heading" style={{ fontSize: '1.9rem' }}>
            {lookup.status === 'revoked'
              ? 'Este enlace compartido fue revocado'
              : 'Cuaderno compartido no disponible'}
          </h1>
          <p style={{ color: 'var(--ink-secondary)', maxWidth: 520, margin: '10px auto 22px' }}>
            {lookup.status === 'revoked'
              ? 'La autora del cuaderno desactivó este enlace público. Las láminas y registros ya no están disponibles desde esta dirección.'
              : 'No encontramos un cuaderno activo asociado a este enlace.'}
          </p>
          {onExitPublicPreview && (
            <button type="button" className="btn btn-primary" onClick={onExitPublicPreview}>
              <ArrowLeft size={18} /> Volver a mi cuaderno Bioma
            </button>
          )}
        </div>
      </div>
    );
  }

  const { notebook } = lookup;

  const openSheetLightbox = (sheet: PublicSanitizedSheet, initialIndex = 0) => {
    const items: LightboxItem[] = [
      {
        url: sheet.illustrationUrl,
        title: sheet.commonNameAr,
        subtitle: sheet.scientificName,
        badge:
          ILLUSTRATION_STYLE_META[sheet.illustrationStyle]?.plateLabel || 'Mural de naturaleza',
      },
      ...sheet.publicPhotos.map((url, idx) => ({
        url,
        title: `Registro fotográfico #${idx + 1}`,
        subtitle: `${sheet.commonNameAr} · ${notebook.title}`,
        badge: 'Foto real',
      })),
    ];
    setLightboxState({ items, index: initialIndex });
  };

  return (
    <div className="app-shell">
      <header className="top-header">
        <div className="brand-title" style={{ minWidth: 0 }}>
          <Sprout size={22} color="#38573E" style={{ flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <h1 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {notebook.title}
            </h1>
            <span className="brand-subtitle">
              Bioma de {notebook.ownerDisplayName} · Solo lectura
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge badge-sync-respaldado" title="Sin coordenadas ni metadatos privados">
            <ShieldCheck size={13} /> Protegido
          </span>
          {onExitPublicPreview && (
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={onExitPublicPreview}
            >
              <ArrowLeft size={15} /> Volver
            </button>
          )}
        </div>
      </header>

      {/* Portada compacta */}
      {!selectedSheet && (
        <section className={`notebook-page style-${notebook.style}`}>
          <span className="badge badge-sync-respaldado" style={{ marginBottom: 8 }}>
            <Sparkles size={13} />{' '}
            {ILLUSTRATION_STYLE_META[notebook.style]?.label || 'Muralismo de fauna autóctona'}
          </span>
          <h2 className="serif-heading" style={{ fontSize: '1.9rem', margin: '2px 0 6px' }}>
            {notebook.title}
          </h2>
          {notebook.description && (
            <p style={{ margin: '0 0 10px', color: 'var(--ink-secondary)', fontSize: '0.94rem' }}>
              {notebook.description}
            </p>
          )}
          <div className="meta-row">
            {notebook.generalLocation && (
              <span>
                <MapPin size={14} /> {notebook.generalLocation}
              </span>
            )}
            {notebook.period && (
              <span>
                <Calendar size={14} /> {notebook.period}
              </span>
            )}
            <span>
              <BookOpen size={14} /> {notebook.sheets.length}{' '}
              {notebook.sheets.length === 1 ? 'especie' : 'especies'}
            </span>
          </div>
        </section>
      )}

      {selectedSheet ? (
        <article className={`notebook-page style-${notebook.style}`}>
          <button
            type="button"
            className="btn btn-secondary btn-compact"
            style={{ marginBottom: 14 }}
            onClick={() => {
              setSelectedSheet(null);
              setShowFieldNotes(false);
            }}
          >
            <ArrowLeft size={15} /> Volver al índice
          </button>

          {/* Encabezado limpio de especie */}
          <div style={{ marginBottom: 14 }}>
            {(() => {
              const gMeta = ORGANISM_GROUP_META[selectedSheet.organismGroup || 'aves'];
              return (
                <span
                  className="group-pill"
                  style={{
                    background: gMeta.accentBg,
                    color: gMeta.accentText,
                    borderColor: gMeta.accentBorder,
                    marginBottom: 6,
                  }}
                >
                  {gMeta.emoji} {gMeta.label}
                </span>
              );
            })()}
            <h2 className="serif-heading" style={{ fontSize: '2rem', margin: 0, lineHeight: 1.1 }}>
              {selectedSheet.commonNameAr}
            </h2>
            <div className="scientific-name" style={{ fontSize: '1.15rem', marginTop: 2 }}>
              {selectedSheet.scientificName}
            </div>
            <div className="sheet-meta-line">
              <span>{selectedSheet.firstObservedDateOnly}</span>
              <span>·</span>
              <span>
                {selectedSheet.sightingsCount}{' '}
                {selectedSheet.sightingsCount === 1 ? 'avistamiento' : 'avistamientos'}
              </span>
            </div>
          </div>

          {/* Protagonistas visuales: Lámina + Fotos compartidas (ampliables) */}
          <div className="sheet-hero-showcase">
            <button
              type="button"
              className={`plate-frame plate-clickable style-${selectedSheet.illustrationStyle}`}
              onClick={() => openSheetLightbox(selectedSheet, 0)}
              aria-label={`Ampliar lámina de ${selectedSheet.commonNameAr}`}
            >
              <img
                src={selectedSheet.illustrationUrl}
                alt={`Lámina de ${selectedSheet.commonNameAr}`}
              />
              <span className="zoom-pill">
                <ZoomIn size={13} /> Ampliar lámina
              </span>
            </button>

            {notebook.includeOriginalPhotos && selectedSheet.publicPhotos.length > 0 && (
              <div className="hero-photo-strip">
                <div className="hero-strip-label">Fotografías del registro (tocar para ampliar)</div>
                <div className="hero-strip-row">
                  {selectedSheet.publicPhotos.map((photoUrl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="hero-photo-thumb"
                      onClick={() => openSheetLightbox(selectedSheet, idx + 1)}
                      aria-label={`Ampliar fotografía ${idx + 1}`}
                    >
                      <img src={photoUrl} alt={`Registro fotográfico ${idx + 1}`} />
                      <span className="thumb-zoom-dot">
                        <ZoomIn size={12} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Resumen acotado + Ficha desplegable */}
          <div className="sheet-summary-card">
            <p className="sheet-quick-summary">
              {selectedSheet.quickSummary || selectedSheet.identificationTraits}
            </p>
            <div className="trait-chips-row">
              {selectedSheet.sizeLabel && (
                <span className="trait-chip">{selectedSheet.sizeLabel}</span>
              )}
              {selectedSheet.habitatTag && (
                <span className="trait-chip">{selectedSheet.habitatTag}</span>
              )}
              {selectedSheet.dietTag && (
                <span className="trait-chip">{selectedSheet.dietTag}</span>
              )}
            </div>

            {(selectedSheet.ecologicalRole || selectedSheet.coexistenceNote) && (
              <div className="eco-role-card">
                <div className="eco-role-header">
                  <Leaf size={14} /> Rol en el jardín y convivencia
                </div>
                {selectedSheet.ecologicalRole && (
                  <div className="eco-role-primary">{selectedSheet.ecologicalRole}</div>
                )}
                {selectedSheet.coexistenceNote && (
                  <p className="eco-role-note">{selectedSheet.coexistenceNote}</p>
                )}
              </div>
            )}

            {selectedSheet.gardenEcology && (
              <div className="garden-ecology-card">
                <div className="garden-ecology-header">
                  <Sprout size={14} /> ¿Qué viene a buscar al jardín?
                </div>
                <div className="garden-ecology-grid">
                  <div className="garden-ecology-item">
                    <span className="garden-ecology-label">🌿 Qué busca</span>
                    <p>{selectedSheet.gardenEcology.seeksInGarden}</p>
                  </div>
                  <div className="garden-ecology-item">
                    <span className="garden-ecology-label">🌸 Flores y plantas</span>
                    <p>{selectedSheet.gardenEcology.preferredFlowers}</p>
                  </div>
                  <div className="garden-ecology-item">
                    <span className="garden-ecology-label">🍋 Frutales y árboles</span>
                    <p>{selectedSheet.gardenEcology.preferredFruitTrees}</p>
                  </div>
                  <div className="garden-ecology-item">
                    <span className="garden-ecology-label">🪲 Qué come / insectos</span>
                    <p>{selectedSheet.gardenEcology.insectsOrFoodEaten}</p>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              className="accordion-toggle-btn"
              onClick={() => setShowFieldNotes((prev) => !prev)}
              aria-expanded={showFieldNotes}
            >
              <span>Ficha de campo</span>
              {showFieldNotes ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
            </button>

            {showFieldNotes && (
              <div className="field-guide-grid">
                <div className="field-guide-item">
                  <strong>Cómo reconocerla</strong>
                  <p>{selectedSheet.identificationTraits}</p>
                </div>
                <div className="field-guide-item">
                  <strong>Comportamiento</strong>
                  <p>{selectedSheet.typicalBehavior}</p>
                </div>
                <div className="field-guide-item">
                  <strong>Alimentación y hábitat</strong>
                  <p>{selectedSheet.dietAndHabitat}</p>
                </div>
                <div className="field-guide-item">
                  <strong>Distribución</strong>
                  <p>{selectedSheet.generalDistribution}</p>
                </div>
              </div>
            )}
          </div>

          {notebook.includePersonalNotes && selectedSheet.publicNotes.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <h3 className="serif-heading" style={{ fontSize: '1.35rem', marginBottom: 8 }}>
                Apuntes de {notebook.ownerDisplayName}
              </h3>
              {selectedSheet.publicNotes.map((n, idx) => (
                <div key={idx} className="callout-box" style={{ marginBottom: 8 }}>
                  <div className="handwritten-note">«{n.note}»</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>{n.dateOnly}</div>
                </div>
              ))}
            </div>
          )}
        </article>
      ) : (
        <section>
          {notebook.sheets.length === 0 ? (
            <div className="notebook-page" style={{ textAlign: 'center', padding: '32px 20px' }}>
              <p style={{ color: 'var(--ink-secondary)' }}>
                Este cuaderno aún no tiene láminas publicadas.
              </p>
            </div>
          ) : (
            <>
              {(() => {
                const counts = new Map<OrganismGroup, number>();
                notebook.sheets.forEach((sh) => {
                  const g = sh.organismGroup || 'aves';
                  counts.set(g, (counts.get(g) || 0) + 1);
                });
                const presentGroups = ORGANISM_GROUPS_ORDER.filter((g) => (counts.get(g) || 0) > 0);
                if (presentGroups.length <= 1) return null;
                return (
                  <div className="group-filter-bar" role="tablist" aria-label="Filtrar por grupo">
                    <button
                      type="button"
                      className={`group-filter-chip ${activeGroupFilter === 'todos' ? 'active' : ''}`}
                      onClick={() => setActiveGroupFilter('todos')}
                    >
                      🌿 Todo ({notebook.sheets.length})
                    </button>
                    {presentGroups.map((g) => {
                      const meta = ORGANISM_GROUP_META[g];
                      return (
                        <button
                          key={g}
                          type="button"
                          className={`group-filter-chip ${activeGroupFilter === g ? 'active' : ''}`}
                          onClick={() => setActiveGroupFilter(g)}
                        >
                          {meta.emoji} {meta.shortLabel} ({counts.get(g) || 0})
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
              <div className="sheets-grid">
                {notebook.sheets
                  .filter(
                    (sh) =>
                      activeGroupFilter === 'todos' ||
                      (sh.organismGroup || 'aves') === activeGroupFilter
                  )
                  .map((sheet) => {
                    const gMeta = ORGANISM_GROUP_META[sheet.organismGroup || 'aves'];
                    return (
                      <div
                        key={sheet.sheetId}
                        className="species-plate-card"
                        onClick={() => {
                          setSelectedSheet(sheet);
                          setShowFieldNotes(false);
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setSelectedSheet(sheet);
                            setShowFieldNotes(false);
                          }
                        }}
                      >
                        <div className={`plate-frame style-${sheet.illustrationStyle}`}>
                          <img src={sheet.illustrationUrl} alt={sheet.commonNameAr} />
                          <span
                            className="plate-group-corner-tag"
                            style={{
                              background: gMeta.accentBg,
                              color: gMeta.accentText,
                              borderColor: gMeta.accentBorder,
                            }}
                          >
                            {gMeta.emoji} {gMeta.singularLabel}
                          </span>
                        </div>
                        <div>
                          <h3 className="serif-heading species-card-title">{sheet.commonNameAr}</h3>
                          <div className="scientific-name species-card-sci">{sheet.scientificName}</div>
                          <div className="species-card-foot">
                            <span>{sheet.firstObservedDateOnly}</span>
                            <span>{sheet.sightingsCount}×</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </section>
      )}

      {lightboxState && (
        <ImageLightbox
          items={lightboxState.items}
          initialIndex={lightboxState.index}
          onClose={() => setLightboxState(null)}
        />
      )}
    </div>
  );
};
