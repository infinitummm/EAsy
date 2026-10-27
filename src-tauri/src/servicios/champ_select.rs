/**
 * src-tauri/src/servicios/champ_select.rs
 * Motor de automatización de Champ Select (Auto-Hover, Auto-Pick, Auto-Ban y Auto-Spells).
 *
 * Resuelve las acciones mediante lógica pura garantizando idempotencia, cola serial
 * de procesamiento sin carreras, y trazabilidad completa de cada decisión.
 */

use super::gestor_ajustes::GestorAjustes;
use crate::lcu::cliente_lcu::ClienteLcu;
use crate::lcu::registro::registrar_automatizacion;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "tipo", rename_all = "camelCase")]
pub enum AccionChampSelect {
    #[serde(rename_all = "camelCase")]
    Pick {
        action_id: i64,
        champion_id: i64,
        completada: bool,
    },
    #[serde(rename_all = "camelCase")]
    Ban {
        action_id: i64,
        champion_id: i64,
        completada: bool,
    },
    #[serde(rename_all = "camelCase")]
    Hechizos {
        celda: i64,
        spell1_id: i64,
        spell2_id: i64,
    },
}

#[derive(Debug, Clone)]
pub struct PlanChampSelect {
    pub celda_local: i64,
    pub rol: String,
    pub candidatos_pick: Vec<i64>,
    pub candidatos_ban: Vec<i64>,
    pub acciones: Vec<AccionChampSelect>,
}

pub fn normalizar_rol(posicion: Option<&str>) -> String {
    let limpia = posicion.unwrap_or("").to_uppercase();
    match limpia.as_str() {
        "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY" => limpia,
        _ => "FILL".to_string(),
    }
}

