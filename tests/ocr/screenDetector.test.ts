import { describe, it, expect } from 'vitest';
import {
  emparejarAumento,
  calcularDistanciaDamerauLevenshtein,
  calcularSimilitudDamerauLevenshtein,
  evaluarSimilitudOcrConTitulo,
  calcularCajaNormalizada16a9,
  estimarRarezaVisual,
  crearContenedorBmp,
  preprocesarRecorteParaOcr,
} from '../../src/main/ocr/ScreenAugmentDetector';
import type { AugmentInfo } from '../../src/shared/types';

describe('ScreenAugmentDetector - Emparejamiento Difuso de Aumentos por OCR (RF-2)', () => {
  const mockAugments: AugmentInfo[] = [
    {
      id: 101,
      name: 'Hybrid',
      nameEs: 'Híbrido',
      key: 'Hybrid',
      rarity: 'silver',
      tier: 'S+',
      pickRate: 15.2,
      winRate: 59.1,
      iconUrl: 'https://cdn.example/hybrid.png',
      desc: 'When you deal damage with an Attack your next Ability deals increased damage',
    },
    {
      id: 102,
      name: 'Willing Sacrifice',
      nameEs: 'Sacrificio voluntario',
      key: 'WillingSacrifice',
      rarity: 'silver',
      tier: 'B',
      pickRate: 4.8,
      winRate: 49.3,
      iconUrl: 'https://cdn.example/willing.png',
      desc: 'When an allied champion drops below 30% Health trade some of your health to shield them',
    },
    {
      id: 103,
      name: 'Apex Inventor',
      nameEs: 'Inventor supremo',
      key: 'ApexInventor',
      rarity: 'gold',
      tier: 'A',
      pickRate: 8.5,
      winRate: 54.2,
      iconUrl: 'https://cdn.example/apex.png',
      desc: 'Gain 100 Item Haste equivalent to 50% Item CDR',
    },
    {
      id: 104,
      name: 'Brass Blast',
      nameEs: 'Trompetazo',
      key: 'BrassBlast',
      rarity: 'prismatic',
      tier: 'B',
      pickRate: 6.2,
      winRate: 51.0,
      iconUrl: 'https://cdn.example/brass.png',
      desc: 'Replace a Summoner Spell with Brass Blast Knocking Back and dealing magic damage',
    },
  ];

  it('normaliza la caja a proporción 16:9 centrada para diversas resoluciones', () => {
    // 1080p nativo (16:9)
    const box1080 = calcularCajaNormalizada16a9(1920, 1080);
    expect(box1080).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });

    // 1440p nativo (16:9)
    const box1440 = calcularCajaNormalizada16a9(2560, 1440);
    expect(box1440).toEqual({ x: 0, y: 0, width: 2560, height: 1440 });

    // 21:9 Ultra-panorámico (2560x1080) -> caja centrada de 1920x1080 con bandas a los lados
    const boxUltrawide = calcularCajaNormalizada16a9(2560, 1080);
    expect(boxUltrawide.width).toBe(1920);
    expect(boxUltrawide.height).toBe(1080);
    expect(boxUltrawide.x).toBe(320);
    expect(boxUltrawide.y).toBe(0);

    // 16:10 (1920x1200) -> caja centrada de 1920x1080 con bandas arriba y abajo
    const box16a10 = calcularCajaNormalizada16a9(1920, 1200);
    expect(box16a10.width).toBe(1920);
    expect(box16a10.height).toBe(1080);
    expect(box16a10.x).toBe(0);
    expect(box16a10.y).toBe(60);
  });

  it('estima la rareza visual a partir del marco/icono en el bitmap', () => {
    const w = 50;
    const h = 50;

    // Bitmap Oro: R alto, G medio, B bajo
    const bmpOro = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h * 4; i += 4) {
      bmpOro[i] = 40;     // B
      bmpOro[i + 1] = 160; // G
      bmpOro[i + 2] = 220; // R
      bmpOro[i + 3] = 255;
    }
    expect(estimarRarezaVisual(bmpOro, w, h, { x: 0, y: 0, width: w, height: h })).toBe('gold');

    // Bitmap Prismático: R alto, B alto, G menor
    const bmpPrism = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h * 4; i += 4) {
      bmpPrism[i] = 200;   // B
      bmpPrism[i + 1] = 80; // G
      bmpPrism[i + 2] = 180; // R
      bmpPrism[i + 3] = 255;
    }
    expect(estimarRarezaVisual(bmpPrism, w, h, { x: 0, y: 0, width: w, height: h })).toBe('prismatic');

    // Bitmap Plata: gris equilibrado
    const bmpPlata = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h * 4; i += 4) {
      bmpPlata[i] = 150;   // B
      bmpPlata[i + 1] = 150; // G
      bmpPlata[i + 2] = 150; // R
      bmpPlata[i + 3] = 255;
    }
    expect(estimarRarezaVisual(bmpPlata, w, h, { x: 0, y: 0, width: w, height: h })).toBe('silver');
  });

  it('aplica refuerzo perceptual de rareza ante lectura OCR dudosa (0.45 - 0.69)', () => {
    // "Apex Inven" tiene similitud ~0.60 respecto a "Apex Inventor"
    const resSinRareza = emparejarAumento('Apex Inven', mockAugments);
    // Sin rareza, puede quedar al límite o por debajo del 0.70
    // Si proporcionamos rareza visual 'gold' que coincide con Apex Inventor, el match se confirma
    const resConRareza = emparejarAumento('Apex Inven', mockAugments, 'gold');
    expect(resConRareza.augment).not.toBeNull();
    expect(resConRareza.augment?.name).toBe('Apex Inventor');
    expect(resConRareza.score).toBeGreaterThanOrEqual(0.70);
  });

  it('calcula distancia y similitud Damerau-Levenshtein correctamente', () => {
    // 1 sustitución
    expect(calcularDistanciaDamerauLevenshtein('hybrid', 'hybrld')).toBe(1);
    // 1 transposición (Damerau)
    expect(calcularDistanciaDamerauLevenshtein('hybird', 'hybrid')).toBe(1);

    expect(calcularSimilitudDamerauLevenshtein('hybrid', 'hybrid')).toBe(1.0);
    expect(calcularSimilitudDamerauLevenshtein('hybrld', 'hybrid')).toBeGreaterThanOrEqual(0.8);
  });

  it('empareja correctamente con lectura OCR exacta en inglés', () => {
    const res = emparejarAumento('Hybrid', mockAugments);
    expect(res.augment).not.toBeNull();
    expect(res.augment?.name).toBe('Hybrid');
    expect(res.augment?.tier).toBe('S+');
    expect(res.score).toBe(1.0);
  });

  it('empareja con 1 o 2 caracteres errados por ruido de OCR (Levenshtein >= 0.70)', () => {
    // "Sacriflcio voluntario" con 'l' en lugar de 'i'
    const res = emparejarAumento('Sacriflcio voluntario', mockAugments);
    expect(res.augment).not.toBeNull();
    expect(res.augment?.name).toBe('Willing Sacrifice');
    expect(res.score).toBeGreaterThanOrEqual(0.70);
  });

  it('tolera texto adicional capturado junto al título', () => {
    const res = emparejarAumento('Apex Inventor Speed Utility', mockAugments);
    expect(res.augment).not.toBeNull();
    expect(res.augment?.name).toBe('Apex Inventor');
    expect(res.score).toBeGreaterThanOrEqual(0.70);
  });

  it('rechaza y devuelve null cuando el texto es ruido aleatorio o palabras sueltas de descripción', () => {
    // Palabras de descripción no deben activar emparejamiento espurio
    const resDescripcion = emparejarAumento('Gain 100 Item Haste equivalent', mockAugments);
    expect(resDescripcion.augment).toBeNull();

    const resRuido = emparejarAumento('Texto desconocido totalmente aleatorio xyz 123', mockAugments);
    expect(resRuido.augment).toBeNull();
    expect(resRuido.score).toBeLessThan(0.70);
  });

  it('empaqueta el buffer preprocesado en un contenedor BMP válido con firma BM para Tesseract (Punto 1)', () => {
    const origW = 40;
    const origH = 20;
    const rawBgra = Buffer.alloc(origW * origH * 4, 180);

    const preprocessed = preprocesarRecorteParaOcr(rawBgra, origW, origH, 2);

    // Debe comenzar con la firma mágica 'BM' (0x42, 0x4D) de cabecera BMP de 54 bytes
    const signature = preprocessed.buffer.subarray(0, 2).toString('ascii');
    expect(signature).toBe('BM');
    expect(preprocessed.buffer[0]).toBe(0x42);
    expect(preprocessed.buffer[1]).toBe(0x4d);

    // Debe tener dimensiones reescaladas al doble
    expect(preprocessed.width).toBe(origW * 2);
    expect(preprocessed.height).toBe(origH * 2);

    // Tamaño total: 54 bytes de cabecera + (ancho * alto * 4)
    const expectedSize = 54 + origW * 2 * origH * 2 * 4;
    expect(preprocessed.buffer.length).toBe(expectedSize);

    // Data URL en Base64 para telemetría visual inmediata
    expect(preprocessed.base64DataUrl).toMatch(/^data:image\/bmp;base64,/);
  });

  it('crearContenedorBmp genera cabecera estándar de 54 bytes compatible con Leptonica', () => {
    const w = 15;
    const h = 10;
    const bgra = Buffer.alloc(w * h * 4, 255);
    const bmp = crearContenedorBmp(w, h, bgra);

    expect(bmp.subarray(0, 2).toString('ascii')).toBe('BM');
    expect(bmp.readUInt32LE(10)).toBe(54); // Offset de píxeles
    expect(bmp.readUInt32LE(14)).toBe(40); // BITMAPINFOHEADER size
    expect(bmp.readInt32LE(18)).toBe(w);  // Ancho
    expect(bmp.readInt32LE(22)).toBe(-h); // Alto top-down
    expect(bmp.readUInt16LE(28)).toBe(32); // 32 bpp
  });
});
