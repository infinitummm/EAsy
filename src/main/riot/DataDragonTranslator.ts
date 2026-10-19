/**
 * Traductor y Validador de Metadatos de League of Legends mediante Data Dragon.
 * Convierte nombres de runas y objetos (en español o inglés) devueltos por Gemini
 * a IDs numéricos oficiales y validados del parche actual.
 * Propiedad exclusiva de ANTIGRAVITY.
 */

import { DataDragonService, ArbolRunas, DatosItem } from './DataDragonService';
import { GeminiMatchupRecommendation, Role } from '../../shared/types';
import { registrarLog } from '../lcu/LcuDetector';

export interface RawGeminiRecommendation {
  championId: number;
  opponentChampionId: number;
  assignedRole: Role;
  patchVersion?: string;
  difficultyRating: number;
  matchupSummary: string;
  runesRecommendation: {
    primaryStyleName?: string;
    primaryStyleId?: number;
    subStyleName?: string;
    subStyleId?: number;
    keystoneName?: string;
    primaryRunes?: string[];
    secondaryRunes?: string[];
    statShards?: string[];
    selectedPerkIds?: number[];
    rationale: string;
  };
  buildRecommendation: {
    startingItems?: Array<string | number>;
    boots?: string | number;
    coreItems?: Array<string | number>;
    situationalItems?: Array<{ itemName?: string; itemId?: number; condition: string }>;
    rationale: string;
  };
  skillOrder: {
    priority: string[];
    firstThreeLevels: string[];
    rationale: string;
  };
  earlyGameStrategy: {
    waveManagement: string;
    tradingPlan: string;
    levelSpikes: string[];
  };
  threatAnalysis: {
    enemyThreats: string[];
    winCondition: string;
  };
}

export interface ResultadoValidacionMatchup {
  valid: boolean;
  recommendation?: GeminiMatchupRecommendation;
  error?: string;
  resolvedRunes?: Array<{ requested: string; resolvedId: number }>;
  resolvedItems?: Array<{ requested: string; resolvedId: number }>;
}

export class DataDragonTranslator {
  private trees: ArbolRunas[] = [];
  private items: DatosItem[] = [];
  private patchVersion = '';
  private runeMap = new Map<string, { id: number; treeId: number; slotIndex: number; name: string }>();
  private styleMap = new Map<string, number>();
  private itemMap = new Map<string, { id: number; name: string }>();
  private initialized = false;

  constructor(private readonly ddragon: DataDragonService) {}

  /**
   * Normaliza texto para búsqueda tolerante (sin acentos, minúsculas, sin puntuación).
   */
  public normalize(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
      .replace(/[^a-z0-9]/g, '')       // Eliminar espacios y símbolos
      .trim();
  }

  /**
   * Inicializa o actualiza los diccionarios con el parche indicado.
   */
  public async initialize(patch?: string): Promise<void> {
    try {
      const version = patch || (await this.ddragon.obtenerVersionActual());
      if (this.initialized && this.patchVersion === version) {
        return;
      }

      this.patchVersion = version;
      this.trees = await this.ddragon.obtenerArbolesDeRunas(version);
      this.items = await this.ddragon.obtenerItems(version);

      this.buildRuneIndex();
      this.buildItemIndex();
      this.initialized = true;

      registrarLog(`[DataDragonTranslator] Inicializado para parche ${version}. Runas indexadas: ${this.runeMap.size}, Ítems indexados: ${this.itemMap.size}`);
    } catch (err) {
      registrarLog(`[DataDragonTranslator ERROR] Fallo inicializando con Data Dragon: ${err}`);
      throw err;
    }
  }

  public getPatchVersion(): string {
    return this.patchVersion;
  }

