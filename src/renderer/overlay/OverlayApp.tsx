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
      className={`relative w-8 h-9 flex items-center justify-center border-2 ${config.bg} ${config.border} ${config.glow}`}
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
        } else {
          setCollapsed(true);
        }
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

  const handleReanalyze = async () => {
    const api = getApi();
    setIsScanning(true);
    setScanStatus('1/3 Capturando pantalla...');
    try {
      await api?.reanalyzeScreenAugments?.();
    } catch {
      setIsScanning(false);
    }
  };

  // Si está colapsado, NO RENDERIZAR NADA en la pantalla (cero obstrucción)
  if (collapsed) {
    return null;
  }

  // Posiciones fijas exactas abajo de las 3 cartas de Riot (resolución estándar de LoL)
  const cardPositions = [
    { left: '33.33%', index: 1 as const },
    { left: '50.00%', index: 2 as const },
    { left: '66.67%', index: 3 as const },
  ];

  return (
    <div
      className="w-screen h-screen relative pointer-events-none select-none overflow-hidden bg-transparent"
      style={{ background: 'transparent', backgroundColor: 'transparent' }}
    >
      {/* 3 INSIGNIAS FLOTANTES DEBAJO DE CADA CARTA CENTRAL (ESTILO BLITZ) */}
      {cardPositions.map((pos, i) => {
        const card = displayCards[i];
        const slotData = cardSlots[i];
        const isBest = Boolean(card?.isBest || (bestCardIndex === pos.index && card));

        return (
          <div
            key={pos.index}
            style={{
              position: 'absolute',
              left: pos.left,
              top: '68%',
              transform: 'translate(-50%, 0)',
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className="pointer-events-auto flex flex-col items-center z-40 transition-all"
          >
            {/* Cinta Superior: ★ MEJOR OPCIÓN si corresponde */}
            {isBest && (
              <div className="bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-gray-950 font-black text-[9px] uppercase px-2.5 py-0.5 rounded shadow-lg tracking-wider mb-1 flex items-center gap-1 animate-pulse">
                <span>★</span>
                <span>MEJOR OPCIÓN</span>
              </div>
            )}

            {/* Contenedor de la Insignia Idéntico a Blitz */}
            <div
              className={`relative flex flex-col items-center bg-[#030712]/95 backdrop-blur-md rounded-lg p-2 min-w-[130px] max-w-[160px] text-center border-2 transition-all ${
                isBest
                  ? 'border-amber-400 shadow-[0_0_18px_rgba(245,158,11,0.5)] bg-gradient-to-b from-[#0b172a] via-[#050e1c] to-[#02050d]'
                  : 'border-cyan-800/80 shadow-2xl bg-[#040914]/95'
              }`}
            >
              {/* Avatar Cuadrado del Campeón con Bordes Redondeados */}
              <div className="relative w-11 h-11 rounded-md border-2 border-cyan-400/80 bg-gray-950 overflow-hidden shadow-inner flex items-center justify-center">
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
                  <span className="text-xs font-black text-amber-300">EA</span>
                )}
              </div>

              {/* Escudo de Tier: Superpuesto sobre la parte inferior del avatar */}
              <div className="-mt-3.5 z-10">
                <TierShield tier={card ? card.tier : ('?' as TierBadge)} />
              </div>

              {/* Nombre del Aumento y Pick Rate en Cian */}
              {card ? (
                <div className="mt-1 w-full">
                  <div
                    className="text-[11px] font-bold text-white truncate w-full leading-tight"
                    title={card.nameEs || card.name}
                  >
                    {card.nameEs || card.name}
                  </div>

                  <div className="flex items-center justify-center gap-1.5 mt-1 font-mono">
                    <RarityTag rarity={card.rarity} />
                    <span className="text-[11px] font-black text-cyan-300 drop-shadow-[0_0_5px_rgba(6,182,212,0.6)]">
                      {card.pickRate != null && !isNaN(card.pickRate)
                        ? `${card.pickRate.toFixed(1)}%`
                        : 'Sin datos'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-1 w-full text-center flex flex-col items-center">
                  {isScanning ? (
                    <div className="text-[10px] text-cyan-400 font-mono animate-pulse">
                      {scanStatus}
                    </div>
                  ) : (
                    <>
                      <div className="text-[10px] text-amber-300 font-mono font-bold">
                        No reconocido
                      </div>
                      {slotData?.rawText && (
                        <div
                          className="text-[8px] text-gray-400 truncate max-w-[130px] font-mono mt-0.5"
                          title={`Texto leído: "${slotData.rawText}" (${Math.round(slotData.confidence * 100)}%)`}
                        >
                          "{slotData.rawText}" ({Math.round(slotData.confidence * 100)}%)
                        </div>
                      )}
                      {slotData?.cropPreviewDataUrl && (
                        <div className="mt-1 flex flex-col items-center">
                          <img
                            src={slotData.cropPreviewDataUrl}
                            alt="Recorte OCR"
                            className="w-24 h-6 object-contain rounded border border-cyan-800/80 bg-black/90 shadow-sm"
                            title="Vista previa del recorte analizado por OCR"
                          />
                          <span className="text-[7px] text-gray-400 font-mono">Recorte OCR</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* BARRA FLOTANTE DE CONTROL DISCRETA AL FONDO CENTRO */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '84%',
          transform: 'translate(-50%, 0)',
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="pointer-events-auto flex items-center gap-2 bg-[#02050d]/90 border border-cyan-800/60 rounded-full px-3 py-1 shadow-lg text-[10px] font-mono text-gray-300 z-50"
      >
        <span className="font-bold text-cyan-400 uppercase">
          {champion?.name || state.championName || 'EAsy'}
        </span>
        <span>•</span>
        <span className="text-gray-400">Auto-cierre en {countdown}s</span>
        <span>•</span>
        <button
          onClick={handleReanalyze}
          disabled={isScanning}
          className="text-cyan-300 hover:text-white font-bold cursor-pointer disabled:opacity-50"
          title="Re-escanear pantalla si tiraste reroll"
        >
          {isScanning ? '⏳ Escaneando...' : '⟳ Re-escanear'}
        </button>
        <span>•</span>
        <button
          onClick={() => {
            setCollapsed(true);
            const api = getApi();
            api?.overlayHide?.();
          }}
          className="text-red-400 hover:text-red-200 font-bold px-1 cursor-pointer"
          title="Cerrar overlay (Ctrl+Shift+O)"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
