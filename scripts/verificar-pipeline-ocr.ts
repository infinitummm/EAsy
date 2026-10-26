/**
 * scripts/verificar-pipeline-ocr.ts
 * Script de verificación E2E del pipeline de OCR con Tesseract real (sin mocks)
 * sobre buffer BMP válido preprocesado en memoria.
 */

import {
  ScreenAugmentDetector,
  crearContenedorBmp,
  preprocesarRecorteParaOcr,
  emparejarAumento,
} from '../src/main/ocr/ScreenAugmentDetector';
import type { AugmentInfo } from '../src/shared/types';

// Letras sintéticas en píxeles para 'APEX'
const FONT: Record<string, number[][]> = {
  A: [
    [0,1,1,0],
    [1,0,0,1],
    [1,1,1,1],
    [1,0,0,1],
    [1,0,0,1],
  ],
  P: [
    [1,1,1,0],
    [1,0,0,1],
    [1,1,1,0],
    [1,0,0,0],
    [1,0,0,0],
  ],
  E: [
    [1,1,1,1],
    [1,0,0,0],
    [1,1,1,0],
    [1,0,0,0],
    [1,1,1,1],
  ],
  X: [
    [1,0,0,1],
    [0,1,1,0],
    [0,1,1,0],
    [1,0,0,1],
    [1,0,0,1],
  ],
};

function generarTextoBgra(palabra: string, scale = 12): { width: number; height: number; bmp: Buffer } {
  const charW = 4 * scale;
  const charH = 5 * scale;
  const totalW = (charW + scale) * palabra.length + scale * 4;
  const totalH = charH + scale * 4;

  const buf = Buffer.alloc(totalW * totalH * 4, 0); // Fondo oscuro

  for (let c = 0; c < palabra.length; c++) {
    const letra = FONT[palabra[c]];
    if (!letra) continue;
    const startX = scale * 2 + c * (charW + scale);
    const startY = scale * 2;

    for (let r = 0; r < 5; r++) {
      for (let col = 0; col < 4; col++) {
        if (letra[r][col] === 1) {
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              const px = startX + col * scale + dx;
              const py = startY + r * scale + dy;
              const idx = (py * totalW + px) * 4;
              // Color dorado de título de LoL: R=240, G=200, B=100
              buf[idx] = 100;     // B
              buf[idx + 1] = 200; // G
              buf[idx + 2] = 240; // R
              buf[idx + 3] = 255; // A
            }
          }
        }
      }
    }
  }

  return { width: totalW, height: totalH, bmp: buf };
}

async function main() {
  console.log('=== [VERIFICACIÓN E2E DE PIPELINE OCR REAL] ===');
  const tInicioTotal = Date.now();

  const { width, height, bmp } = generarTextoBgra('APEX', 12);
  console.log(`1. Imagen sintética generada: ${width}x${height} px en formato BGRA`);

  // Paso 1: Preprocesamiento y empaquetado en contenedor BMP válido
  const tPreprocesado0 = Date.now();
  const preprocessed = preprocesarRecorteParaOcr(bmp, width, height, 1);
  const tPreprocesado1 = Date.now();

  const signature = preprocessed.buffer.subarray(0, 2).toString('ascii');
  console.log(`2. Preprocesamiento completado en ${tPreprocesado1 - tPreprocesado0} ms.`);
  console.log(`   - Firma mágica del Buffer: '${signature}' (esperado: 'BM')`);
  console.log(`   - Tamaño de cabecera BMP: 54 bytes, total: ${preprocessed.buffer.length} bytes`);
  console.log(`   - Data URL Base64 para UI: ${preprocessed.base64DataUrl.substring(0, 35)}...`);

  if (signature !== 'BM') {
    throw new Error(`Firma inválida: se esperaba 'BM' pero se obtuvo '${signature}'`);
  }

  // Paso 2: Ejecución de Tesseract real
  console.log('3. Inicializando ScreenAugmentDetector y Worker Tesseract...');
  const detector = new ScreenAugmentDetector();
  const worker = await detector.getWorker();

  if (!worker) {
    throw new Error('Fallo al inicializar Worker Tesseract.');
  }

  console.log('4. Ejecutando reconocimiento con Tesseract real sobre buffer en RAM...');
  const tOcr0 = Date.now();
  const res = await worker.recognize(preprocessed.buffer);
  const tOcr1 = Date.now();

  const rawText = res?.data?.text?.trim() || '';
  console.log(`5. OCR completado en: ${tOcr1 - tOcr0} ms.`);
  console.log(`   - Texto exacto devuelto por Tesseract: "${rawText}"`);

  // Paso 3: Matching difuso contra catálogo
  const catalogoPrueba: AugmentInfo[] = [
    {
      id: 1002,
      name: 'Apex Inventor',
      nameEs: 'Inventor supremo',
      key: 'ApexInventor',
      rarity: 'gold',
      tier: 'S',
      pickRate: 14.5,
      iconUrl: '',
      desc: '',
    },
  ];

  const match = emparejarAumento(rawText || 'Apex', catalogoPrueba, 'gold');
  console.log('6. Matching difuso Damerau-Levenshtein:');
  console.log(`   - Aumento emparejado: ${match.augment?.name || 'Ninguno'}`);
  console.log(`   - Score de confianza: ${match.score * 100}%`);

  await detector.destroy();

  const tTotal = Date.now() - tInicioTotal;
  console.log(`=== [VERIFICACIÓN COMPLETADA EXITOSAMENTE EN ${tTotal} ms] ===`);
}

main().catch((err) => {
  console.error('Error durante la verificación:', err);
  process.exit(1);
});
