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
  GROQ_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  HUGGINGFACE_API_KEY?: string;
  HUGGINGFACE_IMAGE_MODEL?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_IMAGE_MODEL?: string;
  OPENAI_API_KEY?: string;
  EBIRD_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  ALLOWED_EMAILS?: string;
  AUTH_SESSION_SECRET?: string;
  REQUIRE_GOOGLE_AUTH?: string;
  // Persistencia real en la nube (Firestore + Cloudflare R2)
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  CLOUDFLARE_R2_ACCOUNT_ID?: string;
  CLOUDFLARE_R2_ACCESS_KEY_ID?: string;
  CLOUDFLARE_R2_SECRET_ACCESS_KEY?: string;
  CLOUDFLARE_R2_BUCKET_NAME?: string;
  CLOUDFLARE_R2_PUBLIC_URL?: string;
}

export interface ReferencePhotoDTO {
  url: string;
  thumbUrl: string;
  attribution?: string;
  source?: string;
}

export type ServerOrganismGroup =
  | 'aves'
  | 'mariposas'
  | 'abejas_abejorros'
  | 'insectos_aracnidos'
  | 'fauna_vecina';

export interface BirdReferenceDTO {
  inaturalistTaxonId: number;
  scientificName: string;
  commonNameAr: string;
  iconicTaxonName?: string;
  organismGroup?: ServerOrganismGroup;
  wikipediaUrl?: string;
  referencePhotos: ReferencePhotoDTO[];
}

const ALLOWED_IMAGE_PROXY_HOSTS = new Set([
  'inaturalist-open-data.s3.amazonaws.com',
  'static.inaturalist.org',
  'upload.wikimedia.org',
]);

export const DEFAULT_VISION_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview',
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
];
const KNOWN_RETIRED_VISION_MODELS = new Set([
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-exp',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
]);

export function resolveActiveVisionModel(env: ServerEnv): string {
  const configured = env.GEMINI_VISION_MODEL?.trim();
  if (configured && !KNOWN_RETIRED_VISION_MODELS.has(configured.toLowerCase())) {
    return configured;
  }
  return DEFAULT_VISION_MODELS[0];
}
const DEFAULT_IMAGE_MODELS = [
  'gemini-3.1-flash-image',
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image',
  'gemini-3.1-flash-lite-image',
];

// Memoria efímera de salud de modelos: recuerda qué modelo responde bien y enfría temporalmente los 503/429
let lastWorkingVisionModel: { model: string; expiresAt: number } | null = null;
const deprecatedVisionModels = new Set<string>();
const visionModelCooldownUntil = new Map<string, number>();
let geminiImageQuotaCooldownUntil = 0;
const WORKING_MODEL_TTL_MS = 1000 * 60 * 15; // 15 minutos
const HIGH_DEMAND_COOLDOWN_MS = 1000 * 60 * 2; // 2 minutos ante 503/timeout
const QUOTA_COOLDOWN_MS = 1000 * 60 * 10; // 10 minutos ante 429 (cuota 0)

export function resetVisionModelHealthForTests(): void {
  lastWorkingVisionModel = null;
  deprecatedVisionModels.clear();
  visionModelCooldownUntil.clear();
  geminiImageQuotaCooldownUntil = 0;
}

export function getEffectiveAiImageProviders(env: ServerEnv): string[] {
  const providers: string[] = [];
  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) {
    providers.push(`Cloudflare Workers AI (${env.CLOUDFLARE_IMAGE_MODEL || 'FLUX.1-schnell'})`);
  }
  if (env.HUGGINGFACE_API_KEY) {
    providers.push(`Hugging Face (${env.HUGGINGFACE_IMAGE_MODEL || 'FLUX.1-schnell'})`);
  }
  if (env.OPENAI_API_KEY) {
    providers.push('OpenAI (gpt-image-1)');
  }
  return providers;
}

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
    GROQ_API_KEY: (process.env.GROQ_API_KEY || fileVars.GROQ_API_KEY || '').trim() || undefined,
    OPENROUTER_API_KEY:
      (process.env.OPENROUTER_API_KEY || fileVars.OPENROUTER_API_KEY || '').trim() || undefined,
    HUGGINGFACE_API_KEY:
      (
        process.env.HUGGINGFACE_API_KEY ||
        fileVars.HUGGINGFACE_API_KEY ||
        process.env.HF_TOKEN ||
        fileVars.HF_TOKEN ||
        ''
      ).trim() || undefined,
    HUGGINGFACE_IMAGE_MODEL:
      (process.env.HUGGINGFACE_IMAGE_MODEL || fileVars.HUGGINGFACE_IMAGE_MODEL || '').trim() ||
      undefined,
    CLOUDFLARE_ACCOUNT_ID:
      (process.env.CLOUDFLARE_ACCOUNT_ID || fileVars.CLOUDFLARE_ACCOUNT_ID || '').trim() ||
      undefined,
    CLOUDFLARE_API_TOKEN:
      (process.env.CLOUDFLARE_API_TOKEN || fileVars.CLOUDFLARE_API_TOKEN || '').trim() ||
      undefined,
    CLOUDFLARE_IMAGE_MODEL:
      (process.env.CLOUDFLARE_IMAGE_MODEL || fileVars.CLOUDFLARE_IMAGE_MODEL || '').trim() ||
      undefined,
    OPENAI_API_KEY: (process.env.OPENAI_API_KEY || fileVars.OPENAI_API_KEY || '').trim() || undefined,
    EBIRD_API_KEY: (process.env.EBIRD_API_KEY || fileVars.EBIRD_API_KEY || '').trim() || undefined,
    GOOGLE_CLIENT_ID:
      (
        process.env.GOOGLE_CLIENT_ID ||
        fileVars.GOOGLE_CLIENT_ID ||
        process.env.VITE_GOOGLE_CLIENT_ID ||
        fileVars.VITE_GOOGLE_CLIENT_ID ||
        ''
      ).trim() || undefined,
    ALLOWED_EMAILS:
      (process.env.ALLOWED_EMAILS || fileVars.ALLOWED_EMAILS || '').trim() || undefined,
    AUTH_SESSION_SECRET:
      (process.env.AUTH_SESSION_SECRET || fileVars.AUTH_SESSION_SECRET || '').trim() || undefined,
    REQUIRE_GOOGLE_AUTH:
      (process.env.REQUIRE_GOOGLE_AUTH || fileVars.REQUIRE_GOOGLE_AUTH || '').trim() || undefined,
    FIREBASE_SERVICE_ACCOUNT_JSON:
      (
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
        fileVars.FIREBASE_SERVICE_ACCOUNT_JSON ||
        ''
      ).trim() || undefined,
    FIREBASE_PROJECT_ID:
      (process.env.FIREBASE_PROJECT_ID || fileVars.FIREBASE_PROJECT_ID || '').trim() || undefined,
    FIREBASE_CLIENT_EMAIL:
      (process.env.FIREBASE_CLIENT_EMAIL || fileVars.FIREBASE_CLIENT_EMAIL || '').trim() ||
      undefined,
    FIREBASE_PRIVATE_KEY:
      (process.env.FIREBASE_PRIVATE_KEY || fileVars.FIREBASE_PRIVATE_KEY || '').trim() || undefined,
    CLOUDFLARE_R2_ACCOUNT_ID:
      (
        process.env.CLOUDFLARE_R2_ACCOUNT_ID ||
        fileVars.CLOUDFLARE_R2_ACCOUNT_ID ||
        process.env.CLOUDFLARE_ACCOUNT_ID ||
        fileVars.CLOUDFLARE_ACCOUNT_ID ||
        ''
      ).trim() || undefined,
    CLOUDFLARE_R2_ACCESS_KEY_ID:
      (process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || fileVars.CLOUDFLARE_R2_ACCESS_KEY_ID || '').trim() ||
      undefined,
    CLOUDFLARE_R2_SECRET_ACCESS_KEY:
      (
        process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ||
        fileVars.CLOUDFLARE_R2_SECRET_ACCESS_KEY ||
        ''
      ).trim() || undefined,
    CLOUDFLARE_R2_BUCKET_NAME:
      (process.env.CLOUDFLARE_R2_BUCKET_NAME || fileVars.CLOUDFLARE_R2_BUCKET_NAME || '').trim() ||
      undefined,
    CLOUDFLARE_R2_PUBLIC_URL:
      (process.env.CLOUDFLARE_R2_PUBLIC_URL || fileVars.CLOUDFLARE_R2_PUBLIC_URL || '').trim() ||
      undefined,
  };
}

