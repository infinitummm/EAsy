/**
 * Módulo de detección robusta y diagnóstico del cliente LCU de League of Legends.
 *
 * Implementa 4 métodos de detección en orden estricto:
 *  a) Argumentos del proceso LeagueClientUx.exe vía PowerShell (Get-CimInstance).
 *  b) Lockfile en la ruta obtenida de C:\ProgramData\Riot Games\RiotClientInstalls.json (o del proceso).
 *  c) Rutas comunes en todas las unidades de disco (C:, D:, E:, ...).
 *  d) Ruta manual configurada por el usuario.
 *
 * Incluye registro en archivo de log y consola de cada método probado.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import type { LcuCredentials, LcuDetectionReport, LcuDetectionStepResult } from '../../shared/types';
import { construirTokenBase64, leerLockfile, parsearLockfile } from './lockfile';

const execFileAsync = promisify(execFile);

export interface OpcionesDeteccionLcu {
  rutaManual?: string;
  rutaArchivoLog?: string;
  silencioso?: boolean;
}

/** Devuelve la ruta por defecto del archivo de logs de detección LCU. */
export function obtenerRutaLogPorDefecto(): string {
  const appData = process.env.APPDATA || process.env.USERPROFILE || 'C:\\';
  const dir = path.join(appData, 'proyecto-itero');
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch {}
  return path.join(dir, 'lcu-detection.log');
}

/** Escribe un mensaje de log tanto en consola como en el archivo de texto. */
export function registrarLog(mensaje: string, rutaLog?: string, silencioso: boolean = false): void {
  const timestamp = new Date().toISOString();
  const linea = `[${timestamp}] [LCU-DETECTOR] ${mensaje}\n`;
  if (!silencioso) {
    console.log(`[LCU-DETECTOR] ${mensaje}`);
  }
  const archivo = rutaLog || obtenerRutaLogPorDefecto();
  try {
    const dir = path.dirname(archivo);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(archivo, linea, 'utf-8');
  } catch {}
}

