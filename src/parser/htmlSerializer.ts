import { LegislativeDocument, LegislativeBlock } from '../types/legislative';
import { isAgrupador } from '../utils/rank';
import { LINK_INK, LINK_INK_HOVER } from '../utils/anchors';
import {
  assinaturaTarget,
  defaultAlignForBlockType,
  indentForAlign,
  resolvedAlignForTarget,
} from '../utils/docTargets';
import { identifyBlockType } from './rtfParser';

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

  const epigrafeHtml = `
		<p align="${epigrafeAlign}" style="margin-top: 13px; margin-bottom: 13px">
			<font color="#000080" face="Arial">
				<small>
					<strong>
						<a href="#">
							<font color="#000080">${doc.epigrafe}</font></a></strong></small></font></p>`;

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
  /* Só a remissão é link. O ponto de ancoragem é destino: sai como texto comum. */
  a[href] { color: ${LINK_INK}; text-decoration: underline; }
  a[href]:hover { color: ${LINK_INK_HOVER}; }
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
    return `\t<p align="${align}" style="margin-top: 20px; margin-bottom: 10px" data-block-id="${block.id}">
\t\t<b><span style="font-size:10.0pt;font-family:&quot;Arial&quot;,sans-serif;color:black">${anchor}${block.content}</span></b></p>`;
  }

  return `\t<p class="MsoNormal" style="text-align: ${align}; text-indent: ${indent}; line-height: normal; margin-top: 15px; margin-bottom: 15px" data-block-id="${block.id}">
\t<span style="font-size:10.0pt;font-family:&quot;Arial&quot;,sans-serif;color:black">${anchor}${labelPrefix}${block.content}</span></p>`;
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

    const epigrafeEl = parsedDoc.querySelector('p[align="center"] a font') || parsedDoc.querySelector('p[align="center"] font');
    if (epigrafeEl) doc.epigrafe = epigrafeEl.textContent?.trim() || '';

    const ementaEl = parsedDoc.querySelector('table p[align="justify"] span') || parsedDoc.querySelector('table span');
    if (ementaEl) doc.ementa = ementaEl.textContent?.trim() || '';

    const paragraphs = Array.from(parsedDoc.querySelectorAll('p, table.MsoTableGrid'));
    let blockIdx = 0;

    paragraphs.forEach((p) => {
      if (p.tagName.toLowerCase() === 'table') {
        blockIdx++;
        doc.blocks.push({
          id: `table-${blockIdx}-${Math.random().toString(36).substring(2, 7)}`,
          type: 'TABELA',
          content: p.outerHTML,
          rawText: 'Tabela',
        });
        return;
      }

      const text = p.textContent?.trim() || '';
      if (!text || text.includes('Presidência da República') || text === doc.epigrafe) return;

      if (text.includes('PRESIDENTE DA REPÚBLICA') && !doc.preambulo) {
        doc.preambulo = text;
        return;
      }

      if (/^(DECRETA|RESOLVE):?$/i.test(text)) {
        doc.ordemExecucao = text;
        return;
      }

      if (/^(Brasília|Rio de Janeiro),/i.test(text)) {
        doc.fecho = text;
        return;
      }

      if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]{4,}$/.test(text) && !text.includes('DECRETO') && !text.includes('PRESIDENTE')) {
        doc.assinaturas.push(text);
        return;
      }

      const { type, numberLabel, cleanText } = identifyBlockType(text);

      blockIdx++;
      doc.blocks.push({
        id: `block-${blockIdx}-${Math.random().toString(36).substring(2, 7)}`,
        type,
        numberLabel,
        content: cleanText,
        rawText: cleanText,
      });
    });
  } else {
    // Fallback para Node.js (Regex Extractor)
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    if (titleMatch) {
      doc.title = titleMatch[1].trim();
      declaredTitle = doc.title;
    }

    const epigrafeMatch = html.match(/<font color="#000080">(.*?)<\/font>/i);
    if (epigrafeMatch) doc.epigrafe = epigrafeMatch[1].replace(/<[^>]+>/g, '').trim();

    const ementaMatch = html.match(/<span style="font-size: 10\.0pt; font-family: Arial,sans-serif; color: #800000">\s*(.*?)\s*<\/span>/is);
    if (ementaMatch) doc.ementa = ementaMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

    // Extrair parágrafos
    const pMatches = html.match(/<p\b[^>]*>(.*?)<\/p>/gis);
    let blockIdx = 0;

    if (pMatches) {
      pMatches.forEach((pStr) => {
        const text = pStr.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (!text || text.includes('Presidência da República') || text.includes(doc.epigrafe)) return;

        if (text.includes('PRESIDENTE DA REPÚBLICA') && !doc.preambulo) {
          doc.preambulo = text;
          return;
        }

        if (/^(DECRETA|RESOLVE):?$/i.test(text)) {
          doc.ordemExecucao = text;
          return;
        }

        if (/^(Brasília|Rio de Janeiro),/i.test(text)) {
          doc.fecho = text;
          return;
        }

        if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]{4,}$/.test(text) && !text.includes('DECRETO') && !text.includes('PRESIDENTE')) {
          doc.assinaturas.push(text);
          return;
        }

        const { type, numberLabel, cleanText } = identifyBlockType(text);

        blockIdx++;
        doc.blocks.push({
          id: `block-${blockIdx}-${Math.random().toString(36).substring(2, 7)}`,
          type,
          numberLabel,
          content: cleanText,
          rawText: cleanText,
        });
      });
    }
  }

  doc.titleIsManual = Boolean(declaredTitle) && declaredTitle !== doc.epigrafe.trim();

  return doc;
}
