/**
 * Pruebas unitarias del servicio de augments de modos (T-8.3).
 *
 * Se usan páginas RSC sintéticas con la misma forma que las de OP.GG y un
 * catálogo reducido de Community Dragon. El `fetch` y la base de datos se
 * inyectan para verificar la extracción, la traducción, el orden de
 * recomendaciones, la clave/TTL de caché y el tratamiento de errores sin tocar
 * la red ni una base real.
 */

import { describe, expect, it, vi } from 'vitest';
import { CDN_URLS } from '../../src/shared/constants';
import type { IDatabaseService } from '../../src/shared/contracts';
import type { DatosModoCampeon } from '../../src/shared/types';
import {
  ErrorDatosModo,
  ModeAugmentService,
  URL_CATALOGO_AUGMENTS_ES,
  asignarTiersPorRendimiento,
  construirClaveCacheModo,
  construirDatosModo,
  construirUrlAugmentsOpGg,
  construirUrlIconoCommunityDragon,
  extraerAugmentsDesdeRsc,
  extraerTextoRsc,
  indexarCatalogoCommunityDragon,
  limpiarTextoAugment,
  mapearRareza,
  mapearTierOpGg,
} from '../../src/main/modes/ModeAugmentService';
import type { AugmentCrudoOpGg } from '../../src/main/modes/ModeAugmentService';

// ==========================================
// Fixtures sintéticos con la forma de OP.GG
// ==========================================

const AUGMENTS_ARAM: AugmentCrudoOpGg[] = [
  {
    id: 1007,
    name: 'Blunt Force',
    key: 'ARAM_BluntForce',
    tier: 0,
    performance: 78.88,
    popular: 2.89,
    rarity: 1,
    largeIcon: 'https://opgg.example/BluntForce_large.png',
    smallIcon: 'https://opgg.example/BluntForce_small.png',
    desc: 'Gain <b>20%</b> Attack Damage.',
  },
  {
    id: 1205,
    name: 'ADAPt',
    key: 'ARAM_ADAPt',
    tier: 2,
    performance: 70.5,
    popular: 5.25,
    rarity: 1,
    largeIcon: 'https://opgg.example/ADAPt_large.png',
    desc: 'Convierte daño de ataque en poder de habilidad.',
  },
  {
    id: 1238,
    name: 'Transmute: Prismatic',
    key: 'ARAM_TransmutePrismatic',
    tier: 1,
    performance: 79.22,
    popular: 2.5,
    rarity: 4,
    largeIcon: 'https://opgg.example/TransmutePrismatic_large.png',
    desc: 'Gain a random Prismatic Augment.',
  },
  {
    id: 2141,
    name: 'Ultra Hydra',
    key: 'Quest_UltraHydra',
    tier: 3,
    performance: 86.7,
    popular: 1.44,
    rarity: 8,
    largeIcon: 'https://opgg.example/UltraHydra_large.png',
    desc: 'Gain a Tiamat when completing a Hydra Item.',
  },
  {
    id: 3000,
    name: 'Augment de prueba',
    key: 'ARAM_Falso',
    tier: 5,
    performance: 50,
    popular: 9.1,
    rarity: 4,
    largeIcon: 'https://opgg.example/Falso_large.png',
    desc: 'Texto &amp; más',
  },
];

const CATALOGO_CDRAGON: unknown[] = [
  {
    id: 1007,
    augmentNameId: 'ARAM_BluntForce',
    nameTRA: 'Con la mano abierta',
    augmentSmallIconPath:
      '/lol-game-data/assets/ASSETS/UX/Cherry/Augments/Icons/BluntForce_small.png',
    rarity: 'kSilver',
  },
  {
    id: 1205,
    augmentNameId: 'ARAM_ADAPt',
    nameTRA: 'A-DA-PH-TARSE',
    augmentSmallIconPath:
      '/lol-game-data/assets/ASSETS/UX/Cherry/Augments/Icons/ADAPt_small.png',
    rarity: 'kSilver',
  },
  {
    id: 1238,
    augmentNameId: 'ARAM_TransmutePrismatic',
    nameTRA: 'Transmutar: Prismático',
    augmentSmallIconPath:
      '/lol-game-data/assets/ASSETS/UX/Cherry/Augments/Icons/TransmutePrismatic_small.png',
    rarity: 'kGold',
  },
  {
    id: 3000,
    augmentNameId: 'ARAM_Falso',
    nameTRA: 'Augment traducido',
    augmentSmallIconPath: '/lol-game-data/assets/ASSETS/UX/Cherry/Augments/Icons/Falso_small.png',
    rarity: 'kGold',
  },
  {
    id: 4000,
    augmentNameId: 'Arena_Plata_1',
    nameTRA: 'Arena plata uno',
    augmentSmallIconPath: '/lol-game-data/assets/ASSETS/UX/Cherry/Augments/Icons/Arena1_small.png',
    rarity: 'kSilver',
  },
  {
    id: 4012,
    augmentNameId: 'Arena_Prismatico_1',
    nameTRA: 'Arena prismático uno',
    augmentSmallIconPath: '/lol-game-data/assets/ASSETS/UX/Cherry/Augments/Icons/Arena13_small.png',
    rarity: 'kPrismatic',
  },
];

