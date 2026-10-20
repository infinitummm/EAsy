import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpGgClient, formatChampionForOpGg } from '../../src/main/opgg/OpGgClient';
import type { IDatabaseService } from '../../src/shared/contracts';

describe('OpGgClient - Integración MCP oficial de OP.GG', () => {
  describe('formatChampionForOpGg', () => {
    it('formatea nombres estándar y complejos al formato UPPER_SNAKE_CASE requerido', () => {
      expect(formatChampionForOpGg('Smolder')).toBe('SMOLDER');
      expect(formatChampionForOpGg('Caitlyn')).toBe('CAITLYN');
      expect(formatChampionForOpGg("K'Sante")).toBe('KSANTE');
      expect(formatChampionForOpGg("Cho'Gath")).toBe('CHOGATH');
      expect(formatChampionForOpGg("Kai'Sa")).toBe('KAISA');
      expect(formatChampionForOpGg('Dr. Mundo')).toBe('DR_MUNDO');
      expect(formatChampionForOpGg('Lee Sin')).toBe('LEE_SIN');
      expect(formatChampionForOpGg('Wukong')).toBe('WUKONG');
      expect(formatChampionForOpGg('MonkeyKing')).toBe('WUKONG');
      expect(formatChampionForOpGg('Nunu & Willump')).toBe('NUNU_WILLUMP');
      expect(formatChampionForOpGg('Renata Glasc')).toBe('RENATA_GLASC');
    });
  });

  describe('construirClaveCache', () => {
    it('genera la clave acordada con elo y parche', () => {
      const client = new OpGgClient();
      const clave = client.construirClaveCache(901, 'BOTTOM', 51, 'emerald_plus', '26.20.1');
      expect(clave).toBe('opgg:901:adc:51:emerald_plus:26.20');
    });

    it('utiliza "none" si el rival es indefinido', () => {
      const client = new OpGgClient();
      const clave = client.construirClaveCache(901, 'BOTTOM', undefined, 'diamond_plus', '26.20');
      expect(clave).toBe('opgg:901:adc:none:diamond_plus:26.20');
    });
  });

  describe('getLaneMatchupGuide', () => {
    let mockDb: IDatabaseService;
    let mockFetch: ReturnType<typeof vi.fn>;

    const mockOpGgResponse = {
      lang: 'en_US',
      position: 'adc',
      my_champion: 'SMOLDER',
      opponent_champion: 'CAITLYN',
      data: {
        summary: {
          id: 901,
          average_stats: { play: 150000, win_rate: 0.49 },
          positions: [
            {
              name: 'BOTTOM',
              stats: { play: 120000, win_rate: 0.49 },
              counters: [{ champion_id: 30, champion_name: 'Karthus', play: 200, win: 90 }],
            },
          ],
        },
        runes: [
          {
            id: 8992,
            primary_page_id: 8200,
            primary_page_name: 'Sorcery',
            primary_rune_ids: [8992, 8275, 8234, 8236],
            secondary_page_id: 8300,
            secondary_page_name: 'Inspiration',
            secondary_rune_ids: [8304, 8316],
            stat_mod_ids: [5008, 5010, 5001],
            play: 4367,
            win: 2245,
            pick_rate: 0.4592,
          },
        ],
        core_items: [
          {
            ids: [3508, 3071, 3161],
            ids_names: ['Essence Reaver', 'Black Cleaver', 'Spear of Shojin'],
            play: 1511,
            win: 807,
            pick_rate: 0.2168,
          },
        ],
        starter_items: [
          {
            ids: [1055, 2003],
            ids_names: ["Doran's Blade", 'Health Potion'],
            play: 5548,
            win: 2847,
            pick_rate: 0.60,
          },
        ],
        boots: [
          {
            ids: [3008],
            ids_names: ['Gluttonous Greaves'],
            play: 3861,
            win: 2048,
            pick_rate: 0.44,
          },
        ],
        summoner_spells: [
          {
            ids: [4, 21],
            ids_names: ['Flash', 'Barrier'],
            play: 8261,
            win: 4196,
            pick_rate: 0.88,
          },
        ],
        skills: [{ order: ['Q', 'W', 'E', 'Q', 'Q', 'R'], play: 3000, win: 1500, pick_rate: 0.7 }],
        skill_masteries: [{ ids: ['Q', 'W', 'E'], play: 3000, win: 1500, pick_rate: 0.9 }],
        opponent_champion_tip: 'Mantener distancia al nivel 1-2 y no intercambiar en rango de Headshot.',
      },
    };

    beforeEach(() => {
      mockDb = {
        getMatchupCache: vi.fn().mockReturnValue(null),
        setMatchupCache: vi.fn(),
        recordApiCall: vi.fn(),
        getApiCallCount: vi.fn().mockReturnValue(0),
      } as unknown as IDatabaseService;

      mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: {
            content: [{ type: 'text', text: JSON.stringify(mockOpGgResponse) }],
          },
        }),
      });
    });

    it('devuelve datos en caché si existen sin llamar a la red', async () => {
      const cachedData = {
        myChampionId: 901,
        opponentChampionId: 51,
        position: 'BOTTOM' as const,
        patch: '26.20',
        elo: 'emerald_plus',
        runes: [],
        starterItems: [],
        boots: [],
        coreItems: [],
        summonerSpells: [],
        skillOrder: [],
        skillPriority: [],
        totalMatches: 4367,
      };

      (mockDb.getMatchupCache as any).mockReturnValue({
        opggData: cachedData,
      });

      const client = new OpGgClient({ dbService: mockDb, fetchImpl: mockFetch as any });
      const result = await client.getLaneMatchupGuide({
        championId: 901,
        opponentId: 51,
        role: 'BOTTOM',
      });

      expect(result).toEqual(cachedData);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('realiza llamada a OP.GG MCP, procesa IDs y traduce nombres a español', async () => {
      const client = new OpGgClient({ dbService: mockDb, fetchImpl: mockFetch as any });
      const result = await client.getLaneMatchupGuide({
        championId: 901, // Smolder
        opponentId: 51, // Caitlyn
        role: 'BOTTOM',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockDb.recordApiCall).toHaveBeenCalledWith('OPGG', '/mcp/lol_get_lane_matchup_guide', 200);

      // Verificar runas
      expect(result.runes.length).toBe(1);
      expect(result.runes[0].primaryPageId).toBe(8200); // Brujería
      expect(result.runes[0].primaryPageName).toBe('Brujería');
      expect(result.runes[0].primaryRuneIds).toEqual([8992, 8275, 8234, 8236]);
      expect(result.runes[0].secondaryPageId).toBe(8300); // Inspiración
      expect(result.runes[0].secondaryRuneIds).toEqual([8304, 8316]);

      // Verificar core items
      expect(result.coreItems[0].ids).toEqual([3508, 3071, 3161]);
      expect(result.coreItems[0].names).toEqual([
        'Segador de Esencia',
        'Cuchilla Negra',
        'Lanza de Shojin',
      ]);

      // Verificar spells
      expect(result.summonerSpells[0].ids).toEqual([4, 21]);
      expect(result.summonerSpells[0].names).toEqual(['Destello', 'Barrera']);

      // Verificar que se guardó en BD
      expect(mockDb.setMatchupCache).toHaveBeenCalled();
    });

    it('detecta muestra pequeña (< 50 partidas) y añade advertencia de fallback', async () => {
      const lowSampleResponse = JSON.parse(JSON.stringify(mockOpGgResponse));
      lowSampleResponse.data.runes[0].play = 12; // Menos de 50 partidas
      lowSampleResponse.data.core_items[0].play = 8;

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: {
            content: [{ type: 'text', text: JSON.stringify(lowSampleResponse) }],
          },
        }),
      });

      const client = new OpGgClient({ dbService: mockDb, fetchImpl: mockFetch as any });
      const result = await client.getLaneMatchupGuide({
        championId: 901,
        opponentId: 51,
        role: 'BOTTOM',
      });

      expect(result.isGeneralBuildFallback).toBe(true);
      expect(result.sampleSizeWarning).toContain('Muestra reducida');
    });

    it('reintenta ante error 429 con backoff', async () => {
      // 1ra llamada: 429, 2da llamada: 200
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            jsonrpc: '2.0',
            id: 1,
            result: {
              content: [{ type: 'text', text: JSON.stringify(mockOpGgResponse) }],
            },
          }),
        });

      const client = new OpGgClient({ dbService: mockDb, fetchImpl: mockFetch as any });
      const result = await client.getLaneMatchupGuide({
        championId: 901,
        opponentId: 51,
        role: 'BOTTOM',
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.coreItems[0].ids).toEqual([3508, 3071, 3161]);
    });
  });
});
