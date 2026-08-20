import React, { useCallback, useState } from 'react';
import {
  Trash2,
  Copy,
  Plus,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
  Link2,
  Table as TableIcon,
} from 'lucide-react';
import {
  LegislativeDocument,
  LegislativeBlock,
  ValidationIssue,
  BlockType,
  BlockAlign,
} from '../types/legislative';
import { sanitizeQuoteText } from '../parser/rtfParser';
import { desenhaComoTitulo } from '../utils/rank';
import { Editable } from './Editable';
import { NumberLabelEditable } from './NumberLabelEditable';
import { CanvasContextMenu, CanvasMenuState } from './CanvasContextMenu';
import { CanvasHint, CanvasHintState } from './CanvasHint';
import {
  LINK_INK,
  LINK_INK_HOVER,
  describeBlock,
  findAnchorBlock,
  semPontosDeAncoragem,
} from '../utils/anchors';
import {
  EDITABLE_SELECTOR,
  EDITABLE_TARGET_ATTR,
  applyHtmlToTarget,
  assinaturaTarget,
  blockTarget,
  defaultAlignForBlockType,
  htmlToPlainText,
  indentForAlign,
  isEmptyHtml,
  partTarget,
  resolvedAlignForTarget,
} from '../utils/docTargets';
import {
  cutContentAfterCaret,
  deleteSegments,
  focusEditableTarget,
  getEditableSegments,
  readSegments,
  removeAnchorPoint,
  removeLink,
  replaceSegmentsWithText,
} from '../utils/richText';
import { inicioDoAnexo, numberLabelForTypeAt } from '../utils/blockTypes';
import {
  ASPAS_ABRE,
  ASPAS_FECHA,
  abreAspas,
  citacaoAbaixoDe,
  citacaoDe,
  dividirCitacao,
  estaEmCitacao,
  fechaAspas,
} from '../utils/citacoes';

interface EditorCanvasProps {
  doc: LegislativeDocument;
  onUpdateDoc: (doc: LegislativeDocument) => void;
  /**
   * Devolve o ato quando a **lista de dispositivos** mudou — nasceu, sumiu,
   * duplicou ou trocou de lugar —, e não quando só o texto de um deles mudou.
   *
   * A diferença existe porque é aqui que o dispositivo novo ganha o seu ponto de
   * ancoragem (invariante 12), e passar o ato inteiro por essa conta a cada
   * tecla custaria 168 ms numa medida provisória de 1.873 dispositivos, medidos.
   * Estrutura muda por gesto; texto muda por caractere.
   */
  onUpdateStructure: (doc: LegislativeDocument) => void;
  selectedBlockId?: string;
  onSelectBlock: (id: string) => void;
  issues: ValidationIssue[];
  /** Leva a folha até o dispositivo que responde por um nome de âncora. */
  onNavigateAnchor: (name: string) => void;
  onInsertAnchor: () => void;
  onInsertLink: () => void;
  /**
   * A área rolável, para que cada aba volte onde estava.
   *
   * Vem de fora porque quem guarda a rolagem é o registro da aba, e a folha
   * desmonta ao trocar de ato — medir aqui dentro seria medir tarde demais.
   */
  rolagemRef?: React.Ref<HTMLElement>;
}

const newBlockId = (prefix = 'block') =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

