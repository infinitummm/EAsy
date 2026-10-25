/**
 * Cliente LCU unificado de Itero Local.
 *
 * Integra la detección/lectura del lockfile, el cliente HTTPS local, el cliente
 * WebSocket de eventos y el servicio de Auto-Accept en un solo componente que
 * implementa el contrato `ILcuClient` definido en `src/shared/contracts.ts`.
 *
 * Eventos emitidos (ver `EVENTOS_LCU_CLIENT`):
 * - `estado-cambiado`: `LcuConnectionState`.
 * - `gameflow-cambiado`: `GameflowPhase`.
 * - `ready-check`: `ReadyCheckEvent`.
 * - `champ-select-session`: `ChampSelectSession | null`.
 * - `ready-check-aceptado`: sin payload.
 * - `auto-accept-status`: `EstadoAutoAccept` (estado vivo del Auto-Accept y del polling).
 * - `error-lcu`: `Error`.
 *
 * Además del evento WebSocket, se ejecuta un polling HTTP de respaldo cada
 * segundo contra `/lol-matchmaking/v1/ready-check` mientras la fase de gameflow
 * sea `Matchmaking` o `ReadyCheck` (REQ-010), de modo que el Auto-Accept
 * funcione aunque la LCU no emita el evento de ReadyCheck por WebSocket.
 */

import { EventEmitter } from 'node:events';
import https from 'node:https';
import WebSocket from 'ws';
import type { ILcuClient } from '@shared/contracts';
import type {
  ChampSelectSession,
  ChampSelectAction,
  GameflowPhase,
  LcuConnectionState,
  LcuCredentials,
  ReadyCheckEvent,
  RunePage,
  LcuDetectionReport,
  LcuConnectionStepDetail,
} from '@shared/types';
import { LCU_CONSTANTS } from '@shared/constants';
import { buscarLockfile, leerLockfile, type ResultadoBusquedaLockfile } from './lockfile';
import { ErrorPeticionLcu, LcuHttpClient, type MetodoHttp } from './LcuHttpClient';
import { LcuWebSocket, type EventoLcu, type OpcionesLcuWebSocket, MENSAJE_SUSCRIPCION_LCU } from './LcuWebSocket';
import { AutoAcceptService, type OpcionesAutoAcceptService } from './AutoAcceptService';
import { ejecutarDeteccionLcu, registrarLog } from './LcuDetector';

/** Nombres de los eventos emitidos por `LcuClient`. */
export const EVENTOS_LCU_CLIENT = {
  ESTADO_CAMBIADO: 'estado-cambiado',
  GAMEFLOW_CAMBIADO: 'gameflow-cambiado',
  READY_CHECK: 'ready-check',
  CHAMP_SELECT_SESSION: 'champ-select-session',
  READY_CHECK_ACEPTADO: 'ready-check-aceptado',
  AUTO_ACCEPT_STATUS: 'auto-accept-status',
  ERROR_LCU: 'error-lcu',
  ERROR_PERMISOS: 'error-permisos',
} as const;

/** Endpoints de la LCU utilizados por el cliente. */
export const ENDPOINTS_LCU = {
  GAMEFLOW_PHASE: '/lol-gameflow/v1/gameflow-phase',
  READY_CHECK: '/lol-matchmaking/v1/ready-check',
  READY_CHECK_ACCEPT: '/lol-matchmaking/v1/ready-check/accept',
  CHAMP_SELECT_SESSION: '/lol-champ-select/v1/session',
  CHAMP_SELECT_ACTIONS: '/lol-champ-select/v1/session/actions',
  CHAMP_SELECT_MY_SELECTION: '/lol-champ-select/v1/session/my-selection',
  PICKABLE_CHAMPION_IDS: '/lol-champ-select/v1/pickable-champion-ids',
  BANNABLE_CHAMPION_IDS: '/lol-champ-select/v1/bannable-champion-ids',
  CHAMPION_SUMMARY: '/lol-game-data/assets/v1/champion-summary.json',
  RUNE_PAGES: '/lol-perks/v1/pages',
} as const;

/** Intervalo por defecto del polling de respaldo del ReadyCheck (REQ-010). */
export const INTERVALO_POLLING_READY_CHECK_MS = 1000;

/** Estado vivo del Auto-Accept expuesto a la UI (REQ-010). */
export interface EstadoAutoAccept {
  /** `true` si el Auto-Accept está habilitado por configuración. */
  habilitado: boolean;
  /** Retardo configurado en segundos (0-8). */
  retrasoSegundos: number;
  /** Fase de gameflow conocida en el momento del evento. */
  fase: GameflowPhase;
  /** `true` si el WebSocket de la LCU está conectado. */
  conectado: boolean;
  /** `true` si el polling HTTP de respaldo está activo. */
  pollingActivo: boolean;
  /** `true` si hay una aceptación agendada pendiente de enviarse. */
  aceptacionPendiente: boolean;
  /** Última acción realizada o estado del servicio para la UI. */
  lastAction?: string;
  /** Timestamp en ms de la última acción. */
  lastActionTimestamp?: number;
}

/** Resultado de intentar hacer hover de un campeón en Champ Select (REQ-012). */
export interface ResultadoHoverCampeon {
  success: boolean;
  /** ID de la acción local sobre la que se aplicó el hover. */
  actionId?: number;
  /** Campeón solicitado. */
  championId?: number;
  /** Mensaje descriptivo cuando el hover no pudo aplicarse o confirmarse. */
  error?: string;
}

/** Entrada normalizada de `champion-summary.json` (LCU o Community Dragon). */
export interface ResumenCampeonLcu {
  id: number;
  name: string;
  alias: string;
  squarePortraitPath: string;
}

/** Opciones de construcción del cliente LCU unificado. */
export interface OpcionesLcuClient extends Pick<OpcionesLcuWebSocket, 'reconectarAutomaticamente'> {
  /** Ruta fija del lockfile. Si se omite, se buscan las rutas candidatas por defecto. */
  rutaLockfile?: string;
  /** Función para obtener la ruta manual configurada por el usuario dinámicamente. */
  obtenerRutaManual?: () => string | undefined;
  /** Host de conexión. Por defecto `127.0.0.1`. */
  host?: string;
  /** Protocolo para las peticiones HTTP. Por defecto `https` (el real de la LCU). */
  protocoloHttp?: 'https' | 'http';
  /** Protocolo para el WebSocket. Por defecto `wss` (el real de la LCU). */
  protocoloWs?: 'wss' | 'ws';
  /** Intervalo entre comprobaciones del lockfile en milisegundos. Por defecto 3000 ms. */
  intervaloDeteccionMs?: number;
  /**
   * Intervalo del polling HTTP de respaldo del ReadyCheck en milisegundos.
   * Por defecto `INTERVALO_POLLING_READY_CHECK_MS` (1000 ms) según REQ-010.
   */
  intervaloPollingReadyCheckMs?: number;
  /** Espera entre intentos de reconexión del WebSocket. Por defecto `LCU_CONSTANTS.RECONNECT_BACKOFF_MS`. */
  intervaloReconexionMs?: number;
  /** Tiempo máximo por petición HTTP. Por defecto 10000 ms. */
  timeoutHttpMs?: number;
  /** Tiempo máximo de espera del handshake WebSocket. Por defecto 10000 ms. */
  timeoutConexionWsMs?: number;
  /** Opciones iniciales del servicio de Auto-Accept. */
  autoAccept?: OpcionesAutoAcceptService;
}

