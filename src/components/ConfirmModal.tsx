import React from 'react';
import { AlertCircle, Save, Trash2, X } from 'lucide-react';
import {
  BTN_DESTRUTIVO,
  BTN_FANTASMA,
  BTN_FANTASMA_TEXTO,
  BTN_PRIMARIO,
  MODAL_CABECALHO,
  MODAL_CAIXA,
  MODAL_RODAPE,
  MODAL_VEU,
} from '../utils/estilos';

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
    <div className={MODAL_VEU}>
      {/* A decisão pode descartar trabalho: o fio de falha no topo diz isso antes do texto. */}
      <div className={`${MODAL_CAIXA} max-w-md border-t-2 border-t-falha flex flex-col`}>
        <div className={MODAL_CABECALHO}>
          <div className="flex items-center gap-2.5 text-titulo text-texto-forte">
            <AlertCircle size={18} className="text-atencao shrink-0" />
            <span>{title}</span>
          </div>
          <button
            onClick={onCancel}
            className={BTN_FANTASMA}
            title="Cancelar — o ato continua aberto"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 text-lista text-texto leading-relaxed">
          <p>{message}</p>
        </div>

        {/* Rodapé: fantasma → destrutivo → primário. */}
        <div className={`${MODAL_RODAPE} flex-wrap`}>
          <button onClick={onCancel} className={BTN_FANTASMA_TEXTO}>
            Cancelar
          </button>

          <button onClick={onDiscardAndContinue} className={BTN_DESTRUTIVO}>
            <Trash2 size={14} aria-hidden="true" />
            Fechar sem salvar
          </button>

          <button onClick={onSaveAndContinue} className={BTN_PRIMARIO}>
            <Save size={14} aria-hidden="true" />
            Salvar e fechar
          </button>
        </div>
      </div>
    </div>
  );
};
