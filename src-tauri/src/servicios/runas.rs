/**
 * src-tauri/src/servicios/runas.rs
 * Gestor de páginas de runas de League of Legends vía LCU API (/lol-perks/v1).
 *
 * Valida los 9 perks requeridos, reutiliza páginas previas de EAsy o la activa editable,
 * respeta el límite de 8 páginas de Riot y activa la página mediante /lol-perks/v1/currentpage.
 */

use crate::lcu::cliente_lcu::ClienteLcu;
use crate::lcu::registro::registrar_automatizacion;
use serde::{Deserialize, Serialize};
use serde_json::Value;

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunePage {
    #[serde(default)]
    pub id: Option<i64>,
    #[serde(default = "default_nombre_runas")]
    pub name: String,
    pub primary_style_id: i64,
    pub sub_style_id: i64,
    pub selected_perk_ids: Vec<i64>,
    #[serde(default = "default_true")]
    pub current: bool,
    #[serde(default)]
    pub is_editable: Option<bool>,
}

fn default_nombre_runas() -> String {
    "EAsy".to_string()
}

pub fn validar_pagina_runas(pagina: &RunePage) -> Result<(), String> {
    if pagina.name.trim().is_empty() {
        return Err("La página de runas requiere un nombre válido.".to_string());
    }
    if pagina.primary_style_id <= 0 || pagina.sub_style_id <= 0 {
        return Err("La página de runas requiere primaryStyleId y subStyleId válidos.".to_string());
    }
    if pagina.selected_perk_ids.len() != 9 {
        return Err(format!(
            "La página de runas debe contener exactamente 9 perks seleccionados (recibidos: {}).",
            pagina.selected_perk_ids.len()
        ));
    }
    if pagina.selected_perk_ids.iter().any(|&p| p <= 0) {
        return Err("Todos los perks seleccionados deben ser identificadores numéricos positivos.".to_string());
    }
    Ok(())
}

