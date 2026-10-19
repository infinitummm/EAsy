/**
 * Pruebas unitarias de la capa de datos SQLite (T-3.2).
 * Cubre inicialización del esquema (en memoria y en archivo), CRUD de cuentas,
 * partidas, caché de matchups con TTL, ajustes con fusión y métricas de consumo.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  DatabaseService,
  ErrorBaseDeDatos,
  ErrorBaseDeDatosNoInicializada,
} from '../../src/main/db/DatabaseService';
import { DEFAULT_APP_SETTINGS } from '../../src/shared/constants';
import type { AccountEntity } from '../../src/shared/contracts';
import type { AppSettings, GeminiMatchupRecommendation, ParsedMatchSummary } from '../../src/shared/types';

// ==========================================
// Datos de ejemplo
// ==========================================

function crearCuenta(cambios: Partial<AccountEntity> = {}): AccountEntity {
  return {
    puuid: 'puuid-0001',
    gameName: 'Itero',
    tagLine: 'LAS',
    platform: 'la1',
    regional: 'americas',
    summonerId: 'summoner-1',
    profileIconId: 4567,
    summonerLevel: 123,
    tier: 'GOLD',
    rank: 'II',
    leaguePoints: 45,
    updatedAt: 1_700_000_000_000,
    ...cambios,
  };
}

function crearResumen(cambios: Partial<ParsedMatchSummary> = {}): ParsedMatchSummary {
  return {
    matchId: 'LA1_1000000001',
    puuid: 'puuid-0001',
    gameCreation: 1_700_000_000_000,
    gameDuration: 1800,
    gameVersion: '14.20.1',
    queueId: 420,
    championId: 266,
    championName: 'Aatrox',
    role: 'TOP',
    win: true,
    kills: 10,
    deaths: 2,
    assists: 5,
    kda: 0,
    cs: 210,
    csPerMinute: 0,
    goldEarned: 12_000,
    damageDealt: 25_000,
    items: [3153, 6672, 0, 0, 0, 0, 3340],
    primaryStyleId: 8000,
    subStyleId: 8400,
    selectedPerks: [8005, 9111, 8009, 8299, 8444, 8451, 5005, 5008, 5011],
    ...cambios,
  };
}

function crearRecomendacion(
  cambios: Partial<GeminiMatchupRecommendation> = {}
): GeminiMatchupRecommendation {
  return {
    championId: 266,
    opponentChampionId: 84,
    assignedRole: 'TOP',
    patchVersion: '14.20',
    difficultyRating: 3,
    matchupSummary: 'Cuidado con el poke temprano.',
    runesRecommendation: {
      primaryStyleId: 8000,
      subStyleId: 8400,
      selectedPerkIds: [8005, 9111],
      rationale: 'Por pruebas.',
    },
    buildRecommendation: {
      startingItems: [1054],
      coreItems: [3153, 6672],
      situationalItems: [{ itemId: 3047, condition: 'vs daño físico' }],
      rationale: 'Por pruebas.',
    },
    skillOrder: {
      priority: ['Q', 'E', 'W'],
      firstThreeLevels: ['Q', 'E', 'W'],
      rationale: 'Por pruebas.',
    },
    earlyGameStrategy: {
      waveManagement: 'Congelar cerca de tu torre.',
      tradingPlan: 'Cambios cortos con Q3.',
      levelSpikes: ['1', '3', '6'],
    },
    threatAnalysis: {
      enemyThreats: ['Daño verdadero'],
      winCondition: 'Escalar con ventaja de CS.',
    },
    ...cambios,
  };
}

/** Crea un directorio temporal y garantiza su limpieza al terminar la prueba. */
async function conDirectorioTemporal(
  prueba: (directorio: string) => Promise<void>
): Promise<void> {
  const directorio = await mkdtemp(join(tmpdir(), 'itero-db-'));
  try {
    await prueba(directorio);
  } finally {
    await rm(directorio, { recursive: true, force: true });
  }
}

// ==========================================
// Suite
// ==========================================

