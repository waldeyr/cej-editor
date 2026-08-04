// Blocks panel — render and wire the draggable component library + snippets/recent
window.BlocksPanel = (function() {
  const ES = window.EditorState;
  const I18N = window.I18N;
  let listEl, searchEl, snippetsEl, recentEl, saveSnippetBtn;

  function init() {
    listEl = document.getElementById('blocks-list');
    searchEl = document.getElementById('blocks-search');
    snippetsEl = document.getElementById('snippets-list');
    recentEl = document.getElementById('recent-list');
    saveSnippetBtn = document.getElementById('save-snippet');

    if (I18N) {
      searchEl.placeholder = I18N.t('ui.blocks.searchPlaceholder');
      saveSnippetBtn.textContent = I18N.t('ui.blocks.saveSelection');
    }

    renderBlocks('');
    searchEl.addEventListener('input', () => renderBlocks(searchEl.value));

    ES.on((evt) => {
      if (evt === 'snippets-changed') renderSnippets();
      if (evt === 'recent-changed') renderRecent();
      if (evt === 'selection-changed') {
        saveSnippetBtn.disabled = !ES.state.selected;
      }
    });

    if (I18N) {
      window.addEventListener('i18n:changed', () => {
        searchEl.placeholder = I18N.t('ui.blocks.searchPlaceholder');
        saveSnippetBtn.textContent = I18N.t('ui.blocks.saveSelection');
        renderBlocks(searchEl.value || '');
        renderSnippets();
        renderRecent();
      });
    }

    saveSnippetBtn.addEventListener('click', async () => {
      const sel = ES.state.selected;
      if (!sel) return;
      const name = await window.Dialog.prompt({
        title: I18N.t('ui.blocks.saveSnippetTitle'),
        message: I18N.t('ui.blocks.saveSnippetMsg'),
        defaultValue: sel.tagName.toLowerCase(),
        placeholder: I18N.t('ui.blocks.saveSnippetPlaceholder'),
        confirmLabel: I18N.t('ui.blocks.saveLabel'),
      });
      if (!name) return;
      ES.addSnippet(name, sel.outerHTML);
      toast(I18N.t('ui.blocks.snippetSaved'), 'success');
    });

    renderSnippets();
    renderRecent();
  }

  // Collapsed groups, persisted. 'avancado' — the generic web-page blocks —
  // starts closed: it is not what these users are here for.
  const COLLAPSE_KEY = 'html-editor.blocks.collapsed';
  function collapsedSet() {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      return new Set(raw ? JSON.parse(raw) : ['avancado']);
    } catch (_) { return new Set(['avancado']); }
  }
  function saveCollapsed(set) {
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(Array.from(set))); } catch (_) {}
  }

  function groupLabel(g) {
    return I18N ? I18N.t('ui.act.groups.' + g, null, g) : g;
  }

  // A block's display name: act pieces carry an i18n key; the legacy web
  // blocks keep the English-keyed translation maps in i18n.js.
  function nameOf(b) {
    if (b.labelKey && I18N) {
      const s = I18N.t(b.labelKey, null, '');
      if (s) return s;
    }
    return I18N ? I18N.translateBlockName(b.name) : b.name;
  }

  function renderBlocks(filter) {
    listEl.innerHTML = '';
    const f = (filter || '').toLowerCase().trim();
    const collapsed = collapsedSet();

    // A search must reach into collapsed groups. Otherwise typing "botão"
    // finds nothing because every match lives inside Avançado, which is shut.
    const searching = !!f;

    const groups = new Map();
    for (const b of window.Blocks) {
      const g = b.group || 'avancado';
      const shownName = nameOf(b);
      const shownCat = I18N ? I18N.translateBlockCategory(b.cat) : b.cat;
      if (f) {
        const hay = (b.name + ' ' + b.cat + ' ' + shownName + ' ' + shownCat).toLowerCase();
        if (!hay.includes(f)) continue;
      }
      if (!groups.has(g)) groups.set(g, new Map());
      const cats = groups.get(g);
      if (!cats.has(shownCat)) cats.set(shownCat, []);
      cats.get(shownCat).push({ b, shownName });
    }

    if (!groups.size) {
      const none = document.createElement('div');
      none.className = 'empty-list';
      none.textContent = I18N ? I18N.t('ui.blocks.noMatch', null, 'Nada encontrado.') : 'Nada encontrado.';
      listEl.appendChild(none);
      return;
    }

    for (const [g, cats] of groups) {
      const isOpen = searching || !collapsed.has(g);
      const wrap = document.createElement('div');
      wrap.className = 'block-group';
      wrap.dataset.group = g;

      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'block-group-head';
      head.setAttribute('aria-expanded', String(isOpen));
      head.innerHTML = '<i data-lucide="chevron-right"></i><span></span>';
      head.querySelector('span').textContent = groupLabel(g);
      head.addEventListener('click', () => {
        const set = collapsedSet();
        if (set.has(g)) set.delete(g); else set.add(g);
        saveCollapsed(set);
        renderBlocks(searchEl ? searchEl.value : '');
      });
      wrap.appendChild(head);

      const grid = document.createElement('div');
      grid.className = 'blocks-grid';
      grid.hidden = !isOpen;
      for (const [cat, items] of cats) {
        const h = document.createElement('div');
        h.className = 'block-category';
        h.textContent = cat;
        grid.appendChild(h);
        items.forEach(({ b, shownName }) => grid.appendChild(blockTile(b, shownName)));
      }
      wrap.appendChild(grid);
      listEl.appendChild(wrap);
    }
    if (window.renderIcons) window.renderIcons();
  }

  function blockTile(b, shownName) {
    const el = document.createElement('div');

    // Action tiles run a command instead of inserting HTML — nothing to drag.
    if (b.action) {
      el.className = 'block-item block-action';
      el.draggable = false;
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.innerHTML = `<div class="block-icon"><i data-lucide="${b.icon}"></i></div><div class="block-name">${shownName}</div>`;
      el.title = I18N ? I18N.t('ui.blocks.actionHint', { name: shownName }) : shownName;
      el.addEventListener('click', () => runAction(b.action));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
      });
      return el;
    }

    el.className = 'block-item' + (b.role ? ' block-piece' : '');
    el.draggable = true;
    el.innerHTML = `<div class="block-icon"><i data-lucide="${b.icon}"></i></div><div class="block-name">${shownName}</div>`;
    el.title = b.role
      ? shownName + (window.ActFormat.hint(b.role) ? ' — ' + window.ActFormat.hint(b.role) : '')
      : shownName;
    el.addEventListener('dragstart', (e) => {
      // Resolved at drag time, never at definition time: a recipe change in
      // act-format.js then propagates without rebuilding this panel.
      window.Canvas.setDragData({ type: 'block', html: htmlFor(b), name: shownName });
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', shownName);
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      window.Canvas.clearDragData();
    });
    // Click to append to selection or body
    el.addEventListener('dblclick', () => {
      const doc = ES.state.doc;
      if (!doc) return;
      const html = htmlFor(b);
      if (!html) return;
      const target = ES.state.selected || doc.body;
      const tpl = doc.createElement('template');
      tpl.innerHTML = html.trim();
      const node = tpl.content.firstElementChild;
      if (!node) return;
      // A piece of an act is a sibling of the paragraph you were on, not a
      // child of it — a <p> inside a <p> is invalid and gets reshuffled.
      if (b.role && target !== doc.body && target.parentNode) {
        target.parentNode.insertBefore(node, target.nextSibling);
      } else {
        target.appendChild(node);
      }
      ES.snapshot('inserir ' + shownName);
      ES.select(node);
    });
    return el;
  }

  function htmlFor(b) {
    if (b.role) return window.ActFormat.sampleHtml(b.role);
    return b.html;
  }

  function runAction(action) {
    if (action === 'link') return window.LinkTool && window.LinkTool.open();
    if (action === 'paste-word') return window.PasteWord && window.PasteWord.openColdPaste();
    if (action === 'check') return window.ActCheck && window.ActCheck.show();
    if (window.PageTools) window.PageTools.run(action);
  }

  function renderSnippets() {
    snippetsEl.innerHTML = '';
    if (!ES.state.snippets.length) {
      snippetsEl.innerHTML = `<div class="empty-list">${I18N.t('ui.assets.noSnippets')}</div>`;
      return;
    }
    for (const s of ES.state.snippets) {
      const item = document.createElement('div');
      item.className = 'snippet-item';
      item.draggable = true;
      const name = document.createElement('span');
      name.textContent = s.name;
      name.style.flex = '1';
      const del = document.createElement('button');
      del.textContent = '×';
      del.title = I18N.t('ui.blocks.deleteSnippet');
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await window.Dialog.confirm({
          title: I18N.t('ui.blocks.deleteSnippetTitle', { name: s.name }),
          message: I18N.t('ui.blocks.deleteSnippetMsg'),
          confirmLabel: I18N.t('ui.blocks.delete'),
          danger: true,
        });
        if (ok) ES.removeSnippet(s.id);
      });
      item.appendChild(name);
      item.appendChild(del);
      item.addEventListener('dragstart', (e) => {
        window.Canvas.setDragData({ type: 'snippet', html: s.html, name: s.name });
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', s.name);
      });
      item.addEventListener('dragend', () => window.Canvas.clearDragData());
      item.addEventListener('dblclick', () => {
        const doc = ES.state.doc;
        if (!doc) return;
        const target = ES.state.selected || doc.body;
        const tpl = doc.createElement('template');
        tpl.innerHTML = s.html.trim();
        const node = tpl.content.firstElementChild;
        if (!node) return;
        target.appendChild(node);
        ES.snapshot('insert snippet');
        ES.select(node);
      });
      snippetsEl.appendChild(item);
    }
  }

  function renderRecent() {
    recentEl.innerHTML = '';
    if (!ES.state.recent.length) {
      recentEl.innerHTML = `<div class="empty-list">${I18N.t('ui.assets.noRecent')}</div>`;
      return;
    }
    for (const r of ES.state.recent) {
      const item = document.createElement('div');
      item.className = 'recent-item';
      item.title = new Date(r.at).toLocaleString();
      const name = document.createElement('span');
      name.textContent = r.name;
      name.style.flex = '1';
      name.style.overflow = 'hidden';
      name.style.textOverflow = 'ellipsis';
      name.style.whiteSpace = 'nowrap';
      item.appendChild(name);
      recentEl.appendChild(item);
    }
  }

  function toast(msg, type = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    document.getElementById('toasts').appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  return { init };
})();
