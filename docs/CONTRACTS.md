# Contratos Técnicos de Interfaces, Eventos y Base de Datos (CONTRACTS.md)

Este documento contiene las definiciones exactas e inmutables de tipos TypeScript, esquemas SQLite, eventos y firmas públicas que rigen la comunicación entre módulos.

> **REGLA DE ORO:** OpenCode implementará sus módulos (`src/main/lcu/`, `src/main/riot/`, `src/main/db/`, `src/main/ratelimit/`, `src/main/security/`) respetando estas firmas con precisión absoluta. Cualquier ambigüedad o solicitud de modificación debe registrarse en `docs/REQUESTS.md`.

---

## 1. Tipos de Dominio y Constantes Compartidas (`src/shared/types.ts`)

```typescript
// ==========================================
// Identificadores y Roles
// ==========================================
export type Role = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY' | 'FILL';

export type RegionalRouting = 'americas' | 'asia' | 'europe' | 'sea';

export type PlatformRouting =
  | 'la1' | 'la2' | 'na1' | 'br1'
  | 'euw1' | 'eun1' | 'tr1' | 'ru'
  | 'kr' | 'jp1' | 'oc1' | 'ph2' | 'sg2' | 'th2' | 'tw2' | 'vn2';

export interface RiotId {
  gameName: string;
  tagLine: string;
}

// ==========================================
// Estado de LCU y Gameflow
// ==========================================
export type LcuConnectionState = 'disconnected' | 'connecting' | 'connected';

export type GameflowPhase =
  | 'None'
  | 'Lobby'
  | 'Matchmaking'
  | 'ReadyCheck'
  | 'ChampSelect'
  | 'InProgress'
  | 'WaitingForStats'
  | 'PreEndOfGame'
  | 'WatchInProgress';

export interface LcuCredentials {
  processName: string;
  pid: number;
  port: number;
  password: string;
  protocol: string;
  tokenBase64: string; // "Basic " + base64("riot:" + password)
}

export interface ReadyCheckEvent {
  state: 'InProgress' | 'EveryoneReady' | 'StrangerNotReady';
  playerResponse: 'None' | 'Accepted' | 'Declined';
  suppressCountdown: boolean;
  timer: number;
}

// ==========================================
// Champ Select Session Data
// ==========================================
export interface ChampSelectAction {
  id: number;
  actorCellId: number;
  championId: number;
  completed: boolean;
  type: 'pick' | 'ban' | 'vote';
  isAllyAction: boolean;
  isInProgress: boolean;
}

export interface ChampSelectPlayer {
  cellId: number;
  championId: number;
  championPickIntent: number;
  assignedPosition: Role;
  spell1Id: number;
  spell2Id: number;
  summonerId: number;
  puuid: string;
}

export interface ChampSelectSession {
  gameId: number;
  localPlayerCellId: number;
  hasSimultaneousBans: boolean;
  hasSimultaneousPicks: boolean;
  isCustomGame: boolean;
  actions: ChampSelectAction[][];
  myTeam: ChampSelectPlayer[];
  theirTeam: ChampSelectPlayer[];
  bans: {
    myTeamBans: number[];
    theirTeamBans: number[];
    numBans: number;
  };
  timer: {
    adjustedTimeLeftInPhase: number;
    internalNowInEpochMs: number;
    phase: string;
    totalTimeInPhase: number;
  };
}

// ==========================================
// Páginas de Runas
// ==========================================
export interface RunePage {
  id?: number;
  name: string;
  primaryStyleId: number;
  subStyleId: number;
  selectedPerkIds: number[]; // Exactamente 9 perks: [p1, p2, p3, p4, s1, s2, shard1, shard2, shard3]
  current: boolean;
  isActive?: boolean;
}

// ==========================================
// DTOs de Riot API Oficial
// ==========================================
export interface RiotAccountDto {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface RiotSummonerDto {
  id: string; // Encrypted summonerId
  accountId: string;
  puuid: string;
  profileIconId: number;
  revisionDate: number;
  summonerLevel: number;
}

export interface RankedEntryDto {
  leagueId: string;
  summonerId: string;
  queueType: 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR';
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  veteran: boolean;
  inactive: boolean;
  freshBlood: boolean;
  hotStreak: boolean;
}

export interface ChampionMasteryDto {
  puuid: string;
  championId: number;
  championLevel: number;
  championPoints: number;
  lastPlayTime: number;
  championPointsSinceLastLevel: number;
  championPointsUntilNextLevel: number;
  chestGranted: boolean;
  tokensEarned: number;
}

export interface MatchDto {
  metadata: {
    dataVersion: string;
    matchId: string;
    participants: string[]; // PUUIDs
  };
  info: {
    gameCreation: number;
    gameDuration: number;
    gameEndTimestamp: number;
    gameId: number;
    gameMode: string;
    gameName: string;
    gameStartTimestamp: number;
    gameType: string;
    gameVersion: string;
    mapId: number;
    participants: MatchParticipantDto[];
    platformId: string;
    queueId: number;
  };
}

export interface MatchParticipantDto {
  puuid: string;
  summonerId: string;
  summonerName: string;
  riotIdGameName?: string;
  riotIdTagline?: string;
  championId: number;
  championName: string;
  teamPosition: string; // TOP, JUNGLE, MIDDLE, BOTTOM, UTILITY
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalDamageDealtToChampions: number;
  goldEarned: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number; // Trinket
  perks: {
    statPerks: {
      defense: number;
      flex: number;
      offense: number;
    };
    styles: Array<{
      description: 'primaryStyle' | 'subStyle';
      selections: Array<{ perk: number; var1: number; var2: number; var3: number }>;
      style: number;
    }>;
  };
}

export interface ParsedMatchSummary {
  matchId: string;
  puuid: string;
  gameCreation: number;
  gameDuration: number;
  gameVersion: string;
  queueId: number;
  championId: number;
  championName: string;
  role: Role;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  cs: number;
  csPerMinute: number;
  goldEarned: number;
  damageDealt: number;
  items: number[];
  primaryStyleId: number;
  subStyleId: number;
  selectedPerks: number[];
}

// ==========================================
// Estructuras de Salida de Gemini AI
// ==========================================
export interface GeminiMatchupRecommendation {
  championId: number;
  opponentChampionId: number;
  assignedRole: Role;
  patchVersion: string;
  difficultyRating: number; // 1 (Muy Fácil) a 10 (Extremadamente Difícil)
  matchupSummary: string;
  runesRecommendation: {
    primaryStyleId: number;
    subStyleId: number;
    selectedPerkIds: number[];
    rationale: string;
  };
  buildRecommendation: {
    startingItems: number[];
    coreItems: number[];
    situationalItems: Array<{ itemId: number; condition: string }>;
    rationale: string;
  };
  skillOrder: {
    priority: string[]; // Ej: ["Q", "E", "W"]
    firstThreeLevels: string[]; // Ej: ["Q", "W", "E"]
    rationale: string;
  };
  earlyGameStrategy: {
    waveManagement: string;
    tradingPlan: string;
    levelSpikes: string[];
  };
  threatAnalysis: {
    enemyThreats: string[];
    winCondition: string;
  };
}

// ==========================================
// Configuración de la Aplicación
// ==========================================
export interface AppSettings {
  autoAccept: {
    enabled: boolean;
    delaySeconds: number; // 0 a 8
    humanVariance: boolean;
  };
  autoChampSelect: {
    autoHover: boolean;
    autoPick: boolean;
    autoBan: boolean;
    autoSpells: boolean;
    rolePreferences: Record<Role, {
      preferredChampions: number[]; // IDs en orden de prioridad
      fallbackChampions: number[];
      banChampions: number[];
      spells: [number, number]; // [Spell1, Spell2]
    }>;
  };
  apiKeys: {
    riotApiKeyEncrypted: string;
    geminiApiKeyEncrypted: string;
  };
  activeAccount: {
    puuid: string;
    gameName: string;
    tagLine: string;
    platform: PlatformRouting;
    regional: RegionalRouting;
  } | null;
}
```

