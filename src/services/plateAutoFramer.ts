import { getProxiedImageUrl } from './speciesReferenceService';

/**
 * Encuadre inteligente para láminas naturalistas sobre papel claro (Acuarela y Grafito).
 * Detecta los márgenes vacíos de papel alrededor de la ilustración y reencuadra
 * suavemente el motivo para que ocupe ~85–88% del espacio disponible sin recortar
 * ningún trazo ni deformar la proporción, preservando intacto el tono exacto del papel.
 */

export interface DetectedPlateSubject {
  bgR: number;
  bgG: number;
  bgB: number;
  bgCss: string;
  /** Coordenadas normalizadas [0..1] del cuadro delimitador del dibujo */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface AutoFrameRect {
  /** Rectángulo de origen (puede exceder levemente [0..imgW/H] si necesita aire extra con color de papel) */
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  bgCss: string;
}

function isJsdom(): boolean {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');
}

/**
 * Analiza los bordes de la lámina y calcula el cuadro real del motivo ilustrado.
 * Devuelve `null` si la imagen no tiene fondo uniforme de papel claro (ej.: Muralismo o fotografía).
 */
export function detectPaperAndSubjectBounds(
  img: HTMLImageElement | HTMLCanvasElement
): DetectedPlateSubject | null {
  if (typeof document === 'undefined' || isJsdom()) return null;

  const srcW = img instanceof HTMLImageElement ? img.naturalWidth || img.width : img.width;
  const srcH = img instanceof HTMLImageElement ? img.naturalHeight || img.height : img.height;
  if (!srcW || !srcH) return null;

  const sampleSize = 200;
  const sw = srcW >= srcH ? sampleSize : Math.max(40, Math.round((sampleSize * srcW) / srcH));
  const sh = srcH >= srcW ? sampleSize : Math.max(40, Math.round((sampleSize * srcH) / srcW));

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  try {
    ctx.drawImage(img, 0, 0, sw, sh);
    const { data } = ctx.getImageData(0, 0, sw, sh);

    // 1. Muestrear el perímetro exterior (franja de 3 px) para estimar el color real del papel
    const rVals: number[] = [];
    const gVals: number[] = [];
    const bVals: number[] = [];
    const border = 3;

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        if (x < border || x >= sw - border || y < border || y >= sh - border) {
          const idx = (y * sw + x) * 4;
          if (data[idx + 3] < 200) continue;
          rVals.push(data[idx]);
          gVals.push(data[idx + 1]);
          bVals.push(data[idx + 2]);
        }
      }
    }

    if (rVals.length < 20) return null;

    rVals.sort((a, b) => a - b);
    gVals.sort((a, b) => a - b);
    bVals.sort((a, b) => a - b);
    const mid = Math.floor(rVals.length / 2);
    const bgR = rVals[mid];
    const bgG = gVals[mid];
    const bgB = bVals[mid];

    // Debe ser papel claro (acuarela marfil / papel grafito crema), nunca un fondo oscuro ni fotografía
    const bgLuma = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;
    if (bgLuma < 185) return null;

    // Verificar que al menos el 84% del borde sea papel uniforme
    let matchingBorder = 0;
    for (let i = 0; i < rVals.length; i++) {
      const d = Math.hypot(rVals[i] - bgR, gVals[i] - bgG, bVals[i] - bgB);
      if (d <= 26) matchingBorder += 1;
    }
    if (matchingBorder / rVals.length < 0.84) return null;

    // 2. Construir máscara binaria de píxeles que pertenecen a la ilustración (tinta, pigmento o grafito suave)
    const inkMask = new Uint8Array(sw * sh);
    const distThreshold = 14;
    for (let y = 2; y < sh - 2; y++) {
      for (let x = 2; x < sw - 2; x++) {
        const idx = (y * sw + x) * 4;
        const a = data[idx + 3];
        if (a < 30) continue;
        const dist = Math.hypot(data[idx] - bgR, data[idx + 1] - bgG, data[idx + 2] - bgB);
        if (dist > distThreshold) {
          inkMask[y * sw + x] = 1;
        }
      }
    }

    // 3. Filtrar ruido aislado de grano de papel (exigir al menos 3 píxeles activos en vecindad 3×3)
    let minX = sw;
    let minY = sh;
    let maxX = -1;
    let maxY = -1;
    let activeCount = 0;

