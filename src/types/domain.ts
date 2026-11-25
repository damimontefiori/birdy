export type IllustrationStyle =
  | 'muralismo_fauna'
  | 'acuarela_naturalista'
  | 'lapiz_grafito';

export interface IllustrationStyleMeta {
  id: IllustrationStyle;
  label: string;
  shortLabel: string;
  plateLabel: string;
  description: string;
  cardHeaderTag: string;
}

export const ILLUSTRATION_STYLES_ORDER: IllustrationStyle[] = [
  'muralismo_fauna',
  'acuarela_naturalista',
  'lapiz_grafito',
];

export const ILLUSTRATION_STYLE_META: Record<IllustrationStyle, IllustrationStyleMeta> = {
  muralismo_fauna: {
    id: 'muralismo_fauna',
    label: 'Muralismo de fauna autóctona',
    shortLabel: 'Muralismo',
    plateLabel: 'Mural de naturaleza',
    description: 'Color vibrante, pincelada mural y flora nativa sobre muro cálido.',
    cardHeaderTag: 'MURALISMO DE NATURALEZA',
  },
  acuarela_naturalista: {
    id: 'acuarela_naturalista',
    label: 'Acuarela naturalista',
    shortLabel: 'Acuarela',
    plateLabel: 'Lámina en acuarela',
    description: 'Veladuras cálidas y tinta sepia sobre papel algodón.',
    cardHeaderTag: 'ACUARELA NATURALISTA',
  },
  lapiz_grafito: {
    id: 'lapiz_grafito',
    label: 'Lápiz grafito',
    shortLabel: 'Grafito',
    plateLabel: 'Apunte en grafito',
    description: 'Apunte de campo clásico a lápiz 2B/4B.',
    cardHeaderTag: 'APUNTE EN LÁPIZ GRAFITO',
  },
};

export type NotebookType = 'jardin' | 'viaje';

export type OrganismGroup =
  | 'aves'
  | 'mariposas'
  | 'abejas_abejorros'
  | 'insectos_aracnidos'
  | 'fauna_vecina';

export interface OrganismGroupMeta {
  id: OrganismGroup;
  label: string;
  shortLabel: string;
  singularLabel: string;
  emoji: string;
  accentBg: string;
  accentText: string;
  accentBorder: string;
}

export const ORGANISM_GROUPS_ORDER: OrganismGroup[] = [
  'aves',
  'mariposas',
  'abejas_abejorros',
  'insectos_aracnidos',
  'fauna_vecina',
];

export const ORGANISM_GROUP_META: Record<OrganismGroup, OrganismGroupMeta> = {
  aves: {
    id: 'aves',
    label: 'Aves',
    shortLabel: 'Aves',
    singularLabel: 'Ave',
    emoji: '🪶',
    accentBg: '#EBF2EC',
    accentText: '#2A4A30',
    accentBorder: 'rgba(56, 87, 62, 0.28)',
  },
  mariposas: {
    id: 'mariposas',
    label: 'Mariposas',
    shortLabel: 'Mariposas',
    singularLabel: 'Mariposa',
    emoji: '🦋',
    accentBg: '#F6EEE1',
    accentText: '#7D4B16',
    accentBorder: 'rgba(166, 108, 42, 0.30)',
  },
  abejas_abejorros: {
    id: 'abejas_abejorros',
    label: 'Abejas y abejorros',
    shortLabel: 'Abejas',
    singularLabel: 'Polinizador',
    emoji: '🐝',
    accentBg: '#FBF3D9',
    accentText: '#6F520F',
    accentBorder: 'rgba(176, 134, 28, 0.32)',
  },
  insectos_aracnidos: {
    id: 'insectos_aracnidos',
    label: 'Insectos y arácnidos',
    shortLabel: 'Insectos',
    singularLabel: 'Insecto / arácnido',
    emoji: '🐞',
    accentBg: '#F3ECE7',
    accentText: '#6B3B2B',
    accentBorder: 'rgba(143, 81, 61, 0.28)',
  },
  fauna_vecina: {
    id: 'fauna_vecina',
    label: 'Fauna vecina',
    shortLabel: 'Fauna',
    singularLabel: 'Fauna vecina',
    emoji: '🦎',
    accentBg: '#EAEFF2',
    accentText: '#2F4D5D',
    accentBorder: 'rgba(65, 103, 122, 0.28)',
  },
};

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

export interface SpeciesReferencePhoto {
  url: string;
  thumbUrl: string;
  attribution?: string;
  source?: string;
}

export interface GardenEcologyInfo {
  /** Qué viene a buscar específicamente a tu jardín (néctar, frutas, insectos, refugio, plantas hospederas) */
  seeksInGarden: string;
  /** Flores y plantas que prefiere visitar o donde deposita huevos */
  preferredFlowers: string;
  /** Árboles frutales o nativos que busca en el jardín */
  preferredFruitTrees: string;
  /** Insectos, presas o alimentos concretos que consume */
  insectsOrFoodEaten: string;
}

export interface SpeciesCatalogEntry {
  taxonId: string;
  organismGroup?: OrganismGroup;
  scientificName: string;
  commonNameAr: string;
  alternativeNames: string[];
  family: string;
  quickSummary?: string;
  sizeLabel?: string;
  habitatTag?: string;
  dietTag?: string;
  ecologicalRole?: string;
  coexistenceNote?: string;
  gardenEcology?: GardenEcologyInfo;
  identificationTraits: string;
  typicalBehavior: string;
  dietAndHabitat: string;
  generalDistribution: string;
  typicalRegionsAr: string[];
  defaultMuralPlate?: string;
  defaultWatercolorPlate?: string;
  defaultGraphitePlate?: string;
  referencePhotos?: SpeciesReferencePhoto[];
  wikipediaUrl?: string;
  inaturalistTaxonId?: number;
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
  /** True si todavía no se pudo generar con IA (ej. falta configurar proveedor de imagen o error temporal) */
  isPendingAi?: boolean;
  /** Detalle del error/estado cuando isPendingAi es true */
  aiPendingReason?: string;
}

export interface AICandidate {
  taxonId: string;
  organismGroup?: OrganismGroup;
  commonNameAr: string;
  scientificName: string;
  alternativeNames?: string[];
  family?: string;
  confidenceBand: 'Muy probable' | 'Posible candidata' | 'Baja certeza';
  reasoning: string;
  keyVisibleTraits: string[];
  quickSummary?: string;
  sizeLabel?: string;
  habitatTag?: string;
  dietTag?: string;
  ecologicalRole?: string;
  coexistenceNote?: string;
  gardenEcology?: GardenEcologyInfo;
  identificationTraits?: string;
  typicalBehavior?: string;
  dietAndHabitat?: string;
  generalDistribution?: string;
  referencePhotos?: SpeciesReferencePhoto[];
  wikipediaUrl?: string;
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
  organismGroup?: OrganismGroup;
  commonNameAr: string;
  scientificName: string;
  family: string;
  quickSummary?: string;
  sizeLabel?: string;
  habitatTag?: string;
  dietTag?: string;
  ecologicalRole?: string;
  coexistenceNote?: string;
  gardenEcology?: GardenEcologyInfo;
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
