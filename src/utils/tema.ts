/*
 * O tema do chrome: claro por padrão, escuro opcional, ou o que o sistema
 * mandar. Só o chrome muda — a folha do ato é branca nos dois temas.
 *
 * A escolha vive em `localStorage` sob `cej:tema`, e a aplicação é um único
 * atributo no <html>: `data-tema="claro" | "escuro"`. Nada mais no código
 * consulta o tema; todos os componentes leem apenas tokens (src/index.css).
 *
 * O mesmo cálculo roda inline em index.html antes da primeira pintura, para
 * não haver clarão de tema errado ao abrir — mudou aqui, confira lá.
 */

export type Tema = 'claro' | 'escuro' | 'sistema';

export const TEMAS: readonly Tema[] = ['claro', 'escuro', 'sistema'];

const CHAVE = 'cej:tema';

/** A preferência guardada. Padrão de instalação: claro. */
export const temaGuardado = (): Tema => {
  try {
    const lido = localStorage.getItem(CHAVE);
    if (lido === 'claro' || lido === 'escuro' || lido === 'sistema') return lido;
  } catch {
    // Navegação anônima barra o armazenamento; vale o padrão.
  }
  return 'claro';
};

/** `sistema` consulta o sistema operacional; os outros dois respondem por si. */
const resolver = (tema: Tema): 'claro' | 'escuro' =>
  tema === 'sistema'
    ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'escuro'
      : 'claro'
    : tema;

/** Pinta o chrome — é o atributo que a folha de tokens escura observa. */
export const aplicarTema = (tema: Tema): void => {
  document.documentElement.dataset.tema = resolver(tema);
};

/** Guarda a escolha e a aplica de uma vez. */
export const guardarTema = (tema: Tema): void => {
  try {
    localStorage.setItem(CHAVE, tema);
  } catch {
    // Sem armazenamento a escolha vale só até fechar — melhor que nada.
  }
  aplicarTema(tema);
};

export const NOME_DO_TEMA: Record<Tema, string> = {
  claro: 'Claro',
  escuro: 'Escuro',
  sistema: 'Acompanhar o sistema',
};
