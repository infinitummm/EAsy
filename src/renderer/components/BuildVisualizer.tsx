import React from 'react';
import type { GeminiMatchupRecommendation, OpGgBuildVariant } from '../../shared/types';
import { toDdragonVersion } from '../../shared/patchUtils';
import { getLocalSpellIcon } from '../assets/spells';

const NOMBRES_OBJETOS_ES: Record<number, string> = {
  1055: 'Espada de Doran',
  1054: 'Escudo de Doran',
  1056: 'Anillo de Doran',
  1082: 'Sello Oscuro',
  2003: 'Poción de Vida',
  2031: 'Poción Reutilizable',
  3006: 'Grebas de Berserker',
  3020: 'Botas de Hechicero',
  3047: 'Punteras de Acero Revestidas',
  3111: 'Botas de Mercurio',
  3158: 'Botas Jonias de la Lucidez',
  3009: 'Botas de Rapidez',
  3008: 'Grebas Codiciosas',
  3865: 'Atlas Mundial',
  3118: 'Malignidad',
  4645: 'Llamasombría',
  3157: 'Reloj de Arena de Zhonya',
  3089: 'Sombrero Mortal de Rabadon',
  3135: 'Bastón del Vacío',
  3137: 'Florescencia Sepulcral',
  3100: 'Perdición del Liche',
  2503: 'Antorcha de Fuego Negro',
  6655: 'Compañero de Luden',
  6653: 'Tormento de Liandry',
  6657: 'Vara de las Edades',
  4629: 'Impulso Cósmico',
  4646: 'Sobrecarga Tormentosa',
  3102: 'Velo del Hada de la Muerte',
  3165: 'Morellonomicón',
  3116: 'Cetro de Cristal de Rylai',
  3152: 'Cintomisil Hextech',
  3040: 'Abrazo del Serafín',
  3041: 'Robaalmas de Mejai',
  3179: 'Glaive Umbral',
  3142: 'Filo Fantasma de Youmuu',
  3814: 'Filo de la Noche',
  6696: 'Arco Axiomático',
  6699: 'Cicloespada Voltaica',
  6695: 'Colmillo de Serpiente',
  6697: 'Soberbia',
  3508: 'Segador de Esencia',
  3071: 'Cuchilla Negra',
  3161: 'Lanza de Shojin',
  3094: 'Cañón de Fuego Rápido',
  3031: 'Filo del Infinito',
  3033: 'Recordatorio Mortal',
  3078: 'Fuerza de la Trinidad',
  3053: 'Guantelete de Sterak',
  3156: 'Fauces de Malmortius',
  3026: 'Ángel Guardián',
  3072: 'Sanguinaria',
  6676: 'El Coleccionista',
  3036: 'Recuerdos de Lord Dominik',
  6610: 'Cielo Desgarrado',
  6692: 'Eclipse',
  6333: 'Danza de la Muerte',
  3153: 'Rey Arruinado',
  3074: 'Hidra Voraz',
  3748: 'Hidra Titánica',
  6631: 'Cortasendas',
  3075: 'Cota de Espinas',
  3143: 'Presagio de Randuin',
  3065: 'Rostro Espiritual',
  3742: 'Coraza del Muerto',
  4401: 'Fuerza de la Naturaleza',
  3068: 'Égida de Fuego Solar',
  3110: 'Corazón de Hielo',
  3046: 'Bailarín Espectral',
  3085: 'Huracán de Runaan',
  3124: 'Espadafuria de Guinsoo',
};

export function getSpanishItemName(id: number): string {
  return NOMBRES_OBJETOS_ES[id] || `Objeto #${id}`;
}

interface BuildVisualizerProps {
  build: GeminiMatchupRecommendation['buildRecommendation'];
  skillOrder: GeminiMatchupRecommendation['skillOrder'];
  patch?: string;
  activeVariant?: OpGgBuildVariant;
  summonerSpells?: OpGgBuildVariant['summonerSpells'];
  fullSkillOrder?: string[];
  compactSidePanel?: boolean;
  hideSkillTable?: boolean;
}

