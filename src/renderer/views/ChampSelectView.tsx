import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChampSelectSession, ChampSelectPlayer, Role, AppSettings, RunePage } from '../../shared/types';
import { DEFAULT_APP_SETTINGS } from '../../shared/constants';
import { IPC_CHANNELS } from '../../shared/events';
import { RolePreferencesEditor } from '../components/RolePreferencesEditor';
import { MetaSuggestionsPanel } from '../components/MetaSuggestionsPanel';
import { MatchupView } from './MatchupView';
import { getChampionName, getChampionIconUrl, getChampionById } from '../../shared/champions';
import { getAccurateFallbackRecommendation } from '../../shared/buildDatabase';
import {
  extractLocalChampionId,
  extractPlayerChampionId,
  detectPlayerRole,
  predictOpponentId,
  normalizeRole
} from '../../shared/roleDetection';
import {
  Swords,
  Shield,
  Zap,
  Sparkles,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Target,
  Ban,
  Check,
  Flame,
  ArrowRight
} from 'lucide-react';
import { P3rButton } from '../components/p3r/P3rButton';
import { P3rBadge } from '../components/p3r/P3rBadge';

interface ChampSelectViewProps {
  settings: AppSettings;
  onSaveSettings: (settings: Partial<AppSettings>) => void;
}

