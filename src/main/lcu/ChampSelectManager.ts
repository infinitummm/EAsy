/**
 * Motor de automatización de Champ Select (T-4.1).
 *
 * Resuelve la acción del jugador local (hover, pick, ban y hechizos) a partir
 * de la sesión que emite `LcuClient` y de las prioridades configuradas por rol
 * en `AppSettings.autoChampSelect`.
 *
 * Decisiones de diseño:
 *  - El plan se resuelve de forma pura en `resolverPlanChampSelect` y después se
 *    ejecuta contra el contrato `ILcuClient`, lo que permite probar toda la
 *    lógica sin un servidor LCU real.
 *  - Idempotencia: una misma sesión puede llegar repetidas veces por WebSocket;
 *    el manager recuerda la última acción enviada por tipo y no la repite.
 *  - Los campeones ya baneados por cualquiera de los equipos, así como los
 *    pickeos/intenciones de los aliados, se excluyen de los candidatos.
 *  - Si una acción falla se emite `accion-fallida` y no se marca como aplicada,
 *    de modo que la siguiente sesión puede reintentarla.
 *
 * Eventos emitidos (ver `EVENTOS_CHAMP_SELECT_MANAGER`):
 * - `accion-ejecutada`: `ResultadoAccionChampSelect` (éxito).
 * - `accion-fallida`: `ResultadoAccionChampSelect` (fallo de una acción) o `Error`.
 */

import { EventEmitter } from 'node:events';
import type { ILcuClient } from '@shared/contracts';
import type {
  AppSettings,
  ChampSelectAction,
  ChampSelectSession,
  Role,
} from '@shared/types';
import { DEFAULT_APP_SETTINGS } from '@shared/constants';
import { EVENTOS_LCU_CLIENT } from './LcuClient';
import { registrarLog } from './LcuDetector';
import { getChampionName } from '@shared/champions';

/** Nombres de los eventos emitidos por `ChampSelectManager`. */
export const EVENTOS_CHAMP_SELECT_MANAGER = {
  ACCION_EJECUTADA: 'accion-ejecutada',
  ACCION_FALLIDA: 'accion-fallida',
} as const;

/** Preferencias de automatización tal y como se guardan en la configuración. */
export type PreferenciasAutomatizacion = AppSettings['autoChampSelect'];

/** Preferencias de un rol concreto. */
export type PreferenciasPorRol = PreferenciasAutomatizacion['rolePreferences'][Role];

