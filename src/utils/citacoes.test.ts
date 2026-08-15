import { describe, it, expect } from 'vitest';
import { BlockType, LegislativeBlock, PosicaoNaCitacao } from '../types/legislative';
import { applyBlockType, renumberBlocks } from './blockTypes';
import { citacaoAbaixoDe, dividirCitacao, estaEmCitacao, preencherCitacoes } from './citacoes';
import { ancorarDispositivos } from './anchors';

const block = (
  id: string,
  type: BlockType,
  citacao?: PosicaoNaCitacao,
  numberLabel = ''
): LegislativeBlock => ({
  id,
  type,
  numberLabel,
  content: 'Texto.',
  rawText: 'Texto.',
  citacao,
});

const posicoes = (blocks: readonly LegislativeBlock[]) => blocks.map((bloco) => bloco.citacao);

describe('a citação do ato alterado', () => {
  it('recolhe também o que corre entre as aspas, e não só as linhas que as trazem', () => {
    /*
     * "“Art. 2º ....." abre, "....(NR)" fecha, e entre os dois estão o inciso, o
     * omissis e a alínea do ato **alterado** — que é o caso do decreto de
     * docs/file-tests.
     */
    const ato = [
      block('a1', 'ARTIGO'),
      block('c1', 'ALTERACAO', 'abre'),
      block('c2', 'INCISO'),
      block('c3', 'OMISSIS'),
      block('c4', 'ALINEA'),
      block('c5', 'ALTERACAO', 'fecha'),
      block('a2', 'ARTIGO'),
    ];

    expect(posicoes(preencherCitacoes(ato))).toEqual([
      undefined,
      'abre',
      'meio',
      'meio',
      'meio',
      'fecha',
      undefined,
    ]);
  });

  it('não junta duas citações que se encostam', () => {
    // O fechamento de uma e a abertura da seguinte são parágrafos vizinhos no
    // decreto de docs/file-tests: "....(NR)" e logo abaixo "“Art. 3º-A …".
    const ato = [
      block('c1', 'ALTERACAO', 'abre'),
      block('c2', 'ALTERACAO', 'fecha'),
      block('d1', 'ALTERACAO', 'abre'),
      block('d2', 'INCISO'),
      block('d3', 'ALTERACAO', 'fecha'),
    ];

    expect(posicoes(preencherCitacoes(ato))).toEqual(['abre', 'fecha', 'abre', 'meio', 'fecha']);
  });

  it('aspas que abrem e não fecham não engolem o resto do ato', () => {
    const ato = [block('c1', 'ALTERACAO', 'abre'), block('a1', 'ARTIGO'), block('a2', 'INCISO')];

    expect(posicoes(preencherCitacoes(ato))).toEqual(['unica', undefined, undefined]);
  });

  it('o dispositivo citado não recebe endereço, nem o que corre no meio da citação', () => {
    /*
     * Endereço errado é pior que endereço nenhum (invariante 12): o inciso
     * transcrito de outro ato tomava "art1i" e a remissão levava ao inciso do
     * ato alterador, sem que nada denunciasse.
     */
    const ato = ancorarDispositivos({
      title: '',
      epigrafe: '',
      ementa: '',
      preambulo: '',
      ordemExecucao: 'DECRETA:',
      fecho: '',
      assinaturas: [],
      blocks: [
        block('a1', 'ARTIGO', undefined, 'Art. 1º'),
        block('c1', 'ALTERACAO', 'abre', 'Art. 7º'),
        block('c2', 'INCISO', 'meio', 'I -'),
        block('c3', 'ALTERACAO', 'fecha'),
        block('a2', 'ARTIGO', undefined, 'Art. 2º'),
      ],
    });

    expect(ato.blocks.map((bloco) => bloco.linkName)).toEqual([
      'art1',
      undefined,
      undefined,
      undefined,
      'art2',
    ]);
  });
});

