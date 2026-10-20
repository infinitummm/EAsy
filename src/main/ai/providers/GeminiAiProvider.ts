/**
 * Implementación de AiProvider para Google Gemini API (Frente 2, REQ-019).
 * Soporta modelos de última generación (gemini-3.5-flash, gemini-3.1-flash-lite),
 * búsqueda web con Google Search Grounding y reporte transparente de cuotas.
 * Propiedad exclusiva de ANTIGRAVITY.
 */

import { AiProvider, AiGenerateOptions, GroundingResult, ProviderQuotaInfo } from './AiProvider';
import { GroundingSource } from '../../../shared/types';
import { registrarLog } from '../../lcu/LcuDetector';

export interface GeminiAiProviderOptions {
  apiKey?: string;
  model?: string;
  fallbackModel?: string;
  baseUrl?: string;
  maxRetries?: number;
  initialBackoffMs?: number;
  requestTimeoutMs?: number;
}

export class GeminiAiProvider implements AiProvider {
  readonly id = 'gemini';
  readonly name = 'Google Gemini (AI Studio)';

  private apiKey: string;
  private model: string;
  private fallbackModel: string;
  private baseUrl: string;
  private maxRetries: number;
  private initialBackoffMs: number;
  private requestTimeoutMs: number;

  private standardCallsToday = 0;
  private searchCallsToday = 0;
  private lastError = '';
  private lastRequestTime = 0;
  private minIntervalMs = 2500;

  constructor(options: GeminiAiProviderOptions = {}) {
    this.apiKey = (options.apiKey || '').trim();
    this.model = options.model || 'gemini-3.5-flash';
    this.fallbackModel = options.fallbackModel || 'gemini-3.1-flash-lite';
    this.baseUrl = options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    this.maxRetries = options.maxRetries ?? 2;
    this.initialBackoffMs = options.initialBackoffMs ?? 1500;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 25000;
  }

  public setApiKey(key: string): void {
    this.apiKey = key.trim();
  }

  public setModel(model: string): void {
    this.model = model;
  }

  public getModel(): string {
    return this.model;
  }

  public async isAvailable(): Promise<boolean> {
    if (!this.apiKey || this.apiKey.length < 10) return false;
    try {
      const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Ping' }] }],
          generationConfig: { maxOutputTokens: 2 }
        })
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  public async generateText(prompt: string, options: AiGenerateOptions = {}): Promise<string> {
    const raw = await this.executeWithRetry(this.model, prompt, options);
    this.standardCallsToday++;
    return raw;
  }

  public async generateStructured<T>(prompt: string, _schema?: unknown, options: AiGenerateOptions = {}): Promise<T> {
    const jsonOptions: AiGenerateOptions = {
      ...options,
      responseMimeType: 'application/json',
      temperature: options.temperature ?? 0.2
    };
    const raw = await this.executeWithRetry(this.model, prompt, jsonOptions);
    this.standardCallsToday++;
    return this.cleanAndParseJson(raw) as T;
  }

  public async generateWithSearch(prompt: string, options: AiGenerateOptions = {}): Promise<GroundingResult> {
    await this.respectRateLimit();

    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? this.requestTimeoutMs);

