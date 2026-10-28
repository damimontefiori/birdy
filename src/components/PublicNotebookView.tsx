import React, { useState } from 'react';
import { BookOpen, Calendar, Feather, Lock, MapPin, ShieldCheck, Sparkles, ArrowLeft } from 'lucide-react';
import { fetchPublicNotebookByToken } from '../services/storageAndSyncService';
import { PublicSanitizedSheet } from '../types/domain';

interface PublicNotebookViewProps {
  shareToken: string;
  onExitPublicPreview?: () => void;
}

export const PublicNotebookView: React.FC<PublicNotebookViewProps> = ({
  shareToken,
  onExitPublicPreview,
}) => {
  const lookup = fetchPublicNotebookByToken(shareToken);
  const [selectedSheet, setSelectedSheet] = useState<PublicSanitizedSheet | null>(null);

  if (lookup.status !== 'ok') {
    return (
      <div className="app-shell">
        <div className="notebook-page" style={{ textAlign: 'center', padding: '42px 24px' }}>
          <Lock size={44} color="#B26249" style={{ marginBottom: 12 }} />
          <h1 className="serif-heading" style={{ fontSize: '2rem' }}>
            {lookup.status === 'revoked'
              ? 'Este enlace compartido fue revocado'
              : 'Cuaderno compartido no disponible'}
          </h1>
          <p style={{ color: 'var(--ink-secondary)', maxWidth: 520, margin: '10px auto 22px' }}>
            {lookup.status === 'revoked'
              ? 'La autora del cuaderno desactivó este enlace público. Las láminas y registros protegidos ya no están disponibles desde esta dirección.'
              : 'No encontramos un cuaderno activo asociado a este enlace.'}
          </p>
          {onExitPublicPreview && (
            <button className="btn btn-primary" onClick={onExitPublicPreview}>
              <ArrowLeft size={18} /> Volver a mi Cuaderno de Aves
            </button>
          )}
        </div>
      </div>
    );
  }

  const { notebook } = lookup;

  return (
    <div className="app-shell">
      <header className="top-header">
        <div className="brand-title">
          <Feather size={26} color="#38573E" />
          <div>
            <h1>{notebook.title}</h1>
            <span className="brand-subtitle">
              Cuaderno naturalista de {notebook.ownerDisplayName} · Vista de invitado (solo lectura)
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="badge badge-sync-respaldado" title="Sin coordenadas ni metadatos privados">
            <ShieldCheck size={14} /> Vista pública protegida
          </span>
          {onExitPublicPreview && (
            <button className="btn btn-secondary" onClick={onExitPublicPreview}>
              <ArrowLeft size={16} /> Volver a la app de Valeria
            </button>
          )}
        </div>
      </header>

      {/* Portada del cuaderno compartido */}
      <section className={`notebook-page style-${notebook.style}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span className="badge badge-sync-respaldado" style={{ marginBottom: 8 }}>
              <Sparkles size={13} />{' '}
              {notebook.style === 'acuarela_naturalista'
                ? 'Colección en Acuarela Naturalista'
                : 'Colección en Lápiz Grafito'}
            </span>
            <h2 className="serif-heading" style={{ fontSize: '2.1rem' }}>
              {notebook.title}
            </h2>
            {notebook.description && (
              <p style={{ margin: '6px 0 10px', color: 'var(--ink-secondary)' }}>
                {notebook.description}
              </p>
            )}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.9rem', color: 'var(--ink-muted)' }}>
              {notebook.generalLocation && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <MapPin size={15} /> Lugar general: {notebook.generalLocation}
                </span>
              )}
              {notebook.period && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Calendar size={15} /> Período: {notebook.period}
                </span>
              )}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <BookOpen size={15} /> {notebook.sheets.length}{' '}
                {notebook.sheets.length === 1 ? 'especie descubierta' : 'especies descubiertas'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {selectedSheet ? (
        <article className={`notebook-page style-${notebook.style}`}>
          <button
            className="btn btn-secondary"
            style={{ marginBottom: 16 }}
            onClick={() => setSelectedSheet(null)}
          >
            <ArrowLeft size={16} /> Volver al índice del cuaderno
          </button>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 24,
              alignItems: 'start',
            }}
          >
            <div className={`plate-frame style-${selectedSheet.illustrationStyle}`}>
              <img
                src={selectedSheet.illustrationUrl}
                alt={`Lámina de ${selectedSheet.commonNameAr}`}
              />
            </div>

            <div>
              <span className="badge badge-sync-respaldado">{selectedSheet.family}</span>
              <h2 className="serif-heading" style={{ fontSize: '2.2rem', marginTop: 8 }}>
                {selectedSheet.commonNameAr}
              </h2>
              <p className="scientific-name" style={{ fontSize: '1.35rem', margin: '0 0 14px' }}>
                {selectedSheet.scientificName}
              </p>

              <p style={{ fontSize: '0.9rem', color: 'var(--ink-muted)', marginBottom: 16 }}>
                Registrada por primera vez en este cuaderno el {selectedSheet.firstObservedDateOnly} ·{' '}
                {selectedSheet.sightingsCount}{' '}
                {selectedSheet.sightingsCount === 1 ? 'avistamiento' : 'avistamientos'}
              </p>

              <div className="callout-box" style={{ marginBottom: 12 }}>
                <strong>Cómo reconocerla:</strong> {selectedSheet.identificationTraits}
              </div>
              <div className="callout-box" style={{ marginBottom: 12 }}>
                <strong>Comportamiento:</strong> {selectedSheet.typicalBehavior}
              </div>
              <div className="callout-box" style={{ marginBottom: 12 }}>
                <strong>Alimentación y hábitat:</strong> {selectedSheet.dietAndHabitat}
              </div>
              <div className="callout-box">
                <strong>Distribución:</strong> {selectedSheet.generalDistribution}
              </div>

              {notebook.includePersonalNotes && selectedSheet.publicNotes.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <h4 style={{ margin: '0 0 8px' }}>Apuntes de campo de {notebook.ownerDisplayName}</h4>
                  {selectedSheet.publicNotes.map((n, idx) => (
                    <div key={idx} className="callout-box" style={{ marginBottom: 8 }}>
                      <div className="handwritten-note">«{n.note}»</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>{n.dateOnly}</div>
                    </div>
                  ))}
                </div>
              )}

              {notebook.includeOriginalPhotos && selectedSheet.publicPhotos.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <h4 style={{ margin: '0 0 8px' }}>Fotografías compartidas (sin metadatos EXIF)</h4>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {selectedSheet.publicPhotos.map((photoUrl, idx) => (
                      <img
                        key={idx}
                        src={photoUrl}
                        alt={`Registro fotográfico ${idx + 1}`}
                        style={{
                          width: 120,
                          height: 120,
                          objectFit: 'cover',
                          borderRadius: 8,
                          border: '2px solid var(--paper-edge)',
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
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
            <div className="sheets-grid">
              {notebook.sheets.map((sheet) => (
                <div
                  key={sheet.sheetId}
                  className="species-plate-card"
                  onClick={() => setSelectedSheet(sheet)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedSheet(sheet)}
                >
                  <div className={`plate-frame style-${sheet.illustrationStyle}`}>
                    <img src={sheet.illustrationUrl} alt={sheet.commonNameAr} />
                  </div>
                  <div>
                    <h3 className="serif-heading" style={{ fontSize: '1.35rem', margin: 0 }}>
                      {sheet.commonNameAr}
                    </h3>
                    <div className="scientific-name" style={{ fontSize: '1rem' }}>
                      {sheet.scientificName}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', marginTop: 6 }}>
                      Descubierta: {sheet.firstObservedDateOnly} · {sheet.sightingsCount}{' '}
                      {sheet.sightingsCount === 1 ? 'registro' : 'registros'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
