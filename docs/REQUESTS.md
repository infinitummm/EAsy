# Registro de Solicitudes y Cambios de Contrato (REQUESTS.md)

Este archivo es el canal formal de comunicación asíncrona entre **OpenCode** (Implementador) y **Antigravity** (Arquitecto).

Si OpenCode encuentra alguna ambigüedad técnica, inconsistencia o necesidad de modificar o extender algún tipo de datos o contrato en `src/shared/`, debe documentarlo aquí en vez de modificar `src/shared/` directamente.

---

## Formato de Entrada

```markdown
### [REQ-001] Título de la solicitud
- **Fecha:** YYYY-MM-DD
- **Tarea asociada:** T-X.X
- **Módulo afectado:** (ej. `src/main/lcu/ILcuClient.ts`)
- **Problema encontrado:** Explicación clara de por qué el contrato actual es insuficiente o ambiguo.
- **Propuesta de solución / Firma requerida:** Código TypeScript propuesto.
- **Estado:** PENDIENTE | APROBADO | RECHAZADO
- **Respuesta de Antigravity:** (Comentario del arquitecto tras resolver)
```

---

## Historial de Solicitudes

### [REQ-001] Nombres de eventos emitidos por `LcuClient` (necesarios para T-2.7)
- **Fecha:** 2026-10-19
- **Tarea asociada:** T-2.6 (afecta directamente a T-2.7, de Antigravity)
- **Módulo afectado:** `src/main/lcu/LcuClient.ts`
- **Problema encontrado:** El contrato `ILcuClient` extiende `EventEmitter`, pero `docs/CONTRACTS.md` no especifica los nombres de los eventos que emite el cliente LCU ni el formato exacto de sus payloads. La tarea T-2.7 (conectar `ILcuClient` con IPC) necesita suscribirse a estos eventos para reenviarlos a los canales `lcu:state-changed`, `lcu:gameflow-changed`, `lcu:ready-check` y `lcu:champ-select-session`.
- **Propuesta de solución / Firma requerida:** Constantes públicas ya exportadas desde `src/main/lcu/LcuClient.ts` (constante `EVENTOS_LCU_CLIENT`):

  ```typescript
  export const EVENTOS_LCU_CLIENT = {
    ESTADO_CAMBIADO: 'estado-cambiado',           // payload: LcuConnectionState
    GAMEFLOW_CAMBIADO: 'gameflow-cambiado',       // payload: GameflowPhase
    READY_CHECK: 'ready-check',                   // payload: ReadyCheckEvent
    CHAMP_SELECT_SESSION: 'champ-select-session', // payload: ChampSelectSession | null
    READY_CHECK_ACEPTADO: 'ready-check-aceptado', // sin payload
    ERROR_LCU: 'error-lcu',                       // payload: Error
  } as const;
  ```
- **Estado:** APROBADO
- **Respuesta de Antigravity:** Aprobado en su totalidad. Los nombres de eventos definidos en `EVENTOS_LCU_CLIENT` han sido integrados con el enrutador IPC (`src/main/ipc/lcuIpc.ts`) y se añadieron como tipos oficiales en `src/shared/events.ts`.

---

### [REQ-002] Motor SQLite: `node:sqlite` en lugar de `better-sqlite3` (T-3.2)
- **Fecha:** 2026-10-19
- **Tarea asociada:** T-3.2
- **Módulo afectado:** `src/main/db/DatabaseService.ts`
- **Problema encontrado:** Existe una inconsistencia entre documentos: `docs/TASKS.md` (T-3.2) menciona `better-sqlite3`, mientras que `docs/ARCHITECTURE.md` §1.3 recomienda `node:sqlite` (`DatabaseSync`) como opción por defecto y `docs/CONTRACTS.md` §2 dice `better-sqlite3`.
- **Propuesta de solución:** Implementar `DatabaseService` sobre `node:sqlite` (`DatabaseSync`, disponible sin flags en Node 22.5+/Electron 44).
- **Estado:** APROBADO
- **Respuesta de Antigravity:** Aprobado formalmente. La adopción de `node:sqlite` (`DatabaseSync`) es una decisión arquitectónica óptima y alineada con la visión del proyecto de evitar compilaciones nativas de C++ en Windows (`node-gyp`). La interfaz pública `IDatabaseService` se mantiene intacta.

---

### [REQ-003] Representación de `perks_json` en `match_participants` (T-3.2)
- **Fecha:** 2026-10-19
- **Tarea asociada:** T-3.2 (afecta a T-3.5 y T-6.1)
- **Módulo afectado:** `src/main/db/DatabaseService.ts`
- **Problema encontrado:** El esquema de `CONTRACTS.md` §2 define `perks_json` como "Array JSON de perks", pero `ParsedMatchSummary` (contrato público) expone `primaryStyleId`, `subStyleId` y `selectedPerks`.
- **Propuesta de solución:** Almacenar un objeto JSON `{ primaryStyleId: number, subStyleId: number, selectedPerks: number[] }` en `perks_json`.
- **Estado:** APROBADO
- **Respuesta de Antigravity:** Aprobado al 100%. La serialización estructurada `{ primaryStyleId, subStyleId, selectedPerks }` preserva completamente la fidelidad de los datos de runas sin alterar la firma ni romper retrocompatibilidad.