describe('DatabaseService (T-3.2)', () => {
  let bd: DatabaseService;

  beforeEach(async () => {
    bd = new DatabaseService();
    await bd.initialize();
  });

  afterEach(() => {
    bd.close();
  });

  describe('inicialización', () => {
    it('crea todas las tablas e índices del esquema en un archivo nuevo', async () => {
      await conDirectorioTemporal(async (directorio) => {
        const ruta = join(directorio, 'anidado', 'itero_local.sqlite');
        const servicio = new DatabaseService({ rutaBd: ruta });
        await servicio.initialize();
        servicio.close();

        const inspeccion = new DatabaseSync(ruta);
        const tablas = inspeccion
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all()
          .map((fila) => String(fila.name));
        const indices = inspeccion
          .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
          .all()
          .map((fila) => String(fila.name));
        inspeccion.close();

        expect(tablas).toEqual(
          expect.arrayContaining([
            'accounts',
            'matches',
            'match_participants',
            'matchup_cache',
            'settings',
            'api_usage',
          ])
        );
        expect(indices).toEqual(
          expect.arrayContaining([
            'idx_match_participants_puuid',
            'idx_match_participants_champ',
            'idx_match_participants_role',
            'idx_matchup_cache_expires',
            'idx_api_usage_timestamp',
            'idx_api_usage_api',
          ])
        );
      });
    });

    it('es idempotente: inicializar dos veces no falla ni pierde datos', async () => {
      bd.upsertAccount(crearCuenta());
      await bd.initialize();
      expect(bd.getAccount('puuid-0001')).not.toBeNull();
    });

    it('lanza ErrorBaseDeDatosNoInicializada al operar sin inicializar', () => {
      const sinInicializar = new DatabaseService();
      expect(() => sinInicializar.getAccounts()).toThrow(ErrorBaseDeDatosNoInicializada);
      expect(() => sinInicializar.getSettings()).toThrow(ErrorBaseDeDatosNoInicializada);
      expect(() => sinInicializar.recordApiCall('RIOT', '/prueba', 200)).toThrow(
        ErrorBaseDeDatosNoInicializada
      );
    });

    it('close() es seguro sin inicializar y al repetirse', () => {
      const servicio = new DatabaseService();
      expect(() => servicio.close()).not.toThrow();
      servicio.close();
      bd.close();
      expect(() => bd.close()).not.toThrow();
    });

    it('tras close() las operaciones vuelven a lanzar ErrorBaseDeDatosNoInicializada', () => {
      bd.close();
      expect(() => bd.hasMatch('cualquiera')).toThrow(ErrorBaseDeDatosNoInicializada);
    });

    it('envuelve errores de inicialización (esquema inválido) en ErrorBaseDeDatos', async () => {
      const servicio = new DatabaseService({ esquemaSql: 'ESTO NO ES SQL VALIDO;' });
      await expect(servicio.initialize()).rejects.toThrow(ErrorBaseDeDatos);
      servicio.close();
    });

    it('acepta un esquema personalizado inyectado para pruebas', async () => {
      const servicio = new DatabaseService({
        esquemaSql: `
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
          );`,
      });
      await servicio.initialize();
      servicio.upsertAccount(crearCuenta());
      expect(servicio.getAccounts()).toHaveLength(1);
      servicio.close();
    });
  });

  describe('cuentas', () => {
    it('inserta y recupera una cuenta con todos sus campos', () => {
      bd.upsertAccount(crearCuenta());
      expect(bd.getAccount('puuid-0001')).toEqual(crearCuenta());
    });

    it('devuelve null para una cuenta inexistente', () => {
      expect(bd.getAccount('no-existe')).toBeNull();
    });

    it('el upsert actualiza la cuenta existente sin duplicarla', () => {
      bd.upsertAccount(crearCuenta());
      bd.upsertAccount(
        crearCuenta({ tier: 'PLATINUM', rank: 'IV', leaguePoints: 80, summonerLevel: 150 })
      );

      const cuentas = bd.getAccounts();
      expect(cuentas).toHaveLength(1);
      expect(cuentas[0]).toMatchObject({ tier: 'PLATINUM', rank: 'IV', leaguePoints: 80, summonerLevel: 150 });
    });

    it('getAccounts ordena por updatedAt descendente', () => {
      bd.upsertAccount(crearCuenta({ puuid: 'antigua', updatedAt: 1000 }));
      bd.upsertAccount(crearCuenta({ puuid: 'reciente', updatedAt: 9000 }));
      bd.upsertAccount(crearCuenta({ puuid: 'media', updatedAt: 5000 }));

      expect(bd.getAccounts().map((cuenta) => cuenta.puuid)).toEqual(['reciente', 'media', 'antigua']);
    });

    it('mapea campos opcionales ausentes como undefined y aplica valores por defecto', () => {
      bd.upsertAccount(
        crearCuenta({
          summonerId: undefined,
          tier: undefined,
          rank: undefined,
          profileIconId: undefined,
          summonerLevel: undefined,
          leaguePoints: undefined,
          updatedAt: undefined,
        })
      );

      const cuenta = bd.getAccount('puuid-0001');
      expect(cuenta).not.toBeNull();
      expect(cuenta?.summonerId).toBeUndefined();
      expect(cuenta?.tier).toBeUndefined();
      expect(cuenta?.rank).toBeUndefined();
      expect(cuenta?.profileIconId).toBe(0);
      expect(cuenta?.summonerLevel).toBe(1);
      expect(cuenta?.leaguePoints).toBe(0);
      expect(cuenta?.updatedAt).toBeGreaterThan(0);
    });
  });

  describe('partidas', () => {
    it('guarda una partida y la recupera con ida y vuelta completa', () => {
      const resumen = crearResumen();
      expect(bd.hasMatch(resumen.matchId)).toBe(false);

      bd.saveMatch(resumen);
      expect(bd.hasMatch(resumen.matchId)).toBe(true);

      const [leido] = bd.getRecentMatches('puuid-0001');
      expect(leido).toMatchObject({
        matchId: resumen.matchId,
        puuid: resumen.puuid,
        gameCreation: resumen.gameCreation,
        gameDuration: resumen.gameDuration,
        gameVersion: resumen.gameVersion,
        queueId: resumen.queueId,
        championId: resumen.championId,
        championName: resumen.championName,
        role: resumen.role,
        win: resumen.win,
        kills: resumen.kills,
        deaths: resumen.deaths,
        assists: resumen.assists,
        cs: resumen.cs,
        goldEarned: resumen.goldEarned,
        damageDealt: resumen.damageDealt,
        items: resumen.items,
        primaryStyleId: resumen.primaryStyleId,
        subStyleId: resumen.subStyleId,
        selectedPerks: resumen.selectedPerks,
      });
      expect(leido.kda).toBe(7.5);
      expect(leido.csPerMinute).toBe(7);
    });

    it('calcula KDA sin muertes y CS/minuto con duración inválida', () => {
      bd.saveMatch(crearResumen({ matchId: 'm-perfecta', kills: 4, deaths: 0, assists: 9 }));
      bd.saveMatch(
        crearResumen({ matchId: 'm-remake', gameDuration: 0, cs: 100, kills: 1, deaths: 1, assists: 1 })
      );

      const partidas = bd.getRecentMatches('puuid-0001');
      const perfecta = partidas.find((partida) => partida.matchId === 'm-perfecta');
      const remake = partidas.find((partida) => partida.matchId === 'm-remake');

      expect(perfecta?.kda).toBe(13);
      expect(remake?.kda).toBe(2);
      expect(remake?.csPerMinute).toBe(0);
    });

    it('guardar la misma partida dos veces actualiza sin duplicar', () => {
      bd.saveMatch(crearResumen());
      bd.saveMatch(crearResumen({ kills: 20, win: false }));

      const partidas = bd.getRecentMatches('puuid-0001');
      expect(partidas).toHaveLength(1);
      expect(partidas[0].kills).toBe(20);
      expect(partidas[0].win).toBe(false);
    });

    it('getRecentMatches ordena por gameCreation descendente y respeta el límite', () => {
      for (let indice = 0; indice < 5; indice += 1) {
        bd.saveMatch(crearResumen({ matchId: `m-${indice}`, gameCreation: 1000 + indice }));
      }

      const recientes = bd.getRecentMatches('puuid-0001', 3);
      expect(recientes.map((partida) => partida.matchId)).toEqual(['m-4', 'm-3', 'm-2']);
    });

    it('getRecentMatches usa 20 como límite por defecto', () => {
      for (let indice = 0; indice < 25; indice += 1) {
        bd.saveMatch(crearResumen({ matchId: `m-${indice}`, gameCreation: 1000 + indice }));
      }

      expect(bd.getRecentMatches('puuid-0001')).toHaveLength(20);
    });

    it('solo devuelve las partidas del puuid solicitado', () => {
      bd.saveMatch(crearResumen({ matchId: 'm-propia' }));
      bd.saveMatch(crearResumen({ matchId: 'm-ajena', puuid: 'otro-puuid' }));

      const partidas = bd.getRecentMatches('puuid-0001');
      expect(partidas.map((partida) => partida.matchId)).toEqual(['m-propia']);
    });

    it('tolera el formato legado de perks_json (array plano sin estilos)', async () => {
      await conDirectorioTemporal(async (directorio) => {
        const ruta = join(directorio, 'itero_local.sqlite');
        const servicio = new DatabaseService({ rutaBd: ruta });
        await servicio.initialize();
        servicio.saveMatch(crearResumen());
        servicio.close();

        const inspeccion = new DatabaseSync(ruta);
        inspeccion
          .prepare('UPDATE match_participants SET perks_json = ?')
          .run(JSON.stringify([8005, 9111, 8009]));
        inspeccion.close();

        const reabierto = new DatabaseService({ rutaBd: ruta });
        await reabierto.initialize();
        const [partida] = reabierto.getRecentMatches('puuid-0001');

        expect(partida.selectedPerks).toEqual([8005, 9111, 8009]);
        expect(partida.primaryStyleId).toBe(0);
        expect(partida.subStyleId).toBe(0);
        reabierto.close();
      });
    });
  });

  describe('caché de matchups', () => {
    it('guarda y recupera recomendaciones de IA', () => {
      const recomendacion = crearRecomendacion();
      bd.setMatchupCache('266:84:TOP:14.20', recomendacion);

      expect(bd.getMatchupCache('266:84:TOP:14.20')).toEqual(recomendacion);
    });

    it('devuelve null para claves inexistentes', () => {
      expect(bd.getMatchupCache('clave-inexistente')).toBeNull();
    });

    it('usa el TTL por defecto cuando no se especifica', () => {
      bd.setMatchupCache('clave-sin-ttl', crearRecomendacion());
      expect(bd.getMatchupCache('clave-sin-ttl')).not.toBeNull();
    });

    it('caduca por tiempo (TTL) y la poda elimina solo lo expirado', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(1_000_000);
        bd.setMatchupCache('clave-ttl', crearRecomendacion(), 60);
        bd.setMatchupCache('clave-permanente', crearRecomendacion(), 3600);

        vi.setSystemTime(1_000_000 + 59_000);
        expect(bd.getMatchupCache('clave-ttl')).not.toBeNull();

        vi.setSystemTime(1_000_000 + 61_000);
        expect(bd.getMatchupCache('clave-ttl')).toBeNull();
        expect(bd.getMatchupCache('clave-permanente')).not.toBeNull();

        expect(bd.pruneExpiredCache()).toBe(1);
        expect(bd.pruneExpiredCache()).toBe(0);
        expect(bd.getMatchupCache('clave-permanente')).not.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('un TTL de 0 segundos caduca de inmediato', () => {
      bd.setMatchupCache('clave-cero', crearRecomendacion(), 0);
      expect(bd.getMatchupCache('clave-cero')).toBeNull();
      expect(bd.pruneExpiredCache()).toBe(1);
    });
  });

  describe('ajustes', () => {
    it('devuelve los ajustes por defecto cuando no hay nada guardado', () => {
      expect(bd.getSettings()).toEqual(DEFAULT_APP_SETTINGS);
    });

    it('devuelve copias: mutar el resultado no altera los valores por defecto', () => {
      const ajustes = bd.getSettings();
      ajustes.autoAccept.enabled = false;
      ajustes.autoChampSelect.rolePreferences.TOP.banChampions.push(999);

      const deNuevo = bd.getSettings();
      expect(deNuevo.autoAccept.enabled).toBe(true);
      expect(deNuevo.autoChampSelect.rolePreferences.TOP.banChampions).toEqual([]);
    });

    it('guarda ajustes parciales sin perder el resto', () => {
      bd.saveSettings({ autoAccept: { enabled: false, delaySeconds: 5, humanVariance: false } });

      const ajustes = bd.getSettings();
      expect(ajustes.autoAccept).toEqual({ enabled: false, delaySeconds: 5, humanVariance: false });
      expect(ajustes.autoChampSelect).toEqual(DEFAULT_APP_SETTINGS.autoChampSelect);
      expect(ajustes.apiKeys).toEqual(DEFAULT_APP_SETTINGS.apiKeys);
      expect(ajustes.activeAccount).toBeNull();
    });

    it('fusiona objetos anidados al guardar solo una parte', () => {
      bd.saveSettings({ autoAccept: { enabled: false, delaySeconds: 5, humanVariance: false } });
      bd.saveSettings({ autoAccept: { enabled: true } as unknown as AppSettings['autoAccept'] });

      expect(bd.getSettings().autoAccept).toEqual({
        enabled: true,
        delaySeconds: 5,
        humanVariance: false,
      });
    });

    it('guarda y limpia la cuenta activa', () => {
      const cuentaActiva = {
        puuid: 'puuid-0001',
        gameName: 'Itero',
        tagLine: 'LAS',
        platform: 'la1' as const,
        regional: 'americas' as const,
      };

      bd.saveSettings({ activeAccount: cuentaActiva });
      expect(bd.getSettings().activeAccount).toEqual(cuentaActiva);

      bd.saveSettings({ activeAccount: null });
      expect(bd.getSettings().activeAccount).toBeNull();
    });

    it('persiste claves de API cifradas entre llamadas', () => {
      bd.saveSettings({ apiKeys: { riotApiKeyEncrypted: 'cifrada-riot', geminiApiKeyEncrypted: 'cifrada-gemini' } });
      bd.saveSettings({ apiKeys: { geminiApiKeyEncrypted: 'nueva-gemini' } as unknown as AppSettings['apiKeys'] });

      expect(bd.getSettings().apiKeys).toEqual({
        riotApiKeyEncrypted: 'cifrada-riot',
        geminiApiKeyEncrypted: 'nueva-gemini',
      });
    });
  });

  describe('métricas de consumo de APIs', () => {
    it('registra llamadas y las cuenta por API y ventana temporal', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(1_700_000_000_000);
        bd.recordApiCall('RIOT', '/lol/summoner/v4/summoners/by-puuid/x', 200);
        bd.recordApiCall('RIOT', '/lol/league/v4/entries/by-summoner/x', 200);
        bd.recordApiCall('GEMINI', 'generateContent', 200);

        vi.setSystemTime(1_700_000_010_000);
        bd.recordApiCall('RIOT', '/lol/match/v5/matches/by-puuid/x/ids', 429);

        expect(bd.getApiCallCount('RIOT', 60_000)).toBe(3);
        expect(bd.getApiCallCount('RIOT', 5_000)).toBe(1);
        expect(bd.getApiCallCount('GEMINI', 60_000)).toBe(1);
        expect(bd.getApiCallCount('GEMINI', 5_000)).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('devuelve 0 cuando no hay llamadas registradas', () => {
      expect(bd.getApiCallCount('RIOT', 60_000)).toBe(0);
      expect(bd.getApiCallCount('GEMINI', 60_000)).toBe(0);
    });
  });

  describe('persistencia en disco', () => {
    it('conserva cuentas, partidas, ajustes y caché entre sesiones', async () => {
      await conDirectorioTemporal(async (directorio) => {
        const ruta = join(directorio, 'anidado', 'itero_local.sqlite');

        const primera = new DatabaseService({ rutaBd: ruta });
        await primera.initialize();
        primera.upsertAccount(crearCuenta({ puuid: 'persistente' }));
        primera.saveMatch(crearResumen({ puuid: 'persistente' }));
        primera.saveSettings({ autoAccept: { enabled: false, delaySeconds: 7, humanVariance: false } });
        primera.setMatchupCache('clave-persistente', crearRecomendacion());
        primera.close();

        const segunda = new DatabaseService({ rutaBd: ruta });
        await segunda.initialize();

        expect(segunda.getAccount('persistente')?.gameName).toBe('Itero');
        expect(segunda.getRecentMatches('persistente')).toHaveLength(1);
        expect(segunda.getSettings().autoAccept).toEqual({
          enabled: false,
          delaySeconds: 7,
          humanVariance: false,
        });
        expect(segunda.getMatchupCache('clave-persistente')).not.toBeNull();

        segunda.close();
      });
    });
  });
});
