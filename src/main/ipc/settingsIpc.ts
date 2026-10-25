import { ipcMain, app } from 'electron';
import { IPC_CHANNELS } from '../../shared/events';
import { DEFAULT_APP_SETTINGS } from '../../shared/constants';
import { AppSettings } from '../../shared/types';
import {
  IDatabaseService,
  ISecurityService,
  IRiotApiClient,
  ILcuClient,
  KeyHealthStatus,
} from '../../shared/contracts';
import { GeminiService } from '../ai/GeminiService';
import { SecurityService } from '../security/SecurityService';
import { obtenerRutaLogPorDefecto } from '../lcu/LcuDetector';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { platform, arch, release } from 'node:os';

/** Sanitiza recursivamente un texto u objeto eliminando rutas de usuario, tokens y claves */
export function sanitizarParaDiagnostico(input: any): any {
  if (typeof input === 'string') {
    return input
      .replace(/[A-Za-z]:\\Users\\[^\\]+/gi, 'C:\\Users\\[USER]')
      .replace(/\/Users\/[^\/]+/gi, '/Users/[USER]')
      .replace(/\/home\/[^\/]+/gi, '/home/[USER]')
      .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_GEMINI_KEY]')
      .replace(/RGAPI-[0-9a-fA-F-]{36}/gi, '[REDACTED_RIOT_KEY]')
      .replace(/ghp_[0-9A-Za-z]{36}/gi, '[REDACTED_GITHUB_TOKEN]')
      .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED]')
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[REDACTED_UUID]');
  }
  if (Array.isArray(input)) {
    return input.map(sanitizarParaDiagnostico);
  }
  if (input !== null && typeof input === 'object') {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(input)) {
      if (/key|token|auth|secret|password/i.test(k) && typeof v === 'string') {
        res[k] = '[REDACTED]';
      } else {
        res[k] = sanitizarParaDiagnostico(v);
      }
    }
    return res;
  }
  return input;
}

