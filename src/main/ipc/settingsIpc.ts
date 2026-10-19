import { ipcMain, WebContents } from 'electron';
import { IPC_CHANNELS } from '../../shared/events';
import { DEFAULT_APP_SETTINGS, RIOT_RATE_LIMITS, GEMINI_RATE_LIMITS } from '../../shared/constants';
import type { AppSettings, PlatformRouting, RegionalRouting } from '../../shared/types';
import type { KeyHealthStatus } from '../../shared/contracts';

// Estado en memoria de ajustes y cuotas mientras no esté montada la BD completa
let appSettings: AppSettings = { ...DEFAULT_APP_SETTINGS };
let riotCallCountShort = 0;
let riotCallCountLong = 0;
let geminiCallCount = 0;

/**
 * Registra los canales IPC para la gestión de ajustes, claves de API y monitor de cuotas.
 */
export function registrarSettingsIpc(getWebContents: () => WebContents | null): void {
  // 1. Obtener Ajustes
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => {
    return appSettings;
  });

  // 2. Guardar Ajustes
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE, async (_event, newSettings: Partial<AppSettings>) => {
    appSettings = {
      ...appSettings,
      ...newSettings,
      autoAccept: {
        ...appSettings.autoAccept,
        ...(newSettings.autoAccept || {}),
      },
      autoChampSelect: {
        ...appSettings.autoChampSelect,
        ...(newSettings.autoChampSelect || {}),
      },
      apiKeys: {
        ...appSettings.apiKeys,
        ...(newSettings.apiKeys || {}),
      },
    };
    console.log('[SettingsIPC] Ajustes actualizados con éxito.');
    return { success: true };
  });

  // 3. Validar Clave de Riot API
  ipcMain.handle(IPC_CHANNELS.RIOT_VALIDATE_KEY, async (_event, apiKey: string): Promise<KeyHealthStatus> => {
    if (!apiKey || apiKey.trim().length === 0) {
      return {
        valid: false,
        statusCode: 400,
        isExpired: false,
        lastChecked: Date.now(),
      };
    }

    try {
      // Probar contra endpoint de estado de Riot o Account
      const testUrl = `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Riot/NA1`;
      const response = await fetch(testUrl, {
        headers: {
          'X-Riot-Token': apiKey.trim(),
        },
      });

      const statusCode = response.status;
      const isExpired = statusCode === 403;
      const valid = statusCode === 200 || statusCode === 404; // 404 significa que la key es válida pero la cuenta de prueba no existe

      const health: KeyHealthStatus = {
        valid,
        statusCode,
        isExpired,
        lastChecked: Date.now(),
      };

      const wc = getWebContents();
      if (wc && !wc.isDestroyed() && isExpired) {
        wc.send(IPC_CHANNELS.RIOT_KEY_WARNING, health);
      }

      return health;
    } catch (err) {
      return {
        valid: false,
        statusCode: 500,
        isExpired: false,
        lastChecked: Date.now(),
      };
    }
  });

  // 4. Sincronizar Cuenta de Invocador
  ipcMain.handle(
    IPC_CHANNELS.RIOT_SYNC_ACCOUNT,
    async (
      _event,
      params: { gameName: string; tagLine: string; platform: PlatformRouting; regional: RegionalRouting }
    ) => {
      console.log(`[SettingsIPC] Sincronizando cuenta ${params.gameName}#${params.tagLine}...`);
      return { success: true };
    }
  );

  // 5. Emitir periódicamente actualización de cuotas a la UI
  setInterval(() => {
    const wc = getWebContents();
    if (wc && !wc.isDestroyed()) {
      wc.send(IPC_CHANNELS.API_QUOTA_UPDATED, {
        riotCount: riotCallCountShort,
        geminiCount: geminiCallCount,
      });
    }
  }, 5000);
}
