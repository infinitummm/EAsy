/**
 * Cliente de la Live Client Data API local (T-8.2).
 *
 * La API que expone el juego mientras hay una partida activa escucha en
 * `https://127.0.0.1:2999` con un certificado autofirmado. Este cliente:
 *
 *  - Acepta ese certificado únicamente cuando el destino es local
 *    (`127.0.0.1`, `localhost` o `::1`), sin desactivar la validación TLS para
 *    hosts remotos.
 *  - Consulta `/liveclientdata/activeplayer` y `/liveclientdata/allgamedata`
 *    con un tiempo máximo configurable y devolviendo `null`/`false` cuando no
 *    hay partida (la API no responde).
 *  - Completa el campeón del jugador activo con `allPlayers`, porque
 *    `/activeplayer` no incluye `championName` en todas las versiones del
 *    cliente.
 *  - Detecta el modo de juego a partir de la cola del Gameflow de la LCU:
 *    cola 2400 → ARAM Caos (`aram_mayhem`) y cola 1700 → Arena.
 *
 * No forma parte del contrato de `src/shared/contracts.ts` la detección de
 * modo, pero el criterio de terminado de T-8.2 la exige; se expone como
 * funciones puras del módulo para que OverlayManager pueda reutilizarlas.
 */

import https from 'node:https';
import type { ILcuClient, ILiveClientDataClient } from '@shared/contracts';
import type { TipoModo } from '@shared/types';
import { getChampionById } from '@shared/champions';
import { registrarLog } from './LcuDetector';

/** URL por defecto de la API local del juego. */
export const URL_BASE_LIVE_CLIENT_DATA = 'https://127.0.0.1:2999';

/** Rutas oficiales de la Live Client Data API. */
export const RUTA_ACTIVE_PLAYER = '/liveclientdata/activeplayer';
export const RUTA_ALL_GAME_DATA = '/liveclientdata/allgamedata';

/** Tamaño máximo de respuesta aceptado (la partida completa ronda 2-4 MiB). */
const TAMANO_MAXIMO_RESPUESTA_BYTES = 16 * 1024 * 1024;

/** Tipo mínimo del cliente LCU necesario para consultar el Gameflow. */
export type ClienteLcuGameflow = Pick<ILcuClient, 'request'>;

/** Error de comunicación con la Live Client Data API. */
export class ErrorLiveClientData extends Error {
  constructor(
    mensaje: string,
    readonly codigoEstado?: number,
    opciones?: ErrorOptions
  ) {
    super(mensaje, opciones);
    this.name = 'ErrorLiveClientData';
  }
}

/** Opciones del cliente (pensadas para pruebas y para el cableado de T-8.5). */
export interface OpcionesLiveClientDataClient {
  /** Base HTTPS; por defecto `https://127.0.0.1:2999`. */
  baseUrl?: string;
  /** Tiempo máximo por petición; por defecto 2500 ms. */
  tiempoMaximoMs?: number;
  /** Registro de avisos; por defecto usa el log de la LCU. */
  registrar?: (mensaje: string) => void;
}

/** Instantánea combinada útil para el sondeo del overlay. */
export interface InstantaneaLiveClientData {
  activo: boolean;
  jugador: { summonerName: string; championName: string } | null;
  level?: number;
  isDead?: boolean;
  gameTime?: number;
  datos: any | null;
  modo: TipoModo | null;
  capturadoEn: number;
}

/** Respuesta HTTP cruda usada internamente. */
interface RespuestaHttpCruda {
  codigoEstado: number;
  cuerpo: string;
}

/** Forma parcial (y defensiva) de la sesión de Gameflow de la LCU. */
interface SesionGameflow {
  gameData?: {
    queue?: { id?: number | string } | null;
    gameMode?: string | null;
  } | null;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function leerTexto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const texto = valor.trim();
  return texto.length > 0 ? texto : null;
}

