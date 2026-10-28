import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  Cloud,
  CloudOff,
  Compass,
  Edit3,
  Eye,
  Feather,
  FolderOpen,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  MapPin,
  Plus,
  RefreshCw,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  UploadCloud,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { PublicNotebookView } from './components/PublicNotebookView';
import { ShareNotebookModal } from './components/ShareNotebookModal';
import { ShareSightingModal } from './components/ShareSightingModal';
import {
  ARGENTINA_BIRDS_CATALOG,
  findSpeciesByTaxonId,
  searchSpeciesCatalog,
} from './data/argentinaBirdsCatalog';
import {
  generateOrReuseIllustration,
  getAIConsumptionMetrics,
  IdentificationRequest,
  IdentificationResponse,
  identifyBirdFromPhoto,
} from './services/aiBirdService';
import {
  computeBlobSha256,
  extractExifSuggestions,
  sanitizeImageStrippingExif,
  toLocalDateTimeInputValue,
} from './services/exifService';
import { SAMPLE_TEST_PHOTOS, SampleTestPhoto } from './services/sampleGalleryPhotos';
import {
  AppPersistedState,
  formatShortArgentineDate,
  loadLocalDeviceState,
  publishOrUpdateSanitizedNotebookProjection,
  restoreFromGoogleCloudOnNewDevice,
  revokePublicNotebookShareToken,
  saveLocalDeviceState,
  savePhotoBinaryToIndexedDb,
  syncSightingAndNotebookToCloud,
} from './services/storageAndSyncService';
import {
  ExifSuggestions,
  Illustration,
  IllustrationStyle,
  Notebook,
  NotebookSpeciesSheet,
  NotebookType,
  Sighting,
  SyncStatus,
  UserProfile,
} from './types/domain';

type ScreenMode =
  | 'welcome'
  | 'onboarding_first_notebook'
  | 'library'
  | 'create_notebook'
  | 'notebook_detail'
  | 'add_sighting'
  | 'identify_review'
  | 'sheet_detail'
  | 'pending_center';

