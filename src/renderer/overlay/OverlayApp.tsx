import React, { useState, useEffect, useMemo, useRef } from 'react';
import type {
  OverlayState,
  DatosModoCampeon,
  AugmentInfo,
  RarityAugment,
  TierBadge,
  TipoModo,
} from '@shared/types';
import { getChampionById } from '@shared/champions';

const getApi = () => (typeof window !== 'undefined' ? (window.api || window.electronAPI) : undefined);

/**
 * Escudo de Tier idéntico al estilo Blitz / P3R en juego.
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
          bg: 'bg-gradient-to-b from-orange-500 to-amber-700',
          border: 'border-orange-400',
          text: 'text-white font-bold',
          glow: 'shadow-[0_0_6px_rgba(249,115,22,0.4)]',
        };
      case 'D':
        return {
          bg: 'bg-gradient-to-b from-slate-600 to-slate-800',
          border: 'border-slate-500',
          text: 'text-slate-200 font-bold',
          glow: '',
        };
      case 'F':
        return {
          bg: 'bg-gradient-to-b from-red-700 via-rose-800 to-red-950',
          border: 'border-red-500',
          text: 'text-white font-bold',
          glow: 'shadow-[0_0_8px_rgba(239,68,68,0.5)]',
        };
      case '?':
      default:
        return {
          bg: 'bg-gradient-to-b from-slate-700 to-slate-900',
          border: 'border-slate-600',
          text: 'text-slate-300 font-bold',
          glow: '',
        };
    }
  }, [tier]);

  return (
    <div
      className={`relative w-7 h-8 flex items-center justify-center border-2 rounded-sm ${config.bg} ${config.border} ${config.glow}`}
      style={{
        clipPath: 'polygon(0% 0%, 100% 0%, 100% 70%, 50% 100%, 0% 70%)',
      }}
      title={`Tier ${tier}`}
    >
      <span className={`text-xs tracking-tighter ${config.text} -mt-0.5`}>{tier}</span>
    </div>
  );
}

/**
 * Insignia de rareza del aumento.
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

  const [cards, setCards] = useState<[AugmentInfo | null, AugmentInfo | null, AugmentInfo | null]>([
    null,
    null,
    null,
  ]);
  const [cardSlots, setCardSlots] = useState<any[]>([null, null, null]);
  const [bestCardIndex, setBestCardIndex] = useState<1 | 2 | 3 | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanStatus, setScanStatus] = useState<string>('Escaneando...');
  const [collapsed, setCollapsed] = useState<boolean>(true);

  // Temporizador de auto-cierre
  const [countdown, setCountdown] = useState<number>(25);
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
        if (newState.visible) {
          setCollapsed(false);
          setCountdown(25);
          if (newState.cards && Array.isArray(newState.cards) && newState.cards.length === 3) {
            setCardSlots(newState.cards);
            const c1 = newState.cards[0]?.augment || null;
            const c2 = newState.cards[1]?.augment || null;
            const c3 = newState.cards[2]?.augment || null;
            setCards([c1, c2, c3]);
            if ((newState as any).bestCardIndex) {
              setBestCardIndex((newState as any).bestCardIndex);
            }
          }
        } else {
          setCollapsed(true);
          setCards([null, null, null]);
          setCardSlots([null, null, null]);
        }
      });
      return () => {
        unsub?.();
      };
    }
  }, []);

  // Escuchar evento directo de descarte al seleccionar un aumento en LoL
  useEffect(() => {
    const api = getApi();
    if (api?.on) {
      const unsub = api.on('overlay:dismiss', () => {
        setCollapsed(true);
        setCards([null, null, null]);
        setCardSlots([null, null, null]);
      });
      return () => {
        unsub?.();
      };
    }
  }, []);

  // Escuchar estado de telemetría de escaneo en vivo
  useEffect(() => {
    const api = getApi();
    if (api?.on) {
      const unsub = api.on('overlay:scan-status', (payload: any) => {
        if (payload?.status) {
          setScanStatus(payload.status);
        }
      });
      return () => {
        unsub?.();
      };
    }
  }, []);

  // Escuchar evento automático de inicio de elección de aumentos
  useEffect(() => {
    const api = getApi();
    if (api?.on) {
      const unsub = api.on('overlay:auto-trigger', (data: any) => {
        setCollapsed(false);
        setCountdown(data?.autoDismissSeconds ?? 25);
        setIsScanning(true);
        setScanStatus('1/3 Capturando pantalla...');
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

  // Escuchar resultado del escaneo OCR de las 3 cartas en pantalla
  useEffect(() => {
    const api = getApi();
    if (api?.on) {
      const unsub = api.on('overlay:screen-augments', (payload: any) => {
        setIsScanning(false);
        if (payload?.cards && Array.isArray(payload.cards)) {
          setCardSlots(payload.cards);
          const c1 = payload.cards[0]?.augment || null;
          const c2 = payload.cards[1]?.augment || null;
          const c3 = payload.cards[2]?.augment || null;
          setCards([c1, c2, c3]);
          setBestCardIndex(payload.bestCardIndex || null);
        }
      });
      return () => {
        unsub?.();
      };
    }
  }, []);

  // Cuenta regresiva para auto-ocultar
  useEffect(() => {
    if (collapsed) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setCollapsed(true);
          const api = getApi();
          api?.overlayHide?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [collapsed]);

  // Manejar paso de eventos de ratón (100% pasante por defecto hacia LoL)
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

  const activeChampionId = state.championId && state.championId > 0 ? state.championId : 0;
  const champion = useMemo(() => {
    return activeChampionId > 0 ? getChampionById(activeChampionId) : null;
  }, [activeChampionId]);

  // Cargar datos de mejoras si no están cargados
  useEffect(() => {
    if (activeChampionId > 0) {
      const api = getApi();
      const modoConsulta: TipoModo =
        state.gameMode === 'arena' || state.gameMode === 'aram_mayhem'
          ? state.gameMode
          : 'aram_mayhem';

      if (!state.data || state.data.championId !== activeChampionId) {
        api?.getChampionAugments?.({
          championId: activeChampionId,
          mode: modoConsulta,
        })
          .then((data: DatosModoCampeon) => {
            if (data && data.augments) {
              setState((prev) => ({ ...prev, data }));
            }
          })
          .catch(() => {});
      }
    }
  }, [activeChampionId, state.gameMode, state.data]);

  // Cartas reales leídas por OCR (NUNCA sustituir por top 3 recomendado - Ley 1)
  const displayCards = cards;
  const hayAlgunaCartaReconocida = displayCards.some((c) => c !== null);

  // Si está colapsado o aún no hay ninguna carta real reconocida por OCR, NO RENDERIZAR NADA (cero obstrucción)
  if (collapsed || !hayAlgunaCartaReconocida) {
    return null;
  }

  // Posiciones calibradas exactas sobre la zona oscura inferior interna de cada una de las 3 cartas en LoL (16:9)
  const cardPositions = [
    { left: '29.5%', top: '52.5%', index: 1 as const },
    { left: '50.0%', top: '52.5%', index: 2 as const },
    { left: '70.5%', top: '52.5%', index: 3 as const },
  ];

  return (
    <div
      className="w-screen h-screen relative pointer-events-none select-none overflow-hidden bg-transparent"
      style={{ background: 'transparent', backgroundColor: 'transparent' }}
    >
      {/* 3 INSIGNIAS FLOTANTES SUPERPUESTAS EXACTAMENTE EN LA ZONA INFERIOR INTERNA DE CADA CARTA (ESTILO TIER BLITZ) */}
      {cardPositions.map((pos, i) => {
        const card = displayCards[i];
        if (!card) {
          return null;
        }
        const slotData = cardSlots[i];
        const leftPct = slotData?.posXPct ? `${slotData.posXPct}%` : pos.left;
        const topPct = slotData?.posYPct ? `${slotData.posYPct}%` : pos.top;
        const isBest = Boolean(card.isBest || bestCardIndex === pos.index);

        return (
          <div
            key={pos.index}
            style={{
              position: 'absolute',
              left: leftPct,
              top: topPct,
              transform: 'translate(-50%, -50%)',
            }}
            className="pointer-events-none flex flex-col items-center z-40 transition-all select-none"
          >
            {/* Cinta Superior: ★ MEJOR OPCIÓN si corresponde */}
            {isBest && (
              <div className="bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-gray-950 font-black text-[9px] uppercase px-2.5 py-0.5 rounded shadow-lg tracking-wider mb-1 flex items-center gap-1 animate-pulse">
                <span>★</span>
                <span>MEJOR OPCIÓN</span>
              </div>
            )}

            {/* Insignia Tier idéntica a la captura de referencia: [Shield] Tier */}
            <div
              className={`relative flex items-center gap-2 px-3 py-1 rounded-md bg-[#02050e]/92 backdrop-blur-md border transition-all ${
                isBest
                  ? 'border-amber-400 shadow-[0_0_16px_rgba(245,158,11,0.6)]'
                  : 'border-slate-700/80 shadow-[0_4px_16px_rgba(0,0,0,0.8)]'
              }`}
            >
              <TierShield tier={(card.tier || 'B') as TierBadge} />
              <span className="text-base font-black text-white tracking-wider uppercase drop-shadow-sm font-sans">
                Tier
              </span>
            </div>

            {/* Detalles del Aumento (Nombre y Rendimiento Competitivo de OP.GG) */}
            <div className="mt-1 px-2.5 py-0.5 rounded bg-[#030712]/88 border border-slate-800/80 backdrop-blur-sm flex flex-col items-center max-w-[175px] text-center shadow-md">
              <div
                className="text-[10px] font-bold text-white truncate max-w-[160px] leading-tight"
                title={card.nameEs || card.name}
              >
                {card.nameEs || card.name}
              </div>

              {((card.winRate != null && !isNaN(card.winRate)) ||
                (card.pickRate != null && !isNaN(card.pickRate))) && (
                <div className="flex items-center gap-1.5 mt-0.5 font-mono text-[9px]">
                  {card.winRate != null && !isNaN(card.winRate) && (
                    <span className="text-cyan-300 font-extrabold">
                      {card.winRate.toFixed(1)}% WR
                    </span>
                  )}
                  {card.pickRate != null && !isNaN(card.pickRate) && (
                    <span className="text-slate-400">
                      • {card.pickRate.toFixed(0)}% Pick
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
