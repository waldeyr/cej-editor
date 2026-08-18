import { describe, it, expect } from 'vitest';
import { BlockType, LegislativeBlock, LegislativeDocument } from '../types/legislative';
import {
  ancorarDispositivos,
  collectAnchorPoints,
  createAnchorName,
  findAnchorBlock,
  renumerarDispositivos,
  semPontosDeAncoragem,
} from './anchors';
import { serializeToPlanaltoHtml } from '../parser/htmlSerializer';

const block = (partial: Partial<LegislativeBlock> & { id: string }): LegislativeBlock => ({
  type: 'TEXTO_LIVRE',
  content: '',
  rawText: '',
  ...partial,
});

const docWith = (...blocks: LegislativeBlock[]): LegislativeDocument => ({
  title: 'Ato',
  epigrafe: '',
  ementa: '',
  preambulo: '',
  ordemExecucao: 'DECRETA:',
  blocks,
  fecho: '',
  assinaturas: [],
});

/** O caso que motiva o recurso: um artigo remetendo ao anexo marcado como destino. */
const anexoMarcado = () =>
  docWith(
    block({
      id: 'b1',
      type: 'ARTIGO',
      numberLabel: 'Art. 13',
      content: 'Na forma do Anexo I, ficam remanejados os cargos.',
      rawText: 'Na forma do Anexo I, ficam remanejados os cargos.',
    }),
    block({
      id: 'b2',
      type: 'ANEXO',
      content: '<a name="anexoi">ANEXO I</a>',
      rawText: 'ANEXO I',
    })
  );

describe('nome do ponto de ancoragem', () => {
  it('sai do trecho marcado', () => {
    expect(createAnchorName(docWith(), 'Anexo I')).toBe('anexoi');
    expect(createAnchorName(docWith(), 'Art. 13')).toBe('art13');
  });

  it('não sombreia um nome já em uso', () => {
    expect(createAnchorName(anexoMarcado(), 'Anexo I')).toBe('anexoi-2');
  });

  it('não sombreia as âncoras que o importador numera por artigo', () => {
    const doc = docWith(block({ id: 'b1', type: 'ARTIGO', numberLabel: 'Art. 1º', linkName: 'art1' }));
    expect(createAnchorName(doc, 'Art. 1º')).toBe('art1-2');
  });

  it('recai em "ponto" quando o trecho não começa por letra', () => {
    expect(createAnchorName(docWith(), '§ 2º')).toBe('ponto2');
    expect(createAnchorName(docWith(), '— ')).toBe('ponto1');
  });
});