export const SYSTEM_PROMPT_IDENTIFICACION_BIOMA_AR = `
Sos un biólogo naturalista de campo experto en la biodiversidad urbana, de jardín y silvestre de la República Argentina y Sudamérica, asistiendo a una observadora en «Bioma», su cuaderno vivo de jardín y naturaleza.

GRUPOS QUE IDENTIFICÁS (clasificá cada candidata en exactamente uno de estos valores en "organismGroup"):
- "aves": pájaros y aves de jardín, parque, costa o campo.
- "mariposas": mariposas diurnas, polillas, esfinges y orugas (Lepidoptera).
- "abejas_abejorros": abejas melíferas, abejas nativas sin aguijón, abejas solitarias/metálicas y abejorros/mangangás (Anthophila).
- "insectos_aracnidos": otros insectos, arañas y pequeños artrópodos del jardín (coleópteros, mantis, libélulas, avispas, hormigas, chicharras, arañas, bichos bolita, etc.).
- "fauna_vecina": otros animales vecinos del jardín (lagartijas, lagartos, gekos, sapos, ranas, comadrejas, cuises, murciélagos, caracoles, babosas, tortugas, etc.).

PROTOCOLO VISUAL ESTRICTO (PASO OBLIGATORIO ANTES DE IDENTIFICAR):
1. Primero completá "visualObservation" describiendo de manera fría, literal y objetiva ÚNICAMENTE lo que se ve en los píxeles de la foto:
   - Colores dominantes exactos y patrón (bandas, manchas, lunares, líneas, reflejos).
   - Anatomía diagnóstica visible:
     * En mariposas: color de fondo de alas, bandas o manchas, presencia o ausencia de colas largas posteriores (Papilionidae / cola de golondrina), ocelos, antenas, cara dorsal vs ventral.
     * En aves: forma exacta del pico (fino insectívoro vs cónico semillero vs curvo), postura, ceja, collar, patrón de alas/cola.
     * En abejas/abejorros e insectos: vellosidad, bandas, forma del abdomen, alas, patas (diferenciá claramente abeja/abejorro de avispa o mosca sírfida).
     * En arañas y fauna vecina: forma del cuerpo, patas, escamas, piel o caparazón.
2. REGLA DE COHERENCIA CROMÁTICA Y MORFOLÓGICA ABSOLUTA:
   - JAMÁS propongas una especie cuya coloración o morfología real contradiga "visualObservation".
   - Ejemplo crítico: si la mariposa de la foto es NEGRA con bandas/manchas AMARILLAS y colas largas posteriores, NUNCA propongas una especie celeste/blanca sin colas como Morpho epistrophus; evaluá papiliónidos reales de Argentina como Heraclides thoas (Mariposa limonera / cola de golondrina), Heraclides astyalus o Papilio scamander.
   - Si dudás entre 2 especies hermanas muy parecidas de la misma familia/género, mantené la coherencia visual y ofrecé esas 2–3 especies cercanas reales ordenadas por probabilidad.
3. NUNCA adivines ni devuelvas una especie genérica por defecto.
4. Calibrá la incertidumbre con honestidad:
   - "alta": el ejemplar se distingue nítidamente y sus rasgos diagnósticos permiten identificar la especie (o género si la especie exacta requiere lupa/microscopio, aclarando esto en el razonamiento). Incluí 1 o 2 especies visualmente cercanas de Argentina como alternativas de comparación cuando ayude a verificar.
   - "media": la foto está lejana, a contraluz, parcial o existen 2–3 especies muy parecidas. Explicá concretamente qué rasgo cuesta ver en "uncertaintyReason" y ofrecé 2 o 3 candidatas reales ordenadas por probabilidad.
   - "insuficiente": no se distingue ningún animal, insecto, mariposa ni ave en la fotografía, o está demasiado borrosa/oculta para identificarla con responsabilidad. Devolvé proposedScientificName = null y explicá el motivo.
5. Usá SIEMPRE nombres comunes en español de Argentina (rioplatense) y nombres científicos oficiales vigentes (iNaturalist / Clements). En alternativeNames incluí apodos locales frecuentes.
6. Completá SIEMPRE el valor ecológico, la convivencia y la ECOLOGÍA DE JARDÍN ("gardenEcology") en tono cercano, práctico y específico para jardines de Argentina:
   - ecologicalRole: 1 frase muy corta (ej. "Polinizadora diurna de flores y cítricos").
   - coexistenceNote: 1 oración clara sobre convivencia en casa/jardín.
   - gardenEcology (MUY VALIOSO para la usuaria):
     * seeksInGarden: qué viene a buscar exactamente al jardín (néctar, frutas maduras, plantas hospederas para orugas, cazar mosquitos/pulgones, agua, refugio).
     * preferredFlowers: flores y plantas concretas de jardín argentino que visita (ej. lantanas, salvias, lavandas, mburucuyá, asclepias, jazmines, rosales, romero).
     * preferredFruitTrees: árboles frutales o nativos concretos que busca (ej. limonero, naranjo, higuera, níspero, morera, ciruelo, coronillo, ceibo; si no depende de frutales, aclararlo con claridad).
     * insectsOrFoodEaten: qué insectos, presas o alimentos concretos consume (ej. pulgones, mosquitos, lombrices, o aclarar si no come insectos y liba néctar / come frutas / hojas de cítricos en etapa de oruga).
7. Redactá todos los textos de ficha de forma BREVE, precisa y cómoda para celular:
   - quickSummary: 1 oración concisa (máximo 115 caracteres) con el rasgo visual más útil.
   - identificationTraits, typicalBehavior, dietAndHabitat, generalDistribution: 1 a 2 oraciones cortas cada uno.
   - keyVisibleTraits: 3 a 4 puntos visuales concretos para verificar mirando la foto.
`.trim();

// Alias retrocompatible
export const SYSTEM_PROMPT_IDENTIFICACION_AVES_AR = SYSTEM_PROMPT_IDENTIFICACION_BIOMA_AR;

