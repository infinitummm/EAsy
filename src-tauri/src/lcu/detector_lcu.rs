/**
 * src-tauri/src/lcu/detector_lcu.rs
 * Módulo de detección robusta y diagnóstico del cliente LCU de League of Legends en Rust.
 *
 * Implementa 4 métodos de detección en orden estricto (A -> B -> C -> D):
 *  A) Argumentos del proceso LeagueClientUx.exe vía PowerShell (Get-CimInstance).
 *  B) Lockfile en la ruta obtenida de C:\ProgramData\Riot Games\RiotClientInstalls.json o directorio del proceso.
 *  C) Rutas comunes en todas las unidades de disco detectadas en Windows.
 *  D) Ruta manual configurada por el usuario en Ajustes.
 */

use base64::Engine;
use regex::Regex;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

// ==========================================
// Estructuras de Datos y Contratos
// ==========================================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LcuCredentials {
    pub process_name: String,
    pub pid: u32,
    pub port: u16,
    pub password: String,
    pub protocol: String,
    pub token_base64: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LcuDetectionStepResult {
    pub step: String,
    pub name: String,
    pub command_or_path: String,
    pub success: bool,
    pub details: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LcuDetectionReport {
    pub success: bool,
    pub credentials: Option<LcuCredentials>,
    pub successful_step: Option<String>,
    pub steps: Vec<LcuDetectionStepResult>,
    pub is_permission_error: bool,
    pub log_file_path: String,
    #[serde(default)]
    pub conectado: bool,
    #[serde(default)]
    pub lockfile: Option<LcuCredentials>,
    #[serde(default)]
    pub mensaje: String,
}

// Compatibilidad con código previo que utiliza InfoLockfile
pub type InfoLockfile = LcuCredentials;

// ==========================================
// Logging a Consola y Archivo en %APPDATA%
// ==========================================

pub fn obtener_ruta_log_defecto() -> String {
    if let Ok(app_data) = std::env::var("APPDATA") {
        let dir = PathBuf::from(&app_data).join("proyecto-itero");
        let _ = fs::create_dir_all(&dir);
        dir.join("lcu-detection.log").to_string_lossy().to_string()
    } else {
        "lcu-detection.log".to_string()
    }
}

pub fn registrar_log(mensaje: &str) {
    let duracion = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duracion.as_secs();
    let linea = format!("[Timestamp: {}] [LCU-DETECTOR] {}\n", secs, mensaje);

    println!("[LCU-DETECTOR] {}", mensaje);

    if let Ok(app_data) = std::env::var("APPDATA") {
        for sub in &["proyecto-itero", "EAsy"] {
            let dir = PathBuf::from(&app_data).join(sub);
            let _ = fs::create_dir_all(&dir);
            let ruta_archivo = dir.join("lcu-detection.log");
            if let Ok(mut archivo) = fs::OpenOptions::new().create(true).append(true).open(ruta_archivo) {
                let _ = archivo.write_all(linea.as_bytes());
            }
        }
    }
}

// ==========================================
// Parsing de Lockfile
// ==========================================

pub fn construir_token_base64(password: &str) -> String {
    let auth_str = format!("riot:{}", password);
    let codificado = base64::engine::general_purpose::STANDARD.encode(auth_str);
    format!("Basic {}", codificado)
}

pub fn parsear_lockfile(contenido: &str) -> Option<LcuCredentials> {
    let limpio = contenido.trim();
    let partes: Vec<&str> = limpio.split(':').collect();
    if partes.len() != 5 {
        return None;
    }

    let process_name = partes[0].trim().to_string();
    if process_name.is_empty() {
        return None;
    }

    let pid = partes[1].trim().parse::<u32>().ok()?;
    if pid == 0 {
        return None;
    }

    let port = partes[2].trim().parse::<u16>().ok()?;
    if port == 0 {
        return None;
    }

    let password = partes[3].trim().to_string();
    if password.is_empty() {
        return None;
    }

    let protocol = partes[4].trim().to_string();
    if protocol.is_empty() {
        return None;
    }

    let token_base64 = construir_token_base64(&password);

    Some(LcuCredentials {
        process_name,
        pid,
        port,
        password,
        protocol,
        token_base64,
    })
}

pub fn leer_lockfile(ruta: &Path) -> Option<LcuCredentials> {
    if !ruta.exists() {
        return None;
    }
    let contenido = fs::read_to_string(ruta).ok()?;
    parsear_lockfile(&contenido)
}

// ==========================================
// Parsing de Línea de Comandos de LeagueClientUx
// ==========================================

pub fn extraer_credenciales_de_command_line(
    command_line: &str,
) -> (Option<LcuCredentials>, Option<String>) {
    if command_line.trim().is_empty() {
        return (None, None);
    }

    let re_port = match Regex::new(r#"["']?--app-port=["']?(\d+)["']?"#) {
        Ok(r) => r,
        Err(_) => return (None, None),
    };
    let re_token = match Regex::new(r#"["']?--remoting-auth-token=["']?([^\s"']+)["']?"#) {
        Ok(r) => r,
        Err(_) => return (None, None),
    };
    let re_pid = match Regex::new(r#"["']?--app-pid=["']?(\d+)["']?"#) {
        Ok(r) => r,
        Err(_) => return (None, None),
    };
    let re_install_dir = match Regex::new(r#"["']?--install-directory=["']?([^"\r\n]+?)(?:["'](?:\s+|$)|(?:\s+--)|$)"#) {
        Ok(r) => r,
        Err(_) => return (None, None),
    };

    let install_dir = re_install_dir
        .captures(command_line)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().trim().trim_matches('"').trim_matches('\'').to_string());

    let port_match = re_port.captures(command_line).and_then(|c| c.get(1));
    let token_match = re_token.captures(command_line).and_then(|c| c.get(1));

    if port_match.is_none() || token_match.is_none() {
        return (None, install_dir);
    }

    let port = match port_match.unwrap().as_str().parse::<u16>() {
        Ok(p) if p > 0 => p,
        _ => return (None, install_dir),
    };

    let password = token_match.unwrap().as_str().trim().to_string();
    if password.is_empty() {
        return (None, install_dir);
    }

    let pid = re_pid
        .captures(command_line)
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse::<u32>().ok())
        .unwrap_or(0);

    let token_base64 = construir_token_base64(&password);

    let credenciales = LcuCredentials {
        process_name: "LeagueClientUx".to_string(),
        pid,
        port,
        password,
        protocol: "https".to_string(),
        token_base64,
    };

    (Some(credenciales), install_dir)
}

