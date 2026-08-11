import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Toolbar, TextCommand } from './components/Toolbar';
import { SidebarTree } from './components/SidebarTree';
import { EditorCanvas } from './components/EditorCanvas';
import { StatusBar } from './components/StatusBar';
import { ConfirmModal } from './components/ConfirmModal';
import { LinkModal } from './components/LinkModal';
import { OpenUrlModal } from './components/OpenUrlModal';
import { DocumentTitleModal } from './components/DocumentTitleModal';
import {
  LegislativeDocument,
  LegislativeBlock,
  ValidationIssue,
  BlockType,
  BlockAlign,
} from './types/legislative';
import { parseRtfToLegislativeDocument } from './parser/rtfParser';
import { serializeToPlanaltoHtml, deserializePlanaltoHtmlToDocument } from './parser/htmlSerializer';
import { validateLegislativeDocument } from './validator/legislativeValidator';
import { detectAndDecode, encodeToBytes } from './utils/encoding';
import { useHistory } from './hooks/useHistory';
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
  applyHtmlToTarget,
  assinaturaTarget,
  blockTarget,
  htmlToPlainText,
  markOrdemExecucaoAsPlain,
  partTarget,
  resolvedAlignForTarget,
  setAlignForTarget,
} from './utils/docTargets';
import {
  EditableSegment,
  InlineFormat,
  activeFormatsAtSelection,
  applyInlineFormat,
  clearFormatting,
  getEditableSegments,
  readSegments,
  wrapInAnchorPoint,
  wrapInLink,
} from './utils/richText';
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

const DRAFT_STORAGE_KEY = 'sagitario_editor_draft';
const IMPORT_ENCODING = {
  encoding: 'windows-1252' as const,
  declaredEncoding: 'ISO-8859-1',
  hasBom: false,
};

const NAMED_PARTS: readonly DocPart[] = ['epigrafe', 'ementa', 'preambulo', 'ordemExecucao', 'fecho'];

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
 * Carrega o rascunho salvo do localStorage (evitando a perda de dados ao recarregar a página com Ctrl+R).
 */