function crearArena(
  rareza: number,
  ids: number[],
  winRateBase: number,
  pickRateBase: number
): AugmentCrudoOpGg[] {
  return ids.map((id, indice) => ({
    id,
    name: `Arena ${rareza}-${indice + 1}`,
    rareity: rareza,
    image_url: `https://opgg.example/arena-${id}_large.png`,
    pick_rate: Number((pickRateBase - indice * 0.1).toFixed(2)),
    win_rate: Number((winRateBase - indice * 0.5).toFixed(2)),
    play: '1,234',
    desc: indice === 0 ? 'Texto <b>de arena</b>' : '',
  }));
}

const ARENA_PLATA = crearArena(1, [4000, 4001, 4002, 4003, 4004, 4005], 60, 4);
const ARENA_ORO = crearArena(4, [4006, 4007, 4008, 4009, 4010, 4011], 59, 3);
const ARENA_PRISMATICO = crearArena(8, [4012, 4013, 4014, 4015, 4016, 4017], 61, 2);

// ==========================================
// Utilidades RSC y HTTP simuladas
// ==========================================

/** Envuelve un texto RSC en fragmentos de Next, partiéndolo en dos mitades. */
function htmlDesdeRsc(rsc: string): string {
  const mitad = Math.floor(rsc.length / 2);
  const fragmentos = [rsc.slice(0, mitad), rsc.slice(mitad)].filter(Boolean);
  return `<html><body>${fragmentos
    .map((fragmento) => `<script>self.__next_f.push([1,${JSON.stringify(fragmento)}])</script>`)
    .join('')}</body></html>`;
}

function paginaAram(): string {
  return htmlDesdeRsc(`7:["$","$L58",null,{"data":${JSON.stringify(AUGMENTS_ARAM)}}]`);
}

function paginaArena(): string {
  return htmlDesdeRsc(
    `5a:["$","div",null,{"data":{"1":${JSON.stringify(
      ARENA_PLATA
    )},"4":${JSON.stringify(ARENA_ORO)},"8":${JSON.stringify(
      ARENA_PRISMATICO
    )}}}]`
  );
}

