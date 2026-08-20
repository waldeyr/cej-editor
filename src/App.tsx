import React, { useState, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useCallback } from 'react';
import { Toolbar, TextCommand } from './components/Toolbar';
import { BarraDeAbas } from './components/BarraDeAbas';
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
import { parseDocBinarioToLegislativeDocument } from './parser/docParser';
import { serializeToPlanaltoHtml, deserializePlanaltoHtmlToDocument } from './parser/htmlSerializer';
import { completarEmentaDoDocx, prepararHtmlDeImportacao } from './parser/docxHtml';
import { detectarFormatoDeImportacao } from './parser/importFormat';
import { diagnosticarImportacao, erroDeTamanhoDeImportacao } from './parser/importDiagnostics';
import { validateLegislativeDocument } from './validator/legislativeValidator';
import { detectAndDecode, encodeToBytes } from './utils/encoding';
import { Aba, ArquivoDoAto, EstadoDasAbas, estaSuja, precisaSalvar } from './types/abas';
import { hrefDeCaminho, nomeDe, relativizar } from './utils/caminhos';
import {
  abaAtiva,
  criarAba,
  reduzirAbas,
  rotuloDaAba,
} from './utils/abas';
import { podeDesfazer, podeRefazer } from './utils/historico';
import {
  INTERVALO_DE_PULSO,
  adotarSessao,
  descartarRascunho,
  descartarSessao,
  gravarRascunho,
  gravarSessao,
  lerRascunho,
  lerSessao,
  migrarRascunhoLegado,
  pulsar,
  sessaoParaAdotar,
} from './utils/rascunhos';
import {
  AnchorPoint,
  AtoAberto,
  LinkChoice,
  ancorarDispositivos,
  collectAnchorPoints,
  createAnchorName,
  findAnchorBlock,
  renumerarDispositivos,
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
  markAsPlainFormat,
  moverParaParte,
  partTarget,
  podeVirarParte,
  resolvedAlignForTarget,
  setAlignForTarget,
} from './utils/docTargets';
import {
  EditableSegment,
  InlineFormat,
  InlineFormatResult,
  applyInlineFormat,
  clearFormatting,
  focusEditableTarget,
  getEditableSegments,
  readSegments,
  wrapInAnchorPoint,
  wrapInLink,
} from './utils/richText';
import { targetForSelectedId, targetsInPlay } from './utils/selection';
import { useActiveSelection } from './hooks/useActiveSelection';
import { useStatusNotice } from './hooks/useStatusNotice';
import {
  applyBlockType,
  blockTypeName,
  inicioDoAnexo,
  numberLabelForTypeAt,
} from './utils/blockTypes';
import { desenhaComoTitulo } from './utils/rank';
import { useTema } from './hooks/useTema';
import { useModalVisibility } from './hooks/useModalVisibility';
import mammoth from 'mammoth';
// A tipagem de window.electronAPI mora em src/types/electron.d.ts e entra no
// programa pelo "include" do tsconfig, sem import — como src/vite-env.d.ts.
// Um import explícito para ela quebra o vite dev server: esbuild tenta
// resolvê-la como módulo de runtime, e um .d.ts não é um.

const IMPORT_ENCODING = {
  encoding: 'windows-1252' as const,
  declaredEncoding: 'ISO-8859-1',
  hasBom: false,
};

/**
 * Partes que abrem o ato. O que vem imediatamente abaixo delas na folha é o
 * primeiro dispositivo do corpo, e é lá que nasce o conteúdo pedido com o
 * cursor pousado numa delas.
 */
const OPENING_PART_TARGETS: readonly string[] = (
  ['epigrafe', 'ementa', 'preambulo', 'ordemExecucao'] as const
).map(partTarget);

/**
 * Ação de arquivo — hoje, sempre uma aba nova.
 *
 * Não passa mais por pergunta alguma: abrir um ato deixou de descartar o que
 * estava na folha. O que ainda exige decidir o destino do trabalho é fechar
 * (ver `FechamentoPendente`).
 */
type PendingAction =
  | { kind: 'new' }
  | { kind: 'openUrl'; url: string; bytes: Uint8Array }
  | { kind: 'openFile'; file: File };

/** Aba que não pode ser fechada antes de se decidir o que fazer com o que ela tem. */
type FechamentoPendente = { abaId: string; rotulo: string };

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

const CHAVE_DA_JANELA = 'cej.janela.v1';

const novoIdDeJanela = (): string =>
  `janela-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Quem é esta janela, e se ela está abrindo ou apenas recarregando.
 *
 * A identidade mora em `sessionStorage`, que é por janela e sobrevive ao
 * Ctrl+R: achá-la já gravada significa recarregamento, e não achá-la significa
 * janela nova — a distinção que decide se as abas da sessão anterior voltam
 * aqui ou continuam com quem as tem.
 */
const identificarJanela = (): { id: string; recarregada: boolean } => {
  try {
    const guardado = sessionStorage.getItem(CHAVE_DA_JANELA);
    if (guardado) return { id: guardado, recarregada: true };

    const novo = novoIdDeJanela();
    sessionStorage.setItem(CHAVE_DA_JANELA, novo);
    return { id: novo, recarregada: false };
  } catch {
    // Navegação anônima barra o armazenamento; a janela ainda precisa de nome.
    return { id: novoIdDeJanela(), recarregada: false };
  }
};

const janela = identificarJanela();

/** Ato em branco do comando "Novo" — e o que toma o lugar da última aba fechada. */
const documentoEmBranco = (): LegislativeDocument => ({
  title: 'NOVO DECRETO',
  epigrafe: 'DECRETO Nº 0.000, DE 1 DE JANEIRO DE 2026',
  ementa: 'Dispõe sobre ato normativo.',
  preambulo: '<b>O PRESIDENTE DA REPÚBLICA</b>, no uso da atribuição que lhe confere a Constituição,',
  ordemExecucao: '<b>DECRETA</b>:',
  blocks: [
    {
      // Sufixo aleatório porque duas abas novas podem nascer no mesmo
      // milissegundo, e dois dispositivos com o mesmo id se sobrescrevem.
      id: `block-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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

