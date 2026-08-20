import { describe, it, expect } from 'vitest';
import { parseTokensToLegislativeDocument } from './rtfParser';
import { ehArquivoCfb, extrairTokensDoDoc, parseDocBinarioToLegislativeDocument } from './docParser';

/**
 * Testes diretos do leitor de `.doc` binário (OLE/CFB).
 *
 * `docs/file-tests/` não guarda nenhum `.doc` — os atos reais que exercitam
 * este leitor (`DEC11158.doc`, `Mpv-1286-24.doc`) ficam fora do git de
 * propósito (ver `importacaoSemPerda.test.ts`) e, neste ambiente, não estão
 * presentes no disco. Por isso as provas aqui são contêineres OLE construídos
 * à mão: pequenos o bastante para caber num teste, e fiéis o bastante à forma
 * do arquivo real (cabeçalho, FAT, diretório, FIB, piece table) para exercitar
 * o mesmo código que lê a TIPI e a MPV 1.286.
 *
 * O cabeçalho é escrito com `miniStreamCutoff = 0`, o que força toda leitura
 * de stream a passar pela FAT normal — a mini-FAT (para streams pequenos)
 * existe no formato, mas não é o que estes testes verificam; teria peso de
 * implementação duplicada sem cobrir código novo do `docParser`.
 */

const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;
const SECTOR = 512;

/** Deslocamento de um setor de dados: o setor -1 (cabeçalho) ocupa os primeiros 512 bytes. */
const deslocamentoDoSetor = (n: number) => SECTOR + n * SECTOR;

/**
 * Monta um contêiner OLE/CFB mínimo com os streams dados, cada um em sua
 * própria cadeia de setores de 512 bytes.
 */
function construirCfb(streams: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const setoresPorStream = streams.map((s) => Math.max(1, Math.ceil(s.bytes.length / SECTOR)));
  const totalSetoresDeDados = setoresPorStream.reduce((a, b) => a + b, 0);
  const totalSetores = 2 + totalSetoresDeDados; // 0=FAT, 1=diretório, 2..=dados
  const buf = new Uint8Array(SECTOR + totalSetores * SECTOR);
  const dv = new DataView(buf.buffer);

  // ---- cabeçalho ----
  [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].forEach((b, i) => (buf[i] = b));
  dv.setUint16(30, 9, true); // setor de 2^9 = 512 bytes
  dv.setUint16(32, 6, true); // mini setor (não usado nestes testes)
  dv.setUint32(48, 1, true); // primeiro setor do diretório
  dv.setUint32(56, 0, true); // corte da mini-FAT: 0 força a FAT normal sempre
  dv.setUint32(60, ENDOFCHAIN, true);
  dv.setUint32(64, 0, true);
  dv.setUint32(68, ENDOFCHAIN, true);
  dv.setUint32(72, 0, true);
  dv.setUint32(76, 0, true); // DIFAT[0] = setor 0, o único setor de FAT
  for (let i = 1; i < 109; i++) dv.setUint32(76 + i * 4, FREESECT, true);

  // ---- FAT (setor 0) ----
  const fatBase = deslocamentoDoSetor(0);
  dv.setUint32(fatBase + 0 * 4, 0xfffffffd, true); // setor 0 = FATSECT
  dv.setUint32(fatBase + 1 * 4, ENDOFCHAIN, true); // setor 1 = diretório, sozinho
  let cursor = 2;
  const setorInicial: number[] = [];
  streams.forEach((s, idx) => {
    setorInicial.push(cursor);
    const n = setoresPorStream[idx];
    for (let k = 0; k < n; k++) {
      const setor = cursor + k;
      dv.setUint32(fatBase + setor * 4, k === n - 1 ? ENDOFCHAIN : setor + 1, true);
    }
    cursor += n;
  });
  for (let i = cursor; i < SECTOR / 4; i++) dv.setUint32(fatBase + i * 4, FREESECT, true);

  // ---- diretório (setor 1, até 4 entradas de 128 bytes) ----
  const dirBase = deslocamentoDoSetor(1);
  const escreverEntrada = (slot: number, nome: string, tipo: number, setorInicio: number, tamanho: number) => {
    const off = dirBase + slot * 128;
    const comZero = `${nome}\0`;
    for (let i = 0; i < comZero.length; i++) dv.setUint16(off + i * 2, comZero.charCodeAt(i), true);
    dv.setUint16(off + 64, comZero.length * 2, true);
    buf[off + 66] = tipo;
    dv.setUint32(off + 116, setorInicio, true);
    dv.setUint32(off + 120, tamanho, true);
  };
  escreverEntrada(0, 'Root Entry', 5, ENDOFCHAIN, 0);
  streams.forEach((s, idx) => escreverEntrada(1 + idx, s.name, 2, setorInicial[idx], s.bytes.length));

  // ---- setores de dados ----
  streams.forEach((s, idx) => buf.set(s.bytes, deslocamentoDoSetor(setorInicial[idx])));

  return buf;
}

