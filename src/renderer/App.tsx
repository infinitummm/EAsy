import React, { useState, useEffect } from 'react';
import { Shield, Swords, User, Settings, Play } from 'lucide-react';
import type { LcuConnectionState, GameflowPhase, AppSettings, ReadyCheckEvent } from '../shared/types';
import { DEFAULT_APP_SETTINGS } from '../shared/constants';
import { DashboardView } from './views/DashboardView';
import { SettingsView } from './views/SettingsView';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'champSelect' | 'matchups' | 'profile' | 'settings'>('dashboard');
  const [lcuState, setLcuState] = useState<LcuConnectionState>('disconnected');
  const [gameflow, setGameflow] = useState<GameflowPhase>('None');
  const [readyCheck, setReadyCheck] = useState<ReadyCheckEvent | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [autoAcceptEnabled, setAutoAcceptEnabled] = useState<boolean>(true);
  const [autoAcceptDelay, setAutoAcceptDelay] = useState<number>(2);

  useEffect(() => {
    if (window.api) {
      window.api.getSettings().then((loaded) => {
        if (loaded) {
          setSettings(loaded);
          setAutoAcceptEnabled(loaded.autoAccept.enabled);
          setAutoAcceptDelay(loaded.autoAccept.delaySeconds);
        }
      }).catch(console.error);

      const unsubLcu = window.api.on('lcu:state-changed', (state: LcuConnectionState) => {
        setLcuState(state);
      });

      const unsubGameflow = window.api.on('lcu:gameflow-changed', (phase: GameflowPhase) => {
        setGameflow(phase);
      });

      const unsubReadyCheck = window.api.on('lcu:ready-check', (event: ReadyCheckEvent) => {
        setReadyCheck(event);
      });

      return () => {
        unsubLcu();
        unsubGameflow();
        unsubReadyCheck();
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

  return (
    <div className="flex h-screen w-screen bg-[#091428] text-gray-200">
      {/* Barra Lateral de Navegación */}
      <aside className="w-64 bg-[#0A1428] border-r border-[#1E282D] flex flex-col justify-between p-4">
        <div>
          {/* Logo / Título */}
          <div className="flex items-center space-x-3 px-2 py-3 mb-6 border-b border-[#1E282D]">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-[#C89B3C] to-[#785A28] flex items-center justify-center font-bold text-black shadow">
              IT
            </div>
            <div>
              <h1 className="font-bold text-[#F0E6D2] text-sm tracking-wider">ITERO LOCAL</h1>
              <p className="text-xs text-[#A09B8C]">League Assistant</p>
            </div>
          </div>

          {/* Menú de Navegación */}
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded text-sm font-medium transition ${
                activeTab === 'dashboard'
                  ? 'bg-[#1E2328] text-[#C89B3C] border-l-2 border-[#C89B3C]'
                  : 'text-[#A09B8C] hover:bg-[#111A24] hover:text-[#F0E6D2]'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('champSelect')}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded text-sm font-medium transition ${
                activeTab === 'champSelect'
                  ? 'bg-[#1E2328] text-[#C89B3C] border-l-2 border-[#C89B3C]'
                  : 'text-[#A09B8C] hover:bg-[#111A24] hover:text-[#F0E6D2]'
              }`}
            >
              <Play className="w-4 h-4" />
              <span>Champ Select</span>
            </button>

            <button
              onClick={() => setActiveTab('matchups')}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded text-sm font-medium transition ${
                activeTab === 'matchups'
                  ? 'bg-[#1E2328] text-[#C89B3C] border-l-2 border-[#C89B3C]'
                  : 'text-[#A09B8C] hover:bg-[#111A24] hover:text-[#F0E6D2]'
              }`}
            >
              <Swords className="w-4 h-4" />
              <span>Matchups & Builds</span>
            </button>

            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded text-sm font-medium transition ${
                activeTab === 'profile'
                  ? 'bg-[#1E2328] text-[#C89B3C] border-l-2 border-[#C89B3C]'
                  : 'text-[#A09B8C] hover:bg-[#111A24] hover:text-[#F0E6D2]'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Mi Perfil</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded text-sm font-medium transition ${
                activeTab === 'settings'
                  ? 'bg-[#1E2328] text-[#C89B3C] border-l-2 border-[#C89B3C]'
                  : 'text-[#A09B8C] hover:bg-[#111A24] hover:text-[#F0E6D2]'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Ajustes & Keys</span>
            </button>
          </nav>
        </div>

        {/* Estado LCU en el footer de la barra lateral */}
        <div className="bg-[#111823] p-3 rounded border border-[#1E282D]">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-[#A09B8C]">Cliente LoL:</span>
            <span
              className={`font-semibold flex items-center space-x-1 ${
                lcuState === 'connected'
                  ? 'text-emerald-400'
                  : lcuState === 'connecting'
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full mr-1 ${
                  lcuState === 'connected'
                    ? 'bg-emerald-400 animate-pulse'
                    : lcuState === 'connecting'
                    ? 'bg-amber-400'
                    : 'bg-rose-400'
                }`}
              />
              {lcuState === 'connected' ? 'Conectado' : lcuState === 'connecting' ? 'Buscando...' : 'Desconectado'}
            </span>
          </div>
          <div className="text-xs text-[#6B7280]">
            Fase: <span className="text-[#F0E6D2] font-mono">{gameflow}</span>
          </div>
        </div>
      </aside>

      {/* Contenido Principal */}
      <main className="flex-1 overflow-y-auto p-8 bg-[#0B1320]">
        {activeTab === 'dashboard' && (
          <DashboardView
            lcuState={lcuState}
            gameflow={gameflow}
            readyCheck={readyCheck}
            autoAcceptEnabled={autoAcceptEnabled}
            autoAcceptDelay={autoAcceptDelay}
            onToggleAutoAccept={handleToggleAutoAccept}
            onChangeDelay={handleChangeDelay}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            onSaveSettings={async (newSettings) => {
              if (window.api) {
                await window.api.saveSettings(newSettings);
                const updated = await window.api.getSettings();
                setSettings(updated);
              }
            }}
          />
        )}

        {activeTab !== 'dashboard' && activeTab !== 'settings' && (
          <div className="max-w-4xl mx-auto py-12 text-center text-[#A09B8C]">
            <p className="text-lg font-medium text-[#F0E6D2]">Módulo en preparación</p>
            <p className="text-sm mt-1">Esta vista se activará en las siguientes fases del proyecto.</p>
          </div>
        )}
      </main>
    </div>
  );
}
