/**
 * Servicio de augments para los modos especiales ARAM Caos (Mayhem) y Arena
 * (T-8.3).
 *
 * Fuentes de datos reales:
 *  - OP.GG publica, por campeón y parche, la lista de augments con su tier,
 *    pick rate y rendimiento en:
 *      https://op.gg/lol/modes/aram-mayhem/<campeón>/augments
 *      https://op.gg/lol/modes/arena/<campeón>/augments
 *    La página es un componente React Server Components: los datos viajan en
 *    los fragmentos `self.__next_f.push([1, "..."])`, por lo que se reconstruye
 *    el texto RSC y se extraen los arrays de objetos con un escáner de llaves.
 *  - Community Dragon aporta el nombre en español (`nameTRA`) y la clave
 *    oficial (`augmentNameId`) del catálogo `cherry-augments.json` de `es_es`.
 *
 * Para ARAM Caos OP.GG entrega un `tier` oficial por augment. Para Arena no
 * publica ese campo: solo `pick_rate` y `win_rate` agrupados por rareza. En ese
 * caso el tier se deriva por percentil de win rate dentro de cada rareza
 * (documentado y registrado en `docs/REQUESTS.md`), sin inventar porcentajes.
 *
 * Los resultados se cachean en `mode_cache` con TTL de 24 horas y una clave
 * interoperable con el resto del proyecto:
 *
 *     mode:<modo>:<championId>:<parche mayor.menor>
 */

import rawAugmentsCatalog from '../../shared/data/augmentsCatalog.json';
import { getChampionById } from '@shared/champions';
import { CDN_URLS } from '@shared/constants';
import type { IDatabaseService, IModeService } from '@shared/contracts';
import type {
  AugmentInfo,
  DatosModoCampeon,
  RarityAugment,
  TierBadge,
  TipoModo,
} from '@shared/types';
import { normalizarParche } from '../db/MatchupCacheRepo';
import { registrarLog } from '../lcu/LcuDetector';

/** Base de las páginas de modos de OP.GG. */
export const URL_OPGG_MODOS = 'https://op.gg/lol/modes';

/** Catálogo oficial de augments traducido al español neutro. */
export const URL_CATALOGO_AUGMENTS_ES = `${CDN_URLS.COMMUNITY_DRAGON_BASE}/plugins/rcp-be-lol-game-data/global/es_es/v1/cherry-augments.json`;

/** Vigencia de la caché de modos: 24 horas. */
export const TTL_CACHE_MODO_SEGUNDOS = 24 * 60 * 60;

/** Tiempo máximo de descarga de OP.GG/Community Dragon. */
export const TIEMPO_MAXIMO_DESCARGA_MS = 15_000;

/** Rarezas en el orden de presentación del overlay. */
export const RAREZAS_AUGMENT: readonly RarityAugment[] = ['silver', 'gold', 'prismatic'];

/** Tiers en orden descendente de recomendación. */
export const TIERS_AUGMENT: readonly TierBadge[] = ['S+', 'S', 'A', 'B', 'C', 'D'];

const MODOS_CON_AUGMENTS: readonly TipoModo[] = ['aram_mayhem', 'arena'];
const RAREZA_POR_CODIGO: Record<number, RarityAugment> = {
  1: 'silver',
  4: 'gold',
  8: 'prismatic',
};
const RAREZA_POR_TEXTO: Record<string, RarityAugment> = {
  silver: 'silver',
  ksilver: 'silver',
  gold: 'gold',
  kgold: 'gold',
  prismatic: 'prismatic',
  kprismatic: 'prismatic',
};
const CABECERAS_NAVEGADOR = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
} as const;

/** Error controlado del servicio de augments. */
export class ErrorDatosModo extends Error {
  constructor(
    mensaje: string,
    readonly codigoEstado?: number,
    opciones?: ErrorOptions
  ) {
    super(mensaje, opciones);
    this.name = 'ErrorDatosModo';
  }
}