const FASES_GAMEFLOW: readonly GameflowPhase[] = [
  'None',
  'Lobby',
  'Matchmaking',
  'ReadyCheck',
  'ChampSelect',
  'InProgress',
  'WaitingForStats',
  'PreEndOfGame',
  'WatchInProgress',
];

/** Valida que un valor corresponda a una fase de gameflow conocida. */
export function normalizarFaseGameflow(datos: unknown): GameflowPhase | null {
  if (typeof datos !== 'string') {
    return null;
  }
  return (FASES_GAMEFLOW as readonly string[]).includes(datos) ? (datos as GameflowPhase) : null;
}

/** Normaliza el payload del endpoint de ReadyCheck; devuelve `null` si no es válido. */
export function normalizarReadyCheck(datos: unknown): ReadyCheckEvent | null {
  if (!datos || typeof datos !== 'object') {
    return null;
  }
  const parcial = datos as Partial<ReadyCheckEvent>;
  if (typeof parcial.state !== 'string' || typeof parcial.playerResponse !== 'string') {
    return null;
  }
  return {
    state: parcial.state as ReadyCheckEvent['state'],
    playerResponse: parcial.playerResponse as ReadyCheckEvent['playerResponse'],
    suppressCountdown: Boolean(parcial.suppressCountdown),
    timer: typeof parcial.timer === 'number' ? parcial.timer : 0,
  };
}

/** Valida una página de runas: exactamente 9 perks y estilos numéricos. */
export function validarPaginaRunas(pagina: RunePage): string | null {
  if (!pagina || typeof pagina !== 'object') {
    return 'La página de runas es inválida.';
  }
  if (!pagina.name || typeof pagina.name !== 'string') {
    return 'La página de runas requiere un nombre.';
  }
  if (!Number.isInteger(pagina.primaryStyleId) || !Number.isInteger(pagina.subStyleId)) {
    return 'La página de runas requiere primaryStyleId y subStyleId numéricos.';
  }
  if (!Array.isArray(pagina.selectedPerkIds) || pagina.selectedPerkIds.length !== 9) {
    return 'La página de runas debe contener exactamente 9 perks seleccionados.';
  }
  if (!pagina.selectedPerkIds.every((perk) => Number.isInteger(perk))) {
    return 'Todos los perks seleccionados deben ser identificadores numéricos.';
  }
  return null;
}

/** `true` si la fase de gameflow puede albergar un ReadyCheck activo (REQ-010). */
export function esFaseConReadyCheck(fase: GameflowPhase): boolean {
  return fase === 'Matchmaking' || fase === 'ReadyCheck';
}

/**
 * Compara dos ReadyCheck por su estado relevante (`state` + `playerResponse`).
 * El `timer` se ignora para poder deduplicar el polling de respaldo sin inundar
 * de eventos a la UI cada segundo.
 */
export function sonReadyChecksEquivalentes(
  a: ReadyCheckEvent | null,
  b: ReadyCheckEvent | null
): boolean {
  if (!a || !b) {
    return a === b;
  }
  return a.state === b.state && a.playerResponse === b.playerResponse;
}

/** Normaliza la lista de IDs elegibles devuelta por `pickable-champion-ids`. */
export function normalizarIdsCampeones(datos: unknown): number[] {
  if (!Array.isArray(datos)) {
    return [];
  }
  const ids = datos.filter(
    (valor): valor is number => Number.isInteger(valor) && (valor as number) > 0
  );
  return [...new Set(ids)];
}

/** Normaliza `champion-summary.json` (LCU o Community Dragon) a entradas tipadas. */
export function normalizarResumenCampeonesLcu(datos: unknown): ResumenCampeonLcu[] {
  if (!Array.isArray(datos)) {
    return [];
  }

  const campeones: ResumenCampeonLcu[] = [];
  for (const entrada of datos) {
    if (!entrada || typeof entrada !== 'object') {
      continue;
    }
    const parcial = entrada as Record<string, unknown>;
    const id = Number(parcial.id);
    if (!Number.isInteger(id) || id <= 0) {
      continue;
    }
    const name = typeof parcial.name === 'string' ? parcial.name.trim() : '';
    const alias = typeof parcial.alias === 'string' ? parcial.alias.trim() : '';
    campeones.push({
      id,
      name: name || alias,
      alias: alias || name,
      squarePortraitPath:
        typeof parcial.squarePortraitPath === 'string' ? parcial.squarePortraitPath.trim() : '',
    });
  }
  return campeones;
}

/** Busca la acción de pick activa y pendiente del jugador local (REQ-012). */
export function buscarAccionPickLocal(sesion: ChampSelectSession | null): ChampSelectAction | null {
  if (!sesion) {
    return null;
  }
  for (const fila of sesion.actions ?? []) {
    for (const accion of fila ?? []) {
      if (
        accion.actorCellId === sesion.localPlayerCellId &&
        accion.type === 'pick' &&
        Boolean(accion.isInProgress) &&
        !accion.completed
      ) {
        return accion;
      }
    }
  }
  return null;
}

/**
 * Cliente LCU unificado: detecta el lockfile, establece las conexiones HTTP/WS,
 * reenvía los eventos relevantes y acepta partidas automáticamente.
 */
export class LcuClient extends EventEmitter implements ILcuClient {
  private readonly opciones: Required<
    Pick<
      OpcionesLcuClient,
      | 'host'
      | 'protocoloHttp'
      | 'protocoloWs'
      | 'intervaloDeteccionMs'
      | 'intervaloPollingReadyCheckMs'
      | 'intervaloReconexionMs'
      | 'timeoutHttpMs'
      | 'timeoutConexionWsMs'
      | 'reconectarAutomaticamente'
    >
  > & { rutaLockfile?: string; obtenerRutaManual?: () => string | undefined };

  private readonly http: LcuHttpClient;
  private readonly ws: LcuWebSocket;
  private readonly autoAccept: AutoAcceptService;

  private estado: LcuConnectionState = 'disconnected';
  private fase: GameflowPhase = 'None';
  private credenciales: LcuCredentials | null = null;
  private errorPermisos = false;
  private ultimoReporte: LcuDetectionReport | null = null;
  private ultimoError: string | null = null;
  private activo = false;
  private conexionEnCurso = false;
  private temporizadorDeteccion: NodeJS.Timeout | null = null;
  private temporizadorPollingReadyCheck: NodeJS.Timeout | null = null;
  private pollingReadyCheckActivo = false;
  private ultimoReadyCheck: ReadyCheckEvent | null = null;
  private ultimaAccionAutoAccept = 'Inactivo';
  private ultimoTimestampAutoAccept = Date.now();

