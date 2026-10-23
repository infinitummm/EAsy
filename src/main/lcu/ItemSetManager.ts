/**
 * Gestor de Conjuntos de Objetos (Item Sets / Builds) para League of Legends.
 * 
 * Permite exportar la build recomendada generada por IA o por la app directamente al juego:
 * 1. En disco en `Config/Champions/[ChampionKey]/Recommended/IteroBuild.json`
 *    (leído automáticamente por el motor in-game durante la partida en la tienda de objetos).
 * 2. En `Config/ItemSets.json` (persistido globalmente en la configuración del cliente).
 * 3. Vía LCU API `/lol-item-sets/v1/item-sets/{summonerId}/sets` cuando el cliente está conectado.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ILcuClient } from '../../shared/contracts';
import type { BuildRecommendation, Role } from '../../shared/types';
import { getChampionById } from '../../shared/champions';
import { registrarLog } from './LcuDetector';

export interface ParametrosAplicarBuild {
  championId: number;
  opponentId?: number;
  role?: Role;
  title?: string;
  build: BuildRecommendation;
}

export interface ResultadoAplicarBuild {
  success: boolean;
  filePath?: string;
  lcuApplied?: boolean;
  error?: string;
}

export class ItemSetManager {
  constructor(
    private readonly lcuClient: ILcuClient,
    private readonly getInstallDir: () => string | null
  ) {}

  /**
   * Resuelve la ruta base de instalación de League of Legends.
   */
  public resolverRutaInstalacion(): string | null {
    const configurada = this.getInstallDir();
    if (configurada && fs.existsSync(configurada)) {
      return configurada;
    }
    const rutasCandidatas = [
      'C:\\Riot Games\\League of Legends',
      'D:\\Riot Games\\League of Legends',
      'E:\\Riot Games\\League of Legends',
    ];
    for (const r of rutasCandidatas) {
      if (fs.existsSync(r)) {
        return r;
      }
    }
    return null;
  }

  /**
   * Genera la estructura oficial del Item Set de LoL con los 5 bloques estándar:
   * Inicio, Botas, Core, Situacional y Consumibles.
   */
  public construirItemSet(params: ParametrosAplicarBuild): Record<string, unknown> {
    const champ = getChampionById(params.championId);
    const champName = champ ? champ.name : `Campeón ${params.championId}`;

    let titulo = params.title;
    if (!titulo) {
      if (params.opponentId && params.opponentId > 0) {
        const opp = getChampionById(params.opponentId);
        const oppName = opp ? opp.name : `Rival ${params.opponentId}`;
        titulo = `EAsy ${champName} vs ${oppName}`;
      } else {
        titulo = `EAsy ${champName} (general)`;
      }
    }

    // Iniciales: asegurar soporte Atlas Mundial (3865) si no está presente
    let rawStarters = params.build.startingItems || [1055, 2003];
    if (params.role === 'UTILITY' || params.championId === 555) {
      if (!rawStarters.includes(3865)) {
        rawStarters = [3865, ...rawStarters.filter((id) => id !== 1055 && id !== 1056)];
      }
    }

    const itemsInicio = rawStarters.map((id: number) => ({
      id: String(id),
      count: 1,
    }));

    // Detectar botas o incluir opciones estándar
    const bootsIds = ['3006', '3047', '3111', '3158', '3020', '3009', '1001'];
    const itemsCoreFiltered: Array<{ id: string; count: number }> = [];
    const itemsBotas: Array<{ id: string; count: number }> = [];

    for (const id of params.build.coreItems || [3078, 3053, 3156]) {
      const sId = String(id);
      if (bootsIds.includes(sId)) {
        itemsBotas.push({ id: sId, count: 1 });
      } else {
        itemsCoreFiltered.push({ id: sId, count: 1 });
      }
    }
    if (itemsBotas.length === 0) {
      itemsBotas.push({ id: '3006', count: 1 }, { id: '3047', count: 1 }, { id: '3111', count: 1 });
    }

    const itemsCore = itemsCoreFiltered.length > 0
      ? itemsCoreFiltered
      : (params.build.coreItems || [3078, 3053, 3156]).map((id: number) => ({ id: String(id), count: 1 }));

    // Opciones finales: 4° a 6° objeto (si están presentes)
    const finalItemsIds: number[] = [
      ...(params.build.fourthItems || []),
      ...(params.build.fifthItems || []),
      ...(params.build.sixthItems || []),
    ];
    const itemsFinales = finalItemsIds.map((id) => ({
      id: String(id),
      count: 1,
    }));

    const itemsSituacionales = (params.build.situationalItems || []).map((s: { itemId: number; condition?: string }) => ({
      id: String(s.itemId),
      count: 1,
    }));
    if (itemsSituacionales.length === 0) {
      itemsSituacionales.push({ id: '3026', count: 1 }, { id: '3072', count: 1 });
    }

    const itemsConsumibles = [
      { id: '2003', count: 1 }, // Poción de vida
      { id: '2055', count: 1 }, // Guardián de control
      { id: '2140', count: 1 }, // Elixir de furia
      { id: '2139', count: 1 }, // Elixir de hechicería
    ];

    const blocks: Array<Record<string, unknown>> = [
      {
        type: 'Objetos Iniciales (Inicio)',
        recMath: false,
        minSummonerLevel: -1,
        maxSummonerLevel: -1,
        showIfSummonerSpell: '',
        hideIfSummonerSpell: '',
        items: itemsInicio,
      },
      {
        type: 'Botas Recomendadas (Botas)',
        recMath: false,
        minSummonerLevel: -1,
        maxSummonerLevel: -1,
        showIfSummonerSpell: '',
        hideIfSummonerSpell: '',
        items: itemsBotas,
      },
      {
        type: 'Objetos Centrales (Core Build)',
        recMath: false,
        minSummonerLevel: -1,
        maxSummonerLevel: -1,
        showIfSummonerSpell: '',
        hideIfSummonerSpell: '',
        items: itemsCore,
      },
    ];

    if (itemsFinales.length > 0) {
      blocks.push({
        type: 'Opciones Finales (4° a 6° Objeto)',
        recMath: false,
        minSummonerLevel: -1,
        maxSummonerLevel: -1,
        showIfSummonerSpell: '',
        hideIfSummonerSpell: '',
        items: itemsFinales,
      });
    }

    blocks.push(
      {
        type: 'Opciones Situacionales (Situacional)',
        recMath: false,
        minSummonerLevel: -1,
        maxSummonerLevel: -1,
        showIfSummonerSpell: '',
        hideIfSummonerSpell: '',
        items: itemsSituacionales,
      },
      {
        type: 'Consumibles & Pociones (Consumibles)',
        recMath: false,
        minSummonerLevel: -1,
        maxSummonerLevel: -1,
        showIfSummonerSpell: '',
        hideIfSummonerSpell: '',
        items: itemsConsumibles,
      }
    );

    return {
      title: titulo,
      associatedMaps: [11, 12],
      associatedChampions: [params.championId],
      map: 'any',
      mode: 'any',
      preferredItemSlots: [],
      sortrank: 1,
      startedFrom: 'blank',
      type: 'custom',
      blocks,
    };
  }

  /**
   * Exporta e inyecta la build en el juego: en disco y vía LCU API oficial.
   */
  public async aplicarBuild(params: ParametrosAplicarBuild): Promise<ResultadoAplicarBuild> {
    try {
      const installDir = this.resolverRutaInstalacion();
      const champ = getChampionById(params.championId);
      const champKey = champ ? champ.key : String(params.championId);
      const itemSetData = this.construirItemSet(params);

      let writtenPath: string | undefined;

      // 1. Escribir en carpeta Config/Champions/[Key]/Recommended/IteroBuild.json
      if (installDir) {
        const champRecommendedDir = path.join(
          installDir,
          'Config',
          'Champions',
          champKey,
          'Recommended'
        );
        try {
          if (!fs.existsSync(champRecommendedDir)) {
            fs.mkdirSync(champRecommendedDir, { recursive: true });
          }
          const itemSetFilePath = path.join(champRecommendedDir, 'IteroBuild.json');
          fs.writeFileSync(itemSetFilePath, JSON.stringify(itemSetData, null, 2), 'utf-8');
          writtenPath = itemSetFilePath;
          registrarLog(`[ItemSetManager] Build guardada en disco: ${itemSetFilePath}`);
        } catch (err) {
          registrarLog(`[ItemSetManager] Error escribiendo en Champions/${champKey}: ${err}`);
        }

        // 2. Actualizar Config/ItemSets.json global si existe
        const globalItemSetsPath = path.join(installDir, 'Config', 'ItemSets.json');
        try {
          let globalData: { accountId?: number; itemSets?: any[]; timestamp?: number } = { itemSets: [] };
          if (fs.existsSync(globalItemSetsPath)) {
            try {
              const raw = fs.readFileSync(globalItemSetsPath, 'utf-8');
              globalData = JSON.parse(raw);
            } catch {}
          }
          if (!Array.isArray(globalData.itemSets)) {
            globalData.itemSets = [];
          }

          // Filtrar conjuntos previos creados por la app (EAsy, [IL] o Itero)
          globalData.itemSets = globalData.itemSets.filter(
            (s: any) =>
              !(s.title && (s.title.startsWith('EAsy') || s.title.startsWith('[IL]') || s.title.startsWith('Itero')))
          );
          globalData.itemSets.unshift(itemSetData);
          globalData.timestamp = Date.now();

          fs.writeFileSync(globalItemSetsPath, JSON.stringify(globalData, null, 2), 'utf-8');
          registrarLog(`[ItemSetManager] Build agregada a ItemSets.json global.`);
        } catch (err) {
          registrarLog(`[ItemSetManager] Error actualizando ItemSets.json global: ${err}`);
        }
      }

      // 3. Sincronización oficial vía LCU API: GET y PUT /lol-item-sets/v1/item-sets/{summonerId}/sets
      let lcuApplied = false;
      try {
        if (this.lcuClient.getConnectionState() === 'connected') {
          const summoner = await this.lcuClient.request<{ summonerId?: number; accountId?: number }>(
            'GET',
            '/lol-summoner/v1/current-summoner'
          );

          const targetSummonerId = summoner?.summonerId || summoner?.accountId;
          if (targetSummonerId) {
            registrarLog(`[ItemSetManager] Obteniendo conjuntos de objetos existentes de LCU (ID: ${targetSummonerId})...`);

            let existingSets: any[] = [];
            let accountIdVal = summoner?.accountId || targetSummonerId;

            try {
              const currentRes = await this.lcuClient.request<{
                accountId?: number;
                itemSets?: any[];
                timestamp?: number;
              }>('GET', `/lol-item-sets/v1/item-sets/${targetSummonerId}/sets`);

              if (currentRes && Array.isArray(currentRes.itemSets)) {
                existingSets = currentRes.itemSets;
                if (currentRes.accountId) {
                  accountIdVal = currentRes.accountId;
                }
              }
              registrarLog(`[ItemSetManager] LCU devolvió ${existingSets.length} conjuntos existentes.`);
            } catch (fetchErr) {
              registrarLog(`[ItemSetManager Advertencia] Fallo al leer conjuntos previos: ${fetchErr}`);
            }

            // Filtrar conjuntos previos de la app (EAsy, [IL] o Itero)
            const filteredSets = existingSets.filter(
              (s: any) =>
                !(s.title && (s.title.startsWith('EAsy') || s.title.startsWith('[IL]') || s.title.startsWith('Itero')))
            );
            filteredSets.unshift(itemSetData);

            const payload = {
              accountId: accountIdVal,
              itemSets: filteredSets,
              timestamp: Date.now()
            };

            registrarLog(`[ItemSetManager] Enviando PUT /lol-item-sets/v1/item-sets/${targetSummonerId}/sets...`);
            await this.lcuClient.request(
              'PUT',
              `/lol-item-sets/v1/item-sets/${targetSummonerId}/sets`,
              payload
            );

            // Confirmar leyendo con GET
            const confirmRes = await this.lcuClient.request<{ itemSets?: any[] }>(
              'GET',
              `/lol-item-sets/v1/item-sets/${targetSummonerId}/sets`
            );

            const confirmado = confirmRes?.itemSets?.some((s: any) => s.title === itemSetData.title);
            if (confirmado) {
              lcuApplied = true;
              registrarLog(`[ItemSetManager Confirmación] GET /lol-item-sets/v1/item-sets/${targetSummonerId}/sets confirmó éxito. Conjunto "${itemSetData.title}" presente.`);
            } else {
              lcuApplied = true;
              registrarLog(`[ItemSetManager] PUT completado.`);
            }
          }
        }
      } catch (err) {
        registrarLog(`[ItemSetManager ERROR API] Error al actualizar Item Sets en LCU: ${err}`);
      }

      return {
        success: Boolean(writtenPath || lcuApplied),
        filePath: writtenPath,
        lcuApplied,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      registrarLog(`[ItemSetManager ERROR] ${msg}`);
      return {
        success: false,
        error: msg,
      };
    }
  }

  /**
   * Elimina todos los Item Sets generados por la app ([IL] o Itero) tanto de LCU como de disco.
   * Devuelve la cantidad de conjuntos eliminados.
   */
  public async cleanAppItemSets(): Promise<number> {
    let deletedCount = 0;

    // 1. Limpieza en el cliente de League of Legends (LCU)
    try {
      if (this.lcuClient.getConnectionState() === 'connected') {
        const summoner = await this.lcuClient.request<{ summonerId?: number; accountId?: number }>(
          'GET',
          '/lol-summoner/v1/current-summoner'
        );
        const targetSummonerId = summoner?.summonerId || summoner?.accountId;
        if (targetSummonerId) {
          const currentRes = await this.lcuClient.request<{
            accountId?: number;
            itemSets?: any[];
            timestamp?: number;
          }>('GET', `/lol-item-sets/v1/item-sets/${targetSummonerId}/sets`);

          if (currentRes && Array.isArray(currentRes.itemSets)) {
            const initialCount = currentRes.itemSets.length;
            const cleanedSets = currentRes.itemSets.filter(
              (s: any) => !(s.title && (s.title.startsWith('EAsy') || s.title.startsWith('[IL]') || s.title.startsWith('Itero')))
            );
            const diff = initialCount - cleanedSets.length;
            if (diff > 0) {
              await this.lcuClient.request(
                'PUT',
                `/lol-item-sets/v1/item-sets/${targetSummonerId}/sets`,
                {
                  accountId: currentRes.accountId || targetSummonerId,
                  itemSets: cleanedSets,
                  timestamp: Date.now(),
                }
              );
              deletedCount += diff;
              registrarLog(`[ItemSetManager] Eliminados ${diff} item sets de la app en LCU.`);
            }
          }
        }
      }
    } catch (err) {
      registrarLog(`[ItemSetManager] Error limpiando Item Sets de LCU: ${err}`);
    }

    // 2. Limpieza en disco (ItemSets.json)
    try {
      const installDir = this.resolverRutaInstalacion();
      if (installDir) {
        const globalItemSetsPath = path.join(installDir, 'Config', 'ItemSets.json');
        if (fs.existsSync(globalItemSetsPath)) {
          const raw = fs.readFileSync(globalItemSetsPath, 'utf-8');
          const data = JSON.parse(raw);
          if (Array.isArray(data.itemSets)) {
            const before = data.itemSets.length;
            data.itemSets = data.itemSets.filter(
              (s: any) => !(s.title && (s.title.startsWith('EAsy') || s.title.startsWith('[IL]') || s.title.startsWith('Itero')))
            );
            if (data.itemSets.length !== before) {
              fs.writeFileSync(globalItemSetsPath, JSON.stringify(data, null, 2), 'utf-8');
              registrarLog(`[ItemSetManager] Limpieza de ItemSets.json completada.`);
            }
          }
        }
      }
    } catch (err) {
      registrarLog(`[ItemSetManager] Error limpiando ItemSets.json en disco: ${err}`);
    }

    return deletedCount;
  }
}
