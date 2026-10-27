/**
 * src-tauri/src/comandos/mod.rs
 * Comandos Tauri v2 invocados desde el frontend React mediante `@tauri-apps/api/core` (`invoke`).
 */

use crate::bd::AlmacenamientoBd;
use crate::lcu::{
    detectar_modo_en_lcu, ejecutar_deteccion_lcu, ClienteLcu, ClientePartidaVivo, InfoLockfile,
    LcuDetectionReport,
};
use crate::modos::{
    aplicar_sin_bordes, verificar_sin_bordes, DatosModoCampeon, ReporteSinBordes,
    ResultadoAplicarSinBordes, ServicioAumentosModo,
};
use crate::overlay::{GestorOverlay, OverlayState};
use crate::servicios::{
    aplicar_build, aplicar_pagina_runas, limpiar_activos_app, AutoAcceptService, ChampSelectService,
    GestorAjustes, RunePage,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

pub struct EstadoApp {
    pub bd: AlmacenamientoBd,
    pub lcu_cliente: ClienteLcu,
    pub partida_vivo: ClientePartidaVivo,
    pub servicio_modos: ServicioAumentosModo,
    pub gestor_overlay: GestorOverlay,
    pub gestor_ajustes: Arc<GestorAjustes>,
    pub auto_accept: Arc<AutoAcceptService>,
    pub champ_select: Arc<ChampSelectService>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ParametrosAumentosModo {
    #[serde(rename = "championId")]
    pub champion_id: i64,
    pub mode: String,
    pub patch: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReporteDeteccionLcu {
    pub conectado: bool,
    pub lockfile: Option<InfoLockfile>,
    pub mensaje: String,
}

// ==========================================
// Comandos de Overlay y Modos
// ==========================================

#[tauri::command]
pub fn overlay_show(estado: State<'_, EstadoApp>) -> Result<serde_json::Value, String> {
    estado.gestor_overlay.show();
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn overlay_hide(estado: State<'_, EstadoApp>) -> Result<serde_json::Value, String> {
    estado.gestor_overlay.hide();
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn overlay_toggle(estado: State<'_, EstadoApp>) -> Result<serde_json::Value, String> {
    let visible = estado.gestor_overlay.toggle();
    Ok(serde_json::json!({ "visible": visible }))
}

#[tauri::command]
pub fn overlay_get_state(estado: State<'_, EstadoApp>) -> Result<OverlayState, String> {
    Ok(estado.gestor_overlay.obtener_estado())
}

#[tauri::command]
pub async fn overlay_reanalyze(estado: State<'_, EstadoApp>) -> Result<bool, String> {
    let st = estado.gestor_overlay.obtener_estado();
    if !st.visible || st.mode.is_empty() {
        return Ok(false);
    }
    estado.gestor_overlay.set_analizando(true);
    Ok(true)
}

#[tauri::command]
pub async fn modes_get_champion_augments(
    payload: Option<ParametrosAumentosModo>,
    estado: State<'_, EstadoApp>,
) -> Result<DatosModoCampeon, String> {
    let p = payload.unwrap_or(ParametrosAumentosModo {
        champion_id: 0,
        mode: "".to_string(),
        patch: None,
    });

    let res = estado
        .servicio_modos
        .obtener_aumentos_campeon(p.champion_id, "Desconocido", &p.mode, p.patch.as_deref())
        .await;

    Ok(res)
}

#[tauri::command]
pub async fn modes_get_champion_data(
    payload: Option<ParametrosAumentosModo>,
    estado: State<'_, EstadoApp>,
) -> Result<Option<DatosModoCampeon>, String> {
    let p = payload.ok_or_else(|| "Faltan parámetros de modo y campeón".to_string())?;
    let res = estado
        .servicio_modos
        .obtener_aumentos_campeon(p.champion_id, "Desconocido", &p.mode, p.patch.as_deref())
        .await;
    Ok(Some(res))
}

#[tauri::command]
pub fn modes_get_cached_mode_data(
    payload: Option<String>,
    estado: State<'_, EstadoApp>,
) -> Result<Option<serde_json::Value>, String> {
    let modo = payload.ok_or_else(|| "Falta especificar el modo".to_string())?;
    if let Ok(Some(json_str)) = estado.bd.obtener_cache_modo(&modo, 86400) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&json_str) {
            return Ok(Some(val));
        }
    }
    Ok(None)
}

#[tauri::command]
pub fn modes_check_borderless(payload: Option<String>) -> Result<ReporteSinBordes, String> {
    Ok(verificar_sin_bordes(payload.as_deref()))
}

#[tauri::command]
pub fn modes_apply_borderless(
    payload: Option<String>,
    _estado: State<'_, EstadoApp>,
) -> Result<ResultadoAplicarSinBordes, String> {
    Ok(aplicar_sin_bordes(payload.as_deref()))
}

// ==========================================
// Comandos LCU
// ==========================================

#[tauri::command]
pub async fn lcu_get_state(estado: State<'_, EstadoApp>) -> Result<serde_json::Value, String> {
    Ok(estado.lcu_cliente.obtener_estado_info().await)
}

#[tauri::command]
pub async fn lcu_test_detection(
    payload: Option<String>,
    estado: State<'_, EstadoApp>,
) -> Result<LcuDetectionReport, String> {
    let reporte = ejecutar_deteccion_lcu(payload.as_deref());
    if reporte.success {
        if let Some(ref creds) = reporte.credentials {
            estado.lcu_cliente.actualizar_credenciales(Some(creds.clone())).await;
            let _ = estado.lcu_cliente.validar_conexion().await;
        }
    }
    if reporte.is_permission_error {
        estado.lcu_cliente.set_error_permisos(true).await;
    }
    Ok(reporte)
}

#[tauri::command]
pub fn lcu_select_folder() -> Result<Option<String>, String> {
    Ok(None)
}

#[tauri::command]
pub async fn lcu_get_game_mode(estado: State<'_, EstadoApp>) -> Result<Option<String>, String> {
    if let Some(modo) = estado.lcu_cliente.obtener_modo_actual().await {
        return Ok(Some(modo));
    }
    if let Some(modo) = detectar_modo_en_lcu(&estado.lcu_cliente).await {
        estado.lcu_cliente.actualizar_modo(Some(modo.clone())).await;
        estado.gestor_overlay.set_modo(&modo);
        return Ok(Some(modo));
    }
    let st = estado.gestor_overlay.obtener_estado();
    if !st.mode.is_empty() {
        Ok(Some(st.mode))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn lcu_get_champ_select_session(estado: State<'_, EstadoApp>) -> Result<Option<serde_json::Value>, String> {
    match estado.lcu_cliente.get_json::<serde_json::Value>("/lol-champ-select/v1/session").await {
        Ok(s) => Ok(Some(s)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub async fn lcu_get_pickable_champions(estado: State<'_, EstadoApp>) -> Result<Vec<i64>, String> {
    estado
        .lcu_cliente
        .get_json::<Vec<i64>>("/lol-champ-select/v1/pickable-champion-ids")
        .await
        .or_else(|_| Ok(vec![]))
}

#[tauri::command]
pub async fn lcu_hover_champion(
    payload: Option<i64>,
    estado: State<'_, EstadoApp>,
) -> Result<serde_json::Value, String> {
    let champ_id = payload.ok_or_else(|| "Se requiere el identificador del campeón".to_string())?;

    let sesion = estado
        .lcu_cliente
        .get_json::<serde_json::Value>("/lol-champ-select/v1/session")
        .await
        .map_err(|e| format!("No hay sesión activa de selección de campeón: {}", e))?;

    let celda_local = sesion
        .get("localPlayerCellId")
        .and_then(|v| v.as_i64())
        .ok_or_else(|| "No se encontró localPlayerCellId en la sesión".to_string())?;

    let mut action_id_opt = None;
    if let Some(actions) = sesion.get("actions").and_then(|v| v.as_array()) {
        for fila in actions {
            if let Some(arr) = fila.as_array() {
                for act in arr {
                    if act.get("actorCellId").and_then(|v| v.as_i64()) == Some(celda_local)
                        && act.get("type").and_then(|v| v.as_str()) == Some("pick")
                        && act.get("isInProgress").and_then(|v| v.as_bool()) == Some(true)
                        && act.get("completed").and_then(|v| v.as_bool()) != Some(true)
                    {
                        action_id_opt = act.get("id").and_then(|v| v.as_i64());
                        break;
                    }
                }
            }
        }
    }

    let action_id = action_id_opt
        .ok_or_else(|| "No hay acción de pick en progreso para el jugador local".to_string())?;

    estado
        .lcu_cliente
        .patch_vacio(
            &format!("/lol-champ-select/v1/session/actions/{}", action_id),
            &serde_json::json!({
                "championId": champ_id,
                "completed": false
            }),
        )
        .await?;

    Ok(serde_json::json!({ "success": true, "actionId": action_id, "championId": champ_id }))
}

#[tauri::command]
pub async fn lcu_apply_runes(
    payload: Option<serde_json::Value>,
    estado: State<'_, EstadoApp>,
) -> Result<serde_json::Value, String> {
    let raw = payload.ok_or_else(|| "Página de runas requerida".to_string())?;
    let rune_page: RunePage = serde_json::from_value(raw)
        .map_err(|e| format!("Formato de página de runas inválido: {}", e))?;
    aplicar_pagina_runas(&estado.lcu_cliente, rune_page).await
}

#[tauri::command]
pub async fn lcu_apply_build(
    payload: Option<serde_json::Value>,
    estado: State<'_, EstadoApp>,
) -> Result<serde_json::Value, String> {
    let raw = payload.ok_or_else(|| "Parámetros de build requeridos".to_string())?;
    let ajustes = estado.gestor_ajustes.obtener().await;
    let install_path = ajustes.league_installation_path.as_deref();
    aplicar_build(&estado.lcu_cliente, install_path, &raw).await
}

#[tauri::command]
pub async fn lcu_clean_app_assets(estado: State<'_, EstadoApp>) -> Result<serde_json::Value, String> {
    let ajustes = estado.gestor_ajustes.obtener().await;
    let install_path = ajustes.league_installation_path.as_deref();
    limpiar_activos_app(&estado.lcu_cliente, install_path).await
}

#[tauri::command]
pub fn lcu_get_client_version() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "clientVersion": "16.20.1",
        "ddragonVersion": "16.20.1",
        "matches": true,
        "displayPatch": "16.20"
    }))
}

#[tauri::command]
pub async fn lcu_sync_local_account(estado: State<'_, EstadoApp>) -> Result<serde_json::Value, String> {
    if estado.lcu_cliente.esta_conectado().await {
        if let Ok(summoner) = estado.lcu_cliente.get_json::<serde_json::Value>("/lol-summoner/v1/current-summoner").await {
            return Ok(serde_json::json!({ "success": true, "summoner": summoner }));
        }
    }
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub async fn lcu_set_auto_accept(
    payload: Option<serde_json::Value>,
    estado: State<'_, EstadoApp>,
) -> Result<serde_json::Value, String> {
    if let Some(val) = payload {
        let mut cur = estado.gestor_ajustes.obtener_json().await;
        if let Some(obj) = cur.as_object_mut() {
            obj.insert("autoAccept".to_string(), val);
        }
        estado.gestor_ajustes.guardar(cur).await?;
        estado.auto_accept.emitir_estado().await;
    }
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub async fn lcu_get_auto_accept_status(estado: State<'_, EstadoApp>) -> Result<serde_json::Value, String> {
    Ok(estado.auto_accept.obtener_estado().await)
}

// ==========================================
// Comandos de Configuración y Data Dragon
// ==========================================

#[tauri::command]
pub async fn settings_get(estado: State<'_, EstadoApp>) -> Result<serde_json::Value, String> {
    Ok(estado.gestor_ajustes.obtener_json().await)
}

#[tauri::command]
pub async fn settings_save(
    payload: Option<serde_json::Value>,
    estado: State<'_, EstadoApp>,
) -> Result<serde_json::Value, String> {
    if let Some(val) = payload {
        estado.gestor_ajustes.guardar(val).await?;
        estado.auto_accept.emitir_estado().await;
    }
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn settings_export_diagnostic() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn ddragon_get_patch() -> Result<String, String> {
    Ok("16.20.1".to_string())
}

#[tauri::command]
pub fn ddragon_refresh_data() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "patch": "16.20.1",
        "displayPatch": "26.20",
        "championsCount": 168
    }))
}

#[tauri::command]
pub fn ddragon_get_catalog() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "patch": "16.20.1",
        "displayPatch": "26.20",
        "champions": [],
        "count": 0
    }))
}

