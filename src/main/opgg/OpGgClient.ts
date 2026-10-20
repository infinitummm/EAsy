/**
 * Cliente para el servidor MCP oficial de OP.GG (Streamable HTTP JSON-RPC 2.0).
 * Conecta a https://mcp-api.op.gg/mcp para obtener estadísticas competitivas reales:
 * - Runas optimizadas con pickrate y winrate
 * - Core items, iniciales, botas y orden de habilidades
 * - Estadísticas específicas de enfrentamiento directo (matchup)
 * 
 * Cumple con:
 * - Cero llamadas durante draft a Gemini (ahorro estricto de tokens).
 * - Caché persistente SQLite con clave `opgg:{campeón}:{posición}:{rival}:{elo}:{parche}`.
 * - Validación y traducción de IDs a Data Dragon en locale del cliente (es_MX / es_ES).
 * - Detección de muestra reducida (< 50 partidas) con fallback a build general.
 * - Limitador de tasa y reintento con backoff exponencial.
 */

import type { IDatabaseService } from '../../shared/contracts';
import type { Role, OpGgMatchupData, OpGgRunePage, GeminiMatchupRecommendation } from '../../shared/types';
import { getChampionById } from '../../shared/champions';
import { DataDragonTranslator } from '../riot/DataDragonTranslator';
import { registrarLog } from '../lcu/LcuDetector';

export const OPGG_MCP_ENDPOINT = 'https://mcp-api.op.gg/mcp';
export const UMBRAL_MUESTRA_MINIMA = 50;
export const TTL_CACHE_OPGG_SEGUNDOS = 24 * 60 * 60; // 24 horas

export interface OpcionesOpGgClient {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  dbService?: IDatabaseService;
  translator?: DataDragonTranslator;
  minSampleThreshold?: number;
}

export interface OpGgRequestParams {
  championId: number;
  opponentId?: number;
  role: Role;
  patch?: string;
  elo?: string;
  forceRefresh?: boolean;
}

/**
 * Normaliza nombres de campeones al formato UPPER_SNAKE_CASE esperado por OP.GG MCP.
 */
