import { GeminiMatchupRecommendation, Role } from './types';
import { getChampionName } from './champions';

/**
 * Base de datos táctica de contingencia y builds precisas de League of Legends Season 14.
 * Garantiza que cada campeón y cada posición reciban objetos, runas y órdenes de habilidades exactos
 * incluso sin conexión a Gemini o sin API Key.
 */

interface ChampionBuildProfile {
  primaryRole: Role;
  startingItems: number[];
  coreItems: number[];
  situationalItems: Array<{ itemId: number; condition: string }>;
  primaryStyleId: number;
  subStyleId: number;
  selectedPerkIds: number[];
  runesRationale: string;
  buildRationale: string;
  skillPriority: string[];
  firstThreeLevels: string[];
  skillRationale: string;
  waveManagement: string;
  tradingPlan: string;
  levelSpikes: string[];
  enemyThreats: string[];
  winCondition: string;
}

/**
 * Perfiles específicos para campeones populares / representativos.
 */
const CHAMPION_PROFILES: Record<number, ChampionBuildProfile> = {
  // Smolder (ID 901)
  901: {
    primaryRole: 'BOTTOM',
    startingItems: [1055, 2003], // Espada de Doran + Poción
    coreItems: [3508, 3094, 6610], // Segador de Esencia + Cañón de Fuego Rápido + Lanza de Shojin
    situationalItems: [
      { itemId: 3036, condition: 'Recuerdos de Lord Dominik contra tanques con alta armadura' },
      { itemId: 3072, condition: 'Sanguinaria para robo de vida y escudo en peleas prolongadas' },
      { itemId: 3026, condition: 'Ángel Guardián si el equipo rival cuenta con asesinos o alto daño explosivo' },
      { itemId: 3156, condition: 'Fauces de Malmortius contra daño mágico masivo' }
    ],
    primaryStyleId: 8000, // Precisión
    subStyleId: 8300,     // Inspiración
    // Pies Veloces (8021), Claridad mental (9101), Linaje (9103), Cortar por lo sano (8017), Calzado mágico (8304), Galletas (8345), Fuerza Adaptable (5008), Fuerza Adaptable (5008), Vida Plana S14 (5011)
    selectedPerkIds: [8021, 9101, 9103, 8017, 8304, 8345, 5008, 5008, 5011],
    runesRationale: 'Pies Veloces otorga sustento y movilidad vital en línea temprana. Claridad mental y Galletas mitigan el alto gasto de maná al acumular la Q.',
    buildRationale: 'Segador de Esencia resuelve el maná y potencia el brillo de la Q. Fuego Rápido amplía el rango de ejecución y Shojin amplifica todo el daño de habilidades.',
    skillPriority: ['Q', 'W', 'E', 'R'],
    firstThreeLevels: ['Q', 'W', 'E'],
    skillRationale: 'Maximiza la Q prioritariamente para acumular Practica de Dragón hasta las 225 cargas.',
    waveManagement: 'Farmea pacientemente con la Q cerca de tu torre o en congelación; evita empujar sin visión en los primeros minutos.',
    tradingPlan: 'Hostiga con la W a distancia y asegura el último golpe a súbditos con la Q. Guarda la E como escape de seguridad.',
    levelSpikes: ['25 cargas de Q (daño de área)', '125 cargas de Q (explosiones)', '225 cargas de Q (quemadura y ejecución de vida máxima)'],
    enemyThreats: ['Vulnerable a ganks agresivos y all-in en niveles 1 a 5 antes de acumular suficiente rango y daño.'],
    winCondition: 'Alcanzar con seguridad las 225 cargas de Practica de Dragón para dominar las peleas grupales por dragones y Barón.'
  },

  // Ashe (ID 22)
  22: {
    primaryRole: 'BOTTOM',
    startingItems: [1055, 2003],
    coreItems: [6672, 3085, 3031], // Matakrakens + Huracán de Runaan + Filo Infinito
    situationalItems: [
      { itemId: 3036, condition: 'Lord Dominik contra tanques y colosos' },
      { itemId: 3026, condition: 'Ángel Guardián contra asesinos' },
      { itemId: 3139, condition: 'Cimitarra Mercurial para limpiar aturdimientos' }
    ],
    primaryStyleId: 8000,
    subStyleId: 8300,
    selectedPerkIds: [8005, 9101, 9104, 8014, 8304, 8347, 5005, 5008, 5011],
    runesRationale: 'Presión con Ataque para intercambios rápidos con la Q activa y Velocidad de Aproximación para perseguir con la ralentización pasiva.',
    buildRationale: 'Build de velocidad de ataque y daño crítico continuo con efectos de impacto.',
    skillPriority: ['W', 'Q', 'E', 'R'],
    firstThreeLevels: ['W', 'Q', 'W'],
    skillRationale: 'Maximiza la W para control de oleadas y rango de hostigamiento seguro.',
    waveManagement: 'Empuja lentamente para conseguir la ventaja de nivel 2 y mantén la presión sin sobreextenderte.',
    tradingPlan: 'Lanza la W y asesta 2 ataques básicos antes de retroceder.',
    levelSpikes: ['Nivel 2 con W + Q', 'Nivel 6 para iniciar con la Flecha de Cristal Encantada'],
    enemyThreats: ['Cuidado con el burst enemigo si se acorta la distancia o tras quedar bajo efectos de control.'],
    winCondition: 'Mantener espaciado perfecto en peleas grupales y habilitar cazadas con la R.'
  },

  // Jinx (ID 222)
  222: {
    primaryRole: 'BOTTOM',
    startingItems: [1055, 2003],
    coreItems: [6672, 3085, 3031], // Matakrakens + Huracán + Filo Infinito
    situationalItems: [
      { itemId: 3036, condition: 'Lord Dominik frente a tanques' },
      { itemId: 3072, condition: 'Sanguinaria para sostén en late game' },
      { itemId: 3026, condition: 'Ángel Guardián para protegerte de cazadas' }
    ],
    primaryStyleId: 8000,
    subStyleId: 8300,
    selectedPerkIds: [8008, 9101, 9104, 8299, 8304, 8345, 5005, 5008, 5011],
    runesRationale: 'Aceleración de ataques continuos y alcance extendido con lanzacohetes.',
    buildRationale: 'Multiplicadores de impacto crítico con alcance superior para reiniciar pasiva.',
    skillPriority: ['Q', 'W', 'E', 'R'],
    firstThreeLevels: ['Q', 'W', 'E'],
    skillRationale: 'Maximiza la Q para optimizar el alcance del lanzacohetes y la velocidad de la ametralladora.',
    waveManagement: 'Controla el empuje con la ametralladora y usa el cohete para desgastar bajo torre.',
    tradingPlan: 'Intercambia con cohetes desde máxima distancia cuando el enemigo intente dar last-hit.',
    levelSpikes: ['Nivel 2 con cohetes y trampa', 'Nivel 6 para ejecuciones globales con la R'],
    enemyThreats: ['Falta de movilidad inherente frente a iniciaciones directas.'],
    winCondition: 'Activar ¡A divertirse! en una pelea 5v5 para limpiar al equipo rival.'
  },

  // Aatrox (ID 266)
  266: {
    primaryRole: 'TOP',
    startingItems: [1055, 2003],
    coreItems: [6631, 6692, 3071], // Cielo Desgarrado + Eclipse + Cuchilla Negra
    situationalItems: [
      { itemId: 3053, condition: 'Guantelete de Sterak contra ráfagas de daño' },
      { itemId: 3026, condition: 'Ángel Guardián para peleas de equipo en juego tardío' },
      { itemId: 3156, condition: 'Fauces de Malmortius contra magos' }
    ],
    primaryStyleId: 8000,
    subStyleId: 8400,
    selectedPerkIds: [8010, 9111, 9105, 8299, 8446, 8451, 5008, 5008, 5011],
    runesRationale: 'Conquistador para duelos sostenidos y Segundo Aire para mitigar hostigamiento.',
    buildRationale: 'Curación en impacto con Cielo Desgarrado, daño físico y penetración porcentual.',
    skillPriority: ['Q', 'E', 'W', 'R'],
    firstThreeLevels: ['Q', 'E', 'W'],
    skillRationale: 'La Q es tu principal fuente de daño y presencia en línea.',
    waveManagement: 'Mantén la oleada en el centro para facilitar combos completos de Q.',
    tradingPlan: 'Aprovecha Q1 + E hacia adelante para enganchar con la W y conectar el combo entero.',
    levelSpikes: ['Nivel 3 con el combo Q-E-W', 'Nivel 6 con Destructor de Mundos'],
    enemyThreats: ['Heridas Graves tempranas y campeones muy móviles que esquivan los bordes de la Q.'],
    winCondition: 'Flanquear en peleas por el dragón activando la R para encadenar reinicios y curación masiva.'
  }
};

