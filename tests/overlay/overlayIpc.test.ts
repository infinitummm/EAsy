/**
 * tests/overlay/overlayIpc.test.ts
 * Pruebas unitarias para los manejadores IPC del overlay y modos especiales.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IPC_CHANNELS } from '../../src/shared/events';
import type { IModeService } from '../../src/shared/contracts';

const mockIpcHandlers: Record<string, Function> = {};
const mockIpcListeners: Record<string, Function> = {};

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((canal: string, handler: Function) => {
      mockIpcHandlers[canal] = handler;
    }),
    on: vi.fn((canal: string, listener: Function) => {
      mockIpcListeners[canal] = listener;
    }),
  },
}));

import { registrarOverlayIpc } from '../../src/main/ipc/overlayIpc';

describe('overlayIpc - Registro y Respuestas IPC', () => {
  const mockOverlayManager: any = {
    show: vi.fn(),
    hide: vi.fn(),
    toggle: vi.fn(() => true),
    getState: vi.fn(() => ({ visible: true, isBorderless: true })),
    setIgnoreMouseEvents: vi.fn(),
  };

  const mockModeService: IModeService = {
    getChampionAugments: vi.fn(async (championId, mode, patch) => ({
      championId,
      championName: 'Aatrox',
      mode,
      patch: patch || '16.21',
      augments: [
        {
          id: 101,
          name: 'Goliath',
          rarity: 'prismatic',
          tier: 'S+',
          pickRate: 14.5,
        },
      ],
      suggestedAugments: {
        silver: [],
        gold: [],
        prismatic: [
          {
            id: 101,
            name: 'Goliath',
            rarity: 'prismatic',
            tier: 'S+',
            pickRate: 14.5,
          },
        ],
      },
      lastUpdated: Date.now(),
    })),
    checkBorderless: vi.fn(async (path) => ({
      isBorderless: true,
      windowMode: 1,
      configPath: path || 'C:\\Riot Games\\League of Legends\\Config\\game.cfg',
    })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockIpcHandlers)) delete mockIpcHandlers[key];
    for (const key of Object.keys(mockIpcListeners)) delete mockIpcListeners[key];
    registrarOverlayIpc(mockOverlayManager, mockModeService);
  });

  it('registra los canales requeridos en ipcMain', () => {
    expect(mockIpcHandlers[IPC_CHANNELS.OVERLAY_SHOW]).toBeDefined();
    expect(mockIpcHandlers[IPC_CHANNELS.OVERLAY_HIDE]).toBeDefined();
    expect(mockIpcHandlers[IPC_CHANNELS.OVERLAY_TOGGLE]).toBeDefined();
    expect(mockIpcHandlers[IPC_CHANNELS.OVERLAY_GET_STATE]).toBeDefined();
    expect(mockIpcHandlers[IPC_CHANNELS.MODES_GET_CHAMPION_AUGMENTS]).toBeDefined();
    expect(mockIpcHandlers[IPC_CHANNELS.MODES_CHECK_BORDERLESS]).toBeDefined();
    expect(mockIpcListeners['overlay:set-ignore-mouse-events']).toBeDefined();
  });

  it('OVERLAY_SHOW llama a overlayManager.show()', async () => {
    const res = await mockIpcHandlers[IPC_CHANNELS.OVERLAY_SHOW]();
    expect(mockOverlayManager.show).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ success: true });
  });

  it('OVERLAY_HIDE llama a overlayManager.hide()', async () => {
    const res = await mockIpcHandlers[IPC_CHANNELS.OVERLAY_HIDE]();
    expect(mockOverlayManager.hide).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ success: true });
  });

  it('OVERLAY_TOGGLE alterna el estado', async () => {
    const res = await mockIpcHandlers[IPC_CHANNELS.OVERLAY_TOGGLE]();
    expect(mockOverlayManager.toggle).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ visible: true });
  });

  it('MODES_GET_CHAMPION_AUGMENTS delega a modeService', async () => {
    const params = { championId: 266, mode: 'aram_mayhem' as const, patch: '16.21' };
    const res = await mockIpcHandlers[IPC_CHANNELS.MODES_GET_CHAMPION_AUGMENTS]({}, params);
    expect(mockModeService.getChampionAugments).toHaveBeenCalledWith(266, 'aram_mayhem', '16.21');
    expect(res.championName).toBe('Aatrox');
    expect(res.augments).toHaveLength(1);
  });

  it('MODES_CHECK_BORDERLESS delega a modeService', async () => {
    const res = await mockIpcHandlers[IPC_CHANNELS.MODES_CHECK_BORDERLESS]({}, 'custom/path');
    expect(mockModeService.checkBorderless).toHaveBeenCalledWith('custom/path');
    expect(res.isBorderless).toBe(true);
    expect(res.windowMode).toBe(1);
  });

  it('overlay:set-ignore-mouse-events llama a setIgnoreMouseEvents', () => {
    mockIpcListeners['overlay:set-ignore-mouse-events']({}, true, false);
    expect(mockOverlayManager.setIgnoreMouseEvents).toHaveBeenCalledWith(true, false);
  });
});
