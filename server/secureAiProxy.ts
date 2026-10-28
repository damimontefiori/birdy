/**
 * Backend ligero de referencia (Cloud Functions / Cloud Run / Node.js) — §7.1, §7.2, §7.3 y §9 (CA16)
 *
 * IMPORTANTE: Las claves GEMINI_API_KEY y EBIRD_API_KEY viven exclusivamente en las variables de entorno
 * del servidor (Secret Manager), jamás en el cliente Android/PWA.
 */

export interface ServerEnv {
  GEMINI_API_KEY?: string;
  EBIRD_API_KEY?: string;
}

export const SYSTEM_PROMPT_IDENTIFICACION_AVES_AR = `
Sos un ornitólogo especialista en avifauna de la República Argentina asistiendo a Valeria en su Cuaderno de Aves personal.
Analizá la fotografía proporcionada y respondé estrictamente en JSON con el siguiente criterio:
1. Priorizá veracidad y concisión; nunca inventes datos ni adjudiques una especie al azar si la evidencia visual no alcanza.
2. Si el ave se distingue con nitidez (pico, patrón cefálico, plumaje diagnóstico), indicá confidenceLevel = "alta".
3. Si hay dos o más especies nativas semejantes o la foto está a contraluz/parcialmente oculta, indicá confidenceLevel = "media", explicá la duda en uncertaintyReason y listá entre 2 y 3 especies candidatas.
4. Si la imagen está muy borrosa, muy lejana o no contiene ningún ave, indicá confidenceLevel = "insuficiente" y proposedTaxonId = null para que se guarde como «Pendiente de identificar».
5. Utilizá nombres comunes apropiados para Argentina (español rioplatense) y el nombre científico oficial según la taxonomía de eBird (Clements Checklist).
`.trim();

export function buildNaturalistIllustrationPrompt(params: {
  commonNameAr: string;
  scientificName: string;
  identificationTraits: string;
  style: 'acuarela_naturalista' | 'lapiz_grafito';
}): string {
  if (params.style === 'acuarela_naturalista') {
    return [
      `Traditional naturalist botanical and ornithological watercolor illustration of ${params.scientificName} (${params.commonNameAr} from Argentina).`,
      `Morphological traits that must be respected with scientific accuracy: ${params.identificationTraits}.`,
      `Natural free pose perched on a delicate native Argentine branch with subtle botanical leaves.`,
      `Painted on warm cream cotton watercolor paper (#F7F3E8), translucent watercolor washes, fine brush feather detail.`,
      `Strictly NO text, NO labels, NO signatures, NO watermarks embedded inside the image.`,
    ].join(' ');
  }

  return [
    `Traditional naturalist field-sketch illustration in graphite pencil (2B/4B) of ${params.scientificName} (${params.commonNameAr} from Argentina).`,
    `Morphological traits that must be respected with scientific accuracy: ${params.identificationTraits}.`,
    `Natural free pose perched on a slender native twig with subtle leaves, drawn on warm cream sketchbook paper.`,
    `Delicate graphite shading, cross-hatching, and fine botanical pencil linework.`,
    `Strictly NO text, NO labels, NO signatures, NO watermarks embedded inside the image.`,
  ].join(' ');
}
