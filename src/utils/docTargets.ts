import { BlockAlign, BlockType, LegislativeBlock, LegislativeDocument } from '../types/legislative';
import { desenhaComoTitulo } from './rank';
import { ASPAS_ABRE, ASPAS_FECHA, abreAspas, fechaAspas } from './citacoes';

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

/**
 * As partes que abrem o ato (Decreto nº 12.002/2024, art. 4º), e as únicas que
 * trocam texto entre si e com os dispositivos.
 *
 * A ordem de execução e o fecho ficam de fora de propósito: uma parte fixa que
 * perde o texto some da folha, e um clique com o cursor pousado em "DECRETA:"
 * apagaria a ordem de execução do ato sem que o redator tivesse selecionado
 * nada nem entendido o que sumiu.
 */
export const PARTES_PRELIMINARES: readonly DocPart[] = ['epigrafe', 'ementa', 'preambulo'];

/** Nome de cada parte na língua do redator — nomeia o botão e o recado. */
export const NOME_DA_PARTE: Readonly<Record<DocPart, string>> = {
  epigrafe: 'Epígrafe',
  ementa: 'Ementa',
  preambulo: 'Preâmbulo',
  ordemExecucao: 'Ordem de execução',
  fecho: 'Fecho',
};

/**
 * Gênero de cada parte, que em português é também o artigo definido dela:
 * "a ementa", "o preâmbulo", "substituída", "substituído".
 *
 * Existe porque o recado da barra de estado é lido por quem redige, e um
 * programa que escreve "Preâmbulo substituída" perde a autoridade de apontar
 * erro de redação no ato.
 */
export const GENERO_DA_PARTE: Readonly<Record<DocPart, 'a' | 'o'>> = {
  epigrafe: 'a',
  ementa: 'a',
  preambulo: 'o',
  ordemExecucao: 'a',
  fecho: 'o',
};

export const blockTarget = (id: string): string => `block:${id}`;
export const partTarget = (part: DocPart): string => `part:${part}`;
export const assinaturaTarget = (index: number): string => `assinatura:${index}`;

/**
 * Marca aplicada quando o usuário limpa um negrito que é padrão do arquivo
 * Planalto, e não escolha dele — a ordem de execução e a denominação do
 * agrupador (Título, Capítulo, Seção…) nascem em negrito porque é assim que o
 * ato publicado as escreve, mas o redator pode querer outra coisa.
 */
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

/**
 * Faz do texto em jogo a epígrafe, a ementa ou o preâmbulo do ato.
 *
 * É o mesmo gesto dos botões de estrutura, um degrau ao lado: seleciona-se o
 * texto e diz-se o que ele é. A diferença é que a parte fixa não tem tipo —
 * ela é um campo do documento, e não um dispositivo —, de modo que o trecho
 * **sai** da lista e passa a morar no campo. Deixá-lo nos dois lugares poria a
 * mesma frase duas vezes no ato.
 *
 * Existe por uma falta concreta: a parte fixa só é desenhada quando tem texto.
 * Um ato importado sem ementa — o caso de todo `.docx`, e de todo arquivo em
 * que a marcação não a entrega — não tinha onde se clicar para escrevê-la, e
 * não havia comando algum que a criasse.
 *
 * A origem pode ser um dispositivo ou outra parte fixa: quem importa um ato com
 * a ementa dentro da epígrafe conserta selecionando e clicando. `origens` vem na
 * ordem da folha, e é nela que os trechos se juntam.
 */
export function moverParaParte(
  doc: LegislativeDocument,
  part: DocPart,
  origens: readonly string[]
): LegislativeDocument {
  const destino = partTarget(part);

  /*
   * A parte de destino entra na conta quando o redator a selecionou junto: ele
   * arrastou do meio da ementa até o fim do parágrafo seguinte para juntar os
   * dois, e descartar a metade que já morava no campo apagaria texto que ele
   * tinha na tela.
   */
  const fontes = origens.filter(
    (alvo) =>
      (alvo.startsWith('block:') && podeVirarParte(blocoDe(doc, alvo))) ||
      (alvo.startsWith('part:') && ehParteTrocavel(alvo.slice('part:'.length) as DocPart))
  );
  if (fontes.length === 0) return doc;

  const texto = fontes.map((alvo) => htmlDaFonte(doc, alvo)).filter(Boolean).join(' ');
  if (!texto || texto === doc[part]) return doc;

  const idsPromovidos = new Set(
    fontes.filter((alvo) => alvo.startsWith('block:')).map((alvo) => alvo.slice('block:'.length))
  );

  // As partes de origem ficam vazias, e uma parte vazia some da folha — é o
  // mesmo efeito do botão que apaga a parte, e `Ctrl+Z` devolve as duas. O
  // destino não se esvazia: ele é reescrito logo abaixo.
  const semAsFontes = fontes
    .filter((alvo) => alvo.startsWith('part:') && alvo !== destino)
    .reduce(
      (acumulado, alvo) => applyHtmlToTarget(acumulado, alvo, ''),
      { ...doc, blocks: doc.blocks.filter((bloco) => !idsPromovidos.has(bloco.id)) }
    );

  return applyHtmlToTarget(semAsFontes, destino, texto);
}

