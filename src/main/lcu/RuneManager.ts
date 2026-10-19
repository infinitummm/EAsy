/**
 * Gestor de páginas de runas vía LCU API (T-4.2).
 *
 * Aplica una `RunePage` validada (exactamente 9 perks) al cliente oficial:
 *  - Si la página trae `id`, la sobrescribe por identificador.
 *  - Si no trae `id`, sobrescribe la página activa (`current: true`) cuando
 *    existe y `sobrescribirActiva` está habilitado; en caso contrario crea una
 *    página nueva en `/lol-perks/v1/pages`.
 *
 * La validación reutiliza `validarPaginaRunas()` de `LcuClient` para que el
 * criterio de 9 perks sea único en todo el backend. Todas las páginas se
 * envían con `current: true`: el objetivo del gestor es aplicarlas.
 */

import type { ILcuClient } from '@shared/contracts';
import type { GeminiMatchupRecommendation, RunePage } from '@shared/types';
import { ENDPOINTS_LCU, validarPaginaRunas } from './LcuClient';

/** Opciones de construcción del gestor de runas. */
export interface OpcionesRuneManager {
  /** Nombre por defecto cuando la página no trae uno utilizable. */
  nombrePaginaPorDefecto?: string;
  /**
   * Si es `true` (por defecto), la página activa se sobrescribe en lugar de
   * crear una página nueva. Con `false` siempre se crea una página adicional.
   */
  sobrescribirActiva?: boolean;
}

/** Resultado de aplicar una página de runas al cliente de League of Legends. */
export interface ResultadoAplicacionRunas {
  success: boolean;
  pageId?: number;
  /** La operación intentada fue una creación (POST). */
  creada: boolean;
  /** La operación intentada fue una sobrescritura (PUT sobre una página existente). */
  sobrescrita: boolean;
  error?: string;
}

/** Detecta errores 404 de la LCU sin acoplar el gestor a la clase concreta. */
function esNoEncontrado(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'codigoEstado' in error &&
    (error as { codigoEstado?: unknown }).codigoEstado === 404
  );
}

export class RuneManager {
  private readonly lcu: ILcuClient;
  private readonly nombrePaginaPorDefecto: string;
  private readonly sobrescribirActiva: boolean;

  constructor(lcu: ILcuClient, opciones: OpcionesRuneManager = {}) {
    this.lcu = lcu;
    this.nombrePaginaPorDefecto = opciones.nombrePaginaPorDefecto ?? 'Itero Local';
    this.sobrescribirActiva = opciones.sobrescribirActiva ?? true;
  }

  /**
   * Devuelve las páginas de runas del cliente. Un 404 se interpreta como
   * "el cliente todavía no expone páginas" y se resuelve con una lista vacía.
   */
  async obtenerPaginas(): Promise<RunePage[]> {
    try {
      const paginas = await this.lcu.request<RunePage[]>('GET', ENDPOINTS_LCU.RUNE_PAGES);
      return Array.isArray(paginas) ? paginas : [];
    } catch (error) {
      if (esNoEncontrado(error)) {
        return [];
      }
      throw error;
    }
  }

  /** Devuelve la página marcada como activa (`current: true`), si existe. */
  async obtenerPaginaActiva(): Promise<RunePage | null> {
    const paginas = await this.obtenerPaginas();
    return paginas.find((pagina) => pagina.current === true) ?? null;
  }

  /**
   * Aplica una página de runas: la valida, decide si sobrescribir la activa o
   * crear una nueva y delega la petición en `ILcuClient.injectRunePage`.
   */
  async aplicarPagina(pagina: RunePage): Promise<ResultadoAplicacionRunas> {
    const candidata = this.normalizarPagina(pagina);

    const errorValidacion = validarPaginaRunas(candidata);
    if (errorValidacion) {
      return { success: false, creada: false, sobrescrita: false, error: errorValidacion };
    }

    // 1. Identificador explícito: sobrescritura directa sin listar páginas.
    if (candidata.id !== undefined) {
      return this.inyectar(candidata, false);
    }

    try {
      // 2. Sin id: sobrescribir la activa si el gestor lo permite.
      if (this.sobrescribirActiva) {
        const activa = (await this.obtenerPaginas()).find(
          (existente) => existente.current === true && existente.id !== undefined
        );

        if (activa?.id !== undefined) {
          return this.inyectar({ ...candidata, id: activa.id }, false);
        }
      }

      // 3. Sin página activa sobrescribible: crear una nueva.
      return this.inyectar({ ...candidata, id: undefined }, true);
    } catch (error) {
      return {
        success: false,
        creada: false,
        sobrescrita: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Elimina una página de runas por identificador. Devuelve `true` si se borró. */
  async eliminarPagina(id: number): Promise<boolean> {
    try {
      await this.lcu.request<unknown>('DELETE', `${ENDPOINTS_LCU.RUNE_PAGES}/${id}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Construye una `RunePage` a partir de la recomendación de Gemini.
   * La página resultante debe aplicarse con `aplicarPagina()` para validarla.
   */
  static crearPaginaDesdeRecomendacion(
    runas: GeminiMatchupRecommendation['runesRecommendation'],
    nombre: string = 'Itero Local'
  ): RunePage {
    return {
      name: nombre,
      primaryStyleId: runas.primaryStyleId,
      subStyleId: runas.subStyleId,
      selectedPerkIds: [...runas.selectedPerkIds],
      current: true,
    };
  }

  /** Completa nombre y estado activo antes de validar y enviar la página. */
  private normalizarPagina(pagina: RunePage): RunePage {
    const nombre = typeof pagina?.name === 'string' ? pagina.name.trim() : '';
    return {
      ...pagina,
      name: nombre || this.nombrePaginaPorDefecto,
      selectedPerkIds: Array.isArray(pagina?.selectedPerkIds) ? [...pagina.selectedPerkIds] : [],
      current: true,
    };
  }

  /** Delega la escritura en el cliente LCU y unifica el resultado. */
  private async inyectar(pagina: RunePage, creada: boolean): Promise<ResultadoAplicacionRunas> {
    const resultado = await this.lcu.injectRunePage(pagina);
    return {
      success: resultado.success,
      pageId: resultado.pageId ?? pagina.id,
      creada,
      sobrescrita: !creada,
      error: resultado.error,
    };
  }
}
