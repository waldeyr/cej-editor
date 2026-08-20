import { AtoAberto } from '../utils/anchors';
import { Tema } from '../utils/tema';

declare global {
  interface Window {
    electronAPI?: {
      /** Pergunta onde gravar e devolve o caminho escolhido — é ele que nomeia a aba. */
      saveFile: (
        content: Uint8Array | string,
        defaultName: string,
        caminhoAtual?: string
      ) => Promise<{ ok: boolean; caminho?: string; cancelado?: boolean; erro?: string }>;
      /** Grava por cima do arquivo de origem, sem diálogo. */
      gravarArquivo?: (
        caminho: string,
        content: Uint8Array | string
      ) => Promise<{ ok: boolean; erro?: string }>;
      openFile: () => Promise<{ filePath: string; buffer: Uint8Array } | null>;
      openRecentFile?: (caminho: string) => Promise<{ filePath: string; buffer: Uint8Array } | null>;
      /** Baixa um endereço no processo principal, fora do alcance da política de origem. */
      fetchUrl?: (url: string) => Promise<{ ok: boolean; bytes?: Uint8Array; error?: string }>;
      /** Abre uma janela nova — o navegador já faz isto arrastando a aba para fora. */
      abrirNovaJanela?: () => Promise<{ ok: boolean }>;
      /** Publica os destinos abertos nesta janela, sem transferir o conteúdo dos atos. */
      publicarAtosAbertos?: (atos: AtoAberto[]) => Promise<void>;
      /** Lê os destinos publicados pelas outras janelas abertas. */
      listarAtosAbertos?: () => Promise<AtoAberto[]>;
      /** Alinha o `nativeTheme` do processo principal com a preferência salva. */
      informarTema?: (tema: Tema) => Promise<void>;
      /** O item "Exibir → Tema" do menu da aplicação mandou trocar o tema. */
      onTemaDefinido?: (callback: (tema: Tema) => void) => () => void;
      onArquivoMenu?: (callback: (comando: 'novo' | 'abrir' | 'abrirUrl') => void) => () => void;
      onArquivoRecente?: (callback: (caminho: string) => void) => () => void;
    };
  }
}

export {};
