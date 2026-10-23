import React from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { APP_NAME } from '../../shared/constants';

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
  if (!isOpen) return null;

  const currentPatch = clientVersion || patchVersion;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#02050E]/85 p-4">
      <div className="bg-[#050E20] border-2 border-[#16335F] max-w-lg w-full p-6 p3r-shadow-hard-lg space-y-5 text-white relative p3r-bevel">
        {/* Cabecera */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-[#16335F]">
          <div className="flex items-center space-x-3">
            <span className="w-3 h-3 bg-[#0066FF] transform rotate-45"></span>
            <h3 className="text-xl font-bold tracking-wider uppercase text-white font-p3r">
              Acerca de {APP_NAME}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-[#7E9BB8] hover:text-white p-1 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Datos Principales */}
        <div className="grid grid-cols-2 gap-3 text-xs font-mono">
          <div className="p-3 bg-[#081329] border border-[#16335F] space-y-1 p3r-cut-tr">
            <span className="text-[#7E9BB8] block text-[10px] tracking-wider uppercase">Aplicación</span>
            <span className="font-bold text-white text-base font-p3r">{APP_NAME} {appVersion}</span>
          </div>

          <div className="p-3 bg-[#081329] border border-[#16335F] space-y-1 p3r-cut-tr">
            <span className="text-[#7E9BB8] block text-[10px] tracking-wider uppercase">Parche detectado</span>
            <span className="font-bold text-[#00E5FF] text-base">{currentPatch}</span>
          </div>
        </div>

        {/* Fuente de datos */}
        <div className="p-3.5 bg-[#081329] border border-[#16335F] text-xs space-y-1 p3r-cut-tr font-mono">
          <span className="text-[#7E9BB8] block text-[10px] tracking-wider uppercase">Fuente de datos</span>
          <p className="text-white">
            OP.GG (estadísticas y metagame del parche {currentPatch}).
          </p>
        </div>

        {/* Avisos Legales */}
        <div className="p-3.5 bg-[#040A17] border border-[#16335F] text-[11px] leading-relaxed text-[#8FA5C4] space-y-2 p3r-bevel">
          <div className="flex items-center space-x-1.5 text-[#FFE277] font-bold uppercase text-[10px] tracking-wider font-p3r-head">
            <ShieldCheck className="w-3.5 h-3.5 text-[#00E5FF]" />
            <span>Avisos Legales</span>
          </div>
          <p>
            Esta aplicación es un proyecto de fans sin fines de lucro, no está afiliada, asociada ni respaldada por <strong>Atlus Co., Ltd.</strong>, <strong>Sega Corporation</strong> ni <strong>Riot Games, Inc.</strong>
          </p>
          <p>
            Todas las marcas comerciales, artes, ilustraciones, tipografías y renders de Persona 3 Reload pertenecen a Atlus y Sega. League of Legends y Riot Games son marcas comerciales o marcas registradas de Riot Games, Inc. League of Legends © Riot Games, Inc.
          </p>
        </div>

        {/* Pie */}
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 bg-[#0066FF] hover:bg-[#0052CC] text-white text-xs font-bold uppercase tracking-wider transform -skew-x-8 p3r-shadow-blue transition cursor-pointer"
          >
            <span className="transform skew-x-8 inline-block">Cerrar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