// ==========================================
// Método A: Proceso LeagueClientUx.exe (PowerShell Get-CimInstance)
// ==========================================

#[cfg(windows)]
fn ejecutar_script_powershell(script: &str) -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let utf16: Vec<u8> = script.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
    let encoded = base64::engine::general_purpose::STANDARD.encode(&utf16);

    let output = std::process::Command::new("powershell.exe")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["-NoProfile", "-NonInteractive", "-EncodedCommand", &encoded])
        .output()
        .map_err(|e| format!("Fallo al invocar powershell.exe: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if err.is_empty() {
            format!("Código de salida {}", output.status)
        } else {
            err
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(not(windows))]
fn ejecutar_script_powershell(_script: &str) -> Result<String, String> {
    Err("PowerShell solo está disponible en Windows.".to_string())
}

pub fn detectar_por_proceso() -> (
    LcuDetectionStepResult,
    Option<LcuCredentials>,
    Option<String>,
    bool,
) {
    let comando_visible = r#"Get-CimInstance Win32_Process -Filter "name='LeagueClientUx.exe'" | Select-Object -ExpandProperty CommandLine"#;
    registrar_log(&format!("Probando Método A (Proceso)... Comando: {}", comando_visible));

    let script_ps = r#"(Get-CimInstance Win32_Process -Filter "name='LeagueClientUx.exe'").CommandLine"#;

    match ejecutar_script_powershell(script_ps) {
        Ok(stdout) if !stdout.trim().is_empty() => {
            let (credenciales, install_dir) = extraer_credenciales_de_command_line(&stdout);
            if let Some(ref c) = credenciales {
                registrar_log(&format!(
                    "Método A exitoso. Puerto: {}, PID: {}",
                    c.port, c.pid
                ));
                let paso = LcuDetectionStepResult {
                    step: "process".to_string(),
                    name: "Proceso LeagueClientUx.exe (PowerShell Get-CimInstance)".to_string(),
                    command_or_path: comando_visible.to_string(),
                    success: true,
                    details: format!("Proceso encontrado. Puerto LCU: {}, PID: {}", c.port, c.pid),
                };
                (paso, credenciales, install_dir, false)
            } else {
                registrar_log("Método A: Proceso encontrado pero no se pudieron parsear los argumentos --app-port y --remoting-auth-token.");
                let paso = LcuDetectionStepResult {
                    step: "process".to_string(),
                    name: "Proceso LeagueClientUx.exe (PowerShell Get-CimInstance)".to_string(),
                    command_or_path: comando_visible.to_string(),
                    success: false,
                    details: "El proceso respondió pero no contiene los argumentos --app-port y --remoting-auth-token.".to_string(),
                };
                (paso, None, install_dir, false)
            }
        }
        Ok(_) | Err(_) => {
            // Verificar si el proceso existe pero los permisos impidieron leer CommandLine
            let check_script = r#"(Get-Process -Name 'LeagueClientUx' -ErrorAction SilentlyContinue).Id"#;
            let proceso_existe = match ejecutar_script_powershell(check_script) {
                Ok(out) => !out.trim().is_empty(),
                Err(_) => false,
            };

            if proceso_existe {
                registrar_log("Método A: El proceso LeagueClientUx.exe está en ejecución pero CommandLine fue denegado. Posible falta de permisos.");
                let paso = LcuDetectionStepResult {
                    step: "process".to_string(),
                    name: "Proceso LeagueClientUx.exe (PowerShell Get-CimInstance)".to_string(),
                    command_or_path: comando_visible.to_string(),
                    success: false,
                    details: "Proceso LeagueClientUx.exe detectado, pero no se pudo leer su línea de comandos por permisos.".to_string(),
                };
                (paso, None, None, true)
            } else {
                registrar_log("Método A: No se encontró ningún proceso con nombre LeagueClientUx.exe.");
                let paso = LcuDetectionStepResult {
                    step: "process".to_string(),
                    name: "Proceso LeagueClientUx.exe (PowerShell Get-CimInstance)".to_string(),
                    command_or_path: comando_visible.to_string(),
                    success: false,
                    details: "El proceso LeagueClientUx.exe no está en ejecución actualmente.".to_string(),
                };
                (paso, None, None, false)
            }
        }
    }
}

// ==========================================
// Método B: RiotClientInstalls.json / Directorio del Proceso
// ==========================================

pub fn detectar_por_riot_client_installs(
    install_dir_from_process: Option<&str>,
) -> (LcuDetectionStepResult, Option<LcuCredentials>) {
    let json_path = r"C:\ProgramData\Riot Games\RiotClientInstalls.json";
    registrar_log(&format!("Probando Método B (RiotClientInstalls.json / Proceso)... Ruta base: {}", json_path));

    let mut candidatos: Vec<PathBuf> = Vec::new();

    // 1. Si el Método A aportó un installDirectory
    if let Some(dir) = install_dir_from_process {
        if !dir.trim().is_empty() {
            candidatos.push(Path::new(dir).join("lockfile"));
        }
    }

    // 2. Parsear RiotClientInstalls.json buscando entradas asociadas a League of Legends
    let json_p = Path::new(json_path);
    if json_p.exists() {
        if let Ok(contenido) = fs::read_to_string(json_p) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&contenido) {
                if let Some(obj) = val.get("associated_client").and_then(|v| v.as_object()) {
                    for (clave_path, _) in obj {
                        if clave_path.to_lowercase().contains("league of legends") {
                            candidatos.push(Path::new(clave_path).join("lockfile"));
                        }
                    }
                }
            }
        }
    }

    for cand in &candidatos {
        if cand.exists() {
            if let Some(creds) = leer_lockfile(cand) {
                let ruta_str = cand.to_string_lossy().to_string();
                registrar_log(&format!("Método B exitoso. Lockfile leído en: {}", ruta_str));
                let paso = LcuDetectionStepResult {
                    step: "riotClientInstalls".to_string(),
                    name: "Ruta de RiotClientInstalls.json / Directorio de Proceso".to_string(),
                    command_or_path: ruta_str.clone(),
                    success: true,
                    details: format!("Lockfile encontrado y leído exitosamente en: {}", ruta_str),
                };
                return (paso, Some(creds));
            }
        }
    }

    let detalle = if !candidatos.is_empty() {
        let rutas_cand = candidatos.iter().map(|c| c.to_string_lossy()).collect::<Vec<_>>().join(", ");
        format!("Se probaron las rutas derivadas ({}), pero el lockfile no existe o está inaccesible.", rutas_cand)
    } else {
        format!("No se encontró entrada de League of Legends en {} ni directorio de proceso.", json_path)
    };

    registrar_log(&format!("Método B no tuvo éxito: {}", detalle));

    let paso = LcuDetectionStepResult {
        step: "riotClientInstalls".to_string(),
        name: "Ruta de RiotClientInstalls.json / Directorio de Proceso".to_string(),
        command_or_path: json_path.to_string(),
        success: false,
        details: detalle,
    };
    (paso, None)
}

