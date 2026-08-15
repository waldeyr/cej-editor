/**
 * A conta de caminho das remissões entre arquivos.
 *
 * O ato publicado guarda a remissão a outro ato como **caminho relativo**, e é
 * assim que ela é gravada aqui: `../../2025/Lei/L15141.htm#art217`. Esses
 * caminhos só viram endereço da internet quando a árvore de pastas é publicada
 * — no editor eles são apenas caminhos entre arquivos da pasta de trabalho.
 *
 * Duas regras governam este módulo:
 *
 * 1. **Sempre POSIX.** A barra é `/`, inclusive no Windows, porque quem manda é
 *    o `href`, não o sistema de arquivos.
 * 2. **O que está gravado no ato não se toca.** Nada aqui reescreve remissão de
 *    arquivo aberto; estas funções servem para *criar* uma remissão nova e para
 *    *resolver* uma existente na hora de segui-la ou de descrevê-la.
 */

export type FormaDeHref =
  /** `#art1` — destino dentro do próprio ato. */
  | { forma: 'ancora'; nome: string }
  /** `../../2025/Lei/L15141.htm#art217` — outro arquivo da árvore. */
  | { forma: 'relativo'; caminho: string; ancora?: string }
  /** `http:`, `https:`, `mailto:` — fora do alcance da pasta. */
  | { forma: 'externo'; href: string; protocolo: string }
  | { forma: 'vazio' };

/** Barra invertida do Windows nunca chega ao `href`. */
export const paraPosix = (caminho: string): string => caminho.replace(/\\/g, '/');

/** Separa o caminho do fragmento, sem tocar em nenhum dos dois. */
export function separarAncora(href: string): { caminho: string; ancora?: string } {
  const corte = href.indexOf('#');
  if (corte < 0) return { caminho: href };
  return {
    caminho: href.slice(0, corte),
    ancora: href.slice(corte + 1) || undefined,
  };
}

/**
 * Resolve `.` e `..` sobre uma sequência de segmentos.
 *
 * Um `..` que sobra à frente é devolvido como está: quem chamou é que sabe se
 * sair da raiz é erro (pasta do projeto) ou apenas um caminho acima (disco).
 */
export function normalizarCaminho(caminho: string): string {
  const absoluto = caminho.startsWith('/');
  const partes: string[] = [];

  for (const segmento of paraPosix(caminho).split('/')) {
    if (segmento === '' || segmento === '.') continue;
    if (segmento !== '..') {
      partes.push(segmento);
      continue;
    }
    const ultimo = partes[partes.length - 1];
    // Só sobe quando há de onde: '../..' à frente é parte do caminho.
    if (partes.length > 0 && ultimo !== '..') partes.pop();
    else if (!absoluto) partes.push('..');
  }

  return (absoluto ? '/' : '') + partes.join('/');
}

/** A pasta de um caminho de arquivo: `a/b/c.htm` → `a/b`; `c.htm` → `''`. */
export function pastaDe(caminhoDeArquivo: string): string {
  const limpo = paraPosix(caminhoDeArquivo);
  const corte = limpo.lastIndexOf('/');
  return corte < 0 ? '' : limpo.slice(0, corte);
}

/** O nome do arquivo, com extensão. */
export const nomeDe = (caminhoDeArquivo: string): string =>
  paraPosix(caminhoDeArquivo).split('/').pop() || '';

/**
 * De onde o caminho parte: `/`, o disco do Windows (`c:`) ou nada, se relativo.
 *
 * Caminho de disco do Windows não começa por barra, e por isso a comparação
 * ingênua com `startsWith('/')` dava `C:/p/a.htm` e `D:/q/b.htm` como dois
 * relativos da mesma raiz — e inventava `../../D:/q/b.htm`, que não leva a
 * lugar nenhum.
 */
function raizDe(caminho: string): string {
  const limpo = paraPosix(caminho);
  if (limpo.startsWith('/')) return '/';
  const disco = limpo.match(/^([a-zA-Z]:)(\/|$)/);
  return disco ? disco[1].toLowerCase() : '';
}

