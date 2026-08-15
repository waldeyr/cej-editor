import { LegislativeDocument } from './legislative';

/**
 * De que arquivo o ato veio, e para onde "Salvar" grava.
 *
 * Não entra em `LegislativeDocument` de propósito: o tipo do documento é o que o
 * serializador escreve no arquivo, e caminho de disco é estado da bancada, não
 * conteúdo do ato — guardá-lo lá vazaria para o HTML salvo.
 */
export interface ArquivoDoAto {
  /** Nome com extensão, como aparece na aba: `L15141.htm`. */
  nome: string;
  /** Caminho absoluto. Só existe no aplicativo de mesa. */
  caminho?: string;
  /** Caminho relativo à raiz do projeto, quando o arquivo está dentro dela. */
  relativo?: string;
  /** Concessão de gravação da web (Chromium), para que "Salvar" não repergunte. */
  handle?: FileSystemFileHandle;
  /** Endereço de origem, quando o ato veio de "Abrir de um endereço". */
  origem?: string;
}

/**
 * A fatia de estado que `utils/historico.ts` manipula.
 *
 * Fica aqui, e não lá, para que o registro da aba seja o dono da forma e o
 * módulo de história seja só a álgebra que opera sobre ela.
 */
export interface ComHistorico {
  doc: LegislativeDocument;
  passado: LegislativeDocument[];
  futuro: LegislativeDocument[];
}

/** Um ato aberto: o documento, a história dele e de que arquivo veio. */
export interface Aba extends ComHistorico {
  id: string;
  /**
   * Última versão gravada ou aberta — `sujo` é `doc !== limpo`, por identidade.
   *
   * `null` quando o ato nunca chegou a um arquivo (rascunho recuperado, ou
   * documento novo): é trabalho que ninguém gravou, e tratá-lo como salvo o
   * faria sumir sem pergunta.
   */
  limpo: LegislativeDocument | null;
  selectedBlockId?: string;
  arquivo: ArquivoDoAto | null;
  /** O aviso passageiro "Salvo" da barra de estado. */
  acabouDeSalvar: boolean;
  /** Rolagem da folha, para a aba voltar onde estava — e não ao topo. */
  rolagem: number;
}

export interface EstadoDasAbas {
  abas: Aba[];
  ativa: string;
}

export const estaSuja = (aba: Aba): boolean => aba.doc !== aba.limpo;
