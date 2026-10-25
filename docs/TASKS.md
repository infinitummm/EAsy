# Plan Maestro de Tareas por Fases (TASKS.md)

Este documento desglosa todas las tareas del proyecto por fases, asignando un único responsable exclusivo (**ANTIGRAVITY** u **OPENCODE**), archivos que toca, dependencias y criterios de aceptación verificables.

---

## FASE 1: Documentación y Contratos (Fundación)

| ID | Responsable | Objetivo | Archivos | Dependencias | Criterio de Terminado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **T-1.1** | ANTIGRAVITY | Redactar especificación funcional detallada (SPEC.md) | `docs/SPEC.md` | Ninguna | Documento completo con visión, reglas de Riot, módulos y criterios. |
| **T-1.2** | ANTIGRAVITY | Redactar arquitectura, justificación de stack y matriz de carpetas | `docs/ARCHITECTURE.md` | T-1.1 | Justificación técnica de Electron vs Tauri y mapa de propiedad estricta. |
| **T-1.3** | ANTIGRAVITY | Definir contratos TypeScript, eventos, esquema SQLite e IPC | `docs/CONTRACTS.md` | T-1.2 | Interfaces exhaustivas, esquema DDL de SQLite y canales IPC definidos. |
| **T-1.4** | ANTIGRAVITY | Crear plan maestro de tareas numeradas | `docs/TASKS.md` | T-1.3 | Tareas numeradas con criterios de aceptación claros para cada agente. |
| **T-1.5** | ANTIGRAVITY | Redactar el prompt de arranque e instrucciones para OpenCode | `docs/PROMPT_OPENCODE.md` | T-1.4 | Instrucciones completas para el agente implementador en Orca. |
| **T-1.6** | ANTIGRAVITY | Crear los archivos compartidos de TypeScript en `src/shared/` | `src/shared/*` | T-1.3 | `types.ts`, `contracts.ts`, `events.ts` y `constants.ts` creados y compilables. |

---

## FASE 2: Conexión LCU y Auto-Accept (MVP Operativo)