export const App: React.FC = () => {
  // Detectar si se abrió un enlace público compartido (?share=TOKEN)
  const initialShareToken = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('share');
  }, []);

  const [guestShareToken, setGuestShareToken] = useState<string | null>(initialShareToken);

  // Estado persistido local + sincronizado con respaldo de cuenta Google
  const [persisted, setPersisted] = useState<AppPersistedState>(() => loadLocalDeviceState());
  const [screen, setScreen] = useState<ScreenMode>(() => {
    const loaded = loadLocalDeviceState();
    if (!loaded.user) return 'welcome';
    if (loaded.notebooks.length === 0) return 'onboarding_first_notebook';
    return 'library';
  });

  // Estado de conectividad (permite simular corte de internet en el jardín o viaje — CA10)
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [simulateUploadFailure, setSimulateUploadFailure] = useState<boolean>(false);
  const [reducedMotion, setReducedMotion] = useState<boolean>(
    Boolean(persisted.user?.reducedMotion)
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Selección activa de navegación
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(
    () => persisted.notebooks[0]?.id || null
  );
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);

  // Modales de compartir
  const [shareSightingTarget, setShareSightingTarget] = useState<{
    sighting: Sighting;
    sheet: NotebookSpeciesSheet;
  } | null>(null);
  const [showShareNotebookModal, setShowShareNotebookModal] = useState<boolean>(false);

  // Formulario de creación/edición de cuaderno
  const [nbTitle, setNbTitle] = useState<string>('Aves de mi jardín');
  const [nbType, setNbType] = useState<NotebookType>('jardin');
  const [nbStyle, setNbStyle] = useState<IllustrationStyle>('acuarela_naturalista');
  const [nbLocation, setNbLocation] = useState<string>('Tigre, Buenos Aires');
  const [nbPeriod, setNbPeriod] = useState<string>('Primavera 2026');
  const [nbDescription, setNbDescription] = useState<string>(
    'Mis observaciones cotidianas entre los árboles y flores del jardín.'
  );
  const [editingNotebookMeta, setEditingNotebookMeta] = useState<boolean>(false);

  // Flujo F02: Incorporar fotografía y metadatos EXIF
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [draftSightingId, setDraftSightingId] = useState<string>('');
  const [draftPhotoDataUrl, setDraftPhotoDataUrl] = useState<string>('');
  const [draftPhotoSha256, setDraftPhotoSha256] = useState<string>('');
  const [draftFileName, setDraftFileName] = useState<string>('');
  const [draftPresetScenario, setDraftPresetScenario] =
    useState<IdentificationRequest['presetScenario']>('auto');
  const [draftExif, setDraftExif] = useState<ExifSuggestions | null>(null);
  const [draftObservedAt, setDraftObservedAt] = useState<string>(() =>
    toLocalDateTimeInputValue(new Date())
  );
  const [draftLocationLabel, setDraftLocationLabel] = useState<string>('');
  const [draftLocationAccepted, setDraftLocationAccepted] = useState<boolean>(true);
  const [draftPersonalNote, setDraftPersonalNote] = useState<string>('');
  const [isProcessingPhoto, setIsProcessingPhoto] = useState<boolean>(false);

  // Flujo F03 / F04 / F05: Identificación por IA y confirmación de especie
  const [activeSightingForId, setActiveSightingForId] = useState<Sighting | null>(null);
  const [idResponse, setIdResponse] = useState<IdentificationResponse | null>(null);
  const [selectedTaxonId, setSelectedTaxonId] = useState<string | null>(null);
  const [manualSearchQuery, setManualSearchQuery] = useState<string>('');
  const [duplicateSpeciesPrompt, setDuplicateSpeciesPrompt] = useState<{
    taxonId: string;
    existingSheet: NotebookSpeciesSheet;
  } | null>(null);
  const [isGeneratingPlate, setIsGeneratingPlate] = useState<boolean>(false);

  // Edición de un avistamiento existente en F06
  const [editingSightingId, setEditingSightingId] = useState<string | null>(null);
  const [editNoteText, setEditNoteText] = useState<string>('');
  const [editObservedAt, setEditObservedAt] = useState<string>('');
  const [editLocationText, setEditLocationText] = useState<string>('');
  const [editTaxonId, setEditTaxonId] = useState<string>('');

  // Persistir cambios locales automáticamente
  useEffect(() => {
    saveLocalDeviceState(persisted);
  }, [persisted]);

  // Escuchar eventos reales de conexión del navegador
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('Conexión restablecida. Podés sincronizar los registros pendientes.');
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast('Sin conexión a internet. Tus fotos se guardarán de forma segura en el teléfono.');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sincronizar automáticamente la cola de pendientes cuando vuelve internet
  useEffect(() => {
    if (!isOnline || !persisted.user) return;
    const pendingSync = persisted.sightings.filter((s) => s.syncStatus === 'local');
    if (pendingSync.length > 0 && !simulateUploadFailure) {
      void syncAllPendingSightings();
    }
  }, [isOnline]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4200);
  };

  const activeNotebook = useMemo(
    () => persisted.notebooks.find((n) => n.id === activeNotebookId) || null,
    [persisted.notebooks, activeNotebookId]
  );

  const activeNotebookSheets = useMemo(
    () => persisted.sheets.filter((s) => s.notebookId === activeNotebookId),
    [persisted.sheets, activeNotebookId]
  );

  const activeSheet = useMemo(
    () => persisted.sheets.find((s) => s.id === activeSheetId) || null,
    [persisted.sheets, activeSheetId]
  );

  const pendingSightingsCount = useMemo(
    () =>
      persisted.sightings.filter(
        (s) =>
          s.identificationStatus === 'pendiente_identificacion' ||
          s.identificationStatus === 'requiere_confirmacion' ||
          s.syncStatus !== 'respaldado'
      ).length,
    [persisted.sightings]
  );

  // ============================================================================
  // F01: Inicio de sesión con Google y creación del primer cuaderno
  // ============================================================================
  const handleGoogleSignIn = () => {
    const user: UserProfile = {
      uid: 'google-valeria-ar-01',
      displayName: 'Valeria',
      email: 'valeria.jardinyviajes@gmail.com',
      reducedMotion,
    };

    const nextState: AppPersistedState = {
      ...persisted,
      user,
    };
    setPersisted(nextState);

    if (nextState.notebooks.length === 0) {
      setNbTitle('Aves de mi jardín');
      setNbType('jardin');
      setNbStyle('acuarela_naturalista');
      setNbLocation('Tigre, Buenos Aires');
      setNbPeriod('Primavera 2026');
      setNbDescription('Las aves que visitan el jardín de casa y la galería.');
      setScreen('onboarding_first_notebook');
    } else {
      setActiveNotebookId(nextState.notebooks[0].id);
      setScreen('library');
    }
  };

  const handleCreateNotebook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!persisted.user) return;
    const cleanTitle = nbTitle.trim() || 'Aves de mi jardín';
    const now = new Date().toISOString();

    const newNotebook: Notebook = {
      id: `nb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ownerUid: persisted.user.uid,
      ownerDisplayName: persisted.user.displayName,
      title: cleanTitle,
      type: nbType,
      style: nbStyle,
      description: nbDescription.trim() || undefined,
      generalLocation: nbLocation.trim() || undefined,
      period: nbPeriod.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      shareConfig: {
        isEnabled: false,
        shareToken: null,
        includeOriginalPhotos: false,
        includePersonalNotes: false,
        updatedAt: now,
        revokedTokens: [],
      },
      syncStatus: isOnline ? 'respaldado' : 'local',
    };

    const nextState: AppPersistedState = {
      ...persisted,
      notebooks: [...persisted.notebooks, newNotebook],
    };
    setPersisted(nextState);
    setActiveNotebookId(newNotebook.id);
    setScreen('notebook_detail');
    showToast(`Cuaderno «${newNotebook.title}» creado con estilo ${nbStyle === 'acuarela_naturalista' ? 'Acuarela Naturalista' : 'Lápiz Grafito'}.`);
  };

  // ============================================================================
  // F02: Incorporar una fotografía (Galería / Cámara / Muestra con EXIF)
  // ============================================================================
  const startAddSightingFlow = () => {
    const newId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `sighting_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    setDraftSightingId(newId);
    setDraftPhotoDataUrl('');
    setDraftPhotoSha256('');
    setDraftFileName('');
    setDraftPresetScenario('auto');
    setDraftExif(null);
    setDraftObservedAt(toLocalDateTimeInputValue(new Date()));
    setDraftLocationLabel(activeNotebook?.generalLocation || '');
    setDraftLocationAccepted(true);
    setDraftPersonalNote('');
    setDuplicateSpeciesPrompt(null);
    setScreen('add_sighting');
  };

  const handleFileInputSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingPhoto(true);
    try {
      const exif = await extractExifSuggestions(file);
      const sha256 = await computeBlobSha256(file);
      const sanitizedDataUrl = await sanitizeImageStrippingExif(file);

      setDraftFileName(file.name);
      setDraftPhotoSha256(sha256);
      setDraftPhotoDataUrl(sanitizedDataUrl);
      setDraftPresetScenario('auto');
      setDraftExif(exif);

      if (exif.hasExifDate && exif.suggestedDateIso) {
        setDraftObservedAt(exif.suggestedDateIso);
      } else {
        setDraftObservedAt(toLocalDateTimeInputValue(new Date()));
      }

      if (exif.hasExifGps && exif.suggestedPlaceLabel) {
        setDraftLocationLabel(exif.suggestedPlaceLabel);
        setDraftLocationAccepted(true);
      } else {
        // CA03: Si faltan metadatos EXIF de ubicación, no inventar precisión
        setDraftLocationLabel('');
        setDraftLocationAccepted(false);
      }
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const handleSelectSamplePhoto = async (sample: SampleTestPhoto) => {
    setIsProcessingPhoto(true);
    try {
      setDraftFileName(sample.fileName);
      setDraftPhotoDataUrl(sample.previewUrl);
      setDraftPhotoSha256(`sha256_${sample.id}`);
      setDraftPresetScenario(sample.presetScenario);
      setDraftExif(sample.simulatedExif);

      if (sample.simulatedExif.hasExifDate && sample.simulatedExif.suggestedDateIso) {
        setDraftObservedAt(sample.simulatedExif.suggestedDateIso);
      } else {
        setDraftObservedAt(toLocalDateTimeInputValue(new Date()));
      }

      if (sample.simulatedExif.hasExifGps && sample.simulatedExif.suggestedPlaceLabel) {
        setDraftLocationLabel(sample.simulatedExif.suggestedPlaceLabel);
        setDraftLocationAccepted(true);
      } else {
        setDraftLocationLabel('');
        setDraftLocationAccepted(false);
      }
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const handleDiscardExifLocation = () => {
    setDraftLocationLabel('');
    setDraftLocationAccepted(false);
  };

  /**
   * Guarda el borrador en IndexedDB (persistencia binaria segura) e inicia la identificación
   * si hay internet, o lo conserva como pendiente si está offline (F02.7, CA10).
   */
  const handleSaveDraftAndProceed = async () => {
    if (!activeNotebook || !persisted.user || !draftPhotoDataUrl) return;

    const photoStorageKey = `photo_${draftSightingId}`;
    await savePhotoBinaryToIndexedDb(photoStorageKey, draftPhotoDataUrl, draftPhotoSha256);

    const now = new Date().toISOString();
    const newSighting: Sighting = {
      id: draftSightingId,
      notebookId: activeNotebook.id,
      ownerUid: persisted.user.uid,
      taxonId: null,
      identificationStatus: 'pendiente_identificacion',
      syncStatus: 'local',
      confidenceLevel: null,
      aiCandidates: [],
      aiExplanation: null,
      aiUncertaintyReason: null,
      confirmedByUser: false,
      photoStorageKey,
      sanitizedPhotoDataUrl: draftPhotoDataUrl,
      photoSha256: draftPhotoSha256,
      observedAt: draftObservedAt,
      createdAt: now,
      updatedAt: now,
      exifSuggestions: draftExif || undefined,
      privateLocation:
        draftLocationAccepted && draftLocationLabel.trim()
          ? {
              label: draftLocationLabel.trim(),
              lat: draftExif?.hasExifGps ? draftExif.suggestedLat : undefined,
              lng: draftExif?.hasExifGps ? draftExif.suggestedLng : undefined,
              fromExif: Boolean(draftExif?.hasExifGps),
              acceptedByUser: true,
            }
          : null,
      personalNote: draftPersonalNote.trim(),
      retryCount: 0,
    };

    // Guardar de forma idempotente en el estado local
    const nextSightings = [
      ...persisted.sightings.filter((s) => s.id !== newSighting.id),
      newSighting,
    ];
    const nextState: AppPersistedState = {
      ...persisted,
      sightings: nextSightings,
    };
    setPersisted(nextState);

    if (!isOnline) {
      showToast(
        'Guardado como borrador local sin conexión. Cuando vuelva internet podrás identificar el ave y respaldarlo en la nube.'
      );
      setScreen('notebook_detail');
      return;
    }

    await runIdentificationForSighting(newSighting, nextState, draftPresetScenario);
  };

  // ============================================================================
  // F03: Identificación asistida por IA y manejo de incertidumbre
  // ============================================================================
  const runIdentificationForSighting = async (
    sighting: Sighting,
    currentState: AppPersistedState,
    presetScenario: IdentificationRequest['presetScenario'] = 'auto'
  ) => {
    setActiveSightingForId(sighting);
    setIdResponse(null);
    setDuplicateSpeciesPrompt(null);
    setScreen('identify_review');

    const result = await identifyBirdFromPhoto({
      photoSha256: sighting.photoSha256,
      fileName: draftFileName || sighting.id,
      sanitizedPhotoDataUrl: sighting.sanitizedPhotoDataUrl,
      generalLocationHint:
        sighting.privateLocation?.label || activeNotebook?.generalLocation,
      observedAtIso: sighting.observedAt,
      presetScenario,
    });

    setIdResponse(result);
    setSelectedTaxonId(result.proposedTaxonId || result.candidates[0]?.taxonId || null);

    const updatedSighting: Sighting = {
      ...sighting,
      identificationStatus:
        result.confidenceLevel === 'insuficiente'
          ? 'pendiente_identificacion'
          : 'requiere_confirmacion',
      confidenceLevel: result.confidenceLevel,
      aiCandidates: result.candidates,
      aiExplanation: result.explanation,
      aiUncertaintyReason: result.uncertaintyReason,
      updatedAt: new Date().toISOString(),
    };

    const nextState: AppPersistedState = {
      ...currentState,
      sightings: currentState.sightings.map((s) =>
        s.id === updatedSighting.id ? updatedSighting : s
      ),
    };
    setPersisted(nextState);
    setActiveSightingForId(updatedSighting);
  };

  const handleKeepAsPendingIdentification = async () => {
    if (!activeSightingForId || !persisted.user) return;
    const pendingSighting: Sighting = {
      ...activeSightingForId,
      taxonId: null,
      identificationStatus: 'pendiente_identificacion',
      confirmedByUser: false,
      updatedAt: new Date().toISOString(),
    };

    const nextState: AppPersistedState = {
      ...persisted,
      sightings: persisted.sightings.map((s) =>
        s.id === pendingSighting.id ? pendingSighting : s
      ),
    };
    setPersisted(nextState);

    if (isOnline) {
      await syncSingleSightingWithFeedback(pendingSighting, nextState);
    }

    showToast('Guardado en «Pendientes de identificar» sin adjudicar una especie dudosa.');
    setScreen('notebook_detail');
  };

  // ============================================================================
  // F04 y F05: Confirmar especie (nueva ficha vs. especie ya observada en el cuaderno)
  // ============================================================================
  const handleInitiateSpeciesConfirmation = async (taxonIdToConfirm: string) => {
    if (!activeSightingForId || !activeNotebook) return;

    // Verificar si la especie ya existe en este cuaderno (F05, CA06)
    const existingSheet = persisted.sheets.find(
      (sh) => sh.notebookId === activeNotebook.id && sh.taxonId === taxonIdToConfirm
    );

    if (existingSheet) {
      setDuplicateSpeciesPrompt({
        taxonId: taxonIdToConfirm,
        existingSheet,
      });
      return;
    }

    await finalizeConfirmedSpeciesRegistration(taxonIdToConfirm, null);
  };

  const finalizeConfirmedSpeciesRegistration = async (
    taxonId: string,
    existingSheet: NotebookSpeciesSheet | null
  ) => {
    if (!activeSightingForId || !activeNotebook || !persisted.user) return;
    setIsGeneratingPlate(true);

    try {
      const confirmedSighting: Sighting = {
        ...activeSightingForId,
        taxonId,
        identificationStatus: 'identificado',
        confirmedByUser: true,
        syncStatus: isOnline ? 'subiendo' : 'local',
        updatedAt: new Date().toISOString(),
      };

      let nextIllustrations = [...persisted.illustrations];
      let nextSheets = [...persisted.sheets];
      let targetSheetId = existingSheet?.id || `${activeNotebook.id}_${taxonId}`;

      if (existingSheet) {
        // F05 / CA06: Añadir al historial de la ficha existente sin duplicar ficha ni generar otra ilustración
        const updatedSheet: NotebookSpeciesSheet = {
          ...existingSheet,
          sightingIds: existingSheet.sightingIds.includes(confirmedSighting.id)
            ? existingSheet.sightingIds
            : [...existingSheet.sightingIds, confirmedSighting.id],
          updatedAt: new Date().toISOString(),
        };
        nextSheets = nextSheets.map((sh) => (sh.id === updatedSheet.id ? updatedSheet : sh));
      } else {
        // F04 / CA05: Especie nueva en este cuaderno -> generar o reutilizar ilustración del estilo del cuaderno
        const { illustration } = await generateOrReuseIllustration({
          taxonId,
          style: activeNotebook.style,
          existingIllustrations: persisted.illustrations,
          forceNewVersion: false,
        });

        if (!nextIllustrations.some((i) => i.id === illustration.id)) {
          nextIllustrations.push(illustration);
        }

        const newSheet: NotebookSpeciesSheet = {
          id: targetSheetId,
          notebookId: activeNotebook.id,
          taxonId,
          activeIllustrationId: illustration.id,
          firstObservedAt: confirmedSighting.observedAt,
          generalPlace:
            confirmedSighting.privateLocation?.label || activeNotebook.generalLocation,
          sightingIds: [confirmedSighting.id],
          updatedAt: new Date().toISOString(),
        };
        nextSheets.push(newSheet);
      }

      const nextSightings = persisted.sightings.map((s) =>
        s.id === confirmedSighting.id ? confirmedSighting : s
      );

      const intermediateState: AppPersistedState = {
        ...persisted,
        illustrations: nextIllustrations,
        sheets: nextSheets,
        sightings: nextSightings,
      };
      setPersisted(intermediateState);
      setDuplicateSpeciesPrompt(null);
      setActiveSheetId(targetSheetId);
      setScreen('sheet_detail');

      // Sincronizar binarios y metadatos con el respaldo de Google si hay conexión
      await syncSingleSightingWithFeedback(confirmedSighting, intermediateState);
    } finally {
      setIsGeneratingPlate(false);
    }
  };

  // ============================================================================
  // Sincronización idempotente y simulación de cambio de celular (CA10, CA11)
  // ============================================================================
  const syncSingleSightingWithFeedback = async (
    sighting: Sighting,
    baseState: AppPersistedState
  ) => {
    if (!baseState.user) return;

    const result = await syncSightingAndNotebookToCloud({
      uid: baseState.user.uid,
      sighting,
      state: baseState,
      isOnline,
      simulateNetworkFailure: simulateUploadFailure,
    });

    setPersisted((prev) => ({
      ...prev,
      sightings: prev.sightings.map((s) =>
        s.id === sighting.id
          ? {
              ...s,
              syncStatus: result.finalSyncStatus,
              lastSyncError: result.errorMessage,
            }
          : s
      ),
      notebooks: prev.notebooks.map((nb) =>
        nb.id === sighting.notebookId
          ? {
              ...nb,
              syncStatus: result.finalSyncStatus === 'respaldado' ? 'respaldado' : nb.syncStatus,
            }
          : nb
      ),
    }));
  };

  const syncAllPendingSightings = async () => {
    if (!persisted.user) return;
    if (!isOnline) {
      showToast('Todavía no hay conexión a internet para subir los pendientes.');
      return;
    }

    const targets = persisted.sightings.filter((s) => s.syncStatus !== 'respaldado');
    if (targets.length === 0) {
      showToast('Todos tus avistamientos y fotografías ya están respaldados en la nube.');
      return;
    }

    // Marcar como 'subiendo'
    setPersisted((prev) => ({
      ...prev,
      sightings: prev.sightings.map((s) =>
        s.syncStatus !== 'respaldado' ? { ...s, syncStatus: 'subiendo' } : s
      ),
    }));

    let currentState = { ...persisted };
    let allSucceeded = true;

    for (const s of targets) {
      const res = await syncSightingAndNotebookToCloud({
        uid: persisted.user.uid,
        sighting: s,
        state: currentState,
        isOnline: true,
        simulateNetworkFailure: simulateUploadFailure,
      });

      if (res.finalSyncStatus !== 'respaldado') {
        allSucceeded = false;
      }

      currentState = {
        ...currentState,
        sightings: currentState.sightings.map((item) =>
          item.id === s.id
            ? {
                ...item,
                syncStatus: res.finalSyncStatus,
                lastSyncError: res.errorMessage,
              }
            : item
        ),
      };
    }

    setPersisted(currentState);
    if (allSucceeded) {
      showToast('¡Respaldo completado! Fotografías originales, láminas y notas seguras en tu cuenta de Google.');
    } else {
      showToast('Algunas subidas quedaron con error. Podés reintentar sin duplicar registros.');
    }
  };

  const handleSimulatePhoneSwitchRestore = async () => {
    const uid = persisted.user?.uid || 'google-valeria-ar-01';
    const restored = await restoreFromGoogleCloudOnNewDevice(uid);
    if (!restored || restored.notebooks.length === 0) {
      showToast(
        'Aún no había cuadernos confirmados como respaldados en la nube. Creá o sincronizá un registro primero.'
      );
      return;
    }
    setPersisted(restored);
    setActiveNotebookId(restored.notebooks[0]?.id || null);
    setScreen('library');
    showToast(
      `Se simuló un celular Android nuevo: se borraron los datos locales y se recuperaron ${restored.notebooks.length} cuaderno(s) y ${restored.sightings.length} avistamiento(s) respaldados con Google.`
    );
  };

  // ============================================================================
  // CA08: Pedir otra versión de la ilustración sin perder el avistamiento
  // ============================================================================
  const handleRegenerateSheetIllustration = async (sheet: NotebookSpeciesSheet) => {
    if (!activeNotebook) return;
    setIsGeneratingPlate(true);
    try {
      const { illustration } = await generateOrReuseIllustration({
        taxonId: sheet.taxonId,
        style: activeNotebook.style,
        existingIllustrations: persisted.illustrations,
        forceNewVersion: true,
      });

      const updatedSheet: NotebookSpeciesSheet = {
        ...sheet,
        activeIllustrationId: illustration.id,
        updatedAt: new Date().toISOString(),
      };

      const nextState: AppPersistedState = {
        ...persisted,
        illustrations: [...persisted.illustrations, illustration],
        sheets: persisted.sheets.map((sh) => (sh.id === updatedSheet.id ? updatedSheet : sh)),
      };
      setPersisted(nextState);

      const firstSighting = nextState.sightings.find((s) =>
        updatedSheet.sightingIds.includes(s.id)
      );
      if (firstSighting && isOnline) {
        await syncSingleSightingWithFeedback(firstSighting, nextState);
      }

      showToast(
        `Creamos la versión #${illustration.version} de la lámina conservando intactos tus avistamientos y fotografías originales.`
      );
    } finally {
      setIsGeneratingPlate(false);
    }
  };

  // ============================================================================
  // F06 / CA07: Editar nota, fecha, ubicación privada o corregir especie de un avistamiento
  // ============================================================================
  const startEditingSighting = (s: Sighting) => {
    setEditingSightingId(s.id);
    setEditNoteText(s.personalNote);
    setEditObservedAt(s.observedAt);
    setEditLocationText(s.privateLocation?.label || '');
    setEditTaxonId(s.taxonId || '');
  };

  const handleSaveSightingEdits = async (sighting: Sighting) => {
    if (!activeNotebook) return;
    const newTaxonId = editTaxonId || sighting.taxonId;
    const taxonChanged = Boolean(newTaxonId && newTaxonId !== sighting.taxonId);

    const updatedSighting: Sighting = {
      ...sighting,
      taxonId: newTaxonId,
      personalNote: editNoteText.trim(),
      observedAt: editObservedAt || sighting.observedAt,
      privateLocation: editLocationText.trim()
        ? {
            label: editLocationText.trim(),
            lat: sighting.privateLocation?.lat,
            lng: sighting.privateLocation?.lng,
            fromExif: Boolean(sighting.privateLocation?.fromExif),
            acceptedByUser: true,
          }
        : null,
      syncStatus: isOnline ? 'respaldado' : 'local',
      updatedAt: new Date().toISOString(),
    };

    let nextSheets = [...persisted.sheets];
    let nextIllustrations = [...persisted.illustrations];
    let nextActiveSheetId = activeSheetId;

    // Si Valeria corrigió la especie del avistamiento (§14 punto 4):
    if (taxonChanged && newTaxonId) {
      // 1. Quitar el avistamiento de la ficha anterior
      nextSheets = nextSheets
        .map((sh) => {
          if (sh.notebookId === activeNotebook.id && sh.taxonId === sighting.taxonId) {
            return {
              ...sh,
              sightingIds: sh.sightingIds.filter((id) => id !== sighting.id),
            };
          }
          return sh;
        })
        .filter((sh) => sh.sightingIds.length > 0);

      // 2. Verificar si ya existe ficha para la nueva especie en este cuaderno
      const targetSheet = nextSheets.find(
        (sh) => sh.notebookId === activeNotebook.id && sh.taxonId === newTaxonId
      );

      if (targetSheet) {
        nextSheets = nextSheets.map((sh) =>
          sh.id === targetSheet.id
            ? {
                ...sh,
                sightingIds: sh.sightingIds.includes(sighting.id)
                  ? sh.sightingIds
                  : [...sh.sightingIds, sighting.id],
              }
            : sh
        );
        nextActiveSheetId = targetSheet.id;
      } else {
        const { illustration } = await generateOrReuseIllustration({
          taxonId: newTaxonId,
          style: activeNotebook.style,
          existingIllustrations: nextIllustrations,
          forceNewVersion: false,
        });
        if (!nextIllustrations.some((i) => i.id === illustration.id)) {
          nextIllustrations.push(illustration);
        }
        const newSheetId = `${activeNotebook.id}_${newTaxonId}`;
        nextSheets.push({
          id: newSheetId,
          notebookId: activeNotebook.id,
          taxonId: newTaxonId,
          activeIllustrationId: illustration.id,
          firstObservedAt: updatedSighting.observedAt,
          generalPlace: updatedSighting.privateLocation?.label || activeNotebook.generalLocation,
          sightingIds: [updatedSighting.id],
          updatedAt: new Date().toISOString(),
        });
        nextActiveSheetId = newSheetId;
      }
    }

    const nextState: AppPersistedState = {
      ...persisted,
      illustrations: nextIllustrations,
      sheets: nextSheets,
      sightings: persisted.sightings.map((s) =>
        s.id === updatedSighting.id ? updatedSighting : s
      ),
    };

    setPersisted(nextState);
    setEditingSightingId(null);
    setActiveSheetId(nextActiveSheetId);

    if (isOnline) {
      await syncSingleSightingWithFeedback(updatedSighting, nextState);
    }
    showToast('Cambios guardados en tu cuaderno.');
  };

  // ============================================================================
  // F08: Compartir cuaderno y revocar enlace (CA13, CA14, CA15)
  // ============================================================================
  const handleActivateOrUpdateNotebookShare = (options: {
    includeOriginalPhotos: boolean;
    includePersonalNotes: boolean;
    regenerateToken?: boolean;
  }): string => {
    if (!activeNotebook) return '';

    const previousToken = activeNotebook.shareConfig.shareToken;
    const nextToken =
      options.regenerateToken || !previousToken
        ? `cuaderno_${activeNotebook.id.slice(-5)}_${Math.random().toString(36).slice(2, 10)}`
        : previousToken;

    const nextRevoked = [...activeNotebook.shareConfig.revokedTokens];
    if (options.regenerateToken && previousToken && previousToken !== nextToken) {
      revokePublicNotebookShareToken(previousToken);
      nextRevoked.push(previousToken);
    }

    const updatedNotebook: Notebook = {
      ...activeNotebook,
      shareConfig: {
        isEnabled: true,
        shareToken: nextToken,
        includeOriginalPhotos: options.includeOriginalPhotos,
        includePersonalNotes: options.includePersonalNotes,
        updatedAt: new Date().toISOString(),
        revokedTokens: nextRevoked,
      },
      updatedAt: new Date().toISOString(),
    };

    const nextNotebooks = persisted.notebooks.map((nb) =>
      nb.id === updatedNotebook.id ? updatedNotebook : nb
    );
    const nextState: AppPersistedState = {
      ...persisted,
      notebooks: nextNotebooks,
    };
    setPersisted(nextState);

    publishOrUpdateSanitizedNotebookProjection(
      updatedNotebook,
      nextState.sheets,
      nextState.sightings,
      nextState.illustrations
    );

    return nextToken;
  };

  const handleRevokeNotebookShare = () => {
    if (!activeNotebook || !activeNotebook.shareConfig.shareToken) return;
    const tokenToRevoke = activeNotebook.shareConfig.shareToken;
    revokePublicNotebookShareToken(tokenToRevoke);

    const updatedNotebook: Notebook = {
      ...activeNotebook,
      shareConfig: {
        ...activeNotebook.shareConfig,
        isEnabled: false,
        shareToken: null,
        updatedAt: new Date().toISOString(),
        revokedTokens: [...activeNotebook.shareConfig.revokedTokens, tokenToRevoke],
      },
    };

    setPersisted((prev) => ({
      ...prev,
      notebooks: prev.notebooks.map((nb) =>
        nb.id === updatedNotebook.id ? updatedNotebook : nb
      ),
    }));
  };

  // ============================================================================
  // Si se está visualizando un enlace compartido público (/s/:token o ?share=:token)
  // ============================================================================
  if (guestShareToken) {
    return (
      <div className={reducedMotion ? 'reduced-motion' : ''}>
        <PublicNotebookView
          shareToken={guestShareToken}
          onExitPublicPreview={() => {
            setGuestShareToken(null);
            if (window.location.search.includes('share=')) {
              window.history.replaceState({}, '', window.location.pathname);
            }
          }}
        />
      </div>
    );
  }

  // Helper para renderizar badge de sincronización (CA10)
  const renderSyncBadge = (status: SyncStatus) => {
    switch (status) {
      case 'respaldado':
        return (
          <span className="badge badge-sync-respaldado">
            <Cloud size={13} /> Respaldado
          </span>
        );
      case 'subiendo':
        return (
          <span className="badge badge-sync-subiendo">
            <UploadCloud size={13} /> Subiendo…
          </span>
        );
      case 'error':
        return (
          <span className="badge badge-sync-error">
            <AlertTriangle size={13} /> Error (Reintentar)
          </span>
        );
      case 'local':
      default:
        return (
          <span className="badge badge-sync-local">
            <CloudOff size={13} /> Guardado local
          </span>
        );
    }
  };

  // ============================================================================
  // Vista 1: Bienvenida / acceso con Google (F01, CA01)
  // ============================================================================
  if (screen === 'welcome' || !persisted.user) {
    return (
      <div className={`app-shell ${reducedMotion ? 'reduced-motion' : ''}`}>
        <div
          className="notebook-page"
          style={{
            maxWidth: 640,
            margin: '28px auto',
            padding: '32px 26px',
            textAlign: 'center',
          }}
        >
          <span className="badge badge-sync-respaldado" style={{ marginBottom: 12 }}>
            <Feather size={14} /> Álbum personal de naturaleza
          </span>
          <h1 className="serif-heading" style={{ fontSize: '2.5rem', marginBottom: 8 }}>
            Cuaderno de Aves
          </h1>
          <p className="handwritten-note" style={{ margin: '0 0 18px', color: 'var(--botanical-green)' }}>
            Un refugio ilustrado para las aves de tu jardín y tus viajes
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 14,
              margin: '20px 0',
            }}
          >
            <div className="plate-frame">
              <img src="/plates/acuarela_hornero.jpg" alt="Ejemplo de lámina en acuarela naturalista" />
            </div>
            <div className="plate-frame style-lapiz_grafito">
              <img src="/plates/grafito_chingolo.jpg" alt="Ejemplo de lámina en lápiz grafito" />
            </div>
          </div>

          <p style={{ color: 'var(--ink-secondary)', fontSize: '0.98rem', marginBottom: 20 }}>
            Descubrí qué especie fotografiaste, transformá cada hallazgo en una lámina en{' '}
            <strong>acuarela naturalista</strong> o <strong>lápiz grafito</strong>, y conservá tus
            recuerdos respaldados en tu cuenta de Google aunque cambies de teléfono.
          </p>

          <button
            type="button"
            className="btn btn-primary"
            style={{ fontSize: '1.05rem', padding: '13px 26px' }}
            onClick={handleGoogleSignIn}
          >
            <ShieldCheck size={19} /> Ingresar con mi cuenta de Google (Valeria)
          </button>

          <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginTop: 14 }}>
            Solo solicitamos el permiso mínimo de identidad para asociar y proteger tus cuadernos en la nube.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell ${reducedMotion ? 'reduced-motion' : ''}`}>
      {/* Cabezal superior persistente */}
      <header className="top-header">
        <button
          type="button"
          className="brand-title"
          onClick={() => setScreen('library')}
          title="Ir a mi biblioteca de cuadernos"
        >
          <Feather size={26} color="#38573E" />
          <div>
            <h1>Cuaderno de Aves</h1>
            <span className="brand-subtitle">Colección personal de {persisted.user.displayName}</span>
          </div>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn ${isOnline ? 'btn-secondary' : 'btn-terracotta'}`}
            style={{ padding: '7px 12px', fontSize: '0.82rem' }}
            onClick={() => setIsOnline((prev) => !prev)}
            title="Alternar conectividad para probar modo sin internet en el jardín o en viaje (CA10)"
          >
            {isOnline ? <Wifi size={15} /> : <WifiOff size={15} />}
            {isOnline ? 'Con internet' : 'Sin conexión (Offline)'}
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '7px 12px', fontSize: '0.82rem' }}
            onClick={() => setScreen('pending_center')}
          >
            <Cloud size={15} /> Pendientes y Respaldo ({pendingSightingsCount})
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '7px 12px', fontSize: '0.82rem' }}
            onClick={() => setReducedMotion((prev) => !prev)}
            title="Reducir animaciones de hojas"
          >
            {reducedMotion ? 'Animaciones: reducidas' : 'Animaciones: suaves'}
          </button>
        </div>
      </header>

      {toastMessage && (
        <div className="callout-box" role="status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{toastMessage}</span>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '4px 10px', fontSize: '0.78rem' }}
            onClick={() => setToastMessage(null)}
          >
            Cerrar
          </button>
        </div>
      )}

      {/* ========================================================================
          Vista 2: Onboarding y creación del primer cuaderno / Nuevo cuaderno
         ======================================================================== */}
      {(screen === 'onboarding_first_notebook' || screen === 'create_notebook') && (
        <section className="notebook-page">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <span className="badge badge-sync-respaldado">
                {screen === 'onboarding_first_notebook' ? 'Bienvenida, Valeria · Paso inicial' : 'Nuevo cuaderno'}
              </span>
              <h2 className="serif-heading" style={{ fontSize: '2rem', marginTop: 6 }}>
                {screen === 'onboarding_first_notebook'
                  ? 'Armemos tu primer cuaderno de campo'
                  : 'Crear un nuevo cuaderno temático'}
              </h2>
              <p style={{ color: 'var(--ink-secondary)', margin: '4px 0 16px' }}>
                Cada cuaderno conserva su propio estilo artístico de láminas y su historial de avistamientos.
              </p>
            </div>
            {persisted.notebooks.length > 0 && (
              <button type="button" className="btn btn-secondary" onClick={() => setScreen('library')}>
                <ArrowLeft size={16} /> Volver a mis cuadernos
              </button>
            )}
          </div>

          <form onSubmit={handleCreateNotebook}>
            <div className="field-group">
              <label htmlFor="nb-title">Nombre del cuaderno</label>
              <input
                id="nb-title"
                type="text"
                required
                className="input-text"
                value={nbTitle}
                onChange={(e) => setNbTitle(e.target.value)}
                placeholder="Ej.: Aves de mi jardín o Vacaciones en Lago Puelo"
              />
            </div>

            <div className="field-group">
              <label>Tipo de cuaderno</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`btn ${nbType === 'jardin' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => {
                    setNbType('jardin');
                    if (nbTitle === 'Vacaciones en Lago Puelo') setNbTitle('Aves de mi jardín');
                  }}
                >
                  <Feather size={16} /> Hogar / Jardín
                </button>
                <button
                  type="button"
                  className={`btn ${nbType === 'viaje' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => {
                    setNbType('viaje');
                    if (nbTitle === 'Aves de mi jardín') {
                      setNbTitle('Vacaciones en Lago Puelo');
                      setNbLocation('Lago Puelo, Chubut');
                      setNbPeriod('Verano 2026');
                    }
                  }}
                >
                  <Compass size={16} /> Viaje / Escapada
                </button>
              </div>
            </div>

            <div className="field-group">
              <label>Estilo artístico de las láminas (permanece fijo para este cuaderno)</label>
              <div className="style-selector-grid">
                <button
                  type="button"
                  className={`style-option-card ${nbStyle === 'acuarela_naturalista' ? 'selected' : ''}`}
                  onClick={() => setNbStyle('acuarela_naturalista')}
                >
                  <div className="plate-frame" style={{ height: 150, marginBottom: 8 }}>
                    <img src="/plates/acuarela_hornero.jpg" alt="Muestra Acuarela Naturalista" />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>Acuarela naturalista</div>
                  <div className="field-hint">
                    Pinceladas suaves en tonos cálidos y botánicos sobre papel de algodón.
                  </div>
                </button>

                <button
                  type="button"
                  className={`style-option-card ${nbStyle === 'lapiz_grafito' ? 'selected' : ''}`}
                  onClick={() => setNbStyle('lapiz_grafito')}
                >
                  <div className="plate-frame style-lapiz_grafito" style={{ height: 150, marginBottom: 8 }}>
                    <img src="/plates/grafito_chingolo.jpg" alt="Muestra Lápiz Grafito" />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>Lápiz grafito</div>
                  <div className="field-hint">
                    Apunte de campo clásico con sombreado a lápiz y trazos finos de libreta.
                  </div>
                </button>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              <div className="field-group">
                <label htmlFor="nb-location">Lugar general (opcional)</label>
                <input
                  id="nb-location"
                  type="text"
                  className="input-text"
                  value={nbLocation}
                  onChange={(e) => setNbLocation(e.target.value)}
                  placeholder="Ej.: Tigre, Buenos Aires o Lago Puelo"
                />
              </div>

              <div className="field-group">
                <label htmlFor="nb-period">Período o estación (opcional)</label>
                <input
                  id="nb-period"
                  type="text"
                  className="input-text"
                  value={nbPeriod}
                  onChange={(e) => setNbPeriod(e.target.value)}
                  placeholder="Ej.: Primavera 2026 o Vacaciones de verano"
                />
              </div>
            </div>

            <div className="field-group">
              <label htmlFor="nb-desc">Descripción o contexto (opcional)</label>
              <input
                id="nb-desc"
                type="text"
                className="input-text"
                value={nbDescription}
                onChange={(e) => setNbDescription(e.target.value)}
                placeholder="Breve nota de portada para recordar este cuaderno"
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: 6 }}>
              <BookOpen size={18} /> Crear cuaderno y abrir portada
            </button>
          </form>
        </section>
      )}

      {/* ========================================================================
          Vista 3: Biblioteca de cuadernos (Jardín y Viajes) — F06, CA09
         ======================================================================== */}
      {screen === 'library' && (
        <section>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <h2 className="serif-heading" style={{ fontSize: '2rem', margin: 0 }}>
                Mis cuadernos de campo
              </h2>
              <span style={{ color: 'var(--ink-secondary)', fontSize: '0.94rem' }}>
                Elegí un cuaderno para hojear tus láminas o registrar una nueva ave observada.
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setNbTitle('Vacaciones en Lago Puelo');
                setNbType('viaje');
                setNbStyle('lapiz_grafito');
                setNbLocation('Lago Puelo, Chubut');
                setNbPeriod('Verano 2026');
                setNbDescription('Aves observadas en los senderos y costas del lago.');
                setScreen('create_notebook');
              }}
            >
              <Plus size={18} /> Nuevo cuaderno (Jardín o Viaje)
            </button>
          </div>

          <div className="notebook-grid">
            {persisted.notebooks.map((nb) => {
              const sheetsCount = persisted.sheets.filter((s) => s.notebookId === nb.id).length;
              const sightingsCount = persisted.sightings.filter(
                (s) => s.notebookId === nb.id && s.identificationStatus === 'identificado'
              ).length;
              const pendingCount = persisted.sightings.filter(
                (s) =>
                  s.notebookId === nb.id &&
                  s.identificationStatus !== 'identificado'
              ).length;

              return (
                <div
                  key={nb.id}
                  className={`notebook-card style-${nb.style}`}
                  onClick={() => {
                    setActiveNotebookId(nb.id);
                    setScreen('notebook_detail');
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setActiveNotebookId(nb.id);
                      setScreen('notebook_detail');
                    }
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                      <span className="badge badge-sync-respaldado">
                        {nb.type === 'jardin' ? 'Hogar / Jardín' : 'Viaje'} ·{' '}
                        {nb.style === 'acuarela_naturalista' ? 'Acuarela' : 'Grafito'}
                      </span>
                      {renderSyncBadge(nb.syncStatus)}
                    </div>

                    <h3 className="serif-heading" style={{ fontSize: '1.6rem', margin: '4px 0' }}>
                      {nb.title}
                    </h3>

                    {nb.description && (
                      <p style={{ fontSize: '0.9rem', color: 'var(--ink-secondary)', margin: '4px 0 8px' }}>
                        {nb.description}
                      </p>
                    )}

                    <div style={{ fontSize: '0.84rem', color: 'var(--ink-muted)' }}>
                      {nb.generalLocation && <div>📍 {nb.generalLocation}</div>}
                      {nb.period && <div>🗓️ {nb.period}</div>}
                    </div>
                  </div>

                  <div
                    style={{
                      borderTop: '1px solid var(--paper-edge)',
                      paddingTop: 10,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.86rem',
                      fontWeight: 600,
                      color: 'var(--botanical-green)',
                    }}
                  >
                    <span>
                      {sheetsCount} {sheetsCount === 1 ? 'especie' : 'especies'} · {sightingsCount}{' '}
                      {sightingsCount === 1 ? 'avistamiento' : 'avistamientos'}
                    </span>
                    {pendingCount > 0 && (
                      <span className="badge badge-sync-local">{pendingCount} pendiente(s)</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ========================================================================
          Vista 4: Cuaderno abierto (Portada, Índice de láminas y Acción principal)
         ======================================================================== */}
      {screen === 'notebook_detail' && activeNotebook && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setScreen('library')}>
              <ArrowLeft size={16} /> Todos mis cuadernos
            </button>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowShareNotebookModal(true)}
              >
                <Share2 size={16} /> Compartir cuaderno
              </button>
              <button type="button" className="btn btn-primary" onClick={startAddSightingFlow}>
                <Camera size={17} /> Registrar ave
              </button>
            </div>
          </div>

          {/* Portada del cuaderno */}
          <div className={`notebook-page style-${activeNotebook.style}`} style={{ marginBottom: 20 }}>
            {editingNotebookMeta ? (
              <div>
                <h3 className="serif-heading" style={{ fontSize: '1.4rem' }}>
                  Editar datos de portada del cuaderno
                </h3>
                <div className="field-group">
                  <label>Nombre del cuaderno</label>
                  <input
                    type="text"
                    className="input-text"
                    value={activeNotebook.title}
                    onChange={(e) =>
                      setPersisted((prev) => ({
                        ...prev,
                        notebooks: prev.notebooks.map((n) =>
                          n.id === activeNotebook.id ? { ...n, title: e.target.value } : n
                        ),
                      }))
                    }
                  />
                </div>
                <div className="field-group">
                  <label>Lugar general</label>
                  <input
                    type="text"
                    className="input-text"
                    value={activeNotebook.generalLocation || ''}
                    onChange={(e) =>
                      setPersisted((prev) => ({
                        ...prev,
                        notebooks: prev.notebooks.map((n) =>
                          n.id === activeNotebook.id ? { ...n, generalLocation: e.target.value } : n
                        ),
                      }))
                    }
                  />
                </div>
                <div className="field-group">
                  <label>Período</label>
                  <input
                    type="text"
                    className="input-text"
                    value={activeNotebook.period || ''}
                    onChange={(e) =>
                      setPersisted((prev) => ({
                        ...prev,
                        notebooks: prev.notebooks.map((n) =>
                          n.id === activeNotebook.id ? { ...n, period: e.target.value } : n
                        ),
                      }))
                    }
                  />
                </div>
                <div className="callout-box" style={{ marginBottom: 12 }}>
                  El estilo artístico (<strong>{activeNotebook.style === 'acuarela_naturalista' ? 'Acuarela naturalista' : 'Lápiz grafito'}</strong>) permanece fijo para conservar la armonía visual de las láminas de este cuaderno (§4.1).
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setEditingNotebookMeta(false);
                    showToast('Portada del cuaderno actualizada.');
                  }}
                >
                  <Check size={16} /> Guardar portada
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                    <span className="badge badge-sync-respaldado">
                      {activeNotebook.type === 'jardin' ? 'Cuaderno de Hogar / Jardín' : 'Cuaderno de Viaje'}
                    </span>
                    <span className="badge badge-sync-respaldado">
                      Estilo fijo:{' '}
                      {activeNotebook.style === 'acuarela_naturalista'
                        ? 'Acuarela naturalista'
                        : 'Lápiz grafito'}
                    </span>
                    {renderSyncBadge(activeNotebook.syncStatus)}
                  </div>

                  <h2 className="serif-heading" style={{ fontSize: '2.2rem', margin: '4px 0' }}>
                    {activeNotebook.title}
                  </h2>
                  {activeNotebook.description && (
                    <p style={{ margin: '4px 0 10px', color: 'var(--ink-secondary)' }}>
                      {activeNotebook.description}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.88rem', color: 'var(--ink-muted)' }}>
                    {activeNotebook.generalLocation && <span>📍 {activeNotebook.generalLocation}</span>}
                    {activeNotebook.period && <span>🗓️ {activeNotebook.period}</span>}
                    <span>
                      📖 {activeNotebookSheets.length}{' '}
                      {activeNotebookSheets.length === 1 ? 'lámina de especie' : 'láminas de especies'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingNotebookMeta(true)}
                >
                  <Edit3 size={15} /> Editar portada
                </button>
              </div>
            )}
          </div>

          {/* Estado vacío con llamada a la acción clara F01.4: «Registrar mi primera ave» */}
          {activeNotebookSheets.length === 0 ? (
            <div className="notebook-page" style={{ textAlign: 'center', padding: '38px 22px' }}>
              <Feather size={38} color="#38573E" style={{ marginBottom: 8 }} />
              <h3 className="serif-heading" style={{ fontSize: '1.8rem' }}>
                Las páginas de «{activeNotebook.title}» están listas
              </h3>
              <p style={{ color: 'var(--ink-secondary)', maxWidth: 480, margin: '8px auto 20px' }}>
                Elegí una foto de tu galería (incluso de días anteriores o vacaciones) o sacá una foto ahora para identificar tu primera especie e inaugurar el cuaderno con su lámina ilustrada.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                style={{ fontSize: '1.05rem', padding: '13px 26px' }}
                onClick={startAddSightingFlow}
              >
                <Camera size={19} /> Registrar mi primera ave
              </button>
            </div>
          ) : (
            <div>
              <h3 className="serif-heading" style={{ fontSize: '1.55rem', marginBottom: 12 }}>
                Índice de especies descubiertas en este cuaderno
              </h3>
              <div className="sheets-grid">
                {activeNotebookSheets.map((sheet) => {
                  const species = findSpeciesByTaxonId(sheet.taxonId);
                  if (!species) return null;
                  const ill = persisted.illustrations.find(
                    (i) => i.id === sheet.activeIllustrationId
                  );
                  const imgUrl =
                    ill?.imageUrl ||
                    (activeNotebook.style === 'acuarela_naturalista'
                      ? species.defaultWatercolorPlate
                      : species.defaultGraphitePlate);

                  const sheetSightings = persisted.sightings.filter(
                    (s) =>
                      s.notebookId === activeNotebook.id &&
                      s.taxonId === sheet.taxonId &&
                      s.identificationStatus === 'identificado'
                  );

                  return (
                    <div
                      key={sheet.id}
                      className="species-plate-card"
                      onClick={() => {
                        setActiveSheetId(sheet.id);
                        setScreen('sheet_detail');
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setActiveSheetId(sheet.id);
                          setScreen('sheet_detail');
                        }
                      }}
                    >
                      <div className={`plate-frame style-${activeNotebook.style}`}>
                        <img src={imgUrl} alt={`Lámina de ${species.commonNameAr}`} />
                      </div>
                      <div>
                        <h4 className="serif-heading" style={{ fontSize: '1.4rem', margin: 0 }}>
                          {species.commonNameAr}
                        </h4>
                        <div className="scientific-name" style={{ fontSize: '1rem' }}>
                          {species.scientificName}
                        </div>
                        <div
                          style={{
                            marginTop: 8,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.82rem',
                            color: 'var(--ink-muted)',
                          }}
                        >
                          <span>1.ª vez: {formatShortArgentineDate(sheet.firstObservedAt)}</span>
                          <span className="badge badge-sync-respaldado">
                            {sheetSightings.length}{' '}
                            {sheetSightings.length === 1 ? 'registro' : 'registros'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Lista de avistamientos pendientes dentro de este cuaderno */}
          {persisted.sightings.some(
            (s) =>
              s.notebookId === activeNotebook.id &&
              s.identificationStatus !== 'identificado'
          ) && (
            <div className="notebook-page" style={{ marginTop: 22 }}>
              <h3 className="serif-heading" style={{ fontSize: '1.45rem' }}>
                Avistamientos pendientes de identificar en este cuaderno
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                {persisted.sightings
                  .filter(
                    (s) =>
                      s.notebookId === activeNotebook.id &&
                      s.identificationStatus !== 'identificado'
                  )
                  .map((s) => (
                    <div
                      key={s.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap',
                        padding: 10,
                        background: 'var(--paper-inset)',
                        borderRadius: 10,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <img
                          src={s.sanitizedPhotoDataUrl}
                          alt="Avistamiento pendiente"
                          style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8 }}
                        />
                        <div>
                          <div style={{ fontWeight: 600 }}>
                            Fotografía del {formatShortArgentineDate(s.observedAt)}
                          </div>
                          <div style={{ fontSize: '0.84rem', color: 'var(--ink-secondary)' }}>
                            {s.personalNote || 'Sin nota personal'} ·{' '}
                            {s.identificationStatus === 'requiere_confirmacion'
                              ? 'Con candidatas sugeridas'
                              : 'Pendiente de identificar'}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {renderSyncBadge(s.syncStatus)}
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => {
                            if (!isOnline) {
                              showToast('Necesitás conexión a internet para consultar la identificación por IA.');
                              return;
                            }
                            void runIdentificationForSighting(s, persisted, 'auto');
                          }}
                        >
                          <Sparkles size={15} /> Identificar ahora
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ========================================================================
          Vista 5: Agregar avistamiento (Galería / Cámara / EXIF / Nota) — F02, CA02, CA03
         ======================================================================== */}
      {screen === 'add_sighting' && activeNotebook && (
        <section className="notebook-page">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <span className="badge badge-sync-respaldado">Cuaderno: {activeNotebook.title}</span>
              <h2 className="serif-heading" style={{ fontSize: '1.9rem', margin: '4px 0 0' }}>
                Registrar ave observada
              </h2>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setScreen('notebook_detail')}
            >
              <ArrowLeft size={16} /> Volver al cuaderno
            </button>
          </div>

          {/* Selectores nativos de Galería (principal) y Cámara (CA02) */}
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileInputSelected}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleFileInputSelected}
          />

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => galleryInputRef.current?.click()}
            >
              <FolderOpen size={18} /> Elegir foto de la galería
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera size={18} /> Sacar foto con la cámara
            </button>
          </div>

          {/* Laboratorio rápido de fotografías de prueba (F03 Nota técnica + EXIF CA03) */}
          <div className="callout-box" style={{ marginBottom: 18 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: '0.9rem' }}>
              📸 Fotografías de muestra para probar escenarios de galería, EXIF e incertidumbre de IA (F02 y F03):
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(225px, 1fr))',
                gap: 8,
              }}
            >
              {SAMPLE_TEST_PHOTOS.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  className="style-option-card"
                  style={{ padding: '8px 10px' }}
                  onClick={() => void handleSelectSamplePhoto(sample)}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>{sample.label}</div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--ink-secondary)' }}>
                    {sample.subtitle}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {isProcessingPhoto && (
            <div className="callout-box">Leyendo imagen y verificando metadatos EXIF de forma privada…</div>
          )}

          {draftPhotoDataUrl && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 20,
                alignItems: 'start',
              }}
            >
              <div>
                <div className="plate-frame" style={{ maxHeight: 340 }}>
                  <img src={draftPhotoDataUrl} alt="Vista previa de tu fotografía" />
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginTop: 6 }}>
                  Archivo: {draftFileName} · Tu fotografía original se conserva íntegra.
                </div>
              </div>

              <div>
                {/* Aviso transparente sobre metadatos EXIF (F02.4, F02.5, CA03) */}
                {draftExif && (draftExif.hasExifDate || draftExif.hasExifGps) ? (
                  <div className="callout-box" style={{ marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, color: '#28402C', marginBottom: 4 }}>
                      ✨ Metadatos EXIF detectados en la fotografía (CA03)
                    </div>
                    <div style={{ fontSize: '0.85rem' }}>
                      Sugerimos la fecha{draftExif.hasExifGps ? ' y ubicación general' : ''} a partir de
                      los datos de tu cámara{draftExif.cameraDescription ? ` (${draftExif.cameraDescription})` : ''}.
                      Podés revisarlos, corregirlos o descartarlos abajo.
                    </div>
                  </div>
                ) : (
                  <div className="callout-box warning" style={{ marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, marginBottom: 3 }}>
                      Fotografía sin metadatos EXIF de ubicación (CA03)
                    </div>
                    <div style={{ fontSize: '0.84rem' }}>
                      Esta imagen no incluye coordenadas GPS ni fecha EXIF (habitual en fotos reenviadas).
                      No inventamos ubicaciones; podés indicar el lugar manualmente si lo deseás.
                    </div>
                  </div>
                )}

                <div className="field-group">
                  <label htmlFor="obs-date">
                    Fecha y hora de observación{' '}
                    {draftExif?.hasExifDate && (
                      <span className="badge badge-sync-respaldado">Sugerida desde EXIF</span>
                    )}
                  </label>
                  <input
                    id="obs-date"
                    type="datetime-local"
                    className="input-text"
                    value={draftObservedAt}
                    onChange={(e) => setDraftObservedAt(e.target.value)}
                  />
                </div>

                <div className="field-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label htmlFor="obs-loc">
                      Ubicación aproximada (privada y opcional){' '}
                      {draftExif?.hasExifGps && draftLocationAccepted && (
                        <span className="badge badge-sync-respaldado">Sugerida desde GPS EXIF</span>
                      )}
                    </label>
                    {draftLocationLabel && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '3px 9px', fontSize: '0.75rem' }}
                        onClick={handleDiscardExifLocation}
                      >
                        <Trash2 size={12} /> Descartar ubicación
                      </button>
                    )}
                  </div>
                  <input
                    id="obs-loc"
                    type="text"
                    className="input-text"
                    value={draftLocationLabel}
                    onChange={(e) => {
                      setDraftLocationLabel(e.target.value);
                      setDraftLocationAccepted(Boolean(e.target.value.trim()));
                    }}
                    placeholder="Opcional (ej.: Fondo del jardín, Lago Puelo). Nunca se hace pública."
                  />
                  <span className="field-hint">
                    🔒 Privacidad EXIF: las coordenadas exactas nunca se filtran en enlaces compartidos ni redes.
                  </span>
                </div>

                <div className="field-group">
                  <label htmlFor="obs-note">Nota personal de campo (opcional)</label>
                  <textarea
                    id="obs-note"
                    rows={3}
                    className="input-textarea"
                    value={draftPersonalNote}
                    onChange={(e) => setDraftPersonalNote(e.target.value)}
                    placeholder="Ej.: Estaba buscando lombrices cerca del limonero después de la lluvia…"
                  />
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void handleSaveDraftAndProceed()}
                  >
                    {isOnline ? (
                      <>
                        <Sparkles size={18} /> Confirmar foto e identificar ave
                      </>
                    ) : (
                      <>
                        <CloudOff size={18} /> Guardar borrador local (sin conexión)
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ========================================================================
          Vista 6: Identificación asistida por IA y Confirmación — F03, F04, F05, CA04, CA06
         ======================================================================== */}
      {screen === 'identify_review' && activeSightingForId && activeNotebook && (
        <section className="notebook-page">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 className="serif-heading" style={{ fontSize: '1.9rem', margin: 0 }}>
              Identificación del ave
            </h2>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void handleKeepAsPendingIdentification()}
            >
              Guardar en Pendientes por ahora
            </button>
          </div>

          {!idResponse ? (
            <div className="callout-box" style={{ padding: 24, textAlign: 'center' }}>
              <Sparkles size={28} color="#38573E" style={{ marginBottom: 8 }} />
              <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                Observando plumaje, pico y proporciones de tu fotografía…
              </div>
              <div style={{ color: 'var(--ink-secondary)', fontSize: '0.9rem', marginTop: 4 }}>
                Contrastando con el catálogo taxonómico de aves de Argentina (eBird).
              </div>
            </div>
          ) : (
            <div>
              {/* Aviso de especie ya observada en el cuaderno (F05, CA06) */}
              {duplicateSpeciesPrompt && (
                <div
                  className="callout-box warning"
                  role="alertdialog"
                  aria-label="Especie ya registrada en este cuaderno"
                  style={{ marginBottom: 18, padding: 16 }}
                >
                  <h3 className="serif-heading" style={{ fontSize: '1.5rem', margin: '0 0 6px' }}>
                    Ya registraste un{' '}
                    {findSpeciesByTaxonId(duplicateSpeciesPrompt.taxonId)?.commonNameAr.toLowerCase()}{' '}
                    en este cuaderno. ¿Querés guardar otro avistamiento?
                  </h3>
                  <p style={{ margin: '0 0 12px', fontSize: '0.92rem' }}>
                    Sumaremos esta fotografía, su fecha y tu nota al historial de la lámina existente de{' '}
                    <strong>{findSpeciesByTaxonId(duplicateSpeciesPrompt.taxonId)?.commonNameAr}</strong>,
                    sin duplicar la ficha ni generar otra ilustración innecesaria (CA06).
                  </p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={isGeneratingPlate}
                      onClick={() =>
                        void finalizeConfirmedSpeciesRegistration(
                          duplicateSpeciesPrompt.taxonId,
                          duplicateSpeciesPrompt.existingSheet
                        )
                      }
                    >
                      <Check size={17} /> Sí, guardar otro avistamiento en su historial
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        // Cancelar sin alterar el registro previo (F05.4)
                        setPersisted((prev) => ({
                          ...prev,
                          sightings: prev.sightings.filter((s) => s.id !== activeSightingForId.id),
                        }));
                        setDuplicateSpeciesPrompt(null);
                        setScreen('notebook_detail');
                        showToast('Registro cancelado sin modificar la lámina anterior.');
                      }}
                    >
                      Cancelar sin guardar
                    </button>
                  </div>
                </div>
              )}

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: 20,
                  alignItems: 'start',
                }}
              >
                <div>
                  <div className="plate-frame" style={{ maxHeight: 300 }}>
                    <img
                      src={activeSightingForId.sanitizedPhotoDataUrl}
                      alt="Fotografía analizada"
                    />
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', marginTop: 8 }}>
                    Referencia taxonómica: {idResponse.taxonomicSource}
                  </div>
                </div>

                <div>
                  {/* Indicador claro y honesto del nivel de seguridad (F03, CA04) */}
                  {idResponse.confidenceLevel === 'alta' && (
                    <div className="callout-box" style={{ marginBottom: 14 }}>
                      <div style={{ fontWeight: 700, color: '#28402C', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle2 size={18} /> Seguridad alta · Especie identificada con claridad
                      </div>
                      <p style={{ margin: '6px 0 0', fontSize: '0.92rem' }}>{idResponse.explanation}</p>
                    </div>
                  )}

                  {idResponse.confidenceLevel === 'media' && (
                    <div className="callout-box warning" style={{ marginBottom: 14 }}>
                      <div style={{ fontWeight: 700, color: '#7A5416', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <HelpCircle size={18} /> Seguridad moderada · Requiere tu confirmación
                      </div>
                      <p style={{ margin: '6px 0 6px', fontSize: '0.92rem' }}>{idResponse.explanation}</p>
                      {idResponse.uncertaintyReason && (
                        <div style={{ fontSize: '0.86rem', color: '#5A4010' }}>
                          <strong>Motivo de la duda:</strong> {idResponse.uncertaintyReason}
                        </div>
                      )}
                    </div>
                  )}

                  {idResponse.confidenceLevel === 'insuficiente' && (
                    <div className="callout-box terracotta" style={{ marginBottom: 14 }}>
                      <div style={{ fontWeight: 700, color: '#8E3B24', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AlertTriangle size={18} /> Evidencia visual insuficiente · No adjudicamos una especie al azar
                      </div>
                      <p style={{ margin: '6px 0 6px', fontSize: '0.92rem' }}>{idResponse.explanation}</p>
                      {idResponse.uncertaintyReason && (
                        <div style={{ fontSize: '0.86rem' }}>{idResponse.uncertaintyReason}</div>
                      )}
                      <div style={{ marginTop: 10 }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => void handleKeepAsPendingIdentification()}
                        >
                          Guardar como «Pendiente de identificar»
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Tarjetas de especies candidatas */}
                  {idResponse.candidates.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontWeight: 700, fontSize: '0.92rem', display: 'block', marginBottom: 8 }}>
                        {idResponse.confidenceLevel === 'alta'
                          ? 'Especie propuesta y alternativas cercanas:'
                          : 'Especies candidatas sugeridas para comparar:'}
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {idResponse.candidates.map((cand) => {
                          const isSelected = selectedTaxonId === cand.taxonId;
                          return (
                            <div
                              key={cand.taxonId}
                              className={`style-option-card ${isSelected ? 'selected' : ''}`}
                              onClick={() => setSelectedTaxonId(cand.taxonId)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => e.key === 'Enter' && setSelectedTaxonId(cand.taxonId)}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                  <strong style={{ fontSize: '1.08rem' }}>{cand.commonNameAr}</strong>{' '}
                                  <span className="scientific-name">({cand.scientificName})</span>
                                </div>
                                <span className="badge badge-sync-respaldado">{cand.confidenceBand}</span>
                              </div>
                              <div style={{ fontSize: '0.86rem', color: 'var(--ink-secondary)', marginTop: 4 }}>
                                {cand.reasoning}
                              </div>
                              {cand.keyVisibleTraits.length > 0 && (
                                <div style={{ fontSize: '0.78rem', color: 'var(--ink-muted)', marginTop: 4 }}>
                                  Rasgos: {cand.keyVisibleTraits.join(' · ')}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Selector manual del catálogo argentino por si Valeria quiere corregir la especie antes de crear la lámina */}
                  <div className="field-group">
                    <label htmlFor="manual-catalog-select">
                      ¿Reconociste otra especie? Podés elegirla o corregirla manualmente:
                    </label>
                    <input
                      type="text"
                      className="input-text"
                      placeholder="Buscar por nombre común o científico (ej.: Cardenal, Calandria, Hornero)…"
                      value={manualSearchQuery}
                      onChange={(e) => setManualSearchQuery(e.target.value)}
                      style={{ marginBottom: 6 }}
                    />
                    <select
                      id="manual-catalog-select"
                      className="input-select"
                      value={selectedTaxonId || ''}
                      onChange={(e) => setSelectedTaxonId(e.target.value || null)}
                    >
                      <option value="">— Seleccionar especie del catálogo argentino —</option>
                      {searchSpeciesCatalog(manualSearchQuery).map((sp) => (
                        <option key={sp.taxonId} value={sp.taxonId}>
                          {sp.commonNameAr} ({sp.scientificName}) — {sp.family}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                    {selectedTaxonId && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={isGeneratingPlate}
                        onClick={() => void handleInitiateSpeciesConfirmation(selectedTaxonId)}
                      >
                        <Sparkles size={18} /> Confirmar{' '}
                        {findSpeciesByTaxonId(selectedTaxonId)?.commonNameAr} e incorporar al cuaderno
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void handleKeepAsPendingIdentification()}
                    >
                      Dejar como «Pendiente de identificar»
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ========================================================================
          Vista 7: Ficha de especie / Lámina abierta e Historial — F04, F06, CA05, CA07, CA08
         ======================================================================== */}
      {screen === 'sheet_detail' && activeSheet && activeNotebook && (
        <section className={`notebook-page style-${activeNotebook.style}`}>
          {(() => {
            const species = findSpeciesByTaxonId(activeSheet.taxonId);
            if (!species) return null;

            const activeIllustration = persisted.illustrations.find(
              (i) => i.id === activeSheet.activeIllustrationId
            );
            const illustrationUrl =
              activeIllustration?.imageUrl ||
              (activeNotebook.style === 'acuarela_naturalista'
                ? species.defaultWatercolorPlate
                : species.defaultGraphitePlate);

            const sheetSightings = persisted.sightings
              .filter(
                (s) =>
                  s.notebookId === activeNotebook.id &&
                  s.taxonId === activeSheet.taxonId &&
                  s.identificationStatus === 'identificado'
              )
              .sort((a, b) => b.observedAt.localeCompare(a.observedAt));

            const primarySighting = sheetSightings[0];

            return (
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 10,
                    marginBottom: 16,
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setScreen('notebook_detail')}
                  >
                    <ArrowLeft size={16} /> Volver al índice de «{activeNotebook.title}»
                  </button>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={isGeneratingPlate}
                      onClick={() => void handleRegenerateSheetIllustration(activeSheet)}
                    >
                      <RefreshCw size={16} /> Pedir otra versión de la ilustración
                    </button>

                    {primarySighting && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() =>
                          setShareSightingTarget({
                            sighting: primarySighting,
                            sheet: activeSheet,
                          })
                        }
                      >
                        <Share2 size={16} /> Compartir avistamiento
                      </button>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
                    gap: 24,
                    alignItems: 'start',
                  }}
                >
                  {/* Lámina ilustrada principal */}
                  <div>
                    <div className={`plate-frame style-${activeNotebook.style}`}>
                      <img src={illustrationUrl} alt={`Ilustración de ${species.commonNameAr}`} />
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: 8,
                        fontSize: '0.82rem',
                        color: 'var(--ink-muted)',
                      }}
                    >
                      <span>
                        {activeIllustration?.variationNote ||
                          (activeNotebook.style === 'acuarela_naturalista'
                            ? 'Lámina en Acuarela Naturalista'
                            : 'Apunte en Lápiz Grafito')}
                      </span>
                      {activeIllustration && <span>Versión #{activeIllustration.version}</span>}
                    </div>
                  </div>

                  {/* Información naturalista concisa y verídica */}
                  <div>
                    <span className="badge badge-sync-respaldado">{species.family}</span>
                    <h2 className="serif-heading" style={{ fontSize: '2.35rem', margin: '6px 0 2px' }}>
                      {species.commonNameAr}
                    </h2>
                    <div className="scientific-name" style={{ fontSize: '1.35rem', marginBottom: 8 }}>
                      {species.scientificName}
                    </div>
                    {species.alternativeNames.length > 0 && (
                      <div style={{ fontSize: '0.86rem', color: 'var(--ink-muted)', marginBottom: 12 }}>
                        Otros nombres en Argentina: {species.alternativeNames.join(', ')}
                      </div>
                    )}

                    <div style={{ fontSize: '0.9rem', color: 'var(--ink-secondary)', marginBottom: 14 }}>
                      📅 Primer avistamiento en este cuaderno:{' '}
                      <strong>{formatShortArgentineDate(activeSheet.firstObservedAt)}</strong>
                      {activeSheet.generalPlace && (
                        <>
                          {' '}
                          · 📍 Lugar general: <strong>{activeSheet.generalPlace}</strong>
                        </>
                      )}
                    </div>

                    <div className="callout-box" style={{ marginBottom: 10 }}>
                      <strong>Rasgos para reconocerla:</strong> {species.identificationTraits}
                    </div>
                    <div className="callout-box" style={{ marginBottom: 10 }}>
                      <strong>Comportamiento típico:</strong> {species.typicalBehavior}
                    </div>
                    <div className="callout-box" style={{ marginBottom: 10 }}>
                      <strong>Alimentación y hábitat:</strong> {species.dietAndHabitat}
                    </div>
                    <div className="callout-box">
                      <strong>Distribución general:</strong> {species.generalDistribution}
                    </div>
                  </div>
                </div>

                {/* Historial de avistamientos reales de Valeria en esta lámina (F05, F06, CA06, CA07) */}
                <div style={{ marginTop: 28, borderTop: '1px solid var(--paper-edge)', paddingTop: 20 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 10,
                      marginBottom: 14,
                    }}
                  >
                    <div>
                      <h3 className="serif-heading" style={{ fontSize: '1.65rem', margin: 0 }}>
                        Mis avistamientos de {species.commonNameAr} ({sheetSightings.length})
                      </h3>
                      <span style={{ fontSize: '0.88rem', color: 'var(--ink-secondary)' }}>
                        Tus fotografías originales, fechas, lugares privados y notas personales en este cuaderno.
                      </span>
                    </div>

                    <button type="button" className="btn btn-secondary" onClick={startAddSightingFlow}>
                      <Plus size={16} /> Agregar otro avistamiento
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {sheetSightings.map((s, idx) => {
                      const isEditing = editingSightingId === s.id;
                      return (
                        <div
                          key={s.id}
                          style={{
                            background: 'var(--paper-inset)',
                            border: '1px solid var(--paper-edge)',
                            borderRadius: 12,
                            padding: 16,
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                            gap: 16,
                            alignItems: 'start',
                          }}
                        >
                          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                            <img
                              src={s.sanitizedPhotoDataUrl}
                              alt={`Fotografía original de ${species.commonNameAr}`}
                              style={{
                                width: 110,
                                height: 110,
                                objectFit: 'cover',
                                borderRadius: 10,
                                border: '2px solid #FFFDF9',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                              }}
                            />
                            <div>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                                  Avistamiento #{sheetSightings.length - idx}
                                </span>
                                {renderSyncBadge(s.syncStatus)}
                              </div>
                              <div style={{ fontSize: '0.86rem', color: 'var(--ink-secondary)', marginTop: 4 }}>
                                🗓️ {formatShortArgentineDate(s.observedAt)}
                              </div>
                              {s.privateLocation?.label && (
                                <div style={{ fontSize: '0.84rem', color: 'var(--ink-muted)', marginTop: 2 }}>
                                  🔒 Ubicación privada: {s.privateLocation.label}
                                </div>
                              )}
                            </div>
                          </div>

                          <div>
                            {isEditing ? (
                              <div>
                                <div className="field-group">
                                  <label>Nota personal</label>
                                  <textarea
                                    rows={2}
                                    className="input-textarea"
                                    value={editNoteText}
                                    onChange={(e) => setEditNoteText(e.target.value)}
                                  />
                                </div>
                                <div className="field-group">
                                  <label>Fecha observada</label>
                                  <input
                                    type="datetime-local"
                                    className="input-text"
                                    value={editObservedAt}
                                    onChange={(e) => setEditObservedAt(e.target.value)}
                                  />
                                </div>
                                <div className="field-group">
                                  <label>Ubicación privada</label>
                                  <input
                                    type="text"
                                    className="input-text"
                                    value={editLocationText}
                                    onChange={(e) => setEditLocationText(e.target.value)}
                                  />
                                </div>
                                <div className="field-group">
                                  <label>Corregir especie identificada</label>
                                  <select
                                    className="input-select"
                                    value={editTaxonId}
                                    onChange={(e) => setEditTaxonId(e.target.value)}
                                  >
                                    {ARGENTINA_BIRDS_CATALOG.map((sp) => (
                                      <option key={sp.taxonId} value={sp.taxonId}>
                                        {sp.commonNameAr} ({sp.scientificName})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => void handleSaveSightingEdits(s)}
                                  >
                                    <Check size={15} /> Guardar cambios
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setEditingSightingId(null)}
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div>
                                {s.personalNote ? (
                                  <div className="handwritten-note" style={{ marginBottom: 10 }}>
                                    «{s.personalNote}»
                                  </div>
                                ) : (
                                  <div style={{ fontSize: '0.86rem', color: 'var(--ink-muted)', marginBottom: 10 }}>
                                    Sin nota personal en este avistamiento.
                                  </div>
                                )}

                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                                    onClick={() => startEditingSighting(s)}
                                  >
                                    <Edit3 size={14} /> Editar nota / fecha / especie
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                                    onClick={() =>
                                      setShareSightingTarget({
                                        sighting: s,
                                        sheet: activeSheet,
                                      })
                                    }
                                  >
                                    <Share2 size={14} /> Compartir este avistamiento
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}
        </section>
      )}

      {/* ========================================================================
          Vista 8: Centro de Pendientes, Sincronización y Recuperación — F06, CA10, CA11, CA16
         ======================================================================== */}
      {screen === 'pending_center' && (
        <section className="notebook-page">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 className="serif-heading" style={{ fontSize: '1.95rem', margin: 0 }}>
                Respaldo en Google, Pendientes y Recuperación
              </h2>
              <span style={{ fontSize: '0.9rem', color: 'var(--ink-secondary)' }}>
                Cuenta vinculada: <strong>{persisted.user.email}</strong>
              </span>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => setScreen('library')}>
              <ArrowLeft size={16} /> Volver a cuadernos
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
              gap: 16,
              marginBottom: 20,
            }}
          >
            <div className="callout-box">
              <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Cloud size={17} /> Cola de sincronización sin conexión (CA10)
              </div>
              <p style={{ fontSize: '0.86rem', margin: '0 0 10px' }}>
                Un avistamiento solo se marca como <strong>Respaldado</strong> cuando su archivo
                fotográfico original y sus notas llegaron a la nube. Los reintentos son idempotentes y no
                duplican fichas.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void syncAllPendingSightings()}
                >
                  <UploadCloud size={16} /> Sincronizar pendientes ahora
                </button>
                <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={simulateUploadFailure}
                    onChange={(e) => setSimulateUploadFailure(e.target.checked)}
                  />
                  Simular falla transitoria de subida (estado «error»)
                </label>
              </div>
            </div>

            <div className="callout-box">
              <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Smartphone size={17} /> Cambiar de teléfono Android (CA11)
              </div>
              <p style={{ fontSize: '0.86rem', margin: '0 0 10px' }}>
                Podés comprobar que al cambiar de teléfono e iniciar sesión con tu cuenta de Google
                reaparecen todos los cuadernos, láminas, fotos e historias confirmados como respaldados.
              </p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void handleSimulatePhoneSwitchRestore()}
              >
                <RefreshCw size={16} /> Simular cambio de celular y restaurar desde Google
              </button>
            </div>
          </div>

          {/* Listado completo de avistamientos y su estado dual (Identificación vs Sincronización) */}
          <h3 className="serif-heading" style={{ fontSize: '1.5rem', marginBottom: 10 }}>
            Estado de todos los registros ({persisted.sightings.length})
          </h3>
          {persisted.sightings.length === 0 ? (
            <p style={{ color: 'var(--ink-secondary)' }}>Todavía no hay fotografías cargadas.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {persisted.sightings.map((s) => {
                const nb = persisted.notebooks.find((n) => n.id === s.notebookId);
                const sp = findSpeciesByTaxonId(s.taxonId);
                return (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 12,
                      padding: 12,
                      background: 'var(--paper-inset)',
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <img
                        src={s.sanitizedPhotoDataUrl}
                        alt="Miniatura"
                        style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }}
                      />
                      <div>
                        <div style={{ fontWeight: 700 }}>
                          {sp ? sp.commonNameAr : 'Especie pendiente de identificar'}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--ink-secondary)' }}>
                          Cuaderno: {nb?.title || 'General'} · {formatShortArgentineDate(s.observedAt)}
                        </div>
                        {s.lastSyncError && (
                          <div style={{ fontSize: '0.78rem', color: '#8E3B24' }}>
                            ⚠️ {s.lastSyncError}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="badge badge-sync-respaldado">
                        Estado IA: {s.identificationStatus}
                      </span>
                      {renderSyncBadge(s.syncStatus)}
                      {s.identificationStatus !== 'identificado' && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                          onClick={() => {
                            if (nb) setActiveNotebookId(nb.id);
                            void runIdentificationForSighting(s, persisted, 'auto');
                          }}
                        >
                          <Sparkles size={14} /> Identificar
                        </button>
                      )}
                      {s.syncStatus !== 'respaldado' && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                          onClick={() => void syncSingleSightingWithFeedback(s, persisted)}
                        >
                          <UploadCloud size={14} /> Reintentar subida
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Métricas de control de costos de IA (§7.4, CA16) */}
          {(() => {
            const metrics = getAIConsumptionMetrics();
            return (
              <div className="callout-box" style={{ marginTop: 20, fontSize: '0.84rem' }}>
                <strong>Control de costos y uso eficiente de IA (§7.4, CA16):</strong>{' '}
                Identificaciones realizadas: {metrics.identificationsExecuted} · Llamadas evitadas por
                caché idempotente: {metrics.identificationsPreventedByCache} · Láminas nuevas generadas:{' '}
                {metrics.illustrationsGenerated} · Láminas reutilizadas por coincidencia de especie y
                estilo: {metrics.illustrationsReusedFromCatalog}.
              </div>
            );
          })()}
        </section>
      )}

      {/* Modal F07: Compartir avistamiento individual */}
      {shareSightingTarget && activeNotebook && (
        <ShareSightingModal
          notebook={activeNotebook}
          species={
            findSpeciesByTaxonId(shareSightingTarget.sheet.taxonId) || ARGENTINA_BIRDS_CATALOG[0]
          }
          sighting={shareSightingTarget.sighting}
          illustrationUrl={
            persisted.illustrations.find(
              (i) => i.id === shareSightingTarget.sheet.activeIllustrationId
            )?.imageUrl ||
            (activeNotebook.style === 'acuarela_naturalista'
              ? findSpeciesByTaxonId(shareSightingTarget.sheet.taxonId)?.defaultWatercolorPlate ||
                '/plates/acuarela_hornero.jpg'
              : findSpeciesByTaxonId(shareSightingTarget.sheet.taxonId)?.defaultGraphitePlate ||
                '/plates/grafito_hornero.jpg')
          }
          style={activeNotebook.style}
          onClose={() => setShareSightingTarget(null)}
        />
      )}

      {/* Modal F08: Compartir cuaderno completo */}
      {showShareNotebookModal && activeNotebook && (
        <ShareNotebookModal
          notebook={activeNotebook}
          onActivateOrUpdateShare={handleActivateOrUpdateNotebookShare}
          onRevokeShare={handleRevokeNotebookShare}
          onOpenGuestPreview={(token) => {
            setShowShareNotebookModal(false);
            setGuestShareToken(token);
          }}
          onClose={() => setShowShareNotebookModal(false)}
        />
      )}
    </div>
  );
};
