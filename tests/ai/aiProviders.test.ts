import { describe, it, expect, vi } from 'vitest';
import {
  AiProvider,
  AiProviderManager,
  GeminiAiProvider,
  EVENTOS_AI_PROVIDER_MANAGER,
} from '../../src/main/ai/providers';

describe('Capa de Proveedores de IA Intercambiable (Frente 2, REQ-019)', () => {
  it('conmuta automáticamente al proveedor de respaldo ante error 429 de cuota', async () => {
    // Proveedor principal simulado que arroja 429 cuota agotada
    const proveedorPrincipal: AiProvider = {
      id: 'principal',
      name: 'Proveedor Principal',
      isAvailable: vi.fn().mockResolvedValue(true),
      generateText: vi.fn().mockRejectedValue(new Error('HTTP 429: RESOURCE_EXHAUSTED cuota excedida')),
      generateStructured: vi.fn().mockRejectedValue(new Error('HTTP 429: Quota limit reached')),
      getQuotaInfo: vi.fn().mockReturnValue({
        providerId: 'principal',
        providerName: 'Proveedor Principal',
        standardCallsToday: 10,
        searchCallsToday: 0,
        status: 'quota_exceeded',
        lastError: 'HTTP 429: RESOURCE_EXHAUSTED',
      }),
    };

    // Proveedor de respaldo simulado que responde exitosamente
    const proveedorRespaldo: AiProvider = {
      id: 'respaldo',
      name: 'Proveedor Respaldo',
      isAvailable: vi.fn().mockResolvedValue(true),
      generateText: vi.fn().mockResolvedValue('Respuesta desde proveedor de respaldo'),
      generateStructured: vi.fn().mockResolvedValue({ status: 'ok', source: 'respaldo' }),
      getQuotaInfo: vi.fn().mockReturnValue({
        providerId: 'respaldo',
        providerName: 'Proveedor Respaldo',
        standardCallsToday: 1,
        searchCallsToday: 0,
        status: 'available',
      }),
    };

    const manager = new AiProviderManager({
      providers: [proveedorPrincipal, proveedorRespaldo],
      preferredOrder: ['principal', 'respaldo'],
    });

    const eventoFallo429 = vi.fn();
    const eventoCambio = vi.fn();

    manager.on(EVENTOS_AI_PROVIDER_MANAGER.FALLO_CUOTA_429, eventoFallo429);
    manager.on(EVENTOS_AI_PROVIDER_MANAGER.CAMBIO_PROVEEDOR, eventoCambio);

    const respuesta = await manager.generateText('Dame una recomendación táctica');

    expect(respuesta).toBe('Respuesta desde proveedor de respaldo');
    expect(proveedorPrincipal.generateText).toHaveBeenCalled();
    expect(proveedorRespaldo.generateText).toHaveBeenCalled();
    expect(eventoFallo429).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'principal' })
    );
    expect(eventoCambio).toHaveBeenCalledWith({
      previousId: 'principal',
      nextId: 'respaldo',
    });
  });

  it('conmuta en llamadas estructuradas JSON ante 429', async () => {
    const proveedor1: AiProvider = {
      id: 'p1',
      name: 'P1',
      isAvailable: vi.fn().mockResolvedValue(true),
      generateText: vi.fn(),
      generateStructured: vi.fn().mockRejectedValue(new Error('HTTP 429 Quota exhausted')),
      getQuotaInfo: vi.fn().mockReturnValue({
        providerId: 'p1',
        providerName: 'P1',
        standardCallsToday: 5,
        searchCallsToday: 0,
        status: 'quota_exceeded',
      }),
    };

    const proveedor2: AiProvider = {
      id: 'p2',
      name: 'P2',
      isAvailable: vi.fn().mockResolvedValue(true),
      generateText: vi.fn(),
      generateStructured: vi.fn().mockResolvedValue({ build: [3078, 3053] }),
      getQuotaInfo: vi.fn().mockReturnValue({
        providerId: 'p2',
        providerName: 'P2',
        standardCallsToday: 1,
        searchCallsToday: 0,
        status: 'available',
      }),
    };

    const manager = new AiProviderManager({
      providers: [proveedor1, proveedor2],
      preferredOrder: ['p1', 'p2'],
    });

    const res = await manager.generateStructured<{ build: number[] }>('Genera build JSON');
    expect(res).toEqual({ build: [3078, 3053] });
  });

  it('GeminiAiProvider expone métricas y nota transparente de cuota', () => {
    const gemini = new GeminiAiProvider({ apiKey: 'AIzaFakeKey123456789' });
    const quota = gemini.getQuotaInfo();
    expect(quota.providerId).toBe('gemini');
    expect(quota.dailyLimitStandard).toBe(1500);
    expect(quota.dailyLimitSearch).toBe(0); // 0 en free tier sin facturación
    expect(quota.note).toContain('Free tier sin tarjeta');
  });
});
