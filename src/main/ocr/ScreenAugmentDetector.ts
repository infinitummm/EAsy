/**
 * src/main/ocr/ScreenAugmentDetector.ts
 * Detector OCR en pantalla para reconocer los 3 aumentos ofrecidos en ARAM Caos y Arena.
 * Captura las 3 cartas centrales del juego de LoL y las empareja contra el catálogo real
 * de aumentos del campeón para mostrar el tier exacto abajo de cada carta (estilo Blitz).
 */

import { app, desktopCapturer, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { createWorker } from 'tesseract.js';
import type { AugmentInfo, DatosModoCampeon, TipoModo } from '../../shared/types';
import { registrarLog } from '../lcu/LcuDetector';

export interface CardMatchResult {
  cardIndex: 1 | 2 | 3;
  augment: AugmentInfo | null;
  rawText: string;
  confidence: number;
}

export interface ScreenAugmentsResult {
  cards: [CardMatchResult, CardMatchResult, CardMatchResult];
  bestCardIndex: 1 | 2 | 3 | null;
  detectedAt: number;
}

function normalizarTexto(txt: string): string {
  return (txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Empareja el texto extraído por OCR contra la lista de aumentos del campeón.
 */
export function emparejarAumento(
  ocrText: string,
  augments: AugmentInfo[]
): { augment: AugmentInfo | null; score: number } {
  const normOcr = normalizarTexto(ocrText);
  if (!normOcr || normOcr.length < 3) return { augment: null, score: 0 };

  let mejor: AugmentInfo | null = null;
  let mejorPuntuacion = 0;

  for (const aug of augments) {
    const normNombre = normalizarTexto(aug.name);
    const normNombreEs = normalizarTexto(aug.nameEs);
    const normDesc = normalizarTexto(aug.desc);
    let puntos = 0;

    // Coincidencia exacta o contenida del nombre en inglés
    if (normNombre.length >= 3 && normOcr.includes(normNombre)) {
      puntos += 250;
    }
    // Coincidencia exacta o contenida del nombre en español
    if (normNombreEs.length >= 3 && normOcr.includes(normNombreEs)) {
      puntos += 250;
    }

    // Coincidencia por palabras del título
    const palabrasNombre = normNombre.split(' ').filter((w) => w.length >= 3);
    for (const p of palabrasNombre) {
      if (normOcr.includes(p)) puntos += 35;
    }

    const palabrasNombreEs = normNombreEs.split(' ').filter((w) => w.length >= 3);
    for (const p of palabrasNombreEs) {
      if (normOcr.includes(p)) puntos += 35;
    }

    // Coincidencia por palabras clave de la descripción
    const palabrasDesc = normDesc.split(' ').filter((w) => w.length >= 4);
    for (const p of palabrasDesc) {
      if (normOcr.includes(p)) puntos += 10;
    }

    if (puntos > mejorPuntuacion) {
      mejorPuntuacion = puntos;
      mejor = aug;
    }
  }

  return {
    augment: mejorPuntuacion >= 30 ? mejor : null,
    score: mejorPuntuacion,
  };
}

export class ScreenAugmentDetector {
  private worker: any = null;
  private workerPromise: Promise<any> | null = null;

  private async getWorker(): Promise<any> {
    if (this.worker) return this.worker;
    if (!this.workerPromise) {
      this.workerPromise = (async () => {
        try {
          const isPackaged = typeof app !== 'undefined' && Boolean(app?.isPackaged);
          const root = isPackaged && process.resourcesPath
            ? path.join(process.resourcesPath, 'app.asar.unpacked')
            : process.cwd();

          const workerPath = path.join(
            root,
            'node_modules',
            'tesseract.js',
            'src',
            'worker-script',
            'node',
            'index.js'
          );
          const corePath = path.join(root, 'node_modules', 'tesseract.js-core');
          const langPath = root;

          if (!fs.existsSync(workerPath)) {
            registrarLog(`[ScreenAugmentDetector] Worker OCR no hallado en ${workerPath}. Usando fallback a mejores aumentos.`);
            return null;
          }

          const w = await createWorker(['eng', 'spa'], 1, {
            workerPath,
            corePath,
            langPath,
            cacheMethod: 'none',
            gzip: false,
            errorHandler: (err: any) => {
              registrarLog(`[ScreenAugmentDetector] Notificación worker OCR: ${err?.message || err}`);
            },
          });
          this.worker = w;
          registrarLog('[ScreenAugmentDetector] Worker Tesseract OCR inicializado con éxito.');
          return w;
        } catch (err: any) {
          registrarLog(`[ScreenAugmentDetector] Advertencia al iniciar worker OCR: ${err?.message || err}`);
          return null;
        }
      })();
    }
    return this.workerPromise;
  }

  /**
   * Captura la pantalla y analiza las 3 cartas de aumentos.
   */
  public async analizarPantalla(
    datosModo: DatosModoCampeon | null
  ): Promise<ScreenAugmentsResult | null> {
    if (!datosModo || !datosModo.augments || datosModo.augments.length === 0) {
      return null;
    }

    try {
      const worker = await this.getWorker();
      if (!worker) {
        // Fallback elegante sin error: el overlay mostrará los mejores aumentos por tier
        return null;
      }

      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.bounds;

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height },
      });

      if (!sources || sources.length === 0) {
        registrarLog('[ScreenAugmentDetector] No se pudo capturar la pantalla.');
        return null;
      }

      const screenImg = sources[0].thumbnail;

      // En resolución estándar de LoL:
      // Las 3 cartas están ubicadas en el tercio central verticalmente (y: 26% a 72%)
      // y distribuidas en 3 columnas horizontales:
      // Carta 1: 25% a 41%
      // Carta 2: 42% a 58%
      // Carta 3: 59% a 75%
      const crops = [
        {
          index: 1 as const,
          rect: {
            x: Math.round(width * 0.25),
            y: Math.round(height * 0.25),
            width: Math.round(width * 0.17),
            height: Math.round(height * 0.46),
          },
        },
        {
          index: 2 as const,
          rect: {
            x: Math.round(width * 0.415),
            y: Math.round(height * 0.25),
            width: Math.round(width * 0.17),
            height: Math.round(height * 0.46),
          },
        },
        {
          index: 3 as const,
          rect: {
            x: Math.round(width * 0.58),
            y: Math.round(height * 0.25),
            width: Math.round(width * 0.17),
            height: Math.round(height * 0.46),
          },
        },
      ];

      const resultados: CardMatchResult[] = [];

      for (const item of crops) {
        const cropBmp = screenImg.crop(item.rect);
        const pngBuf = cropBmp.toPNG();

        const ocrRes = await worker.recognize(pngBuf);
        const rawText = ocrRes.data?.text || '';
        const match = emparejarAumento(rawText, datosModo.augments);

        resultados.push({
          cardIndex: item.index,
          augment: match.augment,
          rawText: rawText.replace(/\s+/g, ' ').trim(),
          confidence: match.score,
        });

        registrarLog(
          `[ScreenAugmentDetector] Carta ${item.index}: ${
            match.augment ? match.augment.name + ' (' + match.augment.tier + ')' : 'No reconocido'
          } (Score: ${match.score})`
        );
      }

      // Determinar cuál de las cartas tiene el mejor tier
      const tierRank: Record<string, number> = {
        'S+': 0,
        S: 1,
        A: 2,
        B: 3,
        C: 4,
        D: 5,
      };

      let bestCardIndex: 1 | 2 | 3 | null = null;
      let mejorRango = 99;

      for (const r of resultados) {
        if (r.augment) {
          const rango = tierRank[r.augment.tier] ?? 99;
          if (rango < mejorRango) {
            mejorRango = rango;
            bestCardIndex = r.cardIndex;
          }
        }
      }

      // Marcar `isBest` en el augment ganador entre los 3
      if (bestCardIndex !== null) {
        resultados.forEach((r) => {
          if (r.augment) {
            r.augment = {
              ...r.augment,
              isBest: r.cardIndex === bestCardIndex,
            };
          }
        });
      }

      return {
        cards: [resultados[0], resultados[1], resultados[2]],
        bestCardIndex,
        detectedAt: Date.now(),
      };
    } catch (error) {
      registrarLog(
        `[ScreenAugmentDetector] Error analizando cartas: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }

  public async destroy(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate();
      } catch {}
      this.worker = null;
    }
  }
}
