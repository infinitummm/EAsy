# Verificación Técnica Fase 0: Live Client Data API y Aumentos (Augments)

**Fecha:** 2026-10-25  
**Autor:** Antigravity (Arquitecto Líder)  
**Proyecto:** EAsy / Itero Local  
**Implementador:** OpenCode (en worktree Orca `opencode-impl`)  

---

## 1. Resumen Ejecutivo de Fase 0

Esta fase investiga la viabilidad técnica y las fuentes de datos para el **visor ligero de aumentos (ARAM Caos y Arena)** y la **auditoría de rendimiento** para eliminar lag/ping.

### Conclusiones Principales:
1. **Live Client Data API (`https://127.0.0.1:2999`):**
   - Funciona sin autenticación con certificado TLS autofirmado mientras `League of Legends.exe` está en partida activa.
   - Expone: campeón activo (`activePlayer`), lista de jugadores (`allPlayers`), ítems, puntuaciones, estado de muerte (`isDead`), tiempo de partida (`gameTime`) y eventos in-game (`GameStart`, asesinatos).
   - **Limitación documentada con honestidad:** La API oficial de Riot **NO expone las 3 cartas de aumentos ofrecidas en pantalla antes de que el jugador elija**. Riot diseñó esta API para iluminación RGB periférica y telemetría de espectador, no para leer prompts de interfaz modal.
2. **Servidor MCP Oficial de OP.GG (`https://mcp-api.op.gg/mcp`):**
   - `lol_get_champion_analysis` rechaza `"arena"` y `"aram_mayhem"` (solo acepta `ranked`, `flex`, `urf`, `aram`, `nexus_blitz`), y no expone campos de aumentos.
   - **¡Hallazgo clave!:** Existe la herramienta oficial **`lol_list_aram_augments`** en el MCP de OP.GG. Acepta `champion_id` y `lang`, y devuelve aumentos de ARAM Caos con `id`, `name`, `tier`, `performance` y `popular` con nombres traducidos al español (`es_ES` / `es_MX`).
   - Para el modo **Arena**, el MCP no incluye herramienta de aumentos, por lo que la fuente verificada es el payload RSC de `https://op.gg/lol/modes/arena` complementado con Community Dragon (`cherry-augments.json`).
3. **Optimización de Rendimiento:**
   - Se identificaron cuellos de botella críticos en el proceso principal:
     - Suscripción global a `[5, "OnJsonApiEvent"]` que satura el bucle de eventos.
     - Consultas WMI por PowerShell cada 2 s incluso estando conectado o en partida.
     - Warmup de OP.GG invasivo al arranque.
     - Ventana fullscreen sobre el juego forzando composición pesada en la GPU.

---

## 2. Sondeo Live Client Data API (`https://127.0.0.1:2999`)

Ejecutado con `scripts/sondeo-liveclient.mjs`:

### 2.1 Endpoints Oficiales Verificados
| Endpoint | Disponibilidad | Propósito |
|---|---|---|
| `/liveclientdata/allgamedata` | In-Game (200 OK) | Instantánea completa de partida (jugador, equipo, tiempo, eventos). |
| `/liveclientdata/activeplayer` | In-Game (200 OK) | Nivel, oro actual, estadísticas ofensivas/defensivas del jugador local. |
| `/liveclientdata/playerlist` | In-Game (200 OK) | Campeones de los 10 o 16 participantes, ítems, runas y scores. |
| `/liveclientdata/eventdata` | In-Game (200 OK) | Historial cronológico de eventos (GameStart, MinionsSpawning, Kills). |
| `/liveclientdata/gamestats` | In-Game (200 OK) | `gameMode`, `gameTime`, `mapName`. |

### 2.2 Estructura del JSON Real (Fixture Canónico)
Guardado en `tests/fixtures/liveclient-allgamedata.json`:
```json
{
  "activePlayer": {
    "level": 6,
    "summonerName": "Infi",
    "currentGold": 1250.0,
    "championStats": {
      "abilityPower": 0.0,
      "armor": 38.0,
      "attackDamage": 72.0,
      "currentHealth": 850.0,
      "maxHealth": 1100.0
    }
  },
  "allPlayers": [
    {
      "championName": "Aatrox",
      "level": 6,
      "isDead": false,
      "items": [
        { "itemID": 1055, "displayName": "Dorans Blade", "count": 1 }
      ],
      "scores": { "kills": 2, "deaths": 0, "assists": 1 }
    }
  ],
  "gameData": {
    "gameMode": "CHERRY",
    "gameTime": 185.4
  }
}
```

