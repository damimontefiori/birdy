import { IllustrationStyle } from '../types/domain';
import { formatShortArgentineDate } from './storageAndSyncService';

export type SocialShareVariant = 'solo_ilustracion' | 'ilustracion_y_foto';
export type SocialShareFormat = 'historia_9_16' | 'publicacion_4_5';

export interface SocialCardOptions {
  variant: SocialShareVariant;
  format: SocialShareFormat;
  style: IllustrationStyle;
  commonNameAr: string;
  scientificName: string;
  family: string;
  illustrationUrl: string;
  originalPhotoSanitizedUrl?: string;
  includeDate: boolean;
  observedAtIso: string;
  includePersonalNote: boolean;
  personalNote?: string;
  notebookTitle: string;
  ownerDisplayName: string;
}

export interface RenderedSocialCard {
  dataUrl: string;
  blob: Blob | null;
  width: number;
  height: number;
  signatureText: string;
}

/**
 * Compone localmente en HTML5 Canvas una lámina lista para compartir en Instagram o WhatsApp,
 * sin volver a invocar modelos generativos y garantizando cero metadatos EXIF o coordenadas privadas (F07, CA12, CA14).
 */
export async function composeSocialShareCard(options: SocialCardOptions): Promise<RenderedSocialCard> {
  const width = 1080;
  const height = options.format === 'historia_9_16' ? 1920 : 1350;
  const signatureText = `${options.notebookTitle} — ${options.ownerDisplayName || 'Valeria'}`;

  if (
    typeof document === 'undefined' ||
    (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent))
  ) {
    return {
      dataUrl: options.illustrationUrl,
      blob: null,
      width,
      height,
      signatureText,
    };
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return {
      dataUrl: options.illustrationUrl,
      blob: null,
      width,
      height,
      signatureText,
    };
  }

  const isWatercolor = options.style === 'acuarela_naturalista';

  // 1. Papel botánico artesanal de fondo
  ctx.fillStyle = isWatercolor ? '#F7F3E8' : '#F4F1EA';
  ctx.fillRect(0, 0, width, height);

  // Textura sutil de grano de papel y marco doble naturalista
  ctx.strokeStyle = isWatercolor ? '#C8BCA6' : '#B8B2A6';
  ctx.lineWidth = 3;
  ctx.strokeRect(46, 46, width - 92, height - 92);

  ctx.strokeStyle = isWatercolor ? '#3A5A40' : '#4A463F';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(60, 60, width - 120, height - 120);

  // Adorno botánico superior discreto
  ctx.fillStyle = isWatercolor ? '#3A5A40' : '#4A463F';
  ctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    isWatercolor ? '✦  CUADERNO DE CAMPO · LÁMINA EN ACUARELA  ✦' : '✦  CUADERNO DE CAMPO · APUNTE EN GRAFITO  ✦',
    width / 2,
    118
  );

  // 2. Cargar imagen de la ilustración artística
  const illustrationImg = await loadImageSafe(options.illustrationUrl);
  const isStory = options.format === 'historia_9_16';
  const artBoxSize = isStory ? 820 : 660;
  const artX = Math.round((width - artBoxSize) / 2);
  const artY = isStory ? 165 : 145;

  // Marco interior de la lámina
  ctx.fillStyle = '#FCF9F2';
  ctx.fillRect(artX - 16, artY - 16, artBoxSize + 32, artBoxSize + 32);
  ctx.strokeStyle = '#DDD3C0';
  ctx.lineWidth = 2;
  ctx.strokeRect(artX - 16, artY - 16, artBoxSize + 32, artBoxSize + 32);

  if (illustrationImg) {
    drawImageCover(ctx, illustrationImg, artX, artY, artBoxSize, artBoxSize);
  }

  // 3. Si la variante es 'ilustracion_y_foto', superponer la foto original en un recuadro estilo estampa/polaroid de campo
  if (options.variant === 'ilustracion_y_foto' && options.originalPhotoSanitizedUrl) {
    const origImg = await loadImageSafe(options.originalPhotoSanitizedUrl);
    if (origImg) {
      const stampW = isStory ? 290 : 240;
      const stampH = isStory ? 290 : 240;
      const stampX = artX + artBoxSize - stampW + 18;
      const stampY = artY + artBoxSize - stampH + 18;

      ctx.save();
      ctx.translate(stampX + stampW / 2, stampY + stampH / 2);
      ctx.rotate(-0.045);

      // Sombra suave del recuadro fotográfico
      ctx.fillStyle = 'rgba(42, 36, 33, 0.18)';
      ctx.fillRect(-stampW / 2 - 6, -stampH / 2 - 6, stampW + 28, stampH + 48);

      // Marco blanco cálido tipo polaroid de archivo
      ctx.fillStyle = '#FFFDF8';
      ctx.fillRect(-stampW / 2 - 12, -stampH / 2 - 12, stampW + 24, stampH + 44);
      ctx.strokeStyle = '#D5CBB8';
      ctx.lineWidth = 2;
      ctx.strokeRect(-stampW / 2 - 12, -stampH / 2 - 12, stampW + 24, stampH + 44);

      drawImageCover(ctx, origImg, -stampW / 2, -stampH / 2, stampW, stampH);

      ctx.fillStyle = '#5C5346';
      ctx.font = '600 22px "Caveat", cursive';
      ctx.textAlign = 'center';
      ctx.fillText('Mi registro original', 0, stampH / 2 + 22);
      ctx.restore();
    }
  }

  // 4. Tipografía editorial: Nombre común, nombre científico en cursiva y familia
  let cursorY = artY + artBoxSize + (isStory ? 95 : 75);

  ctx.fillStyle = '#2A2421';
  ctx.font = `700 ${isStory ? 68 : 56}px "Cormorant Garamond", Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillText(options.commonNameAr, width / 2, cursorY);

  cursorY += isStory ? 50 : 42;
  ctx.fillStyle = '#3A5A40';
  ctx.font = `italic 600 ${isStory ? 40 : 34}px "Cormorant Garamond", Georgia, serif`;
  ctx.fillText(options.scientificName, width / 2, cursorY);

  cursorY += isStory ? 40 : 34;
  ctx.fillStyle = '#7A6F5D';
  ctx.font = `500 ${isStory ? 24 : 21}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillText(options.family, width / 2, cursorY);

  // 5. Fecha opcional
  if (options.includeDate && options.observedAtIso) {
    cursorY += isStory ? 52 : 40;
    const formattedDate = formatShortArgentineDate(options.observedAtIso);
    ctx.fillStyle = '#5C5346';
    ctx.font = `500 ${isStory ? 26 : 22}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(`Observada el ${formattedDate}`, width / 2, cursorY);
  }

  // 6. Nota personal opcional elegida explícitamente por Valeria
  if (options.includePersonalNote && options.personalNote?.trim()) {
    cursorY += isStory ? 68 : 48;
    const cleanNote = `«${options.personalNote.trim().slice(0, 140)}»`;
    ctx.fillStyle = '#3B332B';
    ctx.font = `600 ${isStory ? 42 : 34}px "Caveat", cursive`;
    wrapTextCentered(ctx, cleanNote, width / 2, cursorY, width - 200, isStory ? 48 : 38);
  }

  // 7. Firma discreta inferior («Aves de mi jardín — Valeria»)
  const footerY = height - 92;
  ctx.strokeStyle = '#D8CEBE';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 180, footerY - 38);
  ctx.lineTo(width / 2 + 180, footerY - 38);
  ctx.stroke();

  ctx.fillStyle = '#4A4238';
  ctx.font = `600 ${isStory ? 34 : 30}px "Cormorant Garamond", Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillText(signatureText, width / 2, footerY);

  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), 'image/png');
    } catch {
      resolve(null);
    }
  });

  return {
    dataUrl,
    blob,
    width,
    height,
    signatureText,
  };
}

