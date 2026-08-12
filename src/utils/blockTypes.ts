import { BlockType, LegislativeBlock } from '../types/legislative';
import { sanitizeQuoteText } from '../parser/rtfParser';
import { htmlToPlainText } from './docTargets';
import { RANK_NONE, isAgrupador, rankOf } from './rank';

/**
 * Aplicar um tipo de dispositivo a um bloco que já existe.
 *
 * Os botões da barra de estrutura formatam o que está selecionado — o mesmo
 * gesto do negrito, um degrau acima: o redator escreve o texto corrido e depois
 * diz o que cada trecho é. Criar conteúdo novo cabe apenas ao "Novo conteúdo",
 * na folha e na barra.
 *
 * Converter exige numerar, e é por isso que a numeração mora aqui: o rótulo não
 * é editável na folha (ele fica fora do campo, para que a segunda linha volte à
 * margem), de modo que o número que sai daqui é o número que o ato vai ter.
 */

/**
 * Nome de cada tipo na língua do redator. Ele nomeia o botão na barra e o
 * recado na barra de estado, e por isso vive num lugar só: um botão "Alínea"
 * que respondesse "trecho já é ALINEA" seria o editor falando duas línguas.
 */
const BLOCK_TYPE_NAMES: Partial<Record<BlockType, string>> = {
  PARTE: 'Parte',
  LIVRO: 'Livro',
  TITULO: 'Título',
  SUBTITULO: 'Subtítulo',
  CAPITULO: 'Capítulo',
  SECAO: 'Seção',
  SUBSECAO: 'Subseção',
  TITULO_AGRUPADOR: 'Agrupador',
  ARTIGO: 'Artigo',
  PARAGRAFO: 'Parágrafo',
  INCISO: 'Inciso',
  ALINEA: 'Alínea',
  ITEM: 'Item',
  ALTERACAO: 'Alteração',
  OMISSIS: 'Omissis',
  TABELA: 'Tabela',
  ANEXO: 'Anexo',
  TEXTO_LIVRE: 'Novo conteúdo',
};

/** Nome do tipo como ele aparece para quem redige. */
export function blockTypeName(type: BlockType): string {
  return BLOCK_TYPE_NAMES[type] || type;
}

/** LC 95/1998, art. 10, II: ordinal até o nono, cardinal com ponto do décimo em diante. */
const ordinalOrCardinal = (value: number): string => (value <= 9 ? `${value}º` : `${value}.`);

const ROMAN_STEPS: readonly (readonly [number, string])[] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** Algarismo romano do inciso. */
export function toRoman(value: number): string {
  let remaining = Math.max(1, Math.trunc(value));
  let roman = '';

  ROMAN_STEPS.forEach(([step, symbol]) => {
    while (remaining >= step) {
      roman += symbol;
      remaining -= step;
    }
  });

  return roman;
}

/** Letra da alínea: a, b, …, z, aa, ab. O alfabeto acaba antes das alíneas. */
export function toLetters(value: number): string {
  let remaining = Math.max(1, Math.trunc(value));
  let letters = '';

  while (remaining > 0) {
    letters = String.fromCharCode(97 + ((remaining - 1) % 26)) + letters;
    remaining = Math.floor((remaining - 1) / 26);
  }

  return letters;
}

/**
 * Posição do dispositivo entre os seus pares, deduzida da lista plana.
 *
 * Artigos e agrupadores correm em série única no ato inteiro — a numeração dos
 * artigos não recomeça a cada capítulo. Os demais contam dentro do dispositivo
 * que os abriga: a caminhada para trás soma os pares, atravessa o que é mais
 * fundo (que pende de outro pai) e para no primeiro dispositivo de posição
 * superior, que é justamente onde o pai começa. Blocos fora da hierarquia —
 * tabelas, citações, omissis, linhas sem formatação — não contam nem
 * interrompem a contagem.
 */
