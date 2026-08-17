import { describe, expect, it } from 'vitest';
import { detectarFormatoDeImportacao } from './importFormat';

describe('detecção de formato de importação', () => {
  it.each([
    [new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'doc'],
    [new TextEncoder().encode('\ufeff  {\\rtf1\\ansi texto}'), 'rtf'],
    [new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]), 'docx'],
    [new TextEncoder().encode('\n<!doctype html><html><body>ato</body></html>'), 'html'],
    [new TextEncoder().encode('texto sem formato'), 'unknown'],
  ] as const)('reconhece %s como %s pelos bytes', (bytes, format) => {
    expect(detectarFormatoDeImportacao(bytes)).toBe(format);
  });
});
