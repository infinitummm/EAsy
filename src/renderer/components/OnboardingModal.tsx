import React, { useState } from 'react';
import { AppSettings } from '../../shared/types';
import { Shield, Sparkles, ChevronRight, Gamepad2, Database } from 'lucide-react';
import { APP_NAME } from '../../shared/constants';
import { P3rButton } from './p3r/P3rButton';
import { P3rBadge } from './p3r/P3rBadge';
import logoUrl from '../assets/logo.png';

interface OnboardingModalProps {
  settings: AppSettings;
  onComplete: (updated: Partial<AppSettings>) => void;
  lcuConnected: boolean;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  settings,
  onComplete,
  lcuConnected,
}) => {
  const [selectedElo, setSelectedElo] = useState(settings.opggTier || 'emerald_plus');
  const [locale, setLocale] = useState(settings.preferredLocale || 'es_MX');

  const handleFinish = () => {
    onComplete({
      onboardingCompleted: true,
      opggTier: selectedElo as any,
      preferredLocale: locale,
      autoChampSelect: {
        ...(settings?.autoChampSelect || {}),
        autoPick: false,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#02050E]/85 p-4 select-none">
      <div className="bg-[#050E20] border-2 border-[#16335F] max-w-lg w-full p-6 p3r-shadow-hard-lg space-y-5 text-white relative p3r-bevel">
        {/* Cabecera */}
        <div className="text-center space-y-2 border-b-2 border-[#16335F] pb-4">
          <div className="flex justify-center mb-1">
            <img
              src={logoUrl}
              alt="EAsy Logo"
              className="w-16 h-16 object-contain rounded-xl p3r-shadow-blue border-2 border-[#00E5FF]/40 shadow-xl"
            />
          </div>
          <h2 className="text-2xl font-black tracking-wider text-white uppercase font-p3r">
            Bienvenido a {APP_NAME}
          </h2>
          <p className="text-xs text-[#7E9BB8] max-w-md mx-auto">
            ConfiguraciÃ³n inicial para tus partidas.
          </p>
        </div>

        {/* Puntos Clave */}
        <div className="space-y-3 bg-[#030814] p-4 border border-[#16335F] text-xs p3r-cut-tr">
          <div className="flex items-start space-x-3">
            <Database className="w-4 h-4 text-[#00E5FF] mt-0.5 shrink-0" />
            <div>
              <strong className="text-white block font-p3r-head uppercase text-[11px] tracking-wider">
                Datos de Partida
              </strong>
              <span className="text-[#7E9BB8] leading-relaxed block mt-0.5">
                Se sincronizan directamente con tu cliente de League of Legends.
              </span>
            </div>
          </div>

          <div className="flex items-start space-x-3 pt-2 border-t border-[#16335F]/60">
            <Shield className="w-4 h-4 text-[#00E676] mt-0.5 shrink-0" />
            <div>
              <strong className="text-white block font-p3r-head uppercase text-[11px] tracking-wider">
                SelecciÃ³n de CampeÃ³n
              </strong>
              <span className="text-[#7E9BB8] leading-relaxed block mt-0.5">
                El bloqueo automÃ¡tico estÃ¡ desactivado por defecto. Puedes activarlo en Ajustes.
              </span>
            </div>
          </div>

          <div className="flex items-start space-x-3 pt-2 border-t border-[#16335F]/60">
            <Sparkles className="w-4 h-4 text-[#FFE277] mt-0.5 shrink-0" />
            <div>
              <strong className="text-white block font-p3r-head uppercase text-[11px] tracking-wider">
                EstadÃ­sticas de OP.GG
              </strong>
              <span className="text-[#7E9BB8] leading-relaxed block mt-0.5">
                Runas, objetos y enfrentamientos basados en datos competitivos de OP.GG.
              </span>
            </div>
          </div>
        </div>

        {/* Estado del Cliente */}
        <div className="flex items-center justify-between p-3.5 bg-[#030814] border border-[#16335F] p3r-cut-tr">
          <span className="text-xs text-[#7E9BB8] uppercase font-bold tracking-wider font-p3r-head">
            Cliente de LoL:
          </span>
          <P3rBadge
            label={lcuConnected ? 'Conectado' : 'Esperando cliente...'}
            variant={lcuConnected ? 'green' : 'yellow'}
          />
        </div>

        {/* Preferencias Iniciales RÃ¡pidas */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-black text-[#7E9BB8] block mb-1 uppercase tracking-wider font-p3r-head">
              Rango de referencia OP.GG
            </label>
            <select
              value={selectedElo}
              onChange={(e) => setSelectedElo(e.target.value as any)}
              className="w-full bg-[#030814] border border-[#16335F] focus:border-[#00E5FF] px-3 py-2 text-xs text-white focus:outline-none font-mono"
            >
              <option value="emerald_plus">Esmeralda +</option>
              <option value="diamond_plus">Diamante +</option>
              <option value="master_plus">MÃ¡ster +</option>
              <option value="all">Todos los rangos</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black text-[#7E9BB8] block mb-1 uppercase tracking-wider font-p3r-head">
              Idioma
            </label>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className="w-full bg-[#030814] border border-[#16335F] focus:border-[#00E5FF] px-3 py-2 text-xs text-white focus:outline-none font-mono"
            >
              <option value="es_MX">EspaÃ±ol (LatinoamÃ©rica)</option>
              <option value="es_ES">EspaÃ±ol (EspaÃ±a)</option>
              <option value="en_US">English</option>
            </select>
          </div>
        </div>

        {/* BotÃ³n Comenzar */}
        <div className="pt-2">
          <P3rButton
            variant="cyan"
            size="lg"
            className="w-full justify-center"
            onClick={handleFinish}
            icon={<ChevronRight className="w-4 h-4 text-[#030814]" />}
          >
            Comenzar
          </P3rButton>
        </div>
      </div>
    </div>
  );
};
