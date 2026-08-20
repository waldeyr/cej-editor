import { describe, it, expect } from 'vitest';
import { LegislativeBlock, LegislativeDocument } from '../types/legislative';
import { validateLegislativeDocument } from './legislativeValidator';

const artigo = (id: string, numberLabel: string, tachado = false): LegislativeBlock => ({
  id,
  type: 'ARTIGO',
  numberLabel,
  content: 'Texto.',
  rawText: 'Texto.',
  ...(tachado ? { identificadorTachado: true } : {}),
});

const doc = (blocks: LegislativeBlock[]): LegislativeDocument => ({
  title: 'DECRETO Nº 1, DE 1 DE JANEIRO DE 2026',
  epigrafe: 'DECRETO Nº 1, DE 1 DE JANEIRO DE 2026',
  ementa: 'Dispõe sobre alguma coisa.',
  preambulo: 'O PRESIDENTE DA REPÚBLICA...',
  ordemExecucao: 'DECRETA:',
  blocks,
  fecho: '',
  assinaturas: [],
});

describe('validação de sequência de artigos', () => {
  it('acusa o artigo cujo número não bate com a posição', () => {
    const issues = validateLegislativeDocument(
      doc([artigo('a1', 'Art. 1º'), artigo('a2', 'Art. 3º')])
    );
    expect(issues.some((i) => i.id === 'art-seq-a2')).toBe(true);
  });

  it('não acusa a sequência certa', () => {
    const issues = validateLegislativeDocument(
      doc([artigo('a1', 'Art. 1º'), artigo('a2', 'Art. 2º')])
    );
    expect(issues.some((i) => i.id.startsWith('art-seq-'))).toBe(false);
  });

  it('não conta nem acusa o artigo tachado — revogado, mora ali só pelo histórico', () => {
    const issues = validateLegislativeDocument(
      doc([artigo('a1', 'Art. 1º'), artigo('a2', 'Art. 7º', true), artigo('a3', 'Art. 2º')])
    );
    expect(issues.some((i) => i.id.startsWith('art-seq-'))).toBe(false);
  });
});
