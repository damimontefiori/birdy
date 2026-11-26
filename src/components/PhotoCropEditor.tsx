import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Crop,
  RotateCcw,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

export type CropAspectPreset = '1:1' | '4:3' | '3:4' | 'original';

interface PhotoCropEditorProps {
  sourceImageUrl: string;
  onApplyCrop: (croppedDataUrl: string) => void;
  onClose: () => void;
}

interface ImageDims {
  w: number;
  h: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

/**
 * Editor táctil de recorte y zoom (cropping + zoom + rotación 90°) para fotografías
 * al registrar un hallazgo. Soporta arrastre con 1 dedo/mouse, pellizco (pinch-to-zoom)
 * con 2 dedos en celular, rueda del mouse y slider de precisión.
 */
export const PhotoCropEditor: React.FC<PhotoCropEditorProps> = ({
  sourceImageUrl,
  onApplyCrop,
  onClose,
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgDims, setImgDims] = useState<ImageDims | null>(null);
  const [stageDims, setStageDims] = useState<ImageDims>({ w: 320, h: 320 });

  const [aspectPreset, setAspectPreset] = useState<CropAspectPreset>('1:1');
  const [zoom, setZoom] = useState<number>(1);
  const [rotationDeg, setRotationDeg] = useState<number>(0);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Gestos táctiles / punteros (arrastre 1 dedo + pinch-to-zoom 2 dedos)
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinchStartRef = useRef<{ dist: number; zoom: number } | null>(null);

  // Cargar dimensiones reales de la imagen
  useEffect(() => {
    let active = true;
    const img = new Image();
    img.onload = () => {
      if (!active) return;
      imgRef.current = img;
      setImgDims({
        w: img.naturalWidth || img.width || 800,
        h: img.naturalHeight || img.height || 800,
      });
    };
    img.src = sourceImageUrl;
    return () => {
      active = false;
    };
  }, [sourceImageUrl]);

  // Medir el escenario de recorte al cambiar de proporción o tamaño de ventana
  useEffect(() => {
    const updateSize = () => {
      const el = stageRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageDims({ w: rect.width, h: rect.height });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [aspectPreset, rotationDeg, imgDims]);

  // Dimensiones efectivas tras rotación de 90°/270°
  const effectiveDims = useMemo<ImageDims>(() => {
    if (!imgDims) return { w: 800, h: 800 };
    const swapped = rotationDeg % 180 !== 0;
    return swapped ? { w: imgDims.h, h: imgDims.w } : imgDims;
  }, [imgDims, rotationDeg]);

  const targetAspectRatio = useMemo(() => {
    if (aspectPreset === '1:1') return 1;
    if (aspectPreset === '4:3') return 4 / 3;
    if (aspectPreset === '3:4') return 3 / 4;
    return effectiveDims.w / Math.max(1, effectiveDims.h);
  }, [aspectPreset, effectiveDims]);

  // Tamaño base "cover" de la imagen dentro del marco de recorte a zoom = 1
  const baseCover = useMemo(() => {
    const stageW = Math.max(1, stageDims.w);
    const stageH = Math.max(1, stageDims.h);
    const imgRatio = effectiveDims.w / Math.max(1, effectiveDims.h);
    const stageRatio = stageW / stageH;

    if (imgRatio > stageRatio) {
      return { w: stageH * imgRatio, h: stageH };
    }
    return { w: stageW, h: stageW / imgRatio };
  }, [effectiveDims, stageDims]);

  const clampOffset = (nx: number, ny: number, z: number) => {
    const dispW = baseCover.w * z;
    const dispH = baseCover.h * z;
    const maxX = Math.max(0, (dispW - stageDims.w) / 2);
    const maxY = Math.max(0, (dispH - stageDims.h) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, nx)),
      y: Math.max(-maxY, Math.min(maxY, ny)),
    };
  };

  // Re-acotar desplazamiento si cambia el zoom, la rotación o el tamaño del marco
  useEffect(() => {
    setOffset((prev) => clampOffset(prev.x, prev.y, zoom));
  }, [zoom, baseCover.w, baseCover.h, stageDims.w, stageDims.h]);

  const handleZoomChange = (nextZoom: number) => {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(nextZoom * 100) / 100));
    setZoom(clamped);
    setOffset((prev) => clampOffset(prev.x, prev.y, clamped));
  };

  const handleReset = () => {
    setZoom(1);
    setRotationDeg(0);
    setOffset({ x: 0, y: 0 });
    setAspectPreset('1:1');
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 1) {
      dragStartRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
      pinchStartRef.current = null;
    } else if (activePointers.current.size === 2) {
      const pts = Array.from(activePointers.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      pinchStartRef.current = { dist: Math.max(10, dist), zoom };
      dragStartRef.current = null;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activePointers.current.has(e.pointerId)) return;
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 2 && pinchStartRef.current) {
      const pts = Array.from(activePointers.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const factor = dist / pinchStartRef.current.dist;
      handleZoomChange(pinchStartRef.current.zoom * factor);
      return;
    }

    if (activePointers.current.size === 1 && dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setOffset(clampOffset(dragStartRef.current.ox + dx, dragStartRef.current.oy + dy, zoom));
    }
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) {
      pinchStartRef.current = null;
    }
    if (activePointers.current.size === 1) {
      const remaining = Array.from(activePointers.current.values())[0];
      dragStartRef.current = { x: remaining.x, y: remaining.y, ox: offset.x, oy: offset.y };
    } else {
      dragStartRef.current = null;
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.16 : -0.16;
    handleZoomChange(zoom + delta);
  };

  const handleApply = () => {
    const img = imgRef.current;
    if (!img || typeof document === 'undefined') {
      onApplyCrop(sourceImageUrl);
      return;
    }

    setIsExporting(true);
    try {
      // 1. Preparar imagen fuente rotada (si se aplicó giro de 90°/180°/270°)
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = effectiveDims.w;
      srcCanvas.height = effectiveDims.h;
      const sctx = srcCanvas.getContext('2d');
      if (!sctx) {
        onApplyCrop(sourceImageUrl);
        return;
      }

      sctx.save();
      sctx.translate(srcCanvas.width / 2, srcCanvas.height / 2);
      if (rotationDeg !== 0) {
        sctx.rotate((rotationDeg * Math.PI) / 180);
      }
      const origW = img.naturalWidth || img.width;
      const origH = img.naturalHeight || img.height;
      sctx.drawImage(img, -origW / 2, -origH / 2, origW, origH);
      sctx.restore();

      // 2. Mapear la ventana visible del escenario al espacio de píxeles reales de la foto
      const dispW = baseCover.w * zoom;
      const dispH = baseCover.h * zoom;
      const leftPxInDisp = dispW / 2 - offset.x - stageDims.w / 2;
      const topPxInDisp = dispH / 2 - offset.y - stageDims.h / 2;

      const scaleToSrcX = srcCanvas.width / Math.max(1, dispW);
      const scaleToSrcY = srcCanvas.height / Math.max(1, dispH);

      const sx = Math.max(0, leftPxInDisp * scaleToSrcX);
      const sy = Math.max(0, topPxInDisp * scaleToSrcY);
      const sw = Math.min(srcCanvas.width - sx, stageDims.w * scaleToSrcX);
      const sh = Math.min(srcCanvas.height - sy, stageDims.h * scaleToSrcY);

      // 3. Exportar con nitidez alta (máx. 1400 px en el lado mayor, limpio sin EXIF)
      const maxOut = 1400;
      const outRatio = sw / Math.max(1, sh);
      let outW = Math.round(Math.min(maxOut, Math.max(600, sw)));
      let outH = Math.round(outW / outRatio);
      if (outH > maxOut) {
        outH = maxOut;
        outW = Math.round(outH * outRatio);
      }

      const outCanvas = document.createElement('canvas');
      outCanvas.width = Math.max(1, outW);
      outCanvas.height = Math.max(1, outH);
      const octx = outCanvas.getContext('2d');
      if (!octx) {
        onApplyCrop(sourceImageUrl);
        return;
      }

      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = 'high';
      octx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, outCanvas.width, outCanvas.height);

      const resultDataUrl = outCanvas.toDataURL('image/jpeg', 0.91);
      onApplyCrop(resultDataUrl);
    } catch {
      onApplyCrop(sourceImageUrl);
    } finally {
      setIsExporting(false);
    }
  };

  // Estilo visual de la imagen dentro del marco de recorte
  const unrotatedW = rotationDeg % 180 !== 0 ? baseCover.h : baseCover.w;
  const unrotatedH = rotationDeg % 180 !== 0 ? baseCover.w : baseCover.h;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Recortar y acercar fotografía"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-sheet crop-modal-sheet">
        <div className="modal-sheet-handle" aria-hidden="true" />

        <div className="modal-sheet-header">
          <div>
            <h2 className="serif-heading" style={{ fontSize: '1.55rem', margin: 0 }}>
              Recortar y acercar foto
            </h2>
            <span style={{ fontSize: '0.82rem', color: 'var(--ink-secondary)' }}>
              Arrastrá para encuadrar el ejemplar y acercá con el deslizador o pellizco.
            </span>
          </div>
          <button
            type="button"
            className="icon-circle-btn"
            onClick={onClose}
            aria-label="Cerrar editor de recorte"
          >
            <X size={20} />
          </button>
        </div>

        {/* Selector de proporción de recorte */}
        <div className="segmented-control" style={{ marginBottom: 12 }} role="tablist" aria-label="Proporción del recorte">
          {(
            [
              ['1:1', 'Cuadrada 1:1'],
              ['4:3', '4:3'],
              ['3:4', '3:4'],
              ['original', 'Original'],
            ] as Array<[CropAspectPreset, string]>
          ).map(([preset, label]) => (
            <button
              key={preset}
              type="button"
              role="tab"
              aria-selected={aspectPreset === preset}
              className={`segmented-btn ${aspectPreset === preset ? 'active' : ''}`}
              onClick={() => setAspectPreset(preset)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Escenario interactivo de recorte */}
        <div className="crop-stage-outer">
          <div
            ref={stageRef}
            className="crop-stage-frame"
            style={{ aspectRatio: `${targetAspectRatio}` }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUpOrCancel}
            onPointerCancel={handlePointerUpOrCancel}
            onWheel={handleWheel}
          >
            <img
              src={sourceImageUrl}
              alt="Fotografía en edición"
              draggable={false}
              className="crop-stage-img"
              style={{
                width: `${unrotatedW}px`,
                height: `${unrotatedH}px`,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotationDeg}deg)`,
              }}
            />
            {/* Grilla de regla de tercios para encuadrar aves/mariposas */}
            <div className="crop-grid-overlay" aria-hidden="true">
              <span className="crop-grid-v v1" />
              <span className="crop-grid-v v2" />
              <span className="crop-grid-h h1" />
              <span className="crop-grid-h h2" />
            </div>
          </div>
        </div>

        {/* Controles de zoom + rotación + restablecer */}
        <div className="crop-controls-panel">
          <div className="crop-zoom-row">
            <button
              type="button"
              className="icon-circle-btn"
              style={{ width: 34, height: 34 }}
              onClick={() => handleZoomChange(zoom - 0.25)}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Alejar"
            >
              <ZoomOut size={16} />
            </button>

            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.05}
              value={zoom}
              onChange={(e) => handleZoomChange(Number(e.target.value))}
              aria-label="Nivel de zoom"
              className="crop-zoom-slider"
            />

            <button
              type="button"
              className="icon-circle-btn"
              style={{ width: 34, height: 34 }}
              onClick={() => handleZoomChange(zoom + 0.25)}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Acercar"
            >
              <ZoomIn size={16} />
            </button>

            <span className="crop-zoom-readout">{Math.round(zoom * 100)}%</span>
          </div>

          <div className="crop-tools-row">
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={() => setRotationDeg((deg) => (deg + 90) % 360)}
            >
              <RotateCw size={14} /> Girar 90°
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={handleReset}
            >
              <RotateCcw size={14} /> Restablecer
            </button>
          </div>
        </div>

        <div className="modal-sheet-actions">
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1 }}
            disabled={isExporting}
            onClick={handleApply}
          >
            <Check size={17} /> {isExporting ? 'Aplicando recorte…' : 'Aplicar recorte'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

export { Crop as CropIcon };
