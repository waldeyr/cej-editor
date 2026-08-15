import { LegislativeDocument } from '../types/legislative';
import { CP1252_MAP, RtfToken, parseTokensToLegislativeDocument } from './rtfParser';

/**
 * Leitor do Word binário (`.doc`, Word 97-2003).
 *
 * O arquivo é um contêiner OLE (Compound File Binary) com o texto dentro do
 * stream `WordDocument`, o mapa do texto no stream `0Table`/`1Table` e, quando
 * as propriedades de parágrafo não cabem no lugar de origem, um stream `Data`.
 * Este módulo lê essas três camadas — contêiner, FIB e piece table, PAPX — e
 * entrega o resultado como os mesmos tokens do leitor de RTF, para que a
 * classificação legislativa seja uma só (`parseTokensToLegislativeDocument`).
 *
 * O que se lê de propósito, e o que se deixa de fora:
 *
 *   · **só o documento principal** (os primeiros `ccpText` caracteres): nota de
 *     rodapé, cabeçalho e caixa de texto vêm depois dessa marca, e não são o
 *     ato — é o mesmo recorte que o mammoth faz no `.docx`;
 *   · **tabela com mesclagem**: quem diz onde a célula acaba é o caractere
 *     0x07, e quem diz se ele fecha a célula ou a linha inteira é o PAPX do
 *     parágrafo (`sprmPFTtp`). Adivinhar pela forma do texto — como se fazia no
 *     RTF antes do `\intbl` — erra a primeira célula de cada linha;
 *   · **negrito e remissão não**: o leitor de RTF também não os traz, e a
 *     paridade entre os dois formatos vale mais que um enfeite de um lado só.
 */

/** Fim de cadeia nas FATs do contêiner OLE. */
const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;

/** A assinatura OLE: é ela que separa o Word binário do RTF disfarçado de .doc. */
export function ehArquivoCfb(bytes: Uint8Array): boolean {
  return (
    bytes.length > 8 &&
    bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 && bytes[5] === 0xb1 && bytes[6] === 0x1a && bytes[7] === 0xe1
  );
}

interface StreamsDoWord {
  word: Uint8Array;
  table: Uint8Array;
  data: Uint8Array;
}

/**
 * Abre o contêiner OLE e devolve os streams que o Word usa.
 *
 * A leitura cobre a mini-FAT: stream menor que o corte (4096 bytes) não mora
 * em setores próprios, mas dentro do stream da raiz, endereçado em fatias de
 * 64 bytes — e o `0Table` de um ato curto cabe inteiro ali. Sem essa camada, o
 * arquivo pequeno abriria com o mapa do texto vazio e o grande funcionaria,
 * que é o pior tipo de defeito para se perceber.
 */
