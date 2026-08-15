import { LegislativeBlock, PosicaoNaCitacao } from '../types/legislative';

/**
 * A citação do ato alterado: onde ela abre, o que corre dentro dela, onde fecha.
 *
 * O artigo que altera outro ato transcreve entre aspas a nova redação, e as
 * aspas abrem no primeiro dispositivo citado e fecham no último — não em cada um
 * deles. Entre uma e outra corre texto de **outro** ato: incisos, alíneas, itens
 * e linhas pontilhadas que não são dispositivos deste, e que por isso se
 * recolhem à direita do artigo que os altera.
 *
 * O arquivo só marca as pontas, que são as únicas linhas com aspas. Era isso que
 * a folha desenhava: o dispositivo com aspas ia para o recuo da citação e o que
 * vinha entre eles voltava à margem do ato alterador, de modo que a citação
 * saía serrilhada — no decreto de `docs/file-tests/`, sessenta dispositivos
 * citados na margem errada. O meio se deduz das pontas, e é o que este módulo
 * faz.
 */

/** As aspas que a folha desenha em vez de guardar no texto. */
export const ASPAS_ABRE = '“';
export const ASPAS_FECHA = '”';

/**
 * Onde o bloco está na citação.
 *
 * O tipo `ALTERACAO` responde por si: ele é a citação de um dispositivo só, e é
 * assim que os atos abertos antes desta marca existir — os rascunhos guardados
 * em `localStorage` — continuam a se desenhar recolhidos.
 */
export function citacaoDe(block: LegislativeBlock): PosicaoNaCitacao | undefined {
  return block.citacao || (block.type === 'ALTERACAO' ? 'unica' : undefined);
}

/** O dispositivo é texto citado de outro ato. */
export function estaEmCitacao(block: LegislativeBlock): boolean {
  return citacaoDe(block) !== undefined;
}

/** A folha e o arquivo desenham as aspas de abertura neste dispositivo. */
export function abreAspas(block: LegislativeBlock): boolean {
  const posicao = citacaoDe(block);
  return posicao === 'abre' || posicao === 'unica';
}

/** A folha e o arquivo desenham as aspas de fechamento neste dispositivo. */
export function fechaAspas(block: LegislativeBlock): boolean {
  const posicao = citacaoDe(block);
  return posicao === 'fecha' || posicao === 'unica';
}

/** O bloco com a nova posição, ou ele mesmo quando nada muda (invariante 7). */
function comPosicao(block: LegislativeBlock, posicao: PosicaoNaCitacao): LegislativeBlock {
  return block.citacao === posicao ? block : { ...block, citacao: posicao };
}

/**
 * As posições de uma citação com `quantidade` dispositivos, na ordem deles.
 * Serve a quem marca uma citação de uma vez — o botão "Alteração" da barra.
 */
export function posicoesDaCitacao(quantidade: number): PosicaoNaCitacao[] {
  if (quantidade <= 1) return ['unica'];
  return Array.from({ length: quantidade }, (_, indice) =>
    indice === 0 ? 'abre' : indice === quantidade - 1 ? 'fecha' : 'meio'
  );
}

/**
 * Onde as duas metades ficam quando o dispositivo se parte em dois — o Enter no
 * meio de um dispositivo citado. A citação não se abre nem se fecha por causa
 * disso: quem abria continua abrindo, quem fechava continua fechando, e o corte
 * cria um dispositivo a mais no meio dela.
 */
export function dividirCitacao(
  posicao: PosicaoNaCitacao | undefined
): [PosicaoNaCitacao | undefined, PosicaoNaCitacao | undefined] {
  switch (posicao) {
    case 'unica':
      return ['abre', 'fecha'];
    case 'abre':
      return ['abre', 'meio'];
    case 'fecha':
      return ['meio', 'fecha'];
    case 'meio':
      return ['meio', 'meio'];
    default:
      return [undefined, undefined];
  }
}

/**
 * Onde entra o dispositivo criado logo abaixo de outro. Dentro da citação ele é
 * mais um dispositivo citado; depois do fechamento, o ato volta a ser este.
 */
export function citacaoAbaixoDe(anterior: LegislativeBlock | undefined): PosicaoNaCitacao | undefined {
  if (!anterior) return undefined;
  const posicao = citacaoDe(anterior);
  return posicao === 'abre' || posicao === 'meio' ? 'meio' : undefined;
}

/**
 * Onde a citação aberta em `inicio` fecha, ou -1 quando ela não fecha.
 *
 * Outra abertura antes do fechamento é sinal de que a primeira ficou sem par: o
 * arquivo perdeu as aspas, ou nunca as teve.
 */
function fechamentoDaCitacao(blocks: readonly LegislativeBlock[], inicio: number): number {
  for (let i = inicio + 1; i < blocks.length; i++) {
    const posicao = citacaoDe(blocks[i]);
    if (posicao === 'fecha') return i;
    if (posicao === 'abre' || posicao === 'unica') return -1;
  }
  return -1;
}

/**
 * Deduz o meio das citações a partir das pontas, que são o que o arquivo traz.
 *
 * Toda importação passa por aqui, e é o que põe o inciso citado no recuo da
 * citação em vez de na margem do ato alterador.
 *
 * Aspas que abrem e não fecham não engolem o resto do ato: a abertura vira
 * citação de um dispositivo só. É a leitura conservadora — um ato mal fechado
 * recolhe um parágrafo a mais, e não cinquenta.
 */
export function preencherCitacoes(blocks: readonly LegislativeBlock[]): LegislativeBlock[] {
  const saida = [...blocks];

  for (let i = 0; i < saida.length; i++) {
    if (citacaoDe(saida[i]) !== 'abre') continue;

    const fim = fechamentoDaCitacao(saida, i);
    if (fim === -1) {
      saida[i] = comPosicao(saida[i], 'unica');
      continue;
    }

    for (let meio = i + 1; meio < fim; meio++) saida[meio] = comPosicao(saida[meio], 'meio');
    i = fim;
  }

  return saida;
}
