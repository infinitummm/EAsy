/**
 * Pruebas unitarias de la detección y lectura del lockfile de League of Legends (T-2.2).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ErrorLockfile,
  NOMBRE_PROCESO_LCU,
  PROTOCOLO_LCU_POR_DEFECTO,
  buscarLockfile,
  construirTokenBase64,
  extraerCredencialesDeArgumentos,
  leerLockfile,
  parsearLockfile,
} from '../../src/main/lcu/lockfile';

const CONTENIDO_LOCKFILE_VALIDO = 'LeagueClientUx:8724:54321:aBcD-1234_secreto:https';

describe('parsearLockfile (T-2.2)', () => {
  it('debe extraer proceso, PID, puerto, contraseña y protocolo de un lockfile válido', () => {
    const credenciales = parsearLockfile(CONTENIDO_LOCKFILE_VALIDO);

    expect(credenciales.processName).toBe('LeagueClientUx');
    expect(credenciales.pid).toBe(8724);
    expect(credenciales.port).toBe(54321);
    expect(credenciales.password).toBe('aBcD-1234_secreto');
    expect(credenciales.protocol).toBe('https');
  });

  it('debe construir el token Basic Auth con el formato exacto esperado por la LCU API', () => {
    const credenciales = parsearLockfile('LeagueClientUx:1:1234:clave:https');

    expect(credenciales.tokenBase64).toBe('Basic cmlvdDpjbGF2ZQ==');
    // Verificación inversa: el token debe decodificar a "riot:<password>".
    const decodificado = Buffer.from(credenciales.tokenBase64.replace('Basic ', ''), 'base64').toString('utf-8');
    expect(decodificado).toBe('riot:clave');
  });

  it('debe tolerar espacios y saltos de línea sobrantes', () => {
    const credenciales = parsearLockfile(`  ${CONTENIDO_LOCKFILE_VALIDO}\n`);

    expect(credenciales.port).toBe(54321);
    expect(credenciales.password).toBe('aBcD-1234_secreto');
  });

  it('debe lanzar ErrorLockfile cuando el número de segmentos es incorrecto', () => {
    expect(() => parsearLockfile('LeagueClientUx:8724:54321:https')).toThrow(ErrorLockfile);
    expect(() => parsearLockfile('LeagueClientUx:8724:54321:clave:https:extra')).toThrow(ErrorLockfile);
    expect(() => parsearLockfile('')).toThrow(ErrorLockfile);
  });

  it('debe lanzar ErrorLockfile cuando el PID no es numérico', () => {
    expect(() => parsearLockfile('LeagueClientUx:abc:54321:clave:https')).toThrow(ErrorLockfile);
    expect(() => parsearLockfile('LeagueClientUx:-5:54321:clave:https')).toThrow(ErrorLockfile);
    expect(() => parsearLockfile('LeagueClientUx:0:54321:clave:https')).toThrow(ErrorLockfile);
  });

  it('debe lanzar ErrorLockfile cuando el puerto no es válido', () => {
    expect(() => parsearLockfile('LeagueClientUx:8724:cero:clave:https')).toThrow(ErrorLockfile);
    expect(() => parsearLockfile('LeagueClientUx:8724:0:clave:https')).toThrow(ErrorLockfile);
    expect(() => parsearLockfile('LeagueClientUx:8724:70000:clave:https')).toThrow(ErrorLockfile);
  });

  it('debe lanzar ErrorLockfile cuando faltan la contraseña o el protocolo', () => {
    expect(() => parsearLockfile('LeagueClientUx:8724:54321::https')).toThrow(ErrorLockfile);
    expect(() => parsearLockfile('LeagueClientUx:8724:54321:clave:')).toThrow(ErrorLockfile);
  });
});

describe('leerLockfile (T-2.2)', () => {
  let directorioTemporal: string;

  beforeAll(async () => {
    directorioTemporal = await mkdtemp(join(tmpdir(), 'itero-lockfile-'));
  });

  afterAll(async () => {
    await rm(directorioTemporal, { recursive: true, force: true });
  });

  it('debe leer y parsear un lockfile real desde disco', async () => {
    const ruta = join(directorioTemporal, 'lockfile-valido');
    await writeFile(ruta, CONTENIDO_LOCKFILE_VALIDO, 'utf-8');

    const credenciales = await leerLockfile(ruta);

    expect(credenciales.processName).toBe('LeagueClientUx');
    expect(credenciales.pid).toBe(8724);
    expect(credenciales.port).toBe(54321);
    expect(credenciales.tokenBase64).toBe(construirTokenBase64('aBcD-1234_secreto'));
  });

  it('debe lanzar ErrorLockfile cuando el archivo no existe', async () => {
    await expect(leerLockfile(join(directorioTemporal, 'lockfile-inexistente'))).rejects.toThrow(ErrorLockfile);
  });

  it('debe lanzar ErrorLockfile cuando el archivo tiene contenido inválido', async () => {
    const ruta = join(directorioTemporal, 'lockfile-invalido');
    await writeFile(ruta, 'esto:no:es:un:lockfile:de:league', 'utf-8');

    await expect(leerLockfile(ruta)).rejects.toThrow(ErrorLockfile);
  });
});

describe('extraerCredencialesDeArgumentos (T-2.2)', () => {
  it('debe extraer las credenciales desde los argumentos típicos de LeagueClientUx.exe', () => {
    const argumentos = [
      '"C:\\Riot Games\\League of Legends\\LeagueClientUx.exe"',
      '"--riotclient-auth-token=tokenSecundario"',
      '"--remoting-auth-token=xyZ-123_secreto"',
      '"--riotclient-app-port=53122"',
      '"--app-port=53123"',
      '"--app-pid=9988"',
      '"--locale=es_ES"',
    ];

    const credenciales = extraerCredencialesDeArgumentos(argumentos);

    expect(credenciales).not.toBeNull();
    expect(credenciales?.processName).toBe(NOMBRE_PROCESO_LCU);
    expect(credenciales?.pid).toBe(9988);
    expect(credenciales?.port).toBe(53123);
    expect(credenciales?.password).toBe('xyZ-123_secreto');
    expect(credenciales?.protocol).toBe(PROTOCOLO_LCU_POR_DEFECTO);
    expect(credenciales?.tokenBase64).toBe(construirTokenBase64('xyZ-123_secreto'));
  });

  it('debe funcionar con argumentos sin comillas', () => {
    const credenciales = extraerCredencialesDeArgumentos([
      '--app-port=12345',
      '--remoting-auth-token=clavePlana',
    ]);

    expect(credenciales?.port).toBe(12345);
    expect(credenciales?.password).toBe('clavePlana');
  });

  it('debe usar PID 0 cuando el argumento --app-pid no está presente', () => {
    const credenciales = extraerCredencialesDeArgumentos(['--app-port=12345', '--remoting-auth-token=clavePlana']);

    expect(credenciales?.pid).toBe(0);
  });

  it('debe devolver null cuando falta el puerto o el token de autenticación', () => {
    expect(extraerCredencialesDeArgumentos(['--remoting-auth-token=clave'])).toBeNull();
    expect(extraerCredencialesDeArgumentos(['--app-port=12345'])).toBeNull();
    expect(extraerCredencialesDeArgumentos([])).toBeNull();
  });

  it('debe devolver null cuando el puerto es inválido', () => {
    expect(
      extraerCredencialesDeArgumentos(['--app-port=abc', '--remoting-auth-token=clave'])
    ).toBeNull();
    expect(
      extraerCredencialesDeArgumentos(['--app-port=99999', '--remoting-auth-token=clave'])
    ).toBeNull();
  });
});

describe('buscarLockfile (T-2.2)', () => {
  let directorioTemporal: string;

  beforeAll(async () => {
    directorioTemporal = await mkdtemp(join(tmpdir(), 'itero-busqueda-'));
  });

  afterAll(async () => {
    await rm(directorioTemporal, { recursive: true, force: true });
  });

  it('debe devolver el primer lockfile válido encontrado entre las rutas candidatas', async () => {
    const rutaValida = join(directorioTemporal, 'lockfile');
    await writeFile(rutaValida, CONTENIDO_LOCKFILE_VALIDO, 'utf-8');

    const resultado = await buscarLockfile([
      join(directorioTemporal, 'no-existe'),
      join(directorioTemporal, 'tampoco-existe'),
      rutaValida,
    ]);

    expect(resultado).not.toBeNull();
    expect(resultado?.ruta).toBe(rutaValida);
    expect(resultado?.credenciales.port).toBe(54321);
  });

  it('debe ignorar rutas con lockfiles ilegibles o inválidos', async () => {
    const rutaInvalida = join(directorioTemporal, 'lockfile-invalido');
    await writeFile(rutaInvalida, 'contenido:invalido', 'utf-8');
    const rutaValida = join(directorioTemporal, 'lockfile');
    await writeFile(rutaValida, CONTENIDO_LOCKFILE_VALIDO, 'utf-8');

    const resultado = await buscarLockfile([rutaInvalida, rutaValida]);

    expect(resultado?.ruta).toBe(rutaValida);
  });

  it('debe devolver null cuando ninguna ruta candidata contiene un lockfile', async () => {
    const resultado = await buscarLockfile([
      join(directorioTemporal, 'ninguna'),
      join(directorioTemporal, 'existe-esto'),
    ]);

    expect(resultado).toBeNull();
  });
});
