import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/botanical.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Fallo silencioso en entornos donde Service Worker esté restringido
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
