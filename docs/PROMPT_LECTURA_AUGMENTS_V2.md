# Prompt Maestro — Overlay de Augments V2: lectura fiable en pantalla + visibilidad exacta

Fecha: 2026-10-25
Audiencia: agente implementador (OpenCode / Antigravity / otro)
Proyecto: EAsy (proyecto-itero) — asistente de escritorio para League of Legends (Electron + React 18 + TypeScript + Vite + Tailwind)

---

## 0. Tu rol y las leyes del proyecto

Eres el implementador responsable de reparar y completar la característica "Overlay de Augments"
para los modos **ARAM Caos (aram_mayhem)** y **Arena**. NO reescribas el proyecto entero: trabaja
ÚNICAMENTE en los módulos listados en la sección 7.

Leyes inquebrantables de este repositorio (ya están en `docs/REQUESTS.md`, cumplir a rajatabla):

1. **NUNCA inventar datos.** Toda estadística mostrada (tiers S+/S/A/B/C/D, pick rate, win rate)
   debe venir de la fuente real (OP.GG por campeón y parche). Si no hay dato, se muestra
   "Sin datos". Está PROHIBIDO cualquier tier fabricado con divisiones/modulo (`idx % 3 === 0
   ? 'S+' : 'S'`) o constantes tipo `pickRate: 8.0` mágicos.
2. **Cumplimiento Riot estricto:** prohibido leer memoria del juego, inyectar DLLs o automatizar
   el cliente con exploits. Solo está permitido: LCU API (`https://127.0.0.1:...` con lockfile),
   Live Client Data API (`https://127.0.0.1:2999`), **captura de pantalla del sistema operativo**
   (`desktopCapturer` de Electron) y estadísticas públicas (página web / RSC de OP.GG, Community
   Dragon, Data Dragon).
3. **Idioma y estilo:** código, comentarios, nombres de variables, logs (`registrarLog`) y tests
   EN ESPAÑOL, siguiendo el estilo exacto de los archivos existentes.
4. **Todo cambio debe pasar verificación:** `npx tsc --noEmit` y `npm test` (Vitest, 391+ tests)
   sin errores, sin debilitar ni borrar tests existentes.
5. Si algo de este prompt entra en conflicto con un hecho verificable del código, PREGUNTA o
   documenta la decisión; no hagas ajustes silenciosos.

## 1. Lo que pide el usuario (objetivo producto)

En ARAM Caos y Arena, cuando el juego muestra en pantalla las 3 cartas de augments:

1. **Leer los 3 augments REALES que hay en pantalla**, de forma fiable y "súper fácil"
   (detección de presencia del panel + OCR del título con preprocesamiento + matching difuso).
2. Mostrar en el overlay, debajo de cada carta real, la información REAL para el campeón que
   tengo en partida y el parche vigente: **escudo de tier (S+/S/A/B/C/D), pick rate, rareza
   (plata/oro/prisma) y cuál es la mejor opción** (estilo Blitz — ya existe el componente).
3. **El overlay SOLO aparece cuando la pantalla de selección de augments está visible en el
   juego.** En cuanto se elige un augment (las cartas desaparecen), el overlay se oculta y NO
   vuelve hasta que aparezca la siguiente pantalla de selección. Nada de temporizadores fijos
   que abran el overlay a destiempo.
4. Si un augment no se reconoce con confianza, mostrar esa carta como **"No reconocido"** con el
   botón "Re-escanear" (ya existe). PROHIBIDO sustituir los datos por "top 3 recomendado" o
   cualquier dato no surgido de la partida.

## 2. Estado actual — LEE ESTOS ARCHIVOS ANTES DE ESCRIBIR UNA SOLA LÍNEA

