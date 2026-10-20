import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LcuClient, ChampSelectManager, RuneManager, ItemSetManager, EVENTOS_LCU_CLIENT } from './lcu';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
import { DataDragonTranslator } from './riot/DataDragonTranslator';
import { PatchDiffService } from './riot/PatchDiffService';
import { DEFAULT_APP_SETTINGS } from '../shared/constants';
import { IPC_CHANNELS } from '../shared/events';

let mainWindow: BrowserWindow | null = null;
const lcuClient = new LcuClient({
  obtenerRutaManual: () => dbService?.getSettings().leagueInstallationPath,
});
const runeManager = new RuneManager(lcuClient);
const itemSetManager = new ItemSetManager(
  lcuClient,
  () => dbService?.getSettings().leagueInstallationPath || 'C:\\Riot Games\\League of Legends'
);
const geminiService = new GeminiService();
const riotClient = new RiotApiClient();
const matchParser = new MatchParser();
let dbService: DatabaseService | null = null;
let securityService: SecurityService | null = null;
let dataDragonService: DataDragonService | null = null;
let patchDiffService: PatchDiffService | null = null;
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Enviar estado LCU en cuanto el Renderer termina de cargar
  const enviarEstadoActual = () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      const estado = lcuClient.getConnectionState();
      const fase = lcuClient.getGameflowPhase();
      const errorPermisos = lcuClient.getIsPermissionError();
      mainWindow.webContents.send(IPC_CHANNELS.LCU_STATE_CHANGED, estado);
      mainWindow.webContents.send(IPC_CHANNELS.LCU_GAMEFLOW_CHANGED, fase);
      mainWindow.webContents.send(IPC_CHANNELS.LCU_PERMISSION_ERROR, errorPermisos);
    }
  };

  mainWindow.webContents.on('did-finish-load', enviarEstadoActual);
  mainWindow.webContents.on('dom-ready', enviarEstadoActual);

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

  // 3. Inicializar servicio de Data Dragon con caché en disco y traductor
  try {
    const ddragonCacheDir = path.join(userDataDir, 'ddragon-cache');
    dataDragonService = new DataDragonService({
      directorioCache: ddragonCacheDir,
      // Contingencia REQ-013: la LCU conoce lanzamientos recientes (Yunara ID 804).
      obtenerResumenCampeonesLcu: () => lcuClient.getChampionSummary(),
    });
    const dataDragonTranslator = new DataDragonTranslator(dataDragonService);
    geminiService.setTranslator(dataDragonTranslator);
    patchDiffService = new PatchDiffService(dataDragonService);
    geminiService.setPatchDiffService(patchDiffService);

    // Carga no bloqueante del catálogo de campeones y diccionarios
    void dataDragonService.sincronizarCatalogoCampeones().catch(() => {});
    dataDragonTranslator.initialize().catch((err) => {
      console.warn('[Main] Advertencia inicializando DataDragonTranslator:', err);
    });

    // Refresco en segundo plano del catálogo al conectar con la LCU (REQ-013).
    lcuClient.on(EVENTOS_LCU_CLIENT.ESTADO_CAMBIADO, (estado) => {
      if (estado === 'connected') {
        void dataDragonService?.sincronizarCatalogoCampeones().catch(() => {});
      }
    });
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

      // Restaurar Auto-Accept (REQ-010): el servicio arranca con la configuración guardada.
      lcuClient.setAutoAccept(
        savedSettings.autoAccept?.enabled ?? DEFAULT_APP_SETTINGS.autoAccept.enabled,
        savedSettings.autoAccept?.delaySeconds ?? DEFAULT_APP_SETTINGS.autoAccept.delaySeconds
      );
    } catch {}
  } else {
    // Sin base de datos, aplicar los valores por defecto para que el servicio no quede apagado.
    lcuClient.setAutoAccept(
      DEFAULT_APP_SETTINGS.autoAccept.enabled,
      DEFAULT_APP_SETTINGS.autoAccept.delaySeconds
    );
  }

  // 5. Registrar canales IPC con todas sus dependencias
  registrarLcuIpc(lcuClient, () => mainWindow?.webContents ?? null);
  setupChampSelectIpc(null, lcuClient, geminiService, runeManager, itemSetManager, dataDragonService || undefined, patchDiffService || undefined);
  registrarSettingsIpc(
    () => mainWindow?.webContents ?? null,
    dbService || undefined,
    securityService || undefined,
    riotClient,
    geminiService,
    lcuClient
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
