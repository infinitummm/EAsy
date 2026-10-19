import React, { useState, useEffect } from 'react';
import { ChampSelectSession, ChampSelectPlayer, Role, AppSettings } from '../../shared/types';
import { IPC_CHANNELS } from '../../shared/events';
import { RolePreferencesEditor } from '../components/RolePreferencesEditor';
import { MatchupView } from './MatchupView';
import { getChampionName, getChampionIconUrl } from '../../shared/champions';

interface ChampSelectViewProps {
  settings: AppSettings;
  onSaveSettings: (settings: Partial<AppSettings>) => void;
}

/**
 * Predice de forma inteligente el oponente en línea, funcionando tanto en
 * partidas clasificatorias/normales como en partidas personalizadas / bots (donde assignedPosition está vacío).
 */
function predictOpponentId(session: ChampSelectSession | null, localPlayer: ChampSelectPlayer | undefined): number {
  if (!session || !session.theirTeam || session.theirTeam.length === 0) return 24;

  // 1. Mismo rol explícito con campeón bloqueado o revelado
  if (localPlayer?.assignedPosition) {
    const match = session.theirTeam.find(
      (p) =>
        p.assignedPosition &&
        p.assignedPosition.toUpperCase() === localPlayer.assignedPosition.toUpperCase() &&
        p.championId > 0
    );
    if (match) return match.championId;
  }

  // 2. Mismo slot de celda / índice de equipo (útil en bots y partidas personalizadas)
  if (localPlayer) {
    const myIndex = session.myTeam.findIndex((p) => p.cellId === localPlayer.cellId);
    if (myIndex >= 0 && myIndex < session.theirTeam.length) {
      const directSlot = session.theirTeam[myIndex];
      if (directSlot && directSlot.championId > 0) {
        return directSlot.championId;
      }
    }
  }

  // 3. Primer campeón revelado en el equipo enemigo (> 0)
  const firstChamp = session.theirTeam.find((p) => p.championId > 0);
  if (firstChamp) return firstChamp.championId;

  // 4. Intent de pick si existe
  const firstIntent = session.theirTeam.find((p) => p.championPickIntent > 0);
  if (firstIntent) return firstIntent.championPickIntent;

  return 24; // Jax fallback
}

