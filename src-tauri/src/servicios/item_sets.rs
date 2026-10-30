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

    // 1. Revisar archivo oficial de instalación de Riot Client
    let json_installs = PathBuf::from(r"C:\ProgramData\Riot Games\RiotClientInstalls.json");
    if json_installs.exists() {
        if let Ok(contenido) = fs::read_to_string(&json_installs) {
            if let Ok(val) = serde_json::from_str::<Value>(&contenido) {
                if let Some(assoc) = val.get("associated_client").and_then(|v| v.as_object()) {
                    for (k, _) in assoc {
                        let trimmed = k.trim_end_matches('/').trim_end_matches('\\');
                        let path_candidato = PathBuf::from(trimmed);
                        if path_candidato.exists() && trimmed.to_lowercase().contains("league of legends") {
                            return Some(path_candidato);
                        }
                    }
                }
            }
        }
    }

    // 2. Rutas candidatas comunes en unidades
    let candidatas = [
        "C:\\Riot Games\\League of Legends",
        "D:\\Riot Games\\League of Legends",
        "E:\\Riot Games\\League of Legends",
        "F:\\Riot Games\\League of Legends",
        "G:\\Riot Games\\League of Legends",
        "C:\\Games\\League of Legends",
        "D:\\Games\\League of Legends",
    ];
    for c in candidatas {
        let p = PathBuf::from(c);
        if p.exists() {
            return Some(p);
        }
    }

    None
}

/// Extrae IDs numéricos limpios de cualquier formato: [1055, 2003], ["1055"], o [{ itemId: 1055 }]
fn extraer_item_ids(val: Option<&Value>) -> Vec<i64> {
    let mut ids = Vec::new();
    if let Some(v) = val {
        if let Some(arr) = v.as_array() {
            for item in arr {
                if let Some(id) = item.as_i64() {
                    if id > 0 && !ids.contains(&id) {
                        ids.push(id);
                    }
                } else if let Some(id_str) = item.as_str() {
                    if let Ok(id) = id_str.parse::<i64>() {
                        if id > 0 && !ids.contains(&id) {
                            ids.push(id);
                        }
                    }
                } else if let Some(obj) = item.as_object() {
                    let id_opt = obj
                        .get("itemId")
                        .or_else(|| obj.get("id"))
                        .and_then(|i| i.as_i64().or_else(|| i.as_str().and_then(|s| s.parse::<i64>().ok())));
                    if let Some(id) = id_opt {
                        if id > 0 && !ids.contains(&id) {
                            ids.push(id);
                        }
                    }
                }
            }
        } else if let Some(id) = v.as_i64() {
            if id > 0 && !ids.contains(&id) {
                ids.push(id);
            }
        } else if let Some(id_str) = v.as_str() {
            if let Ok(id) = id_str.parse::<i64>() {
                if id > 0 && !ids.contains(&id) {
                    ids.push(id);
                }
            }
        }
    }
    ids
}

