/**
 * src-tauri/src/servicios/gestor_ajustes.rs
 * Gestor en memoria y sincronización de los ajustes de usuario (AppSettings).
 *
 * Permite que los servicios en segundo plano (AutoAccept, ChampSelect, etc.) lean
 * la configuración vigente en cada decisión en tiempo real sin reiniciar la app.
 */

use crate::bd::AlmacenamientoBd;
use crate::lcu::registro::registrar_automatizacion;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

fn default_true() -> bool {
    true
}

fn default_dos() -> f64 {
    2.0
}

fn default_uno() -> f64 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoAcceptSettings {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_dos")]
    pub delay_seconds: f64,
    #[serde(default = "default_true")]
    pub human_variance: bool,
}

impl Default for AutoAcceptSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            delay_seconds: 2.0,
            human_variance: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RolePreference {
    #[serde(default)]
    pub preferred_champions: Vec<i64>,
    #[serde(default)]
    pub fallback_champions: Vec<i64>,
    #[serde(default)]
    pub ban_champions: Vec<i64>,
    #[serde(default)]
    pub spells: Vec<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoChampSelectSettings {
    #[serde(default = "default_true")]
    pub auto_hover: bool,
    #[serde(default)]
    pub auto_pick: bool,
    #[serde(default)]
    pub auto_ban: bool,
    #[serde(default = "default_true")]
    pub auto_spells: bool,
    #[serde(default = "default_uno")]
    pub pick_delay_seconds: f64,
    #[serde(default)]
    pub role_preferences: HashMap<String, RolePreference>,
}

impl Default for AutoChampSelectSettings {
    fn default() -> Self {
        let mut role_preferences = HashMap::new();
        role_preferences.insert(
            "TOP".to_string(),
            RolePreference {
                preferred_champions: vec![],
                fallback_champions: vec![],
                ban_champions: vec![],
                spells: vec![4, 12],
            },
        );
        role_preferences.insert(
            "JUNGLE".to_string(),
            RolePreference {
                preferred_champions: vec![],
                fallback_champions: vec![],
                ban_champions: vec![],
                spells: vec![4, 11],
            },
        );
        role_preferences.insert(
            "MIDDLE".to_string(),
            RolePreference {
                preferred_champions: vec![],
                fallback_champions: vec![],
                ban_champions: vec![],
                spells: vec![4, 14],
            },
        );
        role_preferences.insert(
            "BOTTOM".to_string(),
            RolePreference {
                preferred_champions: vec![],
                fallback_champions: vec![],
                ban_champions: vec![],
                spells: vec![4, 7],
            },
        );
        role_preferences.insert(
            "UTILITY".to_string(),
            RolePreference {
                preferred_champions: vec![],
                fallback_champions: vec![],
                ban_champions: vec![],
                spells: vec![4, 3],
            },
        );
        role_preferences.insert(
            "FILL".to_string(),
            RolePreference {
                preferred_champions: vec![],
                fallback_champions: vec![],
                ban_champions: vec![],
                spells: vec![4, 14],
            },
        );

        Self {
            auto_hover: true,
            auto_pick: false,
            auto_ban: false,
            auto_spells: true,
            pick_delay_seconds: 1.0,
            role_preferences,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default)]
    pub auto_accept: AutoAcceptSettings,
    #[serde(default)]
    pub auto_champ_select: AutoChampSelectSettings,
    #[serde(default)]
    pub league_installation_path: Option<String>,
}

#[derive(Clone)]
pub struct GestorAjustes {
    bd: AlmacenamientoBd,
    ajustes_memoria: Arc<RwLock<AppSettings>>,
    raw_json: Arc<RwLock<serde_json::Value>>,
}

impl GestorAjustes {
    pub fn nuevo(bd: AlmacenamientoBd) -> Self {
        let mut defaults = serde_json::json!({
            "opggTier": "emerald_plus",
            "minMatchupSampleThreshold": 200,
            "allowAiChoiceTop3": false,
            "autoAccept": {
                "enabled": true,
                "delaySeconds": 2.0,
                "humanVariance": true
            },
            "autoChampSelect": {
                "autoHover": true,
                "autoPick": false,
                "autoBan": false,
                "autoSpells": true,
                "pickDelaySeconds": 1.0,
                "rolePreferences": {
                    "TOP": { "preferredChampions": [], "fallbackChampions": [], "banChampions": [], "spells": [4, 12] },
                    "JUNGLE": { "preferredChampions": [], "fallbackChampions": [], "banChampions": [], "spells": [4, 11] },
                    "MIDDLE": { "preferredChampions": [], "fallbackChampions": [], "banChampions": [], "spells": [4, 14] },
                    "BOTTOM": { "preferredChampions": [], "fallbackChampions": [], "banChampions": [], "spells": [4, 7] },
                    "UTILITY": { "preferredChampions": [], "fallbackChampions": [], "banChampions": [], "spells": [4, 3] },
                    "FILL": { "preferredChampions": [], "fallbackChampions": [], "banChampions": [], "spells": [4, 14] }
                }
            },
            "apiKeys": {
                "riotApiKeyEncrypted": "",
                "geminiApiKeyEncrypted": ""
            },
            "activeAccount": null,
            "leagueInstallationPath": "",
            "onboardingCompleted": true,
            "preferredLocale": "es_MX",
            "overlayEnabled": true
        });

        if let Ok(Some(s)) = bd.obtener_ajuste("app_settings") {
            if let Ok(serde_json::Value::Object(saved_obj)) = serde_json::from_str::<serde_json::Value>(&s) {
                if let serde_json::Value::Object(ref mut def_obj) = defaults {
                    for (k, v) in saved_obj {
                        def_obj.insert(k, v);
                    }
                }
            }
        }

        let parsed: AppSettings = serde_json::from_value(defaults.clone()).unwrap_or_default();

        Self {
            bd,
            ajustes_memoria: Arc::new(RwLock::new(parsed)),
            raw_json: Arc::new(RwLock::new(defaults)),
        }
    }

    pub async fn obtener(&self) -> AppSettings {
        self.ajustes_memoria.read().await.clone()
    }

    pub async fn obtener_json(&self) -> serde_json::Value {
        self.raw_json.read().await.clone()
    }

    pub async fn guardar(&self, nuevo_json: serde_json::Value) -> Result<(), String> {
        let mut def = self.raw_json.read().await.clone();
        if let (serde_json::Value::Object(ref mut def_map), serde_json::Value::Object(new_map)) =
            (&mut def, &nuevo_json)
        {
            for (k, v) in new_map {
                def_map.insert(k.clone(), v.clone());
            }
        } else {
            def = nuevo_json;
        }

        let parsed: AppSettings = serde_json::from_value(def.clone())
            .map_err(|e| format!("Error deserializando ajustes: {}", e))?;

        if let Ok(s) = serde_json::to_string(&def) {
            let _ = self.bd.guardar_ajuste("app_settings", &s);
        }

        *self.ajustes_memoria.write().await = parsed;
        *self.raw_json.write().await = def;

        registrar_automatizacion("[GestorAjustes] Ajustes actualizados y propagados en caliente a todos los servicios.");
        Ok(())
    }
}
