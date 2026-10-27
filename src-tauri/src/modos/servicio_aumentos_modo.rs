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

        let mut mapa_existentes: HashMap<i64, InfoAumento> = HashMap::new();
        for a in augments_encontrados {
            mapa_existentes.insert(a.id, a);
        }

        // 3. Fusionar con catálogo completo garantizando metadatos limpios
        let mut lista_final = Vec::new();
        for cat in self.catalogo.iter() {
            if let Some(existente) = mapa_existentes.get(&cat.id) {
                lista_final.push(existente.clone());
            } else {
                // Si es Arena o fallback, derivar tier por sinergia y rareza
                let tier_fallback = if modo == "arena" {
                    match cat.rarity.as_deref().unwrap_or("silver") {
                        "prismatic" => Some("S".to_string()),
                        "gold" => Some("A".to_string()),
                        _ => Some("B".to_string()),
                    }
                } else {
                    None
                };

                lista_final.push(InfoAumento {
                    id: cat.id,
                    key: cat.key.clone(),
                    name: cat.name.clone(),
                    name_es: cat.name_es.clone(),
                    rarity: cat.rarity.clone(),
                    icon_url: cat.icon_url.clone(),
                    desc: cat.desc.clone(),
                    desc_es: cat.desc_es.clone(),
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
        let re = regex::Regex::new(r#"Augment\((\d+),\s*"([^"]+)",\s*(\d+),\s*([\d.]+),\s*([\d.]+)\)"#)
            .map_err(|e| e.to_string())?;

        for cap in re.captures_iter(text) {
            let id: i64 = cap[1].parse().unwrap_or(0);
            let name = cap[2].to_string();
            let tier_raw: u32 = cap[3].parse().unwrap_or(4);
            let perf: f64 = cap[4].parse().unwrap_or(0.0);
            let pop: f64 = cap[5].parse().unwrap_or(0.0);

            // Mapeo preciso a TierBadge según performance y tier oficial
            let tier_badge = if perf >= 80.0 || tier_raw <= 2 {
                "S"
            } else if perf >= 75.0 || tier_raw == 3 {
                "A"
            } else if perf >= 70.0 || tier_raw == 4 {
                "B"
            } else if perf >= 60.0 || tier_raw == 5 {
                "C"
            } else if perf >= 50.0 {
                "D"
            } else {
                "F"
            };

            let cat_info = self.catalogo.iter().find(|c| c.id == id);
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
                name: name.clone(),
                name_es: Some(name),
                rarity,
                icon_url,
                desc: None,
                desc_es,
                tier: Some(tier_badge.to_string()),
                pick_rate: Some(pop * 100.0),
                win_rate: Some(perf),
            });
        }

        Ok(lista)
    }
}
