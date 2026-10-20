/**
 * Servicio de detección de cambios entre parches (REQ-014, Capa 1).
 *
 * Compara los metadatos de Data Dragon del parche actual con los del parche
 * anterior (ítems, árboles de runas y campeones) para detectar de forma
 * **determinista y sin consumo de cuota** elementos eliminados, modificados o
 * añadidos, con el fin de evitar que la IA recomiende contenido que ya no
 * existe en el parche vigente.
 *
 * Decisiones de contrato (REQ-014):
 *  - `PatchDiffSummary` no tiene listas de "añadidos": los elementos nuevos se
 *    incluyen en `changedItems` / `changedRunes` con `changeType: 'added'`,
 *    de modo que toda alta se reporte exactamente una vez.
 *  - Los ítems modificados llevan en `changes` una descripción legible de cada
 *    campo alterado (`Nombre: …`, `Precio: …`, `Descripción modificada`, …).
 *  - `validarSinElementosEliminados` solo marca como inválidos los elementos
 *    **eliminados** (los modificados siguen siendo válidos). La comparación de
 *    nombres ignora mayúsculas y espacios sobrantes.
 */

import {
  DataDragonService,
  ErrorDataDragon,
  type ArbolRunas,
  type DatosItem,
} from './DataDragonService';

export interface ItemDiffInfo {
  id: number;
  name: string;
  changeType: 'removed' | 'modified' | 'added';
  changes?: string[];
}

export interface RuneDiffInfo {
  id: number;
  name: string;
  changeType: 'removed' | 'modified' | 'added';
}

export interface PatchDiffSummary {
  currentPatch: string;
  previousPatch: string;
  removedItems: ItemDiffInfo[];
  changedItems: ItemDiffInfo[];
  removedRunes: RuneDiffInfo[];
  changedRunes: RuneDiffInfo[];
  newChampions: string[];
}

/** Resultado de `validarSinElementosEliminados`. */
export interface ResultadoValidacionElementos {
  valido: boolean;
  itemsInvalidos: string[];
  runasInvalidas: string[];
}

/** Runa aplanada con su árbol de origen (para detectar movimientos entre ramas). */
interface RunaAplanada {
  id: number;
  key: string;
  name: string;
  icon: string;
  arbol: string;
}

/** Aplana los árboles de runas a un mapa `id → runa` (incluye su árbol). */
function aplanarRunas(arboles: readonly ArbolRunas[]): Map<number, RunaAplanada> {
  const mapa = new Map<number, RunaAplanada>();
  for (const arbol of arboles ?? []) {
    for (const slot of arbol?.slots ?? []) {
      for (const runa of slot?.runes ?? []) {
        if (!Number.isInteger(runa?.id)) continue;
        mapa.set(runa.id, {
          id: runa.id,
          key: runa.key ?? '',
          name: runa.name ?? '',
          icon: runa.icon ?? '',
          arbol: arbol.name ?? '',
        });
      }
    }
  }
  return mapa;
}

/** Indexa ítems por su id numérico (ignora entradas con id no numérico). */
function indexarItems(items: readonly DatosItem[]): Map<number, DatosItem> {
  const mapa = new Map<number, DatosItem>();
  for (const item of items ?? []) {
    const id = Number(item?.id);
    if (Number.isInteger(id) && id > 0) mapa.set(id, item);
  }
  return mapa;
}

/** Describe los campos de un ítem que cambiaron entre parches. */
function compararItem(anterior: DatosItem, actual: DatosItem): string[] {
  const cambios: string[] = [];

  if (anterior.name !== actual.name) {
    cambios.push(`Nombre: "${anterior.name}" → "${actual.name}"`);
  }

  const precioAnterior = anterior.gold?.total ?? 0;
  const precioActual = actual.gold?.total ?? 0;
  if (precioAnterior !== precioActual) {
    cambios.push(`Precio: ${precioAnterior} → ${precioActual}`);
  }

  if ((anterior.description ?? '') !== (actual.description ?? '')) {
    cambios.push('Descripción modificada');
  }

  const tagsAnteriores = (anterior.tags ?? []).join(', ');
  const tagsActuales = (actual.tags ?? []).join(', ');
  if (tagsAnteriores !== tagsActuales) {
    cambios.push(`Etiquetas: [${tagsAnteriores}] → [${tagsActuales}]`);
  }

  return cambios;
}

/** Ordena por id ascendente para garantizar resultados deterministas. */
function ordenarPorId<T extends { id: number }>(elementos: T[]): T[] {
  return elementos.sort((a, b) => a.id - b.id);
}

export class PatchDiffService {
  constructor(private readonly dataDragon: DataDragonService) {}

