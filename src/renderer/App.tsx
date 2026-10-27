import React, { useState, useEffect } from 'react';
import { Shield, Swords, User, Settings, Play, Info, RefreshCw } from 'lucide-react';
import { OnboardingModal } from './components/OnboardingModal';
import { AboutModal } from './components/AboutModal';
import type { LcuConnectionState, GameflowPhase, AppSettings, ReadyCheckEvent, TipoModo } from '../shared/types';
import { obtenerNombreModo } from '../shared/types';
import { DEFAULT_APP_SETTINGS, APP_NAME, formatGameflowPhase } from '../shared/constants';
import { DashboardView } from './views/DashboardView';
import { SettingsView } from './views/SettingsView';
import { ChampSelectView } from './views/ChampSelectView';
import { MatchupView } from './views/MatchupView';
import { ProfileView } from './views/ProfileView';
import logoUrl from './assets/logo.png';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'champSelect' | 'matchups' | 'profile' | 'settings'>('dashboard');
  const [lcuState, setLcuState] = useState<LcuConnectionState>('disconnected');
  const [mainLcuState, setMainLcuState] = useState<LcuConnectionState>('disconnected');
  const [lastConnectionError, setLastConnectionError] = useState<string | null>(null);
  const [lcuPort, setLcuPort] = useState<number | null>(null);
  const [lastIpcTimestamp, setLastIpcTimestamp] = useState<string>('Esperando...');
  const [lastIpcEvent, setLastIpcEvent] = useState<string>('Ninguno');
  const [gameflow, setGameflow] = useState<GameflowPhase>('None');
  const [gameMode, setGameMode] = useState<TipoModo | null>(null);
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
  const [updateInfo, setUpdateInfo] = useState<{ version: string; downloaded: boolean } | null>(null);
  const [appVersion, setAppVersion] = useState<string>('v1.0.1');

  useEffect(() => {
    if (window.api?.getAppVersion) {
      window.api.getAppVersion().then((v: string) => {
        if (v) setAppVersion(`v${v}`);
      }).catch(() => {});
    }
    const unsubAvail = window.api?.onUpdateAvailable?.((info: any) => {
      setUpdateInfo({ version: info.version, downloaded: false });
    });
    const unsubDown = window.api?.onUpdateDownloaded?.((info: any) => {
      setUpdateInfo({ version: info.version, downloaded: true });
    });
    return () => {
      unsubAvail?.();
      unsubDown?.();
    };
  }, []);

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

    if (window.api && window.api.getGameMode) {
      window.api.getGameMode().then((mode: TipoModo | null) => {
        setGameMode(mode);
      }).catch(() => {});
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

      const unsubGameMode = window.api.onGameModeChanged?.((mode: TipoModo | null) => {
        setGameMode(mode);
        setLastIpcTimestamp(new Date().toLocaleTimeString());
        setLastIpcEvent(`lcu:game-mode-changed -> ${mode}`);
      });

      return () => {
        clearInterval(syncInterval);
        unsubLcu();
        unsubGameflow();
        unsubReadyCheck();
        unsubPerm();
        unsubAutoAccept();
        unsubGameMode?.();
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
    <div className="flex h-screen w-screen bg-[#030814] text-[#E2E8F0] select-none p3r-bg-darkhour overflow-hidden">
      {/* Barra Lateral de Navegación Persona 3 Reload */}
      <aside className="w-68 bg-[#040A17] border-r-2 border-[#16335F] flex flex-col justify-between p-4 shadow-2xl z-20 shrink-0">
        <div>
          {/* Logo / Header EAsy */}
          <div className="relative mb-6 pb-4 border-b-2 border-[#16335F]">
            <div className="flex items-center space-x-3 px-1 pt-1">
              <img
                src={logoUrl}
                alt="EAsy Logo"
                className="w-10 h-10 object-contain rounded-lg p3r-shadow-blue border border-[#00E5FF]/40"
              />
              <div>
                <h1 className="font-black text-white text-2xl tracking-wider flex items-center font-p3r leading-none">
                  <span>EAsy</span>
                </h1>
                <span className="text-[10px] text-[#00E5FF] font-mono font-bold tracking-widest uppercase block mt-0.5">
                  LoL Assistant
                </span>
              </div>
            </div>
          </div>

          {/* Menú de Navegación con Selección Dinámica */}
          <nav className="space-y-2">
            {[
              { id: 'dashboard', label: 'INICIO', code: '01', icon: Shield },
              { id: 'champSelect', label: 'SELECCIÓN', code: '02', icon: Play },
              { id: 'matchups', label: 'ENFRENTAMIENTOS', code: '03', icon: Swords },
              { id: 'profile', label: 'PERFIL', code: '04', icon: User },
              { id: 'settings', label: 'AJUSTES', code: '05', icon: Settings },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`w-full group relative flex items-center justify-between px-4 py-2.5 text-xs font-black tracking-wider transition-all duration-150 transform -skew-x-8 cursor-pointer ${
                    isActive
                      ? 'bg-[#00E5FF] text-[#030814] p3r-shadow-blue border-l-4 border-[#0066FF]'
                      : 'bg-[#061022] text-[#7E9BB8] hover:text-white hover:bg-[#0C1B38] hover:border-[#0066FF] border border-[#16335F] hover:translate-x-1'
                  }`}
                >
                  <div className="transform skew-x-8 flex items-center space-x-3">
                    <Icon
                      className={`w-4 h-4 transition-transform ${
                        isActive ? 'text-[#030814]' : 'text-[#0066FF] group-hover:text-[#00E5FF]'
                      }`}
                    />
                    <span className="font-p3r-head">{tab.label}</span>
                  </div>

                  <div className="transform skew-x-8 flex items-center space-x-1.5 font-mono text-[10px]">
                    {isActive ? (
                      <span className="text-[#030814] font-black">▶</span>
                    ) : (
                      <span className="text-[#4A627E] group-hover:text-[#00E5FF]">{tab.code}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Notificación visual de actualización */}
        {updateInfo && (
          <div className="mb-3 p-3 bg-[#031A12] border-2 border-[#00E676] text-xs space-y-2 p3r-cut-tr p3r-shadow-hard animate-p3r-slide">
            <div className="flex items-center space-x-2 text-[#00E676] font-bold font-p3r-head">
              <RefreshCw className={`w-3.5 h-3.5 ${!updateInfo.downloaded ? 'animate-spin' : ''}`} />
              <span className="truncate">
                {updateInfo.downloaded ? `¡v${updateInfo.version} Lista!` : `Descargando v${updateInfo.version}...`}
              </span>
            </div>
            {updateInfo.downloaded ? (
              <button
                type="button"
                onClick={() => window.api?.installUpdate?.()}
                className="w-full py-1.5 px-2 bg-[#00E676] hover:bg-[#00C853] text-[#030814] text-[11px] font-black uppercase tracking-wider transform -skew-x-8 transition shadow cursor-pointer font-p3r-head"
              >
                <span className="transform skew-x-8 inline-block">Reiniciar para Actualizar</span>
              </button>
            ) : (
              <p className="text-[10px] text-[#00E676]/80 font-mono">Descargando parche en segundo plano...</p>
            )}
          </div>
        )}

        <div>
          {/* Botón Acerca de */}
          <button
            type="button"
            onClick={() => setShowAbout(true)}
            className="w-full mb-3 px-3.5 py-2 bg-[#061022] hover:bg-[#0C1B38] border border-[#16335F] hover:border-[#0066FF] text-xs font-bold text-[#7E9BB8] hover:text-white transition transform -skew-x-8 flex items-center justify-between cursor-pointer"
          >
            <span className="transform skew-x-8 flex items-center space-x-2">
              <Info className="w-3.5 h-3.5 text-[#00E5FF]" />
              <span className="font-p3r-head tracking-wider">Acerca de {APP_NAME}</span>
            </span>
            <span className="transform skew-x-8 text-[10px] bg-[#16335F] px-1.5 py-0.5 text-white font-mono">
              {appVersion}
            </span>
          </button>

          {/* Estado LCU en el footer de la barra lateral */}
          <div className="bg-[#050E20] p-3.5 border-2 border-[#16335F] p3r-bevel p3r-shadow-hard">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-[#7E9BB8] text-[10px] uppercase tracking-wider font-black font-p3r-head">
                CLIENTE:
              </span>
              <span
                className={`font-black flex items-center text-[10px] font-mono tracking-wider ${
                  lcuState === 'connected'
                    ? 'text-[#00E676]'
                    : lcuState === 'connecting'
                    ? 'text-[#FFE277]'
                    : 'text-[#FF1744]'
                }`}
              >
                <span
                  className={`w-2 h-2 mr-1.5 transform rotate-45 ${
                    lcuState === 'connected'
                      ? 'bg-[#00E676]'
                      : lcuState === 'connecting'
                      ? 'bg-[#FFE277]'
                      : 'bg-[#FF1744]'
                  }`}
                />
                {lcuState === 'connected' ? 'Conectado' : lcuState === 'connecting' ? 'Conectando' : 'Desconectado'}
              </span>
            </div>
            <div className="text-[11px] text-[#7E9BB8] flex items-center justify-between border-t border-[#16335F] pt-1.5 mt-1">
              <span className="font-p3r-head text-[10px] uppercase font-bold">FASE:</span>
              <span className="text-[#00E5FF] font-bold font-mono text-xs">{formatGameflowPhase(gameflow)}</span>
            </div>
            <div className="text-[11px] text-[#7E9BB8] flex items-center justify-between border-t border-[#16335F] pt-1.5 mt-1">
              <span className="font-p3r-head text-[10px] uppercase font-bold">MODO:</span>
              <span className="text-[#FFE277] font-bold font-mono text-xs truncate max-w-[130px]">{obtenerNombreModo(gameMode)}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Contenido Principal */}
      <main className="flex-1 overflow-y-auto p-8 bg-[#030814] p3r-bg-darkhour">
        {isPermissionError && (
          <div className="mb-6 p-4 bg-[#211503] border-2 border-[#FFE277] flex items-start space-x-3.5 text-[#FFE277] text-xs p3r-bevel p3r-shadow-hard">
            <span className="text-xl shrink-0">⚠️</span>
            <div className="flex-1">
              <h4 className="font-bold text-white uppercase tracking-wider font-p3r-head">Aviso de permisos de Windows</h4>
              <p className="mt-1 text-xs text-[#CBD5E1] leading-relaxed">
                Se detectó League of Legends en ejecución, pero Windows bloqueó la lectura del proceso por permisos. Ejecuta {APP_NAME} con el mismo nivel de permisos que League of Legends o configura la ruta en <strong>Ajustes</strong>.
              </p>
            </div>
            <button
              onClick={() => setActiveTab('settings')}
              className="px-4 py-2 bg-[#FFE277] hover:bg-[#FFD54F] text-[#030814] text-xs font-black uppercase tracking-wider transform -skew-x-8 transition shrink-0 cursor-pointer p3r-shadow-hard font-p3r-head"
            >
              <span className="transform skew-x-8 inline-block">Configurar ruta</span>
            </button>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <DashboardView
            lcuState={lcuState}
            mainLcuState={mainLcuState}
            gameflow={gameflow}
            gameMode={gameMode}
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
            mainLcuState={mainLcuState}
            lcuState={lcuState}
            lcuPort={lcuPort}
            lastIpcTimestamp={lastIpcTimestamp}
            lastIpcEvent={lastIpcEvent}
            lastConnectionError={lastConnectionError}
            onRefreshLcu={refrescarEstadoLcu}
          />
        )}
      </main>

      {/* Modal Acerca de y Disclaimer Legal Riot */}
      <AboutModal
        isOpen={showAbout}
        onClose={() => setShowAbout(false)}
        patchVersion="26.20"
        clientVersion="26.20"
        appVersion={appVersion}
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
