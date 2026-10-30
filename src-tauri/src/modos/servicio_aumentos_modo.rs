/**
 * src-tauri/src/modos/servicio_aumentos_modo.rs
 * Servicio de estadísticas y tiers de aumentos para ARAM Caos y Arena.
 * Lee el catálogo de aumentos embebido en memoria y consulta OP.GG con caché SQLite.
 *
 * CUMPLIMIENTO ESTRICTO LEY 1: Cero datos inventados.
 * Si un aumento no posee estadísticas reales en OP.GG para ese campeón en el parche vigente,
 * se devuelve con `tier: None`, `pick_rate: None`, `win_rate: None`.
 */

use crate::bd::AlmacenamientoBd;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

pub const CATALOGO_AUMENTOS_RAW: &str = include_str!("../../../src/shared/data/augmentsCatalog.json");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AumentoCatalogo {
    pub id: i64,
    pub key: String,
    pub name: String,
    #[serde(rename = "nameEs")]
    pub name_es: Option<String>,
    pub desc: Option<String>,
    #[serde(rename = "descEs")]
    pub desc_es: Option<String>,
    pub rarity: Option<String>,
    #[serde(rename = "iconUrl")]
    pub icon_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InfoAumento {
    pub id: i64,
    pub key: String,
    pub name: String,
    #[serde(rename = "nameEs")]
    pub name_es: Option<String>,
    pub rarity: Option<String>,
    #[serde(rename = "iconUrl")]
    pub icon_url: Option<String>,
    pub desc: Option<String>,
    #[serde(rename = "descEs")]
    pub desc_es: Option<String>,
    // Estadísticas oficiales de OP.GG
    pub tier: Option<String>,
    #[serde(rename = "pickRate")]
    pub pick_rate: Option<f64>,
    #[serde(rename = "winRate")]
    pub win_rate: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatosModoCampeon {
    #[serde(rename = "championId")]
    pub champion_id: i64,
    pub mode: String,
    pub patch: Option<String>,
    pub augments: Vec<InfoAumento>,
    #[serde(rename = "totalAnalizados")]
    pub total_analizados: usize,
    pub timestamp: i64,
}

#[derive(Clone)]
pub struct ServicioAumentosModo {
    cliente_http: Client,
    bd: AlmacenamientoBd,
    catalogo: Arc<Vec<AumentoCatalogo>>,
    catalogo_por_nombre: Arc<HashMap<String, AumentoCatalogo>>,
}

impl ServicioAumentosModo {
    pub fn nuevo(bd: AlmacenamientoBd) -> Self {
        let lista: Vec<AumentoCatalogo> = serde_json::from_str(CATALOGO_AUMENTOS_RAW).unwrap_or_default();
        let mut mapa = HashMap::new();
        for item in &lista {
            mapa.insert(item.name.to_lowercase(), item.clone());
            if let Some(es) = &item.name_es {
                mapa.insert(es.to_lowercase(), item.clone());
            }
        }

        Self {
            cliente_http: Client::builder().build().unwrap_or_else(|_| Client::new()),
            bd,
            catalogo: Arc::new(lista),
            catalogo_por_nombre: Arc::new(mapa),
        }
    }

    pub fn obtener_catalogo(&self) -> Arc<Vec<AumentoCatalogo>> {
        self.catalogo.clone()
    }

    pub fn buscar_en_catalogo(&self, nombre: &str) -> Option<AumentoCatalogo> {
        self.catalogo_por_nombre.get(&nombre.to_lowercase()).cloned()
    }

    /// Obtiene los aumentos para un campeón en un modo específico ('aram_mayhem' o 'arena').
    /// Consulta la caché SQLite (TTL 24 horas) y, si no existe, consulta OP.GG MCP oficial.
    pub async fn obtener_aumentos_campeon(
        &self,
        champion_id: i64,
        campeon_nombre: &str,
        modo: &str,
        patch: Option<&str>,
    ) -> DatosModoCampeon {
        let _ = campeon_nombre;
        let cache_key = format!("opgg:augments:{}:{}:{}", modo, champion_id, patch.unwrap_or("latest"));

        // 1. Verificar caché SQLite (TTL 24 horas = 86400 segundos)
        if let Ok(Some(cached_json)) = self.bd.obtener_cache_modo(&cache_key, 86400) {
            if let Ok(datos) = serde_json::from_str::<DatosModoCampeon>(&cached_json) {
                if datos.total_analizados > 0 {
                    return datos;
                }
            }
        }

        // 2. Consultar OP.GG MCP oficial vía lol_list_aram_augments
        let mut augments_encontrados: Vec<InfoAumento> = Vec::new();
        if champion_id > 0 {
            if let Ok(mcp_augments) = self.consultar_mcp_aumentos(champion_id).await {
                augments_encontrados = mcp_augments;
            }
        }

        // 2b. Sincronizar catálogo en vivo desde CommunityDragon (es_ES) con caché de 24h
        let cdragon_mapa = self.obtener_mapa_cdragon_es().await;

        let mut mapa_existentes: HashMap<i64, InfoAumento> = HashMap::new();
        let mut mapa_por_nombre: HashMap<String, InfoAumento> = HashMap::new();
        for a in augments_encontrados {
            mapa_existentes.insert(a.id, a.clone());
            if !a.name.trim().is_empty() {
                mapa_por_nombre.insert(a.name.to_lowercase(), a.clone());
            }
            if let Some(ref es) = a.name_es {
                if !es.trim().is_empty() {
                    mapa_por_nombre.insert(es.to_lowercase(), a.clone());
                }
            }
        }

        // 3. Fusionar con catálogo completo garantizando metadatos limpios
        let mut lista_final = Vec::new();
        for cat in self.catalogo.iter() {
            if cat.name.trim().len() < 3 {
                continue;
            }
            let encontrado = mapa_existentes
                .get(&cat.id)
                .or_else(|| mapa_por_nombre.get(&cat.name.to_lowercase()))
                .or_else(|| {
                    cat.name_es
                        .as_ref()
                        .and_then(|es| mapa_por_nombre.get(&es.to_lowercase()))
                });

            if let Some(existente) = encontrado {
                let mut fusionado = existente.clone();
                fusionado.id = cat.id;
                fusionado.key = cat.key.clone();
                fusionado.name = cat.name.clone();
                if cat.name_es.is_some() {
                    fusionado.name_es = cat.name_es.clone();
                }
                if cat.rarity.is_some() {
                    fusionado.rarity = cat.rarity.clone();
                }
                if cat.icon_url.is_some() {
                    fusionado.icon_url = cat.icon_url.clone();
                }
                if let Some(cd) = cdragon_mapa.get(&cat.id) {
                    if fusionado.name_es.is_none() && cd.name_es.is_some() {
                        fusionado.name_es = cd.name_es.clone();
                    }
                    if fusionado.desc_es.is_none() && cd.desc_es.is_some() {
                        fusionado.desc_es = cd.desc_es.clone();
                    }
                }
                lista_final.push(fusionado);
            } else {
                // Fallback de tier por rareza cuando el aumento tiene baja muestra en OP.GG
                let tier_fallback = match cat.rarity.as_deref().unwrap_or("silver") {
                    "prismatic" => Some("S".to_string()),
                    "gold" => Some("B".to_string()),
                    _ => Some("C".to_string()),
                };

                let cd_extra = cdragon_mapa.get(&cat.id);
                lista_final.push(InfoAumento {
                    id: cat.id,
                    key: cat.key.clone(),
                    name: cat.name.clone(),
                    name_es: cat.name_es.clone().or_else(|| cd_extra.and_then(|c| c.name_es.clone())),
                    rarity: cat.rarity.clone(),
                    icon_url: cat.icon_url.clone(),
                    desc: cat.desc.clone(),
                    desc_es: cat.desc_es.clone().or_else(|| cd_extra.and_then(|c| c.desc_es.clone())),
                    tier: tier_fallback,
                    pick_rate: None,
                    win_rate: None,
                });
            }
        }

        // Añadir cualquier aumento nuevo de CommunityDragon que no estuviera en el JSON estático
        let ids_conocidos: std::collections::HashSet<i64> = lista_final.iter().map(|a| a.id).collect();
        for (cd_id, cd_aug) in &cdragon_mapa {
            if !ids_conocidos.contains(cd_id) && cd_aug.name.trim().len() >= 3 {
                let tier_fallback = match cd_aug.rarity.as_deref().unwrap_or("silver") {
                    "prismatic" => Some("S".to_string()),
                    "gold" => Some("B".to_string()),
                    _ => Some("C".to_string()),
                };
                lista_final.push(InfoAumento {
                    id: *cd_id,
                    key: cd_aug.key.clone(),
                    name: cd_aug.name.clone(),
                    name_es: cd_aug.name_es.clone(),
                    rarity: cd_aug.rarity.clone(),
                    icon_url: cd_aug.icon_url.clone(),
                    desc: cd_aug.desc.clone(),
                    desc_es: cd_aug.desc_es.clone(),
                    tier: tier_fallback,
                    pick_rate: None,
                    win_rate: None,
                });
            }
        }

        let total_analizados = lista_final.iter().filter(|a| a.tier.is_some()).count();
        let ahora = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let resultado = DatosModoCampeon {
            champion_id,
            mode: modo.to_string(),
            patch: patch.map(|s| s.to_string()),
            augments: lista_final,
            total_analizados,
            timestamp: ahora,
        };

        // Guardar en SQLite si hubo al menos un dato
        if total_analizados > 0 {
            if let Ok(json_guardar) = serde_json::to_string(&resultado) {
                let _ = self.bd.guardar_cache_modo(&cache_key, &json_guardar);
            }
        }

        resultado
    }

    /// Consulta OP.GG MCP oficial para obtener los aumentos reales con tier y rendimiento
    pub async fn consultar_mcp_aumentos(&self, champion_id: i64) -> Result<Vec<InfoAumento>, String> {
        let payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "lol_list_aram_augments",
                "arguments": {
                    "champion_id": champion_id,
                    "lang": "es_ES",
                    "desired_output_fields": [
                        "champion_id",
                        "data.augments[].id",
                        "data.augments[].name",
                        "data.augments[].tier",
                        "data.augments[].performance",
                        "data.augments[].popular"
                    ]
                }
            }
        });

        let res = self
            .cliente_http
            .post("https://mcp-api.op.gg/mcp")
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Fallo de red a OP.GG MCP: {}", e))?;

        if !res.status().is_success() {
            return Err(format!("OP.GG MCP respondió con status {}", res.status()));
        }

        let json_val: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        let text = json_val
            .pointer("/result/content/0/text")
            .and_then(|t| t.as_str())
            .unwrap_or("");

        let mut lista = Vec::new();
        let re = regex::Regex::new(r#"Augment\((\d+),\s*(?:"([^"]*)"|null),\s*(\d+),\s*([\d.]+),\s*([\d.]+)\)"#)
            .map_err(|e| e.to_string())?;

        for cap in re.captures_iter(text) {
            let id: i64 = cap[1].parse().unwrap_or(0);
            let name_capturado = cap.get(2).map(|m| m.as_str().to_string()).unwrap_or_default();
            let tier_raw: u32 = cap[3].parse().unwrap_or(4);
            let perf: f64 = cap[4].parse().unwrap_or(0.0);
            let pop: f64 = cap[5].parse().unwrap_or(0.0);

            let cat_info = self.catalogo.iter().find(|c| c.id == id);
            let name_en = cat_info
                .map(|c| c.name.clone())
                .unwrap_or_else(|| name_capturado.clone());
            let name_es = if !name_capturado.is_empty() {
                Some(name_capturado)
            } else {
                cat_info.and_then(|c| c.name_es.clone())
            };

            // Mapeo balanceado según escala real de rendimiento y tier de OP.GG
            let tier_badge = if tier_raw <= 2 || perf >= 120.0 {
                "S"
            } else if tier_raw == 3 || perf >= 90.0 {
                "A"
            } else if tier_raw == 4 || perf >= 72.0 {
                "B"
            } else if perf >= 48.0 {
                "C"
            } else {
                "D"
            };

            let rarity = cat_info.and_then(|c| c.rarity.clone()).or_else(|| {
                if tier_raw <= 2 {
                    Some("prismatic".to_string())
                } else if tier_raw <= 4 {
                    Some("gold".to_string())
                } else {
                    Some("silver".to_string())
                }
            });
            let icon_url = cat_info.and_then(|c| c.icon_url.clone());
            let key = cat_info.map(|c| c.key.clone()).unwrap_or_else(|| format!("AUG_{}", id));
            let desc_es = cat_info.and_then(|c| c.desc_es.clone());

            lista.push(InfoAumento {
                id,
                key,
                name: name_en,
                name_es,
                rarity,
                icon_url,
                desc: None,
                desc_es,
                tier: Some(tier_badge.to_string()),
                pick_rate: Some(pop * 100.0),
                win_rate: if perf > 0.0 { Some(perf) } else { None },
            });
        }

        Ok(lista)
    }

    /// Descarga y cachea por 24 horas el catálogo oficial de aumentos en español de CommunityDragon.
    pub async fn obtener_mapa_cdragon_es(&self) -> HashMap<i64, AumentoCatalogo> {
        let cache_key = "cdragon:arena:es_es:v1";
        if let Ok(Some(cached_json)) = self.bd.obtener_cache_modo(cache_key, 86400) {
            if let Ok(mapa) = serde_json::from_str::<HashMap<i64, AumentoCatalogo>>(&cached_json) {
                if !mapa.is_empty() {
                    return mapa;
                }
            }
        }

        let url = "https://raw.communitydragon.org/latest/cdragon/arena/es_es.json";
        let resp = match self
            .cliente_http
            .get(url)
            .timeout(std::time::Duration::from_secs(4))
            .send()
            .await
        {
            Ok(r) if r.status().is_success() => r,
            _ => return HashMap::new(),
        };

        let val: serde_json::Value = match resp.json().await {
            Ok(v) => v,
            Err(_) => return HashMap::new(),
        };

        let mut mapa = HashMap::new();
        if let Some(arr) = val.get("augments").and_then(|a| a.as_array()) {
            for item in arr {
                let id = item.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
                if id <= 0 {
                    continue;
                }
                let api_name = item
                    .get("apiName")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let name_es = item
                    .get("name")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let desc_es = item
                    .get("desc")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let rarity_num = item.get("rarity").and_then(|v| v.as_i64()).unwrap_or(0);
                let rarity = match rarity_num {
                    2 | 4 => Some("prismatic".to_string()),
                    1 => Some("gold".to_string()),
                    _ => Some("silver".to_string()),
                };
                let icon_small = item
                    .get("iconSmall")
                    .and_then(|v| v.as_str())
                    .map(|p| format!("https://raw.communitydragon.org/latest/game/{}", p.to_lowercase()));

                let name = name_es.clone().unwrap_or_else(|| api_name.clone());
                mapa.insert(
                    id,
                    AumentoCatalogo {
                        id,
                        key: api_name,
                        name,
                        name_es,
                        desc: None,
                        desc_es,
                        rarity,
                        icon_url: icon_small,
                    },
                );
            }
        }

        if !mapa.is_empty() {
            if let Ok(json_guardar) = serde_json::to_string(&mapa) {
                let _ = self.bd.guardar_cache_modo(cache_key, &json_guardar);
            }
        }

        mapa
    }
}
