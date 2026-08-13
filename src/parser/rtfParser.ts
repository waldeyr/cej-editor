import { LegislativeBlock, LegislativeDocument, BlockType } from '../types/legislative';

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
const CP1252_MAP: Record<number, string> = {
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

interface RtfToken {
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

/**
 * Verifica se a linha inicia um novo dispositivo legislativo.
 */
function isNewDeviceStart(line: string): boolean {
  const clean = line.replace(/^##[A-Z]{3}\s*/, '').trim();
  return (
    new RegExp(`^Art\\.\\s*\\d+[ºo]?${SUFIXO_DE_INCLUSAO}`, 'i').test(clean) ||
    new RegExp(`^(Parágrafo\\s+único|§\\s*\\d+[ºo]?${SUFIXO_DE_INCLUSAO})`, 'i').test(clean) ||
    new RegExp(`^[IVXLCDM]+${SUFIXO_DE_INCLUSAO}\\s*[-–—]`, 'i').test(clean) ||
    /^[a-z](?:-[A-Z]+)?\)/.test(clean) ||
    /^\d+\.\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(clean) ||
    /^CAPÍTULO|^SEÇÃO|^LIVRO|^TÍTULO|^PARTE|^ANEXO/i.test(clean) ||
    /^“|^"/i.test(clean) ||
    /^(\.|\s){5,}$/.test(clean) ||
    /^\.{4,}/.test(clean)
  );
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
} {
  let clean = line.replace(/^##[A-Z]{3}\s*/, '').trim();

  const novaRedacao = /\(\s*NR\s*\)$/i.test(clean) || undefined;
  const isAlteration = /^“|^"|”\s*\(NR\)$/i.test(clean);
  if (isAlteration) {
    clean = sanitizeQuoteText(clean);
  } else if (novaRedacao) {
    // "(NR)" sem as aspas de fechamento acontece na linha pontilhada que encerra
    // a alteração: ".......................... (NR)".
    clean = clean.replace(/\s*\(\s*NR\s*\)$/i, '').trim();
  }

  const classificado = classificarDispositivo(clean, isAlteration);
  return novaRedacao ? { ...classificado, novaRedacao } : classificado;
}

/** O tipo e o rótulo, já sem as aspas e sem o "(NR)". */
function classificarDispositivo(
  clean: string,
  isAlteration: boolean
): { type: BlockType; numberLabel?: string; cleanText: string } {
  if (new RegExp(`^Art\\.\\s*\\d+[ºo]?${SUFIXO_DE_INCLUSAO}`, 'i').test(clean)) {
    const m = clean.match(new RegExp(`^(Art\\.\\s*\\d+[ºo]?${SUFIXO_DE_INCLUSAO}\\.?)\\s*(.*)`, 'i'));
    return { type: isAlteration ? 'ALTERACAO' : 'ARTIGO', numberLabel: m ? m[1] : '', cleanText: m ? m[2] : clean };
  }
  if (new RegExp(`^(Parágrafo\\s+único|§\\s*\\d+[ºo]?${SUFIXO_DE_INCLUSAO})`, 'i').test(clean)) {
    const m = clean.match(
      new RegExp(`^(Parágrafo\\s+único\\.?|§\\s*\\d+[ºo]?${SUFIXO_DE_INCLUSAO}\\.?)\\s*(.*)`, 'i')
    );
    return { type: isAlteration ? 'ALTERACAO' : 'PARAGRAFO', numberLabel: m ? m[1] : '', cleanText: m ? m[2] : clean };
  }
  if (new RegExp(`^[IVXLCDM]+${SUFIXO_DE_INCLUSAO}\\s*[-–—]`, 'i').test(clean)) {
    const m = clean.match(new RegExp(`^([IVXLCDM]+${SUFIXO_DE_INCLUSAO})\\s*[-–—]\\s*(.*)`, 'i'));
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
  if (/^(\.|\s){5,}$/.test(clean) || /^\.{4,}/.test(clean)) {
    return { type: 'OMISSIS', cleanText: OMISSIS_LINE };
  }
  return { type: 'TEXTO_LIVRE', cleanText: clean };
}

/**
 * Converte arquivo RTF com suporte nativo a tabelas, resiliência legislativa e higienização de aspas.
 */
export function parseRtfToLegislativeDocument(rtfInput: string): LegislativeDocument {
  const tokens = parseRtfTokens(rtfInput);

  let epigrafeLines: string[] = [];
  let ementaLines: string[] = [];
  let preambuloLines: string[] = [];
  let ordemExecucao = 'DECRETA:';
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
  let currentBlock: { type: BlockType; label?: string; text: string; novaRedacao?: boolean } | null = null;

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

  function pushBlock(type: BlockType, label: string | undefined, text: string, novaRedacao?: boolean) {
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
    });
  }

  function flushCurrentBlock() {
    if (!currentBlock) return;
    pushBlock(
      currentBlock.type,
      currentBlock.label,
      sanitizeQuoteText(currentBlock.text),
      currentBlock.novaRedacao
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

      if (marca === 'EME' || (state === 'EPIGRAFE' && /^Altera|^Dispõe|^Aprova|^Institui/i.test(clean))) {
        state = 'EMENTA';
        ementaLines.push(clean);
        return;
      }

      if (marca === 'TEX' || (state === 'EMENTA' && /^O PRESIDENTE DA REPÚBLICA|^O MINISTRO/i.test(clean))) {
        state = 'PREAMBULO';
        preambuloLines.push(clean);
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
          /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s']{3,}$/.test(clean))
      ) {
        flushCurrentBlock();
        state = 'ASSINATURA';
        assinaturaLines.push(clean);
        return;
      }

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
          };
        } else {
          // Fix #2: linhas sem marcador de bloco SEMPRE acumulam no bloco corrente
          // (evita alíneas truncadas quando o RTF quebra a linha no meio do conteúdo)
          if (currentBlock) {
            currentBlock.text = smartJoin(currentBlock.text, clean);
            // O "(NR)" pode chegar na continuação do dispositivo, e não na
            // linha que o abriu; a marca é do dispositivo de qualquer modo.
            if (/\(\s*NR\s*\)$/i.test(clean)) currentBlock.novaRedacao = true;
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
        pushBlock(parsed.type, parsed.numberLabel, parsed.cleanText, parsed.novaRedacao);
      } else {
        // A higienização pode não deixar texto algum: é o caso do `” (NR)` que
        // fecha, sozinho num parágrafo, a citação do anexo. Aí o parágrafo fica
        // como o arquivo o escreveu — bloco vazio é conteúdo perdido.
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

  return {
    title: fullEpigrafe || 'Ato Normativo Importado',
    epigrafe: fullEpigrafe || 'DECRETO Nº 13.090, DE 4 DE AGOSTO DE 2026',
    ementa: fullEmenta || 'Dispõe sobre ato normativo.',
    preambulo: fullPreambulo || 'O PRESIDENTE DA REPÚBLICA, no uso da atribuição que lhe confere a Constituição,',
    ordemExecucao,
    blocks,
    fecho: fullFecho || 'Brasília, 4 de agosto de 2026; 205º da Independência e 138º da República.',
    assinaturas: assinaturaLines.length > 0 ? assinaturaLines : ['LUIZ INÁCIO LULA DA SILVA'],
  };
}
