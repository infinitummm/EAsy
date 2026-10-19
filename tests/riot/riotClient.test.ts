/**
 * Pruebas unitarias del cliente de la Riot API (T-3.4).
 * Se levanta un servidor HTTP local que simula la API oficial y se verifica:
 * construcción de URLs, cabecera de autenticación, rate limiting inyectado,
 * backoff con `Retry-After`, errores HTTP y chequeo de salud de la clave.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  ErrorClaveRiotFaltante,
  ErrorRiotApi,
  MAX_PARTIDAS_HISTORIAL,
  RiotApiClient,
} from '../../src/main/riot/RiotApiClient';
import type { IRateLimiter } from '../../src/shared/contracts';
import type {
  ChampionMasteryDto,
  MatchDto,
  RankedEntryDto,
  RiotAccountDto,
  RiotSummonerDto,
} from '../../src/shared/types';

// ==========================================
// Servidor simulado
// ==========================================

interface PeticionRegistrada {
  metodo: string;
  ruta: string;
  cabeceras: Record<string, string | string[] | undefined>;
}

let servidor: Server;
let puerto: number;
let peticiones: PeticionRegistrada[];
let manejadores: Map<string, (req: IncomingMessage, res: ServerResponse) => void>;

function responderJson(
  res: ServerResponse,
  estado: number,
  datos: unknown,
  cabeceras: Record<string, string> = {}
): void {
  res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8', ...cabeceras });
  res.end(JSON.stringify(datos));
}

function registrarRuta(
  ruta: string,
  manejador: (req: IncomingMessage, res: ServerResponse) => void
): void {
  manejadores.set(ruta, manejador);
}

function crearLimitadorEspia(): IRateLimiter & {
  acquire: ReturnType<typeof vi.fn>;
  reportResult: ReturnType<typeof vi.fn>;
  getStatus: ReturnType<typeof vi.fn>;
} {
  return {
    acquire: vi.fn(async () => undefined),
    reportResult: vi.fn(),
    getStatus: vi.fn(() => ({
      service: 'RIOT' as const,
      tokensAvailableShort: 20,
      tokensAvailableLong: 100,
      isThrottled: false,
      backoffMs: 0,
    })),
  } as unknown as IRateLimiter & {
    acquire: ReturnType<typeof vi.fn>;
    reportResult: ReturnType<typeof vi.fn>;
    getStatus: ReturnType<typeof vi.fn>;
  };
}

function crearCliente(
  limitador: IRateLimiter,
  opciones: { timeoutMs?: number } = {}
): RiotApiClient {
  return new RiotApiClient({
    rateLimiter: limitador,
    urlRegional: () => `http://127.0.0.1:${puerto}/regional`,
    urlPlataforma: () => `http://127.0.0.1:${puerto}/plataforma`,
    plataformaSalud: 'la1',
    timeoutMs: opciones.timeoutMs,
  });
}

// ==========================================
// Datos de ejemplo
// ==========================================

const CUENTA: RiotAccountDto = { puuid: 'puuid-1', gameName: 'Itero UwU', tagLine: 'LAS' };
const INVOCADOR: RiotSummonerDto = {
  id: 'summoner-1',
  accountId: 'cuenta-1',
  puuid: 'puuid-1',
  profileIconId: 4567,
  revisionDate: 1_700_000_000_000,
  summonerLevel: 123,
};
const ENTRADAS: RankedEntryDto[] = [
  {
    leagueId: 'liga-1',
    summonerId: 'summoner-1',
    queueType: 'RANKED_SOLO_5x5',
    tier: 'GOLD',
    rank: 'II',
    leaguePoints: 45,
    wins: 30,
    losses: 28,
    veteran: false,
    inactive: false,
    freshBlood: false,
    hotStreak: true,
  },
];
const MAESTRIAS: ChampionMasteryDto[] = [
  {
    puuid: 'puuid-1',
    championId: 266,
    championLevel: 7,
    championPoints: 45_000,
    lastPlayTime: 1_700_000_000_000,
    championPointsSinceLastLevel: 1000,
    championPointsUntilNextLevel: 2000,
    chestGranted: true,
    tokensEarned: 2,
  },
];
const PARTIDA: MatchDto = {
  metadata: { dataVersion: '2', matchId: 'LA1_123', participants: ['puuid-1'] },
  info: {
    gameCreation: 1_700_000_000_000,
    gameDuration: 1800,
    gameEndTimestamp: 1_700_001_800_000,
    gameId: 123,
    gameMode: 'CLASSIC',
    gameName: 'Partida de prueba',
    gameStartTimestamp: 1_700_000_000_000,
    gameType: 'MATCHED_GAME',
    gameVersion: '14.20.1',
    mapId: 11,
    participants: [],
    platformId: 'LA1',
    queueId: 420,
  },
};

// ==========================================
// Suite
// ==========================================

describe('RiotApiClient (T-3.4)', () => {
  beforeEach(async () => {
    peticiones = [];
    manejadores = new Map();
    servidor = createServer((req, res) => {
      peticiones.push({
        metodo: req.method ?? '',
        ruta: req.url ?? '',
        cabeceras: req.headers,
      });
      const camino = (req.url ?? '').split('?')[0];
      const manejador = manejadores.get(camino);
      if (manejador) {
        return manejador(req, res);
      }
      responderJson(res, 404, { status: { message: 'Data not found', status_code: 404 } });
    });
    await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
    puerto = (servidor.address() as AddressInfo).port;
  });

  afterEach(async () => {
    servidor.closeAllConnections();
    await new Promise<void>((resolver) => servidor.close(() => resolver()));
  });

  describe('autenticación y URLs', () => {
    it('getAccountByRiotId codifica el Riot ID y envía la cabecera X-Riot-Token', async () => {
      registrarRuta('/regional/riot/account/v1/accounts/by-riot-id/Itero%20UwU/LAS', (_req, res) =>
        responderJson(res, 200, CUENTA)
      );
      const cliente = crearCliente(crearLimitadorEspia());
      cliente.setApiKey('  RGAPI-clave-prueba  ');

      await expect(cliente.getAccountByRiotId('Itero UwU', 'LAS', 'americas')).resolves.toEqual(
        CUENTA
      );

      expect(peticiones).toHaveLength(1);
      expect(peticiones[0].ruta).toBe('/regional/riot/account/v1/accounts/by-riot-id/Itero%20UwU/LAS');
      expect(peticiones[0].cabeceras['x-riot-token']).toBe('RGAPI-clave-prueba');
    });

    it('getSummonerByPuuid usa el enrutamiento de plataforma', async () => {
      registrarRuta('/plataforma/lol/summoner/v4/summoners/by-puuid/puuid-1', (_req, res) =>
        responderJson(res, 200, INVOCADOR)
      );
      const cliente = crearCliente(crearLimitadorEspia());
      cliente.setApiKey('clave');

      await expect(cliente.getSummonerByPuuid('puuid-1', 'la1')).resolves.toEqual(INVOCADOR);
      expect(peticiones[0].ruta).toBe('/plataforma/lol/summoner/v4/summoners/by-puuid/puuid-1');
    });

    it('getRankedEntries devuelve el arreglo de entradas de rango', async () => {
      registrarRuta('/plataforma/lol/league/v4/entries/by-summoner/summoner-1', (_req, res) =>
        responderJson(res, 200, ENTRADAS)
      );
      const cliente = crearCliente(crearLimitadorEspia());
      cliente.setApiKey('clave');

      await expect(cliente.getRankedEntries('summoner-1', 'la1')).resolves.toEqual(ENTRADAS);
    });

    it('getChampionMasteries consulta por PUUID y devuelve las maestrías', async () => {
      registrarRuta(
        '/plataforma/lol/champion-mastery/v4/champion-masteries/by-puuid/puuid-1',
        (_req, res) => responderJson(res, 200, MAESTRIAS)
      );
      const cliente = crearCliente(crearLimitadorEspia());
      cliente.setApiKey('clave');

      await expect(cliente.getChampionMasteries('puuid-1', 'la1')).resolves.toEqual(MAESTRIAS);
    });

    it('getMatchHistory usa 20 como cantidad por defecto', async () => {
      registrarRuta('/regional/lol/match/v5/matches/by-puuid/puuid-1/ids', (_req, res) =>
        responderJson(res, 200, ['LA1_1', 'LA1_2'])
      );
      const cliente = crearCliente(crearLimitadorEspia());
      cliente.setApiKey('clave');

      await expect(cliente.getMatchHistory('puuid-1', 'americas')).resolves.toEqual([
        'LA1_1',
        'LA1_2',
      ]);
      expect(peticiones[0].ruta).toBe('/regional/lol/match/v5/matches/by-puuid/puuid-1/ids?start=0&count=20');
    });

    it('getMatchHistory respeta la cantidad solicitada y recorta al máximo oficial', async () => {
      registrarRuta('/regional/lol/match/v5/matches/by-puuid/puuid-1/ids', (_req, res) =>
        responderJson(res, 200, [])
      );
      const cliente = crearCliente(crearLimitadorEspia());
      cliente.setApiKey('clave');

      await cliente.getMatchHistory('puuid-1', 'americas', 5);
      await cliente.getMatchHistory('puuid-1', 'americas', 500);
      await cliente.getMatchHistory('puuid-1', 'americas', 0);

      expect(peticiones[0].ruta).toContain('count=5');
      expect(peticiones[1].ruta).toContain(`count=${MAX_PARTIDAS_HISTORIAL}`);
      expect(peticiones[2].ruta).toContain('count=1');
    });

    it('getMatchById obtiene el detalle de la partida', async () => {
      registrarRuta('/regional/lol/match/v5/matches/LA1_123', (_req, res) =>
        responderJson(res, 200, PARTIDA)
      );
      const cliente = crearCliente(crearLimitadorEspia());
      cliente.setApiKey('clave');

      await expect(cliente.getMatchById('LA1_123', 'americas')).resolves.toEqual(PARTIDA);
    });
  });

  describe('errors y validaciones', () => {
    it('lanza ErrorClaveRiotFaltante si no hay clave configurada', async () => {
      const cliente = crearCliente(crearLimitadorEspia());

      await expect(cliente.getAccountByRiotId('Itero', 'LAS', 'americas')).rejects.toThrow(
        ErrorClaveRiotFaltante
      );
      expect(peticiones).toHaveLength(0);
    });

    it('setApiKey rechaza claves vacías o en blanco', () => {
      const cliente = crearCliente(crearLimitadorEspia());

      expect(() => cliente.setApiKey('')).toThrow(ErrorClaveRiotFaltante);
      expect(() => cliente.setApiKey('   ')).toThrow(ErrorClaveRiotFaltante);
    });

    it('un 404 produce ErrorRiotApi con el código y el cuerpo', async () => {
      const cliente = crearCliente(crearLimitadorEspia());
      cliente.setApiKey('clave');

      const error = await cliente
        .getSummonerByPuuid('desconocido', 'la1')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ErrorRiotApi);
      expect((error as ErrorRiotApi).codigoEstado).toBe(404);
      expect((error as ErrorRiotApi).cuerpo).toContain('Data not found');
    });

    it('un 403 produce ErrorRiotApi (clave caducada)', async () => {
      registrarRuta('/regional/lol/match/v5/matches/by-puuid/puuid-1/ids', (_req, res) =>
        responderJson(res, 403, { status: { message: 'Forbidden', status_code: 403 } })
      );
      const cliente = crearCliente(crearLimitadorEspia());
      cliente.setApiKey('clave-caducada');

      const error = await cliente.getMatchHistory('puuid-1', 'americas').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ErrorRiotApi);
      expect((error as ErrorRiotApi).codigoEstado).toBe(403);
    });

    it('una respuesta 200 sin JSON válido produce ErrorRiotApi', async () => {
      registrarRuta('/regional/riot/account/v1/accounts/by-riot-id/Itero/LAS', (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('esto no es json');
      });
      const cliente = crearCliente(crearLimitadorEspia());
      cliente.setApiKey('clave');

      const error = await cliente
        .getAccountByRiotId('Itero', 'LAS', 'americas')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ErrorRiotApi);
      expect((error as ErrorRiotApi).codigoEstado).toBe(200);
    });

    it('una petición que supera el timeout produce ErrorRiotApi (408)', async () => {
      // Manejador que nunca responde para forzar el aborto por timeout.
      registrarRuta('/regional/lol/match/v5/matches/LA1_lenta', () => {
        /* sin respuesta deliberada */
      });
      const cliente = crearCliente(crearLimitadorEspia(), { timeoutMs: 150 });
      cliente.setApiKey('clave');

      const error = await cliente.getMatchById('LA1_lenta', 'americas').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ErrorRiotApi);
      expect((error as ErrorRiotApi).codigoEstado).toBe(408);
    });
  });

  describe('integración con el limitador de tasa', () => {
    it('adquiere un turno antes de cada petición y reporta el resultado', async () => {
      registrarRuta('/regional/riot/account/v1/accounts/by-riot-id/Itero/LAS', (_req, res) =>
        responderJson(res, 200, CUENTA)
      );
      const limitador = crearLimitadorEspia();
      const cliente = crearCliente(limitador);
      cliente.setApiKey('clave');

      await cliente.getAccountByRiotId('Itero', 'LAS', 'americas');
      await cliente.getAccountByRiotId('Itero', 'LAS', 'americas');

      expect(limitador.acquire).toHaveBeenCalledTimes(2);
      expect(limitador.reportResult).toHaveBeenCalledTimes(2);
      expect(limitador.reportResult).toHaveBeenNthCalledWith(1, 200, undefined);
    });

    it('reporta un 404 al limitador', async () => {
      const limitador = crearLimitadorEspia();
      const cliente = crearCliente(limitador);
      cliente.setApiKey('clave');

      await cliente.getSummonerByPuuid('desconocido', 'la1').catch(() => undefined);

      expect(limitador.reportResult).toHaveBeenCalledWith(404, undefined);
    });

    it('transmite Retry-After al limitador cuando la API responde 429', async () => {
      registrarRuta('/regional/lol/match/v5/matches/by-puuid/puuid-1/ids', (_req, res) =>
        responderJson(res, 429, { status: { message: 'Rate limit exceeded' } }, { 'Retry-After': '3' })
      );
      const limitador = crearLimitadorEspia();
      const cliente = crearCliente(limitador);
      cliente.setApiKey('clave');

      await cliente.getMatchHistory('puuid-1', 'americas').catch(() => undefined);

      expect(limitador.reportResult).toHaveBeenCalledWith(429, 3);
    });
  });

  describe('checkKeyHealth (STATUS-V4)', () => {
    it('devuelve valid: true cuando el servicio responde 200', async () => {
      registrarRuta('/plataforma/lol/status/v4/platform-data', (_req, res) =>
        responderJson(res, 200, { id: 'LA1', name: 'Latin America North' })
      );
      const cliente = crearCliente(crearLimitadorEspia());
      cliente.setApiKey('clave-valida');

      const salud = await cliente.checkKeyHealth();
      expect(salud.valid).toBe(true);
      expect(salud.statusCode).toBe(200);
      expect(salud.isExpired).toBe(false);
      expect(salud.lastChecked).toBeGreaterThan(0);
    });

    it('marca isExpired con 403 (clave de desarrollo caducada)', async () => {
      registrarRuta('/plataforma/lol/status/v4/platform-data', (_req, res) =>
        responderJson(res, 403, { status: { message: 'Forbidden', status_code: 403 } })
      );
      const cliente = crearCliente(crearLimitadorEspia());
      cliente.setApiKey('clave-caducada');

      const salud = await cliente.checkKeyHealth();
      expect(salud).toEqual(
        expect.objectContaining({ valid: false, statusCode: 403, isExpired: true })
      );
    });

    it('marca isExpired con 401 (clave inválida)', async () => {
      registrarRuta('/plataforma/lol/status/v4/platform-data', (_req, res) =>
        responderJson(res, 401, { status: { message: 'Unauthorized', status_code: 401 } })
      );
      const cliente = crearCliente(crearLimitadorEspia());
      cliente.setApiKey('clave-invalida');

      const salud = await cliente.checkKeyHealth();
      expect(salud).toEqual(
        expect.objectContaining({ valid: false, statusCode: 401, isExpired: true })
      );
    });

    it('no marca isExpired con 429 (límite temporal, no clave caducada)', async () => {
      registrarRuta('/plataforma/lol/status/v4/platform-data', (_req, res) =>
        responderJson(res, 429, { status: { message: 'Rate limit exceeded' } }, { 'Retry-After': '1' })
      );
      const cliente = crearCliente(crearLimitadorEspia());
      cliente.setApiKey('clave');

      const salud = await cliente.checkKeyHealth();
      expect(salud).toEqual(
        expect.objectContaining({ valid: false, statusCode: 429, isExpired: false })
      );
    });

    it('devuelve invalid sin statusCode si no hay clave, sin tocar la red', async () => {
      const cliente = crearCliente(crearLimitadorEspia());

      const salud = await cliente.checkKeyHealth();
      expect(salud).toEqual(
        expect.objectContaining({ valid: false, isExpired: false, lastChecked: expect.any(Number) })
      );
      expect(salud.statusCode).toBeUndefined();
      expect(peticiones).toHaveLength(0);
    });
  });
});
