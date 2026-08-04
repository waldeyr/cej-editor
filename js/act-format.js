// Act formatting — the one place that knows what a Brazilian normative act
// looks like as markup.
//
// The documents this editor maintains carry NO semantic classes. Measured on a
// real decree (tests/d12990.html, 3.4 MB): `MsoNormal` 6772×, `MsoNormalTable`
// 29×, and nothing else. What tells an ementa from an artigo from a signature
// is the inline style recipe and the colour. So "apply a style" here cannot
// mean "add a class" — it means "write the exact markup the published acts
// use", byte for byte, so a paragraph the editor creates is indistinguishable
// from the ones Word produced in 2003.
//
// Every recipe lives in the R table below. Nothing else in the project may
// contain the literal `10.0pt`. If the publication standard ever changes, this
// file is the single edit.
window.ActFormat = (function() {
  const ES = window.EditorState;

  // ---- The recipes, verbatim from the corpus ----
  // Spelling matters: these strings are compared against and written into real
  // files, and a stray space changes the diff. They were taken from the sample
  // act, not invented.
  const R = {
    // Body of the act — artigo, parágrafo, inciso, alínea and preâmbulo all
    // share this one recipe. They differ only in the text that follows.
    corpoP: 'text-align: justify; text-indent: 38px; line-height: normal; margin-top: 15px; margin-bottom: 15px; background: white',
    corpoSpan: 'font-size: 10.0pt; font-family: Arial,sans-serif; color: black',
    // Quoted text from another act: same paragraph, plus a right margin, and
    // nested in two <blockquote> levels (the "recuo" convention).
    citacaoP: 'text-align: justify; text-indent: 38px; line-height: normal; margin-right: 0cm; margin-top: 15px; margin-bottom: 15px; background: white',
    // Date/place and signatures: no first-line indent, no vertical margin.
    fechoP: 'text-align: justify; line-height: normal; margin-top: 0; margin-bottom: 0; background: white',
    ministroSpan: 'font-size: 10.0pt; font-family: Arial,sans-serif; font-style: italic',
    ementaSpan: 'font-size: 10.0pt; font-family: Arial,sans-serif; color: #800000',
    anexoSpan: 'font-size: 10.0pt; line-height: 115%; font-family: Arial,sans-serif; color: black',
    epigrafeP: 'margin-top: 13px; margin-bottom: 13px',
    // The two-space typographic convention after "Art. 1º" is written as a
    // real space plus a non-breaking space, exactly as the corpus does.
    NBSP: ' ',
    // Colours that carry meaning in these documents.
    corEmenta: '#800000',
    corEpigrafe: '#000080',
    corBrasao: '#808000',
    corDou: '#FF0000',
  };

  // ---- Role catalogue ----
  // A role is DATA. One generic applier and one generic matcher consume the
  // `recipe` field; only the genuinely structural roles carry custom code.
  // Writing twenty near-identical closures would defeat the whole point of
  // having a single recipe table.
  const ROLES = [
    {
      id: 'epigrafe', group: 'abertura', icon: 'file-signature', preview: 'centro-azul',
      recipe: { tag: 'p', cls: null, align: 'center', pStyle: R.epigrafeP, spanStyle: null, wrap: 'epigrafe' },
      probe: (el) => el.tagName === 'P' && el.getAttribute('align') === 'center',
    },
    {
      id: 'ementa', group: 'abertura', icon: 'align-right', preview: 'ementa',
      recipe: { tag: 'p', cls: null, align: 'justify', pStyle: null, spanStyle: R.ementaSpan },
      probe: (el) => el.tagName === 'P' && /#800000/i.test(el.innerHTML || ''),
    },
    {
      id: 'preambulo', group: 'abertura', icon: 'text-quote', preview: 'corpo-indent',
      recipe: { tag: 'p', cls: 'MsoNormal', align: null, pStyle: R.corpoP, spanStyle: R.corpoSpan },
      dispositivo: 'preambulo',
    },
    {
      id: 'corpo', group: 'corpo', icon: 'pilcrow', preview: 'corpo-indent',
      recipe: { tag: 'p', cls: 'MsoNormal', align: null, pStyle: R.corpoP, spanStyle: R.corpoSpan },
      probe: (el) => el.tagName === 'P' && /text-indent/.test(el.getAttribute('style') || ''),
    },
    // These four share `corpo`'s recipe and differ only by the dispositivo
    // text they prefix. See applyRole().
    { id: 'artigo', group: 'corpo', icon: 'file-text', preview: 'corpo-indent', sameAs: 'corpo', dispositivo: 'artigo' },
    { id: 'paragrafo', group: 'corpo', icon: 'section', preview: 'corpo-indent', sameAs: 'corpo', dispositivo: 'paragrafo' },
    { id: 'paragrafoUnico', group: 'corpo', icon: 'section', preview: 'corpo-indent', sameAs: 'corpo', dispositivo: 'paragrafoUnico' },
    { id: 'inciso', group: 'corpo', icon: 'list', preview: 'corpo-indent', sameAs: 'corpo', dispositivo: 'inciso' },
    { id: 'alinea', group: 'corpo', icon: 'list-ordered', preview: 'corpo-indent', sameAs: 'corpo', dispositivo: 'alinea' },
    { id: 'item', group: 'corpo', icon: 'list-tree', preview: 'corpo-indent', sameAs: 'corpo', dispositivo: 'item' },
    {
      id: 'citacao', group: 'corpo', icon: 'quote', preview: 'citacao',
      recipe: { tag: 'p', cls: 'MsoNormal', align: null, pStyle: R.citacaoP, spanStyle: R.corpoSpan, quote: true },
      probe: (el) => el.tagName === 'P' && /margin-right/.test(el.getAttribute('style') || ''),
    },
    // "Brasília, 29 de maio de 2026; 205º da Independência…" is still part of
    // the body flow and carries the corpo recipe — verified in the sample act.
    // Only the signature lines below it drop the indent.
    { id: 'dataLocal', group: 'fecho', icon: 'calendar', preview: 'corpo-indent', sameAs: 'corpo' },
    {
      id: 'assinaturaPresidente', group: 'fecho', icon: 'pen-line', preview: 'fecho',
      recipe: { tag: 'p', cls: 'MsoNormal', align: null, pStyle: R.fechoP, spanStyle: R.corpoSpan },
      probe: (el) => el.tagName === 'P' && !/text-indent/.test(el.getAttribute('style') || ''),
    },
    {
      id: 'assinaturaMinistro', group: 'fecho', icon: 'pen-tool', preview: 'fecho-italico',
      recipe: { tag: 'p', cls: 'MsoNormal', align: null, pStyle: R.fechoP, spanStyle: R.ministroSpan },
      probe: (el) => el.tagName === 'P' && /italic/i.test(el.innerHTML || ''),
    },
    {
      id: 'notaDou', group: 'fecho', icon: 'newspaper', preview: 'dou',
      recipe: { tag: 'p', cls: null, align: null, pStyle: null, spanStyle: null, wrap: 'dou' },
      probe: (el) => el.tagName === 'P' && /#FF0000/i.test(el.innerHTML || ''),
      dispositivo: 'notaDou',
    },
    {
      id: 'anexoTitulo', group: 'anexo', icon: 'paperclip', preview: 'anexo',
      recipe: { tag: 'p', cls: 'MsoNormal', align: 'center', pStyle: 'text-align: center', spanStyle: R.anexoSpan, boldAll: true },
      // Centred AND bold. Centring alone is not enough: the annex data tables
      // hold 108 centred cell paragraphs that are not annex titles, and the
      // recipe here is a single declaration, so it would match all of them.
      probe: (el) => el.tagName === 'P' && el.getAttribute('align') === 'center'
                     && /<b[\s>]/i.test(el.innerHTML || ''),
      dispositivo: 'anexo',
    },
  ];

  const BY_ID = new Map(ROLES.map(r => [r.id, r]));
  // Resolve `sameAs` so every role has a usable recipe without duplicating it.
  for (const role of ROLES) {
    if (role.sameAs) {
      const base = BY_ID.get(role.sameAs);
      role.recipe = base.recipe;
      if (!role.probe) role.probe = base.probe;
    }
  }

  function roles() { return ROLES.slice(); }
  function role(id) { return BY_ID.get(id) || null; }
  function label(id) { return I18Nt('ui.act.roles.' + id + '.label', id); }
  function hint(id) { return I18Nt('ui.act.roles.' + id + '.hint', ''); }

  // I18N.t is (path, vars, fallback) and its formatter blanks every {k} when
  // vars is missing — so the vars must go through it, not be substituted after.
  function I18Nt(path, fallback, vars) {
    try { return window.I18N.t(path, vars || null, fallback); } catch (_) { return fallback; }
  }

  // ---- Dispositivo detection ----
  // What the TEXT says, as opposed to how the markup looks. This is the second
  // axis of inspect(): a paragraph can carry the right recipe and the wrong
  // text, or vice versa, and only saying both out loud makes that fixable.
  const DISPOSITIVO_RULES = [
    { kind: 'artigo', re: /^Art\.\s*(\d+)\s*(?:[ºo°])?(?:-([A-Z]))?/ },
    { kind: 'paragrafoUnico', re: /^(Par[áa]grafo\s+[úu]nico)/i },
    { kind: 'paragrafo', re: /^§\s*(\d+)\s*[ºo°]?/ },
    { kind: 'inciso', re: /^([IVXLCDM]+)\s*[-–—]\s/ },
    { kind: 'alinea', re: /^([a-z])\)\s/ },
    { kind: 'item', re: /^(\d+)\.\s/ },
    { kind: 'anexo', re: /^ANEXO\s+([IVXLCDM]+)(?:\.?([A-Z]))?/i },
    { kind: 'notaDou', re: /(n[ãa]o\s+substitui\s+o\s+publicado)/i },
    { kind: 'preambulo', re: /^(O\s+PRESIDENTE\s+DA\s+REP[ÚU]BLICA|A\s+PRESIDENTA\s+DA\s+REP[ÚU]BLICA|Considerando)/i },
    { kind: 'decreta', re: /^(DECRETA|RESOLVE|PROMULGA)\s*:?\s*$/i },
  ];

  // Normalize for matching: the corpus writes the two-space convention as a
  // real space plus U+00A0, so a naive /^Art\. \d/ misses every article.
  function normText(s) {
    return String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }

  function detectDispositivo(text) {
    const t = normText(text);
    if (!t) return null;
    for (const rule of DISPOSITIVO_RULES) {
      const m = t.match(rule.re);
      if (!m) continue;
      return { kind: rule.kind, number: m[1] || null, suffix: m[2] || null, text: t };
    }
    return null;
  }

  // Human label for a detected dispositivo — "Art. 5º", "§ 2º", "inciso III".
  //
  // Numbers up to 9 take the ordinal, from 10 on the cardinal: "Art. 9º" but
  // "Art. 10". That is the drafting convention (LC 95/1998) and what the
  // published acts print — "Art. 11º" would be visibly wrong to these users.
  function ordinal(n) {
    return String(n) + (+n < 10 ? 'º' : '');
  }

  function dispositivoLabel(d) {
    if (!d) return '';
    switch (d.kind) {
      case 'artigo': return 'Art. ' + ordinal(d.number) + (d.suffix ? '-' + d.suffix : '');
      case 'paragrafo': return '§ ' + ordinal(d.number);
      case 'paragrafoUnico': return I18Nt('ui.act.disp.paragrafoUnico', 'Parágrafo único');
      case 'inciso': return I18Nt('ui.act.disp.inciso', 'inciso') + ' ' + d.number;
      case 'alinea': return I18Nt('ui.act.disp.alinea', 'alínea') + ' ' + d.number + ')';
      case 'item': return I18Nt('ui.act.disp.item', 'item') + ' ' + d.number;
      case 'anexo': return 'Anexo ' + (d.number || '');
      default: return I18Nt('ui.act.disp.' + d.kind, d.kind);
    }
  }

  // ---- Style normalization ----
  // The corpus contains the SAME recipe in two spellings — the browser's
  // (`font-family: Arial,sans-serif`, spaced, unquoted) and Word's raw output
  // (`font-family:&quot;Arial&quot;,sans-serif`, unspaced, quoted) — sometimes
  // in adjacent paragraphs. String comparison would call one of them a
  // mismatch, so both sides are reduced to a prop→value map first.
  function normalizeStyle(styleText) {
    const out = new Map();
    String(styleText || '').split(';').forEach((decl) => {
      const i = decl.indexOf(':');
      if (i < 0) return;
      const prop = decl.slice(0, i).trim().toLowerCase();
      if (!prop || prop.startsWith('mso-')) return; // Word bookkeeping, not style
      let value = decl.slice(i + 1).trim().toLowerCase();
      value = value.replace(/["']/g, '').replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ');
      // 0cm, 0pt, 0px and Word's .0001pt all mean "no space".
      if (/^(0(cm|pt|px|em|%)?|\.0001pt)$/.test(value)) value = '0';
      out.set(prop, value);
    });
    return out;
  }

  // Properties that DEFINE the visual shape of a role rather than merely
  // decorate it. A paragraph that says `text-align: right` is not a
  // near-miss of a justified role — it is a different thing. Without this,
  // the 2328 right-aligned annex paragraphs in the sample act all scored 60%
  // against "Data e local" and the formatting bar lit up on every one of them.
  const SIGNATURE_PROPS = new Set(['text-align', 'text-indent']);

  function compareStyle(el, wantText) {
    const want = normalizeStyle(wantText);
    const got = normalizeStyle(el.getAttribute('style'));
    const diffs = [];
    let hits = 0;
    let contradictsSignature = false;
    want.forEach((v, k) => {
      const g = got.get(k);
      if (g === v) { hits++; return; }
      // Present but different is a contradiction; absent is just a gap.
      if (g !== undefined && SIGNATURE_PROPS.has(k)) contradictsSignature = true;
      diffs.push({ prop: k, want: v, got: g == null ? null : g });
    });
    if (!want.size) return { confidence: got.size ? 'proxima' : 'exata', diffs };
    if (contradictsSignature) return { confidence: null, diffs };
    if (hits === want.size) {
      // Extra declarations beyond the recipe mean "close, not the same".
      const extra = got.size > want.size;
      return { confidence: extra ? 'proxima' : 'exata', diffs };
    }
    if (hits / want.size >= 0.6) return { confidence: 'proxima', diffs };
    return { confidence: null, diffs };
  }

  // Order matters: the more specific colour/structure rules must win over the
  // generic body paragraph, which would otherwise swallow everything.
  const MATCH_ORDER = ['anexoTitulo', 'ementa', 'epigrafe', 'notaDou', 'citacao',
                       'assinaturaMinistro', 'corpo', 'assinaturaPresidente'];

  // Roles that legitimately live inside a table. Everything else is body-of-
  // the-act formatting, and matching it against annex table cells produced 532
  // false "close enough" readings on the sample act — the formatting bar would
  // have lit up on paragraphs that are spreadsheet rows, not devices of the
  // act. Same rule the outline sweep uses when it rejects <table> subtrees.
  const TABLE_SAFE_ROLES = new Set(['anexoTitulo']);

  // Memoized per element — inspect() is called on every caret move, and a real
  // act has thousands of paragraphs. Cleared whenever the document is replaced.
  let matchCache = new WeakMap();
  // The act outline, cached per document. Declared here, above every use:
  // a `let` after the `return` below would sit in the temporal dead zone
  // forever, and the first outline() call would throw.
  let outlineCache = null;

  // Which dispositivo kinds earn a row in the act outline, and how deep.
  const OUTLINE_KINDS = new Set(['epigrafe', 'ementa', 'preambulo', 'decreta',
    'artigo', 'paragrafo', 'paragrafoUnico', 'inciso', 'alinea', 'anexo', 'notaDou']);
  const OUTLINE_LEVEL = {
    epigrafe: 0, ementa: 0, preambulo: 0, decreta: 0,
    artigo: 1, paragrafo: 2, paragrafoUnico: 2, inciso: 3, alinea: 4,
    anexo: 1, notaDou: 0,
  };

  function matchFormat(el) {
    if (!el || el.nodeType !== 1) return { roleId: null, confidence: null, diffs: [] };
    const cached = matchCache.get(el);
    if (cached) return cached;

    const inTable = !!(el.closest && el.closest('table'));

    let best = { roleId: null, confidence: null, diffs: [] };
    for (const id of MATCH_ORDER) {
      if (inTable && !TABLE_SAFE_ROLES.has(id)) continue;
      const r = BY_ID.get(id);
      if (!r || !r.recipe) continue;
      // The cheap predicate runs first: on a 6800-paragraph document, style
      // normalization for every role on every element is not affordable.
      if (r.probe && !safeProbe(r.probe, el)) continue;
      if (r.recipe.tag && el.tagName !== r.recipe.tag.toUpperCase()) continue;

      const res = r.recipe.pStyle
        ? compareStyle(el, r.recipe.pStyle)
        : { confidence: colourMatches(el, r) ? 'exata' : null, diffs: [] };
      if (res.confidence === 'exata') { best = { roleId: id, confidence: 'exata', diffs: [] }; break; }
      if (res.confidence === 'proxima' && !best.roleId) {
        best = { roleId: id, confidence: 'proxima', diffs: res.diffs };
      }
    }
    matchCache.set(el, best);
    return best;
  }

  function safeProbe(fn, el) { try { return !!fn(el); } catch (_) { return false; } }

  // Roles whose signature is a colour rather than a paragraph style.
  function colourMatches(el, r) {
    const html = el.innerHTML || '';
    if (r.id === 'notaDou') return /#FF0000/i.test(html);
    if (r.id === 'ementa') return /#800000/i.test(html);
    if (r.id === 'epigrafe') return /#000080/i.test(html);
    return false;
  }

  // ---- inspect(): the two axes, plus the disagreement between them ----
  function inspect(el) {
    const empty = { formato: { roleId: null, confidence: null, diffs: [] }, dispositivo: null, ancora: null, agreement: null };
    if (!el || el.nodeType !== 1) return empty;

    const formato = matchFormat(el);
    const d = detectDispositivo(el.textContent);
    const ancora = findAnchor(el);

    let agreement = 'ok';
    if (d && !formato.roleId) agreement = 'texto-sem-formato';
    else if (!d && formato.roleId === 'corpo') agreement = 'formato-sem-texto';
    // An artigo without a bookmark is the single most common real defect:
    // every other act links to articles by #artN, so a missing one is a
    // cross-reference that can never be made.
    if (d && (d.kind === 'artigo' || d.kind === 'anexo') && !ancora) agreement = 'sem-ancora';

    return {
      formato,
      dispositivo: d ? { ...d, label: dispositivoLabel(d), anchorSuggestion: suggestAnchor(d) } : null,
      ancora,
      agreement,
    };
  }

  function findAnchor(el) {
    const a = el.querySelector && el.querySelector('a[name]');
    if (a) return { name: a.getAttribute('name'), el: a };
    if (el.id && !window.EditorTraces.isEditorId(el.id)) return { name: el.id, el };
    return null;
  }

  // The bookmark grammar the portal uses: art5, art3§1, art9p (parágrafo
  // único), anexo2a. Context-free suggestion — the enclosing article is only
  // known during a full sweep, which is what outline() is for.
  function suggestAnchor(d) {
    switch (d.kind) {
      case 'artigo': return 'art' + d.number + (d.suffix ? '-' + d.suffix.toLowerCase() : '');
      case 'anexo': return 'anexo' + romanToInt(d.number) + (d.suffix ? d.suffix.toLowerCase() : '');
      default: return null;
    }
  }

  function romanToInt(r) {
    if (!r) return '';
    if (/^\d+$/.test(r)) return r;
    const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    const s = String(r).toUpperCase();
    let total = 0;
    for (let i = 0; i < s.length; i++) {
      const v = map[s[i]] || 0;
      const next = map[s[i + 1]] || 0;
      total += v < next ? -v : v;
    }
    return total || '';
  }

  // ---- context(): where is the user, exactly ----
  // Three disjoint sources of "the current element" existed (the selection, a
  // live text range, and the focused contenteditable). Everything downstream
  // consumes this one resolver instead of picking a different one each time.
  function context() {
    const doc = ES.state.doc;
    const out = { doc, block: null, range: null, blocks: [], inEdit: false };
    if (!doc) return out;

    const range = window.Canvas.getTextRange ? window.Canvas.getTextRange() : null;
    if (range) {
      out.range = range;
      out.block = blockOf(range.startContainer);
      out.blocks = blocksInRange(range);
      return out;
    }
    const active = doc.activeElement;
    if (active && active.isContentEditable) {
      out.inEdit = true;
      out.block = blockOf(active);
      if (out.block) out.blocks = [out.block];
      return out;
    }
    const sel = ES.state.selected;
    if (sel) {
      out.block = blockOf(sel);
      if (out.block) out.blocks = [out.block];
    }
    return out;
  }

  const INLINE_TAGS = /^(A|B|I|EM|STRONG|SPAN|CODE|SMALL|SUB|SUP|U|S|MARK|FONT|BR|IMG|ABBR|CITE|Q|LABEL|VAR|SAMP|KBD|TIME|WBR|BDI|BDO|BIG)$/;

  // Reduce an element's contents to the inline vocabulary the acts use.
  // Everything else is unwrapped, never dropped — the text always survives.
  // Declared above the `return` below: a `const` after it would sit in the
  // temporal dead zone and cleanNode() would throw on the first call.
  const KEEP_INLINE = new Set(['B', 'I', 'SUP', 'SUB', 'BR']);
  const UNWRAP = new Set(['SPAN', 'FONT', 'SMALL', 'BIG', 'U', 'STRONG', 'EM', 'DIV', 'SECTION', 'ARTICLE', 'LABEL']);

  function blockOf(node) {
    const doc = ES.state.doc;
    let el = node && node.nodeType === 1 ? node : (node && node.parentElement);
    while (el && el !== doc.body && el.tagName && INLINE_TAGS.test(el.tagName)) el = el.parentElement;
    return el && el !== doc.body ? el : null;
  }

  function blocksInRange(range) {
    const doc = ES.state.doc;
    const root = range.commonAncestorContainer.nodeType === 1
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    if (!root) return [];
    const hits = [];
    root.querySelectorAll('*').forEach((el) => {
      if (el === doc.body || INLINE_TAGS.test(el.tagName)) return;
      let touches = false;
      try { touches = range.intersectsNode(el); } catch (_) { return; }
      if (!touches) return;
      if (hits.some(h => h.contains(el))) return; // outermost only
      hits.push(el);
    });
    if (!hits.length) {
      const b = blockOf(range.startContainer);
      if (b) hits.push(b);
    }
    return hits;
  }

  ES.on((evt) => {
    if (evt === 'doc-replaced' || evt === 'doc-changed') {
      matchCache = new WeakMap();
      outlineCache = null;
    } else if (evt === 'history') {
      matchCache = new WeakMap();
      outlineCache = null;
    }
  });

  return {
    R, roles, role, label, hint,
    detectDispositivo, dispositivoLabel, suggestAnchor, romanToInt,
    normalizeStyle, compareStyle, matchFormat, inspect,
    context, blockOf, blocksInRange, normText,
    // applyRole / outline / sampleHtml are defined in the second half below.
    applyRole, applyToContext, outline, sampleHtml, invalidate,
  };

  // ---------------------------------------------------------------------
  // Everything below is hoisted — function declarations, so the return above
  // can reference them. Kept at the bottom to keep the read order: data,
  // recognition, then mutation.
  // ---------------------------------------------------------------------

  function invalidate() { matchCache = new WeakMap(); outlineCache = null; }

  // ---- outline(): one sweep, four consumers ----
  // The act's structure as a legislation person sees it: Epígrafe, Ementa,
  // Art. 1º, § 1º, Anexo I. Feeds the structure panel, the link tool's target
  // picker, the final check and the marks legend.
  function outline(doc) {
    doc = doc || ES.state.doc;
    if (!doc || !doc.body) return [];
    if (outlineCache && outlineCache.doc === doc) return outlineCache.rows;

    const rows = [];
    const counters = { artigo: 0, anexo: 0 };
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, {
      acceptNode(el) {
        const tag = el.tagName;
        // The annexes are thousands of Word paragraphs inside tables. Walking
        // into them buries the act's own four articles under 4500 rows, so
        // the whole subtree is rejected — not merely skipped.
        if (tag === 'TABLE' || tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT;
        if (!/^(P|H1|H2|H3|H4|H5|H6|DIV|BLOCKQUOTE)$/.test(tag)) return NodeFilter.FILTER_SKIP;
        const text = normText(el.textContent);
        if (!text) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node;
    while ((node = walker.nextNode())) {
      // A <div> or <blockquote> wrapping paragraphs would repeat its
      // children's text; only leaf-ish blocks become rows.
      if (node.querySelector && node.querySelector('p, h1, h2, h3, h4, h5, h6')) continue;

      const text = normText(node.textContent);
      const d = detectDispositivo(text);
      const fmt = matchFormat(node);
      const kind = d ? d.kind : (fmt.roleId || null);
      if (!kind) continue;
      if (!OUTLINE_KINDS.has(kind)) continue;

      if (kind === 'artigo') counters.artigo++;
      if (kind === 'anexo') counters.anexo++;

      const anchor = findAnchor(node);
      rows.push({
        el: node,
        kind,
        level: OUTLINE_LEVEL[kind] != null ? OUTLINE_LEVEL[kind] : 2,
        label: d ? dispositivoLabel(d) : label(fmt.roleId),
        text: text.slice(0, 120),
        anchor: anchor ? anchor.name : null,
        hasAnchor: !!anchor,
        suggestion: d ? suggestAnchor(d) : null,
        index: rows.length,
      });
    }

    outlineCache = { doc, rows };
    return rows;
  }

  // ---- applyRole(): reshape, never rebuild ----
  function applyRole(roleId, el, opts = {}) {
    const doc = ES.state.doc;
    const r = BY_ID.get(roleId);
    if (!doc || !r || !el || el.nodeType !== 1) return false;

    if (window.Canvas.commitTextEdit) window.Canvas.commitTextEdit();

    // Formatting a cell inside an annex table with a body-of-the-act recipe
    // produces something that looks broken; ask first.
    if (!opts.force && r.group !== 'anexo' && el.closest && el.closest('table')) {
      toast(I18Nt('ui.act.apply.insideTable', 'Este trecho está dentro de uma tabela — a formatação do corpo do ato não se aplica aqui.'), 'warn');
      return false;
    }

    const host = reshape(el, r, doc);
    if (!host) return false;

    if (r.dispositivo && !opts.noText) ensureDispositivoText(host, r, doc);

    if (!opts.batch) {
      ES.snapshot('formatar: ' + roleId);
      ES.select(host);
      invalidate();
      toast(I18Nt('ui.act.apply.done', 'Formatado como {role}.', { role: label(roleId) }), 'success');
    }
    return true;
  }

  // Apply to everything the user has selected, as one undo step.
  function applyToContext(roleId, opts = {}) {
    const ctx = context();
    const targets = ctx.blocks.length ? ctx.blocks : (ctx.block ? [ctx.block] : []);
    if (!targets.length) {
      toast(I18Nt('ui.act.apply.nothing', 'Selecione um trecho do texto primeiro.'), 'warn');
      return false;
    }
    if (window.Canvas.commitTextEdit) window.Canvas.commitTextEdit();
    let ok = 0;
    for (const t of targets) {
      if (applyRole(roleId, t, { ...opts, batch: true })) ok++;
    }
    if (!ok) return false;
    ES.snapshot('formatar: ' + roleId);
    ES.select(targets[0]);
    invalidate();
    toast(ok === 1
      ? I18Nt('ui.act.apply.done', 'Formatado como {role}.', { role: label(roleId) })
      : I18Nt('ui.act.apply.doneMany', '{count} trechos formatados como {role}.',
              { count: ok, role: label(roleId) }), 'success');
    return true;
  }

  // Turn `el` into the role's markup, keeping its text, links and bookmarks.
  function reshape(el, r, doc) {
    const rec = r.recipe;
    if (!rec) return null;

    // Refuse rather than destroy: a paragraph containing a table or a list is
    // not a paragraph, and flattening it would silently eat the user's work.
    if (el.querySelector && el.querySelector('table, ul, ol, dl, p, div')) {
      toast(I18Nt('ui.act.apply.hasStructure',
        'Este trecho tem estrutura dentro (tabela ou lista). Formate os parágrafos internos, um a um.'), 'warn');
      return null;
    }

    const host = retag(el, rec.tag, doc);

    // Attributes by whitelist — this is what actually removes Word pollution.
    const keep = new Set(['id', 'name', 'lang', 'dir', 'title']);
    Array.from(host.attributes).forEach((a) => {
      if (!keep.has(a.name.toLowerCase())) host.removeAttribute(a.name);
    });
    if (rec.cls) host.className = rec.cls;
    if (rec.align) host.setAttribute('align', rec.align);
    if (rec.pStyle) host.setAttribute('style', rec.pStyle);

    const frag = extractInline(host, doc);

    // Rewrap. A leading empty <a name> stays INSIDE the span — that is where
    // the corpus puts it: <span …><a name="art1"></a>Art. 1º …</span>
    let inner;
    if (rec.wrap === 'epigrafe') {
      inner = wrapChain(doc, frag, [
        ['font', { color: R.corEpigrafe, face: 'Arial' }], ['small', {}], ['strong', {}],
      ]);
    } else if (rec.wrap === 'dou') {
      inner = wrapChain(doc, frag, [['font', { color: R.corDou, face: 'Arial', size: '2' }]]);
    } else if (rec.spanStyle) {
      const span = doc.createElement('span');
      span.setAttribute('style', rec.spanStyle);
      span.appendChild(frag);
      inner = rec.boldAll ? wrapNode(doc, span, 'b') : span;
    } else {
      inner = frag;
    }

    host.replaceChildren(inner);
    return host;
  }

  function wrapNode(doc, node, tag) {
    const w = doc.createElement(tag);
    w.appendChild(node);
    return w;
  }

  function wrapChain(doc, frag, chain) {
    // chain is outermost-first; build inside-out.
    let node = frag;
    for (let i = chain.length - 1; i >= 0; i--) {
      const [tag, attrs] = chain[i];
      const w = doc.createElement(tag);
      Object.entries(attrs).forEach(([k, v]) => w.setAttribute(k, v));
      w.appendChild(node);
      node = w;
    }
    return node;
  }

  function retag(el, tag, doc) {
    if (!tag || el.tagName === tag.toUpperCase()) return el;
    const next = doc.createElement(tag);
    Array.from(el.attributes).forEach(a => next.setAttribute(a.name, a.value));
    while (el.firstChild) next.appendChild(el.firstChild);
    el.replaceWith(next);
    return next;
  }

  function extractInline(host, doc) {
    const frag = doc.createDocumentFragment();
    Array.from(host.childNodes).forEach(n => frag.appendChild(cleanNode(n, doc)));
    return frag;
  }

  function cleanNode(node, doc) {
    if (node.nodeType === 3) return doc.createTextNode(node.nodeValue);
    if (node.nodeType !== 1) return doc.createDocumentFragment();

    const tag = node.tagName;

    if (tag === 'A') {
      // Links and bookmarks are content, not formatting. Keep href/name only;
      // the corpus links carry no class, style, target or rel.
      const a = doc.createElement('a');
      const href = node.getAttribute('href');
      const name = node.getAttribute('name');
      if (href) a.setAttribute('href', href);
      if (name) a.setAttribute('name', name);
      Array.from(node.childNodes).forEach(c => a.appendChild(cleanNode(c, doc)));
      return a;
    }

    if (KEEP_INLINE.has(tag)) {
      const k = doc.createElement(tag === 'STRONG' ? 'b' : tag.toLowerCase());
      Array.from(node.childNodes).forEach(c => k.appendChild(cleanNode(c, doc)));
      return k;
    }

    if (UNWRAP.has(tag)) {
      // Word encodes emphasis as inline style on a span; translate it back to
      // the tag the acts use rather than losing it.
      const style = (node.getAttribute('style') || '').toLowerCase();
      const bold = /font-weight\s*:\s*(bold|[6-9]00)/.test(style) || tag === 'STRONG';
      const italic = /font-style\s*:\s*italic/.test(style) || tag === 'EM';
      const frag = doc.createDocumentFragment();
      Array.from(node.childNodes).forEach(c => frag.appendChild(cleanNode(c, doc)));
      if (!bold && !italic) return frag;
      let out = frag;
      if (italic) out = wrapNode(doc, out, 'i');
      if (bold) out = wrapNode(doc, out, 'b');
      return out;
    }

    // Anything else: keep the text, drop the tag.
    const frag = doc.createDocumentFragment();
    Array.from(node.childNodes).forEach(c => frag.appendChild(cleanNode(c, doc)));
    return frag;
  }

  // Prefix the dispositivo marker and drop a bookmark, if the text doesn't
  // already carry one. Never renumbers or rewrites text the user typed.
  function ensureDispositivoText(host, r, doc) {
    const existing = detectDispositivo(host.textContent);
    if (existing && existing.kind === r.dispositivo) {
      if (r.dispositivo === 'artigo' && !findAnchor(host)) addAnchor(host, 'art' + existing.number, doc);
      return;
    }
    if (existing) return; // already some other dispositivo — don't fight the user

    const marker = nextMarker(r.dispositivo, doc);
    if (!marker) return;
    const target = host.querySelector('span, font, b') || host;
    target.insertBefore(doc.createTextNode(marker.text), target.firstChild);
    if (marker.anchor) addAnchor(host, marker.anchor, doc);
  }

  function nextMarker(kind, doc) {
    const rows = outline(doc);
    if (kind === 'artigo') {
      const n = rows.filter(x => x.kind === 'artigo').length + 1;
      // "Art. 9º" but "Art. 10" — see ordinal().
      return { text: 'Art. ' + ordinal(n) + ' ' + R.NBSP, anchor: 'art' + n };
    }
    if (kind === 'paragrafo') {
      return { text: '§ 1º ' + R.NBSP, anchor: null };
    }
    if (kind === 'paragrafoUnico') return { text: 'Parágrafo único. ' + R.NBSP, anchor: null };
    if (kind === 'inciso') return { text: 'I - ', anchor: null };
    if (kind === 'alinea') return { text: 'a) ', anchor: null };
    if (kind === 'item') return { text: '1. ', anchor: null };
    return null;
  }

  function addAnchor(host, baseName, doc) {
    const name = window.PageTools.uniqueId(doc, window.PageTools.sanitizeAnchorName(baseName));
    const a = doc.createElement('a');
    a.setAttribute('name', name);
    const target = host.querySelector('span, font, b') || host;
    target.insertBefore(a, target.firstChild);
  }

  // The markup a piece tile drops into the page. Resolved lazily so a recipe
  // edit propagates without rebuilding the blocks panel.
  function sampleHtml(roleId) {
    const r = BY_ID.get(roleId);
    if (!r || !r.recipe) return '<p>&nbsp;</p>';
    const doc = document.implementation.createHTMLDocument('');
    const p = doc.createElement(r.recipe.tag || 'p');
    if (r.recipe.cls) p.className = r.recipe.cls;
    if (r.recipe.align) p.setAttribute('align', r.recipe.align);
    if (r.recipe.pStyle) p.setAttribute('style', r.recipe.pStyle);
    const marker = r.dispositivo ? nextMarkerSample(r.dispositivo) : '';
    const text = doc.createTextNode(marker + I18Nt('ui.act.sample.' + r.id, I18Nt('ui.act.sample.default', 'Digite o texto aqui.')));
    let inner;
    if (r.recipe.wrap === 'epigrafe') inner = wrapChain(doc, text, [['font', { color: R.corEpigrafe, face: 'Arial' }], ['small', {}], ['strong', {}]]);
    else if (r.recipe.wrap === 'dou') inner = wrapChain(doc, text, [['font', { color: R.corDou, face: 'Arial', size: '2' }]]);
    else if (r.recipe.spanStyle) {
      const span = doc.createElement('span');
      span.setAttribute('style', r.recipe.spanStyle);
      span.appendChild(text);
      inner = r.recipe.boldAll ? wrapNode(doc, span, 'b') : span;
    } else inner = text;
    p.appendChild(inner);
    const html = p.outerHTML;
    return r.recipe.quote ? '<blockquote><blockquote>' + html + '</blockquote></blockquote>' : html;
  }

  function nextMarkerSample(kind) {
    const m = { artigo: 'Art. 1º ' + R.NBSP, paragrafo: '§ 1º ' + R.NBSP,
                paragrafoUnico: 'Parágrafo único. ' + R.NBSP, inciso: 'I - ',
                alinea: 'a) ', item: '1. ' };
    return m[kind] || '';
  }

  function toast(msg, type) {
    const host = document.getElementById('toasts');
    if (!host) return;
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }
})();
