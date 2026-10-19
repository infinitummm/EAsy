/**
 * Pruebas unitarias del servicio de Data Dragon (T-3.6).
 * Se levanta un CDN simulado local para verificar la detección de versión,
 * la descarga y parseo de metadatos, la caché en memoria y en disco, los
 * errores tipados y los helpers de URLs de imágenes.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DataDragonService,
  ErrorDataDragon,
  type OpcionesDataDragonService,
} from '../../src/main/riot/DataDragonService';

// ==========================================
// CDN simulado
// ==========================================

const VERSION = '15.1.1';

const CAMPEONES = {
  type: 'champion',
  format: 'standAloneComplex',
  version: VERSION,
  data: {
    Aatrox: {
      id: 'Aatrox',
      key: '266',
      name: 'Aatrox',
      title: 'la Espada Darkin',
      tags: ['Fighter'],
      image: { full: 'Aatrox.png' },
    },
  },
} as const;

const ITEMS = {
  type: 'item',
  version: VERSION,
  data: {
    '3153': {
      id: '3153',
      name: 'Filo de la Ruina',
      description: '<mainText>Daño de ataque</mainText>',
      gold: { total: 3200 },
      tags: ['Damage'],
      image: { full: '3153.png' },
    },
  },
} as const;

const ARBOLES = [
  {
    id: 8000,
    key: 'Precision',
    name: 'Precisión',
    icon: 'perk-images/Styles/7201_Precision.png',
    slots: [
      {
        runes: [
          { id: 8005, key: 'PressTheAttack', name: 'Ataque intensificado', icon: 'perk-images/8005.png' },
        ],
      },
    ],
  },
] as const;

const HECHIZOS = {
  type: 'summoner',
  version: VERSION,
  data: {
    SummonerFlash: {
      id: 'SummonerFlash',
      key: '4',
      name: 'Destello',
      image: { full: 'SummonerFlash.png' },
    },
  },
} as const;

let servidor: Server;
let puerto: number;
let peticiones: string[];

function responderJson(res: ServerResponse, estado: number, datos: unknown): void {
  res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(datos));
}

function crearServicio(extra: Partial<OpcionesDataDragonService> = {}): DataDragonService {
  return new DataDragonService({
    urlVersiones: `http://127.0.0.1:${puerto}/api/versions.json`,
    cdnBase: `http://127.0.0.1:${puerto}/cdn`,
    comunidadBase: `http://127.0.0.1:${puerto}/comunidad`,
    ...extra,
  });
}

function contarPeticiones(fragmento: string): number {
  return peticiones.filter((ruta) => ruta.includes(fragmento)).length;
}

beforeEach(async () => {
  peticiones = [];
  servidor = createServer((req, res) => {
    const ruta = (req.url ?? '').split('?')[0];
    peticiones.push(ruta);

    if (ruta === '/api/versions.json') {
      return responderJson(res, 200, [VERSION, '15.1.0', '15.0.1']);
    }
    if (ruta === `/cdn/${VERSION}/data/es_ES/champion.json`) {
      return responderJson(res, 200, CAMPEONES);
    }
    if (ruta === `/cdn/${VERSION}/data/es_ES/item.json`) {
      return responderJson(res, 200, ITEMS);
    }
    if (ruta === `/cdn/${VERSION}/data/es_ES/runesReforged.json`) {
      return responderJson(res, 200, ARBOLES);
    }
    if (ruta === `/cdn/${VERSION}/data/es_ES/summoner.json`) {
      return responderJson(res, 200, HECHIZOS);
    }
    if (ruta === '/cdn/14.20.1/data/es_ES/champion.json') {
      return responderJson(res, 200, { data: { Yasuo: { id: 'Yasuo', key: '157', name: 'Yasuo', title: 'el Imperdonable', tags: ['Fighter'], image: { full: 'Yasuo.png' } } } });
    }
    if (ruta === '/cdn/roto/data/es_ES/champion.json') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('esto no es json');
    }
    return responderJson(res, 404, { message: 'Not Found' });
  });

  await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  puerto = (servidor.address() as AddressInfo).port;
});

afterEach(async () => {
  servidor.closeAllConnections();
  await new Promise<void>((resolver) => servidor.close(() => resolver()));
});

// ==========================================
// Suite
// ==========================================

describe('DataDragonService (T-3.6)', () => {
  describe('detección de versión', () => {
    it('devuelve la primera versión del CDN y la cachea en memoria', async () => {
      const servicio = crearServicio();

      await expect(servicio.obtenerVersionActual()).resolves.toBe(VERSION);
      await expect(servicio.obtenerVersionActual()).resolves.toBe(VERSION);

      expect(contarPeticiones('/api/versions.json')).toBe(1);
    });

    it('lanza ErrorDataDragon si la lista de versiones es inválida', async () => {
      servidor.removeAllListeners('request');
      servidor.on('request', (_req, res) => responderJson(res, 200, { version: VERSION }));

      const servicio = crearServicio();
      await expect(servicio.obtenerVersionActual()).rejects.toThrow(ErrorDataDragon);
    });
  });

  describe('metadatos', () => {
    it('obtiene y cachea los campeones de la versión actual', async () => {
      const servicio = crearServicio();

      const campeones = await servicio.obtenerCampeones();
      expect(campeones).toEqual([CAMPEONES.data.Aatrox]);
      expect(peticiones).toContain(`/cdn/${VERSION}/data/es_ES/champion.json`);

      const deNuevo = await servicio.obtenerCampeones();
      expect(deNuevo).toEqual(campeones);
      expect(contarPeticiones('champion.json')).toBe(1);
    });

    it('obtiene objetos, hechizos y árboles de runas', async () => {
      const servicio = crearServicio();

      await expect(servicio.obtenerItems()).resolves.toEqual([ITEMS.data['3153']]);
      await expect(servicio.obtenerHechizos()).resolves.toEqual([HECHIZOS.data.SummonerFlash]);
      await expect(servicio.obtenerArbolesDeRunas()).resolves.toEqual([...ARBOLES]);

      expect(peticiones).toEqual(
        expect.arrayContaining([
          `/cdn/${VERSION}/data/es_ES/item.json`,
          `/cdn/${VERSION}/data/es_ES/summoner.json`,
          `/cdn/${VERSION}/data/es_ES/runesReforged.json`,
        ])
      );
    });

    it('respeta la versión explícita sin consultar versions.json', async () => {
      const servicio = crearServicio();

      const campeones = await servicio.obtenerCampeones('14.20.1');
      expect(campeones).toHaveLength(1);
      expect(contarPeticiones('/api/versions.json')).toBe(0);
      expect(peticiones).toContain('/cdn/14.20.1/data/es_ES/champion.json');
    });

    it('usa el idioma configurado', async () => {
      const servicio = crearServicio({ idioma: 'en_US' });
      await servicio.obtenerCampeones(VERSION).catch(() => undefined);

      expect(peticiones).toContain(`/cdn/${VERSION}/data/en_US/champion.json`);
    });
  });

  describe('caché en disco', () => {
    it('reutiliza metadatos y versión entre instancias sin tocar el CDN', async () => {
      const directorio = await mkdtemp(join(tmpdir(), 'itero-ddragon-'));
      try {
        const primera = crearServicio({ directorioCache: directorio });
        await primera.obtenerCampeones();
        expect(contarPeticiones('/api/versions.json')).toBe(1);

        peticiones = [];
        const segunda = crearServicio({ directorioCache: directorio });
        const campeones = await segunda.obtenerCampeones();

        expect(campeones).toEqual([CAMPEONES.data.Aatrox]);
        expect(peticiones).toEqual([]);
      } finally {
        await rm(directorio, { recursive: true, force: true });
      }
    });

    it('revalida la versión cuando expira el TTL', async () => {
      const directorio = await mkdtemp(join(tmpdir(), 'itero-ddragon-'));
      try {
        const servicio = crearServicio({ directorioCache: directorio, ttlVersionMs: 0 });

        await servicio.obtenerVersionActual();
        await servicio.obtenerVersionActual();

        // Con TTL 0 la segunda instancia en disco ya está vencida: se reconsulta.
        peticiones = [];
        const otra = crearServicio({ directorioCache: directorio, ttlVersionMs: 0 });
        await otra.obtenerVersionActual();
        expect(contarPeticiones('/api/versions.json')).toBe(1);
      } finally {
        await rm(directorio, { recursive: true, force: true });
      }
    });

    it('invalidarCacheMemoria vuelve a consultar el CDN si no hay disco', async () => {
      const servicio = crearServicio();
      await servicio.obtenerCampeones();
      expect(contarPeticiones('champion.json')).toBe(1);

      servicio.invalidarCacheMemoria();
      await servicio.obtenerCampeones();
      expect(contarPeticiones('champion.json')).toBe(2);
    });

    it('invalidarCacheMemoria usa el disco sin consultar el CDN', async () => {
      const directorio = await mkdtemp(join(tmpdir(), 'itero-ddragon-'));
      try {
        const servicio = crearServicio({ directorioCache: directorio });
        await servicio.obtenerCampeones();
        expect(contarPeticiones('champion.json')).toBe(1);

        peticiones = [];
        servicio.invalidarCacheMemoria();
        await servicio.obtenerCampeones();
        expect(peticiones).toEqual([]);
      } finally {
        await rm(directorio, { recursive: true, force: true });
      }
    });
  });

  describe('errores', () => {
    it('un 404 produce ErrorDataDragon con el código', async () => {
      const servicio = crearServicio();

      const error = await servicio.obtenerCampeones('99.9.9').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ErrorDataDragon);
      expect((error as ErrorDataDragon).codigoEstado).toBe(404);
    });

    it('una respuesta no JSON produce ErrorDataDragon', async () => {
      const servicio = crearServicio();

      await expect(servicio.obtenerCampeones('roto')).rejects.toThrow(ErrorDataDragon);
    });

    it('un fallo de red produce ErrorDataDragon', async () => {
      const servicio = crearServicio({ urlVersiones: 'http://127.0.0.1:9/api/versions.json' });

      await expect(servicio.obtenerVersionActual()).rejects.toThrow(ErrorDataDragon);
    });
  });

  describe('URLs de imágenes', () => {
    it('construye URLs con la versión conocida y acepta versión explícita', async () => {
      const servicio = crearServicio();
      await servicio.obtenerVersionActual();

      expect(servicio.urlCampeon('Aatrox.png')).toBe(
        `http://127.0.0.1:${puerto}/cdn/${VERSION}/img/champion/Aatrox.png`
      );
      expect(servicio.urlItem('3153')).toBe(
        `http://127.0.0.1:${puerto}/cdn/${VERSION}/img/item/3153.png`
      );
      expect(servicio.urlItem('3153.png')).toBe(
        `http://127.0.0.1:${puerto}/cdn/${VERSION}/img/item/3153.png`
      );
      expect(servicio.urlHechizo('SummonerFlash.png', '14.20.1')).toBe(
        `http://127.0.0.1:${puerto}/cdn/14.20.1/img/spell/SummonerFlash.png`
      );
    });

    it('lanza ErrorDataDragon si aún no se conoce la versión', () => {
      const servicio = crearServicio();
      expect(() => servicio.urlCampeon('Aatrox.png')).toThrow(ErrorDataDragon);
    });

    it('construye URLs de Community Dragon', () => {
      const servicio = crearServicio();
      expect(servicio.urlComunidad('/v1/perk-images/styles/7201_Precision.png')).toBe(
        `http://127.0.0.1:${puerto}/comunidad/v1/perk-images/styles/7201_Precision.png`
      );
    });
  });
});
