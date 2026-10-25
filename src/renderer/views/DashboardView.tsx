import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  Zap,
  Wifi,
  WifiOff,
  Activity,
  Swords,
  Layers,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import type { LcuConnectionState, GameflowPhase, ReadyCheckEvent, TipoModo } from '../../shared/types';
import { obtenerNombreModo } from '../../shared/types';
import { formatGameflowPhase } from '../../shared/constants';
import { P3rButton } from '../components/p3r/P3rButton';
import { P3rBadge } from '../components/p3r/P3rBadge';
import char1CutIn from '../../assets/p3r/char1.png';

interface DashboardViewProps {
  lcuState: LcuConnectionState;
  mainLcuState?: LcuConnectionState;
  gameflow: GameflowPhase;
  gameMode?: TipoModo | null;
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
  gameMode,
  readyCheck,
  autoAcceptEnabled,
  autoAcceptDelay,
  autoAcceptLastAction,
  autoAcceptLastTimestamp,
  onToggleAutoAccept,
  onChangeDelay,
}) => {
  const [borderlessState, setBorderlessState] = useState<{
    isBorderless: boolean;
    configPath: string;
    checked: boolean;
    applying: boolean;
    appliedSuccess: boolean;
  }>({
    isBorderless: true,
    configPath: '',
    checked: false,
    applying: false,
    appliedSuccess: false,
  });

  useEffect(() => {
    if (window.api?.checkBorderless) {
      window.api
        .checkBorderless()
        .then((res) => {
          if (res) {
            setBorderlessState((prev) => ({
              ...prev,
              isBorderless: res.isBorderless,
              configPath: res.configPath,
              checked: true,
            }));
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleApplyBorderless = async () => {
    if (!window.api?.applyBorderless) return;
    setBorderlessState((prev) => ({ ...prev, applying: true }));
    try {
      const res = await window.api.applyBorderless();
      if (res && res.success) {
        setBorderlessState((prev) => ({
          ...prev,
          isBorderless: true,
          applying: false,
          appliedSuccess: true,
        }));
      } else {
        setBorderlessState((prev) => ({ ...prev, applying: false }));
      }
    } catch {
      setBorderlessState((prev) => ({ ...prev, applying: false }));
    }
  };

  const handleToggleOverlay = async () => {
    if (window.api?.overlayToggle) {
      await window.api.overlayToggle();
    }
  };

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

      {/* Tarjetas de Conexión, Fase y Modo de Juego */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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

        {/* Modo de juego */}
        <div className="bg-[#050E20] p-5 border-2 border-[#16335F] p3r-bevel p3r-shadow-hard flex items-center space-x-4">
          <div className="w-14 h-14 bg-[#FFE277]/15 text-[#FFE277] border-2 border-[#FFE277] flex items-center justify-center transform -skew-x-8 shrink-0">
            <div className="transform skew-x-8">
              <Swords className="w-7 h-7" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#7E9BB8] font-black uppercase tracking-wider font-p3r-head">
                Modo de juego
              </span>
              <P3rBadge
                label={
                  gameMode === 'arena'
                    ? 'Arena'
                    : gameMode === 'aram_mayhem'
                    ? 'ARAM Caos'
                    : gameMode === 'aram'
                    ? 'ARAM'
                    : gameMode === 'normal'
                    ? 'Normal'
                    : gameMode === 'ranked'
                    ? 'Ranked'
                    : 'Sin partida'
                }
                variant={
                  gameMode === 'arena'
                    ? 'green'
                    : gameMode === 'aram_mayhem'
                    ? 'yellow'
                    : gameMode === 'aram'
                    ? 'cyan'
                    : gameMode === 'normal'
                    ? 'cyan'
                    : gameMode === 'ranked'
                    ? 'yellow'
                    : 'neutral'
                }
              />
            </div>
            <div className="text-xl font-black font-mono text-white tracking-wider truncate mt-0.5">
              {obtenerNombreModo(gameMode)}
            </div>
          </div>
        </div>
      </div>

      {/* Panel del Overlay In-Game y Estado de Pantalla de LoL */}
      <div className="bg-[#050E20] p-6 border-2 border-[#16335F] p3r-bevel p3r-shadow-hard space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-3">
              <h3 className="text-lg font-black text-white uppercase tracking-wider font-p3r flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#00E5FF]" />
                Overlay In-Game
              </h3>
              <P3rBadge
                label={borderlessState.isBorderless ? 'Listo para superposición' : 'Requiere Sin Bordes'}
                variant={borderlessState.isBorderless ? 'green' : 'yellow'}
              />
            </div>
            <p className="text-xs text-[#CBD5E1]">
              Muestra automáticamente los tiers de mejoras (S+/S/A/B/C/D) y porcentajes de Pick Rate sobre el juego en ARAM Caos y Arena.
            </p>
            <p className="text-[11px] text-[#7E9BB8] font-mono">
              Atajo rápido para mostrar u ocultar: <strong className="text-[#00E5FF]">Ctrl + Shift + O</strong>
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <P3rButton
              variant="secondary"
              size="md"
              onClick={handleToggleOverlay}
            >
              Mostrar / Ocultar Overlay
            </P3rButton>
          </div>
        </div>

        {/* Advertencia si LoL está en pantalla completa exclusiva */}
        {!borderlessState.isBorderless && borderlessState.checked && (
          <div className="p-4 bg-[#2A1805] border-2 border-[#FFE277] flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-[#FFE277] p3r-bevel">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-[#FFE277] shrink-0 mt-0.5" />
              <div>
                <strong className="text-white block font-p3r-head uppercase tracking-wider">
                  LoL está en Pantalla Completa exclusiva
                </strong>
                <span className="text-[#CBD5E1] text-[11px] leading-relaxed">
                  DirectX exclusivo oculta cualquier ventana superpuesta. Para que el overlay se mantenga siempre visible sobre League of Legends, la pantalla debe configurarse en "Sin bordes".
                </span>
              </div>
            </div>

            <P3rButton
              variant="cyan"
              size="sm"
              onClick={handleApplyBorderless}
              disabled={borderlessState.applying}
            >
              {borderlessState.applying ? 'Aplicando...' : 'Configurar LoL en Sin Bordes (1 clic)'}
            </P3rButton>
          </div>
        )}

        {borderlessState.appliedSuccess && (
          <div className="p-3 bg-[#062615] border border-[#00E676] flex items-center space-x-2 text-xs text-[#00E676]">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>LoL configurado en "Sin Bordes" con éxito. El overlay se mantendrá siempre por encima del juego.</span>
          </div>
        )}
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
