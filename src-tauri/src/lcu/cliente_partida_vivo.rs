/**
 * src-tauri/src/lcu/cliente_partida_vivo.rs
 * Cliente para la Riot Live Client Data API local (`https://127.0.0.1:2999`).
 * Consulta `/liveclientdata/allgamedata` y `/activeplayer` sin credenciales (solo certificado autofirmado).
 */

use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JugadorActivo {
    #[serde(rename = "championName")]
    pub champion_name: Option<String>,
    pub level: Option<u32>,
    #[serde(rename = "isDead")]
    pub is_dead: Option<bool>,
    #[serde(rename = "currentGold")]
    pub current_gold: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatosJuego {
    #[serde(rename = "gameMode")]
    pub game_mode: Option<String>,
    #[serde(rename = "gameTime")]
    pub game_time: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstantaneaPartida {
    pub activo: bool,
    pub jugador: Option<JugadorActivo>,
    pub modo: Option<String>,
    pub game_time: Option<f64>,
    pub level: Option<u32>,
    pub is_dead: Option<bool>,
}

#[derive(Clone)]
pub struct ClientePartidaVivo {
    cliente_http: Client,
}

impl ClientePartidaVivo {
    pub fn nuevo() -> Self {
        let cliente_http = Client::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .unwrap_or_else(|_| Client::new());

        Self { cliente_http }
    }

    pub async fn obtener_instantanea(&self) -> InstantaneaPartida {
        let url = "https://127.0.0.1:2999/liveclientdata/allgamedata";
        let res = match self.cliente_http.get(url).send().await {
            Ok(r) => r,
            Err(_) => {
                return InstantaneaPartida {
                    activo: false,
                    jugador: None,
                    modo: None,
                    game_time: None,
                    level: None,
                    is_dead: None,
                };
            }
        };

        if !res.status().is_success() {
            return InstantaneaPartida {
                activo: false,
                jugador: None,
                modo: None,
                game_time: None,
                level: None,
                is_dead: None,
            };
        }

        let val: serde_json::Value = match res.json().await {
            Ok(v) => v,
            Err(_) => {
                return InstantaneaPartida {
                    activo: false,
                    jugador: None,
                    modo: None,
                    game_time: None,
                    level: None,
                    is_dead: None,
                };
            }
        };

        let mut jugador: Option<JugadorActivo> = val
            .get("activePlayer")
            .and_then(|v| serde_json::from_value(v.clone()).ok());

        // En la API Live Client de Riot, activePlayer contiene stats y nivel pero NO championName.
        // championName reside en el array allPlayers asociado al summonerName / riotId.
        if let Some(ref mut j) = jugador {
            if j.champion_name.is_none() {
                let active_name = val
                    .get("activePlayer")
                    .and_then(|ap| {
                        ap.get("riotId")
                            .or_else(|| ap.get("summonerName"))
                            .or_else(|| ap.get("riotIdGameName"))
                    })
                    .and_then(|s| s.as_str());

                if let Some(players) = val.get("allPlayers").and_then(|p| p.as_array()) {
                    for p in players {
                        let p_name = p
                            .get("riotId")
                            .or_else(|| p.get("summonerName"))
                            .or_else(|| p.get("riotIdGameName"))
                            .and_then(|s| s.as_str());

                        let coincide = match (active_name, p_name) {
                            (Some(a), Some(b)) => {
                                a.eq_ignore_ascii_case(b)
                                    || a.split('#').next().unwrap_or("").eq_ignore_ascii_case(b.split('#').next().unwrap_or(""))
                            }
                            _ => false,
                        };

                        if coincide {
                            if let Some(c_name) = p.get("championName").and_then(|c| c.as_str()) {
                                if !c_name.is_empty() {
                                    j.champion_name = Some(c_name.to_string());
                                    break;
                                }
                            }
                        }
                    }

                    // Fallback 1: Si no hubo coincidencia por nombre de invocador (ej. partidas locales / bots)
                    if j.champion_name.is_none() && !players.is_empty() {
                        for p in players {
                            if let Some(c_name) = p.get("championName").and_then(|c| c.as_str()) {
                                if !c_name.is_empty() && c_name != "Unknown" {
                                    j.champion_name = Some(c_name.to_string());
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        let datos_juego: Option<DatosJuego> = val
            .get("gameData")
            .and_then(|v| serde_json::from_value(v.clone()).ok());

        let modo_crudo = datos_juego
            .as_ref()
            .and_then(|d| d.game_mode.as_deref())
            .unwrap_or("");

        let modo_normalizado = match modo_crudo.to_uppercase().as_str() {
            "CHERRY" => Some("arena".to_string()),
            "ARAM" => Some("aram_mayhem".to_string()),
            _ => {
                if modo_crudo.is_empty() {
                    None
                } else {
                    Some(modo_crudo.to_lowercase())
                }
            }
        };

        InstantaneaPartida {
            activo: true,
            level: jugador.as_ref().and_then(|j| j.level),
            is_dead: jugador.as_ref().and_then(|j| j.is_dead),
            game_time: datos_juego.as_ref().and_then(|d| d.game_time),
            modo: modo_normalizado,
            jugador,
        }
    }
}
