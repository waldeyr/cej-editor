import { LegislativeDocument } from '../types/legislative';
import { Aba, ArquivoDoAto, EstadoDasAbas, estaSuja } from '../types/abas';
import { desfazer, recomecar, refazer, registrar } from './historico';
import { htmlToPlainText } from './docTargets';

/**
 * Os atos abertos, e qual deles está na folha.
 *
 * Só uma folha se desenha por janela — a aba inativa vive aqui, não no DOM.
 * É essa escolha que preserva as consultas globais de que o editor depende
 * (`focusEditableTarget`, `currentDoc`, os `id="block-…"`): duas folhas na mesma
 * página duplicariam `data-cej-target` e o campo com o foco passaria a ser
 * escrito no documento errado.
 */

let contador = 0;

/** Identificador de aba: sobrevive ao recarregamento porque nomeia o rascunho. */
export const novoIdDeAba = (): string =>
  `aba-${Date.now().toString(36)}-${(contador++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function criarAba(
  doc: LegislativeDocument,
  opcoes: { id?: string; arquivo?: ArquivoDoAto | null; limpo?: boolean } = {}
): Aba {
  return {
    id: opcoes.id ?? novoIdDeAba(),
    doc,
    passado: [],
    futuro: [],
    /*
     * `limpo: false` é para o ato que nunca chegou a um arquivo — rascunho
     * recuperado da sessão anterior. Ele nasce sujo de propósito: é trabalho que
     * ninguém gravou, e trocá-lo de documento sem perguntar seria perdê-lo.
     */
    limpo: opcoes.limpo === false ? null : doc,
    selectedBlockId: doc.blocks[0]?.id,
    arquivo: opcoes.arquivo ?? null,
    acabouDeSalvar: false,
    rolagem: 0,
  };
}

export const abaAtiva = (estado: EstadoDasAbas): Aba =>
  estado.abas.find((aba) => aba.id === estado.ativa) ?? estado.abas[0];

export const temTrabalhoASalvar = (estado: EstadoDasAbas): Aba[] => estado.abas.filter(estaSuja);

/**
 * O nome da aba.
 *
 * O arquivo manda quando existe: é assim que o redator distingue dois atos de
 * epígrafe parecida numa pasta de projeto. Sem arquivo, vale o título do ato,
 * pela mesma regra do nome que a barra de comandos já mostra.
 */
export function rotuloDaAba(aba: Aba): string {
  if (aba.arquivo) return aba.arquivo.nome;
  const titulo = aba.doc.title || htmlToPlainText(aba.doc.epigrafe);
  return titulo.trim() || 'Ato sem título';
}

/**
 * A dica da aba: de que arquivo o ato veio, e se há trabalho a perder.
 *
 * Segue a forma que o botão de título da barra já usa — duas quebras separando
 * o que a coisa é do que se pode fazer com ela.
 */
export function dicaDaAba(aba: Aba): string {
  const origem =
    aba.arquivo?.caminho ??
    aba.arquivo?.origem ??
    (aba.arquivo ? aba.arquivo.nome : 'Ainda não salvo em arquivo');

  return estaSuja(aba) ? `${origem}\n\nTem alterações não salvas` : origem;
}

export type AcaoDasAbas =
  | { tipo: 'abrir'; aba: Aba }
  | { tipo: 'ativar'; id: string }
  /** `vazio` só entra em cena ao fechar a última aba — ver `reduzirAbas`. */
  | { tipo: 'fechar'; id: string; vazio: Aba }
  | {
      tipo: 'alterar';
      id?: string;
      doc: LegislativeDocument | ((atual: LegislativeDocument) => LegislativeDocument);
    }
  | { tipo: 'adotar'; id?: string; doc: LegislativeDocument; arquivo?: ArquivoDoAto | null; limpo?: boolean }
  | { tipo: 'desfazer'; id?: string }
  | { tipo: 'refazer'; id?: string }
  | { tipo: 'salvo'; id?: string; doc: LegislativeDocument; arquivo?: ArquivoDoAto | null }
  | { tipo: 'limparAvisoDeSalvo'; id?: string }
  | { tipo: 'selecionar'; id?: string; blocoId?: string }
  | { tipo: 'guardarRolagem'; id?: string; rolagem: number };

const mapear = (estado: EstadoDasAbas, id: string | undefined, mudar: (aba: Aba) => Aba): EstadoDasAbas => {
  const alvo = id ?? estado.ativa;
  let mudou = false;
  const abas = estado.abas.map((aba) => {
    if (aba.id !== alvo) return aba;
    const proxima = mudar(aba);
    if (proxima !== aba) mudou = true;
    return proxima;
  });
  return mudou ? { ...estado, abas } : estado;
};

export function reduzirAbas(estado: EstadoDasAbas, acao: AcaoDasAbas): EstadoDasAbas {
  switch (acao.tipo) {
    case 'abrir':
      return { abas: [...estado.abas, acao.aba], ativa: acao.aba.id };

    case 'ativar':
      return estado.abas.some((aba) => aba.id === acao.id) ? { ...estado, ativa: acao.id } : estado;

    case 'fechar': {
      const indice = estado.abas.findIndex((aba) => aba.id === acao.id);
      if (indice < 0) return estado;

      /*
       * Fechar a única aba deixaria a janela sem folha — e a folha é o
       * documento. Em vez de uma tela vazia a projetar, o gesto vale por
       * "Novo": o ato sai e um em branco toma o lugar dele. O trabalho não
       * salvo já foi decidido antes de chegar aqui.
       */
      if (estado.abas.length === 1) return { abas: [acao.vazio], ativa: acao.vazio.id };

      const abas = estado.abas.filter((aba) => aba.id !== acao.id);
      if (acao.id !== estado.ativa) return { ...estado, abas };

      // A vizinha da direita herda o lugar; na última aba, a da esquerda.
      const vizinha = abas[Math.min(indice, abas.length - 1)];
      return { abas, ativa: vizinha.id };
    }

    case 'alterar':
      return mapear(estado, acao.id, (aba) => registrar(aba, acao.doc));

    case 'adotar':
      return mapear(estado, acao.id, (aba) => ({
        ...recomecar(aba, acao.doc),
        limpo: acao.limpo === false ? null : acao.doc,
        selectedBlockId: acao.doc.blocks[0]?.id,
        arquivo: acao.arquivo !== undefined ? acao.arquivo : aba.arquivo,
      }));

    case 'desfazer':
      return mapear(estado, acao.id, desfazer);

    case 'refazer':
      return mapear(estado, acao.id, refazer);

    case 'salvo':
      return mapear(estado, acao.id, (aba) => ({
        ...aba,
        /*
         * O documento gravado pode não ser o que está em `aba.doc`: quem salva
         * lê antes o campo com o foco, e essa leitura entra como alteração.
         * A versão limpa é a que foi para o disco, e ela precisa ser o mesmo
         * objeto que ficou no documento, senão a marca de não salvo não apaga.
         */
        doc: aba.doc === acao.doc ? aba.doc : acao.doc,
        limpo: aba.doc === acao.doc ? aba.doc : acao.doc,
        arquivo: acao.arquivo !== undefined ? acao.arquivo : aba.arquivo,
        acabouDeSalvar: true,
      }));

    case 'limparAvisoDeSalvo':
      return mapear(estado, acao.id, (aba) =>
        aba.acabouDeSalvar ? { ...aba, acabouDeSalvar: false } : aba
      );

    case 'selecionar':
      return mapear(estado, acao.id, (aba) =>
        aba.selectedBlockId === acao.blocoId ? aba : { ...aba, selectedBlockId: acao.blocoId }
      );

    case 'guardarRolagem':
      return mapear(estado, acao.id, (aba) =>
        aba.rolagem === acao.rolagem ? aba : { ...aba, rolagem: acao.rolagem }
      );
  }
}

/**
 * A aba que já mostra este arquivo, se houver.
 *
 * Existe por causa da remissão relativa: a medida provisória de prova tem 1.550
 * delas, e seguir cada uma abrindo aba nova encheria a tira com o mesmo ato
 * dezenas de vezes. Segui-la é ir para o ato, não abrir outra cópia dele.
 */
export function abaComArquivo(estado: EstadoDasAbas, caminho: string): Aba | undefined {
  const alvo = caminho.toLowerCase();
  return estado.abas.find((aba) => aba.arquivo?.caminho?.toLowerCase() === alvo);
}
