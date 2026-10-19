import { describe, it, expect } from 'vitest';
import { PersonalizedAdvisor } from '../../src/main/ai/PersonalizedAdvisor';
import { ChampionMasteryDto, ParsedMatchSummary } from '../../src/shared/types';

describe('PersonalizedAdvisor (T-6.3)', () => {
  const mockMasteries: ChampionMasteryDto[] = [
    {
      puuid: 'test-puuid',
      championId: 266, // Aatrox
      championLevel: 7,
      championPoints: 120000,
      lastPlayTime: Date.now(),
      championPointsSinceLastLevel: 0,
      championPointsUntilNextLevel: 0,
      chestGranted: true,
      tokensEarned: 3
    },
    {
      puuid: 'test-puuid',
      championId: 24, // Jax
      championLevel: 5,
      championPoints: 45000,
      lastPlayTime: Date.now(),
      championPointsSinceLastLevel: 0,
      championPointsUntilNextLevel: 0,
      chestGranted: false,
      tokensEarned: 1
    }
  ];

  const mockMatches: ParsedMatchSummary[] = [
    {
      matchId: 'LA1_1001',
      puuid: 'test-puuid',
      gameCreation: Date.now() - 3600000,
      gameDuration: 1800,
      gameVersion: '14.20.1',
      queueId: 420,
      championId: 266,
      championName: 'Aatrox',
      role: 'TOP',
      win: true,
      kills: 8,
      deaths: 2,
      assists: 6,
      kda: 7.0,
      cs: 210,
      csPerMinute: 7.0,
      goldEarned: 14000,
      damageDealt: 25000,
      items: [3078, 6631, 3053],
      primaryStyleId: 8000,
      subStyleId: 8400,
      selectedPerks: [8010, 9111, 9104, 8299, 8446, 8453, 5008, 5008, 5002]
    },
    {
      matchId: 'LA1_1002',
      puuid: 'test-puuid',
      gameCreation: Date.now() - 7200000,
      gameDuration: 1900,
      gameVersion: '14.20.1',
      queueId: 420,
      championId: 266,
      championName: 'Aatrox',
      role: 'TOP',
      win: true,
      kills: 10,
      deaths: 3,
      assists: 5,
      kda: 5.0,
      cs: 230,
      csPerMinute: 7.2,
      goldEarned: 15500,
      damageDealt: 28000,
      items: [3078, 6631, 3053],
      primaryStyleId: 8000,
      subStyleId: 8400,
      selectedPerks: [8010, 9111, 9104, 8299, 8446, 8453, 5008, 5008, 5002]
    },
    {
      matchId: 'LA1_1003',
      puuid: 'test-puuid',
      gameCreation: Date.now() - 10800000,
      gameDuration: 1700,
      gameVersion: '14.20.1',
      queueId: 420,
      championId: 24,
      championName: 'Jax',
      role: 'TOP',
      win: false,
      kills: 2,
      deaths: 6,
      assists: 3,
      kda: 0.83,
      cs: 160,
      csPerMinute: 5.6,
      goldEarned: 9000,
      damageDealt: 12000,
      items: [3078],
      primaryStyleId: 8000,
      subStyleId: 8300,
      selectedPerks: [8005, 9111, 9104, 8014, 8304, 8345, 5008, 5008, 5002]
    }
  ];

  it('calcula el rendimiento por campeón combinando maestría y partidas', () => {
    const stats = PersonalizedAdvisor.calculatePerformance(mockMasteries, mockMatches, 'TOP');
    const aatrox = stats.get(266);
    const jax = stats.get(24);

    expect(aatrox).toBeDefined();
    expect(aatrox!.totalGames).toBe(2);
    expect(aatrox!.wins).toBe(2);
    expect(aatrox!.winrate).toBe(100);
    expect(aatrox!.comfortScore).toBeGreaterThan(60);

    expect(jax).toBeDefined();
    expect(jax!.totalGames).toBe(1);
    expect(jax!.wins).toBe(0);
    expect(jax!.winrate).toBe(0);
  });

  it('genera recomendaciones priorizando campeones con alto comfort score', () => {
    const recs = PersonalizedAdvisor.getRecommendations(mockMasteries, mockMatches, 'TOP', 114);

    expect(recs.recommendedChampions.length).toBeGreaterThan(0);
    expect(recs.recommendedChampions[0].championId).toBe(266);
    expect(recs.pocketPicks).toContain(266);
    expect(recs.insights.length).toBeGreaterThan(0);
  });
});
