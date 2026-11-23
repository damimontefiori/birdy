import { IllustrationStyle } from '../types/domain';

/**
 * Motor algorítmico local de ilustración naturalista sobre HTML5 Canvas para los 3 estilos de Bioma:
 * 1) `muralismo_fauna`: Muralismo de fauna autóctona y biodiversidad (pincelada acrílica audaz Kuwahara,
 *    paleta vibrante sudamericana, siluetas botánicas nativas pintadas en el fondo y textura de revoque cálido).
 * 2) `acuarela_naturalista`: Acuarela botánica translúcida + pluma en tinta sepia sobre papel algodón (#FAF5E8).
 * 3) `lapiz_grafito`: Apunte de campo en lápiz grafito 2B/4B (Color-Dodge + tramado diagonal).
 */
export function renderBotanicalPlateFromImage(
  img: HTMLImageElement,
  style: IllustrationStyle,
  version: number
): string | null {
  if (typeof document === 'undefined') return null;

  const workSize = 480;
  const outSize = 900;

  const workCanvas = document.createElement('canvas');
  workCanvas.width = workSize;
  workCanvas.height = workSize;
  const wctx = workCanvas.getContext('2d', { willReadFrequently: true });
  if (!wctx) return null;

  // Recorte cuadrado centrado (cover) con leve encuadre sobre el ejemplar
  const imgW = img.naturalWidth || img.width || workSize;
  const imgH = img.naturalHeight || img.height || workSize;
  const imgRatio = imgW / imgH;
  let sx = 0;
  let sy = 0;
  let sw = imgW;
  let sh = imgH;
  if (imgRatio > 1) {
    sw = imgH;
    sx = (imgW - sw) / 2;
  } else {
    sh = imgW;
    sy = (imgH - sh) / 2;
  }

  wctx.save();
  wctx.translate(workSize / 2, workSize / 2);
  if (version > 1 && version % 2 === 0) {
    wctx.scale(-1.08, 1.08);
  } else if (version > 1) {
    wctx.scale(1.12, 1.12);
    wctx.rotate(-0.025);
  } else {
    wctx.scale(1.06, 1.06);
  }
  wctx.drawImage(img, sx, sy, sw, sh, -workSize / 2, -workSize / 2, workSize, workSize);
  wctx.restore();

  const srcImageData = wctx.getImageData(0, 0, workSize, workSize);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outSize;
  outCanvas.height = outSize;
  const ctx = outCanvas.getContext('2d');
  if (!ctx) return null;

  if (style === 'muralismo_fauna') {
    const processed = applyMuralismFaunaTransform(srcImageData, workSize);
    wctx.putImageData(processed, 0, 0);

    // 1. Muro de revoque cálido + halos cromáticos muralistas + flora nativa pintada al fondo
    drawMuralWallBackdrop(ctx, outSize, version);

    // 2. Componer al ejemplar pintado con acrílico mural directamente sobre el muro (usando alfa orgánico)
    const margin = 30;
    const drawW = outSize - margin * 2;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(workCanvas, margin, margin, drawW, drawW);

    // 3. Textura mineral de revoque / muro artístico unificando toda la obra
    drawMineralWallFinish(ctx, outSize);

    return outCanvas.toDataURL('image/jpeg', 0.93);
  }

  const processed =
    style === 'lapiz_grafito'
      ? applyGraphiteSketchTransform(srcImageData, workSize)
      : applyWatercolorWashTransform(srcImageData, workSize);
  wctx.putImageData(processed, 0, 0);

  // Hoja final en alta resolución sobre papel de algodón crema (#FAF5E8), sin marcos rígidos
  const paperHex = style === 'acuarela_naturalista' ? '#FAF5E8' : '#F6F2E8';
  ctx.fillStyle = paperHex;
  ctx.fillRect(0, 0, outSize, outSize);

  const margin = 38;
  const drawW = outSize - margin * 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(workCanvas, margin, margin, drawW, drawW);

  // Grano sutil de hoja de papel algodón y calidez tenue en bordes (como las láminas Chingolo/Hornero)
  drawColdPressPaperFinish(ctx, outSize, style);

  return outCanvas.toDataURL('image/jpeg', 0.92);
}

/**
 * Construye una tabla de área sumada (Integral Image) en precisión Float64
 * para consultas rectangulares O(1) sin pérdida de precisión numérica.
 */
