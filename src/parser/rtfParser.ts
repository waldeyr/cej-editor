import { LegislativeBlock, LegislativeDocument, BlockType, PosicaoNaCitacao } from '../types/legislative';
import { isAgrupador } from '../utils/rank';
import { preencherCitacoes } from '../utils/citacoes';

/**
 * A linha de supressão, sempre com esta medida.
 *
 * O omissis não é texto que alguém redige: é a marca de que há texto que não
 * foi transcrito. Por isso ele tem uma forma só, e é para ela que converge
 * tanto o que vem do arquivo importado quanto o que nasce de um clique na barra
 * — ver `retypeBlock`, em utils/blockTypes.ts.
 */
export const OMISSIS_LINE =
  '.......................................................................................................';

/**
 * A linha pontilhada é **só** pontos e espaço (Decreto nº 12.002/2024, art. 14,
 * VIII).
 *
 * A medida antiga aceitava qualquer linha *começada* por quatro pontos, e com
 * isso engolia o formulário em branco, que também é pontilhado mas tem texto no
 * meio: o Decreto nº 17.464/1926 traz 86 deles — "........$.........." para o
 * valor em mil-réis e "..... (nome da localidade) ..... de .... de 192 ....."
 * para a data. Como o omissis se normaliza para `OMISSIS_LINE`, cada um desses
 * campos perdia o que tinha dentro, sem aviso. Omissis é ausência de texto; onde
 * há texto entre os pontos, o texto é do ato.
 *
 * O "(NR)" não atrapalha: `identifyBlockType` já o recortou antes de classificar.
 */
const LINHA_PONTILHADA = /^[.\s]{5,}$/;

/**
 * A faixa em que CP1252 difere de Latin-1: 0x80 a 0x9F.
 *
 * Fora dela os dois são o mesmo, e `String.fromCharCode` basta. Dentro dela,
 * não: o Windows-1252 põe ali a aspa curva, o travessão, as reticências e o
 * marcador, e devolver o código cru dava um caractere de controle invisível no
 * lugar do sinal — o `\'85` de "…", o `\'92` de "’", o `\'95` de "•" saíam da
 * importação como sujeira que nem se vê nem se digita. A tabela cobre a faixa
 * inteira porque o buraco parcial é pior que a ausência: dá a impressão de que
 * o assunto está resolvido.
 */
export const CP1252_MAP: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡',
  0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž',
  0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};

/**
 * Palavras de controle que mostram um caractere.
 *
 * O tokenizador consome toda palavra de controle sem devolver nada, o que está
 * certo para `\fs18` e errado para estas: `\endash` é o travessão que separa
 * "CARGOS COMISSIONADOS EXECUTIVOS – CCE", e engoli-lo tira do ato um caractere
 * que o redator escreveu.
 */
const SIMBOLOS: Record<string, string> = {
  endash: '–', emdash: '—', bullet: '•', lquote: '‘', rquote: '’',
  ldblquote: '“', rdblquote: '”', tab: '\t', emspace: ' ', enspace: ' ',
};

export interface RtfToken {
  type: 'text' | 'cell' | 'row' | 'par' | 'trowd';
  val?: string;
  /**
   * O trecho estava dentro de uma célula de tabela (`\intbl`).
   *
   * É o que distingue o título da tabela do conteúdo dela, e a distinção não
   * pode sair do estado da linha: o Word emite o conteúdo de uma linha *antes*
   * do `\trowd` que a define, de modo que quem se guia pela linha aberta toma
   * a primeira célula de cada linha por texto solto — e o título da tabela, que
   * vem entre duas tabelas, por célula.
   */
  intbl?: boolean;
  clmgf?: boolean;
  clmrg?: boolean;
  clvmgf?: boolean;
  clvmrg?: boolean;
  cellRight?: number;
  rowIndex?: number;
}

export type TableCellInput = string | { text: string; colspan?: number; rowspan?: number; isMerged?: boolean };

/**
 * Tokenizador RTF robusto com pilha de controle e suporte a celulas mescladas de tabelas.
 */
