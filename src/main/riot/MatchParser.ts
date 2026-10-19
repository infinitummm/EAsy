/**
 * Parser estadístico de partidas Match-V5 (T-3.5).
 *
 * Transforma un `MatchDto` (crudo de la Riot API) en el `ParsedMatchSummary`
 * que consumen la base de datos, la UI y las estadísticas agregadas.
 *
 * Cálculos:
 *  - KDA y CS/minuto con las fórmulas compartidas de `./estadisticas`
 *    (idénticas a las usadas al releer partidas desde SQLite).
 *  - CS total = minions de línea + monstruos neutrales (jungla).
 *  - Runas: 4 selecciones del árbol primario + 2 del secundario + 3 stat
 *    perks en orden [offense, flex, defense] (9 perks en total).
 */

import type { IMatchParser } from '@shared/contracts';
import type { MatchDto, MatchParticipantDto, ParsedMatchSummary, Role } from '@shared/types';
import { calcularCsPorMinuto, calcularKda, redondear2 } from './estadisticas';

const ROLES_VALIDOS: readonly Role[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY', 'FILL'];

/** Error lanzado cuando la partida no contiene al participante solicitado. */
export class ErrorPartidaInvalida extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorPartidaInvalida';
  }
}

/** Normaliza `teamPosition` de Riot a `Role`; valores desconocidos o vacíos → FILL. */
export function normalizarRol(teamPosition: string | null | undefined): Role {
  const posicion = (teamPosition ?? '').toUpperCase();
  return (ROLES_VALIDOS as readonly string[]).includes(posicion) ? (posicion as Role) : 'FILL';
}

/** Extrae árboles y selecciones de perks del participante (9 perks estándar). */
export function extraerRunas(participante: MatchParticipantDto): {
  primaryStyleId: number;
  subStyleId: number;
  selectedPerks: number[];
} {
  const estilos = participante.perks?.styles ?? [];
  const principal = estilos.find((estilo) => estilo.description === 'primaryStyle');
  const secundario = estilos.find((estilo) => estilo.description === 'subStyle');

  const seleccionesPrincipales = (principal?.selections ?? []).map((seleccion) => seleccion.perk);
  const seleccionesSecundarias = (secundario?.selections ?? []).map((seleccion) => seleccion.perk);

  const statPerks = participante.perks?.statPerks;
  const estadisticas = statPerks ? [statPerks.offense, statPerks.flex, statPerks.defense] : [];

  return {
    primaryStyleId: principal?.style ?? 0,
    subStyleId: secundario?.style ?? 0,
    selectedPerks: [...seleccionesPrincipales, ...seleccionesSecundarias, ...estadisticas],
  };
}

export class MatchParser implements IMatchParser {
  /** Convierte una partida cruda en el resumen del participante indicado. */
  parse(match: MatchDto, targetPuuid: string): ParsedMatchSummary {
    const matchId = match.metadata?.matchId ?? '(desconocida)';
    const participante = match.info?.participants?.find((p) => p.puuid === targetPuuid);

    if (!participante) {
      throw new ErrorPartidaInvalida(
        `La partida ${matchId} no contiene al participante ${targetPuuid}.`
      );
    }

    const asesinatos = participante.kills;
    const muertes = participante.deaths;
    const asistencias = participante.assists;
    const cs = participante.totalMinionsKilled + participante.neutralMinionsKilled;
    const duracion = match.info.gameDuration;
    const runas = extraerRunas(participante);

    return {
      matchId,
      puuid: targetPuuid,
      gameCreation: match.info.gameCreation,
      gameDuration: duracion,
      gameVersion: match.info.gameVersion,
      queueId: match.info.queueId,
      championId: participante.championId,
      championName: participante.championName,
      role: normalizarRol(participante.teamPosition),
      win: Boolean(participante.win),
      kills: asesinatos,
      deaths: muertes,
      assists: asistencias,
      kda: calcularKda(asesinatos, muertes, asistencias),
      cs,
      csPerMinute: calcularCsPorMinuto(cs, duracion),
      goldEarned: participante.goldEarned,
      damageDealt: participante.totalDamageDealtToChampions,
      items: [
        participante.item0,
        participante.item1,
        participante.item2,
        participante.item3,
        participante.item4,
        participante.item5,
        participante.item6,
      ],
      primaryStyleId: runas.primaryStyleId,
      subStyleId: runas.subStyleId,
      selectedPerks: runas.selectedPerks,
    };
  }

  /** Agrega un histórico de resúmenes en métricas listas para la UI. */
  calculateStats(summaries: ParsedMatchSummary[]): {
    totalMatches: number;
    winrate: number;
    avgKda: number;
    avgCsPerMinute: number;
    roleDistribution: Record<string, number>;
  } {
    const totalMatches = summaries.length;
    if (totalMatches === 0) {
      return { totalMatches: 0, winrate: 0, avgKda: 0, avgCsPerMinute: 0, roleDistribution: {} };
    }

    const victorias = summaries.filter((resumen) => resumen.win).length;
    const sumaKda = summaries.reduce((acumulado, resumen) => acumulado + resumen.kda, 0);
    const sumaCsPorMinuto = summaries.reduce((acumulado, resumen) => acumulado + resumen.csPerMinute, 0);

    const roleDistribution: Record<string, number> = {};
    for (const resumen of summaries) {
      roleDistribution[resumen.role] = (roleDistribution[resumen.role] ?? 0) + 1;
    }

    return {
      totalMatches,
      winrate: redondear2((victorias / totalMatches) * 100),
      avgKda: redondear2(sumaKda / totalMatches),
      avgCsPerMinute: redondear2(sumaCsPorMinuto / totalMatches),
      roleDistribution,
    };
  }
}
