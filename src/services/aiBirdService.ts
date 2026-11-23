import {
  ARGENTINA_BIRDS_CATALOG,
  buildStableTaxonIdFromScientificName,
  findSpeciesByScientificName,
  findSpeciesByTaxonId,
  getSpeciesGroup,
  inferOrganismGroupFromMeta,
  registerCustomSpecies,
} from '../data/argentinaBirdsCatalog';
import {
  AICandidate,
  ConfidenceLevel,
  IdentificationStatus,
  Illustration,
  IllustrationStyle,
  ORGANISM_GROUP_META,
  SpeciesCatalogEntry,
} from '../types/domain';
import {
  fetchReferencePhotosForSpecies,
  getProxiedImageUrl,
} from './speciesReferenceService';
import { renderBotanicalPlateFromImage } from './watercolorCanvasRenderer';

export interface IdentificationRequest {
  photoSha256: string;
  fileName: string;
  sanitizedPhotoDataUrl: string;
  generalLocationHint?: string;
  observedAtIso?: string;
  presetScenario?:
    | 'auto'
    | 'clara_hornero'
    | 'clara_chingolo'
    | 'clara_benteveo'
    | 'clara_zorzal'
    | 'clara_ratona'
    | 'duda_semillita_o_chingolo'
    | 'borrosa_oculta'
    | 'sin_ave';
}

export interface IdentificationResponse {
  status: IdentificationStatus;
  confidenceLevel: ConfidenceLevel;
  proposedTaxonId: string | null;
  candidates: AICandidate[];
  explanation: string;
  uncertaintyReason: string | null;
  fromCache: boolean;
  taxonomicSource: string;
  aiMode: 'gemini' | 'demo_preset' | 'unconfigured' | 'error';
  modelUsed?: string;
  aiErrorMessage?: string;
}

export interface BackendAiHealth {
  ok: boolean;
  aiConfigured: boolean;
  illustrationCloudConfigured?: boolean;
  visionFallbackProviders?: string[];
  imageFallbackProviders?: string[];
  provider: string;
  visionModel?: string;
  imageModel?: string;
  auth?: {
    googleAuthConfigured: boolean;
    authRequired: boolean;
    googleClientId: string | null;
    allowedEmailsCount: number;
  };
}

// Caché idempotente por hash SHA-256 para evitar consumos duplicados por reintentos accidentales
const identificationCache = new Map<string, IdentificationResponse>();
let cachedAiConfigured: boolean | null = null;
let cachedIllustrationCloudConfigured: boolean | null = null;

export interface AIConsumptionMetrics {
  identificationsExecuted: number;
  identificationsPreventedByCache: number;
  illustrationsGenerated: number;
  illustrationsReusedFromCatalog: number;
}

const consumptionMetrics: AIConsumptionMetrics = {
  identificationsExecuted: 0,
  identificationsPreventedByCache: 0,
  illustrationsGenerated: 0,
  illustrationsReusedFromCatalog: 0,
};

export function getAIConsumptionMetrics(): AIConsumptionMetrics {
  return { ...consumptionMetrics };
}

function getApiBase(): string {
  const custom = import.meta.env.VITE_BACKEND_API_URL;
  return custom ? custom.replace(/\/$/, '') : '';
}

function isTestEnvironment(): boolean {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');
}

/**
 * Consulta el estado del backend seguro de IA (Google Gemini) sin exponer claves.
 */
export async function checkBackendAiHealth(): Promise<BackendAiHealth> {
  if (isTestEnvironment()) {
    return { ok: false, aiConfigured: false, provider: 'gemini' };
  }
  try {
    const res = await fetch(`${getApiBase()}/api/health`, {
      credentials: 'include',
    });
    if (res.ok) {
      const data = (await res.json()) as BackendAiHealth;
      cachedAiConfigured = Boolean(data.aiConfigured);
      cachedIllustrationCloudConfigured = Boolean(
        data.illustrationCloudConfigured ?? data.aiConfigured
      );
      return data;
    }
  } catch {
    // Servidor no disponible
  }
  cachedAiConfigured = false;
  cachedIllustrationCloudConfigured = false;
  return { ok: false, aiConfigured: false, provider: 'gemini' };
}

/**
 * Convierte una candidata devuelta por Gemini en entrada persistible del catálogo
 * (enlazándola al catálogo local si coincide el nombre científico o registrándola dinámicamente).
 */
