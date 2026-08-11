import { LegislativeDocument } from '../types/legislative';

/** Chave herdada do editor Sagitário — mudá-la abandonaria os rascunhos já gravados. */
export const DRAFT_STORAGE_KEY = 'sagitario_editor_draft';

/** O tanto de `Storage` que o rascunho usa — o resto existe para o teste poder dispensá-lo. */
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Rascunho da sessão anterior, ou `null` quando não há um.
 *
 * O que está guardado veio de uma versão qualquer do editor, e pode ter sido
 * escrito à mão no armazenamento do navegador: só passa o que tem epígrafe e
 * corpo, porque é disso que a folha do ato precisa para se desenhar. Qualquer
 * outra coisa é tratada como ausência de rascunho, e o editor abre no exemplo.
 */
export function readDraft(storage: DraftStorage = localStorage): LegislativeDocument | null {
  try {
    const saved = storage.getItem(DRAFT_STORAGE_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    if (parsed && parsed.epigrafe && Array.isArray(parsed.blocks)) {
      return parsed as LegislativeDocument;
    }
  } catch (e) {
    console.warn('Erro ao carregar rascunho do localStorage:', e);
  }

  return null;
}

/**
 * Guarda o ato em edição para sobreviver a um recarregamento da página.
 *
 * A gravação é melhor esforço: o armazenamento pode estar cheio ou barrado pela
 * navegação anônima, e nenhum dos dois é motivo para interromper a edição.
 */
export function writeDraft(doc: LegislativeDocument, storage: DraftStorage = localStorage): void {
  try {
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(doc));
  } catch (e) {
    console.warn('Erro ao salvar rascunho no localStorage:', e);
  }
}

export function clearDraft(storage: DraftStorage = localStorage): void {
  try {
    storage.removeItem(DRAFT_STORAGE_KEY);
  } catch (e) {
    console.warn('Erro ao descartar rascunho do localStorage:', e);
  }
}
