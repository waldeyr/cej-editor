import React, { useLayoutEffect, useRef, useState } from 'react';

/** A marca sob o ponteiro — uma remissão ou um ponto de ancoragem — e o lugar que ela ocupa na tela. */
export interface CanvasHintState {
  /** O próprio `<a>` apontado: é ele que diz se o ponteiro mudou de marca. */
  element: HTMLElement;
  /** O que a etiqueta mostra: o destino da remissão, ou o nome do ponto de ancoragem. */
  label: string;
  /** A explicação de uma linha: onde a remissão chega, ou o que é aquela marca. */
  note?: string;
  /** Retângulo da marca em coordenadas de janela. */
  left: number;
  top: number;
  bottom: number;
}

const MARGIN = 8;
const GAP = 6;

/**
 * Etiqueta do que está sob o ponteiro na folha.
 *
 * O endereço de uma remissão não aparece em lugar nenhum da folha: o texto azul
 * anuncia que há um caminho, mas não para onde ele leva, e a única forma de
 * descobrir era abrir o menu do botão direito ou o próprio arquivo salvo. Fora
 * do editor esse papel é da barra de estado do navegador; aqui a folha é um
 * campo editável dentro da aplicação, e a notícia tem de vir do editor.
 *
 * Vale igual para o ponto de ancoragem: o ícone de âncora diz que ali há um
 * destino, e a etiqueta diz por qual nome ele responde — que é o que a caixa de
 * remissão vai oferecer.
 *
 * A etiqueta é chrome, e não papel: ela usa a tinta da barra de comandos, fica
 * fora do fluxo do documento e não recebe o ponteiro — o que se lê na folha
 * continua sendo exatamente o que o arquivo exportado contém.
 */
export const CanvasHint: React.FC<{ hint: CanvasHintState }> = ({ hint }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: hint.left, top: hint.bottom + GAP });

  /*
   * A etiqueta nasce sob a marca e sobe para cima dela quando não há folga até o
   * rodapé — uma remissão na última linha da janela é justamente onde uma
   * etiqueta fixa embaixo ficaria fora da tela.
   */
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const { width, height } = element.getBoundingClientRect();
    const below = hint.bottom + GAP;
    const fits = below + height + MARGIN <= window.innerHeight;

    setPosition({
      left: Math.max(MARGIN, Math.min(hint.left, window.innerWidth - width - MARGIN)),
      top: fits ? below : Math.max(MARGIN, hint.top - height - GAP),
    });
  }, [hint.left, hint.top, hint.bottom, hint.label, hint.note]);

  return (
    <div
      ref={ref}
      role="tooltip"
      style={{ left: position.left, top: position.top }}
      className="fixed z-30 pointer-events-none max-w-[min(30rem,88vw)] px-2 py-1.5 bg-tinta border border-rule rounded shadow-xl"
    >
      <div className="font-dado text-dado leading-snug text-texto break-all">{hint.label}</div>
      {hint.note && (
        <div className="text-dado leading-snug text-legenda mt-1 truncate">{hint.note}</div>
      )}
    </div>
  );
};
