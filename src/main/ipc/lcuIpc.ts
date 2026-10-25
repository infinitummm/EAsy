import { ipcMain, WebContents, dialog, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/events';
import type { ILcuClient } from '../../shared/contracts';
import { EVENTOS_LCU_CLIENT, LcuClient } from '../lcu/LcuClient';
import type { RunePage, LcuStateInfo, TipoModo } from '../../shared/types';
import { detectarModoEnLcu } from '../lcu/LiveClientDataClient';

/**
 * Conecta los eventos del cliente LCU con el sistema IPC de Electron.
 */
export function registrarLcuIpc(lcuClient: ILcuClient, _getWebContents?: () => WebContents | null): void {
  const clienteConcreto = lcuClient instanceof LcuClient ? lcuClient : null;

  const difundirEvento = (canal: string, ...args: unknown[]) => {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(canal, ...args);
      }
    }
  };

  // 1. Escuchar eventos del LcuClient y retransmitirlos a todas las ventanas
  lcuClient.on(EVENTOS_LCU_CLIENT.ESTADO_CAMBIADO, async (estado) => {
    difundirEvento(IPC_CHANNELS.LCU_STATE_CHANGED, estado);
    if (estado === 'connected') {
      try {
        const modo = await detectarModoEnLcu(lcuClient);
        difundirEvento(IPC_CHANNELS.LCU_GAME_MODE_CHANGED, modo);
      } catch {}
    } else {
      difundirEvento(IPC_CHANNELS.LCU_GAME_MODE_CHANGED, null);
    }
  });

  lcuClient.on(EVENTOS_LCU_CLIENT.GAMEFLOW_CAMBIADO, async (fase) => {
    difundirEvento(IPC_CHANNELS.LCU_GAMEFLOW_CHANGED, fase);
    try {
      const modo = await detectarModoEnLcu(lcuClient);
      difundirEvento(IPC_CHANNELS.LCU_GAME_MODE_CHANGED, modo);
    } catch {}
  });

  lcuClient.on(EVENTOS_LCU_CLIENT.READY_CHECK, (readyCheck) => {
    difundirEvento(IPC_CHANNELS.LCU_READY_CHECK, readyCheck);
  });

  lcuClient.on(EVENTOS_LCU_CLIENT.CHAMP_SELECT_SESSION, (session) => {
    difundirEvento(IPC_CHANNELS.LCU_CHAMP_SELECT_SESSION, session);
  });

  lcuClient.on(EVENTOS_LCU_CLIENT.ERROR_PERMISOS, (errorPermisos: boolean) => {
    difundirEvento(IPC_CHANNELS.LCU_PERMISSION_ERROR, errorPermisos);
  });

  lcuClient.on(EVENTOS_LCU_CLIENT.AUTO_ACCEPT_STATUS, (status) => {
    difundirEvento(IPC_CHANNELS.LCU_AUTO_ACCEPT_EVENT, status);
  });

  // 2. Manejadores de invocaciones desde el Renderer
  ipcMain.removeHandler(IPC_CHANNELS.LCU_GET_STATE);
  ipcMain.handle(IPC_CHANNELS.LCU_GET_STATE, async (): Promise<LcuStateInfo> => {
    return {
      state: lcuClient.getConnectionState(),
      gameflow: lcuClient.getGameflowPhase(),
      isPermissionError: clienteConcreto?.getIsPermissionError() ?? false,
      port: clienteConcreto?.getPort() ?? undefined,
      lastError: clienteConcreto?.getLastError() ?? undefined,
      lastUpdated: new Date().toISOString(),
    };
  });

  ipcMain.removeHandler(IPC_CHANNELS.LCU_TEST_DETECTION);
  ipcMain.handle(IPC_CHANNELS.LCU_TEST_DETECTION, async (_event, manualPath?: string) => {
    if (clienteConcreto) {
      return await clienteConcreto.testDetection(manualPath);
    }
    return {
      success: false,
      credentials: null,
      steps: [],
      isPermissionError: false,
      logFilePath: '',
    };
  });

  ipcMain.removeHandler(IPC_CHANNELS.LCU_SELECT_FOLDER);
  ipcMain.handle(IPC_CHANNELS.LCU_SELECT_FOLDER, async () => {
    const res = await dialog.showOpenDialog({
      title: 'Seleccionar carpeta de instalación de League of Legends',
      properties: ['openDirectory'],
    });
    if (res.canceled || res.filePaths.length === 0) {
      return null;
    }
    return res.filePaths[0];
  });

  ipcMain.removeHandler(IPC_CHANNELS.LCU_SET_AUTO_ACCEPT);
  ipcMain.handle(
    IPC_CHANNELS.LCU_SET_AUTO_ACCEPT,
    async (_event, params: { enabled: boolean; delaySeconds: number }) => {
      lcuClient.setAutoAccept(params.enabled, params.delaySeconds);
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.LCU_GET_GAME_MODE);
  ipcMain.handle(IPC_CHANNELS.LCU_GET_GAME_MODE, async (): Promise<TipoModo | null> => {
    try {
      return await detectarModoEnLcu(lcuClient);
    } catch {
      return null;
    }
  });
}

