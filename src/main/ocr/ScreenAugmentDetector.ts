/**
 * src/main/ocr/ScreenAugmentDetector.ts
 * Detector OCR en pantalla para reconocer los 3 aumentos reales ofrecidos en ARAM Caos y Arena (RF-2).
 * Normaliza las coordenadas a proporción 16:9 centrada (soportando monitores 1080p, 1440p, 4K y ultra-panorámicos 21:9),
 * recorta las bandas de títulos de las 3 cartas centrales, aplica preprocesamiento,
 * ejecuta OCR con PSM 6 y realiza matching difuso mediante Damerau-Levenshtein (umbral >= 0.70),
 * apoyado por estimación perceptual de rareza/icono ante similitudes dudosas (0.45 - 0.69).
 */

import { app, desktopCapturer, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { createWorker, PSM } from 'tesseract.js';
import rawAugmentsCatalog from '../../shared/data/augmentsCatalog.json';
import type { AugmentInfo, DatosModoCampeon, RarityAugment, TierBadge } from '../../shared/types';
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

export interface CardRoiConfig {
  index: 1 | 2 | 3;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
}

export interface RectanguloNormalizado {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Coordenadas relativas calibradas empíricamente en Fase 0 sobre proporción 16:9 de League of Legends.
 * Focalizadas en la banda del título de cada una de las 3 cartas.
 */
export const CARD_TITLE_ROIS: CardRoiConfig[] = [
  { index: 1, xPercent: 0.25, yPercent: 0.33, widthPercent: 0.16, heightPercent: 0.10 },
  { index: 2, xPercent: 0.42, yPercent: 0.33, widthPercent: 0.16, heightPercent: 0.10 },
  { index: 3, xPercent: 0.59, yPercent: 0.33, widthPercent: 0.16, heightPercent: 0.10 },
];

/**
 * Coordenadas relativas para la zona del marco / icono superior de cada una de las 3 cartas.
 */
export const CARD_ICON_ROIS: CardRoiConfig[] = [
  { index: 1, xPercent: 0.29, yPercent: 0.18, widthPercent: 0.08, heightPercent: 0.12 },
  { index: 2, xPercent: 0.46, yPercent: 0.18, widthPercent: 0.08, heightPercent: 0.12 },
  { index: 3, xPercent: 0.63, yPercent: 0.18, widthPercent: 0.08, heightPercent: 0.12 },
];

export const UMBRAL_SIMILITUD_MINIMA = 0.70;

/**
 * Deriva el rectángulo centrado 16:9 sobre la pantalla para soportar monitores ultrawide (21:9) o 16:10.
 */
export function calcularCajaNormalizada16a9(
  screenWidth: number,
  screenHeight: number
): RectanguloNormalizado {
  if (screenWidth <= 0 || screenHeight <= 0) {
    return { x: 0, y: 0, width: 1920, height: 1080 };
  }

  const targetAspect = 16 / 9;
  const currentAspect = screenWidth / screenHeight;

  if (Math.abs(currentAspect - targetAspect) < 0.02) {
    return { x: 0, y: 0, width: screenWidth, height: screenHeight };
  }

  if (currentAspect > targetAspect) {
    // Pantalla ultra-panorámica (21:9 o 32:9): centrado horizontal
    const boxW = Math.round(screenHeight * targetAspect);
    const boxH = screenHeight;
    const boxX = Math.round((screenWidth - boxW) / 2);
    return { x: boxX, y: 0, width: boxW, height: boxH };
  } else {
    // Pantalla vertical o 16:10 / 4:3: centrado vertical
    const boxW = screenWidth;
    const boxH = Math.round(screenWidth / targetAspect);
    const boxY = Math.round((screenHeight - boxH) / 2);
    return { x: 0, y: boxY, width: boxW, height: boxH };
  }
}

/**
 * Estima la rareza del aumento a partir de los colores del marco/gema en el bitmap BGRA.
 */
export function estimarRarezaVisual(
  bmp: Buffer,
  width: number,
  height: number,
  cropRect: RectanguloNormalizado
): RarityAugment | null {
  if (!bmp || width <= 0 || height <= 0 || cropRect.width <= 0 || cropRect.height <= 0) {
    return null;
  }

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let muestrasValidas = 0;

  const startX = Math.max(0, cropRect.x);
  const startY = Math.max(0, cropRect.y);
  const endX = Math.min(width - 1, cropRect.x + cropRect.width);
  const endY = Math.min(height - 1, cropRect.y + cropRect.height);

  const stepX = Math.max(1, Math.round(cropRect.width / 10));
  const stepY = Math.max(1, Math.round(cropRect.height / 10));

  for (let y = startY; y < endY; y += stepY) {
    for (let x = startX; x < endX; x += stepX) {
      const idx = (y * width + x) * 4;
      if (idx + 2 < bmp.length) {
        totalB += bmp[idx];
        totalG += bmp[idx + 1];
        totalR += bmp[idx + 2];
        muestrasValidas++;
      }
    }
  }

  if (muestrasValidas === 0) return null;

  const r = totalR / muestrasValidas;
  const g = totalG / muestrasValidas;
  const b = totalB / muestrasValidas;

  // Prismática: púrpura/magenta o cian fluorescente
  if ((r > 130 && b > 140 && g < 150) || (g > 150 && b > 170 && r < 130)) {
    return 'prismatic';
  }
  // Oro: tono dorado/ámbar cálido
  if (r >= 140 && g >= 110 && b <= 115 && r > b + 25) {
    return 'gold';
  }
  // Plata: gris metálico
  if (r >= 90 && Math.abs(r - g) <= 30 && Math.abs(g - b) <= 30) {
    return 'silver';
  }

  return null;
}

export function normalizarTexto(txt: string): string {
  return (txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calcula la distancia de Damerau-Levenshtein entre dos cadenas de texto.
 */
export function calcularDistanciaDamerauLevenshtein(source: string, target: string): number {
  if (!source) return target ? target.length : 0;
  if (!target) return source.length;

  const m = source.length;
  const n = target.length;
  const d: number[][] = [];

  for (let i = 0; i <= m; i++) {
    d[i] = [];
    d[i][0] = i;
  }
  for (let j = 0; j <= n; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = source[i - 1] === target[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,       // Eliminación
        d[i][j - 1] + 1,       // Inserción
        d[i - 1][j - 1] + cost // Sustitución
      );

      // Transposición (Damerau)
      if (
        i > 1 &&
        j > 1 &&
        source[i - 1] === target[j - 2] &&
        source[i - 2] === target[j - 1]
      ) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }

  return d[m][n];
}

/**
 * Calcula la similitud normalizada [0..1] mediante Damerau-Levenshtein.
 */
export function calcularSimilitudDamerauLevenshtein(s1: string, s2: string): number {
  const norm1 = normalizarTexto(s1);
  const norm2 = normalizarTexto(s2);
  if (!norm1 || !norm2) return 0;
  if (norm1 === norm2) return 1.0;
  const dist = calcularDistanciaDamerauLevenshtein(norm1, norm2);
  return Math.max(0, 1 - dist / Math.max(norm1.length, norm2.length));
}

/**
 * Evalúa la similitud normalizada [0..1] entre una lectura OCR y el título del catálogo.
 * Soporta comparación directa y correspondencia de prefijo para ignorar texto adicional.
 */
export function evaluarSimilitudOcrConTitulo(ocr: string, titulo: string): number {
  const normOcr = normalizarTexto(ocr);
  const normTitle = normalizarTexto(titulo);
  if (!normOcr || !normTitle) return 0;
  if (normOcr === normTitle || normOcr.includes(normTitle)) return 1.0;

  const wordsTitle = normTitle.split(' ').length;
  const wordsOcr = normOcr.split(' ');
  const ocrPrefix = wordsOcr.slice(0, wordsTitle).join(' ');

  const distDirect = calcularDistanciaDamerauLevenshtein(normOcr, normTitle);
  const simDirect = 1 - distDirect / Math.max(normOcr.length, normTitle.length);

  const distPrefix = calcularDistanciaDamerauLevenshtein(ocrPrefix, normTitle);
  const simPrefix = 1 - distPrefix / Math.max(ocrPrefix.length, normTitle.length);

  return Math.max(0, Math.max(simDirect, simPrefix));
}

/**
 * Empareja el texto extraído por OCR contra la lista de aumentos mediante Damerau-Levenshtein.
 * Revisa tanto el nombre en inglés (name) como en español (nameEs) y exige umbral >= 0.70.
 * Si se detectó rareza visual del icono y la similitud del texto es dudosa (0.45 - 0.69),
 * aplica un refuerzo perceptual de +0.15 para confirmar el aumento legítimo.
 */
export function emparejarAumento(
  ocrText: string,
  augments: AugmentInfo[],
  rarezaVisual?: RarityAugment | null
): { augment: AugmentInfo | null; score: number } {
  const normOcr = normalizarTexto(ocrText);
  if (!normOcr || normOcr.length < 3 || !augments || augments.length === 0) {
    return { augment: null, score: 0 };
  }

  let mejor: AugmentInfo | null = null;
  let mejorSimilitud = 0;

  for (const aug of augments) {
    const simEn = evaluarSimilitudOcrConTitulo(normOcr, aug.name);
    const simEs = evaluarSimilitudOcrConTitulo(normOcr, aug.nameEs);
    let simMax = Math.max(simEn, simEs);

    // Refuerzo perceptual de icono si la similitud de texto es dudosa
    if (rarezaVisual && aug.rarity === rarezaVisual && simMax >= 0.45 && simMax < UMBRAL_SIMILITUD_MINIMA) {
      simMax = Math.min(0.85, simMax + 0.15);
    }

    if (simMax > mejorSimilitud) {
      mejorSimilitud = simMax;
      mejor = aug;
    }
  }

  return {
    augment: mejorSimilitud >= UMBRAL_SIMILITUD_MINIMA ? mejor : null,
    score: Math.round(mejorSimilitud * 100) / 100,
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
            registrarLog(`[ScreenAugmentDetector] Worker OCR no hallado en ${workerPath}.`);
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

          // Configurar PSM 6 (Single uniform block of text) validado en Fase 0
          await w.setParameters({
            tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
          });

          this.worker = w;
          registrarLog('[ScreenAugmentDetector] Worker Tesseract OCR inicializado con éxito (PSM 6).');
          return w;
        } catch (err: any) {
          registrarLog(`[ScreenAugmentDetector] Advertencia al iniciar worker OCR: ${err?.message || err}`);
          return null;
        }
      })();
    }
    return this.workerPromise;
  }

  private obtenerCatalogoNombres(datosModo: DatosModoCampeon | null): AugmentInfo[] {
    if (datosModo && datosModo.augments && datosModo.augments.length > 0) {
      return datosModo.augments;
    }
    return (rawAugmentsCatalog as any[]).map((item) => ({
      id: item.id,
      name: item.name,
      nameEs: item.nameEs || item.name,
      key: item.key,
      rarity: item.rarity as RarityAugment,
      tier: '?' as TierBadge,
      pickRate: undefined as any,
      iconUrl: item.iconUrl,
      desc: item.desc || item.name,
    }));
  }

  /**
   * Analiza una única carta de aumento (por ejemplo, tras un reroll individual).
   */
  public async analizarCartaIndividual(
    cardIndex: 1 | 2 | 3,
    datosModo: DatosModoCampeon | null
  ): Promise<CardMatchResult | null> {
    try {
      const worker = await this.getWorker();
      if (!worker) return null;

      const primaryDisplay = screen.getPrimaryDisplay();
      const bounds = primaryDisplay.bounds || { width: 1920, height: 1080 };
      const { width, height } = bounds;

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height },
      });

      if (!sources || sources.length === 0) return null;

      const screenImg = sources[0].thumbnail;
      const bmpFull = screenImg.toBitmap();
      const caja16a9 = calcularCajaNormalizada16a9(width, height);

      const titleConfig = CARD_TITLE_ROIS[cardIndex - 1];
      const iconConfig = CARD_ICON_ROIS[cardIndex - 1];

      const cropRect = {
        x: Math.round(caja16a9.x + caja16a9.width * titleConfig.xPercent),
        y: Math.round(caja16a9.y + caja16a9.height * titleConfig.yPercent),
        width: Math.round(caja16a9.width * titleConfig.widthPercent),
        height: Math.round(caja16a9.height * titleConfig.heightPercent),
      };

      const iconRect = {
        x: Math.round(caja16a9.x + caja16a9.width * iconConfig.xPercent),
        y: Math.round(caja16a9.y + caja16a9.height * iconConfig.yPercent),
        width: Math.round(caja16a9.width * iconConfig.widthPercent),
        height: Math.round(caja16a9.height * iconConfig.heightPercent),
      };

      const rarezaVisual = estimarRarezaVisual(bmpFull, width, height, iconRect);

      const cropBmp = screenImg.crop(cropRect);
      const preprocessed = cropBmp.resize({
        width: cropRect.width * 2,
        height: cropRect.height * 2,
        quality: 'better',
      });

      const pngBuf = preprocessed.toPNG();
      const ocrRes = await worker.recognize(pngBuf);
      const rawText = ocrRes.data?.text || '';

      const catalogoNombres = this.obtenerCatalogoNombres(datosModo);
      const match = emparejarAumento(rawText, catalogoNombres, rarezaVisual);

      let finalAugment: AugmentInfo | null = null;
      if (match.augment) {
        const encontradoEnDatosReales = datosModo?.augments?.find(
          (a) => a.id === match.augment?.id || a.key === match.augment?.key
        );

        if (encontradoEnDatosReales) {
          finalAugment = { ...encontradoEnDatosReales };
        } else {
          finalAugment = {
            ...match.augment,
            tier: '?' as TierBadge,
            pickRate: undefined as any,
          };
        }
      }

      return {
        cardIndex,
        augment: finalAugment,
        rawText: rawText.replace(/\s+/g, ' ').trim(),
        confidence: match.score,
      };
    } catch (err: any) {
      registrarLog(`[ScreenAugmentDetector] Error al analizar carta ${cardIndex}: ${err?.message || err}`);
      return null;
    }
  }

  /**
   * Captura la pantalla y analiza simultáneamente las 3 cartas de aumentos con normalización 16:9.
   */
  public async analizarPantalla(
    datosModo: DatosModoCampeon | null
  ): Promise<ScreenAugmentsResult | null> {
    const catalogoNombres = this.obtenerCatalogoNombres(datosModo);

    try {
      const worker = await this.getWorker();
      if (!worker) {
        return null;
      }

      const primaryDisplay = screen.getPrimaryDisplay();
      const bounds = primaryDisplay.bounds || { width: 1920, height: 1080 };
      const { width, height } = bounds;

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height },
      });

      if (!sources || sources.length === 0) {
        registrarLog('[ScreenAugmentDetector] No se pudo capturar la pantalla.');
        return null;
      }

      const screenImg = sources[0].thumbnail;
      const bmpFull = screenImg.toBitmap();
      const caja16a9 = calcularCajaNormalizada16a9(width, height);
      const resultados: CardMatchResult[] = [];

      for (let i = 0; i < 3; i++) {
        const titleConfig = CARD_TITLE_ROIS[i];
        const iconConfig = CARD_ICON_ROIS[i];

        const cropRect = {
          x: Math.round(caja16a9.x + caja16a9.width * titleConfig.xPercent),
          y: Math.round(caja16a9.y + caja16a9.height * titleConfig.yPercent),
          width: Math.round(caja16a9.width * titleConfig.widthPercent),
          height: Math.round(caja16a9.height * titleConfig.heightPercent),
        };

        const iconRect = {
          x: Math.round(caja16a9.x + caja16a9.width * iconConfig.xPercent),
          y: Math.round(caja16a9.y + caja16a9.height * iconConfig.yPercent),
          width: Math.round(caja16a9.width * iconConfig.widthPercent),
          height: Math.round(caja16a9.height * iconConfig.heightPercent),
        };

        const rarezaVisual = estimarRarezaVisual(bmpFull, width, height, iconRect);

        const cropBmp = screenImg.crop(cropRect);

        // Preprocesamiento: reescalado x2 para estabilizar fuentes doradas de League of Legends
        const preprocessed = cropBmp.resize({
          width: cropRect.width * 2,
          height: cropRect.height * 2,
          quality: 'better',
        });

        // Modo debug para auditoría empírica si EAZY_OCR_DEBUG=1
        if (process.env.EAZY_OCR_DEBUG === '1') {
          try {
            const debugDir = path.join(process.cwd(), 'scratch');
            if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
            fs.writeFileSync(path.join(debugDir, `debug_card_${titleConfig.index}.png`), preprocessed.toPNG());
          } catch {}
        }

        const pngBuf = preprocessed.toPNG();
        const ocrRes = await worker.recognize(pngBuf);
        const rawText = ocrRes.data?.text || '';
        const match = emparejarAumento(rawText, catalogoNombres, rarezaVisual);

        let finalAugment: AugmentInfo | null = null;
        if (match.augment) {
          // Si datosModo real contiene las estadísticas de OP.GG para este augment, usarlas
          const encontradoEnDatosReales = datosModo?.augments?.find(
            (a) => a.id === match.augment?.id || a.key === match.augment?.key
          );

          if (encontradoEnDatosReales) {
            finalAugment = { ...encontradoEnDatosReales };
          } else {
            // NUNCA inventar tiers: si no hay estadísticas de OP.GG, marcar explícitamente sin tier
            finalAugment = {
              ...match.augment,
              tier: '?' as TierBadge,
              pickRate: undefined as any,
            };
          }
        }

        resultados.push({
          cardIndex: titleConfig.index,
          augment: finalAugment,
          rawText: rawText.replace(/\s+/g, ' ').trim(),
          confidence: match.score,
        });

        registrarLog(
          `[ScreenAugmentDetector] Carta ${titleConfig.index}: ${
            finalAugment ? finalAugment.name + ' (Tier ' + finalAugment.tier + ')' : 'No reconocido'
          } (Score: ${match.score}, Raw: "${rawText.replace(/\s+/g, ' ').trim()}", Rareza: ${rarezaVisual || 'n/a'})`
        );
      }

      // Determinar cuál carta tiene el mejor tier legítimo
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
        if (r.augment && r.augment.tier in tierRank) {
          const rango = tierRank[r.augment.tier];
          if (rango < mejorRango) {
            mejorRango = rango;
            bestCardIndex = r.cardIndex;
          }
        }
      }

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
