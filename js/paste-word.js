// Paste from Word — the users' primary daily task.
//
// Until now there was no paste handling at all: a Ctrl+V from Word dropped
// `class="MsoNormal"`, `<span style="mso-…">`, `<o:p>` and `<!--[if gte mso 9]>`
// straight into the document, and file.js wrote every byte of it to disk.
//
// What this does instead: take the clipboard's HTML, reduce it to plain
// paragraphs with only the inline emphasis and links that survive, recognise
// each paragraph's dispositivo (Art. 5º, § 2º, III -, c)) and re-emit it
// through ActFormat.applyRole so the result carries the act's own recipe.
window.PasteWord = (function() {
  const ES = window.EditorState;

  // A whole annex pasted at once is a real thing; a hundred thousand
  // paragraphs is a runaway. Confirm past this point rather than freeze.
  const MANY_PARAGRAPHS = 2000;
  const MODE_KEY = 'html-editor.pasteMode';

  // I18N.t is (path, vars, fallback) and its formatter blanks every {k} when
  // vars is missing — so the vars must go through it, not be substituted after.
  function t(path, fallback, vars) {
    try { return window.I18N.t(path, vars || null, fallback); }
    catch (_) { return fallback; }
  }

  // ---- Entry points ----

  // (a) A paste while a text-edit session is open.
  function onPaste(e) {
    const cd = e.clipboardData;
    if (!cd) return;
    // clipboardData is dead the moment this handler returns, so both flavours
    // must be read synchronously — before any await, dialog or promise.
    const html = cd.getData('text/html') || '';
    const text = cd.getData('text/plain') || '';
    if (!html && !text) return;
    e.preventDefault();
    e.stopPropagation();
    handle(html, text);
  }

  // (b) With nothing in contenteditable the browser fires NO paste event at
  // all — there is no editable target for it. So the explicit route opens a
  // textarea and lets the user paste into that. Honest, and it works
  // everywhere.
  async function openColdPaste() {
    if (!ES.state.doc) return;
    let ta = null;
    const ok = await window.Dialog.custom({
      title: t('ui.paste.coldTitle', 'Colar texto do Word'),
      message: t('ui.paste.coldMessage', 'Cole aqui o texto copiado do Word (Ctrl+V). Ele será formatado conforme o padrão do ato.'),
      icon: 'clipboard-paste',
      wide: true,
      confirmLabel: t('ui.paste.coldConfirm', 'Continuar'),
      build(body) {
        body.innerHTML = '<div class="paste-cold" contenteditable="true" role="textbox" aria-multiline="true"></div>';
        ta = body.querySelector('.paste-cold');
        setTimeout(() => ta.focus(), 40);
      },
    });
    if (!ok || !ta) return;
    handle(ta.innerHTML || '', ta.textContent || '');
  }

  // ---- The pipeline ----

  async function handle(html, plain) {
    const doc = ES.state.doc;
    if (!doc) return;

    const report = { wordMarks: 0, images: 0, links: 0, adapted: [] };
    let paras = html ? clean(html, report) : plainToParagraphs(plain);
    if (!paras.length) paras = plainToParagraphs(plain);
    if (!paras.length) return;

    if (paras.length > MANY_PARAGRAPHS) {
      const go = await window.Dialog.confirm({
        title: t('ui.paste.hugeTitle', 'Colagem muito grande'),
        message: t('ui.paste.hugeMsg', 'São {count} parágrafos. Pode demorar. Continuar?', { count: paras.length }),
        confirmLabel: t('ui.paste.hugeConfirm', 'Continuar'),
      });
      if (!go) return;
    }

    // Characters the target charset can't hold are adapted now, with a report,
    // instead of being silently transliterated at save time hours later.
    noteUnencodable(paras, report);

    const ctx = window.ActFormat.context();
    const inTable = !!(ctx.block && ctx.block.closest && ctx.block.closest('table'));

    let mode = remembered();
    if (!mode) mode = await askMode(paras, inTable);
    if (!mode) return;

    insert(paras, mode, html, plain, report);
  }

  function remembered() {
    try { return sessionStorage.getItem(MODE_KEY) || null; } catch (_) { return null; }
  }

  async function askMode(paras, inTable) {
    const preview = paras.slice(0, 3);
    const counts = tally(paras);
    let chosen = inTable ? 'texto' : 'ato';
    let remember = false;

    const ok = await window.Dialog.custom({
      title: t('ui.paste.title', 'Como colar este texto?'),
      message: t('ui.paste.subtitle', '{count} parágrafo(s) na área de transferência.', { count: paras.length }),
      icon: 'clipboard-paste',
      wide: true,
      confirmLabel: t('ui.paste.confirm', 'Colar'),
      build(body) {
        const opts = [];
        if (!inTable) {
          opts.push({ v: 'ato', label: t('ui.paste.modeAto', 'Como texto do ato'),
            desc: counts.summary || t('ui.paste.modeAtoDesc', 'Aplica a formatação padrão do ato a cada parágrafo.') });
        }
        opts.push({ v: 'texto', label: t('ui.paste.modeTexto', 'Só o texto, sem formatação'),
          desc: t('ui.paste.modeTextoDesc', 'Mantém apenas as palavras.') });
        opts.push({ v: 'original', label: t('ui.paste.modeOriginal', 'Manter a formatação original'),
          desc: t('ui.paste.modeOriginalDesc', 'O código do Word será gravado no arquivo.'), warn: true });

        body.innerHTML = '<div class="paste-opts"></div>' +
          '<div class="paste-preview-head"></div><div class="paste-preview"></div>' +
          '<label class="paste-remember"><input type="checkbox"> <span></span></label>';

        const list = body.querySelector('.paste-opts');
        opts.forEach((o, i) => {
          const row = document.createElement('label');
          row.className = 'paste-opt' + (o.warn ? ' warn' : '');
          row.innerHTML = '<input type="radio" name="paste-mode"><span class="paste-opt-t"></span>' +
                          '<span class="paste-opt-d"></span>';
          const radio = row.querySelector('input');
          radio.value = o.v;
          radio.checked = o.v === chosen;
          radio.addEventListener('change', () => { chosen = o.v; });
          row.querySelector('.paste-opt-t').textContent = o.label;
          row.querySelector('.paste-opt-d').textContent = o.desc;
          list.appendChild(row);
        });

        body.querySelector('.paste-preview-head').textContent = t('ui.paste.previewHead', 'Prévia dos primeiros parágrafos');
        const pv = body.querySelector('.paste-preview');
        preview.forEach((p) => {
          const row = document.createElement('div');
          row.className = 'paste-preview-row';
          const tag = document.createElement('span');
          tag.className = 'paste-preview-tag';
          tag.textContent = p.role ? window.ActFormat.label(p.role) : t('ui.paste.plainRole', 'texto');
          const txt = document.createElement('span');
          txt.className = 'paste-preview-text';
          txt.textContent = p.text.slice(0, 110);
          row.appendChild(tag); row.appendChild(txt);
          pv.appendChild(row);
        });

        const rem = body.querySelector('.paste-remember');
        rem.querySelector('span').textContent = t('ui.paste.remember', 'Não perguntar de novo nesta sessão');
        rem.querySelector('input').addEventListener('change', (e) => { remember = e.target.checked; });
      },
    });
    if (!ok) return null;
    if (remember) { try { sessionStorage.setItem(MODE_KEY, chosen); } catch (_) {} }
    return chosen;
  }

  function tally(paras) {
    const counts = {};
    paras.forEach(p => { if (p.role && p.role !== 'corpo') counts[p.role] = (counts[p.role] || 0) + 1; });
    const parts = Object.entries(counts).map(([k, v]) => v + ' × ' + window.ActFormat.label(k));
    return { counts, summary: parts.join(' · ') };
  }

  // ---- Cleaning ----

  function clean(html, report) {
    let s = String(html);
    const before = s.length;

    // String pre-pass. Conditional comments and namespaced tags are cheaper
    // and safer to remove textually than to walk around in the DOM.
    s = s.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
         .replace(/<!--[\s\S]*?-->/g, '')
         .replace(/<(style|script|xml|meta|link)\b[\s\S]*?<\/\1>/gi, '')
         .replace(/<(style|script|xml|meta|link)\b[^>]*\/?>/gi, '')
         .replace(/<\/?[a-z]+:[a-z-]+[^>]*>/gi, ''); // <o:p>, <w:*>, <v:*>
    report.wordMarks += countWordMarks(html);

    // DOMParser documents are inert by specification: no script runs, no
    // resource is fetched. Never parse clipboard HTML into the live document.
    const parsed = new DOMParser().parseFromString(s, 'text/html');
    const paras = [];
    walkBlocks(parsed.body, paras, report);
    return paras.filter(p => p.text.trim().length > 0);
  }

  function countWordMarks(html) {
    const m = String(html).match(/mso-|<o:p|class="?Mso|WordSection|<!--\[if/gi);
    return m ? m.length : 0;
  }

  const BLOCKY = /^(P|DIV|LI|H1|H2|H3|H4|H5|H6|TD|TH|TR|BLOCKQUOTE|SECTION|ARTICLE|PRE)$/;
  const DROP = /^(SCRIPT|STYLE|META|LINK|OBJECT|EMBED|IFRAME|FORM|INPUT|SELECT|TEXTAREA|BUTTON|NOSCRIPT)$/;

  function walkBlocks(node, out, report) {
    Array.from(node.children || []).forEach((el) => {
      if (DROP.test(el.tagName)) return;
      // A block that contains other blocks is a wrapper, not a paragraph.
      const hasBlockChild = Array.from(el.children).some(c => BLOCKY.test(c.tagName));
      if (hasBlockChild) { walkBlocks(el, out, report); return; }
      if (!BLOCKY.test(el.tagName)) { walkBlocks(el, out, report); return; }
      // <br><br> inside one <p> is Word's paragraph break.
      splitOnDoubleBr(el).forEach(frag => emit(frag, out, report));
    });
  }

  function splitOnDoubleBr(el) {
    const brs = el.querySelectorAll('br + br');
    if (!brs.length) return [el];
    const groups = [];
    let current = el.ownerDocument.createElement('div');
    let lastWasBr = false;
    Array.from(el.childNodes).forEach((n) => {
      if (n.nodeType === 1 && n.tagName === 'BR') {
        if (lastWasBr) { groups.push(current); current = el.ownerDocument.createElement('div'); lastWasBr = false; return; }
        lastWasBr = true;
        return;
      }
      if (n.nodeType === 3 && !n.nodeValue.trim()) return;
      lastWasBr = false;
      current.appendChild(n.cloneNode(true));
    });
    groups.push(current);
    return groups.filter(g => g.textContent.trim());
  }

  function emit(el, out, report) {
    report.images += el.querySelectorAll ? el.querySelectorAll('img').length : 0;
    const inline = sanitizeInline(el, report);
    const text = normSpace(el.textContent);
    if (!text) return;
    const d = window.ActFormat.detectDispositivo(text);
    out.push({ html: inline, text, role: d ? roleForDispositivo(d.kind) : 'corpo', dispositivo: d });
  }

  function roleForDispositivo(kind) {
    const map = { artigo: 'artigo', paragrafo: 'paragrafo', paragrafoUnico: 'paragrafoUnico',
      inciso: 'inciso', alinea: 'alinea', item: 'item', anexo: 'anexoTitulo',
      notaDou: 'notaDou', preambulo: 'preambulo', decreta: 'corpo' };
    return map[kind] || 'corpo';
  }

  // Reduce to the inline vocabulary the acts use, dropping every attribute
  // except a link's href. Word's emphasis-as-inline-style is translated back
  // to <b>/<i> rather than lost.
  const KEEP = new Set(['B', 'I', 'SUP', 'SUB', 'BR']);
  const UNWRAP = new Set(['SPAN', 'FONT', 'SMALL', 'BIG', 'U', 'STRONG', 'EM', 'DIV', 'P', 'LABEL', 'A']);

  function sanitizeInline(el, report) {
    const doc = document.implementation.createHTMLDocument('');
    const host = doc.createElement('div');
    Array.from(el.childNodes).forEach(n => host.appendChild(conv(n, doc, report)));
    return host.innerHTML;
  }

  function conv(node, doc, report) {
    if (node.nodeType === 3) return doc.createTextNode(normQuotes(node.nodeValue));
    if (node.nodeType !== 1) return doc.createDocumentFragment();
    const tag = node.tagName;
    if (DROP.test(tag) || tag === 'IMG') return doc.createDocumentFragment();

    if (tag === 'A') {
      const href = node.getAttribute('href') || '';
      // javascript:, file: and Word's local temp paths are never wanted.
      const safe = /^(https?:|mailto:|#)/i.test(href);
      const frag = doc.createDocumentFragment();
      Array.from(node.childNodes).forEach(c => frag.appendChild(conv(c, doc, report)));
      if (!safe) return frag;
      report.links++;
      const a = doc.createElement('a');
      a.setAttribute('href', href);
      a.appendChild(frag);
      return a;
    }
    if (KEEP.has(tag)) {
      const k = doc.createElement(tag.toLowerCase());
      Array.from(node.childNodes).forEach(c => k.appendChild(conv(c, doc, report)));
      return k;
    }
    const style = (node.getAttribute('style') || '').toLowerCase();
    const bold = tag === 'STRONG' || /font-weight\s*:\s*(bold|[6-9]00)/.test(style);
    const italic = tag === 'EM' || /font-style\s*:\s*italic/.test(style);
    const frag = doc.createDocumentFragment();
    Array.from(node.childNodes).forEach(c => frag.appendChild(conv(c, doc, report)));
    if (!UNWRAP.has(tag) && !bold && !italic) return frag;
    let outNode = frag;
    if (italic) { const i = doc.createElement('i'); i.appendChild(outNode); outNode = i; }
    if (bold) { const b = doc.createElement('b'); b.appendChild(outNode); outNode = b; }
    return outNode;
  }

  // Curly quotes, dashes and the ellipsis all exist in windows-1252 and are
  // the house style, so they stay. The non-breaking space stays too — it IS
  // the convention after "Art. 1º".
  //
  // What does get removed is the invisible junk Word carries: zero-width
  // spaces and joiners, soft hyphens and a stray BOM. They survive a save,
  // cannot be seen, and quietly break text search on the published act.
  const INVISIBLE = /[\u200b-\u200d\u2060\u00ad\ufeff]/g;
  function normQuotes(s) {
    return String(s).replace(INVISIBLE, '');
  }
  function normSpace(s) {
    return String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }

  function plainToParagraphs(plain) {
    return String(plain || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map((line) => {
      const d = window.ActFormat.detectDispositivo(line);
      return { html: escapeHtml(line), text: line, role: d ? roleForDispositivo(d.kind) : 'corpo', dispositivo: d };
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Report characters the document's charset cannot represent, at paste time.
  function noteUnencodable(paras, report) {
    const enc = window.Encoding;
    if (!enc || typeof enc.canEncode !== 'function') return;
    const charset = ES.state.encoding || 'utf-8';
    if (/utf-?8/i.test(charset)) return;
    const seen = new Set();
    paras.forEach((p) => {
      for (const ch of p.text) {
        if (ch.codePointAt(0) < 128 || seen.has(ch)) continue;
        let ok = true;
        try { ok = enc.canEncode(ch, charset); } catch (_) { ok = true; }
        if (!ok) { seen.add(ch); report.adapted.push(ch); }
      }
    });
  }

  // ---- Insertion ----

  function insert(paras, mode, rawHtml, plain, report) {
    const doc = ES.state.doc;
    const ctx = window.ActFormat.context();

    // The pre-paste state was never captured (a text-edit session only
    // snapshots on blur), so take one now — otherwise the paste cannot be
    // undone back to where the user started.
    ES.snapshot('antes de colar');
    if (window.Canvas.commitTextEdit) window.Canvas.commitTextEdit();

    if (mode === 'original') {
      insertRaw(rawHtml || escapeHtml(plain), ctx, doc);
      ES.snapshot('colar (formatação original)');
      toast(t('ui.paste.doneOriginal', 'Colado com a formatação original do Word.'), 'warn');
      return;
    }

    const created = [];
    const host = ctx.block;

    // A single plain phrase pasted inside a paragraph belongs at the caret —
    // that is what most pastes actually are.
    if (mode === 'ato' && paras.length === 1 && !paras[0].dispositivo && ctx.range && host) {
      const span = doc.createElement('span');
      span.innerHTML = paras[0].html;
      ctx.range.deleteContents();
      ctx.range.insertNode(span);
      unwrap(span);
      ES.snapshot('colar do Word');
      finishReport(paras, report, mode);
      return;
    }

    // Otherwise every paragraph becomes a sibling block. Never a <p> inside a
    // <p>: that is invalid and the browser silently reshuffles it.
    let anchorEl = host;
    paras.forEach((p) => {
      const el = doc.createElement('p');
      // "Só o texto" means only the words: drop even the bold, italics and
      // links that the cleaner kept, or the option would not match its label.
      if (mode === 'texto') el.textContent = p.text;
      else el.innerHTML = p.html || escapeHtml(p.text);
      if (anchorEl && anchorEl.parentNode) {
        anchorEl.parentNode.insertBefore(el, anchorEl.nextSibling);
        anchorEl = el;
      } else {
        doc.body.appendChild(el);
        anchorEl = el;
      }
      created.push({ el, role: p.role });
    });

    if (mode === 'ato') {
      created.forEach(({ el, role }) => {
        // noText: the dispositivo marker is already in the pasted text; adding
        // another would produce "Art. 1º  Art. 5º".
        window.ActFormat.applyRole(role, el, { batch: true, force: true, noText: true });
      });
    }

    ES.snapshot('colar do Word');
    if (created.length) ES.select(created[0].el);
    window.ActFormat.invalidate();
    finishReport(paras, report, mode);
  }

  function insertRaw(html, ctx, doc) {
    const holder = doc.createElement('div');
    holder.innerHTML = html;
    const target = ctx.block || doc.body;
    Array.from(holder.childNodes).forEach((n) => {
      if (target === doc.body) doc.body.appendChild(n);
      else target.parentNode.insertBefore(n, target.nextSibling);
    });
  }

  function unwrap(el) {
    const parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    el.remove();
  }

  function finishReport(paras, report, mode) {
    const counts = tally(paras);
    const bits = [t('ui.paste.rPara', '{n} parágrafos', { n: paras.length })];
    if (mode === 'ato' && counts.summary) bits.push(counts.summary);
    if (report.wordMarks) bits.push(t('ui.paste.rWord', '{n} marcas do Word removidas', { n: report.wordMarks }));
    if (report.links) bits.push(t('ui.paste.rLinks', '{n} links mantidos', { n: report.links }));
    if (report.images) bits.push(t('ui.paste.rImages', '{n} imagens descartadas', { n: report.images }));
    if (report.adapted.length) bits.push(t('ui.paste.rChars', '{n} caracteres serão adaptados ao salvar', { n: report.adapted.length }));
    toast(t('ui.paste.done', 'Colado: ') + bits.join(' · '), 'success');
  }

  function toast(msg, type) {
    const host = document.getElementById('toasts');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  return { onPaste, openColdPaste, clean, plainToParagraphs };
})();
