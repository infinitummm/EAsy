import { describe, it, expect, vi } from 'vitest';
import {
  evaluarVisibilidadPanel,
  AugmentPanelDetector,
  type MuestraRoi,
} from '../../src/main/ocr/AugmentPanelDetector';

describe('AugmentPanelDetector - Detección Visual del Panel de Aumentos (RF-1)', () => {
  it('detecta panel visible cuando los rerolls son dorados y los fondos oscuros', () => {
    const muestras: MuestraRoi[] = [
      { tipo: 'reroll', color: { r: 245, g: 220, b: 150 } }, // Dorado hextech
      { tipo: 'reroll', color: { r: 240, g: 215, b: 145 } }, // Dorado hextech
      { tipo: 'reroll', color: { r: 200, g: 180, b: 120 } }, // Dorado hextech
      { tipo: 'fondo', color: { r: 40, g: 45, b: 50 } },     // Oscuro
      { tipo: 'fondo', color: { r: 50, g: 55, b: 60 } },     // Oscuro
      { tipo: 'fondo', color: { r: 45, g: 50, b: 55 } },     // Oscuro
    ];

    expect(evaluarVisibilidadPanel(muestras)).toBe(true);
  });

  it('detecta panel NO visible en terreno normal de LoL (hierba, río, grieta)', () => {
    const muestrasTerreno: MuestraRoi[] = [
      { tipo: 'reroll', color: { r: 45, g: 110, b: 60 } }, // Verde hierba
      { tipo: 'reroll', color: { r: 60, g: 80, b: 120 } },  // Azul agua
      { tipo: 'reroll', color: { r: 100, g: 90, b: 85 } },  // Tierra
      { tipo: 'fondo', color: { r: 150, g: 145, b: 130 } }, // Suelo claro
      { tipo: 'fondo', color: { r: 140, g: 135, b: 120 } },
      { tipo: 'fondo', color: { r: 130, g: 125, b: 115 } },
    ];

    expect(evaluarVisibilidadPanel(muestrasTerreno)).toBe(false);
  });

  it('tolera si un botón de reroll está ligeramente oscurecido o gastado', () => {
    const muestrasParciales: MuestraRoi[] = [
      { tipo: 'reroll', color: { r: 245, g: 220, b: 150 } }, // 1 dorado
      { tipo: 'reroll', color: { r: 70, g: 70, b: 70 } },    // gastado
      { tipo: 'reroll', color: { r: 60, g: 60, b: 60 } },    // gastado
      { tipo: 'fondo', color: { r: 35, g: 40, b: 45 } },     // Fondo 1 oscuro
      { tipo: 'fondo', color: { r: 40, g: 45, b: 50 } },     // Fondo 2 oscuro
      { tipo: 'fondo', color: { r: 38, g: 42, b: 48 } },     // Fondo 3 oscuro
    ];

    // 1 reroll dorado + al menos 2 fondos oscuros -> true
    expect(evaluarVisibilidadPanel(muestrasParciales)).toBe(true);
  });

  it('devuelve false ante muestras vacías o nulas', () => {
    expect(evaluarVisibilidadPanel([])).toBe(false);
    expect(evaluarVisibilidadPanel(null as any)).toBe(false);
  });

  it('gestiona la máquina de estados con debounce y oferta consumida', async () => {
    const detector = new AugmentPanelDetector();
    const onAbrir = vi.fn();
    const onCerrar = vi.fn();

    // Simular método capturarMuestras para controlar los ticks
    const muestrasPositivas: MuestraRoi[] = [
      { tipo: 'reroll', color: { r: 245, g: 220, b: 150 } },
      { tipo: 'reroll', color: { r: 240, g: 215, b: 145 } },
      { tipo: 'fondo', color: { r: 40, g: 45, b: 50 } },
      { tipo: 'fondo', color: { r: 45, g: 50, b: 55 } },
    ];

    const muestrasNegativas: MuestraRoi[] = [
      { tipo: 'reroll', color: { r: 40, g: 50, b: 60 } },
      { tipo: 'reroll', color: { r: 40, g: 50, b: 60 } },
      { tipo: 'fondo', color: { r: 150, g: 150, b: 150 } },
      { tipo: 'fondo', color: { r: 150, g: 150, b: 150 } },
    ];

    let muestrasActuales = muestrasPositivas;
    vi.spyOn(detector, 'capturarMuestras').mockImplementation(async () => muestrasActuales);

    // Arrancamos el detector
    detector.start(onAbrir, onCerrar);

    // Tick 1 (positivo): abre inmediatamente (1 confirmación)
    await (detector as any).ejecutarTick();
    expect(detector.isPanelVisible()).toBe(true);
    expect(onAbrir).toHaveBeenCalledTimes(1);

    // Muestras cambian a negativas (el usuario eligió augment)
    muestrasActuales = muestrasNegativas;

    // Tick 2 (primer negativo): aún NO cierra (debounce = 2 negativos)
    await (detector as any).ejecutarTick();
    expect(detector.isPanelVisible()).toBe(true);
    expect(onCerrar).toHaveBeenCalledTimes(0);

    // Tick 3 (segundo negativo consecutivo): ahora SÍ cierra
    await (detector as any).ejecutarTick();
    expect(detector.isPanelVisible()).toBe(false);
    expect(onCerrar).toHaveBeenCalledTimes(1);

    // Oferta consumida: aunque aparezcan muestras positivas residuales, no reabre de inmediato
    muestrasActuales = muestrasPositivas;
    await (detector as any).ejecutarTick();
    expect(onAbrir).toHaveBeenCalledTimes(1); // No vuelve a llamar

    // Tras resetOferta (nuevo nivel / nueva ronda), sí vuelve a abrir
    detector.resetOferta();
    await (detector as any).ejecutarTick();
    expect(onAbrir).toHaveBeenCalledTimes(2);

    detector.stop();
  });
});
