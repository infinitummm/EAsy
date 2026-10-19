/**
 * Detección y lectura del archivo `lockfile` del cliente de League of Legends (LCU API).
 *
 * El lockfile tiene el siguiente formato exacto (cinco segmentos separados por `:`):
 *   [NombreProceso]:[PID]:[Puerto]:[PasswordAutenticacion]:[Protocolo]
 *
 * Alternativamente, las credenciales pueden extraerse de los argumentos de línea de
 * comandos del proceso `LeagueClientUx.exe` (`--app-port`, `--remoting-auth-token`, `--app-pid`).
 */

import { readFile } from 'node:fs/promises';
import type { LcuCredentials } from '@shared/types';

/** Nombre del proceso oficial del cliente de League of Legends. */
export const NOMBRE_PROCESO_LCU = 'LeagueClientUx';

/** Protocolo por defecto utilizado por la LCU API. */
export const PROTOCOLO_LCU_POR_DEFECTO = 'https';

/** Número exacto de segmentos que componen un lockfile válido. */
export const SEGMENTOS_LOCKFILE = 5;

/** Error lanzado cuando el lockfile está ausente, es ilegible o tiene un formato inválido. */
export class ErrorLockfile extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorLockfile';
  }
}

/** Resultado exitoso de la búsqueda del lockfile en disco. */
export interface ResultadoBusquedaLockfile {
  /** Ruta absoluta del lockfile encontrado. */
  ruta: string;
  /** Credenciales de conexión extraídas del lockfile. */
  credenciales: LcuCredentials;
}

/**
 * Construye el token de autenticación Basic Auth exigido por la LCU API.
 * Formato: `Basic ` + base64("riot:" + password).
 */
export function construirTokenBase64(password: string): string {
  const codificado = Buffer.from(`riot:${password}`, 'utf-8').toString('base64');
  return `Basic ${codificado}`;
}

/**
 * Parsea el contenido de un lockfile y extrae las credenciales de conexión.
 * @throws {ErrorLockfile} Si el contenido no cumple el formato esperado.
 */
export function parsearLockfile(contenido: string): LcuCredentials {
  const limpio = contenido.trim();
  const partes = limpio.split(':');

  if (partes.length !== SEGMENTOS_LOCKFILE) {
    throw new ErrorLockfile(
      `Formato de lockfile inválido: se esperaban ${SEGMENTOS_LOCKFILE} segmentos y se encontraron ${partes.length}.`
    );
  }

  const [proceso, pidTexto, puertoTexto, password, protocolo] = partes;

  if (!proceso) {
    throw new ErrorLockfile('Formato de lockfile inválido: el nombre del proceso está vacío.');
  }

  const pid = Number.parseInt(pidTexto, 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new ErrorLockfile(`Formato de lockfile inválido: el PID "${pidTexto}" no es numérico o es inválido.`);
  }

  const puerto = Number.parseInt(puertoTexto, 10);
  if (!Number.isInteger(puerto) || puerto <= 0 || puerto > 65535) {
    throw new ErrorLockfile(`Formato de lockfile inválido: el puerto "${puertoTexto}" no es válido.`);
  }

  if (!password) {
    throw new ErrorLockfile('Formato de lockfile inválido: la contraseña de autenticación está vacía.');
  }

  if (!protocolo) {
    throw new ErrorLockfile('Formato de lockfile inválido: el protocolo está vacío.');
  }

  return {
    processName: proceso,
    pid,
    port: puerto,
    password,
    protocol: protocolo,
    tokenBase64: construirTokenBase64(password),
  };
}

/**
 * Lee un lockfile desde disco y extrae sus credenciales.
 * @throws {ErrorLockfile} Si el archivo no existe o su contenido es inválido.
 */
export async function leerLockfile(ruta: string): Promise<LcuCredentials> {
  let contenido: string;
  try {
    contenido = await readFile(ruta, 'utf-8');
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    throw new ErrorLockfile(`No se pudo leer el lockfile en "${ruta}": ${detalle}`);
  }
  return parsearLockfile(contenido);
}

/** Limpia comillas y espacios sobrantes de un argumento de línea de comandos. */
function limpiarArgumento(argumento: string): string {
  return argumento.trim().replace(/^["']+|["']+$/g, '');
}

/**
 * Extrae las credenciales LCU desde los argumentos de línea de comandos del proceso
 * `LeagueClientUx.exe` (detección alternativa cuando el lockfile aún no está disponible).
 * Devuelve `null` si los argumentos no contienen la información mínima requerida.
 */
export function extraerCredencialesDeArgumentos(
  argumentos: string[],
  nombreProceso: string = NOMBRE_PROCESO_LCU
): LcuCredentials | null {
  const argumentosLimpios = argumentos.map(limpiarArgumento);

  const obtenerValor = (clave: string): string | undefined => {
    const prefijo = `${clave}=`;
    const encontrado = argumentosLimpios.find((argumento) => argumento.startsWith(prefijo));
    return encontrado?.slice(prefijo.length);
  };

  const puertoTexto = obtenerValor('--app-port');
  const token = obtenerValor('--remoting-auth-token');
  if (!puertoTexto || !token) {
    return null;
  }

  const puerto = Number.parseInt(puertoTexto, 10);
  if (!Number.isInteger(puerto) || puerto <= 0 || puerto > 65535) {
    return null;
  }

  const pidTexto = obtenerValor('--app-pid');
  const pid = pidTexto ? Number.parseInt(pidTexto, 10) : 0;

  return {
    processName: nombreProceso,
    pid: Number.isInteger(pid) && pid > 0 ? pid : 0,
    port: puerto,
    password: token,
    protocol: PROTOCOLO_LCU_POR_DEFECTO,
    tokenBase64: construirTokenBase64(token),
  };
}

/**
 * Devuelve las rutas candidatas donde puede residir el lockfile.
 * Si la variable de entorno `ITERO_LCU_LOCKFILE` está definida, tiene prioridad absoluta.
 */
export function obtenerRutasCandidatas(): string[] {
  const rutas: string[] = [];

  const rutaPersonalizada = process.env.ITERO_LCU_LOCKFILE;
  if (rutaPersonalizada) {
    rutas.push(rutaPersonalizada);
  }

  // Ubicaciones de instalación típicas de League of Legends en Windows.
  const subrutas = ['Riot Games\\League of Legends', 'Program Files\\Riot Games\\League of Legends'];
  for (const letraUnidad of ['C', 'D', 'E', 'F', 'G', 'H']) {
    for (const subruta of subrutas) {
      rutas.push(`${letraUnidad}:\\${subruta}\\lockfile`);
    }
  }

  return rutas;
}

/**
 * Busca el lockfile recorriendo las rutas candidatas en orden.
 * Devuelve el primer lockfile legible y válido, o `null` si ninguno está disponible.
 */
export async function buscarLockfile(
  rutasCandidatas: string[] = obtenerRutasCandidatas()
): Promise<ResultadoBusquedaLockfile | null> {
  for (const ruta of rutasCandidatas) {
    try {
      const credenciales = await leerLockfile(ruta);
      return { ruta, credenciales };
    } catch {
      // La ruta no existe o el archivo es ilegible/inválido: se continúa con la siguiente.
    }
  }
  return null;
}
