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

describe('ementa', () => {
  /*
   * A ementa não é texto corrido: no arquivo ela é a segunda coluna de uma
   * tabela de duas, e o parágrafo que a contém nunca levou recuo de primeira
   * linha. A folha desenhava um, e era só dela — quem manda é o arquivo.
   */
  it('sai sem recuo de primeira linha, porque é coluna de tabela e não texto corrido', () => {
    const html = serializeToPlanaltoHtml(doc);
    const paragrafo = html.match(/<p align="[^"]*">\s*<span style="[^"]*#800000">[\s\S]*?<\/p>/)?.[0];

    expect(paragrafo).toBeDefined();
    expect(paragrafo).toContain(doc.ementa);
    expect(paragrafo).not.toContain('text-indent');
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

  it('declara a epígrafe como destino padrão de remissão', () => {
    expect(html).toContain('<a name="epigrafe" href="#">');
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

  it('sai em negrito por padrão, como o ato publicado escreve', () => {
    const html = serializeBlockToHtml(capitulo);
    expect(html).toContain('<b><span');
    expect(html).toContain('</span></b>');
  });

  it('cede ao redator que limpou o negrito padrão, do mesmo jeito que a ordem de execução', () => {
    // "Limpar formatação" deixa a marca de sobra mesmo com o texto já puro —
    // ver `markAsPlainFormat`, em `utils/docTargets.ts`.
    const semNegrito: LegislativeBlock = {
      ...capitulo,
      content: '<span data-cej-plain-format="true">DAS DISPOSIÇÕES PRELIMINARES</span>',
    };
    const html = serializeBlockToHtml(semNegrito);

    expect(html).not.toContain('<b>');
    expect(html).toContain('CAPÍTULO 1 - <span data-cej-plain-format="true">DAS DISPOSIÇÕES PRELIMINARES</span>');
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

  it('honra as marcas do gabarito da CEJ, que a minuta em Word traz como texto', () => {
    // O mammoth não escreve a tabela da ementa nem o azul da epígrafe: numa
    // minuta da CEJ salva como .docx, quem diz o que é cada parte são as
    // marcas ##ATO/##EME/##TEX/##APR/##AMI — as mesmas que o leitor de RTF já
    // honrava. E elas são estrutura, não texto: nenhuma pode vazar para o ato.
    const minuta = deserializePlanaltoHtmlToDocument(
      `<html><body>
      <p>##ATO DECRETO Nº 13.090, DE 4 DE AGOSTO DE 2026</p>
      <p>##EME Altera o Decreto nº 11.353, de 1º de janeiro de 2023.</p>
      <p><strong>##TEX O PRESIDENTE DA REPÚBLICA</strong>, no uso da atribuição,</p>
      <p>DECRETA:</p>
      <p>Art. 1º Ficam remanejados os cargos.</p>
      <p>Brasília, 4 de agosto de 2026; 205º da Independência e 138º da República.</p>
      <p>##APR LUIZ INÁCIO LULA DA SILVA</p>
      <p>##AMI Esther Dweck</p>
      </body></html>`
    );

    expect(minuta.epigrafe).toBe('DECRETO Nº 13.090, DE 4 DE AGOSTO DE 2026');
    expect(minuta.ementa).toBe('Altera o Decreto nº 11.353, de 1º de janeiro de 2023.');
    expect(minuta.preambulo).toContain('<strong>O PRESIDENTE DA REPÚBLICA</strong>');
    expect(minuta.assinaturas).toEqual(['LUIZ INÁCIO LULA DA SILVA', 'Esther Dweck']);
    const tudo = JSON.stringify(minuta);
    expect(tudo).not.toContain('##');
  });

  it('centraliza a denominação do agrupador junto com ele', () => {
    /*
     * Parte, Livro, Título, Subtítulo, Capítulo, Seção e Subseção são
     * centralizados, e o título descritivo que os acompanha é a segunda metade
     * do mesmo título — no ato publicado as duas linhas vêm centralizadas. A
     * denominação não casa com forma nenhuma de dispositivo e caía em
     * TEXTO_LIVRE, que nasce justificado e com recuo: o título do capítulo
     * aparecia partido na folha, metade centralizada e metade como corpo.
     */
    const comTitulos = deserializePlanaltoHtmlToDocument(
      `<html><body>
      <p align="center">CAPÍTULO II</p>
      <p align="center">DOS EMPREGADOS REINTEGRADOS AO QUADRO</p>
      <p>Art. 5º Texto do artigo.</p>
      <p align="center">Seção I</p>
      <p align="center">Disposições Gerais</p>
      <p>Art. 6º Outro texto.</p>
      </body></html>`
    );

    const porTexto = (t: string) => comTitulos.blocks.find((b) => b.rawText.startsWith(t));
    // A caixa mista é a forma corrente no acervo — quatro vezes mais frequente
    // que a caixa alta —, e vale tanto quanto ela.
    expect(porTexto('DOS EMPREGADOS')?.align).toBe('center');
    expect(porTexto('Disposições Gerais')?.align).toBe('center');
    // O artigo é corpo do ato: continua justificado.
    expect(porTexto('Texto do artigo')?.align).toBeUndefined();
    // E a denominação não vira agrupador: a hierarquia teria dois capítulos.
    expect(porTexto('DOS EMPREGADOS')?.type).toBe('TEXTO_LIVRE');
  });

  it('não centraliza o que vem depois do agrupador que já traz sua denominação', () => {
    // "CAPÍTULO I - DAS DISPOSIÇÕES" já é o título inteiro, e é assim que este
    // editor o escreve: o parágrafo seguinte é corpo do ato.
    const comDenominacaoJunta = deserializePlanaltoHtmlToDocument(
      `<html><body>
      <p align="center">CAPÍTULO I - DAS DISPOSIÇÕES PRELIMINARES</p>
      <p>ESTE TEXTO EM CAIXA ALTA É CORPO DO ATO</p>
      </body></html>`
    );

    expect(comDenominacaoJunta.blocks[1].align).toBeUndefined();
  });

  it('guarda a repetição da parte fixa como texto do ato, e não a descarta', () => {
    /*
     * A parte fixa existe uma vez só, e só o parágrafo de onde ela saiu é
     * descartado. O ato de verdade repete: o Decreto nº 61.100/1967 escreve a
     * ementa duas vezes (no cabeçalho e como título interno) e a segunda sumia;
     * o Decreto nº 17.464/1926 fecha o ato e mais três anexos, cada um com sua
     * data e seu ministro, e só o último sobrevivia ao `doc.fecho =`.
     */
    const comRepeticao = deserializePlanaltoHtmlToDocument(
      `<html><body>
      <p align="center"><font color="#000080">DECRETO Nº 61.100, DE 28 DE JULHO DE 1967</font></p>
      <table><tr><td><p align="justify"><span>Aprova o Regimento Interno.</span></p></td></tr></table>
      <p>Art. 1º Fica aprovado o Regimento.</p>
      <p>Rio de Janeiro, 28 de julho de 1967; 146º da Independência.</p>
      <p>ARTHUR DA COSTA E SILVA</p>
      <p>ANEXO</p>
      <p>Aprova o Regimento Interno.</p>
      <p>Rio de Janeiro, 28 de julho de 1967. – Annibal Freire da Fonseca.</p>
      </body></html>`
    );

    const textos = comRepeticao.blocks.map((b) => visibleTextOfHtml(b.content));
    expect(comRepeticao.ementa).toBe('Aprova o Regimento Interno.');
    expect(comRepeticao.fecho).toContain('146º da Independência');
    // A segunda ementa e o fecho do anexo são texto do ato, e ficam nele.
    expect(textos.filter((t) => t === 'Aprova o Regimento Interno.')).toHaveLength(1);
    expect(textos.some((t) => t.includes('Annibal Freire da Fonseca'))).toBe(true);
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

  it('tacha o identificador junto com o texto quando o dispositivo inteiro foi marcado como tachado', () => {
    const tachado: LegislativeBlock = {
      id: 'b1',
      type: 'ARTIGO',
      numberLabel: 'Art. 5º',
      content: '<s>Fica revogado o decreto anterior.</s>',
      rawText: 'Fica revogado o decreto anterior.',
      identificadorTachado: true,
    };

    const exportado = serializeToPlanaltoHtml({ ...doc, blocks: [tachado] });
    expect(exportado).toContain('<s>Art. 5º </s>');

    const voltou = deserializePlanaltoHtmlToDocument(exportado).blocks.find(
      (block) => block.type === 'ARTIGO'
    );

    expect(voltou?.numberLabel).toBe('Art. 5º');
    expect(voltou?.identificadorTachado).toBe(true);
    expect(voltou?.content).toContain('<s>Fica revogado o decreto anterior.</s>');
    expect(voltou?.content).not.toContain('<s></s>');
  });

  it.each([
    ['s', '<s>Art. 6º Fica revogado o decreto anterior.</s>'],
    ['strike', '<strike>Art. 7º Fica revogado o decreto anterior.</strike>'],
    ['del', '<del>Art. 8º Fica revogado o decreto anterior.</del>'],
    [
      'text-decoration',
      '<span style="text-decoration: line-through">Art. 9º Fica revogado o decreto anterior.</span>',
    ],
    [
      'text-decoration-line',
      '<span style="TEXT-DECORATION-LINE: line-through">Art. 10º Fica revogado o decreto anterior.</span>',
    ],
  ])('promove o tachado integral do dispositivo ao rótulo (%s)', (_nome, paragrafo) => {
    const importado = deserializePlanaltoHtmlToDocument(`<html><body><p>${paragrafo}</p></body></html>`);
    const artigo = importado.blocks.find((block) => block.type === 'ARTIGO');

    expect(artigo?.identificadorTachado).toBe(true);
    expect(artigo?.numberLabel).toMatch(/^Art\. /);
    expect(visibleTextOfHtml(artigo?.content || '')).toBe('Fica revogado o decreto anterior.');
    expect(artigo?.content).toMatch(/(?:<s>|<strike>|<del>|text-decoration)/i);
  });

  it('não promove o tachado parcial do caput ao rótulo', () => {
    const importado = deserializePlanaltoHtmlToDocument(
      '<html><body><p>Art. 11º Fica <s>parcialmente revogado</s> o decreto anterior.</p></body></html>'
    );
    const artigo = importado.blocks.find((block) => block.type === 'ARTIGO');

    expect(artigo?.identificadorTachado).toBeUndefined();
    expect(artigo?.numberLabel).toBe('Art. 11º');
    expect(artigo?.content).toContain('<s>parcialmente revogado</s>');
  });

  it('promove o tachado quando a marca cobre todo o caput, mesmo sem envolver o rótulo', () => {
    const importado = deserializePlanaltoHtmlToDocument(
      '<html><body><p>Art. 12º <s>Fica revogado o decreto anterior.</s></p></body></html>'
    );
    const artigo = importado.blocks.find((block) => block.type === 'ARTIGO');

    expect(artigo?.identificadorTachado).toBe(true);
    expect(artigo?.numberLabel).toBe('Art. 12º');
    expect(artigo?.content).toContain('<s>Fica revogado o decreto anterior.</s>');
  });

  it('promove o tachado do dispositivo mesmo quando o aviso legal vem depois', () => {
    const importado = deserializePlanaltoHtmlToDocument(
      `<html><body>
      <p><a name="art8iii"></a><strike>III&nbsp;-&nbsp;ascensão;</strike> <a href="L9527.htm#art18">(Revogado pela Lei nº 9.527)</a></p>
      <p><a name="art8iv"></a><strike>IV&nbsp;- transferência;</strike> <strike><a href="resf46.htm">(Execução suspensa)</a></strike> <a href="L9527.htm#art18">(Revogado)</a></p>
      <p><strike><a name="art9ii."></a>II - em comissão, para cargos de confiança.</strike></p>
      </body></html>`
    );
    const incisos = importado.blocks.filter((block) => block.type === 'INCISO');

    expect(incisos).toHaveLength(3);
    expect(incisos.slice(0, 2).every((block) => block.identificadorTachado)).toBe(true);
    expect(incisos[0].content).toContain('<strike>ascensão;</strike>');
    expect(incisos[1].content).toContain('<strike>transferência;</strike>');
    expect(incisos[2].identificadorTachado).toBe(true);
  });

  it('normaliza o ordinal legado escrito como o ou grau', () => {
    const importado = deserializePlanaltoHtmlToDocument(
      '<html><body><p>Art.&nbsp;9<sup><u>o</u></sup>&nbsp;&nbsp;A nomeação far-se-á.</p><p>§ 1° O prazo será contado.</p></body></html>'
    );

    expect(importado.blocks[0].numberLabel).toBe('Art. 9º');
    expect(importado.blocks[1].numberLabel).toBe('§ 1º');
  });

  it('mantém ementa, avisos e publicação consolidada antes do preâmbulo', () => {
    const importado = deserializePlanaltoHtmlToDocument(
      `<html><body>
      <p align="center">LEI Nº 8.112, DE 11 DE DEZEMBRO DE 1990</p>
      <table><tr>
        <td><font size="2"><a href="L8112compilado.htm">Texto compilado</a><br><a href="#art1">Vigência</a><br><a href="L12702.htm">(Vide Lei nº 12.702, de 2012)</a></font></td>
        <td><p align="justify"><font color="#800000"><small>Dispõe sobre o regime jurídico dos servidores.</small></font></p></td>
      </tr></table>
      <p align="center"><strong>PUBLICAÇÃO CONSOLIDADA DA LEI Nº 8.112.</strong></p>
      <p><strong>O PRESIDENTE DA REPÚBLICA</strong> Faço saber que a lei decreta:</p>
      <p>Art. 1o Esta Lei institui o regime.</p>
      </body></html>`
    );
    const html = serializeToPlanaltoHtml(importado);

    expect(visibleTextOfHtml(importado.ementa)).toBe('Dispõe sobre o regime jurídico dos servidores.');
    expect(importado.avisosPreliminares).toContain('Texto compilado');
    expect(importado.avisosPreliminares).toContain('PUBLICAÇÃO CONSOLIDADA');
    expect(importado.blocks.some((block) => block.rawText.startsWith('PUBLICAÇÃO CONSOLIDADA'))).toBe(false);
    // Links à esquerda, ementa à direita, na mesma tabela — a esquerda vem
    // primeiro no markup, mesmo os dois lendo lado a lado na folha.
    expect(html.indexOf('Texto compilado')).toBeLessThan(html.indexOf('Dispõe sobre'));
    expect(html.indexOf('Dispõe sobre')).toBeLessThan(html.indexOf('O PRESIDENTE DA REPÚBLICA'));
  });

  it('sobrevive a uma segunda abertura: os avisos preliminares não se perdem ao reexportar', () => {
    const importado = deserializePlanaltoHtmlToDocument(
      `<html><body>
      <table><tr>
        <td><font size="2"><a href="L8112compilado.htm">Texto compilado</a><br><a href="#art1">Vigência</a></font></td>
        <td><p align="justify"><font color="#800000"><small>Dispõe sobre o regime jurídico dos servidores.</small></font></p></td>
      </tr></table>
      <p><strong>O PRESIDENTE DA REPÚBLICA</strong> Faço saber que a lei decreta:</p>
      <p>Art. 1o Esta Lei institui o regime.</p>
      </body></html>`
    );

    const reaberto = deserializePlanaltoHtmlToDocument(serializeToPlanaltoHtml(importado));

    expect(reaberto.avisosPreliminares).toContain('Texto compilado');
  });

  it('acha a ementa de uma tabela legada sem parágrafo justificado na célula', () => {
    const importado = deserializePlanaltoHtmlToDocument(
      '<html><body><table><tr><td></td><td><span>Aprova o Regimento Interno.</span></td></tr></table></body></html>'
    );

    expect(visibleTextOfHtml(importado.ementa)).toBe('Aprova o Regimento Interno.');
  });

  it('reconhece o tachado do dispositivo com anotações além de "Revogado" e "Execução suspensa"', () => {
    const importado = deserializePlanaltoHtmlToDocument(
      `<html><body>
      <p><a name="art9"></a><strike>Art. 9º Fica extinto o cargo.</strike> <a href="L1.htm">(Vigência encerrada)</a></p>
      <p><a name="art10"></a><strike>Art. 10. O prazo é de trinta dias.</strike> <a href="L2.htm">(Redação suprimida)</a></p>
      </body></html>`
    );

    expect(importado.blocks[0].identificadorTachado).toBe(true);
    expect(importado.blocks[1].identificadorTachado).toBe(true);
  });
});

describe('o anexo se lê depois das assinaturas', () => {
  const comAnexo: LegislativeDocument = {
    ...doc,
    assinaturas: ['LUIZ INÁCIO LULA DA SILVA'],
    blocks: [
      { id: 'b1', type: 'ARTIGO', numberLabel: 'Art. 1º', content: 'Ficam remanejados os cargos.', rawText: 'Ficam remanejados os cargos.' },
      { id: 'b2', type: 'ANEXO', content: 'ANEXO I', rawText: 'ANEXO I' },
      { id: 'b3', type: 'TEXTO_LIVRE', content: 'REMANEJAMENTO DE CARGOS', rawText: 'REMANEJAMENTO DE CARGOS' },
    ],
  };

  const html = serializeToPlanaltoHtml(comAnexo);

  it('escreve o anexo depois do fecho e das assinaturas', () => {
    expect(html.indexOf('Ficam remanejados')).toBeLessThan(html.indexOf('Brasília, 4 de agosto'));
    expect(html.indexOf('LUIZ INÁCIO LULA DA SILVA')).toBeLessThan(html.indexOf('ANEXO I'));
    expect(html.indexOf('ANEXO I')).toBeLessThan(html.indexOf('REMANEJAMENTO DE CARGOS'));
  });

  it('desenha o título do anexo centralizado e em negrito, como o agrupador', () => {
    const anexo = serializeBlockToHtml(comAnexo.blocks[1]);

    expect(anexo).toContain('align="center"');
    expect(anexo).toContain('<b>');
  });

  it('mantém o anexo no fim quando o arquivo exportado é reaberto', () => {
    const voltou = deserializePlanaltoHtmlToDocument(html);
    const tipos = voltou.blocks.map((block) => block.type);

    expect(voltou.assinaturas).toEqual(['LUIZ INÁCIO LULA DA SILVA']);
    // O anexo volta ao fim da lista, que é de onde o serializador o tira.
    expect(tipos.indexOf('ANEXO')).toBe(tipos.length - 2);
    expect(voltou.blocks.at(-1)?.rawText).toBe('REMANEJAMENTO DE CARGOS');
  });

  it('não pendura travessão no anexo que ainda não tem denominação', () => {
    /*
     * É o caminho normal de quem cria um anexo pela barra: o dispositivo nasce
     * vazio (invariante 2) e só depois recebe o nome. Saindo como "ANEXO I - ",
     * ele voltava da releitura como linha sem formatação, e a região inteira do
     * anexo subia para o corpo do ato.
     */
    const semDenominacao: LegislativeDocument = {
      ...comAnexo,
      blocks: [
        comAnexo.blocks[0],
        { id: 'b2', type: 'ANEXO', numberLabel: 'ANEXO I', content: '', rawText: '' },
        comAnexo.blocks[2],
      ],
    };
    const exportado = serializeToPlanaltoHtml(semDenominacao);

    expect(exportado).not.toContain('ANEXO I - <');
    expect(deserializePlanaltoHtmlToDocument(exportado).blocks.some((b) => b.type === 'ANEXO')).toBe(true);
  });

  it('para de recolher assinatura no primeiro parágrafo que não é nome', () => {
    /*
     * As assinaturas são contíguas ao fecho. Sem esse freio, a forma de nome
     * próprio — duas a seis palavras capitalizadas — recolhia meio anexo para a
     * lista de signatários: "Quadro Demonstrativo de Cargos" tem essa forma.
     */
    const lido = deserializePlanaltoHtmlToDocument(
      `<html><body>
        <p>Brasília, 31 de dezembro de 2024.</p>
        <p>LUIZ INÁCIO LULA DA SILVA</p>
        <p>Cristina Kiomi Mori</p>
        <p>Este texto não substitui o publicado no DOU de 31.12.2024.</p>
        <p>Quadro Demonstrativo de Cargos</p>
      </body></html>`
    );

    expect(lido.assinaturas).toEqual(['LUIZ INÁCIO LULA DA SILVA', 'Cristina Kiomi Mori']);
    expect(lido.blocks.some((block) => block.rawText === 'Quadro Demonstrativo de Cargos')).toBe(true);
  });
});

describe('citação do ato alterado', () => {
  const citacao = (blocks: LegislativeBlock[]) => ({ ...doc, blocks });

  it('recolhe a citação inteira nos dois blockquotes, e não só as linhas com aspas', () => {
    /*
     * O papel espelha o arquivo (invariante 1): os dois `<blockquote>` de 40px
     * são os 80px de recuo que a folha desenha. O inciso citado saía daqui num
     * `<p class="MsoNormal">` solto, na margem do ato alterador.
     */
    const exportado = serializeToPlanaltoHtml(
      citacao([
        { id: 'b1', type: 'ALTERACAO', numberLabel: 'Art. 5º', content: '', rawText: '', citacao: 'abre' },
        { id: 'b2', type: 'INCISO', numberLabel: 'I -', content: 'dirigir;', rawText: 'dirigir;', citacao: 'meio' },
        {
          id: 'b3',
          type: 'INCISO',
          numberLabel: 'II -',
          content: 'representar.',
          rawText: 'representar.',
          citacao: 'fecha',
          novaRedacao: true,
        },
      ])
    );

    expect(exportado.match(/<blockquote>\s*<blockquote>/g)).toHaveLength(3);
    // As aspas só nas pontas, como as escreve o ato publicado.
    expect(exportado.match(/“/g)).toHaveLength(1);
    expect(exportado.match(/”/g)).toHaveLength(1);
    // O "(NR)" fecha o dispositivo alterado depois das aspas (Decreto nº
    // 12.002/2024, art. 14, I).
    expect(exportado).toContain('representar.” (NR)');
  });

  it('devolve a citação inteira na releitura, e não apenas as pontas', () => {
    const blocks: LegislativeBlock[] = [
      { id: 'b1', type: 'ARTIGO', numberLabel: 'Art. 1º', content: 'O Decreto passa a vigorar:', rawText: '' },
      { id: 'b2', type: 'ALTERACAO', numberLabel: 'Art. 5º', content: 'Compete:', rawText: '', citacao: 'abre' },
      { id: 'b3', type: 'INCISO', numberLabel: 'I -', content: 'dirigir;', rawText: '', citacao: 'meio' },
      { id: 'b4', type: 'OMISSIS', content: '..........................', rawText: '', citacao: 'meio' },
      {
        id: 'b5',
        type: 'INCISO',
        numberLabel: 'II -',
        content: 'representar.',
        rawText: '',
        citacao: 'fecha',
        novaRedacao: true,
      },
      { id: 'b6', type: 'ARTIGO', numberLabel: 'Art. 2º', content: 'Entra em vigor.', rawText: '' },
    ];
    const lido = deserializePlanaltoHtmlToDocument(serializeToPlanaltoHtml(citacao(blocks)));

    expect(lido.blocks.map((bloco) => bloco.citacao)).toEqual([
      undefined,
      'abre',
      'meio',
      'meio',
      'fecha',
      undefined,
    ]);
  });

  it('não recolhe a tabela citada, que já ocupa a largura da folha', () => {
    const html = serializeBlockToHtml({
      id: 'b1',
      type: 'TABELA',
      content: '<table><tbody><tr><td>CCE 1.15</td></tr></tbody></table>',
      rawText: 'Tabela',
      citacao: 'meio',
    });

    expect(html).not.toContain('<blockquote>');
  });
});
