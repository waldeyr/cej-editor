import { LegislativeDocument, LegislativeBlock } from '../types/legislative';
import { desenhaComoTitulo } from '../utils/rank';
import { inicioDoAnexo } from '../utils/blockTypes';
import { LINK_INK, LINK_INK_HOVER } from '../utils/anchors';
import {
  assinaturaTarget,
  defaultAlignForBlockType,
  indentForAlign,
  resolvedAlignForTarget,
} from '../utils/docTargets';
import {
  EPIGRAFE_PATTERN,
  centralizarDenominacaoDeAgrupador,
  identifyBlockType,
  pareceNomeDeSignatario,
} from './rtfParser';
import { despedacar, sanitizeInlineHtml, stripVisibleEdges, visibleTextOfHtml } from './inlineHtml';
import {
  ASPAS_ABRE,
  ASPAS_FECHA,
  abreAspas,
  estaEmCitacao,
  fechaAspas,
  preencherCitacoes,
} from '../utils/citacoes';

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
            <a name="epigrafe" href="#">
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

  // A ordem só sai quando o ato a tem: a MPV não decreta, e um parágrafo em
  // negrito vazio no arquivo não espelharia a folha, que esconde a parte vazia.
  const ordemExecucaoParagrafo = doc.ordemExecucao
    ? `
	<p class="Textbody0" style="text-align: ${ordemExecucaoAlign}; text-indent: ${indentForAlign(ordemExecucaoAlign)}; margin-left: 0cm; margin-right: -.05pt; margin-top: 15px; margin-bottom: 15px">
  ${ordemExecucaoPrefix}<span style="font-size:10.0pt;font-family:&quot;Arial&quot;,sans-serif">${ordemExecucaoHtml}</span>${ordemExecucaoSuffix}</p>`
    : '';

  const preambuloHtml = `
	<p class="Textbody0" style="text-align: ${preambuloAlign}; text-indent: ${indentForAlign(preambuloAlign)}; margin-left: 0cm; margin-right: -.05pt; margin-top: 15px; margin-bottom: 15px">
	<span style="font-size:10.0pt;font-family:&quot;Arial&quot;,sans-serif">${doc.preambulo}</span></p>${ordemExecucaoParagrafo}`;

  /*
   * O anexo se lê depois das assinaturas, e é assim que o arquivo o escreve.
   * O corte é o primeiro bloco do tipo `ANEXO` — ver `inicioDoAnexo`.
   */
  const corte = inicioDoAnexo(doc.blocks);
  const serializar = (blocos: readonly LegislativeBlock[]) =>
    blocos.map((block) => serializeBlockToHtml(block)).join('\n');
  const blocksHtml = serializar(doc.blocks.slice(0, corte));
  const anexosHtml = serializar(doc.blocks.slice(corte));

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
${anexosHtml}
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
  /*
   * O identificador sai riscado quando o dispositivo inteiro foi tachado — o
   * mesmo `<s>` que o botão "Tachado" grava no caput (`utils/richText.ts`),
   * para que rótulo e texto saiam com a mesma marcação no arquivo salvo.
   */
  const tachar = (texto: string) => (block.identificadorTachado && texto ? `<s>${texto}</s>` : texto);
  const labelPrefix = block.numberLabel ? tachar(`${block.numberLabel} `) : '';
  const align = block.align || defaultAlignForBlockType(block.type);
  const indent = indentForAlign(align);
  /*
   * "(NR)" fecha o dispositivo alterado, depois das aspas (Decreto nº
   * 12.002/2024, art. 14, I). Vem da marca do bloco, e não do texto: o redator
   * não o digita nem o apaga por engano, e ele sobrevive à ida e à volta.
   */
  const novaRedacao = block.novaRedacao ? ' (NR)' : '';

  if (block.type === 'TABELA') {
    /*
     * A tabela citada não se recolhe. Ela já ocupa a largura da folha, e os dois
     * recuos da citação a espremeriam para fora da página — o anexo citado do
     * decreto de `docs/file-tests/` é feito delas. As aspas da citação ficam nos
     * parágrafos que a cercam, que é onde o ato publicado as escreve.
     */
    return `\t<div align="center" style="margin-top: 15px; margin-bottom: 15px" data-block-id="${block.id}">${anchor}\n${block.content}\n\t</div>`;
  }

  /*
   * As aspas da citação, que só as pontas levam: abrem no primeiro dispositivo
   * citado e fecham no último, como as escreve o ato publicado.
   */
  const abre = abreAspas(block) ? ASPAS_ABRE : '';
  const fecha = fechaAspas(block) ? ASPAS_FECHA : '';

  /*
   * O dispositivo citado mora dentro de dois `<blockquote>` — 40px cada um, os
   * 80px de recuo que a folha desenha. Vale para a citação inteira, e não só
   * para as linhas com aspas: o inciso e o omissis do ato alterado saíam daqui
   * na margem do ato alterador, e a citação chegava serrilhada ao arquivo.
   */
  const recolhido = (paragrafo: string) =>
    estaEmCitacao(block)
      ? `\t<blockquote>\n\t\t<blockquote>\n${paragrafo}\n\t\t</blockquote>\n\t</blockquote>`
      : paragrafo;

  /*
   * Agrupadores (Parte, Livro, Título, Capítulo, Seção…) e o título do anexo
   * saem centralizados e em negrito, como aparecem na tela. Antes, apenas
   * TITULO_AGRUPADOR recebia esse tratamento: os demais eram exportados como
   * parágrafo justificado e com o rótulo repetido, já que a denominação
   * completa está no próprio conteúdo.
   */
  if (desenhaComoTitulo(block.type)) {
    /*
     * "CAPÍTULO I - DAS DISPOSIÇÕES" é uma linha só, e é assim que ela sai
     * daqui. O travessão separa o rótulo da denominação: no agrupador o número
     * é lido junto com o nome, e não como o "Art. 1º" que abre um parágrafo.
     * O que vem do arquivo importado traz a denominação inteira no conteúdo e
     * rótulo nenhum — nesse caso não há o que prefixar.
     */
    /*
     * Sem denominação não há o que separar, e o travessão não pode sair
     * sozinho: "ANEXO I - " reaberto deixava de ser reconhecido como título de
     * anexo, e a região inteira do anexo voltava para o corpo do ato — o
     * caminho normal de quem cria um anexo pela barra, já que o dispositivo
     * nasce vazio (invariante 2).
     */
    const denominacao = block.numberLabel
      ? tachar(block.content ? `${block.numberLabel} - ` : block.numberLabel)
      : '';
    /*
     * O negrito é o padrão Planalto, não escolha do redator — que pode
     * sobrescrevê-la com "Limpar formatação", do mesmo jeito que já pode na
     * ordem de execução. Uma etiqueta qualquer no conteúdo é o sinal de que
     * ele decidiu algo sobre a formatação ali; a marca de "sem formatação"
     * (`markAsPlainFormat`) é a que sobra quando o texto volta a ser puro.
     */
    const negritoPadrao = !/<[a-z][^>]*>/i.test(block.content);
    const negritoAbre = negritoPadrao ? '<b>' : '';
    const negritoFecha = negritoPadrao ? '</b>' : '';
    return recolhido(`\t<p align="${align}" style="margin-top: 20px; margin-bottom: 10px" data-block-id="${block.id}">
\t\t${negritoAbre}<span style="font-size:10.0pt;font-family:&quot;Arial&quot;,sans-serif;color:black">${anchor}${abre}${denominacao}${block.content}${fecha}</span>${negritoFecha}</p>`);
  }

  /*
   * O parágrafo do dispositivo citado tem estilo próprio no padrão Planalto —
   * `Textbody0` com a linha de base alinhada —, e é o que o arquivo publicado
   * escreve dentro dos `<blockquote>`.
   */
  if (estaEmCitacao(block)) {
    return recolhido(`\t\t\t<p class="Textbody0" style="text-align: ${align}; text-indent: ${indent}; vertical-align: baseline; margin-right: 0cm; margin-top: 15px; margin-bottom: 15px" data-block-id="${block.id}">
\t\t\t<span style="font-size:10.0pt;font-family:&quot;Arial&quot;,sans-serif">${anchor}${abre}${labelPrefix}${block.content}${fecha}${novaRedacao}</span></p>`);
  }

  return `\t<p class="MsoNormal" style="text-align: ${align}; text-indent: ${indent}; line-height: normal; margin-top: 15px; margin-bottom: 15px" data-block-id="${block.id}">
\t<span style="font-size:10.0pt;font-family:&quot;Arial&quot;,sans-serif;color:black">${anchor}${labelPrefix}${block.content}${novaRedacao}</span></p>`;
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
 * As assinaturas são contíguas: vêm logo depois do fecho, uma sob a outra, e
 * acabam no primeiro parágrafo que não é nome.
 *
 * É esta a guarda que impede a forma de nome próprio — duas a seis palavras
 * capitalizadas, sem algarismo e sem pontuação final — de recolher meio anexo
 * para a lista de signatários: "Quadro Demonstrativo de Cargos" e "Ministério
 * da Gestão e da Inovação" têm exatamente essa forma. Depois que o primeiro
 * dispositivo entra, ninguém mais assina o ato.
 */