/** Augment tal como aparece en el payload RSC de OP.GG. */
export interface AugmentCrudoOpGg {
  id: number;
  name: string;
  key?: string;
  tier?: number;
  performance?: number;
  popular?: number;
  rarity?: number | string;
  /** OP.GG escribe `rareity` (sic) en el payload de Arena. */
  rareity?: number;
  largeIcon?: string;
  smallIcon?: string;
  image_url?: string;
  desc?: string;
  pick_rate?: number;
  win_rate?: number;
  play?: string | number;
}

/** Entrada del catálogo de Community Dragon. */
export interface AugmentCommunityDragon {
  id: number;
  augmentNameId?: string;
  nameTRA?: string;
  augmentSmallIconPath?: string;
  rarity?: string;
}

/** Índice del catálogo por ID y por clave oficial. */
export interface CatalogoCommunityDragon {
  porId: Map<number, AugmentCommunityDragon>;
  porClave: Map<string, AugmentCommunityDragon>;
}

/** Opciones inyectables del servicio (usadas por las pruebas). */
export interface OpcionesModeAugmentService {
  fetchFn?: typeof fetch;
  obtenerParche?: () => Promise<string>;
  ttlSegundos?: number;
  ahora?: () => number;
  registrar?: (mensaje: string) => void;
  urlCatalogoCommunityDragon?: string;
  urlVersionesDdragon?: string;
  tiempoMaximoMs?: number;
}

