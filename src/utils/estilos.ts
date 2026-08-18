/*
 * Receitas de componente do design system claro.
 *
 * As mesmas cadeias de classe se repetiam dezenas de vezes em Toolbar.tsx e
 * nos modais; aqui elas existem uma vez, com o papel de cada uma dito no nome.
 * Todas leem apenas tokens (src/index.css) — nenhuma consulta o tema.
 */

/** Ação primária — uma por vista. No editor é Salvar. */
export const BTN_PRIMARIO =
  'inline-flex items-center gap-1.5 h-7 px-3 rounded-[5px] text-comando ' +
  'bg-acao text-texto-inverso border border-acao shadow-cej-1 ' +
  'hover:bg-acao-forte hover:border-acao-forte transition-colors shrink-0 ' +
  'disabled:opacity-45 disabled:hover:bg-acao';

/** Comando secundário — o corpo da barra de arquivo. */
export const BTN_SECUNDARIO =
  'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[5px] text-comando ' +
  'text-texto bg-sup-1 border border-borda hover:bg-sup-3 hover:border-borda-forte ' +
  'transition-colors shrink-0 disabled:opacity-45 disabled:bg-sup-2 disabled:hover:bg-sup-2';

/** Fantasma — ícone sem moldura em repouso (desfazer, refazer, fechar aba, painel). */
export const BTN_FANTASMA =
  'inline-flex items-center justify-center size-7 rounded-[5px] text-texto-fraco ' +
  'hover:bg-sup-3 hover:text-texto transition-colors shrink-0 ' +
  'disabled:opacity-35 disabled:hover:bg-transparent';

/** Fantasma com rótulo — o "Cancelar" dos rodapés de modal. */
export const BTN_FANTASMA_TEXTO =
  'inline-flex items-center gap-1.5 h-7 px-3 rounded-[5px] text-comando text-texto-fraco ' +
  'hover:bg-sup-3 hover:text-texto transition-colors shrink-0 ' +
  'disabled:opacity-35 disabled:hover:bg-transparent';

/** Véu e caixa das sobreposições modais. */
export const MODAL_VEU =
  'fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,28,40,0.28)] p-4 select-none';

export const MODAL_CAIXA =
  'w-full max-w-lg bg-sup-1 border border-borda rounded-lg shadow-cej-3 overflow-hidden';

export const MODAL_CABECALHO =
  'flex items-center justify-between px-5 py-3.5 border-b border-borda-suave';

export const MODAL_RODAPE =
  'flex items-center justify-end gap-2 px-5 py-3 bg-sup-2 border-t border-borda-suave';

/** Ficha de 24px — barra de texto e barra de estrutura. */
export const FICHA =
  'h-6 inline-flex items-center gap-1 px-2 rounded text-comando text-texto ' +
  'bg-sup-2 border border-borda-suave hover:bg-sup-3 transition-colors shrink-0';

/**
 * Estado ativo de alternador (negrito ligado, alinhamento corrente, tipo do
 * bloco selecionado). Preenchimento suave + borda, nunca sólido: no claro, um
 * azul cheio num botão de 24px pesa mais que o texto que ele formata.
 */
export const FICHA_ATIVA =
  'h-6 inline-flex items-center gap-1 px-2 rounded text-comando ' +
  'bg-acao-suave text-acao-forte border border-acao-borda shrink-0';

/** Destrutivo. */
export const BTN_DESTRUTIVO =
  'inline-flex items-center gap-1.5 h-7 px-3 rounded-[5px] text-comando ' +
  'text-falha bg-falha-suave border border-falha hover:bg-falha hover:text-white ' +
  'transition-colors shrink-0';

/** Campo de entrada. */
export const CAMPO =
  'h-[30px] w-full px-2.5 rounded-[5px] text-comando font-normal text-texto ' +
  'bg-white border border-borda-forte placeholder:text-texto-fraco';

export const CAMPO_ERRO =
  'h-[30px] w-full px-2.5 rounded-[5px] text-comando font-normal text-texto ' +
  'bg-falha-suave border border-falha';
