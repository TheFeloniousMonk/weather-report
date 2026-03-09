const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('api', {
  // Dialog operations
  openMarkdownDialog: () => ipcRenderer.invoke('dialog:openMarkdown'),
  selectCSVDialog: () => ipcRenderer.invoke('dialog:selectCSV'),
  
  // File operations
  readCSV: (csvPath) => ipcRenderer.invoke('file:readCSV', csvPath),
  readMarkdown: (mdPath) => ipcRenderer.invoke('file:readMarkdown', mdPath),
  
  // Python execution
  runLoader: (options) => ipcRenderer.invoke('python:runLoader', options),
  onPythonProgress: (callback) => {
    ipcRenderer.on('python:progress', (event, data) => callback(data));
  },
  
  // Settings
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  
  // App info
  getPaths: () => ipcRenderer.invoke('app:getPaths'),
});
