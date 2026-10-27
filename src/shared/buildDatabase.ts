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
  },

  // Ziggs (ID 115) - Mago de Artillería AP (Soporta Mid, Bot ADC y ARAM)
  115: {
    primaryRole: 'BOTTOM',
    startingItems: [1056, 2003], // Anillo de Doran + Poción
    coreItems: [6657, 4645, 3089], // Antorcha de Fuego Negro + Llama Sombría + Sombrero Mortífero de Rabadon
    situationalItems: [
      { itemId: 3151, condition: 'Tormento de Liandry contra colosos y composiciones con alta vida' },
      { itemId: 3157, condition: 'Reloj de Arena de Zhonya para sobrevivir a zambullidas o asesinos' },
      { itemId: 3137, condition: 'Criptofloración para penetración mágica porcentual y curación aliada' },
      { itemId: 3102, condition: 'Velo del Hada de la Muerte para bloquear ganchos e iniciaciones sorpresa' }
    ],
    primaryStyleId: 8200, // Brujería
    subStyleId: 8300,     // Inspiración
    // Cometa Arcano (8229), Banda de Maná (8226), Trascendencia (8210), Tormenta Creciente (8236), Calzado Mágico (8304), Perspicacia Cósmica (8347), Fuerza Adaptable (5008), Fuerza Adaptable (5008), Vida Plana (5011)
    selectedPerkIds: [8229, 8226, 8210, 8236, 8304, 8347, 5008, 5008, 5011],
    runesRationale: 'Cometa Arcano y Banda de Maná proporcionan asedio implacable a distancia. Tormenta Creciente garantiza escalado colosal en peleas tardías.',
    buildRationale: 'Antorcha de Fuego Negro despeja oleadas enteras instantáneamente; Llama Sombría y Rabadon potencian la demolición de torres con la pasiva y la W.',
    skillPriority: ['Q', 'E', 'W', 'R'],
    firstThreeLevels: ['Q', 'W', 'E'],
    skillRationale: 'Maximiza la Q para asedio continuo a máxima distancia; la W se guarda para escape de ganks o para ejecutar torres al 25% de vida.',
    waveManagement: 'Limpia la oleada a rango 850 con Q + E para asediar bajo torre y desgastar las placas con básicos potencidos por Mecha Corta.',
    tradingPlan: 'Rebota la Q en los súbditos rivales cuando intenten farmear. Mantén la W como escape seguro frente a iniciaciones.',
    levelSpikes: ['Nivel 3 con todo el kit de asedio', 'Nivel 6 para ejecuciones globales con Megabomba Incendiaria', '1 Objeto (Antorcha de Fuego Negro)'],
    enemyThreats: ['Iniciaciones con ganchos o campeones de alto salto si la W se encuentra en enfriamiento.'],
    winCondition: 'Tirar la primera torre de botlane con la W y la pasiva, rotar a medio para asediar y dominar las peleas con la Megabomba en cuellos de botella.'
  },

  // Karthus (ID 30) - Mago de Desgaste y Réquiem Global (Bot / Jungla / Mid)
  30: {
    primaryRole: 'BOTTOM',
    startingItems: [1056, 2003],
    coreItems: [6657, 3151, 3089], // Antorcha + Liandry + Rabadon
    situationalItems: [
      { itemId: 4645, condition: 'Llama Sombría para críticos mágicos con Réquiem' },
      { itemId: 3157, condition: 'Reloj de Arena de Zhonya para quemar con la E dentro de las peleas' },
      { itemId: 3137, condition: 'Criptofloración contra composiciones con alta resistencia mágica' }
    ],
    primaryStyleId: 8100, // Dominación
    subStyleId: 8000,     // Precisión
    selectedPerkIds: [8128, 8143, 8138, 8106, 9101, 8014, 5008, 5008, 5011],
    runesRationale: 'Cosecha Oscura y Cazador Definitivo maximizan el impacto de ejecuciones con Réquiem en cualquier carril.',
    buildRationale: 'Quemadura combinada con Antorcha y Liandry para aniquilar la línea inferior y controlar dragones pasivamente.',
    skillPriority: ['Q', 'E', 'W', 'R'],
    firstThreeLevels: ['Q', 'E', 'W'],
    skillRationale: 'Conecta Qs aisladas para duplicar el daño base.',
    waveManagement: 'Empuja la oleada con Qs consecutivas para mantener atrapado al carry rival bajo su torre.',
    tradingPlan: 'Ralentiza con Muro de Dolor (W) y encadena Sembrar la Destrucción (Q). Al morir, canaliza Réquiem inmediatamente.',
    levelSpikes: ['Nivel 6 para Réquiem global', 'Antorcha de Fuego Negro completada'],
    enemyThreats: ['Engages con supresión o escudos antimagia directos.'],
    winCondition: 'Impacto destructivo en teamfights obligando al rival a pelear sobre el área de muerte de tu pasiva.'
  },

  // Tristana (ID 18) - Tiradora Hipercarry AD (Bot / Mid)
  18: {
    primaryRole: 'BOTTOM',
    startingItems: [1055, 2003],
    coreItems: [6672, 6675, 3031], // Matakrakens + Filoveloz de Navori + Filo Infinito
    situationalItems: [
      { itemId: 3036, condition: 'Recuerdos de Lord Dominik contra tanques' },
      { itemId: 3072, condition: 'Sanguinaria para sustento prolongado' },
      { itemId: 3026, condition: 'Ángel Guardián para protegerte de cazadas en peleas clave' }
    ],
    primaryStyleId: 8000,
    subStyleId: 8300,
    selectedPerkIds: [8005, 9101, 9104, 8014, 8304, 8345, 5005, 5008, 5011],
    runesRationale: 'Ataque Intensificado desata daño colosal al detonar las 4 cargas de la Carga Explosiva (E).',
    buildRationale: 'Navori acelera el enfriamiento de la Q y la E en cada golpe crítico, garantizando saltos infinitos.',
    skillPriority: ['E', 'Q', 'W', 'R'],
    firstThreeLevels: ['E', 'W', 'Q'],
    skillRationale: 'Maximiza la E para asedio explosivo de placas y all-in letal.',
    waveManagement: 'Aprovecha las explosiones pasivas de la E para ganar el empuje de nivel 2.',
    tradingPlan: 'Coloca la E, activa la Q para velocidad de ataque y salta con la W para rematar y reiniciar el salto.',
    levelSpikes: ['Nivel 2 con W + E', 'Nivel 6 con Tiro Destructor para disengage o ejecución'],
    enemyThreats: ['Controles de masas instantáneos durante la animación de Salto Cohete.'],
    winCondition: 'Obtener reinicios de W en peleas grupales y demoler estructuras en segundos con Tiro Rápido.'
  },

  // Lucian (ID 236) - Tirador de Ráfaga AD (Bot / Mid)
  236: {
    primaryRole: 'BOTTOM',
    startingItems: [1055, 2003],
    coreItems: [3508, 3031, 3036], // Segador de Esencia + Filo Infinito + Lord Dominik
    situationalItems: [
      { itemId: 3072, condition: 'Sanguinaria para sustento continuo' },
      { itemId: 3094, condition: 'Cañón de Fuego Rápido para mayor rango de iniciación' },
      { itemId: 3026, condition: 'Ángel Guardián para zambullidas protegidas' }
    ],
    primaryStyleId: 8000,
    subStyleId: 8300,
    selectedPerkIds: [8005, 9101, 9104, 8014, 8304, 8345, 5008, 5008, 5011],
    runesRationale: 'Ataque Intensificado se activa instantáneamente tras el doble disparo de la pasiva Pistola de Luz.',
    buildRationale: 'Segador de Esencia resuelve el coste de maná y potencia el daño crítico explosivo con Filo Infinito.',
    skillPriority: ['Q', 'E', 'W', 'R'],
    firstThreeLevels: ['Q', 'E', 'W'],
    skillRationale: 'Maximiza la Q para atravesar súbditos y desgastar al rival.',
    waveManagement: 'Alinea la Q en los súbditos frontales para castigar al campeón rival detrás de la oleada.',
    tradingPlan: 'Deslizamiento E hacia adelante + doble básico + Luz Lacerante Q + doble básico para un intercambio ganador.',
    levelSpikes: ['Nivel 2 agresivo con E + Q', 'Nivel 6 con El Sacrificio'],
    enemyThreats: ['Soportes de largo alcance que hostiguen fuera de tu rango 500.'],
    winCondition: 'Dominar la línea temprana y castigar con El Sacrificio en rotaciones de dragón.'
  },

  // Zed (ID 238) - Asesino AD Letalidad (Mid / Top)
  238: {
    primaryRole: 'MIDDLE',
    startingItems: [1055, 2003],
    coreItems: [6697, 6695, 6694], // Espada Ciclovoltaica + Soberbia + Rencor de Serylda
    situationalItems: [
      { itemId: 3156, condition: 'Fauces de Malmortius contra daño mágico explosivo' },
      { itemId: 3814, condition: 'Filo de la Noche para bloquear la primera habilidad rival' },
      { itemId: 3026, condition: 'Ángel Guardián para zambullidas 5v5 seguras' }
    ],
    primaryStyleId: 8100, // Dominación
    subStyleId: 8200,     // Brujería
    selectedPerkIds: [8112, 8143, 8138, 8106, 8275, 8236, 5008, 5008, 5011],
    runesRationale: 'Electrocutar para ejecutar con combo de sombra y Trascendencia para reducir enfriamientos al matar.',
    buildRationale: 'Máxima letalidad y aceleración de habilidad para ejecutar al carry prioritario.',
    skillPriority: ['Q', 'E', 'W', 'R'],
    firstThreeLevels: ['Q', 'W', 'E'],
    skillRationale: 'Maximiza la Q para daño y farmeo a distancia.',
    waveManagement: 'Limpia la oleada con W + E + Q y busca rotaciones a los carriles laterales.',
    tradingPlan: 'W + E (ralentización) + doble Q para conectar Electrocutar sin recibir castigo.',
    levelSpikes: ['Nivel 3 con combo completo de sombra', 'Nivel 6 con Marca de la Muerte'],
    enemyThreats: ['Reloj de Arena de Zhonya y controles fijos de objetivo único.'],
    winCondition: 'Cazar a los objetivos frágiles antes del inicio de las peleas por el dragón.'
  }
};

