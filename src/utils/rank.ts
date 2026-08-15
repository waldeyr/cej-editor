import { BlockType } from '../types/legislative';

/**
 * Hierarquia dos dispositivos conforme a técnica legislativa da LC 95/1998.
 *
 * Os blocos do documento são uma lista plana (LegislativeBlock.children existe
 * no tipo mas nunca é preenchido), de modo que a posição hierárquica precisa ser
 * derivada do tipo. Este módulo é a fonte única dessa derivação: a trilha da
 * Vista do Ato, a indentação da lista lateral e a rampa da barra de comandos
 * consomem os mesmos valores e por isso não podem divergir entre si.
 *
 * A hierarquia é ordinal, não categórica. Ela é representada por uma única
 * matiz em densidades graduadas — nunca por matizes distintas por tipo.
 */

/** Blocos sem posição na hierarquia (tabelas, citações, omissis). */
export const RANK_NONE = -1;

const RANK_BY_TYPE: Partial<Record<BlockType, number>> = {
  PARTE: 0,
  LIVRO: 0,
  TITULO: 1,
  SUBTITULO: 1,
  CAPITULO: 2,
  SECAO: 2,
  SUBSECAO: 2,
  TITULO_AGRUPADOR: 2,
  ARTIGO: 3,
  PARAGRAFO: 4,
  INCISO: 5,
  ALINEA: 6,
  ITEM: 7,
};

/** Menor e maior posição hierárquica válidas. */
export const RANK_MIN = 0;
export const RANK_MAX = 7;

/**
 * Largura da marca na trilha, em porcentagem. Oito degraus: fina o bastante
 * para que a silhueta do ato revele sua forma, larga o bastante para que
 * agrupadores se destaquem.
 */
export const RANK_TICK_WIDTH: readonly number[] = [100, 88, 76, 62, 50, 38, 28, 20];

/**
 * Densidade da tinta em quatro degraus. Menos degraus que a largura porque a
 * opacidade se torna indistinguível antes disso: agrupadores, artigo,
 * parágrafo/inciso e alínea/item.
 *
 * Vale apenas para as marcas da trilha, que são gráficas e redundantes — a
 * lista rotulada ao lado carrega a mesma informação de forma acessível.
 */
export const RANK_INK: readonly number[] = [1, 1, 1, 0.72, 0.52, 0.52, 0.38, 0.38];

/**
 * Rampa para texto. É deliberadamente mais rasa que RANK_INK: medida sobre
 * --color-rank em --color-tinta-alta, a rampa profunda deixa alínea e item em
 * 2,39:1, muito abaixo do mínimo de 4,5:1 para texto. Aqui o degrau mais claro
 * fica em 0,70 (~4,7:1) e a hierarquia continua legível porque o peso e — na
 * lista lateral — o recuo fazem a maior parte do trabalho.
 */
export const RANK_TEXT_INK: readonly number[] = [1, 1, 1, 0.94, 0.86, 0.8, 0.74, 0.7];

/** Peso Rawline por posição: rótulos em 500, dispositivos internos em 400. */
export const RANK_WEIGHT: readonly number[] = [500, 500, 500, 500, 400, 400, 400, 400];

const AGRUPADORES: readonly BlockType[] = [
  'PARTE',
  'LIVRO',
  'TITULO',
  'SUBTITULO',
  'CAPITULO',
  'SECAO',
  'SUBSECAO',
  'TITULO_AGRUPADOR',
];

/** Posição hierárquica do tipo, ou RANK_NONE para blocos fora da hierarquia. */
export function rankOf(type: BlockType): number {
  const rank = RANK_BY_TYPE[type];
  return rank === undefined ? RANK_NONE : rank;
}

/**
 * Quantos degraus de encaixe os agrupadores têm. Quem empilha os agrupadores
 * numa escala própria — o nome do ponto de ancoragem — precisa saber onde ela
 * acaba, e ler isto é o que impede que um agrupador novo colida em silêncio com
 * o degrau seguinte da escala de quem a consome.
 */
export const TOTAL_DE_AGRUPADORES = AGRUPADORES.length;

/**
 * Ordem de encaixe entre agrupadores — parte, livro, título, capítulo, seção,
 * subseção (LC 95/1998, art. 10, IV), que é a ordem em que `AGRUPADORES` está
 * escrito. Devolve RANK_NONE para o que não é agrupador.
 *
 * É mais fina que `rankOf`, e de propósito: a escala de `rankOf` achata capítulo,
 * seção e subseção num degrau só porque a rampa visual não distingue mais que
 * isso. Quem precisa saber que a seção pende do capítulo — o nome do ponto de
 * ancoragem, que no ato publicado é "capituloisecaoi" — não pode ler dali.
 */
export function ordemDoAgrupador(type: BlockType): number {
  const ordem = AGRUPADORES.indexOf(type);
  return ordem === -1 ? RANK_NONE : ordem;
}

/** Agrupadores são centralizados e em caixa alta no documento e na lista. */
export function isAgrupador(type: BlockType): boolean {
  return AGRUPADORES.includes(type);
}

/**
 * O bloco se desenha como título: centralizado e em negrito, na folha e no
 * arquivo salvo.
 *
 * O anexo entra aqui, mas **não** em `AGRUPADORES` nem em `RANK_BY_TYPE`: ele
 * não é degrau da hierarquia ordinal (invariante 5) — não está acima nem abaixo
 * de um artigo, está fora da articulação. Pô-lo na escala o faria contar série
 * com capítulos e seções, e a Vista do Ato o recuaria como se fosse um deles.
 */
export function desenhaComoTitulo(type: BlockType): boolean {
  return isAgrupador(type) || type === 'ANEXO';
}

/** Largura da marca na trilha. Blocos fora da hierarquia ocupam a faixa inteira. */
export function tickWidthOf(type: BlockType): number {
  const rank = rankOf(type);
  return rank === RANK_NONE ? 100 : RANK_TICK_WIDTH[rank];
}

/** Densidade da tinta para as marcas da trilha. */
export function inkOf(type: BlockType): number {
  const rank = rankOf(type);
  return rank === RANK_NONE ? 0.52 : RANK_INK[rank];
}

/** Densidade da tinta para rótulos de texto, sempre acima de 4,5:1. */
export function textInkOf(type: BlockType): number {
  const rank = rankOf(type);
  return rank === RANK_NONE ? 0.8 : RANK_TEXT_INK[rank];
}

/** Peso tipográfico para o tipo. */
export function weightOf(type: BlockType): number {
  const rank = rankOf(type);
  return rank === RANK_NONE ? 400 : RANK_WEIGHT[rank];
}

/**
 * Recuo da lista lateral, em pixels. Espelha o passo de indentação que o
 * documento já aplica no canvas (38px / 58px / 78px), em escala reduzida.
 */
export function indentOf(type: BlockType): number {
  const rank = rankOf(type);
  return rank === RANK_NONE ? 8 : 8 + rank * 10;
}
