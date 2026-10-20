import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/events';
import {
  AppSettings,
  RunePage,
  Role,
  PlatformRouting,
  RegionalRouting,
  LcuDetectionReport,
  LcuConnectionState,
  GameflowPhase,
  LcuStateInfo
} from '../shared/types';

export const api = {
  // Configuración
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  saveSettings: (settings: Partial<AppSettings>): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE, settings),

  // LCU
  getLcuState: (): Promise<LcuStateInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.LCU_GET_STATE),
  testLcuDetection: (manualPath?: string): Promise<LcuDetectionReport> =>
    ipcRenderer.invoke(IPC_CHANNELS.LCU_TEST_DETECTION, manualPath),
  selectFolder: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.LCU_SELECT_FOLDER),
  setAutoAccept: (params: { enabled: boolean; delaySeconds: number }): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.LCU_SET_AUTO_ACCEPT, params),
  getAutoAcceptStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.LCU_GET_AUTO_ACCEPT_STATUS),
  getPickableChampions: (): Promise<number[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.LCU_GET_PICKABLE_CHAMPIONS),
  hoverChampion: (championId: number): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.LCU_HOVER_CHAMPION, championId),
  applyRunes: (page: RunePage): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.LCU_APPLY_RUNES, page),
  applyBuild: (params: { championId: number; title?: string; build: any }): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.LCU_APPLY_BUILD, params),

  // Riot API
  validateKey: (apiKey: string) => ipcRenderer.invoke(IPC_CHANNELS.RIOT_VALIDATE_KEY, apiKey),
  syncAccount: (params: { gameName: string; tagLine: string; platform: PlatformRouting; regional: RegionalRouting }) =>
    ipcRenderer.invoke(IPC_CHANNELS.RIOT_SYNC_ACCOUNT, params),
  getProfile: (puuid: string) => ipcRenderer.invoke(IPC_CHANNELS.RIOT_GET_PROFILE, puuid),

  // Gemini AI Matchup & Draft
  getMatchupAdvice: (params: { championId: number; opponentId: number; role: Role; patch: string; allies: number[]; enemies: number[]; forceRefresh?: boolean }) =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_GET_MATCHUP_ADVICE, params),
  getDraftRecommendations: (params: { role: Role; patch: string; allies: number[]; enemies: number[]; bans: number[]; pickableChampionIds?: number[]; forceRefresh?: boolean }) =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_GET_DRAFT_RECOMMENDATIONS, params),

  // Data Dragon Patch & Reload
  getPatchVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.DDRAGON_GET_PATCH),
  refreshDataDragon: (): Promise<{ patch: string; championsCount: number }> =>
    ipcRenderer.invoke(IPC_CHANNELS.DDRAGON_REFRESH_DATA),
  getPatchDiff: (patch?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PATCH_DIFF_GET, patch),
  getGroundingQuota: () =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_GET_GROUNDING_QUOTA),
  getOpGgMatchup: (params: { championId: number; opponentId: number; role: Role; patch?: string; elo?: string; forceRefresh?: boolean }) =>
    ipcRenderer.invoke(IPC_CHANNELS.OPGG_GET_MATCHUP, params),
  cleanAppAssets: () =>
    ipcRenderer.invoke(IPC_CHANNELS.LCU_CLEAN_APP_ASSETS),
  getClientVersion: () =>
    ipcRenderer.invoke(IPC_CHANNELS.LCU_GET_CLIENT_VERSION),

  // Suscripción a Eventos de Main
  on: (channel: string, callback: (...args: any[]) => void) => {
    const subscription = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  }
};

contextBridge.exposeInMainWorld('api', api);

declare global {
  interface Window {
    api: typeof api;
  }
}
