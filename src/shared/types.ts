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
    boots?: number;
    fourthItems?: number[];
    fifthItems?: number[];
    sixthItems?: number[];
    itemSetTitle?: string;
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
  source?: 'gemini' | 'fallback' | 'opgg';
  modelUsed?: string;
  generatedAt?: string;
  fallbackReason?: string;
  confidenceLevel?: ConfidenceLevel;
  sources?: GroundingSource[];
  groundingUsed?: boolean;
  researchNotes?: string;
  opggData?: OpGgMatchupData;
  dataSource?: 'opgg' | 'gemini_opgg' | 'fallback';
  isPartialBuild?: boolean;
  sampleSizeWarning?: string;
  debugInfo?: {
    rawPrompt?: string;
    rawResponse?: string;
    researchPrompt?: string;
    rawResearchResponse?: string;
    groundingSourcesFound?: number;
    validationStatus?: string;
    resolvedRunes?: Array<{ requested: string; resolvedId: number }>;
    resolvedItems?: Array<{ requested: string; resolvedId: number }>;
    runesHttpStatus?: number;
    itemSetsHttpStatus?: number;
  };
}

export type ConfidenceLevel = 'verified' | 'general' | 'sparse';

export interface GroundingSource {
  title?: string;
  uri: string;
}

export interface ItemDiffInfo {
  id: number;
  name: string;
  changeType: 'removed' | 'modified' | 'added';
  changes?: string[];
}

export interface RuneDiffInfo {
  id: number;
  name: string;
  changeType: 'removed' | 'modified' | 'added';
}

export interface PatchDiffSummary {
  currentPatch: string;
  previousPatch: string;
  removedItems: ItemDiffInfo[];
  changedItems: ItemDiffInfo[];
  removedRunes: RuneDiffInfo[];
  changedRunes: RuneDiffInfo[];
  newChampions: string[];
}

export interface PersonalChampionStats {
  championId: number;
  championName: string;
  totalGames: number;
  wins: number;
  winrate: number;
  mostBuiltItems: Array<{ id: number; name: string; count: number; winrate: number }>;
  mostUsedKeystones: Array<{ id: number; name: string; count: number; winrate: number }>;
  matchupGames?: {
    opponentId: number;
    games: number;
    wins: number;
    winrate: number;
  };
}

export interface OpGgRunePage {
  primaryPageId: number;
  primaryPageName: string;
  primaryRuneIds: number[];
  primaryRuneNames: string[];
  secondaryPageId: number;
  secondaryPageName: string;
  secondaryRuneIds: number[];
  secondaryRuneNames: string[];
  statModIds: number[];
  statModNames: string[];
  play: number;
  win: number;
  pickRate: number;
}

export interface OpGgMatchupData {
  myChampionId: number;
  opponentChampionId: number;
  position: Role;
  patch: string;
  elo: string;
  updatedAt?: string;
  runes: OpGgRunePage[];
  starterItems: Array<{ ids: number[]; names: string[]; play: number; win: number; pickRate: number }>;
  boots: Array<{ ids: number[]; names: string[]; play: number; win: number; pickRate: number }>;
  coreItems: Array<{ ids: number[]; names: string[]; play: number; win: number; pickRate: number }>;
  fourthItems?: Array<{ ids: number[]; names: string[]; play: number; win: number; pickRate: number }>;
  fifthItems?: Array<{ ids: number[]; names: string[]; play: number; win: number; pickRate: number }>;
  sixthItems?: Array<{ ids: number[]; names: string[]; play: number; win: number; pickRate: number }>;
  summonerSpells: Array<{ ids: [number, number]; names: string[]; play: number; win: number; pickRate: number }>;
  skillOrder: string[];
  skillPriority: string[];
  totalMatches: number;
  isGeneralBuildFallback?: boolean;
  sampleSizeWarning?: string;
  opponentTip?: string;
  laneAdvantage?: string;
  counters?: Array<{ championId: number; championName: string; winRate: number; play: number }>;
  dataSourceType?: 'general_analysis' | 'lane_matchup';
  eloLabel?: string;
}

export type BuildRecommendation = GeminiMatchupRecommendation['buildRecommendation'] & {
  fourthItems?: number[];
  fifthItems?: number[];
  sixthItems?: number[];
  itemSetTitle?: string;
};

// ==========================================
// Configuración de la Aplicación
// ==========================================
export interface AppSettings {
  opggTier?: 'all' | 'emerald_plus' | 'diamond_plus' | 'master_plus' | 'grandmaster' | 'challenger';
  minMatchupSampleThreshold?: number; // Umbral de partidas para matchup (default: 200)
  allowAiChoiceTop3?: boolean; // Permitir que la IA escoja entre top 3 (default: false)
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
    pickDelaySeconds?: number;
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
  leagueInstallationPath?: string;
  onboardingCompleted?: boolean;
  preferredLocale?: string;
}

// ==========================================
// Diagnóstico y Detección de LCU
// ==========================================
export interface LcuDetectionStepResult {
  step: 'process' | 'riotClientInstalls' | 'commonPaths' | 'manualPath';
  name: string;
  commandOrPath: string;
  success: boolean;
  details: string;
}

export interface LcuConnectionStepDetail {
  id: 'detection' | 'http' | 'ws' | 'state';
  name: string;
  status: 'success' | 'failure' | 'skipped';
  summary: string;
  details: string;
  error?: string;
}

export interface LcuDetectionReport {
  success: boolean;
  credentials: LcuCredentials | null;
  successfulStep?: string;
  steps: LcuDetectionStepResult[];
  testSteps?: LcuConnectionStepDetail[];
  finalState?: LcuConnectionState;
  finalGameflow?: GameflowPhase;
  lastError?: string;
  isPermissionError: boolean;
  logFilePath: string;
}

