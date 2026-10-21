import React, { useState, useEffect } from 'react';
import { Shield, Swords, User, Settings, Play, Info } from 'lucide-react';
import { OnboardingModal } from './components/OnboardingModal';
import { AboutModal } from './components/AboutModal';
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
  const [autoAcceptStatus, setAutoAcceptStatus] = useState<{
    lastAction?: string;
    lastActionTimestamp?: number;
    pollingActivo?: boolean;
  }>({});
  const [isPermissionError, setIsPermissionError] = useState<boolean>(false);
  const [showAbout, setShowAbout] = useState<boolean>(false);

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

    if (window.api && window.api.getAutoAcceptStatus) {
      window.api.getAutoAcceptStatus().then((status: any) => {
        if (status) {
          setAutoAcceptStatus({
            lastAction: status.lastAction,
            lastActionTimestamp: status.lastActionTimestamp,
            pollingActivo: status.pollingActivo,
          });
          if (status.habilitado !== undefined) {
            setAutoAcceptEnabled(status.habilitado);
          }
          if (status.retrasoSegundos !== undefined) {
            setAutoAcceptDelay(status.retrasoSegundos);
          }
        }
      }).catch(() => {});
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

      const unsubAutoAccept = window.api.on('lcu:auto-accept-event', (status: any) => {
        if (status) {
          setAutoAcceptStatus(prev => ({
            ...prev,
            ...status,
            lastAction: status.lastAction || prev.lastAction,
            lastActionTimestamp: status.lastActionTimestamp || prev.lastActionTimestamp || Date.now(),
          }));
          if (status.habilitado !== undefined) setAutoAcceptEnabled(status.habilitado);
          if (status.retrasoSegundos !== undefined) setAutoAcceptDelay(status.retrasoSegundos);
          setLastIpcTimestamp(new Date().toLocaleTimeString());
          setLastIpcEvent(`lcu:auto-accept-event`);
        }
      });

      return () => {
        clearInterval(syncInterval);
        unsubLcu();
        unsubGameflow();
        unsubReadyCheck();
        unsubPerm();
        unsubAutoAccept();
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
    <div className="flex h-screen w-screen bg-[#08101E] text-[#E2E8F0] select-none p3r-bg-pattern">
      {/* Barra Lateral de Navegación Estilo Persona 3 Reload */}
      <aside className="w-64 bg-[#0A111F] border-r border-[#1E355B] flex flex-col justify-between p-4 shadow-xl z-20">
        <div>
          {/* Logo / Header P3R */}
          <div className="relative mb-6 pb-4 border-b border-[#1E355B]">
            <div className="flex items-center space-x-3 px-1">
              <div className="w-9 h-9 rounded bg-[#0070EB] flex items-center justify-center font-bold text-white transform -skew-x-6 text-sm">
                <span className="transform skew-x-6 tracking-wider">IT</span>
              </div>
              <div>
                <h1 className="font-bold text-white text-base tracking-wider flex items-center space-x-1">
                  <span>ITERO</span>
                  <span className="text-[#60A5FA] text-xs font-mono font-semibold">LOCAL</span>
                </h1>
                <p className="text-[10px] text-[#94A3B8] font-medium tracking-wide uppercase">Asistente de LoL</p>
              </div>
            </div>
          </div>

          {/* Menú de Navegación P3R */}
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
                  className={`w-full group relative flex items-center space-x-3 px-3.5 py-2.5 rounded-sm text-xs font-bold tracking-wider transition-all duration-150 transform -skew-x-6 ${
                    isActive
                      ? 'bg-[#0070EB] text-white border-l-4 border-white shadow-md'
                      : 'text-[#94A3B8] hover:text-white hover:bg-[#1E355B]/40 hover:border-l-2 hover:border-[#0070EB]'
                  }`}
                >
                  <div className="transform skew-x-6 flex items-center space-x-3">
                    <Icon className={`w-4 h-4 transition-transform group-hover:scale-105 ${isActive ? 'text-white' : 'text-[#64748B]'}`} />
                    <span>{tab.label}</span>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Botón Acerca de */}
        <button
          type="button"
          onClick={() => setShowAbout(true)}
          className="w-full mb-3 px-3 py-2 rounded-lg bg-[#0D192D] border border-[#1E355B] text-xs font-semibold text-[#94A3B8] hover:text-white hover:border-[#0070EB] transition flex items-center justify-between"
        >
          <span className="flex items-center space-x-2">
            <Info className="w-3.5 h-3.5 text-[#00D4FF]" />
            <span>Acerca de Itero Local</span>
          </span>
          <span className="text-[10px] bg-[#1E355B] px-1.5 py-0.5 rounded text-white">v1.0.0</span>
        </button>
        {/* Estado LCU en el footer de la barra lateral */}
        <div className="bg-[#0D192D] p-3.5 rounded border border-[#1E355B] shadow-lg">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-[#94A3B8] text-[11px] uppercase tracking-wider font-semibold">CLIENTE LOL:</span>
            <span
              className={`font-bold flex items-center text-[11px] ${
                lcuState === 'connected'
                  ? 'text-[#10B981]'
                  : lcuState === 'connecting'
                  ? 'text-[#F5A623]'
                  : 'text-[#D92546]'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full mr-1.5 ${
                  lcuState === 'connected'
                    ? 'bg-[#10B981]'
                    : lcuState === 'connecting'
                    ? 'bg-[#F5A623]'
                    : 'bg-[#D92546]'
                }`}
              />
              {lcuState === 'connected' ? 'ONLINE' : lcuState === 'connecting' ? 'SYNCING...' : 'OFFLINE'}
            </span>
          </div>
          <div className="text-[11px] text-[#64748B] flex items-center justify-between border-t border-[#1E355B] pt-1.5 mt-1">
            <span>GAMEFLOW:</span>
            <span className="text-white font-semibold font-mono">{gameflow}</span>
          </div>
        </div>
      </aside>

      {/* Contenido Principal */}
      <main className="flex-1 overflow-y-auto p-8 bg-[#08101E]">
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
            autoAcceptLastAction={autoAcceptStatus.lastAction}
            autoAcceptLastTimestamp={autoAcceptStatus.lastActionTimestamp}
            autoAcceptPollingActive={autoAcceptStatus.pollingActivo}
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

      {/* Modal Acerca de y Disclaimer Legal Riot */}
      <AboutModal
        isOpen={showAbout}
        onClose={() => setShowAbout(false)}
        patchVersion="26.20"
        clientVersion="26.20"
      />

      {/* Modal Onboarding Inicial */}
      {!settings.onboardingCompleted && (
        <OnboardingModal
          settings={settings}
          lcuConnected={lcuState === 'connected'}
          onComplete={handleSaveSettings}
        />
      )}
    </div>
  );
}
