import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import tls from 'node:tls';
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from 'undici';

let cachedWindowsDispatcher: Agent | null | undefined;

function getSecureDispatcher(): Agent | undefined {
  if (cachedWindowsDispatcher !== undefined) {
    return cachedWindowsDispatcher || undefined;
  }

  if (process.platform !== 'win32') {
    cachedWindowsDispatcher = null;
    return undefined;
  }

  try {
    const req = createRequire(import.meta.url);
    const winCa = req('win-ca/api') as ((opts: {
      format: unknown;
      ondata: (pem: string) => void;
    }) => void) & { der2: { pem: unknown } };

    const cas: string[] = [...tls.rootCertificates];
    winCa({
      format: winCa.der2.pem,
      ondata: (pem: string) => {
        if (pem) cas.push(pem);
      },
    });
    cachedWindowsDispatcher = new Agent({
      connect: { ca: cas },
    });
    return cachedWindowsDispatcher;
  } catch {
    cachedWindowsDispatcher = null;
    return undefined;
  }
}

/**
 * Fetch seguro del servidor que respeta el almacén de certificados raíz del sistema
 * operativo en Windows (evitando UNABLE_TO_VERIFY_LEAF_SIGNATURE sin desactivar TLS).
 */
export async function serverFetch(
  url: string,
  init: Omit<UndiciRequestInit, 'dispatcher'> = {}
) {
  const dispatcher = getSecureDispatcher();
  return undiciFetch(url, dispatcher ? { ...init, dispatcher } : init);
}

/**
 * Backend seguro para Birdy — Identificación multimodal con Google Gemini,
 * generación de láminas botánicas e integración con iNaturalist (fotos de referencia).
 *
 * IMPORTANTE: GEMINI_API_KEY vive exclusivamente en variables de entorno del servidor (.env),
 * jamás en el código ni bundle del cliente.
 */

export interface ServerEnv {
  GEMINI_API_KEY?: string;
  GEMINI_VISION_MODEL?: string;
  GEMINI_IMAGE_MODEL?: string;
  EBIRD_API_KEY?: string;
}

export interface ReferencePhotoDTO {
  url: string;
  thumbUrl: string;
  attribution?: string;
  source?: string;
}

export interface BirdReferenceDTO {
  inaturalistTaxonId: number;
  scientificName: string;
  commonNameAr: string;
  wikipediaUrl?: string;
  referencePhotos: ReferencePhotoDTO[];
}

const ALLOWED_IMAGE_PROXY_HOSTS = new Set([
  'inaturalist-open-data.s3.amazonaws.com',
  'static.inaturalist.org',
  'upload.wikimedia.org',
]);

const DEFAULT_VISION_MODELS = ['gemini-2.5-flash', 'gemini-3-flash-preview', 'gemini-2.0-flash'];
const DEFAULT_IMAGE_MODELS = [
  'gemini-3.1-flash-image-preview',
  'gemini-3.1-flash-image',
  'gemini-2.5-flash-image',
];

const inatSpeciesCache = new Map<string, { expiresAt: number; data: BirdReferenceDTO | null }>();
const inatSearchCache = new Map<string, { expiresAt: number; data: BirdReferenceDTO[] }>();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutos

/**
 * Lee las variables del servidor combinando process.env con .env / .env.local en disco,
 * permitiendo agregar GEMINI_API_KEY en .env sin reiniciar manualmente Vite durante desarrollo.
 */
export function resolveServerEnv(cwd: string = process.cwd()): ServerEnv {
  const fileVars: Record<string, string> = {};
  for (const filename of ['.env', '.env.local']) {
    const filePath = path.join(cwd, filename);
    if (!fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eqIdx = line.indexOf('=');
        if (eqIdx <= 0) continue;
        const key = line.slice(0, eqIdx).trim();
        let val = line.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (val) fileVars[key] = val;
      }
    } catch {
      // Ignorar errores de lectura en entornos restringidos
    }
  }

  return {
    GEMINI_API_KEY: (process.env.GEMINI_API_KEY || fileVars.GEMINI_API_KEY || '').trim() || undefined,
    GEMINI_VISION_MODEL:
      (process.env.GEMINI_VISION_MODEL || fileVars.GEMINI_VISION_MODEL || '').trim() || undefined,
    GEMINI_IMAGE_MODEL:
      (process.env.GEMINI_IMAGE_MODEL || fileVars.GEMINI_IMAGE_MODEL || '').trim() || undefined,
    EBIRD_API_KEY: (process.env.EBIRD_API_KEY || fileVars.EBIRD_API_KEY || '').trim() || undefined,
  };
}

