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
            mode: "".to_string(),
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

    pub fn set_modo(&self, mode: &str) {
        let mut st = self.estado.lock().unwrap();
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
            let _ = w.set_always_on_top(true);
            let _ = w.show();

            #[cfg(windows)]
            {
                if let Ok(hwnd) = w.hwnd() {
                    unsafe {
                        use windows::Win32::Foundation::HWND;
                        use windows::Win32::UI::WindowsAndMessaging::{
                            GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE,
                            HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_NOACTIVATE, SWP_SHOWWINDOW,
                            WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOPMOST, WS_EX_TRANSPARENT,
                        };
                        let h = HWND(hwnd.0 as _);
                        let ex_style = GetWindowLongPtrW(h, GWL_EXSTYLE);
                        let nuevo_ex_style = ex_style
                            | (WS_EX_TOPMOST.0 as isize)
                            | (WS_EX_TRANSPARENT.0 as isize)
                            | (WS_EX_NOACTIVATE.0 as isize)
                            | (WS_EX_LAYERED.0 as isize);
                        let _ = SetWindowLongPtrW(h, GWL_EXSTYLE, nuevo_ex_style);
                        let _ = SetWindowPos(
                            h,
                            HWND_TOPMOST,
                            0,
                            0,
                            0,
                            0,
                            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
                        );
                    }
                }
            }
        }

        let st_clon = self.obtener_estado();
        let _ = self.app_handle.emit("overlay:state-changed", &st_clon);
        let _ = self.app_handle.emit("overlay:state-update", st_clon);
    }

    pub fn hide(&self) {
        {
            let mut st = self.estado.lock().unwrap();
            st.visible = false;
            st.cards.clear();
            st.best_card_index = None;
            st.is_analyzing = false;
        }

        if let Some(w) = self.app_handle.get_webview_window("overlay") {
            let _ = w.hide();
        }

        let st_clon = self.obtener_estado();
        let _ = self.app_handle.emit("overlay:state-changed", &st_clon);
        let _ = self.app_handle.emit("overlay:state-update", &st_clon);
        let _ = self.app_handle.emit("overlay:dismiss", serde_json::json!({ "dismissed": true }));
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

    pub fn disparar_prueba_overlay(&self, duracion_segundos: u64) {
        use crate::modos::servicio_aumentos_modo::InfoAumento;
        let c1 = ResultadoCartaOcr {
            card_index: 1,
            augment: Some(InfoAumento {
                id: 101,
                key: "golpe_certero".to_string(),
                name: "Golpe Certero".to_string(),
                name_es: Some("Golpe Certero".to_string()),
                rarity: Some("prismatic".to_string()),
                icon_url: None,
                desc: Some("Críticos aumentados un 50%".to_string()),
                desc_es: Some("Críticos aumentados un 50%".to_string()),
                tier: Some("S".to_string()),
                pick_rate: Some(34.2),
                win_rate: Some(58.4),
            }),
            raw_text: "Golpe Certero".to_string(),
            confidence: 0.99,
            crop_preview_data_url: None,
            error: None,
        };

        let c2 = ResultadoCartaOcr {
            card_index: 2,
            augment: Some(InfoAumento {
                id: 102,
                key: "fuerza_fantasma".to_string(),
                name: "Fuerza Fantasma".to_string(),
                name_es: Some("Fuerza Fantasma".to_string()),
                rarity: Some("gold".to_string()),
                icon_url: None,
                desc: Some("Daño adaptativo acumulativo".to_string()),
                desc_es: Some("Daño adaptativo acumulativo".to_string()),
                tier: Some("A".to_string()),
                pick_rate: Some(21.0),
                win_rate: Some(54.1),
            }),
            raw_text: "Fuerza Fantasma".to_string(),
            confidence: 0.95,
            crop_preview_data_url: None,
            error: None,
        };

        let c3 = ResultadoCartaOcr {
            card_index: 3,
            augment: Some(InfoAumento {
                id: 103,
                key: "escudo_radiante".to_string(),
                name: "Escudo Radiante".to_string(),
                name_es: Some("Escudo Radiante".to_string()),
                rarity: Some("silver".to_string()),
                icon_url: None,
                desc: Some("Escudo protector pasivo".to_string()),
                desc_es: Some("Escudo protector pasivo".to_string()),
                tier: Some("B".to_string()),
                pick_rate: Some(15.4),
                win_rate: Some(51.0),
            }),
            raw_text: "Escudo Radiante".to_string(),
            confidence: 0.92,
            crop_preview_data_url: None,
            error: None,
        };

        self.actualizar_escaneo_ocr(ResultadoEscaneoAugments {
            cards: [c1, c2, c3],
            best_card_index: Some(1),
            detected_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
            is_analyzing: false,
        });

        self.show();

        let gestor_c = self.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(duracion_segundos)).await;
            if gestor_c.obtener_estado().visible {
                gestor_c.hide();
            }
        });
    }
}
