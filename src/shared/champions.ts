/**
 * Lista canónica y utilidades de campeones de League of Legends.
 * Auto-generado para soporte de nombres y avatares en la UI.
 */

export interface ChampionInfo {
  readonly id: number;
  readonly name: string;
  readonly key: string;
  readonly image: string;
  /**
   * URL absoluta del icono cuando la fuente no es Data Dragon (p. ej. Community
   * Dragon para campeones recién lanzados como Yunara). Si está presente,
   * `getChampionIconUrl` la devuelve tal cual.
   */
  readonly iconUrl?: string;
}

/**
 * Lista base de campeones. Se amplía en caliente mediante `registrarCampeones`
 * para soportar lanzamientos nuevos (REQ-013); las vistas que conservan una
 * referencia a este arreglo reciben los cambios sin reimportar el módulo.
 */
export const ALL_CHAMPIONS: ChampionInfo[] = [
  {
    "id": 266,
    "name": "Aatrox",
    "key": "Aatrox",
    "image": "Aatrox.png"
  },
  {
    "id": 103,
    "name": "Ahri",
    "key": "Ahri",
    "image": "Ahri.png"
  },
  {
    "id": 84,
    "name": "Akali",
    "key": "Akali",
    "image": "Akali.png"
  },
  {
    "id": 166,
    "name": "Akshan",
    "key": "Akshan",
    "image": "Akshan.png"
  },
  {
    "id": 12,
    "name": "Alistar",
    "key": "Alistar",
    "image": "Alistar.png"
  },
  {
    "id": 32,
    "name": "Amumu",
    "key": "Amumu",
    "image": "Amumu.png"
  },
  {
    "id": 34,
    "name": "Anivia",
    "key": "Anivia",
    "image": "Anivia.png"
  },
  {
    "id": 1,
    "name": "Annie",
    "key": "Annie",
    "image": "Annie.png"
  },
  {
    "id": 523,
    "name": "Aphelios",
    "key": "Aphelios",
    "image": "Aphelios.png"
  },
  {
    "id": 22,
    "name": "Ashe",
    "key": "Ashe",
    "image": "Ashe.png"
  },
  {
    "id": 136,
    "name": "Aurelion Sol",
    "key": "AurelionSol",
    "image": "AurelionSol.png"
  },
  {
    "id": 893,
    "name": "Aurora",
    "key": "Aurora",
    "image": "Aurora.png"
  },
  {
    "id": 268,
    "name": "Azir",
    "key": "Azir",
    "image": "Azir.png"
  },
  {
    "id": 432,
    "name": "Bardo",
    "key": "Bard",
    "image": "Bard.png"
  },
  {
    "id": 200,
    "name": "Bel'Veth",
    "key": "Belveth",
    "image": "Belveth.png"
  },
  {
    "id": 53,
    "name": "Blitzcrank",
    "key": "Blitzcrank",
    "image": "Blitzcrank.png"
  },
  {
    "id": 63,
    "name": "Brand",
    "key": "Brand",
    "image": "Brand.png"
  },
  {
    "id": 201,
    "name": "Braum",
    "key": "Braum",
    "image": "Braum.png"
  },
  {
    "id": 233,
    "name": "Briar",
    "key": "Briar",
    "image": "Briar.png"
  },
  {
    "id": 51,
    "name": "Caitlyn",
    "key": "Caitlyn",
    "image": "Caitlyn.png"
  },
  {
    "id": 164,
    "name": "Camille",
    "key": "Camille",
    "image": "Camille.png"
  },
  {
    "id": 69,
    "name": "Cassiopeia",
    "key": "Cassiopeia",
    "image": "Cassiopeia.png"
  },
  {
    "id": 31,
    "name": "Cho'Gath",
    "key": "Chogath",
    "image": "Chogath.png"
  },
  {
    "id": 42,
    "name": "Corki",
    "key": "Corki",
    "image": "Corki.png"
  },
  {
    "id": 122,
    "name": "Darius",
    "key": "Darius",
    "image": "Darius.png"
  },
  {
    "id": 131,
    "name": "Diana",
    "key": "Diana",
    "image": "Diana.png"
  },
  {
    "id": 36,
    "name": "Dr. Mundo",
    "key": "DrMundo",
    "image": "DrMundo.png"
  },
  {
    "id": 119,
    "name": "Draven",
    "key": "Draven",
    "image": "Draven.png"
  },
  {
    "id": 245,
    "name": "Ekko",
    "key": "Ekko",
    "image": "Ekko.png"
  },
  {
    "id": 60,
    "name": "Elise",
    "key": "Elise",
    "image": "Elise.png"
  },
  {
    "id": 28,
    "name": "Evelynn",
    "key": "Evelynn",
    "image": "Evelynn.png"
  },
  {
    "id": 81,
    "name": "Ezreal",
    "key": "Ezreal",
    "image": "Ezreal.png"
  },
  {
    "id": 9,
    "name": "Fiddlesticks",
    "key": "Fiddlesticks",
    "image": "Fiddlesticks.png"
  },
  {
    "id": 114,
    "name": "Fiora",
    "key": "Fiora",
    "image": "Fiora.png"
  },
  {
    "id": 105,
    "name": "Fizz",
    "key": "Fizz",
    "image": "Fizz.png"
  },
  {
    "id": 3,
    "name": "Galio",
    "key": "Galio",
    "image": "Galio.png"
  },
  {
    "id": 41,
    "name": "Gangplank",
    "key": "Gangplank",
    "image": "Gangplank.png"
  },
  {
    "id": 86,
    "name": "Garen",
    "key": "Garen",
    "image": "Garen.png"
  },
  {
    "id": 150,
    "name": "Gnar",
    "key": "Gnar",
    "image": "Gnar.png"
  },
  {
    "id": 79,
    "name": "Gragas",
    "key": "Gragas",
    "image": "Gragas.png"
  },
  {
    "id": 104,
    "name": "Graves",
    "key": "Graves",
    "image": "Graves.png"
  },
  {
    "id": 887,
    "name": "Gwen",
    "key": "Gwen",
    "image": "Gwen.png"
  },
  {
    "id": 120,
    "name": "Hecarim",
    "key": "Hecarim",
    "image": "Hecarim.png"
  },
  {
    "id": 74,
    "name": "Heimerdinger",
    "key": "Heimerdinger",
    "image": "Heimerdinger.png"
  },
  {
    "id": 910,
    "name": "Hwei",
    "key": "Hwei",
    "image": "Hwei.png"
  },
  {
    "id": 420,
    "name": "Illaoi",
    "key": "Illaoi",
    "image": "Illaoi.png"
  },
  {
    "id": 39,
    "name": "Irelia",
    "key": "Irelia",
    "image": "Irelia.png"
  },
  {
    "id": 427,
    "name": "Ivern",
    "key": "Ivern",
    "image": "Ivern.png"
  },
  {
    "id": 40,
    "name": "Janna",
    "key": "Janna",
    "image": "Janna.png"
  },
  {
    "id": 59,
    "name": "Jarvan IV",
    "key": "JarvanIV",
    "image": "JarvanIV.png"
  },
  {
    "id": 24,
    "name": "Jax",
    "key": "Jax",
    "image": "Jax.png"
  },
  {
    "id": 126,
    "name": "Jayce",
    "key": "Jayce",
    "image": "Jayce.png"
  },
  {
    "id": 202,
    "name": "Jhin",
    "key": "Jhin",
    "image": "Jhin.png"
  },
  {
    "id": 222,
    "name": "Jinx",
    "key": "Jinx",
    "image": "Jinx.png"
  },
  {
    "id": 897,
    "name": "K'Sante",
    "key": "KSante",
    "image": "KSante.png"
  },
  {
    "id": 145,
    "name": "Kai'Sa",
    "key": "Kaisa",
    "image": "Kaisa.png"
  },
  {
    "id": 429,
    "name": "Kalista",
    "key": "Kalista",
    "image": "Kalista.png"
  },
  {
    "id": 43,
    "name": "Karma",
    "key": "Karma",
    "image": "Karma.png"
  },
  {
    "id": 30,
    "name": "Karthus",
    "key": "Karthus",
    "image": "Karthus.png"
  },
  {
    "id": 38,
    "name": "Kassadin",
    "key": "Kassadin",
    "image": "Kassadin.png"
  },
  {
    "id": 55,
    "name": "Katarina",
    "key": "Katarina",
    "image": "Katarina.png"
  },
  {
    "id": 10,
    "name": "Kayle",
    "key": "Kayle",
    "image": "Kayle.png"
  },
  {
    "id": 141,
    "name": "Kayn",
    "key": "Kayn",
    "image": "Kayn.png"
  },
  {
    "id": 85,
    "name": "Kennen",
    "key": "Kennen",
    "image": "Kennen.png"
  },
  {
    "id": 121,
    "name": "Kha'Zix",
    "key": "Khazix",
    "image": "Khazix.png"
  },
  {
    "id": 203,
    "name": "Kindred",
    "key": "Kindred",
    "image": "Kindred.png"
  },
  {
    "id": 240,
    "name": "Kled",
    "key": "Kled",
    "image": "Kled.png"
  },
  {
    "id": 96,
    "name": "Kog'Maw",
    "key": "KogMaw",
    "image": "KogMaw.png"
  },
  {
    "id": 7,
    "name": "LeBlanc",
    "key": "Leblanc",
    "image": "Leblanc.png"
  },
  {
    "id": 64,
    "name": "Lee Sin",
    "key": "LeeSin",
    "image": "LeeSin.png"
  },
  {
    "id": 89,
    "name": "Leona",
    "key": "Leona",
    "image": "Leona.png"
  },
  {
    "id": 876,
    "name": "Lillia",
    "key": "Lillia",
    "image": "Lillia.png"
  },
  {
    "id": 127,
    "name": "Lissandra",
    "key": "Lissandra",
    "image": "Lissandra.png"
  },
  {
    "id": 236,
    "name": "Lucian",
    "key": "Lucian",
    "image": "Lucian.png"
  },
  {
    "id": 117,
    "name": "Lulu",
    "key": "Lulu",
    "image": "Lulu.png"
  },
  {
    "id": 99,
    "name": "Lux",
    "key": "Lux",
    "image": "Lux.png"
  },
  {
    "id": 11,
    "name": "Maestro Yi",
    "key": "MasterYi",
    "image": "MasterYi.png"
  },
  {
    "id": 54,
    "name": "Malphite",
    "key": "Malphite",
    "image": "Malphite.png"
  },
  {
    "id": 90,
    "name": "Malzahar",
    "key": "Malzahar",
    "image": "Malzahar.png"
  },
  {
    "id": 57,
    "name": "Maokai",
    "key": "Maokai",
    "image": "Maokai.png"
  },
  {
    "id": 902,
    "name": "Milio",
    "key": "Milio",
    "image": "Milio.png"
  },
  {
    "id": 21,
    "name": "Miss Fortune",
    "key": "MissFortune",
    "image": "MissFortune.png"
  },
  {
    "id": 82,
    "name": "Mordekaiser",
    "key": "Mordekaiser",
    "image": "Mordekaiser.png"
  },
  {
    "id": 25,
    "name": "Morgana",
    "key": "Morgana",
    "image": "Morgana.png"
  },
  {
    "id": 950,
    "name": "Naafiri",
    "key": "Naafiri",
    "image": "Naafiri.png"
  },
  {
    "id": 267,
    "name": "Nami",
    "key": "Nami",
    "image": "Nami.png"
  },
  {
    "id": 75,
    "name": "Nasus",
    "key": "Nasus",
    "image": "Nasus.png"
  },
  {
    "id": 111,
    "name": "Nautilus",
    "key": "Nautilus",
    "image": "Nautilus.png"
  },
  {
    "id": 518,
    "name": "Neeko",
    "key": "Neeko",
    "image": "Neeko.png"
  },
  {
    "id": 76,
    "name": "Nidalee",
    "key": "Nidalee",
    "image": "Nidalee.png"
  },
  {
    "id": 895,
    "name": "Nilah",
    "key": "Nilah",
    "image": "Nilah.png"
  },
  {
    "id": 56,
    "name": "Nocturne",
    "key": "Nocturne",
    "image": "Nocturne.png"
  },
  {
    "id": 20,
    "name": "Nunu y Willump",
    "key": "Nunu",
    "image": "Nunu.png"
  },
  {
    "id": 2,
    "name": "Olaf",
    "key": "Olaf",
    "image": "Olaf.png"
  },
  {
    "id": 61,
    "name": "Orianna",
    "key": "Orianna",
    "image": "Orianna.png"
  },
  {
    "id": 516,
    "name": "Ornn",
    "key": "Ornn",
    "image": "Ornn.png"
  },
  {
    "id": 80,
    "name": "Pantheon",
    "key": "Pantheon",
    "image": "Pantheon.png"
  },
  {
    "id": 78,
    "name": "Poppy",
    "key": "Poppy",
    "image": "Poppy.png"
  },
  {
    "id": 555,
    "name": "Pyke",
    "key": "Pyke",
    "image": "Pyke.png"
  },
  {
    "id": 246,
    "name": "Qiyana",
    "key": "Qiyana",
    "image": "Qiyana.png"
  },
  {
    "id": 133,
    "name": "Quinn",
    "key": "Quinn",
    "image": "Quinn.png"
  },
  {
    "id": 497,
    "name": "Rakan",
    "key": "Rakan",
    "image": "Rakan.png"
  },
  {
    "id": 33,
    "name": "Rammus",
    "key": "Rammus",
    "image": "Rammus.png"
  },
  {
    "id": 421,
    "name": "Rek'Sai",
    "key": "RekSai",
    "image": "RekSai.png"
  },
  {
    "id": 526,
    "name": "Rell",
    "key": "Rell",
    "image": "Rell.png"
  },
  {
    "id": 888,
    "name": "Renata Glasc",
    "key": "Renata",
    "image": "Renata.png"
  },
  {
    "id": 58,
    "name": "Renekton",
    "key": "Renekton",
    "image": "Renekton.png"
  },
  {
    "id": 107,
    "name": "Rengar",
    "key": "Rengar",
    "image": "Rengar.png"
  },
  {
    "id": 92,
    "name": "Riven",
    "key": "Riven",
    "image": "Riven.png"
  },
  {
    "id": 68,
    "name": "Rumble",
    "key": "Rumble",
    "image": "Rumble.png"
  },
  {
    "id": 13,
    "name": "Ryze",
    "key": "Ryze",
    "image": "Ryze.png"
  },
  {
    "id": 360,
    "name": "Samira",
    "key": "Samira",
    "image": "Samira.png"
  },
  {
    "id": 113,
    "name": "Sejuani",
    "key": "Sejuani",
    "image": "Sejuani.png"
  },
  {
    "id": 235,
    "name": "Senna",
    "key": "Senna",
    "image": "Senna.png"
  },
  {
    "id": 147,
    "name": "Seraphine",
    "key": "Seraphine",
    "image": "Seraphine.png"
  },
  {
    "id": 875,
    "name": "Sett",
    "key": "Sett",
    "image": "Sett.png"
  },
  {
    "id": 35,
    "name": "Shaco",
    "key": "Shaco",
    "image": "Shaco.png"
  },
  {
    "id": 98,
    "name": "Shen",
    "key": "Shen",
    "image": "Shen.png"
  },
  {
    "id": 102,
    "name": "Shyvana",
    "key": "Shyvana",
    "image": "Shyvana.png"
  },
  {
    "id": 27,
    "name": "Singed",
    "key": "Singed",
    "image": "Singed.png"
  },
  {
    "id": 14,
    "name": "Sion",
    "key": "Sion",
    "image": "Sion.png"
  },
  {
    "id": 15,
    "name": "Sivir",
    "key": "Sivir",
    "image": "Sivir.png"
  },
  {
    "id": 72,
    "name": "Skarner",
    "key": "Skarner",
    "image": "Skarner.png"
  },
  {
    "id": 901,
    "name": "Smolder",
    "key": "Smolder",
    "image": "Smolder.png"
  },
  {
    "id": 37,
    "name": "Sona",
    "key": "Sona",
    "image": "Sona.png"
  },
  {
    "id": 16,
    "name": "Soraka",
    "key": "Soraka",
    "image": "Soraka.png"
  },
  {
    "id": 50,
    "name": "Swain",
    "key": "Swain",
    "image": "Swain.png"
  },
  {
    "id": 517,
    "name": "Sylas",
    "key": "Sylas",
    "image": "Sylas.png"
  },
  {
    "id": 134,
    "name": "Syndra",
    "key": "Syndra",
    "image": "Syndra.png"
  },
  {
    "id": 223,
    "name": "Tahm Kench",
    "key": "TahmKench",
    "image": "TahmKench.png"
  },
  {
    "id": 163,
    "name": "Taliyah",
    "key": "Taliyah",
    "image": "Taliyah.png"
  },
  {
    "id": 91,
    "name": "Talon",
    "key": "Talon",
    "image": "Talon.png"
  },
  {
    "id": 44,
    "name": "Taric",
    "key": "Taric",
    "image": "Taric.png"
  },
  {
    "id": 17,
    "name": "Teemo",
    "key": "Teemo",
    "image": "Teemo.png"
  },
  {
    "id": 412,
    "name": "Thresh",
    "key": "Thresh",
    "image": "Thresh.png"
  },
  {
    "id": 18,
    "name": "Tristana",
    "key": "Tristana",
    "image": "Tristana.png"
  },
  {
    "id": 48,
    "name": "Trundle",
    "key": "Trundle",
    "image": "Trundle.png"
  },
  {
    "id": 23,
    "name": "Tryndamere",
    "key": "Tryndamere",
    "image": "Tryndamere.png"
  },
  {
    "id": 4,
    "name": "Twisted Fate",
    "key": "TwistedFate",
    "image": "TwistedFate.png"
  },
  {
    "id": 29,
    "name": "Twitch",
    "key": "Twitch",
    "image": "Twitch.png"
  },
  {
    "id": 77,
    "name": "Udyr",
    "key": "Udyr",
    "image": "Udyr.png"
  },
  {
    "id": 6,
    "name": "Urgot",
    "key": "Urgot",
    "image": "Urgot.png"
  },
  {
    "id": 110,
    "name": "Varus",
    "key": "Varus",
    "image": "Varus.png"
  },
  {
    "id": 67,
    "name": "Vayne",
    "key": "Vayne",
    "image": "Vayne.png"
  },
  {
    "id": 45,
    "name": "Veigar",
    "key": "Veigar",
    "image": "Veigar.png"
  },
  {
    "id": 161,
    "name": "Vel'Koz",
    "key": "Velkoz",
    "image": "Velkoz.png"
  },
  {
    "id": 711,
    "name": "Vex",
    "key": "Vex",
    "image": "Vex.png"
  },
  {
    "id": 254,
    "name": "Vi",
    "key": "Vi",
    "image": "Vi.png"
  },
  {
    "id": 234,
    "name": "Viego",
    "key": "Viego",
    "image": "Viego.png"
  },
  {
    "id": 112,
    "name": "Viktor",
    "key": "Viktor",
    "image": "Viktor.png"
  },
  {
    "id": 8,
    "name": "Vladimir",
    "key": "Vladimir",
    "image": "Vladimir.png"
  },
  {
    "id": 106,
    "name": "Volibear",
    "key": "Volibear",
    "image": "Volibear.png"
  },
  {
    "id": 19,
    "name": "Warwick",
    "key": "Warwick",
    "image": "Warwick.png"
  },
  {
    "id": 62,
    "name": "Wukong",
    "key": "MonkeyKing",
    "image": "MonkeyKing.png"
  },
  {
    "id": 498,
    "name": "Xayah",
    "key": "Xayah",
    "image": "Xayah.png"
  },
  {
    "id": 101,
    "name": "Xerath",
    "key": "Xerath",
    "image": "Xerath.png"
  },
  {
    "id": 5,
    "name": "Xin Zhao",
    "key": "XinZhao",
    "image": "XinZhao.png"
  },
  {
    "id": 157,
    "name": "Yasuo",
    "key": "Yasuo",
    "image": "Yasuo.png"
  },
  {
    "id": 777,
    "name": "Yone",
    "key": "Yone",
    "image": "Yone.png"
  },
  {
    "id": 83,
    "name": "Yorick",
    "key": "Yorick",
    "image": "Yorick.png"
  },
  {
    "id": 350,
    "name": "Yuumi",
    "key": "Yuumi",
    "image": "Yuumi.png"
  },
  {
    "id": 154,
    "name": "Zac",
    "key": "Zac",
    "image": "Zac.png"
  },
  {
    "id": 238,
    "name": "Zed",
    "key": "Zed",
    "image": "Zed.png"
  },
  {
    "id": 221,
    "name": "Zeri",
    "key": "Zeri",
    "image": "Zeri.png"
  },
  {
    "id": 115,
    "name": "Ziggs",
    "key": "Ziggs",
    "image": "Ziggs.png"
  },
  {
    "id": 26,
    "name": "Zilean",
    "key": "Zilean",
    "image": "Zilean.png"
  },
  {
    "id": 142,
    "name": "Zoe",
    "key": "Zoe",
    "image": "Zoe.png"
  },
  {
    "id": 143,
    "name": "Zyra",
    "key": "Zyra",
    "image": "Zyra.png"
  }
];

