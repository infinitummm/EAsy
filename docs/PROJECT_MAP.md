# Mapa del Proyecto Itero Local

Guía rápida de arquitectura y localización de funciones clave. Consultar antes de explorar el código.

## Comandos Principales
- `npm run dev`: Inicia Electron en modo desarrollo con Vite.
- `npx vitest run tests/<archivo>.test.ts`: Ejecuta pruebas unitarias de un módulo específico.
- `npx tsc --noEmit`: Verificación estricta de tipos TypeScript.
- `npm run dist:portable`: Empaqueta el ejecutable portable a `release/` (solo al finalizar).

## Estructura de Directorios
```
src/
├── main/                 # Proceso principal de Electron (Node.js)
│   ├── ai/               # Proveedores de IA (Gemini, Groq, AiProviderManager)
│   ├── db/               # SQLite local con better-sqlite3 (DatabaseService)
│   ├── ipc/              # Handlers IPC entre Main y Renderer (champSelectIpc)
│   ├── lcu/              # Integración League Client Ux (HTTP, WebSocket, Runas, Items)
│   ├── opgg/             # Cliente OP.GG MCP oficial (OpGgClient, streamable HTTP)
│   ├── riot/             # Data Dragon y Riot API oficial (DataDragonTranslator)
│   └── index.ts          # Entry point principal, ciclo de vida y orquestación
├── preload/              # ContextBridge seguro y APIs expuestas al renderer
├── renderer/             # Frontend React 18 + TailwindCSS
│   ├── components/       # Componentes reusables (RolePreferencesEditor, Nav, etc.)
│   ├── views/            # Vistas (ChampSelectView, MatchupView, SettingsView, etc.)
│   └── App.tsx           # Enrutador de pestañas y estado global
├── shared/               # Tipos, contratos IPC y eventos compartidos (TypeScript)
tests/                    # Tests unitarios Vitest por subsistema (lcu, opgg, ai, etc.)
docs/                     # Documentación técnica y especificaciones
```

## Localización de Funciones Clave
- **Auto Accept / Ready Check**: `src/main/lcu/AutoAcceptService.ts` (`handleReadyCheck`, `acceptReadyCheck`).
- **Detección LCU**: `src/main/lcu/LcuDetector.ts` (Métodos A: WMI, B: RiotClientInstalls, C: Rutas, D: Manual).
- **Champ Select & Pick/Ban**: `src/main/lcu/ChampSelectService.ts` (`handleChampSelectSession`, `performAction`).
- **Páginas de Runas**: `src/main/lcu/RuneManager.ts` (`applyRunePage`, `cleanAppRunePages`, nombre `[IL] Itero Local`).
- **Conjuntos de Ítems**: `src/main/lcu/ItemSetManager.ts` (`createItemSet`, `cleanAppItemSets`, prefijo `[IL]`).
- **OP.GG MCP**: `src/main/opgg/OpGgClient.ts` (`getLaneMatchupGuide`, `getChampionAnalysis`, llamadas Streamable HTTP).
- **Traductor Data Dragon**: `src/main/riot/DataDragonTranslator.ts` (Resolución de nombres e IDs numéricos `es_MX`).
- **Orquestador IPC**: `src/main/ipc/champSelectIpc.ts` (Canales IPC de draft, matchups, assets y versiones).
- **Asesor IA**: `src/main/ai/PersonalizedAdvisor.ts` (Generación de consejos contextuales con Gemini).
- **Base de Datos**: `src/main/db/DatabaseService.ts` (Caché de matchups, historial y preferencias).
