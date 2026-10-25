# Verificación Empírica de Pantalla — Overlay de Augments V2 (Fase 0)

**Fecha:** 2026-10-25  
**Entorno de prueba:** League of Legends (Arena / ARAM Caos) en modo Sin Bordes (*Borderless*, `WindowMode=1`).  
**Muestra empírica base:** `user_shot_3.png` (resolución capturada 1600x1200 / pantalla de partida real).

---

## 1. Coordenadas y Geometría de los Recortes

En resolución estándar (16:9 y relaciones centradas por HUD de Riot Games), las 3 cartas de aumentos se ubican simétricamente en el tercio central de la pantalla:

| Elemento | Centro X | Rango X (%) | Rango Y (%) | Dimensiones Relativas |
|---|---|---|---|---|
| **Carta 1 (Título)** | 33.33 % | `25.0 % - 41.0 %` | `33.0 % - 43.0 %` | `width: 16.0 %, height: 10.0 %` |
| **Carta 2 (Título)** | 50.00 % | `42.0 % - 58.0 %` | `33.0 % - 43.0 %` | `width: 16.0 %, height: 10.0 %` |
| **Carta 3 (Título)** | 66.67 % | `59.0 % - 75.0 %` | `33.0 % - 43.0 %` | `width: 16.0 %, height: 10.0 %` |
| **Botón Reroll 1** | 33.33 % | `31.0 % - 36.0 %` | `64.5 % - 68.0 %` | `width: 5.0 %, height: 3.5 %` |
| **Botón Reroll 2** | 50.00 % | `47.5 % - 52.5 %` | `64.5 % - 68.0 %` | `width: 5.0 %, height: 3.5 %` |
| **Botón Reroll 3** | 66.67 % | `64.0 % - 69.0 %` | `64.5 % - 68.0 %` | `width: 5.0 %, height: 3.5 %` |

---

## 2. Detección de Presencia del Panel (AugmentPanelDetector)

### Muestras RGB Empíricas
Cuando la pantalla de aumentos está abierta:
* **Fondo interior de las cartas**: Azul pizarra oscuro / gris carbón (`r: 30–70, g: 35–75, b: 40–80`), con baja luminancia global (< 90).
* **Botones de Reroll (`[⟳ 1]`)**: Oro/ámbar hextech característico con alto componente rojo y verde (`r: 190–250, g: 170–235, b: 110–180`), con `r > b + 30`.

### Criterio de Decisión (`evaluarVisibilidadPanel`)
El panel se considera **VISIBLE (`true`)** si:
1. Al menos 2 de las 3 zonas de reroll coinciden con el color dorado hextech (`r > 150`, `g > 130`, `r > b + 20`).
2. Y al menos 2 de las 3 cartas muestran luminancia promedio de fondo interior < 100.

### Política de Debounce
* **Apertura**: 1 confirmación positiva para respuesta inmediata (~700 ms).
* **Cierre**: 2 confirmaciones negativas consecutivas (~1.400 ms) para prevenir parpadeos durante micro-transiciones.

---

## 3. Calibración OCR y Reconocimiento de Títulos

Se ejecutaron pruebas comparativas con Tesseract.js sobre los recortes reales extraídos de `user_shot_3.png`:

| Carta | Texto Real | PSM 7 (Single Line) | PSM 6 (Single Block) | Confianza PSM 6 |
|---|---|---|---|---|
| **Carta 1** | *Hybrid* | `"Ey"` (29%) | `"Hybrid"` | **96%** |
| **Carta 2** | *Willing Sacrifice* | `"em"` (42%) | `"Willing Sacrifice"` | **95%** |
| **Carta 3** | *Apex Inventor* | `"Mmmm"` (38%) | `"Apex Inventor"` | **96%** |

### Conclusión Técnica de OCR
* **PSM 7 falla sistemáticamente** debido a la relación de aspecto y márgenes alrededor del texto.
* **PSM 6 (Single Uniform Block)** alcanza **95 %–96 % de confianza** directa sin necesidad de reescalados destructivos ni binarizaciones extremas.

---

## 4. Matching Difuso (Damerau-Levenshtein)

Se reemplaza la anterior suma de 10 puntos por palabras de descripción (que provocaba falsos positivos) por la métrica de **Damerau-Levenshtein normalizado**:
$$\text{Similitud}(s_1, s_2) = 1 - \frac{\text{distancia}(s_1, s_2)}{\max(\text{len}(s_1), \text{len}(s_2))}$$
* **Umbral de aceptación:** $\ge 0.70$.
* **Dominio:** Título en inglés (`name`) o español (`nameEs`), tomando el puntaje mayor.
* Si el puntaje es menor a $0.70$, se reporta como `null` y la tarjeta muestra **"No reconocido"** (sin inventar datos ni forzar emparejamientos espurios).

---

## 5. Auditoría de APIs Oficiales de Riot (Live Client Data & LCU)

Se verificó contra `/liveclientdata/allgamedata` y `/lol-gameflow/v1/session`:
* La Live Client Data API **NO expone** los 3 aumentos en oferta mientras el usuario elige (solo expone los aumentos ya adquiridos e instalados en el inventario/runas tras la selección).
* La visión de pantalla pasiva (`desktopCapturer`) mediante análisis de píxeles y OCR sobre la ventana del juego es el único mecanismo legítimo permitido por los términos de servicio de Riot Games para asistentes in-game.
