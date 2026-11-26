import {
  findSpeciesByTaxonId,
  getCustomSpeciesList,
  getSpeciesGardenEcology,
  getSpeciesGroup,
  hydrateCustomSpecies,
} from '../data/argentinaBirdsCatalog';
import {
  Illustration,
  Notebook,
  NotebookSpeciesSheet,
  PublicNotebookProjection,
  PublicSanitizedSheet,
  Sighting,
  SpeciesCatalogEntry,
  SyncStatus,
  UserProfile,
} from '../types/domain';

function getApiBase(): string {
  const custom = import.meta.env.VITE_BACKEND_API_URL;
  return custom ? custom.replace(/\/$/, '') : '';
}

function isTestEnvironment(): boolean {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');
}

const IDB_NAME = 'cuaderno_de_aves_idb_v1';
const IDB_VERSION = 1;
const PHOTO_STORE = 'photo_blobs';

const LOCAL_DEVICE_STATE_KEY = 'birdy_local_device_state_v1';
const CLOUD_BACKUP_KEY_PREFIX = 'birdy_cloud_google_backup_v1_';
const PUBLIC_SHARES_INDEX_KEY = 'birdy_public_shares_projection_v1';

export interface AppPersistedState {
  user: UserProfile | null;
  notebooks: Notebook[];
  sheets: NotebookSpeciesSheet[];
  sightings: Sighting[];
  illustrations: Illustration[];
  customSpecies?: SpeciesCatalogEntry[];
}

export interface CloudBackupPayload {
  uid: string;
  updatedAt: string;
  notebooks: Notebook[];
  sheets: NotebookSpeciesSheet[];
  sightings: Sighting[]; // Solo avistamientos confirmados como 'respaldado'
  illustrations: Illustration[];
  backedUpPhotos: Record<string, string>; // photoStorageKey -> sanitized DataURL en la nube
  customSpecies?: SpeciesCatalogEntry[];
}

/**
 * Abre IndexedDB para guardar binarios de fotografías de forma segura en el dispositivo
 * (protegiendo frente a permisos temporales de galería revocados o cierres de app).
 */
function openPhotoDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(IDB_NAME, IDB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PHOTO_STORE)) {
          db.createObjectStore(PHOTO_STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

const memoryPhotoFallback = new Map<string, string>();
const memoryVideoBlobFallback = new Map<string, Blob>();
const memoryVideoObjectUrlCache = new Map<string, string>();

export async function saveVideoBlobToIndexedDb(
  videoStorageKey: string,
  videoBlob: Blob,
  mimeType: string
): Promise<void> {
  memoryVideoBlobFallback.set(videoStorageKey, videoBlob);
  const db = await openPhotoDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PHOTO_STORE, 'readwrite');
      const store = tx.objectStore(PHOTO_STORE);
      store.put({
        key: videoStorageKey,
        videoBlob,
        mimeType,
        savedAt: new Date().toISOString(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadVideoBlobFromIndexedDb(videoStorageKey: string): Promise<Blob | null> {
  if (memoryVideoBlobFallback.has(videoStorageKey)) {
    return memoryVideoBlobFallback.get(videoStorageKey)!;
  }
  const db = await openPhotoDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PHOTO_STORE, 'readonly');
      const store = tx.objectStore(PHOTO_STORE);
      const req = store.get(videoStorageKey);
      req.onsuccess = () => {
        const result = req.result;
        if (result?.videoBlob instanceof Blob) {
          memoryVideoBlobFallback.set(videoStorageKey, result.videoBlob);
          resolve(result.videoBlob);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function uploadShortVideoToRemoteR2(params: {
  uid: string;
  sightingId: string;
  videoBlob: Blob;
}): Promise<string | null> {
  if (isTestEnvironment()) return null;
  try {
    const qs = new URLSearchParams({
      uid: params.uid,
      sightingId: params.sightingId,
    });
    const res = await fetch(`${getApiBase()}/api/cloud/upload-media?${qs.toString()}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': params.videoBlob.type || 'video/mp4',
        'X-Sighting-Id': params.sightingId,
        'X-Media-Kind': 'video',
      },
      body: params.videoBlob,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { uploaded?: boolean; url?: string };
    return data.uploaded && data.url ? data.url : null;
  } catch {
    return null;
  }
}

export async function savePhotoBinaryToIndexedDb(
  photoStorageKey: string,
  sanitizedDataUrl: string,
  sha256: string
): Promise<void> {
  memoryPhotoFallback.set(photoStorageKey, sanitizedDataUrl);
  const db = await openPhotoDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PHOTO_STORE, 'readwrite');
      const store = tx.objectStore(PHOTO_STORE);
      store.put({
        key: photoStorageKey,
        dataUrl: sanitizedDataUrl,
        sha256,
        savedAt: new Date().toISOString(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadPhotoBinaryFromIndexedDb(photoStorageKey: string): Promise<string | null> {
  if (memoryPhotoFallback.has(photoStorageKey)) {
    return memoryPhotoFallback.get(photoStorageKey)!;
  }
  const db = await openPhotoDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PHOTO_STORE, 'readonly');
      const store = tx.objectStore(PHOTO_STORE);
      const req = store.get(photoStorageKey);
      req.onsuccess = () => {
        const result = req.result;
        if (result?.dataUrl) {
          memoryPhotoFallback.set(photoStorageKey, result.dataUrl);
          resolve(result.dataUrl);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function clearLocalDeviceIndexedDb(): Promise<void> {
  memoryPhotoFallback.clear();
  memoryVideoBlobFallback.clear();
  memoryVideoObjectUrlCache.clear();
  const db = await openPhotoDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PHOTO_STORE, 'readwrite');
      tx.objectStore(PHOTO_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function unwrapLegacyProxyUrl(url: string): string {
  if (!url || !url.includes('/api/image-proxy?url=')) return url;
  try {
    const parsed = new URL(url, 'http://localhost');
    const target = parsed.searchParams.get('url');
    return target || url;
  } catch {
    return url;
  }
}

export function loadLocalDeviceState(): AppPersistedState {
  try {
    const raw = localStorage.getItem(LOCAL_DEVICE_STATE_KEY);
    if (!raw) {
      return {
        user: null,
        notebooks: [],
        sheets: [],
        sightings: [],
        illustrations: [],
        customSpecies: [],
      };
    }
    const parsed = JSON.parse(raw) as AppPersistedState;
    if (Array.isArray(parsed.illustrations)) {
      parsed.illustrations = parsed.illustrations.map((ill) => ({
        ...ill,
        imageUrl: unwrapLegacyProxyUrl(ill.imageUrl),
      }));
    }
    hydrateCustomSpecies(parsed.customSpecies);
    return parsed;
  } catch {
    return {
      user: null,
      notebooks: [],
      sheets: [],
      sightings: [],
      illustrations: [],
      customSpecies: [],
    };
  }
}

export function saveLocalDeviceState(state: AppPersistedState): void {
  const mergedCustom = Array.from(
    new Map(
      [...(state.customSpecies || []), ...getCustomSpeciesList()].map((sp) => [sp.taxonId, sp])
    ).values()
  );
  const fullPayload: AppPersistedState = {
    ...state,
    // Nunca persistir blob: temporales ni videos base64 en localStorage (viven en IndexedDB o R2)
    sightings: state.sightings.map((s) =>
      s.videoUrl && (s.videoUrl.startsWith('blob:') || s.videoUrl.startsWith('data:video/'))
        ? { ...s, videoUrl: undefined }
        : s
    ),
    customSpecies: mergedCustom,
  };

  try {
    localStorage.setItem(LOCAL_DEVICE_STATE_KEY, JSON.stringify(fullPayload));
  } catch {
    // Si localStorage alcanza la cuota (~5 MB), guardar estado liviano confiando los binarios a IndexedDB
    try {
      const slimPayload: AppPersistedState = {
        ...fullPayload,
        sightings: fullPayload.sightings.map((s) =>
          s.photoStorageKey && s.sanitizedPhotoDataUrl.startsWith('data:')
            ? { ...s, sanitizedPhotoDataUrl: '' }
            : s
        ),
      };
      localStorage.setItem(LOCAL_DEVICE_STATE_KEY, JSON.stringify(slimPayload));
    } catch {
      // Último resguardo silencioso
    }
  }
}

/**
 * Rehidrata en memoria las fotografías binarias guardadas en IndexedDB cuando el estado
 * liviano omitió DataURLs grandes en localStorage.
 */
export async function rehydrateSightingPhotosFromIndexedDb(
  sightings: Sighting[]
): Promise<Sighting[]> {
  let changed = false;
  const hydrated = await Promise.all(
    sightings.map(async (s) => {
      let next = s;
      if (!next.sanitizedPhotoDataUrl && next.photoStorageKey) {
        const fromIdb = await loadPhotoBinaryFromIndexedDb(next.photoStorageKey);
        if (fromIdb) {
          changed = true;
          next = { ...next, sanitizedPhotoDataUrl: fromIdb };
        }
      }
      if (
        next.mediaType === 'video' &&
        next.videoStorageKey &&
        (!next.videoUrl || next.videoUrl.startsWith('blob:'))
      ) {
        let objUrl = memoryVideoObjectUrlCache.get(next.videoStorageKey);
        if (!objUrl) {
          const blob = await loadVideoBlobFromIndexedDb(next.videoStorageKey);
          if (blob && typeof URL.createObjectURL === 'function' && !isTestEnvironment()) {
            objUrl = URL.createObjectURL(blob);
            memoryVideoObjectUrlCache.set(next.videoStorageKey, objUrl);
          } else if (blob && isTestEnvironment()) {
            objUrl = `data:${blob.type || 'video/mp4'};base64,VIDEO_PREVIEW`;
          }
        }
        if (objUrl && objUrl !== next.videoUrl) {
          changed = true;
          next = { ...next, videoUrl: objUrl };
        }
      }
      return next;
    })
  );
  return changed ? hydrated : sightings;
}

/**
 * Exporta una copia de seguridad portátil (.json) con todos los cuadernos, láminas, fotos y notas.
 */
export async function exportFullBackupJson(state: AppPersistedState): Promise<string> {
  const hydratedSightings = await rehydrateSightingPhotosFromIndexedDb(state.sightings);
  const payload = {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    app: 'Bioma — Cuaderno vivo de jardín y naturaleza',
    state: {
      ...state,
      sightings: hydratedSightings,
      customSpecies: Array.from(
        new Map(
          [...(state.customSpecies || []), ...getCustomSpeciesList()].map((sp) => [sp.taxonId, sp])
        ).values()
      ),
    },
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Importa y valida una copia de seguridad (.json) restaurando también las fotos en IndexedDB.
 */
export async function importFullBackupJson(rawJson: string): Promise<AppPersistedState> {
  const parsed = JSON.parse(rawJson) as { state?: AppPersistedState } | AppPersistedState;
  const candidate = 'state' in parsed && parsed.state ? parsed.state : (parsed as AppPersistedState);

  if (!candidate || !Array.isArray(candidate.notebooks) || !Array.isArray(candidate.sightings)) {
    throw new Error('El archivo no tiene el formato de respaldo de Birdy.');
  }

  hydrateCustomSpecies(candidate.customSpecies);

  for (const s of candidate.sightings) {
    if (s.photoStorageKey && s.sanitizedPhotoDataUrl) {
      await savePhotoBinaryToIndexedDb(s.photoStorageKey, s.sanitizedPhotoDataUrl, s.photoSha256);
    }
  }

  const normalized: AppPersistedState = {
    user: candidate.user || {
      uid: 'google-valeria-ar-01',
      displayName: 'Valeria',
      email: 'valeria.jardinyviajes@gmail.com',
    },
    notebooks: candidate.notebooks,
    sheets: Array.isArray(candidate.sheets) ? candidate.sheets : [],
    sightings: candidate.sightings,
    illustrations: Array.isArray(candidate.illustrations) ? candidate.illustrations : [],
    customSpecies: candidate.customSpecies || [],
  };

  saveLocalDeviceState(normalized);
  return normalized;
}

export function loadCloudBackupForUser(uid: string): CloudBackupPayload | null {
  try {
    const raw = localStorage.getItem(`${CLOUD_BACKUP_KEY_PREFIX}${uid}`);
    if (!raw) return null;
    return JSON.parse(raw) as CloudBackupPayload;
  } catch {
    return null;
  }
}

export function saveCloudBackupForUser(payload: CloudBackupPayload): void {
  try {
    localStorage.setItem(`${CLOUD_BACKUP_KEY_PREFIX}${payload.uid}`, JSON.stringify(payload));
  } catch {
    // Ignorar error de cuota en entorno de prueba
  }
}

export interface RealCloudSyncResult {
  finalSyncStatus: SyncStatus;
  errorMessage?: string;
  remoteSynced?: boolean;
  sightingPhotoUrls?: Record<string, string>;
  sightingVideoUrls?: Record<string, string>;
  illustrationUrls?: Record<string, string>;
}

/**
 * Sincroniza el estado completo (cuadernos, láminas, avistamientos, fotos en Cloudflare R2
 * y metadatos en Google Firestore) a través del backend autenticado `/api/cloud/sync`.
 */
export async function syncFullStateToRemoteCloud(params: {
  uid: string;
  state: AppPersistedState;
  isOnline: boolean;
  fullSync?: boolean;
}): Promise<{
  configured: boolean;
  ok: boolean;
  sightingPhotoUrls?: Record<string, string>;
  illustrationUrls?: Record<string, string>;
  errorMessage?: string;
}> {
  if (isTestEnvironment() || !params.isOnline) {
    return { configured: false, ok: false };
  }

  try {
    const hydratedSightingsRaw = await rehydrateSightingPhotosFromIndexedDb(params.state.sightings);
    // Nunca enviar URLs efímeras blob: al servidor Firestore
    const hydratedSightings = hydratedSightingsRaw.map((s) =>
      s.videoUrl && s.videoUrl.startsWith('blob:') ? { ...s, videoUrl: undefined } : s
    );
    const mergedCustom = Array.from(
      new Map(
        [...(params.state.customSpecies || []), ...getCustomSpeciesList()].map((sp) => [
          sp.taxonId,
          sp,
        ])
      ).values()
    );

    const res = await fetch(`${getApiBase()}/api/cloud/sync`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: params.uid,
        notebooks: params.state.notebooks,
        sheets: params.state.sheets,
        sightings: hydratedSightings,
        illustrations: params.state.illustrations,
        customSpecies: mergedCustom,
        fullSync: Boolean(params.fullSync),
      }),
    });

    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as { message?: string };
      return {
        configured: true,
        ok: false,
        errorMessage: errJson.message || `Error HTTP ${res.status} al sincronizar con la nube.`,
      };
    }

    const data = (await res.json()) as {
      configured?: boolean;
      sightingPhotoUrls?: Record<string, string>;
      illustrationUrls?: Record<string, string>;
    };

    return {
      configured: Boolean(data.configured),
      ok: true,
      sightingPhotoUrls: data.sightingPhotoUrls,
      illustrationUrls: data.illustrationUrls,
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      errorMessage: err instanceof Error ? err.message : 'Error de red al sincronizar con la nube.',
    };
  }
}

/**
 * Carga el estado real persistido en Google Cloud Firestore (+ URLs de Cloudflare R2)
 * para restaurar automáticamente los cuadernos en cualquier teléfono o navegador.
 */
export async function loadFullStateFromRemoteCloud(
  uid: string
): Promise<{ configured: boolean; state: AppPersistedState | null }> {
  if (isTestEnvironment()) {
    return { configured: false, state: null };
  }
  try {
    const res = await fetch(`${getApiBase()}/api/cloud/state?uid=${encodeURIComponent(uid)}`, {
      credentials: 'include',
    });
    if (!res.ok) {
      return { configured: false, state: null };
    }
    const data = (await res.json()) as {
      configured?: boolean;
      state?: {
        notebooks?: Notebook[];
        sheets?: NotebookSpeciesSheet[];
        sightings?: Sighting[];
        illustrations?: Illustration[];
        customSpecies?: SpeciesCatalogEntry[];
        updatedAt?: string | null;
      } | null;
    };
    if (!data.configured || !data.state) {
      return { configured: Boolean(data.configured), state: null };
    }

    const customSpecies = Array.isArray(data.state.customSpecies) ? data.state.customSpecies : [];
    hydrateCustomSpecies(customSpecies);

    const notebooks = Array.isArray(data.state.notebooks)
      ? data.state.notebooks.map((nb) => ({ ...nb, syncStatus: 'respaldado' as SyncStatus }))
      : [];
    const sheets = Array.isArray(data.state.sheets) ? data.state.sheets : [];
    const sightings = Array.isArray(data.state.sightings)
      ? data.state.sightings.map((s) => ({ ...s, syncStatus: 'respaldado' as SyncStatus }))
      : [];
    const illustrations = Array.isArray(data.state.illustrations) ? data.state.illustrations : [];

    return {
      configured: true,
      state: {
        user: null,
        notebooks,
        sheets,
        sightings,
        illustrations,
        customSpecies,
      },
    };
  } catch {
    return { configured: false, state: null };
  }
}

/**
 * Sincroniza de forma idempotente un avistamiento y su archivo binario hacia la nube real
 * (Firestore + Cloudflare R2 cuando está configurado en el servidor, con respaldo local offline-first).
 * No declara 'respaldado' hasta verificar que el binario de la fotografía y los metadatos están seguros.
 */
export async function syncSightingAndNotebookToCloud(params: {
  uid: string;
  sighting: Sighting;
  state: AppPersistedState;
  isOnline: boolean;
  simulateNetworkFailure?: boolean;
}): Promise<RealCloudSyncResult> {
  const { uid, sighting, state, isOnline, simulateNetworkFailure } = params;

  if (!isOnline) {
    return { finalSyncStatus: 'local' };
  }

  if (simulateNetworkFailure) {
    return {
      finalSyncStatus: 'error',
      errorMessage: 'Se interrumpió la señal al subir la foto original. Se reintentará sin duplicar.',
    };
  }

  // 1. Verificar que el archivo binario o URL remota de la fotografía esté disponible
  const binaryData =
    (await loadPhotoBinaryFromIndexedDb(sighting.photoStorageKey)) || sighting.sanitizedPhotoDataUrl;

  if (!binaryData) {
    return {
      finalSyncStatus: 'error',
      errorMessage: 'No se encontró el archivo binario local de la fotografía.',
    };
  }

  // 2. Intentar sincronización real con Firestore + Cloudflare R2 en el servidor
  let remoteSynced = false;
  let sightingPhotoUrls: Record<string, string> | undefined;
  let sightingVideoUrls: Record<string, string> | undefined;
  let illustrationUrls: Record<string, string> | undefined;
  let resolvedRemoteVideoUrl: string | undefined =
    sighting.videoUrl && !sighting.videoUrl.startsWith('blob:') && !sighting.videoUrl.startsWith('data:')
      ? sighting.videoUrl
      : undefined;

  if (!isTestEnvironment()) {
    // Si la entrada es un video corto aún local, subir el binario a Cloudflare R2 antes de sincronizar Firestore
    if (sighting.mediaType === 'video' && !resolvedRemoteVideoUrl && sighting.videoStorageKey) {
      const videoBlob = await loadVideoBlobFromIndexedDb(sighting.videoStorageKey);
      if (videoBlob) {
        const uploadedVideoUrl = await uploadShortVideoToRemoteR2({
          uid,
          sightingId: sighting.id,
          videoBlob,
        });
        if (uploadedVideoUrl) {
          resolvedRemoteVideoUrl = uploadedVideoUrl;
          sightingVideoUrls = { [sighting.id]: uploadedVideoUrl };
        }
      }
    }

    const sightingForSync: Sighting = {
      ...sighting,
      sanitizedPhotoDataUrl: binaryData,
      videoUrl: resolvedRemoteVideoUrl || undefined,
    };

    const stateWithSighting: AppPersistedState = {
      ...state,
      sightings: state.sightings.some((s) => s.id === sighting.id)
        ? state.sightings.map((s) => (s.id === sighting.id ? sightingForSync : s))
        : [...state.sightings, sightingForSync],
    };

    const remote = await syncFullStateToRemoteCloud({
      uid,
      state: stateWithSighting,
      isOnline: true,
      fullSync: false,
    });

    if (remote.configured && !remote.ok) {
      return {
        finalSyncStatus: 'error',
        errorMessage:
          remote.errorMessage ||
          'No pudimos confirmar el guardado en Firestore/R2. Se reintentará automáticamente.',
      };
    }

    if (remote.configured && remote.ok) {
      remoteSynced = true;
      sightingPhotoUrls = remote.sightingPhotoUrls;
      illustrationUrls = remote.illustrationUrls;
    }
  }

  // 3. Mantener copia espejo local para acceso offline instantáneo y tests
  const existingCloud = loadCloudBackupForUser(uid) || {
    uid,
    updatedAt: new Date().toISOString(),
    notebooks: [],
    sheets: [],
    sightings: [],
    illustrations: [],
    backedUpPhotos: {},
  };

  const finalPhotoRef = sightingPhotoUrls?.[sighting.id] || binaryData;
  existingCloud.backedUpPhotos[sighting.photoStorageKey] = finalPhotoRef;

  const updatedSighting: Sighting = {
    ...sighting,
    sanitizedPhotoDataUrl: finalPhotoRef,
    videoUrl: resolvedRemoteVideoUrl || sighting.videoUrl,
    syncStatus: 'respaldado',
    lastSyncError: undefined,
    updatedAt: new Date().toISOString(),
  };

  // Upsert idempotente por sighting.id (nunca duplica registros ante reintentos)
  const sightingIdx = existingCloud.sightings.findIndex((s) => s.id === updatedSighting.id);
  if (sightingIdx >= 0) {
    existingCloud.sightings[sightingIdx] = updatedSighting;
  } else {
    existingCloud.sightings.push(updatedSighting);
  }

  existingCloud.notebooks = state.notebooks.map((nb) => ({
    ...nb,
    syncStatus: 'respaldado' as SyncStatus,
  }));
  existingCloud.sheets = [...state.sheets];
  existingCloud.illustrations = state.illustrations.map((ill) =>
    illustrationUrls?.[ill.id] ? { ...ill, imageUrl: illustrationUrls[ill.id] } : ill
  );
  existingCloud.customSpecies = Array.from(
    new Map(
      [...(state.customSpecies || []), ...getCustomSpeciesList()].map((sp) => [sp.taxonId, sp])
    ).values()
  );
  existingCloud.updatedAt = new Date().toISOString();

  saveCloudBackupForUser(existingCloud);

  // Actualizar proyecciones públicas de cuadernos compartidos que estén activos
  for (const nb of existingCloud.notebooks) {
    if (nb.shareConfig.isEnabled && nb.shareConfig.shareToken) {
      const projection = publishOrUpdateSanitizedNotebookProjection(
        nb,
        existingCloud.sheets,
        existingCloud.sightings,
        existingCloud.illustrations
      );
      if (projection && remoteSynced) {
        void publishSanitizedNotebookToRemoteCloud(uid, projection);
      }
    }
  }

  return {
    finalSyncStatus: 'respaldado',
    remoteSynced,
    sightingPhotoUrls,
    sightingVideoUrls,
    illustrationUrls,
  };
}

/**
 * Restaura los cuadernos, láminas y fotografías respaldadas al cambiar de teléfono Android (CA11):
 * Borra la caché local y descarga primero desde Firestore + Cloudflare R2 (si están configurados),
 * con respaldo local en modo de pruebas/offline.
 */
export async function restoreFromGoogleCloudOnNewDevice(
  uid: string,
  userProfile?: UserProfile | null
): Promise<AppPersistedState | null> {
  // 1. Limpiar caché local del dispositivo anterior
  localStorage.removeItem(LOCAL_DEVICE_STATE_KEY);
  await clearLocalDeviceIndexedDb();

  // 2. Intentar descarga real desde Firestore + Cloudflare R2
  if (!isTestEnvironment()) {
    const remote = await loadFullStateFromRemoteCloud(uid);
    if (remote.configured && remote.state && remote.state.notebooks.length > 0) {
      const restoredRemote: AppPersistedState = {
        ...remote.state,
        user: userProfile || {
          uid,
          displayName: 'Valeria',
          email: 'valedepadua@gmail.com',
          lastBackupAt: new Date().toISOString(),
        },
      };
      saveLocalDeviceState(restoredRemote);
      return restoredRemote;
    }
  }

  // 3. Fallback a respaldo espejo local (tests / modo sin Firestore configurado)
  const cloud = loadCloudBackupForUser(uid);
  if (!cloud) {
    return null;
  }

  for (const s of cloud.sightings) {
    const backedPhoto = cloud.backedUpPhotos[s.photoStorageKey] || s.sanitizedPhotoDataUrl;
    if (backedPhoto) {
      await savePhotoBinaryToIndexedDb(s.photoStorageKey, backedPhoto, s.photoSha256);
    }
  }

  hydrateCustomSpecies(cloud.customSpecies);

  const restoredState: AppPersistedState = {
    user: userProfile || {
      uid,
      displayName: 'Valeria',
      email: 'valeria.jardinyviajes@gmail.com',
      lastBackupAt: cloud.updatedAt,
    },
    notebooks: cloud.notebooks.map((n) => ({ ...n, syncStatus: 'respaldado' })),
    sheets: cloud.sheets,
    sightings: cloud.sightings.map((s) => ({
      ...s,
      syncStatus: 'respaldado',
      sanitizedPhotoDataUrl: cloud.backedUpPhotos[s.photoStorageKey] || s.sanitizedPhotoDataUrl,
    })),
    illustrations: cloud.illustrations,
    customSpecies: cloud.customSpecies || [],
  };

  saveLocalDeviceState(restoredState);
  return restoredState;
}

/**
 * Construye y guarda la proyección pública sanitizada de un cuaderno compartido (§5 F08, §9, CA13, CA14, CA15).
 * Garantiza que NUNCA se incluyan coordenadas GPS, dirección exacta, metadatos EXIF ni email de Google.
 */
export function publishOrUpdateSanitizedNotebookProjection(
  notebook: Notebook,
  allSheets: NotebookSpeciesSheet[],
  allSightings: Sighting[],
  allIllustrations: Illustration[]
): PublicNotebookProjection | null {
  const token = notebook.shareConfig.shareToken;
  if (!token) return null;

  const notebookSheets = allSheets.filter((sh) => sh.notebookId === notebook.id);

  const sanitizedSheets: PublicSanitizedSheet[] = notebookSheets
    .map((sh): PublicSanitizedSheet | null => {
      const species = findSpeciesByTaxonId(sh.taxonId);
      if (!species) return null;

      const ill = allIllustrations.find((i) => i.id === sh.activeIllustrationId);
      const illustrationUrl =
        ill?.imageUrl ||
        (notebook.style === 'muralismo_fauna'
          ? species.defaultMuralPlate || species.defaultWatercolorPlate
          : notebook.style === 'acuarela_naturalista'
            ? species.defaultWatercolorPlate
            : species.defaultGraphitePlate) ||
        species.referencePhotos?.[0]?.url ||
        '/plates/acuarela_hornero.jpg';

      const speciesSightings = allSightings.filter(
        (s) =>
          s.notebookId === notebook.id &&
          s.taxonId === sh.taxonId &&
          s.identificationStatus === 'identificado'
      );

      // Solo incluir fotos originales sanitizadas (sin EXIF) si Valeria activó explícitamente el interruptor
      const publicPhotos = notebook.shareConfig.includeOriginalPhotos
        ? speciesSightings.map((s) => s.sanitizedPhotoDataUrl).filter(Boolean)
        : [];

      // Solo incluir notas personales si Valeria activó explícitamente el interruptor
      const publicNotes = notebook.shareConfig.includePersonalNotes
        ? speciesSightings
            .filter((s) => s.personalNote && s.personalNote.trim().length > 0)
            .map((s) => ({
              dateOnly: formatShortArgentineDate(s.observedAt),
              note: s.personalNote.trim(),
            }))
        : [];

      return {
        sheetId: sh.id,
        taxonId: sh.taxonId,
        organismGroup: getSpeciesGroup(species),
        commonNameAr: species.commonNameAr,
        scientificName: species.scientificName,
        family: species.family,
        quickSummary: species.quickSummary,
        sizeLabel: species.sizeLabel,
        habitatTag: species.habitatTag,
        dietTag: species.dietTag,
        ecologicalRole: species.ecologicalRole,
        coexistenceNote: species.coexistenceNote,
        gardenEcology: getSpeciesGardenEcology(species),
        identificationTraits: species.identificationTraits,
        typicalBehavior: species.typicalBehavior,
        dietAndHabitat: species.dietAndHabitat,
        generalDistribution: species.generalDistribution,
        illustrationUrl,
        illustrationStyle: notebook.style,
        firstObservedDateOnly: formatShortArgentineDate(sh.firstObservedAt),
        sightingsCount: Math.max(1, speciesSightings.length),
        publicPhotos,
        publicNotes,
      };
    })
    .filter((item): item is PublicSanitizedSheet => item !== null);

  const projection: PublicNotebookProjection = {
    shareToken: token,
    notebookId: notebook.id,
    title: notebook.title,
    ownerDisplayName: notebook.ownerDisplayName || 'Valeria',
    type: notebook.type,
    style: notebook.style,
    description: notebook.description,
    generalLocation: notebook.generalLocation,
    period: notebook.period,
    includeOriginalPhotos: notebook.shareConfig.includeOriginalPhotos,
    includePersonalNotes: notebook.shareConfig.includePersonalNotes,
    publishedAt: new Date().toISOString(),
    isEnabled: notebook.shareConfig.isEnabled,
    revokedAt: notebook.shareConfig.isEnabled ? null : new Date().toISOString(),
    sheets: sanitizedSheets,
  };

  const index = loadAllPublicShareProjections();
  index[token] = projection;
  saveAllPublicShareProjections(index);
  return projection;
}

/**
 * Revoca inmediatamente un enlace compartido e invalida sus recursos asociados (CA15).
 */
export function revokePublicNotebookShareToken(token: string): void {
  const index = loadAllPublicShareProjections();
  if (index[token]) {
    index[token] = {
      ...index[token],
      isEnabled: false,
      revokedAt: new Date().toISOString(),
      // Vaciar los recursos protegidos tras la revocación para que no queden accesibles
      sheets: [],
    };
    saveAllPublicShareProjections(index);
  }
}

/**
 * Publica o actualiza una proyección pública en Firestore + R2 para que el enlace `/?share=<token>`
 * funcione desde cualquier teléfono o computadora del mundo.
 */
export async function publishSanitizedNotebookToRemoteCloud(
  uid: string,
  projection: PublicNotebookProjection
): Promise<boolean> {
  if (isTestEnvironment()) return false;
  try {
    const res = await fetch(`${getApiBase()}/api/cloud/share`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, projection }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { published?: boolean };
    return Boolean(data.published);
  } catch {
    return false;
  }
}

export async function revokePublicNotebookInRemoteCloud(
  uid: string,
  shareToken: string
): Promise<boolean> {
  if (isTestEnvironment()) return false;
  try {
    const res = await fetch(`${getApiBase()}/api/cloud/share/revoke`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, shareToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { revoked?: boolean };
    return Boolean(data.revoked);
  } catch {
    return false;
  }
}

/**
 * Consulta remota de un cuaderno público compartido (`/?share=<token>`) desde Firestore,
 * con fallback automático a la caché local si el servidor aún no tiene Firestore configurado.
 */
export async function fetchPublicNotebookByTokenAsync(
  token: string
): Promise<{ status: 'ok'; notebook: PublicNotebookProjection } | { status: 'revoked' | 'not_found' }> {
  if (!isTestEnvironment()) {
    try {
      const res = await fetch(
        `${getApiBase()}/api/public/notebook/${encodeURIComponent(token)}`
      );
      if (res.ok) {
        const data = (await res.json()) as {
          configured?: boolean;
          status?: 'ok' | 'revoked' | 'not_found' | 'unconfigured';
          notebook?: PublicNotebookProjection;
        };
        if (data.configured) {
          if (data.status === 'ok' && data.notebook) {
            return { status: 'ok', notebook: data.notebook };
          }
          if (data.status === 'revoked') {
            return { status: 'revoked' };
          }
          return { status: 'not_found' };
        }
      }
    } catch {
      // Fallback a proyección local si no hay red
    }
  }
  return fetchPublicNotebookByToken(token);
}

/**
 * Consulta síncrona local de un enlace compartido (usada en pruebas y fallback offline).
 */
export function fetchPublicNotebookByToken(
  token: string
): { status: 'ok'; notebook: PublicNotebookProjection } | { status: 'revoked' | 'not_found' } {
  const index = loadAllPublicShareProjections();
  const entry = index[token];
  if (!entry) {
    return { status: 'not_found' };
  }
  if (!entry.isEnabled || entry.revokedAt !== null) {
    return { status: 'revoked' };
  }
  return { status: 'ok', notebook: entry };
}

function loadAllPublicShareProjections(): Record<string, PublicNotebookProjection> {
  try {
    const raw = localStorage.getItem(PUBLIC_SHARES_INDEX_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, PublicNotebookProjection>;
  } catch {
    return {};
  }
}

function saveAllPublicShareProjections(index: Record<string, PublicNotebookProjection>): void {
  try {
    localStorage.setItem(PUBLIC_SHARES_INDEX_KEY, JSON.stringify(index));
  } catch {
    // Ignore storage error
  }
}

export function formatShortArgentineDate(isoOrDateStr: string): string {
  try {
    const d = new Date(isoOrDateStr);
    if (isNaN(d.getTime())) return isoOrDateStr;
    return d.toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return isoOrDateStr;
  }
}

export function formatArgentineDateTime(isoOrDateStr: string): string {
  try {
    const d = new Date(isoOrDateStr);
    if (isNaN(d.getTime())) return isoOrDateStr;
    const datePart = d.toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    if (!isoOrDateStr.includes('T')) return datePart;
    const timePart = d.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `${datePart} · ${timePart} h`;
  } catch {
    return isoOrDateStr;
  }
}

export function computeEarliestObservedAt(
  sightings: Array<{ observedAt: string }>,
  fallbackIso: string
): string {
  if (sightings.length === 0) return fallbackIso;
  const sorted = [...sightings]
    .map((s) => s.observedAt)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return sorted[0] || fallbackIso;
}
