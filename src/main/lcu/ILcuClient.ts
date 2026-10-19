/**
 * Reexportación del contrato público del cliente LCU.
 * La interfaz `ILcuClient` es propiedad de ANTIGRAVITY (`src/shared/contracts.ts`);
 * este archivo solo la expone desde el módulo `src/main/lcu/` tal como indica
 * `docs/CONTRACTS.md` (sección 3.1).
 */

export type { ILcuClient } from '@shared/contracts';
