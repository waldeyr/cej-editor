import { describe, expect, it } from 'vitest';
import { LegislativeDocument } from '../types/legislative';
import { diagnosticarImportacao, erroDeTamanhoDeImportacao, MAX_IMPORT_BYTES } from './importDiagnostics';

const vazio: LegislativeDocument = {
  title: 'Teste', epigrafe: '', ementa: '', preambulo: '', ordemExecucao: '', blocks: [], fecho: '', assinaturas: [],
};

describe('proteções da importação', () => {
  it('recusa arquivo maior que o limite antes de tentar convertê-lo', () => {
    expect(erroDeTamanhoDeImportacao(MAX_IMPORT_BYTES)).toBeNull();
    expect(erroDeTamanhoDeImportacao(MAX_IMPORT_BYTES + 1)).toMatch(/mais de 25 MB/);
  });

  it('aponta conteúdo vazio, blocos não classificados e tabelas vazias', () => {
    expect(diagnosticarImportacao(vazio)).toEqual(['nenhum texto reconhecido']);
    const doc: LegislativeDocument = {
      ...vazio,
      epigrafe: 'DECRETO DE TESTE',
      blocks: [
        ...Array.from({ length: 5 }, (_, index) => ({
          id: `b${index}`, type: 'TEXTO_LIVRE' as const, content: `Texto ${index}`, rawText: `Texto ${index}`,
        })),
        { id: 't', type: 'TABELA', content: '<table><tr><td></td></tr></table>', rawText: 'Tabela' },
      ],
    };
    expect(diagnosticarImportacao(doc)).toEqual([
      '5 de 6 blocos ficaram sem classificação',
      '1 tabela sem célula legível',
    ]);
  });
});