describe('a renumeração e o ato alterado', () => {
  it('não renumera o dispositivo citado, nem o deixa deslocar a série deste ato', () => {
    /*
     * Decreto nº 12.002/2024, art. 14, IV: renumerar dispositivo do ato alterado
     * é vedado. O "I -" transcrito de outra lei também não conta para o inciso
     * deste — a série é de cada ato.
     */
    const ato = [
      block('a1', 'ARTIGO', undefined, 'Art. 1º'),
      block('a2', 'INCISO', undefined, 'IX -'),
      block('c1', 'ALTERACAO', 'abre', 'Art. 7º'),
      block('c2', 'INCISO', 'meio', 'VII -'),
      block('c3', 'INCISO', 'fecha', 'VIII -'),
      block('a3', 'INCISO', undefined, 'III -'),
    ];

    expect(renumberBlocks(ato).map((bloco) => bloco.numberLabel)).toEqual([
      'Art. 1º',
      'I -',
      'Art. 7º',
      'VII -',
      'VIII -',
      'II -',
    ]);
  });
});

describe('marcar a alteração pela barra de comandos', () => {
  it('faz dos dispositivos escolhidos uma citação só, com as aspas nas pontas', () => {
    const ato = [block('a1', 'ARTIGO'), block('b1', 'INCISO'), block('b2', 'INCISO')];

    expect(posicoes(applyBlockType(ato, new Set(['b1', 'b2']), 'ALTERACAO'))).toEqual([
      undefined,
      'abre',
      'fecha',
    ]);
  });

  it('marca como citação também o que ficou entre duas escolhas', () => {
    // Uma citação não tem buraco: o parágrafo entre dois dispositivos citados é
    // citado também, ainda que o cursor não o tenha alcançado.
    const ato = [block('b1', 'INCISO'), block('b2', 'ALINEA'), block('b3', 'INCISO')];

    expect(posicoes(applyBlockType(ato, new Set(['b1', 'b3']), 'ALTERACAO'))).toEqual([
      'abre',
      'meio',
      'fecha',
    ]);
  });

  it('um dispositivo só abre e fecha a citação na mesma linha', () => {
    const ato = [block('b1', 'INCISO')];
    expect(posicoes(applyBlockType(ato, new Set(['b1']), 'ALTERACAO'))).toEqual(['unica']);
  });

  it('não deixa a tabela ser ponta da citação, porque ela não desenha aspas', () => {
    // Aspas que a folha não desenha o arquivo não grava, e a citação voltaria da
    // releitura desfeita.
    const ato = [block('t1', 'TABELA'), block('b1', 'INCISO'), block('t2', 'TABELA')];

    expect(posicoes(applyBlockType(ato, new Set(['t1', 'b1', 't2']), 'ALTERACAO'))).toEqual([
      undefined,
      'unica',
      undefined,
    ]);
  });
});

describe('editar dentro da citação', () => {
  it('repartir um dispositivo citado não abre nem fecha a citação', () => {
    expect(dividirCitacao('unica')).toEqual(['abre', 'fecha']);
    expect(dividirCitacao('abre')).toEqual(['abre', 'meio']);
    expect(dividirCitacao('fecha')).toEqual(['meio', 'fecha']);
    expect(dividirCitacao('meio')).toEqual(['meio', 'meio']);
    expect(dividirCitacao(undefined)).toEqual([undefined, undefined]);
  });

  it('o dispositivo criado dentro da citação nasce citado; depois dela, não', () => {
    expect(citacaoAbaixoDe(block('c', 'INCISO', 'abre'))).toBe('meio');
    expect(citacaoAbaixoDe(block('c', 'INCISO', 'meio'))).toBe('meio');
    expect(citacaoAbaixoDe(block('c', 'ALTERACAO', 'fecha'))).toBeUndefined();
    expect(citacaoAbaixoDe(block('a', 'ARTIGO'))).toBeUndefined();
  });

  it('o ato guardado antes desta marca continua recolhido pelo tipo', () => {
    // Rascunho gravado em localStorage por uma versão anterior: só o tipo diz
    // que aquilo é citação, e ele responde por uma citação de um dispositivo só.
    expect(estaEmCitacao(block('c', 'ALTERACAO'))).toBe(true);
    expect(estaEmCitacao(block('a', 'ARTIGO'))).toBe(false);
  });
});