export const SYSTEM_PROMPT_IDENTIFICACION_AVES_AR = `
Sos un ornitólogo de campo experto en la avifauna de la República Argentina y Sudamérica, asistiendo a una observadora en su Cuaderno de Aves personal.

REGLAS CRÍTICAS DE PRECISIÓN ORNITOLÓGICA:
1. Observá cuidadosamente CADA rasgo anatómico real presente en la fotografía: tamaño relativo y postura, forma exacta del pico (fino y recto de insectívoro como Troglodytes aedon vs. más largo y ligeramente curvo como Furnarius rufus vs. cónico granívoro), patrón de alas y cola (ej.: fino barrado oscuro en alas/cola y cola corta frecuentemente levantada en Ratona común / Troglodytes aedon; collar canela en Chingolo; ceja blanca larga en Calandria; pecho amarillo y antifaz en Benteveo), patas, entorno y plumaje (adulto, hembra o juvenil).
2. NUNCA adivines ni devuelvas una especie genérica por defecto (jamás asumas Hornero común si el ave es pequeña, barrada o tiene otra morfología).
3. Calibrá la incertidumbre con honestidad:
   - "alta": el ave se distingue nítidamente y sus rasgos diagnósticos permiten identificarla con alta seguridad. Aun así, incluí 1 o 2 especies visualmente cercanas de Argentina como alternativas de comparación (con confidenceBand = "Baja certeza" o "Posible candidata") cuando sea útil para que la usuaria compare.
   - "media": la foto está a contraluz, parcial, juvenil/hembra confusa, o hay 2–3 especies argentinas realmente parecidas. Explicá concretamente qué rasgo cuesta ver en "uncertaintyReason" y ofrecé 2 o 3 candidatas reales ordenadas por probabilidad.
   - "insuficiente": no hay ningún ave visible en la foto, o está demasiado borrosa/lejana/oculta para identificarla con responsabilidad. Devolvé proposedScientificName = null y explicá el motivo.
4. Usá SIEMPRE nombres comunes en español de Argentina (rioplatense, ej.: "Ratona común", "Hornero común", "Benteveo común", "Chingolo", "Calandria grande", "Tero común", "Picaflor común") y nombres científicos oficiales según Clements / eBird. En alternativeNames incluí apodos regionales frecuentes en Argentina (ej.: "Ratucha", "Tacuarita" para Troglodytes aedon).
5. Redactá todos los textos de ficha de forma BREVE, clara y amigable para celular:
   - quickSummary: 1 sola oración muy concisa (máximo 110 caracteres) con el rasgo visual más útil.
   - identificationTraits, typicalBehavior, dietAndHabitat, generalDistribution: 1 a 2 oraciones cortas cada uno, sin párrafos largos.
   - keyVisibleTraits: 3 a 4 puntos visuales cortos y concretos para que la usuaria los verifique mirando su foto (ej.: "Cola corta erguida con barritas oscuras", "Pico fino y recto").
`.trim();

export function buildNaturalistIllustrationPrompt(params: {
  commonNameAr: string;
  scientificName: string;
  identificationTraits: string;
  style: 'acuarela_naturalista' | 'lapiz_grafito';
  version?: number;
}): string {
  const poseHint =
    params.version && params.version > 1
      ? params.version % 2 === 0
        ? 'Show the bird in a lively three-quarter profile looking slightly to the left, perched naturally on a slender twig with subtle native leaves.'
        : 'Show the bird in an alert side profile with head gently turned, perched delicately on a botanical branch with tiny buds.'
      : 'Show the bird in a natural, graceful side profile perched on a delicate native Argentine twig with subtle botanical leaves.';

  if (params.style === 'acuarela_naturalista') {
    return [
      `Museum-grade traditional botanical and ornithological watercolor illustration of ${params.scientificName} (${params.commonNameAr}, bird of Argentina).`,
      `Strict anatomical and plumage accuracy is mandatory: ${params.identificationTraits}.`,
      poseHint,
      `Painted on warm cream cotton watercolor paper (#F7F3E8) with luminous translucent watercolor washes, delicate fine-brush feather texture, generous clean paper margins around the subject.`,
      `Strictly NO text, NO typography, NO labels, NO Latin names, NO signatures, NO borders, NO watermarks anywhere in the image.`,
    ].join(' ');
  }

  return [
    `Museum-grade traditional naturalist field-sketch illustration in graphite pencil (2B/4B) of ${params.scientificName} (${params.commonNameAr}, bird of Argentina).`,
    `Strict anatomical and plumage accuracy is mandatory: ${params.identificationTraits}.`,
    poseHint,
    `Drawn on warm cream archival sketchbook paper (#F5F1E8) with fine botanical pencil linework, delicate cross-hatching and realistic tonal shading, generous clean margins.`,
    `Strictly NO text, NO typography, NO labels, NO Latin names, NO signatures, NO borders, NO watermarks anywhere in the image.`,
  ].join(' ');
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64Data: string } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl.trim());
  if (!match) return null;
  return { mimeType: match[1], base64Data: match[2] };
}

