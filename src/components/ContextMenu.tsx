import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

const MARGIN = 8;

interface ContextMenuProps {
  x: number;
  y: number;
  /** Nomeia o menu para quem usa leitor de tela — cada chamador diz do que se trata. */
  ariaLabel: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * O corpo de um menu de contexto: nasce onde o cursor está, recua para dentro
 * da janela quando o clique cai perto de uma borda, e se fecha sozinho no
 * clique fora, no Esc, ou se a página rolar ou mudar de tamanho debaixo dele.
 *
 * Extraído de `CanvasContextMenu` quando a barra de abas ganhou o próprio
 * menu — as duas têm itens completamente diferentes, mas o mesmo corpo.
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, ariaLabel, onClose, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    setPosition({
      left: Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN)),
      top: Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN)),
    });
  }, [x, y]);

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

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={ariaLabel}
      style={{ left: position.left, top: position.top }}
      className="fixed z-40 min-w-56 py-1 bg-sup-1 border border-borda rounded-lg shadow-cej-3 select-none"
    >
      {children}
    </div>
  );
};

interface ContextMenuItemProps {
  label: string;
  hint?: string;
  icon: React.ReactNode;
  /** Item que desfaz ou apaga algo: tinta de falha, hover na suave dela. */
  destrutivo?: boolean;
  onActivate: () => void;
  onClose: () => void;
}

/**
 * Um item do menu. Segura a seleção no `mousedown`: sem isso, o clique no
 * item tiraria o foco do campo e desfaria o trecho que o menu se propõe a
 * marcar (invariante 4).
 */
export const ContextMenuItem: React.FC<ContextMenuItemProps> = ({
  label,
  hint,
  icon,
  destrutivo = false,
  onActivate,
  onClose,
}) => (
  <button
    type="button"
    onMouseDown={(event) => event.preventDefault()}
    onClick={() => {
      onActivate();
      onClose();
    }}
    className={`w-full flex items-center gap-2 px-3 py-1.5 text-comando transition-colors text-left ${
      destrutivo
        ? 'text-falha hover:bg-falha-suave'
        : 'text-texto hover:bg-acao-suave hover:text-acao-forte'
    }`}
  >
    <span className={`shrink-0 ${destrutivo ? 'text-falha' : 'text-texto-fraco'}`}>{icon}</span>
    <span className="flex-1 truncate">{label}</span>
    {hint && <span className="font-dado text-dado text-texto-fraco shrink-0">{hint}</span>}
  </button>
);
