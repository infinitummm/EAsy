import { ipcMain, WebContents } from 'electron';
import { IPC_CHANNELS } from '../../shared/events';
import type { ILcuClient } from '../../shared/contracts';
import { EVENTOS_LCU_CLIENT } from '../lcu/LcuClient';
import type { RunePage } from '../../shared/types';

/**
 * Conecta los eventos del cliente LCU con el sistema IPC de Electron.
 */
export function registrarLcuIpc(lcuClient: ILcuClient, getWebContents: () => WebContents | null): void {
  // 1. Escuchar eventos del LcuClient y retransmitirlos al Renderer
  lcuClient.on(EVENTOS_LCU_CLIENT.ESTADO_CAMBIADO, (estado) => {
    const wc = getWebContents();
    if (wc && !wc.isDestroyed()) {
      wc.send(IPC_CHANNELS.LCU_STATE_CHANGED, estado);
    }
  });

  lcuClient.on(EVENTOS_LCU_CLIENT.GAMEFLOW_CAMBIADO, (fase) => {
    const wc = getWebContents();
    if (wc && !wc.isDestroyed()) {
      wc.send(IPC_CHANNELS.LCU_GAMEFLOW_CHANGED, fase);
    }
  });

  lcuClient.on(EVENTOS_LCU_CLIENT.READY_CHECK, (readyCheck) => {
    const wc = getWebContents();
    if (wc && !wc.isDestroyed()) {
      wc.send(IPC_CHANNELS.LCU_READY_CHECK, readyCheck);
    }
  });

  lcuClient.on(EVENTOS_LCU_CLIENT.CHAMP_SELECT_SESSION, (session) => {
    const wc = getWebContents();
    if (wc && !wc.isDestroyed()) {
      wc.send(IPC_CHANNELS.LCU_CHAMP_SELECT_SESSION, session);
    }
  });

  // 2. Manejadores de invocaciones desde el Renderer
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