const CHAMPIONS_BY_ID = new Map<number, ChampionInfo>(
  ALL_CHAMPIONS.map((c) => [c.id, c])
);
const CHAMPIONS_BY_IMAGE = new Map<string, ChampionInfo>(
  ALL_CHAMPIONS.map((c) => [c.image, c])
);

// ==========================================
// Registro dinámico de campeones (REQ-013)
// ==========================================

/**
 * Icono genérico (SVG embebido) para campeones desconocidos. Evita mostrar el
 * retrato de otro campeón (p. ej. Aatrox) o una imagen rota mientras llega el
 * catálogo dinámico desde Data Dragon / la LCU.
 */
export const GENERIC_CHAMPION_ICON_URL =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' +
      '<rect width="48" height="48" rx="8" fill="#1e2328"/>' +
      '<circle cx="24" cy="24" r="22" fill="none" stroke="#785a28" stroke-width="2"/>' +
      '<circle cx="24" cy="19" r="8" fill="#5c6b73"/>' +
      '<path d="M8 46c1.5-9 8-13 16-13s14.5 4 16 13z" fill="#5c6b73"/>' +
    '</svg>'
  );

/** Normaliza una entrada antes de registrarla; devuelve `null` si es inválida. */
function normalizarCampeon(campeon: ChampionInfo | null | undefined): ChampionInfo | null {
  if (!campeon || !Number.isInteger(campeon.id) || campeon.id <= 0) {
    return null;
  }
  const nombre = typeof campeon.name === 'string' ? campeon.name.trim() : '';
  if (!nombre) {
    return null;
  }
  const clave = typeof campeon.key === 'string' && campeon.key.trim() ? campeon.key.trim() : nombre;
  return {
    id: campeon.id,
    name: nombre,
    key: clave,
    image: typeof campeon.image === 'string' && campeon.image.trim() ? campeon.image : `${clave}.png`,
    iconUrl: typeof campeon.iconUrl === 'string' && campeon.iconUrl.trim() ? campeon.iconUrl : undefined,
  };
}