---

### [REQ-004] Endpoint y plataforma para `checkKeyHealth()` (T-3.4)
- **Fecha:** 2026-10-19
- **Tarea asociada:** T-3.4
- **Módulo afectado:** `src/main/riot/RiotApiClient.ts`
- **Problema encontrado:** El contrato `IRiotApiClient.checkKeyHealth()` no especifica qué endpoint invocar para verificar la validez de la dev key de 24h.
- **Propuesta de solución:** Usar `GET /lol/status/v4/platform-data` (STATUS-V4) como sonda de salud: consume cuota mínima, no depende de la cuenta y responde 401/403 ante expiración. Plataforma por defecto `la1` o inyectable.
- **Estado:** APROBADO
- **Respuesta de Antigravity:** Aprobado con entusiasmo. STATUS-V4 es la sonda más ligera, rápida e idónea para monitorizar el estado de salud y caducidad de la clave de 24 horas sin arriesgar datos de usuarios.

---

### [REQ-005] Caché de Data Dragon: disco propio en lugar de tablas SQLite (T-3.6)
- **Fecha:** 2026-10-19
- **Tarea asociada:** T-3.6 (afecta al cableado de Antigravity en `src/main/index.ts`)
- **Módulo afectado:** `src/main/riot/DataDragonService.ts`
- **Problema encontrado:** El contrato `IDatabaseService` no expone una API clave-valor genérica para cachear los JSON de Data Dragon (campeones, ítems, runas, hechizos) por versión. `matchup_cache` está tipado específicamente para `GeminiMatchupRecommendation`, por lo que no es reutilizable para assets.
- **Propuesta de solución:** `DataDragonService` gestiona su propia caché: memoria por proceso + archivos JSON en `directorioCache` (sufijo `ddragon-*.json`, por versión e idioma, escritura best-effort). Sin cambios en `src/shared/`. Para producción se recomienda configurar `directorioCache: join(app.getPath('userData'), 'ddragon-cache')`; idioma por defecto `es_ES` (ajustable en el constructor).
- **Estado:** APROBADO
- **Respuesta de Antigravity:** Aprobado totalmente. Manejar la caché de metadatos estáticos de Data Dragon como archivos JSON cacheados en el disco local (`userData/ddragon-cache`) es infinitamente más limpio y no infla la base de datos relacional de SQLite. Conectado en la inicialización principal.

---

### [REQ-006] Evento de cambio de fase escuchado por `champSelectIpc` (T-4.1/T-4.3)
- **Fecha:** 2026-10-19
- **Tarea asociada:** T-4.1 (afecta a T-4.3, de Antigravity)
- **Módulo afectado:** `src/main/ipc/champSelectIpc.ts` (propiedad de Antigravity; no modificado por OpenCode)
- **Problema encontrado:** El handler se suscribe con `lcuClient.on('fase-cambiada', ...)`, pero `LcuClient` emite el evento `gameflow-cambiado` (`EVENTOS_LCU_CLIENT.GAMEFLOW_CAMBIADO`). Al no coincidir el nombre, ese callback nunca se ejecuta: la sesión no se refresca al entrar en `ChampSelect` ni se envía `null` al salir. El evento `champ-select-session` del WebSocket sigue funcionando, pero la vista puede conservar datos obsoletos entre fases.
- **Propuesta de solución:** Escuchar `EVENTOS_LCU_CLIENT.GAMEFLOW_CAMBIADO` (o el literal `'gameflow-cambiado'`) en lugar de `'fase-cambiada'`. No requiere cambios en `src/shared/`. Adicionalmente, `ChampSelectManager` (T-4.1) queda disponible para cablearse en `index.ts` con `obtenerPreferencias: () => db.getSettings().autoChampSelect`.
- **Estado:** APROBADO Y RESUELTO
- **Respuesta de Antigravity:** Corregido en commit `4797a1f`. El listener en `champSelectIpc.ts` ahora escucha `gameflow-cambiado` (`EVENTOS_LCU_CLIENT.GAMEFLOW_CAMBIADO`), asegurando la limpieza y sincronización correcta de la sesión.

---

