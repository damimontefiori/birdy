import {
  ILLUSTRATION_STYLE_META,
  IllustrationStyle,
  ORGANISM_GROUP_META,
  OrganismGroup,
} from '../types/domain';
import { getProxiedImageUrl } from './speciesReferenceService';
import { formatShortArgentineDate } from './storageAndSyncService';

export type SocialShareVariant = 'solo_ilustracion' | 'ilustracion_y_foto';
export type SocialShareFormat = 'historia_9_16' | 'publicacion_4_5';

export interface SocialCardOptions {
  variant: SocialShareVariant;
  format: SocialShareFormat;
  style: IllustrationStyle;
  organismGroup?: OrganismGroup;
  commonNameAr: string;
  scientificName: string;
  family: string;
  quickSummary?: string;
  sizeLabel?: string;
  habitatTag?: string;
  dietTag?: string;
  ecologicalRole?: string;
  includeSpeciesInfo?: boolean;
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
 * Compone localmente en HTML5 Canvas una lámina editorial sin espacios vacíos
 * para Historia (9:16) y Publicación (4:5), lista para Instagram o WhatsApp
 * y garantizando cero metadatos EXIF ni coordenadas privadas.
 */
export async function composeSocialShareCard(
  options: SocialCardOptions
): Promise<RenderedSocialCard> {
  const width = 1080;
  const isStory = options.format === 'historia_9_16';
  const height = isStory ? 1920 : 1350;
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

  // Esperar carga de fuentes editoriales para que Cormorant/Caveat se dibujen nítidas
  if (document.fonts?.ready) {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 600)),
      ]);
    } catch {
      // Continuar con fuentes disponibles
    }
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

  const isMural = options.style === 'muralismo_fauna';
  const isWatercolor = options.style === 'acuarela_naturalista';
  const isGraphite = options.style === 'lapiz_grafito';
  const styleMeta = ILLUSTRATION_STYLE_META[options.style] || ILLUSTRATION_STYLE_META.muralismo_fauna;
  const accentColor = isMural ? '#1F5A54' : isWatercolor ? '#38573E' : '#4A463F';
  const paperBg = isMural ? '#F2EBDC' : isWatercolor ? '#F6F1E4' : '#F3F0E8';
  const insetBg = isMural ? '#E9E0CC' : isWatercolor ? '#ECE4D0' : '#E9E5DC';
  const borderSoft = isMural ? '#C4B395' : isWatercolor ? '#CFC2AA' : '#BEB7AA';

  // 1. Papel botánico artesanal + textura cálida
  ctx.fillStyle = paperBg;
  ctx.fillRect(0, 0, width, height);

  const bgGrad = ctx.createRadialGradient(
    width / 2,
    height * 0.38,
    120,
    width / 2,
    height * 0.5,
    height * 0.65
  );
  bgGrad.addColorStop(0, 'rgba(255, 253, 248, 0.45)');
  bgGrad.addColorStop(1, 'rgba(218, 205, 180, 0.28)');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Marco doble editorial con detalles de esquina
  drawBotanicalOuterFrame(ctx, width, height, borderSoft, accentColor);

  // Cabezal superior
  const groupMeta = options.organismGroup ? ORGANISM_GROUP_META[options.organismGroup] : null;
  ctx.fillStyle = accentColor;
  ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  const groupHeaderLabel = groupMeta ? groupMeta.label.toUpperCase() : 'CUADERNO VIVO';
  ctx.fillText(
    `✦   BIOMA · ${groupHeaderLabel} · ${styleMeta.cardHeaderTag}   ✦`,
    width / 2,
    isStory ? 96 : 82
  );

  // Cargar imágenes (si la lámina remota no permite exportación Canvas, usar foto alternativa limpia)
  let illustrationImg = await loadImageSafe(options.illustrationUrl);
  const hasRealPhoto =
    options.variant === 'ilustracion_y_foto' && Boolean(options.originalPhotoSanitizedUrl);
  const origImg = options.originalPhotoSanitizedUrl
    ? await loadImageSafe(options.originalPhotoSanitizedUrl)
    : null;
  if (!illustrationImg && origImg) {
    illustrationImg = origImg;
  }
  const photoForCard = hasRealPhoto ? origImg : null;

  const formattedDate =
    options.includeDate && options.observedAtIso
      ? formatShortArgentineDate(options.observedAtIso)
      : '';
  const showSpeciesInfo = options.includeSpeciesInfo !== false;
  const pills = [
    options.ecologicalRole,
    options.sizeLabel,
    options.habitatTag,
    options.dietTag,
  ].filter((v): v is string => Boolean(v && v.trim()));
  const noteText =
    options.includePersonalNote && options.personalNote?.trim()
      ? `«${options.personalNote.trim().slice(0, 130)}»`
      : '';
  const summaryText =
    showSpeciesInfo && options.quickSummary?.trim()
      ? options.quickSummary.trim()
      : '';

  if (isStory) {
    // =========================================================================
    // FORMATO HISTORIA / ESTADO 9:16 (1080 × 1920) — CERO ESPACIOS VACÍOS
    // =========================================================================
    if (photoForCard) {
      // Lámina protagónica gigante arriba (924 × 924)
      const artX = 78;
      const artY = 124;
      const artW = 924;
      const artH = 924;
      drawMattedArtwork(ctx, illustrationImg, artX, artY, artW, artH, isGraphite);

      // Bloque editorial de nombre
      ctx.textAlign = 'center';
      ctx.fillStyle = '#241F1B';
      ctx.font = '700 72px "Cormorant Garamond", Georgia, serif';
      ctx.fillText(fitText(ctx, options.commonNameAr, 920), width / 2, 1122);

      ctx.fillStyle = accentColor;
      ctx.font = 'italic 600 40px "Cormorant Garamond", Georgia, serif';
      ctx.fillText(options.scientificName, width / 2, 1172);

      ctx.fillStyle = '#756A58';
      ctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
      const subMeta = [options.family, formattedDate ? `Observada el ${formattedDate}` : '']
        .filter(Boolean)
        .join('  ·  ');
      ctx.fillText(fitText(ctx, subMeta, 920), width / 2, 1212);

      // Banda inferior dividida (1248..1764): Foto real en polaroid grande + Ficha naturalista
      const bandY = 1248;
      const bandH = 514;

      // Izquierda: Foto real tipo polaroid de archivo (440 × 514)
      const polX = 78;
      const polW = 440;
      drawArchivalPhotoCard(ctx, photoForCard, polX, bandY, polW, bandH, 'Mi fotografía real', formattedDate);

      // Derecha: Ficha botánica con resumen, datos clave y nota personal (460 × 514)
      const cardX = 542;
      const cardW = 460;
      drawRoundedRect(ctx, cardX, bandY, cardW, bandH, 20, insetBg, borderSoft, 2);
      ctx.fillStyle = accentColor;
      ctx.fillRect(cardX, bandY + 26, 7, bandH - 52);

      let cy = bandY + 46;
      const padX = cardX + 28;
      const innerW = cardW - 48;

      ctx.textAlign = 'left';
      ctx.fillStyle = accentColor;
      ctx.font = '700 19px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('FICHA NATURALISTA', padX, cy);
      cy += 34;

      if (summaryText) {
        ctx.fillStyle = '#2B251F';
        ctx.font = '500 25px "Plus Jakarta Sans", sans-serif';
        cy = wrapTextLeft(ctx, summaryText, padX, cy, innerW, 34, 5);
        cy += 16;
      }

      if (pills.length > 0) {
        for (const pill of pills.slice(0, 3)) {
          if (cy + 46 > bandY + bandH - (noteText ? 110 : 24)) break;
          drawPillLeft(ctx, pill, padX, cy, innerW, '#FCF9F2', borderSoft, '#3D352C');
          cy += 50;
        }
      }

      if (noteText) {
        const noteY = Math.max(cy + 14, bandY + bandH - 102);
        ctx.fillStyle = '#383028';
        ctx.font = '600 32px "Caveat", cursive';
        wrapTextLeft(ctx, noteText, padX, noteY, innerW, 36, 3);
      } else if (!summaryText && pills.length === 0) {
        ctx.fillStyle = '#5A5144';
        ctx.font = '500 24px "Plus Jakarta Sans", sans-serif';
        wrapTextLeft(
          ctx,
          `Registro incorporado al cuaderno «${options.notebookTitle}».`,
          padX,
          cy + 8,
          innerW,
          34,
          4
        );
      }
    } else {
      // SOLO ILUSTRACIÓN en 9:16: Lámina vertical monumental (936 × 1100) + Ficha completa abajo
      const artX = 72;
      const artY = 124;
      const artW = 936;
      const artH = 1100;
      drawMattedArtwork(ctx, illustrationImg, artX, artY, artW, artH, isGraphite);

      // Bloque editorial de título
      ctx.textAlign = 'center';
      ctx.fillStyle = '#241F1B';
      ctx.font = '700 78px "Cormorant Garamond", Georgia, serif';
      ctx.fillText(fitText(ctx, options.commonNameAr, 930), width / 2, 1300);

      ctx.fillStyle = accentColor;
      ctx.font = 'italic 600 42px "Cormorant Garamond", Georgia, serif';
      ctx.fillText(options.scientificName, width / 2, 1354);

      ctx.fillStyle = '#756A58';
      ctx.font = '600 23px "Plus Jakarta Sans", sans-serif';
      const subMeta = [options.family, formattedDate ? `Observada el ${formattedDate}` : '']
        .filter(Boolean)
        .join('  ·  ');
      ctx.fillText(fitText(ctx, subMeta, 930), width / 2, 1396);

      // Panel inferior ancho completo (1430..1764, h=334)
      const panelX = 72;
      const panelY = 1430;
      const panelW = 936;
      const panelH = 334;
      drawRoundedRect(ctx, panelX, panelY, panelW, panelH, 22, insetBg, borderSoft, 2);

      let cy = panelY + 52;
      if (summaryText) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#2B251F';
        ctx.font = '500 28px "Plus Jakarta Sans", sans-serif';
        cy = wrapTextCentered(ctx, summaryText, width / 2, cy, panelW - 88, 38, 3);
        cy += 18;
      }

      if (pills.length > 0) {
        drawCenteredPillsRow(ctx, pills.slice(0, 3), width / 2, cy, panelW - 60, '#FCF9F2', borderSoft, '#3D352C');
        cy += 64;
      }

      if (noteText) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#383028';
        ctx.font = '600 40px "Caveat", cursive';
        wrapTextCentered(ctx, noteText, width / 2, Math.min(cy + 14, panelY + panelH - 58), panelW - 96, 42, 2);
      } else if (!summaryText && pills.length === 0) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#5A5144';
        ctx.font = '600 38px "Caveat", cursive';
        ctx.fillText(
          `Descubierta en «${options.notebookTitle}»`,
          width / 2,
          panelY + panelH / 2 + 12
        );
      }
    }

    // Firma editorial al pie (1800..1860)
    drawFooterSignature(ctx, width, 1838, borderSoft, signatureText, 34);
  } else {
    // =========================================================================
    // FORMATO PUBLICACIÓN / FEED 4:5 (1080 × 1350) — EQUILIBRIO EDITORIAL TOTAL
    // =========================================================================
    if (photoForCard) {
      // Díptico superior (106..826): Lámina grande a la izquierda + Foto real y datos a la derecha
      const topY = 106;
      const diptychH = 716;
      const leftW = 588;
      drawMattedArtwork(ctx, illustrationImg, 66, topY, leftW, diptychH, isGraphite);

      const rightX = 678;
      const rightW = 336;
      const photoCardH = 398;
      drawArchivalPhotoCard(ctx, photoForCard, rightX, topY, rightW, photoCardH, 'Mi foto real', formattedDate);

      // Tarjeta de datos clave bajo la foto real (522..822)
      const metaY = topY + photoCardH + 18;
      const metaH = diptychH - photoCardH - 18;
      drawRoundedRect(ctx, rightX, metaY, rightW, metaH, 18, insetBg, borderSoft, 2);

      let my = metaY + 38;
      ctx.textAlign = 'left';
      ctx.fillStyle = accentColor;
      ctx.font = '700 17px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('DATOS DE CAMPO', rightX + 20, my);
      my += 26;

      if (pills.length > 0) {
        for (const pill of pills.slice(0, 3)) {
          if (my + 44 > metaY + metaH - 12) break;
          drawPillLeft(ctx, pill, rightX + 18, my, rightW - 36, '#FCF9F2', borderSoft, '#3D352C', 18);
          my += 46;
        }
      } else {
        ctx.fillStyle = '#5A5144';
        ctx.font = '500 20px "Plus Jakarta Sans", sans-serif';
        wrapTextLeft(ctx, options.family, rightX + 20, my + 12, rightW - 40, 28, 3);
      }

      if (formattedDate && my + 24 <= metaY + metaH - 8) {
        ctx.fillStyle = '#6A5F4E';
        ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(`📅 ${formattedDate}`, rightX + 20, metaY + metaH - 22);
      }

      // Banda inferior editorial: Título + Resumen / Nota (850..1234)
      ctx.textAlign = 'center';
      ctx.fillStyle = '#241F1B';
      ctx.font = '700 62px "Cormorant Garamond", Georgia, serif';
      ctx.fillText(fitText(ctx, options.commonNameAr, 940), width / 2, 902);

      ctx.fillStyle = accentColor;
      ctx.font = 'italic 600 34px "Cormorant Garamond", Georgia, serif';
      ctx.fillText(`${options.scientificName}  ·  ${options.family.split(' ')[0]}`, width / 2, 946);

      const stripY = 974;
      const stripH = 248;
      drawRoundedRect(ctx, 66, stripY, 948, stripH, 20, insetBg, borderSoft, 2);

      let sy = stripY + 46;
      if (summaryText) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#2B251F';
        ctx.font = '500 25px "Plus Jakarta Sans", sans-serif';
        sy = wrapTextCentered(ctx, summaryText, width / 2, sy, 876, 35, 3);
      }
      if (noteText) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#383028';
        ctx.font = '600 36px "Caveat", cursive';
        wrapTextCentered(
          ctx,
          noteText,
          width / 2,
          summaryText ? Math.min(sy + 22, stripY + stripH - 54) : stripY + 95,
          876,
          40,
          2
        );
      } else if (!summaryText) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#5A5144';
        ctx.font = '600 34px "Caveat", cursive';
        ctx.fillText(
          `Avistamiento registrado en «${options.notebookTitle}»`,
          width / 2,
          stripY + stripH / 2 + 12
        );
      }
    } else {
      // SOLO ILUSTRACIÓN en 4:5: Gran lámina (948 × 764) + Título + Ficha compacta
      drawMattedArtwork(ctx, illustrationImg, 66, 106, 948, 764, isGraphite);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#241F1B';
      ctx.font = '700 64px "Cormorant Garamond", Georgia, serif';
      ctx.fillText(fitText(ctx, options.commonNameAr, 940), width / 2, 938);

      ctx.fillStyle = accentColor;
      ctx.font = 'italic 600 36px "Cormorant Garamond", Georgia, serif';
      ctx.fillText(options.scientificName, width / 2, 982);

      const stripY = 1006;
      const stripH = 216;
      drawRoundedRect(ctx, 66, stripY, 948, stripH, 20, insetBg, borderSoft, 2);

      let sy = stripY + 46;
      if (summaryText) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#2B251F';
        ctx.font = '500 24px "Plus Jakarta Sans", sans-serif';
        sy = wrapTextCentered(ctx, summaryText, width / 2, sy, 876, 33, 2);
        sy += 10;
      }

      const rowPills = [...pills.slice(0, 2), formattedDate ? `📅 ${formattedDate}` : ''].filter(
        Boolean
      );
      if (rowPills.length > 0) {
        drawCenteredPillsRow(ctx, rowPills, width / 2, sy, 890, '#FCF9F2', borderSoft, '#3D352C');
        sy += 56;
      }

      if (noteText) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#383028';
        ctx.font = '600 34px "Caveat", cursive';
        wrapTextCentered(ctx, noteText, width / 2, Math.min(sy + 8, stripY + stripH - 24), 876, 36, 1);
      }
    }

    drawFooterSignature(ctx, width, 1286, borderSoft, signatureText, 30);
  }

  let dataUrl = options.illustrationUrl;
  let blob: Blob | null = null;
  try {
    dataUrl = canvas.toDataURL('image/png');
    blob = await new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob((b) => resolve(b), 'image/png');
      } catch {
        resolve(null);
      }
    });
  } catch {
    // Fallback seguro si el navegador restringiera exportación
  }

  return {
    dataUrl,
    blob,
    width,
    height,
    signatureText,
  };
}

function drawBotanicalOuterFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  borderSoft: string,
  accentColor: string
): void {
  ctx.strokeStyle = borderSoft;
  ctx.lineWidth = 3;
  ctx.strokeRect(32, 32, width - 64, height - 64);

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(46, 46, width - 92, height - 92);

  // Pequeños remates de esquina estilo herbario
  const corners = [
    [46, 46, 1, 1],
    [width - 46, 46, -1, 1],
    [46, height - 46, 1, -1],
    [width - 46, height - 46, -1, -1],
  ];
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 3;
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + dy * 28);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dx * 28, cy);
    ctx.stroke();
  }
}

function drawMattedArtwork(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number,
  isGraphite: boolean
): void {
  // Sombra suave del paspartú
  ctx.save();
  ctx.fillStyle = 'rgba(42, 36, 28, 0.10)';
  ctx.fillRect(x - 4, y + 6, w + 12, h + 10);

  // Paspartú cálido
  ctx.fillStyle = '#FFFDF8';
  ctx.fillRect(x - 10, y - 10, w + 20, h + 20);
  ctx.strokeStyle = '#D8CCB6';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 10, y - 10, w + 20, h + 20);

  if (img) {
    if (isGraphite) {
      ctx.filter = 'grayscale(0.88) contrast(1.06) sepia(0.12)';
    }
    drawImageCover(ctx, img, x, y, w, h);
    ctx.filter = 'none';
  } else {
    ctx.fillStyle = '#EFE8D5';
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

function drawArchivalPhotoCard(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  caption: string,
  subCaption?: string
): void {
  ctx.save();
  // Sombra suave
  ctx.fillStyle = 'rgba(42, 36, 28, 0.14)';
  drawRoundedRect(ctx, x + 5, y + 7, w, h, 14, 'rgba(42, 36, 28, 0.13)');

  // Marco tipo postal fotográfica
  drawRoundedRect(ctx, x, y, w, h, 14, '#FFFDF9', '#D6CBB6', 2);

  const pad = 16;
  const footerSpace = subCaption ? 86 : 64;
  const imgW = w - pad * 2;
  const imgH = h - pad - footerSpace;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + pad, y + pad, imgW, imgH, 8);
  ctx.clip();
  drawImageCover(ctx, img, x + pad, y + pad, imgW, imgH);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#3B332B';
  ctx.font = '600 32px "Caveat", cursive';
  ctx.fillText(caption, x + w / 2, y + pad + imgH + 40);

  if (subCaption) {
    ctx.fillStyle = '#7A6F5D';
    ctx.font = '500 18px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(subCaption, x + w / 2, y + pad + imgH + 68);
  }
  ctx.restore();
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  stroke?: string,
  lineWidth = 1.5
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawPillLeft(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  bg: string,
  border: string,
  color: string,
  fontSize = 20
): void {
  ctx.font = `600 ${fontSize}px "Plus Jakarta Sans", sans-serif`;
  const fitted = fitText(ctx, text, maxWidth - 28);
  const measured = ctx.measureText(fitted).width;
  const pillW = Math.min(maxWidth, measured + 28);
  const pillH = 38;
  drawRoundedRect(ctx, x, y, pillW, pillH, 19, bg, border, 1.5);
  ctx.textAlign = 'left';
  ctx.fillStyle = color;
  ctx.fillText(fitted, x + 14, y + 26);
}

function drawCenteredPillsRow(
  ctx: CanvasRenderingContext2D,
  pills: string[],
  centerX: number,
  y: number,
  maxRowW: number,
  bg: string,
  border: string,
  color: string
): void {
  ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
  const gap = 12;
  const items = pills.map((p) => {
    const fitted = fitText(ctx, p, 290);
    const w = ctx.measureText(fitted).width + 30;
    return { text: fitted, w };
  });

  // Ajustar si la fila excede maxRowW
  let totalW = items.reduce((acc, it) => acc + it.w, 0) + gap * Math.max(0, items.length - 1);
  while (items.length > 1 && totalW > maxRowW) {
    items.pop();
    totalW = items.reduce((acc, it) => acc + it.w, 0) + gap * Math.max(0, items.length - 1);
  }

  let cursorX = centerX - totalW / 2;
  for (const it of items) {
    drawRoundedRect(ctx, cursorX, y, it.w, 40, 20, bg, border, 1.5);
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(it.text, cursorX + it.w / 2, y + 27);
    cursorX += it.w + gap;
  }
}

function drawFooterSignature(
  ctx: CanvasRenderingContext2D,
  width: number,
  footerY: number,
  borderSoft: string,
  signatureText: string,
  fontSize: number
): void {
  ctx.strokeStyle = borderSoft;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 220, footerY - 40);
  ctx.lineTo(width / 2 + 220, footerY - 40);
  ctx.stroke();

  ctx.fillStyle = '#4A4238';
  ctx.font = `600 ${fontSize}px "Cormorant Garamond", Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillText(fitText(ctx, signatureText, width - 160), width / 2, footerY);
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 3 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

async function loadImageSafe(url: string): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined' || !url) return null;

  const tryLoad = (src: string, useCors: boolean): Promise<HTMLImageElement | null> =>
    new Promise((resolve) => {
      const img = new Image();
      if (useCors) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });

  // Para imágenes remotas HTTPS, ir directo por nuestro proxy seguro (evita errores CORS en consola y tainting en Canvas)
  if (/^https:\/\//i.test(url)) {
    const proxied = await tryLoad(getProxiedImageUrl(url), true);
    if (proxied) return proxied;
    return null;
  }

  return tryLoad(url, true);
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
  lineHeight: number,
  maxLines = 4
): number {
  const words = text.split(/\s+/);
  let line = '';
  let y = startY;
  let linesDrawn = 0;

  for (let n = 0; n < words.length; n++) {
    const testLine = line ? `${line} ${words[n]}` : words[n];
    if (ctx.measureText(testLine).width > maxWidth && line) {
      linesDrawn += 1;
      if (linesDrawn >= maxLines) {
        ctx.fillText(fitText(ctx, `${line} ${words[n]}`, maxWidth), x, y);
        return y + lineHeight;
      }
      ctx.fillText(line, x, y);
      line = words[n];
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

function wrapTextLeft(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 5
): number {
  const words = text.split(/\s+/);
  let line = '';
  let y = startY;
  let linesDrawn = 0;

  for (let n = 0; n < words.length; n++) {
    const testLine = line ? `${line} ${words[n]}` : words[n];
    if (ctx.measureText(testLine).width > maxWidth && line) {
      linesDrawn += 1;
      if (linesDrawn >= maxLines) {
        ctx.fillText(fitText(ctx, `${line} ${words[n]}`, maxWidth), x, y);
        return y + lineHeight;
      }
      ctx.fillText(line, x, y);
      line = words[n];
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

/**
 * Invoca la hoja nativa de compartir de Android (Web Share API Level 2) para enviar la imagen
 * a Instagram, WhatsApp u otras apps instaladas sin pedir credenciales.
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
          message: 'Se abrió la hoja de compartir de tu teléfono para enviar a Instagram o WhatsApp.',
        };
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { method: 'native_share', message: 'Envío cancelado.' };
      }
    }
  }

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
      'Guardamos la lámina lista en tu dispositivo (sin datos privados ni EXIF) para compartirla en Instagram o WhatsApp.',
  };
}
