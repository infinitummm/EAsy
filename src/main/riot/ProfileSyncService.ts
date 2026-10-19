/**
 * Sincronización integral de perfil (T-6.1).
 *
 * Descarga la identidad, el invocador, el rango, las maestrías y el historial
 * reciente desde la Riot API, parsea las partidas nuevas, las persiste en
 * SQLite y devuelve las estadísticas agregadas listas para la UI (T-6.2).
 *
 * Decisiones de diseño:
 *  - Las partidas ya presentes en SQLite se omiten (`hasMatch`) para que la
 *    sincronización sea idempotente y barata en llamadas a Riot.
 *  - Un fallo al descargar una partida concreta no aborta la sincronización:
 *    se contabiliza en `partidasFallidas` y se continúa con las demás. Los
 *    errores 401/403 sí se propagan (clave caducada/ inválida).
 *  - Cada llamada a Riot se registra con `recordApiCall` para el monitor de
 *    cuotas, incluyendo el código HTTP cuando falla.
 */

import type {
  AccountEntity,
  IDatabaseService,
  IMatchParser,
  IRiotApiClient,
} from '@shared/contracts';
import type {
  ChampionMasteryDto,
  ParsedMatchSummary,
  PlatformRouting,
  RegionalRouting,
} from '@shared/types';
import { ErrorRiotApi } from './RiotApiClient';

export interface OpcionesProfileSync {
  /** Cantidad máxima de partidas a sincronizar (1-100). Por defecto 20. */
  limitePartidas?: number;
  /** Cantidad máxima de maestrías a devolver, ordenadas por puntos. Por defecto 20. */
  limiteMaestrias?: number;
  /** Cola clasificatoria usada para el rango mostrado. Por defecto solo/dúo. */
  colaRanked?: 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR';
}

/** Estadísticas agregadas del historial reciente. */
export interface EstadisticasPerfil {
  totalMatches: number;
  winrate: number;
  avgKda: number;
  avgCsPerMinute: number;
  roleDistribution: Record<string, number>;
}

/** Resultado completo de una sincronización de perfil. */
export interface ResumenSincronizacion {
  cuenta: AccountEntity;
  partidasNuevas: number;
  partidasOmitidas: number;
  partidasFallidas: number;
  maestrias: ChampionMasteryDto[];
  estadisticas: EstadisticasPerfil;
  partidasRecientes: ParsedMatchSummary[];
}

/** Identidad opcional cuando se sincroniza directamente por PUUID. */
export interface IdentidadInvocador {
  gameName?: string;
  tagLine?: string;
}

/** Código HTTP asociado a un error de Riot, o 0 para errores locales/desconocidos. */
function codigoEstadoDe(error: unknown): number {
  return error instanceof ErrorRiotApi ? error.codigoEstado : 0;
}

/** `true` si el error indica clave inválida o caducada (no debe silenciarse). */
function esErrorAutenticacion(error: unknown): boolean {
  const codigo = codigoEstadoDe(error);
  return codigo === 401 || codigo === 403;
}

function normalizarLimite(valor: number | undefined, porDefecto: number, maximo: number): number {
  const numero = Number.isFinite(valor) ? Math.trunc(valor as number) : porDefecto;
  return Math.min(maximo, Math.max(1, numero));
}

export class ProfileSyncService {
  private readonly riot: IRiotApiClient;
  private readonly bd: IDatabaseService;
  private readonly parser: IMatchParser;
  private readonly limitePartidas: number;
  private readonly limiteMaestrias: number;
  private readonly colaRanked: 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR';

  constructor(
    riot: IRiotApiClient,
    bd: IDatabaseService,
    parser: IMatchParser,
    opciones: OpcionesProfileSync = {}
  ) {
    this.riot = riot;
    this.bd = bd;
    this.parser = parser;
    this.limitePartidas = normalizarLimite(opciones.limitePartidas, 20, 100);
    this.limiteMaestrias = normalizarLimite(opciones.limiteMaestrias, 20, 500);
    this.colaRanked = opciones.colaRanked ?? 'RANKED_SOLO_5x5';
  }

