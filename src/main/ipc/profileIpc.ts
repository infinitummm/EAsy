/**
 * Controladores IPC para Perfil de Jugador y Sincronización con Riot API.
 * Propiedad exclusiva de ANTIGRAVITY.
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/events';
import { IDatabaseService, IRiotApiClient, ILcuClient, AccountEntity } from '../../shared/contracts';
import { PlatformRouting, RegionalRouting, ParsedMatchSummary } from '../../shared/types';
import { ProfileSyncService } from '../riot/ProfileSyncService';
import { LcuAccountService } from '../lcu/LcuAccountService';

import {
  ErrorRiotApi,
  derivarRegionalDesdePlataforma,
  normalizarRiotId,
} from '../riot/RiotApiClient';

export function setupProfileIpc(
  dbService?: IDatabaseService,
  riotClient?: IRiotApiClient,
  profileSyncService?: ProfileSyncService,
  lcuClient?: ILcuClient
): void {
  // 1. Obtener perfil y partidas guardadas en SQLite (con auto-sincronización LCU transparente)
  ipcMain.removeHandler(IPC_CHANNELS.RIOT_GET_PROFILE);
  ipcMain.handle(
    IPC_CHANNELS.RIOT_GET_PROFILE,
    async (_event, puuid: string): Promise<{
      account: AccountEntity;
      matches: ParsedMatchSummary[];
    }> => {
      // Si el LCU está conectado y tenemos dbService, sincronizar automáticamente si no hay cuentas
      if (dbService && lcuClient) {
        try {
          const accounts = dbService.getAccounts();
          if (accounts.length === 0) {
            await LcuAccountService.sincronizarCuentaLocal(lcuClient, dbService);
          }
        } catch {
          // Continuar con lectura normal si LCU falla
        }
      }

      if (dbService) {
        try {
          let account = puuid ? dbService.getAccount(puuid) : null;
          if (!account) {
            const all = dbService.getAccounts();
            if (all.length > 0) {
              account = all[0];
            }
          }
          if (account) {
            const matches = dbService.getRecentMatches(account.puuid, 20);
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
  ipcMain.removeHandler(IPC_CHANNELS.RIOT_SYNC_ACCOUNT);
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
        const { gameName, tagLine } = normalizarRiotId(params.gameName, params.tagLine);
        const regional = params.regional || derivarRegionalDesdePlataforma(params.platform);

        if (profileSyncService) {
          await profileSyncService.sincronizarPorRiotId(
            gameName,
            tagLine,
            params.platform,
            regional
          );
          return { success: true };
        }

        if (!riotClient) {
          return { success: false, error: 'Cliente de Riot API no inicializado.' };
        }

        // Consultar Account-V1
        const accountDto = await riotClient.getAccountByRiotId(
          gameName,
          tagLine,
          regional
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
          regional,
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
        let mensaje = err instanceof Error ? err.message : String(err);
        if (err instanceof ErrorRiotApi && err.mensajeAmigable) {
          mensaje = err.mensajeAmigable;
        } else if ((err as any)?.mensajeAmigable) {
          mensaje = (err as any).mensajeAmigable;
        }
        return {
          success: false,
          error: mensaje
        };
      }
    }
  );

  // 3. Sincronizar cuenta directamente desde el cliente LoL local (LCU) sin requerir Riot API
  ipcMain.removeHandler(IPC_CHANNELS.LCU_SYNC_LOCAL_ACCOUNT);
  ipcMain.handle(
    IPC_CHANNELS.LCU_SYNC_LOCAL_ACCOUNT,
    async (): Promise<{ success: boolean; account?: AccountEntity; error?: string }> => {
      if (!lcuClient) {
        return { success: false, error: 'Cliente LoL (LCU) no disponible en este proceso.' };
      }
      if (!dbService) {
        return { success: false, error: 'Base de datos local no disponible.' };
      }

      try {
        const res = await LcuAccountService.sincronizarCuentaLocal(lcuClient, dbService);
        if (!res) {
          return {
            success: false,
            error: 'No se pudo sincronizar la cuenta. Asegúrate de que el cliente de LoL esté abierto con tu sesión iniciada.'
          };
        }
        return { success: true, account: res.account };
      } catch (err: unknown) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err)
        };
      }
    }
  );
}
