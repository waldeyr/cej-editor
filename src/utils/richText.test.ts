import { describe, it, expect } from 'vitest';
import { applyInlineFormat, EditableSegment } from './richText';
import { EDITABLE_TARGET_ATTR } from './docTargets';

/** Um campo editável da folha, com o endereço que o canvas lhe daria. */
function campo(html: string, target: string): HTMLElement {
  const element = document.createElement('div');
  element.setAttribute(EDITABLE_TARGET_ATTR, target);
  element.innerHTML = html;
  document.body.appendChild(element);
  return element;
}

function segmento(element: HTMLElement, range: Range): EditableSegment {
  return { element, target: element.getAttribute(EDITABLE_TARGET_ATTR)!, range };
}

/** Último nó de texto do campo, onde a seleção arrastada termina. */
function ultimoTexto(element: HTMLElement): Text {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  while (walker.nextNode()) last = walker.currentNode as Text;
  return last!;
}

function primeiroTexto(element: HTMLElement): Text {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  walker.nextNode();
  return walker.currentNode as Text;
}

describe('tachado sobre o dispositivo inteiro', () => {
  /*
   * A seleção arrastada com o mouse ancora nos nós de texto — `("Fica…", 0)` —
   * e não no elemento do campo. Para o DOM são pontos de fronteira distintos;
   * para o redator é o mesmo gesto de selecionar o dispositivo inteiro, e é o
   * gesto que manda o tachado abranger também o rótulo ("Art. 2º"), fora do
   * campo. Comparar fronteiras deixava o rótulo sem risco justamente no caso
   * mais comum.
   */
  it('reconhece o campo inteiro quando a seleção ancora nos nós de texto', () => {
    const element = campo('<b>Fica</b> revogado o cargo.', 'block:b1');
    const range = document.createRange();
    range.setStart(primeiroTexto(element), 0);
    const fim = ultimoTexto(element);
    range.setEnd(fim, fim.length);

    const result = applyInlineFormat([segmento(element, range)], 'strikethrough');

    expect(result.applied).toBe(true);
    expect(result.fullyCoveredTargets).toEqual(['block:b1']);
  });

  it('reconhece o campo inteiro também com as fronteiras no elemento', () => {
    const element = campo('Fica revogado o cargo.', 'block:b2');
    const range = document.createRange();
    range.selectNodeContents(element);

    const result = applyInlineFormat([segmento(element, range)], 'strikethrough');

    expect(result.fullyCoveredTargets).toEqual(['block:b2']);
  });

  it('reconhece o caput inteiro quando os nós formatados fragmentam a seleção', () => {
    const element = campo('<b>Fica</b>&nbsp;revogado o cargo.', 'block:b2-formatado');
    const range = document.createRange();
    range.setStart(primeiroTexto(element), 0);
    const fim = ultimoTexto(element);
    range.setEnd(fim, fim.length);

    const result = applyInlineFormat([segmento(element, range)], 'strikethrough');

    expect(result.fullyCoveredTargets).toEqual(['block:b2-formatado']);
  });

  it('não confunde um trecho do texto com o dispositivo inteiro', () => {
    const element = campo('Fica revogado o cargo.', 'block:b3');
    const texto = primeiroTexto(element);
    const range = document.createRange();
    range.setStart(texto, 5);
    range.setEnd(texto, 13);

    const result = applyInlineFormat([segmento(element, range)], 'strikethrough');

    expect(result.applied).toBe(true);
    expect(result.fullyCoveredTargets).toEqual([]);
  });

  /*
   * O espaço que sobra na ponta da seleção não é texto do dispositivo que
   * ficou de fora — largar a seleção um caractere antes do fim não pode
   * desfazer o gesto.
   */
  it('tolera o espaço em branco que a seleção deixa nas pontas', () => {
    const element = campo('Fica revogado o cargo. ', 'block:b4');
    const texto = primeiroTexto(element);
    const range = document.createRange();
    range.setStart(texto, 0);
    range.setEnd(texto, texto.length - 1);

    const result = applyInlineFormat([segmento(element, range)], 'strikethrough');

    expect(result.fullyCoveredTargets).toEqual(['block:b4']);
  });
});
