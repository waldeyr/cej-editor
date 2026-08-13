import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Toolbar, TextCommand } from './components/Toolbar';
import { SidebarTree } from './components/SidebarTree';
import { EditorCanvas } from './components/EditorCanvas';
import { StatusBar } from './components/StatusBar';
import { ConfirmModal } from './components/ConfirmModal';
import { LinkModal } from './components/LinkModal';
import { OpenUrlModal } from './components/OpenUrlModal';
import { DocumentTitleModal } from './components/DocumentTitleModal';
import { InsertTableModal } from './components/InsertTableModal';
import { SaveAsModal, suggestedFileName } from './components/SaveAsModal';
import {
  LegislativeDocument,
  LegislativeBlock,
  ValidationIssue,
  BlockType,
  BlockAlign,
} from './types/legislative';
import { parseRtfToLegislativeDocument } from './parser/rtfParser';
import { serializeToPlanaltoHtml, deserializePlanaltoHtmlToDocument } from './parser/htmlSerializer';
import { completarEmentaDoDocx, prepararHtmlDoDocx } from './parser/docxHtml';
import { validateLegislativeDocument } from './validator/legislativeValidator';
import { detectAndDecode, encodeToBytes } from './utils/encoding';
import { useHistory } from './hooks/useHistory';
import { clearDraft, readDraft, writeDraft } from './utils/draft';
import {
  AnchorPoint,
  LinkChoice,
  collectAnchorPoints,
  createAnchorName,
  findAnchorBlock,
} from './utils/anchors';
import {
  DocPart,
  EDITABLE_TARGET_ATTR,
  GENERO_DA_PARTE,
  NOME_DA_PARTE,
  PARTES_PRELIMINARES,
  applyHtmlToTarget,
  assinaturaTarget,
  blockTarget,
  htmlToPlainText,
  isEmptyHtml,
  markOrdemExecucaoAsPlain,
  moverParaParte,
  partTarget,
  podeVirarParte,
  resolvedAlignForTarget,
  setAlignForTarget,
} from './utils/docTargets';
import {
  EditableSegment,
  InlineFormat,
  activeFormatsAtSelection,
  applyInlineFormat,
  clearFormatting,
  focusEditableTarget,
  getEditableSegments,
  readSegments,
  wrapInAnchorPoint,
  wrapInLink,
} from './utils/richText';
import {
  applyBlockType,
  blockTypeName,
  inicioDoAnexo,
  numberLabelForTypeAt,
  renumberBlocks,
} from './utils/blockTypes';
import mammoth from 'mammoth';

declare global {
  interface Window {
    electronAPI?: {
      saveFile: (content: Uint8Array | string, defaultName: string) => Promise<boolean>;
      openFile: () => Promise<{ filePath: string; buffer: Uint8Array } | null>;
      /** Baixa um endereço no processo principal, fora do alcance da política de origem. */
      fetchUrl?: (url: string) => Promise<{ ok: boolean; bytes?: Uint8Array; error?: string }>;
    };
  }
}

const IMPORT_ENCODING = {
  encoding: 'windows-1252' as const,
  declaredEncoding: 'ISO-8859-1',
  hasBom: false,
};

const NAMED_PARTS: readonly DocPart[] = ['epigrafe', 'ementa', 'preambulo', 'ordemExecucao', 'fecho'];

/**
 * Partes que abrem o ato. O que vem imediatamente abaixo delas na folha é o
 * primeiro dispositivo do corpo, e é lá que nasce o conteúdo pedido com o
 * cursor pousado numa delas.
 */
const OPENING_PART_TARGETS: readonly string[] = (
  ['epigrafe', 'ementa', 'preambulo', 'ordemExecucao'] as const
).map(partTarget);

/** Ação de arquivo que só pode prosseguir depois de decidir o destino do trabalho em curso. */
type PendingAction =
  | { kind: 'new' }
  | { kind: 'openHtml'; file: File }
  | { kind: 'openUrl'; url: string; bytes: Uint8Array }
  | { kind: 'importDoc'; file: File };

const createEmptyTableHtml = (rows: number, columns: number): string => {
  const headerCells = Array.from(
    { length: columns },
    () => '<th style="border: 1px solid #000; padding: 6px; text-align: left; vertical-align: top;">&nbsp;</th>'
  ).join('');

  const bodyRows = Array.from({ length: Math.max(rows - 1, 0) }, () => {
    const cells = Array.from(
      { length: columns },
      () => '<td style="border: 1px solid #000; padding: 6px; text-align: left; vertical-align: top;">&nbsp;</td>'
    ).join('');
    return `<tr>${cells}</tr>`;
  }).join('\n');

  return `<table border="1" cellpadding="4" cellspacing="0" class="MsoTableGrid" style="border-collapse: collapse; width: 100%; margin: 15px 0;"><tbody>\n<tr>${headerCells}</tr>\n${bodyRows}\n</tbody></table>`;
};

const INITIAL_DOC: LegislativeDocument = {
  title: 'DECRETO Nº 13.090, DE 4 DE AGOSTO DE 2026',
  epigrafe: 'DECRETO Nº 13.090, DE 4 DE AGOSTO DE 2026',
  ementa:
    'Altera o Decreto nº 11.353, de 1º de janeiro de 2023, que aprova a Estrutura Regimental e o Quadro Demonstrativo dos Cargos em Comissão e das Funções de Confiança do Ministério do Planejamento e Orçamento.',
  preambulo:
    '<b>O PRESIDENTE DA REPÚBLICA</b>, no uso da atribuição que lhe confere o art. 84, <i>caput</i>, inciso VI, alínea “a”, da Constituição,',
  ordemExecucao: '<b>DECRETA</b>:',
  blocks: [
    {
      id: 'block-1',
      type: 'ARTIGO',
      numberLabel: 'Art. 1º',
      content: 'Ficam remanejados, na forma do Anexo I, os seguintes Cargos Comissionados Executivos - CCE:',
      rawText: 'Ficam remanejados, na forma do Anexo I, os seguintes Cargos Comissionados Executivos - CCE:',
      linkName: 'art1',
    },
    {
      id: 'block-2',
      type: 'INCISO',
      numberLabel: 'I -',
      content: 'do Ministério do Planejamento e Orçamento para a Secretaria de Gestão e Inovação:',
      rawText: 'do Ministério do Planejamento e Orçamento para a Secretaria de Gestão e Inovação:',
    },
    {
      id: 'block-3',
      type: 'ALINEA',
      numberLabel: 'a)',
      content: 'dois CCE 1.17;',
      rawText: 'dois CCE 1.17;',
    },
    {
      id: 'block-4',
      type: 'ALINEA',
      numberLabel: 'b)',
      content: 'seis CCE 1.15;',
      rawText: 'seis CCE 1.15;',
    },
    {
      id: 'block-5',
      type: 'ARTIGO',
      numberLabel: 'Art. 2º',
      content: 'Ficam transformados CCE e FCE, nos termos da Lei nº 14.204, de 16 de setembro de 2021.',
      rawText: 'Ficam transformados CCE e FCE, nos termos da Lei nº 14.204, de 16 de setembro de 2021.',
      linkName: 'art2',
    },
    {
      id: 'block-6',
      type: 'ARTIGO',
      numberLabel: 'Art. 3º',
      content: 'Este Decreto entra em vigor na data de sua publicação.',
      rawText: 'Este Decreto entra em vigor na data de sua publicação.',
      linkName: 'art3',
    },
  ],
  fecho: 'Brasília, 4 de agosto de 2026; 205º da Independência e 138º da República.',
  assinaturas: ['LUIZ INÁCIO LULA DA SILVA', 'Esther Dweck', 'Simone Tebet'],
  encoding: 'windows-1252',
  declaredEncoding: 'ISO-8859-1',
};

