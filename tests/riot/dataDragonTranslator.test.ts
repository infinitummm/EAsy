import { describe, it, expect, beforeEach } from 'vitest';
import { DataDragonTranslator } from '../../src/main/riot/DataDragonTranslator';
import { DataDragonService } from '../../src/main/riot/DataDragonService';

describe('DataDragonTranslator - Traducción y Validación de Nombres', () => {
  let translator: DataDragonTranslator;

  beforeEach(async () => {
    const mockService = {
      obtenerVersionActual: async () => '16.20.1',
      obtenerArbolesDeRunas: async () => [
        {
          id: 8000,
          key: 'Precision',
          name: 'Precisión',
          icon: '',
          slots: [
            { runes: [{ id: 8008, key: 'LethalTempo', name: 'Compás letal', icon: '' }, { id: 8021, key: 'FleetFootwork', name: 'Pies veloces', icon: '' }] },
            { runes: [{ id: 9101, key: 'PresenceOfMind', name: 'Claridad mental', icon: '' }] },
            { runes: [{ id: 9103, key: 'LegendBloodline', name: 'Leyenda: Linaje', icon: '' }] },
            { runes: [{ id: 8014, key: 'CoupDeGrace', name: 'Golpe de gracia', icon: '' }] },
          ]
        },
        {
          id: 8300,
          key: 'Inspiration',
          name: 'Inspiración',
          icon: '',
          slots: [
            { runes: [{ id: 8369, key: 'FirstStrike', name: 'Primer golpe', icon: '' }] },
            { runes: [{ id: 8304, key: 'MagicalFootwear', name: 'Calzado mágico', icon: '' }] },
            { runes: [{ id: 8345, key: 'BiscuitDelivery', name: 'Entrega de galletas', icon: '' }] },
            { runes: [{ id: 8347, key: 'CosmicInsight', name: 'Perspicacia cósmica', icon: '' }] },
          ]
        }
      ],
      obtenerItems: async () => [
        { id: '1055', name: 'Espada de Doran', description: '', gold: { total: 450 }, tags: [], image: { full: '' }, maps: { '11': true }, inStore: true },
        { id: '2003', name: 'Poción de vida', description: '', gold: { total: 50 }, tags: [], image: { full: '' }, maps: { '11': true }, inStore: true },
        { id: '3006', name: 'Grebas de Berserker', description: '', gold: { total: 1100 }, tags: [], image: { full: '' }, maps: { '11': true }, inStore: true },
        { id: '6676', name: 'El Coleccionista', description: '', gold: { total: 3200 }, tags: [], image: { full: '' }, maps: { '11': true }, inStore: true },
        { id: '3031', name: 'Filo Infinito', description: '', gold: { total: 3400 }, tags: [], image: { full: '' }, maps: { '11': true }, inStore: true },
      ]
    } as unknown as DataDragonService;

    translator = new DataDragonTranslator(mockService);
    await translator.initialize('16.20.1');
  });

  it('normaliza cadenas removiendo acentos, espacios y mayúsculas', () => {
    expect(translator.normalize('Compás Letal')).toBe('compasletal');
    expect(translator.normalize('El Coleccionista')).toBe('elcoleccionista');
    expect(translator.normalize("Doran's Blade")).toBe('doransblade');
  });

  it('resuelve fragmentos de estadística de Season 14 sin IDs obsoletos', () => {
    const slot0 = translator.resolveStatShard(0, 'Fuerza Adaptable');
    const slot1 = translator.resolveStatShard(1, 'Velocidad de Movimiento');
    const slot2 = translator.resolveStatShard(2, 'Vida Plana');

    expect(slot0).toBe(5008);
    expect(slot1).toBe(5010);
    expect(slot2).toBe(5011);
  });

  it('traduce una recomendación cruda con nombres a IDs numéricos válidos', () => {
    const raw = {
      championId: 51,
      opponentChampionId: 901,
      assignedRole: 'BOTTOM' as const,
      difficultyRating: 2,
      matchupSummary: 'Matchup favorable',
      runesRecommendation: {
        primaryStyleName: 'Precisión',
        subStyleName: 'Inspiración',
        keystoneName: 'Pies veloces',
        primaryRunes: ['Claridad mental', 'Leyenda: Linaje', 'Golpe de gracia'],
        secondaryRunes: ['Calzado mágico', 'Entrega de galletas'],
        statShards: ['Fuerza adaptable', 'Fuerza adaptable', 'Vida plana'],
        rationale: 'Buena movilidad y regeneración'
      },
      buildRecommendation: {
        startingItems: ['Espada de Doran', 'Poción de vida'],
        boots: 'Grebas de Berserker',
        coreItems: ['El Coleccionista', 'Filo Infinito'],
        situationalItems: [{ itemName: 'Recuerdos de Lord Dominik', condition: 'Vs tanques' }],
        rationale: 'Daño crítico'
      },
      skillOrder: {
        priority: ['Q', 'W', 'E', 'R'],
        firstThreeLevels: ['Q', 'W', 'E'],
        rationale: 'Max Q'
      },
      earlyGameStrategy: {
        waveManagement: 'Slow push',
        tradingPlan: 'Poke',
        levelSpikes: ['Nivel 2']
      },
      threatAnalysis: {
        enemyThreats: ['Ganks'],
        winCondition: 'Farm'
      }
    };

    const res = translator.translateAndValidate(raw);
    expect(res.valid).toBe(true);
    expect(res.recommendation).toBeDefined();

    const rec = res.recommendation!;
    expect(rec.runesRecommendation.primaryStyleId).toBe(8000);
    expect(rec.runesRecommendation.subStyleId).toBe(8300);
    expect(rec.runesRecommendation.selectedPerkIds).toHaveLength(9);
    expect(rec.runesRecommendation.selectedPerkIds[0]).toBe(8021); // Pies veloces
    expect(rec.runesRecommendation.selectedPerkIds[1]).toBe(9101); // Claridad mental
    expect(rec.runesRecommendation.selectedPerkIds[6]).toBe(5008); // Stat shard 1
    expect(rec.runesRecommendation.selectedPerkIds[7]).toBe(5008); // Stat shard 2
    expect(rec.runesRecommendation.selectedPerkIds[8]).toBe(5011); // Stat shard 3

    expect(rec.buildRecommendation.startingItems).toContain(1055);
    expect(rec.buildRecommendation.startingItems).toContain(2003);
    expect(rec.buildRecommendation.coreItems).toContain(6676); // Coleccionista
    expect(rec.buildRecommendation.coreItems).toContain(3031); // Filo Infinito
  });
});
