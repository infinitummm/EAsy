/**
 * src-tauri/src/modos/detector_sin_bordes.rs
 * Lector y actualizador de configuración `game.cfg` de League of Legends
 * para asegurar modo de pantalla completa sin bordes (WindowMode=1) y evitar solapamientos.
 */

use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ReporteSinBordes {
    pub is_borderless: bool,
    pub window_mode: i32,
    pub config_path: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ResultadoAplicarSinBordes {
    pub success: bool,
    pub config_path: String,
    pub previous_mode: i32,
}

const RUTAS_CONFIG_COMUNES: &[&str] = &[
    r"C:\Riot Games\League of Legends\Config\game.cfg",
    r"D:\Riot Games\League of Legends\Config\game.cfg",
    r"E:\Riot Games\League of Legends\Config\game.cfg",
    r"C:\Program Files\Riot Games\League of Legends\Config\game.cfg",
    r"C:\Program Files (x86)\Riot Games\League of Legends\Config\game.cfg",
];

pub fn encontrar_ruta_game_cfg(ruta_manual: Option<&str>) -> Option<PathBuf> {
    if let Some(r) = ruta_manual {
        let p = Path::new(r);
        let cand = if p.is_dir() {
            p.join("Config").join("game.cfg")
        } else if p.file_name().and_then(|s| s.to_str()) == Some("game.cfg") {
            p.to_path_buf()
        } else {
            p.join("game.cfg")
        };
        if cand.exists() {
            return Some(cand);
        }
    }

    for ruta in RUTAS_CONFIG_COMUNES {
        let p = PathBuf::from(ruta);
        if p.exists() {
            return Some(p);
        }
    }
    None
}

pub fn verificar_sin_bordes(ruta_manual: Option<&str>) -> ReporteSinBordes {
    let ruta = match encontrar_ruta_game_cfg(ruta_manual) {
        Some(p) => p,
        None => {
            return ReporteSinBordes {
                is_borderless: false,
                window_mode: -1,
                config_path: "No encontrado".to_string(),
            };
        }
    };

    let contenido = fs::read_to_string(&ruta).unwrap_or_default();
    let mut window_mode = 0; // 0 = Fullscreen exclusivo, 1 = Borderless, 2 = Windowed

    for linea in contenido.lines() {
        let l = linea.trim();
        if l.starts_with("WindowMode=") {
            let partes: Vec<&str> = l.split('=').collect();
            if partes.len() >= 2 {
                if let Ok(v) = partes[1].trim().parse::<i32>() {
                    window_mode = v;
                }
            }
        }
    }

    ReporteSinBordes {
        is_borderless: window_mode == 1 || window_mode == 2,
        window_mode,
        config_path: ruta.to_string_lossy().to_string(),
    }
}

pub fn aplicar_sin_bordes(ruta_manual: Option<&str>) -> ResultadoAplicarSinBordes {
    let ruta = match encontrar_ruta_game_cfg(ruta_manual) {
        Some(p) => p,
        None => {
            return ResultadoAplicarSinBordes {
                success: false,
                config_path: "".to_string(),
                previous_mode: -1,
            };
        }
    };

    let contenido = match fs::read_to_string(&ruta) {
        Ok(c) => c,
        Err(_) => {
            return ResultadoAplicarSinBordes {
                success: false,
                config_path: ruta.to_string_lossy().to_string(),
                previous_mode: -1,
            };
        }
    };

    let mut previous_mode = 0;
    let mut found = false;
    let mut nuevas_lineas = Vec::new();

    for linea in contenido.lines() {
        if linea.trim().starts_with("WindowMode=") {
            found = true;
            if let Some(val) = linea.split('=').nth(1) {
                previous_mode = val.trim().parse::<i32>().unwrap_or(0);
            }
            nuevas_lineas.push("WindowMode=2".to_string());
        } else {
            nuevas_lineas.push(linea.to_string());
        }
    }

    if !found {
        nuevas_lineas.push("\n[General]".to_string());
        nuevas_lineas.push("WindowMode=2".to_string());
    }

    let nuevo_contenido = nuevas_lineas.join("\r\n");
    let success = fs::write(&ruta, nuevo_contenido).is_ok();

    ResultadoAplicarSinBordes {
        success,
        config_path: ruta.to_string_lossy().to_string(),
        previous_mode,
    }
}