export const EditorCanvas: React.FC<EditorCanvasProps> = ({
  doc,
  onUpdateDoc,
  onUpdateStructure,
  selectedBlockId,
  onSelectBlock,
  onNavigateAnchor,
  onInsertAnchor,
  onInsertLink,
  rolagemRef,
}) => {
  const [menu, setMenu] = useState<CanvasMenuState | null>(null);
  /** Remissão sob o ponteiro, cujo destino a etiqueta mostra. */
  const [hint, setHint] = useState<CanvasHintState | null>(null);

  // As oito operações de tabela dividem uma única superfície neutra. Antes cada
  // uma tinha sua própria matiz (azul, ardósia, roxo, celeste, esmeralda,
  // âmbar) sem que a cor distinguisse nada: o rótulo já diz o que o botão faz.
  // Cores literais, não tokens: esta régua flutua sobre o papel branco, que é
  // igual nos dois temas (invariante 2 do design system).
  const tableActionButtonBaseClass =
    'h-7 px-2 rounded border border-black/10 bg-black/[0.04] hover:bg-black/10 text-[#23313f] text-[11px] font-medium transition inline-flex items-center justify-center whitespace-nowrap';

  const normalizeNumberedContentHtml = (html: string, hasNumberLabel: boolean) => {
    if (!hasNumberLabel) return html;
    return html.replace(/^((?:<[^>]+>\s*)*)(?:&nbsp;|&#160;|\s)+/i, '$1');
  };

  const normalizeNumberLabel = (label?: string) => {
    if (!label) return '';
    return label
      .replace(/(?: |&nbsp;|&#160;|\s)+/gi, ' ')
      .trim();
  };

  const handleCanvasBlockClick = (id: string) => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString()) return;
    onSelectBlock(id);
  };

  /** Remissão sob o ponto clicado, se houver alguma. */
  const linkAt = (event: React.MouseEvent): HTMLAnchorElement | null => {
    const node = event.target as HTMLElement | null;
    return node?.closest?.<HTMLAnchorElement>('a[href]') || null;
  };

  /** Ponto de ancoragem sob o ponto clicado, se houver algum. */
  const anchorPointAt = (event: React.MouseEvent): HTMLAnchorElement | null => {
    const node = event.target as HTMLElement | null;
    return node?.closest?.<HTMLAnchorElement>('a[name]') || null;
  };

  /** Nome da âncora apontada por uma remissão interna (`href="#..."`). */
  const anchorNameOf = (link: HTMLAnchorElement): string | undefined => {
    const href = link.getAttribute('href') || '';
    if (!href.startsWith('#') || href.length < 2) return undefined;
    return decodeURIComponent(href.slice(1));
  };

  /*
   * Seguir uma remissão dentro de um campo editável.
   *
   * O navegador não navega por um link em `contentEditable` — ele apenas põe o
   * cursor dentro dele. Segurar o `mousedown` é o que impede o cursor de cair no
   * meio do texto do link um instante antes de a folha rolar para longe; o
   * `click` seguinte é quem de fato leva ao destino. Com Alt o caminho normal
   * volta, e é assim que se edita o texto de uma remissão já criada.
   */
  const handlePaperMouseDown = (event: React.MouseEvent) => {
    if (event.button !== 0 || event.altKey) return;
    const link = linkAt(event);
    if (link && anchorNameOf(link)) event.preventDefault();
  };

  const handlePaperClick = (event: React.MouseEvent) => {
    if (event.altKey) return;
    const link = linkAt(event);
    const name = link && anchorNameOf(link);
    if (!name) return;

    event.preventDefault();
    onNavigateAnchor(name);
  };

  /** Onde chega uma remissão interna, dita como o dispositivo aparece na lista. */
  const anchorDestination = (name: string): string => {
    const block = findAnchorBlock(doc, name);
    return block ? `Vai para ${describeBlock(block)}` : 'Nenhum ponto de ancoragem com este nome';
  };

  /*
   * Etiqueta do que está sob o ponteiro: o destino da remissão, ou o nome do
   * ponto de ancoragem que o ícone de âncora anuncia na folha.
   *
   * O gesto é o `mouseover`, e não o `mousemove`: a etiqueta acompanha a marca e
   * não o ponteiro, de modo que ela é calculada uma vez por marca visitada em
   * vez de a cada pixel percorrido sobre a folha. Entrar num trecho que não é
   * marca — inclusive o texto em volta dela — apaga a etiqueta pelo mesmo
   * caminho, porque o evento também sobe daí.
   *
   * A remissão vem antes do ponto de ancoragem porque um `<a>` pode ser as duas
   * coisas, e aí o que interessa saber é para onde ele leva: o nome pelo qual
   * ele responde continua no menu do botão direito.
   */
  const handlePaperMouseOver = (event: React.MouseEvent) => {
    const link = linkAt(event);
    const point = link ? null : anchorPointAt(event);
    const mark = link || point;

    if (!mark) {
      setHint((previous) => (previous ? null : previous));
      return;
    }

    setHint((previous) => {
      if (previous?.element === mark) return previous;

      const { left, top, bottom } = mark.getBoundingClientRect();
      const position = { left, top, bottom };

      if (link) {
        const name = anchorNameOf(link);
        return {
          element: link,
          label: link.getAttribute('href') || '',
          note: name ? anchorDestination(name) : undefined,
          ...position,
        };
      }

      return {
        element: mark,
        label: `#${mark.getAttribute('name') || ''}`,
        note: 'Ponto de ancoragem — é aqui que chegam as remissões a este nome.',
        ...position,
      };
    });
  };

  const handlePaperContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setHint(null);
    const link = linkAt(event);
    const point = anchorPointAt(event);

    setMenu({
      x: event.clientX,
      y: event.clientY,
      hasSelection: getEditableSegments().length > 0,
      link: link ? { element: link, anchorName: anchorNameOf(link) } : undefined,
      anchorPoint: point ? { element: point, name: point.getAttribute('name') || '' } : undefined,
    });
  };

  /**
   * Desfaz remissão ou ponto de ancoragem e devolve ao documento o campo em que
   * estava. As duas passam pelo mesmo caminho porque o efeito é o mesmo — muda
   * só o que se retira do `<a>`.
   */
  const editAnchorElement = (element: HTMLElement, edit: (target: HTMLElement) => void) => {
    const field = element.closest<HTMLElement>(EDITABLE_SELECTOR);
    const target = field?.getAttribute(EDITABLE_TARGET_ATTR);
    if (!field || !target) return;

    edit(element);
    commitTarget(target, field.innerHTML);
  };

  /** Devolve ao documento o HTML de um campo editável qualquer. */
  const commitTarget = useCallback(
    (target: string, html: string) => {
      onUpdateDoc(applyHtmlToTarget(doc, target, html));
    },
    [doc, onUpdateDoc]
  );

  const handleUpdateBlockContent = (id: string, newContent: string) => {
    const updatedBlocks = doc.blocks.map((b) => {
      if (b.id === id) {
        /*
         * As aspas da citação a folha desenha ao lado do campo, e não dentro
         * dele: as que o redator escrever nas pontas do texto sairiam em dobro
         * no arquivo salvo.
         */
        const sanitized = abreAspas(b) || fechaAspas(b) ? sanitizeQuoteText(newContent) : newContent;
        const normalized = b.numberLabel
          ? sanitized.replace(/^((?:<[^>]+>\s*)*)(?:&nbsp;|&#160;|\s)+/i, '$1')
          : sanitized;
        return {
          ...b,
          content: normalized,
          rawText: htmlToPlainText(normalized),
        };
      }
      return b;
    });
    onUpdateDoc({ ...doc, blocks: updatedBlocks });
  };

  /** Grava o rótulo que o redator editou diretamente na folha (invariante 3: continua fora do caput). */
  const handleUpdateBlockLabel = (id: string, newLabel: string) => {
    const updatedBlocks = doc.blocks.map((b) => (b.id === id ? { ...b, numberLabel: newLabel } : b));
    onUpdateDoc({ ...doc, blocks: updatedBlocks });
  };

  const handleMoveBlock = (index: number, direction: 'up' | 'down', e: React.MouseEvent) => {
    e.stopPropagation();
    const newBlocks = [...doc.blocks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newBlocks.length) return;

    const temp = newBlocks[index];
    newBlocks[index] = newBlocks[targetIndex];
    newBlocks[targetIndex] = temp;

    onUpdateStructure({ ...doc, blocks: newBlocks });
  };

  const handleDuplicateBlock = (block: LegislativeBlock, e: React.MouseEvent) => {
    e.stopPropagation();
    const index = doc.blocks.findIndex((b) => b.id === block.id);
    /*
     * A cópia nasce **sem** endereço, e ganha o seu em `onUpdateStructure`.
     *
     * Levar o `linkName` junto punha dois `<a name="art2">` no mesmo arquivo:
     * o navegador para no primeiro, de modo que metade das remissões apontava
     * para o dispositivo errado sem que nada na tela denunciasse. Endereço é
     * identidade — duas cópias de um artigo são dois artigos.
     */
    const newBlock: LegislativeBlock = {
      ...block,
      id: newBlockId(),
      linkName: undefined,
      content: semPontosDeAncoragem(block.content),
      rawText: block.rawText,
    };

    const newBlocks = [...doc.blocks];
    if (index >= 0) {
      newBlocks.splice(index + 1, 0, newBlock);
    } else {
      newBlocks.push(newBlock);
    }
    onUpdateStructure({ ...doc, blocks: newBlocks });
  };

  const handleDeleteBlock = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newBlocks = doc.blocks.filter((b) => b.id !== id);
    onUpdateStructure({ ...doc, blocks: newBlocks });
  };

  const handleAddBlockBelow = (index: number, type: BlockType, e: React.MouseEvent) => {
    e.stopPropagation();
    // O rótulo sai da posição em que o dispositivo entra, não de uma contagem
    // do ato inteiro: um artigo criado no meio do texto é o artigo dali.
    const numberLabel = numberLabelForTypeAt(doc.blocks, index + 1, type);

    /*
     * O dispositivo nasce vazio: ele é lugar para escrever, e não texto
     * escrito. A frase de espera que aparece na folha é desenhada pelo CSS
     * sobre o campo em branco (ver `[data-cej-target]:empty` em index.css) e
     * some ao primeiro caractere — o "Novo texto do dispositivo..." que ficava
     * aqui era texto de verdade, e obrigava a selecioná-lo e apagá-lo antes de
     * redigir.
     */
    const newBlock: LegislativeBlock = {
      id: newBlockId(),
      type,
      numberLabel,
      content: '',
      rawText: '',
      // Dentro de uma citação, o dispositivo que nasce é mais um dispositivo
      // citado — e nasce já no recuo da citação, e não na margem do ato.
      citacao: citacaoAbaixoDe(doc.blocks[index]),
    };

    const newBlocks = [...doc.blocks];
    newBlocks.splice(index + 1, 0, newBlock);
    onUpdateStructure({ ...doc, blocks: newBlocks });
    onSelectBlock(newBlock.id);
    focusEditableTarget(blockTarget(newBlock.id));
  };

  /**
   * Enter reparte o dispositivo no cursor e abre uma linha nova sem formatação
   * nem numeração — a forma direta de continuar escrevendo sem antes escolher
   * na barra que tipo de dispositivo virá a seguir. Shift+Enter segue quebrando
   * a linha dentro do mesmo dispositivo.
   */
  const handleBlockEnter = (index: number, event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();

    // Com um trecho longo selecionado, Enter apaga a seleção inteira antes de
    // qualquer outra coisa — do contrário só o campo com o foco seria afetado.
    const spanning = getEditableSegments();
    if (spanning.length > 1) {
      deleteSegments(spanning);
      onUpdateDoc(applySegmentEdits(spanning));
      return;
    }

    const element = event.currentTarget;
    const tail = cutContentAfterCaret(element);
    const head = element.innerHTML;

    /*
     * Repartir um dispositivo citado não abre nem fecha a citação: as aspas
     * ficam onde estavam, e o que nasce entre elas é mais um dispositivo do ato
     * alterado.
     */
    const [antes, depois] = dividirCitacao(citacaoDe(doc.blocks[index]));

    const newBlock: LegislativeBlock = {
      id: newBlockId(),
      type: 'TEXTO_LIVRE',
      content: tail,
      rawText: htmlToPlainText(tail),
      citacao: depois,
    };

    const blocks = [...doc.blocks];
    blocks[index] = { ...blocks[index], content: head, rawText: htmlToPlainText(head), citacao: antes };
    blocks.splice(index + 1, 0, newBlock);

    onUpdateStructure({ ...doc, blocks });
    onSelectBlock(newBlock.id);
    focusEditableTarget(blockTarget(newBlock.id));
  };

  /** Nas partes fixas do ato não há quebra de parágrafo: elas são um parágrafo só. */
  const handlePartEnter = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) event.preventDefault();
  };

  /** Enter na ordem de execução abre o primeiro dispositivo do corpo do ato. */
  const handleOrdemExecucaoEnter = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();

    const newBlock: LegislativeBlock = {
      id: newBlockId(),
      type: 'TEXTO_LIVRE',
      content: '',
      rawText: '',
    };
    onUpdateStructure({ ...doc, blocks: [newBlock, ...doc.blocks] });
    onSelectBlock(newBlock.id);
    focusEditableTarget(blockTarget(newBlock.id));
  };

  /**
   * Recolhe o resultado de uma edição feita direto no DOM e o devolve ao
   * documento. Dispositivos que ficaram inteiramente vazios saem da lista —
   * apagar um trecho longo deve apagar também os dispositivos que ele consumiu
   * por inteiro, não deixar cascas vazias no corpo do ato.
   */
  const applySegmentEdits = (segments: ReturnType<typeof getEditableSegments>) => {
    const touched = readSegments(segments);
    let next = doc;
    touched.forEach(({ target, html }) => {
      next = applyHtmlToTarget(next, target, html);
    });

    const emptiedIds = new Set(
      touched
        .filter(({ target, html }) => target.startsWith('block:') && isEmptyHtml(html))
        .map(({ target }) => target.slice('block:'.length))
    );

    if (emptiedIds.size > 0) {
      next = { ...next, blocks: next.blocks.filter((block) => !emptiedIds.has(block.id)) };
    }

    return next;
  };

  /**
   * Apagar ou substituir uma seleção que atravessa dispositivos.
   *
   * O navegador só edita dentro do campo com o foco, de modo que Delete sobre
   * um trecho longo deixava o resto intacto. Aqui a seleção é recortada por
   * campo e cada trecho é tratado, com o resultado voltando ao documento de
   * uma vez só — inclusive quando o usuário simplesmente digita por cima.
   */
  const handleCanvasKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const isDeletion = event.key === 'Delete' || event.key === 'Backspace';
    const isTypedCharacter =
      event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (!isDeletion && !isTypedCharacter) return;

    const segments = getEditableSegments();
    if (segments.length < 2) return;

    event.preventDefault();

    if (isDeletion) {
      deleteSegments(segments);
    } else {
      replaceSegmentsWithText(segments, event.key);
    }

    onUpdateDoc(applySegmentEdits(segments));
  };

  const modifyTableStructure = (
    html: string,
    action: 'addRow' | 'deleteRow' | 'addColumn' | 'deleteColumn' | 'addCellLeft' | 'addCellRight' | 'mergeCells' | 'splitCells'
  ): string => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const table = doc.querySelector('table');
      if (!table) return html;

      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length === 0) return html;

      // Identifica a célula focada ou selecionada pelo usuário
      const selection = window.getSelection();
      let targetCellElement: Element | null = null;

      if (selection && selection.anchorNode) {
        let node: Node | null = selection.anchorNode;
        while (node && node !== document.body) {
          if (node.nodeType === Node.ELEMENT_NODE && ((node as Element).tagName === 'TD' || (node as Element).tagName === 'TH')) {
            targetCellElement = node as Element;
            break;
          }
          node = node.parentNode;
        }
      }

      if (action === 'splitCells') {
        let splitTarget: Element | null = null;

        if (targetCellElement) {
          const textToFind = targetCellElement.textContent?.trim();
          for (const row of rows) {
            for (const cell of Array.from(row.querySelectorAll('td, th'))) {
              if (textToFind && cell.textContent?.trim() === textToFind) {
                splitTarget = cell;
                break;
              }
            }
            if (splitTarget) break;
          }
        }

        if (!splitTarget) {
          for (const row of rows) {
            for (const cell of Array.from(row.querySelectorAll('td, th'))) {
              const cs = parseInt(cell.getAttribute('colspan') || '1', 10);
              const rs = parseInt(cell.getAttribute('rowspan') || '1', 10);
              if (cs > 1 || rs > 1) {
                splitTarget = cell;
                break;
              }
            }
            if (splitTarget) break;
          }
        }

        if (splitTarget) {
          const colspan = parseInt(splitTarget.getAttribute('colspan') || '1', 10);
          splitTarget.removeAttribute('colspan');
          splitTarget.removeAttribute('rowspan');
          for (let i = 1; i < colspan; i++) {
            const newTd = doc.createElement(splitTarget.tagName.toLowerCase());
            newTd.setAttribute(
              'style',
              'border: 1px solid #000; padding: 6px; text-align: left; vertical-align: top; resize: horizontal; overflow: auto; min-width: 35px;'
            );
            newTd.innerHTML = '&nbsp;';
            splitTarget.insertAdjacentElement('afterend', newTd);
          }
        }
      } else if (action === 'mergeCells') {
        let mergeTarget: Element | null = null;

        if (targetCellElement) {
          const textToFind = targetCellElement.textContent?.trim();
          for (const row of rows) {
            for (const cell of Array.from(row.querySelectorAll('td, th'))) {
              if (textToFind && cell.textContent?.trim() === textToFind && cell.nextElementSibling) {
                mergeTarget = cell;
                break;
              }
            }
            if (mergeTarget) break;
          }
        }

        if (!mergeTarget) {
          for (const row of rows) {
            const cells = Array.from(row.querySelectorAll('td, th'));
            if (cells.length > 1) {
              mergeTarget = cells[0];
              break;
            }
          }
        }

        if (mergeTarget && mergeTarget.nextElementSibling) {
          const c1 = mergeTarget as HTMLElement;
          const c2 = mergeTarget.nextElementSibling as HTMLElement;
          const span1 = parseInt(c1.getAttribute('colspan') || '1', 10);
          const span2 = parseInt(c2.getAttribute('colspan') || '1', 10);
          c1.setAttribute('colspan', String(span1 + span2));
          if (c2.textContent?.trim()) {
            c1.innerHTML += (c1.textContent?.trim() ? ' ' : '') + c2.innerHTML;
          }
          c2.remove();
        }
      } else if (action === 'addCellLeft') {
        rows.forEach((row) => {
          const firstCell = row.firstElementChild;
          const cellTag = firstCell?.tagName.toLowerCase() || 'td';
          const newCell = doc.createElement(cellTag);
          newCell.setAttribute(
            'style',
            'border: 1px solid #000; padding: 6px; text-align: left; vertical-align: top; resize: horizontal; overflow: auto; min-width: 35px;'
          );
          newCell.innerHTML = '&nbsp;';
          if (firstCell) {
            row.insertBefore(newCell, firstCell);
          } else {
            row.appendChild(newCell);
          }
        });
      } else if (action === 'addCellRight') {
        rows.forEach((row) => {
          const lastCell = row.lastElementChild;
          const cellTag = lastCell?.tagName.toLowerCase() || 'td';
          const newCell = doc.createElement(cellTag);
          newCell.setAttribute(
            'style',
            'border: 1px solid #000; padding: 6px; text-align: left; vertical-align: top; resize: horizontal; overflow: auto; min-width: 35px;'
          );
          newCell.innerHTML = '&nbsp;';
          row.appendChild(newCell);
        });
      } else if (action === 'addRow') {
        const lastRow = rows[rows.length - 1];
        const colCount = Math.max(1, lastRow.children.length);
        const newTr = doc.createElement('tr');
        for (let i = 0; i < colCount; i++) {
          const td = doc.createElement('td');
          td.setAttribute(
            'style',
            'border: 1px solid #000; padding: 6px; text-align: left; vertical-align: top; resize: horizontal; overflow: auto; min-width: 35px;'
          );
          td.innerHTML = '&nbsp;';
          newTr.appendChild(td);
        }
        table.querySelector('tbody')?.appendChild(newTr) || table.appendChild(newTr);
      } else if (action === 'deleteRow') {
        if (rows.length > 1) {
          rows[rows.length - 1].remove();
        }
      } else if (action === 'addColumn') {
        rows.forEach((row) => {
          const cellTag = row.querySelector('th') ? 'th' : 'td';
          const newCell = doc.createElement(cellTag);
          newCell.setAttribute(
            'style',
            'border: 1px solid #000; padding: 6px; text-align: left; vertical-align: top; resize: horizontal; overflow: auto; min-width: 35px;'
          );
          newCell.innerHTML = '&nbsp;';
          row.appendChild(newCell);
        });
      } else if (action === 'deleteColumn') {
        rows.forEach((row) => {
          if (row.children.length > 1) {
            row.children[row.children.length - 1].remove();
          }
        });
      }

      return table.outerHTML;
    } catch (e) {
      console.error('Erro ao modificar estrutura da tabela:', e);
      return html;
    }
  };

  /*
   * O padrão Planalto imprime a ordem de execução em negrito. Quando o usuário
   * limpa a formatação, a marca abaixo registra a escolha para que nem a tela
   * nem o serializador reponham o negrito por conta própria.
   */
  const ordemExecucaoHtml = /<[a-z][^>]*>/i.test(doc.ordemExecucao)
    ? doc.ordemExecucao
    : `<b>${doc.ordemExecucao}</b>`;

  const handleDeletePart = (patch: Partial<LegislativeDocument>) => {
    onUpdateDoc({ ...doc, ...patch });
  };

  const handleDeleteAssinatura = (index: number) => {
    const updated = doc.assinaturas.filter((_, i) => i !== index);
    onUpdateDoc({ ...doc, assinaturas: updated });
  };

  /**
   * Alinhamento de uma parte fixa e o recuo que combina com ele. Os padrões
   * vêm de `utils/docTargets.ts`, os mesmos que o serializador grava no
   * arquivo — é o que mantém a folha e o HTML salvo dizendo a mesma coisa.
   *
   * A ementa é a única parte sem recuo, e por isso pede `recuo: false`: no
   * arquivo ela é a segunda coluna de uma tabela, e o `<p>` que a serializa não
   * leva `text-indent` algum. O recuo que a folha desenhava era diferença nossa,
   * não do documento.
   */
  const partLayout = (target: string, recuo = true): React.CSSProperties => {
    const align = resolvedAlignForTarget(doc, target);
    return { textAlign: align, textIndent: recuo ? indentForAlign(align) : undefined };
  };

  /** Barra flutuante de exclusão das partes fixas. É chrome flutuando sobre a folha e acompanha o tema. */
  const partActions = (label: string, onDelete: () => void) => (
    <div className="absolute -right-2 -top-3 hidden group-hover:flex items-center bg-sup-1 text-texto rounded-[7px] shadow-cej-3 border border-borda p-[3px] z-20 space-x-1 text-xs">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="p-1 rounded text-texto-fraco hover:bg-falha-suave hover:text-falha transition-colors"
        title={`Excluir ${label}`}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );

  /*
   * Anel de seleção e hover sobre a folha: cinza-azul fixo, não token
   * (invariante 2 do design system) — o fundo deles é o papel branco, que não
   * muda com o tema.
   */
  const selectionRingClass = (id: string) =>
    selectedBlockId === id
      ? '[outline:2px_solid_#1351b4] [outline-offset:6px]'
      : 'hover:[outline:1px_solid_#d5dde6] hover:[outline-offset:6px]';

  /*
   * A folha é centrada por `mx-auto` no próprio papel, e não por
   * `justify-center` no canvas: numa janela estreita, o item centralizado por
   * `justify-content` transborda para os dois lados e a metade esquerda fica
   * fora do alcance da rolagem. Com a margem automática, o excesso continua
   * acessível.
   */
  /**
   * Desenha um dispositivo na folha.
   *
   * `index` é a posição no ato inteiro, e não na fatia em que o dispositivo
   * está sendo desenhado: a folha desenha o corpo e o anexo em duas passagens,
   * e os manipuladores escrevem por índice — `handleBlockEnter` faz
   * `blocks[index] = …`. Um índice relativo à fatia do anexo sobrescreveria o
   * art. 1º.
   */
  const corte = inicioDoAnexo(doc.blocks);
  const corpo = doc.blocks.slice(0, corte);
  const anexo = doc.blocks.slice(corte);

  const renderBlock = (block: LegislativeBlock, index: number) => {
    const isSelected = selectedBlockId === block.id;
    const target = blockTarget(block.id);
    const align = block.align || defaultAlignForBlockType(block.type);
    const layout: React.CSSProperties = { textAlign: align, textIndent: indentForAlign(align) };

    /*
     * O dispositivo citado se recolhe à direita do artigo que o altera. Os
     * 80px são os dois `<blockquote>` de 40px que o arquivo salvo escreve —
     * mudou aqui, muda lá (invariante 1). A tabela citada fica onde está: os
     * dois recuos a empurrariam para fora da folha.
     */
    const citado = estaEmCitacao(block) && block.type !== 'TABELA';
    const recuoDaCitacao = citado ? 'ml-[80px] mr-[40px]' : '';
    const abre = citado && abreAspas(block);
    const fecha = citado && fechaAspas(block);
    /*
     * O negrito do agrupador é o padrão Planalto, não uma escolha do redator —
     * e o redator pode querer sobrescrevê-la, como já pode com a ordem de
     * execução (`ordemExecucaoHtml`, acima). Uma etiqueta qualquer já presente
     * no conteúdo é o sinal de que ele decidiu algo sobre a formatação ali:
     * "Limpar formatação" deixa a marca de sobra (`markAsPlainFormat`) mesmo
     * quando o texto volta a ser texto puro, para que o negrito padrão não
     * reapareça sozinho no próximo render.
     */
    const semNegritoPadrao = desenhaComoTitulo(block.type) && /<[a-z][^>]*>/i.test(block.content);
    /*
     * O parágrafo que só traz as marcas — o `” (NR)` que fecha, sozinho, a
     * citação de um anexo inteiro — não pede texto: ali não falta dispositivo
     * a escrever, e a frase de espera do CSS seria um convite a preencher o
     * que o ato não tem.
     */
    const soMarcas = (abre || fecha) && !block.content;
    const fraseDeEspera = soMarcas
      ? undefined
      : citado
      ? 'Texto do dispositivo alterado'
      : 'Novo conteúdo';

    return (
      <div
        key={block.id}
        id={`block-${block.id}`}
        onClick={() => handleCanvasBlockClick(block.id)}
        /*
         * A folga vertical é a margem de 15px que o arquivo salvo
         * aplica entre parágrafos: ela mora aqui, no invólucro, e não
         * no parágrafo, para que o realce de seleção também a cubra.
         */
        className={`relative group rounded px-2 py-[7px] transition-all ${
          isSelected
            ? '[outline:2px_solid_#1351b4] [outline-offset:6px]'
            : 'hover:[outline:1px_solid_#d5dde6] hover:[outline-offset:6px]'
        }`}
      >
        {/* Barra flutuante de ações do bloco — chrome sobre a folha, acompanha o tema. */}
        <div className="absolute -right-2 -top-3 hidden group-hover:flex items-center bg-sup-1 text-texto rounded-[7px] shadow-cej-3 border border-borda p-[3px] z-20 space-x-1 text-xs">
          <button
            onClick={(e) => handleAddBlockBelow(index, 'TEXTO_LIVRE', e)}
            className="p-1 rounded text-texto hover:bg-sup-3 transition-colors flex items-center gap-0.5"
            title="Inserir linha sem formatação abaixo (ou tecle Enter)"
          >
            <CornerDownLeft size={13} /> Novo conteúdo
          </button>
          <button
            onClick={(e) => handleAddBlockBelow(index, 'ARTIGO', e)}
            className="p-1 rounded text-rank hover:bg-sup-3 transition-colors flex items-center gap-0.5"
            title="Adicionar Artigo Abaixo"
          >
            <Plus size={13} /> Art
          </button>
          <button
            onClick={(e) => handleAddBlockBelow(index, 'PARAGRAFO', e)}
            className="p-1 rounded text-texto-fraco hover:bg-sup-3 hover:text-texto transition-colors flex items-center gap-0.5"
            title="Adicionar Parágrafo Abaixo"
          >
            <Plus size={13} /> §
          </button>
          {/*
            As setas param na fronteira entre o corpo e o anexo, e não só nas
            pontas do ato. Atravessá-la com um clique mandaria o dispositivo
            para o outro lado das assinaturas — uma viagem de dezenas de linhas
            que a seta "mover para baixo" não anuncia.
          */}
          <button
            onClick={(e) => handleMoveBlock(index, 'up', e)}
            disabled={index === 0 || index === corte}
            className="p-1 rounded text-texto-fraco hover:bg-sup-3 hover:text-texto transition-colors disabled:opacity-35 disabled:hover:bg-transparent"
            title="Mover para cima"
          >
            <ArrowUp size={13} />
          </button>
          <button
            onClick={(e) => handleMoveBlock(index, 'down', e)}
            disabled={index === doc.blocks.length - 1 || index === corte - 1}
            className="p-1 rounded text-texto-fraco hover:bg-sup-3 hover:text-texto transition-colors disabled:opacity-35 disabled:hover:bg-transparent"
            title="Mover para baixo"
          >
            <ArrowDown size={13} />
          </button>
          <button
            onClick={(e) => handleDuplicateBlock(block, e)}
            className="p-1 rounded text-texto-fraco hover:bg-sup-3 hover:text-texto transition-colors"
            title="Duplicar Bloco"
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation();
              onInsertLink();
            }}
            className="p-1 rounded text-texto-fraco hover:bg-sup-3 hover:text-texto transition-colors"
            title="Inserir link no trecho selecionado"
          >
            <Link2 size={13} />
          </button>
          <button
            onClick={(e) => handleDeleteBlock(block.id, e)}
            className="p-1 rounded text-texto-fraco hover:bg-falha-suave hover:text-falha transition-colors"
            title="Excluir Bloco"
          >
            <Trash2 size={13} />
          </button>
        </div>

        {/* Renderização do Bloco Conforme o Tipo */}
        {block.type === 'TABELA' ? (
          <div className="border border-black/10 rounded-lg p-3 bg-black/[0.02] shadow-sm">
            <div className="flex items-center justify-between mb-2 select-none border-b border-black/10 pb-2">
              <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <TableIcon size={15} className="text-black/50" /> Tabela
              </div>
              <div className="flex flex-wrap items-center gap-1 text-[11px]">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const newHtml = modifyTableStructure(block.content, 'addRow');
                    handleUpdateBlockContent(block.id, newHtml);
                  }}
                  className={tableActionButtonBaseClass}
                  title="Adicionar Linha na Tabela"
                >
                  + Linha
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const newHtml = modifyTableStructure(block.content, 'deleteRow');
                    handleUpdateBlockContent(block.id, newHtml);
                  }}
                  className={tableActionButtonBaseClass}
                  title="Remover Última Linha"
                >
                  - Linha
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const newHtml = modifyTableStructure(block.content, 'addColumn');
                    handleUpdateBlockContent(block.id, newHtml);
                  }}
                  className={tableActionButtonBaseClass}
                  title="Adicionar Coluna na Tabela"
                >
                  + Coluna
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const newHtml = modifyTableStructure(block.content, 'deleteColumn');
                    handleUpdateBlockContent(block.id, newHtml);
                  }}
                  className={tableActionButtonBaseClass}
                  title="Remover Última Coluna"
                >
                  - Coluna
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const newHtml = modifyTableStructure(block.content, 'addCellLeft');
                    handleUpdateBlockContent(block.id, newHtml);
                  }}
                  className={tableActionButtonBaseClass}
                  title="Adicionar célula à esquerda completando a coluna"
                >
                  + Célula Esq.
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const newHtml = modifyTableStructure(block.content, 'addCellRight');
                    handleUpdateBlockContent(block.id, newHtml);
                  }}
                  className={tableActionButtonBaseClass}
                  title="Adicionar célula à direita completando a coluna"
                >
                  + Célula Dir.
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const newHtml = modifyTableStructure(block.content, 'mergeCells');
                    handleUpdateBlockContent(block.id, newHtml);
                  }}
                  className={tableActionButtonBaseClass}
                  title="Mesclar duas células adjacentes da tabela"
                >
                  Mesclar Células
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const newHtml = modifyTableStructure(block.content, 'splitCells');
                    handleUpdateBlockContent(block.id, newHtml);
                  }}
                  className={tableActionButtonBaseClass}
                  title="Separar/Desfazer células mescladas na tabela"
                >
                  Separar Células
                </button>
              </div>
            </div>
            <Editable
              target={target}
              html={block.content}
              onCommit={(html) => handleUpdateBlockContent(block.id, html)}
              ariaLabel="Tabela"
              className="overflow-x-auto text-xs outline-none focus:ring-1 focus:ring-[#1351b4] p-1 [&_td]:cursor-text [&_td]:focus:bg-[#e8f0fb] [&_th]:cursor-text"
            />
          </div>
        ) : desenhaComoTitulo(block.type) ? (
          /*
           * Agrupador. O rótulo fica fora do campo editável, como nos
           * demais dispositivos: no arquivo salvo ele e a denominação
           * são uma linha só — "CAPÍTULO I - DAS DISPOSIÇÕES" —, e é
           * por isso que os dois correm inline. O que vem do arquivo
           * importado traz a denominação inteira no conteúdo, sem
           * rótulo, e continua aparecendo como sempre apareceu.
           */
          <div
            className={`${semNegritoPadrao ? '' : 'font-bold'} text-[10pt] ${recuoDaCitacao}`}
            style={layout}
          >
            {abre && <span className="select-none">{ASPAS_ABRE}</span>}
            {block.numberLabel && (
              <NumberLabelEditable
                label={normalizeNumberLabel(block.numberLabel)}
                className="select-none"
                struckThrough={block.identificadorTachado}
                onCommit={(value) => handleUpdateBlockLabel(block.id, value)}
              >
                {' - '}
              </NumberLabelEditable>
            )}
            <Editable
              target={target}
              html={block.content}
              onCommit={(html) => handleUpdateBlockContent(block.id, html)}
              onKeyDown={(event) => handleBlockEnter(index, event)}
              ariaLabel="Agrupador"
              placeholder="Denominação do agrupador"
              className={`inline outline-none focus:bg-[#e8f0fb] ${semNegritoPadrao ? '' : 'font-bold'} cursor-text`}
            />
            {fecha && <span className="select-none">{ASPAS_FECHA}</span>}
          </div>
        ) : (
          /*
           * Dispositivo comum. O rótulo é inline e o campo editável
           * também: assim a segunda linha volta à margem esquerda, como
           * no arquivo salvo, em vez de ficar pendurada sob o texto.
           *
           * Citado, ele se recolhe à direita do artigo que o altera — e a
           * citação inteira se recolhe junto, não só as linhas com aspas.
           */
          <div
            className={`text-[10pt] ${recuoDaCitacao}`}
            style={layout}
            onClick={(event) => {
              if (event.target === event.currentTarget) focusEditableTarget(target);
            }}
          >
            {abre && <span className="select-none">{ASPAS_ABRE}</span>}
            {block.numberLabel && (
              <NumberLabelEditable
                label={normalizeNumberLabel(block.numberLabel)}
                className="font-normal select-none"
                struckThrough={block.identificadorTachado}
                onCommit={(value) => handleUpdateBlockLabel(block.id, value)}
              >
                &nbsp;
              </NumberLabelEditable>
            )}
            <Editable
              target={target}
              html={normalizeNumberedContentHtml(block.content, Boolean(block.numberLabel))}
              onCommit={(html) => handleUpdateBlockContent(block.id, html)}
              onKeyDown={(event) => handleBlockEnter(index, event)}
              ariaLabel={
                citado
                  ? `${block.numberLabel || 'Dispositivo'} do ato alterado`
                  : block.numberLabel || 'Dispositivo'
              }
              placeholder={fraseDeEspera}
              className="inline outline-none focus:bg-[#e8f0fb] cursor-text"
            />
            {fecha && <span className="select-none">{ASPAS_FECHA}</span>}
            {/* A linha pontilhada que encerra a alteração também leva a marca. */}
            {block.novaRedacao && <span className="select-none"> (NR)</span>}
          </div>
        )}
      </div>
    );
  };

  return (
    <main
      ref={rolagemRef}
      className="flex-1 h-full bg-sup-fundo overflow-y-auto p-2 sm:p-4 lg:p-6 flex items-start selection:bg-[#b7d3f5] selection:text-black"
      onKeyDown={handleCanvasKeyDown}
      /*
        A etiqueta é posicionada em coordenadas de janela, medidas no instante em
        que o ponteiro entrou na marca. Rolar a folha move a marca e deixa a
        etiqueta para trás, apontando para o nada: ela sai de cena e volta na
        próxima marca visitada.
      */
      onScroll={() => setHint((previous) => (previous ? null : previous))}
    >
      {/*
        Folha do ato normativo. A geometria daqui — Arial 10pt, recuo de 38px na
        primeira linha, justificação, margens de 15px — é a mesma que
        parser/htmlSerializer.ts escreve no arquivo salvo, e não uma escolha de
        estilo: divergir daqui é divergir do documento oficial.

        Vale também para a tinta das remissões: ela vem de utils/anchors.ts, a
        mesma que o serializador escreve na folha de estilo do arquivo salvo, de
        modo que o link azul da tela e o do documento exportado são a mesma cor.

        É também por isso que a folha tem largura mínima. Espremida abaixo dela,
        a ementa de duas colunas e o cabeçalho do brasão — que são tabelas de
        proporção fixa no arquivo salvo — colapsam em uma coluna ilegível, e o
        que se vê deixa de ser o documento. Numa janela estreita, portanto, a
        folha mantém a forma e o canvas rola; só as margens ao redor cedem.
      */}
      <div
        onMouseDown={handlePaperMouseDown}
        onClick={handlePaperClick}
        onContextMenu={handlePaperContextMenu}
        onMouseOver={handlePaperMouseOver}
        onMouseLeave={() => setHint(null)}
        style={
          {
            '--cej-link': LINK_INK,
            '--cej-link-hover': LINK_INK_HOVER,
          } as React.CSSProperties
        }
        className="folha w-full min-w-[640px] max-w-4xl mx-auto bg-white shadow-cej-2 min-h-full h-fit px-5 sm:px-8 lg:px-12 py-6 lg:py-10 mb-12 text-black [font-family:Arial,Helvetica,sans-serif] text-[10pt] leading-normal border border-borda rounded-md select-text"
      >
        {/* Cabeçalho — no arquivo salvo, brasão e epígrafe ficam dentro de um blockquote. */}
        <div className="mb-4 px-10 select-text">
          <div className="w-full flex items-center justify-center">
            <table className="w-[70%] border-0">
              <tbody>
                <tr>
                  <td className="w-[14%] text-left align-top">
                    <img
                      src="https://www.planalto.gov.br/ccivil_03/LEIS/QUADRO/Brastra.gif"
                      alt="Brasão da República"
                      className="w-[74px] h-[82px] object-contain"
                    />
                  </td>
                  <td className="w-[86%] text-center">
                    <div className="text-[#808000] font-bold leading-snug">
                      <div className="text-[14.4pt]">Presidência da República</div>
                      <div className="text-[12pt]">Casa Civil</div>
                      <div className="text-[10pt]">Secretaria Especial para Assuntos Jurídicos</div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Epígrafe */}
          {!isEmptyHtml(doc.epigrafe) && (
            <div
              id="block-epigrafe"
              onClick={() => handleCanvasBlockClick('epigrafe')}
              className={`relative group w-full my-[13px] p-1 rounded cursor-text transition-all ${selectionRingClass(
                'epigrafe'
              )}`}
              style={partLayout(partTarget('epigrafe'))}
            >
              {partActions('Epígrafe', () => handleDeletePart({ epigrafe: '' }))}
              <Editable
                target={partTarget('epigrafe')}
                html={doc.epigrafe}
                onCommit={(html) => commitTarget(partTarget('epigrafe'), html)}
                onKeyDown={handlePartEnter}
                ariaLabel="Epígrafe do ato"
                placeholder="Epígrafe"
                className="outline-none focus:bg-[#e8f0fb] rounded font-bold text-[8.3pt] text-[#000080] underline"
              />
            </div>
          )}
        </div>

        {/* Ementa — tabela de duas colunas, tal como sai no arquivo salvo. */}
        {!isEmptyHtml(doc.ementa) && (
          <div id="block-ementa" onClick={() => handleCanvasBlockClick('ementa')} className="w-full flex gap-4">
            <div className="w-1/2 shrink-0 text-[10pt]" />
            <div
              className={`relative group w-1/2 p-1 rounded cursor-text transition-all ${selectionRingClass('ementa')}`}
            >
              {partActions('Ementa', () => handleDeletePart({ ementa: '' }))}
              <Editable
                target={partTarget('ementa')}
                html={doc.ementa}
                onCommit={(html) => commitTarget(partTarget('ementa'), html)}
                onKeyDown={handlePartEnter}
                ariaLabel="Ementa do ato"
                placeholder="Ementa"
                className="outline-none focus:bg-[#e8f0fb] rounded text-[10pt] text-[#800000]"
                style={partLayout(partTarget('ementa'), false)}
              />
            </div>
          </div>
        )}

        {(doc.avisosPreliminares || !isEmptyHtml(doc.ementa)) && (
          <div
            id="block-avisosPreliminares"
            onClick={() => handleCanvasBlockClick('avisosPreliminares')}
            className={`relative group w-full my-[15px] p-1 rounded cursor-text transition-all ${selectionRingClass(
              'avisosPreliminares'
            )}`}
          >
            {partActions('Aviso preliminar', () => handleDeletePart({ avisosPreliminares: '' }))}
            <Editable
              target={partTarget('avisosPreliminares')}
              html={doc.avisosPreliminares || '<a href="#art1">Vigência</a>'}
              onCommit={(html) => commitTarget(partTarget('avisosPreliminares'), html)}
              onKeyDown={handlePartEnter}
              ariaLabel="Aviso preliminar do ato"
              placeholder="Aviso preliminar"
              className="outline-none focus:bg-[#e8f0fb] rounded text-[10pt]"
            />
          </div>
        )}

        {/* Preâmbulo */}
        {!isEmptyHtml(doc.preambulo) && (
          <div
            id="block-preambulo"
            onClick={() => handleCanvasBlockClick('preambulo')}
            className={`relative group w-full my-[15px] p-1 rounded cursor-text transition-all ${selectionRingClass(
              'preambulo'
            )}`}
          >
            {partActions('Preâmbulo', () => handleDeletePart({ preambulo: '' }))}
            <Editable
              target={partTarget('preambulo')}
              html={doc.preambulo}
              onCommit={(html) => commitTarget(partTarget('preambulo'), html)}
              onKeyDown={handlePartEnter}
              ariaLabel="Preâmbulo do ato"
              placeholder="Preâmbulo"
              className="outline-none focus:bg-[#e8f0fb] rounded text-[10pt]"
              style={partLayout(partTarget('preambulo'))}
            />
          </div>
        )}

        {/* Ordem de execução (DECRETA:) */}
        {!isEmptyHtml(doc.ordemExecucao) && (
          <div
            id="block-ordemExecucao"
            onClick={() => handleCanvasBlockClick('ordemExecucao')}
            className={`relative group w-full my-[15px] p-1 rounded cursor-text transition-all ${selectionRingClass(
              'ordemExecucao'
            )}`}
          >
            {partActions('Ordem de Execução (DECRETA:)', () => handleDeletePart({ ordemExecucao: '' }))}
            <Editable
              target={partTarget('ordemExecucao')}
              html={ordemExecucaoHtml}
              onCommit={(html) => commitTarget(partTarget('ordemExecucao'), html)}
              onKeyDown={handleOrdemExecucaoEnter}
              ariaLabel="Ordem de execução"
              placeholder="DECRETA:"
              className="outline-none focus:bg-[#e8f0fb] rounded text-[10pt]"
              style={partLayout(partTarget('ordemExecucao'))}
            />
          </div>
        )}

        {/* Corpo do ato */}
        <div className="select-text">
          {corpo.map((block, posicao) => renderBlock(block, posicao))}

          {/* Ponto de partida para escrever sem antes escolher o tipo do dispositivo. */}
          <button
            type="button"
            onClick={(event) => handleAddBlockBelow(corte - 1, 'TEXTO_LIVRE', event)}
            className="w-full mt-2 py-2 rounded border border-dashed border-black/15 text-black/40 hover:text-black/70 hover:border-black/30 hover:bg-black/[0.02] text-[9pt] transition-colors select-none"
          >
            + Novo conteúdo
          </button>
        </div>

        {/* Fecho e assinaturas */}
        <div id="block-fecho" className="mt-4 select-text">
          {!isEmptyHtml(doc.fecho) && (
            <div
              onClick={() => handleCanvasBlockClick('fecho')}
              className={`relative group my-[15px] p-1 rounded cursor-text transition-all ${selectionRingClass(
                'fecho'
              )}`}
            >
              {partActions('Fecho', () => handleDeletePart({ fecho: '' }))}
              <Editable
                target={partTarget('fecho')}
                html={doc.fecho}
                onCommit={(html) => commitTarget(partTarget('fecho'), html)}
                onKeyDown={handlePartEnter}
                ariaLabel="Fecho, local e data"
                placeholder="Local e data"
                className="outline-none focus:bg-[#e8f0fb] rounded text-[10pt]"
                style={partLayout(partTarget('fecho'))}
              />
            </div>
          )}

          <div className="mt-4 font-bold text-[10pt]">
            {doc.assinaturas.map((assinatura, index) => {
              const target = assinaturaTarget(index);
              return (
                <div
                  key={index}
                  onClick={() => handleCanvasBlockClick(`assinatura-${index}`)}
                  className={`relative group px-1 py-[7px] rounded cursor-text transition-all ${selectionRingClass(
                    `assinatura-${index}`
                  )}`}
                >
                  {partActions('Assinatura', () => handleDeleteAssinatura(index))}
                  <Editable
                    target={target}
                    html={assinatura}
                    onCommit={(html) => commitTarget(target, html)}
                    onKeyDown={handlePartEnter}
                    ariaLabel={`Assinatura ${index + 1}`}
                    placeholder="Nome do signatário"
                    className="outline-none focus:bg-[#e8f0fb] rounded font-bold cursor-text"
                    style={partLayout(target)}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/*
          O anexo, que num ato normativo se lê depois das assinaturas. É a cauda
          da mesma lista de dispositivos, a partir do primeiro bloco do tipo
          Anexo — ver `inicioDoAnexo`. Só existe quando o ato tem anexo: o botão
          para criar o primeiro está na barra de estrutura.
        */}
        {anexo.length > 0 && (
          <div className="mt-8 pt-4 border-t border-black/10 select-text">
            {anexo.map((block, posicao) => renderBlock(block, corte + posicao))}

            <button
              type="button"
              onClick={(event) => handleAddBlockBelow(doc.blocks.length - 1, 'TEXTO_LIVRE', event)}
              className="w-full mt-2 py-2 rounded border border-dashed border-black/15 text-black/40 hover:text-black/70 hover:border-black/30 hover:bg-black/[0.02] text-[9pt] transition-colors select-none"
            >
              + Novo conteúdo no anexo
            </button>
          </div>
        )}
      </div>

      {/* Menu do botão direito: remissões onde o gesto termina. */}
      {menu && (
        <CanvasContextMenu
          menu={menu}
          onInsertAnchor={onInsertAnchor}
          onInsertLink={onInsertLink}
          onFollowAnchor={onNavigateAnchor}
          onRemoveLink={(element) => editAnchorElement(element, removeLink)}
          onRemoveAnchorPoint={(element) => editAnchorElement(element, removeAnchorPoint)}
          onClose={() => setMenu(null)}
        />
      )}

      {/* O que a marca sob o ponteiro é, que a folha por si só não diz. */}
      {hint && <CanvasHint hint={hint} />}
    </main>
  );
};
