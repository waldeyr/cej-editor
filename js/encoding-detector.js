window.EncodingDetector = (function() {
  function normalizeEncoding(enc) {
    if (!enc) return 'utf-8';
    const value = String(enc).trim().toLowerCase().replace(/[-_]/g, '');
    const aliases = {
      utf8: 'utf-8',
      utf16: 'utf-16',
      utf32: 'utf-32',
      iso88591: 'iso-8859-1',
      latin1: 'iso-8859-1',
      windows1252: 'windows-1252',
      cp1252: 'windows-1252',
    };
    return aliases[value] || enc;
  }

  function detectBom(bytes) {
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return 'utf-8';
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) return 'utf-16be';
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) return 'utf-16le';
    if (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0xFE && bytes[3] === 0xFF) return 'utf-32be';
    if (bytes.length >= 4 && bytes[0] === 0xFF && bytes[1] === 0xFE && bytes[2] === 0x00 && bytes[3] === 0x00) return 'utf-32le';
    return null;
  }

  function detectCharsetFromHtml(text) {
    const head = String(text || '').slice(0, 4096);
    const charsetMatch = /<meta[^>]+charset\s*=\s*["']?([^"'\s>]+)/i.exec(head);
    if (charsetMatch && charsetMatch[1]) return charsetMatch[1];

    const contentTypeMatch = /<meta[^>]+http-equiv\s*=\s*["']content-type["'][^>]+content\s*=\s*["']([^"']*?)["']/i.exec(head);
    if (contentTypeMatch) {
      const m = /charset\s*=\s*([^;\s"']+)/i.exec(contentTypeMatch[1]);
      if (m) return m[1];
    }

    return null;
  }

  async function detectFromFile(file) {
    try {
      const buffer = await file.slice(0, 8192).arrayBuffer();
      const bytes = new Uint8Array(buffer);

      const bom = detectBom(bytes);
      if (bom) {
        return { encoding: normalizeEncoding(bom), source: 'bom' };
      }

      const fallbackText = new TextDecoder('latin1').decode(bytes);
      const metaCharset = detectCharsetFromHtml(fallbackText);
      if (metaCharset) {
        return { encoding: normalizeEncoding(metaCharset), source: 'meta' };
      }

      return { encoding: 'utf-8', source: 'fallback' };
    } catch (e) {
      console.warn('Encoding detection failed, falling back to UTF-8:', e);
      return { encoding: 'utf-8', source: 'fallback' };
    }
  }

  async function readFileWithEncoding(file) {
    const { encoding } = await detectFromFile(file);
    const buffer = await file.arrayBuffer();

    try {
      return new TextDecoder(encoding).decode(buffer);
    } catch (e) {
      console.warn(`Failed to decode as ${encoding}; falling back to UTF-8`, e);
      return new TextDecoder('utf-8').decode(buffer);
    }
  }

  return { detectFromFile, readFileWithEncoding };
})();