  private buildRuneIndex(): void {
    this.runeMap.clear();
    this.styleMap.clear();

    // Indexar estilos / ramas
    const stylesDef: Array<{ names: string[]; id: number }> = [
      { names: ['precision', 'precision'], id: 8000 },
      { names: ['dominacion', 'domination'], id: 8100 },
      { names: ['brujeria', 'sorcery'], id: 8200 },
      { names: ['inspiracion', 'inspiration'], id: 8300 },
      { names: ['valor', 'resolve'], id: 8400 },
    ];

    for (const s of stylesDef) {
      for (const n of s.names) {
        this.styleMap.set(this.normalize(n), s.id);
      }
    }

    // Indexar ramas reales de Data Dragon
    for (const tree of this.trees) {
      this.styleMap.set(this.normalize(tree.name), tree.id);
      this.styleMap.set(this.normalize(tree.key), tree.id);

      tree.slots.forEach((slot, slotIndex) => {
        for (const rune of slot.runes) {
          const entry = {
            id: rune.id,
            treeId: tree.id,
            slotIndex, // 0 = keystone, 1 = row 1, 2 = row 2, 3 = row 3
            name: rune.name,
          };
          this.runeMap.set(this.normalize(rune.name), entry);
          this.runeMap.set(this.normalize(rune.key), entry);
        }
      });
    }

    // Aliases comunes de runas en español e inglés
    const aliases: Array<{ names: string[]; id: number; treeId: number; slotIndex: number }> = [
      { names: ['ataqueintensificado', 'presionconataque', 'pta', 'presionataque'], id: 8005, treeId: 8000, slotIndex: 0 },
      { names: ['compasletal', 'lethaltempo'], id: 8008, treeId: 8000, slotIndex: 0 },
      { names: ['piesveloces', 'fleetfootwork'], id: 8021, treeId: 8000, slotIndex: 0 },
      { names: ['conquistador', 'conqueror'], id: 8010, treeId: 8000, slotIndex: 0 },
      { names: ['claridadmental', 'presenceofmind'], id: 9101, treeId: 8000, slotIndex: 1 },
      { names: ['triunfo', 'triumph'], id: 9111, treeId: 8000, slotIndex: 1 },
      { names: ['absorbervida', 'absorblife'], id: 9104, treeId: 8000, slotIndex: 1 },
      { names: ['leyendapresteza', 'legendalacrity', 'presteza'], id: 9104, treeId: 8000, slotIndex: 2 },
      { names: ['leyendalinaje', 'legendbloodline', 'linaje'], id: 9103, treeId: 8000, slotIndex: 2 },
      { names: ['leyendaceleridad', 'leyendavelocidad', 'legendhaste', 'celeridad'], id: 9105, treeId: 8000, slotIndex: 2 },
      { names: ['golpedegracia', 'coupdegrace'], id: 8014, treeId: 8000, slotIndex: 3 },
      { names: ['derribado', 'cortarporlosano', 'cutdown'], id: 8017, treeId: 8000, slotIndex: 3 },
      { names: ['ultimoesfuerzo', 'laststand'], id: 8299, treeId: 8000, slotIndex: 3 },
      // Inspiración
      { names: ['calzadomagico', 'magicalfootwear', 'botasmagicas'], id: 8304, treeId: 8300, slotIndex: 1 },
      { names: ['entregadegalletas', 'galletas', 'biscuitdelivery'], id: 8345, treeId: 8300, slotIndex: 2 },
      { names: ['perspicaciacosmica', 'cosmicinsight'], id: 8347, treeId: 8300, slotIndex: 3 },
      { names: ['velocidaddeacercamiento', 'approachvelocity'], id: 8410, treeId: 8300, slotIndex: 3 },
      { names: ['primergolpe', 'firststrike'], id: 8369, treeId: 8300, slotIndex: 0 },
      // Dominación
      { names: ['electrocutar', 'electrocute'], id: 8112, treeId: 8100, slotIndex: 0 },
      { names: ['cosechaoscura', 'darkharvest'], id: 8128, treeId: 8100, slotIndex: 0 },
      { names: ['lluviadecuchillas', 'hailofblades'], id: 9923, treeId: 8100, slotIndex: 0 },
      { names: ['saborasangre', 'tasteofblood'], id: 8139, treeId: 8100, slotIndex: 1 },
      { names: ['impactorepentino', 'suddenimpact'], id: 8143, treeId: 8100, slotIndex: 1 },
      { names: ['cazadordefinitivo', 'ultimatehunter'], id: 8106, treeId: 8100, slotIndex: 3 },
      // Brujería
      { names: ['cometaarcano', 'arcanecomet'], id: 8229, treeId: 8200, slotIndex: 0 },
      { names: ['invocaraaery', 'aery', 'summonaery'], id: 8214, treeId: 8200, slotIndex: 0 },
      { names: ['bandademana', 'flujodemana', 'manaflowband'], id: 8226, treeId: 8200, slotIndex: 1 },
      { names: ['trascendencia', 'transcendence'], id: 8210, treeId: 8200, slotIndex: 2 },
      { names: ['pirolaser', 'scorch'], id: 8237, treeId: 8200, slotIndex: 3 },
      { names: ['seavecinatormenta', 'gatheringstorm'], id: 8236, treeId: 8200, slotIndex: 3 },
      // Valor
      { names: ['garrasdelinmortal', 'graspoftheundying', 'garras'], id: 8437, treeId: 8400, slotIndex: 0 },
      { names: ['reverberaccion', 'aftershock'], id: 8439, treeId: 8400, slotIndex: 0 },
      { names: ['demoler', 'demolish'], id: 8446, treeId: 8400, slotIndex: 1 },
      { names: ['fuerzasrenovadas', 'secondwind'], id: 8429, treeId: 8400, slotIndex: 2 },
      { names: ['revestimientodehuesos', 'boneplating'], id: 8473, treeId: 8400, slotIndex: 2 },
      { names: ['sobrecrecimiento', 'overgrowth'], id: 8451, treeId: 8400, slotIndex: 3 },
      { names: ['revitalizar', 'revitalize'], id: 8453, treeId: 8400, slotIndex: 3 },
    ];

    for (const a of aliases) {
      for (const n of a.names) {
        if (!this.runeMap.has(this.normalize(n))) {
          this.runeMap.set(this.normalize(n), {
            id: a.id,
            treeId: a.treeId,
            slotIndex: a.slotIndex,
            name: a.names[0],
          });
        }
      }
    }
  }

