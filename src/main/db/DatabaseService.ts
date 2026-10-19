/**
 * Capa de datos SQLite local de Itero Local (T-3.2).
 *
 * Usa `node:sqlite` (`DatabaseSync`), el módulo nativo recomendado por
 * ARCHITECTURE.md §1.3 en lugar de `better-sqlite3`, evitando compilar addons
 * nativos para Electron. La API es conceptualmente idéntica (exec/prepare/run/get/all).
 * Inconsistencia documentada como REQ-002 en docs/REQUESTS.md.
 *
 * El esquema (`schema.sql`, definido en docs/CONTRACTS.md §2) se empaqueta con una
 * importación `?raw` de Vite, por lo que no requiere copiar recursos en el build.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SQLOutputValue, StatementSync } from 'node:sqlite';
import { DEFAULT_APP_SETTINGS } from '@shared/constants';
import type { AccountEntity, IDatabaseService } from '@shared/contracts';
import type {
  AppSettings,
  GeminiMatchupRecommendation,
  ParsedMatchSummary,
  Role,
} from '@shared/types';
import { calcularCsPorMinuto, calcularKda } from '../riot/estadisticas';
import esquemaPorDefecto from './schema.sql?raw';

/** Vigencia por defecto de las recomendaciones de IA en caché: 7 días. */
export const TTL_CACHE_MATCHUP_SEGUNDOS_POR_DEFECTO = 7 * 24 * 60 * 60;

/** Error genérico de la capa de datos SQLite. */
export class ErrorBaseDeDatos extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorBaseDeDatos';
  }
}

/** Error lanzado al invocar operaciones antes de `initialize()`. */
export class ErrorBaseDeDatosNoInicializada extends ErrorBaseDeDatos {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorBaseDeDatosNoInicializada';
  }
}

export interface OpcionesDatabaseService {
  /** Ruta del archivo SQLite en disco; `:memory:` por defecto (ideal para pruebas). */
  rutaBd?: string;
  /** SQL del esquema; por defecto el de `src/main/db/schema.sql` empaquetado. */
  esquemaSql?: string;
}

type FilaBd = Record<string, SQLOutputValue>;

// ==========================================
// Conversión de filas SQLite a entidades
// ==========================================

function aTexto(valor: SQLOutputValue | undefined): string {
  if (typeof valor === 'string') return valor;
  if (valor === null || valor === undefined) return '';
  return String(valor);
}

function aNumero(valor: SQLOutputValue | undefined): number {
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'bigint') return Number(valor);
  if (typeof valor === 'string') return Number(valor) || 0;
  return 0;
}

function aTextoOpcional(valor: SQLOutputValue | undefined): string | undefined {
  return typeof valor === 'string' && valor.length > 0 ? valor : undefined;
}

