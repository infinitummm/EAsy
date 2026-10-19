/**
 * Pruebas unitarias del cliente HTTPS local de la LCU API (T-2.3).
 * Se utiliza un servidor HTTPS real con certificado autofirmado para verificar
 * la autenticación Basic Auth y la omisión de validación TLS exigida por Riot.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { construirTokenBase64 } from '../../src/main/lcu/lockfile';
import {
  ErrorLcuNoConfigurado,
  ErrorPeticionLcu,
  ErrorRespuestaInvalida,
  LcuHttpClient,
} from '../../src/main/lcu/LcuHttpClient';
import type { LcuCredentials } from '../../src/shared/types';

interface PeticionRegistrada {
  metodo: string;
  ruta: string;
  cabeceras: IncomingHttpHeaders;
  cuerpo: string;
}

let servidor: Server;
let puerto: number;
const peticiones: PeticionRegistrada[] = [];
const respuestasPendientes: ServerResponse[] = [];

function responderJson(res: ServerResponse, estado: number, datos: unknown): void {
  res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(datos));
}

function manejarSolicitud(req: IncomingMessage, res: ServerResponse): void {
  const ruta = req.url ?? '';
  const fragmentos: Buffer[] = [];

  req.on('data', (fragmento: Buffer) => fragmentos.push(fragmento));
  req.on('end', () => {
    peticiones.push({
      metodo: req.method ?? '',
      ruta,
      cabeceras: req.headers,
      cuerpo: Buffer.concat(fragmentos).toString('utf-8'),
    });

    switch (ruta) {
      case '/lol-gameflow/v1/gameflow-phase':
        responderJson(res, 200, 'Lobby');
        break;
      case '/lol-summoner/v1/current-summoner':
        responderJson(res, 200, { displayName: 'InvocadorPrueba', summonerLevel: 42 });
        break;
      case '/eco':
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(Buffer.concat(fragmentos).toString('utf-8'));
        break;
      case '/lol-matchmaking/v1/ready-check/accept':
        res.writeHead(204);
        res.end();
        break;
      case '/ruta-inexistente':
        responderJson(res, 404, { message: 'Not Found' });
        break;
      case '/error-interno':
        responderJson(res, 500, { message: 'Fallo interno simulado' });
        break;
      case '/json-invalido':
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{esto no es json');
        break;
      case '/texto-plano':
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
        break;
      case '/sin-cabecera-json':
        res.writeHead(200);
        res.end(JSON.stringify({ exito: true }));
        break;
      case '/nunca-responde':
        respuestasPendientes.push(res);
        break;
      default:
        responderJson(res, 404, { message: `Ruta desconocida: ${ruta}` });
    }
  });
}

function crearCliente(opciones: ConstructorParameters<typeof LcuHttpClient>[1] = {}): LcuHttpClient {
  const credenciales: LcuCredentials = {
    processName: 'LeagueClientUx',
    pid: 1234,
    port: puerto,
    password: 'clavePrueba',
    protocol: 'https',
    tokenBase64: construirTokenBase64('clavePrueba'),
  };
  return new LcuHttpClient(credenciales, opciones);
}

beforeAll(async () => {
  const [clave, certificado] = await Promise.all([
    readFile(new URL('../mocks/tls/servidor-pruebas-key.pem', import.meta.url), 'utf-8'),
    readFile(new URL('../mocks/tls/servidor-pruebas-cert.pem', import.meta.url), 'utf-8'),
  ]);

  servidor = createServer({ key: clave, cert: certificado }, manejarSolicitud);
  await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  puerto = (servidor.address() as AddressInfo).port;
});

afterAll(async () => {
  for (const respuesta of respuestasPendientes) {
    respuesta.destroy();
  }
  servidor.closeAllConnections?.();
  await new Promise<void>((resolver) => servidor.close(() => resolver()));
});

describe('LcuHttpClient (T-2.3)', () => {
  it('debe realizar un GET autenticado contra 127.0.0.1 aceptando el certificado autofirmado', async () => {
    const cliente = crearCliente();

    const fase = await cliente.request<string>('GET', '/lol-gameflow/v1/gameflow-phase');

    expect(fase).toBe('Lobby');

    const peticion = peticiones.find((p) => p.ruta === '/lol-gameflow/v1/gameflow-phase');
    expect(peticion).toBeDefined();
    expect(peticion?.metodo).toBe('GET');
    expect(peticion?.cabeceras.authorization).toBe('Basic cmlvdDpjbGF2ZVBydWViYQ==');
  });

  it('debe enviar el cuerpo JSON y las cabeceras correctas en peticiones POST', async () => {
    const cliente = crearCliente();
    const cuerpo = { campeon: 64, rol: 'JUNGLE' };

    const eco = await cliente.request<typeof cuerpo>('POST', '/eco', cuerpo);

    expect(eco).toEqual(cuerpo);
    const peticion = peticiones.filter((p) => p.ruta === '/eco').at(-1);
    expect(peticion?.metodo).toBe('POST');
    expect(peticion?.cabeceras['content-type']).toBe('application/json');
    expect(peticion?.cuerpo).toBe(JSON.stringify(cuerpo));
  });

  it('debe resolver undefined en respuestas sin contenido (204)', async () => {
    const cliente = crearCliente();

    const resultado = await cliente.request<void>('POST', '/lol-matchmaking/v1/ready-check/accept');

    expect(resultado).toBeUndefined();
    expect(peticiones.filter((p) => p.ruta === '/lol-matchmaking/v1/ready-check/accept').at(-1)?.metodo).toBe('POST');
  });

  it('debe lanzar ErrorPeticionLcu con el código de estado ante respuestas 4xx y 5xx', async () => {
    const cliente = crearCliente();

    await expect(cliente.request('GET', '/ruta-inexistente')).rejects.toMatchObject({
      name: 'ErrorPeticionLcu',
      codigoEstado: 404,
      endpoint: '/ruta-inexistente',
    });

    const error = await cliente.request('GET', '/error-interno').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorPeticionLcu);
    expect((error as ErrorPeticionLcu).codigoEstado).toBe(500);
    expect((error as ErrorPeticionLcu).cuerpo).toContain('Fallo interno simulado');
  });

  it('debe lanzar ErrorRespuestaInvalida cuando el cuerpo declarado como JSON no lo es', async () => {
    const cliente = crearCliente();

    await expect(cliente.request('GET', '/json-invalido')).rejects.toThrow(ErrorRespuestaInvalida);
  });

  it('debe devolver texto plano cuando la respuesta no es JSON', async () => {
    const cliente = crearCliente();

    const respuesta = await cliente.request<string>('GET', '/texto-plano');

    expect(respuesta).toBe('ok');
  });

  it('debe parsear JSON aunque falte la cabecera Content-Type', async () => {
    const cliente = crearCliente();

    const respuesta = await cliente.request<{ exito: boolean }>('GET', '/sin-cabecera-json');

    expect(respuesta).toEqual({ exito: true });
  });

  it('debe aceptar endpoints sin barra inicial', async () => {
    const cliente = crearCliente();

    const fase = await cliente.request<string>('GET', 'lol-gameflow/v1/gameflow-phase');

    expect(fase).toBe('Lobby');
  });

  it('debe fallar con ErrorLcuNoConfigurado si no hay credenciales', async () => {
    const cliente = new LcuHttpClient();

    expect(cliente.estaConfigurado()).toBe(false);
    expect(cliente.obtenerPuerto()).toBeNull();
    await expect(cliente.request('GET', '/lol-gameflow/v1/gameflow-phase')).rejects.toThrow(ErrorLcuNoConfigurado);
  });

  it('debe permitir actualizar puerto y credenciales en caliente', () => {
    const cliente = new LcuHttpClient();

    cliente.actualizarCredenciales({
      processName: 'LeagueClientUx',
      pid: 1,
      port: puerto,
      password: 'nuevaClave',
      protocol: 'https',
      tokenBase64: construirTokenBase64('nuevaClave'),
    });

    expect(cliente.estaConfigurado()).toBe(true);
    expect(cliente.obtenerPuerto()).toBe(puerto);
    expect(cliente.obtenerCredenciales()?.password).toBe('nuevaClave');
  });

  it('debe rechazar la petición por timeout si el servidor no responde', async () => {
    const cliente = crearCliente({ timeoutMs: 200 });

    await expect(cliente.request('GET', '/nunca-responde')).rejects.toThrow(/Tiempo de espera agotado/);
  });

  it('debe exigir un certificado válido cuando rejectUnauthorized es true', async () => {
    const cliente = crearCliente({ rejectUnauthorized: true });

    await expect(cliente.request('GET', '/lol-gameflow/v1/gameflow-phase')).rejects.toThrow();
    // El error debe ser TLS (no una respuesta HTTP de la LCU).
    const error = await cliente.request('GET', '/lol-gameflow/v1/gameflow-phase').catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(ErrorPeticionLcu);
  });
});