function respuestaJson(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function respuestaHtml(html: string, estado = 200): Response {
  return new Response(html, {
    status: estado,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ==========================================
// Doble de la base de datos
// ==========================================

class BdFalsa {
  readonly cache = new Map<string, DatosModoCampeon>();
  readonly escrituras: Array<{ clave: string; ttl: number }> = [];
  fallarAlEscribir = false;

  getModeCache(clave: string): DatosModoCampeon | null {
    return this.cache.get(clave) ?? null;
  }

  setModeCache(clave: string, datos: DatosModoCampeon, ttlSegundos: number): void {
    if (this.fallarAlEscribir) throw new Error('fallo de escritura simulado');
    this.cache.set(clave, datos);
    this.escrituras.push({ clave, ttl: ttlSegundos });
  }
}

interface EntornoFetch {
  fetchFalso: ReturnType<typeof vi.fn>;
  peticiones: Array<{ url: string; init?: RequestInit }>;
}

function crearFetch(opciones: {
  aram?: string | Response;
  arena?: string | Response;
  catalogo?: unknown;
  parche?: string;
  fallarCatalogo?: boolean;
  estadoAram?: number;
} = {}): EntornoFetch {
  const peticiones: Array<{ url: string; init?: RequestInit }> = [];
  const fetchFalso = vi.fn(
    async (input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
      const url = String(input);
      peticiones.push({ url, init: _init });

      if (url === CDN_URLS.DDRAGON_VERSIONS) {
        return respuestaJson([opciones.parche ?? '16.21.1']);
      }
      if (url === URL_CATALOGO_AUGMENTS_ES) {
        if (opciones.fallarCatalogo) throw new Error('CDragon caído');
        return respuestaJson(opciones.catalogo ?? CATALOGO_CDRAGON);
      }
      if (url.includes('/modes/aram-mayhem/')) {
        if (opciones.estadoAram && opciones.estadoAram !== 200) {
          return respuestaJson({ error: 'OP.GG no disponible' }, opciones.estadoAram);
        }
        if (opciones.aram instanceof Response) return opciones.aram;
        return respuestaHtml(
          typeof opciones.aram === 'string' ? opciones.aram : paginaAram()
        );
      }
      if (url.includes('/modes/arena/')) {
        if (opciones.arena instanceof Response) return opciones.arena;
        return respuestaHtml(
          typeof opciones.arena === 'string' ? opciones.arena : paginaArena()
        );
      }

      return respuestaJson({ error: `URL inesperada: ${url}` }, 404);
    }
  );

  return { fetchFalso, peticiones };
}

// ==========================================
// Parser y utilidades puras
// ==========================================

describe('parser RSC de OP.GG y utilidades', () => {
  it('reconstruye fragmentos de Next partidos y extrae los augments', () => {
    const html = paginaAram();
    const texto = extraerTextoRsc(html);
    expect(texto).toContain('"Blunt Force"');
    expect(texto).toContain('"Ultra Hydra"');

    const augments = extraerAugmentsDesdeRsc(html);
    expect(augments).toHaveLength(AUGMENTS_ARAM.length);
    expect(augments.map((augment) => augment.id)).toEqual([
      1007, 1205, 1238, 2141, 3000,
    ]);
  });

  it('extrae los augments agrupados por rareza de Arena y deduplica', () => {
    const html = paginaArena();
    const augments = extraerAugmentsDesdeRsc(html);
    expect(augments).toHaveLength(18);
    expect(new Set(augments.map((augment) => augment.rareity))).toEqual(
      new Set([1, 4, 8])
    );

    // Duplicar el payload no debe duplicar los resultados.
    const duplicados = extraerAugmentsDesdeRsc(`${html}${html}`);
    expect(duplicados).toHaveLength(18);
  });

  it('devuelve una lista vacía si no hay augments', () => {
    expect(extraerAugmentsDesdeRsc('<html><body>sin datos</body></html>')).toEqual([]);
  });

  it('mapea tiers y rarezas de OP.GG/CDragon', () => {
    expect(mapearTierOpGg(0)).toBe('S+');
    expect(mapearTierOpGg(1)).toBe('S');
    expect(mapearTierOpGg(2)).toBe('A');
    expect(mapearTierOpGg(3)).toBe('B');
    expect(mapearTierOpGg(4)).toBe('C');
    expect(mapearTierOpGg(5)).toBe('D');
    expect(mapearTierOpGg(6)).toBeNull();
    expect(mapearTierOpGg(undefined)).toBeNull();

    expect(mapearRareza(1)).toBe('silver');
    expect(mapearRareza(4)).toBe('gold');
    expect(mapearRareza(8)).toBe('prismatic');
    expect(mapearRareza('kSilver')).toBe('silver');
    expect(mapearRareza('kGold')).toBe('gold');
    expect(mapearRareza('kPrismatic')).toBe('prismatic');
    expect(mapearRareza(99)).toBeNull();
  });

  it('construye la clave de caché con el parche normalizado', () => {
    expect(construirClaveCacheModo('aram_mayhem', 266, '16.21.3')).toBe(
      'mode:aram_mayhem:266:16.21'
    );
    expect(construirClaveCacheModo('arena', 103, '16.21')).toBe(
      'mode:arena:103:16.21'
    );
  });

  it('construye URLs de OP.GG por modo y campeón', () => {
    expect(construirUrlAugmentsOpGg('aram_mayhem', 'KSante')).toBe(
      'https://op.gg/lol/modes/aram-mayhem/ksante/augments'
    );
    expect(construirUrlAugmentsOpGg('arena', 'Aatrox')).toBe(
      'https://op.gg/lol/modes/arena/aatrox/augments'
    );
  });

  it('convierte rutas de iconos de Community Dragon a URLs públicas', () => {
    expect(
      construirUrlIconoCommunityDragon(
        '/lol-game-data/assets/ASSETS/UX/Cherry/Augments/Icons/ADAPt_small.png'
      )
    ).toBe(
      'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/ux/cherry/augments/icons/adapt_small.png'
    );
    expect(construirUrlIconoCommunityDragon(undefined)).toBeNull();
  });

  it('limpia el HTML y decodifica entidades del texto de OP.GG', () => {
    expect(limpiarTextoAugment('<b>Gain</b> 20% &amp; <i>más</i>')).toBe(
      'Gain 20% & más'
    );
    expect(limpiarTextoAugment('Línea<br/>siguiente')).toBe('Línea siguiente');
    expect(limpiarTextoAugment(null)).toBe('');
  });

  it('indexa el catálogo de Community Dragon por id y clave', () => {
    const catalogo = indexarCatalogoCommunityDragon(CATALOGO_CDRAGON);
    expect(catalogo.porId.get(1205)?.nameTRA).toBe('A-DA-PH-TARSE');
    expect(catalogo.porClave.get('ARAM_ADAPt')?.id).toBe(1205);
    expect(indexarCatalogoCommunityDragon([]).porId.size).toBe(0);
  });

  it('asigna tiers por percentil sin sobrescribir los oficiales', () => {
    const parciales = [
      { id: 1, rarity: 'silver' as const, tier: null, winRate: 60, pickRate: 3 },
      { id: 2, rarity: 'silver' as const, tier: null, winRate: 50, pickRate: 2 },
      { id: 3, rarity: 'silver' as const, tier: 'A' as const, winRate: 40, pickRate: 1 },
    ];
    asignarTiersPorRendimiento(parciales);
    expect(parciales.find((augment) => augment.id === 3)?.tier).toBe('A');
    expect(parciales.filter((augment) => augment.id !== 3).every((augment) => augment.tier)).toBe(
      true
    );
  });
});

// ==========================================
// Construcción de datos normalizados
// ==========================================

describe('construcción de DatosModoCampeon', () => {
  it('traduce, ordena y marca el mejor de cada rareza en ARAM', () => {
    const catalogo = indexarCatalogoCommunityDragon(CATALOGO_CDRAGON);
    const datos = construirDatosModo({
      championId: 266,
      championName: 'Aatrox',
      modo: 'aram_mayhem',
      parche: '16.21.1',
      crudos: AUGMENTS_ARAM,
      catalogo,
      ahora: 123,
    });

    expect(datos.patch).toBe('16.21');
    expect(datos.lastUpdated).toBe(123);
    expect(datos.augments).toHaveLength(5);
    expect(datos.augments.map((augment) => augment.tier)).toEqual([
      'S+', 'S', 'A', 'B', 'D',
    ]);

    const blunt = datos.augments.find((augment) => augment.id === 1007)!;
    expect(blunt).toMatchObject({
      name: 'Blunt Force',
      nameEs: 'Con la mano abierta',
      key: 'ARAM_BluntForce',
      rarity: 'silver',
      tier: 'S+',
      pickRate: 2.89,
      winRate: 78.88,
      desc: 'Gain 20% Attack Damage.',
      isBest: true,
    });

    const ultra = datos.augments.find((augment) => augment.id === 2141)!;
    expect(ultra.nameEs).toBe('Ultra Hydra');
    expect(ultra.key).toBe('Quest_UltraHydra');

    expect(datos.suggestedAugments.silver.map((augment) => augment.id)).toEqual([
      1007, 1205,
    ]);
    expect(datos.suggestedAugments.gold.map((augment) => augment.id)).toEqual([
      1238, 3000,
    ]);
    expect(datos.suggestedAugments.prismatic.map((augment) => augment.id)).toEqual([
      2141,
    ]);
    expect(datos.suggestedAugments.silver[0].isBest).toBe(true);
    expect(datos.suggestedAugments.gold[0].isBest).toBe(true);
    expect(datos.suggestedAugments.prismatic[0].isBest).toBe(true);
    expect(datos.suggestedAugments.silver[1].isBest).toBeUndefined();
  });

  it('deriva tiers por win rate en Arena y respeta las rarezas', () => {
    const catalogo = indexarCatalogoCommunityDragon(CATALOGO_CDRAGON);
    const datos = construirDatosModo({
      championId: 266,
      championName: 'Aatrox',
      modo: 'arena',
      parche: '16.21',
      crudos: [...ARENA_PLATA, ...ARENA_ORO, ...ARENA_PRISMATICO],
      catalogo,
      ahora: 456,
    });

    expect(datos.augments).toHaveLength(18);
    expect(datos.suggestedAugments.silver).toHaveLength(6);
    expect(datos.suggestedAugments.gold).toHaveLength(6);
    expect(datos.suggestedAugments.prismatic).toHaveLength(6);

    const plata = datos.suggestedAugments.silver;
    expect(plata[0].id).toBe(4000);
    expect(plata[0].tier).toBe('S+');
    expect(plata[0].isBest).toBe(true);
    expect(new Set(plata.map((augment) => augment.tier))).toEqual(
      new Set(['S+', 'S', 'A', 'B', 'C', 'D'])
    );
    expect(plata[1].isBest).toBeUndefined();

    const primero = datos.augments.find((augment) => augment.id === 4000)!;
    expect(primero).toMatchObject({
      nameEs: 'Arena plata uno',
      key: 'Arena_Plata_1',
      rarity: 'silver',
      pickRate: 4,
      winRate: 60,
      iconUrl: 'https://opgg.example/arena-4000_large.png',
      desc: 'Texto de arena',
    });
    expect(datos.suggestedAugments.prismatic[0].id).toBe(4012);
  });
});

// ==========================================
// Servicio con caché
// ==========================================

describe('ModeAugmentService', () => {
  it('obtiene, traduce y cachea los augments de ARAM durante 24 horas', async () => {
    const bd = new BdFalsa();
    const { fetchFalso, peticiones } = crearFetch();
    const obtenerParche = vi.fn().mockResolvedValue('16.21.2');
    const servicio = new ModeAugmentService(bd as unknown as IDatabaseService, {
      fetchFn: fetchFalso as unknown as typeof fetch,
      obtenerParche,
      registrar: () => {},
      ahora: () => 1000,
      ttlSegundos: 86400,
    });

    const datos = await servicio.getChampionAugments(266, 'aram_mayhem', '16.21.1');

    expect(datos).toMatchObject({
      championId: 266,
      championName: 'Aatrox',
      mode: 'aram_mayhem',
      patch: '16.21',
      lastUpdated: 1000,
    });
    expect(datos.augments).toHaveLength(5);
    expect(obtenerParche).not.toHaveBeenCalled();

    expect(peticiones.map((peticion) => peticion.url)).toEqual([
      construirUrlAugmentsOpGg('aram_mayhem', 'aatrox'),
      URL_CATALOGO_AUGMENTS_ES,
    ]);
    const cabeceras = peticiones[0].init?.headers as Record<string, string>;
    expect(cabeceras['User-Agent']).toContain('Mozilla/5.0');

    expect(bd.escrituras).toEqual([
      { clave: 'mode:aram_mayhem:266:16.21', ttl: 86400 },
    ]);
    expect(bd.cache.get('mode:aram_mayhem:266:16.21')).toBe(datos);

    // Segunda consulta: debe resolverse desde SQLite sin volver a la red.
    const cacheada = await servicio.getChampionAugments(266, 'aram_mayhem', '16.21.9');
    expect(cacheada).toBe(datos);
    expect(fetchFalso).toHaveBeenCalledTimes(2);
    expect(bd.escrituras).toHaveLength(1);
  });

  it('resuelve el parche vigente con Data Dragon si no se pasa parche', async () => {
    const bd = new BdFalsa();
    const { fetchFalso, peticiones } = crearFetch({ parche: '16.21.1' });
    const servicio = new ModeAugmentService(bd as unknown as IDatabaseService, {
      fetchFn: fetchFalso as unknown as typeof fetch,
      registrar: () => {},
    });

    const datos = await servicio.getChampionAugments(266, 'aram_mayhem');

    expect(datos.patch).toBe('16.21');
    expect(peticiones.map((peticion) => peticion.url)).toContain(
      CDN_URLS.DDRAGON_VERSIONS
    );
    expect(bd.escrituras[0].clave).toBe('mode:aram_mayhem:266:16.21');
  });

  it('soporta Arena con su payload agrupado por rareza', async () => {
    const bd = new BdFalsa();
    const { fetchFalso, peticiones } = crearFetch();
    const servicio = new ModeAugmentService(bd as unknown as IDatabaseService, {
      fetchFn: fetchFalso as unknown as typeof fetch,
      obtenerParche: async () => '16.21.1',
      registrar: () => {},
    });

    const datos = await servicio.getChampionAugments(266, 'arena', '16.21');

    expect(datos.mode).toBe('arena');
    expect(datos.augments).toHaveLength(18);
    expect(datos.suggestedAugments.silver[0].id).toBe(4000);
    expect(datos.suggestedAugments.gold[0].id).toBe(4006);
    expect(datos.suggestedAugments.prismatic[0].id).toBe(4012);
    expect(datos.augments.every((augment) => augment.tier)).toBe(true);
    expect(peticiones[0].url).toBe(construirUrlAugmentsOpGg('arena', 'aatrox'));
    expect(bd.escrituras[0].clave).toBe('mode:arena:266:16.21');
  });

  it('no consulta la red para modos sin augments', async () => {
    const bd = new BdFalsa();
    const { fetchFalso } = crearFetch();
    const servicio = new ModeAugmentService(bd as unknown as IDatabaseService, {
      fetchFn: fetchFalso as unknown as typeof fetch,
      registrar: () => {},
    });

    const datos = await servicio.getChampionAugments(266, 'ranked', '16.21');

    expect(datos).toMatchObject({
      championId: 266,
      mode: 'ranked',
      patch: '16.21',
      augments: [],
      suggestedAugments: { silver: [], gold: [], prismatic: [] },
    });
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(bd.escrituras).toHaveLength(0);
  });

  it('mantiene los nombres de OP.GG si Community Dragon falla', async () => {
    const bd = new BdFalsa();
    const registrar = vi.fn();
    const { fetchFalso } = crearFetch({ fallarCatalogo: true });
    const servicio = new ModeAugmentService(bd as unknown as IDatabaseService, {
      fetchFn: fetchFalso as unknown as typeof fetch,
      obtenerParche: async () => '16.21.1',
      registrar,
    });

    const datos = await servicio.getChampionAugments(266, 'aram_mayhem', '16.21');

    expect(datos.augments.find((augment) => augment.id === 1007)?.nameEs).toBe(
      'Blunt Force'
    );
    expect(registrar).toHaveBeenCalledWith(
      expect.stringContaining('No se pudo cargar la traducción')
    );
  });

  it('propaga un error controlado cuando OP.GG responde mal', async () => {
    const bd = new BdFalsa();
    const { fetchFalso, peticiones } = crearFetch({ estadoAram: 503 });
    const servicio = new ModeAugmentService(bd as unknown as IDatabaseService, {
      fetchFn: fetchFalso as unknown as typeof fetch,
      obtenerParche: async () => '16.21.1',
      registrar: () => {},
    });

    await expect(
      servicio.getChampionAugments(266, 'aram_mayhem', '16.21')
    ).rejects.toMatchObject({
      name: 'ErrorDatosModo',
      codigoEstado: 503,
    });
    expect(peticiones).toHaveLength(1);
    expect(bd.escrituras).toHaveLength(0);
  });

  it('propaga un error si OP.GG no devuelve augments parseables', async () => {
    const bd = new BdFalsa();
    const { fetchFalso } = crearFetch({
      aram: '<html><body>sin datos</body></html>',
    });
    const servicio = new ModeAugmentService(bd as unknown as IDatabaseService, {
      fetchFn: fetchFalso as unknown as typeof fetch,
      obtenerParche: async () => '16.21.1',
      registrar: () => {},
    });

    await expect(
      servicio.getChampionAugments(266, 'aram_mayhem', '16.21')
    ).rejects.toBeInstanceOf(ErrorDatosModo);
  });

  it('sigue funcionando si la escritura de caché falla', async () => {
    const bd = new BdFalsa();
    bd.fallarAlEscribir = true;
    const registrar = vi.fn();
    const { fetchFalso } = crearFetch();
    const servicio = new ModeAugmentService(bd as unknown as IDatabaseService, {
      fetchFn: fetchFalso as unknown as typeof fetch,
      obtenerParche: async () => '16.21.1',
      registrar,
    });

    const datos = await servicio.getChampionAugments(266, 'aram_mayhem', '16.21');
    expect(datos.augments).toHaveLength(5);
    expect(registrar).toHaveBeenCalledWith(
      expect.stringContaining('No se pudo guardar la caché')
    );
  });

  it('valida el campeón antes de consultar OP.GG', async () => {
    const bd = new BdFalsa();
    const { fetchFalso } = crearFetch();
    const servicio = new ModeAugmentService(bd as unknown as IDatabaseService, {
      fetchFn: fetchFalso as unknown as typeof fetch,
      registrar: () => {},
    });

    await expect(
      servicio.getChampionAugments(0, 'aram_mayhem', '16.21')
    ).rejects.toBeInstanceOf(ErrorDatosModo);
    await expect(
      servicio.getChampionAugments(999999, 'aram_mayhem', '16.21')
    ).rejects.toBeInstanceOf(ErrorDatosModo);
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});
