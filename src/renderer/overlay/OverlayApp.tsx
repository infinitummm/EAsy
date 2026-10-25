import React, { useState, useEffect, useMemo, useRef } from 'react';
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
 * Escudo de Tier idéntico al estilo de tarjeta de Blitz / P3R mostrado en el juego.
 */
function TierShield({ tier }: { tier: TierBadge }) {
  const config = useMemo(() => {
    switch (tier) {
      case 'S+':
        return {
          bg: 'bg-gradient-to-b from-yellow-300 via-amber-400 to-amber-600',
          border: 'border-yellow-200',
          text: 'text-gray-950 font-black',
          glow: 'shadow-[0_0_8px_rgba(251,191,36,0.6)]',
        };
      case 'S':
        return {
          bg: 'bg-gradient-to-b from-amber-400 via-amber-500 to-amber-700',
          border: 'border-amber-300',
          text: 'text-gray-950 font-black',
          glow: 'shadow-[0_0_7px_rgba(245,158,11,0.5)]',
        };
      case 'A':
        return {
          bg: 'bg-gradient-to-b from-cyan-400 via-teal-500 to-teal-700',
          border: 'border-cyan-300',
          text: 'text-gray-950 font-black',
          glow: 'shadow-[0_0_7px_rgba(6,182,212,0.5)]',
        };
      case 'B':
        return {
          bg: 'bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-700',
          border: 'border-emerald-300',
          text: 'text-white font-extrabold',
          glow: 'shadow-[0_0_6px_rgba(16,185,129,0.4)]',
        };
      case 'C':
        return {
          bg: 'bg-gradient-to-b from-orange-600 to-amber-800',
          border: 'border-amber-500',
          text: 'text-white font-bold',
          glow: '',
        };
      case 'D':
      default:
        return {
          bg: 'bg-gradient-to-b from-slate-600 to-slate-800',
          border: 'border-slate-500',
          text: 'text-slate-200 font-bold',
          glow: '',
        };
    }
  }, [tier]);

  return (
    <div
      className={`relative w-7 h-8 shrink-0 flex items-center justify-center border ${config.bg} ${config.border} ${config.glow}`}
      style={{
        clipPath: 'polygon(0% 0%, 100% 0%, 100% 70%, 50% 100%, 0% 70%)',
      }}
      title={`Tier ${tier}`}
    >
      <span className={`text-[11px] tracking-tighter ${config.text} -mt-0.5`}>{tier}</span>
    </div>
  );
}

/**
 * Insignia de rareza del aumento (Plata, Oro, Prismático).
 */
function RarityTag({ rarity }: { rarity: RarityAugment }) {
  const info = {
    silver: { label: 'PLATA', color: 'text-slate-300 border-slate-500/60 bg-slate-800/60' },
    gold: { label: 'ORO', color: 'text-amber-300 border-amber-500/60 bg-amber-950/60' },
    prismatic: { label: 'PRISMA', color: 'text-fuchsia-300 border-fuchsia-500/60 bg-fuchsia-950/60' },
  }[rarity] || { label: 'MEJORA', color: 'text-cyan-300 border-cyan-500/60 bg-cyan-950/60' };

  return (
    <span
      className={`text-[8px] uppercase px-1 py-0.2 rounded border tracking-wider font-mono font-bold ${info.color}`}
    >
      {info.label}
    </span>
  );
}