function buildIntegralImage(values: Float32Array, size: number): Float64Array {
  const stride = size + 1;
  const sat = new Float64Array(stride * stride);
  for (let y = 0; y < size; y++) {
    let rowSum = 0;
    const srcRow = y * size;
    const dstRow = (y + 1) * stride;
    const prevRow = y * stride;
    for (let x = 0; x < size; x++) {
      rowSum += values[srcRow + x];
      sat[dstRow + x + 1] = sat[prevRow + x + 1] + rowSum;
    }
  }
  return sat;
}

function queryIntegralSum(
  sat: Float64Array,
  stride: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): number {
  const bx = x1 + 1;
  const by = y1 + 1;
  return (
    sat[by * stride + bx] -
    sat[y0 * stride + bx] -
    sat[by * stride + x0] +
    sat[y0 * stride + x0]
  );
}

/**
 * Desenfoque de caja O(1) usando Integral Image.
 */
function boxBlurFast(values: Float32Array, size: number, radius: number): Float32Array {
  const sat = buildIntegralImage(values, size);
  const stride = size + 1;
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(size - 1, y + radius);
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(size - 1, x + radius);
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      out[row + x] = queryIntegralSum(sat, stride, x0, y0, x1, y1) / count;
    }
  }
  return out;
}

/**
 * Una pasada del filtro pictórico Kuwahara (4 cuadrantes de mínima varianza) en O(1) por píxel.
 */
function runKuwaharaPass(
  rIn: Float32Array,
  gIn: Float32Array,
  bIn: Float32Array,
  size: number,
  radius: number
): { r: Float32Array; g: Float32Array; b: Float32Array } {
  const total = size * size;
  const lIn = new Float32Array(total);
  const l2In = new Float32Array(total);

  for (let i = 0; i < total; i++) {
    const l = 0.299 * rIn[i] + 0.587 * gIn[i] + 0.114 * bIn[i];
    lIn[i] = l;
    l2In[i] = l * l;
  }

  const satR = buildIntegralImage(rIn, size);
  const satG = buildIntegralImage(gIn, size);
  const satB = buildIntegralImage(bIn, size);
  const satL = buildIntegralImage(lIn, size);
  const satL2 = buildIntegralImage(l2In, size);
  const stride = size + 1;

  const rOut = new Float32Array(total);
  const gOut = new Float32Array(total);
  const bOut = new Float32Array(total);

  for (let y = 0; y < size; y++) {
    const yMin = Math.max(0, y - radius);
    const yMax = Math.min(size - 1, y + radius);
    const row = y * size;

    for (let x = 0; x < size; x++) {
      const xMin = Math.max(0, x - radius);
      const xMax = Math.min(size - 1, x + radius);

      let bestVar = Infinity;
      let bestR = rIn[row + x];
      let bestG = gIn[row + x];
      let bestB = bIn[row + x];

      const quads: [number, number, number, number][] = [
        [xMin, yMin, x, y],
        [x, yMin, xMax, y],
        [xMin, y, x, yMax],
        [x, y, xMax, yMax],
      ];

      for (let q = 0; q < 4; q++) {
        const [x0, y0, x1, y1] = quads[q];
        const count = (x1 - x0 + 1) * (y1 - y0 + 1);
        const meanL = queryIntegralSum(satL, stride, x0, y0, x1, y1) / count;
        const meanL2 = queryIntegralSum(satL2, stride, x0, y0, x1, y1) / count;
        const variance = Math.max(0, meanL2 - meanL * meanL);
        if (variance < bestVar) {
          bestVar = variance;
          bestR = queryIntegralSum(satR, stride, x0, y0, x1, y1) / count;
          bestG = queryIntegralSum(satG, stride, x0, y0, x1, y1) / count;
          bestB = queryIntegralSum(satB, stride, x0, y0, x1, y1) / count;
        }
      }

      const idx = row + x;
      rOut[idx] = bestR;
      gOut[idx] = bestG;
      bOut[idx] = bestB;
    }
  }

  return { r: rOut, g: gOut, b: bOut };
}

/**
 * Transformación artística de Muralismo de Fauna Autóctona y Biodiversidad:
 * - Planos acrílicos definidos (doble Kuwahara radio 3 + radio 5 + cuantización mural de 7 tonos).
 * - Cromatismo vibrante sudamericano (sombras en azul petróleo/bosque profundo, luces soleadas cálidas).
 * - Contorno firme en tinta carbón/tierra oscura sobre rasgos clave.
 * - Canal alfa orgánico que disuelve el fondo fotográfico desenfocado para que el ejemplar se funda
 *   directamente sobre el mural de revoque y flora autóctona pintada detrás.
 */
