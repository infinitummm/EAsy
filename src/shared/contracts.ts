/**
 * Contratos e interfaces públicas para los servicios de Itero Local.
 * Este archivo es propiedad exclusiva de ANTIGRAVITY.
 */

import { EventEmitter } from 'node:events';
import {
  LcuConnectionState,
  GameflowPhase,
  ChampSelectSession,
  RunePage,
  RiotAccountDto,
  RiotSummonerDto,
  RankedEntryDto,
  ChampionMasteryDto,
  MatchDto,
  ParsedMatchSummary,
  GeminiMatchupRecommendation,
  AppSettings,
  RegionalRouting,
  PlatformRouting,
  PersonalChampionStats
} from './types';

// ==========================================
// 1. Cliente LCU
// ==========================================
export interface ILcuClient extends EventEmitter {
  initialize(): Promise<void>;
  disconnect(): void;
  getConnectionState(): LcuConnectionState;
  getGameflowPhase(): GameflowPhase;
  request<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', endpoint: string, body?: unknown): Promise<T>;
  acceptReadyCheck(): Promise<void>;
  setAutoAccept(enabled: boolean, delaySeconds?: number): void;
  injectRunePage(page: RunePage): Promise<{ success: boolean; pageId?: number; error?: string }>;
  selectChampion(actionId: number, championId: number, completed: boolean): Promise<void>;
  banChampion(actionId: number, championId: number, completed: boolean): Promise<void>;
  setSummonerSpells(spell1Id: number, spell2Id: number): Promise<void>;
  getChampSelectSession(): Promise<ChampSelectSession | null>;
  getPickableChampionIds?(): Promise<number[]>;
  getBannableChampionIds?(): Promise<number[]>;
}

// ==========================================
// 2. Limitador de Tasa (Token Bucket)
// ==========================================
export interface RateLimitStatus {
  service: 'RIOT' | 'GEMINI';
  tokensAvailableShort: number;
  tokensAvailableLong: number;
  isThrottled: boolean;
  backoffMs: number;
}

export interface IRateLimiter {
  acquire(): Promise<void>;
  reportResult(statusCode: number, retryAfterSeconds?: number): void;
  getStatus(): RateLimitStatus;
}

// ==========================================
// 3. Cliente Riot API
// ==========================================
export interface KeyHealthStatus {
  valid: boolean;
  statusCode?: number;
  isExpired: boolean;
  lastChecked: number;
}

export interface IRiotApiClient {
  setApiKey(key: string): void;
  getAccountByRiotId(gameName: string, tagLine: string, regional: RegionalRouting): Promise<RiotAccountDto>;
  getSummonerByPuuid(puuid: string, platform: PlatformRouting): Promise<RiotSummonerDto>;
  getRankedEntries(summonerId: string, platform: PlatformRouting): Promise<RankedEntryDto[]>;
  getChampionMasteries(puuid: string, platform: PlatformRouting): Promise<ChampionMasteryDto[]>;
  getMatchHistory(puuid: string, regional: RegionalRouting, count?: number): Promise<string[]>;
  getMatchById(matchId: string, regional: RegionalRouting): Promise<MatchDto>;
  checkKeyHealth(): Promise<KeyHealthStatus>;
}

// ==========================================
// 4. Parser de Partidas
// ==========================================
export interface IMatchParser {
  parse(match: MatchDto, targetPuuid: string): ParsedMatchSummary;
  calculateStats(summaries: ParsedMatchSummary[]): {
    totalMatches: number;
    winrate: number;
    avgKda: number;
    avgCsPerMinute: number;
    roleDistribution: Record<string, number>;
  };
}

// ==========================================
// 5. Base de Datos SQLite
// ==========================================
export interface AccountEntity {
  puuid: string;
  gameName: string;
  tagLine: string;
  platform: string;
  regional: string;
  summonerId?: string;
  profileIconId: number;
  summonerLevel: number;
  tier?: string;
  rank?: string;
  leaguePoints: number;
  updatedAt: number;
}

export interface IDatabaseService {
  initialize(): Promise<void>;
  close(): void;
  getAccounts(): AccountEntity[];
  getAccount(puuid: string): AccountEntity | null;
  upsertAccount(account: AccountEntity): void;
  saveMatch(summary: ParsedMatchSummary, opponentId?: number): void;
  hasMatch(matchId: string): boolean;
  getRecentMatches(puuid: string, limit?: number): ParsedMatchSummary[];
  getPersonalChampionStats(puuid: string, championId: number, opponentId?: number): PersonalChampionStats | null;
  getMatchupCache(cacheKey: string): GeminiMatchupRecommendation | null;
  setMatchupCache(cacheKey: string, data: GeminiMatchupRecommendation, ttlSeconds?: number): void;
  pruneExpiredCache(): number;
  getSettings(): AppSettings;
  saveSettings(settings: Partial<AppSettings>): void;
  recordApiCall(api: 'RIOT' | 'GEMINI' | 'OPGG', endpoint: string, statusCode: number): void;
  getApiCallCount(api: 'RIOT' | 'GEMINI' | 'OPGG', windowMs: number): number;
}

// ==========================================
// 6. Seguridad y Cifrado
// ==========================================
export interface ISecurityService {
  encrypt(plainText: string): string;
  decrypt(cipherText: string): string;
}