export function OverlayApp() {
  const [state, setState] = useState<OverlayState>({
    visible: true,
    isBorderless: true,
    gameMode: 'aram_mayhem',
    championId: 0,
    championName: '',
    data: null,
    activeAugments: [],
  });

  const [manualChampionId, setManualChampionId] = useState<number | null>(null);
  const [showChampSearch, setShowChampSearch] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedRarity, setSelectedRarity] = useState<'recommended' | 'all' | RarityAugment>('recommended');
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [borderlessApplying, setBorderlessApplying] = useState<boolean>(false);

  // Temporizador de auto-cierre
  const [countdown, setCountdown] = useState<number>(25);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Escuchar estado inicial y cambios desde Electron
  useEffect(() => {
    const api = getApi();
    if (api?.overlayGetState) {
      api.overlayGetState().then((s: OverlayState) => {
        if (s) {
          setState((prev) => ({
            ...prev,
            ...s,
            data: s.data || prev.data,
            championId: s.championId && s.championId > 0 ? s.championId : prev.championId,
            championName: s.championName || prev.championName,
          }));
        }
      });
    }

    if (api?.onOverlayStateChanged) {
      const unsub = api.onOverlayStateChanged((newState: OverlayState) => {
        setState((prev) => ({
          ...prev,
          ...newState,
          data: newState.data || prev.data,
          championId: newState.championId && newState.championId > 0 ? newState.championId : prev.championId,
          championName: newState.championName || prev.championName,
        }));
      });
      return () => {
        unsub?.();
      };
    }
  }, []);

  // Escuchar disparador automático de aumentos (cuando el jugador muere o sube de nivel 3/7/11/15)
  useEffect(() => {
    const api = getApi();
    if (api?.on) {
      const unsub = api.on('overlay:auto-trigger', (data: any) => {
        setCollapsed(false);
        setCountdown(data?.autoDismissSeconds ?? 25);
        setIsPaused(false);
        if (data?.championId > 0) {
          setState((prev) => ({
            ...prev,
            championId: data.championId,
            championName: data.championName || prev.championName,
            gameMode: data.gameMode || prev.gameMode,
          }));
        }
      });
      return () => {
        unsub?.();
      };
    }
  }, []);

  // Manejo de cuenta regresiva para auto-ocultar
  useEffect(() => {
    if (collapsed || isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setCollapsed(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [collapsed, isPaused]);

  // Manejar paso de clics transparentes hacia League of Legends
  const handleMouseEnter = () => {
    const api = getApi();
    api?.setIgnoreMouseEvents?.(false);
  };

  const handleMouseLeave = () => {
    const api = getApi();
    api?.setIgnoreMouseEvents?.(true, { forward: true });
  };

  useEffect(() => {
    const api = getApi();
    if (collapsed) {
      api?.setIgnoreMouseEvents?.(true, { forward: true });
    }
  }, [collapsed]);

  const activeChampionId: number = manualChampionId ?? (state.championId && state.championId > 0 ? state.championId : 0);

  // Cargar datos de mejoras del campeón si aún no están cargados
  useEffect(() => {
    if (activeChampionId > 0) {
      const api = getApi();
      const modoConsulta: TipoModo =
        state.gameMode === 'arena' || state.gameMode === 'aram_mayhem'
          ? state.gameMode
          : 'aram_mayhem';

      // Si ya tenemos datos para este campeón y modo, no parpadear con loading
      if (state.data && state.data.championId === activeChampionId && state.data.mode === modoConsulta && state.data.augments?.length > 0) {
        return;
      }

      setLoading(true);
      if (api?.getChampionAugments) {
        api
          .getChampionAugments({
            championId: activeChampionId,
            mode: modoConsulta,
          })
          .then((data: DatosModoCampeon) => {
            if (data && data.augments && data.augments.length > 0) {
              setState((prev) => ({ ...prev, data }));
            }
          })
          .catch((err: any) => console.error('Error cargando augments:', err))
          .finally(() => setLoading(false));
      }
    }
  }, [activeChampionId, state.gameMode, state.data]);

  const champion = useMemo(() => {
    return activeChampionId > 0 ? getChampionById(activeChampionId) : null;
  }, [activeChampionId]);

  // Lista de campeones para búsqueda manual
  const championsFiltrados = useMemo(() => {
    if (!searchQuery.trim()) return ALL_CHAMPIONS.slice(0, 12);
    const q = searchQuery.toLowerCase().trim();
    return ALL_CHAMPIONS.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 12);
  }, [searchQuery]);

  // Lista de augments filtrados
  const augmentsFiltrados = useMemo(() => {
    const lista = state.data?.augments || [];
    if (selectedRarity === 'recommended') {
      const tierRank: Record<TierBadge, number> = { 'S+': 0, 'S': 1, 'A': 2, 'B': 3, 'C': 4, 'D': 5 };
      return [...lista].sort((a, b) => {
        const d = (tierRank[a.tier] ?? 9) - (tierRank[b.tier] ?? 9);
        if (d !== 0) return d;
        return (b.pickRate || 0) - (a.pickRate || 0);
      }).slice(0, 4);
    }
    if (selectedRarity === 'all') return lista.slice(0, 4);
    return lista.filter((a) => a.rarity === selectedRarity).slice(0, 4);
  }, [state.data, selectedRarity]);

  // Identificar el mejor augment absoluto
  const bestAugmentId = useMemo(() => {
    const lista = state.data?.augments || [];
    if (lista.length === 0) return null;
    const tierRank: Record<TierBadge, number> = { 'S+': 0, 'S': 1, 'A': 2, 'B': 3, 'C': 4, 'D': 5 };
    const sorted = [...lista].sort((a, b) => {
      const d = (tierRank[a.tier] ?? 9) - (tierRank[b.tier] ?? 9);
      if (d !== 0) return d;
      return (b.pickRate || 0) - (a.pickRate || 0);
    });
    return sorted[0]?.id;
  }, [state.data]);

  const modeLabel = useMemo(() => {
    if (state.gameMode === 'arena') return 'ARENA';
    if (state.gameMode === 'aram_mayhem') return 'ARAM CAOS';
    if (state.gameMode === 'aram') return 'ARAM';
    return 'ARAM CAOS';
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

  // VISTA COLAPSADA: Píldora ultra-discreta en el margen superior
  if (collapsed) {
    return (
      <div className="w-screen h-screen pointer-events-none flex justify-center items-start">
        <div
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={() => {
            setCollapsed(false);
            setCountdown(25);
          }}
          className="pointer-events-auto mt-0.5 px-3 py-1 bg-[#040814]/90 hover:bg-[#071324] border-b border-x border-cyan-500/60 rounded-b-md shadow-lg text-[10px] font-bold tracking-wider text-cyan-300 hover:text-white flex items-center gap-1.5 cursor-pointer transition-all"
          title="Ver recomendaciones de mejoras (Ctrl+Shift+O)"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-black text-amber-300">EA</span>
          <span>•</span>
          <span className="uppercase">{champion?.name || state.championName || 'AUMENTOS'}</span>
          <span className="text-[9px] text-gray-400 font-normal">({countdown > 0 ? `${countdown}s` : 'oculto'})</span>
        </div>
      </div>
    );
  }

  // VISTA EXPANDIDA: Barra táctica horizontal ultra-compacta ubicada arriba de las cartas
  return (
    <div className="w-screen h-screen pointer-events-none flex flex-col items-center justify-start pt-1.5">
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="pointer-events-auto w-[840px] max-w-[96vw] bg-[#030712]/95 backdrop-blur-md border border-cyan-800/80 rounded-lg shadow-[0_6px_24px_rgba(0,0,0,0.85)] p-2 flex flex-col gap-1.5 select-none relative"
      >
        {/* FILA SUPERIOR: Encabezado compacto */}
        <div className="flex items-center justify-between gap-2 border-b border-cyan-900/40 pb-1.5">
          {/* Campeón y Modo */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded bg-gray-950 border border-cyan-500/70 overflow-hidden shrink-0 flex items-center justify-center">
              {champion ? (
                <img
                  src={`https://ddragon.leagueoflegends.com/cdn/16.20.1/img/champion/${champion.image}`}
                  alt={champion.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      'https://ddragon.leagueoflegends.com/cdn/16.20.1/img/profileicon/29.png';
                  }}
                />
              ) : (
                <span className="text-[10px] font-black text-amber-300">EA</span>
              )}
            </div>

            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-black tracking-wide uppercase text-white truncate">
                {champion?.name || state.championName || 'SELECCIONA CAMPEÓN'}
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-cyan-950/90 text-cyan-300 border border-cyan-500/50 uppercase shrink-0">
                {modeLabel}
              </span>

              {manualChampionId !== null && (
                <button
                  onClick={() => setManualChampionId(null)}
                  className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-500/40 hover:bg-amber-900 transition-colors shrink-0"
                  title="Volver a detección automática de LoL"
                >
                  Auto
                </button>
              )}

              <button
                onClick={() => setShowChampSearch(!showChampSearch)}
                className="text-xs text-gray-400 hover:text-cyan-300 p-0.5 rounded transition-colors shrink-0"
                title="Cambiar campeón manualmente"
              >
                🔍
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-mono ml-1 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>Parche {state.data?.patch || '16.21'}</span>
              <span>•</span>
              <span className="text-cyan-300">
                {isPaused ? 'Pausado' : `${countdown}s`}
              </span>
              <button
                onClick={() => setIsPaused(!isPaused)}
                className="text-[9px] text-gray-400 hover:text-white underline"
              >
                {isPaused ? '▶' : '⏸'}
              </button>
            </div>
          </div>

          {/* Filtros de Rareza y Botón Cerrar */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-0.5 bg-[#02050b] p-0.5 rounded border border-cyan-950">
              {(
                [
                  { key: 'recommended', label: '★ MEJORES' },
                  { key: 'prismatic', label: 'PRISMÁTICOS' },
                  { key: 'gold', label: 'ORO' },
                  { key: 'silver', label: 'PLATA' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setSelectedRarity(tab.key)}
                  className={`py-0.5 px-1.5 text-[9px] font-bold tracking-wider uppercase rounded transition-colors ${
                    selectedRarity === tab.key
                      ? 'bg-cyan-600 text-white shadow-xs'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/40'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setCollapsed(true)}
              className="px-2 py-0.5 bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 text-red-300 hover:text-white rounded text-[10px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
              title="Ocultar (Ctrl+Shift+O para alternar)"
            >
              <span>✕</span>
            </button>
          </div>
        </div>

        {/* Buscador Desplegable de Campeón */}
        {showChampSearch && (
          <div className="absolute top-10 left-2 right-2 z-50 p-2 bg-[#02050b] border border-cyan-700/80 rounded-md shadow-2xl flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Escribe el nombre del campeón (Sylas, Kai'Sa, Jayce...)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-[#050d1a] border border-cyan-800 rounded px-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400"
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

            <div className="max-h-24 overflow-y-auto flex flex-wrap gap-1 custom-scrollbar pt-1">
              {championsFiltrados.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setManualChampionId(c.id);
                    setShowChampSearch(false);
                    setSearchQuery('');
                  }}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
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

        {/* Alerta de Modo Pantalla Completa */}
        {!state.isBorderless && (
          <div className="px-2 py-0.5 bg-amber-950/80 border border-amber-600/50 rounded flex items-center justify-between gap-2 text-[10px] text-amber-200">
            <span className="truncate">LoL en pantalla completa: el overlay requiere Sin Bordes.</span>
            <button
              onClick={handleApplyBorderless}
              disabled={borderlessApplying}
              className="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-gray-950 font-black text-[9px] rounded uppercase shrink-0 cursor-pointer"
            >
              {borderlessApplying ? '...' : 'Poner Sin Bordes'}
            </button>
          </div>
        )}

        {/* FILA INFERIOR: 4 Tarjetas Horizontales de Aumentos */}
        <div className="min-h-[56px] flex items-center justify-center">
          {loading ? (
            <div className="py-2 text-cyan-400 font-mono text-xs animate-pulse flex items-center gap-2">
              <span className="animate-spin text-sm">⚙</span>
              <span>Cargando análisis de mejoras para {champion?.name || 'tu campeón'}...</span>
            </div>
          ) : !activeChampionId || activeChampionId <= 0 ? (
            <div className="py-2 text-cyan-300/80 font-mono text-xs flex items-center gap-2">
              <span>⚔️</span>
              <span>Esperando selección de campeón en LoL (o usa 🔍 para buscarlo)</span>
            </div>
          ) : augmentsFiltrados.length === 0 ? (
            <div className="py-2 text-gray-400 text-xs">
              No hay mejoras registradas para este filtro en {champion?.name}.
            </div>
          ) : (
            <div className="w-full grid grid-cols-4 gap-2">
              {augmentsFiltrados.slice(0, 4).map((augment) => {
                const isBest = augment.id === bestAugmentId || augment.isBest;

                return (
                  <div
                    key={augment.id}
                    className={`relative rounded p-1.5 flex items-center gap-2 transition-all border ${
                      isBest
                        ? 'bg-gradient-to-r from-amber-950/50 via-[#0a182c] to-[#040814] border-amber-400/90 shadow-[0_0_10px_rgba(245,158,11,0.25)]'
                        : 'bg-[#060e1d]/90 border-cyan-900/60 hover:border-cyan-400/70 shadow-xs'
                    }`}
                  >
                    {/* Cinta Mejor Opción */}
                    {isBest && (
                      <div className="absolute -top-1.5 left-2 bg-gradient-to-r from-amber-400 to-yellow-300 text-gray-950 font-black text-[7px] uppercase px-1 py-0 rounded shadow-xs tracking-wider">
                        ★ MEJOR
                      </div>
                    )}

                    {/* Escudo de Tier */}
                    <TierShield tier={augment.tier} />

                    {/* Icono del Aumento */}
                    <div className="w-8 h-8 rounded border border-cyan-700/60 bg-gray-950 shrink-0 overflow-hidden flex items-center justify-center">
                      <img
                        src={
                          augment.iconUrl ||
                          'https://ddragon.leagueoflegends.com/cdn/16.20.1/img/profileicon/29.png'
                        }
                        alt={augment.name}
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            'https://ddragon.leagueoflegends.com/cdn/16.20.1/img/profileicon/29.png';
                        }}
                      />
                    </div>

                    {/* Información: Nombre + Pick Rate + Rareza */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <span
                        className="text-[11px] font-bold text-white truncate leading-tight"
                        title={`${augment.nameEs || augment.name} - ${augment.desc || ''}`}
                      >
                        {augment.nameEs || augment.name}
                      </span>

                      <div className="flex items-center gap-1.5 mt-0.5">
                        <RarityTag rarity={augment.rarity} />
                        <span className="text-[10px] font-black text-cyan-300 font-mono drop-shadow-[0_0_4px_rgba(6,182,212,0.4)]">
                          {augment.pickRate != null ? `${augment.pickRate.toFixed(1)}%` : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Barra de progreso de auto-cierre */}
        <div className="w-full bg-[#02050b] h-0.5 rounded-full overflow-hidden">
          <div
            className="bg-cyan-400 h-full transition-all duration-1000 ease-linear"
            style={{ width: `${Math.max(0, Math.min(100, (countdown / 25) * 100))}%` }}
          />
        </div>
      </div>
    </div>
  );
}