function applyMuralismFaunaTransform(src: ImageData, size: number): ImageData {
  const data = src.data;
  const total = size * size;

  const r0 = new Float32Array(total);
  const g0 = new Float32Array(total);
  const b0 = new Float32Array(total);
  const origGray = new Float32Array(total);
  const invGray = new Float32Array(total);

  for (let i = 0; i < total; i++) {
    const o = i * 4;
    r0[i] = data[o];
    g0[i] = data[o + 1];
    b0[i] = data[o + 2];
    const g = 0.299 * r0[i] + 0.587 * g0[i] + 0.114 * b0[i];
    origGray[i] = g;
    invGray[i] = 255 - g;
  }

  // 1. Detección de saliencia (sujeto enfocado vs. bokeh liso) + trazo fino Color-Dodge
  const dodgeBlur = boxBlurFast(boxBlurFast(invGray, size, 4), size, 4);

  const rawEdge = new Float32Array(total);
  for (let y = 1; y < size - 1; y++) {
    const row = y * size;
    for (let x = 1; x < size - 1; x++) {
      const gx =
        -origGray[(y - 1) * size + (x - 1)] +
        origGray[(y - 1) * size + (x + 1)] -
        2 * origGray[row + (x - 1)] +
        2 * origGray[row + (x + 1)] -
        origGray[(y + 1) * size + (x - 1)] +
        origGray[(y + 1) * size + (x + 1)];
      const gy =
        -origGray[(y - 1) * size + (x - 1)] -
        2 * origGray[(y - 1) * size + x] -
        origGray[(y - 1) * size + (x + 1)] +
        origGray[(y + 1) * size + (x - 1)] +
        2 * origGray[(y + 1) * size + x] +
        origGray[(y + 1) * size + (x + 1)];
      rawEdge[row + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy) * 0.48);
    }
  }
  const focusTight = boxBlurFast(boxBlurFast(rawEdge, size, 12), size, 12);
  const focusWide = boxBlurFast(focusTight, size, 16);

  // 2. Pincelada acrílica mural amplia (Kuwahara radio 3 -> radio 5)
  const pass1 = runKuwaharaPass(r0, g0, b0, size, 3);
  const paint = runKuwaharaPass(pass1.r, pass1.g, pass1.b, size, 5);

  const paintGray = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    paintGray[i] = 0.299 * paint.r[i] + 0.587 * paint.g[i] + 0.114 * paint.b[i];
  }

  const out = new ImageData(size, size);
  const dst = out.data;

  const cx = size / 2;
  const cy = size / 2;
  const maxRad = size * 0.49;

  for (let y = 0; y < size; y++) {
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const idx = row + x;

      // Contraste y luminosidad acrílica vibrante (sin tonos apagados)
      let mr = Math.pow(clampByte(paint.r[idx]) / 255, 0.9) * 255;
      let mg = Math.pow(clampByte(paint.g[idx]) / 255, 0.9) * 255;
      let mb = Math.pow(clampByte(paint.b[idx]) / 255, 0.92) * 255;

      // Planos de pintura acrílica mural (cuantización estilizada de 7 niveles)
      const levels = 7;
      const qr = Math.round((mr / 255) * levels) * (255 / levels);
      const qg = Math.round((mg / 255) * levels) * (255 / levels);
      const qb = Math.round((mb / 255) * levels) * (255 / levels);
      mr = mr * 0.42 + qr * 0.58;
      mg = mg * 0.42 + qg * 0.58;
      mb = mb * 0.42 + qb * 0.58;

      // Realce cromático muralista sudamericano
      const meanC = (mr + mg + mb) / 3;
      const satBoost = 1.48;
      mr = meanC + (mr - meanC) * satBoost;
      mg = meanC + (mg - meanC) * satBoost;
      mb = meanC + (mb - meanC) * (satBoost * 0.94);

      // Enriquecer sombras hacia azul petróleo/bosque profundo (#1A3B3D) y luces hacia ocre soleado (#FFF1CE)
      const lum = (0.3 * mr + 0.59 * mg + 0.11 * mb) / 255;
      const shadowPull = smoothstep(0.38, 0.06, lum) * 0.34;
      const lightWarm = smoothstep(0.66, 0.98, lum) * 0.16;
      mr = mr * (1 - shadowPull) + 26 * shadowPull + 24 * lightWarm;
      mg = mg * (1 - shadowPull) + 59 * shadowPull + 14 * lightWarm;
      mb = mb * (1 - shadowPull) + 61 * shadowPull - 8 * lightWarm;

      // Contorno expresivo de muralismo (mezcla de bordes de plano Kuwahara + línea fina Color-Dodge)
      let paintEdge = 0;
      if (x > 0 && x < size - 1 && y > 0 && y < size - 1) {
        const gx =
          -paintGray[(y - 1) * size + (x - 1)] +
          paintGray[(y - 1) * size + (x + 1)] -
          2 * paintGray[row + (x - 1)] +
          2 * paintGray[row + (x + 1)] -
          paintGray[(y + 1) * size + (x - 1)] +
          paintGray[(y + 1) * size + (x + 1)];
        const gy =
          -paintGray[(y - 1) * size + (x - 1)] -
          2 * paintGray[(y - 1) * size + x] -
          paintGray[(y - 1) * size + (x + 1)] +
          paintGray[(y + 1) * size + (x - 1)] +
          2 * paintGray[(y + 1) * size + x] +
          paintGray[(y + 1) * size + (x + 1)];
        paintEdge = smoothstep(48, 175, Math.sqrt(gx * gx + gy * gy));
      }

      const g = origGray[idx];
      const b = dodgeBlur[idx];
      const dodgeVal = b >= 253 ? 255 : Math.min(255, (g * 256) / (256 - b));
      const fineLine = 1 - Math.pow(dodgeVal / 255, 1.45);
      const muralInk = Math.min(0.84, Math.max(paintEdge * 0.72, fineLine * 0.68));

      // Tinta mural carbón-petróleo profundo (#232B2C)
      mr = mr * (1 - muralInk) + 35 * muralInk;
      mg = mg * (1 - muralInk) + 43 * muralInk;
      mb = mb * (1 - muralInk) + 44 * muralInk;

      // Máscara alfa pictórica orgánica (sujeto pleno sobre el muro; bokeh liso se funde revelando el mural)
      const dx = x - cx;
      const dy = y - cy;
      const angle = Math.atan2(dy, dx);
      const distNorm = Math.sqrt(dx * dx + dy * dy) / maxRad;
      const brushEdge =
        0.075 * Math.sin(angle * 5 + 0.4) +
        0.045 * Math.cos(angle * 8 - 0.7) +
        0.025 * Math.sin((x - y) * 0.04);
      const effectiveDist = distNorm + brushEdge;

      const tightSharp = smoothstep(7, 25, focusTight[idx]);
      const wideSharp = smoothstep(5, 21, focusWide[idx]);
      const subjectDetail = Math.max(tightSharp, wideSharp * 0.74);

      const origLum = origGray[idx] / 255;
      const isDarkSmoothBokeh = (1 - subjectDetail) * smoothstep(0.68, 0.26, origLum);
      const isOuterSmoothBokeh = (1 - subjectDetail) * smoothstep(0.24, 0.68, effectiveDist);
      // Si el borde tiene detalle nítido (pico, cabeza, cola, antenas), extender la presencia hasta 0.80..0.97
      const radialStart = 0.56 + subjectDetail * 0.24;
      const radialEnd = 0.90 + subjectDetail * 0.08;
      const radialPresence = 1 - smoothstep(radialStart, radialEnd, effectiveDist);

      const bokehClearance = Math.min(0.98, isOuterSmoothBokeh * 0.94 + isDarkSmoothBokeh * 0.8);
      const alpha = Math.max(0, Math.min(1, radialPresence * (1 - bokehClearance)));

      const outIdx = idx * 4;
      dst[outIdx] = clampByte(mr);
      dst[outIdx + 1] = clampByte(mg);
      dst[outIdx + 2] = clampByte(mb);
      dst[outIdx + 3] = clampByte(alpha * 255);
    }
  }

  return out;
}

