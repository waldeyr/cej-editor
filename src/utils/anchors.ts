import { LegislativeBlock, LegislativeDocument } from '../types/legislative';
import { htmlToPlainText } from './docTargets';

/**
 * Pontos de ancoragem e remissões.
 *
 * São duas operações distintas, e a distinção é a razão de este módulo existir:
 *
 *   · o **ponto de ancoragem** é o destino. Marca um trecho do ato com um nome
 *     (`<a name="anexoi">Anexo I</a>`) e não é clicável — no arquivo salvo ele
 *     sai como texto comum, porque um destino não é um link;
 *   · a **remissão** é a origem. É o link propriamente dito, e aponta para um
 *     ponto de ancoragem já existente (`href="#anexoi"`) ou para um endereço
 *     qualquer informado pelo usuário.
 *
 * Um ato pode ter pontos de ancoragem de duas procedências, e as duas contam:
 * os criados à mão, que ficam no HTML do dispositivo, e os que o importador de
 * RTF numera sozinho por artigo, guardados em `LegislativeBlock.linkName`.
 */

/** Tinta das remissões — a mesma na folha e na folha de estilo do arquivo salvo. */
export const LINK_INK = '#0000ee';
export const LINK_INK_HOVER = '#000080';

/** Um destino disponível para remissão. */
export interface AnchorPoint {
  /** Nome da âncora, sem o `#`. */
  name: string;
  /** O trecho marcado, ou o rótulo do dispositivo quando a âncora é do bloco. */
  label: string;
  /** Onde ele está, para o usuário se situar na lista. */
  location: string;
  blockId: string;
}

/** O que o usuário escolheu na caixa de remissão. */
export type LinkChoice =
  | { kind: 'anchor'; name: string }
  | { kind: 'url'; href: string };

/**
 * Reduz um trecho a um nome de âncora: sem acentos, sem espaços e sem
 * pontuação — "Anexo I" vira "anexoi", "Art. 13" vira "art13".
 */
export function slugifyAnchor(source: string): string {
  return source
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 40);
}

/** Texto legível do bloco. */
function plainTextOf(block: LegislativeBlock): string {
  return (block.rawText || htmlToPlainText(block.content)).replace(/\s+/g, ' ').trim();
}

/** Como o dispositivo aparece na lista: o rótulo, ou as primeiras palavras. */
function describeBlock(block: LegislativeBlock): string {
  if (block.numberLabel) return block.numberLabel;
  if (block.type === 'TABELA') return 'Tabela';

  const text = plainTextOf(block);
  if (!text) return 'Dispositivo';
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

/**
 * Âncoras marcadas dentro de um trecho de HTML.
 *
 * A leitura passa pelo DOMParser quando ele existe e cai numa expressão regular
 * no Node — o mesmo arranjo de `htmlToPlainText`, pelo mesmo motivo: nada do
 * documento aberto deve ser buscado na rede só para localizar uma âncora.
 */
function anchorsInHtml(html: string): { name: string; text: string }[] {
  if (!html || !html.includes('name=')) return [];

  if (typeof DOMParser === 'undefined') {
    const found: { name: string; text: string }[] = [];
    const pattern = /<a\b[^>]*\bname=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match = pattern.exec(html);
    while (match) {
      found.push({ name: match[1], text: htmlToPlainText(match[2]) });
      match = pattern.exec(html);
    }
    return found;
  }

  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return [...parsed.querySelectorAll('a[name]')].map((anchor) => ({
    name: anchor.getAttribute('name') || '',
    text: (anchor.textContent || '').replace(/\s+/g, ' ').trim(),
  }));
}

/** Todos os pontos de ancoragem do ato, na ordem em que aparecem. */
export function collectAnchorPoints(doc: LegislativeDocument): AnchorPoint[] {
  const points: AnchorPoint[] = [];

  doc.blocks.forEach((block) => {
    const location = describeBlock(block);

    if (block.linkName) {
      points.push({ name: block.linkName, label: location, location, blockId: block.id });
    }

    anchorsInHtml(block.content).forEach(({ name, text }) => {
      if (!name || points.some((point) => point.name === name)) return;
      points.push({ name, label: text || name, location, blockId: block.id });
    });
  });

  return points;
}

/**
 * Nome para um ponto de ancoragem novo, derivado do trecho marcado. Um trecho
 * que não comece por letra — só pontuação ou números — recai em `ponto…`, porque
 * é por letra que um nome de âncora precisa começar.
 */
export function createAnchorName(doc: LegislativeDocument, selectedText: string): string {
  const taken = new Set(collectAnchorPoints(doc).map((point) => point.name));
  const core = slugifyAnchor(selectedText);
  const base = core && /^[a-z]/.test(core) ? core : `ponto${core || taken.size + 1}`;

  let name = base;
  for (let suffix = 2; taken.has(name); suffix++) {
    name = `${base}-${suffix}`;
  }
  return name;
}

/** Dispositivo em que um ponto de ancoragem está, se ele existir no ato. */
export function findAnchorBlock(
  doc: LegislativeDocument,
  name: string
): LegislativeBlock | undefined {
  const wanted = name.replace(/^#/, '');
  if (!wanted) return undefined;

  const point = collectAnchorPoints(doc).find((candidate) => candidate.name === wanted);
  return point ? doc.blocks.find((block) => block.id === point.blockId) : undefined;
}