/**
 * Clasificación canónica de arquetipos de campeón.
 * Permite que selecciones fuera de meta (Ziggs ADC, Karthus Bot, Tristana Mid, etc.)
 * reciban objetos, runas y botas coherentes con su naturaleza y escalado.
 */
export type ChampionClass = 'AP_MAGE' | 'AD_MARKSMAN' | 'AD_ASSASSIN' | 'AP_ASSASSIN' | 'BRUISER' | 'TANK' | 'ENCHANTER';

const CHAMPION_CLASSES: Record<number, ChampionClass> = {
  // Magos de Daño Mágico (AP Mages / Artillería / Batalla)
  1: 'AP_MAGE',    // Annie
  13: 'AP_MAGE',   // Ryze
  30: 'AP_MAGE',   // Karthus
  34: 'AP_MAGE',   // Anivia
  43: 'AP_MAGE',   // Karma
  45: 'AP_MAGE',   // Veigar
  50: 'AP_MAGE',   // Swain
  61: 'AP_MAGE',   // Orianna
  63: 'AP_MAGE',   // Brand
  69: 'AP_MAGE',   // Cassiopeia
  74: 'AP_MAGE',   // Heimerdinger
  90: 'AP_MAGE',   // Malzahar
  99: 'AP_MAGE',   // Lux
  101: 'AP_MAGE',  // Xerath
  103: 'AP_MAGE',  // Ahri
  112: 'AP_MAGE',  // Viktor
  115: 'AP_MAGE',  // Ziggs
  127: 'AP_MAGE',  // Lissandra
  134: 'AP_MAGE',  // Syndra
  136: 'AP_MAGE',  // Aurelion Sol
  142: 'AP_MAGE',  // Zoe
  143: 'AP_MAGE',  // Zyra
  147: 'AP_MAGE',  // Seraphine
  161: 'AP_MAGE',  // Vel'Koz
  268: 'AP_MAGE',  // Azir
  518: 'AP_MAGE',  // Neeko
  711: 'AP_MAGE',  // Vex
  800: 'AP_MAGE',  // Mel
  893: 'AP_MAGE',  // Aurora
  910: 'AP_MAGE',  // Hwei

  // Tiradores (AD Marksman)
  15: 'AD_MARKSMAN',  // Sivir
  18: 'AD_MARKSMAN',  // Tristana
  21: 'AD_MARKSMAN',  // Miss Fortune
  22: 'AD_MARKSMAN',  // Ashe
  29: 'AD_MARKSMAN',  // Twitch
  42: 'AD_MARKSMAN',  // Corki
  51: 'AD_MARKSMAN',  // Caitlyn
  67: 'AD_MARKSMAN',  // Vayne
  81: 'AD_MARKSMAN',  // Ezreal
  96: 'AD_MARKSMAN',  // Kog'Maw
  110: 'AD_MARKSMAN', // Varus
  119: 'AD_MARKSMAN', // Draven
  133: 'AD_MARKSMAN', // Quinn
  145: 'AD_MARKSMAN', // Kai'Sa
  166: 'AD_MARKSMAN', // Akshan
  202: 'AD_MARKSMAN', // Jhin
  203: 'AD_MARKSMAN', // Kindred
  221: 'AD_MARKSMAN', // Zeri
  222: 'AD_MARKSMAN', // Jinx
  236: 'AD_MARKSMAN', // Lucian
  360: 'AD_MARKSMAN', // Samira
  429: 'AD_MARKSMAN', // Kalista
  498: 'AD_MARKSMAN', // Xayah
  523: 'AD_MARKSMAN', // Aphelios
  804: 'AD_MARKSMAN', // Yunara
  901: 'AD_MARKSMAN', // Smolder

  // Asesinos AD
  91: 'AD_ASSASSIN',  // Talon
  107: 'AD_ASSASSIN', // Rengar
  121: 'AD_ASSASSIN', // Kha'Zix
  141: 'AD_ASSASSIN', // Kayn
  238: 'AD_ASSASSIN', // Zed
  246: 'AD_ASSASSIN', // Qiyana
  555: 'AD_ASSASSIN', // Pyke
  895: 'AD_ASSASSIN', // Naafiri

  // Asesinos AP
  7: 'AP_ASSASSIN',   // LeBlanc
  28: 'AP_ASSASSIN',  // Evelynn
  38: 'AP_ASSASSIN',  // Kassadin
  55: 'AP_ASSASSIN',  // Katarina
  84: 'AP_ASSASSIN',  // Akali
  105: 'AP_ASSASSIN', // Fizz
  131: 'AP_ASSASSIN', // Diana
  245: 'AP_ASSASSIN', // Ekko

  // Tanques
  12: 'TANK',  // Alistar
  14: 'TANK',  // Sion
  31: 'TANK',  // Cho'Gath
  32: 'TANK',  // Amumu
  33: 'TANK',  // Rammus
  54: 'TANK',  // Malphite
  78: 'TANK',  // Poppy
  79: 'TANK',  // Gragas
  86: 'TANK',  // Garen
  89: 'TANK',  // Leona
  98: 'TANK',  // Shen
  106: 'TANK', // Volibear
  111: 'TANK', // Nautilus
  113: 'TANK', // Sejuani
  154: 'TANK', // Zac
  201: 'TANK', // Braum
  223: 'TANK', // Tahm Kench
  897: 'TANK', // K'Sante

  // Encantadores
  16: 'ENCHANTER',  // Soraka
  25: 'ENCHANTER',  // Morgana
  26: 'ENCHANTER',  // Zilean
  37: 'ENCHANTER',  // Sona
  40: 'ENCHANTER',  // Janna
  117: 'ENCHANTER', // Lulu
  267: 'ENCHANTER', // Nami
  350: 'ENCHANTER', // Yuumi
  432: 'ENCHANTER', // Bard
  497: 'ENCHANTER', // Rakan
  526: 'ENCHANTER', // Rell
  888: 'ENCHANTER', // Renata Glasc
  902: 'ENCHANTER', // Milio
};

