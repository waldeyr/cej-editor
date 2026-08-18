import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { htmlToPlainText } from '../utils/docTargets';
import { prepararHtmlDeImportacao } from './docxHtml';
import { deserializePlanaltoHtmlToDocument, serializeToPlanaltoHtml } from './htmlSerializer';
import { parseRtfToLegislativeDocument } from './rtfParser';

const __dirname = dirname(fileURLToPath(import.meta.url));

const fixture = (name: string) => readFileSync(resolve(__dirname, '../../docs/file-tests/problematicos', name), 'utf-8');

function textoDoDocumento(doc: ReturnType<typeof deserializePlanaltoHtmlToDocument>): string {
  return [doc.epigrafe, doc.ementa, doc.preambulo, doc.ordemExecucao, doc.fecho, ...doc.assinaturas,
    ...doc.blocks.map((block) => `${block.numberLabel || ''} ${block.content}`)].map(htmlToPlainText).join(' ');
}

describe('ida e volta da importação', () => {
  it.each([
    ['HTML malformado', () => deserializePlanaltoHtmlToDocument(prepararHtmlDeImportacao(fixture('html-malformado-e-hostil.html')).html),
      ['MARCADOR_HTML_MALFORMADO', 'CÉLULA_HTML_MARCADA', 'GLOSSARIO_DEVE_SOBREVIVER']],
    ['RTF truncado', () => parseRtfToLegislativeDocument(fixture('rtf-truncado-e-com-controles.rtf')),
      ['MARCADOR_RTF_TRUNCADO', 'CÉLULA_MARCADA', 'FINAL_RTF_TRUNCADO']],
  ])('%s preserva os marcadores após exportar e abrir novamente', (_name, importar, marcadores) => {
    const reaberto = deserializePlanaltoHtmlToDocument(serializeToPlanaltoHtml(importar()));
    const texto = textoDoDocumento(reaberto);
    for (const marcador of marcadores) expect(texto).toContain(marcador);
  });
});
