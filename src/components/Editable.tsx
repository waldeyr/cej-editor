import React, { useLayoutEffect, useRef } from 'react';
import { EDITABLE_TARGET_ATTR } from '../utils/docTargets';

interface EditableProps {
  /** Endereço do campo no documento — ver `utils/docTargets.ts`. */
  target: string;
  html: string;
  onCommit: (html: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  ariaLabel?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onFocus?: () => void;
}

/**
 * Campo editável da folha do ato.
 *
 * O conteúdo é escrito no DOM por efeito, e não por `dangerouslySetInnerHTML`,
 * por um motivo concreto: as ferramentas de texto alteram o DOM diretamente e
 * só então devolvem o resultado ao documento. Com o React reescrevendo o
 * `innerHTML` a cada mudança de props, essa reescrita — idêntica ao que já está
 * na tela — destruiria os nós e, com eles, a seleção do usuário, que perderia o
 * trecho selecionado a cada clique em negrito. Aqui a escrita só acontece quando
 * o texto do documento de fato difere do que está na tela, isto é, quando a
 * mudança veio de fora (desfazer, importação, edição estrutural).
 */
export const Editable: React.FC<EditableProps> = ({
  target,
  html,
  onCommit,
  className,
  style,
  placeholder,
  ariaLabel,
  onKeyDown,
  onFocus,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element && element.innerHTML !== html) element.innerHTML = html;
  }, [html]);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="false"
      aria-label={ariaLabel}
      data-placeholder={placeholder}
      {...{ [EDITABLE_TARGET_ATTR]: target }}
      className={className}
      style={style}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={(event) => onCommit(event.currentTarget.innerHTML)}
    />
  );
};