  /** Resuelve la cuenta por Riot ID (Account-V1) y sincroniza el perfil. */
  async sincronizarPorRiotId(
    gameName: string,
    tagLine: string,
    platform: PlatformRouting,
    regional: RegionalRouting
  ): Promise<ResumenSincronizacion> {
    const cuenta = await this.llamarRiot('Account-V1', () =>
      this.riot.getAccountByRiotId(gameName, tagLine, regional)
    );

    return this.sincronizarCuenta(cuenta.puuid, platform, regional, {
      gameName: cuenta.gameName,
      tagLine: cuenta.tagLine,
    });
  }

  /**
   * Sincroniza un perfil a partir de su PUUID. Si no se aporta identidad se
   * conserva la de la cuenta ya almacenada (si existe).
   */
  async sincronizarCuenta(
    puuid: string,
    platform: PlatformRouting,
    regional: RegionalRouting,
    identidad: IdentidadInvocador = {}
  ): Promise<ResumenSincronizacion> {
    const cuentaPrevia = this.bd.getAccount(puuid);

    const summoner = await this.llamarRiot('Summoner-V4', () =>
      this.riot.getSummonerByPuuid(puuid, platform)
    );

    const ranked = await this.llamarRiot('League-V4', () =>
      this.riot.getRankedEntries(summoner.id, platform)
    );

    const todasLasMaestrias = await this.llamarRiot('Champion-Mastery-V4', () =>
      this.riot.getChampionMasteries(puuid, platform)
    );

    const historial = await this.llamarRiot('Match-V5', () =>
      this.riot.getMatchHistory(puuid, regional, this.limitePartidas)
    );

    const idsPartidas = Array.isArray(historial) ? historial.slice(0, this.limitePartidas) : [];
    let partidasNuevas = 0;
    let partidasOmitidas = 0;
    let partidasFallidas = 0;

    for (const matchId of idsPartidas) {
      if (this.bd.hasMatch(matchId)) {
        partidasOmitidas += 1;
        continue;
      }

      try {
        const partida = await this.llamarRiot('Match-V5', () =>
          this.riot.getMatchById(matchId, regional)
        );
        this.bd.saveMatch(this.parser.parse(partida, puuid));
        partidasNuevas += 1;
      } catch (error) {
        if (esErrorAutenticacion(error)) {
          throw error;
        }
        // Partida corrupta, no encontrada o fallo transitorio: no aborta el resto.
        partidasFallidas += 1;
      }
    }

    const entradaRanked = ranked.find((entrada) => entrada.queueType === this.colaRanked);
    const cuenta: AccountEntity = {
      puuid,
      gameName: identidad.gameName ?? cuentaPrevia?.gameName ?? '',
      tagLine: identidad.tagLine ?? cuentaPrevia?.tagLine ?? '',
      platform,
      regional,
      summonerId: summoner.id,
      profileIconId: summoner.profileIconId,
      summonerLevel: summoner.summonerLevel,
      tier: entradaRanked?.tier ?? 'UNRANKED',
      rank: entradaRanked?.rank ?? '',
      leaguePoints: entradaRanked?.leaguePoints ?? 0,
      updatedAt: Date.now(),
    };
    this.bd.upsertAccount(cuenta);

    const partidasRecientes = this.bd.getRecentMatches(puuid, this.limitePartidas);
    const maestrias = [...todasLasMaestrias]
      .sort(
        (a, b) => b.championPoints - a.championPoints || a.championId - b.championId
      )
      .slice(0, this.limiteMaestrias);

    return {
      cuenta,
      partidasNuevas,
      partidasOmitidas,
      partidasFallidas,
      maestrias,
      estadisticas: this.parser.calculateStats(partidasRecientes),
      partidasRecientes,
    };
  }

  /** Ejecuta una llamada a Riot registrando su resultado para el monitor de cuotas. */
  private async llamarRiot<T>(endpoint: string, operacion: () => Promise<T>): Promise<T> {
    try {
      const resultado = await operacion();
      this.bd.recordApiCall('RIOT', endpoint, 200);
      return resultado;
    } catch (error) {
      this.bd.recordApiCall('RIOT', endpoint, codigoEstadoDe(error));
      throw error;
    }
  }
}
