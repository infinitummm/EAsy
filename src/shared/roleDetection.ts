import { ChampSelectSession, ChampSelectPlayer, Role } from './types';

/**
 * Normaliza cualquier variante de rol (mayúsculas, minúsculas, abreviaturas de Riot LCU).
 */
export function normalizeRole(rawRole?: string | null): Role {
  if (!rawRole) return 'FILL';
  const upper = rawRole.toUpperCase().trim();
  if (upper === 'TOP') return 'TOP';
  if (upper === 'JUNGLE' || upper === 'JUG' || upper === 'JG') return 'JUNGLE';
  if (upper === 'MIDDLE' || upper === 'MID') return 'MIDDLE';
  if (upper === 'BOTTOM' || upper === 'BOT' || upper === 'ADC') return 'BOTTOM';
  if (upper === 'UTILITY' || upper === 'SUPPORT' || upper === 'SUPP' || upper === 'SUP') return 'UTILITY';
  return 'FILL';
}

/**
 * Mapeo canónico de campeones a sus roles primarios / arquetípicos.
 */
const CHAMPION_ROLES: Record<number, Role> = {
  // Tiradores / ADCs (BOTTOM)
  901: 'BOTTOM', // Smolder
  22: 'BOTTOM',  // Ashe
  51: 'BOTTOM',  // Caitlyn
  222: 'BOTTOM', // Jinx
  81: 'BOTTOM',  // Ezreal
  145: 'BOTTOM', // Kai'Sa
  67: 'BOTTOM',  // Vayne
  202: 'BOTTOM', // Jhin
  236: 'BOTTOM', // Lucian
  360: 'BOTTOM', // Samira
  119: 'BOTTOM', // Draven
  21: 'BOTTOM',  // Miss Fortune
  18: 'BOTTOM',  // Tristana
  15: 'BOTTOM',  // Sivir
  96: 'BOTTOM',  // Kog'Maw
  29: 'BOTTOM',  // Twitch
  110: 'BOTTOM', // Varus
  523: 'BOTTOM', // Aphelios
  498: 'BOTTOM', // Xayah
  221: 'BOTTOM', // Zeri
  895: 'BOTTOM', // Nilah
  429: 'BOTTOM', // Kalista
  42: 'BOTTOM',  // Corki

  // Soportes (UTILITY)
  412: 'UTILITY', // Thresh
  53: 'UTILITY',  // Blitzcrank
  111: 'UTILITY', // Nautilus
  89: 'UTILITY',  // Leona
  117: 'UTILITY', // Lulu
  267: 'UTILITY', // Nami
  350: 'UTILITY', // Yuumi
  16: 'UTILITY',  // Soraka
  40: 'UTILITY',  // Janna
  37: 'UTILITY',  // Sona
  201: 'UTILITY', // Braum
  555: 'UTILITY', // Pyke
  497: 'UTILITY', // Rakan
  526: 'UTILITY', // Rell
  902: 'UTILITY', // Milio
  12: 'UTILITY',  // Alistar
  44: 'UTILITY',  // Taric
  432: 'UTILITY', // Bardo
  235: 'UTILITY', // Senna
  888: 'UTILITY', // Renata Glasc

  // Junglas (JUNGLE)
  64: 'JUNGLE',  // Lee Sin
  104: 'JUNGLE', // Graves
  141: 'JUNGLE', // Kayn
  121: 'JUNGLE', // Kha'Zix
  11: 'JUNGLE',  // Master Yi
  234: 'JUNGLE', // Viego
  19: 'JUNGLE',  // Warwick
  120: 'JUNGLE', // Hecarim
  56: 'JUNGLE',  // Nocturne
  59: 'JUNGLE',  // Jarvan IV
  5: 'JUNGLE',   // Xin Zhao
  254: 'JUNGLE', // Vi
  28: 'JUNGLE',  // Evelynn
  9: 'JUNGLE',   // Fiddlesticks
  154: 'JUNGLE', // Zac
  113: 'JUNGLE', // Sejuani
  203: 'JUNGLE', // Kindred
  32: 'JUNGLE',  // Amumu
  107: 'JUNGLE', // Rengar
  35: 'JUNGLE',  // Shaco
  233: 'JUNGLE', // Briar
  876: 'JUNGLE', // Lillia
  200: 'JUNGLE', // Bel'Veth

  // Carril Central / Magos y Asesinos (MIDDLE)
  103: 'MIDDLE', // Ahri
  157: 'MIDDLE', // Yasuo
  777: 'MIDDLE', // Yone
  238: 'MIDDLE', // Zed
  55: 'MIDDLE',  // Katarina
  134: 'MIDDLE', // Syndra
  61: 'MIDDLE',  // Orianna
  112: 'MIDDLE', // Viktor
  45: 'MIDDLE',  // Veigar
  99: 'MIDDLE',  // Lux
  711: 'MIDDLE', // Vex
  84: 'MIDDLE',  // Akali
  7: 'MIDDLE',   // LeBlanc
  910: 'MIDDLE', // Hwei
  136: 'MIDDLE', // Aurelion Sol
  38: 'MIDDLE',  // Kassadin
  91: 'MIDDLE',  // Talon
  4: 'MIDDLE',   // Twisted Fate
  268: 'MIDDLE', // Azir
  34: 'MIDDLE',  // Anivia
  90: 'MIDDLE',  // Malzahar
  142: 'MIDDLE', // Zoe
  105: 'MIDDLE', // Fizz
  247: 'MIDDLE', // Qiyana
  69: 'MIDDLE',  // Cassiopeia
  893: 'MIDDLE', // Aurora

  // Carril Superior / Luchadores y Tanques (TOP)
  266: 'TOP', // Aatrox
  122: 'TOP', // Darius
  86: 'TOP',  // Garen
  24: 'TOP',  // Jax
  82: 'TOP',  // Mordekaiser
  114: 'TOP', // Fiora
  164: 'TOP', // Camille
  875: 'TOP', // Sett
  58: 'TOP',  // Renekton
  92: 'TOP',  // Riven
  39: 'TOP',  // Irelia
  75: 'TOP',  // Nasus
  17: 'TOP',  // Teemo
  516: 'TOP', // Ornn
  98: 'TOP',  // Shen
  31: 'TOP',  // Cho'Gath
  54: 'TOP',  // Malphite
  420: 'TOP', // Illaoi
  83: 'TOP',  // Yorick
  897: 'TOP', // K'Sante
  799: 'TOP', // Ambessa
  887: 'TOP', // Gwen
  14: 'TOP'   // Sion
};

