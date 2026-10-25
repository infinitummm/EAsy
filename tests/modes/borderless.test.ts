/**
 * Pruebas unitarias del detector de modo sin bordes (T-8.4).
 *
 * Se usan directorios temporales reales para verificar la resolución de
 * `Config/game.cfg` y se prueba el parser INI por separado con BOM, CRLF,
 * comentarios y secciones. No se depende de una instalación real de
 * League of Legends.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  BorderlessDetector,
  ErrorConfiguracionLol,
  RUTA_INSTALACION_LOL_POR_DEFECTO,
  extraerWindowMode,
  resolverRutaGameCfg,
} from '../../src/main/modes/BorderlessDetector';

let directorioTemporal = '';

beforeEach(async () => {
  directorioTemporal = await mkdtemp(path.join(os.tmpdir(), 'itero-borderless-'));
});

afterEach(async () => {
  await rm(directorioTemporal, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

async function crearGameCfg(contenido: string, subcarpeta = 'Config'): Promise<string> {
  const carpeta = path.join(directorioTemporal, subcarpeta);
  await mkdir(carpeta, { recursive: true });
  const archivo = path.join(carpeta, 'game.cfg');
  await writeFile(archivo, contenido, 'utf8');
  return archivo;
}

// ==========================================
// Parser INI
// ==========================================

describe('extraerWindowMode', () => {
  it('lee WindowMode de la sección General', () => {
    expect(extraerWindowMode('[General]\nWindowMode=1\n')).toBe(1);
    expect(extraerWindowMode('[General]\r\nWindowMode = 0\r\n')).toBe(0);
  });

  it('tolera BOM, mayúsculas, espacios y comentarios', () => {
    expect(
      extraerWindowMode('\uFEFF[general]\r\n  windowmode = 2 ; ventana\r\n')
    ).toBe(2);
    expect(
      extraerWindowMode('[General]\n; WindowMode=9\n# WindowMode=8\nWindowMode=1')
    ).toBe(1);
  });

  it('ignora WindowMode de otras secciones', () => {
    expect(
      extraerWindowMode('[Graphics]\nWindowMode=0\n[General]\nWindowMode=1\n')
    ).toBe(1);
    expect(
      extraerWindowMode('[General]\nWindowMode=1\n[Graphics]\nWindowMode=0\n')
    ).toBe(1);
  });

  it('devuelve null si falta la sección, la clave o el valor es inválido', () => {
    expect(extraerWindowMode('[Graphics]\nWindowMode=0\n')).toBeNull();
    expect(extraerWindowMode('[General]\nFullscreen=0\n')).toBeNull();
    expect(extraerWindowMode('[General]\nWindowMode=sin-numero\n')).toBeNull();
    expect(extraerWindowMode('')).toBeNull();
  });

  it('admite el valor desconocido -1 sin tratarlo como borde sin bordes', () => {
    expect(extraerWindowMode('[General]\nWindowMode=-1\n')).toBe(-1);
  });
});

// ==========================================
// Resolución de rutas
// ==========================================

describe('resolverRutaGameCfg', () => {
  it('añade Config/game.cfg a una ruta de instalación', () => {
    const resultado = resolverRutaGameCfg('D:\\Juegos\\League of Legends');
    expect(resultado).toBe(
      path.resolve(path.join('D:\\Juegos\\League of Legends', 'Config', 'game.cfg'))
    );
  });

  it('acepta la carpeta Config o el propio archivo game.cfg', () => {
    const instalacion = path.join(directorioTemporal, 'League of Legends');
    expect(resolverRutaGameCfg(path.join(instalacion, 'Config'))).toBe(
      path.join(instalacion, 'Config', 'game.cfg')
    );
    expect(resolverRutaGameCfg(path.join(instalacion, 'Config', 'game.cfg'))).toBe(
      path.join(instalacion, 'Config', 'game.cfg')
    );
    expect(resolverRutaGameCfg(path.join(instalacion, 'Config', 'GAME.CFG'))).toBe(
      path.join(instalacion, 'Config', 'GAME.CFG')
    );
  });

  it('usa LEAGUE_INSTALL_PATH cuando no se pasa ruta', () => {
    const instalacion = path.join(directorioTemporal, 'Liga');
    vi.stubEnv('LEAGUE_INSTALL_PATH', instalacion);
    expect(resolverRutaGameCfg()).toBe(
      path.join(instalacion, 'Config', 'game.cfg')
    );
  });

  it('cae a la ruta estándar de Riot si no hay ninguna configurada', () => {
    vi.stubEnv('LEAGUE_INSTALL_PATH', '');
    expect(resolverRutaGameCfg()).toBe(
      path.resolve(
        path.join(RUTA_INSTALACION_LOL_POR_DEFECTO, 'Config', 'game.cfg')
      )
    );
  });
});

// ==========================================
// Detector
// ==========================================

describe('BorderlessDetector', () => {
  it('valida el modo sin bordes (WindowMode=1)', async () => {
    const archivo = await crearGameCfg('[General]\r\nWindowMode=1\r\n');
    const detector = new BorderlessDetector({ registrar: () => {} });

    await expect(detector.checkBorderless(directorioTemporal)).resolves.toEqual({
      isBorderless: true,
      windowMode: 1,
      configPath: archivo,
    });
  });

  it('alerta de pantalla completa (WindowMode=0) y ventana (WindowMode=2)', async () => {
    await crearGameCfg('[General]\nWindowMode=0\n');
    const detector = new BorderlessDetector({ registrar: () => {} });

    await expect(detector.checkBorderless(directorioTemporal)).resolves.toEqual({
      isBorderless: false,
      windowMode: 0,
      configPath: path.join(directorioTemporal, 'Config', 'game.cfg'),
    });

    await crearGameCfg('[General]\nWindowMode=2\n');
    await expect(detector.checkBorderless(directorioTemporal)).resolves.toEqual({
      isBorderless: false,
      windowMode: 2,
      configPath: path.join(directorioTemporal, 'Config', 'game.cfg'),
    });
  });

  it('acepta la carpeta Config o el archivo directamente', async () => {
    const archivo = await crearGameCfg('[General]\nWindowMode=1\n');
    const detector = new BorderlessDetector({ registrar: () => {} });

    await expect(
      detector.checkBorderless(path.join(directorioTemporal, 'Config'))
    ).resolves.toMatchObject({ isBorderless: true, configPath: archivo });
    await expect(detector.checkBorderless(archivo)).resolves.toMatchObject({
      isBorderless: true,
      configPath: archivo,
    });
  });

  it('usa la ruta por defecto del constructor si no se pasa argumento', async () => {
    const archivo = await crearGameCfg('[General]\nWindowMode=1\n');
    const detector = new BorderlessDetector({
      rutaInstalacionPorDefecto: directorioTemporal,
      registrar: () => {},
    });

    await expect(detector.checkBorderless()).resolves.toEqual({
      isBorderless: true,
      windowMode: 1,
      configPath: archivo,
    });
  });

  it('prioriza la ruta explícita sobre la ruta por defecto', async () => {
    await crearGameCfg('[General]\nWindowMode=0\n');
    const otra = path.join(directorioTemporal, 'Otra');
    const carpetaOtra = path.join(otra, 'Config');
    await mkdir(carpetaOtra, { recursive: true });
    const archivoOtra = path.join(carpetaOtra, 'game.cfg');
    await writeFile(archivoOtra, '[General]\nWindowMode=1\n', 'utf8');

    const detector = new BorderlessDetector({
      rutaInstalacionPorDefecto: directorioTemporal,
      registrar: () => {},
    });

    await expect(detector.checkBorderless(otra)).resolves.toMatchObject({
      isBorderless: true,
      configPath: archivoOtra,
    });
  });

  it('devuelve -1 y avisa si el archivo existe pero no tiene WindowMode', async () => {
    await crearGameCfg('[General]\nFullscreen=0\n');
    const registrar = vi.fn();
    const detector = new BorderlessDetector({ registrar });

    await expect(detector.checkBorderless(directorioTemporal)).resolves.toEqual({
      isBorderless: false,
      windowMode: -1,
      configPath: path.join(directorioTemporal, 'Config', 'game.cfg'),
    });
    expect(registrar).toHaveBeenCalledWith(
      expect.stringContaining('No se encontró [General] WindowMode')
    );
  });

  it('lanza un error claro si no existe la configuración', async () => {
    const ruta = path.join(directorioTemporal, 'NoExiste');
    const detector = new BorderlessDetector({ registrar: () => {} });

    await expect(detector.checkBorderless(ruta)).rejects.toMatchObject({
      name: 'ErrorConfiguracionLol',
      rutaConfig: path.join(ruta, 'Config', 'game.cfg'),
    });
    await expect(detector.checkBorderless(ruta)).rejects.toBeInstanceOf(
      ErrorConfiguracionLol
    );
  });

  it('propaga el error del lector inyectado como ErrorConfiguracionLol', async () => {
    const detector = new BorderlessDetector({
      leerArchivo: async () => {
        throw new Error('permiso denegado');
      },
      registrar: () => {},
    });

    await expect(detector.checkBorderless(directorioTemporal)).rejects.toMatchObject({
      name: 'ErrorConfiguracionLol',
      message: expect.stringContaining('No se pudo leer la configuración'),
    });
  });
});