function normalizeAndRegisterCandidate(raw: AICandidate): AICandidate {
  const existing =
    findSpeciesByScientificName(raw.scientificName) || findSpeciesByTaxonId(raw.taxonId);

  if (existing) {
    const updated = registerCustomSpecies({
      ...existing,
      referencePhotos: raw.referencePhotos?.length
        ? raw.referencePhotos
        : existing.referencePhotos,
      wikipediaUrl: raw.wikipediaUrl || existing.wikipediaUrl,
    });
    return {
      ...raw,
      taxonId: updated.taxonId,
      organismGroup: getSpeciesGroup(existing),
      commonNameAr: existing.commonNameAr || raw.commonNameAr,
      scientificName: updated.scientificName,
      alternativeNames: existing.alternativeNames.length
        ? existing.alternativeNames
        : raw.alternativeNames,
      family: existing.family || raw.family,
      quickSummary: existing.quickSummary || raw.quickSummary,
      sizeLabel: existing.sizeLabel || raw.sizeLabel,
      habitatTag: existing.habitatTag || raw.habitatTag,
      dietTag: existing.dietTag || raw.dietTag,
      ecologicalRole: existing.ecologicalRole || raw.ecologicalRole,
      coexistenceNote: existing.coexistenceNote || raw.coexistenceNote,
      referencePhotos: updated.referencePhotos || raw.referencePhotos,
      wikipediaUrl: updated.wikipediaUrl || raw.wikipediaUrl,
    };
  }

  const resolvedGroup = inferOrganismGroupFromMeta({
    organismGroup: raw.organismGroup,
    scientificName: raw.scientificName,
    commonName: raw.commonNameAr,
    family: raw.family,
  });
  const stableId = buildStableTaxonIdFromScientificName(raw.scientificName);
  const newEntry: SpeciesCatalogEntry = {
    taxonId: stableId,
    organismGroup: resolvedGroup,
    scientificName: raw.scientificName,
    commonNameAr: raw.commonNameAr,
    alternativeNames: raw.alternativeNames || [],
    family: raw.family || 'Fauna',
    quickSummary: raw.quickSummary || raw.reasoning,
    sizeLabel: raw.sizeLabel,
    habitatTag: raw.habitatTag,
    dietTag: raw.dietTag,
    ecologicalRole: raw.ecologicalRole,
    coexistenceNote: raw.coexistenceNote,
    identificationTraits: raw.identificationTraits || raw.quickSummary || raw.reasoning,
    typicalBehavior: raw.typicalBehavior || 'Observación registrada mediante identificación asistida por IA.',
    dietAndHabitat: raw.dietAndHabitat || raw.habitatTag || 'Información disponible según región.',
    generalDistribution: raw.generalDistribution || 'Fauna registrada en Argentina.',
    typicalRegionsAr: [],
    referencePhotos: raw.referencePhotos || [],
    wikipediaUrl: raw.wikipediaUrl,
  };
  registerCustomSpecies(newEntry);

  return {
    ...raw,
    taxonId: stableId,
    organismGroup: resolvedGroup,
  };
}

/**
 * Crea una copia liviana (~70–130 KB, máx. 896px) exclusivamente para el envío a la IA de visión,
 * acelerando la subida desde 4G/móvil y evitando timeouts sin tocar la foto original guardada.
 */
async function createCompactVisionDataUrl(sourceDataUrl: string, maxDim = 896): Promise<string> {
  if (
    typeof Image === 'undefined' ||
    typeof document === 'undefined' ||
    isTestEnvironment() ||
    !sourceDataUrl.startsWith('data:image/')
  ) {
    return sourceDataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) {
          resolve(sourceDataUrl);
          return;
        }
        const scale = Math.min(1, maxDim / Math.max(w, h));
        const targetW = Math.max(1, Math.round(w * scale));
        const targetH = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(sourceDataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      } catch {
        resolve(sourceDataUrl);
      }
    };
    img.onerror = () => resolve(sourceDataUrl);
    img.src = sourceDataUrl;
  });
}

/**
 * Servicio de identificación de especies asistida por IA.
 * - Nunca expone claves de API en el cliente.
 * - Para fotos reales (`presetScenario === 'auto'` o indefinido), llama al backend seguro `/api/identify-bird`
 *   con Google Gemini Vision + referencias reales de iNaturalist.
 * - NUNCA inventa ni adjudica «Hornero común» por defecto si no hay IA configurada.
 */
