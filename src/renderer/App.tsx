import React, { useState, useEffect } from 'react';
import { Shield, Swords, User, Settings, Play } from 'lucide-react';
import type { LcuConnectionState, GameflowPhase, AppSettings, ReadyCheckEvent } from '../shared/types';
import { DEFAULT_APP_SETTINGS } from '../shared/constants';
import { DashboardView } from './views/DashboardView';
import { SettingsView } from './views/SettingsView';
import { ChampSelectView } from './views/ChampSelectView';
import { MatchupView } from './views/MatchupView';
import { ProfileView } from './views/ProfileView';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'champSelect' | 'matchups' | 'profile' | 'settings'>('dashboard');
  const [lcuState, setLcuState] = useState<LcuConnectionState>('disconnected');
  const [mainLcuState, setMainLcuState] = useState<LcuConnectionState>('disconnected');
  const [lastConnectionError, setLastConnectionError] = useState<string | null>(null);
  const [lcuPort, setLcuPort] = useState<number | null>(null);
  const [lastIpcTimestamp, setLastIpcTimestamp] = useState<string>('Esperando...');
  const [lastIpcEvent, setLastIpcEvent] = useState<string>('Ninguno');
  const [gameflow, setGameflow] = useState<GameflowPhase>('None');
  const [readyCheck, setReadyCheck] = useState<ReadyCheckEvent | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [autoAcceptEnabled, setAutoAcceptEnabled] = useState<boolean>(true);
  const [autoAcceptDelay, setAutoAcceptDelay] = useState<number>(2);
  const [isPermissionError, setIsPermissionError] = useState<boolean>(false);

  const refrescarEstadoLcu = () => {
    if (window.api && window.api.getLcuState) {
      window.api.getLcuState().then((info) => {
        if (info) {
          setMainLcuState(info.state);
          setLcuState(info.state);
          setGameflow(info.gameflow);
          setIsPermissionError(info.isPermissionError);
          setLastConnectionError(info.lastError ?? null);
          setLcuPort(info.port ?? null);
          setLastIpcTimestamp(new Date().toLocaleTimeString());
          setLastIpcEvent('getLcuState (invoke)');
          if (info.gameflow === 'ChampSelect') {
            setActiveTab('champSelect');
          }
        }
      }).catch((err) => {
        setLastConnectionError(`Error en invoke getLcuState: ${err.message}`);
      });
    }
  };

  useEffect(() => {
    if (window.api) {
      window.api.getSettings().then((loaded) => {
        if (loaded) {
          setSettings(loaded);
          setAutoAcceptEnabled(loaded.autoAccept.enabled);
          setAutoAcceptDelay(loaded.autoAccept.delaySeconds);
        }
      }).catch(console.error);

      // Consulta de estado inmediata
      refrescarEstadoLcu();

      // Sincronización periódica cada 2.5s para autorreparar cualquier pérdida de eventos IPC
      const syncInterval = setInterval(refrescarEstadoLcu, 2500);

      const unsubLcu = window.api.on('lcu:state-changed', (state: LcuConnectionState) => {
        setLcuState(state);
        setMainLcuState(state);
        setLastIpcTimestamp(new Date().toLocaleTimeString());
        setLastIpcEvent(`lcu:state-changed -> ${state}`);
      });

      const unsubGameflow = window.api.on('lcu:gameflow-changed', (phase: GameflowPhase) => {
        setGameflow(phase);
        setLastIpcTimestamp(new Date().toLocaleTimeString());
        setLastIpcEvent(`lcu:gameflow-changed -> ${phase}`);
        // Si el cliente entra a selección de campeón, auto-cambiar a la pestaña Champ Select
        if (phase === 'ChampSelect') {
          setActiveTab('champSelect');
        }
      });

      const unsubReadyCheck = window.api.on('lcu:ready-check', (event: ReadyCheckEvent) => {
        setReadyCheck(event);
        setLastIpcTimestamp(new Date().toLocaleTimeString());
        setLastIpcEvent(`lcu:ready-check`);
      });

      const unsubPerm = window.api.on('lcu:permission-error', (errorPermisos: boolean) => {
        setIsPermissionError(errorPermisos);
        setLastIpcTimestamp(new Date().toLocaleTimeString());
        setLastIpcEvent(`lcu:permission-error -> ${errorPermisos}`);
      });

      return () => {
        clearInterval(syncInterval);
        unsubLcu();
        unsubGameflow();
        unsubReadyCheck();
        unsubPerm();
      };
    }
  }, []);

  const handleToggleAutoAccept = () => {
    const nextState = !autoAcceptEnabled;
    setAutoAcceptEnabled(nextState);
    if (window.api) {
      window.api.setAutoAccept({ enabled: nextState, delaySeconds: autoAcceptDelay }).catch(console.error);
    }
  };

  const handleChangeDelay = (seconds: number) => {
    setAutoAcceptDelay(seconds);
    if (window.api) {
      window.api.setAutoAccept({ enabled: autoAcceptEnabled, delaySeconds: seconds }).catch(console.error);
    }
  };

  const handleSaveSettings = async (newSettings: Partial<AppSettings>) => {
    if (window.api) {
      await window.api.saveSettings(newSettings);
      const updated = await window.api.getSettings();
      if (updated) {
        setSettings(updated);
      }
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[#030813] text-[#D0E2FF] select-none p3r-bg-pattern">
      {/* Barra Lateral de Navegación Estilo Persona 3 Reload */}
      <aside className="w-64 bg-gradient-to-b from-[#061021] via-[#08152B] to-[#040C1A] border-r border-[#1B3B6F]/80 flex flex-col justify-between p-4 shadow-[4px_0_24px_rgba(0,0,0,0.6)] z-20">
        <div>
          {/* Logo / Header P3R */}
          <div className="relative mb-6 pb-4 border-b border-[#1B3B6F]/60">
            <div className="flex items-center space-x-3 px-1">
              <div className="w-9 h-9 rounded bg-gradient-to-br from-[#00D4FF] to-[#0055FF] flex items-center justify-center font-black text-[#030813] shadow-[0_0_14px_rgba(0,212,255,0.6)] transform -skew-x-6 text-sm">
                <span className="transform skew-x-6 tracking-tighter">P3R</span>
              </div>
              <div>
                <h1 className="font-black text-white text-base tracking-wider flex items-center space-x-1">
                  <span>ITERO</span>
                  <span className="text-[#00D4FF] text-xs font-mono font-bold tracking-widest">// RELOAD</span>
                </h1>
                <p className="text-[10px] text-[#5A82B5] font-mono tracking-widest uppercase">Tactical AI Assistant</p>
              </div>
            </div>
            {/* Glowing cyan line indicator */}
            <div className="absolute -bottom-[1px] left-0 w-24 h-[2px] bg-[#00D4FF] shadow-[0_0_8px_#00D4FF]" />
          </div>

          {/* Menú de Navegación Slanted P3R */}
          <nav className="space-y-1.5">
            {[
              { id: 'dashboard', label: 'DASHBOARD', icon: Shield },
              { id: 'champSelect', label: 'CHAMP SELECT', icon: Play },
              { id: 'matchups', label: 'MATCHUPS & BUILDS', icon: Swords },
              { id: 'profile', label: 'MI PERFIL', icon: User },
              { id: 'settings', label: 'AJUSTES & KEYS', icon: Settings },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`w-full group relative flex items-center space-x-3 px-3.5 py-2.5 rounded-sm text-xs font-bold tracking-wider transition-all duration-200 transform -skew-x-6 ${
                    isActive
                      ? 'bg-gradient-to-r from-[#00D4FF]/25 via-[#0088FF]/15 to-transparent text-[#00F0FF] border-l-4 border-[#00D4FF] shadow-[0_0_16px_rgba(0,212,255,0.25)]'
                      : 'text-[#6F92BF] hover:text-[#E0F0FF] hover:bg-[#0E2242]/50 hover:border-l-2 hover:border-[#00D4FF]/50'
                  }`}
                >
                  <div className="transform skew-x-6 flex items-center space-x-3">
                    <Icon className={`w-4 h-4 transition-transform group-hover:scale-110 ${isActive ? 'text-[#00D4FF]' : 'text-[#5078A8]'}`} />
                    <span>{tab.label}</span>
                  </div>
                  {isActive && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-[#00D4FF] rounded-full shadow-[0_0_6px_#00D4FF] animate-pulse" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Estado LCU en el footer de la barra lateral */}
        <div className="bg-[#08152B]/90 p-3.5 rounded border border-[#1B3B6F] shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-8 h-8 bg-gradient-to-bl from-[#00D4FF]/10 to-transparent pointer-events-none" />
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-[#648CB8] font-mono text-[11px] uppercase tracking-wider">LCU CLIENT:</span>
            <span
              className={`font-bold flex items-center text-[11px] ${
                lcuState === 'connected'
                  ? 'text-[#00FFB2]'
                  : lcuState === 'connecting'
                  ? 'text-[#FFD700]'
                  : 'text-[#FF2E63]'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full mr-1.5 ${
                  lcuState === 'connected'
                    ? 'bg-[#00FFB2] shadow-[0_0_8px_#00FFB2] animate-pulse'
                    : lcuState === 'connecting'
                    ? 'bg-[#FFD700] shadow-[0_0_8px_#FFD700]'
                    : 'bg-[#FF2E63] shadow-[0_0_8px_#FF2E63]'
                }`}
              />
              {lcuState === 'connected' ? 'ONLINE' : lcuState === 'connecting' ? 'SYNCING...' : 'OFFLINE'}
            </span>
          </div>
          <div className="text-[11px] text-[#5078A8] font-mono flex items-center justify-between border-t border-[#1B3B6F]/60 pt-1.5 mt-1">
            <span>GAMEFLOW:</span>
            <span className="text-[#00D4FF] font-semibold">{gameflow}</span>
          </div>
        </div>
      </aside>

      {/* Contenido Principal */}
      <main className="flex-1 overflow-y-auto p-8 bg-[#040B17]/95">
        {isPermissionError && (
          <div className="mb-6 p-4 rounded bg-amber-950/40 border border-amber-600/50 flex items-start space-x-3 text-amber-200 text-sm shadow-md">
            <span className="text-xl shrink-0">⚠️</span>
            <div className="flex-1">
              <h4 className="font-semibold text-amber-300">Aviso de Privilegios de Windows</h4>
              <p className="mt-0.5 text-xs text-amber-200/90 leading-relaxed">
                Se detectó League of Legends en ejecución, pero Windows bloqueó la lectura del proceso por diferencia de privilegios. Ejecuta Itero Local con el mismo nivel de permisos que League of Legends (ambos como Administrador o ambos como usuario estándar), o configura la ruta de instalación en la pestaña <strong>Ajustes & Keys</strong>.
              </p>
            </div>
            <button
              onClick={() => setActiveTab('settings')}
              className="px-3 py-1 bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 text-xs font-semibold rounded transition shrink-0"
            >
              Configurar Ruta
            </button>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <DashboardView
            lcuState={lcuState}
            mainLcuState={mainLcuState}
            gameflow={gameflow}
            readyCheck={readyCheck}
            autoAcceptEnabled={autoAcceptEnabled}
            autoAcceptDelay={autoAcceptDelay}
            lastConnectionError={lastConnectionError}
            lcuPort={lcuPort}
            lastIpcTimestamp={lastIpcTimestamp}
            lastIpcEvent={lastIpcEvent}
            onToggleAutoAccept={handleToggleAutoAccept}
            onChangeDelay={handleChangeDelay}
            onRefreshLcu={refrescarEstadoLcu}
          />
        )}

        {activeTab === 'champSelect' && (
          <ChampSelectView
            settings={settings}
            onSaveSettings={handleSaveSettings}
          />
        )}

        {activeTab === 'matchups' && (
          <MatchupView />
        )}

        {activeTab === 'profile' && (
          <ProfileView
            settings={settings}
            onSaveSettings={handleSaveSettings}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            onSaveSettings={handleSaveSettings}
          />
        )}
      </main>
    </div>
  );
}