const getInitialDoc = (): LegislativeDocument => {
  try {
    const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.epigrafe && Array.isArray(parsed.blocks)) {
        return { ...parsed, ...IMPORT_ENCODING };
      }
    }
  } catch (e) {
    console.warn('Erro ao carregar rascunho do localStorage:', e);
  }
  return INITIAL_DOC;
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
  const { state: doc, setState: setDoc, resetState: resetDoc, undo, redo, canUndo, canRedo } = useHistory(getInitialDoc());
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
   */
  const [cleanDoc, setCleanDoc] = useState<LegislativeDocument>(doc);
  const isDirty = doc !== cleanDoc;

  const docRef = useRef(doc);
  docRef.current = doc;

  /** Trecho selecionado no momento em que uma caixa de diálogo é aberta. */
  const heldSegmentsRef = useRef<EditableSegment[]>([]);

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

  // Persistência Automática em localStorage ao modificar o documento
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(doc));
    } catch (e) {
      console.warn('Erro ao salvar rascunho no localStorage:', e);
    }
  }, [doc]);

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
      loadDocument(deserializePlanaltoHtmlToDocument(result.value));
      return;
    }

    const decoded = detectAndDecode(new Uint8Array(buffer));
    if (extension === 'doc' && !decoded.text.trimStart().startsWith('{\\rtf')) {
      throw new Error('Arquivos .doc binarios nao sao suportados. Converta o documento para .docx ou .rtf e tente novamente.');
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

    const run = action.kind === 'openHtml' ? openHtmlFile(action.file) : importDocFile(action.file);
    void run.catch((error: unknown) => {
      console.error('Erro ao abrir documento:', error);
      alert(error instanceof Error ? error.message : 'Nao foi possivel abrir o documento selecionado.');
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
    const defaultName = suggestedName || `${snapshot.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.html`;

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

  // Salvar Como (permite escolher o nome do arquivo)
  const handleSaveAs = async () => {
    const nome = prompt(
      'Nome do arquivo para salvar (sem extensão):',
      doc.title.replace(/[^a-zA-Z0-9\s]/g, '').trim() || 'ato_normativo'
    );
    if (!nome) return;
    const defaultName = `${nome.trim().toLowerCase().replace(/\s+/g, '_')}.html`;
    await performSaveFile(defaultName);
  };

  // Executa a criação de um Novo Documento Limpo
  const executeNewDoc = () => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
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

  /** Insere o bloco logo abaixo do dispositivo selecionado, ou ao fim do ato. */
  const insertBlock = (newBlock: LegislativeBlock) => {
    setDoc((prev) => {
      const index = prev.blocks.findIndex((b) => b.id === selectedBlockId);
      const blocks = [...prev.blocks];
      blocks.splice(index >= 0 ? index + 1 : blocks.length, 0, newBlock);
      return { ...prev, blocks };
    });
    setSelectedBlockId(newBlock.id);
  };

  // Adicionar Bloco
  const handleAddBlock = (type: BlockType) => {
    let numberLabel = '';
    if (type === 'PARTE') {
      const count = doc.blocks.filter((b) => b.type === 'PARTE').length + 1;
      numberLabel = `PARTE ${count}`;
    } else if (type === 'LIVRO') {
      const count = doc.blocks.filter((b) => b.type === 'LIVRO').length + 1;
      numberLabel = `LIVRO ${count}`;
    } else if (type === 'TITULO') {
      const count = doc.blocks.filter((b) => b.type === 'TITULO').length + 1;
      numberLabel = `TÍTULO ${count}`;
    } else if (type === 'SUBTITULO') {
      const count = doc.blocks.filter((b) => b.type === 'SUBTITULO').length + 1;
      numberLabel = `SUBTÍTULO ${count}`;
    } else if (type === 'CAPITULO') {
      const count = doc.blocks.filter((b) => b.type === 'CAPITULO').length + 1;
      numberLabel = `CAPÍTULO ${count}`;
    } else if (type === 'SECAO') {
      const count = doc.blocks.filter((b) => b.type === 'SECAO').length + 1;
      numberLabel = `Seção ${count}`;
    } else if (type === 'SUBSECAO') {
      const count = doc.blocks.filter((b) => b.type === 'SUBSECAO').length + 1;
      numberLabel = `Subseção ${count}`;
    } else if (type === 'ARTIGO') {
      const artCount = doc.blocks.filter((b) => b.type === 'ARTIGO').length + 1;
      numberLabel = `Art. ${artCount}º`;
    } else if (type === 'PARAGRAFO') {
      numberLabel = '§ 1º';
    } else if (type === 'INCISO') {
      numberLabel = 'I -';
    } else if (type === 'ALINEA') {
      numberLabel = 'a)';
    } else if (type === 'ITEM') {
      numberLabel = '1.';
    }

    // A linha sem formatação nasce vazia: ela existe justamente para receber
    // conteúdo que ainda não tem forma de dispositivo.
    const defaultContent =
      type === 'TEXTO_LIVRE'
        ? ''
        : ['PARTE', 'LIVRO', 'TITULO', 'SUBTITULO', 'CAPITULO', 'SECAO', 'SUBSECAO', 'TITULO_AGRUPADOR'].includes(type)
        ? `${numberLabel} - NOME DA ESTRUTURA`
        : type === 'OMISSIS'
        ? '.......................................................................................................'
        : 'Novo texto do dispositivo...';

    insertBlock({
      id: `block-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type,
      numberLabel,
      content: defaultContent,
      rawText: defaultContent,
    });
  };

  const handleInsertTable = () => {
    const rowsInput = prompt('Quantidade de linhas da tabela:', '3');
    if (rowsInput === null) return;

    const colsInput = prompt('Quantidade de colunas da tabela:', '3');
    if (colsInput === null) return;

    const rows = Number.parseInt(rowsInput, 10);
    const columns = Number.parseInt(colsInput, 10);

    if (!Number.isFinite(rows) || !Number.isFinite(columns) || rows < 1 || columns < 1) {
      alert('Informe valores inteiros maiores que zero para linhas e colunas.');
      return;
    }

    const safeRows = Math.min(rows, 100);
    const safeColumns = Math.min(columns, 20);

    insertBlock({
      id: `table-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: 'TABELA',
      content: createEmptyTableHtml(safeRows, safeColumns),
      rawText: 'Tabela',
      tableRows: Array.from({ length: safeRows }, () => Array.from({ length: safeColumns }, () => '')),
    });
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
      alert('Selecione no documento o trecho de texto a formatar.');
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

  /** Alinhamento: propriedade do parágrafo, gravada no bloco e no HTML exportado. */
  const handleAlign = (align: BlockAlign) => {
    const targets = activeTargets.length > 0 ? activeTargets : [targetForSelectedId(selectedBlockId)];
    const valid = targets.filter((target): target is string => Boolean(target));
    if (valid.length === 0) return;

    let next = docRef.current;
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
        onInsertTable={handleInsertTable}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onAddBlock={handleAddBlock}
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
