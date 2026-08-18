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
  publicarAtosAbertos: (atos: unknown[]) => ipcRenderer.invoke('atos:publicarAbertos', atos),
  listarAtosAbertos: () => ipcRenderer.invoke('atos:listarAbertos'),
  /** Alinha o nativeTheme e o menu da aplicação com a preferência salva. */
  informarTema: (tema: string) => ipcRenderer.invoke('tema:informar', tema),
  /** O item "Exibir → Tema" do menu mandou trocar o tema; devolve o cancelamento. */
  onTemaDefinido: (callback: (tema: string) => void) => {
    const ouvinte = (_event: unknown, tema: string) => callback(tema);
    ipcRenderer.on('tema:definir', ouvinte);
    return () => ipcRenderer.removeListener('tema:definir', ouvinte);
  },
});
