import React from 'react';
import { Anchor, CornerUpRight, Link2, Link2Off, Unlink } from 'lucide-react';
import { ContextMenu, ContextMenuItem } from './ContextMenu';

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

/**
 * Menu do botão direito sobre a folha do ato.
 *
 * As duas operações de remissão viviam apenas na barra de comandos, longe do
 * trecho que o usuário acabou de selecionar. Aqui elas aparecem onde o gesto
 * termina — e, quando o clique cai sobre uma remissão existente, o menu passa a
 * oferecer também segui-la e desfazê-la, que antes não tinham lugar algum.
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
  const { link, anchorPoint, hasSelection } = menu;

  return (
    <ContextMenu x={menu.x} y={menu.y} ariaLabel="Ações sobre o trecho" onClose={onClose}>
      {link?.anchorName && (
        <ContextMenuItem
          label="Ir para a âncora"
          hint={`#${link.anchorName}`}
          icon={<CornerUpRight size={14} />}
          onActivate={() => onFollowAnchor(link.anchorName as string)}
          onClose={onClose}
        />
      )}

      <ContextMenuItem
        label={hasSelection ? 'Inserir âncora no trecho' : 'Inserir âncora'}
        icon={<Anchor size={14} />}
        onActivate={onInsertAnchor}
        onClose={onClose}
      />

      <ContextMenuItem
        label={hasSelection ? 'Inserir link no trecho' : 'Inserir link'}
        icon={<Link2 size={14} />}
        onActivate={onInsertLink}
        onClose={onClose}
      />

      {(link || anchorPoint) && <div className="my-1 border-t border-rule/60" role="separator" />}

      {link && (
        <ContextMenuItem
          label="Remover link"
          icon={<Link2Off size={14} />}
          onActivate={() => onRemoveLink(link.element)}
          onClose={onClose}
        />
      )}

      {anchorPoint && (
        <ContextMenuItem
          label="Remover âncora"
          hint={`#${anchorPoint.name}`}
          icon={<Unlink size={14} />}
          onActivate={() => onRemoveAnchorPoint(anchorPoint.element)}
          onClose={onClose}
        />
      )}
    </ContextMenu>
  );
};