  private buildItemIndex(): void {
    this.itemMap.clear();

    for (const item of this.items) {
      // Filtrar a Grieta del Invocador (mapa 11) y comprables
      const maps = (item as any).maps as Record<string, boolean> | undefined;
      const inStore = (item as any).inStore;
      const gold = item.gold;

      if (maps && maps['11'] === false) continue;
      if (inStore === false) continue;
      if (gold && gold.total === 0 && !['1055', '1054', '1056', '2003'].includes(item.id)) continue;

      const numId = Number(item.id);
      if (isNaN(numId)) continue;

      const entry = { id: numId, name: item.name };
      this.itemMap.set(this.normalize(item.name), entry);
    }

    // Aliases frecuentes para ítems en español e inglés
    const itemAliases: Array<{ names: string[]; id: number }> = [
      { names: ['espadadedoran', 'doransblade', 'doranblade'], id: 1055 },
      { names: ['escudodedoran', 'doransshield', 'doranshield'], id: 1054 },
      { names: ['anillodedoran', 'doransring', 'doranring'], id: 1056 },
      { names: ['pociondevida', 'pocion', 'healthpotion', 'pocionroja'], id: 2003 },
      { names: ['pocionreutilizable', 'refillablepotion'], id: 2031 },
      { names: ['pociondecorrupcion', 'corruptingpotion'], id: 2033 },
      { names: ['grebasdeberserker', 'berserkergreaves', 'berserkersgreaves', 'botasdeataque'], id: 3006 },
      { names: ['botasblindadas', 'platedsteelcaps', 'tabis', 'tabideninja'], id: 3047 },
      { names: ['botasdemercurio', 'mercurystreads', 'mercurytreads'], id: 3111 },
      { names: ['botasdelhechicero', 'sorcerersshoes', 'botasmagicashechicero'], id: 3020 },
      { names: ['botasderapidez', 'bootsofswiftness'], id: 3009 },
      { names: ['botasjoniasdelalucidez', 'botasjonias', 'ionianbootsoflucidity', 'lucidityboots'], id: 3158 },
      { names: ['botas', 'boots'], id: 1001 },
      { names: ['elcoleccionista', 'coleccionista', 'thecollector', 'collector'], id: 6676 },
      { names: ['filoinfinito', 'infinityedge'], id: 3031 },
      { names: ['canondefuegorapido', 'canonfuego', 'rapidfirecannon'], id: 3094 },
      { names: ['matakrakens', 'krakenslayer'], id: 6672 },
      { names: ['recuerdosdelorddominik', 'lorddominik', 'lorddominiksregards', 'ldominik'], id: 3036 },
      { names: ['recordatoriomortal', 'mortalreminder'], id: 3033 },
      { names: ['sanguinaria', 'bloodthirster'], id: 3072 },
      { names: ['angelguardian', 'guardianangel'], id: 3026 },
      { names: ['faucesdemalmortius', 'mawofmalmortius'], id: 3156 },
      { names: ['segadordeesencia', 'essencereaper'], id: 3508 },
      { names: ['lanzadeshojin', 'spearofshojin', 'shojin'], id: 6610 },
      { names: ['fuerzadelatrinidad', 'trinidad', 'trinityforce'], id: 3078 },
      { names: ['guanteletedesterak', 'steraksgage', 'sterak'], id: 3053 },
      { names: ['cuchillanegra', 'theblackcleaver', 'blackcleaver'], id: 3071 },
      { names: ['hidraprofana', 'profanehydra'], id: 6698 },
      { names: ['hidratitanica', 'titanichydra'], id: 3748 },
      { names: ['hidravoraz', 'ravenoushydra'], id: 3074 },
      { names: ['relojdearenadezhonya', 'zhonyashourglass', 'zhonya'], id: 3157 },
      { names: ['sombreromortalderabadon', 'rabadonsdeathcap', 'rabadon'], id: 3089 },
      { names: ['bastondevacio', 'voidstaff'], id: 3135 },
      { names: ['compasoraculo', 'criptoflora', 'cryptbloom'], id: 3118 },
      { names: ['tempestaddeesperanza', 'tormentadelludens', 'ludenscompanion', 'ludens'], id: 3011 },
      { names: ['tormenta', 'llamadesombra', 'shadowflame'], id: 4645 },
      { names: ['sobrecargatormentosa', 'stormsurge'], id: 4005 },
      { names: ['malicia', 'malignance'], id: 3118 },
      { names: ['corazonhelado', 'frozenheart'], id: 3110 },
      { names: ['presagioderanduin', 'randuinsomen', 'randuin'], id: 3143 },
      { names: ['cotaespinas', 'thornmail'], id: 3075 },
      { names: ['rostroespiritual', 'spiritvisage'], id: 3065 },
      { names: ['fuerzadelanaturaleza', 'forceofnature'], id: 4401 },
      { names: ['desesperanzaeterna', 'unendingdespair'], id: 3144 },
      { names: ['resplandorvacuo', 'hollowradiance'], id: 6664 },
      { names: ['egidadelfuegosolar', 'sunfireaegis', 'sunfire'], id: 3068 },
    ];

    for (const a of itemAliases) {
      for (const n of a.names) {
        if (!this.itemMap.has(this.normalize(n))) {
          this.itemMap.set(this.normalize(n), { id: a.id, name: a.names[0] });
        }
      }
    }
  }

