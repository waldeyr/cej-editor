import React from 'react';

interface StatusBarProps {
  declaredEncoding?: string;
  blockCount: number;
  issueCount: { errors: number; warnings: number };
  position?: string;
  justSaved: boolean;
  /** Resposta passageira a um gesto — uma remissão sem destino, por exemplo. */
  notice?: string;
}

const Separator: React.FC = () => (
  <span className="text-rule" aria-hidden="true">
    ·
  </span>
);

/**
 * Estado do documento: codificação, extensão, conformidade e posição corrente.
 *
 * O distintivo de codificação vivia na barra de ferramentas, entre botões de
 * ação — mas codificação é estado, não comando. Aqui ele fica ao lado das
 * outras leituras técnicas, em fonte monoespaçada, e a barra de comandos
 * passa a tratar apenas de ações.
 */
export const StatusBar: React.FC<StatusBarProps> = ({
  declaredEncoding,
  blockCount,
  issueCount,
  position,
  justSaved,
  notice,
}) => {
  const { errors, warnings } = issueCount;

  const state = (() => {
    if (errors > 0) {
      return {
        color: 'var(--color-falha)',
        label: `${errors} ${errors === 1 ? 'erro' : 'erros'}${
          warnings > 0 ? `, ${warnings} ${warnings === 1 ? 'aviso' : 'avisos'}` : ''
        }`,
      };
    }
    if (warnings > 0) {
      return {
        color: 'var(--color-selo)',
        label: `${warnings} ${warnings === 1 ? 'aviso' : 'avisos'}`,
      };
    }
    return { color: 'var(--color-rank)', label: 'Documento válido' };
  })();

  return (
    <footer
      className="w-full shrink-0 h-7 flex items-center gap-2 px-3 bg-tinta border-t border-rule/60 select-none whitespace-nowrap overflow-hidden"
      aria-label="Estado do documento"
    >
      {/*
        Ordem de sacrifício numa janela estreita: primeiro a codificação, depois
        a contagem de blocos. O estado de conformidade e a posição corrente são
        o que se consulta enquanto se redige, e ficam até o fim.
      */}
      <span className="font-dado text-dado text-legenda hidden md:inline shrink-0">
        {declaredEncoding || 'ISO-8859-1'} / Windows-1252
      </span>

      <span className="hidden md:inline">
        <Separator />
      </span>

      <span className="font-dado text-dado text-legenda hidden sm:inline shrink-0">
        {blockCount} {blockCount === 1 ? 'bloco' : 'blocos'}
      </span>

      <span className="hidden sm:inline">
        <Separator />
      </span>

      <span className="inline-flex items-center gap-1.5 text-comando shrink-0" style={{ color: state.color }}>
        <span
          className="size-1.5 rounded-full shrink-0"
          style={{ backgroundColor: state.color }}
          aria-hidden="true"
        />
        {state.label}
      </span>

      {justSaved && (
        <>
          <Separator />
          <span className="text-comando text-legenda" role="status">
            Salvo
          </span>
        </>
      )}

      {notice && (
        <>
          <Separator />
          <span className="text-comando text-selo truncate min-w-0" role="status">
            {notice}
          </span>
        </>
      )}

      <span className="flex-1" />

      {position && <span className="font-dado text-dado text-legenda truncate">{position}</span>}
    </footer>
  );
};
