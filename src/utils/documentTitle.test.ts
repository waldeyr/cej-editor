import { describe, it, expect } from 'vitest';
import { LegislativeDocument } from '../types/legislative';
import { applyHtmlToTarget, partTarget } from './docTargets';
import {
  deserializePlanaltoHtmlToDocument,
  serializeToPlanaltoHtml,
} from '../parser/htmlSerializer';

const doc = (partial: Partial<LegislativeDocument> = {}): LegislativeDocument => ({
  title: 'DECRETO Nº 13.090',
  epigrafe: 'DECRETO Nº 13.090',
  ementa: '',
  preambulo: '',
  ordemExecucao: 'DECRETA:',
  blocks: [],
  fecho: '',
  assinaturas: [],
  ...partial,
});

describe('título do documento', () => {
  it('segue a epígrafe enquanto ninguém o define', () => {
    const next = applyHtmlToTarget(doc(), partTarget('epigrafe'), 'DECRETO Nº 13.091, DE 5 DE AGOSTO');
    expect(next.title).toBe('DECRETO Nº 13.091, DE 5 DE AGOSTO');
  });

  /*
   * A razão de existir da marca: sem ela, a primeira correção na epígrafe
   * apagaria em silêncio o título que o usuário escreveu.
   */
  it('resiste a correções na epígrafe depois de definido à mão', () => {
    const manual = doc({ title: 'Decreto do remanejamento de cargos', titleIsManual: true });
    const next = applyHtmlToTarget(manual, partTarget('epigrafe'), 'DECRETO Nº 13.091');

    expect(next.epigrafe).toBe('DECRETO Nº 13.091');
    expect(next.title).toBe('Decreto do remanejamento de cargos');
  });

  it('vai para o <title> do arquivo salvo', () => {
    const html = serializeToPlanaltoHtml(doc({ title: 'Decreto do remanejamento', titleIsManual: true }));
    expect(html).toContain('<title>Decreto do remanejamento</title>');
  });
});

describe('título de um arquivo aberto', () => {
  const arquivo = (title: string, epigrafe: string) =>
    serializeToPlanaltoHtml(doc({ title, epigrafe }));

  it('é tratado como manual quando não repete a epígrafe', () => {
    const reaberto = deserializePlanaltoHtmlToDocument(
      arquivo('Decreto do remanejamento', 'DECRETO Nº 13.090')
    );
    expect(reaberto.titleIsManual).toBe(true);
  });

  it('volta a seguir a epígrafe quando é igual a ela', () => {
    const reaberto = deserializePlanaltoHtmlToDocument(
      arquivo('DECRETO Nº 13.090', 'DECRETO Nº 13.090')
    );
    expect(reaberto.titleIsManual).toBe(false);
  });
});
