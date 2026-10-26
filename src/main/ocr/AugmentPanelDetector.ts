/**
 * src/main/ocr/AugmentPanelDetector.ts
 * Detector visual liviano para determinar la presencia del panel de selección de aumentos
 * en pantalla en League of Legends (ARAM Caos y Arena) mediante muestreo de píxeles (RF-1).
 * Incluye verificación de viñeteado (rechazo de Tienda y Tab) y detección de reroll por dHash 8x8.
 */

import { desktopCapturer, screen } from 'electron';
import { registrarLog } from '../lcu/LcuDetector';

export interface MuestraColor {
  r: number;
  g: number;
  b: number;
}

export interface MuestraRoi {
  tipo: 'reroll' | 'fondo' | 'fondo_entorno';
  color: MuestraColor;
  slot?: 1 | 2 | 3;
}

export interface RoiRelativa {
  rx: number;
  ry: number;
  rw: number;
  rh: number;
}

/**
 * Zonas centrales de las 3 cartas de aumentos para cálculo de dHash y detección de reroll.
 */
export const CARD_CENTER_ROIS: Record<1 | 2 | 3, RoiRelativa> = {
  1: { rx: 0.25, ry: 0.28, rw: 0.16, rh: 0.25 },
  2: { rx: 0.42, ry: 0.28, rw: 0.16, rh: 0.25 },
  3: { rx: 0.59, ry: 0.28, rw: 0.16, rh: 0.25 },
};

/**
 * Calcula la luminancia perceptual estándar (ITU-R BT.601).
 */
export function calcularLuminancia(color: MuestraColor): number {
  return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
}

/**
 * Calcula un dHash perceptual de 8x8 (64 bits, 16 caracteres hexadecimales)
 * sobre una región relativa del bitmap en formato BGRA.
 */
export function calcularDHash8x8(
  bmp: Buffer,
  width: number,
  height: number,
  roi: RoiRelativa
): string {
  if (!bmp || width <= 0 || height <= 0) return '0000000000000000';

  const startX = Math.round(roi.rx * width);
  const startY = Math.round(roi.ry * height);
  const regionW = Math.max(2, Math.round(roi.rw * width));
  const regionH = Math.max(2, Math.round(roi.rh * height));

  // Rejilla de 9 columnas x 8 filas
  const grid: number[][] = [];
  for (let row = 0; row < 8; row++) {
    grid[row] = [];
    const py = Math.min(height - 1, startY + Math.round((row / 7) * (regionH - 1)));
    for (let col = 0; col < 9; col++) {
      const px = Math.min(width - 1, startX + Math.round((col / 8) * (regionW - 1)));
      const idx = (py * width + px) * 4;
      if (idx + 2 < bmp.length) {
        const lum = 0.299 * bmp[idx + 2] + 0.587 * bmp[idx + 1] + 0.114 * bmp[idx];
        grid[row][col] = lum;
      } else {
        grid[row][col] = 0;
      }
    }
  }

  // Generar 64 bits comparando pixel actual con su vecino a la derecha
  let bits = '';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      bits += grid[row][col] > grid[row][col + 1] ? '1' : '0';
    }
  }

  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    const nibble = parseInt(bits.substring(i, i + 4), 2);
    hex += nibble.toString(16);
  }
  return hex;
}

/**
 * Calcula la distancia de Hamming entre dos hashes hexadecimales.
 */
export function calcularDistanciaHamming(hashA: string, hashB: string): number {
  if (!hashA || !hashB || hashA.length !== hashB.length) return 64;
  let dist = 0;
  for (let i = 0; i < hashA.length; i++) {
    const xor = parseInt(hashA[i], 16) ^ parseInt(hashB[i], 16);
    let bits = xor;
    while (bits > 0) {
      dist += bits & 1;
      bits >>= 1;
    }
  }
  return dist;
}

/**
 * Función pura que evalúa si las muestras de color tomadas corresponden al panel de aumentos.
 * Detecta la presencia del botón de reroll dorado hextech y los fondos oscuros de las cartas,
 * y rechaza pantallas iluminadas no relacionadas (Tienda o Tab).
 */
