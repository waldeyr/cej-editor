/** Formatos que o editor consegue reconhecer pelos próprios bytes. */
export type ImportFormat = 'rtf' | 'doc' | 'docx' | 'html' | 'unknown';

const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function beginsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * Identifica o contêiner antes de confiar no nome do arquivo.
 *
 * A extensão continua útil para o seletor de arquivos, mas não é uma fonte
 * confiável: a CEJ já distribuiu RTF com extensão `.doc`, e arquivos recebidos
 * por e-mail podem perder ou ganhar uma extensão ao serem renomeados.
 */
export function detectarFormatoDeImportacao(bytes: Uint8Array): ImportFormat {
  if (beginsWith(bytes, OLE_SIGNATURE)) return 'doc';

  // DOCX é um pacote OOXML em ZIP. A validação interna fica a cargo do Mammoth,
  // que consegue distinguir um DOCX de outro ZIP e explicar a falha ao usuário.
  if (beginsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || beginsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) {
    return 'docx';
  }

  let start = 0;
  // BOM UTF-8, seguido de espaço em branco permitido antes da marcação.
  if (beginsWith(bytes, [0xef, 0xbb, 0xbf])) start = 3;
  while (start < bytes.length && (bytes[start] === 0x09 || bytes[start] === 0x0a || bytes[start] === 0x0d || bytes[start] === 0x20)) {
    start += 1;
  }

  const prefix = String.fromCharCode(...bytes.subarray(start, Math.min(start + 96, bytes.length))).toLowerCase();
  if (prefix.startsWith('{\\rtf')) return 'rtf';
  if (/^<(?:!doctype\s+html\b|html\b|head\b|body\b|p\b|h[1-6]\b|table\b|div\b)/.test(prefix)) return 'html';

  return 'unknown';
}
