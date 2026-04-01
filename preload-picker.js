const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('picker', {
  selectSource: (sourceId) => ipcRenderer.send('screen-picker-select', sourceId),
});
