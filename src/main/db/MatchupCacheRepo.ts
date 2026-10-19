/**
 * Repositorio de la caché de recomendaciones de matchup (T-5.1).
 *
 * Envuelve la tabla `matchup_cache` de `IDatabaseService` y centraliza la
 * construcción de la clave, que debe coincidir con la que usa
 * `GeminiService.generateCacheKey()`:
 *
 *     matchup:<campeón>:<rival>:<rol>:<parche mayor.menor>
 *
 * El parche se normaliza a `mayor.menor` para que una recomendación guardada
 * con `14.20.1` se pueda recuperar también consultándola con `14.20`, evitando
 * entradas duplicadas entre microparches.
 */

import type { IDatabaseService } from '@shared/contracts';
import type { GeminiMatchupRecommendation, Role } from '@shared/types';

/** Normaliza un parche a `mayor.menor` (`14.20.1` → `14.20`). */
export function normalizarParche(parche: string): string {
  const texto = String(parche ?? '');
  const partes = texto.split('.');
  return partes.length >= 2 ? `${partes[0]}.${partes[1]}` : texto;
}

/** Construye la clave de caché de un enfrentamiento con el formato acordado. */
export function construirClaveMatchup(
  championId: number,
  opponentId: number,
  role: Role,
  patchVersion: string
): string {
  return `matchup:${championId}:${opponentId}:${role}:${normalizarParche(patchVersion)}`;
}

export class MatchupCacheRepo {
  constructor(private readonly bd: IDatabaseService) {}

  /** Busca una recomendación por sus componentes (`campeón:rival:rol:parche`). */
  obtener(
    championId: number,
    opponentId: number,
    role: Role,
    patchVersion: string
  ): GeminiMatchupRecommendation | null {
    return this.bd.getMatchupCache(construirClaveMatchup(championId, opponentId, role, patchVersion));
  }

  /** Busca una recomendación a partir de una clave ya construida. */
  obtenerPorClave(cacheKey: string): GeminiMatchupRecommendation | null {
    return this.bd.getMatchupCache(cacheKey);
  }

  /**
   * Inserta o reemplaza una recomendación usando sus propios componentes
   * (`championId`, `opponentChampionId`, `assignedRole`, `patchVersion`).
   * Devuelve la clave bajo la que quedó almacenada.
   */
  guardar(recomendacion: GeminiMatchupRecommendation, ttlSegundos?: number): string {
    const clave = construirClaveMatchup(
      recomendacion.championId,
      recomendacion.opponentChampionId,
      recomendacion.assignedRole,
      recomendacion.patchVersion
    );
    this.bd.setMatchupCache(clave, recomendacion, ttlSegundos);
    return clave;
  }

  /** Inserta o reemplaza una recomendación bajo una clave explícita. */
  guardarPorClave(
    cacheKey: string,
    recomendacion: GeminiMatchupRecommendation,
    ttlSegundos?: number
  ): void {
    this.bd.setMatchupCache(cacheKey, recomendacion, ttlSegundos);
  }

  /** Elimina las entradas expiradas y devuelve cuántas se borraron. */
  podarExpirados(): number {
    return this.bd.pruneExpiredCache();
  }
}