export const ChampSelectView: React.FC<ChampSelectViewProps> = ({
  settings,
  onSaveSettings
}) => {
  const [session, setSession] = useState<ChampSelectSession | null>(null);
  const [activeTab, setActiveTab] = useState<'live' | 'preferences'>('live');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  useEffect(() => {
    if (!window.api || !window.api.on) return;

    const unsubscribe = window.api.on(
      IPC_CHANNELS.LCU_CHAMP_SELECT_SESSION,
      (data: ChampSelectSession | null) => {
        setSession(data);
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
  const localRole: Role = (localPlayer?.assignedPosition as Role) || 'FILL';

  const myChampionId = localPlayer?.championId && localPlayer.championId > 0
    ? localPlayer.championId
    : localPlayer?.championPickIntent && localPlayer.championPickIntent > 0
    ? localPlayer.championPickIntent
    : 0;

  const predictedOpponentId = predictOpponentId(session, localPlayer);

  return (
    <div className="space-y-6">
      {/* Selector de sub-vistas Estilo Persona 3 Reload */}
      <div className="flex items-center space-x-3 border-b border-[#1B3B6F]/70 pb-3">
        <button
          onClick={() => setActiveTab('live')}
          className={`px-4 py-2 rounded text-xs font-black tracking-wider transition-all duration-150 flex items-center space-x-2 transform -skew-x-6 ${
            activeTab === 'live'
              ? 'bg-gradient-to-r from-[#00D4FF] to-[#0088FF] text-[#030813] shadow-[0_0_15px_rgba(0,212,255,0.4)]'
              : 'text-[#6F92BF] hover:text-white hover:bg-[#08152B]'
          }`}
        >
          <div className="transform skew-x-6 flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-[#030813] animate-pulse"></span>
            <span>SELECCIÓN EN VIVO</span>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('preferences')}
          className={`px-4 py-2 rounded text-xs font-black tracking-wider transition-all duration-150 flex items-center space-x-2 transform -skew-x-6 ${
            activeTab === 'preferences'
              ? 'bg-gradient-to-r from-[#00D4FF] to-[#0088FF] text-[#030813] shadow-[0_0_15px_rgba(0,212,255,0.4)]'
              : 'text-[#6F92BF] hover:text-white hover:bg-[#08152B]'
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
              {/* HUD Superior: Fase y Temporizador Fiel P3R */}
              <div className="bg-[#08152B]/95 border border-[#1B3B6F] rounded-xl p-5 shadow-[0_8px_30px_rgba(0,0,0,0.5)] flex flex-wrap items-center justify-between gap-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-2 h-full bg-[#00D4FF] shadow-[0_0_10px_#00D4FF]" />

                <div className="flex items-center space-x-4 pl-2">
                  <div className="w-10 h-10 rounded bg-[#040C1A] border border-[#00D4FF]/40 flex items-center justify-center font-black text-[#00D4FF] shadow-[0_0_12px_rgba(0,212,255,0.2)]">
                    <span className="text-sm font-mono tracking-tighter">P3R</span>
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-[#00FFB2] animate-ping" />
                      <h3 className="text-sm font-black text-white uppercase tracking-wider">
                        FASE: {session.timer.phase || 'SELECCIÓN'}
                      </h3>
                    </div>
                    <p className="text-xs text-[#6F92BF] font-mono mt-0.5">
                      POSICIÓN DETECTADA: <strong className="text-[#00D4FF]">{localRole}</strong> | CELDA: {session.localPlayerCellId}
                    </p>
                  </div>
                </div>

                {/* Temporizador fiel en tiempo real */}
                <div className="flex items-center space-x-3 bg-[#040C1A] px-4 py-2.5 rounded-lg border border-[#1B3B6F] shadow-inner">
                  <div className="text-right">
                    <span className="text-[10px] text-[#6F92BF] font-mono uppercase tracking-widest block">
                      TIEMPO RESTANTE
                    </span>
                    <span className="text-xs text-[#5078A8] font-mono">SEGUNDO A SEGUNDO</span>
                  </div>
                  <div
                    className={`text-3xl font-black font-mono tracking-tight px-3 py-1 rounded border ${
                      remainingSeconds <= 10
                        ? 'text-[#FF2E63] border-[#FF2E63] bg-[#FF2E63]/10 shadow-[0_0_12px_rgba(255,46,99,0.5)] animate-pulse'
                        : 'text-[#00F0FF] border-[#00D4FF]/50 bg-[#00D4FF]/10 shadow-[0_0_12px_rgba(0,212,255,0.3)]'
                    }`}
                  >
                    {remainingSeconds.toString().padStart(2, '0')}s
                  </div>
                </div>
              </div>

              {/* Tableros de Equipos Estilo P3R */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Mi Equipo (Aliados) */}
                <div className="bg-[#08152B]/95 border border-[#1B3B6F] rounded-xl p-5 shadow-lg">
                  <h4 className="text-xs font-mono font-black text-[#00D4FF] uppercase tracking-wider mb-3 flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-[#00D4FF] shadow-[0_0_6px_#00D4FF]"></span>
                    <span>MI EQUIPO (ALIADOS)</span>
                  </h4>

                  <div className="space-y-2.5">
                    {session.myTeam.map((p: ChampSelectPlayer) => {
                      const isMe = p.cellId === session.localPlayerCellId;
                      return (
                        <div
                          key={p.cellId}
                          className={`p-3 rounded border flex items-center justify-between transition-all ${
                            isMe
                              ? 'bg-[#00D4FF]/10 border-[#00D4FF] shadow-[0_0_14px_rgba(0,212,255,0.25)]'
                              : 'bg-[#040C1A]/80 border-[#1B3B6F]/80 hover:border-[#1B3B6F]'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            {p.championId > 0 ? (
                              <img
                                src={getChampionIconUrl(p.championId)}
                                alt={getChampionName(p.championId)}
                                className="w-8 h-8 rounded object-cover border border-[#00D4FF]/60"
                              />
                            ) : p.championPickIntent > 0 ? (
                              <img
                                src={getChampionIconUrl(p.championPickIntent)}
                                alt={getChampionName(p.championPickIntent)}
                                className="w-8 h-8 rounded object-cover border border-[#FFD700]/60 opacity-80"
                              />
                            ) : (
                              <span className="w-8 h-8 rounded bg-[#091830] text-[10px] font-mono font-bold text-[#6F92BF] border border-[#1B3B6F] flex items-center justify-center">
                                {p.assignedPosition ? p.assignedPosition.slice(0, 3) : `#${p.cellId}`}
                              </span>
                            )}
                            <div>
                              <div className="text-xs font-bold text-white flex items-center space-x-2">
                                <span>{isMe ? 'TÚ (JUGADOR LOCAL)' : `Aliado #${p.cellId}`}</span>
                                {isMe && (
                                  <span className="text-[10px] bg-[#00D4FF] text-[#030813] font-black px-1.5 py-0.2 rounded transform -skew-x-6">
                                    YOU
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-[#A8C8F0] font-mono">
                                {p.championId > 0
                                  ? getChampionName(p.championId)
                                  : p.championPickIntent > 0
                                  ? `Intent: ${getChampionName(p.championPickIntent)}`
                                  : 'Eligiendo...'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center space-x-1.5 font-mono text-[10px] text-[#5078A8]">
                            <span className="bg-[#040C1A] px-1.5 py-0.5 rounded border border-[#1B3B6F]">D:{p.spell1Id || '-'}</span>
                            <span className="bg-[#040C1A] px-1.5 py-0.5 rounded border border-[#1B3B6F]">F:{p.spell2Id || '-'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Equipo Enemigo */}
                <div className="bg-[#08152B]/95 border border-[#1B3B6F] rounded-xl p-5 shadow-lg">
                  <h4 className="text-xs font-mono font-black text-[#FF2E63] uppercase tracking-wider mb-3 flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-[#FF2E63] shadow-[0_0_6px_#FF2E63]"></span>
                    <span>EQUIPO ENEMIGO</span>
                  </h4>

                  <div className="space-y-2.5">
                    {session.theirTeam.map((p: ChampSelectPlayer, idx: number) => {
                      const isPredictedOpponent = p.championId > 0 && p.championId === predictedOpponentId;
                      return (
                        <div
                          key={idx}
                          className={`p-3 rounded border flex items-center justify-between transition-all ${
                            isPredictedOpponent
                              ? 'bg-[#FF2E63]/15 border-[#FF2E63] shadow-[0_0_14px_rgba(255,46,99,0.3)]'
                              : 'bg-[#040C1A]/80 border-[#1B3B6F]/80'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            {p.championId > 0 ? (
                              <img
                                src={getChampionIconUrl(p.championId)}
                                alt={getChampionName(p.championId)}
                                className="w-8 h-8 rounded object-cover border border-[#FF2E63]/60"
                              />
                            ) : (
                              <span className="w-8 h-8 rounded bg-[#091830] text-[10px] font-mono font-bold text-[#6F92BF] border border-[#1B3B6F] flex items-center justify-center">
                                {p.assignedPosition ? p.assignedPosition.slice(0, 3) : `E${idx + 1}`}
                              </span>
                            )}
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-bold text-white block">
                                  {p.championId > 0 ? getChampionName(p.championId) : `Enemigo #${idx + 1}`}
                                </span>
                                {isPredictedOpponent && (
                                  <span className="text-[10px] bg-[#FF2E63] text-white font-black px-1.5 py-0.2 rounded transform -skew-x-6">
                                    RIVAL DIRECTO
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-[#A8C8F0] font-mono">
                                {p.championId > 0 ? 'Campeón Revelado' : 'Campeón Oculto'}
                              </span>
                            </div>
                          </div>

                          {p.championId > 0 && (
                            <span className="text-xs text-[#FF85A2] font-mono font-bold bg-[#FF2E63]/20 px-2 py-0.5 rounded border border-[#FF2E63]/50">
                              {getChampionName(p.championId)}
                            </span>
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
                  initialChampionId={myChampionId > 0 ? myChampionId : 22}
                  initialOpponentId={predictedOpponentId}
                  initialRole={localRole !== 'FILL' ? localRole : 'TOP'}
                  autoRun={myChampionId > 0}
                />
              </div>
            </div>
          ) : (
            <div className="bg-[#08152B]/80 border border-[#1B3B6F] rounded-xl p-12 text-center shadow-lg relative overflow-hidden">
              <div className="w-16 h-16 rounded bg-[#040C1A] border border-[#00D4FF]/50 flex items-center justify-center mx-auto mb-4 shadow-[0_0_18px_rgba(0,212,255,0.3)] transform -skew-x-6">
                <svg className="w-8 h-8 text-[#00D4FF] transform skew-x-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>

              <div className="inline-block px-2.5 py-0.5 mb-2 bg-[#00D4FF]/15 border border-[#00D4FF]/40 text-[#00F0FF] text-[10px] font-black tracking-widest uppercase transform -skew-x-6">
                STANDBY MODE // LCU LISTENER
              </div>

              <h3 className="text-lg font-black text-white mb-2 tracking-wide uppercase">
                Esperando Selección de Campeón
              </h3>
              <p className="text-xs text-[#6F92BF] max-w-md mx-auto mb-6 leading-relaxed font-mono">
                Al entrar en fase de selección de campeón, Itero Local detectará tu línea y campeón, predecirá a tu rival e inyectará automáticamente las runas completas y la build en la tienda de objetos in-game.
              </p>

              <div className="inline-flex items-center space-x-2 text-xs text-[#00FFB2] bg-[#040C1A] px-3.5 py-1.5 rounded border border-[#1B3B6F]">
                <span className="w-2 h-2 rounded-full bg-[#00FFB2] animate-pulse shadow-[0_0_8px_#00FFB2]"></span>
                <span className="font-mono">LCU WebSocket conectado y sincronizando</span>
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