export async function identifyBirdFromPhoto(
  req: IdentificationRequest,
  forceRefresh = false
): Promise<IdentificationResponse> {
  const scenarioKey = req.presetScenario || 'auto';
  const cacheKey = `${req.photoSha256}_${scenarioKey}`;

  if (!forceRefresh && identificationCache.has(cacheKey)) {
    consumptionMetrics.identificationsPreventedByCache += 1;
    const cached = identificationCache.get(cacheKey)!;
    return { ...cached, fromCache: true };
  }

  // 1. Escenarios explícitos de demostración / pruebas automatizadas
  if (req.presetScenario && req.presetScenario !== 'auto') {
    await new Promise((r) => setTimeout(r, isTestEnvironment() ? 20 : 350));
    consumptionMetrics.identificationsExecuted += 1;
    const demoResponse = buildCalibratedDemoResponse(req.presetScenario, req.generalLocationHint);
    // Enriquecer fotos de referencia reales en segundo plano para el comparador visual
    if (!isTestEnvironment() && demoResponse.candidates.length > 0) {
      await Promise.all(
        demoResponse.candidates.map(async (c) => {
          const photos = await fetchReferencePhotosForSpecies(c.scientificName);
          if (photos.length > 0) {
            c.referencePhotos = photos;
          }
        })
      );
    }
    identificationCache.set(cacheKey, demoResponse);
    return demoResponse;
  }

  // 2. Identificación real mediante backend seguro (/api/identify-bird -> Gemini 3.x + respaldos)
  if (!isTestEnvironment()) {
    try {
      const compactVisionDataUrl = await createCompactVisionDataUrl(req.sanitizedPhotoDataUrl, 896);
      const postIdentify = () =>
        fetch(`${getApiBase()}/api/identify-bird`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sanitizedPhotoDataUrl: compactVisionDataUrl,
            generalLocationHint: req.generalLocationHint,
            observedAtIso: req.observedAtIso,
            fileName: req.fileName,
            photoSha256: req.photoSha256,
          }),
        });

      let res = await postIdentify();

      // Reintento silencioso automático tras 1.6s si Google tuvo un pico momentáneo 503
      if (res.status === 503) {
        const peek = (await res
          .clone()
          .json()
          .catch(() => ({}))) as { error?: string };
        if (peek.error === 'GEMINI_HIGH_DEMAND') {
          await new Promise((r) => setTimeout(r, 1600));
          res = await postIdentify();
        }
      }

      if (res.ok) {
        const raw = (await res.json()) as IdentificationResponse;
        const normalizedCandidates = (raw.candidates || []).map(normalizeAndRegisterCandidate);
        let proposedTaxonId = raw.proposedTaxonId;
        if (proposedTaxonId && normalizedCandidates.length > 0) {
          const matched =
            normalizedCandidates.find((c) => c.taxonId === proposedTaxonId) ||
            normalizedCandidates[0];
          proposedTaxonId = matched?.taxonId || null;
        }
        const finalResponse: IdentificationResponse = {
          ...raw,
          proposedTaxonId: raw.confidenceLevel === 'insuficiente' ? null : proposedTaxonId,
          candidates: normalizedCandidates,
          fromCache: false,
          aiMode: 'gemini',
        };
        consumptionMetrics.identificationsExecuted += 1;
        identificationCache.set(cacheKey, finalResponse);
        return finalResponse;
      }

      const errPayload = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        detail?: string;
      };

      if (res.status === 401 || res.status === 403) {
        return {
          status: 'error_procesamiento',
          confidenceLevel: 'insuficiente',
          proposedTaxonId: null,
          candidates: [],
          explanation:
            errPayload.message ||
            'Necesitás iniciar sesión con una cuenta de Google autorizada para usar la IA.',
          uncertaintyReason:
            'El acceso a Google Gemini está restringido a las cuentas habilitadas de Bioma.',
          fromCache: false,
          taxonomicSource: 'Acceso protegido con Google',
          aiMode: 'error',
          aiErrorMessage: errPayload.error || `HTTP ${res.status}`,
        };
      }

      if (errPayload.error === 'AUTH_NOT_CONFIGURED') {
        return {
          status: 'error_procesamiento',
          confidenceLevel: 'insuficiente',
          proposedTaxonId: null,
          candidates: [],
          explanation:
            errPayload.message ||
            'Falta configurar GOOGLE_CLIENT_ID en el servidor para habilitar el acceso protegido a Gemini.',
          uncertaintyReason:
            'En producción la identificación con IA permanece bloqueada hasta configurar el acceso con Google.',
          fromCache: false,
          taxonomicSource: 'Configuración de seguridad pendiente',
          aiMode: 'error',
          aiErrorMessage: 'AUTH_NOT_CONFIGURED',
        };
      }

      if (errPayload.error === 'GEMINI_API_KEY_MISSING') {
        return {
          status: 'pendiente_identificacion',
          confidenceLevel: 'insuficiente',
          proposedTaxonId: null,
          candidates: [],
          explanation:
            'El reconocimiento automático de fotografías con Google Gemini aún no está activado en el servidor.',
          uncertaintyReason:
            'Para identificar automáticamente cualquier especie real de tu jardín (aves, mariposas, abejas, abejorros, insectos o fauna vecina), agregá tu GEMINI_API_KEY en el servidor. Mientras tanto, no adivinamos ninguna especie: podés buscarla abajo con fotos reales de referencia o dejarla en Pendientes.',
          fromCache: false,
          taxonomicSource: 'Motor de IA pendiente de configuración (GEMINI_API_KEY)',
          aiMode: 'unconfigured',
        };
      }

      if (errPayload.error === 'GEMINI_HIGH_DEMAND') {
        return {
          status: 'error_procesamiento',
          confidenceLevel: 'insuficiente',
          proposedTaxonId: null,
          candidates: [],
          explanation:
            errPayload.message ||
            'Los servidores gratuitos de Google Gemini están con alta demanda en este momento.',
          uncertaintyReason:
            'Tocá «Reintentar análisis con IA» en unos segundos (o agregá GROQ_API_KEY gratis en Render como respaldo instantáneo para evitar picos de demanda).',
          fromCache: false,
          taxonomicSource: 'Google Gemini (pico temporal de demanda)',
          aiMode: 'error',
          aiErrorMessage: errPayload.detail || 'GEMINI_HIGH_DEMAND',
        };
      }

      return {
        status: 'error_procesamiento',
        confidenceLevel: 'insuficiente',
        proposedTaxonId: null,
        candidates: [],
        explanation:
          errPayload.message ||
          'No pudimos completar el análisis de tu fotografía con la IA en este momento.',
        uncertaintyReason:
          'Podés reintentar el análisis, elegir la especie manualmente comparando con fotos de referencia, o guardarla como «Pendiente de identificar».',
        fromCache: false,
        taxonomicSource: 'Motor de visión (reintento disponible)',
        aiMode: 'error',
        aiErrorMessage: errPayload.detail || errPayload.message,
      };
    } catch {
      return {
        status: 'error_procesamiento',
        confidenceLevel: 'insuficiente',
        proposedTaxonId: null,
        candidates: [],
        explanation: 'No se pudo conectar con el servidor de identificación en este momento.',
        uncertaintyReason:
          'Verificá tu conexión o elegí la especie manualmente con la guía visual de fotos reales.',
        fromCache: false,
        taxonomicSource: 'Sin conexión con el servicio de IA',
        aiMode: 'error',
      };
    }
  }

  // Fallback seguro en entornos de test sin preset explícito: nunca adjudica Hornero al azar
  return {
    status: 'pendiente_identificacion',
    confidenceLevel: 'insuficiente',
    proposedTaxonId: null,
    candidates: [],
    explanation:
      'Sin motor de visión configurado para analizar esta fotografía automáticamente.',
    uncertaintyReason:
      'Configurá GEMINI_API_KEY en el servidor o elegí la especie manualmente desde el catálogo.',
    fromCache: false,
    taxonomicSource: 'Catálogo Ornitológico Argentina (eBird es_AR)',
    aiMode: 'unconfigured',
  };
}