/**
 * Registra (o actualiza) campeones obtenidos dinámicamente desde Data Dragon,
 * la LCU o Community Dragon. Muta `ALL_CHAMPIONS` en sitio para que las vistas
 * que ya mantienen una referencia a la lista reciban los cambios al vuelo.
 *
 * @returns Cantidad de campeones nuevos añadidos (los existentes se actualizan).
 */
export function registrarCampeones(campeones: readonly ChampionInfo[]): number {
  let nuevos = 0;

  for (const candidato of campeones ?? []) {
    const campeon = normalizarCampeon(candidato);
    if (!campeon) {
      continue;
    }

    const existente = CHAMPIONS_BY_ID.get(campeon.id);
    if (!existente) {
      ALL_CHAMPIONS.push(campeon);
      CHAMPIONS_BY_ID.set(campeon.id, campeon);
      CHAMPIONS_BY_IMAGE.set(campeon.image, campeon);
      nuevos += 1;
      continue;
    }

    const fusionado: ChampionInfo = {
      id: existente.id,
      name: campeon.name || existente.name,
      key: campeon.key || existente.key,
      image: campeon.image || existente.image,
      iconUrl: campeon.iconUrl ?? existente.iconUrl,
    };
    const indice = ALL_CHAMPIONS.indexOf(existente);
    if (indice !== -1) {
      ALL_CHAMPIONS[indice] = fusionado;
    }
    CHAMPIONS_BY_ID.set(fusionado.id, fusionado);
    CHAMPIONS_BY_IMAGE.set(fusionado.image, fusionado);
  }

  return nuevos;
}

