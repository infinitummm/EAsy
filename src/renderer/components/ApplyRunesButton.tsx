import React, { useState } from 'react';
import { RunePage } from '../../shared/types';

interface ApplyRunesButtonProps {
  page: RunePage;
  className?: string;
  onSuccess?: () => void;
  onError?: (err: string) => void;
}

export const ApplyRunesButton: React.FC<ApplyRunesButtonProps> = ({
  page,
  className = '',
  onSuccess,
  onError
}) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleApply = async () => {
    if (loading) return;
    setLoading(true);
    setStatus('idle');
    setErrorMessage('');

    try {
      if (!window.api || !window.api.applyRunes) {
        throw new Error('API LCU no conectada o entorno no soportado.');
      }

      const res = await window.api.applyRunes(page);
      if (res.success) {
        setStatus('success');
        onSuccess?.();
        setTimeout(() => setStatus('idle'), 4000);
      } else {
        const err = res.error || 'No se pudo inyectar la página de runas.';
        setStatus('error');
        setErrorMessage(err);
        onError?.(err);
        setTimeout(() => setStatus('idle'), 5000);
      }
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : String(err);
      setStatus('error');
      setErrorMessage(errStr);
      onError?.(errStr);
      setTimeout(() => setStatus('idle'), 5000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`inline-flex flex-col items-start ${className}`}>
      <button
        onClick={handleApply}
        disabled={loading}
        className={`px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-150 flex items-center space-x-2 shadow-md ${
          status === 'success'
            ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-900/30'
            : status === 'error'
            ? 'bg-rose-700 text-white hover:bg-rose-600 shadow-rose-900/30'
            : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 font-semibold shadow-amber-950/20 active:scale-[0.98]'
        } ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
        title="Inyecta instantáneamente esta página de runas al cliente oficial de League of Legends"
      >
        {loading ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>Inyectando Runas...</span>
          </>
        ) : status === 'success' ? (
          <>
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>¡Runas Aplicadas en LoL!</span>
          </>
        ) : status === 'error' ? (
          <>
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>Error al Aplicar</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4 text-neutral-950" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>Importar Runas al Cliente</span>
          </>
        )}
      </button>

      {status === 'error' && errorMessage && (
        <span className="text-xs text-rose-400 mt-1 font-mono max-w-xs truncate" title={errorMessage}>
          {errorMessage}
        </span>
      )}
    </div>
  );
};
