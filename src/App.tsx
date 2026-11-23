import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cloud,
  CloudOff,
  Compass,
  Download,
  Edit3,
  Eye,
  FolderOpen,
  Globe,
  HelpCircle,
  Leaf,
  Loader2,
  LogOut,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sprout,
  Trash2,
  Upload,
  UploadCloud,
  Wifi,
  WifiOff,
  X,
  ZoomIn,
} from 'lucide-react';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { ImageLightbox, LightboxItem } from './components/ImageLightbox';
import { PublicNotebookView } from './components/PublicNotebookView';
import { ShareNotebookModal } from './components/ShareNotebookModal';
import { ShareSightingModal } from './components/ShareSightingModal';
import { SpeciesComparisonModal } from './components/SpeciesComparisonModal';
import { SpeciesReferenceThumb } from './components/SpeciesReferenceThumb';
import {
  ARGENTINA_BIRDS_CATALOG,
  findSpeciesByTaxonId,
  getAllKnownSpecies,
  getCustomSpeciesList,
  getSpeciesGroup,
  searchSpeciesCatalog,
} from './data/argentinaBirdsCatalog';
import {
  BackendAiHealth,
  checkBackendAiHealth,
  generateOrReuseIllustration,
  getAIConsumptionMetrics,
  IdentificationRequest,
  IdentificationResponse,
  identifyBirdFromPhoto,
} from './services/aiBirdService';
import {
  fetchCurrentAuthSession,
  logoutServerSession,
  ServerAuthStatus,
} from './services/authClientService';
import {
  computeBlobSha256,
  extractExifSuggestions,
  sanitizeImageStrippingExif,
  toLocalDateTimeInputValue,
} from './services/exifService';
import { SAMPLE_TEST_PHOTOS, SampleTestPhoto } from './services/sampleGalleryPhotos';
import {
  fetchReferencePhotosForSpecies,
  searchLiveBirdsInNaturalist,
} from './services/speciesReferenceService';
import {
  AppPersistedState,
  exportFullBackupJson,
  formatShortArgentineDate,
  importFullBackupJson,
  loadLocalDeviceState,
  publishOrUpdateSanitizedNotebookProjection,
  rehydrateSightingPhotosFromIndexedDb,
  restoreFromGoogleCloudOnNewDevice,
  revokePublicNotebookShareToken,
  saveLocalDeviceState,
  savePhotoBinaryToIndexedDb,
  syncSightingAndNotebookToCloud,
} from './services/storageAndSyncService';
import {
  AICandidate,
  ExifSuggestions,
  ILLUSTRATION_STYLE_META,
  IdentificationStatus,
  IllustrationStyle,
  Notebook,
  NotebookSpeciesSheet,
  NotebookType,
  ORGANISM_GROUP_META,
  ORGANISM_GROUPS_ORDER,
  OrganismGroup,
  Sighting,
  SpeciesCatalogEntry,
  SpeciesReferencePhoto,
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

type SheetVisualMode = 'ambas' | 'lamina' | 'foto';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function formatIdentificationStatusLabel(status: IdentificationStatus): string {
  switch (status) {
    case 'identificado':
      return 'Identificada';
    case 'requiere_confirmacion':
      return 'Esperando tu confirmación';
    case 'error_procesamiento':
      return 'Reintentar análisis';
    case 'pendiente_identificacion':
    default:
      return 'Pendiente de identificar';
  }
}

export const App: React.FC = () => {
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

  // Estado de conectividad, autenticación Google real y backend IA
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [aiHealth, setAiHealth] = useState<BackendAiHealth | null>(null);
  const [serverAuthStatus, setServerAuthStatus] = useState<ServerAuthStatus | null>(null);
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const err = params.get('auth_error');
    const email = params.get('auth_email');
    if (err === 'not_authorized') {
      return email
        ? `Acceso restringido: la cuenta ${email} no está autorizada para acceder a Bioma.`
        : 'Acceso restringido: esta cuenta de Google no está autorizada para acceder a Bioma.';
    }
    if (err === 'csrf_failed' || err === 'invalid_token') {
      return 'No pudimos verificar tu inicio de sesión con Google. Intentá nuevamente.';
    }
    return null;
  });
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
  const [notebookSearchQuery, setNotebookSearchQuery] = useState<string>('');
  const [notebookGroupFilter, setNotebookGroupFilter] = useState<OrganismGroup | 'todos'>('todos');

  // Vista de lámina: modo visual protagonista + ficha de campo desplegable
  const [sheetVisualMode, setSheetVisualMode] = useState<SheetVisualMode>('ambas');
  const [showFieldNotesAccordion, setShowFieldNotesAccordion] = useState<boolean>(false);
  const [sheetReferencePhotos, setSheetReferencePhotos] = useState<SpeciesReferencePhoto[]>([]);

  // Modales: Lightbox, Comparador visual, Compartir, Confirmación de borrado
  const [lightboxState, setLightboxState] = useState<{
    items: LightboxItem[];
    index: number;
  } | null>(null);
  const [compareTarget, setCompareTarget] = useState<{
    species: SpeciesCatalogEntry;
    candidate?: AICandidate;
  } | null>(null);
  const [shareSightingTarget, setShareSightingTarget] = useState<{
    sighting: Sighting;
    sheet: NotebookSpeciesSheet;
  } | null>(null);
  const [showShareNotebookModal, setShowShareNotebookModal] = useState<boolean>(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'sighting' | 'notebook';
    id: string;
    label: string;
  } | null>(null);

  // Formulario de creación/edición de cuaderno (Muralismo de fauna autóctona por defecto)
  const [nbTitle, setNbTitle] = useState<string>('Vida de mi jardín');
  const [nbType, setNbType] = useState<NotebookType>('jardin');
  const [nbStyle, setNbStyle] = useState<IllustrationStyle>('muralismo_fauna');
  const [nbLocation, setNbLocation] = useState<string>('Tigre, Buenos Aires');
  const [nbPeriod, setNbPeriod] = useState<string>('Primavera 2026');
  const [nbDescription, setNbDescription] = useState<string>(
    'Mariposas, aves, abejas, insectos y pequeños vecinos que visitan el jardín.'
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

  // Flujo F03 / F04 / F05: Identificación por IA, comparación visual y confirmación
  const [activeSightingForId, setActiveSightingForId] = useState<Sighting | null>(null);
  const [idResponse, setIdResponse] = useState<IdentificationResponse | null>(null);
  const [selectedTaxonId, setSelectedTaxonId] = useState<string | null>(null);
  const [manualSearchQuery, setManualSearchQuery] = useState<string>('');
  const [manualGroupFilter, setManualGroupFilter] = useState<OrganismGroup | 'todos'>('todos');
  const [liveInatResults, setLiveInatResults] = useState<SpeciesCatalogEntry[]>([]);
  const [isSearchingLiveInat, setIsSearchingLiveInat] = useState<boolean>(false);
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

  // PWA instalable (sin barra de direcciones) y respaldo portátil JSON
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [isStandaloneApp, setIsStandaloneApp] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      Boolean((navigator as { standalone?: boolean }).standalone)
    );
  });
  const backupImportInputRef = useRef<HTMLInputElement | null>(null);
  const prevScreenBeforeSettingsRef = useRef<ScreenMode>('library');

  // Persistir cambios locales automáticamente
  useEffect(() => {
    saveLocalDeviceState(persisted);
  }, [persisted]);

  // Rehidratar fotografías desde IndexedDB si localStorage guardó estado liviano
  useEffect(() => {
    let active = true;
    void rehydrateSightingPhotosFromIndexedDb(persisted.sightings).then((hydrated) => {
      if (active && hydrated !== persisted.sightings) {
        setPersisted((prev) => ({ ...prev, sightings: hydrated }));
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Capturar evento de instalación PWA nativa en Android Chrome / Edge
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstallPromptEvent(null);
      setIsStandaloneApp(true);
      showToast('¡Bioma quedó instalada en tu pantalla de inicio!');
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  // Atajo PWA: /?action=add abre directo "Registrar ave"
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'add' && persisted.user && persisted.notebooks.length > 0) {
      startAddSightingFlow(persisted.notebooks[0].id);
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, []);

  // ============================================================================
  // Navegación con botón "Atrás" de Android / navegador: nunca saca de la app
  // Empuja entradas reales durante gestos de usuario (cumple History Manipulation Intervention de Chrome)
  // ============================================================================
  const historyDepthRef = useRef<number>(1);
  const pushHistoryLayer = (tag: string) => {
    if (typeof window === 'undefined') return;
    historyDepthRef.current += 1;
    window.history.pushState(
      { birdySentinel: 'layer', tag, depth: historyDepthRef.current },
      ''
    );
  };

  const backStateRef = useRef({
    screen,
    guestShareToken,
    lightboxState,
    compareTarget,
    deleteConfirm,
    shareSightingTarget,
    showShareNotebookModal,
    duplicateSpeciesPrompt,
    editingSightingId,
    editingNotebookMeta,
    activeNotebookId,
    hasNotebooks: persisted.notebooks.length > 0,
  });
  backStateRef.current = {
    screen,
    guestShareToken,
    lightboxState,
    compareTarget,
    deleteConfirm,
    shareSightingTarget,
    showShareNotebookModal,
    duplicateSpeciesPrompt,
    editingSightingId,
    editingNotebookMeta,
    activeNotebookId,
    hasNotebooks: persisted.notebooks.length > 0,
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.history.state?.birdySentinel) {
      window.history.replaceState({ birdySentinel: 'base', depth: 0 }, '');
      window.history.pushState({ birdySentinel: 'active', depth: 1 }, '');
      historyDepthRef.current = 1;
    }

    const handleHardwareBack = () => {
      const cur = backStateRef.current;

      if (cur.guestShareToken) {
        return;
      }

      historyDepthRef.current = Math.max(0, historyDepthRef.current - 1);

      // Si llegamos al piso centinela (depth === 0), rearmar solo esa capa base para no salir de la app
      const ensureBaseGuard = () => {
        if (historyDepthRef.current === 0) {
          historyDepthRef.current = 1;
          window.history.pushState({ birdySentinel: 'active', depth: 1 }, '');
        }
      };

      // 1. Prioridad máxima: cerrar visores, modales y menús abiertos
      if (cur.lightboxState) {
        setLightboxState(null);
        ensureBaseGuard();
        return;
      }
      if (cur.compareTarget) {
        setCompareTarget(null);
        ensureBaseGuard();
        return;
      }
      if (cur.deleteConfirm) {
        setDeleteConfirm(null);
        ensureBaseGuard();
        return;
      }
      if (cur.shareSightingTarget) {
        setShareSightingTarget(null);
        ensureBaseGuard();
        return;
      }
      if (cur.showShareNotebookModal) {
        setShowShareNotebookModal(false);
        ensureBaseGuard();
        return;
      }
      if (cur.duplicateSpeciesPrompt) {
        setDuplicateSpeciesPrompt(null);
        ensureBaseGuard();
        return;
      }
      if (cur.editingSightingId) {
        setEditingSightingId(null);
        ensureBaseGuard();
        return;
      }
      if (cur.editingNotebookMeta) {
        setEditingNotebookMeta(false);
        ensureBaseGuard();
        return;
      }

      // 2. Navegar hacia la pantalla lógica anterior dentro de la app
      switch (cur.screen) {
        case 'identify_review':
          setScreen(cur.activeNotebookId ? 'notebook_detail' : 'library');
          ensureBaseGuard();
          return;
        case 'add_sighting':
          setScreen(cur.activeNotebookId ? 'notebook_detail' : 'library');
          ensureBaseGuard();
          return;
        case 'sheet_detail':
          setScreen(cur.activeNotebookId ? 'notebook_detail' : 'library');
          ensureBaseGuard();
          return;
        case 'create_notebook':
          setScreen(cur.hasNotebooks ? 'library' : 'onboarding_first_notebook');
          ensureBaseGuard();
          return;
        case 'pending_center':
          setScreen(
            prevScreenBeforeSettingsRef.current !== 'pending_center'
              ? prevScreenBeforeSettingsRef.current
              : 'library'
          );
          ensureBaseGuard();
          return;
        case 'notebook_detail':
          setScreen('library');
          ensureBaseGuard();
          return;
        case 'library':
        case 'onboarding_first_notebook':
        case 'welcome':
        default:
          ensureBaseGuard();
          showToast('Ya estás en el inicio de Bioma.');
      }
    };

    window.addEventListener('popstate', handleHardwareBack);
    return () => window.removeEventListener('popstate', handleHardwareBack);
  }, []);

  const openPendingSettings = () => {
    if (screen !== 'pending_center') {
      prevScreenBeforeSettingsRef.current = screen;
      pushHistoryLayer('pending_center');
    }
    setScreen('pending_center');
  };

  const handleTriggerPwaInstall = async () => {
    if (!installPromptEvent) return;
    try {
      await installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setInstallPromptEvent(null);
      }
    } catch {
      // Ignorar si el navegador canceló el diálogo
    }
  };

  const handleExportBackupFile = async () => {
    try {
      const json = await exportFullBackupJson(persisted);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bioma-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Copia de seguridad descargada (.json).');
    } catch {
      showToast('No pudimos generar el archivo de respaldo.');
    }
  };

  const handleImportBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const restored = await importFullBackupJson(text);
      setPersisted(restored);
      setActiveNotebookId(restored.notebooks[0]?.id || null);
      setScreen(restored.notebooks.length > 0 ? 'library' : 'onboarding_first_notebook');
      showToast(
        `Respaldo importado: ${restored.notebooks.length} cuaderno(s) y ${restored.sightings.length} avistamiento(s).`
      );
    } catch {
      showToast('El archivo seleccionado no es un respaldo válido de Bioma.');
    } finally {
      e.target.value = '';
    }
  };

  // Verificar estado del backend IA (Google Gemini) y sesión Google real
  const refreshAiHealth = async () => {
    const status = await checkBackendAiHealth();
    setAiHealth(status);
    if (status.auth) {
      setServerAuthStatus(status.auth);
    }
  };

  useEffect(() => {
    void refreshAiHealth();
  }, []);

  // Sincronizar sesión real de Google (cookie HttpOnly) y limpiar parámetros ?auth_error=
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.search.includes('auth_error=')) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }

    let active = true;
    void fetchCurrentAuthSession().then((session) => {
      if (!active || !session) return;
      setServerAuthStatus(session.auth);

      if (session.authenticated && session.user) {
        const verifiedUser: UserProfile = {
          uid: session.user.uid,
          displayName: session.user.displayName,
          email: session.user.email,
          photoURL: session.user.photoURL,
          reducedMotion,
        };
        setAuthErrorMessage(null);
        setPersisted((prev) => ({ ...prev, user: verifiedUser }));
        setScreen((cur) => {
          if (cur !== 'welcome') return cur;
          return persisted.notebooks.length === 0 ? 'onboarding_first_notebook' : 'library';
        });
      } else if (session.auth.authRequired) {
        // Si el servidor exige Google Auth real, exigir inicio de sesión con cuenta autorizada
        setPersisted((prev) => (prev.user ? { ...prev, user: null } : prev));
        setScreen('welcome');
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const handleAuthenticatedGoogleUser = (user: UserProfile) => {
    const profile: UserProfile = {
      ...user,
      reducedMotion,
    };
    setAuthErrorMessage(null);
    setPersisted((prev) => ({
      ...prev,
      user: profile,
    }));
    if (persisted.notebooks.length === 0) {
      setNbTitle('Vida de mi jardín');
      setNbType('jardin');
      setNbStyle('muralismo_fauna');
      setNbLocation('Tigre, Buenos Aires');
      setNbPeriod('Primavera 2026');
      setNbDescription('Mariposas, aves, abejas, insectos y pequeños vecinos que visitan el jardín.');
      setScreen('onboarding_first_notebook');
    } else {
      setActiveNotebookId(persisted.notebooks[0].id);
      setScreen('library');
    }
    showToast(`¡Bienvenida, ${profile.displayName}!`);
  };

  const handleSignOut = async () => {
    await logoutServerSession();
    setPersisted((prev) => ({ ...prev, user: null }));
    setScreen('welcome');
    showToast('Sesión cerrada. Tus cuadernos siguen guardados en este dispositivo.');
  };

  // Escuchar eventos reales de conexión del navegador
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('Conexión restablecida. Podés sincronizar tus registros pendientes.');
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast('Sin conexión. Tus fotos se guardarán de forma segura en el teléfono.');
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

  const notebookGroupCounts = useMemo(() => {
    const counts: Record<OrganismGroup, number> = {
      aves: 0,
      mariposas: 0,
      abejas_abejorros: 0,
      insectos_aracnidos: 0,
      fauna_vecina: 0,
    };
    for (const sh of activeNotebookSheets) {
      const sp = findSpeciesByTaxonId(sh.taxonId);
      const group = getSpeciesGroup(sp);
      counts[group] += 1;
    }
    return counts;
  }, [activeNotebookSheets]);

  const filteredNotebookSheets = useMemo(() => {
    const q = notebookSearchQuery
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    return activeNotebookSheets.filter((sh) => {
      const sp = findSpeciesByTaxonId(sh.taxonId);
      if (!sp) return false;
      if (notebookGroupFilter !== 'todos' && getSpeciesGroup(sp) !== notebookGroupFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = `${sp.commonNameAr} ${sp.scientificName} ${sp.alternativeNames.join(' ')} ${sp.family} ${sp.ecologicalRole || ''}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return haystack.includes(q);
    });
  }, [activeNotebookSheets, notebookSearchQuery, notebookGroupFilter]);

  const activeSheet = useMemo(
    () => persisted.sheets.find((s) => s.id === activeSheetId) || null,
    [persisted.sheets, activeSheetId]
  );

  // Cargar fotos de referencia reales cuando se abre la ficha desplegable de una especie
  useEffect(() => {
    if (screen !== 'sheet_detail' || !activeSheet) {
      setSheetReferencePhotos([]);
      return;
    }
    const sp = findSpeciesByTaxonId(activeSheet.taxonId);
    if (!sp) return;
    if (sp.referencePhotos?.length) {
      setSheetReferencePhotos(sp.referencePhotos);
      return;
    }
    let mounted = true;
    void fetchReferencePhotosForSpecies(sp.scientificName).then((photos) => {
      if (mounted && photos.length > 0) {
        setSheetReferencePhotos(photos);
      }
    });
    return () => {
      mounted = false;
    };
  }, [screen, activeSheet]);

  const pendingSightingsCount = useMemo(
    () =>
      persisted.sightings.filter(
        (s) =>
          s.identificationStatus === 'pendiente_identificacion' ||
          s.identificationStatus === 'requiere_confirmacion' ||
          s.identificationStatus === 'error_procesamiento' ||
          s.syncStatus !== 'respaldado'
      ).length,
    [persisted.sightings]
  );

  const openNotebookDetail = (nbId: string) => {
    pushHistoryLayer('notebook_detail');
    setActiveNotebookId(nbId);
    setNotebookSearchQuery('');
    setNotebookGroupFilter('todos');
    setScreen('notebook_detail');
  };

  const openSheetDetail = (sheetId: string) => {
    pushHistoryLayer('sheet_detail');
    setActiveSheetId(sheetId);
    setSheetVisualMode('ambas');
    setShowFieldNotesAccordion(false);
    setEditingSightingId(null);
    setScreen('sheet_detail');
  };

  const openLightbox = (items: LightboxItem[], index = 0) => {
    pushHistoryLayer('lightbox');
    setLightboxState({ items, index });
  };

  const openCompareModal = (species: SpeciesCatalogEntry, candidate?: AICandidate) => {
    pushHistoryLayer('compare');
    setCompareTarget({ species, candidate });
  };

  const openShareSighting = (sighting: Sighting, sheet: NotebookSpeciesSheet) => {
    pushHistoryLayer('share_sighting');
    setShareSightingTarget({ sighting, sheet });
  };

  const openShareNotebook = () => {
    pushHistoryLayer('share_notebook');
    setShowShareNotebookModal(true);
  };

  const openDeleteConfirm = (target: {
    type: 'sighting' | 'notebook';
    id: string;
    label: string;
  }) => {
    pushHistoryLayer('delete_confirm');
    setDeleteConfirm(target);
  };

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
      setNbTitle('Vida de mi jardín');
      setNbType('jardin');
      setNbStyle('muralismo_fauna');
      setNbLocation('Tigre, Buenos Aires');
      setNbPeriod('Primavera 2026');
      setNbDescription('Mariposas, aves, abejas, insectos y pequeños vecinos que visitan el jardín.');
      setScreen('onboarding_first_notebook');
    } else {
      setActiveNotebookId(nextState.notebooks[0].id);
      setScreen('library');
    }
  };

  const handleCreateNotebook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!persisted.user) return;
    const cleanTitle = nbTitle.trim() || 'Vida de mi jardín';
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
    pushHistoryLayer('notebook_detail');
    setActiveNotebookId(newNotebook.id);
    setNotebookSearchQuery('');
    setNotebookGroupFilter('todos');
    setScreen('notebook_detail');
    showToast(
      `Cuaderno «${newNotebook.title}» creado (${ILLUSTRATION_STYLE_META[nbStyle].label}).`
    );
  };

  // ============================================================================
  // F02: Incorporar una fotografía (Galería / Cámara / Muestra con EXIF)
  // ============================================================================
  const startAddSightingFlow = (targetNotebookId?: string) => {
    const resolvedNbId = targetNotebookId || activeNotebookId || persisted.notebooks[0]?.id || null;
    if (!resolvedNbId) {
      setScreen('create_notebook');
      return;
    }
    if (resolvedNbId !== activeNotebookId) {
      setActiveNotebookId(resolvedNbId);
    }
    const targetNb = persisted.notebooks.find((n) => n.id === resolvedNbId);

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
    setDraftLocationLabel(targetNb?.generalLocation || '');
    setDraftLocationAccepted(Boolean(targetNb?.generalLocation));
    setDraftPersonalNote('');
    setDuplicateSpeciesPrompt(null);
    setManualSearchQuery('');
    setManualGroupFilter('todos');
    setLiveInatResults([]);
    pushHistoryLayer('add_sighting');
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
        setDraftLocationLabel('');
        setDraftLocationAccepted(false);
      }
    } finally {
      setIsProcessingPhoto(false);
      e.target.value = '';
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
        'Guardado como borrador local sin conexión. Cuando vuelva internet podrás identificar el ave y respaldarla.'
      );
      setScreen('notebook_detail');
      return;
    }

    await runIdentificationForSighting(newSighting, nextState, draftPresetScenario);
  };

  // ============================================================================
  // F03: Identificación asistida por IA y comparación visual
  // ============================================================================
  const runIdentificationForSighting = async (
    sighting: Sighting,
    currentState: AppPersistedState,
    presetScenario: IdentificationRequest['presetScenario'] = 'auto',
    forceRefresh = false
  ) => {
    setActiveSightingForId(sighting);
    setIdResponse(null);
    setSelectedTaxonId(null);
    setDuplicateSpeciesPrompt(null);
    setManualSearchQuery('');
    setManualGroupFilter('todos');
    setLiveInatResults([]);
    pushHistoryLayer('identify_review');
    setScreen('identify_review');

    const result = await identifyBirdFromPhoto(
      {
        photoSha256: sighting.photoSha256,
        fileName: draftFileName || sighting.id,
        sanitizedPhotoDataUrl: sighting.sanitizedPhotoDataUrl,
        generalLocationHint:
          sighting.privateLocation?.label || activeNotebook?.generalLocation,
        observedAtIso: sighting.observedAt,
        presetScenario,
      },
      forceRefresh
    );

    setIdResponse(result);
    setSelectedTaxonId(result.proposedTaxonId || result.candidates[0]?.taxonId || null);

    const updatedSighting: Sighting = {
      ...sighting,
      identificationStatus:
        result.status === 'error_procesamiento'
          ? 'error_procesamiento'
          : result.confidenceLevel === 'insuficiente'
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
      customSpecies: getCustomSpeciesList(),
      sightings: currentState.sightings.map((s) =>
        s.id === updatedSighting.id ? updatedSighting : s
      ),
    };
    setPersisted(nextState);
    setActiveSightingForId(updatedSighting);
  };

  const handleLiveNaturalistSearch = async () => {
    const q = manualSearchQuery.trim();
    if (q.length < 2) return;
    setIsSearchingLiveInat(true);
    try {
      const results = await searchLiveBirdsInNaturalist(q);
      setLiveInatResults(results);
      if (results.length === 0) {
        showToast('No encontramos especies adicionales con ese nombre.');
      }
    } finally {
      setIsSearchingLiveInat(false);
    }
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
  // F04 y F05: Confirmar especie (nueva ficha vs. especie ya observada)
  // ============================================================================
  const handleInitiateSpeciesConfirmation = async (taxonIdToConfirm: string) => {
    if (!activeSightingForId || !activeNotebook) return;

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
      const targetSheetId = existingSheet?.id || `${activeNotebook.id}_${taxonId}`;

      if (existingSheet) {
        const updatedSheet: NotebookSpeciesSheet = {
          ...existingSheet,
          sightingIds: existingSheet.sightingIds.includes(confirmedSighting.id)
            ? existingSheet.sightingIds
            : [...existingSheet.sightingIds, confirmedSighting.id],
          updatedAt: new Date().toISOString(),
        };
        nextSheets = nextSheets.map((sh) => (sh.id === updatedSheet.id ? updatedSheet : sh));
      } else {
        const { illustration } = await generateOrReuseIllustration({
          taxonId,
          style: activeNotebook.style,
          existingIllustrations: persisted.illustrations,
          forceNewVersion: false,
          fallbackPhotoDataUrl: confirmedSighting.sanitizedPhotoDataUrl,
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
        customSpecies: getCustomSpeciesList(),
        illustrations: nextIllustrations,
        sheets: nextSheets,
        sightings: nextSightings,
      };
      setPersisted(intermediateState);
      setDuplicateSpeciesPrompt(null);
      openSheetDetail(targetSheetId);

      await syncSingleSightingWithFeedback(confirmedSighting, intermediateState);
    } finally {
      setIsGeneratingPlate(false);
    }
  };

  // ============================================================================
  // Sincronización idempotente y restauración en cambio de celular
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
      showToast('Todos tus avistamientos y fotografías ya están respaldados.');
      return;
    }

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
      showToast('¡Respaldo completado en tu cuenta de Google!');
    } else {
      showToast('Algunas subidas quedaron con error. Podés reintentar sin duplicar registros.');
    }
  };

  const handleSimulatePhoneSwitchRestore = async () => {
    const uid = persisted.user?.uid || 'google-valeria-ar-01';
    const restored = await restoreFromGoogleCloudOnNewDevice(uid);
    if (!restored || restored.notebooks.length === 0) {
      showToast('Aún no hay cuadernos respaldados en la nube para restaurar.');
      return;
    }
    setPersisted(restored);
    setActiveNotebookId(restored.notebooks[0]?.id || null);
    setScreen('library');
    showToast(
      `Restaurados ${restored.notebooks.length} cuaderno(s) y ${restored.sightings.length} avistamiento(s) desde tu cuenta de Google.`
    );
  };

  // ============================================================================
  // Regenerar lámina + Editar / Eliminar avistamientos y cuadernos
  // ============================================================================
  const handleRegenerateSheetIllustration = async (
    sheet: NotebookSpeciesSheet,
    fallbackPhoto?: string
  ) => {
    if (!activeNotebook) return;
    setIsGeneratingPlate(true);
    try {
      const { illustration } = await generateOrReuseIllustration({
        taxonId: sheet.taxonId,
        style: activeNotebook.style,
        existingIllustrations: persisted.illustrations,
        forceNewVersion: true,
        fallbackPhotoDataUrl: fallbackPhoto,
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
        `Versión #${illustration.version} de la lámina lista, conservando intactas tus fotografías.`
      );
    } finally {
      setIsGeneratingPlate(false);
    }
  };

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

    if (taxonChanged && newTaxonId) {
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
          fallbackPhotoDataUrl: updatedSighting.sanitizedPhotoDataUrl,
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

  const handleConfirmDelete = () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === 'sighting') {
      const targetId = deleteConfirm.id;
      const nextSightings = persisted.sightings.filter((s) => s.id !== targetId);
      const nextSheets = persisted.sheets
        .map((sh) => ({
          ...sh,
          sightingIds: sh.sightingIds.filter((id) => id !== targetId),
        }))
        .filter((sh) => {
          const remaining = nextSightings.some(
            (s) =>
              s.notebookId === sh.notebookId &&
              s.taxonId === sh.taxonId &&
              s.identificationStatus === 'identificado'
          );
          return remaining;
        });

      const currentStillExists = nextSheets.some((sh) => sh.id === activeSheetId);
      setPersisted((prev) => ({
        ...prev,
        sightings: nextSightings,
        sheets: nextSheets,
      }));
      if (screen === 'sheet_detail' && !currentStillExists) {
        setActiveSheetId(null);
        setScreen('notebook_detail');
      }
      showToast('Avistamiento eliminado del cuaderno.');
    } else if (deleteConfirm.type === 'notebook') {
      const nbId = deleteConfirm.id;
      const nextNotebooks = persisted.notebooks.filter((n) => n.id !== nbId);
      setPersisted((prev) => ({
        ...prev,
        notebooks: nextNotebooks,
        sheets: prev.sheets.filter((sh) => sh.notebookId !== nbId),
        sightings: prev.sightings.filter((s) => s.notebookId !== nbId),
      }));
      setActiveNotebookId(nextNotebooks[0]?.id || null);
      setEditingNotebookMeta(false);
      setScreen(nextNotebooks.length > 0 ? 'library' : 'onboarding_first_notebook');
      showToast('Cuaderno eliminado.');
    }
    setDeleteConfirm(null);
  };

  // ============================================================================
  // F08: Compartir cuaderno y revocar enlace
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

    const nextState: AppPersistedState = {
      ...persisted,
      notebooks: persisted.notebooks.map((nb) =>
        nb.id === updatedNotebook.id ? updatedNotebook : nb
      ),
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

  // Helper de imagen de lámina para cualquier especie/hoja
  const resolveSheetIllustrationUrl = (
    sheet: NotebookSpeciesSheet,
    style: IllustrationStyle
  ): string => {
    const ill = persisted.illustrations.find((i) => i.id === sheet.activeIllustrationId);
    if (ill?.imageUrl) {
      if (ill.imageUrl.includes('/api/image-proxy?url=')) {
        try {
          const decoded = new URL(ill.imageUrl, 'http://localhost').searchParams.get('url');
          if (decoded) return decoded;
        } catch {
          // continuar
        }
      }
      return ill.imageUrl;
    }
    const sp = findSpeciesByTaxonId(sheet.taxonId);
    if (style === 'muralismo_fauna' && sp?.defaultMuralPlate) {
      return sp.defaultMuralPlate;
    }
    if (style === 'acuarela_naturalista' && sp?.defaultWatercolorPlate) {
      return sp.defaultWatercolorPlate;
    }
    if (style === 'lapiz_grafito' && sp?.defaultGraphitePlate) {
      return sp.defaultGraphitePlate;
    }
    return (
      sp?.referencePhotos?.[0]?.url ||
      sp?.referencePhotos?.[0]?.thumbUrl ||
      persisted.sightings.find(
        (s) => s.notebookId === sheet.notebookId && s.taxonId === sheet.taxonId
      )?.sanitizedPhotoDataUrl ||
      '/plates/acuarela_hornero.jpg'
    );
  };

  // ============================================================================
  // Vista Pública de Invitado (?share=:token)
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

  const renderSyncBadge = (status: SyncStatus) => {
    switch (status) {
      case 'respaldado':
        return (
          <span className="badge badge-sync-respaldado">
            <Cloud size={12} /> Respaldado
          </span>
        );
      case 'subiendo':
        return (
          <span className="badge badge-sync-subiendo">
            <UploadCloud size={12} /> Subiendo…
          </span>
        );
      case 'error':
        return (
          <span className="badge badge-sync-error">
            <AlertTriangle size={12} /> Reintentar
          </span>
        );
      case 'local':
      default:
        return (
          <span className="badge badge-sync-local">
            <CloudOff size={12} /> Local
          </span>
        );
    }
  };

  // ============================================================================
  // Vista 1: Bienvenida / acceso con Google
  // ============================================================================
  if (screen === 'welcome' || !persisted.user) {
    return (
      <div className={`app-shell ${reducedMotion ? 'reduced-motion' : ''}`}>
        <div
          className="notebook-page"
          style={{
            maxWidth: 560,
            margin: '18px auto',
            padding: '28px 20px',
            textAlign: 'center',
          }}
        >
          <span className="badge badge-sync-respaldado" style={{ marginBottom: 10 }}>
            <Sprout size={13} /> Cuaderno vivo de jardín y naturaleza
          </span>
          <h1 className="serif-heading" style={{ fontSize: '2.55rem', marginBottom: 4 }}>
            Bioma
          </h1>
          <p className="handwritten-note" style={{ margin: '0 0 14px', color: 'var(--botanical-green)' }}>
            Un refugio ilustrado para las mariposas, aves, abejas, insectos y la vida de tu jardín
          </p>

          <div className="welcome-groups-row" aria-label="Grupos de vida que podés registrar">
            {ORGANISM_GROUPS_ORDER.map((g) => {
              const meta = ORGANISM_GROUP_META[g];
              return (
                <span
                  key={g}
                  className="group-pill"
                  style={{
                    background: meta.accentBg,
                    color: meta.accentText,
                    borderColor: meta.accentBorder,
                  }}
                >
                  {meta.emoji} {meta.shortLabel}
                </span>
              );
            })}
          </div>

          <div className="welcome-triptych">
            <div className="welcome-art-sample">
              <div className="plate-frame style-muralismo_fauna">
                <img src="/plates/mural_hornero.jpg" alt="Ejemplo de muralismo de fauna autóctona" />
              </div>
              <span>Muralismo</span>
            </div>
            <div className="welcome-art-sample">
              <div className="plate-frame">
                <img src="/plates/acuarela_hornero.jpg" alt="Ejemplo de lámina en acuarela naturalista" />
              </div>
              <span>Acuarela</span>
            </div>
            <div className="welcome-art-sample">
              <div className="plate-frame style-lapiz_grafito">
                <img src="/plates/grafito_chingolo.jpg" alt="Ejemplo de lámina en lápiz grafito" />
              </div>
              <span>Grafito</span>
            </div>
          </div>

          <p style={{ color: 'var(--ink-secondary)', fontSize: '0.94rem', marginBottom: 18 }}>
            Descubrí qué ave, mariposa, abeja, abejorro, insecto o vecino del jardín fotografiaste,
            conocé su rol ecológico y convertí cada encuentro en una obra de{' '}
            <strong>muralismo de fauna autóctona</strong>, <strong>acuarela</strong> o{' '}
            <strong>lápiz grafito</strong>.
          </p>

          {authErrorMessage && (
            <div
              className="callout-box terracotta"
              role="alert"
              style={{ marginBottom: 16, textAlign: 'left', fontSize: '0.86rem' }}
            >
              <div style={{ fontWeight: 700, color: '#8E3B24', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={16} /> Acceso no autorizado
              </div>
              <div style={{ marginTop: 4 }}>{authErrorMessage}</div>
            </div>
          )}

          {serverAuthStatus?.googleAuthConfigured && serverAuthStatus.googleClientId ? (
            <div style={{ marginBottom: 10 }}>
              <GoogleSignInButton
                googleClientId={serverAuthStatus.googleClientId}
                isStandalonePwa={isStandaloneApp}
                onAuthenticated={handleAuthenticatedGoogleUser}
                onAuthError={(msg) => setAuthErrorMessage(msg)}
              />
              <p style={{ fontSize: '0.78rem', color: 'var(--ink-muted)', marginTop: 12 }}>
                Acceso privado limitado exclusivamente a las cuentas de Google autorizadas para
                proteger la cuota de IA.
              </p>
            </div>
          ) : serverAuthStatus?.authRequired ? (
            <div className="callout-box warning" style={{ textAlign: 'left', fontSize: '0.86rem' }}>
              <strong>Falta configurar GOOGLE_CLIENT_ID en el servidor</strong>
              <p style={{ margin: '5px 0 0' }}>
                En producción el acceso está protegido por defecto. Agregá{' '}
                <code>GOOGLE_CLIENT_ID</code> en las variables de entorno del servidor para
                habilitar el inicio de sesión con Google.
              </p>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', maxWidth: 360, fontSize: '1rem', padding: '13px 22px' }}
                onClick={handleGoogleSignIn}
              >
                <ShieldCheck size={19} /> Ingresar con mi cuenta de Google (Valeria)
              </button>

              <p style={{ fontSize: '0.78rem', color: 'var(--ink-muted)', marginTop: 12 }}>
                Solo solicitamos el permiso mínimo para asociar y respaldar tus cuadernos. En
                producción agregá <code>GOOGLE_CLIENT_ID</code> para restringir el acceso a tus
                cuentas de Google autorizadas.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  const showBottomNav =
    screen === 'library' || screen === 'notebook_detail' || screen === 'pending_center';

  // Resultados combinados para búsqueda manual visual en identify_review
  const localManualResults = searchSpeciesCatalog(manualSearchQuery, manualGroupFilter);
  const combinedManualResults: SpeciesCatalogEntry[] = [
    ...localManualResults,
    ...liveInatResults.filter(
      (live) =>
        !localManualResults.some((loc) => loc.taxonId === live.taxonId) &&
        (manualGroupFilter === 'todos' || getSpeciesGroup(live) === manualGroupFilter)
    ),
  ];

  return (
    <div className={`app-shell ${reducedMotion ? 'reduced-motion' : ''}`}>
      {/* Cabezal superior minimalista y móvil-first */}
      <header className="top-header">
        <button
          type="button"
          className="brand-title"
          onClick={() => setScreen('library')}
          title="Ir a mis cuadernos"
        >
          <Sprout size={23} color="#38573E" />
          <div style={{ minWidth: 0 }}>
            <h1>Bioma</h1>
            <span className="brand-subtitle">Cuaderno vivo de {persisted.user.displayName}</span>
          </div>
        </button>

        <div className="header-actions">
          {installPromptEvent && !isStandaloneApp && (
            <button
              type="button"
              className="btn btn-primary btn-compact"
              onClick={() => void handleTriggerPwaInstall()}
              title="Instalar Bioma como aplicación en tu pantalla de inicio"
            >
              <Download size={14} /> Instalar
            </button>
          )}
          {!isOnline && (
            <button
              type="button"
              className="offline-pill-btn"
              onClick={() => setIsOnline(true)}
              title="Sin conexión a internet"
            >
              <WifiOff size={13} /> Sin red
            </button>
          )}
          <button
            type="button"
            className="icon-circle-btn"
            onClick={openPendingSettings}
            aria-label="Respaldo y ajustes"
            title="Respaldo, IA y ajustes"
          >
            <Settings size={18} />
            {pendingSightingsCount > 0 && (
              <span
                className="bottom-nav-badge"
                style={{ top: -3, right: -3 }}
                aria-hidden="true"
              >
                {pendingSightingsCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Toast flotante */}
      {toastMessage && (
        <div className="floating-toast" role="status">
          <span>{toastMessage}</span>
          <button
            type="button"
            className="floating-toast-close"
            onClick={() => setToastMessage(null)}
            aria-label="Cerrar aviso"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* ========================================================================
          Vista 2: Onboarding y creación de cuaderno
         ======================================================================== */}
      {(screen === 'onboarding_first_notebook' || screen === 'create_notebook') && (
        <section className="notebook-page">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
            <div>
              <span className="badge badge-sync-respaldado">
                {screen === 'onboarding_first_notebook' ? 'Bienvenida, Valeria' : 'Nuevo cuaderno'}
              </span>
              <h2 className="serif-heading" style={{ fontSize: '1.85rem', marginTop: 6 }}>
                {screen === 'onboarding_first_notebook'
                  ? 'Armemos tu primer cuaderno de campo'
                  : 'Crear un nuevo cuaderno'}
              </h2>
            </div>
            {persisted.notebooks.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={() => setScreen('library')}
              >
                <ArrowLeft size={15} /> Volver
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
                placeholder="Ej.: Vida de mi jardín o Vacaciones en Lago Puelo"
              />
            </div>

            <div className="field-group">
              <label>Tipo de cuaderno</label>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segmented-btn ${nbType === 'jardin' ? 'active' : ''}`}
                  onClick={() => {
                    setNbType('jardin');
                    if (nbTitle === 'Vacaciones en Lago Puelo') setNbTitle('Vida de mi jardín');
                  }}
                >
                  <Sprout size={15} /> Hogar / Jardín
                </button>
                <button
                  type="button"
                  className={`segmented-btn ${nbType === 'viaje' ? 'active' : ''}`}
                  onClick={() => {
                    setNbType('viaje');
                    if (nbTitle === 'Vida de mi jardín' || nbTitle === 'Aves de mi jardín') {
                      setNbTitle('Vacaciones en Lago Puelo');
                      setNbLocation('Lago Puelo, Chubut');
                      setNbPeriod('Verano 2026');
                    }
                  }}
                >
                  <Compass size={15} /> Viaje / Escapada
                </button>
              </div>
            </div>

            <div className="field-group">
              <label>Estilo artístico de las láminas (fijo para este cuaderno)</label>
              <div className="style-selector-grid">
                <button
                  type="button"
                  className={`style-option-card featured ${nbStyle === 'muralismo_fauna' ? 'selected' : ''}`}
                  onClick={() => setNbStyle('muralismo_fauna')}
                >
                  <div className="plate-frame style-muralismo_fauna style-featured-thumb">
                    <img
                      src="/plates/mural_hornero.jpg"
                      alt="Muestra Muralismo de fauna autóctona"
                    />
                  </div>
                  <div className="style-option-copy">
                    <span className="badge badge-sync-respaldado" style={{ marginBottom: 4 }}>
                      Por defecto
                    </span>
                    <div style={{ fontWeight: 700, fontSize: '0.94rem' }}>
                      Muralismo de fauna autóctona
                    </div>
                    <div className="field-hint">
                      Muralismo de naturaleza y biodiversidad con color vibrante y flora nativa.
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  className={`style-option-card ${nbStyle === 'acuarela_naturalista' ? 'selected' : ''}`}
                  onClick={() => setNbStyle('acuarela_naturalista')}
                >
                  <div className="plate-frame" style={{ marginBottom: 8 }}>
                    <img src="/plates/acuarela_hornero.jpg" alt="Muestra Acuarela Naturalista" />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.94rem' }}>Acuarela naturalista</div>
                  <div className="field-hint">Veladuras cálidas sobre papel algodón.</div>
                </button>

                <button
                  type="button"
                  className={`style-option-card ${nbStyle === 'lapiz_grafito' ? 'selected' : ''}`}
                  onClick={() => setNbStyle('lapiz_grafito')}
                >
                  <div className="plate-frame style-lapiz_grafito" style={{ marginBottom: 8 }}>
                    <img src="/plates/grafito_chingolo.jpg" alt="Muestra Lápiz Grafito" />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.94rem' }}>Lápiz grafito</div>
                  <div className="field-hint">Apunte de campo clásico a lápiz.</div>
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              <div className="field-group">
                <label htmlFor="nb-location">Lugar general (opcional)</label>
                <input
                  id="nb-location"
                  type="text"
                  className="input-text"
                  value={nbLocation}
                  onChange={(e) => setNbLocation(e.target.value)}
                  placeholder="Ej.: Tigre, Buenos Aires"
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
                  placeholder="Ej.: Primavera 2026"
                />
              </div>
            </div>

            <div className="field-group">
              <label htmlFor="nb-desc">Nota de portada (opcional)</label>
              <input
                id="nb-desc"
                type="text"
                className="input-text"
                value={nbDescription}
                onChange={(e) => setNbDescription(e.target.value)}
                placeholder="Breve contexto para recordar este cuaderno"
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 4 }}>
              <BookOpen size={18} /> Crear cuaderno y abrir portada
            </button>
          </form>
        </section>
      )}

      {/* ========================================================================
          Vista 3: Biblioteca de cuadernos
         ======================================================================== */}
      {screen === 'library' && (
        <section>
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
              <h2 className="serif-heading" style={{ fontSize: '1.85rem', margin: 0 }}>
                Mis cuadernos
              </h2>
              <span style={{ color: 'var(--ink-secondary)', fontSize: '0.88rem' }}>
                Elegí un cuaderno para explorar la vida de tu bioma o sumar un hallazgo.
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-compact"
              onClick={() => {
                setNbTitle('Vacaciones en Lago Puelo');
                setNbType('viaje');
                setNbStyle('lapiz_grafito');
                setNbLocation('Lago Puelo, Chubut');
                setNbPeriod('Verano 2026');
                setNbDescription('Aves, mariposas, insectos y fauna descubierta en los senderos del lago.');
                pushHistoryLayer('create_notebook');
                setScreen('create_notebook');
              }}
            >
              <Plus size={16} /> Nuevo cuaderno (Jardín o Viaje)
            </button>
          </div>

          <div className="notebook-grid">
            {persisted.notebooks.map((nb) => {
              const nbSheets = persisted.sheets.filter((s) => s.notebookId === nb.id);
              const sightingsCount = persisted.sightings.filter(
                (s) => s.notebookId === nb.id && s.identificationStatus === 'identificado'
              ).length;
              const pendingCount = persisted.sightings.filter(
                (s) => s.notebookId === nb.id && s.identificationStatus !== 'identificado'
              ).length;

              return (
                <div
                  key={nb.id}
                  className={`notebook-card style-${nb.style}`}
                  onClick={() => openNotebookDetail(nb.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      openNotebookDetail(nb.id);
                    }
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
                      <span className="badge badge-sync-respaldado">
                        {nb.type === 'jardin' ? 'Jardín' : 'Viaje'} ·{' '}
                        {ILLUSTRATION_STYLE_META[nb.style]?.shortLabel || 'Muralismo'}
                      </span>
                      {renderSyncBadge(nb.syncStatus)}
                    </div>

                    <h3 className="serif-heading" style={{ fontSize: '1.5rem', margin: '2px 0 4px' }}>
                      {nb.title}
                    </h3>

                    <div className="meta-row">
                      {nb.generalLocation && (
                        <span>
                          <MapPin size={13} /> {nb.generalLocation}
                        </span>
                      )}
                      {nb.period && <span>{nb.period}</span>}
                    </div>

                    {nbSheets.length > 0 && (
                      <>
                        <div className="notebook-preview-strip" aria-hidden="true">
                          {nbSheets.slice(0, 4).map((sh) => (
                            <div key={sh.id} className="notebook-preview-mini">
                              <img src={resolveSheetIllustrationUrl(sh, nb.style)} alt="" />
                            </div>
                          ))}
                        </div>
                        <div className="notebook-biome-counts">
                          {ORGANISM_GROUPS_ORDER.map((g) => {
                            const cnt = nbSheets.filter(
                              (sh) => getSpeciesGroup(findSpeciesByTaxonId(sh.taxonId)) === g
                            ).length;
                            if (cnt === 0) return null;
                            const gm = ORGANISM_GROUP_META[g];
                            return (
                              <span
                                key={g}
                                className="biome-mini-count"
                                style={{
                                  background: gm.accentBg,
                                  color: gm.accentText,
                                }}
                                title={`${cnt} ${gm.label.toLowerCase()}`}
                              >
                                {gm.emoji} {cnt}
                              </span>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  <div
                    style={{
                      borderTop: '1px solid var(--paper-edge)',
                      paddingTop: 9,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      color: 'var(--botanical-green)',
                    }}
                  >
                    <span>
                      {nbSheets.length} {nbSheets.length === 1 ? 'especie' : 'especies'} ·{' '}
                      {sightingsCount} {sightingsCount === 1 ? 'registro' : 'registros'}
                    </span>
                    {pendingCount > 0 && (
                      <span className="badge badge-sync-local">{pendingCount} pend.</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ========================================================================
          Vista 4: Cuaderno abierto (Portada compacta + Grilla 2 col en móvil)
         ======================================================================== */}
      {screen === 'notebook_detail' && activeNotebook && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={() => setScreen('library')}
            >
              <ArrowLeft size={15} /> Todos mis cuadernos
            </button>

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="icon-circle-btn"
                onClick={() => setEditingNotebookMeta((v) => !v)}
                aria-label="Editar portada del cuaderno"
                title="Editar portada"
              >
                <Edit3 size={16} />
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={openShareNotebook}
              >
                <Share2 size={15} /> Compartir
              </button>
            </div>
          </div>

          {/* Portada del cuaderno */}
          <div className={`notebook-page style-${activeNotebook.style}`} style={{ marginBottom: 16 }}>
            {editingNotebookMeta ? (
              <div>
                <h3 className="serif-heading" style={{ fontSize: '1.35rem', marginBottom: 10 }}>
                  Editar portada del cuaderno
                </h3>
                <div className="field-group">
                  <label>Nombre</label>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
                            n.id === activeNotebook.id
                              ? { ...n, generalLocation: e.target.value }
                              : n
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
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-compact"
                    onClick={() => {
                      setEditingNotebookMeta(false);
                      showToast('Portada actualizada.');
                    }}
                  >
                    <Check size={15} /> Guardar
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost-danger btn-compact"
                    onClick={() =>
                      openDeleteConfirm({
                        type: 'notebook',
                        id: activeNotebook.id,
                        label: activeNotebook.title,
                      })
                    }
                  >
                    <Trash2 size={14} /> Eliminar cuaderno
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                  <span className="badge badge-sync-respaldado">
                    Estilo fijo:{' '}
                    {ILLUSTRATION_STYLE_META[activeNotebook.style]?.label ||
                      'Muralismo de fauna autóctona'}
                  </span>
                  {renderSyncBadge(activeNotebook.syncStatus)}
                </div>

                <h2 className="serif-heading" style={{ fontSize: '1.95rem', margin: '2px 0 4px', lineHeight: 1.1 }}>
                  {activeNotebook.title}
                </h2>
                {activeNotebook.description && (
                  <p style={{ margin: '0 0 8px', color: 'var(--ink-secondary)', fontSize: '0.88rem' }}>
                    {activeNotebook.description}
                  </p>
                )}
                <div className="meta-row">
                  {activeNotebook.generalLocation && (
                    <span>
                      <MapPin size={13} /> {activeNotebook.generalLocation}
                    </span>
                  )}
                  {activeNotebook.period && <span>{activeNotebook.period}</span>}
                  <span>
                    <BookOpen size={13} /> {activeNotebookSheets.length}{' '}
                    {activeNotebookSheets.length === 1 ? 'especie' : 'especies'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Estado vacío o grilla visual de láminas con filtros por grupo del bioma */}
          {activeNotebookSheets.length === 0 ? (
            <div className="notebook-page" style={{ textAlign: 'center', padding: '32px 18px' }}>
              <Sprout size={36} color="#38573E" style={{ marginBottom: 8 }} />
              <h3 className="serif-heading" style={{ fontSize: '1.65rem' }}>
                Las páginas de «{activeNotebook.title}» están listas
              </h3>
              <p style={{ color: 'var(--ink-secondary)', maxWidth: 440, margin: '6px auto 18px', fontSize: '0.92rem' }}>
                Elegí una foto de tu galería o sacá una ahora para identificar mariposas, aves,
                abejas, abejorros, insectos o vecinos del jardín y sumar su lámina ilustrada.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => startAddSightingFlow(activeNotebook.id)}
              >
                <Camera size={18} /> Registrar mi primer hallazgo
              </button>
            </div>
          ) : (
            <div>
              {/* Barra táctil de filtros por grupo biológico */}
              <div
                className="group-filter-bar"
                role="tablist"
                aria-label="Filtrar especies por grupo del bioma"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={notebookGroupFilter === 'todos'}
                  className={`group-filter-chip ${notebookGroupFilter === 'todos' ? 'active' : ''}`}
                  onClick={() => setNotebookGroupFilter('todos')}
                >
                  🌿 Todo ({activeNotebookSheets.length})
                </button>
                {ORGANISM_GROUPS_ORDER.map((group) => {
                  const meta = ORGANISM_GROUP_META[group];
                  const count = notebookGroupCounts[group];
                  return (
                    <button
                      key={group}
                      type="button"
                      role="tab"
                      aria-selected={notebookGroupFilter === group}
                      className={`group-filter-chip ${notebookGroupFilter === group ? 'active' : ''} ${
                        count === 0 ? 'empty' : ''
                      }`}
                      onClick={() => setNotebookGroupFilter(group)}
                    >
                      {meta.emoji} {meta.shortLabel}
                      {count > 0 ? ` (${count})` : ''}
                    </button>
                  );
                })}
              </div>

              {activeNotebookSheets.length >= 3 && (
                <div className="search-input-wrap" style={{ marginBottom: 12 }}>
                  <Search size={17} />
                  <input
                    type="search"
                    className="input-text"
                    placeholder="Buscar ave, mariposa, abeja, insecto o animal…"
                    value={notebookSearchQuery}
                    onChange={(e) => setNotebookSearchQuery(e.target.value)}
                  />
                </div>
              )}

              {filteredNotebookSheets.length === 0 ? (
                <div className="notebook-page" style={{ textAlign: 'center', padding: '26px 18px' }}>
                  <div style={{ fontSize: '1.8rem', marginBottom: 6 }}>
                    {notebookGroupFilter === 'todos'
                      ? '🔍'
                      : ORGANISM_GROUP_META[notebookGroupFilter].emoji}
                  </div>
                  <h4 className="serif-heading" style={{ fontSize: '1.35rem', margin: '0 0 6px' }}>
                    {notebookGroupFilter === 'todos'
                      ? 'No encontramos especies con ese filtro'
                      : `Todavía no sumaste ${ORGANISM_GROUP_META[notebookGroupFilter].label.toLowerCase()} aquí`}
                  </h4>
                  <p style={{ color: 'var(--ink-secondary)', fontSize: '0.86rem', margin: '0 0 14px' }}>
                    {notebookGroupFilter === 'todos'
                      ? 'Probá con otro nombre común o científico.'
                      : 'Cuando fotografíes un visitante de este grupo, su lámina aparecerá en esta sección.'}
                  </p>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-compact"
                      onClick={() => startAddSightingFlow(activeNotebook.id)}
                    >
                      <Camera size={15} /> Registrar hallazgo
                    </button>
                    {notebookGroupFilter !== 'todos' && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact"
                        onClick={() => setNotebookGroupFilter('todos')}
                      >
                        Ver todo el bioma
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="sheets-grid">
                  {filteredNotebookSheets.map((sheet) => {
                    const species = findSpeciesByTaxonId(sheet.taxonId);
                    if (!species) return null;
                    const imgUrl = resolveSheetIllustrationUrl(sheet, activeNotebook.style);
                    const gMeta = ORGANISM_GROUP_META[getSpeciesGroup(species)];

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
                        onClick={() => openSheetDetail(sheet.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && openSheetDetail(sheet.id)}
                      >
                        <div className={`plate-frame style-${activeNotebook.style}`}>
                          <img src={imgUrl} alt={`Lámina de ${species.commonNameAr}`} />
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
                          <h4 className="serif-heading species-card-title">{species.commonNameAr}</h4>
                          <div className="scientific-name species-card-sci">
                            {species.scientificName}
                          </div>
                          <div className="species-card-foot">
                            <span>{formatShortArgentineDate(sheet.firstObservedAt)}</span>
                            <span className="badge badge-sync-respaldado" style={{ padding: '2px 7px' }}>
                              {sheetSightings.length}×
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Avistamientos pendientes dentro de este cuaderno */}
          {persisted.sightings.some(
            (s) =>
              s.notebookId === activeNotebook.id && s.identificationStatus !== 'identificado'
          ) && (
            <div className="notebook-page" style={{ marginTop: 18 }}>
              <h3 className="serif-heading" style={{ fontSize: '1.35rem', marginBottom: 10 }}>
                Pendientes de identificar
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                        gap: 10,
                        flexWrap: 'wrap',
                        padding: 10,
                        background: 'var(--paper-inset)',
                        borderRadius: 11,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button
                          type="button"
                          className="hero-photo-thumb"
                          style={{ width: 58, height: 58, minWidth: 58 }}
                          onClick={() =>
                            openLightbox(
                              [
                                {
                                  url: s.sanitizedPhotoDataUrl,
                                  title: 'Avistamiento pendiente',
                                  subtitle: formatShortArgentineDate(s.observedAt),
                                  badge: 'Tu foto',
                                },
                              ],
                              0
                            )
                          }
                          aria-label="Ampliar fotografía pendiente"
                        >
                          <img src={s.sanitizedPhotoDataUrl} alt="Avistamiento pendiente" />
                        </button>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                            {formatShortArgentineDate(s.observedAt)}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--ink-secondary)' }}>
                            {formatIdentificationStatusLabel(s.identificationStatus)}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-compact"
                          onClick={() => {
                            if (!isOnline) {
                              showToast('Necesitás conexión a internet para analizar la foto.');
                              return;
                            }
                            void runIdentificationForSighting(s, persisted, 'auto', true);
                          }}
                        >
                          <Sparkles size={14} /> Identificar
                        </button>
                        <button
                          type="button"
                          className="icon-circle-btn danger"
                          style={{ width: 34, height: 34 }}
                          onClick={() =>
                            openDeleteConfirm({
                              type: 'sighting',
                              id: s.id,
                              label: 'esta fotografía pendiente',
                            })
                          }
                          aria-label="Eliminar fotografía pendiente"
                        >
                          <Trash2 size={15} />
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
          Vista 5: Agregar avistamiento (Galería / Cámara / EXIF / Nota)
         ======================================================================== */}
      {screen === 'add_sighting' && activeNotebook && (
        <section className="notebook-page">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
            <div>
              <span className="badge badge-sync-respaldado">{activeNotebook.title}</span>
              <h2 className="serif-heading" style={{ fontSize: '1.8rem', margin: '4px 0 0' }}>
                Registrar hallazgo
              </h2>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={() => setScreen('notebook_detail')}
            >
              <ArrowLeft size={15} /> Volver
            </button>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: '0.86rem', color: 'var(--ink-secondary)' }}>
            Fotografiá un ave, mariposa, abeja, abejorro, insecto, araña o visitante del jardín.
          </p>

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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => galleryInputRef.current?.click()}
            >
              <FolderOpen size={18} /> Galería
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera size={18} /> Cámara
            </button>
          </div>

          {isProcessingPhoto && (
            <div className="callout-box" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Loader2 size={17} className="spin" /> Preparando tu foto y leyendo fecha/GPS…
            </div>
          )}

          {draftPhotoDataUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
              <button
                type="button"
                className="plate-frame plate-clickable"
                style={{ maxHeight: 320, maxWidth: 420, margin: '0 auto' }}
                onClick={() =>
                  openLightbox(
                    [
                      {
                        url: draftPhotoDataUrl,
                        title: 'Tu fotografía',
                        subtitle: draftFileName,
                        badge: 'Vista previa',
                      },
                    ],
                    0
                  )
                }
                aria-label="Ampliar vista previa de tu fotografía"
              >
                <img src={draftPhotoDataUrl} alt="Vista previa de tu fotografía" />
                <span className="zoom-pill">
                  <ZoomIn size={13} /> Ampliar foto
                </span>
              </button>

              {draftExif && (draftExif.hasExifDate || draftExif.hasExifGps) ? (
                <div className="callout-box" style={{ fontSize: '0.84rem' }}>
                  <strong style={{ color: '#28402C' }}>
                    Metadatos EXIF detectados en la fotografía
                  </strong>
                  <div>
                    Sugerimos la fecha{draftExif.hasExifGps ? ' y ubicación general' : ''} desde tu
                    cámara. Podés editarlos o descartarlos abajo.
                  </div>
                </div>
              ) : (
                <div className="callout-box warning" style={{ fontSize: '0.84rem' }}>
                  <strong>Fotografía sin metadatos EXIF de ubicación</strong>
                  <div>
                    No inventamos ubicaciones; podés escribir el lugar si querés recordarlo.
                  </div>
                </div>
              )}

              <div className="field-group">
                <label htmlFor="obs-date">
                  Fecha y hora{' '}
                  {draftExif?.hasExifDate && (
                    <span className="badge badge-sync-respaldado">Desde la foto</span>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <label htmlFor="obs-loc">Ubicación aproximada (privada)</label>
                  {draftLocationLabel && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      style={{ padding: '4px 10px', fontSize: '0.75rem', minHeight: 30 }}
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
                  placeholder="Opcional (ej.: Jardín de casa, Lago Puelo)"
                />
              </div>

              <div className="field-group">
                <label htmlFor="obs-note">Nota personal de campo (opcional)</label>
                <textarea
                  id="obs-note"
                  rows={2}
                  className="input-textarea"
                  value={draftPersonalNote}
                  onChange={(e) => setDraftPersonalNote(e.target.value)}
                  placeholder="Ej.: Posada en la lavanda al sol de la mañana…"
                />
              </div>

              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={() => void handleSaveDraftAndProceed()}
              >
                {isOnline ? (
                  <>
                    <Sparkles size={18} /> Confirmar foto e identificar especie
                  </>
                ) : (
                  <>
                    <CloudOff size={18} /> Guardar borrador sin conexión
                  </>
                )}
              </button>
            </div>
          )}

          {/* Fotos de muestra discretas al pie para probar escenarios */}
          <div style={{ borderTop: '1px solid var(--paper-edge)', paddingTop: 12, marginTop: 8 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: 8 }}>
              O probá con una foto de ejemplo:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SAMPLE_TEST_PHOTOS.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  className="btn btn-secondary btn-compact"
                  style={{ fontSize: '0.76rem', fontWeight: 500 }}
                  onClick={() => void handleSelectSamplePhoto(sample)}
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================
          Vista 6: Identificación asistida + Comparador Visual con Fotos Reales
         ======================================================================== */}
      {screen === 'identify_review' && activeSightingForId && activeNotebook && (
        <section className="notebook-page">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
            <h2 className="serif-heading" style={{ fontSize: '1.75rem', margin: 0 }}>
              Identificar especie
            </h2>
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={() => void handleKeepAsPendingIdentification()}
            >
              Dejar pendiente
            </button>
          </div>

          {/* Barra compacta con tu foto ampliable siempre visible arriba */}
          <div className="identify-my-photo-bar">
            <button
              type="button"
              className="identify-my-photo-thumb"
              onClick={() =>
                openLightbox(
                  [
                    {
                      url: activeSightingForId.sanitizedPhotoDataUrl,
                      title: 'Tu fotografía original',
                      subtitle: formatShortArgentineDate(activeSightingForId.observedAt),
                      badge: 'Tu foto',
                    },
                  ],
                  0
                )
              }
              aria-label="Ampliar tu fotografía"
            >
              <img src={activeSightingForId.sanitizedPhotoDataUrl} alt="Fotografía analizada" />
              <span className="thumb-zoom-dot">
                <ZoomIn size={12} />
              </span>
            </button>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>Tu fotografía</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--ink-secondary)' }}>
                Tocá la imagen para ampliarla o tocá «Comparar» en cualquier especie para ver fotos
                reales lado a lado.
              </div>
            </div>
          </div>

          {!idResponse ? (
            <div className="callout-box" style={{ padding: 24, textAlign: 'center' }}>
              <Loader2 size={28} color="#38573E" className="spin" style={{ marginBottom: 8 }} />
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                Analizando alas, colores, rasgos y proporciones…
              </div>
              <div style={{ color: 'var(--ink-secondary)', fontSize: '0.86rem', marginTop: 4 }}>
                Contrastando con la fauna y polinizadores de Argentina y buscando fotos reales de referencia.
              </div>
            </div>
          ) : (
            <div>
              {/* Aviso de especie ya observada en el cuaderno */}
              {duplicateSpeciesPrompt && (
                <div
                  className="callout-box warning"
                  role="alertdialog"
                  aria-label="Especie ya registrada en este cuaderno"
                  style={{ marginBottom: 14, padding: 14 }}
                >
                  <h3 className="serif-heading" style={{ fontSize: '1.4rem', margin: '0 0 6px' }}>
                    Ya registraste un{' '}
                    {findSpeciesByTaxonId(duplicateSpeciesPrompt.taxonId)?.commonNameAr.toLowerCase()}{' '}
                    en este cuaderno. ¿Querés guardar otro avistamiento?
                  </h3>
                  <p style={{ margin: '0 0 12px', fontSize: '0.88rem' }}>
                    Sumaremos esta foto, su fecha y tu nota al historial de la lámina existente, sin
                    duplicar la página del cuaderno.
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-compact"
                      disabled={isGeneratingPlate}
                      onClick={() =>
                        void finalizeConfirmedSpeciesRegistration(
                          duplicateSpeciesPrompt.taxonId,
                          duplicateSpeciesPrompt.existingSheet
                        )
                      }
                    >
                      <Check size={16} /> Sí, guardar otro avistamiento en su historial
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      onClick={() => {
                        setPersisted((prev) => ({
                          ...prev,
                          sightings: prev.sightings.filter((s) => s.id !== activeSightingForId.id),
                        }));
                        setDuplicateSpeciesPrompt(null);
                        setScreen('notebook_detail');
                        showToast('Registro cancelado sin modificar la lámina anterior.');
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Estado del análisis (honesto, nunca inventa Hornero) */}
              {idResponse.aiMode === 'unconfigured' ? (
                <div className="callout-box warning" style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, color: '#7A5416', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={17} /> Activá la detección automática con Google Gemini
                  </div>
                  <p style={{ margin: '6px 0', fontSize: '0.86rem' }}>{idResponse.explanation}</p>
                  <p style={{ margin: '0 0 8px', fontSize: '0.82rem', color: '#5A4010' }}>
                    {idResponse.uncertaintyReason}
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      onClick={() => {
                        void refreshAiHealth();
                        void runIdentificationForSighting(activeSightingForId, persisted, 'auto', true);
                      }}
                    >
                      <RefreshCw size={14} /> Ya agregué la clave, reintentar
                    </button>
                  </div>
                </div>
              ) : idResponse.aiMode === 'error' ? (
                <div className="callout-box terracotta" style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, color: '#8E3B24', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={17} /> No pudimos analizar la foto ahora
                  </div>
                  <p style={{ margin: '5px 0 6px', fontSize: '0.86rem' }}>{idResponse.explanation}</p>
                  {idResponse.aiErrorMessage && (
                    <div style={{ fontSize: '0.75rem', color: '#7A301B', marginBottom: 8, wordBreak: 'break-word' }}>
                      Detalle: {idResponse.aiErrorMessage}
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary btn-compact"
                    onClick={() =>
                      void runIdentificationForSighting(activeSightingForId, persisted, 'auto', true)
                    }
                  >
                    <RefreshCw size={14} /> Reintentar análisis con IA
                  </button>
                </div>
              ) : idResponse.confidenceLevel === 'alta' ? (
                <div className="callout-box" style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, color: '#28402C', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={17} /> Seguridad alta · Especie identificada
                  </div>
                  <p style={{ margin: '5px 0 0', fontSize: '0.88rem' }}>{idResponse.explanation}</p>
                </div>
              ) : idResponse.confidenceLevel === 'media' ? (
                <div className="callout-box warning" style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, color: '#7A5416', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <HelpCircle size={17} /> Seguridad moderada · Compará las candidatas
                  </div>
                  <p style={{ margin: '5px 0 4px', fontSize: '0.88rem' }}>{idResponse.explanation}</p>
                  {idResponse.uncertaintyReason && (
                    <div style={{ fontSize: '0.83rem', color: '#5A4010' }}>
                      <strong>Por qué hay duda:</strong> {idResponse.uncertaintyReason}
                    </div>
                  )}
                </div>
              ) : (
                <div className="callout-box terracotta" style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, color: '#8E3B24', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={17} /> Evidencia visual insuficiente
                  </div>
                  <p style={{ margin: '5px 0 4px', fontSize: '0.88rem' }}>{idResponse.explanation}</p>
                  {idResponse.uncertaintyReason && (
                    <div style={{ fontSize: '0.83rem' }}>{idResponse.uncertaintyReason}</div>
                  )}
                </div>
              )}

              {/* Tarjetas de candidatas CON FOTO DE REFERENCIA REAL Y BOTÓN COMPARAR */}
              {idResponse.candidates.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 8 }}>
                    {idResponse.confidenceLevel === 'alta'
                      ? 'Especie propuesta y alternativas cercanas:'
                      : 'Candidatas sugeridas — comparalas con tu foto:'}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {idResponse.candidates.map((cand) => {
                      const isSelected = selectedTaxonId === cand.taxonId;
                      const speciesMatch = findSpeciesByTaxonId(cand.taxonId) || {
                        taxonId: cand.taxonId,
                        organismGroup: cand.organismGroup,
                        commonNameAr: cand.commonNameAr,
                        scientificName: cand.scientificName,
                        alternativeNames: cand.alternativeNames || [],
                        family: cand.family || 'Fauna',
                        quickSummary: cand.quickSummary || cand.reasoning,
                        sizeLabel: cand.sizeLabel,
                        habitatTag: cand.habitatTag,
                        dietTag: cand.dietTag,
                        ecologicalRole: cand.ecologicalRole,
                        coexistenceNote: cand.coexistenceNote,
                        identificationTraits: cand.identificationTraits || cand.reasoning,
                        typicalBehavior: cand.typicalBehavior || '',
                        dietAndHabitat: cand.dietAndHabitat || '',
                        generalDistribution: cand.generalDistribution || '',
                        typicalRegionsAr: [],
                        referencePhotos: cand.referencePhotos,
                        wikipediaUrl: cand.wikipediaUrl,
                      };
                      const candGroupMeta = ORGANISM_GROUP_META[getSpeciesGroup(speciesMatch)];

                      return (
                        <article
                          key={cand.taxonId}
                          className={`candidate-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedTaxonId(cand.taxonId)}
                        >
                          <div className="candidate-card-row">
                            <SpeciesReferenceThumb
                              scientificName={cand.scientificName}
                              commonNameAr={cand.commonNameAr}
                              initialPhotos={cand.referencePhotos}
                              fallbackPlate={speciesMatch.defaultWatercolorPlate}
                              size={74}
                            />

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                                <div>
                                  <span
                                    className="group-pill"
                                    style={{
                                      background: candGroupMeta.accentBg,
                                      color: candGroupMeta.accentText,
                                      borderColor: candGroupMeta.accentBorder,
                                      marginBottom: 4,
                                    }}
                                  >
                                    {candGroupMeta.emoji} {candGroupMeta.label}
                                  </span>
                                  <strong style={{ fontSize: '1.02rem', display: 'block', lineHeight: 1.15 }}>
                                    {cand.commonNameAr}
                                  </strong>
                                  <span className="scientific-name" style={{ fontSize: '0.9rem' }}>
                                    {cand.scientificName}
                                  </span>
                                </div>
                                <span className="badge badge-sync-respaldado">{cand.confidenceBand}</span>
                              </div>

                              <p style={{ fontSize: '0.82rem', color: 'var(--ink-secondary)', margin: '5px 0 0', lineHeight: 1.38 }}>
                                {cand.reasoning}
                              </p>
                              {(cand.ecologicalRole || speciesMatch.ecologicalRole) && (
                                <div style={{ fontSize: '0.76rem', color: 'var(--botanical-green-dark)', marginTop: 4, fontWeight: 600 }}>
                                  🌿 {cand.ecologicalRole || speciesMatch.ecologicalRole}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="candidate-actions-row">
                            <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', flex: 1 }}>
                              {cand.keyVisibleTraits.slice(0, 2).join(' · ')}
                            </div>
                            <button
                              type="button"
                              className="btn btn-outline btn-compact"
                              onClick={(e) => {
                                e.stopPropagation();
                                openCompareModal(speciesMatch, cand);
                              }}
                            >
                              <Eye size={14} /> Comparar con mi foto
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Buscador visual de fauna y polinizadores de Argentina + búsqueda en vivo en iNaturalist */}
              <div className="field-group" style={{ marginTop: 14 }}>
                <label htmlFor="manual-species-search">
                  {idResponse.candidates.length > 0
                    ? '¿No es ninguna de estas? Buscala en Bioma y compará con fotos reales:'
                    : 'Buscá la especie en la guía visual de Bioma (con fotos reales):'}
                </label>

                <div className="group-filter-bar compact" style={{ marginBottom: 8 }}>
                  <button
                    type="button"
                    className={`group-filter-chip ${manualGroupFilter === 'todos' ? 'active' : ''}`}
                    onClick={() => setManualGroupFilter('todos')}
                  >
                    🌿 Todo
                  </button>
                  {ORGANISM_GROUPS_ORDER.map((g) => {
                    const meta = ORGANISM_GROUP_META[g];
                    return (
                      <button
                        key={g}
                        type="button"
                        className={`group-filter-chip ${manualGroupFilter === g ? 'active' : ''}`}
                        onClick={() => setManualGroupFilter(g)}
                      >
                        {meta.emoji} {meta.shortLabel}
                      </button>
                    );
                  })}
                </div>

                <div className="search-input-wrap" style={{ marginBottom: 8 }}>
                  <Search size={17} />
                  <input
                    id="manual-species-search"
                    type="search"
                    className="input-text"
                    placeholder="Ej.: Monarca, Mangangá, Vaquita, Ratucha, Hornero, Lagartija, Sapo…"
                    value={manualSearchQuery}
                    onChange={(e) => setManualSearchQuery(e.target.value)}
                  />
                </div>

                {(manualSearchQuery.trim().length > 0 ||
                  manualGroupFilter !== 'todos' ||
                  idResponse.candidates.length === 0) && (
                  <>
                    <div className="visual-catalog-list">
                      {combinedManualResults.slice(0, 14).map((sp) => {
                        const isSel = selectedTaxonId === sp.taxonId;
                        const spGroupMeta = ORGANISM_GROUP_META[getSpeciesGroup(sp)];
                        return (
                          <div
                            key={sp.taxonId}
                            className={`visual-catalog-item ${isSel ? 'selected' : ''}`}
                            onClick={() => setSelectedTaxonId(sp.taxonId)}
                          >
                            <SpeciesReferenceThumb
                              scientificName={sp.scientificName}
                              commonNameAr={sp.commonNameAr}
                              initialPhotos={sp.referencePhotos}
                              fallbackPlate={sp.defaultWatercolorPlate}
                              size={54}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                                  {sp.commonNameAr}
                                </span>
                                <span
                                  className="group-pill micro"
                                  style={{
                                    background: spGroupMeta.accentBg,
                                    color: spGroupMeta.accentText,
                                    borderColor: spGroupMeta.accentBorder,
                                  }}
                                >
                                  {spGroupMeta.emoji} {spGroupMeta.shortLabel}
                                </span>
                              </div>
                              <div className="scientific-name" style={{ fontSize: '0.82rem' }}>
                                {sp.scientificName}
                                {sp.alternativeNames.length > 0 && (
                                  <span style={{ fontStyle: 'normal', color: 'var(--ink-muted)' }}>
                                    {' '}
                                    · {sp.alternativeNames.slice(0, 2).join(', ')}
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="btn btn-secondary btn-compact"
                              onClick={(e) => {
                                e.stopPropagation();
                                openCompareModal(sp);
                              }}
                            >
                              <Eye size={14} /> Ver
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {manualSearchQuery.trim().length >= 2 && isOnline && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact"
                        style={{ marginTop: 8, width: '100%' }}
                        disabled={isSearchingLiveInat}
                        onClick={() => void handleLiveNaturalistSearch()}
                      >
                        {isSearchingLiveInat ? (
                          <Loader2 size={15} className="spin" />
                        ) : (
                          <Globe size={15} />
                        )}
                        Buscar «{manualSearchQuery.trim()}» en todo iNaturalist (Fauna y polinizadores)
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Botón principal de confirmación fijo en la parte inferior del móvil */}
              <div className="identify-sticky-cta">
                {selectedTaxonId && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    disabled={isGeneratingPlate}
                    onClick={() => void handleInitiateSpeciesConfirmation(selectedTaxonId)}
                  >
                    {isGeneratingPlate ? (
                      <>
                        <Loader2 size={18} className="spin" /> Preparando lámina naturalista…
                      </>
                    ) : (
                      <>
                        <Sparkles size={18} /> Confirmar{' '}
                        {findSpeciesByTaxonId(selectedTaxonId)?.commonNameAr} e incorporar al
                        cuaderno
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: '100%' }}
                  onClick={() => void handleKeepAsPendingIdentification()}
                >
                  Guardar como «Pendiente de identificar»
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ========================================================================
          Vista 7: Página del Cuaderno (Lámina + Foto Protagonistas + Ficha Desplegable)
         ======================================================================== */}
      {screen === 'sheet_detail' && activeSheet && activeNotebook && (
        <section className={`notebook-page style-${activeNotebook.style}`}>
          {(() => {
            const species = findSpeciesByTaxonId(activeSheet.taxonId);
            if (!species) return null;

            const activeIllustration = persisted.illustrations.find(
              (i) => i.id === activeSheet.activeIllustrationId
            );
            const illustrationUrl = resolveSheetIllustrationUrl(activeSheet, activeNotebook.style);

            const sheetSightings = persisted.sightings
              .filter(
                (s) =>
                  s.notebookId === activeNotebook.id &&
                  s.taxonId === activeSheet.taxonId &&
                  s.identificationStatus === 'identificado'
              )
              .sort((a, b) => b.observedAt.localeCompare(a.observedAt));

            const primarySighting = sheetSightings[0];

            const buildGalleryItems = (): LightboxItem[] => [
              {
                url: illustrationUrl,
                title: species.commonNameAr,
                subtitle: `${species.scientificName} · ${
                  ILLUSTRATION_STYLE_META[activeNotebook.style]?.plateLabel ||
                  'Mural de naturaleza'
                }`,
                badge: 'Ilustración',
              },
              ...sheetSightings.map((s, idx) => ({
                url: s.sanitizedPhotoDataUrl,
                title: `${species.commonNameAr} — Avistamiento #${sheetSightings.length - idx}`,
                subtitle: [
                  formatShortArgentineDate(s.observedAt),
                  s.personalNote ? `«${s.personalNote}»` : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
                badge: 'Tu foto',
              })),
            ];

            return (
              <div>
                {/* Barra superior compacta de la página */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-compact"
                    onClick={() => setScreen('notebook_detail')}
                  >
                    <ArrowLeft size={15} /> Cuaderno
                  </button>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="icon-circle-btn"
                      disabled={isGeneratingPlate}
                      onClick={() =>
                        void handleRegenerateSheetIllustration(
                          activeSheet,
                          primarySighting?.sanitizedPhotoDataUrl
                        )
                      }
                      aria-label="Pedir otra versión de la ilustración"
                      title="Pedir otra versión de la ilustración"
                    >
                      <RefreshCw size={16} className={isGeneratingPlate ? 'spin' : ''} />
                    </button>

                    {primarySighting && (
                      <button
                        type="button"
                        className="btn btn-primary btn-compact"
                        onClick={() => openShareSighting(primarySighting, activeSheet)}
                      >
                        <Share2 size={15} /> Compartir
                      </button>
                    )}
                  </div>
                </div>

                {/* Encabezado limpio y editorial de la especie */}
                <div className="sheet-header-row">
                  <div>
                    {(() => {
                      const sheetGroupMeta = ORGANISM_GROUP_META[getSpeciesGroup(species)];
                      return (
                        <span
                          className="group-pill"
                          style={{
                            background: sheetGroupMeta.accentBg,
                            color: sheetGroupMeta.accentText,
                            borderColor: sheetGroupMeta.accentBorder,
                            marginBottom: 6,
                          }}
                        >
                          {sheetGroupMeta.emoji} {sheetGroupMeta.label}
                        </span>
                      );
                    })()}
                    <h2 className="serif-heading" style={{ fontSize: '2.1rem', margin: 0, lineHeight: 1.06 }}>
                      {species.commonNameAr}
                    </h2>
                    <div className="scientific-name" style={{ fontSize: '1.15rem', marginTop: 2 }}>
                      {species.scientificName}
                    </div>
                    <div className="sheet-meta-line">
                      <span>{species.family.split(' ')[0]}</span>
                      {species.alternativeNames.length > 0 && (
                        <>
                          <span>·</span>
                          <span>{species.alternativeNames.slice(0, 2).join(', ')}</span>
                        </>
                      )}
                      <span>·</span>
                      <span>1.ª vez: {formatShortArgentineDate(activeSheet.firstObservedAt)}</span>
                    </div>
                  </div>
                </div>

                {/* PROTAGONISTAS: Ilustración + Fotografía Real (ampliables a pantalla completa) */}
                <div className="sheet-hero-showcase">
                  {primarySighting && (
                    <div className="segmented-control" role="tablist" aria-label="Vista principal">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={sheetVisualMode === 'ambas'}
                        className={`segmented-btn ${sheetVisualMode === 'ambas' ? 'active' : ''}`}
                        onClick={() => setSheetVisualMode('ambas')}
                      >
                        Ambas
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={sheetVisualMode === 'lamina'}
                        className={`segmented-btn ${sheetVisualMode === 'lamina' ? 'active' : ''}`}
                        onClick={() => setSheetVisualMode('lamina')}
                      >
                        Lámina
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={sheetVisualMode === 'foto'}
                        className={`segmented-btn ${sheetVisualMode === 'foto' ? 'active' : ''}`}
                        onClick={() => setSheetVisualMode('foto')}
                      >
                        Mi foto
                      </button>
                    </div>
                  )}

                  {sheetVisualMode === 'ambas' && primarySighting ? (
                    <div className="hero-dual-grid">
                      <button
                        type="button"
                        className={`hero-stage-card style-${activeNotebook.style}`}
                        onClick={() => openLightbox(buildGalleryItems(), 0)}
                        aria-label={`Ampliar ilustración de ${species.commonNameAr}`}
                      >
                        <img src={illustrationUrl} alt={`Ilustración de ${species.commonNameAr}`} />
                        <span className="hero-corner-tag">
                          {ILLUSTRATION_STYLE_META[activeNotebook.style]?.shortLabel || 'Muralismo'}
                        </span>
                        <span className="zoom-pill">
                          <ZoomIn size={12} /> Ampliar
                        </span>
                      </button>

                      <button
                        type="button"
                        className="hero-stage-card"
                        onClick={() => openLightbox(buildGalleryItems(), 1)}
                        aria-label={`Ampliar fotografía original de ${species.commonNameAr}`}
                      >
                        <img
                          src={primarySighting.sanitizedPhotoDataUrl}
                          alt={`Fotografía original de ${species.commonNameAr}`}
                        />
                        <span className="hero-corner-tag">Tu foto</span>
                        <span className="zoom-pill">
                          <ZoomIn size={12} /> Ampliar
                        </span>
                      </button>
                    </div>
                  ) : sheetVisualMode === 'foto' && primarySighting ? (
                    <div className="hero-single-stage">
                      <button
                        type="button"
                        className="hero-stage-card"
                        onClick={() => openLightbox(buildGalleryItems(), 1)}
                        aria-label={`Ampliar fotografía original de ${species.commonNameAr}`}
                      >
                        <img
                          src={primarySighting.sanitizedPhotoDataUrl}
                          alt={`Fotografía original de ${species.commonNameAr}`}
                        />
                        <span className="zoom-pill">
                          <ZoomIn size={13} /> Ampliar foto
                        </span>
                      </button>
                    </div>
                  ) : (
                    <div className="hero-single-stage">
                      <button
                        type="button"
                        className={`hero-stage-card style-${activeNotebook.style}`}
                        onClick={() => openLightbox(buildGalleryItems(), 0)}
                        aria-label={`Ampliar ilustración de ${species.commonNameAr}`}
                      >
                        <img src={illustrationUrl} alt={`Ilustración de ${species.commonNameAr}`} />
                        <span className="zoom-pill">
                          <ZoomIn size={13} /> Ampliar lámina
                        </span>
                      </button>
                    </div>
                  )}

                  {activeIllustration && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                      <span>{activeIllustration.variationNote}</span>
                      <span>v{activeIllustration.version}</span>
                    </div>
                  )}
                </div>

                {/* RESUMEN ACOTADO (1–2 líneas) + FICHA DE CAMPO DESPLEGABLE */}
                <div className="sheet-summary-card">
                  <p className="sheet-quick-summary">
                    {species.quickSummary || species.identificationTraits}
                  </p>

                  <div className="trait-chips-row">
                    {species.sizeLabel && <span className="trait-chip">{species.sizeLabel}</span>}
                    {species.habitatTag && <span className="trait-chip">{species.habitatTag}</span>}
                    {species.dietTag && <span className="trait-chip">{species.dietTag}</span>}
                  </div>

                  {(species.ecologicalRole || species.coexistenceNote) && (
                    <div className="eco-role-card">
                      <div className="eco-role-header">
                        <Leaf size={14} /> Rol en tu jardín y convivencia
                      </div>
                      {species.ecologicalRole && (
                        <div className="eco-role-primary">{species.ecologicalRole}</div>
                      )}
                      {species.coexistenceNote && (
                        <p className="eco-role-note">{species.coexistenceNote}</p>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    className="accordion-toggle-btn"
                    onClick={() => setShowFieldNotesAccordion((prev) => !prev)}
                    aria-expanded={showFieldNotesAccordion}
                  >
                    <span>Ficha de campo</span>
                    {showFieldNotesAccordion ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                  </button>

                  {showFieldNotesAccordion && (
                    <div>
                      <div className="field-guide-grid">
                        <div className="field-guide-item">
                          <strong>Cómo reconocerla</strong>
                          <p>{species.identificationTraits}</p>
                        </div>
                        <div className="field-guide-item">
                          <strong>Comportamiento</strong>
                          <p>{species.typicalBehavior}</p>
                        </div>
                        <div className="field-guide-item">
                          <strong>Alimentación y hábitat</strong>
                          <p>{species.dietAndHabitat}</p>
                        </div>
                        <div className="field-guide-item">
                          <strong>Distribución</strong>
                          <p>{species.generalDistribution}</p>
                        </div>
                      </div>

                      {sheetReferencePhotos.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <div className="hero-strip-label" style={{ marginBottom: 6 }}>
                            Fotos de referencia de la especie (iNaturalist):
                          </div>
                          <div className="hero-strip-row">
                            {sheetReferencePhotos.map((p, idx) => (
                              <button
                                key={`${p.thumbUrl}_${idx}`}
                                type="button"
                                className="hero-photo-thumb"
                                onClick={() =>
                                  openLightbox(
                                    sheetReferencePhotos.map((rp, i) => ({
                                      url: rp.url || rp.thumbUrl,
                                      title: `${species.commonNameAr} (${species.scientificName})`,
                                      subtitle: rp.attribution || `Referencia ${i + 1}`,
                                      badge: 'Referencia real',
                                    })),
                                    idx
                                  )
                                }
                                aria-label={`Ampliar referencia ${idx + 1} de ${species.commonNameAr}`}
                              >
                                <img src={p.thumbUrl || p.url} alt="" />
                                <span className="thumb-zoom-dot">
                                  <ZoomIn size={12} />
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* HISTORIAL DE AVISTAMIENTOS REALES */}
                <div style={{ marginTop: 22, borderTop: '1px solid var(--paper-edge)', paddingTop: 16 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 8,
                      marginBottom: 12,
                    }}
                  >
                    <h3 className="serif-heading" style={{ fontSize: '1.45rem', margin: 0 }}>
                      Mis avistamientos de {species.commonNameAr} ({sheetSightings.length})
                    </h3>
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      onClick={() => startAddSightingFlow(activeNotebook.id)}
                    >
                      <Plus size={15} /> Agregar otro avistamiento
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {sheetSightings.map((s, idx) => {
                      const isEditing = editingSightingId === s.id;
                      return (
                        <div key={s.id} className="sighting-history-card">
                          <div className="sighting-history-top">
                            <button
                              type="button"
                              className="sighting-photo-trigger"
                              onClick={() => openLightbox(buildGalleryItems(), idx + 1)}
                              aria-label={`Ampliar foto del avistamiento #${sheetSightings.length - idx}`}
                            >
                              <img
                                src={s.sanitizedPhotoDataUrl}
                                alt={`Fotografía original de ${species.commonNameAr}`}
                              />
                              <span className="thumb-zoom-dot">
                                <ZoomIn size={12} />
                              </span>
                            </button>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <strong style={{ fontSize: '0.9rem' }}>
                                  #{sheetSightings.length - idx} · {formatShortArgentineDate(s.observedAt)}
                                </strong>
                                {renderSyncBadge(s.syncStatus)}
                              </div>

                              {s.privateLocation?.label && (
                                <div style={{ fontSize: '0.78rem', color: 'var(--ink-muted)', marginTop: 2 }}>
                                  <MapPin size={12} style={{ verticalAlign: 'middle' }} />{' '}
                                  {s.privateLocation.label}
                                </div>
                              )}

                              {!isEditing && (
                                <>
                                  {s.personalNote ? (
                                    <div className="handwritten-note" style={{ marginTop: 5 }}>
                                      «{s.personalNote}»
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginTop: 5 }}>
                                      Tocá la foto para ampliarla o agregá una nota personal.
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>

                          {isEditing ? (
                            <div style={{ borderTop: '1px solid var(--paper-edge)', paddingTop: 10 }}>
                              <div className="field-group">
                                <label>Nota personal</label>
                                <textarea
                                  rows={2}
                                  className="input-textarea"
                                  value={editNoteText}
                                  onChange={(e) => setEditNoteText(e.target.value)}
                                />
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                <div className="field-group">
                                  <label>Fecha</label>
                                  <input
                                    type="datetime-local"
                                    className="input-text"
                                    value={editObservedAt}
                                    onChange={(e) => setEditObservedAt(e.target.value)}
                                  />
                                </div>
                                <div className="field-group">
                                  <label>Lugar privado</label>
                                  <input
                                    type="text"
                                    className="input-text"
                                    value={editLocationText}
                                    onChange={(e) => setEditLocationText(e.target.value)}
                                  />
                                </div>
                              </div>
                              <div className="field-group">
                                <label>Corregir especie</label>
                                <select
                                  className="input-select"
                                  value={editTaxonId}
                                  onChange={(e) => setEditTaxonId(e.target.value)}
                                >
                                  {getAllKnownSpecies().map((sp) => (
                                    <option key={sp.taxonId} value={sp.taxonId}>
                                      {ORGANISM_GROUP_META[getSpeciesGroup(sp)].emoji} {sp.commonNameAr} ({sp.scientificName})
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-compact"
                                  onClick={() => void handleSaveSightingEdits(s)}
                                >
                                  <Check size={14} /> Guardar
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-compact"
                                  onClick={() => setEditingSightingId(null)}
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-compact"
                                onClick={() => startEditingSighting(s)}
                              >
                                <Edit3 size={13} /> Editar
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-compact"
                                onClick={() => openShareSighting(s, activeSheet)}
                              >
                                <Share2 size={13} /> Compartir
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost-danger btn-compact"
                                style={{ marginLeft: 'auto' }}
                                onClick={() =>
                                  openDeleteConfirm({
                                    type: 'sighting',
                                    id: s.id,
                                    label: `este avistamiento de ${species.commonNameAr}`,
                                  })
                                }
                                aria-label="Eliminar avistamiento"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
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
          Vista 8: Respaldo, Estado de IA y Ajustes
         ======================================================================== */}
      {screen === 'pending_center' && (
        <section className="notebook-page">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              {persisted.user.photoURL && (
                <img
                  src={persisted.user.photoURL}
                  alt={persisted.user.displayName}
                  referrerPolicy="no-referrer"
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: '999px',
                    border: '2px solid var(--paper-edge)',
                    objectFit: 'cover',
                    flexShrink: 0,
                  }}
                />
              )}
              <div style={{ minWidth: 0 }}>
                <h2 className="serif-heading" style={{ fontSize: '1.75rem', margin: 0, lineHeight: 1.1 }}>
                  Respaldo y ajustes
                </h2>
                <span
                  style={{
                    fontSize: '0.82rem',
                    color: 'var(--ink-secondary)',
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {persisted.user.email}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={() => setScreen('library')}
            >
              <ArrowLeft size={15} /> Cuadernos
            </button>
          </div>

          {/* Estado de protección con cuenta de Google autorizada */}
          <div
            className={`callout-box ${serverAuthStatus?.googleAuthConfigured ? '' : 'warning'}`}
            style={{ marginBottom: 14 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7 }}>
                <span
                  className={`ai-status-dot ${
                    serverAuthStatus?.googleAuthConfigured ? 'ready' : 'pending'
                  }`}
                />
                Acceso protegido con Google
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={() => void handleSignOut()}
              >
                <LogOut size={13} /> Cerrar sesión
              </button>
            </div>
            {serverAuthStatus?.googleAuthConfigured ? (
              <p style={{ margin: '6px 0 0', fontSize: '0.83rem', color: 'var(--ink-secondary)' }}>
                Activo · La cuota de Gemini está protegida en el servidor únicamente para las{' '}
                {serverAuthStatus.allowedEmailsCount} cuentas de Google autorizadas.
              </p>
            ) : (
              <p style={{ margin: '6px 0 0', fontSize: '0.83rem', color: '#5A4010' }}>
                Modo local sin bloqueo de cuenta. Agregá <code>GOOGLE_CLIENT_ID</code> en{' '}
                <code>.env</code> (o en tu hosting) para exigir Google Sign-In real restringido a
                las cuentas autorizadas.
              </p>
            )}
          </div>

          {/* Estado del motor de IA (Google Gemini) */}
          <div
            className={`callout-box ${aiHealth?.aiConfigured ? '' : 'warning'}`}
            style={{ marginBottom: 14 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7 }}>
                <span className={`ai-status-dot ${aiHealth?.aiConfigured ? 'ready' : 'pending'}`} />
                Motor de visión e ilustración (Google Gemini)
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={() => void refreshAiHealth()}
              >
                <RefreshCw size={13} /> Comprobar
              </button>
            </div>
            {aiHealth?.aiConfigured ? (
              <div style={{ marginTop: 6, fontSize: '0.84rem', color: 'var(--ink-secondary)' }}>
                <p style={{ margin: 0 }}>
                  Visión conectada ({aiHealth.visionModel}) + referencias visuales reales de
                  iNaturalist.
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem' }}>
                  {aiHealth.imageFallbackProviders && aiHealth.imageFallbackProviders.length > 0 ? (
                    <>
                      Ilustraciones IA: <strong>Gemini + {aiHealth.imageFallbackProviders.join(' / ')}</strong>{' '}
                      activos.
                    </>
                  ) : (
                    <>
                      Ilustraciones (Muralismo, Acuarela y Grafito): <strong>Gemini</strong> (requiere cuota de imagen) con respaldo
                      automático de <strong>estudio artístico local</strong>. Para generación 100%
                      IA sin tarjeta, podés agregar <code>HUGGINGFACE_API_KEY</code> en el
                      servidor.
                    </>
                  )}
                </p>
              </div>
            ) : (
              <p style={{ margin: '6px 0 0', fontSize: '0.84rem', color: '#5A4010' }}>
                Todavía falta agregar <code>GEMINI_API_KEY</code> en el archivo <code>.env</code>{' '}
                del servidor para activar la identificación automática de fotografías y la
                generación de láminas por IA. Las fotos de referencia de iNaturalist ya funcionan
                sin clave.
              </p>
            )}
          </div>

          {/* Respaldo en la nube y cambio de teléfono */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 18 }}>
            <div className="callout-box">
              <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Cloud size={16} /> Respaldo en Google
              </div>
              <p style={{ fontSize: '0.83rem', margin: '0 0 10px', color: 'var(--ink-secondary)' }}>
                Cada fotografía y nota queda respaldada de forma segura cuando hay conexión.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-compact"
                style={{ width: '100%' }}
                onClick={() => void syncAllPendingSightings()}
              >
                <UploadCloud size={15} /> Sincronizar pendientes
              </button>
            </div>

            <div className="callout-box">
              <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Smartphone size={16} /> Cambiar de teléfono
              </div>
              <p style={{ fontSize: '0.83rem', margin: '0 0 10px', color: 'var(--ink-secondary)' }}>
                Restaurá tus cuadernos, láminas y fotografías confirmadas desde tu cuenta de Google.
              </p>
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                style={{ width: '100%' }}
                onClick={() => void handleSimulatePhoneSwitchRestore()}
              >
                <RefreshCw size={15} /> Restaurar respaldo en este dispositivo
              </button>
            </div>
          </div>

          {/* Instalación como app (PWA sin barra de direcciones) */}
          <div className="callout-box" style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Smartphone size={16} /> Instalar Bioma como aplicación
            </div>
            {isStandaloneApp ? (
              <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--botanical-green-dark)' }}>
                Ya estás usando Bioma en modo aplicación a pantalla completa.
              </p>
            ) : installPromptEvent ? (
              <div>
                <p style={{ margin: '0 0 10px', fontSize: '0.83rem', color: 'var(--ink-secondary)' }}>
                  Instalá Bioma en la pantalla de inicio para abrirla como una app nativa, sin
                  barra de direcciones del navegador.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-compact"
                  style={{ width: '100%' }}
                  onClick={() => void handleTriggerPwaInstall()}
                >
                  <Download size={15} /> Instalar aplicación en pantalla de inicio
                </button>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--ink-secondary)' }}>
                {typeof window !== 'undefined' && !window.isSecureContext
                  ? 'Para instalarla en Android sin barra de direcciones, abrila desde su dirección HTTPS de producción (Chrome solo habilita instalación PWA sobre HTTPS) y tocá «Instalar aplicación».'
                  : 'En Chrome Android tocá el menú ⋮ → «Instalar aplicación» (o en Safari iOS: Compartir → «Agregar a pantalla de inicio»).'}
              </p>
            )}
          </div>

          {/* Copia de seguridad portátil en archivo (.json) */}
          <div className="callout-box" style={{ marginBottom: 18 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Download size={16} /> Copia de seguridad en archivo
            </div>
            <p style={{ fontSize: '0.83rem', margin: '0 0 10px', color: 'var(--ink-secondary)' }}>
              Exportá todos tus cuadernos, láminas y fotografías en un archivo <code>.json</code>{' '}
              para guardarlo en Drive o restaurarlo en otro celular en segundos.
            </p>
            <input
              ref={backupImportInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => void handleImportBackupFile(e)}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                style={{ flex: 1 }}
                onClick={() => void handleExportBackupFile()}
              >
                <Download size={15} /> Exportar respaldo
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                style={{ flex: 1 }}
                onClick={() => backupImportInputRef.current?.click()}
              >
                <Upload size={15} /> Importar respaldo
              </button>
            </div>
          </div>

          {/* Preferencias de la app */}
          <div className="callout-box" style={{ marginBottom: 18 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Preferencias y pruebas</div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(e) => setReducedMotion(e.target.checked)}
              />
              <span>Reducir animaciones de hojas</span>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={!isOnline}
                onChange={(e) => setIsOnline(!e.target.checked)}
              />
              <span>
                {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />} Simular modo sin internet
              </span>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={simulateUploadFailure}
                onChange={(e) => setSimulateUploadFailure(e.target.checked)}
              />
              <span>Simular falla transitoria de subida</span>
            </label>
          </div>

          {/* Listado completo de registros */}
          <h3 className="serif-heading" style={{ fontSize: '1.4rem', marginBottom: 10 }}>
            Todos los registros ({persisted.sightings.length})
          </h3>
          {persisted.sightings.length === 0 ? (
            <p style={{ color: 'var(--ink-secondary)', fontSize: '0.9rem' }}>
              Todavía no cargaste fotografías.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                      gap: 10,
                      padding: 10,
                      background: 'var(--paper-inset)',
                      borderRadius: 11,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <img
                        src={s.sanitizedPhotoDataUrl}
                        alt="Miniatura"
                        style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 8 }}
                      />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                          {sp ? sp.commonNameAr : 'Pendiente de identificar'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>
                          {nb?.title || 'Cuaderno'} · {formatShortArgentineDate(s.observedAt)}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="badge badge-subtle">
                        {formatIdentificationStatusLabel(s.identificationStatus)}
                      </span>
                      {renderSyncBadge(s.syncStatus)}
                      {s.identificationStatus !== 'identificado' && (
                        <button
                          type="button"
                          className="btn btn-primary btn-compact"
                          onClick={() => {
                            if (nb) setActiveNotebookId(nb.id);
                            void runIdentificationForSighting(s, persisted, 'auto', true);
                          }}
                        >
                          <Sparkles size={13} /> Identificar
                        </button>
                      )}
                      {s.syncStatus !== 'respaldado' && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-compact"
                          onClick={() => void syncSingleSightingWithFeedback(s, persisted)}
                        >
                          <UploadCloud size={13} /> Subir
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {(() => {
            const metrics = getAIConsumptionMetrics();
            return (
              <div style={{ marginTop: 16, fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                Uso de IA en esta sesión: {metrics.identificationsExecuted} análisis ·{' '}
                {metrics.identificationsPreventedByCache} en caché ·{' '}
                {metrics.illustrationsGenerated} láminas creadas ·{' '}
                {metrics.illustrationsReusedFromCatalog} reutilizadas.
              </div>
            );
          })()}
        </section>
      )}

      {/* Barra inferior móvil fija */}
      {showBottomNav && (
        <nav className="bottom-nav" aria-label="Navegación principal">
          <button
            type="button"
            className={`bottom-nav-item ${
              screen === 'library' || screen === 'notebook_detail' ? 'active' : ''
            }`}
            onClick={() => setScreen('library')}
          >
            <BookOpen size={20} />
            <span>Cuadernos</span>
          </button>

          <button
            type="button"
            className="bottom-nav-fab"
            onClick={() => startAddSightingFlow()}
          >
            <Camera size={19} /> Registrar hallazgo
          </button>

          <button
            type="button"
            className={`bottom-nav-item ${screen === 'pending_center' ? 'active' : ''}`}
            onClick={openPendingSettings}
          >
            <Cloud size={20} />
            <span>Respaldo</span>
            {pendingSightingsCount > 0 && (
              <span className="bottom-nav-badge">{pendingSightingsCount}</span>
            )}
          </button>
        </nav>
      )}

      {/* Modal Comparador Visual Lado a Lado */}
      {compareTarget && activeSightingForId && (
        <SpeciesComparisonModal
          userPhotoUrl={activeSightingForId.sanitizedPhotoDataUrl}
          species={compareTarget.species}
          candidate={compareTarget.candidate}
          onSelectSpecies={(taxonId) => setSelectedTaxonId(taxonId)}
          onZoomImages={(items, initialIndex) => openLightbox(items, initialIndex || 0)}
          onClose={() => setCompareTarget(null)}
        />
      )}

      {/* Visor Lightbox a pantalla completa */}
      {lightboxState && (
        <ImageLightbox
          items={lightboxState.items}
          initialIndex={lightboxState.index}
          onClose={() => setLightboxState(null)}
        />
      )}

      {/* Modal Confirmar Eliminación */}
      {deleteConfirm && (
        <div
          className="modal-backdrop"
          role="alertdialog"
          aria-modal="true"
          aria-label="Confirmar eliminación"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteConfirm(null);
          }}
        >
          <div className="modal-sheet" style={{ maxWidth: 420 }}>
            <div className="modal-sheet-handle" aria-hidden="true" />
            <h3 className="serif-heading" style={{ fontSize: '1.5rem', marginBottom: 6 }}>
              ¿Eliminar {deleteConfirm.label}?
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--ink-secondary)', margin: '0 0 16px' }}>
              Esta acción quitará el registro de tu dispositivo.
            </p>
            <div className="modal-sheet-actions">
              <button
                type="button"
                className="btn btn-terracotta"
                style={{ flex: 1 }}
                onClick={handleConfirmDelete}
              >
                <Trash2 size={16} /> Sí, eliminar
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setDeleteConfirm(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal F07: Compartir avistamiento */}
      {shareSightingTarget && activeNotebook && (
        <ShareSightingModal
          notebook={activeNotebook}
          species={
            findSpeciesByTaxonId(shareSightingTarget.sheet.taxonId) || ARGENTINA_BIRDS_CATALOG[0]
          }
          sighting={shareSightingTarget.sighting}
          illustrationUrl={resolveSheetIllustrationUrl(
            shareSightingTarget.sheet,
            activeNotebook.style
          )}
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
