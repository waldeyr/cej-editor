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
      issues.push({
        id: `empty-block-${block.id}`,
        blockId: block.id,
        severity: 'warning',
        message: `✏️ Este dispositivo (item #${index + 1}) está sem texto. Digite a redação ou remova-o.`,
      });
    }

    // Validação de Sequência de Artigos
    if (block.type === 'ARTIGO') {
      hasArtigo = true;
      const numMatch = block.numberLabel?.match(/\d+/);
      if (numMatch) {
        const actualNum = parseInt(numMatch[0], 10);
        if (actualNum !== expectedArtNum) {
          issues.push({
            id: `art-seq-${block.id}`,
            blockId: block.id,
            severity: 'warning',
            message: `🔢 Atenção na numeração: o texto passou para o ${block.numberLabel} (o esperado seria o Art. ${expectedArtNum}º).`,
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