/**
 * Obtiene el rol típico o característico de un campeón.
 */
export function getChampionArchetypeRole(championId: number): Role | null {
  return CHAMPION_ROLES[championId] || null;
}

/**
 * Extrae el ID del campeón que el jugador local está utilizando o previsualizando/seleccionando.
 * Resuelve el problema donde LCU tiene `localPlayer.championId = 0` hasta que se fija con "Bloquear".
 */
export function extractLocalChampionId(session: ChampSelectSession | null): number {
  if (!session) return 0;
  const localPlayer = session.myTeam?.find((p) => p.cellId === session.localPlayerCellId);

  // 1. Campeón ya bloqueado definitivamente
  if (localPlayer?.championId && localPlayer.championId > 0) {
    return localPlayer.championId;
  }

  // 2. Campeón en fase activa de pick (hover actual en la grilla de selección)
  if (session.actions && Array.isArray(session.actions)) {
    for (const actionGroup of session.actions) {
      if (!Array.isArray(actionGroup)) continue;
      for (const action of actionGroup) {
        if (
          action.actorCellId === session.localPlayerCellId &&
          action.type === 'pick' &&
          action.championId > 0
        ) {
          return action.championId;
        }
      }
    }
  }

  // 3. Intención de selección (declaración previa)
  if (localPlayer?.championPickIntent && localPlayer.championPickIntent > 0) {
    return localPlayer.championPickIntent;
  }

  return 0;
}

/**
 * Extrae el ID de campeón de cualquier jugador (aliado o enemigo), inspeccionando tanto
 * el estado confirmado como las acciones activas de pick y hover.
 */
export function extractPlayerChampionId(
  player: ChampSelectPlayer,
  session: ChampSelectSession | null
): number {
  if (player.championId > 0) return player.championId;

  if (session?.actions && Array.isArray(session.actions)) {
    for (const actionGroup of session.actions) {
      if (!Array.isArray(actionGroup)) continue;
      for (const action of actionGroup) {
        if (
          action.actorCellId === player.cellId &&
          action.type === 'pick' &&
          action.championId > 0
        ) {
          return action.championId;
        }
      }
    }
  }

  if (player.championPickIntent > 0) {
    return player.championPickIntent;
  }

  return 0;
}