/**
 * Documento com que o editor abre, e se ele traz trabalho da sessão anterior.
 *
 * O rascunho recuperado evita a perda de dados ao recarregar a página com
 * Ctrl+R. Distinguir o que veio dele do exemplo de partida importa depois: um
 * rascunho é trabalho que nunca chegou a um arquivo, e o editor precisa saber
 * disso para não descartá-lo calado quando pedirem um documento novo.
 */
const openingDocument = (): { doc: LegislativeDocument; restored: boolean } => {
  const draft = readDraft();
  if (draft) return { doc: { ...draft, ...IMPORT_ENCODING }, restored: true };
  return { doc: INITIAL_DOC, restored: false };
};

/** Traduz a posição selecionada na tela para o endereço do campo correspondente. */
const targetForSelectedId = (id?: string): string | undefined => {
  if (!id) return undefined;
  if (NAMED_PARTS.includes(id as DocPart)) return partTarget(id as DocPart);
  const assinatura = id.match(/^assinatura-(\d+)$/);
  if (assinatura) return assinaturaTarget(Number.parseInt(assinatura[1], 10));
  return blockTarget(id);
};

/** Campos alcançados pela seleção corrente — ou, sem seleção, o campo com o foco. */
const targetsInPlay = (): string[] => {
  const segments = getEditableSegments();
  if (segments.length > 0) return segments.map((segment) => segment.target);

  const active = document.activeElement as HTMLElement | null;
  const target = active?.getAttribute?.(EDITABLE_TARGET_ATTR);
  return target ? [target] : [];
};

