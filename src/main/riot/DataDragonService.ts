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
import {
  getChampionById,
  obtenerTodosLosCampeones,
  registrarCampeones,
  type ChampionInfo,
} from '@shared/champions';

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

/** Entrada de `champion-summary.json` servida por la LCU / Community Dragon. */
export interface ResumenCampeonCrudo {
  id?: unknown;
  name?: unknown;
  alias?: unknown;
  squarePortraitPath?: unknown;
}

/** Resultado de sincronizar el catálogo compartido de campeones (REQ-013). */
export interface ResultadoSincronizacionCatalogo {
  /** Total de campeones disponibles tras la fusión. */
  total: number;
  /** Campeones nuevos añadidos en esta sincronización. */
  nuevos: number;
  /** Versión de Data Dragon usada como fuente principal, si se pudo consultar. */
  version: string | null;
  /** Fuente que aportó el catálogo base (Data Dragon o contingencia). */
  origenPrincipal: 'ddragon' | 'lcu' | 'communitydragon';
  /** Fuente de contingencia usada para completar IDs ausentes en Data Dragon. */
  fuenteFallback?: 'lcu' | 'communitydragon';
}

/** Convierte la respuesta de `champion.json` de Data Dragon al formato compartido. */
export function convertirCampeonesDataDragon(datos: readonly DatosCampeon[]): ChampionInfo[] {
  const campeones: ChampionInfo[] = [];

  for (const dato of datos ?? []) {
    const id = Number(dato?.key);
    if (!Number.isInteger(id) || id <= 0) {
      continue;
    }
    const nombre = typeof dato.name === 'string' ? dato.name.trim() : '';
    if (!nombre) {
      continue;
    }
    const archivo = typeof dato.image?.full === 'string' && dato.image.full ? dato.image.full : `${dato.id}.png`;
    campeones.push({
      id,
      name: nombre,
      key: typeof dato.id === 'string' && dato.id ? dato.id : String(id),
      image: archivo,
    });
  }

  return campeones;
}

/**
 * Convierte `champion-summary.json` (LCU o Community Dragon) al formato
 * compartido. Los iconos se resuelven vía Community Dragon (misma ruta que la
 * LCU) para que los campeones ausentes en Data Dragon tengan retrato válido.
 */
