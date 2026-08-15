import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'CEJ-EDITOR - Editor de Atos Normativos',
    icon: path.join(__dirname, '../public/brasao.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

const paraBuffer = (content: Uint8Array | string) =>
  typeof content === 'string' ? Buffer.from(content, 'utf-8') : Buffer.from(content);

/*
 * A janela que pediu o diálogo — e não uma referência global.
 *
 * Com mais de uma janela aberta, o `mainWindow` de módulo penduraria o diálogo
 * de gravação da segunda janela na primeira, que nem sabe do que se trata.
 */
const janelaDe = (event: Electron.IpcMainInvokeEvent) =>
  BrowserWindow.fromWebContents(event.sender) ?? mainWindow;

/**
 * Pergunta onde gravar, grava, e **devolve o caminho escolhido**.
 *
 * O retorno era um booleano, e o caminho se perdia aqui dentro: por isso
 * "Salvar" abria o seletor toda vez, sem nunca aprender de que arquivo o ato
 * veio. É esse caminho que dá nome à aba e que serve de origem ao cálculo da
 * remissão relativa para outro ato.
 */
ipcMain.handle(
  'dialog:saveFile',
  async (event, content: Uint8Array | string, defaultName: string, caminhoAtual?: string) => {
    const janela = janelaDe(event);
    if (!janela) return { ok: false };

    const { filePath, canceled } = await dialog.showSaveDialog(janela, {
      defaultPath: caminhoAtual || defaultName,
      filters: [
        { name: 'HTML Planalto', extensions: ['html', 'htm'] },
        { name: 'Todos os Arquivos', extensions: ['*'] },
      ],
    });

    if (canceled || !filePath) return { ok: false, cancelado: true };

    try {
      fs.writeFileSync(filePath, paraBuffer(content));
      return { ok: true, caminho: filePath };
    } catch (error) {
      return { ok: false, erro: error instanceof Error ? error.message : 'Não foi possível gravar.' };
    }
  }
);

/** Grava por cima do arquivo de onde o ato veio, sem perguntar nada. */
ipcMain.handle('arquivo:gravar', async (_event, caminho: string, content: Uint8Array | string) => {
  if (!caminho || !path.isAbsolute(caminho)) {
    return { ok: false, erro: 'Caminho de arquivo inválido.' };
  }

  try {
    fs.writeFileSync(caminho, paraBuffer(content));
    return { ok: true };
  } catch (error) {
    return { ok: false, erro: error instanceof Error ? error.message : 'Não foi possível gravar.' };
  }
});

/** Teto de download: um ato normativo em HTML não passa de alguns megabytes. */
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

/*
 * Baixa um ato publicado na internet.
 *
 * A busca acontece aqui, e não na página, por dois motivos. O primeiro é que o
 * navegador só lê de outra origem com autorização do servidor, e o planalto.gov.br
 * não a concede — dentro do aplicativo essa política não se aplica. O segundo é
 * o encoding: o retorno são os bytes crus, nunca texto já decodificado, porque
 * é a detecção adaptativa do editor que decide se o arquivo é windows-1252 ou
 * UTF-8, exatamente como faz com um arquivo do disco.
 */
ipcMain.handle('net:fetchUrl', async (_, url: string) => {
  let address: URL;
  try {
    address = new URL(url);
  } catch {
    return { ok: false, error: 'Endereço inválido.' };
  }

  // Só http(s): o processo principal lê o que lhe pedirem, e file:// aqui abriria
  // ao documento em edição uma porta para o disco da máquina.
  if (address.protocol !== 'http:' && address.protocol !== 'https:') {
    return { ok: false, error: 'Apenas endereços http:// e https:// podem ser baixados.' };
  }

  try {
    const response = await fetch(address.href, { redirect: 'follow' });
    if (!response.ok) {
      return { ok: false, error: `O servidor respondeu ${response.status} ${response.statusText}.` };
    }

    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > MAX_DOWNLOAD_BYTES) {
      return { ok: false, error: 'O arquivo é grande demais para ser aberto como ato normativo.' };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_DOWNLOAD_BYTES) {
      return { ok: false, error: 'O arquivo é grande demais para ser aberto como ato normativo.' };
    }

    return { ok: true, bytes: new Uint8Array(buffer) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Não foi possível baixar o endereço.',
    };
  }
});

// IPC Handler para Abrir Arquivo Nativo (retorna buffer binario bruto)
ipcMain.handle('dialog:openFile', async (event) => {
  const janela = janelaDe(event);
  if (!janela) return null;
  const { filePaths } = await dialog.showOpenDialog(janela, {
    properties: ['openFile'],
    filters: [
      { name: 'Documentos Legislativos', extensions: ['rtf', 'doc', 'docx', 'html', 'htm'] },
      { name: 'Todos os Arquivos', extensions: ['*'] },
    ],
  });

  if (filePaths && filePaths.length > 0) {
    const filePath = filePaths[0];
    const buffer = fs.readFileSync(filePath);
    return { filePath, buffer: new Uint8Array(buffer) };
  }
  return null;
});