pub fn resolver_plan_champ_select(
    sesion: &Value,
    ajustes: &crate::servicios::gestor_ajustes::AutoChampSelectSettings,
    bannable_ids: &[i64],
    objetivo_recordado: Option<i64>,
) -> Option<PlanChampSelect> {
    let celda_local = sesion.get("localPlayerCellId").and_then(|v| v.as_i64())?;
    let my_team = sesion.get("myTeam").and_then(|v| v.as_array())?;

    let jugador_local = my_team.iter().find(|j| {
        j.get("cellId").and_then(|v| v.as_i64()) == Some(celda_local)
    })?;

    let rol = normalizar_rol(jugador_local.get("assignedPosition").and_then(|v| v.as_str()));
    let prefs_rol = ajustes
        .role_preferences
        .get(&rol)
        .cloned()
        .or_else(|| ajustes.role_preferences.get("FILL").cloned())
        .unwrap_or_default();

    // Campeones baneados por ambos equipos
    let mut baneados = HashSet::new();
    if let Some(bans) = sesion.get("bans") {
        if let Some(my_bans) = bans.get("myTeamBans").and_then(|v| v.as_array()) {
            for b in my_bans {
                if let Some(id) = b.as_i64() {
                    if id > 0 {
                        baneados.insert(id);
                    }
                }
            }
        }
        if let Some(their_bans) = bans.get("theirTeamBans").and_then(|v| v.as_array()) {
            for b in their_bans {
                if let Some(id) = b.as_i64() {
                    if id > 0 {
                        baneados.insert(id);
                    }
                }
            }
        }
    }

    // Campeones comprometidos o intencionados por aliados (excluyendo al jugador local)
    let mut comprometidos_aliados = HashSet::new();
    for aliado in my_team {
        let celda_aliado = aliado.get("cellId").and_then(|v| v.as_i64()).unwrap_or(-1);
        if celda_aliado == celda_local {
            continue;
        }
        if let Some(champ_id) = aliado.get("championId").and_then(|v| v.as_i64()) {
            if champ_id > 0 {
                comprometidos_aliados.insert(champ_id);
            }
        }
        if let Some(pick_intent) = aliado.get("championPickIntent").and_then(|v| v.as_i64()) {
            if pick_intent > 0 {
                comprometidos_aliados.insert(pick_intent);
            }
        }
    }

    // Candidatos para Pick
    let mut candidatos_raw = Vec::new();
    candidatos_raw.extend(prefs_rol.preferred_champions.iter().cloned());
    candidatos_raw.extend(prefs_rol.fallback_champions.iter().cloned());

    let mut set_pick = HashSet::new();
    let mut candidatos_pick = Vec::new();
    for id in candidatos_raw {
        if id > 0 && !baneados.contains(&id) && !comprometidos_aliados.contains(&id) && set_pick.insert(id) {
            candidatos_pick.push(id);
        }
    }

    let pick_intent_local = jugador_local.get("championPickIntent").and_then(|v| v.as_i64()).unwrap_or(0);
    let candidato_pick = candidatos_pick
        .first()
        .cloned()
        .or_else(|| if pick_intent_local > 0 { Some(pick_intent_local) } else { None });

    // Campeones propios a no banear
    let mut propios = HashSet::new();
    if let Some(cid) = jugador_local.get("championId").and_then(|v| v.as_i64()) {
        if cid > 0 {
            propios.insert(cid);
        }
    }
    if pick_intent_local > 0 {
        propios.insert(pick_intent_local);
    }
    if let Some(cp) = candidato_pick {
        propios.insert(cp);
    }

    let set_bannables: Option<HashSet<i64>> = if !bannable_ids.is_empty() {
        Some(bannable_ids.iter().cloned().collect())
    } else {
        None
    };

    // Candidatos para Ban: usar los del rol asignado o respaldo de FILL
    let mut pool_ban = prefs_rol.ban_champions.clone();
    if pool_ban.is_empty() {
        if let Some(fill_pref) = ajustes.role_preferences.get("FILL") {
            pool_ban = fill_pref.ban_champions.clone();
        }
    }

    let mut set_ban = HashSet::new();
    let mut candidatos_ban = Vec::new();
    for id in &pool_ban {
        let id = *id;
        if id > 0
            && !baneados.contains(&id)
            && !comprometidos_aliados.contains(&id)
            && !propios.contains(&id)
            && set_bannables.as_ref().map_or(true, |sb| sb.contains(&id))
            && set_ban.insert(id)
        {
            candidatos_ban.push(id);
        }
    }

    // Si el filtro de bannables descartó todo, probar sin restricción local
    if candidatos_ban.is_empty() && set_bannables.is_some() {
        for id in &pool_ban {
            let id = *id;
            if id > 0
                && !baneados.contains(&id)
                && !comprometidos_aliados.contains(&id)
                && !propios.contains(&id)
                && set_ban.insert(id)
            {
                candidatos_ban.push(id);
            }
        }
    }

    // Buscar acciones activas en progreso
    let mut accion_ban_opt = None;
    let mut accion_pick_opt = None;

    if let Some(actions) = sesion.get("actions").and_then(|v| v.as_array()) {
        for fila in actions {
            if let Some(arr_fila) = fila.as_array() {
                for act in arr_fila {
                    let actor_cell = act.get("actorCellId").and_then(|v| v.as_i64()).unwrap_or(-1);
                    let tipo_act = act.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    let in_prog = act.get("isInProgress").and_then(|v| v.as_bool()).unwrap_or(false);
                    let completed = act.get("completed").and_then(|v| v.as_bool()).unwrap_or(false);
                    let action_id = act.get("id").and_then(|v| v.as_i64()).unwrap_or(0);

                    if actor_cell == celda_local && in_prog && !completed {
                        if tipo_act == "ban" {
                            accion_ban_opt = Some(action_id);
                        } else if tipo_act == "pick" {
                            accion_pick_opt = Some(action_id);
                        }
                    }
                }
            }
        }
    }

    let mut acciones = Vec::new();

    // 1. Planificar Ban
    if let Some(act_id) = accion_ban_opt {
        if ajustes.auto_ban && !candidatos_ban.is_empty() {
            acciones.push(AccionChampSelect::Ban {
                action_id: act_id,
                champion_id: candidatos_ban[0],
                completada: true,
            });
        }
    }

    // 2. Planificar Pick / Hover
    if let Some(act_id) = accion_pick_opt {
        if let Some(cand_pick) = candidato_pick {
            if ajustes.auto_pick {
                acciones.push(AccionChampSelect::Pick {
                    action_id: act_id,
                    champion_id: cand_pick,
                    completada: true,
                });
            } else if ajustes.auto_hover {
                acciones.push(AccionChampSelect::Pick {
                    action_id: act_id,
                    champion_id: cand_pick,
                    completada: false,
                });
            }
        }
    }

    // 3. Planificar Hechizos
    let hay_contexto = jugador_local.get("championId").and_then(|v| v.as_i64()).unwrap_or(0) > 0
        || objetivo_recordado.is_some()
        || (accion_pick_opt.is_some() && candidato_pick.is_some());

    if ajustes.auto_spells && hay_contexto && prefs_rol.spells.len() == 2 && prefs_rol.spells[0] > 0 && prefs_rol.spells[1] > 0 {
        let spell1 = prefs_rol.spells[0];
        let spell2 = prefs_rol.spells[1];
        let cur_s1 = jugador_local.get("spell1Id").and_then(|v| v.as_i64()).unwrap_or(0);
        let cur_s2 = jugador_local.get("spell2Id").and_then(|v| v.as_i64()).unwrap_or(0);

        if cur_s1 != spell1 || cur_s2 != spell2 {
            acciones.push(AccionChampSelect::Hechizos {
                celda: celda_local,
                spell1_id: spell1,
                spell2_id: spell2,
            });
        }
    }

    Some(PlanChampSelect {
        celda_local,
        rol,
        candidatos_pick,
        candidatos_ban,
        acciones,
    })
}

