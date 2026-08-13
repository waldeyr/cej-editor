import { describe, it, expect } from 'vitest';
import { LegislativeDocument } from '../types/legislative';
import { blockTarget, moverParaParte, partTarget } from './docTargets';

const ato: LegislativeDocument = {
  title: 'DECRETO Nº 13.091',
  epigrafe: 'DECRETO Nº 13.091, DE 5 DE AGOSTO DE 2026',
  ementa: '',
  preambulo: '',
  ordemExecucao: 'DECRETA:',
  blocks: [
    {
      id: 'b1',
      type: 'TEXTO_LIVRE',
      content: 'Dispõe sobre o remanejamento de <b>cargos</b>.',
      rawText: 'Dispõe sobre o remanejamento de cargos.',
    },
    {
      id: 'b2',
      type: 'ARTIGO',
      numberLabel: 'Art. 1º',
      content: 'Ficam remanejados os cargos.',
      rawText: 'Ficam remanejados os cargos.',
    },
  ],
  fecho: 'Brasília, 5 de agosto de 2026.',
  assinaturas: [],
};

describe('fazer do texto selecionado uma parte que abre o ato', () => {
  it('leva o trecho para o campo e o tira da lista de dispositivos', () => {
    // A frase não pode ficar nos dois lugares: no campo e como dispositivo ela
    // apareceria duas vezes no ato.
    const depois = moverParaParte(ato, 'ementa', [blockTarget('b1')]);

    expect(depois.ementa).toBe('Dispõe sobre o remanejamento de <b>cargos</b>.');
    expect(depois.blocks.map((bloco) => bloco.id)).toEqual(['b2']);
  });

  it('deixa para trás o rótulo, que é do dispositivo e não do texto', () => {
    // "Art. 1º" não foi escrito pelo redator: é consequência da posição do
    // dispositivo na lista. Levá-lo faria a ementa começar por "Art. 1º", que é
    // justamente o que quem promove um parágrafo mal classificado desfaz.
    const depois = moverParaParte(ato, 'ementa', [blockTarget('b2')]);

    expect(depois.ementa).toBe('Ficam remanejados os cargos.');
  });

  it('leva junto o ponto de ancoragem, para que as remissões não fiquem sem destino', () => {
    // No dispositivo a âncora mora em `linkName` e quem a desenha é o
    // serializador; a parte fixa não tem esse campo, então ela vem para dentro
    // do texto — ou toda remissão ao artigo promovido perderia o destino.
    const comAncora: LegislativeDocument = {
      ...ato,
      blocks: [{ ...ato.blocks[1], linkName: 'art1' }],
    };
    const depois = moverParaParte(comAncora, 'preambulo', [blockTarget('b2')]);

    expect(depois.preambulo).toBe('<a name="art1"></a>Ficam remanejados os cargos.');
  });

  it('escreve as aspas e o "(NR)" que a folha desenhava a partir do tipo', () => {
    const comAlteracao: LegislativeDocument = {
      ...ato,
      blocks: [
        {
          id: 'b3',
          type: 'ALTERACAO',
          content: 'O prazo será de trinta dias.',
          rawText: 'O prazo será de trinta dias.',
          novaRedacao: true,
        },
      ],
    };
    const depois = moverParaParte(comAlteracao, 'ementa', [blockTarget('b3')]);

    expect(depois.ementa).toBe('“O prazo será de trinta dias.” (NR)');
  });

  it('junta vários trechos na ordem em que estão na folha', () => {
    const depois = moverParaParte(ato, 'preambulo', [blockTarget('b1'), blockTarget('b2')]);

    expect(depois.preambulo).toBe(
      'Dispõe sobre o remanejamento de <b>cargos</b>. Ficam remanejados os cargos.'
    );
    expect(depois.blocks).toHaveLength(0);
  });

  it('junta o que já morava no campo quando ele também foi selecionado', () => {
    // Arrastar do meio da ementa até o fim do parágrafo seguinte é o gesto de
    // quem quer juntar os dois; descartar a metade que já estava no campo
    // apagaria texto que o redator tinha na tela.
    const comEmenta: LegislativeDocument = { ...ato, ementa: 'Dispõe sobre o remanejamento' };
    const depois = moverParaParte(comEmenta, 'ementa', [partTarget('ementa'), blockTarget('b2')]);

    expect(depois.ementa).toBe('Dispõe sobre o remanejamento Ficam remanejados os cargos.');
  });

  it('recusa a tabela e o anexo, que não são texto de parte fixa', () => {
    /*
     * A tabela num campo de parte fixa é desfeita na gravação e ainda reaparece
     * como bloco ao reabrir — o mesmo conteúdo em dois lugares. O anexo é quem
     * marca onde o anexo começa: tirá-lo da lista manda o anexo inteiro de
     * volta para o corpo do ato, calado.
     */
    const comTabelaEAnexo: LegislativeDocument = {
      ...ato,
      blocks: [
        { id: 't1', type: 'TABELA', content: '<table><tr><td>Cargo</td></tr></table>', rawText: 'Tabela' },
        { id: 'x1', type: 'ANEXO', content: 'ANEXO I', rawText: 'ANEXO I' },
      ],
    };

    expect(moverParaParte(comTabelaEAnexo, 'ementa', [blockTarget('t1')])).toBe(comTabelaEAnexo);
    expect(moverParaParte(comTabelaEAnexo, 'ementa', [blockTarget('x1')])).toBe(comTabelaEAnexo);
  });

  it('não esvazia a ordem de execução nem o fecho, que sumiriam da folha', () => {
    expect(moverParaParte(ato, 'ementa', [partTarget('fecho')])).toBe(ato);
    expect(moverParaParte(ato, 'ementa', [partTarget('ordemExecucao')])).toBe(ato);
  });

  it('move de uma parte fixa para outra, e esvazia a de origem', () => {
    // É como se conserta o arquivo que trouxe a ementa dentro da epígrafe.
    const depois = moverParaParte(ato, 'ementa', [partTarget('epigrafe')]);

    expect(depois.ementa).toBe('DECRETO Nº 13.091, DE 5 DE AGOSTO DE 2026');
    expect(depois.epigrafe).toBe('');
  });

  it('acompanha o título do arquivo quando a epígrafe muda', () => {
    const depois = moverParaParte(ato, 'epigrafe', [blockTarget('b1')]);

    expect(depois.title).toBe('Dispõe sobre o remanejamento de cargos.');
  });

  it('não faz nada quando a origem é a própria parte de destino', () => {
    expect(moverParaParte(ato, 'epigrafe', [partTarget('epigrafe')])).toBe(ato);
  });

  it('não esvazia a parte quando o trecho selecionado não tem texto', () => {
    const comVazio: LegislativeDocument = {
      ...ato,
      blocks: [{ id: 'b0', type: 'TEXTO_LIVRE', content: '', rawText: '' }],
    };

    expect(moverParaParte(comVazio, 'ementa', [blockTarget('b0')])).toBe(comVazio);
  });
});
