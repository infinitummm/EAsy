pub mod bd;
pub mod lcu;
pub mod modos;
pub mod ocr;
pub mod overlay;
pub mod comandos;

use bd::AlmacenamientoBd;
use comandos::*;
use lcu::{detectar_lockfile, ClienteLcu, ClientePartidaVivo};
use modos::ServicioAumentosModo;
use ocr::detector_panel_aumentos::{
    calcular_caja_16_a_9, evaluar_visibilidad_panel, ColorRgb, MuestraRoi, TipoMuestra,
};
use overlay::GestorOverlay;
use std::time::Duration;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let bd = AlmacenamientoBd::abrir_por_defecto().unwrap_or_else(|_| AlmacenamientoBd::abrir_en_memoria().unwrap());
    let lcu_cliente = ClienteLcu::nuevo();
    let partida_vivo = ClientePartidaVivo::nuevo();
    let servicio_modos = ServicioAumentosModo::nuevo(bd.clone());

    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_global_shortcut::Builder::new().build());
    }

    builder
        .setup(move |app| {
            let handle = app.handle().clone();
            let gestor_overlay = GestorOverlay::nuevo(handle.clone());

            let estado_app = EstadoApp {
                bd: bd.clone(),
                lcu_cliente: lcu_cliente.clone(),
                partida_vivo: partida_vivo.clone(),
                servicio_modos: servicio_modos.clone(),
                gestor_overlay: gestor_overlay.clone(),
            };

            app.manage(estado_app);

            // Configurar click-through y transparencia inicial del overlay
            if let Some(overlay_w) = app.get_webview_window("overlay") {
                let _ = overlay_w.set_ignore_cursor_events(true);
            }

            // Iniciar ciclo de sondeo en segundo plano (LCU + LiveClient + Detección visual xcap)
            let lcu_c = lcu_cliente.clone();
            let vivo_c = partida_vivo.clone();
            let gestor_o = gestor_overlay.clone();

            tokio::spawn(async move {
                let mut ticks_negativos = 0;
                let mut en_partida;

                loop {
                    tokio::time::sleep(Duration::from_millis(750)).await;

                    // 1. Detección periódica de LCU si no está conectado
                    if !lcu_c.esta_conectado().await {
                        if let Some(info) = detectar_lockfile(None) {
                            lcu_c.actualizar_lockfile(Some(info)).await;
                        }
                    }

                    // 2. Consulta LiveClientData API (127.0.0.1:2999)
                    let snap = vivo_c.obtener_instantanea().await;
                    if snap.activo {
                        en_partida = true;
                        if let (Some(j), Some(m)) = (&snap.jugador, &snap.modo) {
                            let champ_nombre = j.champion_name.as_deref().unwrap_or("Desconocido");
                            gestor_o.set_campeon_y_modo(0, champ_nombre, m);
                        }
                    } else {
                        en_partida = false;
                    }

                    // 3. Si la partida está en curso en ARAM Caos o Arena, evaluar visualmente la presencia de las 3 cartas
                    if en_partida {
                        let capturado = tokio::task::spawn_blocking(|| {
                            if let Ok(monitors) = xcap::Monitor::all() {
                                if let Some(mon) = monitors.first() {
                                    if let Ok(img) = mon.capture_image() {
                                        return Some(img);
                                    }
                                }
                            }
                            None
                        }).await.unwrap_or(None);

                        if let Some(img) = capturado {
                            let caja16a9 = calcular_caja_16_a_9(img.width(), img.height());

                            // Muestrear puntos clave dentro de la caja normalizada 16:9
                            let mut muestras = Vec::new();

                            // Fondos oscuros de cartas y botones de reroll
                            let cols = [0.325f32, 0.500f32, 0.675f32];
                            for col in cols {
                                let px = (caja16a9.x as f32 + col * caja16a9.width as f32) as u32;
                                let py_fondo = (caja16a9.y as f32 + 0.45 * caja16a9.height as f32) as u32;
                                let py_reroll = (caja16a9.y as f32 + 0.72 * caja16a9.height as f32) as u32;

                                if px < img.width() && py_fondo < img.height() {
                                    let p = img.get_pixel(px, py_fondo);
                                    muestras.push(MuestraRoi {
                                        tipo: TipoMuestra::FondoCarta,
                                        color: ColorRgb::new(p[0], p[1], p[2]),
                                    });
                                }

                                if px < img.width() && py_reroll < img.height() {
                                    let p = img.get_pixel(px, py_reroll);
                                    muestras.push(MuestraRoi {
                                        tipo: TipoMuestra::BotonReroll,
                                        color: ColorRgb::new(p[0], p[1], p[2]),
                                    });
                                }
                            }

                            // Muestras de entorno
                            let px_entorno = (caja16a9.x as f32 + 0.10 * caja16a9.width as f32) as u32;
                            let py_entorno = (caja16a9.y as f32 + 0.10 * caja16a9.height as f32) as u32;
                            if px_entorno < img.width() && py_entorno < img.height() {
                                let p = img.get_pixel(px_entorno, py_entorno);
                                muestras.push(MuestraRoi {
                                    tipo: TipoMuestra::Entorno,
                                    color: ColorRgb::new(p[0], p[1], p[2]),
                                });
                            }

                            let visible = evaluar_visibilidad_panel(&muestras);
                            if visible {
                                ticks_negativos = 0;
                                if !gestor_o.obtener_estado().visible {
                                    gestor_o.show();
                                }
                            } else {
                                ticks_negativos += 1;
                                // Cierre rápido en <= 1.5s (2 confirmaciones negativas)
                                if gestor_o.obtener_estado().visible && ticks_negativos >= 2 {
                                    gestor_o.hide();
                                }
                            }
                        }
                    } else if gestor_o.obtener_estado().visible {
                        gestor_o.hide();
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            overlay_show,
            overlay_hide,
            overlay_toggle,
            overlay_get_state,
            overlay_reanalyze,
            modes_get_champion_augments,
            modes_check_borderless,
            modes_apply_borderless,
            lcu_get_state,
            lcu_test_detection,
            lcu_select_folder,
            lcu_get_game_mode,
            lcu_get_pickable_champions,
            lcu_hover_champion,
            lcu_apply_runes,
            lcu_apply_build,
            lcu_clean_app_assets,
            lcu_get_client_version,
            lcu_sync_local_account,
            lcu_set_auto_accept,
            lcu_get_auto_accept_status,
            settings_get,
            settings_save,
            settings_export_diagnostic,
            ddragon_get_patch,
            ddragon_refresh_data,
            ddragon_get_catalog,
            patch_diff_get,
            ai_get_grounding_quota,
            opgg_get_matchup,
            ai_get_matchup_advice,
            ai_get_draft_recommendations,
            riot_validate_key,
            riot_sync_account,
            riot_get_profile
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar aplicación Tauri");
}