    for (let y = 3; y < sh - 3; y++) {
      for (let x = 3; x < sw - 3; x++) {
        if (!inkMask[y * sw + x]) continue;
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (inkMask[(y + dy) * sw + (x + dx)]) neighbors += 1;
          }
        }
        if (neighbors >= 3) {
          activeCount += 1;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (activeCount < 25 || maxX <= minX || maxY <= minY) return null;

    const left = minX / sw;
    const top = minY / sh;
    const right = (maxX + 1) / sw;
    const bottom = (maxY + 1) / sh;

    if (right - left < 0.08 || bottom - top < 0.08) return null;

    return {
      bgR,
      bgG,
      bgB,
      bgCss: `rgb(${bgR}, ${bgG}, ${bgB})`,
      left,
      top,
      right,
      bottom,
    };
  } catch {
    return null;
  }
}

/**
 * Calcula un rectángulo de encuadre centrado alrededor del sujeto detectado para rellenar
 * armónicamente una caja de destino `(targetW × targetH)` sin cortar el dibujo.
 * También evita cortes laterales cuando una lámina 1:1 ancha se coloca en un marco vertical 4:5.
 */
export function computeAutoFrameCrop(params: {
  imgW: number;
  imgH: number;
  targetW: number;
  targetH: number;
  subject: DetectedPlateSubject;
  /** Porcentaje objetivo que ocupará el eje limitante del dibujo (por defecto 0.87 = ~6.5% margen) */
  targetFill?: number;
  /** Zoom máximo permitido para conservar máxima nitidez */
  maxZoom?: number;
}): AutoFrameRect | null {
  const { imgW, imgH, targetW, targetH, subject } = params;
  const targetFill = params.targetFill ?? 0.87;
  const maxZoom = params.maxZoom ?? 1.95;

  const subjW = (subject.right - subject.left) * imgW;
  const subjH = (subject.bottom - subject.top) * imgH;
  const subjCx = ((subject.left + subject.right) / 2) * imgW;
  const subjCy = ((subject.top + subject.bottom) / 2) * imgH;

  const targetAspect = targetW / Math.max(1, targetH);

  // Rectángulo "cover" estándar que aplicaría un encuadre sin detección de sujeto
  const baseCoverW = imgW / imgH > targetAspect ? imgH * targetAspect : imgW;
  const baseCoverH = baseCoverW / targetAspect;

  // Ancho y alto ideales de recorte para que el motivo entre íntegro con ~6.5% de aire por lado
  let cropW = Math.max(subjW / targetFill, (subjH / targetFill) * targetAspect);
  let cropH = cropW / targetAspect;

  // Limitar zoom máximo para mantener trazo nítido
  const minCropW = baseCoverW / maxZoom;
  const minCropH = baseCoverH / maxZoom;
  if (cropW < minCropW) {
    cropW = minCropW;
    cropH = minCropH;
  }

  // Evitar alejar más de lo necesario (solo abrir ligeramente si hace falta para no cortar en 4:5)
  const maxSafeCropW = Math.max(imgW * 1.15, imgH * 1.15 * targetAspect);
  if (cropW > maxSafeCropW) {
    cropW = maxSafeCropW;
    cropH = cropW / targetAspect;
  }

  // ¿El cover estándar recortaría el motivo o dejaría demasiado papel vacío?
  const coverLeft = (imgW - baseCoverW) / 2;
  const coverRight = coverLeft + baseCoverW;
  const coverTop = (imgH - baseCoverH) / 2;
  const coverBottom = coverTop + baseCoverH;
  const subjLeftPx = subject.left * imgW;
  const subjRightPx = subject.right * imgW;
  const subjTopPx = subject.top * imgH;
  const subjBottomPx = subject.bottom * imgH;

  const wouldClipInCover =
    subjLeftPx < coverLeft + baseCoverW * 0.03 ||
    subjRightPx > coverRight - baseCoverW * 0.03 ||
    subjTopPx < coverTop + baseCoverH * 0.03 ||
    subjBottomPx > coverBottom - baseCoverH * 0.03;

  const alreadyWellFilled = cropW >= baseCoverW * 0.94 && !wouldClipInCover;
  if (alreadyWellFilled) {
    const offsetX = Math.abs(subjCx - imgW / 2) / imgW;
    const offsetY = Math.abs(subjCy - imgH / 2) / imgH;
    if (offsetX < 0.05 && offsetY < 0.05) {
      return null;
    }
    cropW = baseCoverW;
    cropH = baseCoverH;
  }

  // Centrar en el motivo (con leve equilibrio óptico de 1% hacia arriba)
  const cropX = subjCx - cropW / 2;
  const cropY = subjCy - cropH / 2 + cropH * 0.01;

  return {
    cropX,
    cropY,
    cropW,
    cropH,
    bgCss: subject.bgCss,
  };
}