// ==========================================
// Método C: Rutas Comunes en Unidades de Disco
// ==========================================

fn obtener_letras_unidades() -> Vec<char> {
    #[cfg(windows)]
    {
        let mask = unsafe { windows::Win32::Storage::FileSystem::GetLogicalDrives() };
        let mut list = Vec::new();
        for i in 0..26 {
            if (mask & (1 << i)) != 0 {
                list.push((b'A' + i) as char);
            }
        }
        if list.is_empty() {
            vec!['C', 'D', 'E', 'F', 'G', 'H']
        } else {
            list
        }
    }
    #[cfg(not(windows))]
    {
        vec!['C', 'D', 'E', 'F', 'G', 'H']
    }
}

pub fn detectar_por_rutas_comunes() -> (LcuDetectionStepResult, Option<LcuCredentials>) {
    registrar_log("Probando Método C (Rutas comunes en discos C:, D:, E:, etc.)...");

    let letras = obtener_letras_unidades();
    let subcarpetas = [
        r"Riot Games\League of Legends\lockfile",
        r"Program Files\Riot Games\League of Legends\lockfile",
        r"Program Files (x86)\Riot Games\League of Legends\lockfile",
        r"Games\League of Legends\lockfile",
        r"Juegos\League of Legends\lockfile",
    ];

    let mut probadas = 0;

    for letra in &letras {
        for sub in &subcarpetas {
            probadas += 1;
            let ruta_str = format!(r"{}:\{}", letra, sub);
            let path = Path::new(&ruta_str);
            if path.exists() {
                if let Some(creds) = leer_lockfile(path) {
                    registrar_log(&format!("Método C exitoso. Lockfile encontrado en: {}", ruta_str));
                    let paso = LcuDetectionStepResult {
                        step: "commonPaths".to_string(),
                        name: "Rutas Comunes en Unidades de Disco".to_string(),
                        command_or_path: ruta_str.clone(),
                        success: true,
                        details: format!("Lockfile encontrado en: {}", ruta_str),
                    };
                    return (paso, Some(creds));
                }
            }
        }
    }

    registrar_log(&format!(
        "Método C: Ninguna de las {} rutas comunes contiene un lockfile activo.",
        probadas
    ));

    let paso = LcuDetectionStepResult {
        step: "commonPaths".to_string(),
        name: "Rutas Comunes en Unidades de Disco".to_string(),
        command_or_path: "C..Z:\\Riot Games\\League of Legends\\lockfile".to_string(),
        success: false,
        details: format!("Se verificaron {} rutas comunes en unidades montadas sin encontrar un lockfile activo.", probadas),
    };
    (paso, None)
}

