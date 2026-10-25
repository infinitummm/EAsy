-- ============================================================
-- Esquema de la base de datos local de Itero Local (T-3.2)
-- Especificado en docs/CONTRACTS.md §2. Se ejecuta de forma
-- idempotente (CREATE IF NOT EXISTS) al inicializar la BD.
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

-- Tabla de Cuentas de Invocador Vinculadas
CREATE TABLE IF NOT EXISTS accounts (
    puuid TEXT PRIMARY KEY,
    game_name TEXT NOT NULL,
    tag_line TEXT NOT NULL,
    platform TEXT NOT NULL,
    regional TEXT NOT NULL,
    summoner_id TEXT,
    profile_icon_id INTEGER DEFAULT 0,
    summoner_level INTEGER DEFAULT 1,
    tier TEXT,
    rank TEXT,
    league_points INTEGER DEFAULT 0,
    updated_at INTEGER NOT NULL
);

-- Tabla de Partidas
CREATE TABLE IF NOT EXISTS matches (
    match_id TEXT PRIMARY KEY,
    game_creation INTEGER NOT NULL,
    game_duration INTEGER NOT NULL,
    game_version TEXT NOT NULL,
    queue_id INTEGER NOT NULL,
    parsed_at INTEGER NOT NULL
);

-- Participantes de Partidas (Historial Personal y Rivales de Línea)
CREATE TABLE IF NOT EXISTS match_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT NOT NULL,
    puuid TEXT NOT NULL,
    champion_id INTEGER NOT NULL,
    champion_name TEXT NOT NULL,
    role TEXT NOT NULL,
    win INTEGER NOT NULL, -- 0 o 1
    kills INTEGER NOT NULL,
    deaths INTEGER NOT NULL,
    assists INTEGER NOT NULL,
    cs INTEGER NOT NULL,
    gold_earned INTEGER NOT NULL,
    damage_dealt INTEGER NOT NULL,
    items_json TEXT NOT NULL, -- Array JSON de item IDs
    perks_json TEXT NOT NULL, -- Array JSON de perks
    opponent_id INTEGER, -- Campeón rival de línea si se conoce (REQ-015)
    FOREIGN KEY(match_id) REFERENCES matches(match_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_match_participants_puuid ON match_participants(puuid);
CREATE INDEX IF NOT EXISTS idx_match_participants_champ ON match_participants(champion_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_role ON match_participants(role);

-- Caché Persistente de Recomendaciones de IA por Matchup y Parche
CREATE TABLE IF NOT EXISTS matchup_cache (
    cache_key TEXT PRIMARY KEY, -- HASH(champion_id:opponent_id:role:patch)
    champion_id INTEGER NOT NULL,
    opponent_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    patch_version TEXT NOT NULL,
    recommendation_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matchup_cache_expires ON matchup_cache(expires_at);

-- Caché Persistente para Modos Especiales (ARAM Caos / Arena)
CREATE TABLE IF NOT EXISTS mode_cache (
    cache_key TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    champion_id INTEGER NOT NULL,
    patch_version TEXT NOT NULL,
    data_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mode_cache_expires ON mode_cache(expires_at);

-- Tabla Clave-Valor para Configuraciones Locales
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Registro de Consumo y Cuotas de APIs
CREATE TABLE IF NOT EXISTS api_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_name TEXT NOT NULL, -- 'RIOT' | 'GEMINI'
    endpoint TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_usage_timestamp ON api_usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_api_usage_api ON api_usage(api_name, timestamp);