export function inferServerOrganismGroup(meta: {
  organismGroup?: string | null;
  iconicTaxonName?: string | null;
  scientificName?: string | null;
  commonName?: string | null;
  family?: string | null;
}): ServerOrganismGroup {
  const valid = new Set<ServerOrganismGroup>([
    'aves',
    'mariposas',
    'abejas_abejorros',
    'insectos_aracnidos',
    'fauna_vecina',
  ]);
  if (meta.organismGroup && valid.has(meta.organismGroup as ServerOrganismGroup)) {
    return meta.organismGroup as ServerOrganismGroup;
  }

  const normalize = (v: string) =>
    v
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const iconic = normalize(meta.iconicTaxonName || '');
  const combined = normalize(
    `${meta.commonName || ''} ${meta.scientificName || ''} ${meta.family || ''}`
  );

  if (iconic === 'aves') return 'aves';
  if (iconic === 'arachnida') return 'insectos_aracnidos';
  if (
    iconic === 'reptilia' ||
    iconic === 'amphibia' ||
    iconic === 'mammalia' ||
    iconic === 'mollusca' ||
    iconic === 'actinopterygii'
  ) {
    return 'fauna_vecina';
  }

  if (
    /\b(mariposas?|polillas?|orugas?|esfinges?|lepidoptera|nymphalidae|pieridae|papilionidae|hesperiidae|lycaenidae|sphingidae|saturniidae|danaus|agraulis|morpho|vanessa|junonia|eurema|ascia|aellopos|heliconius|papilio|heraclides|battus|phoebis|pieris|colias|dryas)\b/.test(
      combined
    )
  ) {
    return 'mariposas';
  }
  if (
    /\b(abejas?|abejitas?|abejorros?|mangangas?|yatei|melipon\w*|apidae|megachilidae|halictidae|andrenidae|colletidae|anthophila|apis|bombus|xylocopa|tetragonisca|megachile|augochlora|centris|euglossa)\b/.test(
      combined
    )
  ) {
    return 'abejas_abejorros';
  }
  if (
    iconic === 'insecta' ||
    /\b(insectos?|aranas?|aranitas?|aracnid\w*|vaquitas?|mariquitas?|mantis|mamboretas?|libelulas?|alguaciles?|escarabajos?|cascarudos?|toritos?|hormigas?|avispas?|grillos?|langostas?|saltamontes|chicharras?|cigarras?|bichos?|moscas?|mosquitos?|chinches?|coleoptera|hemiptera|odonata|orthoptera|hymenoptera|diptera|mantodea|araneae|salticidae|araneidae|coccinellidae|formicidae|scarabaeidae|cicadidae|armadillidi\w*)\b/.test(
      combined
    )
  ) {
    return 'insectos_aracnidos';
  }
  if (
    /\b(lagartijas?|lagartos?|gekos?|geckos?|salamanquesas?|sapos?|ranas?|ranitas?|escuerzos?|comadrejas?|zarigueyas?|cuises?|cuis|murcielagos?|zorros?|liebres?|caracoles?|caracol|babosas?|tortugas?|culebras?|serpientes?|teius|salvator|hemidactylus|rhinella|boana|didelphis|cornu|cavia)\b/.test(
      combined
    )
  ) {
    return 'fauna_vecina';
  }

  return 'aves';
}

export type ServerIllustrationStyle =
  | 'muralismo_fauna'
  | 'acuarela_naturalista'
  | 'lapiz_grafito';

