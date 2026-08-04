// Act structure panel — the document as a legislation person reads it:
// Epígrafe, Ementa, Art. 1º, § 1º, Anexo I. Click a row to jump to it.
//
// This sits beside the DOM tree rather than replacing it. The tree is the
// escape hatch for a page the act recognizer doesn't understand; this is the
// view for the 95% of the time when it does.
window.OutlinePanel = (function() {
  const ES = window.EditorState;
  let host, timer = null;

  // I18N.t is (path, vars, fallback) and its formatter blanks every {k} when
  // vars is missing — so the vars must go through it, not be substituted after.
  function t(path, fallback, vars) {
    try { return window.I18N.t(path, vars || null, fallback); }
    catch (_) { return fallback; }
  }

  function init() {
    host = document.getElementById('act-outline');
    if (!host) return;
    ES.on((evt) => {
      if (evt === 'doc-replaced' || evt === 'doc-changed' || evt === 'file-changed') render();
      // A snapshot fires on every edit; the sweep is cheap but re-rendering
      // hundreds of rows on each keystroke is not.
      else if (evt === 'history') schedule();
      else if (evt === 'selection-changed' || evt === 'caret-changed') highlight();
    });
    window.addEventListener('i18n:changed', render);
    render();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(render, 300);
  }

  function render() {
    if (!host) return;
    host.innerHTML = '';
    const doc = ES.state.doc;
    if (!doc) { empty(t('ui.outline.noDoc', 'Abra um ato para ver sua estrutura.')); return; }

    const rows = window.ActFormat.outline(doc);
    if (!rows.length) {
      empty(t('ui.outline.none', 'Nenhuma estrutura de ato reconhecida nesta página. Use a aba Árvore.'));
      return;
    }

    const semAncora = rows.filter(r => r.kind === 'artigo' && !r.hasAnchor).length;
    if (semAncora) {
      const warn = document.createElement('button');
      warn.type = 'button';
      warn.className = 'outline-warn';
      warn.textContent = t('ui.outline.missingAnchors',
        '{n} artigo(s) sem âncora — outros atos não conseguirão apontar para eles.', { n: semAncora });
      warn.addEventListener('click', () => {
        const first = rows.find(r => r.kind === 'artigo' && !r.hasAnchor);
        if (first) goTo(first);
      });
      host.appendChild(warn);
    }

    rows.forEach((r) => host.appendChild(row(r)));
    if (window.renderIcons) window.renderIcons();
    highlight();
  }

  function row(r) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'outline-row lvl-' + r.level + ' kind-' + r.kind;
    el.dataset.index = r.index;
    el.innerHTML = '<span class="outline-label"></span><span class="outline-text"></span>' +
                   '<span class="outline-flag"></span>';
    el.querySelector('.outline-label').textContent = r.label;
    el.querySelector('.outline-text').textContent = r.text;
    const flag = el.querySelector('.outline-flag');
    if (r.hasAnchor) {
      flag.textContent = '#' + r.anchor;
      flag.className = 'outline-flag has';
      flag.title = t('ui.outline.hasAnchor', 'Âncora: #{name}', { name: r.anchor });
    } else if (r.kind === 'artigo' || r.kind === 'anexo') {
      flag.textContent = t('ui.outline.noAnchorShort', 'sem âncora');
      flag.className = 'outline-flag missing';
      flag.title = t('ui.outline.noAnchorHelp',
        'Este dispositivo não tem âncora. Sugestão: #{s}', { s: r.suggestion || '' });
    }
    el.addEventListener('click', () => goTo(r));
    return el;
  }

  function goTo(r) {
    if (!r.el || !r.el.isConnected) { render(); return; }
    try { r.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
    ES.select(r.el);
  }

  function highlight() {
    if (!host) return;
    const ctx = window.ActFormat.context();
    const block = ctx.block;
    const rows = window.ActFormat.outline(ES.state.doc);
    host.querySelectorAll('.outline-row').forEach((el) => {
      const r = rows[+el.dataset.index];
      el.classList.toggle('current', !!(r && block && r.el === block));
    });
  }

  function empty(msg) {
    const d = document.createElement('div');
    d.className = 'outline-empty';
    d.textContent = msg;
    host.appendChild(d);
  }

  return { init, render };
})();