| Archivo | Contenido relevante |
|---|---|
| `src/main/ocr/ScreenAugmentDetector.ts` | Detector OCR actual (Tesseract.js). Recortes fijos porcentuales (líneas ~200-228). `emparejarAumento()` (líneas ~42-94) con umbral 30 y scoring por descripción. Fallback con catálogo de tiers inventados (líneas ~156-170). |
| `src/main/modes/ModeAugmentService.ts` | Fuente REAL de tiers: parse del payload RSC de `https://op.gg/lol/modes/{aram-mayhem|arena}/<champ>/augments` + traducción Community Dragon + caché SQLite `mode_cache` TTL 24 h. `construirDatosModoDesdeCatalogoLocal()` (líneas ~521-576) fabrica tiers → debe dejar de usarse como fuente de TEIR/DATOS. |
| `src/main/modes/BorderlessDetector.ts` | Detección/aplicación de modo "sin bordes" (`game.cfg` → `WindowMode=1`). Requisito para que el overlay sea visible sobre LoL. |
| `src/main/overlay/OverlayManager.ts` | Ventana transparente fullscreen, `focusable:false`, `showInactive()`, atajos `Ctrl+Shift+O/I`, `triggerAugmentSelection()` (línea ~160) con auto-dismiss de timer fijo, `reanalyze()` que manda `overlay:screen-augments`. |
| `src/renderer/overlay/OverlayApp.tsx` | UI de insignias estilo Blitz (`TierShield`, `RarityTag`), `displayCards` (líneas ~275-295) con fallback a "top 3 recomendado" (Borrar ese fallback), cuenta atrás de auto-cierre, `overlay:reanalyze`. |
| `src/main/index.ts` | Orquestación: `evaluarEstadoPartidaYOverlay` (líneas ~399-476). Disparadores actuales: niveles 3/7/11/15, muerte, y ventanas fijas por ronda de Arena (`ventanasRondas`: 0-45 s, 210-245 s, 450-485 s, 690-725 s). Precarga de datos de OP.GG vía `ModeAugmentService` y `overlayManager.setDatosModo()`. |
| `src/main/lcu/LiveClientDataClient.ts` | Sondeo de `/liveclientdata/allgamedata` cada 2 s durante partida (ya implementado y probado). |
| `src/shared/types.ts` | `AugmentInfo`, `DatosModoCampeon`, `OverlayState` (incluye campo `activeAugments`, hoy sin uso). `TierBadge`, `RarityAugment`, `TipoModo`. |
| `src/shared/events.ts` | Canales IPC: `OVERLAY_SHOW/HIDE/TOGGLE/GET_STATE/STATE_CHANGED`, `MODES_GET_CHAMPION_AUGMENTS`, `MODES_CHECK_BORDERLESS`, `MODES_APPLY_BORDERLESS`. |
| `src/shared/data/augmentsCatalog.json` | Catálogo local de 594 augments (nombre EN/ES, rareza, icono) — sirve SOLO para matching de nombres, jamás para tiers/stats. |
| `docs/VERIFICACION_MODOS.md` | Hechos verificados: el MCP oficial de OP.GG (`mcp-api.op.gg/mcp`) **NO soporta** `arena` ni `aram_mayhem` (solo `ranked/flex/urf/aram/nexus_blitz`) y **no expone augments**. Por eso la fuente legítima es la página web de OP.GG (RSC) — ya implementada. |
| Tests existentes a mantener/actualizar | `tests/ocr/screenDetector.test.ts`, `tests/overlay/overlayManager.test.ts`, `tests/overlay/overlayIpc.test.ts`, `tests/modes/modeAugments.test.ts`. |

Componentes GOOD que NO debes rehacer: parse RSC de OP.GG (`extraerAugmentsDesdeRsc`,
`construirDatosModo`, `asignarTiersPorRendimiento`), caché SQLite, BorderlessDetector,
ventana del overlay, atajos globales, IPC de modos, sondeo LiveClientData.

## 3. Diagnóstico exacto (por qué hoy "muestra mal los datos")

