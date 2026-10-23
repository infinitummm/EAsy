/**
 * Módulo de autoactualización de Itero Local respaldado por GitHub Releases.
 * Funciona de manera discreta y en segundo plano sin interrumpir partidas en juego.
 */

import { app, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { registrarLog } from './lcu/LcuDetector';

export function iniciarAutoUpdater(getWebContents: () => Electron.WebContents | null): void {
  // Evitar chequeos en modo desarrollo
  if (!app.isPackaged) {
    registrarLog('[AutoUpdater] Modo desarrollo detectado: autoUpdater desactivado.');
    return;
  }

  // Configurar comportamiento
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    registrarLog('[AutoUpdater] Buscando actualizaciones en GitHub Releases...');
  });

  autoUpdater.on('update-available', (info) => {
    registrarLog(`[AutoUpdater] Nueva versión disponible: ${info.version}`);
    const wc = getWebContents();
    if (wc && !wc.isDestroyed()) {
      wc.send('app:update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    registrarLog('[AutoUpdater] Itero Local está actualizado a la última versión.');
  });

  autoUpdater.on('error', (err) => {
    registrarLog(`[AutoUpdater] Error en actualización en segundo plano: ${err == null ? 'desconocido' : (err.stack || err).toString()}`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    registrarLog(`[AutoUpdater] Actualización v${info.version} descargada. Lista para instalar.`);
    const wc = getWebContents();
    if (wc && !wc.isDestroyed()) {
      wc.send('app:update-downloaded', {
        version: info.version,
      });
    }
  });

  // Handler para reiniciar e instalar
  ipcMain.removeHandler('app:install-update');
  ipcMain.handle('app:install-update', () => {
    autoUpdater.quitAndInstall();
  });

  // Handler para verificación manual de actualizaciones
  ipcMain.removeHandler('app:check-for-updates');
  ipcMain.handle('app:check-for-updates', async () => {
    if (!app.isPackaged) {
      return { success: false, isDev: true, message: 'Modo desarrollo (autoUpdater desactivado)' };
    }
    try {
      const res = await autoUpdater.checkForUpdates();
      return { success: true, version: res?.updateInfo?.version };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  // Handler para consultar versión real de la app
  ipcMain.removeHandler('app:get-version');
  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });

  // Ejecutar verificación con retardo para no competir con el arranque
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      registrarLog(`[AutoUpdater] No se pudo comprobar actualizaciones: ${err}`);
    });
  }, 10000);
}
