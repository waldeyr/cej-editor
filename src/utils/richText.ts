import { EDITABLE_SELECTOR, EDITABLE_TARGET_ATTR } from './docTargets';

/**
 * Ferramentas de texto sobre uma seleção que pode atravessar vários dispositivos.
 *
 * A folha do ato não é um único campo de texto: cada dispositivo, e cada parte
 * fixa do ato, é um `contentEditable` independente, porque é assim que a
 * estrutura legislativa continua sendo estrutura, e não uma sopa de parágrafos.
 * O preço disso é que `document.execCommand` só enxerga o campo com o foco —
 * selecionar do meio do Art. 1º até o meio do Art. 4º e clicar em negrito não
 * fazia nada.
 *
 * Este módulo resolve o problema recortando a seleção viva em um trecho por
 * campo editável e aplicando a operação em cada trecho. Quem chama recolhe o
 * HTML resultante de cada campo e o devolve ao documento pelo endereço em
 * `data-cej-target`.
 */

export type InlineFormat = 'bold' | 'italic' | 'underline' | 'superscript' | 'subscript';

const TAG_BY_FORMAT: Record<InlineFormat, string> = {
  bold: 'b',
  italic: 'i',
  underline: 'u',
  superscript: 'sup',
  subscript: 'sub',
};

/** Etiquetas equivalentes aceitas na leitura — o HTML importado mistura as duas formas. */
const TAGS_BY_FORMAT: Record<InlineFormat, readonly string[]> = {
  bold: ['b', 'strong'],
  italic: ['i', 'em'],
  underline: ['u'],
  superscript: ['sup'],
  subscript: ['sub'],
};

const INLINE_WRAPPERS = 'span, b, strong, i, em, u, s, mark, a, font, sub, sup, small, big';

const MAX_UNWRAP_DEPTH = 24;

export interface EditableSegment {
  element: HTMLElement;
  target: string;
  range: Range;
}

/** Recorta um intervalo aos limites de um campo editável. */
function clipRangeToElement(range: Range, element: HTMLElement): Range | null {
  const clipped = document.createRange();
  clipped.selectNodeContents(element);

  if (clipped.compareBoundaryPoints(Range.START_TO_START, range) < 0) {
    clipped.setStart(range.startContainer, range.startOffset);
  }
  if (clipped.compareBoundaryPoints(Range.END_TO_END, range) > 0) {
    clipped.setEnd(range.endContainer, range.endOffset);
  }

  return clipped.collapsed ? null : clipped;
}

/**
 * Dá o foco a um campo da folha, com o cursor no início dele.
 *
 * O campo de um dispositivo recém-criado só existe depois que o React o
 * desenha, e é por isso que a busca espera o quadro seguinte: procurar agora
 * não acharia nada.
 */
