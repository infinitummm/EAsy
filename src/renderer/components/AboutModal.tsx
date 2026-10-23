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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#02050E]/85 p-4">
      <div className="bg-[#050E20] border-2 border-[#16335F] max-w-xl w-full p-6 p3r-shadow-hard-lg space-y-6 text-white relative p3r-bevel">
        {/* Cabecera */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-[#16335F]">
          <div className="flex items-center space-x-3">
            <span className="w-3 h-3 bg-[#0066FF] transform rotate-45"></span>
            <h3 className="text-xl font-bold tracking-wider uppercase text-white font-p3r">
              ACERCA DE ITERO LOCAL
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-[#7E9BB8] hover:text-white p-1 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Versiones y Entorno */}
        <div className="grid grid-cols-2 gap-3 text-xs font-p3r-head">
          <div className="p-3 bg-[#081329] border border-[#16335F] space-y-1 p3r-cut-tr">
            <span className="text-[#7E9BB8] block text-[10px] tracking-wider uppercase">Versión de Itero Local:</span>
            <span className="font-bold text-white text-base">{appVersion}</span>
          </div>

          <div className="p-3 bg-[#081329] border border-[#16335F] space-y-1 p3r-cut-tr">
            <span className="text-[#7E9BB8] block text-[10px] tracking-wider uppercase">Parche del Juego / LoL:</span>
            <span className="font-bold text-[#00E5FF] text-base">{clientVersion || patchVersion}</span>
          </div>
        </div>

        {/* AutoUpdater manual */}
        <div className="p-3.5 bg-[#081329] border border-[#16335F] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 p3r-bevel">
          <div>
            <span className="font-bold text-white uppercase tracking-wider block font-p3r-head">Actualizaciones del Software</span>
            <span className="text-[11px] text-[#7E9BB8]">
              {updateMsg || 'Consulta GitHub Releases en busca de nuevas versiones.'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleCheckUpdates}
            disabled={checkingUpdate}
            className="flex items-center space-x-1.5 px-4 py-2 bg-[#0066FF] hover:bg-[#0052CC] text-white text-xs font-bold uppercase tracking-wider transform -skew-x-8 p3r-shadow-blue transition disabled:opacity-50 shrink-0 self-start sm:self-auto"
          >
            <span className="transform skew-x-8 flex items-center space-x-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
              <span>{checkingUpdate ? 'Buscando...' : 'Buscar actualizaciones'}</span>
            </span>
          </button>
        </div>

        {/* Fuentes de Datos Oficiales */}
        <div className="space-y-3 bg-[#040A17] p-4 border border-[#16335F] text-xs p3r-cut-tr">
          <h4 className="font-bold text-[#E2E8F0] uppercase tracking-wider text-[11px] flex items-center space-x-2 font-p3r-head">
            <Database className="w-3.5 h-3.5 text-[#00E5FF]" />
            <span>Orígenes de Datos Oficiales</span>
          </h4>
          <ul className="space-y-2 text-[#7E9BB8]">
            <li className="flex items-start space-x-2">
              <span className="text-[#00E5FF] font-bold">■</span>
              <span>
                <strong className="text-white">Riot Games Data Dragon:</strong> Catálogo oficial de campeones, runas, objetos e iconos en alta resolución.
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-[#00E5FF] font-bold">■</span>
              <span>
                <strong className="text-white">OP.GG MCP Oficial:</strong> Estadísticas competitivas de metagame, tasas de victoria, builds por enfrentamiento y orden de habilidades.
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-[#00E5FF] font-bold">■</span>
              <span>
                <strong className="text-white">League Client Ux (LCU):</strong> Detección en tiempo real de tu cliente local con latencia cero.
              </span>
            </li>
          </ul>
        </div>

        {/* Aviso Legal y Descargo de Responsabilidad */}
        <div className="p-3.5 bg-[#040A17] border border-[#16335F] text-[11px] leading-relaxed text-[#8FA5C4] space-y-2 p3r-bevel">
          <div className="flex items-center space-x-1.5 text-[#FFE277] font-bold uppercase text-[10px] tracking-wider font-p3r-head">
            <ShieldCheck className="w-3.5 h-3.5 text-[#00E5FF]" />
            <span>Descargo de Responsabilidad Legal y Derechos de Autor</span>
          </div>
          <p>
            Esta aplicación es un proyecto de fans sin fines de lucro, no está afiliada, asociada ni respaldada por <strong>Atlus Co., Ltd.</strong>, <strong>Sega Corporation</strong> ni <strong>Riot Games, Inc.</strong>
          </p>
          <p>
            Todas las marcas comerciales, artes, ilustraciones, tipografías y renders de Persona 3 Reload pertenecen a Atlus y Sega. League of Legends y Riot Games son marcas comerciales o marcas registradas de Riot Games, Inc. League of Legends © Riot Games, Inc.
          </p>
        </div>

        {/* Pie */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 bg-[#0066FF] hover:bg-[#0052CC] text-white text-xs font-bold uppercase tracking-wider transform -skew-x-8 p3r-shadow-blue transition"
          >
            <span className="transform skew-x-8 inline-block">Cerrar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
