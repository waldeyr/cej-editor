import { LegislativeDocument, LegislativeBlock, ValidationIssue } from '../types/legislative';

/**
 * Valida a integridade formal do ato normativo com mensagens amigáveis e claras para técnicos não programadores.
 */
export function validateLegislativeDocument(doc: LegislativeDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Validação de Epígrafe
  if (!doc.epigrafe || doc.epigrafe.trim().length === 0) {
    issues.push({
      id: 'epigrafe-missing',
      severity: 'error',
      message: '📄 Falta o título do ato normativo na parte superior (ex: DECRETO Nº 13.090).',
    });
  }

  // 2. Validação de Ementa
  if (!doc.ementa || doc.ementa.trim().length === 0) {
    issues.push({
      id: 'ementa-missing',
      severity: 'error',
      message: '📝 O ato normativo precisa de um resumo (ementa) no lado direito superior.',
    });
  }

  // 3. Validação de Preâmbulo
  if (!doc.preambulo || doc.preambulo.trim().length === 0) {
    issues.push({
      id: 'preambulo-missing',
      severity: 'warning',
      message: '🏛️ A indicação da autoridade (preâmbulo) está ausente ou incompleta.',
    });
  }

  // 4. Validação de Artigos e Dispositivos
  let expectedArtNum = 1;
  let hasArtigo = false;

  doc.blocks.forEach((block, index) => {
    // Bloco Vazio
    if (!block.content || block.content.trim().length === 0) {
      /*
       * As mensagens são lidas na dica do mouse da Vista do Ato, com o
       * ponteiro parado sobre o próprio dispositivo. Por isso elas o nomeiam
       * como ele aparece na folha — "O Art. 3º" — e não pelo número da linha
       * na lista, que só faz sentido para quem conta blocos.
       */
      const dispositivo = block.numberLabel ? `O ${block.numberLabel}` : `O item #${index + 1}`;
      issues.push({
        id: `empty-block-${block.id}`,
        blockId: block.id,
        severity: 'warning',
        message: `✏️ ${dispositivo} está sem texto. Digite a redação ou remova o dispositivo.`,
      });
    }

    // Validação de Sequência de Artigos
    if (block.type === 'ARTIGO') {
      hasArtigo = true;

      /*
       * O artigo tachado é o revogado, mantido só pelo contexto histórico
       * (ver `ordinalForTypeAt` em blockTypes.ts): o número dele é congelado,
       * não uma posição corrente na série, e por isso nem entra na conta nem
       * é acusado de estar fora dela.
       */
      if (block.identificadorTachado) return;

      const numMatch = block.numberLabel?.match(/\d+/);
      if (numMatch) {
        const actualNum = parseInt(numMatch[0], 10);
        if (actualNum !== expectedArtNum) {
          issues.push({
            id: `art-seq-${block.id}`,
            blockId: block.id,
            severity: 'warning',
            message:
              `🔢 Numeração fora de sequência: este é o ${block.numberLabel}, mas nesta posição ` +
              `era esperado o Art. ${expectedArtNum}º. O botão "Renumerar", na barra de estrutura, ` +
              `acerta a sequência do ato.`,
          });
          expectedArtNum = actualNum + 1;
        } else {
          expectedArtNum++;
        }
      }
    }
  });

  if (!hasArtigo) {
    issues.push({
      id: 'no-artigos',
      severity: 'error',
      message: '⚠️ Nenhum artigo foi encontrado no corpo do documento.',
    });
  }

  return issues;
}
