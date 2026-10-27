/**
 * src-tauri/src/lcu/cliente_lcu.rs
 * Cliente HTTP y gestor de estado de conexión con la LCU API de League of Legends.
 *
 * Soporta métodos GET, POST, PATCH, PUT y DELETE nativos, tolerando respuestas 204 No Content
 * y cuerpos vacíos sin lanzar errores de deserialización.
 */

use super::detector_lcu::{registrar_log, LcuCredentials};
use super::registro::registrar_automatizacion;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
use reqwest::Client;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct ClienteLcu {
    cliente_http: Client,
    credenciales: Arc<RwLock<Option<LcuCredentials>>>,
    fase_actual: Arc<RwLock<String>>,
    ws_conectado: Arc<RwLock<bool>>,
    fallos_consecutivos: Arc<RwLock<u32>>,
    error_permisos: Arc<RwLock<bool>>,
    ultimo_error: Arc<RwLock<Option<String>>>,
    modo_actual: Arc<RwLock<Option<String>>>,
}

impl ClienteLcu {
    pub fn nuevo() -> Self {
        let cliente_http = Client::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            cliente_http,
            credenciales: Arc::new(RwLock::new(None)),
            fase_actual: Arc::new(RwLock::new("None".to_string())),
            ws_conectado: Arc::new(RwLock::new(false)),
            fallos_consecutivos: Arc::new(RwLock::new(0)),
            error_permisos: Arc::new(RwLock::new(false)),
            ultimo_error: Arc::new(RwLock::new(None)),
            modo_actual: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn actualizar_credenciales(&self, creds: Option<LcuCredentials>) {
        let mut lock = self.credenciales.write().await;
        *lock = creds;
        if lock.is_none() {
            *self.ws_conectado.write().await = false;
            *self.fase_actual.write().await = "None".to_string();
            *self.modo_actual.write().await = None;
        } else {
            *self.fallos_consecutivos.write().await = 0;
            *self.error_permisos.write().await = false;
        }
    }

    // Compatibilidad retroactiva con actualizar_lockfile
    pub async fn actualizar_lockfile(&self, info: Option<LcuCredentials>) {
        self.actualizar_credenciales(info).await;
    }

    pub async fn obtener_credenciales(&self) -> Option<LcuCredentials> {
        self.credenciales.read().await.clone()
    }

    // Compatibilidad retroactiva con obtener_info_lockfile
    pub async fn obtener_info_lockfile(&self) -> Option<LcuCredentials> {
        self.obtener_credenciales().await
    }

    pub async fn esta_conectado(&self) -> bool {
        self.credenciales.read().await.is_some()
    }

    pub async fn set_ws_conectado(&self, conectado: bool) {
        *self.ws_conectado.write().await = conectado;
    }

    pub async fn is_ws_conectado(&self) -> bool {
        *self.ws_conectado.read().await
    }

    pub async fn set_error_permisos(&self, permiso: bool) {
        *self.error_permisos.write().await = permiso;
    }

    pub async fn actualizar_fase(&self, fase: &str) {
        *self.fase_actual.write().await = fase.to_string();
    }

    pub async fn obtener_fase_actual(&self) -> String {
        self.fase_actual.read().await.clone()
    }

    pub async fn actualizar_modo(&self, modo: Option<String>) {
        *self.modo_actual.write().await = modo;
    }

    pub async fn obtener_modo_actual(&self) -> Option<String> {
        self.modo_actual.read().await.clone()
    }

    /// Valida la conexión activa realizando un GET a `/lol-gameflow/v1/gameflow-phase`.
    /// Si falla 3 veces consecutivas, invalida automáticamente las credenciales.
    pub async fn validar_conexion(&self) -> Result<String, String> {
        match self.get_json::<String>("/lol-gameflow/v1/gameflow-phase").await {
            Ok(fase) => {
                *self.fallos_consecutivos.write().await = 0;
                *self.fase_actual.write().await = fase.clone();
                *self.ultimo_error.write().await = None;
                Ok(fase)
            }
            Err(e) => {
                let mut fallos = self.fallos_consecutivos.write().await;
                *fallos += 1;
                *self.ultimo_error.write().await = Some(e.clone());
                registrar_log(&format!(
                    "[ClienteLcu] Fallo de validación HTTP ({}/3): {}",
                    *fallos, e
                ));

                if *fallos >= 3 {
                    registrar_log("[ClienteLcu] 3 fallos consecutivos en validación. Invalidando credenciales LCU para provocar nueva detección...");
                    drop(fallos);
                    self.actualizar_credenciales(None).await;
                }
                Err(e)
            }
        }
    }

    pub async fn obtener_fase_partida(&self) -> Result<String, String> {
        self.validar_conexion().await
    }

    pub async fn obtener_estado_info(&self) -> serde_json::Value {
        let conectado = self.esta_conectado().await;
        let fase = self.obtener_fase_actual().await;
        let port = self.obtener_credenciales().await.map(|c| c.port);
        let error_permisos = *self.error_permisos.read().await;
        let ultimo_err = self.ultimo_error.read().await.clone();
        let modo = self.modo_actual.read().await.clone();

        serde_json::json!({
            "state": if conectado { "connected" } else { "disconnected" },
            "gameflow": fase,
            "isPermissionError": error_permisos,
            "port": port,
            "lastError": ultimo_err,
            "connected": conectado,
            "phase": fase,
            "gameMode": modo
        })
    }

    /// Ejecuta una petición HTTP genérica capturando código de estado y cuerpo de error
    pub async fn request_raw(
        &self,
        metodo: reqwest::Method,
        endpoint: &str,
        cuerpo: Option<&serde_json::Value>,
    ) -> Result<reqwest::Response, String> {
        let creds = self
            .credenciales
            .read()
            .await
            .clone()
            .ok_or_else(|| "LCU no conectado (sin credenciales activas)".to_string())?;

        let url = format!("https://127.0.0.1:{}{}", creds.port, endpoint);
        let auth_val = if creds.token_base64.starts_with("Basic ") {
            creds.token_base64.clone()
        } else {
            format!("Basic {}", creds.token_base64)
        };

        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&auth_val).map_err(|e| e.to_string())?,
        );

