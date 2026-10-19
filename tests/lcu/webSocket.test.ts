/**
 * Pruebas unitarias del cliente WebSocket WSS de la LCU API (T-2.4).
 * Se utiliza un servidor WebSocket local (`ws`) que simula los frames de la LCU.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { construirTokenBase64 } from '../../src/main/lcu/lockfile';
import {
  LcuWebSocket,
  MENSAJE_SUSCRIPCION_LCU,
  type DetalleDesconexion,
  type DetalleReconexion,
  type EventoLcu,
} from '../../src/main/lcu/LcuWebSocket';
import type { LcuCredentials } from '../../src/shared/types';

let servidorHttp: Server;
let servidorWs: WebSocketServer;
let puerto: number;
let socketsServidor: WebSocket[] = [];
let mensajesRecibidos: string[] = [];
let autorizacionRecibida: string | undefined;
let clientesCreados: LcuWebSocket[] = [];

function crearCredenciales(): LcuCredentials {
  return {
    processName: 'LeagueClientUx',
    pid: 4321,
    port: puerto,
    password: 'claveWs',
    protocol: 'wss',
    tokenBase64: construirTokenBase64('claveWs'),
  };
}

function crearCliente(opciones: ConstructorParameters<typeof LcuWebSocket>[0] = {}): LcuWebSocket {
  const cliente = new LcuWebSocket({ protocolo: 'ws', intervaloReconexionMs: 40, ...opciones });
  clientesCreados.push(cliente);
  return cliente;
}

/** Espera a que se emita un evento concreto del cliente. */
function esperarEvento<T>(cliente: LcuWebSocket, nombre: string, timeoutMs = 3000): Promise<T> {
  return new Promise<T>((resolver, rechazar) => {
    const temporizador = setTimeout(
      () => rechazar(new Error(`Tiempo de espera agotado esperando el evento "${nombre}".`)),
      timeoutMs
    );
    cliente.once(nombre, (datos: T) => {
      clearTimeout(temporizador);
      resolver(datos);
    });
  });
}

/** Espera hasta que una condición se cumpla (con sondeo corto). */
async function esperarHasta(condicion: () => boolean, timeoutMs = 3000): Promise<void> {
  const inicio = Date.now();
  while (!condicion()) {
    if (Date.now() - inicio > timeoutMs) {
      throw new Error('Tiempo de espera agotado esperando una condición.');
    }
    await new Promise((resolver) => setTimeout(resolver, 10));
  }
}

/** Conecta un cliente y espera el handshake completo. */
async function conectarCliente(cliente: LcuWebSocket): Promise<void> {
  const espera = esperarEvento(cliente, 'conectado');
  cliente.conectar(crearCredenciales());
  await espera;
}

/** Envía un frame crudo desde el servidor simulado al primer socket conectado. */
function enviarFrame(frame: string): void {
  socketsServidor[0].send(frame);
}

beforeEach(async () => {
  servidorHttp = createServer();
  servidorWs = new WebSocketServer({ server: servidorHttp });
  socketsServidor = [];
  mensajesRecibidos = [];
  autorizacionRecibida = undefined;
  clientesCreados = [];

  servidorWs.on('connection', (socket, solicitud) => {
    socketsServidor.push(socket);
    autorizacionRecibida = solicitud.headers.authorization;
    socket.on('message', (datos) => mensajesRecibidos.push(datos.toString()));
  });

  await new Promise<void>((resolver) => servidorHttp.listen(0, '127.0.0.1', resolver));
  puerto = (servidorHttp.address() as AddressInfo).port;
});

afterEach(async () => {
  for (const cliente of clientesCreados) {
    cliente.desconectar();
  }
  for (const socket of socketsServidor) {
    socket.terminate();
  }
  await new Promise<void>((resolver) => servidorWs.close(() => resolver()));
  servidorHttp.closeAllConnections?.();
  await new Promise<void>((resolver) => servidorHttp.close(() => resolver()));
});

