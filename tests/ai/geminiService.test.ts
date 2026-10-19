import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiService } from '../../src/main/ai/GeminiService';
import { buildMatchupPrompt, validateGeminiMatchupResponse } from '../../src/main/ai/prompts';
import { GeminiMatchupRecommendation } from '../../src/shared/types';
import { IDatabaseService } from '../../src/shared/contracts';

describe('GeminiService y Prompts (T-5.2)', () => {
  const mockRecommendation: GeminiMatchupRecommendation = {
    championId: 266, // Aatrox
    opponentChampionId: 24, // Jax
    assignedRole: 'TOP',
    patchVersion: '14.20.1',
    difficultyRating: 7,
    matchupSummary: 'Matchup de habilidad. Jax puede esquivar tu pasiva pero tú tienes ventaja de rango con la Q.',
    runesRecommendation: {
      primaryStyleId: 8000,
      subStyleId: 8400,
      selectedPerkIds: [8010, 9111, 9104, 8299, 8446, 8453, 5008, 5008, 5002],
      rationale: 'Conquistador para duelos prolongados.'
    },
    buildRecommendation: {
      startingItems: [1055, 2003],
      coreItems: [3078, 6631, 3053],
      situationalItems: [{ itemId: 3026, condition: 'Frente a daño explosivo' }],
      rationale: 'Daño físico y supervivencia.'
    },
    skillOrder: {
      priority: ['Q', 'E', 'W', 'R'],
      firstThreeLevels: ['Q', 'E', 'W'],
      rationale: 'Q principal fuente de daño.'
    },
    earlyGameStrategy: {
      waveManagement: 'Slow push nivel 1-3',
      tradingPlan: 'Usar Q1 y Q2 a máxima distancia',
      levelSpikes: ['Nivel 3', 'Nivel 6']
    },
    threatAnalysis: {
      enemyThreats: ['E de Jax bloquea autoataques'],
      winCondition: 'Conseguir ventaja de oro y agrupar en dragón'
    }
  };

  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('buildMatchupPrompt y validateGeminiMatchupResponse', () => {
    it('construye prompts con la información requerida', () => {
      const { systemInstruction, userPrompt } = buildMatchupPrompt({
        championId: 266,
        championName: 'Aatrox',
        opponentId: 24,
        opponentName: 'Jax',
        role: 'TOP',
        patch: '14.20.1',
        allies: [1, 2, 3],
        enemies: [4, 5, 6]
      });

      expect(systemInstruction).toContain('Challenger');
      expect(systemInstruction).toContain('14.20.1');
      expect(userPrompt).toContain('Aatrox');
      expect(userPrompt).toContain('Jax');
      expect(userPrompt).toContain('TOP');
      expect(userPrompt).toContain('Aliados de mi equipo');
    });

    it('valida respuestas correctas', () => {
      expect(validateGeminiMatchupResponse(mockRecommendation)).toBe(true);
    });

    it('rechaza respuestas incompletas o sin 9 perks', () => {
      expect(validateGeminiMatchupResponse(null)).toBe(false);
      expect(validateGeminiMatchupResponse({})).toBe(false);

      const invalidRunes = {
        ...mockRecommendation,
        runesRecommendation: {
          ...mockRecommendation.runesRecommendation,
          selectedPerkIds: [1, 2, 3] // No tiene 9
        }
      };
      expect(validateGeminiMatchupResponse(invalidRunes)).toBe(false);
    });
  });

  describe('GeminiService', () => {
    it('genera claves de caché normalizando el parche', () => {
      const service = new GeminiService();
      const key1 = service.generateCacheKey(266, 24, 'TOP', '14.20.1');
      const key2 = service.generateCacheKey(266, 24, 'TOP', '14.20.5');
      expect(key1).toBe('matchup:266:24:TOP:14.20');
      expect(key2).toBe('matchup:266:24:TOP:14.20');
    });

    it('retorna fallback cuando no hay API key configurada', async () => {
      const service = new GeminiService({ apiKey: '' });
      const res = await service.getMatchupAdvice({
        championId: 266,
        opponentId: 24,
        role: 'TOP',
        patch: '14.20.1'
      });

      expect(res.championId).toBe(266);
      expect(res.opponentChampionId).toBe(24);
      expect(res.runesRecommendation.selectedPerkIds.length).toBe(9);
      expect(res.matchupSummary).toContain('Ajustes');
    });

    it('utiliza la base de datos como caché si ya tiene el registro', async () => {
      const mockDb: Partial<IDatabaseService> = {
        getMatchupCache: vi.fn().mockReturnValue(mockRecommendation),
        setMatchupCache: vi.fn(),
        recordApiCall: vi.fn()
      };

      const service = new GeminiService({
        apiKey: 'fake-api-key',
        dbService: mockDb as IDatabaseService
      });

      const res = await service.getMatchupAdvice({
        championId: 266,
        opponentId: 24,
        role: 'TOP',
        patch: '14.20.1'
      });

      expect(res).toEqual(mockRecommendation);
      expect(mockDb.getMatchupCache).toHaveBeenCalledWith('matchup:266:24:TOP:14.20');
    });

    it('llama a la API de Gemini, limpia bloques markdown de JSON y almacena en caché', async () => {
      const markdownJson = `\`\`\`json
${JSON.stringify(mockRecommendation)}
\`\`\``;

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: markdownJson }]
              }
            }
          ]
        })
      } as Response);

      const mockDb: Partial<IDatabaseService> = {
        getMatchupCache: vi.fn().mockReturnValue(null),
        setMatchupCache: vi.fn(),
        recordApiCall: vi.fn()
      };

      const service = new GeminiService({
        apiKey: 'AIzaSyFakeKey123456789',
        dbService: mockDb as IDatabaseService,
        initialBackoffMs: 10
      });

      // Sobrescribimos el timer mínimo para que el test corra instantáneamente
      (service as unknown as { minIntervalMs: number }).minIntervalMs = 0;

      const res = await service.getMatchupAdvice({
        championId: 266,
        opponentId: 24,
        role: 'TOP',
        patch: '14.20.1'
      });

      expect(res.championId).toBe(266);
      expect(res.difficultyRating).toBe(7);
      expect(mockDb.setMatchupCache).toHaveBeenCalled();
      expect(mockDb.recordApiCall).toHaveBeenCalledWith('GEMINI', expect.stringContaining('generateContent'), 200);

      // Segunda llamada consecutiva debe salir de la caché en memoria sin invocar fetch
      const callsBefore = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
      const res2 = await service.getMatchupAdvice({
        championId: 266,
        opponentId: 24,
        role: 'TOP',
        patch: '14.20.1'
      });
      const callsAfter = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;

      expect(res2).toEqual(res);
      expect(callsAfter).toBe(callsBefore);
    });

    it('testApiKey valida key con HTTP 200 y rechaza ante error', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ status: 200 } as Response)
        .mockResolvedValueOnce({ status: 400 } as Response);

      const service = new GeminiService();
      const valid = await service.testApiKey('valid-key-12345');
      const invalid = await service.testApiKey('bad-key-12345');
      const tooShort = await service.testApiKey('short');

      expect(valid).toBe(true);
      expect(invalid).toBe(false);
      expect(tooShort).toBe(false);
    });
  });
});
