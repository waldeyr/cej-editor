import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Anchor, CornerUpRight, Link2, Link2Off, Unlink } from 'lucide-react';

/** Remissão sob o cursor no momento do clique com o botão direito. */
export interface CanvasMenuLink {
  element: HTMLElement;
  /** Nome da âncora, quando o destino é interno ao ato (`href="#..."`). */
  anchorName?: string;
}

/** Ponto de ancoragem sob o cursor. */
export interface CanvasMenuAnchorPoint {
  element: HTMLElement;
  name: string;
}

export interface CanvasMenuState {
  x: number;
  y: number;
  /** Há trecho de texto selecionado na folha? */
  hasSelection: boolean;
  link?: CanvasMenuLink;
  anchorPoint?: CanvasMenuAnchorPoint;
}

interface CanvasContextMenuProps {
  menu: CanvasMenuState;
  onInsertAnchor: () => void;
  onInsertLink: () => void;
  onFollowAnchor: (name: string) => void;
  onRemoveLink: (element: HTMLElement) => void;
  onRemoveAnchorPoint: (element: HTMLElement) => void;
  onClose: () => void;
}

const MARGIN = 8;

/**
 * Menu do botão direito sobre a folha do ato.
 *
 * As duas operações de remissão viviam apenas na barra de comandos, longe do
 * trecho que o usuário acabou de selecionar. Aqui elas aparecem onde o gesto
 * termina — e, quando o clique cai sobre uma remissão existente, o menu passa a
 * oferecer também segui-la e desfazê-la, que antes não tinham lugar algum.
 *
 * Todos os botões seguram a seleção no `mousedown`: sem isso, o clique no menu
 * tiraria o foco do campo e desfaria justamente o trecho que se quer marcar.
 */
export const CanvasContextMenu: React.FC<CanvasContextMenuProps> = ({
  menu,
  onInsertAnchor,
  onInsertLink,
  onFollowAnchor,
  onRemoveLink,
  onRemoveAnchorPoint,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: menu.x, top: menu.y });

  // O menu nasce onde o cursor está e recua para dentro da janela quando o
  // clique acontece perto da borda direita ou do rodapé.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    setPosition({
      left: Math.max(MARGIN, Math.min(menu.x, window.innerWidth - width - MARGIN)),
      top: Math.max(MARGIN, Math.min(menu.y, window.innerHeight - height - MARGIN)),
    });
  }, [menu.x, menu.y]);

  useEffect(() => {
    const closeOnOutside = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  const item = (
    label: string,
    hint: string | undefined,
    icon: React.ReactNode,
    onActivate: () => void
  ) => (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        onActivate();
        onClose();
      }}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-comando text-texto hover:bg-rule/60 transition-colors text-left"
    >
      <span className="shrink-0 text-legenda">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="font-dado text-dado text-legenda shrink-0">{hint}</span>}
    </button>
  );

  const { link, anchorPoint, hasSelection } = menu;

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Ações sobre o trecho"
      style={{ left: position.left, top: position.top }}
      className="fixed z-40 min-w-56 py-1 bg-tinta border border-rule rounded-lg shadow-2xl select-none"
    >
      {link?.anchorName &&
        item('Ir para a âncora', `#${link.anchorName}`, <CornerUpRight size={14} />, () =>
          onFollowAnchor(link.anchorName as string)
        )}

      {item(
        hasSelection ? 'Inserir âncora no trecho' : 'Inserir âncora',
        undefined,
        <Anchor size={14} />,
        onInsertAnchor
      )}

      {item(
        hasSelection ? 'Inserir link no trecho' : 'Inserir link',
        undefined,
        <Link2 size={14} />,
        onInsertLink
      )}

      {(link || anchorPoint) && (
        <div className="my-1 border-t border-rule/60" role="separator" />
      )}

      {link &&
        item('Remover link', undefined, <Link2Off size={14} />, () => onRemoveLink(link.element))}

      {anchorPoint &&
        item('Remover âncora', `#${anchorPoint.name}`, <Unlink size={14} />, () =>
          onRemoveAnchorPoint(anchorPoint.element)
        )}
    </div>
  );
};
