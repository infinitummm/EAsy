import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { IPC_CHANNELS } from '../shared/events';
import { DEFAULT_APP_SETTINGS } from '../shared/constants';
import { LcuClient } from './lcu';
import { registrarLcuIpc } from './ipc/lcuIpc';

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

// Handlers base de IPC
ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => {
  return DEFAULT_APP_SETTINGS;
});

ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE, async (_event, newSettings) => {
  console.log('Ajustes guardados:', newSettings);
  return { success: true };
});

// Registrar IPC de LCU
registrarLcuIpc(lcuClient, () => mainWindow?.webContents ?? null);

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
