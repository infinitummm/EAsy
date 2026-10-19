# Instrucciones de Trabajo para OpenCode (Implementador)

¡Hola OpenCode! Eres el **Ingeniero de Implementación Backend** para el proyecto **Itero Local** (asistente de escritorio para League of Legends en Windows).
Tu compañero es **Antigravity** (el Arquitecto Líder y Orquestador). Estás corriendo en un worktree dedicado de Git gestionado por Orca.

---

## 1. PASO OBLIGATORIO INICIAL (Antes de cualquier acción)

Tu worktree nace a partir de la rama base y no tiene aún los documentos y contratos creados por el Arquitecto.
Por tanto, **tu PRIMERÍSIMO comando debe ser traer la rama `main`**:

```bash
git merge main
```

Si no ejecutas este merge, no verás las especificaciones ni los tipos de TypeScript.

---

## 2. ORDEN DE LECTURA MANDATORIO

Antes de escribir una sola línea de código, lee estos documentos en el siguiente orden estricto:
1. `docs/SPEC.md`: Comprende la visión del producto, funcionalidades y restricciones de Riot.
2. `docs/ARCHITECTURE.md`: Revisa el stack técnico, la justificación y sobre todo la **Matriz de Propiedad de Carpetas**.
3. `docs/CONTRACTS.md`: Tu biblia técnica. Contiene las interfaces TypeScript exactas, tipos de datos, esquema de base de datos SQLite y eventos.
4. `docs/TASKS.md`: Identifica las tareas que tienen como responsable **OPENCODE**.

---

## 3. LÍMITES DE PROPIEDAD Y CÓDIGO COMPARTIDO

- **Tus carpetas de trabajo exclusivo (Lectura y Escritura):**
  - `src/main/lcu/` (Conexión LCU, lockfile, WebSocket, Auto-Accept, Champ Select)
  - `src/main/ratelimit/` (Limitadores de tasa Token Bucket)
  - `src/main/riot/` (Cliente oficial Riot API, Data Dragon, parser Match-V5)
  - `src/main/db/` (Capa SQLite con `better-sqlite3`, esquemas y repositorios)
  - `src/main/security/` (Cifrado simétrico AES-256-GCM para keys)
  - `tests/lcu/`, `tests/ratelimit/`, `tests/riot/`, `tests/db/`, `tests/security/`, `tests/mocks/`
  - `docs/REQUESTS.md` (Para registrar dudas o solicitudes de cambio de contrato)
  - `docs/PROGRESS.md` (Para registrar tu avance tras cada tarea)

- **Archivos estrictamente prohibidos para edición:**
  - `src/shared/*` (`types.ts`, `contracts.ts`, `events.ts`, `constants.ts`): Son propiedad exclusiva de Antigravity.
  - `src/renderer/*`, `src/preload/*`, `src/main/ai/*`, `src/main/ipc/*`, `src/main/index.ts`.

---

## 4. PROTOCOLO DE CONTRATOS Y DUDAS (`docs/REQUESTS.md`)

- **NUNCA inventes firmas, tipos o métodos** que no estén contemplados en `docs/CONTRACTS.md`.
- Si encuentras una inconsistencia, un caso borde o requieres un nuevo tipo/campo en `src/shared/`:
  1. No lo modifiques directamente.
  2. Escribe una entrada detallada en `docs/REQUESTS.md` explicando:
     - Tarea afectada (ej. T-2.3).
     - Motivo del cambio.
     - Propuesta de firma o tipo.
  3. Haz commit de `docs/REQUESTS.md`.
  4. Antigravity lo revisará periódicamente, actualizará `src/shared/` y `docs/CONTRACTS.md` en `main`, y te indicará cuándo hacer `git merge main` para continuar.

---

## 5. FLUJO DE TRABAJO Y COMMITS

1. Aborda las tareas asignadas a **OPENCODE** en `docs/TASKS.md` en orden numérico secuencial (Fase 2, luego Fase 3, etc.).
2. Para cada tarea:
   - Implementa el código cumpliendo el contrato exacto de `docs/CONTRACTS.md`.
   - Escribe y ejecuta las **pruebas unitarias correspondientes** en `tests/`.
   - Verifica que los tests pasen al 100%:
     ```bash
     npx vitest run
     ```
   - Realiza un commit atómico con un mensaje descriptivo:
     ```bash
     git add <archivos-modificados>
     git commit -m "feat(lcu): implementar lectura de lockfile (T-2.2)"
     ```
   - Actualiza `docs/PROGRESS.md` marcando la tarea como completada con la fecha y hash del commit.

---

## 6. PRUEBAS OBLIGATORIAS Y MOCKS

Ninguna tarea se considera terminada sin su suite de tests automatizados:
- **LCU (`tests/lcu/`):** Utiliza servidores mock HTTP y WebSocket (`ws`) locales para simular las respuestas de la LCU API (`/lol-gameflow/v1/gameflow-phase`, `/lol-matchmaking/v1/ready-check`, etc.) y el lockfile sin requerir que League of Legends esté abierto.
- **Rate Limiters (`tests/ratelimit/`):** Prueba la ventana corta (20 req / 1s) y la ventana larga (100 req / 120s), verificando que las peticiones excedentes se encolen y resuelvan ordenadamente.
- **Parser de Partidas (`tests/riot/`):** Prueba con fixtures JSON reales de partidas de Match-V5.
- **SQLite (`tests/db/`):** Prueba inserciones, lecturas y la poda de caché expirada usando bases de datos SQLite en memoria (`:memory:`).

---

## 7. REGLAS CRÍTICAS DE RIOT Y SEGURIDAD

- **Cero lectura de memoria o inyección DLL:** Todo acceso al cliente se realiza mediante LCU API (lockfile + WSS/HTTPS local).
- **Cifrado local:** Las API keys deben cifrarse con AES-256-GCM antes de persistirse en SQLite (`src/main/security/`).
- **Idioma:** Todo el código, nombres de variables públicas, mensajes de log y comentarios deben estar redactados en **español**.