        let mut builder = self.cliente_http.request(metodo.clone(), &url).headers(headers);
        if let Some(c) = cuerpo {
            builder = builder.json(c);
        }

        let res = builder.send().await.map_err(|e| {
            let msg = format!("Fallo de red LCU {} {}: {}", metodo, endpoint, e);
            registrar_automatizacion(&msg);
            msg
        })?;

        if !res.status().is_success() {
            let status = res.status();
            let error_body = res.text().await.unwrap_or_default();
            let msg = format!(
                "LCU HTTP Error {} en {} {}: {}",
                status, metodo, endpoint, error_body
            );
            registrar_automatizacion(&msg);
            return Err(msg);
        }

        Ok(res)
    }

    /// Ejecuta una petición que puede retornar 204 No Content o un cuerpo vacío
    pub async fn request_vacio(
        &self,
        metodo: reqwest::Method,
        endpoint: &str,
        cuerpo: Option<&serde_json::Value>,
    ) -> Result<(), String> {
        let _ = self.request_raw(metodo, endpoint, cuerpo).await?;
        Ok(())
    }

    /// GET esperando deserialización JSON
    pub async fn get_json<T: serde::de::DeserializeOwned>(&self, endpoint: &str) -> Result<T, String> {
        let res = self.request_raw(reqwest::Method::GET, endpoint, None).await?;
        res.json::<T>()
            .await
            .map_err(|e| format!("Fallo al deserializar respuesta LCU {}: {}", endpoint, e))
    }

    /// POST esperando deserialización JSON
    pub async fn post_json<B: serde::Serialize, T: serde::de::DeserializeOwned>(
        &self,
        endpoint: &str,
        cuerpo: &B,
    ) -> Result<T, String> {
        let val = serde_json::to_value(cuerpo).map_err(|e| e.to_string())?;
        let res = self.request_raw(reqwest::Method::POST, endpoint, Some(&val)).await?;
        res.json::<T>()
            .await
            .map_err(|e| format!("Fallo al deserializar respuesta LCU {}: {}", endpoint, e))
    }

    /// POST tolerando 204 No Content o cuerpo vacío
    pub async fn post_vacio<B: serde::Serialize>(
        &self,
        endpoint: &str,
        cuerpo: Option<&B>,
    ) -> Result<(), String> {
        let val = match cuerpo {
            Some(c) => Some(serde_json::to_value(c).map_err(|e| e.to_string())?),
            None => None,
        };
        self.request_vacio(reqwest::Method::POST, endpoint, val.as_ref()).await
    }

    /// PATCH tolerando 204 No Content o cuerpo vacío
    pub async fn patch_vacio<B: serde::Serialize>(
        &self,
        endpoint: &str,
        cuerpo: &B,
    ) -> Result<(), String> {
        let val = serde_json::to_value(cuerpo).map_err(|e| e.to_string())?;
        self.request_vacio(reqwest::Method::PATCH, endpoint, Some(&val)).await
    }

    /// PUT tolerando 204 No Content o cuerpo vacío
    pub async fn put_vacio<B: serde::Serialize>(
        &self,
        endpoint: &str,
        cuerpo: &B,
    ) -> Result<(), String> {
        let val = serde_json::to_value(cuerpo).map_err(|e| e.to_string())?;
        self.request_vacio(reqwest::Method::PUT, endpoint, Some(&val)).await
    }

    /// PUT esperando deserialización JSON
    pub async fn put_json<B: serde::Serialize, T: serde::de::DeserializeOwned>(
        &self,
        endpoint: &str,
        cuerpo: &B,
    ) -> Result<T, String> {
        let val = serde_json::to_value(cuerpo).map_err(|e| e.to_string())?;
        let res = self.request_raw(reqwest::Method::PUT, endpoint, Some(&val)).await?;
        res.json::<T>()
            .await
            .map_err(|e| format!("Fallo al deserializar respuesta LCU {}: {}", endpoint, e))
    }

    /// DELETE tolerando 204 No Content o cuerpo vacío
    pub async fn delete_vacio(&self, endpoint: &str) -> Result<(), String> {
        self.request_vacio(reqwest::Method::DELETE, endpoint, None).await
    }

    /// GET con reintentos para 404 transitorios (e.g. cambios de fase rápidos)
    pub async fn get_con_reintento_404<T: serde::de::DeserializeOwned>(
        &self,
        endpoint: &str,
        max_reintentos: u32,
        espera_ms: u64,
    ) -> Result<Option<T>, String> {
        for i in 0..max_reintentos {
            match self.get_json::<T>(endpoint).await {
                Ok(v) => return Ok(Some(v)),
                Err(e) => {
                    if e.contains("404") {
                        if i + 1 < max_reintentos {
                            tokio::time::sleep(std::time::Duration::from_millis(espera_ms)).await;
                            continue;
                        } else {
                            return Ok(None);
                        }
                    }
                    return Err(e);
                }
            }
        }
        Ok(None)
    }
}
