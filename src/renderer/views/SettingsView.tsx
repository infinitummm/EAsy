import React, { useState } from 'react';
import {
  Key,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  Download,
  Activity,
  Save,
  FolderOpen,
  Terminal,
  AlertTriangle,
  Trash2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import type { AppSettings, LcuDetectionReport, LcuConnectionState } from '../../shared/types';
import { DEFAULT_APP_SETTINGS } from '../../shared/constants';
import type { KeyHealthStatus } from '../../shared/contracts';
import { RolePreferencesEditor } from '../components/RolePreferencesEditor';
import { formatFullPatchLabel } from '../../shared/patchUtils';
import { ChampionInfo, obtenerTodosLosCampeones } from '../../shared/champions';
import { P3rButton } from '../components/p3r/P3rButton';
import { P3rBadge } from '../components/p3r/P3rBadge';

interface SettingsViewProps {
  settings: AppSettings;
  onSaveSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  mainLcuState?: LcuConnectionState;
  lcuState?: LcuConnectionState;
  lcuPort?: number | null;
  lastIpcTimestamp?: string;
  lastIpcEvent?: string;
  lastConnectionError?: string | null;
  onRefreshLcu?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onSaveSettings,
  mainLcuState = 'disconnected',
  lcuState = 'disconnected',
  lcuPort = null,
  lastIpcTimestamp = '',
  lastIpcEvent = '',
  lastConnectionError = null,
  onRefreshLcu
}) => {
  const [riotKey, setRiotKey] = useState<string>(settings?.apiKeys?.riotApiKeyEncrypted || '');
  const [geminiKey, setGeminiKey] = useState<string>(settings?.apiKeys?.geminiApiKeyEncrypted || '');
  const [showAdvancedRiotKey, setShowAdvancedRiotKey] = useState<boolean>(Boolean(settings?.apiKeys?.riotApiKeyEncrypted));
  const [showGeminiSection, setShowGeminiSection] = useState<boolean>(Boolean(settings?.apiKeys?.geminiApiKeyEncrypted));
  const [showAdvancedDiag, setShowAdvancedDiag] = useState<boolean>(false);
  const [exportingDiag, setExportingDiag] = useState<boolean>(false);
  const [diagMessage, setDiagMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [leaguePath, setLeaguePath] = useState<string>(settings?.leagueInstallationPath || '');
  const [showRiotKey, setShowRiotKey] = useState<boolean>(false);
  const [showGeminiKey, setShowGeminiKey] = useState<boolean>(false);
  const [keyHealth, setKeyHealth] = useState<KeyHealthStatus | null>(null);
  const [validating, setValidating] = useState<boolean>(false);
  const [validatingAi, setValidatingAi] = useState<boolean>(false);
  const [aiHealth, setAiHealth] = useState<{ valid: boolean; statusCode: number; message: string } | null>(null);
  const [testingLcu, setTestingLcu] = useState<boolean>(false);
  const [lcuReport, setLcuReport] = useState<LcuDetectionReport | null>(null);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [patchVersion, setPatchVersion] = useState<string>('26.20');
  const [championsCount, setChampionsCount] = useState<number>(() => obtenerTodosLosCampeones().length);
  const [catalogChampions, setCatalogChampions] = useState<ChampionInfo[]>(() => obtenerTodosLosCampeones());
  const [refreshingData, setRefreshingData] = useState<boolean>(false);
  const [dataRefreshMsg, setDataRefreshMsg] = useState<string | null>(null);
  const [quotaInfo, setQuotaInfo] = useState<any>(null);
  const [opggTier, setOpggTier] = useState<any>(settings?.opggTier || 'emerald_plus');
  const [minMatchupSampleThreshold, setMinMatchupSampleThreshold] = useState<number>(settings?.minMatchupSampleThreshold || 200);
  const [allowAiChoiceTop3, setAllowAiChoiceTop3] = useState<boolean>(settings?.allowAiChoiceTop3 || false);
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
    if (window.api?.getChampionCatalog) {
      window.api.getChampionCatalog().then((cat) => {
        if (cat?.count) setChampionsCount(cat.count);
        if (cat?.champions?.length) setCatalogChampions(cat.champions);
        if (cat?.patch) setPatchVersion(cat.patch);
      }).catch(() => {});
    } else if (window.api?.getPatchVersion) {
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
      setCleanResultMsg(`Limpieza completada: ${res.deletedItemSets} conjunto(s) de objetos y ${res.deletedRunePages} página(s) de runas eliminadas.`);
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
      if (res.championsCount) setChampionsCount(res.championsCount);
      if (res.champions && res.champions.length > 0) {
        setCatalogChampions(res.champions);
      } else if (window.api?.getChampionCatalog) {
        const cat = await window.api.getChampionCatalog();
        if (cat?.champions?.length) setCatalogChampions(cat.champions);
      }
      setDataRefreshMsg(`Catálogo actualizado: Parche ${formatFullPatchLabel(res.patch)} (${res.championsCount || 173} campeones).`);
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
      console.error('Error al probar conexión:', err);
    } finally {
      setTestingLcu(false);
    }
  };

  const handleExportDiagnostic = async () => {
    setExportingDiag(true);
    setDiagMessage(null);
    try {
      if (window.api && window.api.exportDiagnostic) {
        const res = await window.api.exportDiagnostic();
        if (res.success && res.filePath) {
          setDiagMessage({
            type: 'success',
            text: `Diagnóstico exportado en: ${res.filePath}`
          });
        } else {
          setDiagMessage({
            type: 'error',
            text: res.error || 'Error al exportar diagnóstico.'
          });
        }
      }
    } catch (err: unknown) {
      setDiagMessage({
        type: 'error',
        text: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setExportingDiag(false);
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

  const handleValidateAiKey = async () => {
    if (!window.api?.validateAiKey || !geminiKey.trim()) return;
    setValidatingAi(true);
    setAiHealth(null);
    try {
      const res = await window.api.validateAiKey(geminiKey.trim());
      setAiHealth(res);
    } catch (err: any) {
      console.error('Error al validar clave de IA:', err);
      setAiHealth({
        valid: false,
        statusCode: 500,
        message: err?.message || String(err),
      });
    } finally {
      setValidatingAi(false);
    }
  };

  const handleSaveAll = async () => {
    await onSaveSettings({
      opggTier,
      minMatchupSampleThreshold,
      allowAiChoiceTop3,
      leagueInstallationPath: leaguePath.trim(),
      apiKeys: {
        ...(settings?.apiKeys || {}),
        riotApiKeyEncrypted: riotKey.trim(),
        geminiApiKeyEncrypted: geminiKey.trim(),
      },
    });

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 select-none pb-8">
      {/* Cabecera */}
      <header className="flex justify-between items-center border-b-2 border-[#16335F] pb-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-wider flex items-center space-x-2 font-p3r uppercase">
            <span>AJUSTES</span>
          </h2>
          <p className="text-xs text-[#7E9BB8] mt-0.5">Preferencias y configuración de la aplicación.</p>
        </div>

        <P3rButton
          variant="cyan"
          size="lg"
          onClick={handleSaveAll}
          icon={savedSuccess ? <Check className="w-4 h-4 text-[#030814]" /> : <Save className="w-4 h-4 text-[#030814]" />}
        >
          {savedSuccess ? 'Guardado' : 'Guardar'}
        </P3rButton>
      </header>

      {/* Clave de Riot (Opcional) */}
      <div className="bg-[#050E20] p-6 border-2 border-[#16335F] p3r-bevel p3r-shadow-hard space-y-3">
        <div className="flex justify-between items-center cursor-pointer" onClick={() => setShowAdvancedRiotKey(!showAdvancedRiotKey)}>
          <div>
            <h3 className="text-sm font-black text-white flex items-center space-x-2 uppercase font-p3r tracking-wider">
              <span className="w-2.5 h-2.5 bg-[#0066FF] transform rotate-45"></span>
              <span>Clave de Riot (Opcional)</span>
            </h3>
            <p className="text-xs text-[#7E9BB8] mt-0.5">
              Necesaria solo si deseas buscar invocadores remotos. Tu cuenta local ya funciona sin clave.
            </p>
          </div>
          <button
            type="button"
            className="text-xs font-black px-3 py-1 bg-[#030814] text-[#00E5FF] border border-[#16335F] transform -skew-x-8 uppercase font-p3r-head cursor-pointer"
          >
            <span className="transform skew-x-8 inline-block">{showAdvancedRiotKey ? 'Ocultar ▲' : 'Configurar ▼'}</span>
          </button>
        </div>

        {showAdvancedRiotKey && (
          <div className="pt-3 border-t-2 border-[#16335F] space-y-3">
            <div className="flex justify-end">
              <a
                href="https://developer.riotgames.com"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[#00E5FF] hover:underline flex items-center space-x-1 font-mono"
              >
                <span>Portal de Riot Games ↗</span>
              </a>
            </div>

            <div className="flex items-center space-x-3">
              <div className="relative flex-1">
                <input
                  type={showRiotKey ? 'text' : 'password'}
                  value={riotKey}
                  onChange={(e) => setRiotKey(e.target.value)}
                  placeholder="RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full bg-[#030814] border border-[#16335F] focus:border-[#00E5FF] px-4 py-2.5 text-sm text-white focus:outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowRiotKey(!showRiotKey)}
                  className="absolute right-3 top-3 text-[#7E9BB8] hover:text-white"
                >
                  {showRiotKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <P3rButton
                variant="secondary"
                size="md"
                onClick={handleValidateRiotKey}
                disabled={validating || !riotKey.trim()}
                icon={validating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 text-[#00E5FF]" />}
              >
                Validar
              </P3rButton>
            </div>
          </div>
        )}

        {showAdvancedRiotKey && keyHealth && (
          <div
            className={`p-3 text-xs flex items-center space-x-2 border-2 p3r-cut-tr ${
              keyHealth.valid
                ? 'bg-[#031A12] border-[#00E676] text-[#00E676]'
                : keyHealth.isExpired
                ? 'bg-[#2A050A] border-[#FF1744] text-[#FF1744]'
                : 'bg-[#2A1705] border-[#FFE277] text-[#FFE277]'
            }`}
          >
            {keyHealth.valid ? (
              <Check className="w-4 h-4 shrink-0 text-[#00E676]" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-[#FF1744]" />
            )}
            <span className="font-p3r-head">
              {keyHealth.valid
                ? 'Clave de Riot activa.'
                : keyHealth.isExpired
                ? 'Clave expirada. Renuévala en el portal de Riot.'
                : `Error de validación (${keyHealth.statusCode || 'desconocido'}).`}
            </span>
          </div>
        )}
      </div>

      {/* Clave de Google Gemini (Opcional) */}
      <div className="bg-[#050E20] p-6 border-2 border-[#16335F] p3r-bevel p3r-shadow-hard space-y-3">
        <div className="flex justify-between items-center cursor-pointer" onClick={() => setShowGeminiSection(!showGeminiSection)}>
          <div>
            <h3 className="text-sm font-black text-white flex items-center space-x-2 uppercase font-p3r tracking-wider">
              <span className="w-2.5 h-2.5 bg-[#00E5FF] transform rotate-45"></span>
              <span>Clave de Gemini (Opcional)</span>
            </h3>
            <p className="text-xs text-[#7E9BB8] mt-0.5">
              Opcional. Activa explicaciones adaptadas a la composición.
            </p>
          </div>
          <button
            type="button"
            className="text-xs font-black px-3 py-1 bg-[#030814] text-[#00E5FF] border border-[#16335F] transform -skew-x-8 uppercase font-p3r-head cursor-pointer"
          >
            <span className="transform skew-x-8 inline-block">{showGeminiSection ? 'Ocultar ▲' : 'Configurar ▼'}</span>
          </button>
        </div>

        {showGeminiSection && (
          <div className="pt-3 border-t-2 border-[#16335F] space-y-3">
            <div className="flex justify-end">
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[#00E5FF] hover:underline font-mono"
              >
                <span>Google AI Studio ↗</span>
              </a>
            </div>

            <div className="flex items-center space-x-3">
              <div className="relative flex-1">
                <input
                  type={showGeminiKey ? 'text' : 'password'}
                  value={geminiKey}
                  onChange={(e) => {
                    setGeminiKey(e.target.value);
                    if (aiHealth) setAiHealth(null);
                  }}
                  placeholder="AIzaSy..."
                  className="w-full bg-[#030814] border border-[#16335F] focus:border-[#00E5FF] px-4 py-2.5 text-sm text-white focus:outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  className="absolute right-3 top-3 text-[#7E9BB8] hover:text-white"
                >
                  {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <P3rButton
                variant="secondary"
                size="md"
                onClick={handleValidateAiKey}
                disabled={validatingAi || !geminiKey.trim()}
                icon={validatingAi ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 text-[#00E5FF]" />}
              >
                Validar
              </P3rButton>
            </div>

            {aiHealth && (
              <div
                className={`p-3 text-xs flex items-center space-x-2 border-2 p3r-cut-tr ${
                  aiHealth.valid
                    ? 'bg-[#031A12] border-[#00E676] text-[#00E676]'
                    : 'bg-[#2A050A] border-[#FF1744] text-[#FF1744]'
                }`}
              >
                {aiHealth.valid ? (
                  <Check className="w-4 h-4 shrink-0 text-[#00E676]" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-[#FF1744]" />
                )}
                <span className="font-p3r-head">
                  {aiHealth.valid
                    ? 'Clave de Google Gemini activa y verificada con éxito.'
                    : `Error en Google Gemini (${aiHealth.statusCode || 'Inválida'}): ${aiHealth.message}`}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Automatización de Selección y Preferencias de Rol */}
      <RolePreferencesEditor
        settings={settings?.autoChampSelect || DEFAULT_APP_SETTINGS.autoChampSelect}
        onSave={(autoChampSelect) => onSaveSettings({ autoChampSelect })}
        championsCatalog={catalogChampions}
      />

      {/* Preferencias de Estadísticas OP.GG */}
      <div className="bg-[#050E20] p-6 border-2 border-[#16335F] p3r-bevel p3r-shadow-hard space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-base font-black text-white flex items-center space-x-2 uppercase font-p3r tracking-wider">
              <span className="w-2.5 h-2.5 bg-[#00E5FF] transform rotate-45"></span>
              <span>Datos de OP.GG</span>
            </h3>
            <p className="text-xs text-[#7E9BB8] mt-1">
              Filtro de nivel para builds, runas y enfrentamientos.
            </p>
          </div>
          {versionInfo && (
            <P3rBadge label={versionInfo.displayPatch} variant="cyan" />
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-black text-[#7E9BB8] uppercase block mb-1 font-p3r-head">
              Rango de referencia:
            </label>
            <select
              value={opggTier}
              onChange={(e) => {
                const val = e.target.value as NonNullable<AppSettings['opggTier']>;
                setOpggTier(val);
                onSaveSettings({ opggTier: val });
              }}
              className="w-full bg-[#030814] border border-[#16335F] focus:border-[#00E5FF] px-3 py-2 text-xs text-white focus:outline-none font-mono"
            >
              <option value="emerald_plus">Esmeralda +</option>
              <option value="diamond_plus">Diamante +</option>
              <option value="master_plus">Máster +</option>
              <option value="grandmaster">Gran Máster</option>
              <option value="challenger">Challenger</option>
              <option value="all">Todos los rangos</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black text-[#7E9BB8] uppercase block mb-1 font-p3r-head">
              Mínimo de partidas:
            </label>
            <input
              type="number"
              min={10}
              max={1000}
              step={10}
              value={minMatchupSampleThreshold}
              onChange={(e) => setMinMatchupSampleThreshold(Number(e.target.value))}
              className="w-full bg-[#030814] border border-[#16335F] focus:border-[#00E5FF] px-3 py-2 text-xs text-white focus:outline-none font-mono"
            />
          </div>
        </div>

        <div className="pt-2">
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={allowAiChoiceTop3}
              onChange={(e) => setAllowAiChoiceTop3(e.target.checked)}
              className="w-4 h-4 accent-[#00E5FF]"
            />
            <span className="text-xs text-[#CBD5E1]">
              Permitir a la IA elegir entre las 3 mejores opciones de OP.GG.
            </span>
          </label>
        </div>
      </div>

      {/* Datos del Juego y Catálogo */}
      <div className="bg-[#050E20] p-6 border-2 border-[#16335F] p3r-bevel p3r-shadow-hard space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-white flex items-center space-x-2 uppercase font-p3r tracking-wider">
              <span className="w-2.5 h-2.5 bg-[#0066FF] transform rotate-45"></span>
              <span>Datos del juego</span>
            </h3>
            <p className="text-xs text-[#7E9BB8] mt-1">
              Catálogo sincronizado con Data Dragon y el cliente de LoL.
            </p>
          </div>

          <P3rButton
            variant="primary"
            size="md"
            onClick={handleRefreshGameData}
            disabled={refreshingData}
            icon={<RefreshCw className={`w-4 h-4 ${refreshingData ? 'animate-spin' : ''}`} />}
          >
            {refreshingData ? 'Actualizando...' : 'Actualizar datos del juego'}
          </P3rButton>
        </div>

        <div className="p-4 bg-[#030814] border border-[#16335F] flex flex-wrap items-center justify-between gap-3 text-xs p3r-cut-tr">
          <div className="flex flex-wrap items-center gap-3 font-mono">
            <div className="flex items-center space-x-2">
              <span className="text-[#7E9BB8]">Parche:</span>
              <span className="text-[#00E676] font-bold bg-[#050E20] px-2.5 py-1 border border-[#16335F]">
                v{formatFullPatchLabel(patchVersion)}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-[#7E9BB8]">Data Dragon:</span>
              <span className="text-[#00E5FF] bg-[#050E20] px-2.5 py-1 border border-[#16335F]">
                {versionInfo?.ddragonVersion || patchVersion}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-[#FFE277] font-bold bg-[#2A1705] border border-[#FFE277]/40 px-2.5 py-1">
                {championsCount} campeones cargados
              </span>
            </div>
          </div>

          {dataRefreshMsg && (
            <div className="text-xs text-[#00E676] font-bold bg-[#031A12] border border-[#00E676]/40 px-3 py-1">
              {dataRefreshMsg}
            </div>
          )}
        </div>
      </div>

      {/* SECCIÓN PLEGADA: Avanzado / Diagnóstico */}
      <div className="bg-[#050E20] border-2 border-[#16335F] p3r-bevel p3r-shadow-hard overflow-hidden">
        <div
          className="p-6 flex items-center justify-between cursor-pointer hover:bg-[#071329] transition"
          onClick={() => setShowAdvancedDiag(!showAdvancedDiag)}
        >
          <div>
            <h3 className="text-base font-black text-white flex items-center space-x-2 uppercase font-p3r tracking-wider">
              <span className="w-2.5 h-2.5 bg-[#FFE277] transform rotate-45"></span>
              <span>Avanzado / Diagnóstico</span>
            </h3>
            <p className="text-xs text-[#7E9BB8] mt-1">
              Herramientas de diagnóstico técnico, enlace LCU, rutas y exportación de logs.
            </p>
          </div>

          <button
            type="button"
            className="flex items-center space-x-1 text-xs font-black px-3 py-1.5 bg-[#030814] text-[#00E5FF] border border-[#16335F] transform -skew-x-8 uppercase font-p3r-head"
          >
            <span className="transform skew-x-8 flex items-center space-x-1">
              <span>{showAdvancedDiag ? 'Plegar' : 'Desplegar'}</span>
              {showAdvancedDiag ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
          </button>
        </div>

        {showAdvancedDiag && (
          <div className="p-6 pt-0 border-t-2 border-[#16335F] space-y-6">
            {/* 1. Diagnóstico de enlace LCU Engine */}
            <div className="pt-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#16335F] pb-3">
                <div className="flex items-center space-x-3">
                  <span className={`w-3 h-3 transform rotate-45 ${mainLcuState === 'connected' ? 'bg-[#00E676]' : 'bg-[#0066FF]'}`}></span>
                  <div>
                    <h4 className="text-sm font-black text-white uppercase tracking-wider font-p3r">
                      Diagnóstico en vivo // LCU Engine
                    </h4>
                    <p className="text-[11px] text-[#7E9BB8]">Canal IPC directo entre Main y Renderer</p>
                  </div>
                </div>

                {onRefreshLcu && (
                  <P3rButton
                    variant="secondary"
                    size="sm"
                    onClick={onRefreshLcu}
                    icon={<RefreshCw className="w-3.5 h-3.5 text-[#00E5FF]" />}
                  >
                    Sincronizar ahora
                  </P3rButton>
                )}
              </div>

              {/* Métricas técnicas */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                <div className="bg-[#030814] p-3 border border-[#16335F] p3r-cut-tr">
                  <div className="text-[#7E9BB8] text-[10px] uppercase font-bold font-p3r-head">Estado en Main</div>
                  <div className={`mt-1 font-bold text-sm ${mainLcuState === 'connected' ? 'text-[#00E676]' : 'text-[#FF1744]'}`}>
                    {mainLcuState.toUpperCase()}
                  </div>
                </div>

                <div className="bg-[#030814] p-3 border border-[#16335F] p3r-cut-tr">
                  <div className="text-[#7E9BB8] text-[10px] uppercase font-bold font-p3r-head">Estado en Renderer</div>
                  <div className={`mt-1 font-bold text-sm ${lcuState === 'connected' ? 'text-[#00E676]' : 'text-[#FF1744]'}`}>
                    {lcuState.toUpperCase()}
                  </div>
                </div>

                <div className="bg-[#030814] p-3 border border-[#16335F] p3r-cut-tr">
                  <div className="text-[#7E9BB8] text-[10px] uppercase font-bold font-p3r-head">Puerto LCU</div>
                  <div className="mt-1 font-bold text-white text-sm">
                    {lcuPort || 'No detectado'}
                  </div>
                </div>

                <div className="bg-[#030814] p-3 border border-[#16335F] p3r-cut-tr">
                  <div className="text-[#7E9BB8] text-[10px] uppercase font-bold font-p3r-head">Último Evento</div>
                  <div className="mt-1 text-[#00E5FF] truncate text-xs" title={`${lastIpcEvent} (${lastIpcTimestamp})`}>
                    {lastIpcTimestamp || 'N/A'} • {lastIpcEvent || 'Ninguno'}
                  </div>
                </div>
              </div>

              {/* Registro de enlace */}
              <div className="bg-[#030814] p-3 border border-[#16335F] text-xs flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-[#7E9BB8] shrink-0" />
                <span className="text-[#7E9BB8] font-bold uppercase text-[11px] font-p3r-head">Registro de enlace:</span>
                <span className={`font-mono ${lastConnectionError ? 'text-[#FF1744] font-bold' : 'text-[#00E676]'}`}>
                  {lastConnectionError || 'Conexión activa con el cliente de LoL'}
                </span>
              </div>
            </div>

            {/* 2. Ruta de instalación y Prueba de Conexión */}
            <div className="space-y-3 pt-3 border-t border-[#16335F]">
              <div className="text-xs font-bold text-white uppercase font-p3r-head">
                Ruta de Instalación de League of Legends
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={leaguePath}
                    onChange={(e) => setLeaguePath(e.target.value)}
                    placeholder="Ej: C:\Riot Games\League of Legends"
                    className="w-full bg-[#030814] border border-[#16335F] focus:border-[#00E5FF] px-4 py-2.5 text-xs text-white focus:outline-none font-mono"
                  />
                </div>

                <P3rButton
                  variant="secondary"
                  size="md"
                  onClick={handleSelectFolder}
                  icon={<FolderOpen className="w-4 h-4 text-[#00E5FF]" />}
                >
                  Examinar...
                </P3rButton>

                <P3rButton
                  variant="cyan"
                  size="md"
                  onClick={handleTestLcuConnection}
                  disabled={testingLcu}
                  icon={testingLcu ? <RefreshCw className="w-4 h-4 animate-spin text-[#030814]" /> : <Terminal className="w-4 h-4 text-[#030814]" />}
                >
                  Probar conexión
                </P3rButton>
              </div>

              {/* Reporte detallado si se probó */}
              {lcuReport && (
                <div className="space-y-3 mt-3 pt-3 border-t border-[#16335F]">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="text-white font-p3r-head uppercase">Resultado:</span>
                    <P3rBadge
                      label={lcuReport.success ? 'Conexión exitosa' : 'Fallo de conexión'}
                      variant={lcuReport.success ? 'green' : 'red'}
                    />
                  </div>

                  {lcuReport.testSteps && lcuReport.testSteps.length > 0 && (
                    <div className="space-y-1.5">
                      {lcuReport.testSteps.map((ts, idx) => (
                        <div
                          key={idx}
                          className={`p-2.5 text-xs border p3r-cut-tr ${
                            ts.status === 'success'
                              ? 'bg-[#031A12] border-[#00E676] text-[#00E676]'
                              : 'bg-[#2A050A] border-[#FF1744] text-[#FF1744]'
                          }`}
                        >
                          <div className="flex items-center justify-between font-bold">
                            <span>{ts.name}</span>
                            <span className="text-[10px] uppercase font-mono">{ts.status}</span>
                          </div>
                          <div className="text-[11px] text-[#CBD5E1] mt-0.5">{ts.summary}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. Exportación de Diagnóstico y Limpieza */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-[#16335F]">
              <div className="bg-[#030814] p-4 border border-[#16335F] p3r-cut-tr space-y-2">
                <div className="text-xs font-black text-white uppercase font-p3r-head">Exportar Diagnóstico</div>
                <p className="text-[11px] text-[#7E9BB8]">
                  Genera un archivo JSON sanitizado con logs y estado para soporte.
                </p>
                <div className="pt-1">
                  <P3rButton
                    variant="secondary"
                    size="sm"
                    onClick={handleExportDiagnostic}
                    disabled={exportingDiag}
                    icon={<Download className="w-3.5 h-3.5 text-[#00E5FF]" />}
                  >
                    {exportingDiag ? 'Exportando...' : 'Exportar diagnóstico'}
                  </P3rButton>
                </div>
                {diagMessage && (
                  <div className={`mt-2 text-[11px] p-2 border ${diagMessage.type === 'success' ? 'text-[#00E676] border-[#00E676]/40 bg-[#031A12]' : 'text-[#FF1744] border-[#FF1744]/40 bg-[#2A050A]'}`}>
                    {diagMessage.text}
                  </div>
                )}
              </div>

              <div className="bg-[#030814] p-4 border border-[#16335F] p3r-cut-tr space-y-2">
                <div className="text-xs font-black text-white uppercase font-p3r-head">Limpieza de Importaciones</div>
                <p className="text-[11px] text-[#7E9BB8]">
                  Elimina páginas de runas y conjuntos de objetos creados por la app (EAsy, [IL]).
                </p>
                <div className="pt-1">
                  <P3rButton
                    variant="danger"
                    size="sm"
                    onClick={handleCleanAssets}
                    disabled={cleaningAssets}
                    icon={cleaningAssets ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  >
                    {cleaningAssets ? 'Limpiando...' : 'Limpiar datos en cliente'}
                  </P3rButton>
                </div>
                {cleanResultMsg && (
                  <div className="mt-2 text-[11px] p-2 border border-[#00E676]/40 bg-[#031A12] text-[#00E676]">
                    {cleanResultMsg}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Monitor de Límites de Uso */}
      <div className="bg-[#050E20] p-6 border-2 border-[#16335F] p3r-bevel p3r-shadow-hard space-y-4">
        <h3 className="text-base font-black text-white flex items-center space-x-2 uppercase font-p3r tracking-wider">
          <span className="w-2.5 h-2.5 bg-[#00E5FF] transform rotate-45"></span>
          <span>Límites de uso</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          <div className="bg-[#030814] p-4 border border-[#16335F] p3r-cut-tr">
            <div className="font-bold text-white mb-2 font-p3r-head uppercase">Riot Games API</div>
            <div className="text-[#7E9BB8] space-y-1">
              <div>Límite: 20 peticiones / seg • 100 / 2 min</div>
              <div className="text-[#00E676] font-bold mt-2">Control de tasa activo</div>
            </div>
          </div>

          <div className="bg-[#030814] p-4 border border-[#16335F] p3r-cut-tr">
            <div className="font-bold text-white mb-2 font-p3r-head uppercase">Google Gemini API</div>
            <div className="text-[#7E9BB8] space-y-1">
              <div>Peticiones hoy: {quotaInfo?.standardRequestsToday ?? 0} / 1500</div>
              <div className="text-[#00E676] font-bold mt-2">Gemini 2.5 Flash</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer de versión */}
      <div className="pt-4 border-t-2 border-[#16335F] flex items-center justify-between text-[11px] text-[#7E9BB8] font-mono">
        <div>
          <span>EAsy</span> • <span>Parche: <strong className="text-white">v{formatFullPatchLabel(patchVersion)}</strong></span>
        </div>
        <div>
          <span>OP.GG & LCU</span>
        </div>
      </div>
    </div>
  );
};
