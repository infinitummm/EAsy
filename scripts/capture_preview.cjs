const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Mock IPC handlers so the UI renders fully with active data and no onboarding modal
ipcMain.handle('app:get-version', async () => '1.0.1');
ipcMain.handle('settings:get', async () => ({
  onboardingCompleted: true,
  autoAccept: { enabled: true, delaySeconds: 2 },
  summonerName: 'Makoto Yuki',
  riotIdTag: 'SEES',
  preferredRole: 'TOP',
  secondaryRole: 'MID',
  opggRegion: 'lan',
  opggTier: 'emerald_plus',
  locale: 'es_MX',
}));
ipcMain.handle('lcu:get-state', async () => ({
  state: 'connected',
  gameflow: 'Lobby',
  isPermissionError: false,
  port: 52419,
  lastError: null,
}));
ipcMain.handle('lcu:get-auto-accept-status', async () => ({
  habilitado: true,
  retrasoSegundos: 2,
  pollingActivo: true,
  lastAction: 'Sistema listo en espera de partida',
  lastActionTimestamp: Date.now() - 34000,
}));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    backgroundColor: '#030814',
    webPreferences: {
      preload: path.join(__dirname, '../dist/preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  const indexPath = path.join(__dirname, '../dist/renderer/index.html');
  await win.loadFile(indexPath);

  // Wait 1.5 seconds for fonts, styles and React state
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const image = await win.webContents.capturePage();
  const outPath = path.join(__dirname, '../preview_p3r_dashboard.png');
  fs.writeFileSync(outPath, image.toPNG());
  console.log('Preview saved to:', outPath);

  app.quit();
});
