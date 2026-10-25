/**
 * src/main/overlay/OverlayManager.ts
 * Gestor de la ventana transparente Overlay para League of Legends en Windows.
 * Proporciona renderizado superpuesto in-game sin robar foco ni interferir con DirectX,
 * atajos globales (Ctrl+Shift+O, Ctrl+Shift+I) y sincronización con el estado de la partida.
 */

import { BrowserWindow, screen, globalShortcut, app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IPC_CHANNELS } from '../../shared/events';
import type { OverlayState, TipoModo, DatosModoCampeon } from '../../shared/types';
import { registrarLog } from '../lcu/LcuDetector';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class OverlayManager {
  private window: BrowserWindow | null = null;
  private state: OverlayState = {
    visible: false,
    isBorderless: true,
    gameMode: null,
    championId: null,
    championName: null,
    data: null,
    activeAugments: [],
  };
  private ignoreMouse = false;

  constructor(private readonly preloadPath: string) {}

  /**
   * Inicializa la ventana de overlay (creada en estado oculto hasta que se requiera).
   */
  public initialize(): void {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width } = primaryDisplay.workAreaSize;

    const windowWidth = 820;
    const windowHeight = 440;
    const posX = Math.max(0, Math.round((width - windowWidth) / 2));
    const posY = 35;

    this.window = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x: posX,
      y: posY,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: true,
      skipTaskbar: true,
      focusable: true,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    this.window.setAlwaysOnTop(true, 'screen-saver', 1);
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Cargar URL según entorno
    if (process.env.VITE_DEV_SERVER_URL) {
      this.window.loadURL(`${process.env.VITE_DEV_SERVER_URL}/overlay.html`);
    } else {
      this.window.loadFile(path.join(__dirname, '../renderer/overlay.html'));
    }

    this.window.on('closed', () => {
      this.window = null;
    });

    // Registrar atajos globales
    this.registrarAtajos();

    registrarLog('[OverlayManager] Ventana de overlay inicializada con éxito.');
  }

  /**
   * Registra los atajos globales para alternar el overlay en juego.
   */
  private registrarAtajos(): void {
    try {
      globalShortcut.register('CommandOrControl+Shift+O', () => {
        registrarLog('[OverlayManager] Atajo Ctrl+Shift+O presionado. Alternando overlay...');
        this.toggle();
      });

      globalShortcut.register('CommandOrControl+Shift+I', () => {
        registrarLog('[OverlayManager] Atajo Ctrl+Shift+I presionado. Alternando paso de ratón...');
        this.toggleIgnoreMouse();
      });
    } catch (e: any) {
      registrarLog(`[OverlayManager] Advertencia al registrar atajos: ${e.message}`);
    }
  }

  private topInterval: NodeJS.Timeout | null = null;

  /**
   * Muestra la ventana del overlay sin robar el foco de Windows (`showInactive`).
   */
  public show(): void {
    if (!this.window) this.initialize();
    if (this.window) {
      this.window.showInactive();
      this.window.setAlwaysOnTop(true, 'screen-saver', 1);
      if (typeof this.window.moveTop === 'function') {
        this.window.moveTop();
      }
      this.state.visible = true;
      this.iniciarMantenimientoTop();
      this.emitirEstado();
      registrarLog('[OverlayManager] Overlay mostrado (inactivo sin robar foco).');
    }
  }

  /**
   * Oculta la ventana del overlay.
   */
  public hide(): void {
    if (this.window && this.state.visible) {
      this.detenerMantenimientoTop();
      this.window.hide();
      this.state.visible = false;
      this.emitirEstado();
      registrarLog('[OverlayManager] Overlay ocultado.');
    }
  }

  private iniciarMantenimientoTop(): void {
    if (this.topInterval) clearInterval(this.topInterval);
    this.topInterval = setInterval(() => {
      if (this.window && !this.window.isDestroyed() && this.state.visible) {
        this.window.setAlwaysOnTop(true, 'screen-saver', 1);
        if (typeof this.window.moveTop === 'function') {
          this.window.moveTop();
        }
      }
    }, 1500);
  }

  private detenerMantenimientoTop(): void {
    if (this.topInterval) {
      clearInterval(this.topInterval);
      this.topInterval = null;
    }
  }

  /**
   * Alterna la visibilidad del overlay.
   */
  public toggle(): boolean {
    if (this.state.visible) {
      this.hide();
      return false;
    } else {
      this.show();
      return true;
    }
  }

  /**
   * Activa automáticamente el overlay en el momento de escoger aumentos.
   * Abre el overlay si estaba oculto, asegura mantenimiento de capa superior
   * y emite el evento 'overlay:auto-trigger' con la duración temporal de auto-cierre.
   */
  public triggerAugmentSelection(duracionSegundos = 25): void {
    if (!this.state.visible) {
      this.show();
    }
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('overlay:auto-trigger', {
        championId: this.state.championId,
        championName: this.state.championName,
        gameMode: this.state.gameMode,
        autoDismissSeconds: duracionSegundos,
      });
      registrarLog(`[OverlayManager] Activación automática de aumentos disparada (${duracionSegundos}s).`);
    }
  }

  /**
   * Configura si los eventos de ratón deben atravesar la ventana hacia el juego.
   */
  public setIgnoreMouseEvents(ignore: boolean, forward = true): void {
    if (this.window) {
      this.ignoreMouse = ignore;
      this.window.setIgnoreMouseEvents(ignore, { forward });
    }
  }

  public toggleIgnoreMouse(): boolean {
    this.setIgnoreMouseEvents(!this.ignoreMouse, true);
    return this.ignoreMouse;
  }

  /**
   * Actualiza el campeón y modo de juego detectados.
   */
  public setCampeonYModo(championId: number, championName: string, mode: TipoModo): void {
    this.state.championId = championId;
    this.state.championName = championName;
    this.state.gameMode = mode;
    this.emitirEstado();
  }

  /**
   * Asigna los datos de augments calculados para el campeón.
   */
  public setDatosModo(data: DatosModoCampeon): void {
    this.state.data = data;
    this.state.championId = data.championId;
    this.state.championName = data.championName;
    this.state.gameMode = data.mode;
    this.emitirEstado();
  }

  /**
   * Asigna si el juego está en modo sin bordes o no.
   */
  public setBorderless(isBorderless: boolean): void {
    this.state.isBorderless = isBorderless;
    this.emitirEstado();
  }

  public getState(): OverlayState {
    return { ...this.state };
  }

  private emitirEstado(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(IPC_CHANNELS.OVERLAY_STATE_CHANGED, this.state);
    }
  }

  public destroy(): void {
    this.detenerMantenimientoTop();
    globalShortcut.unregister('CommandOrControl+Shift+O');
    globalShortcut.unregister('CommandOrControl+Shift+I');
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
      this.window = null;
    }
  }
}
