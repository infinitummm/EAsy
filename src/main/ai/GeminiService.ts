/**
 * Servicio de Inteligencia Artificial utilizando Google Gemini API.
 * Implementa cola de peticiones, validación con Data Dragon, reintentos con backoff exponencial,
 * reintento correctivo ante fallos de validación y soporte de forzado de refresco.
 * Propiedad exclusiva de ANTIGRAVITY.
 */

import { GeminiMatchupRecommendation, Role } from '../../shared/types';
import { IDatabaseService } from '../../shared/contracts';
import {
  buildMatchupPrompt,
  buildCorrectionPrompt,
  validateGeminiMatchupResponse,
  buildDraftRecommendationPrompt,
  validateGeminiDraftResponse,
} from './prompts';
import { getAccurateFallbackRecommendation } from '../../shared/buildDatabase';
import { DataDragonTranslator, RawGeminiRecommendation } from '../riot/DataDragonTranslator';
import { registrarLog } from '../lcu/LcuDetector';
import { ALL_CHAMPIONS, getChampionName, getChampionById } from '../../shared/champions';

export interface GeminiServiceOptions {
  apiKey?: string;
  model?: string;
  fallbackModel?: string;
  dbService?: IDatabaseService;
  translator?: DataDragonTranslator;
  baseUrl?: string;
  maxRetries?: number;
  initialBackoffMs?: number;
  requestTimeoutMs?: number;
}

export class GeminiService {
  private apiKey: string;
  private model: string;
  private fallbackModel: string;
  private dbService?: IDatabaseService;
  private translator?: DataDragonTranslator;
  private baseUrl: string;
  private maxRetries: number;
  private initialBackoffMs: number;
  private requestTimeoutMs: number;

  // Caché en memoria L1
  private memoryCache = new Map<string, { data: GeminiMatchupRecommendation; expiresAt: number }>();

  // Limitación de tasa simple para free-tier
  private lastRequestTime = 0;
  private minIntervalMs = 2500;

  constructor(options: GeminiServiceOptions = {}) {
    this.apiKey = options.apiKey || '';
    this.model = options.model || 'gemini-3.5-flash';
    this.fallbackModel = options.fallbackModel || 'gemini-3.1-flash-lite';
    this.dbService = options.dbService;
    this.translator = options.translator;
    this.baseUrl = options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    this.maxRetries = options.maxRetries ?? 2;
    this.initialBackoffMs = options.initialBackoffMs ?? 1500;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 25000;
  }

  public setApiKey(key: string): void {
    this.apiKey = key.trim();
  }

  public setDatabaseService(db: IDatabaseService): void {
    this.dbService = db;
  }

  public setTranslator(translator: DataDragonTranslator): void {
    this.translator = translator;
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
    const patchParts = patch.split('.');
    const shortPatch = patchParts.length >= 2 ? `${patchParts[0]}.${patchParts[1]}` : patch;
    return `matchup:${championId}:${opponentId}:${role}:${shortPatch}`;
  }

