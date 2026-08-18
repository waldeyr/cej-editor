import React, { useState, useMemo } from 'react';
import { AlertCircle, AlertTriangle, ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { LegislativeBlock, LegislativeDocument, ValidationIssue } from '../types/legislative';
import { indentOf, inkOf, isAgrupador, textInkOf, tickWidthOf, weightOf } from '../utils/rank';
import { inicioDoAnexo } from '../utils/blockTypes';

interface SidebarTreeProps {
  doc: LegislativeDocument;
  selectedBlockId?: string;
  onSelectBlock: (id: string) => void;
  /** Move o dispositivo de `from` para a posição `to` da lista original. */
  onReorderBlocks: (from: number, to: number) => void;
  issues: ValidationIssue[];
  isOpen: boolean;
}

const RAIL_WIDTH = 18;

/**
 * Vista do Ato — dois níveis de aproximação do mesmo objeto.
 *
 * A trilha (à esquerda, 18px, sem rolagem) desenha uma marca por dispositivo
 * para o ato inteiro: largura e densidade codificam a posição hierárquica, e o
 * marcador azul de ação indica a posição corrente. Ela permanece na tela mesmo com o
 * painel recolhido, de modo que a silhueta do ato em redação nunca desaparece.
 *
 * A lista (à direita, recolhível) traz os mesmos dispositivos rotulados e
 * recuados pela hierarquia real. Trilha, lista e barra de comandos consomem a
 * mesma rampa de src/utils/rank.ts e por isso não divergem entre si.
 */
export const SidebarTree: React.FC<SidebarTreeProps> = ({
  doc,
  selectedBlockId,
  onSelectBlock,
  onReorderBlocks,
  issues,
  isOpen,
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    header: true,
    dispositivos: true,
    fecho: true,
    anexos: true,
  });

  // Reordenação por arrasto. `dropIndex` é a posição de inserção, isto é, a
  // fronteira entre duas linhas — por isso vai de 0 até blocks.length.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const endDrag = () => {
    setDragIndex(null);
    setDropIndex(null);
  };

  const blocks = doc.blocks;

  const issueByBlockId = useMemo(() => {
    const map = new Map<string, ValidationIssue>();
    issues.forEach((issue) => {
      if (issue.blockId && !map.has(issue.blockId)) map.set(issue.blockId, issue);
    });
    return map;
  }, [issues]);

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  /**
   * Marca de conformidade da lista.
   *
   * O ícone diz que há algo a ver; a dica do mouse diz o quê, com as palavras
   * do próprio validador. Sem ela, o triângulo âmbar só anunciava a existência
   * de um problema e deixava o usuário caçá-lo na folha — e um aviso que não
   * se explica é indistinguível de um enfeite.
   *
   * A moldura em volta é alvo de mouse: 12px de ícone é pouco para uma dica
   * que só aparece com o ponteiro parado sobre ela. As margens negativas
   * devolvem o espaço que a moldura tomaria, de modo que a linha não muda.
   */
  const issueMark = (issue: ValidationIssue) => {
    const Icon = issue.severity === 'error' ? AlertCircle : AlertTriangle;
    const severity = issue.severity === 'error' ? 'Erro' : 'Aviso';

    return (
      <span className="shrink-0 -m-1 p-1 flex items-center" title={issue.message}>
        <Icon
          size={12}
          role="img"
          aria-label={`${severity}: ${issue.message}`}
          className={issue.severity === 'error' ? 'text-falha' : 'text-atencao'}
        />
      </span>
    );
  };

  const selectedIndex = blocks.findIndex((b) => b.id === selectedBlockId);

  const handleRailClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (blocks.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    const index = Math.min(blocks.length - 1, Math.max(0, Math.floor(ratio * blocks.length)));
    onSelectBlock(blocks[index].id);
  };

  /*
   * A trilha é uma affordance gráfica: a lista rotulada ao lado é seu
   * equivalente acessível e é por ela que a navegação por teclado acontece.
   * Marcar a trilha como aria-hidden evita anunciar centenas de marcas mudas.
   */
  const rail = (
    <div
      onClick={handleRailClick}
      aria-hidden="true"
      className="relative shrink-0 h-full bg-sup-2 border-r border-borda cursor-pointer"
      style={{ width: RAIL_WIDTH }}
    >
      {blocks.map((block, index) => {
        const issue = issueByBlockId.get(block.id);
        const isSelected = index === selectedIndex;

        /*
         * A posição é proporcional à posição no documento; a altura é a fatia
         * proporcional, mas limitada. Sem o teto, um ato de seis dispositivos
         * renderiza marcas de 105px — uma mancha, não um mapa. Com ele, atos
         * curtos mostram marcas finas espalhadas e atos longos comprimem até o
         * piso de 2px, sem nunca precisar de rolagem nem de medição em JS.
         */
        const geometry = {
          top: `${(index / blocks.length) * 100}%`,
          height: `${100 / blocks.length}%`,
          maxHeight: 10,
          minHeight: 2,
        };

        return (
          <React.Fragment key={block.id}>
            <span
              className="absolute left-[2px] rounded-[1px]"
              style={{
                ...geometry,
                width: `${(tickWidthOf(block.type) / 100) * 12}px`,
                backgroundColor: isSelected ? 'var(--color-acao)' : 'var(--color-rank)',
                opacity: isSelected ? 1 : inkOf(block.type),
              }}
            />
            {issue && (
              /*
               * A trilha continua na tela com o painel recolhido, e é então a
               * única notícia de que há um problema: a dica do mouse vale aqui
               * pelo mesmo motivo que na lista.
               */
              <span
                title={issue.message}
                className="absolute right-[1px] w-[3px] rounded-[1px]"
                style={{
                  ...geometry,
                  backgroundColor:
                    issue.severity === 'error' ? 'var(--color-falha)' : 'var(--color-atencao)',
                }}
              />
            )}
          </React.Fragment>
        );
      })}

      {/* Marcador da posição atual — o único elemento animado da aplicação. */}
      {selectedIndex >= 0 && (
        <span
          className="absolute left-0 w-[2px] bg-acao transition-[top] duration-150 ease-out pointer-events-none"
          style={{
            top: `${(selectedIndex / blocks.length) * 100}%`,
            height: `${100 / blocks.length}%`,
            maxHeight: 10,
            minHeight: 2,
          }}
        />
      )}
    </div>
  );

  const sectionButtonClass =
    'w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-etiqueta uppercase text-texto-fraco hover:text-texto transition-colors';

  const leafRowClass =
    'w-full text-left px-2 py-1.5 rounded text-lista text-texto-fraco hover:bg-sup-3 hover:text-texto transition-colors flex items-center justify-between gap-2';

  const renderLeaf = (id: string, label: string, issueId?: string) => {
    const issue = issueId ? issues.find((i) => i.id === issueId) : undefined;
    const isSelected = selectedBlockId === id;

    return (
      <button
        type="button"
        onClick={() => onSelectBlock(id)}
        className={`${leafRowClass} ${isSelected ? 'bg-acao-suave text-texto-forte' : ''}`}
      >
        <span className="truncate">{label}</span>
        {issue && issueMark(issue)}
      </button>
    );
  };

  /**
   * Uma linha da lista. `index` é a posição no ato inteiro, e não na seção:
   * o arrasto reordena `doc.blocks` por índice, e um índice relativo à seção
   * do anexo moveria o dispositivo errado.
   */
  const corte = inicioDoAnexo(blocks);
  const corpo = blocks.slice(0, corte);
  const anexo = blocks.slice(corte);

  const renderBlockRow = (block: LegislativeBlock, index: number) => {
    const issue = issueByBlockId.get(block.id);
    const isSelected = selectedBlockId === block.id;
    const agrupador = isAgrupador(block.type);
    const previousIsAgrupador =
      index > 0 && isAgrupador(blocks[index - 1].type);

    const preview =
      block.type === 'OMISSIS'
        ? 'Omissis'
        : block.type === 'TABELA'
        ? 'Tabela'
        : block.rawText;

    /*
     * Agrupadores já trazem a própria denominação no conteúdo
     * ("CAPÍTULO I - DAS DISPOSIÇÕES PRELIMINARES"), então
     * exibir também o numberLabel repetiria "CAPÍTULO I" na
     * mesma linha. Dispositivos são o caso oposto: o rótulo é
     * renderizado à parte do texto, como no documento.
     */
    const showNumberLabel = Boolean(block.numberLabel) && !agrupador;
    const isDragging = dragIndex === index;
    const dropsAbove = dropIndex === index && dragIndex !== null;
    const dropsBelow = dropIndex === index + 1 && dragIndex !== null;

    return (
      <div
        key={block.id}
        role="button"
        tabIndex={0}
        draggable
        aria-grabbed={isDragging}
        onClick={() => onSelectBlock(block.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelectBlock(block.id);
            return;
          }
          // Equivalente de teclado do arrasto, para quem navega sem mouse.
          if (event.altKey && event.key === 'ArrowUp' && index > 0) {
            event.preventDefault();
            onReorderBlocks(index, index - 1);
          }
          if (event.altKey && event.key === 'ArrowDown' && index < blocks.length - 1) {
            event.preventDefault();
            onReorderBlocks(index, index + 2);
          }
        }}
        onDragStart={(event) => {
          setDragIndex(index);
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', String(index));
        }}
        onDragOver={(event) => {
          if (dragIndex === null) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          const rect = event.currentTarget.getBoundingClientRect();
          const below = event.clientY > rect.top + rect.height / 2;
          setDropIndex(below ? index + 1 : index);
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (dragIndex !== null && dropIndex !== null) onReorderBlocks(dragIndex, dropIndex);
          endDrag();
        }}
        onDragEnd={endDrag}
        style={{ paddingLeft: indentOf(block.type) }}
        className={`group w-full text-left pr-2 py-1 rounded flex items-center justify-between gap-2 transition-colors cursor-grab active:cursor-grabbing ${
          agrupador && !previousIsAgrupador ? 'mt-2 border-t border-borda-suave pt-2' : ''
        } ${isDragging ? 'opacity-40 bg-sup-4' : ''} ${
          dropsAbove ? 'shadow-[inset_0_2px_0_0_var(--color-acao)]' : ''
        } ${dropsBelow ? 'shadow-[inset_0_-2px_0_0_var(--color-acao)]' : ''} ${
          isSelected
            ? 'bg-acao-suave border-l-2 border-l-acao'
            : 'border-l-2 border-l-transparent hover:bg-sup-3'
        }`}
      >
        <span className="flex items-baseline gap-1.5 min-w-0">
          <GripVertical
            size={11}
            aria-hidden="true"
            className="shrink-0 self-center text-transparent group-hover:text-texto-fraco transition-colors"
          />
          {showNumberLabel && (
            <span
              className="text-lista shrink-0"
              style={{
                color: 'var(--color-rank)',
                opacity: textInkOf(block.type),
                fontWeight: weightOf(block.type),
              }}
            >
              {block.numberLabel}
            </span>
          )}
          <span
            className={`truncate ${
              agrupador ? 'text-etiqueta uppercase' : 'text-lista'
            } ${isSelected ? 'text-texto-forte' : 'text-texto-fraco'}`}
          >
            {preview}
          </span>
        </span>

        {issue && issueMark(issue)}
      </div>
    );
  };

  return (
    <aside className="h-full flex bg-sup-2 border-r border-borda select-none">
      {rail}

      {/*
        Abaixo de 1024px o painel rotulado consumiria quase metade da janela e
        espremeria o papel a algo ilegível, então apenas a trilha permanece.
        Resolver isso em CSS — e não em estado — evita disputar o botão de
        recolher: a preferência do usuário volta intacta ao alargar a janela.
      */}
      {isOpen && (
        <nav
          aria-label="Vista do ato"
          className="w-72 h-full hidden lg:flex flex-col overflow-hidden"
        >
          <div className="px-3 py-2.5 border-b border-borda-suave shrink-0">
            <span className="text-etiqueta uppercase text-texto-fraco">Vista do ato</span>
            <p className="text-lista text-texto-fraco mt-0.5">Arraste para reordenar</p>
          </div>

          <div className="flex-1 overflow-y-auto px-1.5 py-2 space-y-1">
            {/* Parte inicial */}
            <div>
              <button type="button" onClick={() => toggleNode('header')} className={sectionButtonClass}>
                {expandedNodes.header ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                Parte inicial
              </button>
              {expandedNodes.header && (
                <div className="mt-0.5">
                  {renderLeaf('epigrafe', 'Epígrafe', 'epigrafe-missing')}
                  {renderLeaf('ementa', 'Ementa', 'ementa-missing')}
                  {renderLeaf('preambulo', 'Preâmbulo', 'preambulo-missing')}
                </div>
              )}
            </div>

            {/* Dispositivos — recuados pela hierarquia real */}
            <div>
              <button
                type="button"
                onClick={() => toggleNode('dispositivos')}
                className={sectionButtonClass}
              >
                {expandedNodes.dispositivos ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                Dispositivos
              </button>

              {expandedNodes.dispositivos && (
                <div className="mt-0.5">
                  {corpo.map((block, posicao) => renderBlockRow(block, posicao))}
                </div>
              )}
            </div>

            {/* Parte final */}
            <div>
              <button type="button" onClick={() => toggleNode('fecho')} className={sectionButtonClass}>
                {expandedNodes.fecho ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                Parte final
              </button>
              {expandedNodes.fecho && (
                <div className="mt-0.5">
                  {renderLeaf('fecho', 'Fecho, local e data')}
                  {renderLeaf('assinatura', `Assinaturas (${doc.assinaturas.length})`)}
                </div>
              )}
            </div>

            {/*
              Anexos — depois da parte final, que é onde eles são lidos. A seção
              própria existe para que a fronteira seja visível: arrastar um
              dispositivo para cá o leva para depois das assinaturas, e o
              contrário também vale.
            */}
            {anexo.length > 0 && (
              <div>
                <button type="button" onClick={() => toggleNode('anexos')} className={sectionButtonClass}>
                  {expandedNodes.anexos ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  Anexos
                </button>
                {expandedNodes.anexos && (
                  <div className="mt-0.5">
                    {anexo.map((block, posicao) => renderBlockRow(block, corte + posicao))}
                  </div>
                )}
              </div>
            )}
          </div>
        </nav>
      )}
    </aside>
  );
};
