/**
 * src/main/ocr/ScreenAugmentDetector.ts
 * Detector OCR en pantalla para reconocer los 3 aumentos reales ofrecidos en ARAM Caos y Arena (RF-2).
 * Normaliza las coordenadas a proporción 16:9 centrada a resolución física real (con scaleFactor),
 * recorta las bandas de títulos de las 3 cartas centrales con doble sub-banda vertical,
 * aplica binarización invertida (letras NEGRAS sobre fondo BLANCO para Tesseract),
 * ejecuta OCR con PSM 6 y timeout duro de 2500ms, y realiza matching difuso mediante Damerau-Levenshtein (umbral >= 0.62 / 0.55),
 * apoyado por estimación perceptual de rareza/icono, telemetría visual y arnés de debugging en disco (scratch/ocr-debug/).
 */

import * as electron from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { createWorker, PSM } from 'tesseract.js';
import rawAugmentsCatalog from '../../shared/data/augmentsCatalog.json';
import type { AugmentInfo, DatosModoCampeon, RarityAugment, TierBadge } from '../../shared/types';
import { registrarLog } from '../lcu/LcuDetector';

const electronApp: any = (electron as any)?.app || (electron as any)?.default?.app;
const electronDesktopCapturer: any =
  (electron as any)?.desktopCapturer || (electron as any)?.default?.desktopCapturer;
const electronScreen: any = (electron as any)?.screen || (electron as any)?.default?.screen;

export interface CardMatchResult {
  cardIndex: 1 | 2 | 3;
  augment: AugmentInfo | null;
  rawText: string;
  confidence: number;
  cropPreviewDataUrl?: string;
  error?: string;
}

