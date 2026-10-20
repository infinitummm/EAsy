/**
 * Gestor y Orquestador de Proveedores de IA con conmutación por cuota (Frente 2, REQ-019).
 * Permite registrar múltiples proveedores (Gemini, Groq, Mistral, etc.), definir
 * el orden de preferencia y conmutar automáticamente al respaldo ante errores 429.
 * Propiedad exclusiva de ANTIGRAVITY.
 */

import { EventEmitter } from 'node:events';
import { AiProvider, AiGenerateOptions, GroundingResult, ProviderQuotaInfo } from './AiProvider';
import { registrarLog } from '../../lcu/LcuDetector';

export const EVENTOS_AI_PROVIDER_MANAGER = {
  CAMBIO_PROVEEDOR: 'cambio-proveedor',
  FALLO_CUOTA_429: 'fallo-cuota-429',
} as const;

export interface AiProviderManagerOptions {
  providers?: AiProvider[];
  preferredOrder?: string[];
}

export class AiProviderManager extends EventEmitter {
  private providers = new Map<string, AiProvider>();
  private order: string[] = [];

  constructor(options: AiProviderManagerOptions = {}) {
    super();
    if (options.providers) {
      for (const p of options.providers) {
        this.registerProvider(p);
      }
    }
    if (options.preferredOrder) {
      this.order = options.preferredOrder;
    }
  }

  public registerProvider(provider: AiProvider): void {
    this.providers.set(provider.id, provider);
    if (!this.order.includes(provider.id)) {
      this.order.push(provider.id);
    }
  }

  public setPreferredOrder(order: string[]): void {
    this.order = order.filter((id) => this.providers.has(id));
  }

  public getPreferredOrder(): string[] {
    return [...this.order];
  }

  public getProvider(id: string): AiProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Ejecuta generación de texto intentando en orden de preferencia y conmutando ante HTTP 429.
   */
  public async generateText(prompt: string, options: AiGenerateOptions = {}): Promise<string> {
    const providersToTry = this.getActiveProviders();
    let lastError: Error | null = null;

    for (let i = 0; i < providersToTry.length; i++) {
      const provider = providersToTry[i];
      try {
        return await provider.generateText(prompt, options);
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const isQuota = lastError.message.includes('429') || lastError.message.includes('RESOURCE_EXHAUSTED');

        if (isQuota) {
          registrarLog(`[AiProviderManager] Cuota 429 agotada en "${provider.name}".`);
          this.emit(EVENTOS_AI_PROVIDER_MANAGER.FALLO_CUOTA_429, { providerId: provider.id, error: lastError.message });

          const nextProvider = providersToTry[i + 1];
          if (nextProvider) {
            registrarLog(`[AiProviderManager] Conmutando automáticamente al proveedor de respaldo: "${nextProvider.name}".`);
            this.emit(EVENTOS_AI_PROVIDER_MANAGER.CAMBIO_PROVEEDOR, { previousId: provider.id, nextId: nextProvider.id });
            continue;
          }
        }
        throw lastError;
      }
    }

    throw lastError || new Error('No hay proveedores de IA disponibles');
  }

  /**
   * Ejecuta generación estructurada en JSON con respaldo automático ante 429.
   */
  public async generateStructured<T>(prompt: string, schema?: unknown, options: AiGenerateOptions = {}): Promise<T> {
    const providersToTry = this.getActiveProviders();
    let lastError: Error | null = null;

    for (let i = 0; i < providersToTry.length; i++) {
      const provider = providersToTry[i];
      try {
        return await provider.generateStructured<T>(prompt, schema, options);
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const isQuota = lastError.message.includes('429') || lastError.message.includes('RESOURCE_EXHAUSTED');

        if (isQuota) {
          registrarLog(`[AiProviderManager] Cuota 429 en salida estructurada con "${provider.name}".`);
          this.emit(EVENTOS_AI_PROVIDER_MANAGER.FALLO_CUOTA_429, { providerId: provider.id, error: lastError.message });

          const nextProvider = providersToTry[i + 1];
          if (nextProvider) {
            registrarLog(`[AiProviderManager] Conmutando a respaldo "${nextProvider.name}" para estructurado.`);
            this.emit(EVENTOS_AI_PROVIDER_MANAGER.CAMBIO_PROVEEDOR, { previousId: provider.id, nextId: nextProvider.id });
            continue;
          }
        }
        throw lastError;
      }
    }

    throw lastError || new Error('No hay proveedores de IA disponibles');
  }

  /**
   * Ejecuta investigación conectada a búsqueda web (Grounding) en el primer proveedor que lo soporte.
   */
  public async generateWithSearch(prompt: string, options: AiGenerateOptions = {}): Promise<GroundingResult> {
    const providersToTry = this.getActiveProviders();

    for (const provider of providersToTry) {
      if (typeof provider.generateWithSearch === 'function') {
        const result = await provider.generateWithSearch(prompt, options);
        if (result.groundingUsed) {
          return result;
        }
        if (result.httpStatus === 429) {
          registrarLog(`[AiProviderManager] Cuota de búsqueda 429 en "${provider.name}".`);
          this.emit(EVENTOS_AI_PROVIDER_MANAGER.FALLO_CUOTA_429, { providerId: provider.id, error: result.error });
        }
        return result; // Retorna el resultado honesto (con fallback activado)
      }
    }

    return {
      text: '',
      sources: [],
      groundingUsed: false,
      error: 'Ningún proveedor activo soporta búsqueda web en vivo'
    };
  }

  /**
   * Devuelve el resumen de métricas y cuotas de todos los proveedores registrados.
   */
  public getQuotaSummary(): ProviderQuotaInfo[] {
    const summary: ProviderQuotaInfo[] = [];
    for (const id of this.order) {
      const p = this.providers.get(id);
      if (p) {
        summary.push(p.getQuotaInfo());
      }
    }
    return summary;
  }

  private getActiveProviders(): AiProvider[] {
    const list: AiProvider[] = [];
    for (const id of this.order) {
      const p = this.providers.get(id);
      if (p) list.push(p);
    }
    return list.length > 0 ? list : Array.from(this.providers.values());
  }
}
