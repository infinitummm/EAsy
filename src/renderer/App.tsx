import React, { useState, useEffect } from 'react';
import { Shield, Swords, User, Settings, CheckCircle2, AlertTriangle, Play } from 'lucide-react';
import { LcuConnectionState, GameflowPhase, AppSettings } from '../shared/types';
import { DEFAULT_APP_SETTINGS } from '../shared/constants';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'champSelect' | 'matchups' | 'profile' | 'settings'>('dashboard');
  const [lcuState, setLcuState] = useState<LcuConnectionState>('disconnected');
  const [gameflow, setGameflow] = useState<GameflowPhase>('None');
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

      return () => {
        unsubLcu();
        unsubGameflow();
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
                activeTab === 'dashboard' ? 'bg-[#1E2328] text-[#C89B3C] border-l-2 border-[#C89B3C]' : 'text-[#A09B8C] hover:bg-[#111A24] hover:text-[#F0E6D2]'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('champSelect')}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded text-sm font-medium transition ${
                activeTab === 'champSelect' ? 'bg-[#1E2328] text-[#C89B3C] border-l-2 border-[#C89B3C]' : 'text-[#A09B8C] hover:bg-[#111A24] hover:text-[#F0E6D2]'
              }`}
            >
              <Play className="w-4 h-4" />
              <span>Champ Select</span>
            </button>

            <button
              onClick={() => setActiveTab('matchups')}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded text-sm font-medium transition ${
                activeTab === 'matchups' ? 'bg-[#1E2328] text-[#C89B3C] border-l-2 border-[#C89B3C]' : 'text-[#A09B8C] hover:bg-[#111A24] hover:text-[#F0E6D2]'
              }`}
            >
              <Swords className="w-4 h-4" />
              <span>Matchups & Builds</span>
            </button>

            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded text-sm font-medium transition ${
                activeTab === 'profile' ? 'bg-[#1E2328] text-[#C89B3C] border-l-2 border-[#C89B3C]' : 'text-[#A09B8C] hover:bg-[#111A24] hover:text-[#F0E6D2]'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Mi Perfil</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded text-sm font-medium transition ${
                activeTab === 'settings' ? 'bg-[#1E2328] text-[#C89B3C] border-l-2 border-[#C89B3C]' : 'text-[#A09B8C] hover:bg-[#111A24] hover:text-[#F0E6D2]'
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
            <span className={`font-semibold flex items-center space-x-1 ${
              lcuState === 'connected' ? 'text-emerald-400' : lcuState === 'connecting' ? 'text-amber-400' : 'text-rose-400'
            }`}>
              <span className={`w-2 h-2 rounded-full mr-1 ${
                lcuState === 'connected' ? 'bg-emerald-400 animate-pulse' : lcuState === 'connecting' ? 'bg-amber-400' : 'bg-rose-400'
              }`} />
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
          <div className="max-w-4xl mx-auto space-y-6">
            <header className="flex justify-between items-center border-b border-[#1E282D] pb-4">
              <div>
                <h2 className="text-2xl font-bold text-[#F0E6D2]">Dashboard Principal</h2>
                <p className="text-sm text-[#A09B8C]">Resumen de conexión y automatizaciones activas</p>
              </div>
              <div className="flex items-center space-x-2 text-xs text-[#0AC8B9] bg-[#0A282D] px-3 py-1.5 rounded border border-[#0AC8B9]/30">
                <CheckCircle2 className="w-4 h-4" />
                <span>100% Local & Seguro</span>
              </div>
            </header>

            {/* Tarjeta de Auto-Accept */}
            <div className="bg-[#111823] p-6 rounded-lg border border-[#1E282D] shadow-lg flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[#F0E6D2] flex items-center space-x-2">
                  <span>Auto-Accept de Partidas</span>
                  {autoAcceptEnabled && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">Activo</span>}
                </h3>
                <p className="text-sm text-[#A09B8C] mt-1">
                  Acepta automáticamente la partida encontrada respetando un retardo configurable.
                </p>
                <div className="mt-3 flex items-center space-x-3 text-xs text-[#A09B8C]">
                  <span>Retardo: <strong>{autoAcceptDelay} segundos</strong></span>
                  <input
                    type="range"
                    min="0"
                    max="8"
                    value={autoAcceptDelay}
                    onChange={(e) => setAutoAcceptDelay(Number(e.target.value))}
                    className="accent-[#C89B3C] cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <button
                  onClick={handleToggleAutoAccept}
                  className={`px-5 py-2.5 rounded font-semibold text-sm transition shadow ${
                    autoAcceptEnabled
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                  }`}
                >
                  {autoAcceptEnabled ? 'Activado' : 'Desactivado'}
                </button>
              </div>
            </div>

            {/* Aviso de Clave Riot Dev */}
            <div className="bg-amber-950/20 border border-amber-500/30 p-4 rounded-lg flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <h4 className="font-semibold text-amber-200">Clave de Desarrollo de Riot (24 Horas)</h4>
                <p className="text-[#A09B8C] mt-0.5">
                  Recuerda que la Riot Development Key caduca cada 24 horas. Puedes configurar tu clave o renovarla en la sección de <strong>Ajustes & Keys</strong>.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab !== 'dashboard' && (
          <div className="max-w-4xl mx-auto py-12 text-center text-[#A09B8C]">
            <p className="text-lg font-medium text-[#F0E6D2]">Módulo en preparación</p>
            <p className="text-sm mt-1">Esta vista se activará en las siguientes fases del proyecto.</p>
          </div>
        )}
      </main>
    </div>
  );
}