  /**
   * Obtiene la recomendación táctica para un enfrentamiento.
   * Si forceRefresh es true, se ignora completamente la caché y se consulta a Gemini.
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
    forceRefresh?: boolean;
  }): Promise<GeminiMatchupRecommendation> {
    const cacheKey = this.generateCacheKey(params.championId, params.opponentId, params.role, params.patch);

    if (!params.forceRefresh) {
      // 1. Consultar caché L1 en memoria
      const memEntry = this.memoryCache.get(cacheKey);
      if (memEntry && memEntry.expiresAt > Date.now()) {
        registrarLog(`[GeminiService] Matchup ${cacheKey} obtenido de caché en memoria L1.`);
        return memEntry.data;
      }

      // 2. Consultar base de datos SQLite
      if (this.dbService) {
        try {
          const cached = this.dbService.getMatchupCache(cacheKey);
          if (cached) {
            // Asegurar que nunca devolvemos un fallback guardado previamente por error
            if (cached.source !== 'fallback') {
              this.memoryCache.set(cacheKey, { data: cached, expiresAt: Date.now() + 86400 * 1000 });
              registrarLog(`[GeminiService] Matchup ${cacheKey} obtenido de SQLite.`);
              return cached;
            }
          }
        } catch {
          // Continuar si la BD falla
        }
      }
    } else {
      registrarLog(`[GeminiService] Forzado de refresco solicitado para ${cacheKey}. Ignorando caché.`);
      this.memoryCache.delete(cacheKey);
    }

    // 3. Si no hay clave de API configurada, retornar recomendación de contingencia sin cachear
    if (!this.apiKey) {
      registrarLog(`[GeminiService] Sin API Key configurada. Devolviendo recomendación de contingencia.`);
      return this.createFallbackRecommendation(params, 'Sin Gemini API Key configurada. Configúrala en Ajustes.');
    }

    // 4. Invocar Gemini con traducción y validación de Data Dragon
    try {
      const recommendation = await this.callGeminiWithRetry(params);

      // 5. Almacenar en caché SOLO si es una recomendación válida de IA (TTL: 24 horas = 86400 s)
      if (recommendation.source === 'gemini') {
        const ttlSeconds = 86400;
        this.memoryCache.set(cacheKey, { data: recommendation, expiresAt: Date.now() + ttlSeconds * 1000 });

        if (this.dbService) {
          try {
            this.dbService.setMatchupCache(cacheKey, recommendation, ttlSeconds);
            this.dbService.recordApiCall('GEMINI', `/models/${recommendation.modelUsed || this.model}:generateContent`, 200);
            registrarLog(`[GeminiService] Matchup ${cacheKey} generado con éxito y cacheado por 24h.`);
          } catch (err) {
            registrarLog(`[GeminiService] Error persistiendo en SQLite: ${err}`);
          }
        }
      }

      return recommendation;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      registrarLog(`[GeminiService ERROR] Fallo generando recomendación con Gemini: ${errMsg}`);
      return this.createFallbackRecommendation(params, `Error en Gemini API: ${errMsg}`);
    }
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
   * Realiza la llamada HTTP a Gemini con el modelo especificado.
   */
  private async executeGeminiRequest(
    modelName: string,
    systemInstruction: string,
    userPrompt: string
  ): Promise<{ status: number; text?: string; error?: string }> {
    await this.respectRateLimit();

    const url = `${this.baseUrl}/models/${modelName}:generateContent?key=${this.apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

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

    try {
      registrarLog(`[GeminiService] Llamando a ${modelName}. Tamaño de prompt: ${userPrompt.length} chars...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const status = response.status;

      if (response.ok) {
        const json = await response.json() as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        registrarLog(`[GeminiService] Respuesta exitosa de ${modelName} (HTTP ${status}).`);
        return { status, text: rawText };
      }

      const errorText = await response.text();
      registrarLog(`[GeminiService HTTP ERROR] ${modelName} devolvió ${status}: ${errorText.substring(0, 200)}`);
      return { status, error: errorText };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const msg = err instanceof Error ? err.message : String(err);
      registrarLog(`[GeminiService NETWORK ERROR] en ${modelName}: ${msg}`);
      return { status: 0, error: msg };
    }
  }

  /**
   * Ejecuta la llamada REST con backoff exponencial, fallback de modelo y validación Data Dragon.
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

    // Lista de modelos a probar: modelo principal (ej: gemini-3.5-flash), luego fallback (gemini-3.1-flash-lite)
    const modelsToTry = [this.model];
    if (this.fallbackModel && this.fallbackModel !== this.model) {
      modelsToTry.push(this.fallbackModel);
    }

    let lastError = '';

    for (const modelToUse of modelsToTry) {
      let attempt = 0;
      let delay = this.initialBackoffMs;

      while (attempt <= this.maxRetries) {
        const reqResult = await this.executeGeminiRequest(modelToUse, systemInstruction, userPrompt);

        if (reqResult.text) {
          let parsed: unknown;
          try {
            parsed = this.cleanAndParseJson(reqResult.text);
          } catch (parseErr) {
            lastError = `JSON inválido devuelto por ${modelToUse}`;
            attempt++;
            continue;
          }

          // Si disponemos de DataDragonTranslator, traducir y validar nombres a IDs oficiales
          if (this.translator) {
            try {
              await this.translator.initialize(params.patch);
              const validRes = this.translator.translateAndValidate(parsed as RawGeminiRecommendation);

              if (validRes.valid && validRes.recommendation) {
                const rec = validRes.recommendation;
                rec.source = 'gemini';
                rec.modelUsed = modelToUse;
                rec.generatedAt = new Date().toISOString();
                rec.debugInfo = {
                  rawPrompt: userPrompt,
                  rawResponse: reqResult.text,
                  validationStatus: 'Validado con Data Dragon exitosamente',
                  resolvedRunes: validRes.resolvedRunes,
                  resolvedItems: validRes.resolvedItems
                };
                return rec;
              }

              // Si falló la validación inicial, realizar un ÚNICO reintento correctivo con prompt enfocado
              registrarLog(`[GeminiService] Validación Data Dragon falló: ${validRes.error}. Ejecutando reintento correctivo...`);
              const correction = buildCorrectionPrompt({
                originalPrompt: userPrompt,
                rawResponseText: reqResult.text,
                validationError: validRes.error || 'Nombres de runas u objetos no reconocidos'
              });

              const retryResult = await this.executeGeminiRequest(modelToUse, correction.systemInstruction, correction.userPrompt);
              if (retryResult.text) {
                try {
                  const retryParsed = this.cleanAndParseJson(retryResult.text);
                  const retryValid = this.translator.translateAndValidate(retryParsed as RawGeminiRecommendation);
                  if (retryValid.valid && retryValid.recommendation) {
                    const rec = retryValid.recommendation;
                    rec.source = 'gemini';
                    rec.modelUsed = modelToUse;
                    rec.generatedAt = new Date().toISOString();
                    rec.debugInfo = {
                      rawPrompt: correction.userPrompt,
                      rawResponse: retryResult.text,
                      validationStatus: 'Corregido y validado tras reintento',
                      resolvedRunes: retryValid.resolvedRunes,
                      resolvedItems: retryValid.resolvedItems
                    };
                    registrarLog(`[GeminiService] Reintento correctivo exitoso con ${modelToUse}.`);
                    return rec;
                  }
                } catch {}
              }
            } catch (translErr) {
              registrarLog(`[GeminiService] Error en traductor: ${translErr}`);
            }
          }

          // Si no hay traductor pero pasa la validación directa
          if (validateGeminiMatchupResponse(parsed)) {
            const rec = parsed as GeminiMatchupRecommendation;
            rec.source = 'gemini';
            rec.modelUsed = modelToUse;
            rec.generatedAt = new Date().toISOString();
            rec.debugInfo = {
              rawPrompt: userPrompt,
              rawResponse: reqResult.text,
              validationStatus: 'Validación estructural directa aprobada'
            };
            return rec;
          }
        }

        // Manejo de errores de cuota o servidor (429, 500, 503)
        if (reqResult.status === 429 || (reqResult.status >= 500 && reqResult.status < 600)) {
          attempt++;
          if (attempt > this.maxRetries) break;
          const jitter = delay * (0.8 + Math.random() * 0.4);
          await this.sleep(jitter);
          delay *= 2;
          continue;
        }

        // Si es 404 (modelo no disponible) u otro error no recuperable, saltar al siguiente modelo
        lastError = reqResult.error || `HTTP ${reqResult.status}`;
        break;
      }
    }

    // Si fallaron todos los modelos y reintentos, generar recomendación honesta de contingencia
    registrarLog(`[GeminiService] Todos los intentos de IA fallaron. Motivo: ${lastError}`);
    return this.createFallbackRecommendation(params, `Fallo en IA: ${lastError || 'Modelo no disponible'}`);
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
   * Crea una recomendación estructurada de contingencia claramente identificada.
   * NUNCA se debe persistir en la base de datos de caché.
   */
  public createFallbackRecommendation(
    params: {
      championId: number;
      opponentId: number;
      role: Role;
      patch: string;
    },
    reason: string = 'Recomendación base estándar del parche.'
  ): GeminiMatchupRecommendation {
    const fallback = getAccurateFallbackRecommendation(params);
    return {
      ...fallback,
      source: 'fallback',
      fallbackReason: reason,
      generatedAt: new Date().toISOString(),
      debugInfo: {
        validationStatus: `Fallback activo: ${reason}`
      }
    };
  }

  /**
   * Genera recomendaciones de picks en vivo para el draft de selección de campeón.
   */
  public async getDraftRecommendations(params: {
    role: Role;
    patch: string;
    allies: number[];
    enemies: number[];
    bans: number[];
    pickableChampionIds?: number[];
    forceRefresh?: boolean;
  }): Promise<any> {
    const pickableIds = params.pickableChampionIds && params.pickableChampionIds.length > 0
      ? params.pickableChampionIds
      : ALL_CHAMPIONS.map(c => c.id);

    // Mapear aliados, enemigos y baneos a nombres
    const alliedPicks = params.allies
      .filter(id => id > 0)
      .map(id => ({ championName: getChampionName(id) }));

    const enemyPicks = params.enemies
      .filter(id => id > 0)
      .map(id => ({ championName: getChampionName(id) }));

    const bans = params.bans
      .filter(id => id > 0)
      .map(id => getChampionName(id));

    const pickableChampionNames = pickableIds.map(id => getChampionName(id));

    // Consultar historial local si hay base de datos conectada
    let userStats: Array<{ championName: string; winrate: number; totalMatches: number }> = [];
    if (this.dbService) {
      try {
        const matches = this.dbService.getRecentMatches('local-player-puuid', 50);
        const champCount = new Map<number, { wins: number; total: number }>();
        for (const m of matches) {
          if (!champCount.has(m.championId)) {
            champCount.set(m.championId, { wins: 0, total: 0 });
          }
          const curr = champCount.get(m.championId)!;
          curr.total++;
          if (m.win) curr.wins++;
        }
        userStats = Array.from(champCount.entries())
          .filter(([_, stats]) => stats.total >= 1)
          .map(([champId, stats]) => ({
            championName: getChampionName(champId),
            winrate: Math.round((stats.wins / stats.total) * 100),
            totalMatches: stats.total,
          }))
          .sort((a, b) => b.totalMatches - a.totalMatches)
          .slice(0, 10);
      } catch {}
    }

    // Fallback estándar si no hay API key
    if (!this.apiKey) {
      registrarLog('[GeminiService] Sin API Key para draft. Devolviendo recomendaciones genéricas de contingencia.');
      return this.createDraftFallback(params.role, pickableIds, params.bans, params.allies, params.enemies, 'Sin Gemini API Key configurada. Mostrando recomendaciones estándar del meta.');
    }

    const { systemInstruction, userPrompt } = buildDraftRecommendationPrompt({
      role: params.role,
      patch: params.patch,
      alliedPicks,
      enemyPicks,
      bans,
      pickableChampionNames,
      userStats,
    });

    const modelsToTry = [this.model];
    if (this.fallbackModel && this.fallbackModel !== this.model) {
      modelsToTry.push(this.fallbackModel);
    }

    for (const modelToUse of modelsToTry) {
      try {
        const reqResult = await this.executeGeminiRequest(modelToUse, systemInstruction, userPrompt);
        if (reqResult.text) {
          const parsed = this.cleanAndParseJson(reqResult.text) as Record<string, any>;
          if (validateGeminiDraftResponse(parsed)) {
            // Validar que los picks recomendados existan y resolver sus IDs
            const validatedPicks = [];
            const bannedOrPicked = new Set([...params.bans, ...params.allies, ...params.enemies]);

            for (const p of parsed.picks) {
              const nameLower = (p.championName || '').trim().toLowerCase();
              const foundChamp = ALL_CHAMPIONS.find(c => c.name.toLowerCase() === nameLower || c.key.toLowerCase() === nameLower);
              const champId = foundChamp ? foundChamp.id : 0;

              // Validar que esté en la lista de elegibles y no esté bloqueado/baneado
              const isEligible = pickableIds.length === 0 || (champId > 0 && pickableIds.includes(champId));
              const isAvailable = !bannedOrPicked.has(champId);

              if (champId > 0 && isEligible && isAvailable) {
                const userStat = userStats.find(s => s.championName.toLowerCase() === nameLower);
                validatedPicks.push({
                  championId: champId,
                  championName: foundChamp!.name,
                  role: params.role,
                  fitReason: p.fitReason || 'Buena sinergia con la composición.',
                  threatMitigation: p.threatMitigation,
                  synergyReason: p.synergyReason,
                  localWinrate: userStat?.winrate,
                  localMatches: userStat?.totalMatches,
                  isNewChampion: champId >= 800 || !!p.isNewChampion,
                });
              }
            }

            if (validatedPicks.length > 0) {
              return {
                assignedRole: params.role,
                picks: validatedPicks.slice(0, 3),
                recommendedBans: parsed.recommendedBans || [],
                allyCompAnalysis: parsed.allyCompAnalysis,
                enemyThreats: parsed.enemyThreats || [],
                source: 'ai',
                modelUsed: modelToUse,
                generatedAt: Date.now(),
                debugInfo: {
                  rawPrompt: userPrompt,
                  rawResponse: reqResult.text,
                  validated: true,
                  lcuStatus: 'Picks validados contra lista de elegibles del LCU',
                },
              };
            }
          }
        }
      } catch (err) {
        registrarLog(`[GeminiService] Error en modelo ${modelToUse} para draft: ${err}`);
      }
    }

    return this.createDraftFallback(params.role, pickableIds, params.bans, params.allies, params.enemies, 'Fallo temporal al conectar con Gemini. Mostrando recomendaciones estándar del meta.');
  }

  private createDraftFallback(
    role: Role,
    pickableIds: number[],
    bans: number[],
    allies: number[],
    enemies: number[],
    reason: string
  ): any {
    const defaultMetaByRole: Record<Role, number[]> = {
      TOP: [266, 24, 58, 875, 897], // Aatrox, Jax, Renekton, Sett, K'Sante
      JUNGLE: [64, 76, 254, 121, 113], // Lee Sin, Nidalee, Vi, Kha'Zix, Sejuani
      MIDDLE: [103, 517, 61, 84, 157], // Ahri, Sylas, Orianna, Akali, Yasuo
      BOTTOM: [51, 222, 145, 81, 901], // Caitlyn, Jinx, Kai'Sa, Ezreal, Smolder
      UTILITY: [412, 89, 40, 111, 267], // Thresh, Leona, Janna, Nautilus, Nami
      FILL: [51, 266, 103, 64, 412],
    };

    const candidates = defaultMetaByRole[role] || [51, 266, 103];
    const blocked = new Set([...bans, ...allies, ...enemies]);
    const available = candidates.filter(id => !blocked.has(id) && (pickableIds.length === 0 || pickableIds.includes(id)));

    const picks = (available.length >= 3 ? available.slice(0, 3) : candidates.slice(0, 3)).map(id => {
      const champ = getChampionById(id);
      return {
        championId: id,
        championName: champ ? champ.name : getChampionName(id),
        role,
        fitReason: 'Selección estándar del meta con solidez táctica.',
        isNewChampion: id >= 800,
      };
    });

    return {
      assignedRole: role,
      picks,
      recommendedBans: [],
      source: 'fallback',
      fallbackReason: reason,
      generatedAt: Date.now(),
      debugInfo: {
        validationStatus: `Recomendación genérica: ${reason}`,
      },
    };
  }
}