describe('pontos de ancoragem do ato', () => {
  it('oferece a epígrafe como destino padrão', () => {
    const doc = { ...docWith(), epigrafe: 'DECRETO Nº 13.090' };

    expect(collectAnchorPoints(doc)).toEqual([
      { name: 'epigrafe', label: 'Epígrafe', location: 'Epígrafe', blockId: 'epigrafe' },
    ]);
    expect(createAnchorName(doc, 'Epígrafe')).toBe('epigrafe-2');
  });

  it('não oferece a âncora da epígrafe vazia', () => {
    expect(collectAnchorPoints(docWith())).toEqual([]);
  });

  it('reúne os marcados à mão e os numerados na importação', () => {
    const doc = docWith(
      block({ id: 'b1', type: 'ARTIGO', numberLabel: 'Art. 1º', linkName: 'art1' }),
      block({ id: 'b2', type: 'ANEXO', content: '<a name="anexoi">ANEXO I</a>', rawText: 'ANEXO I' })
    );

    expect(collectAnchorPoints(doc)).toEqual([
      { name: 'art1', label: 'Art. 1º', location: 'Art. 1º', blockId: 'b1' },
      { name: 'anexoi', label: 'ANEXO I', location: 'ANEXO I', blockId: 'b2' },
    ]);
  });

  it('mostra o trecho marcado, e não o dispositivo inteiro', () => {
    const doc = docWith(
      block({
        id: 'b1',
        type: 'ARTIGO',
        numberLabel: 'Art. 2º',
        content: 'Ficam criados os <a name="cargos">Cargos Comissionados</a> previstos.',
        rawText: 'Ficam criados os Cargos Comissionados previstos.',
      })
    );

    expect(collectAnchorPoints(doc)[0]).toMatchObject({
      name: 'cargos',
      label: 'Cargos Comissionados',
      location: 'Art. 2º',
    });
  });

  it('lista o nome repetido uma vez só, e é a primeira ocorrência que vale', () => {
    // Duplicar um dispositivo levava o endereço junto. Dois destinos de mesmo
    // nome na lista, e o navegador parando no primeiro: metade das remissões
    // apontaria para o dispositivo errado.
    const doc = docWith(
      block({ id: 'b1', type: 'ARTIGO', numberLabel: 'Art. 2º', linkName: 'art2' }),
      block({ id: 'b2', type: 'ARTIGO', numberLabel: 'Art. 2º', linkName: 'art2' })
    );

    const pontos = collectAnchorPoints(doc);
    expect(pontos.map((ponto) => ponto.name)).toEqual(['art2']);
    expect(pontos[0].blockId).toBe('b1');
  });

  it('cita o dispositivo pela cadeia em que ele está, e não só pelo rótulo', () => {
    const doc = docWith(
      block({ id: 'b1', type: 'ANEXO', numberLabel: 'ANEXO I', linkName: 'anexoi' }),
      block({ id: 'b2', type: 'ARTIGO', numberLabel: 'Art. 1º', linkName: 'anexoiart1' }),
      block({ id: 'b3', type: 'INCISO', numberLabel: 'II -', linkName: 'anexoiart1ii' }),
      block({ id: 'b4', type: 'ALINEA', numberLabel: 'a)', linkName: 'anexoiart1iia' })
    );

    expect(collectAnchorPoints(doc).map((ponto) => ponto.location)).toEqual([
      'ANEXO I',
      'ANEXO I, Art. 1º',
      'ANEXO I, Art. 1º, II',
      'ANEXO I, Art. 1º, II, a)',
    ]);
  });

  it('localiza o dispositivo que responde por um nome', () => {
    expect(findAnchorBlock(anexoMarcado(), '#anexoi')?.id).toBe('b2');
    expect(findAnchorBlock(anexoMarcado(), 'inexistente')).toBeUndefined();
  });
});

/** Ato compacto: cada dispositivo pelo tipo e pelo rótulo que ele exibe. */
const ato = (...dispositivos: [BlockType, string][]): LegislativeDocument =>
  docWith(
    ...dispositivos.map(([type, numberLabel], i) => block({ id: `b${i}`, type, numberLabel }))
  );

/** Os endereços do ato depois da criação automática, na ordem em que ele se lê. */
const enderecos = (doc: LegislativeDocument): (string | undefined)[] =>
  ancorarDispositivos(doc).blocks.map((bloco) => bloco.linkName);

