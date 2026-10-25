# Verificación Técnica Fase 0: Modos ARAM Caos (Mayhem) y Arena

**Fecha:** 2026-10-25  
**Autor:** Antigravity (Arquitecto Líder)  
**Proyecto:** EAsy (League of Legends Desktop Assistant)  

---

## 1. Sondeo del Servidor MCP Oficial de OP.GG (`https://mcp-api.op.gg/mcp`)

Ejecutado mediante `scripts/sondeo-modos.mjs`:

### 1.1 Herramientas Disponibles
- `lol_get_champion_analysis`: Devuelve estadísticas de campeón, builds óptimas (objetos, runas, habilidades, hechizos).
- `lol_get_lane_matchup_guide`: Enfrentamiento directo de línea (1v1).
- `lol_list_champion_ranking`: Ranking global de campeones.
- `lol_list_champions`: Lista de campeones.

### 1.2 Parámetro `game_mode` en `lol_get_champion_analysis`
- **Valores permitidos según el schema y respuesta de error de OP.GG:**
  `["ranked", "flex", "urf", "aram", "nexus_blitz"]` (case-insensitive).
- **Modos no soportados directamente por el MCP:**
  `"arena"` y `"aram_mayhem"` devuelven error RPC `-32600`:
  `The game mode must be one of the following values: RANKED, FLEX, URF, ARAM, NEXUS_BLITZ, ranked, flex, urf, aram, nexus_blitz`.
- **Campos en `desired_output_fields`:**
  El conjunto cerrado de campos del MCP **no incluye augments** (solo ítems, runas, botas, habilidades, summoners y counters).

---

## 2. Sondeo de Endpoints Web y Community Dragon para Augments

### 2.1 Catálogo de Augments en OP.GG (`https://op.gg/lol/modes/aram-mayhem`)
- La página web de OP.GG incluye el catálogo completo de augments en su payload React Server Components (RSC).
- **Muestra extraída:** 306 mejoras (augments) verificadas con datos estadísticos reales del parche vigente.
- **Estructura de cada mejora en OP.GG:**
  ```json
  {
    "id": 1205,
    "name": "ADAPt",
    "key": "ARAM_ADAPt",
    "tier": 1,
    "performance": 83.07,
    "popular": 2.7,
    "rarity": 1,
    "largeIcon": "https://opgg-static.akamaized.net/meta/images/lol/latest/aram-augment/ADAPt_large.png",
    "smallIcon": "https://opgg-static.akamaized.net/meta/images/lol/latest/aram-augment/ADAPt_small.png",
    "desc": "Convert Bonus Attack Damage to Ability Power...",
    "tooltip": "...",
    "champions": [
      { "id": 30, "tier": 0, "performance": 81.43, "popular": 2.26 },
      { "id": 45, "tier": 0, "performance": 81.94, "popular": 2.39 }
    ]
  }
  ```

### 2.2 Correspondencia de Tiers y Rarezas
- **Tiers:**
  - `0`: **S+** (Dorado brillante)
  - `1`: **S** (Dorado)
  - `2`: **A** (Azul eléctrico)
  - `3`: **B** (Verde esmeralda)
  - `4`: **C** (Naranja/bronce)
  - `5`: **D** (Gris acero)
- **Rarezas (`rarity`):**
  - `1` / `kSilver`: **Plata** (Silver)
  - `4` / `kGold`: **Oro** (Gold)
  - `8` / `kPrismatic`: **Prismático** (Prismatic)
- **Pick Rate:** Campo `popular` expresado en porcentaje directo (ej. `2.7` significa `2.7%`).
- **Puntuación de rendimiento:** Campo `performance` (winrate indexado).

### 2.3 Community Dragon (`cherry-augments.json`)
- Endpoint oficial: `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/es_es/v1/cherry-augments.json`
- 594 mejoras indexadas con traducción al español neutro (`nameTRA`), iconos de alta resolución y clave de rareza oficial (`rarity`).
- 303 de 306 IDs coinciden exactamente entre OP.GG y Community Dragon.

---

## 3. Live Client Data API y Detección de Modo In-Game

### 3.1 Detección del Modo de Juego en LCU
El cliente LCU expone los eventos de selección de campeón y flujo de juego:
- **Queue IDs oficiales:**
  - `2400`: ARAM Caos (ARAM: Mayhem).
  - `1700`: Arena (Cherry / 2v2v2v2).
  - `450`: ARAM normal (Abismo de los Lamentos).
  - `420`: Ranked Solo/Duo.
  - `440`: Ranked Flex.
- **Rutas LCU consultables:**
  - `/lol-gameflow/v1/session` -> `gameData.queue.id`, `gameData.gameMode`.
  - `/lol-champ-select/v1/session` -> `myTeam`, `actions`, `localPlayerCellId`.

### 3.2 Live Client Data API (`https://127.0.0.1:2999`)
- Solo activa cuando `League of Legends.exe` está en ejecución.
- `/liveclientdata/activeplayer`: Expone nombre de invocador y campeón activo (`summonerName`, `championStats`).
- `/liveclientdata/allgamedata`: Expone eventos en tiempo real, ítems y puntuaciones.

### 3.3 Estrategia de Presentación (Overlay In-Game)
- **Plan A (Selección Activa):** Durante la fase de selección de augments o al morir en ARAM Caos, el overlay muestra las opciones recomendadas ordenadas por Tier (`S+` > `S` > `A` > `B` > `C` > `D`) y Pick Rate, destacando nítidamente la mejor opción.
- **Plan B (Tarjeta de Referencia Blitz):** Si el jugador presiona el atajo (`Ctrl+Shift+O`), se muestra la tarjeta completa de recomendaciones de mejoras para su campeón en el parche vigente, dividida por rarezas (Plata, Oro, Prismático).

---

## 4. Detección y Configuración de Pantalla (WindowMode)

### 4.1 Archivo de Configuración de League of Legends
- Ubicación: `<leagueInstallationPath>\Config\game.cfg` (por defecto `C:\Riot Games\League of Legends\Config\game.cfg`).
- Sección: `[General]`
- Clave: `WindowMode`
  - `0`: Pantalla completa exclusiva (Fullscreen). *Nota: DirectX oculta ventanas ajenas en este modo.*
  - `1`: Sin bordes (Borderless). *Requerido para overlay superpuesto.*
  - `2`: Ventana (Windowed).

### 4.2 Lógica de Advertencia y Soporte
- La app verifica si `WindowMode === 1`.
- Si `WindowMode === 0`, el overlay notifica al usuario con una alerta no intrusiva: "Para ver el overlay encima del juego, cambia el modo de pantalla a 'Sin bordes' en Ajustes de Vídeo de LoL".
