import React, { useState, useEffect, useMemo } from 'react';
import type {
  OverlayState,
  DatosModoCampeon,
  AugmentInfo,
  RarityAugment,
  TierBadge,
  TipoModo,
} from '@shared/types';
import { ALL_CHAMPIONS, getChampionById } from '@shared/champions';

const getApi = () => (typeof window !== 'undefined' ? (window.api || window.electronAPI) : undefined);

/**
 * Escudo de Tier con colores e insignias específicas para cada categoría.
 */
function TierShield({ tier }: { tier: TierBadge }) {
  const config = useMemo(() => {
    switch (tier) {
      case 'S+':
        return {
          bg: 'bg-gradient-to-b from-yellow-300 via-amber-400 to-amber-600',
          border: 'border-yellow-200',
          text: 'text-gray-950 font-black',
          glow: 'shadow-[0_0_10px_rgba(251,191,36,0.6)]',
        };
      case 'S':
        return {
          bg: 'bg-gradient-to-b from-amber-400 to-amber-600',
          border: 'border-amber-300',
          text: 'text-gray-950 font-black',
          glow: 'shadow-[0_0_8px_rgba(245,158,11,0.5)]',
        };
      case 'A':
        return {
          bg: 'bg-gradient-to-b from-blue-400 to-blue-600',
          border: 'border-blue-300',
          text: 'text-white font-extrabold',
          glow: 'shadow-[0_0_8px_rgba(59,130,246,0.4)]',
        };
      case 'B':
        return {
          bg: 'bg-gradient-to-b from-emerald-400 to-emerald-600',
          border: 'border-emerald-300',
          text: 'text-white font-extrabold',
          glow: 'shadow-[0_0_6px_rgba(16,185,129,0.3)]',
        };
      case 'C':
        return {
          bg: 'bg-gradient-to-b from-amber-700 to-orange-800',
          border: 'border-amber-600',
          text: 'text-white font-bold',
          glow: '',
        };
      case 'D':
      default:
        return {
          bg: 'bg-gradient-to-b from-slate-600 to-slate-800',
          border: 'border-slate-500',
          text: 'text-slate-300 font-bold',
          glow: '',
        };
    }
  }, [tier]);

  return (
    <div
      className={`relative w-8 h-9 flex items-center justify-center rounded-b-md border ${config.bg} ${config.border} ${config.glow} clip-shield`}
      style={{
        clipPath: 'polygon(0% 0%, 100% 0%, 100% 75%, 50% 100%, 0% 75%)',
      }}
      title={`Tier ${tier}`}
    >
      <span className={`text-xs tracking-tighter ${config.text}`}>{tier}</span>
    </div>
  );
}

/**
 * Insignia de rareza (Plata, Oro, Prismático).
 */
function RarityTag({ rarity }: { rarity: RarityAugment }) {
  const info = {
    silver: { label: 'PLATA', color: 'text-slate-300 border-slate-500/50 bg-slate-800/40' },
    gold: { label: 'ORO', color: 'text-amber-300 border-amber-500/50 bg-amber-950/40' },
    prismatic: { label: 'PRISMÁTICO', color: 'text-fuchsia-300 border-fuchsia-500/50 bg-fuchsia-950/40' },
  }[rarity] || { label: 'MEJORA', color: 'text-cyan-300 border-cyan-500/50 bg-cyan-950/40' };

  return (
    <span
      className={`text-[9px] uppercase px-1.5 py-0.5 rounded border tracking-wider font-mono font-semibold ${info.color}`}
    >
      {info.label}
    </span>
  );
}

