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

  Notas de implementación:
  1. `ready-check` solo se emite con payload válido (nunca `null`); el fin del ciclo se entrega al servicio interno de Auto-Accept. Si la UI necesita reflejar el fin del ReadyCheck, Antigravity puede solicitar la emisión de `null`.
  2. El constructor de `LcuClient` acepta `OpcionesLcuClient` (ruta fija de lockfile, protocolos, intervalos). En producción no se pasa nada: usa `ITERO_LCU_LOCKFILE` (variable de entorno) o las rutas candidatas por defecto.
- **Estado:** APROBADO
- **Respuesta de Antigravity:** Aprobado en su totalidad. Los nombres de eventos definidos en `EVENTOS_LCU_CLIENT` han sido integrados con el enrutador IPC (`src/main/ipc/lcuIpc.ts`) y se añadieron como tipos oficiales en `src/shared/events.ts`. Proceder a Fase 3 una vez completada la integración de UI.

---

### [REQ-002] Motor SQLite: `node:sqlite` en lugar de `better-sqlite3` (T-3.2)
- **Fecha:** 2026-10-19
- **Tarea asociada:** T-3.2
- **Módulo afectado:** `src/main/db/DatabaseService.ts`
- **Problema encontrado:** Existe una inconsistencia entre documentos: `docs/TASKS.md` (T-3.2) menciona `better-sqlite3`, mientras que `docs/ARCHITECTURE.md` §1.3 recomienda `node:sqlite` (`DatabaseSync`) como opción por defecto y `docs/CONTRACTS.md` §2 dice `better-sqlite3`. `better-sqlite3` no está en `package.json` y requeriría compilar un addon nativo para la ABI de Electron (Visual Studio Build Tools), con riesgo de fricción en el empaquetado. Además, `vite.config.ts` ya declara `node:sqlite` como external del build principal, lo que sugiere que el proyecto ya lo contemplaba.
- **Propuesta de solución:** Implementar `DatabaseService` sobre `node:sqlite` (`DatabaseSync`, disponible sin flags en Node 22.5+/Electron 44), usando la misma API conceptual que `better-sqlite3` (`exec`/`prepare`/`run`/`get`/`all`) y el esquema exacto de `CONTRACTS.md` §2. Solicitamos aprobar esta elección y actualizar la mención de `better-sqlite3` en la documentación de T-3.2 (el resto de contratos queda intacto).
- **Estado:** PENDIENTE
- **Respuesta de Antigravity:** (Pendiente)

---

### [REQ-003] Representación de `perks_json` en `match_participants` (T-3.2)
- **Fecha:** 2026-10-19
- **Tarea asociada:** T-3.2 (afecta a T-3.5 y T-6.1)
- **Módulo afectado:** `src/main/db/DatabaseService.ts`
- **Problema encontrado:** El esquema de `CONTRACTS.md` §2 define `perks_json` como "Array JSON de perks", pero `ParsedMatchSummary` (contrato público) expone `primaryStyleId`, `subStyleId` y `selectedPerks`. Un array plano no permitiría reconstruir los IDs de los árboles de runas al leer desde SQLite.
- **Propuesta de solución:** Almacenar un objeto JSON `{ primaryStyleId: number, subStyleId: number, selectedPerks: number[] }` en `perks_json` (sin cambiar el esquema ni el contrato). La lectura tolera además el formato legado de array plano (lo interpreta como `selectedPerks` con estilos en 0) para compatibilidad futura. No se requiere cambio en `src/shared/`.
- **Estado:** PENDIENTE
- **Respuesta de Antigravity:** (Pendiente)

