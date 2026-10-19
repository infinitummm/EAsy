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
  applyRunes: (page: RunePage): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.LCU_APPLY_RUNES, page),

  // Riot API
  validateKey: (apiKey: string) => ipcRenderer.invoke(IPC_CHANNELS.RIOT_VALIDATE_KEY, apiKey),
  syncAccount: (params: { gameName: string; tagLine: string; platform: PlatformRouting; regional: RegionalRouting }) =>
    ipcRenderer.invoke(IPC_CHANNELS.RIOT_SYNC_ACCOUNT, params),
  getProfile: (puuid: string) => ipcRenderer.invoke(IPC_CHANNELS.RIOT_GET_PROFILE, puuid),

  // Gemini AI Matchup
  getMatchupAdvice: (params: { championId: number; opponentId: number; role: Role; patch: string; allies: number[]; enemies: number[] }) =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_GET_MATCHUP_ADVICE, params),

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
