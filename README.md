<p align="center">
  <img src="docs/assets/logo.png" width="180" alt="EAsy Logo" />
</p>

<h1 align="center">EAsy (Export Assets)</h1>

<p align="center">
  <strong>Haciéndole la vida fácil a los loleros.</strong><br>
  Asistente de escritorio nativo de alto rendimiento para League of Legends en Windows, reconstruido en <strong>Tauri v2 + Rust</strong>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Backend-Rust%201.80+-orange?logo=rust&logoColor=white" alt="Rust" />
  <img src="https://img.shields.io/badge/Framework-Tauri%20v2-blue?logo=tauri&logoColor=white" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/Frontend-React%2018%20%7C%20TS%20%7C%20Tailwind-61dafb?logo=react&logoColor=white" alt="React 18" />
  <img src="https://img.shields.io/badge/LoL%20Patch-26.20-gold?logo=leagueoflegends&logoColor=white" alt="Patch 26.20" />
  <img src="https://img.shields.io/badge/Anti--Cheat-Vanguard%20100%25%20Safe-brightgreen" alt="Vanguard Safe" />
  <img src="https://img.shields.io/badge/RAM-~50%20MB-success" alt="RAM ~50MB" />
</p>

---

## ⚡ Nueva Arquitectura Nativa: Tauri v2 + Rust

En su versión **v1.0.1**, **EAsy** ha sido completamente migrado de Electron a **Tauri v2 con backend en Rust**:
* **Consumo de memoria ultra bajo:** Reducción de ~350 MB a solo **~50 MB de RAM** en ejecución.
* **Instalador ligero:** Reducción del peso de descarga de ~135 MB a tan solo **4.7 MB** (`EAsy_1.0.1_x64-setup.exe`).
* **OCR Nativo de Windows (`Windows.Media.Ocr`):** Reconocimiento óptico de caracteres acelerado por hardware sin librerías externas pesadas.
* **100% Seguro con Vanguard:** Cero inyección de DLLs, cero lectura de memoria protegida, sin simulación de clics ni trampas. Únicamente lectura local de Live Client Data API (`https://127.0.0.1:2999`), LCU lockfile y APIs públicas de Riot / OP.GG.

---

## ¿De dónde viene el nombre y cuál es la idea?

**EAsy** nace de dos pilares:
1. **Export Assets**: exporta e inyecta runas, builds e item sets directamente a tu cliente de League of Legends en un solo clic.
2. **Easy (fácil)**: porque la meta es eliminar la fricción que sufrimos quienes jugamos LoL a diario.

Se acabó tener 5 pestañas de navegador abiertas que te comen la RAM y los FPS, buscar guías en páginas lentas a 10 segundos de iniciar la partida, o armar runas a contrarreloj. **EAsy se encarga de lo tedioso para que te concentres en ganar tu línea.**

---

## Un vistazo a la app

La interfaz está inspirada en la estética **Dark Hour** de *Persona 3 Reload* (azul marino profundo, acentos cian/neón, cortes diagonales y tipografía inclinada): limpia, legible y optimizada para cero interferencia visual.

### Pantalla de Inicio
*Monitoreo en tiempo real del estado de tu cliente de LoL y control rápido de Auto-Accept con retardo configurable.*
![Pantalla de Inicio de EAsy](docs/screenshots/dashboard.png)

### Selección de Campeón
*Detección automática de tu rol, tu campeón y el rival predicho, con estadísticas y recomendaciones de OP.GG.*
![Selección de Campeón en EAsy](docs/screenshots/champselect.png)

### Ajustes y Diagnóstico
*Configuración de tus campeones preferidos, bans automáticos por rol, elo de referencia y panel de soporte.*
![Ajustes y Diagnóstico](docs/screenshots/settings.png)

---

## Características Principales

### 🎯 1. Overlay Ligero de Aumentos en Tiempo Real (ARAM Caos & Arena)
En los modos **ARAM Caos (Mayhem)** y **Arena**, cuando el juego te presenta los 3 aumentos (Plata, Oro, Prismático), EAsy despliega un visor flotante ultra discreto en la cabecera superior:
- **Tiers Reales OP.GG**: Clasificación precisa (S+, S, A, B, C, D) y Pick Rate calculados para tu campeón y parche actual. **Cero datos inventados.**
- **Recomendación Inteligente**: Destaca de forma clara cuál es la mejor opción estadística.
- **Filtro Anti-Pantalla de Muerte**: Algoritmo cromático que previene falsos positivos al morir (desaturación gris de pantalla).
- **No tapa los botones del juego**: Ubicado en el 14% superior de la pantalla, dejando libres los dados de Reroll.
- **Detección Automática de Reroll**: Hash perceptual de 64-bits (`dHash`) que re-escanea al instante cuando tiras dados.
- **Ventana Click-Through**: `setIgnoreMouseEvents(true)`, nunca roba clics ni foco al juego. Atajo global: `Ctrl+Shift+O`.