/** Devuelve una copia del catálogo actual ordenada alfabéticamente por nombre. */
export function obtenerTodosLosCampeones(): ChampionInfo[] {
  return [...ALL_CHAMPIONS].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function getChampionById(id: number): ChampionInfo | undefined {
  return CHAMPIONS_BY_ID.get(id);
}

export function getChampionName(id: number, fallback = 'Campeón'): string {
  const champ = CHAMPIONS_BY_ID.get(id);
  return champ ? champ.name : `${fallback} (${id})`;
}

export function getChampionIconUrl(imageOrId: string | number, patch = '14.20.1'): string {
  if (typeof imageOrId === 'number') {
    const champ = CHAMPIONS_BY_ID.get(imageOrId);
    if (!champ) {
      return GENERIC_CHAMPION_ICON_URL;
    }
    if (champ.iconUrl) {
      return champ.iconUrl;
    }
    return `https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${champ.image}`;
  }

  // Las URLs ya construidas (p. ej. Community Dragon) se respetan tal cual.
  if (/^(https?:|data:)/i.test(imageOrId)) {
    return imageOrId;
  }

  const file = imageOrId.endsWith('.png') ? imageOrId : `${imageOrId}.png`;
  const champ = CHAMPIONS_BY_IMAGE.get(file);
  if (champ?.iconUrl) {
    return champ.iconUrl;
  }
  return `https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${file}`;
}
