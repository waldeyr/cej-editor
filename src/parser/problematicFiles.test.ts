import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { htmlToPlainText } from '../utils/docTargets';
import { prepararHtmlDeImportacao } from './docxHtml';
import { deserializePlanaltoHtmlToDocument } from './htmlSerializer';
import { parseRtfToLegislativeDocument } from './rtfParser';

const problematico = (name: string) =>
  readFileSync(resolve(__dirname, '../../docs/file-tests/problematicos', name), 'utf-8');

function textoDoDocumento(doc: ReturnType<typeof deserializePlanaltoHtmlToDocument>): string {
  return [
    doc.epigrafe,
    doc.ementa,
    doc.preambulo,
    doc.ordemExecucao,
    doc.fecho,
    ...doc.assinaturas,
    ...doc.blocks.flatMap((block) => [block.numberLabel || '', block.content, ...(block.tableRows?.flat() || [])]),
  ].map(htmlToPlainText).join(' ');
}

describe('arquivos problemáticos de importação', () => {
  it('recupera o conteúdo útil de RTF truncado e não promove cabeçalho a ato', () => {
    const doc = parseRtfToLegislativeDocument(problematico('rtf-truncado-e-com-controles.rtf'));
    const texto = textoDoDocumento(doc);

    expect(texto).toContain('MARCADOR_RTF_TRUNCADO');
    expect(texto).toContain('CÉLULA_MARCADA');
    expect(texto).toContain('FINAL_RTF_TRUNCADO');
    expect(texto).not.toContain('CABECALHO NAO E PARTE DO ATO');
  });

  it('retém HTML malformado e remove conteúdo de revisão ou executável', () => {
    const preparo = prepararHtmlDeImportacao(problematico('html-malformado-e-hostil.html'));
    const texto = textoDoDocumento(deserializePlanaltoHtmlToDocument(preparo.html));

    expect(texto).toContain('MARCADOR_HTML_MALFORMADO');
    expect(texto).toContain('CÉLULA_HTML_MARCADA');
    expect(texto).toContain('GLOSSARIO_DEVE_SOBREVIVER');
    expect(texto).toContain('FINAL_HTML_MALFORMADO');
    expect(texto).not.toContain('COMENTARIO_DE_REVISAO_NAO_E_ATO');
    expect(texto).not.toContain('CONTEUDO_EXECUTAVEL_NAO_E_ATO');
    expect(preparo.comentariosDescartados).toBe(1);
  });
});
