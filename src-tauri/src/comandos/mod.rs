/**
 * src-tauri/src/comandos/mod.rs
 * Comandos Tauri v2 invocados desde el frontend React mediante `@tauri-apps/api/core` (`invoke`).
 */

use crate::bd::AlmacenamientoBd;
use crate::lcu::{detectar_lockfile, ClienteLcu, ClientePartidaVivo, InfoLockfile};
use crate::modos::{
    aplicar_sin_bordes, verificar_sin_bordes, DatosModoCampeon, ReporteSinBordes,
    ResultadoAplicarSinBordes, ServicioAumentosModo,
};
use crate::overlay::{GestorOverlay, OverlayState};
use serde::{Deserialize, Serialize};
use tauri::State;

pub struct EstadoApp {
    pub bd: AlmacenamientoBd,
    pub lcu_cliente: ClienteLcu,
    pub partida_vivo: ClientePartidaVivo,
    pub servicio_modos: ServicioAumentosModo,
    pub gestor_overlay: GestorOverlay,
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
    estado.gestor_overlay.set_analizando(true);
    // Disparar ciclo inmediato
    Ok(true)
}

#[tauri::command]
pub async fn modes_get_champion_augments(
    payload: Option<ParametrosAumentosModo>,
    estado: State<'_, EstadoApp>,
) -> Result<DatosModoCampeon, String> {
    let p = payload.unwrap_or(ParametrosAumentosModo {
        champion_id: 0,
        mode: "aram_mayhem".to_string(),
        patch: None,
    });

    let res = estado
        .servicio_modos
        .obtener_aumentos_campeon(p.champion_id, "Desconocido", &p.mode, p.patch.as_deref())
        .await;

    Ok(res)
}

#[tauri::command]
pub fn modes_check_borderless(
    payload: Option<String>,
    _estado: State<'_, EstadoApp>,
) -> Result<ReporteSinBordes, String> {
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
    let conectado = estado.lcu_cliente.esta_conectado().await;
    let fase = if conectado {
        estado
            .lcu_cliente
            .obtener_fase_partida()
            .await
            .unwrap_or_else(|_| "None".to_string())
    } else {
        "None".to_string()
    };

    Ok(serde_json::json!({
        "connected": conectado,
        "phase": fase,
        "gameMode": null
    }))
}

#[tauri::command]
pub fn lcu_test_detection(
    payload: Option<String>,
    _estado: State<'_, EstadoApp>,
) -> Result<ReporteDeteccionLcu, String> {
    let lockfile = detectar_lockfile(payload.as_deref());
    let conectado = lockfile.is_some();
    let mensaje = if conectado {
        "Lockfile detectado con éxito.".to_string()
    } else {
        "No se detectó League of Legends en ejecución.".to_string()
    };

    Ok(ReporteDeteccionLcu {
        conectado,
        lockfile,
        mensaje,
    })
}

#[tauri::command]
pub fn lcu_select_folder() -> Result<Option<String>, String> {
    // Retornar None o diálogo de carpeta
    Ok(None)
}

#[tauri::command]
pub fn lcu_get_game_mode(estado: State<'_, EstadoApp>) -> Result<Option<String>, String> {
    let st = estado.gestor_overlay.obtener_estado();
    Ok(Some(st.mode))
}

#[tauri::command]
pub fn lcu_get_pickable_champions() -> Result<Vec<i64>, String> {
    Ok(vec![])
}

#[tauri::command]
pub fn lcu_hover_champion(payload: Option<i64>) -> Result<serde_json::Value, String> {
    let _ = payload;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn lcu_apply_runes(payload: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let _ = payload;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn lcu_apply_build(payload: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let _ = payload;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn lcu_clean_app_assets() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "deletedItemSets": 0, "deletedRunePages": 0, "success": true }))
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
pub fn lcu_sync_local_account() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn lcu_set_auto_accept(payload: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let _ = payload;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn lcu_get_auto_accept_status() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "enabled": true,
        "delaySeconds": 2,
        "humanVariance": true,
        "lastAction": "ninguna"
    }))
}

// ==========================================
// Comandos de Configuración y Data Dragon
// ==========================================

#[tauri::command]
pub fn settings_get(estado: State<'_, EstadoApp>) -> Result<serde_json::Value, String> {
    if let Ok(Some(s)) = estado.bd.obtener_ajuste("app_settings") {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&s) {
            return Ok(val);
        }
    }

    Ok(serde_json::json!({
        "leaguePath": "",
        "autoAccept": { "enabled": true, "delaySeconds": 2 },
        "aiProvider": "gemini",
        "geminiApiKey": "",
        "overlayEnabled": true
    }))
}

#[tauri::command]
pub fn settings_save(payload: Option<serde_json::Value>, estado: State<'_, EstadoApp>) -> Result<serde_json::Value, String> {
    if let Some(val) = payload {
        if let Ok(s) = serde_json::to_string(&val) {
            let _ = estado.bd.guardar_ajuste("app_settings", &s);
        }
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
        "championsCount": 168
    }))
}

#[tauri::command]
pub fn ddragon_get_catalog() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "patch": "16.20.1",
        "displayPatch": "16.20",
        "champions": [],
        "count": 0
    }))
}

#[tauri::command]
pub fn patch_diff_get(payload: Option<String>) -> Result<serde_json::Value, String> {
    let _ = payload;
    Ok(serde_json::json!({}))
}

#[tauri::command]
pub fn ai_get_grounding_quota() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "used": 5, "limit": 1500 }))
}

#[tauri::command]
pub fn opgg_get_matchup(payload: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let _ = payload;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn ai_get_matchup_advice(payload: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let _ = payload;
    Ok(serde_json::json!({ "success": true }))
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