export function evaluarVisibilidadPanel(muestras: MuestraRoi[]): boolean {
  if (!muestras || muestras.length === 0) return false;

  // 1. Verificación de viñeteado / rechazo de pantallas brillantes (Tienda, Tab, etc.)
  const entornos = muestras.filter((m) => m.tipo === 'fondo_entorno');
  if (entornos.length > 0) {
    const lumMediaEntorno =
      entornos.reduce((acc, m) => acc + calcularLuminancia(m.color), 0) / entornos.length;
    // Si el entorno está demasiado iluminado (e.g. Tienda abierta o pantalla de puntuaciones clara)
    if (lumMediaEntorno > 85) {
      return false;
    }
  }

  // 2. Muestras de botones de reroll y fondos de cartas
  const rerolls = muestras.filter((m) => m.tipo === 'reroll');
  const fondos = muestras.filter((m) => m.tipo === 'fondo');

  let rerollsCoincidentes = 0;
  for (const m of rerolls) {
    const { r, g, b } = m.color;
    // Tono oro/ámbar característico de los botones de reroll: r alto, g medio-alto, r > b + 15
    if (r >= 140 && g >= 115 && b <= 210 && r > b + 15) {
      rerollsCoincidentes++;
    }
  }

  let fondosOscuros = 0;
  for (const m of fondos) {
    const lum = calcularLuminancia(m.color);
    // Fondo de las cartas: muy oscuro respecto al entorno
    if (lum <= 100) {
      fondosOscuros++;
    }
  }

  // Panel visible si detectamos al menos 2 botones de reroll o 1 botón + al menos 2 fondos de carta
  return (rerollsCoincidentes >= 2 && fondosOscuros >= 1) || (rerollsCoincidentes >= 1 && fondosOscuros >= 2);
}

export class AugmentPanelDetector {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private visible = false;
  private consecutivosPositivos = 0;
  private consecutivosNegativos = 0;
  private ofertaConsumida = false;

  private onAbrirCallback: (() => void) | null = null;
  private onCerrarCallback: (() => void) | null = null;
  private onRerollCallback: ((cardIndex: 1 | 2 | 3) => void) | null = null;

  private ultimoFrame: { bmp: Buffer; width: number; height: number } | null = null;
  private lastCardHashes: [string, string, string] | null = null;

  /**
   * Inicia el ciclo de sondeo liviano de pantalla (~750 ms).
   */
  public start(
    onAbrir: () => void,
    onCerrar: () => void,
    onReroll?: (cardIndex: 1 | 2 | 3) => void
  ): void {
    this.onAbrirCallback = onAbrir;
    this.onCerrarCallback = onCerrar;
    this.onRerollCallback = onReroll || null;

    if (this.running) return;

    this.running = true;
    this.visible = false;
    this.consecutivosPositivos = 0;
    this.consecutivosNegativos = 0;
    this.ofertaConsumida = false;
    this.lastCardHashes = null;

    this.programarSiguienteTick(800);
    registrarLog('[AugmentPanelDetector] Sondeo visual de panel de aumentos iniciado.');
  }