  constructor(opciones: OpcionesLcuClient = {}) {
    super();
    this.opciones = {
      rutaLockfile: opciones.rutaLockfile,
      obtenerRutaManual: opciones.obtenerRutaManual,
      host: opciones.host ?? '127.0.0.1',
      protocoloHttp: opciones.protocoloHttp ?? 'https',
      protocoloWs: opciones.protocoloWs ?? 'wss',
      intervaloDeteccionMs: opciones.intervaloDeteccionMs ?? 3000,
      intervaloPollingReadyCheckMs:
        opciones.intervaloPollingReadyCheckMs ?? INTERVALO_POLLING_READY_CHECK_MS,
      intervaloReconexionMs: opciones.intervaloReconexionMs ?? LCU_CONSTANTS.RECONNECT_BACKOFF_MS,
      timeoutHttpMs: opciones.timeoutHttpMs ?? 10_000,
      timeoutConexionWsMs: opciones.timeoutConexionWsMs ?? 10_000,
      reconectarAutomaticamente: opciones.reconectarAutomaticamente ?? true,
    };

    this.http = new LcuHttpClient(null, {
      host: this.opciones.host,
      protocolo: this.opciones.protocoloHttp,
      timeoutMs: this.opciones.timeoutHttpMs,
    });

    this.ws = new LcuWebSocket({
      host: this.opciones.host,
      protocolo: this.opciones.protocoloWs,
      reconectarAutomaticamente: this.opciones.reconectarAutomaticamente,
      intervaloReconexionMs: this.opciones.intervaloReconexionMs,
      timeoutConexionMs: this.opciones.timeoutConexionWsMs,
    });

    this.autoAccept = new AutoAcceptService(this, opciones.autoAccept);

    // Los oyentes se registran una sola vez en el constructor.
    this.ws.on('conectado', () => {
      this.cambiarEstado('connected');
      void this.refrescarFaseInicial();
    });
    this.ws.on('desconectado', (detalle: { manual: boolean }) => {
      if (!detalle.manual && this.activo) {
        this.cambiarEstado('connecting');
      }
    });
    this.ws.on('evento', (evento: EventoLcu) => this.procesarEvento(evento));
    this.ws.on('error-websocket', (error: Error) => this.emit(EVENTOS_LCU_CLIENT.ERROR_LCU, error));
    this.autoAccept.on('programado', ({ esperaMs }: { esperaMs: number }) => {
      this.ultimaAccionAutoAccept = `Aceptando en ${(esperaMs / 1000).toFixed(1)} s`;
      this.ultimoTimestampAutoAccept = Date.now();
      registrarLog(`[AutoAccept] Aceptación programada en ${Math.round(esperaMs)} ms.`);
      this.emitirEstadoAutoAccept();
    });
    this.autoAccept.on('aceptado', () => {
      this.ultimaAccionAutoAccept = 'Aceptado';
      this.ultimoTimestampAutoAccept = Date.now();
      registrarLog('[AutoAccept] ReadyCheck aceptado automáticamente.');
      this.emit(EVENTOS_LCU_CLIENT.READY_CHECK_ACEPTADO);
      this.emitirEstadoAutoAccept();
    });
    this.autoAccept.on('fallo-aceptacion', (error: Error) => {
      this.ultimaAccionAutoAccept = `Error: ${error.message}`;
      this.ultimoTimestampAutoAccept = Date.now();
      registrarLog(`[AutoAccept ERROR] Fallo al aceptar el ReadyCheck: ${error.message}`);
      this.emit(EVENTOS_LCU_CLIENT.ERROR_LCU, error);
      this.emitirEstadoAutoAccept();
    });
  }

  /**
   * Inicia la detección del cliente de League of Legends y establece las conexiones.
   * Resuelve tras el primer intento (aunque el cliente no esté abierto todavía).
   */
  async initialize(): Promise<void> {
    if (this.activo) {
      return;
    }
    this.activo = true;
    this.cambiarEstado('connecting');
    await this.intentarConexion();
    this.programarDeteccion();
  }

  /** Cierra las conexiones y detiene la detección automática. */
  disconnect(): void {
    this.activo = false;
    this.autoAccept.cancelar();
    this.limpiarDeteccion();
    this.detenerPollingReadyCheck();
    this.ultimoReadyCheck = null;
    this.ws.desconectar();
    this.http.actualizarCredenciales(null);
    this.credenciales = null;
    this.cambiarEstado('disconnected');
    this.emitirEstadoAutoAccept();
  }

  /** Devuelve el estado actual de la conexión con la LCU. */
  getConnectionState(): LcuConnectionState {
    return this.estado;
  }

  /** Devuelve la última fase de gameflow conocida. */
  getGameflowPhase(): GameflowPhase {
    return this.fase;
  }

  /** Ejecuta una petición HTTP genérica contra la LCU API. */
  async request<T>(method: MetodoHttp, endpoint: string, body?: unknown): Promise<T> {
    return this.http.request<T>(method, endpoint, body);
  }

  /** Acepta el ReadyCheck activo (`/lol-matchmaking/v1/ready-check/accept`). */
  async acceptReadyCheck(): Promise<void> {
    await this.http.request<unknown>('POST', ENDPOINTS_LCU.READY_CHECK_ACCEPT);
  }

  /** Activa/desactiva el Auto-Accept y, opcionalmente, ajusta el retardo (0-8 s). */
  setAutoAccept(enabled: boolean, delaySeconds?: number): void {
    this.autoAccept.configurar(enabled, delaySeconds);
    this.ultimaAccionAutoAccept = enabled ? 'Activo (esperando partida)' : 'Inactivo (desactivado)';
    this.ultimoTimestampAutoAccept = Date.now();
    registrarLog(
      `[AutoAccept] Configurado: habilitado=${enabled}, retraso=${this.autoAccept.obtenerRetrasoSegundos()}s.`
    );
    this.emitirEstadoAutoAccept();
  }

  /** Devuelve `true` si el Auto-Accept está habilitado. */
  isAutoAcceptEnabled(): boolean {
    return this.autoAccept.estaHabilitado();
  }

  /**
   * Devuelve el estado vivo del Auto-Accept (habilitado, retardo, fase,
   * conexión, polling y aceptación pendiente) para la UI (REQ-010).
   */
  getAutoAcceptStatus(): EstadoAutoAccept {
    return {
      habilitado: this.autoAccept.estaHabilitado(),
      retrasoSegundos: this.autoAccept.obtenerRetrasoSegundos(),
      fase: this.fase,
      conectado: this.estado === 'connected',
      pollingActivo: this.pollingReadyCheckActivo,
      aceptacionPendiente: this.autoAccept.hayAceptacionPendiente(),
      lastAction: this.ultimaAccionAutoAccept,
      lastActionTimestamp: this.ultimoTimestampAutoAccept,
    };
  }

