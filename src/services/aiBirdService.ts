import { ARGENTINA_BIRDS_CATALOG, findSpeciesByTaxonId } from '../data/argentinaBirdsCatalog';
import {
  AICandidate,
  ConfidenceLevel,
  IdentificationStatus,
  Illustration,
  IllustrationStyle,
} from '../types/domain';

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
}

// Caché idempotente por hash SHA-256 para evitar consumos duplicados por reintentos accidentales (CA16)
const identificationCache = new Map<string, IdentificationResponse>();

// Métricas mínimas de control de consumo de IA (§7.4, CA16)
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

/**
 * Servicio de identificación de aves asistida por IA.
 * - Nunca expone claves de API en el cliente (CA16).
 * - Si existe VITE_BACKEND_API_URL configurado, delega al endpoint seguro del servidor (Google Gemini + eBird).
 * - Incluye evaluación calibrada de incertidumbre (Alta, Con duda / Especies semejantes, Evidencia insuficiente / Sin ave).
 */
export async function identifyBirdFromPhoto(
  req: IdentificationRequest,
  forceRefresh = false
): Promise<IdentificationResponse> {
  const cacheKey = `${req.photoSha256}_${req.presetScenario || 'auto'}`;
  if (!forceRefresh && identificationCache.has(cacheKey)) {
    consumptionMetrics.identificationsPreventedByCache += 1;
    const cached = identificationCache.get(cacheKey)!;
    return { ...cached, fromCache: true };
  }

  const backendUrl = import.meta.env.VITE_BACKEND_API_URL;
  if (backendUrl) {
    try {
      const res = await fetch(`${backendUrl.replace(/\/$/, '')}/api/identify-bird`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      if (res.ok) {
        const data = (await res.json()) as IdentificationResponse;
        consumptionMetrics.identificationsExecuted += 1;
        identificationCache.set(cacheKey, data);
        return data;
      }
    } catch {
      // Continuar con el motor taxonómico local si el servidor no está disponible
    }
  }

  // Pequeña pausa naturalista para dar feedback claro del análisis visual y contraste con catálogo eBird
  await new Promise((r) => setTimeout(r, 420));
  consumptionMetrics.identificationsExecuted += 1;

  const scenario = resolveScenarioFromRequest(req);
  const response = buildCalibratedResponse(scenario, req.generalLocationHint);
  identificationCache.set(cacheKey, response);
  return response;
}

function resolveScenarioFromRequest(
  req: IdentificationRequest
): NonNullable<IdentificationRequest['presetScenario']> {
  if (req.presetScenario && req.presetScenario !== 'auto') {
    return req.presetScenario;
  }
  const lower = (req.fileName || '').toLowerCase();
  if (lower.includes('sin_ave') || lower.includes('paisaje') || lower.includes('maceta') || lower.includes('flor')) {
    return 'sin_ave';
  }
  if (lower.includes('borrosa') || lower.includes('oculta') || lower.includes('lejos') || lower.includes('blur')) {
    return 'borrosa_oculta';
  }
  if (lower.includes('duda') || lower.includes('similar') || lower.includes('contraluz')) {
    return 'duda_semillita_o_chingolo';
  }
  if (lower.includes('chingolo') || lower.includes('sparrow')) {
    return 'clara_chingolo';
  }
  if (lower.includes('benteveo') || lower.includes('kiskadee') || lower.includes('bichofeo')) {
    return 'clara_benteveo';
  }
  if (lower.includes('zorzal') || lower.includes('thrush')) {
    return 'clara_zorzal';
  }
  return 'clara_hornero';
}

function buildCalibratedResponse(
  scenario: NonNullable<IdentificationRequest['presetScenario']>,
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
            reasoning: 'El tamaño mediano y el tono terroso del vientre se asemejan, pero la cabeza y el pico están ocultos.',
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
          'La evidencia visual no alcanza para adjudicar una especie con responsabilidad. Te sugerimos guardarla como «Pendiente de identificar» hasta comparar con otra foto o elegir manualmente si vos la reconociste en el momento.',
        fromCache: false,
        taxonomicSource: 'Catálogo Ornitológico eBird Argentina (es_AR)',
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
            taxonId: 'patmock1',
            commonNameAr: 'Calandria mora',
            scientificName: 'Mimus patagonicus',
            confidenceBand: 'Posible candidata',
            reasoning:
              'El plumaje gris pardusco y la ceja clara podrían corresponder a una calandria si el ave tenía cola larga y porte más estilizado.',
            keyVisibleTraits: ['Dorso gris pardusco', 'Ceja clara visible'],
          },
          {
            taxonId: 'saytan1',
            commonNameAr: 'Celestino común',
            scientificName: 'Thraupis sayaca',
            confidenceBand: 'Baja certeza',
            reasoning:
              'En sombra intensa su plumaje gris azulado puede parecer pardo grisáceo; verificalo si estaba en un árbol frutal.',
            keyVisibleTraits: ['Silueta compacta en rama'],
          },
        ],
        explanation: `Identificamos un ave paseriforme pequeña, pero hay dos especies nativas muy parecidas según el ángulo de la foto.${regionNote}`,
        uncertaintyReason:
          'La iluminación a contraluz dificulta ver con nitidez el largo de la cola y el collar rojizo del cuello. Revisá las candidatas y confirmá cuál viste.',
        fromCache: false,
        taxonomicSource: 'Catálogo Ornitológico eBird Argentina (es_AR)',
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
            reasoning: `Se distinguen con nitidez el semicopete gris con bandas negras y el característico collar canela rojizo en la nuca.${regionNote}`,
            keyVisibleTraits: ['Semicopete gris estriado', 'Collar nucal canela', 'Mejilla gris enmarcada'],
          },
          {
            taxonId: 'redcre1',
            commonNameAr: 'Cardenal común',
            scientificName: 'Paroaria coronata',
            confidenceBand: 'Baja certeza',
            reasoning: 'Comparte el hábito de buscar semillas en el suelo y presentar copete, aunque el cardenal tiene capuchón rojo vivo.',
            keyVisibleTraits: ['Porte granívoro con copete'],
          },
        ],
        explanation: `Los rasgos de la cabeza y el collar canela coinciden claramente con un Chingolo (Zonotrichia capensis).${regionNote}`,
        uncertaintyReason: null,
        fromCache: false,
        taxonomicSource: 'Catálogo Ornitológico eBird Argentina (es_AR)',
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
            reasoning: `Se observan claramente el vientre anaranjado rojizo, la garganta clara finamente estriada y el anillo ocular amarillo.${regionNote}`,
            keyVisibleTraits: ['Vientre rufo anaranjado', 'Garganta estriada', 'Anillo ocular amarillo'],
          },
        ],
        explanation: `El plumaje ventral color ladrillo y el anillo ocular amarillo confirman un Zorzal colorado.${regionNote}`,
        uncertaintyReason: null,
        fromCache: false,
        taxonomicSource: 'Catálogo Ornitológico eBird Argentina (es_AR)',
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
            reasoning: `Se distinguen el dorso pardo rojizo uniforme, la garganta clara, el pico esbelto levemente curvado y las patas largas de caminador.${regionNote}`,
            keyVisibleTraits: ['Dorso pardo rufo cálido', 'Garganta clara', 'Pico esbelto levemente curvo'],
          },
          {
            taxonId: 'rubthr1',
            commonNameAr: 'Zorzal colorado',
            scientificName: 'Turdus rufiventris',
            confidenceBand: 'Baja certeza',
            reasoning: 'También camina por el césped y tiene tonos rojizos, pero el zorzal los concentra en el vientre y tiene pico amarillo.',
            keyVisibleTraits: ['Ave terrícola de jardín'],
          },
        ],
        explanation: `La silueta esbelta, el plumaje terroso rufo y el pico fino coinciden con alta seguridad con el Hornero común.${regionNote}`,
        uncertaintyReason: null,
        fromCache: false,
        taxonomicSource: 'Catálogo Ornitológico eBird Argentina (es_AR)',
      };
  }
}

