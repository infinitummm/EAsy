/**
 * Canales IPC y contratos de eventos de Itero Local.
 * Este archivo es propiedad exclusiva de ANTIGRAVITY.
 */

import {
  LcuConnectionState,
  GameflowPhase,
  ReadyCheckEvent,
  ChampSelectSession,
  RunePage,
  AppSettings,
  RegionalRouting,
  PlatformRouting,
  Role,
  GeminiMatchupRecommendation,
  ParsedMatchSummary,
  LcuDetectionReport,
  LcuStateInfo,
} from './types';
import { AccountEntity, KeyHealthStatus } from './contracts';

// ==========================================
// Nombres de Canales IPC
// ==========================================
export const IPC_CHANNELS = {
  // Eventos emitidos por Main hacia Renderer
  LCU_STATE_CHANGED: 'lcu:state-changed',
  LCU_GAMEFLOW_CHANGED: 'lcu:gameflow-changed',
  LCU_READY_CHECK: 'lcu:ready-check',
  LCU_CHAMP_SELECT_SESSION: 'lcu:champ-select-session',
  LCU_PERMISSION_ERROR: 'lcu:permission-error',
  LCU_AUTO_ACCEPT_EVENT: 'lcu:auto-accept-event',
  RIOT_KEY_WARNING: 'riot:key-warning',
  API_QUOTA_UPDATED: 'api:quota-updated',

  // Invocaciones de Renderer hacia Main
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  LCU_GET_STATE: 'lcu:get-state',
  LCU_TEST_DETECTION: 'lcu:test-detection',
  LCU_SELECT_FOLDER: 'lcu:select-folder',
  LCU_SET_AUTO_ACCEPT: 'lcu:set-auto-accept',
  LCU_GET_AUTO_ACCEPT_STATUS: 'lcu:get-auto-accept-status',
  LCU_GET_PICKABLE_CHAMPIONS: 'lcu:get-pickable-champions',
  LCU_HOVER_CHAMPION: 'lcu:hover-champion',
  LCU_APPLY_RUNES: 'lcu:apply-runes',
  LCU_APPLY_BUILD: 'lcu:apply-build',
  RIOT_VALIDATE_KEY: 'riot:validate-key',
  RIOT_SYNC_ACCOUNT: 'riot:sync-account',
  RIOT_GET_PROFILE: 'riot:get-profile',
  AI_GET_MATCHUP_ADVICE: 'ai:get-matchup-advice',
  AI_GET_DRAFT_RECOMMENDATIONS: 'ai:get-draft-recommendations',
  DDRAGON_GET_PATCH: 'ddragon:get-patch',
  DDRAGON_REFRESH_DATA: 'ddragon:refresh-data',
  DDRAGON_GET_CATALOG: 'ddragon:get-catalog',
  PATCH_DIFF_GET: 'patch-diff:get',
  AI_GET_GROUNDING_QUOTA: 'ai:get-grounding-quota',
  OPGG_GET_MATCHUP: 'opgg:get-matchup',
  LCU_CLEAN_APP_ASSETS: 'lcu:clean-app-assets',
  LCU_GET_CLIENT_VERSION: 'lcu:get-client-version',
  LCU_SYNC_LOCAL_ACCOUNT: 'lcu:sync-local-account',
  SETTINGS_EXPORT_DIAGNOSTIC: 'settings:export-diagnostic',
} as const;