describe('criação automática dos pontos de ancoragem', () => {
  it('endereça o dispositivo pela posição dele, na forma do ato publicado', () => {
    expect(
      enderecos(
        ato(
          ['ARTIGO', 'Art. 5º'],
          ['PARAGRAFO', '§ 1º'],
          ['INCISO', 'II -'],
          ['ALINEA', 'a)'],
          ['ITEM', '1.']
        )
      )
    ).toEqual(['art5', 'art5§1', 'art5§1ii', 'art5§1iia', 'art5§1iia1']);
  });

  it('pendura o inciso do caput no artigo quando não há parágrafo entre os dois', () => {
    expect(enderecos(ato(['ARTIGO', 'Art. 1º'], ['INCISO', 'I -']))).toEqual(['art1', 'art1i']);
  });

  it('escreve o parágrafo único como "p" e o sufixo "-A" como letra colada', () => {
    expect(
      enderecos(ato(['ARTIGO', 'Art. 5º-A'], ['PARAGRAFO', 'Parágrafo único'], ['INCISO', 'III-A -']))
    ).toEqual(['art5a', 'art5ap', 'art5apiiia']);
  });

  it('encaixa a seção no capítulo, e deixa o artigo fora dos dois', () => {
    expect(
      enderecos(ato(['CAPITULO', 'CAPÍTULO I'], ['SECAO', 'Seção I'], ['ARTIGO', 'Art. 1º']))
    ).toEqual(['capituloi', 'capituloisecaoi', 'art1']);
  });

  it('prefixa com o anexo tudo o que vem depois dele (LC 95/1998, art. 11)', () => {
    expect(
      enderecos(
        ato(['ARTIGO', 'Art. 1º'], ['ANEXO', 'ANEXO I'], ['ARTIGO', 'Art. 1º'], ['INCISO', 'I -'])
      )
    ).toEqual(['art1', 'anexoi', 'anexoiart1', 'anexoiart1i']);
  });

  it('lê a designação do anexo importado, que traz a linha inteira no conteúdo', () => {
    const doc = docWith(
      block({ id: 'b1', type: 'ANEXO', content: 'ANEXO II - DAS COMPETÊNCIAS', rawText: 'ANEXO II - DAS COMPETÊNCIAS' })
    );
    expect(enderecos(doc)).toEqual(['anexoii']);
  });

  it('não toca na âncora que o arquivo trouxe, e pendura os filhos dela', () => {
    const doc = docWith(
      block({ id: 'b1', type: 'ARTIGO', numberLabel: 'Art. 1º', content: '<a name="topo"></a>Fica instituído' }),
      block({ id: 'b2', type: 'INCISO', numberLabel: 'I -' })
    );
    // A âncora do ato publicado vem colada à frente do rótulo, dentro do
    // conteúdo: ela é o endereço do artigo, e não se duplica em `linkName`.
    expect(enderecos(doc)).toEqual([undefined, 'topoi']);
  });

  it('mantém o endereço do dispositivo depois de o redator escrever antes dele', () => {
    // Escrever no começo do artigo empurra a âncora vazia para o meio do texto.
    // Vazia ela não marca trecho nenhum, então continua sendo o endereço — e os
    // incisos continuam pendurados nele.
    const doc = docWith(
      block({ id: 'b1', type: 'ARTIGO', numberLabel: 'Art. 1º', content: 'Fica <a name="art1"></a>instituído' }),
      block({ id: 'b2', type: 'INCISO', numberLabel: 'I -' })
    );
    expect(enderecos(doc)).toEqual([undefined, 'art1i']);
  });

  it('não confunde com endereço a âncora que marca um trecho no meio do texto', () => {
    const doc = docWith(
      block({ id: 'b1', type: 'ARTIGO', numberLabel: 'Art. 1º', content: 'Ficam os <a name="cargos">cargos</a> criados' }),
      block({ id: 'b2', type: 'INCISO', numberLabel: 'I -' })
    );
    // O artigo ganha endereço próprio, e o inciso pende dele — não de "cargos".
    expect(enderecos(doc)).toEqual(['art1', 'art1i']);
  });

  it('não sombreia um nome que já pertence a outro trecho do ato', () => {
    const doc = docWith(
      block({ id: 'b1', type: 'ARTIGO', numberLabel: 'Art. 1º' }),
      block({ id: 'b2', type: 'TEXTO_LIVRE', content: 'na forma do <a name="art2">segundo artigo</a>' }),
      block({ id: 'b3', type: 'ARTIGO', numberLabel: 'Art. 2º' })
    );
    expect(enderecos(doc)).toEqual(['art1', undefined, undefined]);
  });

  it('deixa sem endereço o artigo citado dentro da alteração, que recomeça a série', () => {
    expect(
      enderecos(
        ato(['ARTIGO', 'Art. 1º'], ['ARTIGO', 'Art. 2º'], ['ARTIGO', 'Art. 3º'], ['ARTIGO', 'Art. 2º-A'])
      )
    ).toEqual(['art1', 'art2', 'art3', undefined]);
  });

  it('para a cadeia no degrau que se perdeu, em vez de saltar para o de cima', () => {
    // O inciso pende do parágrafo, e o rótulo do parágrafo não se deixa ler:
    // chamá-lo "art1i" o faria inciso do caput, que é outro dispositivo.
    expect(
      enderecos(ato(['ARTIGO', 'Art. 1º'], ['PARAGRAFO', 'Parágrafo'], ['INCISO', 'I -']))
    ).toEqual(['art1', undefined, undefined]);
  });

  it('dá o nome ao inciso, e não à alínea que chega antes dele no ato', () => {
    // "art1" + inciso "i" + alínea "i" também dá "art1ii". Quem cita um ato cita
    // o inciso II, e é dele o endereço canônico; a alínea perde e fica sem.
    expect(
      enderecos(
        ato(['ARTIGO', 'Art. 1º'], ['INCISO', 'I -'], ['ALINEA', 'i)'], ['INCISO', 'II -'])
      )
    ).toEqual(['art1', 'art1i', undefined, 'art1ii']);
  });

  it('não endereça o dispositivo citado dentro da alteração, que é de outro ato', () => {
    expect(
      enderecos(
        ato(['ARTIGO', 'Art. 2º'], ['ALTERACAO', 'Art. 7º'], ['INCISO', 'I -'], ['ARTIGO', 'Art. 3º'])
      )
    ).toEqual(['art2', undefined, undefined, 'art3']);
  });

  it('atravessa a linha de pontos, que conta omissão e não fim de dispositivo', () => {
    expect(
      enderecos(ato(['ARTIGO', 'Art. 1º'], ['INCISO', 'II -'], ['OMISSIS', ''], ['ALINEA', 'c)']))
    ).toEqual(['art1', 'art1ii', undefined, 'art1iic']);
  });

  it('endereça o dispositivo que a cópia deixou sem endereço', () => {
    // O gesto de "Duplicar Bloco": a cópia chega sem `linkName` e sem as âncoras
    // do conteúdo, e é aqui que ela ganha endereço próprio.
    const doc = docWith(
      block({ id: 'b1', type: 'ARTIGO', numberLabel: 'Art. 1º', linkName: 'art1' }),
      block({ id: 'b2', type: 'ARTIGO', numberLabel: 'Art. 2º' })
    );
    expect(enderecos(doc)).toEqual(['art1', 'art2']);
  });

  it('devolve o mesmo documento quando não há endereço a acrescentar', () => {
    const doc = ancorarDispositivos(ato(['ARTIGO', 'Art. 1º'], ['INCISO', 'I -']));
    expect(ancorarDispositivos(doc)).toBe(doc);
  });
});