/** Parsea los flags de la línea de comandos de LeagueClientUx.exe. */
export function extraerCredencialesDeCommandLine(commandLine: string): {
  credenciales: LcuCredentials | null;
  installDirectory?: string;
} {
  if (!commandLine || typeof commandLine !== 'string') {
    return { credenciales: null };
  }

  // Regex robustas que toleran comillas externas ("--flag=valor"), internas (--flag="valor") o sin comillas
  const portMatch = commandLine.match(/["']?--app-port=["']?(\d+)["']?/);
  const tokenMatch = commandLine.match(/["']?--remoting-auth-token=["']?([^\s"']+)["']?/);
  const pidMatch = commandLine.match(/["']?--app-pid=["']?(\d+)["']?/);
  const installDirMatch = commandLine.match(/["']?--install-directory=["']?([^"\r\n]+?)(?:["'](?=\s+|$)|(?=\s+--)|$)/);

  const installDirectory = installDirMatch ? installDirMatch[1].trim().replace(/^["']+|["']+$/g, '') : undefined;

  if (!portMatch || !tokenMatch) {
    return { credenciales: null, installDirectory };
  }

  const port = Number.parseInt(portMatch[1], 10);
  const pid = pidMatch ? Number.parseInt(pidMatch[1], 10) : 0;
  const password = tokenMatch[1].trim();

  const credenciales: LcuCredentials = {
    processName: 'LeagueClientUx',
    pid: Number.isInteger(pid) && pid > 0 ? pid : 0,
    port,
    password,
    protocol: 'https',
    tokenBase64: construirTokenBase64(password),
  };

  return { credenciales, installDirectory };
}

/**
 * Método A: Inspeccionar el proceso LeagueClientUx.exe con PowerShell (Get-CimInstance).
 * No utiliza wmic (incompatible con versiones recientes de Windows 11).
 */
export async function detectarPorProceso(rutaLog?: string): Promise<{
  paso: LcuDetectionStepResult;
  credenciales: LcuCredentials | null;
  installDirectory?: string;
  errorPermisos: boolean;
}> {
  const psScript = "(Get-CimInstance Win32_Process -Filter \"name='LeagueClientUx.exe'\").CommandLine";
  const encodedCommand = Buffer.from(psScript, 'utf16le').toString('base64');
  const comandoVisible = "Get-CimInstance Win32_Process -Filter \"name='LeagueClientUx.exe'\" | Select-Object -ExpandProperty CommandLine";

  registrarLog(`Probando Método A (Proceso)... Comando: ${comandoVisible}`, rutaLog);

  let stdout = '';
  let stderr = '';
  try {
    const res = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      encodedCommand,
    ], { timeout: 10000 });
    stdout = (res.stdout || '').trim();
    stderr = (res.stderr || '').trim();
  } catch (err: unknown) {
    const errDetalle = err instanceof Error ? err.message : String(err);
    registrarLog(`Método A falló al invocar PowerShell: ${errDetalle}`, rutaLog);
    return {
      paso: {
        step: 'process',
        name: 'Proceso LeagueClientUx.exe (PowerShell Get-CimInstance)',
        commandOrPath: comandoVisible,
        success: false,
        details: `Error al ejecutar PowerShell: ${errDetalle}`,
      },
      credenciales: null,
      errorPermisos: false,
    };
  }

  if (stdout) {
    const { credenciales, installDirectory } = extraerCredencialesDeCommandLine(stdout);
    if (credenciales) {
      registrarLog(`Método A exitoso. Puerto: ${credenciales.port}, PID: ${credenciales.pid}`, rutaLog);
      return {
        paso: {
          step: 'process',
          name: 'Proceso LeagueClientUx.exe (PowerShell Get-CimInstance)',
          commandOrPath: comandoVisible,
          success: true,
          details: `Proceso encontrado. Puerto LCU: ${credenciales.port}, PID: ${credenciales.pid}`,
        },
        credenciales,
        installDirectory,
        errorPermisos: false,
      };
    }
    registrarLog(`Método A: Proceso encontrado pero no se pudieron parsear los argumentos --app-port y --remoting-auth-token.`, rutaLog);
    return {
      paso: {
        step: 'process',
        name: 'Proceso LeagueClientUx.exe (PowerShell Get-CimInstance)',
        commandOrPath: comandoVisible,
        success: false,
        details: 'El proceso respondió pero no contiene los argumentos --app-port y --remoting-auth-token.',
      },
      credenciales: null,
      installDirectory,
      errorPermisos: false,
    };
  }

  // Si stdout está vacío, comprobar si el proceso existe pero CommandLine no se puede leer (permisos)
  let procesoExiste = false;
  try {
    const checkScript = "(Get-Process -Name 'LeagueClientUx' -ErrorAction SilentlyContinue).Id";
    const checkEncoded = Buffer.from(checkScript, 'utf16le').toString('base64');
    const checkRes = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      checkEncoded,
    ], { timeout: 4000 });
    if ((checkRes.stdout || '').trim().length > 0) {
      procesoExiste = true;
    }
  } catch {}

  if (procesoExiste) {
    registrarLog(`Método A: El proceso LeagueClientUx.exe está en ejecución pero CommandLine fue denegado. Posible falta de permisos.`, rutaLog);
    return {
      paso: {
        step: 'process',
        name: 'Proceso LeagueClientUx.exe (PowerShell Get-CimInstance)',
        commandOrPath: comandoVisible,
        success: false,
        details: 'Proceso LeagueClientUx.exe detectado, pero no se pudo leer su línea de comandos. Ejecuta la app con los mismos permisos que el cliente de LoL.',
      },
      credenciales: null,
      errorPermisos: true,
    };
  }

  registrarLog('Método A: No se encontró ningún proceso con nombre LeagueClientUx.exe.', rutaLog);
  return {
    paso: {
      step: 'process',
      name: 'Proceso LeagueClientUx.exe (PowerShell Get-CimInstance)',
      commandOrPath: comandoVisible,
      success: false,
      details: 'El proceso LeagueClientUx.exe no está en ejecución actualmente.',
    },
    credenciales: null,
    errorPermisos: false,
  };
}

/**
 * Método B: Leer lockfile desde ruta de instalación en C:\ProgramData\Riot Games\RiotClientInstalls.json
 * o desde la ruta del proceso encontrada en el paso A.
 */
