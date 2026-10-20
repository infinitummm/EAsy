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
import { registrarLog } from './LcuDetector';

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
    this.nombrePaginaPorDefecto = opciones.nombrePaginaPorDefecto ?? '[IL] Itero Local';
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

  /** Activa la página de runas indicada en el cliente oficial de LoL y confirma con GET. */
  async seleccionarPaginaComoActiva(pageId: number): Promise<boolean> {
    try {
      registrarLog(`[RuneManager] Activando página ${pageId} vía PUT /lol-perks/v1/currentpage...`);
      await this.lcu.request<unknown>('PUT', '/lol-perks/v1/currentpage', pageId);
      try {
        const activa = await this.lcu.request<any>('GET', '/lol-perks/v1/currentpage');
        if (activa && activa.id === pageId) {
          registrarLog(`[RuneManager Confirmación] GET /lol-perks/v1/currentpage confirmó página activa: ID ${activa.id} ("${activa.name}").`);
        }
      } catch {}
      return true;
    } catch (err) {
      registrarLog(`[RuneManager Advertencia] Fallo al activar página ${pageId}: ${err}`);
      return false;
    }
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
      return await this.inyectar(candidata, false);
    }

    try {
      const paginas = await this.obtenerPaginas();

      // 2. Si hay una página activa y editable, sobrescribirla
      if (this.sobrescribirActiva) {
        const activa = paginas.find(
          (p) => p.current === true && (p as any).isEditable !== false && p.id !== undefined
        );
        if (activa?.id !== undefined) {
          return await this.inyectar({ ...candidata, id: activa.id }, false);
        }
      }

      // 3. Si ya existe una página de la app ([IL] o Itero), reutilizarla y limpiar duplicados
      const paginasApp = paginas.filter(
        (p) => (p as any).isEditable !== false && p.id !== undefined && p.name && (p.name.startsWith('[IL]') || p.name.startsWith('Itero'))
      );
      if (paginasApp.length > 0) {
        const principal = paginasApp[0];
        for (let i = 1; i < paginasApp.length; i++) {
          const dupId = paginasApp[i].id;
          if (dupId !== undefined) {
            this.eliminarPagina(dupId).catch(() => {});
          }
        }
        return await this.inyectar({ ...candidata, id: principal.id, name: this.nombrePaginaPorDefecto }, false);
      }

      // 4. Intentar crear una nueva página si no se ha llegado al límite de 8 páginas
      const paginasEditables = paginas.filter((p) => (p as any).isEditable !== false);
      if (paginasEditables.length < 8) {
        const resCrear = await this.inyectar({ ...candidata, id: undefined }, true);
        if (resCrear.success) {
          return resCrear;
        }
      }

      // 5. Si se alcanzó el límite de páginas de Riot (máx 8) o la creación falló:
      // Sobrescribir la primera página editable para no bloquear la partida del usuario
      const primeraEditable = paginasEditables[0] || paginas.find((p) => (p as any).isEditable !== false && p.id !== undefined);
      if (primeraEditable?.id !== undefined) {
        return await this.inyectar({ ...candidata, id: primeraEditable.id }, false);
      }

      // 6. Último recurso: intentar creación directa
      return await this.inyectar({ ...candidata, id: undefined }, true);
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

  /**
   * Sanitiza los stat shards para que cumplan con la Temporada 14+ de League of Legends.
   * Evita enviar IDs obsoletos como 5002 (Armadura) o 5003 (Resistencia Mágica)
   * que hacen que el cliente de LoL muestre un aviso de advertencia (runas incompletas).
   */
  public sanitizarPerks(perks: number[]): number[] {
    if (!Array.isArray(perks) || perks.length !== 9) {
      return perks;
    }
    const resultado = [...perks];

    // Slot 1 (Ofensivo - índice 6): Fuerza Adaptable (5008), Vel. Ataque (5005), Aceleración (5007)
    const validosSlot1 = [5008, 5005, 5007];
    if (!validosSlot1.includes(resultado[6])) {
      resultado[6] = 5008;
    }

    // Slot 2 (Flexible - índice 7): Fuerza Adaptable (5008), Vel. Movimiento (5010), Vida Progresiva (5001)
    const validosSlot2 = [5008, 5010, 5001];
    if (!validosSlot2.includes(resultado[7])) {
      resultado[7] = 5008;
    }

    // Slot 3 (Defensivo - índice 8): Vida Plana (5011), Tenacidad (5013), Vida Progresiva (5001)
    // 5002 (Armor) y 5003 (MR) fueron eliminados por Riot en el parche 14.2.
    const validosSlot3 = [5011, 5013, 5001];
    if (!validosSlot3.includes(resultado[8])) {
      resultado[8] = 5011; // Vida plana (+65 HP)
    }

    return resultado;
  }

  /** Completa nombre y estado activo antes de validar y enviar la página. */
  private normalizarPagina(pagina: RunePage): RunePage {
    const nombre = typeof pagina?.name === 'string' ? pagina.name.trim() : '';
    const rawPerks = Array.isArray(pagina?.selectedPerkIds) ? [...pagina.selectedPerkIds] : [];
    return {
      ...pagina,
      name: nombre || this.nombrePaginaPorDefecto,
      selectedPerkIds: this.sanitizarPerks(rawPerks),
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
  /**
   * Elimina todas las páginas de runas generadas por la app ([IL] o Itero).
   * Devuelve la cantidad de páginas eliminadas.
   */
  public async cleanAppRunePages(): Promise<number> {
    let deletedCount = 0;
    try {
      const paginas = await this.obtenerPaginas();
      const paginasApp = paginas.filter(
        (p) => (p as any).isEditable !== false && p.id !== undefined && p.name && (p.name.startsWith('[IL]') || p.name.startsWith('Itero'))
      );
      for (const p of paginasApp) {
        if (p.id !== undefined) {
          const ok = await this.eliminarPagina(p.id);
          if (ok) deletedCount++;
        }
      }
      registrarLog(`[RuneManager] Limpieza de páginas completada. ${deletedCount} páginas eliminadas.`);
    } catch (err) {
      registrarLog(`[RuneManager] Error en cleanAppRunePages: ${err}`);
    }
    return deletedCount;
  }
}