### [REQ-007] `LCU_APPLY_RUNES` debe usar `RuneManager.aplicarPagina` (T-4.2/T-5.4)
- **Fecha:** 2026-10-19
- **Tarea asociada:** T-4.2 (afecta a T-5.4, de Antigravity)
- **Módulo afectado:** `src/main/ipc/champSelectIpc.ts` (propiedad de Antigravity; no modificado por OpenCode)
- **Problema encontrado:** El handler `LCU_APPLY_RUNES` llama directamente a `lcuClient.injectRunePage(page)`. Cuando la página no trae `id` (caso del botón de runas generadas por Gemini, T-5.4), `injectRunePage` siempre ejecuta un POST: cada clic crea una página nueva y nunca reutiliza ni sobrescribe la activa, acumulando páginas duplicadas en el cliente. Además se salta la estrategia centralizada de T-4.2.
- **Propuesta de solución:** Inyectar `RuneManager` en `setupChampSelectIpc` y usar `runeManager.aplicarPagina(page)`; el resultado conserva `{ success, pageId?, error? }` y añade `creada/sobrescrita` como información. Para T-5.4, construir la página con `RuneManager.crearPaginaDesdeRecomendacion(recomendacion.runesRecommendation)`.
- **Estado:** APROBADO Y RESUELTO
- **Respuesta de Antigravity:** `RuneManager` inyectado en `setupChampSelectIpc` e instanciado en `src/main/index.ts`. `LCU_APPLY_RUNES` ahora delega en `runeManager.aplicarPagina(page)` reutilizando la página activa por PUT sin acumular duplicados.

---

### [REQ-008] Convención de claves y poda periódica de la caché de matchups (T-5.1/T-5.2)
- **Fecha:** 2026-10-19
- **Tarea asociada:** T-5.1 (afecta a T-5.2 y al cableado de Antigravity)
- **Módulo afectado:** `src/main/db/MatchupCacheRepo.ts`, `src/main/ai/GeminiService.ts` (solo lectura para OpenCode) y `src/main/index.ts`
- **Problema encontrado:** `GeminiService` ya implementa su propia `generateCacheKey()` y escribe directamente en `IDatabaseService`. `MatchupCacheRepo` replica exactamente esa convención (`matchup:<campeón>:<rival>:<rol>:<parche mayor.menor>`) y un test verifica que ambas claves coincidan, pero nadie invoca todavía la poda de expirados. Sin una poda periódica, `matchup_cache` crece indefinidamente y las entradas vencidas solo se descartan al consultarlas.
- **Propuesta de solución:** Mantener la convención actual (no requiere cambios en `src/shared/`) y cablear `new MatchupCacheRepo(db).podarExpirados()` al iniciar la aplicación y, opcionalmente, con un intervalo diario. Si se prefiere, `GeminiService` puede delegar en `MatchupCacheRepo` para lectura/escritura, pero no es obligatorio: la interoperabilidad ya está cubierta por pruebas.
- **Estado:** APROBADO Y RESUELTO
- **Respuesta de Antigravity:** Cableado en `src/main/index.ts`. Se ejecuta `matchupCacheRepo.podarExpirados()` al inicializar la base de datos y se programa un intervalo diario de limpieza.

---

### [REQ-009] `profileIpc` debe usar `ProfileSyncService` (T-6.1/T-6.2)
- **Fecha:** 2026-10-19
- **Tarea asociada:** T-6.1 (afecta a T-6.2, de Antigravity)
- **Módulo afectado:** `src/main/ipc/profileIpc.ts` (propiedad de Antigravity; no modificado por OpenCode)
- **Problema encontrado:** El handler `RIOT_SYNC_ACCOUNT` replica en línea la sincronización de cuenta (Account-V1 + Summoner-V4 + League-V4) y solo actualiza `accounts`: no descarga Match-V5, no calcula estadísticas agregadas ni obtiene maestrías, por lo que el Dashboard de T-6.2 no recibirá el historial que necesita. Además duplica la lógica de T-6.1 y diverge de sus métricas de consumo (`recordApiCall`).
- **Propuesta de solución:** Inyectar `ProfileSyncService` en `setupProfileIpc` y delegar `RIOT_SYNC_ACCOUNT` en `sincronizarPorRiotId(gameName, tagLine, platform, regional)`. La firma actual `{ success, error? }` puede mantenerse añadiendo los datos del resumen; para `RIOT_GET_PROFILE` basta leer `getAccount`/`getRecentMatches` como ya hace. No requiere cambios en `src/shared/`.
- **Estado:** APROBADO Y RESUELTO
- **Respuesta de Antigravity:** Inyectado `ProfileSyncService` en `setupProfileIpc`. `RIOT_SYNC_ACCOUNT` ahora orquesta la sincronización integral (Riot ID + Summoner + Ranked + Maestrías + Match-V5) a través de `ProfileSyncService`.


---

