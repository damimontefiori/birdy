import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Crop,
  Film,
  FolderOpen,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import {
  IdentificationRequest,
  SpeciesVerificationResult,
  verifyPhotoMatchesSheetSpecies,
} from '../services/aiBirdService';
import {
  computeBlobSha256,
  extractExifSuggestions,
  sanitizeImageStrippingExif,
  toLocalDateTimeInputValue,
} from '../services/exifService';
import { SAMPLE_TEST_PHOTOS, SampleTestPhoto } from '../services/sampleGalleryPhotos';
import {
  formatVideoDuration,
  MAX_SHORT_VIDEO_SECONDS,
  processShortGardenVideoFile,
} from '../services/videoMediaService';
import {
  AICandidate,
  ExifSuggestions,
  SightingMediaType,
  SpeciesCatalogEntry,
  SpeciesVerificationMode,
} from '../types/domain';
import { PhotoCropEditor } from './PhotoCropEditor';

export interface SubmittedSheetEntryPayload {
  mediaType: SightingMediaType;
  sanitizedPhotoDataUrl: string;
  photoSha256: string;
  videoBlob?: Blob;
  videoObjectUrl?: string;
  videoDurationSec?: number;
  videoMimeType?: string;
  observedAt: string;
  exifSuggestions?: ExifSuggestions;
  locationLabel: string;
  personalNote: string;
  verificationMode: SpeciesVerificationMode;
  aiExplanation?: string;
  redirectToDetectedCandidate?: AICandidate;
}

interface AddSheetEntryModalProps {
  species: SpeciesCatalogEntry;
  notebookGeneralLocation?: string;
  isOnline: boolean;
  onSaveEntry: (entry: SubmittedSheetEntryPayload) => Promise<void> | void;
  onClose: () => void;
}

/**
 * Modal dedicado para sumar una nueva entrada en el tiempo (fotografía verificada por IA o video corto)
 * dentro de una hoja de especie existente del cuaderno.
 */
