import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GeminiMatchupRecommendation, Role, RunePage } from '../../shared/types';
import { BuildVisualizer } from '../components/BuildVisualizer';
import { ChampionSelectInput } from '../components/ChampionSelectInput';
import { getChampionName, getChampionIconUrl } from '../../shared/champions';
import { getAccurateFallbackRecommendation } from '../../shared/buildDatabase';

interface MatchupViewProps {
  initialChampionId?: number;
  initialOpponentId?: number;
  initialRole?: Role;
  patchVersion?: string;
  autoRun?: boolean;
  onOpponentChange?: (opponentId: number) => void;
}

export const MatchupView: React.FC<MatchupViewProps> = ({
  initialChampionId = 0,
  initialOpponentId = 24,  // Jax
  initialRole = 'TOP',
  patchVersion = '16.20.1',
  autoRun = false,
  onOpponentChange
}) => {
  const [championId, setChampionId] = useState<number>(initialChampionId);
  const [opponentId, setOpponentId] = useState<number>(initialOpponentId);
  const [role, setRole] = useState<Role>(initialRole);
  const [activePatch, setActivePatch] = useState<string>(patchVersion || '16.20.1');
  const [isManualOpponent, setIsManualOpponent] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<GeminiMatchupRecommendation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoImportEnabled, setAutoImportEnabled] = useState<boolean>(true);
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');
  const [importMsg, setImportMsg] = useState<string>('');
  const [showDebug, setShowDebug] = useState<boolean>(false);

  const lastAnalyzedKeyRef = useRef<string>('');

  // Obtener el parche real detectado por Data Dragon al montar
  useEffect(() => {
    if (window.api && window.api.getPatchVersion) {
      window.api.getPatchVersion().then((detected) => {
        if (detected) {
          setActivePatch(detected);
        }
      }).catch(() => {});
    }
  }, []);

  // Sincronizar campeón propio
  useEffect(() => {
    if (initialChampionId && initialChampionId > 0 && initialChampionId !== championId) {
      setChampionId(initialChampionId);
    }
  }, [initialChampionId]);

  // Sincronizar rival predicho SOLO si el usuario no fijó manualmente uno
  useEffect(() => {
    if (!isManualOpponent && initialOpponentId && initialOpponentId > 0 && initialOpponentId !== opponentId) {
      setOpponentId(initialOpponentId);
    }
  }, [initialOpponentId, isManualOpponent]);

  const handleOpponentChange = (newOpponentId: number) => {
    setOpponentId(newOpponentId);
    setIsManualOpponent(true);
    onOpponentChange?.(newOpponentId);
  };

  const handleResetOpponent = () => {
    setIsManualOpponent(false);
    if (initialOpponentId) {
      setOpponentId(initialOpponentId);
      onOpponentChange?.(initialOpponentId);
    }
  };

  useEffect(() => {
    if (initialRole && initialRole !== role) {
      setRole(initialRole);
    }
  }, [initialRole]);

  // Aplicar Runas y Build a LoL conjuntamente
  const aplicarRunasYBuild = async (rec: GeminiMatchupRecommendation | null = recommendation) => {
    if (!rec || !window.api) return;
    setImportStatus('importing');
    setImportMsg('Inyectando runas y exportando build a LoL...');

    try {
      const runePage: RunePage = {
        name: `Itero: ${getChampionName(rec.championId)} vs ${getChampionName(rec.opponentChampionId)}`,
        primaryStyleId: rec.runesRecommendation.primaryStyleId,
        subStyleId: rec.runesRecommendation.subStyleId,
        selectedPerkIds: rec.runesRecommendation.selectedPerkIds,
        current: true
      };

      const [runeRes, buildRes] = await Promise.all([
        window.api.applyRunes(runePage).catch((e) => ({ success: false, error: e.message })),
        window.api.applyBuild({
          championId: rec.championId,
          title: `Itero: ${getChampionName(rec.championId)} vs ${getChampionName(rec.opponentChampionId)}`,
          build: rec.buildRecommendation
        }).catch((e) => ({ success: false, error: e.message }))
      ]);

      if (runeRes.success && buildRes.success) {
        setImportStatus('success');
        setImportMsg('¡Runas oficiales activadas y Build importada a la Colección de LoL!');
        setTimeout(() => setImportStatus('idle'), 6000);
      } else if (runeRes.success) {
        setImportStatus('success');
        setImportMsg('¡Runas aplicadas en LoL! (Build guardada en disco)');
        setTimeout(() => setImportStatus('idle'), 6000);
      } else {
        setImportStatus('error');
        setImportMsg(runeRes.error || buildRes.error || 'Error al aplicar');
        setTimeout(() => setImportStatus('idle'), 6000);
      }
    } catch (err: unknown) {
      setImportStatus('error');
      setImportMsg(err instanceof Error ? err.message : String(err));
      setTimeout(() => setImportStatus('idle'), 6000);
    }
  };

  const fetchAdvice = async (
    targetChamp = championId,
    targetOpponent = opponentId,
    targetRole = role,
    forceRefresh = false
  ) => {
    if (loading || targetChamp <= 0 || targetOpponent <= 0) return;
    setLoading(true);
    setError(null);

    const matchKey = `${targetChamp}-${targetOpponent}-${targetRole}`;
    lastAnalyzedKeyRef.current = matchKey;

    try {
      let res: GeminiMatchupRecommendation;
      if (window.api && window.api.getMatchupAdvice) {
        res = await window.api.getMatchupAdvice({
          championId: targetChamp,
          opponentId: targetOpponent,
          role: targetRole,
          patch: activePatch,
          allies: [],
          enemies: [],
          forceRefresh
        });
      } else {
        res = getAccurateFallbackRecommendation({
          championId: targetChamp,
          opponentId: targetOpponent,
          role: targetRole,
          patch: activePatch
        });
      }

      setRecommendation(res);

      // Auto-importar automáticamente si está activado
      if (autoImportEnabled) {
        await aplicarRunasYBuild(res);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Disparar auto-análisis cuando cambian campeón o rival en autoRun
  useEffect(() => {
    if (autoRun && championId > 0 && opponentId > 0) {
      const key = `${championId}-${opponentId}-${role}`;
      if (key !== lastAnalyzedKeyRef.current) {
        fetchAdvice(championId, opponentId, role, false);
      }
    }
  }, [autoRun, championId, opponentId, role]);

  const getDifficultyColor = (diff: number) => {
    if (diff <= 3) return { bg: 'bg-[#10B981]', text: 'text-[#10B981]', label: 'FAVORABLE' };
    if (diff <= 6) return { bg: 'bg-[#F5A623]', text: 'text-[#F5A623]', label: 'EQUILIBRADO' };
    if (diff <= 8) return { bg: 'bg-[#F97316]', text: 'text-[#F97316]', label: 'DESAFIANTE' };
    return { bg: 'bg-[#D92546]', text: 'text-[#D92546]', label: 'MUY DIFÍCIL' };
  };

  return (
    <div className="space-y-6">
      {/* Cabecera y Parámetros Estilo Persona 3 Reload */}
      <div className="bg-[#0D192D] border border-[#1E355B] rounded-xl p-6 shadow-xl relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-block px-2 py-0.5 mb-2 bg-[#0070EB] text-white text-[10px] font-bold tracking-wider uppercase transform -skew-x-6">
              ANÁLISIS TÁCTICO
            </div>
            <h2 className="text-xl font-bold text-white tracking-wide">
              ENFRENTAMIENTO DIRECTO EN LÍNEA
            </h2>
            <p className="text-xs text-[#94A3B8] mt-1">
              Build de objetos in-game, runas completas y tácticas para el parche <span className="text-[#60A5FA] font-bold">{activePatch}</span>.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {/* Toggle de Auto-Importar */}
            <label className="flex items-center space-x-2 cursor-pointer bg-[#0A111F] px-3 py-2 rounded border border-[#1E355B] hover:border-[#2A4878] transition">
              <input
                type="checkbox"
                checked={autoImportEnabled}
                onChange={(e) => setAutoImportEnabled(e.target.checked)}
                className="w-4 h-4 accent-[#0070EB] rounded cursor-pointer"
              />
              <span className="text-xs font-semibold text-[#E2E8F0]">
                Auto-Importar a LoL
              </span>
            </label>

            {/* Botón de Regenerar Análisis (fuerza llamada fresca a Gemini ignorando caché) */}
            <button
              onClick={() => fetchAdvice(championId, opponentId, role, true)}
              disabled={loading || championId <= 0 || opponentId <= 0}
              title="Ignora la caché y genera una consulta nueva a Gemini"
              className="px-3.5 py-2.5 bg-[#11223F] hover:bg-[#1A335B] text-white disabled:opacity-40 font-bold text-xs uppercase tracking-wider rounded border border-[#1E355B] hover:border-[#0070EB] transition-all flex items-center space-x-1.5 transform -skew-x-6 active:scale-95"
            >
              <div className="transform skew-x-6 flex items-center space-x-1.5">
                <svg className={`w-3.5 h-3.5 text-[#60A5FA] ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>REGENERAR</span>
              </div>
            </button>

            {/* Botón Principal Analizar */}
            <button
              onClick={() => fetchAdvice(championId, opponentId, role, false)}
              disabled={loading || championId <= 0 || opponentId <= 0}
              className="px-5 py-2.5 bg-[#0070EB] hover:bg-[#005CE6] disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider rounded transition-all flex items-center justify-center space-x-2 transform -skew-x-6 active:scale-95 shadow-md"
            >
              <div className="transform skew-x-6 flex items-center space-x-2">
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    <span>ANALIZANDO...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>ANALIZAR MATCHUP</span>
                  </>
                )}
              </div>
            </button>
          </div>
        </div>

        {/* Notificación de Estado de Inyección */}
        {importMsg && (
          <div
            className={`mt-4 p-3 rounded text-xs font-semibold flex items-center space-x-2 border transition-all ${
              importStatus === 'success'
                ? 'bg-[#10B981]/15 border-[#10B981]/50 text-[#10B981]'
                : importStatus === 'error'
                ? 'bg-[#D92546]/15 border-[#D92546]/50 text-[#F87171]'
                : 'bg-[#0070EB]/15 border-[#0070EB]/50 text-[#60A5FA]'
            }`}
          >
            <span className="text-sm">
              {importStatus === 'success' ? '✓' : importStatus === 'error' ? '✕' : 'ℹ'}
            </span>
            <span>{importMsg}</span>
          </div>
        )}

        {/* Selector de Parámetros */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-4 border-t border-[#1E355B]">
          <ChampionSelectInput
            label="Mi Campeón"
            value={championId}
            onChange={setChampionId}
            patchVersion={activePatch}
          />

          <div>
            <ChampionSelectInput
              label={isManualOpponent ? "Campeón Rival (Manual)" : "Campeón Rival (Detectado)"}
              value={opponentId}
              onChange={handleOpponentChange}
              patchVersion={activePatch}
            />
            {isManualOpponent && (
              <button
                type="button"
                onClick={handleResetOpponent}
                className="mt-1 text-[11px] text-[#60A5FA] hover:text-white underline inline-block"
              >
                ↺ Restablecer a rival automático
              </button>
            )}
          </div>

          <div>
            <label className="text-xs text-[#94A3B8] font-medium block mb-1">
              Posición Asignada
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full bg-[#0A111F] border border-[#1E355B] rounded px-3 py-2 text-sm text-white font-semibold focus:outline-none focus:border-[#0070EB]"
            >
              <option value="TOP">TOP (Superior)</option>
              <option value="JUNGLE">JUNGLE (Jungla)</option>
              <option value="MIDDLE">MIDDLE (Central)</option>
              <option value="BOTTOM">BOTTOM (Tirador)</option>
              <option value="UTILITY">UTILITY (Soporte)</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-[#D92546]/15 border border-[#D92546]/50 p-4 rounded-xl text-xs text-[#F87171]">
          <strong>ERROR DE ANÁLISIS:</strong> {error}
        </div>
      )}

      {/* Banner de Proveniencia Transparente (Requirement 8) */}
      {recommendation && (
        recommendation.source === 'fallback' ? (
          <div className="bg-[#D92546]/20 border-2 border-[#D92546] p-4 rounded-xl text-xs flex items-center justify-between gap-3 text-white">
            <div className="flex items-center space-x-2.5">
              <span className="text-xl">⚠️</span>
              <div>
                <span className="font-bold text-[#F87171] uppercase block text-sm">
                  Sin análisis de IA: recomendación genérica de contingencia
                </span>
                <span className="text-[#CBD5E1] text-xs">
                  Motivo: {recommendation.fallbackReason || 'Sin API Key configurada o error de validación en la respuesta del modelo.'}
                </span>
              </div>
            </div>
            <button
              onClick={() => fetchAdvice(championId, opponentId, role, true)}
              className="px-3 py-1.5 bg-[#D92546] hover:bg-[#B51E39] text-white font-bold text-[11px] uppercase rounded"
            >
              Reintentar con IA
            </button>
          </div>
        ) : (
          <div className="bg-[#10B981]/15 border border-[#10B981]/40 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between text-white">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] animate-pulse"></span>
              <span className="font-bold text-[#10B981] uppercase tracking-wide">
                IA: {recommendation.modelUsed || 'Gemini 3.5 Flash'}
              </span>
              <span className="text-[#94A3B8]">
                • Generado en vivo ({recommendation.generatedAt ? new Date(recommendation.generatedAt).toLocaleTimeString() : 'reciente'})
              </span>
            </div>
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="text-[11px] text-[#60A5FA] hover:text-white underline font-semibold"
            >
              {showDebug ? 'Ocultar Depuración IA ▲' : 'Ver Depuración IA ▼'}
            </button>
          </div>
        )
      )}

      {/* Resultados de la Recomendación */}
      {recommendation ? (
        <div className="space-y-6">
          {/* Tarjeta de Dificultad, Resumen y Botón de Inyección */}
          <div className="bg-[#0D192D] border border-[#1E355B] rounded-xl p-6 shadow-xl">
            {/* Header visual del Enfrentamiento */}
            <div className="flex items-center space-x-3 pb-4 mb-4 border-b border-[#1E355B]">
              <div className="flex items-center space-x-3 bg-[#0A111F] px-3.5 py-2 rounded border border-[#0070EB]/60">
                <img
                  src={getChampionIconUrl(recommendation.championId, activePatch)}
                  alt={getChampionName(recommendation.championId)}
                  className="w-8 h-8 rounded object-cover border border-[#0070EB]"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <div>
                  <span className="text-[10px] text-[#60A5FA] font-bold uppercase block">MI ELECCIÓN</span>
                  <span className="font-bold text-white text-sm">
                    {getChampionName(recommendation.championId)}
                  </span>
                </div>
              </div>

              <div className="w-8 h-8 rounded bg-[#11223F] border border-[#1E355B] flex items-center justify-center font-bold text-xs text-[#94A3B8]">
                VS
              </div>

              <div className="flex items-center space-x-3 bg-[#0A111F] px-3.5 py-2 rounded border border-[#D92546]/60">
                <img
                  src={getChampionIconUrl(recommendation.opponentChampionId, activePatch)}
                  alt={getChampionName(recommendation.opponentChampionId)}
                  className="w-8 h-8 rounded object-cover border border-[#D92546]"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <div>
                  <span className="text-[10px] text-[#F87171] font-bold uppercase block">RIVAL EN LÍNEA</span>
                  <span className="font-bold text-white text-sm">
                    {getChampionName(recommendation.opponentChampionId)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <span className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">
                  DIFICULTAD ESTIMADA DE LÍNEA
                </span>
                <div className="flex items-center space-x-3 mt-1">
                  <span className="text-3xl font-bold text-white tracking-tight">
                    {recommendation.difficultyRating}
                    <span className="text-base text-[#94A3B8] font-normal"> / 10</span>
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded text-xs font-bold tracking-wider ${
                      getDifficultyColor(recommendation.difficultyRating).text
                    } bg-[#0A111F] border border-current`}
                  >
                    {getDifficultyColor(recommendation.difficultyRating).label}
                  </span>
                </div>
              </div>

              {/* Botón Maestro: Importar Runas y Build a LoL */}
              <button
                onClick={() => aplicarRunasYBuild(recommendation)}
                disabled={importStatus === 'importing'}
                className="px-5 py-3 rounded bg-[#0070EB] hover:bg-[#005CE6] text-white font-bold text-xs uppercase tracking-wider shadow-md transition-all flex items-center space-x-2 transform -skew-x-6 active:scale-95"
              >
                <div className="transform skew-x-6 flex items-center space-x-2">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>
                    {importStatus === 'importing'
                      ? 'IMPORTANDO A LOL...'
                      : 'IMPORTAR RUNAS & BUILD A LOL'}
                  </span>
                </div>
              </button>
            </div>

            {/* Barra visual de dificultad */}
            <div className="w-full bg-[#0A111F] rounded-full h-2 mb-5 overflow-hidden border border-[#1E355B]">
              <div
                className={`h-2 rounded-full transition-all duration-700 ${
                  getDifficultyColor(recommendation.difficultyRating).bg
                }`}
                style={{ width: `${recommendation.difficultyRating * 10}%` }}
              ></div>
            </div>

            {/* Resumen */}
            <div className="bg-[#0A111F] p-4 rounded border border-[#1E355B]">
              <h4 className="text-xs font-bold text-[#60A5FA] uppercase tracking-wider mb-1 flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 bg-[#0070EB] rounded-full" />
                <span>DINÁMICA DEL ENFRENTAMIENTO</span>
              </h4>
              <p className="text-xs text-[#CBD5E1] leading-relaxed">
                {recommendation.matchupSummary}
              </p>
            </div>
          </div>

          {/* Runas Recomendadas */}
          <div className="bg-[#0D192D] border border-[#1E355B] rounded-xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#1E355B]">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2 tracking-wide">
                <span className="w-2 h-2 rounded-full bg-[#0070EB]"></span>
                <span className="uppercase">Configuración de Runas Oficial (Parche {activePatch})</span>
              </h3>
              <span className="text-xs text-[#60A5FA] font-mono font-semibold">
                Ramas: {recommendation.runesRecommendation.primaryStyleId} + {recommendation.runesRecommendation.subStyleId}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#0A111F] p-4 rounded border border-[#1E355B]">
                <span className="text-[11px] text-[#94A3B8] uppercase tracking-wider block mb-2.5 font-semibold">
                  9 Perks Seleccionados (Sin Fragmentos Obsoletos)
                </span>
                <div className="flex flex-wrap gap-2">
                  {recommendation.runesRecommendation.selectedPerkIds.map((perkId, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 bg-[#11223F] border border-[#1E355B] text-white rounded text-xs font-mono font-bold"
                    >
                      {perkId}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-[#0A111F] p-4 rounded border border-[#1E355B] flex flex-col justify-center">
                <span className="text-[11px] text-[#60A5FA] uppercase tracking-wider block mb-1 font-semibold">
                  Justificación Táctica
                </span>
                <p className="text-xs text-[#CBD5E1] leading-relaxed">
                  {recommendation.runesRecommendation.rationale}
                </p>
              </div>
            </div>
          </div>

          {/* Visualizador de Build de Objetos in-game y Orden de Habilidades */}
          <BuildVisualizer
            build={recommendation.buildRecommendation}
            skillOrder={recommendation.skillOrder}
            patch={activePatch}
          />

          {/* Estrategia de Early Game y Amenazas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Early Game Plan */}
            <div className="bg-[#0D192D] border border-[#1E355B] rounded-xl p-6 shadow-xl">
              <h3 className="text-xs font-bold text-[#F5A623] uppercase tracking-wider mb-4 flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-[#F5A623]"></span>
                <span>Plan de Fase de Líneas (Early Game)</span>
              </h3>
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[#94A3B8] font-semibold uppercase block">Control de Oleadas:</span>
                  <p className="text-[#CBD5E1] mt-0.5">{recommendation.earlyGameStrategy.waveManagement}</p>
                </div>
                <div>
                  <span className="text-[#94A3B8] font-semibold uppercase block">Intercambios (Tradeos):</span>
                  <p className="text-[#CBD5E1] mt-0.5">{recommendation.earlyGameStrategy.tradingPlan}</p>
                </div>
                <div>
                  <span className="text-[#94A3B8] font-semibold uppercase block mb-1">Picos de Nivel:</span>
                  <ul className="list-disc list-inside text-[#CBD5E1] space-y-0.5">
                    {recommendation.earlyGameStrategy.levelSpikes.map((spike, idx) => (
                      <li key={idx}>{spike}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Análisis de Amenazas y Condición de Victoria */}
            <div className="bg-[#0D192D] border border-[#1E355B] rounded-xl p-6 shadow-xl">
              <h3 className="text-xs font-bold text-[#D92546] uppercase tracking-wider mb-4 flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-[#D92546]"></span>
                <span>Amenazas Críticas y Condición de Victoria</span>
              </h3>
              <div className="space-y-4 text-xs">
                <div>
                  <span className="text-[#94A3B8] font-semibold uppercase block mb-1">Amenazas Principales:</span>
                  <ul className="list-disc list-inside text-[#F87171] space-y-1">
                    {recommendation.threatAnalysis.enemyThreats.map((threat, idx) => (
                      <li key={idx}>{threat}</li>
                    ))}
                  </ul>
                </div>
                <div className="bg-[#0A111F] p-3 rounded border border-[#1E355B]">
                  <span className="text-[#60A5FA] font-semibold uppercase block mb-1">Condición de Victoria:</span>
                  <p className="text-[#CBD5E1]">{recommendation.threatAnalysis.winCondition}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Panel Desplegable de Depuración IA (Requirement 8) */}
          <div className="bg-[#0A111F] border border-[#1E355B] rounded-xl overflow-hidden shadow-md">
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="w-full px-5 py-3 text-left font-bold text-xs uppercase tracking-wider text-[#94A3B8] hover:text-white flex items-center justify-between bg-[#0D192D]/70 transition"
            >
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-[#0070EB]"></span>
                <span>Panel de Depuración y Trazabilidad IA</span>
              </div>
              <span className="text-sm">{showDebug ? '▲' : '▼'}</span>
            </button>

            {showDebug && (
              <div className="p-5 space-y-4 text-xs font-mono border-t border-[#1E355B]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-[#060D17] p-3 rounded border border-[#1E355B]">
                    <span className="text-[#60A5FA] font-bold block mb-1">PROVENIENCIA Y MODELO:</span>
                    <p className="text-white">Fuente: <span className="text-[#10B981] font-bold">{recommendation.source || 'gemini'}</span></p>
                    <p className="text-white">Modelo: <span className="text-[#F5A623]">{recommendation.modelUsed || 'gemini-3.5-flash'}</span></p>
                    <p className="text-white">Generado en: {recommendation.generatedAt || 'No registrado'}</p>
                    <p className="text-white">Parche detectado: {activePatch}</p>
                  </div>

                  <div className="bg-[#060D17] p-3 rounded border border-[#1E355B]">
                    <span className="text-[#60A5FA] font-bold block mb-1">ESTADO DE VALIDACIÓN:</span>
                    <p className="text-[#10B981]">{recommendation.debugInfo?.validationStatus || 'Validado con Data Dragon'}</p>
                    <p className="text-[#94A3B8] mt-1">Importación LoL: {importMsg || 'Listo'}</p>
                  </div>
                </div>

                {recommendation.debugInfo?.resolvedRunes && (
                  <div className="bg-[#060D17] p-3 rounded border border-[#1E355B]">
                    <span className="text-[#60A5FA] font-bold block mb-1.5">TRADUCCIÓN DE RUNAS (Data Dragon):</span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {recommendation.debugInfo.resolvedRunes.map((r, i) => (
                        <div key={i} className="text-[11px] text-[#CBD5E1]">
                          <span className="text-[#94A3B8]">{r.requested}:</span> <span className="text-[#F5A623] font-bold">{r.resolvedId}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {recommendation.debugInfo?.resolvedItems && (
                  <div className="bg-[#060D17] p-3 rounded border border-[#1E355B]">
                    <span className="text-[#60A5FA] font-bold block mb-1.5">TRADUCCIÓN DE OBJETOS (Data Dragon):</span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {recommendation.debugInfo.resolvedItems.map((item, i) => (
                        <div key={i} className="text-[11px] text-[#CBD5E1]">
                          <span className="text-[#94A3B8]">{item.requested}:</span> <span className="text-[#10B981] font-bold">{item.resolvedId}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {recommendation.debugInfo?.rawResponse && (
                  <div className="bg-[#060D17] p-3 rounded border border-[#1E355B]">
                    <span className="text-[#60A5FA] font-bold block mb-1">RESPUESTA CRUDA DE GEMINI:</span>
                    <pre className="max-h-48 overflow-y-auto p-2 bg-[#0A111F] rounded text-[11px] text-[#A5B4FC] whitespace-pre-wrap">
                      {recommendation.debugInfo.rawResponse}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-[#0D192D] border border-[#1E355B] rounded-xl shadow-md">
          <svg className="w-12 h-12 text-[#64748B] mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-white text-sm font-semibold mb-1">
            {championId > 0
              ? `Presiona "ANALIZAR MATCHUP" para obtener runas y build para ${getChampionName(championId)}`
              : 'Esperando selección de campeón'}
          </p>
          <p className="text-[#94A3B8] text-xs max-w-md mx-auto">
            {championId > 0
              ? 'Puedes analizar el enfrentamiento manualmente o permitir que Itero lo sincronice automáticamente.'
              : 'Elige tu campeón en League of Legends o búscalo en el selector superior para calcular tu build y runas automáticamente.'}
          </p>
        </div>
      )}
    </div>
  );
};
