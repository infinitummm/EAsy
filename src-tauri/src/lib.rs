pub mod bd;
pub mod lcu;
pub mod modos;
pub mod ocr;
pub mod overlay;
pub mod comandos;
pub mod servicios;

use bd::AlmacenamientoBd;
use comandos::*;
use lcu::{
    ejecutar_deteccion_lcu, iniciar_tarea_websocket_lcu, ClienteLcu, ClientePartidaVivo,
};
use modos::ServicioAumentosModo;
use ocr::detector_panel_aumentos::{
    calcular_caja_16_a_9, evaluar_visibilidad_panel, ColorRgb, MuestraRoi, TipoMuestra,
};
use ocr::detector_aumentos_pantalla::escanear_tres_cartas_en_pantalla;
use overlay::GestorOverlay;
use servicios::{AutoAcceptService, ChampSelectService, GestorAjustes};
use std::sync::Arc;
use std::time::Duration;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[cfg(target_os = "windows")]
fn asegurar_instancia_unica() {
    use std::os::windows::process::CommandExt;
    let pid_actual = std::process::id();
    let _ = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            &format!(
                "Get-Process -Name 'EAsy' -ErrorAction SilentlyContinue | Where-Object {{ $_.Id -ne {} }} | Stop-Process -Force -ErrorAction SilentlyContinue",
                pid_actual
            ),
        ])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output();
}