describe('LcuWebSocket (T-2.4)', () => {
  it('debe conectarse con Basic Auth y suscribirse al evento global OnJsonApiEvent', async () => {
    const cliente = crearCliente();

    await conectarCliente(cliente);

    expect(cliente.estaConectado()).toBe(true);
    await esperarHasta(() => mensajesRecibidos.length > 0);
    expect(JSON.parse(mensajesRecibidos[0])).toEqual([...MENSAJE_SUSCRIPCION_LCU]);
    expect(JSON.parse(mensajesRecibidos[0])).toEqual([5, 'OnJsonApiEvent']);
    expect(autorizacionRecibida).toBe(construirTokenBase64('claveWs'));
  });

  it('debe emitir los eventos OnJsonApiEvent recibidos como EventoLcu', async () => {
    const cliente = crearCliente();
    await conectarCliente(cliente);

    const espera = esperarEvento<EventoLcu>(cliente, 'evento');
    const carga = { uri: '/lol-gameflow/v1/gameflow-phase', eventType: 'Update', data: 'Lobby' };
    enviarFrame(JSON.stringify([8, 'OnJsonApiEvent', carga]));

    const evento = await espera;
    expect(evento.uri).toBe('/lol-gameflow/v1/gameflow-phase');
    expect(evento.eventType).toBe('Update');
    expect(evento.data).toBe('Lobby');
  });

  it('debe ignorar frames que no son eventos válidos de la LCU', async () => {
    const cliente = crearCliente();
    await conectarCliente(cliente);

    const eventosRecibidos: EventoLcu[] = [];
    cliente.on('evento', (evento: EventoLcu) => eventosRecibidos.push(evento));

    enviarFrame('esto no es json');
    enviarFrame(JSON.stringify([2, 'OnJsonApiEvent', {}]));
    enviarFrame(JSON.stringify([8, 'OtroEvento', { uri: '/x', eventType: 'Update', data: 1 }]));
    enviarFrame(JSON.stringify([8, 'OnJsonApiEvent', { eventType: 'Update', data: 1 }]));
    enviarFrame(JSON.stringify('solo texto'));

    await new Promise((resolver) => setTimeout(resolver, 150));
    expect(eventosRecibidos).toHaveLength(0);
  });

  it('debe reconectarse automáticamente tras una caída de la conexión', async () => {
    const cliente = crearCliente({ intervaloReconexionMs: 40 });
    await conectarCliente(cliente);
    expect(socketsServidor).toHaveLength(1);
    // Se espera a que la suscripción inicial llegue al servidor antes de simular la caída.
    await esperarHasta(() => mensajesRecibidos.length === 1);

    const esperaDesconexion = esperarEvento<DetalleDesconexion>(cliente, 'desconectado');
    const esperaReconexion = esperarEvento<DetalleReconexion>(cliente, 'reconectando');
    const esperaReconectado = esperarEvento(cliente, 'conectado');

    socketsServidor[0].terminate();

    const desconexion = await esperaDesconexion;
    expect(desconexion.manual).toBe(false);
    const reintento = await esperaReconexion;
    expect(reintento.intento).toBeGreaterThanOrEqual(1);
    expect(reintento.esperaMs).toBe(40);

    await esperaReconectado;
    expect(cliente.estaConectado()).toBe(true);
    await esperarHasta(() => socketsServidor.length === 2);

    // Tras reconectar, la suscripción debe reenviarse.
    await esperarHasta(() => mensajesRecibidos.length >= 2);
    expect(JSON.parse(mensajesRecibidos[1])).toEqual([5, 'OnJsonApiEvent']);
  });

  it('no debe reconectar si reconectarAutomaticamente es false', async () => {
    const cliente = crearCliente({ reconectarAutomaticamente: false });
    await conectarCliente(cliente);

    const esperaDesconexion = esperarEvento<DetalleDesconexion>(cliente, 'desconectado');
    socketsServidor[0].terminate();
    await esperaDesconexion;

    await new Promise((resolver) => setTimeout(resolver, 150));
    expect(socketsServidor).toHaveLength(1);
    expect(cliente.estaConectado()).toBe(false);
  });

  it('no debe reconectar tras una desconexión manual y debe marcar el detalle como manual', async () => {
    const cliente = crearCliente();
    await conectarCliente(cliente);

    const esperaDesconexion = esperarEvento<DetalleDesconexion>(cliente, 'desconectado');
    cliente.desconectar();

    const detalle = await esperaDesconexion;
    expect(detalle.manual).toBe(true);
    expect(cliente.estaConectado()).toBe(false);

    await new Promise((resolver) => setTimeout(resolver, 150));
    expect(socketsServidor).toHaveLength(1);
  });

  it('debe permitir enviar mensajes solo cuando hay conexión abierta', async () => {
    const cliente = crearCliente();

    expect(cliente.enviar({ tipo: 'prueba' })).toBe(false);

    await conectarCliente(cliente);
    expect(cliente.enviar({ tipo: 'prueba' })).toBe(true);

    await esperarHasta(() => mensajesRecibidos.some((mensaje) => mensaje.includes('"tipo":"prueba"')));
  });

  it('debe ignorar el cierre del socket anterior cuando se llama a conectar() de nuevo', async () => {
    const cliente = crearCliente();
    await conectarCliente(cliente);
    expect(socketsServidor).toHaveLength(1);

    const esperaReconectado = esperarEvento(cliente, 'conectado');
    cliente.conectar(crearCredenciales());
    await esperaReconectado;

    await esperarHasta(() => socketsServidor.length === 2);
    expect(cliente.estaConectado()).toBe(true);
  });
});