export const ChampSelectView: React.FC<ChampSelectViewProps> = ({
  settings,
  onSaveSettings
}) => {
  const [session, setSession] = useState<ChampSelectSession | null>(null);
  const [activeTab, setActiveTab] = useState<'live' | 'suggestions' | 'builds' | 'preferences'>('live');
  const [inspectedBuildTarget, setInspectedBuildTarget] = useState<{ championId: number; role: Role }>({
    championId: 103, // Ahri por defecto para explorar builds de inmediato
    role: 'MIDDLE',
  });
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [manualOpponentId, setManualOpponentId] = useState<number | null>(null);

  // Estados de Recomendaciones de Draft (IA Gemini)
  const [draftRecs, setDraftRecs] = useState<any | null>(null);
  const [draftLoading, setDraftLoading] = useState<boolean>(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [pickableIds, setPickableIds] = useState<number[]>([]);
  const [hoveringId, setHoveringId] = useState<number | null>(null);
  const [hoverResult, setHoverResult] = useState<{
    success?: boolean;
    error?: string;
    championId?: number;
    timestamp?: number;
  } | null>(null);
  const [showAiDebug, setShowAiDebug] = useState<boolean>(false);
  const lastDraftQueryRef = useRef<string>('');

  useEffect(() => {
    if (!window.api || !window.api.on) return;

    // Consultar sesión activa de inmediato al montar la vista
    if ((window.api as any).getChampSelectSession) {
      (window.api as any).getChampSelectSession().then((data: any) => {
        if (data) {
          setSession(data);
        }
      }).catch(() => {});
    }

    const unsubscribe = window.api.on(
      IPC_CHANNELS.LCU_CHAMP_SELECT_SESSION,
      (data: ChampSelectSession | null) => {
        setSession(data);
        if (!data) {
          setManualOpponentId(null);
          setDraftRecs(null);
          setHoverResult(null);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Temporizador fiel en tiempo real: sincronizado segundo a segundo
  useEffect(() => {
    if (!session?.timer) {
      setRemainingSeconds(0);
      return;
    }

    const durationLeft = session.timer.adjustedTimeLeftInPhase || 0;
    const targetEnd = Date.now() + durationLeft;

    const tick = () => {
      const msLeft = Math.max(0, targetEnd - Date.now());
      setRemainingSeconds(Math.ceil(msLeft / 1000));
    };

    tick();
    const timerInterval = setInterval(tick, 200);
    return () => clearInterval(timerInterval);
  }, [session?.timer?.adjustedTimeLeftInPhase, session?.timer?.phase]);

  const localPlayer = session?.myTeam.find((p) => p.cellId === session.localPlayerCellId);
  const myChampionId = extractLocalChampionId(session);
  const localRole: Role = detectPlayerRole(localPlayer, session, myChampionId);

  const predictedOpponentId = predictOpponentId(session, localPlayer, localRole, myChampionId);
  const activeOpponentId = manualOpponentId !== null ? manualOpponentId : predictedOpponentId;

  // Consultar IDs de campeones elegibles desde LCU (/lol-champ-select/v1/pickable-champion-ids)
  useEffect(() => {
    if (session && window.api?.getPickableChampions) {
      window.api.getPickableChampions().then((ids) => {
        if (Array.isArray(ids) && ids.length > 0) {
          setPickableIds(ids);
        }
      }).catch(() => {});
    }
  }, [session?.timer?.phase, session?.localPlayerCellId]);

  // Detección de turnos y acciones activas
  const allActions = session?.actions?.flat() || [];
  const myActionInProgress = allActions.find(
    (a) => a.actorCellId === session?.localPlayerCellId && a.isInProgress && !a.completed
  );
  const isMyPickTurn = myActionInProgress?.type === 'pick';
  const isMyBanTurn = myActionInProgress?.type === 'ban';
  const currentGlobalAction = allActions.find((a) => a.isInProgress && !a.completed);

  // Detección de campeones revelados en el equipo enemigo
  const revealedEnemies = useMemo(() => {
    if (!session?.theirTeam) return [];
    return session.theirTeam
      .map((p) => {
        const champId = extractPlayerChampionId(p, session);
        if (champId <= 0) return null;
        const pRole = detectPlayerRole(p, session, champId);
        return {
          cellId: p.cellId,
          championId: champId,
          championName: getChampionName(champId),
          role: pRole,
        };
      })
      .filter(Boolean) as Array<{ cellId: number; championId: number; championName: string; role: Role }>;
  }, [session?.theirTeam]);

  // Identificar el rival directo prioritario para calcular counters
  const directLaneRival = useMemo(() => {
    if (manualOpponentId && manualOpponentId > 0) {
      const found = revealedEnemies.find((e) => e.championId === manualOpponentId);
      if (found) return found;
      return {
        cellId: -1,
        championId: manualOpponentId,
        championName: getChampionName(manualOpponentId),
        role: localRole,
      };
    }
    const sameRole = revealedEnemies.find((e) => e.role === localRole);
    if (sameRole) return sameRole;
    return revealedEnemies[0] || null;
  }, [revealedEnemies, manualOpponentId, localRole]);

  // Estado para los counters en vivo obtenidos de OP.GG MCP (Sin consumo de tokens IA)
  const [opggLiveCounters, setOpggLiveCounters] = useState<
    Record<number, Array<{ championId: number; championName: string; winRate: number; play: number }>>
  >({});
  const fetchedOpponentsRef = useRef<Set<number>>(new Set());

  // Estado y funciones de importación directa a League of Legends
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const handleApplyCurrentBuildAndRunes = async (targetChampionId?: number) => {
    const champToApply = targetChampionId || myChampionId;
    if (!champToApply || champToApply <= 0) return;
    setImportStatus('importing');
    setImportMsg('Importando runas y build a League of Legends...');
    try {
      const targetOpponentId = (activeOpponentId && activeOpponentId > 0) ? activeOpponentId : 0;
      const rec = getAccurateFallbackRecommendation({
        championId: champToApply,
        opponentId: targetOpponentId,
        role: localRole,
        patch: '26.20',
      });

      const runesRec = rec.runesRecommendation || {
        primaryStyleId: 8000,
        subStyleId: 8100,
        selectedPerkIds: [8005, 9101, 9103, 8014, 8139, 8135, 5008, 5008, 5011],
      };

      const runePage: RunePage = {
        name: `EAsy ${getChampionName(champToApply)}`,
        primaryStyleId: runesRec.primaryStyleId,
        subStyleId: runesRec.subStyleId,
        selectedPerkIds: runesRec.selectedPerkIds,
        current: true,
      };

      const buildData = rec.buildRecommendation || {
        startingItems: [1055, 2003],
        coreItems: [3031, 3046, 3036],
        situationalItems: [
          { itemId: 3026, condition: 'Resistencia' },
          { itemId: 3139, condition: 'Limpieza' },
        ],
        boots: 3006,
      };

      const [runeRes, buildRes] = await Promise.all([
        window.api?.applyRunes ? window.api.applyRunes(runePage) : Promise.resolve({ success: false, error: 'No disponible' }),
        window.api?.applyBuild
          ? window.api.applyBuild({
              championId: champToApply,
              championKey: getChampionById(champToApply)?.key || getChampionName(champToApply),
              opponentId: targetOpponentId,
              role: localRole,
              title: `EAsy // ${getChampionName(champToApply)} (${localRole})`,
              build: buildData,
            })
          : Promise.resolve({ success: false, error: 'No disponible' }),
      ]);

      if (runeRes?.success || buildRes?.success) {
        setImportStatus('success');
        setImportMsg('Runas oficiales y conjunto de objetos importados a League of Legends');
      } else {
        setImportStatus('error');
        const errDesc = (runeRes as any)?.error || (buildRes as any)?.error || 'No se pudo comunicar con el cliente';
        setImportMsg(errDesc);
      }
    } catch (err: any) {
      setImportStatus('error');
      setImportMsg(err.message || 'Error al importar build y runas');
    } finally {
      setTimeout(() => setImportStatus('idle'), 6000);
    }
  };

  const autoImportedChampRef = useRef<number | null>(null);
  useEffect(() => {
    if (myChampionId > 0 && autoImportedChampRef.current !== myChampionId) {
      autoImportedChampRef.current = myChampionId;
      handleApplyCurrentBuildAndRunes(myChampionId);
    }
  }, [myChampionId, activeOpponentId]);

  // Verificar si los 10 campeones están bloqueados
  const all10Locked = Boolean(
    session &&
    session.theirTeam.length === 5 &&
    session.myTeam.length === 5 &&
    session.theirTeam.every((p) => extractPlayerChampionId(p, session) > 0) &&
    session.myTeam.every((p) => (p.cellId === session.localPlayerCellId ? myChampionId > 0 : extractPlayerChampionId(p, session) > 0))
  );

  // Consulta en vivo a OP.GG MCP durante el draft (CERO llamadas a Gemini)
  useEffect(() => {
    if (!session || !window.api?.getOpGgMatchup) return;

    session.theirTeam.forEach(async (p) => {
      const champId = extractPlayerChampionId(p, session);
      if (champId > 0 && !fetchedOpponentsRef.current.has(champId)) {
        fetchedOpponentsRef.current.add(champId);
        try {
          const pRole = detectPlayerRole(p, session, champId);
          const data = await window.api.getOpGgMatchup({
            championId: champId,
            role: pRole,
            patch: '26.20',
            elo: settings.opggTier || 'emerald_plus',
          });
          if (data && Array.isArray(data.counters) && data.counters.length > 0) {
            setOpggLiveCounters((prev) => ({
              ...prev,
              [champId]: data.counters,
            }));
          }
        } catch (err) {
          console.warn('[ChampSelectView] Error consultando counters OP.GG:', err);
        }
      }
    });
  }, [session?.theirTeam, settings.opggTier]);

  // Consulta a Gemini IA: SOLO cuando los 10 picks están fijados o manual con botón
  const fetchDraftRecommendations = async (forceManual = false) => {
    if (!session || !window.api?.getDraftRecommendations) return;

    // REGLA DEL DRAFT: CERO llamadas a Gemini a menos que estén los 10 picks completos o sea forzado manual
    if (!all10Locked && !forceManual) {
      return;
    }

    const allies = session.myTeam
      .map((p) => (p.cellId === session.localPlayerCellId && myChampionId > 0 ? myChampionId : extractPlayerChampionId(p, session)))
      .filter((id) => id > 0);
    const enemies = session.theirTeam
      .map((p) => extractPlayerChampionId(p, session))
      .filter((id) => id > 0);
    const bans = [
      ...(session.bans?.myTeamBans || []),
      ...(session.bans?.theirTeamBans || []),
    ].filter((id) => id > 0);

    const queryKey = `${localRole}_${allies.sort().join(',')}_${enemies.sort().join(',')}_${bans.sort().join(',')}_${pickableIds.length}`;
    if (!forceManual && lastDraftQueryRef.current === queryKey && draftRecs) {
      return;
    }
    lastDraftQueryRef.current = queryKey;

    setDraftLoading(true);
    setDraftError(null);
    try {
      const recs = await window.api.getDraftRecommendations({
        role: localRole,
        patch: '26.20',
        allies,
        enemies,
        bans,
        pickableChampionIds: pickableIds.length > 0 ? pickableIds : undefined,
        forceRefresh: forceManual,
      });
      setDraftRecs(recs);
    } catch (err: any) {
      setDraftError(err.message || String(err));
    } finally {
      setDraftLoading(false);
    }
  };

  // Disparar Gemini automáticamente SOLO cuando los 10 picks se completan
  const prevAll10LockedRef = useRef(false);
  useEffect(() => {
    if (all10Locked && !prevAll10LockedRef.current) {
      prevAll10LockedRef.current = true;
      fetchDraftRecommendations(false);
    } else if (!all10Locked) {
      prevAll10LockedRef.current = false;
    }
  }, [all10Locked]);

  // Acción Hover (reflejar pick en League of Legends)
  const handleHover = async (championId: number) => {
    if (!window.api?.hoverChampion) return;
    setHoveringId(championId);
    setHoverResult(null);
    try {
      const res = await window.api.hoverChampion(championId);
      setHoverResult({ ...res, championId, timestamp: Date.now() });
    } catch (err: any) {
      setHoverResult({
        success: false,
        championId,
        error: err.message || String(err),
        timestamp: Date.now()
      });
    } finally {
      setHoveringId(null);
    }
  };

  // Consolidar baneos de ambos equipos tanto de session.bans como de session.actions completados
  const alliedTeamCellIds = new Set(session?.myTeam?.map((p) => p.cellId) || []);
  const enemyTeamCellIds = new Set(session?.theirTeam?.map((p) => p.cellId) || []);

  const actionAlliedBans: number[] = [];
  const actionEnemyBans: number[] = [];

  if (session?.actions) {
    for (const round of session.actions) {
      if (Array.isArray(round)) {
        for (const act of round) {
          if (act.type === 'ban' && act.completed && act.championId > 0) {
            if (alliedTeamCellIds.has(act.actorCellId)) {
              actionAlliedBans.push(act.championId);
            } else if (enemyTeamCellIds.has(act.actorCellId)) {
              actionEnemyBans.push(act.championId);
            }
          }
        }
      }
    }
  }

  const alliedBans = Array.from(
    new Set([...(session?.bans?.myTeamBans || []), ...actionAlliedBans])
  ).filter((id) => typeof id === 'number' && id > 0);

  const enemyBans = Array.from(
    new Set([...(session?.bans?.theirTeamBans || []), ...actionEnemyBans])
  ).filter((id) => typeof id === 'number' && id > 0);

  return (
    <div className="space-y-6">
      {/* Selector de sub-vistas Estilo Persona 3 Reload / Blitz */}
      <div className="flex flex-wrap items-center gap-3 border-b-2 border-[#16335F] pb-3">
        <button
          onClick={() => setActiveTab('live')}
          className={`px-5 py-2 text-xs font-black tracking-wider transition-all duration-150 flex items-center space-x-2 transform -skew-x-8 cursor-pointer ${
            activeTab === 'live'
              ? 'bg-[#00E5FF] text-[#030814] p3r-shadow-blue border-l-4 border-[#0066FF] font-p3r-head'
              : 'bg-[#050E20] text-[#7E9BB8] hover:text-white hover:bg-[#0C1B38] border border-[#16335F]'
          }`}
        >
          <div className="transform skew-x-8 flex items-center space-x-2">
            <span className={`w-2 h-2 transform rotate-45 ${activeTab === 'live' ? 'bg-[#030814]' : 'bg-[#0066FF]'}`}></span>
            <span>SELECCIÓN EN VIVO</span>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('suggestions')}
          className={`px-5 py-2 text-xs font-black tracking-wider transition-all duration-150 flex items-center space-x-2 transform -skew-x-8 cursor-pointer ${
            activeTab === 'suggestions'
              ? 'bg-[#00E5FF] text-[#030814] p3r-shadow-blue border-l-4 border-[#0066FF] font-p3r-head'
              : 'bg-[#050E20] text-[#7E9BB8] hover:text-white hover:bg-[#0C1B38] border border-[#16335F]'
          }`}
        >
          <div className="transform skew-x-8 flex items-center space-x-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>SUGERENCIAS META (BANS &amp; PICKS)</span>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('builds')}
          className={`px-5 py-2 text-xs font-black tracking-wider transition-all duration-150 flex items-center space-x-2 transform -skew-x-8 cursor-pointer ${
            activeTab === 'builds'
              ? 'bg-[#00E5FF] text-[#030814] p3r-shadow-blue border-l-4 border-[#0066FF] font-p3r-head'
              : 'bg-[#050E20] text-[#7E9BB8] hover:text-white hover:bg-[#0C1B38] border border-[#16335F]'
          }`}
        >
          <div className="transform skew-x-8 flex items-center space-x-2">
            <Zap className="w-3.5 h-3.5" />
            <span>BUILDS &amp; ÁRBOL DE RUNAS</span>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('preferences')}
          className={`px-5 py-2 text-xs font-black tracking-wider transition-all duration-150 flex items-center space-x-2 transform -skew-x-8 cursor-pointer ${
            activeTab === 'preferences'
              ? 'bg-[#00E5FF] text-[#030814] p3r-shadow-blue border-l-4 border-[#0066FF] font-p3r-head'
              : 'bg-[#050E20] text-[#7E9BB8] hover:text-white hover:bg-[#0C1B38] border border-[#16335F]'
          }`}
        >
          <div className="transform skew-x-8 flex items-center space-x-2">
            <svg className="w-3.5 h-3.5 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            <span>PREFERENCIAS DE AUTO-PICK / BAN</span>
          </div>
        </button>
      </div>

      {activeTab === 'preferences' ? (
        <RolePreferencesEditor
          settings={settings?.autoChampSelect || DEFAULT_APP_SETTINGS.autoChampSelect}
          onSave={(autoChampSelect) => onSaveSettings({ autoChampSelect })}
        />
      ) : activeTab === 'suggestions' ? (
        <MetaSuggestionsPanel
          initialRole={localRole !== 'FILL' ? localRole : 'MIDDLE'}
          settings={settings}
          onSaveSettings={onSaveSettings}
          isLiveChampSelect={Boolean(session)}
          isMyBanTurn={isMyBanTurn}
          isMyPickTurn={isMyPickTurn}
          revealedEnemies={revealedEnemies}
          onHoverChampion={handleHover}
          onInspectChampionBuild={(champId, targetRole) => {
            setInspectedBuildTarget({ championId: champId, role: targetRole });
            setActiveTab('builds');
          }}
        />
      ) : activeTab === 'builds' ? (
        <MatchupView
          initialChampionId={myChampionId > 0 ? myChampionId : inspectedBuildTarget.championId}
          initialOpponentId={activeOpponentId > 0 ? activeOpponentId : 24}
          initialRole={myChampionId > 0 && localRole !== 'FILL' ? localRole : inspectedBuildTarget.role}
          autoRun={true}
          onOpponentChange={(opponentId) => setManualOpponentId(opponentId)}
        />
      ) : (
        <>
          {session ? (
            <div className="space-y-6">
              {/* HUD Superior: Fase y Temporizador P3R */}
              <div className="bg-[#050E20] border-2 border-[#16335F] p-5 p3r-bevel p3r-shadow-hard flex flex-wrap items-center justify-between gap-4 relative">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-[#0066FF] border-l-2 border-white flex items-center justify-center font-black text-white transform -skew-x-8 p3r-shadow-blue">
                    <span className="transform skew-x-8 text-xs font-mono font-black uppercase">LCU</span>
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 bg-[#00E676] transform rotate-45" />
                      <h3 className="text-sm font-black text-white uppercase tracking-wider font-p3r">
                        FASE // {session.timer.phase || 'SELECCIÓN'}
                      </h3>
                    </div>
                    <p className="text-xs text-[#7E9BB8] mt-0.5 font-medium">
                      POSICIÓN DETECTADA: <strong className="text-white font-mono">{localRole}</strong> | CELDA: <span className="font-mono text-[#00E5FF] font-bold">#{session.localPlayerCellId}</span>
                    </p>
                  </div>
                </div>

                {/* Temporizador fiel en tiempo real */}
                <div className="flex items-center space-x-3 bg-[#030814] px-4 py-2 border border-[#16335F] p3r-cut-tr">
                  <div className="text-right">
                    <span className="text-[10px] text-[#7E9BB8] uppercase tracking-wider block font-black font-p3r-head">
                      TIEMPO RESTANTE
                    </span>
                    <span className="text-[10px] text-[#4A627E] font-mono">SEGUNDOS</span>
                  </div>
                  <div
                    className={`text-3xl font-black font-mono tracking-tight px-3 py-1 border transform -skew-x-8 ${
                      remainingSeconds <= 10
                        ? 'text-[#FF1744] border-2 border-[#FF1744] bg-[#FF1744]/15'
                        : 'text-white border-2 border-[#0066FF] bg-[#050E20]'
                    }`}
                  >
                    <span className="transform skew-x-8 inline-block">
                      {remainingSeconds.toString().padStart(2, '0')}s
                    </span>
                  </div>
                </div>
              </div>

              {/* Banner de Sincronización e Importación a LoL */}
              {myChampionId > 0 && (
                <div className="bg-[#030814] border-2 border-[#00E5FF] p-4 p3r-bevel flex flex-col sm:flex-row items-center justify-between gap-3 p3r-shadow-blue animate-p3r-slide">
                  <div className="flex items-center space-x-3.5">
                    <img
                      src={getChampionIconUrl(myChampionId)}
                      alt={getChampionName(myChampionId)}
                      className="w-12 h-12 border-2 border-[#00E5FF] object-cover shrink-0"
                    />
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-black text-[#00E5FF] uppercase tracking-wider font-p3r-head">
                          CAMPEÓN FIJADO:
                        </span>
                        <span className="text-sm font-black text-white uppercase font-p3r">
                          {getChampionName(myChampionId)}
                        </span>
                        <span className="text-[10px] bg-[#0066FF] text-white px-1.5 py-0.2 font-mono">
                          {localRole}
                        </span>
                      </div>
                      <p className="text-xs text-[#7E9BB8] mt-0.5">
                        {importMsg || 'Sincronización directa con League of Legends (Runas activadas + Tienda de objetos configurada).'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <P3rButton
                      variant={importStatus === 'success' ? 'cyan' : importStatus === 'error' ? 'danger' : 'primary'}
                      size="md"
                      onClick={() => handleApplyCurrentBuildAndRunes(myChampionId)}
                      disabled={importStatus === 'importing'}
                      icon={
                        importStatus === 'importing' ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : importStatus === 'success' ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Zap className="w-4 h-4" />
                        )
                      }
                    >
                      {importStatus === 'importing'
                        ? 'Importando...'
                        : importStatus === 'success'
                        ? '¡RUNAS Y OBJETOS IMPORTADOS!'
                        : 'IMPORTAR RUNAS & OBJETOS A LOL'}
                    </P3rButton>
                  </div>
                </div>
              )}

              {/* Indicador de Turno Activo & Bans */}
              <div className="space-y-3">
                {/* Banner de Turno Dinámico */}
                {isMyPickTurn ? (
                  <div className="bg-[#050E20] border-2 border-[#00E5FF] p-4.5 p3r-bevel p3r-shadow-blue flex items-center justify-between animate-p3r-slide">
                    <div className="flex items-center space-x-3.5">
                      <div className="w-10 h-10 bg-[#00E5FF] text-[#030814] flex items-center justify-center transform -skew-x-8">
                        <Sparkles className="w-6 h-6 transform skew-x-8 font-black" />
                      </div>
                      <div>
                        <h4 className="text-base font-black text-white uppercase tracking-wider font-p3r">
                          ¡ES TU TURNO DE ELEGIR CAMPEÓN!
                        </h4>
                        <p className="text-xs text-[#B8F2FF]">
                          Haz clic en &ldquo;SELECCIONAR EN LOL&rdquo; en cualquiera de las recomendaciones tácticas para reflejar el pick directamente en el cliente.
                        </p>
                      </div>
                    </div>
                    <span className="bg-[#00E5FF] text-[#030814] text-xs font-mono font-black px-4 py-1.5 uppercase tracking-wider transform -skew-x-8 border-l-2 border-white">
                      <span className="transform skew-x-8 inline-block">TURNO ACTIVO</span>
                    </span>
                  </div>
                ) : isMyBanTurn ? (
                  <div className="bg-[#1F0A0A] border-2 border-[#FFE277] p-4.5 p3r-bevel p3r-shadow-hard flex items-center justify-between animate-p3r-slide">
                    <div className="flex items-center space-x-3.5">
                      <div className="w-10 h-10 bg-[#FFE277] text-[#030814] flex items-center justify-center transform -skew-x-8">
                        <Ban className="w-6 h-6 transform skew-x-8 font-black" />
                      </div>
                      <div>
                        <h4 className="text-base font-black text-white uppercase tracking-wider font-p3r">
                          ¡FASE DE BLOQUEO (BAN) EN CURSO!
                        </h4>
                        <p className="text-xs text-[#FFE277]/90">
                          Banea tu objetivo prioritario en el cliente de League of Legends antes de que expire el tiempo.
                        </p>
                      </div>
                    </div>
                    <span className="bg-[#FFE277] text-[#030814] text-xs font-mono font-black px-4 py-1.5 uppercase tracking-wider transform -skew-x-8">
                      <span className="transform skew-x-8 inline-block">FASE BAN</span>
                    </span>
                  </div>
                ) : (
                  <div className="bg-[#050E20] border border-[#16335F] p3r-cut-tr px-4 py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2 text-[#7E9BB8]">
                      <span className="w-2 h-2 bg-[#0066FF] transform rotate-45" />
                      <span className="font-p3r-head uppercase text-[11px] font-bold">
                        DRAFT EN CURSO: {currentGlobalAction ? (currentGlobalAction.isAllyAction ? 'Turno de aliado eligiendo' : 'Turno de enemigo eligiendo') : 'Esperando turnos de pick'}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-[#00E5FF]">
                      {pickableIds.length > 0 ? `${pickableIds.length} campeones elegibles detectados en LCU` : 'Sincronizando elegibles...'}
                    </span>
                  </div>
                )}

                {/* Barra Compacta de Bans de Ambos Equipos */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                  {/* Bans Aliados */}
                  <div className="bg-[#050E20] p-3 border border-[#16335F] p3r-cut-tr flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Shield className="w-4 h-4 text-[#00E5FF]" />
                      <span className="text-[#7E9BB8] font-black uppercase text-[11px] font-p3r-head">Bans Aliados:</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      {alliedBans.length > 0 ? (
                        alliedBans.map((bId) => (
                          <div key={bId} className="relative group" title={getChampionName(bId)}>
                            <img
                              src={getChampionIconUrl(bId)}
                              alt={getChampionName(bId)}
                              className="w-7 h-7 object-cover border border-[#0066FF] grayscale hover:grayscale-0 transition"
                            />
                            <div className="absolute inset-0 bg-[#FF1744]/40 flex items-center justify-center">
                              <span className="text-[10px] text-white font-black">✕</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <span className="text-[11px] text-[#4A627E]">Sin bloqueos</span>
                      )}
                    </div>
                  </div>

                  {/* Bans Enemigos */}
                  <div className="bg-[#050E20] p-3 border border-[#16335F] p3r-cut-tr flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Target className="w-4 h-4 text-[#FF1744]" />
                      <span className="text-[#7E9BB8] font-black uppercase text-[11px] font-p3r-head">Bans Enemigos:</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      {enemyBans.length > 0 ? (
                        enemyBans.map((bId) => (
                          <div key={bId} className="relative group" title={getChampionName(bId)}>
                            <img
                              src={getChampionIconUrl(bId)}
                              alt={getChampionName(bId)}
                              className="w-7 h-7 object-cover border border-[#FF1744] grayscale hover:grayscale-0 transition"
                            />
                            <div className="absolute inset-0 bg-[#FF1744]/40 flex items-center justify-center">
                              <span className="text-[10px] text-white font-black">✕</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <span className="text-[11px] text-[#4A627E]">Sin bloqueos</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Panel de Recomendaciones de Pick en Vivo (IA Gemini / OP.GG) */}
              <div className="bg-[#050E20] border-2 border-[#16335F] p-5 p3r-bevel p3r-shadow-hard space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-[#16335F] pb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 bg-[#0066FF] text-white flex items-center justify-center transform -skew-x-8 p3r-shadow-blue border-l-2 border-white">
                      <Sparkles className="w-5 h-5 transform skew-x-8" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center space-x-2 font-p3r">
                        <span>RECOMENDACIONES DE PICK // DRAFT TÁCTICO</span>
                        {all10Locked ? (
                          <P3rBadge label="10 PICKS FIJADOS (IA COMPLETA)" variant="green" />
                        ) : (
                          <P3rBadge label="META OP.GG EN VIVO" variant="cyan" />
                        )}
                      </h3>
                      <p className="text-xs text-[#7E9BB8] mt-0.5">
                        {all10Locked
                          ? `Análisis para tu rol (${localRole})`
                          : `Counters y estadísticas de OP.GG para tu rol (${localRole})`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 self-start sm:self-auto">
                    <P3rButton
                      variant="secondary"
                      size="sm"
                      onClick={() => fetchDraftRecommendations(true)}
                      disabled={draftLoading}
                      icon={<RefreshCw className={`w-3.5 h-3.5 ${draftLoading ? 'animate-spin' : ''}`} />}
                    >
                      {draftLoading ? 'Analizando...' : (all10Locked ? 'Reanalizar con IA' : 'Analizar ahora con IA')}
                    </P3rButton>
                  </div>
                </div>

                {/* Banner de Fallback SOLO si ocurrió un error real */}
                {draftRecs?.source === 'fallback' && draftRecs.error && (
                  <div className="bg-[#2A1405] border-2 border-[#FFE277] p-3 text-xs text-[#FFE277] flex items-start space-x-2 p3r-cut-tr">
                    <AlertCircle className="w-4 h-4 text-[#FFE277] shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white font-p3r-head uppercase">Aviso: </strong>
                      <span>{draftRecs.fallbackReason || 'Error consultando recomendaciones.'}</span>
                    </div>
                  </div>
                )}

                {/* Feedback del Hover en LoL */}
                {hoverResult && (
                  <div
                    className={`p-3 text-xs flex items-center justify-between border-2 p3r-cut-tr ${
                      hoverResult.success
                        ? 'bg-[#031A12] border-[#00E676] text-[#00E676]'
                        : 'bg-[#2A050A] border-[#FF1744] text-[#FF1744]'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      {hoverResult.success ? (
                        <Check className="w-4 h-4 text-[#00E676] shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-[#FF1744] shrink-0" />
                      )}
                      <span className="font-p3r-head">
                        {hoverResult.success
                          ? `✓ Campeón seleccionado con éxito en League of Legends (${getChampionName(hoverResult.championId || 0)}).`
                          : `Fallo al reflejar pick en LoL: ${hoverResult.error}`}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#7E9BB8] font-mono">
                      {new Date(hoverResult.timestamp || Date.now()).toLocaleTimeString()}
                    </span>
                  </div>
                )}

                {/* 1. Selector de Rivales Enemigos Revelados */}
                {revealedEnemies.length > 0 && (
                  <div className="bg-[#030814] p-3 border border-[#16335F] p3r-cut-tr space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <Target className="w-4 h-4 text-[#FF1744]" />
                        <span className="text-xs font-black uppercase text-white font-p3r-head tracking-wider">
                          Rivales Enemigos Revelados:
                        </span>
                      </div>
                      <span className="text-[11px] text-[#7E9BB8] font-mono">
                        Selecciona un rival para enfocar los counters directos de tu rol ({localRole})
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {revealedEnemies.map((enemy) => {
                        const isSelected = directLaneRival?.championId === enemy.championId;
                        const isSameLane = enemy.role === localRole;
                        return (
                          <button
                            key={enemy.championId}
                            type="button"
                            onClick={() => setManualOpponentId(enemy.championId)}
                            className={`px-3 py-1.5 flex items-center space-x-2 transform -skew-x-8 transition-all border cursor-pointer ${
                              isSelected
                                ? 'bg-[#FF1744] text-white border-white p3r-shadow-hard'
                                : 'bg-[#050E20] text-[#CBD5E1] border-[#16335F] hover:border-[#FF1744]/70 hover:text-white'
                            }`}
                          >
                            <div className="transform skew-x-8 flex items-center space-x-2">
                              <img
                                src={getChampionIconUrl(enemy.championId)}
                                alt={enemy.championName}
                                className="w-5 h-5 object-cover border border-white/40"
                              />
                              <span className="text-xs font-bold font-p3r-head uppercase">
                                {enemy.championName}
                              </span>
                              <span
                                className={`text-[9px] px-1 py-0.2 font-mono font-bold ${
                                  isSelected ? 'bg-[#030814] text-[#FFE277]' : 'bg-[#16335F] text-[#00E5FF]'
                                }`}
                              >
                                {enemy.role}
                              </span>
                              {isSameLane && (
                                <span className="text-[9px] font-black uppercase tracking-wider text-[#FFE277] ml-1">
                                  [Tu Línea]
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. PRIORIDAD: Si hay rival directo con counters de OP.GG */}
                {directLaneRival && opggLiveCounters[directLaneRival.championId]?.length ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#16335F] pb-2">
                      <div className="flex items-center space-x-2">
                        <Flame className="w-4 h-4 text-[#00E5FF]" />
                        <span className="text-xs font-black uppercase text-white font-p3r-head tracking-wider">
                          Counters recomendados para {localRole} contra {directLaneRival.championName} ({directLaneRival.role}):
                        </span>
                        <P3rBadge label={`Parche 26.20 - ${settings.opggTier || 'Esmeralda+'}`} variant="cyan" />
                      </div>
                      <span className="text-[11px] text-[#00E676] font-mono font-bold">
                        Datos en vivo de OP.GG
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {opggLiveCounters[directLaneRival.championId].slice(0, 3).map((cnt, idx) => {
                        const isHovering = hoveringId === cnt.championId;
                        const isPickable = pickableIds.length === 0 || pickableIds.includes(cnt.championId);
                        const winRatePct = cnt.winRate <= 1 ? (cnt.winRate * 100).toFixed(1) : cnt.winRate.toFixed(1);

                        return (
                          <div
                            key={cnt.championId || idx}
                            className="bg-[#030814] border-2 border-[#16335F] hover:border-[#00E5FF] p-4 flex flex-col justify-between space-y-3 transition-all relative overflow-hidden group p3r-shadow-hard p3r-cut-tr"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black tracking-widest uppercase bg-[#0066FF] text-white px-2 py-0.5 transform -skew-x-8 font-p3r-head p3r-shadow-blue border-l-2 border-white">
                                <span className="transform skew-x-8 inline-block">#{idx + 1} COUNTER DIRECTO</span>
                              </span>
                              <span className="text-[11px] font-mono font-black text-[#00E676] bg-[#031A12] border border-[#00E676]/40 px-2 py-0.5">
                                {winRatePct}% WR
                              </span>
                            </div>

                            <div className="flex items-center space-x-3">
                              <img
                                src={getChampionIconUrl(cnt.championId)}
                                alt={cnt.championName}
                                className="w-13 h-13 object-cover border-2 border-[#0066FF] p3r-shadow-blue"
                              />
                              <div>
                                <h4 className="text-sm font-black text-white group-hover:text-[#00E5FF] transition font-p3r-head uppercase tracking-wider">
                                  {cnt.championName}
                                </h4>
                                <div className="flex items-center space-x-2 mt-0.5 font-mono text-[10px]">
                                  <span className="text-[#00E5FF] bg-[#050E20] border border-[#16335F] px-1.5 py-0.2 font-bold">
                                    {localRole}
                                  </span>
                                  <span className="text-[#7E9BB8]">
                                    {(cnt.play || 1500).toLocaleString()} partidas
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="text-xs text-[#CBD5E1] bg-[#050E20] p-3 border border-[#16335F] flex-1 p3r-cut-tr">
                              <span className="text-[10px] uppercase font-bold text-[#00E5FF] block font-p3r-head mb-1">
                                Ventaja táctica vs {directLaneRival.championName}:
                              </span>
                              <p className="text-[11px] text-[#E2E8F0] leading-snug">
                                Rendimiento superior y ventaja en enfrentamientos directos de línea en el meta actual.
                              </p>
                            </div>

                            <div className="space-y-2 pt-1">
                              <P3rButton
                                variant={isMyPickTurn ? 'cyan' : 'primary'}
                                size="md"
                                className="w-full justify-center"
                                onClick={() => handleHover(cnt.championId)}
                                disabled={isHovering || !isPickable}
                                icon={isHovering ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Target className="w-3.5 h-3.5" />}
                              >
                                {isHovering
                                  ? 'Enviando...'
                                  : isMyPickTurn
                                  ? 'SELECCIONAR EN LOL (HOVER)'
                                  : 'PREPARAR PICK (HOVER)'}
                              </P3rButton>

                              <button
                                type="button"
                                onClick={() => {
                                  setInspectedBuildTarget({ championId: cnt.championId, role: localRole });
                                  setActiveTab('builds');
                                }}
                                className="w-full text-center text-[11px] font-bold text-[#7E9BB8] hover:text-[#00E5FF] py-1 transition flex items-center justify-center space-x-1 cursor-pointer font-p3r-head"
                              >
                                <span>Ver Runas &amp; Build</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : directLaneRival ? (
                  <div className="p-8 text-center text-xs text-[#7E9BB8] bg-[#030814] border border-[#16335F] p3r-cut-tr flex flex-col items-center justify-center space-y-2">
                    <RefreshCw className="w-5 h-5 animate-spin text-[#00E5FF]" />
                    <span>Consultando counters en vivo de OP.GG para {localRole} contra {directLaneRival.championName} ({directLaneRival.role})...</span>
                  </div>
                ) : draftRecs?.picks && draftRecs.picks.length > 0 ? (
                  <div className="space-y-3">
                    <div className="bg-[#030814] p-3 border border-[#16335F] p3r-cut-tr flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2 text-[#7E9BB8]">
                        <span className="w-2 h-2 bg-[#00E5FF] transform rotate-45" />
                        <span>Esperando que el rival elija campeón para calcular counters directos. Mostrando mejores selecciones del meta para {localRole}:</span>
                      </div>
                      <span className="text-[11px] font-mono text-[#00E5FF]">Parche 26.20</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {draftRecs.picks.map((pick: any, idx: number) => {
                        const isHovering = hoveringId === pick.championId;
                        return (
                          <div
                            key={pick.championId || idx}
                            className="bg-[#030814] border-2 border-[#16335F] hover:border-[#00E5FF] p-4 flex flex-col justify-between space-y-3 transition-all relative overflow-hidden group p3r-shadow-hard p3r-cut-tr"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black tracking-widest uppercase bg-[#0066FF] text-white px-2 py-0.5 transform -skew-x-8 font-p3r-head p3r-shadow-blue border-l-2 border-white">
                                <span className="transform skew-x-8 inline-block">#{idx + 1} RECOMENDACIÓN</span>
                              </span>
                              {pick.isNewChampion && <P3rBadge label="NUEVO" variant="yellow" />}
                            </div>

                            <div className="flex items-center space-x-3">
                              <img
                                src={getChampionIconUrl(pick.championId)}
                                alt={pick.championName}
                                className="w-13 h-13 object-cover border-2 border-[#0066FF] p3r-shadow-blue"
                              />
                              <div>
                                <h4 className="text-sm font-black text-white group-hover:text-[#00E5FF] transition font-p3r-head uppercase tracking-wider">
                                  {pick.championName || getChampionName(pick.championId)}
                                </h4>
                                <div className="flex items-center space-x-2 mt-0.5 font-mono">
                                  <span className="text-[10px] text-[#00E5FF] bg-[#050E20] border border-[#16335F] px-1.5 py-0.2 font-bold">
                                    {pick.role || localRole}
                                  </span>
                                  {pick.localWinrate !== undefined && (
                                    <span className="text-[10px] text-[#00E676] font-bold">
                                      {pick.localWinrate}% WR ({pick.localMatches} part.)
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="space-y-1.5 text-xs text-[#CBD5E1] bg-[#050E20] p-3 border border-[#16335F] flex-1 p3r-cut-tr">
                              <div>
                                <span className="text-[10px] uppercase font-bold text-[#7E9BB8] block font-p3r-head">Encaje Táctico:</span>
                                <p className="text-[11px] text-[#E2E8F0] mt-0.5 leading-snug">
                                  {pick.fitReason || 'Sólida presencia táctica en el parche.'}
                                </p>
                              </div>
                            </div>

                            <P3rButton
                              variant={isMyPickTurn ? 'cyan' : 'primary'}
                              size="md"
                              className="w-full justify-center"
                              onClick={() => handleHover(pick.championId)}
                              disabled={isHovering}
                              icon={isHovering ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Target className="w-3.5 h-3.5" />}
                            >
                              {isHovering
                                ? 'Enviando...'
                                : isMyPickTurn
                                ? 'SELECCIONAR EN LOL (HOVER)'
                                : 'PREPARAR PICK (HOVER)'}
                            </P3rButton>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-[#7E9BB8] bg-[#030814] border border-[#16335F] p3r-cut-tr">
                    <span>Esperando que el equipo rival elija campeones para calcular counters en vivo desde OP.GG.</span>
                  </div>
                )}

                {/* Resumen Táctico de Equipos (Gemini) */}
                {draftRecs?.allyCompAnalysis && (
                  <div className="p-3.5 bg-[#030814] border border-[#16335F] space-y-2 text-xs p3r-cut-tr">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#00E5FF] block font-p3r-head">
                      Perfil Táctico de la Composición:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                      <div className="bg-[#050E20] p-2 border border-[#16335F]">
                        <span className="text-[#7E9BB8] text-[9px] block">DAÑO</span>
                        <span className="text-white font-bold">{draftRecs.allyCompAnalysis.damageProfile || 'Equilibrado'}</span>
                      </div>
                      <div className="bg-[#050E20] p-2 border border-[#16335F]">
                        <span className="text-[#7E9BB8] text-[9px] block">FRONTLINE</span>
                        <span className="text-white font-bold">{draftRecs.allyCompAnalysis.frontlinePresence || 'Moderada'}</span>
                      </div>
                      <div className="bg-[#050E20] p-2 border border-[#16335F]">
                        <span className="text-[#7E9BB8] text-[9px] block">INICIACIÓN</span>
                        <span className="text-white font-bold">{draftRecs.allyCompAnalysis.engagePresence || 'Media'}</span>
                      </div>
                      <div className="bg-[#050E20] p-2 border border-[#16335F]">
                        <span className="text-[#7E9BB8] text-[9px] block">CONTROL (CC)</span>
                        <span className="text-white font-bold">{draftRecs.allyCompAnalysis.crowdControl || 'Estándar'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Panel Colapsable de Depuración IA // Draft */}
                <div className="pt-2 border-t border-[#1E355B]/60">
                  <button
                    type="button"
                    onClick={() => setShowAiDebug(!showAiDebug)}
                    className="text-[11px] text-[#60A5FA] hover:text-white flex items-center space-x-1.5 font-mono"
                  >
                    <span>{showAiDebug ? '▲ Ocultar Depuración IA (Draft)' : '▼ Mostrar Depuración IA (Draft)'}</span>
                  </button>

                  {showAiDebug && (
                    <div className="mt-3 p-3 bg-[#0A111F] rounded border border-[#1E355B] space-y-2 text-xs font-mono">
                      <div>
                        <span className="text-[#94A3B8] text-[10px] block font-bold">ESTADO DE VALIDACIÓN:</span>
                        <span className="text-emerald-400">
                          {draftRecs?.debugInfo?.lcuStatus || 'Sincronizado con LCU'}
                        </span>
                      </div>

                      {draftRecs?.debugInfo?.rawPrompt && (
                        <div>
                          <span className="text-[#94A3B8] text-[10px] block font-bold">PROMPT ENVIADO:</span>
                          <pre className="text-[10px] text-gray-400 max-h-32 overflow-y-auto whitespace-pre-wrap bg-black/40 p-2 rounded">
                            {draftRecs.debugInfo.rawPrompt}
                          </pre>
                        </div>
                      )}

                      {draftRecs?.debugInfo?.rawResponse && (
                        <div>
                          <span className="text-[#94A3B8] text-[10px] block font-bold">RESPUESTA CRUDA DE IA:</span>
                          <pre className="text-[10px] text-emerald-300 max-h-32 overflow-y-auto whitespace-pre-wrap bg-black/40 p-2 rounded">
                            {draftRecs.debugInfo.rawResponse}
                          </pre>
                        </div>
                      )}

                      {hoverResult && (
                        <div>
                          <span className="text-[#94A3B8] text-[10px] block font-bold">ÚLTIMA RESPUESTA LCU HOVER:</span>
                          <span className={hoverResult.success ? 'text-emerald-400' : 'text-rose-400'}>
                            {hoverResult.success ? '200 OK - PATCH /lol-champ-select/v1/session/actions/{id}' : hoverResult.error}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Tableros de Equipos Estilo P3R */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Mi Equipo (Aliados) */}
                <div className="bg-[#050E20] border-2 border-[#16335F] p-5 p3r-bevel p3r-shadow-hard">
                  <h4 className="text-xs font-black text-[#00E5FF] uppercase tracking-wider mb-3 flex items-center space-x-2 font-p3r">
                    <span className="w-2.5 h-2.5 bg-[#0066FF] transform rotate-45"></span>
                    <span>MI EQUIPO (ALIADOS)</span>
                  </h4>

                  <div className="space-y-2.5">
                    {session.myTeam.map((p: ChampSelectPlayer) => {
                      const isMe = p.cellId === session.localPlayerCellId;
                      const champId = isMe && myChampionId > 0 ? myChampionId : extractPlayerChampionId(p, session);
                      const pRole = detectPlayerRole(p, session, champId);
                      return (
                        <div
                          key={p.cellId}
                          className={`p-3 border flex items-center justify-between transition-all p3r-cut-tr ${
                            isMe
                              ? 'bg-[#0066FF]/15 border-[#0066FF] shadow-sm'
                              : 'bg-[#030814] border-[#16335F] hover:border-[#0066FF]/60'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            {champId > 0 ? (
                              <img
                                src={getChampionIconUrl(champId)}
                                alt={getChampionName(champId)}
                                className="w-9 h-9 object-cover border border-[#0066FF]"
                              />
                            ) : (
                              <span className="w-9 h-9 bg-[#050E20] text-[10px] font-mono font-bold text-[#7E9BB8] border border-[#16335F] flex items-center justify-center">
                                {pRole !== 'FILL' ? pRole.slice(0, 3) : `#${p.cellId}`}
                              </span>
                            )}
                            <div>
                              <div className="text-xs font-bold text-white flex items-center space-x-2 font-p3r-head">
                                <span>{isMe ? 'TÚ' : `Aliado #${p.cellId}`}</span>
                                {isMe && (
                                  <span className="text-[10px] bg-[#0066FF] text-white font-black px-1.5 py-0.2 transform -skew-x-8 border-l border-white">
                                    <span className="transform skew-x-8 inline-block">TÚ</span>
                                  </span>
                                )}
                                <span className="text-[10px] text-[#00E5FF] font-mono">
                                  [{pRole}]
                                </span>
                              </div>
                              <span className="text-[11px] text-[#7E9BB8]">
                                {champId > 0 ? getChampionName(champId) : 'Eligiendo...'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center space-x-1.5 font-mono text-[10px] text-[#7E9BB8]">
                            <span className="bg-[#050E20] px-1.5 py-0.5 border border-[#16335F]">D:{p.spell1Id || '-'}</span>
                            <span className="bg-[#050E20] px-1.5 py-0.5 border border-[#16335F]">F:{p.spell2Id || '-'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Equipo Enemigo con Asignación Rápida de Rival */}
                <div className="bg-[#050E20] border-2 border-[#16335F] p-5 p3r-bevel p3r-shadow-hard">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-black text-[#FF1744] uppercase tracking-wider flex items-center space-x-2 font-p3r">
                      <span className="w-2.5 h-2.5 bg-[#FF1744] transform rotate-45"></span>
                      <span>EQUIPO ENEMIGO</span>
                    </h4>
                    {manualOpponentId !== null && (
                      <button
                        type="button"
                        onClick={() => setManualOpponentId(null)}
                        className="text-[11px] text-[#00E5FF] hover:text-white font-mono cursor-pointer"
                      >
                        ↺ Restaurar automático
                      </button>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    {session.theirTeam.map((p: ChampSelectPlayer, idx: number) => {
                      const champId = extractPlayerChampionId(p, session);
                      const hasChamp = champId > 0;
                      const isCurrentRival = hasChamp && champId === activeOpponentId;
                      const pRole = detectPlayerRole(p, session, champId);

                      return (
                        <div
                          key={idx}
                          onClick={() => {
                            if (hasChamp) {
                              setManualOpponentId(champId);
                            }
                          }}
                          className={`p-3 border flex items-center justify-between transition-all p3r-cut-tr ${
                            hasChamp ? 'cursor-pointer' : ''
                          } ${
                            isCurrentRival
                              ? 'bg-[#FF1744]/15 border-2 border-[#FF1744] shadow-md'
                              : 'bg-[#030814] border-[#16335F] hover:border-[#FF1744]/60'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            {hasChamp ? (
                              <img
                                src={getChampionIconUrl(champId)}
                                alt={getChampionName(champId)}
                                className="w-9 h-9 object-cover border border-[#FF1744]"
                              />
                            ) : (
                              <span className="w-9 h-9 bg-[#050E20] text-[10px] font-mono font-bold text-[#7E9BB8] border border-[#16335F] flex items-center justify-center">
                                {pRole !== 'FILL' ? pRole.slice(0, 3) : `E${idx + 1}`}
                              </span>
                            )}
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-bold text-white block font-p3r-head">
                                  {hasChamp ? getChampionName(champId) : `Enemigo #${idx + 1}`}
                                </span>
                                {isCurrentRival && (
                                  <span className="text-[10px] bg-[#FF1744] text-white font-black px-1.5 py-0.2 transform -skew-x-8 border-l border-white">
                                    <span className="transform skew-x-8 inline-block">
                                      {manualOpponentId === champId ? 'RIVAL FIJADO' : 'RIVAL DIRECTO'}
                                    </span>
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-[#7E9BB8]">
                                {hasChamp
                                  ? (isCurrentRival
                                      ? (manualOpponentId === champId ? 'Seleccionado por ti' : `Detectado en tu línea (${pRole})`)
                                      : 'Haz clic para enfrentar')
                                  : 'Campeón Oculto'}
                              </span>
                            </div>
                          </div>

                          {hasChamp && (
                            <div className="flex items-center space-x-2">
                              {isCurrentRival ? (
                                <P3rBadge label="Activo" variant="red" />
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setManualOpponentId(champId);
                                  }}
                                  className="text-xs font-bold text-white bg-[#050E20] hover:bg-[#0066FF] border border-[#16335F] hover:border-[#0066FF] px-2.5 py-1 transform -skew-x-8 transition-colors cursor-pointer"
                                >
                                  <span className="transform skew-x-8 inline-block font-p3r-head">Fijar Rival</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Panel de Matchup y Recomendación con Auto-Ejecución */}
              <div className="pt-2">
                <MatchupView
                  initialChampionId={myChampionId > 0 ? myChampionId : undefined}
                  initialOpponentId={activeOpponentId}
                  initialRole={localRole}
                  autoRun={myChampionId > 0}
                  onOpponentChange={(opponentId) => setManualOpponentId(opponentId)}
                />
              </div>
            </div>
          ) : (
            <div className="bg-[#050E20] border-2 border-[#16335F] p3r-bevel p3r-shadow-hard-lg p-12 text-center relative overflow-hidden">
              <div className="w-16 h-16 bg-[#0066FF] border-l-2 border-white flex items-center justify-center mx-auto mb-4 transform -skew-x-8 p3r-shadow-blue text-white">
                <svg className="w-8 h-8 transform skew-x-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>

              <div className="inline-block px-3 py-1 mb-2 bg-[#0066FF] text-white text-[10px] font-black tracking-widest uppercase transform -skew-x-8 font-p3r-head p3r-shadow-blue border-l-2 border-white">
                <span className="transform skew-x-8 inline-block">EN ESPERA</span>
              </div>

              <h3 className="text-2xl font-black text-white mb-2 tracking-wider uppercase font-p3r">
                ESPERANDO SELECCIÓN DE CAMPEÓN
              </h3>
              <p className="text-xs text-[#7E9BB8] max-w-lg mx-auto mb-6 leading-relaxed">
                Al entrar en selección de campeón en League of Legends, la app detectará tu campeón y posición para recomendarte runas y objetos.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <div className="inline-flex items-center space-x-2 text-xs bg-[#030814] px-4 py-2 border border-[#16335F] transform -skew-x-8">
                  <span className="transform skew-x-8 flex items-center space-x-2">
                    <span className="w-2 h-2 bg-[#00E676] transform rotate-45"></span>
                    <span className="font-bold text-[#00E676] font-mono">Esperando partida</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('suggestions')}
                  className="px-4 py-2 bg-[#FF1744] hover:bg-[#FF3D57] text-white text-xs font-black uppercase tracking-wider transform -skew-x-8 border-l-2 border-white cursor-pointer transition"
                >
                  <span className="transform skew-x-8 inline-flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Ver Sugerencias Meta de Bans &amp; Picks</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('builds')}
                  className="px-4 py-2 bg-[#0066FF] hover:bg-[#00E5FF] text-white hover:text-[#030814] text-xs font-black uppercase tracking-wider transform -skew-x-8 border-l-2 border-white cursor-pointer transition"
                >
                  <span className="transform skew-x-8 inline-flex items-center space-x-1.5">
                    <Zap className="w-3.5 h-3.5" />
                    <span>Explorar Árbol de Runas &amp; Builds</span>
                  </span>
                </button>
              </div>

              <div className="mt-8 text-left">
                <RolePreferencesEditor
                  settings={settings?.autoChampSelect || DEFAULT_APP_SETTINGS.autoChampSelect}
                  onSave={(autoChampSelect) => onSaveSettings({ autoChampSelect })}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