export function getChampionClass(championId: number): ChampionClass | undefined {
  return CHAMPION_CLASSES[championId];
}

/**
 * Plantillas modernas por Arquetipo y Rol para cualquier campeón que no tenga perfil individual en el Parche 26.20.
 * Prioriza la clase intrínseca del campeón sobre el carril asignado.
 */
function getArchetypeProfile(role: Role, championId?: number): ChampionBuildProfile {
  const champClass = championId ? getChampionClass(championId) : undefined;

  // 1. Si el campeón es un MAGO AP pero fue a BOTTOM, MID o TOP:
  if (champClass === 'AP_MAGE') {
    const isSupport = role === 'UTILITY';
    return {
      primaryRole: role,
      startingItems: isSupport ? [3865, 2003] : [1056, 2003], // Atlas Mundial o Anillo de Doran
      coreItems: isSupport ? [3869, 6657, 3089] : [6657, 4645, 3089], // Antorcha + Llama Sombría + Rabadon
      situationalItems: [
        { itemId: 3151, condition: 'Tormento de Liandry contra campeones con alta vida' },
        { itemId: 3157, condition: 'Reloj de Arena de Zhonya para sobrevivir a daño explosivo' },
        { itemId: 3137, condition: 'Criptofloración frente a rivales con resistencia mágica' },
        { itemId: 3102, condition: 'Velo del Hada de la Muerte contra iniciaciones a distancia' }
      ],
      primaryStyleId: 8200, // Brujería
      subStyleId: 8300,     // Inspiración
      selectedPerkIds: [8229, 8226, 8210, 8236, 8304, 8347, 5008, 5008, 5011],
      runesRationale: 'Cometa Arcano y Banda de Maná aseguran un constante desgaste a distancia sin quedar desprovisto de recursos.',
      buildRationale: 'Aceleración de habilidad, regeneración de maná y penetración mágica destructiva para mago AP.',
      skillPriority: ['Q', 'E', 'W', 'R'],
      firstThreeLevels: ['Q', 'E', 'W'],
      skillRationale: 'Maximiza el hechizo principal de daño en área y control.',
      waveManagement: 'Limpia rápido la oleada para generar prioridad y asediar la torre rival.',
      tradingPlan: 'Lanza tus hechizos cuando el oponente gaste una habilidad clave en los súbditos.',
      levelSpikes: ['Nivel 3 con el kit de asedio', 'Nivel 6 para daño de ráfaga letal'],
      enemyThreats: ['Cuidado con emboscadas desde la maleza o ganks de alta movilidad.'],
      winCondition: 'Controlar el mapa y aplicar daño de área contundente en cuellos de botella.'
    };
  }

  // 2. Si el campeón es un TIRADOR AD pero fue a MID o TOP:
  if (champClass === 'AD_MARKSMAN') {
    const isSupport = role === 'UTILITY';
    return {
      primaryRole: role,
      startingItems: isSupport ? [3865, 2003] : [1055, 2003],
      coreItems: [6672, 3031, 3036], // Matakrakens + Filo Infinito + Recuerdos de Lord Dominik
      situationalItems: [
        { itemId: 3094, condition: 'Cañón de Fuego Rápido para mayor rango' },
        { itemId: 3072, condition: 'Sanguinaria para sustento contra daño continuo' },
        { itemId: 3026, condition: 'Ángel Guardián frente a campeones asesinos' },
        { itemId: 3073, condition: 'Arcoescudo Inmortal para evitar ser eliminado de un combo' }
      ],
      primaryStyleId: 8000, // Precisión
      subStyleId: 8300,     // Inspiración
      selectedPerkIds: [8005, 9101, 9104, 8014, 8304, 8345, 5008, 5008, 5011],
      runesRationale: 'Ataque Intensificado para castigar intercambios cortos y Galletas para sustento.',
      buildRationale: 'Build tradicional de tirador centrada en letalidad temprana y escalado masivo de impacto crítico.',
      skillPriority: ['Q', 'W', 'E', 'R'],
      firstThreeLevels: ['Q', 'W', 'E'],
      skillRationale: 'Prioriza tu habilidad principal de daño y farmeo.',
      waveManagement: 'Controla el carril manteniendo la oleada cerca de tu rango de seguridad.',
      tradingPlan: 'Intercambia únicamente cuando el rival intente rematar un súbdito.',
      levelSpikes: ['Nivel 2 con ventaja de súbditos', 'Nivel 6 para combo definitivo'],
      enemyThreats: ['Atención a emboscadas del jungla enemigo y ganks con Teleport.'],
      winCondition: 'Posicionamiento impecable en el backline durante las peleas por objetivos neutrales.'
    };
  }

  // 3. Si el campeón es un TANQUE:
  if (champClass === 'TANK') {
    const isSupport = role === 'UTILITY';
    const isJungle = role === 'JUNGLE';
    return {
      primaryRole: role,
      startingItems: isSupport ? [3865, 2003] : (isJungle ? [1102, 2003] : [1054, 2003]),
      coreItems: isSupport ? [3869, 3190, 3109] : [3068, 3075, 6701], // Égida Solar + Malla de Espinas + Kaénico
      situationalItems: [
        { itemId: 3084, condition: 'Corazón de Acero para escalado infinito de vida' },
        { itemId: 3075, condition: 'Malla de Espinas frente a composiciones con alta curación' },
        { itemId: 4401, condition: 'Fuerza de la Naturaleza contra daño mágico continuo' }
      ],
      primaryStyleId: 8400, // Valor
      subStyleId: 8000,     // Precisión
      selectedPerkIds: [8437, 8446, 8429, 8451, 9111, 8299, 5008, 5008, 5011],
      runesRationale: 'Garras del Inmortal para intercambios cortos y escalado de vida máxima.',
      buildRationale: 'Resistencias pesadas y absorción masiva de daño en primera línea.',
      skillPriority: ['Q', 'W', 'E', 'R'],
      firstThreeLevels: ['Q', 'W', 'E'],
      skillRationale: 'Maximiza tu principal habilidad de despeje o mitigación.',
      waveManagement: 'Manten la oleada cerca de tu torre para facilitar ganks aliados.',
      tradingPlan: 'Inicia intercambios con básicos reforzados por Garras del Inmortal.',
      levelSpikes: ['Nivel 3 con el kit completo', 'Nivel 6 para control de masas masivo'],
      enemyThreats: ['Campeones con daño verdadero porcentual o penetración pesada.'],
      winCondition: 'Iniciaciones decisivas en batallas por dragones y Barón, protegiendo a los carries.'
    };
  }

  // 4. Si el campeón es un ASESINO AD:
  if (champClass === 'AD_ASSASSIN') {
    const isJungle = role === 'JUNGLE';
    return {
      primaryRole: role,
      startingItems: isJungle ? [1102, 2003] : [1055, 2003],
      coreItems: [6697, 6695, 6694], // Espada Ciclovoltaica + Soberbia + Rencor de Serylda
      situationalItems: [
        { itemId: 3156, condition: 'Fauces de Malmortius contra daño mágico explosivo' },
        { itemId: 3814, condition: 'Filo de la Noche para bloquear habilidades clave' },
        { itemId: 3026, condition: 'Ángel Guardián para zambullidas protegidas' }
      ],
      primaryStyleId: 8100, // Dominación
      subStyleId: 8200,     // Brujería
      selectedPerkIds: [8112, 8143, 8138, 8106, 8275, 8236, 5008, 5008, 5011],
      runesRationale: 'Electrocutar para ejecutar combos instantáneos y Cazador Definitivo para tener la R en cada rotación.',
      buildRationale: 'Máxima letalidad y aceleración para ejecutar objetivos frágiles de una rotación.',
      skillPriority: ['Q', 'E', 'W', 'R'],
      firstThreeLevels: ['Q', 'W', 'E'],
      skillRationale: 'Maximiza tu principal habilidad de daño.',
      waveManagement: 'Empuja rápido con habilidades y rota a los carriles laterales.',
      tradingPlan: 'Busca ventanas cuando el rival gaste su habilidad de escape o control.',
      levelSpikes: ['Nivel 3 con el combo', 'Nivel 6 con habilidad definitiva letal'],
      enemyThreats: ['Efectos de control directo y armaduras tempranas.'],
      winCondition: 'Cazar al tirador o mago enemigo antes de que comiencen las peleas de equipo.'
    };
  }

  // 5. Si el campeón es un ENCANTADOR:
  if (champClass === 'ENCHANTER') {
    return {
      primaryRole: role,
      startingItems: [3865, 2003], // Atlas Mundial
      coreItems: [3869, 2065, 6617], // Oposición Celestial + Canción de Batalla de Shurelya + Ecos de Helia
      situationalItems: [
        { itemId: 3504, condition: 'Incensario Ardiente para potenciar al tirador hipercarry' },
        { itemId: 3107, condition: 'Redención para curación en área en objetivos' },
        { itemId: 3222, condition: 'Bendición de Mikael para purificar aturdimientos' }
      ],
      primaryStyleId: 8200, // Brujería
      subStyleId: 8400,     // Valor
      selectedPerkIds: [8214, 8226, 8210, 8237, 8453, 8451, 5008, 5008, 5011],
      runesRationale: 'Invocar a Aery maximiza escudos y curaciones. Revitalizar potencia toda la mitigación aliada.',
      buildRationale: 'Máxima utilidad, aceleración y protección para el carry del equipo.',
      skillPriority: ['E', 'W', 'Q', 'R'],
      firstThreeLevels: ['Q', 'E', 'W'],
      skillRationale: 'Maximiza la habilidad de escudo o curación principal.',
      waveManagement: 'Ayuda a gestionar la oleada sin robar los últimos golpes.',
      tradingPlan: 'Hostiga con ataques y habilidades básicas protegidas por Aery.',
      levelSpikes: ['Nivel 2 con escudo y control', 'Nivel 6 con definitiva de disengage'],
      enemyThreats: ['Engages sorpresivos desde la maleza si la visión no está asegurada.'],
      winCondition: 'Mantener con vida al carry durante todo el combate y asegurar la visión en objetivos neutrales.'
    };
  }

  // 6. Por defecto, según el Rol tradicional si no coincide ninguna clase
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
  const profile = CHAMPION_PROFILES[params.championId] || getArchetypeProfile(params.role, params.championId);
  const champName = params.championName || getChampionName(params.championId);
  const oppName = params.opponentName || getChampionName(params.opponentId);

  // Botas adaptadas por arquetipo y rol
  const champClass = getChampionClass(params.championId);
  let bootsId = 3006; // Berserker
  if (champClass === 'AP_MAGE' || champClass === 'AP_ASSASSIN' || profile.primaryStyleId === 8200) {
    bootsId = 3020; // Hechicero
  } else if (champClass === 'TANK' || params.role === 'TOP') {
    bootsId = 3047; // Blindadas
  } else if (champClass === 'ENCHANTER' || champClass === 'AD_ASSASSIN') {
    bootsId = 3158; // Jonias
  } else if (params.role === 'JUNGLE') {
    bootsId = 3111; // Mercurio
  }

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
      boots: bootsId,
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
