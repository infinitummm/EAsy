import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LcuAccountService } from '../../src/main/lcu/LcuAccountService';
import type { ILcuClient, IDatabaseService } from '../../src/shared/contracts';

describe('LcuAccountService - Sincronización Local Directa desde LCU', () => {
  let mockLcuClient: Partial<ILcuClient>;
  let mockDbService: Partial<IDatabaseService>;
  let savedAccount: any = null;
  let savedMatches: any[] = [];

  beforeEach(() => {
    savedAccount = null;
    savedMatches = [];

    mockDbService = {
      upsertAccount: vi.fn((acc) => {
        savedAccount = acc;
      }),
      saveMatch: vi.fn((m) => {
        savedMatches.push(m);
      }),
    };
  });

  it('obtiene invocador, ranked stats, 20 partidas e inserta en SQLite sin Riot API', async () => {
    mockLcuClient = {
      request: vi.fn(async (_method: string, endpoint: string): Promise<any> => {
        if (endpoint.includes('current-summoner') && !endpoint.includes('matches')) {
          return {
            puuid: 'puuid-local-1234',
            gameName: 'Infi',
            tagLine: '1505',
            summonerId: 25772353,
            profileIconId: 6740,
            summonerLevel: 521,
          };
        }
        if (endpoint.includes('current-ranked-stats')) {
          return {
            queues: [
              {
                queueType: 'RANKED_SOLO_5x5',
                tier: 'DIAMOND',
                division: 'IV',
                leaguePoints: 55,
              },
            ],
          };
        }
        if (endpoint.includes('matches')) {
          return {
            games: {
              games: [
                {
                  gameId: 987654321,
                  gameCreation: 1729471200000,
                  gameDuration: 1800,
                  gameVersion: '14.20.1',
                  queueId: 420,
                  participantIdentities: [
                    { participantId: 1, player: { puuid: 'puuid-local-1234' } },
                  ],
                  participants: [
                    {
                      participantId: 1,
                      championId: 804,
                      stats: {
                        win: true,
                        kills: 10,
                        deaths: 2,
                        assists: 8,
                        totalMinionsKilled: 180,
                        neutralMinionsKilled: 20,
                        goldEarned: 14500,
                        totalDamageDealtToChampions: 28000,
                        item0: 3078,
                        item1: 3006,
                        perkPrimaryStyle: 8000,
                        perkSubStyle: 8200,
                        perk0: 8005,
                      },
                      timeline: {
                        lane: 'BOTTOM',
                        role: 'DUO_CARRY',
                      },
                    },
                  ],
                },
              ],
            },
          };
        }
        if (endpoint.includes('champion-mastery')) {
          return [
            {
              championId: 804,
              championLevel: 7,
              championPoints: 150000,
              lastPlayTime: 1729471200000,
            },
          ];
        }
        return null;
      }),
    };

    const res = await LcuAccountService.sincronizarCuentaLocal(
      mockLcuClient as ILcuClient,
      mockDbService as IDatabaseService
    );

    expect(res).not.toBeNull();
    expect(res?.account.gameName).toBe('Infi');
    expect(res?.account.tagLine).toBe('1505');
    expect(res?.account.tier).toBe('DIAMOND');
    expect(res?.account.rank).toBe('IV');
    expect(res?.account.leaguePoints).toBe(55);

    expect(savedAccount).not.toBeNull();
    expect(savedAccount.puuid).toBe('puuid-local-1234');

    expect(savedMatches.length).toBe(1);
    expect(savedMatches[0].championId).toBe(804);
    expect(savedMatches[0].kills).toBe(10);
    expect(savedMatches[0].kda).toBe(9); // (10 + 8) / 2 = 9
    expect(savedMatches[0].cs).toBe(200);
    expect(savedMatches[0].csPerMinute).toBe(6.7); // 200 / 30 = 6.7
    expect(savedMatches[0].role).toBe('BOTTOM');

    expect(res?.masteries.length).toBe(1);
    expect(res?.masteries[0].championId).toBe(804);
    expect(res?.masteries[0].championPoints).toBe(150000);
  });
});
