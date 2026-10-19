import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { LcuClient, ChampSelectManager, RuneManager } from './lcu';
import { registrarLcuIpc } from './ipc/lcuIpc';
import { registrarSettingsIpc } from './ipc/settingsIpc';
import { setupChampSelectIpc } from './ipc/champSelectIpc';
import { setupProfileIpc } from './ipc/profileIpc';
import { GeminiService } from './ai/GeminiService';
import { DatabaseService } from './db/DatabaseService';
import { MatchupCacheRepo } from './db/MatchupCacheRepo';
import { SecurityService } from './security/SecurityService';
import { RiotApiClient } from './riot/RiotApiClient';
import { MatchParser } from './riot/MatchParser';
import { ProfileSyncService } from './riot/ProfileSyncService';
import { DataDragonService } from './riot/DataDragonService';
import { DEFAULT_APP_SETTINGS } from '../shared/constants';

let mainWindow: BrowserWindow | null = null;
const lcuClient = new LcuClient();
const runeManager = new RuneManager(lcuClient);
const geminiService = new GeminiService();
const riotClient = new RiotApiClient();
const matchParser = new MatchParser();
let dbService: DatabaseService | null = null;
let securityService: SecurityService | null = null;
let dataDragonService: DataDragonService | null = null;
let champSelectManager: ChampSelectManager | null = null;
let profileSyncService: ProfileSyncService | null = null;
let matchupCacheRepo: MatchupCacheRepo | null = null;
let podaCacheInterval: NodeJS.Timeout | null = null;

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

  // Registrar IPC de la ventana activa con gestor de runas activo
  setupChampSelectIpc(mainWindow, lcuClient, geminiService, runeManager);

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

    // Instanciar repositorio de caché de matchups y podar entradas expiradas (REQ-008)
    matchupCacheRepo = new MatchupCacheRepo(dbService);
    try {
      const podados = matchupCacheRepo.podarExpirados();
      if (podados > 0) {
        console.log(`[Main] MatchupCache: ${podados} entradas expiradas eliminadas al inicio.`);
      }
    } catch (err) {
      console.warn('[Main] Error al podar cache expirado de matchups:', err);
    }
    // Programar poda diaria periódica
    podaCacheInterval = setInterval(() => {
      try {
        matchupCacheRepo?.podarExpirados();
      } catch {}
    }, 24 * 60 * 60 * 1000);

    // Instanciar sincronizador integral de perfil y partidas Match-V5 (T-6.1)
    profileSyncService = new ProfileSyncService(riotClient, dbService, matchParser);

    // Instanciar motor de automatización de Champ Select (T-4.1)
    champSelectManager = new ChampSelectManager(lcuClient, {
      obtenerPreferencias: () => dbService?.getSettings().autoChampSelect ?? DEFAULT_APP_SETTINGS.autoChampSelect
    });
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
  setupProfileIpc(dbService || undefined, riotClient, profileSyncService || undefined);

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
  if (podaCacheInterval) {
    clearInterval(podaCacheInterval);
    podaCacheInterval = null;
  }
  if (champSelectManager) {
    champSelectManager.detener();
    champSelectManager = null;
  }
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