/** Bytes CP1252 de uma string puramente ASCII, com controles inseridos por charCode. */
const bytesDe = (...partes: (string | number)[]): Uint8Array =>
  Uint8Array.from(
    partes.flatMap((p) => (typeof p === 'number' ? [p] : Array.from(p).map((c) => c.charCodeAt(0))))
  );

/** Um stream `WordDocument` mínimo, só com os campos que os testes de defesa precisam. */
function streamWordMinimo(opts: { nFib?: number; flags?: number }): Uint8Array {
  const buf = new Uint8Array(0x200);
  const dv = new DataView(buf.buffer);
  dv.setUint16(0, 0xa5ec, true);
  dv.setUint16(2, opts.nFib ?? 0x00c1, true);
  dv.setUint16(0x0a, opts.flags ?? 0, true);
  return buf;
}

/** O stream `WordDocument` do caminho antigo (Word 6/95): fcMin/fcMac apontam para o texto corrido. */
function streamWordTextoCorrido(texto: Uint8Array, opts: { nFib?: number; flags?: number } = {}): Uint8Array {
  const TEXT_OFFSET = 0x100;
  // 0x200 é o mínimo que abrirContainerOle exige de qualquer WordDocument,
  // caminho antigo ou moderno — mesmo que o texto corrido seja curto.
  const buf = new Uint8Array(Math.max(TEXT_OFFSET + texto.length, 0x200));
  const dv = new DataView(buf.buffer);
  dv.setUint16(0, 0xa5ec, true);
  dv.setUint16(2, opts.nFib ?? 0x0065, true); // < 0x00c1: caminho do Word 6/95
  dv.setUint16(0x0a, opts.flags ?? 0, true);
  dv.setUint32(0x18, TEXT_OFFSET, true); // fcMin
  dv.setUint32(0x1c, TEXT_OFFSET + texto.length, true); // fcMac
  buf.set(texto, TEXT_OFFSET);
  return buf;
}

/** Deslocamentos do FIB moderno (nFib >= 0x00c1) usados tanto para escrever quanto para conferir a montagem. */
const CSW = 14;
const CSLW = 22;
const POS_CSLW = 0x22 + CSW * 2;
const POS_FIB_RG_LW = POS_CSLW + 2;
const POS_BLOB = POS_FIB_RG_LW + CSLW * 4 + 2;
const TEXT_OFFSET_MODERNO = 0x200;

/** O stream `WordDocument` do caminho moderno: FIB completo, com FC/LCB do PAPX e da piece table. */
function streamWordModerno(opts: {
  texto: Uint8Array;
  plcfBtePapxFc?: number;
  plcfBtePapxLcb?: number;
  clxFc: number;
  clxLcb: number;
  flags?: number;
}): Uint8Array {
  const total = TEXT_OFFSET_MODERNO + opts.texto.length;
  const buf = new Uint8Array(total);
  const dv = new DataView(buf.buffer);
  dv.setUint16(0, 0xa5ec, true);
  dv.setUint16(2, 0x00c1, true);
  dv.setUint16(0x0a, opts.flags ?? 0, true);
  dv.setUint16(0x20, CSW, true);
  dv.setUint16(POS_CSLW, CSLW, true);
  dv.setInt32(POS_FIB_RG_LW + 12, opts.texto.length, true); // ccpText
  const setFcLcb = (indice: number, fc: number, lcb: number) => {
    dv.setUint32(POS_BLOB + indice * 8, fc, true);
    dv.setUint32(POS_BLOB + indice * 8 + 4, lcb, true);
  };
  setFcLcb(13, opts.plcfBtePapxFc ?? 0, opts.plcfBtePapxLcb ?? 4); // lcb=4 => nenhuma entrada de PAPX
  setFcLcb(33, opts.clxFc, opts.clxLcb);
  buf.set(opts.texto, TEXT_OFFSET_MODERNO);
  return buf;
}

/** O stream `0Table` com uma piece table de uma única peça, cobrindo todo o texto comprimido (CP1252). */
function streamTabelaDeUmaPeca(ccpText: number): { bytes: Uint8Array; clxFc: number; clxLcb: number } {
  const n = 1;
  const buf = new Uint8Array(5 + (12 * n + 4));
  const dv = new DataView(buf.buffer);
  buf[0] = 0x02; // clxt = Pcdt
  dv.setUint32(1, 12 * n + 4, true); // lcbPlcPcd
  const base = 5;
  dv.setUint32(base + 0 * 4, 0, true); // cpStart
  dv.setUint32(base + 1 * 4, ccpText, true); // cpEnd
  const fcOff = base + (n + 1) * 4 + 0 * 8 + 2;
  const fcBruto = ((TEXT_OFFSET_MODERNO * 2) | 0x40000000) >>> 0; // comprimido, dobrado, com a marca 0x40000000
  dv.setUint32(fcOff, fcBruto, true);
  return { bytes: buf, clxFc: 0, clxLcb: buf.length };
}

