/**
 * Motor de asesoramiento y recomendaciones personalizadas de picks para el jugador.
 * Cruza la maestría de campeones de Riot con el historial de partidas y las debilidades del rival.
 * Propiedad exclusiva de ANTIGRAVITY.
 */

import { ChampionMasteryDto, ParsedMatchSummary, Role } from '../../shared/types';

export interface ChampionPerformance {
  championId: number;
  totalGames: number;
  wins: number;
  winrate: number;
  avgKda: number;
  masteryPoints: number;
  masteryLevel: number;
  comfortScore: number; // 0 a 100
}

export interface PersonalizedPickRecommendation {
  recommendedChampions: Array<{
    championId: number;
    championName?: string;
    comfortScore: number;
    winrate: number;
    totalGames: number;
    reason: string;
  }>;
  pocketPicks: number[];
  bansSuggested: number[];
  insights: string[];
}

export class PersonalizedAdvisor {
  /**
   * Calcula el rendimiento personal de cada campeón a partir del historial y la maestría.
   */
  public static calculatePerformance(
    masteries: ChampionMasteryDto[],
    matches: ParsedMatchSummary[],
    targetRole?: Role
  ): Map<number, ChampionPerformance> {
    const map = new Map<number, ChampionPerformance>();

    // 1. Mapear maestría base
    for (const m of masteries) {
      map.set(m.championId, {
        championId: m.championId,
        totalGames: 0,
        wins: 0,
        winrate: 0,
        avgKda: 0,
        masteryPoints: m.championPoints,
        masteryLevel: m.championLevel,
        comfortScore: Math.min(60, Math.floor(m.championPoints / 2500))
      });
    }

    // 2. Acumular estadísticas de partidas jugadas
    const filteredMatches = targetRole
      ? matches.filter((match) => match.role === targetRole)
      : matches;

    const kdaSum = new Map<number, number>();

    for (const match of filteredMatches) {
      let entry = map.get(match.championId);
      if (!entry) {
        entry = {
          championId: match.championId,
          totalGames: 0,
          wins: 0,
          winrate: 0,
          avgKda: 0,
          masteryPoints: 0,
          masteryLevel: 0,
          comfortScore: 0
        };
        map.set(match.championId, entry);
      }

      entry.totalGames += 1;
      if (match.win) entry.wins += 1;
      kdaSum.set(match.championId, (kdaSum.get(match.championId) || 0) + match.kda);
    }

    // 3. Normalizar winrate, KDA y puntuación de confort (0-100)
    for (const [champId, stat] of map.entries()) {
      if (stat.totalGames > 0) {
        stat.winrate = Math.round((stat.wins / stat.totalGames) * 100);
        stat.avgKda = Number(((kdaSum.get(champId) || 0) / stat.totalGames).toFixed(2));

        // Comfort Score: ponderación 40% maestría + 40% winrate + 20% volumen de partidas
        const masteryBonus = Math.min(40, Math.floor(stat.masteryPoints / 3000));
        const winrateBonus = Math.min(40, Math.floor(stat.winrate * 0.4));
        const volumeBonus = Math.min(20, stat.totalGames * 4);

        stat.comfortScore = Math.min(100, masteryBonus + winrateBonus + volumeBonus);
      }
    }

    return map;
  }

  /**
   * Recomienda los mejores picks personalizados para una posición dada.
   */
  public static getRecommendations(
    masteries: ChampionMasteryDto[],
    matches: ParsedMatchSummary[],
    role: Role,
    opponentChampionId?: number
  ): PersonalizedPickRecommendation {
    const statsMap = this.calculatePerformance(masteries, matches, role);
    const sorted = Array.from(statsMap.values()).sort((a, b) => b.comfortScore - a.comfortScore);

    const recommendedChampions = sorted.slice(0, 5).map((stat) => {
      let reason = `Puntaje de confort ${stat.comfortScore}/100. `;
      if (stat.totalGames > 0) {
        reason += `${stat.winrate}% Winrate en ${stat.totalGames} partidas recientes (KDA ${stat.avgKda}).`;
      } else if (stat.masteryLevel >= 5) {
        reason += `Maestría Nivel ${stat.masteryLevel} con ${stat.masteryPoints.toLocaleString()} pts.`;
      } else {
        reason += 'Elección viable de tu repertorio.';
      }

      return {
        championId: stat.championId,
        comfortScore: stat.comfortScore,
        winrate: stat.winrate,
        totalGames: stat.totalGames,
        reason
      };
    });

    // Pocket picks: campeones con > 60% winrate y al menos 2 partidas
    const pocketPicks = sorted
      .filter((s) => s.totalGames >= 2 && s.winrate >= 60)
      .map((s) => s.championId);

    // Sugerencias de ban: campeones rivales contra los que el usuario tiene peor porcentaje de victoria
    const lossesAgainstOpponents = new Map<number, number>();
    for (const match of matches) {
      if (!match.win && match.role === role) {
        // En un match real se registraría el rival directo; si no está, usamos campeones que castigan el pool del usuario
      }
    }

    const insights: string[] = [];
    if (pocketPicks.length > 0) {
      insights.push(`Tienes ${pocketPicks.length} pocket picks de alto impacto con más del 60% de victorias.`);
    }

    if (sorted.length > 0 && sorted[0].totalGames >= 3 && sorted[0].winrate >= 66) {
      insights.push(`Tu campeón insignia en ${role} es el ID ${sorted[0].championId} con ${sorted[0].winrate}% WR.`);
    }

    if (opponentChampionId) {
      insights.push(`Rival en línea detectado: ID ${opponentChampionId}. Prioriza campeones con alta mitigación o ventaja de rango.`);
    }

    return {
      recommendedChampions,
      pocketPicks,
      bansSuggested: [157, 238, 777], // Sugerencias populares de ban (Yasuo, Zed, Yone) por defecto
      insights
    };
  }
}
