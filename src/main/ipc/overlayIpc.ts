/**
 * src/main/ipc/overlayIpc.ts
 * Manejadores de canales IPC para el Overlay In-Game y los modos especiales (ARAM Caos y Arena).
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/events';
import type { IModeService } from '../../shared/contracts';
import type { OverlayManager } from '../overlay/OverlayManager';
import type { TipoModo } from '../../shared/types';
import { registrarLog } from '../lcu/LcuDetector';

export function registrarOverlayIpc(
  overlayManager: OverlayManager,
  modeService?: IModeService
): void {
  // 1. Mostrar Overlay
  ipcMain.handle(IPC_CHANNELS.OVERLAY_SHOW, async () => {
    overlayManager.show();
    return { success: true };
  });

  // 2. Ocultar Overlay
  ipcMain.handle(IPC_CHANNELS.OVERLAY_HIDE, async () => {
    overlayManager.hide();
    return { success: true };
  });

  // 3. Alternar visibilidad
  ipcMain.handle(IPC_CHANNELS.OVERLAY_TOGGLE, async () => {
    const visible = overlayManager.toggle();
    return { visible };
  });

  // 4. Obtener estado actual
  ipcMain.handle(IPC_CHANNELS.OVERLAY_GET_STATE, async () => {
    return overlayManager.getState();
  });

  // 5. Consultar augments de un campeón
  ipcMain.handle(
    IPC_CHANNELS.MODES_GET_CHAMPION_AUGMENTS,
    async (_event, params: { championId: number; mode: TipoModo; patch?: string }) => {
      const { championId, mode, patch } = params;
      registrarLog(`[OverlayIPC] Consultando augments para campeón ${championId} en modo ${mode}...`);
      if (modeService) {
        try {
          return await modeService.getChampionAugments(championId, mode, patch);
        } catch (e: any) {
          registrarLog(`[OverlayIPC] Error en modeService.getChampionAugments: ${e.message}`);
        }
      }

      // Si aún no está listo el servicio de modo, devolver estructura vacía consistente
      return {
        championId,
        championName: `Campeón ${championId}`,
        mode,
        patch: patch || '16.21',
        augments: [],
        suggestedAugments: {
          silver: [],
          gold: [],
          prismatic: [],
        },
        lastUpdated: Date.now(),
      };
    }
  );

  // 6. Verificar modo sin bordes (Borderless) en game.cfg
  ipcMain.handle(
    IPC_CHANNELS.MODES_CHECK_BORDERLESS,
    async (_event, installationPath?: string) => {
      if (modeService) {
        return await modeService.checkBorderless(installationPath);
      }
      return {
        isBorderless: true,
        windowMode: 1,
        configPath: '',
      };
    }
  );

  // 7. Aplicar modo sin bordes (WindowMode=1) en game.cfg
  ipcMain.handle(
    IPC_CHANNELS.MODES_APPLY_BORDERLESS,
    async (_event, installationPath?: string) => {
      if (modeService?.applyBorderless) {
        const res = await modeService.applyBorderless(installationPath);
        overlayManager.setBorderless(true);
        return res;
      }
      return {
        success: false,
        configPath: '',
        previousMode: -1,
      };
    }
  );

  // 8. Configuración de clics pasantes (Ignore Mouse Events)
  ipcMain.on('overlay:set-ignore-mouse-events', (_event, ignore: boolean, forward = true) => {
    overlayManager.setIgnoreMouseEvents(ignore, forward);
  });
}
