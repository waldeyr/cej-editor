import { describe, expect, it } from 'vitest';
import { htmlToPlainText } from '../utils/docTargets';
import { prepararHtmlDeImportacao } from './docxHtml';
import { deserializePlanaltoHtmlToDocument } from './htmlSerializer';
import { parseRtfToLegislativeDocument } from './rtfParser';

/** Todo o texto que pode ter recebido um marcador durante a importação. */
function textoImportado(html: string): string {
  const doc = deserializePlanaltoHtmlToDocument(prepararHtmlDeImportacao(html).html);
  return [
    doc.epigrafe,
    doc.ementa,
    doc.preambulo,
    doc.ordemExecucao,
    doc.fecho,
    ...doc.assinaturas,
    ...doc.blocks.map((block) => `${block.numberLabel || ''} ${block.content}`),
  ].map(htmlToPlainText).join(' ');
}

function textoImportadoDoRtf(rtf: string): string {
  const doc = parseRtfToLegislativeDocument(rtf);
  return [
    doc.epigrafe,
    doc.ementa,
    doc.preambulo,
    doc.ordemExecucao,
    doc.fecho,
    ...doc.assinaturas,
    ...doc.blocks.flatMap((block) => [block.numberLabel || '', block.rawText, ...(block.tableRows?.flat() || [])]),
  ].join(' ');
}

describe('exploração sintética de importação', () => {
  it('não perde marcadores em 128 RTFs artificiais com controles e estrutura irregular', () => {
    const envolver = [
      (text: string) => text,
      (text: string) => `{\\b ${text}}`,
      (text: string) => `{\\i {\\ul ${text}}}`,
      (text: string) => `\\unknown-42 ${text}`,
      (text: string) => `antes\\line ${text}`,
      (text: string) => `\\u193?${text}`,
      (text: string) => `{\\*\\generator ruido oculto}${text}`,
      (text: string) => `\\trowd\\cellx1000 ${text}\\cell\\cellx2000 outro\\cell\\row`,
    ];

    for (let indice = 0; indice < 128; indice += 1) {
      const marcador = `MARCADOR_RTF_${indice}`;
      const corpo = envolver[indice % envolver.length](marcador);
      // Alterna grupos e fechos extras para cobrir a recuperação do tokenizador
      // diante de arquivos exportados de maneira imperfeita.
      const rtf = `{\\rtf1\\ansi ${indice % 3 === 0 ? '{' : ''}${corpo}${indice % 5 === 0 ? '}' : ''}\\par`;

      expect(textoImportadoDoRtf(rtf), `caso RTF ${indice}`).toContain(marcador);
    }
  });

  it('não perde marcadores em 90 HTMLs artificiais de conversores distintos', () => {
    const envolver = [
      (text: string) => `<p>${text}</p>`,
      (text: string) => `<div>${text}</div>`,
      (text: string) => `<section><div><strong>${text}</strong></div></section>`,
      (text: string) => `<blockquote><em>${text}</em></blockquote>`,
      (text: string) => `<pre>${text}</pre>`,
      (text: string) => `<figure><figcaption>${text}</figcaption></figure>`,
      (text: string) => `<ol><li>${text}</li></ol>`,
      (text: string) => `<table><tr><td>${text}</td><td>valor</td></tr></table>`,
      (text: string) => `<article><div>${text}<br>continuação</div></article>`,
    ];

    for (let indice = 0; indice < 90; indice += 1) {
      const marcador = `MARCADOR_HTML_${indice}`;
      const html = `<!doctype html><html><body>${envolver[indice % envolver.length](marcador)}</body></html>`;

      expect(textoImportado(html), `caso HTML ${indice}`).toContain(marcador);
    }
  });
});
