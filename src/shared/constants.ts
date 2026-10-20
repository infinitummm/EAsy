/**
 * Constantes compartidas de configuración y límites del sistema.
 * Este archivo es propiedad exclusiva de ANTIGRAVITY.
 */

import { Role } from './types';

// ==========================================
// Límites de Tasa de Riot API (Clave Personal / Dev)
// ==========================================
export const RIOT_RATE_LIMITS = {
  SHORT_WINDOW_MS: 1_000,
  SHORT_WINDOW_MAX_REQUESTS: 20,
  LONG_WINDOW_MS: 120_000,
  LONG_WINDOW_MAX_REQUESTS: 100,
  DEV_KEY_MAX_DURATION_HOURS: 24,
  EXPIRATION_WARNING_HOURS: 2,
} as const;

// ==========================================
// Límites de Tasa de Google Gemini API (Free Tier)
// ==========================================
export const GEMINI_RATE_LIMITS = {
  REQUESTS_PER_MINUTE: 15,
  REQUESTS_PER_DAY: 1500,
  TOKENS_PER_MINUTE: 1_000_000,
  MAX_RETRY_ATTEMPTS: 3,
  INITIAL_BACKOFF_MS: 1_000,
} as const;

// ==========================================
// Tiempos y Defaults de Auto-Accept y Champ Select
// ==========================================
export const LCU_CONSTANTS = {
  MIN_AUTO_ACCEPT_DELAY_SECONDS: 0,
  MAX_AUTO_ACCEPT_DELAY_SECONDS: 8,
  DEFAULT_AUTO_ACCEPT_DELAY_SECONDS: 2,
  POLLING_INTERVAL_LOCKFILE_MS: 2_000,
  RECONNECT_BACKOFF_MS: 3_000,
} as const;

// ==========================================
// Configuración de Rutas de CDN Públicas
// ==========================================
export const CDN_URLS = {
  DDRAGON_VERSIONS: 'https://ddragon.leagueoflegends.com/api/versions.json',
  DDRAGON_CDN_BASE: 'https://ddragon.leagueoflegends.com/cdn',
  COMMUNITY_DRAGON_BASE: 'https://raw.communitydragon.org/latest',
} as const;

// ==========================================
// Mapeo de Roles a Nombre en Español
// ==========================================
export const ROLE_LABELS: Record<Role, string> = {
  TOP: 'Superior (Top)',
  JUNGLE: 'Jungla (Jg)',
  MIDDLE: 'Central (Mid)',
  BOTTOM: 'Tirador (Adc)',
  UTILITY: 'Soporte (Sup)',
  FILL: 'Comodín (Fill)',
} as const;

// ==========================================
// Configuración por Defecto de la App
// ==========================================
export const DEFAULT_APP_SETTINGS = {
  autoAccept: {
    enabled: true,
    delaySeconds: 2,
    humanVariance: true,
  },
  autoChampSelect: {
    autoHover: true,
    autoPick: false,
    autoBan: false,
    autoSpells: true,
    pickDelaySeconds: 1,
    rolePreferences: {
      TOP: { preferredChampions: [], fallbackChampions: [], banChampions: [], spells: [4, 12] as [number, number] }, // Flash + TP
      JUNGLE: { preferredChampions: [], fallbackChampions: [], banChampions: [], spells: [4, 11] as [number, number] }, // Flash + Smite
      MIDDLE: { preferredChampions: [], fallbackChampions: [], banChampions: [], spells: [4, 14] as [number, number] }, // Flash + Ignite
      BOTTOM: { preferredChampions: [], fallbackChampions: [], banChampions: [], spells: [4, 7] as [number, number] }, // Flash + Heal
      UTILITY: { preferredChampions: [], fallbackChampions: [], banChampions: [], spells: [4, 3] as [number, number] }, // Flash + Exhaust
      FILL: { preferredChampions: [], fallbackChampions: [], banChampions: [], spells: [4, 14] as [number, number] },
    },
  },
  apiKeys: {
    riotApiKeyEncrypted: '',
    geminiApiKeyEncrypted: '',
  },
  activeAccount: null,
  leagueInstallationPath: '',
};
