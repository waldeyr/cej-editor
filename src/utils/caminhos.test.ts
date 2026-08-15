import { describe, it, expect } from 'vitest';
import {
  classificarHref,
  hrefDeCaminho,
  nomeDe,
  normalizarCaminho,
  pastaDe,
  relativizar,
  resolverRelativo,
  separarAncora,
} from './caminhos';

/*
 * Os pares reais vêm de docs/file-tests/mpv1286impressao.htm, onde 1.550 das
 * 1.552 remissões são relativas. São eles que dizem se a conta está certa.
 */
const ORIGEM_REAL = '_ato2023-2026/2024/Mpv/mpv1286.htm';

describe('forma do caminho', () => {
  it('troca a barra invertida do Windows pela barra do href', () => {
    expect(pastaDe('C:\\projeto\\Leis\\L1.htm')).toBe('C:/projeto/Leis');
    expect(nomeDe('C:\\projeto\\Leis\\L1.htm')).toBe('L1.htm');
  });

  it('separa a pasta do arquivo, e devolve vazio quando não há pasta', () => {
    expect(pastaDe('a/b/c.htm')).toBe('a/b');
    expect(pastaDe('c.htm')).toBe('');
  });

  it('resolve "." e ".." sem sair da forma POSIX', () => {
    expect(normalizarCaminho('a/./b/../c.htm')).toBe('a/c.htm');
    expect(normalizarCaminho('/a/b/../../c.htm')).toBe('/c.htm');
  });

  /*
   * `..` que sobra à frente é parte do caminho, não erro: quem decide se sair
   * da raiz é problema é quem conhece a raiz.
   */
  it('mantém o ".." que sobra num caminho relativo', () => {
    expect(normalizarCaminho('../../x.htm')).toBe('../../x.htm');
    expect(normalizarCaminho('a/../../x.htm')).toBe('../x.htm');
  });

  it('não deixa um caminho absoluto subir acima da raiz', () => {
    expect(normalizarCaminho('/a/../../x.htm')).toBe('/x.htm');
  });

  it('separa a âncora sem tocar no caminho', () => {
    expect(separarAncora('../L1.htm#art217')).toEqual({ caminho: '../L1.htm', ancora: 'art217' });
    expect(separarAncora('../L1.htm')).toEqual({ caminho: '../L1.htm' });
    expect(separarAncora('#art1')).toEqual({ caminho: '', ancora: 'art1' });
  });
});

describe('seguir uma remissão relativa', () => {
  /*
   * Os `..` contam a partir da PASTA do arquivo de origem, nunca do caminho
   * dele — errar isso desloca o destino em um nível inteiro.
   */
  it('conta o ".." a partir da pasta do ato, e não do arquivo', () => {
    expect(resolverRelativo(ORIGEM_REAL, '../../2025/Lei/L15141.htm')).toBe(
      '_ato2023-2026/2025/Lei/L15141.htm'
    );
  });

  it('chega à raiz do acervo quando o ato sobe três níveis', () => {
    expect(resolverRelativo(ORIGEM_REAL, '../../../LEIS/L9650.htm')).toBe('LEIS/L9650.htm');
    expect(resolverRelativo(ORIGEM_REAL, '../../../Constituicao/Emendas/Emc/emc103.htm')).toBe(
      'Constituicao/Emendas/Emc/emc103.htm'
    );
  });

  it('desce para a subpasta do próprio ato', () => {
    expect(resolverRelativo(ORIGEM_REAL, 'Anexos/MPv1286anexo001a101.htm')).toBe(
      '_ato2023-2026/2024/Mpv/Anexos/MPv1286anexo001a101.htm'
    );
  });

  it('alcança a pasta irmã', () => {
    expect(resolverRelativo(ORIGEM_REAL, '../Exm/Exm-1286-24.pdf')).toBe(
      '_ato2023-2026/2024/Exm/Exm-1286-24.pdf'
    );
  });
});

