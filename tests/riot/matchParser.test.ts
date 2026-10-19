/**
 * Pruebas unitarias del parser estadístico de partidas Match-V5 (T-3.5).
 * Verifica la transformación completa a `ParsedMatchSummary`, el cálculo de
 * KDA/CS por minuto, la normalización de roles, la extracción de runas y las
 * estadísticas agregadas.
 */

import { describe, it, expect } from 'vitest';
import {
  ErrorPartidaInvalida,
  MatchParser,
  extraerRunas,
  normalizarRol,
} from '../../src/main/riot/MatchParser';
import type { MatchDto, MatchParticipantDto, ParsedMatchSummary } from '../../src/shared/types';

// ==========================================
// Datos de ejemplo
// ==========================================

function crearParticipante(cambios: Partial<MatchParticipantDto> = {}): MatchParticipantDto {
  return {
    puuid: 'puuid-1',
    summonerId: 'summoner-1',
    summonerName: 'Itero',
    riotIdGameName: 'Itero',
    riotIdTagline: 'LAS',
    championId: 266,
    championName: 'Aatrox',
    teamPosition: 'TOP',
    win: true,
    kills: 10,
    deaths: 2,
    assists: 5,
    totalDamageDealtToChampions: 25_000,
    goldEarned: 12_000,
    totalMinionsKilled: 200,
    neutralMinionsKilled: 10,
    item0: 3153,
    item1: 6672,
    item2: 0,
    item3: 0,
    item4: 0,
    item5: 0,
    item6: 3340,
    perks: {
      statPerks: { defense: 5011, flex: 5008, offense: 5005 },
      styles: [
        {
          description: 'primaryStyle',
          style: 8000,
          selections: [
            { perk: 8005, var1: 1, var2: 0, var3: 0 },
            { perk: 9111, var1: 0, var2: 0, var3: 0 },
            { perk: 8009, var1: 0, var2: 0, var3: 0 },
            { perk: 8299, var1: 0, var2: 0, var3: 0 },
          ],
        },
        {
          description: 'subStyle',
          style: 8400,
          selections: [
            { perk: 8444, var1: 0, var2: 0, var3: 0 },
            { perk: 8451, var1: 0, var2: 0, var3: 0 },
          ],
        },
      ],
    },
    ...cambios,
  };
}

function crearPartida(
  participantes: MatchParticipantDto[],
  cambios: Partial<MatchDto['info']> = {},
  matchId = 'LA1_123'
): MatchDto {
  return {
    metadata: {
      dataVersion: '2',
      matchId,
      participants: participantes.map((participante) => participante.puuid),
    },
    info: {
      gameCreation: 1_700_000_000_000,
      gameDuration: 1800,
      gameEndTimestamp: 1_700_001_800_000,
      gameId: 123,
      gameMode: 'CLASSIC',
      gameName: '',
      gameStartTimestamp: 1_700_000_000_000,
      gameType: 'MATCHED_GAME',
      gameVersion: '14.20.1',
      mapId: 11,
      participants: participantes,
      platformId: 'LA1',
      queueId: 420,
      ...cambios,
    },
  };
}

function crearResumen(cambios: Partial<ParsedMatchSummary> = {}): ParsedMatchSummary {
  return {
    matchId: 'LA1_123',
    puuid: 'puuid-1',
    gameCreation: 1_700_000_000_000,
    gameDuration: 1800,
    gameVersion: '14.20.1',
    queueId: 420,
    championId: 266,
    championName: 'Aatrox',
    role: 'TOP',
    win: true,
    kills: 10,
    deaths: 2,
    assists: 5,
    kda: 7.5,
    cs: 210,
    csPerMinute: 7,
    goldEarned: 12_000,
    damageDealt: 25_000,
    items: [3153, 6672, 0, 0, 0, 0, 3340],
    primaryStyleId: 8000,
    subStyleId: 8400,
    selectedPerks: [8005, 9111, 8009, 8299, 8444, 8451, 5005, 5008, 5011],
    ...cambios,
  };
}

// ==========================================
// Suite
// ==========================================

