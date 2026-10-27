import React from 'react';
import { GeminiMatchupRecommendation } from '../../shared/types';
import { toDdragonVersion } from '../../shared/patchUtils';

interface BuildVisualizerProps {
  build: GeminiMatchupRecommendation['buildRecommendation'];
  skillOrder: GeminiMatchupRecommendation['skillOrder'];
  patch?: string;
}

export const BuildVisualizer: React.FC<BuildVisualizerProps> = ({
  build,
  skillOrder,
  patch = '16.20.1'
}) => {
  const ddragonPatch = toDdragonVersion(patch);

  const getItemImg = (itemId: number) =>
    `https://ddragon.leagueoflegends.com/cdn/${ddragonPatch}/img/item/${itemId}.png`;

  return (
    <div className="space-y-6 select-none">
      {/* Sección de Objetos de la Build */}
      <div className="bg-[#050E20] border-2 border-[#16335F] p3r-bevel p3r-shadow-hard p-5">
        <h4 className="text-sm font-black text-white uppercase tracking-wider mb-4 flex items-center space-x-2 font-p3r">
          <span className="w-2.5 h-2.5 bg-[#FFE277] transform rotate-45"></span>
          <span>RUTA ÓPTIMA DE OBJETOS // ITEM BUILD</span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Iniciales */}
          <div className="bg-[#030814] p-4 border border-[#16335F] p3r-cut-tr">
            <span className="text-[10px] text-[#7E9BB8] font-black uppercase tracking-wider block mb-2.5 font-p3r-head">
              Inicio de Partida
            </span>
            <div className="flex flex-wrap gap-2.5">
              {(build?.startingItems || []).map((id, idx) => (
                <div key={idx} className="relative group">
                  <img
                    src={getItemImg(id)}
                    alt={`Ítem ${id}`}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (!target.dataset.triedFallback) {
                        target.dataset.triedFallback = 'true';
                        target.src = `https://ddragon.leagueoflegends.com/cdn/16.20.1/img/item/${id}.png`;
                      }
                    }}
                    className="w-11 h-11 border border-[#16335F] bg-[#050E20] object-cover group-hover:border-[#00E5FF] transition-colors p3r-cut-tr"
                  />
                  <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 text-[10px] bg-[#030814] border border-[#16335F] text-white whitespace-nowrap z-10 font-mono">
                    ID: {id}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Core Items */}
          <div className="bg-[#030814] p-4 border border-[#16335F] p3r-cut-tr">
            <span className="text-[10px] text-[#FFE277] font-black uppercase tracking-wider block mb-2.5 font-p3r-head">
              Objetos Centrales (Core)
            </span>
            <div className="flex flex-wrap gap-2.5">
              {(build?.coreItems || []).map((id, idx) => (
                <div key={idx} className="relative group">
                  <div className="relative">
                    <img
                      src={getItemImg(id)}
                      alt={`Core ${id}`}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (!target.dataset.triedFallback) {
                          target.dataset.triedFallback = 'true';
                          target.src = `https://ddragon.leagueoflegends.com/cdn/16.20.1/img/item/${id}.png`;
                        }
                      }}
                      className="w-11 h-11 border-2 border-[#FFE277] bg-[#050E20] object-cover group-hover:border-white transition-colors p3r-cut-tr p3r-shadow-hard"
                    />
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#FFE277] text-[#030814] text-[10px] font-black flex items-center justify-center font-mono">
                      {idx + 1}
                    </span>
                  </div>
                  <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 text-[10px] bg-[#030814] border border-[#16335F] text-white whitespace-nowrap z-10 font-mono">
                    ID: {id}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Situacionales */}
          <div className="bg-[#030814] p-4 border border-[#16335F] p3r-cut-tr">
            <span className="text-[10px] text-[#00E5FF] font-black uppercase tracking-wider block mb-2.5 font-p3r-head">
              Opciones Situacionales
            </span>
            <div className="flex flex-col space-y-2">
              {(build?.situationalItems || []).map((item: any, idx) => {
                const itemId = typeof item === 'number' ? item : item?.itemId;
                const condition = typeof item === 'object' && item?.condition ? item.condition : 'Opción táctica';
                if (!itemId) return null;
                return (
                  <div key={idx} className="flex items-center space-x-2.5">
                    <img
                      src={getItemImg(itemId)}
                      alt={`Situacional ${itemId}`}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (!target.dataset.triedFallback) {
                          target.dataset.triedFallback = 'true';
                          target.src = `https://ddragon.leagueoflegends.com/cdn/16.20.1/img/item/${itemId}.png`;
                        }
                      }}
                      className="w-8 h-8 border border-[#16335F] bg-[#050E20] shrink-0 p3r-cut-tr"
                    />
                    <span className="text-xs text-[#CBD5E1] leading-tight">
                      {condition}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {build.rationale && (
          <p className="mt-3.5 text-xs text-[#7E9BB8] italic bg-[#030814] p-3 border border-[#16335F] p3r-cut-tr">
            "{build.rationale}"
          </p>
        )}
      </div>

      {/* Sección de Orden de Habilidades */}
      <div className="bg-[#050E20] border-2 border-[#16335F] p3r-bevel p3r-shadow-hard p-5">
        <h4 className="text-sm font-black text-white uppercase tracking-wider mb-4 flex items-center space-x-2 font-p3r">
          <span className="w-2.5 h-2.5 bg-[#0066FF] transform rotate-45"></span>
          <span>ORDEN DE SUBIDA DE HABILIDADES // SKILL ORDER</span>
        </h4>

        <div className="flex flex-wrap items-center gap-6">
          {/* Prioridad de maxeo */}
          <div>
            <span className="text-[10px] text-[#7E9BB8] font-black uppercase tracking-wider block mb-1.5 font-p3r-head">
              Prioridad Principal
            </span>
            <div className="flex items-center space-x-2">
              {skillOrder.priority.map((skill, idx) => (
                <React.Fragment key={idx}>
                  <span className="w-9 h-9 bg-[#0066FF] border-l-2 border-white text-white font-black text-sm flex items-center justify-center transform -skew-x-8 p3r-shadow-blue font-p3r-head">
                    <span className="transform skew-x-8">{skill}</span>
                  </span>
                  {idx < skillOrder.priority.length - 1 && (
                    <span className="text-[#00E5FF] font-black text-sm font-mono">&gt;</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Primeros 3 niveles */}
          <div>
            <span className="text-[10px] text-[#7E9BB8] font-black uppercase tracking-wider block mb-1.5 font-p3r-head">
              Niveles 1, 2 y 3
            </span>
            <div className="flex items-center space-x-2 font-mono">
              {skillOrder.firstThreeLevels.map((skill, idx) => (
                <div key={idx} className="flex flex-col items-center">
                  <span className="text-[9px] text-[#4A627E] uppercase font-bold">Lvl {idx + 1}</span>
                  <span className="w-8 h-8 bg-[#030814] border border-[#16335F] text-[#00E5FF] font-bold text-xs flex items-center justify-center mt-0.5 p3r-cut-tr">
                    {skill}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {skillOrder.rationale && (
          <p className="mt-3.5 text-xs text-[#7E9BB8] italic bg-[#030814] p-3 border border-[#16335F] p3r-cut-tr">
            "{skillOrder.rationale}"
          </p>
        )}
      </div>
    </div>
  );
};
