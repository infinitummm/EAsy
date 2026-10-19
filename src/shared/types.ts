/**
 * Tipos de dominio compartidos para Itero Local.
 * Este archivo es propiedad exclusiva de ANTIGRAVITY.
 */

// ==========================================
// Roles y Enrutamiento Regional
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
  tokenBase64: string;
}

export interface ReadyCheckEvent {
  state: 'InProgress' | 'EveryoneReady' | 'StrangerNotReady';
  playerResponse: 'None' | 'Accepted' | 'Declined';
  suppressCountdown: boolean;
  timer: number;
}

// ==========================================
// Champ Select
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
  selectedPerkIds: number[]; // Exactamente 9 IDs
  current: boolean;
  isActive?: boolean;
}

// ==========================================
// DTOs de Riot API
// ==========================================
export interface RiotAccountDto {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface RiotSummonerDto {
  id: string;
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
    participants: string[];
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
  teamPosition: string;
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
  item6: number;
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
// Recomendación de IA Gemini
// ==========================================
export interface GeminiMatchupRecommendation {
  championId: number;
  opponentChampionId: number;
  assignedRole: Role;
  patchVersion: string;
  difficultyRating: number;
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
    priority: string[];
    firstThreeLevels: string[];
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
    delaySeconds: number;
    humanVariance: boolean;
  };
  autoChampSelect: {
    autoHover: boolean;
    autoPick: boolean;
    autoBan: boolean;
    autoSpells: boolean;
    rolePreferences: Record<Role, {
      preferredChampions: number[];
      fallbackChampions: number[];
      banChampions: number[];
      spells: [number, number];
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