// ==========================================
// Método D: Ruta Manual
// ==========================================

pub fn detectar_por_ruta_manual(
    ruta_manual: Option<&str>,
) -> (LcuDetectionStepResult, Option<LcuCredentials>) {
    let ruta_limpia = match ruta_manual {
        Some(r) if !r.trim().is_empty() => r.trim(),
        _ => {
            let paso = LcuDetectionStepResult {
                step: "manualPath".to_string(),
                name: "Ruta Manual Configurada".to_string(),
                command_or_path: "(No configurada)".to_string(),
                success: false,
                details: "No se ha configurado ninguna ruta manual de instalación en los Ajustes.".to_string(),
            };
            return (paso, None);
        }
    };

    registrar_log(&format!("Probando Método D (Ruta Manual)... Configurada: {}", ruta_limpia));

    let p = Path::new(ruta_limpia);
    let ruta_lockfile = if p.is_dir() {
        p.join("lockfile")
    } else {
        p.to_path_buf()
    };

    let ruta_lockfile_str = ruta_lockfile.to_string_lossy().to_string();

    if ruta_lockfile.exists() {
        if let Some(creds) = leer_lockfile(&ruta_lockfile) {
            registrar_log(&format!("Método D exitoso. Lockfile leído en ruta manual: {}", ruta_lockfile_str));
            let paso = LcuDetectionStepResult {
                step: "manualPath".to_string(),
                name: "Ruta Manual Configurada".to_string(),
                command_or_path: ruta_lockfile_str.clone(),
                success: true,
                details: format!("Lockfile leído exitosamente en: {}", ruta_lockfile_str),
            };
            return (paso, Some(creds));
        } else {
            registrar_log(&format!("Método D: Lockfile en {} falló al parsear.", ruta_lockfile_str));
            let paso = LcuDetectionStepResult {
                step: "manualPath".to_string(),
                name: "Ruta Manual Configurada".to_string(),
                command_or_path: ruta_lockfile_str.clone(),
                success: false,
                details: format!("El archivo existe en {} pero no se pudo parsear su formato.", ruta_lockfile_str),
            };
            return (paso, None);
        }
    }

    registrar_log(&format!("Método D: La ruta {} no existe.", ruta_lockfile_str));
    let paso = LcuDetectionStepResult {
        step: "manualPath".to_string(),
        name: "Ruta Manual Configurada".to_string(),
        command_or_path: ruta_lockfile_str.clone(),
        success: false,
        details: format!("No se encontró el archivo lockfile en: {}", ruta_lockfile_str),
    };
    (paso, None)
}

