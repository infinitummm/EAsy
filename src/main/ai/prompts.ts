/**
 * Prompts y esquemas de generación estructurada para Google Gemini API.
 * Propiedad exclusiva de ANTIGRAVITY.
 */

import { Role, PatchDiffSummary, PersonalChampionStats, GroundingSource } from '../../shared/types';

/**
 * Catálogo canónico del meta y sistemas vigentes en el Parche 26.20 (Temporada 2026 / Data Dragon 16.20.1).
 * Alimenta a Gemini con el estado actual del juego para evitar alucinaciones de parches o temporadas antiguas.
 */
export const CURRENT_META_CONTEXT_26_20 = `
--- CONTEXTO OFICIAL DEL PARCHE VIGENTE 26.20 (TEMPORADA 2026 / DATA DRAGON 16.20.1) ---
1. SISTEMA DE OBJETOS ACTUAL:
   - Los objetos Míticos FUERON ELIMINADOS del juego. NUNCA menciones "objeto mítico" ni recomiendes mecánicas de míticos.
   - Tiradores / Crítico / AD Carry: Filo Infinito (+80 DA, +25% Crítico), El Coleccionista (+DA, +Letalidad, +Crítico, Ejecución a 5% de vida), Recuerdos de Lord Dominik (+DA, +Crítico, +Penetración de Armadura), Flechas de Yun Tal (+DA, +Crítico, Hemorragia por daño crítico), Cañón de Fuego Rápido, Segador de Esencia, Sanguinaria (Escudo sobrecuración), Puñal de Statikk, Huracán de Runaan, Hoja de Furia de Guinsoo, Hoja del Rey Arruinado, Arcoescudo Inmortal, Cimitarra Mercurial.
   - Magos / AP Carry: Antorcha de Fuego Negro (quema de maná), Malignidad (odio definitivo), Compañero de Luden (disparos cargados), Criptofloración (penetración porcentual y nova curativa), Llama Sombría (crítico mágico a poca vida), Sobrecarga Tormentosa (daño de ráfaga y velocidad), Báculo del Vacío, Sombrero Mortífero de Rabadon, Reloj de Arena de Zhonya, Velo del Hada de la Muerte, Cetro de Cristal de Rylai, Creagrietas, Diente de Nashor, Tormento de Liandry, Abrazo del Serafín, Impulso Cósmico.
   - Luchadores / Bruisers: Cielo Desgarrado (primer ataque con golpe crítico garantizado y curación), Eclipse (escudo protector al conectar 2 ataques o habilidades), Cuchilla Negra (reducción de armadura acumulable y velocidad), Lanza de Shojin (amplificación porcentual de daño de habilidades básicas), Guantelete de Sterak (tenacidad y escudo salvavidas), Hidra Titánica, Hidra Voraz, Cortasendas, Rompehechizos, Fuerza de la Trinidad, Fauces de Malmortius, Danza de la Muerte.
   - Tanques: Fulgor Vano (daño mágico pasivo e inmolación explosiva en súbditos), Kaénico Rookern (escudo masivo contra daño mágico tras no recibir daño), Corazón de Hielo, Presagio de Randuin, Malla de Espinas, Desesperanza Eterna, Máscara Abisal, Égida de Fuego Solar, Jak'Sho el Proteiforme, Coraza del Muerto, Fuerza de la Naturaleza.
   - Asesinos / Letalidad: Espada Voltaica (estallido energizado con ralentización del 99%), Hidra Profana (activo cortante con daño letal a objetivos con poca vida), Oportunidad (letalidad masiva al entrar en combate y velocidad al matar), Rencor de Serylda (penetración de armadura escalada con letalidad), Filo de la Noche, Guja Sombría, Arco Axiomático, Soberbia.
   - Soportes: Oposición Celestial, Trineo del Solsticio, Rompesueños, Detractor de Sangre, Canto de Guerra de Shurelya, Medallón de los Solari de Hierro, Promesa del Caballero, Redención, Bendición de Mikael, Ecos de Helia, Mandato Imperial, Creador de Caminos.
   - Botas: Grebas de Berserker, Botas Blindadas (Plated Steelcaps), Botas de Mercurio, Botas de Hechicero, Botas de Rapidez, Botas Simbióticas / Suelas Simbióticas, Botas Jonias de la Lucidez.

2. SISTEMA DE RUNAS Y FRAGMENTOS ACTUAL:
   - Ramas principales: Precisión, Dominación, Brujería, Inspiración, Valor.
   - Runas Clave comunes: Compás Letal (Lethal Tempo), Ataque Intensificado (Press the Attack), Pies Veloces (Fleet Footwork), Conquistador, Primer Golpe (First Strike), Electrocutar, Cosecha Oscura, Lluvia de Cuchillas, Cometa Arcano, Fase Veloz, Garras del Inmortal, Reverberación, Aumento Glacial.
   - Fragmentos de Estadísticas (Stat Shards) ACTUALES:
     Fila 1 (Ofensiva): Fuerza adaptable (+9) | Velocidad de ataque (+10%) | Aceleración de habilidad (+8).
     Fila 2 (Flexible): Fuerza adaptable (+9) | Velocidad de movimiento (+2%) | Vida progresiva (+10 a 180).
     Fila 3 (Defensiva): Vida plana (+65) | Tenacidad y resistencia a ralentizaciones (+10%) | Vida progresiva (+10 a 180).
     (PROHIBIDO: NUNCA sugieras armadura ni resistencia mágica plana en los fragmentos; fueron retiradas del juego).
---------------------------------------------------------------------------------
`;

