# Registro de Avance de Implementación (PROGRESS.md)

Este documento registra las tareas completadas por **OpenCode** a lo largo de las distintas fases del proyecto. Cada tarea debe acompañarse de sus pruebas unitarias pasando al 100% y el hash del commit correspondiente.

---

## Estado Global del Proyecto

- **Fase 1 (Documentación y Contratos):** COMPLETADA (Antigravity)
- **Fase 2 (LCU + Auto-Accept MVP):** COMPLETADA (OpenCode & Antigravity) — 65/65 tests pasando
- **Fase 3 (Riot API + SQLite):** EN CURSO — 2/6 tareas (T-3.1, T-3.2) — 124/124 tests pasando
- **Fase 4 (Champ Select + Runas):** PENDIENTE
- **Fase 5 (Gemini AI Matchups):** PENDIENTE
- **Fase 6 (Personalización + Perfil):** PENDIENTE
- **Fase 7 (Pulido y Empaquetado):** PENDIENTE

---

## Tareas Completadas por OpenCode

| ID Tarea | Descripción | Commit | Tests Pasando | Fecha | Notas |
| :--- | :--- | :--- | :--- | :--- | :--- |
| T-2.2 | Detección de `LeagueClientUx` y lectura de `lockfile` | 7c0eeda | 18/18 (`tests/lcu/lockfile.test.ts`) | 2026-10-19 | Parsea formato de 5 segmentos, token Basic Auth, extracción desde argumentos de proceso y búsqueda en rutas candidatas (incluye variable `ITERO_LCU_LOCKFILE`). |
| T-2.3 | Cliente HTTPS local con Basic Auth y certificado autofirmado | 0439538 | 12/12 (`tests/lcu/httpClient.test.ts`) | 2026-10-19 | `request<T>()` genérico, `rejectUnauthorized: false`, timeout configurable, manejo de 4xx/5xx, 204 y respuestas JSON/texto. Tests contra servidor HTTPS real con certificado autofirmado (`tests/mocks/tls/`). |
| T-2.4 | Cliente WebSocket WSS con suscripción a `OnJsonApiEvent` y reconexión | 8315f5c | 8/8 (`tests/lcu/webSocket.test.ts`) | 2026-10-19 | Suscripción global `[5,"OnJsonApiEvent"]`, Basic Auth en el handshake, frames de eventos parseados, reconexión automática configurable y cierre manual seguro. Eventos: `conectado`, `desconectado`, `reconectando`, `evento`, `error-websocket`. |
| T-2.5 | Auto-Accept con retardo configurable (0 a 8 s) y varianza humana | 16da312 | 16/16 (`tests/lcu/autoAccept.test.ts`) | 2026-10-19 | Detección de ReadyCheck `InProgress/None`, retardo normalizado 0-8 s, fluctuación ±0.5 s inyectable, cancelación por `EveryoneReady`/`null`/respuesta previa, deduplicación por ciclo y reintento ante fallo. Eventos: `programado`, `aceptado`, `fallo-aceptacion`. |
| T-2.6 | `LcuClient` unificado implementando `ILcuClient` | b9cb18e | 9/9 (`tests/lcu/lcuClient.test.ts`) + suite completa 65/65 | 2026-10-19 | Integra lockfile + HTTP + WS + Auto-Accept. Detecta aparición/desaparición del lockfile, refresca fase inicial, reemite eventos, implementa `request<T>`, `acceptReadyCheck`, `setAutoAccept`, `injectRunePage` (valida 9 perks), `selectChampion`, `banChampion`, `setSummonerSpells` y `getChampSelectSession`. Eventos documentados en `REQ-001`. |
| T-3.1 | `SecurityService` con cifrado AES-256-GCM | 318673d | 26/26 (`tests/security/security.test.ts`) + suite completa 91/91 | 2026-10-19 | Cifrado/descifrado con formato `IV:AuthTag:CipherText` (hexadecimal), IV aleatorio de 12 bytes por operación y AuthTag de 16 bytes (autenticado GCM). Clave maestra de 32 bytes (Buffer o hex de 64 caracteres) o carga/creación segura con `SecurityService.desdeArchivoClave()` (permisos 0o600, reutiliza clave existente). Detección de manipulación de IV/tag/contenido y validación estricta de formatos. |
| T-3.2 | Capa SQLite con `node:sqlite` y esquema completo | cff2f73 | 33/33 (`tests/db/database.test.ts`) + suite completa 124/124 | 2026-10-19 | Esquema exacto de CONTRACTS.md §2 (6 tablas + 6 índices, idempotente) y `DatabaseService` implementando `IDatabaseService`: CRUD de cuentas, `saveMatch` transaccional (upsert + participante), `getRecentMatches` con KDA y CS/min calculados vía `src/main/riot/estadisticas.ts`, caché de matchups con TTL y poda, ajustes con fusión sobre `DEFAULT_APP_SETTINGS` y métricas de consumo por ventana temporal. Motor: `node:sqlite` en lugar de `better-sqlite3` (ver REQ-002); `perks_json` con objeto `{primaryStyleId, subStyleId, selectedPerks}` (ver REQ-003). Pruebas en memoria y en archivo (persistencia entre sesiones). |