function aindaSeAssina(doc: LegislativeDocument, blocosNoFecho: number): boolean {
  return Boolean(doc.fecho) && doc.blocks.length === blocosNoFecho;
}

/**
 * Quais partes fixas já foram reconhecidas — cada uma existe uma vez só no ato.
 *
 * A epígrafe e a ementa saem do DOM antes da varredura; o sinalizador delas diz
 * se o parágrafo de origem já foi descartado.
 */
interface PartesJaLidas {
  epigrafe: boolean;
  ementa: boolean;
  fecho: boolean;
  ordemExecucao: boolean;
}

/** As três formas do tachado que podem envolver o rótulo — a que o botão escreve e as do corpus legado. */
const ETIQUETAS_DE_TACHADO = ['s', 'strike', 'del'];

/**
 * O rótulo chegou do arquivo já riscado — `<s>Art. 5º </s>Fica revogado…` — e é
 * essa marca que devolve `identificadorTachado` ao reabrir o ato salvo por este
 * editor. Sem isto, `stripVisibleEdges` preserva toda etiqueta mesmo sem
 * caractere visível dentro dela (é assim que a âncora vazia sobrevive), e o
 * `<s>` do rótulo sobraria vazio na frente do texto — sem marcar coisa alguma,
 * porque quem desenha o rótulo é um `<span>` à parte, que nunca olha para
 * dentro de `content`.
 *
 * O rótulo pode chegar dentro de outras etiquetas que não são dele — o `<span
 * style="…">` que envolve o parágrafo inteiro, ou o `<a name>` da âncora —, e
 * por isso a checagem caminha pedaço a pedaço (a mesma varredura de
 * `inlineHtml.ts`), e não por posição no início da string: só desfaz a etiqueta
 * de tachado cujo par abre com zero caracteres visíveis vistos e fecha
 * exatamente no fim do rótulo, nem mais nem menos — a mesma marca ao redor de
 * rótulo e começo do texto não é tachado do identificador, é tachado do redator
 * sobre um trecho comum, e continua em `content` como sempre esteve.
 */