/**
 * Fondo de muro mineral cálido con veladuras pictóricas sudamericanas (turquesa bosque, ocre sol,
 * terracota suave) y siluetas estilizadas de flora autóctona pintadas alrededor del ejemplar.
 */
function drawMuralWallBackdrop(
  ctx: CanvasRenderingContext2D,
  size: number,
  version: number
): void {
  // Base de revoque mineral cálido
  ctx.fillStyle = '#EFE7D8';
  ctx.fillRect(0, 0, size, size);

  // Halo solar ocre cálido y aguada mural verde-petróleo detrás del ejemplar
  const sunShift = version % 2 === 0 ? 0.56 : 0.44;
  const sunGrad = ctx.createRadialGradient(
    size * sunShift,
    size * 0.42,
    size * 0.06,
    size * sunShift,
    size * 0.46,
    size * 0.46
  );
  sunGrad.addColorStop(0, 'rgba(244, 198, 102, 0.42)');
  sunGrad.addColorStop(0.55, 'rgba(222, 134, 78, 0.16)');
  sunGrad.addColorStop(1, 'rgba(239, 231, 216, 0)');
  ctx.fillStyle = sunGrad;
  ctx.fillRect(0, 0, size, size);

  const tealGrad = ctx.createRadialGradient(
    size * (1 - sunShift),
    size * 0.62,
    size * 0.04,
    size * (1 - sunShift),
    size * 0.58,
    size * 0.52
  );
  tealGrad.addColorStop(0, 'rgba(42, 118, 109, 0.28)');
  tealGrad.addColorStop(0.6, 'rgba(72, 128, 94, 0.14)');
  tealGrad.addColorStop(1, 'rgba(239, 231, 216, 0)');
  ctx.fillStyle = tealGrad;
  ctx.fillRect(0, 0, size, size);

  // Círculo solar muralista sutil detrás del sujeto (sello del muralismo botánico contemporáneo)
  ctx.save();
  ctx.beginPath();
  ctx.arc(size * 0.5, size * 0.48, size * 0.34, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(248, 224, 168, 0.34)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(196, 112, 62, 0.26)';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Pinceladas orgánicas de hojas y flora autóctona pintadas en el perímetro del mural
  const drawPaintedLeaf = (
    x: number,
    y: number,
    rx: number,
    ry: number,
    rot: number,
    fill: string,
    vein: string
  ) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(0, -ry);
    ctx.bezierCurveTo(rx, -ry * 0.45, rx, ry * 0.45, 0, ry);
    ctx.bezierCurveTo(-rx, ry * 0.45, -rx, -ry * 0.45, 0, -ry);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = vein;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -ry * 0.85);
    ctx.lineTo(0, ry * 0.9);
    ctx.stroke();
    ctx.restore();
  };

  // Ramas y follaje nativo en las esquinas (enmarcan sin competir con el animal central)
  drawPaintedLeaf(size * 0.13, size * 0.78, 44, 108, 0.55, 'rgba(42, 108, 92, 0.42)', 'rgba(28, 68, 58, 0.4)');
  drawPaintedLeaf(size * 0.22, size * 0.87, 36, 86, 0.95, 'rgba(84, 134, 82, 0.36)', 'rgba(46, 84, 48, 0.35)');
  drawPaintedLeaf(size * 0.08, size * 0.62, 30, 74, 0.18, 'rgba(198, 108, 58, 0.28)', 'rgba(130, 62, 32, 0.3)');

  drawPaintedLeaf(size * 0.88, size * 0.22, 42, 104, -2.55, 'rgba(42, 108, 92, 0.40)', 'rgba(28, 68, 58, 0.38)');
  drawPaintedLeaf(size * 0.79, size * 0.12, 34, 82, -2.15, 'rgba(222, 162, 62, 0.36)', 'rgba(148, 98, 28, 0.32)');
  drawPaintedLeaf(size * 0.92, size * 0.38, 28, 72, -2.95, 'rgba(84, 134, 82, 0.34)', 'rgba(46, 84, 48, 0.32)');

  // Pequeños acentos florales muralistas
  const flowers: [number, number, number, string][] = [
    [size * 0.15, size * 0.2, 20, 'rgba(218, 106, 56, 0.42)'],
    [size * 0.84, size * 0.82, 24, 'rgba(232, 174, 58, 0.46)'],
    [size * 0.76, size * 0.88, 15, 'rgba(196, 86, 56, 0.38)'],
  ];
  for (const [fx, fy, fr, col] of flowers) {
    ctx.fillStyle = col;
    for (let p = 0; p < 5; p++) {
      const a = (p * Math.PI * 2) / 5;
      ctx.beginPath();
      ctx.arc(fx + Math.cos(a) * fr * 0.65, fy + Math.sin(a) * fr * 0.65, fr * 0.48, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(46, 52, 42, 0.45)';
    ctx.beginPath();
    ctx.arc(fx, fy, fr * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Textura mineral sutil de revoque fino / estuco sobre toda la pintura mural para integrarla al muro.
 */
function drawMineralWallFinish(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.save();
  // Trazos tenues de llana / revoque diagonal
  ctx.strokeStyle = 'rgba(255, 250, 240, 0.11)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 42; i++) {
    const x = (((Math.sin(i * 91.3) * 43758.5453) % 1) + 1) % 1;
    const y = (((Math.sin(i * 217.9) * 43758.5453) % 1) + 1) % 1;
    const len = 45 + (i % 5) * 28;
    ctx.beginPath();
    ctx.moveTo(x * size, y * size);
    ctx.lineTo(x * size + len, y * size - len * 0.28);
    ctx.stroke();
  }

  // Porosidad mineral sutil del muro pintado
  for (let i = 0; i < 340; i++) {
    const px = (((Math.sin(i * 127.1) * 43758.5453) % 1) + 1) % 1;
    const py = (((Math.sin(i * 311.7) * 43758.5453) % 1) + 1) % 1;
    const r = 0.7 + (i % 3) * 0.6;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(60, 52, 42, 0.08)' : 'rgba(255, 252, 244, 0.14)';
    ctx.beginPath();
    ctx.arc(px * size, py * size, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Viñeta cálida sutil en los bordes del muro
  const edgeShade = ctx.createRadialGradient(
    size * 0.5,
    size * 0.5,
    size * 0.34,
    size * 0.5,
    size * 0.5,
    size * 0.72
  );
  edgeShade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  edgeShade.addColorStop(1, 'rgba(56, 46, 34, 0.14)');
  ctx.fillStyle = edgeShade;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
}

/**
 * Transformación pictórica de acuarela botánica + pluma en tinta sepia:
 * - Combina aguadas luminosas Kuwahara (radio 2 + radio 3, preservando ojos y plumaje fino)
 *   con delineado fino en tinta sepia mediante Color-Dodge (nítido, jamás empastado).
 * - Disuelve las zonas desenfocadas (bokeh oscuro/liso) hacia papel algodón limpio (#FAF5E8),
 *   incluso cerca del ejemplar, dejando que respire sobre la hoja limpia.
 */
function applyWatercolorWashTransform(src: ImageData, size: number): ImageData {
  const data = src.data;
  const total = size * size;

  const r0 = new Float32Array(total);
  const g0 = new Float32Array(total);
  const b0 = new Float32Array(total);
  const origGray = new Float32Array(total);
  const invGray = new Float32Array(total);

  for (let i = 0; i < total; i++) {
    const o = i * 4;
    r0[i] = data[o];
    g0[i] = data[o + 1];
    b0[i] = data[o + 2];
    const g = 0.299 * r0[i] + 0.587 * g0[i] + 0.114 * b0[i];
    origGray[i] = g;
    invGray[i] = 255 - g;
  }

  // 1. Capa de dibujo fino a pluma (Color-Dodge de precisión): traza ojos, pico y plumas con limpieza
  const dodgeBlur = boxBlurFast(boxBlurFast(invGray, size, 4), size, 4);

  // 2. Mapa de nitidez (saliencia de sujeto enfocado vs. bokeh desenfocado del fondo)
  const rawEdge = new Float32Array(total);
  for (let y = 1; y < size - 1; y++) {
    const row = y * size;
    for (let x = 1; x < size - 1; x++) {
      const gx =
        -origGray[(y - 1) * size + (x - 1)] +
        origGray[(y - 1) * size + (x + 1)] -
        2 * origGray[row + (x - 1)] +
        2 * origGray[row + (x + 1)] -
        origGray[(y + 1) * size + (x - 1)] +
        origGray[(y + 1) * size + (x + 1)];
      const gy =
        -origGray[(y - 1) * size + (x - 1)] -
        2 * origGray[(y - 1) * size + x] -
        origGray[(y - 1) * size + (x + 1)] +
        origGray[(y + 1) * size + (x - 1)] +
        2 * origGray[(y + 1) * size + x] +
        origGray[(y + 1) * size + (x + 1)];
      rawEdge[row + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy) * 0.45);
    }
  }
  const focusTight = boxBlurFast(boxBlurFast(rawEdge, size, 12), size, 12);
  const focusWide = boxBlurFast(focusTight, size, 16);

  // 3. Doble pasada Kuwahara de pincel fino (radio 2 + radio 3)
  const pass1 = runKuwaharaPass(r0, g0, b0, size, 2);
  const paint = runKuwaharaPass(pass1.r, pass1.g, pass1.b, size, 3);

  const paintGray = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    paintGray[i] = 0.299 * paint.r[i] + 0.587 * paint.g[i] + 0.114 * paint.b[i];
  }
  const wetEdgeBlur = boxBlurFast(paintGray, size, 2);

  const out = new ImageData(size, size);
  const dst = out.data;

  const paperR = 250;
  const paperG = 245;
  const paperB = 232;
  const cx = size / 2;
  const cy = size / 2;
  const maxRad = size * 0.49;

  for (let y = 0; y < size; y++) {
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const idx = row + x;

      let wr = Math.pow(clampByte(paint.r[idx]) / 255, 0.84) * 255;
      let wg = Math.pow(clampByte(paint.g[idx]) / 255, 0.85) * 255;
      let wb = Math.pow(clampByte(paint.b[idx]) / 255, 0.88) * 255;

      const levels = 11;
      const qr = Math.round((wr / 255) * levels) * (255 / levels);
      const qg = Math.round((wg / 255) * levels) * (255 / levels);
      const qb = Math.round((wb / 255) * levels) * (255 / levels);
      wr = wr * 0.62 + qr * 0.38;
      wg = wg * 0.62 + qg * 0.38;
      wb = wb * 0.62 + qb * 0.38;

      const meanC = (wr + wg + wb) / 3;
      const satBoost = 1.24;
      wr = meanC + (wr - meanC) * satBoost;
      wg = meanC + (wg - meanC) * satBoost;
      wb = meanC + (wb - meanC) * (satBoost * 0.9);

      const localDiff = wetEdgeBlur[idx] - paintGray[idx];
      if (localDiff > 5) {
        const pool = Math.min(14, (localDiff - 5) * 0.45);
        wr -= pool;
        wg -= pool * 1.05;
        wb -= pool * 1.12;
      }

      const washTransparency = 0.24;
      wr = wr * (1 - washTransparency) + paperR * washTransparency;
      wg = wg * (1 - washTransparency) + paperG * washTransparency;
      wb = wb * (1 - washTransparency) + paperB * washTransparency;

      const g = origGray[idx];
      const b = dodgeBlur[idx];
      const dodgeVal = b >= 253 ? 255 : Math.min(255, (g * 256) / (256 - b));
      const lineT = Math.pow(dodgeVal / 255, 1.35);
      const inkStrength = (1 - lineT) * 0.64;
      wr = wr * (1 - inkStrength) + 66 * inkStrength;
      wg = wg * (1 - inkStrength) + 49 * inkStrength;
      wb = wb * (1 - inkStrength) + 36 * inkStrength;

      const dx = x - cx;
      const dy = y - cy;
      const angle = Math.atan2(dy, dx);
      const distNorm = Math.sqrt(dx * dx + dy * dy) / maxRad;
      const organicRipple =
        0.065 * Math.sin(angle * 4 + 0.6) +
        0.04 * Math.cos(angle * 7 - 0.4) +
        0.025 * Math.sin((x + y) * 0.035);
      const effectiveDist = distNorm + organicRipple;

      const tightSharp = smoothstep(7, 26, focusTight[idx]);
      const wideSharp = smoothstep(5, 22, focusWide[idx]);
      const subjectDetail = Math.max(tightSharp, wideSharp * 0.72);

      const origLum = origGray[idx] / 255;
      const isDarkSmoothBokeh = (1 - subjectDetail) * smoothstep(0.68, 0.28, origLum);
      const isOuterSmoothBokeh = (1 - subjectDetail) * smoothstep(0.24, 0.7, effectiveDist);
      const radialStart = 0.58 + subjectDetail * 0.22;
      const radialEnd = 0.92 + subjectDetail * 0.06;
      const radialPresence = 1 - smoothstep(radialStart, radialEnd, effectiveDist);

      const bokehClearance = Math.min(0.96, isOuterSmoothBokeh * 0.92 + isDarkSmoothBokeh * 0.78);
      const paintPresence = Math.max(0, Math.min(1, radialPresence * (1 - bokehClearance)));

      const grain =
        (((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) - 0.5) * 11 +
        Math.sin(x * 0.58) * Math.cos(y * 0.58) * 2.8;

      const finalR = wr * paintPresence + paperR * (1 - paintPresence) + grain * (0.3 + 0.7 * paintPresence);
      const finalG = wg * paintPresence + paperG * (1 - paintPresence) + grain * 0.94 * (0.3 + 0.7 * paintPresence);
      const finalB = wb * paintPresence + paperB * (1 - paintPresence) + grain * 0.86 * (0.3 + 0.7 * paintPresence);

      const outIdx = idx * 4;
      dst[outIdx] = clampByte(finalR);
      dst[outIdx + 1] = clampByte(finalG);
      dst[outIdx + 2] = clampByte(finalB);
      dst[outIdx + 3] = 255;
    }
  }

  return out;
}

/**
 * Transformación de apunte de campo en lápiz grafito 2B/4B (Color-Dodge + tramado botánico).
 */
function applyGraphiteSketchTransform(src: ImageData, size: number): ImageData {
  const data = src.data;
  const total = size * size;
  const gray = new Float32Array(total);
  const inv = new Float32Array(total);

  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const g = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    gray[i] = g;
    inv[i] = 255 - g;
  }

  const blur1 = boxBlurFast(inv, size, 6);
  const blur2 = boxBlurFast(blur1, size, 6);

  const edgeEnergy = new Float32Array(total);
  for (let y = 1; y < size - 1; y++) {
    const row = y * size;
    for (let x = 1; x < size - 1; x++) {
      const gx = gray[row + x + 1] - gray[row + x - 1];
      const gy = gray[(y + 1) * size + x] - gray[(y - 1) * size + x];
      edgeEnergy[row + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy) * 1.4);
    }
  }
  const focusMap = boxBlurFast(boxBlurFast(edgeEnergy, size, 16), size, 16);

  const out = new ImageData(size, size);
  const dst = out.data;
  const cx = size / 2;
  const cy = size / 2;
  const maxRad = size * 0.49;

  for (let y = 0; y < size; y++) {
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const idx = row + x;
      const g = gray[idx];
      const b = blur2[idx];

      let sketch = b >= 253 ? 255 : Math.min(255, (g * 256) / (256 - b));

      sketch = Math.pow(sketch / 255, 1.52) * 255;
      if (sketch < 210 && (x + y) % 4 === 0) {
        sketch -= 15;
      }
      if (sketch < 155 && (x - y + size) % 5 === 0) {
        sketch -= 13;
      }

      const grain = (((Math.sin(x * 19.19 + y * 47.73) * 18421.31) % 1) - 0.5) * 11;
      sketch = clampByte(sketch + grain);

      const dx = x - cx;
      const dy = y - cy;
      const angle = Math.atan2(dy, dx);
      const distNorm = Math.sqrt(dx * dx + dy * dy) / maxRad + 0.05 * Math.sin(angle * 5);
      const sharpness = Math.max(0, Math.min(1, (focusMap[idx] - 6) / 22));
      const radialPresence = 1 - smoothstep(0.55, 0.94, distNorm);
      const bokehSuppression = smoothstep(0.3, 0.76, distNorm) * (1 - sharpness);
      const presence = Math.max(0, Math.min(1, radialPresence * (1 - bokehSuppression * 0.9)));

      const t = sketch / 255;
      const pr = 46 + (246 - 46) * t;
      const pg = 42 + (242 - 42) * t;
      const pb = 38 + (232 - 38) * t;

      const o = idx * 4;
      dst[o] = clampByte(pr * presence + 246 * (1 - presence));
      dst[o + 1] = clampByte(pg * presence + 242 * (1 - presence));
      dst[o + 2] = clampByte(pb * presence + 232 * (1 - presence));
      dst[o + 3] = 255;
    }
  }

  return out;
}

