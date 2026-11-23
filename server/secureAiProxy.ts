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
  HUGGINGFACE_API_KEY?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  EBIRD_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  ALLOWED_EMAILS?: string;
  AUTH_SESSION_SECRET?: string;
  REQUIRE_GOOGLE_AUTH?: string;
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

const DEFAULT_VISION_MODELS = ['gemini-2.5-flash', 'gemini-3-flash-preview', 'gemini-2.0-flash'];
const DEFAULT_IMAGE_MODELS = [
  'gemini-3.1-flash-lite-image',
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
    HUGGINGFACE_API_KEY:
      (
        process.env.HUGGINGFACE_API_KEY ||
        fileVars.HUGGINGFACE_API_KEY ||
        process.env.HF_TOKEN ||
        fileVars.HF_TOKEN ||
        ''
      ).trim() || undefined,
    CLOUDFLARE_ACCOUNT_ID:
      (process.env.CLOUDFLARE_ACCOUNT_ID || fileVars.CLOUDFLARE_ACCOUNT_ID || '').trim() ||
      undefined,
    CLOUDFLARE_API_TOKEN:
      (process.env.CLOUDFLARE_API_TOKEN || fileVars.CLOUDFLARE_API_TOKEN || '').trim() ||
      undefined,
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
  };
}

