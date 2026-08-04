// Page tools — the FrontPage-style document actions that aren't blocks of
// content: anchors ("âncora"; FrontPage called them "Indicador") and the page
// title. Reached from the action tiles in the Blocks panel (window.Blocks
// entries carrying `action`).
window.PageTools = (function() {
  const ES = window.EditorState;
  const I18N = window.I18N;

  const MAX_ROWS = 300; // real government pages carry hundreds of ids

  function run(action) {
    if (action === 'anchor') return openAnchorDialog();
    if (action === 'page-title') return openPageTitleDialog();
  }

  // ---- Styles the document already defines ----
  // Pages exported from Word/FrontPage carry a big <style> block. Reading it
  // back turns "apply a style" into picking from a list instead of having to
  // remember that the class is called `span.Hiperlink`.

  const EDITOR_SHEET_IDS = window.EditorTraces.STYLE_IDS;

  function collectRules(rules, out) {
    for (const rule of rules) {
      // Not `else`: with CSS nesting a CSSStyleRule also exposes .cssRules,
      // so a style rule can be both a selector and a container.
      if (rule.cssRules && rule.cssRules.length) collectRules(rule.cssRules, out);
      if (!rule.selectorText) continue;
      for (const part of rule.selectorText.split(',')) {
        // Last compound of the selector — "div.Section1 span.texto" is a rule
        // about span.texto, and that's the class worth offering.
        const compound = part.trim().split(/\s+|>|\+|~/).filter(Boolean).pop() || '';
        const classes = compound.match(/\.[A-Za-z_][-\w]*/g);
        if (!classes) continue;
        const tag = (compound.match(/^[A-Za-z][\w-]*/) || [''])[0].toLowerCase();
        for (const c of classes) {
          const name = c.slice(1);
          if (!out.has(name)) out.set(name, new Set());
          out.get(name).add(tag);
        }
      }
    }
  }

  // Map of class name -> Set of tag names it is defined for ('' = any element).
  function documentClasses(doc) {
    const out = new Map();
    if (!doc) return out;
    let sheets;
    try { sheets = Array.from(doc.styleSheets || []); } catch (_) { return out; }
    for (const sheet of sheets) {
      const owner = sheet.ownerNode;
      if (owner && owner.id && EDITOR_SHEET_IDS.includes(owner.id)) continue;
      let rules;
      try { rules = sheet.cssRules; } catch (_) { continue; } // cross-origin
      if (!rules) continue;
      try { collectRules(rules, out); } catch (_) { /* malformed rule — skip */ }
    }
    return out;
  }

  // Apply a class to whatever the user has selected. Text range inside one
  // block becomes a <span class="…"> around it — the FrontPage habit of
  // "type something, select it, pick a style".
  function applyClassToSelection(cls) {
    const doc = ES.state.doc;
    if (!doc || !cls) return false;

    const range = window.Canvas.getTextRange ? window.Canvas.getTextRange() : null;
    if (range) {
      const startBlock = blockOf(range.startContainer);
      const endBlock = blockOf(range.endContainer);

      if (startBlock === endBlock) {
        const span = doc.createElement('span');
        span.className = cls;
        try {
          range.surroundContents(span);
        } catch (_) {
          // Range partially selects a non-text node — extract and re-wrap.
          span.appendChild(range.extractContents());
          range.insertNode(span);
        }
        try { doc.defaultView.getSelection().removeAllRanges(); } catch (_) {}
        ES.snapshot('style ' + cls);
        ES.select(span);
        toast(I18N.t('ui.styleBar.appliedToText', { cls }), 'success');
        return true;
      }

      // Crossing block boundaries: wrapping that in one <span> would put block
      // elements inside an inline element. Style each block instead, which is
      // what a word processor does.
      const blocks = blocksInRange(range);
      if (!blocks.length) return false;
      blocks.forEach(b => b.classList.add(cls));
      try { doc.defaultView.getSelection().removeAllRanges(); } catch (_) {}
      ES.snapshot('style ' + cls);
      ES.select(blocks[0]);
      toast(I18N.t('ui.styleBar.appliedToBlocks', { cls, count: blocks.length }), 'success');
      return true;
    }

    const el = ES.state.selected;
    if (el && el !== doc.body && el !== doc.documentElement) {
      el.classList.add(cls);
      ES.snapshot('style ' + cls);
      ES.select(el);
      toast(I18N.t('ui.styleBar.appliedToElement', { cls, element: describe(el) }), 'success');
      return true;
    }

    toast(I18N.t('ui.styleBar.nothingSelected'), 'warn');
    return false;
  }

  // Outermost non-inline elements the range touches.
  function blocksInRange(range) {
    const doc = ES.state.doc;
    const root = range.commonAncestorContainer.nodeType === 1
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    if (!root) return [];
    const hits = [];
    root.querySelectorAll('*').forEach((el) => {
      if (el === doc.body || INLINE_TAGS.test(el.tagName)) return;
      let intersects = false;
      try { intersects = range.intersectsNode(el); } catch (_) { return; }
      if (!intersects) return;
      if (hits.some(h => h.contains(el))) return; // keep only the outermost
      hits.push(el);
    });
    if (!hits.length) {
      const b = blockOf(range.startContainer);
      if (b && b !== doc.body) hits.push(b);
    }
    return hits;
  }

  // ---- Helpers ----

  // "Considerações finais" -> "Consideracoes-finais". HTML4 ids must start
  // with a letter, which is what legacy FrontPage pages and their #links
  // expect.
  function sanitizeId(raw) {
    const cleaned = String(raw || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^A-Za-z0-9_.:-]/g, '')
      .replace(/^[^A-Za-z]+/, '')
      .slice(0, 64);
    // ASCII on purpose: the sanitizer folds diacritics, so 'âncora' would
    // come back out as 'ancora' anyway.
    return cleaned || 'ancora';
  }

  // Bookmark names follow the grammar the published acts actually use, which
  // is NOT the HTML4 id grammar. Measured on Lei 8.112 consolidada (1219
  // bookmarks, none of which carries an id): `art103§1`, `art9p` (parágrafo
  // único), `art117pi`, `titulov`, `capiv`, `secaoiv`, `anexo2a`, with `.`
  // and `.0` suffixes marking successive redações — and `§` written
  // LITERALLY in the attribute, never percent-encoded. (Percent-encoding
  // appears only in hrefs, which is a URL-level concern; see LinkTool.)
  //
  // This distinction is not cosmetic: the id rule above strips `§`, so
  // `art3§1` silently became `art31` and collided with article 31's bookmark.
  function sanitizeAnchorName(raw) {
    const cleaned = String(raw || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^A-Za-z0-9§._-]/g, '')
      // A fragment starting with a digit is not a usable target in the legacy
      // browsers these pages still serve, and the corpus never produces one.
      .replace(/^[^A-Za-z§]+/, '')
      .slice(0, 64);
    return cleaned || 'ancora';
  }

  function idTaken(doc, id) {
    if (doc.getElementById(id)) return true;
    try { return !!doc.querySelector(`a[name="${cssEscape(id)}"]`); }
    catch (_) { return false; }
  }

  function uniqueId(doc, base, ignoreEl) {
    let id = base;
    let n = 2;
    while (idTaken(doc, id)) {
      const hit = doc.getElementById(id) || doc.querySelector(`a[name="${cssEscape(id)}"]`);
      if (ignoreEl && hit === ignoreEl) break;
      id = `${base}-${n++}`;
    }
    return id;
  }

  // Fragment spelling. The bookmark ATTRIBUTE carries `§` literally; the
  // fragment in an href carries it percent-encoded (`%C2%A7`), which is how
  // all 39 cross-act links in the sample act are written. Keeping the two
  // spellings straight is the difference between a working link and one the
  // link checker reports as broken.
  function encodeFragment(name) {
    return String(name || '').replace(/[^A-Za-z0-9._~:@!$&'()*+,;=/?-]/g, (c) => {
      try { return encodeURIComponent(c); } catch (_) { return c; }
    });
  }
  function decodeFragment(frag) {
    try { return decodeURIComponent(String(frag || '')); }
    catch (_) { return String(frag || ''); } // malformed % escape — compare raw
  }

  function cssEscape(s) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(s);
    return String(s).replace(/["\\]/g, '\\$&');
  }

  // The canvas text selection, re-validated against the live document: an
  // undo can replace the whole document while a dialog is open.
  function liveRange(range) {
    const doc = ES.state.doc;
    if (!range || !doc || !doc.body) return null;
    try {
      if (!range.startContainer || !range.startContainer.isConnected) return null;
      if (!doc.body.contains(range.commonAncestorContainer)) return null;
      if (range.collapsed) return null;
    } catch (_) { return null; }
    return range;
  }

  const INLINE_TAGS = /^(A|B|I|EM|STRONG|SPAN|CODE|SMALL|SUB|SUP|U|S|MARK|FONT|BR|IMG|ABBR|CITE|Q|LABEL|VAR|SAMP|KBD|TIME|WBR|BDI|BDO)$/;

  function blockOf(node) {
    const doc = ES.state.doc;
    let el = node && node.nodeType === 1 ? node : (node && node.parentElement);
    while (el && el !== doc.body && el.tagName && INLINE_TAGS.test(el.tagName)) {
      el = el.parentElement;
    }
    return el;
  }

  // ---- Anchors ("âncora"; FrontPage: "Indicador") ----

  async function openAnchorDialog() {
    const doc = ES.state.doc;
    if (!doc) { toast(I18N.t('ui.pageTitle.noDoc'), 'warn'); return; }

    // Snapshot the selection before the dialog steals focus.
    const live = window.Canvas.getTextRange ? window.Canvas.getTextRange() : null;
    const savedRange = live ? live.cloneRange() : null;
    const savedEl = ES.state.selected;

    let scopeKind = 'none';
    let scopeText = I18N.t('ui.anchor.scopeNone');
    if (savedRange) {
      scopeKind = 'range';
      const txt = savedRange.toString().replace(/\s+/g, ' ').trim();
      scopeText = I18N.t('ui.anchor.scopeText', { text: txt.length > 60 ? txt.slice(0, 60) + '…' : txt });
    } else if (savedEl && savedEl !== doc.body) {
      scopeKind = 'element';
      scopeText = I18N.t('ui.anchor.scopeElement', { element: describe(savedEl) });
    }

    let nameInput = null;
    let done = false; // Enter in the field creates and closes; don't create twice

    await window.Dialog.custom({
      title: I18N.t('ui.anchor.title'),
      message: I18N.t('ui.anchor.message'),
      icon: 'bookmark',
      wide: true,
      confirmLabel: I18N.t('ui.anchor.create'),
      cancelLabel: I18N.t('ui.anchor.close'),
      build(body, ctx) {
        body.innerHTML = `
          <label class="bookmark-field">
            <span class="bookmark-label"></span>
            <input type="text" class="dialog-input" id="anchor-name">
          </label>
          <div class="bookmark-scope"></div>
          <div class="bookmark-list-head"></div>
          <div class="bookmark-list"></div>
        `;
        body.querySelector('.bookmark-label').textContent = I18N.t('ui.anchor.nameLabel');
        body.querySelector('.bookmark-scope').textContent = scopeText;
        body.querySelector('.bookmark-list-head').textContent = I18N.t('ui.anchor.listTitle');

        nameInput = body.querySelector('#anchor-name');
        nameInput.placeholder = I18N.t('ui.anchor.namePlaceholder');
        if (scopeKind === 'range') nameInput.value = savedRange.toString().trim().slice(0, 64);
        else if (scopeKind === 'element' && savedEl.textContent) nameInput.value = savedEl.textContent.trim().slice(0, 64);
        nameInput.disabled = scopeKind === 'none';
        setTimeout(() => { nameInput.focus(); nameInput.select(); }, 40);

        // Enter in the name field creates the bookmark (the dialog's own
        // Enter handling is suppressed inside .dialog-custom).
        nameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); create(ctx); }
        });

        renderList(body.querySelector('.bookmark-list'));
      },
    }).then((confirmed) => {
      // Dialog.custom resolves true when the primary button is pressed.
      if (confirmed && !done) create(null);
    });

    function create(ctx) {
      if (done) return;
      const value = nameInput ? nameInput.value : '';
      if (scopeKind === 'none') { toast(I18N.t('ui.anchor.scopeNone'), 'warn'); return; }
      if (!String(value).trim()) { toast(I18N.t('ui.anchor.invalidName'), 'warn'); return; }
      done = true;
      createAnchor(value, scopeKind === 'range' ? savedRange : null, savedEl);
      if (ctx) ctx.close(true);
    }
  }

  function createAnchor(rawName, range, element) {
    const doc = ES.state.doc;
    if (window.Canvas.commitTextEdit) window.Canvas.commitTextEdit();
    const id = uniqueId(doc, sanitizeAnchorName(rawName));
    const usable = liveRange(range);
    let created = null;
    let markerOnly = false;

    if (usable) {
      const a = doc.createElement('a');
      // `name` only. Every one of the 1219 bookmarks in Lei 8.112 consolidada
      // is `<a name="…">` with no id, and adding one would both diverge from
      // the published convention and add bytes to every anchor.
      a.setAttribute('name', id);
      const startBlock = blockOf(usable.startContainer);
      const endBlock = blockOf(usable.endContainer);
      if (startBlock !== endBlock) {
        // Selection crosses block boundaries — wrapping it in an <a> would
        // put block elements inside a link. Drop a plain FrontPage-style
        // marker at the start instead.
        const at = usable.cloneRange();
        at.collapse(true);
        at.insertNode(a);
        markerOnly = true;
      } else {
        try {
          usable.surroundContents(a);
        } catch (_) {
          // Range partially selects a non-text node — extract and re-insert.
          a.appendChild(usable.extractContents());
          usable.insertNode(a);
        }
      }
      created = a;
    } else if (element && element !== doc.body) {
      if (element.tagName === 'A') {
        element.setAttribute('name', id);
        created = element;
      } else {
        // Drop an `<a name>` marker as the element's first child rather than
        // stamping an id on it — that is what the published acts do, and it
        // leaves the element's own attributes untouched.
        const a = doc.createElement('a');
        a.setAttribute('name', id);
        element.insertBefore(a, element.firstChild);
        created = a;
      }
    } else {
      toast(I18N.t('ui.anchor.scopeNone'), 'warn');
      return;
    }

    try { doc.defaultView.getSelection().removeAllRanges(); } catch (_) {}
    ES.snapshot('anchor');
    ES.select(created);
    if (markerOnly) toast(I18N.t('ui.anchor.markerOnly'), 'warn');
    writeClipboard('#' + id, I18N.t('ui.anchor.created', { id }));
  }

  // The editor's own injected stylesheets carry ids; they are not bookmarks.

  function collectAnchors(doc) {
    const out = [];
    const seen = new Set();
    doc.querySelectorAll('a[name], [id]').forEach((el) => {
      if (window.EditorTraces.isEditorId(el.id)) return;
      const key = el.getAttribute('name') || el.id;
      if (!key || seen.has(el)) return;
      seen.add(el);
      out.push({ el, key, kind: el.matches('a[name]') ? 'anchor' : 'id' });
    });
    return out;
  }

  function renderList(listEl) {
    const doc = ES.state.doc;
    // rename/remove are also reachable from the "Este trecho" panel, where
    // there is no bookmark list to refresh.
    if (!listEl) return;
    listEl.innerHTML = '';
    if (!doc) return;
    const items = collectAnchors(doc);
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'bookmark-empty';
      empty.textContent = I18N.t('ui.anchor.empty');
      listEl.appendChild(empty);
      return;
    }
    items.slice(0, MAX_ROWS).forEach((item) => {
      const row = document.createElement('div');
      row.className = 'bookmark-row';
      row.innerHTML = `
        <span class="bookmark-name"></span>
        <span class="bookmark-chip"></span>
        <span class="bookmark-actions">
          <button type="button" data-act="goto"><i data-lucide="crosshair"></i></button>
          <button type="button" data-act="rename"><i data-lucide="pencil-line"></i></button>
          <button type="button" data-act="remove"><i data-lucide="x"></i></button>
        </span>
      `;
      row.querySelector('.bookmark-name').textContent = '#' + item.key;
      row.querySelector('.bookmark-chip').textContent =
        I18N.t(item.kind === 'anchor' ? 'ui.anchor.chipAnchor' : 'ui.anchor.chipId');
      row.querySelector('[data-act="goto"]').title = I18N.t('ui.anchor.goto');
      row.querySelector('[data-act="rename"]').title = I18N.t('ui.anchor.rename');
      row.querySelector('[data-act="remove"]').title = I18N.t('ui.anchor.remove');
      row.querySelector('[data-act="goto"]').addEventListener('click', () => gotoAnchor(item));
      row.querySelector('[data-act="rename"]').addEventListener('click', () => renameAnchor(item, listEl));
      row.querySelector('[data-act="remove"]').addEventListener('click', () => removeAnchor(item, listEl));
      listEl.appendChild(row);
    });
    if (items.length > MAX_ROWS) {
      const note = document.createElement('div');
      note.className = 'bookmark-empty';
      note.textContent = I18N.t('ui.anchor.truncated', { shown: MAX_ROWS, total: items.length });
      listEl.appendChild(note);
    }
    if (window.renderIcons) window.renderIcons();
  }

  function gotoAnchor(item) {
    if (!item.el.isConnected) return;
    if (typeof item.el.scrollIntoView === 'function') {
      item.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    ES.select(item.el);
  }

  async function renameAnchor(item, listEl) {
    const doc = ES.state.doc;
    if (!item.el.isConnected) { renderList(listEl); return; }
    const next = await window.Dialog.prompt({
      title: I18N.t('ui.anchor.renameTitle'),
      message: I18N.t('ui.anchor.renameMsg'),
      defaultValue: item.key,
      confirmLabel: I18N.t('ui.anchor.rename'),
    });
    if (next === null) return;
    if (!next.trim()) { toast(I18N.t('ui.anchor.invalidName'), 'warn'); return; }
    const id = uniqueId(doc, sanitizeAnchorName(next), item.el);
    if (id === item.key) { renderList(listEl); return; }

    // Keep in-page links pointing at it. Compare on the DECODED fragment:
    // a bookmark named `art3§1` is linked as `#art3%C2%A71` in every published
    // act, so a literal string compare would miss exactly the links that the
    // § grammar produces.
    let updated = 0;
    doc.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') || '';
      if (href[0] !== '#') return;
      if (decodeFragment(href.slice(1)) !== item.key) return;
      // Re-encode on the way out so the link keeps the portal's URL spelling.
      a.setAttribute('href', '#' + encodeFragment(id));
      updated++;
    });

    if (item.el.id === item.key) item.el.id = id;
    if (item.el.getAttribute('name') === item.key) item.el.setAttribute('name', id);
    item.key = id;

    ES.snapshot('rename anchor');
    toast(updated
      ? I18N.t('ui.anchor.renamedWithLinks', { id, count: updated })
      : I18N.t('ui.anchor.renamed', { id }), 'success');
    renderList(listEl);
  }

  async function removeAnchor(item, listEl) {
    if (!item.el.isConnected) { renderList(listEl); return; }
    const ok = await window.Dialog.confirm({
      title: I18N.t('ui.anchor.removeTitle'),
      message: I18N.t('ui.anchor.removeMsg', { id: item.key }),
      confirmLabel: I18N.t('ui.anchor.removeConfirm'),
      danger: true,
    });
    if (!ok) return;

    // Never destroy content: an empty <a name> marker is unwrapped, anything
    // else just loses the attribute.
    const el = item.el;
    if (el.tagName === 'A' && !el.hasAttribute('href')) {
      const parent = el.parentNode;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      el.remove();
      ES.snapshot('remove anchor');
      toast(I18N.t('ui.anchor.removedUnwrapped', { id: item.key }), 'success');
    } else {
      if (el.id === item.key) el.removeAttribute('id');
      if (el.getAttribute('name') === item.key) el.removeAttribute('name');
      ES.snapshot('remove anchor');
      toast(I18N.t('ui.anchor.removedId', { id: item.key }), 'success');
    }
    renderList(listEl);
  }

  // ---- Page title ----

  async function openPageTitleDialog() {
    const doc = ES.state.doc;
    if (!doc) { toast(I18N.t('ui.pageTitle.noDoc'), 'warn'); return; }
    const titleEl = doc.querySelector('head > title');
    const current = titleEl ? titleEl.textContent : (doc.title || '');

    const next = await window.Dialog.prompt({
      title: I18N.t('ui.pageTitle.title'),
      message: I18N.t('ui.pageTitle.message'),
      placeholder: I18N.t('ui.pageTitle.placeholder'),
      defaultValue: current,
      confirmLabel: I18N.t('ui.pageTitle.confirm'),
      icon: 'file-type',
    });
    if (next === null) return;

    const value = next.trim();
    let el = doc.querySelector('head > title');
    if (!el) {
      if (!doc.head) {
        doc.documentElement.insertBefore(doc.createElement('head'), doc.documentElement.firstChild);
      }
      el = doc.head.appendChild(doc.createElement('title'));
    }
    // textContent, never innerHTML — a title with & or < must stay escaped.
    el.textContent = value;
    ES.snapshot('page title');
    toast(I18N.t('ui.pageTitle.updated', { title: value }), 'success');
  }

  // ---- Shared small helpers (same shape as tree.js / blocks-panel.js) ----

  function describe(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.classList && el.classList.length) s += '.' + el.classList[0];
    return s;
  }

  function writeClipboard(text, successMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast(successMsg, 'success'),
        () => toast(successMsg, 'success') // the anchor was created either way
      );
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      ta.remove();
      toast(successMsg, 'success');
    }
  }

  function toast(msg, type) {
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = msg;
    const host = document.getElementById('toasts');
    if (!host) return;
    host.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  return {
    run, openAnchorDialog, openPageTitleDialog,
    sanitizeId, sanitizeAnchorName, uniqueId,
    documentClasses, applyClassToSelection,
    // Consumed by the "Este trecho" panel, the link tool and the final check.
    collectAnchors, renameAnchor, removeAnchor, gotoAnchor,
    encodeFragment, decodeFragment,
    blockOf, liveRange,
  };
})();