#[derive(Clone)]
pub struct ChampSelectService {
    gestor_ajustes: Arc<GestorAjustes>,
    cliente_lcu: ClienteLcu,
    app_handle: AppHandle,
    tx_sesion: mpsc::Sender<Option<Value>>,
    clave_pick: Arc<Mutex<Option<String>>>,
    clave_ban: Arc<Mutex<Option<String>>>,
    clave_hechizos: Arc<Mutex<Option<String>>>,
    objetivo_recordado: Arc<Mutex<Option<i64>>>,
}

impl ChampSelectService {
    pub fn nuevo(
        gestor_ajustes: Arc<GestorAjustes>,
        cliente_lcu: ClienteLcu,
        app_handle: AppHandle,
    ) -> Self {
        let (tx, mut rx) = mpsc::channel::<Option<Value>>(64);

        let s = Self {
            gestor_ajustes,
            cliente_lcu,
            app_handle,
            tx_sesion: tx,
            clave_pick: Arc::new(Mutex::new(None)),
            clave_ban: Arc::new(Mutex::new(None)),
            clave_hechizos: Arc::new(Mutex::new(None)),
            objetivo_recordado: Arc::new(Mutex::new(None)),
        };

        let mut servicio_worker = s.clone();

        tauri::async_runtime::spawn(async move {
            registrar_automatizacion("[AutoChampSelect] Bucle de eventos serializados de selección de campeones iniciado.");
            while let Some(sesion_opt) = rx.recv().await {
                servicio_worker.ejecutar_ciclo(sesion_opt).await;
            }
        });

        s
    }

    pub async fn encolar_sesion(&self, sesion: Option<Value>) {
        let _ = self.tx_sesion.send(sesion).await;
    }

    pub async fn reiniciar_estado(&self) {
        *self.clave_pick.lock().await = None;
        *self.clave_ban.lock().await = None;
        *self.clave_hechizos.lock().await = None;
        *self.objetivo_recordado.lock().await = None;
        registrar_automatizacion("[AutoChampSelect] Estado reseteado al salir de selección de campeones.");
    }

