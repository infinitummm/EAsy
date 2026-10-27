import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { P3rButton } from './p3r/P3rButton';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Error no capturado en componente:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-[#050E20] border-2 border-[#FF1744] p3r-shadow-hard relative p3r-bevel my-4">
          <div className="inline-flex p-3 bg-[#FF1744]/20 border border-[#FF1744] text-[#FF1744] mb-4 transform -skew-x-8">
            <AlertTriangle className="w-8 h-8 transform skew-x-8" />
          </div>

          <h2 className="text-xl font-black uppercase text-white font-p3r tracking-wider mb-2">
            {this.props.fallbackTitle || 'Ocurrió un error inesperado en esta vista'}
          </h2>

          <p className="text-xs text-[#7E9BB8] max-w-md mb-4 font-mono">
            {this.state.error?.message || 'Error desconocido al renderizar la sección.'}
          </p>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2 bg-[#00E5FF] hover:bg-[#00B4D8] text-[#030814] text-xs font-black uppercase tracking-wider transform -skew-x-8 transition flex items-center space-x-2 cursor-pointer font-p3r-head shadow"
            >
              <RefreshCw className="w-3.5 h-3.5 transform skew-x-8" />
              <span className="transform skew-x-8">Reintentar</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
