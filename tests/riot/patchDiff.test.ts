/**
 * Pruebas unitarias de `PatchDiffService` (REQ-014, Capa 1).
 *
 * Se simula el CDN de Data Dragon con un `fetch` stub para verificar:
 *  - la resolución automática del parche anterior desde `versions.json`,
 *  - la clasificación de ítems/runas eliminados, modificados y añadidos,
 *  - la detección de campeones nuevos,
 *  - la validación de nombres contra elementos eliminados,
 *  - los errores tipados cuando no hay parche anterior.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PatchDiffService,
  type PatchDiffSummary,
} from '../../src/main/riot/PatchDiffService';
import { DataDragonService, ErrorDataDragon } from '../../src/main/riot/DataDragonService';

// ==========================================
// CDN simulado
// ==========================================

const BASE = 'https://cdn.prueba/';
const VERSIONES = ['15.9.2', '15.9.1', '15.8.4'];
const PARCHE_ACTUAL = '15.9.2';
const PARCHE_ANTERIOR = '15.9.1';

function crearItem(
  id: string,
  name: string,
  description: string,
  total: number,
  tags: string[]
): Record<string, unknown> {
  return { id, name, description, gold: { total }, tags, image: { full: `${id}.png` } };
}

function crearCampeon(key: string, name: string): Record<string, unknown> {
  return {
    id: name.replace(/\s+/g, ''),
    key,
    name,
    title: 'el de prueba',
    tags: ['Fighter'],
    image: { full: `${name}.png` },
  };
}

const ITEMS_PREVIOS = {
  data: {
    '3153': crearItem('3153', 'Filo de la Ruina', '<mainText>Robo de vida</mainText>', 3200, ['Damage']),
    '3111': crearItem('3111', 'Botas de mercurio', 'Resistencia mágica', 1100, ['Boots']),
    '3124': crearItem('3124', 'Cañón de fuego rápido', '<mainText>Velocidad de ataque</mainText>', 2500, [
      'AttackSpeed',
    ]),
    '3031': crearItem('3031', 'Cosechador', 'Daño crítico', 3400, ['Damage', 'CriticalStrike']),
  },
} as const;

const ITEMS_ACTUALES = {
  data: {
    // Precio reducido: modificado.
    '3153': crearItem('3153', 'Filo de la Ruina', '<mainText>Robo de vida</mainText>', 3000, ['Damage']),
    // Renombrado: modificado.
    '3111': crearItem('3111', 'Botas veloces', 'Resistencia mágica', 1100, ['Boots']),
    // Descripción cambiada: modificado.
    '3124': crearItem('3124', 'Cañón de fuego rápido', '<mainText>Velocidad de ataque total</mainText>', 2500, [
      'AttackSpeed',
    ]),
    // Ítem que no existía: añadido.
    '7000': crearItem('7000', 'Filo experimental', '<mainText>Daño experimental</mainText>', 3600, ['Damage']),
  },
} as const;

/** Solo conserva el ítem 3031: sirve como tercer parche con contenido distinto. */
const ITEMS_PARCHE_LEJANO = {
  data: {
    '3031': crearItem('3031', 'Cosechador', 'Daño crítico', 3400, ['Damage', 'CriticalStrike']),
  },
} as const;

function crearRunas(cambios: {
  nombreTempoLetal: string;
  incluyeElectrocutar: boolean;
  incluyeCazadorVoraz: boolean;
}): unknown[] {
  const precision = {
    id: 8000,
    key: 'Precision',
    name: 'Precisión',
    icon: 'perk-images/Styles/7201_Precision.png',
    slots: [
      {
        runes: [
          {
            id: 8005,
            key: 'PressTheAttack',
            name: 'Ataque intensificado',
            icon: 'perk-images/8005.png',
          },
          { id: 8008, key: 'LethalTempo', name: cambios.nombreTempoLetal, icon: 'perk-images/8008.png' },
        ],
      },
    ],
  };

  const dominacionRunas = [
    { id: 8135, key: 'ZombieWard', name: 'Ojo zombi', icon: 'perk-images/8135.png' },
  ];
  if (cambios.incluyeElectrocutar) {
    dominacionRunas.unshift({
      id: 8112,
      key: 'Electrocute',
      name: 'Electrocutar',
      icon: 'perk-images/8112.png',
    });
  }
  if (cambios.incluyeCazadorVoraz) {
    dominacionRunas.push({
      id: 8124,
      key: 'RavenousHunter',
      name: 'Cazador voraz',
      icon: 'perk-images/8124.png',
    });
  }

  const dominacion = {
    id: 8100,
    key: 'Domination',
    name: 'Dominación',
    icon: 'perk-images/Styles/8100_Domination.png',
    slots: [{ runes: dominacionRunas }],
  };

  return [precision, dominacion];
}

