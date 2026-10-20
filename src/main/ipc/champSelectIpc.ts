/**
 * Controladores IPC para Selección de Campeón, Runas e IA Gemini.
 * Propiedad exclusiva de ANTIGRAVITY.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/events';
import { ILcuClient } from '../../shared/contracts';
import { GeminiService } from '../ai/GeminiService';
import { RuneManager } from '../lcu/RuneManager';
import { ItemSetManager } from '../lcu/ItemSetManager';
import { PatchDiffService } from '../riot/PatchDiffService';
import { RunePage, Role, ChampSelectSession, GameflowPhase, BuildRecommendation } from '../../shared/types';

export function setupChampSelectIpc(
  _mainWindow: BrowserWindow | null,
  lcuClient: ILcuClient,
  geminiService: GeminiService,
  runeManager?: RuneManager,
  itemSetManager?: ItemSetManager,
  dataDragonService?: any,
  patchDiffService?: PatchDiffService
): void {
  const difundir = (canal: string, ...args: unknown[]) => {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(canal, ...args);
      }
    }
  };

  // 1. Inyección de runas al cliente LoL vía LCU API (con soporte de sobrescritura y activación forzada)
  ipcMain.removeHandler(IPC_CHANNELS.LCU_APPLY_RUNES);
  ipcMain.handle(
    IPC_CHANNELS.LCU_APPLY_RUNES,
    async (_event, page: RunePage): Promise<{ success: boolean; pageId?: number; error?: string }> => {
      try {
        let pageId: number | undefined;
        let success = false;
        let error: string | undefined;

        if (runeManager) {
          const res = await runeManager.aplicarPagina(page);
          success = res.success;
          pageId = res.pageId;
          error = res.error;

          if (success && pageId !== undefined) {
            await runeManager.seleccionarPaginaComoActiva(pageId);
          }
        } else {
          const res = await lcuClient.injectRunePage(page);
          success = res.success;
          pageId = res.pageId;
          error = res.error;

          if (success && pageId !== undefined) {
            try {
              await lcuClient.request('PUT', '/lol-perks/v1/currentpage', pageId);
            } catch {}
          }
        }

        return { success, pageId, error };
      } catch (err: unknown) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err)
        };
      }
    }
  );

  // 1b. Inyección y guardado de Conjuntos de Objetos (Build / Item Sets) en disco y LCU
  ipcMain.removeHandler(IPC_CHANNELS.LCU_APPLY_BUILD);
  ipcMain.handle(
    IPC_CHANNELS.LCU_APPLY_BUILD,
    async (
      _event,
      params: { championId: number; title?: string; build: BuildRecommendation }
    ): Promise<{ success: boolean; filePath?: string; lcuApplied?: boolean; error?: string }> => {
      try {
        if (itemSetManager) {
          return await itemSetManager.aplicarBuild(params);
        }
        return {
          success: false,
          error: 'ItemSetManager no disponible en el proceso main.'
        };
      } catch (err: unknown) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err)
        };
      }
    }
  );

  // 2. Consulta de parche actual detectado en Data Dragon
  ipcMain.removeHandler(IPC_CHANNELS.DDRAGON_GET_PATCH);
  ipcMain.handle(IPC_CHANNELS.DDRAGON_GET_PATCH, async (): Promise<string> => {
    try {
      if (dataDragonService) {
        return await dataDragonService.obtenerVersionActual();
      }
      return '16.20.1';
    } catch {
      return '16.20.1';
    }
  });

  // 3. Consulta de recomendación táctica y de matchup con Gemini AI
  ipcMain.removeHandler(IPC_CHANNELS.AI_GET_MATCHUP_ADVICE);
  ipcMain.handle(
    IPC_CHANNELS.AI_GET_MATCHUP_ADVICE,
    async (
      _event,
      params: {
        championId: number;
        opponentId: number;
        role: Role;
        patch: string;
        allies: number[];
        enemies: number[];
        forceRefresh?: boolean;
      }
    ) => {
      return await geminiService.getMatchupAdvice(params);
    }
  );

  // 4. Recomendación inteligente de Draft Picks en vivo
  ipcMain.removeHandler(IPC_CHANNELS.AI_GET_DRAFT_RECOMMENDATIONS);
  ipcMain.handle(
    IPC_CHANNELS.AI_GET_DRAFT_RECOMMENDATIONS,
    async (
      _event,
      params: {
        role: Role;
        patch: string;
        allies: number[];
        enemies: number[];
        bans: number[];
        pickableChampionIds?: number[];
        forceRefresh?: boolean;
      }
    ) => {
      return await geminiService.getDraftRecommendations(params);
    }
  );

  // 5. Campeones elegibles para mí en el Draft actual
  ipcMain.removeHandler(IPC_CHANNELS.LCU_GET_PICKABLE_CHAMPIONS);
  ipcMain.handle(IPC_CHANNELS.LCU_GET_PICKABLE_CHAMPIONS, async (): Promise<number[]> => {
    try {
      if (typeof (lcuClient as any).getPickableChampionIds === 'function') {
        return await (lcuClient as any).getPickableChampionIds();
      }
      return [];
    } catch {
      return [];
    }
  });

  // 6. Selección (Hover) de campeón en el cliente oficial de LoL
  ipcMain.removeHandler(IPC_CHANNELS.LCU_HOVER_CHAMPION);
  ipcMain.handle(
    IPC_CHANNELS.LCU_HOVER_CHAMPION,
    async (_event, championId: number): Promise<{ success: boolean; error?: string }> => {
      try {
        if (typeof (lcuClient as any).hoverChampion === 'function') {
          return await (lcuClient as any).hoverChampion(championId);
        }
        return { success: false, error: 'Método hoverChampion no disponible en LCU' };
      } catch (err: unknown) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err)
        };
      }
    }
  );

  // 7. Estado del Auto-Accept en vivo
  ipcMain.removeHandler(IPC_CHANNELS.LCU_GET_AUTO_ACCEPT_STATUS);
  ipcMain.handle(IPC_CHANNELS.LCU_GET_AUTO_ACCEPT_STATUS, async () => {
    try {
      if (typeof (lcuClient as any).getAutoAcceptStatus === 'function') {
        return (lcuClient as any).getAutoAcceptStatus();
      }
      const enabled = typeof (lcuClient as any).isAutoAcceptEnabled === 'function'
        ? (lcuClient as any).isAutoAcceptEnabled()
        : false;
      return {
        enabled,
        delaySeconds: 2,
        humanVariance: true,
        lastAction: 'Inactivo',
      };
    } catch {
      return {
        enabled: false,
        delaySeconds: 2,
        humanVariance: true,
        lastAction: 'Error al consultar estado',
      };
    }
  });

  // 8. Refresco forzado de catálogo de Data Dragon
  ipcMain.removeHandler(IPC_CHANNELS.DDRAGON_REFRESH_DATA);
  ipcMain.handle(IPC_CHANNELS.DDRAGON_REFRESH_DATA, async () => {
    try {
      if (dataDragonService) {
        dataDragonService.invalidarCacheMemoria();
        const patch = await dataDragonService.obtenerVersionActual();
        await dataDragonService.sincronizarCatalogoCampeones();
        const count = dataDragonService.obtenerCampeones ? (await dataDragonService.obtenerCampeones(patch)).length : 170;
        return { patch, championsCount: count };
      }
      return { patch: '16.20.1', championsCount: 170 };
    } catch (err) {
      return { patch: '16.20.1', championsCount: 170 };
    }
  });

  // 9. Comparación de parches con Data Dragon (Capa 1)
  ipcMain.removeHandler(IPC_CHANNELS.PATCH_DIFF_GET);
  ipcMain.handle(IPC_CHANNELS.PATCH_DIFF_GET, async (_event, patch?: string) => {
    try {
      if (patchDiffService) {
        const targetPatch = patch || (dataDragonService ? await dataDragonService.obtenerVersionActual() : '16.20.1');
        return await patchDiffService.compararParches(targetPatch);
      }
      return null;
    } catch {
      return null;
    }
  });

  // 10. Consulta de cuota y disponibilidad de Grounding (Capa 5)
  ipcMain.removeHandler(IPC_CHANNELS.AI_GET_GROUNDING_QUOTA);
  ipcMain.handle(IPC_CHANNELS.AI_GET_GROUNDING_QUOTA, async () => {
    return geminiService.getGroundingQuotaStatus();
  });

  // Re-emisión de sesión de Champ Select cuando LCU emita eventos
  lcuClient.on('champ-select-session', (session: ChampSelectSession | null) => {
    difundir(IPC_CHANNELS.LCU_CHAMP_SELECT_SESSION, session);
  });

  // Re-emisión periódica o al cambiar de fase
  lcuClient.on('gameflow-cambiado', async (phase: GameflowPhase | string) => {
    if (phase === 'ChampSelect') {
      try {
        const session = await lcuClient.getChampSelectSession();
        difundir(IPC_CHANNELS.LCU_CHAMP_SELECT_SESSION, session);
      } catch {}
    } else {
      difundir(IPC_CHANNELS.LCU_CHAMP_SELECT_SESSION, null);
    }
  });
}