export function registrarSettingsIpc(
  _getWebContents: () => Electron.WebContents | null,
  dbService?: IDatabaseService,
  securityService?: ISecurityService,
  riotClient?: IRiotApiClient,
  geminiService?: GeminiService,
  lcuClient?: ILcuClient
): void {
  let memoriaSettings: AppSettings = dbService ? dbService.getSettings() : DEFAULT_APP_SETTINGS;

  // 0. Versión de la Aplicación
  ipcMain.removeHandler('app:get-version');
  ipcMain.handle('app:get-version', async () => (app?.getVersion ? app.getVersion() : '1.0.1'));

  // 1. Obtener Ajustes
  ipcMain.removeHandler(IPC_CHANNELS.SETTINGS_GET);
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (): Promise<AppSettings> => {
    if (dbService) {
      memoriaSettings = dbService.getSettings();
    }
    return memoriaSettings;
  });

  // 2. Guardar Ajustes con cifrado seguro y migración DPAPI
  ipcMain.removeHandler(IPC_CHANNELS.SETTINGS_SAVE);
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE, async (_event, newSettings: Partial<AppSettings>): Promise<{ success: boolean; error?: string }> => {
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

      // Si hay servicio de seguridad y claves en claro, cifrarlas (o migrarlas a DPAPI)
      if (securityService && newSettings.apiKeys) {
        if (newSettings.apiKeys.riotApiKeyEncrypted) {
          const val = newSettings.apiKeys.riotApiKeyEncrypted.trim();
          if (!val.startsWith('dpapi:') && !val.includes(':')) {
            memoriaSettings.apiKeys.riotApiKeyEncrypted = securityService.encrypt(val);
          } else if (securityService instanceof SecurityService) {
            const migr = securityService.migrarSiEsNecesario(val);
            if (migr.migrado) {
              memoriaSettings.apiKeys.riotApiKeyEncrypted = migr.nuevoTexto;
            }
          }
        }

        if (newSettings.apiKeys.geminiApiKeyEncrypted) {
          const val = newSettings.apiKeys.geminiApiKeyEncrypted.trim();
          if (!val.startsWith('dpapi:') && !val.includes(':')) {
            memoriaSettings.apiKeys.geminiApiKeyEncrypted = securityService.encrypt(val);
          } else if (securityService instanceof SecurityService) {
            const migr = securityService.migrarSiEsNecesario(val);
            if (migr.migrado) {
              memoriaSettings.apiKeys.geminiApiKeyEncrypted = migr.nuevoTexto;
            }
          }
        }
      }

      // Si hay cliente Riot, actualizar clave descifrada
      if (riotClient && newSettings.apiKeys?.riotApiKeyEncrypted) {
        const raw = newSettings.apiKeys.riotApiKeyEncrypted;
        const clave = securityService && (raw.startsWith('dpapi:') || raw.includes(':'))
          ? securityService.decrypt(raw)
          : raw;
        riotClient.setApiKey(clave);
      }

      // Si hay GeminiService, actualizar clave descifrada
      if (geminiService && newSettings.apiKeys?.geminiApiKeyEncrypted) {
        const raw = newSettings.apiKeys.geminiApiKeyEncrypted;
        const clave = securityService && (raw.startsWith('dpapi:') || raw.includes(':'))
          ? securityService.decrypt(raw)
          : raw;
        geminiService.setApiKey(clave);
      }

      // Aplicar Auto-Accept en caliente con cada guardado (REQ-010).
      if (lcuClient) {
        const autoAccept = memoriaSettings.autoAccept ?? DEFAULT_APP_SETTINGS.autoAccept;
        lcuClient.setAutoAccept(autoAccept.enabled, autoAccept.delaySeconds);
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

  // 4. Exportar Diagnóstico Sanitizado (Frente 6)
  ipcMain.removeHandler(IPC_CHANNELS.SETTINGS_EXPORT_DIAGNOSTIC);
  ipcMain.handle(IPC_CHANNELS.SETTINGS_EXPORT_DIAGNOSTIC, async (): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    try {
      let targetDir: string;
      try {
        targetDir = app.getPath('downloads');
      } catch {
        targetDir = process.cwd();
      }

      const fileName = `itero-diagnostic-${Date.now()}.json`;
      const fullPath = join(targetDir, fileName);

      let accountsCount = 0;
      let matchesCount = 0;
      if (dbService) {
        try {
          const accs = dbService.getAccounts();
          accountsCount = accs.length;
          if (accs[0]) {
            matchesCount = dbService.getRecentMatches(accs[0].puuid, 100).length;
          }
        } catch {}
      }

      // Leer últimas líneas de log
      let recentLogs: string[] = [];
      const logPath = obtenerRutaLogPorDefecto();
      if (existsSync(logPath)) {
        try {
          const raw = await readFile(logPath, 'utf-8');
          const lines = raw.split('\n').filter(Boolean);
          recentLogs = lines.slice(-60);
        } catch {}
      }

      const rawDiagnostic = {
        meta: {
          generadoEn: new Date().toISOString(),
          appVersion: app?.getVersion ? app.getVersion() : '1.0.0',
          sistemaOperativo: `${platform()} ${arch()} (${release()})`,
          electronVersion: process.versions.electron || 'N/A',
          nodeVersion: process.versions.node,
        },
        lcu: {
          estadoConexion: lcuClient ? lcuClient.getConnectionState() : 'desconocido',
          faseJuego: lcuClient ? lcuClient.getGameflowPhase() : 'desconocido',
          puerto: lcuClient && (lcuClient as any).getPort ? (lcuClient as any).getPort() : null,
          errorPermisos: lcuClient && (lcuClient as any).getIsPermissionError ? (lcuClient as any).getIsPermissionError() : false,
          ultimoReporteDeteccion: lcuClient && (lcuClient as any).getDetectionReport ? (lcuClient as any).getDetectionReport() : null,
        },
        servicios: {
          riotApiKeyConfigurada: Boolean(memoriaSettings.apiKeys?.riotApiKeyEncrypted),
          geminiApiKeyConfigurada: Boolean(memoriaSettings.apiKeys?.geminiApiKeyEncrypted),
          dpapiDisponible: securityService instanceof SecurityService ? securityService.isDpapiAvailable() : false,
          autoAcceptActivo: memoriaSettings.autoAccept?.enabled,
          autoPickActivo: memoriaSettings.autoChampSelect?.autoPick,
          autoBanActivo: memoriaSettings.autoChampSelect?.autoBan,
          preferenciasRoles: memoriaSettings.autoChampSelect?.rolePreferences ? Object.keys(memoriaSettings.autoChampSelect.rolePreferences) : [],
        },
        baseDeDatos: {
          cuentasRegistradas: accountsCount,
          partidasRegistradas: matchesCount,
        },
        logsRecientes: recentLogs,
      };

      const sanitizedDiagnostic = sanitizarParaDiagnostico(rawDiagnostic);
      await writeFile(fullPath, JSON.stringify(sanitizedDiagnostic, null, 2), 'utf-8');

      return { success: true, filePath: fullPath };
    } catch (err: unknown) {
      console.error('[SettingsIPC] Error al exportar diagnóstico:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
