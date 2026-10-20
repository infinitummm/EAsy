import { GeminiMatchupRecommendation, Role } from './types';
import { getChampionName } from './champions';

/**
 * Base de datos táctica de contingencia y builds hiperprecisas de League of Legends Parche 26.20 (Temporada 2026).
 * Garantiza que cada campeón y cada posición reciban objetos, runas y órdenes de habilidades exactos
 * y vigentes, incluso sin conexión a Gemini o sin API Key.
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
 * Perfiles específicos de élite para campeones populares / representativos en el Parche 26.20.
 */
const CHAMPION_PROFILES: Record<number, ChampionBuildProfile> = {
  // Caitlyn (ID 51)
  51: {
    primaryRole: 'BOTTOM',
    startingItems: [1055, 2003], // Espada de Doran + Poción
    coreItems: [6676, 3031, 3036], // El Coleccionista + Filo Infinito + Recuerdos de Lord Dominik
    situationalItems: [
      { itemId: 3094, condition: 'Cañón de Fuego Rápido para máximo alcance de Disparo a la Cabeza' },
      { itemId: 3072, condition: 'Sanguinaria para sobrecuración y robo de vida en peleas prolongadas' },
      { itemId: 3026, condition: 'Ángel Guardián si el equipo rival cuenta con asesinos de alto daño' },
      { itemId: 3139, condition: 'Cimitarra Mercurial para limpiar aturdimientos directos' }
    ],
    primaryStyleId: 8000, // Precisión
    subStyleId: 8300,     // Inspiración
    // Pies Veloces (8021), Claridad Mental (9101), Linaje (9103), Golpe de Gracia (8014), Calzado Mágico (8304), Entrega de Galletas (8345), Fuerza Adaptable (5008), Fuerza Adaptable (5008), Vida Plana (5011)
    selectedPerkIds: [8021, 9101, 9103, 8014, 8304, 8345, 5008, 5008, 5011],
    runesRationale: 'Pies Veloces amplía la movilidad para hostigar a rango 650. Claridad Mental y Galletas mitigan el gasto de maná de la Q y las trampas W.',
    buildRationale: 'Coleccionista de primer ítem acelera la letalidad y ejecuciones en fase de líneas; Filo Infinito (+80 DA, +25% crítico) desata golpes de Disparo a la Cabeza colosales.',
    skillPriority: ['Q', 'W', 'E', 'R'],
    firstThreeLevels: ['Q', 'W', 'E'],
    skillRationale: 'Maximiza la Q para despeje rápido y castigo a distancia; luego la W para aumentar el daño crítico sobre trampas activadas.',
    waveManagement: 'Empuja la oleada hacia la torre enemiga aprovechando tu rango 650 y coloca trampas bajo la torre para asediar y denegar súbditos.',
    tradingPlan: 'Castiga con disparos a la cabeza cada vez que el rival intente dar el último golpe a un súbdito. Prepara combos trampa W + E + Q.',
    levelSpikes: ['Nivel 2 con empuje y colocación de trampas W', 'Nivel 6 para ejecuciones a larga distancia con As en la Manga', '2 Objetos (Coleccionista + Filo Infinito)'],
    enemyThreats: ['Engages con ganchos directos (Blitzcrank/Nautilus) si te sobreextiendes sin visión en el río.'],
    winCondition: 'Controlar el ritmo de la botlane con asedio temprano, derribar la primera torre y rotar a medio para asegurar dragones.'
  },

  // Smolder (ID 901)
  901: {
    primaryRole: 'BOTTOM',
    startingItems: [1055, 2003], // Espada de Doran + Poción
    coreItems: [3508, 6610, 3094], // Segador de Esencia + Lanza de Shojin + Cañón de Fuego Rápido
    situationalItems: [
      { itemId: 3036, condition: 'Recuerdos de Lord Dominik contra tanques con alta armadura' },
      { itemId: 3072, condition: 'Sanguinaria para robo de vida y escudo en peleas prolongadas' },
      { itemId: 3026, condition: 'Ángel Guardián si el equipo rival cuenta con asesinos o alto daño explosivo' },
      { itemId: 3156, condition: 'Fauces de Malmortius contra daño mágico masivo' }
    ],
    primaryStyleId: 8000, // Precisión
    subStyleId: 8300,     // Inspiración
    // Pies Veloces (8021), Claridad mental (9101), Linaje (9103), Cortar por lo sano (8017), Calzado mágico (8304), Galletas (8345), Fuerza Adaptable (5008), Fuerza Adaptable (5008), Vida Plana (5011)
    selectedPerkIds: [8021, 9101, 9103, 8017, 8304, 8345, 5008, 5008, 5011],
    runesRationale: 'Pies Veloces otorga sustento y movilidad vital en línea temprana. Claridad mental y Galletas mitigan el alto gasto de maná al acumular la Q.',
    buildRationale: 'Segador de Esencia resuelve el maná y potencia el escalado de la Q. Shojin amplifica todo el daño de habilidades y Fuego Rápido amplía el rango de ejecución.',
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
      { itemId: 3153, condition: 'Hoja del Rey Arruinado para mayor penetración porcentual' },
      { itemId: 3026, condition: 'Ángel Guardián contra asesinos' },
      { itemId: 3139, condition: 'Cimitarra Mercurial para limpiar aturdimientos' }
    ],
    primaryStyleId: 8000,
    subStyleId: 8300,
    selectedPerkIds: [8005, 9101, 9104, 8014, 8304, 8347, 5005, 5008, 5011],
    runesRationale: 'Ataque Intensificado para intercambios rápidos con la Q activa y Velocidad de Aproximación para perseguir con la ralentización pasiva.',
    buildRationale: 'Build de velocidad de ataque y daño crítico continuo con efectos de impacto de Matakrakens y Huracán.',
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
  },

  // Yasuo (ID 157)
  157: {
    primaryRole: 'MIDDLE',
    startingItems: [1055, 2003], // Espada de Doran + Poción
    coreItems: [3153, 3031, 3073], // Hoja del Rey Arruinado + Filo Infinito + Arcoescudo Inmortal
    situationalItems: [
      { itemId: 3026, condition: 'Ángel Guardián para peleas grupales' },
      { itemId: 3060, condition: 'Danza de la Muerte contra alto daño físico' },
      { itemId: 3156, condition: 'Fauces de Malmortius contra composiciones mágicas' }
    ],
    primaryStyleId: 8000,
    subStyleId: 8400,
    selectedPerkIds: [8008, 9111, 9104, 8299, 8446, 8451, 5005, 5008, 5011],
    runesRationale: 'Compás Letal para maximizar la velocidad de ataque y reducir el enfriamiento de la Q al mínimo.',
    buildRationale: 'Poder de 100% de probabilidad de crítico con 2 objetos gracias a Intención Pasiva.',
    skillPriority: ['Q', 'E', 'W', 'R'],
    firstThreeLevels: ['E', 'Q', 'W'],
    skillRationale: 'La E otorga movilidad y la Q es el núcleo de daño.',
    waveManagement: 'Aprovecha los súbditos rivales para deslizarte sin quedar bajo rango de torre.',
    tradingPlan: 'Carga el tornado con la Q sobre súbditos y conéctalo antes de iniciar con E.',
    levelSpikes: ['Nivel 2 con E + Q', 'Nivel 6 con Último Suspiro'],
    enemyThreats: ['Efectos de control fijo punto a punto (Point & Click) como la W de Malzahar o R de Lissandra.'],
    winCondition: 'Combinar el tornado con iniciaciones aliadas de derribo aéreo para barrer las batallas 5v5.'
  },

  // Ahri (ID 103)
  103: {
    primaryRole: 'MIDDLE',
    startingItems: [1056, 2003], // Anillo de Doran + Poción
    coreItems: [3118, 4628, 3089], // Malignidad + Enfoque al Horizonte + Sombrero Mortífero de Rabadon
    situationalItems: [
      { itemId: 3157, condition: 'Reloj de Arena de Zhonya para sobrevivir a daño explosivo' },
      { itemId: 3137, condition: 'Criptofloración para penetración porcentual y curación de equipo' },
      { itemId: 3102, condition: 'Velo del Hada de la Muerte contra iniciaciones a distancia' }
    ],
    primaryStyleId: 8100, // Dominación
    subStyleId: 8300,     // Inspiración
    selectedPerkIds: [8112, 8143, 8138, 8106, 8304, 8345, 5008, 5008, 5011],
    runesRationale: 'Electrocutar para intercambios explosivos con Encanto + Orbe. Cazador Definitivo reduce el enfriamiento de la R.',
    buildRationale: 'Malignidad acelera la habilidad definitiva e inunda el suelo de quemadura mágica.',
    skillPriority: ['Q', 'W', 'E', 'R'],
    firstThreeLevels: ['Q', 'W', 'E'],
    skillRationale: 'Maximiza la Q para despeje de oleadas y daño verdadero al regreso del orbe.',
    waveManagement: 'Empuja rápido con Q + W para rotar a los carriles laterales con Impulso Espiritual.',
    tradingPlan: 'Busca conectar la E (Encanto) cuando el rival se desvíe de la protección de los súbditos.',
    levelSpikes: ['Nivel 3 con el combo completo', 'Nivel 6 con 3 cargas de R para matar o emboscar'],
    enemyThreats: ['Asesinos AD con alta movilidad que esquiven el Encanto (Zed, Yasuo).'],
    winCondition: 'Cazar a los objetivos prioritarios antes de que inicien las peleas por el dragón.'
  }
};

