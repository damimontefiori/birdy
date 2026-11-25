import {
  GardenEcologyInfo,
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
  coexistenceNote?: string;
  gardenEcology?: GardenEcologyInfo;
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

interface LabeledFact {
  label: string;
  value: string;
}

/**
 * Compone localmente en HTML5 Canvas una lámina editorial sin textos cortados ni espacios vacíos
 * para Historia (9:16) y Publicación (4:5), lista para Instagram o WhatsApp,
 * conservando intacto el protagonismo de las imágenes y garantizando cero metadatos EXIF.
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
  const softCardBg = '#FAF6EC';
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
  const noteText =
    options.includePersonalNote && options.personalNote?.trim()
      ? `«${options.personalNote.trim().slice(0, 150)}»`
      : '';
  const summaryText =
    showSpeciesInfo && options.quickSummary?.trim()
      ? options.quickSummary.trim()
      : '';

  const fieldFacts: LabeledFact[] = showSpeciesInfo
    ? [
        options.ecologicalRole?.trim()
          ? { label: 'ROL EN EL JARDÍN', value: options.ecologicalRole.trim() }
          : null,
        options.sizeLabel?.trim()
          ? { label: 'TAMAÑO', value: options.sizeLabel.trim() }
          : null,
        options.habitatTag?.trim()
          ? { label: 'HÁBITAT', value: options.habitatTag.trim() }
          : null,
      ].filter((item): item is LabeledFact => item !== null)
    : [];

  // Datos valiosos de ecología de jardín (flores, frutales, dieta/insectos)
  const gardenSeeks = options.gardenEcology?.seeksInGarden?.trim() || '';
  const gardenFlowers = options.gardenEcology?.preferredFlowers?.trim() || '';
  const gardenTrees = options.gardenEcology?.preferredFruitTrees?.trim() || '';
  const gardenFood =
    options.gardenEcology?.insectsOrFoodEaten?.trim() || options.dietTag?.trim() || '';
  const coexistenceText = options.coexistenceNote?.trim() || '';

  const gardenHighlightFacts: LabeledFact[] = showSpeciesInfo
    ? [
        gardenSeeks ? { label: 'QUÉ BUSCA EN TU JARDÍN', value: gardenSeeks } : null,
        gardenFlowers ? { label: 'FLORES Y PLANTAS', value: gardenFlowers } : null,
        gardenTrees ? { label: 'FRUTALES Y ÁRBOLES', value: gardenTrees } : null,
        gardenFood ? { label: 'QUÉ COME', value: gardenFood } : null,
      ].filter((item): item is LabeledFact => item !== null)
    : [];

  if (isStory) {
    // =========================================================================
    // FORMATO HISTORIA / ESTADO 9:16 (1080 × 1920)
    // Conserva exactamente los tamaños de lámina (924×924) y foto real (440×514)
    // =========================================================================
    if (photoForCard) {
      // Lámina protagónica gigante arriba (924 × 924) — tamaño preservado intacto
      const artX = 78;
      const artY = 124;
      const artW = 924;
      const artH = 924;
      drawMattedArtwork(ctx, illustrationImg, artX, artY, artW, artH, isGraphite);

      // Bloque editorial de nombre (ajusta tipografía automáticamente para nunca cortar el título con "…")
      ctx.textAlign = 'center';
      ctx.fillStyle = '#241F1B';
      drawFittedSerifHeading(ctx, options.commonNameAr, width / 2, 1122, 920, 72, 44);

      ctx.fillStyle = accentColor;
      ctx.font = 'italic 600 40px "Cormorant Garamond", Georgia, serif';
      ctx.fillText(options.scientificName, width / 2, 1172);

      ctx.fillStyle = '#756A58';
      ctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
      const subMeta = [options.family, formattedDate ? `Observada el ${formattedDate}` : '']
        .filter(Boolean)
        .join('  ·  ');
      ctx.fillText(fitText(ctx, subMeta, 920), width / 2, 1212);

      // Banda inferior dividida (1248..1762): Foto real en polaroid grande + Ficha naturalista
      const bandY = 1248;
      const bandH = 514;

      // Izquierda: Foto real tipo polaroid de archivo (440 × 514) — tamaño preservado intacto
      const polX = 78;
      const polW = 440;
      drawArchivalPhotoCard(
        ctx,
        photoForCard,
        polX,
        bandY,
        polW,
        bandH,
        'Mi fotografía real',
        formattedDate
      );

      // Derecha: Ficha naturalista adaptativa (460 × 514) — CERO textos cortados
      const cardX = 542;
      const cardW = 460;
      drawRoundedRect(ctx, cardX, bandY, cardW, bandH, 20, insetBg, borderSoft, 2);
      ctx.fillStyle = accentColor;
      ctx.fillRect(cardX, bandY + 26, 7, bandH - 52);

      // Cuando NO se incluye nota personal, aprovechamos el espacio libre para mostrar
      // qué viene a buscar al jardín (flores, frutales y alimentación).
      const storyFacts: LabeledFact[] = [...fieldFacts];
      if (!noteText && showSpeciesInfo) {
        if (gardenFlowers) {
          storyFacts.push({ label: 'FLORES / PLANTAS', value: gardenFlowers });
        } else if (gardenSeeks) {
          storyFacts.push({ label: 'QUÉ BUSCA EN EL JARDÍN', value: gardenSeeks });
        }
        if (gardenFood) {
          storyFacts.push({ label: 'ALIMENTACIÓN', value: gardenFood });
        } else if (gardenTrees) {
          storyFacts.push({ label: 'ÁRBOLES / FRUTALES', value: gardenTrees });
        }
      } else if (noteText && showSpeciesInfo && storyFacts.length < 3 && gardenFood) {
        storyFacts.push({ label: 'ALIMENTACIÓN', value: gardenFood });
      }

      drawAdaptiveNaturalistPanel(ctx, {
        x: cardX + 24,
        y: bandY + 22,
        w: cardW - 42,
        h: bandH - 40,
        header: 'FICHA NATURALISTA',
        summary: summaryText,
        facts: storyFacts,
        noteText,
        fallbackText: `Registro incorporado al cuaderno «${options.notebookTitle}».`,
        accentColor,
        cardBg: softCardBg,
        borderSoft,
      });
    } else {
      // SOLO ILUSTRACIÓN en 9:16: Lámina vertical monumental (936 × 1100) — tamaño preservado intacto
      const artX = 72;
      const artY = 124;
      const artW = 936;
      const artH = 1100;
      drawMattedArtwork(ctx, illustrationImg, artX, artY, artW, artH, isGraphite);

      // Bloque editorial de título
      ctx.textAlign = 'center';
      ctx.fillStyle = '#241F1B';
      drawFittedSerifHeading(ctx, options.commonNameAr, width / 2, 1300, 930, 78, 46);

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

      const bottomFacts: LabeledFact[] = !noteText
        ? [
            ...(fieldFacts.slice(0, 2)),
            ...(gardenHighlightFacts.slice(0, 2)),
          ].slice(0, 4)
        : fieldFacts.slice(0, 3);

      drawAdaptiveWideStripPanel(ctx, {
        x: panelX + 26,
        y: panelY + 20,
        w: panelW - 52,
        h: panelH - 36,
        summary: summaryText,
        facts: bottomFacts,
        noteText,
        fallbackText: `Descubierta en «${options.notebookTitle}»`,
        accentColor,
        cardBg: softCardBg,
        borderSoft,
      });
    }

    // Firma editorial al pie (1800..1860)
    drawFooterSignature(ctx, width, 1838, borderSoft, signatureText, 34);
  } else {
    // =========================================================================
    // FORMATO PUBLICACIÓN / FEED 4:5 (1080 × 1350)
    // Conserva exactamente los tamaños de lámina (588×716) y foto real (336×398)
    // =========================================================================
    if (photoForCard) {
      // Díptico superior (106..822): Lámina grande a la izquierda + Foto real y datos a la derecha
      const topY = 106;
      const diptychH = 716;
      const leftW = 588;
      drawMattedArtwork(ctx, illustrationImg, 66, topY, leftW, diptychH, isGraphite);

      const rightX = 678;
      const rightW = 336;
      const photoCardH = 398;
      drawArchivalPhotoCard(
        ctx,
        photoForCard,
        rightX,
        topY,
        rightW,
        photoCardH,
        'Mi foto real',
        formattedDate
      );

      // Tarjeta DATOS DE CAMPO bajo la foto real (522..822, 336×300) — CERO textos cortados
      const metaY = topY + photoCardH + 18;
      const metaH = diptychH - photoCardH - 18;
      drawRoundedRect(ctx, rightX, metaY, rightW, metaH, 18, insetBg, borderSoft, 2);

      // La fecha ya figura arriba bajo "Mi foto real", así que dedicamos los 300px íntegros
      // a mostrar Rol, Tamaño y Hábitat completos en múltiples líneas sin recorte "…".
      const feedFieldFacts: LabeledFact[] =
        fieldFacts.length > 0
          ? fieldFacts
          : [
              { label: 'FAMILIA', value: options.family },
              ...(formattedDate ? [{ label: 'FECHA', value: formattedDate }] : []),
            ];

      drawAdaptiveNaturalistPanel(ctx, {
        x: rightX + 16,
        y: metaY + 16,
        w: rightW - 32,
        h: metaH - 28,
        header: 'DATOS DE CAMPO',
        summary: '',
        facts: feedFieldFacts,
        noteText: '',
        fallbackText: options.family,
        accentColor,
        cardBg: softCardBg,
        borderSoft,
        compact: true,
      });

      // Banda inferior editorial: Título + Resumen / Jardín / Nota (850..1222)
      ctx.textAlign = 'center';
      ctx.fillStyle = '#241F1B';
      drawFittedSerifHeading(ctx, options.commonNameAr, width / 2, 902, 940, 62, 40);

      ctx.fillStyle = accentColor;
      ctx.font = 'italic 600 34px "Cormorant Garamond", Georgia, serif';
      ctx.fillText(`${options.scientificName}  ·  ${options.family.split(' ')[0]}`, width / 2, 946);

      const stripY = 974;
      const stripH = 248;
      drawRoundedRect(ctx, 66, stripY, 948, stripH, 20, insetBg, borderSoft, 2);

      // Si NO se selecciona "Incluir mi nota", llenamos el espacio con información valiosa
      // de qué viene a buscar al jardín (flores, frutales y dieta/insectos).
      const feedBottomFacts: LabeledFact[] = !noteText && showSpeciesInfo
        ? [
            gardenFlowers
              ? { label: 'FLORES Y PLANTAS', value: gardenFlowers }
              : gardenSeeks
                ? { label: 'QUÉ BUSCA EN TU JARDÍN', value: gardenSeeks }
                : null,
            gardenFood
              ? { label: 'QUÉ COME', value: gardenFood }
              : gardenTrees
                ? { label: 'FRUTALES Y ÁRBOLES', value: gardenTrees }
                : coexistenceText
                  ? { label: 'CONVIVENCIA', value: coexistenceText }
                  : null,
          ].filter((item): item is LabeledFact => item !== null)
        : noteText && showSpeciesInfo && gardenSeeks
          ? [{ label: 'EN TU JARDÍN', value: gardenSeeks }]
          : [];

      drawAdaptiveWideStripPanel(ctx, {
        x: 90,
        y: stripY + 18,
        w: 900,
        h: stripH - 32,
        summary: summaryText,
        facts: feedBottomFacts,
        noteText,
        fallbackText: `Avistamiento registrado en «${options.notebookTitle}»`,
        accentColor,
        cardBg: softCardBg,
        borderSoft,
      });
    } else {
      // SOLO ILUSTRACIÓN en 4:5: Gran lámina (948 × 764) — tamaño preservado intacto
      drawMattedArtwork(ctx, illustrationImg, 66, 106, 948, 764, isGraphite);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#241F1B';
      drawFittedSerifHeading(ctx, options.commonNameAr, width / 2, 938, 940, 64, 42);

      ctx.fillStyle = accentColor;
      ctx.font = 'italic 600 36px "Cormorant Garamond", Georgia, serif';
      const subSolo = [options.scientificName, formattedDate].filter(Boolean).join('  ·  ');
      ctx.fillText(fitText(ctx, subSolo, 940), width / 2, 982);

      const stripY = 1006;
      const stripH = 216;
      drawRoundedRect(ctx, 66, stripY, 948, stripH, 20, insetBg, borderSoft, 2);

      const soloFeedFacts: LabeledFact[] = !noteText && showSpeciesInfo
        ? [
            ...(fieldFacts.slice(0, 1)),
            gardenFlowers
              ? { label: 'FLORES Y PLANTAS', value: gardenFlowers }
              : gardenSeeks
                ? { label: 'QUÉ BUSCA EN TU JARDÍN', value: gardenSeeks }
                : fieldFacts[1] || null,
            gardenFood
              ? { label: 'QUÉ COME', value: gardenFood }
              : fieldFacts[2] || null,
          ].filter((item): item is LabeledFact => item !== null).slice(0, 3)
        : fieldFacts.slice(0, 2);

      drawAdaptiveWideStripPanel(ctx, {
        x: 90,
        y: stripY + 16,
        w: 900,
        h: stripH - 28,
        summary: summaryText,
        facts: soloFeedFacts,
        noteText,
        fallbackText: `Avistamiento registrado en «${options.notebookTitle}»`,
        accentColor,
        cardBg: softCardBg,
        borderSoft,
      });
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

/**
 * Dibuja un panel vertical estructurado (FICHA NATURALISTA / DATOS DE CAMPO)
 * ajustando automáticamente la escala tipográfica para que el 100% del texto
 * se lea completo en múltiples líneas sin truncamiento con "…".
 */
function drawAdaptiveNaturalistPanel(
  ctx: CanvasRenderingContext2D,
  cfg: {
    x: number;
    y: number;
    w: number;
    h: number;
    header: string;
    summary: string;
    facts: LabeledFact[];
    noteText: string;
    fallbackText: string;
    accentColor: string;
    cardBg: string;
    borderSoft: string;
    compact?: boolean;
  }
): void {
  const baseSummaryPx = cfg.compact ? 20 : 22;
  const baseFactPx = cfg.compact ? 17.5 : 18.5;
  const baseLabelPx = cfg.compact ? 12 : 12.5;
  const baseNotePx = cfg.compact ? 26 : 30;
  const headerPx = cfg.compact ? 16 : 18;

  const scales = [1.0, 0.94, 0.88, 0.82, 0.76, 0.71, 0.66];

  type MeasuredLayout = {
    scale: number;
    summaryLines: string[];
    factBlocks: Array<{ label: string; lines: string[]; boxH: number }>;
    noteLines: string[];
    summaryPx: number;
    summaryLH: number;
    factPx: number;
    factLH: number;
    labelPx: number;
    notePx: number;
    noteLH: number;
    cardPadY: number;
    cardGap: number;
    sectionGap: number;
    totalH: number;
  };

  const measureAtScale = (scale: number): MeasuredLayout => {
    const summaryPx = Math.max(14, Math.round(baseSummaryPx * scale * 10) / 10);
    const summaryLH = Math.round(summaryPx * 1.32);
    const factPx = Math.max(12.5, Math.round(baseFactPx * scale * 10) / 10);
    const factLH = Math.round(factPx * 1.28);
    const labelPx = Math.max(10, Math.round(baseLabelPx * scale * 10) / 10);
    const notePx = Math.max(20, Math.round(baseNotePx * scale * 10) / 10);
    const noteLH = Math.round(notePx * 1.15);
    const cardPadX = cfg.compact ? 12 : 14;
    const cardPadY = Math.max(6, Math.round((cfg.compact ? 8 : 9) * scale));
    const cardGap = Math.max(6, Math.round((cfg.compact ? 8 : 9) * scale));
    const sectionGap = Math.max(8, Math.round(12 * scale));

    let totalH = headerPx + sectionGap;

    let summaryLines: string[] = [];
    if (cfg.summary) {
      ctx.font = `500 ${summaryPx}px "Plus Jakarta Sans", sans-serif`;
      summaryLines = breakLines(ctx, cfg.summary, cfg.w);
      totalH += summaryLines.length * summaryLH + sectionGap;
    }

    const factBlocks: Array<{ label: string; lines: string[]; boxH: number }> = [];
    if (cfg.facts.length > 0) {
      ctx.font = `500 ${factPx}px "Plus Jakarta Sans", sans-serif`;
      for (const f of cfg.facts) {
        const lines = breakLines(ctx, f.value, cfg.w - cardPadX * 2);
        const boxH = cardPadY * 2 + labelPx + 4 + lines.length * factLH;
        factBlocks.push({ label: f.label, lines, boxH });
        totalH += boxH + cardGap;
      }
      totalH -= cardGap; // quitar último gap
    }

    let noteLines: string[] = [];
    if (cfg.noteText) {
      ctx.font = `600 ${notePx}px "Caveat", cursive`;
      noteLines = breakLines(ctx, cfg.noteText, cfg.w);
      totalH += sectionGap + 4 + noteLines.length * noteLH;
    }

    return {
      scale,
      summaryLines,
      factBlocks,
      noteLines,
      summaryPx,
      summaryLH,
      factPx,
      factLH,
      labelPx,
      notePx,
      noteLH,
      cardPadY,
      cardGap,
      sectionGap,
      totalH,
    };
  };

  let chosen = measureAtScale(scales[scales.length - 1]);
  for (const s of scales) {
    const measured = measureAtScale(s);
    if (measured.totalH <= cfg.h) {
      chosen = measured;
      break;
    }
  }

  let cy = cfg.y;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // Encabezado
  ctx.fillStyle = cfg.accentColor;
  ctx.font = `700 ${headerPx}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillText(cfg.header, cfg.x, cy);
  cy += headerPx + chosen.sectionGap;

  // Caso sin contenido
  if (!cfg.summary && cfg.facts.length === 0 && !cfg.noteText) {
    ctx.fillStyle = '#5A5144';
    ctx.font = '500 20px "Plus Jakarta Sans", sans-serif';
    const lines = breakLines(ctx, cfg.fallbackText, cfg.w);
    for (const line of lines) {
      ctx.fillText(line, cfg.x, cy);
      cy += 28;
    }
    ctx.textBaseline = 'alphabetic';
    return;
  }

  // Resumen breve completo
  if (chosen.summaryLines.length > 0) {
    ctx.fillStyle = '#2B251F';
    ctx.font = `500 ${chosen.summaryPx}px "Plus Jakarta Sans", sans-serif`;
    for (const line of chosen.summaryLines) {
      ctx.fillText(line, cfg.x, cy);
      cy += chosen.summaryLH;
    }
    cy += chosen.sectionGap;
  }

  // Tarjetas multi-línea con etiqueta y valor completo (NUNCA cortado)
  const cardPadX = cfg.compact ? 12 : 14;
  for (const fb of chosen.factBlocks) {
    drawRoundedRect(ctx, cfg.x, cy, cfg.w, fb.boxH, 12, cfg.cardBg, cfg.borderSoft, 1.25);

    ctx.fillStyle = cfg.accentColor;
    ctx.font = `700 ${chosen.labelPx}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(fb.label, cfg.x + cardPadX, cy + chosen.cardPadY);

    ctx.fillStyle = '#2E2720';
    ctx.font = `500 ${chosen.factPx}px "Plus Jakarta Sans", sans-serif`;
    let ly = cy + chosen.cardPadY + chosen.labelPx + 4;
    for (const line of fb.lines) {
      ctx.fillText(line, cfg.x + cardPadX, ly);
      ly += chosen.factLH;
    }

    cy += fb.boxH + chosen.cardGap;
  }

  // Nota personal manuscrita al pie (si fue activada)
  if (chosen.noteLines.length > 0) {
    const remainingTop = cy + 4;
    const noteBlockH = chosen.noteLines.length * chosen.noteLH;
    const noteY = Math.max(remainingTop, cfg.y + cfg.h - noteBlockH - 2);

    ctx.strokeStyle = cfg.borderSoft;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cfg.x, noteY - 6);
    ctx.lineTo(cfg.x + cfg.w, noteY - 6);
    ctx.stroke();

    ctx.fillStyle = '#383028';
    ctx.font = `600 ${chosen.notePx}px "Caveat", cursive`;
    let ny = noteY;
    for (const line of chosen.noteLines) {
      ctx.fillText(line, cfg.x, ny);
      ny += chosen.noteLH;
    }
  }

  ctx.textBaseline = 'alphabetic';
}