/** Monta um `.doc` completo pelo caminho moderno, a partir só do texto (com as marcas 0x0d/0x13/0x14/0x15 já embutidas). */
function docModerno(texto: Uint8Array): Uint8Array {
  const tabela = streamTabelaDeUmaPeca(texto.length);
  const word = streamWordModerno({ texto, clxFc: tabela.clxFc, clxLcb: tabela.clxLcb });
  return construirCfb([
    { name: 'WordDocument', bytes: word },
    { name: '0Table', bytes: tabela.bytes },
  ]);
}

describe('ehArquivoCfb', () => {
  it('reconhece a assinatura OLE/CFB do Word binário', () => {
    const bytes = new Uint8Array(16);
    [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].forEach((b, i) => (bytes[i] = b));

    expect(ehArquivoCfb(bytes)).toBe(true);
  });

  it('rejeita um arquivo RTF disfarçado de .doc', () => {
    const bytes = bytesDe('{\\rtf1 DECRETO}');

    expect(ehArquivoCfb(bytes)).toBe(false);
  });

  it('rejeita um buffer vazio ou curto demais para conter a assinatura', () => {
    expect(ehArquivoCfb(new Uint8Array(0))).toBe(false);
    expect(ehArquivoCfb(new Uint8Array(8))).toBe(false);
  });
});

describe('extrairTokensDoDoc — Word 6/95 (texto corrido, sem piece table)', () => {
  it('separa os parágrafos pela marca 0x0d e devolve texto e marca de parágrafo', () => {
    const texto = bytesDe('Texto corrido do Word antigo.', 0x0d, 'Segundo paragrafo antigo.');
    const bytes = construirCfb([{ name: 'WordDocument', bytes: streamWordTextoCorrido(texto) }]);

    const tokens = extrairTokensDoDoc(bytes);

    // O último trecho não fecha com 0x0d no arquivo, e por isso não ganha
    // `par` — é a mesma regra que tokensDoTextoCorrido aplica ao Word 6/95.
    expect(tokens).toEqual([
      { type: 'text', val: 'Texto corrido do Word antigo.' },
      { type: 'par' },
      { type: 'text', val: 'Segundo paragrafo antigo.' },
    ]);
  });

  it('descarta controles de posição (< 0x20, exceto tabulação) sem quebrar o parágrafo', () => {
    const texto = bytesDe('Antes', 0x01, 'Depois', 0x09, 'Tab.', 0x0d);
    const bytes = construirCfb([{ name: 'WordDocument', bytes: streamWordTextoCorrido(texto) }]);

    const tokens = extrairTokensDoDoc(bytes);

    expect(tokens).toEqual([{ type: 'text', val: 'AntesDepois\tTab.' }, { type: 'par' }]);
  });

  it('recusa o Word 6/95 com gravação rápida (fast-save), que não sabe remontar', () => {
    const bytes = construirCfb([
      { name: 'WordDocument', bytes: streamWordTextoCorrido(bytesDe('x'), { flags: 0x0004 }) },
    ]);

    expect(() => extrairTokensDoDoc(bytes)).toThrow(/gravação rápida/);
  });
});

