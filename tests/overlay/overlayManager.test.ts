/**
 * tests/overlay/overlayManager.test.ts
 * Pruebas unitarias y de integración para el OverlayManager y canales IPC de overlay.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TipoModo, DatosModoCampeon } from '../../src/shared/types';
import type { IModeService } from '../../src/shared/contracts';

// Mock de Electron BrowserWindow y globalShortcut
vi.mock('electron', () => {
  const listeners: Record<string, Function[]> = {};
  const mockWebContents = {
    send: vi.fn((canal: string, payload: any) => {}),
  };

  class MockBrowserWindow {
    static getAllWindows = vi.fn(() => []);
    isVisible = false;
    isDestroyed = vi.fn(() => false);
    show = vi.fn(() => { this.isVisible = true; });
    showInactive = vi.fn(() => { this.isVisible = true; });
    hide = vi.fn(() => { this.isVisible = false; });
    close = vi.fn(() => { this.isDestroyed = vi.fn(() => true); });
    setAlwaysOnTop = vi.fn();
    moveTop = vi.fn();
    setVisibleOnAllWorkspaces = vi.fn();
    setIgnoreMouseEvents = vi.fn();
    loadURL = vi.fn();
    loadFile = vi.fn();
    webContents = mockWebContents;
    on = vi.fn((evento: string, cb: Function) => {
      listeners[evento] = listeners[evento] || [];
      listeners[evento].push(cb);
    });
  }

  return {
    BrowserWindow: MockBrowserWindow,
    screen: {
      getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }),
    },
    globalShortcut: {
      register: vi.fn(),
      unregister: vi.fn(),
    },
    app: {
      whenReady: () => Promise.resolve(),
      on: vi.fn(),
      quit: vi.fn(),
    },
    ipcMain: {
      handle: vi.fn(),
      on: vi.fn(),
    },
  };
});

import { OverlayManager } from '../../src/main/overlay/OverlayManager';

describe('OverlayManager - Control de Ventana Superpuesta', () => {
  let manager: OverlayManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new OverlayManager('mock/preload/path.js');
  });

  afterEach(() => {
    manager.destroy();
  });

  it('inicia en estado oculto con valores por defecto', () => {
    const estado = manager.getState();
    expect(estado.visible).toBe(false);
    expect(estado.isBorderless).toBe(true);
    expect(estado.championId).toBeNull();
  });

  it('alterna la visibilidad (show, hide, toggle)', () => {
    manager.show();
    expect(manager.getState().visible).toBe(true);

    manager.hide();
    expect(manager.getState().visible).toBe(false);

    const toggled = manager.toggle();
    expect(toggled).toBe(true);
    expect(manager.getState().visible).toBe(true);

    const toggledAgain = manager.toggle();
    expect(toggledAgain).toBe(false);
    expect(manager.getState().visible).toBe(false);
  });

  it('actualiza campeón y modo correctamente', () => {
    manager.setCampeonYModo(266, 'Aatrox', 'aram_mayhem');
    const estado = manager.getState();
    expect(estado.championId).toBe(266);
    expect(estado.championName).toBe('Aatrox');
    expect(estado.gameMode).toBe('aram_mayhem');
  });

  it('actualiza el estado de sin bordes (borderless)', () => {
    manager.setBorderless(false);
    expect(manager.getState().isBorderless).toBe(false);

    manager.setBorderless(true);
    expect(manager.getState().isBorderless).toBe(true);
  });

  it('configura clics pasantes con setIgnoreMouseEvents', () => {
    manager.initialize();
    manager.setIgnoreMouseEvents(true, true);
    // toggleIgnoreMouse invierte el estado
    const ignoreMouse = manager.toggleIgnoreMouse();
    expect(typeof ignoreMouse).toBe('boolean');
  });

  it('asigna datos de modo completos con setDatosModo', () => {
    const augmentMock = {
      id: 101,
      name: 'Goliath',
      nameEs: 'Goliat',
      key: 'Goliath',
      rarity: 'prismatic' as const,
      tier: 'S+' as const,
      pickRate: 15.4,
      iconUrl: 'https://cdn.example.com/goliath.png',
      desc: 'Aumenta tamaño y vida',
    };

    const datosMock: DatosModoCampeon = {
      championId: 266,
      championName: 'Aatrox',
      mode: 'arena',
      patch: '16.21',
      augments: [augmentMock],
      suggestedAugments: {
        silver: [],
        gold: [],
        prismatic: [augmentMock],
      },
      lastUpdated: Date.now(),
    };

    manager.setDatosModo(datosMock);
    const estado = manager.getState();
    expect(estado.championId).toBe(266);
    expect(estado.championName).toBe('Aatrox');
    expect(estado.gameMode).toBe('arena');
    expect(estado.data).toBeDefined();
    expect(estado.data?.augments).toHaveLength(1);
    expect(estado.data?.augments[0].tier).toBe('S+');
  });

  it('abre y cierra el overlay al recibir eventos de AugmentPanelDetector', () => {
    manager.initialize();
    expect(manager.getState().visible).toBe(false);

    // Al abrir el panel
    manager.onPanelAbierto();
    expect(manager.getState().visible).toBe(true);

    // Al cerrar el panel (el usuario seleccionó augment)
    manager.onPanelCerrado();
    expect(manager.getState().visible).toBe(false);
  });
});