/**
 * Com que atos a janela abre.
 *
 * Recarregar traz de volta exatamente as abas desta janela. Abrir o programa
 * traz as da última sessão encerrada — mas abrir uma **segunda** janela não
 * traz nada, senão ela roubaria as abas da primeira, que continua aberta. Quem
 * separa os dois casos é o pulso de `utils/rascunhos.ts`.
 *
 * Roda dentro do inicializador de `useReducer`, e o `StrictMode` a invoca duas
 * vezes em desenvolvimento: tudo aqui dentro precisa ser idempotente.
 */
/**
 * Quantos atos a sessão prometia e o rascunho não tinha.
 *
 * Um ato que passa da cota do armazenamento — a TIPI, com seus 2.854
 * dispositivos — fica sem rascunho, e ao recarregar a aba dele simplesmente não
 * volta. Sumir calado é o que a doutrina não admite: o número sai daqui e vira
 * recado na barra de estado.
 */
let atosNaoRecuperados = 0;

const estadoInicialDasAbas = (): EstadoDasAbas => {
  // Grava antes de devolver, justamente para sobreviver à segunda invocação.
  migrarRascunhoLegado();

  let sessao = janela.recarregada ? lerSessao(janela.id) : null;
  if (!sessao) {
    const candidata = sessaoParaAdotar(Date.now());
    if (candidata) sessao = adotarSessao(candidata.janelaId, janela.id);
  }

  /*
   * Rascunho recuperado nasce sujo: é trabalho que não chegou a arquivo nenhum,
   * e tratá-lo como salvo o faria sumir sem pergunta na primeira troca.
   */
  const prometidas = sessao?.abas ?? [];
  const recuperadas = prometidas
    .map((abaId) => lerRascunho(abaId))
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .map((r) =>
      criarAba({ ...r.doc, ...IMPORT_ENCODING }, { id: r.abaId, arquivo: r.arquivo, limpo: false })
    );

  atosNaoRecuperados = prometidas.length - recuperadas.length;

  if (recuperadas.length === 0) {
    const primeira = criarAba(INITIAL_DOC);
    return { abas: [primeira], ativa: primeira.id };
  }

  const ativa = recuperadas.some((a) => a.id === sessao?.ativa) ? sessao!.ativa : recuperadas[0].id;
  return { abas: recuperadas, ativa };
};


