import React, { useEffect, useState } from 'react';
import { Save, X, Check } from 'lucide-react';
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
    <div className={MODAL_VEU}>
      <div className={MODAL_CAIXA}>
        <div className={MODAL_CABECALHO}>
          <div className="flex items-center gap-2 text-titulo text-texto-forte">
            <Save size={18} className="text-acao shrink-0" />
            <span>Salvar Como</span>
          </div>
          <button onClick={onClose} className={BTN_FANTASMA} title="Fechar sem salvar">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="px-5 py-4 space-y-3">
            <label htmlFor="cej-nome-arquivo" className="block text-lista text-texto-fraco">
              Nome do arquivo
            </label>
            <input
              id="cej-nome-arquivo"
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="decreto_13090.html"
              className={CAMPO}
              autoFocus
            />

            <p className="text-lista text-texto-fraco">
              O ato é gravado em HTML no padrão Planalto, na codificação que a barra de estado
              anuncia. Será salvo como <span className="text-texto">{fileName || '—'}</span>.
            </p>
          </div>

          <div className={MODAL_RODAPE}>
            <button type="button" onClick={onClose} className={BTN_FANTASMA_TEXTO}>
              Cancelar
            </button>
            <button type="submit" disabled={!fileName} className={BTN_PRIMARIO}>
              <Check size={13} aria-hidden="true" /> Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
