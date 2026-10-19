/**
 * Servicio de Inteligencia Artificial utilizando Google Gemini API.
 * Implementa cola de peticiones, caché local, reintentos con backoff exponencial y salida tipada.
 * Propiedad exclusiva de ANTIGRAVITY.
 */

import { GeminiMatchupRecommendation, Role } from '../../shared/types';
import { IDatabaseService } from '../../shared/contracts';
import { buildMatchupPrompt, validateGeminiMatchupResponse } from './prompts';

export interface GeminiServiceOptions {
  apiKey?: string;
  model?: string;
  dbService?: IDatabaseService;
  baseUrl?: string;
  maxRetries?: number;
  initialBackoffMs?: number;
  requestTimeoutMs?: number;
}

export class GeminiService {
  private apiKey: string;
  private model: string;
  private dbService?: IDatabaseService;
  private baseUrl: string;
  private maxRetries: number;
  private initialBackoffMs: number;
  private requestTimeoutMs: number;

  // Caché en memoria para uso cuando SQLite aún no esté disponible o como L1
  private memoryCache = new Map<string, { data: GeminiMatchupRecommendation; expiresAt: number }>();

  // Cola y limitación de tasa simple para free-tier (15 RPM -> 1 request cada 4000ms mínimo)
  private lastRequestTime = 0;
  private minIntervalMs = 4000;

  constructor(options: GeminiServiceOptions = {}) {
    this.apiKey = options.apiKey || '';
    this.model = options.model || 'gemini-1.5-flash';
    this.dbService = options.dbService;
    this.baseUrl = options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    this.maxRetries = options.maxRetries ?? 3;
    this.initialBackoffMs = options.initialBackoffMs ?? 1500;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15000;
  }

  public setApiKey(key: string): void {
    this.apiKey = key.trim();
  }

  public setDatabaseService(db: IDatabaseService): void {
    this.dbService = db;
  }

  public getModel(): string {
    return this.model;
  }

  public setModel(model: string): void {
    this.model = model;
  }

  /**
   * Genera la clave única de caché para un enfrentamiento en un parche específico.
   */
  public generateCacheKey(championId: number, opponentId: number, role: Role, patch: string): string {
    // Normalizar parche (ej: "14.20.1" -> "14.20")
    const patchParts = patch.split('.');
    const shortPatch = patchParts.length >= 2 ? `${patchParts[0]}.${patchParts[1]}` : patch;
    return `matchup:${championId}:${opponentId}:${role}:${shortPatch}`;
  }

  /**
   * Obtiene la recomendación táctica para un enfrentamiento, consultando primero la caché.
   */
  public async getMatchupAdvice(params: {
    championId: number;
    championName?: string;
    opponentId: number;
    opponentName?: string;
    role: Role;
    patch: string;
    allies?: number[];
    enemies?: number[];
  }): Promise<GeminiMatchupRecommendation> {
    const cacheKey = this.generateCacheKey(params.championId, params.opponentId, params.role, params.patch);

    // 1. Consultar caché L1 en memoria
    const memEntry = this.memoryCache.get(cacheKey);
    if (memEntry && memEntry.expiresAt > Date.now()) {
      return memEntry.data;
    }

    // 2. Consultar base de datos SQLite (si está disponible)
    if (this.dbService) {
      try {
        const cached = this.dbService.getMatchupCache(cacheKey);
        if (cached) {
          this.memoryCache.set(cacheKey, { data: cached, expiresAt: Date.now() + 86400 * 1000 });
          return cached;
        }
      } catch (err) {
        // Continuar si la BD no responde
      }
    }

    // 3. Si no hay clave de API configurada, retornar recomendación por defecto / de contingencia
    if (!this.apiKey) {
      return this.createFallbackRecommendation(params);
    }

    // 4. Invocar la API de Gemini con control de tasa y reintentos
    const recommendation = await this.callGeminiWithRetry(params);

    // 5. Almacenar en caché (duración 7 días por parche)
    const ttlSeconds = 7 * 24 * 3600;
    this.memoryCache.set(cacheKey, { data: recommendation, expiresAt: Date.now() + ttlSeconds * 1000 });

    if (this.dbService) {
      try {
        this.dbService.setMatchupCache(cacheKey, recommendation, ttlSeconds);
        this.dbService.recordApiCall('GEMINI', `/models/${this.model}:generateContent`, 200);
      } catch (err) {
        // Silenciar error de persistencia
      }
    }

    return recommendation;
  }

