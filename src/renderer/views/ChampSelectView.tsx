import React, { useState, useEffect } from 'react';
import { ChampSelectSession, ChampSelectPlayer, Role, AppSettings } from '../../shared/types';
import { IPC_CHANNELS } from '../../shared/events';
import { RolePreferencesEditor } from '../components/RolePreferencesEditor';
import { MatchupView } from './MatchupView';

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

  const localPlayer = session?.myTeam.find((p) => p.cellId === session.localPlayerCellId);
  const localRole: Role = (localPlayer?.assignedPosition as Role) || 'FILL';

  // Buscar rival directo en la misma posición (si está revelado)
  const opponentInRole = session?.theirTeam.find(
    (p) => p.assignedPosition === localPlayer?.assignedPosition && p.championId > 0
  );

  return (
    <div className="space-y-6">
      {/* Selector de sub-vistas */}
      <div className="flex items-center space-x-3 border-b border-neutral-800 pb-3">
        <button
          onClick={() => setActiveTab('live')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-2 ${
            activeTab === 'live'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Selección en Vivo</span>
        </button>

        <button
          onClick={() => setActiveTab('preferences')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-2 ${
            activeTab === 'preferences'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          <span>Preferencias de Auto-Pick / Ban</span>
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
              {/* Barra de Estado de la Fase y Temporizador */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-lg flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping"></span>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      Fase Actual: {session.timer.phase || 'Selección'}
                    </h3>
                    <p className="text-xs text-neutral-400">
                      Mi Posición: <strong className="text-indigo-400">{localRole}</strong> | Celda:{' '}
                      {session.localPlayerCellId}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs text-neutral-400 uppercase font-semibold">Tiempo Restante</span>
                  <div className="text-2xl font-black text-amber-400 font-mono">
                    {Math.max(0, Math.floor(session.timer.adjustedTimeLeftInPhase / 1000))} s
                  </div>
                </div>
              </div>

              {/* Tableros de Equipos */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Mi Equipo (Aliados) */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-lg">
                  <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider mb-3 flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                    <span>Mi Equipo (Aliados)</span>
                  </h4>

                  <div className="space-y-2.5">
                    {session.myTeam.map((p: ChampSelectPlayer) => {
                      const isMe = p.cellId === session.localPlayerCellId;
                      return (
                        <div
                          key={p.cellId}
                          className={`p-3 rounded-lg border flex items-center justify-between ${
                            isMe
                              ? 'bg-cyan-950/30 border-cyan-500/50'
                              : 'bg-neutral-950/50 border-neutral-800'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <span className="w-6 h-6 rounded bg-neutral-800 text-[10px] font-bold text-neutral-300 flex items-center justify-center">
                              {p.assignedPosition.slice(0, 3)}
                            </span>
                            <div>
                              <div className="text-xs font-semibold text-white flex items-center space-x-1.5">
                                <span>{isMe ? 'Tú (Jugador Local)' : `Aliado #${p.cellId}`}</span>
                                {isMe && (
                                  <span className="text-[10px] bg-cyan-500 text-neutral-950 font-bold px-1.5 py-0.2 rounded">
                                    TÚ
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-neutral-400">
                                {p.championId > 0
                                  ? `Campeón ID: ${p.championId}`
                                  : p.championPickIntent > 0
                                  ? `Hover ID: ${p.championPickIntent}`
                                  : 'Esperando elección...'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center space-x-1 font-mono text-[10px] text-neutral-400">
                            <span>D:{p.spell1Id || '-'}</span>
                            <span>F:{p.spell2Id || '-'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Equipo Enemigo */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-lg">
                  <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider mb-3 flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                    <span>Equipo Enemigo</span>
                  </h4>

                  <div className="space-y-2.5">
                    {session.theirTeam.map((p: ChampSelectPlayer, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-neutral-950/50 border border-neutral-800 flex items-center justify-between"
                      >
                        <div className="flex items-center space-x-3">
                          <span className="w-6 h-6 rounded bg-neutral-800 text-[10px] font-bold text-neutral-300 flex items-center justify-center">
                            {p.assignedPosition ? p.assignedPosition.slice(0, 3) : `E${idx + 1}`}
                          </span>
                          <div>
                            <span className="text-xs font-semibold text-neutral-200 block">
                              Enemigo #{idx + 1}
                            </span>
                            <span className="text-[11px] text-neutral-400">
                              {p.championId > 0
                                ? `Campeón Revelado (ID ${p.championId})`
                                : 'Campeón Oculto'}
                            </span>
                          </div>
                        </div>

                        {p.championId > 0 && (
                          <span className="text-xs text-rose-400 font-semibold bg-rose-950/40 px-2 py-0.5 rounded border border-rose-900">
                            ID: {p.championId}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Panel de Matchup y Recomendación de IA para el Enfrentamiento Actual */}
              <div className="pt-2">
                <MatchupView
                  initialChampionId={localPlayer?.championId || localPlayer?.championPickIntent || 266}
                  initialOpponentId={opponentInRole?.championId || 24}
                  initialRole={localRole !== 'FILL' ? localRole : 'TOP'}
                />
              </div>
            </div>
          ) : (
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-12 text-center shadow-lg">
              <div className="w-16 h-16 rounded-full bg-indigo-950/60 border border-indigo-800/60 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>

              <h3 className="text-lg font-bold text-white mb-2">
                Esperando Selección de Campeón
              </h3>
              <p className="text-sm text-neutral-400 max-w-md mx-auto mb-6">
                El asistente detectará automáticamente cuando entres en fase de selección de campeón en el cliente de LoL y cargará en vivo los picks, bans y recomendaciones de Gemini AI.
              </p>

              <div className="inline-flex items-center space-x-2 text-xs text-neutral-500 bg-neutral-950/80 px-3 py-1.5 rounded-full border border-neutral-800">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                <span>WebSocket LCU escuchando /lol-champ-select/v1/session</span>
              </div>

              {/* Permite previsualizar el editor de preferencias mientras no está en partida */}
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
