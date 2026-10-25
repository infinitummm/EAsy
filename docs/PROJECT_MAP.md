# Mapa del Proyecto Itero Local

Guía rápida de arquitectura y localización de funciones clave. Consultar antes de explorar el código.

## Comandos Principales
- `npm run dev`: Inicia Electron en modo desarrollo con Vite.
- `npx vitest run tests/<archivo>.test.ts`: Ejecuta pruebas unitarias de un módulo específico.
- `npx tsc --noEmit`: Verificación estricta de tipos TypeScript.
- `npm run dist:nsis` o `.\scripts\release.ps1`: Empaqueta el instalador NSIS a `release/`.

## Estructura de Directorios
```
src/
├── main/                 # Proceso principal de Electron (Node.js)
│   ├── ai/               # Proveedores de IA (Gemini, Groq, AiProviderManager)
│   ├── db/               # SQLite local con better-sqlite3 (DatabaseService)
│   ├── ipc/              # Handlers IPC entre Main y Renderer (settingsIpc, profileIpc, etc.)
│   ├── lcu/              # Integración League Client Ux (LcuAccountService, AutoAccept, Pick/Ban)
│   ├── opgg/             # Cliente OP.GG MCP oficial (OpGgClient, streamable HTTP)
│   ├── riot/             # Data Dragon y Riot API oficial (DataDragonTranslator)
│   ├── security/         # Cifrado seguro local (Windows DPAPI safeStorage + AES-256-GCM)
│   ├── updater.ts        # Autoactualización con GitHub Releases y electron-updater
│   └── index.ts          # Entry point principal, ciclo de vida y orquestación
├── preload/              # ContextBridge seguro y APIs expuestas al renderer
├── renderer/             # Frontend React 18 + TailwindCSS
│   ├── components/       # Componentes reusables (OnboardingModal, AboutModal, Nav, etc.)
│   ├── views/            # Vistas (ChampSelectView, MatchupView, ProfileView, SettingsView, etc.)
│   └── App.tsx           # Enrutador de pestañas y estado global
├── shared/               # Tipos, contratos IPC y eventos compartidos (TypeScript)
tests/                    # Tests unitarios Vitest por subsistema (security, lcu, opgg, etc.)
docs/                     # Documentación técnica (PROJECT_MAP, RELEASE, AMIGOS)
```

## Localización de Funciones Clave
- **Sincronización LCU Local (Sin Riot API)**: `src/main/lcu/LcuAccountService.ts` (`sincronizarCuentaLocal`).
- **Seguridad y Cifrado (DPAPI safeStorage)**: `src/main/security/SecurityService.ts` (`encrypt`, `decrypt`, `migrarSiEsNecesario`).
- **Diagnóstico Sanitizado**: `src/main/ipc/settingsIpc.ts` (`sanitizarParaDiagnostico`, `SETTINGS_EXPORT_DIAGNOSTIC`).
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
- **Detector Visual de Panel de Aumentos**: `src/main/ocr/AugmentPanelDetector.ts` (Sondeo visual RGB en tiempo real para visibilidad exacta).
- **Detector OCR de Pantalla**: `src/main/ocr/ScreenAugmentDetector.ts` (Tesseract PSM 6 y matching Damerau-Levenshtein $\ge 0.70$).
- **Overlay Manager y App**: `src/main/overlay/OverlayManager.ts` y `src/renderer/overlay/OverlayApp.tsx` (Ventana transparente click-through con insignias de aumentos estilo Blitz).