function loadImageSafe(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const imgRatio = (img.width || w) / (img.height || h);
  const boxRatio = w / h;
  let sx = 0;
  let sy = 0;
  let sw = img.width || w;
  let sh = img.height || h;

  if (imgRatio > boxRatio) {
    sw = (img.height || h) * boxRatio;
    sx = ((img.width || w) - sw) / 2;
  } else {
    sh = (img.width || w) / boxRatio;
    sy = ((img.height || h) - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function wrapTextCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  lineHeight: number
): void {
  const words = text.split(' ');
  let line = '';
  let y = startY;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line.trim()) {
    ctx.fillText(line.trim(), x, y);
  }
}

/**
 * Invoca la hoja nativa de compartir de Android (Web Share API Level 2) para enviar la imagen
 * a Instagram, WhatsApp u otras apps instaladas sin pedir credenciales (F07, CA12).
 */
export async function shareRenderedCardNativeOrDownload(
  rendered: RenderedSocialCard,
  commonNameAr: string
): Promise<{ method: 'native_share' | 'download'; message: string }> {
  const safeName = commonNameAr
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
  const fileName = `lamina-${safeName}-${Date.now()}.png`;

  if (
    rendered.blob &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'
  ) {
    try {
      const file = new File([rendered.blob], fileName, { type: 'image/png' });
      const shareData: ShareData = {
        title: `${commonNameAr} — ${rendered.signatureText}`,
        text: `${commonNameAr} registrada en mi cuaderno «${rendered.signatureText}»`,
        files: [file],
      };

      if (!navigator.canShare || navigator.canShare(shareData)) {
        await navigator.share(shareData);
        return {
          method: 'native_share',
          message: 'Se abrió la hoja de compartir de tu teléfono para enviar a Instagram, WhatsApp u otra app.',
        };
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { method: 'native_share', message: 'Envío cancelado.' };
      }
    }
  }

  // Fallback limpio cuando se prueba desde un navegador de escritorio o app que no soporta Web Share Level 2
  if (typeof document !== 'undefined') {
    const link = document.createElement('a');
    link.href = rendered.dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return {
    method: 'download',
    message:
      'Guardamos la lámina lista en tu dispositivo (sin datos privados ni EXIF) para que puedas subirla a Instagram o WhatsApp.',
  };
}
