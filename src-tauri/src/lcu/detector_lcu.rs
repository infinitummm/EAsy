/**
 * src-tauri/src/lcu/detector_lcu.rs
 * Detección robusta del proceso y lockfile de League of Legends en Windows.
 */

use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct InfoLockfile {
    pub nombre_proceso: String,
    pub pid: u32,
    pub puerto: u16,
    pub contrasena: String,
    pub protocolo: String,
    pub token_auth_base64: String,
}

/// Rutas estándar de instalación de League of Legends en Windows
const RUTAS_COMUNES: &[&str] = &[
    r"C:\Riot Games\League of Legends",
    r"D:\Riot Games\League of Legends",
    r"E:\Riot Games\League of Legends",
    r"C:\Program Files\Riot Games\League of Legends",
    r"C:\Program Files (x86)\Riot Games\League of Legends",
];

/// Intenta parsear el contenido de un archivo lockfile
pub fn parsear_lockfile(contenido: &str) -> Option<InfoLockfile> {
    let partes: Vec<&str> = contenido.trim().split(':').collect();
    if partes.len() < 5 {
        return None;
    }

    let nombre_proceso = partes[0].to_string();
    let pid = partes[1].parse::<u32>().ok()?;
    let puerto = partes[2].parse::<u16>().ok()?;
    let contrasena = partes[3].to_string();
    let protocolo = partes[4].to_string();

    let auth_str = format!("riot:{}", contrasena);
    use base64::Engine;
    let token_auth_base64 = base64::engine::general_purpose::STANDARD.encode(auth_str);

    Some(InfoLockfile {
        nombre_proceso,
        pid,
        puerto,
        contrasena,
        protocolo,
        token_auth_base64,
    })
}

/// Detecta el lockfile en una ruta manual o en las rutas comunes del sistema
pub fn detectar_lockfile(ruta_manual: Option<&str>) -> Option<InfoLockfile> {
    if let Some(ruta) = ruta_manual {
        let p = Path::new(ruta);
        let ruta_lock = if p.is_dir() {
            p.join("lockfile")
        } else {
            p.to_path_buf()
        };
        if let Ok(contenido) = fs::read_to_string(&ruta_lock) {
            if let Some(info) = parsear_lockfile(&contenido) {
                return Some(info);
            }
        }
    }

    // Probar archivo RiotClientInstalls.json
    let path_riot_installs = PathBuf::from(r"C:\ProgramData\Riot Games\RiotClientInstalls.json");
    if path_riot_installs.exists() {
        if let Ok(contenido) = fs::read_to_string(&path_riot_installs) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&contenido) {
                if let Some(rc_default) = val.get("rc_default").and_then(|v| v.as_str()) {
                    let dir = Path::new(rc_default).parent().unwrap_or(Path::new(""));
                    let lock = dir.join("lockfile");
                    if let Ok(c) = fs::read_to_string(&lock) {
                        if let Some(info) = parsear_lockfile(&c) {
                            return Some(info);
                        }
                    }
                }
            }
        }
    }

    // Probar rutas comunes
    for ruta in RUTAS_COMUNES {
        let lock = Path::new(ruta).join("lockfile");
        if lock.exists() {
            if let Ok(contenido) = fs::read_to_string(&lock) {
                if let Some(info) = parsear_lockfile(&contenido) {
                    return Some(info);
                }
            }
        }
    }

    None
}
