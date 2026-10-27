/**
 * src-tauri/src/lcu/websocket_lcu.rs
 * Cliente WebSocket WAMP (WSS) para la LCU API de League of Legends.
 *
 * Se conecta a `wss://127.0.0.1:{puerto}/` con Basic Auth y certificado local autofirmado,
 * se suscribe a `[5, "OnJsonApiEvent"]` y retransmite eventos en vivo hacia el frontend React
 * a través de `app_handle.emit()`, además de coordinar las acciones con los servicios Rust
 * (AutoAcceptService, ChampSelectService y detección de modo).
 */

use super::cliente_lcu::ClienteLcu;
use super::detector_lcu::registrar_log;
use super::modo_lcu::{detectar_modo_en_lcu, detectar_modo_por_sesion};
use crate::overlay::GestorOverlay;
use crate::servicios::auto_accept::AutoAcceptService;
use crate::servicios::champ_select::ChampSelectService;
use futures_util::{SinkExt, StreamExt};
use native_tls::TlsConnector;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio_tungstenite::tungstenite::http::Request;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::Connector;

pub const EVENTO_GLOBAL_LCU: &str = "OnJsonApiEvent";

pub fn iniciar_tarea_websocket_lcu(
    app_handle: AppHandle,
    cliente_lcu: ClienteLcu,
    gestor_overlay: GestorOverlay,
    auto_accept: Arc<AutoAcceptService>,
    champ_select: Arc<ChampSelectService>,
) {
    tauri::async_runtime::spawn(async move {
        registrar_log("[WebSocket LCU] Iniciando ciclo de supervisión de eventos...");
        let mut intentos = 0;

        loop {
            let credenciales_opt = cliente_lcu.obtener_credenciales().await;
            if credenciales_opt.is_none() {
                tokio::time::sleep(Duration::from_millis(1500)).await;
                continue;
            }

            let creds = credenciales_opt.unwrap();
            let url = format!("wss://127.0.0.1:{}/", creds.port);
            registrar_log(&format!(
                "[WebSocket LCU] Intentando conectar a {} (Intento #{})...",
                url,
                intentos + 1
            ));

            let tls_builder = match TlsConnector::builder().danger_accept_invalid_certs(true).build() {
                Ok(t) => t,
                Err(e) => {
                    registrar_log(&format!("[WebSocket LCU ERROR] Fallo al crear TlsConnector: {}", e));
                    tokio::time::sleep(Duration::from_secs(3)).await;
                    continue;
                }
            };

            let connector = Connector::NativeTls(tls_builder);

            let auth_header = if creds.token_base64.starts_with("Basic ") {
                creds.token_base64.clone()
            } else {
                format!("Basic {}", creds.token_base64)
            };

            let req_res = Request::builder()
                .uri(&url)
                .header("Authorization", &auth_header)
                .header("Host", format!("127.0.0.1:{}", creds.port))
                .header("Connection", "Upgrade")
                .header("Upgrade", "websocket")
                .header("Sec-WebSocket-Version", "13")
                .header(
                    "Sec-WebSocket-Key",
                    tokio_tungstenite::tungstenite::handshake::client::generate_key(),
                )
                .body(());

            let request = match req_res {
                Ok(r) => r,
                Err(e) => {
                    registrar_log(&format!("[WebSocket LCU ERROR] Fallo al construir HTTP Request: {}", e));
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    continue;
                }
            };

            match tokio_tungstenite::connect_async_tls_with_config(request, None, false, Some(connector)).await {
                Ok((mut ws_stream, _)) => {
                    intentos = 0;
                    registrar_log(&format!("[WebSocket LCU OPEN] Conectado exitosamente en {}", url));
                    cliente_lcu.set_ws_conectado(true).await;
                    let _ = app_handle.emit("lcu:state-changed", "connected");

                    // Refrescar el modo de juego inmediatamente tras conectar
                    let cl_init = cliente_lcu.clone();
                    let go_init = gestor_overlay.clone();
                    let h_init = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Some(m) = detectar_modo_en_lcu(&cl_init).await {
                            cl_init.actualizar_modo(Some(m.clone())).await;
                            go_init.set_modo(&m);
                            let _ = h_init.emit("lcu:game-mode-changed", &m);
                        }
                    });

                    // Enviar suscripción a OnJsonApiEvent: [5, "OnJsonApiEvent"]
                    let sub = serde_json::json!([5, EVENTO_GLOBAL_LCU]).to_string();
                    if let Err(e) = ws_stream.send(Message::Text(sub)).await {
                        registrar_log(&format!("[WebSocket LCU ERROR] Fallo al enviar suscripción: {}", e));
                    } else {
                        registrar_log("[WebSocket LCU] Suscripción enviada: [5, \"OnJsonApiEvent\"]");
                    }

                    // Bucle de lectura de frames
                    while let Some(msg_res) = ws_stream.next().await {
                        match msg_res {
                            Ok(Message::Text(txt)) => {
                                procesar_frame_wamp(
                                    &txt,
                                    &app_handle,
                                    &cliente_lcu,
                                    &gestor_overlay,
                                    &auto_accept,
                                    &champ_select,
                                )
                                .await;
                            }
                            Ok(Message::Close(frame)) => {
                                registrar_log(&format!("[WebSocket LCU CLOSE] Cierre recibido: {:?}", frame));
                                break;
                            }
                            Ok(Message::Ping(p)) => {
                                let _ = ws_stream.send(Message::Pong(p)).await;
                            }
                            Err(e) => {
                                registrar_log(&format!("[WebSocket LCU ERROR] Error en stream: {}", e));
                                break;
                            }
                            _ => {}
                        }
                    }

                    registrar_log("[WebSocket LCU] Conexión cerrada. Emitiendo estado 'disconnected'...");
                    cliente_lcu.set_ws_conectado(false).await;
                    let _ = app_handle.emit("lcu:state-changed", "disconnected");
                }
                Err(e) => {
                    intentos += 1;
                    registrar_log(&format!("[WebSocket LCU ERROR] Fallo en handshake: {}", e));
                    cliente_lcu.set_ws_conectado(false).await;
                    tokio::time::sleep(Duration::from_millis(2000)).await;
                }
            }
        }
    });
}