export const App: React.FC = () => {
  /*
   * Os atos abertos. Só um deles se desenha por vez: a aba inativa vive neste
   * registro, e não no DOM. É essa escolha que preserva as consultas globais de
   * que o editor depende — duas folhas na mesma página duplicariam
   * `data-cej-target`, e o campo com o foco passaria a ser devolvido ao
   * documento errado.
   */
  const [estado, despachar] = useReducer(reduzirAbas, undefined, estadoInicialDasAbas);
  const aba = abaAtiva(estado);

  const doc = aba.doc;
  const selectedBlockId = aba.selectedBlockId;
  const isDirty = estaSuja(aba);
  const needsSave = precisaSalvar(aba);
  const hasSaveTarget = Boolean(aba.arquivo?.caminho || aba.arquivo?.handle);
  const canUndo = podeDesfazer(aba);
  const canRedo = podeRefazer(aba);
  const justSaved = aba.acabouDeSalvar;

  /*
   * As ações vão sem `id` de propósito: quem resolve a aba é o redutor, no
   * instante em que aplica a ação. Fechar sobre `aba.id` aqui daria a aba de
   * quando o retorno de chamada nasceu, que nem sempre é a que está na folha.
   */
  const setDoc = useCallback(
    (proximo: LegislativeDocument | ((atual: LegislativeDocument) => LegislativeDocument)) =>
      despachar({ tipo: 'alterar', doc: proximo }),
    []
  );
  const setSelectedBlockId = useCallback(
    (blocoId?: string) => despachar({ tipo: 'selecionar', blocoId }),
    []
  );
  const undo = useCallback(() => despachar({ tipo: 'desfazer' }), []);
  const redo = useCallback(() => despachar({ tipo: 'refazer' }), []);

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

  const { tema, definirTema } = useTema();

  /** Aba que o redator mandou fechar e ainda tem trabalho a perder. */
  const [fechamentoPendente, setFechamentoPendente] = useState<FechamentoPendente | null>(null);
  const { activeFormats, activeTargets, setActiveFormats, setActiveTargets } = useActiveSelection();
  const { notice, setNotice } = useStatusNotice();

  const docRef = useRef(doc);
  docRef.current = doc;

  /** A folha, para guardar e repor a rolagem de cada aba. */
  const rolagemRef = useRef<HTMLElement>(null);

  /** Abas já avisadas de que não cabem no rascunho — o recado é uma vez, não a cada tecla. */
  const avisadasDeCota = useRef<Set<string>>(new Set());

  const issues: ValidationIssue[] = useMemo(() => validateLegislativeDocument(doc), [doc]);

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

      /*
       * Abas. Cada um destes tem equivalente visível na tira — o `+`, o `×` e a
       * própria aba —, como manda a doutrina de não haver atalho sem comando à
       * vista. No navegador Ctrl+T e Ctrl+W pertencem à janela e nunca chegam
       * aqui; no aplicativo de mesa, chegam.
       */
      if (key === 't') {
        e.preventDefault();
        executeNewDoc();
        return;
      }

      if (key === 'w') {
        e.preventDefault();
        fecharAba(estado.ativa);
        return;
      }

      if (e.key === 'Tab' && estado.abas.length > 1) {
        e.preventDefault();
        const atual = estado.abas.findIndex((a) => a.id === estado.ativa);
        const passo = e.shiftKey ? -1 : 1;
        const proxima = (atual + passo + estado.abas.length) % estado.abas.length;
        ativarAba(estado.abas[proxima].id);
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
   * Rascunho de cada aba, com folga entre uma gravação e outra.
   *
   * A folga é nova e necessária: antes a gravação era a cada alteração, com um
   * documento só. Com vários atos abertos, serializar o ato inteiro a cada
   * tecla se paga em travamento na folha.
   *
   * O exemplo de partida não é gravado: rascunho é trabalho em curso, e gravar
   * o exemplo intacto criaria, no acesso seguinte, um rascunho recuperado que
   * ninguém escreveu — e com ele a pergunta sobre salvar um ato que continua
   * exatamente como nasceu.
   */
  useEffect(() => {
    if (aba.doc === INITIAL_DOC) return;

    const timer = setTimeout(() => {
      const resultado = gravarRascunho({
        abaId: aba.id,
        doc: aba.doc,
        // O handle da web não atravessa JSON; o caminho e o nome, sim.
        arquivo: aba.arquivo ? { ...aba.arquivo, handle: undefined } : null,
        rotulo: rotuloDaAba(aba),
        gravadoEm: Date.now(),
      });

      /*
       * A TIPI passa de qualquer cota de navegador. Antes isso virava um aviso
       * no console que ninguém lê; agora o redator sabe que aquele ato está sem
       * rede, e o recado sai uma vez por aba, não a cada tecla.
       */
      if (resultado === 'cheio' && !avisadasDeCota.current.has(aba.id)) {
        avisadasDeCota.current.add(aba.id);
        setNotice(
          `“${rotuloDaAba(aba)}” é grande demais para a recuperação automática. Salve-o em arquivo.`
        );
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [aba.id, aba.doc, aba.arquivo]);

  /*
   * Que abas esta janela tem, para que reabrir o programa as traga de volta.
   *
   * O exemplo de partida fica de fora: ele não tem rascunho, de propósito, e
   * prometê-lo na sessão faria a recuperação seguinte contá-lo como ato perdido.
   */
  useEffect(() => {
    gravarSessao(janela.id, {
      abas: estado.abas.filter((a) => a.doc !== INITIAL_DOC).map((a) => a.id),
      ativa: estado.ativa,
      gravadaEm: Date.now(),
    });
  }, [estado.abas, estado.ativa]);

  /*
   * O ato que não coube no rascunho não volta ao recarregar, e o redator precisa
   * saber disso — senão ele procura na tira uma aba que o programa engoliu.
   */
  useEffect(() => {
    if (atosNaoRecuperados <= 0) return;
    setNotice(
      atosNaoRecuperados === 1
        ? 'Um ato da sessão anterior não pôde ser recuperado: era grande demais para a recuperação automática. Abra-o de novo pelo arquivo.'
        : `${atosNaoRecuperados} atos da sessão anterior não puderam ser recuperados: eram grandes demais para a recuperação automática. Abra-os de novo pelo arquivo.`
    );
    atosNaoRecuperados = 0;
  }, []);

  /*
   * O pulso que distingue "o programa reabriu" de "abriram outra janela".
   * Sem ele, a janela nova adotaria as abas da janela que continua aberta.
   */
  useEffect(() => {
    pulsar(janela.id, Date.now());
    const timer = setInterval(() => pulsar(janela.id, Date.now()), INTERVALO_DE_PULSO);
    return () => clearInterval(timer);
  }, []);

  /* Cada aba volta onde estava, e não ao topo do ato. */
  useLayoutEffect(() => {
    if (rolagemRef.current) rolagemRef.current.scrollTop = aba.rolagem;
  }, [estado.ativa]);

  // O aviso "Salvo" na barra de estado responde ao botão "Salvar".
  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => despachar({ tipo: 'limparAvisoDeSalvo', id: aba.id }), 2500);
    return () => clearTimeout(timer);
  }, [justSaved, aba.id]);

  /**
   * Adota um ato recém-aberto — numa aba nova.
   *
   * Antes isto substituía o documento em edição, e por isso toda porta de
   * entrada precisava perguntar antes sobre o trabalho não salvo. Agora abrir
   * um arquivo não descarta nada: o ato anterior continua na aba dele, e a
   * pergunta ficou só para quem fecha.
   */
  const loadDocument = (loaded: LegislativeDocument, arquivo: ArquivoDoAto | null = null) => {
    /*
     * O ato chega endereçado: cada dispositivo ganha o seu ponto de ancoragem no
     * padrão do Planalto, e é isso que faz a caixa "Inserir Link" oferecer o ato
     * inteiro como destino em vez do punhado de âncoras que o arquivo trouxe. As
     * que vieram do arquivo ficam como estão — são o endereço que as remissões
     * já publicadas citam.
     */
    const lido: LegislativeDocument = { ...loaded, ...IMPORT_ENCODING };
    const prepared = ancorarDispositivos(lido);

    /*
     * Endereço criado é trabalho não salvo, e a aba tem de dizer isso.
     *
     * O ato na folha passou a ter dispositivos que o arquivo no disco não
     * endereça, e a caixa de remissão já os oferece como destino de **outro**
     * ato. Uma aba que se declarasse limpa deixaria o redator fechar o programa
     * achando que gravou, e a remissão do ato vizinho nasceria apontando para um
     * `#art173§1` que a árvore publicada não tem — quebrada em silêncio.
     *
     * O ato publicado que já chega inteiramente endereçado não sofre nada disto:
     * `ancorarDispositivos` devolve o mesmo objeto, e a aba abre limpa.
     */
    const ganhouEndereco = prepared !== lido;
    despachar({
      tipo: 'abrir',
      aba: criarAba(prepared, { arquivo, ...(ganhouEndereco ? { limpo: false } : {}) }),
    });
  };

  /**
   * De que arquivo o ato veio — e se é para lá que "Salvar" o devolve.
   *
   * Só o HTML ganha caminho. Um `.rtf` ou `.doc` **importado** fica com o nome,
   * que é o que a aba mostra, e sem caminho de propósito: salvar grava HTML
   * padrão Planalto, e apontar para o arquivo de origem faria "Salvar" escrever
   * HTML por cima do RTF do redator, sem perguntar nada.
   *
   * No aplicativo de mesa o caminho vem do próprio campo de arquivo. (Isto é o
   * `File.path` do Electron, que sai de cena na versão 32 em favor de
   * `webUtils.getPathForFile`; quando a hora chegar, é esta função que muda.)
   */
  const identidadeDe = (file: File, comCaminho: boolean): ArquivoDoAto => {
    const caminho = comCaminho ? (file as File & { path?: string }).path : undefined;
    return { nome: file.name, caminho: caminho || undefined };
  };

  const informarDiagnostico = (doc: LegislativeDocument) => {
    const avisos = diagnosticarImportacao(doc);
    if (avisos.length) setNotice(`Importado com atenção: ${avisos.join('; ')}.`);
  };

  // Abre pelo formato dos bytes, e não pela extensão que o arquivo recebeu.
  const openBytes = async (bytes: Uint8Array, arquivo: ArquivoDoAto) => {
    const erroDeTamanho = erroDeTamanhoDeImportacao(bytes.byteLength);
    if (erroDeTamanho) throw new Error(erroDeTamanho);
    const buffer = bytes.slice().buffer as ArrayBuffer;
    const formato = detectarFormatoDeImportacao(bytes);

    if (formato === 'docx') {
      const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
      const preparo = prepararHtmlDeImportacao(result.value);
      const importado = completarEmentaDoDocx(deserializePlanaltoHtmlToDocument(preparo.html));
      loadDocument(importado, { ...arquivo, caminho: undefined, handle: undefined });

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
      const diagnosticos = diagnosticarImportacao(importado);
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
          ...diagnosticos,
        ]
          .filter(Boolean)
          .join(', ') + '.'
      );
      return;
    }

    if (formato === 'doc') {
      const importado = parseDocBinarioToLegislativeDocument(bytes);
      loadDocument(importado, { ...arquivo, caminho: undefined, handle: undefined });
      informarDiagnostico(importado);
      return;
    }

    if (formato === 'html') {
      // O HTML é o único formato que "Salvar" devolve ao arquivo de origem.
      openHtmlBytes(bytes, arquivo);
      return;
    }

    if (formato === 'rtf') {
      const importado = parseRtfToLegislativeDocument(detectAndDecode(bytes).text);
      loadDocument(importado, { ...arquivo, caminho: undefined, handle: undefined });
      informarDiagnostico(importado);
      return;
    }

    throw new Error('O formato do arquivo não foi reconhecido. Use um documento RTF, DOC, DOCX ou HTML.');
  };

  const openFile = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await openBytes(bytes, identidadeDe(file, false));
  };

  const openNativeFile = async () => {
    const resultado = await window.electronAPI?.openFile?.();
    if (!resultado) return;

    await openBytes(resultado.buffer, {
      nome: nomeDe(resultado.filePath),
      caminho: resultado.filePath,
    });
  };

  const openRecentNativeFile = async (caminho: string) => {
    const resultado = await window.electronAPI?.openRecentFile?.(caminho);
    if (!resultado) throw new Error('O arquivo recente não está mais disponível.');

    await openBytes(resultado.buffer, {
      nome: nomeDe(resultado.filePath),
      caminho: resultado.filePath,
    });
  };

  const openBrowserFile = async () => {
    const handles = await (window as any).showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: 'Documentos Legislativos',
          accept: { 'text/html': ['.html', '.htm'], 'application/rtf': ['.rtf'], 'application/msword': ['.doc'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
        },
      ],
    });
    const handle = handles?.[0] as FileSystemFileHandle | undefined;
    if (!handle) return;

    const file = await handle.getFile();
    await openBytes(new Uint8Array(await file.arrayBuffer()), { nome: file.name, handle });
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
  const openHtmlBytes = (bytes: Uint8Array, arquivo: ArquivoDoAto | null = null) => {
    const decoded = detectAndDecode(bytes);
    const importado = deserializePlanaltoHtmlToDocument(decoded.text);
    loadDocument(importado, arquivo);
    informarDiagnostico(importado);
  };

  const runAction = (action: PendingAction) => {
    if (action.kind === 'new') {
      executeNewDoc();
      return;
    }

    if (action.kind === 'openUrl') {
      /*
       * O endereço deixou de ser descartado aqui: ele nomeia a aba e diz de onde
       * o ato veio. Não vira caminho — "Salvar" continua perguntando onde
       * gravar, porque um ato baixado ainda não tem lugar no disco.
       */
      openHtmlBytes(action.bytes, {
        nome: nomeDe(new URL(action.url).pathname) || 'ato-baixado.html',
        origem: action.url,
      });
      return;
    }

    /*
     * A recusa de abrir vai para a barra de estado, como todo recado do
     * programa: uma caixa do navegador interrompe o trabalho, rouba o foco da
     * folha e ainda fala a língua do sistema operacional, não a do ofício.
     */
    void openFile(action.file).catch((error: unknown) => {
      setNotice(
        error instanceof Error ? error.message : 'Não foi possível abrir o arquivo escolhido.'
      );
    });
  };

  /*
   * Toda porta de entrada de documento passa por aqui, e nenhuma pergunta mais
   * nada: o ato que estava na folha continua aberto, na aba dele.
   */
  const requestAction = (action: PendingAction) => runAction(action);

  const handleOpenFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) requestAction({ kind: 'openFile', file });
  };

  const handleOpenNativeFile = () => {
    const open = window.electronAPI?.openFile ? openNativeFile : openBrowserFile;
    void open().catch((error: unknown) => {
      setNotice(error instanceof Error ? error.message : 'Não foi possível abrir o arquivo escolhido.');
    });
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
    const declaredSize = Number(response.headers.get('content-length') || 0);
    const erroDeTamanho = erroDeTamanhoDeImportacao(declaredSize);
    if (declaredSize && erroDeTamanho) throw new Error(erroDeTamanho);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const erroDoCorpo = erroDeTamanhoDeImportacao(bytes.byteLength);
    if (erroDoCorpo) throw new Error(erroDoCorpo);
    return bytes;
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
  const performSaveFile = async (
    suggestedName?: string,
    perguntarOnde = false
  ): Promise<boolean> => {
    const snapshot = currentDoc();
    const htmlContent = serializeToPlanaltoHtml(snapshot);
    const targetEncoding = 'windows-1252';
    const bytes = encodeToBytes(htmlContent, targetEncoding, snapshot.hasBom);
    const defaultName = suggestedName || suggestedFileName(snapshot.title);

    /*
     * O aviso é sobre o conteúdo salvo, não sobre a gravação em si — por isso
     * fica calculado aqui, antes do "onde" e do "como" gravar. Um erro real de
     * disco, adiante, sobrescreve este recado com o dele: perder a numeração
     * fora de sequência de vista importa menos do que saber que o arquivo não
     * foi para lugar nenhum.
     */
    const foraDeSequencia = validateLegislativeDocument(snapshot).filter((issue) =>
      issue.id.startsWith('art-seq-')
    );
    if (foraDeSequencia.length > 0) {
      setNotice(
        foraDeSequencia.length === 1
          ? `Salvo com um aviso: ${foraDeSequencia[0].message}`
          : `Salvo com ${foraDeSequencia.length} avisos de numeração fora de sequência. O botão "Renumerar", na barra de estrutura, acerta a sequência do ato.`
      );
    }

    /*
     * O que fica limpo é o que foi para o disco — e não o `doc` da aba: quem
     * salva lê antes o campo com o foco, e essa leitura é um documento mais
     * novo. Marcar o outro deixaria a aba com a marca de não salvo acesa logo
     * depois de salvar.
     */
    const markSaved = (arquivo?: ArquivoDoAto) =>
      despachar({ tipo: 'salvo', id: aba.id, doc: snapshot, arquivo });

    /*
     * 1a. O ato já tem arquivo: grava por cima, calado, como no Word.
     *
     * `perguntarOnde` é o "Salvar como…", que force o seletor mesmo havendo
     * caminho. Sem esta passagem, "Salvar" e "Salvar como…" faziam exatamente a
     * mesma coisa — ambos abriam o seletor, e o editor nunca aprendia de que
     * arquivo o ato tinha vindo.
     */
    if (window.electronAPI?.gravarArquivo && aba.arquivo?.caminho && !perguntarOnde) {
      const resultado = await window.electronAPI.gravarArquivo(aba.arquivo.caminho, bytes);
      if (resultado.ok) {
        markSaved();
        return true;
      }
      setNotice(resultado.erro || 'Não foi possível gravar o arquivo.');
      return false;
    }

    // 1b. Salvamento Nativo Electron: pergunta onde, e aprende o caminho.
    if (window.electronAPI) {
      try {
        const resultado = await window.electronAPI.saveFile(bytes, defaultName, aba.arquivo?.caminho);
        if (resultado.ok && resultado.caminho) {
          markSaved({ nome: nomeDe(resultado.caminho), caminho: resultado.caminho });
          return true;
        }
        if (resultado.erro) setNotice(resultado.erro);
        return false;
      } catch (e) {
        console.error('Erro ao salvar arquivo via Electron:', e);
      }
    }

    /*
     * 2. File System Access API (Chrome/Edge em contexto seguro).
     *
     * A concessão de gravação obtida aqui era descartada, e por isso cada
     * "Salvar" repetia o seletor. Guardá-la na aba é o equivalente web de saber
     * o caminho — com a ressalva de que a permissão precisa ser reconfirmada a
     * cada sessão, e aí o seletor volta uma vez.
     */
    if ('showSaveFilePicker' in window) {
      try {
        const guardado = aba.arquivo?.handle as
          | (FileSystemFileHandle & {
              queryPermission?: (d: unknown) => Promise<PermissionState>;
              requestPermission?: (d: unknown) => Promise<PermissionState>;
            })
          | undefined;

        let fileHandle = guardado;
        if (fileHandle && !perguntarOnde) {
          const modo = { mode: 'readwrite' };
          const estado =
            (await fileHandle.queryPermission?.(modo)) ??
            ((await fileHandle.requestPermission?.(modo)) as PermissionState | undefined);
          if (estado !== 'granted' && (await fileHandle.requestPermission?.(modo)) !== 'granted') {
            fileHandle = undefined;
          }
        } else if (perguntarOnde) {
          fileHandle = undefined;
        }

        if (!fileHandle) {
          fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: defaultName,
            types: [{ description: 'Arquivo HTML Planalto', accept: { 'text/html': ['.html', '.htm'] } }],
          });
        }

        const writable = await fileHandle!.createWritable();
        // O tipo do DOM exige um ArrayBuffer não compartilhado; os bytes daqui
        // sempre o são, e a asserção evita copiar o ato inteiro só para agradá-lo.
        await writable.write(bytes as unknown as FileSystemWriteChunkType);
        await writable.close();
        markSaved({ nome: fileHandle!.name, handle: fileHandle });
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
    await performSaveFile();
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
      await performSaveFile(undefined, true);
      return;
    }

    setShowSaveAsModal(true);
  };

  const handleSaveAsName = async (fileName: string) => {
    await performSaveFile(fileName);
  };

  // Um ato em branco, numa aba nova.
  const executeNewDoc = () => loadDocument(documentoEmBranco());

  /*
   * ---------------------------------------------------------------------------
   * As abas
   * ---------------------------------------------------------------------------
   */

  /**
   * Troca o ato que está na folha.
   *
   * A descarga do campo com o foco vem primeiro, e não é zelo: a folha desmonta
   * ao trocar de aba, e o campo só devolve o texto ao documento quando perde o
   * foco. Sem esta linha, trocar de aba no meio de uma frase come a frase.
   */
  const ativarAba = (id: string) => {
    if (id === estado.ativa) return;

    currentDoc();
    despachar({ tipo: 'guardarRolagem', rolagem: rolagemRef.current?.scrollTop ?? 0 });

    // Os dois retêm intervalos vivos de um DOM que vai deixar de existir, e os
    // dois estados de seleção descrevem uma seleção que acabou.
    heldSegmentsRef.current = [];
    heldInsertionTargetsRef.current = null;
    setActiveFormats([]);
    setActiveTargets([]);

    despachar({ tipo: 'ativar', id });
  };

  const executarFechamento = (id: string) => {
    descartarRascunho(id);
    avisadasDeCota.current.delete(id);
    despachar({ tipo: 'fechar', id, vazio: criarAba(documentoEmBranco()) });
  };

  /**
   * Fecha uma aba, perguntando quando há trabalho a perder.
   *
   * A aba suja é trazida para a folha **antes** da pergunta: decidir descartar
   * um ato que não se está vendo é decidir no escuro — e "Salvar" grava o que
   * está na folha, de modo que sem isto a pergunta salvaria o ato errado.
   */
  const fecharAba = (id: string) => {
    const alvo = estado.abas.find((a) => a.id === id);
    if (!alvo) return;

    if (!estaSuja(alvo)) {
      executarFechamento(id);
      return;
    }

    ativarAba(id);
    setFechamentoPendente({ abaId: id, rotulo: rotuloDaAba(alvo) });
  };

  const handleSalvarEFechar = async () => {
    const pendente = fechamentoPendente;
    const salvou = await performSaveFile();
    if (salvou && pendente) executarFechamento(pendente.abaId);
    setFechamentoPendente(null);
  };

  const handleFecharSemSalvar = () => {
    if (fechamentoPendente) executarFechamento(fechamentoPendente.abaId);
    setFechamentoPendente(null);
  };

  /**
   * Move uma aba para uma janela nova — só existe no aplicativo de mesa, que
   * não tem o gesto nativo de arrastar a aba para fora que o navegador já
   * oferece.
   *
   * Não pergunta sobre trabalho não salvo porque nada se perde: a aba grava o
   * próprio rascunho antes de sair, sob um id de janela novo que nenhuma
   * janela reivindica ainda, e é a janela nova quem o adota sozinha — o mesmo
   * mecanismo de `utils/rascunhos.ts` que já recupera uma sessão órfã ao
   * reabrir o programa (`estadoInicialDasAbas`, acima), só que a "queda" aqui
   * é deliberada, não uma falha.
   */
  const moverAbaParaNovaJanela = async (id: string) => {
    if (!window.electronAPI?.abrirNovaJanela) return;

    const alvo = estado.abas.find((a) => a.id === id);
    if (!alvo) return;

    // O campo com o foco só devolve o texto ao documento no blur (invariante
    // 10); sem isto a janela nova herdaria a frase de antes da última tecla.
    const doc = id === estado.ativa ? currentDoc() : alvo.doc;

    const novaJanelaId = novoIdDeJanela();
    gravarRascunho({
      abaId: id,
      doc,
      arquivo: alvo.arquivo ? { ...alvo.arquivo, handle: undefined } : null,
      rotulo: rotuloDaAba({ ...alvo, doc }),
      gravadoEm: Date.now(),
    });
    gravarSessao(novaJanelaId, { abas: [id], ativa: id, gravadaEm: Date.now() });

    const resultado = await window.electronAPI.abrirNovaJanela();
    if (!resultado?.ok) {
      // Sem isto, uma tentativa que falhou deixaria uma sessão órfã capaz de
      // ser adotada por engano por uma janela futura — enquanto esta aba
      // continua, ao mesmo tempo, aberta e viva aqui.
      descartarSessao(novaJanelaId);
      setNotice('Não foi possível abrir uma nova janela.');
      return;
    }

    avisadasDeCota.current.delete(id);
    despachar({ tipo: 'fechar', id, vazio: criarAba(documentoEmBranco()) });
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
    // O dispositivo nasce endereçado, como o que veio do arquivo.
    setDoc(ancorarDispositivos({ ...base, blocks }));
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

    // O trecho que acabou de virar dispositivo ganha endereço junto com o tipo:
    // é aqui que ele passa a ter rótulo, e é do rótulo que sai o nome da âncora.
    setDoc(ancorarDispositivos({ ...base, blocks }));
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

    const substituiu = !isEmptyHtml(base[part] || '');
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

    // O endereço acompanha a renumeração; o porquê está em `renumerarDispositivos`.
    const { doc: renumerado, renumerados } = renumerarDispositivos(
      base,
      selected.length > 0 ? new Set(selected) : undefined
    );

    if (renumerados === 0) {
      setNotice('A numeração já acompanha a ordem dos dispositivos.');
      return;
    }

    setDoc(renumerado);
    setNotice(
      renumerados === 1 ? '1 dispositivo renumerado.' : `${renumerados} dispositivos renumerados.`
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

  const {
    showLinkModal,
    setShowLinkModal,
    showUrlModal,
    setShowUrlModal,
    showTitleModal,
    setShowTitleModal,
    showTableModal,
    setShowTableModal,
    showSaveAsModal,
    setShowSaveAsModal,
  } = useModalVisibility();
  const [activeSelectionText, setActiveSelectionText] = useState<string>('');
  const [atosEmOutrasJanelas, setAtosEmOutrasJanelas] = useState<AtoAberto[]>([]);

  useEffect(() => {
    const removerMenu = window.electronAPI?.onArquivoMenu?.((comando) => {
      if (comando === 'novo') {
        executeNewDoc();
        return;
      }
      if (comando === 'abrir') {
        handleOpenNativeFile();
        return;
      }
      setShowUrlModal(true);
    });
    const removerRecente = window.electronAPI?.onArquivoRecente?.((caminho) => {
      void openRecentNativeFile(caminho).catch((error: unknown) => {
        setNotice(error instanceof Error ? error.message : 'Não foi possível abrir o arquivo recente.');
      });
    });

    return () => {
      removerMenu?.();
      removerRecente?.();
    };
  }, [executeNewDoc, handleOpenNativeFile, openRecentNativeFile]);

  const carregarAtosEmOutrasJanelas = () => {
    if (!window.electronAPI?.listarAtosAbertos) {
      setAtosEmOutrasJanelas([]);
      return;
    }

    void window.electronAPI
      .listarAtosAbertos()
      .then(setAtosEmOutrasJanelas)
      .catch(() => setAtosEmOutrasJanelas([]));
  };

  /**
   * Devolve ao documento o HTML dos campos que a operação acabou de alterar.
   *
   * `base` existe para as remissões internas: nomear o dispositivo de destino e
   * criar o link na origem são duas mudanças no mesmo documento, e precisam
   * entrar juntas — separadas, a segunda gravação apagaria a primeira.
   */
  /** O alvo é um agrupador (Título, Capítulo, Seção…), que nasce em negrito por padrão. */
  const ehAgrupador = (target: string): boolean => {
    if (!target.startsWith('block:')) return false;
    const bloco = docRef.current.blocks.find((b) => b.id === target.slice('block:'.length));
    return Boolean(bloco && desenhaComoTitulo(bloco.type));
  };

  const commitSegments = (
    segments: EditableSegment[],
    format?: TextCommand,
    base: LegislativeDocument = docRef.current
  ) => {
    let next = base;

    readSegments(segments).forEach(({ target, html }) => {
      /*
       * A ordem de execução e o agrupador nascem em negrito porque é assim
       * que o padrão Planalto os escreve — não porque o redator pediu. Sem a
       * marca, o negrito padrão voltaria sozinho no próximo render ou na
       * exportação, desfazendo "Limpar formatação".
       */
      const value =
        format === 'clearStyle' && (target === partTarget('ordemExecucao') || ehAgrupador(target))
          ? markAsPlainFormat(html)
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
      carregarAtosEmOutrasJanelas();
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

    let strikethroughResult: InlineFormatResult | undefined;
    if (format === 'clearStyle') {
      clearFormatting(segments);
    } else {
      const result = applyInlineFormat(segments, format);
      if (format === 'strikethrough') strikethroughResult = result;
    }

    /*
     * Quando a seleção cobre um dispositivo inteiro — não só um trecho do
     * texto — o rótulo ("Art. 5º") sai riscado junto com o caput: é o gesto de
     * quem tacha o dispositivo inteiro, não uma palavra dele. Entra como base
     * de `commitSegments`, para que o rótulo e o texto se gravem no mesmo
     * commit do histórico (invariante 7).
     */
    const base =
      strikethroughResult && strikethroughResult.fullyCoveredTargets.length > 0
        ? {
            ...docRef.current,
            blocks: docRef.current.blocks.map((block) =>
              strikethroughResult!.fullyCoveredTargets.includes(blockTarget(block.id))
                ? { ...block, identificadorTachado: strikethroughResult!.applied }
                : block
            ),
          }
        : docRef.current;

    commitSegments(segments, format, base);
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

  /**
   * Os outros atos abertos, oferecidos como destino de remissão.
   *
   * Sai de graça: a aba já guarda o ato desserializado, então os pontos de
   * ancoragem vêm de `collectAnchorPoints` sem tocar no disco. É o que torna
   * esta a forma mais barata de criar remissão entre arquivos.
   */
  const atosDestaJanela: AtoAberto[] = useMemo(
    () =>
      estado.abas
        .map((outra) => ({
          id: outra.id,
          janelaId: janela.id,
          rotulo: rotuloDaAba(outra),
          caminho: outra.arquivo?.caminho,
          ancoras: collectAnchorPoints(outra.doc),
        })),
    [estado.abas]
  );

  useEffect(() => {
    void window.electronAPI?.publicarAtosAbertos?.(atosDestaJanela);
  }, [atosDestaJanela]);

  useEffect(
    () => () => {
      void window.electronAPI?.publicarAtosAbertos?.([]);
    },
    []
  );

  const atosAbertos: AtoAberto[] = useMemo(
    () => [
      ...atosDestaJanela.filter((outra) => outra.id !== aba.id),
      ...atosEmOutrasJanelas,
    ],
    [atosDestaJanela, atosEmOutrasJanelas, aba.id]
  );

  /**
   * O `href` que a escolha da caixa vai gravar no ato — ou a recusa.
   *
   * É o **único** lugar em que uma escolha vira endereço, e por isso é aqui que
   * a conta relativa acontece. O que se grava é o caminho de um arquivo ao
   * outro, letra por letra: no editor a remissão é caminho entre arquivos da
   * pasta de trabalho, e só vira endereço da web quando a árvore é publicada.
   */
  const hrefDaEscolha = (choice: LinkChoice): { href: string } | { recusa: string } => {
    if (choice.kind === 'anchor') return { href: `#${choice.name}` };
    if (choice.kind === 'url') return { href: choice.href };

    const destino = atosAbertos.find(
      (outro) => outro.id === choice.abaId && outro.janelaId === choice.janelaId
    );
    if (!destino) return { recusa: 'O ato de destino não está mais aberto.' };

    /*
     * Só o aplicativo de mesa conhece o caminho de um arquivo — o navegador
     * jamais revela a pasta. Sem essa distinção, a recusa mandaria o redator
     * salvar o ato para destravar algo que salvar não destrava, e ele tentaria
     * de novo, mais forte.
     */
    if (!window.electronAPI) {
      return {
        recusa:
          'Remissão de um ato para outro precisa do aplicativo de mesa: só nele o editor sabe em que pasta cada arquivo está.',
      };
    }

    const origem = aba.arquivo?.caminho;
    if (!origem) {
      return {
        recusa: 'Salve este ato em arquivo antes — o caminho da remissão é contado a partir de onde ele está.',
      };
    }

    const alvo = destino.caminho;
    if (!alvo) {
      return { recusa: `Salve “${destino.rotulo}” em arquivo antes de apontar para ele.` };
    }

    const relativo = relativizar(origem, alvo);
    if (relativo === null) {
      return {
        recusa: `“${destino.rotulo}” está noutro disco: não há caminho relativo entre os dois.`,
      };
    }

    // Mesmo arquivo aberto em duas abas: a remissão é interna, e só a âncora sobra.
    if (relativo === '') {
      return choice.ancora
        ? { href: `#${choice.ancora}` }
        : { recusa: 'Este é o arquivo do próprio ato em edição.' };
    }

    return { href: hrefDeCaminho(relativo, choice.ancora) };
  };

  /** Destino escolhido na caixa: um ponto do ato, outro ato aberto, ou um endereço. */
  const handleApplyLink = (choice: LinkChoice) => {
    const resultado = hrefDaEscolha(choice);
    setShowLinkModal(false);

    /*
     * A recusa vem antes de consumir o trecho retido: `applyLink` esvazia o
     * `ref`, e recusar depois custaria ao redator selecionar tudo de novo.
     */
    if ('recusa' in resultado) {
      setNotice(resultado.recusa);
      return;
    }

    applyLink(resultado.href);
  };

  /**
   * Segue uma remissão: rola a folha até o dispositivo apontado e o deixa
   * selecionado, de modo que a barra de estado passe a mostrar onde se chegou.
   * Um nome sem dono — remissão digitada à mão, ou destino excluído depois —
   * vira recado na barra de estado em vez de um clique que não faz nada.
   */
  const handleNavigateAnchor = (name: string) => {
    if (name.replace(/^#/, '') === 'epigrafe') {
      setSelectedBlockId('epigrafe');
      document.getElementById('block-epigrafe')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

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

  /** O tipo do dispositivo selecionado, que acende a ficha na barra de estrutura. */
  const activeBlockType = useMemo(
    () => doc.blocks.find((block) => block.id === selectedBlockId)?.type,
    [doc.blocks, selectedBlockId]
  );

  /** A contagem da barra de estado é a porta: leva ao primeiro problema apontado. */
  const irAoPrimeiroProblema = useCallback(() => {
    const alvo = issues.find((issue) => issue.blockId);
    if (!alvo?.blockId) return;
    setSelectedBlockId(alvo.blockId);
    document
      .getElementById(`block-${alvo.blockId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [issues, setSelectedBlockId]);

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

  return (
    <div className="w-screen h-screen flex flex-col bg-sup-fundo overflow-hidden select-none">
      {/* Barra de Comandos */}
      <Toolbar
        documentTitle={doc.title || htmlToPlainText(doc.epigrafe)}
        onEditTitle={() => setShowTitleModal(true)}
        onNew={() => requestAction({ kind: 'new' })}
        onOpenFile={handleOpenFile}
        onOpenNativeFile={
          window.electronAPI?.openFile || 'showOpenFilePicker' in window
            ? handleOpenNativeFile
            : undefined
        }
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
        activeBlockType={activeBlockType}
        tema={tema}
        onTema={definirTema}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      {/* Os atos abertos */}
      <BarraDeAbas
        abas={estado.abas}
        ativa={estado.ativa}
        onAtivar={ativarAba}
        onFechar={fecharAba}
        onNova={executeNewDoc}
        onMoverParaNovaJanela={window.electronAPI?.abrirNovaJanela ? moverAbaParaNovaJanela : undefined}
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
          /*
           * A chave por aba força a folha a remontar ao trocar de ato. Sem ela,
           * o `useLayoutEffect` de `Editable` reaproveitaria os campos do ato
           * anterior — e o `innerHTML` de um dispositivo pousaria no
           * dispositivo de outro documento que calhasse de ocupar a posição.
           */
          key={estado.ativa}
          rolagemRef={rolagemRef}
          doc={doc}
          onUpdateDoc={setDoc}
          onUpdateStructure={(proximo) => setDoc(ancorarDispositivos(proximo))}
          selectedBlockId={selectedBlockId}
          onSelectBlock={setSelectedBlockId}
          issues={issues}
          onNavigateAnchor={handleNavigateAnchor}
          onInsertAnchor={() => handleFormatInline('anchor')}
          onInsertLink={() => handleFormatInline('link')}
          onStrikethrough={() => handleFormatInline('strikethrough')}
        />
      </div>

      {/* Barra de Estado do Documento */}
      <StatusBar
        declaredEncoding={doc.declaredEncoding}
        blockCount={doc.blocks.length}
        issueCount={issueCount}
        position={position}
        dirty={needsSave}
        hasFile={hasSaveTarget}
        justSaved={justSaved}
        notice={notice}
        onShowFirstIssue={irAoPrimeiroProblema}
      />

      {/* Confirmação antes de fechar um ato com trabalho a perder */}
      <ConfirmModal
        isOpen={fechamentoPendente !== null}
        title="Fechar o ato"
        message={
          fechamentoPendente
            ? `“${fechamentoPendente.rotulo}” tem alterações não salvas. Deseja salvá-las antes de fechar?`
            : ''
        }
        onSaveAndContinue={handleSalvarEFechar}
        onDiscardAndContinue={handleFecharSemSalvar}
        onCancel={() => setFechamentoPendente(null)}
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
        atosAbertos={atosAbertos}
        janelaAtualId={janela.id}
        atoTemArquivo={Boolean(aba.arquivo?.caminho)}
        conheceCaminhos={Boolean(window.electronAPI)}
        selectedText={activeSelectionText}
        onSelectLink={handleApplyLink}
        onClose={() => setShowLinkModal(false)}
      />
    </div>
  );
};
