/**
 * Pruebas unitarias de `DatabaseService.getPersonalChampionStats` (REQ-015).
 *
 * Cubre agregación de partidas/victorias/winrate, ranking de ítems y keystones
 * (top N, sin huecos vacíos), estadísticas de matchup por `opponent_id`,
 * resolución de nombres, ausencia de datos y la migración de bases de datos
 * creadas antes de existir la columna `opponent_id`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  DatabaseService,
  LIMITE_TOP_ESTADISTICAS,
} from '../../src/main/db/DatabaseService';
import type { ParsedMatchSummary } from '../../src/shared/types';

// ==========================================
// Datos de ejemplo
// ==========================================

const PUUID = 'puuid-0001';
const CAMPEON = 266; // Aatrox

function crearResumen(cambios: Partial<ParsedMatchSummary> = {}): ParsedMatchSummary {
  return {
    matchId: 'LA1_1000000001',
    puuid: PUUID,
    gameCreation: 1_700_000_000_000,
    gameDuration: 1800,
    gameVersion: '15.9.2',
    queueId: 420,
    championId: CAMPEON,
    championName: 'Aatrox',
    role: 'TOP',
    win: true,
    kills: 10,
    deaths: 2,
    assists: 5,
    kda: 0,
    cs: 210,
    csPerMinute: 0,
    goldEarned: 12_000,
    damageDealt: 25_000,
    items: [3153, 6672, 0, 0, 0, 0, 3340],
    primaryStyleId: 8000,
    subStyleId: 8400,
    selectedPerks: [8005, 9111, 8009, 8299, 8444, 8451, 5005, 5008, 5011],
    ...cambios,
  };
}

/** Crea un directorio temporal y garantiza su limpieza al terminar la prueba. */
async function conDirectorioTemporal(
  prueba: (directorio: string) => Promise<void>
): Promise<void> {
  const directorio = await mkdtemp(join(tmpdir(), 'itero-personal-stats-'));
  try {
    await prueba(directorio);
  } finally {
    await rm(directorio, { recursive: true, force: true });
  }
}

/** Esquema previo a REQ-015: `match_participants` sin `opponent_id`. */
const ESQUEMA_ANTIGUO = `
CREATE TABLE IF NOT EXISTS matches (
    match_id TEXT PRIMARY KEY,
    game_creation INTEGER NOT NULL,
    game_duration INTEGER NOT NULL,
    game_version TEXT NOT NULL,
    queue_id INTEGER NOT NULL,
    parsed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS match_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT NOT NULL,
    puuid TEXT NOT NULL,
    champion_id INTEGER NOT NULL,
    champion_name TEXT NOT NULL,
    role TEXT NOT NULL,
    win INTEGER NOT NULL,
    kills INTEGER NOT NULL,
    deaths INTEGER NOT NULL,
    assists INTEGER NOT NULL,
    cs INTEGER NOT NULL,
    gold_earned INTEGER NOT NULL,
    damage_dealt INTEGER NOT NULL,
    items_json TEXT NOT NULL,
    perks_json TEXT NOT NULL,
    FOREIGN KEY(match_id) REFERENCES matches(match_id) ON DELETE CASCADE
);
`;

// ==========================================
// Suite
// ==========================================