  /**
   * Compara los metadatos de Data Dragon entre `parcheActual` y `parcheAnterior`.
   *
   * Si no se indica `parcheAnterior`, se resuelve automáticamente como la
   * versión inmediatamente posterior a `parcheActual` en `versions.json`
   * (p. ej. `15.9.2` → `15.9.1`).
   */
  async compararParches(
    parcheActual: string,
    parcheAnterior?: string
  ): Promise<PatchDiffSummary> {
    const actual = (parcheActual ?? '').trim();
    if (!actual) {
      throw new ErrorDataDragon('No se indicó un parche actual para comparar.');
    }

    const anterior = (parcheAnterior ?? '').trim() || (await this.resolverParcheAnterior(actual));

    const [itemsActuales, itemsAnteriores, runasActuales, runasAnteriores, campeonesActuales, campeonesAnteriores] =
      await Promise.all([
        this.dataDragon.obtenerItems(actual),
        this.dataDragon.obtenerItems(anterior),
        this.dataDragon.obtenerArbolesDeRunas(actual),
        this.dataDragon.obtenerArbolesDeRunas(anterior),
        this.dataDragon.obtenerCampeones(actual),
        this.dataDragon.obtenerCampeones(anterior),
      ]);

    const mapaItemsActual = indexarItems(itemsActuales);
    const mapaItemsAnterior = indexarItems(itemsAnteriores);

    const removedItems: ItemDiffInfo[] = [];
    const changedItems: ItemDiffInfo[] = [];

    for (const [id, item] of mapaItemsAnterior) {
      if (!mapaItemsActual.has(id)) {
        removedItems.push({ id, name: item.name, changeType: 'removed' });
      }
    }

    for (const [id, item] of mapaItemsActual) {
      const previo = mapaItemsAnterior.get(id);
      if (!previo) {
        changedItems.push({ id, name: item.name, changeType: 'added' });
        continue;
      }
      const changes = compararItem(previo, item);
      if (changes.length > 0) {
        changedItems.push({ id, name: item.name, changeType: 'modified', changes });
      }
    }

    const mapaRunasActual = aplanarRunas(runasActuales);
    const mapaRunasAnterior = aplanarRunas(runasAnteriores);

    const removedRunes: RuneDiffInfo[] = [];
    const changedRunes: RuneDiffInfo[] = [];

    for (const [id, runa] of mapaRunasAnterior) {
      if (!mapaRunasActual.has(id)) {
        removedRunes.push({ id, name: runa.name, changeType: 'removed' });
      }
    }

    for (const [id, runa] of mapaRunasActual) {
      const previa = mapaRunasAnterior.get(id);
      if (!previa) {
        changedRunes.push({ id, name: runa.name, changeType: 'added' });
        continue;
      }
      const modificada =
        previa.name !== runa.name ||
        previa.key !== runa.key ||
        previa.icon !== runa.icon ||
        previa.arbol !== runa.arbol;
      if (modificada) {
        changedRunes.push({ id, name: runa.name, changeType: 'modified' });
      }
    }

    const idsCampeonesPrevios = new Set<number>();
    for (const campeon of campeonesAnteriores ?? []) {
      const id = Number(campeon?.key);
      if (Number.isInteger(id) && id > 0) idsCampeonesPrevios.add(id);
    }

    const idsYaReportados = new Set<number>();
    const newChampions: string[] = [];
    for (const campeon of campeonesActuales ?? []) {
      const id = Number(campeon?.key);
      const nombre = typeof campeon?.name === 'string' ? campeon.name.trim() : '';
      if (!Number.isInteger(id) || id <= 0 || !nombre) continue;
      if (idsCampeonesPrevios.has(id) || idsYaReportados.has(id)) continue;
      idsYaReportados.add(id);
      newChampions.push(nombre);
    }

    return {
      currentPatch: actual,
      previousPatch: anterior,
      removedItems: ordenarPorId(removedItems),
      changedItems: ordenarPorId(changedItems),
      removedRunes: ordenarPorId(removedRunes),
      changedRunes: ordenarPorId(changedRunes),
      newChampions,
    };
  }

  /**
   * Valida que ninguna de las indicaciones corresponda a un ítem o runa
   * **eliminado** en `diff` (los modificados se consideran válidos).
   * Los nombres se comparan ignorando mayúsculas y espacios sobrantes y en el
   * resultado se devuelven tal cual se recibieron.
   */
  validarSinElementosEliminados(
    nombresItems: string[],
    nombresRunas: string[],
    diff: PatchDiffSummary
  ): ResultadoValidacionElementos {
    const normalizar = (nombre: string): string => nombre.trim().toLocaleLowerCase();
    const itemsEliminados = new Set((diff?.removedItems ?? []).map((item) => normalizar(item.name)));
    const runasEliminadas = new Set((diff?.removedRunes ?? []).map((runa) => normalizar(runa.name)));

    const itemsInvalidos = (nombresItems ?? []).filter(
      (nombre) => nombre.trim().length > 0 && itemsEliminados.has(normalizar(nombre))
    );
    const runasInvalidas = (nombresRunas ?? []).filter(
      (nombre) => nombre.trim().length > 0 && runasEliminadas.has(normalizar(nombre))
    );

    return {
      valido: itemsInvalidos.length === 0 && runasInvalidas.length === 0,
      itemsInvalidos,
      runasInvalidas,
    };
  }

  /** Resuelve el parche inmediatamente anterior consultando `versions.json`. */
  private async resolverParcheAnterior(parcheActual: string): Promise<string> {
    const versiones = await this.dataDragon.obtenerVersiones();
    const indice = versiones.findIndex(
      (version) => version === parcheActual || version.startsWith(`${parcheActual}.`)
    );

    if (indice < 0) {
      throw new ErrorDataDragon(
        `No se pudo resolver el parche anterior: "${parcheActual}" no figura en versions.json.`
      );
    }

    const anterior = versiones[indice + 1];
    if (!anterior) {
      throw new ErrorDataDragon(
        `No existe un parche anterior a "${parcheActual}" en versions.json.`
      );
    }
    return anterior;
  }
}
