/**
 * src/main/ocr/AugmentPanelDetector.ts
 * Detector visual liviano para determinar la presencia del panel de selección de aumentos
 * en pantalla en League of Legends (ARAM Caos y Arena) mediante muestreo de píxeles (RF-1).
 */

import { desktopCapturer, screen } from 'electron';
import { registrarLog } from '../lcu/LcuDetector';

export interface MuestraColor {
  r: number;
  g: number;
  b: number;
}

export interface MuestraRoi {
  tipo: 'reroll' | 'fondo';
  color: MuestraColor;
}

/**
 * Función pura que evalúa si las muestras de color tomadas corresponden al panel de aumentos.
 * Detecta la presencia del botón de reroll dorado hextech y los fondos oscuros de las cartas.
 */
export function evaluarVisibilidadPanel(muestras: MuestraRoi[]): boolean {
  if (!muestras || muestras.length === 0) return false;

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
    const lum = 0.299 * m.color.r + 0.587 * m.color.g + 0.114 * m.color.b;
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

  /**
   * Inicia el ciclo de sondeo liviano de pantalla (~750 ms).
   */
  public start(onAbrir: () => void, onCerrar: () => void): void {
    this.onAbrirCallback = onAbrir;
    this.onCerrarCallback = onCerrar;
    if (this.running) return;

    this.running = true;
    this.visible = false;
    this.consecutivosPositivos = 0;
    this.consecutivosNegativos = 0;
    this.ofertaConsumida = false;

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
  }

  private programarSiguienteTick(intervaloMs: number): void {
    if (!this.running) return;
    this.timer = setTimeout(async () => {
      await this.ejecutarTick();
      if (this.running) {
        // Sondeo a ~1,2 Hz cuando está abierto para detectar cierre rápido; ~0,8 Hz cuando está cerrado
        const siguienteIntervalo = this.visible ? 700 : 900;
        this.programarSiguienteTick(siguienteIntervalo);
      }
    }, intervaloMs);
  }

  private async ejecutarTick(): Promise<void> {
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
        }
      } else {
        this.consecutivosNegativos++;
        this.consecutivosPositivos = 0;

        // Cerrar tras 2 confirmaciones negativas consecutivas (~1,4 s)
        if (this.visible && this.consecutivosNegativos >= 2) {
          this.visible = false;
          this.ofertaConsumida = true; // Marcar como consumida para no reabrir con parpadeos
          registrarLog('[AugmentPanelDetector] Panel de aumentos CERRADO (augment seleccionado o ronda terminada).');
          this.onCerrarCallback?.();
        }
      }
    } catch {
      // Ignorar errores transitorios de captura para no romper el ciclo
    }
  }

  /**
   * Captura una miniatura de la pantalla completa y extrae muestras RGB promedio de las ROIs clave.
   */
  public async capturarMuestras(): Promise<MuestraRoi[]> {
    const primaryDisplay = screen.getPrimaryDisplay();
    const bounds = primaryDisplay.bounds || { width: 1920, height: 1080 };
    const { width, height } = bounds;

    // Miniatura liviana a baja resolución para análisis de píxeles de alta velocidad
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 640, height: 360 },
    });

    if (!sources || sources.length === 0) return [];

    const thumb = sources[0].thumbnail;
    const bmp = thumb.toBitmap(); // Formato BGRA
    const thumbSize = thumb.getSize();

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
      { tipo: 'reroll', color: getPixel(0.33, 0.66) },
      { tipo: 'reroll', color: getPixel(0.50, 0.66) },
      { tipo: 'reroll', color: getPixel(0.67, 0.66) },
      // 3 fondos de interior de cartas (y: 40%)
      { tipo: 'fondo', color: getPixel(0.33, 0.40) },
      { tipo: 'fondo', color: getPixel(0.50, 0.40) },
      { tipo: 'fondo', color: getPixel(0.67, 0.40) },
    ];
  }
}
