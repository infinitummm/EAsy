/**
 * Catálogo completo de Árboles de Runas Reforjadas (Data Dragon es_ES) y Fragmentos de Estadísticas (Stat Shards).
 * Proporciona iconos oficiales, estructura por filas (Keystones + 3 ranuras menores) y metadatos para el árbol interactivo.
 */

export interface RuneSlotItem {
  id: number;
  key: string;
  name: string;
  icon: string;
  shortDesc: string;
}

export interface RuneTreeDefinition {
  id: number;
  key: string;
  name: string;
  color: string;
  accentBg: string;
  icon: string;
  slots: RuneSlotItem[][]; // [0] = Keystones, [1] = Fila 1, [2] = Fila 2, [3] = Fila 3
}

export interface StatShardItem {
  id: number;
  name: string;
  shortLabel: string;
  icon: string;
}

export const DDRAGON_IMG_BASE = 'https://ddragon.leagueoflegends.com/cdn/img/';

export const RUNE_TREES: RuneTreeDefinition[] = [
  {
    id: 8000,
    key: 'Precision',
    name: 'Precisión',
    color: '#F5A623',
    accentBg: 'rgba(245, 166, 35, 0.18)',
    icon: 'perk-images/Styles/7201_Precision.png',
    slots: [
      // Slot 0: Keystones
      [
        {
          id: 8005,
          key: 'PressTheAttack',
          name: 'Ataque intensificado',
          icon: 'perk-images/Styles/Precision/PressTheAttack/PressTheAttack.png',
          shortDesc: 'Golpear 3 veces a un campeón enemigo lo vuelve vulnerable y amplifica todo tu daño.',
        },
        {
          id: 8008,
          key: 'LethalTempo',
          name: 'Compás letal',
          icon: 'perk-images/Styles/Precision/LethalTempo/LethalTempoTemp.png',
          shortDesc: 'Atacar a un campeón otorga velocidad de ataque acumulable y daño adaptable al máximo de cargas.',
        },
        {
          id: 8021,
          key: 'FleetFootwork',
          name: 'Pies veloces',
          icon: 'perk-images/Styles/Precision/FleetFootwork/FleetFootwork.png',
          shortDesc: 'Atacar y moverte acumula energía. A las 100 cargas tu siguiente ataque te cura y da velocidad.',
        },
        {
          id: 8010,
          key: 'Conqueror',
          name: 'Conquistador',
          icon: 'perk-images/Styles/Precision/Conqueror/Conqueror.png',
          shortDesc: 'Acumula fuerza adaptable al dañar campeones. Al máximo de cargas te curas parte del daño infligido.',
        },
      ],
      // Slot 1: Heroísmo
      [
        {
          id: 9101,
          key: 'AbsorbLife',
          name: 'Absorber vida',
          icon: 'perk-images/Styles/Precision/AbsorbLife/AbsorbLife.png',
          shortDesc: 'Eliminar un objetivo restaura una pequeña cantidad de vida para sostenerte en línea.',
        },
        {
          id: 9111,
          key: 'Triumph',
          name: 'Triunfo',
          icon: 'perk-images/Styles/Precision/Triumph.png',
          shortDesc: 'Los derribos restauran un porcentaje de tu vida faltante y otorgan 20 de oro adicional.',
        },
        {
          id: 8009,
          key: 'PresenceOfMind',
          name: 'Claridad mental',
          icon: 'perk-images/Styles/Precision/PresenceOfMind/PresenceOfMind.png',
          shortDesc: 'Dañar campeones y lograr derribos restaura maná o energía.',
        },
      ],
      // Slot 2: Leyenda
      [
        {
          id: 9104,
          key: 'LegendAlacrity',
          name: 'Leyenda: Presteza',
          icon: 'perk-images/Styles/Precision/LegendAlacrity/LegendAlacrity.png',
          shortDesc: 'Los derribos de enemigos otorgan velocidad de ataque permanente.',
        },
        {
          id: 9105,
          key: 'LegendHaste',
          name: 'Leyenda: Velocidad',
          icon: 'perk-images/Styles/Precision/LegendHaste/LegendHaste.png',
          shortDesc: 'Los derribos de enemigos otorgan aceleración de habilidades básicas permanente.',
        },
        {
          id: 9103,
          key: 'LegendBloodline',
          name: 'Leyenda: Linaje',
          icon: 'perk-images/Styles/Precision/LegendBloodline/LegendBloodline.png',
          shortDesc: 'Los derribos otorgan robo de vida permanente y vida máxima al completarse.',
        },
      ],
      // Slot 3: Combate
      [
        {
          id: 8014,
          key: 'CoupDeGrace',
          name: 'Golpe de gracia',
          icon: 'perk-images/Styles/Precision/CoupDeGrace/CoupDeGrace.png',
          shortDesc: 'Inflige un 8% más de daño a campeones que tengan menos del 40% de vida.',
        },
        {
          id: 8017,
          key: 'CutDown',
          name: 'Derribado',
          icon: 'perk-images/Styles/Precision/CutDown/CutDown.png',
          shortDesc: 'Inflige un 8% más de daño a campeones que tengan más del 60% de vida.',
        },
        {
          id: 8299,
          key: 'LastStand',
          name: 'Último esfuerzo',
          icon: 'perk-images/Styles/Sorcery/LastStand/LastStand.png',
          shortDesc: 'Inflige entre un 5% y un 11% más de daño a campeones mientras tengas poca vida.',
        },
      ],
    ],
  },
  {
    id: 8100,
    key: 'Domination',
    name: 'Dominación',
    color: '#FF1744',
    accentBg: 'rgba(255, 23, 68, 0.18)',
    icon: 'perk-images/Styles/7200_Domination.png',
    slots: [
      // Slot 0: Keystones
      [
        {
          id: 8112,
          key: 'Electrocute',
          name: 'Electrocutar',
          icon: 'perk-images/Styles/Domination/Electrocute/Electrocute.png',
          shortDesc: 'Alcanzar a un campeón con 3 ataques o habilidades distintas en 3 s inflige daño adaptable explosivo.',
        },
        {
          id: 8128,
          key: 'DarkHarvest',
          name: 'Cosecha oscura',
          icon: 'perk-images/Styles/Domination/DarkHarvest/DarkHarvest.png',
          shortDesc: 'Dañar a un campeón con menos del 50% de vida inflige daño adaptable y cosecha su alma.',
        },
        {
          id: 9923,
          key: 'HailOfBlades',
          name: 'Lluvia de cuchillas',
          icon: 'perk-images/Styles/Domination/HailOfBlades/HailOfBlades.png',
          shortDesc: 'Otorga una gran cantidad de velocidad de ataque para los primeros 3 ataques contra campeones.',
        },
      ],
      // Slot 1: Malicia
      [
        {
          id: 8126,
          key: 'CheapShot',
          name: 'Golpe bajo',
          icon: 'perk-images/Styles/Domination/CheapShot/CheapShot.png',
          shortDesc: 'Inflige daño verdadero adicional a campeones con movimiento o acciones reducidas.',
        },
        {
          id: 8139,
          key: 'TasteOfBlood',
          name: 'Sabor a sangre',
          icon: 'perk-images/Styles/Domination/TasteOfBlood/GreenTerror_TasteOfBlood.png',
          shortDesc: 'Te curas al infligir daño a un campeón enemigo.',
        },
        {
          id: 8143,
          key: 'SuddenImpact',
          name: 'Impacto repentino',
          icon: 'perk-images/Styles/Domination/SuddenImpact/SuddenImpact.png',
          shortDesc: 'Tras usar un deslizamiento, salto, teletransporte o salir de sigilo, tu próximo daño inflige daño verdadero.',
        },
      ],
      // Slot 2: Rastreo
      [
        {
          id: 8137,
          key: 'SixthSense',
          name: 'Sexto sentido',
          icon: 'perk-images/Styles/Domination/SixthSense/SixthSense.png',
          shortDesc: 'Detecta automáticamente guardianes enemigos cercanos no vistos.',
        },
        {
          id: 8140,
          key: 'GrislyMementos',
          name: 'Recuerdo macabro',
          icon: 'perk-images/Styles/Domination/GrislyMementos/GrislyMementos.png',
          shortDesc: 'Colecciona recuerdos en derribos de campeones para ganar aceleración de talismán.',
        },
        {
          id: 8141,
          key: 'DeepWard',
          name: 'Guardián de profundidad',
          icon: 'perk-images/Styles/Domination/DeepWard/DeepWard.png',
          shortDesc: 'Tus guardianes en la jungla enemiga son más resistentes y duran más tiempo.',
        },
      ],
      // Slot 3: Cazador
      [
        {
          id: 8135,
          key: 'TreasureHunter',
          name: 'Cazador de tesoros',
          icon: 'perk-images/Styles/Domination/TreasureHunter/TreasureHunter.png',
          shortDesc: 'Los derribos únicos otorgan oro adicional la primera vez que los consigues.',
        },
        {
          id: 8105,
          key: 'RelentlessHunter',
          name: 'Cazador incesante',
          icon: 'perk-images/Styles/Domination/RelentlessHunter/RelentlessHunter.png',
          shortDesc: 'Los derribos únicos otorgan velocidad de movimiento permanente fuera de combate.',
        },
        {
          id: 8106,
          key: 'UltimateHunter',
          name: 'Cazador definitivo',
          icon: 'perk-images/Styles/Domination/UltimateHunter/UltimateHunter.png',
          shortDesc: 'Los derribos únicos otorgan aceleración de habilidad definitiva permanente.',
        },
      ],
    ],
  },
  {
    id: 8200,
    key: 'Sorcery',
    name: 'Brujería',
    color: '#6366F1',
    accentBg: 'rgba(99, 102, 241, 0.18)',
    icon: 'perk-images/Styles/7202_Sorcery.png',
    slots: [
      // Slot 0: Keystones
      [
        {
          id: 8214,
          key: 'SummonAery',
          name: 'Invocar a Aery',
          icon: 'perk-images/Styles/Sorcery/SummonAery/SummonAery.png',
          shortDesc: 'Tus ataques y habilidades envían a Aery a un objetivo para dañar enemigos o escudar aliados.',
        },
        {
          id: 8229,
          key: 'ArcaneComet',
          name: 'Cometa arcano',
          icon: 'perk-images/Styles/Sorcery/ArcaneComet/ArcaneComet.png',
          shortDesc: 'Infligir daño a un campeón con una habilidad lanza un cometa hacia su ubicación.',
        },
        {
          id: 8230,
          key: 'PhaseRush',
          name: 'Fase veloz',
          icon: 'perk-images/Styles/Sorcery/PhaseRush/StormraidersSurgeRuneIcon2.png',
          shortDesc: 'Alcanzar a un campeón con 3 ataques o habilidades distintas otorga una ráfaga de velocidad.',
        },
        {
          id: 8992,
          key: 'ArcaneCometVariant',
          name: 'Cometa arcano',
          icon: 'perk-images/Styles/Sorcery/ArcaneComet/ArcaneComet.png',
          shortDesc: 'Infligir daño con habilidades arroja un proyectil arcano sobre el campeón rival.',
        },
      ],
      // Slot 1: Artefacto
      [
        {
          id: 8224,
          key: 'AxiomArcanist',
          name: 'Arcanólogo axiomático',
          icon: 'perk-images/Styles/Sorcery/NullifyingOrb/Axiom_Arcanist.png',
          shortDesc: 'Potencia el daño, curación o escudo de tu definitiva y reduce su enfriamiento tras derribos.',
        },
        {
          id: 8226,
          key: 'ManaflowBand',
          name: 'Banda de maná',
          icon: 'perk-images/Styles/Sorcery/ManaflowBand/ManaflowBand.png',
          shortDesc: 'Alcanzar a un campeón enemigo con una habilidad aumenta permanentemente tu maná máximo.',
        },
        {
          id: 8275,
          key: 'NimbusCloak',
          name: 'Capa del nimbo',
          icon: 'perk-images/Styles/Sorcery/NimbusCloak/6361.png',
          shortDesc: 'Tras lanzar un hechizo de invocador, obtienes un aumento de velocidad que ignora colisiones.',
        },
      ],
      // Slot 2: Excelencia
      [
        {
          id: 8210,
          key: 'Transcendence',
          name: 'Trascendencia',
          icon: 'perk-images/Styles/Sorcery/Transcendence/Transcendence.png',
          shortDesc: 'Obtienes aceleración de habilidades al subir de nivel y reducción de enfriamiento tras derribos.',
        },
        {
          id: 8234,
          key: 'Celerity',
          name: 'Celeridad',
          icon: 'perk-images/Styles/Sorcery/Celerity/CelerityTemp.png',
          shortDesc: 'Todas las bonificaciones de velocidad son un 7% más efectivas y ganas un 1% de velocidad base.',
        },
        {
          id: 8233,
          key: 'AbsoluteFocus',
          name: 'Concentración absoluta',
          icon: 'perk-images/Styles/Sorcery/AbsoluteFocus/AbsoluteFocus.png',
          shortDesc: 'Mientras tengas más del 70% de vida, obtienes una bonificación de fuerza adaptable.',
        },
      ],
      // Slot 3: Poder
      [
        {
          id: 8237,
          key: 'Scorch',
          name: 'Piroláser',
          icon: 'perk-images/Styles/Sorcery/Scorch/Scorch.png',
          shortDesc: 'Tu primera habilidad que impacta cada 10 s prende fuego a los campeones.',
        },
        {
          id: 8232,
          key: 'Waterwalking',
          name: 'Caminar sobre agua',
          icon: 'perk-images/Styles/Sorcery/Waterwalking/Waterwalking.png',
          shortDesc: 'Obtienes velocidad de movimiento y fuerza adaptable cuando estás en el río.',
        },
        {
          id: 8236,
          key: 'GatheringStorm',
          name: 'Se avecina tormenta',
          icon: 'perk-images/Styles/Sorcery/GatheringStorm/GatheringStorm.png',
          shortDesc: 'Cada 10 min obtienes cantidades crecientes de DA o PH.',
        },
      ],
    ],
  },
  {
    id: 8400,
    key: 'Resolve',
    name: 'Valor',
    color: '#10B981',
    accentBg: 'rgba(16, 185, 129, 0.18)',
    icon: 'perk-images/Styles/7204_Resolve.png',
    slots: [
      // Slot 0: Keystones
      [
        {
          id: 8437,
          key: 'GraspOfTheUndying',
          name: 'Garras del inmortal',
          icon: 'perk-images/Styles/Resolve/GraspOfTheUndying/GraspOfTheUndying.png',
          shortDesc: 'Cada 4 s en combate, tu siguiente ataque básico contra un campeón inflige daño mágico, te cura y aumenta tu vida.',
        },
        {
          id: 8439,
          key: 'Aftershock',
          name: 'Reverberacción',
          icon: 'perk-images/Styles/Resolve/VeteranAftershock/VeteranAftershock.png',
          shortDesc: 'Tras inmovilizar a un campeón enemigo, aumentas tu armadura y resistencia mágica y luego explotas.',
        },
        {
          id: 8465,
          key: 'Guardian',
          name: 'Protector',
          icon: 'perk-images/Styles/Resolve/Guardian/Guardian.png',
          shortDesc: 'Protege a los aliados a los que lances hechizos y a los que estén muy cerca de ti con un escudo.',
        },
      ],
      // Slot 1: Fortaleza
      [
        {
          id: 8446,
          key: 'Demolish',
          name: 'Demoler',
          icon: 'perk-images/Styles/Resolve/Demolish/Demolish.png',
          shortDesc: 'Carga un potente ataque contra una torreta mientras te encuentres cerca de ella.',
        },
        {
          id: 8463,
          key: 'FontOfLife',
          name: 'Fuente de vida',
          icon: 'perk-images/Styles/Resolve/FontOfLife/FontOfLife.png',
          shortDesc: 'Reducir el movimiento de un campeón enemigo te cura a ti y al aliado cercano con menos vida.',
        },
        {
          id: 8401,
          key: 'ShieldBash',
          name: 'Golpe de escudo',
          icon: 'perk-images/Styles/Resolve/MirrorShell/MirrorShell.png',
          shortDesc: 'Cuando obtienes un escudo, tu siguiente ataque básico contra un campeón inflige daño adaptable adicional.',
        },
      ],
      // Slot 2: Resistencia
      [
        {
          id: 8429,
          key: 'Conditioning',
          name: 'Condicionamiento',
          icon: 'perk-images/Styles/Resolve/Conditioning/Conditioning.png',
          shortDesc: 'Tras 12 min, obtienes +8 de armadura y +8 de resistencia mágica y aumentan tus defensas totales.',
        },
        {
          id: 8444,
          key: 'SecondWind',
          name: 'Fuerzas renovadas',
          icon: 'perk-images/Styles/Resolve/SecondWind/SecondWind.png',
          shortDesc: 'Tras recibir daño de un campeón enemigo, recuperas parte de la vida que te falte a lo largo del tiempo.',
        },
        {
          id: 8473,
          key: 'BonePlating',
          name: 'Revestimiento de huesos',
          icon: 'perk-images/Styles/Resolve/BonePlating/BonePlating.png',
          shortDesc: 'Tras recibir daño de un campeón, los siguientes 3 ataques o habilidades te infligen menos daño.',
        },
      ],
      // Slot 3: Vitalidad
      [
        {
          id: 8451,
          key: 'Overgrowth',
          name: 'Sobrecrecimiento',
          icon: 'perk-images/Styles/Resolve/Overgrowth/Overgrowth.png',
          shortDesc: 'Obtienes vida máxima permanente cuando mueren monstruos o súbditos cerca de ti.',
        },
        {
          id: 8453,
          key: 'Revitalize',
          name: 'Revitalizar',
          icon: 'perk-images/Styles/Resolve/Revitalize/Revitalize.png',
          shortDesc: 'Las curaciones y escudos que lances o recibas son un 5% más fuertes (y +10% en objetivos con poca vida).',
        },
        {
          id: 8242,
          key: 'Unflinching',
          name: 'Inquebrantable',
          icon: 'perk-images/Styles/Sorcery/Unflinching/Unflinching.png',
          shortDesc: 'Obtienes armadura y resistencia mágica adicionales cuando sufres control de masas.',
        },
      ],
    ],
  },
  {
    id: 8300,
    key: 'Inspiration',
    name: 'Inspiración',
    color: '#00E5FF',
    accentBg: 'rgba(0, 229, 255, 0.18)',
    icon: 'perk-images/Styles/7203_Whimsy.png',
    slots: [
      // Slot 0: Keystones
      [
        {
          id: 8351,
          key: 'GlacialAugment',
          name: 'Mejora glacial',
          icon: 'perk-images/Styles/Inspiration/GlacialAugment/GlacialAugment.png',
          shortDesc: 'Inmovilizar a un campeón enemigo hace que broten 3 rayos glaciales que ralentizan y reducen el daño.',
        },
        {
          id: 8360,
          key: 'UnsealedSpellbook',
          name: 'Libro de hechizos',
          icon: 'perk-images/Styles/Inspiration/UnsealedSpellbook/UnsealedSpellbook.png',
          shortDesc: 'Cambia tus hechizos de invocador fuera de combate por fragmentos de otros hechizos.',
        },
        {
          id: 8369,
          key: 'FirstStrike',
          name: 'Primer golpe',
          icon: 'perk-images/Styles/Inspiration/FirstStrike/FirstStrike.png',
          shortDesc: 'Iniciar combate contra un campeón te otorga un 7% de daño adicional y oro según el daño infligido.',
        },
      ],
      // Slot 1: Artilugio
      [
        {
          id: 8306,
          key: 'HextechFlashtraption',
          name: 'Destello hextech',
          icon: 'perk-images/Styles/Inspiration/HextechFlashtraption/HextechFlashtraption.png',
          shortDesc: 'Mientras Destello está en enfriamiento, se sustituye por Hexdestello.',
        },
        {
          id: 8304,
          key: 'MagicalFootwear',
          name: 'Calzado mágico',
          icon: 'perk-images/Styles/Inspiration/MagicalFootwear/MagicalFootwear.png',
          shortDesc: 'Recibes botas gratuitas al minuto 12 con +10 de velocidad de movimiento adicional.',
        },
        {
          id: 8321,
          key: 'CashBack',
          name: 'Reembolso',
          icon: 'perk-images/Styles/Inspiration/CashBack/CashBack2.png',
          shortDesc: 'Te devuelve un porcentaje del oro gastado cada vez que compras un objeto legendario.',
        },
      ],
      // Slot 2: Mañana
      [
        {
          id: 8313,
          key: 'TripleTonic',
          name: 'Tónico triple',
          icon: 'perk-images/Styles/Inspiration/PerfectTiming/AlchemistCabinet.png',
          shortDesc: 'Al alcanzar los niveles 3, 6 y 9 recibes elixires especiales con oro, fuerza y un punto de habilidad.',
        },
        {
          id: 8352,
          key: 'TimeWarpTonic',
          name: 'Tónico de distorsión temporal',
          icon: 'perk-images/Styles/Inspiration/TimeWarpTonic/TimeWarpTonic.png',
          shortDesc: 'Las pociones otorgan parte de su restauración de forma instantánea.',
        },
        {
          id: 8345,
          key: 'BiscuitDelivery',
          name: 'Entrega de galletas',
          icon: 'perk-images/Styles/Inspiration/BiscuitDelivery/BiscuitDelivery.png',
          shortDesc: 'Recibes una galleta gratuita cada 2 min hasta el min 6 que restaura vida y aumenta tu vida máxima.',
        },
      ],
      // Slot 3: Más allá
      [
        {
          id: 8347,
          key: 'CosmicInsight',
          name: 'Perspicacia cósmica',
          icon: 'perk-images/Styles/Inspiration/CosmicInsight/CosmicInsight.png',
          shortDesc: '+18 de aceleración de hechizos de invocador y +10 de aceleración de objetos.',
        },
        {
          id: 8410,
          key: 'ApproachVelocity',
          name: 'Velocidad de acercamiento',
          icon: 'perk-images/Styles/Resolve/ApproachVelocity/ApproachVelocity.png',
          shortDesc: 'Obtienes velocidad de movimiento al desplazarte hacia campeones enemigos con movimiento reducido.',
        },
        {
          id: 8316,
          key: 'JackOfAllTrades',
          name: 'Manitas',
          icon: 'perk-images/Styles/Inspiration/JackOfAllTrades/JackofAllTrades2.png',
          shortDesc: 'Por cada estadística diferente obtenida mediante objetos, ganas aceleración y fuerza adaptable.',
        },
      ],
    ],
  },
];

