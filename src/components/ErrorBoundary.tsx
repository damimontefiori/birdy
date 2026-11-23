import React from 'react';
import { Feather, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    console.error('[Bioma] Error de interfaz capturado:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-shell">
          <div
            className="notebook-page"
            style={{ maxWidth: 460, margin: '36px auto', textAlign: 'center', padding: '32px 22px' }}
          >
            <Feather size={38} color="#38573E" style={{ marginBottom: 10 }} />
            <h1 className="serif-heading" style={{ fontSize: '1.85rem', marginBottom: 6 }}>
              Algo se interrumpió en esta hoja
            </h1>
            <p style={{ color: 'var(--ink-secondary)', fontSize: '0.92rem', marginBottom: 18 }}>
              Tus cuadernos y fotografías siguen guardados de forma segura en el dispositivo.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              <RefreshCw size={17} /> Volver a abrir el cuaderno
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
