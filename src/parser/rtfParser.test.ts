import { describe, it, expect } from 'vitest';
import { parseRtfToLegislativeDocument, decodeRtfToParagraphs, identifyBlockType } from './rtfParser';
import { validateLegislativeDocument } from '../validator/legislativeValidator';
import { serializeToPlanaltoHtml } from './htmlSerializer';

describe('RTF Legislative Parser & HTML Serializer', () => {
  it('deve decodificar escapes de caracteres RTF como º, Á, é, ç', () => {
    const rawRtf = `{\\rtf1 DECRETO N\\'ba 13.090, DE 4 DE AGOSTO DE 2026\\par Altera a Legisla\\'e7\\'e3o.}`;
    const paragraphs = decodeRtfToParagraphs(rawRtf);

    expect(paragraphs[0]).toContain('DECRETO Nº 13.090');
    expect(paragraphs[1]).toContain('Legislação');
  });

  it('deve converter RTF em Documento Legislativo AST reconhecendo Epígrafe, Ementa, Artigos e Assinaturas', () => {
    const rtfSample = `{\\rtf1 DECRETO N\\'ba 13.090, DE 4 DE AGOSTO DE 2026\\par Altera o Decreto n\\'ba 11.353.\\par O PRESIDENTE DA REP\\'daBLICA, no uso de suas atribui\\'e7\\'f5es,\\par DECRETA:\\par Art. 1\\'ba Ficam remanejados os cargos.\\par I - do Minist\\'e9rio do Planejamento;\\par a) dois CCE 1.17;\\par Art. 2\\'ba Este Decreto entra em vigor.\\par Bras\\'edlia, 4 de agosto de 2026.\\par LUIZ IN\\'c1CIO LULA DA SILVA}`;

    const doc = parseRtfToLegislativeDocument(rtfSample);

    expect(doc.epigrafe).toContain('DECRETO');
    expect(doc.blocks.length).toBeGreaterThan(0);
    expect(doc.blocks.some((b) => b.type === 'ARTIGO')).toBe(true);
    expect(doc.blocks.some((b) => b.type === 'INCISO')).toBe(true);
    expect(doc.blocks.some((b) => b.type === 'ALINEA')).toBe(true);
  });

  it('deve extrair tabelas RTF (\\trowd \\cell \\row) e convertê-las em blocos de TABELA HTML', () => {
    const rtfTableSample = `{\\rtf1 DECRETO N\\'ba 13.090\\par Disp\\'f5e sobre tabela.\\par O PRESIDENTE DA REP\\'daBLICA\\par DECRETA:\\par Art. 1\\'ba Ficam remanejados os cargos constantes da tabela abaixo:\\par \\trowd \\cell C\\'d3DIGO \\cell QTD \\cell VALOR \\row \\trowd \\cell CCE 1.17 \\cell 2 \\cell 15,98 \\row \\par Bras\\'edlia, 2026.\\par LULA}`;

    const doc = parseRtfToLegislativeDocument(rtfTableSample);
    const tableBlocks = doc.blocks.filter((b) => b.type === 'TABELA');

    expect(tableBlocks.length).toBe(1);
    expect(tableBlocks[0].content).toContain('<table border="1"');
    expect(tableBlocks[0].content).toContain('CCE 1.17');
    expect(tableBlocks[0].tableRows?.length).toBeGreaterThanOrEqual(2);
  });

  it('deve validar um documento sem erros de sequenciamento de artigos', () => {
    const rtfSample = `{\\rtf1 DECRETO N\\'ba 10.000\\par Disp\\'f5e sobre o ato.\\par O PRESIDENTE DA REP\\'daBLICA\\par DECRETA:\\par Art. 1\\'ba Artigo um.\\par Art. 2\\'ba Artigo dois.\\par Bras\\'edlia, 2026.\\par LULA}`;
    const doc = parseRtfToLegislativeDocument(rtfSample);
    const issues = validateLegislativeDocument(doc);

    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors.length).toBe(0);
  });

  it('deve gerar HTML no padrão Planalto contendo o Brasão oficial', () => {
    const rtfSample = `{\\rtf1 DECRETO N\\'ba 13.090, DE 4 DE AGOSTO DE 2026\\par Disp\\'f5e sobre ato.\\par O PRESIDENTE DA REP\\'daBLICA\\par DECRETA:\\par Art. 1\\'ba Texto.}`;
    const doc = parseRtfToLegislativeDocument(rtfSample);
    const html = serializeToPlanaltoHtml(doc);

    expect(html).toContain('https://www.planalto.gov.br/ccivil_03/LEIS/QUADRO/Brastra.gif');
    expect(html).toContain('Presidência da República');
    expect(html).toContain('Casa Civil');
    expect(html).toContain('DECRETO');
  });

  it('deve preservar DECRETA sem negrito quando a formatacao foi limpa', () => {
    const rtfSample = `{\\rtf1 DECRETO N\\'ba 13.090\\par DECRETA:}`;
    const doc = parseRtfToLegislativeDocument(rtfSample);
    doc.ordemExecucao = '<span data-cej-plain-format="true">DECRETA:</span>';

    const html = serializeToPlanaltoHtml(doc);

    expect(html).toContain('>DECRETA:</span>');
    expect(html).not.toContain('<b><span style="font-size:10.0pt;font-family:&quot;Arial&quot;,sans-serif">DECRETA:');
  });

  it('deve importar tabelas RTF com células mescladas (\\clmgf e \\clmrg) gerando colspan no HTML', () => {
    const rtfMergedTable = `{\\rtf1 DECRETO N\\'ba 1.000\\par DECRETA:\\par \\trowd \\clmgf \\cell T\\'edtulo Mesclado \\clmrg \\cell \\row \\trowd \\cell Dado 1 \\cell Dado 2 \\row}`;
    const doc = parseRtfToLegislativeDocument(rtfMergedTable);
    const tableBlock = doc.blocks.find((b) => b.type === 'TABELA');

    expect(tableBlock).toBeDefined();
    expect(tableBlock?.content).toContain('colspan="2"');
    expect(tableBlock?.content).toContain('Título Mesclado');
  });

  it('deve preservar mesclagens horizontal e vertical definidas por \\cellx', () => {
    const rtfMergedTable = `{\\rtf1\\trowd \\clvmgf\\clmgf\\cellx1000 \\clvmgf\\clmrg\\cellx2000 \\cellx3000 Grupo\\cell \\cell Valor\\cell \\row \\trowd \\clvmrg\\cellx1000 \\clvmrg\\cellx2000 \\cellx3000 \\cell \\cell 10\\cell \\row}`;
    const doc = parseRtfToLegislativeDocument(rtfMergedTable);
    const tableBlock = doc.blocks.find((b) => b.type === 'TABELA');

    expect(tableBlock?.content).toContain('colspan="2"');
    expect(tableBlock?.content).toContain('rowspan="2"');
    expect(tableBlock?.content).toContain('>Grupo</th>');
    expect(tableBlock?.content).not.toContain('rowspan="3"');
  });

  it('deve calcular colspan pelas fronteiras cellx quando o cabecalho superior nao usa clmrg', () => {
    const rtfTable = `{\\rtf1\\trowd \\clvmgf\\cellx1000 \\clvmgf\\cellx2000 \\cellx4000 Codigo\\cell Unitario\\cell Do MPO para a SEGES /MGI\\cell \\row \\trowd \\clvmrg\\cellx1000 \\clvmrg\\cellx2000 \\cellx3000 \\cellx4000 \\cell \\cell Qtd.\\cell Valor Total\\cell \\row}`;
    const doc = parseRtfToLegislativeDocument(rtfTable);
    const tableBlock = doc.blocks.find((b) => b.type === 'TABELA');

    expect(tableBlock?.content).toContain('>Do MPO para a SEGES /MGI</th>');
    expect(tableBlock?.content).toContain('colspan="2"');
  });

  it('não parte a palavra quando o arquivo RTF quebra a linha no meio dela', () => {
    // O escritor de RTF quebra a linha onde couber: o arquivo do decreto de
    // docs/file-tests traz "AVALIA\'c7\'c3" no fim de uma linha e "O" no começo
    // da seguinte, e a folha mostrava "AVALIAÇÃ O".
    const rtfQuebrado = `{\\rtf1 DECRETO N\\'ba 13.090\\par Disp\\'f5e sobre o ato.\\par O PRESIDENTE DA REP\\'daBLICA\\par DECRETA:\\par Art. 1\\'ba Fica criada a Subsecretaria de AVALIA\\'c7\\'c3\nO DE POL\\'cd\nTICAS P\\'da\nBLICAS.}`;

    const doc = parseRtfToLegislativeDocument(rtfQuebrado);
    const artigo = doc.blocks.find((b) => b.type === 'ARTIGO');

    expect(artigo?.content).toBe('Fica criada a Subsecretaria de AVALIAÇÃO DE POLÍTICAS PÚBLICAS.');
  });

  it('preserva o espaço de verdade que vem ao lado da quebra de linha', () => {
    const rtfQuebrado = `{\\rtf1 DECRETO N\\'ba 13.090\\par Disp\\'f5e sobre o ato.\\par O PRESIDENTE DA REP\\'daBLICA\\par DECRETA:\\par Art. 1\\'ba Compete ao Ministro de \nEstado dirigir o \\'f3rg\\'e3o.}`;

    const doc = parseRtfToLegislativeDocument(rtfQuebrado);
    const artigo = doc.blocks.find((b) => b.type === 'ARTIGO');

    expect(artigo?.content).toContain('Ministro de Estado');
  });

  it('deve separar tabelas adjacentes quando o RTF reinicia irow em zero', () => {
    const rtfTable = `{\\rtf1\\trowd\\irow0 \\cellx1000 Primeira\\cell \\row \\trowd\\irow1 \\cellx1000 Dado\\cell \\row b) Segunda tabela:\\par \\trowd\\irow0 \\cellx1000 Segunda\\cell \\row}`;
    const doc = parseRtfToLegislativeDocument(rtfTable);
    const tables = doc.blocks.filter((block) => block.type === 'TABELA');

    expect(tables).toHaveLength(2);
    expect(tables[0].content).toContain('Primeira');
    expect(tables[1].content).toContain('Segunda');
  });

  it('guarda o título que anuncia a tabela, e o guarda depois da tabela anterior', () => {
    // O parágrafo entre duas tabelas é o título da segunda. Ele não estava em
    // lugar nenhum do ato: caía fora da máquina de estados, que depois do fecho
    // não tinha para onde mandar um parágrafo.
    const rtfTable = `{\\rtf1\\trowd\\irow0 \\cellx1000 Primeira\\cell \\row b) Segunda tabela:\\par \\trowd\\irow0 \\cellx1000 Segunda\\cell \\row}`;
    const doc = parseRtfToLegislativeDocument(rtfTable);
    const tipos = doc.blocks.map((block) => block.type);
    const titulo = doc.blocks.findIndex((block) => block.rawText.includes('Segunda tabela'));

    expect(titulo).toBeGreaterThan(-1);
    expect(tipos.indexOf('TABELA')).toBeLessThan(titulo);
    expect(tipos.lastIndexOf('TABELA')).toBeGreaterThan(titulo);
  });

  it('preenche a célula cujo conteúdo o Word escreve antes do \\trowd da linha', () => {
    // O Word emite o conteúdo de uma linha antes da definição dela. Quem se
    // guiava pela linha aberta tomava esse trecho por texto solto e gravava a
    // primeira célula vazia — 229 células no decreto de docs/file-tests.
    const rtfTable = `{\\rtf1\\trowd\\irow0 \\cellx1000\\cellx2000 \\row \\pard\\intbl CCE 1.15\\cell 5,81\\cell \\trowd\\irow1 \\cellx1000\\cellx2000 \\row}`;
    const doc = parseRtfToLegislativeDocument(rtfTable);
    const tabela = doc.blocks.find((block) => block.type === 'TABELA');

    expect(tabela?.tableRows?.some((linha) => linha.includes('CCE 1.15'))).toBe(true);
  });

  it('não deixa o parâmetro da palavra de controle virar texto do ato', () => {
    // `\\trleft-70` é definição de linha, não conteúdo: lido como `\\trleft`
    // seguido de texto, o "-70" entrava grudado no começo de cada célula.
    const rtfTable = `{\\rtf1\\trowd\\irow0\\trleft-70 \\cellx1000 \\pard\\intbl C\\'d3DIGO\\cell \\row}`;
    const doc = parseRtfToLegislativeDocument(rtfTable);

    expect(doc.blocks[0].content).toContain('CÓDIGO');
    expect(doc.blocks[0].content).not.toContain('-70');
  });

  it('escreve o travessão que o RTF guarda como palavra de controle', () => {
    // O espaço logo depois da palavra de controle é delimitador dela, e não
    // conteúdo — por isso o arquivo escreve dois quando quer um.
    const rtf = `{\\rtf1 DECRETO N\\'ba 13.090\\par Disp\\'f5e sobre o ato.\\par O PRESIDENTE DA REP\\'daBLICA\\par DECRETA:\\par Art. 1\\'ba Cargos Executivos \\endash  CCE.}`;
    const doc = parseRtfToLegislativeDocument(rtf);

    expect(doc.blocks[0].content).toBe('Cargos Executivos – CCE.');
  });

  it('acolhe o anexo, que vem depois das assinaturas', () => {
    const rtf = `{\\rtf1 DECRETO N\\'ba 13.090\\par Disp\\'f5e sobre o ato.\\par O PRESIDENTE DA REP\\'daBLICA\\par DECRETA:\\par Art. 1\\'ba Ficam remanejados os cargos.\\par Bras\\'edlia, 4 de agosto de 2026.\\par ##APR LUIZ IN\\'c1CIO LULA DA SILVA\\par ##AMI Esther Dweck\\par ##ANE ANEXO I\\par REMANEJAMENTO DE CARGOS COMISSIONADOS\\par}`;
    const doc = parseRtfToLegislativeDocument(rtf);

    expect(doc.assinaturas).toEqual(['LUIZ INÁCIO LULA DA SILVA', 'Esther Dweck']);
    expect(doc.blocks.map((block) => block.type)).toContain('ANEXO');
    // Título e denominação são parágrafos distintos: um não se cola no outro.
    expect(doc.blocks.at(-1)?.rawText).toBe('REMANEJAMENTO DE CARGOS COMISSIONADOS');
  });

  it('devolve o "(NR)" como marca do dispositivo, e não como texto dele', () => {
    // Antes ele era simplesmente apagado: `sanitizeQuoteText` o tirava do texto
    // e nada o repunha, de modo que o ato salvo perdia a marca da nova redação.
    const rtf = `{\\rtf1 DECRETO N\\'ba 13.090\\par Altera o Decreto n\\'ba 11.353.\\par O PRESIDENTE DA REP\\'daBLICA\\par DECRETA:\\par Art. 1\\'ba O Decreto passa a vigorar com a seguinte altera\\'e7\\'e3o:\\par \\'93Art. 5\\'ba Compete ao \\'f3rg\\'e3o dirigir.\\'94 (NR)}`;
    const doc = parseRtfToLegislativeDocument(rtf);
    const alteracao = doc.blocks.find((block) => block.type === 'ALTERACAO');

    expect(alteracao?.novaRedacao).toBe(true);
    expect(alteracao?.content).not.toContain('NR');
    expect(alteracao?.numberLabel).toBe('Art. 5º');
  });

  it('lê nas aspas onde a citação do ato alterado abre e onde ela fecha', () => {
    expect(identifyBlockType('“Art. 2º ..................').aspas).toBe('abre');
    expect(identifyBlockType('XII - representar o Ministro.” (NR)').aspas).toBe('fecha');
    // O fechamento sem "(NR)" é o da inclusão de dispositivo novo, que não muda
    // redação alguma e por isso não leva a marca (LC 95/1998, art. 12, III).
    expect(identifyBlockType('XII - representar o Ministro.”').aspas).toBe('fecha');
    expect(identifyBlockType('“Art. 5º Compete ao órgão dirigir.” (NR)').aspas).toBe('unica');
    expect(identifyBlockType('Art. 1º Este Decreto entra em vigor.').aspas).toBeUndefined();
  });

  it('não toma por fim da citação a aspa da palavra citada dentro dela', () => {
    /*
     * "a) as alíneas “d” e “e” do inciso I" — as aspas estão emparelhadas, e
     * nenhuma delas fecha citação. Lê-las como fechamento faria a alteração
     * seguinte inteira voltar à margem do ato alterador.
     */
    expect(identifyBlockType('a) as alíneas “d” e “e” do inciso I;').aspas).toBeUndefined();
    expect(identifyBlockType('b) a alínea “a” do inciso III do art. 2º').aspas).toBeUndefined();
    // A que sobra sem par, essa fecha.
    expect(identifyBlockType('as alíneas “d” e “e” do inciso I do art. 2º.”').aspas).toBe('fecha');
  });

  it('marca a citação inteira, e não só as linhas que trazem as aspas', () => {
    const rtf = `{\\rtf1 DECRETO N\\'ba 13.090\\par Altera o Decreto n\\'ba 11.353.\\par O PRESIDENTE DA REP\\'daBLICA\\par DECRETA:\\par Art. 1\\'ba O Decreto passa a vigorar com as seguintes altera\\'e7\\'f5es:\\par \\'93Art. 5\\'ba ....................\\par I - dirigir o \\'f3rg\\'e3o;\\par II - representar o Ministro.\\'94 (NR)\\par Art. 2\\'ba Este Decreto entra em vigor na data de sua publica\\'e7\\'e3o.}`;
    const doc = parseRtfToLegislativeDocument(rtf);

    expect(doc.blocks.map((block) => [block.type, block.citacao])).toEqual([
      ['ARTIGO', undefined],
      ['ALTERACAO', 'abre'],
      ['INCISO', 'meio'],
      ['ALTERACAO', 'fecha'],
      ['ARTIGO', undefined],
    ]);
  });

  it('guarda como marca o parágrafo que só traz o fim da citação', () => {
    /*
     * `” (NR)` sozinho num parágrafo é como o decreto de docs/file-tests fecha a
     * citação de um anexo inteiro. As duas marcas moram fora do texto
     * (invariante 9), e é elas que dão fim à citação: sem isso o anexo citado
     * ficava sem fechamento e voltava à margem do ato alterador.
     */
    const rtf = `{\\rtf1 DECRETO N\\'ba 13.090\\par Altera o Decreto.\\par O PRESIDENTE DA REP\\'daBLICA\\par DECRETA:\\par Art. 1\\'ba O Anexo passa a vigorar na forma do Anexo I.\\par Bras\\'edlia, 4 de agosto de 2026.\\par LUIZ IN\\'c1CIO LULA DA SILVA\\par ANEXO I\\par \\'93QUADRO DE CARGOS\\par \\'94 (NR)}`;
    const doc = parseRtfToLegislativeDocument(rtf);
    const fim = doc.blocks.at(-1);

    expect(fim?.citacao).toBe('fecha');
    expect(fim?.novaRedacao).toBe(true);
    expect(fim?.content).toBe('');
  });

  it('mantém o sufixo do dispositivo acrescentado por alteração no rótulo', () => {
    // Decreto nº 12.002/2024, art. 14, parágrafo único. Sem isto o rótulo saía
    // "Art. 35" e o "-B-B" ia parar dentro do texto do dispositivo.
    expect(identifyBlockType('Art. 35-B-B Fica criado o cargo.')).toMatchObject({
      type: 'ARTIGO',
      numberLabel: 'Art. 35-B-B',
      cleanText: 'Fica criado o cargo.',
    });
    expect(identifyBlockType('X-A - Inspetor Federal do Mercado de Capitais;')).toMatchObject({
      type: 'INCISO',
      numberLabel: 'X-A -',
      cleanText: 'Inspetor Federal do Mercado de Capitais;',
    });
  });

  it('só toma por título de anexo o que abre um anexo, e não a remissão a anexo alheio', () => {
    expect(identifyBlockType('ANEXO I').type).toBe('ANEXO');
    expect(identifyBlockType('ANEXOS').type).toBe('ANEXO');
    expect(identifyBlockType('ANEXO I - REMANEJAMENTO DE CARGOS').type).toBe('ANEXO');
    // A forma do ato que tem um anexo só, e a do anexo designado por letra.
    expect(identifyBlockType('ANEXO ÚNICO').type).toBe('ANEXO');
    expect(identifyBlockType('ANEXO A').type).toBe('ANEXO');
    // "ANEXO I -" com a denominação na linha de baixo continua sendo título.
    expect(identifyBlockType('ANEXO I -').type).toBe('ANEXO');

    expect(identifyBlockType('Anexos I, III-A e V à Lei nº 10.483, de 3 de julho').type).not.toBe('ANEXO');
    expect(identifyBlockType('Anexo III-A. A partir de 1º de janeiro de 2025').type).not.toBe('ANEXO');
  });

  it('reconhece o fecho do ato assinado no primeiro dia do mês', () => {
    const rtf = `{\\rtf1 DECRETO N\\'ba 13.090\\par Disp\\'f5e sobre o ato.\\par O PRESIDENTE DA REP\\'daBLICA\\par DECRETA:\\par Art. 1\\'ba Texto.\\par Bras\\'edlia, 1\\'ba de agosto de 2026.\\par LUIZ IN\\'c1CIO LULA DA SILVA}`;
    const doc = parseRtfToLegislativeDocument(rtf);

    expect(doc.fecho).toContain('Brasília, 1º de agosto de 2026');
    expect(doc.assinaturas).toEqual(['LUIZ INÁCIO LULA DA SILVA']);
  });

  it('deixa em branco a parte que o arquivo não traz, em vez de inventar um ato', () => {
    /*
     * Quem importa o que não é ato — uma exposição de motivos, um fragmento —
     * recebia na folha um decreto completo de mentira: número, data, fecho e
     * "LUIZ INÁCIO LULA DA SILVA" como signatário, vindos de valores de reserva
     * que ninguém escreveu, e podia salvá-lo assim.
     */
    const rtf = `{\\rtf1 Senhor Presidente da Rep\\'fablica,\\par Submeto \\'e0 sua aprecia\\'e7\\'e3o a proposta anexa.}`;
    const doc = parseRtfToLegislativeDocument(rtf);

    expect(doc.epigrafe).toBe('');
    expect(doc.ementa).toBe('');
    expect(doc.fecho).toBe('');
    expect(doc.assinaturas).toEqual([]);
    // O texto do arquivo continua chegando inteiro: o que sai é a invenção.
    expect(doc.blocks.map((b) => b.rawText).join(' ')).toContain('Submeto à sua apreciação');
  });

  it('não toma por omissis o formulário em branco, que também é pontilhado', () => {
    // Decreto nº 12.002/2024, art. 14, VIII: a linha pontilhada indica texto
    // suprimido. Onde há texto entre os pontos, o texto é do ato — e o omissis,
    // que se normaliza para a linha canônica, o apagaria.
    expect(identifyBlockType('..........................................').type).toBe('OMISSIS');
    expect(identifyBlockType('........$..........').type).not.toBe('OMISSIS');
    expect(identifyBlockType('........$..........').cleanText).toBe('........$..........');

    const dataEmBranco = '..... (nome da localidade) ....... de .... de 192 .....';
    expect(identifyBlockType(dataEmBranco).type).not.toBe('OMISSIS');
    expect(identifyBlockType(dataEmBranco).cleanText).toBe(dataEmBranco);
  });

  it('escreve os sinais que o Windows-1252 guarda entre 0x80 e 0x9F', () => {
    // Fora dessa faixa CP1252 e Latin-1 coincidem; dentro dela, não — e o
    // código cru saía da importação como caractere de controle invisível.
    const rtf = `{\\rtf1 DECRETO N\\'ba 13.090\\par Disp\\'f5e sobre o marcador \\'95, as retic\\'eancias\\'85 e a aspa\\'92.\\par O PRESIDENTE DA REP\\'daBLICA\\par DECRETA:\\par Art. 1\\'ba Texto.}`;
    const doc = parseRtfToLegislativeDocument(rtf);

    expect(doc.ementa).toBe('Dispõe sobre o marcador •, as reticências… e a aspa’.');
  });
});
