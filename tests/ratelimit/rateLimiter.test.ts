/**
 * Pruebas unitarias del limitador de tasa Token Bucket dual (T-3.3).
 *
 * Usa temporizadores falsos para verificar de forma determinista las ráfagas,
 * el reabastecimiento continuo de ambas ventanas, el orden FIFO y el backoff
 * de las respuestas 429 con y sin cabecera `Retry-After`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ErrorConfiguracionRateLimiter,
  RateLimiter,
  crearRateLimiterGemini,
  crearRateLimiterRiot,
  type OpcionesRateLimiter,
} from '../../src/main/ratelimit/RateLimiter';

/** Crea un limitador de prueba con ventanas holgadas salvo ajustes explícitos. */
function crearLimitadorPrueba(ajustes: Partial<OpcionesRateLimiter> = {}): RateLimiter {
  return new RateLimiter({
    servicio: 'RIOT',
    ventanaCortaMs: 1_000,
    maxPeticionesVentanaCorta: 20,
    ventanaLargaMs: 120_000,
    maxPeticionesVentanaLarga: 100,
    ...ajustes,
  });
}

function rango(cantidad: number): number[] {
  return Array.from({ length: cantidad }, (_, indice) => indice);
}

describe('RateLimiter (T-3.3)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(1_000_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('ráfaga y cola FIFO', () => {
    it('entrega la ráfaga inicial de 20 peticiones sin esperar', async () => {
      const limitador = crearRateLimiterRiot();
      const resueltos: number[] = [];

      const promesas = rango(20).map((indice) =>
        limitador.acquire().then(() => {
          resueltos.push(indice);
        })
      );

      await Promise.all(promesas);
      expect(resueltos).toEqual(rango(20));
      expect(limitador.getStatus().tokensAvailableShort).toBe(0);
    });

    it('encola la petición 21 hasta que se recarga un token (~50 ms)', async () => {
      const limitador = crearRateLimiterRiot();
      await Promise.all(rango(20).map(() => limitador.acquire()));

      let resuelta = false;
      void limitador.acquire().then(() => {
        resuelta = true;
      });

      await vi.advanceTimersByTimeAsync(49);
      expect(resuelta).toBe(false);

      await vi.advanceTimersByTimeAsync(2);
      expect(resuelta).toBe(true);
    });

    it('mantiene el orden FIFO con una cola mixta (ráfaga + esperas)', async () => {
      const limitador = crearRateLimiterRiot();
      const resueltos: number[] = [];

      rango(23).forEach((indice) => {
        void limitador.acquire().then(() => {
          resueltos.push(indice);
        });
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(resueltos).toEqual(rango(20));

      await vi.advanceTimersByTimeAsync(60);
      expect(resueltos).toEqual(rango(21));

      await vi.advanceTimersByTimeAsync(100);
      expect(resueltos).toEqual(rango(23));
    });

    it('refleja el progreso con adelantos intermedios (25 peticiones)', async () => {
      const limitador = crearRateLimiterRiot();
      const resueltos: number[] = [];

      rango(25).forEach((indice) => {
        void limitador.acquire().then(() => {
          resueltos.push(indice);
        });
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(resueltos).toHaveLength(20);

      await vi.advanceTimersByTimeAsync(110);
      expect(resueltos).toHaveLength(22);

      await vi.advanceTimersByTimeAsync(190);
      expect(resueltos).toEqual(rango(25));
    });
  });

  describe('ventanas independientes', () => {
    it('respeta la ventana larga cuando la corta es holgada', async () => {
      const limitador = crearLimitadorPrueba({
        ventanaCortaMs: 1_000,
        maxPeticionesVentanaCorta: 1_000,
        ventanaLargaMs: 120_000,
        maxPeticionesVentanaLarga: 100,
      });

      await Promise.all(rango(100).map(() => limitador.acquire()));
      expect(limitador.getStatus().tokensAvailableLong).toBe(0);

      let resuelta = false;
      void limitador.acquire().then(() => {
        resuelta = true;
      });

      // Reabastecimiento largo: 1 token cada 1200 ms (100 tokens / 120 s).
      await vi.advanceTimersByTimeAsync(600);
      expect(resuelta).toBe(false);

      await vi.advanceTimersByTimeAsync(603);
      expect(resuelta).toBe(true);
    });

    it('reabastece por completo tras transcurrir la ventana corta', async () => {
      const limitador = crearRateLimiterRiot();
      await Promise.all(rango(20).map(() => limitador.acquire()));
      expect(limitador.getStatus().tokensAvailableShort).toBe(0);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(limitador.getStatus().tokensAvailableShort).toBe(20);

      let resuelta = false;
      void limitador.acquire().then(() => {
        resuelta = true;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(resuelta).toBe(true);
    });
  });

  describe('estado y fábricas', () => {
    it('getStatus inicial refleja los límites de Riot', () => {
      const limitador = crearRateLimiterRiot();
      expect(limitador.getStatus()).toEqual({
        service: 'RIOT',
        tokensAvailableShort: 20,
        tokensAvailableLong: 100,
        isThrottled: false,
        backoffMs: 0,
      });
    });

    it('la fábrica de Gemini usa 15/min y 1500/día', () => {
      const limitador = crearRateLimiterGemini();
      expect(limitador.getStatus()).toEqual({
        service: 'GEMINI',
        tokensAvailableShort: 15,
        tokensAvailableLong: 1500,
        isThrottled: false,
        backoffMs: 0,
      });
    });

    it('valida los parámetros del constructor', () => {
      const base: OpcionesRateLimiter = {
        servicio: 'RIOT',
        ventanaCortaMs: 1_000,
        maxPeticionesVentanaCorta: 20,
        ventanaLargaMs: 120_000,
        maxPeticionesVentanaLarga: 100,
      };

      expect(() => new RateLimiter({ ...base, ventanaCortaMs: 0 })).toThrow(
        ErrorConfiguracionRateLimiter
      );
      expect(() => new RateLimiter({ ...base, maxPeticionesVentanaCorta: -1 })).toThrow(
        ErrorConfiguracionRateLimiter
      );
      expect(() => new RateLimiter({ ...base, ventanaLargaMs: Number.NaN })).toThrow(
        ErrorConfiguracionRateLimiter
      );
      expect(() => new RateLimiter({ ...base, maxPeticionesVentanaLarga: 0 })).toThrow(
        ErrorConfiguracionRateLimiter
      );
      expect(() => new RateLimiter({ ...base, backoffPorDefectoMs: 0 })).toThrow(
        ErrorConfiguracionRateLimiter
      );
    });
  });

  describe('manejo de respuestas 429 y backoff', () => {
    it('pausa la cola durante el Retry-After indicado', async () => {
      const limitador = crearRateLimiterRiot();
      await limitador.acquire();

      limitador.reportResult(429, 2);
      expect(limitador.getStatus().isThrottled).toBe(true);
      expect(limitador.getStatus().backoffMs).toBe(2_000);

      let resuelta = false;
      void limitador.acquire().then(() => {
        resuelta = true;
      });

      await vi.advanceTimersByTimeAsync(1_999);
      expect(resuelta).toBe(false);

      await vi.advanceTimersByTimeAsync(2);
      expect(resuelta).toBe(true);
      expect(limitador.getStatus().isThrottled).toBe(false);
    });

    it('usa 1 segundo de backoff si el 429 no trae Retry-After', async () => {
      const limitador = crearRateLimiterRiot();
      limitador.reportResult(429);
      expect(limitador.getStatus().backoffMs).toBe(1_000);

      let resuelta = false;
      void limitador.acquire().then(() => {
        resuelta = true;
      });

      await vi.advanceTimersByTimeAsync(999);
      expect(resuelta).toBe(false);

      await vi.advanceTimersByTimeAsync(3);
      expect(resuelta).toBe(true);
    });

    it('extiende el backoff solo si el nuevo vencimiento es mayor', async () => {
      const limitador = crearRateLimiterRiot();

      limitador.reportResult(429, 3);
      expect(limitador.getStatus().backoffMs).toBe(3_000);

      // Un 429 con espera menor no debe acortar el bloqueo vigente.
      limitador.reportResult(429, 1);
      expect(limitador.getStatus().backoffMs).toBe(3_000);

      // Avanzamos 2 s: ahora un backoff mayor sí lo extiende.
      await vi.advanceTimersByTimeAsync(2_000);
      limitador.reportResult(429, 2);
      expect(limitador.getStatus().backoffMs).toBe(2_000);
    });

    it('una respuesta 2xx limpia el backoff; otros códigos no lo modifican', () => {
      const limitador = crearRateLimiterRiot();
      limitador.reportResult(429, 5);
      expect(limitador.getStatus().isThrottled).toBe(true);

      limitador.reportResult(500);
      expect(limitador.getStatus().isThrottled).toBe(true);

      limitador.reportResult(204);
      expect(limitador.getStatus().isThrottled).toBe(false);
      expect(limitador.getStatus().backoffMs).toBe(0);
    });

    it('el backoff pausa aunque haya tokens disponibles', async () => {
      const limitador = crearRateLimiterRiot();
      await Promise.all(rango(20).map(() => limitador.acquire()));

      let resuelta = false;
      void limitador.acquire().then(() => {
        resuelta = true;
      });

      // Programado para ~51 ms; el 429 con Retry-After: 1 debe postergarlo.
      limitador.reportResult(429, 1);

      await vi.advanceTimersByTimeAsync(100);
      expect(resuelta).toBe(false);

      await vi.advanceTimersByTimeAsync(902);
      expect(resuelta).toBe(true);
    });
  });
});
