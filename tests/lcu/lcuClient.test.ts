/**
 * Pruebas de integración del cliente LCU unificado (T-2.6).
 * Se monta un servidor local que simula la LCU API (HTTP + WebSocket en el mismo
 * puerto) y un lockfile en disco, verificando el flujo completo sin League of Legends.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { EVENTOS_LCU_CLIENT, LcuClient, type OpcionesLcuClient } from '../../src/main/lcu/LcuClient';
import type {
  ChampSelectSession,
  GameflowPhase,
  LcuConnectionState,
  ReadyCheckEvent,
  RunePage,
} from '../../src/shared/types';

interface PeticionRegistrada {
  metodo: string;
  ruta: string;
  cuerpo: unknown;
}

let servidor: Server;
let servidorWs: WebSocketServer;
let puerto: number;
let directorioTemporal: string;
let rutaLockfile: string;
let peticiones: PeticionRegistrada[];
let socketLcu: WebSocket | null;
let sesionChampSelect: ChampSelectSession | null;
let clientesCreados: LcuClient[];

function contenidoLockfile(): string {
  return `LeagueClientUx:7777:${puerto}:claveLcuClient:https`;
}

function responderJson(res: ServerResponse, estado: number, datos: unknown): void {
  res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(datos));
}

function manejarSolicitud(req: IncomingMessage, res: ServerResponse): void {
  const ruta = (req.url ?? '').split('?')[0];
  const fragmentos: Buffer[] = [];

  req.on('data', (fragmento: Buffer) => fragmentos.push(fragmento));
  req.on('end', () => {
    const texto = Buffer.concat(fragmentos).toString('utf-8');
    let cuerpo: unknown;
    try {
      cuerpo = texto ? JSON.parse(texto) : undefined;
    } catch {
      cuerpo = texto;
    }
    peticiones.push({ metodo: req.method ?? '', ruta, cuerpo });

    if (ruta === '/lol-gameflow/v1/gameflow-phase' && req.method === 'GET') {
      return responderJson(res, 200, 'Lobby');
    }
    if (ruta === '/lol-champ-select/v1/session' && req.method === 'GET') {
      if (sesionChampSelect) {
        return responderJson(res, 200, sesionChampSelect);
      }
      return responderJson(res, 404, { message: 'Not Found' });
    }
    if (ruta === '/lol-matchmaking/v1/ready-check/accept' && req.method === 'POST') {
      res.writeHead(204);
      return res.end();
    }
    if (ruta.startsWith('/lol-champ-select/v1/session/actions/') && req.method === 'PATCH') {
      res.writeHead(204);
      return res.end();
    }
    if (ruta === '/lol-champ-select/v1/session/my-selection' && req.method === 'PATCH') {
      res.writeHead(204);
      return res.end();
    }
    if (ruta === '/lol-perks/v1/pages' && req.method === 'POST') {
      return responderJson(res, 201, { id: 42, ...(cuerpo as Record<string, unknown>) });
    }
    if (ruta.startsWith('/lol-perks/v1/pages/') && req.method === 'PUT') {
      return responderJson(res, 200, cuerpo);
    }
    return responderJson(res, 404, { message: 'Ruta no simulada', ruta });
  });
}

/** Envía un evento `OnJsonApiEvent` desde el servidor simulado. */
function emitirEvento(uri: string, eventType: string, data: unknown): void {
  if (!socketLcu) {
    throw new Error('No hay conexión WebSocket simulada.');
  }
  socketLcu.send(JSON.stringify([8, 'OnJsonApiEvent', { uri, eventType, data }]));
}

function crearSesionChampSelect(): ChampSelectSession {
  return {
    gameId: 123,
    localPlayerCellId: 0,
    hasSimultaneousBans: false,
    hasSimultaneousPicks: false,
    isCustomGame: false,
    actions: [],
    myTeam: [],
    theirTeam: [],
    bans: { myTeamBans: [], theirTeamBans: [], numBans: 0 },
    timer: {
      adjustedTimeLeftInPhase: 30000,
      internalNowInEpochMs: Date.now(),
      phase: 'BAN_PICK',
      totalTimeInPhase: 30000,
    },
  };
}

/** Crea un cliente apuntando al lockfile temporal y al servidor simulado. */
function crearCliente(opciones: OpcionesLcuClient = {}): LcuClient {
  const cliente = new LcuClient({
    rutaLockfile,
    protocoloHttp: 'http',
    protocoloWs: 'ws',
    intervaloDeteccionMs: 50,
    intervaloReconexionMs: 50,
    timeoutConexionWsMs: 2000,
    autoAccept: { retrasoSegundos: 0, varianzaHumana: false },
    ...opciones,
  });
  clientesCreados.push(cliente);
  return cliente;
}

/** Espera hasta que una condición se cumpla (con sondeo corto). */
async function esperarHasta(condicion: () => boolean, timeoutMs = 4000): Promise<void> {
  const inicio = Date.now();
  while (!condicion()) {
    if (Date.now() - inicio > timeoutMs) {
      throw new Error('Tiempo de espera agotado esperando una condición.');
    }
    await new Promise((resolver) => setTimeout(resolver, 10));
  }
}