export async function detectarPorRiotClientInstalls(
  installDirectoryFromProcess?: string,
  rutaLog?: string
): Promise<{
  paso: LcuDetectionStepResult;
  credenciales: LcuCredentials | null;
}> {
  const jsonPath = 'C:\\ProgramData\\Riot Games\\RiotClientInstalls.json';
  registrarLog(`Probando Método B (RiotClientInstalls.json / Proceso)... Ruta base: ${jsonPath}`, rutaLog);

  const candidatos: string[] = [];

  // Si el paso A aportó un installDirectory:
  if (installDirectoryFromProcess) {
    candidatos.push(path.join(installDirectoryFromProcess, 'lockfile'));
  }

  // Leer RiotClientInstalls.json
  if (fs.existsSync(jsonPath)) {
    try {
      const contenido = fs.readFileSync(jsonPath, 'utf-8');
      const datos = JSON.parse(contenido);
      if (datos && typeof datos === 'object' && datos.associated_client) {
        for (const [clavePath] of Object.entries(datos.associated_client)) {
          if (clavePath.toLowerCase().includes('league of legends')) {
            candidatos.push(path.join(clavePath, 'lockfile'));
          }
        }
      }
    } catch (err: unknown) {
      registrarLog(`Método B: Error parseando ${jsonPath}: ${err instanceof Error ? err.message : String(err)}`, rutaLog);
    }
  }

  for (const cand of candidatos) {
    const normalizada = path.normalize(cand);
    if (fs.existsSync(normalizada)) {
      try {
        const credenciales = await leerLockfile(normalizada);
        registrarLog(`Método B exitoso. Lockfile leído en: ${normalizada}`, rutaLog);
        return {
          paso: {
            step: 'riotClientInstalls',
            name: 'Ruta de RiotClientInstalls.json / Directorio de Proceso',
            commandOrPath: normalizada,
            success: true,
            details: `Lockfile encontrado y leído exitosamente en: ${normalizada}`,
          },
          credenciales,
        };
      } catch (err) {
        registrarLog(`Método B: Lockfile en ${normalizada} no pudo leerse: ${err instanceof Error ? err.message : String(err)}`, rutaLog);
      }
    }
  }

  const detalleFallo = candidatos.length > 0
    ? `Se probaron las rutas derivadas (${candidatos.join(', ')}), pero el lockfile no existe o está inaccesible.`
    : `No se encontró entrada de League of Legends en ${jsonPath} ni directorio de proceso.`;

  registrarLog(`Método B no tuvo éxito: ${detalleFallo}`, rutaLog);

  return {
    paso: {
      step: 'riotClientInstalls',
      name: 'Ruta de RiotClientInstalls.json / Directorio de Proceso',
      commandOrPath: jsonPath,
      success: false,
      details: detalleFallo,
    },
    credenciales: null,
  };
}

/**
 * Método C: Probar rutas comunes en todos los discos bajo "Riot Games\League of Legends\lockfile".
 */
export async function detectarPorRutasComunes(rutaLog?: string): Promise<{
  paso: LcuDetectionStepResult;
  credenciales: LcuCredentials | null;
}> {
  registrarLog('Probando Método C (Rutas comunes en discos C:, D:, E:, etc.)...', rutaLog);

  const letras = ['C', 'D', 'E', 'F', 'G', 'H'];
  const subcarpetas = [
    'Riot Games\\League of Legends\\lockfile',
    'Program Files\\Riot Games\\League of Legends\\lockfile',
    'Program Files (x86)\\Riot Games\\League of Legends\\lockfile',
    'Games\\League of Legends\\lockfile',
    'Juegos\\League of Legends\\lockfile',
  ];

  const probadas: string[] = [];

  for (const letra of letras) {
    for (const sub of subcarpetas) {
      const rutaLockfile = `${letra}:\\${sub}`;
      probadas.push(rutaLockfile);
      if (fs.existsSync(rutaLockfile)) {
        try {
          const credenciales = await leerLockfile(rutaLockfile);
          registrarLog(`Método C exitoso. Lockfile encontrado en: ${rutaLockfile}`, rutaLog);
          return {
            paso: {
              step: 'commonPaths',
              name: 'Rutas Comunes en Unidades de Disco',
              commandOrPath: rutaLockfile,
              success: true,
              details: `Lockfile encontrado en: ${rutaLockfile}`,
            },
            credenciales,
          };
        } catch (err) {
          registrarLog(`Método C: Lockfile en ${rutaLockfile} existe pero no se pudo parsear: ${err instanceof Error ? err.message : String(err)}`, rutaLog);
        }
      }
    }
  }

  registrarLog(`Método C: Ninguna de las ${probadas.length} rutas comunes contiene un lockfile activo.`, rutaLog);

  return {
    paso: {
      step: 'commonPaths',
      name: 'Rutas Comunes en Unidades de Disco',
      commandOrPath: 'C..H:\\Riot Games\\League of Legends\\lockfile',
      success: false,
      details: `Se verificaron las rutas comunes en unidades C:, D:, E:, F:, G:, H: sin encontrar un lockfile activo.`,
    },
    credenciales: null,
  };
}

/**
 * Método D: Ruta manual configurada por el usuario.
 */
