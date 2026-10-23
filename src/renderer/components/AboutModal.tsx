import React, { useState } from 'react';
import { X, ExternalLink, ShieldCheck, Database, Cpu, RefreshCw } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  patchVersion?: string;
  clientVersion?: string;
  appVersion?: string;
}

export const AboutModal: React.FC<AboutModalProps> = ({
  isOpen,
  onClose,
  patchVersion = '26.20',
  clientVersion = '26.20',
  appVersion = 'v1.0.1',
}) => {
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCheckUpdates = async () => {
    if (!window.api?.checkForUpdates) return;
    setCheckingUpdate(true);
    setUpdateMsg(null);
    try {
      const res = await window.api.checkForUpdates();
      if (res.isDev) {
        setUpdateMsg('Modo desarrollo: el auto-updater se desactiva para proteger el código fuente.');
      } else if (res.success) {
        setUpdateMsg(res.version ? `✓ Versión v${res.version} disponible. Descargando en segundo plano...` : 'Itero Local está actualizado a la última versión.');
      } else {
        setUpdateMsg(res.error ? `Aviso: ${res.error}` : 'No se encontraron actualizaciones pendientes.');
      }
    } catch (err: any) {
      setUpdateMsg(`Error: ${err.message || String(err)}`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#0A111F] border border-[#1E355B] rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-6 text-white relative animate-fade-in">
        {/* Cabecera */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1E355B]">
          <div className="flex items-center space-x-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0070EB]"></span>
            <h3 className="text-lg font-bold tracking-wide uppercase text-white">
              Acerca de Itero Local
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-[#94A3B8] hover:text-white p-1 rounded transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Versiones y Entorno */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-[#0D192D] border border-[#1E355B]/60 space-y-1">
            <span className="text-[#94A3B8] block">Versión de Itero Local:</span>
            <span className="font-bold text-white text-sm">{appVersion}</span>
          </div>

          <div className="p-3 rounded-lg bg-[#0D192D] border border-[#1E355B]/60 space-y-1">
            <span className="text-[#94A3B8] block">Parche del Juego / LoL:</span>
            <span className="font-bold text-[#00D4FF] text-sm">{clientVersion || patchVersion}</span>
          </div>
        </div>

        {/* AutoUpdater manual */}
        <div className="p-3 bg-[#0D192D] rounded-lg border border-[#1E355B]/60 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="font-semibold text-white block">Actualizaciones de la aplicación</span>
            <span className="text-[11px] text-[#94A3B8]">
              {updateMsg || 'Consulta GitHub Releases en busca de nuevas versiones.'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleCheckUpdates}
            disabled={checkingUpdate}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#0070EB] hover:bg-[#005CE6] text-white rounded text-xs font-bold transition disabled:opacity-50 shrink-0 self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
            <span>{checkingUpdate ? 'Buscando...' : 'Buscar actualizaciones'}</span>
          </button>
        </div>

        {/* Fuentes de Datos Oficiales */}
        <div className="space-y-3 bg-[#070C16] p-4 rounded-xl border border-[#1E355B] text-xs">
          <h4 className="font-bold text-[#CBD5E1] uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
            <Database className="w-3.5 h-3.5 text-[#00D4FF]" />
            <span>Orígenes de Datos</span>
          </h4>
          <ul className="space-y-2 text-[#94A3B8]">
            <li className="flex items-start space-x-2">
              <span className="text-[#00D4FF]">•</span>
              <span>
                <strong className="text-white">Riot Games Data Dragon:</strong> Catálogo oficial de campeones, runas, objetos e iconos en alta resolución.
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-[#00D4FF]">•</span>
              <span>
                <strong className="text-white">OP.GG MCP Oficial:</strong> Estadísticas competitivas de metagame, tasas de victoria, builds por enfrentamiento y orden de habilidades.
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-[#00D4FF]">•</span>
              <span>
                <strong className="text-white">League Client Ux (LCU):</strong> Detección en tiempo real de tu cliente local con latencia cero.
              </span>
            </li>
          </ul>
        </div>

        {/* Aviso Legal Oficial Riot Games (Legal Jibber Jabber) */}
        <div className="p-3.5 rounded-lg bg-[#111823] border border-[#1E282D] text-[11px] leading-relaxed text-[#A09B8C] space-y-2">
          <div className="flex items-center space-x-1 text-[#F5A623] font-bold uppercase text-[10px] tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Descargo de Responsabilidad Oficial (Legal Jibber Jabber)</span>
          </div>
          <p>
            Itero Local no está respaldado por Riot Games y no refleja las opiniones ni los puntos de vista de Riot Games ni de ninguna persona involucrada oficialmente en la producción o administración de las propiedades de Riot Games.
          </p>
          <p>
            League of Legends y Riot Games son marcas comerciales o marcas registradas de Riot Games, Inc. League of Legends © Riot Games, Inc.
          </p>
        </div>

        {/* Pie */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-[#1E355B] hover:bg-[#2A4878] text-white text-xs font-bold uppercase rounded-lg transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
