import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/botanical.css';

// Registrar Service Worker en contextos seguros (HTTPS o localhost) para habilitar instalación PWA
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Fallo silencioso en entornos donde Service Worker esté restringido
    });
  });
}

// Comportamiento de aplicación nativa: evitar menús contextuales y zoom involuntario del navegador
if (typeof window !== 'undefined') {
  const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
  };

  // Bloquear menú contextual de Chrome/Android al mantener presionado (salvo en campos de texto)
  document.addEventListener('contextmenu', (e) => {
    if (!isEditableTarget(e.target)) {
      e.preventDefault();
    }
  });

  // Evitar pinch-zoom involuntario sobre la interfaz (el visor Lightbox mantiene su propio zoom)
  document.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length > 1) {
        const target = e.target as HTMLElement | null;
        if (!target?.closest('.lightbox-backdrop')) {
          e.preventDefault();
        }
      }
    },
    { passive: false }
  );

  // Evitar gestos de zoom de WebKit (iOS/Safari)
  document.addEventListener(
    'gesturestart',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('.lightbox-backdrop')) {
        e.preventDefault();
      }
    },
    { passive: false } as AddEventListenerOptions
  );

  // Evitar doble toque rápido para hacer zoom fuera del visor Lightbox
  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.lightbox-backdrop') || isEditableTarget(target)) {
        return;
      }
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    },
    { passive: false }
  );

  // Evitar Ctrl+rueda de zoom en escritorio fuera del Lightbox
  window.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) {
        const target = e.target as HTMLElement | null;
        if (!target?.closest('.lightbox-backdrop')) {
          e.preventDefault();
        }
      }
    },
    { passive: false }
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
