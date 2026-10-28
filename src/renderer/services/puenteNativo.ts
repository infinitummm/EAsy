/**
 * src/renderer/services/puenteNativo.ts
 * Adaptador unificado para Tauri v2 que expone la misma interfaz window.api / window.electronAPI
 * que utilizaba Electron, redirigiendo todas las llamadas a `@tauri-apps/api/core` (`invoke`)
 * y `@tauri-apps/api/event` (`listen`, `emit`).
 *
 * Mantiene compatibilidad total con los canales IPC de `src/shared/events.ts`.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, emit, type UnlistenFn } from '@tauri-apps/api/event';
import { IPC_CHANNELS } from '../../shared/events';
import type {
  AppSettings,
  RunePage,
  Role,
  PlatformRouting,
  RegionalRouting,
  LcuDetectionReport,
  LcuStateInfo,
  TipoModo,
  OverlayState,
  DatosModoCampeon,
} from '../../shared/types';
import { OpGgClient } from '../../main/opgg/OpGgClient';
import { getChampionName } from '../../shared/champions';
import { getAccurateFallbackRecommendation } from '../../shared/buildDatabase';

// Determina si estamos corriendo en el entorno nativo de Tauri v2
export const esEntornoTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

// Puente HTTP que redirige llamadas a Tauri cuando corre en el cliente nativo para evitar restricciones CORS
const fetchViaTauri = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
  if (esEntornoTauri()) {
    try {
      const body = typeof init?.body === 'string' ? init.body : JSON.stringify(init?.body || {});
      const res: any = await invoke('opgg_mcp_raw_call', { payload: body });
      if (res && typeof res === 'object') {
        const text = typeof res.text === 'string' ? res.text : JSON.stringify(res);
        const status = typeof res.status === 'number' ? res.status : 200;
        return new Response(text, {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch (err) {
      console.warn('[PuenteNativo] Error en puente HTTP opgg_mcp_raw_call:', err);
    }
  }
  return fetch(url, init);
};

const opggClientInstancia = new OpGgClient({ fetchImpl: fetchViaTauri as any });

/**
 * Crea el objeto de API que se inyecta en `window.api` y `window.electronAPI`.
 */
