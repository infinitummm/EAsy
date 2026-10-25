/**
 * Pruebas unitarias del cliente Live Client Data API y del detector de modo en
 * la LCU (T-8.2).
 *
 * Para verificar la conexión HTTPS autofirmada se levanta un servidor TLS local
 * con el certificado de pruebas de `tests/fixtures/lcu/`, que replica el que
 * expone League of Legends en `127.0.0.1:2999`. No se realiza ninguna petición
 * a Internet ni se necesita el juego abierto.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  ErrorLiveClientData,
  LiveClientDataClient,
  detectarModoEnLcu,
  detectarModoPorCola,
  detectarModoPorSesion,
  esHostLocal,
} from '../../src/main/lcu/LiveClientDataClient';
import type { ClienteLcuGameflow } from '../../src/main/lcu/LiveClientDataClient';

const RUTA_FIXTURES = path.join(__dirname, '..', 'fixtures', 'lcu');
const CERTIFICADO = fs.readFileSync(path.join(RUTA_FIXTURES, 'liveclientdata-cert.pem'));
const CLAVE = fs.readFileSync(path.join(RUTA_FIXTURES, 'liveclientdata-key.pem'));

type Manejador = (req: IncomingMessage, res: ServerResponse) => void;

let servidor: https.Server | null = null;
let baseUrl = '';
let peticiones: string[] = [];

function responderJson(res: ServerResponse, cuerpo: unknown, estado = 200): void {
  res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(cuerpo));
}

async function iniciarServidor(manejador: Manejador): Promise<LiveClientDataClient> {
  servidor = https.createServer({ key: CLAVE, cert: CERTIFICADO }, (req, res) => {
    peticiones.push(req.url ?? '');
    manejador(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    servidor!.once('error', reject);
    servidor!.listen(0, '127.0.0.1', () => resolve());
  });

  const { port } = servidor.address() as AddressInfo;
  baseUrl = `https://127.0.0.1:${port}`;
  return new LiveClientDataClient({ baseUrl, registrar: () => {} });
}

async function detenerServidor(): Promise<void> {
  if (!servidor) return;
  const actual = servidor;
  servidor = null;
  actual.closeAllConnections();
  await new Promise<void>((resolve) => actual.close(() => resolve()));
}

afterEach(async () => {
  await detenerServidor();
  peticiones = [];
  vi.restoreAllMocks();
});

// ==========================================
// Detección de modo
// ==========================================

describe('detección de modo por cola de la LCU', () => {
  it('mapea la cola 2400 a ARAM Caos y la 1700 a Arena', () => {
    expect(detectarModoPorCola(2400)).toBe('aram_mayhem');
    expect(detectarModoPorCola('2400')).toBe('aram_mayhem');
    expect(detectarModoPorCola(1700)).toBe('arena');
    expect(detectarModoPorCola('1700')).toBe('arena');
  });

  it('mapea ARAM normal y ranked, y deja el resto sin etiquetar', () => {
    expect(detectarModoPorCola(450)).toBe('aram');
    expect(detectarModoPorCola(420)).toBe('ranked');
    expect(detectarModoPorCola(440)).toBe('ranked');
    expect(detectarModoPorCola(9999)).toBeNull();
    expect(detectarModoPorCola(null)).toBeNull();
    expect(detectarModoPorCola(undefined)).toBeNull();
    expect(detectarModoPorCola('no-es-un-numero')).toBeNull();
  });

  it('prioriza la cola sobre gameMode al interpretar la sesión', () => {
    expect(
      detectarModoPorSesion({
        gameData: { queue: { id: 2400 }, gameMode: 'ARAM' },
      })
    ).toBe('aram_mayhem');
  });

  it('usa gameMode como respaldo cuando la cola no está mapeada', () => {
    expect(
      detectarModoPorSesion({
        gameData: { queue: { id: 9999 }, gameMode: 'CHERRY' },
      })
    ).toBe('arena');
    expect(
      detectarModoPorSesion({
        gameData: { queue: { id: 9999 }, gameMode: 'ARAM' },
      })
    ).toBe('aram');
    expect(
      detectarModoPorSesion({
        gameData: { queue: { id: 9999 }, gameMode: 'CLASSIC' },
      })
    ).toBe('normal');
    expect(detectarModoPorSesion(null)).toBeNull();
    expect(detectarModoPorSesion({ gameData: null })).toBeNull();
  });

  it('consulta /lol-gameflow/v1/session y devuelve el modo', async () => {
    const request = vi.fn().mockResolvedValue({
      gameData: { queue: { id: 1700 }, gameMode: 'CHERRY' },
    });
    const lcu = { request } as unknown as ClienteLcuGameflow;

    await expect(detectarModoEnLcu(lcu, () => {})).resolves.toBe('arena');
    expect(request).toHaveBeenCalledWith('GET', '/lol-gameflow/v1/session');
  });

  it('devuelve null y registra el fallo si la LCU no responde', async () => {
    const request = vi.fn().mockRejectedValue(new Error('LCU cerrada'));
    const registrar = vi.fn();
    const lcu = { request } as unknown as ClienteLcuGameflow;

    await expect(detectarModoEnLcu(lcu, registrar)).resolves.toBeNull();
    expect(registrar).toHaveBeenCalledWith(
      expect.stringContaining('No se pudo consultar el Gameflow')
    );
  });
});

// ==========================================
// Cliente HTTPS local
// ==========================================

describe('LiveClientDataClient contra HTTPS autofirmado', () => {
  it('considera activa la partida cuando /activeplayer responde 200', async () => {
    const cliente = await iniciarServidor((_req, res) => {
      responderJson(res, { summonerName: 'Invocador de prueba' });
    });

    await expect(cliente.isGameActive()).resolves.toBe(true);
    expect(peticiones).toEqual(['/liveclientdata/activeplayer']);
  });

  it('considera inactiva la partida ante un 404', async () => {
    const cliente = await iniciarServidor((_req, res) => {
      responderJson(res, { error: 'sin partida' }, 404);
    });

    await expect(cliente.isGameActive()).resolves.toBe(false);
  });

  it('considera inactiva la partida si el puerto está cerrado', async () => {
    const cliente = await iniciarServidor((_req, res) => responderJson(res, {}));
    await detenerServidor();

    await expect(cliente.isGameActive()).resolves.toBe(false);
    await expect(cliente.getActivePlayer()).resolves.toBeNull();
    await expect(cliente.getAllGameData()).resolves.toBeNull();
  });

  it('completa el campeón del jugador activo con allPlayers', async () => {
    const cliente = await iniciarServidor((req, res) => {
      if (req.url === '/liveclientdata/activeplayer') {
        responderJson(res, { summonerName: 'Invocador de prueba', level: 18 });
        return;
      }
      if (req.url === '/liveclientdata/allgamedata') {
        responderJson(res, {
          activePlayer: { summonerName: 'Invocador de prueba' },
          allPlayers: [
            { summonerName: 'Otro', championName: 'Ahri' },
            { summonerName: 'Invocador de prueba', championName: 'Aatrox' },
          ],
        });
        return;
      }
      responderJson(res, {}, 404);
    });

    await expect(cliente.getActivePlayer()).resolves.toEqual({
      summonerName: 'Invocador de prueba',
      championName: 'Aatrox',
    });
    expect(peticiones.sort()).toEqual([
      '/liveclientdata/activeplayer',
      '/liveclientdata/allgamedata',
    ]);
  });

  it('tolera que /activeplayer falle si allgamedata trae los datos', async () => {
    const cliente = await iniciarServidor((req, res) => {
      if (req.url === '/liveclientdata/activeplayer') {
        responderJson(res, { error: 'temporal' }, 500);
        return;
      }
      responderJson(res, {
        activePlayer: { summonerName: 'Invocador alternativo' },
        allPlayers: [
          { summonerName: 'Invocador alternativo', championName: 'Jinx' },
        ],
      });
    });

    await expect(cliente.getActivePlayer()).resolves.toEqual({
      summonerName: 'Invocador alternativo',
      championName: 'Jinx',
    });
  });

  it('usa championName de activeplayer si allgamedata no responde', async () => {
    const cliente = await iniciarServidor((req, res) => {
      if (req.url === '/liveclientdata/activeplayer') {
        responderJson(res, { summonerName: 'Invocador', championName: 'Lux' });
        return;
      }
      res.destroy();
    });

    await expect(cliente.getActivePlayer()).resolves.toEqual({
      summonerName: 'Invocador',
      championName: 'Lux',
    });
  });

  it('devuelve null si no puede determinar el campeón', async () => {
    const cliente = await iniciarServidor((req, res) => {
      if (req.url === '/liveclientdata/activeplayer') {
        responderJson(res, { summonerName: 'Invocador' });
        return;
      }
      responderJson(res, {
        allPlayers: [{ summonerName: 'Otra persona', championName: 'Ahri' }],
      });
    });

    await expect(cliente.getActivePlayer()).resolves.toBeNull();
  });

  it('obtiene el payload completo y lo devuelve como objeto', async () => {
    const datos = {
      gameData: { gameMode: 'ARAM', gameTime: 120.5 },
      allPlayers: [{ summonerName: 'Invocador', championName: 'Sett' }],
    };
    const cliente = await iniciarServidor((_req, res) => responderJson(res, datos));

    await expect(cliente.getAllGameData()).resolves.toEqual(datos);
  });

  it('devuelve null ante JSON inválido', async () => {
    const cliente = await iniciarServidor((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{ esto no es JSON');
    });

    await expect(cliente.getAllGameData()).resolves.toBeNull();
    await expect(cliente.getActivePlayer()).resolves.toBeNull();
  });

  it('devuelve la instantánea combinada con el modo de la LCU', async () => {
    const cliente = await iniciarServidor((req, res) => {
      if (req.url === '/liveclientdata/activeplayer') {
        responderJson(res, { summonerName: 'Invocador' });
        return;
      }
      responderJson(res, {
        activePlayer: { summonerName: 'Invocador' },
        allPlayers: [{ summonerName: 'Invocador', championName: 'Sion' }],
      });
    });

    const request = vi.fn().mockResolvedValue({
      gameData: { queue: { id: 2400 }, gameMode: 'ARAM' },
    });
    const lcu = { request } as unknown as ClienteLcuGameflow;

    const instantanea = await cliente.obtenerInstantanea(lcu);
    expect(instantanea.activo).toBe(true);
    expect(instantanea.jugador).toEqual({
      summonerName: 'Invocador',
      championName: 'Sion',
    });
    expect(instantanea.datos).toBeTruthy();
    expect(instantanea.modo).toBe('aram_mayhem');
    expect(instantanea.capturadoEn).toEqual(expect.any(Number));
  });

  it('devuelve modo null si no recibe la LCU', async () => {
    const cliente = await iniciarServidor((_req, res) => responderJson(res, {}));
    const instantanea = await cliente.obtenerInstantanea();
    expect(instantanea.modo).toBeNull();
    expect(instantanea.activo).toBe(true);
  });

  it('respeta el tiempo máximo de espera', async () => {
    await iniciarServidor((_req, res) => {
      setTimeout(() => {
        try {
          responderJson(res, { summonerName: 'Tarde' });
        } catch {
          // El cliente ya cerró la petición.
        }
      }, 300);
    });

    const clienteRapido = new LiveClientDataClient({
      baseUrl,
      tiempoMaximoMs: 100,
      registrar: () => {},
    });

    await expect(clienteRapido.isGameActive()).resolves.toBe(false);
    await expect(clienteRapido.getAllGameData()).resolves.toBeNull();
  });

  it('rechaza una base que no use HTTPS', () => {
    expect(
      () => new LiveClientDataClient({ baseUrl: 'http://127.0.0.1:2999' })
    ).toThrow(ErrorLiveClientData);
  });

  it('solo acepta certificados autofirmados para hosts locales', () => {
    expect(esHostLocal('127.0.0.1')).toBe(true);
    expect(esHostLocal('localhost')).toBe(true);
    expect(esHostLocal('[::1]')).toBe(true);
    expect(esHostLocal('example.com')).toBe(false);
    expect(esHostLocal('192.168.1.10')).toBe(false);
  });
});