| ID | Responsable | Objetivo | Archivos | Dependencias | Criterio de Terminado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **T-2.1** | ANTIGRAVITY | Configurar entorno Electron + Vite + React + TypeScript + Tailwind | `package.json`, `vite.config.ts`, `tsconfig.json`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/*` | T-1.6 | La aplicación compila y arranca una ventana de escritorio con React funcionando. |
| **T-2.2** | OPENCODE | Implementar detección de `LeagueClientUx` y lectura de `lockfile` | `src/main/lcu/lockfile.ts`, `tests/lcu/lockfile.test.ts` | T-1.6 | Lee el lockfile en disco o detecta argumentos del proceso; extrae puerto y token con tests unitarios pasando. |
| **T-2.3** | OPENCODE | Implementar cliente HTTPS local con Basic Auth y certificado autofirmado | `src/main/lcu/LcuHttpClient.ts`, `tests/lcu/httpClient.test.ts` | T-2.2 | Peticiones HTTP a `127.0.0.1:[puerto]` con `rejectUnauthorized: false` y autenticación funcional; tests con mock de servidor HTTP. |
| **T-2.4** | OPENCODE | Implementar cliente WebSocket WSS para suscripción a eventos LCU | `src/main/lcu/LcuWebSocket.ts`, `tests/lcu/webSocket.test.ts` | T-2.3 | Conexión a `wss://127.0.0.1`, suscripción a `OnJsonApiEvent`, reconexión automática tras caída; tests con mock WS pasando. |
| **T-2.5** | OPENCODE | Implementar lógica de Auto-Accept con retardo configurable (0 a 8s) | `src/main/lcu/AutoAcceptService.ts`, `tests/lcu/autoAccept.test.ts` | T-2.4 | Detección de `/lol-matchmaking/v1/ready-check` y llamada a `/accept` respetando el timer y varianza humana; tests pasando. |
| **T-2.6** | OPENCODE | Integrar `LcuClient` unificado exportando la interfaz `ILcuClient` | `src/main/lcu/LcuClient.ts`, `src/main/lcu/index.ts` | T-2.5 | Implementación completa de `ILcuClient` pasando todos los tests de `tests/lcu/`. |
| **T-2.7** | ANTIGRAVITY | Conectar `ILcuClient` con IPC y crear interfaz de Estado LCU + Auto-Accept | `src/main/ipc/lcuIpc.ts`, `src/renderer/views/DashboardView.tsx` | T-2.1, T-2.6 | La UI muestra estado del cliente LoL en tiempo real y permite activar/desactivar Auto-Accept con slider de retardo. |

---

## FASE 3: Riot API, Data Dragon y Base de Datos Local

| ID | Responsable | Objetivo | Archivos | Dependencias | Criterio de Terminado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **T-3.1** | OPENCODE | Implementar cifrado seguro de credenciales con AES-256-GCM | `src/main/security/SecurityService.ts`, `tests/security/security.test.ts` | T-1.6 | Cifra y descifra strings generando formato `IV:AuthTag:Cipher` en Hex; tests unitarios pasando. |
| **T-3.2** | OPENCODE | Implementar capa SQLite con `better-sqlite3` y repositorios | `src/main/db/DatabaseService.ts`, `src/main/db/schema.sql`, `tests/db/database.test.ts` | T-3.1 | Inicializa BD, tablas, índices, operaciones CRUD para cuentas, ajustes, partidas y caché; tests en memoria/archivo pasando. |
| **T-3.3** | OPENCODE | Implementar limitador de tasa Token Bucket dual (20/1s y 100/120s) | `src/main/ratelimit/RateLimiter.ts`, `tests/ratelimit/rateLimiter.test.ts` | T-1.6 | Encola peticiones, respeta los dos límites simultáneos de Riot y gestiona cabeceras `Retry-After`; tests pasando. |
| **T-3.4** | OPENCODE | Implementar cliente oficial de Riot API (Account, Summoner, League, Mastery, Match-V5) | `src/main/riot/RiotApiClient.ts`, `tests/riot/riotClient.test.ts` | T-3.3 | Consulta endpoints oficiales con rate limit, detecta expiración de clave (403); tests con mocks de respuestas Riot pasando. |
| **T-3.5** | OPENCODE | Implementar parser estadístico de partidas Match-V5 | `src/main/riot/MatchParser.ts`, `tests/riot/matchParser.test.ts` | T-3.4 | Transforma MatchDto en `ParsedMatchSummary`, calcula KDA, CS/min, builds y runas; tests pasando. |
| **T-3.6** | OPENCODE | Implementar servicio de Data Dragon / Community Dragon con caché de assets | `src/main/riot/DataDragonService.ts`, `tests/riot/dataDragon.test.ts` | T-3.2 | Consulta versión del parche, descarga y cachea metadatos de campeones, runas e ítems; tests pasando. |
| **T-3.7** | ANTIGRAVITY | Implementar vista de Ajustes con gestión de claves y monitor de cuotas | `src/main/ipc/settingsIpc.ts`, `src/renderer/views/SettingsView.tsx` | T-2.1, T-3.2, T-3.4 | Formulario para ingresar Riot Key y Gemini Key con cifrado, test de validez y aviso prominente de expiración de 24h. |

---

## FASE 4: Selección de Campeón Inteligente y Gestión de Runas

| ID | Responsable | Objetivo | Archivos | Dependencias | Criterio de Terminado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **T-4.1** | OPENCODE | Implementar motor de automatización en Champ Select (hover, pick, ban, spells) | `src/main/lcu/ChampSelectManager.ts`, `tests/lcu/champSelect.test.ts` | T-2.6 | Resuelve la acción del jugador local según rol y prioridades de configuración; tests simulando sesión de selección. |
| **T-4.2** | OPENCODE | Implementar inyección directa de páginas de runas vía LCU API | `src/main/lcu/RuneManager.ts`, `tests/lcu/runeManager.test.ts` | T-2.6 | Sobrescribe o crea página en `/lol-perks/v1/pages` con validación de 9 perks; tests pasando. |
| **T-4.3** | ANTIGRAVITY | Desarrollar vista en vivo de Champ Select en React | `src/main/ipc/champSelectIpc.ts`, `src/renderer/views/ChampSelectView.tsx` | T-2.7, T-4.1 | Visualización en tiempo real de aliados, enemigos revelados, temporizador, rol detectado y recomendación activa. |
| **T-4.4** | ANTIGRAVITY | Configuración interactiva de prioridades de picks, bans y hechizos por rol | `src/renderer/components/RolePreferencesEditor.tsx` | T-3.7, T-4.3 | Editor visual intuitivo para ordenar campeones preferidos, alternativas de respaldo y bans por posición. |

---

## FASE 5: Inteligencia Artificial con Gemini (Matchups y Builds)

| ID | Responsable | Objetivo | Archivos | Dependencias | Criterio de Terminado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **T-5.1** | OPENCODE | Implementar repositorio y poda de caché de recomendaciones en SQLite | `src/main/db/MatchupCacheRepo.ts`, `tests/db/matchupCache.test.ts` | T-3.2 | Búsqueda por hash `(champ:rival:rol:parche)`, inserción y eliminación de expirados; tests pasando. |
| **T-5.2** | ANTIGRAVITY | Implementar servicio de Gemini API con cola, backoff y formato estructurado | `src/main/ai/GeminiService.ts`, `src/main/ai/prompts.ts` | T-1.6, T-5.1 | Invocación al modelo Gemini con schema JSON forzado, reintentos exponenciales y consulta previa a caché SQLite. |
| **T-5.3** | ANTIGRAVITY | Diseñar componentes de análisis de Matchup y Builds en la UI | `src/renderer/views/MatchupView.tsx`, `src/renderer/components/BuildVisualizer.tsx` | T-4.3, T-5.2 | Muestra dificultad del matchup (1-10), árbol de runas, orden de subida de habilidades, core build y consejos de early game. |
| **T-5.4** | ANTIGRAVITY | Botón de aplicación inmediata de runas de la IA al cliente LoL | `src/renderer/components/ApplyRunesButton.tsx` | T-4.2, T-5.3 | Un clic transfiere la página generada por Gemini directamente a la LCU API de League of Legends. |

---

## FASE 6: Personalización del Jugador y Dashboard

| ID | Responsable | Objetivo | Archivos | Dependencias | Criterio de Terminado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **T-6.1** | OPENCODE | Implementar sincronización integral de perfil (Riot ID + Match-V5 + Maestría) | `src/main/riot/ProfileSyncService.ts`, `tests/riot/profileSync.test.ts` | T-3.2, T-3.4, T-3.5 | Descarga historial reciente, actualiza estadísticas agregadas y guarda en SQLite; tests pasando. |
| **T-6.2** | ANTIGRAVITY | Desarrollar vista de Perfil y Dashboard de Rendimiento | `src/main/ipc/profileIpc.ts`, `src/renderer/views/ProfileView.tsx` | T-3.7, T-6.1 | Muestra rango actual, KDA, winrate general y por rol, mejores campeones y tarjetas de partidas recientes. |
| **T-6.3** | ANTIGRAVITY | Motor de recomendaciones personalizadas de picks basadas en historial | `src/main/ai/PersonalizedAdvisor.ts` | T-5.2, T-6.2 | Cruza las recomendaciones de Gemini con la maestría real del jugador para priorizar picks de alta efectividad personal. |

---

## FASE 7: Verificación E2E y Empaquetado Inicial

| ID | Responsable | Objetivo | Archivos | Dependencias | Criterio de Terminado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **T-7.1** | OPENCODE | Ejecutar suite completa de tests de backend y generar reporte de cobertura | `tests/**/*.test.ts`, `docs/PROGRESS.md` | Todas las fases de OpenCode | 100% de tests unitarios pasando sin advertencias ni regresiones. |
| **T-7.2** | ANTIGRAVITY | Refinamiento de UI/UX, animaciones, modo oscuro y estados de error | `src/renderer/**/*` | Todas las vistas | Interfaz responsiva, sin parpadeos, con retroalimentación clara de estados de red y errores. |
| **T-7.3** | ANTIGRAVITY | Configuración de empaquetado para Windows (.exe) con Electron Builder | `package.json`, `electron-builder.json5` | T-7.1, T-7.2 | Generación exitosa de ejecutable local sin dependencias externas. |
| **T-7.4** | ANTIGRAVITY | Revisión final de contratos, pruebas de humo y entrega al usuario | `docs/` | T-7.3 | Reporte de finalización de proyecto y verificación de todos los requisitos de SPEC.md. |

---

## FASE 8: Modos Especiales (ARAM Caos y Arena) y Overlay In-Game (v1.1.0)

| ID | Responsable | Objetivo | Archivos | Dependencias | Criterio de Terminado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **T-8.1** | ANTIGRAVITY | Sondeo Fase 0 y Contratos de Dominio (`TipoModo`, `AugmentInfo`, `DatosModoCampeon`, Canales IPC, DB `mode_cache`) | `docs/VERIFICACION_MODOS.md`, `src/shared/*`, `src/main/db/schema.sql`, `src/main/db/DatabaseService.ts` | T-7.4 | Pruebas de sondeo verificadas, tipos y eventos definidos, compilación limpia y pruebas unitarias de caché de modo pasando. |
| **T-8.2** | OPENCODE | Cliente Live Client Data API (`https://127.0.0.1:2999`) y detector de modo en LCU | `src/main/lcu/LiveClientDataClient.ts`, `tests/lcu/liveClientData.test.ts` | T-8.1 | Conexión HTTPS autofirmada, sondeo de `/liveclientdata/activeplayer` y `/allgamedata`; detección de cola 2400 (Mayhem) y 1700 (Arena). |
| **T-8.3** | OPENCODE | Servicio de Augments de Modos (`ModeAugmentService`) con catálogo OP.GG y Community Dragon en caché SQLite | `src/main/modes/ModeAugmentService.ts`, `tests/modes/modeAugments.test.ts` | T-8.1 | Extrae augments reales con tier, pick rate y recomendación óptima para el campeón; almacena en `mode_cache` (TTL 24h). |
| **T-8.4** | OPENCODE | Verificador de pantalla sin bordes (`BorderlessDetector`) en `game.cfg` | `src/main/modes/BorderlessDetector.ts`, `tests/modes/borderless.test.ts` | T-8.1 | Lee `[General] WindowMode` en `<leaguePath>\Config\game.cfg`; alerta si está en fullscreen (0) y valida borderless (1). |
| **T-8.5** | ANTIGRAVITY | Ventana Electron Overlay (Transparente, Always-on-top, Click-through e Inactive) | `src/main/overlay/OverlayManager.ts`, `src/main/index.ts` | T-8.2, T-8.4 | Ventana `frame:false`, `transparent:true`, atajos globales `Ctrl+Shift+O`, control de opacidad e ignoreMouseEvents. |
| **T-8.6** | ANTIGRAVITY | Componentes React Overlay UI (Tarjeta Blitz, Badge de Tier Dorado/Plateado, Pick Rate Cian) | `src/overlay/*`, `overlay.html`, `vite.config.ts` | T-8.3, T-8.5 | Tarjeta visual con estética P3R/Blitz, nombre del campeón, tier badges coloreados, pick rate cian y distinción de la mejor opción. |
| **T-8.7** | ANTIGRAVITY | Verificación integral, suite completa de tests y build de producción v1.1.0 | `tests/*`, `dist/` | T-8.6 | 100% tests pasando (`vitest run`), `tsc --noEmit` limpio, y empaquetado sin errores. |

---

## FASE 9: Overlay de Augments V2 (Lectura en Pantalla + Visibilidad Exacta)

| ID | Responsable | Objetivo | Archivos | Dependencias | Criterio de Terminado | Estado |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **T-9.0** | ANTIGRAVITY | Fase 0: Verificación empírica sobre capturas reales in-game, calibración de ROIs y PSM | `docs/VERIFICACION_PANTALLA_AUGMENTS.md`, `scripts/sondeo-pantalla-augments.cjs` | T-8.7 | Coordenadas parametrizadas verificadas, PSM 6 validado con 95%+ confianza, umbrales RGB determinados. | **COMPLETADO** |
| **T-9.1** | ANTIGRAVITY | Detector visual de presencia del panel (`AugmentPanelDetector`) | `src/main/ocr/AugmentPanelDetector.ts`, `tests/ocr/augmentPanelDetector.test.ts` | T-9.0 | Muestreo ligero de color, máquina de estados con debounce (1 tick abrir, 2 ticks cerrar), oferta consumida, 100% tests pasando. | **COMPLETADO** |
| **T-9.2** | ANTIGRAVITY | Reparación de `ScreenAugmentDetector` (PSM 6, preprocesado, Damerau-Levenshtein $\ge 0.70$, erradicación de tiers inventados) | `src/main/ocr/ScreenAugmentDetector.ts`, `tests/ocr/screenDetector.test.ts` | T-9.0 | Matching difuso con Damerau-Levenshtein, sin tiers fabricados, fallback "Sin datos" conforme a Ley 1. | **COMPLETADO** |
| **T-9.3** | ANTIGRAVITY | Actualización de UI Overlay (`OverlayApp.tsx`) para datos estrictamente reales | `src/renderer/overlay/OverlayApp.tsx` | T-9.2 | Eliminado fallback a "top 3 recomendado"; muestra "Escaneando...", "No reconocido" o "Sin datos" fielmente. | **COMPLETADO** |
| **T-9.4** | ANTIGRAVITY | Orquestación en ciclo de vida del juego (`index.ts`, `OverlayManager.ts`) | `src/main/index.ts`, `src/main/overlay/OverlayManager.ts`, `tests/overlay/overlayManager.test.ts` | T-9.1, T-9.3 | Apertura reactiva al detectar panel, cierre inmediato al elegir augment ($\le 1.5$s), tope de seguridad 45s. | **COMPLETADO** |
| **T-9.5** | ANTIGRAVITY | Verificación integral (TypeScript, 474 tests Vitest, documentación y build) | `docs/REQUESTS.md`, `docs/TASKS.md` | T-9.1 a T-9.4 | `tsc --noEmit` limpio, 38 suites pasando, documentación alineada a la Ley 1. | **COMPLETADO** |

---

## FASE 10: Visor Ligero In-Game y Optimización de Rendimiento (Cero Lag/Ping)

| ID | Responsable | Objetivo | Archivos | Dependencias | Criterio de Terminado | Estado |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **T-10.1** | ANTIGRAVITY | Fase 0: Sondeos de Live Client Data API y OP.GG MCP con fixtures reales y documentación | `scripts/sondeo-liveclient.mjs`, `scripts/sondeo-opgg-modos.mjs`, `docs/VERIFICACION_AUMENTOS.md` | T-9.5 | Endpoints probados, JSON canónico en `tests/fixtures/`, descubrimiento de `lol_list_aram_augments` documentado. | **COMPLETADO** |
| **T-10.2** | ANTIGRAVITY | Contratos compartidos (`AumentoInfo`, `AumentoTier`, regla determinista `calcularTierAumento`, eventos IPC, eliminación de parche hardcoded) | `src/shared/types.ts`, `src/shared/events.ts`, `src/main/opgg/OpGgClient.ts`, `src/main/riot/DataDragonService.ts` | T-10.1 | Tipos exportados, regla determinista probada en `tests/shared/aumentosTier.test.ts`, cero parches fijos `'26.20'`. | **COMPLETADO** |
| **T-10.3** | OPENCODE | Optimización de rendimiento backend (filtrado WebSocket puntual, suspensión de sondeo WMI/PowerShell durante partida, diferir warmup) | `src/main/lcu/LcuWebSocket.ts`, `src/main/lcu/LcuClient.ts`, `src/main/index.ts` | T-10.2 | CPU en reposo < 2%, cero invocaciones WMI cada 2s mientras conectado, tests de LCU pasando. | **EN CURSO** |
| **T-10.4** | OPENCODE | Integración backend de `lol_list_aram_augments` en `OpGgClient` y caché SQLite `mode_cache` TTL 24h | `src/main/opgg/OpGgClient.ts`, `src/main/modes/ModeAugmentService.ts`, `tests/opgg/opGgClient.test.ts` | T-10.2 | Extracción de aumentos ARAM Caos vía MCP oficial con fallback a web RSC, tests pasando sin red real. | **PENDIENTE** |
| **T-10.5** | ANTIGRAVITY | UI del Visor Ligero compacto (ventana flotante no intrusiva `focusable:false`, clics pasantes, estilo Blitz) | `src/renderer/overlay/OverlayApp.tsx` o `src/renderer/visor/`, `src/main/overlay/OverlayManager.ts` | T-10.3, T-10.4 | Visor discreto sin sobrecarga de GPU, badge S+/S/A/B/C/D, pick rate en cian, mejor opción resaltada. | **PENDIENTE** |
| **T-10.6** | ANTIGRAVITY | Verificación E2E, 100% tests Vitest, build de producción v1.1.0 y documentación final | `README.md`, `docs/RELEASE.md`, `package.json` | T-10.1 a T-10.5 | `npx tsc && vitest run` al 100%, empaquetado NSIS v1.1.0 limpio, guía de modo Sin bordes incluida. | **PENDIENTE** |


