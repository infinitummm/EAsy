/**
 * src-tauri/src/lcu/modo_lcu.rs
 * Detección del modo de juego de League of Legends mediante la LCU API.
 *
 * Sigue la prioridad estricta:
 * 1. GET /lol-gameflow/v1/session -> queue.id, queue.gameMode, map.gameMode
 * 2. Fallback: GET /lol-lobby/v1/lobby -> gameConfig.queueId, gameConfig.gameMode
 * 3. None (Nunca asumir un modo por defecto)
 */

use super::cliente_lcu::ClienteLcu;
use super::registro::registrar_automatizacion;
use serde_json::Value;

/// Mapea un identificador numérico de cola oficial al modo interno de EAsy
pub fn detectar_modo_por_cola(id_cola: Option<i64>) -> Option<String> {
    let id = id_cola?;
    match id {
        2400 => Some("aram_mayhem".to_string()),
        1700 | 1710 | 1750 => Some("arena".to_string()),
        450 => Some("aram".to_string()),
        420 | 440 => Some("ranked".to_string()),
        400 | 430 | 490 | 830 | 840 | 850 => Some("normal".to_string()),
        _ => None,
    }
}

/// Extrae y clasifica el modo de juego a partir del payload completo de la sesión de gameflow
pub fn detectar_modo_por_sesion(sesion: &Value) -> Option<String> {
    // 1. Prioridad por ID de cola
    let id_cola = sesion
        .pointer("/gameData/queue/id")
        .and_then(|v| v.as_i64())
        .or_else(|| {
            sesion
                .pointer("/gameData/gameQueueConfigId")
                .and_then(|v| v.as_i64())
        });

    if let Some(modo) = detectar_modo_por_cola(id_cola) {
        return Some(modo);
    }

    // 2. Comprobar descripciones y nombres de cola
    let desc_queue = sesion
        .pointer("/gameData/queue/description")
        .and_then(|v| v.as_str())
        .or_else(|| sesion.pointer("/gameData/queue/name").and_then(|v| v.as_str()))
        .or_else(|| sesion.pointer("/gameData/queue/shortName").and_then(|v| v.as_str()))
        .unwrap_or("")
        .to_lowercase();

    if desc_queue.contains("arena") || desc_queue.contains("cherry") {
        return Some("arena".to_string());
    }
    if desc_queue.contains("mayhem") || desc_queue.contains("caos") {
        return Some("aram_mayhem".to_string());
    }
    if desc_queue.contains("aram") {
        return Some("aram".to_string());
    }

    // 3. Comprobar identificadores de modo y mapa
    let modo_texto = sesion
        .pointer("/gameData/queue/gameMode")
        .and_then(|v| v.as_str())
        .or_else(|| sesion.pointer("/gameData/queue/type").and_then(|v| v.as_str()))
        .or_else(|| sesion.pointer("/gameData/gameMode").and_then(|v| v.as_str()))
        .or_else(|| sesion.pointer("/map/gameMode").and_then(|v| v.as_str()))
        .or_else(|| sesion.pointer("/map/gameModeName").and_then(|v| v.as_str()))
        .unwrap_or("")
        .to_uppercase();

    let map_id = sesion
        .pointer("/map/id")
        .and_then(|v| v.as_i64())
        .or_else(|| sesion.pointer("/gameData/queue/mapId").and_then(|v| v.as_i64()))
        .unwrap_or(0);

    if modo_texto == "CHERRY" || map_id == 30 {
        return Some("arena".to_string());
    }
    if modo_texto == "ARAM_MAYHEM" || modo_texto == "MAYHEM" {
        return Some("aram_mayhem".to_string());
    }
    if modo_texto == "ARAM" || map_id == 12 {
        let mutator = sesion
            .pointer("/gameData/queue/assetMutator")
            .and_then(|v| v.as_str())
            .or_else(|| sesion.pointer("/map/gameMutator").and_then(|v| v.as_str()))
            .unwrap_or("")
            .to_lowercase();

        if mutator.contains("mayhem") || desc_queue.contains("mayhem") || desc_queue.contains("caos") {
            return Some("aram_mayhem".to_string());
        }
        return Some("aram".to_string());
    }

    if modo_texto == "CLASSIC" || map_id == 11 {
        if id_cola == Some(420) || id_cola == Some(440) {
            return Some("ranked".to_string());
        }
        return Some("normal".to_string());
    }

    None
}

