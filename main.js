const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');

const AuthManager = require('./src/auth/AuthManager');
const MinecraftInstaller = require('./src/installer/MinecraftInstaller');
const ServerManager = require('./src/server/ServerManager');

log.transports.file.level = 'info';
autoUpdater.logger = log;

let mainWindow = null;
let authManager = null;
let minecraftInstaller = null;
let serverManager = null;

const LAUNCHER_CONFIG = {
  width: 1280,
  height: 720,
  minWidth: 1024,
  minHeight: 600,
  title: 'PalaCraft Launcher',
  gameDir: path.join(app.getPath('appData'), '.palacraft'),
  mcVersion: '1.7.10',
  forgeVersion: '10.13.4.1614',
  serverIp: 'play.palacraft.fr',
  serverPort: 25565,
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: LAUNCHER_CONFIG.width,
    height: LAUNCHER_CONFIG.height,
    minWidth: LAUNCHER_CONFIG.minWidth,
    minHeight: LAUNCHER_CONFIG.minHeight,
    title: LAUNCHER_CONFIG.title,
    frame: false,
    transparent: false,
    resizable: true,
    backgroundColor: '#1a1a2e',
    icon: path.join(__dirname, 'src', 'assets', 'images', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'ui', 'pages', 'login.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function initManagers() {
  authManager = new AuthManager(LAUNCHER_CONFIG);
  minecraftInstaller = new MinecraftInstaller(LAUNCHER_CONFIG);
  serverManager = new ServerManager(LAUNCHER_CONFIG);
}

function setupIPC() {
  ipcMain.handle('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.handle('window:close', () => {
    if (mainWindow) mainWindow.close();
  });

  ipcMain.handle('auth:microsoft', async () => {
    try {
      const result = await authManager.loginMicrosoft();
      return { success: true, data: result };
    } catch (error) {
      log.error('Microsoft auth failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:offline', async (_event, username) => {
    try {
      const result = await authManager.loginOffline(username);
      return { success: true, data: result };
    } catch (error) {
      log.error('Offline auth failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    try {
      await authManager.logout();
      return { success: true };
    } catch (error) {
      log.error('Logout failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:getSession', async () => {
    try {
      const session = authManager.getSession();
      return { success: true, data: session };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:refresh', async () => {
    try {
      const result = await authManager.refreshSession();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('game:install', async () => {
    try {
      const sendProgress = (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('install:progress', progress);
        }
      };
      await minecraftInstaller.installGame(sendProgress);
      return { success: true };
    } catch (error) {
      log.error('Installation failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('game:isInstalled', async () => {
    try {
      const installed = await minecraftInstaller.isGameInstalled();
      return { success: true, data: installed };
    } catch (error) {
      return { success: false, data: false };
    }
  });

  ipcMain.handle('game:launch', async () => {
    try {
      const session = authManager.getSession();
      if (!session) {
        return { success: false, error: 'Non authentifié' };
      }
      const sendProgress = (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('launch:progress', progress);
        }
      };
      await minecraftInstaller.launchGame(session, sendProgress);
      return { success: true };
    } catch (error) {
      log.error('Launch failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('game:repair', async () => {
    try {
      const sendProgress = (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('install:progress', progress);
        }
      };
      await minecraftInstaller.repairGame(sendProgress);
      return { success: true };
    } catch (error) {
      log.error('Repair failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('game:getSettings', async () => {
    try {
      const settings = minecraftInstaller.getSettings();
      return { success: true, data: settings };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('game:updateSettings', async (_event, settings) => {
    try {
      minecraftInstaller.updateSettings(settings);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('server:getStatus', async () => {
    try {
      const status = await serverManager.getServerStatus();
      return { success: true, data: status };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('server:getNews', async () => {
    try {
      const news = serverManager.getNews();
      return { success: true, data: news };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('server:getShopItems', async () => {
    try {
      const items = serverManager.getShopItems();
      return { success: true, data: items };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('server:getGrades', async () => {
    try {
      const grades = serverManager.getGrades();
      return { success: true, data: grades };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('server:getPlayerProfile', async (_event, username) => {
    try {
      const profile = serverManager.getPlayerProfile(username);
      return { success: true, data: profile };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('navigate', (_event, page) => {
    if (mainWindow) {
      const pagePath = path.join(__dirname, 'src', 'ui', 'pages', `${page}.html`);
      mainWindow.loadFile(pagePath);
    }
  });

  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:getConfig', () => {
    return LAUNCHER_CONFIG;
  });

  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Sélectionner le dossier d\'installation',
    });
    if (result.canceled) return { success: false };
    return { success: true, data: result.filePaths[0] };
  });
}

function setupAutoUpdater() {
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
    sendToRenderer('updater:checking');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info);
    sendToRenderer('updater:available', info);
  });

  autoUpdater.on('update-not-available', () => {
    log.info('Update not available');
    sendToRenderer('updater:not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('updater:progress', progress);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info);
    sendToRenderer('updater:downloaded', info);
  });

  autoUpdater.on('error', (error) => {
    log.error('Auto-updater error:', error);
    sendToRenderer('updater:error', error.message);
  });
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

app.whenReady().then(() => {
  initManagers();
  createWindow();
  setupIPC();
  setupAutoUpdater();

  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      log.warn('Auto-update check failed:', err.message);
    });
  }, 3000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

process.on('uncaughtException', (error) => {
  log.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason);
});
