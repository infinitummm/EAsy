import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { LcuClient } from './lcu';
import { registrarLcuIpc } from './ipc/lcuIpc';
import { registrarSettingsIpc } from './ipc/settingsIpc';
import { setupChampSelectIpc } from './ipc/champSelectIpc';
import { setupProfileIpc } from './ipc/profileIpc';
import { GeminiService } from './ai/GeminiService';

let mainWindow: BrowserWindow | null = null;
const lcuClient = new LcuClient();
const geminiService = new GeminiService();

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

  // Registrar IPC específico de la ventana
  setupChampSelectIpc(mainWindow, lcuClient, geminiService);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Registrar canales IPC globales
registrarLcuIpc(lcuClient, () => mainWindow?.webContents ?? null);
registrarSettingsIpc(() => mainWindow?.webContents ?? null);
setupProfileIpc();

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
