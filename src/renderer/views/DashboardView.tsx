import React from 'react';
import { Shield, CheckCircle2, AlertTriangle, Zap, Clock, Wifi, WifiOff } from 'lucide-react';
import type { LcuConnectionState, GameflowPhase, ReadyCheckEvent } from '../../shared/types';

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
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="flex justify-between items-center border-b border-[#1E355B] pb-4">
        <div>
          <div className="inline-block px-2 py-0.5 mb-1.5 bg-[#0070EB] text-white text-[10px] font-bold tracking-wider uppercase transform -skew-x-6">
            ESTADO DEL SISTEMA
          </div>
          <h2 className="text-2xl font-bold text-white tracking-wide">
            DASHBOARD
          </h2>
          <p className="text-xs text-[#94A3B8] mt-0.5">Sincronización en vivo con League of Legends y motor de análisis</p>
        </div>
        <div className="flex items-center space-x-2 text-xs text-[#10B981] bg-[#0A111F] px-3.5 py-1.5 rounded border border-[#1E355B] transform -skew-x-6">
          <div className="transform skew-x-6 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
            <span className="font-semibold tracking-wider">100% LOCAL & SEGURO</span>
          </div>
        </div>
      </header>

      {/* Alerta de ReadyCheck en curso */}
      {readyCheck && readyCheck.state === 'InProgress' && (
        <div className="bg-[#F5A623]/10 border-2 border-[#F5A623] p-5 rounded-lg flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-3">
            <Zap className="w-6 h-6 text-[#F5A623]" />
            <div>
              <h3 className="text-lg font-bold text-white">¡Partida Encontrada! (Ready Check)</h3>
              <p className="text-sm text-[#CBD5E1]">
                {autoAcceptEnabled
                  ? `Auto-Accept programado con retardo de ${autoAcceptDelay}s...`
                  : 'Auto-Accept desactivado. Por favor acepta manualmente en el cliente.'}
              </p>
            </div>
          </div>
          <span className="text-xs uppercase tracking-wider font-mono bg-black/40 px-3 py-1 rounded text-[#F5A623] border border-[#F5A623]/50 font-bold">
            {readyCheck.playerResponse}
          </span>
        </div>
      )}

      {/* Tarjeta de Estado del Cliente League of Legends */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#0D192D] p-5 rounded-xl border border-[#1E355B] flex items-center space-x-4 shadow-xl">
          <div
            className={`w-12 h-12 rounded flex items-center justify-center transform -skew-x-6 ${
              lcuState === 'connected'
                ? 'bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/50'
                : lcuState === 'connecting'
                ? 'bg-[#F5A623]/15 text-[#F5A623] border border-[#F5A623]/50'
                : 'bg-[#D92546]/15 text-[#D92546] border border-[#D92546]/50'
            }`}
          >
            <div className="transform skew-x-6">
              {lcuState === 'connected' ? (
                <Wifi className="w-6 h-6" />
              ) : (
                <WifiOff className="w-6 h-6" />
              )}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#94A3B8] font-semibold uppercase tracking-wider">CONEXIÓN CLIENTE LOL</div>
            <div className="text-base font-bold text-white capitalize mt-0.5">
              {lcuState === 'connected'
                ? 'Conectado a LeagueClient'
                : lcuState === 'connecting'
                ? 'Sincronizando cliente...'
                : 'Cliente Cerrado / Desconectado'}
            </div>
            <div className="text-xs text-[#64748B] mt-0.5">
              Protocolo: HTTPS TLS/SSL + WebSocket
            </div>
          </div>
        </div>

        <div className="bg-[#0D192D] p-5 rounded-xl border border-[#1E355B] flex items-center space-x-4 shadow-xl">
          <div className="w-12 h-12 rounded bg-[#0070EB]/15 text-[#0070EB] border border-[#0070EB]/50 flex items-center justify-center transform -skew-x-6">
            <div className="transform skew-x-6">
              <Clock className="w-6 h-6" />
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#94A3B8] font-semibold uppercase tracking-wider">FASE DE GAMEFLOW</div>
            <div className="text-lg font-bold font-mono text-white mt-0.5">{gameflow}</div>
            <div className="text-xs text-[#64748B] mt-0.5">
              Monitoreo continuo en tiempo real
            </div>
          </div>
        </div>
      </div>

      {/* Panel de Diagnóstico en Vivo */}
      <div className="bg-[#0D192D] p-5 rounded-xl border border-[#1E355B] space-y-3 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#1E355B] pb-2.5">
          <div className="flex items-center space-x-2">
            <span className={`w-2.5 h-2.5 rounded-full ${mainLcuState === 'connected' ? 'bg-[#10B981]' : 'bg-[#0070EB]'}`}></span>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">DIAGNÓSTICO EN VIVO // LCU</h3>
          </div>
          <button
            onClick={onRefreshLcu}
            className="px-3 py-1 text-xs font-bold uppercase tracking-wider rounded bg-[#0A111F] hover:bg-[#1E355B] text-white border border-[#1E355B] transition transform -skew-x-6"
          >
            <span className="transform skew-x-6 inline-block">🔄 Sincronizar Ahora</span>
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
          <div className="bg-[#0A111F] p-3 rounded border border-[#1E355B]">
            <div className="text-[#94A3B8] text-[10px] uppercase font-bold">Estado en Main</div>
            <div className={`mt-1 font-bold ${mainLcuState === 'connected' ? 'text-[#10B981]' : mainLcuState === 'connecting' ? 'text-[#F5A623]' : 'text-[#D92546]'}`}>
              {mainLcuState}
            </div>
          </div>

          <div className="bg-[#0A111F] p-3 rounded border border-[#1E355B]">
            <div className="text-[#94A3B8] text-[10px] uppercase font-bold">Estado en Renderer</div>
            <div className={`mt-1 font-bold ${lcuState === 'connected' ? 'text-[#10B981]' : lcuState === 'connecting' ? 'text-[#F5A623]' : 'text-[#D92546]'}`}>
              {lcuState}
            </div>
          </div>

          <div className="bg-[#0A111F] p-3 rounded border border-[#1E355B]">
            <div className="text-[#94A3B8] text-[10px] uppercase font-bold">Puerto LCU</div>
            <div className="mt-1 font-bold text-white">
              {lcuPort ? lcuPort : 'No detectado'}
            </div>
          </div>

          <div className="bg-[#0A111F] p-3 rounded border border-[#1E355B]">
            <div className="text-[#94A3B8] text-[10px] uppercase font-bold">Último Evento IPC</div>
            <div className="mt-1 text-[#CBD5E1] truncate" title={`${lastIpcEvent} (${lastIpcTimestamp})`}>
              {lastIpcTimestamp} • {lastIpcEvent}
            </div>
          </div>
        </div>

        <div className="bg-[#0A111F] p-3 rounded border border-[#1E355B] text-xs">
          <span className="text-[#94A3B8] font-semibold uppercase">Último estado de conexión: </span>
          <span className={lastConnectionError ? 'text-[#F87171]' : 'text-[#10B981]'}>
            {lastConnectionError || 'Ninguno (conexión saludable)'}
          </span>
        </div>
      </div>

      {/* Tarjeta de Control de Auto-Accept */}
      <div className="bg-[#0D192D] p-6 rounded-xl border border-[#1E355B] shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center space-x-2 tracking-wide uppercase">
              <span>Auto-Accept de Partidas</span>
              {autoAcceptEnabled ? (
                <span className="text-[10px] bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40 px-2 py-0.5 rounded font-bold">
                  ACTIVO
                </span>
              ) : (
                <span className="text-[10px] bg-[#1E355B]/50 text-[#94A3B8] border border-[#1E355B] px-2 py-0.5 rounded font-bold">
                  INACTIVO
                </span>
              )}
            </h3>
            <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
              Detecta automáticamente la fase de Ready Check y acepta la partida respetando un retardo para simular comportamiento humano.
            </p>

            <div className="mt-3 flex items-center space-x-4">
              <div className="flex items-center space-x-3 text-xs text-white">
                <span className="text-[#94A3B8]">Retardo:</span>
                <span className="font-mono bg-[#0A111F] border border-[#1E355B] px-2 py-1 rounded text-white font-bold">
                  {autoAcceptDelay}s
                </span>
                <input
                  type="range"
                  min="0"
                  max="8"
                  step="1"
                  value={autoAcceptDelay}
                  onChange={(e) => onChangeDelay(Number(e.target.value))}
                  className="accent-[#0070EB] cursor-pointer w-36"
                />
              </div>
              <span className="text-[11px] text-[#64748B]">
                (Rango seguro: 0 - 8s)
              </span>
            </div>
          </div>

          <div>
            <button
              onClick={onToggleAutoAccept}
              className={`px-5 py-2.5 rounded font-bold text-xs uppercase tracking-wider transition shadow-md transform -skew-x-6 active:scale-95 ${
                autoAcceptEnabled
                  ? 'bg-[#0070EB] hover:bg-[#005CE6] text-white'
                  : 'bg-[#0A111F] hover:bg-[#1E355B] text-[#94A3B8] border border-[#1E355B]'
              }`}
            >
              <span className="transform skew-x-6 inline-block">
                {autoAcceptEnabled ? 'Desactivar Auto-Accept' : 'Activar Auto-Accept'}
              </span>
            </button>
          </div>
        </div>

        {/* Panel de Estado en Vivo del Auto-Accept */}
        <div className="pt-3 border-t border-[#1E355B] grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
          <div className="bg-[#0A111F] p-3 rounded border border-[#1E355B] flex items-center justify-between">
            <div>
              <span className="text-[10px] text-[#94A3B8] uppercase font-bold block">Última Acción</span>
              <span className={`text-xs font-bold ${autoAcceptEnabled ? 'text-[#00F0FF]' : 'text-[#64748B]'}`}>
                {autoAcceptLastAction || (autoAcceptEnabled ? 'En espera de partida' : 'Inactivo')}
              </span>
            </div>
            {autoAcceptLastTimestamp && (
              <span className="text-[10px] text-[#64748B] bg-[#11223F] px-2 py-1 rounded border border-[#1E355B]">
                {new Date(autoAcceptLastTimestamp).toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="bg-[#0A111F] p-3 rounded border border-[#1E355B] flex items-center justify-between">
            <div>
              <span className="text-[10px] text-[#94A3B8] uppercase font-bold block">Polling de Respaldo (1s)</span>
              <span className={`text-xs font-bold ${autoAcceptPollingActive ? 'text-[#10B981]' : 'text-[#64748B]'}`}>
                {autoAcceptPollingActive ? '● ACTIVO (Matchmaking)' : '○ Standby'}
              </span>
            </div>
            <span className="text-[10px] text-[#94A3B8] bg-[#11223F] px-2 py-1 rounded border border-[#1E355B]">
              HTTP Backup
            </span>
          </div>
        </div>
      </div>

      {/* Aviso de Clave Riot Dev */}
      <div className="bg-[#F5A623]/10 border border-[#F5A623]/30 p-4 rounded-lg flex items-start space-x-3">
        <AlertTriangle className="w-5 h-5 text-[#F5A623] shrink-0 mt-0.5" />
        <div className="text-sm">
          <h4 className="font-semibold text-white">Clave de Desarrollo de Riot (24 Horas)</h4>
          <p className="text-[#CBD5E1] mt-0.5 text-xs">
            Recuerda que la Riot Development Key caduca cada 24 horas. Puedes configurar tu clave o renovarla en la sección de <strong>Ajustes & Keys</strong>.
          </p>
        </div>
      </div>
    </div>
  );
};
