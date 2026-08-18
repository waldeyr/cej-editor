import React, { useEffect, useState } from 'react';
import { Type, X, RotateCcw, Check } from 'lucide-react';
import {
  BTN_FANTASMA,
  BTN_FANTASMA_TEXTO,
  BTN_PRIMARIO,
  CAMPO,
  MODAL_CABECALHO,
  MODAL_CAIXA,
  MODAL_RODAPE,
  MODAL_VEU,
} from '../utils/estilos';

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
    <div className={MODAL_VEU}>
      <div className={MODAL_CAIXA}>
        <div className={MODAL_CABECALHO}>
          <div className="flex items-center gap-2 text-titulo text-texto-forte">
            <Type size={18} className="text-acao shrink-0" />
            <span>Título do Documento</span>
          </div>
          <button onClick={onClose} className={BTN_FANTASMA} title="Fechar">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="px-5 py-4 space-y-3">
            <label htmlFor="cej-title" className="block text-lista text-texto-fraco">
              Vai para o <code className="font-dado text-texto">&lt;title&gt;</code> do arquivo salvo —
              nomeia a aba do navegador e sugere o nome do arquivo ao salvar.
            </label>
            <input
              id="cej-title"
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="DECRETO Nº 13.090, DE 4 DE AGOSTO DE 2026"
              className={CAMPO}
              autoFocus
            />

            <p className="text-lista text-texto-fraco">
              {isManual ? (
                <>
                  Definido à mão: corrigir a epígrafe não altera mais este título.
                  {suggested && (
                    <>
                      {' '}
                      A epígrafe hoje diz <span className="text-texto">“{suggested}”</span>.
                    </>
                  )}
                </>
              ) : (
                <>Segue a epígrafe do ato. Ao gravar aqui, passa a valer o que você escrever.</>
              )}
            </p>
          </div>

          {/* Rodapé: fantasma → secundário (voltar à epígrafe) → primário. */}
          <div className={`${MODAL_RODAPE} justify-between`}>
            <button
              type="button"
              onClick={() => {
                onFollowEpigrafe();
                onClose();
              }}
              disabled={!podeSeguirEpigrafe}
              className={BTN_FANTASMA_TEXTO}
              title="Voltar a derivar o título da epígrafe"
            >
              <RotateCcw size={13} aria-hidden="true" /> Voltar a seguir a epígrafe
            </button>

            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className={BTN_FANTASMA_TEXTO}>
                Cancelar
              </button>
              <button type="submit" disabled={!draft.trim()} className={BTN_PRIMARIO}>
                <Check size={13} aria-hidden="true" /> Gravar
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