// ==========================================
// Orquestador Principal de Detección LCU
// ==========================================

pub fn ejecutar_deteccion_lcu(ruta_manual: Option<&str>) -> LcuDetectionReport {
    let ruta_log = obtener_ruta_log_defecto();
    let mut pasos: Vec<LcuDetectionStepResult> = Vec::new();
    let mut is_permission_error = false;

    registrar_log("=== Iniciando ciclo de detección de LCU ===");

    // 1. Método A: Proceso LeagueClientUx.exe
    let (paso_a, creds_a, install_dir, err_perm) = detectar_por_proceso();
    pasos.push(paso_a.clone());
    if err_perm {
        is_permission_error = true;
    }
    if let Some(creds) = creds_a {
        registrar_log("=== Detección LCU COMPLETADA con Éxito (Método A: Proceso) ===");
        return LcuDetectionReport {
            success: true,
            credentials: Some(creds.clone()),
            successful_step: Some(paso_a.name),
            steps: pasos,
            is_permission_error,
            log_file_path: ruta_log,
            conectado: true,
            lockfile: Some(creds),
            mensaje: "Proceso LeagueClientUx.exe detectado con éxito.".to_string(),
        };
    }

    // 2. Método B: RiotClientInstalls.json / Directorio del proceso
    let (paso_b, creds_b) = detectar_por_riot_client_installs(install_dir.as_deref());
    pasos.push(paso_b.clone());
    if let Some(creds) = creds_b {
        registrar_log("=== Detección LCU COMPLETADA con Éxito (Método B: RiotClientInstalls) ===");
        return LcuDetectionReport {
            success: true,
            credentials: Some(creds.clone()),
            successful_step: Some(paso_b.name),
            steps: pasos,
            is_permission_error,
            log_file_path: ruta_log,
            conectado: true,
            lockfile: Some(creds),
            mensaje: "Lockfile detectado vía RiotClientInstalls / directorio de proceso.".to_string(),
        };
    }

    // 3. Método C: Rutas comunes en todas las unidades montadas
    let (paso_c, creds_c) = detectar_por_rutas_comunes();
    pasos.push(paso_c.clone());
    if let Some(creds) = creds_c {
        registrar_log("=== Detección LCU COMPLETADA con Éxito (Método C: Rutas Comunes) ===");
        return LcuDetectionReport {
            success: true,
            credentials: Some(creds.clone()),
            successful_step: Some(paso_c.name),
            steps: pasos,
            is_permission_error,
            log_file_path: ruta_log,
            conectado: true,
            lockfile: Some(creds),
            mensaje: "Lockfile detectado en rutas comunes del sistema.".to_string(),
        };
    }

    // 4. Método D: Ruta manual configurada por el usuario
    let (paso_d, creds_d) = detectar_por_ruta_manual(ruta_manual);
    pasos.push(paso_d.clone());
    if let Some(creds) = creds_d {
        registrar_log("=== Detección LCU COMPLETADA con Éxito (Método D: Ruta Manual) ===");
        return LcuDetectionReport {
            success: true,
            credentials: Some(creds.clone()),
            successful_step: Some(paso_d.name),
            steps: pasos,
            is_permission_error,
            log_file_path: ruta_log,
            conectado: true,
            lockfile: Some(creds),
            mensaje: "Lockfile detectado en ruta manual configurada.".to_string(),
        };
    }

    registrar_log("=== Fin de detección: League of Legends no detectado por ningún método ===");

    LcuDetectionReport {
        success: false,
        credentials: None,
        successful_step: None,
        steps: pasos,
        is_permission_error,
        log_file_path: ruta_log,
        conectado: false,
        lockfile: None,
        mensaje: if is_permission_error {
            "Proceso detectado pero el acceso fue bloqueado por permisos de Windows.".to_string()
        } else {
            "No se detectó League of Legends en ejecución.".to_string()
        },
    }
}

