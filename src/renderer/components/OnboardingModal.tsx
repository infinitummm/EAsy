import React, { useState } from 'react';
import { AppSettings } from '../../shared/types';
import { Shield, Sparkles, ChevronRight, Gamepad2, Database } from 'lucide-react';
import { P3rButton } from './p3r/P3rButton';
import { P3rBadge } from './p3r/P3rBadge';

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
        ...settings.autoChampSelect,
        autoPick: false, // Garantizado desactivado por defecto
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#02050E]/85 p-4 select-none">
      <div className="bg-[#050E20] border-2 border-[#16335F] max-w-xl w-full p-6 p3r-shadow-hard-lg space-y-6 text-white relative p3r-bevel">
        {/* Cabecera P3R */}
        <div className="text-center space-y-2 border-b-2 border-[#16335F] pb-4">
          <div className="inline-flex p-3 bg-[#0066FF] text-white transform -skew-x-8 p3r-shadow-blue border-l-2 border-white mb-1">
            <Gamepad2 className="w-8 h-8 transform skew-x-8" />
          </div>
          <div className="flex items-center justify-center space-x-2">
            <span className="text-[10px] font-mono tracking-widest text-[#00E5FF] uppercase font-bold">
              DARK HOUR // INITIAL SETUP
            </span>
          </div>
          <h2 className="text-2xl font-black tracking-wider text-white uppercase font-p3r">
            BIENVENIDO A ITERO LOCAL
          </h2>
          <p className="text-xs text-[#7E9BB8] max-w-md mx-auto">
            Tu asistente táctico local para League of Legends. Rendimiento determinista, sin coste y 100% seguro.
          </p>
        </div>

        {/* Pilares Clave */}
        <div className="space-y-3 bg-[#030814] p-4 border border-[#16335F] text-xs p3r-cut-tr">
          <div className="flex items-start space-x-3">
            <Database className="w-4 h-4 text-[#00E5FF] mt-0.5 shrink-0" />
            <div>
              <strong className="text-white block font-p3r-head uppercase text-[11px] tracking-wider">
                100% Local y Sin Riot API Key
              </strong>
              <span className="text-[#7E9BB8] leading-relaxed block mt-0.5">
                Tus datos de invocador, rango, 20 partidas recientes y maestrías se obtienen directamente de tu cliente de juego en ejecución.
              </span>
            </div>
          </div>

          <div className="flex items-start space-x-3 pt-2 border-t border-[#16335F]/60">
            <Shield className="w-4 h-4 text-[#00E676] mt-0.5 shrink-0" />
            <div>
              <strong className="text-white block font-p3r-head uppercase text-[11px] tracking-wider">
                Auto Pick Desactivado por Defecto
              </strong>
              <span className="text-[#7E9BB8] leading-relaxed block mt-0.5">
                El bloqueo automático de campeón está apagado por seguridad para evitar selecciones accidentales. Puedes activarlo cuando gustes en Ajustes.
              </span>
            </div>
          </div>

          <div className="flex items-start space-x-3 pt-2 border-t border-[#16335F]/60">
            <Sparkles className="w-4 h-4 text-[#FFE277] mt-0.5 shrink-0" />
            <div>
              <strong className="text-white block font-p3r-head uppercase text-[11px] tracking-wider">
                Datos y Metagame de OP.GG
              </strong>
              <span className="text-[#7E9BB8] leading-relaxed block mt-0.5">
                Runas, objetos, habilidades y counters oficiales del parche actual sin depender obligatoriamente de claves de IA.
              </span>
            </div>
          </div>
        </div>

        {/* Estado del Cliente */}
        <div className="flex items-center justify-between p-3.5 bg-[#030814] border border-[#16335F] p3r-cut-tr">
          <span className="text-xs text-[#7E9BB8] uppercase font-bold tracking-wider font-p3r-head">
            Estado del Cliente de LoL:
          </span>
          <P3rBadge
            label={lcuConnected ? 'Conectado y Detectado' : 'Esperando ejecución del juego...'}
            variant={lcuConnected ? 'green' : 'yellow'}
          />
        </div>

        {/* Preferencias Iniciales Rápidas */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-black text-[#7E9BB8] block mb-1 uppercase tracking-wider font-p3r-head">
              Elo de Referencia OP.GG
            </label>
            <select
              value={selectedElo}
              onChange={(e) => setSelectedElo(e.target.value as any)}
              className="w-full bg-[#030814] border border-[#16335F] focus:border-[#00E5FF] px-3 py-2 text-xs text-white focus:outline-none font-mono"
            >
              <option value="emerald_plus">Esmeralda + (Recomendado)</option>
              <option value="diamond_plus">Diamante +</option>
              <option value="master_plus">Master +</option>
              <option value="all">Todos los rangos</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black text-[#7E9BB8] block mb-1 uppercase tracking-wider font-p3r-head">
              Idioma de Campeones / Textos
            </label>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className="w-full bg-[#030814] border border-[#16335F] focus:border-[#00E5FF] px-3 py-2 text-xs text-white focus:outline-none font-mono"
            >
              <option value="es_MX">Español (Latinoamérica)</option>
              <option value="es_ES">Español (España)</option>
              <option value="en_US">English (US)</option>
            </select>
          </div>
        </div>

        {/* Botón Comenzar */}
        <div className="pt-2">
          <P3rButton
            variant="cyan"
            size="lg"
            className="w-full justify-center"
            onClick={handleFinish}
            icon={<ChevronRight className="w-4 h-4 text-[#030814]" />}
          >
            COMENZAR A USAR ITERO LOCAL
          </P3rButton>
        </div>
      </div>
    </div>
  );
};
