import { describe, it, expect } from 'vitest';
import { LegislativeBlock, LegislativeDocument } from '../types/legislative';
import {
  deserializePlanaltoHtmlToDocument,
  serializeBlockToHtml,
  serializeToPlanaltoHtml,
} from './htmlSerializer';
import { visibleTextOfHtml } from './inlineHtml';

const doc: LegislativeDocument = {
  title: 'DECRETO Nº 13.090',
  epigrafe: 'DECRETO Nº 13.090',
  ementa: 'Altera o Decreto nº 11.353.',
  preambulo: '<b>O PRESIDENTE DA REPÚBLICA</b>, no uso da atribuição que lhe confere o art. 84, da Constituição,',
  ordemExecucao: '<b>DECRETA</b>:',
  blocks: [],
  fecho: 'Brasília, 4 de agosto de 2026.',
  assinaturas: [],
};

/** O parágrafo da ordem de execução no HTML exportado. */
const ordemExecucaoParagraph = (html: string): string => {
  const paragraphs = html.match(/<p class="Textbody0"[\s\S]*?<\/p>/g) || [];
  return paragraphs.find((p) => p.includes('DECRETA')) || '';
};

describe('ordem de execução', () => {
  /*
   * A ordem de execução fecha a frase aberta pelo preâmbulo e acompanha o
   * parágrafo que a antecede — é o que faz o ato de referência em
   * temp/d13090.html, e o que o editor mostra na folha.
   */
  it('sai justificada e recuada como o preâmbulo, e não centralizada', () => {
    const paragraph = ordemExecucaoParagraph(serializeToPlanaltoHtml(doc));

    expect(paragraph).toContain('text-align: justify');
    expect(paragraph).toContain('text-indent: 38px');
    expect(paragraph).not.toContain('text-align: center');
  });

  it('cede à escolha do usuário na barra de comandos', () => {
    const centered = { ...doc, partAligns: { 'part:ordemExecucao': 'center' as const } };
    const paragraph = ordemExecucaoParagraph(serializeToPlanaltoHtml(centered));

    expect(paragraph).toContain('text-align: center');
    expect(paragraph).toContain('text-indent: 0');
  });
});

/*
 * A remissão precisa parecer uma remissão em qualquer ato aberto, inclusive nos
 * que trazem a cor por dentro do link — herança do corpus legado do Planalto.
 */
describe('tinta das remissões', () => {
  const html = serializeToPlanaltoHtml(doc);

  it('pinta também o que estiver dentro do link, que é onde a cor legada mora', () => {
    expect(html).toContain('a[href], a[href] * { color: #0000ee !important; }');
    expect(html).toContain('a[href] { text-decoration: underline; }');
  });

  it('deixa a epígrafe no azul-marinho do padrão Planalto', () => {
    expect(html).toContain('style="color: #000080 !important"');
  });
});

/*
 * No agrupador o rótulo e a denominação são uma linha só. Desde que a conversão
 * deixou de escrever o número dentro do conteúdo — formatar não escreve —, é
 * aqui que os dois se reúnem, e o arquivo salvo tem de continuar saindo com a
 * mesma linha de sempre.
 */
describe('denominação do agrupador', () => {
  const capitulo: LegislativeBlock = {
    id: 'b1',
    type: 'CAPITULO',
    numberLabel: 'CAPÍTULO 1',
    content: 'DAS DISPOSIÇÕES PRELIMINARES',
    rawText: 'DAS DISPOSIÇÕES PRELIMINARES',
  };

  it('reúne o rótulo e a denominação numa linha só', () => {
    expect(serializeBlockToHtml(capitulo)).toContain('CAPÍTULO 1 - DAS DISPOSIÇÕES PRELIMINARES');
  });

  it('não inventa travessão no agrupador que veio do arquivo com o número no texto', () => {
    const importado = { ...capitulo, numberLabel: undefined, content: 'CAPÍTULO II - DAS COMPETÊNCIAS' };
    const html = serializeBlockToHtml(importado);

    expect(html).toContain('>CAPÍTULO II - DAS COMPETÊNCIAS<');
    expect(html).not.toContain('- CAPÍTULO II');
  });
});

/*
 * Abrir um ato publicado trazia só o texto do parágrafo, e com ele ficavam no
 * arquivo as remissões, os pontos de ancoragem e o negrito: a medida provisória
 * de docs/file-tests perdia 1.684 links e 217 âncoras ao ser aberta. O que se
 * guarda agora é o HTML de dentro do parágrafo — ver parser/inlineHtml.ts.
 */
