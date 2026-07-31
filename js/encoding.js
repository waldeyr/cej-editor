// Character-encoding layer.
//
// The documents this editor targets (legislation published by
// planalto.gov.br and friends) are ISO-8859-1 / Windows-1252, not UTF-8.
// Reading them correctly is only half the job: if we decode as Latin-1 and
// then write back UTF-8 bytes, the file still declares `charset=windows-1252`
// in its <head> and every accented character renders as mojibake.
//
// So the encoding detected on open becomes a property of the document and
// governs the write. `decode()` reports what it found; `encode()` reproduces
// those same bytes.
window.Encoding = (function() {

  // ---------------------------------------------------------------- labels

  // Canonical labels accepted by TextDecoder. Note that `utf-16` and
  // `utf-32` are NOT valid labels (only the explicit -le/-be forms are, and
  // UTF-32 is absent from the Encoding Standard entirely) -- passing them
  // throws RangeError, which used to fall through to a silent UTF-8 decode.
  const ALIASES = {
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

  const SUPPORTED_OUTPUT = ['utf-8', 'windows-1252', 'utf-16le', 'utf-16be'];

  // Whatever the file declared is kept verbatim alongside this, so the UI
  // and the <meta charset> can keep speaking the user's language
  // ("ISO-8859-1") while we work with the canonical decoder underneath
  // ("windows-1252" -- which is what the Encoding Standard says iso-8859-1
  // means, and what every browser actually does).
  function normalize(enc) {
    if (!enc) return 'utf-8';
    const key = String(enc).trim().toLowerCase().replace(/[-_\s]/g, '');
    return ALIASES[key] || String(enc).trim().toLowerCase();
  }

  function isLatin1Family(enc) {
    return normalize(enc) === 'windows-1252';
  }

  // Human-facing name for the encoding chip.
  function label(enc, declared) {
    const norm = normalize(enc);
    if (norm === 'windows-1252') {
      // Prefer what the document itself claims -- some legacy Brazilian
      // government HTML says ISO-8859-1 even though the bytes are 1252.
      const d = String(declared || '').trim();
      if (/^iso-?8859-?1$/i.test(d)) return 'ISO-8859-1';
      return 'Windows-1252';
    }
    if (norm === 'utf-8') return 'UTF-8';
    if (norm === 'utf-16le') return 'UTF-16 LE';
    if (norm === 'utf-16be') return 'UTF-16 BE';
    return norm.toUpperCase();
  }

  // -------------------------------------------------------------- cp1252

  // Windows-1252 differs from ISO-8859-1 only in 0x80-0x9F, where Latin-1
  // has C1 controls and 1252 has the typographic characters Word emits:
  // curly quotes, en/em dashes, ellipsis, bullet. Those bytes are the whole
  // reason we can round-trip these documents without touching their text --
  // D12002.html alone holds 37 curly-open and 37 curly-close quotes at
  // 0x93/0x94, plus en dashes at 0x96.
  const CP1252_HIGH = {
    0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E, 0x85: 0x2026,
    0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02C6, 0x89: 0x2030, 0x8A: 0x0160,
    0x8B: 0x2039, 0x8C: 0x0152, 0x8E: 0x017D, 0x91: 0x2018, 0x92: 0x2019,
    0x93: 0x201C, 0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
    0x98: 0x02DC, 0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A, 0x9C: 0x0153,
    0x9E: 0x017E, 0x9F: 0x0178,
  };

  const CP1252_REVERSE = (function() {
    const map = new Map();
    for (let b = 0x00; b <= 0x7F; b++) map.set(b, b);
    for (let b = 0xA0; b <= 0xFF; b++) map.set(b, b);
    for (const byte in CP1252_HIGH) map.set(CP1252_HIGH[byte], Number(byte));
    // The five bytes the Encoding Standard leaves undefined decode to the
    // matching C1 code point, so map them back for exact round-trips.
    for (const b of [0x81, 0x8D, 0x8F, 0x90, 0x9D]) map.set(b, b);
    return map;
  })();

  // ------------------------------------------------- transliteration table

  // Applied only to characters Windows-1252 genuinely cannot hold. Anything
  // already in the 1252 repertoire -- em dash, en dash, curly quotes,
  // ellipsis, bullet, (c), (r), degree sign, the masculine ordinal in
  // "Art. 1o" -- is written as its own byte and never rewritten. Rewriting
  // it would corrupt the very documents this editor exists to edit.
  const TRANSLITERATE = {
    // Dashes and primes outside 1252
    '‐': '-', '‑': '-', '‒': '-', '―': '-',
    '⁃': '-', '−': '-',
    '′': "'", '‵': "'", '″': '"', '‶': '"',
    '〝': '"', '〞': '"',
    // Arrows and math
    '←': '<-', '→': '->', '↔': '<->',
    '⇐': '<=', '⇒': '=>',
    '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~=',
    '⁄': '/', '⋅': '.',
    // Bullets and marks
    '●': '*', '○': '*', '▪': '*', '■': '*',
    '‣': '*', '★': '*', '☆': '*',
    '✓': 'OK', '✔': 'OK', '✗': 'X', '✘': 'X',
    '⚠': '(!)', '❤': '<3', '♥': '<3',
    // Ligatures
    'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬀ': 'ff',
    // Emoji (the handful people actually type)
    '\u{1F642}': ':-)', '\u{1F600}': ':-)', '\u{1F603}': ':-)', '\u{1F604}': ':-)',
    '\u{1F60A}': ':-)', '\u{1F60D}': ':-)', '\u{1F601}': ':-D', '\u{1F606}': ':-D',
    '\u{1F609}': ';-)', '\u{1F61B}': ':-P', '\u{1F61C}': ';-P',
    '\u{1F641}': ':-(', '\u{1F61E}': ':-(', '☹': ':-(', '\u{1F622}': ":'(",
    '\u{1F62E}': ':-o', '\u{1F610}': ':-|', '\u{1F914}': ':-/',
    '\u{1F44D}': '(+1)', '\u{1F44E}': '(-1)', '\u{1F525}': '(!)',
  };

  // Built rather than typed, because these are invisible in an editor and a
  // literal table of them is unreviewable.
  (function seedInvisibles() {
    // Exotic spaces (en/em/thin/hair/figure/punctuation/narrow-nbsp/
    // ideographic) collapse to a plain space; 1252 already has NBSP at 0xA0.
    const spaces = [0x1680, 0x205F, 0x3000];
    for (let cp = 0x2000; cp <= 0x200A; cp++) spaces.push(cp);
    spaces.push(0x202F);
    for (const cp of spaces) TRANSLITERATE[String.fromCodePoint(cp)] = ' ';

    // Zero-width characters and a stray BOM mid-document simply vanish.
    for (const cp of [0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF]) {
      TRANSLITERATE[String.fromCodePoint(cp)] = '';
    }

    // Line and paragraph separators.
    TRANSLITERATE[' '] = '\n';
    TRANSLITERATE[' '] = '\n';
  })();

  const COMBINING = /[̀-ͯ]/g;

  // Last-resort ASCII form for accented Latin letters that 1252 lacks
  // (Romanian s-comma, Polish stroke, macrons...): strip the diacritic.
  function foldDiacritics(ch) {
    const folded = ch.normalize('NFD').replace(COMBINING, '');
    if (folded === ch || !folded) return null;
    for (const c of folded) {
      if (!CP1252_REVERSE.has(c.codePointAt(0))) return null;
    }
    return folded;
  }

  // ------------------------------------------------------------ detection

  function detectBom(bytes) {
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return { encoding: 'utf-8', length: 3 };
    }
    if (bytes.length >= 4 && bytes[0] === 0xFF && bytes[1] === 0xFE && bytes[2] === 0x00 && bytes[3] === 0x00) {
      return { encoding: 'utf-32le', length: 4 };
    }
    if (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0xFE && bytes[3] === 0xFF) {
      return { encoding: 'utf-32be', length: 4 };
    }
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
      return { encoding: 'utf-16be', length: 2 };
    }
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return { encoding: 'utf-16le', length: 2 };
    }
    return null;
  }

  // Look for a charset declaration in the first 4 KB, the way the HTML
  // prescan does. Both forms matter: the http-equiv variant is what Word
  // exports use, and that is exactly what these documents are.
  function sniffMetaCharset(text) {
    const head = String(text || '').slice(0, 4096);

    // Require `charset` to be an actual attribute, not a substring of some
    // other attribute's value (a description mentioning "charset=" would
    // otherwise win).
    const direct = /<meta\s[^>]*?\bcharset\s*=\s*["']?\s*([a-z0-9][a-z0-9._:-]*)/i.exec(head);
    if (direct && direct[1]) return direct[1];

    const httpEquiv = /<meta\s[^>]*?\bhttp-equiv\s*=\s*["']?content-type["']?[^>]*?\bcontent\s*=\s*["']([^"']*)["']/i.exec(head);
    if (httpEquiv) {
      const m = /charset\s*=\s*([a-z0-9][a-z0-9._:-]*)/i.exec(httpEquiv[1]);
      if (m) return m[1];
    }
    return null;
  }

  // Does this byte sequence decode as valid UTF-8? Used when the document
  // makes no declaration at all -- the old code assumed UTF-8 and turned
  // every accented byte of a Latin-1 file into U+FFFD, permanently, on save.
  function isValidUtf8(bytes) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return true;
    } catch (_) {
      return false;
    }
  }

  function detectFromBytes(bytes) {
    const bom = detectBom(bytes);
    if (bom) {
      if (bom.encoding.indexOf('utf-32') === 0) {
        // No UTF-32 decoder exists in the Encoding Standard. Say so instead
        // of silently producing garbage.
        const err = new Error('UTF-32');
        err.code = 'UNSUPPORTED_ENCODING';
        err.encoding = bom.encoding;
        throw err;
      }
      return { encoding: bom.encoding, declared: null, hasBom: true, source: 'bom' };
    }

    const declared = sniffMetaCharset(new TextDecoder('windows-1252').decode(bytes));
    if (declared) {
      return { encoding: normalize(declared), declared, hasBom: false, source: 'meta' };
    }

    // Undeclared: trust the bytes, not a guess.
    return {
      encoding: isValidUtf8(bytes) ? 'utf-8' : 'windows-1252',
      declared: null,
      hasBom: false,
      source: 'sniff',
    };
  }

  async function detect(file) {
    const buffer = await file.slice(0, 8192).arrayBuffer();
    return detectFromBytes(new Uint8Array(buffer));
  }

  // Read a File/Blob and report both the text and how it was encoded.
  // Callers must keep the encoding: it is what `encode()` needs on save.
  async function decode(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const info = detectFromBytes(bytes);

    let text;
    try {
      text = new TextDecoder(info.encoding).decode(bytes);
    } catch (e) {
      console.warn(`Failed to decode as ${info.encoding}; falling back to windows-1252`, e);
      info.encoding = 'windows-1252';
      info.source = 'fallback';
      text = new TextDecoder('windows-1252').decode(bytes);
    }

    // A meta charset that lies -- declares Latin-1 but holds UTF-8 bytes --
    // is common in hand-patched legacy files. The tell is a run of
    // C3/C2-prefixed pairs, which is what UTF-8 looks like read as 1252.
    if (info.source === 'meta' && info.encoding === 'windows-1252'
        && isValidUtf8(bytes) && /[ÃÂ][-¿]/.test(text)) {
      info.encoding = 'utf-8';
      info.mismatch = 'declared-latin1-but-utf8';
      text = new TextDecoder('utf-8').decode(bytes);
    }

    return { text, ...info };
  }

  // ------------------------------------------------------------- encoding

  // Regions where HTML character references are NOT parsed, so an
  // unrepresentable character has to be escaped in the embedded language
  // instead of turned into `&#N;`.
  const RAW_TEXT = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

  function splitRawText(html) {
    const parts = [];
    let last = 0;
    RAW_TEXT.lastIndex = 0;
    let m;
    while ((m = RAW_TEXT.exec(html)) !== null) {
      if (m.index > last) parts.push({ text: html.slice(last, m.index), raw: null });
      parts.push({ text: m[0], raw: m[1].toLowerCase() });
      last = m.index + m[0].length;
    }
    if (last < html.length) parts.push({ text: html.slice(last), raw: null });
    return parts;
  }

  function escapeForRaw(cp, raw) {
    if (raw === 'style') {
      // CSS escape; the trailing space terminates the hex run.
      return '\\' + cp.toString(16).toUpperCase() + ' ';
    }
    // JS \uXXXX, surrogate pair for astral code points -- valid in string
    // literals, template literals, regexes and identifiers alike.
    if (cp <= 0xFFFF) return '\\u' + cp.toString(16).toUpperCase().padStart(4, '0');
    const v = cp - 0x10000;
    const hi = 0xD800 + (v >> 10);
    const lo = 0xDC00 + (v & 0x3FF);
    return '\\u' + hi.toString(16).toUpperCase() + '\\u' + lo.toString(16).toUpperCase();
  }

  // Rewrite every character the target encoding cannot hold. Cascade:
  //   1. curated transliteration  (-> for an arrow, :-) for a smiley)
  //   2. diacritic folding        (s-comma becomes s)
  //   3. numeric character reference / language escape -- lossless, for
  //      anything with no honest ASCII equivalent (CJK, arbitrary emoji)
  // Returns the rewritten string plus what changed, so the UI can say so.
  function adaptToCharset(html, representable) {
    const adapted = [];
    const out = [];

    for (const part of splitRawText(html)) {
      let buf = '';
      for (const ch of part.text) {
        const cp = ch.codePointAt(0);
        if (representable(cp)) { buf += ch; continue; }

        let replacement = TRANSLITERATE[ch];
        let kind = 'transliterated';

        if (replacement === undefined) {
          const folded = foldDiacritics(ch);
          if (folded !== null) { replacement = folded; kind = 'folded'; }
        }
        if (replacement === undefined) {
          replacement = part.raw ? escapeForRaw(cp, part.raw) : '&#' + cp + ';';
          kind = part.raw ? 'escaped' : 'reference';
        }

        adapted.push({ from: ch, to: replacement, kind });
        buf += replacement;
      }
      out.push(buf);
    }

    return { html: out.join(''), adapted };
  }

  function encodeUtf16(text, littleEndian, hasBom) {
    const units = [];
    if (hasBom) units.push(0xFEFF);
    for (let i = 0; i < text.length; i++) units.push(text.charCodeAt(i));
    const bytes = new Uint8Array(units.length * 2);
    units.forEach((u, i) => {
      bytes[i * 2 + (littleEndian ? 0 : 1)] = u & 0xFF;
      bytes[i * 2 + (littleEndian ? 1 : 0)] = u >> 8;
    });
    return bytes;
  }

  // Produce the bytes to write. `encoding` is the document's own encoding,
  // carried since it was opened -- this is what keeps a Latin-1 file Latin-1.
  // Returns { bytes, adapted }, where `adapted` lists any characters that
  // had to be rewritten to fit.
  function encode(html, encoding, hasBom) {
    const enc = normalize(encoding);
    const text = String(html);

    if (enc === 'utf-16le' || enc === 'utf-16be') {
      return { bytes: encodeUtf16(text, enc === 'utf-16le', hasBom), adapted: [] };
    }

    if (enc !== 'windows-1252') {
      // UTF-8, and anything we have no encoder for (canEncode() lets the
      // caller warn first). All of Unicode fits, so nothing is adapted.
      const body = new TextEncoder().encode(text);
      if (!hasBom) return { bytes: body, adapted: [] };
      const bytes = new Uint8Array(body.length + 3);
      bytes.set([0xEF, 0xBB, 0xBF], 0);
      bytes.set(body, 3);
      return { bytes, adapted: [] };
    }

    const { html: safe, adapted } = adaptToCharset(text, cp => CP1252_REVERSE.has(cp));
    const bytes = new Uint8Array(safe.length);
    let n = 0;
    for (const ch of safe) {
      const byte = CP1252_REVERSE.get(ch.codePointAt(0));
      // adaptToCharset guarantees every remaining char is representable;
      // '?' is a belt-and-braces guard, not an expected path.
      bytes[n++] = byte === undefined ? 0x3F : byte;
    }
    return { bytes: bytes.subarray(0, n), adapted };
  }

  // Can we write this encoding back out faithfully? If not, the caller
  // should warn rather than quietly converting the document to UTF-8.
  function canEncode(encoding) {
    return SUPPORTED_OUTPUT.indexOf(normalize(encoding)) !== -1;
  }

  return {
    normalize,
    isLatin1Family,
    label,
    detect,
    decode,
    encode,
    canEncode,
    supportedOutput: SUPPORTED_OUTPUT.slice(),
  };
})();
