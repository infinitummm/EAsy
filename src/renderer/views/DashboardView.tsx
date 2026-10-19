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
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="flex justify-between items-center border-b border-[#1B3B6F]/70 pb-4">
        <div>
          <div className="inline-block px-2.5 py-0.5 mb-1.5 bg-[#00D4FF]/15 border border-[#00D4FF]/40 text-[#00F0FF] text-[10px] font-black tracking-widest uppercase transform -skew-x-6">
            SYSTEM STATUS // LIVE HUD
          </div>
          <h2 className="text-2xl font-black text-white tracking-wide flex items-center space-x-2">
            <span>DASHBOARD PRINCIPAL</span>
            <span className="text-[#00D4FF] font-mono text-sm">// P3R</span>
          </h2>
          <p className="text-xs text-[#6F92BF] font-mono mt-0.5">Sincronización en vivo con League of Legends y motor de IA</p>
        </div>
        <div className="flex items-center space-x-2 text-xs text-[#00FFB2] bg-[#040C1A] px-3.5 py-1.5 rounded border border-[#00FFB2]/40 shadow-[0_0_12px_rgba(0,255,178,0.2)] transform -skew-x-6">
          <div className="transform skew-x-6 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-[#00FFB2]" />
            <span className="font-mono font-bold tracking-wider">100% LOCAL & SEGURO</span>
          </div>
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
        <div className="bg-[#08152B]/95 p-5 rounded-xl border border-[#1B3B6F] flex items-center space-x-4 shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
          <div
            className={`w-12 h-12 rounded flex items-center justify-center transform -skew-x-6 ${
              lcuState === 'connected'
                ? 'bg-[#00FFB2]/15 text-[#00FFB2] border border-[#00FFB2]/50 shadow-[0_0_12px_rgba(0,255,178,0.3)]'
                : lcuState === 'connecting'
                ? 'bg-[#FFD700]/15 text-[#FFD700] border border-[#FFD700]/50 shadow-[0_0_12px_rgba(255,215,0,0.3)]'
                : 'bg-[#FF2E63]/15 text-[#FF2E63] border border-[#FF2E63]/50 shadow-[0_0_12px_rgba(255,46,99,0.3)]'
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
            <div className="text-[10px] text-[#6F92BF] font-mono uppercase tracking-wider">CONEXIÓN LCU // CLIENTE</div>
            <div className="text-base font-black text-white capitalize mt-0.5">
              {lcuState === 'connected'
                ? 'Conectado a LeagueClient'
                : lcuState === 'connecting'
                ? 'Sincronizando cliente...'
                : 'Cliente Cerrado / Desconectado'}
            </div>
            <div className="text-xs text-[#5078A8] font-mono mt-0.5">
              Protocolo: HTTPS TLS/SSL + WebSocket
            </div>
          </div>
        </div>

        <div className="bg-[#08152B]/95 p-5 rounded-xl border border-[#1B3B6F] flex items-center space-x-4 shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
          <div className="w-12 h-12 rounded bg-[#00D4FF]/15 text-[#00D4FF] border border-[#00D4FF]/50 flex items-center justify-center transform -skew-x-6 shadow-[0_0_12px_rgba(0,212,255,0.3)]">
            <div className="transform skew-x-6">
              <Clock className="w-6 h-6" />
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#6F92BF] font-mono uppercase tracking-wider">FASE DE GAMEFLOW</div>
            <div className="text-lg font-black font-mono text-[#00F0FF] mt-0.5">{gameflow}</div>
            <div className="text-xs text-[#5078A8] font-mono mt-0.5">
              Monitoreo continuo segundo a segundo
            </div>
          </div>
        </div>
      </div>

      {/* Panel de Diagnóstico en Vivo Main ↔ Renderer */}
      <div className="bg-[#08152B]/95 p-5 rounded-xl border border-[#1B3B6F] space-y-3 shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
        <div className="flex items-center justify-between border-b border-[#1B3B6F]/70 pb-2.5">
          <div className="flex items-center space-x-2">
            <span className={`w-2.5 h-2.5 rounded-full ${mainLcuState === 'connected' ? 'bg-[#00FFB2] animate-pulse shadow-[0_0_8px_#00FFB2]' : 'bg-[#00D4FF]'}`}></span>
            <h3 className="text-xs font-mono font-black text-white uppercase tracking-wider">DIAGNÓSTICO EN VIVO // MAIN ↔ RENDERER IPC</h3>
          </div>
          <button
            onClick={onRefreshLcu}
            className="px-3 py-1 text-xs font-black uppercase tracking-wider rounded bg-[#040C1A] hover:bg-[#00D4FF]/20 text-[#00F0FF] border border-[#00D4FF]/40 transition transform -skew-x-6"
          >
            <span className="transform skew-x-6 inline-block">🔄 Sincronizar Ahora</span>
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
          <div className="bg-[#040C1A] p-3 rounded border border-[#1B3B6F]">
            <div className="text-[#6F92BF] text-[10px] uppercase font-bold">Estado en Main</div>
            <div className={`mt-1 font-black ${mainLcuState === 'connected' ? 'text-[#00FFB2]' : mainLcuState === 'connecting' ? 'text-[#FFD700]' : 'text-[#FF2E63]'}`}>
              {mainLcuState}
            </div>
          </div>

          <div className="bg-[#040C1A] p-3 rounded border border-[#1B3B6F]">
            <div className="text-[#6F92BF] text-[10px] uppercase font-bold">Estado en Renderer</div>
            <div className={`mt-1 font-black ${lcuState === 'connected' ? 'text-[#00FFB2]' : lcuState === 'connecting' ? 'text-[#FFD700]' : 'text-[#FF2E63]'}`}>
              {lcuState}
            </div>
          </div>

          <div className="bg-[#040C1A] p-3 rounded border border-[#1B3B6F]">
            <div className="text-[#6F92BF] text-[10px] uppercase font-bold">Puerto LCU</div>
            <div className="mt-1 font-black text-white">
              {lcuPort ? lcuPort : 'No detectado'}
            </div>
          </div>

          <div className="bg-[#040C1A] p-3 rounded border border-[#1B3B6F]">
            <div className="text-[#6F92BF] text-[10px] uppercase font-bold">Último Evento IPC</div>
            <div className="mt-1 text-[#A8C8F0] truncate" title={`${lastIpcEvent} (${lastIpcTimestamp})`}>
              {lastIpcTimestamp} • {lastIpcEvent}
            </div>
          </div>
        </div>

        <div className="bg-[#040C1A] p-3 rounded border border-[#1B3B6F] text-xs">
          <span className="text-[#6F92BF] font-mono uppercase font-bold">Último error de conexión: </span>
          <span className={lastConnectionError ? 'text-[#FF85A2] font-mono' : 'text-[#00FFB2] font-mono'}>
            {lastConnectionError || 'Ninguno (conexión saludable)'}
          </span>
        </div>
      </div>

      {/* Tarjeta de Control de Auto-Accept */}
      <div className="bg-[#08152B]/95 p-6 rounded-xl border border-[#1B3B6F] shadow-[0_8px_30px_rgba(0,0,0,0.4)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-black text-white flex items-center space-x-2 tracking-wide uppercase">
            <span>Auto-Accept de Partidas</span>
            {autoAcceptEnabled ? (
              <span className="text-[10px] bg-[#00FFB2]/20 text-[#00FFB2] border border-[#00FFB2]/40 px-2 py-0.5 rounded font-mono font-bold">
                ACTIVO
              </span>
            ) : (
              <span className="text-[10px] bg-[#5078A8]/20 text-[#6F92BF] border border-[#1B3B6F] px-2 py-0.5 rounded font-mono font-bold">
                INACTIVO
              </span>
            )}
          </h3>
          <p className="text-xs text-[#6F92BF] font-mono mt-1 leading-relaxed">
            Detecta automáticamente la fase de Ready Check y acepta la partida respetando un retardo para simular comportamiento humano.
          </p>

          <div className="mt-4 flex items-center space-x-4">
            <div className="flex items-center space-x-3 text-xs text-white">
              <span className="font-mono text-[#6F92BF]">Retardo:</span>
              <span className="font-mono bg-[#040C1A] border border-[#1B3B6F] px-2 py-1 rounded text-[#00F0FF] font-black">
                {autoAcceptDelay}s
              </span>
              <input
                type="range"
                min="0"
                max="8"
                step="1"
                value={autoAcceptDelay}
                onChange={(e) => onChangeDelay(Number(e.target.value))}
                className="accent-[#00D4FF] cursor-pointer w-36"
              />
            </div>
            <span className="text-[11px] text-[#5078A8] font-mono">
              (Rango seguro: 0 - 8s)
            </span>
          </div>
        </div>

        <div>
          <button
            onClick={onToggleAutoAccept}
            className={`px-5 py-2.5 rounded font-black text-xs uppercase tracking-widest transition shadow-lg transform -skew-x-6 active:scale-95 ${
              autoAcceptEnabled
                ? 'bg-gradient-to-r from-[#00D4FF] to-[#0077FF] hover:from-[#00F0FF] hover:to-[#0088FF] text-[#030813] shadow-[0_0_15px_rgba(0,212,255,0.4)]'
                : 'bg-[#040C1A] hover:bg-[#0E2242] text-[#6F92BF] border border-[#1B3B6F]'
            }`}
          >
            <span className="transform skew-x-6 inline-block">
              {autoAcceptEnabled ? 'Desactivar Auto-Accept' : 'Activar Auto-Accept'}
            </span>
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
