const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcherAPI', {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },

  auth: {
    microsoft: () => ipcRenderer.invoke('auth:microsoft'),
    offline: (username) => ipcRenderer.invoke('auth:offline', username),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getSession: () => ipcRenderer.invoke('auth:getSession'),
    refresh: () => ipcRenderer.invoke('auth:refresh'),
  },

  game: {
    install: () => ipcRenderer.invoke('game:install'),
    isInstalled: () => ipcRenderer.invoke('game:isInstalled'),
    launch: () => ipcRenderer.invoke('game:launch'),
    repair: () => ipcRenderer.invoke('game:repair'),
    getSettings: () => ipcRenderer.invoke('game:getSettings'),
    updateSettings: (settings) => ipcRenderer.invoke('game:updateSettings', settings),
  },

  server: {
    getStatus: () => ipcRenderer.invoke('server:getStatus'),
    getNews: () => ipcRenderer.invoke('server:getNews'),
    getShopItems: () => ipcRenderer.invoke('server:getShopItems'),
    getGrades: () => ipcRenderer.invoke('server:getGrades'),
    getPlayerProfile: (username) => ipcRenderer.invoke('server:getPlayerProfile', username),
  },

  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getConfig: () => ipcRenderer.invoke('app:getConfig'),
    navigate: (page) => ipcRenderer.invoke('navigate', page),
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
    checkUpdate: () => ipcRenderer.invoke('updater:check'),
  },

  on: (channel, callback) => {
    const validChannels = [
      'install:progress',
      'launch:progress',
      'updater:checking',
      'updater:available',
      'updater:not-available',
      'updater:progress',
      'updater:downloaded',
      'updater:error',
    ];
    if (validChannels.includes(channel)) {
      const subscription = (_event, data) => callback(data);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
  },
});