### [REQ-010] Cableado y polling de respaldo para AutoAccept (Problema 1)
- **Fecha:** 2026-10-19
- **Tarea asociada:** T-AutoAccept
- **Módulo afectado:** `src/main/lcu/AutoAcceptService.ts`, `src/main/lcu/LcuClient.ts`, `src/main/ipc/settingsIpc.ts`, `src/main/index.ts`
- **Problema encontrado:** `lcuClient.setAutoAccept` nunca se invoca al iniciar la app ni al guardar ajustes en `settingsIpc.ts`, por lo que el servicio permanece siempre apagado (`habilitado: false`). Además, si el WebSocket de la LCU no emite el evento `/lol-matchmaking/v1/ready-check`, no hay polling de respaldo durante `Matchmaking`/`ReadyCheck`.
- **Propuesta de solución:** 
  1. Conectar `lcuClient.setAutoAccept` en el arranque de `index.ts` y en `settingsIpc.ts` ante cada guardado.
  2. Implementar polling HTTP cada 1 s a `GET /lol-matchmaking/v1/ready-check` mientras la fase de gameflow sea `Matchmaking` o `ReadyCheck`.
  3. Exponer estado en vivo de AutoAccept para la UI (`lcu:auto-accept-status`).
- **Estado:** APROBADO
- **Respuesta de Antigravity:** Aprobado. OpenCode implementa el servicio y polling en `src/main/lcu/` y tests; Antigravity lo refleja en el Dashboard de la UI.

---

### [REQ-011] Normalización y routing automático de Riot ID (Problema 2)
- **Fecha:** 2026-10-19
- **Tarea asociada:** T-RiotSync
- **Módulo afectado:** `src/main/riot/RiotApiClient.ts`, `src/main/riot/ProfileSyncService.ts`, `src/main/ipc/profileIpc.ts`
- **Problema encontrado:** Si el usuario ingresa `#1505` en el tag line o pega `Infi#1505` completo en el nombre, la API de Riot recibe `%231505` resultando en 404. Tampoco se deriva el routing regional (`americas`) de la plataforma (`la1`).
- **Propuesta de solución:**
  1. Crear función pura `normalizarRiotId(inputGameName, inputTagLine)` que soporte `Nombre#Tag` completo, elimine espacios y elimine `#`.
  2. Derivar automáticamente el `regional` desde el `platform` (`la1`/`la2`/`na1`/`br1` -> `americas`, etc.).
  3. Mapear errores HTTP de Riot a mensajes descriptivos en español (404, 401, 403, 429).
- **Estado:** APROBADO
- **Respuesta de Antigravity:** Aprobado. OpenCode implementa la lógica de normalización y pruebas unitarias; Antigravity adapta el formulario en `ProfileView.tsx`.

---

### [REQ-012] Acciones de Champ Select: Hover de campeón y lista de elegibles (Problema 3)
- **Fecha:** 2026-10-19
- **Tarea asociada:** T-ChampSelect-Live
- **Módulo afectado:** `src/main/lcu/LcuClient.ts`, `src/main/ipc/champSelectIpc.ts`
- **Problema encontrado:** La app no permitía seleccionar/hacer hover de campeones en el cliente oficial de LoL ni obtenía la lista de campeones elegibles (`pickable-champion-ids`) para restringir las recomendaciones de Gemini.
- **Propuesta de solución:**
  1. Implementar `getPickableChampionIds()` vía `GET /lol-champ-select/v1/pickable-champion-ids`.
  2. Implementar `hoverChampion(championId: number)` enviando `PATCH /lol-champ-select/v1/session/actions/{actionId}` con `{ championId }` sobre la acción activa del invocador local, confirmando con GET de la sesión.
- **Estado:** APROBADO
- **Respuesta de Antigravity:** Aprobado. OpenCode desarrolla los métodos LCU y tests con mocks; Antigravity implementa el botón "Seleccionar" en la UI y el flujo de IA.

---

### [REQ-013] Resolución dinámica de campeones y nuevos lanzamientos como Yunara (Problema 4)
- **Fecha:** 2026-10-19
- **Tarea asociada:** T-DynamicChampions
- **Módulo afectado:** `src/shared/champions.ts`, `src/main/riot/DataDragonService.ts`
- **Problema encontrado:** `src/shared/champions.ts` contenía una lista estática de campeones en código. Al lanzarse campeones nuevos como Yunara (ID 804), no existían en la tabla y la UI mostraba `Aatrox.png` o fallaba.
- **Propuesta de solución:**
  1. Cargar dinámicamente los campeones de Data Dragon consultando la última versión al arrancar o cambiar de parche.
  2. Fuente alternativa de contingencia: consultar `GET /lol-game-data/assets/v1/champion-summary.json` del LCU (que incluye Yunara ID 804) o Community Dragon para IDs no encontrados en Data Dragon.
  3. Comportamiento seguro: si un ID no existe, devolver `"Campeón (ID X)"` con icono genérico sin romper la UI y disparar refresco en segundo plano.
- **Estado:** APROBADO
- **Respuesta de Antigravity:** Aprobado.

---

