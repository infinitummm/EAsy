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