/** Espera a que el cliente alcance un estado de conexión concreto. */
async function esperarEstado(cliente: LcuClient, estado: LcuConnectionState): Promise<void> {
  await esperarHasta(() => cliente.getConnectionState() === estado);
}

beforeEach(async () => {
  peticiones = [];
  socketLcu = null;
  sesionChampSelect = null;
  clientesCreados = [];

  servidor = createServer(manejarSolicitud);
  servidorWs = new WebSocketServer({ server: servidor });
  servidorWs.on('connection', (socket) => {
    socketLcu = socket;
    socket.on('close', () => {
      if (socketLcu === socket) {
        socketLcu = null;
      }
    });
  });

  await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  puerto = (servidor.address() as AddressInfo).port;

  directorioTemporal = await mkdtemp(join(tmpdir(), 'itero-lcu-client-'));
  rutaLockfile = join(directorioTemporal, 'lockfile');
  await writeFile(rutaLockfile, contenidoLockfile(), 'utf-8');
});

afterEach(async () => {
  for (const cliente of clientesCreados) {
    cliente.disconnect();
  }
  if (socketLcu) {
    (socketLcu as WebSocket).terminate();
  }
  await new Promise<void>((resolver) => servidorWs.close(() => resolver()));
  servidor.closeAllConnections?.();
  await new Promise<void>((resolver) => servidor.close(() => resolver()));
  await rm(directorioTemporal, { recursive: true, force: true });
});

