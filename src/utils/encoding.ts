// Modulo de Codificacao Adaptativa de Caracteres
// Replicado da estrategia do CEJ-PAGE (https://github.com/waldeyr/cej-page)
//
// Preserva a codificacao original de atos normativos legados (ISO-8859-1 / Windows-1252 / UTF-8)
// sem converter compulsoriamente para UTF-8, evitando mojibake e mantendo a integridade byte a byte.

export type SupportedEncoding = 'utf-8' | 'windows-1252' | 'utf-16le' | 'utf-16be';

export interface DecodedResult {
  text: string;
  encoding: SupportedEncoding;
  declaredEncoding: string;
  hasBom: boolean;
}

const ALIASES: Record<string, SupportedEncoding> = {
  utf8: 'utf-8',
  unicode11utf8: 'utf-8',
  utf16: 'utf-16le',
  utf16le: 'utf-16le',
  utf16be: 'utf-16be',
  ucs2: 'utf-16le',
  iso88591: 'windows-1252',
  latin1: 'windows-1252',
  l1: 'windows-1252',
  cp819: 'windows-1252',
  ansix341968: 'windows-1252',
  usascii: 'windows-1252',
  ascii: 'windows-1252',
  windows1252: 'windows-1252',
  cp1252: 'windows-1252',
  xcp1252: 'windows-1252',
};

// Windows-1252 vs ISO-8859-1 (Tabela CP1252 na faixa 0x80-0x9F)
const CP1252_HIGH: Record<number, number> = {
  0x80: 0x20ac, // €
  0x82: 0x201a, // ‚
  0x83: 0x0192, // ƒ
  0x84: 0x201e, // „
  0x85: 0x2026, // …
  0x86: 0x2020, // †
  0x87: 0x2021, // ‡
  0x88: 0x02c6, // ˆ
  0x89: 0x2030, // ‰
  0x8a: 0x0160, // Š
  0x8b: 0x2039, // ‹
  0x8c: 0x0152, // Œ
  0x8e: 0x017d, // Ž
  0x91: 0x2018, // ‘
  0x92: 0x2019, // ’
  0x93: 0x201c, // “
  0x94: 0x201d, // ”
  0x95: 0x2022, // •
  0x96: 0x2013, // –
  0x97: 0x2014, // —
  0x98: 0x02dc, // ˜
  0x99: 0x2122, // ™
  0x9a: 0x0161, // š
  0x9b: 0x203a, // ›
  0x9c: 0x0153, // œ
  0x9e: 0x017e, // ž
  0x9f: 0x0178, // Ÿ
};

const CP1252_REVERSE: Map<number, number> = (function () {
  const map = new Map<number, number>();
  for (let b = 0x00; b <= 0x7f; b++) map.set(b, b);
  for (let b = 0xa0; b <= 0xff; b++) map.set(b, b);
  for (const byte in CP1252_HIGH) {
    map.set(CP1252_HIGH[byte], Number(byte));
  }
  for (const b of [0x81, 0x8d, 0x8f, 0x90, 0x9d]) map.set(b, b);
  return map;
})();

// Transliteracao para simbolos fora do repertorio de Windows-1252
const TRANSLITERATE: Record<string, string> = {
  '‐': '-', '‑': '-', '‒': '-', '―': '-', '⁃': '-', '−': '-',
  '′': "'", '‵': "'", '″': '"', '‶': '"', '〝': '"', '〞': '"',
  '←': '<-', '→': '->', '↔': '<->', '⇐': '<=', '⇒': '=>',
  '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~=', '⁄': '/', '⋅': '.',
  '●': '*', '○': '*', '▪': '*', '■': '*', '‣': '*', '★': '*', '☆': '*',
  '✓': 'OK', '✔': 'OK', '✗': 'X', '✘': 'X', '⚠': '(!)', '❤': '<3', '♥': '<3',
  'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬀ': 'ff',
  '\u{1F642}': ':-)', '\u{1F600}': ':-)', '\u{1F603}': ':-)', '\u{1F604}': ':-)',
  '\u{1F60A}': ':-)', '\u{1F60D}': ':-)', '\u{1F601}': ':-D', '\u{1F606}': ':-D',
  '\u{1F609}': ';-)', '\u{1F61B}': ':-P', '\u{1F61C}': ';-P',
  '\u{1F641}': ':-(', '\u{1F61E}': ':-(', '☹': ':-(', '\u{1F622}': ":'(",
  '\u{1F62E}': ':-o', '\u{1F610}': ':-|', '\u{1F914}': ':-/',
  '\u{1F44D}': '(+1)', '\u{1F44E}': '(-1)', '\u{1F525}': '(!)',
};

