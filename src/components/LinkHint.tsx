import React, { useLayoutEffect, useRef, useState } from 'react';

/** A remissão sob o ponteiro e o lugar que ela ocupa na tela. */
export interface LinkHintState {
  /** O próprio `<a>` apontado: é ele que diz se o ponteiro mudou de remissão. */
  element: HTMLElement;
  /** Destino tal como está escrito no documento. */
  href: string;
  /** Onde a remissão chega, quando o destino é um ponto de ancoragem do ato. */
  destination?: string;
  /** Retângulo do link em coordenadas de janela. */
  left: number;
  top: number;
  bottom: number;
}

const MARGIN = 8;
const GAP = 6;

/**
 * Etiqueta com o destino da remissão sob o ponteiro.
 *
 * O endereço de uma remissão não aparece em lugar nenhum da folha: o texto azul
 * anuncia que há um caminho, mas não para onde ele leva, e a única forma de
 * descobrir era abrir o menu do botão direito ou o próprio arquivo salvo. Fora
 * do editor esse papel é da barra de estado do navegador; aqui a folha é um
 * campo editável dentro da aplicação, e a notícia tem de vir do editor.
 *
 * A etiqueta é chrome, e não papel: ela usa a tinta da barra de comandos, fica
 * fora do fluxo do documento e não recebe o ponteiro — o que se lê na folha
 * continua sendo exatamente o que o arquivo exportado contém.
 */
export const LinkHint: React.FC<{ hint: LinkHintState }> = ({ hint }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: hint.left, top: hint.bottom + GAP });

  /*
   * A etiqueta nasce sob o link e sobe para cima dele quando não há folga até o
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
  }, [hint.left, hint.top, hint.bottom, hint.href, hint.destination]);

  return (
    <div
      ref={ref}
      role="tooltip"
      style={{ left: position.left, top: position.top }}
      className="fixed z-30 pointer-events-none max-w-[min(30rem,88vw)] px-2 py-1.5 bg-tinta border border-rule rounded shadow-xl"
    >
      <div className="font-dado text-dado leading-snug text-texto break-all">{hint.href}</div>
      {hint.destination && (
        <div className="text-dado leading-snug text-legenda mt-1 truncate">{hint.destination}</div>
      )}
    </div>
  );
};
