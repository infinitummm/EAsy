/**
 * Servicio de Data Dragon / Community Dragon con caché de assets (T-3.6).
 *
 *  - Detecta el parche actual consultando `versions.json` del CDN (con TTL).
 *  - Descarga y cachea metadatos por versión: campeones, objetos, árboles de
 *    runas (`runesReforged.json`) y hechizos de invocador (`summoner.json`).
 *  - Caché de dos niveles: memoria (por proceso) y disco (JSON por versión e
 *    idioma) cuando se configura `directorioCache`.
 *  - Los helpers `url*()` construyen URLs de imágenes del CDN para que la UI
 *    (Electron) las consuma directamente (el caché HTTP lo gestiona Chromium).
 *
 * Idiomas soportados por el CDN: `es_ES`, `es_MX`, `en_US`, etc. (por defecto `es_ES`).
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CDN_URLS } from '@shared/constants';

/** Error de comunicación o contenido inválido del CDN de Data Dragon. */
export class ErrorDataDragon extends Error {
  constructor(
    mensaje: string,
    readonly codigoEstado?: number
  ) {
    super(mensaje);
    this.name = 'ErrorDataDragon';
  }
}

// ==========================================
// Tipos de metadatos (subconjunto usado por la app)
// ==========================================

export interface DatosCampeon {
  id: string;
  key: string;
  name: string;
  title: string;
  tags: string[];
  image: { full: string };
}

export interface DatosItem {
  id: string;
  name: string;
  description: string;
  gold: { total: number };
  tags: string[];
  image: { full: string };
}

export interface RunaDeArbol {
  id: number;
  key: string;
  name: string;
  icon: string;
}

export interface ArbolRunas {
  id: number;
  key: string;
  name: string;
  icon: string;
  slots: Array<{ runes: RunaDeArbol[] }>;
}

export interface DatosHechizo {
  id: string;
  key: string;
  name: string;
  image: { full: string };
}

export interface OpcionesDataDragonService {
  /** Idioma del CDN (por defecto `es_ES`). */
  idioma?: string;
  /** URL de `versions.json`. */
  urlVersiones?: string;
  /** Base del CDN de Data Dragon (p. ej. `https://ddragon.leagueoflegends.com/cdn`). */
  cdnBase?: string;
  /** Base de Community Dragon (assets complementarios). */
  comunidadBase?: string;
  /** Implementación de `fetch` (pruebas); por defecto la global. */
  fetchImpl?: typeof fetch;
  /** Directorio para caché en disco; si es `null`/`undefined` solo se usa memoria. */
  directorioCache?: string | null;
  /** Vigencia de `versions.json` en caché (ms). Por defecto 1 hora. */
  ttlVersionMs?: number;
}

const TTL_VERSION_POR_DEFECTO_MS = 60 * 60 * 1000;

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** Extrae los valores de un archivo Data Dragon con forma `{ data: { ... } }`. */
function extraerValoresDeData<T>(crudo: unknown): T[] {
  if (!esObjeto(crudo) || !esObjeto(crudo.data)) return [];
  return Object.values(crudo.data) as T[];
}

/** Extrae un arreglo directo (p. ej. `runesReforged.json`). */
function extraerArreglo<T>(crudo: unknown): T[] {
  return Array.isArray(crudo) ? (crudo as T[]) : [];
}

export class DataDragonService {
  private readonly idioma: string;
  private readonly urlVersiones: string;
  private readonly cdnBase: string;
  private readonly comunidadBase: string;
  private readonly fetchImpl: typeof fetch;
  private readonly directorioCache: string | null;
  private readonly ttlVersionMs: number;
  private readonly cacheMemoria = new Map<string, unknown>();
  private versionActual: string | null = null;

