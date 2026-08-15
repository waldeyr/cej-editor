import { LegislativeBlock, LegislativeDocument } from '../types/legislative';
import { htmlToPlainText } from './docTargets';
import { RANK_NONE, TOTAL_DE_AGRUPADORES, isAgrupador, ordemDoAgrupador, rankOf } from './rank';
import { renumberBlocks } from './blockTypes';

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
  /** Um ponto de ancoragem do próprio ato. */
  | { kind: 'anchor'; name: string }
  /** Um endereço qualquer, digitado por extenso. */
  | { kind: 'url'; href: string }
  /**
   * Outro ato aberto numa aba.
   *
   * A escolha guarda a **aba**, não o caminho: quem sabe transformar isso num
   * `href` é o App, que conhece o arquivo dos dois lados e faz a conta relativa
   * de um para o outro. A caixa não precisa saber o que é caminho.
   */
  | { kind: 'aba'; abaId: string; ancora?: string };

/** Um ato aberto noutra aba, oferecido como destino de remissão. */
export interface AtoAberto {
  id: string;
  rotulo: string;
  /** Sem caminho, o ato não pode ser destino: não há de onde contar a remissão. */
  caminho?: string;
  ancoras: AnchorPoint[];
}

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
export function describeBlock(block: LegislativeBlock): string {
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

/** Posição hierárquica do artigo: o degrau em que a articulação começa. */
const RANK_ARTIGO = rankOf('ARTIGO');

/**
 * Onde o dispositivo está, dito como quem o cita: "Art. 1º, § 2º, II".
 *
 * O rótulo sozinho bastava enquanto o ato tinha meia dúzia de pontos de
 * ancoragem. Desde que cada dispositivo passou a ter o seu, a lista da caixa de
 * remissão mostra dezenas de "II -" que só a cadeia distingue — e a cadeia é a
 * forma como o técnico normativo escreveria a remissão de qualquer maneira.
 */
function citacaoDe(block: LegislativeBlock, cadeia: readonly string[]): string {
  const rank = rankOf(block.type);
  if (rank < RANK_ARTIGO) return describeBlock(block);
  return cadeia.filter(Boolean).join(', ');
}

/** Todos os pontos de ancoragem do ato, na ordem em que aparecem. */
export function collectAnchorPoints(doc: LegislativeDocument): AnchorPoint[] {
  const points: AnchorPoint[] = [];
  /** Rótulos da cadeia aberta, por posição hierárquica; o anexo abre a lista. */
  let cadeia: string[] = [];

  doc.blocks.forEach((block) => {
    const rank = rankOf(block.type);

    if (block.type === 'ANEXO') cadeia = [describeBlock(block)];
    else if (isAgrupador(block.type)) cadeia.length = 1;
    else if (rank >= RANK_ARTIGO) {
      cadeia.length = rank;
      // O travessão separa o rótulo do texto no dispositivo; na citação ele sobra.
      cadeia[rank] = describeBlock(block).replace(/\s*[-–—]\s*$/, '');
    }

    const location = citacaoDe(block, cadeia);

    /*
     * O nome repetido entra uma vez só, e a primeira ocorrência é que vale —
     * é ela que `findAnchorBlock` e o navegador encontram no arquivo. Duplicar
     * a entrada dava dois destinos de mesmo nome na caixa de remissão, um deles
     * levando a lugar nenhum, e uma `key` repetida na lista do React.
     */
    if (block.linkName && !points.some((point) => point.name === block.linkName)) {
      points.push({ name: block.linkName, label: location, location, blockId: block.id });
    }

    anchorsInHtml(block.content).forEach(({ name, text }) => {
      if (!name || points.some((point) => point.name === name)) return;
      /*
       * A âncora do ato publicado chega quase sempre vazia, colada à frente do
       * rótulo, e sem texto para se anunciar ela se chamava pelo nome cru —
       * "art1", que é jargão, e ainda por cima repetido no `#art1` ao lado.
       * Sem trecho marcado, o que ela endereça é o dispositivo inteiro.
       */
      points.push({ name, label: text || location, location, blockId: block.id });
    });
  });

  return points;
}

/**
 * O mesmo conteúdo, sem ponto de ancoragem algum — para quem **copia** um
 * dispositivo.
 *
 * Endereço é identidade: duas cópias de um artigo são dois artigos, e não dois
 * dispositivos respondendo pelo mesmo `#art5`. O arquivo salvo com o nome
 * repetido não acusa nada, e o navegador simplesmente para no primeiro, de modo
 * que metade das remissões passa a levar ao dispositivo errado.
 *
 * O `name` some; o texto marcado e o `href` ficam. A âncora que só tinha o nome
 * sai inteira, para não deixar um `<a>` vazio e sem serventia no meio do texto.
 */
export function semPontosDeAncoragem(html: string): string {
  if (!html || !html.includes('name=')) return html;

  return html
    .replace(/<a\b[^>]*\bname=["'][^"']*["'][^>]*>\s*<\/a>/gi, '')
    .replace(/(<a\b[^>]*?)\s+name=["'][^"']*["']/gi, '$1');
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

/*
 * ---------------------------------------------------------------------------
 * Criação automática dos pontos de ancoragem
 * ---------------------------------------------------------------------------
 *
 * Todo dispositivo de um ato publicado tem endereço próprio, e é por ele que a
 * remissão de outro ato chega — "art. 5º, § 1º, II" é `#art5§1ii`. Marcar isso à
 * mão, dispositivo por dispositivo, é trabalho que ninguém faz num decreto de
 * trezentos artigos, e sem ele a caixa "Inserir Link" só oferece o punhado de
 * âncoras que o arquivo de origem trouxe.
 *
 * O nome não se inventa: ele é a **posição do dispositivo escrita como o
 * Planalto a escreve**. A forma foi medida em 15 de agosto de 2026 sobre o
 * acervo publicado (`/Users/mendes/dev/ccivil_03`, 79 mil atos):
 *
 *   artigo            Art. 5º            art5        Art. 5º-A → art5a
 *   parágrafo         § 1º               art5§1      parágrafo único → art5p
 *   inciso            II -               art5ii      sob o parágrafo → art5§1ii
 *   alínea            a)                 art5iia
 *   item              1.                 art5iia1
 *   agrupador         CAPÍTULO I         capituloi   Seção I dentro dele → capituloisecaoi
 *   anexo             ANEXO I            anexoi      e prefixa o que vem depois → anexoiart1
 *
 * O `§` é o caractere mesmo, 0xA7 em ISO-8859-1: são 20.507 âncoras assim no
 * acervo, e imitar o padrão é o que faz a remissão de um ato para o outro casar.
 *
 * **Só se cria o que é certo.** Endereço errado é pior que endereço nenhum — a
 * remissão leva o leitor ao dispositivo trocado e nada denuncia. Por isso o nome
 * é abandonado, e o dispositivo fica sem âncora, quando:
 *
 *   · o rótulo não se deixa ler (agrupador sem designação, rótulo escrito à mão);
 *   · falta um degrau da cadeia — inciso cujo artigo não tem endereço certo não
 *     pode pendurar-se no artigo anterior;
 *   · o nome já pertence a outro dispositivo. O ato publicado desempata com um
 *     ".0" no fim; aqui não, porque um "art2.0" tem cara de endereço canônico de
 *     coisa nenhuma;
 *   · o artigo não continua a série crescente. É o que separa o artigo do ato do
 *     artigo **citado** dentro de uma alteração: o «Art. 1º ....» entre aspas
 *     recomeça a contagem, e recomeçar denuncia que aquele artigo é de outro ato.
 *
 * Âncora que já existe nunca se toca — nem a do `linkName`, nem a que o ato
 * publicado escreve colada à frente do rótulo. Ela é o endereço que as remissões
 * já publicadas citam, e reescrevê-la quebraria o ato de quem aponta para cá.
 */

/**
 * A designação do agrupador ou do anexo — a palavra e o número, sem a
 * denominação. "CAPÍTULO I - DAS DEFINIÇÕES" endereça `capituloi`, não
 * `capituloidasdefinicoes`.
 */
const DESIGNACAO = /^(PARTE|LIVRO|T[ÍI]TULO|SUBT[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O|ANEXO)(?:\s+\S+)?$/i;

/** "Art. 5º", "Art. 10." e "Art. 5º-A". */
const ROTULO_DO_ARTIGO = /^art\.?\s*(\d+)\s*(?:[º°.]|o\b)?\s*(?:[-–—]\s*([a-z]+))?\s*$/i;
/** "§ 1º" e "§ 2º-A". */
const ROTULO_DO_PARAGRAFO = /^§\s*(\d+)\s*[º°.]?\s*(?:[-–—]\s*([a-z]+))?\s*$/i;
const PARAGRAFO_UNICO = /^par[áa]grafo\s+[úu]nico/i;
/** "II -" e "III-A -". */
const ROTULO_DO_INCISO = /^([ivxlcdm]+)(?:[-–—]\s*([a-z]+))?\s*[-–—]?\s*$/i;
/** "a)" e "a-A)". */
const ROTULO_DA_ALINEA = /^([a-z]+)(?:[-–—]\s*([a-z]+))?\s*\)?\s*$/i;
/** "1." e "1-A.". */
const ROTULO_DO_ITEM = /^(\d+)(?:[-–—]\s*([a-z]+))?\s*\.?\s*$/i;

/**
 * O rótulo do título, que no ato importado pode não estar em `numberLabel`.
 *
 * O leitor de HTML deixa a linha inteira do agrupador dentro do conteúdo quando
 * o arquivo a traz assim (ver `arquivo-planalto`), e é de lá que a designação
 * sai — senão nenhum capítulo de ato publicado teria endereço.
 */
function designacaoDe(block: LegislativeBlock): string | undefined {
  const linha = block.numberLabel?.trim() || plainTextOf(block);
  const designacao = linha.split(/\s+[-–—]\s+/)[0].trim();
  if (!DESIGNACAO.test(designacao)) return undefined;
  return slugifyAnchor(designacao) || undefined;
}

/** O que o dispositivo acrescenta ao endereço do que o abriga. */
function componenteDe(block: LegislativeBlock): string | undefined {
  const rotulo = (block.numberLabel || '').trim();
  const sufixo = (match: RegExpExecArray) => (match[2] || '').toLowerCase();

  switch (block.type) {
    case 'ARTIGO': {
      const match = ROTULO_DO_ARTIGO.exec(rotulo);
      return match ? `art${match[1]}${sufixo(match)}` : undefined;
    }
    case 'PARAGRAFO': {
      if (PARAGRAFO_UNICO.test(rotulo)) return 'p';
      const match = ROTULO_DO_PARAGRAFO.exec(rotulo);
      return match ? `§${match[1]}${sufixo(match)}` : undefined;
    }
    case 'INCISO': {
      const match = ROTULO_DO_INCISO.exec(rotulo);
      return match ? `${match[1].toLowerCase()}${sufixo(match)}` : undefined;
    }
    case 'ALINEA': {
      const match = ROTULO_DA_ALINEA.exec(rotulo);
      return match ? `${match[1].toLowerCase()}${sufixo(match)}` : undefined;
    }
    case 'ITEM': {
      const match = ROTULO_DO_ITEM.exec(rotulo);
      return match ? `${match[1]}${sufixo(match)}` : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * O endereço que o dispositivo já tem.
 *
 * Três procedências, nesta ordem:
 *
 *   1. o `linkName`, que é onde o editor guarda o endereço que ele mesmo criou;
 *   2. a primeira âncora **vazia** do conteúdo. Vazia ela não marca trecho
 *      nenhum — não há o que marcar —, então só pode ser o endereço do
 *      dispositivo. É a forma do ato publicado, e a posição dela dentro do
 *      parágrafo não importa: o redator que escreve no começo do dispositivo
 *      empurra a âncora para o meio do texto, e o endereço tem de sobreviver a
 *      isso. Exigir que ela **abrisse** o conteúdo fazia o artigo perder o
 *      endereço ao ser editado, e com ele todos os incisos que pendem dele;
 *   3. a âncora que abre o conteúdo, ainda que tenha texto. É como o ato
 *      publicado endereça o anexo, marcando a própria designação
 *      (`<a name="anexoi">ANEXO I</a>`).
 *
 * A âncora com texto que vem **depois** de texto fica de fora de propósito: ela
 * marca aquele trecho, e não o dispositivo.
 */
function ancoraDe(block: LegislativeBlock): string | undefined {
  if (block.linkName) return block.linkName;

  const ancoras = anchorsInHtml(block.content);
  if (ancoras.length === 0) return undefined;

  const vazia = ancoras.find((ancora) => ancora.name && !ancora.text);
  if (vazia) return vazia.name;

  const antes = block.content.split(/<a\b[^>]*\bname=/i)[0];
  return htmlToPlainText(antes).trim() ? undefined : ancoras[0].name || undefined;
}

/** A série dos artigos é crescente; "art5" e depois "art5a" continua a série. */
function continuaASerie(anterior: string | null, componente: string): boolean {
  if (!anterior) return true;
  const antes = /^art(\d+)([a-z]*)$/.exec(anterior);
  const agora = /^art(\d+)([a-z]*)$/.exec(componente);
  if (!antes || !agora) return true;

  const numero = Number(antes[1]);
  const proximo = Number(agora[1]);
  return proximo > numero || (proximo === numero && agora[2] > antes[2]);
}

/**
 * De quem o dispositivo pende e o que ele acrescenta ao endereço de lá.
 *
 * O encaixe se lê numa passagem, na ordem do ato; os nomes só se atribuem
 * depois, e por isso o encaixe guarda a **posição** do dispositivo de cima, e
 * não o nome dele.
 */
interface Encaixe {
  /** Ordem em que o endereço se atribui: do dispositivo mais raso ao mais fundo. */
  profundidade: number;
  /** Posição do dispositivo de que este pende; -1 quando pende só do anexo. */
  pai: number;
  /** Prefixo do anexo em curso. Só vale para quem não tem pai; `null` não endereça. */
  anexo: string | null;
  /** O que este dispositivo acrescenta. Ausente quando o rótulo não se deixa ler. */
  componente?: string;
  /** O endereço que o dispositivo já trazia do arquivo, e que não se toca. */
  jaTem?: string;
}

/** Degraus da profundidade: o anexo, os oito agrupadores e a articulação. */
const PROFUNDIDADE_DO_ANEXO = 0;
const PROFUNDIDADE_DOS_AGRUPADORES = 1;
const PROFUNDIDADE_DA_ARTICULACAO = PROFUNDIDADE_DOS_AGRUPADORES + TOTAL_DE_AGRUPADORES;

/** A posição do degrau mais fundo já aberto acima deste, se algum está. */
function paiEntre(degraus: readonly number[]): number | undefined {
  for (let i = degraus.length - 1; i >= 0; i--) {
    if (degraus[i] !== undefined) return degraus[i];
  }
  return undefined;
}

/**
 * Dá endereço a cada dispositivo do ato, onde o endereço é certo.
 *
 * Não escreve no texto (o ponto de ancoragem sai do arquivo como `<a name>`
 * vazio, e a folha nem o desenha), não mexe em âncora existente e devolve **o
 * mesmo documento** quando não há nada a acrescentar — do que depende a marca de
 * trabalho não salvo (invariante 7). Aplicar duas vezes dá o mesmo resultado.
 */
export function ancorarDispositivos(doc: LegislativeDocument): LegislativeDocument {
  const usados = new Set(collectAnchorPoints(doc).map((ponto) => ponto.name));

  /** Prefixo do anexo em curso: vazio no corpo do ato, `null` sem endereço certo. */
  let anexo: string | null = '';
  /** Posição do dispositivo aberto em cada degrau, e não o nome dele. */
  let articulacao: number[] = [];
  let agrupadores: number[] = [];
  /** Último artigo aceito no segmento, para exigir a série crescente. */
  let ultimoArtigo: string | null = null;

  const encaixes = doc.blocks.map((block, posicao): Encaixe | undefined => {
    const jaTem = ancoraDe(block);

    if (block.type === 'ANEXO') {
      // O anexo recomeça tudo: a articulação dele é sua, e prefixa o que vier.
      articulacao = [];
      agrupadores = [];
      ultimoArtigo = null;

      const designacao = designacaoDe(block);
      /*
       * O prefixo se decide aqui, e não na segunda passagem, porque tudo o que
       * vem depois depende dele. Um anexo sem designação legível não endereça
       * nada do que carrega: "art1" dentro do Anexo II é o art. 1º do corpo.
       */
      anexo = jaTem ?? (designacao && !usados.has(designacao) ? designacao : null);
      if (anexo && !jaTem) usados.add(anexo);
      return { profundidade: PROFUNDIDADE_DO_ANEXO, pai: -1, anexo: '', componente: anexo ?? undefined, jaTem };
    }

    const ordem = ordemDoAgrupador(block.type);
    if (ordem !== RANK_NONE) {
      // O artigo não pende do agrupador (é "art1", não "capituloiart1"), mas a
      // cadeia recomeça: um inciso solto depois do título não é do artigo anterior.
      articulacao = [];
      agrupadores.length = ordem;
      const pai = paiEntre(agrupadores);
      agrupadores[ordem] = posicao;

      return {
        profundidade: PROFUNDIDADE_DOS_AGRUPADORES + ordem,
        pai: pai ?? -1,
        anexo,
        componente: designacaoDe(block),
        jaTem,
      };
    }

    /*
     * A citação abre texto de **outro** ato, e o que vem depois dela — até o
     * artigo seguinte deste — é dispositivo citado. Deixar a cadeia de pé faria
     * o inciso do ato alterado tomar o endereço do inciso do ato que o altera:
     * "art2iii" apontaria para um inciso que não é do art. 2º deste ato.
     *
     * O dispositivo citado fica então **sem** endereço automático, e é uma
     * lacuna de propósito — no ato alterador ela alcança quase todo o texto. O
     * ato publicado endereça o citado como "art2-1" (o artigo que altera, um
     * traço, o artigo alterado), e escrever isso aqui depende de saber onde a
     * citação termina. Hoje não se sabe: o leitor marca como `ALTERACAO` só os
     * parágrafos que trazem as aspas, e um modelo de citação com começo e fim é
     * a tarefa de que este endereço depende (ver a skill `arquivo-planalto`).
     */
    if (block.type === 'ALTERACAO') {
      articulacao = [];
      return undefined;
    }

    /*
     * A linha de pontos diz que houve omissão, não que a cadeia acabou: entre o
     * inciso II e a alínea c) do ato citado ela apenas conta que as alíneas a) e
     * b) ficaram de fora. Quebrar aqui desfiliaria a alínea do inciso dela.
     */
    if (block.type === 'OMISSIS') return undefined;

    const rank = rankOf(block.type);
    // Fora da articulação — tabela, fecho, assinatura, linha sem formatação. Não
    // têm endereço próprio e também não interrompem a cadeia de quem tem.
    if (rank < RANK_ARTIGO) return undefined;

    articulacao.length = rank;
    const pai = rank === RANK_ARTIGO ? undefined : paiEntre(articulacao);
    articulacao[rank] = posicao;

    let componente = componenteDe(block);
    if (block.type === 'ARTIGO' && componente) {
      if (continuaASerie(ultimoArtigo, componente)) ultimoArtigo = componente;
      else componente = undefined;
    }

    return {
      profundidade: PROFUNDIDADE_DA_ARTICULACAO + rank - RANK_ARTIGO,
      pai: pai ?? -1,
      // Um dispositivo interno sem artigo acima não pende de coisa alguma: ele
      // não é do anexo, é de um artigo que não se sabe qual.
      anexo: rank === RANK_ARTIGO || pai !== undefined ? anexo : null,
      componente,
      jaTem,
    };
  });

  /*
   * Os nomes se atribuem do dispositivo mais raso ao mais fundo, e não na ordem
   * do ato, porque a concatenação é ambígua: "art1" + inciso "i" + alínea "i" dá
   * "art1ii", que é também o endereço do inciso II. Na ordem do ato quem chega
   * antes é a alínea, e o inciso — que é o dispositivo que as remissões citam —
   * ficaria sem endereço. Quem está mais acima na hierarquia tem a preferência;
   * quem perde fica sem endereço automático, e o redator ainda pode marcá-lo à
   * mão, onde `createAnchorName` desempata com um sufixo.
   */
  const ordemDeAtribuicao = encaixes
    .map((encaixe, posicao) => ({ encaixe, posicao }))
    .filter((item): item is { encaixe: Encaixe; posicao: number } => item.encaixe !== undefined)
    .sort((a, b) => a.encaixe.profundidade - b.encaixe.profundidade || a.posicao - b.posicao);

  const nomes: (string | undefined)[] = doc.blocks.map(() => undefined);
  let mudou = false;

  ordemDeAtribuicao.forEach(({ encaixe, posicao }) => {
    if (encaixe.jaTem) {
      nomes[posicao] = encaixe.jaTem;
      return;
    }
    if (encaixe.profundidade === PROFUNDIDADE_DO_ANEXO) {
      // O anexo já se decidiu na primeira passagem, e o nome dele já está tomado.
      nomes[posicao] = encaixe.componente;
      mudou = mudou || encaixe.componente !== undefined;
      return;
    }

    const base = encaixe.pai === -1 ? encaixe.anexo : nomes[encaixe.pai] ?? null;
    if (base === null || !encaixe.componente) return;

    const nome = base + encaixe.componente;
    if (usados.has(nome)) return;

    usados.add(nome);
    nomes[posicao] = nome;
    mudou = true;
  });

  if (!mudou) return doc;

  return {
    ...doc,
    blocks: doc.blocks.map((block, posicao) =>
      nomes[posicao] && !encaixes[posicao]?.jaTem ? { ...block, linkName: nomes[posicao] } : block
    ),
  };
}

/**
 * Renumera os dispositivos e refaz os endereços que o editor derivou.
 *
 * As duas coisas são um gesto só, e separá-las foi um defeito: renumerar diz
 * "os rótulos passam a seguir a ordem", e o dispositivo que passou de "Art. 2º"
 * a "Art. 3º" saía do arquivo com `<a name="art2">` — quem citasse `#art2`
 * cairia no artigo errado, que é o que o invariante 12 proíbe.
 *
 * **Refaz-se o ato inteiro, e não só o que foi renumerado.** Consertar apenas os
 * dispositivos de rótulo alterado deixava o inciso para trás: "I -" continua "I
 * -" quando o artigo passa de 1º a 2º, de modo que ele não entra na conta da
 * renumeração e ficava endereçado em `art1i`, pendurado num artigo que agora é
 * `art2`. Endereço é a cadeia inteira; quem move o pai move os filhos.
 *
 * Refazer tudo é seguro porque **só o `linkName` se apaga**: o endereço do ato
 * publicado chega dentro do conteúdo do dispositivo (`<a name="art1"></a>`) e
 * não se toca — é o que as remissões já publicadas citam, e é ele que sobrevive
 * a esta operação. `linkName` é sempre endereço que este programa derivou da
 * posição, e derivado da posição ele volta a ser.
 *
 * `ids` limita a renumeração a alguns dispositivos; sem ele, o ato inteiro.
 */
export function renumerarDispositivos(
  doc: LegislativeDocument,
  ids?: ReadonlySet<string>
): { doc: LegislativeDocument; renumerados: number } {
  const blocks = renumberBlocks(doc.blocks, ids);
  const renumerados = blocks.filter((block, index) => block !== doc.blocks[index]).length;

  if (renumerados === 0) return { doc, renumerados: 0 };

  const semEndereco = blocks.map((block) =>
    block.linkName ? { ...block, linkName: undefined } : block
  );

  return { doc: ancorarDispositivos({ ...doc, blocks: semEndereco }), renumerados };
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
