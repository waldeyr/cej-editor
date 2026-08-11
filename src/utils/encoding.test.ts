import { describe, it, expect } from 'vitest';
import {
  detectAndDecode,
  encodeToBytes,
  normalizeEncodingName,
  getEncodingDisplayLabel,
  decodeWindows1252,
} from './encoding';

describe('encoding utils', () => {
  it('should normalize encoding names correctly', () => {
    expect(normalizeEncodingName('ISO-8859-1')).toBe('windows-1252');
    expect(normalizeEncodingName('latin1')).toBe('windows-1252');
    expect(normalizeEncodingName('windows-1252')).toBe('windows-1252');
    expect(normalizeEncodingName('utf-8')).toBe('utf-8');
    expect(normalizeEncodingName('UTF8')).toBe('utf-8');
  });

  it('should generate correct human facing labels', () => {
    expect(getEncodingDisplayLabel('windows-1252', 'ISO-8859-1')).toBe('ISO-8859-1');
    expect(getEncodingDisplayLabel('windows-1252')).toBe('Windows-1252');
    expect(getEncodingDisplayLabel('utf-8')).toBe('UTF-8');
  });

  it('should detect UTF-8 BOM correctly', () => {
    const textStr = 'DECRETO Nº 13.090';
    const utf8Bytes = new TextEncoder().encode(textStr);
    const bomBytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8Bytes]);

    const result = detectAndDecode(bomBytes);
    expect(result.hasBom).toBe(true);
    expect(result.encoding).toBe('utf-8');
    expect(result.text).toBe(textStr);
  });

  it('should detect ISO-8859-1 / Windows-1252 bytes and meta charset', () => {
    // "DECRETO Nº 13.090 - Art. 1º" em Windows-1252
    // º = 0xBA, § = 0xA7
    const htmlWithMeta =
      '<html><head><meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1"></head><body>DECRETO N\xba 13.090 - Art. 1\xba</body></html>';

    const bytes = new Uint8Array(htmlWithMeta.length);
    for (let i = 0; i < htmlWithMeta.length; i++) {
      bytes[i] = htmlWithMeta.charCodeAt(i);
    }

    const result = detectAndDecode(bytes);
    expect(result.encoding).toBe('windows-1252');
    expect(result.declaredEncoding).toBe('iso-8859-1');
    expect(result.text).toContain('DECRETO Nº 13.090');
  });

  it('should encode string back to Windows-1252 bytes with CP1252 high range support', () => {
    const originalText = '“Decreto” — Art. 1º'; // com aspas curvas e travessao CP1252
    const bytes = encodeToBytes(originalText, 'windows-1252');

    const decodedStr = decodeWindows1252(bytes);
    expect(decodedStr).toBe(originalText);
  });

  it('should transliterate or use numeric entities for characters outside Windows-1252', () => {
    const textWithEmoji = 'Ato Normativo 😀 ✓';
    const bytes = encodeToBytes(textWithEmoji, 'windows-1252');
    const decodedStr = decodeWindows1252(bytes);

    expect(decodedStr).toContain(':-)');
    expect(decodedStr).toContain('OK');
  });
});
