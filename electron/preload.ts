import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (content: Uint8Array | string, defaultName: string) => ipcRenderer.invoke('dialog:saveFile', content, defaultName),
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  fetchUrl: (url: string) => ipcRenderer.invoke('net:fetchUrl', url),
});