/**
 * Detección jerárquica robusta del rol de un jugador:
 * 1. Cola oficial con posición asignada (`assignedPosition`).
 * 2. Hechizo de Invocador Aplastar (Smite, ID 11) -> JUNGLE 100% garantizado.
 * 3. Arquetipo canónico del campeón seleccionado/hover.
 * 4. Slot de celda en la alineación del equipo (0: TOP, 1: JG, 2: MID, 3: BOT, 4: SUPP).
 * 5. Fallback por defecto.
 */
export function detectPlayerRole(
  player: ChampSelectPlayer | undefined,
  session: ChampSelectSession | null,
  activeChampionId?: number
): Role {
  // Nivel 1: Posición asignada oficial normalizada
  const normalizedAssigned = normalizeRole(player?.assignedPosition);
  if (normalizedAssigned !== 'FILL') {
    return normalizedAssigned;
  }

  // Nivel 2: Hechizo de Invocador Aplastar (Smite = 11)
  if (player && (player.spell1Id === 11 || player.spell2Id === 11)) {
    return 'JUNGLE';
  }

  // Nivel 3: Arquetipo del campeón actual
  const champId = activeChampionId && activeChampionId > 0
    ? activeChampionId
    : (player?.championId && player.championId > 0
        ? player.championId
        : (player?.championPickIntent && player.championPickIntent > 0
            ? player.championPickIntent
            : 0));

  if (champId > 0) {
    const archetype = getChampionArchetypeRole(champId);
    if (archetype) {
      return archetype;
    }
  }

  // Nivel 4: Posición en la lista del equipo (típica en bots / personalizadas)
  if (session && player && Array.isArray(session.myTeam)) {
    const idx = session.myTeam.findIndex((p) => p.cellId === player.cellId);
    if (idx === 0) return 'TOP';
    if (idx === 1) return 'JUNGLE';
    if (idx === 2) return 'MIDDLE';
    if (idx === 3) return 'BOTTOM';
    if (idx === 4) return 'UTILITY';
  }

  return 'TOP';
}

/**
 * Predice de forma inteligente el oponente en línea conociendo el rol y campeón del jugador local.
 */
export function predictOpponentId(
  session: ChampSelectSession | null,
  localPlayer: ChampSelectPlayer | undefined,
  detectedRole: Role,
  localChampId: number
): number {
  if (!session || !session.theirTeam || session.theirTeam.length === 0) {
    // Fallback temático según rol
    switch (detectedRole) {
      case 'BOTTOM': return 22; // Ashe
      case 'MIDDLE': return 103; // Ahri
      case 'JUNGLE': return 64;  // Lee Sin
      case 'UTILITY': return 412; // Thresh
      case 'TOP':
      default: return 24; // Jax
    }
  }

  // 1. Mismo rol explícito oficial en el equipo enemigo
  if (detectedRole !== 'FILL') {
    const roleMatch = session.theirTeam.find((p) => {
      const pRole = normalizeRole(p.assignedPosition);
      return pRole === detectedRole;
    });
    if (roleMatch) {
      const oppChamp = extractPlayerChampionId(roleMatch, session);
      if (oppChamp > 0) return oppChamp;
    }
  }

  // 2. Campeón enemigo con el mismo arquetipo de rol (ej: si soy BOTTOM, buscar su ADC enemigo)
  if (detectedRole !== 'FILL') {
    for (const p of session.theirTeam) {
      const champId = extractPlayerChampionId(p, session);
      if (champId > 0 && getChampionArchetypeRole(champId) === detectedRole) {
        return champId;
      }
    }
  }

  // 3. Mismo índice de celda / slot de equipo (Bots y personalizadas)
  if (localPlayer) {
    const myIndex = session.myTeam.findIndex((p) => p.cellId === localPlayer.cellId);
    if (myIndex >= 0 && myIndex < session.theirTeam.length) {
      const directSlot = session.theirTeam[myIndex];
      const directChamp = extractPlayerChampionId(directSlot, session);
      if (directChamp > 0) {
        return directChamp;
      }
    }
  }

  // 4. Cualquier campeón revelado en el equipo rival
  for (const p of session.theirTeam) {
    const champId = extractPlayerChampionId(p, session);
    if (champId > 0) {
      return champId;
    }
  }

  // 5. Fallback temático según rol si ningún enemigo ha revelado campeón
  switch (detectedRole) {
    case 'BOTTOM': return 22; // Ashe
    case 'MIDDLE': return 103; // Ahri
    case 'JUNGLE': return 64;  // Lee Sin
    case 'UTILITY': return 412; // Thresh
    case 'TOP':
    default: return 24; // Jax
  }
}