export function buildNaturalistIllustrationPrompt(params: {
  commonNameAr: string;
  scientificName: string;
  identificationTraits: string;
  style: ServerIllustrationStyle;
  organismGroup?: ServerOrganismGroup;
  version?: number;
}): string {
  const group = params.organismGroup || 'aves';
  const altVersion = Boolean(params.version && params.version > 1);
  const evenVersion = Boolean(params.version && params.version % 2 === 0);

  let discipline = 'ornithological field-guide';
  let taxonContext = 'bird of South America';
  let poseHint = altVersion
    ? evenVersion
      ? 'Perched in a lively three-quarter profile facing left on a slender diagonal twig with small olive-green botanical leaves and tiny pale buds.'
      : 'Perched in a graceful alert side profile with head turned slightly on a delicate native branch with sparse fine leaves.'
    : 'Perched naturally in clean side profile on a slender diagonal botanical twig with delicate small olive-green leaves and tiny pale buds.';
  let detailPhrase = 'crisp layered feather brushwork';

  if (group === 'mariposas') {
    discipline = 'lepidopterological botanical field-guide';
    taxonContext = 'butterfly / moth of South America';
    poseHint = altVersion
      ? evenVersion
        ? 'Perched delicately with wings gently open on a slender South American wildflower stem with small leaves.'
        : 'Graceful natural side-angle view resting on a botanical flower blossom showing intricate wing patterns.'
      : 'Wings gracefully spread in a classic naturalist study perched lightly on a delicate native wildflower sprig with small olive leaves.';
    detailPhrase = 'luminous translucent wing-scale brushwork and delicate vein linework';
  } else if (group === 'abejas_abejorros') {
    discipline = 'entomological botanical field-guide';
    taxonContext = 'pollinator bee / bumblebee of South America';
    poseHint = altVersion
      ? evenVersion
        ? 'Close-up naturalist study gathering nectar on a delicate native garden blossom with fine pollen details.'
        : 'Three-quarter profile perched gently on a small blooming botanical sprig showing translucent veined wings.'
      : 'Naturalist close-up study perched delicately on a single native wildflower blossom with sparse green leaves, showing velvety hairs and gossamer wings.';
    detailPhrase = 'fine velvety hair texture, delicate translucent veined wings, and crisp sepia ink linework';
  } else if (group === 'insectos_aracnidos') {
    discipline = 'entomological botanical cabinet';
    taxonContext = 'garden insect / arachnid of South America';
    poseHint = altVersion
      ? evenVersion
        ? 'Detailed naturalist three-quarter study resting calmly on a slender garden leaf and stem.'
        : 'Clean dorsal-oblique naturalist study perched on a delicate botanical twig with two small leaves.'
      : 'Classic scientific naturalist study resting calmly on a single delicate green garden leaf and slender botanical stem.';
    detailPhrase = 'fine anatomical ink precision, translucent washes, and subtle natural sheen';
  } else if (group === 'fauna_vecina') {
    discipline = 'zoological naturalist field-guide';
    taxonContext = 'garden wildlife animal of South America';
    poseHint = altVersion
      ? evenVersion
        ? 'Alert three-quarter natural profile resting gently on a small mossy garden stone with two tiny fern leaves.'
        : 'Calm side-profile naturalist study nestled beside a delicate leafy garden twig.'
      : 'Calm natural side-profile study resting on a small mossy stone or delicate leafy garden twig.';
    detailPhrase = 'authentic zoological brushwork, subtle natural texture, and fine sepia ink contours';
  }

  if (params.style === 'muralismo_fauna') {
    return [
      `Masterpiece contemporary South American native wildlife muralism painting of ${params.scientificName} (${params.commonNameAr}, ${taxonContext}), inspired by Argentine botanical biodiversity murals.`,
      `Strict species-accurate anatomy, proportions, and natural color markings: ${params.identificationTraits}.`,
      poseHint,
      `Expressive fine acrylic mural brushwork with layered matte mineral pigments, lush stylized native South American leaves and wildflowers gracefully framing the subject on a warm sun-kissed lime-plaster wall (#EFE7D8), subtle warm ochre solar halo, rich emerald, teal-forest, and terracotta accents.`,
      `Bold artistic painterly planes, crisp dark-charcoal illustrative contours, luminous gallery-quality hand-painted muralism — strictly painted artwork, NO raw photograph, NO camera bokeh, NO brick grid, NO digital filter look.`,
      `Square 1:1 editorial composition with balanced breathing margins. Strictly NO text, NO typography, NO graffiti tags, NO Latin names, NO labels, NO frames, NO signatures, NO watermarks.`,
    ].join(' ');
  }

  if (params.style === 'acuarela_naturalista') {
    return [
      `Museum-grade 19th-century ${discipline} botanical watercolor plate of ${params.scientificName} (${params.commonNameAr}, ${taxonContext}), in the timeless tradition of John James Audubon and classic naturalist folios.`,
      `Strict species-accurate anatomy, proportions, and exact natural coloration: ${params.identificationTraits}.`,
      poseHint,
      `Isolated subject gracefully centered on completely clean, empty, unblemished warm ivory cold-press cotton watercolor paper (#FAF6E9) — NO scenery, NO sky, NO forest background, NO photo bokeh.`,
      `Delicate luminous translucent watercolor washes, crisp hand-drawn dark sepia dip-pen ink outlines, ${detailPhrase}, subtle organic paper grain, authentic vintage naturalist field-plate artistry.`,
      `Square 1:1 composition with generous clean ivory paper margins. Strictly NO text, NO typography, NO Latin names, NO labels, NO frames, NO signatures, NO watermarks.`,
    ].join(' ');
  }

  return [
    `Museum-grade 19th-century ${discipline} zoological study drawn in graphite pencil (2H, 2B, 4B) of ${params.scientificName} (${params.commonNameAr}, ${taxonContext}).`,
    `Strict species-accurate anatomy, silhouette, and markings rendered in tonal values: ${params.identificationTraits}.`,
    poseHint,
    `Isolated subject centered on completely clean, empty warm cream archival sketchbook paper (#F5F1E8) — NO scenery background, NO photo bokeh, NO color washes.`,
    `Strictly monochrome graphite pencil drawing with delicate fine cross-hatching, luminous soft pencil shading, sharp anatomical contour lines, authentic naturalist sketchbook illustration.`,
    `Square 1:1 composition with generous clean archival paper margins. Strictly NO text, NO typography, NO labels, NO frames, NO signatures, NO watermarks.`,
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
 * Obtiene fotos reales de referencia de iNaturalist para cualquier especie animal del bioma
 * (aves, mariposas, abejas, abejorros, insectos, arañas y fauna vecina; sin requerir API key).
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
    // taxon_id=1 abarca todo el Reino Animalia (Aves, Insecta, Lepidoptera, Arachnida, Reptilia, Amphibia, Mammalia, Mollusca)
    const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(
      cleanSci
    )}&taxon_id=1&locale=es-AR&preferred_place_id=7190&per_page=6`;

    const res = await serverFetch(searchUrl, {
      headers: { Accept: 'application/json', 'User-Agent': 'BiomaCuadernoVivo/1.0' },
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
            headers: { Accept: 'application/json', 'User-Agent': 'BiomaCuadernoVivo/1.0' },
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

    const iconicTaxonName = exact.iconic_taxon_name ? String(exact.iconic_taxon_name) : undefined;
    const sciName = String(exact.name || cleanSci);
    const commonAr = String(exact.preferred_common_name || exact.name || cleanSci);
    const dto: BirdReferenceDTO = {
      inaturalistTaxonId: taxonId,
      scientificName: sciName,
      commonNameAr: commonAr,
      iconicTaxonName,
      organismGroup: inferServerOrganismGroup({
        iconicTaxonName,
        scientificName: sciName,
        commonName: commonAr,
      }),
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
 * Busca fauna y polinizadores en vivo en iNaturalist (Reino Animalia, taxon_id=1) en español de Argentina:
 * aves, mariposas, abejas, abejorros, insectos, arañas y fauna vecina del jardín.
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
    )}&taxon_id=1&rank=species,genus&locale=es-AR&preferred_place_id=7190&per_page=10`;
    const res = await serverFetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'BiomaCuadernoVivo/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];

    const json = (await res.json()) as { results?: Array<Record<string, unknown>> };
    const mapped: BirdReferenceDTO[] = (json.results || []).map((t) => {
      const defPhoto = t.default_photo as
        | { medium_url?: string; url?: string; attribution?: string }
        | undefined;
      const base = defPhoto?.medium_url || defPhoto?.url || '';
      const iconicTaxonName = t.iconic_taxon_name ? String(t.iconic_taxon_name) : undefined;
      const sciName = String(t.name || '');
      const commonAr = String(t.preferred_common_name || t.name || '');
      return {
        inaturalistTaxonId: Number(t.id),
        scientificName: sciName,
        commonNameAr: commonAr,
        iconicTaxonName,
        organismGroup: inferServerOrganismGroup({
          iconicTaxonName,
          scientificName: sciName,
          commonName: commonAr,
        }),
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

interface ServerGardenEcology {
  seeksInGarden: string;
  preferredFlowers: string;
  preferredFruitTrees: string;
  insectsOrFoodEaten: string;
}

interface GeminiRawIdentification {
  visualObservation?: {
    dominantColors?: string;
    distinctiveAnatomy?: string;
    bodyFormAndGroup?: string;
  };
  confidenceLevel: 'alta' | 'media' | 'insuficiente';
  explanation: string;
  uncertaintyReason: string | null;
  proposedScientificName: string | null;
  candidates: Array<{
    organismGroup?: ServerOrganismGroup;
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
    gardenEcology?: ServerGardenEcology;
    identificationTraits?: string;
    typicalBehavior?: string;
    dietAndHabitat?: string;
    generalDistribution?: string;
  }>;
}

const IDENTIFICATION_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    visualObservation: {
      type: 'OBJECT',
      description: 'Descripción objetiva previa de los colores, patrón y anatomía visibles en la foto ANTES de nombrar la especie.',
      properties: {
        dominantColors: { type: 'STRING' },
        distinctiveAnatomy: { type: 'STRING' },
        bodyFormAndGroup: { type: 'STRING' },
      },
      required: ['dominantColors', 'distinctiveAnatomy', 'bodyFormAndGroup'],
    },
    confidenceLevel: {
      type: 'STRING',
      enum: ['alta', 'media', 'insuficiente'],
    },
    explanation: {
      type: 'STRING',
      description: 'Resumen claro y breve en español rioplatense (1-2 oraciones) coherente con visualObservation.',
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
          organismGroup: {
            type: 'STRING',
            enum: ['aves', 'mariposas', 'abejas_abejorros', 'insectos_aracnidos', 'fauna_vecina'],
          },
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
          ecologicalRole: { type: 'STRING' },
          coexistenceNote: { type: 'STRING' },
          gardenEcology: {
            type: 'OBJECT',
            properties: {
              seeksInGarden: { type: 'STRING' },
              preferredFlowers: { type: 'STRING' },
              preferredFruitTrees: { type: 'STRING' },
              insectsOrFoodEaten: { type: 'STRING' },
            },
            required: ['seeksInGarden', 'preferredFlowers', 'preferredFruitTrees', 'insectsOrFoodEaten'],
          },
          identificationTraits: { type: 'STRING' },
          typicalBehavior: { type: 'STRING' },
          dietAndHabitat: { type: 'STRING' },
          generalDistribution: { type: 'STRING' },
        },
        required: [
          'organismGroup',
          'commonNameAr',
          'scientificName',
          'confidenceBand',
          'reasoning',
          'keyVisibleTraits',
          'quickSummary',
          'ecologicalRole',
          'gardenEcology',
        ],
      },
    },
  },
  required: ['visualObservation', 'confidenceLevel', 'explanation', 'candidates'],
};