describe('renumerar', () => {
  it('leva o endereço junto com o número, para ele não ficar no artigo errado', () => {
    // Um artigo entrou entre o 1º e o 2º: o antigo "Art. 2º" passa a 3º, e o
    // endereço dele tem de passar a `art3`. Deixá-lo em `art2` faria o arquivo
    // sair com `<a name="art2">` no artigo numerado 3º.
    const doc = docWith(
      block({ id: 'b1', type: 'ARTIGO', numberLabel: 'Art. 1º', linkName: 'art1' }),
      block({ id: 'b2', type: 'ARTIGO', numberLabel: 'Art. 1º' }),
      block({ id: 'b3', type: 'ARTIGO', numberLabel: 'Art. 2º', linkName: 'art2' })
    );

    const { doc: depois, renumerados } = renumerarDispositivos(doc);
    expect(depois.blocks.map((bloco) => [bloco.numberLabel, bloco.linkName])).toEqual([
      ['Art. 1º', 'art1'],
      ['Art. 2º', 'art2'],
      ['Art. 3º', 'art3'],
    ]);
    expect(renumerados).toBe(2);
  });

  it('leva junto o endereço dos dispositivos que pendem do artigo renumerado', () => {
    const doc = docWith(
      block({ id: 'b1', type: 'ARTIGO', numberLabel: 'Art. 1º' }),
      block({ id: 'b2', type: 'ARTIGO', numberLabel: 'Art. 1º', linkName: 'art1' }),
      block({ id: 'b3', type: 'INCISO', numberLabel: 'I -', linkName: 'art1i' })
    );

    const { doc: depois } = renumerarDispositivos(doc);
    expect(depois.blocks.map((bloco) => bloco.linkName)).toEqual(['art1', 'art2', 'art2i']);
  });

  it('não toca no endereço que veio dentro do conteúdo do ato publicado', () => {
    // Ele é o que as remissões já publicadas citam: o rótulo se move, o endereço
    // fica. É a diferença entre `linkName`, que este programa derivou, e o
    // `<a name>` que o arquivo trouxe.
    const doc = docWith(
      block({ id: 'b1', type: 'ARTIGO', numberLabel: 'Art. 1º' }),
      block({ id: 'b2', type: 'ARTIGO', numberLabel: 'Art. 1º', content: '<a name="art1"></a>Fica' })
    );

    const { doc: depois } = renumerarDispositivos(doc);
    expect(depois.blocks[1].numberLabel).toBe('Art. 2º');
    expect(depois.blocks[1].content).toContain('<a name="art1">');
    expect(depois.blocks[1].linkName).toBeUndefined();
  });

  it('devolve o mesmo documento quando a numeração já acompanha a ordem', () => {
    const doc = docWith(
      block({ id: 'b1', type: 'ARTIGO', numberLabel: 'Art. 1º', linkName: 'art1' }),
      block({ id: 'b2', type: 'ARTIGO', numberLabel: 'Art. 2º', linkName: 'art2' })
    );

    const resultado = renumerarDispositivos(doc);
    expect(resultado.renumerados).toBe(0);
    expect(resultado.doc).toBe(doc);
  });
});

