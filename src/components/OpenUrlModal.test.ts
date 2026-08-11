import { describe, it, expect } from 'vitest';
import { normalizeDocumentUrl } from './OpenUrlModal';

describe('endereço de um ato publicado', () => {
  it('completa o esquema de um endereço colado da barra do navegador', () => {
    expect(normalizeDocumentUrl('www.planalto.gov.br/d13090.htm')).toBe(
      'https://www.planalto.gov.br/d13090.htm'
    );
  });

  it('preserva o endereço que já traz esquema', () => {
    expect(normalizeDocumentUrl('http://planalto.gov.br/a.htm')).toBe('http://planalto.gov.br/a.htm');
    expect(normalizeDocumentUrl('  https://planalto.gov.br/a.htm  ')).toBe('https://planalto.gov.br/a.htm');
  });

  /*
   * Um `file://` ou `javascript:` não é ato publicado, e quem baixa no aplicativo
   * de mesa é o processo principal — completá-los daria ao documento em edição
   * uma porta para o disco da máquina.
   */
  it('recusa esquemas que não sejam http ou https', () => {
    expect(normalizeDocumentUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeDocumentUrl('javascript:alert(1)')).toBeNull();
  });

  it('recusa o que não é endereço', () => {
    expect(normalizeDocumentUrl('')).toBeNull();
    expect(normalizeDocumentUrl('   ')).toBeNull();
    expect(normalizeDocumentUrl('http://')).toBeNull();
  });
});