describe('abertura de ato publicado', () => {
  const arquivo = `<html><body>
  <p align="center"><font color="#808000"><strong>Presidência da República<br>Casa Civil</strong></font></p>
  <p align="center"><font color="#000080" face="Arial"><strong><a href="http://www.planalto.gov.br/mpv1286.htm">MEDIDA PROVISÓRIA Nº 1.286, DE 31 DE DEZEMBRO DE 2024</a></strong></font></p>
  <table><tr><td><p align="justify"><span style="font-size: 10.0pt; font-family: Arial,sans-serif; color: #800000">Cria a Carreira de Desenvolvimento Socioeconômico.</span></p></td></tr></table>
  <p><span style="font-size:10.0pt"><a name="art1"></a>Art. 1º&nbsp; Esta Medida Provisória altera a <a href="#art2">Lei nº 14.204</a>, <b>na forma</b> deste ato.</span></p>
  </body></html>`;

  const reaberto = deserializePlanaltoHtmlToDocument(arquivo);
  const artigo = reaberto.blocks.find((block) => block.type === 'ARTIGO');

  it('guarda a remissão e o ponto de ancoragem que estavam dentro do dispositivo', () => {
    expect(artigo?.content).toContain('<a name="art1">');
    expect(artigo?.content).toContain('href="#art2"');
    expect(artigo?.content).toContain('<b>na forma</b>');
  });

  it('recorta do conteúdo o rótulo que virou numberLabel, e só ele', () => {
    expect(artigo?.numberLabel).toBe('Art. 1º');
    expect(visibleTextOfHtml(artigo?.content || '')).toBe(
      'Esta Medida Provisória altera a Lei nº 14.204, na forma deste ato.'
    );
  });

  it('reconhece a epígrafe do ato, e não o cabeçalho do brasão', () => {
    expect(reaberto.epigrafe).toBe('MEDIDA PROVISÓRIA Nº 1.286, DE 31 DE DEZEMBRO DE 2024');
    expect(reaberto.blocks.some((block) => block.rawText.includes('Casa Civil'))).toBe(false);
  });

  it('não repete como dispositivo o parágrafo de onde saiu a epígrafe ou a ementa', () => {
    expect(reaberto.blocks.some((block) => block.rawText.includes('MEDIDA PROVISÓRIA Nº 1.286'))).toBe(false);
    expect(reaberto.blocks.some((block) => block.rawText.includes(reaberto.ementa))).toBe(false);
  });

  it('não deixa entrar no ato o que não é ato', () => {
    const hostil = deserializePlanaltoHtmlToDocument(
      '<html><body><p>Art. 1º Texto <script>roubar()</script><img src="x" onerror="roubar()"> do ato.</p></body></html>'
    );

    expect(hostil.blocks[0].content).toBe('Texto do ato.');
  });

  it('lê o agrupador que o ato publicado escreve como título de seção', () => {
    const comTitulos = deserializePlanaltoHtmlToDocument(
      '<html><body><h2><a name="cap9"></a>CAPÍTULO IX</h2><p>DA CARREIRA DE ESPECIALISTA</p></body></html>'
    );

    expect(comTitulos.blocks[0].type).toBe('TITULO_AGRUPADOR');
    expect(comTitulos.blocks[0].content).toContain('<a name="cap9">');
  });

  it('só toma por assinatura a linha em maiúsculas que vem depois do fecho', () => {
    const comFecho = deserializePlanaltoHtmlToDocument(
      '<html><body><p>DISPOSIÇÕES FINAIS</p><p>Brasília, 31 de dezembro de 2024.</p><p>LUIZ INÁCIO LULA DA SILVA</p></body></html>'
    );

    expect(comFecho.assinaturas).toEqual(['LUIZ INÁCIO LULA DA SILVA']);
    expect(comFecho.blocks.some((block) => block.rawText === 'DISPOSIÇÕES FINAIS')).toBe(true);
  });

  it('devolve o dispositivo inteiro quando o arquivo exportado é reaberto', () => {
    const exportado = serializeToPlanaltoHtml({ ...doc, blocks: artigo ? [artigo] : [] });
    const voltou = deserializePlanaltoHtmlToDocument(exportado).blocks.find(
      (block) => block.type === 'ARTIGO'
    );

    expect(voltou?.numberLabel).toBe('Art. 1º');
    expect(voltou?.content).toContain('<a name="art1">');
    expect(voltou?.content).toContain('href="#art2"');
  });
});