### ⚡ 2. Auto-Accept con retardo configurable
¿Fuiste a servirte agua o al baño mientras buscabas partida y sonó la cola? EAsy acepta la partida por ti. Puedes configurar un retardo de 1 a 4 segundos para que la aceptación sea natural.

### 🛡️ 3. Cero registros y cero claves obligatorias
No necesitas crearte cuentas en ninguna web, ni pagar nada, ni conseguir claves de desarrollador para jugar. Abres League of Legends, abres EAsy y listo: detecta tu cuenta, nivel, rango de ranked y partidas directamente desde tu propio cliente en tu PC.

### 🔍 4. Detección automática en Selección de Campeón
En cuanto entras a la sala de selección, EAsy detecta:
- En qué línea juegas (Superior, Jungla, Medio, Tirador o Soporte).
- El campeón que tienes seleccionado o en hover.
- Quién es tu rival directo en línea.

### 📜 5. Runas óptimas a un solo clic
Con un solo botón, inyecta la página de runas completa y validada directo al cliente oficial. En tu lista de páginas aparecerá como **EAsy**, y cada vez que importes una nueva, limpia automáticamente las anteriores para que no se te acumule basura.

### 🎒 6. Conjuntos de objetos (Item Sets) en la tienda in-game
Te arma la build completa directamente en la tienda del juego:
- **Objetos iniciales** (incluyendo soporte como Atlas Mundial).
- **Botas recomendadas**.
- **Objetos centrales (Core Build)**.
- **Opciones situacionales** adaptadas al daño del rival.
- **Consumibles y pociones**.

### 📊 7. Metagame y estadísticas reales de OP.GG
Las recomendaciones provienen de millones de partidas analizadas en el parche actual (**26.20**). Además, puedes elegir con qué nivel de juego quieres comparar tus datos (Esmeralda+, Diamante+, Máster+ o todos los rangos).

### 🤖 8. Auto-Pick y Auto-Ban de respaldo
Por seguridad, el auto-pick viene apagado por defecto. Pero si tienes que apartarte del teclado durante la fase de selección, puedes armar una lista de prioridades de campeones y de bans para cada posición. EAsy elegirá o bloqueará el primer campeón disponible de tu lista.

---

## Cómo instalarlo en 1 minuto

1. Entra a la sección de [Releases](https://github.com/infinitummm/EAsy/releases) y descarga el instalador: **`EAsy_1.0.1_x64-setup.exe`** (~4.7 MB).
2. Haz doble clic para instalar.
   - El instalador **elimina automáticamente cualquier versión anterior de Electron** para no duplicar espacio ni dejar procesos colgados.
   - Crea un acceso directo limpio con el logo oficial en tu Escritorio.
3. **¿Te sale el aviso azul de Windows SmartScreen ("Windows protegió su PC")?**  
   Es totalmente normal: como EAsy es un proyecto open source independiente y no utiliza un certificado comercial de pago de Microsoft, Windows te avisará la primera vez.  
   - Haz clic en **"Más información"**.  
   - Luego en **"Ejecutar de todas formas"**.  
   - Solo te lo preguntará una vez.
4. Abre League of Legends, abre EAsy ¡y a jugar!

---

## Para desarrolladores (Compilar desde el código)

Requisitos previos: **Node.js 18+**, **Rust 1.80+ (cargo)** y las **Herramientas de compilación de Visual Studio C++ (MSVC)**.

```bash
# 1. Clonar el repositorio
git clone https://github.com/infinitummm/EAsy.git
cd EAsy

# 2. Instalar dependencias
npm install

# 3. Correr en modo desarrollo con recarga rápida (HMR y Rust backend)
npx tauri dev

# 4. Correr la suite de pruebas unitarias
npm test

# 5. Generar el instalador ejecutable optimizado para Windows (.exe)
npx tauri build
```

El instalador final generado quedará disponible en `src-tauri/target/release/bundle/nsis/EAsy_1.0.1_x64-setup.exe` y en `release/EAsy_1.0.1_x64-setup.exe`.

---

## Privacidad y Seguridad

- **100% en tu ordenador**: EAsy no envía tus datos a servidores externos ni recopila telemetría.
- **Base de datos SQLite local**: Tus ajustes, historial y caché de aumentos se guardan en tu equipo en `%LOCALAPPDATA%\EAsy\itero_local.db`.
- **Limpieza segura**: Puedes borrar en cualquier momento las páginas y conjuntos creados por la app desde la sección *Avanzado / Diagnóstico* en Ajustes.

---

## Descargo legal

Este proyecto es una aplicación creada por fans sin fines de lucro. No está afiliada, respaldada ni asociada con **Riot Games, Inc.**, **Atlus Co., Ltd.** ni **Sega Corporation**.

- *League of Legends* y todos los activos relacionados son marcas comerciales o marcas registradas de Riot Games, Inc.
- Las referencias visuales y tipográficas inspiradas en *Persona 3 Reload* pertenecen a Atlus y Sega.