pub fn mapear_champion_id_a_key(champion_id: i64) -> Option<String> {
    let key = match champion_id {
        266 => "Aatrox",
        103 => "Ahri",
        84 => "Akali",
        12 => "Alistar",
        32 => "Amumu",
        34 => "Anivia",
        1 => "Annie",
        523 => "Aphelios",
        22 => "Ashe",
        136 => "AurelionSol",
        893 => "Aurora",
        268 => "Azir",
        432 => "Bard",
        200 => "Belveth",
        53 => "Blitzcrank",
        63 => "Brand",
        201 => "Braum",
        233 => "Briar",
        51 => "Caitlyn",
        164 => "Camille",
        69 => "Cassiopeia",
        31 => "Chogath",
        42 => "Corki",
        122 => "Darius",
        131 => "Diana",
        119 => "Draven",
        36 => "DrMundo",
        245 => "Ekko",
        60 => "Elise",
        28 => "Evelynn",
        81 => "Ezreal",
        9 => "Fiddlesticks",
        114 => "Fiora",
        105 => "Fizz",
        3 => "Galio",
        41 => "Gangplank",
        86 => "Garen",
        150 => "Gnar",
        79 => "Gragas",
        104 => "Graves",
        887 => "Gwen",
        120 => "Hecarim",
        74 => "Heimerdinger",
        910 => "Hwei",
        420 => "Illaoi",
        39 => "Irelia",
        427 => "Ivern",
        40 => "Janna",
        59 => "JarvanIV",
        24 => "Jax",
        126 => "Jayce",
        202 => "Jhin",
        222 => "Jinx",
        145 => "Kaisa",
        429 => "Kalista",
        43 => "Karma",
        30 => "Karthus",
        38 => "Kassadin",
        55 => "Katarina",
        10 => "Kayle",
        141 => "Kayn",
        85 => "Kennen",
        121 => "Khazix",
        203 => "Kindred",
        240 => "Kled",
        96 => "KogMaw",
        897 => "KSante",
        7 => "Leblanc",
        64 => "LeeSin",
        89 => "Leona",
        876 => "Lillia",
        127 => "Lissandra",
        236 => "Lucian",
        117 => "Lulu",
        99 => "Lux",
        54 => "Malphite",
        90 => "Malzahar",
        57 => "Maokai",
        11 => "MasterYi",
        902 => "Milio",
        21 => "MissFortune",
        82 => "Mordekaiser",
        25 => "Morgana",
        950 => "Naafiri",
        267 => "Nami",
        75 => "Nasus",
        111 => "Nautilus",
        518 => "Neeko",
        76 => "Nidalee",
        895 => "Nilah",
        56 => "Nocturne",
        20 => "Nunu",
        2 => "Olaf",
        61 => "Orianna",
        516 => "Ornn",
        80 => "Pantheon",
        78 => "Poppy",
        555 => "Pyke",
        247 => "Qiyana",
        133 => "Quinn",
        497 => "Rakan",
        33 => "Rammus",
        421 => "RekSai",
        526 => "Rell",
        888 => "Renata",
        58 => "Renekton",
        107 => "Rengar",
        92 => "Riven",
        68 => "Rumble",
        13 => "Ryze",
        360 => "Samira",
        113 => "Sejuani",
        235 => "Senna",
        147 => "Seraphine",
        875 => "Sett",
        35 => "Shaco",
        98 => "Shen",
        102 => "Shyvana",
        27 => "Singed",
        14 => "Sion",
        15 => "Sivir",
        72 => "Skarner",
        901 => "Smolder",
        37 => "Sona",
        16 => "Soraka",
        50 => "Swain",
        517 => "Sylas",
        134 => "Syndra",
        223 => "TahmKench",
        163 => "Taliyah",
        91 => "Talon",
        44 => "Taric",
        17 => "Teemo",
        412 => "Thresh",
        18 => "Tristana",
        48 => "Trundle",
        23 => "Tryndamere",
        4 => "TwistedFate",
        29 => "Twitch",
        77 => "Udyr",
        6 => "Urgot",
        110 => "Varus",
        67 => "Vayne",
        45 => "Veigar",
        161 => "Velkoz",
        711 => "Vex",
        254 => "Vi",
        234 => "Viego",
        112 => "Viktor",
        8 => "Vladimir",
        106 => "Volibear",
        19 => "Warwick",
        498 => "Xayah",
        115 => "Ziggs",
        26 => "Zilean",
        142 => "Zoe",
        143 => "Zyra",
        157 => "Yasuo",
        777 => "Yone",
        83 => "Yorick",
        350 => "Yuumi",
        154 => "Zac",
        238 => "Zed",
        221 => "Zeri",
        _ => return None,
    };
    Some(key.to_string())
}

