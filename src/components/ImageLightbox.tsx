import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';

export interface LightboxItem {
  url: string;
  title?: string;
  subtitle?: string;
  badge?: string;
}

interface ImageLightboxProps {
  items: LightboxItem[];
  initialIndex?: number;
  onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  items,
  initialIndex = 0,
  onClose,
}) => {
  const [index, setIndex] = useState<number>(
    Math.min(Math.max(initialIndex, 0), Math.max(items.length - 1, 0))
  );
  const [zoom, setZoom] = useState<number>(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartRef = useRef<{ x: number; y: number; origX: number; origY: number } | null>(null);
  const swipeStartXRef = useRef<number | null>(null);
  const lastTapRef = useRef<number>(0);

  const current = items[index];

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [index]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && items.length > 1) {
        setIndex((i) => (i + 1) % items.length);
      }
      if (e.key === 'ArrowLeft' && items.length > 1) {
        setIndex((i) => (i - 1 + items.length) % items.length);
      }
      if (e.key === '+' || e.key === '=') {
        setZoom((z) => Math.min(3.5, Number((z + 0.5).toFixed(2))));
      }
      if (e.key === '-') {
        setZoom((z) => {
          const next = Math.max(1, Number((z - 0.5).toFixed(2)));
          if (next === 1) setOffset({ x: 0, y: 0 });
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [items.length, onClose]);

  if (!current) return null;

  const handleZoomIn = () => {
    setZoom((z) => Math.min(3.5, Number((z + 0.75).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoom((z) => {
      const next = Math.max(1, Number((z - 0.75).toFixed(2)));
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const toggleDoubleTapZoom = () => {
    if (zoom > 1) {
      handleResetZoom();
    } else {
      setZoom(2.25);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      toggleDoubleTapZoom();
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;

    if (zoom > 1) {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        origX: offset.x,
        origY: offset.y,
      };
    } else {
      swipeStartXRef.current = e.clientX;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current || zoom <= 1) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setOffset({
      x: dragStartRef.current.origX + dx,
      y: dragStartRef.current.origY + dy,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current) {
      dragStartRef.current = null;
      return;
    }
    if (swipeStartXRef.current !== null && items.length > 1 && zoom === 1) {
      const dx = e.clientX - swipeStartXRef.current;
      if (Math.abs(dx) > 55) {
        if (dx < 0) {
          setIndex((i) => (i + 1) % items.length);
        } else {
          setIndex((i) => (i - 1 + items.length) % items.length);
        }
      }
    }
    swipeStartXRef.current = null;
  };

  return (
    <div
      className="lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={current.title || 'Vista ampliada de imagen'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Barra superior */}
      <div className="lightbox-header">
        <div className="lightbox-caption-head">
          {current.badge && <span className="lightbox-badge">{current.badge}</span>}
          {items.length > 1 && (
            <span className="lightbox-counter">
              {index + 1} / {items.length}
            </span>
          )}
        </div>

        <div className="lightbox-controls">
          <button
            type="button"
            className="lightbox-icon-btn"
            onClick={handleZoomOut}
            disabled={zoom <= 1}
            aria-label="Alejar"
            title="Alejar"
          >
            <ZoomOut size={19} />
          </button>
          <span className="lightbox-zoom-label">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="lightbox-icon-btn"
            onClick={handleZoomIn}
            disabled={zoom >= 3.5}
            aria-label="Acercar"
            title="Acercar"
          >
            <ZoomIn size={19} />
          </button>
          {zoom > 1 && (
            <button
              type="button"
              className="lightbox-icon-btn"
              onClick={handleResetZoom}
              aria-label="Restablecer zoom"
              title="Restablecer zoom"
            >
              <RotateCcw size={17} />
            </button>
          )}
          <button
            type="button"
            className="lightbox-icon-btn lightbox-close-btn"
            onClick={onClose}
            aria-label="Cerrar vista ampliada"
            title="Cerrar"
          >
            <X size={21} />
          </button>
        </div>
      </div>

      {/* Lienzo interactivo de imagen */}
      <div
        className="lightbox-stage"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ cursor: zoom > 1 ? 'grab' : 'zoom-in' }}
      >
        {items.length > 1 && (
          <button
            type="button"
            className="lightbox-nav-btn left"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i - 1 + items.length) % items.length);
            }}
            aria-label="Imagen anterior"
          >
            <ChevronLeft size={24} />
          </button>
        )}

        <img
          src={current.url}
          alt={current.title || 'Fotografía ampliada'}
          className="lightbox-image"
          draggable={false}
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
          }}
        />

        {items.length > 1 && (
          <button
            type="button"
            className="lightbox-nav-btn right"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i + 1) % items.length);
            }}
            aria-label="Imagen siguiente"
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>

      {/* Pie informativo */}
      <div className="lightbox-footer">
        {current.title && <div className="lightbox-title">{current.title}</div>}
        {current.subtitle && <div className="lightbox-subtitle">{current.subtitle}</div>}
        <div className="lightbox-hint">
          Tocá dos veces para acercar · Arrastrá para explorar detalles
        </div>
      </div>
    </div>
  );
};