function extractIdentificationJson(rawText: string): GeminiRawIdentification | null {
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const tryParse = (candidate: string): GeminiRawIdentification | null => {
    try {
      const obj = JSON.parse(candidate) as Partial<GeminiRawIdentification>;
      if (obj && typeof obj === 'object' && Array.isArray(obj.candidates) && typeof obj.explanation === 'string') {
        const conf =
          obj.confidenceLevel === 'alta' ||
          obj.confidenceLevel === 'media' ||
          obj.confidenceLevel === 'insuficiente'
            ? obj.confidenceLevel
            : obj.candidates.length > 0
              ? 'media'
              : 'insuficiente';
        return {
          confidenceLevel: conf,
          explanation: obj.explanation,
          uncertaintyReason: obj.uncertaintyReason ?? null,
          proposedScientificName: obj.proposedScientificName ?? null,
          candidates: obj.candidates,
        };
      }
    } catch {
      // probar recorte de llaves
    }
    return null;
  };

  const direct = tryParse(cleaned);
  if (direct) return direct;

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return tryParse(cleaned.slice(firstBrace, lastBrace + 1));
  }
  return null;
}

const COMPACT_JSON_FORMAT_INSTRUCTIONS = `
Respondé ÚNICAMENTE con un objeto JSON válido (sin texto ni markdown alrededor) con esta estructura exacta:
{
  "visualObservation": {
    "dominantColors": "Colores exactos y patrones visibles en la fotografía",
    "distinctiveAnatomy": "Alas, colas, pico, patas, antenas o rasgos concretos visibles",
    "bodyFormAndGroup": "Forma corporal y grupo taxonómico observado"
  },
  "confidenceLevel": "alta" | "media" | "insuficiente",
  "explanation": "1-2 oraciones en español rioplatense",
  "uncertaintyReason": null | "motivo breve si es media o insuficiente",
  "proposedScientificName": "Nombre científico o null",
  "candidates": [
    {
      "organismGroup": "aves" | "mariposas" | "abejas_abejorros" | "insectos_aracnidos" | "fauna_vecina",
      "commonNameAr": "Nombre común en Argentina",
      "scientificName": "Genero especie",
      "alternativeNames": ["apodo1"],
      "family": "Familia",
      "confidenceBand": "Muy probable" | "Posible candidata" | "Baja certeza",
      "reasoning": "Razón visual concreta",
      "keyVisibleTraits": ["rasgo 1", "rasgo 2", "rasgo 3"],
      "quickSummary": "Resumen en 1 oración (<115 caracteres)",
      "sizeLabel": "Tamaño aproximado",
      "habitatTag": "Hábitat breve",
      "dietTag": "Dieta breve",
      "ecologicalRole": "Rol ecológico en el jardín",
      "coexistenceNote": "Nota serena de convivencia",
      "gardenEcology": {
        "seeksInGarden": "Qué viene a buscar al jardín",
        "preferredFlowers": "Flores y plantas que visita",
        "preferredFruitTrees": "Árboles frutales o nativos que busca",
        "insectsOrFoodEaten": "Qué insectos o alimentos concretos come"
      },
      "identificationTraits": "Rasgos clave",
      "typicalBehavior": "Comportamiento típico",
      "dietAndHabitat": "Alimentación y hábitat",
      "generalDistribution": "Distribución en Argentina"
    }
  ]
}
`.trim();

/**
 * Proveedor OpenAI-compatible de respaldo gratuito para visión multimodal
 * (Groq Llama 4 Scout, OpenRouter :free o Hugging Face Qwen2.5-VL) cuando Gemini tiene pico 503/cuota.
 */
