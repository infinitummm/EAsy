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
  ipcMain.handle('app:install-update', () => {
    autoUpdater.quitAndInstall();
  });

  // Ejecutar verificación con retardo para no competir con el arranque
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      registrarLog(`[AutoUpdater] No se pudo comprobar actualizaciones: ${err}`);
    });
  }, 10000);
}
