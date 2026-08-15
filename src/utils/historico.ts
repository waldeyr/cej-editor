import { LegislativeDocument } from '../types/legislative';
import { ComHistorico } from '../types/abas';

/**
 * Desfazer e refazer, como álgebra pura.
 *
 * Isto era o gancho `useHistory`, e deixou de ser: com vários atos abertos há
 * uma pilha por aba, e gancho não se instancia em laço. A história passou a ser
 * um trio de campos dentro do registro da aba, e este módulo, as funções que o
 * transformam — o que também as torna testáveis sem montar componente algum.
 */

export const MAX_HISTORICO = 50;

export const podeDesfazer = (h: ComHistorico): boolean => h.passado.length > 0;
export const podeRefazer = (h: ComHistorico): boolean => h.futuro.length > 0;

/**
 * Empilha uma alteração — e **devolve o mesmo objeto quando nada mudou**.
 *
 * Essa identidade não é economia de memória: a marca de trabalho não salvo é
 * `doc !== limpo`, comparada por identidade justamente porque este ponto
 * garante que documento igual é o mesmo objeto. Trocá-la por uma cópia nova
 * acenderia a marca de "não salvo" a cada tecla que não altera nada — e a folha
 * devolve o HTML do campo a cada perda de foco, altere ele o texto ou não.
 */
export function registrar<T extends ComHistorico>(
  h: T,
  proximo: LegislativeDocument | ((atual: LegislativeDocument) => LegislativeDocument)
): T {
  const doc = typeof proximo === 'function' ? proximo(h.doc) : proximo;
  if (doc === h.doc) return h;
  if (JSON.stringify(doc) === JSON.stringify(h.doc)) return h;

  const passado = [...h.passado, h.doc];
  return {
    ...h,
    doc,
    passado: passado.length > MAX_HISTORICO ? passado.slice(passado.length - MAX_HISTORICO) : passado,
    futuro: [],
  };
}

export function desfazer<T extends ComHistorico>(h: T): T {
  if (!podeDesfazer(h)) return h;
  return {
    ...h,
    doc: h.passado[h.passado.length - 1],
    passado: h.passado.slice(0, -1),
    futuro: [h.doc, ...h.futuro],
  };
}

export function refazer<T extends ComHistorico>(h: T): T {
  if (!podeRefazer(h)) return h;
  return {
    ...h,
    doc: h.futuro[0],
    passado: [...h.passado, h.doc],
    futuro: h.futuro.slice(1),
  };
}

/**
 * Adota um documento e joga fora a história.
 *
 * É o que acontece ao abrir um arquivo: o ato anterior não é passo anterior
 * deste, e `Ctrl+Z` não pode atravessar de um ato para outro.
 */
export function recomecar<T extends ComHistorico>(h: T, doc: LegislativeDocument): T {
  return { ...h, doc, passado: [], futuro: [] };
}
