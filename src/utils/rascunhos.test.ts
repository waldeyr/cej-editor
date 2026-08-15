import { describe, it, expect, vi } from 'vitest';
import { LegislativeDocument } from '../types/legislative';
import {
  ABA_LEGADA,
  ArmazenamentoDeRascunho,
  CHAVE_LEGADA,
  RascunhoGravado,
  adotarSessao,
  descartarOrfaos,
  descartarRascunho,
  gravarRascunho,
  gravarSessao,
  janelaViva,
  lerRascunho,
  lerSessao,
  migrarRascunhoLegado,
  pulsar,
  rascunhosGuardados,
  sessaoParaAdotar,
} from './rascunhos';

/** Armazenamento de mentira: o teste roda sem navegador, e portanto sem localStorage. */
const armazenamento = (inicial: Record<string, string> = {}): ArmazenamentoDeRascunho => {
  const dados = new Map(Object.entries(inicial));
  return {
    getItem: (chave) => dados.get(chave) ?? null,
    setItem: (chave, valor) => void dados.set(chave, valor),
    removeItem: (chave) => void dados.delete(chave),
    key: (indice) => [...dados.keys()][indice] ?? null,
    get length() {
      return dados.size;
    },
  };
};

const ato = (titulo = 'DECRETO Nº 1'): LegislativeDocument => ({
  title: titulo,
  epigrafe: `${titulo}, DE 1º DE JANEIRO DE 2026`,
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
});

const rascunho = (abaId: string, titulo?: string): RascunhoGravado => ({
  abaId,
  doc: ato(titulo),
  arquivo: null,
  rotulo: titulo ?? 'DECRETO Nº 1',
  gravadoEm: 1,
});

describe('rascunho de cada aba', () => {
  it('não encontra rascunho no primeiro uso do editor', () => {
    expect(lerRascunho('aba-1', armazenamento())).toBeNull();
  });

  it('devolve o ato que a aba guardou', () => {
    const s = armazenamento();
    gravarRascunho(rascunho('aba-1'), s);

    expect(lerRascunho('aba-1', s)?.doc).toEqual(ato());
  });

  /*
   * A razão de existir do módulo: com uma chave só, a última aba digitada
   * apagava a rede de segurança de todas as outras.
   */
  it('guarda atos de abas diferentes sem que um apague o outro', () => {
    const s = armazenamento();
    gravarRascunho(rascunho('aba-1', 'DECRETO A'), s);
    gravarRascunho(rascunho('aba-2', 'DECRETO B'), s);

    expect(lerRascunho('aba-1', s)?.doc.title).toBe('DECRETO A');
    expect(lerRascunho('aba-2', s)?.doc.title).toBe('DECRETO B');
    expect(rascunhosGuardados(s)).toHaveLength(2);
  });

  it('esquece o rascunho quando ele é descartado', () => {
    const s = armazenamento();
    gravarRascunho(rascunho('aba-1'), s);
    descartarRascunho('aba-1', s);

    expect(lerRascunho('aba-1', s)).toBeNull();
  });

  /*
   * O que está guardado veio de outra versão do editor, ou de alguém mexendo no
   * armazenamento do navegador. Abrir no exemplo é o pior que pode acontecer;
   * uma exceção aqui deixaria o editor sem folha nenhuma para desenhar.
   */
  it('trata como ausência o rascunho corrompido ou que não é um ato', () => {
    const avisou = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(lerRascunho('a', armazenamento({ 'cej.rascunho.v1.a': '{ isto não é json' }))).toBeNull();
    expect(lerRascunho('a', armazenamento({ 'cej.rascunho.v1.a': 'null' }))).toBeNull();
    expect(
      lerRascunho('a', armazenamento({ 'cej.rascunho.v1.a': '{"doc":{"epigrafe":"DECRETO"}}' }))
    ).toBeNull();

    avisou.mockRestore();
  });

  it('lista os rascunhos do mais recente para o mais antigo', () => {
    const s = armazenamento();
    gravarRascunho({ ...rascunho('aba-1', 'ANTIGO'), gravadoEm: 100 }, s);
    gravarRascunho({ ...rascunho('aba-2', 'RECENTE'), gravadoEm: 900 }, s);

    expect(rascunhosGuardados(s).map((r) => r.rotulo)).toEqual(['RECENTE', 'ANTIGO']);
  });
});

describe('armazenamento cheio', () => {
  const cheio = (): ArmazenamentoDeRascunho => ({
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {},
    key: () => null,
    length: 0,
  });

  /*
   * Cota estourada e navegação anônima barram a gravação, e nenhuma das duas é
   * motivo para interromper quem está redigindo.
   */
  it('avisa quem chamou em vez de estourar', () => {
    const avisou = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => gravarRascunho(rascunho('aba-1'), cheio())).not.toThrow();
    expect(gravarRascunho(rascunho('aba-1'), cheio())).toBe('cheio');

    avisou.mockRestore();
  });

  /*
   * A TIPI passa de qualquer cota. Barrar pelo tamanho poupa serializar 13 MB a
   * cada alteração para falhar sempre.
   */
  it('recusa o ato grande demais sem sequer tentar gravar', () => {
    const s = armazenamento();
    const enorme = { ...rascunho('aba-1'), doc: { ...ato(), fecho: 'x'.repeat(5 * 1024 * 1024) } };

    expect(gravarRascunho(enorme, s)).toBe('cheio');
    expect(lerRascunho('aba-1', s)).toBeNull();
  });

  /*
   * Ao faltar espaço, o que sai são os rascunhos de abas que já não existem —
   * nunca o de uma aba aberta, que é rede de segurança de trabalho vivo.
   */
  it('abre espaço descartando rascunho órfão, e não o de aba aberta', () => {
    const s = armazenamento();
    gravarRascunho(rascunho('aba-viva'), s);
    gravarRascunho(rascunho('aba-morta'), s);
    gravarSessao('janela-1', { abas: ['aba-viva'], ativa: 'aba-viva', gravadaEm: 1 }, s);

    expect(descartarOrfaos(s)).toBe(1);
    expect(lerRascunho('aba-viva', s)).not.toBeNull();
    expect(lerRascunho('aba-morta', s)).toBeNull();
  });
});