  /**
   * Verifica la validez de una API key de Gemini realizando una consulta mínima.
   */
  public async testApiKey(key: string): Promise<boolean> {
    if (!key || key.trim().length < 10) return false;
    try {
      const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${key.trim()}`;
      const payload = {
        contents: [{ parts: [{ text: 'Responde OK' }] }],
        generationConfig: { maxOutputTokens: 5 }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      return res.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Ejecuta la llamada REST con backoff exponencial y limitación de tasa.
   */
  private async callGeminiWithRetry(params: {
    championId: number;
    championName?: string;
    opponentId: number;
    opponentName?: string;
    role: Role;
    patch: string;
    allies?: number[];
    enemies?: number[];
  }): Promise<GeminiMatchupRecommendation> {
    const { systemInstruction, userPrompt } = buildMatchupPrompt(params);

    const payload = {
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        topK: 40,
        topP: 0.95,
        responseMimeType: 'application/json'
      }
    };

    let attempt = 0;
    let delay = this.initialBackoffMs;

    while (attempt <= this.maxRetries) {
      try {
        // Respetar intervalo mínimo para evitar 429
        await this.respectRateLimit();

        const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const json = await response.json() as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          };

          const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!rawText) {
            throw new Error('Gemini respondió sin candidatos de texto válidos.');
          }

          const parsed = this.cleanAndParseJson(rawText);
          if (validateGeminiMatchupResponse(parsed)) {
            return parsed as GeminiMatchupRecommendation;
          } else {
            throw new Error('El JSON devuelto por Gemini no cumple el contrato de GeminiMatchupRecommendation.');
          }
        }

        // Manejo de errores HTTP
        const statusCode = response.status;
        if (this.dbService) {
          try {
            this.dbService.recordApiCall('GEMINI', `/models/${this.model}:generateContent`, statusCode);
          } catch {}
        }

        // Si es 429 (Rate Limit) o 5xx (Server Error), reintentar con backoff
        if (statusCode === 429 || (statusCode >= 500 && statusCode < 600)) {
          attempt++;
          if (attempt > this.maxRetries) {
            break;
          }
          // Backoff exponencial con jitter aleatorio (±20%)
          const jitter = delay * (0.8 + Math.random() * 0.4);
          await this.sleep(jitter);
          delay *= 2;
          continue;
        }

        // Errores no reintentables (ej. 400 Bad Request, 403 Forbidden)
        const errorText = await response.text();
        throw new Error(`Error en llamada a Gemini (${statusCode}): ${errorText}`);

      } catch (err: unknown) {
        attempt++;
        if (attempt > this.maxRetries) {
          // Último recurso ante fallo continuo: fallback
          return this.createFallbackRecommendation(params);
        }
        await this.sleep(delay);
        delay *= 2;
      }
    }

    return this.createFallbackRecommendation(params);
  }

  /**
   * Limpia posibles marcas de markdown y parsea JSON.
   */
  private cleanAndParseJson(raw: string): unknown {
    let clean = raw.trim();
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    return JSON.parse(clean);
  }

  /**
   * Garantiza un tiempo mínimo entre llamadas consecutivas a Gemini.
   */
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

  /**
   * Crea una recomendación estructurada básica de contingencia en caso de que no haya key o no haya red.
   */
  public createFallbackRecommendation(params: {
    championId: number;
    opponentId: number;
    role: Role;
    patch: string;
  }): GeminiMatchupRecommendation {
    // Si es Ashe (ID 22) o un tirador
    if (params.championId === 22) {
      return {
        championId: params.championId,
        opponentChampionId: params.opponentId,
        assignedRole: params.role,
        patchVersion: params.patch,
        difficultyRating: 5,
        matchupSummary: 'Matchup de rango y control de distancia. Utiliza la W para desgastar a tu rival y aprovecha tu ventaja de rango con ataques básicos continuos.',
        runesRecommendation: {
          primaryStyleId: 8000, // Precisión
          subStyleId: 8300,     // Inspiración
          // PtA (8005), Claridad mental (9101), Linaje (9103), Golpe de gracia (8014), Calzado mágico (8304), Velocidad de aproximación (8410), Vel. Ataque (5005), Fuerza Adaptable (5008), Vida Plana (5011)
          selectedPerkIds: [8005, 9101, 9103, 8014, 8304, 8410, 5005, 5008, 5011],
          rationale: 'Presión con Ataque para intercambios rápidos con la Q activa y Velocidad de Aproximación para perseguir con la ralentización pasiva.'
        },
        buildRecommendation: {
          startingItems: [1055, 2003], // Espada de Doran + Poción
          coreItems: [6672, 3085, 3031], // Matakrakens + Huracán de Runaan + Filo Infinito
          situationalItems: [
            { itemId: 3026, condition: 'Ángel Guardián frente a iniciaciones y asesinos físicos' },
            { itemId: 3036, condition: 'Recuerdos de Lord Dominik frente a composiciones de tanques' },
            { itemId: 3139, condition: 'Cimitarra Mercurial para limpiar aturdimientos y CC fuerte' }
          ],
          rationale: 'Build óptima de velocidad de ataque y daño crítico continuo con efectos de impacto.'
        },
        skillOrder: {
          priority: ['W', 'Q', 'E', 'R'],
          firstThreeLevels: ['W', 'Q', 'W'],
          rationale: 'Maximiza la W para control de oleadas y rango de hostigamiento seguro.'
        },
        earlyGameStrategy: {
          waveManagement: 'Empuja lentamente para conseguir la ventaja de nivel 2 y mantén la presión sin sobreextenderte.',
          tradingPlan: 'Lanza la W y asesta 2 ataques básicos antes de retroceder.',
          levelSpikes: ['Nivel 2 con W + Q', 'Nivel 6 para iniciar con la Flecha de Cristal Encantada']
        },
        threatAnalysis: {
          enemyThreats: ['Cuidado con el burst enemigo si se acorta la distancia o tras quedar bajo efectos de control.'],
          winCondition: 'Mantener espaciado perfecto en peleas grupales y habilitar cazadas con la R.'
        }
      };
    }

    // Configuración balanceada por defecto con stat shards 100% legales de Season 14
    return {
      championId: params.championId,
      opponentChampionId: params.opponentId,
      assignedRole: params.role,
      patchVersion: params.patch,
      difficultyRating: 5,
      matchupSummary: 'Recomendación base estándar del parche. Configura tu Gemini API Key en Ajustes para análisis táctico avanzado en tiempo real con IA.',
      runesRecommendation: {
        primaryStyleId: 8000, // Precisión
        subStyleId: 8400,     // Valor
        // Stat shards legales S14: 5008 (Adaptive), 5008 (Adaptive), 5011 (Vida plana +65 HP)
        selectedPerkIds: [8005, 9111, 9104, 8014, 8446, 8451, 5008, 5008, 5011],
        rationale: 'Página balanceada de ataque continuado y mitigación en línea.'
      },
      buildRecommendation: {
        startingItems: [1055, 2003], // Espada de Doran + Poción
        coreItems: [3078, 3053, 3156],
        situationalItems: [
          { itemId: 3026, condition: 'Frente a daño explosivo físico o iniciaciones enemigas' },
          { itemId: 3157, condition: 'Frente a campeones con burst mágico' }
        ],
        rationale: 'Build estándar equilibrada de daño sostenido y resistencia.'
      },
      skillOrder: {
        priority: ['Q', 'E', 'W', 'R'],
        firstThreeLevels: ['Q', 'E', 'W'],
        rationale: 'Orden convencional de maximización de daño principal.'
      },
      earlyGameStrategy: {
        waveManagement: 'Mantén la oleada equilibrada o cerca de tu torre en los primeros 3 niveles.',
        tradingPlan: 'Busca intercambios cortos cuando el rival gaste sus enfriamientos principales.',
        levelSpikes: ['Nivel 2 con ventaja de súbditos', 'Nivel 6 para ejecutar combo completo']
      },
      threatAnalysis: {
        enemyThreats: ['Cuidado con ganks del jungla rival en el minuto 3:30.'],
        winCondition: 'Farmear de forma consistente, asegurar el primer dragón y ganar peleas por objetivos.'
      }
    };
  }
}