export function crearPuenteNativo() {
  const eventSubscriptions = new Map<string, Set<(...args: any[]) => void>>();
  const tauriUnlistenMap = new Map<string, Promise<UnlistenFn>>();

  const on = (channel: string, callback: (...args: any[]) => void) => {
    if (!eventSubscriptions.has(channel)) {
      eventSubscriptions.set(channel, new Set());
    }
    const callbacks = eventSubscriptions.get(channel)!;
    callbacks.add(callback);

    if (esEntornoTauri() && !tauriUnlistenMap.has(channel)) {
      const promise = listen(channel, (event) => {
        const subs = eventSubscriptions.get(channel);
        if (subs) {
          subs.forEach((cb) => cb(event.payload));
        }
      });
      tauriUnlistenMap.set(channel, promise);
    }

    return () => {
      const subs = eventSubscriptions.get(channel);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          eventSubscriptions.delete(channel);
          const unlistenPromise = tauriUnlistenMap.get(channel);
          if (unlistenPromise) {
            unlistenPromise.then((unlisten) => unlisten());
            tauriUnlistenMap.delete(channel);
          }
        }
      }
    };
  };

  const genericInvoke = async (channel: string, ...args: any[]): Promise<any> => {
    if (!esEntornoTauri()) {
      return fallbackMock(channel, args);
    }
    try {
      // Normalizar nombre de comando para Rust (reemplazando : y - por _)
      const cmd = channel.replace(/[:-]/g, '_');
      return await invoke(cmd, { payload: args[0], args });
    } catch (err: any) {
      console.error(`[PuenteNativo] Error en invocación Tauri de "${channel}":`, err);
      throw err;
    }
  };

  const send = async (channel: string, ...args: any[]): Promise<void> => {
    if (esEntornoTauri()) {
      try {
        await emit(channel, args.length === 1 ? args[0] : args);
      } catch (err) {
        console.error(`[PuenteNativo] Error al emitir evento Tauri "${channel}":`, err);
      }
    }
  };

  const api = {
    // Genéricos compatibles con Electron
    on,
    invoke: genericInvoke,
    send,

    // Configuración
    getSettings: (): Promise<AppSettings> => genericInvoke(IPC_CHANNELS.SETTINGS_GET),
    saveSettings: (settings: Partial<AppSettings>): Promise<{ success: boolean }> =>
      genericInvoke(IPC_CHANNELS.SETTINGS_SAVE, settings),

    // LCU
    getLcuState: (): Promise<LcuStateInfo> => genericInvoke(IPC_CHANNELS.LCU_GET_STATE),
    testLcuDetection: (manualPath?: string): Promise<LcuDetectionReport> =>
      genericInvoke(IPC_CHANNELS.LCU_TEST_DETECTION, manualPath),
    selectFolder: (): Promise<string | null> => genericInvoke(IPC_CHANNELS.LCU_SELECT_FOLDER),
    setAutoAccept: (params: { enabled: boolean; delaySeconds: number }): Promise<void> =>
      genericInvoke(IPC_CHANNELS.LCU_SET_AUTO_ACCEPT, params),
    getAutoAcceptStatus: () => genericInvoke(IPC_CHANNELS.LCU_GET_AUTO_ACCEPT_STATUS),
    getPickableChampions: (): Promise<number[]> =>
      genericInvoke(IPC_CHANNELS.LCU_GET_PICKABLE_CHAMPIONS),
    getChampSelectSession: (): Promise<any> =>
      genericInvoke(IPC_CHANNELS.LCU_GET_CHAMP_SELECT_SESSION),
    hoverChampion: (championId: number): Promise<{ success: boolean; error?: string }> =>
      genericInvoke(IPC_CHANNELS.LCU_HOVER_CHAMPION, championId),
    applyRunes: (page: RunePage): Promise<{ success: boolean; error?: string }> =>
      genericInvoke(IPC_CHANNELS.LCU_APPLY_RUNES, page),
    applyBuild: (params: {
      championId: number;
      opponentId?: number;
      role?: Role;
      title?: string;
      build: any;
    }): Promise<{ success: boolean; filePath?: string; error?: string }> =>
      genericInvoke(IPC_CHANNELS.LCU_APPLY_BUILD, params),

    // Riot API
    validateKey: (apiKey: string) => genericInvoke(IPC_CHANNELS.RIOT_VALIDATE_KEY, apiKey),
    validateAiKey: (apiKey: string): Promise<{ valid: boolean; statusCode: number; message: string }> =>
      genericInvoke(IPC_CHANNELS.AI_VALIDATE_KEY, apiKey),
    syncAccount: (params: {
      gameName: string;
      tagLine: string;
      platform: PlatformRouting;
      regional: RegionalRouting;
    }) => genericInvoke(IPC_CHANNELS.RIOT_SYNC_ACCOUNT, params),
    getProfile: (puuid: string) => genericInvoke(IPC_CHANNELS.RIOT_GET_PROFILE, puuid),

    // Matchup y Recomendaciones
    getMatchupAdvice: async (params: {
      championId: number;
      opponentId: number;
      role: Role;
      patch: string;
      allies: number[];
      enemies: number[];
      forceRefresh?: boolean;
      viewMode?: 'general' | 'matchup';
      elo?: string;
      askAi?: boolean;
    }) => {
      try {
        const isGeneral = params.viewMode === 'general' || !params.opponentId || params.opponentId <= 0;
        let opggData;
        if (isGeneral) {
          opggData = await opggClientInstancia.getChampionAnalysis({
            championId: params.championId,
            role: params.role,
            elo: params.elo || 'emerald_plus',
            patch: params.patch || '26.20',
            forceRefresh: params.forceRefresh,
          });
        } else {
          opggData = await opggClientInstancia.getLaneMatchupGuide({
            championId: params.championId,
            opponentId: params.opponentId,
            role: params.role,
            patch: params.patch || '26.20',
            elo: params.elo || 'emerald_plus',
            forceRefresh: params.forceRefresh,
          });
        }

        const champName = getChampionName(params.championId);
        const rec = opggClientInstancia.construirRecomendacionDeterminista(
          opggData,
          champName,
          params.role,
          params.patch || '26.20',
          isGeneral
        );
        return rec;
      } catch (err) {
        console.warn('[PuenteNativo] Error consultando OP.GG MCP, usando fallback táctico:', err);
        return getAccurateFallbackRecommendation({
          championId: params.championId,
          opponentId: params.opponentId,
          role: params.role,
          patch: params.patch || '26.20',
        });
      }
    },
    getDraftRecommendations: (params: {
      role: Role;
      patch: string;
      allies: number[];
      enemies: number[];
      bans: number[];
      pickableChampionIds?: number[];
      forceRefresh?: boolean;
    }) => genericInvoke(IPC_CHANNELS.AI_GET_DRAFT_RECOMMENDATIONS, params),

    // Data Dragon
    getChampionCatalog: () => genericInvoke(IPC_CHANNELS.DDRAGON_GET_CATALOG),
    getPatchVersion: (): Promise<string> => genericInvoke(IPC_CHANNELS.DDRAGON_GET_PATCH),
    refreshDataDragon: (): Promise<{ patch: string; championsCount: number; champions?: any[] }> =>
      genericInvoke(IPC_CHANNELS.DDRAGON_REFRESH_DATA),
    getPatchDiff: (patch?: string) => genericInvoke(IPC_CHANNELS.PATCH_DIFF_GET, patch),
    getGroundingQuota: () => genericInvoke(IPC_CHANNELS.AI_GET_GROUNDING_QUOTA),
    getOpGgMatchup: async (params: {
      championId: number;
      opponentId?: number;
      role: Role;
      patch?: string;
      elo?: string;
      forceRefresh?: boolean;
      viewMode?: 'general' | 'matchup';
    }) => {
      try {
        if (params.viewMode === 'general' || !params.opponentId || params.opponentId <= 0) {
          return await opggClientInstancia.getChampionAnalysis({
            championId: params.championId,
            role: params.role,
            elo: params.elo,
            patch: params.patch,
            forceRefresh: params.forceRefresh,
          });
        }
        return await opggClientInstancia.getLaneMatchupGuide(params as any);
      } catch (err) {
        return genericInvoke(IPC_CHANNELS.OPGG_GET_MATCHUP, params);
      }
    },
    cleanAppAssets: () => genericInvoke(IPC_CHANNELS.LCU_CLEAN_APP_ASSETS),
    getClientVersion: () => genericInvoke(IPC_CHANNELS.LCU_GET_CLIENT_VERSION),
    syncLocalAccount: () => genericInvoke(IPC_CHANNELS.LCU_SYNC_LOCAL_ACCOUNT),
    exportDiagnostic: () => genericInvoke(IPC_CHANNELS.SETTINGS_EXPORT_DIAGNOSTIC),

    // In-Game Overlay y Modos
    overlayShow: (): Promise<{ success: boolean }> => genericInvoke(IPC_CHANNELS.OVERLAY_SHOW),
    overlayHide: (): Promise<{ success: boolean }> => genericInvoke(IPC_CHANNELS.OVERLAY_HIDE),
    overlayToggle: (): Promise<{ visible: boolean }> => genericInvoke(IPC_CHANNELS.OVERLAY_TOGGLE),
    overlayGetState: (): Promise<OverlayState> => genericInvoke(IPC_CHANNELS.OVERLAY_GET_STATE),
    getChampionAugments: (params: {
      championId: number;
      mode: TipoModo;
      patch?: string;
    }): Promise<DatosModoCampeon> => genericInvoke(IPC_CHANNELS.MODES_GET_CHAMPION_AUGMENTS, params),
    checkBorderless: (
      installationPath?: string
    ): Promise<{ isBorderless: boolean; windowMode: number; configPath: string }> =>
      genericInvoke(IPC_CHANNELS.MODES_CHECK_BORDERLESS, installationPath),
    applyBorderless: (
      installationPath?: string
    ): Promise<{ success: boolean; configPath: string; previousMode: number }> =>
      genericInvoke(IPC_CHANNELS.MODES_APPLY_BORDERLESS, installationPath),
    getGameMode: (): Promise<TipoModo | null> => genericInvoke(IPC_CHANNELS.LCU_GET_GAME_MODE),
    onGameModeChanged: (cb: (mode: TipoModo | null) => void) => on(IPC_CHANNELS.LCU_GAME_MODE_CHANGED, cb),
    setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) =>
      send('overlay:set-ignore-mouse-events', { ignore, forward: options?.forward ?? true }),
    reanalyzeScreenAugments: (): Promise<boolean> => genericInvoke('overlay:reanalyze'),
    onOverlayStateChanged: (cb: (state: OverlayState) => void) =>
      on(IPC_CHANNELS.OVERLAY_STATE_CHANGED, cb),
  };

  return api;
}

/**
 * Mock seguro para ejecuciones en desarrollo web puro o vitest sin Tauri activo.
 */
function fallbackMock(channel: string, args: any[]): any {
  if (channel === IPC_CHANNELS.OVERLAY_GET_STATE) {
    return Promise.resolve({
      visible: false,
      championId: 0,
      championName: 'Desconocido',
      mode: 'aram_mayhem',
      cards: [],
      bestCardIndex: null,
      isAnalyzing: false,
    });
  }
  if (channel === IPC_CHANNELS.SETTINGS_GET) {
    return Promise.resolve({
      leaguePath: '',
      autoAccept: { enabled: true, delaySeconds: 2 },
      aiProvider: 'gemini',
    });
  }
  if (channel === IPC_CHANNELS.LCU_GET_STATE) {
    return Promise.resolve({
      connected: false,
      phase: 'None',
    });
  }
  return Promise.resolve({ success: true });
}

// Inyectar en el entorno global de forma inmediata si estamos en el navegador
if (typeof window !== 'undefined') {
  const puente = crearPuenteNativo();
  (window as any).api = puente;
  (window as any).electronAPI = puente;
}