export function ordinalForTypeAt(
  blocks: readonly LegislativeBlock[],
  index: number,
  type: BlockType,
  counts: (block: LegislativeBlock) => boolean = () => true
): number {
  const rank = rankOf(type);
  if (rank === RANK_NONE) return 0;

  const upTo = Math.max(0, Math.min(index, blocks.length));

  if (type === 'ARTIGO' || isAgrupador(type)) {
    return blocks.slice(0, upTo).filter((block) => block.type === type && counts(block)).length + 1;
  }

  let position = 1;
  for (let i = upTo - 1; i >= 0; i--) {
    const other = rankOf(blocks[i].type);
    if (other === RANK_NONE || other > rank) continue;
    if (other < rank) break;
    if (counts(blocks[i])) position++;
  }

  return position;
}

/**
 * Rótulo com que o dispositivo nasce na posição indicada. `counts` decide quais
 * dispositivos entram na conta — ver `renumberBlocks`, que deixa de fora os
 * rótulos escritos à mão.
 */
export function numberLabelForTypeAt(
  blocks: readonly LegislativeBlock[],
  index: number,
  type: BlockType,
  counts?: (block: LegislativeBlock) => boolean
): string {
  const position = ordinalForTypeAt(blocks, index, type, counts);

  switch (type) {
    case 'PARTE':
      return `PARTE ${position}`;
    case 'LIVRO':
      return `LIVRO ${position}`;
    case 'TITULO':
      return `TÍTULO ${position}`;
    case 'SUBTITULO':
      return `SUBTÍTULO ${position}`;
    case 'CAPITULO':
      return `CAPÍTULO ${position}`;
    case 'SECAO':
      return `Seção ${position}`;
    case 'SUBSECAO':
      return `Subseção ${position}`;
    case 'ARTIGO':
      return `Art. ${ordinalOrCardinal(position)}`;
    case 'PARAGRAFO':
      return `§ ${ordinalOrCardinal(position)}`;
    case 'INCISO':
      return `${toRoman(position)} -`;
    case 'ALINEA':
      return `${toLetters(position)})`;
    case 'ITEM':
      return `${position}.`;
    default:
      return '';
  }
}

/**
 * Rótulo digitado à mão no começo do próprio texto.
 *
 * Quem escreve "Art. 5º Fica instituído…" e pede um artigo já disse qual é o
 * número. Sem isto o rótulo calculado entraria na frente do digitado — "Art. 4º
 * Art. 5º Fica instituído…" — e, como o rótulo não é editável na folha, não
 * haveria como desfazer o engano.
 */
const TYPED_LABEL: Partial<Record<BlockType, RegExp>> = {
  ARTIGO: /^(Art\.?)\s*(\d+)\s*[ºo°]?\s*\.?\s*[-–—]?\s*/i,
  PARAGRAFO: /^(?:(§)\s*(\d+)\s*[ºo°]?\s*\.?|(Parágrafo\s+único)\s*\.?)\s*[-–—]?\s*/i,
  INCISO: /^([IVXLCDM]+)\s*[-–—]\s*/i,
  ALINEA: /^([a-z](?:-[A-Z]+)?)\)\s*/,
  ITEM: /^(\d+)\s*\.\s+/,
};

