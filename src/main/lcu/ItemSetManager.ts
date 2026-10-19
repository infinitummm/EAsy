/**
 * Gestor de Conjuntos de Objetos (Item Sets / Builds) para League of Legends.
 * 
 * Permite exportar la build recomendada generada por IA o por la app directamente al juego:
 * 1. En disco en `Config/Champions/[ChampionKey]/Recommended/IteroBuild.json`
 *    (leído automáticamente por el motor in-game durante la partida en la tienda de objetos).
 * 2. En `Config/ItemSets.json` (persistido globalmente en la configuración del cliente).
 * 3. Vía LCU API `/lol-item-sets/v1/item-sets/{accountId}` si el cliente está conectado.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ILcuClient } from '../../shared/contracts';
import type { BuildRecommendation } from '../../shared/types';
import { getChampionById } from '../../shared/champions';
import { registrarLog } from './LcuDetector';

export interface ParametrosAplicarBuild {
  championId: number;
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
   * Genera la estructura oficial del Item Set de LoL.
   */
  public construirItemSet(params: ParametrosAplicarBuild): Record<string, unknown> {
    const champ = getChampionById(params.championId);
    const champName = champ ? champ.name : `Campeón ${params.championId}`;
    const titulo = params.title || `Itero: Build para ${champName}`;

    const itemsInicio = (params.build.startingItems || [1055, 2003]).map((id: number) => ({
      id: String(id),
      count: 1,
    }));

    const itemsCore = (params.build.coreItems || [3078, 3053, 3156]).map((id: number) => ({
      id: String(id),
      count: 1,
    }));

    const itemsSituacionales = (params.build.situationalItems || []).map((s: { itemId: number; condition?: string }) => ({
      id: String(s.itemId),
      count: 1,
    }));
    // Si no hay situacionales, añadir defensivos por defecto
    if (itemsSituacionales.length === 0) {
      itemsSituacionales.push({ id: '3026', count: 1 }, { id: '3157', count: 1 });
    }

    const itemsConsumibles = [
      { id: '2003', count: 1 }, // Poción de vida
      { id: '2055', count: 1 }, // Guardián de control
      { id: '2140', count: 1 }, // Elixir de furia
      { id: '2139', count: 1 }, // Elixir de hechicería
    ];

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
      blocks: [
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
          type: 'Objetos Centrales (Core Build)',
          recMath: false,
          minSummonerLevel: -1,
          maxSummonerLevel: -1,
          showIfSummonerSpell: '',
          hideIfSummonerSpell: '',
          items: itemsCore,
        },
        {
          type: 'Opciones Situacionales',
          recMath: false,
          minSummonerLevel: -1,
          maxSummonerLevel: -1,
          showIfSummonerSpell: '',
          hideIfSummonerSpell: '',
          items: itemsSituacionales,
        },
        {
          type: 'Consumibles & Pociones',
          recMath: false,
          minSummonerLevel: -1,
          maxSummonerLevel: -1,
          showIfSummonerSpell: '',
          hideIfSummonerSpell: '',
          items: itemsConsumibles,
        },
      ],
    };
  }

  /**
   * Exporta e inyecta la build en el juego.
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

          // Filtrar conjuntos previos creados por Itero para este campeón
          globalData.itemSets = globalData.itemSets.filter(
            (s: any) =>
              !(s.title && s.title.startsWith('Itero:') && s.associatedChampions?.includes(params.championId))
          );
          globalData.itemSets.unshift(itemSetData);
          globalData.timestamp = Date.now();

          fs.writeFileSync(globalItemSetsPath, JSON.stringify(globalData, null, 2), 'utf-8');
          registrarLog(`[ItemSetManager] Build agregada a ItemSets.json global.`);
        } catch (err) {
          registrarLog(`[ItemSetManager] Error actualizando ItemSets.json global: ${err}`);
        }
      }

      // 3. Si LCU está conectado, intentar actualizar vía API
      let lcuApplied = false;
      try {
        if (this.lcuClient.getConnectionState() === 'connected') {
          const summoner = await this.lcuClient.request<{ accountId: number }>(
            'GET',
            '/lol-summoner/v1/current-summoner'
          );
          if (summoner && summoner.accountId) {
            await this.lcuClient.request(
              'POST',
              `/lol-item-sets/v1/item-sets/${summoner.accountId}/sets`,
              itemSetData
            );
            lcuApplied = true;
            registrarLog(`[ItemSetManager] Build sincronizada con LCU API (Account: ${summoner.accountId})`);
          }
        }
      } catch (err) {
        // Silenciar fallo de API si el archivo de disco ya se guardó
        registrarLog(`[ItemSetManager] Nota: LCU API item-sets no disponible o ya sincronizado en disco.`);
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
}
