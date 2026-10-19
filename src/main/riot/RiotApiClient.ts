/**
 * Cliente de la Riot Games API oficial (T-3.4).
 *
 * Cubre los servicios usados por Itero Local:
 *  - Account-V1 (cuenta por Riot ID, enrutamiento regional)
 *  - Summoner-V4 (datos del invocador, enrutamiento de plataforma)
 *  - League-V4 (entradas de rango)
 *  - Champion-Mastery-V4 (maestrías, por PUUID)
 *  - Match-V5 (historial y detalle de partidas, enrutamiento regional)
 *  - STATUS-V4 (salud del servicio, usado para validar la clave de 24 h)
 *
 * Todas las peticiones pasan por un `IRateLimiter` inyectable y cada respuesta
 * se reporta con `reportResult()` (incluido `Retry-After` en 429). Un 401/403
 * se interpreta como clave caducada (las claves de desarrollo duran 24 h).
 *
 * El endpoint de salud no recibe plataforma en el contrato; se usa la
 * configurada en `plataformaSalud` (por defecto `la1`). Ver REQ-004.
 */

import { crearRateLimiterRiot } from '../ratelimit/RateLimiter';
import type { IRateLimiter, IRiotApiClient, KeyHealthStatus } from '@shared/contracts';
import type {
  ChampionMasteryDto,
  MatchDto,
  PlatformRouting,
  RankedEntryDto,
  RegionalRouting,
  RiotAccountDto,
  RiotSummonerDto,
} from '@shared/types';

export type { KeyHealthStatus };

/** Error genérico de la Riot API (HTTP o red/timeout). */
export class ErrorRiotApi extends Error {
  constructor(
    mensaje: string,
    readonly codigoEstado: number,
    readonly cuerpo: string
  ) {
    super(mensaje);
    this.name = 'ErrorRiotApi';
  }
}

/** Error lanzado al usar el cliente sin una clave configurada. */
export class ErrorClaveRiotFaltante extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorClaveRiotFaltante';
  }
}

export interface OpcionesRiotApiClient {
  /** Limitador de tasa compartido; por defecto se crea uno propio con los límites de Riot. */
  rateLimiter?: IRateLimiter;
  /** Implementación de `fetch` (pruebas); por defecto la global. */
  fetchImpl?: typeof fetch;
  /** Timeout por petición en milisegundos (por defecto 10 s). */
  timeoutMs?: number;
  /** Constructor de URL regional (americas/asia/europe/sea). */
  urlRegional?: (regional: RegionalRouting) => string;
  /** Constructor de URL de plataforma (la1/na1/euw1/...). */
  urlPlataforma?: (platform: PlatformRouting) => string;
  /** Plataforma usada para el chequeo de salud de la clave (por defecto `la1`). */
  plataformaSalud?: PlatformRouting;
}

/** Cantidad máxima de partidas que permite Match-V5 por página. */
export const MAX_PARTIDAS_HISTORIAL = 100;

const TIMEOUT_POR_DEFECTO_MS = 10_000;

function urlRegionalPorDefecto(regional: RegionalRouting): string {
  return `https://${regional}.api.riotgames.com`;
}

function urlPlataformaPorDefecto(platform: PlatformRouting): string {
  return `https://${platform}.api.riotgames.com`;
}

/** Lee la cabecera `Retry-After` (en segundos) si está presente y es numérica. */
function leerRetryAfter(respuesta: Response): number | undefined {
  const valor = respuesta.headers.get('retry-after');
  if (!valor) return undefined;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : undefined;
}

export class RiotApiClient implements IRiotApiClient {
  private readonly rateLimiter: IRateLimiter;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly construirUrlRegional: (regional: RegionalRouting) => string;
  private readonly construirUrlPlataforma: (platform: PlatformRouting) => string;
  private readonly plataformaSalud: PlatformRouting;
  private claveApi: string | null = null;

  constructor(opciones: OpcionesRiotApiClient = {}) {
    this.rateLimiter = opciones.rateLimiter ?? crearRateLimiterRiot();
    this.fetchImpl = opciones.fetchImpl ?? fetch;
    this.timeoutMs = opciones.timeoutMs ?? TIMEOUT_POR_DEFECTO_MS;
    this.construirUrlRegional = opciones.urlRegional ?? urlRegionalPorDefecto;
    this.construirUrlPlataforma = opciones.urlPlataforma ?? urlPlataformaPorDefecto;
    this.plataformaSalud = opciones.plataformaSalud ?? 'la1';
  }

  /** Configura la clave de la API (se recorta). Lanza si queda vacía. */
  setApiKey(key: string): void {
    const limpia = typeof key === 'string' ? key.trim() : '';
    if (!limpia) {
      throw new ErrorClaveRiotFaltante('La clave de Riot no puede estar vacía.');
    }
    this.claveApi = limpia;
  }

  // ---------- Account-V1 (regional) ----------