/**
 * Resolve um `href` relativo contra o arquivo em que ele está escrito.
 *
 * Os `..` contam a partir da **pasta** da origem, nunca do caminho da origem —
 * é o que o navegador faz, e errar isso desloca o destino em um nível.
 */
export function resolverRelativo(arquivoDeOrigem: string, relativo: string): string {
  const base = pastaDe(paraPosix(arquivoDeOrigem));
  return normalizarCaminho(base ? `${base}/${relativo}` : relativo);
}

/**
 * O caminho relativo que leva de um arquivo a outro.
 *
 * Devolve `null` quando não há caminho possível — dois discos diferentes no
 * Windows, por exemplo. Devolve `''` quando origem e destino são o mesmo
 * arquivo: aí a remissão é só a âncora.
 */
export function relativizar(arquivoDeOrigem: string, arquivoDeDestino: string): string | null {
  const origem = normalizarCaminho(paraPosix(arquivoDeOrigem));
  const destino = normalizarCaminho(paraPosix(arquivoDeDestino));

  if (origem === destino) return '';

  /*
   * Dois caminhos só têm relativo entre si quando partem da mesma raiz. E raiz
   * não é só a barra do começo: `C:/…` não começa por barra e mesmo assim é
   * absoluto — dois discos do Windows não têm caminho relativo entre si.
   */
  if (raizDe(origem) !== raizDe(destino)) return null;

  const partesOrigem = pastaDe(origem).split('/').filter(Boolean);
  const partesDestino = destino.split('/').filter(Boolean);

  let comum = 0;
  while (
    comum < partesOrigem.length &&
    comum < partesDestino.length - 1 &&
    /*
     * Comparação sem diferenciar caixa: macOS e Windows não a distinguem, e o
     * acervo do Planalto escreve `LEIS` e `Leis` sem critério. O caminho
     * emitido preserva a caixa real do destino.
     */
    partesOrigem[comum].toLowerCase() === partesDestino[comum].toLowerCase()
  ) {
    comum++;
  }

  const subidas = partesOrigem.length - comum;
  const descida = partesDestino.slice(comum);

  // Nunca `./` à frente: o ato publicado escreve `Anexos/x.htm`, não `./Anexos/x.htm`.
  return [...Array<string>(subidas).fill('..'), ...descida].join('/');
}

/**
 * Monta o `href` a ser gravado no ato.
 *
 * O caminho é codificado por segmento — nome de arquivo com espaço vira `%20`,
 * e a barra continua sendo barra. A âncora vai como veio: ela nasce de
 * `slugifyAnchor`, que já a deixa em letras e algarismos.
 */
export function hrefDeCaminho(caminhoRelativo: string, ancora?: string): string {
  const caminho = caminhoRelativo
    .split('/')
    .map((segmento) => encodeURIComponent(decodeURIComponent(segmento)))
    .join('/');

  if (!ancora) return caminho;
  return `${caminho}#${ancora}`;
}

/** O que uma remissão é, decidido só pela forma do `href`. */
export function classificarHref(href: string): FormaDeHref {
  const limpo = href.trim();
  if (!limpo) return { forma: 'vazio' };

  if (limpo.startsWith('#')) {
    const nome = decodeURIComponent(limpo.slice(1));
    return nome ? { forma: 'ancora', nome } : { forma: 'vazio' };
  }

  const protocolo = limpo.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (protocolo) return { forma: 'externo', href: limpo, protocolo: protocolo[1].toLowerCase() };

  // Endereço sem esquema mas com domínio (`//planalto.gov.br/…`) também é externo.
  if (limpo.startsWith('//')) return { forma: 'externo', href: limpo, protocolo: 'https' };

  const { caminho, ancora } = separarAncora(limpo);
  if (!caminho) return ancora ? { forma: 'ancora', nome: ancora } : { forma: 'vazio' };

  return { forma: 'relativo', caminho: decodeURIComponent(caminho), ancora };
}