- **D1. Tiers fabricados:** el fallback de `ScreenAugmentDetector.analizarPantalla` y
  `construirDatosModoDesdeCatalogoLocal` asignan tiers por `idx % N` y stats constantes
  (`8.0`, `52.0`). Se viola la ley 1 y el usuario ve S+/S falsos.
- **D2. Falso sustituto en UI:** `OverlayApp.displayCards` muestra el top-3 del catálogo cuando
  el OCR no reconoce nada → datos que NO son los augments reales de la partida.
- **D3. OCR sin preprocesamiento:** se recorta por porcentajes fijos de pantalla completa y se
  pasa tal cual a Tesseract (PSM por defecto). El texto del título de las cartas es dorado con
  glow sobre fondo oscuro con arte de fondo → sin escala ampliada + escala de grises +
  binarización, la tasa de error es altísima en cualquier resolución/UI scale no estándar.
- **D4. Matcher débil:** `emparejarAumento` suma 10 pts por palabra de la descripción y acepta
  con score ≥ 30 → colisiones falsas; tampoco mide similitud real (Levenshtein/Damerau).
- **D5. Visibilidad por utilería adivinada:** el overlay se abre con ventanas temporales fijas
  (Arena), niveles (3/7/11/15) y muerte (ARAM Caos), y se cierra con un timer de 25/30 s.
  Resultado: se abre cuando NO hay cartas en pantalla y se cierra antes o después de tiempo.
  Es la causa de que "no aparezca solo en los aumentos".

## 4. Arquitectura objetivo (pipeline)

```
Partida en curso (aram_mayhem | arena), juego en borderless
        │
        ▼
[1] AugmentPanelDetector  (NUEVO, src/main/ocr/AugmentPanelDetector.ts)
    Sondeo barato de píxeles (~una captura cada 700 ms SOLO mientras hay partida activa):
    decide `panelVisible` = ¿está en pantalla la barra de selección de 3 augments?
    Debounce: abrir con 1 confirmación, cerrar con 2 consecutivas (~1,5 s) para no cerrar
    por parpadeo. Al detectar APERTURA → evento 'panel-abierto'. CIERRE → 'panel-cerrado'.
        │ panel-abierto
        ▼
[2] ScreenAugmentDetector (REPARADO)
    Recorta SOLO la banda del título de cada carta (3 recortes), preprocesa (×3 nearest
    upscale, gris, contraste/threshold), OCR con PSM de línea única (eng+spa), 3 capturas
    en ~1,2 s + voto por mayoría. Matching DIFUSO (Damerau-Levenshtein normalizado, umbral
    ≥ 0.70) contra catálogo real del campeón (datos de `ModeAugmentService`); si el campeón
    aún no tiene datos cargados, espera/spinner y NO fabrica tiers.
        │ overlay:screen-augments
        ▼
[3] OverlayManager + OverlayApp
    panel-abierto → show() sin robar foco + OCR. panel-cerrado → hide() en ≤ 1,5 s y marcar
    la oferta como consumida (no reabrir con la misma oferta). Los timers/ventanas fijas
    actuales dejan de ser la fuente principal y quedan SOLO como respaldo de seguridad.
```

## 5. Requisitos

### RF-1 — Detector de panel por píxeles (la "lectura súper fácil")
1. Nuevo módulo `src/main/ocr/AugmentPanelDetector.ts`: captura con `desktopCapturer`
   (`types: ['screen']`, thumbnail a resolución nativa del display primario) y evalúa
   regiones de interés (ROI) fijas + ~similares a las de las cartas.
2. Señal esperada (a ajustar empíricamente en Fase 0): patrón de franjas/colores de las cartas
   (fondo azul-noche muy oscuro detrás, marcos con glow dorado/púrpura de los bordes y el
   contraste del carril central). Registro en log de las muestras RGB promedio por ROI.