function buildCalibratedDemoResponse(
  scenario: Exclude<NonNullable<IdentificationRequest['presetScenario']>, 'auto'>,
  locationHint?: string
): IdentificationResponse {
  const regionNote = locationHint
    ? ` Compatible con registros frecuentes en ${locationHint}.`
    : ' Compatible con la distribución registrada en Argentina.';

  switch (scenario) {
    case 'sin_ave':
      return {
        status: 'pendiente_identificacion',
        confidenceLevel: 'insuficiente',
        proposedTaxonId: null,
        candidates: [],
        explanation:
          'Analizamos la imagen pero no logramos distinguir ningún ave con claridad entre el follaje o el entorno.',
        uncertaintyReason:
          'No se detectan siluetas, plumaje ni rasgos anatómicos de un ave. Podés guardar la foto como «Pendiente de identificar» o probar con una toma más cercana.',
        fromCache: false,
        taxonomicSource: 'Validación visual previa al catálogo eBird Argentina (es_AR)',
        aiMode: 'demo_preset',
      };

    case 'borrosa_oculta':
      return {
        status: 'pendiente_identificacion',
        confidenceLevel: 'insuficiente',
        proposedTaxonId: null,
        candidates: [
          {
            taxonId: 'rubthr1',
            commonNameAr: 'Zorzal colorado',
            scientificName: 'Turdus rufiventris',
            confidenceBand: 'Baja certeza',
            reasoning:
              'El tamaño mediano y el tono terroso del vientre se asemejan, pero la cabeza y el pico están ocultos.',
            keyVisibleTraits: ['Silueta mediana entre ramas', 'Tono pardo cálido difuso'],
          },
          {
            taxonId: 'rufhor2',
            commonNameAr: 'Hornero común',
            scientificName: 'Furnarius rufus',
            confidenceBand: 'Baja certeza',
            reasoning: 'El color pardo rojizo general podría corresponder a un hornero fuera de foco.',
            keyVisibleTraits: ['Plumaje terroso uniforme'],
          },
        ],
        explanation:
          'Se distingue un ave entre el follaje, pero el desenfoque o las ramas ocultan el pico y el patrón de la cabeza.',
        uncertaintyReason:
          'La evidencia visual no alcanza para adjudicar una especie con responsabilidad. Te sugerimos guardarla como «Pendiente de identificar» o comparar con las fotos de referencia.',
        fromCache: false,
        taxonomicSource: 'Catálogo Ornitológico eBird Argentina (es_AR)',
        aiMode: 'demo_preset',
      };

    case 'duda_semillita_o_chingolo':
      return {
        status: 'requiere_confirmacion',
        confidenceLevel: 'media',
        proposedTaxonId: 'rucspa1',
        candidates: [
          {
            taxonId: 'rucspa1',
            commonNameAr: 'Chingolo',
            scientificName: 'Zonotrichia capensis',
            confidenceBand: 'Posible candidata',
            reasoning:
              'Se aprecia el semicopete grisáceo y un indicio del collar canela en la nuca, aunque la luz lateral reduce el contraste.',
            keyVisibleTraits: ['Semicopete erizado', 'Collar nucal canela', 'Pico cónico corto'],
          },
          {
            taxonId: 'houwre',
            commonNameAr: 'Ratona común',
            scientificName: 'Troglodytes aedon',
            alternativeNames: ['Ratucha', 'Tacuarita'],
            confidenceBand: 'Posible candidata',
            reasoning:
              'Si el ave era muy pequeña, de pico fino y sin collar rojizo, el tono pardo suave podría corresponder a una ratona común.',
            keyVisibleTraits: ['Tamaño muy pequeño', 'Pico fino recto', 'Barrado fino en alas/cola'],
          },
          {
            taxonId: 'patmock1',
            commonNameAr: 'Calandria mora',
            scientificName: 'Mimus patagonicus',
            confidenceBand: 'Baja certeza',
            reasoning:
              'El plumaje gris pardusco y la ceja clara podrían corresponder a una calandria si tenía cola larga y porte más estilizado.',
            keyVisibleTraits: ['Dorso gris pardusco', 'Ceja clara visible'],
          },
        ],
        explanation: `Identificamos un ave pequeña, pero la luz a contraluz deja dos especies nativas muy parecidas.${regionNote}`,
        uncertaintyReason:
          'La iluminación dificulta ver con nitidez el collar del cuello y el barrado de la cola. Compará tu foto con las fotos de referencia de cada candidata.',
        fromCache: false,
        taxonomicSource: 'Catálogo Ornitológico eBird Argentina (es_AR)',
        aiMode: 'demo_preset',
      };

    case 'clara_ratona':
      return {
        status: 'identificado',
        confidenceLevel: 'alta',
        proposedTaxonId: 'houwre',
        candidates: [
          {
            taxonId: 'houwre',
            commonNameAr: 'Ratona común',
            scientificName: 'Troglodytes aedon',
            alternativeNames: ['Ratucha', 'Tacuarita'],
            confidenceBand: 'Muy probable',
            reasoning: `Ave muy pequeña de tono pardo ocráceo con fino barrado oscuro en alas y cola corta erguida, y pico delgado de insectívoro.${regionNote}`,
            keyVisibleTraits: ['Tamaño diminuto (~11 cm)', 'Barrado fino en alas y cola', 'Pico fino y recto', 'Cola corta levantada'],
          },
          {
            taxonId: 'rufhor2',
            commonNameAr: 'Hornero común',
            scientificName: 'Furnarius rufus',
            confidenceBand: 'Baja certeza',
            reasoning: 'A simple vista comparte tonos pardos, pero el hornero es mucho más grande, sin barrado en las alas y con patas largas.',
            keyVisibleTraits: ['Plumaje rufo uniforme sin barras', 'Cuerpo casi el doble de grande'],
          },
        ],
        explanation: `El tamaño diminuto, el pico fino y el fino barrado en alas y cola corresponden claramente a una Ratona común (Ratucha).${regionNote}`,
        uncertaintyReason: null,
        fromCache: false,
        taxonomicSource: 'Catálogo Ornitológico eBird Argentina (es_AR)',
        aiMode: 'demo_preset',
      };

    case 'clara_chingolo':
      return {
        status: 'identificado',
        confidenceLevel: 'alta',
        proposedTaxonId: 'rucspa1',
        candidates: [
          {
            taxonId: 'rucspa1',
            commonNameAr: 'Chingolo',
            scientificName: 'Zonotrichia capensis',
            confidenceBand: 'Muy probable',
            reasoning: `Se distinguen el semicopete gris con bandas negras y el característico collar canela rojizo en la nuca.${regionNote}`,
            keyVisibleTraits: ['Semicopete gris estriado', 'Collar nucal canela', 'Mejilla gris enmarcada'],
          },
          {
            taxonId: 'houspa',
            commonNameAr: 'Gorrión',
            scientificName: 'Passer domesticus',
            confidenceBand: 'Baja certeza',
            reasoning: 'También busca semillas en el suelo, pero el gorrión carece de semicopete y collar canela nucal.',
            keyVisibleTraits: ['Porte granívoro compacto'],
          },
        ],
        explanation: `Los rasgos de la cabeza y el collar canela coinciden claramente con un Chingolo (Zonotrichia capensis).${regionNote}`,
        uncertaintyReason: null,
        fromCache: false,
        taxonomicSource: 'Catálogo Ornitológico eBird Argentina (es_AR)',
        aiMode: 'demo_preset',
      };

    case 'clara_benteveo':
      return {
        status: 'identificado',
        confidenceLevel: 'alta',
        proposedTaxonId: 'grekis',
        candidates: [
          {
            taxonId: 'grekis',
            commonNameAr: 'Benteveo común',
            scientificName: 'Pitangus sulphuratus',
            confidenceBand: 'Muy probable',
            reasoning: `Inconfundible combinación de pecho amarillo intenso, antifaz negro con ceja blanca ancha y pico robusto.${regionNote}`,
            keyVisibleTraits: ['Vientre amarillo vivo', 'Antifaz negro y vincha blanca', 'Pico recto fuerte'],
          },
        ],
        explanation: `El patrón facial blanco y negro junto al pecho amarillo brillante identifican con alta seguridad al Benteveo común.${regionNote}`,
        uncertaintyReason: null,
        fromCache: false,
        taxonomicSource: 'Catálogo Ornitológico eBird Argentina (es_AR)',
        aiMode: 'demo_preset',
      };

    case 'clara_zorzal':
      return {
        status: 'identificado',
        confidenceLevel: 'alta',
        proposedTaxonId: 'rubthr1',
        candidates: [
          {
            taxonId: 'rubthr1',
            commonNameAr: 'Zorzal colorado',
            scientificName: 'Turdus rufiventris',
            confidenceBand: 'Muy probable',
            reasoning: `Se observan el vientre anaranjado rojizo, la garganta clara finamente estriada y el anillo ocular amarillo.${regionNote}`,
            keyVisibleTraits: ['Vientre rufo anaranjado', 'Garganta estriada', 'Anillo ocular amarillo'],
          },
        ],
        explanation: `El plumaje ventral color ladrillo y el anillo ocular amarillo confirman un Zorzal colorado.${regionNote}`,
        uncertaintyReason: null,
        fromCache: false,
        taxonomicSource: 'Catálogo Ornitológico eBird Argentina (es_AR)',
        aiMode: 'demo_preset',
      };

    case 'clara_hornero':
    default:
      return {
        status: 'identificado',
        confidenceLevel: 'alta',
        proposedTaxonId: 'rufhor2',
        candidates: [
          {
            taxonId: 'rufhor2',
            commonNameAr: 'Hornero común',
            scientificName: 'Furnarius rufus',
            confidenceBand: 'Muy probable',
            reasoning: `Dorso pardo rojizo uniforme sin barrado, garganta clara, pico esbelto levemente curvado y patas largas de caminador.${regionNote}`,
            keyVisibleTraits: ['Dorso pardo rufo uniforme', 'Garganta clara', 'Pico esbelto levemente curvo'],
          },
          {
            taxonId: 'rubthr1',
            commonNameAr: 'Zorzal colorado',
            scientificName: 'Turdus rufiventris',
            confidenceBand: 'Baja certeza',
            reasoning: 'También camina por el césped, pero el zorzal tiene vientre anaranjado ladrillo y pico amarillo.',
            keyVisibleTraits: ['Ave terrícola de jardín'],
          },
        ],
        explanation: `La silueta esbelta, el plumaje terroso rufo uniforme y el pico fino coinciden con alta seguridad con el Hornero común.${regionNote}`,
        uncertaintyReason: null,
        fromCache: false,
        taxonomicSource: 'Catálogo Ornitológico eBird Argentina (es_AR)',
        aiMode: 'demo_preset',
      };
  }
}