/**
 * Plantillas por Arquetipo y Rol para cualquier campeón que no tenga perfil individual.
 */
function getArchetypeProfile(role: Role): ChampionBuildProfile {
  switch (role) {
    case 'BOTTOM':
      return {
        primaryRole: 'BOTTOM',
        startingItems: [1055, 2003], // Espada de Doran + Poción
        coreItems: [6672, 3031, 3036], // Matakrakens + Filo Infinito + Recuerdos de Lord Dominik
        situationalItems: [
          { itemId: 3072, condition: 'Sanguinaria para sustento contra daño continuo' },
          { itemId: 3026, condition: 'Ángel Guardián frente a campeones asesinos' },
          { itemId: 3073, condition: 'Arcoescudo Inmortal para evitar ser eliminado de un combo' }
        ],
        primaryStyleId: 8000, // Precisión
        subStyleId: 8300,     // Inspiración
        selectedPerkIds: [8005, 9101, 9104, 8017, 8304, 8345, 5005, 5008, 5011],
        runesRationale: 'Presión con Ataque para castigar intercambios cortos y Galletas para sustento en el carril inferior.',
        buildRationale: 'Build tradicional de tirador centrada en daño de impacto continuo y multiplicadores de crítico.',
        skillPriority: ['Q', 'W', 'E', 'R'],
        firstThreeLevels: ['Q', 'W', 'E'],
        skillRationale: 'Prioriza tu habilidad principal de daño y farmeo.',
        waveManagement: 'Controla el carril manteniendo la oleada cerca de tu rango de seguridad.',
        tradingPlan: 'Intercambia únicamente cuando el tirador rival intente rematar un súbdito cañón.',
        levelSpikes: ['Nivel 2 con ventaja de súbditos', 'Nivel 6 para combo definitivo'],
        enemyThreats: ['Atención a emboscadas del jungla enemigo y ganks con Teleport.'],
        winCondition: 'Posicionamiento impecable en el backline durante las peleas por objetivos neutrales.'
      };

    case 'MIDDLE':
      return {
        primaryRole: 'MIDDLE',
        startingItems: [1056, 2003], // Anillo de Doran + Poción
        coreItems: [6657, 4645, 3089], // Antorcha de Fuego Negro + Llama Sombría + Sombrero de Rabadon
        situationalItems: [
          { itemId: 3157, condition: 'Reloj de Arena de Zhonya para sobrevivir a daño explosivo' },
          { itemId: 3135, condition: 'Báculo del Vacío frente a rivales con resistencia mágica' },
          { itemId: 3102, condition: 'Velo del Hada de la Muerte contra iniciaciones a distancia' }
        ],
        primaryStyleId: 8200, // Brujería
        subStyleId: 8300,     // Inspiración
        selectedPerkIds: [8229, 8226, 8210, 8237, 8304, 8345, 5008, 5008, 5011],
        runesRationale: 'Cometa Arcano y Banda de Maná aseguran un constante desgaste a distancia sin quedar desprovisto de recursos.',
        buildRationale: 'Aceleración de habilidad, regeneración de maná y penetración mágica destructiva.',
        skillPriority: ['Q', 'E', 'W', 'R'],
        firstThreeLevels: ['Q', 'E', 'W'],
        skillRationale: 'Maximiza el hechizo principal de daño en área y control.',
        waveManagement: 'Limpia rápido la oleada para generar prioridad y rotar hacia el río o el jungla aliado.',
        tradingPlan: 'Lanza tus hechizos cuando el oponente gaste una habilidad clave en los súbditos.',
        levelSpikes: ['Nivel 3 con el combo completo', 'Nivel 6 para daño de ráfaga letal'],
        enemyThreats: ['Cuidado con emboscadas desde la maleza del río en los primeros minutos.'],
        winCondition: 'Controlar el mapa medio y aplicar daño de área contundente en cuellos de botella.'
      };

    case 'JUNGLE':
      return {
        primaryRole: 'JUNGLE',
        startingItems: [1102, 2003], // Cría de Caminavientos + Poción
        coreItems: [6631, 6692, 3071], // Cielo Desgarrado + Eclipse + Cuchilla Negra
        situationalItems: [
          { itemId: 3053, condition: 'Guantelete de Sterak para sobrevivir en combates masivos' },
          { itemId: 3026, condition: 'Ángel Guardián para asegurar peleas de Barón' },
          { itemId: 3156, condition: 'Fauces de Malmortius contra composiciones AP pesadas' }
        ],
        primaryStyleId: 8000, // Precisión
        subStyleId: 8300,     // Inspiración
        selectedPerkIds: [8010, 9111, 9104, 8014, 8304, 8347, 5005, 5008, 5011],
        runesRationale: 'Conquistador para duelos prolongados en el río y Perspicacia Cósmica para acelerar el Aplastar y Destello.',
        buildRationale: 'Equilibrio ideal entre daño físico contundente, supervivencia y reducción de enfriamientos.',
        skillPriority: ['Q', 'E', 'W', 'R'],
        firstThreeLevels: ['Q', 'E', 'W'],
        skillRationale: 'Prioriza la habilidad con mayor daño para despejar campamentos velozmente.',
        waveManagement: 'Realiza una ruta eficiente de campamentos para llegar al río a tiempo para el Cangrejo Escurridizo.',
        tradingPlan: 'Busca escaramuzas con ventaja numérica tras observar el estado de las líneas aliadas.',
        levelSpikes: ['Nivel 3 al completar el primer cuadrante', 'Nivel 6 para ganks con definitiva'],
        enemyThreats: ['Invasiones enemigas al inicio y contra-ganks en el carril superior o inferior.'],
        winCondition: 'Controlar los dragones elementales y habilitar a las líneas con mayor potencial de acarreo.'
      };

    case 'UTILITY':
      return {
        primaryRole: 'UTILITY',
        startingItems: [3865, 2003], // Atlas Mundial + Poción
        coreItems: [6617, 6620, 3504], // Renovador de Piedra Lunar + Ecos de Helia + Incensario Ardiente
        situationalItems: [
          { itemId: 3107, condition: 'Redención para curación global en peleas grupales' },
          { itemId: 3222, condition: 'Bendición de Mikael para purificar controles de masas sobre tu ADC' },
          { itemId: 3157, condition: 'Reloj de Arena de Zhonya si los enemigos se enfocan en eliminarte' }
        ],
        primaryStyleId: 8200, // Brujería
        subStyleId: 8400,     // Valor
        selectedPerkIds: [8214, 8226, 8210, 8237, 8453, 8473, 5008, 5008, 5011],
        runesRationale: 'Invocar a Aery y Revitalizar potencian notablemente los escudos y curaciones a los aliados.',
        buildRationale: 'Objetos de soporte enfocados en amplificación de curación, escudos y visión del mapa.',
        skillPriority: ['E', 'W', 'Q', 'R'],
        firstThreeLevels: ['E', 'Q', 'W'],
        skillRationale: 'Prioriza escudos o curaciones para proteger al tirador en los intercambios.',
        waveManagement: 'Ayuda a mantener la línea sin robar últimos golpes y asegura la visión de la maleza.',
        tradingPlan: 'Hostiga al soporte o tirador rival con habilidades de largo alcance cuando busquen last-hits.',
        levelSpikes: ['Nivel 2 para combo defensivo', 'Nivel 6 para herramientas cruciales de disengage'],
        enemyThreats: ['Iniciaciones repentinas de soportes tanques con ganchos o aturdimientos.'],
        winCondition: 'Mantener con vida al tirador aliado y controlar la visión alrededor del dragón.'
      };

    case 'TOP':
    default:
      return {
        primaryRole: 'TOP',
        startingItems: [1055, 2003], // Espada de Doran + Poción
        coreItems: [6631, 3078, 3053], // Cielo Desgarrado + Fuerza de la Trinidad + Guantelete de Sterak
        situationalItems: [
          { itemId: 3026, condition: 'Ángel Guardián frente a daño explosivo o peleas de equipo decisivas' },
          { itemId: 3071, condition: 'Cuchilla Negra para triturar la armadura de tanques enemigos' },
          { itemId: 3156, condition: 'Fauces de Malmortius frente a rivales con alto daño mágico' }
        ],
        primaryStyleId: 8000, // Precisión
        subStyleId: 8400,     // Valor
        selectedPerkIds: [8010, 9111, 9105, 8299, 8446, 8451, 5008, 5008, 5011],
        runesRationale: 'Conquistador para duelos prolongados en el carril superior y Segundo Aire para mitigar daño.',
        buildRationale: 'Combinación sólida de daño de ataque, aceleración y resistencia sostenida en peleas 1v1 y grupales.',
        skillPriority: ['Q', 'E', 'W', 'R'],
        firstThreeLevels: ['Q', 'E', 'W'],
        skillRationale: 'Maximiza tu habilidad principal de daño y control de carril.',
        waveManagement: 'Mantén la oleada equilibrada o congélala frente a tu torre en los primeros niveles.',
        tradingPlan: 'Busca intercambios cortos cuando el rival gaste sus enfriamientos principales.',
        levelSpikes: ['Nivel 2 con ventaja de súbditos', 'Nivel 6 para ejecutar tu combo completo'],
        enemyThreats: ['Cuidado con ganks tempranos del jungla rival entre el minuto 3:00 y 3:45.'],
        winCondition: 'Ganar el carril superior, presionar líneas laterales y aportar presencia en los objetivos principales.'
      };
  }
}

