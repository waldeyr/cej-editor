import React, { useState } from 'react';
import { Copy, ExternalLink, Plus, X } from 'lucide-react';
import { Aba, precisaSalvar } from '../types/abas';
import { dicaDaAba, rotuloDaAba } from '../utils/abas';
import { ContextMenu, ContextMenuItem } from './ContextMenu';

interface BarraDeAbasProps {
  abas: readonly Aba[];
  ativa: string;
  onAtivar: (id: string) => void;
  onFechar: (id: string) => void;
  onNova: () => void;
  /**
   * Move a aba para uma janela do sistema operacional à parte — só existe no
   * aplicativo de mesa. No navegador o próprio gesto de arrastar a aba para
   * fora da janela já faz isto, e por isso, quando esta função falta, a aba
   * não oferece o menu de contexto nenhum.
   */
  onMoverParaNovaJanela?: (id: string) => void;
  /**
   * Abre uma cópia do ato numa janela nova, sem fechar a aba de origem — ao
   * lado de `onMoverParaNovaJanela`, que em vez disso a leva embora.
   */
  onAbrirCopiaEmNovaJanela?: (id: string) => void;
}

/** Qual aba pediu o menu de contexto, e onde o clique aconteceu. */
interface MenuDaAba {
  abaId: string;
  x: number;
  y: number;
}

/**
 * Os atos abertos, um por aba.
 *
 * Fica entre a barra de comandos e a folha, e não como quarta linha da barra:
 * é onde o FrontPage a punha, e é a leitura natural — os comandos agem sobre o
 * ato, e o ato é o que a aba escolhe. A aba ativa sobe para a superfície das
 * barras (--sup-1) e leva o fio de ação no topo; as inativas ficam um degrau
 * abaixo, na superfície de painel.
 */
export const BarraDeAbas: React.FC<BarraDeAbasProps> = ({
  abas,
  ativa,
  onAtivar,
  onFechar,
  onNova,
  onMoverParaNovaJanela,
  onAbrirCopiaEmNovaJanela,
}) => {
  const [menu, setMenu] = useState<MenuDaAba | null>(null);

  return (
    <div
      role="tablist"
      aria-label="Atos abertos"
      className="w-full shrink-0 h-8 flex items-stretch gap-px bg-sup-2 border-b border-borda overflow-x-auto select-none"
    >
      {abas.map((aba) => {
        const selecionada = aba.id === ativa;
        const rotulo = rotuloDaAba(aba);

        return (
          <div
            key={aba.id}
            onContextMenu={(e) => {
              if (!onMoverParaNovaJanela && !onAbrirCopiaEmNovaJanela) return;
              e.preventDefault();
              setMenu({ abaId: aba.id, x: e.clientX, y: e.clientY });
            }}
            className={`group flex items-center gap-1 pl-2.5 pr-1 min-w-32 max-w-52 shrink-0 border-r border-borda-suave transition-colors ${
              selecionada
                ? 'bg-sup-1 shadow-[inset_0_2px_0_0_var(--color-acao)]'
                : 'bg-sup-2 hover:bg-sup-3'
            }`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={selecionada}
              onClick={() => onAtivar(aba.id)}
              title={dicaDaAba(aba)}
              className={`flex items-center gap-1.5 min-w-0 flex-1 h-full text-comando text-left truncate ${
                selecionada ? 'text-texto-forte' : 'text-texto-fraco'
              }`}
            >
              {/*
                A marca de trabalho não salvo é um ponto, e não um asterisco no
                nome: o nome da aba é o nome do arquivo, e enfeitá-lo faria o
                redator procurar no disco um arquivo que não se chama assim.
              */}
              <span
                aria-hidden="true"
                className={`size-1.5 rounded-full shrink-0 ${precisaSalvar(aba) ? 'bg-atencao' : 'bg-transparent'}`}
              />
              <span className="truncate">{rotulo}</span>
            </button>

            <button
              type="button"
              onClick={() => onFechar(aba.id)}
              title={`Fechar “${rotulo}”`}
              aria-label={`Fechar “${rotulo}”`}
              className="inline-flex items-center justify-center size-5 rounded-[5px] shrink-0 text-texto-fraco hover:text-texto hover:bg-sup-3 transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={onNova}
        title="Abrir um ato novo em outra aba (Ctrl+T)"
        aria-label="Abrir um ato novo em outra aba"
        className="inline-flex items-center justify-center size-7 my-0.5 ml-1 rounded-[5px] shrink-0 text-texto-fraco hover:text-texto hover:bg-sup-3 transition-colors"
      >
        <Plus size={15} />
      </button>

      {menu &&
        (onMoverParaNovaJanela || onAbrirCopiaEmNovaJanela) &&
        (() => {
          // Um atalho de teclado (Ctrl+W) pode fechar a aba com o menu ainda
          // aberto; sem esta guarda, o clique em "Abrir em nova janela" agiria
          // sobre uma aba que já não existe.
          const alvoDoMenu = abas.find((a) => a.id === menu.abaId);
          if (!alvoDoMenu) return null;

          return (
            <ContextMenu
              x={menu.x}
              y={menu.y}
              ariaLabel={`Ações de “${rotuloDaAba(alvoDoMenu)}”`}
              onClose={() => setMenu(null)}
            >
              {onMoverParaNovaJanela && (
                <ContextMenuItem
                  label="Abrir em nova janela"
                  icon={<ExternalLink size={14} />}
                  onActivate={() => onMoverParaNovaJanela(menu.abaId)}
                  onClose={() => setMenu(null)}
                />
              )}

              {onAbrirCopiaEmNovaJanela && (
                <ContextMenuItem
                  label="Abrir uma cópia em nova janela"
                  icon={<Copy size={14} />}
                  onActivate={() => onAbrirCopiaEmNovaJanela(menu.abaId)}
                  onClose={() => setMenu(null)}
                />
              )}
            </ContextMenu>
          );
        })()}
    </div>
  );
};