/// Consulta activamente la LCU local para determinar el modo de juego real
pub async fn detectar_modo_en_lcu(cliente: &ClienteLcu) -> Option<String> {
    // 1. Sesión activa de gameflow (/lol-gameflow/v1/session)
    match cliente.get_json::<Value>("/lol-gameflow/v1/session").await {
        Ok(sesion) => {
            if let Some(modo) = detectar_modo_por_sesion(&sesion) {
                registrar_automatizacion(&format!(
                    "[ModoLcu] Modo detectado desde /lol-gameflow/v1/session: '{}'",
                    modo
                ));
                return Some(modo);
            }
        }
        Err(e) => {
            registrar_automatizacion(&format!(
                "[ModoLcu] Consulta /lol-gameflow/v1/session no disponible: {}",
                e
            ));
        }
    }

    // 2. Respaldo: Estado del Lobby (/lol-lobby/v1/lobby)
    match cliente.get_json::<Value>("/lol-lobby/v1/lobby").await {
        Ok(lobby) => {
            let id_cola = lobby
                .pointer("/gameConfig/queueId")
                .and_then(|v| v.as_i64());

            if let Some(modo) = detectar_modo_por_cola(id_cola) {
                registrar_automatizacion(&format!(
                    "[ModoLcu] Modo detectado desde lobby por queueId {:?}: '{}'",
                    id_cola, modo
                ));
                return Some(modo);
            }

            let desc_lobby = lobby
                .pointer("/gameConfig/gameMode")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_uppercase();

            if desc_lobby == "CHERRY" {
                return Some("arena".to_string());
            }
            if desc_lobby == "ARAM" {
                return Some("aram".to_string());
            }
            if desc_lobby == "CLASSIC" {
                let modo = if id_cola == Some(420) || id_cola == Some(440) {
                    "ranked".to_string()
                } else {
                    "normal".to_string()
                };
                registrar_automatizacion(&format!(
                    "[ModoLcu] Modo detectado desde lobby (CLASSIC, queueId {:?}): '{}'",
                    id_cola, modo
                ));
                return Some(modo);
            }
        }
        Err(e) => {
            registrar_automatizacion(&format!(
                "[ModoLcu] Consulta /lol-lobby/v1/lobby no disponible: {}",
                e
            ));
        }
    }

    registrar_automatizacion("[ModoLcu] No se pudo determinar el modo de juego en LCU (sin sesión ni lobby activo).");
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_detectar_modo_por_cola_oficiales() {
        assert_eq!(detectar_modo_por_cola(Some(2400)), Some("aram_mayhem".to_string()));
        assert_eq!(detectar_modo_por_cola(Some(1700)), Some("arena".to_string()));
        assert_eq!(detectar_modo_por_cola(Some(1710)), Some("arena".to_string()));
        assert_eq!(detectar_modo_por_cola(Some(1750)), Some("arena".to_string()));
        assert_eq!(detectar_modo_por_cola(Some(450)), Some("aram".to_string()));
        assert_eq!(detectar_modo_por_cola(Some(420)), Some("ranked".to_string()));
        assert_eq!(detectar_modo_por_cola(Some(440)), Some("ranked".to_string()));
        assert_eq!(detectar_modo_por_cola(Some(400)), Some("normal".to_string())); // 5v5 Draft Pick
        assert_eq!(detectar_modo_por_cola(Some(430)), Some("normal".to_string()));
        assert_eq!(detectar_modo_por_cola(Some(490)), Some("normal".to_string()));
        assert_eq!(detectar_modo_por_cola(Some(999999)), None);
        assert_eq!(detectar_modo_por_cola(None), None);
    }

    #[test]
    fn test_detectar_modo_por_sesion_5v5_draft_pick() {
        // Payload real de 5v5 Draft Pick (el error reportado por el usuario donde decía ARAM Caos)
        let sesion = json!({
            "gameData": {
                "queue": {
                    "id": 400,
                    "gameMode": "CLASSIC",
                    "description": "5v5 Draft Pick games"
                }
            },
            "map": {
                "id": 11,
                "gameMode": "CLASSIC"
            }
        });

        let modo = detectar_modo_por_sesion(&sesion);
        assert_eq!(modo, Some("normal".to_string()));
    }

    #[test]
    fn test_detectar_modo_por_sesion_ranked() {
        let sesion = json!({
            "gameData": {
                "gameQueueConfigId": 420,
                "gameMode": "CLASSIC"
            },
            "map": {
                "id": 11
            }
        });

        let modo = detectar_modo_por_sesion(&sesion);
        assert_eq!(modo, Some("ranked".to_string()));
    }

    #[test]
    fn test_detectar_modo_por_sesion_aram_mayhem() {
        let sesion = json!({
            "gameData": {
                "queue": {
                    "id": 2400,
                    "description": "ARAM Caos"
                }
            }
        });

        let modo = detectar_modo_por_sesion(&sesion);
        assert_eq!(modo, Some("aram_mayhem".to_string()));
    }

    #[test]
    fn test_detectar_modo_por_sesion_desconocido_retorna_none() {
        let sesion = json!({
            "gameData": {}
        });

        let modo = detectar_modo_por_sesion(&sesion);
        assert_eq!(modo, None);
    }
}
