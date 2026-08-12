import { LegislativeDocument, LegislativeBlock } from '../types/legislative';
import { isAgrupador } from '../utils/rank';
import { LINK_INK, LINK_INK_HOVER } from '../utils/anchors';
import {
  assinaturaTarget,
  defaultAlignForBlockType,
  indentForAlign,
  resolvedAlignForTarget,
} from '../utils/docTargets';
import { EPIGRAFE_PATTERN, identifyBlockType } from './rtfParser';
import { sanitizeInlineHtml, stripVisibleEdges, visibleTextOfHtml } from './inlineHtml';

/**
 * Serializa a AST do Documento Legislativo para a string HTML padrão Planalto (temp/d13090.html).
 */
export function serializeToPlanaltoHtml(doc: LegislativeDocument): string {
  /*
   * A ordem de execução sai em negrito no padrão Planalto, mas o texto agora
   * carrega a própria formatação: só recebe o negrito quem chega sem etiqueta
   * alguma — a mesma regra que a tela aplica, para que as duas não divirjam.
   */
  const plainOrderMatch = doc.ordemExecucao.match(/^<span data-cej-plain-format="true">([\s\S]*)<\/span>$/i);
  const ordemExecucaoHtml = plainOrderMatch ? plainOrderMatch[1] : doc.ordemExecucao;
  const ordemExecucaoIsPlain = plainOrderMatch !== null || /<[a-z][^>]*>/i.test(doc.ordemExecucao);
  const ordemExecucaoPrefix = ordemExecucaoIsPlain ? '' : '<b>';
  const ordemExecucaoSuffix = ordemExecucaoIsPlain ? '' : '</b>';

  /*
   * Os alinhamentos vêm de utils/docTargets.ts — os mesmos que a folha na tela
   * consulta. Epígrafe, fecho e assinaturas saem centralizados; ementa,
   * preâmbulo, ordem de execução e dispositivos, justificados. Qualquer
   * escolha do usuário na barra de comandos sobrepõe o padrão e chega até aqui.
   */
  const epigrafeAlign = resolvedAlignForTarget(doc, 'part:epigrafe');
  const ementaAlign = resolvedAlignForTarget(doc, 'part:ementa');
  const preambuloAlign = resolvedAlignForTarget(doc, 'part:preambulo');
  const ordemExecucaoAlign = resolvedAlignForTarget(doc, 'part:ordemExecucao');
  const fechoAlign = resolvedAlignForTarget(doc, 'part:fecho');

  const coatOfArmsSvg = `
		<div align="center">
			<table border="0" cellpadding="0" cellspacing="0" width="70%">
				<tbody><tr>
					<td width="14%">
						<p align="left">
              <img src="https://www.planalto.gov.br/ccivil_03/LEIS/QUADRO/Brastra.gif" alt="Brasão da República" width="74" height="82">
					</p></td>
					<td width="86%">
						<p align="center">
							<font color="#808000" face="Arial">
								<strong>
									<big><big>Presidência da República</big></big><br>
									<big>Casa Civil</big><br>
									Secretaria Especial para Assuntos Jurídicos
								</strong>
							</font>
					</p></td>
				</tr>
			</tbody></table>
		</div>`;

  /*
   * A epígrafe é remissão ao próprio ato e guarda o azul-marinho do padrão
   * Planalto, mais escuro que o das demais remissões. O estilo embutido é o que
   * a mantém assim: a folha de estilo abaixo pinta todo link com a tinta de
   * remissão, inclusive por dentro, e sem esta marca a epígrafe mudaria de cor
   * no arquivo salvo — e deixaria de espelhar a que o editor mostra na folha.
   */
  const epigrafeHtml = `
		<p align="${epigrafeAlign}" style="margin-top: 13px; margin-bottom: 13px">
			<font color="#000080" face="Arial">
				<small>
					<strong>
						<a href="#">
							<font color="#000080" style="color: #000080 !important">${doc.epigrafe}</font></a></strong></small></font></p>`;

  const ementaHtml = `
	<table border="0" cellpadding="0" cellspacing="0" width="100%">
		<tbody><tr>
			<td width="50%">
  					<font face="Arial" size="2"><a href="#art1">Vigência</a></font></td>
			<td width="50%">
	<p align="${ementaAlign}">
	<span style="font-size: 10.0pt; font-family: Arial,sans-serif; color: #800000">
	${doc.ementa}</span></p></td>
		</tr>
	</tbody></table>`;

  const preambuloHtml = `
	<p class="Textbody0" style="text-align: ${preambuloAlign}; text-indent: ${indentForAlign(preambuloAlign)}; margin-left: 0cm; margin-right: -.05pt; margin-top: 15px; margin-bottom: 15px">
	<span style="font-size:10.0pt;font-family:&quot;Arial&quot;,sans-serif">${doc.preambulo}</span></p>
	<p class="Textbody0" style="text-align: ${ordemExecucaoAlign}; text-indent: ${indentForAlign(ordemExecucaoAlign)}; margin-left: 0cm; margin-right: -.05pt; margin-top: 15px; margin-bottom: 15px">
  ${ordemExecucaoPrefix}<span style="font-size:10.0pt;font-family:&quot;Arial&quot;,sans-serif">${ordemExecucaoHtml}</span>${ordemExecucaoSuffix}</p>`;

  const blocksHtml = doc.blocks
    .map((block) => serializeBlockToHtml(block))
    .join('\n');

  const fechoHtml = `
	<p class="MsoNormal" style="text-align: ${fechoAlign}; text-indent: ${indentForAlign(fechoAlign)}; line-height: normal; margin-top: 15px; margin-bottom: 15px">
	<span style="font-size:10.0pt;font-family:&quot;Arial&quot;,sans-serif;color:black">${doc.fecho}</span></p>`;

  const assinaturasHtml = doc.assinaturas
    .map((ass, index) => {
      const align = resolvedAlignForTarget(doc, assinaturaTarget(index));
      return `
	<p class="MsoNormal" style="text-align: ${align}; text-indent: ${indentForAlign(align)}; line-height: normal; margin-top: 15px; margin-bottom: 15px">
	<span style="font-size:10.0pt;font-family:&quot;Arial&quot;,sans-serif;color:black"><b>${ass}</b></span></p>`;
    })
    .join('\n');

  const charset = doc.declaredEncoding || (doc.encoding === 'windows-1252' ? 'ISO-8859-1' : doc.encoding || 'utf-8');

  return `<html><head>
<meta http-equiv="content-type" content="text/html; charset=${charset}">
<title>${doc.title}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 10pt; line-height: 1.5; color: black; margin: 20px; }
  table.MsoNormalTable { font-size: 10.0pt; font-family: "Times New Roman", serif; }
  table, table td, table th, table font { font-family: Arial, sans-serif !important; font-size: 10.0pt !important; }
  p.MsoNormal, p.Textbody0 { text-align: justify; text-indent: 38px; margin-top: 15px; margin-bottom: 15px; }
  blockquote { margin-left: 40px; margin-right: 40px; }
  /*
    Só a remissão é link. O ponto de ancoragem é destino: sai como texto comum.

    A regra alcança os descendentes do <a> porque o corpus legado guarda a cor por
    dentro do link — <a href="…"><font color="…">texto</font></a> — e sem isso a
    remissão sairia da cor que o arquivo antigo tinha, e não da cor de um link.
    É a mesma regra que src/index.css aplica à folha do editor.
  */
  a[href], a[href] * { color: ${LINK_INK} !important; }
  a[href] { text-decoration: underline; }
  a[href]:hover, a[href]:hover * { color: ${LINK_INK_HOVER} !important; }
</style>
</head>
<body>
	<blockquote>
${coatOfArmsSvg}
${epigrafeHtml}
	</blockquote>
${ementaHtml}
${preambuloHtml}
${blocksHtml}
${fechoHtml}
${assinaturasHtml}
</body></html>`;
}

