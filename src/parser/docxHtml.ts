import { LegislativeDocument } from '../types/legislative';
import { htmlToPlainText } from '../utils/docTargets';

/**
 * O HTML que o mammoth devolve, arrumado para o leitor legislativo.
 *
 * O `.docx` entra pelo mesmo leitor do ato publicado no Planalto — e o mammoth
 * não escreve o padrão Planalto: escreve HTML genérico, feito para um navegador
 * qualquer. O leitor procura `<p>`, `<h1>`…`<h6>` e `table.MsoTableGrid`; tudo
 * o que o mammoth entrega fora dessas formas nunca era visitado e sumia sem
 * aviso. Este módulo faz a tradução, e é aqui que ela deve ficar: mexer no
 * seletor do leitor para acolher o mammoth estragaria a leitura do corpus
 * publicado, onde `<table>` sem classe é tabela de diagramação, e não do ato.
 *
 * O que se perdia, medido num `.docx` de prova:
 *
 *   · **a lista inteira** — o Word numera incisos e alíneas automaticamente, e
 *     o mammoth os entrega em `<li>`, que não está no seletor;
 *   · **toda tabela** — sem `class="MsoTableGrid"`, o `<table>` não vira bloco
 *     de tabela, e o texto das células chegava como dispositivos soltos, um por
 *     célula, com linhas e colunas desfeitas para sempre;
 *   · **a ementa**, procurada por marcação que o mammoth não escreve.
 */

/** O que a preparação teve de descartar, para que a barra de estado conte. */
export interface PreparoDoDocx {
  html: string;
  /** Comentários de revisão do Word: anotação sobre a minuta, não o ato. */
  comentariosDescartados: number;
}

export function prepararHtmlDoDocx(html: string): PreparoDoDocx {
  /*
   * A arrumação passa pelo DOM, e não por expressão regular sobre a marcação.
   * O motivo é a tabela dentro da célula de outra tabela: carimbando por
   * expressão regular, a de dentro também recebia a classe, virava um segundo
   * bloco de tabela e o conteúdo dela entrava no ato duas vezes. Aninhamento é
   * justamente o que uma expressão regular não sabe ver.
   */
  const documento = new DOMParser().parseFromString(html, 'text/html');
  let comentariosDescartados = 0;

  // Comentários de revisão do Word: anotação sobre a minuta, não o ato.
  documento.querySelectorAll('dt').forEach((termo) => {
    comentariosDescartados += 1;
    termo.remove();
  });
  documento.querySelectorAll('dl, dd').forEach((no) => no.replaceWith(...Array.from(no.childNodes)));

  // Só a tabela mais externa vira bloco; a de dentro segue como marcação dela.
  documento.querySelectorAll('table').forEach((tabela) => {
    if (tabela.parentElement?.closest('table')) return;
    if (!tabela.className) tabela.className = 'MsoTableGrid';
  });

  /*
   * O item de lista vira parágrafo. O texto mora direto no `<li>`, sem `<p>`
   * dentro, então trocar a etiqueta é o bastante — e a numeração automática do
   * Word não vem no HTML de qualquer modo: quem numera o dispositivo é este
   * editor, a partir da posição dele (ver `utils/blockTypes.ts`).
   */
  documento.querySelectorAll('li').forEach((item) => {
    const paragrafo = documento.createElement('p');
    // Os nós vão inteiros para o parágrafo novo, sem passar por texto: assim o
    // negrito e a remissão de dentro do item sobrevivem à troca de etiqueta.
    paragrafo.append(...Array.from(item.childNodes));
    item.replaceWith(paragrafo);
  });
  documento.querySelectorAll('ol, ul').forEach((lista) =>
    lista.replaceWith(...Array.from(lista.childNodes))
  );

  return { html: documento.body.innerHTML, comentariosDescartados };
}

/** Começo de ementa, na forma que a técnica legislativa usa. */
const ABERTURA_DE_EMENTA = /^(Altera|Dispõe|Aprova|Institui|Regulamenta|Revoga|Cria|Estabelece)\b/i;

/**
 * Preenche a ementa quando a marcação não a entrega.
 *
 * No ato publicado a ementa é a segunda coluna de uma tabela, e é por ela que o
 * leitor a acha. O `.docx` não tem essa tabela: a ementa é um parágrafo comum
 * logo depois da epígrafe, e o campo ficava **sempre vazio** na importação de
 * Word — com o texto da ementa sobrando na folha como se fosse dispositivo.
 */
export function completarEmentaDoDocx(doc: LegislativeDocument): LegislativeDocument {
  if (doc.ementa.trim()) return doc;

  const indice = doc.blocks.findIndex((bloco) => {
    /*
     * Só um parágrafo sem tipo e sem rótulo pode ser a ementa. Sem essa
     * ressalva, um ato cujo art. 1º começa em "Aprova o Regimento Interno…" —
     * forma corrente — tinha o artigo **apagado** da lista e promovido a
     * ementa: perda de dispositivo por uma heurística de duas palavras.
     */
    if (bloco.type !== 'TEXTO_LIVRE' || bloco.numberLabel) return false;
    return ABERTURA_DE_EMENTA.test(htmlToPlainText(bloco.content));
  });

  // Ementa vem antes da articulação: adiante do terceiro parágrafo já é o ato.
  if (indice === -1 || indice > 2) return doc;

  return {
    ...doc,
    ementa: htmlToPlainText(doc.blocks[indice].content),
    blocks: doc.blocks.filter((_, posicao) => posicao !== indice),
  };
}
