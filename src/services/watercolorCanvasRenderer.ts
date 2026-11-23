import { IllustrationStyle } from '../types/domain';

/**
 * Motor algorítmico local de acuarela botánica y apunte en lápiz grafito sobre HTML5 Canvas.
 * Combina:
 * - Filtro pictórico Kuwahara (O(1) vía Integral Images) para transformar textura fotográfica en pinceladas limpias.
 * - Delineado fino en tinta sepia mediante Color-Dodge (nítido en ojo, pico y plumaje sin empastar zonas densas).
 * - Disolución inteligente del fondo desenfocado (bokeh) hacia papel de algodón crema limpio (#FAF5E8).
 * - Veladuras translúcidas cálidas, efecto borde húmedo y grano de papel prensado en frío.
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

  // Recorte cuadrado centrado (cover) con leve encuadre sobre el ave
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
  const processed =
    style === 'lapiz_grafito'
      ? applyGraphiteSketchTransform(srcImageData, workSize)
      : applyWatercolorWashTransform(srcImageData, workSize);
  wctx.putImageData(processed, 0, 0);

  // Hoja final en alta resolución sobre papel de algodón crema (#FAF5E8), sin marcos rígidos
  const outCanvas = document.createElement('canvas');
  outCanvas.width = outSize;
  outCanvas.height = outSize;
  const ctx = outCanvas.getContext('2d');
  if (!ctx) return null;

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
 * Transformación pictórica de acuarela botánica + pluma en tinta sepia:
 * - Combina aguadas luminosas Kuwahara (radio 2 + radio 3, preservando ojos y plumaje fino)
 *   con delineado fino en tinta sepia mediante Color-Dodge (nítido, jamás empastado).
 * - Disuelve las zonas desenfocadas (bokeh oscuro/liso) hacia papel algodón limpio (#FAF5E8),
 *   incluso cerca del ave, dejando que el ejemplar y su rama respiren sobre la hoja limpia.
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
  // Mapa de nitidez de alcance medio (abraza el interior del ave pero deja afuera el bokeh liso)
  const focusTight = boxBlurFast(boxBlurFast(rawEdge, size, 12), size, 12);
  const focusWide = boxBlurFast(focusTight, size, 16);

  // 3. Doble pasada Kuwahara de pincel fino (radio 2 + radio 3): pincelada clara sin destruir ojos ni moteado
  const pass1 = runKuwaharaPass(r0, g0, b0, size, 2);
  const paint = runKuwaharaPass(pass1.r, pass1.g, pass1.b, size, 3);

  // Borde húmedo sutil (wet-edge pigment pooling)
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

      // Levantar luminosidad de sombras fotográficas antes de aplicar aguada (acuarela luminosa, nunca fangosa)
      let wr = Math.pow(clampByte(paint.r[idx]) / 255, 0.84) * 255;
      let wg = Math.pow(clampByte(paint.g[idx]) / 255, 0.85) * 255;
      let wb = Math.pow(clampByte(paint.b[idx]) / 255, 0.88) * 255;

      // Cuantización suave de pigmento en veladuras
      const levels = 11;
      const qr = Math.round((wr / 255) * levels) * (255 / levels);
      const qg = Math.round((wg / 255) * levels) * (255 / levels);
      const qb = Math.round((wb / 255) * levels) * (255 / levels);
      wr = wr * 0.62 + qr * 0.38;
      wg = wg * 0.62 + qg * 0.38;
      wb = wb * 0.62 + qb * 0.38;

      // Realce cromático naturalista cálido (siena, ocre, oliva botánico)
      const meanC = (wr + wg + wb) / 3;
      const satBoost = 1.24;
      wr = meanC + (wr - meanC) * satBoost;
      wg = meanC + (wg - meanC) * satBoost;
      wb = meanC + (wb - meanC) * (satBoost * 0.9);

      // Borde húmedo sutil de acuarela
      const localDiff = wetEdgeBlur[idx] - paintGray[idx];
      if (localDiff > 5) {
        const pool = Math.min(14, (localDiff - 5) * 0.45);
        wr -= pool;
        wg -= pool * 1.05;
        wb -= pool * 1.12;
      }

      // Transparencia de acuarela sobre papel de algodón crema (#FAF5E8)
      const washTransparency = 0.24;
      wr = wr * (1 - washTransparency) + paperR * washTransparency;
      wg = wg * (1 - washTransparency) + paperG * washTransparency;
      wb = wb * (1 - washTransparency) + paperB * washTransparency;

      // Trazo fino de tinta sepia botánica (Color-Dodge multiplicado suavemente sobre la aguada)
      const g = origGray[idx];
      const b = dodgeBlur[idx];
      const dodgeVal = b >= 253 ? 255 : Math.min(255, (g * 256) / (256 - b));
      // Solo líneas reales (0 = línea fina nítida, 1 = sin trazo)
      const lineT = Math.pow(dodgeVal / 255, 1.35);
      const inkStrength = (1 - lineT) * 0.64;
      wr = wr * (1 - inkStrength) + 66 * inkStrength;
      wg = wg * (1 - inkStrength) + 49 * inkStrength;
      wb = wb * (1 - inkStrength) + 36 * inkStrength;

      // Presencia pictórica inteligente:
      // 1) Suaviza el perímetro con borde orgánico de aguada.
      // 2) Detecta y lava hacia papel crema el bokeh oscuro/liso del fondo incluso cerca del ave,
      //    conservando pleno el sujeto enfocado y las zonas luminosas del pecho/cabeza.
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

      // Si un área es muy lisa (bokeh puro) y oscura/verdosa de fondo, disolverla en papel crema
      const origLum = origGray[idx] / 255;
      const isDarkSmoothBokeh = (1 - subjectDetail) * smoothstep(0.68, 0.28, origLum);
      const isOuterSmoothBokeh = (1 - subjectDetail) * smoothstep(0.24, 0.7, effectiveDist);
      const radialPresence = 1 - smoothstep(0.58, 0.94, effectiveDist);

      const bokehClearance = Math.min(0.96, isOuterSmoothBokeh * 0.92 + isDarkSmoothBokeh * 0.78);
      const paintPresence = Math.max(0, Math.min(1, radialPresence * (1 - bokehClearance)));

      // Textura de grano fino de papel algodón prensado en frío
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
 * Transformación de apunte de campo en lápiz grafito 2B/4B (Color-Dodge + tramado botánico):
 * Convierte cualquier foto en líneas finas de grafito sobre hoja de cuaderno limpia,
 * disolviendo automáticamente el fondo fotográfico desenfocado en papel crema.
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

  // Aproximación gaussiana rápida (doble box-blur O(1)) para Color Dodge nítido
  const blur1 = boxBlurFast(inv, size, 6);
  const blur2 = boxBlurFast(blur1, size, 6);

  // Mapa de detalle para priorizar el ave y limpiar el fondo desenfocado
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

      // Color Dodge clásico para trazo fino de grafito
      let sketch = b >= 253 ? 255 : Math.min(255, (g * 256) / (256 - b));

      // Reforzar trazo en zonas de contorno y agregar tramado diagonal 2B en sombras medias
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

      // Mapear de grafito (#302C27) a papel crema de libreta (#F6F2E8)
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

  // Tinte cálido envejecido muy sutil en las esquinas del pliego (como Chingolo / Hornero)
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

  // Motas orgánicas sutiles del papel algodón
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
