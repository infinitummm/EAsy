/**
 * Verificador del modo de pantalla de League of Legends (T-8.4).
 *
 * El overlay in-game solo puede dibujarse por encima del juego cuando el
 * cliente está en modo "Sin bordes" (`WindowMode=1`). Este módulo lee la
 * sección `[General]` de `<instalación>\Config\game.cfg`:
 *
 *   - `0` → pantalla completa exclusiva (el overlay no se verá).
 *   - `1` → sin bordes (modo requerido).
 *   - `2` → ventana.
 *
 * La lectura es tolerante a BOM, finales de línea CRLF, espacios, comentarios
 * `;`/`#` y diferencias de mayúsculas. Si el archivo no existe se lanza un
 * error claro para que la UI pueda avisar; si existe pero no contiene
 * `WindowMode`, se devuelve `-1` (desconocido) sin romper el arranque.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { IModeService } from '@shared/contracts';
import { registrarLog } from '../lcu/LcuDetector';

/** Ruta de instalación por defecto en Windows. */
export const RUTA_INSTALACION_LOL_POR_DEFECTO = 'C:\\Riot Games\\League of Legends';

/** Resultado del contrato `IModeService.checkBorderless`. */
export type ResultadoBorderless = Awaited<ReturnType<IModeService['checkBorderless']>>;

/** Error al localizar o leer la configuración del juego. */
export class ErrorConfiguracionLol extends Error {
  constructor(
    readonly rutaConfig: string,
    mensaje: string,
    opciones?: ErrorOptions
  ) {
    super(mensaje, opciones);
    this.name = 'ErrorConfiguracionLol';
  }
}

export interface OpcionesBorderlessDetector {
  /** Ruta usada cuando `checkBorderless` se llama sin argumentos. */
  rutaInstalacionPorDefecto?: string;
  /** Lector inyectable para pruebas; por defecto `fs.promises.readFile`. */
  leerArchivo?: (ruta: string) => Promise<string>;
  /** Registro de avisos; por defecto el log de la LCU. */
  registrar?: (mensaje: string) => void;
}

/**
 * Resuelve la ruta de `game.cfg` a partir de una ruta de instalación, de la
 * carpeta `Config`, o incluso del propio archivo. También admite la variable de
 * entorno `LEAGUE_INSTALL_PATH` y cae a la ruta estándar de Riot.
 */
export function resolverRutaGameCfg(rutaInstalacion?: string): string {
  const base =
    rutaInstalacion?.trim() ||
    process.env.LEAGUE_INSTALL_PATH?.trim() ||
    RUTA_INSTALACION_LOL_POR_DEFECTO;

  const ruta = path.resolve(base);
  if (path.extname(ruta).toLowerCase() === '.cfg') return ruta;
  if (path.basename(ruta).toLowerCase() === 'config') {
    return path.join(ruta, 'game.cfg');
  }
  return path.join(ruta, 'Config', 'game.cfg');
}

/**
 * Extrae `[General] WindowMode` de un INI. Devuelve `null` si la sección o la
 * clave no existen, o si el valor no es un entero.
 */
export function extraerWindowMode(contenido: string): number | null {
  const texto = String(contenido ?? '').replace(/^\uFEFF/, '');
  let seccion = '';

  for (const lineaCruda of texto.split(/\r?\n/)) {
    const linea = lineaCruda.trim();
    if (!linea || linea.startsWith(';') || linea.startsWith('#')) continue;

    const coincidenciaSeccion = linea.match(/^\[([^\]]+)\]$/);
    if (coincidenciaSeccion) {
      seccion = coincidenciaSeccion[1].trim().toLowerCase();
      continue;
    }

    if (seccion !== 'general') continue;

    const coincidenciaClave = linea.match(/^([^=;#]+?)\s*=\s*(.*)$/);
    if (!coincidenciaClave) continue;

    const clave = coincidenciaClave[1].trim().toLowerCase();
    if (clave !== 'windowmode') continue;

    const valor = coincidenciaClave[2].split(/[;#]/, 1)[0].trim();
    if (!/^-?\d+$/.test(valor)) return null;

    const numero = Number.parseInt(valor, 10);
    return Number.isInteger(numero) ? numero : null;
  }

  return null;
}

/**
 * Detector del modo de pantalla. Implementa la mitad de `IModeService`
 * correspondiente a `checkBorderless`; T-8.5 podrá inyectarlo en el facade de
 * modos sin acoplarse al sistema de archivos.
 */
export class BorderlessDetector implements Pick<IModeService, 'checkBorderless'> {
  private readonly rutaInstalacionPorDefecto: string;
  private readonly leerArchivo: (ruta: string) => Promise<string>;
  private readonly registrar: (mensaje: string) => void;

  constructor(opciones: OpcionesBorderlessDetector = {}) {
    this.rutaInstalacionPorDefecto =
      opciones.rutaInstalacionPorDefecto ??
      process.env.LEAGUE_INSTALL_PATH ??
      RUTA_INSTALACION_LOL_POR_DEFECTO;
    this.leerArchivo = opciones.leerArchivo ?? ((ruta) => readFile(ruta, 'utf8'));
    this.registrar = opciones.registrar ?? registrarLog;
  }

  /**
   * Comprueba si el cliente está en ventana sin bordes. La ruta explícita
   * (si se pasa) puede ser la instalación, la carpeta `Config` o `game.cfg`.
   */
  async checkBorderless(installationPath?: string): Promise<ResultadoBorderless> {
    const configPath = resolverRutaGameCfg(
      installationPath?.trim() || this.rutaInstalacionPorDefecto
    );

    let contenido: string;
    try {
      contenido = await this.leerArchivo(configPath);
    } catch (error) {
      throw new ErrorConfiguracionLol(
        configPath,
        `No se pudo leer la configuración del juego en "${configPath}". ` +
          'Comprueba que League of Legends esté instalado en esa ruta.',
        { cause: error }
      );
    }

    const windowMode = extraerWindowMode(contenido);
    if (windowMode === null) {
      this.registrar(
        `[BorderlessDetector] No se encontró [General] WindowMode en "${configPath}".`
      );
      return { isBorderless: false, windowMode: -1, configPath };
    }

    return {
      isBorderless: windowMode === 1,
      windowMode,
      configPath,
    };
  }
}
