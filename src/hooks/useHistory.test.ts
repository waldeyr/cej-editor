import { describe, it, expect } from 'vitest';
import { LegislativeDocument } from '../types/legislative';

const docA: LegislativeDocument = {
  title: 'Doc A',
  epigrafe: 'Doc A',
  ementa: 'Ementa A',
  preambulo: 'Preambulo A',
  ordemExecucao: 'DECRETA:',
  blocks: [],
  fecho: 'Fecho A',
  assinaturas: [],
};

const docB: LegislativeDocument = {
  ...docA,
  title: 'Doc B',
  epigrafe: 'Doc B',
};

const docC: LegislativeDocument = {
  ...docA,
  title: 'Doc C',
  epigrafe: 'Doc C',
};

// Teste direto do modelo de historico de 50 passos
class HistoryManager {
  past: LegislativeDocument[] = [];
  present: LegislativeDocument;
  future: LegislativeDocument[] = [];
  maxHistory = 50;

  constructor(initial: LegislativeDocument) {
    this.present = initial;
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  push(next: LegislativeDocument) {
    if (JSON.stringify(this.present) === JSON.stringify(next)) return;
    this.past.push(this.present);
    if (this.past.length > this.maxHistory) {
      this.past.shift();
    }
    this.present = next;
    this.future = [];
  }

  undo() {
    if (!this.canUndo) return;
    const prev = this.past.pop()!;
    this.future.unshift(this.present);
    this.present = prev;
  }

  redo() {
    if (!this.canRedo) return;
    const next = this.future.shift()!;
    this.past.push(this.present);
    this.present = next;
  }
}

describe('History stack logic', () => {
  it('should initialize with canUndo=false and canRedo=false', () => {
    const history = new HistoryManager(docA);

    expect(history.present.title).toBe('Doc A');
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it('should push state and allow undo/redo', () => {
    const history = new HistoryManager(docA);

    history.push(docB);
    expect(history.present.title).toBe('Doc B');
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);

    history.undo();
    expect(history.present.title).toBe('Doc A');
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);

    history.redo();
    expect(history.present.title).toBe('Doc B');
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
  });

  it('should cap history at max 50 states', () => {
    const history = new HistoryManager(docA);

    for (let i = 1; i <= 60; i++) {
      history.push({ ...docA, title: `Doc ${i}` });
    }

    expect(history.present.title).toBe('Doc 60');
    expect(history.past.length).toBe(50);
  });
});