3. API sugerida (pura, testeable): `evaluarVisibilidadPanel(muestras: MuestraRoi[]): boolean`
   + clase que encapsula captura y debounce. Emitir/tener métodos que el orquestador pueda
   consultar: `panelVisible`, y callbacks `onAbrir` / `onCerrar`.
4. Coste: mientras `panelVisible === false`, muestrear a ≤ 0,5 Hz y usar SOLO análisis de
   color (cero OCR). Mientras `panelVisible === true`, sube a ~1,4 Hz para el OCR.
5. Solo corre si `fase === 'InProgress'` y modo `aram_mayhem`/`arena` (integrar en
   `evaluarEstadoPartidaYOverlay` de `src/main/index.ts`).

### RF-2 — OCR fiable y honesto
1. Recortes: delimitar por carta (3 columnas actuales son un buen punto de partida: x 25–41 %,
   41.5–58 %, 58–75 %; y alinear la banda vertical con los valores verificados en Fase 0).
   Los recortes deben parametrizarse en constantes documentadas, no números mágicos inline.
2. Preprocesamiento OBLIGATORIO antes de Tesseract: reescalar ×3 (nearest), escala de grises,
   normalización de contraste y umbral (binarización). Guardar capturas de debug (con marca de
   los rectángulos de recorte) en `scratch/` cuando se active una variable de diagnóstico
   (p. ej. `EAZY_OCR_DEBUG=1`) para calibrar en Fase 0.
3. OCR con `psm` de línea única (7; probar 6 si incluye subtítulo) con `eng` y `spa`; 3
   lecturas en ~1,2 s → **voto por mayoría + mayor score**.
4. Sustituir `emparejarAumento` por matching difuso: Damerau-Levenshtein normalizado sobre el
   título OCR contra `name` y `nameEs` del catálogo (el mayor de los dos), con umbral de
   similitud ≥ 0.70. Eliminar el scoring por palabras de descripción (causa de falsos
   positivos). Función pura y testeada.
5. PROHIBIDO el fallback con tiers inventados: si `datosModo` no existe o no trae al augment
   matcheado, la insignia muestra nombre + rareza + "Sin datos" en el tier (nunca S+/S/etc.
   fabricado) y el overlay dispara la carga de datos reales vía `MODES_GET_CHAMPION_AUGMENTS`.

### RF-3 — UI solo con datos reales
1. Borrar el fallback "top 3 recomendado" de `OverlayApp.displayCards`. Si una carta no está
   reconocida: tarjeta en estado "Escaneando…" → "No reconocido" + botón de re-escanear.
2. Insignias posicionadas debajo de las 3 CARTAS REALES (mantener posiciones actuales
   33.33 % / 50 % / marcas 66.67 %, top 68 %, ajustar en Fase 0 con las capturas de debug).
3. Usar `OverlayState.activeAugments` (ya existe, hoy sin uso) para guardar los 3 augments de
   la oferta ACTUAL y para evitar re-renderizados redundantes.

### RF-4 — Visibilidad exacta (aparece solo en augment / se oculta al elegir)
1. APERTURA: evento `panel-abierto` → `show()` (sin robar foco) + OCR inmediato.
2. CIERRE: evento `panel-cerrado` (el usuario eligió su augment / la ronda avanzó) → `hide()`
   en ≤ 1,5 s, y marcar la oferta como consumida. Sin re-trigger con la misma oferta.
3. Los disparadores actuales de `src/main/index.ts` (niveles 3/7/11/15, muerte, `ventanasRondas`
   fijas) dejan de mandar la visibilidad y pasan a ser **solo un respaldo de emergencia** (p. ej.
   si el detector de panel reporta 3 aperturas en vano). `triggerAugmentSelection(duracion)`
   conserva el parámetro pero pasa a usar un tope de seguridad de ~45 s, no un cierre fijo a
   25/30 s: el cierre correcto es `panel-cerrado`.
