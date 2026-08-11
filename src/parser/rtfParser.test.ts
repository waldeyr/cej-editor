import { describe, it, expect } from 'vitest';
import { parseRtfToLegislativeDocument, decodeRtfToParagraphs } from './rtfParser';
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

  it('deve separar tabelas adjacentes quando o RTF reinicia irow em zero', () => {
    const rtfTable = `{\\rtf1\\trowd\\irow0 \\cellx1000 Primeira\\cell \\row \\trowd\\irow1 \\cellx1000 Dado\\cell \\row b) Segunda tabela:\\par \\trowd\\irow0 \\cellx1000 Segunda\\cell \\row}`;
    const doc = parseRtfToLegislativeDocument(rtfTable);
    const tables = doc.blocks.filter((block) => block.type === 'TABELA');

    expect(tables).toHaveLength(2);
    expect(tables[0].content).toContain('Primeira');
    expect(tables[1].content).toContain('Segunda');
  });
});