export const App: React.FC = () => {
  /* Lido uma única vez: daí em diante quem manda é o documento em memória. */
  const [opening] = useState(openingDocument);
  const { state: doc, setState: setDoc, resetState: resetDoc, undo, redo, canUndo, canRedo } = useHistory(opening.doc);
  const [selectedBlockId, setSelectedBlockId] = useState<string | undefined>(doc.blocks[0]?.id);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [justSaved, setJustSaved] = useState<boolean>(false);
  const [activeFormats, setActiveFormats] = useState<InlineFormat[]>([]);
  const [activeTargets, setActiveTargets] = useState<string[]>([]);
  /** Recado passageiro na barra de estado — uma remissão sem destino, por exemplo. */
  const [notice, setNotice] = useState<string>('');

  /*
   * Última versão gravada ou aberta. A comparação é por identidade porque
   * useHistory devolve o mesmo objeto quando nada mudou de fato — é o que
   * permite perguntar sobre salvar apenas quando há trabalho a perder.
   *
   * Um rascunho recuperado começa sem versão limpa (`null`): ele é justamente
   * o trabalho que a sessão anterior não gravou em lugar nenhum, e tratá-lo
   * como já salvo faria o editor trocá-lo de documento sem perguntar nada.
   */
  const [cleanDoc, setCleanDoc] = useState<LegislativeDocument | null>(opening.restored ? null : opening.doc);
  const isDirty = doc !== cleanDoc;

  const docRef = useRef(doc);
  docRef.current = doc;

  /** Trecho selecionado no momento em que uma caixa de diálogo é aberta. */
  const heldSegmentsRef = useRef<EditableSegment[]>([]);

  /** Campos alcançados pelo cursor no momento em que a caixa da tabela é aberta. */
  const heldInsertionTargetsRef = useRef<string[] | null>(null);

  /**
   * Documento incluindo a edição ainda em curso.
   *
   * Os campos só devolvem o texto ao documento quando perdem o foco, de modo
   * que salvar logo depois de digitar gravava a versão anterior da frase. Aqui
   * o campo com o foco é lido antes de qualquer operação de arquivo.
   */
  const currentDoc = useCallback((): LegislativeDocument => {
    const active = document.activeElement as HTMLElement | null;
    const target = active?.getAttribute?.(EDITABLE_TARGET_ATTR);
    if (!active || !target) return docRef.current;

    const next = applyHtmlToTarget(docRef.current, target, active.innerHTML);
    if (JSON.stringify(next) === JSON.stringify(docRef.current)) return docRef.current;

    setDoc(next);
    return next;
  }, [setDoc]);

  // Atalhos globais: desfazer/refazer e formatação inline.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();

      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }

      if (key === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      const shortcut: Record<string, InlineFormat> = { b: 'bold', i: 'italic', u: 'underline' };
      if (shortcut[key] && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        applyFormatToSelection(shortcut[key]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  /*
   * Persistência automática em localStorage ao modificar o documento.
   *
   * O documento de abertura não é gravado: rascunho é trabalho em curso, e
   * gravar o exemplo de partida intacto criaria, no acesso seguinte, um
   * rascunho recuperado que ninguém escreveu — e com ele a pergunta sobre
   * salvar um ato que continua exatamente como nasceu.
   */
  useEffect(() => {
    if (doc === opening.doc) return;
    writeDraft(doc);
  }, [doc, opening.doc]);

  // Validação em Tempo Real
  useEffect(() => {
    const currentIssues = validateLegislativeDocument(doc);
    setIssues(currentIssues);
  }, [doc]);

  /*
   * A barra de comandos acompanha a seleção viva: os botões de formato acendem
   * conforme o trecho sob o cursor, e o alinhamento mostra o do campo em jogo.
   */
  useEffect(() => {
    const handleSelectionChange = () => {
      const formats = activeFormatsAtSelection();
      setActiveFormats((previous) => (previous.join() === formats.join() ? previous : formats));

      const targets = targetsInPlay();
      setActiveTargets((previous) => (previous.join() === targets.join() ? previous : targets));
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  // O aviso "Salvo" na barra de estado responde ao botão "Salvar".
  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [justSaved]);

  // Recados da barra de estado se apagam sozinhos: são resposta a um gesto, não estado.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const loadDocument = (loaded: LegislativeDocument) => {
    const prepared: LegislativeDocument = { ...loaded, ...IMPORT_ENCODING };
    setDoc(prepared);
    resetDoc(prepared);
    setCleanDoc(prepared);
    setSelectedBlockId(prepared.blocks[0]?.id);
  };

  // Importa RTF e DOCX, preservando o fluxo de classificacao legislativa existente.
  const importDocFile = async (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    const buffer = await file.arrayBuffer();

    if (extension === 'docx') {
      const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
      const preparo = prepararHtmlDoDocx(result.value);
      const importado = completarEmentaDoDocx(deserializePlanaltoHtmlToDocument(preparo.html));
      loadDocument(importado);

      /*
       * O recado conta o que entrou, porque a conversão de Word é a única que
       * pode sair calada e incompleta: o mammoth não lê cabeçalho nem rodapé, e
       * avisa por uma lista que ninguém via. Sem a conta, uma tabela perdida
       * passa despercebida até alguém reler o ato inteiro.
       */
      const tabelas = importado.blocks.filter((bloco) => bloco.type === 'TABELA').length;
      // A tabela é bloco como os outros: contá-la aqui e de novo adiante daria
      // o mesmo conteúdo duas vezes num recado que existe para conferir contas.
      const dispositivos = importado.blocks.length - tabelas;
      const avisos = result.messages.length;
      setNotice(
        [
          `Documento importado: ${dispositivos} ${dispositivos === 1 ? 'dispositivo' : 'dispositivos'}`,
          tabelas > 0 ? `${tabelas} ${tabelas === 1 ? 'tabela' : 'tabelas'}` : '',
          preparo.comentariosDescartados > 0
            ? `${preparo.comentariosDescartados} ${
                preparo.comentariosDescartados === 1 ? 'comentário' : 'comentários'
              } de revisão fora do ato`
            : '',
          avisos > 0 ? `${avisos} ${avisos === 1 ? 'aviso' : 'avisos'} de conversão` : '',
        ]
          .filter(Boolean)
          .join(', ') + '.'
      );
      return;
    }

    const decoded = detectAndDecode(new Uint8Array(buffer));
    if (extension === 'doc' && !decoded.text.trimStart().startsWith('{\\rtf')) {
      throw new Error(
        'Este arquivo .doc é do Word antigo, que o editor não lê. Abra-o no Word e salve como .docx ou .rtf.'
      );
    }

    loadDocument(parseRtfToLegislativeDocument(decoded.text));
  };

  /*
   * Abrir HTML Planalto com detecção adaptativa de encoding.
   *
   * O caminho é o mesmo para um arquivo do disco e para um ato baixado da
   * internet, e é de propósito: em ambos os casos o que chega são os bytes como
   * o servidor ou o disco os entregou, e é a detecção que decide a codificação.
   * Texto já decodificado pelo caminho traria os acentos do padrão
   * windows-1252 destruídos antes mesmo de o editor os ver.
   */
  const openHtmlBytes = (bytes: Uint8Array) => {
    const decoded = detectAndDecode(bytes);
    loadDocument(deserializePlanaltoHtmlToDocument(decoded.text));
  };

  const openHtmlFile = async (file: File) => {
    openHtmlBytes(new Uint8Array(await file.arrayBuffer()));
  };

  const runAction = (action: PendingAction) => {
    if (action.kind === 'new') {
      executeNewDoc();
      return;
    }

    if (action.kind === 'openUrl') {
      openHtmlBytes(action.bytes);
      return;
    }

    /*
     * A recusa de abrir vai para a barra de estado, como todo recado do
     * programa: uma caixa do navegador interrompe o trabalho, rouba o foco da
     * folha e ainda fala a língua do sistema operacional, não a do ofício.
     */
    const run = action.kind === 'openHtml' ? openHtmlFile(action.file) : importDocFile(action.file);
    void run.catch((error: unknown) => {
      setNotice(
        error instanceof Error ? error.message : 'Não foi possível abrir o arquivo escolhido.'
      );
    });
  };

  /*
   * Toda porta de entrada de documento passa por aqui. Antes, só o botão "Novo"
   * perguntava sobre salvar: abrir um HTML ou importar um RTF descartava em
   * silêncio o ato em edição.
   */
  const requestAction = (action: PendingAction) => {
    if (isDirty) {
      setPendingAction(action);
      return;
    }
    runAction(action);
  };

  const handleImportRtf = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) requestAction({ kind: 'importDoc', file });
  };

  const handleOpenHtml = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) requestAction({ kind: 'openHtml', file });
  };

  /**
   * Baixa um ato publicado na internet.
   *
   * No aplicativo de mesa quem busca é o processo principal, que não responde à
   * política de origem do navegador — é o que permite abrir um ato direto do
   * planalto.gov.br. Na versão web a busca sai da própria página e só chega a
   * servidores que autorizem a leitura de outra origem; quando não autorizam, o
   * erro diz isso em vez de deixar o usuário adivinhando.
   */
  const downloadHtml = async (url: string): Promise<Uint8Array> => {
    if (window.electronAPI?.fetchUrl) {
      const result = await window.electronAPI.fetchUrl(url);
      if (!result.ok || !result.bytes) {
        throw new Error(result.error || 'Não foi possível baixar o documento.');
      }
      return new Uint8Array(result.bytes);
    }

    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      throw new Error(
        'O navegador bloqueou a leitura desse endereço. Servidores como o planalto.gov.br não autorizam ' +
          'acesso de outra origem — use o aplicativo de mesa, ou baixe o arquivo e abra por "Abrir HTML".'
      );
    }

    if (!response.ok) {
      throw new Error(`O servidor respondeu ${response.status} ${response.statusText}.`);
    }
    return new Uint8Array(await response.arrayBuffer());
  };

  /*
   * O download vem antes da pergunta sobre o trabalho não salvo: não faz sentido
   * cobrar uma decisão sobre descartar o ato em edição enquanto ainda não se
   * sabe se o endereço responde.
   */
  const handleOpenUrl = async (url: string) => {
    const bytes = await downloadHtml(url);
    requestAction({ kind: 'openUrl', url, bytes });
  };

  // Procedimento Centralizado de Salvamento em Bytes (Electron / Web API / Blob Download)
  const performSaveFile = async (suggestedName?: string): Promise<boolean> => {
    const snapshot = currentDoc();
    const htmlContent = serializeToPlanaltoHtml(snapshot);
    const targetEncoding = 'windows-1252';
    const bytes = encodeToBytes(htmlContent, targetEncoding, snapshot.hasBom);
    const defaultName = suggestedName || suggestedFileName(snapshot.title);

    const markSaved = () => setCleanDoc(snapshot);

    // 1. Salvamento Nativo Electron (se executando no Desktop App)
    if (window.electronAPI) {
      try {
        const success = await window.electronAPI.saveFile(bytes, defaultName);
        if (success) markSaved();
        return success;
      } catch (e) {
        console.error('Erro ao salvar arquivo via Electron:', e);
      }
    }

    // 2. File System Access API Moderna (Chrome/Edge em contexto seguro)
    if ('showSaveFilePicker' in window) {
      try {
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: defaultName,
          types: [{ description: 'Arquivo HTML Planalto', accept: { 'text/html': ['.html', '.htm'] } }],
        });
        const writable = await fileHandle.createWritable();
        await writable.write(bytes);
        await writable.close();
        markSaved();
        return true;
      } catch (err) {
        if ((err as DOMException).name === 'AbortError') return false;
      }
    }

    // 3. Fallback Download Blob
    const mimeEncoding = snapshot.declaredEncoding || (targetEncoding === 'windows-1252' ? 'iso-8859-1' : targetEncoding);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: `text/html;charset=${mimeEncoding}` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(url);
    markSaved();
    return true;
  };

  /*
   * O <title> do arquivo salvo.
   *
   * Ele segue a epígrafe sozinho — é ela que nomeia o ato — até que alguém o
   * escreva à mão; daí em diante a marca `titleIsManual` protege a escolha das
   * correções seguintes na epígrafe. `currentDoc` entra aqui porque a epígrafe
   * pode estar sendo editada neste instante, e o título gravado tem de ser o
   * que se vê na tela.
   */
  const handleApplyTitle = (title: string) => {
    setDoc({ ...currentDoc(), title, titleIsManual: true });
  };

  const handleFollowEpigrafe = () => {
    const base = currentDoc();
    setDoc({
      ...base,
      title: htmlToPlainText(base.epigrafe) || base.title,
      titleIsManual: false,
    });
  };

  // Salvar HTML (sobrescreve com o nome atual)
  const handleSave = async () => {
    const saved = await performSaveFile();
    if (saved) setJustSaved(true);
  };

  /*
   * Salvar Como.
   *
   * Quem pergunta o nome é o seletor de gravação, quando ele existe: no
   * aplicativo de mesa e nos navegadores com `showSaveFilePicker`, abrir uma
   * caixa aqui faria a mesma pergunta duas vezes. A caixa do editor é para o
   * caminho da descarga direta, que grava sem perguntar nada.
   */
  const handleSaveAs = async () => {
    if (window.electronAPI || 'showSaveFilePicker' in window) {
      const saved = await performSaveFile();
      if (saved) setJustSaved(true);
      return;
    }

    setShowSaveAsModal(true);
  };

  const handleSaveAsName = async (fileName: string) => {
    const saved = await performSaveFile(fileName);
    if (saved) setJustSaved(true);
  };

  // Executa a criação de um Novo Documento Limpo
  const executeNewDoc = () => {
    clearDraft();
    loadDocument({
      title: 'NOVO DECRETO',
      epigrafe: 'DECRETO Nº 0.000, DE 1 DE JANEIRO DE 2026',
      ementa: 'Dispõe sobre ato normativo.',
      preambulo: '<b>O PRESIDENTE DA REPÚBLICA</b>, no uso da atribuição que lhe confere a Constituição,',
      ordemExecucao: '<b>DECRETA</b>:',
      blocks: [
        {
          id: `block-${Date.now()}`,
          type: 'ARTIGO',
          numberLabel: 'Art. 1º',
          content: 'Texto do primeiro artigo.',
          rawText: 'Texto do primeiro artigo.',
          linkName: 'art1',
        },
      ],
      fecho: 'Brasília, 1 de janeiro de 2026; 205º da Independência e 138º da República.',
      assinaturas: ['LUIZ INÁCIO LULA DA SILVA'],
      ...IMPORT_ENCODING,
    });
  };

  const handleConfirmSaveAndContinue = async () => {
    const action = pendingAction;
    const saved = await performSaveFile();
    if (saved && action) runAction(action);
    setPendingAction(null);
  };

  const handleConfirmDiscardAndContinue = () => {
    if (pendingAction) runAction(pendingAction);
    setPendingAction(null);
  };

  /**
   * Dispositivos que a seleção alcança.
   *
   * Com um trecho selecionado, são todos os que ele atravessa; com o cursor
   * pousado, o dispositivo que o abriga; sem foco algum na folha, o que está
   * marcado na lista lateral. As partes fixas do ato — epígrafe, ementa,
   * preâmbulo — ficam de fora: elas não são dispositivos e não têm tipo.
   */
  const blocksInPlay = (base: LegislativeDocument): string[] => {
    const reached = targetsInPlay()
      .filter((target) => target.startsWith('block:'))
      .map((target) => target.slice('block:'.length));

    if (reached.length > 0) return reached;
    return base.blocks.some((block) => block.id === selectedBlockId) ? [selectedBlockId!] : [];
  };

  /**
   * Onde entra o conteúdo novo: na linha imediatamente abaixo do cursor.
   *
   * O ponto de entrada vinha do dispositivo marcado na lista lateral, que diz
   * onde o usuário esteve e não onde ele está: escrever no Art. 8º e pedir uma
   * linha nova punha a linha embaixo do Art. 2º clicado minutos antes. Agora
   * quem manda é o campo com o cursor — o mesmo lugar em que Enter abriria a
   * linha. Com um trecho selecionado, ela nasce abaixo do último dispositivo
   * que o trecho alcança.
   *
   * Nas partes fixas não há dispositivo abaixo do cursor, e aí vale a posição
   * delas na folha: das que abrem o ato — epígrafe, ementa, preâmbulo, ordem de
   * execução — a linha nasce à frente do primeiro dispositivo; do fecho e das
   * assinaturas, ao fim do corpo. Sem cursor algum na folha, sobra a marca da
   * lista lateral.
   *
   * `targets` existe para quem passa por uma caixa de diálogo antes de inserir:
   * a caixa leva o foco embora, e aí o cursor a valer é o que foi lido no
   * clique, não o que sobrou depois.
   */
  const insertionIndexIn = (
    base: LegislativeDocument,
    targets: string[] = targetsInPlay()
  ): number => {
    // Cursor num dispositivo: a linha nasce logo abaixo dele.
    const reached = targets
      .filter((target) => target.startsWith('block:'))
      .map((target) => target.slice('block:'.length));
    const anchor = reached[reached.length - 1];
    const index = anchor ? base.blocks.findIndex((block) => block.id === anchor) : -1;
    if (index >= 0) return index + 1;

    // Cursor numa das partes que abrem o ato: à frente do primeiro dispositivo.
    if (targets.some((target) => OPENING_PART_TARGETS.includes(target))) return 0;

    /*
     * Cursor no fecho ou nas assinaturas: ao fim do corpo do ato — antes do
     * anexo, que na folha se desenha depois delas. Sem esse cuidado o
     * dispositivo novo nasceria no fim do anexo, longe de onde está o cursor.
     */
    const fimDoCorpo = inicioDoAnexo(base.blocks);
    if (targets.length > 0) return fimDoCorpo;

    // Sem cursor na folha: vale a marca da lista lateral.
    const selected = base.blocks.findIndex((block) => block.id === selectedBlockId);
    return selected >= 0 ? selected + 1 : fimDoCorpo;
  };

  /** Insere o bloco na linha abaixo do cursor. */
  const insertBlock = (
    newBlock: LegislativeBlock,
    base: LegislativeDocument = docRef.current,
    targets?: string[]
  ) => {
    const blocks = [...base.blocks];
    blocks.splice(insertionIndexIn(base, targets), 0, newBlock);
    setDoc({ ...base, blocks });
    setSelectedBlockId(newBlock.id);
  };

  /**
   * Cria um dispositivo novo abaixo do selecionado, vazio.
   *
   * Vazio de propósito: o dispositivo que nasce de um clique é lugar para
   * escrever, e não texto escrito. O campo em branco mostra na folha a frase de
   * espera que o CSS desenha (ver `[data-cej-target]:empty` em index.css) — ela
   * some ao primeiro caractere e nunca esteve no documento, ao contrário do
   * "Novo texto do dispositivo..." que era preciso selecionar e apagar antes de
   * redigir.
   *
   * Um botão só chega aqui por vontade própria: a linha sem formatação, que
   * existe para receber texto que ainda não tem forma. Os demais aplicam o tipo
   * ao que já está escrito — ver `handleApplyBlockType` — e recaem aqui apenas
   * quando não há dispositivo algum no corpo do ato.
   */
  const insertNewBlock = (type: BlockType, base: LegislativeDocument) => {
    const numberLabel = numberLabelForTypeAt(base.blocks, insertionIndexIn(base), type);
    const id = `block-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    insertBlock({ id, type, numberLabel, content: '', rawText: '' }, base);
    focusEditableTarget(blockTarget(id));
  };

  /**
   * Aplica um tipo de dispositivo ao trecho selecionado.
   *
   * É o mesmo gesto do negrito, um degrau acima: seleciona-se o texto e diz-se o
   * que ele é. Antes cada botão da barra de estrutura criava um dispositivo novo
   * com texto de exemplo, de modo que dar forma a um parágrafo já escrito era
   * trabalho manual de recortar e colar.
   *
   * Formatar não escreve: a conversão muda o tipo e o rótulo do dispositivo, e o
   * texto na folha continua sendo palavra por palavra o que o redator escreveu.
   * Fora dela fica apenas a linha sem formatação, que nasce vazia justamente
   * porque não há texto do qual ela possa nascer.
   */
  const handleApplyBlockType = (type: BlockType) => {
    // O campo com o foco pode estar sendo digitado neste instante, e é o texto
    // que está na tela que recebe o tipo.
    const base = currentDoc();

    if (type === 'TEXTO_LIVRE') {
      insertNewBlock(type, base);
      return;
    }

    const reached = blocksInPlay(base);
    if (reached.length === 0) {
      // Um ato sem dispositivo algum não tem o que converter: o primeiro nasce
      // aqui, vazio, com o rótulo que a posição lhe dá.
      if (base.blocks.length === 0) {
        insertNewBlock(type, base);
        return;
      }
      setNotice(`Selecione no corpo do ato o texto que deve virar ${blockTypeName(type)}.`);
      return;
    }

    const ids = new Set(reached);
    const blocks = applyBlockType(base.blocks, ids, type);
    const converted = blocks.filter((block, index) => block !== base.blocks[index]);

    if (converted.length === 0) {
      setNotice(`Nada a converter: o trecho selecionado já é ${blockTypeName(type)}.`);
      return;
    }

    setDoc({ ...base, blocks });
    if (!ids.has(selectedBlockId || '')) setSelectedBlockId(converted[0].id);
  };

  /**
   * Faz do texto selecionado a epígrafe, a ementa ou o preâmbulo.
   *
   * O gesto é o dos botões de estrutura — selecionar e dizer o que aquilo é —,
   * e por isso os botões ficam na mesma linha da barra. O que muda é o destino:
   * a parte fixa é campo do documento, não dispositivo, então o trecho sai da
   * lista de dispositivos ao entrar no campo.
   */
  const handleApplyPart = (part: DocPart) => {
    // O campo com o foco pode estar sendo digitado neste instante.
    const base = currentDoc();
    const destino = partTarget(part);
    const nome = NOME_DA_PARTE[part];
    // Vale pelo artigo definido e pela concordância do particípio.
    const genero = GENERO_DA_PARTE[part];

    /*
     * Só o cursor na folha comanda — a marca da Vista do Ato, não.
     *
     * Os botões de estrutura aceitam a marca da lista porque a conversão deixa
     * o dispositivo onde ele está: muda o tipo, e pronto. Este comando **tira**
     * o trecho da lista de dispositivos e ainda por cima reescreve um campo do
     * ato. Feito sem que ninguém tenha selecionado nada, é um salto grande
     * demais para desfazer de cabeça.
     */
    const alvos = targetsInPlay();

    if (alvos.length === 0) {
      setNotice(`Selecione na folha o texto que deve virar ${genero} ${nome.toLowerCase()}.`);
      return;
    }

    /*
     * Nem tudo o que está na folha pode virar parte fixa, e a recusa precisa
     * dizer qual é o impedimento — um botão que não faz nada e não explica leva
     * o redator a clicar de novo, mais forte.
     */
    const impedimento = alvos
      .map((alvo) => {
        if (alvo.startsWith('assinatura:')) return 'A assinatura não é texto do ato.';
        if (alvo.startsWith('part:') && !PARTES_PRELIMINARES.includes(alvo.slice(5) as DocPart)) {
          const outra = alvo.slice(5) as DocPart;
          return `${NOME_DA_PARTE[outra]} não se move por aqui: sem texto, ${GENERO_DA_PARTE[outra]} ${NOME_DA_PARTE[outra].toLowerCase()} sumiria da folha.`;
        }
        const bloco = base.blocks.find((candidato) => blockTarget(candidato.id) === alvo);
        if (bloco && !podeVirarParte(bloco)) {
          return bloco.type === 'TABELA'
            ? 'A tabela não pode virar parte do ato: ela deixaria de ser tabela.'
            : 'O anexo não pode virar parte do ato: é ele que marca onde o anexo começa.';
        }
        return '';
      })
      .find(Boolean);

    if (impedimento) {
      setNotice(impedimento);
      return;
    }

    const substituiu = !isEmptyHtml(base[part]);
    const novo = moverParaParte(base, part, alvos);

    if (novo === base) {
      setNotice(`Nada a mover: o trecho selecionado já é ${genero} ${nome.toLowerCase()}, ou está em branco.`);
      return;
    }

    // A marca da Vista do Ato não pode apontar para um dispositivo que saiu da
    // lista: sem isto, a trilha e a inserção passam a olhar para um id morto.
    if (!novo.blocks.some((bloco) => bloco.id === selectedBlockId)) {
      setSelectedBlockId(novo.blocks[0]?.id);
    }

    setDoc(novo);
    focusEditableTarget(destino);
    setNotice(
      substituiu
        ? `${nome} substituíd${genero}. O texto anterior volta com Ctrl+Z.`
        : `${nome} definid${genero}.`
    );
  };

  /**
   * Refaz a numeração pela ordem dos dispositivos no ato.
   *
   * Inserir um artigo no meio do texto acerta o número do que entrou e deixa os
   * seguintes um passo atrás — e o rótulo não é editável na folha. Este é o
   * comando que fecha o ciclo, e ele é explícito de propósito: renumerar por
   * conta própria a cada inserção reescreveria, calado, a numeração de um ato
   * que pode ter sido escrita à mão.
   *
   * Com um trecho selecionado, ele alcança apenas os dispositivos desse trecho;
   * sem seleção, o ato inteiro — que é o caso comum de quem acabou de inserir
   * um artigo e quer o resto acertado.
   */
  const handleRenumber = () => {
    const base = currentDoc();

    const selected = getEditableSegments()
      .map((segment) => segment.target)
      .filter((target) => target.startsWith('block:'))
      .map((target) => target.slice('block:'.length));

    const blocks = renumberBlocks(base.blocks, selected.length > 0 ? new Set(selected) : undefined);
    const changed = blocks.filter((block, index) => block !== base.blocks[index]).length;

    if (changed === 0) {
      setNotice('A numeração já acompanha a ordem dos dispositivos.');
      return;
    }

    setDoc({ ...base, blocks });
    setNotice(
      changed === 1 ? '1 dispositivo renumerado.' : `${changed} dispositivos renumerados.`
    );
  };

  /**
   * Retém o cursor antes de perguntar a medida da tabela.
   *
   * A caixa abre com o foco no campo de linhas, e com ele se desfaz a seleção na
   * folha: quando a medida enfim chegava, não havia mais cursor a consultar e a
   * tabela nascia onde a lista lateral apontasse — em geral no fim do ato. O
   * ponto de entrada é lido aqui, no clique, enquanto o cursor ainda está no
   * dispositivo, e fica retido até a inserção.
   */
  const handleOpenTableModal = () => {
    // O campo pode estar sendo digitado neste instante: o texto na tela é o que vale.
    currentDoc();
    heldInsertionTargetsRef.current = targetsInPlay();
    setShowTableModal(true);
  };

  const handleInsertTable = (rows: number, columns: number) => {
    const held = heldInsertionTargetsRef.current ?? undefined;
    heldInsertionTargetsRef.current = null;

    insertBlock(
      {
        id: `table-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        type: 'TABELA',
        content: createEmptyTableHtml(rows, columns),
        rawText: 'Tabela',
        tableRows: Array.from({ length: rows }, () => Array.from({ length: columns }, () => '')),
      },
      docRef.current,
      held
    );
  };

  /** Reordena o corpo do ato — usado pelo arrasto na Vista do Ato. */
  const handleReorderBlocks = (from: number, to: number) => {
    setDoc((prev) => {
      if (from < 0 || from >= prev.blocks.length) return prev;
      const blocks = [...prev.blocks];
      const [moved] = blocks.splice(from, 1);
      blocks.splice(from < to ? to - 1 : to, 0, moved);
      return { ...prev, blocks };
    });
  };

  const [showLinkModal, setShowLinkModal] = useState<boolean>(false);
  const [showUrlModal, setShowUrlModal] = useState<boolean>(false);
  const [showTitleModal, setShowTitleModal] = useState<boolean>(false);
  const [showTableModal, setShowTableModal] = useState<boolean>(false);
  const [showSaveAsModal, setShowSaveAsModal] = useState<boolean>(false);
  const [activeSelectionText, setActiveSelectionText] = useState<string>('');

  /**
   * Devolve ao documento o HTML dos campos que a operação acabou de alterar.
   *
   * `base` existe para as remissões internas: nomear o dispositivo de destino e
   * criar o link na origem são duas mudanças no mesmo documento, e precisam
   * entrar juntas — separadas, a segunda gravação apagaria a primeira.
   */
  const commitSegments = (
    segments: EditableSegment[],
    format?: TextCommand,
    base: LegislativeDocument = docRef.current
  ) => {
    let next = base;

    readSegments(segments).forEach(({ target, html }) => {
      const value =
        format === 'clearStyle' && target === partTarget('ordemExecucao')
          ? markOrdemExecucaoAsPlain(html)
          : html;
      next = applyHtmlToTarget(next, target, value);
      if (format === 'clearStyle') next = setAlignForTarget(next, target, undefined);
    });

    setDoc(next);
  };

  /**
   * Aplica um formato ao trecho selecionado, mesmo quando ele atravessa vários
   * dispositivos. É a razão de existir de utils/richText.ts: `execCommand` só
   * alcança o campo com o foco, e a folha do ato tem um campo por dispositivo.
   */
  const applyFormatToSelection = (format: InlineFormat) => {
    const segments = getEditableSegments();
    if (segments.length === 0) return;

    applyInlineFormat(segments, format);
    commitSegments(segments);
  };

  const handleFormatInline = (format: TextCommand) => {
    /*
     * Marcar um destino e criar a remissão que chega até ele são operações
     * distintas, e é aqui que elas se separam: a âncora acontece na hora, sobre
     * o trecho selecionado; o link precisa antes saber para onde vai.
     */
    if (format === 'anchor') {
      createAnchorPoint();
      return;
    }

    if (format === 'link') {
      const held = getEditableSegments();
      heldSegmentsRef.current = held;
      setActiveSelectionText(held.map((segment) => segment.range.toString()).join(''));
      setShowLinkModal(true);
      return;
    }

    const segments = getEditableSegments();
    if (segments.length === 0) {
      // Recado na barra de estado, como os demais: uma caixa modal para dizer
      // que falta selecionar texto interrompe o trabalho para nada e ainda
      // tira da folha o foco que o próximo gesto vai precisar.
      setNotice('Selecione no corpo do ato o trecho de texto a formatar.');
      return;
    }

    if (format === 'clearStyle') {
      clearFormatting(segments);
    } else {
      applyInlineFormat(segments, format);
    }

    commitSegments(segments, format);
  };

  /**
   * Marca o trecho selecionado como ponto de ancoragem.
   *
   * O nome sai do próprio trecho — "Anexo I" vira `#anexoi` — e é ele que a
   * caixa de remissão passa a oferecer como destino. Nada muda na aparência do
   * texto no arquivo salvo: um destino não é um link, e por isso a marca fica
   * só na folha, como afordância do editor.
   */
  const createAnchorPoint = () => {
    const segments = getEditableSegments();
    if (segments.length === 0) {
      setNotice('Selecione o trecho que servirá de ponto de ancoragem.');
      return;
    }

    // O nome vem do trecho que de fato recebe a marca: um ponto de ancoragem
    // pertence a um dispositivo, e é o primeiro da seleção que o abriga.
    const text = segments[0].range.toString();
    const name = createAnchorName(docRef.current, text);

    wrapInAnchorPoint(segments, name);
    commitSegments([segments[0]]);
    setNotice(`Ponto de ancoragem #${name} criado em “${text.slice(0, 40)}”.`);
  };

  /**
   * Aplica a remissão ao trecho retido antes de abrir a caixa de diálogo — a
   * seleção se desfaz ao clicar fora do documento, mas os intervalos guardados
   * continuam apontando para os mesmos nós.
   */
  const applyLink = (href: string) => {
    const segments = heldSegmentsRef.current;
    heldSegmentsRef.current = [];

    if (segments.length === 0) {
      setNotice('Selecione o trecho de texto que deve virar link.');
      return;
    }

    wrapInLink(segments, href);
    commitSegments(segments);
  };

  /** Destino escolhido na caixa: um ponto de ancoragem do ato ou um endereço. */
  const handleApplyLink = (choice: LinkChoice) => {
    applyLink(choice.kind === 'anchor' ? `#${choice.name}` : choice.href);
    setShowLinkModal(false);
  };

  /**
   * Segue uma remissão: rola a folha até o dispositivo apontado e o deixa
   * selecionado, de modo que a barra de estado passe a mostrar onde se chegou.
   * Um nome sem dono — remissão digitada à mão, ou destino excluído depois —
   * vira recado na barra de estado em vez de um clique que não faz nada.
   */
  const handleNavigateAnchor = (name: string) => {
    const block = findAnchorBlock(doc, name);
    if (!block) {
      setNotice(`Nenhum ponto de ancoragem responde por #${name}.`);
      return;
    }

    setSelectedBlockId(block.id);

    /*
     * O ponto marcado à mão está no meio do texto e é para lá que se vai; as
     * âncoras de bloco, que o importador numera por artigo, não têm marca na
     * folha, e aí o destino é o próprio dispositivo.
     */
    const spot =
      document.querySelector<HTMLElement>(`.folha a[name="${CSS.escape(name)}"]`) ||
      document.getElementById(`block-${block.id}`);
    if (!spot) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    spot.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  };

  /**
   * Alinhamento: propriedade do parágrafo, gravada no bloco e no HTML exportado.
   *
   * Vale para todos os campos que a seleção atravessa — selecionar do meio de um
   * artigo até o meio do seguinte e centralizar alinha os dois, como em qualquer
   * editor de texto. `targetsInPlay`, lido a cada mudança de seleção, é quem diz
   * quais são eles; sem seleção alguma, o alinhamento cai sobre o dispositivo
   * marcado na lista lateral.
   *
   * A leitura passa por `currentDoc` porque o campo com o foco pode estar sendo
   * digitado neste instante: sem isso, o alinhamento devolveria à folha a versão
   * anterior da frase, desfazendo o que o usuário acabou de escrever.
   */
  const handleAlign = (align: BlockAlign) => {
    const targets = activeTargets.length > 0 ? activeTargets : [targetForSelectedId(selectedBlockId)];
    const valid = targets.filter((target): target is string => Boolean(target));
    if (valid.length === 0) return;

    let next = currentDoc();
    valid.forEach((target) => {
      next = setAlignForTarget(next, target, align);
    });
    setDoc(next);
  };

  /*
   * O botão aceso é o alinhamento que o campo tem de fato — inclusive quando
   * ele vem do padrão da parte (assinaturas centralizadas, por exemplo) e não
   * de uma escolha explícita do usuário.
   */
  const activeAlign = useMemo(() => {
    const target = activeTargets[0] || targetForSelectedId(selectedBlockId);
    return target ? resolvedAlignForTarget(doc, target) : undefined;
  }, [activeTargets, selectedBlockId, doc]);

  const anchorPoints: AnchorPoint[] = useMemo(() => collectAnchorPoints(doc), [doc]);

  const issueCount = {
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
  };

  // Endereço legislativo da posição corrente, exibido na barra de estado.
  const position = useMemo(() => {
    if (!selectedBlockId) return undefined;

    const namedParts: Record<string, string> = {
      epigrafe: 'Epígrafe',
      ementa: 'Ementa',
      preambulo: 'Preâmbulo',
      ordemExecucao: 'Ordem de execução',
      fecho: 'Fecho',
    };
    if (namedParts[selectedBlockId]) return namedParts[selectedBlockId];
    if (selectedBlockId.startsWith('assinatura')) return 'Assinaturas';

    const block = doc.blocks.find((b) => b.id === selectedBlockId);
    if (!block) return undefined;
    if (block.numberLabel) return block.numberLabel;
    if (block.type === 'TABELA') return 'Tabela';
    if (block.type === 'OMISSIS') return 'Omissis';
    if (block.type === 'ALTERACAO') return 'Alteração';
    if (block.type === 'TEXTO_LIVRE') return 'Novo conteúdo';
    return undefined;
  }, [selectedBlockId, doc.blocks]);

  const pendingCopy: Record<PendingAction['kind'], { title: string; message: string }> = {
    new: {
      title: 'Criar novo documento',
      message: 'O ato em edição tem alterações não salvas. Deseja salvá-las antes de começar um documento novo?',
    },
    openHtml: {
      title: 'Abrir outro documento',
      message: 'O ato em edição tem alterações não salvas. Deseja salvá-las antes de abrir o arquivo escolhido?',
    },
    openUrl: {
      title: 'Abrir documento baixado',
      message: 'O ato em edição tem alterações não salvas. Deseja salvá-las antes de abrir o documento baixado?',
    },
    importDoc: {
      title: 'Importar documento',
      message: 'O ato em edição tem alterações não salvas. Deseja salvá-las antes de importar o arquivo escolhido?',
    },
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-tinta overflow-hidden select-none">
      {/* Barra de Comandos */}
      <Toolbar
        documentTitle={doc.title || htmlToPlainText(doc.epigrafe)}
        onEditTitle={() => setShowTitleModal(true)}
        onNew={() => requestAction({ kind: 'new' })}
        onImportRtf={handleImportRtf}
        onOpenHtml={handleOpenHtml}
        onOpenUrl={() => setShowUrlModal(true)}
        onInsertTable={handleOpenTableModal}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onApplyBlockType={handleApplyBlockType}
        onApplyPart={handleApplyPart}
        onRenumber={handleRenumber}
        onFormatInline={handleFormatInline}
        onAlign={handleAlign}
        activeFormats={activeFormats}
        activeAlign={activeAlign}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      {/* Área Central: Árvore + Canvas */}
      <div className="flex-1 flex overflow-hidden w-full select-text">
        <SidebarTree
          doc={doc}
          selectedBlockId={selectedBlockId}
          onSelectBlock={(id) => {
            setSelectedBlockId(id);
            const el = document.getElementById(`block-${id}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          onReorderBlocks={handleReorderBlocks}
          issues={issues}
          isOpen={sidebarOpen}
        />

        <EditorCanvas
          doc={doc}
          onUpdateDoc={setDoc}
          selectedBlockId={selectedBlockId}
          onSelectBlock={setSelectedBlockId}
          issues={issues}
          onNavigateAnchor={handleNavigateAnchor}
          onInsertAnchor={() => handleFormatInline('anchor')}
          onInsertLink={() => handleFormatInline('link')}
        />
      </div>

      {/* Barra de Estado do Documento */}
      <StatusBar
        declaredEncoding={doc.declaredEncoding}
        blockCount={doc.blocks.length}
        issueCount={issueCount}
        position={position}
        justSaved={justSaved}
        notice={notice}
      />

      {/* Confirmação antes de trocar o documento em edição */}
      <ConfirmModal
        isOpen={pendingAction !== null}
        title={pendingAction ? pendingCopy[pendingAction.kind].title : ''}
        message={pendingAction ? pendingCopy[pendingAction.kind].message : ''}
        onSaveAndContinue={handleConfirmSaveAndContinue}
        onDiscardAndContinue={handleConfirmDiscardAndContinue}
        onCancel={() => setPendingAction(null)}
      />

      {/* O <title> do arquivo salvo */}
      <DocumentTitleModal
        isOpen={showTitleModal}
        title={doc.title}
        suggested={htmlToPlainText(doc.epigrafe)}
        isManual={Boolean(doc.titleIsManual)}
        onApply={handleApplyTitle}
        onFollowEpigrafe={handleFollowEpigrafe}
        onClose={() => setShowTitleModal(false)}
      />

      {/* Endereço de um ato publicado na internet */}
      <OpenUrlModal
        isOpen={showUrlModal}
        onSubmit={handleOpenUrl}
        onClose={() => setShowUrlModal(false)}
      />

      {/* Medida da tabela a inserir */}
      <InsertTableModal
        isOpen={showTableModal}
        onInsert={handleInsertTable}
        onClose={() => setShowTableModal(false)}
      />

      {/* Nome do arquivo, quando o sistema não pergunta */}
      <SaveAsModal
        isOpen={showSaveAsModal}
        suggested={suggestedFileName(doc.title)}
        onSubmit={handleSaveAsName}
        onClose={() => setShowSaveAsModal(false)}
      />

      {/* Para onde o trecho selecionado vai levar */}
      <LinkModal
        isOpen={showLinkModal}
        anchors={anchorPoints}
        selectedText={activeSelectionText}
        onSelectLink={handleApplyLink}
        onClose={() => setShowLinkModal(false)}
      />
    </div>
  );
};