export function convertirResumenCampeonesLcu(
  crudo: unknown,
  comunidadBase: string
): ChampionInfo[] {
  if (!Array.isArray(crudo)) {
    return [];
  }

  const base = comunidadBase.replace(/\/+$/, '');
  const campeones: ChampionInfo[] = [];

  for (const entrada of crudo) {
    if (!esObjeto(entrada)) {
      continue;
    }
    const id = Number(entrada.id);
    const nombre = typeof entrada.name === 'string' ? entrada.name.trim() : '';
    if (!Number.isInteger(id) || id <= 0 || !nombre) {
      continue;
    }

    const alias =
      typeof entrada.alias === 'string' && entrada.alias.trim() ? entrada.alias.trim() : nombre;
    const ruta =
      typeof entrada.squarePortraitPath === 'string' ? entrada.squarePortraitPath.trim() : '';
    const rutaComunidad = ruta
      ? ruta.replace(/^\/lol-game-data\/assets/, '/plugins/rcp-be-lol-game-data/global/default')
      : `/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${id}.png`;

    campeones.push({
      id,
      name: nombre,
      key: alias,
      image: `${alias}.png`,
      iconUrl: `${base}${rutaComunidad.startsWith('/') ? rutaComunidad : `/${rutaComunidad}`}`,
    });
  }

  return campeones;
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
  /**
   * Fuente del `champion-summary.json` de la LCU (REQ-013). Permite incorporar
   * campeones recién lanzados (p. ej. Yunara, ID 804) ausentes en Data Dragon.
   * Normalmente se cablea a `LcuClient.getChampionSummary()`.
   */
  obtenerResumenCampeonesLcu?: () => Promise<unknown>;
  /** URL del resumen de campeones de Community Dragon (contingencia). */
  urlResumenCampeonesComunidad?: string;
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
  private readonly obtenerResumenCampeonesLcu?: () => Promise<unknown>;
  private readonly urlResumenCampeonesComunidad: string;
  private readonly cacheMemoria = new Map<string, unknown>();
  private versionActual: string | null = null;
  private versionesEnMemoria: string[] | null = null;

  constructor(opciones: OpcionesDataDragonService = {}) {
    this.idioma = opciones.idioma ?? 'es_ES';
    this.urlVersiones = opciones.urlVersiones ?? CDN_URLS.DDRAGON_VERSIONS;
    this.cdnBase = opciones.cdnBase ?? CDN_URLS.DDRAGON_CDN_BASE;
    this.comunidadBase = opciones.comunidadBase ?? CDN_URLS.COMMUNITY_DRAGON_BASE;
    this.fetchImpl = opciones.fetchImpl ?? fetch;
    this.directorioCache = opciones.directorioCache ?? null;
    this.ttlVersionMs = opciones.ttlVersionMs ?? TTL_VERSION_POR_DEFECTO_MS;
    this.obtenerResumenCampeonesLcu = opciones.obtenerResumenCampeonesLcu;
    this.urlResumenCampeonesComunidad =
      opciones.urlResumenCampeonesComunidad ??
      `${this.comunidadBase.replace(/\/+$/, '')}/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json`;
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

    const versiones = await this.obtenerVersiones();
    const version = versiones[0];
    this.versionActual = version;
    await this.escribirVersionEnDisco(version);
    return version;
  }

  /**
   * Lista completa de versiones publicadas en `versions.json` (la primera es
   * la vigente). Se cachea en memoria y permite resolver el parche anterior
   * para el diff entre parches (REQ-014).
   */
  async obtenerVersiones(): Promise<string[]> {
    if (this.versionesEnMemoria) return this.versionesEnMemoria;

    const crudo = await this.obtenerJson(this.urlVersiones);
    if (!Array.isArray(crudo) || crudo.length === 0 || crudo.some((entrada) => typeof entrada !== 'string')) {
      throw new ErrorDataDragon('El CDN devolvió una lista de versiones inválida.');
    }

    this.versionesEnMemoria = crudo as string[];
    return this.versionesEnMemoria;
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

  /**
   * Obtiene los hechizos de invocador con sus IDs, claves, nombres e iconos.
   * Soporta selección de locale (idioma) distinto al configurado en el servicio.
   */
  async obtenerHechizosInvocador(
    version?: string,
    idioma?: string
  ): Promise<Array<{ id: number; key: string; name: string; icon: string }>> {
    const versionResuelta = version ?? (await this.obtenerVersionActual());
    const idiomaResuelto = idioma ?? this.idioma;
    const clave = `summoner-invocador:${versionResuelta}:${idiomaResuelto}`;

    const enMemoria = this.cacheMemoria.get(clave);
    if (enMemoria !== undefined) {
      return enMemoria as Array<{ id: number; key: string; name: string; icon: string }>;
    }

    const enDisco = await this.leerJsonArchivo(this.rutaCacheRecurso(clave));
    if (enDisco !== null && Array.isArray(enDisco)) {
      this.cacheMemoria.set(clave, enDisco);
      return enDisco as Array<{ id: number; key: string; name: string; icon: string }>;
    }

    const url = `${this.cdnBase}/${versionResuelta}/data/${idiomaResuelto}/summoner.json`;
    const crudo = await this.obtenerJson(url);
    const datos = extraerValoresDeData<DatosHechizo>(crudo);
    const hechizos = datos
      .map((hechizo) => {
        const id = Number(hechizo.key || hechizo.id);
        if (!Number.isInteger(id) || id <= 0) {
          return null;
        }
        return {
          id,
          key: hechizo.key || hechizo.id || String(id),
          name: hechizo.name || '',
          icon: hechizo.image?.full ? `${this.cdnBase}/${versionResuelta}/img/spell/${hechizo.image.full}` : this.urlHechizo(hechizo.image?.full || `${hechizo.key}.png`, versionResuelta),
        };
      })
      .filter((h): h is { id: number; key: string; name: string; icon: string } => h !== null);

    this.cacheMemoria.set(clave, hechizos);
    await this.escribirJsonArchivo(this.rutaCacheRecurso(clave), hechizos);
    return hechizos;
  }

  // ==========================================
  // Catálogo dinámico de campeones (REQ-013)
  // ==========================================

  /** Devuelve el catálogo actual (Data Dragon + contingencias ya fusionadas). */
  obtenerCatalogoCampeones(): ChampionInfo[] {
    return obtenerTodosLosCampeones();
  }

  /**
   * Sincroniza el catálogo compartido (`src/shared/champions.ts`).
   *
   * 1. Fuente principal: Data Dragon con la última versión disponible.
   * 2. Contingencia: `champion-summary.json` de la LCU (incluye lanzamientos
   *    recientes como Yunara, ID 804) y, si esta no está disponible, el mismo
   *    recurso publicado por Community Dragon.
   *
   * Solo se incorporan desde la contingencia los IDs ausentes en Data Dragon,
   * para no sobrescribir los nombres localizados de la fuente principal.
   */
  async sincronizarCatalogoCampeones(): Promise<ResultadoSincronizacionCatalogo> {
    let version: string | null = null;
    let ddragonOk = false;
    let nuevos = 0;
    const idsDdragon = new Set<number>();

    try {
      version = await this.obtenerVersionActual();
      const campeones = convertirCampeonesDataDragon(await this.obtenerCampeones(version));
      if (campeones.length > 0) {
        for (const champ of campeones) idsDdragon.add(champ.id);
        nuevos += registrarCampeones(campeones);
        ddragonOk = true;
      }
    } catch {
      // Sin conexión a Data Dragon: se resolverá todo con la contingencia.
    }

    let fuenteFallback: 'lcu' | 'communitydragon' | undefined;

    const fusionarContingencia = (
      campeones: ChampionInfo[],
      origen: 'lcu' | 'communitydragon'
    ): void => {
      const filtrados = ddragonOk ? campeones.filter((campeon) => !idsDdragon.has(campeon.id)) : campeones;
      if (filtrados.length > 0) {
        nuevos += registrarCampeones(filtrados);
      }
      fuenteFallback = origen;
    };

    if (this.obtenerResumenCampeonesLcu) {
      try {
        const crudo = await this.obtenerResumenCampeonesLcu();
        const campeones = convertirResumenCampeonesLcu(crudo, this.comunidadBase);
        if (campeones.length > 0) {
          fusionarContingencia(campeones, 'lcu');
        }
      } catch {
        // LCU no disponible (cliente cerrado): se usa Community Dragon.
      }
    }

    if (!fuenteFallback) {
      try {
        const crudo = await this.obtenerJson(this.urlResumenCampeonesComunidad);
        const campeones = convertirResumenCampeonesLcu(crudo, this.comunidadBase);
        if (campeones.length > 0) {
          fusionarContingencia(campeones, 'communitydragon');
        }
      } catch {
        // Sin contingencia disponible: se conserva la lista base estática.
      }
    }

    return {
      total: obtenerTodosLosCampeones().length,
      nuevos,
      version,
      origenPrincipal: ddragonOk ? 'ddragon' : fuenteFallback ?? 'communitydragon',
      fuenteFallback,
    };
  }

  /** Limpia solo la caché en memoria (el disco, si existe, sigue disponible). */
  invalidarCacheMemoria(): void {
    this.cacheMemoria.clear();
    this.versionActual = null;
    this.versionesEnMemoria = null;
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
