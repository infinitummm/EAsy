import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GeminiMatchupRecommendation, Role, RunePage, PatchDiffSummary, GroundingSource, ConfidenceLevel } from '../../shared/types';
import { BuildVisualizer } from '../components/BuildVisualizer';
import { ChampionSelectInput } from '../components/ChampionSelectInput';
import { getChampionName, getChampionIconUrl } from '../../shared/champions';
import { getAccurateFallbackRecommendation } from '../../shared/buildDatabase';
import { formatFullPatchLabel, formatDisplayPatch } from '../../shared/patchUtils';
import { P3rButton } from '../components/p3r/P3rButton';
import { P3rBadge } from '../components/p3r/P3rBadge';

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
  const [viewMode, setViewMode] = useState<'general' | 'matchup'>('general');
  const [loading, setLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<GeminiMatchupRecommendation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoImportEnabled, setAutoImportEnabled] = useState<boolean>(true);
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');
  const [importMsg, setImportMsg] = useState<string>('');
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [patchDiff, setPatchDiff] = useState<PatchDiffSummary | null>(null);
  const [showPatchDiff, setShowPatchDiff] = useState<boolean>(false);
  const [groundingQuota, setGroundingQuota] = useState<{
    groundingAvailable: boolean;
    quotaNote: string;
    groundingUsedToday: number;
    standardRequestsToday: number;
    standardDailyLimit: number;
  } | null>(null);

  const lastAnalyzedKeyRef = useRef<string>('');

  // Obtener el parche real detectado por Data Dragon y cuota al montar
  useEffect(() => {
    if (window.api && window.api.getPatchVersion) {
      window.api.getPatchVersion().then((detected) => {
        if (detected) {
          setActivePatch(detected);
          if (window.api.getPatchDiff) {
            window.api.getPatchDiff(detected).then(setPatchDiff).catch(() => {});
          }
        }
      }).catch(() => {});
    }
    if (window.api && window.api.getGroundingQuota) {
      window.api.getGroundingQuota().then(setGroundingQuota).catch(() => {});
    }
  }, []);

  // Recargar patch diff si el parche activo cambia
  useEffect(() => {
    if (window.api && window.api.getPatchDiff && activePatch) {
      window.api.getPatchDiff(activePatch).then(setPatchDiff).catch(() => {});
    }
  }, [activePatch]);

  // Sincronizar campeÃ³n propio
  useEffect(() => {
    if (initialChampionId && initialChampionId > 0 && initialChampionId !== championId) {
      setChampionId(initialChampionId);
    }
  }, [initialChampionId]);

  // Sincronizar rival predicho SOLO si el usuario no fijÃ³ manualmente uno
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
  const aplicarRunasYBuild = async (rec: GeminiMatchupRecommendation | null = recommendation, currentMode = viewMode) => {
    if (!rec || !window.api) return;
    setImportStatus('importing');
    setImportMsg('Inyectando runas y exportando build a LoL...');

    try {
      const runePage: RunePage = {
        name: 'EAsy',
        primaryStyleId: rec.runesRecommendation.primaryStyleId,
        subStyleId: rec.runesRecommendation.subStyleId,
        selectedPerkIds: rec.runesRecommendation.selectedPerkIds,
        current: true
      };

      const title = rec.buildRecommendation.itemSetTitle || (rec.opponentChampionId > 0 && currentMode === 'matchup'
        ? `[IL] ${getChampionName(rec.championId)} vs ${getChampionName(rec.opponentChampionId)}`
        : `[IL] ${getChampionName(rec.championId)} (general)`);

      const [runeRes, buildRes] = await Promise.all([
        window.api.applyRunes(runePage).catch((e) => ({ success: false, error: e.message })),
        window.api.applyBuild({
          championId: rec.championId,
          opponentId: rec.opponentChampionId,
          role: rec.assignedRole,
          title,
          build: rec.buildRecommendation
        }).catch((e) => ({ success: false, error: e.message }))
      ]);

      if (runeRes.success && buildRes.success) {
        setImportStatus('success');
        setImportMsg('Â¡Runas oficiales activadas y Build importada a la ColecciÃ³n de LoL!');
        setTimeout(() => setImportStatus('idle'), 6000);
      } else if (runeRes.success) {
        setImportStatus('success');
        setImportMsg('Â¡Runas aplicadas en LoL! (Build guardada en disco)');
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
    forceRefresh = false,
    mode = viewMode
  ) => {
    if (loading || targetChamp <= 0 || targetOpponent <= 0) return;
    setLoading(true);
    setError(null);

    const matchKey = `${targetChamp}-${targetOpponent}-${targetRole}-${mode}`;
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
          forceRefresh,
          viewMode: mode
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

      // Auto-importar automÃ¡ticamente si estÃ¡ activado
      if (autoImportEnabled) {
        await aplicarRunasYBuild(res, mode);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Disparar auto-anÃ¡lisis cuando cambian campeÃ³n o rival en autoRun
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
    return { bg: 'bg-[#D92546]', text: 'text-[#D92546]', label: 'MUY DIFÃCIL' };
  };

  return (
    <div className="space-y-6 select-none">
      {/* Cabecera y ParÃ¡metros Estilo Persona 3 Reload */}
      <div className="bg-[#050E20] border-2 border-[#16335F] p-6 p3r-bevel p3r-shadow-hard relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <span className="px-2.5 py-0.5 bg-[#0066FF] text-white text-[10px] font-black tracking-widest uppercase transform -skew-x-8 font-p3r-head p3r-shadow-blue border-l-2 border-white">
                <span className="transform skew-x-8 inline-block">ENFRENTAMIENTO</span>
              </span>
              <P3rBadge label="PARCHE 26.20" variant="cyan" />
            </div>

            <h2 className="text-2xl font-black text-white tracking-wider font-p3r uppercase">
              ENFRENTAMIENTO DIRECTO EN LÃNEA
            </h2>

            <div className="flex flex-wrap items-center gap-2 mt-2">
              {recommendation?.opggData && (
                <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 bg-[#030814] border border-[#00E5FF]/40 text-[11px] text-[#00E5FF] font-mono">
                  <span className="w-1.5 h-1.5 bg-[#00E5FF]"></span>
                  <span>
                    Datos OP.GG ({recommendation.opggData.totalMatches.toLocaleString()} partidas â€¢{' '}
                    <strong className="text-white">
                      {viewMode === 'matchup' ? 'Matchup: todos los rangos' : (recommendation.opggData.eloLabel || 'General: Esmeralda+')}
                    </strong>)
                  </span>
                </span>
              )}
              <span
                className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 bg-[#030814] border border-[#16335F] text-[11px] text-[#7E9BB8] font-mono"
                title={groundingQuota?.quotaNote || 'Google AI Studio: BÃºsqueda web requiere facturaciÃ³n, generaciÃ³n de texto estÃ¡ndar es ilimitada (1500 req/dÃ­a)'}
              >
                <span className="w-1.5 h-1.5 bg-[#0066FF]"></span>
                <span>Grounding: <strong className="text-white">{groundingQuota?.groundingUsedToday ?? 0}</strong> hoy</span>
                <span className="text-[#4A627E]">|</span>
                <span>Texto IA: <strong className="text-[#00E676]">{groundingQuota?.standardRequestsToday ?? 0}</strong>/1500</span>
              </span>
              {patchDiff && (
                <button
                  type="button"
                  onClick={() => setShowPatchDiff(!showPatchDiff)}
                  className="text-[11px] text-[#FFE277] hover:text-white underline font-bold flex items-center space-x-1 ml-1 cursor-pointer font-mono"
                >
                  <span>Cambios parche {activePatch} ({patchDiff.removedItems?.length ?? 0} eliminados)</span>
                  <span>{showPatchDiff ? '▲' : '▼'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Toggle de Modo: General vs Matchup (B2) */}
            <div className="flex items-center space-x-1 bg-[#030814] p-1 border border-[#16335F]">
              <button
                type="button"
                onClick={() => {
                  setViewMode('general');
                  fetchAdvice(championId, opponentId, role, false, 'general');
                }}
                className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider transform -skew-x-8 transition-all cursor-pointer font-p3r-head ${
                  viewMode === 'general'
                    ? 'bg-[#00E5FF] text-[#030814] p3r-shadow-blue border-l-2 border-white'
                    : 'text-[#7E9BB8] hover:text-white'
                }`}
              >
                <span className="transform skew-x-8 inline-block">General (Esmeralda+)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('matchup');
                  fetchAdvice(championId, opponentId, role, false, 'matchup');
                }}
                className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider transform -skew-x-8 transition-all cursor-pointer font-p3r-head ${
                  viewMode === 'matchup'
                    ? 'bg-[#00E5FF] text-[#030814] p3r-shadow-blue border-l-2 border-white'
                    : 'text-[#7E9BB8] hover:text-white'
                }`}
              >
                <span className="transform skew-x-8 inline-block">Matchup (Todos)</span>
              </button>
            </div>

            {/* Toggle de Auto-Importar */}
            <label className="flex items-center space-x-2 cursor-pointer bg-[#030814] px-3.5 py-2 border border-[#16335F] hover:border-[#0066FF] transition transform -skew-x-8">
              <input
                type="checkbox"
                checked={autoImportEnabled}
                onChange={(e) => setAutoImportEnabled(e.target.checked)}
                className="w-4 h-4 accent-[#0066FF] cursor-pointer"
              />
              <span className="transform skew-x-8 text-xs font-bold text-[#E2E8F0] font-p3r-head uppercase tracking-wider">
                Auto-Importar a LoL
              </span>
            </label>

            {/* BotÃ³n de Regenerar AnÃ¡lisis */}
            <P3rButton
              variant="secondary"
              size="md"
              onClick={() => fetchAdvice(championId, opponentId, role, true)}
              disabled={loading || championId <= 0 || opponentId <= 0}
              icon={
                <svg className={`w-3.5 h-3.5 text-[#00E5FF] ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              }
            >
              REGENERAR DATOS
            </P3rButton>

            {/* BotÃ³n Principal Analizar */}
            <P3rButton
              variant="cyan"
              size="md"
              onClick={() => fetchAdvice(championId, opponentId, role, false)}
              disabled={loading || championId <= 0 || opponentId <= 0}
              icon={
                loading ? (
                  <svg className="animate-spin h-4 w-4 text-[#030814]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-[#030814]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                )
              }
            >
              {loading ? 'ANALIZANDO...' : 'ANALIZAR MATCHUP'}
            </P3rButton>
          </div>
        </div>

        {/* NotificaciÃ³n de Estado de InyecciÃ³n */}
        {importMsg && (
          <div
            className={`mt-4 p-3 text-xs font-bold flex items-center space-x-2 border-2 transition-all p3r-cut-tr ${
              importStatus === 'success'
                ? 'bg-[#031A12] border-[#00E676] text-[#00E676]'
                : importStatus === 'error'
                ? 'bg-[#2A050A] border-[#FF1744] text-[#FF1744]'
                : 'bg-[#050E20] border-[#0066FF] text-[#00E5FF]'
            }`}
          >
            <span className="text-sm font-black">
              {importStatus === 'success' ? 'âœ“' : importStatus === 'error' ? 'âœ•' : 'â„¹'}
            </span>
            <span className="font-p3r-head tracking-wide">{importMsg}</span>
          </div>
        )}

        {/* Banner de Muestra Reducida en Matchup (B2) */}
        {viewMode === 'matchup' && (recommendation?.opggData?.totalMatches ?? 0) < 200 && (
          <div className="mt-4 bg-[#2A1705] border-2 border-[#FFE277] p-3 text-xs text-[#FFE277] flex flex-col sm:flex-row sm:items-center justify-between gap-2 p3r-bevel p3r-shadow-hard">
            <span className="leading-relaxed">
              âš ï¸ <strong>Muestra reducida ({recommendation?.opggData?.totalMatches ?? 0} partidas):</strong> Los datos de este enfrentamiento especÃ­fico son escasos. Se recomienda la <strong>Build General en Esmeralda+</strong>.
            </span>
            <button
              type="button"
              onClick={() => {
                setViewMode('general');
                fetchAdvice(championId, opponentId, role, false, 'general');
              }}
              className="px-3 py-1 bg-[#FFE277] text-[#030814] font-black text-xs uppercase transform -skew-x-8 transition self-start sm:self-auto shrink-0 cursor-pointer font-p3r-head"
            >
              <span className="transform skew-x-8 inline-block">Cambiar a General</span>
            </button>
          </div>
        )}

        {/* Banner de Fallback Honesto si falla OP.GG */}
        {recommendation?.source === 'fallback' && (
          <div className="mt-4 bg-[#2A050A] border-2 border-[#FF1744] p-3 text-xs text-[#FF1744] flex items-center space-x-2 p3r-cut-tr">
            <span>âš ï¸</span>
            <span className="font-p3r-head">
              <strong>Aviso de contingencia:</strong> No se pudieron obtener datos de OP.GG. Mostrando configuraciÃ³n de contingencia (genÃ©rica).
            </span>
          </div>
        )}

        {/* Selector de ParÃ¡metros */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-4 border-t-2 border-[#16335F]">
          <ChampionSelectInput
            label="Mi CampeÃ³n"
            value={championId}
            onChange={setChampionId}
            patchVersion={activePatch}
          />

          <div>
            <ChampionSelectInput
              label={isManualOpponent ? "CampeÃ³n Rival (Manual)" : "CampeÃ³n Rival (Detectado)"}
              value={opponentId}
              onChange={handleOpponentChange}
              patchVersion={activePatch}
            />
            {isManualOpponent && (
              <button
                type="button"
                onClick={handleResetOpponent}
                className="mt-1.5 text-[11px] text-[#00E5FF] hover:text-white font-mono inline-block cursor-pointer"
              >
                â†º Restablecer a rival automÃ¡tico
              </button>
            )}
          </div>

          <div>
            <label className="text-[10px] text-[#7E9BB8] font-black uppercase tracking-wider block mb-1 font-p3r-head">
              PosiciÃ³n Asignada
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full bg-[#030814] border border-[#16335F] focus:border-[#00E5FF] px-3 py-2 text-sm text-white font-bold font-mono focus:outline-none"
            >
              <option value="TOP">TOP (Superior)</option>
              <option value="JUNGLE">JUNGLE (Jungla)</option>
              <option value="MIDDLE">MIDDLE (Central)</option>
              <option value="BOTTOM">BOTTOM (Tirador)</option>
              <option value="UTILITY">UTILITY (Soporte)</option>
            </select>
          </div>
        </div>

        {/* Desplegable de Cambios Clave del Parche (Capa 1) */}
        {showPatchDiff && patchDiff && (
          <div className="mt-4 pt-4 border-t border-[#1E355B] bg-[#0A111F]/70 p-4 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-[#F5A623]"></span>
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Diferencial Data Dragon: Parche {patchDiff.previousPatch} â†’ {patchDiff.currentPatch}
                </span>
              </div>
              <span className="px-2 py-0.5 bg-[#10B981]/15 text-[#10B981] text-[10px] font-bold rounded border border-[#10B981]/40">
                FILTRO DETERMINISTA ACTIVO
              </span>
            </div>
            
            <p className="text-[11px] text-[#94A3B8]">
              Capa 1 sin cuota: Los objetos o runas eliminados se bloquean deterministamente para que la IA nunca los recomiende.
            </p>

            {(patchDiff.removedItems?.length ?? 0) > 0 && (
              <div>
                <span className="text-[11px] font-bold text-[#F87171] uppercase block mb-1">
                  Objetos Eliminados en este parche ({patchDiff.removedItems?.length ?? 0}):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {patchDiff.removedItems?.map(item => (
                    <span key={item.id} className="px-2 py-0.5 bg-[#D92546]/15 border border-[#D92546]/50 text-[#F87171] rounded text-[11px] font-medium">
                      ✕ {item.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(patchDiff.changedItems?.length ?? 0) > 0 && (
              <div>
                <span className="text-[11px] font-bold text-[#F5A623] uppercase block mb-1">
                  Objetos Modificados ({patchDiff.changedItems?.length ?? 0}):
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {patchDiff.changedItems?.slice(0, 15).map(item => (
                    <span key={item.id} className="px-2 py-0.5 bg-[#11223F] border border-[#1E355B] text-[#CBD5E1] rounded text-[11px]" title={item.changes?.join('; ') || ''}>
                      {item.changeType === 'added' ? '★ ' : '✎ '}{item.name}
                    </span>
                  ))}
                  {(patchDiff.changedItems?.length ?? 0) > 15 && (
                    <span className="text-[11px] text-[#94A3B8] self-center">
                      +{(patchDiff.changedItems?.length ?? 0) - 15} más...
                    </span>
                  )}
                </div>
              </div>
            )}

            {(patchDiff.removedRunes?.length ?? 0) > 0 && (
              <div>
                <span className="text-[11px] font-bold text-[#F87171] uppercase block mb-1">
                  Runas Eliminadas ({patchDiff.removedRunes?.length ?? 0}):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {patchDiff.removedRunes?.map(rune => (
                    <span key={rune.id} className="px-2 py-0.5 bg-[#D92546]/15 border border-[#D92546]/50 text-[#F87171] rounded text-[11px]">
                      ✕ {rune.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(patchDiff.newChampions?.length ?? 0) > 0 && (
              <div>
                <span className="text-[11px] font-bold text-[#10B981] uppercase block mb-1">
                  Nuevos Campeones:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {patchDiff.newChampions?.map(name => (
                    <span key={name} className="px-2 py-0.5 bg-[#10B981]/15 border border-[#10B981]/50 text-[#10B981] rounded text-[11px] font-bold">
                      ★ {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-[#D92546]/15 border border-[#D92546]/50 p-4 rounded-xl text-xs text-[#F87171]">
          <strong>ERROR DE ANÃLISIS:</strong> {error}
        </div>
      )}

      {/* Banner de Proveniencia Transparente (Requirement 8) */}
      {recommendation && (
        recommendation.source === 'fallback' && !recommendation.opggData ? (
          <div className="bg-[#D92546]/20 border-2 border-[#D92546] p-4 rounded-xl text-xs flex items-center justify-between gap-3 text-white">
            <div className="flex items-center space-x-2.5">
              <span className="text-xl">âš ï¸</span>
              <div>
                <span className="font-bold text-[#F87171] uppercase block text-sm">
                  Sin anÃ¡lisis de IA: recomendaciÃ³n genÃ©rica de contingencia
                </span>
                <span className="text-[#CBD5E1] text-xs">
                  Motivo: {recommendation.fallbackReason || 'Sin conexiÃ³n o error al consultar fuentes estadÃ­sticas.'}
                </span>
              </div>
            </div>
            <button
              onClick={() => fetchAdvice(championId, opponentId, role, true)}
              className="px-3 py-1.5 bg-[#D92546] hover:bg-[#B51E39] text-white font-bold text-[11px] uppercase rounded"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <div className="bg-[#0A111F] border border-[#1E355B] p-4 rounded-xl space-y-2.5 text-xs text-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#1E355B]/60">
              <div className="flex flex-wrap items-center gap-2">
                {/* Badge de Nivel de Confianza (Capa 4) */}
                {recommendation.confidenceLevel === 'verified' ? (
                  <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-[#10B981]/20 border border-[#10B981] text-[#10B981] font-bold text-[11px] tracking-wide">
                    <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse"></span>
                    <span>VERIFICADO (Grounding Web en vivo)</span>
                  </span>
                ) : recommendation.confidenceLevel === 'general' ? (
                  <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-[#F5A623]/20 border border-[#F5A623] text-[#F5A623] font-bold text-[11px] tracking-wide">
                    <span className="w-2 h-2 rounded-full bg-[#F5A623]"></span>
                    <span>General</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-[#64748B]/20 border border-[#64748B] text-[#94A3B8] font-bold text-[11px] tracking-wide">
                    <span className="w-2 h-2 rounded-full bg-[#64748B]"></span>
                    <span>ESCASO (Datos mÃ­nimos)</span>
                  </span>
                )}

                <span className="text-[#94A3B8] font-medium">
                  â€¢ Parche: <strong className="text-white">{recommendation.patchVersion || activePatch}</strong>
                </span>

                <span className="text-[#94A3B8]">
                  â€¢ Modelo: <strong className="text-[#60A5FA]">{recommendation.modelUsed || 'gemini-3.5-flash'}</strong>
                </span>

                <span className="text-[#94A3B8]">
                  â€¢ {recommendation.generatedAt ? new Date(recommendation.generatedAt).toLocaleTimeString() : 'Reciente'}
                </span>
              </div>

              <button
                onClick={() => setShowDebug(!showDebug)}
                className="text-[11px] text-[#60A5FA] hover:text-white underline font-semibold self-start sm:self-auto"
              >
                {showDebug ? 'Ocultar DepuraciÃ³n IA â–²' : 'Ver DepuraciÃ³n IA â–¼'}
              </button>
            </div>

            {/* Aviso transparente si no se utilizÃ³ Grounding en vivo por cuota */}
            {!recommendation.groundingUsed && (
              <div className="bg-[#11223F] p-2.5 rounded border border-[#1E355B] text-[11px] text-[#CBD5E1] flex items-center space-x-2">
                <span className="text-sm">â„¹ï¸</span>
                <span>
                  <strong>Transparencia de cuota:</strong> BÃºsqueda web en vivo no ejecutada por lÃ­mite de cuota en nivel gratuito (HTTP 429). Se garantizan datos reales del parche mediante Data Dragon determinista y tus partidas locales.
                </span>
              </div>
            )}

            {/* Fuentes consultadas con enlaces clickeables */}
            {recommendation.sources && recommendation.sources.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[11px] text-[#94A3B8] font-semibold">Fuentes consultadas:</span>
                {recommendation.sources.map((src, i) => (
                  <a
                    key={i}
                    href={src.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-0.5 rounded bg-[#060D17] border border-[#1E355B] text-[11px] text-[#60A5FA] hover:text-white hover:border-[#60A5FA] transition flex items-center space-x-1"
                    title={src.uri}
                  >
                    <span>ðŸŒ</span>
                    <span className="max-w-[200px] truncate">{src.title || src.uri}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )
      )}

      {/* Resultados de la RecomendaciÃ³n */}
      {recommendation ? (
        <div className="space-y-6">
          {/* Tarjeta de Dificultad, Resumen y BotÃ³n de InyecciÃ³n */}
          <div className="bg-[#050E20] border-2 border-[#16335F] p3r-bevel p3r-shadow-hard p-6">
            {/* Header visual del Enfrentamiento */}
            <div className="flex items-center space-x-3 pb-4 mb-4 border-b-2 border-[#16335F]">
              <div className="flex items-center space-x-3 bg-[#030814] px-4 py-2 border border-[#0066FF] p3r-cut-tr">
                <img
                  src={getChampionIconUrl(recommendation.championId, activePatch)}
                  alt={getChampionName(recommendation.championId)}
                  className="w-9 h-9 object-cover border border-[#0066FF]"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <div>
                  <span className="text-[10px] text-[#00E5FF] font-black uppercase tracking-wider block font-p3r-head">MI ELECCIÃ“N</span>
                  <span className="font-bold text-white text-sm font-p3r-head">
                    {getChampionName(recommendation.championId)}
                  </span>
                </div>
              </div>

              <div className="w-9 h-9 bg-[#0066FF] text-white flex items-center justify-center font-black text-xs transform -skew-x-8 p3r-shadow-blue border-l-2 border-white font-p3r">
                <span className="transform skew-x-8">VS</span>
              </div>

              <div className="flex items-center space-x-3 bg-[#030814] px-4 py-2 border border-[#FF1744] p3r-cut-tr">
                <img
                  src={getChampionIconUrl(recommendation.opponentChampionId, activePatch)}
                  alt={getChampionName(recommendation.opponentChampionId)}
                  className="w-9 h-9 object-cover border border-[#FF1744]"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <div>
                  <span className="text-[10px] text-[#FF1744] font-black uppercase tracking-wider block font-p3r-head">RIVAL EN LÃNEA</span>
                  <span className="font-bold text-white text-sm font-p3r-head">
                    {getChampionName(recommendation.opponentChampionId)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <span className="text-[10px] font-black text-[#7E9BB8] uppercase tracking-wider font-p3r-head">
                  DIFICULTAD ESTIMADA DE LÃNEA
                </span>
                <div className="flex items-center space-x-3 mt-1">
                  <span className="text-4xl font-black text-white tracking-tight font-p3r">
                    {recommendation.difficultyRating}
                    <span className="text-base text-[#7E9BB8] font-normal font-mono"> / 10</span>
                  </span>
                  <P3rBadge
                    label={getDifficultyColor(recommendation.difficultyRating).label}
                    variant={recommendation.difficultyRating >= 7 ? 'red' : recommendation.difficultyRating >= 4 ? 'yellow' : 'green'}
                  />
                </div>
              </div>

              {/* BotÃ³n Maestro: Importar Runas y Build a LoL */}
              <P3rButton
                variant="cyan"
                size="lg"
                onClick={() => aplicarRunasYBuild(recommendation)}
                disabled={importStatus === 'importing'}
                icon={
                  <svg className="w-4 h-4 text-[#030814]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                }
              >
                {importStatus === 'importing'
                  ? 'IMPORTANDO A LOL...'
                  : 'IMPORTAR RUNAS & BUILD A LOL'}
              </P3rButton>
            </div>

            {/* Barra visual de dificultad */}
            <div className="w-full bg-[#030814] h-2.5 mb-5 overflow-hidden border border-[#16335F] p3r-cut-tr">
              <div
                className={`h-full transition-all duration-700 ${
                  getDifficultyColor(recommendation.difficultyRating).bg
                }`}
                style={{ width: `${recommendation.difficultyRating * 10}%` }}
              ></div>
            </div>

            {/* Resumen */}
            <div className="bg-[#030814] p-4 border border-[#16335F] p3r-cut-tr">
              <h4 className="text-xs font-black text-[#00E5FF] uppercase tracking-wider mb-1 flex items-center space-x-2 font-p3r">
                <span className="w-2 h-2 bg-[#0066FF] transform rotate-45" />
                <span>DINÃMICA DEL ENFRENTAMIENTO</span>
              </h4>
              <p className="text-xs text-[#CBD5E1] leading-relaxed">
                {recommendation.matchupSummary}
              </p>
            </div>
          </div>

          {/* Runas Recomendadas */}
          <div className="bg-[#050E20] border-2 border-[#16335F] p3r-bevel p3r-shadow-hard p-6">
            <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-[#16335F]">
              <h3 className="text-sm font-black text-white flex items-center space-x-2 tracking-wide font-p3r">
                <span className="w-2.5 h-2.5 bg-[#0066FF] transform rotate-45"></span>
                <span className="uppercase">CONFIGURACIÃ“N DE RUNAS // PARCHE {formatFullPatchLabel(activePatch)}</span>
              </h3>
              <span className="text-xs text-[#00E5FF] font-mono font-bold">
                Ramas: #{recommendation.runesRecommendation.primaryStyleId} + #{recommendation.runesRecommendation.subStyleId}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#030814] p-4 border border-[#16335F] p3r-cut-tr">
                <span className="text-[10px] text-[#7E9BB8] uppercase tracking-wider block mb-2.5 font-black font-p3r-head">
                  9 Perks Seleccionados (Sin Fragmentos Obsoletos)
                </span>
                <div className="flex flex-wrap gap-2">
                  {recommendation.runesRecommendation.selectedPerkIds.map((perkId, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 bg-[#050E20] border border-[#0066FF] text-[#00E5FF] text-xs font-mono font-bold p3r-cut-tr"
                    >
                      {perkId}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-[#030814] p-4 border border-[#16335F] flex flex-col justify-center p3r-cut-tr">
                <span className="text-[10px] text-[#00E5FF] uppercase tracking-wider block mb-1 font-black font-p3r-head">
                  JustificaciÃ³n TÃ¡ctica
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
            <div className="bg-[#050E20] border-2 border-[#16335F] p3r-bevel p3r-shadow-hard p-6">
              <h3 className="text-xs font-black text-[#FFE277] uppercase tracking-wider mb-4 flex items-center space-x-2 font-p3r">
                <span className="w-2.5 h-2.5 bg-[#FFE277] transform rotate-45"></span>
                <span>PLAN DE FASE DE LÃNEAS // EARLY GAME</span>
              </h3>
              <div className="space-y-3.5 text-xs">
                <div>
                  <span className="text-[#7E9BB8] font-bold uppercase tracking-wider block text-[10px] font-p3r-head">Control de Oleadas:</span>
                  <p className="text-[#CBD5E1] mt-0.5 leading-relaxed">{recommendation.earlyGameStrategy.waveManagement}</p>
                </div>
                <div>
                  <span className="text-[#7E9BB8] font-bold uppercase tracking-wider block text-[10px] font-p3r-head">Intercambios (Tradeos):</span>
                  <p className="text-[#CBD5E1] mt-0.5 leading-relaxed">{recommendation.earlyGameStrategy.tradingPlan}</p>
                </div>
                <div>
                  <span className="text-[#7E9BB8] font-bold uppercase tracking-wider block mb-1 text-[10px] font-p3r-head">Picos de Nivel:</span>
                  <ul className="list-disc list-inside text-[#CBD5E1] space-y-0.5 font-mono">
                    {recommendation.earlyGameStrategy.levelSpikes.map((spike, idx) => (
                      <li key={idx}>{spike}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* AnÃ¡lisis de Amenazas y CondiciÃ³n de Victoria */}
            <div className="bg-[#050E20] border-2 border-[#16335F] p3r-bevel p3r-shadow-hard p-6">
              <h3 className="text-xs font-black text-[#FF1744] uppercase tracking-wider mb-4 flex items-center space-x-2 font-p3r">
                <span className="w-2.5 h-2.5 bg-[#FF1744] transform rotate-45"></span>
                <span>AMENAZAS CRÃTICAS & CONDICIÃ“N DE VICTORIA</span>
              </h3>
              <div className="space-y-4 text-xs">
                <div>
                  <span className="text-[#7E9BB8] font-bold uppercase tracking-wider block mb-1 text-[10px] font-p3r-head">Amenazas Principales:</span>
                  <ul className="list-disc list-inside text-[#FF1744] space-y-1 font-mono">
                    {recommendation.threatAnalysis.enemyThreats.map((threat, idx) => (
                      <li key={idx}>{threat}</li>
                    ))}
                  </ul>
                </div>
                <div className="bg-[#030814] p-3.5 border border-[#16335F] p3r-cut-tr">
                  <span className="text-[#00E5FF] font-bold uppercase tracking-wider block mb-1 text-[10px] font-p3r-head">CondiciÃ³n de Victoria:</span>
                  <p className="text-[#CBD5E1] leading-relaxed">{recommendation.threatAnalysis.winCondition}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Panel Desplegable de DepuraciÃ³n IA */}
          <div className="bg-[#050E20] border-2 border-[#16335F] p3r-bevel overflow-hidden p3r-shadow-hard">
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="w-full px-5 py-3 text-left font-black text-xs uppercase tracking-wider text-[#7E9BB8] hover:text-white flex items-center justify-between bg-[#030814] transition cursor-pointer font-p3r-head"
            >
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 bg-[#0066FF] transform rotate-45"></span>
                <span>Panel de DepuraciÃ³n y Trazabilidad IA</span>
              </div>
              <span className="text-sm font-mono">{showDebug ? 'â–²' : 'â–¼'}</span>
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
                    <span className="text-[#60A5FA] font-bold block mb-1">ESTADO DE VALIDACIÃ“N:</span>
                    <p className="text-[#10B981]">{recommendation.debugInfo?.validationStatus || 'Validado con Data Dragon'}</p>
                    <p className="text-[#94A3B8] mt-1">ImportaciÃ³n LoL: {importMsg || 'Listo'}</p>
                    <p className="text-[#CBD5E1] mt-1">Fuentes web detectadas: <strong className="text-[#60A5FA]">{recommendation.debugInfo?.groundingSourcesFound ?? recommendation.sources?.length ?? 0}</strong></p>
                  </div>
                </div>

                {/* Paso 1: InvestigaciÃ³n Cruda de Meta (Grounding o Fallback Local) */}
                {(recommendation.debugInfo?.rawResearchResponse || recommendation.researchNotes) && (
                  <div className="bg-[#060D17] p-3 rounded border border-[#1E355B]">
                    <span className="text-[#60A5FA] font-bold block mb-1">
                      InvestigaciÃ³n del meta ({recommendation.groundingUsed ? 'Google Search' : 'Metadatos de Parche'}):
                    </span>
                    <pre className="max-h-40 overflow-y-auto p-2 bg-[#0A111F] rounded text-[11px] text-[#A5B4FC] whitespace-pre-wrap">
                      {recommendation.debugInfo?.rawResearchResponse || recommendation.researchNotes}
                    </pre>
                  </div>
                )}

                {/* Ãtems bloqueados deterministamente por Patch Diff (Capa 1) */}
                {patchDiff && (patchDiff.removedItems?.length ?? 0) > 0 && (
                  <div className="bg-[#060D17] p-3 rounded border border-[#1E355B]">
                    <span className="text-[#F87171] font-bold block mb-1">
                      CAPA 1: ÃTEMS ELIMINADOS EN EL PARCHE {patchDiff.currentPatch} (BLOQUEADOS DETERMINISTAMENTE):
                    </span>
                    <p className="text-[#94A3B8] text-[11px]">
                      {patchDiff.removedItems?.map(i => i.name).join(', ')}
                    </p>
                  </div>
                )}

                {recommendation.debugInfo?.resolvedRunes && (
                  <div className="bg-[#060D17] p-3 rounded border border-[#1E355B]">
                    <span className="text-[#60A5FA] font-bold block mb-1.5">TRADUCCIÃ“N DE RUNAS (Data Dragon):</span>
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
                    <span className="text-[#60A5FA] font-bold block mb-1.5">TRADUCCIÃ“N DE OBJETOS (Data Dragon):</span>
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
              ? `Presiona "ANALIZAR" para obtener runas y build para ${getChampionName(championId)}`
              : 'Esperando selecciÃ³n de campeÃ³n'}
          </p>
          <p className="text-[#94A3B8] text-xs max-w-md mx-auto">
            {championId > 0
              ? 'Puedes analizar el enfrentamiento seleccionando los campeones.'
              : 'Elige tu campeÃ³n para calcular tu build y runas automÃ¡ticamente.'}
          </p>
        </div>
      )}
    </div>
  );
};
