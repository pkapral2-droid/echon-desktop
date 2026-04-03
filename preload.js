const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('echonDesktop', {
  isDesktop: true,
  platform: process.platform,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  setPttKey: (keyCode) => ipcRenderer.send('set-ptt-key', keyCode),
  restartForUpdate: () => ipcRenderer.send('restart-for-update'),
  setFullscreen: (on) => ipcRenderer.send('window-fullscreen', on),
  isFullscreen: () => ipcRenderer.sendSync('window-is-fullscreen'),
  // High-fps screen capture
  showScreenPicker: () => ipcRenderer.invoke('show-screen-picker'),
});
