import React, { useState } from 'react';
import { Globe, X, Download, Loader2 } from 'lucide-react';
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

interface OpenUrlModalProps {
  isOpen: boolean;
  /** Baixa e abre o ato. Lança com uma mensagem legível quando não dá certo. */
  onSubmit: (url: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Endereço de um ato publicado na internet.
 *
 * Um endereço colado da barra do navegador costuma vir sem o esquema, e exigir
 * que o usuário digite `https://` seria cobrar dele uma formalidade que a
 * própria caixa sabe suprir. Endereços em outros esquemas não são completados:
 * um `file://` ou `javascript:` não é um ato publicado.
 */
export function normalizeDocumentUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const address = new URL(withScheme);
    if (address.protocol !== 'http:' && address.protocol !== 'https:') return null;
    return address.href;
  } catch {
    return null;
  }
}

export const OpenUrlModal: React.FC<OpenUrlModalProps> = ({ isOpen, onSubmit, onClose }) => {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const close = () => {
    setUrl('');
    setError('');
    onClose();
  };

  /*
   * A caixa só se fecha quando o ato chega. Um endereço errado, um servidor
   * fora do ar ou um 404 são frequentes o bastante para que fechar a caixa e
   * mandar o usuário recomeçar do botão seja um custo desnecessário: o erro
   * aparece aqui, com o endereço ainda no campo, pronto para ser corrigido.
   */
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const address = normalizeDocumentUrl(url);
    if (!address) {
      setError('Informe um endereço http:// ou https:// válido.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await onSubmit(address);
      close();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível baixar o documento.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={MODAL_VEU}>
      <div className={MODAL_CAIXA}>
        <div className={MODAL_CABECALHO}>
          <div className="flex items-center gap-2 text-titulo text-texto-forte">
            <Globe size={18} className="text-acao shrink-0" />
            <span>Abrir Ato de um Endereço</span>
          </div>
          <button onClick={close} disabled={busy} className={BTN_FANTASMA} title="Fechar">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="px-5 py-4 space-y-3">
            <label htmlFor="cej-url" className="block text-lista text-texto-fraco">
              Endereço do ato publicado em HTML
            </label>
            <input
              id="cej-url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={busy}
              placeholder="https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d13090.htm"
              className={`${CAMPO} disabled:opacity-60`}
              autoFocus
            />

            {error ? (
              <p
                className="text-lista text-falha bg-falha-suave border border-falha rounded-[5px] px-3 py-2"
                role="alert"
              >
                {error}
              </p>
            ) : (
              <p className="text-lista text-texto-fraco">
                O arquivo é baixado como veio do servidor: a codificação original é detectada aqui
                mesmo, como num arquivo do disco.
              </p>
            )}
          </div>

          <div className={MODAL_RODAPE}>
            <button type="button" onClick={close} disabled={busy} className={BTN_FANTASMA_TEXTO}>
              Cancelar
            </button>
            <button type="submit" disabled={busy || !url.trim()} className={BTN_PRIMARIO}>
              {busy ? (
                <Loader2 size={13} className="animate-spin" aria-hidden="true" />
              ) : (
                <Download size={13} aria-hidden="true" />
              )}
              {busy ? 'Baixando…' : 'Abrir'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