/**
 * Genera el prompt para el Paso 1: Investigación del meta y notas del parche actual con Grounding.
 */
export function buildInvestigationPrompt(params: {
  championName: string;
  opponentName: string;
  role: Role;
  patch: string;
  patchDiff?: PatchDiffSummary;
  personalStats?: PersonalChampionStats;
}): { systemInstruction: string; userPrompt: string } {
  const systemInstruction = `Eres un analista de datos e investigador táctico de League of Legends enfocado rigurosamente en el parche actual (${params.patch}).
Tu misión es investigar y resumir la información más fresca, competitiva y veraz sobre el emparejamiento directo en el meta actual.
REGLAS ESTRICTAS DE INVESTIGACIÓN:
1. Prioriza notas de parche oficiales de Riot Games, análisis competitivos y guías de la última semana correspondientes al parche ${params.patch}.
2. Cada afirmación sobre objetos o runas DEBE indicar explícitamente a qué parche corresponde (ej: "En el parche ${params.patch}, el objeto X...").
3. Si un objeto o runa fue eliminado o severamente debilitado en el parche actual, menciónalo explícitamente y prohíbe su recomendación.
4. Cita fuentes concretas con nombres de sitios o notas de parche.`;

  let contextChanges = '';
  if (params.patchDiff) {
    if (params.patchDiff.removedItems && params.patchDiff.removedItems.length > 0) {
      contextChanges += `\n- OBJETOS ELIMINADOS EN ESTE PARCHE (PROHIBIDO RECOMENDAR): ${params.patchDiff.removedItems.map(i => i.name).join(', ')}`;
    }
    if (params.patchDiff.changedItems && params.patchDiff.changedItems.length > 0) {
      contextChanges += `\n- OBJETOS CON CAMBIOS DE STATS/PASIVAS EN EL PARCHE ${params.patch}: ${params.patchDiff.changedItems.map(i => i.name).join(', ')}`;
    }
    if (params.patchDiff.removedRunes && params.patchDiff.removedRunes.length > 0) {
      contextChanges += `\n- RUNAS ELIMINADAS O DESACTIVADAS: ${params.patchDiff.removedRunes.map(r => r.name).join(', ')}`;
    }
  }

  let personalContext = '';
  if (params.personalStats && params.personalStats.totalGames > 0) {
    personalContext = `\n- Historial del jugador con ${params.championName}: ${params.personalStats.totalGames} partidas registradas (${params.personalStats.winrate}% winrate).`;
    if (params.personalStats.mostBuiltItems && params.personalStats.mostBuiltItems.length > 0) {
      personalContext += ` Objetos más exitosos: ${params.personalStats.mostBuiltItems.slice(0, 3).map(i => `${i.name} (${i.winrate}% WR)`).join(', ')}.`;
    }
    if (params.personalStats.matchupGames && params.personalStats.matchupGames.games > 0) {
      personalContext += ` Historial directo contra ${params.opponentName}: ${params.personalStats.matchupGames.games} partidas (${params.personalStats.matchupGames.winrate}% WR).`;
    }
  }

  const userPrompt = `Investiga la mejor configuración competitiva para el parche actual (${params.patch}):
- Campeón propio: ${params.championName}
- Rival directo en línea: ${params.opponentName}
- Posición / Rol: ${params.role}
- Parche vigente: ${params.patch}
${contextChanges}
${personalContext}

Proporciona:
1. Meta actual de ${params.championName} en ${params.role}: objetos core indispensables, botas y objetos situacionales clave contra ${params.opponentName}.
2. Configuración de runas más sólida en el parche ${params.patch} (Runa clave, rama primaria, rama secundaria y fragmentos).
3. Cómo afectan los cambios recientes del parche a este enfrentamiento específico.
4. Resumen de hallazgos y fuentes/sitios consultados.`;

  return { systemInstruction, userPrompt };
}

/**
 * Genera el prompt para el Paso 2: Conversión estructurada a JSON de los hallazgos de investigación.
 */
