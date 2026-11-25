'use strict';
// Cầu nối an toàn giữa giao diện game và Electron (contextIsolation bật, không lộ Node).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hachihiHost', {
  isElectron: true,
  getDisplay: () => ipcRenderer.invoke('display:info'),
  applyDisplay: (opts) => ipcRenderer.invoke('display:apply', opts),
  confirmDisplay: () => ipcRenderer.invoke('display:confirm'),
  revertDisplay: () => ipcRenderer.invoke('display:revert'),
  getMetrics: () => ipcRenderer.invoke('metrics'),
  assets: {
    manifest: () => ipcRenderer.invoke('assets:manifest'),
    status: () => ipcRenderer.invoke('assets:status'),
    verify: (pkg) => ipcRenderer.invoke('assets:verify', pkg),
    installFromFolder: () => ipcRenderer.invoke('assets:install-folder'),
    checkUpdates: () => ipcRenderer.invoke('assets:check-updates'),
    download: (pkg) => ipcRenderer.invoke('assets:download', pkg),
    remove: (pkg) => ipcRenderer.invoke('assets:remove', pkg),
    onProgress: (cb) => { ipcRenderer.removeAllListeners('assets:progress'); ipcRenderer.on('assets:progress', (_e, p) => cb(p)); },
  },
});
