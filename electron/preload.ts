import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (content: Uint8Array | string, defaultName: string, caminhoAtual?: string) =>
    ipcRenderer.invoke('dialog:saveFile', content, defaultName, caminhoAtual),
  /** Grava por cima do arquivo de onde o ato veio, sem diálogo. */
  gravarArquivo: (caminho: string, content: Uint8Array | string) =>
    ipcRenderer.invoke('arquivo:gravar', caminho, content),
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  fetchUrl: (url: string) => ipcRenderer.invoke('net:fetchUrl', url),
  /** Abre uma janela nova — o navegador já faz isto arrastando a aba para fora. */
  abrirNovaJanela: () => ipcRenderer.invoke('janela:nova'),
});
