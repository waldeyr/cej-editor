import { BlockAlign, BlockType, LegislativeDocument } from '../types/legislative';
import { isAgrupador } from './rank';

/**
 * Endereçamento dos campos editáveis do canvas.
 *
 * Cada `contentEditable` da folha carrega um `data-cej-target` que identifica
 * de forma única a posição correspondente no documento. É esse endereço que
 * permite a uma seleção que atravessa vários dispositivos ser reescrita de volta
 * no estado: as ferramentas de texto operam sobre o DOM e devolvem pares
 * (alvo, HTML) que este módulo reaplica sobre a AST.
 */

export const EDITABLE_TARGET_ATTR = 'data-cej-target';
export const EDITABLE_SELECTOR = `[${EDITABLE_TARGET_ATTR}]`;

/** Partes fixas do ato, fora da lista de dispositivos. */
export type DocPart = 'epigrafe' | 'ementa' | 'preambulo' | 'ordemExecucao' | 'fecho';

export const blockTarget = (id: string): string => `block:${id}`;
export const partTarget = (part: DocPart): string => `part:${part}`;
export const assinaturaTarget = (index: number): string => `assinatura:${index}`;

/** Marca aplicada à ordem de execução quando o usuário limpa o negrito padrão. */
const PLAIN_FORMAT_MARK = 'data-cej-plain-format';

/** Texto legível de um trecho de HTML — usado no `<title>` e nas prévias. */
export function htmlToPlainText(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
  // A leitura passa pelo DOMParser, e não por um elemento vivo, para que nada
  // do documento aberto seja buscado na rede só para extrair texto.
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return (parsed.body.textContent || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

/** Um campo só está de fato vazio quando não sobra texto nem imagem dentro dele. */
export function isEmptyHtml(html: string): boolean {
  if (!html) return true;
  if (/<(img|table|br)\b/i.test(html)) return false;
  return htmlToPlainText(html).length === 0;
}

/**
 * Reescreve no documento o HTML de um campo editável.
 *
 * A ordem de execução guarda uma marca própria: quando o usuário limpa a
 * formatação, o negrito padrão do padrão Planalto não deve voltar na exportação,
 * e a ausência de qualquer etiqueta no HTML é justamente o que o serializador
 * usaria para reaplicá-lo.
 */
export function applyHtmlToTarget(
  doc: LegislativeDocument,
  target: string,
  html: string
): LegislativeDocument {
  const separator = target.indexOf(':');
  const kind = target.slice(0, separator);
  const key = target.slice(separator + 1);

  if (kind === 'block') {
    return {
      ...doc,
      blocks: doc.blocks.map((block) =>
        block.id === key
          ? { ...block, content: html, rawText: htmlToPlainText(html) }
          : block
      ),
    };
  }

  if (kind === 'assinatura') {
    const index = Number.parseInt(key, 10);
    if (!Number.isInteger(index) || index < 0 || index >= doc.assinaturas.length) return doc;
    const assinaturas = [...doc.assinaturas];
    assinaturas[index] = html;
    return { ...doc, assinaturas };
  }

  if (kind !== 'part') return doc;

  switch (key as DocPart) {
    case 'epigrafe':
      // O <title> do arquivo segue a epígrafe até que alguém o defina à mão.
      return {
        ...doc,
        epigrafe: html,
        title: doc.titleIsManual ? doc.title : htmlToPlainText(html) || doc.title,
      };
    case 'ementa':
      return { ...doc, ementa: html };
    case 'preambulo':
      return { ...doc, preambulo: html };
    case 'ordemExecucao':
      return { ...doc, ordemExecucao: html };
    case 'fecho':
      return { ...doc, fecho: html };
    default:
      return doc;
  }
}

/** Envolve a ordem de execução na marca de "sem formatação" quando ela ficou sem etiquetas. */
export function markOrdemExecucaoAsPlain(html: string): string {
  if (/<[a-z][^>]*>/i.test(html)) return html;
  return `<span ${PLAIN_FORMAT_MARK}="true">${html}</span>`;
}

/**
 * Alinhamento com que cada parte do ato nasce.
 *
 * Este é o único lugar em que esses padrões existem: a folha na tela e o
 * `htmlSerializer` leem daqui, de modo que centralizar o fecho ou as
 * assinaturas vale para o que se vê e para o arquivo salvo ao mesmo tempo. O
 * usuário sobrepõe qualquer um deles pela barra de comandos, e a escolha fica
 * gravada em `doc.partAligns`.
 */
export const PART_ALIGN_DEFAULTS: Readonly<Record<string, BlockAlign>> = {
  'part:epigrafe': 'center',
  'part:ementa': 'justify',
  'part:preambulo': 'justify',
  /*
   * A ordem de execução fecha a frase aberta pelo preâmbulo — "O PRESIDENTE DA
   * REPÚBLICA, no uso da atribuição …, DECRETA:" — e por isso acompanha o
   * parágrafo que a antecede: justificada e com o mesmo recuo de primeira
   * linha. Centralizada, como estava, ela se soltava no meio da página e lia
   * como título. É também o que faz o ato de referência (temp/d13090.html).
   */
  'part:ordemExecucao': 'justify',
  'part:fecho': 'center',
};

/** Assinaturas nascem centralizadas, uma sob a outra ao pé do ato. */
export const ASSINATURA_ALIGN_DEFAULT: BlockAlign = 'center';

/** Agrupadores são centralizados; os demais dispositivos, justificados. */
export function defaultAlignForBlockType(type: BlockType): BlockAlign {
  return isAgrupador(type) ? 'center' : 'justify';
}

/**
 * Alinhamento efetivo de um campo: o que o usuário escolheu ou, na falta dele,
 * o padrão da parte ou do tipo de dispositivo.
 */
export function resolvedAlignForTarget(doc: LegislativeDocument, target: string): BlockAlign {
  const chosen = doc.partAligns?.[target];
  if (chosen) return chosen;

  if (target.startsWith('block:')) {
    const block = doc.blocks.find((candidate) => blockTarget(candidate.id) === target);
    return block?.align || defaultAlignForBlockType(block?.type || 'TEXTO_LIVRE');
  }

  if (target.startsWith('assinatura:')) return ASSINATURA_ALIGN_DEFAULT;
  return PART_ALIGN_DEFAULTS[target] || 'justify';
}

/**
 * O recuo de 38px da primeira linha só faz sentido em texto corrido: aplicado a
 * um parágrafo centralizado, ele desloca a primeira linha e desalinha o bloco.
 */
export function indentForAlign(align: BlockAlign): string {
  return align === 'center' || align === 'right' ? '0' : '38px';
}

/** Alinhamento corrente de um campo, ou `undefined` para o padrão do tipo. */
export function alignForTarget(doc: LegislativeDocument, target: string): BlockAlign | undefined {
  if (target.startsWith('block:')) {
    return doc.blocks.find((block) => blockTarget(block.id) === target)?.align;
  }
  return doc.partAligns?.[target];
}

/** Grava o alinhamento de um campo. `undefined` volta ao padrão do tipo. */
export function setAlignForTarget(
  doc: LegislativeDocument,
  target: string,
  align: BlockAlign | undefined
): LegislativeDocument {
  if (target.startsWith('block:')) {
    return {
      ...doc,
      blocks: doc.blocks.map((block) =>
        blockTarget(block.id) === target ? { ...block, align } : block
      ),
    };
  }

  const partAligns = { ...(doc.partAligns || {}) };
  if (align === undefined) {
    delete partAligns[target];
  } else {
    partAligns[target] = align;
  }
  return { ...doc, partAligns };
}
