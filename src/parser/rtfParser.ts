import { LegislativeBlock, LegislativeDocument, BlockType } from '../types/legislative';

/**
 * Mapeamento de tabela de caracteres CP1252 para UTF-8 para escapes RTF Hex (\'XX)
 */
const CP1252_MAP: Record<number, string> = {
  0xba: 'º', 0xaa: 'ª', 0xe1: 'á', 0xe9: 'é', 0xed: 'í', 0xf3: 'ó', 0xfa: 'ú',
  0xe3: 'ã', 0xf5: 'õ', 0xe2: 'â', 0xea: 'ê', 0xf4: 'ô', 0xe7: 'ç', 0xc1: 'Á',
  0xc9: 'É', 0xcd: 'Í', 0xd3: 'Ó', 0xda: 'Ú', 0xc3: 'Ã', 0xd5: 'Õ', 0xc2: 'Â',
  0xca: 'Ê', 0xd4: 'Ô', 0xc7: 'Ç', 0x93: '“', 0x94: '”', 0x96: '–', 0x97: '—'
};

interface RtfToken {
  type: 'text' | 'cell' | 'row' | 'par' | 'trowd';
  val?: string;
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

  const IGNORE_GROUPS = new Set([
    'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer',
    'panose', 'falt', 'generator', 'themedata', 'colorscheme', 'fontemb',
    'realdata', 'datastore', 'xmltbl', 'expandedcolortbl', '*', 'author', 'operator', 'keywords', 'comment', 'latentstyles'
  ]);

  function flushText() {
    let raw = currentText.trim();
    if (raw.length === 0) return;
    const parts = raw.split(/\r?\n/);
    let normalized = '';
    for (const part of parts) {
      const p = part.trim();
      if (!p) continue;
      if (!normalized) {
        normalized = p;
        continue;
      }
      if (/^[,;.:\)!?]/.test(p)) {
        normalized = normalized + p;
      } else if (/\d$/.test(normalized) && /^[\dºª]/.test(p)) {
        normalized = normalized + p;
      } else if (/[a-zA-Z]$/.test(normalized) && /^[ºª]/.test(p)) {
        normalized = normalized + p;
      } else {
        normalized = normalized + ' ' + p;
      }
    }
    if (normalized.length > 0) {
      tokens.push({ type: 'text', val: normalized });
    }
    currentText = '';
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