export async function detectarPorRutaManual(
  rutaManual?: string,
  rutaLog?: string
): Promise<{
  paso: LcuDetectionStepResult;
  credenciales: LcuCredentials | null;
}> {
  if (!rutaManual || !rutaManual.trim()) {
    return {
      paso: {
        step: 'manualPath',
        name: 'Ruta Manual Configurada',
        commandOrPath: '(No configurada)',
        success: false,
        details: 'No se ha configurado ninguna ruta manual de instalación en los Ajustes.',
      },
      credenciales: null,
    };
  }

  const limpia = rutaManual.trim();
  registrarLog(`Probando Método D (Ruta Manual)... Configurada: ${limpia}`, rutaLog);

  let rutaLockfile = limpia;
  try {
    if (fs.existsSync(limpia) && fs.statSync(limpia).isDirectory()) {
      rutaLockfile = path.join(limpia, 'lockfile');
    }
  } catch {}

  if (fs.existsSync(rutaLockfile)) {
    try {
      const credenciales = await leerLockfile(rutaLockfile);
      registrarLog(`Método D exitoso. Lockfile leído en ruta manual: ${rutaLockfile}`, rutaLog);
      return {
        paso: {
          step: 'manualPath',
          name: 'Ruta Manual Configurada',
          commandOrPath: rutaLockfile,
          success: true,
          details: `Lockfile leído exitosamente en: ${rutaLockfile}`,
        },
        credenciales,
      };
    } catch (err) {
      const detalle = err instanceof Error ? err.message : String(err);
      registrarLog(`Método D: Lockfile en ${rutaLockfile} falló al parsear: ${detalle}`, rutaLog);
      return {
        paso: {
          step: 'manualPath',
          name: 'Ruta Manual Configurada',
          commandOrPath: rutaLockfile,
          success: false,
          details: `El archivo existe en ${rutaLockfile} pero no se pudo parsear: ${detalle}`,
        },
        credenciales: null,
      };
    }
  }

  registrarLog(`Método D: La ruta ${rutaLockfile} no existe.`, rutaLog);
  return {
    paso: {
      step: 'manualPath',
      name: 'Ruta Manual Configurada',
      commandOrPath: rutaLockfile,
      success: false,
      details: `No se encontró el archivo lockfile en: ${rutaLockfile}`,
    },
    credenciales: null,
  };
}

/**
 * Ejecuta el algoritmo de detección en orden estricto (A -> B -> C -> D).
 * Se detiene en cuanto un método tiene éxito.
 */
export async function ejecutarDeteccionLcu(
  opciones: OpcionesDeteccionLcu = {}
): Promise<LcuDetectionReport> {
  const rutaLog = opciones.rutaArchivoLog || obtenerRutaLogPorDefecto();
  const pasos: LcuDetectionStepResult[] = [];
  let isPermissionError = false;

  registrarLog('=== Iniciando ciclo de detección de LCU ===', rutaLog, opciones.silencioso);

  // 1. Método A: Proceso LeagueClientUx.exe
  const resA = await detectarPorProceso(rutaLog);
  pasos.push(resA.paso);
  if (resA.errorPermisos) {
    isPermissionError = true;
  }
  if (resA.credenciales) {
    registrarLog(`=== Detección LCU COMPLETADA con Éxito (Método A: Proceso) ===`, rutaLog, opciones.silencioso);
    return {
      success: true,
      credentials: resA.credenciales,
      successfulStep: resA.paso.name,
      steps: pasos,
      isPermissionError,
      logFilePath: rutaLog,
    };
  }

  // 2. Método B: RiotClientInstalls.json / Directorio del proceso
  const resB = await detectarPorRiotClientInstalls(resA.installDirectory, rutaLog);
  pasos.push(resB.paso);
  if (resB.credenciales) {
    registrarLog(`=== Detección LCU COMPLETADA con Éxito (Método B: RiotClientInstalls) ===`, rutaLog, opciones.silencioso);
    return {
      success: true,
      credentials: resB.credenciales,
      successfulStep: resB.paso.name,
      steps: pasos,
      isPermissionError,
      logFilePath: rutaLog,
    };
  }

  // 3. Método C: Rutas comunes en discos
  const resC = await detectarPorRutasComunes(rutaLog);
  pasos.push(resC.paso);
  if (resC.credenciales) {
    registrarLog(`=== Detección LCU COMPLETADA con Éxito (Método C: Rutas Comunes) ===`, rutaLog, opciones.silencioso);
    return {
      success: true,
      credentials: resC.credenciales,
      successfulStep: resC.paso.name,
      steps: pasos,
      isPermissionError,
      logFilePath: rutaLog,
    };
  }

  // 4. Método D: Ruta manual configurada por el usuario
  const resD = await detectarPorRutaManual(opciones.rutaManual, rutaLog);
  pasos.push(resD.paso);
  if (resD.credenciales) {
    registrarLog(`=== Detección LCU COMPLETADA con Éxito (Método D: Ruta Manual) ===`, rutaLog, opciones.silencioso);
    return {
      success: true,
      credentials: resD.credenciales,
      successfulStep: resD.paso.name,
      steps: pasos,
      isPermissionError,
      logFilePath: rutaLog,
    };
  }

  registrarLog('=== Fin de detección: League of Legends no detectado por ningún método ===', rutaLog, opciones.silencioso);

  return {
    success: false,
    credentials: null,
    steps: pasos,
    isPermissionError,
    logFilePath: rutaLog,
  };
}
