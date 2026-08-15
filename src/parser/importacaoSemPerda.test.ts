import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LegislativeDocument } from '../types/legislative';
import { detectAndDecode } from '../utils/encoding';
import { htmlToPlainText } from '../utils/docTargets';
import mammoth from 'mammoth';
import { parseRtfTokens, parseRtfToLegislativeDocument, parseTokensToLegislativeDocument } from './rtfParser';
import { extrairTokensDoDoc } from './docParser';
import { deserializePlanaltoHtmlToDocument } from './htmlSerializer';
import { sanitizeInlineHtml, visibleTextOfHtml } from './inlineHtml';
import { completarEmentaDoDocx, prepararHtmlDoDocx } from './docxHtml';

/**
 * A conta fechada da importação.
 *
 * A prova de abertura conta dispositivo, palavra e remissão à mão, na tela, e
 * por isso só acusa perda quando alguém se lembra de contar. Estes casos abrem
 * os arquivos de verdade de `docs/file-tests/` e falham quando uma palavra que
 * está no arquivo não chega ao documento — que é a única regra que o ato
 * importado não pode quebrar.
 *
 * A conta é por palavra, e não por trecho igual, porque o leitor legitimamente
 * remonta o texto: junta a linha que o arquivo quebrou no meio, tira o espaço
 * antes da vírgula, recorta o rótulo do conteúdo e o guarda em `numberLabel`.
 * Nada disso é perda. Perda é palavra que existia e sumiu.
 */

/** As aspas da citação a folha desenha em vez de guardar; não se contam. */
const DESENHADAS_PELA_FOLHA = new Set<string>([]);

const caminhoDeProva = (nome: string): string => resolve(__dirname, '../../docs/file-tests', nome);

const arquivoDeProva = (nome: string): Uint8Array => new Uint8Array(readFileSync(caminhoDeProva(nome)));

/*
 * A conversão de Word acontece de verdade, e não por um HTML escrito à mão: o
 * que se afere é o encontro entre o que o mammoth escreve e o que o leitor
 * legislativo espera, que é justamente onde o conteúdo se perdia.
 */
const HTML_DO_MAMMOTH = (
  await mammoth.convertToHtml({ buffer: readFileSync(caminhoDeProva('decreto-anexo.docx')) })
).value;

/**
 * Multiconjunto de palavras. Pontuação sai fora: o que se afere é se a palavra
 * chegou, não se a vírgula ficou do mesmo lado.
 */
