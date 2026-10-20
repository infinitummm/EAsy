/**
 * Capa de Proveedores de IA Intercambiable (Frente 2, REQ-019).
 * Define el contrato unificado para interactuar con modelos de IA generativa,
 * permitiendo incorporar proveedores adicionales (Gemini, Groq, Mistral, etc.)
 * con conmutación transparente por cuota o fallo.
 * Propiedad exclusiva de ANTIGRAVITY.
 */

import { GroundingSource } from '../../../shared/types';

export interface AiGenerateOptions {
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  timeoutMs?: number;
}

export interface GroundingResult {
  text: string;
  sources: GroundingSource[];
  groundingUsed: boolean;
  httpStatus?: number;
  error?: string;
}

export interface ProviderQuotaInfo {
  providerId: string;
  providerName: string;
  standardCallsToday: number;
  searchCallsToday: number;
  dailyLimitStandard?: number;
  dailyLimitSearch?: number;
  lastError?: string;
  status: 'available' | 'quota_exceeded' | 'unavailable';
  note?: string;
}

export interface AiProvider {
  readonly id: string;
  readonly name: string;

  /** Verifica si el proveedor tiene credenciales válidas y conectividad activa. */
  isAvailable(): Promise<boolean>;

  /** Genera texto plano a partir de un prompt. */
  generateText(prompt: string, options?: AiGenerateOptions): Promise<string>;

  /** Genera una respuesta validada y parseada según un esquema JSON estructurado. */
  generateStructured<T>(prompt: string, schema?: unknown, options?: AiGenerateOptions): Promise<T>;

  /**
   * Si el proveedor lo soporta, realiza investigación conectada a búsqueda web (Grounding).
   * Opcional en la interfaz: no todos los proveedores ofrecen búsqueda web en vivo.
   */
  generateWithSearch?(prompt: string, options?: AiGenerateOptions): Promise<GroundingResult>;

  /** Devuelve el estado de consumo y métricas de cuota del proveedor. */
  getQuotaInfo(): ProviderQuotaInfo;
}