export const AddSheetEntryModal: React.FC<AddSheetEntryModalProps> = ({
  species,
  notebookGeneralLocation,
  isOnline,
  onSaveEntry,
  onClose,
}) => {
  const photoGalleryRef = useRef<HTMLInputElement | null>(null);
  const photoCameraRef = useRef<HTMLInputElement | null>(null);
  const videoGalleryRef = useRef<HTMLInputElement | null>(null);
  const videoCameraRef = useRef<HTMLInputElement | null>(null);

  const [entryMode, setEntryMode] = useState<SightingMediaType>('photo');
  const [isReadingMedia, setIsReadingMedia] = useState<boolean>(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Estado de fotografía (+ soporte de recorte y zoom)
  const [photoDataUrl, setPhotoDataUrl] = useState<string>('');
  const [originalPhotoDataUrl, setOriginalPhotoDataUrl] = useState<string>('');
  const [photoIsCropped, setPhotoIsCropped] = useState<boolean>(false);
  const [showCropEditor, setShowCropEditor] = useState<boolean>(false);
  const [photoSha256, setPhotoSha256] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [presetScenario, setPresetScenario] =
    useState<IdentificationRequest['presetScenario']>('auto');
  const [exif, setExif] = useState<ExifSuggestions | null>(null);

  // Estado de video corto
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoObjectUrl, setVideoObjectUrl] = useState<string>('');
  const [videoPosterUrl, setVideoPosterUrl] = useState<string>('');
  const [videoDurationSec, setVideoDurationSec] = useState<number>(0);
  const [videoMimeType, setVideoMimeType] = useState<string>('video/mp4');

  // Metadatos exclusivos de ESTA entrada en el tiempo
  const [observedAt, setObservedAt] = useState<string>(() => toLocalDateTimeInputValue(new Date()));
  const [locationLabel, setLocationLabel] = useState<string>('');
  const [personalNote, setPersonalNote] = useState<string>('');

  // Estado de verificación de especie con IA
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verificationConflict, setVerificationConflict] =
    useState<SpeciesVerificationResult | null>(null);

  const switchMode = (nextMode: SightingMediaType) => {
    setEntryMode(nextMode);
    setMediaError(null);
    setVerificationConflict(null);
  };

  const handlePhotoFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsReadingMedia(true);
    setMediaError(null);
    setVerificationConflict(null);
    try {
      const extractedExif = await extractExifSuggestions(file);
      const sha = await computeBlobSha256(file);
      const sanitized = await sanitizeImageStrippingExif(file);

      setFileName(file.name);
      setPhotoSha256(sha);
      setPhotoDataUrl(sanitized);
      setOriginalPhotoDataUrl(sanitized);
      setPhotoIsCropped(false);
      setPresetScenario('auto');
      setExif(extractedExif);

      if (extractedExif.hasExifDate && extractedExif.suggestedDateIso) {
        setObservedAt(extractedExif.suggestedDateIso);
      } else {
        setObservedAt(toLocalDateTimeInputValue(new Date()));
      }
      if (extractedExif.hasExifGps && extractedExif.suggestedPlaceLabel) {
        setLocationLabel(extractedExif.suggestedPlaceLabel);
      }
    } catch {
      setMediaError('No pudimos leer esa fotografía. Probá con otra imagen.');
    } finally {
      setIsReadingMedia(false);
      e.target.value = '';
    }
  };

  const handleSamplePhotoSelected = (sample: SampleTestPhoto) => {
    setMediaError(null);
    setVerificationConflict(null);
    setFileName(sample.fileName);
    setPhotoDataUrl(sample.previewUrl);
    setOriginalPhotoDataUrl(sample.previewUrl);
    setPhotoIsCropped(false);
    setPhotoSha256(`sha256_entry_${sample.id}`);
    setPresetScenario(sample.presetScenario);
    setExif(sample.simulatedExif);
    if (sample.simulatedExif.hasExifDate && sample.simulatedExif.suggestedDateIso) {
      setObservedAt(sample.simulatedExif.suggestedDateIso);
    }
    if (sample.simulatedExif.hasExifGps && sample.simulatedExif.suggestedPlaceLabel) {
      setLocationLabel(sample.simulatedExif.suggestedPlaceLabel);
    }
  };

  const handleApplyCrop = async (croppedUrl: string) => {
    setPhotoDataUrl(croppedUrl);
    setPhotoIsCropped(true);
    setShowCropEditor(false);
    setVerificationConflict(null);
    try {
      const newSha = await computeBlobSha256(new Blob([croppedUrl]));
      setPhotoSha256(newSha);
    } catch {
      setPhotoSha256(`crop_entry_${Date.now()}`);
    }
  };

  const handleRestoreOriginalPhoto = async () => {
    if (!originalPhotoDataUrl) return;
    setPhotoDataUrl(originalPhotoDataUrl);
    setPhotoIsCropped(false);
    setVerificationConflict(null);
    try {
      const origSha = await computeBlobSha256(new Blob([originalPhotoDataUrl]));
      setPhotoSha256(origSha);
    } catch {
      // conservar hash
    }
  };

  const handleVideoFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsReadingMedia(true);
    setMediaError(null);
    setVerificationConflict(null);
    try {
      const processed = await processShortGardenVideoFile(file);
      setVideoBlob(processed.videoBlob);
      setVideoObjectUrl(processed.objectUrl);
      setVideoPosterUrl(processed.posterDataUrl);
      setPhotoSha256(processed.sha256);
      setVideoDurationSec(processed.durationSec);
      setVideoMimeType(processed.mimeType);
      setObservedAt(processed.suggestedObservedAt);
    } catch (err) {
      setMediaError(
        err instanceof Error
          ? err.message
          : 'No pudimos procesar el video seleccionado. Probá con un clip MP4 corto.'
      );
    } finally {
      setIsReadingMedia(false);
      e.target.value = '';
    }
  };

  const handleConfirmAndSave = async (forceManualOverride = false, redirectCandidate?: AICandidate) => {
    if (entryMode === 'video') {
      if (!videoBlob || !videoPosterUrl) return;
      await onSaveEntry({
        mediaType: 'video',
        sanitizedPhotoDataUrl: videoPosterUrl,
        photoSha256: photoSha256 || `video_${Date.now()}`,
        videoBlob,
        videoObjectUrl,
        videoDurationSec,
        videoMimeType,
        observedAt,
        locationLabel: locationLabel.trim(),
        personalNote: personalNote.trim(),
        verificationMode: 'video_unverified',
      });
      return;
    }

    if (!photoDataUrl) return;

    // Si el usuario ya confirmó manualmente o eligió redirigir a la otra especie detectada
    if (forceManualOverride || redirectCandidate || !isOnline) {
      await onSaveEntry({
        mediaType: 'photo',
        sanitizedPhotoDataUrl: photoDataUrl,
        photoSha256: photoSha256 || `photo_${Date.now()}`,
        observedAt,
        exifSuggestions: exif || undefined,
        locationLabel: locationLabel.trim(),
        personalNote: personalNote.trim(),
        verificationMode: forceManualOverride ? 'manual_override' : 'ai_verified_match',
        aiExplanation: verificationConflict?.explanation,
        redirectToDetectedCandidate: redirectCandidate,
      });
      return;
    }

    // Verificar con IA que la foto sea efectivamente de la misma especie de esta hoja
    setIsVerifying(true);
    setMediaError(null);
    try {
      const check = await verifyPhotoMatchesSheetSpecies({
        photoSha256: photoSha256 || `entry_${Date.now()}`,
        fileName: fileName || 'nueva_entrada.jpg',
        sanitizedPhotoDataUrl: photoDataUrl,
        expectedSpecies: species,
        generalLocationHint: locationLabel.trim() || notebookGeneralLocation,
        observedAtIso: observedAt,
        presetScenario,
      });

      if (check.status === 'match') {
        await onSaveEntry({
          mediaType: 'photo',
          sanitizedPhotoDataUrl: photoDataUrl,
          photoSha256: photoSha256 || `photo_${Date.now()}`,
          observedAt,
          exifSuggestions: exif || undefined,
          locationLabel: locationLabel.trim(),
          personalNote: personalNote.trim(),
          verificationMode: 'ai_verified_match',
          aiExplanation: check.explanation,
        });
        return;
      }

      // Mostrar aviso preventivo si es otra especie o si no se distingue con certeza
      setVerificationConflict(check);
    } finally {
      setIsVerifying(false);
    }
  };

  const hasReadyMedia = entryMode === 'photo' ? Boolean(photoDataUrl) : Boolean(videoBlob && videoPosterUrl);

  return (
    <>
      <div
        className="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label={`Sumar nueva entrada a la hoja de ${species.commonNameAr}`}
        onClick={(e) => {
          if (e.target === e.currentTarget && !isVerifying) onClose();
        }}
      >
        <div className="modal-sheet entry-modal-sheet">
          <div className="modal-sheet-handle" aria-hidden="true" />

          <div className="modal-sheet-header">
            <div>
              <span className="badge badge-sync-respaldado" style={{ marginBottom: 4 }}>
                Nueva entrada en esta hoja
              </span>
              <h2 className="serif-heading" style={{ fontSize: '1.6rem', margin: 0 }}>
                {species.commonNameAr}
              </h2>
              <div className="scientific-name" style={{ fontSize: '0.96rem' }}>
                {species.scientificName}
              </div>
            </div>
            <button
              type="button"
              className="icon-circle-btn"
              onClick={onClose}
              disabled={isVerifying}
              aria-label="Cerrar ventana"
            >
              <X size={20} />
            </button>
          </div>

          {/* Selector Foto vs Video corto */}
          <div className="segmented-control" style={{ marginBottom: 12 }} role="tablist" aria-label="Tipo de registro">
            <button
              type="button"
              role="tab"
              aria-selected={entryMode === 'photo'}
              className={`segmented-btn ${entryMode === 'photo' ? 'active' : ''}`}
              onClick={() => switchMode('photo')}
            >
              <Camera size={15} /> Fotografía (con verificación IA)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={entryMode === 'video'}
              className={`segmented-btn ${entryMode === 'video' ? 'active' : ''}`}
              onClick={() => switchMode('video')}
            >
              <Film size={15} /> Video corto
            </button>
          </div>

          {/* Inputs nativos ocultos */}
          <input
            ref={photoGalleryRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handlePhotoFileSelected}
          />
          <input
            ref={photoCameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handlePhotoFileSelected}
          />
          <input
            ref={videoGalleryRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/*"
            style={{ display: 'none' }}
            onChange={handleVideoFileSelected}
          />
          <input
            ref={videoCameraRef}
            type="file"
            accept="video/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleVideoFileSelected}
          />

          {entryMode === 'photo' ? (
            <>
              <div className="callout-box" style={{ fontSize: '0.82rem', marginBottom: 12 }}>
                <ShieldCheck size={15} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                Al guardar, Bioma verificará con IA que la foto corresponda a{' '}
                <strong>{species.commonNameAr}</strong> para evitar mezclar especies en esta hoja.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-compact"
                  onClick={() => photoGalleryRef.current?.click()}
                >
                  <FolderOpen size={16} /> Elegir foto
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-compact"
                  onClick={() => photoCameraRef.current?.click()}
                >
                  <Camera size={16} /> Sacar foto
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="callout-box" style={{ fontSize: '0.82rem', marginBottom: 12 }}>
                <Video size={15} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                Sumá un video corto de hasta {MAX_SHORT_VIDEO_SECONDS} s tomado con tu celular. Los
                videos se incorporan directo a la hoja sin revisión por IA.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-compact"
                  onClick={() => videoGalleryRef.current?.click()}
                >
                  <FolderOpen size={16} /> Video de galería
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-compact"
                  onClick={() => videoCameraRef.current?.click()}
                >
                  <Video size={16} /> Grabar video
                </button>
              </div>
            </>
          )}

          {isReadingMedia && (
            <div className="callout-box" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Loader2 size={16} className="spin" /> Procesando archivo…
            </div>
          )}

          {mediaError && (
            <div className="callout-box terracotta" style={{ fontSize: '0.84rem', marginBottom: 12 }}>
              <AlertTriangle size={15} style={{ verticalAlign: '-2px', marginRight: 5 }} />
              {mediaError}
            </div>
          )}

          {/* Vista previa de foto seleccionada + Recorte */}
          {entryMode === 'photo' && photoDataUrl && (
            <div style={{ marginBottom: 12 }}>
              <div
                className="plate-frame"
                style={{ maxHeight: 240, maxWidth: 320, margin: '0 auto 8px' }}
              >
                <img src={photoDataUrl} alt="Vista previa de nueva fotografía" />
              </div>
              <div className="draft-photo-actions-row">
                <button
                  type="button"
                  className="btn btn-secondary btn-compact"
                  onClick={() => setShowCropEditor(true)}
                >
                  <Crop size={14} /> Recortar / Acercar
                </button>
                {photoIsCropped && originalPhotoDataUrl && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-compact"
                    onClick={() => void handleRestoreOriginalPhoto()}
                  >
                    <RotateCcw size={14} /> Restaurar original
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Vista previa de video corto seleccionado */}
          {entryMode === 'video' && videoBlob && (
            <div style={{ marginBottom: 12 }}>
              <div className="entry-video-preview-wrap">
                <video
                  src={videoObjectUrl}
                  poster={videoPosterUrl}
                  controls
                  playsInline
                  className="entry-video-preview"
                />
                <span className="video-duration-pill">
                  <Film size={12} /> {formatVideoDuration(videoDurationSec)}
                </span>
              </div>
            </div>
          )}

          {/* Campos propios de ESTA entrada (Fecha/Hora, Ubicación aproximada, Nota personal) */}
          {hasReadyMedia && (
            <div>
              <div className="field-group">
                <label htmlFor="sheet-entry-date">
                  Fecha y hora de este encuentro{' '}
                  {entryMode === 'photo' && exif?.hasExifDate && (
                    <span className="badge badge-sync-respaldado">Desde EXIF</span>
                  )}
                </label>
                <input
                  id="sheet-entry-date"
                  type="datetime-local"
                  className="input-text"
                  value={observedAt}
                  onChange={(e) => setObservedAt(e.target.value)}
                />
              </div>

              <div className="field-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <label htmlFor="sheet-entry-loc">Ubicación aproximada (privada)</label>
                  {locationLabel && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      style={{ padding: '3px 8px', fontSize: '0.74rem', minHeight: 28 }}
                      onClick={() => setLocationLabel('')}
                    >
                      <Trash2 size={12} /> Limpiar
                    </button>
                  )}
                </div>
                <input
                  id="sheet-entry-loc"
                  type="text"
                  className="input-text"
                  value={locationLabel}
                  onChange={(e) => setLocationLabel(e.target.value)}
                  placeholder="Opcional (ej.: Jardín del fondo, Jardín del frente)"
                />
              </div>

              <div className="field-group">
                <label htmlFor="sheet-entry-note">Nota personal de esta entrada (opcional)</label>
                <textarea
                  id="sheet-entry-note"
                  rows={2}
                  className="input-textarea"
                  value={personalNote}
                  onChange={(e) => setPersonalNote(e.target.value)}
                  placeholder="Ej.: Volvió al mediodía a buscar néctar en las salvias…"
                />
              </div>
            </div>
          )}

          {/* Alerta si la IA detecta que la foto corresponde a OTRA especie */}
          {verificationConflict && entryMode === 'photo' && (
            <div
              className={`callout-box ${
                verificationConflict.status === 'mismatch' ? 'terracotta' : 'warning'
              }`}
              role="alert"
              style={{ marginBottom: 12 }}
            >
              {verificationConflict.status === 'mismatch' && verificationConflict.detectedCandidate ? (
                <>
                  <div style={{ fontWeight: 700, color: '#8E3B24', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={17} /> Parece ser otra especie diferente
                  </div>
                  <p style={{ margin: '6px 0', fontSize: '0.86rem' }}>
                    Esta hoja es de <strong>{species.commonNameAr}</strong> (
                    <em>{species.scientificName}</em>), pero en la nueva foto la IA detectó{' '}
                    <strong>{verificationConflict.detectedCandidate.commonNameAr}</strong> (
                    <em>{verificationConflict.detectedCandidate.scientificName}</em>).
                  </p>
                  <p style={{ margin: '0 0 10px', fontSize: '0.81rem', color: 'var(--ink-secondary)' }}>
                    {verificationConflict.explanation}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-compact"
                      onClick={() =>
                        void handleConfirmAndSave(false, verificationConflict.detectedCandidate)
                      }
                    >
                      <ArrowRight size={15} /> Guardar en su propia hoja ({verificationConflict.detectedCandidate.commonNameAr})
                    </button>
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact"
                        onClick={() => photoGalleryRef.current?.click()}
                      >
                        Elegir otra foto
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact"
                        onClick={() => void handleConfirmAndSave(true)}
                      >
                        <CheckCircle2 size={14} /> Estoy segura: es {species.commonNameAr}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 700, color: '#7A5416', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={17} /> No pudimos verificar la especie con certeza
                  </div>
                  <p style={{ margin: '6px 0 10px', fontSize: '0.84rem' }}>
                    {verificationConflict.explanation}
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-compact"
                      onClick={() => void handleConfirmAndSave(true)}
                    >
                      <Check size={15} /> Agregar igual a {species.commonNameAr}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      onClick={() => photoGalleryRef.current?.click()}
                    >
                      Elegir foto más nítida
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Fotos de muestra rápidas para pruebas sin cámara */}
          {entryMode === 'photo' && !photoDataUrl && (
            <div style={{ borderTop: '1px solid var(--paper-edge)', paddingTop: 10, marginTop: 4 }}>
              <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: 6 }}>
                O probá con una foto de muestra:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {SAMPLE_TEST_PHOTOS.slice(0, 3).map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    className="btn btn-secondary btn-compact"
                    style={{ fontSize: '0.74rem', padding: '5px 9px', minHeight: 30 }}
                    onClick={() => handleSamplePhotoSelected(sample)}
                  >
                    {sample.label.split(' (')[0]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!verificationConflict && (
            <div className="modal-sheet-actions">
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={!hasReadyMedia || isVerifying || isReadingMedia}
                onClick={() => void handleConfirmAndSave(false)}
              >
                {isVerifying ? (
                  <>
                    <Loader2 size={17} className="spin" /> Verificando que sea {species.commonNameAr}…
                  </>
                ) : entryMode === 'video' ? (
                  <>
                    <Check size={17} /> Sumar video a esta hoja
                  </>
                ) : (
                  <>
                    <Sparkles size={17} /> Verificar especie y sumar entrada
                  </>
                )}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isVerifying}
                onClick={onClose}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>

      {showCropEditor && (originalPhotoDataUrl || photoDataUrl) && (
        <PhotoCropEditor
          sourceImageUrl={originalPhotoDataUrl || photoDataUrl}
          onApplyCrop={(cropped) => void handleApplyCrop(cropped)}
          onClose={() => setShowCropEditor(false)}
        />
      )}
    </>
  );
};