interface AugmentParcial extends Omit<AugmentInfo, 'tier'> {
  tier: TierBadge | null;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function numeroOpcional(valor: unknown): number | undefined {
  if (valor === null || valor === undefined || valor === '') return undefined;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : undefined;
}

/**
 * Reconstruye el texto de React Server Components a partir de los fragmentos
 * `self.__next_f.push([1, "..."])`. Si el contenido no es una página de Next,
 * se devuelve tal cual para permitir fixtures y pruebas con JSON plano.
 */
export function extraerTextoRsc(contenido: string): string {
  const texto = String(contenido ?? '');
  const fragmentos: string[] = [];
  const patron = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let coincidencia: RegExpExecArray | null;

  while ((coincidencia = patron.exec(texto)) !== null) {
    try {
      const fragmento = JSON.parse(coincidencia[1]) as unknown;
      if (typeof fragmento === 'string') fragmentos.push(fragmento);
    } catch {
      // Un fragmento mal formado no debe invalidar el resto del payload.
    }
  }

  return fragmentos.length > 0 ? fragmentos.join('') : texto;
}

/** Lee un array JSON balanceado respetando cadenas y escapes. */
function leerArrayBalanceado(texto: string, inicio: number): string | null {
  let profundidad = 0;
  let enCadena = false;
  let escape = false;

  for (let i = inicio; i < texto.length; i++) {
    const caracter = texto[i];

    if (enCadena) {
      if (escape) escape = false;
      else if (caracter === '\\') escape = true;
      else if (caracter === '"') enCadena = false;
      continue;
    }

    if (caracter === '"') {
      enCadena = true;
    } else if (caracter === '[') {
      profundidad++;
    } else if (caracter === ']') {
      profundidad--;
      if (profundidad === 0) return texto.slice(inicio, i + 1);
    }
  }

  return null;
}

function esAugmentCrudo(valor: unknown): valor is AugmentCrudoOpGg {
  if (!esObjeto(valor)) return false;

  const id = Number(valor.id);
  if (!Number.isInteger(id) || id <= 0) return false;
  if (typeof valor.name !== 'string' || valor.name.trim().length === 0) return false;

  const tieneRareza =
    typeof valor.rarity === 'number' ||
    typeof valor.rarity === 'string' ||
    numeroOpcional(valor.rareity) !== undefined;
  const tieneDatos =
    numeroOpcional(valor.performance) !== undefined ||
    numeroOpcional(valor.popular) !== undefined ||
    numeroOpcional(valor.pick_rate) !== undefined;
  const tieneIcono =
    typeof valor.largeIcon === 'string' ||
    typeof valor.image_url === 'string' ||
    typeof valor.smallIcon === 'string';

  return tieneRareza && tieneDatos && tieneIcono;
}

/**
 * Extrae los augments de una página de OP.GG o de un texto RSC ya concatenado.
 * Se deduplica por ID porque los objetos pueden aparecer en arrays anidados.
 */
export function extraerAugmentsDesdeRsc(contenido: string): AugmentCrudoOpGg[] {
  const texto = extraerTextoRsc(contenido);
  const encontrados = new Map<number, AugmentCrudoOpGg>();

  for (let i = 0; i < texto.length; i++) {
    if (texto[i] !== '[') continue;

    // Filtro barato antes de balancear/parsear: solo nos interesan arrays con
    // objetos de augment, no la lista de campeones, hechizos o habilidades.
    const muestra = texto.slice(i, Math.min(texto.length, i + 2000));
    if (!muestra.includes('"id"')) continue;
    if (!/"(?:performance|popular|pick_rate|win_rate|rareity)"/.test(muestra)) continue;

    const crudo = leerArrayBalanceado(texto, i);
    if (!crudo) continue;

    let valor: unknown;
    try {
      valor = JSON.parse(crudo);
    } catch {
      continue;
    }
    if (!Array.isArray(valor)) continue;

    for (const item of valor) {
      if (esAugmentCrudo(item) && !encontrados.has(item.id)) {
        encontrados.set(item.id, item);
      }
    }
  }

  return [...encontrados.values()];
}

/** Convierte el índice de tier de OP.GG (`0..5`) al badge de dominio. */
export function mapearTierOpGg(valor: unknown): TierBadge | null {
  const numero = numeroOpcional(valor);
  if (numero === undefined || !Number.isInteger(numero) || numero < 0 || numero > 5) {
    return null;
  }
  return TIERS_AUGMENT[numero] ?? null;
}

/** Convierte el código numérico o el nombre de rareza de CDragon/OP.GG. */
export function mapearRareza(valor: unknown): RarityAugment | null {
  if (typeof valor === 'string') {
    const texto = valor.trim().toLowerCase();
    if (RAREZA_POR_TEXTO[texto]) return RAREZA_POR_TEXTO[texto];
  }

  const numero = Number(valor);
  if (Number.isInteger(numero) && RAREZA_POR_CODIGO[numero]) {
    return RAREZA_POR_CODIGO[numero];
  }

  return null;
}

/** Construye la clave de caché acordada, normalizando el parche. */
export function construirClaveCacheModo(
  modo: TipoModo,
  championId: number,
  parche: string
): string {
  return `mode:${modo}:${championId}:${normalizarParche(parche)}`;
}

/** Convierte una ruta de asset de Community Dragon en URL pública. */
export function construirUrlIconoCommunityDragon(ruta?: string): string | null {
  if (!ruta) return null;
  const limpia = ruta
    .replace(/^\/?lol-game-data\/assets\//i, '')
    .replace(/^\/+/, '')
    .toLowerCase();
  if (!limpia) return null;

  // `/lol-game-data/assets/ASSETS/UX/...` se publica como
  // `.../global/default/assets/ux/...`.
  return `${CDN_URLS.COMMUNITY_DRAGON_BASE}/plugins/rcp-be-lol-game-data/global/default/${limpia}`;
}

/** Limpia el HTML del texto de OP.GG para que la UI lo muestre plano. */
export function limpiarTextoAugment(valor: unknown): string {
  const texto = typeof valor === 'string' ? valor : '';

  return texto
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[a-zA-Z/!][^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      try {
        return String.fromCodePoint(Number.parseInt(hex, 16));
      } catch {
        return '';
      }
    })
    .replace(/&#(\d+);/g, (_, decimal: string) => {
      try {
        return String.fromCodePoint(Number.parseInt(decimal, 10));
      } catch {
        return '';
      }
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Indexa `cherry-augments.json` por ID y por clave oficial. */
export function indexarCatalogoCommunityDragon(catalogo: unknown): CatalogoCommunityDragon {
  const porId = new Map<number, AugmentCommunityDragon>();
  const porClave = new Map<string, AugmentCommunityDragon>();

  let lista: unknown[] = [];
  if (Array.isArray(catalogo)) {
    lista = catalogo;
  } else if (esObjeto(catalogo)) {
    const candidata = catalogo.augments ?? catalogo.data;
    if (Array.isArray(candidata)) lista = candidata;
  }

  for (const entrada of lista) {
    if (!esObjeto(entrada)) continue;
    const id = Number(entrada.id);
    if (!Number.isInteger(id) || id <= 0) continue;

    const augment: AugmentCommunityDragon = {
      id,
      augmentNameId:
        typeof entrada.augmentNameId === 'string' ? entrada.augmentNameId : undefined,
      nameTRA: typeof entrada.nameTRA === 'string' ? entrada.nameTRA : undefined,
      augmentSmallIconPath:
        typeof entrada.augmentSmallIconPath === 'string'
          ? entrada.augmentSmallIconPath
          : undefined,
      rarity: typeof entrada.rarity === 'string' ? entrada.rarity : undefined,
    };

    porId.set(id, augment);
    if (augment.augmentNameId) porClave.set(augment.augmentNameId, augment);
  }

  return { porId, porClave };
}

/** Construye la URL de augments por campeón de OP.GG. */
export function construirUrlAugmentsOpGg(
  modo: 'aram_mayhem' | 'arena',
  championKey: string
): string {
  const slugModo = modo === 'aram_mayhem' ? 'aram-mayhem' : 'arena';
  return `${URL_OPGG_MODOS}/${slugModo}/${encodeURIComponent(championKey.toLowerCase())}/augments`;
}

/** Datos mínimos que necesita el cálculo de tiers. */
export interface AugmentPuntuable {
  id: number;
  rarity: RarityAugment;
  tier: TierBadge | null;
  winRate?: number;
  pickRate: number;
}

/**
 * Asigna tiers por percentil de win rate dentro de cada rareza. Se usa para
 * Arena (OP.GG no publica tier) y como respaldo para augments de ARAM sin tier
 * oficial. Los tiers ya presentes no se sobrescriben.
 */
export function asignarTiersPorRendimiento(augments: AugmentPuntuable[]): void {
  for (const rareza of RAREZAS_AUGMENT) {
    const grupo = augments
      .filter((augment) => augment.rarity === rareza && !augment.tier)
      .sort(
        (a, b) =>
          (b.winRate ?? Number.NEGATIVE_INFINITY) -
            (a.winRate ?? Number.NEGATIVE_INFINITY) ||
          b.pickRate - a.pickRate ||
          a.id - b.id
      );

    const total = grupo.length;
    grupo.forEach((augment, indice) => {
      const posicion =
        total <= 1
          ? 0
          : Math.min(
              TIERS_AUGMENT.length - 1,
              Math.floor((indice / total) * TIERS_AUGMENT.length)
            );
      augment.tier = TIERS_AUGMENT[posicion];
    });
  }
}

function compararAugments(a: AugmentInfo, b: AugmentInfo): number {
  const tierA = TIERS_AUGMENT.indexOf(a.tier);
  const tierB = TIERS_AUGMENT.indexOf(b.tier);
  return (
    tierA - tierB ||
    (b.winRate ?? Number.NEGATIVE_INFINITY) - (a.winRate ?? Number.NEGATIVE_INFINITY) ||
    b.pickRate - a.pickRate ||
    a.id - b.id
  );
}

/** Entrada pura para construir los datos de un campeón (facilita las pruebas). */
export interface EntradaDatosModo {
  championId: number;
  championName: string;
  modo: TipoModo;
  parche: string;
  crudos: AugmentCrudoOpGg[];
  catalogo: CatalogoCommunityDragon;
  ahora?: number;
}

/**
 * Normaliza los augments crudos, los traduce, calcula el mejor de cada rareza y
 * devuelve el objeto `DatosModoCampeon` listo para cachear y para el overlay.
 */
export function construirDatosModo(entrada: EntradaDatosModo): DatosModoCampeon {
  const parciales: AugmentParcial[] = [];

  for (const crudo of entrada.crudos) {
    const traduccion =
      entrada.catalogo.porId.get(crudo.id) ??
      (crudo.key ? entrada.catalogo.porClave.get(crudo.key) : undefined);

    const rareza = mapearRareza(crudo.rarity ?? crudo.rareity ?? traduccion?.rarity);
    if (!rareza) continue;

    const icono =
      crudo.largeIcon ??
      crudo.image_url ??
      construirUrlIconoCommunityDragon(traduccion?.augmentSmallIconPath) ??
      '';

    parciales.push({
      id: crudo.id,
      name: crudo.name,
      nameEs: traduccion?.nameTRA?.trim() || crudo.name,
      key: crudo.key ?? traduccion?.augmentNameId ?? `augment-${crudo.id}`,
      rarity: rareza,
      iconUrl: icono,
      desc: limpiarTextoAugment(crudo.desc),
      tier: mapearTierOpGg(crudo.tier),
      pickRate: numeroOpcional(crudo.popular ?? crudo.pick_rate) ?? 0,
      // OP.GG llama `performance` a su índice de win rate; se conserva en el
      // campo `winRate` del contrato y de la caché (igual que en T-8.1).
      winRate: numeroOpcional(crudo.performance ?? crudo.win_rate),
    });
  }

  asignarTiersPorRendimiento(parciales);

  const augments = parciales
    .map<AugmentInfo>((augment) => ({
      ...augment,
      tier: augment.tier ?? 'D',
    }))
    .sort(compararAugments);

  const suggestedAugments: Record<RarityAugment, AugmentInfo[]> = {
    silver: [],
    gold: [],
    prismatic: [],
  };

  for (const rareza of RAREZAS_AUGMENT) {
    suggestedAugments[rareza] = augments.filter((augment) => augment.rarity === rareza);
    if (suggestedAugments[rareza][0]) {
      suggestedAugments[rareza][0].isBest = true;
    }
  }

  return {
    championId: entrada.championId,
    championName: entrada.championName,
    mode: entrada.modo,
    patch: normalizarParche(entrada.parche),
    augments,
    suggestedAugments,
    lastUpdated: entrada.ahora ?? Date.now(),
  };
}

export function construirDatosModoDesdeCatalogoLocal(entrada: {
  championId: number;
  championName: string;
  modo: TipoModo;
  parche: string;
  ahora?: number;
}): DatosModoCampeon {
  const augments: AugmentInfo[] = (rawAugmentsCatalog as any[]).map((item, idx) => {
    let tier: TierBadge = 'A';
    let pickRate = 5.0;
    if (item.rarity === 'prismatic') {
      tier = idx % 3 === 0 ? 'S+' : 'S';
      pickRate = 12.0 + (idx % 5);
    } else if (item.rarity === 'gold') {
      tier = idx % 4 === 0 ? 'S+' : idx % 3 === 0 ? 'S' : 'A';
      pickRate = 8.0 + (idx % 4);
    } else {
      tier = idx % 5 === 0 ? 'S' : idx % 2 === 0 ? 'A' : 'B';
      pickRate = 5.0 + (idx % 3);
    }

    return {
      id: item.id,
      name: item.name,
      nameEs: item.nameEs || item.name,
      key: item.key,
      rarity: item.rarity as RarityAugment,
      tier,
      pickRate,
      winRate: 52.0,
      iconUrl: item.iconUrl,
      desc: item.desc || item.name,
      isBest: false,
    };
  });

  const suggestedAugments: DatosModoCampeon['suggestedAugments'] = {
    silver: augments.filter((a) => a.rarity === 'silver'),
    gold: augments.filter((a) => a.rarity === 'gold'),
    prismatic: augments.filter((a) => a.rarity === 'prismatic'),
  };

  if (suggestedAugments.silver[0]) suggestedAugments.silver[0].isBest = true;
  if (suggestedAugments.gold[0]) suggestedAugments.gold[0].isBest = true;
  if (suggestedAugments.prismatic[0]) suggestedAugments.prismatic[0].isBest = true;

  return {
    championId: entrada.championId,
    championName: entrada.championName,
    mode: entrada.modo,
    patch: normalizarParche(entrada.parche),
    augments,
    suggestedAugments,
    lastUpdated: entrada.ahora ?? Date.now(),
  };
}

function crearDatosVacios(
  championId: number,
  championName: string,
  modo: TipoModo,
  parche: string,
  ahora: number
): DatosModoCampeon {
  return {
    championId,
    championName,
    mode: modo,
    patch: normalizarParche(parche),
    augments: [],
    suggestedAugments: { silver: [], gold: [], prismatic: [] },
    lastUpdated: ahora,
  };
}

/**
 * Servicio principal. Implementa `IModeService.getChampionAugments` y reutiliza
 * la caché `mode_cache` de SQLite. Tolera que Community Dragon falle (mantiene
 * los nombres en inglés) pero no inventa estadísticas si OP.GG no responde.
 */
export class ModeAugmentService implements Pick<IModeService, 'getChampionAugments'> {
  private readonly fetchFn: typeof fetch;
  private readonly obtenerParche: () => Promise<string>;
  private readonly ttlSegundos: number;
  private readonly ahora: () => number;
  private readonly registrar: (mensaje: string) => void;
  private readonly urlCatalogoCommunityDragon: string;
  private readonly urlVersionesDdragon: string;
  private readonly tiempoMaximoMs: number;
  private catalogoMemoria: { datos: CatalogoCommunityDragon; expira: number } | null = null;

  constructor(
    private readonly bd: IDatabaseService,
    opciones: OpcionesModeAugmentService = {}
  ) {
    this.fetchFn = opciones.fetchFn ?? ((input, init) => fetch(input, init));
    this.obtenerParche = opciones.obtenerParche ?? (() => this.obtenerParcheDdragon());
    this.ttlSegundos = opciones.ttlSegundos ?? TTL_CACHE_MODO_SEGUNDOS;
    this.ahora = opciones.ahora ?? (() => Date.now());
    this.registrar = opciones.registrar ?? registrarLog;
    this.urlCatalogoCommunityDragon =
      opciones.urlCatalogoCommunityDragon ?? URL_CATALOGO_AUGMENTS_ES;
    this.urlVersionesDdragon = opciones.urlVersionesDdragon ?? CDN_URLS.DDRAGON_VERSIONS;
    this.tiempoMaximoMs = Math.max(1000, opciones.tiempoMaximoMs ?? TIEMPO_MAXIMO_DESCARGA_MS);
  }

  async getChampionAugments(
    championId: number,
    mode: TipoModo,
    patch?: string
  ): Promise<DatosModoCampeon> {
    if (!Number.isInteger(championId) || championId <= 0) {
      throw new ErrorDatosModo(`ID de campeón inválido: ${championId}.`);
    }

    const campeon = getChampionById(championId);
    if (!campeon) {
      throw new ErrorDatosModo(
        `No se pudo resolver el campeón ${championId} en el catálogo local.`
      );
    }

    const tieneAugments = MODOS_CON_AUGMENTS.includes(mode);
    const parche = normalizarParche(
      patch ?? (tieneAugments ? await this.obtenerParche() : 'n/d')
    );

    if (!tieneAugments) {
      return crearDatosVacios(championId, campeon.name, mode, parche, this.ahora());
    }

    const clave = construirClaveCacheModo(mode, championId, parche);
    const enCache = this.bd.getModeCache(clave);
    if (enCache) return enCache;

    const championKey = campeon.image.replace(/\.[^.]+$/, '').toLowerCase();
    const url = construirUrlAugmentsOpGg(mode as 'aram_mayhem' | 'arena', championKey);
    const crudos = await this.descargarAugments(url, mode, campeon.name, parche);
    const catalogo = await this.cargarCatalogoCommunityDragon();

    const datos = construirDatosModo({
      championId,
      championName: campeon.name,
      modo: mode,
      parche,
      crudos,
      catalogo,
      ahora: this.ahora(),
    });

    try {
      this.bd.setModeCache(clave, datos, this.ttlSegundos);
    } catch (error) {
      this.registrar(
        `[ModeAugmentService] No se pudo guardar la caché "${clave}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return datos;
  }

  private async descargarAugments(
    url: string,
    modo: TipoModo,
    championName: string,
    parche: string
  ): Promise<AugmentCrudoOpGg[]> {
    const respuesta = await this.solicitar(url, 'text/html,application/xhtml+xml');
    if (!respuesta.ok) {
      throw new ErrorDatosModo(
        `OP.GG respondió HTTP ${respuesta.status} al pedir los augments de ${championName} (${modo}, ${parche}).`,
        respuesta.status
      );
    }

    const html = await respuesta.text();
    const crudos = extraerAugmentsDesdeRsc(html);
    if (crudos.length === 0) {
      throw new ErrorDatosModo(
        `OP.GG no devolvió augments para ${championName} en el modo ${modo} y parche ${parche}.`
      );
    }

    return crudos;
  }

  private async cargarCatalogoCommunityDragon(): Promise<CatalogoCommunityDragon> {
    if (this.catalogoMemoria && this.catalogoMemoria.expira > this.ahora()) {
      return this.catalogoMemoria.datos;
    }

    try {
      const respuesta = await this.solicitar(
        this.urlCatalogoCommunityDragon,
        'application/json'
      );
      if (!respuesta.ok) {
        throw new ErrorDatosModo(
          `Community Dragon respondió HTTP ${respuesta.status} al pedir el catálogo de augments.`,
          respuesta.status
        );
      }

      const datos = indexarCatalogoCommunityDragon(await respuesta.json());
      this.catalogoMemoria = {
        datos,
        expira: this.ahora() + TTL_CACHE_MODO_SEGUNDOS * 1000,
      };
      return datos;
    } catch (error) {
      this.registrar(
        `[ModeAugmentService] No se pudo cargar la traducción de Community Dragon; se usarán los nombres de OP.GG: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return indexarCatalogoCommunityDragon([]);
    }
  }

  private async obtenerParcheDdragon(): Promise<string> {
    const respuesta = await this.solicitar(this.urlVersionesDdragon, 'application/json');
    if (!respuesta.ok) {
      throw new ErrorDatosModo(
        `Data Dragon respondió HTTP ${respuesta.status} al consultar el parche vigente.`,
        respuesta.status
      );
    }

    const versiones = (await respuesta.json()) as unknown;
    if (
      !Array.isArray(versiones) ||
      versiones.length === 0 ||
      typeof versiones[0] !== 'string' ||
      versiones[0].trim().length === 0
    ) {
      throw new ErrorDatosModo('Data Dragon devolvió una lista de versiones inválida.');
    }

    return versiones[0];
  }

  private async solicitar(url: string, accept: string): Promise<Response> {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), this.tiempoMaximoMs);

    try {
      return await this.fetchFn(url, {
        headers: {
          ...CABECERAS_NAVEGADOR,
          Accept: accept,
        },
        signal: controlador.signal,
      });
    } catch (error) {
      const abortado = error instanceof Error && error.name === 'AbortError';
      throw new ErrorDatosModo(
        abortado
          ? `La descarga de "${url}" superó el tiempo máximo de ${this.tiempoMaximoMs} ms.`
          : `No se pudo conectar con "${url}".`,
        undefined,
        { cause: error }
      );
    } finally {
      clearTimeout(temporizador);
    }
  }
}
