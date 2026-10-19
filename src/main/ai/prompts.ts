/**
 * Prompts y esquemas de generación estructurada para Google Gemini API.
 * Propiedad exclusiva de ANTIGRAVITY.
 */

import { Role } from '../../shared/types';

/**
 * Genera el system prompt y user prompt para el análisis de matchup de LoL.
 */
export function buildMatchupPrompt(params: {
  championId: number;
  championName?: string;
  opponentId: number;
  opponentName?: string;
  role: Role;
  patch: string;
  allies?: number[];
  enemies?: number[];
}): { systemInstruction: string; userPrompt: string } {
  const champ = params.championName || `Campeón ID ${params.championId}`;
  const opponent = params.opponentName || `Rival ID ${params.opponentId}`;

  const systemInstruction = `Eres un coach profesional Challenger y analista de élite de League of Legends.
Tu misión es generar recomendaciones tácticas hiperprecisas, óptimas para el parche actual (${params.patch}), en formato JSON estricto.
IMPORTANTE:
- Para runas y objetos, proporciona sus NOMBRES OFICIALES en español (por ejemplo: "Compás letal", "Claridad mental", "Espada de Doran", "El Coleccionista"). NO inventes IDs numéricos.
- El análisis táctico debe ser profundo y específico para el emparejamiento directo entre los dos campeones en la fase de líneas.
- Responde ÚNICAMENTE un único objeto JSON válido sin texto adicional antes o después, sin bloques de markdown (\`\`\`json) si se solicita formato directo.`;

  const userPrompt = `Analiza a fondo el enfrentamiento en League of Legends:
- Mi Campeón: ${champ} (ID: ${params.championId})
- Campeón Rival directo en línea: ${opponent} (ID: ${params.opponentId})
- Posición / Rol: ${params.role}
- Parche actual: ${params.patch}
${params.allies && params.allies.length > 0 ? `- Aliados de mi equipo (IDs): ${params.allies.join(', ')}` : ''}
${params.enemies && params.enemies.length > 0 ? `- Rivales del equipo enemigo (IDs): ${params.enemies.join(', ')}` : ''}

Proporciona la configuración de runas, build de objetos, habilidades y plan de juego táctico.
El JSON debe cumplir exactamente con esta estructura:

{
  "championId": ${params.championId},
  "opponentChampionId": ${params.opponentId},
  "assignedRole": "${params.role}",
  "patchVersion": "${params.patch}",
  "difficultyRating": <número entero del 1 al 10 donde 1 es muy favorable y 10 es casi imposible>,
  "matchupSummary": "<resumen táctico profundo en español explicando la dinámica de la línea y ventajas clave>",
  "runesRecommendation": {
    "primaryStyleName": "<nombre oficial de la rama primaria: Precisión | Dominación | Brujería | Inspiración | Valor>",
    "subStyleName": "<nombre oficial de la rama secundaria distinta a la primaria>",
    "keystoneName": "<nombre oficial de la Runa Clave keystone de la rama primaria>",
    "primaryRunes": ["<nombre runa fila 1>", "<nombre runa fila 2>", "<nombre runa fila 3>"],
    "secondaryRunes": ["<nombre runa secundaria 1>", "<nombre runa secundaria 2>"],
    "statShards": ["<fragmento 1 ofensivo: Fuerza adaptable | Velocidad de ataque | Aceleración de habilidad>", "<fragmento 2 flexible: Fuerza adaptable | Velocidad de movimiento | Vida progresiva>", "<fragmento 3 defensivo: Vida plana | Tenacidad | Vida progresiva>"],
    "rationale": "<justificación táctica de esta elección de runas para este matchup en español>"
  },
  "buildRecommendation": {
    "startingItems": ["<nombre ítem de inicio 1, ej: Espada de Doran>", "<nombre ítem inicio 2, ej: Poción de vida>"],
    "boots": "<nombre de las botas recomendadas, ej: Grebas de Berserker>",
    "coreItems": ["<nombre objeto core 1>", "<nombre objeto core 2>", "<nombre objeto core 3>"],
    "situationalItems": [
      { "itemName": "<nombre objeto situacional>", "condition": "<contra qué campeón, tipo de daño o situación se compra>" }
    ],
    "rationale": "<explicación del orden de compras y picos de poder>"
  },
  "skillOrder": {
    "priority": ["Q", "W", "E", "R"],
    "firstThreeLevels": ["Q", "W", "E"],
    "rationale": "<por qué este orden en los primeros 3 niveles>"
  },
  "earlyGameStrategy": {
    "waveManagement": "<cómo manejar las oleadas en los niveles 1 al 4: slow push, freeze, shove o crash y por qué>",
    "tradingPlan": "<cómo castigar al rival, qué habilidades enemigas esperar que gaste antes de intercambiar>",
    "levelSpikes": ["<ej: Nivel 2 con ventaja de súbditos>", "<ej: Nivel 6 all-in>"]
  },
  "threatAnalysis": {
    "enemyThreats": ["<amenazas críticas del rival o su jungla en español>"],
    "winCondition": "<condición de victoria clara de la partida para este enfrentamiento>"
  }
}`;

  return { systemInstruction, userPrompt };
}