export function parseRtfTokens(input: string): RtfToken[] {
  let len = input.length;
  let pos = 0;
  let depth = 0;
  let ignoreDepth = -1;
  let tokens: RtfToken[] = [];
  let currentText = '';

  type CellFlags = Pick<RtfToken, 'clmgf' | 'clmrg' | 'clvmgf' | 'clvmrg'>;
  type CellDefinition = CellFlags & Pick<RtfToken, 'cellRight'>;
  const emptyCellFlags = (): CellFlags => ({ clmgf: false, clmrg: false, clvmgf: false, clvmrg: false });

  let cellFlags = emptyCellFlags();
  let rowCellDefinitions: CellDefinition[] = [];
  let tableCellIndex = 0;
  let intbl = false;

  const IGNORE_GROUPS = new Set([
    'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer',
    'panose', 'falt', 'generator', 'themedata', 'colorscheme', 'fontemb',
    'realdata', 'datastore', 'xmltbl', 'expandedcolortbl', '*', 'author', 'operator', 'keywords', 'comment', 'latentstyles'
  ]);

  function flushText() {
    const texto = currentText.trim();
    currentText = '';
    if (texto.length === 0) return;
    tokens.push({ type: 'text', val: texto, intbl });
  }

  while (pos < len) {
    let char = input[pos];

    if (char === '{') {
      depth++;
      pos++;
      let match = input.substring(pos, pos + 30).match(/^\\(\*\\)?([a-zA-Z0-9]+)/);
      if (match) {
        let kw = match[2].toLowerCase();
        if (IGNORE_GROUPS.has(kw) || match[1] === '*\\') {
          if (ignoreDepth === -1) ignoreDepth = depth;
        }
      }
      continue;
    }

    if (char === '}') {
      if (ignoreDepth === depth) ignoreDepth = -1;
      depth--;
      pos++;
      continue;
    }

    if (ignoreDepth !== -1) {
      pos++;
      continue;
    }

    // Escape Hex \'XX
    if (char === '\\' && input[pos + 1] === "'") {
      let hex = input.substring(pos + 2, pos + 4);
      let code = parseInt(hex, 16);
      currentText += CP1252_MAP[code] || String.fromCharCode(code);
      pos += 4;
      continue;
    }

    // Unicode \uXXXX?
    if (char === '\\' && input[pos + 1] === 'u' && /^\\u-?\d+/.test(input.substring(pos, pos + 10))) {
      let match = input.substring(pos).match(/^\\u(-?\d+)\s?\??/);
      if (match) {
        let code = parseInt(match[1], 10);
        if (code < 0) code += 65536;
        currentText += String.fromCharCode(code);
        pos += match[0].length;
        continue;
      }
    }

    // RTF Cell Merge Control Words
    if (char === '\\' && /^\\clmgf\b/.test(input.substring(pos))) {
      cellFlags.clmgf = true;
      pos += 6;
      if (input[pos] === ' ') pos++;
      continue;
    }
    if (char === '\\' && /^\\clmrg\b/.test(input.substring(pos))) {
      cellFlags.clmrg = true;
      pos += 6;
      if (input[pos] === ' ') pos++;
      continue;
    }
    if (char === '\\' && /^\\clvmgf\b/.test(input.substring(pos))) {
      cellFlags.clvmgf = true;
      pos += 7;
      if (input[pos] === ' ') pos++;
      continue;
    }
    if (char === '\\' && /^\\clvmrg\b/.test(input.substring(pos))) {
      cellFlags.clvmrg = true;
      pos += 7;
      if (input[pos] === ' ') pos++;
      continue;
    }

    // As propriedades de cada celula terminam em \cellxN. Elas devem ser
    // guardadas antes do conteudo, pois os marcadores \cell aparecem depois.
    if (char === '\\' && /^\\cellx-?\d+\b/.test(input.substring(pos))) {
      const match = input.substring(pos).match(/^\\cellx(-?\d+)\b\s?/);
      rowCellDefinitions.push({ ...cellFlags, cellRight: match ? Number(match[1]) : undefined });
      cellFlags = emptyCellFlags();
      pos += match ? match[0].length : 6;
      continue;
    }

    // RTF Table Row Definition \trowd
    if (char === '\\' && /^\\trowd\b/.test(input.substring(pos))) {
      flushText();
      const rowIndex = input.substring(pos, pos + 100).match(/\\irow(-?\d+)\b/)?.[1];
      tokens.push({ type: 'trowd', rowIndex: rowIndex === undefined ? undefined : Number(rowIndex) });
      cellFlags = emptyCellFlags();
      rowCellDefinitions = [];
      tableCellIndex = 0;
      pos += 6;
      if (input[pos] === ' ') pos++;
      continue;
    }

    // RTF Cell \cell
    if (char === '\\' && /^\\cell\b/.test(input.substring(pos))) {
      flushText();
      const definition = rowCellDefinitions[tableCellIndex++] || cellFlags;
      tokens.push({ type: 'cell', ...definition });
      cellFlags = emptyCellFlags();
      pos += 5;
      if (input[pos] === ' ') pos++;
      continue;
    }

    // RTF Row \row
    if (char === '\\' && /^\\row\b/.test(input.substring(pos))) {
      flushText();
      tokens.push({ type: 'row' });
      cellFlags = emptyCellFlags();
      pos += 4;
      if (input[pos] === ' ') pos++;
      continue;
    }

    // Paragraph \par ou \line
    if (char === '\\' && /^\\(par|line)\b/.test(input.substring(pos))) {
      flushText();
      tokens.push({ type: 'par' });
      let match = input.substring(pos).match(/^\\(par|line)\b\s?/);
      pos += match ? match[0].length : 4;
      continue;
    }

    /*
     * Palavra de controle: letras, um parâmetro numérico opcional e um espaço
     * que é delimitador, não conteúdo.
     *
     * O parâmetro precisa entrar no casamento. Lendo `[a-zA-Z0-9]+`, o `-70` de
     * `\trleft-70` ficava para trás e entrava no ato como texto — trezentas e
     * noventa e oito vezes no decreto de `docs/file-tests/`, grudado no começo
     * de cada célula ("-70CÓDIGO"). Havia cinco remendos espalhados pelo módulo
     * raspando esse `-70`; a leitura certa da palavra de controle dispensa os
     * cinco.
     */
    if (char === '\\') {
      const match = input.substring(pos).match(/^\\([a-zA-Z]+)(-?\d+)? ?/);
      if (match) {
        const palavra = match[1];
        if (SIMBOLOS[palavra]) currentText += SIMBOLOS[palavra];
        else if (palavra === 'pard') intbl = false;
        else if (palavra === 'intbl') intbl = true;
        pos += match[0].length;
        continue;
      }

      // Símbolos de controle. `\~` é o espaço inseparável; `\{`, `\}` e `\\` são
      // a chave e a barra literais — sem tratá-los, a chave escapada abria um
      // grupo que nunca fechava, e o resto do arquivo desaparecia dentro dele.
      const simbolo = input[pos + 1];
      if (simbolo !== undefined && /[~_{}\\-]/.test(simbolo)) {
        if (simbolo === '~') currentText += ' ';
        else if (simbolo === '{' || simbolo === '}' || simbolo === '\\') currentText += simbolo;
        pos += 2;
        continue;
      }
    }

    /*
     * A quebra de linha do arquivo RTF não é conteúdo. Quem escreve o arquivo
     * quebra a linha onde couber — inclusive no meio de uma palavra — e o leitor
     * precisa ignorá-la; o que separa texto é `\par`, `\line` ou um espaço de
     * verdade. Tratá-la como espaço partia a palavra ao meio: "AVALIAÇÃ O",
     * "GESTÃ O", "PÚ BLICO" apareciam assim na folha, dezenove vezes no decreto
     * de `docs/file-tests/`.
     */
    if (char === '\r' || char === '\n') {
      pos++;
      continue;
    }

    currentText += char;
    pos++;
  }

  flushText();
  return tokens;
}

/**
 * Junta dois fragmentos de texto de tokens RTF com espaçamento inteligente:
 */
function smartJoin(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  const rightTrimmed = right.trimStart();
  if (/^[,;.:\)!?]/.test(rightTrimmed)) return left + rightTrimmed;
  if (/\d$/.test(left) && /^[\dºª]/.test(rightTrimmed)) return left + rightTrimmed;
  if (/[a-zA-Z]$/.test(left) && /^[ºª]/.test(rightTrimmed)) return left + rightTrimmed;
  return left + ' ' + rightTrimmed;
}

export function decodeRtfToLines(rtfInput: string): string[] {
  const tokens = parseRtfTokens(rtfInput);
  const lines: string[] = [];
  let currentLine = '';

  tokens.forEach((tok) => {
    if (tok.type === 'text') {
      currentLine = smartJoin(currentLine, tok.val || '');
    } else if (tok.type === 'par' || tok.type === 'row') {
      if (currentLine.trim().length > 0) {
        lines.push(currentLine.trim());
      }
      currentLine = '';
    } else if (tok.type === 'cell') {
      currentLine += ' | ';
    }
  });

  if (currentLine.trim().length > 0) {
    lines.push(currentLine.trim());
  }

  return lines.filter((l) => !l.includes('Courier New') && !l.includes('Symbol') && !l.includes('Wingdings'));
}

export const decodeRtfToParagraphs = decodeRtfToLines;

/**
 * Converte uma matriz de células de tabela em HTML Planalto (<table class="MsoTableGrid">) com suporte a colspan/rowspan.
 */
