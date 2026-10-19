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