export const STAT_SHARDS_ROWS: StatShardItem[][] = [
  // Fila 0: Ofensivo
  [
    {
      id: 5008,
      name: '+9 Fuerza Adaptable',
      shortLabel: 'Fuerza Adaptable',
      icon: 'perk-images/StatMods/StatModsAdaptiveForceIcon.png',
    },
    {
      id: 5005,
      name: '+10% Velocidad de Ataque',
      shortLabel: 'Vel. Ataque',
      icon: 'perk-images/StatMods/StatModsAttackSpeedIcon.png',
    },
    {
      id: 5007,
      name: '+8 Aceleración de Habilidad',
      shortLabel: 'Aceleración',
      icon: 'perk-images/StatMods/StatModsCDRScalingIcon.png',
    },
  ],
  // Fila 1: Flex
  [
    {
      id: 5008,
      name: '+9 Fuerza Adaptable',
      shortLabel: 'Fuerza Adaptable',
      icon: 'perk-images/StatMods/StatModsAdaptiveForceIcon.png',
    },
    {
      id: 5010,
      name: '+2% Velocidad de Movimiento',
      shortLabel: 'Vel. Movimiento',
      icon: 'perk-images/StatMods/StatModsMovementSpeedIcon.png',
    },
    {
      id: 5001,
      name: '+10-180 Vida Progresiva',
      shortLabel: 'Vida Progresiva',
      icon: 'perk-images/StatMods/StatModsHealthScalingIcon.png',
    },
  ],
  // Fila 2: Defensivo
  [
    {
      id: 5011,
      name: '+65 Vida Plana',
      shortLabel: 'Vida Plana',
      icon: 'perk-images/StatMods/StatModsHealthPlusIcon.png',
    },
    {
      id: 5013,
      name: '+10% Tenacidad y Resist. Ralentización',
      shortLabel: 'Tenacidad',
      icon: 'perk-images/StatMods/StatModsTenacityIcon.png',
    },
    {
      id: 5001,
      name: '+10-180 Vida Progresiva',
      shortLabel: 'Vida Progresiva',
      icon: 'perk-images/StatMods/StatModsHealthScalingIcon.png',
    },
  ],
];