/**
 * Serializa um bloco individual para HTML.
 */
export function serializeBlockToHtml(block: LegislativeBlock): string {
  /*
   * Marca de destino da remissão. Ela acompanha todo dispositivo que tenha
   * nome de âncora, inclusive tabelas e citações: um anexo costuma ser uma
   * tabela, e é justamente para ele que os artigos remetem — sem a marca aqui,
   * o link nasceria apontando para um lugar que o arquivo salvo não conhece.
   */
  const anchor = block.linkName ? `<a name="${block.linkName}"></a>` : '';
  const labelPrefix = block.numberLabel ? `${block.numberLabel} ` : '';
  const align = block.align || defaultAlignForBlockType(block.type);
  const indent = indentForAlign(align);

  if (block.type === 'TABELA') {
    return `\t<div align="center" style="margin-top: 15px; margin-bottom: 15px" data-block-id="${block.id}">${anchor}\n${block.content}\n\t</div>`;
  }

  if (block.type === 'ALTERACAO') {
    return `\t<blockquote data-block-id="${block.id}">
\t\t<blockquote>
\t\t\t<p class="Textbody0" style="text-align: ${align}; text-indent: ${indent}; vertical-align: baseline; margin-right: 0cm; margin-top: 15px; margin-bottom: 15px">
\t\t\t<span style="font-size:10.0pt;font-family:&quot;Arial&quot;,sans-serif">${anchor}“${labelPrefix}${block.content}”</span></p>
\t\t</blockquote>
\t</blockquote>`;
  }

  /*
   * Agrupadores (Parte, Livro, Título, Capítulo, Seção…) saem centralizados e
   * em negrito, como aparecem na tela. Antes, apenas TITULO_AGRUPADOR recebia
   * esse tratamento: os demais eram exportados como parágrafo justificado e com
   * o rótulo repetido, já que a denominação completa está no próprio conteúdo.
   */
  if (isAgrupador(block.type)) {
    /*
     * "CAPÍTULO I - DAS DISPOSIÇÕES" é uma linha só, e é assim que ela sai
     * daqui. O travessão separa o rótulo da denominação: no agrupador o número
     * é lido junto com o nome, e não como o "Art. 1º" que abre um parágrafo.
     * O que vem do arquivo importado traz a denominação inteira no conteúdo e
     * rótulo nenhum — nesse caso não há o que prefixar.
     */
    const denominacao = block.numberLabel ? `${block.numberLabel} - ` : '';
    return `\t<p align="${align}" style="margin-top: 20px; margin-bottom: 10px" data-block-id="${block.id}">
\t\t<b><span style="font-size:10.0pt;font-family:&quot;Arial&quot;,sans-serif;color:black">${anchor}${denominacao}${block.content}</span></b></p>`;
  }

  return `\t<p class="MsoNormal" style="text-align: ${align}; text-indent: ${indent}; line-height: normal; margin-top: 15px; margin-bottom: 15px" data-block-id="${block.id}">
\t<span style="font-size:10.0pt;font-family:&quot;Arial&quot;,sans-serif;color:black">${anchor}${labelPrefix}${block.content}</span></p>`;
}

