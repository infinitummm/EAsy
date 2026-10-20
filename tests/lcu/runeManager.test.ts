/**
 * Pruebas unitarias del gestor de páginas de runas (T-4.2).
 * Verifica la validación de 9 perks, la política de sobrescritura de la página
 * activa, la creación de páginas nuevas, el borrado y la conversión desde una
 * recomendación de Gemini. Se usa un doble de `ILcuClient` que replica el
 * contrato de `injectRunePage` y registra las peticiones HTTP resultantes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RuneManager } from '../../src/main/lcu/RuneManager';
import { validarPaginaRunas } from '../../src/main/lcu/LcuClient';
import type { ILcuClient } from '../../src/shared/contracts';
import type { GeminiMatchupRecommendation, RunePage } from '../../src/shared/types';

// ==========================================
// Doble de prueba del cliente LCU
// ==========================================

interface PeticionLcu {
  metodo: string;
  ruta: string;
  cuerpo?: unknown;
}

class LcuClientFalso {
  paginas: RunePage[] = [];
  errorPaginas: unknown = null;
  errorEliminar: unknown = null;
  respuestaInyeccion: { success: boolean; pageId?: number; error?: string } | null = null;

  readonly peticiones: PeticionLcu[] = [];
  readonly inyectadas: RunePage[] = [];

  async request<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
    this.peticiones.push({ metodo, ruta, cuerpo });

    if (metodo === 'GET' && ruta === '/lol-perks/v1/pages') {
      if (this.errorPaginas) {
        throw this.errorPaginas;
      }
      return this.paginas as T;
    }

    if (metodo === 'DELETE' && ruta.startsWith('/lol-perks/v1/pages/')) {
      if (this.errorEliminar) {
        throw this.errorEliminar;
      }
      return undefined as T;
    }

    throw new Error(`Petición no simulada: ${metodo} ${ruta}`);
  }

  /** Réplica del comportamiento de `LcuClient.injectRunePage`. */
  async injectRunePage(pagina: RunePage): Promise<{
    success: boolean;
    pageId?: number;
    error?: string;
  }> {
    this.inyectadas.push(structuredClone(pagina));

    if (this.respuestaInyeccion) {
      return { ...this.respuestaInyeccion };
    }

    const errorValidacion = validarPaginaRunas(pagina);
    if (errorValidacion) {
      return { success: false, error: errorValidacion };
    }

    if (pagina.id !== undefined) {
      this.peticiones.push({
        metodo: 'PUT',
        ruta: `/lol-perks/v1/pages/${pagina.id}`,
        cuerpo: structuredClone(pagina),
      });
      return { success: true, pageId: pagina.id };
    }

    this.peticiones.push({
      metodo: 'POST',
      ruta: '/lol-perks/v1/pages',
      cuerpo: structuredClone(pagina),
    });
    return { success: true, pageId: 42 };
  }
}

function comoClienteLcu(falso: LcuClientFalso): ILcuClient {
  return falso as unknown as ILcuClient;
}

// ==========================================
// Datos de ejemplo
// ==========================================

const PERKS = [8005, 9111, 8009, 8299, 8444, 8451, 5005, 5008, 5011];

function crearPagina(cambios: Partial<RunePage> = {}): RunePage {
  return {
    name: 'Página de prueba',
    primaryStyleId: 8000,
    subStyleId: 8400,
    selectedPerkIds: [...PERKS],
    current: false,
    ...cambios,
  };
}

function crearRecomendacion(
  cambios: Partial<GeminiMatchupRecommendation['runesRecommendation']> = {}
): GeminiMatchupRecommendation['runesRecommendation'] {
  return {
    primaryStyleId: 8000,
    subStyleId: 8400,
    selectedPerkIds: [...PERKS],
    rationale: 'Por pruebas.',
    ...cambios,
  };
}

/** Error 404 compatible con la detección de `RuneManager`. */
function crearError404(): Error {
  return Object.assign(new Error('Not Found'), { codigoEstado: 404 });
}

// ==========================================
// Suite
// ==========================================