export function OverlayApp() {
  const [state, setState] = useState<OverlayState>({
    visible: true,
    isBorderless: true,
    gameMode: 'arena',
    championId: 266, // Aatrox por defecto para vista inicial
    championName: 'Aatrox',
    data: null,
    activeAugments: [],
  });

  const [manualChampionId, setManualChampionId] = useState<number | null>(null);
  const [showChampSearch, setShowChampSearch] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedRarity, setSelectedRarity] = useState<'all' | RarityAugment>('all');
  const [minimized, setMinimized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [borderlessApplying, setBorderlessApplying] = useState(false);

  // Escuchar estado en vivo desde el proceso principal
  useEffect(() => {
    const api = getApi();
    if (api?.overlayGetState) {
      api.overlayGetState().then((s: OverlayState) => {
        if (s) setState(s);
      });
    }

    if (api?.onOverlayStateChanged) {
      const unsub = api.onOverlayStateChanged((newState: OverlayState) => {
        setState(newState);
      });
      return () => {
        unsub();
      };
    }
  }, []);

  const activeChampionId = manualChampionId ?? (state.championId && state.championId > 0 ? state.championId : 266);

  // Cargar datos de mejoras del campeón
  useEffect(() => {
    if (activeChampionId > 0) {
      setLoading(true);
      const api = getApi();
      const modoConsulta: TipoModo =
        state.gameMode === 'arena' || state.gameMode === 'aram_mayhem'
          ? state.gameMode
          : 'arena';

      if (api?.getChampionAugments) {
        api
          .getChampionAugments({
            championId: activeChampionId,
            mode: modoConsulta,
          })
          .then((data: DatosModoCampeon) => {
            if (data) {
              setState((prev) => ({ ...prev, data }));
            }
          })
          .catch((err: any) => console.error('Error cargando augments:', err))
          .finally(() => setLoading(false));
      }
    }
  }, [activeChampionId, state.gameMode]);

  const champion = useMemo(() => {
    return activeChampionId ? getChampionById(activeChampionId) : null;
  }, [activeChampionId]);

  // Lista de campeones filtrados por la búsqueda manual
  const championsFiltrados = useMemo(() => {
    if (!searchQuery.trim()) return ALL_CHAMPIONS.slice(0, 10);
    const q = searchQuery.toLowerCase().trim();
    return ALL_CHAMPIONS.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 10);
  }, [searchQuery]);

  // Lista de augments filtrados por rareza
  const augmentsFiltrados = useMemo(() => {
    const lista = state.data?.augments || [];
    if (selectedRarity === 'all') return lista;
    return lista.filter((a) => a.rarity === selectedRarity);
  }, [state.data, selectedRarity]);

  // Identificar el mejor augment absoluto del filtro activo
  const bestAugmentId = useMemo(() => {
    if (augmentsFiltrados.length === 0) return null;
    const tierOrder: Record<TierBadge, number> = {
      'S+': 0,
      'S': 1,
      'A': 2,
      'B': 3,
      'C': 4,
      'D': 5,
    };
    const sorted = [...augmentsFiltrados].sort((a, b) => {
      const tDiff = (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9);
      if (tDiff !== 0) return tDiff;
      return (b.pickRate || 0) - (a.pickRate || 0);
    });
    return sorted[0]?.id;
  }, [augmentsFiltrados]);

  // Modo legible
  const modeLabel = useMemo(() => {
    if (state.gameMode === 'arena') return 'ARENA';
    if (state.gameMode === 'aram_mayhem') return 'ARAM CAOS';
    if (state.gameMode === 'aram') return 'ARAM';
    if (state.gameMode === 'normal') return 'NORMAL';
    if (state.gameMode === 'ranked') return 'RANKED';
    return 'EN PARTIDA';
  }, [state.gameMode]);

  const handleApplyBorderless = async () => {
    const api = getApi();
    if (!api?.applyBorderless) return;
    setBorderlessApplying(true);
    try {
      const res = await api.applyBorderless();
      if (res && res.success) {
        setState((prev) => ({ ...prev, isBorderless: true }));
      }
    } finally {
      setBorderlessApplying(false);
    }
  };

  return (
    <div
      className="w-full h-full p-2 select-none font-sans text-gray-100 flex flex-col justify-start"
      onMouseEnter={() => {
        const api = getApi();
        if (api?.setIgnoreMouseEvents) {
          api.setIgnoreMouseEvents(false);
        }
      }}
      onMouseLeave={() => {
        const api = getApi();
        if (api?.setIgnoreMouseEvents) {
          api.setIgnoreMouseEvents(true, { forward: true });
        }
      }}
    >
      {/* Contenedor Principal Estilo Persona 3 Reload / Blitz */}
      <div className="w-[390px] bg-[#050b14]/95 border-2 border-cyan-500/60 rounded shadow-2xl backdrop-blur-md flex flex-col overflow-hidden text-sm relative">
        {/* Línea decorativa diagonal P3R */}
        <div className="absolute -top-6 -right-6 w-20 h-20 bg-cyan-500/10 rotate-45 pointer-events-none" />

        {/* Cabecera del Campeón */}
        <div className="p-3 bg-gradient-to-r from-[#071326] via-[#091b36] to-[#040812] border-b border-cyan-500/40 flex items-center justify-between relative">
          <div className="flex items-center gap-3">
            {/* Avatar del Campeón */}
            <div className="relative w-12 h-12 rounded border-2 border-cyan-400/80 overflow-hidden shadow-[0_0_8px_rgba(6,182,212,0.4)] bg-gray-900 flex-shrink-0">
              <img
                src={
                  champion
                    ? `https://ddragon.leagueoflegends.com/cdn/img/champion/tiles/${champion.key}_0.jpg`
                    : 'https://ddragon.leagueoflegends.com/cdn/16.20.1/img/profileicon/29.png'
                }
                alt={champion?.name || 'Campeón'}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'https://ddragon.leagueoflegends.com/cdn/16.20.1/img/profileicon/29.png';
                }}
              />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black italic tracking-wide uppercase text-white drop-shadow">
                  {champion?.name || state.championName || 'CAMPEÓN'}
                </h1>
                <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-500/40">
                  {modeLabel}
                </span>

                {manualChampionId !== null && (
                  <button
                    onClick={() => setManualChampionId(null)}
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/40 hover:bg-amber-900 transition-colors"
                    title="Restablecer detección automática"
                  >
                    Auto
                  </button>
                )}

                <button
                  onClick={() => setShowChampSearch(!showChampSearch)}
                  className="text-xs text-gray-400 hover:text-cyan-300 p-0.5 rounded hover:bg-cyan-950/40 transition-colors"
                  title="Cambiar campeón manualmente"
                >
                  🔍
                </button>
              </div>

              <p className="text-[11px] text-gray-400 font-mono tracking-tight flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                Parche {state.data?.patch || '26.20'} • Tier List de Mejoras
              </p>
            </div>
          </div>

          {/* Botones de Ventana */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMinimized(!minimized)}
              className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-cyan-300 hover:bg-cyan-950/50 transition-colors"
              title={minimized ? 'Expandir' : 'Minimizar'}
            >
              {minimized ? '▼' : '▲'}
            </button>
            <button
              onClick={() => {
                const api = getApi();
                if (api?.overlayHide) api.overlayHide();
              }}
              className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-400 hover:bg-red-950/40 transition-colors font-bold"
              title="Ocultar (Ctrl+Shift+O para volver a mostrar)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Buscador Rápido de Campeón Desplegable */}
        {showChampSearch && (
          <div className="p-2.5 bg-[#040914] border-b border-cyan-900/60 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Escribe el nombre del campeón..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-[#02050b] border border-cyan-700/60 rounded px-2.5 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400"
                autoFocus
              />
              <button
                onClick={() => {
                  setShowChampSearch(false);
                  setSearchQuery('');
                }}
                className="text-xs text-gray-400 hover:text-white px-2 py-1"
              >
                Cerrar
              </button>
            </div>

            <div className="max-h-32 overflow-y-auto flex flex-wrap gap-1 custom-scrollbar pt-1">
              {championsFiltrados.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setManualChampionId(c.id);
                    setShowChampSearch(false);
                    setSearchQuery('');
                  }}
                  className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                    activeChampionId === c.id
                      ? 'bg-cyan-600 text-white border-cyan-400 font-bold'
                      : 'bg-[#091526] text-gray-300 border-cyan-900/40 hover:bg-cyan-950 hover:text-cyan-200'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Alerta de Modo Pantalla Completa si no es Sin Bordes */}
        {!state.isBorderless && (
          <div className="px-3 py-1.5 bg-amber-950/90 border-b border-amber-600/60 flex items-center justify-between gap-2 text-[11px] text-amber-200">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-amber-400 font-bold shrink-0">⚠</span>
              <span className="truncate">LoL en pantalla completa: el overlay puede ocultarse.</span>
            </div>
            <button
              onClick={handleApplyBorderless}
              disabled={borderlessApplying}
              className="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-gray-950 font-black text-[10px] rounded uppercase tracking-wider shrink-0 cursor-pointer shadow disabled:opacity-50"
            >
              {borderlessApplying ? '...' : 'Sin bordes'}
            </button>
          </div>
        )}

        {/* Notificación informativa para modos sin aumentos activos (Normal / ARAM regular) */}
        {(state.gameMode === 'normal' || state.gameMode === 'aram') && (
          <div className="px-3 py-1 bg-[#06182c] border-b border-cyan-900/40 text-[10px] text-cyan-300/90 flex items-center gap-1 font-mono">
            <span>ℹ️ Partida {modeLabel.toLowerCase()}: catálogo de mejoras de Arena listo para consulta.</span>
          </div>
        )}

        {/* Contenido desplegable */}
        {!minimized && (
          <div className="flex flex-col max-h-[580px]">
            {/* Selector de Rareza */}
            <div className="flex items-center gap-1 p-2 bg-[#040914] border-b border-cyan-950">
              {(
                [
                  { key: 'all', label: 'TODAS' },
                  { key: 'prismatic', label: 'PRISMÁTICAS' },
                  { key: 'gold', label: 'ORO' },
                  { key: 'silver', label: 'PLATA' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setSelectedRarity(tab.key)}
                  className={`flex-1 py-1 px-1.5 text-[10px] font-bold tracking-wider uppercase rounded transition-colors text-center ${
                    selectedRarity === tab.key
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/40'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Lista de Mejoras (Augments) */}
            <div className="p-2 space-y-2 overflow-y-auto flex-1 custom-scrollbar">
              {loading ? (
                <div className="py-12 text-center text-cyan-400 font-mono text-xs animate-pulse">
                  Cargando mejoras óptimas...
                </div>
              ) : !activeChampionId || activeChampionId <= 0 ? (
                <div className="py-10 text-center text-cyan-300/80 font-mono text-xs flex flex-col items-center gap-1.5">
                  <span className="text-base animate-pulse">⏳</span>
                  <span>Esperando selección de campeón...</span>
                </div>
              ) : augmentsFiltrados.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-xs">
                  No hay mejoras registradas para este filtro.
                </div>
              ) : (
                augmentsFiltrados.slice(0, 8).map((augment) => {
                  const isBest = augment.id === bestAugmentId || augment.isBest;

                  return (
                    <div
                      key={augment.id}
                      className={`relative p-2.5 rounded transition-all flex items-center justify-between gap-3 ${
                        isBest
                          ? 'bg-gradient-to-r from-amber-950/40 via-[#0a1829] to-[#0a1829] border-2 border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                          : 'bg-[#071322]/80 border border-cyan-900/40 hover:border-cyan-500/40'
                      }`}
                    >
                      {/* Cinta de Mejor Opción */}
                      {isBest && (
                        <div className="absolute -top-2.5 right-3 bg-gradient-to-r from-amber-400 to-yellow-300 text-gray-950 font-black text-[9px] uppercase px-2 py-0.5 rounded shadow-sm tracking-wider flex items-center gap-1">
                          ★ MEJOR OPCIÓN
                        </div>
                      )}

                      {/* Izquierda: Icono + Detalles */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Icono del Augment */}
                        <div className="relative w-10 h-10 rounded border border-gray-700 bg-gray-950 flex-shrink-0 overflow-hidden">
                          <img
                            src={
                              augment.iconUrl ||
                              'https://ddragon.leagueoflegends.com/cdn/16.20.1/img/profileicon/29.png'
                            }
                            alt={augment.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                'https://ddragon.leagueoflegends.com/cdn/16.20.1/img/profileicon/29.png';
                            }}
                          />
                        </div>

                        {/* Textos */}
                        <div className="min-w-0 flex flex-col">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-white text-[13px] leading-tight truncate">
                              {augment.nameEs || augment.name}
                            </span>
                            <RarityTag rarity={augment.rarity} />
                          </div>

                          <span className="text-[10px] text-gray-400 font-mono truncate mt-0.5">
                            {augment.nameEs && augment.nameEs !== augment.name ? augment.name : ''}
                          </span>

                          {augment.desc && (
                            <span
                              className="text-[10px] text-gray-300/80 leading-snug line-clamp-2 mt-0.5"
                              dangerouslySetInnerHTML={{ __html: augment.desc }}
                            />
                          )}
                        </div>
                      </div>

                      {/* Derecha: Tier Shield + Pick Rate Cian */}
                      <div className="flex items-center gap-2.5 flex-shrink-0">
                        {/* Pick Rate en Cian */}
                        <div className="text-right">
                          <span className="text-[10px] text-gray-400 uppercase tracking-tight block font-mono">
                            Pick Rate
                          </span>
                          <span className="text-sm font-black text-cyan-300 tracking-tight font-mono drop-shadow-[0_0_6px_rgba(6,182,212,0.4)]">
                            {augment.pickRate != null ? `${augment.pickRate.toFixed(1)}%` : '—'}
                          </span>
                        </div>

                        {/* Escudo del Tier */}
                        <TierShield tier={augment.tier} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pie de Página con Atajo */}
            <div className="p-2 bg-[#03070f] border-t border-cyan-950/60 flex items-center justify-between text-[10px] text-gray-400 font-mono">
              <span>Atajo: [Ctrl + Shift + O]</span>
              <span className="text-cyan-400 font-bold">EAsy In-Game</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
