import React, { useState } from 'react';
import { Link2, Search, X, Check, Anchor, ExternalLink } from 'lucide-react';
import { AnchorPoint, LinkChoice } from '../utils/anchors';

interface LinkModalProps {
  isOpen: boolean;
  /** Destinos disponíveis — os pontos de ancoragem já marcados no ato. */
  anchors: AnchorPoint[];
  selectedText?: string;
  onSelectLink: (choice: LinkChoice) => void;
  onClose: () => void;
}

/**
 * Para onde o trecho selecionado vai levar.
 *
 * As duas respostas possíveis convivem aqui de propósito: um ponto de
 * ancoragem do próprio ato, escolhido na lista, ou um endereço qualquer,
 * colado no campo de baixo. É a caixa que dá sentido à separação entre marcar
 * um destino e criar a remissão que chega até ele.
 */
export const LinkModal: React.FC<LinkModalProps> = ({
  isOpen,
  anchors,
  selectedText,
  onSelectLink,
  onClose,
}) => {
  const [search, setSearch] = useState('');
  const [url, setUrl] = useState('');

  if (!isOpen) return null;

  const term = search.toLowerCase();
  const filtered = anchors.filter(
    (anchor) =>
      anchor.label.toLowerCase().includes(term) ||
      anchor.name.toLowerCase().includes(term) ||
      anchor.location.toLowerCase().includes(term)
  );

  const choose = (choice: LinkChoice) => {
    onSelectLink(choice);
    onClose();
  };

  const submitUrl = (event: React.FormEvent) => {
    event.preventDefault();
    const clean = url.trim();
    if (!clean) return;
    choose({ kind: 'url', href: clean });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in duration-200 select-none">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-base">
            <Link2 size={20} className="shrink-0" />
            <span>Inserir Link</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            title="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {selectedText ? (
          <div className="px-5 py-2.5 bg-amber-950/40 border-b border-amber-800/50 text-xs text-amber-200">
            <span className="font-medium text-amber-400">Texto selecionado:</span> “{selectedText}”
            <span className="text-amber-200/70"> — escolha para onde ele deve levar.</span>
          </div>
        ) : (
          <div className="px-5 py-2.5 bg-slate-800/60 border-b border-slate-700/60 text-xs text-slate-300">
            💡 Dica: selecione um trecho de texto no documento para transformá-lo em link.
          </div>
        )}

        <div className="p-4 border-b border-slate-800 bg-slate-900/90">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar ponto de ancoragem (ex: Anexo I, Art. 1º...)"
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:border-amber-500 transition"
              autoFocus
            />
          </div>
        </div>

        {/* Pontos de ancoragem do ato */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 divide-y divide-slate-800/50">
          {filtered.length > 0 ? (
            filtered.map((anchor) => (
              <div
                key={anchor.name}
                onClick={() => choose({ kind: 'anchor', name: anchor.name })}
                className="pt-2 first:pt-0 p-3 rounded-lg hover:bg-amber-950/40 border border-transparent hover:border-amber-800/50 cursor-pointer transition flex items-center justify-between gap-3 group"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="font-semibold text-slate-200 group-hover:text-amber-300 text-sm flex items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 rounded bg-slate-800 group-hover:bg-amber-900/60 text-xs font-mono text-amber-400 shrink-0">
                      #{anchor.name}
                    </span>
                    <span className="truncate">{anchor.label}</span>
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-1">
                    <Anchor size={11} className="shrink-0" />
                    <span className="truncate">em {anchor.location}</span>
                  </div>
                </div>
                <button className="text-xs px-2.5 py-1 rounded bg-amber-500/20 group-hover:bg-amber-500 text-amber-300 group-hover:text-black font-semibold transition flex items-center gap-1 shrink-0">
                  <Check size={12} /> Selecionar
                </button>
              </div>
            ))
          ) : (
            <div className="py-8 px-4 text-center text-slate-400 text-sm leading-relaxed">
              {anchors.length === 0 ? (
                <>
                  Este ato ainda não tem pontos de ancoragem.
                  <br />
                  <span className="text-slate-500">
                    Selecione o trecho de destino e use <strong className="text-slate-300">Inserir âncora</strong> para
                    criar um — ou cole um endereço abaixo.
                  </span>
                </>
              ) : (
                <>Nenhum ponto de ancoragem encontrado para “{search}”.</>
              )}
            </div>
          )}
        </div>

        {/* Endereço completo — externo ou não */}
        <form onSubmit={submitUrl} className="p-4 bg-slate-950 border-t border-slate-800 space-y-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <ExternalLink size={12} /> Ou informe um endereço completo
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.planalto.gov.br/... ou #ancora"
              className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              disabled={!url.trim()}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium text-amber-300 border border-amber-800/60 transition flex items-center gap-1"
            >
              <Link2 size={13} /> Usar endereço
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