/// Función de conveniencia retrocompatible que ejecuta la detección y devuelve solo las credenciales
pub fn detectar_lockfile(ruta_manual: Option<&str>) -> Option<LcuCredentials> {
    let reporte = ejecutar_deteccion_lcu(ruta_manual);
    reporte.credentials
}

// ==========================================
// Pruebas Unitarias en Rust
// ==========================================

#[cfg(test)]
mod tests {
    use super::*;

    const CONTENIDO_LOCKFILE_VALIDO: &str = "LeagueClientUx:8724:54321:aBcD-1234_secreto:https";

    #[test]
    fn test_parsear_lockfile_valido() {
        let creds = parsear_lockfile(CONTENIDO_LOCKFILE_VALIDO).expect("Debe parsear lockfile válido");
        assert_eq!(creds.process_name, "LeagueClientUx");
        assert_eq!(creds.pid, 8724);
        assert_eq!(creds.port, 54321);
        assert_eq!(creds.password, "aBcD-1234_secreto");
        assert_eq!(creds.protocol, "https");
        assert_eq!(creds.token_base64, construir_token_base64("aBcD-1234_secreto"));
    }

    #[test]
    fn test_parsear_lockfile_con_espacios_y_saltos() {
        let contenido = format!("  {}\n", CONTENIDO_LOCKFILE_VALIDO);
        let creds = parsear_lockfile(&contenido).expect("Debe tolerar espacios");
        assert_eq!(creds.port, 54321);
        assert_eq!(creds.password, "aBcD-1234_secreto");
    }