function abrirContainerOle(bytes: Uint8Array): StreamsDoWord {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (off: number) => dv.getUint16(off, true);
  const u32 = (off: number) => dv.getUint32(off, true);

  const sectorSize = 1 << u16(30);
  const miniSize = 1 << u16(32);
  const firstDirSector = u32(48);
  const miniCutoff = u32(56);
  const firstMiniFatSector = u32(60);
  const numMiniFatSectors = u32(64);
  const firstDifatSector = u32(68);
  const numDifatSectors = u32(72);

  const sectorOffset = (n: number) => (n + 1) * sectorSize;

  // A DIFAT lista os setores da FAT: 109 entradas no cabeçalho e o resto em
  // setores encadeados — o arquivo de 13 MB da TIPI precisa dos dois.
  const difat: number[] = [];
  for (let i = 0; i < 109; i++) difat.push(u32(76 + i * 4));
  let difatSector = firstDifatSector;
  for (let i = 0; i < numDifatSectors && difatSector !== ENDOFCHAIN; i++) {
    const base = sectorOffset(difatSector);
    const porSetor = sectorSize / 4 - 1;
    for (let j = 0; j < porSetor; j++) difat.push(u32(base + j * 4));
    difatSector = u32(base + porSetor * 4);
  }

  const fat: number[] = [];
  for (const s of difat) {
    if (s === FREESECT || s === ENDOFCHAIN) continue;
    const base = sectorOffset(s);
    for (let j = 0; j < sectorSize / 4; j++) fat.push(u32(base + j * 4));
  }

  const lerCadeia = (inicio: number, tamanho: number): Uint8Array => {
    const saida = new Uint8Array(tamanho);
    let pos = 0;
    let s = inicio;
    while (s !== ENDOFCHAIN && s !== FREESECT && pos < tamanho) {
      const base = sectorOffset(s);
      const n = Math.min(sectorSize, tamanho - pos);
      saida.set(bytes.subarray(base, base + n), pos);
      pos += n;
      s = fat[s];
    }
    return saida;
  };

  interface EntradaDeDiretorio {
    name: string;
    type: number;
    startSector: number;
    size: number;
  }
  const entradas: EntradaDeDiretorio[] = [];
  let dirSector = firstDirSector;
  while (dirSector !== ENDOFCHAIN && dirSector !== FREESECT) {
    const base = sectorOffset(dirSector);
    for (let e = 0; e < sectorSize / 128; e++) {
      const off = base + e * 128;
      const nameLen = u16(off + 64);
      if (nameLen === 0) continue;
      let name = '';
      for (let c = 0; c < nameLen / 2 - 1; c++) name += String.fromCharCode(u16(off + c * 2));
      entradas.push({ name, type: bytes[off + 66], startSector: u32(off + 116), size: u32(off + 120) });
    }
    dirSector = fat[dirSector];
  }

  const raiz = entradas.find((e) => e.type === 5);
  const miniFat: number[] = [];
  let miniFatSector = firstMiniFatSector;
  for (let i = 0; i < numMiniFatSectors && miniFatSector !== ENDOFCHAIN; i++) {
    const base = sectorOffset(miniFatSector);
    for (let j = 0; j < sectorSize / 4; j++) miniFat.push(u32(base + j * 4));
    miniFatSector = fat[miniFatSector];
  }
  const miniStream = raiz ? lerCadeia(raiz.startSector, raiz.size) : new Uint8Array(0);

  const lerStream = (nome: string): Uint8Array | null => {
    const entrada = entradas.find((e) => e.name === nome);
    if (!entrada) return null;
    if (entrada.size >= miniCutoff) return lerCadeia(entrada.startSector, entrada.size);
    const saida = new Uint8Array(entrada.size);
    let pos = 0;
    let s = entrada.startSector;
    while (s !== ENDOFCHAIN && s !== FREESECT && pos < entrada.size) {
      const n = Math.min(miniSize, entrada.size - pos);
      saida.set(miniStream.subarray(s * miniSize, s * miniSize + n), pos);
      pos += n;
      s = miniFat[s];
    }
    return saida;
  };

  const word = lerStream('WordDocument');
  if (!word || word.length < 0x0200) {
    throw new Error('Este arquivo .doc não traz um documento do Word que o editor reconheça.');
  }

  // Qual dos dois streams de mapa vale é o FIB quem diz (fWhichTblStm): o Word
  // alterna entre 0Table e 1Table a cada gravação rápida, e o errado pode
  // existir no arquivo com conteúdo velho.
  const flags = new DataView(word.buffer, word.byteOffset, word.byteLength).getUint16(0x0a, true);
  const table = lerStream(flags & 0x0200 ? '1Table' : '0Table') || new Uint8Array(0);
  const data = lerStream('Data') || new Uint8Array(0);

  return { word, table, data };
}

/** Um parágrafo do documento, com as marcas que a máquina de estados precisa. */
interface ParagrafoDoDoc {
  texto: string;
  /** 0x0d fim de parágrafo, 0x07 célula ou linha de tabela, 0x0c quebra de página. */
  marca: number;
  emTabela: boolean;
  fimDeLinhaDeTabela: boolean;
  /** Dentro de tabela aninhada: o conteúdo fica na célula de fora. */
  aninhado: boolean;
  tap: TapDaLinha | null;
}

interface TapDaLinha {
  itcMac: number;
  /** Borda direita de cada célula, em twips — o `\cellx` do RTF. */
  cellRight: number[];
  clmgf: boolean[];
  clmrg: boolean[];
  clvmgf: boolean[];
  clvmrg: boolean[];
}