export function focusEditableTarget(target: string): void {
  requestAnimationFrame(() => {
    const element = document.querySelector<HTMLElement>(
      `[${EDITABLE_TARGET_ATTR}="${CSS.escape(target)}"]`
    );
    if (!element) return;

    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
}

/**
 * Trechos da seleção corrente, um por campo editável tocado.
 * Vazio quando não há seleção ou quando ela está fora da folha.
 */
export function getEditableSegments(root: ParentNode = document): EditableSegment[] {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return [];

  const range = selection.getRangeAt(0);
  const segments: EditableSegment[] = [];

  root.querySelectorAll<HTMLElement>(EDITABLE_SELECTOR).forEach((element) => {
    if (!range.intersectsNode(element)) return;
    const clipped = clipRangeToElement(range, element);
    const target = element.getAttribute(EDITABLE_TARGET_ATTR);
    if (clipped && target) segments.push({ element, target, range: clipped });
  });

  return segments;
}

/** HTML corrente de cada campo tocado, pronto para voltar ao documento. */
export function readSegments(segments: EditableSegment[]): { target: string; html: string }[] {
  return segments.map(({ target, element }) => ({ target, html: element.innerHTML }));
}

/**
 * Parte os nós de texto nas fronteiras da seleção, de modo que todo nó de texto
 * dentro do intervalo passe a estar inteiramente dentro dele. Intervalos vivos
 * são reajustados pelo próprio DOM durante `splitText`.
 */
function splitBoundaryTextNodes(range: Range): void {
  const { endContainer, endOffset } = range;
  if (endContainer.nodeType === Node.TEXT_NODE) {
    const text = endContainer as Text;
    if (endOffset > 0 && endOffset < text.length) text.splitText(endOffset);
  }

  const { startContainer, startOffset } = range;
  if (startContainer.nodeType === Node.TEXT_NODE) {
    const text = startContainer as Text;
    if (startOffset > 0 && startOffset < text.length) text.splitText(startOffset);
  }
}

/** Nós de texto inteiramente contidos no intervalo. */
function collectTextNodes(range: Range, root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    if (text.length === 0) continue;

    const probe = document.createRange();
    probe.selectNodeContents(text);
    const startsBefore = range.compareBoundaryPoints(Range.START_TO_START, probe) <= 0;
    const endsAfter = range.compareBoundaryPoints(Range.END_TO_END, probe) >= 0;
    if (startsBefore && endsAfter) nodes.push(text);
  }

  return nodes;
}

/** Ancestral que aplica o formato ao nó, dentro do campo editável. */
function formatAncestor(node: Node, format: InlineFormat, root: HTMLElement): HTMLElement | null {
  const tags = TAGS_BY_FORMAT[format];
  let current = node.parentElement;

  while (current && current !== root) {
    if (tags.includes(current.tagName.toLowerCase())) return current;
    current = current.parentElement;
  }

  return null;
}

/**
 * Retira `node` de dentro de `ancestor`, partindo em antes/meio/depois cada
 * nível entre os dois. Só o invólucro do próprio `ancestor` desaparece: os
 * níveis intermediários são reconstruídos, para que tirar o negrito de um trecho
 * não leve junto o itálico ou o link que estavam por dentro.
 */
function splitOutOf(node: Node, ancestor: Element): void {
  let current: Node = node;

  for (let depth = 0; depth < MAX_UNWRAP_DEPTH; depth++) {
    const parent = current.parentNode;
    if (!parent || parent.nodeType !== Node.ELEMENT_NODE) return;

    const parentElement = parent as Element;
    const isTarget = parentElement === ancestor;

    const before = parentElement.cloneNode(false) as Element;
    const after = parentElement.cloneNode(false) as Element;
    while (parentElement.firstChild && parentElement.firstChild !== current) {
      before.appendChild(parentElement.firstChild);
    }
    while (current.nextSibling) {
      after.appendChild(current.nextSibling);
    }

    let middle: Node = current;
    if (!isTarget) {
      const wrapper = parentElement.cloneNode(false) as Element;
      wrapper.appendChild(current);
      middle = wrapper;
    }

    const replacement = document.createDocumentFragment();
    if (before.childNodes.length > 0) replacement.appendChild(before);
    replacement.appendChild(middle);
    if (after.childNodes.length > 0) replacement.appendChild(after);
    parentElement.replaceWith(replacement);

    current = middle;
    if (isTarget) return;
  }
}

/** Remove invólucros que ficaram sem conteúdo depois de uma operação. */
export function removeEmptyInlineElements(root: Element): void {
  root.querySelectorAll(INLINE_WRAPPERS).forEach((element) => {
    if (!element.textContent && !element.querySelector('img, br')) element.remove();
  });
}

/** Reposiciona a seleção sobre o trecho recém-tratado. */
function reselect(first: Node | undefined, last: Node | undefined): void {
  if (!first || !last) return;
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.setStart(first, 0);
  range.setEnd(last, last.nodeType === Node.TEXT_NODE ? (last as Text).length : last.childNodes.length);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Aplica ou retira um formato em toda a seleção. O formato é retirado quando
 * *todo* o trecho selecionado já o possui — o mesmo critério de alternância dos
 * editores de texto comuns.
 */
export function applyInlineFormat(segments: EditableSegment[], format: InlineFormat): void {
  const tag = TAG_BY_FORMAT[format];
  const targets: { node: Text; root: HTMLElement }[] = [];

  segments.forEach((segment) => {
    splitBoundaryTextNodes(segment.range);
    collectTextNodes(segment.range, segment.element).forEach((node) => {
      targets.push({ node, root: segment.element });
    });
  });

  if (targets.length === 0) return;

  const shouldRemove = targets.every(({ node, root }) => formatAncestor(node, format, root) !== null);

  targets.forEach(({ node, root }) => {
    const ancestor = formatAncestor(node, format, root);
    if (shouldRemove) {
      if (ancestor) splitOutOf(node, ancestor);
      return;
    }
    if (ancestor) return;

    const wrapper = document.createElement(tag);
    node.replaceWith(wrapper);
    wrapper.appendChild(node);
  });

  segments.forEach(({ element }) => removeEmptyInlineElements(element));
  reselect(targets[0]?.node, targets[targets.length - 1]?.node);
}

/**
 * Transforma a seleção em remissão. Quando o trecho já está dentro de um link,
 * apenas o destino é trocado — evita links aninhados, que o navegador aceita
 * mas o padrão Planalto não.
 */
export function wrapInLink(segments: EditableSegment[], href: string): void {
  const targets: { node: Text; root: HTMLElement }[] = [];

  segments.forEach((segment) => {
    splitBoundaryTextNodes(segment.range);
    collectTextNodes(segment.range, segment.element).forEach((node) => {
      targets.push({ node, root: segment.element });
    });
  });

  targets.forEach(({ node, root }) => {
    let anchor: HTMLElement | null = null;
    let current = node.parentElement;
    while (current && current !== root) {
      if (current.tagName.toLowerCase() === 'a') {
        anchor = current;
        break;
      }
      current = current.parentElement;
    }

    if (anchor) {
      anchor.setAttribute('href', href);
      return;
    }

    const link = document.createElement('a');
    link.setAttribute('href', href);
    node.replaceWith(link);
    link.appendChild(node);
  });

  reselect(targets[0]?.node, targets[targets.length - 1]?.node);
}

/** Elemento `<a>` que envolve um nó, dentro dos limites de um campo editável. */
function anchorAround(node: Node | null, root: HTMLElement): HTMLElement | null {
  let current = node?.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node?.parentElement;

  while (current && current !== root) {
    if (current.tagName.toLowerCase() === 'a') return current;
    current = current.parentElement;
  }
  return null;
}

/**
 * Marca o trecho selecionado como ponto de ancoragem — o destino de uma
 * remissão futura.
 *
 * Ao contrário da remissão, que pode envolver cada nó de texto no seu próprio
 * `<a>`, o ponto de ancoragem precisa nascer como **um** elemento só: dois
 * elementos com o mesmo nome seriam dois destinos disputando o mesmo endereço.
 * Daí o recorte em bloco, com `extractContents`, que devolve um fragmento bem
 * formado mesmo quando a seleção corta um negrito ao meio.
 *
 * Um trecho que já esteja dentro de um `<a>` apenas recebe o nome: âncora
 * dentro de âncora é HTML inválido, e o navegador desfaria o aninhamento.
 */
export function wrapInAnchorPoint(segments: EditableSegment[], name: string): void {
  // Um ponto de ancoragem pertence a um dispositivo; o primeiro trecho da
  // seleção é o que define onde ele fica.
  const segment = segments[0];
  if (!segment) return;

  const existing = anchorAround(segment.range.commonAncestorContainer, segment.element);
  if (existing) {
    existing.setAttribute('name', name);
    return;
  }

  const anchor = document.createElement('a');
  anchor.setAttribute('name', name);
  anchor.appendChild(segment.range.extractContents());
  segment.range.insertNode(anchor);
  segment.element.normalize();

  const selection = window.getSelection();
  const marked = document.createRange();
  marked.selectNodeContents(anchor);
  selection?.removeAllRanges();
  selection?.addRange(marked);
}

/**
 * Dissolve um `<a>` preservando o texto que ele envolvia. Existe porque
 * `clearFormatting` também levaria embora negrito e itálico do trecho, e
 * desfazer uma remissão não deveria custar a formatação em volta dela.
 */
function unwrapAnchor(anchor: HTMLElement): void {
  const parent = anchor.parentNode;
  if (!parent) return;

  while (anchor.firstChild) parent.insertBefore(anchor.firstChild, anchor);
  parent.removeChild(anchor);
  if (parent.nodeType === Node.ELEMENT_NODE) (parent as HTMLElement).normalize();
}

/**
 * Desfaz a remissão. Um trecho que também seja ponto de ancoragem continua
 * sendo — o que se está removendo é a ida, não a chegada.
 */
export function removeLink(anchor: HTMLElement): void {
  if (anchor.hasAttribute('name')) {
    anchor.removeAttribute('href');
    return;
  }
  unwrapAnchor(anchor);
}

/** Desfaz o ponto de ancoragem, preservando a remissão se o trecho também for uma. */
export function removeAnchorPoint(anchor: HTMLElement): void {
  if (anchor.hasAttribute('href')) {
    anchor.removeAttribute('name');
    return;
  }
  unwrapAnchor(anchor);
}

/** Reduz a seleção a texto puro, preservando o texto e descartando os invólucros. */
export function clearFormatting(segments: EditableSegment[]): void {
  const boundaries: Text[] = [];

  segments.forEach((segment) => {
    splitBoundaryTextNodes(segment.range);
    const nodes = collectTextNodes(segment.range, segment.element);
    if (nodes.length > 0) boundaries.push(nodes[0], nodes[nodes.length - 1]);

    nodes.forEach((node) => {
      for (let depth = 0; depth < MAX_UNWRAP_DEPTH; depth++) {
        const parent = node.parentNode;
        if (!parent || parent === segment.element || parent.nodeType !== Node.ELEMENT_NODE) break;
        splitOutOf(node, parent as Element);
      }
    });

    removeEmptyInlineElements(segment.element);
  });

  reselect(boundaries[0], boundaries[boundaries.length - 1]);
}

/** Apaga o conteúdo selecionado em todos os campos tocados. */
export function deleteSegments(segments: EditableSegment[]): void {
  [...segments].reverse().forEach(({ range, element }) => {
    range.deleteContents();
    removeEmptyInlineElements(element);
  });
}

/** Substitui a seleção pelo texto informado e deixa o cursor logo depois dele. */
export function replaceSegmentsWithText(segments: EditableSegment[], text: string): void {
  if (segments.length === 0) return;

  const [firstSegment] = segments;
  const insertionPoint = firstSegment.range.cloneRange();
  insertionPoint.collapse(true);

  deleteSegments(segments);

  const node = document.createTextNode(text);
  insertionPoint.insertNode(node);

  const caret = document.createRange();
  caret.setStart(node, node.length);
  caret.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(caret);
}

/** Formatos ativos na posição corrente do cursor, para acender os botões da barra. */
export function activeFormatsAtSelection(): InlineFormat[] {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return [];

  const anchor = selection.focusNode || selection.anchorNode;
  if (!anchor) return [];

  const start = anchor.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor.parentElement;
  const editable = start?.closest<HTMLElement>(EDITABLE_SELECTOR);
  if (!editable) return [];

  const active = new Set<InlineFormat>();
  let current: Element | null = start;
  while (current && current !== editable) {
    const tagName = current.tagName.toLowerCase();
    (Object.keys(TAGS_BY_FORMAT) as InlineFormat[]).forEach((format) => {
      if (TAGS_BY_FORMAT[format].includes(tagName)) active.add(format);
    });
    current = current.parentElement;
  }

  return [...active];
}

/**
 * Divide um campo no cursor e devolve o HTML que ficou depois dele — a metade
 * que migra para a linha nova criada com Enter.
 */
export function cutContentAfterCaret(element: HTMLElement): string {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return '';

  const caret = selection.getRangeAt(0);
  const lastChild = element.lastChild;
  if (!lastChild || !element.contains(caret.endContainer)) return '';

  // Com texto selecionado, Enter substitui o trecho: some primeiro o que
  // estava selecionado, e só o que vier depois dele migra para a linha nova.
  if (!caret.collapsed) caret.deleteContents();

  const tail = document.createRange();
  tail.setStart(caret.endContainer, caret.endOffset);
  tail.setEndAfter(lastChild);

  const fragment = tail.extractContents();
  const holder = document.createElement('div');
  holder.appendChild(fragment);
  removeEmptyInlineElements(holder);

  return holder.innerHTML;
}