export const SYSTEM_PROMPT_IDENTIFICACION_BIOMA_AR = `
Sos un biólogo naturalista de campo experto en la biodiversidad urbana, de jardín y silvestre de la República Argentina y Sudamérica, asistiendo a una observadora en «Bioma», su cuaderno vivo de jardín y naturaleza.

GRUPOS QUE IDENTIFICÁS (clasificá cada candidata en exactamente uno de estos valores en "organismGroup"):
- "aves": pájaros y aves de jardín, parque, costa o campo (hornero, chingolo, ratona, zorzal, picaflor, benteveo, etc.).
- "mariposas": mariposas diurnas, polillas, polillas colibrí y orugas (monarca, espejitos, limoncito, bandera argentina, dama pintada, etc.).
- "abejas_abejorros": abejas melíferas, abejas nativas sin aguijón (yateí), abejas solitarias/metálicas y abejorros/mangangás (Xylocopa, Bombus, Apis, Megachile, Augochlora, etc.).
- "insectos_aracnidos": otros insectos, arañas y pequeños artrópodos que conviven en el jardín (vaquitas de San Antonio, mamboretá/mantis, libélulas/alguaciles, escarabajos/toritos, chicharras, hormigas, avispas, grillos, arañas tejedoras o saltarinas, bichos bolita, etc.).
- "fauna_vecina": animales vecinos que nos visitan o viven inadvertidos en el jardín (lagartijas, lagartos overos, gekos/salamanquesas, sapos, ranas, comadrejas, cuises, murciélagos, caracoles, babosas, tortugas, etc.).

REGLAS CRÍTICAS DE PRECISIÓN NATURALISTA:
1. Observá cuidadosamente CADA rasgo anatómico real presente en la fotografía:
   - En aves: postura, forma exacta del pico, patrón de alas/cola, ceja/collar.
   - En mariposas: color, venación, manchas u ocelos en cara dorsal/ventral, forma de alas y antenas.
   - En abejas/abejorros e insectos: vellosidad, bandas de color, forma del abdomen, alas, antenas, patas (ej. diferenciá claramente una abeja/abejorro de una avispa o de una mosca sírfida imitadora!).
   - En arañas y fauna vecina: forma del cuerpo, ojos, patrones dorsales, piel/escamas/caparazón.
2. NUNCA adivines ni devuelvas una especie genérica por defecto.
3. Calibrá la incertidumbre con honestidad:
   - "alta": el ejemplar se distingue nítidamente y sus rasgos diagnósticos permiten identificar la especie (o género si la especie exacta requiere lupa/microscopio, aclarando esto en el razonamiento). Incluí 1 o 2 especies visualmente cercanas de Argentina como alternativas de comparación cuando ayude a verificar.
   - "media": la foto está lejana, a contraluz, parcial o existen 2–3 especies muy parecidas. Explicá concretamente qué rasgo cuesta ver en "uncertaintyReason" y ofrecé 2 o 3 candidatas reales ordenadas por probabilidad.
   - "insuficiente": no se distingue ningún animal, insecto, mariposa ni ave en la fotografía, o está demasiado borrosa/oculta para identificarla con responsabilidad. Devolvé proposedScientificName = null y explicá el motivo.
4. Usá SIEMPRE nombres comunes en español de Argentina (rioplatense: ej. "Mangangá negro", "Mariposa espejitos", "Vaquita de San Antonio", "Mamboretá", "Ratona común", "Geko casero", "Comadreja overa") y nombres científicos oficiales (iNaturalist / Clements). En alternativeNames incluí apodos locales frecuentes.
5. Completá SIEMPRE el valor ecológico y de convivencia para el jardín en tono cercano, sereno y educativo:
   - ecologicalRole: 1 frase muy corta (ej. "Polinizador nativo clave de flores del jardín", "Controladora natural de pulgones", "Cazador nocturno de mosquitos").
   - coexistenceNote: 1 oración clara sobre convivencia en casa/jardín (si es totalmente inofensiva/beneficiosa, o con calma y sin alarmismo si puede picar/morder si se la molesta o requiere distancia respetuosa).
6. Redactá todos los textos de ficha de forma BREVE y cómoda para celular:
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
    /\b(mariposas?|polillas?|orugas?|esfinges?|lepidoptera|nymphalidae|pieridae|papilionidae|hesperiidae|lycaenidae|sphingidae|saturniidae|danaus|agraulis|morpho|vanessa|junonia|eurema|ascia|aellopos|heliconius|papilio|phoebis|pieris|colias|dryas)\b/.test(
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
      `Contemporary South American native wildlife and biodiversity muralism painting of ${params.scientificName} (${params.commonNameAr}, ${taxonContext}).`,
      `Strict anatomical and color accuracy: ${params.identificationTraits}.`,
      poseHint,
      `Expressive large-scale acrylic and fine mural brushwork painted on a subtly textured warm mineral lime-plaster wall (#EFE7D8), framed with stylized native South American botanical foliage, warm sunlit ochre solar halo, deep teal-forest shadows, terracotta and emerald natural pigments.`,
      `Bold graphic painterly planes, crisp expressive dark-charcoal contours, luminous gallery-quality Argentine nature muralism aesthetic — NO raw photograph, NO camera bokeh, NO brick grid.`,
      `Square 1:1 composition with balanced margins. Strictly NO text, NO typography, NO graffiti tags, NO Latin names, NO labels, NO frames, NO signatures, NO watermarks.`,
    ].join(' ');
  }

  if (params.style === 'acuarela_naturalista') {
    return [
      `Classic 19th-century ${discipline} watercolor illustration of ${params.scientificName} (${params.commonNameAr}, ${taxonContext}).`,
      `Strict anatomical and color accuracy: ${params.identificationTraits}.`,
      poseHint,
      `Isolated subject centered on a completely clean, empty, uncluttered warm ivory cotton watercolor paper background (#FAF6E9) — NO scenery, NO sky, NO forest background, NO photo bokeh.`,
      `Fine hand-drawn dark sepia botanical ink outlines with delicate translucent watercolor washes, ${detailPhrase}, authentic vintage naturalist sketchbook plate.`,
      `Square 1:1 composition with generous clean cream paper margins. Strictly NO text, NO typography, NO Latin names, NO labels, NO frames, NO signatures, NO watermarks.`,
    ].join(' ');
  }

  return [
    `Classic 19th-century ${discipline} field-sketch illustration in graphite pencil (2B/4B) of ${params.scientificName} (${params.commonNameAr}, ${taxonContext}).`,
    `Strict anatomical accuracy: ${params.identificationTraits}.`,
    poseHint,
    `Isolated subject centered on a completely clean, empty warm cream archival sketchbook paper background (#F5F1E8) — NO scenery background, NO photo bokeh.`,
    `Monochrome fine graphite pencil linework, delicate cross-hatching, realistic tonal shading.`,
    `Square 1:1 composition with generous clean paper margins. Strictly NO text, NO typography, NO labels, NO frames, NO signatures, NO watermarks.`,
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

interface GeminiRawIdentification {
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
    taxonomicSource: `Google Gemini (${usedModel}) + Referencias visuales iNaturalist (es_AR)`,
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

  // 1. Google Gemini native image generation
  if (env.GEMINI_API_KEY) {
    const modelsToTry = Array.from(
      new Set([env.GEMINI_IMAGE_MODEL, ...DEFAULT_IMAGE_MODELS].filter(Boolean) as string[])
    );

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
                parts: [{ text: prompt }],
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
          }
          lastError = `${model} (${response.status}): ${errBody.slice(0, 220)}`;
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

  // 2. Respaldo gratuito sin marca de agua: Cloudflare Workers AI (FLUX.1-schnell)
  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) {
    try {
      const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
        env.CLOUDFLARE_ACCOUNT_ID
      )}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
      const cfRes = await serverFetch(cfUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, steps: 6 }),
        signal: AbortSignal.timeout(35000),
      });
      if (cfRes.ok) {
        const cfJson = (await cfRes.json()) as { result?: { image?: string } };
        if (cfJson.result?.image) {
          return {
            imageUrl: `data:image/jpeg;base64,${cfJson.result.image}`,
            modelProvider: 'Cloudflare Workers AI (FLUX.1-schnell)',
            variationNote: buildStyleVariationNote(params.style, params.version, 'IA'),
          };
        }
      } else {
        lastError = `Cloudflare AI (${cfRes.status}): ${(await cfRes.text().catch(() => '')).slice(0, 180)}`;
      }
    } catch (err) {
      lastError = `Cloudflare AI: ${err instanceof Error ? err.message : 'error'}`;
    }
  }

  // 3. Respaldo gratuito sin tarjeta ni marca de agua: Hugging Face Inference (FLUX.1-schnell)
  if (env.HUGGINGFACE_API_KEY) {
    try {
      const hfRes = await serverFetch(
        'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
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
              width: 768,
              height: 768,
              num_inference_steps: 4,
            },
          }),
          signal: AbortSignal.timeout(40000),
        }
      );
      if (hfRes.ok) {
        const ct = hfRes.headers.get('content-type') || 'image/jpeg';
        if (ct.startsWith('image/')) {
          const buf = Buffer.from(await hfRes.arrayBuffer());
          return {
            imageUrl: `data:${ct};base64,${buf.toString('base64')}`,
            modelProvider: 'Hugging Face (FLUX.1-schnell)',
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

  if (sawGeminiQuotaError) {
    throw new Error(`GEMINI_IMAGE_QUOTA_EXCEEDED: ${lastError}`);
  }
  if (!env.GEMINI_API_KEY && !env.HUGGINGFACE_API_KEY && !env.CLOUDFLARE_API_TOKEN) {
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