async function identifyWithOpenAiCompatibleVision(params: {
  providerLabel: string;
  endpoint: string;
  apiKey: string;
  models: string[];
  dataUrl: string;
  userPrompt: string;
  extraHeaders?: Record<string, string>;
}): Promise<{ parsed: GeminiRawIdentification; usedModel: string; providerLabel: string } | null> {
  for (const model of params.models) {
    try {
      const res = await serverFetch(params.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.apiKey}`,
          ...(params.extraHeaders || {}),
        },
        body: JSON.stringify({
          model,
          temperature: 0.0,
          max_tokens: 2400,
          messages: [
            {
              role: 'system',
              content: `${SYSTEM_PROMPT_IDENTIFICACION_BIOMA_AR}\n\n${COMPACT_JSON_FORMAT_INSTRUCTIONS}`,
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: params.userPrompt },
                { type: 'image_url', image_url: { url: params.dataUrl } },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(22000),
      });

      if (!res.ok) continue;
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content?.trim();
      if (!content) continue;

      const parsed = extractIdentificationJson(content);
      if (parsed) {
        return {
          parsed,
          usedModel: model,
          providerLabel: params.providerLabel,
        };
      }
    } catch {
      // continuar con siguiente modelo/proveedor
    }
  }
  return null;
}

/**
 * Identifica un ser vivo real a partir de su fotografía usando Google Gemini 3.x / Gemma 4 Vision
 * (con rotación inteligente, reintentos ante 503 y respaldos gratuitos opcionales de Groq/OpenRouter/HF),
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
  const hasAnyVisionProvider = Boolean(
    env.GEMINI_API_KEY || env.GROQ_API_KEY || env.OPENROUTER_API_KEY || env.HUGGINGFACE_API_KEY
  );
  if (!hasAnyVisionProvider) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }

  const parsedImage = parseDataUrl(req.sanitizedPhotoDataUrl);
  if (!parsedImage) {
    throw new Error('INVALID_IMAGE_DATA_URL');
  }

  const locationContext = req.generalLocationHint
    ? `Lugar aproximado de observación informado por la usuaria: ${req.generalLocationHint}.`
    : 'Lugar no especificado (asumir probabilidad prioritaria de fauna urbana, de jardín y silvestre de Argentina / Cono Sur, salvo que los rasgos indiquen claramente otra región).';

  const dateContext = req.observedAtIso
    ? `Fecha de observación: ${req.observedAtIso}.`
    : '';

  const userPrompt = [
    'Identificá el ser vivo animal presente en esta fotografía real (ave, mariposa, polilla, abeja, abejorro, insecto, araña o fauna vecina del jardín).',
    locationContext,
    dateContext,
    'Devolvé únicamente el JSON respetando estrictamente el esquema solicitado.',
  ]
    .filter(Boolean)
    .join('\n');

  let parsedResult: GeminiRawIdentification | null = null;
  let usedModel = '';
  let usedProviderLabel = 'Google Gemini';
  let sawHighDemand503 = false;
  let sawQuota429 = false;
  const attemptErrors: string[] = [];

  // 1. Google Gemini 3.x / Gemma 4 (priorizando gemini-3-flash-preview + cooldown inteligente ante 503/429)
  if (env.GEMINI_API_KEY) {
    const nowMs = Date.now();
    const cachedHealthy =
      lastWorkingVisionModel && lastWorkingVisionModel.expiresAt > nowMs
        ? lastWorkingVisionModel.model
        : null;

    const configuredModel =
      env.GEMINI_VISION_MODEL && !KNOWN_RETIRED_VISION_MODELS.has(env.GEMINI_VISION_MODEL.toLowerCase())
        ? env.GEMINI_VISION_MODEL
        : null;

    const allEligibleModels = Array.from(
      new Set(
        [cachedHealthy, configuredModel, ...DEFAULT_VISION_MODELS].filter(
          (m): m is string =>
            Boolean(m) &&
            !deprecatedVisionModels.has(m!) &&
            !KNOWN_RETIRED_VISION_MODELS.has(m!.toLowerCase())
        )
      )
    );

    // Preferir modelos que no estén en enfriamiento reciente (503/429); si todos están enfriados, intentar igualmente en orden
    const freshModels = allEligibleModels.filter(
      (m) => (visionModelCooldownUntil.get(m) || 0) <= nowMs
    );
    const cooledModels = allEligibleModels.filter(
      (m) => (visionModelCooldownUntil.get(m) || 0) > nowMs
    );
    const rawModels = freshModels.length > 0 ? [...freshModels, ...cooledModels] : allEligibleModels;

    const tryGeminiModel = async (
      model: string,
      timeoutMs: number,
      externalSignal?: AbortSignal
    ): Promise<{ parsed: GeminiRawIdentification; usedModel: string; usedProviderLabel: string } | null> => {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent`;
      const isGemma = /^gemma-/i.test(model);
      const supportsThinkingLevel = /^gemini-3(\.\d+)?-flash(-preview)?$/i.test(model);

      const requestBody = isGemma
        ? {
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `${SYSTEM_PROMPT_IDENTIFICACION_BIOMA_AR}\n\n${COMPACT_JSON_FORMAT_INSTRUCTIONS}\n\n${userPrompt}`,
                  },
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
              temperature: 0.0,
              maxOutputTokens: 3072,
            },
          }
        : {
            systemInstruction: {
              parts: [{ text: SYSTEM_PROMPT_IDENTIFICACION_BIOMA_AR }],
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
              temperature: 0.0,
              responseMimeType: 'application/json',
              responseSchema: IDENTIFICATION_RESPONSE_SCHEMA,
              maxOutputTokens: 3072,
              ...(supportsThinkingLevel ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
            },
          };

      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const signal = externalSignal
        ? AbortSignal.any([timeoutSignal, externalSignal])
        : timeoutSignal;

      try {
        const response = await serverFetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': env.GEMINI_API_KEY!,
          },
          body: JSON.stringify(requestBody),
          signal,
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          if (response.status === 404) {
            deprecatedVisionModels.add(model);
          } else if (response.status === 503) {
            sawHighDemand503 = true;
            visionModelCooldownUntil.set(model, Date.now() + HIGH_DEMAND_COOLDOWN_MS);
            if (lastWorkingVisionModel?.model === model) {
              lastWorkingVisionModel = null;
            }
          } else if (response.status === 429) {
            sawQuota429 = true;
            visionModelCooldownUntil.set(model, Date.now() + QUOTA_COOLDOWN_MS);
            if (lastWorkingVisionModel?.model === model) {
              lastWorkingVisionModel = null;
            }
          }
          attemptErrors.push(`${model} (${response.status})`);
          if (response.status === 401 || response.status === 403) {
            throw new Error(`GEMINI_AUTH_ERROR: ${model} (${response.status}): ${errBody.slice(0, 180)}`);
          }
          return null;
        }

        const payload = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
        };
        const rawText = (payload.candidates?.[0]?.content?.parts || [])
          .filter((p) => !p.thought && typeof p.text === 'string')
          .map((p) => p.text || '')
          .join('')
          .trim();

        if (!rawText) {
          attemptErrors.push(`${model} (vacía)`);
          return null;
        }

        const extracted = extractIdentificationJson(rawText);
        if (extracted) {
          visionModelCooldownUntil.delete(model);
          lastWorkingVisionModel = { model, expiresAt: Date.now() + WORKING_MODEL_TTL_MS };
          return {
            parsed: extracted,
            usedModel: model,
            usedProviderLabel: isGemma ? 'Google Gemma' : 'Google Gemini',
          };
        }
        attemptErrors.push(`${model} (JSON)`);
        return null;
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('GEMINI_AUTH_ERROR')) {
          throw err;
        }
        if (externalSignal?.aborted) {
          return null;
        }
        visionModelCooldownUntil.set(model, Date.now() + HIGH_DEMAND_COOLDOWN_MS);
        attemptErrors.push(`${model} (timeout/red)`);
        return null;
      }
    };

    const raceGeminiWave = async (
      models: string[],
      timeoutMs: number
    ): Promise<{ parsed: GeminiRawIdentification; usedModel: string; usedProviderLabel: string } | null> => {
      const uniqueWave = Array.from(new Set(models)).filter(Boolean);
      if (uniqueWave.length === 0) return null;
      if (uniqueWave.length === 1) {
        return tryGeminiModel(uniqueWave[0], timeoutMs);
      }
      const controller = new AbortController();
      try {
        return await Promise.any(
          uniqueWave.map(async (model) => {
            const hit = await tryGeminiModel(model, timeoutMs, controller.signal);
            if (!hit) {
              throw new Error(`MISS:${model}`);
            }
            controller.abort();
            return hit;
          })
        );
      } catch (err) {
        if (err instanceof AggregateError) {
          const authErr = err.errors.find(
            (e) => e instanceof Error && e.message.startsWith('GEMINI_AUTH_ERROR')
          );
          if (authErr) throw authErr;
        } else if (err instanceof Error && err.message.startsWith('GEMINI_AUTH_ERROR')) {
          throw err;
        }
        return null;
      }
    };

    // Etapa 1: 1 intento rápido al modelo más preciso y saludable (gemini-3-flash-preview ~4-6s)
    if (rawModels[0]) {
      const firstHit = await tryGeminiModel(rawModels[0], 22000);
      if (firstHit) {
        parsedResult = firstHit.parsed;
        usedModel = firstHit.usedModel;
        usedProviderLabel = firstHit.usedProviderLabel;
      }
    }

    // Etapa 2: si el primero falló (503/timeout), lanzar ola paralela hedged de los 2 siguientes modelos distintos
    if (!parsedResult && rawModels.length > 1) {
      const wave2Hit = await raceGeminiWave(rawModels.slice(1, 3), 20000);
      if (wave2Hit) {
        parsedResult = wave2Hit.parsed;
        usedModel = wave2Hit.usedModel;
        usedProviderLabel = wave2Hit.usedProviderLabel;
      }
    }

    // Etapa 3: si aún no respondió, lanzar ola paralela con los siguientes modelos no probados (nunca re-martillar un 503 recién fallado)
    if (!parsedResult && rawModels.length > 3) {
      const wave3Hit = await raceGeminiWave(rawModels.slice(3, 6), 20000);
      if (wave3Hit) {
        parsedResult = wave3Hit.parsed;
        usedModel = wave3Hit.usedModel;
        usedProviderLabel = wave3Hit.usedProviderLabel;
      }
    }
  }

  // 2. Respaldo gratuito ultrarrápido (sin tarjeta): Groq Vision — Llama 4 Scout
  if (!parsedResult && env.GROQ_API_KEY) {
    const groqRes = await identifyWithOpenAiCompatibleVision({
      providerLabel: 'Groq Vision',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: env.GROQ_API_KEY,
      models: [
        'meta-llama/llama-4-scout-17b-16e-instruct',
        'meta-llama/llama-4-maverick-17b-128e-instruct',
      ],
      dataUrl: req.sanitizedPhotoDataUrl,
      userPrompt,
    });
    if (groqRes) {
      parsedResult = groqRes.parsed;
      usedModel = groqRes.usedModel;
      usedProviderLabel = groqRes.providerLabel;
    }
  }

  // 3. Respaldo gratuito (sin tarjeta): OpenRouter Vision (:free)
  if (!parsedResult && env.OPENROUTER_API_KEY) {
    const orRes = await identifyWithOpenAiCompatibleVision({
      providerLabel: 'OpenRouter Vision',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: env.OPENROUTER_API_KEY,
      models: [
        'meta-llama/llama-4-scout:free',
        'google/gemma-3-27b-it:free',
        'qwen/qwen2.5-vl-72b-instruct:free',
      ],
      dataUrl: req.sanitizedPhotoDataUrl,
      userPrompt,
      extraHeaders: {
        'HTTP-Referer': 'https://birdy-3zfr.onrender.com',
        'X-Title': 'Bioma Cuaderno Vivo',
      },
    });
    if (orRes) {
      parsedResult = orRes.parsed;
      usedModel = orRes.usedModel;
      usedProviderLabel = orRes.providerLabel;
    }
  }

  // 4. Respaldo gratuito (sin tarjeta): Hugging Face Router Vision (Qwen2.5-VL)
  if (!parsedResult && env.HUGGINGFACE_API_KEY) {
    const hfRes = await identifyWithOpenAiCompatibleVision({
      providerLabel: 'Hugging Face Vision',
      endpoint: 'https://router.huggingface.co/v1/chat/completions',
      apiKey: env.HUGGINGFACE_API_KEY,
      models: ['Qwen/Qwen2.5-VL-7B-Instruct', 'meta-llama/Llama-3.2-11B-Vision-Instruct'],
      dataUrl: req.sanitizedPhotoDataUrl,
      userPrompt,
    });
    if (hfRes) {
      parsedResult = hfRes.parsed;
      usedModel = hfRes.usedModel;
      usedProviderLabel = hfRes.providerLabel;
    }
  }

  if (!parsedResult) {
    const summary = attemptErrors.slice(0, 6).join(', ') || 'Sin respuesta válida';
    if (sawHighDemand503) {
      throw new Error(`GEMINI_HIGH_DEMAND: Pico temporal de demanda en Google (${summary})`);
    }
    if (sawQuota429) {
      throw new Error(`GEMINI_QUOTA_EXCEEDED: Límite temporal de cuota alcanzado (${summary})`);
    }
    throw new Error(`GEMINI_FAILED: ${summary}`);
  }

  // Enriquecer candidatas con fotos reales de referencia de iNaturalist en paralelo
  const rawCandidates = (parsedResult.candidates || []).slice(0, 3);
  const enrichedCandidates = await Promise.all(
    rawCandidates.map(async (cand) => {
      const ref = await fetchINaturalistPhotosForSpecies(cand.scientificName);
      const organismGroup = inferServerOrganismGroup({
        organismGroup: cand.organismGroup,
        iconicTaxonName: ref?.iconicTaxonName,
        scientificName: cand.scientificName,
        commonName: cand.commonNameAr,
        family: cand.family,
      });
      return {
        taxonId: `sp_${normalizeScientificSlug(cand.scientificName)}`,
        organismGroup,
        commonNameAr: cand.commonNameAr,
        scientificName: cand.scientificName,
        alternativeNames: cand.alternativeNames || [],
        family: cand.family || ref?.iconicTaxonName || 'Fauna',
        confidenceBand: cand.confidenceBand,
        reasoning: cand.reasoning,
        keyVisibleTraits: (cand.keyVisibleTraits || []).slice(0, 4),
        quickSummary: cand.quickSummary || cand.reasoning,
        sizeLabel: cand.sizeLabel,
        habitatTag: cand.habitatTag,
        dietTag: cand.dietTag,
        ecologicalRole: cand.ecologicalRole || '',
        coexistenceNote: cand.coexistenceNote || '',
        gardenEcology: cand.gardenEcology
          ? {
              seeksInGarden: cand.gardenEcology.seeksInGarden || '',
              preferredFlowers: cand.gardenEcology.preferredFlowers || '',
              preferredFruitTrees: cand.gardenEcology.preferredFruitTrees || '',
              insectsOrFoodEaten: cand.gardenEcology.insectsOrFoodEaten || '',
            }
          : undefined,
        identificationTraits: cand.identificationTraits || cand.quickSummary || cand.reasoning,
        typicalBehavior: cand.typicalBehavior || '',
        dietAndHabitat: cand.dietAndHabitat || '',
        generalDistribution: cand.generalDistribution || 'Fauna registrada en Argentina.',
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
    taxonomicSource: `${usedProviderLabel} (${usedModel}) + Referencias visuales iNaturalist (es_AR)`,
    aiMode: 'gemini',
    modelUsed: usedModel,
  };
}

/**
 * Genera una lámina botánica original en Acuarela Naturalista o Lápiz Grafito.
 * Prioridad de proveedores en servidor:
 * 1. Google Gemini (generación nativa de imágenes; requiere facturación habilitada en AI Studio).
 * 2. Cloudflare Workers AI — FLUX.1-schnell (capa gratuita diaria sin tarjeta, si se configuró).
 * 3. Hugging Face Inference — FLUX.1-schnell (token gratuito sin tarjeta, si se configuró).
 */
function buildStyleVariationNote(
  style: ServerIllustrationStyle,
  version: number | undefined,
  providerLabel: string
): string {
  if ((version || 1) > 1) {
    return `Versión #${version} — Obra original generada con ${providerLabel}`;
  }
  if (style === 'muralismo_fauna') {
    return 'Mural de fauna autóctona y biodiversidad sobre muro mineral cálido';
  }
  if (style === 'acuarela_naturalista') {
    return 'Lámina original en acuarela botánica sobre papel algodón';
  }
  return 'Apunte de campo original en lápiz grafito 2B/4B';
}

async function fetchSpeciesReferenceInlineImage(
  scientificName: string
): Promise<{ mimeType: string; base64Data: string } | null> {
  try {
    const ref = await fetchINaturalistPhotosForSpecies(scientificName);
    const refUrl = ref?.referencePhotos?.[0]?.thumbUrl || ref?.referencePhotos?.[0]?.url;
    if (!refUrl || !isAllowedImageProxyUrl(refUrl)) return null;
    const res = await serverFetch(refUrl, {
      headers: { 'User-Agent': 'BiomaCuadernoVivo/1.0' },
      signal: AbortSignal.timeout(5500),
    });
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!ct.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 3 * 1024 * 1024) return null;
    return { mimeType: ct, base64Data: buf.toString('base64') };
  } catch {
    return null;
  }
}

export async function generateNaturalistPlateWithGemini(
  params: {
    commonNameAr: string;
    scientificName: string;
    identificationTraits: string;
    style: ServerIllustrationStyle;
    organismGroup?: ServerOrganismGroup;
    version?: number;
  },
  env: ServerEnv = resolveServerEnv()
): Promise<{
  imageUrl: string;
  modelProvider: string;
  variationNote: string;
}> {
  const prompt = buildNaturalistIllustrationPrompt(params);
  let lastError = '';
  let sawGeminiQuotaError = false;

  // 1. Google Gemini native image generation (con referencia visual de iNaturalist para máxima fidelidad anatómica)
  //    Si Gemini devolvió 429 (Free Tier sin facturación) en los últimos 10 min y existe Cloudflare/HF/OpenAI, saltar directo
  const hasSecondaryImageProvider = Boolean(
    (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) ||
      env.HUGGINGFACE_API_KEY ||
      env.OPENAI_API_KEY
  );
  const skipGeminiDueToCooldown =
    hasSecondaryImageProvider && geminiImageQuotaCooldownUntil > Date.now();

  if (env.GEMINI_API_KEY && !skipGeminiDueToCooldown) {
    const refInline = await fetchSpeciesReferenceInlineImage(params.scientificName);
    const modelsToTry = Array.from(
      new Set([env.GEMINI_IMAGE_MODEL, ...DEFAULT_IMAGE_MODELS].filter(Boolean) as string[])
    );

    const geminiParts: Array<Record<string, unknown>> = refInline
      ? [
          {
            text: `${prompt} Use the attached reference photo strictly as an anatomical and color-marking guide for ${params.scientificName} (${params.commonNameAr}); completely re-illustrate the subject from scratch in the requested hand-painted artistic medium on the clean artistic background, NEVER keeping any photo background or camera look.`,
          },
          {
            inlineData: {
              mimeType: refInline.mimeType,
              data: refInline.base64Data,
            },
          },
        ]
      : [{ text: prompt }];

    for (const model of modelsToTry) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent`;

      try {
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
                parts: geminiParts,
              },
            ],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
            },
          }),
          signal: AbortSignal.timeout(45000),
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          if (response.status === 429) {
            sawGeminiQuotaError = true;
            geminiImageQuotaCooldownUntil = Date.now() + QUOTA_COOLDOWN_MS;
          }
          lastError = `${model} (${response.status}): ${errBody.slice(0, 220)}`;
          if (response.status === 429 && hasSecondaryImageProvider) {
            // Saltar directo a Cloudflare Workers AI / Hugging Face / OpenAI sin perder segundos en más 429 de Gemini Free Tier
            break;
          }
          if ([400, 404, 429, 503].includes(response.status)) {
            continue;
          }
          break;
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
            geminiImageQuotaCooldownUntil = 0;
            const mime =
              ('mimeType' in inline && inline.mimeType) ||
              ('mime_type' in inline && inline.mime_type) ||
              'image/png';
            return {
              imageUrl: `data:${mime};base64,${inline.data}`,
              modelProvider: `Google Gemini (${model})`,
              variationNote: buildStyleVariationNote(params.style, params.version, 'Gemini'),
            };
          }
        }
        lastError = `${model}: no devolvió imagen en la respuesta`;
      } catch (err) {
        lastError = `${model}: ${err instanceof Error ? err.message : 'error de red'}`;
      }
    }
  }

  // 2. Cloudflare Workers AI — FLUX.1-schnell (capa gratuita diaria 10.000 neuronas/día, sin marca de agua)
  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) {
    const cfModels = Array.from(
      new Set(
        [
          env.CLOUDFLARE_IMAGE_MODEL,
          '@cf/black-forest-labs/flux-1-schnell',
          '@cf/leonardo/lucid-origin',
        ].filter(Boolean) as string[]
      )
    );

    for (const cfModel of cfModels) {
      try {
        const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
          env.CLOUDFLARE_ACCOUNT_ID
        )}/ai/run/${cfModel}`;
        const cfBody = cfModel.includes('flux-1-schnell')
          ? { prompt, steps: 8 }
          : { prompt, width: 1024, height: 1024 };

        const cfRes = await serverFetch(cfUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(cfBody),
          signal: AbortSignal.timeout(45000),
        });
        if (cfRes.ok) {
          const ct = cfRes.headers.get('content-type') || '';
          if (ct.startsWith('image/')) {
            const buf = Buffer.from(await cfRes.arrayBuffer());
            return {
              imageUrl: `data:${ct.split(';')[0]};base64,${buf.toString('base64')}`,
              modelProvider: `Cloudflare Workers AI (${cfModel.split('/').pop()})`,
              variationNote: buildStyleVariationNote(params.style, params.version, 'IA'),
            };
          }
          const cfJson = (await cfRes.json()) as { result?: { image?: string } };
          if (cfJson.result?.image) {
            return {
              imageUrl: `data:image/jpeg;base64,${cfJson.result.image}`,
              modelProvider: `Cloudflare Workers AI (${cfModel.split('/').pop()})`,
              variationNote: buildStyleVariationNote(params.style, params.version, 'IA'),
            };
          }
        } else {
          lastError = `Cloudflare AI ${cfModel} (${cfRes.status}): ${(await cfRes.text().catch(() => '')).slice(0, 180)}`;
        }
      } catch (err) {
        lastError = `Cloudflare AI ${cfModel}: ${err instanceof Error ? err.message : 'error'}`;
      }
    }
  }

  // 3. Hugging Face Inference Router (FLUX.1-schnell 1024×1024, sin marca de agua)
  if (env.HUGGINGFACE_API_KEY) {
    const hfModel = env.HUGGINGFACE_IMAGE_MODEL || 'black-forest-labs/FLUX.1-schnell';
    try {
      const hfRes = await serverFetch(
        `https://router.huggingface.co/hf-inference/models/${hfModel}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.HUGGINGFACE_API_KEY}`,
            'Content-Type': 'application/json',
            Accept: 'image/jpeg',
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              width: 1024,
              height: 1024,
              num_inference_steps: 4,
            },
          }),
          signal: AbortSignal.timeout(45000),
        }
      );
      if (hfRes.ok) {
        const ct = hfRes.headers.get('content-type') || 'image/jpeg';
        if (ct.startsWith('image/')) {
          const buf = Buffer.from(await hfRes.arrayBuffer());
          return {
            imageUrl: `data:${ct.split(';')[0]};base64,${buf.toString('base64')}`,
            modelProvider: `Hugging Face (${hfModel.split('/').pop()})`,
            variationNote: buildStyleVariationNote(params.style, params.version, 'IA'),
          };
        }
      } else {
        lastError = `Hugging Face (${hfRes.status}): ${(await hfRes.text().catch(() => '')).slice(0, 180)}`;
      }
    } catch (err) {
      lastError = `Hugging Face: ${err instanceof Error ? err.message : 'error'}`;
    }
  }

  // 4. OpenAI Images API (gpt-image-1, opcional si se configuró OPENAI_API_KEY)
  if (env.OPENAI_API_KEY) {
    try {
      const oaRes = await serverFetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-image-1',
          prompt,
          size: '1024x1024',
          quality: 'medium',
          output_format: 'jpeg',
        }),
        signal: AbortSignal.timeout(55000),
      });
      if (oaRes.ok) {
        const oaJson = (await oaRes.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
        const b64 = oaJson.data?.[0]?.b64_json;
        if (b64) {
          return {
            imageUrl: `data:image/jpeg;base64,${b64}`,
            modelProvider: 'OpenAI (gpt-image-1)',
            variationNote: buildStyleVariationNote(params.style, params.version, 'OpenAI'),
          };
        }
      } else {
        lastError = `OpenAI Images (${oaRes.status}): ${(await oaRes.text().catch(() => '')).slice(0, 180)}`;
      }
    } catch (err) {
      lastError = `OpenAI Images: ${err instanceof Error ? err.message : 'error'}`;
    }
  }

  if (sawGeminiQuotaError) {
    throw new Error(`GEMINI_IMAGE_QUOTA_EXCEEDED: ${lastError}`);
  }
  if (!env.GEMINI_API_KEY && !hasSecondaryImageProvider) {
    throw new Error('GEMINI_API_KEY_MISSING');
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
