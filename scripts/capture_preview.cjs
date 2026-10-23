const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

ipcMain.handle('app:get-version', async () => '1.0.1');
ipcMain.handle('settings:get', async () => ({
  onboardingCompleted: true,
  autoAccept: { enabled: true, delaySeconds: 2 },
  apiKeys: { riotApiKeyEncrypted: '', geminiApiKeyEncrypted: '' },
  autoChampSelect: {
    autoHover: true,
    autoPick: false,
    autoBan: false,
    autoSpells: true,
    pickDelaySeconds: 1,
    rolePreferences: {
      TOP: { preferredChampions: [24, 266, 804], fallbackChampions: [39, 875], banChampions: [114], spells: [4, 12] },
      JUNGLE: { preferredChampions: [64, 121], fallbackChampions: [254], banChampions: [11], spells: [4, 11] },
      MIDDLE: { preferredChampions: [103, 238], fallbackChampions: [84], banChampions: [7], spells: [4, 14] },
      BOTTOM: { preferredChampions: [51, 222], fallbackChampions: [145], banChampions: [202], spells: [4, 7] },
      UTILITY: { preferredChampions: [555, 412], fallbackChampions: [89], banChampions: [111], spells: [4, 3] },
      FILL: { preferredChampions: [], fallbackChampions: [], banChampions: [], spells: [4, 14] },
    },
  },
  leagueInstallationPath: 'C:\\Riot Games\\League of Legends',
  opggTier: 'emerald_plus',
  minMatchupSampleThreshold: 200,
  allowAiChoiceTop3: false,
  activeAccount: { gameName: 'Invocador', tagLine: 'LAN', summonerLevel: 184, tier: 'EMERALD', rank: 'II' },
  preferredLocale: 'es_MX',
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
  lastAction: 'En espera de partida',
  lastActionTimestamp: Date.now() - 15000,
}));
ipcMain.handle('riot:get-client-version', async () => ({
  ddragonVersion: '16.20.1',
  clientVersion: '26.20',
  matches: true,
  displayPatch: 'Parche 26.20',
}));
ipcMain.handle('lcu:get-client-version', async () => '26.20');
ipcMain.handle('lcu:get-champ-select-session', async () => null);
ipcMain.handle('riot:get-catalog', async () => ({
  count: 173,
  patch: '26.20',
  champions: [
    { id: 24, name: 'Jax', key: 'Jax', image: 'Jax.png' },
    { id: 266, name: 'Aatrox', key: 'Aatrox', image: 'Aatrox.png' },
    { id: 804, name: 'Yunara', key: 'Yunara', image: 'Yunara.png' },
    { id: 51, name: 'Caitlyn', key: 'Caitlyn', image: 'Caitlyn.png' },
  ],
}));
ipcMain.handle('ddragon:get-catalog', async () => ({
  count: 173,
  patch: '26.20',
  champions: [],
}));
ipcMain.handle('ai:get-grounding-quota', async () => ({
  standardRequestsToday: 12,
  groundingAvailable: true,
  quotaNote: null,
}));
ipcMain.handle('lcu:get-pickable-champions', async () => [24, 266, 804, 51, 222, 555]);

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
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const screenshotsDir = path.join(__dirname, '../docs/screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // 1. Dashboard
  let img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(screenshotsDir, 'dashboard.png'), img.toPNG());

  // 2. Click Champ Select Tab
  await win.webContents.executeJavaScript(`
    try {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('SELECCIÓN'));
      if (btn) btn.click();
    } catch (e) {}
  `);
  await new Promise((resolve) => setTimeout(resolve, 800));
  img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(screenshotsDir, 'champselect.png'), img.toPNG());

  // 3. Click Settings Tab
  await win.webContents.executeJavaScript(`
    try {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('AJUSTES'));
      if (btn) btn.click();
    } catch (e) {}
  `);
  await new Promise((resolve) => setTimeout(resolve, 800));

  // Desplegar sección Avanzado
  await win.webContents.executeJavaScript(`
    try {
      const adv = Array.from(document.querySelectorAll('div')).find(d => d.textContent.includes('Avanzado / Diagnóstico'));
      if (adv) adv.click();
    } catch (e) {}
  `);
  await new Promise((resolve) => setTimeout(resolve, 600));

  img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(screenshotsDir, 'settings.png'), img.toPNG());

  console.log('Screenshots saved to docs/screenshots');
  app.quit();
});
