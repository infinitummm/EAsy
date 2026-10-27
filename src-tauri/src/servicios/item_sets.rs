/**
 * src-tauri/src/servicios/item_sets.rs
 * Gestor de Conjuntos de Objetos (Item Sets / Builds) de League of Legends.
 *
 * Exporta la build en disco en Config/Champions/[ChampionKey]/Recommended/IteroBuild.json,
 * en Config/ItemSets.json y la sincroniza vía LCU API (/lol-item-sets/v1).
 */

use crate::lcu::cliente_lcu::ClienteLcu;
use crate::lcu::registro::registrar_automatizacion;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

pub fn resolver_ruta_instalacion_lol(configurada: Option<&str>) -> Option<PathBuf> {
    if let Some(c) = configurada {
        let p = PathBuf::from(c);
        if p.exists() {
            return Some(p);
        }
    }

    let candidatas = ["C:\\Riot Games\\League of Legends", "D:\\Riot Games\\League of Legends", "E:\\Riot Games\\League of Legends"];
    for c in candidatas {
        let p = PathBuf::from(c);
        if p.exists() {
            return Some(p);
        }
    }

    None
}

pub fn construir_item_set(champion_id: i64, build: &Value, titulo_opt: Option<&str>) -> Value {
    let titulo = titulo_opt
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("EAsy Campeón {}", champion_id));

    let starters = build
        .get("startingItems")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_i64())
                .map(|id| serde_json::json!({ "id": id.to_string(), "count": 1 }))
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|| {
            vec![
                serde_json::json!({ "id": "1055", "count": 1 }),
                serde_json::json!({ "id": "2003", "count": 1 }),
            ]
        });

    let boots_ids = ["3006", "3047", "3111", "3158", "3020", "3009", "1001"];
    let mut items_botas = Vec::new();
    let mut items_core = Vec::new();

    let core_raw = build
        .get("coreItems")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_i64()).collect::<Vec<_>>())
        .unwrap_or_else(|| vec![3078, 3053, 3156]);

    for id in core_raw {
        let sid = id.to_string();
        if boots_ids.contains(&sid.as_str()) {
            items_botas.push(serde_json::json!({ "id": sid, "count": 1 }));
        } else {
            items_core.push(serde_json::json!({ "id": sid, "count": 1 }));
        }
    }

    if items_botas.is_empty() {
        items_botas.push(serde_json::json!({ "id": "3047", "count": 1 }));
        items_botas.push(serde_json::json!({ "id": "3111", "count": 1 }));
    }

    let items_situacional = build
        .get("situationalItems")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_i64())
                .map(|id| serde_json::json!({ "id": id.to_string(), "count": 1 }))
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|| {
            vec![
                serde_json::json!({ "id": "3026", "count": 1 }),
                serde_json::json!({ "id": "3075", "count": 1 }),
            ]
        });

    let consumibles = vec![
        serde_json::json!({ "id": "2003", "count": 1 }),
        serde_json::json!({ "id": "2055", "count": 1 }),
        serde_json::json!({ "id": "3340", "count": 1 }),
        serde_json::json!({ "id": "3364", "count": 1 }),
    ];

    let blocks = vec![
        serde_json::json!({
            "type": "Iniciales",
            "recMath": false,
            "minSummonerLevel": -1,
            "maxSummonerLevel": -1,
            "showIfSummonerSpell": "",
            "hideIfSummonerSpell": "",
            "items": starters
        }),
        serde_json::json!({
            "type": "Botas",
            "recMath": false,
            "minSummonerLevel": -1,
            "maxSummonerLevel": -1,
            "showIfSummonerSpell": "",
            "hideIfSummonerSpell": "",
            "items": items_botas
        }),
        serde_json::json!({
            "type": "Objetos Principales (Core)",
            "recMath": false,
            "minSummonerLevel": -1,
            "maxSummonerLevel": -1,
            "showIfSummonerSpell": "",
            "hideIfSummonerSpell": "",
            "items": items_core
        }),
        serde_json::json!({
            "type": "Opciones Situacionales",
            "recMath": false,
            "minSummonerLevel": -1,
            "maxSummonerLevel": -1,
            "showIfSummonerSpell": "",
            "hideIfSummonerSpell": "",
            "items": items_situacional
        }),
        serde_json::json!({
            "type": "Consumibles y Visión",
            "recMath": false,
            "minSummonerLevel": -1,
            "maxSummonerLevel": -1,
            "showIfSummonerSpell": "",
            "hideIfSummonerSpell": "",
            "items": consumibles
        }),
    ];

    serde_json::json!({
        "title": titulo,
        "associatedMaps": [11, 12],
        "associatedChampions": [champion_id],
        "map": "any",
        "mode": "any",
        "preferredItemSlots": [],
        "sortrank": 1,
        "startedFrom": "blank",
        "type": "custom",
        "blocks": blocks
    })
}

