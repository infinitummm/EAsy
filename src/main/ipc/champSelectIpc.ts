/**
 * Controladores IPC para Selección de Campeón, Runas e IA Gemini.
 * Propiedad exclusiva de ANTIGRAVITY.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/events';
import { ILcuClient } from '../../shared/contracts';
import { GeminiService } from '../ai/GeminiService';
import { RunePage, Role } from '../../shared/types';

export function setupChampSelectIpc(
  mainWindow: BrowserWindow,
  lcuClient: ILcuClient,
  geminiService: GeminiService
): void {
  // 1. Inyección de runas al cliente LoL vía LCU API
  ipcMain.handle(
    IPC_CHANNELS.LCU_APPLY_RUNES,
    async (_event, page: RunePage): Promise<{ success: boolean; pageId?: number; error?: string }> => {
      try {
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
  lcuClient.on('champ-select-session', (session) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.LCU_CHAMP_SELECT_SESSION, session);
    }
  });

  // Re-emisión periódica o al cambiar de fase
  lcuClient.on('fase-cambiada', async (phase) => {
    if (phase === 'ChampSelect') {
      try {
        const session = await lcuClient.getChampSelectSession();
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.LCU_CHAMP_SELECT_SESSION, session);
        }
      } catch {}
    } else {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.LCU_CHAMP_SELECT_SESSION, null);
      }
    }
  });
}
