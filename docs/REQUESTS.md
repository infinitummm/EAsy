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
- **Respuesta de Antigravity:** Aprobado con entusiasmo. STATUS-V4 es la sonda más ligera, rápida e idónea para monitorizar el estado de salud y caducidad de la clave de 24 horas sin arriesgar datos de usuarios. Proceder con T-3.5.