describe('a lista de abas de cada janela', () => {
  it('guarda e devolve as abas da janela, com a pasta do projeto', () => {
    const s = armazenamento();
    gravarSessao('janela-1', { abas: ['a', 'b'], ativa: 'b', pastaRaiz: '/projeto', gravadaEm: 7 }, s);

    expect(lerSessao('janela-1', s)).toEqual({
      abas: ['a', 'b'],
      ativa: 'b',
      pastaRaiz: '/projeto',
      gravadaEm: 7,
    });
  });

  it('duas janelas não se atropelam', () => {
    const s = armazenamento();
    gravarSessao('janela-1', { abas: ['a'], ativa: 'a', gravadaEm: 1 }, s);
    gravarSessao('janela-2', { abas: ['b'], ativa: 'b', gravadaEm: 1 }, s);

    expect(lerSessao('janela-1', s)?.abas).toEqual(['a']);
    expect(lerSessao('janela-2', s)?.abas).toEqual(['b']);
  });

  it('trata sessão sem aba alguma como ausência de sessão', () => {
    const s = armazenamento();
    gravarSessao('janela-1', { abas: [], ativa: '', gravadaEm: 1 }, s);

    expect(lerSessao('janela-1', s)).toBeNull();
  });
});

describe('qual sessão uma janela nova pode adotar', () => {
  const AGORA = 1_000_000;

  const comSessao = (janelaId: string, gravadaEm: number, s: ArmazenamentoDeRascunho) =>
    gravarSessao(janelaId, { abas: [`aba-${janelaId}`], ativa: `aba-${janelaId}`, gravadaEm }, s);

  /*
   * Reabrir o programa traz de volta o que estava aberto: a janela anterior
   * morreu, e o pulso dela envelheceu junto.
   */
  it('adota a sessão da janela que parou de responder', () => {
    const s = armazenamento();
    comSessao('janela-morta', AGORA - 60_000, s);
    pulsar('janela-morta', AGORA - 60_000, s);

    expect(sessaoParaAdotar(AGORA, s)?.janelaId).toBe('janela-morta');
  });

  /*
   * O caso que o pulso existe para resolver: clicar em "Nova janela" não pode
   * fazer a janela nova roubar as abas da que continua aberta.
   */
  it('não adota a sessão de janela que continua aberta', () => {
    const s = armazenamento();
    comSessao('janela-viva', AGORA - 1_000, s);
    pulsar('janela-viva', AGORA - 1_000, s);

    expect(sessaoParaAdotar(AGORA, s)).toBeNull();
  });

  it('entre duas janelas encerradas, adota a que foi usada por último', () => {
    const s = armazenamento();
    comSessao('antiga', AGORA - 900_000, s);
    comSessao('recente', AGORA - 100_000, s);

    expect(sessaoParaAdotar(AGORA, s)?.janelaId).toBe('recente');
  });

  it('passa a sessão adiante e apaga o registro antigo, para ninguém adotá-la duas vezes', () => {
    const s = armazenamento();
    comSessao('morta', AGORA - 60_000, s);

    expect(adotarSessao('morta', 'nova', s)?.abas).toEqual(['aba-morta']);
    expect(lerSessao('morta', s)).toBeNull();
    expect(lerSessao('nova', s)?.abas).toEqual(['aba-morta']);
    expect(sessaoParaAdotar(AGORA, s)?.janelaId).toBe('nova');
  });

  it('a janela que pulsa deixa de ser adotável', () => {
    const s = armazenamento();
    comSessao('janela', AGORA - 60_000, s);
    expect(sessaoParaAdotar(AGORA, s)).not.toBeNull();

    pulsar('janela', AGORA, s);
    expect(janelaViva('janela', AGORA, s)).toBe(true);
    expect(sessaoParaAdotar(AGORA, s)).toBeNull();
  });
});

describe('migração da chave antiga', () => {
  it('adota o rascunho gravado pelo editor anterior e apaga a chave', () => {
    const s = armazenamento({ [CHAVE_LEGADA]: JSON.stringify(ato('DECRETO ANTIGO')) });

    expect(migrarRascunhoLegado(s)?.doc.title).toBe('DECRETO ANTIGO');
    expect(s.getItem(CHAVE_LEGADA)).toBeNull();
  });

  /*
   * O StrictMode invoca duas vezes o que roda em inicializador de estado e
   * descarta o resultado da primeira. Por isso a migração grava antes de
   * devolver: a segunda chamada não acha mais a chave, mas o rascunho já está
   * guardado e continua alcançável.
   */
  it('deixa o rascunho guardado, para a segunda chamada não o perder', () => {
    const s = armazenamento({ [CHAVE_LEGADA]: JSON.stringify(ato('DECRETO ANTIGO')) });

    expect(migrarRascunhoLegado(s)).not.toBeNull();
    expect(migrarRascunhoLegado(s)).toBeNull();
    expect(lerRascunho(ABA_LEGADA, s)?.doc.title).toBe('DECRETO ANTIGO');
  });

  it('não adota o que está na chave antiga mas não é um ato', () => {
    const s = armazenamento({ [CHAVE_LEGADA]: '{"epigrafe":"DECRETO"}' });

    expect(migrarRascunhoLegado(s)).toBeNull();
  });
});