export interface LcuStateInfo {
  state: LcuConnectionState;
  gameflow: GameflowPhase;
  isPermissionError: boolean;
  port?: number;
  lastError?: string;
  lastUpdated?: string;
}

// ==========================================
// Estado de Auto-Accept en vivo
// ==========================================
export interface AutoAcceptStatusInfo {
  enabled: boolean;
  delaySeconds: number;
  humanVariance: boolean;
  lastAction: string;
  lastActionTimestamp?: number;
}

// ==========================================
// Modos de Juego Especiales (ARAM Caos, Arena) y Augments
// ==========================================
export type TipoModo = 'normal' | 'ranked' | 'aram' | 'aram_mayhem' | 'arena' | 'ARAM_MAYHEM' | 'ARENA';

/**
 * Devuelve el nombre en español legible del modo de juego para la interfaz.
 */
export function obtenerNombreModo(modo: TipoModo | null | undefined): string {
  switch (modo) {
    case 'normal':
      return 'Partida normal';
    case 'aram_mayhem':
    case 'ARAM_MAYHEM':
      return 'ARAM Caos';
    case 'aram':
      return 'ARAM normal';
    case 'arena':
    case 'ARENA':
      return 'Arena';
    case 'ranked':
      return 'Clasificatoria';
    default:
      return 'Sin partida activa';
  }
}

export type TierBadge = 'S+' | 'S' | 'A' | 'B' | 'C' | 'D' | '?';

export type RarityAugment = 'silver' | 'gold' | 'prismatic';
export type RarezaAumento = 'Plata' | 'Oro' | 'Prismático';

/**
 * Información básica de un aumento in-game.
 */
export interface AumentoInfo {
  idModo: number;
  apiName: string;
  nombre: string;
  icono: string;
  rareza: RarezaAumento;
}

/**
 * Aumento evaluado con estadísticas analíticas y tier asignado.
 */
export interface AumentoTier extends AumentoInfo {
  tier: TierBadge;
  winRate: number;
  pickRate: number;
  muestras: number;
  actualizadoEn: number;
  fuente: 'opgg_mcp' | 'opgg_web' | 'community_dragon' | 'local_cache';
  esMejorOpcion?: boolean;
}

/**
 * Regla determinista de asignación de tier a partir de winRate, pickRate y muestras.
 * Sigue el patrón analítico ponderado de OP.GG.
 */
export function calcularTierAumento(
  winRate: number,
  pickRate: number,
  muestras = 100
): TierBadge {
  if (muestras < 30) {
    // Muestra pequeña: evaluación conservadora
    if (winRate >= 56 && pickRate >= 8) return 'A';
    if (winRate >= 50) return 'B';
    return 'C';
  }

  // Puntuación combinada ponderada (winRate + bonificación por pickRate)
  const puntuacion = winRate + Math.min(pickRate, 20) * 0.5;

  if (puntuacion >= 60) return 'S+';
  if (puntuacion >= 55) return 'S';
  if (puntuacion >= 51) return 'A';
  if (puntuacion >= 47) return 'B';
  if (puntuacion >= 43) return 'C';
  return 'D';
}

/**
 * Selecciona y resalta la mejor opción entre los aumentos ofrecidos.
 */
export function seleccionarMejorAumento(aumentos: AumentoTier[]): AumentoTier | null {
  if (!aumentos || aumentos.length === 0) return null;

  const pesosTier: Record<TierBadge, number> = {
    'S+': 100,
    'S': 85,
    'A': 70,
    'B': 55,
    'C': 40,
    'D': 25,
    '?': 0,
  };

  let mejor = aumentos[0];
  let mejorPuntaje = -1;

  for (const a of aumentos) {
    const pt = (pesosTier[a.tier] || 0) * 0.6 + a.winRate * 0.3 + a.pickRate * 0.1;
    if (pt > mejorPuntaje) {
      mejorPuntaje = pt;
      mejor = a;
    }
  }

  return { ...mejor, esMejorOpcion: true };
}

export interface AugmentInfo {
  id: number;
  name: string;
  nameEs: string;
  key: string;
  rarity: RarityAugment;
  iconUrl: string;
  desc: string;
  tier: TierBadge;
  pickRate: number; // Porcentaje, ej. 8.6
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

// ==========================================
// Recomendaciones de Draft / Champ Select en vivo
// ==========================================
export interface PickRecommendationItem {
  championId: number;
  championName: string;
  role: Role;
  fitReason: string;
  threatMitigation?: string;
  synergyReason?: string;
  localWinrate?: number;
  localMatches?: number;
  isNewChampion?: boolean;
}

export interface RecommendedBanItem {
  championId: number;
  championName: string;
  reason: string;
}

export interface DraftPickRecommendations {
  assignedRole: Role;
  picks: PickRecommendationItem[];
  recommendedBans?: RecommendedBanItem[];
  allyCompAnalysis?: {
    damageProfile: 'AD_HEAVY' | 'AP_HEAVY' | 'BALANCED';
    hasFrontline: boolean;
    hasEngage: boolean;
    hasHardCc: boolean;
    summary: string;
  };
  enemyThreats?: string[];
  source: 'ai' | 'fallback';
  modelUsed?: string;
  generatedAt?: number;
  fallbackReason?: string;
  debugInfo?: {
    rawPrompt?: string;
    rawResponse?: string;
    validated?: boolean;
    lcuStatus?: string;
  };
}

