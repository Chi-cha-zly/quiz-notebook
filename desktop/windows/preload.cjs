'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// The one synchronous bootstrap is served from memory, after main-frame validation.
// This guarantees initialState exists before the unchanged deferred app.js runs.
const bootstrap = ipcRenderer.sendSync('quiz:bootstrap');
if (!bootstrap || bootstrap.error) throw new Error(bootstrap?.error || '无法读取本机记录。');
contextBridge.exposeInMainWorld('QuizNative', {
  initialState: bootstrap.initialState,
  request: (message) => ipcRenderer.invoke('quiz:request', message)
});