async fn procesar_frame_wamp(
    texto: &str,
    app_handle: &AppHandle,
    cliente_lcu: &ClienteLcu,
    gestor_overlay: &GestorOverlay,
    auto_accept: &Arc<AutoAcceptService>,
    champ_select: &Arc<ChampSelectService>,
) {
    let valor: serde_json::Value = match serde_json::from_str(texto) {
        Ok(v) => v,
        Err(_) => return,
    };

    let arr = match valor.as_array() {
        Some(a) if a.len() >= 3 => a,
        _ => return,
    };

    let codigo = arr[0].as_i64().unwrap_or(0);
    let nombre_evento = arr[1].as_str().unwrap_or("");

    if codigo != 8 || nombre_evento != EVENTO_GLOBAL_LCU {
        return;
    }

    let carga = match arr[2].as_object() {
        Some(c) => c,
        _ => return,
    };

    let uri = carga.get("uri").and_then(|u| u.as_str()).unwrap_or("");
    let data = carga.get("data").unwrap_or(&serde_json::Value::Null);

    match uri {
        "/lol-gameflow/v1/gameflow-phase" => {
            if let Some(fase) = data.as_str() {
                cliente_lcu.actualizar_fase(fase).await;
                let _ = app_handle.emit("lcu:gameflow-changed", fase);

                // Refrescar modo de juego al entrar en Lobby, ChampSelect o InProgress
                if matches!(fase, "Lobby" | "Matchmaking" | "ReadyCheck" | "ChampSelect" | "InProgress") {
                    let cl = cliente_lcu.clone();
                    let go = gestor_overlay.clone();
                    let h = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Some(m) = detectar_modo_en_lcu(&cl).await {
                            cl.actualizar_modo(Some(m.clone())).await;
                            go.set_modo(&m);
                            let _ = h.emit("lcu:game-mode-changed", &m);
                        }
                    });
                }

                if fase == "None" || fase == "Lobby" {
                    auto_accept.reiniciar_ciclo().await;
                    champ_select.reiniciar_estado().await;
                }
            }
        }
        "/lol-gameflow/v1/session" => {
            if let Some(modo) = detectar_modo_por_sesion(data) {
                cliente_lcu.actualizar_modo(Some(modo.clone())).await;
                gestor_overlay.set_modo(&modo);
                let _ = app_handle.emit("lcu:game-mode-changed", &modo);
            }
        }
        "/lol-matchmaking/v1/ready-check" => {
            auto_accept.procesar_ready_check(Some(data)).await;
            let _ = app_handle.emit("lcu:ready-check", data);
        }
        "/lol-champ-select/v1/session" => {
            if data.is_null() {
                champ_select.encolar_sesion(None).await;
            } else {
                champ_select.encolar_sesion(Some(data.clone())).await;
            }
            let _ = app_handle.emit("lcu:champ-select-session", data);
        }
        _ => {}
    }
}