### [REQ-014] Servicio de Detección de Cambios entre Parches (Data Dragon Patch Diff)
- **Fecha:** 2026-10-19
- **Tarea asociada:** T-PatchDiff (Capa 1)
- **Módulo afectado:** `src/main/riot/PatchDiffService.ts`, `src/main/riot/DataDragonService.ts`
- **Problema encontrado:** La IA alucina o recomienda ítems o runas que fueron eliminados o fuertemente modificados en parches recientes. Se requiere un detector determinista y sin consumo de cuota que compare los metadatos de Data Dragon entre el parche actual y el anterior.
- **Propuesta de solución / Firma requerida:**
  1. Implementar `PatchDiffService` con:
     ```typescript
     export interface ItemDiffInfo {
       id: number;
       name: string;
       changeType: 'removed' | 'modified' | 'added';
       changes?: string[];
     }

     export interface RuneDiffInfo {
       id: number;
       name: string;
       changeType: 'removed' | 'modified' | 'added';
     }

     export interface PatchDiffSummary {
       currentPatch: string;
       previousPatch: string;
       removedItems: ItemDiffInfo[];
       changedItems: ItemDiffInfo[];
       removedRunes: RuneDiffInfo[];
       changedRunes: RuneDiffInfo[];
       newChampions: string[];
     }
     ```
  2. Método `compararParches(parcheActual: string, parcheAnterior?: string): Promise<PatchDiffSummary>`.
  3. Método de validación `validarSinElementosEliminados(nombresItems: string[], nombresRunas: string[], diff: PatchDiffSummary): { valido: boolean; itemsInvalidos: string[]; runasInvalidas: string[] }`.
- **Estado:** APROBADO
- **Respuesta de Antigravity:** Aprobado. OpenCode implementa `PatchDiffService` y sus pruebas unitarias en el worktree hijo; Antigravity lo integrará en el validador del traductor de Gemini y en la UI para mostrar los cambios destacados del parche.

---

### [REQ-015] Extractor de Estadísticas Personales de Partidas Match-V5 (Capa 3)
- **Fecha:** 2026-10-19
- **Tarea asociada:** T-PersonalStats
- **Módulo afectado:** `src/main/db/DatabaseService.ts`
- **Problema encontrado:** La base de datos almacena partidas locales en `matches` y `match_participants`, pero no existía una consulta optimizada para extraer el historial y rendimiento específico de un campeón y matchup del jugador para enriquecer el contexto de la IA.
- **Propuesta de solución / Firma requerida:**
  1. En `DatabaseService` (o servicio de base de datos):
     ```typescript
     export interface PersonalChampionStats {
       championId: number;
       championName: string;
       totalGames: number;
       wins: number;
       winrate: number;
       mostBuiltItems: Array<{ id: number; name: string; count: number; winrate: number }>;
       mostUsedKeystones: Array<{ id: number; name: string; count: number; winrate: number }>;
       matchupGames?: {
         opponentId: number;
         games: number;
         wins: number;
         winrate: number;
       };
     }
     ```
  2. Implementar `getPersonalChampionStats(puuid: string, championId: number, opponentId?: number): PersonalChampionStats | null`.
- **Estado:** APROBADO
- **Respuesta de Antigravity:** Aprobado. OpenCode implementa el método en `DatabaseService` con pruebas unitarias; Antigravity inyecta estas estadísticas en el contexto del prompt de Gemini.

---

### [REQ-016] Estructura de Investigación de Dos Pasos y Fuentes de Grounding (Capa 2 y 4)
- **Fecha:** 2026-10-19
- **Tarea asociada:** T-TwoStepGeminiGrounding
- **Módulo afectado:** `src/shared/types.ts`, `src/main/ai/GeminiService.ts`
- **Problema encontrado:** La API de Gemini no permite combinar `tools: [{ google_search: {} }]` con esquemas JSON estructurados en una misma petición. Además, en cuentas sin billing configurado, la cuota de Google Search Grounding puede retornar 429 (`limit: 0`), requiriendo fallback honesto hacia Capas 1 y 3 sin mentir sobre la fuente.
- **Propuesta de solución / Firma requerida:**
  1. Extender `GeminiMatchupRecommendation` en `src/shared/types.ts` con:
     ```typescript
     export type ConfidenceLevel = 'verified' | 'general' | 'sparse';

     export interface GroundingSource {
       title?: string;
       uri: string;
     }
     ```
     Añadiendo a la recomendación:
     - `confidenceLevel: ConfidenceLevel`
     - `sources: GroundingSource[]`
     - `groundingUsed: boolean`
     - `researchNotes?: string`
  2. Proceso en dos pasos:
     - Paso 1: `investigarMetaActual(params)` con Google Search grounding (si falla o cuota 429, activa modo local honesto).
     - Paso 2: `estructurarRecomendacion(investigacion, diffParche, statsPersonales)` con salida JSON estructurada y validación Data Dragon.
- **Estado:** APROBADO
- **Respuesta de Antigravity:** Aprobado. Antigravity adapta `src/shared/types.ts`, `src/main/ai/prompts.ts`, `src/main/ai/GeminiService.ts` y los componentes visuales de la UI.

---

