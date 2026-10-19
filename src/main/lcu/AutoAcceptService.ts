/**
 * Servicio de Auto-Accept: detecta la aparición del ReadyCheck en la LCU y acepta
 * la partida automáticamente respetando un retardo configurable entre 0 y 8 segundos,
 * con opción de varianza humana (±0.5 s) para simular una respuesta natural.
 */

import { EventEmitter } from 'node:events';
import type { ReadyCheckEvent } from '@shared/types';
import { LCU_CONSTANTS } from '@shared/constants';

/** Dependencia mínima requerida para aceptar la partida (normalmente el `LcuClient`). */
export interface AceptadorReadyCheck {
  acceptReadyCheck(): Promise<void>;
}

/** Opciones de construcción del servicio de Auto-Accept. */
export interface OpcionesAutoAcceptService {
  /** Retardo en segundos antes de aceptar (se normaliza a 0-8). Por defecto `LCU_CONSTANTS.DEFAULT_AUTO_ACCEPT_DELAY_SECONDS`. */
  retrasoSegundos?: number;
  /** Activa la fluctuación humana de ±0.5 s. Por defecto `true`. */
  varianzaHumana?: boolean;
  /** Fuente de aleatoriedad inyectable para pruebas (por defecto `Math.random`). */
  aleatorio?: () => number;
}

/** Varianza humana máxima aplicada al retardo (±0.5 s). */
export const VARIANZA_HUMANA_MAXIMA_MS = 500;

/**
 * Normaliza un retardo en segundos al rango válido [0, 8] definido en la especificación.
 * Si el valor no es un número finito, devuelve el retardo por defecto.
 */
export function normalizarRetrasoSegundos(retrasoSegundos: number): number {
  if (!Number.isFinite(retrasoSegundos)) {
    return LCU_CONSTANTS.DEFAULT_AUTO_ACCEPT_DELAY_SECONDS;
  }
  return Math.min(
    Math.max(retrasoSegundos, LCU_CONSTANTS.MIN_AUTO_ACCEPT_DELAY_SECONDS),
    LCU_CONSTANTS.MAX_AUTO_ACCEPT_DELAY_SECONDS
  );
}

/**
 * Calcula el retardo final en milisegundos aplicando la varianza humana opcional.
 * El resultado nunca es negativo.
 */
export function calcularRetrasoMilisegundos(
  retrasoSegundos: number,
  varianzaHumana: boolean,
  aleatorio: () => number = Math.random
): number {
  const base = normalizarRetrasoSegundos(retrasoSegundos) * 1000;
  if (!varianzaHumana) {
    return base;
  }
  const fluctuacion = (aleatorio() * 2 - 1) * VARIANZA_HUMANA_MAXIMA_MS;
  return Math.max(0, base + fluctuacion);
}

/**
 * Eventos emitidos:
 * - `programado`: `{ esperaMs: number }` al agendar una aceptación.
 * - `aceptado`: tras enviar correctamente la aceptación a la LCU.
 * - `fallo-aceptacion`: `Error` si el envío de la aceptación falla.
 */
export class AutoAcceptService extends EventEmitter {
  private readonly aceptador: AceptadorReadyCheck;
  private readonly aleatorio: () => number;
  private habilitado = false;
  private retrasoSegundos: number;
  private varianzaHumana: boolean;
  private temporizador: NodeJS.Timeout | null = null;
  private aceptacionEnviada = false;

  constructor(aceptador: AceptadorReadyCheck, opciones: OpcionesAutoAcceptService = {}) {
    super();
    this.aceptador = aceptador;
    this.retrasoSegundos = normalizarRetrasoSegundos(
      opciones.retrasoSegundos ?? LCU_CONSTANTS.DEFAULT_AUTO_ACCEPT_DELAY_SECONDS
    );
    this.varianzaHumana = opciones.varianzaHumana ?? true;
    this.aleatorio = opciones.aleatorio ?? Math.random;
  }

  /** Activa o desactiva el Auto-Accept y, opcionalmente, actualiza el retardo (0-8 s). */
  configurar(habilitado: boolean, retrasoSegundos?: number): void {
    this.habilitado = habilitado;
    if (retrasoSegundos !== undefined) {
      this.retrasoSegundos = normalizarRetrasoSegundos(retrasoSegundos);
    }
    if (!habilitado) {
      this.cancelar();
    }
  }

  /** Devuelve `true` si el Auto-Accept está habilitado. */
  estaHabilitado(): boolean {
    return this.habilitado;
  }

  /** Devuelve el retardo configurado en segundos (0-8). */
  obtenerRetrasoSegundos(): number {
    return this.retrasoSegundos;
  }

  /** Devuelve `true` si hay una aceptación agendada pendiente de enviarse. */
  hayAceptacionPendiente(): boolean {
    return this.temporizador !== null;
  }

  /**
   * Procesa una actualización del endpoint `/lol-matchmaking/v1/ready-check`.
   * Un valor `null` indica que el ReadyCheck desapareció y el ciclo finaliza.
   */
  manejarEvento(evento: ReadyCheckEvent | null): void {
    if (!evento) {
      this.finalizarCiclo();
      return;
    }

    if (!this.habilitado) {
      return;
    }

    if (evento.state === 'InProgress' && evento.playerResponse === 'None') {
      if (!this.hayAceptacionPendiente() && !this.aceptacionEnviada) {
        this.programarAceptacion();
      }
      return;
    }

    // Cualquier otro estado (EveryoneReady, StrangerNotReady o una respuesta ya emitida)
    // marca el final del ciclo: se cancela lo pendiente y se rearma para el próximo ReadyCheck.
    this.finalizarCiclo();
  }

  /** Cancela una aceptación pendiente sin afectar el estado habilitado. */
  cancelar(): void {
    this.limpiarTemporizador();
  }

  /** Finaliza el ciclo actual del ReadyCheck y rearma el servicio para el siguiente. */
  private finalizarCiclo(): void {
    this.limpiarTemporizador();
    this.aceptacionEnviada = false;
  }

  /** Agenda el envío de la aceptación tras el retardo calculado. */
  private programarAceptacion(): void {
    const esperaMs = calcularRetrasoMilisegundos(this.retrasoSegundos, this.varianzaHumana, this.aleatorio);

    const temporizador = setTimeout(() => {
      this.temporizador = null;
      void this.ejecutarAceptacion();
    }, esperaMs);
    temporizador.unref?.();
    this.temporizador = temporizador;

    // Se emite después de registrar el temporizador para que los oyentes
    // (p. ej. el estado vivo de `LcuClient`) observen `aceptacionPendiente: true`.
    this.emit('programado', { esperaMs });
  }

  /** Envía la aceptación a la LCU y notifica el resultado. */
  private async ejecutarAceptacion(): Promise<void> {
    this.aceptacionEnviada = true;
    try {
      await this.aceptador.acceptReadyCheck();
      this.emit('aceptado');
    } catch (error) {
      // Ante un fallo se rearma el ciclo para reintentar en la próxima actualización del ReadyCheck.
      this.aceptacionEnviada = false;
      this.emit('fallo-aceptacion', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** Limpia el temporizador pendiente, si existe. */
  private limpiarTemporizador(): void {
    if (this.temporizador) {
      clearTimeout(this.temporizador);
      this.temporizador = null;
    }
  }
}
