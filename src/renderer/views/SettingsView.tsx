import React, { useState } from 'react';
import {
  Key,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  Activity,
  Save,
  FolderOpen,
  Terminal,
  HardDrive,
  AlertTriangle,
  Trash2
} from 'lucide-react';
import type { AppSettings, LcuDetectionReport } from '../../shared/types';
import type { KeyHealthStatus } from '../../shared/contracts';
import { RolePreferencesEditor } from '../components/RolePreferencesEditor';
import { formatFullPatchLabel } from '../../shared/patchUtils';

interface SettingsViewProps {
  settings: AppSettings;
  onSaveSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, onSaveSettings }) => {
  const [riotKey, setRiotKey] = useState<string>(settings.apiKeys.riotApiKeyEncrypted || '');
  const [geminiKey, setGeminiKey] = useState<string>(settings.apiKeys.geminiApiKeyEncrypted || '');
  const [leaguePath, setLeaguePath] = useState<string>(settings.leagueInstallationPath || '');
  const [showRiotKey, setShowRiotKey] = useState<boolean>(false);
  const [showGeminiKey, setShowGeminiKey] = useState<boolean>(false);
  const [autoAcceptEnabled, setAutoAcceptEnabled] = useState<boolean>(settings.autoAccept.enabled);
  const [autoAcceptDelay, setAutoAcceptDelay] = useState<number>(settings.autoAccept.delaySeconds);
  const [humanVariance, setHumanVariance] = useState<boolean>(settings.autoAccept.humanVariance);
  const [keyHealth, setKeyHealth] = useState<KeyHealthStatus | null>(null);
  const [validating, setValidating] = useState<boolean>(false);
  const [testingLcu, setTestingLcu] = useState<boolean>(false);
  const [lcuReport, setLcuReport] = useState<LcuDetectionReport | null>(null);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [patchVersion, setPatchVersion] = useState<string>('16.20.1');
  const [refreshingData, setRefreshingData] = useState<boolean>(false);
  const [dataRefreshMsg, setDataRefreshMsg] = useState<string | null>(null);
  const [quotaInfo, setQuotaInfo] = useState<any>(null);
  const [opggTier, setOpggTier] = useState<any>(settings.opggTier || 'emerald_plus');
  const [cleaningAssets, setCleaningAssets] = useState<boolean>(false);
  const [cleanResultMsg, setCleanResultMsg] = useState<string | null>(null);
  const [versionInfo, setVersionInfo] = useState<{
    clientVersion?: string;
    ddragonVersion: string;
    matches: boolean;
    displayPatch: string;
    ddragonOutdated?: boolean;
  } | null>(null);

  React.useEffect(() => {
    if (window.api?.getClientVersion) {
      window.api.getClientVersion().then((v) => {
        if (v) {
          setVersionInfo(v);
          setPatchVersion(v.displayPatch.replace('Parche ', ''));
        }
      }).catch(() => {});
    }
    if (window.api?.getPatchVersion) {
      window.api.getPatchVersion().then((p) => {
        if (p) setPatchVersion(p);
      }).catch(() => {});
    }
    if (window.api?.getGroundingQuota) {
      window.api.getGroundingQuota().then((q) => {
        if (q) setQuotaInfo(q);
      }).catch(() => {});
    }
  }, []);


  const handleCleanAssets = async () => {
    if (!window.api?.cleanAppAssets) return;
    setCleaningAssets(true);
    setCleanResultMsg(null);
    try {
      const res = await window.api.cleanAppAssets();
      setCleanResultMsg(`✓ Limpieza completada: ${res.deletedItemSets} conjunto(s) de objetos y ${res.deletedRunePages} página(s) de runas [IL] eliminadas del cliente.`);
    } catch (err: any) {
      setCleanResultMsg(`Error en la limpieza: ${err.message || String(err)}`);
    } finally {
      setCleaningAssets(false);
    }
  };

  const handleRefreshGameData = async () => {
    if (!window.api?.refreshDataDragon) return;
    setRefreshingData(true);
    setDataRefreshMsg(null);
    try {
      const res = await window.api.refreshDataDragon();
      setPatchVersion(res.patch);
      setDataRefreshMsg(`✓ Catálogo actualizado con éxito: Parche ${res.patch} (${res.championsCount} campeones indexados, incluyendo lanzamientos recientes).`);
    } catch (err: any) {
      setDataRefreshMsg(`Error al actualizar catálogo: ${err.message || String(err)}`);
    } finally {
      setRefreshingData(false);
    }
  };

  const handleSelectFolder = async () => {
    if (!window.api?.selectFolder) return;
    try {
      const selected = await window.api.selectFolder();
      if (selected) {
        setLeaguePath(selected);
      }
    } catch (err) {
      console.error('Error al seleccionar carpeta:', err);
    }
  };

  const handleTestLcuConnection = async () => {
    if (!window.api?.testLcuDetection) return;
    setTestingLcu(true);
    try {
      const rep = await window.api.testLcuDetection(leaguePath.trim() || undefined);
      setLcuReport(rep);
    } catch (err) {
      console.error('Error al probar detección LCU:', err);
    } finally {
      setTestingLcu(false);
    }
  };

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
      opggTier,
      leagueInstallationPath: leaguePath.trim(),
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
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="flex justify-between items-center border-b border-[#1B3B6F]/70 pb-4">
        <div>
          <div className="inline-block px-2.5 py-0.5 mb-1.5 bg-[#00D4FF]/15 border border-[#00D4FF]/40 text-[#00F0FF] text-[10px] font-black tracking-widest uppercase transform -skew-x-6">
            SYSTEM PREFERENCES // CONFIG
          </div>
          <h2 className="text-2xl font-black text-white tracking-wide flex items-center space-x-2">
            <span>AJUSTES & CLAVES DE API</span>
            <span className="text-[#00D4FF] font-mono text-sm">// P3R</span>
          </h2>
          <p className="text-xs text-[#6F92BF] font-mono mt-0.5">Gestión de credenciales cifradas (AES-256) y parámetros del sistema</p>
        </div>
        <button
          onClick={handleSaveAll}
          className="flex items-center space-x-2 bg-gradient-to-r from-[#00D4FF] to-[#0088FF] hover:from-[#00F0FF] hover:to-[#0077FF] text-[#030813] font-black text-xs uppercase tracking-widest px-5 py-2.5 rounded shadow-[0_0_15px_rgba(0,212,255,0.4)] transition transform -skew-x-6 active:scale-95"
        >
          <div className="transform skew-x-6 flex items-center space-x-2">
            {savedSuccess ? <Check className="w-4 h-4 text-[#030813]" /> : <Save className="w-4 h-4 text-[#030813]" />}
            <span>{savedSuccess ? '¡GUARDADO!' : 'GUARDAR AJUSTES'}</span>
          </div>
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

      {/* Sección 2.5: Automatización de Champ Select y Preferencias por Rol */}
      <RolePreferencesEditor
        settings={settings.autoChampSelect}
        onSave={(autoChampSelect) => onSaveSettings({ autoChampSelect })}
      />

      
      {/* Sección 2.8: Configuración de Datos OP.GG y Limpieza de Activos (REQ-022) */}
      <div className="bg-[#111823] p-6 rounded-lg border border-[#1E282D] space-y-4 shadow">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-semibold text-[#F0E6D2] flex items-center space-x-2">
              <Activity className="w-5 h-5 text-[#00D4FF]" />
              <span>Estadísticas de Meta Competitivo (OP.GG MCP)</span>
            </h3>
            <p className="text-xs text-[#A09B8C] mt-1">
              Filtro de nivel de juego para tasas de victoria, builds, runas y enfrentamientos (Streamable HTTP oficial de OP.GG).
            </p>
          </div>
          {versionInfo && (
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-[#0A1428] border border-[#00D4FF]/40 text-[#00D4FF]">
              {versionInfo.displayPatch}
            </span>
          )}
        </div>

        {versionInfo?.ddragonOutdated && (
          <div className="p-3 rounded text-xs bg-amber-950/40 border border-amber-600/40 text-amber-200 flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-300">Aviso de Parche Nuevo:</strong>
              <p className="mt-0.5">
                Datos del parche anterior hasta que Riot publique el nuevo catálogo en Data Dragon.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-[#F0E6D2] block mb-1">
              Rango / Elo de Referencia para Builds:
            </label>
            <select
              value={opggTier}
              onChange={(e) => {
                const val = e.target.value as NonNullable<AppSettings['opggTier']>;
                setOpggTier(val);
                onSaveSettings({ opggTier: val });
              }}
              className="w-full bg-[#0A1428] border border-[#1E282D] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00D4FF]"
            >
              <option value="emerald_plus">Esmeralda + (Recomendado - Mi Elo)</option>
              <option value="diamond_plus">Diamante +</option>
              <option value="master_plus">Máster +</option>
              <option value="grandmaster">Gran Máster</option>
              <option value="challenger">Challenger</option>
              <option value="all">Todos los Rangos (Agregado)</option>
            </select>
            <p className="text-[10px] text-neutral-400 mt-1">
              Clave de caché: <code className="font-mono text-[#00D4FF]">opgg:&#123;champ&#125;:&#123;pos&#125;:&#123;rival&#125;:{opggTier}:26.20</code>
            </p>
          </div>

          <div className="flex flex-col justify-between p-3 bg-[#0A1428] rounded border border-[#1E282D]">
            <div>
              <div className="text-xs font-semibold text-white">Limpieza de Importaciones en LoL</div>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Elimina páginas de runas y conjuntos de objetos creados por la app ([IL] Itero Local).
              </p>
            </div>
            <button
              type="button"
              onClick={handleCleanAssets}
              disabled={cleaningAssets}
              className="mt-2.5 bg-[#D92546]/80 hover:bg-[#D92546] text-white text-xs font-bold px-3 py-1.5 rounded transition flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {cleaningAssets ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              <span>Borrar importaciones de la app</span>
            </button>
          </div>
        </div>

        {cleanResultMsg && (
          <div className="p-2.5 rounded text-xs bg-emerald-950/40 border border-emerald-600/40 text-emerald-300">
            {cleanResultMsg}
          </div>
        )}
      </div>

      {/* Sección 3: Conexión con League of Legends (LCU API) */}
      <div className="bg-[#111823] p-6 rounded-lg border border-[#1E282D] space-y-4 shadow">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-semibold text-[#F0E6D2] flex items-center space-x-2">
              <HardDrive className="w-5 h-5 text-[#C89B3C]" />
              <span>Ruta de Instalación de League of Legends (LCU)</span>
            </h3>
            <p className="text-xs text-[#A09B8C] mt-1">
              La app detecta el cliente automáticamente mediante 4 métodos secuenciales. Si tu juego está en una carpeta no estándar, puedes seleccionarla aquí.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={leaguePath}
              onChange={(e) => setLeaguePath(e.target.value)}
              placeholder="Ej: C:\Riot Games\League of Legends"
              className="w-full bg-[#0A1428] border border-[#1E282D] rounded px-4 py-2 text-sm text-[#F0E6D2] focus:outline-none focus:border-[#C89B3C] font-mono"
            />
          </div>

          <button
            type="button"
            onClick={handleSelectFolder}
            className="bg-[#1E282D] hover:bg-[#28343C] text-[#F0E6D2] text-xs font-semibold px-4 py-2.5 rounded transition flex items-center space-x-2"
          >
            <FolderOpen className="w-4 h-4" />
            <span>Examinar...</span>
          </button>

          <button
            type="button"
            onClick={handleTestLcuConnection}
            disabled={testingLcu}
            className="bg-[#C89B3C] hover:bg-[#D8AB4C] text-black text-xs font-bold px-4 py-2.5 rounded transition flex items-center space-x-2 disabled:opacity-50"
          >
            {testingLcu ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
            <span>Probar Conexión</span>
          </button>
        </div>

        {/* Alerta de Permisos si se detectó */}
        {lcuReport?.isPermissionError && (
          <div className="p-3 rounded text-xs bg-amber-950/40 border border-amber-600/40 text-amber-200 flex items-start space-x-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-300">Aviso de Privilegios de Windows:</strong>
              <p className="mt-0.5">
                Se detectó el proceso de League of Legends pero Windows denegó la lectura de su línea de comandos. Ejecuta Itero Local con el mismo nivel de privilegios que League of Legends (ambos como Administrador o ambos como usuario normal).
              </p>
            </div>
          </div>
        )}

        {/* Diagnóstico detallado por método y pasos de conexión */}
        {lcuReport && (
          <div className="space-y-3 mt-3 pt-3 border-t border-[#1E282D]">
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="text-[#F0E6D2]">Resultado de la Prueba de Conexión LCU:</span>
              <span className={lcuReport.success ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {lcuReport.success ? '✓ Conexión Completada' : '✕ Fallo en la Conexión'}
              </span>
            </div>

            {/* Pasos de conexión completos: a, b, c, d */}
            {lcuReport.testSteps && lcuReport.testSteps.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-[#C89B3C] uppercase tracking-wider">
                  Etapas de Conexión Verificadas:
                </div>
                {lcuReport.testSteps.map((ts, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded text-xs border ${
                      ts.status === 'success'
                        ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                        : ts.status === 'skipped'
                        ? 'bg-[#0A1428] border-[#1E282D] text-gray-400 opacity-60'
                        : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center space-x-2">
                        <span className={ts.status === 'success' ? 'text-emerald-400' : ts.status === 'skipped' ? 'text-gray-400' : 'text-rose-400'}>
                          {ts.status === 'success' ? '✓' : ts.status === 'skipped' ? '○' : '✕'}
                        </span>
                        <span className="text-[#F0E6D2]">{ts.name}</span>
                      </span>
                      <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded ${
                        ts.status === 'success' ? 'bg-emerald-900/50 text-emerald-300' : ts.status === 'skipped' ? 'bg-gray-800 text-gray-400' : 'bg-rose-900/50 text-rose-300'
                      }`}>
                        {ts.status === 'success' ? 'ÉXITO' : ts.status === 'skipped' ? 'OMITIDO' : 'FALLO'}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[#E6E0D4] font-medium">
                      {ts.summary}
                    </div>
                    <div className="mt-0.5 text-[11px] font-mono text-[#A09B8C]">
                      {ts.details}
                    </div>
                    {ts.error && (
                      <div className="mt-1 text-[11px] font-mono text-rose-300 bg-black/40 p-1.5 rounded">
                        Error: {ts.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Desglose de métodos de detección A, B, C, D */}
            <div className="space-y-1.5 mt-3 pt-2 border-t border-[#1E282D]/60">
              <div className="text-[11px] font-bold text-[#A09B8C] uppercase tracking-wider">
                Métodos de Detección Evaluados:
              </div>
              {lcuReport.steps.map((step, idx) => (
                <div
                  key={idx}
                  className={`p-2 rounded text-xs border ${
                    step.success
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                      : 'bg-[#0A1428] border-[#1E282D] text-[#A09B8C]'
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span className="flex items-center space-x-2">
                      <span className={step.success ? 'text-emerald-400' : 'text-rose-400 font-bold'}>
                        {step.success ? '✓' : '✕'}
                      </span>
                      <span className={step.success ? 'text-[#F0E6D2]' : 'text-[#C5C0B2]'}>{step.name}</span>
                    </span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#111A24]">
                      {step.step}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#A09B8C]">
                    {step.details}
                  </div>
                </div>
              ))}
            </div>

            {lcuReport.logFilePath && (
              <p className="text-[10px] text-[#6B7280] mt-1 truncate">
                Archivo de log registrado en: <span className="font-mono text-[#A09B8C]">{lcuReport.logFilePath}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Sección 4: Catálogo y Datos del Juego (Data Dragon & LCU) */}
      <div className="bg-[#111823] p-6 rounded-lg border border-[#1E282D] space-y-4 shadow">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[#F0E6D2] flex items-center space-x-2">
              <RefreshCw className="w-5 h-5 text-[#00F0FF]" />
              <span>Datos del Juego & Parche Actual</span>
            </h3>
            <p className="text-xs text-[#A09B8C] mt-1">
              Catálogo sincronizado dinámicamente con Data Dragon oficial y LCU local. Resuelve automáticamente campeones nuevos (como Yunara).
            </p>
          </div>

          <button
            type="button"
            onClick={handleRefreshGameData}
            disabled={refreshingData}
            className="flex items-center space-x-2 bg-[#0070EB] hover:bg-[#005CE6] text-white text-xs font-bold px-4 py-2.5 rounded transition disabled:opacity-50 self-start sm:self-auto transform -skew-x-6"
          >
            <div className="transform skew-x-6 flex items-center space-x-2">
              <RefreshCw className={`w-4 h-4 ${refreshingData ? 'animate-spin' : ''}`} />
              <span>{refreshingData ? 'Actualizando...' : 'Actualizar datos del juego'}</span>
            </div>
          </button>
        </div>

        <div className="p-3 bg-[#0A1428] rounded border border-[#1E282D] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center space-x-3">
            <span className="text-[#A09B8C]">Parche detectado:</span>
            <span className="font-mono text-emerald-400 font-bold bg-[#111A24] px-2.5 py-1 rounded border border-[#1E282D]">
              v{formatFullPatchLabel(patchVersion)}
            </span>
            <span className="text-gray-400 text-[11px]">• Sincronización en tiempo real</span>
          </div>

          {dataRefreshMsg && (
            <div className="text-xs text-emerald-300 font-semibold bg-emerald-950/40 border border-emerald-500/30 px-3 py-1 rounded">
              {dataRefreshMsg}
            </div>
          )}
        </div>
      </div>

      {/* Sección 5: Monitor de Cuotas y Límites de Tasa */}
      <div className="bg-[#111823] p-6 rounded-lg border border-[#1E282D] space-y-4 shadow">
        <h3 className="text-lg font-semibold text-[#F0E6D2] flex items-center space-x-2">
          <Activity className="w-5 h-5 text-[#C89B3C]" />
          <span>Monitor de Límites de Tasa y Cuotas de IA (Frente 2)</span>
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
              <div>Límite estándar: <strong>15 RPM / 1,500 RPD</strong></div>
              <div>
                Peticiones hoy:{' '}
                <strong className="text-white">
                  {quotaInfo?.standardRequestsToday ?? 0} / 1,500
                </strong>
              </div>
              <div>
                Google Search Grounding:{' '}
                <span className="text-amber-400 font-medium">
                  {quotaInfo?.groundingAvailable ? 'Disponible' : '0 cuota libre (HTTP 429)'}
                </span>
              </div>
              <div className="text-emerald-400 font-mono mt-2">
                ✓ Proveedor Activo: Gemini 3.5 Flash (Conmutación automática ante 429)
              </div>
            </div>
          </div>
        </div>

        {quotaInfo?.quotaNote && (
          <div className="p-3 bg-[#070D19] rounded border border-[#1E282D] text-[11px] text-[#8EA2C6] leading-relaxed">
            <strong className="text-white">Diagnóstico de Cuota Google AI Studio: </strong>
            {quotaInfo.quotaNote}
          </div>
        )}
      </div>

      {/* Footer de versión y estado */}
      <div className="pt-4 border-t border-[#1E355B]/60 flex items-center justify-between text-[11px] text-[#64748B] font-mono">
        <div>
          <span>Itero Local Assistant</span> • <span>Parche Activo: <strong className="text-white">v{formatFullPatchLabel(patchVersion)}</strong></span>
        </div>
        <div>
          <span>DDragon & LCU Dynamic Sync</span> • <span>Arquitectura 100% Local</span>
        </div>
      </div>
    </div>
  );
};
