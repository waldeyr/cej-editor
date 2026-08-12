import { describe, it, expect } from 'vitest';
import { sanitizeInlineHtml, stripVisibleEdges, visibleTextOfHtml } from './inlineHtml';

describe('texto visível do HTML', () => {
  it('reduz a um só os espaços seguidos, e não conta os das pontas', () => {
    expect(visibleTextOfHtml('  <span>Art. 1º&nbsp;  Esta\n\tMedida</span> ')).toBe('Art. 1º Esta Medida');
  });

  it('lê o texto que está dentro das etiquetas, e não as etiquetas', () => {
    expect(visibleTextOfHtml('<a name="art1"></a><b>Fica</b> criado o cargo.')).toBe('Fica criado o cargo.');
  });
});

describe('limpeza do HTML do dispositivo', () => {
  it('deixa passar a remissão, o ponto de ancoragem e a formatação do ato', () => {
    const limpo = sanitizeInlineHtml(
      '<a name="art5"></a>Ver a <a href="#art2">Lei</a>, <b>na forma</b> do <font color="#000080" face="Arial">anexo</font>.'
    );

    expect(limpo).toContain('<a name="art5">');
    expect(limpo).toContain('<a href="#art2">');
    expect(limpo).toContain('<b>na forma</b>');
    expect(limpo).toContain('<font color="#000080" face="Arial">');
  });

  /*
   * O conteúdo importado vai para o `contentEditable` por `innerHTML`, e o
   * arquivo pode ter vindo de qualquer lugar — do disco ou de um endereço da
   * internet. Por isso a limpeza é por lista de permissão.
   */
  it('recusa o que não é ato: script, imagem, manipulador de evento e endereço executável', () => {
    const limpo = sanitizeInlineHtml(
      'Texto <script>roubar()</script><img src="x" onerror="roubar()"> com <b onclick="roubar()">negrito</b> e <a href="javascript:roubar()">link</a>.'
    );

    expect(limpo).not.toContain('script');
    expect(limpo).not.toContain('onerror');
    expect(limpo).not.toContain('onclick');
    expect(limpo).not.toContain('javascript:');
    expect(limpo).toContain('<b>negrito</b>');
    expect(visibleTextOfHtml(limpo)).toBe('Texto com negrito e link.');
  });
});

describe('recorte do rótulo e das aspas', () => {
  /*
   * O ponto de ancoragem do ato publicado vem antes do rótulo, dentro do mesmo
   * parágrafo — `<a name="art1"></a>Art. 1º`. Ele é o destino de todas as
   * remissões ao artigo: recortar o rótulo não pode levá-lo junto.
   */
  it('tira o rótulo da frente e conserva a âncora que vinha antes dele', () => {
    const paragrafo = '<span><a name="art1"></a>Art. 1º Esta Medida Provisória:</span>';

    expect(stripVisibleEdges(paragrafo, 'Art. 1º '.length, 0)).toBe(
      '<span><a name="art1"></a>Esta Medida Provisória:</span>'
    );
  });

  it('tira as aspas da citação nas duas pontas, guardando o que está entre elas', () => {
    const citacao = '“Art. 5º <b>Fica</b> revogado.” (NR)';

    expect(stripVisibleEdges(citacao, 1, '” (NR)'.length)).toBe('Art. 5º <b>Fica</b> revogado.');
  });
});
