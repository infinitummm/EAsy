# Itero Local - League of Legends Desktop Assistant

Asistente de escritorio local, monousuario y en tiempo real para League of Legends en Windows, inspirado en Itero.

## Stack Tecnológico
- **Shell de Escritorio:** Electron 44+ (Node.js 24+)
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS
- **Base de Datos:** SQLite local embebido (`node:sqlite` nativo o `better-sqlite3`)
- **Suite de Pruebas:** Vitest

---

## Comandos de Desarrollo y Empaquetado

### 1. Abrir la App en Modo Desarrollo
Inicia el servidor Vite con recarga en caliente (HMR) y levanta la ventana de Electron automáticamente:
```bash
npm run dev
```

### 2. Generar el Ejecutable Portable (.exe) para Windows
Compila el frontend y el backend y empaqueta el binario standalone sin dependencias:
```bash
npm run dist:portable
```
- **¿Dónde queda el ejecutable?**
  El archivo `.exe` se genera dentro del directorio `release/` en la raíz del proyecto:
  ```text
  release/Itero Local 1.0.0.exe
  ```
  *(Nota: También puedes generar tanto el instalador NSIS como el portable ejecutando `npm run dist`).*

### 3. Ejecutar la Suite de Pruebas
```bash
npm test
```

---

## Primera Configuración (API Keys y Cuentas)

La aplicación es **100% local**: no tiene servidores intermedios y almacena todas tus credenciales y datos en una base de datos local SQLite cifrada con **AES-256-GCM**.

### 1. ¿Qué API Keys necesitas?
Para aprovechar todas las funcionalidades inteligentes de Itero Local necesitas dos claves gratuitas:

1. **Riot Games Developer API Key (Gratis):**
   - **Para qué sirve:** Descargar tu historial de partidas (Match-V5), estadísticas de ranked (League-V4), maestrías de campeones y verificar el estado de los servidores.
   - **Cómo obtenerla:** Inicia sesión con tu cuenta de Riot Games en [Riot Developer Portal](https://developer.riotgames.com/) y copia la *Development API Key*.
   - **Importante:** Las claves de desarrollo de Riot expiran cada **24 horas**. La aplicación monitorea el estado de la clave en tiempo real y te mostrará un aviso visual destacado si tu clave ha caducado.

2. **Google Gemini API Key (Gratis):**
   - **Para qué sirve:** Motor de inteligencia artificial para el análisis táctico en vivo de matchups (dificultad 1-10, plan de early game, amenazas de la composición enemiga), cálculo óptimo de árboles de runas y sugerencias de builds iniciales, core y situacionales.
   - **Cómo obtenerla:** Genera tu clave en el nivel gratuito de [Google AI Studio](https://aistudio.google.com/).
   - **Control de Cuota:** La app implementa un limitador Token Bucket local (15 peticiones/min y 1,500/día) con caché en SQLite para evitar agotar tu cuota.

### 2. ¿Dónde poner las Keys en la Aplicación?
1. Abre la aplicación con `npm run dev` (o ejecuta el `.exe`).
2. En la barra de navegación lateral izquierda, haz clic en **"Ajustes & Keys"** (icono de engranaje).
3. Introduce tu **Riot API Key** y tu **Gemini API Key** en sus respectivos campos.
4. Haz clic en **"Guardar Ajustes"**. Las claves se cifran inmediatamente en disco con una clave simétrica local de 32 bytes (`itero.key`).
5. En la misma pantalla o en la pestaña **"Mi Perfil"**, puedes ingresar tu **Riot ID** (`Nombre#Tag`) y tu región (por ejemplo `americas` / `la1`) y pulsar **"Sincronizar Cuenta"** para descargar tu historial y maestrías.

---

## Persistencia en SQLite y Reconstrucción Nativa

El proyecto soporta de forma transparente dos motores de persistencia síncrona en SQLite:

### 1. `node:sqlite` (Recomendado y por Defecto)
El módulo `node:sqlite` está integrado de forma nativa en Node.js 22.5+ y Electron 44+.
- No requiere compiladores externos ni dependencias C++.
- No requiere rebuild tras actualizar versiones de Electron.
- Usa la clase nativa `DatabaseSync`.

### 2. `better-sqlite3` (Alternativa con Addon C++)
Si se desea utilizar `better-sqlite3`:
1. Instalar la dependencia: `npm install better-sqlite3` y `@electron/rebuild` como devDependency.
2. Comando exacto para reconstruir el módulo nativo para Electron en Windows:
   ```bash
   npx @electron/rebuild -f -w better-sqlite3
   ```
   *(Nota: Requiere tener instalado Visual Studio con el componente "Desktop development with C++" para compilar mediante node-gyp).*

---

## Estructura del Repositorio y Documentación

- [`docs/SPEC.md`](docs/SPEC.md): Especificación funcional y reglas de Riot Games.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): Arquitectura, modelo de procesos y matriz de carpetas por agente.
- [`docs/CONTRACTS.md`](docs/CONTRACTS.md): Contratos de interfaces TypeScript, eventos, esquema de BD e IPC.
- [`docs/TASKS.md`](docs/TASKS.md): Plan maestro de tareas organizadas por fases.
- [`docs/PROMPT_OPENCODE.md`](docs/PROMPT_OPENCODE.md): Instrucciones completas para el agente implementador en Orca.
- [`docs/REQUESTS.md`](docs/REQUESTS.md): Canal formal de solicitudes de cambio de contrato (REQ-001 a REQ-009 resueltos).
- [`docs/PROGRESS.md`](docs/PROGRESS.md): Registro de progreso de tareas de Antigravity y OpenCode.