/** O tamanho do operando de cada sprm, dado pelos 3 bits altos do código. */
function tamanhoDoOperando(sprm: number, off: number, view: DataView): number | undefined {
  switch (sprm >>> 13) {
    case 0:
    case 1:
      return 1;
    case 2:
    case 4:
    case 5:
      return 2;
    case 3:
      return 4;
    case 7:
      return 3;
    case 6:
      // A definição de tabela é o único operando variável cujo tamanho é de
      // dois bytes: uma linha larga não cabe em 255.
      if (sprm === 0xd608 || sprm === 0xd606) return view.getUint16(off, true) + 1;
      return view.getUint8(off) + 1;
  }
  return undefined;
}

interface PropriedadesDeParagrafo {
  emTabela: boolean;
  fimDeLinha: boolean;
  aninhado: boolean;
  tap: TapDaLinha | null;
}

/**
 * Extrai o documento principal de um `.doc` como tokens do leitor de RTF.
 *
 * Exportada para que o teste possa aferir a extração sem passar pela
 * classificação — a conta de palavras do arquivo se faz sobre estes tokens.
 */
export function extrairTokensDoDoc(bytes: Uint8Array): RtfToken[] {
  const { word, table, data } = abrirContainerOle(bytes);
  const wdv = new DataView(word.buffer, word.byteOffset, word.byteLength);
  const tdv = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const ddv = new DataView(data.buffer, data.byteOffset, data.byteLength);

  if (wdv.getUint16(0, true) !== 0xa5ec) {
    throw new Error('Este arquivo .doc não traz um documento do Word que o editor reconheça.');
  }
  const nFib = wdv.getUint16(2, true);
  const flags = wdv.getUint16(0x0a, true);
  if (flags & 0x0100) {
    throw new Error('Este arquivo .doc está protegido por senha. Remova a proteção no Word e salve novamente.');
  }

  /*
   * Word 6/95 guarda o texto de outro jeito (e com sprms de um byte). O texto
   * corrido ainda se alcança — fcMin a fcMac —, e é melhor entregá-lo sem
   * tabelas do que recusar o arquivo: a regra da importação é palavra nenhuma
   * ficar para trás. O fast-save (fComplex) é a exceção honesta: o texto está
   * fora de ordem e remontá-lo sem a piece table antiga inventaria um ato.
   */
  if (nFib < 0x00c1) {
    if (flags & 0x0004) {
      throw new Error(
        'Este arquivo .doc é de um Word antigo com gravação rápida, que o editor não lê. Abra-o no Word e salve como .docx ou .rtf.'
      );
    }
    const fcMin = wdv.getUint32(0x18, true);
    const fcMac = wdv.getUint32(0x1c, true);
    return tokensDoTextoCorrido(word.subarray(fcMin, fcMac));
  }

  /*
   * Os campos do FIB moram depois de três contadores variáveis; os offsets são
   * calculados, e não fixos, porque o Word de cada época escreve blobs de
   * tamanhos diferentes — o fixo acerta no arquivo de teste e erra no resto.
   */
  const csw = wdv.getUint16(0x20, true);
  const posCslw = 0x22 + csw * 2;
  const cslw = wdv.getUint16(posCslw, true);
  const posFibRgLw = posCslw + 2;
  const ccpText = wdv.getInt32(posFibRgLw + 12, true);
  const posBlob = posFibRgLw + cslw * 4 + 2;
  const parFcLcb = (indice: number) => ({
    fc: wdv.getUint32(posBlob + indice * 8, true),
    lcb: wdv.getUint32(posBlob + indice * 8 + 4, true),
  });
  const plcfBtePapx = parFcLcb(13);
  const clx = parFcLcb(33);

  // ---- piece table: onde cada trecho do texto mora, e em que codificação ----
  interface Piece {
    cpStart: number;
    cpEnd: number;
    fc: number;
    compressed: boolean;
  }
  const pieces: Piece[] = [];
  {
    let p = clx.fc;
    const fim = clx.fc + clx.lcb;
    let pcdt = -1;
    while (p < fim) {
      const clxt = table[p];
      if (clxt === 0x01) {
        p += 3 + tdv.getInt16(p + 1, true);
      } else if (clxt === 0x02) {
        pcdt = p;
        break;
      } else break;
    }
    if (pcdt < 0) {
      throw new Error('Este arquivo .doc não traz um documento do Word que o editor reconheça.');
    }
    const lcbPlcPcd = tdv.getUint32(pcdt + 1, true);
    const base = pcdt + 5;
    const n = (lcbPlcPcd - 4) / 12;
    for (let i = 0; i < n; i++) {
      const fcBruto = tdv.getUint32(base + (n + 1) * 4 + i * 8 + 2, true);
      const compressed = (fcBruto & 0x40000000) !== 0;
      pieces.push({
        cpStart: tdv.getUint32(base + i * 4, true),
        cpEnd: tdv.getUint32(base + (i + 1) * 4, true),
        fc: compressed ? (fcBruto & 0x3fffffff) >>> 1 : fcBruto & 0x3fffffff,
        compressed,
      });
    }
  }

  /*
   * O texto e, para cada caractere, o offset dele no stream — porque é pelo
   * offset (FC), e não pela posição no texto (CP), que o PAPX se encontra.
   * A piece comprimida guarda um byte CP1252 por caractere; a outra, UTF-16.
   */
  const chars = new Array<string>(ccpText);
  const fcDoCp = new Uint32Array(ccpText);
  {
    let cp = 0;
    for (const piece of pieces) {
      for (let i = 0; cp < ccpText && piece.cpStart + i < piece.cpEnd; i++, cp++) {
        if (piece.compressed) {
          const b = word[piece.fc + i];
          chars[cp] = CP1252_MAP[b] || String.fromCharCode(b);
          fcDoCp[cp] = piece.fc + i;
        } else {
          chars[cp] = String.fromCharCode(wdv.getUint16(piece.fc + i * 2, true));
          fcDoCp[cp] = piece.fc + i * 2;
        }
      }
      if (cp >= ccpText) break;
    }
  }

  // ---- PAPX: as propriedades do parágrafo, achadas pelo FC do fim dele ----
  const nBte = (plcfBtePapx.lcb - 4) / 8;
  const bteFc: number[] = [];
  const btePn: number[] = [];
  for (let i = 0; i <= nBte; i++) bteFc.push(tdv.getUint32(plcfBtePapx.fc + i * 4, true));
  for (let i = 0; i < nBte; i++) {
    btePn.push(tdv.getUint32(plcfBtePapx.fc + (nBte + 1) * 4 + i * 4, true) & 0x3fffff);
  }

  const lerGrpprl = (grpprl: Uint8Array, props: PropriedadesDeParagrafo): void => {
    const view = new DataView(grpprl.buffer, grpprl.byteOffset, grpprl.byteLength);
    let p = 0;
    while (p + 2 <= grpprl.length) {
      const sprm = view.getUint16(p, true);
      p += 2;
      const len = tamanhoDoOperando(sprm, p, view);
      if (len === undefined || p + len > grpprl.length) break;
      if (sprm === 0x2416) props.emTabela = grpprl[p] !== 0;
      else if (sprm === 0x2417) props.fimDeLinha = grpprl[p] !== 0;
      // Tabela dentro de célula (Word 2000+): o miolo dela entra como texto da
      // célula de fora, porque a folha não desenha grade dentro de grade.
      else if (sprm === 0x244b || sprm === 0x244c) props.aninhado = props.aninhado || grpprl[p] !== 0;
      else if (sprm === 0x6649) props.aninhado = props.aninhado || view.getUint32(p, true) > 1;
      else if (sprm === 0x6646) {
        // sprmPHugePapx: o grpprl não coube no FKP e mora no stream Data. A
        // TIPI guarda ali a definição de cada uma das 16.984 linhas de tabela.
        const off = view.getUint32(p, true);
        if (off + 2 <= data.length) {
          const cb = ddv.getUint16(off, true);
          lerGrpprl(data.subarray(off + 2, Math.min(off + 2 + cb, data.length)), props);
        }
      } else if (sprm === 0xd608) {
        const itcMac = grpprl[p + 2];
        const centros: number[] = [];
        for (let i = 0; i <= itcMac; i++) centros.push(view.getInt16(p + 3 + i * 2, true));
        const tap: TapDaLinha = {
          itcMac,
          cellRight: centros.slice(1),
          clmgf: [],
          clmrg: [],
          clvmgf: [],
          clvmrg: [],
        };
        const baseTc = p + 3 + (itcMac + 1) * 2;
        for (let i = 0; i < itcMac; i++) {
          const o = baseTc + i * 20;
          const tcgrf = o + 2 <= p + len ? view.getUint16(o, true) : 0;
          // No TC do Word, "first merged" abre a mesclagem horizontal e
          // "merged" a continua; na vertical, "restart" abre e a marca sem
          // restart continua — exatamente o clmgf/clmrg/clvmgf/clvmrg do RTF.
          tap.clmgf.push((tcgrf & 0x0001) !== 0);
          tap.clmrg.push((tcgrf & 0x0002) !== 0);
          tap.clvmgf.push((tcgrf & 0x0020) !== 0 && (tcgrf & 0x0040) !== 0);
          tap.clvmrg.push((tcgrf & 0x0020) !== 0 && (tcgrf & 0x0040) === 0);
        }
        props.tap = tap;
      }
      p += len;
    }
  };

  const propriedadesEm = (fcAlvo: number): PropriedadesDeParagrafo => {
    const props: PropriedadesDeParagrafo = { emTabela: false, fimDeLinha: false, aninhado: false, tap: null };
    let lo = 0;
    let hi = nBte - 1;
    let idx = -1;
    while (lo <= hi) {
      const meio = (lo + hi) >> 1;
      if (bteFc[meio] <= fcAlvo) {
        idx = meio;
        lo = meio + 1;
      } else hi = meio - 1;
    }
    if (idx < 0) return props;
    const pagina = btePn[idx] * 512;
    if (pagina + 512 > word.length) return props;
    const cpara = word[pagina + 511];
    let par = -1;
    for (let i = 0; i < cpara; i++) {
      if (fcAlvo >= wdv.getUint32(pagina + i * 4, true) && fcAlvo < wdv.getUint32(pagina + (i + 1) * 4, true)) {
        par = i;
        break;
      }
    }
    if (par < 0) return props;
    const bOffset = word[pagina + (cpara + 1) * 4 + par * 13];
    if (bOffset === 0) return props;
    let p = pagina + bOffset * 2;
    let cb = word[p];
    let fimGrpprl: number;
    if (cb === 0) {
      cb = word[p + 1];
      p += 2;
      fimGrpprl = p + 2 * cb;
    } else {
      p += 1;
      fimGrpprl = p + 2 * cb - 1;
    }
    // Os dois primeiros bytes são o istd (estilo); os sprms vêm depois dele.
    lerGrpprl(word.subarray(p + 2, Math.min(fimGrpprl, word.length)), props);
    return props;
  };

  // ---- varredura: do texto plano aos parágrafos com marca ----
  const paragrafos: ParagrafoDoDoc[] = [];
  let atual = '';
  /*
   * Profundidade de campo do Word (hyperlink, PAGEREF, …): entre 0x13 e 0x14
   * fica a instrução, que não é texto do ato; entre 0x14 e 0x15, o resultado,
   * que é. Os campos aninham — o sumário carrega hyperlinks dentro —, e por
   * isso a pilha, e não um booleano.
   */
  const campo: Array<'instrucao' | 'resultado'> = [];
  const textoVisivel = () => campo.every((parte) => parte === 'resultado');

  const fecharParagrafo = (marca: number, cp: number) => {
    const props = propriedadesEm(fcDoCp[cp]);
    paragrafos.push({
      texto: atual,
      marca,
      emTabela: props.emTabela || marca === 0x07 || props.aninhado,
      fimDeLinhaDeTabela: props.fimDeLinha && !props.aninhado,
      aninhado: props.aninhado,
      tap: props.tap,
    });
    atual = '';
  };

  for (let cp = 0; cp < ccpText; cp++) {
    const codigo = chars[cp].charCodeAt(0);
    if (codigo === 0x13) {
      campo.push('instrucao');
      continue;
    }
    if (codigo === 0x14) {
      if (campo.length > 0) campo[campo.length - 1] = 'resultado';
      continue;
    }
    if (codigo === 0x15) {
      campo.pop();
      continue;
    }
    if (codigo === 0x0d || codigo === 0x07 || codigo === 0x0c) {
      fecharParagrafo(codigo, cp);
      continue;
    }
    if (!textoVisivel()) continue;
    if (codigo === 0x0b) {
      // Quebra de linha dentro do parágrafo: vale o que o `\line` vale no RTF.
      fecharParagrafo(0x0d, cp);
      continue;
    }
    if (codigo === 0x1e) {
      atual += '-';
      continue;
    }
    // 0x1f é hífen opcional; 0x01/0x02/0x05/0x08 são âncoras de objeto, nota e
    // desenho — marcas de posição, não texto.
    if (codigo < 0x20 && codigo !== 0x09) continue;
    atual += chars[cp];
  }
  if (atual.trim()) {
    paragrafos.push({ texto: atual, marca: 0, emTabela: false, fimDeLinhaDeTabela: false, aninhado: false, tap: null });
  }

  return paragrafosParaTokens(paragrafos);
}

