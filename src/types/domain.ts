export type IllustrationStyle = 'acuarela_naturalista' | 'lapiz_grafito';

export type NotebookType = 'jardin' | 'viaje';

export type IdentificationStatus =
  | 'pendiente_identificacion'
  | 'requiere_confirmacion'
  | 'identificado'
  | 'error_procesamiento';

export type SyncStatus = 'local' | 'subiendo' | 'respaldado' | 'error';

export type ConfidenceLevel = 'alta' | 'media' | 'insuficiente';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  reducedMotion?: boolean;
  lastBackupAt?: string;
}

export interface ShareConfig {
  isEnabled: boolean;
  shareToken: string | null;
  includeOriginalPhotos: boolean;
  includePersonalNotes: boolean;
  updatedAt: string;
  revokedTokens: string[];
}

export interface Notebook {
  id: string;
  ownerUid: string;
  ownerDisplayName: string;
  title: string;
  type: NotebookType;
  style: IllustrationStyle;
  description?: string;
  generalLocation?: string;
  period?: string;
  createdAt: string;
  updatedAt: string;
  shareConfig: ShareConfig;
  syncStatus: SyncStatus;
}

export interface SpeciesCatalogEntry {
  taxonId: string;
  scientificName: string;
  commonNameAr: string;
  alternativeNames: string[];
  family: string;
  identificationTraits: string;
  typicalBehavior: string;
  dietAndHabitat: string;
  generalDistribution: string;
  typicalRegionsAr: string[];
  defaultWatercolorPlate: string;
  defaultGraphitePlate: string;
}

export interface Illustration {
  id: string;
  taxonId: string;
  style: IllustrationStyle;
  imageUrl: string;
  version: number;
  promptSummary: string;
  modelProvider: string;
  variationNote?: string;
  createdAt: string;
}

export interface AICandidate {
  taxonId: string;
  commonNameAr: string;
  scientificName: string;
  confidenceBand: 'Muy probable' | 'Posible candidata' | 'Baja certeza';
  reasoning: string;
  keyVisibleTraits: string[];
}

export interface ExifSuggestions {
  hasExifDate: boolean;
  suggestedDateIso?: string;
  hasExifGps: boolean;
  suggestedLat?: number;
  suggestedLng?: number;
  suggestedPlaceLabel?: string;
  cameraDescription?: string;
}

export interface PrivateLocation {
  label: string;
  lat?: number;
  lng?: number;
  fromExif: boolean;
  acceptedByUser: boolean;
}

export interface Sighting {
  id: string; // clientSightingId (UUID v4) para idempotencia
  notebookId: string;
  ownerUid: string;
  taxonId: string | null;
  identificationStatus: IdentificationStatus;
  syncStatus: SyncStatus;
  confidenceLevel: ConfidenceLevel | null;
  aiCandidates: AICandidate[];
  aiExplanation: string | null;
  aiUncertaintyReason: string | null;
  confirmedByUser: boolean;
  photoStorageKey: string; // Clave en IndexedDB / Cloud Storage
  sanitizedPhotoDataUrl: string; // Imagen re-codificada sin cabeceras EXIF/GPS
  photoSha256: string;
  observedAt: string; // Fecha/hora de observación (editable, puede venir de EXIF)
  createdAt: string;
  updatedAt: string;
  exifSuggestions?: ExifSuggestions;
  privateLocation: PrivateLocation | null; // Jamás expuesta en vistas públicas ni piezas para redes
  personalNote: string;
  retryCount: number;
  lastSyncError?: string;
}

export interface NotebookSpeciesSheet {
  id: string; // `${notebookId}_${taxonId}`
  notebookId: string;
  taxonId: string;
  activeIllustrationId: string;
  firstObservedAt: string;
  generalPlace?: string;
  sightingIds: string[];
  updatedAt: string;
}

export interface PublicSanitizedSheet {
  sheetId: string;
  taxonId: string;
  commonNameAr: string;
  scientificName: string;
  family: string;
  identificationTraits: string;
  typicalBehavior: string;
  dietAndHabitat: string;
  generalDistribution: string;
  illustrationUrl: string;
  illustrationStyle: IllustrationStyle;
  firstObservedDateOnly: string; // Solo fecha general, sin hora exacta ni coordenadas
  sightingsCount: number;
  publicPhotos: string[]; // Solo incluidas si includeOriginalPhotos === true (y sin EXIF)
  publicNotes: Array<{ dateOnly: string; note: string }>; // Solo incluidas si includePersonalNotes === true
}

export interface PublicNotebookProjection {
  shareToken: string;
  notebookId: string;
  title: string;
  ownerDisplayName: string;
  type: NotebookType;
  style: IllustrationStyle;
  description?: string;
  generalLocation?: string;
  period?: string;
  includeOriginalPhotos: boolean;
  includePersonalNotes: boolean;
  publishedAt: string;
  isEnabled: boolean;
  revokedAt: string | null;
  sheets: PublicSanitizedSheet[];
}