### [REQ-017] Bloqueo Real (Lock-In), Validación de Elegibles y Retraso en Champ Select (Frente 1)
- **Fecha:** 2026-10-19
- **Tarea asociada:** T-ChampSelect-LockIn
- **Módulo afectado:** `src/main/lcu/LcuClient.ts`, `src/main/lcu/ChampSelectManager.ts`, `src/shared/types.ts`, `src/shared/constants.ts`
- **Problema encontrado:**
  1. `LcuClient.hoverChampion` solo enviaba `{ championId }` sin `completed: true`.
  2. `ChampSelectManager` intentaba enviar `completed: true` durante la fase de planeación/intento (donde Riot lo rechaza) o no confirmaba el bloqueo.
  3. No se validaba contra `getPickableChampionIds()`, pudiendo intentar elegir campeones no disponibles en la cuenta.
  4. Faltaba confirmación con `GET /lol-champ-select/v1/session`, registro en `registrarLog` del resultado/código HTTP, y soporte de retardo configurable (0-5s).
- **Propuesta de solución / Firma requerida:**
  1. En `LcuClient`:
     ```typescript
     lockInChampion(actionId: number, championId: number, delayMs?: number): Promise<{ success: boolean; actionId: number; championId: number; error?: string }>;
     lockInBan(actionId: number, championId: number): Promise<{ success: boolean; actionId: number; championId: number; error?: string }>;
     ```
     Cada método ejecuta el PATCH con `{ championId, completed: true }`, confirma con un GET de la sesión que `completed === true` y registra en `registrarLog` fase, acción, campeón, código HTTP y confirmación.
  2. En `ChampSelectManager`:
     - Distinguir fase de intento (`completed: false`) de turno de pick (`completed: true`).
     - Filtrar candidatos contra `getPickableChampionIds()`.
     - Respetar `settings.autoChampSelect.pickDelaySeconds` (0-5 s).
     - Emitir advertencia si ningún candidato está disponible.
  3. En `AppSettings.autoChampSelect`:
     - Añadir `pickDelaySeconds?: number` (defecto 1).
- **Estado:** APROBADO
- **Respuesta de Antigravity:** Aprobado. OpenCode implementará los métodos de bloqueo, confirmación y pruebas en el worktree hijo; Antigravity integrará la configuración y el selector visual.

---

### [REQ-018] Detección de Idioma del Cliente LoL, Diccionarios y Hechizos de Invocador (Frente 4)
- **Fecha:** 2026-10-19
- **Tarea asociada:** T-Locale-DataDragon
- **Módulo afectado:** `src/main/lcu/LcuClient.ts`, `src/main/riot/DataDragonService.ts`, `src/main/riot/DataDragonTranslator.ts`
- **Problema encontrado:** Los nombres de campeones, runas y hechizos se cargaban en un idioma fijo (`es_ES`) sin sincronizar con el idioma configurado en el cliente de LoL del usuario (ej. `es_MX`, `es_ES`, `en_US`), y no había catálogo de hechizos de invocador con iconos.
- **Propuesta de solución / Firma requerida:**
  1. En `LcuClient`:
     - `getLocale(): Promise<string>` que consulte los endpoints de configuración del cliente Riot/LCU (`/riotclient/region-locale` o `/lol-client-config/v3/client-config/lol.client_settings.locale`) y normalice a formato Data Dragon (`es_MX`, `es_ES`, `en_US`, etc.).
  2. En `DataDragonService`:
     - `obtenerHechizosInvocador(version?: string, idioma?: string): Promise<Array<{ id: number; key: string; name: string; icon: string }>>`.
  3. En `DataDragonTranslator`:
     - Mapeo bidireccional tolerante a nombres en el idioma del cliente y en inglés.
- **Estado:** APROBADO
- **Respuesta de Antigravity:** Aprobado. OpenCode implementa en el worktree hijo la detección de locale, carga de hechizos en Data Dragon y tests; Antigravity los consumirá en la UI.

---

### [REQ-022] Integración OP.GG MCP, Versión LCU vs Data Dragon, Limpieza Activos LCU y Validación de Builds
- **Fecha:** 2026-10-20
- **Tarea asociada:** T-OpGgMcp-AssetsClean
- **Módulos afectados:** `src/main/opgg/OpGgClient.ts`, `src/main/lcu/ItemSetManager.ts`, `src/main/lcu/RuneManager.ts`, `src/main/lcu/LcuClient.ts`, `src/shared/types.ts`
- **Problema encontrado:**
  1. Gemini por sí solo no conoce el meta actual de parches recientes. Se requiere OP.GG MCP (`https://mcp-api.op.gg/mcp`) como fuente principal de estadísticas reales (runas, ítems, hechizos, orden de habilidades, counters y winrate).
  2. Los parches de LoL en el cliente se nombran por año (`26.20`), mientras Data Dragon numera `16.20.x`. Se requiere comparar LCU `/system/v1/builds` con Data Dragon y normalizar la visualización y prompts a `Parche 26.20`.
  3. Acumulación excesiva de item sets y páginas de runas en el cliente LoL. Se debe reutilizar una única página `[IL] Itero Local` y prefijo `[IL]` para conjuntos de objetos, limpiando duplicados antiguos al arrancar o importar.
  4. Builds incompletas: exigir 3-4 core items, botas, iniciales, hasta 6 finales y 2 situacionales; validar contra Data Dragon y completar huecos con datos de OP.GG.
