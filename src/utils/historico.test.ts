import { describe, it, expect } from 'vitest';
import { LegislativeDocument } from '../types/legislative';
import { ComHistorico } from '../types/abas';
import {
  MAX_HISTORICO,
  desfazer,
  podeDesfazer,
  podeRefazer,
  recomecar,
  refazer,
  registrar,
} from './historico';

const docA: LegislativeDocument = {
  title: 'Doc A',
  epigrafe: 'Doc A',
  ementa: 'Ementa A',
  preambulo: 'Preambulo A',
  ordemExecucao: 'DECRETA:',
  blocks: [],
  fecho: 'Fecho A',
  assinaturas: [],
};

const docB: LegislativeDocument = { ...docA, title: 'Doc B', epigrafe: 'Doc B' };

const novo = (doc: LegislativeDocument): ComHistorico => ({ doc, passado: [], futuro: [] });

describe('histórico de desfazer e refazer', () => {
  it('nasce sem passo para desfazer nem para refazer', () => {
    const h = novo(docA);

    expect(podeDesfazer(h)).toBe(false);
    expect(podeRefazer(h)).toBe(false);
  });

  it('empilha a alteração e a devolve com desfazer e refazer', () => {
    const registrado = registrar(novo(docA), docB);
    expect(registrado.doc.title).toBe('Doc B');
    expect(podeDesfazer(registrado)).toBe(true);
    expect(podeRefazer(registrado)).toBe(false);

    const desfeito = desfazer(registrado);
    expect(desfeito.doc.title).toBe('Doc A');
    expect(podeDesfazer(desfeito)).toBe(false);
    expect(podeRefazer(desfeito)).toBe(true);

    const refeito = refazer(desfeito);
    expect(refeito.doc.title).toBe('Doc B');
    expect(podeDesfazer(refeito)).toBe(true);
    expect(podeRefazer(refeito)).toBe(false);
  });

  it(`guarda no máximo ${MAX_HISTORICO} passos, descartando os mais antigos`, () => {
    let h = novo(docA);
    for (let i = 1; i <= MAX_HISTORICO + 10; i++) {
      h = registrar(h, { ...docA, title: `Doc ${i}` });
    }

    expect(h.doc.title).toBe(`Doc ${MAX_HISTORICO + 10}`);
    expect(h.passado).toHaveLength(MAX_HISTORICO);
    // O mais antigo sobrevivente é o passo 10 — os anteriores caíram pela borda.
    expect(h.passado[0].title).toBe('Doc 10');
  });

  /*
   * A marca de trabalho não salvo é `doc !== limpo`, comparada por identidade.
   * Se registrar uma alteração que não altera nada devolvesse objeto novo, todo
   * ato aberto apareceria como não salvo assim que um campo perdesse o foco.
   */
  it('devolve o mesmo estado quando o documento não mudou de fato', () => {
    const h = registrar(novo(docA), docB);
    const igual = registrar(h, { ...docB });

    expect(igual).toBe(h);
    expect(igual.doc).toBe(h.doc);
    expect(igual.passado).toHaveLength(1);
  });

  it('aceita função de atualização, como o setState que substituiu', () => {
    const h = registrar(novo(docA), (atual) => ({ ...atual, title: 'Doc B' }));

    expect(h.doc.title).toBe('Doc B');
    expect(h.passado[0].title).toBe('Doc A');
  });

  it('descarta o futuro quando se altera depois de desfazer', () => {
    const h = desfazer(registrar(novo(docA), docB));
    expect(podeRefazer(h)).toBe(true);

    const outro = registrar(h, { ...docA, title: 'Doc C' });
    expect(podeRefazer(outro)).toBe(false);
  });

  it('não faz nada quando não há passo para desfazer ou refazer', () => {
    const h = novo(docA);

    expect(desfazer(h)).toBe(h);
    expect(refazer(h)).toBe(h);
  });

  /*
   * Abrir outro arquivo não é passo anterior do ato que estava aberto: sem
   * limpar a pilha, Ctrl+Z traria de volta um ato que não é este.
   */
  it('recomeçar adota o documento e joga fora a história', () => {
    const h = registrar(registrar(novo(docA), docB), { ...docA, title: 'Doc C' });
    const limpo = recomecar(h, docA);

    expect(limpo.doc).toBe(docA);
    expect(podeDesfazer(limpo)).toBe(false);
    expect(podeRefazer(limpo)).toBe(false);
  });

  it('preserva os campos que não são da história', () => {
    const aba = { ...novo(docA), id: 'aba-1', rotulo: 'Decreto' };
    const depois = registrar(aba, docB);

    expect(depois.id).toBe('aba-1');
    expect(depois.rotulo).toBe('Decreto');
  });
});
