use std::fs;
use std::io::Write;
use std::path::PathBuf;

/// Registra trazas de automatización en consola y en el archivo %APPDATA%\EAsy\automatizacion.log
pub fn registrar_automatizacion(mensaje: &str) {
    let duracion = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duracion.as_secs();
    let linea = format!("[Timestamp: {}] {}\n", secs, mensaje);

    println!("[AUTOMATIZACION] {}", mensaje);

    if let Ok(app_data) = std::env::var("APPDATA") {
        for sub in &["proyecto-itero", "EAsy"] {
            let dir = PathBuf::from(&app_data).join(sub);
            let _ = fs::create_dir_all(&dir);
            let ruta_archivo = dir.join("automatizacion.log");
            if let Ok(mut archivo) = fs::OpenOptions::new().create(true).append(true).open(ruta_archivo) {
                let _ = archivo.write_all(linea.as_bytes());
            }
        }
    }
}
