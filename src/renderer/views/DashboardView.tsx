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
  lastConnectionError,
  lcuPort,
  lastIpcTimestamp,
  lastIpcEvent,
  onToggleAutoAccept,
  onChangeDelay,
  onRefreshLcu,
}) => {
  return (
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

      {/* Alerta de ReadyCheck en curso */}
      {readyCheck && readyCheck.state === 'InProgress' && (
        <div className="bg-gradient-to-r from-amber-900/60 to-yellow-900/40 border-2 border-[#C89B3C] p-5 rounded-lg flex items-center justify-between shadow-xl animate-pulse">
          <div className="flex items-center space-x-3">
            <Zap className="w-6 h-6 text-[#C89B3C]" />
            <div>
              <h3 className="text-lg font-bold text-[#F0E6D2]">¡Partida Encontrada! (Ready Check)</h3>
              <p className="text-sm text-[#F0E6D2]/80">
                {autoAcceptEnabled
                  ? `Auto-Accept programado con retardo de ${autoAcceptDelay}s...`
                  : 'Auto-Accept desactivado. Por favor acepta manualmente en el cliente.'}
              </p>
            </div>
          </div>
          <span className="text-xs uppercase tracking-wider font-mono bg-black/40 px-3 py-1 rounded text-[#C89B3C] border border-[#C89B3C]/50">
            {readyCheck.playerResponse}
          </span>
        </div>
      )}

      {/* Tarjeta de Estado del Cliente League of Legends */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#111823] p-5 rounded-lg border border-[#1E282D] flex items-center space-x-4">
          <div
            className={`w-12 h-12 rounded-lg flex items-center justify-center ${
              lcuState === 'connected'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : lcuState === 'connecting'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
            }`}
          >
            {lcuState === 'connected' ? (
              <Wifi className="w-6 h-6" />
            ) : (
              <WifiOff className="w-6 h-6" />
            )}
          </div>
          <div>
            <div className="text-xs text-[#A09B8C]">Conexión LCU (Cliente Oficial)</div>
            <div className="text-lg font-bold text-[#F0E6D2] capitalize">
              {lcuState === 'connected'
                ? 'Conectado a LeagueClient'
                : lcuState === 'connecting'
                ? 'Buscando cliente...'
                : 'Cliente Cerrado / Desconectado'}
            </div>
            <div className="text-xs text-[#6B7280]">
              Protocolo: HTTPS autofirmado + WebSocket
            </div>
          </div>
        </div>

        <div className="bg-[#111823] p-5 rounded-lg border border-[#1E282D] flex items-center space-x-4">
          <div className="w-12 h-12 rounded-lg bg-[#C89B3C]/10 text-[#C89B3C] border border-[#C89B3C]/30 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-[#A09B8C]">Fase de Gameflow Detectada</div>
            <div className="text-lg font-bold font-mono text-[#C89B3C]">{gameflow}</div>
            <div className="text-xs text-[#6B7280]">
              Monitoreo continuo en tiempo real
            </div>
          </div>
        </div>
      </div>

      {/* Panel de Diagnóstico en Vivo Main ↔ Renderer (Requisito 2) */}
      <div className="bg-[#0D1520] p-4 rounded-lg border border-[#1E282D] space-y-3 shadow-inner">
        <div className="flex items-center justify-between border-b border-[#1E282D] pb-2">
          <div className="flex items-center space-x-2">
            <span className={`w-2.5 h-2.5 rounded-full ${mainLcuState === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-cyan-400'}`}></span>
            <h3 className="text-sm font-bold text-[#F0E6D2]">Diagnóstico en Vivo: Comunicación Main ↔ Renderer IPC</h3>
          </div>
          <button
            onClick={onRefreshLcu}
            className="px-2.5 py-1 text-xs font-semibold rounded bg-[#1E2328] hover:bg-[#2A3038] text-[#C89B3C] border border-[#C89B3C]/40 transition"
          >
            🔄 Sincronizar Ahora
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
          <div className="bg-[#111823] p-2.5 rounded border border-[#1E282D]">
            <div className="text-[#A09B8C] text-[10px] uppercase">Estado en Main</div>
            <div className={`mt-1 font-bold ${mainLcuState === 'connected' ? 'text-emerald-400' : mainLcuState === 'connecting' ? 'text-amber-400' : 'text-rose-400'}`}>
              {mainLcuState}
            </div>
          </div>

          <div className="bg-[#111823] p-2.5 rounded border border-[#1E282D]">
            <div className="text-[#A09B8C] text-[10px] uppercase">Estado en Renderer (IPC)</div>
            <div className={`mt-1 font-bold ${lcuState === 'connected' ? 'text-emerald-400' : lcuState === 'connecting' ? 'text-amber-400' : 'text-rose-400'}`}>
              {lcuState}
            </div>
          </div>

          <div className="bg-[#111823] p-2.5 rounded border border-[#1E282D]">
            <div className="text-[#A09B8C] text-[10px] uppercase">Puerto LCU</div>
            <div className="mt-1 font-bold text-[#F0E6D2]">
              {lcuPort ? lcuPort : 'No detectado'}
            </div>
          </div>

          <div className="bg-[#111823] p-2.5 rounded border border-[#1E282D]">
            <div className="text-[#A09B8C] text-[10px] uppercase">Último Evento IPC</div>
            <div className="mt-1 text-gray-300 truncate" title={`${lastIpcEvent} (${lastIpcTimestamp})`}>
              {lastIpcTimestamp} • {lastIpcEvent}
            </div>
          </div>
        </div>

        <div className="bg-[#111823] p-2.5 rounded border border-[#1E282D] text-xs">
          <span className="text-[#A09B8C] font-semibold">Último error de conexión: </span>
          <span className={lastConnectionError ? 'text-rose-400 font-mono' : 'text-emerald-400 font-mono'}>
            {lastConnectionError || 'Ninguno (conexión saludable)'}
          </span>
        </div>
      </div>

      {/* Tarjeta de Control de Auto-Accept */}
      <div className="bg-[#111823] p-6 rounded-lg border border-[#1E282D] shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-[#F0E6D2] flex items-center space-x-2">
            <span>Auto-Accept de Partidas</span>
            {autoAcceptEnabled ? (
              <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-mono">
                ACTIVO
              </span>
            ) : (
              <span className="text-xs bg-gray-500/20 text-gray-400 px-2 py-0.5 rounded font-mono">
                INACTIVO
              </span>
            )}
          </h3>
          <p className="text-sm text-[#A09B8C] mt-1">
            Detecta automáticamente la fase de Ready Check y acepta la partida respetando un retardo configurable para simular comportamiento humano.
          </p>

          <div className="mt-4 flex items-center space-x-4">
            <div className="flex items-center space-x-3 text-xs text-[#F0E6D2]">
              <span>Retardo:</span>
              <span className="font-mono bg-[#1E2328] px-2 py-1 rounded text-[#C89B3C] font-bold">
                {autoAcceptDelay}s
              </span>
              <input
                type="range"
                min="0"
                max="8"
                step="1"
                value={autoAcceptDelay}
                onChange={(e) => onChangeDelay(Number(e.target.value))}
                className="accent-[#C89B3C] cursor-pointer w-36"
              />
            </div>
            <span className="text-xs text-[#6B7280]">
              (Rango seguro: 0 - 8 segundos)
            </span>
          </div>
        </div>

        <div>
          <button
            onClick={onToggleAutoAccept}
            className={`px-6 py-3 rounded font-semibold text-sm transition shadow-lg ${
              autoAcceptEnabled
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
            }`}
          >
            {autoAcceptEnabled ? 'Desactivar Auto-Accept' : 'Activar Auto-Accept'}
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
  );
};
