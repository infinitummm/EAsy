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
  it('cleanAppItemSets elimina conjuntos de la app con prefijo [IL] o Itero en LCU y disco', async () => {
    // Configurar ItemSets.json previo en disco
    const globalPath = path.join(tempDir, 'Config', 'ItemSets.json');
    fs.writeFileSync(globalPath, JSON.stringify({
      itemSets: [
        { title: '[IL] Caitlyn' },
        { title: 'Itero Build Ashe' },
        { title: 'Mi Conjunto Personal' }
      ]
    }), 'utf-8');

    // Configurar LCU para simular 2 sets de Itero y 1 personal
    (mockLcuClient.request as any).mockImplementation(async (method: string, endpoint: string, body: any) => {
      if (endpoint.includes('current-summoner')) {
        return { accountId: 12345678 };
      }
      if (method === 'GET' && endpoint.includes('/sets')) {
        return {
          accountId: 12345678,
          itemSets: [
            { title: '[IL] Caitlyn' },
            { title: 'Itero Build Ashe' },
            { title: 'Mi Conjunto Personal' }
          ]
        };
      }
      if (method === 'PUT' && endpoint.includes('/sets')) {
        return { success: true };
      }
      return { success: true };
    });

    const manager = new ItemSetManager(mockLcuClient, () => tempDir);
    const eliminados = await manager.cleanAppItemSets();

    expect(eliminados).toBe(2);

    // Verificar en disco
    const disco = JSON.parse(fs.readFileSync(globalPath, 'utf-8'));
    expect(disco.itemSets.length).toBe(1);
    expect(disco.itemSets[0].title).toBe('Mi Conjunto Personal');
  });

  it('al aplicar build se elimina el item set previo [IL] y se conserva el nuevo con prefijo EAsy', async () => {
    const globalPath = path.join(tempDir, 'Config', 'ItemSets.json');
    fs.writeFileSync(globalPath, JSON.stringify({
      itemSets: [
        { title: '[IL] Caitlyn vs Jinx' },
        { title: 'Mi Build Personal' }
      ]
    }), 'utf-8');

    const manager = new ItemSetManager(mockLcuClient, () => tempDir);
    await manager.aplicarBuild({
      championId: 51,
      opponentId: 222,
      build: {
        startingItems: [1055, 2003],
        coreItems: [3031, 3094, 3036],
        situationalItems: [],
        rationale: 'Build Caitlyn'
      }
    });

    const disco = JSON.parse(fs.readFileSync(globalPath, 'utf-8'));
    expect(disco.itemSets.some((s: any) => s.title.startsWith('[IL]'))).toBe(false);
    expect(disco.itemSets.some((s: any) => s.title.startsWith('EAsy'))).toBe(true);
    expect(disco.itemSets.some((s: any) => s.title === 'Mi Build Personal')).toBe(true);
  });
});