describe('LcuClient (T-2.6)', () => {
  it('debe detectar el lockfile, conectarse por WebSocket y obtener la fase inicial', async () => {
    const cliente = crearCliente();
    const estados: LcuConnectionState[] = [];
    cliente.on(EVENTOS_LCU_CLIENT.ESTADO_CAMBIADO, (estado: LcuConnectionState) => estados.push(estado));

    await cliente.initialize();

    expect(cliente.getConnectionState()).toBe('connected');
    expect(estados[0]).toBe('connecting');
    expect(estados).toContain('connected');
    await esperarHasta(() => cliente.getGameflowPhase() === 'Lobby');

    const fase = await cliente.request<GameflowPhase>('GET', '/lol-gameflow/v1/gameflow-phase');
    expect(fase).toBe('Lobby');
  });

  it('debe reemitir los eventos de gameflow, ready-check y sesión de champ select', async () => {
    const cliente = crearCliente();
    await cliente.initialize();
    await esperarHasta(() => cliente.getGameflowPhase() === 'Lobby');
    await esperarHasta(() => socketLcu !== null);

    const fases: GameflowPhase[] = [];
    const readyChecks: ReadyCheckEvent[] = [];
    const sesiones: Array<ChampSelectSession | null> = [];
    cliente.on(EVENTOS_LCU_CLIENT.GAMEFLOW_CAMBIADO, (fase: GameflowPhase) => fases.push(fase));
    cliente.on(EVENTOS_LCU_CLIENT.READY_CHECK, (readyCheck: ReadyCheckEvent) => readyChecks.push(readyCheck));
    cliente.on(EVENTOS_LCU_CLIENT.CHAMP_SELECT_SESSION, (sesion: ChampSelectSession | null) => sesiones.push(sesion));

    emitirEvento('/lol-gameflow/v1/gameflow-phase', 'Update', 'ChampSelect');
    emitirEvento('/lol-matchmaking/v1/ready-check', 'Update', {
      state: 'InProgress',
      playerResponse: 'None',
      suppressCountdown: false,
      timer: 8,
    });
    const sesion = crearSesionChampSelect();
    emitirEvento('/lol-champ-select/v1/session', 'Update', sesion);

    await esperarHasta(() => fases.length === 1 && readyChecks.length === 1 && sesiones.length === 1);
    expect(cliente.getGameflowPhase()).toBe('ChampSelect');
    expect(fases[0]).toBe('ChampSelect');
    expect(readyChecks[0].state).toBe('InProgress');
    expect(readyChecks[0].timer).toBe(8);
    expect(sesiones[0]).toEqual(sesion);

    // El fin de la sesión se emite como null.
    emitirEvento('/lol-champ-select/v1/session', 'Delete', null);
    await esperarHasta(() => sesiones.length === 2);
    expect(sesiones[1]).toBeNull();
  });

  it('debe aceptar automáticamente el ReadyCheck cuando el Auto-Accept está habilitado', async () => {
    const cliente = crearCliente();
    await cliente.initialize();
    await esperarHasta(() => socketLcu !== null);

    const aceptacionesEvento: boolean[] = [];
    cliente.on(EVENTOS_LCU_CLIENT.READY_CHECK_ACEPTADO, () => aceptacionesEvento.push(true));

    expect(cliente.isAutoAcceptEnabled()).toBe(false);
    cliente.setAutoAccept(true, 0);
    expect(cliente.isAutoAcceptEnabled()).toBe(true);

    emitirEvento('/lol-matchmaking/v1/ready-check', 'Update', {
      state: 'InProgress',
      playerResponse: 'None',
      suppressCountdown: false,
      timer: 8,
    });

    await esperarHasta(() =>
      peticiones.some((p) => p.ruta === '/lol-matchmaking/v1/ready-check/accept' && p.metodo === 'POST')
    );
    await esperarHasta(() => aceptacionesEvento.length === 1);

    const aceptaciones = peticiones.filter((p) => p.ruta === '/lol-matchmaking/v1/ready-check/accept');
    expect(aceptaciones).toHaveLength(1);
  });

  it('debe llamar a los endpoints correctos en los métodos de conveniencia', async () => {
    const cliente = crearCliente();
    await cliente.initialize();

    await cliente.acceptReadyCheck();
    await cliente.selectChampion(3, 64, true);
    await cliente.banChampion(4, 24, true);
    await cliente.setSummonerSpells(4, 14);

    const acciones = peticiones.filter((p) => p.ruta.startsWith('/lol-champ-select/v1/session/actions/'));
    expect(acciones).toEqual([
      { metodo: 'PATCH', ruta: '/lol-champ-select/v1/session/actions/3', cuerpo: { championId: 64, completed: true } },
      { metodo: 'PATCH', ruta: '/lol-champ-select/v1/session/actions/4', cuerpo: { championId: 24, completed: true } },
    ]);
    const hechizos = peticiones.find((p) => p.ruta === '/lol-champ-select/v1/session/my-selection');
    expect(hechizos?.metodo).toBe('PATCH');
    expect(hechizos?.cuerpo).toEqual({ spell1Id: 4, spell2Id: 14 });
    expect(peticiones.filter((p) => p.ruta === '/lol-matchmaking/v1/ready-check/accept')).toHaveLength(1);
  });

  it('debe devolver la sesión de champ select o null cuando no existe (404)', async () => {
    const cliente = crearCliente();
    await cliente.initialize();

    expect(await cliente.getChampSelectSession()).toBeNull();

    sesionChampSelect = crearSesionChampSelect();
    const sesion = await cliente.getChampSelectSession();
    expect(sesion).toEqual(sesionChampSelect);
  });

  it('debe validar y enviar páginas de runas (crear y sobrescribir)', async () => {
    const cliente = crearCliente();
    await cliente.initialize();

    const invalida: RunePage = {
      name: 'Prueba',
      primaryStyleId: 8000,
      subStyleId: 8100,
      selectedPerkIds: [1, 2],
      current: false,
    };
    const resultadoInvalido = await cliente.injectRunePage(invalida);
    expect(resultadoInvalido.success).toBe(false);
    expect(resultadoInvalido.error).toContain('9');

    const pagina: RunePage = {
      name: 'Itero - Jungla',
      primaryStyleId: 8000,
      subStyleId: 8100,
      selectedPerkIds: [8005, 9111, 8009, 8014, 8226, 8210, 5008, 5008, 5002],
      current: true,
    };
    const resultadoCrear = await cliente.injectRunePage(pagina);
    expect(resultadoCrear).toEqual({ success: true, pageId: 42 });
    const peticionPost = peticiones.find((p) => p.ruta === '/lol-perks/v1/pages' && p.metodo === 'POST');
    expect(peticionPost?.cuerpo).toEqual(pagina);

    const resultadoActualizar = await cliente.injectRunePage({ ...pagina, id: 7 });
    expect(resultadoActualizar).toEqual({ success: true, pageId: 7 });
    const peticionPut = peticiones.find((p) => p.ruta === '/lol-perks/v1/pages/7');
    expect(peticionPut?.metodo).toBe('PUT');
    expect(peticionPut?.cuerpo).toEqual({ ...pagina, id: 7 });
  });

  it('debe pasar a connecting si el lockfile desaparece y reconectar cuando vuelve', async () => {
    const cliente = crearCliente();
    await cliente.initialize();
    await esperarEstado(cliente, 'connected');

    await unlink(rutaLockfile);
    await esperarEstado(cliente, 'connecting');

    await writeFile(rutaLockfile, contenidoLockfile(), 'utf-8');
    await esperarEstado(cliente, 'connected');
  });

  it('debe quedar en connecting si el lockfile no existe y conectarse cuando aparezca', async () => {
    await unlink(rutaLockfile);
    const cliente = crearCliente();

    await cliente.initialize();
    expect(cliente.getConnectionState()).toBe('connecting');

    await writeFile(rutaLockfile, contenidoLockfile(), 'utf-8');
    await esperarEstado(cliente, 'connected');
  });

  it('disconnect debe cerrar todo y no intentar reconectar', async () => {
    const cliente = crearCliente();
    await cliente.initialize();
    await esperarEstado(cliente, 'connected');

    cliente.disconnect();
    expect(cliente.getConnectionState()).toBe('disconnected');
    expect(cliente.isAutoAcceptEnabled()).toBe(false);

    await new Promise((resolver) => setTimeout(resolver, 200));
    expect(cliente.getConnectionState()).toBe('disconnected');
  });
});