export function buildTwoStepStructuredPrompt(params: {
  championId: number;
  championName: string;
  opponentId: number;
  opponentName: string;
  role: Role;
  patch: string;
  researchText: string;
  sources?: GroundingSource[];
  patchDiff?: PatchDiffSummary;
  personalStats?: PersonalChampionStats;
  allies?: number[];
  enemies?: number[];
}): { systemInstruction: string; userPrompt: string } {
  const systemInstruction = `Eres un coach profesional Challenger y analista de élite de League of Legends.
Tu misión es estructurar los hallazgos de investigación del meta del parche actual (${params.patch} / 26.20) en una recomendación táctica definitiva en formato JSON estricto.
${CURRENT_META_CONTEXT_26_20}
REGLAS MANDATORIAS:
1. Para runas y objetos, proporciona sus NOMBRES OFICIALES en español (por ejemplo: "Compás letal", "Claridad mental", "Espada de Doran", "El Coleccionista", "Flechas de Yun Tal"). NO inventes IDs numéricos.
2. PROHIBIDO terminantemente incluir objetos o runas eliminados en este parche.
3. El análisis táctico debe ser profundo y responder directamente a la investigación realizada.
4. Responde ÚNICAMENTE un único objeto JSON válido sin texto adicional antes o después, sin bloques de markdown.`;

  let bannedItemsNotice = '';
  if (params.patchDiff?.removedItems && params.patchDiff.removedItems.length > 0) {
    bannedItemsNotice = `\nOBJETOS ELIMINADOS EN EL PARCHE ${params.patch} (NUNCA RECOMENDAR): ${params.patchDiff.removedItems.map(i => i.name).join(', ')}`;
  }

  let bannedRunesNotice = '';
  if (params.patchDiff?.removedRunes && params.patchDiff.removedRunes.length > 0) {
    bannedRunesNotice = `\nRUNAS ELIMINADAS EN EL PARCHE ${params.patch} (NUNCA RECOMENDAR): ${params.patchDiff.removedRunes.map(r => r.name).join(', ')}`;
  }

  const userPrompt = `Convierte la investigación y el meta del parche actual (${params.patch}) en la recomendación final:
- Mi Campeón: ${params.championName} (ID: ${params.championId})
- Campeón Rival directo: ${params.opponentName} (ID: ${params.opponentId})
- Posición / Rol: ${params.role}
- Parche en curso: ${params.patch}
${bannedItemsNotice}
${bannedRunesNotice}

INVESTIGACIÓN RECIENTE DEL PARCHE ${params.patch}:
"""
${params.researchText}
"""

Genera el JSON final cumpliendo estrictamente con este esquema:
{
  "championId": ${params.championId},
  "opponentChampionId": ${params.opponentId},
  "assignedRole": "${params.role}",
  "patchVersion": "${params.patch}",
  "difficultyRating": <entero de 1 a 10>,
  "matchupSummary": "<resumen táctico en español explicando la dinámica de la línea basado en el parche ${params.patch}>",
  "runesRecommendation": {
    "primaryStyleName": "<Precisión | Dominación | Brujería | Inspiración | Valor>",
    "subStyleName": "<rama secundaria>",
    "keystoneName": "<nombre oficial runa clave>",
    "primaryRunes": ["<runa fila 1>", "<runa fila 2>", "<runa fila 3>"],
    "secondaryRunes": ["<runa secundaria 1>", "<runa secundaria 2>"],
    "statShards": ["<fragmento 1 ofensivo>", "<fragmento 2 flexible>", "<fragmento 3 defensivo>"],
    "rationale": "<justificación táctica>"
  },
  "buildRecommendation": {
    "startingItems": ["<ítem inicio 1>", "<ítem inicio 2>"],
    "boots": "<nombre de botas>",
    "coreItems": ["<objeto core 1>", "<objeto core 2>", "<objeto core 3>"],
    "situationalItems": [
      { "itemName": "<nombre objeto situacional>", "condition": "<situación o rival>" }
    ],
    "rationale": "<explicación del orden de compras en el parche ${params.patch}>"
  },
  "skillOrder": {
    "priority": ["Q", "W", "E", "R"],
    "firstThreeLevels": ["Q", "W", "E"],
    "rationale": "<orden en los primeros 3 niveles>"
  },
  "earlyGameStrategy": {
    "waveManagement": "<gestión de oleadas niv 1-4>",
    "tradingPlan": "<plan de intercambios y enfriamientos>",
    "levelSpikes": ["<pico de poder 1>", "<pico de poder 2>"]
  },
  "threatAnalysis": {
    "enemyThreats": ["<amenazas principales>"],
    "winCondition": "<condición de victoria clara>"
  }
}`;

  return { systemInstruction, userPrompt };
}

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
Tu misión es generar recomendaciones tácticas hiperprecisas, óptimas para el parche actual (${params.patch} / 26.20), en formato JSON estricto.
${CURRENT_META_CONTEXT_26_20}
IMPORTANTE:
- Para runas y objetos, proporciona sus NOMBRES OFICIALES en español (por ejemplo: "Compás letal", "Claridad mental", "Espada de Doran", "El Coleccionista", "Flechas de Yun Tal"). NO inventes IDs numéricos.
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
