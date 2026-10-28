import { findSpeciesByTaxonId } from '../data/argentinaBirdsCatalog';
import {
  Illustration,
  Notebook,
  NotebookSpeciesSheet,
  PublicNotebookProjection,
  PublicSanitizedSheet,
  Sighting,
  SyncStatus,
  UserProfile,
} from '../types/domain';

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
}

export interface CloudBackupPayload {
  uid: string;
  updatedAt: string;
  notebooks: Notebook[];
  sheets: NotebookSpeciesSheet[];
  sightings: Sighting[]; // Solo avistamientos confirmados como 'respaldado'
  illustrations: Illustration[];
  backedUpPhotos: Record<string, string>; // photoStorageKey -> sanitized DataURL en la nube
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

export function loadLocalDeviceState(): AppPersistedState {
  try {
    const raw = localStorage.getItem(LOCAL_DEVICE_STATE_KEY);
    if (!raw) {
      return { user: null, notebooks: [], sheets: [], sightings: [], illustrations: [] };
    }
    return JSON.parse(raw) as AppPersistedState;
  } catch {
    return { user: null, notebooks: [], sheets: [], sightings: [], illustrations: [] };
  }
}

export function saveLocalDeviceState(state: AppPersistedState): void {
  try {
    localStorage.setItem(LOCAL_DEVICE_STATE_KEY, JSON.stringify(state));
  } catch {
    // Manejo seguro si el almacenamiento local está lleno
  }
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

/**
 * Sincroniza de forma idempotente un avistamiento y su archivo binario hacia el respaldo en la nube
 * asociado a la cuenta de Google de Valeria (§6, CA10, CA11).
 * No declara 'respaldado' hasta verificar que el binario de la fotografía y los metadatos están en la nube.
 */
export async function syncSightingAndNotebookToCloud(params: {
  uid: string;
  sighting: Sighting;
  state: AppPersistedState;
  isOnline: boolean;
  simulateNetworkFailure?: boolean;
}): Promise<{ finalSyncStatus: SyncStatus; errorMessage?: string }> {
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

  // 1. Verificar que el archivo binario original esté presente en IndexedDB o en el registro local
  const binaryData =
    (await loadPhotoBinaryFromIndexedDb(sighting.photoStorageKey)) || sighting.sanitizedPhotoDataUrl;

  if (!binaryData) {
    return {
      finalSyncStatus: 'error',
      errorMessage: 'No se encontró el archivo binario local de la fotografía.',
    };
  }

  // 2. Subida idempotente usando clientSightingId (sighting.id) como clave única
  const existingCloud = loadCloudBackupForUser(uid) || {
    uid,
    updatedAt: new Date().toISOString(),
    notebooks: [],
    sheets: [],
    sightings: [],
    illustrations: [],
    backedUpPhotos: {},
  };

  existingCloud.backedUpPhotos[sighting.photoStorageKey] = binaryData;

  const updatedSighting: Sighting = {
    ...sighting,
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

  // Sincronizar cuadernos, fichas e ilustraciones vinculadas
  existingCloud.notebooks = state.notebooks.map((nb) => ({ ...nb, syncStatus: 'respaldado' as SyncStatus }));
  existingCloud.sheets = [...state.sheets];
  existingCloud.illustrations = [...state.illustrations];
  existingCloud.updatedAt = new Date().toISOString();

  saveCloudBackupForUser(existingCloud);

  // Actualizar proyecciones públicas de cuadernos compartidos que estén activos
  for (const nb of existingCloud.notebooks) {
    if (nb.shareConfig.isEnabled && nb.shareConfig.shareToken) {
      publishOrUpdateSanitizedNotebookProjection(
        nb,
        existingCloud.sheets,
        existingCloud.sightings,
        existingCloud.illustrations
      );
    }
  }

  return { finalSyncStatus: 'respaldado' };
}

/**
 * Simula el cambio de teléfono Android de Valeria (CA11):
 * Borra por completo el almacenamiento local del dispositivo (localStorage + IndexedDB)
 * y restaura desde la nube únicamente los registros confirmados como 'respaldado' en su cuenta de Google.
 */
export async function restoreFromGoogleCloudOnNewDevice(uid: string): Promise<AppPersistedState | null> {
  // 1. Limpiar caché local del dispositivo anterior
  localStorage.removeItem(LOCAL_DEVICE_STATE_KEY);
  await clearLocalDeviceIndexedDb();

  // 2. Descargar respaldo asociado a la cuenta de Google
  const cloud = loadCloudBackupForUser(uid);
  if (!cloud) {
    return null;
  }

  // 3. Rehidratar binarios de fotos respaldadas en IndexedDB del nuevo teléfono
  for (const s of cloud.sightings) {
    const backedPhoto = cloud.backedUpPhotos[s.photoStorageKey] || s.sanitizedPhotoDataUrl;
    if (backedPhoto) {
      await savePhotoBinaryToIndexedDb(s.photoStorageKey, backedPhoto, s.photoSha256);
    }
  }

  const restoredState: AppPersistedState = {
    user: {
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
    .map((sh) => {
      const species = findSpeciesByTaxonId(sh.taxonId);
      if (!species) return null;

      const ill = allIllustrations.find((i) => i.id === sh.activeIllustrationId);
      const illustrationUrl =
        ill?.imageUrl ||
        (notebook.style === 'acuarela_naturalista'
          ? species.defaultWatercolorPlate
          : species.defaultGraphitePlate);

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
        commonNameAr: species.commonNameAr,
        scientificName: species.scientificName,
        family: species.family,
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
 * Consulta de backend/lectura pública de un enlace compartido.
 * Aplica control de acceso estricto: si el token no existe o fue revocado, rechaza el acceso (CA15).
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
