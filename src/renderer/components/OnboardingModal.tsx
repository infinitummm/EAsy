import React, { useState } from 'react';
import { AppSettings } from '../../shared/types';
import { Shield, Sparkles, Check, ChevronRight, Gamepad2, Database } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#0A111F] border border-[#1E355B] rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-6 text-white relative animate-fade-in">
        {/* Cabecera */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-full bg-[#0070EB]/20 text-[#00D4FF] mb-1">
            <Gamepad2 className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black tracking-wide text-white uppercase">
            Bienvenido a Itero Local
          </h2>
          <p className="text-xs text-[#94A3B8]">
            Tu asistente táctico local para League of Legends. Rendimiento sin coste, determinista y seguro.
          </p>
        </div>

        {/* Pilares Clave */}
        <div className="space-y-3 bg-[#0D192D] p-4 rounded-xl border border-[#1E355B]/80 text-xs">
          <div className="flex items-start space-x-3">
            <Database className="w-4 h-4 text-[#00D4FF] mt-0.5 shrink-0" />
            <div>
              <strong className="text-white block">100% Local y Sin Riot API Key</strong>
              <span className="text-[#94A3B8]">
                Tus datos de invocador, rango, 20 partidas recientes y maestrías se obtienen directamente de tu cliente de juego en ejecución.
              </span>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Shield className="w-4 h-4 text-[#10B981] mt-0.5 shrink-0" />
            <div>
              <strong className="text-white block">Auto Pick Desactivado por Defecto</strong>
              <span className="text-[#94A3B8]">
                El bloqueo automático de campeón está apagado por seguridad para evitar selecciones accidentales en tus partidas. Puedes activarlo cuando gustes en Ajustes.
              </span>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Sparkles className="w-4 h-4 text-[#F5A623] mt-0.5 shrink-0" />
            <div>
              <strong className="text-white block">Datos y Metagame de OP.GG</strong>
              <span className="text-[#94A3B8]">
                Runas, objetos, habilidades y counters oficiales del parche actual sin depender obligatoriamente de claves de IA.
              </span>
            </div>
          </div>
        </div>

        {/* Estado del Cliente */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-[#070C16] border border-[#1E355B]">
          <span className="text-xs text-[#94A3B8]">Estado del Cliente de LoL:</span>
          {lcuConnected ? (
            <span className="text-xs font-bold text-emerald-400 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Conectado y Detectado</span>
            </span>
          ) : (
            <span className="text-xs font-bold text-amber-400 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <span>Esperando ejecución del juego...</span>
            </span>
          )}
        </div>

        {/* Preferencias Iniciales Rápidas */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] font-bold text-[#CBD5E1] block mb-1 uppercase tracking-wider">
              Elo de Referencia OP.GG
            </label>
            <select
              value={selectedElo}
              onChange={(e) => setSelectedElo(e.target.value as any)}
              className="w-full bg-[#0A1428] border border-[#1E355B] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#0070EB]"
            >
              <option value="emerald_plus">Esmeralda + (Recomendado)</option>
              <option value="diamond_plus">Diamante +</option>
              <option value="master_plus">Master +</option>
              <option value="all">Todos los rangos</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-[#CBD5E1] block mb-1 uppercase tracking-wider">
              Idioma de Campeones / Textos
            </label>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className="w-full bg-[#0A1428] border border-[#1E355B] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#0070EB]"
            >
              <option value="es_MX">Español (Latinoamérica)</option>
              <option value="es_ES">Español (España)</option>
              <option value="en_US">English (US)</option>
            </select>
          </div>
        </div>

        {/* Botón Comenzar */}
        <button
          type="button"
          onClick={handleFinish}
          className="w-full py-3.5 bg-[#0070EB] hover:bg-[#005CE6] text-white font-bold text-sm tracking-wider uppercase rounded-xl transition flex items-center justify-center space-x-2 transform -skew-x-3 active:scale-95 shadow-lg"
        >
          <div className="transform skew-x-3 flex items-center space-x-2">
            <span>COMENZAR A USAR ITERO LOCAL</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </button>
      </div>
    </div>
  );
};