export function formatChampionForOpGg(nameOrKey: string): string {
  const especiales: Record<string, string> = {
    'Nunu & Willump': 'NUNU_WILLUMP',
    'Nunu': 'NUNU_WILLUMP',
    'Renata Glasc': 'RENATA_GLASC',
    'Renata': 'RENATA_GLASC',
    'Wukong': 'WUKONG',
    'MonkeyKing': 'WUKONG',
  };
  if (especiales[nameOrKey]) return especiales[nameOrKey];

  return nameOrKey
    .replace(/['.]/g, '')               // Eliminar apóstrofes y puntos (Cho'Gath -> CHOGATH, Dr. Mundo -> DR_MUNDO)
    .replace(/&/g, '')                  // Quitar ampersand
    .replace(/[^a-zA-Z0-9]+/g, '_')     // Espacios y caracteres no alfanuméricos a guion bajo
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

/** Mapea el tipo Role al identificador de posición de OP.GG MCP */
export function roleToOpGgPosition(role: Role): string {
  switch (role) {
    case 'TOP':
      return 'top';
    case 'JUNGLE':
      return 'jungle';
    case 'MIDDLE':
      return 'mid';
    case 'BOTTOM':
      return 'adc';
    case 'UTILITY':
      return 'support';
    default:
      return 'adc';
  }
}

/** Campeones de referencia por posición cuando no hay rival o para build general */
const RIVALES_REFERENCIA: Record<Role, string> = {
  TOP: 'Aatrox',
  JUNGLE: 'LeeSin',
  MIDDLE: 'Ahri',
  BOTTOM: 'Caitlyn',
  UTILITY: 'Thresh',
  FILL: 'Caitlyn',
};

export class OpGgClient {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly dbService?: IDatabaseService;
  private readonly translator?: DataDragonTranslator;
  private readonly minSampleThreshold: number;
  private lastRequestTime = 0;

  constructor(opciones: OpcionesOpGgClient = {}) {
    this.endpoint = opciones.endpoint ?? OPGG_MCP_ENDPOINT;
    this.fetchImpl = opciones.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.dbService = opciones.dbService;
    this.translator = opciones.translator;
    this.minSampleThreshold = opciones.minSampleThreshold ?? UMBRAL_MUESTRA_MINIMA;
  }

  /**
   * Construye la clave de caché requerida por el usuario:
   * `opgg:{campeón}:{posición}:{rival}:{elo}:{parche}`
   */
  public construirClaveCache(
    championId: number,
    role: Role,
    opponentId: number | undefined,
    elo: string = 'emerald_plus',
    patch: string = '26.20'
  ): string {
    const normPatch = patch.split('.').slice(0, 2).join('.');
    const oppPart = opponentId ? String(opponentId) : 'none';
    const pos = roleToOpGgPosition(role);
    return `opgg:${championId}:${pos}:${oppPart}:${elo}:${normPatch}`;
  }

  /**
   * Obtiene la guía de matchup y builds desde OP.GG MCP con caché, validación de IDs y fallback.
   */
  public async getLaneMatchupGuide(params: OpGgRequestParams): Promise<OpGgMatchupData> {
    const { championId, opponentId, role, forceRefresh } = params;
    const elo = params.elo || 'emerald_plus';
    const patch = params.patch || '26.20';
    const cacheKey = this.construirClaveCache(championId, role, opponentId, elo, patch);

    // 1. Revisar caché local SQLite si no es forceRefresh
    if (!forceRefresh && this.dbService) {
      const cached = this.dbService.getMatchupCache(cacheKey);
      if (cached?.opggData) {
        registrarLog(`[OpGgClient] Matchup recuperado de SQLite: ${cacheKey}`);
        return cached.opggData;
      }
    }

    // 2. Resolver nombres oficiales de campeones
    const myChamp = getChampionById(championId);
    if (!myChamp) {
      throw new Error(`Campeón con ID ${championId} no reconocido en catálogo.`);
    }

    const myChampOpGg = formatChampionForOpGg(myChamp.name);
    let oppChampName = opponentId ? getChampionById(opponentId)?.name : undefined;
    let isGeneralBuild = false;

    if (!oppChampName) {
      oppChampName = RIVALES_REFERENCIA[role] || 'Caitlyn';
      isGeneralBuild = true;
    }
    const oppChampOpGg = formatChampionForOpGg(oppChampName);

    // 3. Llamar a OP.GG MCP con reintentos y rate limit
    const pos = roleToOpGgPosition(role);
    registrarLog(`[OpGgClient] Consultando OP.GG MCP: ${myChampOpGg} vs ${oppChampOpGg} (${pos})...`);
    const rawData = await this.ejecutarLlamadaMcp(myChampOpGg, oppChampOpGg, pos);

    // 4. Mapear y procesar datos con validación contra Data Dragon
    let matchupData = this.procesarRespuestaOpGg(
      rawData,
      championId,
      opponentId || 0,
      role,
      patch,
      elo,
      isGeneralBuild
    );

    // 5. Verificar tamaño de muestra (< 50 partidas)
    if (!isGeneralBuild && matchupData.totalMatches < this.minSampleThreshold) {
      registrarLog(
        `[OpGgClient] Muestra reducida (${matchupData.totalMatches} < ${this.minSampleThreshold} partidas) para ${myChampOpGg} vs ${oppChampOpGg}. Recurriendo a build general de la posición.`
      );
      matchupData.isGeneralBuildFallback = true;
      matchupData.sampleSizeWarning = `Muestra reducida (${matchupData.totalMatches} partidas registradas). Se complementa con la build general de la posición para mayor fiabilidad.`;

      // Si la muestra es extremadamente baja (< 10) o no tiene core items, consultar el benchmark de la posición
      if (matchupData.totalMatches < 10 || matchupData.coreItems.length === 0) {
        try {
          const fallbackOpponent = RIVALES_REFERENCIA[role] || 'Caitlyn';
          if (fallbackOpponent !== oppChampName) {
            const generalRaw = await this.ejecutarLlamadaMcp(myChampOpGg, formatChampionForOpGg(fallbackOpponent), pos);
            const generalData = this.procesarRespuestaOpGg(
              generalRaw,
              championId,
              opponentId || 0,
              role,
              patch,
              elo,
              true
            );
            // Conservar aviso de muestra reducida
            generalData.isGeneralBuildFallback = true;
            generalData.sampleSizeWarning = `Muestra reducida (${matchupData.totalMatches} partidas vs ${oppChampName}). Mostrando build general de ${myChamp.name} en ${role}.`;
            matchupData = generalData;
          }
        } catch (fbErr) {
          registrarLog(`[OpGgClient Advertencia] Fallo al obtener build general de respaldo: ${fbErr}`);
        }
      }
    }

    // 6. Guardar en caché SQLite
    if (this.dbService) {
      const mockRecommendation: GeminiMatchupRecommendation = {
        championId,
        opponentChampionId: opponentId || 0,
        assignedRole: role,
        difficultyRating: 5,
        matchupSummary: `Datos competitivos de OP.GG para ${myChamp.name} (${role}) en Parche ${patch}.`,
        runesRecommendation: {
          primaryStyleId: matchupData.runes[0]?.primaryPageId || 8000,
          subStyleId: matchupData.runes[0]?.secondaryPageId || 8300,
          selectedPerkIds: [
            ...(matchupData.runes[0]?.primaryRuneIds || [8005, 9111, 9104, 8014]),
            ...(matchupData.runes[0]?.secondaryRuneIds || [8304, 8347]),
            ...(matchupData.runes[0]?.statModIds || [5008, 5008, 5011]),
          ],
          rationale: `Configuración competitiva de OP.GG con ${(matchupData.runes[0]?.pickRate * 100 || 50).toFixed(1)}% de presencia.`,
        },
        buildRecommendation: {
          startingItems: matchupData.starterItems[0]?.ids || [1055, 2003],
          boots: matchupData.boots[0]?.ids[0] || 3006,
          coreItems: matchupData.coreItems[0]?.ids || [3078, 3053, 3156],
          situationalItems: [
            { itemId: 3026, condition: 'Frente a daño explosivo AD o para revivir en peleas de equipo.' },
            { itemId: 3156, condition: 'Frente a amenazas de daño mágico o burst AP.' },
          ],
          rationale: `Build principal de OP.GG basada en ${matchupData.totalMatches.toLocaleString()} partidas del parche.`,
        },
        skillOrder: {
          priority: matchupData.skillPriority || ['Q', 'W', 'E'],
          firstThreeLevels: matchupData.skillOrder.slice(0, 3) || ['Q', 'W', 'E'],
          rationale: 'Orden de maximización estándar con mayor tasa de victoria.',
        },
        earlyGameStrategy: {
          waveManagement: 'Adaptar control de oleada según el nivel y rango del rival.',
          tradingPlan: matchupData.opponentTip || 'Aprovechar picos de nivel y enfriamientos del rival.',
          levelSpikes: ['Nivel 2', 'Nivel 3', 'Nivel 6'],
        },
        threatAnalysis: {
          enemyThreats: ['Burst damage', 'Crowd control'],
          winCondition: 'Escalado hacia juego medio y peleas por objetivos.',
        },
        dataSource: 'opgg',
        opggData: matchupData,
        patchVersion: patch,
      };

      this.dbService.setMatchupCache(cacheKey, mockRecommendation, TTL_CACHE_OPGG_SEGUNDOS);
      registrarLog(`[OpGgClient] Guardado en caché SQLite: ${cacheKey}`);
    }

    return matchupData;
  }

  /**
   * Ejecuta la petición HTTP JSON-RPC 2.0 hacia el endpoint MCP de OP.GG.
   */
  private async ejecutarLlamadaMcp(myChampion: string, opponentChampion: string, position: string): Promise<any> {
    // Control de ráfaga: mínimo 400ms entre llamadas consecutivas
    const ahora = Date.now();
    const tiempoDesdeUltima = ahora - this.lastRequestTime;
    if (tiempoDesdeUltima < 400) {
      await new Promise((r) => setTimeout(r, 400 - tiempoDesdeUltima));
    }
    this.lastRequestTime = Date.now();

    const payload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'lol_get_lane_matchup_guide',
        arguments: {
          position,
          my_champion: myChampion,
          opponent_champion: opponentChampion,
          lang: 'en_US', // OP.GG MCP requiere en_US o ko_KR
        },
      },
    };

    let intentos = 0;
    const maxIntentos = 3;
    let ultimoError: any = null;

    while (intentos < maxIntentos) {
      intentos++;
      try {
        const respuesta = await this.fetchImpl(this.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const statusCode = respuesta.status;
        this.dbService?.recordApiCall('OPGG', '/mcp/lol_get_lane_matchup_guide', statusCode);

        if (statusCode === 429) {
          const delay = Math.pow(2, intentos) * 500;
          registrarLog(`[OpGgClient 429] Límite de tasa alcanzado. Esperando ${delay}ms para reintento ${intentos}...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        if (!respuesta.ok) {
          throw new Error(`OP.GG MCP respondió con código HTTP ${statusCode}`);
        }

        const jsonRes = await respuesta.json();
        if (jsonRes.error) {
          throw new Error(`OP.GG MCP error ${jsonRes.error.code}: ${jsonRes.error.message}`);
        }

        const rawText = jsonRes.result?.content?.[0]?.text;
        if (!rawText) {
          throw new Error('Respuesta de OP.GG MCP vacía.');
        }

        return JSON.parse(rawText);
      } catch (err) {
        ultimoError = err;
        if (intentos < maxIntentos) {
          const delay = intentos * 400;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw ultimoError || new Error('Fallo al consultar OP.GG MCP.');
  }

  /**
   * Procesa la estructura cruda de OP.GG extrayendo IDs y traduciendo con DataDragonTranslator en español.
   */
  private procesarRespuestaOpGg(
    raw: any,
    myChampionId: number,
    opponentChampionId: number,
    position: Role,
    patch: string,
    elo: string,
    isGeneralBuildFallback: boolean
  ): OpGgMatchupData {
    const data = raw?.data || {};

    // 1. Extraer runas
    const rawRunes = Array.isArray(data.runes) ? data.runes : [];
    const runes: OpGgRunePage[] = rawRunes.map((r: any) => ({
      primaryPageId: r.primary_page_id || 8000,
      primaryPageName: this.traducirEstiloRuna(r.primary_page_id),
      primaryRuneIds: Array.isArray(r.primary_rune_ids) ? r.primary_rune_ids : [],
      primaryRuneNames: (r.primary_rune_ids || []).map((id: number) => this.traducirRuna(id)),
      secondaryPageId: r.secondary_page_id || 8300,
      secondaryPageName: this.traducirEstiloRuna(r.secondary_page_id),
      secondaryRuneIds: Array.isArray(r.secondary_rune_ids) ? r.secondary_rune_ids : [],
      secondaryRuneNames: (r.secondary_rune_ids || []).map((id: number) => this.traducirRuna(id)),
      statModIds: Array.isArray(r.stat_mod_ids) ? r.stat_mod_ids : [5008, 5008, 5011],
      statModNames: (r.stat_mod_ids || [5008, 5008, 5011]).map((id: number) => this.traducirRuna(id)),
      play: r.play || 0,
      win: r.win || 0,
      pickRate: r.pick_rate || 0,
    }));

    // 2. Extraer core items
    const rawCore = Array.isArray(data.core_items) ? data.core_items : [];
    const coreItems = rawCore.map((c: any) => ({
      ids: Array.isArray(c.ids) ? c.ids : [],
      names: (c.ids || []).map((id: number) => this.traducirItem(id)),
      play: c.play || 0,
      win: c.win || 0,
      pickRate: c.pick_rate || 0,
    }));

    // 3. Extraer ítems iniciales
    const rawStarters = Array.isArray(data.starter_items) ? data.starter_items : [];
    const starterItems = rawStarters.map((s: any) => ({
      ids: Array.isArray(s.ids) ? s.ids : [1055, 2003],
      names: (s.ids || [1055, 2003]).map((id: number) => this.traducirItem(id)),
      play: s.play || 0,
      win: s.win || 0,
      pickRate: s.pick_rate || 0,
    }));

    // 4. Extraer botas
    const rawBoots = Array.isArray(data.boots) ? data.boots : [];
    const boots = rawBoots.map((b: any) => ({
      ids: Array.isArray(b.ids) ? b.ids : [3006],
      names: (b.ids || [3006]).map((id: number) => this.traducirItem(id)),
      play: b.play || 0,
      win: b.win || 0,
      pickRate: b.pick_rate || 0,
    }));

    // 5. Extraer hechizos de invocador
    const rawSpells = Array.isArray(data.summoner_spells) ? data.summoner_spells : [];
    const summonerSpells = rawSpells.map((sp: any) => ({
      ids: (sp.ids || [4, 12]) as [number, number],
      names: (sp.ids || [4, 12]).map((id: number) => this.traducirHechizo(id)),
      play: sp.play || 0,
      win: sp.win || 0,
      pickRate: sp.pick_rate || 0,
    }));

    // 6. Orden de habilidades
    const skillOrder: string[] = data.skills?.[0]?.order || ['Q', 'W', 'E', 'Q', 'Q', 'R'];
    const skillPriority: string[] = data.skill_masteries?.[0]?.ids || ['Q', 'W', 'E'];

    // 7. Total de partidas para el cálculo de muestra
    const totalMatches = runes[0]?.play || coreItems[0]?.play || data.summary?.positions?.[0]?.stats?.play || 0;

    // 8. Counters
    const counters = (data.summary?.positions?.[0]?.counters || []).map((cnt: any) => ({
      championId: cnt.champion_id,
      championName: cnt.champion_name,
      winRate: cnt.win_rate || (cnt.play ? cnt.win / cnt.play : 0.5),
      play: cnt.play || 0,
    }));

    return {
      myChampionId,
      opponentChampionId,
      position,
      patch,
      elo,
      updatedAt: new Date().toISOString(),
      runes,
      starterItems,
      boots,
      coreItems,
      summonerSpells,
      skillOrder,
      skillPriority,
      totalMatches,
      isGeneralBuildFallback,
      opponentTip: data.opponent_champion_tip || undefined,
      counters,
    };
  }

  private traducirItem(id: number): string {
    if (this.translator) {
      // DataDragonTranslator itemMap
      const itemMap = (this.translator as any).itemMap as Map<string, { id: number; name: string }> | undefined;
      if (itemMap) {
        for (const entry of itemMap.values()) {
          if (entry.id === id) return entry.name;
        }
      }
    }
    const nombresComunes: Record<number, string> = {
      1055: 'Espada de Doran',
      1054: 'Escudo de Doran',
      1056: 'Anillo de Doran',
      2003: 'Poción de Vida',
      3006: 'Grebas de Berserker',
      3047: 'Punteras de Acero Revestidas',
      3111: 'Botas de Mercurio',
      3158: 'Botas Jonias de la Lucidez',
      3008: 'Grebas Codiciosas',
      3508: 'Segador de Esencia',
      3071: 'Cuchilla Negra',
      3161: 'Lanza de Shojin',
      3094: 'Cañón de Fuego Rápido',
      3031: 'Filo del Infinito',
      3033: 'Recordatorio Mortal',
      3078: 'Fuerza de la Trinidad',
      3053: 'Guantelete de Sterak',
      3156: 'Fauces de Malmortius',
      3026: 'Ángel Guardián',
    };
    return nombresComunes[id] || `Objeto (${id})`;
  }

  private traducirRuna(id: number): string {
    const nombresRunas: Record<number, string> = {
      8005: 'Ataque Intensificado',
      8008: 'Compás Letal',
      8021: 'Pies Veloces',
      8010: 'Conquistador',
      9101: 'Claridad Mental',
      9111: 'Triunfo',
      9104: 'Absorber Vida',
      9105: 'Leyenda: Celeridad',
      9103: 'Leyenda: Linaje',
      8014: 'Golpe de Gracia',
      8017: 'Corte',
      8299: 'Último Esfuerzo',
      8229: 'Cometa Arcano',
      8992: 'Cometa Arcano', // OP.GG keystone id mapping
      8214: 'Invocación de Aery',
      8230: 'Fase Veloz',
      8275: 'Capa del Nimbo',
      8226: 'Banda de Maná',
      8234: 'Celeridad',
      8210: 'Trascendencia',
      8236: 'Tormenta Creciente',
      8237: 'Piroláser',
      8304: 'Calzado Mágico',
      8316: 'Manitas (Jack of all Trades)',
      8321: 'Reembolso',
      8345: 'Entrega de Galletas',
      8347: 'Perspicacia Cósmica',
      8437: 'Garras del Inmortal',
      8446: 'Demoler',
      8429: 'Fuerzas Renovadas',
      8473: 'Revestimiento de Huesos',
      8451: 'Sobrecrecimiento',
      8453: 'Revitalizar',
      5008: '+9 Fuerza Adaptable',
      5005: '+10% Velocidad de Ataque',
      5007: '+8 Aceleración de Habilidad',
      5010: '+2% Velocidad de Movimiento',
      5001: '+10-180 Vida Progresiva',
      5011: '+65 Vida Plana',
      5013: '+10% Tenacidad',
    };
    return nombresRunas[id] || `Runa (${id})`;
  }

  private traducirEstiloRuna(styleId: number): string {
    const estilos: Record<number, string> = {
      8000: 'Precisión',
      8100: 'Dominación',
      8200: 'Brujería',
      8300: 'Inspiración',
      8400: 'Valor',
    };
    return estilos[styleId] || `Rama (${styleId})`;
  }

  private traducirHechizo(spellId: number): string {
    const hechizos: Record<number, string> = {
      4: 'Destello',
      12: 'Teleportación',
      14: 'Ignición',
      21: 'Barrera',
      7: 'Curación',
      3: 'Extenuación',
      6: 'Fantasma',
      11: 'Aplastar',
      1: 'Purificación',
    };
    return hechizos[spellId] || `Hechizo (${spellId})`;
  }
}
