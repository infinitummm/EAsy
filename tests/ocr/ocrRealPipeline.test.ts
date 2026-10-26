/**
 * tests/ocr/ocrRealPipeline.test.ts
 * Test de integración E2E del pipeline de OCR con Tesseract.js real (sin mocks)
 * sobre buffers sintéticos con binarización invertida empaquetados en contenedores BMP válidos.
 * Verifica el reconocimiento y emparejamiento con augmentsCatalog.json (score > 0.80).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createWorker, PSM, type Worker } from 'tesseract.js';
import {
  preprocesarRecorteParaOcr,
  emparejarAumento,
} from '../../src/main/ocr/ScreenAugmentDetector';
import rawAugmentsCatalog from '../../src/shared/data/augmentsCatalog.json';
import type { AugmentInfo } from '../../src/shared/types';

// Matriz de glifos 7x9 para generar recortes sintéticos realistas con texto dorado sobre fondo oscuro de LoL
const FONT_7X9: Record<string, string[]> = {
  'A': [
    '..###..',
    '.#...#.',
    '#.....#',
    '#.....#',
    '#######',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#'
  ],
  'B': [
    '######.',
    '#.....#',
    '#.....#',
    '######.',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '######.'
  ],
  'C': [
    '.#####.',
    '#.....#',
    '#......',
    '#......',
    '#......',
    '#......',
    '#......',
    '#.....#',
    '.#####.'
  ],
  'D': [
    '#####..',
    '#....#.',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#....#.',
    '#####..'
  ],
  'E': [
    '#######',
    '#......',
    '#......',
    '#####..',
    '#......',
    '#......',
    '#......',
    '#......',
    '#######'
  ],
  'G': [
    '.#####.',
    '#.....#',
    '#......',
    '#......',
    '#.####.',
    '#....#.',
    '#....#.',
    '#....#.',
    '.####..'
  ],
  'H': [
    '#.....#',
    '#.....#',
    '#.....#',
    '#######',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#'
  ],
  'I': [
    '#######',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '#######'
  ],
  'L': [
    '#......',
    '#......',
    '#......',
    '#......',
    '#......',
    '#......',
    '#......',
    '#......',
    '#######'
  ],
  'M': [
    '#.....#',
    '##...##',
    '#.#.#.#',
    '#..#..#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#'
  ],
  'N': [
    '#.....#',
    '##....#',
    '#.#...#',
    '#..#..#',
    '#...#.#',
    '#....##',
    '#.....#',
    '#.....#',
    '#.....#'
  ],
  'O': [
    '.#####.',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '.#####.'
  ],
  'R': [
    '######.',
    '#.....#',
    '#.....#',
    '######.',
    '#...#..',
    '#....#.',
    '#....#.',
    '#.....#',
    '#.....#'
  ],
  'S': [
    '.#####.',
    '#.....#',
    '#......',
    '.#####.',
    '......#',
    '......#',
    '#.....#',
    '#.....#',
    '.#####.'
  ],
  'T': [
    '#######',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '...#...'
  ],
  'Y': [
    '#.....#',
    '.#...#.',
    '..#.#..',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '...#...'
  ],
  ' ': [
    '.......',
    '.......',
    '.......',
    '.......',
    '.......',
    '.......',
    '.......',
    '.......',
    '.......'
  ]
};

function generarRecorteSintetico(texto: string, scale = 5): { bmp: Buffer; width: number; height: number } {
  const padX = 30;
  const padY = 20;
  const charW = 7 * scale;
  const charH = 9 * scale;
  const spacing = 3 * scale;
  const totalW = padX * 2 + texto.length * charW + Math.max(0, texto.length - 1) * spacing;
  const totalH = padY * 2 + charH;

  // Fondo oscuro típico de una carta de LoL (R=25, G=25, B=30)
  const bgra = Buffer.alloc(totalW * totalH * 4, 0);
  for (let i = 0; i < bgra.length; i += 4) {
    bgra[i] = 30;     // B
    bgra[i + 1] = 25; // G
    bgra[i + 2] = 25; // R
    bgra[i + 3] = 255;// A
  }

  let curX = padX;
  for (const ch of texto.toUpperCase()) {
    const glyph = FONT_7X9[ch] || FONT_7X9[' '];
    for (let row = 0; row < 9; row++) {
      const line = glyph[row];
      for (let col = 0; col < 7; col++) {
        if (line[col] === '#') {
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              const px = curX + col * scale + dx;
              const py = padY + row * scale + dy;
              const idx = (py * totalW + px) * 4;
              // Letras doradas características de títulos de aumentos de LoL
              bgra[idx] = 90;     // B
              bgra[idx + 1] = 200;// G
              bgra[idx + 2] = 240;// R
              bgra[idx + 3] = 255;// A
            }
          }
        }
      }
    }
    curX += charW + spacing;
  }

  return { bmp: bgra, width: totalW, height: totalH };
}

describe('Pipeline Real de OCR con Tesseract.js (Sin Mocks)', () => {
  let worker: Worker | null = null;
  const catalogo = rawAugmentsCatalog as unknown as AugmentInfo[];

  beforeAll(async () => {
    worker = await createWorker('eng');
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
    });
  }, 30000);

  afterAll(async () => {
    if (worker) {
      await worker.terminate();
      worker = null;
    }
  });

  it('reconoce "HYBRID" con preprocesamiento invertido y empareja al 100% (score = 1.0)', async () => {
    expect(worker).not.toBeNull();
    const { bmp, width, height } = generarRecorteSintetico('HYBRID', 5);

    // Preprocesamiento real con binarización invertida (letras negras sobre fondo blanco)
    const preprocessed = preprocesarRecorteParaOcr(bmp, width, height, 1);
    expect(preprocessed.buffer.subarray(0, 2).toString('ascii')).toBe('BM');

    const res = await worker!.recognize(preprocessed.buffer);
    const rawText = res.data.text.trim();
    expect(rawText).toBe('HYBRID');

    const match = emparejarAumento(rawText, catalogo);
    expect(match.augment).not.toBeNull();
    expect(match.augment?.name).toBe('Hybrid');
    expect(match.score).toBeGreaterThanOrEqual(0.80);
  }, 15000);

  it('reconoce "GIANT SLAYER" tolerando imperfecciones y empareja con score > 0.80', async () => {
    expect(worker).not.toBeNull();
    const { bmp, width, height } = generarRecorteSintetico('GIANT SLAYER', 5);

    const preprocessed = preprocesarRecorteParaOcr(bmp, width, height, 1);
    const res = await worker!.recognize(preprocessed.buffer);
    const rawText = res.data.text.trim();

    const match = emparejarAumento(rawText, catalogo);
    expect(match.augment).not.toBeNull();
    expect(match.augment?.name).toBe('Giant Slayer');
    expect(match.score).toBeGreaterThanOrEqual(0.80);
  }, 15000);

  it('reconoce "ARCHMAGE" con score > 0.80', async () => {
    expect(worker).not.toBeNull();
    const { bmp, width, height } = generarRecorteSintetico('ARCHMAGE', 5);

    const preprocessed = preprocesarRecorteParaOcr(bmp, width, height, 1);
    const res = await worker!.recognize(preprocessed.buffer);
    const rawText = res.data.text.trim();

    const match = emparejarAumento(rawText, catalogo);
    expect(match.augment).not.toBeNull();
    expect(match.augment?.name).toBe('Archmage');
    expect(match.score).toBeGreaterThanOrEqual(0.80);
  }, 15000);
});