  constructor(opciones: OpcionesDataDragonService = {}) {
    this.idioma = opciones.idioma ?? 'es_ES';
    this.urlVersiones = opciones.urlVersiones ?? CDN_URLS.DDRAGON_VERSIONS;
    this.cdnBase = opciones.cdnBase ?? CDN_URLS.DDRAGON_CDN_BASE;
    this.comunidadBase = opciones.comunidadBase ?? CDN_URLS.COMMUNITY_DRAGON_BASE;
    this.fetchImpl = opciones.fetchImpl ?? fetch;
    this.directorioCache = opciones.directorioCache ?? null;
    this.ttlVersionMs = opciones.ttlVersionMs ?? TTL_VERSION_POR_DEFECTO_MS;
  }

  // ==========================================
  // Versión del parche
  // ==========================================

  /**
   * Devuelve la versión actual del parche (primera de `versions.json`).
   * Usa memoria y, si hay `directorioCache`, disco con TTL configurable.
   */
  async obtenerVersionActual(): Promise<string> {
    if (this.versionActual) return this.versionActual;

    const desdeDisco = await this.leerVersionEnDisco();
    if (desdeDisco) {
      this.versionActual = desdeDisco;
      return desdeDisco;
    }

    const crudo = await this.obtenerJson(this.urlVersiones);
    if (!Array.isArray(crudo) || typeof crudo[0] !== 'string') {
      throw new ErrorDataDragon('El CDN devolvió una lista de versiones inválida.');
    }

    const version = crudo[0];
    this.versionActual = version;
    await this.escribirVersionEnDisco(version);
    return version;
  }

  // ==========================================
  // Metadatos (campeones, objetos, runas, hechizos)
  // ==========================================

  /** Lista de campeones de la versión indicada (por defecto, la actual). */
  async obtenerCampeones(version?: string): Promise<DatosCampeon[]> {
    return this.cargarRecurso('champion.json', version, extraerValoresDeData<DatosCampeon>);
  }

  /** Lista de objetos (ítems) de la versión indicada. */
  async obtenerItems(version?: string): Promise<DatosItem[]> {
    return this.cargarRecurso('item.json', version, extraerValoresDeData<DatosItem>);
  }

  /** Árboles de runas (Precisión, Dominación, ...) de la versión indicada. */
  async obtenerArbolesDeRunas(version?: string): Promise<ArbolRunas[]> {
    return this.cargarRecurso('runesReforged.json', version, extraerArreglo<ArbolRunas>);
  }

  /** Hechizos de invocador de la versión indicada. */
  async obtenerHechizos(version?: string): Promise<DatosHechizo[]> {
    return this.cargarRecurso('summoner.json', version, extraerValoresDeData<DatosHechizo>);
  }

  /** Limpia solo la caché en memoria (el disco, si existe, sigue disponible). */
  invalidarCacheMemoria(): void {
    this.cacheMemoria.clear();
    this.versionActual = null;
  }

  // ==========================================
  // URLs de imágenes (CDN)
  // ==========================================

  /** URL de la imagen del campeón (p. ej. `Aatrox.png`). */
  urlCampeon(archivo: string, version?: string): string {
    return `${this.cdnBase}/${this.resolverVersion(version)}/img/champion/${archivo}`;
  }

  /** URL de la imagen de un objeto (acepta id o nombre de archivo). */
  urlItem(idOArchivo: string, version?: string): string {
    const archivo = idOArchivo.toLowerCase().endsWith('.png') ? idOArchivo : `${idOArchivo}.png`;
    return `${this.cdnBase}/${this.resolverVersion(version)}/img/item/${archivo}`;
  }

  /** URL de la imagen de un hechizo de invocador (p. ej. `SummonerFlash.png`). */
  urlHechizo(archivo: string, version?: string): string {
    return `${this.cdnBase}/${this.resolverVersion(version)}/img/spell/${archivo}`;
  }

  /** URL de un recurso de Community Dragon (assets complementarios). */
  urlComunidad(ruta: string): string {
    return `${this.comunidadBase}/${ruta.replace(/^\/+/, '')}`;
  }

  // ==========================================
  // Internos
  // ==========================================

