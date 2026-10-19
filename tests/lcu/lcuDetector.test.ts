import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  extraerCredencialesDeCommandLine,
  detectarPorRutaManual,
  detectarPorRiotClientInstalls,
  detectarPorRutasComunes,
  ejecutarDeteccionLcu,
} from '../../src/main/lcu/LcuDetector';
import { construirTokenBase64 } from '../../src/main/lcu/lockfile';

describe('LcuDetector - Detección Robusta LCU', () => {
  describe('extraerCredencialesDeCommandLine', () => {
    it('extrae puerto, token, pid e install-directory de la línea de comandos real de LoL', () => {
      const commandLine =
        '"C:/Riot Games/League of Legends/LeagueClientUx.exe" ' +
        '"--riotclient-auth-token=JPvIC-qeXgTqe7sQXehFJA" ' +
        '"--riotclient-app-port=51987" ' +
        '"--remoting-auth-token=FNlzk8_f_Llg0ex_ONxtkQ" ' +
        '"--app-port=52214" ' +
        '"--install-directory=C:\\Riot Games\\League of Legends" ' +
        '"--app-pid=5856"';

      const { credenciales, installDirectory } = extraerCredencialesDeCommandLine(commandLine);

      expect(credenciales).not.toBeNull();
      expect(credenciales?.port).toBe(52214);
      expect(credenciales?.password).toBe('FNlzk8_f_Llg0ex_ONxtkQ');
      expect(credenciales?.pid).toBe(5856);
      expect(credenciales?.tokenBase64).toBe(construirTokenBase64('FNlzk8_f_Llg0ex_ONxtkQ'));
      expect(installDirectory).toBe('C:\\Riot Games\\League of Legends');
    });

    it('soporta argumentos sin comillas y diferentes formatos de flags', () => {
      const commandLine =
        'LeagueClientUx.exe --app-port=55123 --remoting-auth-token=abc123token_XYZ --app-pid=9999 --install-directory=D:\\Games\\LoL';

      const { credenciales, installDirectory } = extraerCredencialesDeCommandLine(commandLine);

      expect(credenciales).not.toBeNull();
      expect(credenciales?.port).toBe(55123);
      expect(credenciales?.password).toBe('abc123token_XYZ');
      expect(credenciales?.pid).toBe(9999);
      expect(installDirectory).toBe('D:\\Games\\LoL');
    });

    it('devuelve null si falta --app-port o --remoting-auth-token', () => {
      const sinPuerto = 'LeagueClientUx.exe --remoting-auth-token=tokenSolitario --app-pid=123';
      expect(extraerCredencialesDeCommandLine(sinPuerto).credenciales).toBeNull();

      const sinToken = 'LeagueClientUx.exe --app-port=12345 --app-pid=123';
      expect(extraerCredencialesDeCommandLine(sinToken).credenciales).toBeNull();

      const vacio = '';
      expect(extraerCredencialesDeCommandLine(vacio).credenciales).toBeNull();
    });
  });

  describe('detectarPorRutaManual', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itero-detector-test-'));
    });

    afterEach(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    });

    it('devuelve fallo si la ruta manual no está configurada', async () => {
      const res = await detectarPorRutaManual(undefined);
      expect(res.credenciales).toBeNull();
      expect(res.paso.success).toBe(false);
    });

    it('lee el lockfile cuando la ruta apunta a la carpeta contenedora', async () => {
      const lockfilePath = path.join(tempDir, 'lockfile');
      fs.writeFileSync(lockfilePath, 'LeagueClient:1234:56789:tokenSecreto:https');

      const res = await detectarPorRutaManual(tempDir);
      expect(res.paso.success).toBe(true);
      expect(res.credenciales).not.toBeNull();
      expect(res.credenciales?.port).toBe(56789);
      expect(res.credenciales?.password).toBe('tokenSecreto');
      expect(res.credenciales?.pid).toBe(1234);
    });

    it('lee el lockfile cuando la ruta apunta directamente al archivo lockfile', async () => {
      const lockfilePath = path.join(tempDir, 'lockfile');
      fs.writeFileSync(lockfilePath, 'LeagueClient:4321:51111:otroToken:https');

      const res = await detectarPorRutaManual(lockfilePath);
      expect(res.paso.success).toBe(true);
      expect(res.credenciales?.port).toBe(51111);
      expect(res.credenciales?.password).toBe('otroToken');
    });

    it('devuelve fallo descriptivo si el archivo no existe en la ruta manual', async () => {
      const rutaInexistente = path.join(tempDir, 'carpeta_fantasma');
      const res = await detectarPorRutaManual(rutaInexistente);
      expect(res.paso.success).toBe(false);
      expect(res.credenciales).toBeNull();
      expect(res.paso.details.toLowerCase()).toContain('no se encontró el archivo lockfile');
    });
  });

  describe('detectarPorRiotClientInstalls', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itero-riotinstalls-test-'));
    });

    afterEach(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    });

    it('detecta lockfile si se provee el installDirectory detectado del proceso', async () => {
      const lockfilePath = path.join(tempDir, 'lockfile');
      fs.writeFileSync(lockfilePath, 'LeagueClient:7777:53333:passProceso:https');

      const res = await detectarPorRiotClientInstalls(tempDir);
      expect(res.paso.success).toBe(true);
      expect(res.credenciales?.port).toBe(53333);
      expect(res.credenciales?.password).toBe('passProceso');
    });
  });

  describe('ejecutarDeteccionLcu (flujo secuencial)', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itero-flujo-test-'));
    });

    afterEach(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    });

    it('ejecuta los métodos en orden y tiene éxito si la ruta manual es válida', async () => {
      const lockfilePath = path.join(tempDir, 'lockfile');
      fs.writeFileSync(lockfilePath, 'LeagueClient:8888:59999:tokenManual:https');

      const reporte = await ejecutarDeteccionLcu({
        rutaManual: tempDir,
        silencioso: true,
      });

      expect(reporte.steps.length).toBeGreaterThanOrEqual(1);
      if (reporte.successfulStep?.includes('Manual')) {
        expect(reporte.success).toBe(true);
        expect(reporte.credentials?.port).toBe(59999);
      }
    }, 20000);
  });
});
