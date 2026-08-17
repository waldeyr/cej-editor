import { SupportedEncoding } from '../utils/encoding';

export type BlockType =
  | 'EPIGRAFE'
  | 'EMENTA'
  | 'PREAMBULO'
  | 'ORDEM_EXECUCAO'
  | 'PARTE'
  | 'LIVRO'
  | 'TITULO'
  | 'SUBTITULO'
  | 'CAPITULO'
  | 'SECAO'
  | 'SUBSECAO'
  | 'TITULO_AGRUPADOR'
  | 'ARTIGO'
  | 'PARAGRAFO'
  | 'INCISO'
  | 'ALINEA'
  | 'ITEM'
  | 'ALTERACAO'
  | 'OMISSIS'
  | 'TABELA'
  | 'FECHO'
  | 'ASSINATURA'
  | 'ANEXO'
  | 'TEXTO_LIVRE';

/** Alinhamento horizontal do parágrafo, espelhado no HTML exportado. */
export type BlockAlign = 'left' | 'center' | 'right' | 'justify';

/**
 * Onde o dispositivo está na citação do ato alterado: onde as aspas abrem, o
 * que corre entre elas, onde fecham — e a citação de um dispositivo só, que
 * abre e fecha na mesma linha.
 *
 * As aspas não se repetem a cada dispositivo citado: abrem no primeiro e fecham
 * no último (Decreto nº 12.002/2024, art. 14). Guardar apenas as pontas seria
 * perder o meio, que é justamente o que a folha precisa saber para recolher a
 * citação inteira à direita do artigo que altera — ver `utils/citacoes.ts`.
 */
export type PosicaoNaCitacao = 'abre' | 'meio' | 'fecha' | 'unica';

export interface LegislativeBlock {
  id: string;
  type: BlockType;
  numberLabel?: string; // Ex: "Art. 1º", "§ 1º", "I", "a", "1."
  content: string; // HTML com negritos, itálicos, links ou tabela HTML
  rawText: string; // Texto limpo
  linkName?: string; // Ex: "art1", "anexo1"
  /**
   * O dispositivo alterado encerra com "(NR)" (Decreto nº 12.002/2024, art. 14, I).
   *
   * Mora fora do conteúdo pelo mesmo motivo que `numberLabel`: quem o desenha é
   * a folha, depois das aspas de fechamento. Guardá-lo no texto o poria dentro
   * da citação, que não é onde a norma o quer — e não guardá-lo de forma alguma
   * era o que vinha acontecendo: `sanitizeQuoteText` o retirava do texto
   * importado e nada o repunha, de modo que o ato salvo perdia a marca.
   */
  novaRedacao?: boolean;
  /**
   * O identificador ("Art. 5º") sai riscado, porque o dispositivo inteiro foi
   * tachado — não só um trecho do texto dele.
   *
   * Mora fora de `content` pelo mesmo motivo que `numberLabel`: o rótulo é
   * string simples, sem marcação própria, e quem o desenha é a folha. Entra em
   * jogo junto com o `<s>` que o botão "Tachado" já grava no texto, quando a
   * seleção aplicada cobre o campo inteiro — ver `richText.ts`,
   * `coversWholeField`.
   */
  identificadorTachado?: boolean;
  /**
   * O dispositivo é texto citado de outro ato, e onde ele está na citação.
   *
   * Vale para a citação inteira, e não só para as linhas que trazem as aspas: o
   * inciso e o omissis que correm entre a abertura e o fechamento são texto do
   * ato **alterado**, e se recolhem à direita do artigo que os altera — na
   * folha e no arquivo salvo, que os escreve dentro de dois `<blockquote>`.
   *
   * Como o rótulo e o "(NR)", as aspas moram aqui e não no texto (invariante
   * 9): quem as desenha é a folha, e o redator não as digita nem as apaga por
   * engano.
   */
  citacao?: PosicaoNaCitacao;
  align?: BlockAlign; // Ausente = justificado, como manda o padrão Planalto
  tableRows?: string[][]; // Matriz de células para blocos do tipo TABELA
  children?: LegislativeBlock[]; // Dispositivos alterados ou filhos
}

export interface LegislativeDocument {
  /**
   * O `<title>` do arquivo salvo. Acompanha a epígrafe por padrão — é ela que
   * nomeia o ato — mas pode ser definido à mão quando o nome do arquivo precisa
   * dizer outra coisa. Ver `titleIsManual`.
   */
  title: string;
  /**
   * Marca que o título foi escrito à mão e não deve mais seguir a epígrafe.
   * Sem ela, a primeira correção na epígrafe apagaria a escolha do usuário.
   */
  titleIsManual?: boolean;
  epigrafe: string;
  ementa: string;
  linkVigencia?: string;
  preambulo: string;
  ordemExecucao: string; // Ex: "DECRETA:"
  blocks: LegislativeBlock[];
  fecho: string;
  assinaturas: string[];
  /**
   * Alinhamento das partes fixas do ato (epígrafe, ementa, preâmbulo, ordem de
   * execução, fecho e cada assinatura), indexado pelo mesmo alvo usado pelos
   * campos editáveis do canvas — ver `utils/docTargets.ts`.
   */
  partAligns?: Record<string, BlockAlign>;
  encoding?: SupportedEncoding;
  declaredEncoding?: string;
  hasBom?: boolean;
}

export interface ValidationIssue {
  id: string;
  blockId?: string;
  severity: 'error' | 'warning';
  message: string;
}