4. Re-roll: el botón "Re-escanear" (canal `overlay:reanalyze`) re-ejecuta el OCR bajo demanda.
5. ChampSelect y el resto de fases NO muestran el overlay (ya está; mantener).

### RF-5 — Datos reales por campeón y parche
1. Mantener `ModeAugmentService` (RSC de OP.GG) como ÚNICA fuente de tier/pick rate/win rate.
   Verificar que sigue funcionando con el parche vigente (26.20 en el README; usar
   `DataDragonService`, nunca hardcodear).
2. Recordar: el MCP de OP.GG no soporta estos modos (documentado en `docs/VERIFICACION_MODOS.md`);
   NO perder tiempo integrando el MCP para augments.
3. Caché `mode_cache` TTL 24 h ya implementada; no duplicar.

### RF-6 — Rendimiento y calidad
1. Nada de OCR síncrono ni bloqueos del main process (Tesseract worker ya es async; ok).
2. `npx tsc --noEmit` limpio y `npm test` en verde, sin borrar/debilitar tests existentes.
3. Registrar decisiones en `docs/REQUESTS.md` y avance en `docs/TASKS.md` (flujo del proyecto).

## 6. Fase 0 — Verificación empírica OBLIGATORIA antes de implementar

1. Crea `scripts/sondeo-pantalla-augments.ts` (estilo del repo): al ejecutarlo con
   `EAZY_OCR_DEBUG=1`, captura la pantalla, guarda en `scratch/` las imágenes completas + los
   recortes de título marcados con rectángulos, y vuelca en consola/documento: muestras RGB por
   ROI, texto OCR crudo por carta con distintos PSM/preprocesos y similitudes del matcher.
2. Pide al usuario (QA humano) abrir una partida real de Arena o ARAM Caos y ejecutar el sondeo
   en la pantalla de selección de augments, SIENDO BORDERLESS (el propio servicio
   `MODES_CHECK_BORDERLESS` lo verifica). Registra TODOS los hallazgos en
   `docs/VERIFICACION_PANTALLA_AUGMENTS.md` con: coordenadas finales de los 3 recortes de
   título, umbrales de colores del panel (apertura/cierre) y ejemplos de aciertos/fallos OCR.
3. Sondeo adicional (sin coste): durante la misma partida, loguear la respuesta de
   `/liveclientdata/allgamedata` y de la LCU `/lol-gameflow/v1/session` para CONFIRMAR con
   evidencia que la API oficial no expone los 3 augments ofrecidos. Si en algún payload
   aparecieran los augments, la API oficial pasaría a ser la fuente primaria y el OCR quedaría
   solo como respaldo; documentar la decisión con el payload pegado (recortado) en el doc.
4. NO se escribe código producto hasta cerrar Fase 0 (evita adivinar coordenadas otra vez).

## 7. Plan de implementación

- **T1.** `AugmentPanelDetector.ts` + integración en `index.ts` (apertura/cierre, debounces,
  tope de seguridad 45 s, respaldo de emergencia) + logs puros mediante `registrarLog`.
- **T2.** Reparación `ScreenAugmentDetector`: preprocesado, PSM, voto, matcher difuso,
  constantes documentadas, debug captures; BORRAR fallback inventado; tiers solo desde
  `datosModo` real.
- **T3.** `OverlayApp.tsx`: eliminar fallback top-3; estados "Escaneando / No reconocido /
  Sin datos"; `activeAugments` en estado; cierre ← `panel-cerrado` ocultará la ventana
  desde main (renderer solo refleja).
- **T4.** `index.ts`: disparadores fijos → respaldo; integración fina del ciclo
  abierto-OCR-cerrado; limpieza de `autoDismissTimer` (mantenerlo solo como tope de 45 s).
- **T5.** Tests (sección 8) + `docs/` (REQUESTS, TASKS, VERIFICACION_PANTALLA_AUGMENTS,
  PROJECT_MAP si agrega módulos).
