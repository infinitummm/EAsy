import React from 'react';
import { Shield, CheckCircle2, AlertTriangle, Zap, Clock, Wifi, WifiOff, RefreshCw, Terminal, Activity } from 'lucide-react';
import type { LcuConnectionState, GameflowPhase, ReadyCheckEvent } from '../../shared/types';
import { P3rButton } from '../components/p3r/P3rButton';
import { P3rBadge } from '../components/p3r/P3rBadge';
import char1CutIn from '../../assets/p3r/char1.png';

interface DashboardViewProps {
  lcuState: LcuConnectionState;
  mainLcuState: LcuConnectionState;
  gameflow: GameflowPhase;
  readyCheck: ReadyCheckEvent | null;
  autoAcceptEnabled: boolean;
  autoAcceptDelay: number;
  autoAcceptLastAction?: string;
  autoAcceptLastTimestamp?: number;
  autoAcceptPollingActive?: boolean;
  lastConnectionError: string | null;
  lcuPort: number | null;
  lastIpcTimestamp: string;
  lastIpcEvent: string;
  onToggleAutoAccept: () => void;
  onChangeDelay: (seconds: number) => void;
  onRefreshLcu: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  lcuState,
  mainLcuState,
  gameflow,
  readyCheck,
  autoAcceptEnabled,
  autoAcceptDelay,
  autoAcceptLastAction,
  autoAcceptLastTimestamp,
  autoAcceptPollingActive,
  lastConnectionError,
  lcuPort,
  lastIpcTimestamp,
  lastIpcEvent,
  onToggleAutoAccept,
  onChangeDelay,
  onRefreshLcu,
}) => {
  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-8">
      {/* Cabecera Táctica con Render P3R integrado y cortes diagonales */}
      <div className="relative overflow-hidden bg-[#050E20] border-2 border-[#16335F] p3r-bevel p3r-shadow-hard-lg">
        {/* Render de combate Makoto Yuki con máscara diagonal */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1/2 md:w-5/12 pointer-events-none opacity-40 md:opacity-75 mix-blend-screen"
          style={{
            clipPath: 'polygon(25% 0, 100% 0, 100% 100%, 0% 100%)',
          }}
        >
          <img
            src={char1CutIn}
            alt="P3R Makoto Yuki Cut-In"
            className="w-full h-full object-cover object-left"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#050E20] via-transparent to-transparent" />
        </div>

        {/* Rayas decorativas Dark Hour de fondo */}
        <div className="absolute inset-0 p3r-hatch pointer-events-none opacity-60" />

        <div className="relative z-10 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <span className="px-2 py-0.5 bg-[#0066FF] text-white text-[10px] font-extrabold tracking-widest uppercase transform -skew-x-8 font-p3r-head">
                <span className="transform skew-x-8 inline-block">SEES // TACTICAL DISPATCH</span>
              </span>
              <P3rBadge label="PARCHE 26.20" variant="cyan" />
            </div>

            <h1 className="text-3xl md:text-4xl font-black text-white tracking-wider font-p3r uppercase">
              DASHBOARD <span className="text-[#00E5FF] font-mono text-2xl">//</span> RADAR
            </h1>
            <p className="text-xs text-[#8FA5C4] mt-1 max-w-lg font-medium">
              Sincronización en vivo con League of Legends y motor táctico de recomendaciones locales.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="bg-[#030814]/90 border border-[#16335F] px-4 py-2 transform -skew-x-8 p3r-shadow-hard">
              <div className="transform skew-x-8 flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-[#00E676]" />
                <span className="font-bold text-xs tracking-wider text-white font-p3r-head">100% LOCAL & SEGURO</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alerta de ReadyCheck en curso */}
      {readyCheck && readyCheck.state === 'InProgress' && (
        <div className="bg-[#FFE277]/10 border-2 border-[#FFE277] p-5 p3r-bevel p3r-shadow-hard flex items-center justify-between animate-p3r-slide">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-[#FFE277] text-[#030814] flex items-center justify-center transform -skew-x-8">
              <Zap className="w-6 h-6 transform skew-x-8 font-black" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white tracking-wider font-p3r uppercase">
                ¡Partida Encontrada! // Ready Check
              </h3>
              <p className="text-xs text-[#E2E8F0] mt-0.5">
                {autoAcceptEnabled
                  ? `Auto-Accept programado con retardo táctico de ${autoAcceptDelay}s...`
                  : 'Auto-Accept desactivado. Por favor acepta manualmente en el cliente.'}
              </p>
            </div>
          </div>
          <span className="text-xs uppercase tracking-widest font-mono bg-[#030814] px-4 py-1.5 text-[#FFE277] border border-[#FFE277] font-black transform -skew-x-8">
            <span className="transform skew-x-8 inline-block">{readyCheck.playerResponse}</span>
          </span>
        </div>
      )}

      {/* Tarjetas de Estado del Cliente League of Legends y Gameflow */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Conexión LCU */}
        <div className="bg-[#050E20] p-5 border-2 border-[#16335F] p3r-bevel p3r-shadow-hard flex items-center space-x-4">
          <div
            className={`w-14 h-14 flex items-center justify-center transform -skew-x-8 shrink-0 ${
              lcuState === 'connected'
                ? 'bg-[#00E676]/15 text-[#00E676] border-2 border-[#00E676]'
                : lcuState === 'connecting'
                ? 'bg-[#FFE277]/15 text-[#FFE277] border-2 border-[#FFE277]'
                : 'bg-[#FF1744]/15 text-[#FF1744] border-2 border-[#FF1744]'
            }`}
          >
            <div className="transform skew-x-8">
              {lcuState === 'connected' ? (
                <Wifi className="w-7 h-7" />
              ) : (
                <WifiOff className="w-7 h-7" />
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#7E9BB8] font-black uppercase tracking-wider font-p3r-head">
                CONEXIÓN CLIENTE LOL
              </span>
              <P3rBadge
                label={lcuState === 'connected' ? 'ONLINE' : lcuState === 'connecting' ? 'SYNC' : 'OFFLINE'}
                variant={lcuState === 'connected' ? 'green' : lcuState === 'connecting' ? 'yellow' : 'red'}
              />
            </div>
            <div className="text-lg font-bold text-white tracking-wide truncate mt-0.5 font-p3r-head">
              {lcuState === 'connected'
                ? 'Conectado a LeagueClient'
                : lcuState === 'connecting'
                ? 'Sincronizando cliente...'
                : 'Cliente Cerrado / Offline'}
            </div>
            <div className="text-xs text-[#8FA5C4] mt-0.5 flex items-center space-x-2">
              <span className="w-1.5 h-1.5 bg-[#00E5FF]"></span>
              <span>Protocolo: HTTPS TLS/SSL + WebSocket</span>
            </div>
          </div>
        </div>

        {/* Gameflow Phase */}
        <div className="bg-[#050E20] p-5 border-2 border-[#16335F] p3r-bevel p3r-shadow-hard flex items-center space-x-4">
          <div className="w-14 h-14 bg-[#0066FF]/20 text-[#00E5FF] border-2 border-[#0066FF] flex items-center justify-center transform -skew-x-8 shrink-0">
            <div className="transform skew-x-8">
              <Activity className="w-7 h-7" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#7E9BB8] font-black uppercase tracking-wider font-p3r-head">
                FASE DE GAMEFLOW
              </span>
              <span className="text-[10px] text-[#00E5FF] font-mono tracking-widest uppercase">EN VIVO</span>
            </div>
            <div className="text-2xl font-black font-mono text-white tracking-wider truncate mt-0.5">
              {gameflow}
            </div>
            <div className="text-xs text-[#8FA5C4] mt-0.5 flex items-center space-x-2">
              <span className="w-1.5 h-1.5 bg-[#0066FF]"></span>
              <span>Monitoreo continuo de eventos LCU</span>
            </div>
          </div>
        </div>
      </div>

      {/* Panel de Diagnóstico en Vivo // LCU */}
      <div className="bg-[#050E20] p-6 border-2 border-[#16335F] p3r-bevel p3r-shadow-hard space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-[#16335F] pb-3">
          <div className="flex items-center space-x-3">
            <span className={`w-3 h-3 transform rotate-45 ${mainLcuState === 'connected' ? 'bg-[#00E676]' : 'bg-[#0066FF]'}`}></span>
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-wider font-p3r">
                DIAGNÓSTICO EN VIVO // LCU ENGINE
              </h3>
              <p className="text-[11px] text-[#7E9BB8]">Canal IPC directo entre el proceso Main de Electron y la interfaz</p>
            </div>
          </div>

          <P3rButton
            variant="secondary"
            size="sm"
            onClick={onRefreshLcu}
            icon={<RefreshCw className="w-3.5 h-3.5 text-[#00E5FF]" />}
          >
            Sincronizar Ahora
          </P3rButton>
        </div>

        {/* Métricas tabulares angulares */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
          <div className="bg-[#030814] p-3 border border-[#16335F] p3r-cut-tr">
            <div className="text-[#7E9BB8] text-[10px] uppercase font-bold tracking-wider font-p3r-head">
              Estado en Main
            </div>
            <div
              className={`mt-1 font-bold text-sm tracking-wider ${
                mainLcuState === 'connected'
                  ? 'text-[#00E676]'
                  : mainLcuState === 'connecting'
                  ? 'text-[#FFE277]'
                  : 'text-[#FF1744]'
              }`}
            >
              {mainLcuState.toUpperCase()}
            </div>
          </div>

          <div className="bg-[#030814] p-3 border border-[#16335F] p3r-cut-tr">
            <div className="text-[#7E9BB8] text-[10px] uppercase font-bold tracking-wider font-p3r-head">
              Estado en Renderer
            </div>
            <div
              className={`mt-1 font-bold text-sm tracking-wider ${
                lcuState === 'connected'
                  ? 'text-[#00E676]'
                  : lcuState === 'connecting'
                  ? 'text-[#FFE277]'
                  : 'text-[#FF1744]'
              }`}
            >
              {lcuState.toUpperCase()}
            </div>
          </div>

          <div className="bg-[#030814] p-3 border border-[#16335F] p3r-cut-tr">
            <div className="text-[#7E9BB8] text-[10px] uppercase font-bold tracking-wider font-p3r-head">
              Puerto LCU
            </div>
            <div className="mt-1 font-bold text-white text-sm">
              {lcuPort ? lcuPort : 'No detectado'}
            </div>
          </div>

          <div className="bg-[#030814] p-3 border border-[#16335F] p3r-cut-tr">
            <div className="text-[#7E9BB8] text-[10px] uppercase font-bold tracking-wider font-p3r-head">
              Último Evento IPC
            </div>
            <div className="mt-1 text-[#00E5FF] truncate text-xs" title={`${lastIpcEvent} (${lastIpcTimestamp})`}>
              {lastIpcTimestamp} • {lastIpcEvent}
            </div>
          </div>
        </div>

        {/* Barra de reporte de salud de conexión */}
        <div className="bg-[#030814] p-3 border border-[#16335F] text-xs flex items-center space-x-2">
          <Terminal className="w-4 h-4 text-[#7E9BB8] shrink-0" />
          <span className="text-[#7E9BB8] font-bold uppercase tracking-wider text-[11px] font-p3r-head">
            Registro de enlace:
          </span>
          <span className={`font-mono ${lastConnectionError ? 'text-[#FF1744] font-bold' : 'text-[#00E676]'}`}>
            {lastConnectionError || 'Conexión local 100% íntegra (Riot Lockfile activo)'}
          </span>
        </div>
      </div>

      {/* Consola de Control de Auto-Accept */}
      <div className="bg-[#050E20] p-6 border-2 border-[#16335F] p3r-bevel p3r-shadow-hard space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <h3 className="text-lg font-black text-white uppercase tracking-wider font-p3r">
                AUTO-ACCEPT DE PARTIDAS
              </h3>
              <P3rBadge
                label={autoAcceptEnabled ? 'ACTIVO' : 'INACTIVO'}
                variant={autoAcceptEnabled ? 'green' : 'neutral'}
              />
            </div>
            <p className="text-xs text-[#8FA5C4] leading-relaxed max-w-xl">
              Detecta automáticamente la fase de Ready Check y envía la aceptación con retardo programable para simular respuesta humana natural.
            </p>

            {/* Selector de Retardo */}
            <div className="pt-2 flex flex-wrap items-center gap-4">
              <div className="flex items-center space-x-3 text-xs text-white">
                <span className="text-[#7E9BB8] font-bold uppercase tracking-wider font-p3r-head">Retardo de Aceptación:</span>
                <span className="font-mono bg-[#030814] border border-[#16335F] px-3 py-1 text-[#00E5FF] font-bold text-sm transform -skew-x-8">
                  <span className="transform skew-x-8 inline-block">{autoAcceptDelay}s</span>
                </span>
                <input
                  type="range"
                  min="0"
                  max="8"
                  step="1"
                  value={autoAcceptDelay}
                  onChange={(e) => onChangeDelay(Number(e.target.value))}
                  className="accent-[#0066FF] cursor-pointer w-40"
                />
              </div>
              <span className="text-[11px] text-[#7E9BB8] font-mono">
                (Rango recomendado: 1 - 4s)
              </span>
            </div>
          </div>

          <div className="shrink-0">
            <P3rButton
              variant={autoAcceptEnabled ? 'cyan' : 'primary'}
              size="lg"
              onClick={onToggleAutoAccept}
            >
              {autoAcceptEnabled ? 'Desactivar Auto-Accept' : 'Activar Auto-Accept'}
            </P3rButton>
          </div>
        </div>

        {/* Panel de Estado en Vivo del Auto-Accept */}
        <div className="pt-4 border-t-2 border-[#16335F] grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
          <div className="bg-[#030814] p-3.5 border border-[#16335F] flex items-center justify-between p3r-cut-tr">
            <div>
              <span className="text-[10px] text-[#7E9BB8] uppercase font-bold tracking-wider block font-p3r-head">
                Última Acción
              </span>
              <span className={`text-xs font-bold ${autoAcceptEnabled ? 'text-[#00E5FF]' : 'text-[#7E9BB8]'}`}>
                {autoAcceptLastAction || (autoAcceptEnabled ? 'Esperando fase Ready Check...' : 'Módulo en reposo')}
              </span>
            </div>
            {autoAcceptLastTimestamp && (
              <span className="text-[10px] text-[#8FA5C4] bg-[#081329] px-2.5 py-1 border border-[#16335F]">
                {new Date(autoAcceptLastTimestamp).toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="bg-[#030814] p-3.5 border border-[#16335F] flex items-center justify-between p3r-cut-tr">
            <div>
              <span className="text-[10px] text-[#7E9BB8] uppercase font-bold tracking-wider block font-p3r-head">
                Polling de Respaldo HTTP (1s)
              </span>
              <span className={`text-xs font-bold ${autoAcceptPollingActive ? 'text-[#00E676]' : 'text-[#7E9BB8]'}`}>
                {autoAcceptPollingActive ? '● ACTIVO (Matchmaking)' : '○ Standby'}
              </span>
            </div>
            <span className="text-[10px] text-[#00E5FF] bg-[#081329] px-2.5 py-1 border border-[#16335F] font-bold">
              LCU HTTP
            </span>
          </div>
        </div>
      </div>

      {/* Aviso de Clave Riot Dev */}
      <div className="bg-[#FFE277]/10 border border-[#FFE277]/40 p-4 p3r-bevel flex items-start space-x-3.5">
        <AlertTriangle className="w-5 h-5 text-[#FFE277] shrink-0 mt-0.5" />
        <div className="text-xs">
          <h4 className="font-bold text-white uppercase tracking-wider font-p3r-head">
            Clave de Desarrollo de Riot Games (Vigencia 24 Horas)
          </h4>
          <p className="text-[#8FA5C4] mt-1 leading-relaxed">
            Las claves gratuitas de Riot Developer caducan cada 24 horas. Para análisis extendido de partidas y sinergias, puedes renovarla o configurarla en la pestaña <strong>AJUSTES & KEYS</strong>. El cliente local (LCU) y OP.GG funcionan sin necesidad de clave externa.
          </p>
        </div>
      </div>
    </div>
  );
};
