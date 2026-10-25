import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LcuClient, ChampSelectManager, RuneManager, ItemSetManager, EVENTOS_LCU_CLIENT } from './lcu';
import { LcuAccountService } from './lcu/LcuAccountService';
import { OpGgClient } from './opgg/OpGgClient';

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
import { DEFAULT_APP_SETTINGS, APP_NAME } from '../shared/constants';
import { IPC_CHANNELS } from '../shared/events';
import { iniciarAutoUpdater } from './updater';
import { OverlayManager } from './overlay/OverlayManager';
import { registrarOverlayIpc } from './ipc/overlayIpc';
import { BorderlessDetector } from './modes/BorderlessDetector';
import { ModeAugmentService } from './modes/ModeAugmentService';
import { LiveClientDataClient, detectarModoEnLcu, resolverCampeonLocalLcu } from './lcu/LiveClientDataClient';
import type { IModeService } from '../shared/contracts';
import type { TipoModo, GameflowPhase } from '../shared/types';
import { ALL_CHAMPIONS, getChampionById } from '../shared/champions';


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
let opggClient: OpGgClient | null = null;
let podaCacheInterval: NodeJS.Timeout | null = null;
let overlayManager: OverlayManager | null = null;
let borderlessDetector: BorderlessDetector | null = null;
let modeAugmentService: ModeAugmentService | null = null;
let liveClientDataClient: LiveClientDataClient | null = null;
let inGamePollingInterval: NodeJS.Timeout | null = null;

