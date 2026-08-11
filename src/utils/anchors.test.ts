import { describe, it, expect } from 'vitest';
import { LegislativeBlock, LegislativeDocument } from '../types/legislative';
import { collectAnchorPoints, createAnchorName, findAnchorBlock } from './anchors';
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

  it('localiza o dispositivo que responde por um nome', () => {
    expect(findAnchorBlock(anexoMarcado(), '#anexoi')?.id).toBe('b2');
    expect(findAnchorBlock(anexoMarcado(), 'inexistente')).toBeUndefined();
  });
});

describe('arquivo salvo', () => {
  it('leva o ponto de ancoragem junto com o conteúdo do dispositivo', () => {
    const exported = serializeToPlanaltoHtml(anexoMarcado());
    expect(exported).toContain('<a name="anexoi">ANEXO I</a>');
  });

  it('só veste de link o que tem destino — o ponto de ancoragem é texto comum', () => {
    const exported = serializeToPlanaltoHtml(anexoMarcado());
    expect(exported).toContain('a[href] { color:');
    expect(exported).not.toMatch(/^\s*a \{ color:/m);
  });
});
