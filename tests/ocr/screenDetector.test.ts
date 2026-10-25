import { describe, it, expect } from 'vitest';
import {
  emparejarAumento,
  calcularDistanciaDamerauLevenshtein,
  calcularSimilitudDamerauLevenshtein,
  evaluarSimilitudOcrConTitulo,
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
      rarity: 'silver',
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
});