- **T6 (opcional, SOLO si el OCR queda < 85 % de acierto en Fase 0):** verificación secundaria
  por coincidencia de icono: comparar recorte del icono (48×48) contra el `iconUrl` oficial ya
  descargado en caché (`%APPDATA%/proyecto-itero/`) vía distancia media/NCC simple. Es
  OPCIONAL; prototipar y medir antes de integrar.

## 8. Tests obligatorios (Vitest, español, aislados/sin red)

1. `tests/ocr/augmentPanelDetector.test.ts`: `evaluarVisibilidadPanel` con muestras
   (true/false/ácidos), debounce apertura 1 muestra / cierre 2, y máquina de estados
   consumida→nueva oferta (no reabre con la misma).
2. `tests/ocr/screenDetector.test.ts` (EXTENDER): matcher difuso con casos reales —
   OCR con 1-2 caracteres errados ("Sacriflcio voluntario"), acentos, título en inglés o
   español, score < umbral → null; BORRAR/actualizar tests que dependan del scoring por
   descripción o de tiers fabricados.
3. `tests/overlay/overlayManager.test.ts` (EXTENDER): ciclo abierto→cerrado→consumida,
   tope 45 s, hide a tiempo tras panel-cerrado.
4. Fixtures: usar textos OCR simulados; NUNCA red real (el repo ya está en eso).

## 9. Definition of Done (checklist que el usuario validará en partida real)

- [ ] Con Arena/ARAM Caos real y borderless: el overlay se abre SOLO cuando aparecen las 3 cartas
      de augments y desaparece al elegirse un augment, sin quedar pegado ni abrirse a destiempo.
- [ ] La próxima pantalla de selección de augments vuelve a abrir el overlay automáticamente.
- [ ] El tier mostrado marca EXACTAMENTE lo que publica OP.GG para ese campeón y parche
      (verificación puntual: al menos 3 augments contrastados manualmente contra la web de OP.GG).
- [ ] Si el OCR no reconoce una carta: "No reconocido" + Re-escanear; nunca datos inventados.
- [ ] Los clics del ratón siguen llegando al juego (overlay `focusable:false`, pasante por defecto).
- [ ] `npx tsc --noEmit` ✔, `npm test` ✔, HUD y componentes de la app principal sin cambios visuales.
- [ ] Docs actualizadas (REQUESTS, TASKS, VERIFICACION_PANTALLA_AUGMENTS).

## 10. Prohibiciones y trampas conocidas

- PROHIBIDO: leer memoria del juego, DLLs, macros de teclado, simulación de clics del cliente.
- PROHIBIDO: hardcodear `tier`, `pickRate`, `winRate` o inventar porcentajes.
- NO cambiar el estilo visual de `OverlayApp` (ya es el estilo Blitz aprobado por el usuario);
  solo estados y lógica de visibilidad.
- NO tocar los flujos de runas/item sets/matchup (fuera de scope).
- Trampa conocida: `show()` sobre pantalla completa exclusiva NO funciona → exigir bordeless con
  `MODES_CHECK_BORDERLESS` y avisar (la UI de BorderlessDetector ya existe).
- Trampa conocida: los traineddata van en la raíz y están en `asarUnpack` de
  `electron-builder.json5` — mantener.
- En resoluciones o UI scale no estándar, los recortes fijos fallan; por eso Fase 0 es
  obligatoria y las constantes deben poder ajustarse sin rediseño (parámetros data-driven con
  tolerancia).

## 11. Formato de entrega

1. Rama/changesets con commits pequeños y descriptivos.
2. `docs/TASKS.md` con estado por tarea (T1..T6).
3. En el resumen final: hallazgos de Fase 0, umbrales elegidos y por qué,aciertos OCR medidos,
   y la lista del checklist Definition of Done marcado de forma honesta (lo no verificado en
   partida real se declara como pendiente de QA humano).
