import { describe, it, expect } from 'vitest';
import { BlockType, LegislativeBlock } from '../types/legislative';
import {
  applyBlockType,
  numberLabelForTypeAt,
  renumberBlocks,
  toLetters,
  toRoman,
} from './blockTypes';

const block = (id: string, type: BlockType, content = 'Texto.'): LegislativeBlock => ({
  id,
  type,
  content,
  rawText: content,
});

/** Corpo de ato com um artigo, dois incisos e uma alínea — o caso corrente. */
const corpo = (): LegislativeBlock[] => [
  block('b1', 'ARTIGO'),
  block('b2', 'INCISO'),
  block('b3', 'ALINEA'),
  block('b4', 'INCISO'),
  block('b5', 'TEXTO_LIVRE', 'do Ministério do Planejamento;'),
];

const apply = (blocks: LegislativeBlock[], id: string, type: BlockType) =>
  applyBlockType(blocks, new Set([id]), type);

describe('numeração dos dispositivos', () => {
  it('numera o artigo pela série do ato inteiro, sem recomeçar a cada capítulo', () => {
    const blocks = [
      block('a', 'ARTIGO'),
      block('c', 'CAPITULO'),
      block('b', 'ARTIGO'),
    ];
    expect(numberLabelForTypeAt(blocks, blocks.length, 'ARTIGO')).toBe('Art. 3º');
  });

  it('passa a cardinal com ponto do décimo artigo em diante (LC 95/1998, art. 10, II)', () => {
    const nove = Array.from({ length: 9 }, (_, i) => block(`a${i}`, 'ARTIGO'));
    expect(numberLabelForTypeAt(nove, 8, 'ARTIGO')).toBe('Art. 9º');
    expect(numberLabelForTypeAt(nove, 9, 'ARTIGO')).toBe('Art. 10.');
  });

  it('conta o inciso dentro do artigo que o abriga, atravessando as alíneas', () => {
    // Art. / I / a) / II  →  o próximo inciso é o III.
    expect(numberLabelForTypeAt(corpo(), 4, 'INCISO')).toBe('III -');
  });

  it('recomeça a contagem do inciso no artigo seguinte', () => {
    const blocks = [...corpo(), block('b6', 'ARTIGO')];
    expect(numberLabelForTypeAt(blocks, blocks.length, 'INCISO')).toBe('I -');
  });

  it('conta a alínea dentro do inciso', () => {
    expect(numberLabelForTypeAt(corpo(), 3, 'ALINEA')).toBe('b)');
  });

  it('não deixa a contagem parar em tabelas, omissis e linhas sem formatação', () => {
    const blocks = [
      block('b1', 'ARTIGO'),
      block('b2', 'INCISO'),
      block('b3', 'OMISSIS'),
      block('b4', 'TEXTO_LIVRE'),
    ];
    expect(numberLabelForTypeAt(blocks, blocks.length, 'INCISO')).toBe('II -');
  });

  it('escreve romanos e letras além do primeiro degrau', () => {
    expect(toRoman(4)).toBe('IV');
    expect(toRoman(14)).toBe('XIV');
    expect(toRoman(1999)).toBe('MCMXCIX');
    expect(toLetters(1)).toBe('a');
    expect(toLetters(26)).toBe('z');
    expect(toLetters(27)).toBe('aa');
  });
});

