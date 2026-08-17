import { describe, expect, it } from 'vitest';
import { prepararHtmlDeImportacao } from './docxHtml';
import { deserializePlanaltoHtmlToDocument } from './htmlSerializer';

describe('adaptador de HTML de importação', () => {
  it('preserva blocos semânticos que outro conversor escreve fora de parágrafos', () => {
    const preparado = prepararHtmlDeImportacao(`
      <div><strong>Art. 1º</strong> Fica criado o programa.</div>
      <blockquote>II - A execução observará o regulamento.</blockquote>
      <figure><figcaption>ANEXO I</figcaption></figure>
      <table><tr><td>Código</td><td>Valor</td></tr></table>
    `);
    const doc = deserializePlanaltoHtmlToDocument(preparado.html);

    expect(doc.blocks.map((block) => `${block.numberLabel || ''} ${block.rawText}`)).toEqual(
      expect.arrayContaining([
        'Art. 1º Fica criado o programa.',
        'II - A execução observará o regulamento.',
        ' ANEXO I',
      ])
    );
    expect(doc.blocks.filter((block) => block.type === 'TABELA')).toHaveLength(1);
  });
});
