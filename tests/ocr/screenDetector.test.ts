import { describe, it, expect } from 'vitest';
import { emparejarAumento } from '../../src/main/ocr/ScreenAugmentDetector';
import type { AugmentInfo } from '../../src/shared/types';

describe('ScreenAugmentDetector - Emparejamiento de Aumentos por OCR', () => {
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

  it('empareja correctamente por nombre en inglés', () => {
    const res = emparejarAumento('Hybrid Damage Attack Ability deals increased', mockAugments);
    expect(res.augment).not.toBeNull();
    expect(res.augment?.name).toBe('Hybrid');
    expect(res.augment?.tier).toBe('S+');
  });

  it('empareja correctamente por nombre en español', () => {
    const res = emparejarAumento('Sacrificio voluntario otorga escudo a aliados', mockAugments);
    expect(res.augment).not.toBeNull();
    expect(res.augment?.name).toBe('Willing Sacrifice');
    expect(res.augment?.tier).toBe('B');
  });

  it('empareja por palabras clave de la descripción cuando el título está cortado', () => {
    const res = emparejarAumento('Gain 100 Item Haste equivalent to Item CDR', mockAugments);
    expect(res.augment).not.toBeNull();
    expect(res.augment?.name).toBe('Apex Inventor');
  });

  it('devuelve null cuando el texto de OCR no coincide con nada', () => {
    const res = emparejarAumento('Texto desconocido totalmente aleatorio xyz 123', mockAugments);
    expect(res.augment).toBeNull();
  });
});
