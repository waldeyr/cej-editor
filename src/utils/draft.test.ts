import { describe, it, expect, vi } from 'vitest';
import { LegislativeDocument } from '../types/legislative';
import { DRAFT_STORAGE_KEY, DraftStorage, clearDraft, readDraft, writeDraft } from './draft';

/** Armazenamento de mentira: o teste roda sem navegador, e portanto sem localStorage. */
const fakeStorage = (initial: Record<string, string> = {}): DraftStorage => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
};

const ato: LegislativeDocument = {
  title: 'DECRETO Nº 1',
  epigrafe: 'DECRETO Nº 1, DE 1º DE JANEIRO DE 2026',
  ementa: 'Dispõe sobre ato normativo.',
  preambulo: '<b>O PRESIDENTE DA REPÚBLICA</b>,',
  ordemExecucao: '<b>DECRETA</b>:',
  blocks: [
    { id: 'block-1', type: 'ARTIGO', numberLabel: 'Art. 1º', content: 'Texto.', rawText: 'Texto.' },
  ],
  fecho: 'Brasília, 1º de janeiro de 2026.',
  assinaturas: ['FULANO DE TAL'],
  encoding: 'windows-1252',
  declaredEncoding: 'ISO-8859-1',
};

describe('rascunho da sessão anterior', () => {
  it('não encontra rascunho no primeiro uso do editor', () => {
    expect(readDraft(fakeStorage())).toBeNull();
  });

  it('devolve o ato guardado pela sessão anterior', () => {
    const storage = fakeStorage();
    writeDraft(ato, storage);

    expect(readDraft(storage)).toEqual(ato);
  });

  it('esquece o rascunho quando ele é descartado', () => {
    const storage = fakeStorage();
    writeDraft(ato, storage);
    clearDraft(storage);

    expect(readDraft(storage)).toBeNull();
  });

  /*
   * O que está guardado veio de outra versão do editor, ou de alguém mexendo no
   * armazenamento do navegador. Abrir no exemplo é o pior que pode acontecer;
   * uma exceção aqui deixaria o editor sem folha nenhuma para desenhar.
   */
  it('abre no exemplo quando o rascunho está corrompido', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(readDraft(fakeStorage({ [DRAFT_STORAGE_KEY]: '{ isto não é json' }))).toBeNull();

    warn.mockRestore();
  });

  it('recusa o que está guardado mas não é um ato', () => {
    expect(readDraft(fakeStorage({ [DRAFT_STORAGE_KEY]: 'null' }))).toBeNull();
    expect(readDraft(fakeStorage({ [DRAFT_STORAGE_KEY]: '{"epigrafe":"DECRETO"}' }))).toBeNull();
    expect(readDraft(fakeStorage({ [DRAFT_STORAGE_KEY]: '{"blocks":[]}' }))).toBeNull();
  });

  /*
   * Cota estourada e navegação anônima barram a gravação, e nenhuma das duas é
   * motivo para interromper quem está redigindo.
   */
  it('segue em frente quando o armazenamento recusa a gravação', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cheio: DraftStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };

    expect(() => writeDraft(ato, cheio)).not.toThrow();

    warn.mockRestore();
  });
});
