import React, { useEffect, useState } from 'react';
import { Save, X, Check } from 'lucide-react';

interface SaveAsModalProps {
  isOpen: boolean;
  /** Nome que o ato sugere, já com a extensão. */
  suggested: string;
  onSubmit: (fileName: string) => void;
  onClose: () => void;
}

/** Nome de arquivo a partir de um texto qualquer: sem acento, sem pontuação, sem espaço. */
function normalizarNome(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * O nome que o ato sugere para o arquivo.
 *
 * Sai do título do documento, que por sua vez segue a epígrafe: um decreto
 * salvo sem que ninguém pense no assunto vira `decreto_n_13090_de_4_de_agosto_de_2026.html`.
 * O nome é reduzido porque ele viaja para sistemas legados, que nem sempre
 * lidam com acento ou espaço no nome do arquivo.
 */
export function suggestedFileName(title: string): string {
  return `${normalizarNome(title) || 'ato_normativo'}.html`;
}

/**
 * O que o redator digitou virando nome de arquivo.
 *
 * A extensão é do programa, não dele: quem escrever "decreto.html" não recebe
 * `decreto.html.html` de volta, e quem não escrever extensão alguma recebe a
 * dele mesmo assim — o ato é sempre gravado em HTML.
 */
export function fileNameFromInput(input: string): string {
  const base = normalizarNome(input.trim().replace(/\.html?$/i, ''));
  return base ? `${base}.html` : '';
}

/**
 * O nome do arquivo, quando o sistema não pergunta.
 *
 * No aplicativo de mesa e nos navegadores que têm seletor de gravação, quem
 * pergunta o nome é o próprio seletor, e esta caixa não aparece. Ela existe
 * para o caminho da descarga direta, que grava sem perguntar nada — antes,
 * quem perguntava ali era um `prompt` do navegador, que fala a língua do
 * sistema operacional e interrompe o trabalho (ver `CLAUDE.md`, invariante 6).
 */
export const SaveAsModal: React.FC<SaveAsModalProps> = ({ isOpen, suggested, onSubmit, onClose }) => {
  const [draft, setDraft] = useState(suggested);

  // O campo parte sempre do nome sugerido, que costuma ser o que se quer.
  useEffect(() => {
    if (isOpen) setDraft(suggested);
  }, [isOpen, suggested]);

  if (!isOpen) return null;

  const fileName = fileNameFromInput(draft);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!fileName) return;
    onSubmit(fileName);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in duration-200 select-none">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-base">
            <Save size={20} className="shrink-0" />
            <span>Salvar Como</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            title="Fechar sem salvar"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-3">
          <label htmlFor="cej-nome-arquivo" className="block text-xs text-slate-300">
            Nome do arquivo
          </label>
          <input
            id="cej-nome-arquivo"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="decreto_13090.html"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
            autoFocus
          />

          <p className="text-xs text-slate-400">
            O ato é gravado em HTML no padrão Planalto, na codificação que a barra de estado anuncia. Será
            salvo como <span className="text-slate-300">{fileName || '—'}</span>.
          </p>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!fileName}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-xs font-semibold text-black transition flex items-center gap-1.5"
            >
              <Check size={13} /> Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