describe('RuneManager (T-4.2)', () => {
  let cliente: LcuClientFalso;

  beforeEach(() => {
    cliente = new LcuClientFalso();
  });

  describe('validación de páginas', () => {
    it('rechaza páginas que no tengan exactamente 9 perks', async () => {
      const manager = new RuneManager(comoClienteLcu(cliente));

      const resultado = await manager.aplicarPagina(
        crearPagina({ selectedPerkIds: PERKS.slice(0, 8) })
      );

      expect(resultado.success).toBe(false);
      expect(resultado.error).toContain('exactamente 9 perks');
      expect(cliente.inyectadas).toHaveLength(0);
      expect(cliente.peticiones).toHaveLength(0);
    });

    it('rechaza perks que no sean identificadores numéricos', async () => {
      const manager = new RuneManager(comoClienteLcu(cliente));
      const perksInvalidos = [...PERKS] as unknown[];
      perksInvalidos[3] = '8299';

      const resultado = await manager.aplicarPagina(
        crearPagina({ selectedPerkIds: perksInvalidos as number[] })
      );

      expect(resultado.success).toBe(false);
      expect(resultado.error).toContain('identificadores numéricos');
      expect(cliente.inyectadas).toHaveLength(0);
    });
  });

  describe('creación y sobrescritura', () => {
    it('crea una página nueva cuando no hay página activa', async () => {
      cliente.paginas = [crearPagina({ id: 8, current: false })];
      const manager = new RuneManager(comoClienteLcu(cliente));

      const resultado = await manager.aplicarPagina(crearPagina());

      expect(resultado).toEqual({
        success: true,
        pageId: 42,
        creada: true,
        sobrescrita: false,
        error: undefined,
      });
      const creacion = cliente.peticiones.find((peticion) => peticion.metodo === 'POST');
      expect(creacion?.ruta).toBe('/lol-perks/v1/pages');
      expect(creacion?.cuerpo).toMatchObject({
        name: 'Página de prueba',
        current: true,
        selectedPerkIds: PERKS,
      });
    });

    it('sobrescribe la página activa en lugar de crear una nueva', async () => {
      cliente.paginas = [
        crearPagina({ id: 7, current: true }),
        crearPagina({ id: 8, current: false }),
      ];
      const manager = new RuneManager(comoClienteLcu(cliente));

      const resultado = await manager.aplicarPagina(crearPagina({ current: false }));

      expect(resultado).toEqual({
        success: true,
        pageId: 7,
        creada: false,
        sobrescrita: true,
        error: undefined,
      });
      const actualizacion = cliente.peticiones.find((peticion) => peticion.metodo === 'PUT');
      expect(actualizacion?.ruta).toBe('/lol-perks/v1/pages/7');
      expect(actualizacion?.cuerpo).toMatchObject({ id: 7, current: true });
      expect(cliente.peticiones.some((peticion) => peticion.metodo === 'POST')).toBe(false);
    });

    it('crea una página nueva si la sobrescritura de la activa está deshabilitada', async () => {
      cliente.paginas = [crearPagina({ id: 7, current: true })];
      const manager = new RuneManager(comoClienteLcu(cliente), { sobrescribirActiva: false });

      const resultado = await manager.aplicarPagina(crearPagina());

      expect(resultado).toMatchObject({ success: true, pageId: 42, creada: true, sobrescrita: false });
      expect(cliente.peticiones.some((peticion) => peticion.metodo === 'PUT')).toBe(false);
    });

    it('sobrescribe directamente cuando la página trae id, sin listar páginas', async () => {
      const manager = new RuneManager(comoClienteLcu(cliente));

      const resultado = await manager.aplicarPagina(crearPagina({ id: 15 }));

      expect(resultado).toMatchObject({ success: true, pageId: 15, sobrescrita: true });
      expect(cliente.peticiones.map((peticion) => peticion.metodo)).toEqual(['PUT']);
      expect(cliente.peticiones[0].ruta).toBe('/lol-perks/v1/pages/15');
    });

    it('usa el nombre por defecto cuando la página no trae nombre utilizable', async () => {
      const manager = new RuneManager(comoClienteLcu(cliente), {
        nombrePaginaPorDefecto: 'Runas IA',
      });

      await manager.aplicarPagina(crearPagina({ name: '   ' }));

      expect(cliente.inyectadas[0].name).toBe('Runas IA');
    });

    it('informa del error cuando el cliente LCU rechaza la inyección', async () => {
      cliente.respuestaInyeccion = { success: false, error: 'La LCU rechazó la página.' };
      const manager = new RuneManager(comoClienteLcu(cliente));

      const resultado = await manager.aplicarPagina(crearPagina());

      expect(resultado).toMatchObject({
        success: false,
        creada: true,
        sobrescrita: false,
        error: 'La LCU rechazó la página.',
      });
    });
  });

  describe('listado y eliminación de páginas', () => {
    it('trata un 404 como lista vacía de páginas', async () => {
      cliente.errorPaginas = crearError404();
      const manager = new RuneManager(comoClienteLcu(cliente));

      await expect(manager.obtenerPaginas()).resolves.toEqual([]);
    });

    it('propaga otros errores al listar páginas y no inyecta nada', async () => {
      cliente.errorPaginas = new Error('LCU ocupada');
      const manager = new RuneManager(comoClienteLcu(cliente));

      const resultado = await manager.aplicarPagina(crearPagina());

      expect(resultado.success).toBe(false);
      expect(resultado.error).toBe('LCU ocupada');
      expect(cliente.inyectadas).toHaveLength(0);
    });

    it('obtiene la página activa o null', async () => {
      const manager = new RuneManager(comoClienteLcu(cliente));
      const activa = crearPagina({ id: 7, current: true });

      cliente.paginas = [crearPagina({ id: 8 }), activa];
      await expect(manager.obtenerPaginaActiva()).resolves.toEqual(activa);

      cliente.paginas = [crearPagina({ id: 8 })];
      await expect(manager.obtenerPaginaActiva()).resolves.toBeNull();
    });

    it('elimina una página y devuelve false si la LCU falla', async () => {
      const manager = new RuneManager(comoClienteLcu(cliente));

      await expect(manager.eliminarPagina(7)).resolves.toBe(true);
      expect(cliente.peticiones).toContainEqual({
        metodo: 'DELETE',
        ruta: '/lol-perks/v1/pages/7',
        cuerpo: undefined,
      });

      cliente.errorEliminar = new Error('No se puede borrar la página activa');
      await expect(manager.eliminarPagina(7)).resolves.toBe(false);
    });
  });

  describe('conversión desde recomendación de Gemini', () => {
    it('construye una página válida de 9 perks a partir de la recomendación', () => {
      const pagina = RuneManager.crearPaginaDesdeRecomendacion(crearRecomendacion(), 'Matchup IA');

      expect(pagina).toEqual({
        name: 'Matchup IA',
        primaryStyleId: 8000,
        subStyleId: 8400,
        selectedPerkIds: PERKS,
        current: true,
      });
      expect(validarPaginaRunas(pagina)).toBeNull();
    });

    it('copia el arreglo de perks para no compartir referencias', () => {
      const recomendacion = crearRecomendacion();
      const pagina = RuneManager.crearPaginaDesdeRecomendacion(recomendacion);

      recomendacion.selectedPerkIds.push(9999);

      expect(pagina.selectedPerkIds).toEqual(PERKS);
      expect(pagina.name).toBe('Itero Local');
    });
  });
  describe('limpieza y reutilización de páginas de la app (REQ-022)', () => {
    it('reutiliza la página [IL] existente y limpia duplicados', async () => {
      cliente.paginas = [
        crearPagina({ id: 10, name: '[IL] Itero Local', isEditable: true } as any),
        crearPagina({ id: 11, name: '[IL] Duplicada', isEditable: true } as any),
        crearPagina({ id: 12, name: 'Página Personal', isEditable: true } as any),
      ];
      const manager = new RuneManager(comoClienteLcu(cliente));

      const res = await manager.aplicarPagina(crearPagina());
      expect(res.success).toBe(true);
      expect(res.pageId).toBe(10);
      expect(res.sobrescrita).toBe(true);
      expect(cliente.peticiones.some(p => p.metodo === 'DELETE' && p.ruta === '/lol-perks/v1/pages/11')).toBe(true);
    });

    it('cleanAppRunePages elimina todas las páginas con prefijo [IL] o Itero', async () => {
      cliente.paginas = [
        crearPagina({ id: 10, name: '[IL] Itero Local', isEditable: true } as any),
        crearPagina({ id: 11, name: 'Itero Build', isEditable: true } as any),
        crearPagina({ id: 12, name: 'Página Personal', isEditable: true } as any),
      ];
      const manager = new RuneManager(comoClienteLcu(cliente));

      const eliminadas = await manager.cleanAppRunePages();
      expect(eliminadas).toBe(2);
      expect(cliente.peticiones.filter(p => p.metodo === 'DELETE')).toHaveLength(2);
    });
  });
});