/** Texto de uma linha só: é assim que as partes fixas do ato são guardadas. */
function textoCorrido(texto: string | null | undefined): string {
  return (texto || '').replace(/\s+/g, ' ').trim();
}

/**
 * Acha a epígrafe num arquivo publicado.
 *
 * O cabeçalho do brasão — "Presidência da República / Casa Civil / Secretaria
 * Especial para Assuntos Jurídicos" — é, como a epígrafe, um parágrafo
 * centralizado e colorido, e vinha sendo tomado por ela em todo ato aberto do
 * disco. Por isso a ordem: primeiro o azul-marinho que o padrão Planalto reserva
 * à epígrafe (e que este editor escreve), depois a forma da epígrafe em si, e só
 * então os parágrafos centralizados; o cabeçalho é recusado em qualquer caso.
 */
function acharEpigrafeNoDom(parsedDoc: Document): string {
  const candidatos = [
    () => parsedDoc.querySelector('p[align="center"] font[color="#000080" i]'),
    () =>
      Array.from(parsedDoc.querySelectorAll('p')).find((p) =>
        EPIGRAFE_PATTERN.test(textoCorrido(p.textContent))
      ) || null,
    () => parsedDoc.querySelector('p[align="center"] a font'),
    () => parsedDoc.querySelector('p[align="center"] font'),
  ];

  for (const candidato of candidatos) {
    const texto = textoCorrido(candidato()?.textContent);
    if (texto && !texto.includes('Presidência da República')) return texto;
  }

  return '';
}