  getAccountByRiotId(
    gameName: string,
    tagLine: string,
    regional: RegionalRouting
  ): Promise<RiotAccountDto> {
    const url = `${this.construirUrlRegional(regional)}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
      gameName
    )}/${encodeURIComponent(tagLine)}`;
    return this.peticion<RiotAccountDto>(url);
  }

  // ---------- Summoner-V4 (plataforma) ----------

  getSummonerByPuuid(puuid: string, platform: PlatformRouting): Promise<RiotSummonerDto> {
    const url = `${this.construirUrlPlataforma(platform)}/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(
      puuid
    )}`;
    return this.peticion<RiotSummonerDto>(url);
  }

  // ---------- League-V4 (plataforma) ----------

  getRankedEntries(summonerId: string, platform: PlatformRouting): Promise<RankedEntryDto[]> {
    const url = `${this.construirUrlPlataforma(
      platform
    )}/lol/league/v4/entries/by-summoner/${encodeURIComponent(summonerId)}`;
    return this.peticion<RankedEntryDto[]>(url);
  }

  // ---------- Champion-Mastery-V4 (plataforma) ----------

  getChampionMasteries(puuid: string, platform: PlatformRouting): Promise<ChampionMasteryDto[]> {
    const url = `${this.construirUrlPlataforma(
      platform
    )}/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(puuid)}`;
    return this.peticion<ChampionMasteryDto[]>(url);
  }

  // ---------- Match-V5 (regional) ----------

  getMatchHistory(puuid: string, regional: RegionalRouting, count = 20): Promise<string[]> {
    const cantidad = Number.isFinite(count)
      ? Math.min(MAX_PARTIDAS_HISTORIAL, Math.max(1, Math.floor(count)))
      : 20;
    const url = `${this.construirUrlRegional(
      regional
    )}/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=0&count=${cantidad}`;
    return this.peticion<string[]>(url);
  }

  getMatchById(matchId: string, regional: RegionalRouting): Promise<MatchDto> {
    const url = `${this.construirUrlRegional(regional)}/lol/match/v5/matches/${encodeURIComponent(matchId)}`;
    return this.peticion<MatchDto>(url);
  }

  // ---------- Salud de la clave (STATUS-V4) ----------

  /**
   * Comprueba la validez de la clave contra STATUS-V4. Un 401/403 marca
   * `isExpired` (claves de desarrollo de 24 h). Nunca lanza.
   */
  async checkKeyHealth(): Promise<KeyHealthStatus> {
    const url = `${this.construirUrlPlataforma(this.plataformaSalud)}/lol/status/v4/platform-data`;

    try {
      await this.peticion<unknown>(url);
      return { valid: true, statusCode: 200, isExpired: false, lastChecked: Date.now() };
    } catch (error) {
      if (error instanceof ErrorRiotApi) {
        return {
          valid: false,
          statusCode: error.codigoEstado,
          isExpired: error.codigoEstado === 401 || error.codigoEstado === 403,
          lastChecked: Date.now(),
        };
      }
      return { valid: false, statusCode: undefined, isExpired: false, lastChecked: Date.now() };
    }
  }

  // ---------- Internos ----------

  /** Ejecuta una petición GET autenticada pasando por el limitador de tasa. */
  private async peticion<T>(url: string): Promise<T> {
    const clave = this.claveApi;
    if (!clave) {
      throw new ErrorClaveRiotFaltante(
        'No hay clave de Riot configurada. Usa setApiKey() antes de llamar a la API.'
      );
    }

    await this.rateLimiter.acquire();

    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), this.timeoutMs);
    temporizador.unref?.();

    let respuesta: Response;
    try {
      respuesta = await this.fetchImpl(url, {
        method: 'GET',
        headers: { 'X-Riot-Token': clave, Accept: 'application/json' },
        signal: controlador.signal,
      });
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      const expiro = controlador.signal.aborted;
      throw new ErrorRiotApi(
        expiro
          ? `La petición a ${url} superó el timeout de ${this.timeoutMs} ms.`
          : `Error de red al llamar a ${url}: ${detalle}`,
        expiro ? 408 : 0,
        detalle
      );
    } finally {
      clearTimeout(temporizador);
    }

    this.rateLimiter.reportResult(respuesta.status, leerRetryAfter(respuesta));

    if (respuesta.status === 204) {
      return undefined as T;
    }

    const texto = await respuesta.text();

    if (!respuesta.ok) {
      const cuerpo = texto.slice(0, 300);
      throw new ErrorRiotApi(
        `La Riot API respondió ${respuesta.status} en ${url}: ${cuerpo}`,
        respuesta.status,
        texto
      );
    }

    try {
      return JSON.parse(texto) as T;
    } catch {
      throw new ErrorRiotApi(
        `La Riot API respondió contenido no JSON (${respuesta.status}) en ${url}.`,
        respuesta.status,
        texto.slice(0, 300)
      );
    }
  }
}