// Adiciona espacos exoticos a transliteracao
(function seedInvisibles() {
  const spaces = [0x1680, 0x205f, 0x3000, 0x202f];
  for (let cp = 0x2000; cp <= 0x200a; cp++) spaces.push(cp);
  for (const cp of spaces) {
    TRANSLITERATE[String.fromCodePoint(cp)] = ' ';
  }
})();

export function normalizeEncodingName(enc?: string): SupportedEncoding {
  if (!enc) return 'utf-8';
  const key = String(enc).trim().toLowerCase().replace(/[-_\s]/g, '');
  return ALIASES[key] || 'utf-8';
}

export function isLatin1Family(enc?: string): boolean {
  return normalizeEncodingName(enc) === 'windows-1252';
}

export function getEncodingDisplayLabel(enc: string, declared?: string): string {
  const norm = normalizeEncodingName(enc);
  if (norm === 'windows-1252') {
    const d = String(declared || '').trim();
    if (/^iso-?8859-?1$/i.test(d)) return 'ISO-8859-1';
    return 'Windows-1252';
  }
  if (norm === 'utf-8') return 'UTF-8';
  if (norm === 'utf-16le') return 'UTF-16 LE';
  return String(norm).toUpperCase();
}

/**
 * Valida se um buffer de bytes e UTF-8 valido contendo caracteres acentuados/multibyte.
 */
function isValidUtf8Bytes(bytes: Uint8Array): { valid: boolean; hasMultiByte: boolean } {
  let i = 0;
  let hasMultiByte = false;
  while (i < bytes.length) {
    const b1 = bytes[i];
    if (b1 <= 0x7f) {
      i++;
    } else if (b1 >= 0xc2 && b1 <= 0xdf) {
      if (i + 1 >= bytes.length) return { valid: false, hasMultiByte: false };
      const b2 = bytes[i + 1];
      if (b2 < 0x80 || b2 > 0xbf) return { valid: false, hasMultiByte: false };
      hasMultiByte = true;
      i += 2;
    } else if (b1 >= 0xe0 && b1 <= 0xef) {
      if (i + 2 >= bytes.length) return { valid: false, hasMultiByte: false };
      const b2 = bytes[i + 1];
      const b3 = bytes[i + 2];
      if (b2 < 0x80 || b2 > 0xbf || b3 < 0x80 || b3 > 0xbf) return { valid: false, hasMultiByte: false };
      hasMultiByte = true;
      i += 3;
    } else if (b1 >= 0xf0 && b1 <= 0xf4) {
      if (i + 3 >= bytes.length) return { valid: false, hasMultiByte: false };
      const b2 = bytes[i + 1];
      const b3 = bytes[i + 2];
      const b4 = bytes[i + 3];
      if (b2 < 0x80 || b2 > 0xbf || b3 < 0x80 || b3 > 0xbf || b4 < 0x80 || b4 > 0xbf) {
        return { valid: false, hasMultiByte: false };
      }
      hasMultiByte = true;
      i += 4;
    } else {
      return { valid: false, hasMultiByte: false };
    }
  }
  return { valid: true, hasMultiByte };
}

/**
 * Tenta encontrar a declaracao <meta charset="..."> ou <meta http-equiv="Content-Type" content="...charset=..."> nos bytes brutos.
 */
function extractDeclaredCharset(bytes: Uint8Array): string | null {
  const headBytes = bytes.subarray(0, Math.min(bytes.length, 4096));
  let headStr = '';
  for (let i = 0; i < headBytes.length; i++) {
    headStr += String.fromCharCode(headBytes[i] & 0x7f);
  }

  const metaCharsetMatch = headStr.match(/<meta[^>]+charset=["']?\s*([^"'>\s/]+)/i);
  if (metaCharsetMatch) return metaCharsetMatch[1].trim();

  const contentTypeMatch = headStr.match(/content=["'][^"']*charset=\s*([^"';\s]+)/i);
  if (contentTypeMatch) return contentTypeMatch[1].trim();

  return null;
}

/**
 * Decodifica Windows-1252 manualmente caso o ambiente nao suporte TextDecoder com cp1252.
 */
export function decodeWindows1252(bytes: Uint8Array): string {
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b <= 0x7f || (b >= 0xa0 && b <= 0xff)) {
      str += String.fromCharCode(b);
    } else if (CP1252_HIGH[b]) {
      str += String.fromCodePoint(CP1252_HIGH[b]);
    } else {
      str += String.fromCharCode(b);
    }
  }
  return str;
}

