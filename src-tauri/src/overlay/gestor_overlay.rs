/**
 * src-tauri/src/overlay/gestor_overlay.rs
 * Gestor de la ventana flotante ligera (Overlay) de League of Legends en Tauri v2.
 * Controla visibilidad, modo click-through transparente y emisión de eventos hacia el frontend.
 */

use crate::ocr::detector_aumentos_pantalla::{ResultadoCartaOcr, ResultadoEscaneoAugments};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayState {
    pub visible: bool,
    #[serde(rename = "championId")]
    pub champion_id: i64,
    #[serde(rename = "championName")]
    pub champion_name: String,
    pub mode: String,
    pub cards: Vec<ResultadoCartaOcr>,
    #[serde(rename = "bestCardIndex")]
    pub best_card_index: Option<u8>,
    #[serde(rename = "isAnalyzing")]
    pub is_analyzing: bool,
}

impl Default for OverlayState {
    fn default() -> Self {
        Self {
            visible: false,
            champion_id: 0,
            champion_name: "Desconocido".to_string(),
            mode: "aram_mayhem".to_string(),
            cards: vec![],
            best_card_index: None,
            is_analyzing: false,
        }
    }
}

#[derive(Clone)]
pub struct GestorOverlay {
    app_handle: AppHandle,
    estado: Arc<Mutex<OverlayState>>,
}

impl GestorOverlay {
    pub fn nuevo(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            estado: Arc::new(Mutex::new(OverlayState::default())),
        }
    }

    pub fn obtener_estado(&self) -> OverlayState {
        self.estado.lock().unwrap().clone()
    }

    pub fn set_campeon_y_modo(&self, champion_id: i64, champion_name: &str, mode: &str) {
        let mut st = self.estado.lock().unwrap();
        st.champion_id = champion_id;
        st.champion_name = champion_name.to_string();
        st.mode = mode.to_string();
        let clon = st.clone();
        drop(st);
        let _ = self.app_handle.emit("overlay:state-changed", &clon);
        let _ = self.app_handle.emit("overlay:state-update", clon);
    }

    pub fn actualizar_escaneo_ocr(&self, resultado: ResultadoEscaneoAugments) {
        let mut st = self.estado.lock().unwrap();
        st.cards = resultado.cards.to_vec();
        st.best_card_index = resultado.best_card_index;
        st.is_analyzing = resultado.is_analyzing;
        let clon = st.clone();
        drop(st);
        let _ = self.app_handle.emit("overlay:screen-augments", &clon);
        let _ = self.app_handle.emit("overlay:state-changed", &clon);
        let _ = self.app_handle.emit("overlay:state-update", clon);
    }

    pub fn set_analizando(&self, analizando: bool) {
        let mut st = self.estado.lock().unwrap();
        st.is_analyzing = analizando;
        let clon = st.clone();
        drop(st);
        let _ = self.app_handle.emit("overlay:state-changed", &clon);
        let _ = self.app_handle.emit("overlay:state-update", clon);
    }

    pub fn show(&self) {
        {
            let mut st = self.estado.lock().unwrap();
            st.visible = true;
        }

        if let Some(w) = self.app_handle.get_webview_window("overlay") {
            let _ = w.set_ignore_cursor_events(true);
            let _ = w.show();
        }

        let st_clon = self.obtener_estado();
        let _ = self.app_handle.emit("overlay:state-changed", &st_clon);
        let _ = self.app_handle.emit("overlay:state-update", st_clon);
    }

    pub fn hide(&self) {
        {
            let mut st = self.estado.lock().unwrap();
            st.visible = false;
        }

        if let Some(w) = self.app_handle.get_webview_window("overlay") {
            let _ = w.hide();
        }

        let st_clon = self.obtener_estado();
        let _ = self.app_handle.emit("overlay:state-changed", &st_clon);
        let _ = self.app_handle.emit("overlay:state-update", st_clon);
    }

    pub fn toggle(&self) -> bool {
        let actual = self.obtener_estado().visible;
        if actual {
            self.hide();
            false
        } else {
            self.show();
            true
        }
    }
}
