import React, { useEffect, useState } from 'react';
import { Type, X, RotateCcw, Check } from 'lucide-react';

interface DocumentTitleModalProps {
  isOpen: boolean;
  /** Título corrente do documento. */
  title: string;
  /** Título que a epígrafe daria, quando ela existe. */
  suggested: string;
  /** O título foi definido à mão? */
  isManual: boolean;
  onApply: (title: string) => void;
  /** Volta a seguir a epígrafe. */
  onFollowEpigrafe: () => void;
  onClose: () => void;
}

/**
 * O `<title>` do ato.
 *
 * Ele não aparece na folha — vive no cabeçalho do arquivo salvo, nomeia a aba
 * do navegador que o abrir e sugere o nome do arquivo ao salvar. Por seguir a
 * epígrafe por padrão, quase nunca precisa de atenção; esta caixa existe para
 * as vezes em que precisa, e para desfazer a escolha depois.
 */
export const DocumentTitleModal: React.FC<DocumentTitleModalProps> = ({
  isOpen,
  title,
  suggested,
  isManual,
  onApply,
  onFollowEpigrafe,
  onClose,
}) => {
  const [draft, setDraft] = useState(title);

  // O campo parte sempre do título corrente: a caixa é aberta para conferir
  // tanto quanto para mudar.
  useEffect(() => {
    if (isOpen) setDraft(title);
  }, [isOpen, title]);

  if (!isOpen) return null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const clean = draft.trim();
    if (!clean) return;
    onApply(clean);
    onClose();
  };

  const podeSeguirEpigrafe = isManual && Boolean(suggested) && suggested !== draft.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in duration-200 select-none">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-base">
            <Type size={20} className="shrink-0" />
            <span>Título do Documento</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            title="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-3">
          <label htmlFor="cej-title" className="block text-xs text-slate-300">
            Vai para o <code className="font-mono text-amber-300">&lt;title&gt;</code> do arquivo salvo — nomeia a aba
            do navegador e sugere o nome do arquivo ao salvar.
          </label>
          <input
            id="cej-title"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="DECRETO Nº 13.090, DE 4 DE AGOSTO DE 2026"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
            autoFocus
          />

          <p className="text-xs text-slate-400">
            {isManual ? (
              <>
                Definido à mão: corrigir a epígrafe não altera mais este título.
                {suggested && (
                  <>
                    {' '}
                    A epígrafe hoje diz <span className="text-slate-300">“{suggested}”</span>.
                  </>
                )}
              </>
            ) : (
              <>Segue a epígrafe do ato. Ao gravar aqui, passa a valer o que você escrever.</>
            )}
          </p>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                onFollowEpigrafe();
                onClose();
              }}
              disabled={!podeSeguirEpigrafe}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-amber-300 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition flex items-center gap-1.5"
              title="Voltar a derivar o título da epígrafe"
            >
              <RotateCcw size={13} /> Voltar a seguir a epígrafe
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!draft.trim()}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-xs font-semibold text-black transition flex items-center gap-1.5"
              >
                <Check size={13} /> Gravar
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