describe('DatabaseService.getPersonalChampionStats (REQ-015)', () => {
  let bd: DatabaseService;

  beforeEach(async () => {
    bd = new DatabaseService();
    await bd.initialize();
  });

  afterEach(() => {
    bd.close();
  });

  describe('ausencia de datos', () => {
    it('devuelve null sin partidas guardadas', () => {
      expect(bd.getPersonalChampionStats(PUUID, CAMPEON)).toBeNull();
    });

    it('devuelve null para otro campeón o de otro jugador', async () => {
      bd.saveMatch(crearResumen({ matchId: 'LA1_A' }));

      expect(bd.getPersonalChampionStats(PUUID, 84)).toBeNull();
      expect(bd.getPersonalChampionStats('puuid-otro', CAMPEON)).toBeNull();
    });
  });

  describe('agregación básica', () => {
    beforeEach(async () => {
      bd.saveMatch(crearResumen({ matchId: 'LA1_1', win: true }));
      bd.saveMatch(crearResumen({ matchId: 'LA1_2', win: true }));
      bd.saveMatch(crearResumen({ matchId: 'LA1_3', win: false }));
    });

    it('suma partidas, victorias y winrate con dos decimales', () => {
      const stats = bd.getPersonalChampionStats(PUUID, CAMPEON);

      expect(stats).not.toBeNull();
      expect(stats?.championId).toBe(CAMPEON);
      expect(stats?.championName).toBe('Aatrox');
      expect(stats?.totalGames).toBe(3);
      expect(stats?.wins).toBe(2);
      expect(stats?.winrate).toBe(66.67);
    });

    it('ignora las partidas de otros jugadores en el mismo campeón', async () => {
      bd.saveMatch(crearResumen({ matchId: 'LA1_4', puuid: 'puuid-otro' }));

      const stats = bd.getPersonalChampionStats(PUUID, CAMPEON);
      expect(stats?.totalGames).toBe(3);
    });
  });

  describe('ítems más construidos', () => {
    beforeEach(async () => {
      bd.saveMatch(
        crearResumen({
          matchId: 'LA1_ITEMS_1',
          win: true,
          items: [3153, 6672, 3047, 0, 0, 0, 3340],
        })
      );
      bd.saveMatch(
        crearResumen({
          matchId: 'LA1_ITEMS_2',
          win: true,
          items: [3153, 3047, 0, 0, 0, 0, 3340],
        })
      );
      bd.saveMatch(
        crearResumen({
          matchId: 'LA1_ITEMS_3',
          win: false,
          items: [6672, 1001, 1002, 1003, 1004, 1005, 0],
        })
      );
    });

    it('ordena por frecuencia, descarta los huecos (0) y limita al top 5', () => {
      const stats = bd.getPersonalChampionStats(PUUID, CAMPEON);
      const items = stats?.mostBuiltItems ?? [];

      expect(items).toHaveLength(LIMITE_TOP_ESTADISTICAS);
      expect(items.map((item) => item.id)).toEqual([3047, 3153, 3340, 6672, 1001]);
      expect(items.map((item) => item.count)).toEqual([2, 2, 2, 2, 1]);
      expect(items.map((item) => item.winrate)).toEqual([100, 100, 100, 50, 0]);
      expect(items.some((item) => item.id === 0)).toBe(false);
    });

    it('usa el resolutor de nombres inyectado (por defecto `Ítem <id>`)', () => {
      const items = bd.getPersonalChampionStats(PUUID, CAMPEON)?.mostBuiltItems ?? [];
      expect(items[0]?.name).toBe('Ítem 3047');
    });

    it('permite inyectar un resolutor de nombres personalizado', async () => {
      const conResolutor = new DatabaseService({
        resolverNombreItem: (id) => (id === 3047 ? 'Botas blancas' : `Ítem ${id}`),
      });
      await conResolutor.initialize();
      try {
        conResolutor.saveMatch(crearResumen({ matchId: 'LA1_RES', items: [3047, 0, 0, 0, 0, 0, 0] }));

        const items = conResolutor.getPersonalChampionStats(PUUID, CAMPEON)?.mostBuiltItems ?? [];
        expect(items[0]).toEqual({ id: 3047, name: 'Botas blancas', count: 1, winrate: 100 });
      } finally {
        conResolutor.close();
      }
    });
  });

  describe('keystones más usadas', () => {
    beforeEach(async () => {
      bd.saveMatch(crearResumen({ matchId: 'LA1_R1', win: true }));
      bd.saveMatch(crearResumen({ matchId: 'LA1_R2', win: true }));
      bd.saveMatch(
        crearResumen({
          matchId: 'LA1_R3',
          win: false,
          selectedPerks: [8124, 8112, 8139, 8106, 8444, 8451, 5005, 5008, 5011],
        })
      );
    });

    it('usa solo la primera perk del árbol primario como keystone', () => {
      const stats = bd.getPersonalChampionStats(PUUID, CAMPEON);
      const keystones = stats?.mostUsedKeystones ?? [];

      expect(keystones).toEqual([
        { id: 8005, name: 'Runa 8005', count: 2, winrate: 100 },
        { id: 8124, name: 'Runa 8124', count: 1, winrate: 0 },
      ]);
      // Las perks secundarias y de stat nunca se cuentan como keystone.
      expect(keystones.map((keystone) => keystone.id)).not.toContain(9111);
      expect(keystones.map((keystone) => keystone.id)).not.toContain(5005);
    });
  });

  describe('matchupGames', () => {
    beforeEach(async () => {
      bd.saveMatch(crearResumen({ matchId: 'LA1_M1', win: true }), 84);
      bd.saveMatch(crearResumen({ matchId: 'LA1_M2', win: true }), 84);
      bd.saveMatch(crearResumen({ matchId: 'LA1_M3', win: false }), 64);
    });

    it('resume las partidas contra el rival indicado', () => {
      const stats = bd.getPersonalChampionStats(PUUID, CAMPEON, 84);

      expect(stats?.matchupGames).toEqual({
        opponentId: 84,
        games: 2,
        wins: 2,
        winrate: 100,
      });
      // El matchup no altera los totales del campeón.
      expect(stats?.totalGames).toBe(3);
    });

    it('resume también un rival con derrotas', () => {
      expect(bd.getPersonalChampionStats(PUUID, CAMPEON, 64)?.matchupGames).toEqual({
        opponentId: 64,
        games: 1,
        wins: 0,
        winrate: 0,
      });
    });

    it('omite matchupGames sin opponentId o sin partidas contra ese rival', () => {
      expect(bd.getPersonalChampionStats(PUUID, CAMPEON)?.matchupGames).toBeUndefined();
      expect(bd.getPersonalChampionStats(PUUID, CAMPEON, 99)?.matchupGames).toBeUndefined();
    });

    it('no mezcla partidas guardadas sin rival conocido', async () => {
      bd.saveMatch(crearResumen({ matchId: 'LA1_M4', win: true }));

      const stats = bd.getPersonalChampionStats(PUUID, CAMPEON, 84);
      expect(stats?.totalGames).toBe(4);
      expect(stats?.matchupGames?.games).toBe(2);
    });
  });

  describe('migración de esquemas antiguos', () => {
    it('añade opponent_id a bases creadas antes de REQ-015', async () => {
      await conDirectorioTemporal(async (directorio) => {
        const rutaBd = join(directorio, 'itero.db');
        const previa = new DatabaseSync(rutaBd);
        previa.exec(ESQUEMA_ANTIGUO);
        previa.close();

        const migrada = new DatabaseService({ rutaBd });
        await migrada.initialize();
        try {
          // El INSERT con opponent_id fallaría si la columna no se hubiera añadido.
          migrada.saveMatch(crearResumen({ matchId: 'LA1_MIGRADA', win: true }), 84);

          expect(migrada.getPersonalChampionStats(PUUID, CAMPEON, 84)?.matchupGames).toEqual({
            opponentId: 84,
            games: 1,
            wins: 1,
            winrate: 100,
          });
        } finally {
          migrada.close();
        }
      });
    });
  });
});
