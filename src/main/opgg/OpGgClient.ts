/**
 * Cliente para el servidor MCP oficial de OP.GG (Streamable HTTP JSON-RPC 2.0).
 * Conecta a https://mcp-api.op.gg/mcp para obtener estadísticas competitivas reales:
 * - Build base oficial con filtro de Elo (Esmeralda+) vía lol_get_champion_analysis
 * - Guía de enfrentamiento directo (matchup: todos los rangos) vía lol_get_lane_matchup_guide
 * - Runas optimizadas, core items, 4° a 6° objeto, botas y starter items (incluido Atlas Mundial para soporte)
 * - Regla determinista de elección (mayor winrate con muestra suficiente; desempate por pick rate)
 * - Caché persistente SQLite separada para general y matchup
 * - Precalentamiento de campeones preferidos
 */

import type { IDatabaseService } from '../../shared/contracts';
import type { Role, OpGgMatchupData, OpGgRunePage, GeminiMatchupRecommendation } from '../../shared/types';
import { getChampionById } from '../../shared/champions';
import { DataDragonTranslator } from '../riot/DataDragonTranslator';
import { registrarLog } from '../lcu/LcuDetector';

export const OPGG_MCP_ENDPOINT = 'https://mcp-api.op.gg/mcp';
export const UMBRAL_MUESTRA_MINIMA = 200; // REQ-023: umbral predeterminado de 200 partidas
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
    'K\'Sante': 'KSANTE',
    'Cho\'Gath': 'CHOGATH',
    'Dr. Mundo': 'DR_MUNDO',
    'Kai\'Sa': 'KAISA',
    'Kha\'Zix': 'KHAZIX',
    'Kog\'Maw': 'KOGMAW',
    'Vel\'Koz': 'VELKOZ',
    'LeBlanc': 'LEBLANC',
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

/**
 * Parsea respuestas en formato Python Dataclasses que devuelve lol_get_champion_analysis.
 */