function esObjetoPlano(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** Fusiona ajustes almacenados sobre los valores por defecto (un nivel de profundidad). */
function combinarAjustes(
  base: Record<string, unknown>,
  extra: Record<string, unknown>
): Record<string, unknown> {
  const resultado = structuredClone(base);
  for (const [clave, valor] of Object.entries(extra)) {
    const actual = resultado[clave];
    resultado[clave] = esObjetoPlano(actual) && esObjetoPlano(valor) ? { ...actual, ...valor } : valor;
  }
  return resultado;
}

function leerArregloNumerosDeValor(valor: unknown): number[] {
  return Array.isArray(valor) ? valor.filter((elemento): elemento is number => typeof elemento === 'number') : [];
}

function leerArregloNumeros(json: string): number[] {
  try {
    return leerArregloNumerosDeValor(JSON.parse(json));
  } catch {
    return [];
  }
}

/**
 * Lee los perks almacenados en `perks_json`. Soporta el formato nuevo
 * `{ primaryStyleId, subStyleId, selectedPerks }` y el legado (array plano).
 */
function leerPerks(json: string): { primaryStyleId: number; subStyleId: number; selectedPerks: number[] } {
  try {
    const dato: unknown = JSON.parse(json);
    if (Array.isArray(dato)) {
      return { primaryStyleId: 0, subStyleId: 0, selectedPerks: leerArregloNumerosDeValor(dato) };
    }
    if (esObjetoPlano(dato)) {
      return {
        primaryStyleId: typeof dato.primaryStyleId === 'number' ? dato.primaryStyleId : 0,
        subStyleId: typeof dato.subStyleId === 'number' ? dato.subStyleId : 0,
        selectedPerks: leerArregloNumerosDeValor(dato.selectedPerks),
      };
    }
  } catch {
    // JSON corrupto: se devuelve una estructura vacía en lugar de romper la UI.
  }
  return { primaryStyleId: 0, subStyleId: 0, selectedPerks: [] };
}

function filaACuenta(fila: FilaBd): AccountEntity {
  return {
    puuid: aTexto(fila.puuid),
    gameName: aTexto(fila.game_name),
    tagLine: aTexto(fila.tag_line),
    platform: aTexto(fila.platform),
    regional: aTexto(fila.regional),
    summonerId: aTextoOpcional(fila.summoner_id),
    profileIconId: aNumero(fila.profile_icon_id),
    summonerLevel: aNumero(fila.summoner_level),
    tier: aTextoOpcional(fila.tier),
    rank: aTextoOpcional(fila.rank),
    leaguePoints: aNumero(fila.league_points),
    updatedAt: aNumero(fila.updated_at),
  };
}

function filaAPartida(fila: FilaBd): ParsedMatchSummary {
  const duracion = aNumero(fila.game_duration);
  const asesinatos = aNumero(fila.kills);
  const muertes = aNumero(fila.deaths);
  const asistencias = aNumero(fila.assists);
  const cs = aNumero(fila.cs);
  const perks = leerPerks(aTexto(fila.perks_json));

  return {
    matchId: aTexto(fila.match_id),
    puuid: aTexto(fila.puuid),
    gameCreation: aNumero(fila.game_creation),
    gameDuration: duracion,
    gameVersion: aTexto(fila.game_version),
    queueId: aNumero(fila.queue_id),
    championId: aNumero(fila.champion_id),
    championName: aTexto(fila.champion_name),
    role: aTexto(fila.role) as Role,
    win: aNumero(fila.win) === 1,
    kills: asesinatos,
    deaths: muertes,
    assists: asistencias,
    kda: calcularKda(asesinatos, muertes, asistencias),
    cs,
    csPerMinute: calcularCsPorMinuto(cs, duracion),
    goldEarned: aNumero(fila.gold_earned),
    damageDealt: aNumero(fila.damage_dealt),
    items: leerArregloNumeros(aTexto(fila.items_json)),
    primaryStyleId: perks.primaryStyleId,
    subStyleId: perks.subStyleId,
    selectedPerks: perks.selectedPerks,
  };
}

// ==========================================
// Servicio de base de datos
// ==========================================

export class DatabaseService implements IDatabaseService {
  private readonly rutaBd: string;
  private readonly esquemaSql: string;
  private bd: DatabaseSync | null = null;
  private readonly sentencias = new Map<string, StatementSync>();

  constructor(opciones: OpcionesDatabaseService = {}) {
    this.rutaBd = opciones.rutaBd ?? ':memory:';
    this.esquemaSql = opciones.esquemaSql ?? esquemaPorDefecto;
  }

  /** Abre la BD (creando directorios si hace falta) y aplica el esquema de forma idempotente. */
  async initialize(): Promise<void> {
    if (this.bd) return;

    if (this.rutaBd !== ':memory:') {
      mkdirSync(dirname(this.rutaBd), { recursive: true });
    }

    let bd: DatabaseSync | null = null;
    try {
      bd = new DatabaseSync(this.rutaBd);
      bd.exec(this.esquemaSql);
      this.bd = bd;
    } catch (error) {
      try {
        bd?.close();
      } catch {
        // Si el cierre falla, se prioriza el error original de inicialización.
      }
      const detalle = error instanceof Error ? error.message : String(error);
      throw new ErrorBaseDeDatos(`No se pudo inicializar la base de datos en "${this.rutaBd}": ${detalle}`);
    }
  }

  /** Cierra la conexión. Es seguro llamarlo varias veces o sin haber inicializado. */
  close(): void {
    if (!this.bd) return;
    const bd = this.bd;
    this.bd = null;
    this.sentencias.clear();
    bd.close();
  }

  // ---------- Cuentas ----------

  getAccounts(): AccountEntity[] {
    return this.sentencia('SELECT * FROM accounts ORDER BY updated_at DESC').all().map(filaACuenta);
  }

  getAccount(puuid: string): AccountEntity | null {
    const fila = this.sentencia('SELECT * FROM accounts WHERE puuid = ?').get(puuid);
    return fila ? filaACuenta(fila) : null;
  }

  upsertAccount(account: AccountEntity): void {
    this.sentencia(
      `INSERT INTO accounts
         (puuid, game_name, tag_line, platform, regional, summoner_id, profile_icon_id,
          summoner_level, tier, rank, league_points, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(puuid) DO UPDATE SET
         game_name = excluded.game_name,
         tag_line = excluded.tag_line,
         platform = excluded.platform,
         regional = excluded.regional,
         summoner_id = excluded.summoner_id,
         profile_icon_id = excluded.profile_icon_id,
         summoner_level = excluded.summoner_level,
         tier = excluded.tier,
         rank = excluded.rank,
         league_points = excluded.league_points,
         updated_at = excluded.updated_at`
    ).run(
      account.puuid,
      account.gameName,
      account.tagLine,
      account.platform,
      account.regional,
      account.summonerId ?? null,
      account.profileIconId ?? 0,
      account.summonerLevel ?? 1,
      account.tier ?? null,
      account.rank ?? null,
      account.leaguePoints ?? 0,
      account.updatedAt ?? Date.now()
    );
  }

  // ---------- Partidas ----------

  /** Guarda (o actualiza) una partida y el participante objetivo de forma transaccional. */
  saveMatch(summary: ParsedMatchSummary): void {
    const bd = this.bdAc();
    const ahora = Date.now();

    bd.exec('BEGIN IMMEDIATE');
    try {
      this.sentencia(
        `INSERT INTO matches (match_id, game_creation, game_duration, game_version, queue_id, parsed_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(match_id) DO UPDATE SET
           game_creation = excluded.game_creation,
           game_duration = excluded.game_duration,
           game_version = excluded.game_version,
           queue_id = excluded.queue_id,
           parsed_at = excluded.parsed_at`
      ).run(
        summary.matchId,
        summary.gameCreation,
        summary.gameDuration,
        summary.gameVersion,
        summary.queueId,
        ahora
      );

      this.sentencia('DELETE FROM match_participants WHERE match_id = ? AND puuid = ?').run(
        summary.matchId,
        summary.puuid
      );

      this.sentencia(
        `INSERT INTO match_participants
           (match_id, puuid, champion_id, champion_name, role, win, kills, deaths, assists, cs,
            gold_earned, damage_dealt, items_json, perks_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        summary.matchId,
        summary.puuid,
        summary.championId,
        summary.championName,
        summary.role,
        summary.win ? 1 : 0,
        summary.kills,
        summary.deaths,
        summary.assists,
        summary.cs,
        summary.goldEarned,
        summary.damageDealt,
        JSON.stringify(summary.items ?? []),
        JSON.stringify({
          primaryStyleId: summary.primaryStyleId ?? 0,
          subStyleId: summary.subStyleId ?? 0,
          selectedPerks: summary.selectedPerks ?? [],
        })
      );

      bd.exec('COMMIT');
    } catch (error) {
      try {
        bd.exec('ROLLBACK');
      } catch {
        // La transacción ya pudo haberse deshecho automáticamente.
      }
      throw error;
    }
  }

  hasMatch(matchId: string): boolean {
    return this.sentencia('SELECT 1 AS existe FROM matches WHERE match_id = ?').get(matchId) !== undefined;
  }

  getRecentMatches(puuid: string, limit = 20): ParsedMatchSummary[] {
    const limite = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 20;
    return this.sentencia(
      `SELECT m.match_id, m.game_creation, m.game_duration, m.game_version, m.queue_id,
              p.puuid, p.champion_id, p.champion_name, p.role, p.win, p.kills, p.deaths,
              p.assists, p.cs, p.gold_earned, p.damage_dealt, p.items_json, p.perks_json
       FROM match_participants p
       JOIN matches m ON m.match_id = p.match_id
       WHERE p.puuid = ?
       ORDER BY m.game_creation DESC
       LIMIT ?`
    )
      .all(puuid, limite)
      .map(filaAPartida);
  }

  // ---------- Caché de matchups ----------

  getMatchupCache(cacheKey: string): GeminiMatchupRecommendation | null {
    const fila = this.sentencia(
      'SELECT recommendation_json, expires_at FROM matchup_cache WHERE cache_key = ?'
    ).get(cacheKey);

    if (!fila || aNumero(fila.expires_at) <= Date.now()) {
      return null;
    }

    try {
      return JSON.parse(aTexto(fila.recommendation_json)) as GeminiMatchupRecommendation;
    } catch {
      return null;
    }
  }

  setMatchupCache(
    cacheKey: string,
    data: GeminiMatchupRecommendation,
    ttlSeconds: number = TTL_CACHE_MATCHUP_SEGUNDOS_POR_DEFECTO
  ): void {
    const ahora = Date.now();
    const ttl = Number.isFinite(ttlSeconds) ? Math.max(0, ttlSeconds) : TTL_CACHE_MATCHUP_SEGUNDOS_POR_DEFECTO;

    this.sentencia(
      `INSERT OR REPLACE INTO matchup_cache
         (cache_key, champion_id, opponent_id, role, patch_version, recommendation_json, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      cacheKey,
      data.championId,
      data.opponentChampionId,
      data.assignedRole,
      data.patchVersion,
      JSON.stringify(data),
      ahora,
      ahora + ttl * 1000
    );
  }

  /** Elimina las entradas expiradas y devuelve cuántas se borraron. */
  pruneExpiredCache(): number {
    const resultado = this.sentencia('DELETE FROM matchup_cache WHERE expires_at <= ?').run(Date.now());
    return Number(resultado.changes);
  }

  // ---------- Ajustes ----------

  getSettings(): AppSettings {
    const guardados: Record<string, unknown> = {};
    for (const fila of this.sentencia('SELECT key, value_json FROM settings').all()) {
      try {
        guardados[aTexto(fila.key)] = JSON.parse(aTexto(fila.value_json));
      } catch {
        // Valor corrupto: se ignora y se conserva el valor por defecto.
      }
    }

    return combinarAjustes(
      DEFAULT_APP_SETTINGS as unknown as Record<string, unknown>,
      guardados
    ) as unknown as AppSettings;
  }

  saveSettings(settings: Partial<AppSettings>): void {
    const actuales = this.getSettings() as unknown as Record<string, unknown>;
    const fusionados = combinarAjustes(actuales, settings as unknown as Record<string, unknown>);
    const ahora = Date.now();

    for (const clave of Object.keys(settings)) {
      this.sentencia(
        `INSERT INTO settings (key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
      ).run(clave, JSON.stringify(fusionados[clave] ?? null), ahora);
    }
  }

  // ---------- Métricas de consumo ----------

  recordApiCall(api: 'RIOT' | 'GEMINI', endpoint: string, statusCode: number): void {
    this.sentencia(
      'INSERT INTO api_usage (api_name, endpoint, status_code, timestamp) VALUES (?, ?, ?, ?)'
    ).run(api, endpoint, statusCode, Date.now());
  }

  getApiCallCount(api: 'RIOT' | 'GEMINI', windowMs: number): number {
    const desde = Date.now() - Math.max(0, windowMs);
    const fila = this.sentencia(
      'SELECT COUNT(*) AS total FROM api_usage WHERE api_name = ? AND timestamp >= ?'
    ).get(api, desde);
    return fila ? aNumero(fila.total) : 0;
  }

  // ---------- Internos ----------

  private bdAc(): DatabaseSync {
    if (!this.bd) {
      throw new ErrorBaseDeDatosNoInicializada(
        'La base de datos no está inicializada. Llama a initialize() antes de operar.'
      );
    }
    return this.bd;
  }

  /** Devuelve una sentencia preparada cacheada (las operaciones son síncronas y frecuentes). */
  private sentencia(sql: string): StatementSync {
    const bd = this.bdAc();
    let preparada = this.sentencias.get(sql);
    if (!preparada) {
      preparada = bd.prepare(sql);
      this.sentencias.set(sql, preparada);
    }
    return preparada;
  }
}
