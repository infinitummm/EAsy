import { describe, it, expect } from 'vitest';
import {
  ALL_CHAMPIONS,
  getChampionById,
  getChampionName,
  getChampionIconUrl
} from '../../src/shared/champions';

describe('Champions Shared Module', () => {
  it('debe tener una lista exhaustiva de campeones de LoL', () => {
    expect(ALL_CHAMPIONS.length).toBeGreaterThanOrEqual(160);
  });

  it('debe encontrar campeones conocidos por ID', () => {
    const aatrox = getChampionById(266);
    expect(aatrox).toBeDefined();
    expect(aatrox?.name).toBe('Aatrox');
    expect(aatrox?.image).toBe('Aatrox.png');

    const jax = getChampionById(24);
    expect(jax).toBeDefined();
    expect(jax?.name).toBe('Jax');
  });

  it('debe devolver undefined para IDs inexistentes', () => {
    expect(getChampionById(-1)).toBeUndefined();
    expect(getChampionById(999999)).toBeUndefined();
  });

  it('debe resolver el nombre del campeón correctamente con fallback', () => {
    expect(getChampionName(266)).toBe('Aatrox');
    expect(getChampionName(24)).toBe('Jax');
    expect(getChampionName(999999)).toBe('Campeón 999999');
    expect(getChampionName(999999, 'Desconocido')).toBe('Desconocido 999999');
  });

  it('debe generar URLs de iconos de DataDragon válidas', () => {
    const urlAatrox = getChampionIconUrl(266, '14.20.1');
    expect(urlAatrox).toContain('https://ddragon.leagueoflegends.com/cdn/14.20.1/img/champion/Aatrox.png');

    const urlByFilename = getChampionIconUrl('Ahri.png', '14.20.1');
    expect(urlByFilename).toContain('Ahri.png');
  });
});
