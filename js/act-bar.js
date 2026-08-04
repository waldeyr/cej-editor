// The act formatting bar — a row of named chips, one per part of a normative
// act, always visible while editing.
//
// This replaces the "Style" dropdown, which read class names out of the
// document's own stylesheet. On a real act that dropdown offered `MsoNormal`,
// `WordSection1`…`WordSection24`, `eop` and `normaltextrun` — names that mean
// nothing to a legislation expert, and one of which inserts a page break.
//
// The chips say Epígrafe, Ementa, Artigo, Parágrafo, Inciso, Alínea,
// Assinatura, Nota do DOU — the vocabulary these users already think in.
window.ActBar = (function() {
  const ES = window.EditorState;
  const AF = () => window.ActFormat;

  let barEl, rolesEl, nowEl;
  let renderPending = false;

  function t(path, fallback) {
    try { return window.I18N.t(path, null, fallback); } catch (_) { return fallback; }
  }

  function init() {
    barEl = document.getElementById('act-bar');
    rolesEl = document.getElementById('act-bar-roles');
    nowEl = document.getElementById('act-bar-now');
    if (!barEl) return;

    buildChips();

    document.getElementById('act-bar-check')
      .addEventListener('click', () => window.ActCheck && window.ActCheck.show());
    document.getElementById('act-bar-links')
      .addEventListener('click', () => window.LinkTool && window.LinkTool.showAudit());
    document.getElementById('act-bar-paste')
      .addEventListener('click', () => window.PasteWord && window.PasteWord.openColdPaste());
    document.getElementById('act-bar-link')
      .addEventListener('click', () => window.LinkTool && window.LinkTool.open());

    // The caret moves far more often than the selection changes; both feed the
    // same refresh, coalesced so a drag-select doesn't re-render per frame.
    ES.on((evt) => {
      if (evt === 'caret-changed' || evt === 'selection-changed' ||
          evt === 'history' || evt === 'doc-replaced' || evt === 'doc-changed') {
        scheduleRefresh();
      }
      // The check is a full document sweep — run it when a document arrives,
      // not on every keystroke. The ambient "article without a bookmark"
      // warning lives in the structure panel, which is already incremental.
      if (evt === 'doc-changed' || evt === 'file-changed') scheduleCheckBadge();
    });
    window.addEventListener('i18n:changed', () => { buildChips(); refresh(); });
    refresh();
  }

  function scheduleRefresh() {
    if (renderPending) return;
    renderPending = true;
    requestAnimationFrame(() => { renderPending = false; refresh(); });
  }

  let checkTimer = null;
  function scheduleCheckBadge() {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => {
      const btn = document.getElementById('act-bar-check');
      if (!btn || !window.ActCheck) return;
      let n = 0;
      try { n = window.ActCheck.errorCount(); } catch (_) { return; }
      btn.classList.toggle('has-errors', n > 0);
      btn.dataset.count = n > 0 ? String(n) : '';
      const base = t('ui.check.dialogTitle', 'Conferência final do ato');
      btn.title = n > 0 ? base + ' — ' + n : base;
    }, 900);
  }

  // Chips are grouped in reading order: how an act is built, top to bottom.
  const GROUPS = ['abertura', 'corpo', 'fecho', 'anexo'];

  function buildChips() {
    if (!rolesEl) return;
    rolesEl.innerHTML = '';
    let shortcut = 0;
    GROUPS.forEach((g, gi) => {
      const inGroup = AF().roles().filter(r => r.group === g);
      if (!inGroup.length) return;
      if (gi > 0) {
        const sep = document.createElement('span');
        sep.className = 'act-chip-sep';
        rolesEl.appendChild(sep);
      }
      inGroup.forEach((r) => {
        shortcut++;
        rolesEl.appendChild(chip(r, shortcut <= 9 ? shortcut : null));
      });
    });
    if (window.renderIcons) window.renderIcons();
  }

  function chip(r, shortcutNum) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'act-chip';
    b.dataset.role = r.id;
    const hintText = AF().hint(r.id);
    // Ctrl+Alt, not Ctrl: browsers reserve Ctrl+1..9 for switching tabs and
    // the keydown never reaches the page.
    b.title = AF().label(r.id) + (hintText ? ' — ' + hintText : '') +
      (shortcutNum ? '  (Ctrl+Alt+' + shortcutNum + ')' : '');
    b.innerHTML = '<span class="act-chip-preview"></span><span class="act-chip-label"></span>';
    b.querySelector('.act-chip-preview').dataset.preview = r.preview || 'corpo-indent';
    b.querySelector('.act-chip-label').textContent = AF().label(r.id);
    b.addEventListener('click', () => AF().applyToContext(r.id));
    return b;
  }

  // Reflect what the caret is sitting in: which chip is the current format,
  // and what the text says it is.
  function refresh() {
    if (!barEl || !rolesEl) return;
    const ctx = AF().context();
    const block = ctx.block;
    const info = block ? AF().inspect(block) : null;

    rolesEl.querySelectorAll('.act-chip').forEach((c) => {
      const isIt = info && info.formato.roleId === c.dataset.role;
      c.classList.toggle('active', !!(isIt && info.formato.confidence === 'exata'));
      c.classList.toggle('near', !!(isIt && info.formato.confidence === 'proxima'));
    });

    if (!nowEl) return;
    if (!block) { nowEl.textContent = ''; nowEl.className = 'act-bar-now'; return; }

    const parts = [];
    if (info.dispositivo) parts.push(info.dispositivo.label);
    else if (info.formato.roleId) parts.push(AF().label(info.formato.roleId));

    let cls = 'act-bar-now';
    // The one defect worth interrupting for: an article with no bookmark can
    // never be linked to from another act, and that is discovered years later.
    if (info.agreement === 'sem-ancora') {
      parts.push(t('ui.act.now.noAnchor', 'sem âncora'));
      cls += ' warn';
    } else if (info.formato.confidence === 'proxima') {
      parts.push(t('ui.act.now.near', 'formatação aproximada'));
      cls += ' near';
    } else if (info.agreement === 'texto-sem-formato') {
      parts.push(t('ui.act.now.unformatted', 'ainda sem a formatação do ato'));
      cls += ' near';
    }
    nowEl.textContent = parts.join(' · ');
    nowEl.className = cls;
  }

  return { init, refresh };
})();

// Keyboard access to the roles. Registered as a shared handler because iframe
// keydowns never reach the parent document — canvas.js and keyboard.js both
// call this so the same keys work whichever frame has focus.
window.ActShortcuts = (function() {
  function handle(e) {
    // Ctrl+Alt+1..9 (⌥⌘1..9 on a Mac). Ctrl+1..9 alone is swallowed by the
    // browser's tab switching and never arrives.
    if ((e.ctrlKey || e.metaKey) && e.altKey && /^[1-9]$/.test(e.key)) {
      const roles = window.ActFormat.roles();
      const r = roles[+e.key - 1];
      if (!r) return false;
      e.preventDefault();
      window.ActFormat.applyToContext(r.id);
      return true;
    }
    return false;
  }
  return { handle };
})();
