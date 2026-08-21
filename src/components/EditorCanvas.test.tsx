import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { EditorCanvas } from './EditorCanvas';
import { LegislativeDocument } from '../types/legislative';

afterEach(cleanup);

/**
 * Documento mínimo, com só os campos obrigatórios da interface. Cada teste
 * sobrepõe o que precisa por cima dele.
 */
const baseDoc = (overrides: Partial<LegislativeDocument> = {}): LegislativeDocument => ({
  title: 'DECRETO Nº 1, DE 1 DE JANEIRO DE 2026',
  epigrafe: 'DECRETO Nº 1, DE 1 DE JANEIRO DE 2026',
  ementa: 'Dispõe sobre alguma coisa.',
  preambulo: 'O PRESIDENTE DA REPÚBLICA...',
  ordemExecucao: 'DECRETA:',
  blocks: [],
  fecho: '',
  assinaturas: [],
  ...overrides,
});

const noop = () => {};

const renderCanvas = (
  doc: LegislativeDocument,
  overrides: Partial<React.ComponentProps<typeof EditorCanvas>> = {}
) =>
  render(
    <EditorCanvas
      doc={doc}
      onUpdateDoc={noop}
      onUpdateStructure={noop}
      onSelectBlock={noop}
      issues={[]}
      onNavigateAnchor={noop}
      onInsertAnchor={noop}
      onInsertLink={noop}
      onStrikethrough={noop}
      {...overrides}
    />
  );

describe('EditorCanvas — avisos preliminares', () => {
  it('mostra o link padrão de Vigência quando a ementa existe e não há aviso preliminar salvo', () => {
    const doc = baseDoc();
    const { container } = renderCanvas(doc);

    const bloco = container.querySelector('#block-avisosPreliminares');
    expect(bloco).toBeTruthy();
    const link = bloco?.querySelector('a[href="#art1"]');
    expect(link?.textContent).toBe('Vigência');
  });

  it('clicar no bloco chama onSelectBlock com "avisosPreliminares"', () => {
    const doc = baseDoc();
    const onSelectBlock = vi.fn();
    const { container } = renderCanvas(doc, { onSelectBlock });

    const bloco = container.querySelector('#block-avisosPreliminares') as HTMLElement;
    fireEvent.click(bloco);

    expect(onSelectBlock).toHaveBeenCalledWith('avisosPreliminares');
  });

  it('o botão de lixeira apaga o aviso preliminar (avisosPreliminares vira string vazia)', () => {
    const doc = baseDoc({ avisosPreliminares: '<a href="#art1">Vigência</a>' });
    const onUpdateDoc = vi.fn();
    const { container } = renderCanvas(doc, { onUpdateDoc });

    const bloco = container.querySelector('#block-avisosPreliminares') as HTMLElement;
    const excluir = bloco.querySelector('button[title="Excluir Aviso preliminar"]') as HTMLElement;
    expect(excluir).toBeTruthy();
    fireEvent.click(excluir);

    expect(onUpdateDoc).toHaveBeenCalledTimes(1);
    expect(onUpdateDoc).toHaveBeenCalledWith(expect.objectContaining({ avisosPreliminares: '' }));
    // O resto do documento continua intacto, e não só o campo apagado.
    expect(onUpdateDoc.mock.calls[0][0].ementa).toBe(doc.ementa);
  });

  it('editar o conteúdo e sair do campo (blur) grava o novo HTML em avisosPreliminares', () => {
    const doc = baseDoc();
    const onUpdateDoc = vi.fn();
    const { container } = renderCanvas(doc, { onUpdateDoc });

    const campo = container.querySelector(
      '[aria-label="Links do ato"]'
    ) as HTMLElement;
    expect(campo).toBeTruthy();

    campo.innerHTML = 'Texto compilado';
    fireEvent.blur(campo);

    expect(onUpdateDoc).toHaveBeenCalledTimes(1);
    expect(onUpdateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ avisosPreliminares: 'Texto compilado' })
    );
  });
});

describe('EditorCanvas — partes fixas já existentes (regressão)', () => {
  it('renderiza a ementa e o clique nela chama onSelectBlock com "ementa"', () => {
    const doc = baseDoc();
    const onSelectBlock = vi.fn();
    const { container } = renderCanvas(doc, { onSelectBlock });

    const bloco = container.querySelector('#block-ementa') as HTMLElement;
    expect(bloco).toBeTruthy();
    expect(bloco.textContent).toContain('Dispõe sobre alguma coisa.');

    fireEvent.click(bloco);
    expect(onSelectBlock).toHaveBeenCalledWith('ementa');
  });

  it('renderiza a epígrafe e o clique nela chama onSelectBlock com "epigrafe"', () => {
    const doc = baseDoc();
    const onSelectBlock = vi.fn();
    const { container } = renderCanvas(doc, { onSelectBlock });

    const bloco = container.querySelector('#block-epigrafe') as HTMLElement;
    expect(bloco).toBeTruthy();
    expect(bloco.textContent).toContain('DECRETO Nº 1, DE 1 DE JANEIRO DE 2026');

    fireEvent.click(bloco);
    expect(onSelectBlock).toHaveBeenCalledWith('epigrafe');
  });
});

describe('EditorCanvas — lista de dispositivos', () => {
  it('renderiza um bloco ARTIGO com o rótulo e o conteúdo', () => {
    const doc = baseDoc({
      blocks: [
        {
          id: 'art-1',
          type: 'ARTIGO',
          numberLabel: 'Art. 1º',
          content: 'Fica instituído o programa.',
          rawText: 'Fica instituído o programa.',
        },
      ],
    });

    const { container } = renderCanvas(doc);

    const bloco = container.querySelector('#block-art-1') as HTMLElement;
    expect(bloco).toBeTruthy();
    expect(bloco.textContent).toContain('Art. 1º');
    expect(bloco.textContent).toContain('Fica instituído o programa.');
  });
});