    #[test]
    fn test_parsear_lockfile_invalido() {
        assert!(parsear_lockfile("LeagueClientUx:8724:54321:https").is_none());
        assert!(parsear_lockfile("LeagueClientUx:8724:54321:clave:https:extra").is_none());
        assert!(parsear_lockfile("").is_none());
        assert!(parsear_lockfile("LeagueClientUx:cero:54321:clave:https").is_none());
        assert!(parsear_lockfile("LeagueClientUx:0:54321:clave:https").is_none());
        assert!(parsear_lockfile("LeagueClientUx:8724:0:clave:https").is_none());
        assert!(parsear_lockfile("LeagueClientUx:8724:54321::https").is_none());
        assert!(parsear_lockfile("LeagueClientUx:8724:54321:clave:").is_none());
    }

    #[test]
    fn test_extraer_credenciales_de_command_line_real() {
        let command_line = r#""C:/Riot Games/League of Legends/LeagueClientUx.exe" "--riotclient-auth-token=JPvIC-qeXgTqe7sQXehFJA" "--riotclient-app-port=51987" "--remoting-auth-token=FNlzk8_f_Llg0ex_ONxtkQ" "--app-port=52214" "--install-directory=C:\Riot Games\League of Legends" "--app-pid=5856""#;

        let (creds_opt, install_dir) = extraer_credenciales_de_command_line(command_line);
        let creds = creds_opt.expect("Debe extraer credenciales de commandline real");

        assert_eq!(creds.port, 52214);
        assert_eq!(creds.password, "FNlzk8_f_Llg0ex_ONxtkQ");
        assert_eq!(creds.pid, 5856);
        assert_eq!(creds.token_base64, construir_token_base64("FNlzk8_f_Llg0ex_ONxtkQ"));
        assert_eq!(install_dir.as_deref(), Some(r"C:\Riot Games\League of Legends"));
    }

    #[test]
    fn test_extraer_credenciales_sin_comillas() {
        let command_line = r#"LeagueClientUx.exe --app-port=55123 --remoting-auth-token=abc123token_XYZ --app-pid=9999 --install-directory=D:\Games\LoL"#;

        let (creds_opt, install_dir) = extraer_credenciales_de_command_line(command_line);
        let creds = creds_opt.expect("Debe soportar argumentos sin comillas");

        assert_eq!(creds.port, 55123);
        assert_eq!(creds.password, "abc123token_XYZ");
        assert_eq!(creds.pid, 9999);
        assert_eq!(install_dir.as_deref(), Some(r"D:\Games\LoL"));
    }

    #[test]
    fn test_extraer_credenciales_incompletas() {
        let sin_puerto = "LeagueClientUx.exe --remoting-auth-token=tokenSolitario --app-pid=123";
        assert!(extraer_credenciales_de_command_line(sin_puerto).0.is_none());

        let sin_token = "LeagueClientUx.exe --app-port=12345 --app-pid=123";
        assert!(extraer_credenciales_de_command_line(sin_token).0.is_none());

        let vacio = "";
        assert!(extraer_credenciales_de_command_line(vacio).0.is_none());
    }

    #[test]
    fn test_detectar_por_ruta_manual_inexistente() {
        let (paso, creds) = detectar_por_ruta_manual(Some(r"C:\RutaFantasmaInexistente"));
        assert!(creds.is_none());
        assert!(!paso.success);
    }
}