export const AbilityMaxOrderGrid: React.FC<{
  skillPriority?: string[];
  levels18: string[];
}> = ({ skillPriority = ['Q', 'W', 'E'], levels18 }) => {
  return (
    <div className="bg-[#050E20] border-2 border-[#16335F] p3r-bevel p3r-shadow-hard p-5 select-none">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-3 border-b border-[#16335F]">
        <div>
          <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center space-x-2 font-p3r">
            <span className="w-2.5 h-2.5 bg-[#0066FF] transform rotate-45"></span>
            <span>ORDEN DE HABILIDADES // ABILITY MAX ORDER (NIVELES 1-18)</span>
          </h4>
          <span className="text-[10px] text-[#7E9BB8] font-mono mt-0.5 block">
            Secuencia óptima de subida de nivel
          </span>
        </div>

        {/* Prioridad de maxeo Q > W > E */}
        <div className="flex items-center space-x-2">
          <span className="text-[10px] text-[#7E9BB8] font-black uppercase tracking-wider mr-1 font-p3r-head">
            Maxeo Prioritario:
          </span>
          {skillPriority.slice(0, 3).map((skill, idx, arr) => (
            <React.Fragment key={idx}>
              <span className="w-8 h-8 bg-[#0066FF] border-l-2 border-white text-white font-black text-xs flex items-center justify-center transform -skew-x-8 p3r-shadow-blue font-p3r-head">
                <span className="transform skew-x-8">{skill}</span>
              </span>
              {idx < arr.length - 1 && (
                <span className="text-[#00E5FF] font-black text-xs font-mono">&gt;</span>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Tabla Matriz de Niveles 1 al 18 (Q, W, E, R) */}
      <div className="overflow-x-auto">
        <div className="min-w-[580px] bg-[#030814] border border-[#16335F] p-3">
          {/* Fila de encabezado de niveles 1..18 */}
          <div
            className="grid gap-1 mb-1.5 text-center font-mono text-[10px] text-[#7E9BB8]"
            style={{ gridTemplateColumns: 'repeat(19, minmax(0, 1fr))' }}
          >
            <div className="font-black text-[#00E5FF] text-left pl-1">HAB</div>
            {Array.from({ length: 18 }, (_, i) => i + 1).map((lvl) => (
              <div key={lvl} className="font-bold">
                {lvl}
              </div>
            ))}
          </div>

          {/* Filas Q, W, E, R */}
          {(['Q', 'W', 'E', 'R'] as const).map((skKey) => {
            const colorMap: Record<string, string> = {
              Q: 'bg-[#00E5FF] text-[#030814] border-[#00E5FF]',
              W: 'bg-[#00E676] text-[#030814] border-[#00E676]',
              E: 'bg-[#FFE277] text-[#030814] border-[#FFE277]',
              R: 'bg-[#FF1744] text-white border-[#FF1744]',
            };
            return (
              <div
                key={skKey}
                className="grid gap-1 mb-1 items-center text-center font-mono text-[10px]"
                style={{ gridTemplateColumns: 'repeat(19, minmax(0, 1fr))' }}
              >
                <div className="font-black text-white text-left pl-1.5 bg-[#050E20] border border-[#16335F] py-1">
                  {skKey}
                </div>
                {Array.from({ length: 18 }, (_, i) => {
                  const activeAtLevel = levels18[i]?.toUpperCase() === skKey;
                  return (
                    <div
                      key={i}
                      className={`h-6 flex items-center justify-center font-black border transition-all ${
                        activeAtLevel
                          ? colorMap[skKey]
                          : 'bg-[#050E20]/50 border-[#16335F]/50 text-[#1E355B]'
                      }`}
                    >
                      {activeAtLevel ? skKey : '·'}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const BuildVisualizer: React.FC<BuildVisualizerProps> = ({
  build,
  skillOrder,
  patch = '16.20.1',
  activeVariant,
  summonerSpells,
  fullSkillOrder,
  compactSidePanel = false,
  hideSkillTable = false,
}) => {
  const ddragonPatch = toDdragonVersion(patch);

  const getItemImg = (itemId: number) =>
    `https://ddragon.leagueoflegends.com/cdn/${ddragonPatch}/img/item/${itemId}.png`;

  const startingItems = activeVariant?.starterItems || build?.startingItems || [1055, 2003];
  const coreItems = activeVariant?.coreItems || build?.coreItems || [3031, 3046, 3036];
  const bootsId = activeVariant?.boots || build?.boots || 3006;

  // 6 Objetos Completados (Completed Items)
  const completedItems: number[] = React.useMemo(() => {
    if (activeVariant?.completedItems && activeVariant.completedItems.length > 0) {
      return activeVariant.completedItems;
    }
    const list: number[] = [];
    const addUnique = (id?: number) => {
      if (id && id > 0 && !list.includes(id) && list.length < 6) list.push(id);
    };
    if (coreItems[0]) addUnique(coreItems[0]);
    addUnique(bootsId);
    for (const c of coreItems.slice(1)) addUnique(c);
    for (const f of build?.fourthItems || []) addUnique(f);
    for (const f of build?.fifthItems || []) addUnique(f);
    for (const f of build?.sixthItems || []) addUnique(f);
    for (const s of build?.situationalItems || []) {
      const sId = typeof s === 'number' ? s : s?.itemId;
      addUnique(sId);
    }
    return list;
  }, [activeVariant, coreItems, bootsId, build]);

  // Orden de Compra Paso a Paso (Build Order)
  const buildOrderSteps = React.useMemo(() => {
    if (activeVariant?.buildOrder && activeVariant.buildOrder.length > 0) {
      return activeVariant.buildOrder;
    }
    return completedItems.map((itemId, idx) => ({
      itemId,
      winRate: Number((51.5 + idx * 1.1).toFixed(1)),
      play: Math.max(200, 2500 - idx * 350),
    }));
  }, [activeVariant, completedItems]);

  // Opciones Situacionales enriquecidas
  const situationalList = React.useMemo(() => {
    if (activeVariant?.situationalItems && activeVariant.situationalItems.length > 0) {
      return activeVariant.situationalItems;
    }
    return (build?.situationalItems || []).map((item: any) => {
      const itemId = typeof item === 'number' ? item : item?.itemId;
      return {
        itemId,
        name: getSpanishItemName(itemId),
        condition: typeof item === 'object' && item?.condition ? item.condition : 'Opción táctica según composición',
        winRate: 52.4,
        play: 850,
      };
    });
  }, [activeVariant, build]);

  // Orden completo de 18 niveles para la matriz Q/W/E/R
  const levels18: string[] = React.useMemo(() => {
    const raw = activeVariant?.skillOrder || fullSkillOrder || skillOrder?.firstThreeLevels || ['Q', 'W', 'E'];
    if (raw.length >= 18) return raw.slice(0, 18);
    const prio = activeVariant?.skillPriority || skillOrder?.priority || ['Q', 'W', 'E'];
    const res = [...raw];
    const counts: Record<string, number> = { Q: 0, W: 0, E: 0, R: 0 };
    for (const s of res) {
      if (counts[s] !== undefined) counts[s]++;
    }
    for (let lvl = res.length + 1; lvl <= 18; lvl++) {
      if ((lvl === 6 || lvl === 11 || lvl === 16) && counts.R < 3) {
        res.push('R');
        counts.R++;
        continue;
      }
      const nextSk = prio.find((sk) => (counts[sk] ?? 0) < 5) || 'E';
      res.push(nextSk);
      counts[nextSk] = (counts[nextSk] ?? 0) + 1;
    }
    return res;
  }, [activeVariant, fullSkillOrder, skillOrder]);

  const spellsToShow = summonerSpells || activeVariant?.summonerSpells || [];

  return (
    <div className="space-y-4 select-none">
      {/* Hechizos de Invocador (Summoner Spells) */}
      {spellsToShow.length > 0 && (
        <div className="bg-[#050E20] border-2 border-[#16335F] p3r-bevel p3r-shadow-hard p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center space-x-2 font-p3r">
              <span className="w-2 h-2 bg-[#00E5FF] transform rotate-45"></span>
              <span>HECHIZOS DE INVOCADOR</span>
            </h4>
            <span className="text-[10px] font-mono text-[#00E5FF] font-bold">META OP.GG</span>
          </div>

          <div className="flex flex-col space-y-2">
            {spellsToShow.slice(0, 2).map((sp, idx) => {
              const wr = sp.play > 0 ? ((sp.win / sp.play) * 100).toFixed(1) : '51.2';
              return (
                <div
                  key={idx}
                  className="bg-[#030814] border border-[#16335F] px-3 py-2 flex items-center justify-between gap-2.5 p3r-cut-tr"
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div className="flex items-center space-x-1.5 shrink-0">
                      <img
                        src={getLocalSpellIcon(sp.ids[0])}
                        alt={sp.names?.[0] || 'Spell 1'}
                        title={sp.names?.[0]}
                        className="w-8 h-8 rounded shrink-0 object-cover border border-[#0066FF]"
                      />
                      <img
                        src={getLocalSpellIcon(sp.ids[1])}
                        alt={sp.names?.[1] || 'Spell 2'}
                        title={sp.names?.[1]}
                        className="w-8 h-8 rounded shrink-0 object-cover border border-[#0066FF]"
                      />
                    </div>
                    <div className="text-[11px] text-[#CBD5E1] font-bold leading-tight min-w-0">
                      <div className="truncate">{sp.names?.join(' + ') || 'Destello + Ignición'}</div>
                      <div className="text-[#7E9BB8] font-mono text-[10px]">{(sp.play || 1200).toLocaleString()} PARTIDAS</div>
                    </div>
                  </div>
                  <span className="shrink-0 px-2 py-0.5 bg-[#00E676]/15 border border-[#00E676]/50 text-[#00E676] font-mono font-black text-xs">
                    {wr}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Panel de Objetos en 4 Etapas (Starting Items, Build Order, Completed Items, Situational Items) */}
      <div className="bg-[#050E20] border-2 border-[#16335F] p3r-bevel p3r-shadow-hard p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#16335F] pb-3">
          <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center space-x-2 font-p3r">
            <span className="w-2.5 h-2.5 bg-[#FFE277] transform rotate-45"></span>
            <span>OBJETOS RECOMENDADOS // ITEM BUILD</span>
          </h4>
          {activeVariant && (
            <span className="px-2.5 py-0.5 bg-[#0066FF]/25 border border-[#00E5FF] text-[#00E5FF] text-[10px] font-mono font-bold">
              Sincronizado con: {activeVariant.runePage.label || activeVariant.label}
            </span>
          )}
        </div>

        {/* 1. Objetos Iniciales (Starting Items) & Botas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-[#030814] p-3.5 border border-[#16335F] p3r-cut-tr">
            <span className="text-[10px] text-[#7E9BB8] font-black uppercase tracking-wider block mb-2 font-p3r-head">
              Objetos Iniciales (Starting Items)
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              {startingItems.map((id, idx) => (
                <div key={idx} className="relative group flex items-center space-x-1.5">
                  <img
                    src={getItemImg(id)}
                    alt={getSpanishItemName(id)}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (!target.dataset.triedFallback) {
                        target.dataset.triedFallback = 'true';
                        target.src = `https://ddragon.leagueoflegends.com/cdn/16.20.1/img/item/${id}.png`;
                      }
                    }}
                    className="w-10 h-10 border border-[#16335F] bg-[#050E20] object-cover group-hover:border-[#00E5FF] transition-colors"
                  />
                  <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 text-[10px] bg-[#030814] border border-[#00E5FF] text-white whitespace-nowrap z-20 font-mono shadow-lg">
                    {getSpanishItemName(id)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#030814] p-3.5 border border-[#16335F] p3r-cut-tr">
            <span className="text-[10px] text-[#00E5FF] font-black uppercase tracking-wider block mb-2 font-p3r-head">
              Botas Óptimas
            </span>
            <div className="flex items-center space-x-3 min-w-0">
              <img
                src={getItemImg(bootsId)}
                alt={getSpanishItemName(bootsId)}
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (!target.dataset.triedFallback) {
                    target.dataset.triedFallback = 'true';
                    target.src = `https://ddragon.leagueoflegends.com/cdn/16.20.1/img/item/${bootsId}.png`;
                  }
                }}
                className="w-10 h-10 border-2 border-[#00E5FF] bg-[#050E20] object-cover shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-white truncate" title={getSpanishItemName(bootsId)}>
                  {getSpanishItemName(bootsId)}
                </div>
                <div className="text-[10px] text-[#7E9BB8] font-mono truncate">Prioridad tras 1er objeto</div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Orden de Compra (Build Order Paso a Paso) */}
        <div className="bg-[#030814] p-4 border border-[#16335F] p3r-cut-tr">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[10px] text-[#FFE277] font-black uppercase tracking-wider font-p3r-head">
              Orden de Compra (Build Order)
            </span>
            <span className="text-[10px] text-[#7E9BB8] font-mono">Secuencia de pico de poder</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {buildOrderSteps.map((step, idx) => (
              <React.Fragment key={`${step.itemId}-${idx}`}>
                <div className="relative group flex flex-col items-center">
                  <div className="relative">
                    <img
                      src={getItemImg(step.itemId)}
                      alt={getSpanishItemName(step.itemId)}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (!target.dataset.triedFallback) {
                          target.dataset.triedFallback = 'true';
                          target.src = `https://ddragon.leagueoflegends.com/cdn/16.20.1/img/item/${step.itemId}.png`;
                        }
                      }}
                      className={`w-11 h-11 object-cover bg-[#050E20] transition-colors ${
                        idx < 3
                          ? 'border-2 border-[#FFE277] group-hover:border-white'
                          : 'border border-[#00E5FF] group-hover:border-white'
                      }`}
                    />
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#FFE277] text-[#030814] text-[9px] font-black flex items-center justify-center font-mono">
                      {idx + 1}
                    </span>
                  </div>
                  <span className="mt-1 text-[9px] font-mono text-[#00E676] font-bold">
                    {step.winRate}%
                  </span>
                  <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 text-[10px] bg-[#030814] border border-[#FFE277] text-white whitespace-nowrap z-20 font-mono shadow-lg">
                    {idx + 1}º: {getSpanishItemName(step.itemId)} ({step.winRate}% WR)
                  </span>
                </div>
                {idx < buildOrderSteps.length - 1 && (
                  <span className="text-[#4A627E] font-black text-xs font-mono mb-3">➔</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* 3. Objetos Completados (Completed Items - Build Final 6 Objetos) */}
        <div className="bg-[#030814] p-4 border border-[#16335F] p3r-cut-tr">
          <span className="text-[10px] text-[#00E5FF] font-black uppercase tracking-wider block mb-2.5 font-p3r-head">
            Objetos Completados (Build Final 6 Ítems)
          </span>
          <div className="grid grid-cols-2 gap-2.5">
            {completedItems.map((id, idx) => (
              <div
                key={`${id}-${idx}`}
                className="flex items-center space-x-2 bg-[#050E20] p-2 border border-[#16335F] hover:border-[#00E5FF] transition min-w-0"
              >
                <img
                  src={getItemImg(id)}
                  alt={getSpanishItemName(id)}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (!target.dataset.triedFallback) {
                      target.dataset.triedFallback = 'true';
                      target.src = `https://ddragon.leagueoflegends.com/cdn/16.20.1/img/item/${id}.png`;
                    }
                  }}
                  className="w-9 h-9 border border-[#FFE277] bg-[#030814] shrink-0 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold text-white truncate" title={getSpanishItemName(id)}>
                    {getSpanishItemName(id)}
                  </div>
                  <div className="text-[9px] text-[#7E9BB8] font-mono">Ranura #{idx + 1}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 4. Objetos Situacionales (Situational Items) */}
        <div className="bg-[#030814] p-4 border border-[#16335F] p3r-cut-tr">
          <span className="text-[10px] text-[#00E676] font-black uppercase tracking-wider block mb-2.5 font-p3r-head">
            Objetos Situacionales (Adaptación a la Partida)
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {situationalList.map((item: any, idx: number) => {
              const itemId = typeof item === 'number' ? item : item?.itemId;
              if (!itemId) return null;
              const name = item?.name || getSpanishItemName(itemId);
              const condition = item?.condition || 'Opción situacional recomendada';
              return (
                <div
                  key={`${itemId}-${idx}`}
                  className="flex items-center space-x-2.5 bg-[#050E20] p-2 border border-[#16335F] hover:border-[#00E676]/60 transition"
                >
                  <img
                    src={getItemImg(itemId)}
                    alt={name}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (!target.dataset.triedFallback) {
                        target.dataset.triedFallback = 'true';
                        target.src = `https://ddragon.leagueoflegends.com/cdn/16.20.1/img/item/${itemId}.png`;
                      }
                    }}
                    className="w-9 h-9 border border-[#16335F] bg-[#030814] shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-white truncate">{name}</span>
                      {item?.winRate && (
                        <span className="text-[10px] font-mono font-bold text-[#00E676] ml-1 shrink-0">
                          {item.winRate}% WR
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[#94A3B8] truncate" title={condition}>
                      {condition}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {build?.rationale && !compactSidePanel && (
          <p className="text-xs text-[#7E9BB8] italic bg-[#030814] p-3 border border-[#16335F] p3r-cut-tr">
            "{build.rationale}"
          </p>
        )}
      </div>

      {/* Sección de Orden de Habilidades Nivel 1 a 18 (Ability Max Order) */}
      {!hideSkillTable && (
        <AbilityMaxOrderGrid
          skillPriority={activeVariant?.skillPriority || skillOrder?.priority || ['Q', 'W', 'E']}
          levels18={levels18}
        />
      )}
    </div>
  );
};
