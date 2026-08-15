import { describe, it, expect } from 'vitest';
import { LegislativeDocument } from '../types/legislative';
import { EstadoDasAbas, estaSuja } from '../types/abas';
import {
  abaAtiva,
  abaComArquivo,
  criarAba,
  reduzirAbas,
  rotuloDaAba,
  temTrabalhoASalvar,
} from './abas';

const ato = (titulo: string): LegislativeDocument => ({
  title: titulo,
  epigrafe: titulo,
  ementa: '',
  preambulo: '',
  ordemExecucao: '',
  blocks: [
    { id: `${titulo}-b1`, type: 'ARTIGO', numberLabel: 'Art. 1º', content: 'Texto.', rawText: 'Texto.' },
  ],
  fecho: '',
  assinaturas: [],
});

const comAbas = (...titulos: string[]): EstadoDasAbas => {
  const abas = titulos.map((t) => criarAba(ato(t), { id: `aba-${t}` }));
  return { abas, ativa: abas[0].id };
};

describe('abas do editor', () => {
  it('abre o ato numa aba nova e a deixa ativa', () => {
    const estado = comAbas('A');
    const depois = reduzirAbas(estado, { tipo: 'abrir', aba: criarAba(ato('B'), { id: 'aba-B' }) });

    expect(depois.abas).toHaveLength(2);
    expect(depois.ativa).toBe('aba-B');
    expect(abaAtiva(depois).doc.title).toBe('B');
  });

  it('fechar a aba ativa passa a vez à da direita', () => {
    const estado = { ...comAbas('A', 'B', 'C'), ativa: 'aba-B' };
    const depois = reduzirAbas(estado, { tipo: 'fechar', id: 'aba-B', vazio: criarAba(ato('vazio')) });

    expect(depois.abas.map((a) => a.id)).toEqual(['aba-A', 'aba-C']);
    expect(depois.ativa).toBe('aba-C');
  });

  it('fechar a última aba da direita passa a vez à da esquerda', () => {
    const estado = { ...comAbas('A', 'B', 'C'), ativa: 'aba-C' };
    const depois = reduzirAbas(estado, { tipo: 'fechar', id: 'aba-C', vazio: criarAba(ato('vazio')) });

    expect(depois.ativa).toBe('aba-B');
  });

  it('fechar uma aba que não é a ativa não muda quem está na folha', () => {
    const estado = { ...comAbas('A', 'B', 'C'), ativa: 'aba-A' };
    const depois = reduzirAbas(estado, { tipo: 'fechar', id: 'aba-C', vazio: criarAba(ato('vazio')) });

    expect(depois.ativa).toBe('aba-A');
    expect(depois.abas).toHaveLength(2);
  });

  /*
   * A folha é o documento: uma janela sem folha não é tela do editor. Fechar a
   * única aba vale por "Novo".
   */
  it('fechar a única aba põe um ato em branco no lugar, e não deixa a janela sem folha', () => {
    const vazio = criarAba(ato('NOVO DECRETO'), { id: 'aba-nova' });
    const depois = reduzirAbas(comAbas('A'), { tipo: 'fechar', id: 'aba-A', vazio });

    expect(depois.abas).toHaveLength(1);
    expect(depois.ativa).toBe('aba-nova');
    expect(depois.abas[0].doc.title).toBe('NOVO DECRETO');
  });

  it('a alteração de uma aba não toca no documento nem no histórico das outras', () => {
    const estado = comAbas('A', 'B');
    const depois = reduzirAbas(estado, { tipo: 'alterar', id: 'aba-A', doc: ato('A editado') });

    expect(depois.abas[0].doc.title).toBe('A editado');
    expect(depois.abas[0].passado).toHaveLength(1);
    expect(depois.abas[1]).toBe(estado.abas[1]);
  });

  it('desfazer age só sobre a aba pedida', () => {
    let estado = comAbas('A', 'B');
    estado = reduzirAbas(estado, { tipo: 'alterar', id: 'aba-A', doc: ato('A editado') });
    estado = reduzirAbas(estado, { tipo: 'alterar', id: 'aba-B', doc: ato('B editado') });

    const depois = reduzirAbas(estado, { tipo: 'desfazer', id: 'aba-A' });

    expect(depois.abas[0].doc.title).toBe('A');
    expect(depois.abas[1].doc.title).toBe('B editado');
  });

  it('adotar um documento zera o histórico só da aba que o recebeu', () => {
    let estado = comAbas('A', 'B');
    estado = reduzirAbas(estado, { tipo: 'alterar', id: 'aba-A', doc: ato('A editado') });
    estado = reduzirAbas(estado, { tipo: 'alterar', id: 'aba-B', doc: ato('B editado') });

    const depois = reduzirAbas(estado, { tipo: 'adotar', id: 'aba-A', doc: ato('Outro ato') });

    expect(depois.abas[0].passado).toHaveLength(0);
    expect(depois.abas[0].futuro).toHaveLength(0);
    expect(estaSuja(depois.abas[0])).toBe(false);
    expect(depois.abas[1].passado).toHaveLength(1);
  });

  it('a ação sem id age sobre a aba ativa', () => {
    const estado = { ...comAbas('A', 'B'), ativa: 'aba-B' };
    const depois = reduzirAbas(estado, { tipo: 'alterar', doc: ato('B editado') });

    expect(depois.abas[1].doc.title).toBe('B editado');
    expect(depois.abas[0].doc.title).toBe('A');
  });

  describe('marca de trabalho não salvo', () => {
    it('nasce limpa quando o ato veio de um arquivo', () => {
      expect(estaSuja(criarAba(ato('A')))).toBe(false);
    });

    /*
     * Rascunho recuperado é trabalho que nunca chegou a arquivo nenhum: tratá-lo
     * como salvo o faria sumir sem pergunta na primeira troca de documento.
     */
    it('nasce suja quando o ato é rascunho recuperado', () => {
      expect(estaSuja(criarAba(ato('A'), { limpo: false }))).toBe(true);
    });

    it('acende ao alterar e apaga ao salvar', () => {
      let estado = comAbas('A');
      estado = reduzirAbas(estado, { tipo: 'alterar', doc: ato('A editado') });
      expect(estaSuja(abaAtiva(estado))).toBe(true);

      estado = reduzirAbas(estado, { tipo: 'salvo', doc: abaAtiva(estado).doc });
      expect(estaSuja(abaAtiva(estado))).toBe(false);
      expect(abaAtiva(estado).acabouDeSalvar).toBe(true);
    });

    /*
     * Quem salva lê antes o campo com o foco, e essa leitura é um documento novo
     * que não passou por `alterar`. Se a versão limpa não fosse a gravada, a
     * marca continuaria acesa logo depois de salvar.
     */
    it('apaga mesmo quando o que foi gravado é mais novo que o documento da aba', () => {
      let estado = comAbas('A');
      const gravado = ato('A com a última frase digitada');

      estado = reduzirAbas(estado, { tipo: 'salvo', doc: gravado });

      expect(abaAtiva(estado).doc).toBe(gravado);
      expect(estaSuja(abaAtiva(estado))).toBe(false);
    });

    it('lista os atos que têm trabalho a perder', () => {
      let estado = comAbas('A', 'B', 'C');
      estado = reduzirAbas(estado, { tipo: 'alterar', id: 'aba-B', doc: ato('B editado') });

      expect(temTrabalhoASalvar(estado).map((a) => a.id)).toEqual(['aba-B']);
    });
  });

  describe('nome da aba', () => {
    it('é o nome do arquivo quando o ato veio de um', () => {
      const aba = criarAba(ato('DECRETO Nº 13.090'), { arquivo: { nome: 'L15141.htm' } });
      expect(rotuloDaAba(aba)).toBe('L15141.htm');
    });

    it('é o título do ato quando ainda não há arquivo', () => {
      expect(rotuloDaAba(criarAba(ato('DECRETO Nº 13.090')))).toBe('DECRETO Nº 13.090');
    });

    it('recai numa frase legível quando não há nem título nem epígrafe', () => {
      const vazio = { ...ato(''), title: '', epigrafe: '' };
      expect(rotuloDaAba(criarAba(vazio))).toBe('Ato sem título');
    });
  });

  /*
   * A medida provisória de prova tem 1.550 remissões relativas; seguir cada uma
   * com aba nova encheria a tira de cópias do mesmo ato.
   */
  it('reconhece o ato já aberto pelo caminho do arquivo, sem diferenciar caixa', () => {
    const abas = [
      criarAba(ato('A'), { id: 'aba-A', arquivo: { nome: 'a.htm', caminho: '/projeto/Leis/A.htm' } }),
      criarAba(ato('B'), { id: 'aba-B' }),
    ];
    const estado: EstadoDasAbas = { abas, ativa: 'aba-B' };

    expect(abaComArquivo(estado, '/projeto/leis/a.htm')?.id).toBe('aba-A');
    expect(abaComArquivo(estado, '/projeto/Leis/C.htm')).toBeUndefined();
  });
});
