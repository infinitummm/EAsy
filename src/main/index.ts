import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { LcuClient } from './lcu';
import { registrarLcuIpc } from './ipc/lcuIpc';
import { registrarSettingsIpc } from './ipc/settingsIpc';
import { setupChampSelectIpc } from './ipc/champSelectIpc';
import { setupProfileIpc } from './ipc/profileIpc';
import { GeminiService } from './ai/GeminiService';
import { DatabaseService } from './db/DatabaseService';
import { SecurityService } from './security/SecurityService';
import { RiotApiClient } from './riot/RiotApiClient';
import { DataDragonService } from './riot/DataDragonService';

let mainWindow: BrowserWindow | null = null;
const lcuClient = new LcuClient();
const geminiService = new GeminiService();
const riotClient = new RiotApiClient();
let dbService: DatabaseService | null = null;
let securityService: SecurityService | null = null;
let dataDragonService: DataDragonService | null = null;

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

  // Registrar IPC de la ventana activa
  setupChampSelectIpc(mainWindow, lcuClient, geminiService);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Inicialización de servicios y ciclo de vida de la aplicación
app.whenReady().then(async () => {
  const userDataDir = app.getPath('userData');

  // 1. Inicializar seguridad y clave simétrica local (AES-256-GCM)
  try {
    const keyPath = path.join(userDataDir, 'itero.key');
    securityService = await SecurityService.desdeArchivoClave(keyPath);
  } catch (err) {
    console.warn('[Main] Advertencia inicializando SecurityService:', err);
  }

  // 2. Inicializar base de datos local SQLite (node:sqlite)
  try {
    const dbPath = path.join(userDataDir, 'itero.sqlite');
    dbService = new DatabaseService({ rutaBd: dbPath });
    await dbService.initialize();
    geminiService.setDatabaseService(dbService);
  } catch (err) {
    console.warn('[Main] Advertencia inicializando DatabaseService:', err);
  }

  // 3. Inicializar servicio de Data Dragon con caché en disco
  try {
    const ddragonCacheDir = path.join(userDataDir, 'ddragon-cache');
    dataDragonService = new DataDragonService({ directorioCache: ddragonCacheDir });
    // Carga no bloqueante de versión inicial
    dataDragonService.obtenerVersionActual().catch(() => {});
  } catch (err) {
    console.warn('[Main] Advertencia inicializando DataDragonService:', err);
  }

  // 4. Restaurar claves guardadas hacia los clientes
  if (dbService) {
    try {
      const savedSettings = dbService.getSettings();
      if (savedSettings.apiKeys.riotApiKeyEncrypted) {
        const key = securityService && savedSettings.apiKeys.riotApiKeyEncrypted.includes(':')
          ? securityService.decrypt(savedSettings.apiKeys.riotApiKeyEncrypted)
          : savedSettings.apiKeys.riotApiKeyEncrypted;
        riotClient.setApiKey(key);
      }
      if (savedSettings.apiKeys.geminiApiKeyEncrypted) {
        const key = securityService && savedSettings.apiKeys.geminiApiKeyEncrypted.includes(':')
          ? securityService.decrypt(savedSettings.apiKeys.geminiApiKeyEncrypted)
          : savedSettings.apiKeys.geminiApiKeyEncrypted;
        geminiService.setApiKey(key);
      }
    } catch {}
  }

  // 5. Registrar canales IPC con todas sus dependencias
  registrarLcuIpc(lcuClient, () => mainWindow?.webContents ?? null);
  registrarSettingsIpc(
    () => mainWindow?.webContents ?? null,
    dbService || undefined,
    securityService || undefined,
    riotClient,
    geminiService
  );
  setupProfileIpc(dbService || undefined, riotClient);

  createWindow();

  // 6. Iniciar escaneo y conexión automática de LCU
  await lcuClient.initialize().catch((err) => {
    console.error('[Main] Error al inicializar LcuClient:', err);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  lcuClient.disconnect();
  if (dbService) {
    try {
      dbService.close();
    } catch {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
