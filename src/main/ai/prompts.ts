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

  const systemInstruction = `Eres un coach y analista profesional de League of Legends de nivel Challenger.
Tu misión es generar recomendaciones tácticas hiperprecisas, óptimas para el parche actual (${params.patch}), en formato JSON estricto.
Debes responder SIEMPRE un único objeto JSON válido sin texto adicional antes o después, sin markdown ni bloques de código redundantes si se solicita formato directo.`;

  const userPrompt = `Analiza detalladamente el siguiente enfrentamiento en League of Legends:
- Mi Campeón: ${champ} (ID: ${params.championId})
- Campeón Rival directo en línea: ${opponent} (ID: ${params.opponentId})
- Rol / Posición: ${params.role}
- Parche actual del juego: ${params.patch}
${params.allies && params.allies.length > 0 ? `- Aliados de mi equipo (IDs): ${params.allies.join(', ')}` : ''}
${params.enemies && params.enemies.length > 0 ? `- Composición enemiga completa (IDs): ${params.enemies.join(', ')}` : ''}

Proporciona la mejor estrategia, configuración de runas, orden de habilidades y build óptima.
El resultado debe ser un JSON que cumpla EXACTAMENTE con esta estructura de tipos:

{
  "championId": ${params.championId},
  "opponentChampionId": ${params.opponentId},
  "assignedRole": "${params.role}",
  "patchVersion": "${params.patch}",
  "difficultyRating": <número del 1 al 10 donde 1 es muy fácil y 10 es casi imposible>,
  "matchupSummary": "<explicación concisa en español de la dinámica de la línea y ventajas clave>",
  "runesRecommendation": {
    "primaryStyleId": <ID numérico de la rama primaria, ej. 8000 Precisión, 8100 Dominación, 8200 Brujería, 8300 Inspiración, 8400 Valor>,
    "subStyleId": <ID numérico de la rama secundaria>,
    "selectedPerkIds": [<array de exactamente 9 números enteros: 1 keystone + 3 primarias + 2 secundarias + 3 stat shards. IMPORTANTE: en temporada 14 los stat shards son: Slot 1: 5008/5005/5007; Slot 2: 5008/5010/5001; Slot 3: 5011/5013/5001. NUNCA uses 5002 ni 5003 porque están eliminados del juego>],
    "rationale": "<justificación táctica de esta elección de runas para este matchup específico en español>"
  },
  "buildRecommendation": {
    "startingItems": [<IDs numéricos de los ítems de inicio, ej. Poción, Doran, etc.>],
    "coreItems": [<IDs numéricos de los 3 ítems centrales fundamentales en orden de compra>],
    "situationalItems": [
      { "itemId": <número ID>, "condition": "<cuándo comprar este ítem, en español>" }
    ],
    "rationale": "<explicación del orden de compras y picos de poder en español>"
  },
  "skillOrder": {
    "priority": ["Q", "E", "W", "R"],
    "firstThreeLevels": ["Q", "E", "W"],
    "rationale": "<por qué este orden de subida en los primeros niveles>"
  },
  "earlyGameStrategy": {
    "waveManagement": "<cómo manejar la oleada en los niveles 1 al 4, ej. slow push, freeze, crash>",
    "tradingPlan": "<cómo y cuándo hacer intercambios de daño favorables>",
    "levelSpikes": ["<ej: Nivel 2 power spike>", "<ej: Nivel 6 all-in>"]
  },
  "threatAnalysis": {
    "enemyThreats": ["<amenazas principales del rival o su jungla en español>"],
    "winCondition": "<condición de victoria de la partida para este matchup en español>"
  }
}`;

  return { systemInstruction, userPrompt };
}

/**
 * Schema JSON esperado de la recomendación de Gemini para validación en tiempo de ejecución.
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
  if (!Array.isArray(runes.selectedPerkIds) || runes.selectedPerkIds.length !== 9) return false;

  // Build
  if (!d.buildRecommendation || typeof d.buildRecommendation !== 'object') return false;
  const build = d.buildRecommendation as Record<string, unknown>;
  if (!Array.isArray(build.startingItems) || !Array.isArray(build.coreItems)) return false;

  // Skill Order
  if (!d.skillOrder || typeof d.skillOrder !== 'object') return false;

  return true;
}
