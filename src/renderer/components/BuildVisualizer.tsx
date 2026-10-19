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
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 backdrop-blur-sm">
        <h4 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider mb-4 flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-amber-400"></span>
          <span>Ruta Óptima de Objetos</span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Iniciales */}
          <div className="bg-neutral-950/50 p-3.5 rounded-lg border border-neutral-800/80">
            <span className="text-xs text-neutral-400 font-medium block mb-2">Inicio de Partida</span>
            <div className="flex flex-wrap gap-2">
              {build.startingItems.map((id, idx) => (
                <div key={idx} className="relative group">
                  <img
                    src={getItemImg(id)}
                    alt={`Ítem ${id}`}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                    className="w-11 h-11 rounded-lg border border-neutral-700 bg-neutral-900 object-cover shadow-sm group-hover:border-amber-400 transition-colors"
                  />
                  <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 text-[10px] bg-neutral-950 border border-neutral-700 rounded text-neutral-200 whitespace-nowrap z-10">
                    ID: {id}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Core Items */}
          <div className="bg-neutral-950/50 p-3.5 rounded-lg border border-neutral-800/80">
            <span className="text-xs text-amber-400/90 font-medium block mb-2">Objetos Centrales (Core)</span>
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
                      className="w-11 h-11 rounded-lg border border-amber-500/40 bg-neutral-900 object-cover shadow-sm group-hover:border-amber-400 transition-colors"
                    />
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-500 text-neutral-950 text-[10px] font-bold rounded-full flex items-center justify-center">
                      {idx + 1}
                    </span>
                  </div>
                  <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 text-[10px] bg-neutral-950 border border-neutral-700 rounded text-neutral-200 whitespace-nowrap z-10">
                    ID: {id}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Situacionales */}
          <div className="bg-neutral-950/50 p-3.5 rounded-lg border border-neutral-800/80">
            <span className="text-xs text-indigo-400/90 font-medium block mb-2">Opciones Situacionales</span>
            <div className="flex flex-col space-y-2">
              {build.situationalItems.map((item, idx) => (
                <div key={idx} className="flex items-center space-x-2.5">
                  <img
                    src={getItemImg(item.itemId)}
                    alt={`Situacional ${item.itemId}`}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                    className="w-8 h-8 rounded border border-neutral-700 bg-neutral-900 shrink-0"
                  />
                  <span className="text-xs text-neutral-300 leading-tight">
                    {item.condition}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {build.rationale && (
          <p className="mt-3 text-xs text-neutral-400 italic bg-neutral-950/30 p-2.5 rounded border border-neutral-800/50">
            "{build.rationale}"
          </p>
        )}
      </div>

      {/* Sección de Orden de Habilidades */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 backdrop-blur-sm">
        <h4 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider mb-4 flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
          <span>Orden de Subida de Habilidades</span>
        </h4>

        <div className="flex flex-wrap items-center gap-6">
          {/* Prioridad de maxeo */}
          <div>
            <span className="text-xs text-neutral-400 font-medium block mb-1.5">Prioridad Principal</span>
            <div className="flex items-center space-x-1.5">
              {skillOrder.priority.map((skill, idx) => (
                <React.Fragment key={idx}>
                  <span className="w-8 h-8 rounded-lg bg-neutral-800 border border-cyan-500/40 text-cyan-300 font-bold text-sm flex items-center justify-center shadow-sm">
                    {skill}
                  </span>
                  {idx < skillOrder.priority.length - 1 && (
                    <span className="text-neutral-500 font-bold">&gt;</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Primeros 3 niveles */}
          <div>
            <span className="text-xs text-neutral-400 font-medium block mb-1.5">Niveles 1, 2 y 3</span>
            <div className="flex items-center space-x-2">
              {skillOrder.firstThreeLevels.map((skill, idx) => (
                <div key={idx} className="flex flex-col items-center">
                  <span className="text-[10px] text-neutral-400">Lvl {idx + 1}</span>
                  <span className="w-7 h-7 rounded bg-neutral-800 border border-neutral-700 text-neutral-200 font-semibold text-xs flex items-center justify-center mt-0.5">
                    {skill}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {skillOrder.rationale && (
          <p className="mt-3 text-xs text-neutral-400 italic bg-neutral-950/30 p-2.5 rounded border border-neutral-800/50">
            "{skillOrder.rationale}"
          </p>
        )}
      </div>
    </div>
  );
};