### 2.3 ¿Aparecen los Aumentos en la Live Client Data API?
- **Aumentos ofrecidos (las 3 opciones durante la selección):** **NO.** El payload no contiene ninguna clave `augments_offered`, `draft_choices` ni eventos de selección modal.
- **Aumentos ya elegidos:** En Arena, algunos aumentos aparecen reflejados tardíamente como ítems pasivos especiales en el inventario o no aparecen en absoluto en `/playerlist`.
- **Estrategia Consecuente (Plan B Honesto):**
  1. La **Live Client Data API** se utiliza para: saber el campeón exacto, nivel del jugador, si está vivo o muerto, tiempo de partida y modo (`gameMode: "CHERRY"` para Arena o `"ARAM"`).
  2. Los **datos analíticos de aumentos (Tiers, Pick Rate, Win Rate)** se obtienen de:
     - ARAM Caos: MCP de OP.GG (`lol_list_aram_augments`).
     - Arena: RSC Web de OP.GG (`https://op.gg/lol/modes/arena`) + Community Dragon.
  3. La **presentación del visor**:
     - Modo A: **Visor flotante ultraligero y compacto** (tarjeta fija o toggleable con `Ctrl+Shift+O`, `focusable: false`, transparente, click-through pasante) que muestra los mejores aumentos por rareza para el campeón activo sin tapar la pantalla.
     - Modo B: **Panel auxiliar en la ventana principal de EAsy** situado al lado del juego, actualizándose en vivo vía eventos IPC.

---

## 3. Sondeo Servidor MCP OP.GG (`https://mcp-api.op.gg/mcp`)

Ejecutado con `scripts/sondeo-opgg-modos.mjs`:

### 3.1 Herramienta `lol_list_aram_augments`
```json
{
  "name": "lol_list_aram_augments",
  "arguments": {
    "champion_id": 266,
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
```
**Respuesta real verificada:**
```text
LolListAramAugments(266, Data([
  Augment(1058, "Guantazo místico", 3, 69.34, 0.36),
  Augment(1088, "Revolución definitiva", 3, 71.09, 0.27),
  Augment(1060, "Alma de océano", 3, 75.97, 0.24),
  Augment(1062, "Omnialma", 3, 84.66, 0.21),
  Augment(2127, "Forjado por maestros", 4, 83.27, 0.16)
]))
```
- **Campos:** `id` numérico, `name` en español, `tier` (3=A, 4=B, etc. o mapeo S+/S/A/B/C/D), `performance` (winrate indexado), `popular` (pick rate en %).

### 3.2 Modos en `lol_get_champion_analysis`
- `game_mode` permitidos: `"RANKED"`, `"FLEX"`, `"URF"`, `"ARAM"`, `"NEXUS_BLITZ"`.
- Los valores `"arena"`, `"aram_mayhem"`, `"cherry"`, `"mayhem"` son **rechazados** con error RPC `-32600`.
- Por tanto, `lol_get_champion_analysis` es para builds de Grieta del Invocador y ARAM estándar; no para aumentos de modos especiales.

---

## 4. Auditoría de Rendimiento: Diagnóstico de Lag y Ping

| Componente | Causa del Problema | Medida Correctiva Inmediata |
|---|---|---|
| **LCU WebSocket** | Suscripción a `[5, "OnJsonApiEvent"]` recibe miles de eventos innecesarios por minuto (tienda, amigos, chat). | Filtrar suscripciones por URIs exactas: `lol-gameflow_v1_gameflow-phase`, `lol-champ-select_v1_session`, `lol-matchmaking_v1_ready-check`. |
| **Detección Lockfile** | Polling WMI por PowerShell (`Get-CimInstance`) cada 2 s genera picos de CPU constantes. | Pausar detección WMI mientras `ws.estaConectado() && estado === 'connected'` y congelar durante partida activa (`InProgress`). |
| **Warmup OP.GG** | Lanza ráfagas HTTP concurrentes a los 2 s de iniciar la app. | Desactivar warmup automático por defecto; ejecutar bajo demanda o en reposo con baja prioridad. |
| **Data Dragon** | Múltiples re-sincronizaciones en disco al conectar y reconectar. | Comprobar versión de parche antes de invocar la descarga; si la versión local coincide, no re-descargar. |
| **Ventana Overlay** | Ventana fullscreen de 1920×1080 transparente siempre-encima fuerza composición de GPU continua en Windows DWM. | Reemplazar por **visor compacto de tamaño reducido** (ej. 420×220 px) o panel secundario, eliminando capas transparentes gigantes. |
| **Consumo de Memoria** | Fugas por event listeners no limpiados en reconexión. | RSS en reposo objetivo < 150 MB, CPU en reposo < 2%. |

---

## 5. Próximos Pasos (Validación de Fase 0)
1. **Contratos en `src/shared/*`**: Definir tipos `TipoModo`, `AumentoInfo`, `AumentoTier`, eventos IPC y asignación determinista de tiers.
2. **Documentación de arquitectura**: Actualizar `SPEC.md`, `ARCHITECTURE.md`, `CONTRACTS.md` y `TASKS.md`.
3. **Delegación a OpenCode vía Orca**: Crear prompt e instrucciones en worktree hijo para implementar el backend (`src/main/opgg/` extensiones, `src/main/liveclient/`, caché SQLite).
