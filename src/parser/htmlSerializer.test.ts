import { describe, it, expect } from 'vitest';
import { LegislativeDocument } from '../types/legislative';
import { serializeToPlanaltoHtml } from './htmlSerializer';

const doc: LegislativeDocument = {
  title: 'DECRETO Nº 13.090',
  epigrafe: 'DECRETO Nº 13.090',
  ementa: 'Altera o Decreto nº 11.353.',
  preambulo: '<b>O PRESIDENTE DA REPÚBLICA</b>, no uso da atribuição que lhe confere o art. 84, da Constituição,',
  ordemExecucao: '<b>DECRETA</b>:',
  blocks: [],
  fecho: 'Brasília, 4 de agosto de 2026.',
  assinaturas: [],
};

/** O parágrafo da ordem de execução no HTML exportado. */
const ordemExecucaoParagraph = (html: string): string => {
  const paragraphs = html.match(/<p class="Textbody0"[\s\S]*?<\/p>/g) || [];
  return paragraphs.find((p) => p.includes('DECRETA')) || '';
};

describe('ordem de execução', () => {
  /*
   * A ordem de execução fecha a frase aberta pelo preâmbulo e acompanha o
   * parágrafo que a antecede — é o que faz o ato de referência em
   * temp/d13090.html, e o que o editor mostra na folha.
   */
  it('sai justificada e recuada como o preâmbulo, e não centralizada', () => {
    const paragraph = ordemExecucaoParagraph(serializeToPlanaltoHtml(doc));

    expect(paragraph).toContain('text-align: justify');
    expect(paragraph).toContain('text-indent: 38px');
    expect(paragraph).not.toContain('text-align: center');
  });

  it('cede à escolha do usuário na barra de comandos', () => {
    const centered = { ...doc, partAligns: { 'part:ordemExecucao': 'center' as const } };
    const paragraph = ordemExecucaoParagraph(serializeToPlanaltoHtml(centered));

    expect(paragraph).toContain('text-align: center');
    expect(paragraph).toContain('text-indent: 0');
  });
});