describe('conteúdo copiado', () => {
  it('perde os pontos de ancoragem e guarda o texto e as remissões', () => {
    expect(semPontosDeAncoragem('<a name="art5"></a>Fica instituído')).toBe('Fica instituído');
    expect(semPontosDeAncoragem('os <a name="cargos">Cargos</a> criados')).toBe(
      'os <a>Cargos</a> criados'
    );
    expect(semPontosDeAncoragem('ver a <a href="l1.htm#art2" name="ida">Lei</a>')).toBe(
      'ver a <a href="l1.htm#art2">Lei</a>'
    );
  });

  it('não mexe em conteúdo que não tem ponto de ancoragem', () => {
    const html = 'Fica <b>instituído</b> o <a href="#art9">Programa</a>';
    expect(semPontosDeAncoragem(html)).toBe(html);
  });
});

describe('arquivo salvo', () => {
  it('leva o ponto de ancoragem junto com o conteúdo do dispositivo', () => {
    const exported = serializeToPlanaltoHtml(anexoMarcado());
    expect(exported).toContain('<a name="anexoi">ANEXO I</a>');
  });

  it('grava o endereço criado sozinho, e ele não veste azul de link', () => {
    const doc = ancorarDispositivos(
      docWith(
        block({ id: 'b1', type: 'ARTIGO', numberLabel: 'Art. 1º', content: 'Fica instituído o Programa.', rawText: 'Fica instituído o Programa.' })
      )
    );
    const exported = serializeToPlanaltoHtml(doc);

    // No navegador o ponto de ancoragem é destino, não caminho: ele é um `<a>`
    // vazio e sem `href`, e a folha de estilo só pinta quem tem para onde levar.
    expect(exported).toContain('<a name="art1"></a>');
    expect(exported).toMatch(/a\[href\][^{]*\{ color:/);
    expect(exported).not.toMatch(/^\s*a \{/m);
  });

  it('só veste de link o que tem destino — o ponto de ancoragem é texto comum', () => {
    const exported = serializeToPlanaltoHtml(anexoMarcado());
    expect(exported).toMatch(/a\[href\][^{]*\{ color:/);
    expect(exported).not.toMatch(/^\s*a \{ color:/m);
  });
});