/**
 * Dibuja una ilustración en `(x, y, w, h)` aplicando encuadre inteligente si sobra papel vacío
 * o si un marco vertical 4:5 cortaría parte del motivo, rellenando con el tono exacto del papel.
 */
export function drawBotanicalArtworkFitted(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  enableSmartFraming: boolean
): void {
  const imgW = img.naturalWidth || img.width || w;
  const imgH = img.naturalHeight || img.height || h;

  if (enableSmartFraming) {
    const subject = detectPaperAndSubjectBounds(img);
    if (subject) {
      const frame = computeAutoFrameCrop({
        imgW,
        imgH,
        targetW: w,
        targetH: h,
        subject,
      });
      if (frame) {
        ctx.fillStyle = frame.bgCss;
        ctx.fillRect(x, y, w, h);

        const sx0 = Math.max(0, frame.cropX);
        const sy0 = Math.max(0, frame.cropY);
        const sx1 = Math.min(imgW, frame.cropX + frame.cropW);
        const sy1 = Math.min(imgH, frame.cropY + frame.cropH);
        const sw = sx1 - sx0;
        const sh = sy1 - sy0;

        if (sw > 1 && sh > 1) {
          const scaleX = w / frame.cropW;
          const scaleY = h / frame.cropH;
          const dx = x + (sx0 - frame.cropX) * scaleX;
          const dy = y + (sy0 - frame.cropY) * scaleY;
          const dw = sw * scaleX;
          const dh = sh * scaleY;

          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, w, h);
          ctx.clip();
          ctx.drawImage(img, sx0, sy0, sw, sh, dx, dy, dw, dh);
          ctx.restore();
          return;
        }
      }
    }
  }

  // Cover estándar (para Muralismo, fotografías o láminas ya bien encuadradas)
  const imgRatio = imgW / imgH;
  const boxRatio = w / h;
  let sx = 0;
  let sy = 0;
  let sw = imgW;
  let sh = imgH;

  if (imgRatio > boxRatio) {
    sw = imgH * boxRatio;
    sx = (imgW - sw) / 2;
  } else {
    sh = imgW / boxRatio;
    sy = (imgH - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function loadCorsImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Post-procesa una lámina en estilo Acuarela o Grafito para eliminar márgenes vacíos
 * excesivos (tanto en láminas recién generadas como al mostrar láminas ya guardadas).
 */
export async function autoFrameBotanicalPlateDataUrl(
  sourceUrl: string,
  outputSize = 1024
): Promise<string> {
  if (typeof Image === 'undefined' || typeof document === 'undefined' || isJsdom() || !sourceUrl) {
    return sourceUrl;
  }
  if (sourceUrl.startsWith('data:image/svg')) {
    return sourceUrl;
  }

  let img = await loadCorsImage(sourceUrl);
  if (!img && /^https:\/\//i.test(sourceUrl)) {
    img = await loadCorsImage(getProxiedImageUrl(sourceUrl));
  }
  if (!img) return sourceUrl;

  try {
    const subject = detectPaperAndSubjectBounds(img);
    if (!subject) return sourceUrl;

    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;
    const frame = computeAutoFrameCrop({
      imgW,
      imgH,
      targetW: outputSize,
      targetH: outputSize,
      subject,
      targetFill: 0.87,
      maxZoom: 1.95,
    });
    if (!frame) return sourceUrl;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = outputSize;
    outCanvas.height = outputSize;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) return sourceUrl;

    drawBotanicalArtworkFitted(ctx, img, 0, 0, outputSize, outputSize, true);
    return outCanvas.toDataURL('image/jpeg', 0.92);
  } catch {
    return sourceUrl;
  }
}

const framedPlateCache = new Map<string, Promise<string>>();

/**
 * Versión memoizada en memoria para reencuadrar automáticamente láminas existentes
 * de Acuarela y Grafito en las vistas del cuaderno y el visor Lightbox sin recalcular.
 */
export function getCachedAutoFramedPlateUrl(
  sourceUrl: string,
  outputSize = 1024
): Promise<string> {
  if (!sourceUrl || sourceUrl.startsWith('data:image/svg') || isJsdom()) {
    return Promise.resolve(sourceUrl);
  }
  const cacheKey = `${outputSize}:${sourceUrl.slice(0, 140)}:${sourceUrl.length}`;
  const existing = framedPlateCache.get(cacheKey);
  if (existing) return existing;

  const task = autoFrameBotanicalPlateDataUrl(sourceUrl, outputSize).catch(() => sourceUrl);
  framedPlateCache.set(cacheKey, task);
  return task;
}