  /**
   * Resuelve el ID de un fragmento de estadística para la Temporada 14+.
   */
  public resolveStatShard(slotIndex: 0 | 1 | 2, shardText: string): number {
    const norm = this.normalize(shardText);

    if (slotIndex === 0) {
      // Slot 1 (Ofensivo): 5008 (Adaptable), 5005 (Vel Ataque), 5007 (Aceleración)
      if (norm.includes('ataque') || norm.includes('attackspeed') || norm.includes('velocidaddeataque')) return 5005;
      if (norm.includes('aceleracion') || norm.includes('haste') || norm.includes('habilidad')) return 5007;
      return 5008; // Fuerza Adaptable por defecto
    }

    if (slotIndex === 1) {
      // Slot 2 (Flexible): 5008 (Adaptable), 5010 (Vel Movimiento), 5001 (Vida Progresiva)
      if (norm.includes('movimiento') || norm.includes('speed') || norm.includes('movespeed')) return 5010;
      if (norm.includes('progresiva') || norm.includes('scaling') || norm.includes('escalado')) return 5001;
      return 5008; // Fuerza Adaptable por defecto
    }

    // Slot 3 (Defensivo): 5011 (Vida Plana), 5013 (Tenacidad), 5001 (Vida Progresiva)
    if (norm.includes('tenacidad') || norm.includes('tenacity') || norm.includes('ralentiza')) return 5013;
    if (norm.includes('progresiva') || norm.includes('scaling') || norm.includes('escalado')) return 5001;
    return 5011; // Vida plana (+65 HP) por defecto
  }