  /**
   * Detiene el sondeo.
   */
  public stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.visible = false;
    this.lastCardHashes = null;
    this.ultimoFrame = null;
    registrarLog('[AugmentPanelDetector] Sondeo visual detenido.');
  }

  public isPanelVisible(): boolean {
    return this.visible;
  }

  /**
   * Permite resetear la marca de oferta consumida (por ejemplo ante un nuevo hito o ronda).
   */
  public resetOferta(): void {
    this.ofertaConsumida = false;
    this.lastCardHashes = null;
  }

  private programarSiguienteTick(intervaloMs: number): void {
    if (!this.running) return;
    this.timer = setTimeout(async () => {
      await this.ejecutarTick();
      if (this.running) {
        // Sondeo a ~1,2 Hz cuando está abierto para detectar cierre rápido y rerolls; ~0,8 Hz cuando está cerrado
        const siguienteIntervalo = this.visible ? 700 : 900;
        this.programarSiguienteTick(siguienteIntervalo);
      }
    }, intervaloMs);
  }

  public async ejecutarTick(): Promise<void> {
    try {
      const muestras = await this.capturarMuestras();
      if (!muestras || muestras.length === 0) return;

      const detectado = evaluarVisibilidadPanel(muestras);

      if (detectado) {
        this.consecutivosPositivos++;
        this.consecutivosNegativos = 0;

        // Abrir tras 1 confirmación positiva si la oferta no ha sido consumida ya
        if (!this.visible && this.consecutivosPositivos >= 1 && !this.ofertaConsumida) {
          this.visible = true;
          registrarLog('[AugmentPanelDetector] ¡Panel de aumentos ABIERTO en pantalla!');
          this.onAbrirCallback?.();

          // Inicializar hashes de cartas al abrir
          const hashesIniciales = await this.capturarHashesCartas();
          if (hashesIniciales) {
            this.lastCardHashes = hashesIniciales;
          }
        } else if (this.visible) {
          // Si el panel ya está abierto, vigilar cambios de hash en cada carta (detección de reroll automático)
          const hashesActuales = await this.capturarHashesCartas();
          if (hashesActuales && this.lastCardHashes) {
            for (let i = 0; i < 3; i++) {
              const dist = calcularDistanciaHamming(this.lastCardHashes[i], hashesActuales[i]);
              // Un cambio significativo en el arte o texto de la carta supera distancia 12
              if (dist >= 12) {
                const cardIndex = (i + 1) as 1 | 2 | 3;
                registrarLog(
                  `[AugmentPanelDetector] Reroll automático detectado en carta ${cardIndex} (distancia Hamming: ${dist}).`
                );
                this.lastCardHashes[i] = hashesActuales[i];
                this.onRerollCallback?.(cardIndex);
              }
            }
          } else if (hashesActuales && !this.lastCardHashes) {
            this.lastCardHashes = hashesActuales;
          }
        }
      } else {
        this.consecutivosNegativos++;
        this.consecutivosPositivos = 0;

        // Cerrar tras 2 confirmaciones negativas consecutivas (~1,4 s)
        if (this.visible && this.consecutivosNegativos >= 2) {
          this.visible = false;
          this.ofertaConsumida = true; // Marcar como consumida para no reabrir con parpadeos
          this.lastCardHashes = null;
          registrarLog('[AugmentPanelDetector] Panel de aumentos CERRADO (augment seleccionado o ronda terminada).');
          this.onCerrarCallback?.();
        }
      }
    } catch {
      // Ignorar errores transitorios de captura para no romper el ciclo
    }
  }

  /**
   * Obtiene los hashes dHash de las 3 cartas a partir del último frame capturado o de una nueva captura.
   */
  public async capturarHashesCartas(): Promise<[string, string, string] | null> {
    if (!this.ultimoFrame) return null;
    const { bmp, width, height } = this.ultimoFrame;
    const h1 = calcularDHash8x8(bmp, width, height, CARD_CENTER_ROIS[1]);
    const h2 = calcularDHash8x8(bmp, width, height, CARD_CENTER_ROIS[2]);
    const h3 = calcularDHash8x8(bmp, width, height, CARD_CENTER_ROIS[3]);
    return [h1, h2, h3];
  }

  /**
   * Captura una miniatura de la pantalla completa y extrae muestras RGB promedio de las ROIs clave.
   */
  public async capturarMuestras(): Promise<MuestraRoi[]> {
    const primaryDisplay = screen.getPrimaryDisplay();
    const bounds = primaryDisplay.bounds || { width: 1920, height: 1080 };

    // Miniatura liviana a baja resolución para análisis de píxeles de alta velocidad
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 640, height: 360 },
    });

    if (!sources || sources.length === 0) return [];

    const thumb = sources[0].thumbnail;
    const bmp = thumb.toBitmap(); // Formato BGRA
    const thumbSize = thumb.getSize();

    // Guardar para reutilización inmediata por capturarHashesCartas sin doble captura
    this.ultimoFrame = {
      bmp,
      width: thumbSize.width,
      height: thumbSize.height,
    };

    const getPixel = (rx: number, ry: number): MuestraColor => {
      const px = Math.min(thumbSize.width - 1, Math.max(0, Math.round(rx * thumbSize.width)));
      const py = Math.min(thumbSize.height - 1, Math.max(0, Math.round(ry * thumbSize.height)));
      const idx = (py * thumbSize.width + px) * 4;
      return {
        r: bmp[idx + 2],
        g: bmp[idx + 1],
        b: bmp[idx],
      };
    };

    return [
      // 3 zonas de botones de reroll (y: 66%)
      { tipo: 'reroll', color: getPixel(0.33, 0.66), slot: 1 },
      { tipo: 'reroll', color: getPixel(0.50, 0.66), slot: 2 },
      { tipo: 'reroll', color: getPixel(0.67, 0.66), slot: 3 },
      // 3 fondos de interior de cartas (y: 40%)
      { tipo: 'fondo', color: getPixel(0.33, 0.40), slot: 1 },
      { tipo: 'fondo', color: getPixel(0.50, 0.40), slot: 2 },
      { tipo: 'fondo', color: getPixel(0.67, 0.40), slot: 3 },
      // 4 esquinas/bordes exteriores para verificar viñeteado oscuro del modal (rechazo de Tienda/Tab)
      { tipo: 'fondo_entorno', color: getPixel(0.08, 0.12) },
      { tipo: 'fondo_entorno', color: getPixel(0.92, 0.12) },
      { tipo: 'fondo_entorno', color: getPixel(0.08, 0.88) },
      { tipo: 'fondo_entorno', color: getPixel(0.92, 0.88) },
    ];
  }
}