/**
 * Monta os tokens na ordem que a máquina de estados espera: `trowd` antes das
 * células, cada célula com as marcas de mesclagem da sua coluna, `row` ao fim.
 *
 * A linha se monta em memória antes de virar token porque o arquivo entrega a
 * definição das células (o TAP) **depois** do conteúdo delas, no parágrafo que
 * fecha a linha — a mesma inversão que no RTF obrigou o `\intbl`.
 */
function paragrafosParaTokens(paragrafos: ParagrafoDoDoc[]): RtfToken[] {
  const tokens: RtfToken[] = [];
  let linhaAtual: string[][] = [];
  let celulaAtual: string[] = [];
  let indiceDaLinha = 0;

  const emitirLinha = (tap: TapDaLinha | null) => {
    if (celulaAtual.length > 0) {
      linhaAtual.push(celulaAtual);
      celulaAtual = [];
    }
    if (linhaAtual.length === 0) return;
    tokens.push({ type: 'trowd', rowIndex: indiceDaLinha++ });
    linhaAtual.forEach((paragrafosDaCelula, i) => {
      for (const texto of paragrafosDaCelula) {
        if (texto.trim()) tokens.push({ type: 'text', val: texto.trim(), intbl: true });
      }
      tokens.push({
        type: 'cell',
        clmgf: tap?.clmgf[i],
        clmrg: tap?.clmrg[i],
        clvmgf: tap?.clvmgf[i],
        clvmrg: tap?.clvmrg[i],
        cellRight: tap?.cellRight[i],
      });
    });
    tokens.push({ type: 'row' });
    linhaAtual = [];
  };

  for (const paragrafo of paragrafos) {
    if (paragrafo.emTabela) {
      if (paragrafo.fimDeLinhaDeTabela) {
        emitirLinha(paragrafo.tap);
      } else if (paragrafo.marca === 0x07 && !paragrafo.aninhado) {
        celulaAtual.push(paragrafo.texto);
        linhaAtual.push(celulaAtual);
        celulaAtual = [];
      } else {
        // Parágrafo no meio da célula — ou de tabela aninhada: fica com ela,
        // à espera do 0x07 que fecha a célula de fora.
        celulaAtual.push(paragrafo.texto);
      }
      continue;
    }

    // Linha de tabela que ficou sem fecho — arquivo truncado — ainda vira linha.
    emitirLinha(null);
    indiceDaLinha = 0;

    const texto = paragrafo.texto.trim();
    if (texto) {
      tokens.push({ type: 'text', val: texto });
      tokens.push({ type: 'par' });
    }
  }
  emitirLinha(null);

  return tokens;
}

/** Texto corrido do Word 6/95: parágrafos por 0x0D, sem mapa e sem tabelas. */
function tokensDoTextoCorrido(bytes: Uint8Array): RtfToken[] {
  const tokens: RtfToken[] = [];
  let atual = '';
  for (const b of bytes) {
    if (b === 0x0d || b === 0x07 || b === 0x0c || b === 0x0b) {
      const texto = atual.trim();
      if (texto) {
        tokens.push({ type: 'text', val: texto });
        tokens.push({ type: 'par' });
      }
      atual = '';
      continue;
    }
    if (b < 0x20 && b !== 0x09) continue;
    atual += CP1252_MAP[b] || String.fromCharCode(b);
  }
  if (atual.trim()) tokens.push({ type: 'text', val: atual.trim() });
  return tokens;
}

/** Importa um `.doc` binário com a mesma classificação legislativa do RTF. */
export function parseDocBinarioToLegislativeDocument(bytes: Uint8Array): LegislativeDocument {
  return parseTokensToLegislativeDocument(extrairTokensDoDoc(bytes));
}
