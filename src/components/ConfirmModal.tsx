import React from 'react';
import { AlertCircle, Save, Trash2, X } from 'lucide-react';

/**
 * A pergunta que se faz quando há trabalho a perder.
 *
 * Desde que o editor abre vários atos em abas, ela só aparece ao **fechar**:
 * abrir um arquivo não descarta mais nada, porque o ato anterior continua na
 * aba dele. Os rótulos dizem "fechar" por isso — um botão que promete
 * "continuar" não diz ao redator o que vai acontecer com o ato que ele vê.
 */
interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  /** Salva o ato e só então o fecha. */
  onSaveAndContinue: () => void;
  /** Fecha o ato, descartando as alterações. */
  onDiscardAndContinue: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  onSaveAndContinue,
  onDiscardAndContinue,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in duration-200 select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2.5 text-amber-400 font-semibold text-base">
            <AlertCircle size={20} className="text-amber-400 shrink-0" />
            <span>{title}</span>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            title="Cancelar — o ato continua aberto"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo */}
        <div className="p-5 text-sm text-slate-300 leading-relaxed">
          <p>{message}</p>
        </div>

        {/* Rodapé com 3 Ações */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 p-4 bg-slate-950/50 border-t border-slate-800">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 transition order-3 sm:order-1"
          >
            Cancelar
          </button>

          <button
            onClick={onDiscardAndContinue}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-800 transition order-2"
          >
            <Trash2 size={14} />
            Fechar sem salvar
          </button>

          <button
            onClick={onSaveAndContinue}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition order-1 sm:order-3 font-semibold"
          >
            <Save size={14} />
            Salvar e fechar
          </button>
        </div>
      </div>
    </div>
  );
};
