/**
 * Pruebas unitarias del servicio de Auto-Accept (T-2.5).
 * Se utilizan temporizadores falsos de Vitest para verificar retardos exactos.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AutoAcceptService,
  VARIANZA_HUMANA_MAXIMA_MS,
  calcularRetrasoMilisegundos,
  normalizarRetrasoSegundos,
  type AceptadorReadyCheck,
} from '../../src/main/lcu/AutoAcceptService';
import type { ReadyCheckEvent } from '../../src/shared/types';

/** Construye un evento de ReadyCheck con valores por defecto sensatos. */
function eventoReadyCheck(parcial: Partial<ReadyCheckEvent> = {}): ReadyCheckEvent {
  return {
    state: 'InProgress',
    playerResponse: 'None',
    suppressCountdown: false,
    timer: 10,
    ...parcial,
  };
}

describe('cálculo y normalización del retardo (T-2.5)', () => {
  it('debe normalizar el retardo al rango [0, 8] segundos', () => {
    expect(normalizarRetrasoSegundos(-5)).toBe(0);
    expect(normalizarRetrasoSegundos(0)).toBe(0);
    expect(normalizarRetrasoSegundos(3.5)).toBe(3.5);
    expect(normalizarRetrasoSegundos(99)).toBe(8);
    expect(normalizarRetrasoSegundos(Number.NaN)).toBe(2);
  });

  it('debe convertir segundos a milisegundos sin varianza', () => {
    expect(calcularRetrasoMilisegundos(2, false)).toBe(2000);
    expect(calcularRetrasoMilisegundos(0, false)).toBe(0);
    expect(calcularRetrasoMilisegundos(8, false)).toBe(8000);
  });

  it('debe aplicar una fluctuación humana de ±0.5 segundos', () => {
    expect(calcularRetrasoMilisegundos(2, true, () => 0)).toBe(2000 - VARIANZA_HUMANA_MAXIMA_MS);
    expect(calcularRetrasoMilisegundos(2, true, () => 1)).toBe(2000 + VARIANZA_HUMANA_MAXIMA_MS);
    expect(calcularRetrasoMilisegundos(2, true, () => 0.5)).toBe(2000);
  });

  it('nunca debe producir un retardo negativo', () => {
    expect(calcularRetrasoMilisegundos(0, true, () => 0)).toBe(0);
  });
});