  /**
   * Traduce y valida un nombre o ID de objeto.
   */
  public resolveItemId(itemInput: string | number): number | null {
    if (typeof itemInput === 'number') {
      // Validar si el ID existe en el mapa de items de Data Dragon
      for (const item of this.itemMap.values()) {
        if (item.id === itemInput) return itemInput;
      }
      return itemInput; // Aceptar si es un ID numérico razonable
    }

    const norm = this.normalize(itemInput);
    const direct = this.itemMap.get(norm);
    if (direct) return direct.id;

    // Búsqueda parcial / aproximada
    for (const [key, value] of this.itemMap.entries()) {
      if (norm.length >= 4 && (key.includes(norm) || norm.includes(key))) {
        return value.id;
      }
    }

    return null;
  }

  /**
   * Traduce la respuesta sin procesar de Gemini al formato GeminiMatchupRecommendation estricto y validado.
   */
  public translateAndValidate(raw: RawGeminiRecommendation): ResultadoValidacionMatchup {
    if (!raw || typeof raw !== 'object') {
      return { valid: false, error: 'La respuesta de Gemini está vacía o no es un objeto JSON.' };
    }

    const resolvedRunes: Array<{ requested: string; resolvedId: number }> = [];
    const resolvedItems: Array<{ requested: string; resolvedId: number }> = [];

    // 1. Validar / Resolver estilo primario y secundario
    let primaryStyleId = raw.runesRecommendation?.primaryStyleId;
    if (!primaryStyleId && raw.runesRecommendation?.primaryStyleName) {
      primaryStyleId = this.styleMap.get(this.normalize(raw.runesRecommendation.primaryStyleName));
    }
    if (!primaryStyleId || ![8000, 8100, 8200, 8300, 8400].includes(primaryStyleId)) {
      primaryStyleId = 8000; // Precisión por defecto
    }

    let subStyleId = raw.runesRecommendation?.subStyleId;
    if (!subStyleId && raw.runesRecommendation?.subStyleName) {
      subStyleId = this.styleMap.get(this.normalize(raw.runesRecommendation.subStyleName));
    }
    if (!subStyleId || ![8000, 8100, 8200, 8300, 8400].includes(subStyleId) || subStyleId === primaryStyleId) {
      // Subestilo debe ser diferente al primario
      subStyleId = primaryStyleId === 8000 ? 8300 : 8000;
    }

    // 2. Resolver runas si ya vienen numéricas o si vienen como nombres
    let selectedPerkIds: number[] = [];

    if (Array.isArray(raw.runesRecommendation?.selectedPerkIds) && raw.runesRecommendation.selectedPerkIds.length === 9) {
      selectedPerkIds = [...raw.runesRecommendation.selectedPerkIds];
    } else {
      // Resolver keystone
      const keystoneName = raw.runesRecommendation?.keystoneName || '';
      const keystoneEntry = this.runeMap.get(this.normalize(keystoneName));
      const keystoneId = keystoneEntry ? keystoneEntry.id : (primaryStyleId === 8000 ? 8008 : 8112);
      resolvedRunes.push({ requested: keystoneName || 'Keystone', resolvedId: keystoneId });

      // Resolver 3 primarias
      const pRunes = raw.runesRecommendation?.primaryRunes || [];
      const primaryIds: number[] = [];
      for (const pName of pRunes) {
        const entry = this.runeMap.get(this.normalize(pName));
        if (entry) {
          primaryIds.push(entry.id);
          resolvedRunes.push({ requested: pName, resolvedId: entry.id });
        }
      }

      // Completar a 3 primarias si faltan
      while (primaryIds.length < 3) {
        const fallbacks = [9101, 9104, 8014];
        primaryIds.push(fallbacks[primaryIds.length]);
      }

      // Resolver 2 secundarias
      const sRunes = raw.runesRecommendation?.secondaryRunes || [];
      const secondaryIds: number[] = [];
      for (const sName of sRunes) {
        const entry = this.runeMap.get(this.normalize(sName));
        if (entry) {
          secondaryIds.push(entry.id);
          resolvedRunes.push({ requested: sName, resolvedId: entry.id });
        }
      }

      // Completar a 2 secundarias si faltan
      while (secondaryIds.length < 2) {
        const fallbacks = [8304, 8345];
        secondaryIds.push(fallbacks[secondaryIds.length]);
      }

      // Resolver 3 stat shards (Season 14+)
      const statShards = raw.runesRecommendation?.statShards || [];
      const shard0 = this.resolveStatShard(0, statShards[0] || 'Fuerza Adaptable');
      const shard1 = this.resolveStatShard(1, statShards[1] || 'Fuerza Adaptable');
      const shard2 = this.resolveStatShard(2, statShards[2] || 'Vida Plana');
      resolvedRunes.push({ requested: statShards[0] || 'Shard 1', resolvedId: shard0 });
      resolvedRunes.push({ requested: statShards[1] || 'Shard 2', resolvedId: shard1 });
      resolvedRunes.push({ requested: statShards[2] || 'Shard 3', resolvedId: shard2 });

      selectedPerkIds = [
        keystoneId,
        primaryIds[0],
        primaryIds[1],
        primaryIds[2],
        secondaryIds[0],
        secondaryIds[1],
        shard0,
        shard1,
        shard2
      ];
    }

    // Sanitizar stat shards para evitar 5002 / 5003 obsoletos
    if (![5008, 5005, 5007].includes(selectedPerkIds[6])) selectedPerkIds[6] = 5008;
    if (![5008, 5010, 5001].includes(selectedPerkIds[7])) selectedPerkIds[7] = 5008;
    if (![5011, 5013, 5001].includes(selectedPerkIds[8])) selectedPerkIds[8] = 5011;

    // 3. Resolver objetos de build
    const rawStarting = raw.buildRecommendation?.startingItems || ['Espada de Doran', 'Poción de vida'];
    const startingItems: number[] = [];
    for (const item of rawStarting) {
      const id = this.resolveItemId(item);
      if (id) {
        startingItems.push(id);
        resolvedItems.push({ requested: String(item), resolvedId: id });
      }
    }
    if (startingItems.length === 0) startingItems.push(1055, 2003);

    const rawCore = raw.buildRecommendation?.coreItems || [];
    const coreItems: number[] = [];
    // Incluir botas si vienen separadas
    if (raw.buildRecommendation?.boots) {
      const bootId = this.resolveItemId(raw.buildRecommendation.boots);
      if (bootId) {
        resolvedItems.push({ requested: String(raw.buildRecommendation.boots), resolvedId: bootId });
      }
    }
    for (const item of rawCore) {
      const id = this.resolveItemId(item);
      if (id) {
        coreItems.push(id);
        resolvedItems.push({ requested: String(item), resolvedId: id });
      }
    }
    if (coreItems.length < 3) {
      const fallbackCores = [6676, 3031, 3094]; // Coleccionista, Filo Infinito, Fuego Rápido
      for (const f of fallbackCores) {
        if (!coreItems.includes(f) && coreItems.length < 3) coreItems.push(f);
      }
    }

    const situationalItems: Array<{ itemId: number; condition: string }> = [];
    if (Array.isArray(raw.buildRecommendation?.situationalItems)) {
      for (const sit of raw.buildRecommendation.situationalItems) {
        const itemInput = sit.itemId || sit.itemName || '';
        const id = this.resolveItemId(itemInput);
        if (id) {
          situationalItems.push({ itemId: id, condition: sit.condition || 'Situacional' });
          resolvedItems.push({ requested: String(itemInput), resolvedId: id });
        }
      }
    }
    if (situationalItems.length === 0) {
      situationalItems.push(
        { itemId: 3036, condition: 'Contra tanques o armadura alta' },
        { itemId: 3072, condition: 'Para robo de vida y escudo' }
      );
    }

    const recommendation: GeminiMatchupRecommendation = {
      championId: raw.championId,
      opponentChampionId: raw.opponentChampionId,
      assignedRole: raw.assignedRole || 'BOTTOM',
      patchVersion: raw.patchVersion || this.patchVersion || '16.20.1',
      difficultyRating: typeof raw.difficultyRating === 'number' ? Math.max(1, Math.min(10, raw.difficultyRating)) : 5,
      matchupSummary: raw.matchupSummary || 'Análisis táctico del enfrentamiento.',
      runesRecommendation: {
        primaryStyleId,
        subStyleId,
        selectedPerkIds,
        rationale: raw.runesRecommendation?.rationale || 'Configuración óptima de runas para el matchup.'
      },
      buildRecommendation: {
        startingItems,
        coreItems,
        situationalItems,
        rationale: raw.buildRecommendation?.rationale || 'Ruta óptima de objetos y picos de poder.'
      },
      skillOrder: {
        priority: Array.isArray(raw.skillOrder?.priority) && raw.skillOrder.priority.length > 0 ? raw.skillOrder.priority : ['Q', 'W', 'E', 'R'],
        firstThreeLevels: Array.isArray(raw.skillOrder?.firstThreeLevels) && raw.skillOrder.firstThreeLevels.length > 0 ? raw.skillOrder.firstThreeLevels : ['Q', 'W', 'E'],
        rationale: raw.skillOrder?.rationale || 'Maximización de habilidades prioritaria.'
      },
      earlyGameStrategy: {
        waveManagement: raw.earlyGameStrategy?.waveManagement || 'Controlar el empuje de la oleada según la presión del rival.',
        tradingPlan: raw.earlyGameStrategy?.tradingPlan || 'Realizar intercambios cortos aprovechando ventajas de rango.',
        levelSpikes: Array.isArray(raw.earlyGameStrategy?.levelSpikes) && raw.earlyGameStrategy.levelSpikes.length > 0
          ? raw.earlyGameStrategy.levelSpikes
          : ['Nivel 2', 'Nivel 6']
      },
      threatAnalysis: {
        enemyThreats: Array.isArray(raw.threatAnalysis?.enemyThreats) && raw.threatAnalysis.enemyThreats.length > 0
          ? raw.threatAnalysis.enemyThreats
          : ['Presión de línea rival y emboscadas'],
        winCondition: raw.threatAnalysis?.winCondition || 'Control de objetivos y ventaja de oro.'
      }
    };

    return {
      valid: true,
      recommendation,
      resolvedRunes,
      resolvedItems
    };
  }
}