function normalizeScientificSlug(sci: string): string {
  return sci
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function upgradeInatPhotoUrl(url: string, size: 'medium' | 'large' | 'small' = 'medium'): string {
  if (!url) return url;
  return url.replace(/\/(square|small|medium|large|original)\./, `/${size}.`);
}

/**
 * Obtiene fotos reales de referencia de iNaturalist para una especie de ave (sin requerir API key).
 */
export async function fetchINaturalistPhotosForSpecies(
  scientificName: string
): Promise<BirdReferenceDTO | null> {
  const cleanSci = scientificName.trim();
  if (!cleanSci) return null;

  const cacheKey = cleanSci.toLowerCase();
  const cached = inatSpeciesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(
      cleanSci
    )}&taxon_id=3&locale=es-AR&preferred_place_id=7190&per_page=5`;

    const res = await serverFetch(searchUrl, {
      headers: { Accept: 'application/json', 'User-Agent': 'BirdyCuadernoDeAves/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as { results?: Array<Record<string, unknown>> };
    const results = json.results || [];
    if (results.length === 0) {
      inatSpeciesCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: null });
      return null;
    }

    const exact =
      results.find(
        (t) => String(t.name || '').toLowerCase() === cleanSci.toLowerCase()
      ) || results[0];

    const taxonId = Number(exact.id);
    const photos: ReferencePhotoDTO[] = [];

    // Consultar detalle del taxón para obtener hasta 4 fotos curadas desde distintos ángulos
    if (taxonId) {
      try {
        const detailRes = await serverFetch(
          `https://api.inaturalist.org/v1/taxa/${taxonId}?locale=es-AR`,
          {
            headers: { Accept: 'application/json', 'User-Agent': 'BirdyCuadernoDeAves/1.0' },
            signal: AbortSignal.timeout(7000),
          }
        );
        if (detailRes.ok) {
          const detailJson = (await detailRes.json()) as {
            results?: Array<{
              taxon_photos?: Array<{
                photo?: {
                  medium_url?: string;
                  large_url?: string;
                  square_url?: string;
                  url?: string;
                  attribution?: string;
                };
              }>;
            }>;
          };
          const taxonPhotos = detailJson.results?.[0]?.taxon_photos || [];
          // Priorizar fotos alojadas en el bucket abierto de iNaturalist (S3) que responde confiablemente
          const orderedPhotos = [...taxonPhotos].sort((a, b) => {
            const urlA = a.photo?.medium_url || a.photo?.url || '';
            const urlB = b.photo?.medium_url || b.photo?.url || '';
            const openA = urlA.includes('inaturalist-open-data.s3.amazonaws.com') ? 0 : 1;
            const openB = urlB.includes('inaturalist-open-data.s3.amazonaws.com') ? 0 : 1;
            return openA - openB;
          });
          for (const tp of orderedPhotos.slice(0, 4)) {
            const p = tp.photo;
            if (!p) continue;
            const rawUrl = p.medium_url || p.url || '';
            if (!rawUrl) continue;
            photos.push({
              url: p.large_url || upgradeInatPhotoUrl(rawUrl, 'large'),
              thumbUrl: p.medium_url || upgradeInatPhotoUrl(rawUrl, 'medium'),
              attribution: p.attribution || 'iNaturalist',
              source: 'iNaturalist',
            });
          }
        }
      } catch {
        // Fallback a default_photo del resultado de búsqueda
      }
    }

    if (photos.length === 0) {
      const defPhoto = exact.default_photo as
        | { medium_url?: string; url?: string; attribution?: string }
        | undefined;
      if (defPhoto?.medium_url || defPhoto?.url) {
        const base = defPhoto.medium_url || defPhoto.url || '';
        photos.push({
          url: upgradeInatPhotoUrl(base, 'large'),
          thumbUrl: upgradeInatPhotoUrl(base, 'medium'),
          attribution: defPhoto.attribution || 'iNaturalist',
          source: 'iNaturalist',
        });
      }
    }

    const dto: BirdReferenceDTO = {
      inaturalistTaxonId: taxonId,
      scientificName: String(exact.name || cleanSci),
      commonNameAr: String(exact.preferred_common_name || exact.name || cleanSci),
      wikipediaUrl: exact.wikipedia_url ? String(exact.wikipedia_url) : undefined,
      referencePhotos: photos,
    };

    inatSpeciesCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: dto });
    return dto;
  } catch {
    return null;
  }
}