    const payload = {
      systemInstruction: options.systemInstruction
        ? { parts: [{ text: options.systemInstruction }] }
        : undefined,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxOutputTokens ?? 1500
      }
    };

    try {
      registrarLog(`[GeminiAiProvider] Solicitando búsqueda web con Google Search Grounding en ${this.model}...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const status = response.status;

      if (response.ok) {
        const json = (await response.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
            groundingMetadata?: {
              groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
            };
          }>;
        };

        const candidate = json?.candidates?.[0];
        const rawText = candidate?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n') || '';
        const groundingMetadata = candidate?.groundingMetadata;
        const sources: GroundingSource[] = [];

        if (groundingMetadata?.groundingChunks) {
          for (const chunk of groundingMetadata.groundingChunks) {
            if (chunk.web?.uri) {
              sources.push({
                title: chunk.web.title || chunk.web.uri,
                uri: chunk.web.uri
              });
            }
          }
        }

        this.searchCallsToday++;
        registrarLog(`[GeminiAiProvider] Grounding completado exitosamente. ${sources.length} fuentes encontradas.`);
        return { text: rawText, sources, groundingUsed: true, httpStatus: status };
      }

      const errorText = await response.text();
      this.lastError = `HTTP ${status}: ${errorText.substring(0, 150)}`;
      registrarLog(`[GeminiAiProvider Grounding ERROR] ${this.lastError}`);
      return { text: '', sources: [], groundingUsed: false, httpStatus: status, error: this.lastError };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = `Error de red: ${msg}`;
      registrarLog(`[GeminiAiProvider Grounding NETWORK ERROR]: ${msg}`);
      return { text: '', sources: [], groundingUsed: false, httpStatus: 0, error: msg };
    }
  }

  public getQuotaInfo(): ProviderQuotaInfo {
    const isExceeded = this.lastError.includes('429') || this.lastError.includes('RESOURCE_EXHAUSTED');
    return {
      providerId: this.id,
      providerName: this.name,
      standardCallsToday: this.standardCallsToday,
      searchCallsToday: this.searchCallsToday,
      dailyLimitStandard: 1500,
      dailyLimitSearch: 0, // 0 en free tier sin facturación en Google AI Studio
      lastError: this.lastError || undefined,
      status: isExceeded ? 'quota_exceeded' : (this.apiKey ? 'available' : 'unavailable'),
      note: 'Free tier sin tarjeta: cuota 0 para búsqueda web (HTTP 429). Al vincular facturación se otorgan 5,000 búsquedas/mes gratis. Generación estándar: 15 RPM / 1,500 peticiones/día sin costo.'
    };
  }

  private async executeWithRetry(
    modelName: string,
    prompt: string,
    options: AiGenerateOptions
  ): Promise<string> {
    const modelsToTry = [modelName];
    if (this.fallbackModel && this.fallbackModel !== modelName) {
      modelsToTry.push(this.fallbackModel);
    }

    let lastError = '';

    for (const m of modelsToTry) {
      let attempt = 0;
      let delay = this.initialBackoffMs;

      while (attempt <= this.maxRetries) {
        await this.respectRateLimit();

        const url = `${this.baseUrl}/models/${m}:generateContent?key=${this.apiKey}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? this.requestTimeoutMs);

        const payload = {
          systemInstruction: options.systemInstruction
            ? { parts: [{ text: options.systemInstruction }] }
            : undefined,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: options.temperature ?? 0.2,
            maxOutputTokens: options.maxOutputTokens,
            responseMimeType: options.responseMimeType
          }
        };

        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
          });

          clearTimeout(timeoutId);
          const status = response.status;

          if (response.ok) {
            const json = (await response.json()) as {
              candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            };
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text !== undefined) {
              return text;
            }
          }

          const errorBody = await response.text();
          lastError = `HTTP ${status}: ${errorBody.substring(0, 200)}`;
          this.lastError = lastError;

          if (status === 429 || (status >= 500 && status < 600)) {
            attempt++;
            if (attempt > this.maxRetries) break;
            const jitter = delay * (0.8 + Math.random() * 0.4);
            await this.sleep(jitter);
            delay *= 2;
            continue;
          }

          // Error no recuperable, probar siguiente modelo
          break;
        } catch (err: unknown) {
          clearTimeout(timeoutId);
          const msg = err instanceof Error ? err.message : String(err);
          lastError = `Error de red en ${m}: ${msg}`;
          this.lastError = lastError;
          attempt++;
          if (attempt > this.maxRetries) break;
          await this.sleep(delay);
          delay *= 2;
        }
      }
    }

    throw new Error(`[GeminiAiProvider] Fallo en la generación tras reintentos: ${lastError}`);
  }

  private cleanAndParseJson(raw: string): unknown {
    let clean = raw.trim();
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    return JSON.parse(clean);
  }

  private async respectRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      await this.sleep(this.minIntervalMs - elapsed);
    }
    this.lastRequestTime = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
