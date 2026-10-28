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
 * Escudo de Tier minimalista y limpio idéntico a la referencia (estilo Blitz).
 */
function TierShield({ tier }: { tier: TierBadge }) {
  const fill = useMemo(() => {
    switch (tier) {
      case 'S+':
      case 'S':
        return '#eab308'; // Dorado limpio
      case 'A':
        return '#38bdf8'; // Azul celeste limpio
      case 'B':
        return '#22c55e'; // Verde limpio
      case 'C':
        return '#f97316'; // Naranja limpio
      case 'D':
        return '#94a3b8'; // Gris pizarra
      case 'F':
        return '#ef4444'; // Rojo limpio
      default:
        return '#94a3b8';
    }
  }, [tier]);

  return (
    <div className="relative w-[26px] h-[30px] flex items-center justify-center shrink-0">
      <svg
        viewBox="0 0 28 32"
        className="w-full h-full drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Escudo plano con punta inferior */}
        <path
          d="M3 2H25C26.1 2 27 2.9 27 4V20.5C27 21.3 26.5 22.1 25.8 22.4L14.8 29.6C14.3 29.9 13.7 29.9 13.2 29.6L2.2 22.4C1.5 22.1 1 21.3 1 20.5V4C1 2.9 1.9 2 3 2Z"
          fill={fill}
        />
        {/* Chevron inferior oscuro estilo insignia */}
        <path
          d="M6.5 20.5L14 25.2L21.5 20.5"
          stroke="#111827"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="absolute text-[13px] font-extrabold text-gray-950 leading-none select-none"
        style={{
          top: '38%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        {tier}
      </span>
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
  const cantidadCartasReconocidas = displayCards.filter((c) => c !== null).length;

  // Si está colapsado o hay menos de 2 cartas reales reconocidas por OCR, NO RENDERIZAR NADA
  // (en LoL siempre salen 3 cartas juntas; esto evita al 100% que aparezca 1 sola carta suelta sin contexto)
  if (collapsed || cantidadCartasReconocidas < 2) {
    return null;
  }

  // Posiciones calibradas exactas en el hueco oscuro inferior de cada carta (debajo del texto de descripción, encima del borde inferior)
  const cardPositions = [
    { left: '29.5%', top: '58.8%', index: 1 as const },
    { left: '50.0%', top: '58.8%', index: 2 as const },
    { left: '70.5%', top: '58.8%', index: 3 as const },
  ];

  return (
    <div
      className="w-screen h-screen relative pointer-events-none select-none overflow-hidden bg-transparent"
      style={{ background: 'transparent', backgroundColor: 'transparent' }}
    >
      {/* 3 INSIGNIAS LIMPIAS Y MINIMALISTAS EN EL ESPACIO INFERIOR DE CADA CARTA (IDÉNTICO A LA REFERENCIA) */}
      {cardPositions.map((pos, i) => {
        const card = displayCards[i];
        if (!card) {
          return null;
        }
        const slotData = cardSlots[i];
        const leftPct = slotData?.posXPct ? `${slotData.posXPct}%` : pos.left;
        const topPct = slotData?.posYPct ? `${slotData.posYPct}%` : pos.top;

        return (
          <div
            key={pos.index}
            style={{
              position: 'absolute',
              left: leftPct,
              top: topPct,
              transform: 'translate(-50%, -50%)',
            }}
            className="pointer-events-none flex items-center gap-2.5 z-40 select-none"
          >
            <TierShield tier={(card.tier || 'B') as TierBadge} />
            <span
              className="text-[19px] font-bold text-white leading-none select-none"
              style={{
                fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.95)',
              }}
            >
              Tier
            </span>
          </div>
        );
      })}
    </div>
  );
}
