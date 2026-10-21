/**
 * Servicio de sincronización de cuenta local desde League Client Ux (LCU).
 * Permite obtener el 100% de los datos del jugador (invocador, rango, nivel, icono,
 * historial de 20 partidas y maestrías) DIRECTAMENTE del cliente local sin requerir Riot API.
 * Propiedad exclusiva de ANTIGRAVITY.
 */

import { ILcuClient, IDatabaseService, AccountEntity } from '../../shared/contracts';
import { ParsedMatchSummary, ChampionMasteryDto, Role } from '../../shared/types';
import { registrarLog } from './LcuDetector';

function normalizarRol(lane?: string, role?: string): Role {
  const l = (lane || '').toUpperCase();
  const r = (role || '').toUpperCase();

  if (l === 'TOP') return 'TOP';
  if (l === 'JUNGLE') return 'JUNGLE';
  if (l === 'MID' || l === 'MIDDLE') return 'MIDDLE';
  if (l === 'BOTTOM' || l === 'BOT') {
    if (r === 'DUO_SUPPORT' || r === 'SUPPORT') return 'UTILITY';
    return 'BOTTOM';
  }
  if (l === 'UTILITY' || r === 'DUO_SUPPORT' || r === 'SUPPORT') return 'UTILITY';
  return 'MIDDLE';
}

