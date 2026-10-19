import { ipcMain, WebContents } from 'electron';
import { IPC_CHANNELS } from '../../shared/events';
import { DEFAULT_APP_SETTINGS } from '../../shared/constants';
import type { AppSettings } from '../../shared/types';
import type { KeyHealthStatus, IDatabaseService, ISecurityService, IRiotApiClient } from '../../shared/contracts';
import { GeminiService } from '../ai/GeminiService';

let memoriaSettings: AppSettings = { ...DEFAULT_APP_SETTINGS };

/**
 * Registra los canales IPC para la gestión de ajustes, claves de API y monitor de cuotas.
 */
export function registrarSettingsIpc(
  getWebContents: () => WebContents | null,
  dbService?: IDatabaseService,
  securityService?: ISecurityService,
  riotClient?: IRiotApiClient,
  geminiService?: GeminiService
): void {
  // 1. Obtener Ajustes
  ipcMain.removeHandler(IPC_CHANNELS.SETTINGS_GET);
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (): Promise<AppSettings> => {
    if (dbService) {
      try {
        const s = dbService.getSettings();
        memoriaSettings = s;
        return s;
      } catch (err) {
        console.warn('[SettingsIPC] Fallo al leer de SQLite, usando memoria:', err);
      }
    }
    return memoriaSettings;
  });

  // 2. Guardar Ajustes
  ipcMain.removeHandler(IPC_CHANNELS.SETTINGS_SAVE);
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE, async (_event, newSettings: Partial<AppSettings>) => {
    try {
      memoriaSettings = {
        ...memoriaSettings,
        ...newSettings,
        autoAccept: {
          ...memoriaSettings.autoAccept,
          ...(newSettings.autoAccept || {}),
        },
        autoChampSelect: {
          ...memoriaSettings.autoChampSelect,
          ...(newSettings.autoChampSelect || {}),
        },
        apiKeys: {
          ...memoriaSettings.apiKeys,
          ...(newSettings.apiKeys || {}),
        },
      };

      // Si hay servicio de seguridad y claves en claro, cifrarlas
      if (securityService && newSettings.apiKeys) {
        if (newSettings.apiKeys.riotApiKeyEncrypted && !newSettings.apiKeys.riotApiKeyEncrypted.includes(':')) {
          memoriaSettings.apiKeys.riotApiKeyEncrypted = securityService.encrypt(newSettings.apiKeys.riotApiKeyEncrypted);
        }
        if (newSettings.apiKeys.geminiApiKeyEncrypted && !newSettings.apiKeys.geminiApiKeyEncrypted.includes(':')) {
          memoriaSettings.apiKeys.geminiApiKeyEncrypted = securityService.encrypt(newSettings.apiKeys.geminiApiKeyEncrypted);
        }
      }

      // Si hay cliente Riot, actualizar clave
      if (riotClient && newSettings.apiKeys?.riotApiKeyEncrypted) {
        const clave = securityService && newSettings.apiKeys.riotApiKeyEncrypted.includes(':')
          ? securityService.decrypt(newSettings.apiKeys.riotApiKeyEncrypted)
          : newSettings.apiKeys.riotApiKeyEncrypted;
        riotClient.setApiKey(clave);
      }

      // Si hay GeminiService, actualizar clave
      if (geminiService && newSettings.apiKeys?.geminiApiKeyEncrypted) {
        const clave = securityService && newSettings.apiKeys.geminiApiKeyEncrypted.includes(':')
          ? securityService.decrypt(newSettings.apiKeys.geminiApiKeyEncrypted)
          : newSettings.apiKeys.geminiApiKeyEncrypted;
        geminiService.setApiKey(clave);
      }

      if (dbService) {
        dbService.saveSettings(memoriaSettings);
      }

      return { success: true };
    } catch (err: unknown) {
      console.error('[SettingsIPC] Error al guardar ajustes:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // 3. Validar Clave de Riot API
  ipcMain.removeHandler(IPC_CHANNELS.RIOT_VALIDATE_KEY);
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
      if (riotClient) {
        riotClient.setApiKey(apiKey.trim());
        const health = await riotClient.checkKeyHealth();
        return health;
      }

      // Fallback si riotClient no estuviera inicializado
      const testUrl = `https://la1.api.riotgames.com/lol/status/v4/platform-data`;
      const response = await fetch(testUrl, {
        headers: {
          'X-Riot-Token': apiKey.trim(),
        },
      });

      const isExpired = response.status === 401 || response.status === 403;
      return {
        valid: response.ok,
        statusCode: response.status,
        isExpired,
        lastChecked: Date.now(),
      };
    } catch {
      return {
        valid: false,
        statusCode: 500,
        isExpired: false,
        lastChecked: Date.now(),
      };
    }
  });
}
