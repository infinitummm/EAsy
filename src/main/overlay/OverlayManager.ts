/**
 * src/main/overlay/OverlayManager.ts
 * Gestor de la ventana transparente Overlay para League of Legends en Windows.
 * Proporciona renderizado superpuesto in-game sin robar foco ni interferir con DirectX,
 * atajos globales (Ctrl+Shift+O, Ctrl+Shift+I) y sincronización con el estado de la partida.
 */

import { BrowserWindow, screen, globalShortcut, app, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IPC_CHANNELS } from '../../shared/events';
import type { OverlayState, TipoModo, DatosModoCampeon } from '../../shared/types';
import { registrarLog } from '../lcu/LcuDetector';
import { ScreenAugmentDetector, type CardMatchResult } from '../ocr/ScreenAugmentDetector';

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
  private ignoreMouse = true;
  private screenDetector: ScreenAugmentDetector = new ScreenAugmentDetector();
  private autoDismissTimer: NodeJS.Timeout | null = null;
  private currentCards: [CardMatchResult | null, CardMatchResult | null, CardMatchResult | null] = [
    null,
    null,
    null,
  ];
  private bestCardIndex: 1 | 2 | 3 | null = null;

  constructor(private readonly preloadPath: string) {}

  /**
   * Inicializa la ventana de overlay (creada en estado oculto hasta que se requiera).
   */
  public initialize(): void {
    const primaryDisplay = screen.getPrimaryDisplay();
    const bounds = primaryDisplay.bounds || primaryDisplay.workAreaSize || { width: 1920, height: 1080 };
    const { width, height } = bounds;

    // Ventana transparente de pantalla completa: permite renderizar los badges directamente
    // abajo de cada una de las 3 cartas centrales de Riot sin estorbar nada arriba.
    this.window = new BrowserWindow({
      width,
      height,
      x: 0,
      y: 0,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      skipTaskbar: true,
      focusable: false, // CRÍTICO: jamás robar foco de entrada a DirectX / League of Legends
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
    // Por defecto, permitir que los clics del ratón atraviesen hacia el juego
    this.window.setIgnoreMouseEvents(true, { forward: true });

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

    // Escuchar solicitud de re-análisis desde renderer (e.g. al pulsar reroll)
    ipcMain.handle('overlay:reanalyze', async () => {
      return this.reanalyze();
    });

    registrarLog('[OverlayManager] Ventana de overlay transparente inicializada con éxito.');
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

  /**
   * Muestra la ventana del overlay sin robar el foco de Windows (`showInactive`).
   */
  public show(): void {
    if (!this.window) this.initialize();
    if (this.window) {
      this.window.showInactive();
      this.window.setAlwaysOnTop(true, 'screen-saver', 1);
      this.state.visible = true;
      this.emitirEstado();
      registrarLog('[OverlayManager] Overlay mostrado (inactivo sin robar foco).');
    }
  }

  /**
   * Oculta la ventana del overlay y cancela temporizadores pendientes.
   */
  public hide(): void {
    if (this.autoDismissTimer) {
      clearTimeout(this.autoDismissTimer);
      this.autoDismissTimer = null;
    }
    if (this.window && this.state.visible) {
      this.window.hide();
      this.state.visible = false;
      this.emitirEstado();
      registrarLog('[OverlayManager] Overlay ocultado.');
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
   * Abre el overlay si estaba oculto sin robar foco, programa un tope de seguridad de 45s
   * y lanza el análisis OCR en pantalla.
   */
  public triggerAugmentSelection(duracionSegundos = 45): void {
    if (!this.state.visible) {
      this.show();
    }

    if (this.autoDismissTimer) {
      clearTimeout(this.autoDismissTimer);
      this.autoDismissTimer = null;
    }

    // Tope de seguridad blindado en el proceso principal (45 s)
    this.autoDismissTimer = setTimeout(() => {
      this.hide();
    }, duracionSegundos * 1000);

    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('overlay:auto-trigger', {
        championId: this.state.championId,
        championName: this.state.championName,
        gameMode: this.state.gameMode,
        autoDismissSeconds: duracionSegundos,
      });
      registrarLog(`[OverlayManager] Activación automática de aumentos disparada (tope seguridad: ${duracionSegundos}s).`);

      // Ejecutar detección en pantalla
      this.reanalyze().catch(() => {});
    }
  }

  /**
   * Notificado por AugmentPanelDetector cuando el panel de aumentos aparece en pantalla.
   */
  public onPanelAbierto(): void {
    this.triggerAugmentSelection(45);
  }

  /**
   * Notificado por AugmentPanelDetector cuando el usuario elige augment y las cartas desaparecen.
   */
  public onPanelCerrado(): void {
    this.currentCards = [null, null, null];
    this.bestCardIndex = null;
    this.hide();
  }

  /**
   * Notificado automáticamente cuando se detecta un reroll visual en una carta.
   */
  public async onCardReroll(cardIndex: 1 | 2 | 3): Promise<void> {
    if (!this.state.visible || !this.window || this.window.isDestroyed()) {
      return;
    }
    registrarLog(`[OverlayManager] Reroll detectado en carta ${cardIndex}. Re-analizando slot...`);
    await this.reanalyzeSlot(cardIndex);
  }

  /**
   * Emite el estado de escaneo en vivo (telemetría visual) hacia el renderer.
   */
  public emitScanStatus(status: string): void {
    this.state.scanStatus = status;
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('overlay:scan-status', { status });
    }
  }

  /**
   * Re-analiza únicamente una carta específica tras un reroll y actualiza el overlay
   * con timeout estricto de 2500ms y bloque finally garantizado.
   */
  public async reanalyzeSlot(cardIndex: 1 | 2 | 3): Promise<boolean> {
    if (!this.window || this.window.isDestroyed()) {
      return false;
    }

    this.emitScanStatus(`Re-escaneando carta ${cardIndex}...`);

    let cardRes: CardMatchResult | null = null;
    const timeoutSlot = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout de 2500ms en carta')), 2500)
    );

    try {
      cardRes = await Promise.race([
        this.screenDetector.analizarCartaIndividual(cardIndex, this.state.data),
        timeoutSlot,
      ]);
    } catch (err: any) {
      registrarLog(`[OverlayManager] Error re-analizando carta ${cardIndex}: ${err?.message || err}`);
    } finally {
      if (cardRes) {
        this.currentCards[cardIndex - 1] = cardRes;
      }

      const tierRank: Record<string, number> = {
        'S+': 0,
        S: 1,
        A: 2,
        B: 3,
        C: 4,
        D: 5,
      };

      let bestIdx: 1 | 2 | 3 | null = null;
      let mejorRango = 99;

      for (const r of this.currentCards) {
        if (r?.augment && r.augment.tier in tierRank) {
          const rango = tierRank[r.augment.tier];
          if (rango < mejorRango) {
            mejorRango = rango;
            bestIdx = r.cardIndex;
          }
        }
      }

      this.bestCardIndex = bestIdx;
      this.currentCards.forEach((r) => {
        if (r?.augment) {
          r.augment = {
            ...r.augment,
            isBest: r.cardIndex === bestIdx,
          };
        }
      });

      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('overlay:screen-augments', {
          cards: this.currentCards,
          bestCardIndex: this.bestCardIndex,
          detectedAt: Date.now(),
          isAnalyzing: false,
        });
        registrarLog(`[OverlayManager] Carta ${cardIndex} actualizada tras reroll (isAnalyzing: false).`);
      }
    }

    return Boolean(cardRes);
  }

  /**
   * Captura la pantalla y envía los aumentos exactos detectados a la interfaz.
   * Envuelve la lectura en un timeout duro de 2500ms con try/catch/finally inquebrantable
   * que GARANTIZA que el renderer jamás se quede colgado en 'Analizando...'.
   */
  public async reanalyze(): Promise<boolean> {
    if (!this.window || this.window.isDestroyed()) {
      return false;
    }

    this.emitScanStatus('1/3 Capturando pantalla...');
    let resultado: any = null;

    const timeoutTotal = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout general OCR de 2500ms excedido')), 2500)
    );

    try {
      registrarLog('[OverlayManager] Iniciando escaneo OCR con timeout de 2500ms...');
      resultado = await Promise.race([
        this.screenDetector.analizarPantalla(this.state.data, (paso) => this.emitScanStatus(paso)),
        timeoutTotal,
      ]);
    } catch (err: any) {
      registrarLog(`[OverlayManager] Fallo o timeout durante re-análisis OCR: ${err?.message || err}`);
      this.emitScanStatus(`Error: ${err?.message || 'Error en análisis'}`);
    } finally {
      if (resultado && Array.isArray(resultado.cards)) {
        this.currentCards = [resultado.cards[0], resultado.cards[1], resultado.cards[2]];
        this.bestCardIndex = resultado.bestCardIndex;
        registrarLog('[OverlayManager] Escaneo OCR exitoso procesado.');
      } else {
        // Fallback honesto: si falló o no reconoció, asegurar que las 3 cartas existan como 'No reconocido'
        if (!this.currentCards || this.currentCards.every((c) => c === null)) {
          this.currentCards = [
            { cardIndex: 1, augment: null, rawText: '', confidence: 0, error: 'Tiempo agotado o no detectado' },
            { cardIndex: 2, augment: null, rawText: '', confidence: 0, error: 'Tiempo agotado o no detectado' },
            { cardIndex: 3, augment: null, rawText: '', confidence: 0, error: 'Tiempo agotado o no detectado' },
          ];
        }
      }

      // INQUEBRANTABLE: Notificar SIEMPRE al renderer para apagar el estado 'Escaneando...'
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('overlay:screen-augments', {
          cards: this.currentCards,
          bestCardIndex: this.bestCardIndex,
          detectedAt: Date.now(),
          isAnalyzing: false,
        });
        registrarLog('[OverlayManager] Notificación de finalización enviada al renderer (isAnalyzing: false).');
      }
    }

    return Boolean(resultado);
  }

  /**
   * Configura si los eventos de ratón deben atravesar la ventana hacia el juego.
   */
  public setIgnoreMouseEvents(ignore: boolean, forward = true): void {
    if (this.window && !this.window.isDestroyed()) {
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
    const cambioCampeon = this.state.championId !== championId;
    this.state.championId = championId;
    this.state.championName = championName;
    this.state.gameMode = mode;
    if (cambioCampeon && championId <= 0) {
      this.state.data = null;
    }
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
    if (this.autoDismissTimer) {
      clearTimeout(this.autoDismissTimer);
      this.autoDismissTimer = null;
    }
    globalShortcut.unregister('CommandOrControl+Shift+O');
    globalShortcut.unregister('CommandOrControl+Shift+I');
    this.screenDetector.destroy().catch(() => {});
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
      this.window = null;
    }
  }
}
