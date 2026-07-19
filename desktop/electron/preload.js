const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('soreChatNative', {
  onUpdateReady: (callback) => ipcRenderer.on('update-ready', callback),
  restartAndUpdate: () => ipcRenderer.send('restart-and-update'),
  setProxy: (proxyRule) => ipcRenderer.invoke('set-proxy', proxyRule),
  getProxy: () => ipcRenderer.invoke('get-proxy'),
  platform: process.platform,
});