/**
 * Absorve um parágrafo do arquivo: parte fixa do ato ou dispositivo.
 *
 * Os dois caminhos de leitura — DOMParser no navegador, expressão regular no
 * Node — chamam esta função com o HTML de dentro do `<p>`, e é isso que os
 * mantém dizendo a mesma coisa: a classificação legislativa, a filtragem do
 * cabeçalho e o recorte do rótulo acontecem uma vez só.
 *
 * O conteúdo guardado é HTML, e não texto: é dentro do parágrafo que moram a
 * remissão, o ponto de ancoragem e o negrito do ato publicado.
 */
function absorverParagrafo(doc: LegislativeDocument, interiorBruto: string, indice: number): void {
  const interior = sanitizeInlineHtml(interiorBruto);
  const texto = visibleTextOfHtml(interior);

  if (!texto || texto.includes('Presidência da República')) return;

  // A epígrafe e a ementa já têm campo próprio na folha; sem esta guarda, o
  // parágrafo de onde saíram voltava a aparecer como dispositivo, e o ato
  // abria com a ementa escrita duas vezes.
  if (doc.epigrafe && texto.includes(doc.epigrafe)) return;
  if (doc.ementa && texto.includes(doc.ementa)) return;

  if (texto.includes('PRESIDENTE DA REPÚBLICA') && !doc.preambulo) {
    // O negrito da autoridade é do padrão Planalto, e o preâmbulo sai daqui
    // direto para dentro de um `<span>` do arquivo: guardá-lo como HTML o
    // preserva sem que nada precise ser reescrito na exportação.
    doc.preambulo = interior;
    return;
  }

  if (/^(DECRETA|RESOLVE):?$/i.test(texto)) {
    doc.ordemExecucao = texto;
    return;
  }

  if (/^(Brasília|Rio de Janeiro),/i.test(texto)) {
    doc.fecho = texto;
    return;
  }

  /*
   * Assinatura vem depois do fecho, e é o fecho que a anuncia (Decreto nº
   * 12.002/2024, art. 4º). Sem essa condição, toda linha inteiramente em
   * maiúsculas era tomada por signatário — e num ato de verdade elas são as
   * denominações dos agrupadores: "CAPÍTULO I", "DA CARREIRA DE ESPECIALISTA
   * DO BANCO CENTRAL DO BRASIL", "DISPOSIÇÕES FINAIS". A medida provisória de
   * docs/file-tests chegava à folha com dezenas de capítulos na lista de
   * assinaturas, e o ponto de ancoragem que morava neles se perdia junto.
   */
  if (
    doc.fecho &&
    /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]{4,}$/.test(texto) &&
    !texto.includes('DECRETO') &&
    !texto.includes('PRESIDENTE') &&
    // O anexo vem depois das assinaturas e também é uma linha em maiúsculas —
    // a mesma ressalva que o leitor de RTF faz.
    !/^ANEXOS?\b/i.test(texto)
  ) {
    doc.assinaturas.push(texto);
    return;
  }

  const { type, numberLabel, cleanText } = identifyBlockType(texto);

  /*
   * O rótulo e as aspas de citação saem do texto na classificação; aqui eles
   * saem do HTML na mesma medida, contada em caracteres visíveis. Quando o
   * texto classificado não é um recorte do que estava no parágrafo — o omissis,
   * que tem forma canônica própria —, o conteúdo é o texto mesmo.
   */
  const inicio = cleanText ? texto.indexOf(cleanText) : texto.length;
  const content =
    inicio >= 0 ? stripVisibleEdges(interior, inicio, texto.length - inicio - cleanText.length) : cleanText;

  doc.blocks.push({
    id: `block-${indice}-${Math.random().toString(36).substring(2, 7)}`,
    type,
    numberLabel,
    content,
    rawText: cleanText,
  });
}