describe('criar uma remissão a outro ato', () => {
  it('desce para a subpasta sem escrever "./" à frente', () => {
    expect(relativizar('/p/a/c.htm', '/p/a/Anexos/x.htm')).toBe('Anexos/x.htm');
  });

  /*
   * O ato publicado escreve `Anexos/x.htm`, e não `./Anexos/x.htm`: o `./` é
   * ruído que nenhum arquivo do acervo tem.
   */
  it('nomeia direto o arquivo da mesma pasta', () => {
    expect(relativizar('/p/a/c.htm', '/p/a/f.htm')).toBe('f.htm');
  });

  it('sobe até a pasta comum e desce do outro lado', () => {
    expect(relativizar('/p/a/c.htm', '/p/b/e.htm')).toBe('../b/e.htm');
    expect(relativizar('/p/a/b/c.htm', '/p/x/y/z.htm')).toBe('../../x/y/z.htm');
  });

  it('devolve vazio quando origem e destino são o mesmo ato — sobra só a âncora', () => {
    expect(relativizar('/p/a/c.htm', '/p/a/c.htm')).toBe('');
  });

  it('recusa o que não tem caminho relativo possível', () => {
    expect(relativizar('C:/p/a.htm', 'D:/q/b.htm')).toBeNull();
    expect(relativizar('/p/a.htm', 'q/b.htm')).toBeNull();
  });

  /*
   * macOS e Windows não distinguem caixa, e o acervo escreve `LEIS` e `Leis`
   * sem critério; o caminho emitido preserva a caixa real do destino.
   */
  it('reconhece a pasta comum sem diferenciar caixa, e grava a caixa do destino', () => {
    expect(relativizar('/Projeto/leis/a.htm', '/projeto/LEIS/b.htm')).toBe('b.htm');
    expect(relativizar('/projeto/a/x.htm', '/PROJETO/Anexos/y.htm')).toBe('../Anexos/y.htm');
  });

  /*
   * A ida e volta é o teste que prende a conta inteira: relativizar e depois
   * resolver tem de devolver o mesmo arquivo.
   */
  it('vai e volta: resolver o que se relativizou devolve o mesmo arquivo', () => {
    const pares: Array<[string, string]> = [
      ['_ato2023-2026/2024/Mpv/mpv1286.htm', '_ato2023-2026/2025/Lei/L15141.htm'],
      ['_ato2023-2026/2024/Mpv/mpv1286.htm', 'LEIS/L9650.htm'],
      ['_ato2023-2026/2024/Mpv/mpv1286.htm', '_ato2023-2026/2024/Mpv/Anexos/anexo1.htm'],
      ['a/b/c/d.htm', 'a/e.htm'],
      ['x.htm', 'y.htm'],
    ];

    pares.forEach(([origem, destino]) => {
      const relativo = relativizar(origem, destino);
      expect(relativo).not.toBeNull();
      expect(resolverRelativo(origem, relativo!)).toBe(destino);
    });
  });

  it('codifica o espaço do nome do arquivo, e deixa a barra em paz', () => {
    expect(hrefDeCaminho('../Anexos/Anexo I.htm', 'art3')).toBe('../Anexos/Anexo%20I.htm#art3');
    expect(hrefDeCaminho('f.htm')).toBe('f.htm');
  });

  it('não codifica duas vezes o que já veio codificado', () => {
    expect(hrefDeCaminho('../Anexos/Anexo%20I.htm')).toBe('../Anexos/Anexo%20I.htm');
  });
});

describe('classificar o href de um ato aberto', () => {
  it('reconhece o destino dentro do próprio ato', () => {
    expect(classificarHref('#art1')).toEqual({ forma: 'ancora', nome: 'art1' });
  });

  it('reconhece as quatro formas relativas do ato publicado', () => {
    expect(classificarHref('../../2025/Lei/L15141.htm#art217')).toEqual({
      forma: 'relativo',
      caminho: '../../2025/Lei/L15141.htm',
      ancora: 'art217',
    });
    expect(classificarHref('Anexos/MPv1286anexo001a101.htm#anexo1')).toEqual({
      forma: 'relativo',
      caminho: 'Anexos/MPv1286anexo001a101.htm',
      ancora: 'anexo1',
    });
    expect(classificarHref('../Exm/Exm-1286-24.pdf')).toEqual({
      forma: 'relativo',
      caminho: '../Exm/Exm-1286-24.pdf',
    });
  });

  it('não tenta resolver o que é endereço da internet', () => {
    expect(classificarHref('https://www.planalto.gov.br/x.htm')).toMatchObject({
      forma: 'externo',
      protocolo: 'https',
    });
    expect(classificarHref('mailto:cej@planalto.gov.br')).toMatchObject({
      forma: 'externo',
      protocolo: 'mailto',
    });
    expect(classificarHref('//planalto.gov.br/x.htm')).toMatchObject({ forma: 'externo' });
  });

  it('trata o href vazio como ausência de destino', () => {
    expect(classificarHref('')).toEqual({ forma: 'vazio' });
    expect(classificarHref('#')).toEqual({ forma: 'vazio' });
  });
});
