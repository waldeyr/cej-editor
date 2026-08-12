import React, { useEffect, useState } from 'react';
import { Table, X, Check } from 'lucide-react';

/** Teto de linhas de uma tabela inserida pela barra. */
export const MAX_TABLE_ROWS = 100;
/** Teto de colunas de uma tabela inserida pela barra. */
export const MAX_TABLE_COLUMNS = 20;

const DEFAULT_ROWS = '3';
const DEFAULT_COLUMNS = '3';

export type TableSize =
  | { ok: true; rows: number; columns: number }
  | { ok: false; error: string };

/**
 * Lê a medida pedida para a tabela.
 *
 * Recusa em vez de aparar: quem digitou 500 linhas errou a conta ou o campo, e
 * receber 100 caladamente esconde o erro dentro da folha.
 */
export const parseTableSize = (rowsInput: string, columnsInput: string): TableSize => {
  const rows = Number(rowsInput.trim());
  const columns = Number(columnsInput.trim());

  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || columns < 1) {
    return { ok: false, error: 'Informe números inteiros maiores que zero para linhas e colunas.' };
  }
  if (rows > MAX_TABLE_ROWS) {
    return { ok: false, error: `O máximo é ${MAX_TABLE_ROWS} linhas.` };
  }
  if (columns > MAX_TABLE_COLUMNS) {
    return { ok: false, error: `O máximo é ${MAX_TABLE_COLUMNS} colunas.` };
  }
  return { ok: true, rows, columns };
};

/** Quanto da grade cabe na prévia antes de ela virar só um borrão. */
const PREVIEW_ROWS = 6;
const PREVIEW_COLUMNS = 8;

interface InsertTableModalProps {
  isOpen: boolean;
  onInsert: (rows: number, columns: number) => void;
  onClose: () => void;
}

/**
 * A medida da tabela, pedida de uma vez só.
 *
 * Linhas e colunas são uma decisão única — a grade só existe depois das duas —
 * e vinham em duas caixas do navegador, uma depois da outra, sem como voltar da
 * segunda para corrigir a primeira. Aqui os dois campos ficam lado a lado, com
 * a grade desenhada ao lado enquanto se digita.
 */
export const InsertTableModal: React.FC<InsertTableModalProps> = ({ isOpen, onInsert, onClose }) => {
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [error, setError] = useState('');

  // Cada abertura parte da medida usual, não da última tentativa.
  useEffect(() => {
    if (isOpen) {
      setRows(DEFAULT_ROWS);
      setColumns(DEFAULT_COLUMNS);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const size = parseTableSize(rows, columns);
    if (!size.ok) {
      setError(size.error);
      return;
    }
    onInsert(size.rows, size.columns);
    onClose();
  };

  const size = parseTableSize(rows, columns);
  const previewRows = size.ok ? Math.min(size.rows, PREVIEW_ROWS) : 0;
  const previewColumns = size.ok ? Math.min(size.columns, PREVIEW_COLUMNS) : 0;
  const truncated = size.ok && (size.rows > PREVIEW_ROWS || size.columns > PREVIEW_COLUMNS);

  const campoClass =
    'w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500 transition';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in duration-200 select-none">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-base">
            <Table size={20} className="shrink-0" />
            <span>Inserir Tabela</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            title="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="flex items-start gap-4">
            <div className="grid grid-cols-2 gap-3 flex-1">
              <div className="space-y-1.5">
                <label htmlFor="cej-table-rows" className="block text-xs text-slate-300">
                  Linhas
                </label>
                <input
                  id="cej-table-rows"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_TABLE_ROWS}
                  value={rows}
                  onChange={(e) => {
                    setRows(e.target.value);
                    setError('');
                  }}
                  className={campoClass}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="cej-table-columns" className="block text-xs text-slate-300">
                  Colunas
                </label>
                <input
                  id="cej-table-columns"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_TABLE_COLUMNS}
                  value={columns}
                  onChange={(e) => {
                    setColumns(e.target.value);
                    setError('');
                  }}
                  className={campoClass}
                />
              </div>
            </div>

            {/* A grade pedida, desenhada enquanto se digita */}
            <div
              className="shrink-0 w-32 pt-6 flex flex-col items-center gap-1"
              aria-hidden="true"
            >
              {size.ok ? (
                <>
                  <div
                    className="grid gap-px w-full"
                    style={{ gridTemplateColumns: `repeat(${previewColumns}, minmax(0, 1fr))` }}
                  >
                    {Array.from({ length: previewRows * previewColumns }, (_, i) => (
                      <div
                        key={i}
                        className={`h-3 border border-slate-700 ${
                          i < previewColumns ? 'bg-slate-700/70' : 'bg-slate-950'
                        }`}
                      />
                    ))}
                  </div>
                  {truncated && <span className="text-[10px] text-slate-500 leading-none">…</span>}
                </>
              ) : (
                <div className="h-3 w-full" />
              )}
            </div>
          </div>

          {error ? (
            <p
              className="text-xs text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2"
              role="alert"
            >
              {error}
            </p>
          ) : (
            <p className="text-xs text-slate-400">
              A primeira linha nasce como cabeçalho. Depois de inserida, os botões acima da tabela
              acrescentam e retiram linhas, colunas e células.
            </p>
          )}

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
              disabled={!size.ok}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-xs font-semibold text-black transition flex items-center gap-1.5"
            >
              <Check size={13} /> Inserir
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
