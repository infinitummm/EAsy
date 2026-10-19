/**
 * Cliente WebSocket seguro (WSS) para la LCU API de League of Legends.
 *
 * Se conecta a `wss://127.0.0.1:[Puerto]` con autenticación Basic Auth, se suscribe al
 * evento global `[5, "OnJsonApiEvent"]` y emite los eventos JSON recibidos del cliente.
 * Incluye reconexión automática con retroceso cuando el cliente de League se reinicia.
 */

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { LcuCredentials } from '@shared/types';
import { LCU_CONSTANTS } from '@shared/constants';
import { registrarLog } from './LcuDetector';

/** Nombre del evento global de la LCU al que se suscribe el cliente. */
export const EVENTO_GLOBAL_LCU = 'OnJsonApiEvent';

/** Mensaje de suscripción exigido por la LCU API. */
export const MENSAJE_SUSCRIPCION_LCU: ReadonlyArray<number | string> = [5, EVENTO_GLOBAL_LCU];

/** Opciones de construcción del cliente WebSocket LCU. */
export interface OpcionesLcuWebSocket {
  /** Host de conexión. Por defecto `127.0.0.1`. */
  host?: string;
  /** Protocolo a utilizar. Por defecto `wss` (el real de la LCU). */
  protocolo?: 'wss' | 'ws';
  /** Si es `true`, se reintenta la conexión automáticamente tras una caída. Por defecto `true`. */
  reconectarAutomaticamente?: boolean;
  /** Espera entre intentos de reconexión en milisegundos. Por defecto `LCU_CONSTANTS.RECONNECT_BACKOFF_MS`. */
  intervaloReconexionMs?: number;
  /** Tiempo máximo para completar el handshake WebSocket. Por defecto 10000 ms. */
  timeoutConexionMs?: number;
}

/** Evento JSON recibido desde la LCU. */
export interface EventoLcu {
  uri: string;
  eventType: string;
  data: unknown;
}

/** Detalle emitido al perderse la conexión WebSocket. */
export interface DetalleDesconexion {
  codigo: number;
  motivo: string;
  /** `true` si la desconexión fue solicitada explícitamente con `desconectar()`. */
  manual: boolean;
}

/** Datos emitidos al programar un intento de reconexión. */
export interface DetalleReconexion {
  intento: number;
  esperaMs: number;
}

/**
 * Eventos emitidos:
 * - `conectado`: handshake completado y suscripción enviada.
 * - `desconectado`: `DetalleDesconexion`.
 * - `reconectando`: `DetalleReconexion`.
 * - `evento`: `EventoLcu` por cada evento JSON de la LCU.
 * - `error-websocket`: `Error` de conexión (se evita el nombre reservado `error` de EventEmitter).
 */
export class LcuWebSocket extends EventEmitter {
  private readonly opciones: Required<OpcionesLcuWebSocket>;
  private credenciales: LcuCredentials | null = null;
  private socket: WebSocket | null = null;
  private conectado = false;
  private manual = false;
  private intentosReconexion = 0;
  private ultimoError: string | null = null;
  private temporizadorReconexion: NodeJS.Timeout | null = null;

  constructor(opciones: OpcionesLcuWebSocket = {}) {
    super();
    this.opciones = {
      host: opciones.host ?? '127.0.0.1',
      protocolo: opciones.protocolo ?? 'wss',
      reconectarAutomaticamente: opciones.reconectarAutomaticamente ?? true,
      intervaloReconexionMs: opciones.intervaloReconexionMs ?? LCU_CONSTANTS.RECONNECT_BACKOFF_MS,
      timeoutConexionMs: opciones.timeoutConexionMs ?? 10_000,
    };
  }

  /** Devuelve el último error ocurrido en la conexión WebSocket. */
  getLastError(): string | null {
    return this.ultimoError;
  }

  /**
   * Inicia la conexión WebSocket con las credenciales indicadas.
   * Si ya existía una conexión, se cierra y se reemplaza.
   */
  conectar(credenciales: LcuCredentials): void {
    this.credenciales = credenciales;
    this.manual = false;
    this.intentosReconexion = 0;
    this.limpiarTemporizadorReconexion();
    this.cerrarSocketActual();
    this.abrirSocket();
  }

  /** Actualiza las credenciales sin abrir una nueva conexión (se usarán en la próxima reconexión). */
  actualizarCredenciales(credenciales: LcuCredentials | null): void {
    this.credenciales = credenciales;
  }