  private resolverVersion(version?: string): string {
    const resuelta = version ?? this.versionActual;
    if (!resuelta) {
      throw new ErrorDataDragon(
        'Aún no se conoce la versión del parche. Llama a obtenerVersionActual() primero o pasa una versión explícita.'
      );
    }
    return resuelta;
  }

  /** Carga un recurso con caché memoria → disco → CDN (y lo persiste). */
  private async cargarRecurso<T>(
    nombreArchivo: string,
    version: string | undefined,
    extraer: (crudo: unknown) => T[]
  ): Promise<T[]> {
    const versionResuelta = version ?? (await this.obtenerVersionActual());
    const clave = `${nombreArchivo}:${versionResuelta}:${this.idioma}`;

    const enMemoria = this.cacheMemoria.get(clave);
    if (enMemoria !== undefined) {
      return enMemoria as T[];
    }

    const enDisco = await this.leerJsonArchivo(this.rutaCacheRecurso(clave));
    if (enDisco !== null) {
      // En disco se guarda el resultado ya extraído (arreglo tipado).
      const datos = (Array.isArray(enDisco) ? enDisco : []) as T[];
      this.cacheMemoria.set(clave, datos);
      return datos;
    }

    const url = `${this.cdnBase}/${versionResuelta}/data/${this.idioma}/${nombreArchivo}`;
    const crudo = await this.obtenerJson(url);
    const datos = extraer(crudo);

    this.cacheMemoria.set(clave, datos);
    await this.escribirJsonArchivo(this.rutaCacheRecurso(clave), datos);
    return datos;
  }

  /** GET + parseo JSON con errores tipados de Data Dragon. */
  private async obtenerJson(url: string): Promise<unknown> {
    let respuesta: Response;
    try {
      respuesta = await this.fetchImpl(url);
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      throw new ErrorDataDragon(`Error de red al consultar ${url}: ${detalle}`);
    }

    if (!respuesta.ok) {
      throw new ErrorDataDragon(
        `El CDN respondió ${respuesta.status} en ${url}.`,
        respuesta.status
      );
    }

    try {
      return await respuesta.json();
    } catch {
      throw new ErrorDataDragon(`El CDN devolvió contenido no JSON en ${url}.`, respuesta.status);
    }
  }

  // ---------- Caché en disco ----------

  private rutaCacheRecurso(clave: string): string | null {
    if (!this.directorioCache) return null;
    const nombreSeguro = clave.replace(/[^a-zA-Z0-9._-]/g, '_');
    return join(this.directorioCache, `ddragon-${nombreSeguro}.json`);
  }

  private rutaCacheVersion(): string | null {
    if (!this.directorioCache) return null;
    return join(this.directorioCache, 'ddragon-version.json');
  }

  private async leerVersionEnDisco(): Promise<string | null> {
    if (!this.directorioCache) return null;

    const crudo = await this.leerJsonArchivo(this.rutaCacheVersion());
    if (!esObjeto(crudo)) return null;

    const version = crudo.version;
    const actualizadoEn = crudo.actualizadoEn;
    if (typeof version !== 'string' || typeof actualizadoEn !== 'number') return null;
    if (Date.now() - actualizadoEn >= this.ttlVersionMs) return null;

    return version;
  }

  private async escribirVersionEnDisco(version: string): Promise<void> {
    if (!this.directorioCache) return;
    await this.escribirJsonArchivo(this.rutaCacheVersion(), {
      version,
      actualizadoEn: Date.now(),
    });
  }

  private async leerJsonArchivo(ruta: string | null): Promise<unknown | null> {
    if (!ruta) return null;
    try {
      const contenido = await readFile(ruta, 'utf-8');
      return JSON.parse(contenido);
    } catch {
      return null;
    }
  }

  private async escribirJsonArchivo(ruta: string | null, datos: unknown): Promise<void> {
    if (!ruta) return;
    try {
      await mkdir(dirname(ruta), { recursive: true });
      await writeFile(ruta, JSON.stringify(datos), 'utf-8');
    } catch {
      // La caché en disco es best-effort: un fallo de escritura no rompe la app.
    }
  }
}
