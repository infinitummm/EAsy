/**
 * Pruebas unitarias del motor de automatización de Champ Select (T-4.1).
 * Cubre la resolución pura del plan (hover, pick, ban y hechizos), la
 * ejecución contra el contrato `ILcuClient`, la idempotencia entre sesiones
 * repetidas y la suscripción a los eventos del cliente LCU.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  EVENTOS_CHAMP_SELECT_MANAGER,
  ChampSelectManager,
  buscarAccionEnCurso,
  normalizarRolAsignado,
  obtenerPreferenciasRol,
  resolverPlanChampSelect,
  type PreferenciasAutomatizacion,
} from '../../src/main/lcu/ChampSelectManager';
import { DEFAULT_APP_SETTINGS } from '../../src/shared/constants';
import type { ILcuClient } from '../../src/shared/contracts';
import type {
  ChampSelectAction,
  ChampSelectPlayer,
  ChampSelectSession,
  Role,
} from '../../src/shared/types';

// ==========================================
// Doble de prueba del cliente LCU
// ==========================================

interface LlamadaLcu {
  metodo: string;
  argumentos: unknown[];
}

class LcuClientFalso extends EventEmitter {
  readonly llamadas: LlamadaLcu[] = [];
  readonly errores = new Map<string, Error>();
  pickableChampionIds: number[] = [266, 122, 86];
  session: ChampSelectSession | null = null;

  private registrar(metodo: string, argumentos: unknown[]): void {
    this.llamadas.push({ metodo, argumentos });
    const error = this.errores.get(metodo);
    if (error) {
      throw error;
    }
  }

  async selectChampion(actionId: number, championId: number, completed: boolean): Promise<void> {
    this.registrar('selectChampion', [actionId, championId, completed]);
  }

  async banChampion(actionId: number, championId: number, completed: boolean): Promise<void> {
    this.registrar('banChampion', [actionId, championId, completed]);
  }

  async setSummonerSpells(spell1Id: number, spell2Id: number): Promise<void> {
    this.registrar('setSummonerSpells', [spell1Id, spell2Id]);
  }

  async getPickableChampionIds(): Promise<number[]> {
    this.registrar('getPickableChampionIds', []);
    return this.pickableChampionIds;
  }

  async getChampSelectSession(): Promise<ChampSelectSession | null> {
    this.registrar('getChampSelectSession', []);
    return this.session;
  }

  async lockInChampion(
    actionId: number,
    championId: number,
    delayMs?: number
  ): Promise<{ success: boolean; actionId: number; championId: number; error?: string }> {
    this.registrar('lockInChampion', [actionId, championId, delayMs]);
    return { success: true, actionId, championId };
  }

  async lockInBan(actionId: number, championId: number): Promise<{ success: boolean; actionId: number; championId: number; error?: string }> {
    this.registrar('lockInBan', [actionId, championId]);
    return { success: true, actionId, championId };
  }

  llamadasDe(metodo: string): LlamadaLcu[] {
    return this.llamadas.filter((llamada) => llamada.metodo === metodo);
  }
}

function comoClienteLcu(falso: LcuClientFalso): ILcuClient {
  return falso as unknown as ILcuClient;
}

// ==========================================
// Datos de ejemplo
// ==========================================

function crearJugador(cambios: Partial<ChampSelectPlayer> = {}): ChampSelectPlayer {
  return {
    cellId: 0,
    championId: 0,
    championPickIntent: 0,
    assignedPosition: 'TOP',
    spell1Id: 0,
    spell2Id: 0,
    summonerId: 1,
    puuid: 'puuid-local',
    ...cambios,
  };
}

function crearAccion(cambios: Partial<ChampSelectAction> = {}): ChampSelectAction {
  return {
    id: 10,
    actorCellId: 0,
    championId: 0,
    completed: false,
    type: 'pick',
    isAllyAction: true,
    isInProgress: true,
    ...cambios,
  };
}

function crearSesion(cambios: Partial<ChampSelectSession> = {}): ChampSelectSession {
  return {
    gameId: 1,
    localPlayerCellId: 0,
    hasSimultaneousBans: false,
    hasSimultaneousPicks: false,
    isCustomGame: false,
    actions: [[crearAccion()]],
    myTeam: [crearJugador()],
    theirTeam: [],
    bans: { myTeamBans: [], theirTeamBans: [], numBans: 10 },
    timer: {
      adjustedTimeLeftInPhase: 30_000,
      internalNowInEpochMs: Date.now(),
      phase: 'BAN_PICK',
      totalTimeInPhase: 30_000,
    },
    ...cambios,
  };
}

function crearPreferencias(
  cambios: Partial<Omit<PreferenciasAutomatizacion, 'rolePreferences'>> = {},
  roles: Partial<Record<Role, Partial<PreferenciasAutomatizacion['rolePreferences'][Role]>>> = {}
): PreferenciasAutomatizacion {
  const base = structuredClone(DEFAULT_APP_SETTINGS.autoChampSelect) as PreferenciasAutomatizacion;
  const rolePreferences = { ...base.rolePreferences };

  for (const [rol, cambiosRol] of Object.entries(roles) as Array<
    [Role, Partial<PreferenciasAutomatizacion['rolePreferences'][Role]>]
  >) {
    rolePreferences[rol] = { ...rolePreferences[rol], ...cambiosRol };
  }

  return {
    ...base,
    autoHover: true,
    autoPick: false,
    autoBan: false,
    autoSpells: true,
    ...cambios,
    rolePreferences,
  };
}

// ==========================================
// Suite
// ==========================================

describe('ChampSelectManager (T-4.1)', () => {
  let cliente: LcuClientFalso;

  beforeEach(() => {
    cliente = new LcuClientFalso();
  });

  describe('utilidades de resolución', () => {
    it('normaliza posiciones conocidas y resuelve desconocidas como FILL', () => {
      expect(normalizarRolAsignado('TOP')).toBe('TOP');
      expect(normalizarRolAsignado('middle')).toBe('MIDDLE');
      expect(normalizarRolAsignado('UTILITY')).toBe('UTILITY');
      expect(normalizarRolAsignado('')).toBe('FILL');
      expect(normalizarRolAsignado(null)).toBe('FILL');
      expect(normalizarRolAsignado('SUPPORT')).toBe('FILL');
    });

    it('devuelve las preferencias del rol y usa FILL como respaldo', () => {
      const preferencias = crearPreferencias();
      expect(obtenerPreferenciasRol(preferencias, 'JUNGLE')).toBe(preferencias.rolePreferences.JUNGLE);

      const incompletas = {
        ...preferencias,
        rolePreferences: { FILL: preferencias.rolePreferences.FILL },
      } as unknown as PreferenciasAutomatizacion;

      expect(obtenerPreferenciasRol(incompletas, 'TOP')).toBe(incompletas.rolePreferences.FILL);
    });

    it('localiza solo la acción en curso del jugador local y del tipo pedido', () => {
      const completada = crearAccion({ id: 1, completed: true });
      const ajena = crearAccion({ id: 2, actorCellId: 3 });
      const ban = crearAccion({ id: 3, type: 'ban' });
      const pick = crearAccion({ id: 4 });
      const sesion = crearSesion({
        // Fila con acciones que deben descartarse + la acción válida.
        actions: [[completada, ajena, ban], [pick]],
      });

      expect(buscarAccionEnCurso(sesion, 0, 'pick')?.id).toBe(4);
      expect(buscarAccionEnCurso(sesion, 0, 'ban')?.id).toBe(3);
      expect(buscarAccionEnCurso(sesion, 1, 'pick')).toBeNull();
    });

    it('devuelve null si el jugador local no está en la sesión', () => {
      const sesion = crearSesion({ myTeam: [crearJugador({ cellId: 2 })] });
      expect(resolverPlanChampSelect(sesion, crearPreferencias())).toBeNull();
    });
  });

  describe('resolución del plan', () => {
    it('planea un hover con el primer campeón preferido disponible', () => {
      const preferencias = crearPreferencias(
        { autoSpells: false },
        { TOP: { preferredChampions: [266, 122] } }
      );
      const plan = resolverPlanChampSelect(crearSesion(), preferencias);

      expect(plan?.rol).toBe('TOP');
      expect(plan?.candidatosPick).toEqual([266, 122]);
      expect(plan?.acciones).toEqual([
        { tipo: 'pick', actionId: 10, championId: 266, completada: false },
      ]);
    });

    it('planea un pick completado cuando autoPick está activo', () => {
      const preferencias = crearPreferencias(
        { autoPick: true, autoSpells: false },
        { TOP: { preferredChampions: [266] } }
      );
      const plan = resolverPlanChampSelect(crearSesion(), preferencias);

      expect(plan?.acciones).toEqual([
        { tipo: 'pick', actionId: 10, championId: 266, completada: true },
      ]);
    });

    it('no planea pick si hover y pick automáticos están desactivados', () => {
      const preferencias = crearPreferencias(
        { autoHover: false, autoPick: false, autoSpells: false },
        { TOP: { preferredChampions: [266] } }
      );
      const plan = resolverPlanChampSelect(crearSesion(), preferencias);

      expect(plan?.acciones).toEqual([]);
    });

    it('usa campeones de respaldo cuando los preferidos están baneados', () => {
      const preferencias = crearPreferencias(
        {},
        { TOP: { preferredChampions: [266], fallbackChampions: [122, 86] } }
      );
      const sesion = crearSesion({
        bans: { myTeamBans: [266], theirTeamBans: [], numBans: 10 },
      });

      const plan = resolverPlanChampSelect(sesion, preferencias);
      expect(plan?.candidatosPick).toEqual([122, 86]);
      expect(plan?.acciones[0]).toMatchObject({ championId: 122, completada: false });
    });

    it('excluye los pickeos e intenciones de los aliados', () => {
      const preferencias = crearPreferencias(
        {},
        { TOP: { preferredChampions: [266, 122, 86] } }
      );
      const sesion = crearSesion({
        myTeam: [
          crearJugador(),
          crearJugador({ cellId: 1, championId: 266 }),
          crearJugador({ cellId: 2, championPickIntent: 122 }),
        ],
      });

      const plan = resolverPlanChampSelect(sesion, preferencias);
      expect(plan?.candidatosPick).toEqual([86]);
      expect(plan?.acciones[0]).toMatchObject({ championId: 86 });
    });

    it('planea el ban del primer campeón configurado que no esté comprometido', () => {
      const preferencias = crearPreferencias(
        { autoBan: true },
        { TOP: { preferredChampions: [266], banChampions: [266, 84, 103] } }
      );
      const sesion = crearSesion({
        actions: [[crearAccion({ id: 20, type: 'ban' })]],
        myTeam: [crearJugador(), crearJugador({ cellId: 1, championPickIntent: 84 })],
      });

      const plan = resolverPlanChampSelect(sesion, preferencias);
      expect(plan?.candidatosBan).toEqual([103]);
      expect(plan?.acciones).toContainEqual({
        tipo: 'ban',
        actionId: 20,
        championId: 103,
        completada: true,
      });
    });

    it('no planea ban si la lista de baneos está vacía', () => {
      const preferencias = crearPreferencias(
        { autoBan: true },
        { TOP: { preferredChampions: [266] } }
      );
      const sesion = crearSesion({ actions: [[crearAccion({ id: 20, type: 'ban' })]] });

      const plan = resolverPlanChampSelect(sesion, preferencias);
      expect(plan?.acciones).toEqual([]);
    });

    it('planea los hechizos del rol cuando hay un campeón en contexto', () => {
      const preferencias = crearPreferencias(
        {},
        { TOP: { preferredChampions: [266], spells: [4, 12] } }
      );
      const sesion = crearSesion({ myTeam: [crearJugador({ championId: 266 })] });

      const plan = resolverPlanChampSelect(sesion, preferencias);
      expect(plan?.acciones).toContainEqual({
        tipo: 'hechizos',
        celda: 0,
        spell1Id: 4,
        spell2Id: 12,
      });
    });

    it('no repite hechizos si ya coinciden con los del jugador', () => {
      const preferencias = crearPreferencias(
        {},
        { TOP: { preferredChampions: [266], spells: [4, 12] } }
      );
      const sesion = crearSesion({
        myTeam: [crearJugador({ championId: 266, spell1Id: 4, spell2Id: 12 })],
      });

      const plan = resolverPlanChampSelect(sesion, preferencias);
      expect(plan?.acciones.some((accion) => accion.tipo === 'hechizos')).toBe(false);
    });

    it('usa las preferencias FILL cuando el rol asignado no es válido', () => {
      const preferencias = crearPreferencias(
        {},
        {
          TOP: { preferredChampions: [266] },
          FILL: { preferredChampions: [122] },
        }
      );
      const sesion = crearSesion({
        myTeam: [crearJugador({ assignedPosition: '' as Role })],
      });

      const plan = resolverPlanChampSelect(sesion, preferencias);
      expect(plan?.rol).toBe('FILL');
      expect(plan?.acciones[0]).toMatchObject({ championId: 122 });
    });
  });

  describe('procesamiento de sesiones', () => {
    it('ejecuta el hover contra el cliente LCU', async () => {
      const preferencias = crearPreferencias(
        { autoSpells: false },
        { TOP: { preferredChampions: [266] } }
      );
      const manager = new ChampSelectManager(comoClienteLcu(cliente), {
        obtenerPreferencias: () => preferencias,
        autoSuscribir: false,
      });

      const resultado = await manager.procesarSesion(crearSesion());

      expect(cliente.llamadasDe('selectChampion')).toEqual([
        { metodo: 'selectChampion', argumentos: [10, 266, false] },
      ]);
      expect(resultado?.rol).toBe('TOP');
      expect(resultado?.ejecutadas).toHaveLength(1);
    });

    it('ejecuta pick, ban y hechizos en una misma sesión', async () => {
      const preferencias = crearPreferencias(
        { autoPick: true, autoBan: true, pickDelaySeconds: 0 },
        { TOP: { preferredChampions: [266], banChampions: [84], spells: [4, 12] } }
      );
      const sesion = crearSesion({
        actions: [
          [crearAccion({ id: 20, type: 'ban' })],
          [crearAccion({ id: 30, type: 'pick' })],
        ],
      });
      const manager = new ChampSelectManager(comoClienteLcu(cliente), {
        obtenerPreferencias: () => preferencias,
        autoSuscribir: false,
      });

      await manager.procesarSesion(sesion);

      expect(cliente.llamadasDe('lockInBan')).toEqual([
        { metodo: 'lockInBan', argumentos: [20, 84] },
      ]);
      expect(cliente.llamadasDe('lockInChampion')).toEqual([
        { metodo: 'lockInChampion', argumentos: [30, 266, 0] },
      ]);
      expect(cliente.llamadasDe('setSummonerSpells')).toEqual([
        { metodo: 'setSummonerSpells', argumentos: [4, 12] },
      ]);
    });

    it('no repite acciones idénticas entre sesiones consecutivas', async () => {
      const preferencias = crearPreferencias(
        { autoSpells: false },
        { TOP: { preferredChampions: [266] } }
      );
      const manager = new ChampSelectManager(comoClienteLcu(cliente), {
        obtenerPreferencias: () => preferencias,
        autoSuscribir: false,
      });
      const sesion = crearSesion();

      const primero = await manager.procesarSesion(sesion);
      const segundo = await manager.procesarSesion(sesion);

      expect(primero?.omitidas).toBe(0);
      expect(segundo?.omitidas).toBe(1);
      expect(segundo?.ejecutadas).toHaveLength(0);
      expect(cliente.llamadasDe('selectChampion')).toHaveLength(1);
    });

    it('limpia la idempotencia al recibir una sesión nula', async () => {
      const preferencias = crearPreferencias({}, { TOP: { preferredChampions: [266] } });
      const manager = new ChampSelectManager(comoClienteLcu(cliente), {
        obtenerPreferencias: () => preferencias,
        autoSuscribir: false,
      });
      const sesion = crearSesion();

      await manager.procesarSesion(sesion);
      await manager.procesarSesion(null);
      await manager.procesarSesion(sesion);

      expect(cliente.llamadasDe('selectChampion')).toHaveLength(2);
    });

    it('informa de fallos sin lanzar y permite reintentar en la sesión siguiente', async () => {
      const preferencias = crearPreferencias({}, { TOP: { preferredChampions: [266] } });
      const manager = new ChampSelectManager(comoClienteLcu(cliente), {
        obtenerPreferencias: () => preferencias,
        autoSuscribir: false,
      });
      const fallos: unknown[] = [];
      manager.on(EVENTOS_CHAMP_SELECT_MANAGER.ACCION_FALLIDA, (resultado) => fallos.push(resultado));

      cliente.errores.set('selectChampion', new Error('LCU no disponible'));
      const resultado = await manager.procesarSesion(crearSesion());

      expect(resultado?.ejecutadas[0]).toMatchObject({ exito: false, error: 'LCU no disponible' });
      expect(fallos).toHaveLength(1);

      cliente.errores.delete('selectChampion');
      await manager.procesarSesion(crearSesion());
      expect(cliente.llamadasDe('selectChampion')).toHaveLength(2);
    });

    it('devuelve un resultado neutro si el jugador local no está en la sesión', async () => {
      const manager = new ChampSelectManager(comoClienteLcu(cliente), {
        obtenerPreferencias: () => crearPreferencias(),
        autoSuscribir: false,
      });

      const resultado = await manager.procesarSesion(
        crearSesion({ myTeam: [crearJugador({ cellId: 2 })] })
      );

      expect(resultado).toEqual({ rol: null, plan: [], ejecutadas: [], omitidas: 0 });
      expect(cliente.llamadas).toHaveLength(0);
    });

    it('emite accion-ejecutada por cada acción aplicada', async () => {
      const preferencias = crearPreferencias(
        { autoSpells: false },
        { TOP: { preferredChampions: [266] } }
      );
      const manager = new ChampSelectManager(comoClienteLcu(cliente), {
        obtenerPreferencias: () => preferencias,
        autoSuscribir: false,
      });
      const eventos: unknown[] = [];
      manager.on(EVENTOS_CHAMP_SELECT_MANAGER.ACCION_EJECUTADA, (resultado) => eventos.push(resultado));

      await manager.procesarSesion(crearSesion());

      expect(eventos).toHaveLength(1);
      expect(eventos[0]).toMatchObject({
        exito: true,
        accion: { tipo: 'pick', championId: 266 },
      });
    });
  });

  describe('suscripción al cliente LCU', () => {
    it('procesa automáticamente las sesiones emitidas por el cliente', async () => {
      const preferencias = crearPreferencias({}, { TOP: { preferredChampions: [266] } });
      const manager = new ChampSelectManager(comoClienteLcu(cliente), {
        obtenerPreferencias: () => preferencias,
      });

      cliente.emit('champ-select-session', crearSesion());
      await new Promise((resolver) => setTimeout(resolver, 0));

      expect(cliente.llamadasDe('selectChampion')).toHaveLength(1);

      manager.detener();
      cliente.emit('champ-select-session', crearSesion());
      await new Promise((resolver) => setTimeout(resolver, 0));

      expect(cliente.llamadasDe('selectChampion')).toHaveLength(1);
    });
  });
});