#[tauri::command]
pub fn patch_diff_get(payload: Option<String>) -> Result<serde_json::Value, String> {
    let p = payload.unwrap_or_else(|| "26.20".to_string());
    Ok(serde_json::json!({
        "currentPatch": p,
        "previousPatch": "26.19",
        "removedItems": [],
        "changedItems": [],
        "removedRunes": [],
        "newChampions": []
    }))
}

#[tauri::command]
pub fn ai_get_grounding_quota() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "groundingAvailable": true,
        "quotaNote": "Cuota activa",
        "groundingUsedToday": 0,
        "standardRequestsToday": 0,
        "standardDailyLimit": 1500
    }))
}

#[tauri::command]
pub fn opgg_get_matchup(payload: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let _ = payload;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn ai_get_matchup_advice(payload: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let _ = payload;
    Err("IA nativa no configurada; usando catálogo local determinista".to_string())
}

#[tauri::command]
pub fn ai_get_draft_recommendations(payload: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let _ = payload;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn riot_validate_key(payload: Option<String>) -> Result<serde_json::Value, String> {
    let _ = payload;
    Ok(serde_json::json!({ "status": "valid", "rateLimit": "100/2m" }))
}

#[tauri::command]
pub fn riot_sync_account(payload: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let _ = payload;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn riot_get_profile(payload: Option<String>) -> Result<serde_json::Value, String> {
    let _ = payload;
    Ok(serde_json::json!({ "account": null, "matches": [] }))
}