describe('aplicação de tipo ao dispositivo selecionado', () => {
  it('converte a linha sem formatação em inciso, numerado pela posição', () => {
    const [, , , , convertido] = apply(corpo(), 'b5', 'INCISO');
    expect(convertido.type).toBe('INCISO');
    expect(convertido.numberLabel).toBe('III -');
    expect(convertido.content).toBe('do Ministério do Planejamento;');
  });

  it('preserva o conteúdo e o identificador do bloco convertido', () => {
    const original = block('b9', 'TEXTO_LIVRE', 'Fica <b>instituído</b> o programa.');
    const [convertido] = apply([original], 'b9', 'ARTIGO');
    expect(convertido.id).toBe('b9');
    expect(convertido.content).toBe('Fica <b>instituído</b> o programa.');
    expect(convertido.rawText).toBe('Fica instituído o programa.');
  });

  it('respeita o número que o redator digitou junto com o texto', () => {
    // Pela posição seria o Art. 2º; o número escrito à mão é que vale, porque o
    // rótulo não é editável na folha e não haveria como corrigi-lo depois.
    const escrito = block('b9', 'TEXTO_LIVRE', 'Art. 7º Fica instituído o programa.');
    const [, convertido] = apply([block('b1', 'ARTIGO'), escrito], 'b9', 'ARTIGO');
    expect(convertido.numberLabel).toBe('Art. 7º');
    expect(convertido.content).toBe('Fica instituído o programa.');
  });

  it('não repete o rótulo digitado à mão em cima do calculado', () => {
    const escrito = block('b9', 'TEXTO_LIVRE', 'II - do Ministério da Fazenda;');
    const [convertido] = apply([escrito], 'b9', 'INCISO');
    expect(convertido.numberLabel).toBe('II -');
    expect(convertido.content).toBe('do Ministério da Fazenda;');
  });

  it('não deixa invólucro vazio onde estava o rótulo em negrito', () => {
    const escrito = block('b9', 'TEXTO_LIVRE', '<b>Art. 2º</b> Fica revogado o decreto.');
    const [convertido] = apply([escrito], 'b9', 'ARTIGO');
    expect(convertido.numberLabel).toBe('Art. 2º');
    expect(convertido.content).toBe('Fica revogado o decreto.');
  });

  it('preserva a formatação do texto que vem depois do rótulo digitado', () => {
    const escrito = block('b9', 'TEXTO_LIVRE', 'Art. 2º Fica revogado o <i>caput</i>.');
    const [convertido] = apply([escrito], 'b9', 'ARTIGO');
    expect(convertido.content).toBe('Fica revogado o <i>caput</i>.');
  });

  it('numera o agrupador pelo rótulo, sem escrever nada dentro da denominação', () => {
    const escrito = block('b9', 'TEXTO_LIVRE', 'DAS DISPOSIÇÕES PRELIMINARES');
    const [convertido] = apply([escrito], 'b9', 'CAPITULO');
    expect(convertido.type).toBe('CAPITULO');
    expect(convertido.numberLabel).toBe('CAPÍTULO 1');
    expect(convertido.content).toBe('DAS DISPOSIÇÕES PRELIMINARES');
  });

  it('não numera o agrupador cujo texto já começa pelo nome dele', () => {
    const escrito = block('b9', 'TEXTO_LIVRE', 'CAPÍTULO II - DAS COMPETÊNCIAS');
    const [convertido] = apply([escrito], 'b9', 'CAPITULO');
    expect(convertido.numberLabel).toBe('');
    expect(convertido.content).toBe('CAPÍTULO II - DAS COMPETÊNCIAS');
  });

  it('tira as aspas do texto ao marcá-lo como dispositivo alterado', () => {
    const escrito = block('b9', 'ARTIGO', '“Art. 5º Fica alterado.” (NR)');
    const [convertido] = apply([escrito], 'b9', 'ALTERACAO');
    expect(convertido.type).toBe('ALTERACAO');
    expect(convertido.content).toBe('Art. 5º Fica alterado.');
  });

  it('marca como suprimido sem escrever por cima do texto do dispositivo', () => {
    const artigo: LegislativeBlock = {
      ...block('b9', 'ARTIGO', 'Fica instituído o programa.'),
      numberLabel: 'Art. 3º',
    };
    const [convertido] = apply([artigo], 'b9', 'OMISSIS');

    expect(convertido.type).toBe('OMISSIS');
    expect(convertido.content).toBe('Fica instituído o programa.');
    // O rótulo sai: uma linha de supressão não é o terceiro artigo do ato.
    expect(convertido.numberLabel).toBe('');
  });

  it('não deixa o dispositivo suprimido deslocar a numeração dos seguintes', () => {
    const blocks = [
      { ...block('b1', 'ARTIGO'), numberLabel: 'Art. 1º' },
      { ...block('b2', 'ARTIGO'), numberLabel: 'Art. 2º' },
      { ...block('b3', 'ARTIGO'), numberLabel: 'Art. 3º' },
    ];
    const [, , terceiro] = renumberBlocks(applyBlockType(blocks, new Set(['b2']), 'OMISSIS'));
    expect(terceiro.numberLabel).toBe('Art. 2º');
  });

  it('converte em ordem quando a seleção atravessa vários dispositivos', () => {
    const blocks = [
      block('b1', 'ARTIGO'),
      block('b2', 'TEXTO_LIVRE', 'do Ministério;'),
      block('b3', 'TEXTO_LIVRE', 'da Secretaria;'),
    ];
    const [, primeiro, segundo] = applyBlockType(blocks, new Set(['b2', 'b3']), 'INCISO');
    expect(primeiro.numberLabel).toBe('I -');
    expect(segundo.numberLabel).toBe('II -');
  });

  it('deixa intacto o bloco que já é do tipo pedido — o rótulo dele pode ser feito à mão', () => {
    const artigo: LegislativeBlock = { ...block('b1', 'ARTIGO'), numberLabel: 'Art. 5º-A' };
    const [inalterado] = apply([artigo], 'b1', 'ARTIGO');
    expect(inalterado).toBe(artigo);
  });

  it('não transforma tabela em dispositivo: o conteúdo dela não é texto de artigo', () => {
    const tabela = block('t1', 'TABELA', '<table><tbody><tr><td>a</td></tr></tbody></table>');
    const [inalterada] = apply([tabela], 't1', 'ARTIGO');
    expect(inalterada).toBe(tabela);
  });

  it('não toca nos blocos fora da seleção', () => {
    const blocks = corpo();
    const resultado = apply(blocks, 'b5', 'INCISO');
    expect(resultado.slice(0, 4)).toEqual(blocks.slice(0, 4));
  });
});