describe('MatchParser (T-3.5)', () => {
  const parser = new MatchParser();

  describe('parse', () => {
    it('transforma la partida completa al resumen del participante', () => {
      const partida = crearPartida([crearParticipante()]);

      expect(parser.parse(partida, 'puuid-1')).toEqual(crearResumen());
    });

    it('selecciona al participante correcto entre varios', () => {
      const partida = crearPartida([
        crearParticipante({ puuid: 'rival', championName: 'Darius', championId: 122, win: false }),
        crearParticipante({ puuid: 'puuid-1' }),
        crearParticipante({ puuid: 'aliado', championName: 'Lee Sin', championId: 64 }),
      ]);

      const resumen = parser.parse(partida, 'puuid-1');
      expect(resumen.championName).toBe('Aatrox');
      expect(resumen.win).toBe(true);
      expect(resumen.puuid).toBe('puuid-1');
    });

    it('mapea derrotas con el KDA correspondiente', () => {
      const partida = crearPartida([
        crearParticipante({ win: false, kills: 1, deaths: 9, assists: 2 }),
      ]);

      const resumen = parser.parse(partida, 'puuid-1');
      expect(resumen.win).toBe(false);
      expect(resumen.kda).toBe(0.33);
    });

    it('calcula KDA perfecta sin muertes y CS/minuto con duración cero', () => {
      const perfecta = crearPartida([crearParticipante({ kills: 4, deaths: 0, assists: 9 })]);
      expect(parser.parse(perfecta, 'puuid-1').kda).toBe(13);

      const remake = crearPartida(
        [crearParticipante({ totalMinionsKilled: 100, neutralMinionsKilled: 0 })],
        { gameDuration: 0 }
      );
      expect(parser.parse(remake, 'puuid-1').csPerMinute).toBe(0);
    });

    it('suma CS de línea y jungla y respeta los 7 slots de objetos', () => {
      const partida = crearPartida([
        crearParticipante({
          totalMinionsKilled: 150,
          neutralMinionsKilled: 30,
          item6: 3364,
          item0: 0,
        }),
      ]);

      const resumen = parser.parse(partida, 'puuid-1');
      expect(resumen.cs).toBe(180);
      expect(resumen.items).toEqual([0, 6672, 0, 0, 0, 0, 3364]);
    });

    it('lanza ErrorPartidaInvalida si el PUUID no participó', () => {
      const partida = crearPartida([crearParticipante()]);

      expect(() => parser.parse(partida, 'puuid-ajeno')).toThrow(ErrorPartidaInvalida);
      expect(() => parser.parse(partida, 'puuid-ajeno')).toThrow(/LA1_123/);
    });
  });

  describe('normalización de roles', () => {
    it('acepta los seis roles oficiales', () => {
      expect(normalizarRol('TOP')).toBe('TOP');
      expect(normalizarRol('JUNGLE')).toBe('JUNGLE');
      expect(normalizarRol('MIDDLE')).toBe('MIDDLE');
      expect(normalizarRol('BOTTOM')).toBe('BOTTOM');
      expect(normalizarRol('UTILITY')).toBe('UTILITY');
      expect(normalizarRol('FILL')).toBe('FILL');
    });

    it('normaliza minúsculas y espacios', () => {
      expect(normalizarRol('middle')).toBe('MIDDLE');
      expect(normalizarRol(' top ')).toBe('FILL'); // los espacios no son válidos en Riot
    });

    it('mapea posiciones vacías o desconocidas a FILL', () => {
      expect(normalizarRol('')).toBe('FILL');
      expect(normalizarRol(undefined)).toBe('FILL');
      expect(normalizarRol(null)).toBe('FILL');
      expect(normalizarRol('SUPPORT')).toBe('FILL');
    });
  });

  describe('extracción de runas', () => {
    it('produce 4 perks primarios + 2 secundarios + 3 stat perks', () => {
      const runas = extraerRunas(crearParticipante());

      expect(runas.primaryStyleId).toBe(8000);
      expect(runas.subStyleId).toBe(8400);
      expect(runas.selectedPerks).toEqual([8005, 9111, 8009, 8299, 8444, 8451, 5005, 5008, 5011]);
      expect(runas.selectedPerks).toHaveLength(9);
    });

    it('tolera participantes sin estilos ni stat perks', () => {
      const participante = crearParticipante({
        perks: {
          statPerks: { defense: 0, flex: 0, offense: 0 },
          styles: [],
        },
      });

      const runas = extraerRunas(participante);
      expect(runas.primaryStyleId).toBe(0);
      expect(runas.subStyleId).toBe(0);
      expect(runas.selectedPerks).toEqual([0, 0, 0]);
    });
  });

  describe('calculateStats', () => {
    it('agrega winrate, promedios y distribución de roles', () => {
      const resumenes = [
        crearResumen({ win: true, kda: 7.5, csPerMinute: 7, role: 'TOP' }),
        crearResumen({ matchId: 'LA1_124', win: true, kda: 3.33, csPerMinute: 8, role: 'TOP' }),
        crearResumen({ matchId: 'LA1_125', win: false, kda: 2, csPerMinute: 6.5, role: 'JUNGLE' }),
      ];

      expect(parser.calculateStats(resumenes)).toEqual({
        totalMatches: 3,
        winrate: 66.67,
        avgKda: 4.28,
        avgCsPerMinute: 7.17,
        roleDistribution: { TOP: 2, JUNGLE: 1 },
      });
    });

    it('devuelve ceros y distribución vacía sin partidas', () => {
      expect(parser.calculateStats([])).toEqual({
        totalMatches: 0,
        winrate: 0,
        avgKda: 0,
        avgCsPerMinute: 0,
        roleDistribution: {},
      });
    });

    it('redondea winrate perfecta a 100', () => {
      const resumenes = [crearResumen({ win: true }), crearResumen({ matchId: 'LA1_124', win: true })];

      const estadisticas = parser.calculateStats(resumenes);
      expect(estadisticas.winrate).toBe(100);
      expect(estadisticas.totalMatches).toBe(2);
    });

    it('integra parse + calculateStats de extremo a extremo', () => {
      const partidas = [
        crearPartida([crearParticipante({ win: true })], {}, 'LA1_201'),
        crearPartida([crearParticipante({ win: false, kills: 2, deaths: 8, assists: 1 })], {}, 'LA1_202'),
      ];

      const resumenes = partidas.map((partida) => parser.parse(partida, 'puuid-1'));
      const estadisticas = parser.calculateStats(resumenes);

      expect(estadisticas.totalMatches).toBe(2);
      expect(estadisticas.winrate).toBe(50);
      expect(estadisticas.roleDistribution).toEqual({ TOP: 2 });
    });
  });
});