pub async fn aplicar_build(
    cliente: &ClienteLcu,
    ruta_instalacion_opt: Option<&str>,
    payload: &Value,
) -> Result<Value, String> {
    let champion_id = payload.get("championId").and_then(|v| v.as_i64()).unwrap_or(0);
    let build_data = payload.get("build").unwrap_or(payload);
    let titulo = payload.get("title").and_then(|v| v.as_str());

    let item_set = construir_item_set(champion_id, build_data, titulo);

    let mut written_path = None;

    // 1. Escribir en disco local si se localiza la carpeta de instalación
    if let Some(ruta_base) = resolver_ruta_instalacion_lol(ruta_instalacion_opt) {
        let dir_champ = ruta_base
            .join("Config")
            .join("Champions")
            .join(champion_id.to_string())
            .join("Recommended");

        let _ = fs::create_dir_all(&dir_champ);
        let ruta_archivo = dir_champ.join("IteroBuild.json");
        if let Ok(contenido) = serde_json::to_string_pretty(&item_set) {
            if fs::write(&ruta_archivo, contenido).is_ok() {
                registrar_automatizacion(&format!(
                    "[ItemSetManager] Build guardada en disco: {}",
                    ruta_archivo.display()
                ));
                written_path = Some(ruta_archivo.to_string_lossy().to_string());
            }
        }

        // Actualizar Config/ItemSets.json global
        let ruta_global = ruta_base.join("Config").join("ItemSets.json");
        let mut global_data: Value = if ruta_global.exists() {
            fs::read_to_string(&ruta_global)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_else(|| serde_json::json!({ "itemSets": [] }))
        } else {
            serde_json::json!({ "itemSets": [] })
        };

        if let Some(sets) = global_data.get_mut("itemSets").and_then(|v| v.as_array_mut()) {
            sets.retain(|s| {
                let t = s.get("title").and_then(|v| v.as_str()).unwrap_or("");
                !t.starts_with("EAsy") && !t.starts_with("[IL]") && !t.starts_with("Itero")
            });
            sets.insert(0, item_set.clone());
        }

        if let Ok(c) = serde_json::to_string_pretty(&global_data) {
            let _ = fs::write(ruta_global, c);
        }
    }

    // 2. Sincronización oficial vía LCU API
    let mut lcu_applied = false;
    if cliente.esta_conectado().await {
        if let Ok(summoner) = cliente.get_json::<Value>("/lol-summoner/v1/current-summoner").await {
            let summoner_id = summoner
                .get("summonerId")
                .and_then(|v| v.as_i64())
                .or_else(|| summoner.get("accountId").and_then(|v| v.as_i64()));

            if let Some(sid) = summoner_id {
                let endpoint_sets = format!("/lol-item-sets/v1/item-sets/{}/sets", sid);
                let current_sets: Value = match cliente.get_json(&endpoint_sets).await {
                    Ok(v) => v,
                    Err(_) => serde_json::json!({ "itemSets": [] }),
                };

                let account_id = current_sets
                    .get("accountId")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(sid);

                let mut sets_arr = current_sets
                    .get("itemSets")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();

                sets_arr.retain(|s| {
                    let t = s.get("title").and_then(|v| v.as_str()).unwrap_or("");
                    !t.starts_with("EAsy") && !t.starts_with("[IL]") && !t.starts_with("Itero")
                });
                sets_arr.insert(0, item_set.clone());

                let payload_lcu = serde_json::json!({
                    "accountId": account_id,
                    "itemSets": sets_arr,
                    "timestamp": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64
                });

                match cliente.put_vacio(&endpoint_sets, &payload_lcu).await {
                    Ok(_) => {
                        registrar_automatizacion(&format!(
                            "[ItemSetManager] Build inyectada exitosamente en LCU para invocador ID {}.",
                            sid
                        ));
                        lcu_applied = true;
                    }
                    Err(e) => {
                        registrar_automatizacion(&format!(
                            "[ItemSetManager ERROR] Fallo al inyectar build en LCU: {}",
                            e
                        ));
                    }
                }
            }
        }
    }

    Ok(serde_json::json!({
        "success": true,
        "filePath": written_path,
        "lcuApplied": lcu_applied
    }))
}