---

## 2. Esquema de Base de Datos SQLite (`src/main/db/schema.sql`)

La base de datos corre embebida en disco en `itero_local.sqlite` utilizando `better-sqlite3`.

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

-- Tabla de Cuentas de Invocador Vinculadas
CREATE TABLE IF NOT EXISTS accounts (
    puuid TEXT PRIMARY KEY,
    game_name TEXT NOT NULL,
    tag_line TEXT NOT NULL,
    platform TEXT NOT NULL,
    regional TEXT NOT NULL,
    summoner_id TEXT,
    profile_icon_id INTEGER DEFAULT 0,
    summoner_level INTEGER DEFAULT 1,
    tier TEXT,
    rank TEXT,
    league_points INTEGER DEFAULT 0,
    updated_at INTEGER NOT NULL
);

-- Tabla de Partidas
CREATE TABLE IF NOT EXISTS matches (
    match_id TEXT PRIMARY KEY,
    game_creation INTEGER NOT NULL,
    game_duration INTEGER NOT NULL,
    game_version TEXT NOT NULL,
    queue_id INTEGER NOT NULL,
    parsed_at INTEGER NOT NULL
);

-- Participantes de Partidas (Historial Personal y Rivales de Línea)
CREATE TABLE IF NOT EXISTS match_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT NOT NULL,
    puuid TEXT NOT NULL,
    champion_id INTEGER NOT NULL,
    champion_name TEXT NOT NULL,
    role TEXT NOT NULL,
    win INTEGER NOT NULL, -- 0 o 1
    kills INTEGER NOT NULL,
    deaths INTEGER NOT NULL,
    assists INTEGER NOT NULL,
    cs INTEGER NOT NULL,
    gold_earned INTEGER NOT NULL,
    damage_dealt INTEGER NOT NULL,
    items_json TEXT NOT NULL, -- Array JSON de item IDs
    perks_json TEXT NOT NULL, -- Array JSON de perks
    FOREIGN KEY(match_id) REFERENCES matches(match_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_match_participants_puuid ON match_participants(puuid);
CREATE INDEX IF NOT EXISTS idx_match_participants_champ ON match_participants(champion_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_role ON match_participants(role);

-- Caché Persistente de Recomendaciones de IA por Matchup y Parche
CREATE TABLE IF NOT EXISTS matchup_cache (
    cache_key TEXT PRIMARY KEY, -- HASH(champion_id:opponent_id:role:patch)
    champion_id INTEGER NOT NULL,
    opponent_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    patch_version TEXT NOT NULL,
    recommendation_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matchup_cache_expires ON matchup_cache(expires_at);

-- Tabla Clave-Valor para Configuraciones Locales
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Registro de Consumo y Cuotas de APIs
CREATE TABLE IF NOT EXISTS api_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_name TEXT NOT NULL, -- 'RIOT' | 'GEMINI'
    endpoint TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_usage_timestamp ON api_usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_api_usage_api ON api_usage(api_name, timestamp);
```

---

## 3. Interfaces Públicas de Módulos (`src/shared/contracts.ts`)

### 3.1. Cliente LCU (`src/main/lcu/ILcuClient.ts`)
```typescript
import { EventEmitter } from 'node:events';
import { LcuConnectionState, GameflowPhase, ChampSelectSession, RunePage, ReadyCheckEvent } from './types';

export interface ILcuClient extends EventEmitter {
  initialize(): Promise<void>;
  disconnect(): void;
  getConnectionState(): LcuConnectionState;
  getGameflowPhase(): GameflowPhase;
  
  // Llamada HTTP genérica al cliente local de League
  request<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', endpoint: string, body?: unknown): Promise<T>;
  
  // Acciones de conveniencia
  acceptReadyCheck(): Promise<void>;
  setAutoAccept(enabled: boolean, delaySeconds?: number): void;
  injectRunePage(page: RunePage): Promise<{ success: boolean; pageId?: number; error?: string }>;
  selectChampion(actionId: number, championId: number, completed: boolean): Promise<void>;
  banChampion(actionId: number, championId: number, completed: boolean): Promise<void>;
  setSummonerSpells(spell1Id: number, spell2Id: number): Promise<void>;
  getChampSelectSession(): Promise<ChampSelectSession | null>;
}
```

### 3.2. Limitador de Tasa Token Bucket (`src/main/ratelimit/IRateLimiter.ts`)
```typescript
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
```

### 3.3. Cliente Riot API (`src/main/riot/IRiotApiClient.ts`)
```typescript
import {
  RiotAccountDto,
  RiotSummonerDto,
  RankedEntryDto,
  ChampionMasteryDto,
  MatchDto,
  RegionalRouting,
  PlatformRouting
} from './types';

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
```

### 3.4. Parser de Partidas (`src/main/riot/IMatchParser.ts`)
```typescript
import { MatchDto, ParsedMatchSummary } from './types';

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
```

### 3.5. Capa de Datos SQLite (`src/main/db/IDatabaseService.ts`)
```typescript
import {
  AppSettings,
  ParsedMatchSummary,
  GeminiMatchupRecommendation,
  RiotAccountDto,
  RankedEntryDto
} from './types';

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
  
  // Cuentas
  getAccounts(): AccountEntity[];
  getAccount(puuid: string): AccountEntity | null;
  upsertAccount(account: AccountEntity): void;
  
  // Partidas
  saveMatch(summary: ParsedMatchSummary): void;
  hasMatch(matchId: string): boolean;
  getRecentMatches(puuid: string, limit?: number): ParsedMatchSummary[];
  
  // Caché de Matchups
  getMatchupCache(cacheKey: string): GeminiMatchupRecommendation | null;
  setMatchupCache(cacheKey: string, data: GeminiMatchupRecommendation, ttlSeconds?: number): void;
  pruneExpiredCache(): number;
  
  // Ajustes
  getSettings(): AppSettings;
  saveSettings(settings: Partial<AppSettings>): void;
  
  // Métricas de Consumo
  recordApiCall(api: 'RIOT' | 'GEMINI', endpoint: string, statusCode: number): void;
  getApiCallCount(api: 'RIOT' | 'GEMINI', windowMs: number): number;
}
```

### 3.6. Seguridad y Cifrado (`src/main/security/ISecurityService.ts`)
```typescript
export interface ISecurityService {
  encrypt(plainText: string): string; // Formato IV:AuthTag:CipherText (Hex)
  decrypt(cipherText: string): string;
}
```

---

## 4. Canales y Eventos IPC (`src/shared/events.ts`)

### 4.1. Eventos Unidireccionales (Main -> Renderer)
Los envía Electron Main hacia la ventana con `webContents.send(channel, payload)`:

| Canal IPC | Tipo de Payload | Momento de Emisión |
| :--- | :--- | :--- |
| `lcu:state-changed` | `LcuConnectionState` | Cuando el cliente LoL se conecta, desconecta o entra en reconexión. |
| `lcu:gameflow-changed` | `GameflowPhase` | Cuando el jugador pasa a ReadyCheck, ChampSelect, Lobby, etc. |
| `lcu:ready-check` | `ReadyCheckEvent` | Al aparecer la pantalla emergente de "Partida Encontrada". |
| `lcu:champ-select-session`| `ChampSelectSession \| null` | En cada actualización de la sala de selección de campeón. |
| `riot:key-warning` | `KeyHealthStatus` | Cuando la Riot API Key de 24h expira o arroja 403 Forbidden. |
| `api:quota-updated` | `{ riotCount: number; geminiCount: number }` | Periódicamente para el monitor de cuota en UI. |

### 4.2. Invocaciones Bidireccionales (Renderer -> Main)
El Renderer invoca `window.api.invoke(channel, args)` y el Main responde con una promesa:

```typescript
export interface IpcApiContract {
  // Configuración
  'settings:get': () => Promise<AppSettings>;
  'settings:save': (settings: Partial<AppSettings>) => Promise<{ success: boolean }>;
  
  // LCU
  'lcu:set-auto-accept': (params: { enabled: boolean; delaySeconds: number }) => Promise<void>;
  'lcu:apply-runes': (page: RunePage) => Promise<{ success: boolean; error?: string }>;
  
  // Riot API & Cuentas
  'riot:validate-key': (apiKey: string) => Promise<KeyHealthStatus>;
  'riot:sync-account': (params: { gameName: string; tagLine: string; platform: PlatformRouting; regional: RegionalRouting }) => Promise<{ success: boolean; error?: string }>;
  'riot:get-profile': (puuid: string) => Promise<{ account: AccountEntity; matches: ParsedMatchSummary[] }>;
  
  // Gemini AI Matchup
  'ai:get-matchup-advice': (params: {
    championId: number;
    opponentId: number;
    role: Role;
    patch: string;
    allies: number[];
    enemies: number[];
  }) => Promise<GeminiMatchupRecommendation>;
}
```


---

## 5. Contratos para Modos Especiales (ARAM Caos y Arena) y Overlay In-Game (v1.1.0)

### 5.1. Tipos de Dominio de Modos y Augments (`src/shared/types.ts`)

```typescript
export type TipoModo = 'ranked' | 'aram' | 'aram_mayhem' | 'arena';

export type TierBadge = 'S+' | 'S' | 'A' | 'B' | 'C' | 'D';

export type RarityAugment = 'silver' | 'gold' | 'prismatic';

export interface AugmentInfo {
  id: number;
  name: string;
  nameEs: string;
  key: string;
  rarity: RarityAugment;
  iconUrl: string;
  desc: string;
  tier: TierBadge;
  pickRate: number; // Porcentaje directo, ej. 8.6 (%)
  winRate?: number;
  isBest?: boolean;
}

export interface DatosModoCampeon {
  championId: number;
  championName: string;
  mode: TipoModo;
  patch: string;
  augments: AugmentInfo[];
  suggestedAugments: Record<RarityAugment, AugmentInfo[]>;
  lastUpdated: number;
}

export interface OverlayState {
  visible: boolean;
  isBorderless: boolean;
  gameMode: TipoModo | null;
  championId: number | null;
  championName: string | null;
  data: DatosModoCampeon | null;
  activeAugments: AugmentInfo[];
}
```

### 5.2. Esquema DDL de Caché de Modos (`src/main/db/schema.sql`)

```sql
CREATE TABLE IF NOT EXISTS mode_cache (
    cache_key TEXT PRIMARY KEY, -- ej. mode:aram_mayhem:266:16.21
    mode TEXT NOT NULL,
    champion_id INTEGER NOT NULL,
    patch_version TEXT NOT NULL,
    data_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mode_cache_expires ON mode_cache(expires_at);
```

### 5.3. Interfaz de Base de Datos Extendida (`src/shared/contracts.ts`)

```typescript
export interface IDatabaseService {
  // ... métodos existentes ...
  getModeCache(cacheKey: string): DatosModoCampeon | null;
  setModeCache(cacheKey: string, data: DatosModoCampeon, ttlSeconds?: number): void;
}
```

### 5.4. Cliente Live Client Data API (`src/shared/contracts.ts`)

```typescript
export interface ILiveClientDataClient {
  isGameActive(): Promise<boolean>;
  getActivePlayer(): Promise<{ summonerName: string; championName: string } | null>;
  getAllGameData(): Promise<any | null>;
}
```

### 5.5. Servicio de Modos y Augments (`src/shared/contracts.ts`)

```typescript
export interface IModeService {
  getChampionAugments(championId: number, mode: TipoModo, patch?: string): Promise<DatosModoCampeon>;
  checkBorderless(installationPath?: string): Promise<{ isBorderless: boolean; windowMode: number; configPath: string }>;
}
```

### 5.6. Canales IPC de Overlay y Modos (`src/shared/events.ts`)

```typescript
export const IPC_CHANNELS = {
  // ... existentes ...
  OVERLAY_SHOW: 'overlay:show',
  OVERLAY_HIDE: 'overlay:hide',
  OVERLAY_TOGGLE: 'overlay:toggle',
  OVERLAY_GET_STATE: 'overlay:get-state',
  OVERLAY_STATE_CHANGED: 'overlay:state-changed',
  MODES_GET_CHAMPION_AUGMENTS: 'modes:get-champion-augments',
  MODES_CHECK_BORDERLESS: 'modes:check-borderless',
  MODES_APPLY_BORDERLESS: 'modes:apply-borderless',

  // Canales de Visor Ligero de Aumentos y Rendimiento (Fase 10)
  AUMENTOS_DETECTADOS: 'aumentos:detectados',
  VISOR_MOSTRAR: 'visor:mostrar',
  VISOR_OCULTAR: 'visor:ocultar',
  RENDIMIENTO_ALERTA: 'rendimiento:alerta',
};
```

### 5.7. Contratos de Dominio para Visor Ligero de Aumentos (`src/shared/types.ts`)

```typescript
export type RarezaAumento = 'Plata' | 'Oro' | 'Prismático';

export interface AumentoInfo {
  idModo: number;
  apiName: string;
  nombre: string;
  icono: string;
  rareza: RarezaAumento;
}

export interface AumentoTier extends AumentoInfo {
  tier: TierBadge;
  winRate: number;
  pickRate: number;
  muestras: number;
  actualizadoEn: number;
  fuente: 'opgg_mcp' | 'opgg_web' | 'community_dragon' | 'local_cache';
  esMejorOpcion?: boolean;
}

export function calcularTierAumento(
  winRate: number,
  pickRate: number,
  muestras?: number
): TierBadge;

export function seleccionarMejorAumento(
  aumentos: AumentoTier[]
): AumentoTier | null;
```