const blocoDe = (doc: LegislativeDocument, alvo: string): LegislativeBlock | undefined =>
  doc.blocks.find((candidato) => blockTarget(candidato.id) === alvo);

/** Só as três partes que abrem o ato trocam texto entre si e com os dispositivos. */
const ehParteTrocavel = (part: DocPart): boolean => PARTES_PRELIMINARES.includes(part);

/**
 * O dispositivo pode virar texto de uma parte fixa?
 *
 * Dois não podem, e o motivo é o mesmo nos dois casos: eles não são texto.
 *
 * A **tabela** posta num campo de parte fixa é desfeita na gravação — o campo é
 * relido como parágrafo — e ainda reaparece como bloco de tabela ao abrir o
 * arquivo, porque o leitor varre `table.MsoTableGrid` onde quer que ela esteja.
 * O mesmo conteúdo em dois lugares, e a tabela destruída num deles.
 *
 * O **anexo** é o bloco que marca onde o anexo começa (`inicioDoAnexo`). Tirá-lo
 * da lista faz todo o conteúdo do anexo voltar para o corpo do ato, calado —
 * é a mesma fronteira que as setas de mover se recusam a atravessar.
 */
export function podeVirarParte(bloco: LegislativeBlock | undefined): boolean {
  if (!bloco) return false;
  return bloco.type !== 'TABELA' && bloco.type !== 'ANEXO';
}

/** O texto de uma origem, na forma em que a folha o mostra. */
function htmlDaFonte(doc: LegislativeDocument, alvo: string): string {
  if (alvo.startsWith('part:')) return doc[alvo.slice('part:'.length) as DocPart] || '';

  const bloco = blocoDe(doc, alvo);
  if (!bloco || isEmptyHtml(bloco.content)) return '';

  /*
   * O ponto de ancoragem vem junto, escrito no HTML.
   *
   * No dispositivo ele mora em `linkName`, e é o serializador que o desenha; a
   * parte fixa não tem esse campo. Sem trazê-lo para dentro do texto, toda
   * remissão que apontava para o artigo promovido passaria a apontar para um
   * destino que o arquivo salvo não conhece mais.
   */
  const ancora = bloco.linkName ? `<a name="${bloco.linkName}"></a>` : '';

  /*
   * As aspas e o "(NR)" da citação vêm das marcas do bloco, e é a folha que os
   * desenha. Fora do dispositivo não há marca, então eles viram texto — ou
   * sumiriam da tela sem que ninguém tivesse mandado apagá-los.
   *
   * O **rótulo**, ao contrário, fica para trás: "Art. 1º" não foi escrito pelo
   * redator, é consequência da posição do dispositivo na lista. Levá-lo faria a
   * ementa começar por "Art. 1º", que é justamente o que quem promove um
   * parágrafo mal classificado está tentando desfazer.
   */
  const abre = abreAspas(bloco) ? ASPAS_ABRE : '';
  const fecha = fechaAspas(bloco) ? ASPAS_FECHA : '';
  return `${ancora}${abre}${bloco.content}${fecha}${bloco.novaRedacao ? ' (NR)' : ''}`;
}

/**
 * Envolve o HTML na marca de "sem formatação padrão" quando ele ficou sem
 * etiqueta alguma.
 *
 * "Limpar formatação" tira o negrito da tela na hora, mas o texto que sobra é
 * puro — sem a marca, o próximo render (ou a exportação) veria só texto liso e
 * reaplicaria o negrito padrão sozinho, desfazendo o pedido do redator. Etiqueta
 * já presente (o redator formatou de outro jeito) não é sobrescrita: a marca só
 * entra quando não há etiqueta nenhuma para servir de sinal.
 */
export function markAsPlainFormat(html: string): string {
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

/** Agrupadores e título de anexo são centralizados; os demais, justificados. */
export function defaultAlignForBlockType(type: BlockType): BlockAlign {
  return desenhaComoTitulo(type) ? 'center' : 'justify';
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