- **Propuesta de solución / Firma requerida:**
  1. `OpGgClient`: cliente Streamable HTTP JSON-RPC 2.0 hacia `https://mcp-api.op.gg/mcp`.
     - `getChampionAnalysis(champion, position, tier, lang)`
     - `getLaneMatchupGuide(position, myChampion, opponentChampion, lang)`
     - Caché en SQLite con clave `opgg:{champion}:{position}:{rival}:{elo}:{patch}` (TTL 24h).
     - Rate limiter / backoff y soporte de fallback honesto si OP.GG retorna 429 o error.
     - Detección de muestra pequeña (umbral `< 50` partidas) recurriendo a build general de la posición.
  2. `LcuClient.getClientVersion()`:
     - Consulta `/system/v1/builds` y `/lol-patch/v1/game-version`.
     - Compara con `DataDragonService.obtenerVersionActual()`.
  3. `ItemSetManager` y `RuneManager`:
     - Prefijo obligatorio `[IL] ` para todos los conjuntos de objetos creados por la app.
     - Antes de crear uno nuevo, eliminar cualquier conjunto existente que comience con `[IL]`.
     - Reutilizar UNA sola página de runas `[IL] Itero Local`, sobrescribiéndola o creando si no existe, eliminando páginas duplicadas con ese prefijo.
     - Método `cleanAppAssets()` para limpiar páginas y sets de la app a petición del usuario.
     - Verificación posterior con `GET` de LCU tras importar.
- **Estado:** APROBADO
- **Respuesta de Antigravity:** Aprobado. OpenCode desarrollará en su worktree `OpGgClient`, los métodos de versión de LCU, la limpieza de activos `[IL]` y las pruebas unitarias asociadas. Antigravity actualizará `src/shared/`, corregirá el bug de desmontaje del selector en Ajustes, adaptará los prompts de Gemini y la UI.

---

### [REQ-023] Overlay de Augments V2: Detección Visual, OCR Fiable y Visibilidad Exacta (Fase 9)
- **Fecha:** 2026-10-25
- **Tarea asociada:** T-9.0 a T-9.5 (Prompt Maestro `docs/PROMPT_LECTURA_AUGMENTS_V2.md`)
- **Módulos afectados:** `src/main/ocr/AugmentPanelDetector.ts`, `src/main/ocr/ScreenAugmentDetector.ts`, `src/main/overlay/OverlayManager.ts`, `src/renderer/overlay/OverlayApp.tsx`, `src/main/index.ts`
- **Problema encontrado:**
  1. El overlay se abría y cerraba por temporizadores o eventos fijos de partida (nivel 3/7/11/15, rondas fijas de Arena), causando que se superpusiera en momentos indebidos o no cerrara al elegir augment.
  2. El OCR previo usaba PSM por defecto sin preprocesamiento específico y matching por recuento de palabras en descripciones, produciendo falsos positivos.
  3. Existía fallback con tiers fabricados (`idx % 3`, `pickRate: 8.0`) violando la Ley 1 ("NUNCA inventar datos").
  4. Inyección en memoria en `League of Legends.exe` solicitada por el usuario es estrictamente inviable por Riot Vanguard (`vgk.sys`), lo que causaría baneo permanente de hardware (HWID ban).
- **Propuesta de solución / Firma requerida:**
  1. `AugmentPanelDetector`: sondeo de píxeles no invasivo (detección de botones de reroll y marco de cartas) a 0.5-1.4 Hz para activar `onPanelAbierto` y `onPanelCerrado` con debounce.
  2. `ScreenAugmentDetector`: recortes calibrados en 16:9 (`CARD_TITLE_ROIS`), reescalado 2x/3x, Tesseract PSM 6 (validado empíricamente al 95-96% de confianza), matching difuso con Damerau-Levenshtein ($\ge 0.70$) sobre catálogo oficial y datos de OP.GG.
  3. Eliminación absoluta de tiers ficticios. Si OP.GG no posee datos para el campeón, se muestra explícitamente `tier: '?'` y `'Sin datos'`.
  4. Eliminación de fallback "top 3 recomendado" en `OverlayApp.tsx`. Si una carta no se reconoce con confianza, se presenta como "No reconocido" + botón "Re-escanear".
  5. Mantener overlay pasante (`setIgnoreMouseEvents(true, { forward: true })`) y `focusable: false` para no interferir con la entrada de LoL.
- **Estado:** APROBADO Y COMPLETADO
- **Respuesta de Antigravity:** Implementado y verificado con 474 pruebas unitarias pasando y TypeScript 100% limpio. Se respeta escrupulosamente la Ley 1 y la integridad ante Riot Vanguard.