/**
 * Busca aves en vivo en iNaturalist (Clase Aves, taxon_id=3) en español de Argentina.
 */
export async function searchINaturalistBirds(query: string): Promise<BirdReferenceDTO[]> {
  const clean = query.trim();
  if (clean.length < 2) return [];

  const cacheKey = clean.toLowerCase();
  const cached = inatSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const url = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(
      clean
    )}&taxon_id=3&rank=species&locale=es-AR&preferred_place_id=7190&per_page=8`;
    const res = await serverFetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'BirdyCuadernoDeAves/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];

    const json = (await res.json()) as { results?: Array<Record<string, unknown>> };
    const mapped: BirdReferenceDTO[] = (json.results || []).map((t) => {
      const defPhoto = t.default_photo as
        | { medium_url?: string; url?: string; attribution?: string }
        | undefined;
      const base = defPhoto?.medium_url || defPhoto?.url || '';
      return {
        inaturalistTaxonId: Number(t.id),
        scientificName: String(t.name || ''),
        commonNameAr: String(t.preferred_common_name || t.name || ''),
        wikipediaUrl: t.wikipedia_url ? String(t.wikipedia_url) : undefined,
        referencePhotos: base
          ? [
              {
                url: upgradeInatPhotoUrl(base, 'large'),
                thumbUrl: upgradeInatPhotoUrl(base, 'medium'),
                attribution: defPhoto?.attribution || 'iNaturalist',
                source: 'iNaturalist',
              },
            ]
          : [],
      };
    });

    inatSearchCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: mapped });
    return mapped;
  } catch {
    return [];
  }
}

interface GeminiRawIdentification {
  confidenceLevel: 'alta' | 'media' | 'insuficiente';
  explanation: string;
  uncertaintyReason: string | null;
  proposedScientificName: string | null;
  candidates: Array<{
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
    identificationTraits?: string;
    typicalBehavior?: string;
    dietAndHabitat?: string;
    generalDistribution?: string;
  }>;
}

const IDENTIFICATION_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    confidenceLevel: {
      type: 'STRING',
      enum: ['alta', 'media', 'insuficiente'],
    },
    explanation: {
      type: 'STRING',
      description: 'Resumen claro y breve en español rioplatense (1-2 oraciones).',
    },
    uncertaintyReason: {
      type: 'STRING',
      nullable: true,
      description: 'Motivo concreto de duda si confidenceLevel es media o insuficiente; null si es alta.',
    },
    proposedScientificName: {
      type: 'STRING',
      nullable: true,
      description: 'Nombre científico de la candidata principal, o null si es insuficiente.',
    },
    candidates: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          commonNameAr: { type: 'STRING' },
          scientificName: { type: 'STRING' },
          alternativeNames: { type: 'ARRAY', items: { type: 'STRING' } },
          family: { type: 'STRING' },
          confidenceBand: {
            type: 'STRING',
            enum: ['Muy probable', 'Posible candidata', 'Baja certeza'],
          },
          reasoning: { type: 'STRING' },
          keyVisibleTraits: { type: 'ARRAY', items: { type: 'STRING' } },
          quickSummary: { type: 'STRING' },
          sizeLabel: { type: 'STRING' },
          habitatTag: { type: 'STRING' },
          dietTag: { type: 'STRING' },
          identificationTraits: { type: 'STRING' },
          typicalBehavior: { type: 'STRING' },
          dietAndHabitat: { type: 'STRING' },
          generalDistribution: { type: 'STRING' },
        },
        required: [
          'commonNameAr',
          'scientificName',
          'confidenceBand',
          'reasoning',
          'keyVisibleTraits',
          'quickSummary',
        ],
      },
    },
  },
  required: ['confidenceLevel', 'explanation', 'candidates'],
};

/**
 * Identifica un ave real a partir de su fotografía usando Google Gemini Vision
 * y enriquece las especies candidatas con fotos reales de referencia de iNaturalist.
 */
export async function identifyBirdWithGemini(
  req: {
    sanitizedPhotoDataUrl: string;
    generalLocationHint?: string;
    observedAtIso?: string;
  },
  env: ServerEnv = resolveServerEnv()
): Promise<{
  status: 'identificado' | 'requiere_confirmacion' | 'pendiente_identificacion';
  confidenceLevel: 'alta' | 'media' | 'insuficiente';
  proposedTaxonId: string | null;
  candidates: Array<Record<string, unknown>>;
  explanation: string;
  uncertaintyReason: string | null;
  fromCache: boolean;
  taxonomicSource: string;
  aiMode: 'gemini';
  modelUsed: string;
}> {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }

  const parsedImage = parseDataUrl(req.sanitizedPhotoDataUrl);
  if (!parsedImage) {
    throw new Error('INVALID_IMAGE_DATA_URL');
  }

  const locationContext = req.generalLocationHint
    ? `Lugar aproximado de observación informado por la usuaria: ${req.generalLocationHint}.`
    : 'Lugar no especificado (asumir probabilidad prioritaria de avifauna de Argentina / Cono Sur, salvo que los rasgos indiquen claramente otra región).';

  const dateContext = req.observedAtIso
    ? `Fecha de observación: ${req.observedAtIso}.`
    : '';

  const userPrompt = [
    'Identificá el ave presente en esta fotografía real.',
    locationContext,
    dateContext,
    'Devolvé únicamente el JSON respetando estrictamente el esquema solicitado.',
  ]
    .filter(Boolean)
    .join('\n');

  const modelsToTry = Array.from(
    new Set([env.GEMINI_VISION_MODEL, ...DEFAULT_VISION_MODELS].filter(Boolean) as string[])
  );

  let parsedResult: GeminiRawIdentification | null = null;
  let usedModel = modelsToTry[0];
  let lastErrorText = '';

  for (const model of modelsToTry) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent`;

    const response = await serverFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT_IDENTIFICACION_AVES_AR }],
        },
        contents: [
          {
            role: 'user',
            parts: [
              { text: userPrompt },
              {
                inlineData: {
                  mimeType: parsedImage.mimeType,
                  data: parsedImage.base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: IDENTIFICATION_RESPONSE_SCHEMA,
        },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      lastErrorText = `${model} (${response.status}): ${errBody.slice(0, 260)}`;
      if ([400, 404, 429, 503].includes(response.status)) {
        continue;
      }
      throw new Error(`GEMINI_API_ERROR: ${lastErrorText}`);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = payload.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || '')
      .join('')
      .trim();

    if (!rawText) {
      lastErrorText = `${model}: respuesta vacía`;
      continue;
    }

    try {
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      parsedResult = JSON.parse(cleaned) as GeminiRawIdentification;
      usedModel = model;
      break;
    } catch {
      lastErrorText = `${model}: JSON inválido`;
    }
  }

  if (!parsedResult) {
    throw new Error(`GEMINI_FAILED: ${lastErrorText || 'Sin respuesta válida'}`);
  }

  // Enriquecer candidatas con fotos reales de referencia de iNaturalist en paralelo
  const rawCandidates = (parsedResult.candidates || []).slice(0, 3);
  const enrichedCandidates = await Promise.all(
    rawCandidates.map(async (cand) => {
      const ref = await fetchINaturalistPhotosForSpecies(cand.scientificName);
      return {
        taxonId: `sp_${normalizeScientificSlug(cand.scientificName)}`,
        commonNameAr: cand.commonNameAr,
        scientificName: cand.scientificName,
        alternativeNames: cand.alternativeNames || [],
        family: cand.family || 'Aves',
        confidenceBand: cand.confidenceBand,
        reasoning: cand.reasoning,
        keyVisibleTraits: (cand.keyVisibleTraits || []).slice(0, 4),
        quickSummary: cand.quickSummary || cand.reasoning,
        sizeLabel: cand.sizeLabel,
        habitatTag: cand.habitatTag,
        dietTag: cand.dietTag,
        identificationTraits: cand.identificationTraits || cand.quickSummary || cand.reasoning,
        typicalBehavior: cand.typicalBehavior || '',
        dietAndHabitat: cand.dietAndHabitat || '',
        generalDistribution: cand.generalDistribution || 'Avifauna registrada en Argentina.',
        referencePhotos: ref?.referencePhotos || [],
        wikipediaUrl: ref?.wikipediaUrl,
      };
    })
  );

  const confidenceLevel = parsedResult.confidenceLevel;
  const status =
    confidenceLevel === 'alta'
      ? 'identificado'
      : confidenceLevel === 'media'
        ? 'requiere_confirmacion'
        : 'pendiente_identificacion';

  const proposedTaxonId =
    confidenceLevel === 'insuficiente'
      ? null
      : parsedResult.proposedScientificName
        ? `sp_${normalizeScientificSlug(parsedResult.proposedScientificName)}`
        : enrichedCandidates[0]?.taxonId || null;

  return {
    status,
    confidenceLevel,
    proposedTaxonId,
    candidates: enrichedCandidates,
    explanation: parsedResult.explanation,
    uncertaintyReason: parsedResult.uncertaintyReason || null,
    fromCache: false,
    taxonomicSource: `Google Gemini (${usedModel}) + Referencias visuales iNaturalist / eBird (es_AR)`,
    aiMode: 'gemini',
    modelUsed: usedModel,
  };
}

/**
 * Genera una lámina botánica original en Acuarela Naturalista o Lápiz Grafito
 * usando la generación nativa de imágenes de Google Gemini.
 */
export async function generateNaturalistPlateWithGemini(
  params: {
    commonNameAr: string;
    scientificName: string;
    identificationTraits: string;
    style: 'acuarela_naturalista' | 'lapiz_grafito';
    version?: number;
  },
  env: ServerEnv = resolveServerEnv()
): Promise<{
  imageUrl: string;
  modelProvider: string;
  variationNote: string;
}> {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }

  const prompt = buildNaturalistIllustrationPrompt(params);
  const modelsToTry = Array.from(
    new Set([env.GEMINI_IMAGE_MODEL, ...DEFAULT_IMAGE_MODELS].filter(Boolean) as string[])
  );

  let lastError = '';

  for (const model of modelsToTry) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent`;

    const response = await serverFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: '1:1',
          },
        },
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      lastError = `${model} (${response.status}): ${errBody.slice(0, 220)}`;
      if ([400, 404, 429, 503].includes(response.status)) {
        continue;
      }
      throw new Error(`GEMINI_IMAGE_ERROR: ${lastError}`);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inlineData?: { mimeType?: string; data?: string };
            inline_data?: { mime_type?: string; data?: string };
          }>;
        };
      }>;
    };

    const parts = payload.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      const inline = part.inlineData || part.inline_data;
      if (inline?.data) {
        const mime =
          ('mimeType' in inline && inline.mimeType) ||
          ('mime_type' in inline && inline.mime_type) ||
          'image/png';
        return {
          imageUrl: `data:${mime};base64,${inline.data}`,
          modelProvider: `Google Gemini (${model})`,
          variationNote:
            (params.version || 1) > 1
              ? `Versión #${params.version} — Ilustración alternativa generada con IA`
              : params.style === 'acuarela_naturalista'
                ? 'Lámina en acuarela botánica sobre papel algodón'
                : 'Apunte de campo en lápiz grafito 2B/4B',
        };
      }
    }

    lastError = `${model}: no devolvió imagen en la respuesta`;
  }

  throw new Error(`GEMINI_IMAGE_FAILED: ${lastError}`);
}

/**
 * Valida si una URL remota está permitida para el proxy seguro de imágenes (evita SSRF).
 */
export function isAllowedImageProxyUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' && ALLOWED_IMAGE_PROXY_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}