export interface ScreenAugmentsResult {
  cards: [CardMatchResult, CardMatchResult, CardMatchResult];
  bestCardIndex: 1 | 2 | 3 | null;
  detectedAt: number;
  isAnalyzing?: boolean;
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

export interface ImagenPreprocesada {
  buffer: Buffer; // Buffer BMP válido con cabecera de 54 bytes (firma 'BM')
  width: number;
  height: number;
  base64DataUrl: string;
}

/**
 * Coordenadas relativas calibradas sobre proporción 16:9 de League of Legends.
 * Columnas de las 3 cartas con doble sub-banda vertical para cubrir ARAM Caos y Arena.
 */
export const CARD_COLUMNS: Array<{ index: 1 | 2 | 3; xPercent: number; widthPercent: number }> = [
  { index: 1, xPercent: 0.24, widthPercent: 0.17 },
  { index: 2, xPercent: 0.415, widthPercent: 0.17 },
  { index: 3, xPercent: 0.59, widthPercent: 0.17 },
];

/**
 * Sub-bandas verticales Y evaluadas para el título de la carta:
 * - Banda superior/central (35% a 46%)
 * - Banda central/inferior bajo icono (44% a 55%)
 */
export const TITLE_Y_BANDS: Array<{ name: string; yPercent: number; heightPercent: number }> = [
  { name: 'superior', yPercent: 0.35, heightPercent: 0.11 },
  { name: 'central', yPercent: 0.44, heightPercent: 0.11 },
];

/**
 * Coordenadas relativas clásicas para compatibilidad con tests existentes.
 */
export const CARD_TITLE_ROIS: CardRoiConfig[] = [
  { index: 1, xPercent: 0.25, yPercent: 0.35, widthPercent: 0.16, heightPercent: 0.12 },
  { index: 2, xPercent: 0.42, yPercent: 0.35, widthPercent: 0.16, heightPercent: 0.12 },
  { index: 3, xPercent: 0.59, yPercent: 0.35, widthPercent: 0.16, heightPercent: 0.12 },
];

/**
 * Coordenadas relativas para la zona del marco / icono superior de cada una de las 3 cartas.
 */
export const CARD_ICON_ROIS: CardRoiConfig[] = [
  { index: 1, xPercent: 0.28, yPercent: 0.18, widthPercent: 0.09, heightPercent: 0.13 },
  { index: 2, xPercent: 0.455, yPercent: 0.18, widthPercent: 0.09, heightPercent: 0.13 },
  { index: 3, xPercent: 0.63, yPercent: 0.18, widthPercent: 0.09, heightPercent: 0.13 },
];

export const UMBRAL_SIMILITUD_DIRECTA = 0.62;
export const UMBRAL_SIMILITUD_CON_RAREZA = 0.55;
export const OCR_TIMEOUT_MS = 2500;

/**
 * Limpia caracteres de ruido en los extremos que suele meter Tesseract.
 */
export function limpiarTextoOcr(txt: string): string {
  return (txt || '')
    .replace(/[|_~[\]{}<>]/g, ' ')
    .replace(/^[0-9\s.,-]+|[0-9\s.,-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Empaqueta un buffer de píxeles BGRA en un contenedor BMP válido de 54 bytes (32 bpp, top-down) en memoria.
 * Inicia obligatoriamente con la firma mágica 'BM' (0x42, 0x4D), garantizando compatibilidad con Tesseract/Leptonica.
 */
export function crearContenedorBmp(width: number, height: number, bgraPixels: Buffer): Buffer {
  const rowSize = width * 4;
  const imageSize = rowSize * height;
  const fileSize = 54 + imageSize;
  const bmp = Buffer.alloc(fileSize);

  // Cabecera BMP de 14 bytes
  bmp.write('BM', 0, 2, 'ascii'); // Firma mágica 'BM'
  bmp.writeUInt32LE(fileSize, 2);  // Tamaño total del archivo
  bmp.writeUInt16LE(0, 6);         // Reservado 1
  bmp.writeUInt16LE(0, 8);         // Reservado 2
  bmp.writeUInt32LE(54, 10);       // Offset donde inician los datos de píxeles (54)

  // Cabecera DIB BITMAPINFOHEADER (40 bytes)
  bmp.writeUInt32LE(40, 14);       // Tamaño cabecera DIB
  bmp.writeInt32LE(width, 18);     // Ancho en píxeles
  bmp.writeInt32LE(-height, 22);   // Alto negativo = orientación top-down estándar
  bmp.writeUInt16LE(1, 26);        // Planos de color
  bmp.writeUInt16LE(32, 28);       // Bits por píxel (32 bpp = BGRA)
  bmp.writeUInt32LE(0, 30);        // Compresión BI_RGB (sin compresión)
  bmp.writeUInt32LE(imageSize, 34);// Tamaño de imagen cruda
  bmp.writeInt32LE(2835, 38);      // Resolución horizontal (72 DPI)
  bmp.writeInt32LE(2835, 42);      // Resolución vertical (72 DPI)
  bmp.writeUInt32LE(0, 46);        // Colores en paleta
  bmp.writeUInt32LE(0, 50);        // Colores importantes

  // Copiar datos de píxel
  bgraPixels.copy(bmp, 54, 0, Math.min(bgraPixels.length, imageSize));
  return bmp;
}

/**
 * Preprocesa un recorte de imagen crudo (BGRA) para reconocimiento óptico de caracteres:
 * - Aplica reescalado x3 con muestreo vecino próximo para agrandar fuentes doradas/blancas
 * - Binarización invertida OBLIGATORIA para Tesseract:
 *   Letras brillantes (doradas/blancas) -> NEGRO (0, 0, 0)
 *   Fondo oscuro de la carta -> BLANCO (255, 255, 255)
 * - Empaqueta el resultado en un contenedor BMP válido en memoria (comienza con 'BM')
 * - Genera Data URL en Base64 para telemetría visual.
 */
export function preprocesarRecorteParaOcr(
  rawBgra: Buffer,
  origW: number,
  origH: number,
  escala = 3
): ImagenPreprocesada {
  const newW = Math.max(1, Math.round(origW * escala));
  const newH = Math.max(1, Math.round(origH * escala));
  const dest = Buffer.alloc(newW * newH * 4);

  // Histograma de luminancias para umbral adaptativo
  const lums: number[] = [];
  for (let i = 0; i < rawBgra.length; i += 4) {
    const b = rawBgra[i];
    const g = rawBgra[i + 1];
    const r = rawBgra[i + 2];
    lums.push(0.299 * r + 0.587 * g + 0.114 * b);
  }
  lums.sort((a, b) => a - b);
  const p70 = lums[Math.floor(lums.length * 0.70)] || 110;
  const umbral = Math.max(90, Math.min(160, p70));

  for (let y = 0; y < newH; y++) {
    const srcY = Math.min(origH - 1, Math.floor(y / escala));
    for (let x = 0; x < newW; x++) {
      const srcX = Math.min(origW - 1, Math.floor(x / escala));
      const srcIdx = (srcY * origW + srcX) * 4;
      const destIdx = (y * newW + x) * 4;

      if (srcIdx + 2 < rawBgra.length) {
        const b = rawBgra[srcIdx];
        const g = rawBgra[srcIdx + 1];
        const r = rawBgra[srcIdx + 2];

        // Títulos de LoL: texto dorado (R alto, G medio-alto, R > B + 15) o claro (lum >= umbral)
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const esTextoDorado = r >= 130 && g >= 100 && r > b + 15;
        const esTextoBrillante = esTextoDorado || lum >= umbral;

        // INVERSIÓN: Tesseract necesita letras NEGRAS (0) sobre fondo BLANCO (255)
        const pixelVal = esTextoBrillante ? 0 : 255;

        dest[destIdx] = pixelVal;     // B
        dest[destIdx + 1] = pixelVal; // G
        dest[destIdx + 2] = pixelVal; // R
        dest[destIdx + 3] = 255;      // A
      } else {
        dest[destIdx] = 255;
        dest[destIdx + 1] = 255;
        dest[destIdx + 2] = 255;
        dest[destIdx + 3] = 255;
      }
    }
  }

  const bmpBuffer = crearContenedorBmp(newW, newH, dest);
  const base64DataUrl = `data:image/bmp;base64,${bmpBuffer.toString('base64')}`;

  return {
    buffer: bmpBuffer,
    width: newW,
    height: newH,
    base64DataUrl,
  };
}

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
 * Revisa tanto el nombre en inglés (name) como en español (nameEs).
 * Aplica umbral de aceptación directa >= 0.62 (o >= 0.55 cuando la rareza visual coincide).
 */
export function emparejarAumento(
  ocrText: string,
  augments: AugmentInfo[],
  rarezaVisual?: RarityAugment | null
): { augment: AugmentInfo | null; score: number } {
  const textoLimpio = limpiarTextoOcr(ocrText);
  const normOcr = normalizarTexto(textoLimpio);
  if (!normOcr || normOcr.length < 3 || !augments || augments.length === 0) {
    return { augment: null, score: 0 };
  }

  let mejor: AugmentInfo | null = null;
  let mejorSimilitud = 0;

  for (const aug of augments) {
    const simEn = evaluarSimilitudOcrConTitulo(normOcr, aug.name);
    const simEs = evaluarSimilitudOcrConTitulo(normOcr, aug.nameEs);
    let simMax = Math.max(simEn, simEs);

    // Refuerzo perceptual de icono si la similitud de texto es cercana y coincide la rareza
    if (rarezaVisual && aug.rarity === rarezaVisual && simMax >= 0.45 && simMax < UMBRAL_SIMILITUD_DIRECTA) {
      simMax = Math.min(0.85, simMax + 0.15);
    }

    if (simMax > mejorSimilitud) {
      mejorSimilitud = simMax;
      mejor = aug;
    }
  }

  const umbralRequerido =
    rarezaVisual && mejor && mejor.rarity === rarezaVisual
      ? UMBRAL_SIMILITUD_CON_RAREZA
      : UMBRAL_SIMILITUD_DIRECTA;

  return {
    augment: mejorSimilitud >= umbralRequerido ? mejor : null,
    score: Math.round(mejorSimilitud * 100) / 100,
  };
}

/**
 * Arnés de debugging automático: guarda las capturas y resultados en scratch/ocr-debug/
 */
export function guardarDebugOcr(datos: {
  resolucion: { width: number; height: number };
  caja16a9: RectanguloNormalizado;
  pantallaCompleta?: Buffer;
  recortesOriginales: Buffer[];
  recortesBinarizados: Buffer[];
  cartas: Array<{
    slot: number;
    textoCrudoOcr: string;
    textoLimpio: string;
    mejorMatch: string | null;
    similitud: number;
    rarezaDetectada: string | null;
  }>;
}): void {
  try {
    const debugDir = path.join(process.cwd(), 'scratch', 'ocr-debug');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }

    if (datos.pantallaCompleta) {
      fs.writeFileSync(path.join(debugDir, '00_pantalla_completa.png'), datos.pantallaCompleta);
    }

    datos.recortesOriginales.forEach((buf, idx) => {
      fs.writeFileSync(path.join(debugDir, `carta_${idx}_original.png`), buf);
    });

    datos.recortesBinarizados.forEach((buf, idx) => {
      fs.writeFileSync(path.join(debugDir, `carta_${idx}_binarizada.bmp`), buf);
    });

    const info = {
      timestamp: new Date().toISOString(),
      resolucionCaptura: datos.resolucion,
      caja16a9: datos.caja16a9,
      cartas: datos.cartas,
    };
    fs.writeFileSync(path.join(debugDir, 'ultimo_resultado.json'), JSON.stringify(info, null, 2), 'utf-8');
  } catch (err: any) {
    registrarLog(`[ScreenAugmentDetector] Advertencia al guardar debug en disco: ${err?.message || err}`);
  }
}

export class ScreenAugmentDetector {
  private worker: any = null;
  private workerPromise: Promise<any> | null = null;

  public async getWorker(): Promise<any> {
    if (this.worker) return this.worker;
    if (!this.workerPromise) {
      this.workerPromise = (async () => {
        try {
          const isPackaged = typeof electronApp !== 'undefined' && Boolean(electronApp?.isPackaged);
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

          const options: any = {
            langPath,
            cacheMethod: 'none',
            gzip: false,
            errorHandler: (err: any) => {
              registrarLog(`[ScreenAugmentDetector] Notificación worker OCR: ${err?.message || err}`);
            },
          };

          if (fs.existsSync(workerPath)) {
            options.workerPath = workerPath;
          }
          if (fs.existsSync(corePath)) {
            options.corePath = corePath;
          }

          const initWorkerPromise = (async () => {
            const w = await createWorker(['eng', 'spa'], 1, options);
            await w.setParameters({
              tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
            });
            return w;
          })();

          const timeoutPromise = new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout inicializando worker Tesseract (4000ms)')), 4000)
          );

          const w = await Promise.race([initWorkerPromise, timeoutPromise]);
          this.worker = w;
          registrarLog('[ScreenAugmentDetector] Worker Tesseract OCR inicializado con éxito (PSM 6).');
          return w;
        } catch (err: any) {
          registrarLog(`[ScreenAugmentDetector] Advertencia al iniciar worker OCR: ${err?.message || err}`);
          this.workerPromise = null;
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
   * Analiza una única carta de aumento con doble banda vertical Y y timeout duro.
   */
  public async analizarCartaIndividual(
    cardIndex: 1 | 2 | 3,
    datosModo: DatosModoCampeon | null
  ): Promise<CardMatchResult | null> {
    try {
      const worker = await this.getWorker();
      if (!worker) return null;

      const primaryDisplay = electronScreen?.getPrimaryDisplay?.() || {
        bounds: { width: 1920, height: 1080 },
        size: { width: 1920, height: 1080 },
        scaleFactor: 1,
      };
      const scaleFactor = primaryDisplay.scaleFactor || 1;
      const width = Math.round((primaryDisplay.size?.width || primaryDisplay.bounds?.width || 1920) * scaleFactor);
      const height = Math.round((primaryDisplay.size?.height || primaryDisplay.bounds?.height || 1080) * scaleFactor);

      if (!electronDesktopCapturer) return null;
      const sources = await electronDesktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height },
      });

      if (!sources || sources.length === 0) return null;

      const screenImg = sources[0].thumbnail;
      const bmpFull = screenImg.toBitmap();
      const caja16a9 = calcularCajaNormalizada16a9(width, height);
      const colConfig = CARD_COLUMNS[cardIndex - 1];
      const iconConfig = CARD_ICON_ROIS[cardIndex - 1];

      const iconRect = {
        x: Math.round(caja16a9.x + caja16a9.width * iconConfig.xPercent),
        y: Math.round(caja16a9.y + caja16a9.height * iconConfig.yPercent),
        width: Math.round(caja16a9.width * iconConfig.widthPercent),
        height: Math.round(caja16a9.height * iconConfig.heightPercent),
      };

      const rarezaVisual = estimarRarezaVisual(bmpFull, width, height, iconRect);
      const catalogoNombres = this.obtenerCatalogoNombres(datosModo);

      let mejorMatch = { augment: null as AugmentInfo | null, score: 0 };
      let mejorTexto = '';
      let mejorPreview = '';

      // Probar las dos sub-bandas verticales Y (superior y central)
      for (const yBand of TITLE_Y_BANDS) {
        const cropRect = {
          x: Math.round(caja16a9.x + caja16a9.width * colConfig.xPercent),
          y: Math.round(caja16a9.y + caja16a9.height * yBand.yPercent),
          width: Math.round(caja16a9.width * colConfig.widthPercent),
          height: Math.round(caja16a9.height * yBand.heightPercent),
        };

        const cropNative = screenImg.crop(cropRect);
        const preprocessed = preprocesarRecorteParaOcr(
          cropNative.toBitmap(),
          cropRect.width,
          cropRect.height,
          3
        );

        if (!mejorPreview) {
          mejorPreview = preprocessed.base64DataUrl;
        }

        try {
          const ocrTask = worker.recognize(preprocessed.buffer);
          const timeoutTask = new Promise<any>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout OCR de ${OCR_TIMEOUT_MS}ms`)), OCR_TIMEOUT_MS)
          );

          const ocrRes = await Promise.race([ocrTask, timeoutTask]);
          const rawText = ocrRes?.data?.text || '';
          const match = emparejarAumento(rawText, catalogoNombres, rarezaVisual);

          if (match.score > mejorMatch.score) {
            mejorMatch = match;
            mejorTexto = rawText;
            mejorPreview = preprocessed.base64DataUrl;
          }
        } catch {}
      }

      let finalAugment: AugmentInfo | null = null;
      if (mejorMatch.augment) {
        const encontrado = datosModo?.augments?.find(
          (a) => a.id === mejorMatch.augment?.id || a.key === mejorMatch.augment?.key
        );
        if (encontrado) {
          finalAugment = { ...encontrado };
        } else {
          finalAugment = {
            ...mejorMatch.augment,
            tier: '?' as TierBadge,
            pickRate: undefined as any,
          };
        }
      }

      return {
        cardIndex,
        augment: finalAugment,
        rawText: mejorTexto.replace(/\s+/g, ' ').trim(),
        confidence: mejorMatch.score,
        cropPreviewDataUrl: mejorPreview,
      };
    } catch (err: any) {
      registrarLog(`[ScreenAugmentDetector] Error al analizar carta individual ${cardIndex}: ${err?.message || err}`);
      return null;
    }
  }

  /**
   * Captura la pantalla y analiza simultáneamente las 3 cartas de aumentos con normalización 16:9,
   * doble sub-banda vertical Y, binarización invertida para Tesseract y arnés de depuración en disco.
   */
  public async analizarPantalla(
    datosModo: DatosModoCampeon | null,
    onProgress?: (paso: string) => void
  ): Promise<ScreenAugmentsResult | null> {
    const catalogoNombres = this.obtenerCatalogoNombres(datosModo);

    try {
      onProgress?.('1/3 Capturando pantalla...');
      const worker = await this.getWorker();
      if (!worker) {
        return null;
      }

      const primaryDisplay = electronScreen?.getPrimaryDisplay?.() || {
        bounds: { width: 1920, height: 1080 },
        size: { width: 1920, height: 1080 },
        scaleFactor: 1,
      };
      const scaleFactor = primaryDisplay.scaleFactor || 1;
      const width = Math.round((primaryDisplay.size?.width || primaryDisplay.bounds?.width || 1920) * scaleFactor);
      const height = Math.round((primaryDisplay.size?.height || primaryDisplay.bounds?.height || 1080) * scaleFactor);

      if (!electronDesktopCapturer) return null;
      const sources = await electronDesktopCapturer.getSources({
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

      const debugOriginales: Buffer[] = [];
      const debugBinarizados: Buffer[] = [];
      const debugInfoCartas: any[] = [];

      onProgress?.('2/3 Ejecutando OCR en títulos...');

      for (let i = 0; i < 3; i++) {
        const colConfig = CARD_COLUMNS[i];
        const iconConfig = CARD_ICON_ROIS[i];

        const iconRect = {
          x: Math.round(caja16a9.x + caja16a9.width * iconConfig.xPercent),
          y: Math.round(caja16a9.y + caja16a9.height * iconConfig.yPercent),
          width: Math.round(caja16a9.width * iconConfig.widthPercent),
          height: Math.round(caja16a9.height * iconConfig.heightPercent),
        };

        const rarezaVisual = estimarRarezaVisual(bmpFull, width, height, iconRect);

        let mejorMatch = { augment: null as AugmentInfo | null, score: 0 };
        let mejorTexto = '';
        let mejorPreview = '';
        let cardError: string | undefined = undefined;

        // Evaluar las dos sub-bandas Y para máxima tolerancia posicional
        for (const yBand of TITLE_Y_BANDS) {
          const cropRect = {
            x: Math.round(caja16a9.x + caja16a9.width * colConfig.xPercent),
            y: Math.round(caja16a9.y + caja16a9.height * yBand.yPercent),
            width: Math.round(caja16a9.width * colConfig.widthPercent),
            height: Math.round(caja16a9.height * yBand.heightPercent),
          };

          const cropNative = screenImg.crop(cropRect);
          if (debugOriginales.length === i) {
            debugOriginales.push(cropNative.toPNG());
          }

          // Preprocesar con letras negras sobre fondo blanco (escala x3)
          const preprocessed = preprocesarRecorteParaOcr(
            cropNative.toBitmap(),
            cropRect.width,
            cropRect.height,
            3
          );

          if (debugBinarizados.length === i) {
            debugBinarizados.push(preprocessed.buffer);
          }
          if (!mejorPreview) {
            mejorPreview = preprocessed.base64DataUrl;
          }

          try {
            const ocrTask = worker.recognize(preprocessed.buffer);
            const timeoutTask = new Promise<any>((_, reject) =>
              setTimeout(() => reject(new Error(`Timeout OCR (${OCR_TIMEOUT_MS}ms)`)), OCR_TIMEOUT_MS)
            );

            const ocrRes = await Promise.race([ocrTask, timeoutTask]);
            const rawText = ocrRes?.data?.text || '';
            const match = emparejarAumento(rawText, catalogoNombres, rarezaVisual);

            if (match.score > mejorMatch.score) {
              mejorMatch = match;
              mejorTexto = rawText;
              mejorPreview = preprocessed.base64DataUrl;
            }
          } catch (err: any) {
            cardError = err?.message || 'Error en OCR';
          }
        }

        let finalAugment: AugmentInfo | null = null;
        if (mejorMatch.augment) {
          const encontrado = datosModo?.augments?.find(
            (a) => a.id === mejorMatch.augment?.id || a.key === mejorMatch.augment?.key
          );
          if (encontrado) {
            finalAugment = { ...encontrado };
          } else {
            finalAugment = {
              ...mejorMatch.augment,
              tier: '?' as TierBadge,
              pickRate: undefined as any,
            };
          }
        }

        resultados.push({
          cardIndex: colConfig.index,
          augment: finalAugment,
          rawText: mejorTexto.replace(/\s+/g, ' ').trim(),
          confidence: mejorMatch.score,
          cropPreviewDataUrl: mejorPreview,
          error: cardError,
        });

        debugInfoCartas.push({
          slot: colConfig.index,
          textoCrudoOcr: mejorTexto,
          textoLimpio: limpiarTextoOcr(mejorTexto),
          mejorMatch: finalAugment?.name || null,
          similitud: mejorMatch.score,
          rarezaDetectada: rarezaVisual || null,
        });

        registrarLog(
          `[ScreenAugmentDetector] Carta ${colConfig.index}: ${
            finalAugment ? finalAugment.name + ' (Tier ' + finalAugment.tier + ')' : 'No reconocido'
          } (Score: ${mejorMatch.score}, Raw: "${mejorTexto.replace(/\s+/g, ' ').trim()}", Rareza: ${rarezaVisual || 'n/a'})`
        );
      }

      // Guardar volcado automático en disco para depuración empírica
      guardarDebugOcr({
        resolucion: { width, height },
        caja16a9,
        pantallaCompleta: screenImg.toPNG(),
        recortesOriginales: debugOriginales,
        recortesBinarizados: debugBinarizados,
        cartas: debugInfoCartas,
      });

      onProgress?.('3/3 Lectura finalizada');

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
        isAnalyzing: false,
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
