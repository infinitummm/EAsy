/**
 * Pruebas unitarias del repositorio de caché de matchups (T-5.1).
 * Usa una base SQLite real en memoria para verificar la construcción de la
 * clave `(campeón:rival:rol:parche)`, la inserción/búsqueda, la poda de
 * expirados y la interoperabilidad con la clave de `GeminiService` (T-5.2).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../../src/main/db/DatabaseService';
import {
  MatchupCacheRepo,
  construirClaveMatchup,
  normalizarParche,
} from '../../src/main/db/MatchupCacheRepo';
import { GeminiService } from '../../src/main/ai/GeminiService';
import type { GeminiMatchupRecommendation } from '../../src/shared/types';

// ==========================================
// Datos de ejemplo
// ==========================================

function crearRecomendacion(
  cambios: Partial<GeminiMatchupRecommendation> = {}
): GeminiMatchupRecommendation {
  return {
    championId: 266,
    opponentChampionId: 84,
    assignedRole: 'TOP',
    patchVersion: '14.20.1',
    difficultyRating: 3,
    matchupSummary: 'Cuidado con el poke temprano.',
    runesRecommendation: {
      primaryStyleId: 8000,
      subStyleId: 8400,
      selectedPerkIds: [8005, 9111, 8009, 8299, 8444, 8451, 5005, 5008, 5011],
      rationale: 'Por pruebas.',
    },
    buildRecommendation: {
      startingItems: [1054],
      coreItems: [3153, 6672],
      situationalItems: [{ itemId: 3047, condition: 'vs daño físico' }],
      rationale: 'Por pruebas.',
    },
    skillOrder: {
      priority: ['Q', 'E', 'W'],
      firstThreeLevels: ['Q', 'E', 'W'],
      rationale: 'Por pruebas.',
    },
    earlyGameStrategy: {
      waveManagement: 'Congelar cerca de tu torre.',
      tradingPlan: 'Cambios cortos con Q3.',
      levelSpikes: ['1', '3', '6'],
    },
    threatAnalysis: {
      enemyThreats: ['Daño verdadero'],
      winCondition: 'Escalar con ventaja de CS.',
    },
    ...cambios,
  };
}

// ==========================================
// Suite
// ==========================================

describe('MatchupCacheRepo (T-5.1)', () => {
  let bd: DatabaseService;
  let repo: MatchupCacheRepo;

  beforeEach(async () => {
    bd = new DatabaseService();
    await bd.initialize();
    repo = new MatchupCacheRepo(bd);
  });

  afterEach(() => {
    bd.close();
  });

  describe('construcción de claves', () => {
    it('normaliza el parche a mayor.menor', () => {
      expect(normalizarParche('14.20.1')).toBe('14.20');
      expect(normalizarParche('14.20')).toBe('14.20');
      expect(normalizarParche('14')).toBe('14');
      expect(normalizarParche('')).toBe('');
      expect(normalizarParche('14.20.1.4')).toBe('14.20');
    });

    it('construye el formato campeón:rival:rol:parche', () => {
      expect(construirClaveMatchup(266, 84, 'TOP', '14.20.3')).toBe('matchup:266:84:TOP:14.20');
    });

    it('coincide con la clave que genera GeminiService (T-5.2)', () => {
      const gemini = new GeminiService();

      for (const parche of ['14.20', '14.20.1', '14.20.1.4']) {
        expect(gemini.generateCacheKey(266, 84, 'TOP', parche)).toBe(
          construirClaveMatchup(266, 84, 'TOP', parche)
        );
      }
    });
  });

  describe('inserción y búsqueda', () => {
    it('guarda una recomendación y la recupera por sus componentes', () => {
      const recomendacion = crearRecomendacion();

      const clave = repo.guardar(recomendacion);

      expect(clave).toBe('matchup:266:84:TOP:14.20');
      expect(repo.obtener(266, 84, 'TOP', '14.20.1')).toEqual(recomendacion);
      // El microparche no genera una entrada distinta.
      expect(repo.obtener(266, 84, 'TOP', '14.20')).toEqual(recomendacion);
    });

    it('discrimina por campeón, rival, rol y parche', () => {
      repo.guardar(crearRecomendacion());

      expect(repo.obtener(122, 84, 'TOP', '14.20')).toBeNull();
      expect(repo.obtener(266, 103, 'TOP', '14.20')).toBeNull();
      expect(repo.obtener(266, 84, 'MIDDLE', '14.20')).toBeNull();
      expect(repo.obtener(266, 84, 'TOP', '14.21')).toBeNull();
    });

    it('interopera con la clave generada por GeminiService', () => {
      const gemini = new GeminiService();
      const recomendacion = crearRecomendacion();
      const claveGemini = gemini.generateCacheKey(266, 84, 'TOP', '14.20.1');

      repo.guardar(recomendacion);
      expect(bd.getMatchupCache(claveGemini)).toEqual(recomendacion);

      const otra = crearRecomendacion({ matchupSummary: 'Recomendación por clave explícita.' });
      repo.guardarPorClave(claveGemini, otra);
      expect(repo.obtenerPorClave(claveGemini)).toEqual(otra);
    });

    it('reemplaza una entrada existente con la misma clave', () => {
      repo.guardar(crearRecomendacion());
      const actualizada = crearRecomendacion({
        matchupSummary: 'Versión actualizada del análisis.',
        difficultyRating: 7,
      });

      repo.guardar(actualizada);

      expect(repo.obtener(266, 84, 'TOP', '14.20')).toEqual(actualizada);
    });

    it('devuelve null para claves desconocidas', () => {
      expect(repo.obtenerPorClave('matchup:1:2:FILL:99.99')).toBeNull();
    });
  });

  describe('expiración y poda', () => {
    it('deja de devolver una entrada con TTL agotado', () => {
      repo.guardar(crearRecomendacion(), 0);

      expect(repo.obtener(266, 84, 'TOP', '14.20')).toBeNull();
      expect(repo.podarExpirados()).toBe(1);
    });

    it('poda solo las entradas expiradas y conserva las vigentes', () => {
      repo.guardar(crearRecomendacion(), 0);
      const vigente = crearRecomendacion({ championId: 122, opponentChampionId: 103 });
      repo.guardar(vigente);

      expect(repo.podarExpirados()).toBe(1);
      expect(repo.obtener(122, 103, 'TOP', '14.20')).toEqual(vigente);
    });

    it('devuelve 0 cuando no hay entradas expiradas', () => {
      repo.guardar(crearRecomendacion());

      expect(repo.podarExpirados()).toBe(0);
      expect(repo.obtener(266, 84, 'TOP', '14.20')).not.toBeNull();
    });
  });
  describe('mode_cache (ARAM Caos y Arena)', () => {
    it('guarda y recupera datos de modo en SQLite', () => {
      const datos = {
        championId: 266,
        championName: 'Aatrox',
        mode: 'aram_mayhem' as const,
        patch: '16.21',
        augments: [
          {
            id: 1205,
            name: 'ADAPt',
            nameEs: 'A-DA-PH-TARSE',
            key: 'ARAM_ADAPt',
            rarity: 'silver' as const,
            iconUrl: 'https://opgg-static.akamaized.net/meta/images/lol/latest/aram-augment/ADAPt_small.png',
            desc: 'Convert Bonus Attack Damage to Ability Power',
            tier: 'S' as const,
            pickRate: 2.7,
            winRate: 83.07,
            isBest: true,
          },
        ],
        suggestedAugments: {
          silver: [],
          gold: [],
          prismatic: [],
        },
        lastUpdated: Date.now(),
      };

      const clave = 'mode:aram_mayhem:266:16.21';
      bd.setModeCache(clave, datos, 86400);

      const recuperado = bd.getModeCache(clave);
      expect(recuperado).toEqual(datos);
    });

    it('expira y poda entradas de modo vencidas', () => {
      const datos = {
        championId: 266,
        championName: 'Aatrox',
        mode: 'arena' as const,
        patch: '16.21',
        augments: [],
        suggestedAugments: { silver: [], gold: [], prismatic: [] },
        lastUpdated: Date.now(),
      };

      const clave = 'mode:arena:266:16.21';
      bd.setModeCache(clave, datos, 0); // Expira de inmediato

      expect(bd.getModeCache(clave)).toBeNull();
      const podados = bd.pruneExpiredCache();
      expect(podados).toBeGreaterThanOrEqual(1);
    });
  });
});