function extrairTachadoDoRotulo(
  interior: string,
  visiveisDoRotulo: number
): { interior: string; identificadorTachado?: boolean } {
  if (visiveisDoRotulo <= 0) return { interior };

  const pedacos = despedacar(interior);
  const abertos: { nome: string; indice: number; visiveisNaAbertura: number }[] = [];
  let visiveis = 0;

  for (let indice = 0; indice < pedacos.length; indice++) {
    const pedaco = pedacos[indice];
    if (pedaco.visivel) {
      visiveis += pedaco.visivel.length;
      continue;
    }

    const abertura = /^<([a-zA-Z][a-zA-Z0-9]*)(?:\s[^>]*)?>$/.exec(pedaco.bruto);
    if (abertura) {
      abertos.push({ nome: abertura[1].toLowerCase(), indice, visiveisNaAbertura: visiveis });
      continue;
    }

    const fechamento = /^<\/([a-zA-Z][a-zA-Z0-9]*)>$/.exec(pedaco.bruto);
    if (!fechamento) continue;

    const nome = fechamento[1].toLowerCase();
    const posicao = abertos.map((item) => item.nome).lastIndexOf(nome);
    if (posicao === -1) continue;
    const [aberto] = abertos.splice(posicao, 1);

    if (
      ETIQUETAS_DE_TACHADO.includes(nome) &&
      aberto.visiveisNaAbertura === 0 &&
      visiveis === visiveisDoRotulo
    ) {
      const semTags = pedacos
        .filter((_, i) => i !== aberto.indice && i !== indice)
        .map((p) => p.bruto)
        .join('');
      return { interior: semTags, identificadorTachado: true };
    }
  }

  return { interior };
}