  /** Inyecta (crea o sobrescribe) una página de runas en el cliente oficial. */
  async injectRunePage(page: RunePage): Promise<{ success: boolean; pageId?: number; error?: string }> {
    const errorValidacion = validarPaginaRunas(page);
    if (errorValidacion) {
      return { success: false, error: errorValidacion };
    }

    try {
      if (page.id !== undefined) {
        await this.http.request<RunePage>('PUT', `${ENDPOINTS_LCU.RUNE_PAGES}/${page.id}`, page);
        return { success: true, pageId: page.id };
      }
      const creada = await this.http.request<RunePage>('POST', ENDPOINTS_LCU.RUNE_PAGES, page);
      return { success: true, pageId: creada?.id };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Completa (o actualiza) la acción de pick del jugador local en Champ Select. */
  async selectChampion(actionId: number, championId: number, completed: boolean): Promise<void> {
    await this.http.request<unknown>('PATCH', `${ENDPOINTS_LCU.CHAMP_SELECT_ACTIONS}/${actionId}`, {
      championId,
      completed,
    });
  }

  /** Completa (o actualiza) la acción de ban del jugador local en Champ Select. */
  async banChampion(actionId: number, championId: number, completed: boolean): Promise<void> {
    await this.http.request<unknown>('PATCH', `${ENDPOINTS_LCU.CHAMP_SELECT_ACTIONS}/${actionId}`, {
      championId,
      completed,
    });
  }

  /**
   * Bloquea (lock-in) un campeón en la acción de pick indicada.
   * Ejecuta PATCH con completed: true, confirma con GET de la sesión y registra logs descriptivos.
   */
  async lockInChampion(
    actionId: number,
    championId: number,
    delayMs?: number
  ): Promise<{ success: boolean; actionId: number; championId: number; error?: string }> {
    if (!Number.isInteger(actionId) || actionId <= 0 || !Number.isInteger(championId) || championId <= 0) {
      return { success: false, actionId, championId, error: 'Identificadores de acción/campeón inválidos.' };
    }

    if (typeof delayMs === 'number' && delayMs > 0) {
      await new Promise((resolver) => setTimeout(resolver, delayMs));
    }

    try {
      registrarLog(
        `[ChampSelect][lockInChampion] Fase=${this.fase} acción=${actionId} campeón=${championId} -> PATCH ${ENDPOINTS_LCU.CHAMP_SELECT_ACTIONS}/${actionId} {championId, completed:true}`
      );
      await this.http.request<unknown>('PATCH', `${ENDPOINTS_LCU.CHAMP_SELECT_ACTIONS}/${actionId}`, {
        championId,
        completed: true,
      });
      registrarLog(`[ChampSelect][lockInChampion] PATCH enviado (acción ${actionId}, campeón ${championId})`);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      registrarLog(`[ChampSelect][lockInChampion] ERROR al enviar PATCH acción ${actionId}: ${mensaje}`);
      return { success: false, actionId, championId, error: mensaje };
    }

    try {
      const sesion = await this.getChampSelectSession();
      const accionConfirmada = sesion
        ? (sesion.actions ?? [])
            .flat()
            .find((candidata) => candidata.id === actionId) ?? null
        : null;

      if (accionConfirmada && accionConfirmada.completed && accionConfirmada.championId === championId) {
        registrarLog(
          `[ChampSelect][lockInChampion] Confirmado: acción ${actionId} completada con campeón ${championId} (fase ${this.fase})`
        );
        return { success: true, actionId, championId };
      }

      const detalle = accionConfirmada
        ? `completed=${accionConfirmada.completed}, championId=${accionConfirmada.championId}`
        : 'acción no encontrada tras PATCH';
      registrarLog(`[ChampSelect][lockInChampion] Confirmación fallida para acción ${actionId}: ${detalle}`);
      return {
        success: false,
        actionId,
        championId,
        error: `No se confirmó el lock-in de la acción ${actionId}: ${detalle}`,
      };
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      registrarLog(`[ChampSelect][lockInChampion] ERROR al confirmar con GET sesión: ${mensaje}`);
      return { success: false, actionId, championId, error: mensaje };
    }
  }

  /**
   * Bloquea (lock-in) un ban en la acción de ban indicada.
   * Ejecuta PATCH con completed: true, confirma con GET de la sesión y registra logs descriptivos.
   */
  async lockInBan(
    actionId: number,
    championId: number
  ): Promise<{ success: boolean; actionId: number; championId: number; error?: string }> {
    if (!Number.isInteger(actionId) || actionId <= 0 || !Number.isInteger(championId) || championId <= 0) {
      return { success: false, actionId, championId, error: 'Identificadores de acción/campeón inválidos.' };
    }

    try {
      registrarLog(
        `[ChampSelect][lockInBan] Fase=${this.fase} acción=${actionId} campeón=${championId} -> PATCH ${ENDPOINTS_LCU.CHAMP_SELECT_ACTIONS}/${actionId} {championId, completed:true}`
      );
      await this.http.request<unknown>('PATCH', `${ENDPOINTS_LCU.CHAMP_SELECT_ACTIONS}/${actionId}`, {
        championId,
        completed: true,
      });
      registrarLog(`[ChampSelect][lockInBan] PATCH enviado (acción ${actionId}, campeón ${championId})`);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      registrarLog(`[ChampSelect][lockInBan] ERROR al enviar PATCH acción ${actionId}: ${mensaje}`);
      return { success: false, actionId, championId, error: mensaje };
    }

    try {
      const sesion = await this.getChampSelectSession();
      const accionConfirmada = sesion
        ? (sesion.actions ?? [])
            .flat()
            .find((candidata) => candidata.id === actionId) ?? null
        : null;

      if (accionConfirmada && accionConfirmada.completed && accionConfirmada.championId === championId) {
        registrarLog(
          `[ChampSelect][lockInBan] Confirmado: acción ${actionId} completada con campeón ${championId} (fase ${this.fase})`
        );
        return { success: true, actionId, championId };
      }

      const detalle = accionConfirmada
        ? `completed=${accionConfirmada.completed}, championId=${accionConfirmada.championId}`
        : 'acción no encontrada tras PATCH';
      registrarLog(`[ChampSelect][lockInBan] Confirmación fallida para acción ${actionId}: ${detalle}`);
      return {
        success: false,
        actionId,
        championId,
        error: `No se confirmó el ban de la acción ${actionId}: ${detalle}`,
      };
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      registrarLog(`[ChampSelect][lockInBan] ERROR al confirmar con GET sesión: ${mensaje}`);
      return { success: false, actionId, championId, error: mensaje };
    }
  }

  /**
   * Obtiene el locale/configuración regional del cliente LCU normalizado a formato Data Dragon.
   * Intenta varios endpoints de configuración del cliente Riot/LCU.
   */
  async getLocale(): Promise<string> {
    const candidatos = [
      '/riotclient/region-locale',
      '/lol-client-config/v3/client-config/lol.client_settings.locale',
      '/lol-client-config/v1/namespaces/lol.client_settings.locale',
    ];

    for (const endpoint of candidatos) {
      try {
        const datos = await this.http.request<unknown>('GET', endpoint);
        const locale = this.normalizarLocale(datos);
        if (locale) {
          registrarLog(`[LcuClient] Locale detectado desde ${endpoint}: ${locale}`);
          return locale;
        }
      } catch {
        // Intentar siguiente candidato
      }
    }

    registrarLog('[LcuClient] No se pudo detectar locale desde LCU; usando es_ES por defecto');
    return 'es_ES';
  }

  private normalizarLocale(datos: unknown): string | null {
    if (typeof datos === 'string') {
      const normalizado = datos.replace('-', '_').trim();
      if (normalizado) {
        return normalizado;
      }
      return null;
    }

    if (!datos || typeof datos !== 'object') {
      return null;
    }

    const obj = datos as Record<string, unknown>;
    const candidatosClave = ['locale', 'language', 'lang', 'regionLocale'];
    for (const clave of candidatosClave) {
      const valor = obj[clave];
      if (typeof valor === 'string') {
        const normalizado = valor.replace('-', '_').trim();
        if (normalizado) {
          return normalizado;
        }
      }
    }

    return null;
  }

  /** Establece los hechizos de invocador del jugador local en Champ Select. */
  async setSummonerSpells(spell1Id: number, spell2Id: number): Promise<void> {
    await this.http.request<unknown>('PATCH', ENDPOINTS_LCU.CHAMP_SELECT_MY_SELECTION, {
      spell1Id,
      spell2Id,
    });
  }

  /** Obtiene la sesión de Champ Select actual, o `null` si no está en selección. */
  async getChampSelectSession(): Promise<ChampSelectSession | null> {
    try {
      return await this.http.request<ChampSelectSession>('GET', ENDPOINTS_LCU.CHAMP_SELECT_SESSION);
    } catch (error) {
      if (error instanceof ErrorPeticionLcu && error.codigoEstado === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Obtiene la lista de campeones elegibles del Champ Select actual
   * (`GET /lol-champ-select/v1/pickable-champion-ids`, REQ-012).
   * Devuelve un arreglo vacío si no hay sesión activa (404).
   */

  /**
   * Obtiene la lista de campeones baneables del Champ Select actual
   * (`GET /lol-champ-select/v1/bannable-champion-ids`).
   * Devuelve un arreglo vacío si no hay sesión activa (404) o si el endpoint falla.
   */
  async getBannableChampionIds(): Promise<number[]> {
    try {
      const datos = await this.http.request<unknown>('GET', ENDPOINTS_LCU.BANNABLE_CHAMPION_IDS);
      return normalizarIdsCampeones(datos);
    } catch (error) {
      if (error instanceof ErrorPeticionLcu && error.codigoEstado === 404) {
        return [];
      }
      return [];
    }
  }

  async getPickableChampionIds(): Promise<number[]> {
    try {
      const datos = await this.http.request<unknown>('GET', ENDPOINTS_LCU.PICKABLE_CHAMPION_IDS);
      return normalizarIdsCampeones(datos);
    } catch (error) {
      if (error instanceof ErrorPeticionLcu && error.codigoEstado === 404) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Hace hover de un campeón en la acción de pick activa del jugador local
   * (`PATCH /lol-champ-select/v1/session/actions/{actionId}` con `{ championId }`,
   * REQ-012), confirmando el resultado con un GET de la sesión.
   */
  async hoverChampion(championId: number): Promise<ResultadoHoverCampeon> {
    if (!Number.isInteger(championId) || championId <= 0) {
      return { success: false, error: 'El identificador del campeón es inválido.' };
    }

    let sesion: ChampSelectSession | null;
    try {
      sesion = await this.getChampSelectSession();
    } catch (error) {
      return {
        success: false,
        error: `No se pudo leer la sesión de Champ Select: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    if (!sesion) {
      return { success: false, error: 'No hay una sesión de Champ Select activa.' };
    }

    const accion = buscarAccionPickLocal(sesion);
    if (!accion) {
      return {
        success: false,
        error: 'No hay una acción de pick activa para el jugador local en este momento.',
      };
    }

    try {
      await this.http.request<unknown>(
        'PATCH',
        `${ENDPOINTS_LCU.CHAMP_SELECT_ACTIONS}/${accion.id}`,
        { championId }
      );
    } catch (error) {
      return {
        success: false,
        actionId: accion.id,
        championId,
        error: `La LCU rechazó el hover del campeón: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    // Confirmación con GET de la sesión (REQ-012).
    try {
      const confirmada = await this.getChampSelectSession();
      const accionConfirmada = confirmada
        ? (confirmada.actions ?? [])
            .flat()
            .find((candidata) => candidata.id === accion.id) ?? null
        : null;

      if (accionConfirmada && accionConfirmada.championId !== championId) {
        return {
          success: false,
          actionId: accion.id,
          championId,
          error: `La LCU no confirmó el hover: la acción ${accion.id} mantiene el campeón ${accionConfirmada.championId}.`,
        };
      }
    } catch {
      // Si la sesión desaparece entre el PATCH y el GET, el hover ya fue enviado.
    }

    registrarLog(`[ChampSelect] Hover aplicado sobre la acción ${accion.id} (campeón ${championId}).`);
    return { success: true, actionId: accion.id, championId };
  }

  /**
   * Obtiene el resumen de campeones de la LCU
   * (`GET /lol-game-data/assets/v1/champion-summary.json`, REQ-013), que
   * incluye lanzamientos recientes como Yunara (ID 804). Devuelve `[]` si el
   * endpoint no está disponible.
   */
  async getChampionSummary(): Promise<ResumenCampeonLcu[]> {
    try {
      const datos = await this.http.request<unknown>('GET', ENDPOINTS_LCU.CHAMPION_SUMMARY);
      return normalizarResumenCampeonesLcu(datos);
    } catch (error) {
      if (error instanceof ErrorPeticionLcu && error.codigoEstado === 404) {
        return [];
      }
      throw error;
    }
  }

  /** Cambia el estado de conexión y notifica el cambio por evento. */
  private cambiarEstado(nuevo: LcuConnectionState): void {
    if (this.estado === nuevo) {
      return;
    }
    this.estado = nuevo;
    this.actualizarPollingReadyCheck();
    this.emit(EVENTOS_LCU_CLIENT.ESTADO_CAMBIADO, nuevo);
    this.emitirEstadoAutoAccept();
  }

  /** Devuelve si se detectó un problema de permisos en el proceso de League of Legends. */
  getIsPermissionError(): boolean {
    return this.errorPermisos;
  }

  /** Devuelve el último error ocurrido en la conexión con la LCU. */
  getLastError(): string | null {
    return this.ultimoError || this.ws.getLastError();
  }

  /** Devuelve el puerto actualmente conectado o detectado. */
  getPort(): number | null {
    return this.credenciales?.port ?? null;
  }

  /** Devuelve el último reporte completo de detección. */
  getDetectionReport(): LcuDetectionReport | null {
    return this.ultimoReporte;
  }

  /** Prueba directamente el endpoint HTTP GET /lol-gameflow/v1/gameflow-phase. */
  async probarEndpointGameflow(port: number, tokenBase64: string): Promise<{ statusCode: number; phase: string }> {
    return new Promise<{ statusCode: number; phase: string }>((resolve, reject) => {
      const agent = new https.Agent({ rejectUnauthorized: false });
      const req = https.request(
        {
          hostname: '127.0.0.1',
          port,
          path: ENDPOINTS_LCU.GAMEFLOW_PHASE,
          method: 'GET',
          headers: {
            Authorization: tokenBase64,
            Accept: 'application/json',
          },
          agent,
          timeout: 5000,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              let phase = 'None';
              try {
                const parsed = JSON.parse(body);
                phase = typeof parsed === 'string' ? parsed : String(parsed);
              } catch {
                phase = body.replace(/"/g, '').trim() || 'None';
              }
              resolve({ statusCode: res.statusCode, phase });
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${body || res.statusMessage || 'Error LCU'}`));
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy(new Error('Timeout de 5000ms al consultar /lol-gameflow/v1/gameflow-phase'));
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.end();
    });
  }

  /** Prueba la conexión WebSocket y la suscripción global de forma directa. */
  async probarConexionWebSocketDirecta(port: number, tokenBase64: string): Promise<{ conectado: boolean; mensajesRecibidos: number }> {
    return new Promise<{ conectado: boolean; mensajesRecibidos: number }>((resolve, reject) => {
      let resuelto = false;
      let contadorMensajes = 0;
      const url = `wss://127.0.0.1:${port}/`;

      const socket = new WebSocket(url, {
        headers: { Authorization: tokenBase64 },
        rejectUnauthorized: false,
        handshakeTimeout: 5000,
      });

      const timer = setTimeout(() => {
        if (!resuelto) {
          resuelto = true;
          try {
            socket.close();
          } catch {}
          if (socket.readyState === WebSocket.OPEN) {
            resolve({ conectado: true, mensajesRecibidos: contadorMensajes });
          } else {
            reject(new Error(`Timeout de 5000ms esperando handshake WebSocket en ${url}`));
          }
        }
      }, 5000);

      socket.on('open', () => {
        socket.send(JSON.stringify([...MENSAJE_SUSCRIPCION_LCU]));
        setTimeout(() => {
          if (!resuelto) {
            resuelto = true;
            clearTimeout(timer);
            try {
              socket.close(1000, 'Test completado');
            } catch {}
            resolve({ conectado: true, mensajesRecibidos: contadorMensajes });
          }
        }, 300);
      });

      socket.on('message', () => {
        contadorMensajes++;
      });

      socket.on('error', (err) => {
        if (!resuelto) {
          resuelto = true;
          clearTimeout(timer);
          try {
            socket.close();
          } catch {}
          reject(new Error(`Fallo WebSocket: ${err.message}`));
        }
      });

      socket.on('close', (code, reason) => {
        if (!resuelto && code !== 1000) {
          resuelto = true;
          clearTimeout(timer);
          reject(new Error(`WebSocket cerrado (Código: ${code}, Motivo: ${reason.toString() || 'sin detalle'})`));
        }
      });
    });
  }

  /** Ejecuta una prueba manual de diagnóstico bajo demanda verificando cada paso (a, b, c, d). */
  async testDetection(manualPath?: string): Promise<LcuDetectionReport> {
    const testSteps: LcuConnectionStepDetail[] = [];
    registrarLog(`=== INICIANDO PRUEBA COMPLETA DE CONEXIÓN BAJO DEMANDA ===`);

    const ruta = manualPath || this.opciones.rutaLockfile || this.opciones.obtenerRutaManual?.();
    const rep = await ejecutarDeteccionLcu({ rutaManual: ruta });

    if (rep.isPermissionError !== this.errorPermisos) {
      this.errorPermisos = rep.isPermissionError;
      this.emit(EVENTOS_LCU_CLIENT.ERROR_PERMISOS, this.errorPermisos);
    }

    if (!rep.success || !rep.credentials) {
      testSteps.push({
        id: 'detection',
        name: 'a) Detección de Proceso / Lockfile',
        status: 'failure',
        summary: 'No se pudo detectar el cliente de LoL por ninguno de los 4 métodos.',
        details: rep.steps.map((s) => `${s.name}: ${s.success ? 'OK' : s.details}`).join(' | '),
        error: 'Cliente de League of Legends no encontrado.',
      });
      testSteps.push({
        id: 'http',
        name: 'b) GET /lol-gameflow/v1/gameflow-phase',
        status: 'skipped',
        summary: 'Omitido: no se obtuvieron credenciales.',
        details: 'Requiere que el paso a) tenga éxito.',
      });
      testSteps.push({
        id: 'ws',
        name: 'c) WebSocket wss://127.0.0.1:<puerto>',
        status: 'skipped',
        summary: 'Omitido: no se obtuvieron credenciales.',
        details: 'Requiere que el paso a) tenga éxito.',
      });
      testSteps.push({
        id: 'state',
        name: 'd) Estado final de LcuClient',
        status: 'failure',
        summary: `Estado actual: ${this.estado}`,
        details: `Fase: ${this.fase}`,
      });

      const reporteFallo: LcuDetectionReport = {
        ...rep,
        testSteps,
        finalState: this.estado,
        finalGameflow: this.fase,
        lastError: this.ultimoError || 'Cliente no detectado',
      };
      this.ultimoReporte = reporteFallo;
      return reporteFallo;
    }

    const { port, password, tokenBase64 } = rep.credentials;
    const tokenMasked = password ? `Sí (${password.length} caracteres)` : 'No';
    testSteps.push({
      id: 'detection',
      name: 'a) Detección de Proceso / Lockfile',
      status: 'success',
      summary: `Detectado mediante ${rep.successfulStep || 'Método A'}. Puerto: ${port}, Token presente: ${tokenMasked}`,
      details: `PID: ${rep.credentials.pid}, Protocolo: ${rep.credentials.protocol}`,
    });

    // Paso b: HTTP GET
    let gameflowPhaseObtenida = 'None';
    try {
      registrarLog(`[Test Conexión - Paso b] GET https://127.0.0.1:${port}/lol-gameflow/v1/gameflow-phase`);
      const httpResult = await this.probarEndpointGameflow(port, tokenBase64);
      gameflowPhaseObtenida = httpResult.phase;
      testSteps.push({
        id: 'http',
        name: 'b) GET /lol-gameflow/v1/gameflow-phase (HTTPS)',
        status: 'success',
        summary: `HTTP 200 OK. Fase de Gameflow: "${gameflowPhaseObtenida}"`,
        details: `Conexión HTTPS autorizada con Basic riot:*** y rejectUnauthorized:false en puerto ${port}.`,
      });
      registrarLog(`[Test Conexión - Paso b] Éxito: HTTP ${httpResult.statusCode}, Fase: "${gameflowPhaseObtenida}"`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      testSteps.push({
        id: 'http',
        name: 'b) GET /lol-gameflow/v1/gameflow-phase (HTTPS)',
        status: 'failure',
        summary: `Fallo en petición HTTP GET en puerto ${port}.`,
        details: `Error exacto: ${errMsg}`,
        error: errMsg,
      });
      registrarLog(`[Test Conexión - Paso b] Fallo HTTP: ${errMsg}`);
    }

    // Paso c: WebSocket
    try {
      registrarLog(`[Test Conexión - Paso c] Conectando WebSocket a wss://127.0.0.1:${port}/`);
      const wsResult = await this.probarConexionWebSocketDirecta(port, tokenBase64);
      testSteps.push({
        id: 'ws',
        name: 'c) WebSocket wss://127.0.0.1:<puerto> (WSS)',
        status: 'success',
        summary: `Handshake WSS completado y suscripción [5, "OnJsonApiEvent"] aceptada.`,
        details: `Socket abierto y operativo en wss://127.0.0.1:${port}/ con rejectUnauthorized:false. Mensajes recibidos: ${wsResult.mensajesRecibidos}`,
      });
      registrarLog(`[Test Conexión - Paso c] Éxito WebSocket en puerto ${port}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      testSteps.push({
        id: 'ws',
        name: 'c) WebSocket wss://127.0.0.1:<puerto> (WSS)',
        status: 'failure',
        summary: `Fallo en handshake WebSocket en puerto ${port}.`,
        details: `Error exacto: ${errMsg}`,
        error: errMsg,
      });
      registrarLog(`[Test Conexión - Paso c] Fallo WebSocket: ${errMsg}`);
    }

    // Paso d: Sincronizar conexión activa de LcuClient
    await this.intentarConexion();

    testSteps.push({
      id: 'state',
      name: 'd) Estado final de LcuClient',
      status: this.estado === 'connected' ? 'success' : 'failure',
      summary: `Estado de LcuClient: ${this.estado}. Fase de Gameflow: "${this.fase}"`,
      details: `Socket activo: ${this.ws.estaConectado()}, Credenciales: ${this.credenciales ? 'Presentes' : 'Ausentes'}`,
      error: this.estado !== 'connected' ? (this.ultimoError || 'LcuClient no pasó a connected') : undefined,
    });

    registrarLog(`[Test Conexión - Paso d] Estado final: ${this.estado}, Fase: ${this.fase}`);

    const reporteCompleto: LcuDetectionReport = {
      ...rep,
      testSteps,
      finalState: this.estado,
      finalGameflow: this.fase,
      lastError: this.ultimoError || undefined,
    };
    this.ultimoReporte = reporteCompleto;
    return reporteCompleto;
  }

  /** Realiza un intento de conexión completo mediante los 4 métodos de LcuDetector (o lockfile directo si se configuró). */
  private async intentarConexion(): Promise<void> {
    if (!this.activo || this.conexionEnCurso) {
      return;
    }

    let credenciales: LcuCredentials | null = null;

    if (this.opciones.rutaLockfile) {
      // Si se configuró una ruta de lockfile fija explícita (p. ej. en pruebas con mock server)
      try {
        credenciales = await leerLockfile(this.opciones.rutaLockfile);
      } catch {
        credenciales = null;
      }
    } else {
      // Optimización de rendimiento: Si el socket está conectado y saludable,
      // no ejecutar sondeo WMI/PowerShell pesado de proceso cada 2s.
      if (this.estado === 'connected' && this.ws.estaConectado()) {
        return;
      }
      const rutaManual = this.opciones.obtenerRutaManual?.();
      const reporte = await ejecutarDeteccionLcu({ rutaManual });
      this.ultimoReporte = reporte;

      if (reporte.isPermissionError !== this.errorPermisos) {
        this.errorPermisos = reporte.isPermissionError;
        this.emit(EVENTOS_LCU_CLIENT.ERROR_PERMISOS, this.errorPermisos);
      }

      credenciales = reporte.credentials;
    }

    if (!this.activo) {
      return;
    }

    if (!credenciales) {
      // Si el cliente ya no está disponible y estábamos conectados, desmontar
      if (this.estado === 'connected') {
        this.desmontarConexion();
      }
      return;
    }

    const cambiaron =
      !this.credenciales ||
      this.credenciales.port !== credenciales.port ||
      this.credenciales.password !== credenciales.password;

    // Si ya estamos conectados con las mismas credenciales y el socket está abierto, no reconectar
    if (!cambiaron && this.ws.estaConectado() && this.estado === 'connected') {
      return;
    }

    this.conexionEnCurso = true;
    try {
      this.cambiarEstado('connecting');
      this.credenciales = credenciales;
      this.http.actualizarCredenciales(credenciales);
      const esperaHandshake = this.esperarHandshake();
      this.ws.conectar(credenciales);
      const handshakeOk = await esperaHandshake;

      if (handshakeOk) {
        this.cambiarEstado('connected');
        this.ultimoError = null;
        await this.refrescarFaseInicial();
      } else {
        if (this.estado === 'connected') {
          this.desmontarConexion();
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.ultimoError = msg;
      registrarLog(`[LcuClient ERROR] Excepción conectando: ${msg}`);
      if (this.estado === 'connected') {
        this.desmontarConexion();
      }
      this.emit(EVENTOS_LCU_CLIENT.ERROR_LCU, err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.conexionEnCurso = false;
    }
  }

  /** Espera el handshake del WebSocket (o su fallo/timeout). */
  private esperarHandshake(): Promise<boolean> {
    return new Promise<boolean>((resolver) => {
      let resuelto = false;
      const finalizar = (exito: boolean): void => {
        if (resuelto) {
          return;
        }
        resuelto = true;
        clearTimeout(temporizador);
        this.ws.off('conectado', alConectar);
        this.ws.off('desconectado', alDesconectar);
        this.ws.off('error-websocket', alError);
        resolver(exito);
      };
      const alConectar = (): void => {
        this.ultimoError = null;
        registrarLog(`[LCU Handshake] Handshake completado exitosamente.`);
        finalizar(true);
      };
      const alDesconectar = (det: { codigo: number; motivo: string }): void => {
        if (det.codigo !== 1000) {
          const motivo = det.motivo || 'Cierre inesperado';
          this.ultimoError = `WebSocket cerrado durante handshake (Código: ${det.codigo}, ${motivo})`;
          registrarLog(`[LCU Handshake ERROR] ${this.ultimoError}`);
        }
        finalizar(false);
      };
      const alError = (err: Error): void => {
        const msg = `${err.name}: ${err.message}${(err as any).code ? ` [${(err as any).code}]` : ''}`;
        this.ultimoError = msg;
        registrarLog(`[LCU Handshake ERROR] Error en handshake: ${msg}`);
        finalizar(false);
      };

      const temporizador = setTimeout(() => {
        this.ultimoError = `Timeout (${this.opciones.timeoutConexionWsMs}ms) esperando handshake WebSocket`;
        registrarLog(`[LCU Handshake TIMEOUT] ${this.ultimoError}`);
        finalizar(false);
      }, this.opciones.timeoutConexionWsMs);
      temporizador.unref?.();

      this.ws.on('conectado', alConectar);
      this.ws.on('desconectado', alDesconectar);
      this.ws.on('error-websocket', alError);
    });
  }

  /** Desmonta la conexión cuando el lockfile desaparece, sin detener la detección. */
  private desmontarConexion(): void {
    this.ws.desconectar();
    this.http.actualizarCredenciales(null);
    this.credenciales = null;
    this.cambiarEstado('connecting');
  }

  /** Consulta la fase de gameflow actual vía HTTP al conectar. */
  private async refrescarFaseInicial(): Promise<void> {
    try {
      const datos = await this.http.request<unknown>('GET', ENDPOINTS_LCU.GAMEFLOW_PHASE);
      const fase = normalizarFaseGameflow(datos);
      if (fase) {
        this.actualizarFase(fase);
      }
    } catch {
      // La fase se actualizará con los eventos WebSocket cuando estén disponibles.
    }
  }

  /** Actualiza la fase conocida, ajusta el polling de respaldo y notifica. */
  private actualizarFase(fase: GameflowPhase): void {
    const cambio = fase !== this.fase;
    if (cambio) {
      this.fase = fase;
    }
    this.actualizarPollingReadyCheck();
    if (cambio) {
      this.emit(EVENTOS_LCU_CLIENT.GAMEFLOW_CAMBIADO, fase);
      this.emitirEstadoAutoAccept();
    }
  }

  /** Procesa un evento de la LCU y reemite los relevantes para la aplicación. */
  private procesarEvento(evento: EventoLcu): void {
    switch (evento.uri) {
      case ENDPOINTS_LCU.GAMEFLOW_PHASE: {
        const fase = normalizarFaseGameflow(evento.data);
        if (fase) {
          this.actualizarFase(fase);
        }
        break;
      }
      case ENDPOINTS_LCU.READY_CHECK: {
        this.procesarReadyCheck(normalizarReadyCheck(evento.data), 'websocket');
        break;
      }
      case ENDPOINTS_LCU.CHAMP_SELECT_SESSION: {
        const sesion = (evento.data as ChampSelectSession | null) ?? null;
        this.emit(EVENTOS_LCU_CLIENT.CHAMP_SELECT_SESSION, sesion);
        break;
      }
      default:
        break;
    }
  }

  /**
   * Centraliza el tratamiento de un ReadyCheck, venga del WebSocket o del
   * polling de respaldo. Deduplica las actualizaciones equivalentes (mismo
   * `state`/`playerResponse`) y alimenta al servicio de Auto-Accept.
   */
  private procesarReadyCheck(
    readyCheck: ReadyCheckEvent | null,
    origen: 'websocket' | 'polling'
  ): void {
    const hayCambio = !sonReadyChecksEquivalentes(this.ultimoReadyCheck, readyCheck);
    this.autoAccept.manejarEvento(readyCheck);

    if (hayCambio) {
      this.ultimoReadyCheck = readyCheck;
      if (readyCheck) {
        if (readyCheck.state === 'InProgress' && readyCheck.playerResponse === 'None') {
          this.ultimaAccionAutoAccept = 'Ready check detectado';
          this.ultimoTimestampAutoAccept = Date.now();
        }
        registrarLog(
          `[AutoAccept] ReadyCheck (${origen}): state=${readyCheck.state}, playerResponse=${readyCheck.playerResponse}, timer=${readyCheck.timer}s.`
        );
        this.emit(EVENTOS_LCU_CLIENT.READY_CHECK, readyCheck);
      } else if (origen === 'polling') {
        registrarLog('[AutoAccept] ReadyCheck finalizado (404 en polling).');
      }
      this.emitirEstadoAutoAccept();
    }
  }

  /** Emite el estado vivo del Auto-Accept para los consumidores (UI/IPC). */
  private emitirEstadoAutoAccept(): void {
    this.emit(EVENTOS_LCU_CLIENT.AUTO_ACCEPT_STATUS, this.getAutoAcceptStatus());
  }

  /**
   * Activa o desactiva el polling HTTP de respaldo del ReadyCheck según la fase
   * actual (REQ-010): solo se ejecuta conectado y en `Matchmaking`/`ReadyCheck`.
   */
  private actualizarPollingReadyCheck(): void {
    const debePollear =
      this.activo && this.estado === 'connected' && esFaseConReadyCheck(this.fase);

    if (debePollear && !this.pollingReadyCheckActivo) {
      this.pollingReadyCheckActivo = true;
      registrarLog(
        `[AutoAccept] Polling de respaldo activado (fase ${this.fase}, intervalo ${this.opciones.intervaloPollingReadyCheckMs} ms).`
      );
      this.programarPollingReadyCheck();
      this.emitirEstadoAutoAccept();
      return;
    }

    if (!debePollear && this.pollingReadyCheckActivo) {
      this.detenerPollingReadyCheck();
      registrarLog('[AutoAccept] Polling de respaldo detenido.');
      this.emitirEstadoAutoAccept();
    }
  }

  /** Programa la siguiente consulta del polling de respaldo. */
  private programarPollingReadyCheck(): void {
    if (
      !this.pollingReadyCheckActivo ||
      !this.activo ||
      this.estado !== 'connected' ||
      !esFaseConReadyCheck(this.fase) ||
      this.temporizadorPollingReadyCheck
    ) {
      return;
    }
    const temporizador = setTimeout(() => {
      this.temporizadorPollingReadyCheck = null;
      void this.ejecutarPollingReadyCheck();
    }, this.opciones.intervaloPollingReadyCheckMs);
    temporizador.unref?.();
    this.temporizadorPollingReadyCheck = temporizador;
  }

  /** Ejecuta una consulta del polling y reprograma la siguiente. */
  private async ejecutarPollingReadyCheck(): Promise<void> {
    if (!this.activo || this.estado !== 'connected' || !esFaseConReadyCheck(this.fase)) {
      this.actualizarPollingReadyCheck();
      return;
    }

    try {
      const datos = await this.http.request<unknown>('GET', ENDPOINTS_LCU.READY_CHECK);
      this.procesarReadyCheck(normalizarReadyCheck(datos), 'polling');
    } catch (error) {
      if (error instanceof ErrorPeticionLcu && error.codigoEstado === 404) {
        // Sin ReadyCheck activo: la fase puede seguir en Matchmaking.
        this.procesarReadyCheck(null, 'polling');
      } else if (!(error instanceof Error)) {
        registrarLog(`[AutoAccept ERROR] Fallo inesperado en el polling de ReadyCheck: ${String(error)}`);
      } else {
        registrarLog(`[AutoAccept ERROR] Fallo en el polling de ReadyCheck: ${error.message}`);
      }
    } finally {
      if (this.activo && this.estado === 'connected' && esFaseConReadyCheck(this.fase)) {
        this.programarPollingReadyCheck();
      } else {
        this.actualizarPollingReadyCheck();
      }
    }
  }

  /** Cancela el temporizador del polling de respaldo y lo marca como inactivo. */
  private detenerPollingReadyCheck(): void {
    this.pollingReadyCheckActivo = false;
    if (this.temporizadorPollingReadyCheck) {
      clearTimeout(this.temporizadorPollingReadyCheck);
      this.temporizadorPollingReadyCheck = null;
    }
  }

  /** Programa el siguiente ciclo de detección del lockfile. */
  private programarDeteccion(): void {
    if (!this.activo) {
      return;
    }
    const temporizador = setTimeout(() => {
      void this.ejecutarCicloDeteccion();
    }, this.opciones.intervaloDeteccionMs);
    temporizador.unref?.();
    this.temporizadorDeteccion = temporizador;
  }

  /** Ejecuta un ciclo de detección y vuelve a programar el siguiente. */
  private async ejecutarCicloDeteccion(): Promise<void> {
    if (!this.activo) {
      return;
    }
    try {
      await this.intentarConexion();
    } catch (error) {
      this.emit(EVENTOS_LCU_CLIENT.ERROR_LCU, error instanceof Error ? error : new Error(String(error)));
    }
    this.programarDeteccion();
  }

  /** Cancela el ciclo de detección pendiente. */
  private limpiarDeteccion(): void {
    if (this.temporizadorDeteccion) {
      clearTimeout(this.temporizadorDeteccion);
      this.temporizadorDeteccion = null;
    }
  }
}
