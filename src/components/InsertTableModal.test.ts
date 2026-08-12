import { describe, it, expect } from 'vitest';
import { parseTableSize, MAX_TABLE_ROWS, MAX_TABLE_COLUMNS } from './InsertTableModal';

describe('medida da tabela', () => {
  it('aceita a medida usual', () => {
    expect(parseTableSize('3', '3')).toEqual({ ok: true, rows: 3, columns: 3 });
    expect(parseTableSize(' 4 ', ' 2 ')).toEqual({ ok: true, rows: 4, columns: 2 });
  });

  it('aceita a menor tabela possível', () => {
    expect(parseTableSize('1', '1')).toEqual({ ok: true, rows: 1, columns: 1 });
  });

  it('recusa medida vazia, zerada ou negativa', () => {
    expect(parseTableSize('', '3').ok).toBe(false);
    expect(parseTableSize('3', '').ok).toBe(false);
    expect(parseTableSize('0', '3').ok).toBe(false);
    expect(parseTableSize('3', '-2').ok).toBe(false);
  });

  it('recusa o que não é número inteiro', () => {
    expect(parseTableSize('duas', '3').ok).toBe(false);
    expect(parseTableSize('2,5', '3').ok).toBe(false);
    expect(parseTableSize('2.5', '3').ok).toBe(false);
  });

  /*
   * Aparar caladamente esconderia o erro dentro da folha: quem pediu 500 linhas
   * precisa saber que recebeu outra coisa antes de a tabela existir.
   */
  it('recusa em vez de aparar o que passa do teto', () => {
    expect(parseTableSize(String(MAX_TABLE_ROWS + 1), '3').ok).toBe(false);
    expect(parseTableSize('3', String(MAX_TABLE_COLUMNS + 1)).ok).toBe(false);
    expect(parseTableSize(String(MAX_TABLE_ROWS), String(MAX_TABLE_COLUMNS))).toEqual({
      ok: true,
      rows: MAX_TABLE_ROWS,
      columns: MAX_TABLE_COLUMNS,
    });
  });
});