pub fn construir_item_set(champion_id: i64, build: &Value, titulo_opt: Option<&str>) -> Value {
    let titulo = titulo_opt
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            if champion_id > 0 {
                format!("EAsy Campeón {}", champion_id)
            } else {
                "EAsy Build Competitiva".to_string()
            }
        });

    let mut raw_starters = extraer_item_ids(build.get("startingItems").or_else(|| build.get("starterItems")));
    if raw_starters.is_empty() {
        raw_starters = vec![1055, 2003];
    }
    let starters: Vec<Value> = raw_starters
        .into_iter()
        .map(|id| serde_json::json!({ "id": id.to_string(), "count": 1 }))
        .collect();

    let boots_ids_ref = [3006, 3047, 3111, 3158, 3020, 3009, 1001];
    let mut raw_boots = extraer_item_ids(build.get("boots"));
    if raw_boots.is_empty() {
        let core_ids = extraer_item_ids(build.get("coreItems").or_else(|| build.get("buildOrder")));
        for id in &core_ids {
            if boots_ids_ref.contains(id) && !raw_boots.contains(id) {
                raw_boots.push(*id);
            }
        }
    }
    if raw_boots.is_empty() {
        raw_boots = vec![3006, 3047, 3111];
    }
    let items_botas: Vec<Value> = raw_boots
        .into_iter()
        .map(|id| serde_json::json!({ "id": id.to_string(), "count": 1 }))
        .collect();

    let mut raw_core = extraer_item_ids(build.get("coreItems").or_else(|| build.get("buildOrder")));
    raw_core.retain(|id| !boots_ids_ref.contains(id));
    // Complementar con completedItems si hay más de 3
    let raw_completed = extraer_item_ids(build.get("completedItems"));
    for id in &raw_completed {
        if !boots_ids_ref.contains(id) && !raw_core.contains(id) && raw_core.len() < 6 {
            raw_core.push(*id);
        }
    }
    if raw_core.is_empty() {
        raw_core = vec![3031, 3046, 3036];
    }
    let items_core: Vec<Value> = raw_core
        .into_iter()
        .map(|id| serde_json::json!({ "id": id.to_string(), "count": 1 }))
        .collect();

    let mut raw_situacional = extraer_item_ids(build.get("situationalItems"));
    if raw_situacional.is_empty() {
        raw_situacional = vec![3026, 3075, 3139];
    }
    let items_situacional: Vec<Value> = raw_situacional
        .into_iter()
        .map(|id| serde_json::json!({ "id": id.to_string(), "count": 1 }))
        .collect();

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

    let uid = format!(
        "EAsy-build-{}-{}",
        champion_id,
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );

    let associated_champions = if champion_id > 0 {
        vec![champion_id]
    } else {
        vec![]
    };

    serde_json::json!({
        "uid": uid,
        "title": titulo,
        "associatedMaps": [11, 12, 30],
        "associatedChampions": associated_champions,
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
    let champion_key_opt = payload
        .get("championKey")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| mapear_champion_id_a_key(champion_id));
    let build_data = payload.get("build").unwrap_or(payload);
    let titulo = payload.get("title").and_then(|v| v.as_str());

    let item_set = construir_item_set(champion_id, build_data, titulo);

    let mut written_path = None;

    // 1. Escribir en disco local si se localiza la carpeta de instalación
    if let Some(ruta_base) = resolver_ruta_instalacion_lol(ruta_instalacion_opt) {
        let contenido_pretty = serde_json::to_string_pretty(&item_set).unwrap_or_default();

        // 1.A. Carpeta de Campeón con Key canónica (ej: Config/Champions/Yasuo/Recommended/IteroBuild.json)
        if let Some(ref ckey) = champion_key_opt {
            let dir_champ_key = ruta_base
                .join("Config")
                .join("Champions")
                .join(ckey)
                .join("Recommended");
            let _ = fs::create_dir_all(&dir_champ_key);
            let ruta_champ_key = dir_champ_key.join("IteroBuild.json");
            let _ = fs::write(&ruta_champ_key, &contenido_pretty);
            let _ = fs::write(dir_champ_key.join("RIOT_ItemSet_1.json"), &contenido_pretty);
            let _ = fs::write(dir_champ_key.join("EAsyBuild.json"), &contenido_pretty);
            written_path = Some(ruta_champ_key.to_string_lossy().to_string());
            registrar_automatizacion(&format!(
                "[ItemSetManager] Build guardada en disco (Key): {}",
                ruta_champ_key.display()
            ));
        }

        // 1.B. Carpeta de Campeón por ID numérico (ej: Config/Champions/157/Recommended/IteroBuild.json)
        if champion_id > 0 {
            let dir_champ_id = ruta_base
                .join("Config")
                .join("Champions")
                .join(champion_id.to_string())
                .join("Recommended");
            let _ = fs::create_dir_all(&dir_champ_id);
            let _ = fs::write(dir_champ_id.join("IteroBuild.json"), &contenido_pretty);
            let _ = fs::write(dir_champ_id.join("RIOT_ItemSet_1.json"), &contenido_pretty);
            let _ = fs::write(dir_champ_id.join("EAsyBuild.json"), &contenido_pretty);
            if written_path.is_none() {
                written_path = Some(dir_champ_id.join("IteroBuild.json").to_string_lossy().to_string());
            }
        }

        // 1.C. Carpeta Global de Recomendados (Config/Global/Recommended/IteroBuild.json)
        let dir_global_rec = ruta_base.join("Config").join("Global").join("Recommended");
        let _ = fs::create_dir_all(&dir_global_rec);
        let _ = fs::write(dir_global_rec.join("IteroBuild.json"), &contenido_pretty);
        let _ = fs::write(dir_global_rec.join("RIOT_ItemSet_1.json"), &contenido_pretty);
        let _ = fs::write(dir_global_rec.join("EAsyBuild.json"), &contenido_pretty);

        // 1.D. Actualizar Config/ItemSets.json global
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

                let res_put = cliente.put_vacio(&endpoint_sets, &payload_lcu).await;
                if res_put.is_ok() {
                    registrar_automatizacion(&format!(
                        "[ItemSetManager] Build inyectada exitosamente vía PUT en LCU para invocador ID {}.",
                        sid
                    ));
                    lcu_applied = true;
                } else {
                    let res_post = cliente.post_vacio(&endpoint_sets, Some(&payload_lcu)).await;
                    if res_post.is_ok() {
                        registrar_automatizacion(&format!(
                            "[ItemSetManager] Build inyectada exitosamente vía POST en LCU para invocador ID {}.",
                            sid
                        ));
                        lcu_applied = true;
                    } else {
                        registrar_automatizacion(&format!(
                            "[ItemSetManager Advertencia] Fallo al inyectar build vía API LCU: {:?}",
                            res_put
                        ));
                    }
                }
            }
        }
    }

    Ok(serde_json::json!({
        "success": written_path.is_some() || lcu_applied,
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

    #[test]
    fn test_construir_item_set_con_objetos_situacionales_y_build_order() {
        let build = json!({
            "starterItems": [1055, 2003],
            "buildOrder": [6676, 3031, 3036],
            "situationalItems": [
                { "itemId": 3026, "condition": "Armadura" },
                { "itemId": 3139, "condition": "Mercurial" }
            ],
            "boots": 3006
        });

        let item_set = construir_item_set(51, &build, Some("EAsy Caitlyn ADC"));

        assert_eq!(item_set["title"], "EAsy Caitlyn ADC");
        assert_eq!(item_set["associatedChampions"], json!([51]));

        let blocks = item_set["blocks"].as_array().expect("Debe contener array blocks");
        assert_eq!(blocks[1]["items"][0]["id"], "3006");
        assert_eq!(blocks[2]["items"][0]["id"], "6676");
        assert_eq!(blocks[3]["items"][0]["id"], "3026");
        assert_eq!(blocks[3]["items"][1]["id"], "3139");
    }
}
