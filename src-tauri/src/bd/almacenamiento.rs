/**
 * src-tauri/src/bd/almacenamiento.rs
 * Base de datos SQLite local para almacenamiento en caché de aumentos OP.GG y preferencias de usuario.
 * Cumple con la Ley 1: los tiers almacenados provienen 100% de la fuente real con TTL de 24 horas.
 */

use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone)]
pub struct AlmacenamientoBd {
    conexion: Arc<Mutex<Connection>>,
}

impl AlmacenamientoBd {
    pub fn abrir<P: AsRef<Path>>(ruta_archivo: P) -> Result<Self, String> {
        let conn = Connection::open(ruta_archivo).map_err(|e| format!("Error SQLite open: {}", e))?;

        // Inicializar esquema de tablas
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS mode_cache (
                key TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                cached_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS local_account (
                puuid TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
            ",
        )
        .map_err(|e| format!("Error SQLite tablas: {}", e))?;

        Ok(Self {
            conexion: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn abrir_en_memoria() -> Result<Self, String> {
        let conn = Connection::open_in_memory().map_err(|e| format!("Error SQLite in-memory: {}", e))?;
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS mode_cache (
                key TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                cached_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS local_account (
                puuid TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
            ",
        )
        .map_err(|e| format!("Error SQLite init: {}", e))?;

        Ok(Self {
            conexion: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn abrir_por_defecto() -> Result<Self, String> {
        let local = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| ".".to_string());
        let mut ruta = PathBuf::from(local);
        ruta.push("EAsy");
        std::fs::create_dir_all(&ruta).ok();
        ruta.push("itero_local.db");
        Self::abrir(ruta)
    }

    /// Guarda datos en mode_cache con marca de tiempo actual
    pub fn guardar_cache_modo(&self, key: &str, data_json: &str) -> Result<(), String> {
        let conn = self.conexion.lock().map_err(|e| e.to_string())?;
        let ahora = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        conn.execute(
            "INSERT OR REPLACE INTO mode_cache (key, data, cached_at) VALUES (?1, ?2, ?3)",
            params![key, data_json, ahora],
        )
        .map_err(|e| format!("Error guardando cache modo: {}", e))?;

        Ok(())
    }

    /// Obtiene datos de mode_cache si no ha expirado el TTL (por defecto 24 horas = 86400s)
    pub fn obtener_cache_modo(&self, key: &str, max_antiguedad_segs: i64) -> Result<Option<String>, String> {
        let conn = self.conexion.lock().map_err(|e| e.to_string())?;
        let ahora = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let mut stmt = conn
            .prepare("SELECT data, cached_at FROM mode_cache WHERE key = ?1")
            .map_err(|e| e.to_string())?;

        let mut rows = stmt.query(params![key]).map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let data: String = row.get(0).map_err(|e| e.to_string())?;
            let cached_at: i64 = row.get(1).map_err(|e| e.to_string())?;
            if ahora - cached_at <= max_antiguedad_segs {
                return Ok(Some(data));
            }
        }

        Ok(None)
    }

    pub fn guardar_ajuste(&self, clave: &str, valor_json: &str) -> Result<(), String> {
        let conn = self.conexion.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![clave, valor_json],
        )
        .map_err(|e| format!("Error guardando ajuste: {}", e))?;
        Ok(())
    }

    pub fn obtener_ajuste(&self, clave: &str) -> Result<Option<String>, String> {
        let conn = self.conexion.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT value FROM settings WHERE key = ?1")
            .map_err(|e| e.to_string())?;

        let mut rows = stmt.query(params![clave]).map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let val: String = row.get(0).map_err(|e| e.to_string())?;
            return Ok(Some(val));
        }
        Ok(None)
    }
}