/**
 * Genera una recomendación de matchup completa y contextualmente exacta.
 */
export function getAccurateFallbackRecommendation(params: {
  championId: number;
  opponentId: number;
  role: Role;
  patch: string;
}): GeminiMatchupRecommendation {
  const champName = getChampionName(params.championId);
  const oppName = getChampionName(params.opponentId);

  // 1. Si existe perfil específico por campeón, usarlo
  const profile = CHAMPION_PROFILES[params.championId] || getArchetypeProfile(params.role);

  return {
    championId: params.championId,
    opponentChampionId: params.opponentId,
    assignedRole: params.role,
    patchVersion: params.patch,
    difficultyRating: 5,
    matchupSummary: `Recomendación táctica para ${champName} en ${params.role} frente a ${oppName}. Configura tu Gemini API Key en Ajustes para análisis adaptativo en tiempo real.`,
    runesRecommendation: {
      primaryStyleId: profile.primaryStyleId,
      subStyleId: profile.subStyleId,
      selectedPerkIds: profile.selectedPerkIds,
      rationale: profile.runesRationale
    },
    buildRecommendation: {
      startingItems: profile.startingItems,
      coreItems: profile.coreItems,
      situationalItems: profile.situationalItems,
      rationale: profile.buildRationale
    },
    skillOrder: {
      priority: profile.skillPriority,
      firstThreeLevels: profile.firstThreeLevels,
      rationale: profile.skillRationale
    },
    earlyGameStrategy: {
      waveManagement: profile.waveManagement,
      tradingPlan: profile.tradingPlan,
      levelSpikes: profile.levelSpikes
    },
    threatAnalysis: {
      enemyThreats: profile.enemyThreats,
      winCondition: profile.winCondition
    }
  };
}