/**
 * Genera el prompt de reintento correctivo ante un fallo de validación de esquema o nombres.
 */
export function buildCorrectionPrompt(params: {
  originalPrompt: string;
  rawResponseText: string;
  validationError: string;
}): { systemInstruction: string; userPrompt: string } {
  const systemInstruction = `Eres un asistente que corrige respuestas JSON inválidas para una aplicación de League of Legends.
Debes devolver ÚNICAMENTE el objeto JSON corregido en formato estricto, solucionando el error indicado sin inventar IDs numéricos y usando los nombres oficiales de League of Legends.`;

  const userPrompt = `La respuesta anterior falló la validación con el siguiente error:
${params.validationError}

Respuesta anterior recibida:
${params.rawResponseText}

Corrige los errores y devuelve el objeto JSON completo y válido cumpliendo todos los requisitos.`;

  return { systemInstruction, userPrompt };
}

/**
 * Valida si un objeto devuelto por Gemini tiene la estructura mínima necesaria.
 * Acepta tanto el formato basado en nombres (names) como el ya resuelto en IDs (selectedPerkIds).
 */
export function validateGeminiMatchupResponse(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;

  if (typeof d.championId !== 'number') return false;
  if (typeof d.opponentChampionId !== 'number') return false;
  if (typeof d.difficultyRating !== 'number') return false;
  if (typeof d.matchupSummary !== 'string') return false;

  // Runes
  if (!d.runesRecommendation || typeof d.runesRecommendation !== 'object') return false;
  const runes = d.runesRecommendation as Record<string, unknown>;

  const hasNumericPerks = Array.isArray(runes.selectedPerkIds) && runes.selectedPerkIds.length === 9;
  const hasNamedPerks =
    (typeof runes.primaryStyleName === 'string' || typeof runes.primaryStyleId === 'number') &&
    (typeof runes.keystoneName === 'string' || Array.isArray(runes.primaryRunes));

  if (!hasNumericPerks && !hasNamedPerks) return false;

  // Build
  if (!d.buildRecommendation || typeof d.buildRecommendation !== 'object') return false;
  const build = d.buildRecommendation as Record<string, unknown>;
  if (!Array.isArray(build.startingItems) || !Array.isArray(build.coreItems)) return false;

  // Skill Order
  if (!d.skillOrder || typeof d.skillOrder !== 'object') return false;

  return true;
}

/**
 * Genera el prompt para la recomendación inteligente de selección de campeones (Draft Pick).
 */
