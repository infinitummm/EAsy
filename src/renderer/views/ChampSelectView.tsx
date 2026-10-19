import React, { useState, useEffect, useRef } from 'react';
import { ChampSelectSession, ChampSelectPlayer, Role, AppSettings } from '../../shared/types';
import { IPC_CHANNELS } from '../../shared/events';
import { RolePreferencesEditor } from '../components/RolePreferencesEditor';
import { MatchupView } from './MatchupView';
import { getChampionName, getChampionIconUrl } from '../../shared/champions';
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
  Check
} from 'lucide-react';

interface ChampSelectViewProps {
  settings: AppSettings;
  onSaveSettings: (settings: Partial<AppSettings>) => void;
}

export const ChampSelectView: React.FC<ChampSelectViewProps> = ({
  settings,
  onSaveSettings
}) => {
  const [session, setSession] = useState<ChampSelectSession | null>(null);
  const [activeTab, setActiveTab] = useState<'live' | 'preferences'>('live');
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

  // Obtener recomendaciones de pick en vivo para el draft
  const fetchDraftRecommendations = async (forceRefresh = false) => {
    if (!session || !window.api?.getDraftRecommendations) return;

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
    if (!forceRefresh && lastDraftQueryRef.current === queryKey && draftRecs) {
      return;
    }
    lastDraftQueryRef.current = queryKey;

    setDraftLoading(true);
    setDraftError(null);
    try {
      const recs = await window.api.getDraftRecommendations({
        role: localRole,
        patch: '16.20.1',
        allies,
        enemies,
        bans,
        pickableChampionIds: pickableIds.length > 0 ? pickableIds : undefined,
        forceRefresh,
      });
      setDraftRecs(recs);
    } catch (err: any) {
      setDraftError(err.message || String(err));
    } finally {
      setDraftLoading(false);
    }
  };

  // Debounce para recalcular recomendaciones al cambiar el draft
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => {
      fetchDraftRecommendations(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [
    session?.myTeam,
    session?.theirTeam,
    session?.bans,
    localRole,
    pickableIds.length
  ]);

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

  const alliedBans = session?.bans?.myTeamBans?.filter((id) => id > 0) || [];
  const enemyBans = session?.bans?.theirTeamBans?.filter((id) => id > 0) || [];

  return (
    <div className="space-y-6">
      {/* Selector de sub-vistas Estilo Persona 3 Reload */}
      <div className="flex items-center space-x-3 border-b border-[#1E355B] pb-3">
        <button
          onClick={() => setActiveTab('live')}
          className={`px-4 py-2 rounded text-xs font-bold tracking-wider transition-all duration-150 flex items-center space-x-2 transform -skew-x-6 ${
            activeTab === 'live'
              ? 'bg-[#0070EB] text-white shadow-md'
              : 'text-[#94A3B8] hover:text-white hover:bg-[#0D192D]'
          }`}
        >
          <div className="transform skew-x-6 flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-white"></span>
            <span>SELECCIÓN EN VIVO</span>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('preferences')}
          className={`px-4 py-2 rounded text-xs font-bold tracking-wider transition-all duration-150 flex items-center space-x-2 transform -skew-x-6 ${
            activeTab === 'preferences'
              ? 'bg-[#0070EB] text-white shadow-md'
              : 'text-[#94A3B8] hover:text-white hover:bg-[#0D192D]'
          }`}
        >
          <div className="transform skew-x-6 flex items-center space-x-2">
            <svg className="w-3.5 h-3.5 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            <span>PREFERENCIAS DE AUTO-PICK / BAN</span>
          </div>
        </button>
      </div>

      {activeTab === 'preferences' ? (
        <RolePreferencesEditor
          settings={settings.autoChampSelect}
          onSave={(autoChampSelect) => onSaveSettings({ autoChampSelect })}
        />
      ) : (
        <>
          {session ? (
            <div className="space-y-6">
              {/* HUD Superior: Fase y Temporizador P3R */}
              <div className="bg-[#0D192D] border border-[#1E355B] rounded-xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4 relative">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 rounded bg-[#0A111F] border border-[#0070EB] flex items-center justify-center font-bold text-[#0070EB]">
                    <span className="text-xs font-mono uppercase">LCU</span>
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                        FASE: {session.timer.phase || 'SELECCIÓN'}
                      </h3>
                    </div>
                    <p className="text-xs text-[#94A3B8] mt-0.5">
                      POSICIÓN DETECTADA: <strong className="text-white">{localRole}</strong> | CELDA: {session.localPlayerCellId}
                    </p>
                  </div>
                </div>

                {/* Temporizador fiel en tiempo real */}
                <div className="flex items-center space-x-3 bg-[#0A111F] px-4 py-2.5 rounded-lg border border-[#1E355B]">
                  <div className="text-right">
                    <span className="text-[10px] text-[#94A3B8] uppercase tracking-wider block font-semibold">
                      TIEMPO RESTANTE
                    </span>
                    <span className="text-xs text-[#64748B]">EN SEGUNDOS</span>
                  </div>
                  <div
                    className={`text-3xl font-bold font-mono tracking-tight px-3 py-1 rounded border ${
                      remainingSeconds <= 10
                        ? 'text-[#D92546] border-[#D92546] bg-[#D92546]/10'
                        : 'text-white border-[#1E355B] bg-[#11223F]'
                    }`}
                  >
                    {remainingSeconds.toString().padStart(2, '0')}s
                  </div>
                </div>
              </div>

              {/* Indicador de Turno Activo & Bans */}
              <div className="space-y-3">
                {/* Banner de Turno Dinámico */}
                {isMyPickTurn ? (
                  <div className="bg-gradient-to-r from-[#0070EB] via-[#0052B4] to-[#0070EB] border border-[#00F0FF]/50 p-4 rounded-xl shadow-lg flex items-center justify-between animate-pulse">
                    <div className="flex items-center space-x-3">
                      <Sparkles className="w-6 h-6 text-[#00F0FF]" />
                      <div>
                        <h4 className="text-sm font-black text-white uppercase tracking-wider">
                          ¡ES TU TURNO DE ELEGIR CAMPEÓN!
                        </h4>
                        <p className="text-xs text-blue-100">
                          Haz clic en &ldquo;SELECCIONAR EN LOL&rdquo; en cualquiera de las recomendaciones de abajo para reflejar el pick directamente en tu cliente.
                        </p>
                      </div>
                    </div>
                    <span className="bg-black/40 text-[#00F0FF] text-xs font-mono font-bold px-3 py-1 rounded border border-[#00F0FF]/40">
                      TURNO ACTIVO
                    </span>
                  </div>
                ) : isMyBanTurn ? (
                  <div className="bg-gradient-to-r from-[#B45309] to-[#78350F] border border-[#F59E0B]/50 p-4 rounded-xl shadow-lg flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Ban className="w-6 h-6 text-[#FBBF24]" />
                      <div>
                        <h4 className="text-sm font-black text-white uppercase tracking-wider">
                          ¡FASE DE BLOQUEO (BAN) EN CURSO!
                        </h4>
                        <p className="text-xs text-amber-100">
                          Banea tu objetivo prioritario en el cliente de League of Legends.
                        </p>
                      </div>
                    </div>
                    <span className="bg-black/40 text-[#FBBF24] text-xs font-mono font-bold px-3 py-1 rounded border border-[#FBBF24]/40">
                      BANEO
                    </span>
                  </div>
                ) : (
                  <div className="bg-[#0D192D] border border-[#1E355B] px-4 py-2.5 rounded-lg flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2 text-[#94A3B8]">
                      <span className="w-2 h-2 rounded-full bg-[#0070EB] animate-ping" />
                      <span>
                        DRAFT EN CURSO: {currentGlobalAction ? (currentGlobalAction.isAllyAction ? 'Turno de aliado eligiendo' : 'Turno de enemigo eligiendo') : 'Esperando turnos de pick'}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-[#64748B]">
                      {pickableIds.length > 0 ? `${pickableIds.length} campeones elegibles detectados en LCU` : 'Sincronizando elegibles...'}
                    </span>
                  </div>
                )}

                {/* Barra Compacta de Bans de Ambos Equipos */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                  {/* Bans Aliados */}
                  <div className="bg-[#0A111F] p-3 rounded-lg border border-[#1E355B] flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Shield className="w-4 h-4 text-[#60A5FA]" />
                      <span className="text-[#94A3B8] font-bold uppercase text-[11px]">Bans Aliados:</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      {alliedBans.length > 0 ? (
                        alliedBans.map((bId) => (
                          <div key={bId} className="relative group" title={getChampionName(bId)}>
                            <img
                              src={getChampionIconUrl(bId)}
                              alt={getChampionName(bId)}
                              className="w-6 h-6 rounded object-cover border border-[#0070EB]/60 grayscale hover:grayscale-0 transition"
                            />
                            <div className="absolute inset-0 bg-red-600/30 rounded flex items-center justify-center">
                              <span className="text-[10px] text-white font-black">✕</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <span className="text-[11px] text-[#64748B]">Sin bloqueos</span>
                      )}
                    </div>
                  </div>

                  {/* Bans Enemigos */}
                  <div className="bg-[#0A111F] p-3 rounded-lg border border-[#1E355B] flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Target className="w-4 h-4 text-[#F87171]" />
                      <span className="text-[#94A3B8] font-bold uppercase text-[11px]">Bans Enemigos:</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      {enemyBans.length > 0 ? (
                        enemyBans.map((bId) => (
                          <div key={bId} className="relative group" title={getChampionName(bId)}>
                            <img
                              src={getChampionIconUrl(bId)}
                              alt={getChampionName(bId)}
                              className="w-6 h-6 rounded object-cover border border-[#D92546]/60 grayscale hover:grayscale-0 transition"
                            />
                            <div className="absolute inset-0 bg-red-600/30 rounded flex items-center justify-center">
                              <span className="text-[10px] text-white font-black">✕</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <span className="text-[11px] text-[#64748B]">Sin bloqueos</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Panel de Recomendaciones de Pick en Vivo (IA Gemini) */}
              <div className="bg-[#0D192D] border border-[#1E355B] rounded-xl p-5 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1E355B] pb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded bg-[#0070EB]/20 border border-[#0070EB] flex items-center justify-center text-[#00F0FF]">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center space-x-2">
                        <span>RECOMENDACIONES DE PICK // DRAFT TÁCTICO</span>
                        {draftRecs?.source === 'ai' ? (
                          <span className="text-[10px] bg-emerald-950/60 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded font-bold">
                            IA GEMINI ACTIVA
                          </span>
                        ) : (
                          <span className="text-[10px] bg-amber-950/60 text-amber-400 border border-amber-500/40 px-2 py-0.5 rounded font-bold">
                            MODO CONTINGENCIA
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-[#94A3B8] mt-0.5">
                        Filtrado estrictamente contra campeones elegibles en LCU y adaptado a tu rol ({localRole})
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => fetchDraftRecommendations(true)}
                      disabled={draftLoading}
                      className="flex items-center space-x-1.5 text-xs font-bold uppercase tracking-wider bg-[#0A111F] hover:bg-[#1E355B] text-white px-3 py-1.5 rounded border border-[#1E355B] transition disabled:opacity-50 transform -skew-x-6"
                    >
                      <div className="transform skew-x-6 flex items-center space-x-1.5">
                        <RefreshCw className={`w-3.5 h-3.5 ${draftLoading ? 'animate-spin' : ''}`} />
                        <span>{draftLoading ? 'Analizando...' : 'Actualizar Draft'}</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Banner de Fallback si no hay clave de Gemini o si falló */}
                {draftRecs?.source === 'fallback' && (
                  <div className="bg-amber-950/30 border border-amber-600/40 p-3 rounded-lg text-xs text-amber-200 flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-amber-300">Aviso de Modo Contingencia: </strong>
                      <span>{draftRecs.fallbackReason || 'Sin clave de Gemini configurada. Mostrando picks estándar del meta.'} Puedes añadir tu Gemini API Key en Ajustes & Keys para análisis adaptativo contextual.</span>
                    </div>
                  </div>
                )}

                {/* Feedback del Hover en LoL */}
                {hoverResult && (
                  <div
                    className={`p-3 rounded-lg text-xs flex items-center justify-between border ${
                      hoverResult.success
                        ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                        : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      {hoverResult.success ? (
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span>
                        {hoverResult.success
                          ? `✓ Campeón seleccionado con éxito en League of Legends (${getChampionName(hoverResult.championId || 0)}).`
                          : `Fallo al reflejar pick en LoL: ${hoverResult.error}`}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#94A3B8] font-mono">
                      {new Date(hoverResult.timestamp || Date.now()).toLocaleTimeString()}
                    </span>
                  </div>
                )}

                {/* Grid con las 3 Tarjetas de Picks Recomendados */}
                {draftRecs?.picks && draftRecs.picks.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {draftRecs.picks.map((pick: any, idx: number) => {
                      const isHovering = hoveringId === pick.championId;
                      return (
                        <div
                          key={pick.championId || idx}
                          className="bg-[#0A111F] rounded-xl border border-[#1E355B] hover:border-[#0070EB] p-4 flex flex-col justify-between space-y-3 transition-all relative overflow-hidden group shadow-lg"
                        >
                          {/* Badge de prioridad */}
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black tracking-widest uppercase bg-[#0070EB]/20 border border-[#0070EB]/50 text-[#00F0FF] px-2 py-0.5 rounded transform -skew-x-6">
                              #{idx + 1} RECOMENDACIÓN
                            </span>

                            {pick.isNewChampion && (
                              <span className="text-[10px] font-bold tracking-wider uppercase bg-[#F59E0B]/20 border border-[#F59E0B]/40 text-[#FBBF24] px-1.5 py-0.2 rounded">
                                NUEVO
                              </span>
                            )}
                          </div>

                          {/* Avatar y Datos del Campeón */}
                          <div className="flex items-center space-x-3">
                            <img
                              src={getChampionIconUrl(pick.championId)}
                              alt={pick.championName}
                              className="w-12 h-12 rounded-lg object-cover border-2 border-[#0070EB] shadow"
                            />
                            <div>
                              <h4 className="text-sm font-black text-white group-hover:text-[#00F0FF] transition">
                                {pick.championName || getChampionName(pick.championId)}
                              </h4>
                              <div className="flex items-center space-x-2 mt-0.5">
                                <span className="text-[10px] font-mono text-[#60A5FA] bg-[#11223F] px-1.5 py-0.2 rounded">
                                  {pick.role || localRole}
                                </span>
                                {pick.localWinrate !== undefined && (
                                  <span className="text-[10px] font-mono text-emerald-400 font-bold">
                                    {pick.localWinrate}% WR ({pick.localMatches} part.)
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Razones de selección */}
                          <div className="space-y-1.5 text-xs text-[#CBD5E1] bg-[#0D192D] p-2.5 rounded border border-[#1E355B]/60 flex-1">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-[#94A3B8] block">Encaje Táctico:</span>
                              <p className="text-[11px] text-[#E2E8F0] mt-0.5 leading-snug">
                                {pick.fitReason || 'Sólida presencia táctica en el parche.'}
                              </p>
                            </div>

                            {pick.threatMitigation && (
                              <div className="pt-1 border-t border-[#1E355B]/40">
                                <span className="text-[10px] uppercase font-bold text-[#F87171] block">Mitigación:</span>
                                <p className="text-[11px] text-[#CBD5E1] mt-0.5 leading-snug">
                                  {pick.threatMitigation}
                                </p>
                              </div>
                            )}

                            {pick.synergyReason && (
                              <div className="pt-1 border-t border-[#1E355B]/40">
                                <span className="text-[10px] uppercase font-bold text-[#60A5FA] block">Sinergia Aliada:</span>
                                <p className="text-[11px] text-[#CBD5E1] mt-0.5 leading-snug">
                                  {pick.synergyReason}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Botón de Acción Hover en LoL */}
                          <button
                            type="button"
                            onClick={() => handleHover(pick.championId)}
                            disabled={isHovering}
                            className={`w-full py-2.5 px-3 rounded font-black text-xs uppercase tracking-wider transition shadow-md flex items-center justify-center space-x-2 transform -skew-x-6 active:scale-95 ${
                              isMyPickTurn
                                ? 'bg-gradient-to-r from-[#00D4FF] to-[#0070EB] hover:from-[#00F0FF] hover:to-[#005CE6] text-black font-black'
                                : 'bg-[#1E355B] hover:bg-[#0070EB] text-white'
                            }`}
                          >
                            <div className="transform skew-x-6 flex items-center space-x-1.5">
                              {isHovering ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Target className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {isHovering
                                  ? 'Enviando...'
                                  : isMyPickTurn
                                  ? 'SELECCIONAR EN LOL (HOVER)'
                                  : 'PREPARAR PICK (HOVER)'}
                              </span>
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : draftLoading ? (
                  <div className="p-8 text-center text-xs text-[#94A3B8] flex flex-col items-center justify-center space-y-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-[#0070EB]" />
                    <span>Analizando sinergias aliadas y amenazas enemigas con Gemini...</span>
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-[#94A3B8] bg-[#0A111F] rounded-lg border border-[#1E355B]">
                    <span>Esperando asignación de roles y picks del draft para generar sugerencias tácticas.</span>
                  </div>
                )}

                {/* Resumen Táctico de Equipos (Gemini) */}
                {draftRecs?.allyCompAnalysis && (
                  <div className="p-3.5 bg-[#0A111F] rounded-lg border border-[#1E355B] space-y-2 text-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#60A5FA] block">
                      Perfil Táctico de la Composición:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                      <div className="bg-[#11223F] p-2 rounded border border-[#1E355B]">
                        <span className="text-[#94A3B8] text-[9px] block">DAÑO</span>
                        <span className="text-white font-bold">{draftRecs.allyCompAnalysis.damageProfile || 'Equilibrado'}</span>
                      </div>
                      <div className="bg-[#11223F] p-2 rounded border border-[#1E355B]">
                        <span className="text-[#94A3B8] text-[9px] block">FRONTLINE</span>
                        <span className="text-white font-bold">{draftRecs.allyCompAnalysis.frontlinePresence || 'Moderada'}</span>
                      </div>
                      <div className="bg-[#11223F] p-2 rounded border border-[#1E355B]">
                        <span className="text-[#94A3B8] text-[9px] block">INICIACIÓN</span>
                        <span className="text-white font-bold">{draftRecs.allyCompAnalysis.engagePresence || 'Media'}</span>
                      </div>
                      <div className="bg-[#11223F] p-2 rounded border border-[#1E355B]">
                        <span className="text-[#94A3B8] text-[9px] block">CONTROL (CC)</span>
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
                <div className="bg-[#0D192D] border border-[#1E355B] rounded-xl p-5 shadow-xl">
                  <h4 className="text-xs font-bold text-[#60A5FA] uppercase tracking-wider mb-3 flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-[#0070EB]"></span>
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
                          className={`p-3 rounded border flex items-center justify-between transition-all ${
                            isMe
                              ? 'bg-[#0070EB]/10 border-[#0070EB]'
                              : 'bg-[#0A111F] border-[#1E355B] hover:border-[#2A4878]'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            {champId > 0 ? (
                              <img
                                src={getChampionIconUrl(champId)}
                                alt={getChampionName(champId)}
                                className="w-8 h-8 rounded object-cover border border-[#0070EB]/60"
                              />
                            ) : (
                              <span className="w-8 h-8 rounded bg-[#11223F] text-[10px] font-mono font-bold text-[#94A3B8] border border-[#1E355B] flex items-center justify-center">
                                {pRole !== 'FILL' ? pRole.slice(0, 3) : `#${p.cellId}`}
                              </span>
                            )}
                            <div>
                              <div className="text-xs font-bold text-white flex items-center space-x-2">
                                <span>{isMe ? 'TÚ (JUGADOR LOCAL)' : `Aliado #${p.cellId}`}</span>
                                {isMe && (
                                  <span className="text-[10px] bg-[#0070EB] text-white font-bold px-1.5 py-0.2 rounded transform -skew-x-6">
                                    TÚ
                                  </span>
                                )}
                                <span className="text-[10px] text-[#60A5FA] font-mono">
                                  [{pRole}]
                                </span>
                              </div>
                              <span className="text-[11px] text-[#94A3B8]">
                                {champId > 0 ? getChampionName(champId) : 'Eligiendo...'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center space-x-1.5 font-mono text-[10px] text-[#64748B]">
                            <span className="bg-[#0A111F] px-1.5 py-0.5 rounded border border-[#1E355B]">D:{p.spell1Id || '-'}</span>
                            <span className="bg-[#0A111F] px-1.5 py-0.5 rounded border border-[#1E355B]">F:{p.spell2Id || '-'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Equipo Enemigo con Asignación Rápida de Rival */}
                <div className="bg-[#0D192D] border border-[#1E355B] rounded-xl p-5 shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-[#F87171] uppercase tracking-wider flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-[#D92546]"></span>
                      <span>EQUIPO ENEMIGO</span>
                    </h4>
                    {manualOpponentId !== null && (
                      <button
                        type="button"
                        onClick={() => setManualOpponentId(null)}
                        className="text-[11px] text-[#60A5FA] hover:text-white underline"
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
                          className={`p-3 rounded border flex items-center justify-between transition-all ${
                            hasChamp ? 'cursor-pointer' : ''
                          } ${
                            isCurrentRival
                              ? 'bg-[#D92546]/15 border-[#D92546] shadow-sm ring-1 ring-[#D92546]'
                              : 'bg-[#0A111F] border-[#1E355B] hover:border-[#D92546]/60'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            {hasChamp ? (
                              <img
                                src={getChampionIconUrl(champId)}
                                alt={getChampionName(champId)}
                                className="w-8 h-8 rounded object-cover border border-[#D92546]/60"
                              />
                            ) : (
                              <span className="w-8 h-8 rounded bg-[#11223F] text-[10px] font-mono font-bold text-[#94A3B8] border border-[#1E355B] flex items-center justify-center">
                                {pRole !== 'FILL' ? pRole.slice(0, 3) : `E${idx + 1}`}
                              </span>
                            )}
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-bold text-white block">
                                  {hasChamp ? getChampionName(champId) : `Enemigo #${idx + 1}`}
                                </span>
                                {isCurrentRival && (
                                  <span className="text-[10px] bg-[#D92546] text-white font-bold px-1.5 py-0.2 rounded transform -skew-x-6">
                                    {manualOpponentId === champId ? 'RIVAL FIJADO' : 'RIVAL DIRECTO'}
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-[#94A3B8]">
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
                                <span className="text-xs text-[#F87171] font-bold bg-[#D92546]/20 px-2 py-0.5 rounded border border-[#D92546]/40">
                                  Activo
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setManualOpponentId(champId);
                                  }}
                                  className="text-xs font-semibold text-white bg-[#1E355B] hover:bg-[#0070EB] px-2.5 py-1 rounded transition-colors"
                                >
                                  Fijar como Rival
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
            <div className="bg-[#0D192D] border border-[#1E355B] rounded-xl p-12 text-center shadow-xl relative">
              <div className="w-16 h-16 rounded bg-[#0A111F] border border-[#1E355B] flex items-center justify-center mx-auto mb-4 transform -skew-x-6">
                <svg className="w-8 h-8 text-[#0070EB] transform skew-x-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>

              <div className="inline-block px-2.5 py-0.5 mb-2 bg-[#0070EB] text-white text-[10px] font-bold tracking-wider uppercase transform -skew-x-6">
                MODO DE ESPERA
              </div>

              <h3 className="text-lg font-bold text-white mb-2 tracking-wide uppercase">
                Esperando Selección de Campeón
              </h3>
              <p className="text-xs text-[#94A3B8] max-w-md mx-auto mb-6 leading-relaxed">
                Al entrar en fase de selección de campeón, Itero Local detectará tu posición y campeón, predecirá a tu rival e inyectará automáticamente las runas completas y la build en el juego. Si deseas cambiar de rival, podrás hacer clic en cualquier campeón enemigo.
              </p>

              <div className="inline-flex items-center space-x-2 text-xs text-[#10B981] bg-[#0A111F] px-3.5 py-1.5 rounded border border-[#1E355B]">
                <span className="w-2 h-2 rounded-full bg-[#10B981]"></span>
                <span className="font-semibold">LCU WebSocket sincronizando</span>
              </div>

              <div className="mt-8 text-left">
                <RolePreferencesEditor
                  settings={settings.autoChampSelect}
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