/** Indica si un host es local (el único caso en el que se acepta el certificado autofirmado). */
export function esHostLocal(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

/**
 * Traduce el ID de cola de la LCU al modo de dominio:
 *  - 2400 -> 'aram_mayhem' (ARAM Caos)
 *  - 1700, 1710, 1750 -> 'arena' (Arena 2v2v2v2 / 3x6)
 *  - 450 -> 'aram' (ARAM normal)
 *  - 420, 440 -> 'ranked' (Clasificatoria Solo/Duo y Flexible)
 *  - 400, 430, 490, 830, 840, 850 -> 'normal' (Partida normal en la Grieta)
 */
export function detectarModoPorCola(idCola: number | string | null | undefined): TipoModo | null {
  const id = Number(idCola);
  if (!Number.isFinite(id)) return null;

  switch (id) {
    case 2400:
      return 'aram_mayhem';
    case 1700:
    case 1710:
    case 1750:
      return 'arena';
    case 450:
      return 'aram';
    case 420:
    case 440:
      return 'ranked';
    case 400: // Normal Reclutamiento (Draft Pick)
    case 430: // Normal Selección Oculta (Blind Pick)
    case 490: // Normal Partida Rápida (Quickplay)
    case 830:
    case 840:
    case 850: // Co-op vs IA
      return 'normal';
    default:
      return null;
  }
}

/**
 * Detecta el modo a partir de la sesión de Gameflow de la LCU.
 * Prioriza el ID de cola y, si no está en la tabla directa, inspecciona descripciones,
 * nombres de cola, tipo de mapa e indicador gameMode.
 */
export function detectarModoPorSesion(sesion: any): TipoModo | null {
  if (!sesion) return null;

  // 1. Prioridad por ID de cola
  const idCola = sesion?.gameData?.queue?.id ?? sesion?.gameData?.gameQueueConfigId;
  const porCola = detectarModoPorCola(idCola);
  if (porCola) return porCola;

  // 2. Comprobar descripciones y nombres de cola
  const descQueue = (
    sesion?.gameData?.queue?.description ??
    sesion?.gameData?.queue?.name ??
    sesion?.gameData?.queue?.shortName ??
    ''
  ).toLowerCase();

  if (descQueue.includes('arena') || descQueue.includes('cherry')) return 'arena';
  if (descQueue.includes('mayhem') || descQueue.includes('caos')) return 'aram_mayhem';
  if (descQueue.includes('aram')) return 'aram';

  // 3. Comprobar identificadores de modo y mapa
  const modoTexto = (
    sesion?.gameData?.queue?.gameMode ??
    sesion?.gameData?.queue?.type ??
    sesion?.gameData?.gameMode ??
    sesion?.map?.gameMode ??
    sesion?.map?.gameModeName ??
    ''
  ).toUpperCase();

  const mapId = Number(sesion?.map?.id ?? sesion?.gameData?.queue?.mapId);

  if (modoTexto === 'CHERRY' || mapId === 30) return 'arena';
  if (modoTexto === 'ARAM_MAYHEM' || modoTexto === 'MAYHEM') return 'aram_mayhem';
  if (modoTexto === 'ARAM' || mapId === 12) {
    const mutator = (sesion?.gameData?.queue?.assetMutator ?? sesion?.map?.gameMutator ?? '').toLowerCase();
    if (mutator.includes('mayhem') || descQueue.includes('mayhem') || descQueue.includes('caos')) {
      return 'aram_mayhem';
    }
    return 'aram';
  }

  if (modoTexto === 'CLASSIC' || mapId === 11) {
    if (idCola === 420 || idCola === 440) return 'ranked';
    return 'normal';
  }

  return null;
}

/**
 * Consulta la LCU para determinar el modo de juego actual.
 * Inspecciona `/lol-gameflow/v1/session` y, como respaldo si no hay partida en curso,
 * consulta `/lol-lobby/v1/lobby` para saber qué modo tiene seleccionado el jugador.
 */
export async function detectarModoEnLcu(
  lcu: ClienteLcuGameflow,
  registrar: (mensaje: string) => void = registrarLog
): Promise<TipoModo | null> {
  try {
    const sesion = await lcu.request<any>('GET', '/lol-gameflow/v1/session');
    const modo = detectarModoPorSesion(sesion);
    if (modo) return modo;
  } catch (error) {
    registrar(
      `[LiveClientData] No se pudo consultar el Gameflow de la LCU: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  try {
    const lobby = await lcu.request<any>('GET', '/lol-lobby/v1/lobby');
    const idCola = lobby?.gameConfig?.queueId;
    const modoLobby = detectarModoPorCola(idCola);
    if (modoLobby) return modoLobby;

    const descLobby = (lobby?.gameConfig?.gameMode ?? '').toUpperCase();
    if (descLobby === 'CHERRY') return 'arena';
    if (descLobby === 'ARAM') return 'aram';
    if (descLobby === 'CLASSIC') {
      if (idCola === 420 || idCola === 440) return 'ranked';
      return 'normal';
    }
  } catch {}

  return null;
}

/**
 * Construye el jugador activo combinando ambos endpoints. `activeplayer` aporta
 * el nombre del invocador y `allgamedata.allPlayers` el campeón elegido.
 */
function construirJugadorActivo(
  activePlayer: unknown,
  allGameData: unknown
): { summonerName: string; championName: string } | null {
  const activo = esObjeto(activePlayer) ? activePlayer : null;
  const datos = esObjeto(allGameData) ? allGameData : null;
  const activoEnDatos = datos && esObjeto(datos.activePlayer) ? datos.activePlayer : null;

  const summonerName =
    leerTexto(activo?.summonerName) ?? leerTexto(activoEnDatos?.summonerName);

  if (!summonerName) return null;

  let championName = leerTexto(activo?.championName) ?? leerTexto(activoEnDatos?.championName);

  if (!championName && datos && Array.isArray(datos.allPlayers)) {
    const jugador = datos.allPlayers.find(
      (candidato) => esObjeto(candidato) && leerTexto(candidato.summonerName) === summonerName
    );
    if (esObjeto(jugador)) {
      championName = leerTexto(jugador.championName) ?? leerTexto(jugador.rawChampionName);
    }
  }

  if (!championName) return null;
  return { summonerName, championName };
}

/**
 * Cliente de la API local del juego. Implementa el contrato
 * `ILiveClientDataClient` y añade `obtenerInstantanea()` para el sondeo
 * periódico que hará el overlay.
 */
export class LiveClientDataClient implements ILiveClientDataClient {
  private readonly baseUrl: URL;
  private readonly tiempoMaximoMs: number;
  private readonly registrar: (mensaje: string) => void;

  constructor(opciones: OpcionesLiveClientDataClient = {}) {
    const baseUrl = new URL(opciones.baseUrl ?? URL_BASE_LIVE_CLIENT_DATA);
    if (baseUrl.protocol !== 'https:') {
      throw new ErrorLiveClientData('La Live Client Data API debe usar HTTPS.');
    }

    this.baseUrl = new URL(baseUrl.toString().replace(/\/+$/, ''));
    this.tiempoMaximoMs = Math.max(100, opciones.tiempoMaximoMs ?? 2500);
    this.registrar = opciones.registrar ?? registrarLog;
  }

  /** `true` si el endpoint de jugador activo responde HTTP 200 (hay partida). */
  async isGameActive(): Promise<boolean> {
    try {
      const respuesta = await this.solicitar(RUTA_ACTIVE_PLAYER);
      return respuesta.codigoEstado === 200;
    } catch {
      return false;
    }
  }

  /** Jugador y campeón activos, o `null` si aún no hay partida. */
  async getActivePlayer(): Promise<{ summonerName: string; championName: string } | null> {
    const [activePlayer, allGameData] = await Promise.all([
      this.obtenerJson(RUTA_ACTIVE_PLAYER),
      this.obtenerJson(RUTA_ALL_GAME_DATA),
    ]);

    return construirJugadorActivo(activePlayer, allGameData);
  }

  /** Payload completo de `/allgamedata`, o `null` si no hay partida. */
  async getAllGameData(): Promise<any | null> {
    const datos = await this.obtenerJson(RUTA_ALL_GAME_DATA);
    return esObjeto(datos) ? datos : null;
  }

  /**
   * Sondeo combinado para el overlay: una sola pasada consulta el jugador, los
   * datos completos y (si se pasa) el modo de la LCU.
   */
  async obtenerInstantanea(lcu?: ClienteLcuGameflow): Promise<InstantaneaLiveClientData> {
    const [activePlayer, allGameData, modo] = await Promise.all([
      this.obtenerJson(RUTA_ACTIVE_PLAYER),
      this.obtenerJson(RUTA_ALL_GAME_DATA),
      lcu ? detectarModoEnLcu(lcu, this.registrar) : Promise.resolve(null),
    ]);

    const jugador = construirJugadorActivo(activePlayer, allGameData);

    const activo = esObjeto(activePlayer) ? activePlayer : null;
    const datos = esObjeto(allGameData) ? allGameData : null;
    let jugadorEnLista: Record<string, unknown> | null = null;
    if (datos && Array.isArray(datos.allPlayers) && jugador?.summonerName) {
      const match = datos.allPlayers.find(
        (p) => esObjeto(p) && p.summonerName === jugador.summonerName
      );
      if (esObjeto(match)) jugadorEnLista = match;
    }

    const levelVal = Number(activo?.level ?? jugadorEnLista?.level);
    const isDeadVal = jugadorEnLista && typeof jugadorEnLista.isDead === 'boolean' ? jugadorEnLista.isDead : undefined;

    return {
      activo: jugador !== null || esObjeto(activePlayer) || esObjeto(allGameData),
      jugador,
      level: Number.isFinite(levelVal) && levelVal > 0 ? levelVal : undefined,
      isDead: isDeadVal,
      datos: esObjeto(allGameData) ? allGameData : null,
      modo,
      gameTime:
        esObjeto(allGameData) && esObjeto(allGameData.gameStats)
          ? Number(allGameData.gameStats.gameTime)
          : undefined,
      capturadoEn: Date.now(),
    };
  }

  /** Realiza una petición GET y valida la respuesta HTTP. */
  private solicitar(ruta: string): Promise<RespuestaHttpCruda> {
    const url = new URL(ruta, `${this.baseUrl.toString()}/`);

    return new Promise<RespuestaHttpCruda>((resolve, reject) => {
      const peticion = https.request(
        url,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Cache-Control': 'no-store',
          },
          // El certificado del juego es autofirmado; solo se relaja la
          // validación para hosts locales, nunca para un host remoto.
          rejectUnauthorized: !esHostLocal(url.hostname),
          agent: false,
          timeout: this.tiempoMaximoMs,
        },
        (respuesta) => {
          const trozos: Buffer[] = [];
          let bytes = 0;

          respuesta.on('data', (trozo: Buffer) => {
            bytes += trozo.length;
            if (bytes > TAMANO_MAXIMO_RESPUESTA_BYTES) {
              peticion.destroy(
                new ErrorLiveClientData('La respuesta de la Live Client Data API es demasiado grande.')
              );
              return;
            }
            trozos.push(trozo);
          });

          respuesta.on('error', (error) => {
            reject(
              new ErrorLiveClientData('Se interrumpió la respuesta de la Live Client Data API.', undefined, {
                cause: error,
              })
            );
          });

          respuesta.on('end', () => {
            resolve({
              codigoEstado: respuesta.statusCode ?? 0,
              cuerpo: Buffer.concat(trozos).toString('utf8'),
            });
          });
        }
      );

      peticion.on('timeout', () => {
        peticion.destroy(
          new ErrorLiveClientData(
            `La Live Client Data API no respondió en ${this.tiempoMaximoMs} ms.`
          )
        );
      });

      peticion.on('error', (error) => {
        reject(
          error instanceof ErrorLiveClientData
            ? error
            : new ErrorLiveClientData(
                'No se pudo conectar con la Live Client Data API local.',
                undefined,
                { cause: error }
              )
        );
      });

      peticion.end();
    });
  }

  /** Petición JSON tolerante a fallos: cualquier error se traduce en `null`. */
  private async obtenerJson(ruta: string): Promise<unknown | null> {
    try {
      const respuesta = await this.solicitar(ruta);
      if (respuesta.codigoEstado < 200 || respuesta.codigoEstado >= 300) {
        return null;
      }
      return JSON.parse(respuesta.cuerpo) as unknown;
    } catch {
      return null;
    }
  }
}

/**
 * Resuelve el campeón del jugador local directamente desde la LCU.
 * Funciona de forma inmediata tanto en ChampSelect, InProgress y PreEndOfGame,
 * sin depender de que la Live Client Data API haya iniciado todavía.
 */
export async function resolverCampeonLocalLcu(
  lcu: ClienteLcuGameflow,
  registrar: (mensaje: string) => void = registrarLog
): Promise<{ championId: number; championName: string } | null> {
  let localPuuid: string | null = null;
  let localSummonerId: number | null = null;
  try {
    const summoner = await lcu.request<any>('GET', '/lol-summoner/v1/current-summoner');
    if (summoner?.puuid) localPuuid = summoner.puuid;
    if (summoner?.summonerId) localSummonerId = Number(summoner.summonerId);
  } catch {}

  try {
    const gfSession = await lcu.request<any>('GET', '/lol-gameflow/v1/session');

    // 1. Buscar en playerChampionSelections por PUUID
    if (localPuuid && Array.isArray(gfSession?.gameData?.playerChampionSelections)) {
      const match = gfSession.gameData.playerChampionSelections.find(
        (p: any) => p?.puuid && p.puuid === localPuuid
      );
      const cId = Number(match?.championId);
      if (Number.isFinite(cId) && cId > 0) {
        const champ = getChampionById(cId);
        return { championId: cId, championName: champ?.name || `Campeón ${cId}` };
      }
    }

    // 2. Buscar en teamOne o teamTwo (común en Arena y colas personalizadas)
    const teams = [...(gfSession?.gameData?.teamOne ?? []), ...(gfSession?.gameData?.teamTwo ?? [])];
    const matchTeam = teams.find(
      (p: any) => (localPuuid && p?.puuid === localPuuid) || (localSummonerId && p?.summonerId === localSummonerId)
    );
    const cIdTeam = Number(matchTeam?.championId);
    if (Number.isFinite(cIdTeam) && cIdTeam > 0) {
      const champ = getChampionById(cIdTeam);
      return { championId: cIdTeam, championName: champ?.name || `Campeón ${cIdTeam}` };
    }
  } catch {}

  // 3. Respaldo: sesión de Champ Select
  try {
    const csSession = await lcu.request<any>('GET', '/lol-champ-select/v1/session');
    const localCell = csSession?.localPlayerCellId;
    const allCells = [...(csSession?.myTeam ?? []), ...(csSession?.theirTeam ?? [])];
    const local = allCells.find((p: any) => p?.cellId === localCell);
    const cId = Number(local?.championId || local?.championPickIntent);
    if (Number.isFinite(cId) && cId > 0) {
      const champ = getChampionById(cId);
      return { championId: cId, championName: champ?.name || `Campeón ${cId}` };
    }
  } catch {}

  return null;
}
