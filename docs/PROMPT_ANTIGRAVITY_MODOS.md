# Prompt Original: Overlay In-Game para ARAM Caos y Arena (Antigravity & OpenCode)

Fecha: 2026-10-25
Rol: Antigravity (Arquitecto Líder) y OpenCode (Implementador en Worktree Orca)

---

## 0. Objetivo
1. La app debe poder mostrarse **por encima del juego de LoL** (overlay in-game, al estilo Blitz).
2. Nueva función para los modos **ARAM Caos (ARAM: Mayhem)** y **Arena**: detectado el campeón y las mejoras (augments) que te aparecen, mostrar de cada una el **tier (S+/S/A/B/C/D) + Pick Rate**, como la tarjeta de Blitz (nombre del campeón en mayúsculas + icono, escudo dorado con "S", y "Pick Rate **12%**" en cian). Debe verse **claramente cuál es la mejor opción**.
3. Los datos deben ser **reales y del parche vigente**, verificados, nunca inventados ni hardcodeados.

## 1. Contexto técnico verificable
- ARAM: Mayhem = "ARAM Caos": ARAM con augments (Plata/Oro/Prismático). Primera selección al inicio de la partida y otras en niveles posteriores (3/7/11/15 según Riot Support; validar en juego real cada punto exacto). Solo se puede elegir cuando tu campeón está muerto. Los augments sustituyen runas.
- OP.GG ya publica tier lists de ambos modos: `https://op.gg/lol/modes/aram-mayhem` y `https://op.gg/lol/modes/arena` (incluye tiers de augments separados por campeón, tipo overlay).
- El **MCP oficial de OP.GG** (`https://mcp-api.op.gg/mcp`, JSON-RPC 2.0 Streamable HTTP) ya está integrado en `src/main/opgg/OpGgClient.ts` y su `lol_get_champion_analysis` recibe un parámetro `game_mode` (hoy fijo en `'ranked'`). Los valores válidos para `aram`, `aram_mayhem`, `arena` y si existen herramientas de tier-list/augments deben descubrirse en Fase 0.
- **Live Client Data API oficial** en `https://127.0.0.1:2999` durante partida activa (`/liveclientdata/allgamedata`, `/playerlist`, `/eventdata`, `/activeplayer`), documentada en developer.riotgames.com. Usa también certificado autofirmado (`rejectUnauthorized: false`, sin auth).
- **Overlay sobre el juego**: Riot oculta ventanas ajenas en pantalla-completa exclusiva. El overlay solo es fiable con LoL en **"sin bordes" (borderless)**. El modo se persiste en `<instalación>\Config\game.cfg` sección `[General]`, `WindowMode` (0=pantalla completa, 1=sin bordes, 2=ventana).
- Electron: overlay = ventana extra `frame:false, transparent:true, hasShadow:false, skipTaskbar:true, focusable:false, resizable:false`, `setAlwaysOnTop(true, 'screen-saver')`, mostrada con `showInactive()`, con `setIgnoreMouseEvents(true, { forward: true })`.
- Cumplimiento Riot: prohibido leer memoria o inyectar DLLs. Solo LCU API, Live Client Data API y estadísticas públicas.

## 2. Fase 0 — Verificación Obligatoria
- Script `scripts/sondeo-modos.mjs` para sondear MCP de OP.GG y endpoints web de tier lists.
- Script `scripts/sondeo-ingame.mjs` para Live Client Data API y LCU.
- Documento `docs/VERIFICACION_MODOS.md`.

## 3. Contratos a Diseñar
- Tipos compartidos en `src/shared/*`.
- Regla determinista de asignación de tier.
- Parche dinámico vía `DataDragonService`.
- Repositorio de caché SQLite para modos con TTL 24h.

## 4. Overlay
- Ventana transparente siempre encima, borderless detector en `game.cfg`.
- Hotkeys globales (`Ctrl+Shift+O`, `Ctrl+Shift+I`).
- Tarjeta estilo Blitz para selección de augments.

## 5. Colaboración con OpenCode vía Orca
- Tareas en `docs/TASKS.md`.
- Backend asignado a OpenCode en su worktree.
- Frontend y orquestación por Antigravity en `main`.
