import { ipcMain, WebContents, dialog, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/events';
import type { ILcuClient } from '../../shared/contracts';
import { EVENTOS_LCU_CLIENT, LcuClient } from '../lcu/LcuClient';
import type { RunePage, LcuStateInfo } from '../../shared/types';

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
  lcuClient.on(EVENTOS_LCU_CLIENT.ESTADO_CAMBIADO, (estado) => {
    difundirEvento(IPC_CHANNELS.LCU_STATE_CHANGED, estado);
  });

  lcuClient.on(EVENTOS_LCU_CLIENT.GAMEFLOW_CAMBIADO, (fase) => {
    difundirEvento(IPC_CHANNELS.LCU_GAMEFLOW_CHANGED, fase);
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

  // 2. Manejadores de invocaciones desde el Renderer
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

  ipcMain.handle(
    IPC_CHANNELS.LCU_SET_AUTO_ACCEPT,
    async (_event, params: { enabled: boolean; delaySeconds: number }) => {
      lcuClient.setAutoAccept(params.enabled, params.delaySeconds);
    }
  );

  ipcMain.handle(IPC_CHANNELS.LCU_APPLY_RUNES, async (_event, page: RunePage) => {
    return await lcuClient.injectRunePage(page);
  });
}

