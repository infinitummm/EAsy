/**
 * Limitador de tasa Token Bucket dual (ventana corta + ventana larga) — T-3.3.
 *
 * Diseñado para la API de Riot (20 peticiones/1 s y 100 peticiones/120 s con
 * clave de desarrollo) y reutilizable para Gemini (15/min y 1500/día).
 *
 * Características:
 *  - Encola las peticiones en FIFO y las resuelve a medida que hay tokens.
 *  - Respeta ambos límites de forma simultánea (el que se agote primero manda).
 *  - `reportResult(429, retryAfter)` activa un backoff que pausa toda la cola.
 *  - `getStatus()` expone tokens disponibles y estado de bloqueo para la UI.
 *
 * Los tokens se reabastecen de forma continua (fracciones incluidas), por lo
 * que no hay ráfagas artificiales tras una espera.
 */

import { GEMINI_RATE_LIMITS, RIOT_RATE_LIMITS } from '@shared/constants';
import type { IRateLimiter, RateLimitStatus } from '@shared/contracts';

/** Backoff por defecto (ms) si el servidor responde 429 sin cabecera `Retry-After`. */
export const BACKOFF_POR_DEFECTO_MS = 1_000;

export interface OpcionesRateLimiter {
  /** Servicio asociado (solo descriptivo en `getStatus()`). */
  servicio: 'RIOT' | 'GEMINI';
  /** Duración de la ventana corta en milisegundos. */
  ventanaCortaMs: number;
  /** Máximo de peticiones permitidas dentro de la ventana corta. */
  maxPeticionesVentanaCorta: number;
  /** Duración de la ventana larga en milisegundos. */
  ventanaLargaMs: number;
  /** Máximo de peticiones permitidas dentro de la ventana larga. */
  maxPeticionesVentanaLarga: number;
  /** Backoff (ms) al recibir 429 sin `Retry-After`. Por defecto 1000 ms. */
  backoffPorDefectoMs?: number;
}

/** Error de configuración del limitador (parámetros inválidos). */
export class ErrorConfiguracionRateLimiter extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorConfiguracionRateLimiter';
  }
}

function validarPositivo(valor: number, nombre: string): void {
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new ErrorConfiguracionRateLimiter(`El parámetro "${nombre}" debe ser un número positivo.`);
  }
}

export class RateLimiter implements IRateLimiter {
  private readonly config: Required<OpcionesRateLimiter>;
  private tokensCortos: number;
  private tokensLargos: number;
  private ultimaRecarga: number;
  private bloqueadoHasta = 0;
  /** Cola FIFO de peticiones esperando un token. */
  private readonly cola: Array<() => void> = [];
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private procesando = false;

  constructor(opciones: OpcionesRateLimiter) {
    validarPositivo(opciones.ventanaCortaMs, 'ventanaCortaMs');
    validarPositivo(opciones.maxPeticionesVentanaCorta, 'maxPeticionesVentanaCorta');
    validarPositivo(opciones.ventanaLargaMs, 'ventanaLargaMs');
    validarPositivo(opciones.maxPeticionesVentanaLarga, 'maxPeticionesVentanaLarga');

    const backoff = opciones.backoffPorDefectoMs ?? BACKOFF_POR_DEFECTO_MS;
    validarPositivo(backoff, 'backoffPorDefectoMs');

    this.config = { ...opciones, backoffPorDefectoMs: backoff };
    this.tokensCortos = opciones.maxPeticionesVentanaCorta;
    this.tokensLargos = opciones.maxPeticionesVentanaLarga;
    this.ultimaRecarga = Date.now();
  }

  /**
   * Solicita un turno. La promesa se resuelve cuando hay tokens disponibles
   * en ambas ventanas y no existe un backoff activo.
   */
  acquire(): Promise<void> {
    return new Promise<void>((resolver) => {
      this.cola.push(resolver);
      this.procesar();
    });
  }

  /**
   * Informa el resultado de una petición ya ejecutada.
   *  - 429: activa/extiende el backoff según `retryAfterSeconds` (por defecto 1 s).
   *  - 2xx: limpia cualquier backoff activo.
   */
  reportResult(statusCode: number, retryAfterSeconds?: number): void {
    if (statusCode === 429) {
      const segundos =
        Number.isFinite(retryAfterSeconds) && (retryAfterSeconds as number) > 0
          ? (retryAfterSeconds as number)
          : this.config.backoffPorDefectoMs / 1000;

      this.bloqueadoHasta = Math.max(this.bloqueadoHasta, Date.now() + segundos * 1000);
      this.reprogramar();
      return;
    }

    if (statusCode >= 200 && statusCode < 300) {
      this.bloqueadoHasta = 0;
    }
  }