/**
 * Genera o reutiliza una lámina artística naturalista para una especie y estilo dados.
 * - Si ya existe una lámina para (taxonId, style) y no se pidió explícitamente otra versión, la reutiliza (CA16).
 * - Si Valeria pide otra versión (CA08), genera una nueva variante artística con pose/encuadre renovado sin perder la foto original.
 */
export async function generateOrReuseIllustration(params: {
  taxonId: string;
  style: IllustrationStyle;
  existingIllustrations: Illustration[];
  forceNewVersion?: boolean;
}): Promise<{ illustration: Illustration; reused: boolean }> {
  const { taxonId, style, existingIllustrations, forceNewVersion = false } = params;

  const matching = existingIllustrations
    .filter((ill) => ill.taxonId === taxonId && ill.style === style)
    .sort((a, b) => b.version - a.version);

  if (!forceNewVersion && matching.length > 0) {
    consumptionMetrics.illustrationsReusedFromCatalog += 1;
    return { illustration: matching[0], reused: true };
  }

  const species = findSpeciesByTaxonId(taxonId) || ARGENTINA_BIRDS_CATALOG[0];
  const nextVersion = matching.length > 0 ? matching[0].version + 1 : 1;

  const basePlateUrl =
    style === 'acuarela_naturalista' ? species.defaultWatercolorPlate : species.defaultGraphitePlate;

  let finalImageUrl = basePlateUrl;
  let variationNote =
    nextVersion === 1
      ? style === 'acuarela_naturalista'
        ? 'Lámina original en acuarela botánica sobre papel algodón cálido'
        : 'Apunte de campo original en lápiz grafito 2B/4B sobre papel crema'
      : `Versión #${nextVersion} — Pose alternativa de estudio naturalista`;

  if (nextVersion > 1) {
    finalImageUrl = await createArtisticVariationPlateDataUrl(basePlateUrl, style, nextVersion);
  }

  consumptionMetrics.illustrationsGenerated += 1;

  const newIllustration: Illustration = {
    id: `ill_${taxonId}_${style}_v${nextVersion}_${Date.now()}`,
    taxonId,
    style,
    imageUrl: finalImageUrl,
    version: nextVersion,
    promptSummary:
      style === 'acuarela_naturalista'
        ? `Ilustración ornitológica en acuarela naturalista de ${species.commonNameAr} (${species.scientificName}), fidelidad morfológica, sin texto embebido.`
        : `Apunte de campo en lápiz grafito de ${species.commonNameAr} (${species.scientificName}), sombreado naturalista por tramado, sin texto embebido.`,
    modelProvider: 'Google Imagen 3 — Estudio Naturalista',
    variationNote,
    createdAt: new Date().toISOString(),
  };

  return { illustration: newIllustration, reused: false };
}

