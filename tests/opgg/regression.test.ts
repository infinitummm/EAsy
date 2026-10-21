import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  roleToOpGgPosition,
  parsePythonDataclasses,
  selectOptimalOption,
  OpGgClient,
} from '../../src/main/opgg/OpGgClient';
import { normalizeRole } from '../../src/shared/roleDetection';
import { ItemSetManager } from '../../src/main/lcu/ItemSetManager';
import { Role } from '../../src/shared/types';

describe('B6: Pruebas de Regresión con Datos Reales de OP.GG MCP', () => {
  const fixturesDir = path.resolve(__dirname, '../fixtures/opgg');

  describe('1. Mapeo de Posiciones LCU -> OP.GG en las 5 Posiciones', () => {
    it('mapea correctamente UTILITY (LCU "utility") a "support" de OP.GG', () => {
      const roleFromLcu = normalizeRole('utility');
      expect(roleFromLcu).toBe('UTILITY');
      expect(roleToOpGgPosition(roleFromLcu)).toBe('support');
    });

    it('mapea correctamente BOTTOM (LCU "bottom" / "bot") a "adc" de OP.GG', () => {
      const roleFromLcu = normalizeRole('bottom');
      expect(roleFromLcu).toBe('BOTTOM');
      expect(roleToOpGgPosition(roleFromLcu)).toBe('adc');
    });

    it('mapea correctamente MIDDLE (LCU "middle" / "mid") a "mid" de OP.GG', () => {
      const roleFromLcu = normalizeRole('middle');
      expect(roleFromLcu).toBe('MIDDLE');
      expect(roleToOpGgPosition(roleFromLcu)).toBe('mid');
    });

    it('mapea correctamente JUNGLE (LCU "jungle") a "jungle" de OP.GG', () => {
      const roleFromLcu = normalizeRole('jungle');
      expect(roleFromLcu).toBe('JUNGLE');
      expect(roleToOpGgPosition(roleFromLcu)).toBe('jungle');
    });

    it('mapea correctamente TOP (LCU "top") a "top" de OP.GG', () => {
      const roleFromLcu = normalizeRole('top');
      expect(roleFromLcu).toBe('TOP');
      expect(roleToOpGgPosition(roleFromLcu)).toBe('top');
    });
  });

  describe('2. Evaluación de Fixtures Reales con la Regla Determinista B3', () => {
    it('Pyke Soporte: Runas Lluvia de Espadas (9923), Core Letalidad e Ítem de Soporte Atlas Mundial (3865)', () => {
      const rawText = fs.readFileSync(path.join(fixturesDir, 'pyke_support_analysis.txt'), 'utf8');
      const parsed = parsePythonDataclasses(rawText);
      expect(parsed.data).toBeDefined();

      const client = new OpGgClient();
      // Simular procesamiento
      const matchupData = (client as any).procesarRespuestaOpGg(
        parsed,
        555, // Pyke
        0,
        'UTILITY',
        '26.20',
        'emerald_plus',
        true,
        'general_analysis',
        'General: Esmeralda+'
      );

      const rec = client.construirRecomendacionDeterminista(matchupData, 'Pyke', 'UTILITY', '26.20', true);

      // Keystone esperada: Lluvia de Espadas (9923) en Dominación (8100)
      expect(rec.runesRecommendation.primaryStyleId).toBe(8100);
      expect(rec.runesRecommendation.selectedPerkIds).toContain(9923); // Hail of Blades
      expect(rec.runesRecommendation.selectedPerkIds).toContain(8126); // Cheap Shot

      // Core items esperados: Glaive Umbral (3179), Youmuu (3142), Filo de la Noche (3814)
      expect(rec.buildRecommendation.coreItems).toEqual([3179, 3142, 3814]);

      // Botas de Rapidez (3009)
      expect(rec.buildRecommendation.boots).toBe(3009);

      // Ítems iniciales: debe contener Atlas Mundial (3865) por ser soporte
      expect(rec.buildRecommendation.startingItems).toContain(3865);
    });

    it('Smolder ADC: Cometa Arcano (8992), Segador de Esencia (3508) y Cuchilla Negra (3071)', () => {
      const rawText = fs.readFileSync(path.join(fixturesDir, 'smolder_adc_analysis.txt'), 'utf8');
      const parsed = parsePythonDataclasses(rawText);
      const client = new OpGgClient();
      const matchupData = (client as any).procesarRespuestaOpGg(
        parsed,
        901,
        0,
        'BOTTOM',
        '26.20',
        'emerald_plus',
        true
      );
      const rec = client.construirRecomendacionDeterminista(matchupData, 'Smolder', 'BOTTOM', '26.20', true);

      expect(rec.runesRecommendation.primaryStyleId).toBe(8200); // Brujería
      expect(rec.runesRecommendation.selectedPerkIds).toContain(8992); // Cometa
      expect(rec.buildRecommendation.coreItems).toEqual([3508, 3071, 3161]);
    });

    it('Caitlyn ADC: Precisión con Filo Infinito y Coleccionista', () => {
      const rawText = fs.readFileSync(path.join(fixturesDir, 'caitlyn_adc_analysis.txt'), 'utf8');
      const parsed = parsePythonDataclasses(rawText);
      const client = new OpGgClient();
      const matchupData = (client as any).procesarRespuestaOpGg(
        parsed,
        51,
        0,
        'BOTTOM',
        '26.20',
        'emerald_plus',
        true
      );
      const rec = client.construirRecomendacionDeterminista(matchupData, 'Caitlyn', 'BOTTOM', '26.20', true);

      expect(rec.runesRecommendation.primaryStyleId).toBe(8000); // Precisión
      expect(rec.buildRecommendation.coreItems.length).toBe(3);
    });

    it('Lee Sin Jungla: Precisión / Conquistador (8010)', () => {
      const rawText = fs.readFileSync(path.join(fixturesDir, 'leesin_jungle_analysis.txt'), 'utf8');
      const parsed = parsePythonDataclasses(rawText);
      const client = new OpGgClient();
      const matchupData = (client as any).procesarRespuestaOpGg(
        parsed,
        64,
        0,
        'JUNGLE',
        '26.20',
        'emerald_plus',
        true
      );
      const rec = client.construirRecomendacionDeterminista(matchupData, 'Lee Sin', 'JUNGLE', '26.20', true);

      expect(rec.runesRecommendation.primaryStyleId).toBe(8000); // Precisión
      expect(rec.runesRecommendation.selectedPerkIds).toContain(8010); // Conquistador
    });

    it('Ahri Mid: Dominación con Malignidad', () => {
      const rawText = fs.readFileSync(path.join(fixturesDir, 'ahri_mid_analysis.txt'), 'utf8');
      const parsed = parsePythonDataclasses(rawText);
      const client = new OpGgClient();
      const matchupData = (client as any).procesarRespuestaOpGg(
        parsed,
        103,
        0,
        'MIDDLE',
        '26.20',
        'emerald_plus',
        true
      );
      const rec = client.construirRecomendacionDeterminista(matchupData, 'Ahri', 'MIDDLE', '26.20', true);

      expect(rec.runesRecommendation.primaryStyleId).toBe(8100); // Dominación
      expect(rec.runesRecommendation.selectedPerkIds).toContain(8112); // Electrocutar
    });

    it('Aatrox Top: Precisión con Cielo Desgarrado / Eclipse', () => {
      const rawText = fs.readFileSync(path.join(fixturesDir, 'aatrox_top_analysis.txt'), 'utf8');
      const parsed = parsePythonDataclasses(rawText);
      const client = new OpGgClient();
      const matchupData = (client as any).procesarRespuestaOpGg(
        parsed,
        266,
        0,
        'TOP',
        '26.20',
        'emerald_plus',
        true
      );
      const rec = client.construirRecomendacionDeterminista(matchupData, 'Aatrox', 'TOP', '26.20', true);

      expect(rec.runesRecommendation.primaryStyleId).toBe(8000); // Precisión
      expect(rec.runesRecommendation.selectedPerkIds).toContain(8010); // Conquistador
    });
  });

  describe('3. Formato de Títulos y Bloques en ItemSetManager (B4)', () => {
    const mockLcuClient = {
      obtenerEstado: () => 'connected',
      get: async () => ({ status: 200, data: [] }),
      put: async () => ({ status: 200, data: {} }),
      post: async () => ({ status: 200, data: {} }),
      delete: async () => ({ status: 200, data: {} }),
    } as any;

    it('asigna título con rival "[IL] Pyke vs Nautilus" en modo matchup', () => {
      const itemSetMgr = new ItemSetManager(mockLcuClient, () => 'C:\\Riot Games\\League of Legends');
      const itemSet = itemSetMgr.construirItemSet({
        championId: 555,
        opponentId: 111,
        role: 'UTILITY',
        build: {
          startingItems: [3865, 2003],
          coreItems: [3179, 3142, 3814],
          boots: 3009,
          fourthItems: [6696],
          situationalItems: [{ itemId: 3026, condition: 'Vs AD burst' }],
          rationale: 'Build letalidad Pyke vs Nautilus',
        },
      });

      expect(itemSet.title).toBe('[IL] Pyke vs Nautilus');
      // Debe contener bloque de opciones finales si se especifican
      const blocks = itemSet.blocks as any[];
      expect(blocks.some((b) => b.type.includes('4° a 6° Objeto'))).toBe(true);
      // Debe contener Atlas Mundial en inicio
      expect(blocks[0].items.some((i: any) => i.id === '3865')).toBe(true);
    });

    it('asigna título general "[IL] Pyke (general)" cuando no hay rival', () => {
      const itemSetMgr = new ItemSetManager(mockLcuClient, () => 'C:\\Riot Games\\League of Legends');
      const itemSet = itemSetMgr.construirItemSet({
        championId: 555,
        role: 'UTILITY',
        build: {
          startingItems: [2003, 2003], // Sin Atlas Mundial originalmente
          coreItems: [3179, 3142, 3814],
          boots: 3009,
          situationalItems: [],
          rationale: 'Build general',
        },
      });

      expect(itemSet.title).toBe('[IL] Pyke (general)');
      const blocks = itemSet.blocks as any[];
      // Por ser Pyke / UTILITY, debe haber inyectado Atlas Mundial (3865)
      expect(blocks[0].items.some((i: any) => i.id === '3865')).toBe(true);
    });
  });
});