export class LcuAccountService {
  /**
   * Sincroniza la cuenta del usuario activo en el cliente LoL hacia SQLite.
   * Devuelve la entidad de cuenta actualizada o null si el cliente no está en sesión.
   */
  public static async sincronizarCuentaLocal(
    lcuClient: ILcuClient,
    dbService: IDatabaseService
  ): Promise<{
    account: AccountEntity;
    matches: ParsedMatchSummary[];
    masteries: ChampionMasteryDto[];
  } | null> {
    try {
      // 1. Obtener datos del Invocador Local (/lol-summoner/v1/current-summoner)
      const summoner = await lcuClient.request<any>('GET', '/lol-summoner/v1/current-summoner');
      if (!summoner || !summoner.puuid) {
        registrarLog('[LcuAccountService] No se pudo obtener el invocador actual del cliente LoL.');
        return null;
      }

      const puuid = summoner.puuid;
      const gameName = summoner.gameName || 'Invocador';
      const tagLine = summoner.tagLine || '';
      const summonerId = summoner.summonerId || 0;
      const profileIconId = summoner.profileIconId || 1;
      const summonerLevel = summoner.summonerLevel || 1;

      // 2. Obtener Clasificación Clasificatoria (/lol-ranked/v1/current-ranked-stats)
      let tier = 'UNRANKED';
      let rank = '';
      let leaguePoints = 0;

      try {
        const rankedStats = await lcuClient.request<any>('GET', '/lol-ranked/v1/current-ranked-stats');
        if (rankedStats) {
          const queues = rankedStats.queues || [];
          const soloEntry = queues.find((q: any) => q.queueType === 'RANKED_SOLO_5x5') || rankedStats.highestRankedEntry;
          if (soloEntry) {
            tier = soloEntry.tier || 'UNRANKED';
            rank = soloEntry.division || soloEntry.rank || '';
            leaguePoints = soloEntry.leaguePoints || 0;
          }
        }
      } catch (rankedErr) {
        registrarLog(`[LcuAccountService] Advertencia consultando ranked stats: ${rankedErr}`);
      }

      // 3. Construir y persistir AccountEntity
      const account: AccountEntity = {
        puuid,
        gameName,
        tagLine,
        platform: 'la1',
        regional: 'americas',
        summonerId,
        profileIconId,
        summonerLevel,
        tier,
        rank,
        leaguePoints,
        updatedAt: Date.now(),
      };

      dbService.upsertAccount(account);
      registrarLog(`[LcuAccountService] Cuenta local sincronizada: ${gameName}#${tagLine} (${tier} ${rank} ${leaguePoints} LP)`);

      // 4. Obtener Historial de Partidas (/lol-match-history/v1/products/lol/current-summoner/matches)
      const matches: ParsedMatchSummary[] = [];
      try {
        const matchData = await lcuClient.request<any>('GET', '/lol-match-history/v1/products/lol/current-summoner/matches');
        const rawGames = matchData?.games?.games || [];

        for (const game of rawGames) {
          // Identificar participante del jugador local
          const identities = game.participantIdentities || [];
          const myIdent = identities.find(
            (id: any) => id.player?.puuid === puuid || id.player?.summonerId === summonerId
          );
          const partId = myIdent?.participantId ?? 1;

          const participants = game.participants || [];
          const participant = participants.find((p: any) => p.participantId === partId) || participants[0];

          if (participant) {
            const stats = participant.stats || {};
            const timeline = participant.timeline || {};
            const kills = stats.kills || 0;
            const deaths = stats.deaths || 0;
            const assists = stats.assists || 0;
            const cs = (stats.totalMinionsKilled || 0) + (stats.neutralMinionsKilled || 0);
            const durationSec = game.gameDuration || 0;
            const durationMin = durationSec > 0 ? durationSec / 60 : 1;

            const summary: ParsedMatchSummary = {
              matchId: `LCU_${game.gameId}`,
              puuid,
              gameCreation: game.gameCreation || Date.now(),
              gameDuration: durationSec,
              gameVersion: game.gameVersion || '14.20.1',
              queueId: game.queueId || 420,
              championId: participant.championId || 0,
              championName: '',
              role: normalizarRol(timeline.lane, timeline.role),
              win: Boolean(stats.win),
              kills,
              deaths,
              assists,
              kda: deaths === 0 ? (kills + assists) : Number(((kills + assists) / deaths).toFixed(2)),
              cs,
              csPerMinute: Number((cs / durationMin).toFixed(1)),
              goldEarned: stats.goldEarned || 0,
              damageDealt: stats.totalDamageDealtToChampions || 0,
              items: [
                stats.item0,
                stats.item1,
                stats.item2,
                stats.item3,
                stats.item4,
                stats.item5,
                stats.item6,
              ].filter((id) => Number.isInteger(id) && id > 0),
              primaryStyleId: stats.perkPrimaryStyle || 0,
              subStyleId: stats.perkSubStyle || 0,
              selectedPerks: [
                stats.perk0,
                stats.perk1,
                stats.perk2,
                stats.perk3,
                stats.perk4,
                stats.perk5,
              ].filter((p) => Number.isInteger(p) && p > 0),
            };

            dbService.saveMatch(summary);
            matches.push(summary);
          }
        }
        registrarLog(`[LcuAccountService] Historial sincronizado: ${matches.length} partidas registradas en SQLite.`);
      } catch (histErr) {
        registrarLog(`[LcuAccountService] Advertencia consultando historial de partidas: ${histErr}`);
      }

      // 5. Obtener Maestrías (/lol-champion-mastery/v1/local-player/champion-mastery)
      const masteries: ChampionMasteryDto[] = [];
      try {
        const rawMasteries = await lcuClient.request<any[]>('GET', '/lol-champion-mastery/v1/local-player/champion-mastery');
        if (Array.isArray(rawMasteries)) {
          for (const m of rawMasteries) {
            masteries.push({
              puuid,
              championId: m.championId,
              championLevel: m.championLevel || 1,
              championPoints: m.championPoints || 0,
              lastPlayTime: m.lastPlayTime || 0,
              championPointsSinceLastLevel: m.championPointsSinceLastLevel || 0,
              championPointsUntilNextLevel: m.championPointsUntilNextLevel || 0,
              chestGranted: Boolean(m.chestGranted),
              tokensEarned: m.tokensEarned || 0,
            });
          }
          registrarLog(`[LcuAccountService] Maestrías sincronizadas: ${masteries.length} campeones cargados.`);
        }
      } catch (mastErr) {
        registrarLog(`[LcuAccountService] Advertencia consultando maestrías: ${mastErr}`);
      }

      return { account, matches, masteries };
    } catch (error) {
      registrarLog(`[LcuAccountService] Error general sincronizando cuenta local: ${error}`);
      return null;
    }
  }
}