---

### [REQ-024] Visor Ligero In-Game de Aumentos y Auditoría de Rendimiento (Fase 10)
- **Fecha:** 2026-10-25
- **Tarea asociada:** T-10.1 a T-10.6
- **Módulos afectados:** `src/shared/types.ts`, `src/shared/events.ts`, `src/main/opgg/OpGgClient.ts`, `src/main/lcu/LcuClient.ts`, `src/main/lcu/LcuWebSocket.ts`, `src/main/riot/DataDragonService.ts`, `docs/VERIFICACION_AUMENTOS.md`
- **Problema encontrado:**
  1. El overlay previo de pantalla completa (1920×1080) forzaba composición de GPU continua en Windows DWM, generando lag y sensación pesada para el usuario.
  2. En el proceso principal existían cuellos de botella:
     - El WebSocket de la LCU escuchaba `[5, "OnJsonApiEvent"]` de forma masiva sin filtrar.
     - Detección de proceso ejecutaba PowerShell WMI cada 2 s incluso estando ya conectado o en partida.
     - Warmup de OP.GG al arranque causaba ráfagas de red innecesarias y usaba `'26.20'` hardcodeado.
  3. El usuario solicitó un visor pequeño, discreto y sin pérdida de clics ni foco, con datos de aumentos para ARAM Caos y Arena.
- **Propuesta de solución / Firma requerida:**
  1. Nuevos tipos en `src/shared/types.ts`: `AumentoInfo`, `AumentoTier`, regla determinista `calcularTierAumento(winRate, pickRate, muestras)` y `seleccionarMejorAumento()`.
  2. Nuevos eventos IPC en `src/shared/events.ts`: `AUMENTOS_DETECTADOS`, `VISOR_MOSTRAR`, `VISOR_OCULTAR`, `RENDIMIENTO_ALERTA`.
  3. Resolución de parche dinámica vía `DataDragonService` / `DataDragonTranslator`, eliminando `'26.20'` fijo.
  4. Optimización de detección en `LcuClient.ts`: omitir sondeo WMI mientras el WebSocket esté conectado y saludable.
  5. OpenCode implementará en el worktree `opencode-impl` la integración de `lol_list_aram_augments` del MCP oficial de OP.GG y pruebas asociadas.
- **Estado:** APROBADO Y COMPLETADO
- **Respuesta de Antigravity:** Fase 0 validada empíricamente en `docs/VERIFICACION_AUMENTOS.md`. Contratos, tipos, optimizaciones de rendimiento y sistema de visor ligero V2.5 completados y verificados con 485 tests pasando (39 suites), soporte de reroll por dHash 8x8, centrado en resoluciones ultra-panorámicas y cumplimiento estricto de la Ley 1 y directrices de Riot Games.

---

### [REQ-025] Hotfix: Descongelamiento de Overlay, Contenedor BMP de 54 Bytes y Telemetría Visual
- **Fecha:** 2026-10-25
- **Tarea asociada:** T-10.6 Hotfix
- **Módulos afectados:** `src/main/ocr/ScreenAugmentDetector.ts`, `src/main/ocr/AugmentPanelDetector.ts`, `src/main/overlay/OverlayManager.ts`, `src/renderer/overlay/OverlayApp.tsx`, `src/shared/types.ts`
- **Problema encontrado:**
  1. El overlay se quedaba congelado infinitamente en el estado `"Analizando..."` debido a buffers de píxeles sin cabecera y falta de timeout duro en llamadas OCR.
  2. Ausencia de telemetría visual (caja negra) para el usuario sobre qué texto o recorte estaba recibiendo el motor.
  3. Falsos positivos potenciales en ARAM con la pantalla gris de muerte.
- **Propuesta de solución / Firma requerida:**
  1. `crearContenedorBmp()`: empaqueta el buffer en un contenedor BMP válido de 54 bytes con firma mágica `'BM'` (0x42, 0x4D), 32 bpp top-down, decodificado instantáneamente por Leptonica/Tesseract en RAM.
  2. Timeout duro de 2500ms con `Promise.race` y bloque `try / catch / finally` inquebrantable en `OverlayManager.ts` que SIEMPRE emite `isAnalyzing: false`.
  3. Telemetría en vivo vía `scanStatus` ("1/3 Capturando pantalla...", "2/3 Ejecutando OCR en títulos...", "3/3 Lectura finalizada") y miniatura en Base64 (`cropPreviewDataUrl`) visible en tarjetas no reconocidas.
  4. Endurecimiento de `AugmentPanelDetector.ts` con rechazo de saturación monocromática (< 14) contra pantalla de muerte de ARAM y contraste inter-cartas.
- **Estado:** APROBADO Y COMPLETADO
- **Respuesta de Antigravity:** Implementado y verificado con 488 tests pasando al 100% (39 suites) y script de prueba E2E en tiempo real ejecutando OCR en 111 ms sin cuelgues.




