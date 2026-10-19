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

import {
  extractLocalChampionId,
  extractPlayerChampionId,
  detectPlayerRole,
  predictOpponentId,
  normalizeRole
} from '../../shared/roleDetection';

export const ChampSelectView: React.FC<ChampSelectViewProps> = ({
  settings,
  onSaveSettings
}) => {
  const [session, setSession] = useState<ChampSelectSession | null>(null);
  const [activeTab, setActiveTab] = useState<'live' | 'preferences'>('live');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [manualOpponentId, setManualOpponentId] = useState<number | null>(null);

  useEffect(() => {
    if (!window.api || !window.api.on) return;

    const unsubscribe = window.api.on(
      IPC_CHANNELS.LCU_CHAMP_SELECT_SESSION,
      (data: ChampSelectSession | null) => {
        setSession(data);
        if (!data) {
          setManualOpponentId(null);
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
