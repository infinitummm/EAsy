/**
 * Controladores IPC para Selección de Campeón, Runas e IA Gemini.
 * Propiedad exclusiva de ANTIGRAVITY.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/events';
import { ILcuClient } from '../../shared/contracts';
import { GeminiService } from '../ai/GeminiService';
import { RuneManager } from '../lcu/RuneManager';
import { RunePage, Role, ChampSelectSession, GameflowPhase } from '../../shared/types';

export function setupChampSelectIpc(
  _mainWindow: BrowserWindow | null,
  lcuClient: ILcuClient,
  geminiService: GeminiService,
  runeManager?: RuneManager
): void {
  const difundir = (canal: string, ...args: unknown[]) => {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(canal, ...args);
      }
    }
  };

  // 1. Inyección de runas al cliente LoL vía LCU API (con soporte de sobrescritura activa)
  ipcMain.removeHandler(IPC_CHANNELS.LCU_APPLY_RUNES);
  ipcMain.handle(
    IPC_CHANNELS.LCU_APPLY_RUNES,
    async (_event, page: RunePage): Promise<{ success: boolean; pageId?: number; error?: string }> => {
      try {
        if (runeManager) {
          const res = await runeManager.aplicarPagina(page);
          return {
            success: res.success,
            pageId: res.pageId,
            error: res.error
          };
        }
        return await lcuClient.injectRunePage(page);
      } catch (err: unknown) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err)
        };
      }
    }
  );

  // 2. Consulta de recomendación táctica y de matchup con Gemini AI
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
      }
    ) => {
      return await geminiService.getMatchupAdvice(params);
    }
  );

  // 3. Re-emisión de sesión de Champ Select cuando LCU emita eventos
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