pub async fn aplicar_pagina_runas(
    cliente: &ClienteLcu,
    mut pagina: RunePage,
) -> Result<Value, String> {
    validar_pagina_runas(&pagina)?;

    registrar_automatizacion(&format!(
        "[RuneManager] Iniciando aplicación de runas: Estilo {} / Sub-estilo {} (9 perks)...",
        pagina.primary_style_id, pagina.sub_style_id
    ));

    // Si ya trae ID explícito, sobrescribir directamente
    if let Some(target_id) = pagina.id {
        pagina.current = true;
        cliente.put_vacio(&format!("/lol-perks/v1/pages/{}", target_id), &pagina).await?;
        let _ = cliente.put_vacio("/lol-perks/v1/currentpage", &target_id).await;
        registrar_automatizacion(&format!("[RuneManager] Runas sobrescritas en página ID {}.", target_id));
        return Ok(serde_json::json!({
            "success": true,
            "pageId": target_id,
            "creada": false,
            "sobrescrita": true
        }));
    }

    // Obtener páginas existentes
    let paginas: Vec<Value> = match cliente.get_json("/lol-perks/v1/pages").await {
        Ok(p) => p,
        Err(e) => {
            registrar_automatizacion(&format!("[RuneManager ERROR] No se pudieron obtener páginas de runas: {}", e));
            vec![]
        }
    };

    // 1. Reutilizar página existente de la app ("EAsy", "[IL]", "Itero")
    let mut id_reutilizable = None;
    let mut paginas_residuales = Vec::new();

    for p in &paginas {
        let is_editable = p.get("isEditable").and_then(|v| v.as_bool()).unwrap_or(true);
        let pid = p.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
        let nombre = p.get("name").and_then(|v| v.as_str()).unwrap_or("");

        if is_editable && pid > 0 && (nombre.starts_with("EAsy") || nombre.starts_with("[IL]") || nombre.starts_with("Itero")) {
            if id_reutilizable.is_none() {
                id_reutilizable = Some(pid);
            } else {
                paginas_residuales.push(pid);
            }
        }
    }

    // Limpiar páginas residuales
    for pid in paginas_residuales {
        let _ = cliente.delete_vacio(&format!("/lol-perks/v1/pages/{}", pid)).await;
    }

    if let Some(target_id) = id_reutilizable {
        pagina.id = Some(target_id);
        pagina.current = true;
        pagina.name = "EAsy".to_string();
        cliente.put_vacio(&format!("/lol-perks/v1/pages/{}", target_id), &pagina).await?;
        let _ = cliente.put_vacio("/lol-perks/v1/currentpage", &target_id).await;
        registrar_automatizacion(&format!("[RuneManager] Página previa de EAsy (ID {}) reutilizada y activada.", target_id));
        return Ok(serde_json::json!({
            "success": true,
            "pageId": target_id,
            "creada": false,
            "sobrescrita": true
        }));
    }

    // 2. Reutilizar la página activa si es editable
    let activa_editable = paginas.iter().find(|p| {
        p.get("current").and_then(|v| v.as_bool()).unwrap_or(false)
            && p.get("isEditable").and_then(|v| v.as_bool()).unwrap_or(true)
            && p.get("id").and_then(|v| v.as_i64()).unwrap_or(0) > 0
    });

    if let Some(act) = activa_editable {
        let target_id = act.get("id").and_then(|v| v.as_i64()).unwrap();
        pagina.id = Some(target_id);
        pagina.current = true;
        pagina.name = "EAsy".to_string();
        cliente.put_vacio(&format!("/lol-perks/v1/pages/{}", target_id), &pagina).await?;
        let _ = cliente.put_vacio("/lol-perks/v1/currentpage", &target_id).await;
        registrar_automatizacion(&format!("[RuneManager] Página activa editable (ID {}) sobrescrita.", target_id));
        return Ok(serde_json::json!({
            "success": true,
            "pageId": target_id,
            "creada": false,
            "sobrescrita": true
        }));
    }

    // 3. Crear nueva página si hay espacio (< 8 páginas editables)
    let editables_count = paginas
        .iter()
        .filter(|p| p.get("isEditable").and_then(|v| v.as_bool()).unwrap_or(true))
        .count();

    if editables_count < 8 {
        pagina.id = None;
        pagina.current = true;
        pagina.name = "EAsy".to_string();
        match cliente.post_json::<RunePage, Value>("/lol-perks/v1/pages", &pagina).await {
            Ok(creada) => {
                let pid = creada.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
                if pid > 0 {
                    let _ = cliente.put_vacio("/lol-perks/v1/currentpage", &pid).await;
                }
                registrar_automatizacion(&format!("[RuneManager] Nueva página de runas creada con ID {}.", pid));
                return Ok(serde_json::json!({
                    "success": true,
                    "pageId": pid,
                    "creada": true,
                    "sobrescrita": false
                }));
            }
            Err(e) => {
                registrar_automatizacion(&format!("[RuneManager Advertencia] Fallo al crear página de runas: {}", e));
            }
        }
    }

    // 4. Límite de 8 alcanzado: sobrescribir la primera página editable
    let primera_editable = paginas.iter().find(|p| {
        p.get("isEditable").and_then(|v| v.as_bool()).unwrap_or(true)
            && p.get("id").and_then(|v| v.as_i64()).unwrap_or(0) > 0
    });

    if let Some(prim) = primera_editable {
        let target_id = prim.get("id").and_then(|v| v.as_i64()).unwrap();
        pagina.id = Some(target_id);
        pagina.current = true;
        pagina.name = "EAsy".to_string();
        cliente.put_vacio(&format!("/lol-perks/v1/pages/{}", target_id), &pagina).await?;
        let _ = cliente.put_vacio("/lol-perks/v1/currentpage", &target_id).await;
        registrar_automatizacion(&format!("[RuneManager] Sobrescrita primera página editable (ID {}) por límite de páginas.", target_id));
        return Ok(serde_json::json!({
            "success": true,
            "pageId": target_id,
            "creada": false,
            "sobrescrita": true
        }));
    }

    Err("No se pudo aplicar la página de runas (no se encontraron páginas editables ni espacio disponible).".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validar_pagina_runas_valida() {
        let pagina = RunePage {
            id: None,
            name: "EAsy Jinx".to_string(),
            primary_style_id: 8000,
            sub_style_id: 8100,
            selected_perk_ids: vec![8005, 9111, 9104, 8014, 8126, 8135, 5008, 5008, 5002],
            current: true,
            is_editable: Some(true),
        };
        assert!(validar_pagina_runas(&pagina).is_ok());
    }

    #[test]
    fn test_validar_pagina_runas_invalida_menos_perks() {
        let pagina = RunePage {
            id: None,
            name: "EAsy Incompleta".to_string(),
            primary_style_id: 8000,
            sub_style_id: 8100,
            selected_perk_ids: vec![8005, 9111, 9104], // Solo 3 perks
            current: true,
            is_editable: Some(true),
        };
        assert!(validar_pagina_runas(&pagina).is_err());
    }
}