function resolverCampeonPorNombre(nombreCrudo?: string): { id: number; name: string } | null {
  if (!nombreCrudo) return null;
  const limpio = nombreCrudo.replace(/^game_character_displayname_/i, '').trim().toLowerCase();
  const sinEspacios = limpio.replace(/[^a-z0-9]/g, '');
  const champ = ALL_CHAMPIONS.find((c) => {
    const cName = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cKey = c.key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cImg = c.image.toLowerCase().replace(/\.png$/, '').replace(/[^a-z0-9]/g, '');
    return cName === sinEspacios || cKey === sinEspacios || cImg === sinEspacios;
  });
  if (champ) {
    return { id: champ.id, name: champ.name };
  }
  return null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#030814',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    title: APP_NAME
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
  const enviarEstadoActual = async () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      const estado = lcuClient.getConnectionState();
      const fase = lcuClient.getGameflowPhase();
      const errorPermisos = lcuClient.getIsPermissionError();
      mainWindow.webContents.send(IPC_CHANNELS.LCU_STATE_CHANGED, estado);
      mainWindow.webContents.send(IPC_CHANNELS.LCU_GAMEFLOW_CHANGED, fase);
      mainWindow.webContents.send(IPC_CHANNELS.LCU_PERMISSION_ERROR, errorPermisos);
      try {
        const modo = await detectarModoEnLcu(lcuClient);
        mainWindow.webContents.send(IPC_CHANNELS.LCU_GAME_MODE_CHANGED, modo);
      } catch {}
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
  // Fijar explícitamente userData a 'proyecto-itero' para garantizar compatibilidad y no perder datos
  try {
    const fixedUserData = path.join(app.getPath('appData'), 'proyecto-itero');
    app.setPath('userData', fixedUserData);
  } catch (err) {
    console.warn('[Main] Advertencia fijando ruta de userData:', err);
  }
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

    opggClient = new OpGgClient({
      dbService: dbService || undefined,
      translator: dataDragonTranslator,
    });

    // Precalentamiento en segundo plano de builds generales para campeones preferidos (B5)
    const currentDb = dbService;
    if (opggClient && currentDb) {
      setTimeout(() => {
        try {
          const settings = currentDb.getSettings();
          if (settings?.autoChampSelect?.rolePreferences) {
            void opggClient?.warmupPreferredChampions(
              settings.autoChampSelect.rolePreferences,
              settings.opggTier || 'emerald_plus',
              '26.20'
            ).catch((e) => {
              console.warn('[Main] Error en warmup de campeones:', e);
            });
          }
        } catch {}
      }, 2000);
    }

    // Carga no bloqueante del catálogo de campeones y diccionarios
    void dataDragonService.sincronizarCatalogoCampeones().catch(() => {});
    dataDragonTranslator.initialize().catch((err) => {
      console.warn('[Main] Advertencia inicializando DataDragonTranslator:', err);
    });

    // Refresco en segundo plano del catálogo al conectar con la LCU (REQ-013).
    lcuClient.on(EVENTOS_LCU_CLIENT.ESTADO_CAMBIADO, (estado) => {
      if (estado === 'connected') {
        void dataDragonService?.sincronizarCatalogoCampeones().catch(() => {});
        if (dbService) {
          void LcuAccountService.sincronizarCuentaLocal(lcuClient, dbService).catch(() => {});
        }
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
  setupChampSelectIpc(null, lcuClient, geminiService, runeManager, itemSetManager, dataDragonService || undefined, patchDiffService || undefined, opggClient || undefined);
  registrarSettingsIpc(
    () => mainWindow?.webContents ?? null,
    dbService || undefined,
    securityService || undefined,
    riotClient,
    geminiService,
    lcuClient
  );
  setupProfileIpc(dbService || undefined, riotClient, profileSyncService || undefined, lcuClient);

  // 5.1. Inicializar Overlay In-Game para ARAM Caos y Arena (v1.1.0)
  try {
    const preloadPath = path.join(__dirname, '../preload/index.js');
    overlayManager = new OverlayManager(preloadPath);
    overlayManager.initialize();

    borderlessDetector = new BorderlessDetector({
      rutaInstalacionPorDefecto: dbService?.getSettings().leagueInstallationPath,
    });
    modeAugmentService = dbService ? new ModeAugmentService(dbService) : null;
    liveClientDataClient = new LiveClientDataClient();

    const modeService: IModeService = {
      async getChampionAugments(championId: number, mode: TipoModo, patch?: string) {
        if (!modeAugmentService) {
          throw new Error('Servicio de mejoras de modo no disponible (base de datos inactiva)');
        }
        return modeAugmentService.getChampionAugments(championId, mode, patch);
      },
      async checkBorderless(installationPath?: string) {
        const ruta = installationPath || dbService?.getSettings().leagueInstallationPath;
        return borderlessDetector!.checkBorderless(ruta);
      },
      async applyBorderless(installationPath?: string) {
        const ruta = installationPath || dbService?.getSettings().leagueInstallationPath;
        return borderlessDetector!.applyBorderless(ruta);
      },
    };

    registrarOverlayIpc(overlayManager, modeService);

    // Verificar estado sin bordes al arrancar
    borderlessDetector.checkBorderless().then((res) => {
      overlayManager?.setBorderless(res.isBorderless);
    }).catch(() => {});
  } catch (err) {
    console.error('[Main] Advertencia inicializando Overlay:', err);
  }

  // Manejador para actualizar el campeón en selección
  const actualizarCampeonSeleccionado = (sesion: any, modo: TipoModo) => {
    try {
      const localCell = sesion?.localPlayerCellId;
      const local = (sesion?.myTeam ?? []).find((p: any) => p.cellId === localCell);
      const champId = local?.championId || local?.championPickIntent || 0;
      if (champId > 0) {
        const champ = getChampionById(champId);
        overlayManager?.setCampeonYModo(champId, champ?.name || `Campeón ${champId}`, modo);
      } else {
        overlayManager?.setCampeonYModo(0, '', modo);
      }
    } catch {}
  };

  let ultimoNivelJugador: number = 0;
  let estabaMuerto: boolean = false;
  const aumentosDisparadosPorRonda = new Set<number>();

  // Función centralizada para evaluar el modo y el estado del juego y sincronizar el overlay
  const evaluarEstadoPartidaYOverlay = async (faseParam?: GameflowPhase) => {
    const fase = faseParam ?? lcuClient.getGameflowPhase();
    let modo: TipoModo | null = null;
    try {
      modo = await detectarModoEnLcu(lcuClient);
    } catch {}

    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.LCU_GAME_MODE_CHANGED, modo);
    }

    borderlessDetector?.checkBorderless().then((res) => {
      overlayManager?.setBorderless(res.isBorderless);
    }).catch(() => {});

    // Resolver campeón local usando la LCU (funciona en ChampSelect, InProgress y PreEndOfGame)
    const campeonLocal = await resolverCampeonLocalLcu(lcuClient).catch(() => null);
    if (campeonLocal && campeonLocal.championId > 0) {
      const modoActivo = modo || overlayManager?.getState().gameMode || 'aram_mayhem';
      overlayManager?.setCampeonYModo(
        campeonLocal.championId,
        campeonLocal.championName,
        modoActivo
      );
      if (modeAugmentService && (modoActivo === 'aram_mayhem' || modoActivo === 'arena')) {
        modeAugmentService.getChampionAugments(campeonLocal.championId, modoActivo).then((d) => overlayManager?.setDatosModo(d)).catch(() => {});
      }
    }

    if (fase === 'ChampSelect') {
      if (modo === 'aram_mayhem' || modo === 'arena' || modo === 'aram') {
        try {
          const csSession = await lcuClient.request<any>('GET', '/lol-champ-select/v1/session');
          actualizarCampeonSeleccionado(csSession, modo);
        } catch {}
        overlayManager?.show();
      }
    } else if (fase === 'InProgress') {
      if (modo === 'aram_mayhem' || modo === 'arena' || modo === 'aram') {
        // En partida activa de Arena o ARAM Caos, activar automáticamente el selector temporal de aumentos
        overlayManager?.triggerAugmentSelection(30);

        if (!inGamePollingInterval) {
          inGamePollingInterval = setInterval(async () => {
            try {
              const instantanea = await liveClientDataClient?.obtenerInstantanea(lcuClient);
              if (instantanea?.activo) {
                // 1. Refrescar campeón si LiveClientData tiene el nombre
                if (instantanea.jugador?.championName) {
                  const champ = resolverCampeonPorNombre(instantanea.jugador.championName);
                  if (champ) {
                    const m = instantanea.modo ?? modo ?? 'aram_mayhem';
                    overlayManager?.setCampeonYModo(champ.id, champ.name, m);
                  }
                }

                const m = instantanea.modo ?? modo;
                const sec = Math.floor(instantanea.gameTime ?? 0);
                const nivel = instantanea.level ?? 0;
                const estaMuerto = Boolean(instantanea.isDead);

                // 2. Disparador para ARAM Caos (Nivel 3, 7, 11, 15 o muerte con nivel >= 3)
                if (m === 'aram_mayhem') {
                  const hitMilestone = [3, 7, 11, 15].includes(nivel) && nivel !== ultimoNivelJugador;
                  const murioConAumento = estaMuerto && !estabaMuerto && nivel >= 3;
                  if (hitMilestone || murioConAumento) {
                    overlayManager?.triggerAugmentSelection(25);
                  }
                  if (!estaMuerto && estabaMuerto) {
                    overlayManager?.hide();
                  }
                  if (nivel > 0) ultimoNivelJugador = nivel;
                  estabaMuerto = estaMuerto;
                }

                // 3. Disparador para Arena (Ronda 1: 0-45s, Ronda 4: 210-245s, Ronda 7: 450-485s, Ronda 11: 690-725s)
                if (m === 'arena' && sec > 0) {
                  const ventanasRondas = [
                    { min: 0, max: 45, id: 1 },
                    { min: 210, max: 245, id: 4 },
                    { min: 450, max: 485, id: 7 },
                    { min: 690, max: 725, id: 11 },
                  ];
                  for (const ventana of ventanasRondas) {
                    if (sec >= ventana.min && sec <= ventana.max && !aumentosDisparadosPorRonda.has(ventana.id)) {
                      aumentosDisparadosPorRonda.add(ventana.id);
                      overlayManager?.triggerAugmentSelection(30);
                    }
                  }
                }
              }
            } catch {}
          }, 2000);
        }
      }
    } else if (fase === 'None' || fase === 'Lobby' || fase === 'PreEndOfGame' || fase === 'WaitingForStats') {
      if (inGamePollingInterval) {
        clearInterval(inGamePollingInterval);
        inGamePollingInterval = null;
      }
      aumentosDisparadosPorRonda.clear();
      ultimoNivelJugador = 0;
      estabaMuerto = false;
      overlayManager?.hide();
    }
  };

  // Reaccionar a cambios de sesión de selección de campeón
  lcuClient.on(EVENTOS_LCU_CLIENT.CHAMP_SELECT_SESSION, async (sesion) => {
    const estado = overlayManager?.getState();
    if (estado?.visible && estado?.gameMode && (estado.gameMode === 'aram_mayhem' || estado.gameMode === 'arena' || estado.gameMode === 'aram')) {
      actualizarCampeonSeleccionado(sesion, estado.gameMode);
    }
  });

  // Reaccionar a cambios de Gameflow
  lcuClient.on(EVENTOS_LCU_CLIENT.GAMEFLOW_CAMBIADO, async (fase) => {
    await evaluarEstadoPartidaYOverlay(fase);
  });

  // Reaccionar a conexión LCU para evaluar inmediatamente el estado
  lcuClient.on(EVENTOS_LCU_CLIENT.ESTADO_CAMBIADO, async (estado) => {
    if (estado === 'connected') {
      await evaluarEstadoPartidaYOverlay();
    }
  });


  createWindow();
  iniciarAutoUpdater(() => mainWindow?.webContents ?? null);

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
  if (inGamePollingInterval) {
    clearInterval(inGamePollingInterval);
    inGamePollingInterval = null;
  }
  if (podaCacheInterval) {
    clearInterval(podaCacheInterval);
    podaCacheInterval = null;
  }
  if (champSelectManager) {
    champSelectManager.detener();
    champSelectManager = null;
  }
  overlayManager?.destroy();
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
