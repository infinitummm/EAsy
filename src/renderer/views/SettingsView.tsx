import React, { useState } from 'react';
import { Key, Eye, EyeOff, Check, AlertCircle, RefreshCw, ShieldCheck, Activity, Save } from 'lucide-react';
import type { AppSettings } from '../../shared/types';
import type { KeyHealthStatus } from '../../shared/contracts';

interface SettingsViewProps {
  settings: AppSettings;
  onSaveSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, onSaveSettings }) => {
  const [riotKey, setRiotKey] = useState<string>(settings.apiKeys.riotApiKeyEncrypted || '');
  const [geminiKey, setGeminiKey] = useState<string>(settings.apiKeys.geminiApiKeyEncrypted || '');
  const [showRiotKey, setShowRiotKey] = useState<boolean>(false);
  const [showGeminiKey, setShowGeminiKey] = useState<boolean>(false);
  const [autoAcceptEnabled, setAutoAcceptEnabled] = useState<boolean>(settings.autoAccept.enabled);
  const [autoAcceptDelay, setAutoAcceptDelay] = useState<number>(settings.autoAccept.delaySeconds);
  const [humanVariance, setHumanVariance] = useState<boolean>(settings.autoAccept.humanVariance);
  const [keyHealth, setKeyHealth] = useState<KeyHealthStatus | null>(null);
  const [validating, setValidating] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  const handleValidateRiotKey = async () => {
    if (!window.api || !riotKey.trim()) return;
    setValidating(true);
    try {
      const health = await window.api.validateKey(riotKey);
      setKeyHealth(health);
    } catch (err) {
      console.error('Error al validar clave:', err);
    } finally {
      setValidating(false);
    }
  };

  const handleSaveAll = async () => {
    await onSaveSettings({
      apiKeys: {
        riotApiKeyEncrypted: riotKey,
        geminiApiKeyEncrypted: geminiKey,
      },
      autoAccept: {
        enabled: autoAcceptEnabled,
        delaySeconds: autoAcceptDelay,
        humanVariance,
      },
    });

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="flex justify-between items-center border-b border-[#1E282D] pb-4">
        <div>
          <h2 className="text-2xl font-bold text-[#F0E6D2]">Ajustes & Claves de API</h2>
          <p className="text-sm text-[#A09B8C]">Gestión de credenciales cifradas y parámetros del sistema</p>
        </div>
        <button
          onClick={handleSaveAll}
          className="flex items-center space-x-2 bg-[#C89B3C] hover:bg-[#D8AB4C] text-black font-bold px-5 py-2 rounded transition shadow-md"
        >
          {savedSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>{savedSuccess ? '¡Guardado!' : 'Guardar Ajustes'}</span>
        </button>
      </header>

      {/* Sección 1: Riot API Key */}
      <div className="bg-[#111823] p-6 rounded-lg border border-[#1E282D] space-y-4 shadow">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-semibold text-[#F0E6D2] flex items-center space-x-2">
              <Key className="w-5 h-5 text-[#C89B3C]" />
              <span>Riot Games Development API Key</span>
            </h3>
            <p className="text-xs text-[#A09B8C] mt-1">
              Necesaria para consultar historial de partidas (Match-V5) y maestrías. Se almacena localmente y cifrada (AES-256).
            </p>
          </div>
          <a
            href="https://developer.riotgames.com"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[#0AC8B9] hover:underline flex items-center space-x-1"
          >
            <span>Obtener o Renovar Clave (24h)</span>
          </a>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative flex-1">
            <input
              type={showRiotKey ? 'text' : 'password'}
              value={riotKey}
              onChange={(e) => setRiotKey(e.target.value)}
              placeholder="RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="w-full bg-[#0A1428] border border-[#1E282D] rounded px-4 py-2 text-sm text-[#F0E6D2] focus:outline-none focus:border-[#C89B3C] font-mono"
            />
            <button
              type="button"
              onClick={() => setShowRiotKey(!showRiotKey)}
              className="absolute right-3 top-2.5 text-[#A09B8C] hover:text-[#F0E6D2]"
            >
              {showRiotKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <button
            type="button"
            onClick={handleValidateRiotKey}
            disabled={validating || !riotKey.trim()}
            className="bg-[#1E282D] hover:bg-[#28343C] text-[#F0E6D2] text-xs font-semibold px-4 py-2.5 rounded transition flex items-center space-x-2 disabled:opacity-50"
          >
            {validating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            <span>Validar</span>
          </button>
        </div>

        {/* Estado de Salud de la Riot Key */}
        {keyHealth && (
          <div
            className={`p-3 rounded text-xs flex items-center space-x-2 border ${
              keyHealth.valid
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                : keyHealth.isExpired
                ? 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                : 'bg-amber-950/30 border-amber-500/30 text-amber-300'
            }`}
          >
            {keyHealth.valid ? (
              <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>
              {keyHealth.valid
                ? 'Clave de Riot activa y respondiendo correctamente.'
                : keyHealth.isExpired
                ? '¡Clave de desarrollo expirada (Error 403 Forbidden)! Por favor renuévala en el portal de Riot Developer.'
                : `Error de validación (Código HTTP ${keyHealth.statusCode || 'desconocido'}).`}
            </span>
          </div>
        )}
      </div>

      {/* Sección 2: Google Gemini API Key */}
      <div className="bg-[#111823] p-6 rounded-lg border border-[#1E282D] space-y-4 shadow">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-semibold text-[#F0E6D2] flex items-center space-x-2">
              <Key className="w-5 h-5 text-[#0AC8B9]" />
              <span>Google Gemini API Key (Motor de IA)</span>
            </h3>
            <p className="text-xs text-[#A09B8C] mt-1">
              Utilizada para inferir dificultades de matchup, runas optimizadas y planes de early game. (Nivel Gratuito de AI Studio).
            </p>
          </div>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[#0AC8B9] hover:underline"
          >
            <span>Obtener Clave Gratuita de Gemini</span>
          </a>
        </div>

        <div className="relative">
          <input
            type={showGeminiKey ? 'text' : 'password'}
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder="AIzaSy..."
            className="w-full bg-[#0A1428] border border-[#1E282D] rounded px-4 py-2 text-sm text-[#F0E6D2] focus:outline-none focus:border-[#0AC8B9] font-mono"
          />
          <button
            type="button"
            onClick={() => setShowGeminiKey(!showGeminiKey)}
            className="absolute right-3 top-2.5 text-[#A09B8C] hover:text-[#F0E6D2]"
          >
            {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Sección 3: Monitor de Cuotas y Límites de Tasa */}
      <div className="bg-[#111823] p-6 rounded-lg border border-[#1E282D] space-y-4 shadow">
        <h3 className="text-lg font-semibold text-[#F0E6D2] flex items-center space-x-2">
          <Activity className="w-5 h-5 text-[#C89B3C]" />
          <span>Monitor de Límites de Tasa y Cuotas</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="bg-[#0A1428] p-4 rounded border border-[#1E282D]">
            <div className="font-semibold text-[#F0E6D2] mb-1">Riot Games API (Dev Tier)</div>
            <div className="text-[#A09B8C] space-y-1">
              <div>Límite corto: <strong>20 peticiones / 1 segundo</strong></div>
              <div>Límite largo: <strong>100 peticiones / 2 minutos</strong></div>
              <div className="text-emerald-400 font-mono mt-2">✓ Rate Limiter Token Bucket Activo</div>
            </div>
          </div>

          <div className="bg-[#0A1428] p-4 rounded border border-[#1E282D]">
            <div className="font-semibold text-[#F0E6D2] mb-1">Google Gemini API (Free Tier)</div>
            <div className="text-[#A09B8C] space-y-1">
              <div>Límite por minuto: <strong>15 RPM</strong></div>
              <div>Límite diario: <strong>1,500 RPD</strong></div>
              <div className="text-emerald-400 font-mono mt-2">✓ Cola y Caché SQLite Activos</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