export function buildDraftRecommendationPrompt(params: {
  role: Role;
  patch: string;
  alliedPicks: Array<{ role?: Role; championName: string }>;
  enemyPicks: Array<{ role?: Role; championName: string }>;
  bans: string[];
  pickableChampionNames: string[];
  userStats?: Array<{ championName: string; winrate: number; totalMatches: number }>;
  isBanPhase?: boolean;
}): { systemInstruction: string; userPrompt: string } {
  const systemInstruction = `Eres un head coach y analista de draft de nivel Challenger en League of Legends.
Tu objetivo es recomendar los 3 MEJORES PICKS para el jugador en su posición asignada (${params.role}) en el parche ${params.patch}.
IMPORTANTE:
- Recomienda ÚNICAMENTE campeones que pertenezcan a la lista de "Campeones Elegibles" proporcionada.
- No inventes IDs ni nombres inexistentes. Usa exclusivamente nombres oficiales en español de League of Legends.
- Si un campeón es muy nuevo o recién salido y no hay suficientes datos históricos o estadísticas, indícalo explícitamente en su razón con ("campeón nuevo, análisis con pocos datos") en vez de inventar datos.
- Evalúa el equilibrio de la composición aliada (daño físico AD vs mágico AP, tanques/frontline, iniciación/engage y control de masas CC) y los contrarrestos directos hacia las amenazas enemigas ya reveladas.
- Devuelve ÚNICAMENTE un objeto JSON estrictamente válido, sin markdown ni explicaciones adicionales fuera del JSON.`;

  const alliesText = params.alliedPicks.length > 0
    ? params.alliedPicks.map(a => `- ${a.role || 'Rol no fijado'}: ${a.championName}`).join('\n')
    : 'Ningún pick aliado fijado todavía.';

  const enemiesText = params.enemyPicks.length > 0
    ? params.enemyPicks.map(e => `- ${e.role || 'Rol por determinar'}: ${e.championName}`).join('\n')
    : 'Ningún pick enemigo revelado todavía.';

  const bansText = params.bans.length > 0 ? params.bans.join(', ') : 'Ninguno';

  const userStatsText = params.userStats && params.userStats.length > 0
    ? params.userStats.map(s => `${s.championName} (${s.winrate}% WR en ${s.totalMatches} partidas)`).join(', ')
    : 'Sin historial previo registrado localmente.';

  const userPrompt = `Analiza la fase de selección de campeón en tiempo real y recomienda los mejores picks:
- Mi Posición Asignada: ${params.role}
- Parche actual: ${params.patch}
- Picks de mi Equipo Aliado:
${alliesText}
- Picks bloqueados del Equipo Enemigo:
${enemiesText}
- Campeones ya baneados en la partida: ${bansText}
- Campeones Disponibles / Elegibles para mí (elige SOLO de esta lista):
${params.pickableChampionNames.slice(0, 80).join(', ')}
- Mis estadísticas personales con campeones:
${userStatsText}

Genera un JSON con exactamente 3 opciones de pick ordenadas por recomendación (la primera es la mejor):
{
  "assignedRole": "${params.role}",
  "allyCompAnalysis": {
    "damageProfile": "<AD_HEAVY | AP_HEAVY | BALANCED>",
    "hasFrontline": <true o false>,
    "hasEngage": <true o false>,
    "hasHardCc": <true o false>,
    "summary": "<breve resumen del estado de nuestra composición>"
  },
  "enemyThreats": ["<amenaza enemiga detectada 1>", "<amenaza 2>"],
  "picks": [
    {
      "championName": "<Nombre exacto de la lista elegible>",
      "fitReason": "<Por qué encaja con nuestro equipo y contra el rival>",
      "threatMitigation": "<Qué amenaza rival contrarresta>",
      "synergyReason": "<Con qué aliado combina>",
      "isNewChampion": <true si es un lanzamiento reciente, false de lo contrario>
    },
    {
      "championName": "<Segundo campeón elegible>",
      "fitReason": "<Razón>",
      "threatMitigation": "<Contrarresto>",
      "synergyReason": "<Sinergia>",
      "isNewChampion": false
    },
    {
      "championName": "<Tercer campeón elegible>",
      "fitReason": "<Razón>",
      "threatMitigation": "<Contrarresto>",
      "synergyReason": "<Sinergia>",
      "isNewChampion": false
    }
  ],
  "recommendedBans": [
    {
      "championName": "<Campeón que recomiendo banear>",
      "reason": "<Por qué es un ban crítico contra este rol o composición>"
    }
  ]
}`;

  return { systemInstruction, userPrompt };
}

/**
 * Valida si la respuesta devuelta por Gemini para draft cumple la estructura.
 */
export function validateGeminiDraftResponse(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.picks) || d.picks.length === 0) return false;
  for (const pick of d.picks) {
    if (!pick || typeof pick !== 'object') return false;
    const p = pick as Record<string, unknown>;
    if (typeof p.championName !== 'string' || p.championName.trim().length === 0) return false;
  }
  return true;
}