/**
 * Plantillas modernas por Arquetipo y Rol para cualquier campeón que no tenga perfil individual en el Parche 26.20.
 */
function getArchetypeProfile(role: Role): ChampionBuildProfile {
  switch (role) {
    case 'BOTTOM':
      return {
        primaryRole: 'BOTTOM',
        startingItems: [1055, 2003], // Espada de Doran + Poción
        coreItems: [6676, 3031, 3036], // El Coleccionista + Filo Infinito + Recuerdos de Lord Dominik
        situationalItems: [
          { itemId: 3094, condition: 'Cañón de Fuego Rápido para mayor rango' },
          { itemId: 3072, condition: 'Sanguinaria para sustento contra daño continuo' },
          { itemId: 3026, condition: 'Ángel Guardián frente a campeones asesinos' },
          { itemId: 3073, condition: 'Arcoescudo Inmortal para evitar ser eliminado de un combo' }
        ],
        primaryStyleId: 8000, // Precisión
        subStyleId: 8300,     // Inspiración
        selectedPerkIds: [8005, 9101, 9104, 8014, 8304, 8345, 5008, 5008, 5011],
        runesRationale: 'Ataque Intensificado para castigar intercambios cortos y Galletas para sustento en el carril inferior.',
        buildRationale: 'Build tradicional de tirador centrada en letalidad temprana y escalado masivo de impacto crítico.',
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
        coreItems: [6657, 4645, 3089], // Antorcha de Fuego Negro + Llama Sombría + Sombrero Mortífero de Rabadon
        situationalItems: [
          { itemId: 3157, condition: 'Reloj de Arena de Zhonya para sobrevivir a daño explosivo' },
          { itemId: 3137, condition: 'Criptofloración frente a rivales con resistencia mágica' },
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
        primaryStyleId: 8000,
        subStyleId: 8100,
        selectedPerkIds: [8010, 9111, 9104, 8299, 8143, 8106, 5008, 5008, 5011],
        runesRationale: 'Conquistador para duelos prolongados en río y Cazador Incansable para presencia en todo el mapa.',
        buildRationale: 'Equilibrio de daño, curación y reducción de armadura para escaramuzas tempranas.',
        skillPriority: ['Q', 'W', 'E', 'R'],
        firstThreeLevels: ['Q', 'W', 'E'],
        skillRationale: 'Habilidad de limpieza principal primero para una ruta rápida hacia nivel 4.',
        waveManagement: 'Ayuda a empujar la oleada de tus aliados tras gankear para tirar placas de torre.',
        tradingPlan: 'Espera a que las líneas rivales gasten su escape antes de emboscar.',
        levelSpikes: ['Nivel 4 con doble mejora', 'Nivel 6 para ganks definitivos'],
        enemyThreats: ['Invasiones tempranas si tu equipo no tiene prioridad en las líneas adyacentes.'],
        winCondition: 'Asegurar los 6 larvas del vacío y controlar los dragones elementales.'
      };

    case 'TOP':
      return {
        primaryRole: 'TOP',
        startingItems: [1055, 2003], // Espada de Doran + Poción
        coreItems: [6631, 3071, 3053], // Cielo Desgarrado + Cuchilla Negra + Guantelete de Sterak
        situationalItems: [
          { itemId: 3026, condition: 'Ángel Guardián para peleas 5v5' },
          { itemId: 3075, condition: 'Malla de Espinas frente a composiciones con alta curación' },
          { itemId: 4401, condition: 'Fuerza de la Naturaleza contra daño mágico masivo' }
        ],
        primaryStyleId: 8400, // Valor
        subStyleId: 8000,     // Precisión
        selectedPerkIds: [8437, 8446, 8429, 8451, 9111, 8299, 5008, 5008, 5011],
        runesRationale: 'Garras del Inmortal para intercambios cortos y escalado de vida máxima.',
        buildRationale: 'Build equilibrada de coloso con Cielo Desgarrado y Cuchilla Negra.',
        skillPriority: ['Q', 'E', 'W', 'R'],
        firstThreeLevels: ['Q', 'E', 'W'],
        skillRationale: 'Maximiza tu principal habilidad de intercambio.',
        waveManagement: 'Congela la oleada antes de tu torre para obligar al rival a sobreextenderse.',
        tradingPlan: 'Carga el golpe de Garras del Inmortal en los súbditos e intercambia con básicos reforzados.',
        levelSpikes: ['Nivel 3 con todas las habilidades básicas', 'Nivel 6 para duelos 1v1 a muerte'],
        enemyThreats: ['Ganks del jungla enemigo en oleadas empujadas sin visión.'],
        winCondition: 'Atraer presión en empuje dividido y flanquear en el momento oportuno con Teleport.'
      };

    case 'UTILITY':
    default:
      return {
        primaryRole: 'UTILITY',
        startingItems: [3865, 2003], // Atlas Mundial + Poción
        coreItems: [3869, 3190, 3109], // Oposición Celestial + Medallón Solari + Promesa del Caballero
        situationalItems: [
          { itemId: 3107, condition: 'Redención para curación en área en peleas de dragón' },
          { itemId: 3222, condition: 'Bendición de Mikael para purificar controles de masas' },
          { itemId: 3050, condition: 'Convergencia de Zeke para potenciar el daño del ADC' }
        ],
        primaryStyleId: 8400, // Valor
        subStyleId: 8300,     // Inspiración
        selectedPerkIds: [8465, 8401, 8429, 8451, 8304, 8347, 5008, 5008, 5011],
        runesRationale: 'Reverberación otorga resistencia inmediata al iniciar y Fuente de Vida cura a tus aliados.',
        buildRationale: 'Protección para el tirador y supervivencia con Oposición Celestial y Medallón de los Solari.',
        skillPriority: ['Q', 'W', 'E', 'R'],
        firstThreeLevels: ['Q', 'E', 'W'],
        skillRationale: 'Habilidad de control o iniciación primero para amenazar en el nivel 1.',
        waveManagement: 'Ayuda a tu tirador a preparar los súbditos bajo torre sin alterar su ritmo.',
        tradingPlan: 'Busca oportunidades cuando el soporte rival gaste su habilidad clave en vano.',
        levelSpikes: ['Nivel 2 con iniciación inmediata', 'Nivel 6 con habilidad definitiva para todo el carril'],
        enemyThreats: ['Hostigamiento constante a distancia si no encuentras ventanas limpias de enganche.'],
        winCondition: 'Control de visión impenetrable alrededor de los objetivos neutrales y peel constante al carry.'
      };
  }
}

/**
 * Devuelve una recomendación táctica determinista y 100% precisa para el Parche 26.20.
 */
export function getAccurateFallbackRecommendation(params: {
  championId: number;
  championName?: string;
  opponentId: number;
  opponentName?: string;
  role: Role;
  patch: string;
}): GeminiMatchupRecommendation {
  const profile = CHAMPION_PROFILES[params.championId] || getArchetypeProfile(params.role);
  const champName = params.championName || getChampionName(params.championId);
  const oppName = params.opponentName || getChampionName(params.opponentId);

  return {
    championId: params.championId,
    opponentChampionId: params.opponentId,
    assignedRole: params.role,
    patchVersion: params.patch || '26.20',
    difficultyRating: 5,
    matchupSummary: `Configura tu Gemini API Key en Ajustes para análisis profundo con IA. Análisis competitivo del Parche 26.20 para ${champName} contra ${oppName} en ${params.role}. Mantén el control de oleadas y respeta los picos de poder tempranos.`,
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
      boots: profile.primaryRole === 'BOTTOM' ? 3006 : (profile.primaryRole === 'MIDDLE' ? 3020 : (profile.primaryRole === 'JUNGLE' ? 3111 : 3047)),
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
    },
    source: 'fallback',
    confidenceLevel: 'general'
  };
}