pub async fn limpiar_activos_app(
    cliente: &ClienteLcu,
    ruta_instalacion_opt: Option<&str>,
) -> Result<Value, String> {
    let mut eliminadas_runas = 0;
    let mut eliminados_items = 0;

    // 1. Limpiar páginas de runas
    if cliente.esta_conectado().await {
        if let Ok(paginas) = cliente.get_json::<Vec<Value>>("/lol-perks/v1/pages").await {
            for p in paginas {
                let nombre = p.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let pid = p.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
                if pid > 0 && (nombre.starts_with("EAsy") || nombre.starts_with("[IL]") || nombre.starts_with("Itero")) {
                    if cliente.delete_vacio(&format!("/lol-perks/v1/pages/{}", pid)).await.is_ok() {
                        eliminadas_runas += 1;
                    }
                }
            }
        }
    }

    // 2. Limpiar item sets en LCU
    if cliente.esta_conectado().await {
        if let Ok(summoner) = cliente.get_json::<Value>("/lol-summoner/v1/current-summoner").await {
            let summoner_id = summoner
                .get("summonerId")
                .and_then(|v| v.as_i64())
                .or_else(|| summoner.get("accountId").and_then(|v| v.as_i64()));

            if let Some(sid) = summoner_id {
                let endpoint_sets = format!("/lol-item-sets/v1/item-sets/{}/sets", sid);
                if let Ok(mut current_sets) = cliente.get_json::<Value>(&endpoint_sets).await {
                    let mut modificado = false;
                    if let Some(sets) = current_sets.get_mut("itemSets").and_then(|v| v.as_array_mut()) {
                        let antes = sets.len();
                        sets.retain(|s| {
                            let t = s.get("title").and_then(|v| v.as_str()).unwrap_or("");
                            !t.starts_with("EAsy") && !t.starts_with("[IL]") && !t.starts_with("Itero")
                        });
                        eliminados_items += antes - sets.len();
                        modificado = true;
                    }
                    if modificado {
                        let _ = cliente.put_vacio(&endpoint_sets, &current_sets).await;
                    }
                }
            }
        }
    }

    // 3. Limpiar en disco
    if let Some(ruta_base) = resolver_ruta_instalacion_lol(ruta_instalacion_opt) {
        let ruta_global = ruta_base.join("Config").join("ItemSets.json");
        if ruta_global.exists() {
            if let Some(mut global_data) = fs::read_to_string(&ruta_global).ok().and_then(|s| serde_json::from_str::<Value>(&s).ok()) {
                if let Some(sets) = global_data.get_mut("itemSets").and_then(|v| v.as_array_mut()) {
                    sets.retain(|s| {
                        let t = s.get("title").and_then(|v| v.as_str()).unwrap_or("");
                        !t.starts_with("EAsy") && !t.starts_with("[IL]") && !t.starts_with("Itero")
                    });
                }
                if let Ok(c) = serde_json::to_string_pretty(&global_data) {
                    let _ = fs::write(ruta_global, c);
                }
            }
        }
    }

    registrar_automatizacion(&format!(
        "[ItemSetManager] Limpieza de activos completada: {} páginas de runas eliminadas, {} item sets eliminados.",
        eliminadas_runas, eliminados_items
    ));

    Ok(serde_json::json!({
        "deletedRunePages": eliminadas_runas,
        "deletedItemSets": eliminados_items,
        "success": true
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_construir_item_set_estructura_oficial() {
        let build = json!({
            "startingItems": [1055, 2003],
            "coreItems": [3078, 3053, 3111],
            "situationalItems": [3026, 3075]
        });

        let item_set = construir_item_set(222, &build, Some("EAsy Jinx ADC"));

        assert_eq!(item_set["title"], "EAsy Jinx ADC");
        assert_eq!(item_set["associatedChampions"], json!([222]));

        let blocks = item_set["blocks"].as_array().expect("Debe contener array blocks");
        assert_eq!(blocks.len(), 5);
        assert_eq!(blocks[0]["type"], "Iniciales");
        assert_eq!(blocks[1]["type"], "Botas");
        assert_eq!(blocks[2]["type"], "Objetos Principales (Core)");
        assert_eq!(blocks[3]["type"], "Opciones Situacionales");
        assert_eq!(blocks[4]["type"], "Consumibles y Visión");
    }
}
