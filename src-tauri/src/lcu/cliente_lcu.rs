/**
 * src-tauri/src/lcu/cliente_lcu.rs
 * Cliente HTTP y gestor de estado de conexión con la LCU API de League of Legends.
 *
 * Utiliza certificados locales tolerantes para 127.0.0.1 y maneja la máquina de estados:
 * Desconectado -> Detectando -> Conectado -> Reconectando.
 */

use super::detector_lcu::{registrar_log, LcuCredentials};
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
        }
    }

    pub async fn actualizar_credenciales(&self, creds: Option<LcuCredentials>) {
        let mut lock = self.credenciales.write().await;
        *lock = creds;
        if lock.is_none() {
            *self.ws_conectado.write().await = false;
            *self.fase_actual.write().await = "None".to_string();
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

        serde_json::json!({
            "state": if conectado { "connected" } else { "disconnected" },
            "gameflow": fase,
            "isPermissionError": error_permisos,
            "port": port,
            "lastError": ultimo_err,
            "connected": conectado,
            "phase": fase,
            "gameMode": null
        })
    }

    pub async fn get_json<T: serde::de::DeserializeOwned>(&self, endpoint: &str) -> Result<T, String> {
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

        let res = self
            .cliente_http
            .get(&url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| format!("Fallo HTTP LCU GET: {}", e))?;

        if !res.status().is_success() {
            return Err(format!("LCU HTTP Error {}: {}", res.status(), url));
        }

        res.json::<T>()
            .await
            .map_err(|e| format!("Fallo al deserializar respuesta LCU: {}", e))
    }

    pub async fn post_json<B: serde::Serialize, T: serde::de::DeserializeOwned>(
        &self,
        endpoint: &str,
        cuerpo: &B,
    ) -> Result<T, String> {
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

        let res = self
            .cliente_http
            .post(&url)
            .headers(headers)
            .json(cuerpo)
            .send()
            .await
            .map_err(|e| format!("Fallo HTTP LCU POST: {}", e))?;

        if !res.status().is_success() {
            return Err(format!("LCU HTTP Error {}: {}", res.status(), url));
        }

        res.json::<T>()
            .await
            .map_err(|e| format!("Fallo al deserializar respuesta LCU: {}", e))
    }
}