/** Dispositivo com rótulo, como o parser e a conversão os produzem. */
const rotulado = (id: string, type: BlockType, numberLabel: string): LegislativeBlock => ({
  ...block(id, type),
  numberLabel,
});

const rotulos = (blocks: LegislativeBlock[]) => blocks.map((b) => b.numberLabel);

describe('renumeração dos dispositivos', () => {
  it('acerta o artigo que ficou para trás quando outro entra na frente dele', () => {
    // O caso que motiva o recurso: dois "Art. 3º" depois de uma inserção.
    const blocks = [
      rotulado('b1', 'ARTIGO', 'Art. 1º'),
      rotulado('b2', 'ARTIGO', 'Art. 2º'),
      rotulado('b3', 'ARTIGO', 'Art. 3º'),
      rotulado('b4', 'ARTIGO', 'Art. 3º'),
      rotulado('b5', 'ARTIGO', 'Art. 4º'),
    ];
    expect(rotulos(renumberBlocks(blocks))).toEqual([
      'Art. 1º',
      'Art. 2º',
      'Art. 3º',
      'Art. 4º',
      'Art. 5º',
    ]);
  });

  it('renumera cada nível dentro do dispositivo que o abriga', () => {
    const blocks = [
      rotulado('b1', 'ARTIGO', 'Art. 1º'),
      rotulado('b2', 'INCISO', 'I -'),
      rotulado('b3', 'ALINEA', 'a)'),
      rotulado('b4', 'ALINEA', 'a)'),
      rotulado('b5', 'INCISO', 'I -'),
      rotulado('b6', 'ARTIGO', 'Art. 1º'),
      rotulado('b7', 'INCISO', 'IV -'),
    ];
    expect(rotulos(renumberBlocks(blocks))).toEqual([
      'Art. 1º',
      'I -',
      'a)',
      'b)',
      'II -',
      'Art. 2º',
      'I -',
    ]);
  });

  it('preserva o rótulo escrito à mão e não o conta na série', () => {
    // O "Art. 5º-A" de uma inclusão não desloca o artigo seguinte.
    const blocks = [
      rotulado('b1', 'ARTIGO', 'Art. 5º'),
      rotulado('b2', 'ARTIGO', 'Art. 5º-A'),
      rotulado('b3', 'ARTIGO', 'Art. 9º'),
    ];
    expect(rotulos(renumberBlocks(blocks))).toEqual(['Art. 1º', 'Art. 5º-A', 'Art. 2º']);
  });

  it('deixa o parágrafo único onde ele está, sem contá-lo', () => {
    const blocks = [
      rotulado('b1', 'ARTIGO', 'Art. 1º'),
      rotulado('b2', 'PARAGRAFO', 'Parágrafo único.'),
      rotulado('b3', 'ARTIGO', 'Art. 2º'),
      rotulado('b4', 'PARAGRAFO', '§ 3º'),
    ];
    expect(rotulos(renumberBlocks(blocks))).toEqual([
      'Art. 1º',
      'Parágrafo único.',
      'Art. 2º',
      '§ 1º',
    ]);
  });

  it('reconhece as formas que o importador traz do arquivo', () => {
    const blocks = [rotulado('b1', 'ARTIGO', 'Art. 13'), rotulado('b2', 'ARTIGO', 'Art. 10.')];
    expect(rotulos(renumberBlocks(blocks))).toEqual(['Art. 1º', 'Art. 2º']);
  });

  it('devolve os mesmos blocos quando a numeração já está certa', () => {
    const blocks = [rotulado('b1', 'ARTIGO', 'Art. 1º'), rotulado('b2', 'INCISO', 'I -')];
    const resultado = renumberBlocks(blocks);
    expect(resultado[0]).toBe(blocks[0]);
    expect(resultado[1]).toBe(blocks[1]);
  });

  it('alcança só os dispositivos indicados, contando os de fora na série', () => {
    const blocks = [
      rotulado('b1', 'ARTIGO', 'Art. 1º'),
      rotulado('b2', 'ARTIGO', 'Art. 1º'),
      rotulado('b3', 'ARTIGO', 'Art. 9º'),
    ];
    expect(rotulos(renumberBlocks(blocks, new Set(['b2'])))).toEqual([
      'Art. 1º',
      'Art. 2º',
      'Art. 9º',
    ]);
  });

  it('não mexe na numeração dos agrupadores, que mora na denominação', () => {
    const capitulo: LegislativeBlock = {
      ...block('b1', 'CAPITULO', 'CAPÍTULO 3 - DAS DISPOSIÇÕES FINAIS'),
      numberLabel: 'CAPÍTULO 3',
    };
    expect(renumberBlocks([capitulo])[0]).toBe(capitulo);
  });

  it('preserva o nome de âncora, que é a identidade do dispositivo', () => {
    const artigo: LegislativeBlock = {
      ...rotulado('b1', 'ARTIGO', 'Art. 3º'),
      linkName: 'art3',
    };
    expect(renumberBlocks([artigo])[0].linkName).toBe('art3');
  });
});