describe('AutoAcceptService (T-2.5)', () => {
  let aceptaciones: number;
  let aceptador: AceptadorReadyCheck;

  beforeEach(() => {
    vi.useFakeTimers();
    aceptaciones = 0;
    aceptador = {
      acceptReadyCheck: async () => {
        aceptaciones += 1;
      },
    };
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('no debe aceptar nada mientras está deshabilitado', async () => {
    const servicio = new AutoAcceptService(aceptador, { varianzaHumana: false });

    servicio.manejarEvento(eventoReadyCheck());
    await vi.advanceTimersByTimeAsync(9000);

    expect(aceptaciones).toBe(0);
    expect(servicio.estaHabilitado()).toBe(false);
  });

  it('debe aceptar exactamente tras el retardo configurado', async () => {
    const servicio = new AutoAcceptService(aceptador, { retrasoSegundos: 2, varianzaHumana: false });
    servicio.configurar(true, 2);

    servicio.manejarEvento(eventoReadyCheck());
    expect(servicio.hayAceptacionPendiente()).toBe(true);

    await vi.advanceTimersByTimeAsync(1999);
    expect(aceptaciones).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(aceptaciones).toBe(1);
    expect(servicio.hayAceptacionPendiente()).toBe(false);
  });

  it('debe respetar el retardo máximo de 8 segundos', async () => {
    const servicio = new AutoAcceptService(aceptador, { varianzaHumana: false });
    servicio.configurar(true, 99);

    expect(servicio.obtenerRetrasoSegundos()).toBe(8);
    servicio.manejarEvento(eventoReadyCheck());
    await vi.advanceTimersByTimeAsync(8000);

    expect(aceptaciones).toBe(1);
  });

  it('debe aceptar de inmediato con retardo 0', async () => {
    const servicio = new AutoAcceptService(aceptador, { retrasoSegundos: 0, varianzaHumana: false });
    servicio.configurar(true, 0);

    servicio.manejarEvento(eventoReadyCheck());
    await vi.advanceTimersByTimeAsync(0);

    expect(aceptaciones).toBe(1);
  });

  it('debe programar solo una aceptación aunque lleguen eventos repetidos', async () => {
    const servicio = new AutoAcceptService(aceptador, { retrasoSegundos: 3, varianzaHumana: false });
    servicio.configurar(true, 3);

    servicio.manejarEvento(eventoReadyCheck());
    servicio.manejarEvento(eventoReadyCheck());
    servicio.manejarEvento(eventoReadyCheck());
    await vi.advanceTimersByTimeAsync(3000);
    // Tras aceptar, los eventos repetidos del mismo ciclo no deben reprogramar.
    servicio.manejarEvento(eventoReadyCheck());
    await vi.advanceTimersByTimeAsync(10000);

    expect(aceptaciones).toBe(1);
  });

  it('no debe aceptar si el jugador ya respondió (Accepted o Declined)', async () => {
    const servicio = new AutoAcceptService(aceptador, { retrasoSegundos: 2, varianzaHumana: false });
    servicio.configurar(true, 2);

    servicio.manejarEvento(eventoReadyCheck({ playerResponse: 'Accepted' }));
    servicio.manejarEvento(eventoReadyCheck({ playerResponse: 'Declined' }));
    await vi.advanceTimersByTimeAsync(5000);

    expect(aceptaciones).toBe(0);
  });

  it('debe cancelar la aceptación pendiente si todos aceptaron antes del retardo', async () => {
    const servicio = new AutoAcceptService(aceptador, { retrasoSegundos: 2, varianzaHumana: false });
    servicio.configurar(true, 2);

    servicio.manejarEvento(eventoReadyCheck());
    expect(servicio.hayAceptacionPendiente()).toBe(true);

    servicio.manejarEvento(eventoReadyCheck({ state: 'EveryoneReady' }));
    expect(servicio.hayAceptacionPendiente()).toBe(false);

    await vi.advanceTimersByTimeAsync(5000);
    expect(aceptaciones).toBe(0);
  });

  it('debe finalizar el ciclo cuando el ReadyCheck desaparece y permitir uno nuevo', async () => {
    const servicio = new AutoAcceptService(aceptador, { retrasoSegundos: 2, varianzaHumana: false });
    servicio.configurar(true, 2);

    servicio.manejarEvento(eventoReadyCheck());
    servicio.manejarEvento(null);
    await vi.advanceTimersByTimeAsync(5000);
    expect(aceptaciones).toBe(0);

    // Nuevo ReadyCheck posterior: debe volver a aceptar.
    servicio.manejarEvento(eventoReadyCheck());
    await vi.advanceTimersByTimeAsync(2000);
    expect(aceptaciones).toBe(1);
  });

  it('debe cancelar la aceptación pendiente al deshabilitar el servicio', async () => {
    const servicio = new AutoAcceptService(aceptador, { retrasoSegundos: 2, varianzaHumana: false });
    servicio.configurar(true, 2);

    servicio.manejarEvento(eventoReadyCheck());
    servicio.configurar(false);
    await vi.advanceTimersByTimeAsync(5000);

    expect(aceptaciones).toBe(0);
    expect(servicio.hayAceptacionPendiente()).toBe(false);
  });

  it('debe emitir "programado" con la espera calculada y "aceptado" al completar', async () => {
    const servicio = new AutoAcceptService(aceptador, { retrasoSegundos: 2, varianzaHumana: false });
    servicio.configurar(true, 2);

    const esperas: number[] = [];
    let eventoAceptado = false;
    servicio.on('programado', (datos: { esperaMs: number }) => esperas.push(datos.esperaMs));
    servicio.on('aceptado', () => {
      eventoAceptado = true;
    });

    servicio.manejarEvento(eventoReadyCheck());
    await vi.advanceTimersByTimeAsync(2000);

    expect(esperas).toEqual([2000]);
    expect(eventoAceptado).toBe(true);
  });

  it('debe aplicar la varianza humana con la fuente de aleatoriedad inyectada', async () => {
    // aleatorio() = 0 => fluctuación de -500 ms; con retardo 2 s => 1500 ms.
    const servicio = new AutoAcceptService(aceptador, {
      retrasoSegundos: 2,
      varianzaHumana: true,
      aleatorio: () => 0,
    });
    servicio.configurar(true, 2);

    servicio.manejarEvento(eventoReadyCheck());
    await vi.advanceTimersByTimeAsync(1499);
    expect(aceptaciones).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(aceptaciones).toBe(1);
  });

  it('debe emitir "fallo-aceptacion" y reintentar en el siguiente evento si la LCU falla', async () => {
    let intentos = 0;
    const aceptadorConFallo: AceptadorReadyCheck = {
      acceptReadyCheck: async () => {
        intentos += 1;
        if (intentos === 1) {
          throw new Error('LCU no disponible');
        }
        aceptaciones += 1;
      },
    };
    const servicio = new AutoAcceptService(aceptadorConFallo, { retrasoSegundos: 1, varianzaHumana: false });
    servicio.configurar(true, 1);

    const fallos: Error[] = [];
    servicio.on('fallo-aceptacion', (error: Error) => fallos.push(error));

    servicio.manejarEvento(eventoReadyCheck());
    await vi.advanceTimersByTimeAsync(1000);
    expect(fallos).toHaveLength(1);
    expect(fallos[0].message).toBe('LCU no disponible');

    // El siguiente tick del ReadyCheck reintenta y esta vez tiene éxito.
    servicio.manejarEvento(eventoReadyCheck());
    await vi.advanceTimersByTimeAsync(1000);
    expect(aceptaciones).toBe(1);
  });
});