const RUNAS_PREVIAS = crearRunas({
  nombreTempoLetal: 'Tempo letal',
  incluyeElectrocutar: true,
  incluyeCazadorVoraz: false,
});

const RUNAS_ACTUALES = crearRunas({
  nombreTempoLetal: 'Tempo letal supremo',
  incluyeElectrocutar: false,
  incluyeCazadorVoraz: true,
});

const CAMPEONES_PREVIOS = { data: { Aatrox: crearCampeon('266', 'Aatrox'), Yasuo: crearCampeon('157', 'Yasuo') } };
const CAMPEONES_ACTUALES = {
  data: {
    Aatrox: crearCampeon('266', 'Aatrox'),
    Yasuo: crearCampeon('157', 'Yasuo'),
    Yunara: crearCampeon('804', 'Yunara'),
  },
};

let recursos: Record<string, unknown>;
let consultas: string[];

function crearDataDragon(): DataDragonService {
  const fetchImpl = (async (entrada: RequestInfo | URL) => {
    const url = String(entrada);
    consultas.push(url);
    const clave = url.startsWith(BASE) ? url.slice(BASE.length) : url;
    const recurso = recursos[clave];
    if (recurso === undefined) {
      return new Response('Not Found', { status: 404 });
    }
    return new Response(JSON.stringify(recurso), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  return new DataDragonService({
    urlVersiones: `${BASE}versions.json`,
    cdnBase: `${BASE}cdn`,
    fetchImpl,
  });
}

function contarConsulta(fragmento: string): number {
  return consultas.filter((url) => url.includes(fragmento)).length;
}

// ==========================================
// Suite
// ==========================================

describe('PatchDiffService (REQ-014)', () => {
  let servicio: PatchDiffService;

  beforeEach(() => {
    consultas = [];
    recursos = {
      'versions.json': [...VERSIONES],
      'cdn/15.9.2/data/es_ES/item.json': ITEMS_ACTUALES,
      'cdn/15.9.2/data/es_ES/runesReforged.json': RUNAS_ACTUALES,
      'cdn/15.9.2/data/es_ES/champion.json': CAMPEONES_ACTUALES,
      'cdn/15.9.1/data/es_ES/item.json': ITEMS_PREVIOS,
      'cdn/15.9.1/data/es_ES/runesReforged.json': RUNAS_PREVIAS,
      'cdn/15.9.1/data/es_ES/champion.json': CAMPEONES_PREVIOS,
      'cdn/15.8.4/data/es_ES/item.json': ITEMS_PARCHE_LEJANO,
      'cdn/15.8.4/data/es_ES/runesReforged.json': [],
      'cdn/15.8.4/data/es_ES/champion.json': { data: {} },
    };
    servicio = new PatchDiffService(crearDataDragon());
  });

  describe('compararParches', () => {
    it('resuelve el parche anterior desde versions.json y cachea la lista', async () => {
      const resumen = await servicio.compararParches(PARCHE_ACTUAL);

      expect(resumen.currentPatch).toBe(PARCHE_ACTUAL);
      expect(resumen.previousPatch).toBe(PARCHE_ANTERIOR);

      await servicio.compararParches(PARCHE_ACTUAL);
      expect(contarConsulta('versions.json')).toBe(1);
    });

    it('respeta el parche anterior indicado sin consultar versions.json', async () => {
      const resumen = await servicio.compararParches(PARCHE_ACTUAL, '15.8.4');

      expect(resumen.previousPatch).toBe('15.8.4');
      // El parche lejano no contiene campeones, así que todos figuran como nuevos.
      expect(resumen.newChampions).toEqual(['Aatrox', 'Yasuo', 'Yunara']);
      expect(contarConsulta('versions.json')).toBe(0);
    });

    it('clasifica los ítems eliminados, modificados y añadidos', async () => {
      const resumen = await servicio.compararParches(PARCHE_ACTUAL);

      expect(resumen.removedItems).toEqual([{ id: 3031, name: 'Cosechador', changeType: 'removed' }]);
      expect(resumen.changedItems).toEqual([
        {
          id: 3111,
          name: 'Botas veloces',
          changeType: 'modified',
          changes: ['Nombre: "Botas de mercurio" → "Botas veloces"'],
        },
        {
          id: 3124,
          name: 'Cañón de fuego rápido',
          changeType: 'modified',
          changes: ['Descripción modificada'],
        },
        {
          id: 3153,
          name: 'Filo de la Ruina',
          changeType: 'modified',
          changes: ['Precio: 3200 → 3000'],
        },
        { id: 7000, name: 'Filo experimental', changeType: 'added' },
      ]);
    });

    it('clasifica las runas eliminadas, modificadas y añadidas', async () => {
      const resumen = await servicio.compararParches(PARCHE_ACTUAL);

      expect(resumen.removedRunes).toEqual([{ id: 8112, name: 'Electrocutar', changeType: 'removed' }]);
      expect(resumen.changedRunes).toEqual([
        { id: 8008, name: 'Tempo letal supremo', changeType: 'modified' },
        { id: 8124, name: 'Cazador voraz', changeType: 'added' },
      ]);
    });

    it('detecta los campeones nuevos del parche actual', async () => {
      const resumen = await servicio.compararParches(PARCHE_ACTUAL);

      expect(resumen.newChampions).toEqual(['Yunara']);
    });

    it('devuelve un resumen vacío cuando no hay diferencias', async () => {
      const resumen = await servicio.compararParches(PARCHE_ANTERIOR, PARCHE_ANTERIOR);

      expect(resumen.removedItems).toEqual([]);
      expect(resumen.changedItems).toEqual([]);
      expect(resumen.removedRunes).toEqual([]);
      expect(resumen.changedRunes).toEqual([]);
      expect(resumen.newChampions).toEqual([]);
    });

    it('rechaza un parcheActual vacío', async () => {
      await expect(servicio.compararParches('  ')).rejects.toThrow(ErrorDataDragon);
    });

    it('rechaza un parcheActual que no figura en versions.json', async () => {
      await expect(servicio.compararParches('15.7.0')).rejects.toThrow(
        /no figura en versions\.json/
      );
    });

    it('rechaza el parche más antiguo de la lista (no tiene anterior)', async () => {
      await expect(servicio.compararParches('15.8.4')).rejects.toThrow(
        /No existe un parche anterior/
      );
    });
  });

  describe('validarSinElementosEliminados', () => {
    it('marca ítems y runas eliminados ignorando mayúsculas y espacios', async () => {
      const diff: PatchDiffSummary = await servicio.compararParches(PARCHE_ACTUAL);

      const resultado = servicio.validarSinElementosEliminados(
        [' Cosechador ', 'Filo de la Ruina'],
        ['electrocutar'],
        diff
      );

      expect(resultado).toEqual({
        valido: false,
        itemsInvalidos: [' Cosechador '],
        runasInvalidas: ['electrocutar'],
      });
    });

    it('permite los elementos modificados, añadidos o ajenos al diff', async () => {
      const diff = await servicio.compararParches(PARCHE_ACTUAL);

      const resultado = servicio.validarSinElementosEliminados(
        ['Filo de la Ruina', 'Botas veloces', 'Filo experimental'],
        ['Cazador voraz', 'Ataque intensificado'],
        diff
      );

      expect(resultado).toEqual({ valido: true, itemsInvalidos: [], runasInvalidas: [] });
    });

    it('devuelve válido con listas de nombres vacías', async () => {
      const diff = await servicio.compararParches(PARCHE_ACTUAL);

      expect(servicio.validarSinElementosEliminados([], [], diff)).toEqual({
        valido: true,
        itemsInvalidos: [],
        runasInvalidas: [],
      });
    });
  });

  describe('DataDragonService.obtenerVersiones (soporte REQ-014)', () => {
    it('cachea la lista de versiones en memoria', async () => {
      const dataDragon = crearDataDragon();

      await expect(dataDragon.obtenerVersiones()).resolves.toEqual(VERSIONES);
      await expect(dataDragon.obtenerVersiones()).resolves.toEqual(VERSIONES);
      expect(contarConsulta('versions.json')).toBe(1);
    });

    it('rechaza una lista de versiones inválida', async () => {
      recursos['versions.json'] = { version: PARCHE_ACTUAL };
      const dataDragon = crearDataDragon();

      await expect(dataDragon.obtenerVersiones()).rejects.toThrow(ErrorDataDragon);
    });
  });
});