  /** Estado actual (tokens reabastecidos al momento de la consulta). */
  getStatus(): RateLimitStatus {
    const ahora = Date.now();
    this.reabastecer(ahora);
    const bloqueo = Math.max(0, this.bloqueadoHasta - ahora);

    return {
      service: this.config.servicio,
      tokensAvailableShort: Math.floor(this.tokensCortos),
      tokensAvailableLong: Math.floor(this.tokensLargos),
      isThrottled: bloqueo > 0,
      backoffMs: bloqueo,
    };
  }

  // ---------- Internos ----------

  /** Reparte los tokens acumulados desde la última recarga (continuo, sin ráfagas). */
  private reabastecer(ahora: number): void {
    const delta = ahora - this.ultimaRecarga;
    if (delta <= 0) return;

    this.tokensCortos = Math.min(
      this.config.maxPeticionesVentanaCorta,
      this.tokensCortos + (delta * this.config.maxPeticionesVentanaCorta) / this.config.ventanaCortaMs
    );
    this.tokensLargos = Math.min(
      this.config.maxPeticionesVentanaLarga,
      this.tokensLargos + (delta * this.config.maxPeticionesVentanaLarga) / this.config.ventanaLargaMs
    );
    this.ultimaRecarga = ahora;
  }

  /** Despierta la cola: entrega tokens mientras sea posible y programa el resto. */
  private procesar(): void {
    if (this.procesando) return;
    this.procesando = true;

    try {
      while (this.cola.length > 0) {
        const ahora = Date.now();
        this.reabastecer(ahora);

        const esperaBloqueo = this.bloqueadoHasta - ahora;
        if (esperaBloqueo > 0) {
          this.programar(esperaBloqueo + 1);
          return;
        }

        if (this.tokensCortos >= 1 && this.tokensLargos >= 1) {
          this.tokensCortos -= 1;
          this.tokensLargos -= 1;
          const resolver = this.cola.shift() as () => void;
          resolver();
          continue;
        }

        this.programar(this.calcularEspera());
        return;
      }
    } finally {
      this.procesando = false;
    }
  }

  /** Milisegundos hasta conseguir un token en ambas ventanas (con margen de 1 ms). */
  private calcularEspera(): number {
    const deficitCorto = Math.max(0, 1 - this.tokensCortos);
    const deficitLargo = Math.max(0, 1 - this.tokensLargos);
    const msCorto = (deficitCorto * this.config.ventanaCortaMs) / this.config.maxPeticionesVentanaCorta;
    const msLargo = (deficitLargo * this.config.ventanaLargaMs) / this.config.maxPeticionesVentanaLarga;
    return Math.ceil(Math.max(msCorto, msLargo)) + 1;
  }

  private programar(ms: number): void {
    if (this.temporizador) {
      clearTimeout(this.temporizador);
    }
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      this.procesar();
    }, Math.max(1, Math.ceil(ms)));
    this.temporizador.unref?.();
  }

  /** Recalcula la espera (p. ej. tras un 429 con backoff mayor al programado). */
  private reprogramar(): void {
    if (this.temporizador) {
      clearTimeout(this.temporizador);
      this.temporizador = null;
    }
    this.procesar();
  }
}

// ==========================================
// Fábricas de conveniencia
// ==========================================

/** Limitador con los límites oficiales de la Riot API (20/1 s y 100/120 s). */
export function crearRateLimiterRiot(
  ajustes: Partial<Omit<OpcionesRateLimiter, 'servicio'>> = {}
): RateLimiter {
  return new RateLimiter({
    servicio: 'RIOT',
    ventanaCortaMs: RIOT_RATE_LIMITS.SHORT_WINDOW_MS,
    maxPeticionesVentanaCorta: RIOT_RATE_LIMITS.SHORT_WINDOW_MAX_REQUESTS,
    ventanaLargaMs: RIOT_RATE_LIMITS.LONG_WINDOW_MS,
    maxPeticionesVentanaLarga: RIOT_RATE_LIMITS.LONG_WINDOW_MAX_REQUESTS,
    ...ajustes,
  });
}

/** Limitador con los límites del tier gratuito de Gemini (15/min y 1500/día). */
export function crearRateLimiterGemini(
  ajustes: Partial<Omit<OpcionesRateLimiter, 'servicio'>> = {}
): RateLimiter {
  return new RateLimiter({
    servicio: 'GEMINI',
    ventanaCortaMs: 60_000,
    maxPeticionesVentanaCorta: GEMINI_RATE_LIMITS.REQUESTS_PER_MINUTE,
    ventanaLargaMs: 24 * 60 * 60 * 1000,
    maxPeticionesVentanaLarga: GEMINI_RATE_LIMITS.REQUESTS_PER_DAY,
    ...ajustes,
  });
}
