/**
 * Pruebas unitarias de la sincronización integral de perfil (T-6.1).
 * Se combina un doble de `IRiotApiClient`, un `MatchParser` real y una base
 * SQLite en memoria para verificar la descarga del historial, el guardado de
 * partidas nuevas, la omisión de duplicadas, la tolerancia a fallos parciales,
 * la actualización de cuenta/rango, las maestrías y las métricas de consumo.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../../src/main/db/DatabaseService';
import { ProfileSyncService } from '../../src/main/riot/ProfileSyncService';
import { MatchParser } from '../../src/main/riot/MatchParser';
import { ErrorRiotApi } from '../../src/main/riot/RiotApiClient';
import type {
  AccountEntity,
  IRiotApiClient,
  KeyHealthStatus,
} from '../../src/shared/contracts';
import type {
  ChampionMasteryDto,
  MatchDto,
  MatchParticipantDto,
  RankedEntryDto,
  RiotAccountDto,
  RiotSummonerDto,
} from '../../src/shared/types';

const PUUID = 'puuid-1';

// ==========================================
// Doble de prueba de la Riot API
// ==========================================

class RiotApiFalsa implements IRiotApiClient {
  cuenta: RiotAccountDto = { puuid: PUUID, gameName: 'Itero', tagLine: 'LAS' };
  summoner: RiotSummonerDto = {
    id: 'summoner-1',
    accountId: 'account-1',
    puuid: PUUID,
    profileIconId: 4567,
    revisionDate: 1_700_000_000_000,
    summonerLevel: 250,
  };
  rankedEntries: RankedEntryDto[] = [crearRanked('RANKED_SOLO_5x5', 'GOLD', 'II', 45)];
  maestrias: ChampionMasteryDto[] = [
    crearMaestria(266, 120_000, 7),
    crearMaestria(122, 300_000, 9),
    crearMaestria(86, 50_000, 5),
  ];
  historial: string[] = ['LA1_1', 'LA1_2', 'LA1_3'];
  readonly partidas = new Map<string, MatchDto>();
  readonly erroresPartidas = new Map<string, unknown>();
  errorCuenta: unknown = null;
  readonly llamadas: string[] = [];

  setApiKey(): void {
    // No-op para el doble.
  }

  async getAccountByRiotId(
    gameName: string,
    tagLine: string,
    regional: string
  ): Promise<RiotAccountDto> {
    this.llamadas.push(`account:${regional}`);
    if (this.errorCuenta) {
      throw this.errorCuenta;
    }
    return { ...this.cuenta, gameName, tagLine };
  }

  async getSummonerByPuuid(puuid: string, platform: string): Promise<RiotSummonerDto> {
    this.llamadas.push(`summoner:${platform}:${puuid}`);
    return this.summoner;
  }

  async getRankedEntries(summonerId: string, platform: string): Promise<RankedEntryDto[]> {
    this.llamadas.push(`ranked:${platform}:${summonerId}`);
    return this.rankedEntries;
  }

  async getChampionMasteries(puuid: string, platform: string): Promise<ChampionMasteryDto[]> {
    this.llamadas.push(`masteries:${platform}:${puuid}`);
    return this.maestrias;
  }

  async getMatchHistory(
    puuid: string,
    regional: string,
    count?: number
  ): Promise<string[]> {
    this.llamadas.push(`history:${regional}:${puuid}:${count ?? 'defecto'}`);
    return this.historial;
  }

  async getMatchById(matchId: string, regional: string): Promise<MatchDto> {
    this.llamadas.push(`match:${regional}:${matchId}`);
    const error = this.erroresPartidas.get(matchId);
    if (error) {
      throw error;
    }
    const partida = this.partidas.get(matchId);
    if (!partida) {
      throw new Error(`Partida no simulada: ${matchId}`);
    }
    return partida;
  }

  async checkKeyHealth(): Promise<KeyHealthStatus> {
    return { valid: true, isExpired: false, lastChecked: Date.now() };
  }
}

// ==========================================
// Datos de ejemplo
// ==========================================

function crearRanked(
  queueType: RankedEntryDto['queueType'],
  tier: string,
  rank: string,
  leaguePoints: number
): RankedEntryDto {
  return {
    leagueId: 'league-1',
    summonerId: 'summoner-1',
    queueType,
    tier,
    rank,
    leaguePoints,
    wins: 40,
    losses: 30,
    veteran: false,
    inactive: false,
    freshBlood: false,
    hotStreak: false,
  };
}

function crearMaestria(
  championId: number,
  championPoints: number,
  championLevel: number
): ChampionMasteryDto {
  return {
    puuid: PUUID,
    championId,
    championLevel,
    championPoints,
    lastPlayTime: 1_700_000_000_000,
    championPointsSinceLastLevel: 1000,
    championPointsUntilNextLevel: 2000,
    chestGranted: true,
    tokensEarned: 1,
  };
}

function crearParticipante(cambios: Partial<MatchParticipantDto> = {}): MatchParticipantDto {
  return {
    puuid: PUUID,
    summonerId: 'summoner-1',
    summonerName: 'Itero',
    riotIdGameName: 'Itero',
    riotIdTagline: 'LAS',
    championId: 266,
    championName: 'Aatrox',
    teamPosition: 'TOP',
    win: true,
    kills: 10,
    deaths: 2,
    assists: 5,
    totalDamageDealtToChampions: 25_000,
    goldEarned: 12_000,
    totalMinionsKilled: 200,
    neutralMinionsKilled: 10,
    item0: 3153,
    item1: 6672,
    item2: 0,
    item3: 0,
    item4: 0,
    item5: 0,
    item6: 3340,
    perks: {
      statPerks: { defense: 5011, flex: 5008, offense: 5005 },
      styles: [
        {
          description: 'primaryStyle',
          style: 8000,
          selections: [
            { perk: 8005, var1: 1, var2: 0, var3: 0 },
            { perk: 9111, var1: 0, var2: 0, var3: 0 },
            { perk: 8009, var1: 0, var2: 0, var3: 0 },
            { perk: 8299, var1: 0, var2: 0, var3: 0 },
          ],
        },
        {
          description: 'subStyle',
          style: 8400,
          selections: [
            { perk: 8444, var1: 0, var2: 0, var3: 0 },
            { perk: 8451, var1: 0, var2: 0, var3: 0 },
          ],
        },
      ],
    },
    ...cambios,
  };
}

function crearPartida(
  matchId: string,
  gameCreation: number,
  cambiosParticipante: Partial<MatchParticipantDto> = {}
): MatchDto {
  const participante = crearParticipante(cambiosParticipante);

  return {
    metadata: {
      dataVersion: '2',
      matchId,
      participants: [participante.puuid],
    },
    info: {
      gameCreation,
      gameDuration: 1800,
      gameEndTimestamp: gameCreation + 1_800_000,
      gameId: Number(matchId.replace(/\D/g, '')),
      gameMode: 'CLASSIC',
      gameName: '',
      gameStartTimestamp: gameCreation,
      gameType: 'MATCHED_GAME',
      gameVersion: '14.20.1',
      mapId: 11,
      participants: [participante],
      platformId: 'LA1',
      queueId: 420,
    },
  };
}

function poblarPartidas(riot: RiotApiFalsa): void {
  riot.partidas.set(
    'LA1_1',
    crearPartida('LA1_1', 1_700_000_000_000, { championId: 266, championName: 'Aatrox', win: true })
  );
  riot.partidas.set(
    'LA1_2',
    crearPartida('LA1_2', 1_700_000_100_000, {
      championId: 122,
      championName: 'Darius',
      win: false,
      kills: 3,
      deaths: 7,
      assists: 1,
    })
  );
  riot.partidas.set(
    'LA1_3',
    crearPartida('LA1_3', 1_700_000_200_000, {
      championId: 86,
      championName: 'Garen',
      win: true,
      teamPosition: 'MIDDLE',
    })
  );
}

function crearCuentaPrevia(cambios: Partial<AccountEntity> = {}): AccountEntity {
  return {
    puuid: PUUID,
    gameName: 'Itero',
    tagLine: 'LAS',
    platform: 'la1',
    regional: 'americas',
    summonerId: 'summoner-1',
    profileIconId: 1,
    summonerLevel: 100,
    tier: 'SILVER',
    rank: 'I',
    leaguePoints: 0,
    updatedAt: 1,
    ...cambios,
  };
}

// ==========================================
// Suite
// ==========================================

describe('ProfileSyncService (T-6.1)', () => {
  let bd: DatabaseService;
  let riot: RiotApiFalsa;
  let parser: MatchParser;

  beforeEach(async () => {
    bd = new DatabaseService();
    await bd.initialize();
    riot = new RiotApiFalsa();
    parser = new MatchParser();
    poblarPartidas(riot);
  });

  afterEach(() => {
    bd.close();
  });

  function crearServicio(opciones?: ConstructorParameters<typeof ProfileSyncService>[3]): ProfileSyncService {
    return new ProfileSyncService(riot, bd, parser, opciones);
  }

  describe('sincronización completa', () => {
    it('descarga el historial, guarda las partidas nuevas y agrega estadísticas', async () => {
      const previa = parser.parse(riot.partidas.get('LA1_2')!, PUUID);
      bd.saveMatch(previa);

      const servicio = crearServicio();
      const resumen = await servicio.sincronizarPorRiotId('Itero', 'LAS', 'la1', 'americas');

      expect(resumen.partidasNuevas).toBe(2);
      expect(resumen.partidasOmitidas).toBe(1);
      expect(resumen.partidasFallidas).toBe(0);
      expect(bd.hasMatch('LA1_1')).toBe(true);
      expect(bd.hasMatch('LA1_2')).toBe(true);
      expect(bd.hasMatch('LA1_3')).toBe(true);

      expect(resumen.cuenta).toMatchObject({
        puuid: PUUID,
        gameName: 'Itero',
        tagLine: 'LAS',
        platform: 'la1',
        regional: 'americas',
        summonerId: 'summoner-1',
        profileIconId: 4567,
        summonerLevel: 250,
        tier: 'GOLD',
        rank: 'II',
        leaguePoints: 45,
      });
      expect(bd.getAccount(PUUID)).toEqual(resumen.cuenta);

      expect(resumen.estadisticas.totalMatches).toBe(3);
      expect(resumen.estadisticas.winrate).toBeCloseTo(66.67, 2);
      expect(resumen.estadisticas.roleDistribution).toEqual({ TOP: 2, MIDDLE: 1 });
      expect(resumen.partidasRecientes.map((partida) => partida.matchId)).toEqual([
        'LA1_3',
        'LA1_2',
        'LA1_1',
      ]);
    });

    it('resuelve la identidad por Riot ID y llama a los endpoints esperados', async () => {
      const servicio = crearServicio();

      await servicio.sincronizarPorRiotId('Itero', 'LAS', 'la1', 'americas');

      expect(riot.llamadas[0]).toBe('account:americas');
      expect(riot.llamadas).toContain(`summoner:la1:${PUUID}`);
      expect(riot.llamadas).toContain('ranked:la1:summoner-1');
      expect(riot.llamadas).toContain(`masteries:la1:${PUUID}`);
      expect(riot.llamadas).toContain(`history:americas:${PUUID}:20`);
    });

    it('es idempotente: una segunda sincronización omite todas las partidas', async () => {
      const servicio = crearServicio();
      await servicio.sincronizarPorRiotId('Itero', 'LAS', 'la1', 'americas');

      const segunda = await servicio.sincronizarPorRiotId('Itero', 'LAS', 'la1', 'americas');

      expect(segunda.partidasNuevas).toBe(0);
      expect(segunda.partidasOmitidas).toBe(3);
      expect(segunda.partidasFallidas).toBe(0);
      expect(segunda.estadisticas.totalMatches).toBe(3);
    });

    it('respeta el límite de partidas solicitado', async () => {
      const servicio = crearServicio({ limitePartidas: 2 });

      const resumen = await servicio.sincronizarPorRiotId('Itero', 'LAS', 'la1', 'americas');

      expect(riot.llamadas).toContain(`history:americas:${PUUID}:2`);
      expect(resumen.partidasNuevas).toBe(2);
      expect(resumen.partidasOmitidas).toBe(0);
      expect(bd.hasMatch('LA1_3')).toBe(false);
    });
  });

  describe('rango y maestrías', () => {
    it('usa UNRANKED cuando no hay entradas clasificatorias', async () => {
      riot.rankedEntries = [];

      const resumen = await crearServicio().sincronizarPorRiotId('Itero', 'LAS', 'la1', 'americas');

      expect(resumen.cuenta).toMatchObject({ tier: 'UNRANKED', rank: '', leaguePoints: 0 });
    });

    it('selecciona la cola clasificatoria configurada', async () => {
      riot.rankedEntries = [
        crearRanked('RANKED_SOLO_5x5', 'GOLD', 'II', 45),
        crearRanked('RANKED_FLEX_SR', 'PLATINUM', 'IV', 10),
      ];
      const servicio = crearServicio({ colaRanked: 'RANKED_FLEX_SR' });

      const resumen = await servicio.sincronizarPorRiotId('Itero', 'LAS', 'la1', 'americas');

      expect(resumen.cuenta).toMatchObject({ tier: 'PLATINUM', rank: 'IV', leaguePoints: 10 });
    });

    it('ordena las maestrías por puntos y aplica el límite', async () => {
      const resumen = await crearServicio({ limiteMaestrias: 2 }).sincronizarPorRiotId(
        'Itero',
        'LAS',
        'la1',
        'americas'
      );

      expect(resumen.maestrias.map((maestria) => maestria.championId)).toEqual([122, 266]);
      expect(resumen.maestrias[0].championPoints).toBe(300_000);
    });
  });

  describe('tolerancia a errores', () => {
    it('continúa la sincronización si una partida falla con un error no autenticado', async () => {
      riot.erroresPartidas.set('LA1_2', new ErrorRiotApi('Error interno de Riot', 500, ''));

      const resumen = await crearServicio().sincronizarPorRiotId('Itero', 'LAS', 'la1', 'americas');

      expect(resumen.partidasNuevas).toBe(2);
      expect(resumen.partidasFallidas).toBe(1);
      expect(bd.hasMatch('LA1_1')).toBe(true);
      expect(bd.hasMatch('LA1_2')).toBe(false);
      expect(bd.hasMatch('LA1_3')).toBe(true);
    });

    it('cuenta como fallida una partida sin el participante solicitado', async () => {
      riot.partidas.set(
        'LA1_2',
        crearPartida('LA1_2', 1_700_000_100_000, { puuid: 'otro-puuid' })
      );

      const resumen = await crearServicio().sincronizarPorRiotId('Itero', 'LAS', 'la1', 'americas');

      expect(resumen.partidasFallidas).toBe(1);
      expect(resumen.partidasNuevas).toBe(2);
    });

    it('propaga un 401 al descargar una partida y no guarda la cuenta', async () => {
      riot.erroresPartidas.set('LA1_2', new ErrorRiotApi('No autorizado', 401, ''));

      await expect(
        crearServicio().sincronizarPorRiotId('Itero', 'LAS', 'la1', 'americas')
      ).rejects.toThrow('No autorizado');
      expect(bd.getAccount(PUUID)).toBeNull();
    });

    it('propaga un fallo al resolver la cuenta', async () => {
      riot.errorCuenta = new ErrorRiotApi('No autorizado', 401, '');

      await expect(
        crearServicio().sincronizarPorRiotId('Itero', 'LAS', 'la1', 'americas')
      ).rejects.toThrow('No autorizado');
      expect(bd.getAccount(PUUID)).toBeNull();
    });
  });

  describe('sincronización directa por PUUID', () => {
    it('conserva la identidad almacenada cuando no se aporta una nueva', async () => {
      bd.upsertAccount(crearCuentaPrevia({ gameName: 'Invocador Previo', tagLine: 'LAN' }));

      const resumen = await crearServicio().sincronizarCuenta(PUUID, 'la1', 'americas');

      expect(resumen.cuenta.gameName).toBe('Invocador Previo');
      expect(resumen.cuenta.tagLine).toBe('LAN');
      expect(resumen.cuenta).toMatchObject({ tier: 'GOLD', rank: 'II', leaguePoints: 45 });
      expect(riot.llamadas.some((llamada) => llamada.startsWith('account:'))).toBe(false);
    });
  });

  describe('métricas de consumo', () => {
    it('registra cada llamada a la Riot API para el monitor de cuotas', async () => {
      await crearServicio().sincronizarPorRiotId('Itero', 'LAS', 'la1', 'americas');

      // Account + Summoner + League + Mastery + History + 3 partidas = 8
      expect(bd.getApiCallCount('RIOT', 60_000)).toBe(8);
    });
  });
});