  /** Cierra la conexión de forma manual y detiene cualquier reconexión automática. */
  desconectar(): void {
    this.manual = true;
    this.limpiarTemporizadorReconexion();
    this.credenciales = null;
    this.conectado = false;

    const socket = this.socket;
    if (!socket) {
      this.socket = null;
      return;
    }

    try {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000, 'Cierre manual');
      } else {
        this.socket = null;
      }
    } catch {
      this.socket = null;
    }
  }

  /** Devuelve `true` si el socket está abierto y listo para recibir eventos. */
  estaConectado(): boolean {
    return this.conectado && this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  /** Envía un mensaje arbitrario (se serializa como JSON). Devuelve `false` si no hay conexión. */
  enviar(mensaje: unknown): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.socket.send(JSON.stringify(mensaje));
    return true;
  }

  /** Abre un nuevo socket con las credenciales actuales. */
  private abrirSocket(): void {
    const credenciales = this.credenciales;
    if (!credenciales) {
      return;
    }

    const url = `${this.opciones.protocolo}://${this.opciones.host}:${credenciales.port}/`;
    registrarLog(`[WebSocket] Intentando conectar a ${url} con Basic Auth...`);
    const socket = new WebSocket(url, {
      headers: { Authorization: credenciales.tokenBase64 },
      rejectUnauthorized: false,
      handshakeTimeout: this.opciones.timeoutConexionMs,
    });
    this.socket = socket;

    socket.on('open', () => {
      this.conectado = true;
      this.intentosReconexion = 0;
      this.ultimoError = null;
      registrarLog(`[WebSocket OPEN] Conexión establecida con éxito en ${url}`);
      // Suscripción al evento global de la LCU.
      this.enviar([...MENSAJE_SUSCRIPCION_LCU]);
      registrarLog(`[WebSocket] Suscripción enviada: [5, "OnJsonApiEvent"]`);
      this.emit('conectado');
    });

    socket.on('message', (datos: WebSocket.RawData) => {
      this.procesarMensaje(datos);
    });

    socket.on('error', (error: Error) => {
      if (this.socket !== socket) {
        return;
      }
      const detalleError = `${error.name}: ${error.message}${(error as any).code ? ` [${(error as any).code}]` : ''}`;
      this.ultimoError = detalleError;
      registrarLog(`[WebSocket ERROR] Fallo en handshake/conexión a ${url}: ${detalleError}`);
      this.emit('error-websocket', error);
    });

    socket.on('close', (codigo: number, motivo: Buffer) => {
      // Si el socket ya fue reemplazado por una conexión más nueva, se ignora su cierre.
      if (this.socket !== socket) {
        return;
      }

      const motivoStr = motivo.toString('utf-8');
      if (!this.manual) {
        const detalleClose = `Código: ${codigo}, Motivo: ${motivoStr || 'Sin detalle'}`;
        if (codigo !== 1000) {
          this.ultimoError = `Desconexión inesperada (${detalleClose})`;
          registrarLog(`[WebSocket CLOSE ANORMAL] Socket cerrado en ${url}. ${detalleClose}`);
        } else {
          registrarLog(`[WebSocket CLOSE] Socket cerrado normalmente en ${url}`);
        }
      }

      this.socket = null;
      this.conectado = false;
      const detalle: DetalleDesconexion = {
        codigo,
        motivo: motivoStr,
        manual: this.manual,
      };
      this.emit('desconectado', detalle);

      if (!this.manual && this.opciones.reconectarAutomaticamente) {
        this.programarReconexion();
      }
    });
  }

  /** Interpreta el frame recibido y emite `evento` si corresponde a un `OnJsonApiEvent`. */
  private procesarMensaje(datos: WebSocket.RawData): void {
    const texto = convertirATexto(datos);
    let mensaje: unknown;
    try {
      mensaje = JSON.parse(texto);
    } catch {
      return;
    }

    if (!Array.isArray(mensaje) || mensaje.length < 3) {
      return;
    }

    const [codigo, nombre, carga] = mensaje;
    if (codigo !== 8 || nombre !== EVENTO_GLOBAL_LCU) {
      return;
    }

    if (!carga || typeof carga !== 'object') {
      return;
    }

    const { uri, eventType, data } = carga as Record<string, unknown>;
    if (typeof uri !== 'string') {
      return;
    }

    this.emit('evento', {
      uri,
      eventType: typeof eventType === 'string' ? eventType : '',
      data,
    } satisfies EventoLcu);
  }

  /** Programa un intento de reconexión automática. */
  private programarReconexion(): void {
    if (this.temporizadorReconexion) {
      return;
    }

    this.intentosReconexion += 1;
    const esperaMs = this.opciones.intervaloReconexionMs;
    this.emit('reconectando', { intento: this.intentosReconexion, esperaMs } satisfies DetalleReconexion);

    const temporizador = setTimeout(() => {
      this.temporizadorReconexion = null;
      if (!this.manual && this.credenciales) {
        this.abrirSocket();
      }
    }, esperaMs);
    temporizador.unref?.();
    this.temporizadorReconexion = temporizador;
  }

  /** Cancela el temporizador de reconexión pendiente, si existe. */
  private limpiarTemporizadorReconexion(): void {
    if (this.temporizadorReconexion) {
      clearTimeout(this.temporizadorReconexion);
      this.temporizadorReconexion = null;
    }
  }

  /** Cierra el socket actual, si existe, sin disparar reconexión. */
  private cerrarSocketActual(): void {
    const socket = this.socket;
    this.socket = null;
    this.conectado = false;
    if (!socket) {
      return;
    }
    try {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000, 'Cierre manual');
      }
    } catch {
      // El socket ya estaba cerrado; no hay nada que hacer.
    }
  }
}

/** Convierte los datos brutos de un frame WebSocket a texto UTF-8. */
function convertirATexto(datos: WebSocket.RawData): string {
  if (Array.isArray(datos)) {
    return Buffer.concat(datos).toString('utf-8');
  }
  if (Buffer.isBuffer(datos)) {
    return datos.toString('utf-8');
  }
  return Buffer.from(datos as ArrayBuffer).toString('utf-8');
}
