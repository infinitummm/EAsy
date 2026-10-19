# Registro de Avance de Implementación (PROGRESS.md)

Este documento registra las tareas completadas por **OpenCode** a lo largo de las distintas fases del proyecto. Cada tarea debe acompañarse de sus pruebas unitarias pasando al 100% y el hash del commit correspondiente.

---

## Estado Global del Proyecto

- **Fase 1 (Documentación y Contratos):** COMPLETADA (Antigravity)
- **Fase 2 (LCU + Auto-Accept):** EN PROGRESO (OpenCode)
- **Fase 3 (Riot API + SQLite):** PENDIENTE
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
