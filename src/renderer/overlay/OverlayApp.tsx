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
          glow: 'shadow-[0_0_12px_rgba(251,191,36,0.7)]',
        };
      case 'S':
        return {
          bg: 'bg-gradient-to-b from-amber-400 via-amber-500 to-amber-700',
          border: 'border-amber-300',
          text: 'text-gray-950 font-black',
          glow: 'shadow-[0_0_10px_rgba(245,158,11,0.6)]',
        };
      case 'A':
        return {
          bg: 'bg-gradient-to-b from-cyan-400 via-teal-500 to-teal-700',
          border: 'border-cyan-300',
          text: 'text-gray-950 font-black',
          glow: 'shadow-[0_0_10px_rgba(6,182,212,0.6)]',
        };
      case 'B':
        return {
          bg: 'bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-700',
          border: 'border-emerald-300',
          text: 'text-white font-extrabold',
          glow: 'shadow-[0_0_8px_rgba(16,185,129,0.5)]',
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
      className={`relative w-9 h-10 flex items-center justify-center border-2 ${config.bg} ${config.border} ${config.glow}`}
      style={{
        clipPath: 'polygon(0% 0%, 100% 0%, 100% 70%, 50% 100%, 0% 70%)',
      }}
      title={`Tier ${tier}`}
    >
      <span className={`text-sm tracking-tighter ${config.text} -mt-1`}>{tier}</span>
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
    prismatic: { label: 'PRISMÁTICO', color: 'text-fuchsia-300 border-fuchsia-500/60 bg-fuchsia-950/60' },
  }[rarity] || { label: 'MEJORA', color: 'text-cyan-300 border-cyan-500/60 bg-cyan-950/60' };

  return (
    <span
      className={`text-[9px] uppercase px-1.5 py-0.5 rounded border tracking-wider font-mono font-bold ${info.color}`}
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
  const [countdown, setCountdown] = useState<number>(30);
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
          championId: newState.championId && newState.championId > 0 ? newState.championId : prev.championId,
          championName: newState.championName || prev.championName,
        }));
      });
      return () => {
        unsub?.();
      };
    }
  }, []);

  // Escuchar disparador automático de aumentos (cuando el juego entra en momento de elegir)
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

  // Manejar paso de eventos de ratón según estado colapsado / expandido
  useEffect(() => {
    const api = getApi();
    if (!api?.setIgnoreMouseEvents) return;
    if (collapsed) {
      api.setIgnoreMouseEvents(true, { forward: true });
    } else {
      api.setIgnoreMouseEvents(false);
    }
  }, [collapsed]);

  const activeChampionId: number = manualChampionId ?? (state.championId && state.championId > 0 ? state.championId : 0);

  // Cargar datos de mejoras del campeón
  useEffect(() => {
    if (activeChampionId > 0) {
      setLoading(true);
      const api = getApi();
      const modoConsulta: TipoModo =
        state.gameMode === 'arena' || state.gameMode === 'aram_mayhem'
          ? state.gameMode
          : 'aram_mayhem';

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
    return activeChampionId > 0 ? getChampionById(activeChampionId) : null;
  }, [activeChampionId]);

  // Lista de campeones para búsqueda manual
  const championsFiltrados = useMemo(() => {
    if (!searchQuery.trim()) return ALL_CHAMPIONS.slice(0, 10);
    const q = searchQuery.toLowerCase().trim();
    return ALL_CHAMPIONS.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 10);
  }, [searchQuery]);

  // Lista de augments filtrados
  const augmentsFiltrados = useMemo(() => {
    const lista = state.data?.augments || [];
    if (selectedRarity === 'recommended') {
      // Ordenar por Tier (S+ -> S -> A -> B...) y luego por Pick Rate
      const tierRank: Record<TierBadge, number> = { 'S+': 0, 'S': 1, 'A': 2, 'B': 3, 'C': 4, 'D': 5 };
      return [...lista].sort((a, b) => {
        const d = (tierRank[a.tier] ?? 9) - (tierRank[b.tier] ?? 9);
        if (d !== 0) return d;
        return (b.pickRate || 0) - (a.pickRate || 0);
      }).slice(0, 4);
    }
    if (selectedRarity === 'all') return lista;
    return lista.filter((a) => a.rarity === selectedRarity);
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
    return 'PARTIDA ACTIVA';
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

  const reabrirOverlay = () => {
    setCollapsed(false);
    setCountdown(25);
    setIsPaused(false);
  };

  // ==========================================
  // VISTA 1: Modo Colapsado (Píldora Flotante Mínima)
  // ==========================================
  if (collapsed) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-start pt-1 select-none pointer-events-none">
        <div
          onMouseEnter={() => {
            const api = getApi();
            if (api?.setIgnoreMouseEvents) api.setIgnoreMouseEvents(false);
          }}
          onMouseLeave={() => {
            const api = getApi();
            if (api?.setIgnoreMouseEvents) api.setIgnoreMouseEvents(true, { forward: true });
          }}
          onClick={reabrirOverlay}
          className="pointer-events-auto flex items-center gap-2 px-3 py-1 bg-[#050E20]/95 hover:bg-[#071630] border-2 border-cyan-400/80 rounded-full shadow-[0_0_15px_rgba(6,182,212,0.4)] cursor-pointer transition-all transform hover:scale-105"
          title="Clic para ver las mejores opciones de aumentos (Ctrl+Shift+O)"
        >
          {champion ? (
            <img
              src={`https://ddragon.leagueoflegends.com/cdn/img/champion/tiles/${champion.key}_0.jpg`}
              alt={champion.name}
              className="w-5 h-5 rounded-full object-cover border border-cyan-300"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  'https://ddragon.leagueoflegends.com/cdn/16.20.1/img/profileicon/29.png';
              }}
            />
          ) : (
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          )}

          <span className="text-xs font-black uppercase tracking-wider text-white font-mono">
            {champion?.name || state.championName || 'AUMENTOS'}
          </span>

          <span className="text-[10px] bg-cyan-950 text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-500/50 font-bold font-mono">
            {modeLabel}
          </span>
        </div>
      </div>
    );
  }

  // ==========================================
  // VISTA 2: Modo Expandido (Tarjetas Estilo Blitz / P3R)
  // ==========================================
  return (
    <div
      className="w-full h-full p-2 select-none font-sans text-gray-100 flex flex-col justify-start items-center"
      onMouseEnter={() => {
        const api = getApi();
        if (api?.setIgnoreMouseEvents) api.setIgnoreMouseEvents(false);
      }}
      onMouseLeave={() => {
        // En vista expandida, mantener interactivo sobre el panel
      }}
    >
      <div className="w-[800px] bg-[#050E20]/95 border-2 border-[#16335F] rounded-lg shadow-2xl backdrop-blur-md flex flex-col overflow-hidden relative">
        {/* Cabecera con Campeón, Temporizador de Auto-Cierre y Botones */}
        <div className="px-4 py-2.5 bg-gradient-to-r from-[#071326] via-[#091b36] to-[#040812] border-b border-cyan-500/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Retrato del Campeón */}
            <div className="relative w-10 h-10 rounded border-2 border-cyan-400/80 overflow-hidden shadow-[0_0_8px_rgba(6,182,212,0.4)] bg-gray-900 shrink-0">
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
                  {champion?.name || state.championName || 'SELECCIONA TU CAMPEÓN'}
                </h1>
                <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-cyan-950/90 text-cyan-300 border border-cyan-500/50">
                  {modeLabel}
                </span>

                {manualChampionId !== null && (
                  <button
                    onClick={() => setManualChampionId(null)}
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/40 hover:bg-amber-900 transition-colors"
                    title="Volver a detección automática de LoL"
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

              <div className="flex items-center gap-2 text-[11px] text-gray-400 font-mono mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span>Parche {state.data?.patch || '26.20'}</span>
                <span>•</span>
                <span className="text-cyan-300">
                  {isPaused ? 'Pausado' : `Auto-oculta en ${countdown}s`}
                </span>
                <button
                  onClick={() => setIsPaused(!isPaused)}
                  className="text-[10px] text-gray-400 hover:text-white underline ml-1"
                >
                  {isPaused ? 'Reanudar' : 'Pausar'}
                </button>
              </div>
            </div>
          </div>

          {/* Filtros de Rareza y Botón Ocultar */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-[#03060f] p-1 rounded border border-cyan-950">
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
                  className={`py-1 px-2 text-[10px] font-bold tracking-wider uppercase rounded transition-colors ${
                    selectedRarity === tab.key
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/40'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setCollapsed(true)}
              className="px-2.5 py-1 bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 text-red-300 hover:text-white rounded text-xs font-bold transition-colors flex items-center gap-1"
              title="Ocultar interfaz (Ctrl+Shift+O para alternar)"
            >
              <span>✕</span>
              <span>Ocultar</span>
            </button>
          </div>
        </div>

        {/* Buscador de Campeón Desplegable */}
        {showChampSearch && (
          <div className="p-2.5 bg-[#03070f] border-b border-cyan-900/60 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Escribe el nombre del campeón (Kai'Sa, Jayce, Aatrox...)..."
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

            <div className="max-h-24 overflow-y-auto flex flex-wrap gap-1 custom-scrollbar pt-1">
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
              {borderlessApplying ? '...' : 'Configurar Sin Bordes'}
            </button>
          </div>
        )}

        {/* CUERPO: Tarjetas de Aumentos Idénticas al Estilo Blitz / P3R */}
        <div className="p-3 bg-[#03070f]/90 min-h-[300px] flex items-center justify-center">
          {loading ? (
            <div className="py-16 text-center text-cyan-400 font-mono text-sm animate-pulse flex flex-col items-center gap-2">
              <span className="text-2xl animate-spin">⚙</span>
              <span>Cargando análisis de mejoras para {champion?.name || 'tu campeón'}...</span>
            </div>
          ) : !activeChampionId || activeChampionId <= 0 ? (
            <div className="py-14 text-center text-cyan-300/80 font-mono text-sm flex flex-col items-center gap-2">
              <span className="text-3xl">⚔️</span>
              <span className="font-bold">Esperando que elijas un campeón en LoL</span>
              <span className="text-xs text-gray-400">
                Al entrar a partida o pulsar 🔍 arriba se cargarán las mejores opciones automáticamente.
              </span>
            </div>
          ) : augmentsFiltrados.length === 0 ? (
            <div className="py-14 text-center text-gray-400 text-sm">
              No hay mejoras registradas para este filtro en {champion?.name}.
            </div>
          ) : (
            <div className="w-full grid grid-cols-4 gap-3">
              {augmentsFiltrados.slice(0, 4).map((augment) => {
                const isBest = augment.id === bestAugmentId || augment.isBest;

                return (
                  <div
                    key={augment.id}
                    className={`relative rounded-lg p-3 flex flex-col items-center justify-between transition-all border-2 ${
                      isBest
                        ? 'bg-gradient-to-b from-[#0f233d] via-[#071322] to-[#040914] border-amber-400 shadow-[0_0_18px_rgba(245,158,11,0.35)]'
                        : 'bg-gradient-to-b from-[#0a182c] via-[#050e1c] to-[#030712] border-cyan-800/60 hover:border-cyan-400/70 shadow-lg'
                    }`}
                  >
                    {/* Cinta de Mejor Opción */}
                    {isBest && (
                      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-gray-950 font-black text-[9px] uppercase px-2.5 py-0.5 rounded shadow-md tracking-wider whitespace-nowrap">
                        ★ MEJOR OPCIÓN
                      </div>
                    )}

                    {/* Parte Superior: Icono del Aumento */}
                    <div className="relative w-14 h-14 rounded-md border-2 border-amber-300/60 bg-gray-950 p-1 mt-1 shadow-inner overflow-hidden flex items-center justify-center">
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

                    {/* Parte Media: Título y Retrato del Campeón (Igual a Blitz) */}
                    <div className="w-full flex flex-col items-center text-center my-2">
                      <h3 className="font-bold text-white text-[13px] leading-tight truncate w-full" title={augment.nameEs || augment.name}>
                        {augment.nameEs || augment.name}
                      </h3>

                      {augment.nameEs && augment.nameEs !== augment.name && (
                        <span className="text-[10px] text-gray-400 font-mono truncate w-full">
                          {augment.name}
                        </span>
                      )}

                      <div className="mt-1 flex items-center gap-1.5">
                        <RarityTag rarity={augment.rarity} />
                      </div>

                      {/* Retrato del Campeón asignado (Kai'Sa / Jayce / etc.) */}
                      {champion && (
                        <div className="mt-2 flex items-center gap-1.5 px-2 py-0.5 bg-[#03060c] border border-cyan-900/50 rounded-full">
                          <img
                            src={`https://ddragon.leagueoflegends.com/cdn/img/champion/tiles/${champion.key}_0.jpg`}
                            alt={champion.name}
                            className="w-4 h-4 rounded-full object-cover border border-cyan-400"
                          />
                          <span className="text-[10px] text-gray-300 font-mono uppercase font-bold">
                            {champion.name}
                          </span>
                        </div>
                      )}

                      {/* Descripción breve */}
                      {augment.desc && (
                        <p
                          className="text-[10px] text-gray-400 leading-snug line-clamp-2 mt-1.5 px-1 text-center"
                          dangerouslySetInnerHTML={{ __html: augment.desc }}
                        />
                      )}
                    </div>

                    {/* Parte Inferior: Pick Rate en Cian + Escudo de Tier Centrado */}
                    <div className="w-full pt-2 border-t border-cyan-950 flex flex-col items-center gap-1 mt-auto">
                      <div className="text-center">
                        <span className="text-[9px] text-gray-400 uppercase tracking-tight block font-mono">
                          Pick Rate
                        </span>
                        <span className="text-sm font-black text-cyan-300 tracking-tight font-mono drop-shadow-[0_0_6px_rgba(6,182,212,0.5)]">
                          {augment.pickRate != null ? `${augment.pickRate.toFixed(1)}%` : '—'}
                        </span>
                      </div>

                      {/* Escudo de Tier Centrado al Fondo de la Tarjeta */}
                      <TierShield tier={augment.tier} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Barra de Progreso del Temporizador de Cierre */}
        <div className="w-full bg-[#03070f] h-1">
          <div
            className="bg-cyan-500 h-full transition-all duration-1000 ease-linear"
            style={{ width: `${Math.max(0, Math.min(100, (countdown / 30) * 100))}%` }}
          />
        </div>
      </div>
    </div>
  );
}
