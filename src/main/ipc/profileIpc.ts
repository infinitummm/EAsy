/**
 * Controladores IPC para Perfil de Jugador y Sincronización con Riot API.
 * Propiedad exclusiva de ANTIGRAVITY.
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/events';
import { IDatabaseService, IRiotApiClient, AccountEntity } from '../../shared/contracts';
import { PlatformRouting, RegionalRouting, ParsedMatchSummary } from '../../shared/types';

export function setupProfileIpc(
  dbService?: IDatabaseService,
  riotClient?: IRiotApiClient
): void {
  // 1. Obtener perfil y partidas guardadas en SQLite
  ipcMain.handle(
    IPC_CHANNELS.RIOT_GET_PROFILE,
    async (_event, puuid: string): Promise<{
      account: AccountEntity;
      matches: ParsedMatchSummary[];
    }> => {
      if (dbService) {
        try {
          const account = dbService.getAccount(puuid);
          const matches = dbService.getRecentMatches(puuid, 20);

          if (account) {
            return { account, matches };
          }
        } catch {}
      }

      // Perfil fallback cuando no hay datos persistidos
      const fallbackAccount: AccountEntity = {
        puuid: puuid || 'local-player-puuid',
        gameName: 'Invocador',
        tagLine: 'LAN',
        platform: 'la1',
        regional: 'americas',
        profileIconId: 588,
        summonerLevel: 150,
        tier: 'EMERALD',
        rank: 'II',
        leaguePoints: 64,
        updatedAt: Date.now()
      };

      return {
        account: fallbackAccount,
        matches: []
      };
    }
  );

  // 2. Sincronizar cuenta desde Riot API y almacenar en SQLite
  ipcMain.handle(
    IPC_CHANNELS.RIOT_SYNC_ACCOUNT,
    async (
      _event,
      params: {
        gameName: string;
        tagLine: string;
        platform: PlatformRouting;
        regional: RegionalRouting;
      }
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        if (!riotClient) {
          return { success: false, error: 'Cliente de Riot API no inicializado.' };
        }

        // Consultar Account-V1
        const accountDto = await riotClient.getAccountByRiotId(
          params.gameName,
          params.tagLine,
          params.regional
        );

        // Consultar Summoner-V4
        const summonerDto = await riotClient.getSummonerByPuuid(
          accountDto.puuid,
          params.platform
        );

        // Consultar Ranked League-V4
        const rankedEntries = await riotClient.getRankedEntries(
          summonerDto.id,
          params.platform
        );

        const soloEntry = rankedEntries.find((r) => r.queueType === 'RANKED_SOLO_5x5');

        const entity: AccountEntity = {
          puuid: accountDto.puuid,
          gameName: accountDto.gameName,
          tagLine: accountDto.tagLine,
          platform: params.platform,
          regional: params.regional,
          summonerId: summonerDto.id,
          profileIconId: summonerDto.profileIconId,
          summonerLevel: summonerDto.summonerLevel,
          tier: soloEntry?.tier || 'UNRANKED',
          rank: soloEntry?.rank || '',
          leaguePoints: soloEntry?.leaguePoints || 0,
          updatedAt: Date.now()
        };

        if (dbService) {
          dbService.upsertAccount(entity);
        }

        return { success: true };
      } catch (err: unknown) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err)
        };
      }
    }
  );
}
