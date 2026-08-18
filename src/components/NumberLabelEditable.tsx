import React, { useEffect, useRef, useState } from 'react';

interface NumberLabelEditableProps {
  /** O rótulo já normalizado — "Art. 5º", "§ 2º", "I -", "a)". */
  label: string;
  /** Classe do `<span>` fora de edição, igual à que a folha já usava. */
  className: string;
  /** Risca semanticamente o rótulo quando o dispositivo inteiro foi tachado. */
  struckThrough?: boolean;
  /** Grava o novo rótulo, só quando ele mudou de fato. */
  onCommit: (value: string) => void;
  /** O que vem depois do rótulo na mesma linha — o espaço ou o " - " do agrupador. */
  children?: React.ReactNode;
}

/**
 * O identificador do dispositivo, editável no lugar em que já aparecia.
 *
 * Continua fora do campo do caput (invariante 3 do `CLAUDE.md`): o clique não
 * abre uma caixa à parte, troca o próprio `<span>` por um campo do tamanho do
 * texto, que nunca ganha `data-cej-target` e por isso nunca se mistura ao
 * conteúdo do dispositivo. `hasCanonicalLabel` (`utils/blockTypes.ts`) já
 * decide sozinho, pelo formato do texto, se o resultado da edição passa a ser
 * numeração automática de novo ou fica congelado — nenhuma marca extra é
 * necessária aqui.
 */
export const NumberLabelEditable: React.FC<NumberLabelEditableProps> = ({
  label,
  className,
  struckThrough = false,
  onCommit,
  children,
}) => {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editando) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editando]);

  const confirmar = () => {
    setEditando(false);
    const valor = rascunho.trim();
    if (valor && valor !== label) onCommit(valor);
  };

  const cancelar = () => {
    setRascunho(label);
    setEditando(false);
  };

  if (editando) {
    return (
      <>
        <input
          ref={inputRef}
          value={rascunho}
          onChange={(event) => setRascunho(event.target.value)}
          onBlur={confirmar}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              confirmar();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              cancelar();
            }
          }}
          size={Math.max(1, rascunho.length)}
          aria-label="Numeração do dispositivo"
          /* Afordância sobre o papel branco: cores literais, fora do tema (invariante 2). */
          className={`${className} bg-[#e8f0fb] outline-none ring-1 ring-[#1351b4] rounded-sm`}
        />
        {children}
      </>
    );
  }

  return (
    <>
      <span
        className={className}
        title="Clique para editar a numeração"
        onClick={() => {
          setRascunho(label);
          setEditando(true);
        }}
      >
        {struckThrough ? <s>{label}</s> : label}
      </span>
      {children}
    </>
  );
};