/**
 * Acabado sutil de papel algodón prensado en frío sobre los bordes del pliego.
 */
function drawColdPressPaperFinish(
  ctx: CanvasRenderingContext2D,
  size: number,
  style: IllustrationStyle
): void {
  ctx.save();
  const paperRgb = style === 'acuarela_naturalista' ? '250, 245, 232' : '246, 242, 232';
  const edgeGrad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.34,
    size / 2,
    size / 2,
    size * 0.5
  );
  edgeGrad.addColorStop(0, `rgba(${paperRgb}, 0)`);
  edgeGrad.addColorStop(0.76, `rgba(${paperRgb}, 0.2)`);
  edgeGrad.addColorStop(1, `rgba(${paperRgb}, 1)`);
  ctx.fillStyle = edgeGrad;
  ctx.fillRect(0, 0, size, size);

  const warmEdge = ctx.createRadialGradient(
    size * 0.5,
    size * 0.48,
    size * 0.28,
    size * 0.5,
    size * 0.5,
    size * 0.72
  );
  warmEdge.addColorStop(0, 'rgba(255, 252, 245, 0)');
  warmEdge.addColorStop(
    1,
    style === 'acuarela_naturalista' ? 'rgba(214, 198, 168, 0.2)' : 'rgba(205, 196, 178, 0.16)'
  );
  ctx.fillStyle = warmEdge;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle =
    style === 'acuarela_naturalista' ? 'rgba(136, 118, 92, 0.08)' : 'rgba(110, 102, 90, 0.07)';
  for (let i = 0; i < 180; i++) {
    const px = (((Math.sin(i * 127.1) * 43758.5453) % 1) + 1) % 1;
    const py = (((Math.sin(i * 311.7) * 43758.5453) % 1) + 1) % 1;
    const r = 0.6 + (i % 3) * 0.55;
    ctx.beginPath();
    ctx.arc(px * size, py * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}
