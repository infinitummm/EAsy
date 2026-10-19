import { describe, it, expect } from 'vitest';
import {
  normalizeRole,
  getChampionArchetypeRole,
  detectPlayerRole,
  extractLocalChampionId,
  extractPlayerChampionId,
  predictOpponentId
} from '../../src/shared/roleDetection';
import { getAccurateFallbackRecommendation } from '../../src/shared/buildDatabase';
import { ChampSelectSession, ChampSelectPlayer } from '../../src/shared/types';

describe('Detección Robusta de Rol y Campeón (roleDetection)', () => {
  it('normaliza roles en minúsculas y mayúsculas correctamente', () => {
    expect(normalizeRole('top')).toBe('TOP');
    expect(normalizeRole('TOP')).toBe('TOP');
    expect(normalizeRole('jungle')).toBe('JUNGLE');
    expect(normalizeRole('middle')).toBe('MIDDLE');
    expect(normalizeRole('mid')).toBe('MIDDLE');
    expect(normalizeRole('bottom')).toBe('BOTTOM');
    expect(normalizeRole('bot')).toBe('BOTTOM');
    expect(normalizeRole('utility')).toBe('UTILITY');
    expect(normalizeRole('support')).toBe('UTILITY');
    expect(normalizeRole('')).toBe('FILL');
    expect(normalizeRole(undefined)).toBe('FILL');
  });

  it('identifica correctamente el rol arquetípico de campeones clave', () => {
    expect(getChampionArchetypeRole(901)).toBe('BOTTOM'); // Smolder
    expect(getChampionArchetypeRole(22)).toBe('BOTTOM');  // Ashe
    expect(getChampionArchetypeRole(222)).toBe('BOTTOM'); // Jinx
    expect(getChampionArchetypeRole(103)).toBe('MIDDLE'); // Ahri
    expect(getChampionArchetypeRole(64)).toBe('JUNGLE');  // Lee Sin
    expect(getChampionArchetypeRole(412)).toBe('UTILITY'); // Thresh
    expect(getChampionArchetypeRole(266)).toBe('TOP');    // Aatrox
  });

  it('detecta rol por assignedPosition oficial si está presente', () => {
    const player: Partial<ChampSelectPlayer> = {
      cellId: 0,
      assignedPosition: 'bottom' as any,
      championId: 0
    };
    expect(detectPlayerRole(player as ChampSelectPlayer, null)).toBe('BOTTOM');
  });

  it('detecta rol JUNGLE por Hechizo de Invocador Aplastar (Smite = 11)', () => {
    const player: Partial<ChampSelectPlayer> = {
      cellId: 1,
      assignedPosition: '' as any,
      spell1Id: 11,
      spell2Id: 4,
      championId: 0
    };
    expect(detectPlayerRole(player as ChampSelectPlayer, null)).toBe('JUNGLE');
  });

  it('detecta rol por arquetipo del campeón si assignedPosition está vacío (bots/customs)', () => {
    const player: Partial<ChampSelectPlayer> = {
      cellId: 3,
      assignedPosition: '' as any,
      championId: 901 // Smolder
    };
    expect(detectPlayerRole(player as ChampSelectPlayer, null)).toBe('BOTTOM');
  });

  it('extrae el campeón local desde actions si está en fase de hover/pick', () => {
    const session: Partial<ChampSelectSession> = {
      localPlayerCellId: 3,
      myTeam: [
        { cellId: 3, championId: 0, championPickIntent: 0, assignedPosition: 'bottom' as any, spell1Id: 4, spell2Id: 7, summonerId: 1, puuid: 'test' }
      ],
      actions: [
        [
          {
            id: 1,
            actorCellId: 3,
            championId: 901, // Smolder hovered
            completed: false,
            type: 'pick',
            isAllyAction: true,
            isInProgress: true
          }
        ]
      ]
    };

    expect(extractLocalChampionId(session as ChampSelectSession)).toBe(901);
  });

  it('predice al oponente de la misma línea (ej: BOTTOM contra BOTTOM)', () => {
    const session: Partial<ChampSelectSession> = {
      localPlayerCellId: 3,
      myTeam: [
        { cellId: 3, championId: 901, championPickIntent: 0, assignedPosition: 'bottom' as any, spell1Id: 4, spell2Id: 7, summonerId: 1, puuid: 'test' }
      ],
      theirTeam: [
        { cellId: 5, championId: 266, championPickIntent: 0, assignedPosition: 'top' as any, spell1Id: 12, spell2Id: 4, summonerId: 2, puuid: 't1' },
        { cellId: 8, championId: 22, championPickIntent: 0, assignedPosition: 'bottom' as any, spell1Id: 4, spell2Id: 7, summonerId: 3, puuid: 't2' }
      ]
    };

    const oppId = predictOpponentId(
      session as ChampSelectSession,
      session.myTeam![0],
      'BOTTOM',
      901
    );

    expect(oppId).toBe(22); // Ashe en bot contra Smolder en bot
  });
});

describe('Base de Datos Táctica de Builds y Runas (buildDatabase)', () => {
  it('genera build y runas personalizadas y exactas para Smolder (901)', () => {
    const rec = getAccurateFallbackRecommendation({
      championId: 901,
      opponentId: 22,
      role: 'BOTTOM',
      patch: '14.20.1'
    });

    expect(rec.championId).toBe(901);
    expect(rec.buildRecommendation.coreItems).toContain(3508); // Segador de Esencia
    expect(rec.buildRecommendation.coreItems).toContain(3094); // Cañón de Fuego Rápido
    expect(rec.buildRecommendation.coreItems).toContain(6610); // Lanza de Shojin
    expect(rec.runesRecommendation.selectedPerkIds).toContain(8021); // Pies Veloces
    expect(rec.runesRecommendation.selectedPerkIds.length).toBe(9);
    expect(rec.matchupSummary).toContain('Ajustes');
  });

  it('genera build de tirador crítico para BOTTOM genérico sin items de bruiser', () => {
    const rec = getAccurateFallbackRecommendation({
      championId: 51, // Caitlyn
      opponentId: 22,
      role: 'BOTTOM',
      patch: '14.20.1'
    });

    expect(rec.buildRecommendation.coreItems).toContain(3031); // Filo Infinito
    expect(rec.buildRecommendation.coreItems).not.toContain(3078); // NO Fuerza de la Trinidad
    expect(rec.buildRecommendation.coreItems).not.toContain(3053); // NO Guantelete de Sterak
    expect(rec.runesRecommendation.selectedPerkIds.length).toBe(9);
  });

  it('genera build de poder de habilidad para magos en MIDDLE', () => {
    const rec = getAccurateFallbackRecommendation({
      championId: 99, // Lux
      opponentId: 103,
      role: 'MIDDLE',
      patch: '14.20.1'
    });

    expect(rec.buildRecommendation.coreItems).toContain(6657); // Antorcha de Fuego Negro
    expect(rec.buildRecommendation.coreItems).toContain(3089); // Sombrero de Rabadon
    expect(rec.runesRecommendation.selectedPerkIds.length).toBe(9);
  });
});
