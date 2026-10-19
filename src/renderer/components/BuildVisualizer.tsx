import React from 'react';
import { GeminiMatchupRecommendation } from '../../shared/types';

interface BuildVisualizerProps {
  build: GeminiMatchupRecommendation['buildRecommendation'];
  skillOrder: GeminiMatchupRecommendation['skillOrder'];
  patch?: string;
}

export const BuildVisualizer: React.FC<BuildVisualizerProps> = ({
  build,
  skillOrder,
  patch = '14.20.1'
}) => {
  const getItemImg = (itemId: number) =>
    `https://ddragon.leagueoflegends.com/cdn/${patch}/img/item/${itemId}.png`;

  return (
    <div className="space-y-6">
      {/* Sección de Objetos de la Build */}
      <div className="bg-[#0D192D] border border-[#1E355B] rounded-xl p-5 shadow-xl">
        <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-[#F5A623]"></span>
          <span>Ruta Óptima de Objetos</span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Iniciales */}
          <div className="bg-[#0A111F] p-3.5 rounded border border-[#1E355B]">
            <span className="text-xs text-[#94A3B8] font-semibold block mb-2">Inicio de Partida</span>
            <div className="flex flex-wrap gap-2">
              {build.startingItems.map((id, idx) => (
                <div key={idx} className="relative group">
                  <img
                    src={getItemImg(id)}
                    alt={`Ítem ${id}`}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                    className="w-11 h-11 rounded border border-[#1E355B] bg-[#11223F] object-cover shadow-sm group-hover:border-[#0070EB] transition-colors"
                  />
                  <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 text-[10px] bg-[#0A111F] border border-[#1E355B] rounded text-white whitespace-nowrap z-10">
                    ID: {id}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Core Items */}
          <div className="bg-[#0A111F] p-3.5 rounded border border-[#1E355B]">
            <span className="text-xs text-[#F5A623] font-semibold block mb-2">Objetos Centrales (Core)</span>
            <div className="flex flex-wrap gap-2">
              {build.coreItems.map((id, idx) => (
                <div key={idx} className="relative group">
                  <div className="relative">
                    <img
                      src={getItemImg(id)}
                      alt={`Core ${id}`}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                      className="w-11 h-11 rounded border border-[#F5A623]/60 bg-[#11223F] object-cover shadow-sm group-hover:border-[#F5A623] transition-colors"
                    />
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#F5A623] text-black text-[10px] font-bold rounded-full flex items-center justify-center">
                      {idx + 1}
                    </span>
                  </div>
                  <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 text-[10px] bg-[#0A111F] border border-[#1E355B] rounded text-white whitespace-nowrap z-10">
                    ID: {id}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Situacionales */}
          <div className="bg-[#0A111F] p-3.5 rounded border border-[#1E355B]">
            <span className="text-xs text-[#60A5FA] font-semibold block mb-2">Opciones Situacionales</span>
            <div className="flex flex-col space-y-2">
              {build.situationalItems.map((item, idx) => (
                <div key={idx} className="flex items-center space-x-2.5">
                  <img
                    src={getItemImg(item.itemId)}
                    alt={`Situacional ${item.itemId}`}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                    className="w-8 h-8 rounded border border-[#1E355B] bg-[#11223F] shrink-0"
                  />
                  <span className="text-xs text-[#CBD5E1] leading-tight">
                    {item.condition}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {build.rationale && (
          <p className="mt-3 text-xs text-[#94A3B8] italic bg-[#0A111F] p-2.5 rounded border border-[#1E355B]">
            "{build.rationale}"
          </p>
        )}
      </div>

      {/* Sección de Orden de Habilidades */}
      <div className="bg-[#0D192D] border border-[#1E355B] rounded-xl p-5 shadow-xl">
        <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-[#0070EB]"></span>
          <span>Orden de Subida de Habilidades</span>
        </h4>

        <div className="flex flex-wrap items-center gap-6">
          {/* Prioridad de maxeo */}
          <div>
            <span className="text-xs text-[#94A3B8] font-semibold block mb-1.5">Prioridad Principal</span>
            <div className="flex items-center space-x-1.5">
              {skillOrder.priority.map((skill, idx) => (
                <React.Fragment key={idx}>
                  <span className="w-8 h-8 rounded bg-[#0A111F] border border-[#0070EB] text-white font-bold text-sm flex items-center justify-center shadow-sm">
                    {skill}
                  </span>
                  {idx < skillOrder.priority.length - 1 && (
                    <span className="text-[#64748B] font-bold">&gt;</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Primeros 3 niveles */}
          <div>
            <span className="text-xs text-[#94A3B8] font-semibold block mb-1.5">Niveles 1, 2 y 3</span>
            <div className="flex items-center space-x-2">
              {skillOrder.firstThreeLevels.map((skill, idx) => (
                <div key={idx} className="flex flex-col items-center">
                  <span className="text-[10px] text-[#64748B]">Lvl {idx + 1}</span>
                  <span className="w-7 h-7 rounded bg-[#0A111F] border border-[#1E355B] text-white font-semibold text-xs flex items-center justify-center mt-0.5">
                    {skill}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {skillOrder.rationale && (
          <p className="mt-3 text-xs text-[#94A3B8] italic bg-[#0A111F] p-2.5 rounded border border-[#1E355B]">
            "{skillOrder.rationale}"
          </p>
        )}
      </div>
    </div>
  );
};
