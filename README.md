# Itero Local - League of Legends Desktop Assistant

Asistente de escritorio local, monousuario y en tiempo real para League of Legends en Windows, inspirado en Itero.

## Stack Tecnológico
- **Shell de Escritorio:** Electron 44+ (Node.js 24+)
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS
- **Base de Datos:** SQLite local embebido (`node:sqlite` nativo o `better-sqlite3`)
- **Suite de Pruebas:** Vitest

---

## Comandos de Desarrollo

```bash
# Instalar dependencias
npm install

# Ejecutar suite de pruebas unitarias
npm test

# Modo desarrollo con recarga en vivo (HMR)
npm run dev

# Compilar para producción
npm run build
```

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
- [`docs/REQUESTS.md`](docs/REQUESTS.md): Canal formal de solicitudes de cambio de contrato.
- [`docs/PROGRESS.md`](docs/PROGRESS.md): Registro de progreso de tareas.