    async fn ejecutar_ciclo(&mut self, sesion_opt: Option<Value>) {
        let sesion = match sesion_opt {
            Some(s) if !s.is_null() => s,
            _ => {
                self.reiniciar_estado().await;
                return;
            }
        };

        let ajustes = self.gestor_ajustes.obtener().await;
        let bannable_ids: Vec<i64> = if ajustes.auto_champ_select.auto_ban {
            self.cliente_lcu
                .get_json::<Vec<i64>>("/lol-champ-select/v1/bannable-champion-ids")
                .await
                .unwrap_or_default()
        } else {
            vec![]
        };

        let obj_previo = *self.objetivo_recordado.lock().await;
        let plan_opt = resolver_plan_champ_select(
            &sesion,
            &ajustes.auto_champ_select,
            &bannable_ids,
            obj_previo,
        );

        let plan = match plan_opt {
            Some(p) => p,
            None => {
                registrar_automatizacion("[AutoChampSelect] La sesión no contiene al jugador local o no está activa.");
                return;
            }
        };

        registrar_automatizacion(&format!(
            "[AutoChampSelect] Rol detectado: {} | Picks disp: {:?} | Bans disp: {:?} | Acciones a evaluar: {}",
            plan.rol, plan.candidatos_pick, plan.candidatos_ban, plan.acciones.len()
        ));

        for accion in plan.acciones {
            match accion {
                AccionChampSelect::Ban { action_id, champion_id: _, completada } => {
                    let mut ban_exitoso = false;
                    for cand_id in plan.candidatos_ban.iter().take(4) {
                        let clave = format!("{}:{}:{}", action_id, cand_id, if completada { 1 } else { 0 });
                        if *self.clave_ban.lock().await == Some(clave.clone()) {
                            continue;
                        }

                        registrar_automatizacion(&format!(
                            "[AutoChampSelect][Ban] Intentando banear campeón ID {} en acción {}...",
                            cand_id, action_id
                        ));

                        // 1. Asignar campeón (hover) en la acción de ban primero
                        let _ = self.cliente_lcu.patch_vacio(
                            &format!("/lol-champ-select/v1/session/actions/{}", action_id),
                            &serde_json::json!({ "championId": cand_id })
                        ).await;

                        tokio::time::sleep(Duration::from_millis(150)).await;

                        // 2. Bloquear (lock-in) con completed: true
                        let body = serde_json::json!({
                            "championId": cand_id,
                            "completed": completada
                        });

                        match self.cliente_lcu.patch_vacio(&format!("/lol-champ-select/v1/session/actions/{}", action_id), &body).await {
                            Ok(_) => {
                                registrar_automatizacion(&format!(
                                    "[AutoChampSelect][Ban] ¡Ban completado y confirmado para campeón ID {}!",
                                    cand_id
                                ));
                                *self.clave_ban.lock().await = Some(clave);
                                ban_exitoso = true;
                                let _ = self.app_handle.emit("champ-select:action-executed", serde_json::json!({
                                    "tipo": "ban",
                                    "actionId": action_id,
                                    "championId": cand_id,
                                    "completada": completada
                                }));
                                break;
                            }
                            Err(e) => {
                                registrar_automatizacion(&format!(
                                    "[AutoChampSelect][Ban] Falló ban para campeón ID {}: {}. Probando siguiente candidato...",
                                    cand_id, e
                                ));
                            }
                        }
                    }
                    if !ban_exitoso && !plan.candidatos_ban.is_empty() {
                        registrar_automatizacion("[AutoChampSelect][Ban ERROR] No se pudo confirmar ninguno de los candidatos de ban disponibles.");
                    }
                }
                AccionChampSelect::Pick { action_id, champion_id, completada } => {
                    let clave = format!("{}:{}:{}", action_id, champion_id, if completada { 1 } else { 0 });
                    if *self.clave_pick.lock().await == Some(clave.clone()) {
                        continue;
                    }

                    if completada {
                        let delay_secs = ajustes.auto_champ_select.pick_delay_seconds.clamp(0.0, 5.0);
                        let delay_ms = (delay_secs * 1000.0) as u64;
                        if delay_ms > 0 {
                            registrar_automatizacion(&format!(
                                "[AutoChampSelect][Pick] Esperando retardo de {} ms antes de bloquear campeón ID {}...",
                                delay_ms, champion_id
                            ));
                            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                        }

                        // 1. Hover previo antes de confirmar pick
                        let _ = self.cliente_lcu.patch_vacio(
                            &format!("/lol-champ-select/v1/session/actions/{}", action_id),
                            &serde_json::json!({ "championId": champion_id, "completed": false })
                        ).await;

                        tokio::time::sleep(Duration::from_millis(150)).await;

                        registrar_automatizacion(&format!(
                            "[AutoChampSelect][Pick] Bloqueando (lock-in) campeón ID {} en acción {}...",
                            champion_id, action_id
                        ));
                    } else {
                        registrar_automatizacion(&format!(
                            "[AutoChampSelect][Hover] Mostrando (hover) campeón ID {} en acción {}...",
                            champion_id, action_id
                        ));
                    }

                    let body = serde_json::json!({
                        "championId": champion_id,
                        "completed": completada
                    });

                    match self.cliente_lcu.patch_vacio(&format!("/lol-champ-select/v1/session/actions/{}", action_id), &body).await {
                        Ok(_) => {
                            registrar_automatizacion(&format!(
                                "[AutoChampSelect][Pick] Confirmado éxito para campeón ID {} (completed: {})",
                                champion_id, completada
                            ));
                            *self.clave_pick.lock().await = Some(clave);
                            *self.objetivo_recordado.lock().await = Some(champion_id);
                            let _ = self.app_handle.emit("champ-select:action-executed", serde_json::json!({
                                "tipo": "pick",
                                "actionId": action_id,
                                "championId": champion_id,
                                "completada": completada
                            }));
                        }
                        Err(e) => {
                            registrar_automatizacion(&format!(
                                "[AutoChampSelect][Pick ERROR] Falló acción {} para campeón ID {}: {}",
                                action_id, champion_id, e
                            ));
                        }
                    }
                }
                AccionChampSelect::Hechizos { celda: _, spell1_id, spell2_id } => {
                    let clave = format!("{}:{}", spell1_id, spell2_id);
                    if *self.clave_hechizos.lock().await == Some(clave.clone()) {
                        continue;
                    }

                    registrar_automatizacion(&format!(
                        "[AutoChampSelect][Spells] Enviando hechizos [{}, {}] para rol {}...",
                        spell1_id, spell2_id, plan.rol
                    ));

                    let body = serde_json::json!({
                        "spell1Id": spell1_id,
                        "spell2Id": spell2_id
                    });

                    match self.cliente_lcu.patch_vacio("/lol-champ-select/v1/session/my-selection", &body).await {
                        Ok(_) => {
                            registrar_automatizacion(&format!(
                                "[AutoChampSelect][Spells] ¡Hechizos [{}, {}] aplicados exitosamente!",
                                spell1_id, spell2_id
                            ));
                            *self.clave_hechizos.lock().await = Some(clave);
                            let _ = self.app_handle.emit("champ-select:action-executed", serde_json::json!({
                                "tipo": "hechizos",
                                "spell1Id": spell1_id,
                                "spell2Id": spell2_id
                            }));
                        }
                        Err(e) => {
                            registrar_automatizacion(&format!(
                                "[AutoChampSelect][Spells ERROR] Fallo al aplicar hechizos: {}",
                                e
                            ));
                        }
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::servicios::gestor_ajustes::{AutoChampSelectSettings, RolePreference};
    use serde_json::json;
    use std::collections::HashMap;

    #[test]
    fn test_normalizar_rol() {
        assert_eq!(normalizar_rol(Some("top")), "TOP");
        assert_eq!(normalizar_rol(Some("JUNGLE")), "JUNGLE");
        assert_eq!(normalizar_rol(Some("middle")), "MIDDLE");
        assert_eq!(normalizar_rol(Some("BOTTOM")), "BOTTOM");
        assert_eq!(normalizar_rol(Some("utility")), "UTILITY");
        assert_eq!(normalizar_rol(Some("unknown")), "FILL");
        assert_eq!(normalizar_rol(None), "FILL");
    }

    #[test]
    fn test_resolver_plan_champ_select_completo() {
        let mut role_preferences = HashMap::new();
        role_preferences.insert(
            "BOTTOM".to_string(),
            RolePreference {
                preferred_champions: vec![222, 51], // Jinx, Caitlyn
                fallback_champions: vec![81],        // Ezreal
                ban_champions: vec![238],            // Zed
                spells: vec![4, 7],                  // Flash, Heal
            },
        );

        let ajustes = AutoChampSelectSettings {
            auto_hover: true,
            auto_pick: true,
            auto_ban: true,
            auto_spells: true,
            pick_delay_seconds: 1.0,
            role_preferences,
        };

        let sesion = json!({
            "localPlayerCellId": 2,
            "myTeam": [
                {
                    "cellId": 2,
                    "assignedPosition": "BOTTOM",
                    "championId": 0,
                    "championPickIntent": 0,
                    "spell1Id": 4,
                    "spell2Id": 14
                }
            ],
            "actions": [
                [
                    {
                        "id": 10,
                        "actorCellId": 2,
                        "type": "ban",
                        "isInProgress": true,
                        "completed": false
                    }
                ],
                [
                    {
                        "id": 20,
                        "actorCellId": 2,
                        "type": "pick",
                        "isInProgress": true,
                        "completed": false
                    }
                ]
            ],
            "bans": {
                "myTeamBans": [],
                "theirTeamBans": []
            }
        });

        let plan = resolver_plan_champ_select(&sesion, &ajustes, &[238], None).expect("Plan esperado");
        assert_eq!(plan.rol, "BOTTOM");
        assert_eq!(plan.candidatos_pick, vec![222, 51, 81]);
        assert_eq!(plan.candidatos_ban, vec![238]);

        // Verificar que hay acciones de ban, pick y hechizos
        let mut tiene_ban = false;
        let mut tiene_pick = false;
        let mut tiene_hechizos = false;

        for acc in &plan.acciones {
            match acc {
                AccionChampSelect::Ban { action_id, champion_id, completada } => {
                    assert_eq!(*action_id, 10);
                    assert_eq!(*champion_id, 238);
                    assert!(*completada);
                    tiene_ban = true;
                }
                AccionChampSelect::Pick { action_id, champion_id, completada } => {
                    assert_eq!(*action_id, 20);
                    assert_eq!(*champion_id, 222);
                    assert!(*completada);
                    tiene_pick = true;
                }
                AccionChampSelect::Hechizos { celda: _, spell1_id, spell2_id } => {
                    assert_eq!(*spell1_id, 4);
                    assert_eq!(*spell2_id, 7);
                    tiene_hechizos = true;
                }
            }
        }

        assert!(tiene_ban, "Falta acción de ban");
        assert!(tiene_pick, "Falta acción de pick");
        assert!(tiene_hechizos, "Falta acción de hechizos");
    }

    #[test]
    fn test_resolver_plan_champ_select_excluye_baneados_y_aliados() {
        let mut role_preferences = HashMap::new();
        role_preferences.insert(
            "BOTTOM".to_string(),
            RolePreference {
                preferred_champions: vec![222, 51], // Jinx (baneada), Caitlyn
                fallback_champions: vec![81],        // Ezreal
                ban_champions: vec![238],
                spells: vec![4, 7],
            },
        );

        let ajustes = AutoChampSelectSettings {
            auto_hover: true,
            auto_pick: true,
            auto_ban: true,
            auto_spells: true,
            pick_delay_seconds: 1.0,
            role_preferences,
        };

        let sesion = json!({
            "localPlayerCellId": 2,
            "myTeam": [
                {
                    "cellId": 1,
                    "assignedPosition": "MIDDLE",
                    "championId": 81, // Aliado seleccionó Ezreal
                    "championPickIntent": 0
                },
                {
                    "cellId": 2,
                    "assignedPosition": "BOTTOM",
                    "championId": 0,
                    "championPickIntent": 0,
                    "spell1Id": 4,
                    "spell2Id": 7
                }
            ],
            "actions": [
                [
                    {
                        "id": 20,
                        "actorCellId": 2,
                        "type": "pick",
                        "isInProgress": true,
                        "completed": false
                    }
                ]
            ],
            "bans": {
                "myTeamBans": [222], // Jinx baneada por el equipo
                "theirTeamBans": []
            }
        });

        let plan = resolver_plan_champ_select(&sesion, &ajustes, &[], None).expect("Plan esperado");
        // Jinx (222) está baneada, Ezreal (81) tomado por aliado -> debe escoger Caitlyn (51)
        assert_eq!(plan.candidatos_pick, vec![51]);
    }
}
