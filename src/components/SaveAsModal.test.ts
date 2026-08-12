import { describe, it, expect } from 'vitest';
import { fileNameFromInput, suggestedFileName } from './SaveAsModal';

describe('nome do arquivo do ato', () => {
  /*
   * O arquivo salvo viaja para sistemas legados, que nem sempre lidam com
   * acento ou espaço no nome — a mesma razão de a gravação ser em ISO-8859-1.
   */
  it('reduz o título do ato a um nome sem acento, sem pontuação e sem espaço', () => {
    expect(suggestedFileName('DECRETO Nº 13.090, DE 4 DE AGOSTO DE 2026')).toBe(
      'decreto_n_13_090_de_4_de_agosto_de_2026.html'
    );
  });

  it('recai em ato_normativo quando o título não deixa nada aproveitável', () => {
    expect(suggestedFileName('§ —')).toBe('ato_normativo.html');
    expect(suggestedFileName('')).toBe('ato_normativo.html');
  });

  it('não duplica a extensão que o redator já escreveu', () => {
    expect(fileNameFromInput('decreto.html')).toBe('decreto.html');
    expect(fileNameFromInput('decreto.htm')).toBe('decreto.html');
  });

  it('põe a extensão em quem não escreveu extensão alguma', () => {
    expect(fileNameFromInput('Decreto 13.090')).toBe('decreto_13_090.html');
  });

  it('não devolve nome nenhum quando não há o que salvar', () => {
    expect(fileNameFromInput('   ')).toBe('');
    expect(fileNameFromInput('.html')).toBe('');
  });
});
