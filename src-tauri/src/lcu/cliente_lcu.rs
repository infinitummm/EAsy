/**
 * src-tauri/src/lcu/cliente_lcu.rs
 * Cliente HTTP asíncrono para la API de League Client Ux (LCU).
 * Utiliza certificados autofirmados locales de Riot mediante `danger_accept_invalid_certs(true)`.
 */

use super::detector_lcu::InfoLockfile;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
use reqwest::Client;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct ClienteLcu {
    cliente_http: Client,
    info_lockfile: Arc<RwLock<Option<InfoLockfile>>>,
}

impl ClienteLcu {
    pub fn nuevo() -> Self {
        let cliente_http = Client::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            cliente_http,
            info_lockfile: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn actualizar_lockfile(&self, info: Option<InfoLockfile>) {
        let mut lock = self.info_lockfile.write().await;
        *lock = info;
    }

    pub async fn esta_conectado(&self) -> bool {
        self.info_lockfile.read().await.is_some()
    }

    pub async fn obtener_info_lockfile(&self) -> Option<InfoLockfile> {
        self.info_lockfile.read().await.clone()
    }

    pub async fn get_json<T: serde::de::DeserializeOwned>(&self, endpoint: &str) -> Result<T, String> {
        let info = self
            .info_lockfile
            .read()
            .await
            .clone()
            .ok_or_else(|| "LCU no conectado (sin lockfile)".to_string())?;

        let url = format!("https://127.0.0.1:{}{}", info.puerto, endpoint);
        let auth_val = format!("Basic {}", info.token_auth_base64);

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
        let info = self
            .info_lockfile
            .read()
            .await
            .clone()
            .ok_or_else(|| "LCU no conectado (sin lockfile)".to_string())?;

        let url = format!("https://127.0.0.1:{}{}", info.puerto, endpoint);
        let auth_val = format!("Basic {}", info.token_auth_base64);

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

    /// Obtiene la fase actual del flujo de partida
    pub async fn obtener_fase_partida(&self) -> Result<String, String> {
        let fase: String = self.get_json("/lol-gameflow/v1/gameflow-phase").await?;
        Ok(fase)
    }
}