/**
 * Absorve um parágrafo do arquivo: parte fixa do ato ou dispositivo.
 *
 * O conteúdo guardado é HTML, e não texto: é dentro do parágrafo que moram a
 * remissão, o ponto de ancoragem e o negrito do ato publicado.
 */
function absorverParagrafo(
  doc: LegislativeDocument,
  interiorBruto: string,
  indice: number,
  blocosNoFecho: number,
  jaLidas: PartesJaLidas
): void {
  let interior = sanitizeInlineHtml(interiorBruto);
  let texto = visibleTextOfHtml(interior);

  /*
   * As marcas com que o gabarito da CEJ divide a minuta — ##ATO, ##EME, ##TEX,
   * ##APR, ##AMI — valem também no caminho do Word: a minuta é distribuída em
   * `.docx` com as mesmas marcas do RTF, e o leitor de RTF as honra. Sem elas,
   * a epígrafe abria vazia, o "##TEX" vazava para dentro do preâmbulo e os
   * signatários — que só a marca identifica quando assinam em caixa mista antes
   * de qualquer fecho — viravam dispositivos do ato.
   */
  const marcaDaCej = texto.match(/^##([A-Z]{3})\s*/)?.[1];
  if (marcaDaCej) {
    interior = interior.replace(/##[A-Z]{3}\s*/, '');
    texto = visibleTextOfHtml(interior);
    if (marcaDaCej === 'ATO' && !doc.epigrafe) {
      doc.epigrafe = textoCorrido(texto);
      return;
    }
    if (marcaDaCej === 'EME' && !doc.ementa) {
      doc.ementa = textoCorrido(interior);
      return;
    }
    if (marcaDaCej === 'TEX' && !doc.preambulo) {
      doc.preambulo = interior;
      return;
    }
    if (marcaDaCej === 'APR' || marcaDaCej === 'AMI') {
      doc.assinaturas.push(textoCorrido(texto));
      return;
    }
  }

  /*
   * O cabeçalho do brasão — "Presidência da República / Casa Civil / …" — não é
   * o ato: a folha o desenha e o serializador o reescreve.
   *
   * A forma está ancorada no começo do parágrafo, e não pode deixar de estar.
   * Procurando a expressão em qualquer posição, o inciso "ser requisitados pela
   * Presidência ou pela Vice-Presidência da República ou nas hipóteses de
   * requisição previstas em lei" era tomado por cabeçalho e apagado — cinco
   * dispositivos inteiros, seiscentos e vinte e um caracteres, na medida
   * provisória de `docs/file-tests/`.
   *
   * Sem fronteira de palavra ao final: no arquivo publicado as três linhas do
   * cabeçalho são um parágrafo só, separadas por `<br>`, e o texto visível sai
   * "Presidência da RepúblicaCasa CivilSecretaria Especial…".
   */
  if (/^Presidência da República/.test(texto)) return;
  // Parágrafo sem texto ainda pode ter conteúdo: a imagem que vem do `.docx` é
  // o ato tanto quanto a palavra, e descartá-la por não ter texto a perderia.
  if (!texto && !/<img\b/i.test(interior)) return;

  /*
   * A parte fixa existe **uma vez só**, e só o parágrafo de onde ela saiu é
   * descartado; a repetição é texto do ato.
   *
   * A epígrafe e a ementa já têm campo próprio na folha, e sem a guarda o
   * parágrafo de origem voltava como dispositivo — o ato abria com a ementa
   * escrita duas vezes. Mas descartar **toda** ocorrência apagava o que o ato
   * de verdade repete: o Decreto nº 61.100/1967 escreve a ementa duas vezes (no
   * cabeçalho e como título interno) e a segunda sumia. Vale o mesmo para o
   * fecho, que se sobrescrevia: o Decreto nº 17.464/1926 fecha o ato e mais
   * três anexos, cada um com sua data e seu ministro, e só o último sobrevivia
   * — cento e noventa e uma palavras apagadas sem aviso.
   */
  if (doc.epigrafe && texto.includes(doc.epigrafe) && !jaLidas.epigrafe) {
    jaLidas.epigrafe = true;
    return;
  }
  if (doc.ementa && texto.includes(doc.ementa) && !jaLidas.ementa) {
    jaLidas.ementa = true;
    return;
  }

  if (texto.includes('PRESIDENTE DA REPÚBLICA') && !doc.preambulo) {
    // O negrito da autoridade é do padrão Planalto, e o preâmbulo sai daqui
    // direto para dentro de um `<span>` do arquivo: guardá-lo como HTML o
    // preserva sem que nada precise ser reescrito na exportação.
    doc.preambulo = interior;
    return;
  }

  if (/^(DECRETA|RESOLVE):?$/i.test(texto) && !jaLidas.ordemExecucao) {
    doc.ordemExecucao = texto;
    jaLidas.ordemExecucao = true;
    return;
  }

  if (/^(Brasília|Rio de Janeiro),/i.test(texto) && !jaLidas.fecho) {
    doc.fecho = texto;
    jaLidas.fecho = true;
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
    aindaSeAssina(doc, blocosNoFecho) &&
    (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]{4,}$/.test(texto) || pareceNomeDeSignatario(texto)) &&
    !texto.includes('DECRETO') &&
    !texto.includes('PRESIDENTE') &&
    // O anexo vem depois das assinaturas e também é uma linha em maiúsculas —
    // a mesma ressalva que o leitor de RTF faz.
    !/^ANEXOS?\b/i.test(texto)
  ) {
    doc.assinaturas.push(texto);
    return;
  }

  const { type, numberLabel, cleanText, novaRedacao, aspas } = identifyBlockType(texto);

  /*
   * O rótulo e as aspas de citação saem do texto na classificação; aqui eles
   * saem do HTML na mesma medida, contada em caracteres visíveis. Quando o
   * texto classificado não é um recorte do que estava no parágrafo — o omissis,
   * que tem forma canônica própria —, o conteúdo é o texto mesmo.
   */
  const inicio = cleanText ? texto.indexOf(cleanText) : texto.length;
  const { interior: semTachado, identificadorTachado } = extrairTachadoDoRotulo(interior, inicio);
  const content =
    inicio >= 0
      ? stripVisibleEdges(semTachado, inicio, texto.length - inicio - cleanText.length)
      : cleanText;

  doc.blocks.push({
    id: `block-${indice}-${Math.random().toString(36).substring(2, 7)}`,
    type,
    numberLabel,
    content,
    rawText: cleanText,
    novaRedacao,
    citacao: aspas,
    ...(identificadorTachado ? { identificadorTachado } : {}),
  });
}

/**
 * Relê um arquivo HTML no padrão Planalto e devolve o ato.
 *
 * Exige `DOMParser`. Havia aqui um segundo leitor, por expressão regular, para
 * quando ele faltasse — o caso do Node. Ele saía por um motivo e ficava por
 * outro: navegador e Electron sempre têm `DOMParser`, de modo que o único
 * consumidor era o próprio teste, que passava a aprovar um leitor que ninguém
 * executa. E ele não era equivalente: no ato publicado de docs/file-tests,
 * seis `<p>` sem fechamento faziam a expressão regular engolir a epígrafe, e a
 * ementa era procurada por um `style` literal que o arquivo não escreve.
 */
export function deserializePlanaltoHtmlToDocument(html: string): LegislativeDocument {
  const doc: LegislativeDocument = {
    title: 'Ato Normativo Importado',
    epigrafe: '',
    ementa: '',
    preambulo: '',
    // Vazio até o arquivo a trazer: a MPV publicada não tem parágrafo
    // "DECRETA:", e o valor de reserva desenhava na folha — e gravava no
    // arquivo salvo — uma ordem que o ato não escreveu (invariante 9).
    ordemExecucao: '',
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

  const parser = new DOMParser();
  const parsedDoc = parser.parseFromString(html, 'text/html');

  const titleEl = parsedDoc.querySelector('title');
  if (titleEl) {
    doc.title = titleEl.textContent?.trim() || doc.title;
    declaredTitle = doc.title;
  }

  doc.epigrafe = acharEpigrafeNoDom(parsedDoc);

  /*
   * A ementa volta como HTML, e não como texto corrido.
   *
   * Ela é campo de uma linha só, mas pode carregar dentro o negrito e a
   * remissão que o redator pôs — e carrega, desde que a barra ganhou o botão
   * que faz da seleção a ementa do ato: promover um dispositivo com remissão e
   * salvar gravava o link no arquivo, e a releitura o apagava. Perda silenciosa
   * que só aparecia na segunda abertura (invariante 9).
   */
  const ementaEl = parsedDoc.querySelector('table p[align="justify"] span') || parsedDoc.querySelector('table span');
  if (ementaEl) doc.ementa = textoCorrido(sanitizeInlineHtml(ementaEl.innerHTML));

  /*
   * O agrupador do ato publicado costuma ser um título de seção do HTML, e não
   * um parágrafo: os setenta e cinco capítulos da medida provisória de
   * docs/file-tests são `<h2>`. Lendo só `<p>`, eles não chegavam à folha —
   * nem o texto, nem o ponto de ancoragem que trazem dentro.
   */
  const paragraphs = Array.from(parsedDoc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, table.MsoTableGrid'));

  // Quantos dispositivos havia quando o fecho apareceu — ver `aindaSeAssina`.
  let blocosNoFecho = -1;
  const jaLidas: PartesJaLidas = { epigrafe: false, ementa: false, fecho: false, ordemExecucao: false };

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

    /*
     * O parágrafo que mora dentro de uma tabela já foi absorvido com ela, no
     * `outerHTML` acima. Sem esta guarda o texto de cada célula entrava duas
     * vezes: uma na tabela e outra como dispositivo solto — e o Word escreve
     * `<p class=MsoNormal>` dentro de toda célula que gera.
     */
    if (p.closest('table.MsoTableGrid')) return;

    const tinhaFecho = Boolean(doc.fecho);
    absorverParagrafo(doc, p.innerHTML, indice, blocosNoFecho, jaLidas);
    if (!tinhaFecho && doc.fecho) blocosNoFecho = doc.blocks.length;
  });

  doc.titleIsManual = Boolean(declaredTitle) && declaredTitle !== doc.epigrafe.trim();
  doc.blocks = preencherCitacoes(centralizarDenominacaoDeAgrupador(doc.blocks));

  return doc;
}
