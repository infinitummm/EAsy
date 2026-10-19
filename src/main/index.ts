import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { IPC_CHANNELS } from '../shared/events';
import { DEFAULT_APP_SETTINGS } from '../shared/constants';
import { LcuClient } from './lcu';
import { registrarLcuIpc } from './ipc/lcuIpc';
import { registrarSettingsIpc } from './ipc/settingsIpc';

let mainWindow: BrowserWindow | null = null;
const lcuClient = new LcuClient();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#091428',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    title: 'Itero Local - League of Legends Assistant'
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Registrar canales IPC
registrarLcuIpc(lcuClient, () => mainWindow?.webContents ?? null);
registrarSettingsIpc(() => mainWindow?.webContents ?? null);

app.whenReady().then(async () => {
  createWindow();

  // Inicializar escaneo LCU
  await lcuClient.initialize().catch((err) => {
    console.error('Error al inicializar LcuClient:', err);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  lcuClient.disconnect();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