/**
 * Genera o reutiliza una lámina artística naturalista para una especie y estilo dados.
 * - Si ya existe una lámina para (taxonId, style) y no se pidió otra versión, la reutiliza.
 * - Intenta primero generación real por IA (Google Gemini) cuando corresponde;
 *   si no está configurada, usa la lámina dedicada de esa especie exacta o genera un estudio
 *   botánico en Canvas a partir de la foto real verificada de ESA misma especie (nunca de otra!).
 */
export async function generateOrReuseIllustration(params: {
  taxonId: string;
  style: IllustrationStyle;
  existingIllustrations: Illustration[];
  forceNewVersion?: boolean;
  fallbackPhotoDataUrl?: string;
}): Promise<{ illustration: Illustration; reused: boolean }> {
  const {
    taxonId,
    style,
    existingIllustrations,
    forceNewVersion = false,
    fallbackPhotoDataUrl,
  } = params;

  const matching = existingIllustrations
    .filter(
      (ill) =>
        ill.taxonId === taxonId &&
        ill.style === style &&
        !ill.imageUrl.includes('/api/image-proxy?')
    )
    .sort((a, b) => b.version - a.version);

  if (!forceNewVersion && matching.length > 0) {
    consumptionMetrics.illustrationsReusedFromCatalog += 1;
    return { illustration: matching[0], reused: true };
  }

  const species = findSpeciesByTaxonId(taxonId) || ARGENTINA_BIRDS_CATALOG[0];
  const nextVersion = matching.length > 0 ? matching[0].version + 1 : 1;

  const dedicatedStaticPlate =
    style === 'muralismo_fauna'
      ? species.defaultMuralPlate
      : style === 'acuarela_naturalista'
        ? species.defaultWatercolorPlate
        : species.defaultGraphitePlate;

  let finalImageUrl = '';
  let modelProvider = 'Estudio Naturalista';
  let variationNote =
    nextVersion === 1
      ? style === 'muralismo_fauna'
        ? 'Mural de fauna autóctona y biodiversidad sobre muro mineral cálido'
        : style === 'acuarela_naturalista'
          ? 'Lámina en acuarela botánica sobre papel algodón'
          : 'Apunte de campo en lápiz grafito 2B/4B'
      : `Versión #${nextVersion} — Variación artística naturalista`;

  // 1. Si no tiene lámina dedicada O se pidió nueva versión, intentar generación real por IA en el servidor
  let geminiImageQuotaExceeded = false;
  const shouldTryCloudImage =
    !isTestEnvironment() &&
    cachedIllustrationCloudConfigured !== false &&
    (!dedicatedStaticPlate || forceNewVersion);
  if (shouldTryCloudImage) {
    try {
      const res = await fetch(`${getApiBase()}/api/generate-illustration`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commonNameAr: species.commonNameAr,
          scientificName: species.scientificName,
          identificationTraits: species.identificationTraits,
          style,
          organismGroup: getSpeciesGroup(species),
          version: nextVersion,
        }),
      });
      if (res.ok) {
        const gen = (await res.json()) as {
          imageUrl?: string;
          modelProvider?: string;
          variationNote?: string;
        };
        if (gen.imageUrl) {
          finalImageUrl = gen.imageUrl;
          modelProvider = gen.modelProvider || 'Google Gemini — Ilustración Botánica';
          variationNote = gen.variationNote || variationNote;
        }
      } else if (res.status === 429) {
        geminiImageQuotaExceeded = true;
      } else if (res.status === 503) {
        cachedIllustrationCloudConfigured = false;
      }
    } catch {
      // Continuar con motor local de acuarela/grafito de la misma especie
    }
  }

  // 2. Si tiene lámina dedicada para esta especie exacta
  if (!finalImageUrl && dedicatedStaticPlate) {
    finalImageUrl =
      nextVersion > 1
        ? await createArtisticPlateDataUrl(dedicatedStaticPlate, style, nextVersion, false, false)
        : dedicatedStaticPlate;
    modelProvider = 'Colección Botánica Bioma';
  }

  // 3. Si no tiene lámina estática propia (o el proveedor cloud no devolvió imagen),
  // sintetizar una lámina real en acuarela/tinta sepia o lápiz grafito con el motor Canvas local
  // a partir de la fotografía verificada de ESA misma especie (nunca de otra).
  if (!finalImageUrl) {
    let sourceRefUrl = species.referencePhotos?.[0]?.url || species.referencePhotos?.[0]?.thumbUrl;
    if (!sourceRefUrl && !isTestEnvironment()) {
      const fetched = await fetchReferencePhotosForSpecies(species.scientificName);
      sourceRefUrl = fetched[0]?.url || fetched[0]?.thumbUrl;
    }

    if (sourceRefUrl) {
      const paintedFromRef = await createArtisticPlateDataUrl(
        sourceRefUrl,
        style,
        nextVersion,
        true,
        true
      );
      // Si la foto remota no pudo leerse en Canvas (ej.: sin conexión) y tenemos foto del usuario, pintar desde ella
      if (
        !isTestEnvironment() &&
        !paintedFromRef.startsWith('data:') &&
        fallbackPhotoDataUrl
      ) {
        finalImageUrl = await createArtisticPlateDataUrl(
          fallbackPhotoDataUrl,
          style,
          nextVersion,
          true,
          false
        );
      } else {
        finalImageUrl = paintedFromRef;
      }

      modelProvider = geminiImageQuotaExceeded
        ? style === 'muralismo_fauna'
          ? 'Muralismo botánico local (Gemini sin cuota de imagen)'
          : style === 'acuarela_naturalista'
            ? 'Acuarela botánica local (Gemini sin cuota de imagen)'
            : 'Grafito botánico local (Gemini sin cuota de imagen)'
        : style === 'muralismo_fauna'
          ? 'Muralismo de fauna autóctona local'
          : style === 'acuarela_naturalista'
            ? 'Acuarela botánica local'
            : 'Apunte en grafito local';
      variationNote = geminiImageQuotaExceeded
        ? style === 'muralismo_fauna'
          ? 'Muralismo de fauna local (agregá HUGGINGFACE_API_KEY gratis o facturación en Gemini para mural 100% IA)'
          : style === 'acuarela_naturalista'
            ? 'Acuarela botánica local (agregá HUGGINGFACE_API_KEY gratis o facturación en Gemini para pintura 100% IA)'
            : 'Grafito botánico local (agregá HUGGINGFACE_API_KEY gratis o facturación en Gemini para dibujo 100% IA)'
        : style === 'muralismo_fauna'
          ? 'Mural de fauna autóctona y biodiversidad sobre muro cálido'
          : style === 'acuarela_naturalista'
            ? 'Lámina en acuarela botánica sobre papel algodón'
            : 'Apunte de campo en lápiz grafito 2B/4B';
    } else if (fallbackPhotoDataUrl) {
      finalImageUrl = await createArtisticPlateDataUrl(
        fallbackPhotoDataUrl,
        style,
        nextVersion,
        true,
        false
      );
      modelProvider =
        style === 'muralismo_fauna'
          ? 'Muralismo de fauna desde fotografía'
          : style === 'acuarela_naturalista'
            ? 'Acuarela botánica desde fotografía'
            : 'Apunte en grafito desde fotografía';
    } else {
      finalImageUrl = createFallbackBotanicalMonogramPlate(species, style);
      modelProvider = 'Lámina tipográfica de campo';
    }
  }

  consumptionMetrics.illustrationsGenerated += 1;

  const newIllustration: Illustration = {
    id: `ill_${taxonId}_${style}_v${nextVersion}_${Date.now()}`,
    taxonId,
    style,
    imageUrl: finalImageUrl,
    version: nextVersion,
    promptSummary:
      style === 'muralismo_fauna'
        ? `Muralismo de fauna autóctona y biodiversidad de ${species.commonNameAr} (${species.scientificName}), sin texto embebido.`
        : style === 'acuarela_naturalista'
          ? `Ilustración naturalista en acuarela botánica de ${species.commonNameAr} (${species.scientificName}), sin texto embebido.`
          : `Apunte de campo en lápiz grafito de ${species.commonNameAr} (${species.scientificName}), sin texto embebido.`,
    modelProvider,
    variationNote,
    createdAt: new Date().toISOString(),
  };

  return { illustration: newIllustration, reused: false };
}