/**
 * Dibuja un panel horizontal ancho (banda inferior de Feed 4:5 o Solo Ilustración)
 * con distribución inteligente en columnas para evitar espacios vacíos cuando no hay nota personal
 * y mostrar el 100% del texto completo sin cortes.
 */
function drawAdaptiveWideStripPanel(
  ctx: CanvasRenderingContext2D,
  cfg: {
    x: number;
    y: number;
    w: number;
    h: number;
    summary: string;
    facts: LabeledFact[];
    noteText: string;
    fallbackText: string;
    accentColor: string;
    cardBg: string;
    borderSoft: string;
  }
): void {
  const scales = [1.0, 0.92, 0.85, 0.78, 0.72, 0.66];
  const colCount =
    cfg.facts.length >= 3 && cfg.w >= 840 ? Math.min(cfg.facts.length, 3) : Math.min(cfg.facts.length, 2);
  const colGap = 14;
  const colW = colCount > 0 ? (cfg.w - colGap * (colCount - 1)) / colCount : cfg.w;

  // Si hay 4 hechos (ej. Solo Ilustración 9:16 sin nota), usar grilla 2×2
  const useTwoByTwo = cfg.facts.length === 4;
  const gridCols = useTwoByTwo ? 2 : colCount;
  const gridColW = gridCols > 0 ? (cfg.w - colGap * (gridCols - 1)) / gridCols : cfg.w;

  const measureAtScale = (scale: number) => {
    const summaryPx = Math.max(15, Math.round(23 * scale * 10) / 10);
    const summaryLH = Math.round(summaryPx * 1.32);
    const labelPx = Math.max(10.5, Math.round(12.5 * scale * 10) / 10);
    const factPx = Math.max(13, Math.round(17.5 * scale * 10) / 10);
    const factLH = Math.round(factPx * 1.28);
    const notePx = Math.max(22, Math.round(33 * scale * 10) / 10);
    const noteLH = Math.round(notePx * 1.15);
    const padX = 14;
    const padY = Math.max(7, Math.round(9 * scale));
    const gap = Math.max(8, Math.round(12 * scale));

    let totalH = 0;
    let summaryLines: string[] = [];
    if (cfg.summary) {
      ctx.font = `500 ${summaryPx}px "Plus Jakarta Sans", sans-serif`;
      summaryLines = breakLines(ctx, cfg.summary, cfg.w - 16);
      totalH += summaryLines.length * summaryLH;
    }

    const rows: Array<{
      items: Array<{ label: string; lines: string[]; w: number }>;
      rowH: number;
    }> = [];

    if (cfg.facts.length > 0 && gridCols > 0) {
      if (totalH > 0) totalH += gap;
      ctx.font = `500 ${factPx}px "Plus Jakarta Sans", sans-serif`;
      const effectiveW = useTwoByTwo ? gridColW : colW;

      for (let i = 0; i < cfg.facts.length; i += gridCols) {
        const slice = cfg.facts.slice(i, i + gridCols);
        const rowColW = (cfg.w - colGap * (slice.length - 1)) / slice.length;
        const measuredItems = slice.map((f) => {
          const lines = breakLines(ctx, f.value, Math.min(effectiveW, rowColW) - padX * 2);
          return { label: f.label, lines, w: rowColW };
        });
        const maxLines = Math.max(...measuredItems.map((it) => it.lines.length));
        const rowH = padY * 2 + labelPx + 4 + maxLines * factLH;
        rows.push({ items: measuredItems, rowH });
        totalH += rowH + (i + gridCols < cfg.facts.length ? 10 : 0);
      }
    }

    let noteLines: string[] = [];
    if (cfg.noteText) {
      if (totalH > 0) totalH += gap;
      ctx.font = `600 ${notePx}px "Caveat", cursive`;
      noteLines = breakLines(ctx, cfg.noteText, cfg.w - 20);
      totalH += noteLines.length * noteLH;
    }

    return {
      summaryLines,
      rows,
      noteLines,
      summaryPx,
      summaryLH,
      labelPx,
      factPx,
      factLH,
      notePx,
      noteLH,
      padX,
      padY,
      gap,
      totalH,
    };
  };

  let chosen = measureAtScale(scales[scales.length - 1]);
  for (const s of scales) {
    const m = measureAtScale(s);
    if (m.totalH <= cfg.h) {
      chosen = m;
      break;
    }
  }

  ctx.textBaseline = 'top';

  if (!cfg.summary && cfg.facts.length === 0 && !cfg.noteText) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#5A5144';
    ctx.font = '600 34px "Caveat", cursive';
    ctx.fillText(cfg.fallbackText, cfg.x + cfg.w / 2, cfg.y + cfg.h / 2 - 17);
    ctx.textBaseline = 'alphabetic';
    return;
  }

  // Centrar verticalmente el bloque completo dentro del panel para eliminar espacios muertos
  let cy = cfg.y + Math.max(0, (cfg.h - chosen.totalH) / 2);

  if (chosen.summaryLines.length > 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#2B251F';
    ctx.font = `500 ${chosen.summaryPx}px "Plus Jakarta Sans", sans-serif`;
    for (const line of chosen.summaryLines) {
      ctx.fillText(line, cfg.x + cfg.w / 2, cy);
      cy += chosen.summaryLH;
    }
    if (chosen.rows.length > 0 || chosen.noteLines.length > 0) {
      cy += chosen.gap;
    }
  }

  if (chosen.rows.length > 0) {
    ctx.textAlign = 'left';
    for (let rIdx = 0; rIdx < chosen.rows.length; rIdx++) {
      const row = chosen.rows[rIdx];
      let cx = cfg.x;
      for (const item of row.items) {
        drawRoundedRect(ctx, cx, cy, item.w, row.rowH, 13, cfg.cardBg, cfg.borderSoft, 1.25);

        ctx.fillStyle = cfg.accentColor;
        ctx.font = `700 ${chosen.labelPx}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillText(item.label, cx + chosen.padX, cy + chosen.padY);

        ctx.fillStyle = '#2E2720';
        ctx.font = `500 ${chosen.factPx}px "Plus Jakarta Sans", sans-serif`;
        let ly = cy + chosen.padY + chosen.labelPx + 4;
        for (const line of item.lines) {
          ctx.fillText(line, cx + chosen.padX, ly);
          ly += chosen.factLH;
        }
        cx += item.w + colGap;
      }
      cy += row.rowH + (rIdx < chosen.rows.length - 1 ? 10 : 0);
    }
    if (chosen.noteLines.length > 0) {
      cy += chosen.gap;
    }
  }

  if (chosen.noteLines.length > 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#383028';
    ctx.font = `600 ${chosen.notePx}px "Caveat", cursive`;
    for (const line of chosen.noteLines) {
      ctx.fillText(line, cfg.x + cfg.w / 2, cy);
      cy += chosen.noteLH;
    }
  }

  ctx.textBaseline = 'alphabetic';
}

/**
 * Divide un texto en líneas que entran completamente dentro de `maxWidth` sin truncar jamás.
 */
function breakLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
      }
      // Si una sola palabra supera maxWidth, partirla suavemente
      if (ctx.measureText(word).width > maxWidth) {
        let chunk = '';
        for (const ch of word) {
          if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
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
  ctx.save();
  ctx.fillStyle = 'rgba(42, 36, 28, 0.10)';
  ctx.fillRect(x - 4, y + 6, w + 12, h + 10);

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
  ctx.fillStyle = 'rgba(42, 36, 28, 0.14)';
  drawRoundedRect(ctx, x + 5, y + 7, w, h, 14, 'rgba(42, 36, 28, 0.13)');

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

function drawFittedSerifHeading(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  maxWidth: number,
  maxPx: number,
  minPx: number
): void {
  let size = maxPx;
  while (size > minPx) {
    ctx.font = `700 ${size}px "Cormorant Garamond", Georgia, serif`;
    if (ctx.measureText(text).width <= maxWidth) {
      ctx.fillText(text, centerX, y);
      return;
    }
    size -= 2;
  }
  ctx.font = `700 ${minPx}px "Cormorant Garamond", Georgia, serif`;
  ctx.fillText(fitText(ctx, text, maxWidth), centerX, y);
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

  if (/^https:\/\//i.test(url)) {
    const direct = await tryLoad(url, true);
    if (direct) return direct;
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
