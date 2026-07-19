const { app, BrowserWindow, ipcMain, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

let mainWindow;

// ---------- Custom proxy support ----------
// Lets the person route Sore Chat's traffic through their own VPN/proxy
// server (SOCKS5 or HTTP). This is NOT a built-in VPN service - there's no
// bundled server - it just tells Chromium's networking stack to use a
// proxy the person already has running, the same way browsers do.
function proxyConfigPath() {
  return path.join(app.getPath('userData'), 'proxy-config.json');
}

function readSavedProxy() {
  try {
    const raw = fs.readFileSync(proxyConfigPath(), 'utf8');
    return JSON.parse(raw).proxyRules || '';
  } catch {
    return '';
  }
}

function writeSavedProxy(proxyRules) {
  try {
    fs.writeFileSync(proxyConfigPath(), JSON.stringify({ proxyRules }));
  } catch (err) {
    log.error('Failed to save proxy config:', err);
  }
}

async function applyProxy(proxyRules) {
  if (proxyRules) {
    await session.defaultSession.setProxy({ proxyRules });
  } else {
    await session.defaultSession.setProxy({ mode: 'direct' });
  }
}

ipcMain.handle('set-proxy', async (event, proxyRules) => {
  writeSavedProxy(proxyRules);
  await applyProxy(proxyRules);
  return true;
});

ipcMain.handle('get-proxy', async () => readSavedProxy());

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 860,
    minHeight: 560,
    backgroundColor: '#12131a',
    titleBarStyle: 'hiddenInset',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  const menu = Menu.buildFromTemplate([
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);

  mainWindow.webContents.on('did-finish-load', () => {
    // Every launch, silently check for updates. If found, they download
    // in the background and install automatically on next restart.
    autoUpdater.checkForUpdatesAndNotify();
  });
}

autoUpdater.on('update-downloaded', () => {
  mainWindow?.webContents.send('update-ready');
});

ipcMain.on('restart-and-update', () => {
  autoUpdater.quitAndInstall();
});

app.whenReady().then(async () => {
  const savedProxy = readSavedProxy();
  if (savedProxy) await applyProxy(savedProxy);
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
