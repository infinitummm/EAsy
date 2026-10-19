import { describe, it, expect } from 'vitest';
import {
  ALL_CHAMPIONS,
  GENERIC_CHAMPION_ICON_URL,
  getChampionById,
  getChampionName,
  getChampionIconUrl,
  obtenerTodosLosCampeones,
  registrarCampeones
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
    expect(getChampionName(999999)).toBe('Campeón (999999)');
    expect(getChampionName(999999, 'Desconocido')).toBe('Desconocido (999999)');
  });

  it('debe generar URLs de iconos de DataDragon válidas', () => {
    const urlAatrox = getChampionIconUrl(266, '14.20.1');
    expect(urlAatrox).toContain('https://ddragon.leagueoflegends.com/cdn/14.20.1/img/champion/Aatrox.png');

    const urlByFilename = getChampionIconUrl('Ahri.png', '14.20.1');
    expect(urlByFilename).toContain('Ahri.png');
  });

  it('REQ-013: registra dinámicamente campeones nuevos como Yunara (ID 804)', () => {
    expect(getChampionById(804)).toBeUndefined();

    const nuevos = registrarCampeones([
      {
        id: 804,
        name: 'Yunara',
        key: 'Yunara',
        image: 'Yunara.png',
        iconUrl:
          'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/804.png',
      },
    ]);

    expect(nuevos).toBe(1);
    expect(getChampionById(804)).toMatchObject({ id: 804, name: 'Yunara' });
    expect(getChampionName(804)).toBe('Yunara');
    // El icono dinámico tiene prioridad sobre la URL estática de Data Dragon.
    expect(getChampionIconUrl(804)).toContain('champion-icons/804.png');
    expect(getChampionIconUrl('Yunara.png')).toContain('champion-icons/804.png');
  });

  it('REQ-013: ignora entradas inválidas y no altera el catálogo', () => {
    const antes = ALL_CHAMPIONS.length;

    const nuevos = registrarCampeones([
      { id: 0, name: 'Inválido', key: 'X', image: 'X.png' },
      { id: 9904, name: '   ', key: 'X', image: 'X.png' },
      null as never,
      undefined as never,
    ]);

    expect(nuevos).toBe(0);
    expect(ALL_CHAMPIONS).toHaveLength(antes);
    expect(getChampionById(9904)).toBeUndefined();
  });

  it('REQ-013: devuelve un icono genérico para IDs desconocidos (sin Aatrox)', () => {
    expect(getChampionIconUrl(999998)).toBe(GENERIC_CHAMPION_ICON_URL);
    expect(getChampionIconUrl(999998)).not.toContain('Aatrox');
    expect(GENERIC_CHAMPION_ICON_URL.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('REQ-013: obtenerTodosLosCampeones devuelve una copia ordenada con los registros dinámicos', () => {
    registrarCampeones([
      { id: 9901, name: 'Zz Campeón de Prueba', key: 'ZzTest', image: 'ZzTest.png' },
    ]);

    const catalogo = obtenerTodosLosCampeones();
    const nombres = catalogo.map((campeon) => campeon.name);
    expect(nombres).toContain('Zz Campeón de Prueba');
    expect([...nombres].sort((a, b) => a.localeCompare(b, 'es'))).toEqual(nombres);

    // Es una copia: mutarla no afecta al catálogo real.
    catalogo.pop();
    expect(ALL_CHAMPIONS.some((campeon) => campeon.id === 9901)).toBe(true);
  });

  it('REQ-013: fusiona actualizaciones de campeones ya registrados sin perder datos', () => {
    registrarCampeones([
      { id: 9902, name: 'Campeón Inicial', key: 'Inicial', image: 'Inicial.png' },
    ]);

    const nuevos = registrarCampeones([
      { id: 9902, name: 'Campeón Actualizado', key: 'Inicial', image: 'Inicial.png' },
    ]);

    expect(nuevos).toBe(0);
    expect(getChampionById(9902)?.name).toBe('Campeón Actualizado');
    expect(ALL_CHAMPIONS.filter((campeon) => campeon.id === 9902)).toHaveLength(1);
  });
});