pub fn run() {
    #[cfg(target_os = "windows")]
    asegurar_instancia_unica();

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

            let gestor_ajustes = Arc::new(GestorAjustes::nuevo(bd.clone()));
            let auto_accept = Arc::new(AutoAcceptService::nuevo(
                gestor_ajustes.clone(),
                lcu_cliente.clone(),
                handle.clone(),
            ));
            auto_accept.iniciar_tarea_sondeo();

            let champ_select = Arc::new(ChampSelectService::nuevo(
                gestor_ajustes.clone(),
                lcu_cliente.clone(),
                handle.clone(),
            ));

            let estado_app = EstadoApp {
                bd: bd.clone(),
                lcu_cliente: lcu_cliente.clone(),
                partida_vivo: partida_vivo.clone(),
                servicio_modos: servicio_modos.clone(),
                gestor_overlay: gestor_overlay.clone(),
                gestor_ajustes: gestor_ajustes.clone(),
                auto_accept: auto_accept.clone(),
                champ_select: champ_select.clone(),
            };

            app.manage(estado_app);

            // Iniciar tarea de WebSocket en segundo plano para LCU
            iniciar_tarea_websocket_lcu(
                handle.clone(),
                lcu_cliente.clone(),
                gestor_overlay.clone(),
                auto_accept.clone(),
                champ_select.clone(),
            );

            // Configurar click-through y transparencia inicial del overlay
            if let Some(overlay_w) = app.get_webview_window("overlay") {
                let _ = overlay_w.set_ignore_cursor_events(true);
            }

            // Iniciar ciclo de sondeo en segundo plano (LCU + LiveClient + Detección visual xcap)
            let lcu_c = lcu_cliente.clone();
            let vivo_c = partida_vivo.clone();
            let gestor_o = gestor_overlay.clone();
            let handle_c = handle.clone();

            tauri::async_runtime::spawn(async move {
                let mut ticks: u64 = 0;
                let mut en_partida;

                loop {
                    tokio::time::sleep(Duration::from_millis(750)).await;
                    ticks += 1;

                    // 1. Detección y validación periódica de LCU
                    if !lcu_c.esta_conectado().await {
                        let reporte = ejecutar_deteccion_lcu(None);
                        if reporte.success {
                            if let Some(creds) = reporte.credentials {
                                lcu_c.actualizar_credenciales(Some(creds)).await;
                                let _ = lcu_c.validar_conexion().await;
                            }
                        }
                        if reporte.is_permission_error {
                            lcu_c.set_error_permisos(true).await;
                            let _ = handle_c.emit("lcu:permission-error", true);
                        }
                    } else if ticks.is_multiple_of(3) {
                        // Conexión activa: validar periódicamente cada ~2.25s
                        let _ = lcu_c.validar_conexion().await;
                        if lcu_c.obtener_modo_actual().await.is_none() {
                            if let Some(m) = lcu::detectar_modo_en_lcu(&lcu_c).await {
                                lcu_c.actualizar_modo(Some(m.clone())).await;
                                gestor_o.set_modo(&m);
                                let _ = handle_c.emit("lcu:game-mode-changed", &m);
                            }
                        }
                    }

                    // 2. Consulta LiveClientData API (127.0.0.1:2999)
                    let snap = vivo_c.obtener_instantanea().await;
                    if snap.activo {
                        en_partida = true;
                        if let (Some(j), Some(m)) = (&snap.jugador, &snap.modo) {
                            let champ_nombre = j.champion_name.as_deref().unwrap_or("Desconocido");
                            let champ_id = crate::lcu::resolver_id_campeon_por_nombre(champ_nombre);
                            gestor_o.set_campeon_y_modo(champ_id, champ_nombre, m);

                            if champ_id > 0 && ticks % 10 == 0 {
                                let s_modos = servicio_modos.clone();
                                let champ_nom_clon = champ_nombre.to_string();
                                let m_clon = m.clone();
                                tokio::spawn(async move {
                                    let _ = s_modos.obtener_aumentos_campeon(champ_id, &champ_nom_clon, &m_clon, None).await;
                                });
                            }
                        }
                    } else {
                        en_partida = false;
                    }

                    // 3. Si la partida está en curso en ARAM Caos o Arena, evaluar visualmente la presencia de las 3 cartas
                    if en_partida {
                        let capturado = tauri::async_runtime::spawn_blocking(|| {
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

                            // Fondos oscuros de cartas, bordes superiores y botones de reroll
                            let cols = [0.325f32, 0.500f32, 0.675f32];
                            for col in cols {
                                let px = (caja16a9.x as f32 + col * caja16a9.width as f32) as u32;
                                let py_fondo = (caja16a9.y as f32 + 0.45 * caja16a9.height as f32) as u32;
                                let py_borde = (caja16a9.y as f32 + 0.28 * caja16a9.height as f32) as u32;
                                let py_reroll = (caja16a9.y as f32 + 0.72 * caja16a9.height as f32) as u32;

                                if px < img.width() && py_fondo < img.height() {
                                    let p = img.get_pixel(px, py_fondo);
                                    muestras.push(MuestraRoi {
                                        tipo: TipoMuestra::FondoCarta,
                                        color: ColorRgb::new(p[0], p[1], p[2]),
                                    });
                                }

                                if px < img.width() && py_borde < img.height() {
                                    let p = img.get_pixel(px, py_borde);
                                    muestras.push(MuestraRoi {
                                        tipo: TipoMuestra::BordeRareza,
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

                            // Pasillos inter-cartas para evaluar contraste
                            let hueco_cols = [0.415f32, 0.585f32];
                            for hcol in hueco_cols {
                                let px = (caja16a9.x as f32 + hcol * caja16a9.width as f32) as u32;
                                let py = (caja16a9.y as f32 + 0.45 * caja16a9.height as f32) as u32;
                                if px < img.width() && py < img.height() {
                                    let p = img.get_pixel(px, py);
                                    muestras.push(MuestraRoi {
                                        tipo: TipoMuestra::HuecoInterCarta,
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
                                let estado_actual = gestor_o.obtener_estado();
                                if !estado_actual.visible || estado_actual.cards.is_empty() {
                                    // Escanear las 3 cartas visibles con OCR y estadísticas reales de OP.GG
                                    let catalogo = servicio_modos.obtener_catalogo();
                                    let datos_campeon = servicio_modos
                                        .obtener_aumentos_campeon(
                                            estado_actual.champion_id,
                                            &estado_actual.champion_name,
                                            &estado_actual.mode,
                                            None,
                                        )
                                        .await;

                                    let resultado = escanear_tres_cartas_en_pantalla(
                                        &img,
                                        caja16a9,
                                        &catalogo,
                                        Some(&datos_campeon.augments),
                                    );
                                    gestor_o.actualizar_escaneo_ocr(resultado);
                                    gestor_o.show();
                                }
                            } else {
                                // Desaparición inmediata: en el momento que el usuario escoge el aumento en LoL
                                if gestor_o.obtener_estado().visible {
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
            lcu_get_champ_select_session,
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
            opgg_mcp_raw_call,
            ai_get_matchup_advice,
            ai_get_draft_recommendations,
            riot_validate_key,
            riot_sync_account,
            riot_get_profile
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar aplicación Tauri");
}