describe('extrairTokensDoDoc — Word 97+ (FIB, piece table e PAPX completos)', () => {
  it('lê dois parágrafos pela piece table, na mesma forma de tokens que o RTF produziria', () => {
    const texto = bytesDe('Primeiro paragrafo do ato.', 0x0d, 'Segundo paragrafo, com virgula.', 0x0d);
    const bytes = docModerno(texto);

    const tokens = extrairTokensDoDoc(bytes);

    // `extrairTokensDoDoc` existe para devolver exatamente a forma de token que
    // o classificador de `rtfParser` já entende (`{type:'text',val}` seguido de
    // `{type:'par'}` por parágrafo) — é a paridade que o cabeçalho do módulo
    // documenta, e por isso a montagem manual do CFB compara aqui contra ela,
    // sem duplicar o tokenizador de RTF.
    expect(tokens).toEqual([
      { type: 'text', val: 'Primeiro paragrafo do ato.' },
      { type: 'par' },
      { type: 'text', val: 'Segundo paragrafo, com virgula.' },
      { type: 'par' },
    ]);
  });

  it('esconde a instrução de campo (0x13..0x14) e mantém só o resultado (0x14..0x15)', () => {
    // Hyperlink, remissão, sumário: o Word guarda a instrução do campo e o
    // resultado dele lado a lado, e só o resultado é texto do ato.
    const texto = bytesDe(
      'Antes ',
      0x13,
      'INSTRUCAO OCULTA',
      0x14,
      'RESULTADO VISIVEL',
      0x15,
      ' depois.',
      0x0d
    );
    const bytes = docModerno(texto);

    const tokens = extrairTokensDoDoc(bytes);

    expect(tokens).toEqual([
      { type: 'text', val: 'Antes RESULTADO VISIVEL depois.' },
      { type: 'par' },
    ]);
  });

  it('trata a quebra de linha manual (0x0b) como o \\line do RTF: fecha o parágrafo', () => {
    const texto = bytesDe('Primeira linha', 0x0b, 'Segunda linha', 0x0d);
    const bytes = docModerno(texto);

    const tokens = extrairTokensDoDoc(bytes);

    expect(tokens).toEqual([
      { type: 'text', val: 'Primeira linha' },
      { type: 'par' },
      { type: 'text', val: 'Segunda linha' },
      { type: 'par' },
    ]);
  });

  it('junta texto sem marca de fechamento ao final do arquivo como último parágrafo', () => {
    const texto = bytesDe('Paragrafo fechado.', 0x0d, 'Sobra sem marca de fim');
    const bytes = docModerno(texto);

    const tokens = extrairTokensDoDoc(bytes);

    // Diferente do caminho do Word 6/95 (tokensDoTextoCorrido), aqui todo
    // parágrafo da lista — inclusive o sintético que fecha o texto sem
    // 0x0d/0x07/0x0c — passa por paragrafosParaTokens, que sempre emite `par`
    // depois do texto. É paragrafosParaTokens quem decide isso, não a marca.
    expect(tokens).toEqual([
      { type: 'text', val: 'Paragrafo fechado.' },
      { type: 'par' },
      { type: 'text', val: 'Sobra sem marca de fim' },
      { type: 'par' },
    ]);
  });
});

describe('extrairTokensDoDoc — entradas malformadas', () => {
  it('rejeita um buffer vazio', () => {
    expect(() => extrairTokensDoDoc(new Uint8Array(0))).toThrow();
  });

  it('rejeita bytes que não formam um contêiner OLE (arquivo curto e sem assinatura válida)', () => {
    const lixo = Uint8Array.from({ length: 20 }, (_, i) => (i * 37 + 11) % 256);

    expect(() => extrairTokensDoDoc(lixo)).toThrow();
  });

  it('rejeita um cabeçalho OLE truncado (assinatura correta, resto ausente)', () => {
    const truncado = new Uint8Array(20);
    [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].forEach((b, i) => (truncado[i] = b));

    expect(ehArquivoCfb(truncado)).toBe(true);
    expect(() => extrairTokensDoDoc(truncado)).toThrow();
  });

  it('recusa um contêiner OLE válido sem stream WordDocument', () => {
    const bytes = construirCfb([{ name: 'AlgumOutroStream', bytes: new Uint8Array(10) }]);

    expect(() => extrairTokensDoDoc(bytes)).toThrow(
      /não traz um documento do Word que o editor reconheça/
    );
  });

  it('recusa um stream WordDocument menor que o mínimo esperado (0x200 bytes)', () => {
    const bytes = construirCfb([{ name: 'WordDocument', bytes: new Uint8Array(50) }]);

    expect(() => extrairTokensDoDoc(bytes)).toThrow(
      /não traz um documento do Word que o editor reconheça/
    );
  });

  it('recusa um WordDocument sem a assinatura interna 0xa5ec', () => {
    const semAssinatura = new Uint8Array(0x200); // wIdent = 0x0000
    const bytes = construirCfb([{ name: 'WordDocument', bytes: semAssinatura }]);

    expect(() => extrairTokensDoDoc(bytes)).toThrow(
      /não traz um documento do Word que o editor reconheça/
    );
  });

  it('recusa um .doc protegido por senha', () => {
    const bytes = construirCfb([
      { name: 'WordDocument', bytes: streamWordMinimo({ flags: 0x0100 }) },
    ]);

    expect(() => extrairTokensDoDoc(bytes)).toThrow(/protegido por senha/);
  });
});

describe('parseDocBinarioToLegislativeDocument', () => {
  it('delega em extrairTokensDoDoc + parseTokensToLegislativeDocument, sem divergir', () => {
    const texto = bytesDe('DECRETO N 1', 0x0d, 'Texto do ato.', 0x0d);
    const bytes = docModerno(texto);

    const viaWrapper = parseDocBinarioToLegislativeDocument(bytes);
    const viaPassoAPasso = parseTokensToLegislativeDocument(extrairTokensDoDoc(bytes));

    expect(viaWrapper).toEqual(viaPassoAPasso);
  });
});
