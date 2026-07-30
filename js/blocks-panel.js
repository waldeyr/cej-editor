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

  function renderBlocks(filter) {
    listEl.innerHTML = '';
    const f = (filter || '').toLowerCase().trim();
    let lastCat = '';
    for (const b of window.Blocks) {
      const match = !f || b.name.toLowerCase().includes(f) || b.cat.toLowerCase().includes(f);
      const shownName = I18N ? I18N.translateBlockName(b.name) : b.name;
      const shownCat = I18N ? I18N.translateBlockCategory(b.cat) : b.cat;
      const translatedMatch = shownName.toLowerCase().includes(f) || shownCat.toLowerCase().includes(f);
      if (f && !match && !translatedMatch) continue;
      if (shownCat !== lastCat) {
        const h = document.createElement('div');
        h.className = 'block-category';
        h.textContent = shownCat;
        listEl.appendChild(h);
        lastCat = shownCat;
      }
      listEl.appendChild(blockTile(b, shownName));
    }
    if (window.renderIcons) window.renderIcons();
  }

  function blockTile(b, shownName) {
    const el = document.createElement('div');
    el.className = 'block-item';
    el.draggable = true;
    el.innerHTML = `<div class="block-icon"><i data-lucide="${b.icon}"></i></div><div class="block-name">${shownName}</div>`;
    el.title = shownName;
    el.addEventListener('dragstart', (e) => {
      window.Canvas.setDragData({ type: 'block', html: b.html, name: shownName });
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
      const target = ES.state.selected || doc.body;
      const tpl = doc.createElement('template');
      tpl.innerHTML = b.html.trim();
      const node = tpl.content.firstElementChild;
      if (!node) return;
      target.appendChild(node);
      ES.snapshot('insert ' + shownName);
      ES.select(node);
    });
    return el;
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