export function convertTableMatrixToHtml(matrix: TableCellInput[][]): string {
  if (matrix.length === 0) return '';

  const rowsHtml = matrix
    .map((row, rIdx) => {
      const cellTag = rIdx === 0 ? 'th' : 'td';
      const cellsHtml = row
        .map((cell) => {
          if (typeof cell === 'object' && cell.isMerged) return '';

          const text = typeof cell === 'string' ? cell : cell.text;
          const colspanAttr = typeof cell === 'object' && cell.colspan && cell.colspan > 1 ? ` colspan="${cell.colspan}"` : '';
          const rowspanAttr = typeof cell === 'object' && cell.rowspan && cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : '';

          return `<${cellTag}${colspanAttr}${rowspanAttr} style="border: 1px solid #000; padding: 6px; text-align: left; vertical-align: top;">${text || '&nbsp;'}</${cellTag}>`;
        })
        .join('');
      return `<tr>${cellsHtml}</tr>`;
    })
    .join('\n');

  return `<table border="1" cellpadding="4" cellspacing="0" class="MsoTableGrid" style="border-collapse: collapse; width: 100%; margin: 15px 0;"><tbody>\n${rowsHtml}\n</tbody></table>`;
}

/** A linha começa pelas aspas que abrem a citação. */
const ABERTURA_DE_CITACAO = /^["“]/;

/** A linha termina pelas aspas que fecham a citação, com ou sem o "(NR)". */
const FECHAMENTO_DE_CITACAO = /["”]\s*(?:\(\s*NR\s*\))?$/i;

/**
 * A aspa do fim da linha fecha a citação, ou é de uma palavra citada dentro
 * dela?
 *
 * Quem responde é a conta: a citação fecha com uma aspa **sem par** na linha. O
 * decreto de `docs/file-tests/` escreve "a) as alíneas “d” e “e” do inciso I" —
 * duas aberturas e dois fechamentos, todos emparelhados —, e tomar aquele "”"
 * final por fim da citação faria a alteração inteira que vem depois voltar à
 * margem do ato alterador.
 *
 * A aspa reta não diz de que lado está, e para ela só resta a paridade: uma
 * quantidade ímpar quer dizer que sobrou uma, e a que sobra é a que fecha.
 */
function fechaACitacao(corpo: string): boolean {
  if (!FECHAMENTO_DE_CITACAO.test(corpo)) return false;

  const abertas = (corpo.match(/“/g) || []).length;
  const fechadas = (corpo.match(/”/g) || []).length;
  if (fechadas !== abertas) return fechadas > abertas;
  if (abertas > 0) return false;

  return (corpo.match(/"/g) || []).length % 2 === 1;
}

/**
 * As aspas que a linha traz — a marca de onde a citação do ato alterado abre e
 * onde ela fecha. O que corre entre uma e outra é deduzido depois, sobre o ato
 * inteiro (ver `utils/citacoes.ts`).
 */
function aspasDaLinha(linha: string): PosicaoNaCitacao | undefined {
  const texto = linha.replace(/^##[A-Z]{3}\s*/, '').trim();
  const abre = ABERTURA_DE_CITACAO.test(texto);
  const fecha = fechaACitacao(abre ? texto.slice(1) : texto);

  if (abre && fecha) return 'unica';
  if (abre) return 'abre';
  return fecha ? 'fecha' : undefined;
}

/**
 * Limpa aspas redundantes em trechos de alteração (ex: transforma `“Art. 1º ... ” (NR)` em texto limpo ajustado).
 */
export function sanitizeQuoteText(text: string): string {
  let clean = text.replace(/\s+/g, ' ').trim();
  // Remover aspas de abertura no início
  clean = clean.replace(/^["“]/, '').trim();
  // Remover indicação de (NR) e aspas de fechamento no final
  clean = clean.replace(/["”]\s*\(\s*NR\s*\)$/i, '').replace(/["”]$/, '').trim();
  return clean;
}

/**
 * A epígrafe nomeia o ato e o número dele (LC 95/1998, art. 3º, I).
 *
 * É por esta forma que se acha a epígrafe num arquivo publicado, onde o
 * cabeçalho do brasão — "Presidência da República / Casa Civil / …" — também é
 * um parágrafo centralizado e em cor, e vinha sendo tomado por ela.
 */
export const EPIGRAFE_PATTERN =
  /^(DECRETO|DECRETO-LEI|LEI COMPLEMENTAR|LEI|MEDIDA PROVISÓRIA|EMENDA CONSTITUCIONAL|PORTARIA|RESOLUÇÃO|INSTRUÇÃO NORMATIVA)\b[\s\S]{0,40}?N[ºO°]/i;

/**
 * O sufixo do dispositivo acrescentado por alteração.
 *
 * "Art. 5º-A", "§ 2º-B", e às vezes mais de um: o decreto de `docs/file-tests/`
 * altera um "Art. 35-B-B". A alínea já reconhecia a forma ("b-A)"), o artigo e
 * o parágrafo não — e o rótulo saía cortado em "Art. 35", com o "-B-B" indo
 * para dentro do texto do dispositivo (Decreto nº 12.002/2024, art. 14,
 * parágrafo único).
 *
 * Rótulo com sufixo não é canônico de propósito: `hasCanonicalLabel` o rejeita,
 * e por isso a renumeração não o reescreve nem deixa que ele desloque a série.
 */
const SUFIXO_DE_INCLUSAO = /(?:-[A-Za-z]+)*/.source;

/**
 * O travessão que separa o rótulo do inciso é seguido de espaço — ou fecha a
 * linha. O ato publicado escreve "III-" e "III-A -", e as duas formas passam;
 * o que não pode passar é o hífen de dentro de uma palavra que começa com
 * letra romana: "D-APROVA TABELA TIPI", anotação de minuta que vem no `.doc`
 * da TIPI, virava inciso "D" com o rótulo recortado no meio da palavra.
 */
const SEPARADOR_DE_INCISO = /[-–—](?=\s|$)/.source;

/**
 * O título que abre um anexo — e só ele.
 *
 * Aceita "ANEXO", "ANEXOS", "ANEXO I", "ANEXO III-A", "ANEXO ÚNICO", "ANEXO A"
 * e a forma com denominação na mesma linha ("ANEXO I - REMANEJAMENTO DE
 * CARGOS"), com ou sem nada depois do travessão.
 *
 * O que não pode aceitar é a remissão a anexo de outro ato, que também começa
 * por essa palavra: o ato publicado de `docs/file-tests/` tem dispositivos que
 * abrem em "Anexos I, III-A e V à Lei nº 10.483…". Tomá-los por título de anexo
 * mandaria metade do ato para depois das assinaturas, já que é o primeiro anexo
 * que marca onde a parte final do documento começa. É por isso que a designação
 * é **uma palavra só**: o que vier depois precisa de travessão.
 *
 * "ANEXO ÚNICO" custou uma revisão inteira para aparecer — é a forma corrente
 * no ato que tem um anexo só, e a medida antiga, que exigia romano ou algarismo,
 * o deixava de fora sem que nenhum arquivo de prova acusasse.
 */
export const TITULO_DE_ANEXO =
  /^ANEXOS?(\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ\d][A-ZÁÉÍÓÚÂÊÔÃÕÇ\d.\-]*)?(\s+[-–—](\s+.*)?)?$/i;

/** Palavras que ligam um nome próprio brasileiro e não vêm em maiúscula. */
const CONECTIVOS_DE_NOME = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

/**
 * O parágrafo tem a forma de um nome de pessoa?
 *
 * Ministro assina em caixa mista — "Esther Dweck", "Fernando Haddad" —, e a
 * regra da caixa alta, feita para o Presidente, o deixava de fora: ele chegava
 * à folha como dispositivo do ato, e no arquivo salvo subia para cima do fecho.
 * A medida é curta de propósito: nome de pessoa não tem algarismo, não termina
 * em pontuação e não passa de meia dúzia de palavras.
 */
export function pareceNomeDeSignatario(texto: string): boolean {
  if (/[0-9]/.test(texto) || /[.;:,]$/.test(texto)) return false;
  const palavras = texto.split(/\s+/);
  if (palavras.length < 2 || palavras.length > 6) return false;
  return palavras.every(
    (palavra) => CONECTIVOS_DE_NOME.has(palavra) || /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zàáâãéêíóôõúç'’-]+$/.test(palavra)
  );
}

/**
 * O nome em caixa alta com que o Presidente assina.
 *
 * De duas a seis palavras, como o nome em caixa mista: a linha inteira em
 * maiúsculas de uma palavra só — "SUMÁRIO", que abre o anexo da TIPI — não é
 * ninguém assinando, e entrava na lista de signatários por uma medida que só
 * olhava o alfabeto e o comprimento.
 */
function pareceNomeEmCaixaAlta(texto: string): boolean {
  if (!/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s']{3,}$/.test(texto)) return false;
  const palavras = texto.split(/\s+/).length;
  return palavras >= 2 && palavras <= 6;
}

/**
 * Verifica se a linha inicia um novo dispositivo legislativo.
 *
 * A medida do pontilhado aqui é mais larga do que a de `LINHA_PONTILHADA`, e é
 * de propósito: são duas perguntas diferentes. Aqui se pergunta se o parágrafo
 * começa um bloco — e começa, mesmo quando os pontos vêm seguidos das aspas que
 * fecham a citação (`.........” (NR)`, cinco vezes no decreto de
 * `docs/file-tests/`). Lá se pergunta se o bloco **é** um omissis, cujo conteúdo
 * se normaliza para a linha canônica; e aí só pontos valem, senão o formulário
 * em branco perde o que tem dentro. Estreitar as duas de uma vez colou essas
 * cinco linhas no dispositivo anterior.
 */
function isNewDeviceStart(line: string): boolean {
  const clean = line.replace(/^##[A-Z]{3}\s*/, '').trim();
  return (
    new RegExp(`^Art\\.\\s*\\d+[ºo]?${SUFIXO_DE_INCLUSAO}`, 'i').test(clean) ||
    new RegExp(`^(Parágrafo\\s+único|§\\s*\\d+[ºo]?${SUFIXO_DE_INCLUSAO})`, 'i').test(clean) ||
    new RegExp(`^[IVXLCDM]+${SUFIXO_DE_INCLUSAO}\\s*${SEPARADOR_DE_INCISO}`, 'i').test(clean) ||
    /^[a-z](?:-[A-Z]+)?\)/.test(clean) ||
    /^\d+\.\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(clean) ||
    /^CAPÍTULO|^SEÇÃO|^LIVRO|^TÍTULO|^PARTE|^ANEXO/i.test(clean) ||
    /^“|^"/i.test(clean) ||
    /^[.\s]{5,}$/.test(clean) ||
    /^\.{4,}/.test(clean)
  );
}

/**
 * O agrupador escrito sozinho, sem a denominação na mesma linha.
 *
 * "CAPÍTULO II", "Seção I", "TÍTULO III-A" — a designação e o número, e nada
 * mais. É o que distingue o agrupador cuja denominação vem no parágrafo
 * seguinte daquele que já a traz consigo ("CAPÍTULO I - DAS DISPOSIÇÕES", que é
 * como este editor a escreve, e "PARTE GERAL").
 */
const DESIGNACAO_SOZINHA =
  /^(PARTE|LIVRO|T[ÍI]TULO|SUBT[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O)(\s+[IVXLCDM\d][IVXLCDM\d\-A-Z]*)?\.?$/i;

/** Texto em caixa alta: tem letra, e nenhuma delas é minúscula. */
function ehCaixaAlta(texto: string): boolean {
  const limpo = (texto || '').trim();
  if (!limpo) return false;
  if (/[a-zàáâãéêíóôõúüç]/.test(limpo)) return false;
  return /[A-ZÁÉÍÓÚÂÊÔÃÕÜÇ]/.test(limpo);
}

/**
 * Tem forma de título, e não de parágrafo do ato.
 *
 * Título não é frase: não termina em ponto, ponto e vírgula ou dois pontos. É
 * esta a medida que separa a denominação do agrupador — "Disposições Gerais" —
 * do texto de corpo que porventura venha logo abaixo de um agrupador sem
 * denominação.
 */
function temFormaDeTitulo(texto: string): boolean {
  const limpo = (texto || '').trim();
  return limpo.length > 0 && limpo.length <= 160 && !/[.;:]$/.test(limpo);
}

/**
 * A denominação do agrupador se centraliza com ele.
 *
 * Parte, Livro, Título, Subtítulo, Capítulo, Seção e Subseção são
 * centralizados, e no ato publicado vêm quase sempre acompanhados do título
 * descritivo em caixa alta, num parágrafo próprio logo abaixo:
 *
 *     CAPÍTULO II
 *     DOS EMPREGADOS REINTEGRADOS AO QUADRO DE PESSOAL DO BANCO CENTRAL
 *
 * As duas linhas são um título só, e o arquivo publicado centraliza as duas. O
 * leitor centralizava apenas a primeira — a segunda não casa com forma nenhuma
 * de dispositivo e caía em `TEXTO_LIVRE`, que nasce justificado e com recuo de
 * primeira linha: na folha o título do capítulo aparecia partido, metade
 * centralizada e metade como parágrafo de corpo, e o arquivo salvo gravava
 * assim. Marcar a denominação com `align` resolve a folha e o arquivo de uma
 * vez, porque os dois leem esse campo.
 *
 * A denominação continua em bloco próprio, e não é fundida ao agrupador: no ato
 * publicado ela é um parágrafo à parte, e juntá-las mudaria o desenho do ato
 * para uma linha só (invariante 1). Ela também não vira agrupador — seria um
 * degrau a mais na hierarquia, e a Vista do Ato mostraria dois capítulos onde
 * há um.
 *
 * Só entra aqui o que o classificador não reconheceu como dispositivo: onde ele
 * achou artigo, inciso ou alínea, o parágrafo é do corpo do ato, e não título.
 * A denominação pode ocupar mais de uma linha — "PRODUTOS DAS INDÚSTRIAS
 * QUÍMICAS" e "OU DAS INDÚSTRIAS CONEXAS", na TIPI —, e por isso vale a
 * sequência inteira, até a primeira linha que não seja caixa alta.
 */
export function centralizarDenominacaoDeAgrupador(blocks: LegislativeBlock[]): LegislativeBlock[] {
  /** Quantas linhas de denominação ainda podem vir: 0 = fora de um título. */
  let primeiraLinha = false;
  let sobTitulo = false;

  return blocks.map((bloco) => {
    if (isAgrupador(bloco.type)) {
      sobTitulo = DESIGNACAO_SOZINHA.test((bloco.rawText || '').trim());
      primeiraLinha = sobTitulo;
      return bloco;
    }

    if (!sobTitulo) return bloco;

    /*
     * A primeira linha é a denominação, na caixa em que o ato a escreveu — a
     * mista é a forma corrente ("Seção I / Disposições Gerais"), e no acervo do
     * Planalto ela é quatro vezes mais frequente que a caixa alta. Da segunda
     * em diante só a caixa alta continua o título: nela a denominação quebra em
     * duas linhas com naturalidade ("PRODUTOS DAS INDÚSTRIAS QUÍMICAS" / "OU
     * DAS INDÚSTRIAS CONEXAS"), enquanto uma sequência em caixa mista não se
     * distingue do corpo do ato.
     *
     * O alinhamento que veio do arquivo manda: se ele já disse como a linha se
     * desenha, não é este palpite que vai contradizê-lo.
     */
    const continua =
      bloco.type === 'TEXTO_LIVRE' &&
      !bloco.align &&
      temFormaDeTitulo(bloco.rawText) &&
      (primeiraLinha || ehCaixaAlta(bloco.rawText));

    primeiraLinha = false;
    if (!continua) {
      sobTitulo = false;
      return bloco;
    }

    return { ...bloco, align: 'center' as const };
  });
}

/**
 * Extrai rótulo e tipo do dispositivo com limpeza automática de aspas.
 *
 * O "(NR)" volta como marca (`novaRedacao`), e não como texto: ele não é
 * redação do dispositivo, é o sinal de que aquela é a nova redação dele. Sem
 * essa devolução ele era simplesmente apagado — cinquenta e oito vezes na
 * medida provisória de `docs/file-tests/`, dezenove no decreto.
 */
export function identifyBlockType(line: string): {
  type: BlockType;
  numberLabel?: string;
  cleanText: string;
  novaRedacao?: boolean;
  aspas?: PosicaoNaCitacao;
} {
  let clean = line.replace(/^##[A-Z]{3}\s*/, '').trim();

  const novaRedacao = /\(\s*NR\s*\)$/i.test(clean) || undefined;
  const aspas = aspasDaLinha(clean);
  const isAlteration = aspas !== undefined;
  if (isAlteration) {
    clean = sanitizeQuoteText(clean);
  } else if (novaRedacao) {
    // "(NR)" sem as aspas de fechamento acontece na linha pontilhada que encerra
    // a alteração: ".......................... (NR)".
    clean = clean.replace(/\s*\(\s*NR\s*\)$/i, '').trim();
  }

  const classificado = classificarDispositivo(clean, isAlteration);
  return { ...classificado, ...(novaRedacao ? { novaRedacao } : {}), ...(aspas ? { aspas } : {}) };
}

/** O tipo e o rótulo, já sem as aspas e sem o "(NR)". */
function classificarDispositivo(
  clean: string,
  isAlteration: boolean
): { type: BlockType; numberLabel?: string; cleanText: string } {
  if (new RegExp(`^Art\\.\\s*\\d+[ºo°]?${SUFIXO_DE_INCLUSAO}`, 'i').test(clean)) {
    const m = clean.match(new RegExp(`^(Art\\.\\s*\\d+[ºo°]?${SUFIXO_DE_INCLUSAO}\\.?)\\s*(.*)`, 'i'));
    return {
      type: isAlteration ? 'ALTERACAO' : 'ARTIGO',
      numberLabel: m ? normalizarOrdinalDoRotulo(m[1]) : '',
      cleanText: m ? m[2] : clean,
    };
  }
  if (new RegExp(`^(Parágrafo\\s+único|§\\s*\\d+[ºo°]?${SUFIXO_DE_INCLUSAO})`, 'i').test(clean)) {
    const m = clean.match(
      new RegExp(`^(Parágrafo\\s+único\\.?|§\\s*\\d+[ºo°]?${SUFIXO_DE_INCLUSAO}\\.?)\\s*(.*)`, 'i')
    );
    return {
      type: isAlteration ? 'ALTERACAO' : 'PARAGRAFO',
      numberLabel: m ? normalizarOrdinalDoRotulo(m[1]) : '',
      cleanText: m ? m[2] : clean,
    };
  }
  if (new RegExp(`^[IVXLCDM]+${SUFIXO_DE_INCLUSAO}\\s*${SEPARADOR_DE_INCISO}`, 'i').test(clean)) {
    const m = clean.match(new RegExp(`^([IVXLCDM]+${SUFIXO_DE_INCLUSAO})\\s*${SEPARADOR_DE_INCISO}\\s*(.*)`, 'i'));
    return { type: isAlteration ? 'ALTERACAO' : 'INCISO', numberLabel: m ? `${m[1]} -` : '', cleanText: m ? m[2] : clean };
  }
  if (/^[a-z](?:-[A-Z]+)?\)/.test(clean)) {
    const m = clean.match(/^([a-z](?:-[A-Z]+)?)\)\s*(.*)/);
    return { type: isAlteration ? 'ALTERACAO' : 'ALINEA', numberLabel: m ? `${m[1]})` : '', cleanText: m ? m[2] : clean };
  }
  if (/^\d+\.\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(clean)) {
    const m = clean.match(/^(\d+)\.\s*(.*)/);
    return { type: isAlteration ? 'ALTERACAO' : 'ITEM', numberLabel: m ? `${m[1]}.` : '', cleanText: m ? m[2] : clean };
  }
  if (TITULO_DE_ANEXO.test(clean)) {
    return { type: 'ANEXO', cleanText: clean };
  }
  if (/^CAPÍTULO|^SEÇÃO|^LIVRO|^TÍTULO|^PARTE/i.test(clean)) {
    return { type: 'TITULO_AGRUPADOR', cleanText: clean };
  }
  if (isAlteration) {
    return { type: 'ALTERACAO', cleanText: clean };
  }
  if (LINHA_PONTILHADA.test(clean)) {
    return { type: 'OMISSIS', cleanText: OMISSIS_LINE };
  }
  return { type: 'TEXTO_LIVRE', cleanText: clean };
}

function normalizarOrdinalDoRotulo(rotulo: string): string {
  return rotulo.replace(/(\d)[ºo°]/gi, '$1º');
}

/**
 * Converte arquivo RTF com suporte nativo a tabelas, resiliência legislativa e higienização de aspas.
 */
export function parseRtfToLegislativeDocument(rtfInput: string): LegislativeDocument {
  return parseTokensToLegislativeDocument(parseRtfTokens(rtfInput));
}

/**
 * A máquina de estados que faz de uma sequência de parágrafos um ato.
 *
 * Ela é separada do tokenizador de propósito: o leitor de Word binário
 * (`docParser.ts`) produz estes mesmos tokens a partir do arquivo `.doc`, e é
 * por entrar aqui que ele classifica o ato exatamente como o RTF — mesma
 * epígrafe, mesmos estados, mesmas tabelas. Divergência de precisão entre os
 * dois formatos passa a ser impossível por construção.
 */
export function parseTokensToLegislativeDocument(tokens: RtfToken[]): LegislativeDocument {
  let epigrafeLines: string[] = [];
  let ementaLines: string[] = [];
  let preambuloLines: string[] = [];
  // Vazio até o arquivo a trazer: a MPV não decreta — a ordem dela mora no fim
  // do preâmbulo ("… com força de lei:") — e um "DECRETA:" de reserva seria
  // texto inventado no ato do redator (invariante 9).
  let ordemExecucao = '';
  let fechoLines: string[] = [];
  let assinaturaLines: string[] = [];

  let state:
    | 'INITIAL'
    | 'EPIGRAFE'
    | 'EMENTA'
    | 'PREAMBULO'
    | 'BODY'
    | 'FECHO'
    | 'ASSINATURA'
    | 'ANEXO' = 'INITIAL';

  const blocks: LegislativeBlock[] = [];
  let currentBlock: {
    type: BlockType;
    label?: string;
    text: string;
    novaRedacao?: boolean;
    aspas?: PosicaoNaCitacao;
  } | null = null;

  // Processamento de Tabelas RTF (\cell / \row com suporte a mesclagem)
  interface CellTokenData {
    text: string;
    clmgf?: boolean;
    clmrg?: boolean;
    clvmgf?: boolean;
    clvmrg?: boolean;
    cellRight?: number;
  }

  let currentRawTableRows: CellTokenData[][] = [];
  let currentRawTableRow: CellTokenData[] = [];
  let currentTableCellText = '';
  let currentCellFlags = { clmgf: false, clmrg: false, clvmgf: false, clvmrg: false };
  let tableRowOpen = false;

  let artCounter = 0;

  function pushBlock(
    type: BlockType,
    label: string | undefined,
    text: string,
    novaRedacao?: boolean,
    citacao?: PosicaoNaCitacao
  ) {
    let linkName: string | undefined;
    if (type === 'ARTIGO') {
      artCounter++;
      linkName = `art${artCounter}`;
    }
    blocks.push({
      id: `block-${blocks.length + 1}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type,
      numberLabel: label,
      content: text,
      rawText: text,
      linkName,
      novaRedacao,
      citacao,
    });
  }

  function flushCurrentBlock() {
    if (!currentBlock) return;
    pushBlock(
      currentBlock.type,
      currentBlock.label,
      sanitizeQuoteText(currentBlock.text),
      currentBlock.novaRedacao,
      currentBlock.aspas
    );
    currentBlock = null;
  }

  function processMergedTableMatrix(rawRows: CellTokenData[][]): TableCellInput[][] {
    interface ProcessedTableCell {
      text: string;
      colspan: number;
      rowspan: number;
      isMerged?: boolean;
    }

    const result: TableCellInput[][] = [];
    const grid: ProcessedTableCell[][] = [];
    const columnBoundaries = Array.from(
      new Set(
        rawRows.flatMap((row) =>
          row.flatMap((cell) => (typeof cell.cellRight === 'number' ? [cell.cellRight] : []))
        )
      )
    ).sort((left, right) => left - right);

    rawRows.forEach((row, rIdx) => {
      const processedRow: TableCellInput[] = [];
      const gridRow: ProcessedTableCell[] = [];
      const verticallyExtended = new Set<ProcessedTableCell>();
      const verticallyAppended = new Set<ProcessedTableCell>();
      const usesCellGeometry = row.length > 0 && row.every((cell) => typeof cell.cellRight === 'number');
      let previousRight = 0;

      row.forEach((cellData, cIdx) => {
        const text = cellData.text.trim();
        const endColumn = usesCellGeometry ? columnBoundaries.indexOf(cellData.cellRight!) : cIdx;
        const startColumn = usesCellGeometry
          ? previousRight === 0
            ? 0
            : columnBoundaries.indexOf(previousRight) + 1
          : cIdx;
        const columnSpan = usesCellGeometry && endColumn >= startColumn ? endColumn - startColumn + 1 : 1;
        const cellAbove = grid[rIdx - 1]?.[startColumn];
        const cellToLeft = gridRow[startColumn - 1];
        previousRight = cellData.cellRight ?? previousRight;

        const occupyGrid = (cell: ProcessedTableCell) => {
          for (let column = startColumn; column < startColumn + columnSpan; column++) {
            gridRow[column] = cell;
          }
        };

        // Uma continuacao vertical aponta diretamente para a origem na mesma
        // coluna fisica, mesmo se a origem tambem ocupar colunas adjacentes.
        if (cellData.clvmrg && cellAbove) {
          occupyGrid(cellAbove);
          if (!verticallyExtended.has(cellAbove)) {
            cellAbove.rowspan++;
            verticallyExtended.add(cellAbove);
          }
          if (text && !verticallyAppended.has(cellAbove)) {
            cellAbove.text = cellAbove.text ? `${cellAbove.text} ${text}` : text;
            verticallyAppended.add(cellAbove);
          }
          processedRow.push({ text: '', colspan: 1, rowspan: 1, isMerged: true });
          return;
        }

        // A continuacao horizontal ocupa outra coluna fisica, mas compartilha
        // a mesma celula de origem para a futura mesclagem vertical.
        if (cellData.clmrg && cellToLeft) {
          occupyGrid(cellToLeft);
          cellToLeft.colspan += columnSpan;
          if (text) cellToLeft.text = cellToLeft.text ? `${cellToLeft.text} ${text}` : text;
          processedRow.push({ text: '', colspan: 1, rowspan: 1, isMerged: true });
          return;
        }

        const cell: ProcessedTableCell = { text, colspan: columnSpan, rowspan: 1 };
        occupyGrid(cell);
        processedRow.push(cell);
      });

      grid.push(gridRow);
      result.push(processedRow);
    });

    return result;
  }

  function flushTable() {
    if (currentTableCellText.trim()) {
      currentRawTableRow.push({
        text: currentTableCellText.trim(),
        ...currentCellFlags,
      });
      currentTableCellText = '';
      currentCellFlags = { clmgf: false, clmrg: false, clvmgf: false, clvmrg: false };
    }
    if (currentRawTableRow.length > 0) {
      currentRawTableRows.push(currentRawTableRow);
      currentRawTableRow = [];
    }
    if (currentRawTableRows.length > 0) {
      flushCurrentBlock();
      const processedMatrix = processMergedTableMatrix(currentRawTableRows);
      const tableHtml = convertTableMatrixToHtml(processedMatrix);
      blocks.push({
        id: `table-${blocks.length + 1}-${Date.now()}`,
        type: 'TABELA',
        content: tableHtml,
        rawText: 'Tabela',
        tableRows: processedMatrix.map((row) =>
          row.map((cell) => (typeof cell === 'string' ? cell : cell.text))
        ),
      });
      currentRawTableRows = [];
    }
    tableRowOpen = false;
  }

  tokens.forEach((tok) => {
    if (tok.type === 'trowd') {
      if (tok.rowIndex === 0 && !tableRowOpen && currentRawTableRows.length > 0 && currentRawTableRow.length === 0) {
        flushTable();
      }
      tableRowOpen = true;
      return;
    }

    if (tok.type === 'cell') {
      currentRawTableRow.push({
        text: currentTableCellText.trim(),
        clmgf: tok.clmgf,
        clmrg: tok.clmrg,
        clvmgf: tok.clvmgf,
        clvmrg: tok.clvmrg,
        cellRight: tok.cellRight,
      });
      currentTableCellText = '';
      return;
    }

    if (tok.type === 'row') {
      if (currentTableCellText.trim()) {
        currentRawTableRow.push({ text: currentTableCellText.trim() });
        currentTableCellText = '';
      }
      if (currentRawTableRow.length > 0) {
        currentRawTableRows.push(currentRawTableRow);
      }
      currentRawTableRow = [];
      tableRowOpen = false;
      return;
    }

    if (tok.type === 'text' && tok.val) {
      const marca = tok.val.match(/^##([A-Z]{3})/)?.[1];
      const clean = tok.val.replace(/^##[A-Z]{3}\s*/, '').trim();
      if (!clean) return;

      /*
       * Conteúdo de célula. Quem diz é o `\intbl` do próprio arquivo; o estado
       * da linha aberta fica como segunda leitura, para o RTF de gerador que
       * não marca o parágrafo da célula.
       */
      if (tok.intbl || tableRowOpen || currentRawTableRow.length > 0 || currentTableCellText.length > 0) {
        currentTableCellText += (currentTableCellText ? ' ' : '') + clean;
        return;
      }

      /*
       * Daqui para baixo o parágrafo é do documento, e não da tabela: a tabela
       * pendente se fecha agora. É isto que põe o título de tabela depois da
       * tabela anterior, e não na frente dela — `flushTable` grava o bloco da
       * tabela, e o parágrafo que chega depois só é gravado adiante.
       */
      flushTable();

      if (marca === 'ATO' || (state === 'INITIAL' && /^DECRETO|^LEI|^MEDIDA PROVISÓRIA/i.test(clean))) {
        state = 'EPIGRAFE';
        epigrafeLines.push(clean);
        return;
      }

      /*
       * O primeiro dispositivo abre o corpo, viesse o estado de onde viesse.
       * A medida provisória não escreve "DECRETA:": o preâmbulo dela termina em
       * "adota a seguinte Medida Provisória, com força de lei:" e o corpo começa
       * direto no Art. 1º — sem esta porta, o estado nunca chegava a BODY e a
       * MPV inteira (1.860 parágrafos no `.doc` de prova) se acumulava na
       * epígrafe.
       */
      if ((state === 'EPIGRAFE' || state === 'EMENTA' || state === 'PREAMBULO') && isNewDeviceStart(tok.val)) {
        state = 'BODY';
      }

      /*
       * O preâmbulo se reconhece também vindo da epígrafe: quando a ementa não
       * foi lida (ou o ato não a traz), "O PRESIDENTE DA REPÚBLICA…" chegava com
       * o estado ainda em EPIGRAFE e colava nela. A conferência vem antes da
       * ementa porque o preâmbulo também é caixa mista.
       */
      if (
        marca === 'TEX' ||
        ((state === 'EMENTA' || state === 'EPIGRAFE') &&
          /^O PRESIDENTE DA REPÚBLICA|^A PRESIDENTA DA REPÚBLICA|^O VICE-PRESIDENTE DA REPÚBLICA|^O MINISTRO|^A MINISTRA/i.test(clean))
      ) {
        state = 'PREAMBULO';
        preambuloLines.push(clean);
        return;
      }

      /*
       * A ementa se reconhece pela forma, não por lista de verbos: ela é o
       * primeiro parágrafo em caixa mista depois da epígrafe, que é toda em
       * maiúsculas. A lista que havia ("Altera|Dispõe|Aprova|Institui") deixava
       * de fora "Cria a Carreira…" — e a ementa da MPV de prova colava na
       * epígrafe, levando o resto do ato atrás.
       */
      if (marca === 'EME' || (state === 'EPIGRAFE' && clean !== clean.toUpperCase())) {
        state = 'EMENTA';
        ementaLines.push(clean);
        return;
      }

      if (/^(DECRETA|RESOLVE):?$/i.test(clean)) {
        state = 'BODY';
        ordemExecucao = clean;
        return;
      }

      // "Brasília, 1º de agosto de 2026": o ato assinado no primeiro dia do mês
      // escreve o dia em ordinal, e sem isso o fecho não era reconhecido — o
      // estado nunca chegava a FECHO e os signatários viravam dispositivos.
      if (/^(Brasília|Rio de Janeiro),\s*\d+[ºo°]?\s+de/i.test(clean)) {
        flushCurrentBlock();
        state = 'FECHO';
        fechoLines.push(clean);
        return;
      }

      /*
       * O anexo abre depois das assinaturas, e a partir dele nada mais é
       * signatário. Ter o estado próprio é o que permite acolher "REMANEJAMENTO
       * DE CARGOS COMISSIONADOS…" — uma linha inteira em maiúsculas — sem que
       * ela entre na lista de quem assina o ato.
       */
      if (marca === 'ANE' || ((state === 'FECHO' || state === 'ASSINATURA') && /^ANEXO/i.test(clean))) {
        flushCurrentBlock();
        state = 'ANEXO';
      }

      /*
       * Quem assina. A marca da CEJ é quem diz, e por isso o ministro que
       * assina em caixa mista — "Esther Dweck" — chega à lista de assinaturas
       * em vez de sumir. Sem marca, vale a linha em maiúsculas depois do fecho,
       * com a ressalva dos cabeçalhos de anexo e de tabela, que também são
       * linhas em maiúsculas.
       */
      const isAnexoOrTableHeader = /^ANEXO|^CÓDIGO|^UNIDADE|^QUADRO|^REMANEJAMENTO|^TRANSFORMA|^SIGLA|^CARGO|^FCE|^CCE|^\d/.test(clean);
      if (
        marca === 'APR' ||
        marca === 'AMI' ||
        (!isAnexoOrTableHeader &&
          (state === 'FECHO' || state === 'ASSINATURA') &&
          (pareceNomeEmCaixaAlta(clean) || pareceNomeDeSignatario(clean)))
      ) {
        flushCurrentBlock();
        state = 'ASSINATURA';
        assinaturaLines.push(clean);
        return;
      }

      /*
       * As assinaturas são contíguas: vêm logo depois do fecho, uma sob a
       * outra, e acabam no primeiro parágrafo que não é nome — a mesma regra
       * do leitor de HTML. Sem este fecho de lista, tudo o que no anexo tem
       * forma de nome — "SEÇÃO I", os títulos de seção da TIPI — continuava
       * entrando na lista de signatários até o fim do arquivo.
       */
      if (state === 'FECHO' || state === 'ASSINATURA') state = 'ANEXO';

      if (state === 'EPIGRAFE') {
        epigrafeLines.push(clean);
        return;
      }

      if (state === 'EMENTA') {
        ementaLines.push(clean);
        return;
      }

      if (state === 'PREAMBULO') {
        preambuloLines.push(clean);
        return;
      }

      if (state === 'BODY') {
        if (isNewDeviceStart(tok.val)) {
          flushCurrentBlock();
          const parsed = identifyBlockType(tok.val);
          currentBlock = {
            type: parsed.type,
            label: parsed.numberLabel,
            text: parsed.cleanText,
            novaRedacao: parsed.novaRedacao,
            aspas: parsed.aspas,
          };
        } else {
          // Fix #2: linhas sem marcador de bloco SEMPRE acumulam no bloco corrente
          // (evita alíneas truncadas quando o RTF quebra a linha no meio do conteúdo)
          if (currentBlock) {
            currentBlock.text = smartJoin(currentBlock.text, clean);
            // O "(NR)" pode chegar na continuação do dispositivo, e não na
            // linha que o abriu; a marca é do dispositivo de qualquer modo.
            if (/\(\s*NR\s*\)$/i.test(clean)) currentBlock.novaRedacao = true;
            /*
             * As aspas de fechamento também: o arquivo quebra o dispositivo
             * citado em várias linhas, e a última é que traz o "”". Sem ler a
             * continuação, a citação ficava sem fim e o meio dela voltava à
             * margem do ato alterador.
             */
            if (aspasDaLinha(clean) === 'fecha') {
              currentBlock.aspas = currentBlock.aspas === 'abre' ? 'unica' : 'fecha';
            }
          } else {
            currentBlock = { type: 'TEXTO_LIVRE', text: clean };
          }
        }
        return;
      }

      /*
       * Nenhum trecho de texto fica sem destino.
       *
       * Este ramo faltava, e era por onde o anexo inteiro do decreto se perdia:
       * uma vez no fecho, o estado nunca voltava ao corpo, e todo parágrafo dali
       * em diante — o título do anexo, a denominação, os títulos das tabelas —
       * caía fora de todos os `if` sem deixar rastro. Duzentos e doze trechos,
       * quatrocentas e quarenta e uma palavras, num decreto só.
       *
       * Aqui cada parágrafo é um bloco próprio, e não se cola no anterior como
       * no corpo: fora do corpo o `\par` separa coisas distintas — o título do
       * anexo não é continuação da linha que veio antes dele.
       */
      flushCurrentBlock();
      const parsed = identifyBlockType(tok.val);
      if (parsed.cleanText) {
        pushBlock(parsed.type, parsed.numberLabel, parsed.cleanText, parsed.novaRedacao, parsed.aspas);
      } else if (parsed.aspas || parsed.novaRedacao) {
        /*
         * A higienização pode não deixar texto algum: é o caso do `” (NR)` que
         * fecha, sozinho num parágrafo, a citação do anexo. O parágrafo não tem
         * texto do ato — tem as duas marcas, e é a folha que as desenha
         * (invariante 9). Guardá-las como marca, e não como texto, é o que dá
         * fim à citação: sem isso o anexo citado inteiro ficava sem fechamento.
         */
        pushBlock('TEXTO_LIVRE', undefined, '', parsed.novaRedacao, parsed.aspas);
      } else {
        // Sobrou o que a classificação não soube ler. Fica como o arquivo o
        // escreveu — bloco vazio é conteúdo perdido.
        pushBlock('TEXTO_LIVRE', undefined, clean);
      }
    }
  });

  flushTable();
  flushCurrentBlock();

  // Fix #1: Usar smartJoin ao concatenar linhas para evitar espaços antes de pontuação
  const joinLines = (lines: string[]) =>
    lines.reduce((acc, cur) => smartJoin(acc, cur), '').replace(/\s{2,}/g, ' ').trim();

  const fullEpigrafe = joinLines(epigrafeLines);
  const fullEmenta = joinLines(ementaLines);
  const fullPreambulo = joinLines(preambuloLines);
  const fullFecho = joinLines(fechoLines);

  /*
   * Campo que o arquivo não traz nasce **vazio**, e não preenchido por um ato
   * de exemplo.
   *
   * Aqui havia um jogo de valores de reserva — "DECRETO Nº 13.090, DE 4 DE
   * AGOSTO DE 2026", "Brasília, 4 de agosto de 2026", "LUIZ INÁCIO LULA DA
   * SILVA" — que entrava sempre que a classificação não achasse a parte. Quem
   * importasse o que não é ato (uma exposição de motivos, um fragmento) recebia
   * na folha um decreto com número, data e signatário que ninguém escreveu, e
   * podia salvá-lo assim. Inventar identidade de ato é pior que campo em
   * branco: a folha já desenha a frase de espera pelo CSS (invariante 2), e o
   * leitor de HTML sempre devolveu vazio — os dois caminhos agora dizem o
   * mesmo.
   */
  return {
    title: fullEpigrafe || 'Ato Normativo Importado',
    epigrafe: fullEpigrafe,
    ementa: fullEmenta,
    preambulo: fullPreambulo,
    ordemExecucao,
    blocks: preencherCitacoes(centralizarDenominacaoDeAgrupador(blocks)),
    fecho: fullFecho,
    assinaturas: assinaturaLines,
  };
}