/**
 * Re-converte uma string HTML Planalto de volta para AST `LegislativeDocument`.
 * Funciona nativamente no Navegador (DOMParser) e no Node.js (Regex Fallback).
 */
export function deserializePlanaltoHtmlToDocument(html: string): LegislativeDocument {
  const doc: LegislativeDocument = {
    title: 'Ato Normativo Importado',
    epigrafe: '',
    ementa: '',
    preambulo: '',
    ordemExecucao: 'DECRETA:',
    blocks: [],
    fecho: '',
    assinaturas: [],
  };

  /*
   * O `<title>` que o arquivo declarou, se declarou algum. Ele decide, ao final,
   * se o título deste ato foi escrito à mão: um título que não repete a epígrafe
   * é escolha de quem redigiu o arquivo, e corrigir a epígrafe aqui dentro não
   * deve apagá-la.
   */
  let declaredTitle = '';

  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const parsedDoc = parser.parseFromString(html, 'text/html');

    const titleEl = parsedDoc.querySelector('title');
    if (titleEl) {
      doc.title = titleEl.textContent?.trim() || doc.title;
      declaredTitle = doc.title;
    }

    doc.epigrafe = acharEpigrafeNoDom(parsedDoc);

    const ementaEl = parsedDoc.querySelector('table p[align="justify"] span') || parsedDoc.querySelector('table span');
    if (ementaEl) doc.ementa = textoCorrido(ementaEl.textContent);

    /*
     * O agrupador do ato publicado costuma ser um título de seção do HTML, e não
     * um parágrafo: os setenta e cinco capítulos da medida provisória de
     * docs/file-tests são `<h2>`. Lendo só `<p>`, eles não chegavam à folha —
     * nem o texto, nem o ponto de ancoragem que trazem dentro.
     */
    const paragraphs = Array.from(parsedDoc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, table.MsoTableGrid'));

    paragraphs.forEach((p, indice) => {
      if (p.tagName.toLowerCase() === 'table') {
        doc.blocks.push({
          id: `table-${indice}-${Math.random().toString(36).substring(2, 7)}`,
          type: 'TABELA',
          content: p.outerHTML,
          rawText: 'Tabela',
        });
        return;
      }

      absorverParagrafo(doc, p.innerHTML, indice);
    });
  } else {
    // Fallback para Node.js (Regex Extractor)
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    if (titleMatch) {
      doc.title = titleMatch[1].trim();
      declaredTitle = doc.title;
    }

    // Parágrafos e títulos de seção, que é como o ato publicado escreve o agrupador.
    const pMatches = Array.from(html.matchAll(/<(p|h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi));

    // Atributos a mais no <font> são a regra, e não a exceção: o arquivo salvo
    // marca ali o azul-marinho da epígrafe, e o corpus legado traz `face`, `size`
    // e o que mais o editor de origem tenha escrito. Quando o arquivo não segue
    // essa convenção, vale a forma da epígrafe: o nome do ato e o número dele.
    const epigrafeMatch = html.match(/<font color="#000080"[^>]*>(.*?)<\/font>/i);
    const epigrafePorTexto = pMatches.find((p) => EPIGRAFE_PATTERN.test(visibleTextOfHtml(p[2])));
    if (epigrafeMatch) doc.epigrafe = textoCorrido(epigrafeMatch[1].replace(/<[^>]+>/g, ''));
    else if (epigrafePorTexto) doc.epigrafe = visibleTextOfHtml(epigrafePorTexto[2]);

    const ementaMatch = html.match(/<span style="font-size: 10\.0pt; font-family: Arial,sans-serif; color: #800000">\s*(.*?)\s*<\/span>/is);
    if (ementaMatch) doc.ementa = textoCorrido(ementaMatch[1].replace(/<[^>]+>/g, ''));

    pMatches.forEach((p, indice) => absorverParagrafo(doc, p[2], indice));
  }

  doc.titleIsManual = Boolean(declaredTitle) && declaredTitle !== doc.epigrafe.trim();

  return doc;
}