// ==========================================
// Mapa de Tipos para Invocaciones IPC
// ==========================================
export interface IpcInvokeHandlers {
  [IPC_CHANNELS.SETTINGS_GET]: () => Promise<AppSettings>;
  [IPC_CHANNELS.SETTINGS_SAVE]: (settings: Partial<AppSettings>) => Promise<{ success: boolean }>;
  [IPC_CHANNELS.LCU_GET_STATE]: () => Promise<LcuStateInfo>;
  [IPC_CHANNELS.LCU_TEST_DETECTION]: (manualPath?: string) => Promise<LcuDetectionReport>;
  [IPC_CHANNELS.LCU_SELECT_FOLDER]: () => Promise<string | null>;
  [IPC_CHANNELS.LCU_SET_AUTO_ACCEPT]: (params: { enabled: boolean; delaySeconds: number }) => Promise<void>;
  [IPC_CHANNELS.LCU_GET_AUTO_ACCEPT_STATUS]: () => Promise<{
    enabled: boolean;
    delaySeconds: number;
    humanVariance: boolean;
    lastAction: string;
    lastActionTimestamp?: number;
  }>;
  [IPC_CHANNELS.LCU_GET_PICKABLE_CHAMPIONS]: () => Promise<number[]>;
  [IPC_CHANNELS.LCU_HOVER_CHAMPION]: (championId: number) => Promise<{ success: boolean; error?: string }>;
  [IPC_CHANNELS.LCU_APPLY_RUNES]: (page: RunePage) => Promise<{ success: boolean; error?: string }>;
  [IPC_CHANNELS.LCU_APPLY_BUILD]: (params: {
    championId: number;
    title?: string;
    build: any;
  }) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  [IPC_CHANNELS.RIOT_VALIDATE_KEY]: (apiKey: string) => Promise<KeyHealthStatus>;
  [IPC_CHANNELS.RIOT_SYNC_ACCOUNT]: (params: {
    gameName: string;
    tagLine: string;
    platform: PlatformRouting;
    regional: RegionalRouting;
  }) => Promise<{ success: boolean; error?: string }>;
  [IPC_CHANNELS.RIOT_GET_PROFILE]: (puuid: string) => Promise<{
    account: AccountEntity;
    matches: ParsedMatchSummary[];
  }>;
  [IPC_CHANNELS.DDRAGON_GET_PATCH]: () => Promise<string>;
  [IPC_CHANNELS.DDRAGON_REFRESH_DATA]: () => Promise<{ patch: string; championsCount: number; champions?: any[] }>;
  [IPC_CHANNELS.DDRAGON_GET_CATALOG]: () => Promise<{ patch: string; displayPatch: string; champions: any[]; count: number }>;
  [IPC_CHANNELS.AI_GET_MATCHUP_ADVICE]: (params: {
    championId: number;
    opponentId: number;
    role: Role;
    patch: string;
    allies: number[];
    enemies: number[];
    forceRefresh?: boolean;
  }) => Promise<GeminiMatchupRecommendation>;
  [IPC_CHANNELS.AI_GET_DRAFT_RECOMMENDATIONS]: (params: {
    role: Role;
    patch: string;
    allies: number[];
    enemies: number[];
    bans: number[];
    pickableChampionIds?: number[];
    forceRefresh?: boolean;
  }) => Promise<any>;
  [IPC_CHANNELS.OPGG_GET_MATCHUP]: (params: {
    championId: number;
    opponentId?: number;
    role: Role;
    patch?: string;
    elo?: string;
    forceRefresh?: boolean;
  }) => Promise<any>;
  [IPC_CHANNELS.LCU_CLEAN_APP_ASSETS]: () => Promise<{ deletedItemSets: number; deletedRunePages: number; success: boolean }>;
  [IPC_CHANNELS.LCU_GET_CLIENT_VERSION]: () => Promise<{ clientVersion?: string; ddragonVersion: string; matches: boolean; displayPatch: string }>;
  [IPC_CHANNELS.LCU_SYNC_LOCAL_ACCOUNT]: () => Promise<{ success: boolean; account?: AccountEntity; error?: string }>;
  [IPC_CHANNELS.SETTINGS_EXPORT_DIAGNOSTIC]: () => Promise<{ success: boolean; filePath?: string; error?: string }>;
}

// ==========================================
// Mapa de Payloads para Eventos Emitidos
// ==========================================
export interface IpcEventPayloads {
  [IPC_CHANNELS.LCU_STATE_CHANGED]: LcuConnectionState;
  [IPC_CHANNELS.LCU_GAMEFLOW_CHANGED]: GameflowPhase;
  [IPC_CHANNELS.LCU_READY_CHECK]: ReadyCheckEvent;
  [IPC_CHANNELS.LCU_CHAMP_SELECT_SESSION]: ChampSelectSession | null;
  [IPC_CHANNELS.LCU_PERMISSION_ERROR]: boolean;
  [IPC_CHANNELS.LCU_AUTO_ACCEPT_EVENT]: { action: string; timestamp: number; delay?: number };
  [IPC_CHANNELS.RIOT_KEY_WARNING]: KeyHealthStatus;
  [IPC_CHANNELS.API_QUOTA_UPDATED]: { riotCount: number; geminiCount: number };
}
