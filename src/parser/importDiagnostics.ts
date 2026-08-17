import { LegislativeDocument } from '../types/legislative';
import { htmlToPlainText } from '../utils/docTargets';

/** Mesmo teto aplicado aos downloads no desktop, com pequena margem para anexos locais. */
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

export function erroDeTamanhoDeImportacao(size: number): string | null {
  if (size <= MAX_IMPORT_BYTES) return null;
  return `O arquivo tem mais de ${Math.floor(MAX_IMPORT_BYTES / (1024 * 1024))} MB e não foi aberto para evitar travamento.`;
}

/** Alertas conservadores: chamam atenção para revisão, sem rejeitar um ato válido. */
export function diagnosticarImportacao(doc: LegislativeDocument): string[] {
  const texto = [
    doc.epigrafe,
    doc.ementa,
    doc.preambulo,
    doc.ordemExecucao,
    doc.fecho,
    ...doc.assinaturas,
    ...doc.blocks.map((block) => `${block.numberLabel || ''} ${block.content}`),
  ].map(htmlToPlainText).join(' ').trim();

  if (!texto) return ['nenhum texto reconhecido'];

  const avisos: string[] = [];
  if (doc.blocks.length === 0) avisos.push('nenhum dispositivo foi identificado');

  const livres = doc.blocks.filter((block) => block.type === 'TEXTO_LIVRE').length;
  if (doc.blocks.length >= 5 && livres / doc.blocks.length >= 0.8) {
    avisos.push(`${livres} de ${doc.blocks.length} blocos ficaram sem classificação`);
  }

  const tabelasVazias = doc.blocks.filter((block) =>
    block.type === 'TABELA' && !/<(?:td|th)\b[^>]*>\s*\S[\s\S]*?<\/(?:td|th)>/i.test(block.content)
  ).length;
  if (tabelasVazias) avisos.push(`${tabelasVazias} tabela${tabelasVazias === 1 ? '' : 's'} sem célula legível`);

  return avisos;
}