/**
 * Crea una versión alternativa o un estudio pictórico/grafito en Canvas
 * respetando fielmente la morfología de la especie seleccionada.
 */
async function createArtisticPlateDataUrl(
  sourceUrl: string,
  style: IllustrationStyle,
  version: number,
  applyBotanicalFilter: boolean,
  allowProxyFallback = false
): Promise<string> {
  if (
    typeof Image === 'undefined' ||
    typeof document === 'undefined' ||
    isTestEnvironment()
  ) {
    return `${sourceUrl}${sourceUrl.includes('?') ? '&' : '?'}v=${version}`;
  }

  const renderFromUrl = (loadUrl: string): Promise<string | null> =>
    new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          // Para fotos reales sin lámina pintada, ejecutar el motor pictórico real
          // (Kuwahara de 2 pasadas + tinta sepia + disolución de bokeh / grafito Color-Dodge)
          if (applyBotanicalFilter) {
            const painted = renderBotanicalPlateFromImage(img, style, version);
            resolve(painted);
            return;
          }

          // Para láminas de acuarela/grafito ya pintadas a las que se les pide otra versión
          const size = 900;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }

          ctx.fillStyle =
            style === 'muralismo_fauna'
              ? '#EFE7D8'
              : style === 'acuarela_naturalista'
                ? '#FAF5E8'
                : '#F6F2E8';
          ctx.fillRect(0, 0, size, size);

          const imgRatio = (img.width || size) / (img.height || size);
          let sx = 0;
          let sy = 0;
          let sw = img.width || size;
          let sh = img.height || size;
          if (imgRatio > 1) {
            sw = img.height;
            sx = (img.width - sw) / 2;
          } else {
            sh = img.width;
            sy = (img.height - sh) / 2;
          }

          ctx.save();
          ctx.translate(size / 2, size / 2);
          if (version > 1 && version % 2 === 0) {
            ctx.scale(-1.04, 1.04);
          } else if (version > 1) {
            ctx.scale(1.07, 1.07);
            ctx.rotate(-0.02);
          }

          ctx.drawImage(img, sx, sy, sw, sh, -size / 2, -size / 2, size, size);
          ctx.restore();

          resolve(canvas.toDataURL('image/jpeg', 0.92));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = loadUrl;
    });

  // 1. Intentar directamente (rápido y con CORS si el origen lo soporta)
  const directRendered = await renderFromUrl(sourceUrl);
  if (directRendered) return directRendered;

  // 2. Si el origen remoto no permitió exportar Canvas, intentar proxy solo para renderizar en Canvas
  if (allowProxyFallback && /^https:\/\//i.test(sourceUrl)) {
    const proxied = await renderFromUrl(getProxiedImageUrl(sourceUrl));
    if (proxied) return proxied;
  }

  // 3. Fallback garantizado: siempre devolver la URL directa original (nunca un /api/image-proxy fallido)
  return sourceUrl;
}

