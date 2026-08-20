import { DocPart, EDITABLE_TARGET_ATTR, assinaturaTarget, blockTarget, partTarget } from './docTargets';
import { getEditableSegments } from './richText';

/** Partes fixas endereçáveis pela seleção — ver `targetForSelectedId`. */
const NAMED_PARTS: readonly DocPart[] = ['epigrafe', 'ementa', 'preambulo', 'ordemExecucao', 'fecho'];

/** Traduz a posição selecionada na tela para o endereço do campo correspondente. */
export const targetForSelectedId = (id?: string): string | undefined => {
  if (!id) return undefined;
  if (NAMED_PARTS.includes(id as DocPart)) return partTarget(id as DocPart);
  const assinatura = id.match(/^assinatura-(\d+)$/);
  if (assinatura) return assinaturaTarget(Number.parseInt(assinatura[1], 10));
  return blockTarget(id);
};

/** Campos alcançados pela seleção corrente — ou, sem seleção, o campo com o foco. */
export const targetsInPlay = (): string[] => {
  const segments = getEditableSegments();
  if (segments.length > 0) return segments.map((segment) => segment.target);

  const active = document.activeElement as HTMLElement | null;
  const target = active?.getAttribute?.(EDITABLE_TARGET_ATTR);
  return target ? [target] : [];
};
