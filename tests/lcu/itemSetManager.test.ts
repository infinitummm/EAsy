import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ItemSetManager } from '../../src/main/lcu/ItemSetManager';
import type { ILcuClient } from '../../src/shared/contracts';

describe('ItemSetManager - Generación y Exportación de Builds a LoL', () => {
  let tempDir: string;
  let mockLcuClient: ILcuClient;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itero-itemset-test-'));
    // Crear carpetas de configuración simuladas
    fs.mkdirSync(path.join(tempDir, 'Config', 'Champions'), { recursive: true });

    mockLcuClient = {
      getConnectionState: vi.fn().mockReturnValue('connected'),
      getGameflowPhase: vi.fn().mockReturnValue('ChampSelect'),
      getIsPermissionError: vi.fn().mockReturnValue(false),
      getLastConnectionError: vi.fn().mockReturnValue(null),
      getPort: vi.fn().mockReturnValue(50000),
      request: vi.fn().mockImplementation(async (method: string, endpoint: string) => {
        if (endpoint.includes('current-summoner')) {
          return { accountId: 12345678 };
        }
        return { success: true };
      }),
      injectRunePage: vi.fn(),
      getChampSelectSession: vi.fn(),
      initialize: vi.fn(),
      disconnect: vi.fn(),
      testDetection: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    } as unknown as ILcuClient;
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('debe construir un Item Set con estructura válida de LoL y 5 bloques estándar', () => {
    const manager = new ItemSetManager(mockLcuClient, () => tempDir);
    const itemSet = manager.construirItemSet({
      championId: 22, // Ashe
      title: 'Itero: Ashe vs Jinx',
      build: {
        startingItems: [1055, 2003],
        coreItems: [3078, 3085, 3031],
        situationalItems: [{ itemId: 3026, condition: 'Vs burst' }],
        rationale: 'Build de DPS y supervivencia'
      }
    });

    expect(itemSet.title).toBe('Itero: Ashe vs Jinx');
    expect(itemSet.associatedChampions).toEqual([22]);
    expect(itemSet.type).toBe('custom');
    expect(Array.isArray(itemSet.blocks)).toBe(true);
    expect((itemSet.blocks as any[]).length).toBe(5);

    const blocks = itemSet.blocks as any[];
    expect(blocks[0].type).toContain('Iniciales');
    expect(blocks[0].items.map((i: any) => i.id)).toEqual(['1055', '2003']);

    expect(blocks[1].type).toContain('Botas');
    expect(blocks[1].items.length).toBeGreaterThan(0);

    expect(blocks[2].type).toContain('Core');
    expect(blocks[2].items.map((i: any) => i.id)).toEqual(['3078', '3085', '3031']);

    expect(blocks[3].type).toContain('Situacional');
    expect(blocks[3].items.some((i: any) => i.id === '3026')).toBe(true);

    expect(blocks[4].type).toContain('Consumibles');
    expect(blocks[4].items.some((i: any) => i.id === '2003')).toBe(true);
  });

  it('debe exportar la build al disco en Config/Champions/[Key]/Recommended y en Config/ItemSets.json', async () => {
    const manager = new ItemSetManager(mockLcuClient, () => tempDir);
    const resultado = await manager.aplicarBuild({
      championId: 22, // Ashe
      build: {
        startingItems: [1055, 2003],
        coreItems: [3078, 3085],
        situationalItems: [{ itemId: 3026, condition: 'Defensa' }],
        rationale: 'Prueba de guardado'
      }
    });

    expect(resultado.success).toBe(true);
    expect(resultado.filePath).toBeDefined();
    expect(fs.existsSync(resultado.filePath!)).toBe(true);

    const rawFile = fs.readFileSync(resultado.filePath!, 'utf-8');
    const parsed = JSON.parse(rawFile);
    expect(parsed.associatedChampions).toEqual([22]);

    // Verificar que también se actualizó Config/ItemSets.json
    const globalPath = path.join(tempDir, 'Config', 'ItemSets.json');
    expect(fs.existsSync(globalPath)).toBe(true);
    const globalContent = JSON.parse(fs.readFileSync(globalPath, 'utf-8'));
    expect(globalContent.itemSets.length).toBeGreaterThan(0);
  });
});