/** Etiquetas e espaços que antecedem o texto dentro do HTML de um dispositivo. */
const LEADING_MARKUP = /^(?:<[^>]+>|\s|&nbsp;|&#160;)*/;

/**
 * Invólucro vazio no começo do conteúdo. Um rótulo em negrito — "<b>Art. 2º</b>
 * Fica revogado" — deixa o `<b>` para trás quando o texto sai de dentro dele, e
 * o cursor pousado ali faria a próxima palavra nascer em negrito.
 */
const EMPTY_LEADING_WRAPPER = /^(?:\s*<(b|strong|i|em|u|span|font|sup|sub)\b[^>]*>\s*<\/\1>)+/i;

/** Forma canônica do rótulo que o redator digitou, a partir do que a expressão capturou. */
function canonicalTypedLabel(type: BlockType, match: RegExpExecArray): string {
  switch (type) {
    case 'ARTIGO':
      return `Art. ${ordinalOrCardinal(Number.parseInt(match[2], 10))}`;
    case 'PARAGRAFO':
      return match[3] ? 'Parágrafo único.' : `§ ${ordinalOrCardinal(Number.parseInt(match[2], 10))}`;
    case 'INCISO':
      return `${match[1].toUpperCase()} -`;
    case 'ALINEA':
      return `${match[1]})`;
    case 'ITEM':
      return `${match[1]}.`;
    default:
      return '';
  }
}

/**
 * Separa do conteúdo o rótulo que o redator escreveu junto com o texto. As
 * etiquetas em volta ficam onde estavam: o corte é sobre o texto, não sobre a
 * marcação, e um negrito que abre o parágrafo não pode se perder no caminho.
 */
function splitTypedLabel(html: string, type: BlockType): { html: string; label?: string } {
  const pattern = TYPED_LABEL[type];
  if (!pattern) return { html };

  const prefix = LEADING_MARKUP.exec(html)?.[0] ?? '';
  const rest = html.slice(prefix.length);
  const match = pattern.exec(rest);
  if (!match) return { html };

  /*
   * O espaço que separava o rótulo do texto vai embora com ele: na folha e no
   * arquivo salvo quem separa os dois é o próprio rótulo, que já sai seguido de
   * um espaço inseparável.
   */
  const kept = (prefix + rest.slice(match[0].length))
    .replace(EMPTY_LEADING_WRAPPER, '')
    .replace(/^(?:\s|&nbsp;|&#160;)+/, '');

  return { html: kept, label: canonicalTypedLabel(type, match) };
}

/** Denominações que já trazem o nome do agrupador no próprio texto. */
const AGRUPADOR_HEADING = /^(?:<[^>]+>|\s|&nbsp;|&#160;)*(PARTE|LIVRO|T[ÍI]TULO|SUBT[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O)\b/i;

/**
 * O bloco com o novo tipo, já numerado. `preceding` são os blocos que ficam
 * antes dele no ato — é deles que sai a posição, e por isso a conversão de
 * vários dispositivos de uma vez precisa acontecer em ordem.
 *
 * Formatar não escreve. O que a conversão mexe no conteúdo é sempre para tirar
 * dali o que é rótulo ou pontuação de citação — texto que o redator escreveu e
 * que passa a ser guardado noutro campo. Nenhuma palavra nova entra no
 * dispositivo: o texto do ato é do redator, e um botão de formatação que
 * escreve por ele obriga a apagar o que não pediu.
 */
function retypeBlock(
  block: LegislativeBlock,
  type: BlockType,
  preceding: readonly LegislativeBlock[]
): LegislativeBlock {
  /*
   * A citação de dispositivo alterado guarda o rótulo do que se altera: ele é
   * parte do texto citado, e não a posição desta citação no ato que a contém.
   */
  if (type === 'ALTERACAO') {
    const content = sanitizeQuoteText(block.content);
    return { ...block, type, content, rawText: htmlToPlainText(content) };
  }

  /*
   * O omissis não é o enésimo artigo, e por isso perde o rótulo. O texto fica
   * onde está: a linha de pontos é conteúdo, e escrevê-la por cima do que o
   * redator digitou seria justamente inventar texto ao formatar.
   */
  if (type === 'OMISSIS') {
    return { ...block, type, numberLabel: '' };
  }

  /*
   * No agrupador o rótulo é parte da denominação — "CAPÍTULO I - DAS
   * DISPOSIÇÕES" sai assim no arquivo salvo, numa linha só. Ele mora no campo
   * do rótulo, como em qualquer outro dispositivo, e a folha e o serializador o
   * imprimem na frente do texto; escrevê-lo dentro do conteúdo mudaria a frase
   * que o redator tem na tela.
   *
   * Uma denominação que já comece pelo nome do agrupador não recebe rótulo
   * algum: o número dela já está escrito, e é o que o ato diz.
   */
  if (isAgrupador(type)) {
    const numberLabel = AGRUPADOR_HEADING.test(block.content)
      ? ''
      : numberLabelForTypeAt(preceding, preceding.length, type);
    return { ...block, type, numberLabel };
  }

  const { html, label } = splitTypedLabel(block.content, type);
  return {
    ...block,
    type,
    numberLabel: label || numberLabelForTypeAt(preceding, preceding.length, type),
    content: html,
    rawText: htmlToPlainText(html),
  };
}

/** Blocos que a conversão não alcança: o conteúdo deles não é texto de dispositivo. */
const KEEPS_ITS_TYPE: readonly BlockType[] = ['TABELA'];

/**
 * Aplica o tipo aos dispositivos indicados, devolvendo o corpo do ato inteiro.
 *
 * Um bloco que já é do tipo pedido fica como está: o rótulo dele pode ter sido
 * escrito à mão — "Art. 5º-A" de uma inclusão, por exemplo — e refazer a
 * numeração por cima de um clique repetido apagaria essa escolha sem que nada
 * mudasse de fato na folha.
 */
export function applyBlockType(
  blocks: readonly LegislativeBlock[],
  ids: ReadonlySet<string>,
  type: BlockType
): LegislativeBlock[] {
  const applied: LegislativeBlock[] = [];

  blocks.forEach((block) => {
    const convertible =
      ids.has(block.id) && block.type !== type && !KEEPS_ITS_TYPE.includes(block.type);
    applied.push(convertible ? retypeBlock(block, type, applied) : block);
  });

  return applied;
}

/**
 * Rótulos que a numeração automática pode refazer.
 *
 * São os que dizem apenas "este é o enésimo": a forma exata varia com o que o
 * importador trouxe do arquivo — "Art. 13", "Art. 10.", "Art. 1º" — e todas
 * elas são a mesma coisa, o artigo número tal. O que fica de fora é o rótulo em
 * que alguém escreveu algo a mais: "Art. 5º-A" de uma inclusão, "Parágrafo
 * único.", uma alínea "b-A)". Nesses casos o rótulo é decisão de quem redigiu o
 * ato, não consequência da ordem dos parágrafos.
 */
const CANONICAL_LABEL: Partial<Record<BlockType, RegExp>> = {
  ARTIGO: /^Art\.?\s*\d+\s*[ºo°]?\s*\.?$/i,
  PARAGRAFO: /^§\s*\d+\s*[ºo°]?\s*\.?$/,
  INCISO: /^[IVXLCDM]+\s*[-–—]?$/i,
  ALINEA: /^[a-z]\s*\)$/,
  ITEM: /^\d+\s*\.$/,
};

/**
 * O rótulo do dispositivo é fruto da posição dele, e não de uma escolha de quem
 * redigiu? Só esses a renumeração refaz — e só esses ela conta, porque um
 * "Art. 5º-A" incluído por alteração não desloca o artigo seguinte.
 */
export function hasCanonicalLabel(block: LegislativeBlock): boolean {
  const pattern = CANONICAL_LABEL[block.type];
  if (!pattern) return false;

  const label = (block.numberLabel || '').replace(/ /g, ' ').trim();
  return label === '' || pattern.test(label);
}

/**
 * Refaz a numeração dos dispositivos pela ordem em que eles estão no ato.
 *
 * É o que fecha o ciclo da conversão: inserir um artigo no meio do texto deixa
 * os seguintes com o número antigo, e o rótulo não é editável na folha. Sem
 * isto, o único caminho para corrigir o Art. 3º que virou o quarto seria
 * reescrever o ato.
 *
 * Só passa por aqui quem tem rótulo canônico — ver `hasCanonicalLabel`. Os
 * agrupadores ficam de fora: a numeração deles é lida junto com a denominação —
 * "CAPÍTULO I - DAS DISPOSIÇÕES" —, e boa parte dos atos abertos do disco a traz
 * escrita dentro do próprio texto, onde a renumeração não alcança. Mexer só nos
 * que foram convertidos aqui deixaria a série metade refeita, metade não.
 *
 * Os nomes de âncora não acompanham a renumeração de propósito: `art3` é a
 * identidade do dispositivo, e as remissões já criadas apontam para ele, não
 * para o número que ele exibe.
 *
 * `ids` limita a operação a alguns dispositivos; sem ele, o ato inteiro.
 */
export function renumberBlocks(
  blocks: readonly LegislativeBlock[],
  ids?: ReadonlySet<string>
): LegislativeBlock[] {
  const renumbered: LegislativeBlock[] = [];

  blocks.forEach((block) => {
    if (!hasCanonicalLabel(block) || (ids && !ids.has(block.id))) {
      renumbered.push(block);
      return;
    }

    const label = numberLabelForTypeAt(
      renumbered,
      renumbered.length,
      block.type,
      hasCanonicalLabel
    );
    renumbered.push(label === block.numberLabel ? block : { ...block, numberLabel: label });
  });

  return renumbered;
}