    // Comandos de controle RTF
    if (char === '\\') {
      let match = input.substring(pos).match(/^\\([a-zA-Z0-9]+|\~|\-|\_)\s?/);
      if (match) {
        pos += match[0].length;
        continue;
      }
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
 * Verifica se a linha inicia um novo dispositivo legislativo.
 */
function isNewDeviceStart(line: string): boolean {
  const clean = line.replace(/^##[A-Z]{3}\s*/, '').trim();
  return (
    /^Art\.\s*\d+[ºo]?/i.test(clean) ||
    /^(Parágrafo\s+único|\§\s*\d+[ºo]?)/i.test(clean) ||
    /^[IVXLCDM]+\s*[-–—]/i.test(clean) ||
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
 */
export function identifyBlockType(line: string): { type: BlockType; numberLabel?: string; cleanText: string } {
  let clean = line.replace(/^##[A-Z]{3}\s*/, '').trim();

  const isAlteration = /^“|^"|”\s*\(NR\)$/i.test(clean);
  if (isAlteration) {
    clean = sanitizeQuoteText(clean);
  }

  if (/^Art\.\s*\d+[ºo]?/i.test(clean)) {
    const m = clean.match(/^(Art\.\s*\d+[ºo]?\.?)\s*(.*)/i);
    return { type: isAlteration ? 'ALTERACAO' : 'ARTIGO', numberLabel: m ? m[1] : '', cleanText: m ? m[2] : clean };
  }
  if (/^(Parágrafo\s+único|\§\s*\d+[ºo]?)/i.test(clean)) {
    const m = clean.match(/^(Parágrafo\s+único\.?|\§\s*\d+[ºo]?\.?)\s*(.*)/i);
    return { type: isAlteration ? 'ALTERACAO' : 'PARAGRAFO', numberLabel: m ? m[1] : '', cleanText: m ? m[2] : clean };
  }
  if (/^[IVXLCDM]+\s*[-–—]/i.test(clean)) {
    const m = clean.match(/^([IVXLCDM]+)\s*[-–—]\s*(.*)/i);
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
  if (/^ANEXO\s+[IVXLCDM\d]*/i.test(clean)) {
    return { type: 'ANEXO', cleanText: clean };
  }
  if (/^CAPÍTULO|^SEÇÃO|^LIVRO|^TÍTULO|^PARTE/i.test(clean)) {
    return { type: 'TITULO_AGRUPADOR', cleanText: clean };
  }
  if (isAlteration) {
    return { type: 'ALTERACAO', cleanText: clean };
  }
  if (/^(\.|\s){5,}$/.test(clean) || /^\.{4,}/.test(clean)) {
    return { type: 'OMISSIS', cleanText: '.......................................................................................................' };
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

  let state: 'INITIAL' | 'EPIGRAFE' | 'EMENTA' | 'PREAMBULO' | 'BODY' | 'FECHO' | 'ASSINATURA' = 'INITIAL';

  const blocks: LegislativeBlock[] = [];
  let currentBlock: { type: BlockType; label?: string; text: string } | null = null;

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
  let inTableMode = false;
  let tableRowOpen = false;

  let artCounter = 0;

  function flushCurrentBlock() {
    if (!currentBlock) return;
    let linkName: string | undefined;
    if (currentBlock.type === 'ARTIGO') {
      artCounter++;
      linkName = `art${artCounter}`;
    }
    const sanitizedText = sanitizeQuoteText(currentBlock.text);
    blocks.push({
      id: `block-${blocks.length + 1}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type: currentBlock.type,
      numberLabel: currentBlock.label,
      content: sanitizedText,
      rawText: sanitizedText,
      linkName,
    });
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
        const text = cellData.text.replace(/^-70\s*/, '').trim();
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
        text: currentTableCellText.trim().replace(/^-70\s*/, ''),
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
    inTableMode = false;
    tableRowOpen = false;
  }

  tokens.forEach((tok) => {
    if (tok.type === 'trowd') {
      if (tok.rowIndex === 0 && !tableRowOpen && currentRawTableRows.length > 0 && currentRawTableRow.length === 0) {
        flushTable();
      }
      inTableMode = true;
      tableRowOpen = true;
      return;
    }

    if (tok.type === 'cell') {
      inTableMode = true;
      currentRawTableRow.push({
        text: currentTableCellText.trim().replace(/^-70\s*/, ''),
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
      inTableMode = true;
      if (currentTableCellText.trim()) {
        currentRawTableRow.push({
          text: currentTableCellText.trim().replace(/^-70\s*/, ''),
        });
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
      const clean = tok.val.replace(/^##[A-Z]{3}\s*/, '').replace(/^-70\s*/, '').trim();
      if (!clean) return;

      if (/^ANEXO\s+[IVXLCDM\d]*/i.test(clean) || /^QUADRO\s+RESUMO/i.test(clean)) {
        flushTable();
        inTableMode = false;
      }

      // Se estamos em modo tabela ou acumulando celula
      if (tableRowOpen || currentRawTableRow.length > 0 || currentTableCellText.length > 0) {
        currentTableCellText += (currentTableCellText ? ' ' : '') + clean;
        return;
      }

      if (tok.val.startsWith('##ATO') || (state === 'INITIAL' && /^DECRETO|^LEI|^MEDIDA PROVISÓRIA/i.test(clean))) {
        flushTable();
        state = 'EPIGRAFE';
        epigrafeLines.push(clean);
        return;
      }

      if (tok.val.startsWith('##EME') || (state === 'EPIGRAFE' && /^Altera|^Dispõe|^Aprova|^Institui/i.test(clean))) {
        flushTable();
        state = 'EMENTA';
        ementaLines.push(clean);
        return;
      }

      if (tok.val.startsWith('##TEX') || (state === 'EMENTA' && /^O PRESIDENTE DA REPÚBLICA|^O MINISTRO/i.test(clean))) {
        flushTable();
        state = 'PREAMBULO';
        preambuloLines.push(clean);
        return;
      }

      if (/^(DECRETA|RESOLVE):?$/i.test(clean)) {
        flushTable();
        state = 'BODY';
        ordemExecucao = clean;
        return;
      }

      if (/^(Brasília|Rio de Janeiro),\s*\d+\s+de/i.test(clean)) {
        flushTable();
        flushCurrentBlock();
        state = 'FECHO';
        fechoLines.push(clean);
        return;
      }

      // Fix #3: Captura de assinaturas — aceita nomes em maiúsculas puras (Presidente + Ministros)
      // Excluí: cabeçalhos de Anexo, rótulos de tabela e siglas soltas
      // Também continua capturando no estado ASSINATURA para múltiplos signatários
      const isAnexoOrTableHeader = /^ANEXO|^CÓDIGO|^UNIDADE|^QUADRO|^REMANEJAMENTO|^TRANSFORMA|^SIGLA|^CARGO|^FCE|^CCE|^\d/.test(clean);
      if (
        !isAnexoOrTableHeader &&
        (state === 'FECHO' || state === 'ASSINATURA') &&
        /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s']{3,}$/.test(clean)
      ) {
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
          flushTable();
          flushCurrentBlock();
          const parsed = identifyBlockType(tok.val);
          currentBlock = { type: parsed.type, label: parsed.numberLabel, text: parsed.cleanText };
        } else {
          // Fix #2: linhas sem marcador de bloco SEMPRE acumulam no bloco corrente
          // (evita alíneas truncadas quando o RTF quebra a linha no meio do conteúdo)
          if (currentBlock) {
            currentBlock.text = smartJoin(currentBlock.text, clean);
          } else {
            currentBlock = { type: 'TEXTO_LIVRE', text: clean };
          }
        }
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
