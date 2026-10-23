import React, { useState } from 'react';
import {
  Key,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  RefreshCw,
  ShieldCheck, Download,
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
import { ChampionInfo, obtenerTodosLosCampeones } from '../../shared/champions';
import { P3rButton } from '../components/p3r/P3rButton';
import { P3rBadge } from '../components/p3r/P3rBadge';

interface SettingsViewProps {
  settings: AppSettings;
  onSaveSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, onSaveSettings }) => {
  const [riotKey, setRiotKey] = useState<string>(settings.apiKeys.riotApiKeyEncrypted || '');
  const [geminiKey, setGeminiKey] = useState<string>(settings.apiKeys.geminiApiKeyEncrypted || '');
  const [showAdvancedRiotKey, setShowAdvancedRiotKey] = useState<boolean>(Boolean(settings.apiKeys.riotApiKeyEncrypted));
  const [exportingDiag, setExportingDiag] = useState<boolean>(false);
  const [diagMessage, setDiagMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
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
  const [championsCount, setChampionsCount] = useState<number>(() => obtenerTodosLosCampeones().length);
  const [catalogChampions, setCatalogChampions] = useState<ChampionInfo[]>(() => obtenerTodosLosCampeones());
  const [refreshingData, setRefreshingData] = useState<boolean>(false);
  const [dataRefreshMsg, setDataRefreshMsg] = useState<string | null>(null);
  const [quotaInfo, setQuotaInfo] = useState<any>(null);
  const [opggTier, setOpggTier] = useState<any>(settings.opggTier || 'emerald_plus');
  const [minMatchupSampleThreshold, setMinMatchupSampleThreshold] = useState<number>(settings.minMatchupSampleThreshold || 200);
  const [allowAiChoiceTop3, setAllowAiChoiceTop3] = useState<boolean>(settings.allowAiChoiceTop3 || false);
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
      if (res.championsCount) setChampionsCount(res.championsCount);
      if (res.champions && res.champions.length > 0) {
        setCatalogChampions(res.champions);
      } else if (window.api?.getChampionCatalog) {
        const cat = await window.api.getChampionCatalog();
        if (cat?.champions?.length) setCatalogChampions(cat.champions);
      }
      setDataRefreshMsg(`✓ Catálogo actualizado con éxito: Parche ${formatFullPatchLabel(res.patch)} (${res.championsCount || 173} campeones cargados, incluyendo lanzamientos recientes).`);
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


  const handleExportDiagnostic = async () => {
    setExportingDiag(true);
    setDiagMessage(null);
    try {
      if (window.api && window.api.exportDiagnostic) {
        const res = await window.api.exportDiagnostic();
        if (res.success && res.filePath) {
          setDiagMessage({
            type: 'success',
            text: `¡Diagnóstico exportado y sanitizado con éxito! Guardado en: ${res.filePath}`
          });
        } else {
          setDiagMessage({
            type: 'error',
            text: res.error || 'Error al generar el archivo de diagnóstico.'
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

  const handleSaveAll = async () => {
    await onSaveSettings({
      opggTier,
      minMatchupSampleThreshold,
      allowAiChoiceTop3,
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
    <div className="max-w-5xl mx-auto space-y-6 select-none pb-8">
      <header className="flex justify-between items-center border-b-2 border-[#16335F] pb-4">
        <div>
          <div className="inline-block px-2.5 py-0.5 mb-1.5 bg-[#0066FF] text-white text-[10px] font-black tracking-widest uppercase transform -skew-x-8 font-p3r-head p3r-shadow-blue border-l-2 border-white">
            <span className="transform skew-x-8 inline-block">SEES // SYSTEM PREFERENCES</span>
          </div>
          <h2 className="text-3xl font-black text-white tracking-wider flex items-center space-x-2 font-p3r uppercase">
            <span>AJUSTES & CLAVES DE API</span>
          </h2>
          <p className="text-xs text-[#7E9BB8] font-mono mt-0.5">Gestión de credenciales seguras (DPAPI / AES-256) y parámetros locales</p>
        </div>

        <P3rButton
          variant="cyan"
          size="lg"
          onClick={handleSaveAll}
          icon={savedSuccess ? <Check className="w-4 h-4 text-[#030814]" /> : <Save className="w-4 h-4 text-[#030814]" />}
        >
          {savedSuccess ? '¡GUARDADO!' : 'GUARDAR AJUSTES'}
        </P3rButton>
      </header>

      {/* Sección Avanzada: Riot API Key (Opcional) */}
      <div className="bg-[#050E20] p-6 border-2 border-[#16335F] p3r-bevel p3r-shadow-hard space-y-3">
        <div className="flex justify-between items-center cursor-pointer" onClick={() => setShowAdvancedRiotKey(!showAdvancedRiotKey)}>
          <div>
            <h3 className="text-sm font-black text-white flex items-center space-x-2 uppercase font-p3r tracking-wider">
              <span className="w-2.5 h-2.5 bg-[#0066FF] transform rotate-45"></span>
              <span>Avanzado: Riot Games Development API Key (Opcional)</span>
            </h3>
            <p className="text-xs text-[#7E9BB8] mt-0.5">
              Tus datos de invocador, rango e historial ya se obtienen automáticamente del cliente LoL sin Riot API. Solo configúrala si deseas buscar invocadores remotos.
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
                <span>Obtener o Renovar Clave en Riot Portal (24h) ↗</span>
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

        {/* Estado de Salud de la Riot Key */}
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
                ? 'Clave de Riot activa y respondiendo correctamente.'
                : keyHealth.isExpired
                ? '¡Clave de desarrollo expirada (Error 403 Forbidden)! Por favor renuévala en el portal de Riot Developer.'
                : `Error de validación (Código HTTP ${keyHealth.statusCode || 'desconocido'}).`}
            </span>
          </div>
        )}
      </div>

      {/* Sección 2: Google Gemini API Key */}
      <div className="bg-[#050E20] p-6 border-2 border-[#16335F] p3r-bevel p3r-shadow-hard space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-base font-black text-white flex items-center space-x-2 uppercase font-p3r tracking-wider">
              <span className="w-2.5 h-2.5 bg-[#00E5FF] transform rotate-45"></span>
              <span>Google Gemini API Key (Motor de IA Táctico)</span>
            </h3>
            <p className="text-xs text-[#7E9BB8] mt-1">
              <strong>(Opcional)</strong> La app funciona al 100% sin IA usando los datos deterministas de OP.GG. Si añades tu clave gratuita de Google AI Studio, se activan explicaciones tácticas adaptadas a la composición.
            </p>
          </div>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[#00E5FF] hover:underline font-mono"
          >
            <span>Obtener Clave Gratuita ↗</span>
          </a>
        </div>

        <div className="relative">
          <input
            type={showGeminiKey ? 'text' : 'password'}
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
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
      </div>

      {/* Sección 2.5: Automatización de Champ Select y Preferencias por Rol */}
      <RolePreferencesEditor
        settings={settings.autoChampSelect}
        onSave={(autoChampSelect) => onSaveSettings({ autoChampSelect })}
        championsCatalog={catalogChampions}
      />

      
      {/* Sección 2.8: Configuración de Datos OP.GG y Limpieza de Activos */}
      <div className="bg-[#050E20] p-6 border-2 border-[#16335F] p3r-bevel p3r-shadow-hard space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-base font-black text-white flex items-center space-x-2 uppercase font-p3r tracking-wider">
              <span className="w-2.5 h-2.5 bg-[#00E5FF] transform rotate-45"></span>
              <span>Estadísticas de Meta Competitivo (OP.GG MCP)</span>
            </h3>
            <p className="text-xs text-[#7E9BB8] mt-1">
              Filtro de nivel de juego para tasas de victoria, builds, runas y enfrentamientos (Streamable HTTP oficial de OP.GG).
            </p>
          </div>
          {versionInfo && (
            <P3rBadge label={versionInfo.displayPatch} variant="cyan" />
          )}
        </div>

        {versionInfo?.ddragonOutdated && (
          <div className="p-3 bg-[#2A1705] border-2 border-[#FFE277] text-xs text-[#FFE277] flex items-start space-x-2 p3r-cut-tr">
            <AlertTriangle className="w-4 h-4 text-[#FFE277] shrink-0 mt-0.5" />
            <div>
              <strong className="text-white font-p3r-head uppercase">Aviso de Parche Nuevo:</strong>
              <p className="mt-0.5 leading-relaxed">
                Datos del parche anterior hasta que Riot publique el nuevo catálogo en Data Dragon.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-black text-[#7E9BB8] uppercase block mb-1 font-p3r-head">
              Rango / Elo de Referencia para Builds:
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
              <option value="emerald_plus">Esmeralda + (Recomendado - Mi Elo)</option>
              <option value="diamond_plus">Diamante +</option>
              <option value="master_plus">Máster +</option>
              <option value="grandmaster">Gran Máster</option>
              <option value="challenger">Challenger</option>
              <option value="all">Todos los Rangos (Agregado)</option>
            </select>
            <p className="text-[10px] text-[#7E9BB8] mt-1 font-mono">
              Clave de caché: <code className="text-[#00E5FF]">opgg:&#123;champ&#125;:&#123;pos&#125;:&#123;rival&#125;:{opggTier}:26.20</code>
            </p>
          </div>

          <div className="flex flex-col justify-between p-3.5 bg-[#030814] border border-[#16335F] p3r-cut-tr">
            <div>
              <div className="text-xs font-black text-white uppercase font-p3r-head">Limpieza de Importaciones en LoL</div>
              <p className="text-[11px] text-[#7E9BB8] mt-0.5">
                Elimina páginas de runas y conjuntos de objetos creados por la app ([IL] Itero Local).
              </p>
            </div>
            <div className="mt-2.5">
              <P3rButton
                variant="danger"
                size="sm"
                onClick={handleCleanAssets}
                disabled={cleaningAssets}
                icon={cleaningAssets ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              >
                Borrar importaciones de la app
              </P3rButton>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t-2 border-[#16335F]">
          <div>
            <label className="text-[10px] font-black text-[#7E9BB8] uppercase block mb-1 font-p3r-head">
              Umbral Mínimo de Partidas para Matchup (B2):
            </label>
            <div className="flex items-center space-x-2 font-mono">
              <input
                type="number"
                min="50"
                max="1000"
                step="50"
                value={minMatchupSampleThreshold}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10) || 200;
                  setMinMatchupSampleThreshold(val);
                  onSaveSettings({ minMatchupSampleThreshold: val });
                }}
                className="w-32 bg-[#030814] border border-[#16335F] focus:border-[#00E5FF] px-3 py-2 text-xs text-white focus:outline-none"
              />
              <span className="text-xs text-[#7E9BB8]">partidas registradas</span>
            </div>
            <p className="text-[10px] text-[#7E9BB8] mt-1">
              Si un matchup tiene menos de este umbral, la app muestra un aviso y recurre a la build general de Esmeralda+.
            </p>
          </div>

          <div className="p-3.5 bg-[#030814] border border-[#16335F] p3r-cut-tr">
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={allowAiChoiceTop3}
                onChange={(e) => {
                  const val = e.target.checked;
                  setAllowAiChoiceTop3(val);
                  onSaveSettings({ allowAiChoiceTop3: val });
                }}
                className="mt-0.5 w-4 h-4 accent-[#0066FF] cursor-pointer"
              />
              <div>
                <span className="text-xs font-black text-white uppercase block font-p3r-head">
                  Permitir que la IA elija entre las 3 mejores opciones (B3)
                </span>
                <span className="text-[10px] text-[#7E9BB8] block mt-0.5 leading-relaxed">
                  Desactivado por defecto. Si se activa, Gemini puede escoger justificadamente entre las 3 opciones de mejor rendimiento de OP.GG.
                </span>
              </div>
            </label>
          </div>
        </div>

        {cleanResultMsg && (
          <div className="p-3 text-xs bg-[#031A12] border-2 border-[#00E676] text-[#00E676] font-bold p3r-cut-tr">
            {cleanResultMsg}
          </div>
        )}
      </div>

      {/* Sección 3: Conexión con League of Legends (LCU API) */}
      <div className="bg-[#050E20] p-6 border-2 border-[#16335F] p3r-bevel p3r-shadow-hard space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-base font-black text-white flex items-center space-x-2 uppercase font-p3r tracking-wider">
              <span className="w-2.5 h-2.5 bg-[#FFE277] transform rotate-45"></span>
              <span>Ruta de Instalación de League of Legends (LCU)</span>
            </h3>
            <p className="text-xs text-[#7E9BB8] mt-1">
              La app detecta el cliente automáticamente mediante 4 métodos secuenciales. Si tu juego está en una carpeta no estándar, puedes seleccionarla aquí.
            </p>
          </div>
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
            Probar Conexión
          </P3rButton>
        </div>

        {/* Alerta de Permisos si se detectó */}
        {lcuReport?.isPermissionError && (
          <div className="p-3.5 text-xs bg-[#2A1705] border-2 border-[#FFE277] text-[#FFE277] flex items-start space-x-2.5 p3r-cut-tr">
            <AlertTriangle className="w-5 h-5 text-[#FFE277] shrink-0 mt-0.5" />
            <div>
              <strong className="text-white font-p3r-head uppercase">Aviso de Privilegios de Windows:</strong>
              <p className="mt-0.5 leading-relaxed">
                Se detectó el proceso de League of Legends pero Windows denegó la lectura de su línea de comandos. Ejecuta Itero Local con el mismo nivel de privilegios que League of Legends (ambos como Administrador o ambos como usuario estándar).
              </p>
            </div>
          </div>
        )}

        {/* Diagnóstico detallado por método y pasos de conexión */}
        {lcuReport && (
          <div className="space-y-3 mt-3 pt-3 border-t-2 border-[#16335F]">
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="text-white font-p3r-head uppercase">Resultado de la Prueba de Conexión LCU:</span>
              <P3rBadge
                label={lcuReport.success ? 'Conexión Completada' : 'Fallo en la Conexión'}
                variant={lcuReport.success ? 'green' : 'red'}
              />
            </div>

            {/* Pasos de conexión completos */}
            {lcuReport.testSteps && lcuReport.testSteps.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-black text-[#FFE277] uppercase tracking-wider font-p3r-head">
                  Etapas de Conexión Verificadas:
                </div>
                {lcuReport.testSteps.map((ts, idx) => (
                  <div
                    key={idx}
                    className={`p-3 text-xs border-2 p3r-cut-tr ${
                      ts.status === 'success'
                        ? 'bg-[#031A12] border-[#00E676] text-[#00E676]'
                        : ts.status === 'skipped'
                        ? 'bg-[#030814] border-[#16335F] text-[#7E9BB8] opacity-60'
                        : 'bg-[#2A050A] border-[#FF1744] text-[#FF1744]'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center space-x-2">
                        <span>{ts.status === 'success' ? '✓' : ts.status === 'skipped' ? '○' : '✕'}</span>
                        <span className="text-white font-p3r-head uppercase">{ts.name}</span>
                      </span>
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 border border-current">
                        {ts.status === 'success' ? 'ÉXITO' : ts.status === 'skipped' ? 'OMITIDO' : 'FALLO'}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[#CBD5E1]">
                      {ts.summary}
                    </div>
                    <div className="mt-0.5 text-[11px] font-mono text-[#7E9BB8]">
                      {ts.details}
                    </div>
                    {ts.error && (
                      <div className="mt-1 text-[11px] font-mono text-[#FF1744] bg-black/40 p-1.5 border border-[#FF1744]/40">
                        Error: {ts.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Desglose de métodos de detección A, B, C, D */}
            <div className="space-y-1.5 mt-3 pt-2 border-t border-[#16335F]">
              <div className="text-[10px] font-black text-[#7E9BB8] uppercase tracking-wider font-p3r-head">
                Métodos de Detección Evaluados:
              </div>
              {lcuReport.steps.map((step, idx) => (
                <div
                  key={idx}
                  className={`p-2 text-xs border ${
                    step.success
                      ? 'bg-[#031A12] border-[#00E676] text-[#00E676]'
                      : 'bg-[#030814] border-[#16335F] text-[#7E9BB8]'
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span className="flex items-center space-x-2">
                      <span>{step.success ? '✓' : '✕'}</span>
                      <span className={step.success ? 'text-white' : 'text-[#7E9BB8]'}>{step.name}</span>
                    </span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 bg-[#050E20] border border-[#16335F]">
                      {step.step}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#7E9BB8] font-mono">
                    {step.details}
                  </div>
                </div>
              ))}
            </div>

            {lcuReport.logFilePath && (
              <p className="text-[10px] text-[#4A627E] mt-1 truncate font-mono">
                Archivo de log registrado en: <span className="text-[#00E5FF]">{lcuReport.logFilePath}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Sección 4: Catálogo y Datos del Juego (Data Dragon & LCU) */}
      <div className="bg-[#050E20] p-6 border-2 border-[#16335F] p3r-bevel p3r-shadow-hard space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-white flex items-center space-x-2 uppercase font-p3r tracking-wider">
              <span className="w-2.5 h-2.5 bg-[#0066FF] transform rotate-45"></span>
              <span>Datos del Juego & Parche Actual // Catálogo</span>
            </h3>
            <p className="text-xs text-[#7E9BB8] mt-1">
              Catálogo sincronizado dinámicamente con Data Dragon oficial y LCU local. Resuelve automáticamente campeones nuevos (como Yunara).
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

            <span className="text-[#4A627E] text-[11px]">• Sincronización en tiempo real</span>
          </div>

          {dataRefreshMsg && (
            <div className="text-xs text-[#00E676] font-bold bg-[#031A12] border border-[#00E676]/40 px-3 py-1">
              {dataRefreshMsg}
            </div>
          )}
        </div>
      </div>

      {/* Sección 5: Monitor de Cuotas y Límites de Tasa */}
      <div className="bg-[#050E20] p-6 border-2 border-[#16335F] p3r-bevel p3r-shadow-hard space-y-4">
        <h3 className="text-base font-black text-white flex items-center space-x-2 uppercase font-p3r tracking-wider">
          <span className="w-2.5 h-2.5 bg-[#00E5FF] transform rotate-45"></span>
          <span>Monitor de Límites de Tasa y Cuotas de IA (Frente 2)</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          <div className="bg-[#030814] p-4 border border-[#16335F] p3r-cut-tr">
            <div className="font-bold text-white mb-2 font-p3r-head uppercase">Riot Games API (Dev Tier)</div>
            <div className="text-[#7E9BB8] space-y-1.5">
              <div>Límite corto: <strong className="text-white">20 peticiones / 1 segundo</strong></div>
              <div>Límite largo: <strong className="text-white">100 peticiones / 2 minutos</strong></div>
              <div className="text-[#00E676] font-bold mt-2 pt-2 border-t border-[#16335F]">
                ✓ Rate Limiter Token Bucket Activo
              </div>
            </div>
          </div>

          <div className="bg-[#030814] p-4 border border-[#16335F] p3r-cut-tr">
            <div className="font-bold text-white mb-2 font-p3r-head uppercase">Google Gemini API (Free Tier)</div>
            <div className="text-[#7E9BB8] space-y-1.5">
              <div>Límite estándar: <strong className="text-white">15 RPM / 1,500 RPD</strong></div>
              <div>
                Peticiones hoy:{' '}
                <strong className="text-white">
                  {quotaInfo?.standardRequestsToday ?? 0} / 1,500
                </strong>
              </div>
              <div>
                Google Search Grounding:{' '}
                <span className="text-[#FFE277] font-bold">
                  {quotaInfo?.groundingAvailable ? 'Disponible' : '0 cuota libre (HTTP 429)'}
                </span>
              </div>
              <div className="text-[#00E676] font-bold mt-2 pt-2 border-t border-[#16335F]">
                ✓ Motor Táctico: Gemini 3.5 Flash
              </div>
            </div>
          </div>
        </div>

        {quotaInfo?.quotaNote && (
          <div className="p-3 bg-[#030814] border border-[#16335F] text-[11px] text-[#7E9BB8] leading-relaxed p3r-cut-tr">
            <strong className="text-white font-p3r-head uppercase">Diagnóstico de Cuota Google AI Studio: </strong>
            {quotaInfo.quotaNote}
          </div>
        )}
      </div>

      {/* Footer de versión y estado */}
      <div className="pt-4 border-t-2 border-[#16335F] flex items-center justify-between text-[11px] text-[#7E9BB8] font-mono">
        <div>
          <span>ITERO LOCAL // SEES</span> • <span>Parche Activo: <strong className="text-white">v{formatFullPatchLabel(patchVersion)}</strong></span>
        </div>
        <div>
          <span>DDragon & LCU Dynamic Sync</span> • <span>Arquitectura 100% Local</span>
        </div>
      </div>
    </div>
  );
};
