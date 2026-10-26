import { describe, it, expect, vi } from 'vitest';
import {
  evaluarVisibilidadPanel,
  AugmentPanelDetector,
  calcularDHash8x8,
  calcularDistanciaHamming,
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
      { tipo: 'fondo_entorno', color: { r: 20, g: 25, b: 30 } }, // Viñeteado oscuro del modal
      { tipo: 'fondo_entorno', color: { r: 25, g: 30, b: 35 } },
    ];

    expect(evaluarVisibilidadPanel(muestras)).toBe(true);
  });

  it('rechaza y devuelve false cuando la pantalla de la Tienda o Tab está abierta (entorno muy iluminado)', () => {
    const muestrasTienda: MuestraRoi[] = [
      { tipo: 'reroll', color: { r: 245, g: 220, b: 150 } }, // Elementos dorados en la tienda
      { tipo: 'reroll', color: { r: 240, g: 215, b: 145 } },
      { tipo: 'fondo', color: { r: 40, g: 45, b: 50 } },
      { tipo: 'fondo_entorno', color: { r: 160, g: 155, b: 140 } }, // Tienda iluminada / fondo claro
      { tipo: 'fondo_entorno', color: { r: 140, g: 145, b: 150 } },
    ];

    expect(evaluarVisibilidadPanel(muestrasTienda)).toBe(false);
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

  it('calcula dHash 8x8 y distancia de Hamming correctamente', () => {
    // Generar un bitmap sintético BGRA de 100x100
    const width = 100;
    const height = 100;
    const bmp = Buffer.alloc(width * height * 4);

    // Rellenar con un degradado horizontal
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const val = Math.min(255, x * 2);
        bmp[idx] = val;     // B
        bmp[idx + 1] = val; // G
        bmp[idx + 2] = val; // R
        bmp[idx + 3] = 255; // A
      }
    }

    const hash1 = calcularDHash8x8(bmp, width, height, { rx: 0.1, ry: 0.1, rw: 0.5, rh: 0.5 });
    expect(hash1).toBeDefined();
    expect(hash1.length).toBe(16);

    // Mismo contenido -> distancia Hamming 0
    expect(calcularDistanciaHamming(hash1, hash1)).toBe(0);

    // Hashes idénticos o con diferente longitud
    expect(calcularDistanciaHamming('0000000000000000', 'ffffffffffffffff')).toBe(64);
    expect(calcularDistanciaHamming('0000000000000000', '000000000000000f')).toBe(4);
  });

  it('detecta reroll automático cuando cambia el hash de una carta en pantalla', async () => {
    const detector = new AugmentPanelDetector();
    const onAbrir = vi.fn();
    const onCerrar = vi.fn();
    const onReroll = vi.fn();

    const muestrasPositivas: MuestraRoi[] = [
      { tipo: 'reroll', color: { r: 245, g: 220, b: 150 } },
      { tipo: 'reroll', color: { r: 240, g: 215, b: 145 } },
      { tipo: 'fondo', color: { r: 40, g: 45, b: 50 } },
      { tipo: 'fondo', color: { r: 45, g: 50, b: 55 } },
    ];

    vi.spyOn(detector, 'capturarMuestras').mockImplementation(async () => muestrasPositivas);

    let hashesActuales: [string, string, string] = [
      '1111111111111111',
      '2222222222222222',
      '3333333333333333',
    ];

    vi.spyOn(detector, 'capturarHashesCartas').mockImplementation(async () => hashesActuales);

    detector.start(onAbrir, onCerrar, onReroll);

    // Tick 1: Panel se abre
    await detector.ejecutarTick();
    expect(detector.isPanelVisible()).toBe(true);
    expect(onAbrir).toHaveBeenCalledTimes(1);
    expect(onReroll).not.toHaveBeenCalled();

    // Tick 2: Sin cambios en las cartas
    await detector.ejecutarTick();
    expect(onReroll).not.toHaveBeenCalled();

    // El usuario tira reroll en la carta 2 (cambio drástico de hash)
    hashesActuales = [
      '1111111111111111',
      'ffffffffffffffff', // Reroll en slot 2
      '3333333333333333',
    ];

    // Tick 3: Se detecta el reroll en el slot 2
    await detector.ejecutarTick();
    expect(onReroll).toHaveBeenCalledTimes(1);
    expect(onReroll).toHaveBeenCalledWith(2);

    detector.stop();
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