const RUNE_LOOKUP = new Map<number, RuneSlotItem>();
const TREE_LOOKUP = new Map<number, RuneTreeDefinition>();
const SHARD_LOOKUP = new Map<number, StatShardItem>();

for (const tree of RUNE_TREES) {
  TREE_LOOKUP.set(tree.id, tree);
  for (const slot of tree.slots) {
    for (const rune of slot) {
      RUNE_LOOKUP.set(rune.id, rune);
    }
  }
}

for (const row of STAT_SHARDS_ROWS) {
  for (const shard of row) {
    if (!SHARD_LOOKUP.has(shard.id)) {
      SHARD_LOOKUP.set(shard.id, shard);
    }
  }
}

export function getRuneTreeById(styleId: number): RuneTreeDefinition {
  return TREE_LOOKUP.get(styleId) || RUNE_TREES[0];
}

export function findRuneById(id: number): RuneSlotItem | undefined {
  return RUNE_LOOKUP.get(id);
}

export function findShardById(id: number): StatShardItem | undefined {
  return SHARD_LOOKUP.get(id);
}

export function getRuneIconUrl(id: number): string {
  const tree = TREE_LOOKUP.get(id);
  if (tree) return `${DDRAGON_IMG_BASE}${tree.icon}`;
  const rune = RUNE_LOOKUP.get(id);
  if (rune) return `${DDRAGON_IMG_BASE}${rune.icon}`;
  const shard = SHARD_LOOKUP.get(id);
  if (shard) return `${DDRAGON_IMG_BASE}${shard.icon}`;
  return `${DDRAGON_IMG_BASE}perk-images/Styles/7201_Precision.png`;
}

export function getRuneName(id: number): string {
  const tree = TREE_LOOKUP.get(id);
  if (tree) return tree.name;
  const rune = RUNE_LOOKUP.get(id);
  if (rune) return rune.name;
  const shard = SHARD_LOOKUP.get(id);
  if (shard) return shard.name;
  return `Runa #${id}`;
}
