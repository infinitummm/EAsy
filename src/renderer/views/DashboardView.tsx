import React from 'react';
import { AlertCircle, Zap, Wifi, WifiOff, Activity } from 'lucide-react';
import type { LcuConnectionState, GameflowPhase, ReadyCheckEvent } from '../../shared/types';
import { formatGameflowPhase } from '../../shared/constants';
import { P3rButton } from '../components/p3r/P3rButton';
import { P3rBadge } from '../components/p3r/P3rBadge';
import char1CutIn from '../../assets/p3r/char1.png';

interface DashboardViewProps {
  lcuState: LcuConnectionState;
  mainLcuState?: LcuConnectionState;
  gameflow: GameflowPhase;
  readyCheck: ReadyCheckEvent | null;
  autoAcceptEnabled: boolean;
  autoAcceptDelay: number;
  autoAcceptLastAction?: string;
  autoAcceptLastTimestamp?: number;
  autoAcceptPollingActive?: boolean;
  lastConnectionError?: string | null;
  lcuPort?: number | null;
  lastIpcTimestamp?: string;
  lastIpcEvent?: string;
  onToggleAutoAccept: () => void;
  onChangeDelay: (seconds: number) => void;
  onRefreshLcu?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  lcuState,
  gameflow,
  readyCheck,
  autoAcceptEnabled,
  autoAcceptDelay,
  autoAcceptLastAction,
  autoAcceptLastTimestamp,
  onToggleAutoAccept,
  onChangeDelay,
}) => {
  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-8">
      {/* Cabecera con Arte P3R */}
      <div className="relative overflow-hidden bg-[#050E20] border-2 border-[#16335F] p3r-bevel p3r-shadow-hard-lg">
        {/* Render de combate con máscara diagonal */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1/2 md:w-5/12 pointer-events-none opacity-40 md:opacity-75 mix-blend-screen"
          style={{
            clipPath: 'polygon(25% 0, 100% 0, 100% 100%, 0% 100%)',
          }}
        >
          <img
            src={char1CutIn}
            alt="P3R Cut-In"
            className="w-full h-full object-cover object-left"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#050E20] via-transparent to-transparent" />
        </div>

        <div className="absolute inset-0 p3r-hatch pointer-events-none opacity-60" />

        <div className="relative z-10 p-6 flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <P3rBadge label="PARCHE 26.20" variant="cyan" />
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-wider font-p3r uppercase">
              INICIO
            </h1>
          </div>
        </div>
      </div>

      {/* Aviso breve solo si hay un problema real */}
      {lcuState === 'disconnected' && (
        <div className="p-4 bg-[#21090D] border-2 border-[#FF1744] flex items-center space-x-3 text-[#FF1744] text-xs p3r-cut-tr">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="font-bold">No se detecta el cliente de LoL. Abre el cliente de League of Legends para comenzar.</span>
        </div>
      )}

      {/* Alerta de ReadyCheck en curso */}
      {readyCheck && readyCheck.state === 'InProgress' && (
        <div className="bg-[#FFE277]/10 border-2 border-[#FFE277] p-5 p3r-bevel p3r-shadow-hard flex items-center justify-between animate-p3r-slide">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-[#FFE277] text-[#030814] flex items-center justify-center transform -skew-x-8">
              <Zap className="w-6 h-6 transform skew-x-8 font-black" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white tracking-wider font-p3r uppercase">
                Partida encontrada
              </h3>
              <p className="text-xs text-[#E2E8F0] mt-0.5">
                {autoAcceptEnabled
                  ? `Aceptando en ${autoAcceptDelay}s`
                  : 'Acepta en el cliente.'}
              </p>
            </div>
          </div>
          <span className="text-xs uppercase tracking-widest font-mono bg-[#030814] px-4 py-1.5 text-[#FFE277] border border-[#FFE277] font-black transform -skew-x-8">
            <span className="transform skew-x-8 inline-block">{readyCheck.playerResponse}</span>
          </span>
        </div>
      )}

      {/* Tarjetas de Conexión y Fase */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Conexión */}
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
                Cliente de LoL
              </span>
              <P3rBadge
                label={lcuState === 'connected' ? 'Conectado' : lcuState === 'connecting' ? 'Conectando' : 'Desconectado'}
                variant={lcuState === 'connected' ? 'green' : lcuState === 'connecting' ? 'yellow' : 'red'}
              />
            </div>
            <div className="text-lg font-bold text-white tracking-wide truncate mt-0.5 font-p3r-head">
              {lcuState === 'connected'
                ? 'Conectado'
                : lcuState === 'connecting'
                ? 'Conectando...'
                : 'Desconectado'}
            </div>
          </div>
        </div>

        {/* Fase */}
        <div className="bg-[#050E20] p-5 border-2 border-[#16335F] p3r-bevel p3r-shadow-hard flex items-center space-x-4">
          <div className="w-14 h-14 bg-[#0066FF]/20 text-[#00E5FF] border-2 border-[#0066FF] flex items-center justify-center transform -skew-x-8 shrink-0">
            <div className="transform skew-x-8">
              <Activity className="w-7 h-7" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#7E9BB8] font-black uppercase tracking-wider font-p3r-head">
                Fase
              </span>
            </div>
            <div className="text-2xl font-black font-mono text-white tracking-wider truncate mt-0.5">
              {formatGameflowPhase(gameflow)}
            </div>
          </div>
        </div>
      </div>

      {/* Auto-Accept */}
      <div className="bg-[#050E20] p-6 border-2 border-[#16335F] p3r-bevel p3r-shadow-hard space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <h3 className="text-lg font-black text-white uppercase tracking-wider font-p3r">
                Auto-accept
              </h3>
              <P3rBadge
                label={autoAcceptEnabled ? 'Activo' : 'Inactivo'}
                variant={autoAcceptEnabled ? 'green' : 'neutral'}
              />
            </div>

            {/* Selector de Retardo */}
            <div className="flex items-center space-x-3 text-xs text-white">
              <span className="text-[#7E9BB8] font-bold uppercase tracking-wider font-p3r-head">Retardo:</span>
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
          </div>

          <div className="shrink-0">
            <P3rButton
              variant={autoAcceptEnabled ? 'cyan' : 'primary'}
              size="lg"
              onClick={onToggleAutoAccept}
            >
              {autoAcceptEnabled ? 'Desactivar' : 'Activar'}
            </P3rButton>
          </div>
        </div>

        {autoAcceptLastAction && (
          <div className="pt-3 border-t border-[#16335F] flex items-center justify-between text-xs font-mono text-[#7E9BB8]">
            <span>Última acción: <strong className="text-white">{autoAcceptLastAction}</strong></span>
            {autoAcceptLastTimestamp && (
              <span>{new Date(autoAcceptLastTimestamp).toLocaleTimeString()}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