/**
 * Decodifica um buffer de bytes brutos detectando o encoding de forma adaptativa.
 */
export function detectAndDecode(buffer: Uint8Array): DecodedResult {
  let bytes = buffer;
  let hasBom = false;

  // 1. Verificacao de BOM
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    bytes = bytes.subarray(3);
    hasBom = true;
    const text = new TextDecoder('utf-8').decode(bytes);
    return { text, encoding: 'utf-8', declaredEncoding: 'UTF-8', hasBom: true };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    bytes = bytes.subarray(2);
    const text = new TextDecoder('utf-16le').decode(bytes);
    return { text, encoding: 'utf-16le', declaredEncoding: 'UTF-16LE', hasBom: true };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    bytes = bytes.subarray(2);
    const text = new TextDecoder('utf-16be').decode(bytes);
    return { text, encoding: 'utf-16be', declaredEncoding: 'UTF-16BE', hasBom: true };
  }

  // 2. Extracao de Charset Declarado na Meta Tag
  const declared = extractDeclaredCharset(bytes);
  const normalizedDeclared = declared ? normalizeEncodingName(declared) : null;

  // 3. Analise de Validade UTF-8 dos Bytes
  const { valid: isUtf8, hasMultiByte } = isValidUtf8Bytes(bytes);

  // Divergencia: Arquivo declara Latin-1 mas bytes sao UTF-8 validos
  if (normalizedDeclared === 'windows-1252' && isUtf8 && hasMultiByte) {
    const text = new TextDecoder('utf-8').decode(bytes);
    return {
      text,
      encoding: 'utf-8',
      declaredEncoding: declared || 'ISO-8859-1',
      hasBom: false,
    };
  }

  // Se declarou um charset explicito e valido
  if (normalizedDeclared) {
    if (normalizedDeclared === 'windows-1252') {
      const text = decodeWindows1252(bytes);
      return {
        text,
        encoding: 'windows-1252',
        declaredEncoding: declared || 'ISO-8859-1',
        hasBom: false,
      };
    } else {
      try {
        const text = new TextDecoder(normalizedDeclared).decode(bytes);
        return {
          text,
          encoding: normalizedDeclared,
          declaredEncoding: declared || normalizedDeclared.toUpperCase(),
          hasBom: false,
        };
      } catch (e) {
        // Fallback
      }
    }
  }

  // Se nao declarou, decide por inspecao dos bytes
  if (isUtf8) {
    const text = new TextDecoder('utf-8').decode(bytes);
    return { text, encoding: 'utf-8', declaredEncoding: 'UTF-8', hasBom: false };
  } else {
    const text = decodeWindows1252(bytes);
    return {
      text,
      encoding: 'windows-1252',
      declaredEncoding: 'ISO-8859-1',
      hasBom: false,
    };
  }
}

/**
 * Codifica uma string HTML de volta para um buffer de bytes `Uint8Array` na codificacao informada.
 */
export function encodeToBytes(html: string, encoding: SupportedEncoding = 'utf-8', hasBom = false): Uint8Array {
  if (encoding === 'utf-8') {
    const utf8Bytes = new TextEncoder().encode(html);
    if (hasBom) {
      const bomAndBytes = new Uint8Array(utf8Bytes.length + 3);
      bomAndBytes[0] = 0xef;
      bomAndBytes[1] = 0xbb;
      bomAndBytes[2] = 0xbf;
      bomAndBytes.set(utf8Bytes, 3);
      return bomAndBytes;
    }
    return utf8Bytes;
  }

  if (encoding === 'windows-1252') {
    const bytes: number[] = [];
    for (const char of html) {
      const cp = char.codePointAt(0);
      if (cp === undefined) continue;

      if (CP1252_REVERSE.has(cp)) {
        bytes.push(CP1252_REVERSE.get(cp)!);
      } else if (TRANSLITERATE[char]) {
        const transliterated = TRANSLITERATE[char];
        for (const tChar of transliterated) {
          const tCp = tChar.codePointAt(0)!;
          if (CP1252_REVERSE.has(tCp)) {
            bytes.push(CP1252_REVERSE.get(tCp)!);
          } else {
            bytes.push(0x3f); // '?'
          }
        }
      } else {
        // Entidade Numerica HTML para caracteres nao suportados em Windows-1252
        const entity = `&#x${cp.toString(16).toUpperCase()};`;
        for (let i = 0; i < entity.length; i++) {
          bytes.push(entity.charCodeAt(i));
        }
      }
    }
    return new Uint8Array(bytes);
  }

  // Fallback UTF-8
  return new TextEncoder().encode(html);
}