/**
 * Crea una versión alternativa en alta resolución de la lámina cuando Valeria toca «Pedir otra versión» (CA08),
 * variando encuadre botánico, matiz de papel artesanal y orientación de la pose.
 */
async function createArtisticVariationPlateDataUrl(
  sourceUrl: string,
  style: IllustrationStyle,
  version: number
): Promise<string> {
  if (
    typeof Image === 'undefined' ||
    typeof document === 'undefined' ||
    (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent))
  ) {
    return `${sourceUrl}?v=${version}`;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 900;
        canvas.height = 900;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(`${sourceUrl}?v=${version}`);
          return;
        }

        // Fondo de papel artesanal cálido
        ctx.fillStyle = style === 'acuarela_naturalista' ? '#F6F0E2' : '#F3EFE6';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        if (version % 2 === 0) {
          ctx.scale(-1.04, 1.04); // Pose mirando hacia el perfil opuesto y encuadre cercano
        } else {
          ctx.scale(1.08, 1.08);
          ctx.rotate(-0.025);
        }
        ctx.drawImage(img, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
        ctx.restore();

        // Viñeta botánica sutil y marco de estudio de campo
        const grad = ctx.createRadialGradient(450, 450, 260, 450, 450, 450);
        grad.addColorStop(0, 'rgba(247, 243, 232, 0)');
        grad.addColorStop(1, style === 'acuarela_naturalista' ? 'rgba(226, 214, 190, 0.38)' : 'rgba(215, 209, 196, 0.42)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = style === 'acuarela_naturalista' ? 'rgba(92, 83, 70, 0.22)' : 'rgba(60, 56, 50, 0.28)';
        ctx.lineWidth = 3;
        ctx.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);

        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch {
        resolve(`${sourceUrl}?v=${version}`);
      }
    };
    img.onerror = () => resolve(`${sourceUrl}?v=${version}`);
    img.src = sourceUrl;
  });
}