export function parsePythonDataclasses(rawText: string): any {
  const parts = rawText.split('\n\n');
  if (parts.length < 2) {
    if (rawText.trim().startsWith('{')) return JSON.parse(rawText);
    throw new Error('Formato de OP.GG MCP no reconocido.');
  }

  const header = parts[0];
  const expr = parts.slice(1).join('\n\n').trim();

  const classDefs: Record<string, string[]> = {};
  const lines = header.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/^class\s+([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (match) {
      const className = match[1];
      const fields = match[2].split(',').map((f) => f.trim()).filter(Boolean);
      classDefs[className] = fields;
    }
  }

  const scope: Record<string, any> = {
    None: null,
    True: true,
    False: false,
  };

  for (const [cls, fields] of Object.entries(classDefs)) {
    scope[cls] = function (...args: any[]) {
      const obj: Record<string, any> = {};
      fields.forEach((f, idx) => {
        obj[f] = args[idx];
      });
      return obj;
    };
  }

  const fn = new Function(...Object.keys(scope), `return (${expr});`);
  return fn(...Object.values(scope));
}

/**
 * Regla determinista de selección (B3):
 * Entre opciones con muestra suficiente, elige la de mejor winrate; en empate (diferencia < 0.5%), la más popular.
 */
export function selectOptimalOption<T extends { play: number; win: number; pickRate: number }>(
  options: T[],
  totalMatches: number
): T | undefined {
  if (!options || options.length === 0) return undefined;
  if (options.length === 1) return options[0];

  const minPlays = totalMatches >= 1000 ? 50 : Math.max(10, Math.round(totalMatches * 0.05));
  const eligible = options.filter((o) => o.play >= minPlays);
  const candidates = eligible.length > 0 ? eligible : options;

  return [...candidates].sort((a, b) => {
    const winrateA = a.play > 0 ? a.win / a.play : 0;
    const winrateB = b.play > 0 ? b.win / b.play : 0;
    if (Math.abs(winrateA - winrateB) > 0.005) {
      return winrateB - winrateA; // Mayor tasa de victoria
    }
    return b.pickRate - a.pickRate; // Mayor presencia en desempate
  })[0];
}

/** Campeones de referencia por posición cuando no hay rival */
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
   * Clave para análisis general por campeón y rol con Elo (soporta tier):
   * `opgg:general:{campeón}:{posición}:{elo}:{parche}`
   */
  public construirClaveGeneral(
    championId: number,
    role: Role,
    elo: string = 'emerald_plus',
    patch: string = '26.20'
  ): string {
    const normPatch = patch.split('.').slice(0, 2).join('.');
    const pos = roleToOpGgPosition(role);
    return `opgg:general:${championId}:${pos}:${elo}:${normPatch}`;
  }

  /**
   * Clave para matchup directo (la herramienta no soporta tier, por lo que NO se incluye en la clave):
   * `opgg:matchup:{campeón}:{posición}:{rival}:{parche}`
   */
  public construirClaveMatchup(
    championId: number,
    role: Role,
    opponentId: number,
    patch: string = '26.20'
  ): string {
    const normPatch = patch.split('.').slice(0, 2).join('.');
    const pos = roleToOpGgPosition(role);
    return `opgg:matchup:${championId}:${pos}:${opponentId}:${normPatch}`;
  }

  /** Clave de compatibilidad para código existente */
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
   * BASE: Obtiene el análisis y build competitiva con filtro de Elo real (ej. Esmeralda+)
   * usando lol_get_champion_analysis.
   */
  public async getChampionAnalysis(params: {
    championId: number;
    role: Role;
    elo?: string;
    patch?: string;
    forceRefresh?: boolean;
  }): Promise<OpGgMatchupData> {
    const { championId, role, forceRefresh } = params;
    const elo = params.elo || 'emerald_plus';
    const patch = params.patch || '26.20';
    const cacheKey = this.construirClaveGeneral(championId, role, elo, patch);

    if (!forceRefresh && this.dbService) {
      const cached = this.dbService.getMatchupCache(cacheKey);
      if (cached?.opggData) {
        registrarLog(`[OpGgClient] Build general recuperada de SQLite: ${cacheKey}`);
        return cached.opggData;
      }
    }

    const myChamp = getChampionById(championId);
    if (!myChamp) {
      throw new Error(`Campeón con ID ${championId} no reconocido en catálogo.`);
    }

    const myChampOpGg = formatChampionForOpGg(myChamp.name);
    const pos = roleToOpGgPosition(role);

    registrarLog(`[OpGgClient] Consultando lol_get_champion_analysis: ${myChampOpGg} (${pos}, tier=${elo})...`);

    const rawResponseText = await this.ejecutarLlamadaMcpGenerica('lol_get_champion_analysis', {
      game_mode: 'ranked',
      champion: myChampOpGg,
      position: pos,
      tier: elo,
      lang: 'en_US',
      desired_output_fields: [
        'data.core_items',
        'data.runes',
        'data.boots',
        'data.starter_items',
        'data.fourth_items',
        'data.fifth_items',
        'data.sixth_items',
        'data.summoner_spells',
        'data.skills',
        'data.skill_masteries',
        'data.weak_counters',
        'data.strong_counters',
      ],
    });

    const parsed = parsePythonDataclasses(rawResponseText);
    const data = parsed?.data || {};

    const eloLabelMap: Record<string, string> = {
      emerald_plus: 'Esmeralda+',
      diamond_plus: 'Diamante+',
      master_plus: 'Master+',
      grandmaster: 'Gran Maestro',
      challenger: 'Retador',
      all: 'Todos los rangos',
    };
    const eloLabel = `General: ${eloLabelMap[elo] || elo}`;

    const matchupData = this.procesarRespuestaOpGg(
      { data },
      championId,
      0,
      role,
      patch,
      elo,
      true,
      'general_analysis',
      eloLabel
    );

    if (this.dbService) {
      const rec = this.construirRecomendacionDeterminista(matchupData, myChamp.name, role, patch, true);
      this.dbService.setMatchupCache(cacheKey, rec, TTL_CACHE_OPGG_SEGUNDOS);
      registrarLog(`[OpGgClient] Guardada build general en SQLite: ${cacheKey}`);
    }

    return matchupData;
  }

  /**
   * COMPLEMENTO: Obtiene la guía de enfrentamiento directo contra un rival específico
   * usando lol_get_lane_matchup_guide (todos los rangos).
   */
  public async getLaneMatchupGuide(params: OpGgRequestParams): Promise<OpGgMatchupData> {
    const { championId, opponentId, role, forceRefresh } = params;
    const patch = params.patch || '26.20';
    const elo = params.elo || 'emerald_plus';

    // Si no hay rival, delegar directamente a la build general
    if (!opponentId || opponentId <= 0) {
      return await this.getChampionAnalysis({ championId, role, elo, patch, forceRefresh });
    }

    const cacheKey = this.construirClaveMatchup(championId, role, opponentId, patch);

    if (!forceRefresh && this.dbService) {
      const cached = this.dbService.getMatchupCache(cacheKey);
      if (cached?.opggData) {
        registrarLog(`[OpGgClient] Matchup recuperado de SQLite: ${cacheKey}`);
        return cached.opggData;
      }
    }

    const myChamp = getChampionById(championId);
    if (!myChamp) {
      throw new Error(`Campeón con ID ${championId} no reconocido en catálogo.`);
    }

    const oppChamp = getChampionById(opponentId);
    const oppChampName = oppChamp ? oppChamp.name : `Rival ${opponentId}`;
    const myChampOpGg = formatChampionForOpGg(myChamp.name);
    const oppChampOpGg = formatChampionForOpGg(oppChampName);
    const pos = roleToOpGgPosition(role);

    registrarLog(`[OpGgClient] Consultando lol_get_lane_matchup_guide: ${myChampOpGg} vs ${oppChampOpGg} (${pos})...`);

    const rawResponseText = await this.ejecutarLlamadaMcpGenerica('lol_get_lane_matchup_guide', {
      position: pos,
      my_champion: myChampOpGg,
      opponent_champion: oppChampOpGg,
      lang: 'en_US',
    });

    const parsed = JSON.parse(rawResponseText);
    const matchupPlays = parsed.data?.runes?.[0]?.play || parsed.data?.core_items?.[0]?.play || 0;
    const isSampleLow = matchupPlays < this.minSampleThreshold;

    let matchupData = this.procesarRespuestaOpGg(
      parsed,
      championId,
      opponentId,
      role,
      patch,
      'all',
      isSampleLow,
      'lane_matchup',
      'Matchup: todos los rangos'
    );

    // Si la muestra es reducida (< 200 partidas), complementar con la build general
    if (isSampleLow) {
      matchupData.isGeneralBuildFallback = true;
      matchupData.sampleSizeWarning = `Muestra reducida (${matchupData.totalMatches} < ${this.minSampleThreshold} partidas vs ${oppChampName}). Se recomienda build general en Esmeralda+.`;
      try {
        const generalData = await this.getChampionAnalysis({ championId, role, elo, patch, forceRefresh });
        matchupData.fourthItems = generalData.fourthItems;
        matchupData.fifthItems = generalData.fifthItems;
        matchupData.sixthItems = generalData.sixthItems;
      } catch (e) {
        registrarLog(`[OpGgClient] No se pudo complementar con build general: ${e}`);
      }
    }

    if (this.dbService) {
      const rec = this.construirRecomendacionDeterminista(matchupData, myChamp.name, role, patch, false);
      this.dbService.setMatchupCache(cacheKey, rec, TTL_CACHE_OPGG_SEGUNDOS);
      registrarLog(`[OpGgClient] Guardado matchup en SQLite: ${cacheKey}`);
    }

    return matchupData;
  }

  /**
   * Precalienta la caché de la build general (Esmeralda+) para campeones preferidos.
   */
  public async warmupPreferredChampions(
    preferences: Record<Role, { preferredChampions: number[] }>,
    elo: string = 'emerald_plus',
    patch: string = '26.20'
  ): Promise<number> {
    let warmed = 0;
    const roles: Role[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

    for (const r of roles) {
      const pref = preferences[r];
      if (!pref || !Array.isArray(pref.preferredChampions)) continue;

      for (const champId of pref.preferredChampions) {
        if (!champId || champId <= 0) continue;
        const cacheKey = this.construirClaveGeneral(champId, r, elo, patch);
        if (this.dbService && this.dbService.getMatchupCache(cacheKey)) {
          continue; // Ya en caché
        }
        try {
          await this.getChampionAnalysis({ championId: champId, role: r, elo, patch });
          warmed++;
        } catch (err) {
          registrarLog(`[OpGgClient Warmup] Fallo precalentando campeón ${champId} en ${r}: ${err}`);
        }
      }
    }
    registrarLog(`[OpGgClient Warmup] Completado. ${warmed} builds precalentadas en caché.`);
    return warmed;
  }

  /**
   * Construye una recomendación de IA determinista usando la regla B3.
   */
  public construirRecomendacionDeterminista(
    matchupData: OpGgMatchupData,
    myChampName: string,
    role: Role,
    patch: string,
    isGeneral: boolean
  ): GeminiMatchupRecommendation {
    const oppChamp = matchupData.opponentChampionId ? getChampionById(matchupData.opponentChampionId) : null;
    const oppChampName = oppChamp ? oppChamp.name : (matchupData.opponentChampionId ? `Rival ${matchupData.opponentChampionId}` : '');

    const bestRune = selectOptimalOption(matchupData.runes, matchupData.totalMatches) || matchupData.runes[0];
    const bestCore = selectOptimalOption(matchupData.coreItems, matchupData.totalMatches) || matchupData.coreItems[0];
    const bestBoots = selectOptimalOption(matchupData.boots, matchupData.totalMatches) || matchupData.boots[0];
    const bestStarter = selectOptimalOption(matchupData.starterItems, matchupData.totalMatches) || matchupData.starterItems[0];

    // Ítems iniciales: soporte asegura Atlas Mundial (3865)
    let starterIds = bestStarter?.ids || [1055, 2003];
    if (role === 'UTILITY' && !starterIds.includes(3865)) {
      starterIds = [3865, 2003];
    }

    // Ítems situacionales / 4° a 6°
    const situationalItems: Array<{ itemId: number; condition: string }> = [];
    if (matchupData.fourthItems?.[0]?.ids?.[0]) {
      situationalItems.push({ itemId: matchupData.fourthItems[0].ids[0], condition: '4° objeto prioritario según estadísticas' });
    }
    if (matchupData.fifthItems?.[0]?.ids?.[0]) {
      situationalItems.push({ itemId: matchupData.fifthItems[0].ids[0], condition: '5° objeto para juego medio/tardío' });
    }
    if (matchupData.sixthItems?.[0]?.ids?.[0]) {
      situationalItems.push({ itemId: matchupData.sixthItems[0].ids[0], condition: '6° objeto de cierre' });
    }
    if (situationalItems.length === 0) {
      situationalItems.push(
        { itemId: 3026, condition: 'Ángel Guardián frente a daño explosivo AD' },
        { itemId: 3156, condition: 'Fauces de Malmortius frente a burst mágico AP' }
      );
    }

    const itemSetTitle = matchupData.opponentChampionId > 0 && !isGeneral
      ? `[IL] ${myChampName} vs ${oppChampName}`
      : `[IL] ${myChampName} (general)`;

    const totalStr = matchupData.totalMatches.toLocaleString();
    const summary = isGeneral
      ? `Build general recomendada de OP.GG para ${myChampName} (${role}) en ${matchupData.eloLabel || 'Esmeralda+'}. Basada en ${totalStr} partidas del Parche ${patch}.`
      : `Guía táctica de OP.GG para ${myChampName} vs ${oppChampName} (${matchupData.eloLabel || 'todos los rangos'}). Basada en ${totalStr} partidas del Parche ${patch}.`;

    return {
      championId: matchupData.myChampionId,
      opponentChampionId: matchupData.opponentChampionId,
      assignedRole: role,
      patchVersion: patch,
      difficultyRating: 5,
      matchupSummary: summary,
      runesRecommendation: {
        primaryStyleId: bestRune?.primaryPageId || 8000,
        subStyleId: bestRune?.secondaryPageId || 8300,
        selectedPerkIds: [
          ...(bestRune?.primaryRuneIds || [8005, 9111, 9104, 8014]),
          ...(bestRune?.secondaryRuneIds || [8304, 8347]),
          ...(bestRune?.statModIds || [5008, 5008, 5011]),
        ],
        rationale: `Configuración competitiva seleccionada por tasa de victoria (${((bestRune?.win || 0) / (bestRune?.play || 1) * 100).toFixed(1)}% WR en ${bestRune?.play || 0} partidas).`,
      },
      buildRecommendation: {
        startingItems: starterIds,
        boots: bestBoots?.ids?.[0] || 3006,
        coreItems: bestCore?.ids || [3078, 3053, 3156],
        situationalItems,
        fourthItems: matchupData.fourthItems?.map((x) => x.ids[0]).filter(Boolean),
        fifthItems: matchupData.fifthItems?.map((x) => x.ids[0]).filter(Boolean),
        sixthItems: matchupData.sixthItems?.map((x) => x.ids[0]).filter(Boolean),
        itemSetTitle,
        rationale: `Núcleo de objetos con mayor efectividad en ${matchupData.totalMatches.toLocaleString()} partidas del parche.`,
      },
      skillOrder: {
        priority: matchupData.skillPriority || ['Q', 'W', 'E'],
        firstThreeLevels: matchupData.skillOrder?.slice(0, 3) || ['Q', 'W', 'E'],
        rationale: 'Prioridad de habilidades optimizada por winrate.',
      },
      earlyGameStrategy: {
        waveManagement: 'Adaptar control de oleada según el empuje del rival y tiempos de jungla.',
        tradingPlan: matchupData.opponentTip || 'Respetar enfriamientos y picos de nivel tempranos.',
        levelSpikes: ['Nivel 2', 'Nivel 3', 'Nivel 6'],
      },
      threatAnalysis: {
        enemyThreats: ['Control de masas', 'Daño explosivo'],
        winCondition: 'Consistencia en objetivos y ventaja de objetos en peleas de equipo.',
      },
      dataSource: 'opgg',
      opggData: matchupData,
    };
  }

  /**
   * Ejecuta peticiones MCP genéricas con control de ráfaga y reintentos ante 429.
   */
  private async ejecutarLlamadaMcpGenerica(toolName: string, args: Record<string, any>): Promise<string> {
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
        name: toolName,
        arguments: args,
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
        this.dbService?.recordApiCall('OPGG', `/mcp/${toolName}`, statusCode);

        if (statusCode === 429) {
          const delay = Math.pow(2, intentos) * 500;
          registrarLog(`[OpGgClient 429] Límite de tasa en ${toolName}. Esperando ${delay}ms...`);
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

        return rawText;
      } catch (err) {
        ultimoError = err;
        if (intentos < maxIntentos) {
          const delay = intentos * 400;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw ultimoError || new Error(`Fallo al consultar ${toolName} en OP.GG MCP.`);
  }

  /**
   * Mapea y normaliza los datos de OP.GG tanto desde formato JSON como desde Dataclasses.
   */
  private procesarRespuestaOpGg(
    raw: any,
    myChampionId: number,
    opponentChampionId: number,
    position: Role,
    patch: string,
    elo: string,
    isGeneralBuildFallback: boolean,
    dataSourceType: 'general_analysis' | 'lane_matchup' = 'general_analysis',
    eloLabel: string = 'Esmeralda+'
  ): OpGgMatchupData {
    const data = raw?.data || {};

    // 1. Extraer runas (puede ser objeto individual o arreglo)
    const rawRunes = Array.isArray(data.runes) ? data.runes : (data.runes ? [data.runes] : []);
    const runes: OpGgRunePage[] = rawRunes.map((r: any) => ({
      primaryPageId: r.primary_page_id || 8000,
      primaryPageName: this.traducirEstiloRuna(r.primary_page_id),
      primaryRuneIds: Array.isArray(r.primary_rune_ids) ? r.primary_rune_ids : [],
      primaryRuneNames: (r.primary_rune_ids || []).map((id: number) => this.traducirRuna(id)),
      secondaryPageId: r.secondary_page_id || 8300,
      secondaryPageName: this.traducirEstiloRuna(r.secondary_page_id),
      secondaryRuneIds: Array.isArray(r.secondary_rune_ids) ? r.secondary_rune_ids : [],
      secondaryRuneNames: (r.secondary_rune_ids || []).map((id: number) => this.traducirRuna(id)),
      statModIds: Array.isArray(r.stat_mod_ids) ? r.stat_mod_ids : [5008, 5008, 5001],
      statModNames: (r.stat_mod_ids || [5008, 5008, 5001]).map((id: number) => this.traducirRuna(id)),
      play: r.play || 0,
      win: r.win || 0,
      pickRate: r.pick_rate || 0,
    }));

    // 2. Extraer core items
    const rawCore = Array.isArray(data.core_items) ? data.core_items : (data.core_items ? [data.core_items] : []);
    const coreItems = rawCore.map((c: any) => ({
      ids: Array.isArray(c.ids) ? c.ids : [],
      names: (c.ids || []).map((id: number) => this.traducirItem(id)),
      play: c.play || 0,
      win: c.win || 0,
      pickRate: c.pick_rate || 0,
    }));

    // 3. Extraer ítems iniciales (para soporte, garantizar Atlas Mundial 3865)
    const rawStarters = Array.isArray(data.starter_items) ? data.starter_items : (data.starter_items ? [data.starter_items] : []);
    const starterItems = rawStarters.map((s: any) => {
      let ids: number[] = Array.isArray(s.ids) ? s.ids : [1055, 2003];
      if (position === 'UTILITY' && !ids.includes(3865)) {
        ids = [3865, ...ids.filter((id) => id !== 1055 && id !== 1056)];
      }
      return {
        ids,
        names: ids.map((id: number) => this.traducirItem(id)),
        play: s.play || 0,
        win: s.win || 0,
        pickRate: s.pick_rate || 0,
      };
    });
    if (starterItems.length === 0 && position === 'UTILITY') {
      starterItems.push({
        ids: [3865, 2003],
        names: ['Atlas Mundial', 'Poción de Vida'],
        play: 1000,
        win: 500,
        pickRate: 1,
      });
    }

    // 4. Extraer botas
    const rawBoots = Array.isArray(data.boots) ? data.boots : (data.boots ? [data.boots] : []);
    const boots = rawBoots.map((b: any) => ({
      ids: Array.isArray(b.ids) ? b.ids : [3006],
      names: (b.ids || [3006]).map((id: number) => this.traducirItem(id)),
      play: b.play || 0,
      win: b.win || 0,
      pickRate: b.pick_rate || 0,
    }));

    // 5. Extraer 4°, 5° y 6° ítems
    const mapItemsGroup = (group: any) => {
      const arr = Array.isArray(group) ? group : (group ? [group] : []);
      return arr.map((item: any) => ({
        ids: Array.isArray(item.ids) ? item.ids : [],
        names: (item.ids || []).map((id: number) => this.traducirItem(id)),
        play: item.play || 0,
        win: item.win || 0,
        pickRate: item.pick_rate || 0,
      }));
    };

    const fourthItems = mapItemsGroup(data.fourth_items);
    const fifthItems = mapItemsGroup(data.fifth_items);
    const sixthItems = mapItemsGroup(data.sixth_items);

    // 6. Extraer hechizos de invocador
    const rawSpells = Array.isArray(data.summoner_spells) ? data.summoner_spells : (data.summoner_spells ? [data.summoner_spells] : []);
    const summonerSpells = rawSpells.map((sp: any) => ({
      ids: (sp.ids || [4, 12]) as [number, number],
      names: (sp.ids || [4, 12]).map((id: number) => this.traducirHechizo(id)),
      play: sp.play || 0,
      win: sp.win || 0,
      pickRate: sp.pick_rate || 0,
    }));

    // 7. Orden de habilidades
    const skillOrder: string[] = (Array.isArray(data.skills) ? data.skills[0]?.order : data.skills?.order) || ['Q', 'W', 'E', 'Q', 'Q', 'R'];
    const skillPriority: string[] = (Array.isArray(data.skill_masteries) ? data.skill_masteries[0]?.ids : data.skill_masteries?.ids) || ['Q', 'W', 'E'];

    // 8. Total de partidas para el cálculo de muestra
    const totalMatches =
      runes[0]?.play ||
      coreItems[0]?.play ||
      data.summary?.positions?.[0]?.stats?.play ||
      data.summary?.average_stats?.play ||
      0;

    // 9. Counters
    const counters = (data.summary?.positions?.[0]?.counters || data.weak_counters || []).map((cnt: any) => ({
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
      fourthItems,
      fifthItems,
      sixthItems,
      summonerSpells,
      skillOrder,
      skillPriority,
      totalMatches,
      isGeneralBuildFallback,
      opponentTip: data.opponent_champion_tip || undefined,
      counters,
      dataSourceType,
      eloLabel,
    };
  }

  private traducirItem(id: number): string {
    if (this.translator) {
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
      3009: 'Botas de Rapidez',
      3008: 'Grebas Codiciosas',
      3179: 'Glaive Umbral',
      3142: 'Filo Fantasma de Youmuu',
      3814: 'Filo de la Noche',
      3865: 'Atlas Mundial',
      3869: 'Oposición Celestial',
      6696: 'Arco Axiomático',
      6699: 'Cicloespada Voltaica',
      6695: 'Colmillo de Serpiente',
      6697: 'Soberbia',
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
      3072: 'Sanguinaria',
      6676: 'El Coleccionista',
      3036: 'Recuerdos de Lord Dominik',
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
      8992: 'Cometa Arcano',
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
      8112: 'Electrocutar',
      8128: 'Cosecha Oscura',
      9923: 'Lluvia de Espadas',
      8126: 'Golpe Bajo',
      8139: 'Sabor a Sangre',
      8137: 'Sexto Sentido',
      8138: 'Colección de Ojos',
      8106: 'Cazador Definitivo',
      8105: 'Cazador Incansable',
      8242: 'Inquebrantable',
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