function createFallbackBotanicalMonogramPlate(
  species: SpeciesCatalogEntry,
  style: IllustrationStyle
): string {
  const bg =
    style === 'muralismo_fauna'
      ? '#EFE7D8'
      : style === 'acuarela_naturalista'
        ? '#F6F0E2'
        : '#F3EFE6';
  const stroke =
    style === 'muralismo_fauna'
      ? '#1F5A54'
      : style === 'acuarela_naturalista'
        ? '#38573E'
        : '#4D4840';
  const emblem = ORGANISM_GROUP_META[getSpeciesGroup(species)].emoji;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    <rect width="800" height="800" fill="${bg}"/>
    <rect x="34" y="34" width="732" height="732" fill="none" stroke="${stroke}" stroke-opacity="0.28" stroke-width="2"/>
    <circle cx="400" cy="360" r="140" fill="${stroke}" fill-opacity="0.08"/>
    <text x="400" y="385" text-anchor="middle" font-family="Georgia, serif" font-size="108" fill="${stroke}" fill-opacity="0.65">${emblem}</text>
    <text x="400" y="560" text-anchor="middle" font-family="Georgia, serif" font-size="38" fill="#27221E">${species.commonNameAr.replace(/&/g, '&amp;')}</text>
    <text x="400" y="608" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="26" fill="${stroke}">${species.scientificName.replace(/&/g, '&amp;')}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