function palavras(texto: string): Map<string, number> {
  const conta = new Map<string, number>();
  const limpo = texto
    // `##ATO`, `##EME`, `##ANE` e afins são as marcas com que a CEJ divide o
    // arquivo, como o `\par` do RTF: estrutura, e não texto do ato.
    .replace(/##[A-Z]{3}/g, ' ')
    .replace(/[ \s]+/g, ' ')
    .replace(/[“”"'(),;:.!?\[\]]/g, ' ')
    .toLowerCase();

  for (const bruta of limpo.split(' ')) {
    // O traço das pontas é do rótulo, não da palavra: o ato publicado escreve
    // "III-" onde a forma canônica é "III -". O de dentro fica, porque é ele
    // que distingue "art. 35-b-b" de "art. 35".
    //
    // O travessão conta como traço. O leitor normaliza para o hífen canônico o
    // separador do inciso, e um ato que escreve "I – texto" — como o Decreto nº
    // 17.464/1926, 43 vezes — acusava 43 palavras perdidas que nunca existiram.
    const palavra = bruta.replace(/^[-–—]+|[-–—]+$/g, '');
    if (!palavra || DESENHADAS_PELA_FOLHA.has(palavra)) continue;
    conta.set(palavra, (conta.get(palavra) || 0) + 1);
  }
  return conta;
}

/** Todo o texto que o documento guarda, em qualquer campo. */
function textoDoDocumento(doc: LegislativeDocument): string {
  const partes = [
    doc.epigrafe,
    doc.ementa,
    doc.preambulo,
    doc.ordemExecucao,
    // O rótulo mora fora do conteúdo (invariante 3): sem ele, todo "Art. 1º"
    // recortado contaria como palavra perdida. E a tabela se lê pelas células,
    // porque o texto corrido do HTML cola uma na outra — "5,81" seguido de "6"
    // viraria a palavra "5,816".
    // O "(NR)" também mora fora do conteúdo, e a folha o desenha depois das
    // aspas de fechamento — conta como palavra que chegou ao ato.
    ...doc.blocks.map(
      (bloco) => `${bloco.numberLabel || ''} ${bloco.content} ${bloco.novaRedacao ? '(NR)' : ''}`
    ),
    doc.fecho,
    ...doc.assinaturas,
  ];
  /*
   * O fim de cada elemento vale por um espaço. Sem isso a tabela sai com as
   * células coladas — "5,81" seguido de "6" viraria a palavra "5,816" — e a
   * conta acusaria perda onde não há.
   */
  const separandoElementos = (html: string) => html.replace(/<\/(?:td|th|p|li|tr|div|h[1-6])\s*>/gi, ' ');
  return partes.map((parte) => htmlToPlainText(separandoElementos(parte || ''))).join(' ');
}

/** As palavras do arquivo que não chegaram ao documento, com a conta de cada uma. */
function palavrasPerdidas(noArquivo: Map<string, number>, noDocumento: Map<string, number>): string[] {
  const perdidas: string[] = [];
  for (const [palavra, vezes] of noArquivo) {
    const chegaram = noDocumento.get(palavra) || 0;
    if (chegaram < vezes) perdidas.push(`${palavra} (${vezes} no arquivo, ${chegaram} no ato)`);
  }
  return perdidas.sort();
}

describe('a importação não perde conteúdo do ato', () => {
  describe('RTF da CEJ (0408_DEC_13090_S1_OK.rtf)', () => {
    const bytes = arquivoDeProva('0408_DEC_13090_S1_OK.rtf');
    const rtf = detectAndDecode(bytes).text;
    const doc = parseRtfToLegislativeDocument(rtf);

    it('leva ao ato toda palavra que o arquivo mostra', () => {
      const noArquivo = palavras(
        parseRtfTokens(rtf)
          .filter((token) => token.type === 'text' && token.val)
          .map((token) => token.val)
          .join(' ')
      );

      expect(palavrasPerdidas(noArquivo, palavras(textoDoDocumento(doc)))).toEqual([]);
    });

    it('traz os títulos das tabelas do anexo, cada um junto da sua tabela', () => {
      const rotulos = doc.blocks.map((bloco) => htmlToPlainText(bloco.content));

      const primeiroTitulo = rotulos.findIndex((texto) => texto.startsWith('DO MINISTÉRIO DO PLANEJAMENTO'));
      const segundoTitulo = rotulos.findIndex((texto) => texto.startsWith('DA SECRETARIA DE GESTÃO'));

      expect(primeiroTitulo).toBeGreaterThan(-1);
      expect(segundoTitulo).toBeGreaterThan(primeiroTitulo);

      // Entre um título e o outro há de estar a tabela do primeiro: o título
      // anuncia a tabela que vem depois dele, e não a que veio antes.
      const tabelasEntreOsDois = doc.blocks
        .slice(primeiroTitulo, segundoTitulo)
        .filter((bloco) => bloco.type === 'TABELA');
      expect(tabelasEntreOsDois).toHaveLength(1);
    });

    it('reconhece os três signatários, inclusive os que assinam em caixa mista', () => {
      expect(doc.assinaturas).toEqual([
        'LUIZ INÁCIO LULA DA SILVA',
        'Esther Dweck',
        'Bruno Moretti',
      ]);
    });

    it('preenche a primeira coluna das tabelas do anexo', () => {
      const celulas = doc.blocks.flatMap((bloco) => bloco.tableRows?.flat() || []);
      const vazias = celulas.filter((celula) => !celula.trim()).length;

      // As que restam vazias são continuação de célula mesclada e célula em
      // branco do próprio arquivo; as 229 que se perdiam eram conteúdo.
      expect(celulas.length).toBe(1749);
      expect(vazias).toBeLessThanOrEqual(225);
    });
  });

  describe('Word binário (DEC11158.doc)', () => {
    /*
     * O Decreto nº 11.158/2022 aprova a TIPI: 71 mil parágrafos, uma tabela de
     * 16.984 linhas depois das assinaturas e nenhum título "ANEXO" — o arquivo
     * mais hostil que o leitor de Word binário enfrenta. A extração (contêiner
     * OLE, piece table, PAPX) devolve os mesmos tokens do RTF, e é sobre eles
     * que a conta de palavras se faz, como no caso do RTF.
     */
    const tokens = extrairTokensDoDoc(arquivoDeProva('DEC11158.doc'));
    const doc = parseTokensToLegislativeDocument(tokens);

    it('leva ao ato toda palavra que o arquivo mostra', () => {
      const noArquivo = palavras(
        tokens
          .filter((token) => token.type === 'text' && token.val)
          .map((token) => token.val)
          .join(' ')
      );

      expect(palavrasPerdidas(noArquivo, palavras(textoDoDocumento(doc)))).toEqual([]);
    });

    it('lê epígrafe, ementa e fecho dos parágrafos do Word, sem marca da CEJ', () => {
      expect(doc.epigrafe).toBe('DECRETO Nº 11.158, DE 29 DE JULHO DE 2022');
      expect(doc.ementa).toBe(
        'Aprova a Tabela de Incidência do Imposto sobre Produtos Industrializados - TIPI.'
      );
      expect(doc.fecho).toBe('Brasília, 29 de julho de 2022; 201º da Independência e 134º da República.');
    });

    it('encerra a lista de signatários no primeiro parágrafo que não é nome', () => {
      // "SUMÁRIO" e as seções da TIPI vêm logo depois de quem assina, em
      // maiúsculas — e não assinam o decreto.
      expect(doc.assinaturas).toEqual(['JAIR MESSIAS BOLSONARO', 'Paulo Guedes']);
    });

    it('traz as 16.984 linhas da TIPI como linhas de tabela, nenhuma como texto solto', () => {
      const linhas = doc.blocks.reduce((soma, bloco) => soma + (bloco.tableRows?.length || 0), 0);
      expect(linhas).toBe(16984);
    });
  });

  describe('ato publicado (mpv1286impressao.htm)', () => {
    const bytes = arquivoDeProva('mpv1286impressao.htm');
    const html = detectAndDecode(bytes).text;
    const doc = deserializePlanaltoHtmlToDocument(html);

    /**
     * O cabeçalho do brasão não é o ato: ele é desenhado pela folha e reescrito
     * pelo serializador.
     *
     * A forma está ancorada no começo do parágrafo de propósito. Procurar
     * "Presidência da República" em qualquer posição é o defeito que este teste
     * existe para pegar: o inciso "ser requisitados pela Presidência ou pela
     * Vice-Presidência da República…" contém a expressão no meio, e some.
     */
    const foraDoAto = /^(Presidência da República|Casa Civil|Secretaria Especial para Assuntos Jurídicos)/;

    it('leva ao ato toda palavra dos parágrafos do arquivo', () => {
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const noArquivo = palavras(
        Array.from(parsed.querySelectorAll('p, h1, h2, h3, h4, h5, h6'))
          .map((elemento) => visibleTextOfHtml(sanitizeInlineHtml(elemento.innerHTML)))
          .filter((texto) => texto && !foraDoAto.test(texto))
          .join(' ')
      );

      expect(palavrasPerdidas(noArquivo, palavras(textoDoDocumento(doc)))).toEqual([]);
    });

    it('guarda as remissões e os pontos de ancoragem do ato publicado', () => {
      const conteudo = doc.blocks.map((bloco) => bloco.content).join('') + doc.preambulo;
      const remissoes = conteudo.match(/<a[^>]+href=/gi)?.length || 0;
      const ancoras = conteudo.match(/<a[^>]+name=/gi)?.length || 0;

      expect(remissoes).toBeGreaterThanOrEqual(1682);
      expect(ancoras).toBeGreaterThanOrEqual(217);
    });
  });

  describe('documento do Word (decreto-anexo.docx)', () => {
    /*
     * O mammoth devolve HTML genérico, e não o padrão Planalto: lista em `<li>`
     * e tabela sem `class="MsoTableGrid"`. Nenhuma das duas formas era visitada
     * pelo leitor, e as duas sumiam sem aviso — é o que este caso vigia.
     */
    const html = prepararHtmlDoDocx(HTML_DO_MAMMOTH).html;
    const doc = completarEmentaDoDocx(deserializePlanaltoHtmlToDocument(html));

    it('leva ao ato toda palavra do documento convertido', () => {
      const parsed = new DOMParser().parseFromString(HTML_DO_MAMMOTH, 'text/html');
      // Elemento a elemento, e não `body.textContent`: o texto corrido do
      // documento inteiro cola um parágrafo no outro ("…2026Dispõe sobre…").
      const noArquivo = palavras(
        Array.from(parsed.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6'))
          .map((elemento) => elemento.textContent || '')
          .join(' ')
      );

      expect(palavrasPerdidas(noArquivo, palavras(textoDoDocumento(doc)))).toEqual([]);
    });

    it('guarda a tabela como tabela, e não como dispositivos soltos', () => {
      const tabelas = doc.blocks.filter((bloco) => bloco.type === 'TABELA');

      expect(tabelas).toHaveLength(1);
      expect(tabelas[0].content).toContain('CCE 1.15');
      // O texto da célula não pode entrar também como dispositivo do ato.
      expect(doc.blocks.filter((bloco) => bloco.rawText === 'CÓDIGO')).toHaveLength(0);
    });

    it('lê a lista numerada do Word como dispositivo, e não a descarta', () => {
      const incisos = doc.blocks.filter((bloco) => bloco.type === 'INCISO');

      expect(incisos.map((bloco) => bloco.numberLabel)).toEqual(['I -', 'II -']);
    });

    it('preenche a ementa, que no documento do Word é parágrafo comum', () => {
      expect(doc.ementa).toBe('Dispõe sobre o remanejamento de cargos e institui o quadro demonstrativo.');
      expect(doc.blocks.some((bloco) => bloco.rawText.startsWith('Dispõe sobre'))).toBe(false);
    });
  });
});
