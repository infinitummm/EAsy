/**
 * src-tauri/src/servicios/auto_accept.rs
 * Servicio de Auto-Accept para League of Legends en Rust / Tauri v2.
 *
 * Escucha eventos WebSocket de `/lol-matchmaking/v1/ready-check`, cuenta con
 * un polling HTTP de respaldo (1s) durante fases Matchmaking y ReadyCheck,
 * y aplica el retardo configurado (0-8 s) con fluctuación humana (±500 ms).
 */

use super::gestor_ajustes::GestorAjustes;
use crate::lcu::cliente_lcu::ClienteLcu;
use crate::lcu::registro::registrar_automatizacion;
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::{oneshot, Mutex, RwLock};

#[derive(Clone)]
pub struct AutoAcceptService {
    gestor_ajustes: Arc<GestorAjustes>,
    cliente_lcu: ClienteLcu,
    app_handle: AppHandle,
    hay_pendiente: Arc<RwLock<bool>>,
    aceptacion_enviada: Arc<RwLock<bool>>,
    ultima_accion: Arc<RwLock<String>>,
    ultimo_timestamp: Arc<RwLock<u64>>,
    cancelador_actual: Arc<Mutex<Option<oneshot::Sender<()>>>>,
}

impl AutoAcceptService {
    pub fn nuevo(
        gestor_ajustes: Arc<GestorAjustes>,
        cliente_lcu: ClienteLcu,
        app_handle: AppHandle,
    ) -> Self {
        Self {
            gestor_ajustes,
            cliente_lcu,
            app_handle,
            hay_pendiente: Arc::new(RwLock::new(false)),
            aceptacion_enviada: Arc::new(RwLock::new(false)),
            ultima_accion: Arc::new(RwLock::new("ninguna".to_string())),
            ultimo_timestamp: Arc::new(RwLock::new(0)),
            cancelador_actual: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn obtener_estado(&self) -> Value {
        let ajustes = self.gestor_ajustes.obtener().await;
        let fase = self.cliente_lcu.obtener_fase_actual().await;
        let conectado = self.cliente_lcu.esta_conectado().await;
        let pendiente = *self.hay_pendiente.read().await;
        let ultima = self.ultima_accion.read().await.clone();
        let ts = *self.ultimo_timestamp.read().await;

        serde_json::json!({
            "enabled": ajustes.auto_accept.enabled,
            "delaySeconds": ajustes.auto_accept.delay_seconds,
            "humanVariance": ajustes.auto_accept.human_variance,
            "phase": fase,
            "connected": conectado,
            "pollingActivo": matches!(fase.as_str(), "Matchmaking" | "ReadyCheck"),
            "aceptacionPendiente": pendiente,
            "lastAction": ultima,
            "lastActionTimestamp": ts
        })
    }

    pub async fn emitir_estado(&self) {
        let estado = self.obtener_estado().await;
        let _ = self.app_handle.emit("lcu:auto-accept-status", estado);
    }

    pub async fn cancelar_pendiente(&self) {
        let mut lock = self.cancelador_actual.lock().await;
        if let Some(tx) = lock.take() {
            let _ = tx.send(());
        }
        *self.hay_pendiente.write().await = false;
    }

    pub async fn reiniciar_ciclo(&self) {
        self.cancelar_pendiente().await;
        *self.aceptacion_enviada.write().await = false;
    }

    pub async fn procesar_ready_check(&self, ready_check: Option<&Value>) {
        let evento = match ready_check {
            Some(v) if !v.is_null() => v,
            _ => {
                self.reiniciar_ciclo().await;
                return;
            }
        };

        let ajustes = self.gestor_ajustes.obtener().await;
        if !ajustes.auto_accept.enabled {
            registrar_automatizacion("[AutoAccept] Evento ReadyCheck detectado, pero autoAccept está DESHABILITADO en ajustes.");
            self.reiniciar_ciclo().await;
            return;
        }

        let state = evento.get("state").and_then(|s| s.as_str()).unwrap_or("");
        let player_response = evento.get("playerResponse").and_then(|r| r.as_str()).unwrap_or("");

        if state == "InProgress" && player_response == "None" {
            let pendiente = *self.hay_pendiente.read().await;
            let ya_enviado = *self.aceptacion_enviada.write().await;

            if !pendiente && !ya_enviado {
                self.programar_aceptacion(ajustes.auto_accept.delay_seconds, ajustes.auto_accept.human_variance).await;
            }
            return;
        }

        // Cualquier otro estado (EveryoneReady, StrangerNotReady o ya Accepted)
        self.reiniciar_ciclo().await;
    }

    async fn programar_aceptacion(&self, delay_base_secs: f64, varianza: bool) {
        let delay_norm = delay_base_secs.clamp(0.0, 8.0);
        let base_ms = (delay_norm * 1000.0) as i64;

        let fluctuacion_ms = if varianza {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .subsec_nanos();
            let ratio = ((nanos % 1000) as f64) / 1000.0;
            (ratio * 1000.0 - 500.0) as i64 // [-500 ms, +500 ms]
        } else {
            0
        };

        let total_ms = (base_ms + fluctuacion_ms).max(0) as u64;

        *self.hay_pendiente.write().await = true;
        *self.ultima_accion.write().await = "Ready check detectado".to_string();
        *self.ultimo_timestamp.write().await = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        registrar_automatizacion(&format!(
            "[AutoAccept] ReadyCheck EN CURSO: Programando clic en {} ms (base: {:.1}s, varianza: {})...",
            total_ms, delay_norm, varianza
        ));

        self.emitir_estado().await;

        let (tx, mut rx) = oneshot::channel::<()>();
        {
            let mut lock = self.cancelador_actual.lock().await;
            *lock = Some(tx);
        }

        let cl = self.cliente_lcu.clone();
        let app = self.app_handle.clone();
        let pendiente_flag = self.hay_pendiente.clone();
        let enviada_flag = self.aceptacion_enviada.clone();
        let accion_flag = self.ultima_accion.clone();
        let ts_flag = self.ultimo_timestamp.clone();
        let servicio = self.clone();

        tauri::async_runtime::spawn(async move {
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_millis(total_ms)) => {
                    *pendiente_flag.write().await = false;
                    *enviada_flag.write().await = true;

                    registrar_automatizacion("[AutoAccept] Enviando POST /lol-matchmaking/v1/ready-check/accept...");
                    match cl.post_vacio("/lol-matchmaking/v1/ready-check/accept", None::<&()>).await {
                        Ok(_) => {
                            registrar_automatizacion("[AutoAccept] ¡Partida ACEPTADA exitosamente en LCU!");
                            *accion_flag.write().await = "Partida aceptada".to_string();
                            *ts_flag.write().await = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis() as u64;

                            let _ = app.emit("lcu:ready-check-accepted", ());
                            servicio.emitir_estado().await;
                        }
                        Err(e) => {
                            registrar_automatizacion(&format!("[AutoAccept ERROR] Fallo al aceptar partida en LCU: {}", e));
                            *enviada_flag.write().await = false;
                            servicio.emitir_estado().await;
                        }
                    }
                }
                _ = &mut rx => {
                    registrar_automatizacion("[AutoAccept] Temporizador de aceptación cancelado.");
                    *pendiente_flag.write().await = false;
                    servicio.emitir_estado().await;
                }
            }
        });
    }

    /// Inicia la tarea en segundo plano con el sondeo HTTP de 1s de respaldo
    pub fn iniciar_tarea_sondeo(&self) {
        let servicio = self.clone();
        let cl = self.cliente_lcu.clone();

        tauri::async_runtime::spawn(async move {
            registrar_automatizacion("[AutoAccept] Tarea de sondeo y supervisión de ReadyCheck iniciada.");
            loop {
                tokio::time::sleep(Duration::from_millis(1000)).await;

                if !cl.esta_conectado().await {
                    continue;
                }

                let fase = cl.obtener_fase_actual().await;
                if matches!(fase.as_str(), "Matchmaking" | "ReadyCheck") {
                    match cl.get_json::<Value>("/lol-matchmaking/v1/ready-check").await {
                        Ok(rc) => {
                            servicio.procesar_ready_check(Some(&rc)).await;
                        }
                        Err(_) => {
                            // Si da 404 es porque no hay ready-check activo
                            servicio.procesar_ready_check(None).await;
                        }
                    }
                }
            }
        });
    }
}
