import React from 'react';
import {
  RUNE_TREES,
  STAT_SHARDS_ROWS,
  getRuneTreeById,
  getRuneIconUrl,
  getRuneName,
  DDRAGON_IMG_BASE,
} from '../../shared/runesData';
import type { OpGgRunePage } from '../../shared/types';

interface InteractiveRuneTreeProps {
  /** Lista de páginas de runas recomendadas para elegir en las tarjetas superiores */
  runeOptions: OpGgRunePage[];
  /** Índice de la página de runas seleccionada actualmente */
  selectedOptionIndex: number;
  /** Callback al seleccionar una de las tarjetas de páginas de runas (cambia también la build) */
  onSelectRuneOption: (index: number) => void;
  /** Estilo primario actual */
  primaryStyleId: number;
  /** Estilo secundario actual */
  subStyleId: number;
  /** Los 9 IDs de perks activos: [keystone, slot1, slot2, slot3, sec1, sec2, shard1, shard2, shard3] */
  selectedPerkIds: number[];
  /** Callback cuando el usuario personaliza manualmente una runa o fragmento individual */
  onCustomPerksChange?: (newPrimaryStyle: number, newSubStyle: number, newPerkIds: number[]) => void;
}

export const InteractiveRuneTree: React.FC<InteractiveRuneTreeProps> = ({
  runeOptions,
  selectedOptionIndex,
  onSelectRuneOption,
  primaryStyleId,
  subStyleId,
  selectedPerkIds,
  onCustomPerksChange,
}) => {
  const primaryTree = getRuneTreeById(primaryStyleId);
  const secondaryTree = getRuneTreeById(
    subStyleId !== primaryStyleId ? subStyleId : RUNE_TREES.find((t) => t.id !== primaryStyleId)?.id || 8200
  );

  const primaryPerks = selectedPerkIds.slice(0, 4);
  const secondaryPerks = selectedPerkIds.slice(4, 6);
  const statShards = selectedPerkIds.slice(6, 9);

  // Cambiar rama primaria manualmente
  const handleSelectPrimaryTree = (newStyleId: number) => {
    if (!onCustomPerksChange || newStyleId === primaryStyleId) return;
    const newTree = getRuneTreeById(newStyleId);
    const defaultPrimary = newTree.slots.map((slot) => slot[0]?.id || 0);
    let nextSubId = subStyleId;
    let nextSecPerks = [...secondaryPerks];
    if (nextSubId === newStyleId) {
      const fallbackSec = RUNE_TREES.find((t) => t.id !== newStyleId) || RUNE_TREES[1];
      nextSubId = fallbackSec.id;
      nextSecPerks = [fallbackSec.slots[1]?.[0]?.id || 0, fallbackSec.slots[2]?.[0]?.id || 0];
    }
    onCustomPerksChange(newStyleId, nextSubId, [...defaultPrimary, ...nextSecPerks, ...statShards]);
  };

  // Cambiar rama secundaria manualmente
  const handleSelectSecondaryTree = (newSubId: number) => {
    if (!onCustomPerksChange || newSubId === primaryStyleId || newSubId === subStyleId) return;
    const newSecTree = getRuneTreeById(newSubId);
    const nextSecPerks = [newSecTree.slots[1]?.[0]?.id || 0, newSecTree.slots[2]?.[0]?.id || 0];
    onCustomPerksChange(primaryStyleId, newSubId, [...primaryPerks, ...nextSecPerks, ...statShards]);
  };

  // Cambiar una runa dentro de una fila primaria (0 = Keystone, 1..3 = filas menores)
  const handleSelectPrimaryRune = (slotIdx: number, runeId: number) => {
    if (!onCustomPerksChange) return;
    const nextPrimary = [...primaryPerks];
    nextPrimary[slotIdx] = runeId;
    onCustomPerksChange(primaryStyleId, secondaryTree.id, [...nextPrimary, ...secondaryPerks, ...statShards]);
  };

  // Cambiar una runa dentro de las 3 filas secundarias (slots 1, 2, 3 del árbol secundario)
  const handleSelectSecondaryRune = (slotIdx: number, runeId: number) => {
    if (!onCustomPerksChange) return;
    if (secondaryPerks.includes(runeId)) return;

    // Determinar a qué fila pertenece cada una de las 2 runas secundarias actuales
    const findSlotOfRune = (rId: number) => {
      for (let s = 1; s <= 3; s++) {
        if (secondaryTree.slots[s]?.some((r) => r.id === rId)) return s;
      }
      return -1;
    };

    const nextSec = [...secondaryPerks];
    const existingInSameSlotIdx = nextSec.findIndex((id) => findSlotOfRune(id) === slotIdx);

    if (existingInSameSlotIdx !== -1) {
      // Si ya había una runa seleccionada en esta misma fila, reemplazarla
      nextSec[existingInSameSlotIdx] = runeId;
    } else {
      // Reemplazar la segunda opción y mantener la primera
      nextSec[0] = nextSec[1] || nextSec[0];
      nextSec[1] = runeId;
    }

    onCustomPerksChange(primaryStyleId, secondaryTree.id, [...primaryPerks, ...nextSec, ...statShards]);
  };

  // Cambiar un fragmento de estadística (fila 0, 1 o 2)
  const handleSelectShard = (rowIdx: number, shardId: number) => {
    if (!onCustomPerksChange) return;
    const nextShards = [
      statShards[0] || 5008,
      statShards[1] || 5008,
      statShards[2] || 5001,
    ];
    nextShards[rowIdx] = shardId;
    onCustomPerksChange(primaryStyleId, secondaryTree.id, [...primaryPerks, ...secondaryPerks, ...nextShards]);
  };

  return (
    <div className="space-y-4 select-none">
      {/* Tarjetas Superiores de Elección de Runas (Al cambiar, actualiza también la Build) */}
      {runeOptions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {runeOptions.slice(0, 2).map((opt, idx) => {
            const isSelected = idx === selectedOptionIndex;
            const keystoneId = opt.primaryRuneIds?.[0] || opt.id || 8005;
            const wr = opt.play > 0 ? ((opt.win / opt.play) * 100).toFixed(1) : '51.5';
            const treeDef = getRuneTreeById(opt.primaryPageId);

            return (
              <button
                key={`${opt.primaryPageId}-${keystoneId}-${idx}`}
                type="button"
                onClick={() => onSelectRuneOption(idx)}
                className={`group relative flex items-center justify-between p-3 border-2 transition-all cursor-pointer text-left p3r-cut-tr ${
                  isSelected
                    ? 'bg-[#081936] border-[#00E5FF] shadow-[0_0_15px_rgba(0,229,255,0.22)]'
                    : 'bg-[#030814] border-[#16335F] hover:border-[#0066FF] hover:bg-[#061126]'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="relative flex items-center shrink-0">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center border-2 bg-[#050E20] overflow-hidden shrink-0"
                      style={{ borderColor: isSelected ? '#00E5FF' : treeDef.color }}
                    >
                      <img
                        src={getRuneIconUrl(keystoneId)}
                        alt={getRuneName(keystoneId)}
                        className="w-8 h-8 object-contain shrink-0"
                      />
                    </div>
                    <div className="w-5 h-5 rounded-full bg-[#030814] border border-[#16335F] flex items-center justify-center -ml-2.5 mt-4 shadow-md shrink-0">
                      <img
                        src={getRuneIconUrl(opt.secondaryPageId)}
                        alt={opt.secondaryPageName}
                        className="w-3.5 h-3.5 object-contain shrink-0"
                      />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-black text-white group-hover:text-[#00E5FF] transition font-p3r-head truncate">
                      {getRuneName(keystoneId)}
                    </div>
                    <div className="text-[10px] text-[#7E9BB8] font-mono">
                      {(opt.play || 1000).toLocaleString()} PARTIDAS
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 ml-2">
                  <span
                    className={`text-sm font-black font-mono block ${
                      Number(wr) >= 52 ? 'text-[#00E676]' : 'text-[#00E5FF]'
                    }`}
                  >
                    {wr}%
                  </span>
                  <span className="text-[9px] uppercase font-bold tracking-wider text-[#7E9BB8] block">
                    {isSelected ? 'ACTIVA' : 'ELEGIR'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Árbol Completo de Runas: Primaria (Izquierda) y Secundaria + Fragmentos (Derecha) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 bg-[#030814] border border-[#16335F] p-4 p3r-cut-tr">
        {/* COLUMNA IZQUIERDA: RAMA PRIMARIA */}
        <div className="bg-[#050E20]/80 border border-[#16335F] p-4 flex flex-col justify-between space-y-4">
          {/* Selector de las 5 Ramas Primarias */}
          <div>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#16335F]">
              <span
                className="text-xs font-black uppercase tracking-wider font-p3r-head truncate"
                style={{ color: primaryTree.color }}
              >
                {primaryTree.name}
              </span>
              <span className="text-[10px] text-[#7E9BB8] font-mono shrink-0">
                Rama Primaria
              </span>
            </div>

            <div className="flex items-center justify-around bg-[#030814] py-2 px-2 border border-[#16335F]">
              {RUNE_TREES.map((tree) => {
                const active = tree.id === primaryTree.id;
                return (
                  <button
                    key={tree.id}
                    type="button"
                    onClick={() => handleSelectPrimaryTree(tree.id)}
                    title={`Rama ${tree.name}`}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                      active
                        ? 'scale-110 border-2 bg-[#081936] shadow-[0_0_12px_rgba(0,229,255,0.35)]'
                        : 'opacity-40 grayscale hover:opacity-80 hover:grayscale-0'
                    }`}
                    style={active ? { borderColor: tree.color } : undefined}
                  >
                    <img
                      src={`${DDRAGON_IMG_BASE}${tree.icon}`}
                      alt={tree.name}
                      className="w-5 h-5 object-contain"
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fila 0: Runas Clave (Keystones) */}
          <div className="py-2.5 px-2 bg-[#030814]/70 border border-[#16335F]/80">
            <div className="flex items-center justify-around">
              {(primaryTree.slots[0] || []).map((keystone) => {
                const isSelected = primaryPerks[0] === keystone.id;
                return (
                  <button
                    key={keystone.id}
                    type="button"
                    onClick={() => handleSelectPrimaryRune(0, keystone.id)}
                    title={`${keystone.name}: ${keystone.shortDesc}`}
                    className="group relative flex flex-col items-center cursor-pointer focus:outline-none"
                  >
                    <div
                      className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-150 shrink-0 ${
                        isSelected
                          ? 'scale-110 border-2 bg-[#081936] shadow-[0_0_18px_rgba(255,255,255,0.28)]'
                          : 'opacity-30 grayscale hover:opacity-85 hover:grayscale-0 border border-transparent'
                      }`}
                      style={
                        isSelected
                          ? {
                              borderColor: primaryTree.color,
                              boxShadow: `0 0 16px ${primaryTree.color}66`,
                            }
                          : undefined
                      }
                    >
                      <img
                        src={`${DDRAGON_IMG_BASE}${keystone.icon}`}
                        alt={keystone.name}
                        className="w-8 h-8 sm:w-9 sm:h-9 object-contain"
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filas 1, 2 y 3: Runas Menores Primarias */}
          <div className="space-y-3.5">
            {[1, 2, 3].map((slotIdx) => {
              const slotRunes = primaryTree.slots[slotIdx] || [];
              return (
                <div key={slotIdx} className="flex items-center justify-around py-1">
                  {slotRunes.map((rune) => {
                    const isSelected = primaryPerks[slotIdx] === rune.id || primaryPerks.includes(rune.id);
                    return (
                      <button
                        key={rune.id}
                        type="button"
                        onClick={() => handleSelectPrimaryRune(slotIdx, rune.id)}
                        title={`${rune.name}: ${rune.shortDesc}`}
                        className="group relative flex flex-col items-center cursor-pointer focus:outline-none"
                      >
                        <div
                          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all duration-150 shrink-0 ${
                            isSelected
                              ? 'scale-110 border-2 bg-[#081936]'
                              : 'opacity-30 grayscale hover:opacity-85 hover:grayscale-0 border border-[#16335F]'
                          }`}
                          style={
                            isSelected
                              ? {
                                  borderColor: primaryTree.color,
                                  boxShadow: `0 0 12px ${primaryTree.color}55`,
                                }
                              : undefined
                          }
                        >
                          <img
                            src={`${DDRAGON_IMG_BASE}${rune.icon}`}
                            alt={rune.name}
                            className="w-6 h-6 sm:w-7 sm:h-7 object-contain rounded-full"
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* COLUMNA DERECHA: RAMA SECUNDARIA + FRAGMENTOS (STAT SHARDS) */}
        <div className="bg-[#050E20]/80 border border-[#16335F] p-4 flex flex-col justify-between space-y-4">
          {/* Selector de Rama Secundaria */}
          <div>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#16335F]">
              <span
                className="text-xs font-black uppercase tracking-wider font-p3r-head truncate"
                style={{ color: secondaryTree.color }}
              >
                {secondaryTree.name}
              </span>
              <span className="text-[10px] text-[#7E9BB8] font-mono shrink-0">
                Rama Secundaria
              </span>
            </div>

            <div className="flex items-center justify-around bg-[#030814] py-2 px-2 border border-[#16335F]">
              {RUNE_TREES.filter((t) => t.id !== primaryTree.id).map((tree) => {
                const active = tree.id === secondaryTree.id;
                return (
                  <button
                    key={tree.id}
                    type="button"
                    onClick={() => handleSelectSecondaryTree(tree.id)}
                    title={`Secundaria: ${tree.name}`}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                      active
                        ? 'scale-110 border-2 bg-[#081936]'
                        : 'opacity-40 grayscale hover:opacity-80 hover:grayscale-0'
                    }`}
                    style={active ? { borderColor: tree.color } : undefined}
                  >
                    <img
                      src={`${DDRAGON_IMG_BASE}${tree.icon}`}
                      alt={tree.name}
                      className="w-5 h-5 object-contain"
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filas 1, 2 y 3 de la Rama Secundaria */}
          <div className="space-y-3">
            {[1, 2, 3].map((slotIdx) => {
              const slotRunes = secondaryTree.slots[slotIdx] || [];
              return (
                <div key={slotIdx} className="flex items-center justify-around">
                  {slotRunes.map((rune) => {
                    const isSelected = secondaryPerks.includes(rune.id);
                    return (
                      <button
                        key={rune.id}
                        type="button"
                        onClick={() => handleSelectSecondaryRune(slotIdx, rune.id)}
                        title={`${rune.name}: ${rune.shortDesc}`}
                        className="group relative flex flex-col items-center cursor-pointer focus:outline-none"
                      >
                        <div
                          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all duration-150 shrink-0 ${
                            isSelected
                              ? 'scale-110 border-2 bg-[#081936]'
                              : 'opacity-30 grayscale hover:opacity-85 hover:grayscale-0 border border-[#16335F]'
                          }`}
                          style={
                            isSelected
                              ? {
                                  borderColor: secondaryTree.color,
                                  boxShadow: `0 0 12px ${secondaryTree.color}55`,
                                }
                              : undefined
                          }
                        >
                          <img
                            src={`${DDRAGON_IMG_BASE}${rune.icon}`}
                            alt={rune.name}
                            className="w-6 h-6 sm:w-7 sm:h-7 object-contain rounded-full"
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Separador y 3 Filas de Fragmentos de Estadísticas (Stat Shards) */}
          <div className="pt-3 border-t border-[#16335F] space-y-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-[#7E9BB8] block font-p3r-head">
              Fragmentos de Estadísticas (Shards)
            </span>
            <div className="space-y-2 bg-[#030814] p-2.5 border border-[#16335F]">
              {STAT_SHARDS_ROWS.map((row, rowIdx) => {
                const selectedShardId = statShards[rowIdx] || row[0].id;
                return (
                  <div key={rowIdx} className="flex items-center justify-around">
                    {row.map((shard) => {
                      const active = selectedShardId === shard.id;
                      return (
                        <button
                          key={`${rowIdx}-${shard.id}`}
                          type="button"
                          onClick={() => handleSelectShard(rowIdx, shard.id)}
                          title={shard.name}
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                            active
                              ? 'border-2 border-[#FFE277] bg-[#081936] shadow-[0_0_10px_rgba(255,226,119,0.4)] scale-110'
                              : 'opacity-30 grayscale hover:opacity-75 border border-[#16335F]'
                          }`}
                        >
                          <img
                            src={`${DDRAGON_IMG_BASE}${shard.icon}`}
                            alt={shard.name}
                            className="w-4 h-4 sm:w-5 sm:h-5 object-contain"
                          />
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Barra Informativa de Runas Activas (Sin texto encimado en los círculos) */}
      <div className="bg-[#030814] p-3 border border-[#16335F] text-[11px] text-[#CBD5E1] flex flex-wrap items-center justify-between gap-2 p3r-cut-tr">
        <div className="flex items-center space-x-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: primaryTree.color }} />
          <span className="font-bold text-white font-mono truncate">
            {primaryPerks.map((p) => getRuneName(p)).filter(Boolean).join(' • ')}
          </span>
        </div>
        <div className="flex items-center space-x-2 text-[#7E9BB8] font-mono text-[10px] shrink-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: secondaryTree.color }} />
          <span>+ {secondaryPerks.map((p) => getRuneName(p)).filter(Boolean).join(' • ')}</span>
        </div>
      </div>
    </div>
  );
};