const ROLES_VALIDOS: readonly Role[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY', 'FILL'];

/** Preferencias vacías usadas como último recurso si la configuración viene incompleta. */
const PREFERENCIAS_VACIAS: PreferenciasPorRol = {
  preferredChampions: [],
  fallbackChampions: [],
  banChampions: [],
  spells: [0, 0],
};

// ==========================================
// Plan de acción (lógica pura)
// ==========================================

export interface AccionPick {
  tipo: 'pick';
  actionId: number;
  championId: number;
  /** `true` bloquea el campeón; `false` solo lo muestra como hover. */
  completada: boolean;
}

export interface AccionBan {
  tipo: 'ban';
  actionId: number;
  championId: number;
  completada: boolean;
}

export interface AccionHechizos {
  tipo: 'hechizos';
  celda: number;
  spell1Id: number;
  spell2Id: number;
}

/** Acción concreta a ejecutar contra la LCU. */
export type AccionChampSelect = AccionPick | AccionBan | AccionHechizos;

/** Resultado del análisis de una sesión de Champ Select. */
export interface PlanChampSelect {
  celdaLocal: number;
  rol: Role;
  /** Campeones disponibles para pick, en orden de prioridad. */
  candidatosPick: number[];
  /** Campeones disponibles para ban, en orden de prioridad. */
  candidatosBan: number[];
  /** Acciones a ejecutar, en orden: ban → pick → hechizos. */
  acciones: AccionChampSelect[];
}

/**
 * Normaliza la posición asignada por la LCU a un rol conocido.
 * Valores vacíos o desconocidos se resuelven como `FILL`.
 */
export function normalizarRolAsignado(posicion: string | null | undefined): Role {
  const limpia = (posicion ?? '').toUpperCase();
  return (ROLES_VALIDOS as readonly string[]).includes(limpia) ? (limpia as Role) : 'FILL';
}

/** Devuelve las preferencias del rol, con `FILL` como respaldo. */
export function obtenerPreferenciasRol(
  preferencias: PreferenciasAutomatizacion,
  rol: Role
): PreferenciasPorRol {
  const porRol = preferencias?.rolePreferences ?? ({} as PreferenciasAutomatizacion['rolePreferences']);
  return porRol[rol] ?? porRol.FILL ?? PREFERENCIAS_VACIAS;
}

/** Busca la acción en curso del jugador local para un tipo (`pick`/`ban`). */
export function buscarAccionEnCurso(
  sesion: ChampSelectSession,
  celdaLocal: number,
  tipo: 'pick' | 'ban'
): ChampSelectAction | null {
  for (const fila of sesion.actions ?? []) {
    for (const accion of fila ?? []) {
      if (
        accion.actorCellId === celdaLocal &&
        accion.type === tipo &&
        Boolean(accion.isInProgress) &&
        !accion.completed
      ) {
        return accion;
      }
    }
  }
  return null;
}

function deduplicar(ids: number[]): number[] {
  return [...new Set(ids)];
}

/**
 * Resuelve, sin efectos secundarios, las acciones que el jugador local debería
 * ejecutar en la sesión dada. Devuelve `null` si el jugador local no forma
 * parte de la sesión.
 */
export function resolverPlanChampSelect(
  sesion: ChampSelectSession,
  preferencias: PreferenciasAutomatizacion,
  opciones: { objetivoRecordado?: number | null; bannableChampionIds?: number[] } = {}
): PlanChampSelect | null {
  const celdaLocal = sesion.localPlayerCellId;
  const jugadorLocal = (sesion.myTeam ?? []).find((jugador) => jugador.cellId === celdaLocal) ?? null;
  if (!jugadorLocal) {
    return null;
  }

  const rol = normalizarRolAsignado(jugadorLocal.assignedPosition);
  const preferenciasRol = obtenerPreferenciasRol(preferencias, rol);

  // Campeones prohibidos: baneos de ambos equipos.
  const baneados = new Set<number>([
    ...(sesion.bans?.myTeamBans ?? []),
    ...(sesion.bans?.theirTeamBans ?? []),
  ]);

  // Campeones comprometidos o pretendidos por los aliados (sin contar al local).
  const comprometidosAliados = new Set<number>();
  for (const aliado of sesion.myTeam ?? []) {
    if (aliado.cellId === celdaLocal) {
      continue;
    }
    if (aliado.championId > 0) {
      comprometidosAliados.add(aliado.championId);
    }
    if (aliado.championPickIntent > 0) {
      comprometidosAliados.add(aliado.championPickIntent);
    }
  }

  const candidatosPick = deduplicar([
    ...(preferenciasRol.preferredChampions ?? []),
    ...(preferenciasRol.fallbackChampions ?? []),
  ]).filter(
    (id) => id > 0 && !baneados.has(id) && !comprometidosAliados.has(id)
  );

  // Si la configuración no aporta candidatos, se respeta la intención previa del jugador.
  const candidatoPick =
    candidatosPick[0] ?? (jugadorLocal.championPickIntent > 0 ? jugadorLocal.championPickIntent : null);

  // Campeones propios que el jugador no debe banear.
  const propios = new Set<number>();
  if (jugadorLocal.championId > 0) {
    propios.add(jugadorLocal.championId);
  }
  if (jugadorLocal.championPickIntent > 0) {
    propios.add(jugadorLocal.championPickIntent);
  }
  if (candidatoPick !== null) {
    propios.add(candidatoPick);
  }

  const setBannables = opciones.bannableChampionIds && opciones.bannableChampionIds.length > 0
    ? new Set(opciones.bannableChampionIds)
    : null;

  const candidatosBan = deduplicar(preferenciasRol.banChampions ?? []).filter(
    (id) =>
      id > 0 &&
      !baneados.has(id) &&
      !comprometidosAliados.has(id) &&
      !propios.has(id) &&
      (setBannables === null || setBannables.has(id))
  );

  const acciones: AccionChampSelect[] = [];

  // 1. Ban (ocurre antes que el pick en el borrador).
  const accionBan = buscarAccionEnCurso(sesion, celdaLocal, 'ban');
  if (accionBan && preferencias.autoBan && candidatosBan.length > 0) {
    acciones.push({
      tipo: 'ban',
      actionId: accionBan.id,
      championId: candidatosBan[0],
      completada: true,
    });
  }

  // 2. Pick (hover si `autoPick` está desactivado).
  const accionPick = buscarAccionEnCurso(sesion, celdaLocal, 'pick');
  if (accionPick && candidatoPick !== null) {
    if (preferencias.autoPick) {
      acciones.push({
        tipo: 'pick',
        actionId: accionPick.id,
        championId: candidatoPick,
        completada: true,
      });
    } else if (preferencias.autoHover) {
      acciones.push({
        tipo: 'pick',
        actionId: accionPick.id,
        championId: candidatoPick,
        completada: false,
      });
    }
  }

  // 3. Hechizos de invocador (requieren un campeón en contexto).
  const hechizos = preferenciasRol.spells;
  const hayContextoCampeon =
    jugadorLocal.championId > 0 ||
    (opciones.objetivoRecordado ?? 0) > 0 ||
    (accionPick !== null && candidatoPick !== null);
  const hechizosValidos =
    Array.isArray(hechizos) && hechizos.length === 2 && hechizos.every((id) => Number.isInteger(id) && id > 0);

  if (preferencias.autoSpells && hayContextoCampeon && hechizosValidos) {
    const [spell1Id, spell2Id] = hechizos;
    if (jugadorLocal.spell1Id !== spell1Id || jugadorLocal.spell2Id !== spell2Id) {
      acciones.push({ tipo: 'hechizos', celda: celdaLocal, spell1Id, spell2Id });
    }
  }

  return { celdaLocal, rol, candidatosPick, candidatosBan, acciones };
}

// ==========================================
// Ejecución contra la LCU
// ==========================================

export interface ResultadoAccionChampSelect {
  accion: AccionChampSelect;
  exito: boolean;
  error?: string;
}

export interface ResultadoProcesamientoChampSelect {
  /** Rol resuelto para el jugador local, o `null` si no participa en la sesión. */
  rol: Role | null;
  /** Plan resuelto antes de ejecutar (útil para UI y diagnóstico). */
  plan: AccionChampSelect[];
  /** Acciones realmente enviadas a la LCU en este procesamiento. */
  ejecutadas: ResultadoAccionChampSelect[];
  /** Acciones omitidas por idempotencia (ya habían sido enviadas). */
  omitidas: number;
}

export interface OpcionesChampSelectManager {
  /** Fuente de preferencias vigentes; se consulta en cada sesión. */
  obtenerPreferencias?: () => PreferenciasAutomatizacion;
  /** Si es `true` (por defecto), se suscribe a `champ-select-session` del cliente LCU. */
  autoSuscribir?: boolean;
}

/** Clave de idempotencia de una acción de pick/ban. */
function clavePickBan(accion: AccionPick | AccionBan): string {
  return `${accion.actionId}:${accion.championId}:${accion.completada ? 1 : 0}`;
}

/**
 * Motor de automatización de Champ Select: analiza cada sesión recibida y
 * ejecuta hover, pick, ban y hechizos según la configuración vigente.
 */
export class ChampSelectManager extends EventEmitter {
  private readonly lcu: ILcuClient;
  private readonly obtenerPreferencias: () => PreferenciasAutomatizacion;
  private readonly alRecibirSesion: (sesion: ChampSelectSession | null) => void;

  private cola: Promise<void> = Promise.resolve();
  private suscrito = false;

  // Estado de idempotencia por tipo de acción.
  private clavePick: string | null = null;
  private claveBan: string | null = null;
  private claveHechizos: string | null = null;

  /** Último campeón elegido por el manager (para contextualizar hechizos). */
  private objetivoRecordado: number | null = null;
  /** Última acción procesada para evitar reintentos múltiples en la misma sesión */
  private ultimaClaveAccion: string | null = null;

  constructor(lcu: ILcuClient, opciones: OpcionesChampSelectManager = {}) {
    super();
    this.lcu = lcu;
    this.obtenerPreferencias =
      opciones.obtenerPreferencias ?? (() => DEFAULT_APP_SETTINGS.autoChampSelect as PreferenciasAutomatizacion);
    this.alRecibirSesion = (sesion) => this.encolarProcesamiento(sesion);

    if (opciones.autoSuscribir ?? true) {
      this.suscribir();
    }
  }

  /** Se suscribe al evento `champ-select-session` del cliente LCU. */
  suscribir(): void {
    if (this.suscrito) {
      return;
    }
    this.lcu.on(EVENTOS_LCU_CLIENT.CHAMP_SELECT_SESSION, this.alRecibirSesion);
    this.suscrito = true;
  }

  /** Cancela la suscripción al cliente LCU. */
  detener(): void {
    if (!this.suscrito) {
      return;
    }
    this.lcu.off(EVENTOS_LCU_CLIENT.CHAMP_SELECT_SESSION, this.alRecibirSesion);
    this.suscrito = false;
  }

  /**
   * Analiza una sesión y ejecuta el plan resultante.
   * Con `sesion === null` se limpia el estado interno (fin de la selección).
   */
  async procesarSesion(
    sesion: ChampSelectSession | null
  ): Promise<ResultadoProcesamientoChampSelect | null> {
    if (!sesion) {
      this.reiniciarEstado();
      return null;
    }

    const preferencias = this.obtenerPreferencias();
    let bannableChampionIds: number[] | undefined;
    if (preferencias.autoBan && typeof (this.lcu as any).getBannableChampionIds === 'function') {
      try {
        bannableChampionIds = await (this.lcu as any).getBannableChampionIds();
      } catch {}
    }

    const plan = resolverPlanChampSelect(sesion, preferencias, {
      objetivoRecordado: this.objetivoRecordado,
      bannableChampionIds,
    });

    if (!plan) {
      return { rol: null, plan: [], ejecutadas: [], omitidas: 0 };
    }

    const ejecutadas: ResultadoAccionChampSelect[] = [];
    let omitidas = 0;

    // Comprobar si hay turno de ban activo sin candidatos válidos
    const celdaLocal = sesion.localPlayerCellId;
    const accionBanEnCurso = buscarAccionEnCurso(sesion, celdaLocal, 'ban');
    if (accionBanEnCurso && preferencias.autoBan && plan.candidatosBan.length === 0) {
      const msg = '[AutoBan] Ningún campeón configurado está disponible para banear (ya baneados, pickeados o no elegibles).';
      registrarLog(msg);
      this.emit(EVENTOS_CHAMP_SELECT_MANAGER.ACCION_FALLIDA, {
        accion: { tipo: 'ban', actionId: accionBanEnCurso.id, championId: 0, completada: true },
        exito: false,
        error: msg,
      });
    }

    for (const accion of plan.acciones) {
      if (this.yaAplicada(accion)) {
        omitidas += 1;
        continue;
      }

      // Lógica resiliente con reintento secuencial si es BAN
      if (accion.tipo === 'ban' && accion.completada && plan.candidatosBan.length > 0) {
        let banExitoso = false;
        let ultimoError = '';

        for (let i = 0; i < Math.min(plan.candidatosBan.length, 4); i++) {
          const candidatoId = plan.candidatosBan[i];
          const nombreCamp = getChampionName(candidatoId);
          accion.championId = candidatoId;

          try {
            registrarLog(`[ChampSelect][AutoBan] Intentando banear candidato #${i + 1}: ${nombreCamp} (ID ${candidatoId}) en acción ${accion.actionId}...`);
            await this.ejecutar(accion);
            this.marcarAplicada(accion);
            banExitoso = true;
            const resultado: ResultadoAccionChampSelect = { accion, exito: true };
            ejecutadas.push(resultado);
            this.emit(EVENTOS_CHAMP_SELECT_MANAGER.ACCION_EJECUTADA, resultado);
            registrarLog(`[ChampSelect][AutoBan] ¡Ban completado y confirmado con éxito para ${nombreCamp}!`);
            break;
          } catch (err) {
            ultimoError = err instanceof Error ? err.message : String(err);
            registrarLog(`[ChampSelect][AutoBan] Falló intento de banear ${nombreCamp} (ID ${candidatoId}): ${ultimoError}. Probando siguiente candidato...`);
          }
        }

        if (!banExitoso) {
          const resultado: ResultadoAccionChampSelect = {
            accion,
            exito: false,
            error: `No se pudo bloquear ningún ban de tu lista: ${ultimoError}`,
          };
          ejecutadas.push(resultado);
          this.emit(EVENTOS_CHAMP_SELECT_MANAGER.ACCION_FALLIDA, resultado);
        }
        continue;
      }

      try {
        await this.ejecutar(accion);
        this.marcarAplicada(accion);
        const resultado: ResultadoAccionChampSelect = { accion, exito: true };
        ejecutadas.push(resultado);
        this.emit(EVENTOS_CHAMP_SELECT_MANAGER.ACCION_EJECUTADA, resultado);
      } catch (error) {
        const resultado: ResultadoAccionChampSelect = {
          accion,
          exito: false,
          error: error instanceof Error ? error.message : String(error),
        };
        ejecutadas.push(resultado);
        this.emit(EVENTOS_CHAMP_SELECT_MANAGER.ACCION_FALLIDA, resultado);
      }
    }

    return { rol: plan.rol, plan: plan.acciones, ejecutadas, omitidas };
  }

  /** Serializa las sesiones recibidas por evento para evitar ejecuciones solapadas. */
  private encolarProcesamiento(sesion: ChampSelectSession | null): void {
    this.cola = this.cola
      .then(() => this.procesarSesion(sesion))
      .then(() => undefined)
      .catch((error) => {
        this.emit(
          EVENTOS_CHAMP_SELECT_MANAGER.ACCION_FALLIDA,
          error instanceof Error ? error : new Error(String(error))
        );
      });
  }

  /** Ejecuta una acción concreta contra la LCU. */
  private async ejecutar(accion: AccionChampSelect): Promise<void> {
    switch (accion.tipo) {
      case 'pick':
        if (accion.completada) {
          const preferencias = this.obtenerPreferencias();
          const delaySeconds = typeof preferencias.pickDelaySeconds === 'number' ? preferencias.pickDelaySeconds : 1;
          const delayMs = Math.max(0, Math.min(5000, delaySeconds * 1000));
          if (typeof (this.lcu as any).lockInChampion === 'function') {
            const resultado = await (this.lcu as any).lockInChampion(accion.actionId, accion.championId, delayMs);
            if (resultado && resultado.success === false) {
              throw new Error(resultado.error || 'No se pudo confirmar el lock-in del campeón');
            }
            return;
          }
          await this.lcu.selectChampion(accion.actionId, accion.championId, accion.completada);
          return;
        } else {
          await this.lcu.selectChampion(accion.actionId, accion.championId, accion.completada);
          return;
        }
      case 'ban':
        if (accion.completada) {
          if (typeof (this.lcu as any).lockInBan === 'function') {
            const resultado = await (this.lcu as any).lockInBan(accion.actionId, accion.championId);
            if (resultado && resultado.success === false) {
              throw new Error(resultado.error || 'No se pudo confirmar el ban');
            }
            return;
          }
          await this.lcu.banChampion(accion.actionId, accion.championId, accion.completada);
          return;
        }
        await this.lcu.banChampion(accion.actionId, accion.championId, accion.completada);
        return;
      case 'hechizos':
        await this.lcu.setSummonerSpells(accion.spell1Id, accion.spell2Id);
        return;
    }
  }

  /** Indica si la acción ya fue enviada con anterioridad en esta selección. */
  private yaAplicada(accion: AccionChampSelect): boolean {
    switch (accion.tipo) {
      case 'pick':
        return this.clavePick === clavePickBan(accion);
      case 'ban':
        return this.claveBan === clavePickBan(accion);
      case 'hechizos':
        return this.claveHechizos === `${accion.spell1Id}:${accion.spell2Id}`;
    }
  }

  /** Registra una acción ejecutada para respetar la idempotencia. */
  private marcarAplicada(accion: AccionChampSelect): void {
    switch (accion.tipo) {
      case 'pick':
        this.clavePick = clavePickBan(accion);
        this.objetivoRecordado = accion.championId;
        return;
      case 'ban':
        this.claveBan = clavePickBan(accion);
        return;
      case 'hechizos':
        this.claveHechizos = `${accion.spell1Id}:${accion.spell2Id}`;
        return;
    }
  }

  /** Limpia el estado al terminar la selección de campeón. */
  private reiniciarEstado(): void {
    this.clavePick = null;
    this.claveBan = null;
    this.claveHechizos = null;
    this.objetivoRecordado = null;
  }
}
