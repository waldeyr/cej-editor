// Bootstrap: wire toolbar buttons, sidebar tabs, status updates, theme
(function() {
  const ES = window.EditorState;
  const I18N = window.I18N;
  let isPreview = false;

  // Render Lucide icons (initial + idempotent for dynamic content)
  window.renderIcons = function() {
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (I18N && I18N.init) I18N.init();
    ES.loadTheme();
    ES.loadSnippets();
    ES.loadRecent();
    document.body.dataset.mode = ES.state.mode || 'visual';

    // Wait one tick so the deferred lucide UMD has executed
    requestAnimationFrame(() => window.renderIcons());

    window.Canvas.init();
    window.Tree.init();
    window.Properties.init();
    window.BlocksPanel.init();
    window.FileOps.init();
    window.Keyboard.init();

    wireEmptyState();
    wireToolbar();
    wireTabs();
    wireStatusUpdates();
    wireModeToggle();
    wireLanguageToggle();
    wireSidebarLayout();
    wireI18nRefresh();

    // Restore autosave if any
    const auto = ES.loadAutosave();
    if (auto && auto.html) {
      const minutes = Math.round((Date.now() - auto.at) / 60000);
      const age = I18N ? I18N.formatRelativeFromMinutes(minutes) : (minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`);
      const restore = document.createElement('button');
      restore.className = 'btn';
      restore.id = 'empty-restore';
      restore.style.marginTop = '12px';
      const restoreTitle = I18N ? I18N.t('ui.empty.restore') : 'Restore last session';
      const restoreAge = I18N
        ? I18N.t('ui.empty.age', { age, name: escapeHtml(auto.name) })
        : `${age} ago · ${escapeHtml(auto.name)}`;
      restore.innerHTML = `<kbd class="btn-shortcut">R</kbd><i data-lucide="history" class="icon"></i><span>${restoreTitle}</span><small>${restoreAge}</small>`;
      restore.addEventListener('click', async () => {
        ES.setFile(null, auto.name);
        ES.state.sourceHtml = auto.html;
        showEditor();
        await window.ModeSwitch.loadIntoInitialMode(auto.html);
      });
      const empty = document.querySelector('.empty-inner');
      const hint = document.querySelector('.empty-drop-hint');
      hint.parentNode.insertBefore(restore, hint);
      window.renderIcons();
    }
  });

  function wireEmptyState() {
    document.getElementById('empty-open-local').addEventListener('click', async () => {
      await window.FileOps.openLocalFile();
      if (ES.state.doc) showEditor();
    });
    document.getElementById('empty-import').addEventListener('click', () => {
      window.FileOps.promptImport();
    });
    document.getElementById('empty-new').addEventListener('click', () => {
      window.FileOps.newBlank();
      showEditor();
    });
    // After any file load — visual (doc-changed) or source (mode-changed) — flip to editor
    ES.on((evt) => {
      if (evt === 'doc-changed' && ES.state.doc) showEditor();
      if (evt === 'mode-changed') showEditor();
    });

    // Single-letter shortcuts on the empty state: A/B/C/R map to the
    // action buttons. Bare keys only — modifier keys defer to the OS
    // (cmd+A "select all" etc.) and field focus suppresses everything.
    document.addEventListener('keydown', (e) => {
      const empty = document.getElementById('empty-state');
      if (!empty || empty.hidden) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const map = {
        a: 'empty-open-local',
        b: 'empty-import',
        c: 'empty-new',
        r: 'empty-restore',
      };
      const id = map[e.key.toLowerCase()];
      if (!id) return;
      const btn = document.getElementById(id);
      if (!btn) return;
      e.preventDefault();
      btn.click();
    });
  }

  function showEditor() {
    document.getElementById('empty-state').hidden = true;
    document.getElementById('editor').hidden = false;
    requestAnimationFrame(() => window.Canvas.updateOverlay());
  }

  function wireToolbar() {
    document.getElementById('tb-undo').addEventListener('click', () => ES.undo());
    document.getElementById('tb-redo').addEventListener('click', () => ES.redo());
    document.getElementById('tb-duplicate').addEventListener('click', () => window.Canvas.duplicateSelected());
    document.getElementById('tb-delete').addEventListener('click', () => window.Canvas.deleteSelected());
    document.getElementById('tb-move-up').addEventListener('click', () => window.Canvas.moveSelected(-1));
    document.getElementById('tb-move-down').addEventListener('click', () => window.Canvas.moveSelected(1));
    document.getElementById('tb-parent').addEventListener('click', () => {
      const s = ES.state.selected;
      if (s && s.parentElement && s.parentElement !== ES.state.doc.documentElement) ES.select(s.parentElement);
    });

    document.querySelectorAll('.device-btn').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.device-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        window.Canvas.setDevice(b.dataset.device);
      });
    });

    const setPreview = (on) => {
      isPreview = on;
      document.getElementById('editor').classList.toggle('preview-mode', isPreview);
      document.getElementById('tb-preview').classList.toggle('active', isPreview);
      document.getElementById('exit-preview-btn').hidden = !isPreview;
      window.Canvas.setPreview(isPreview);
    };
    document.getElementById('tb-preview').addEventListener('click', () => setPreview(!isPreview));
    document.getElementById('exit-preview-btn').addEventListener('click', () => setPreview(false));
    window.__heExitPreview = () => { if (isPreview) { setPreview(false); return true; } return false; };

    document.getElementById('tb-external-preview').addEventListener('click', () => {
      const doc = ES.state.doc;
      if (!doc) return;
      const html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML
        .replace(/<style id="__he_styles__">[\s\S]*?<\/style>/g, '')
        .replace(/\s+contenteditable="[^"]*"/g, '')
        .replace(/\s+data-he-editing="[^"]*"/g, '');
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    });

    document.getElementById('tb-open').addEventListener('click', async () => {
      await window.FileOps.openLocalFile();
    });
    document.getElementById('tb-refresh').addEventListener('click', () => window.FileOps.reloadFromDisk());
    document.getElementById('tb-diff').addEventListener('click', () => window.DiffViewer.showAgainstDisk());
    document.getElementById('tb-git-diff').addEventListener('click', () => window.GitDiff.showDiff());
    document.getElementById('tb-import').addEventListener('click', () => window.FileOps.promptImport());
    document.getElementById('tb-assets-dir').addEventListener('click', () => window.FileOps.linkAssetsDirectory());
    document.getElementById('tb-export').addEventListener('click', () => window.FileOps.exportFile());
    document.getElementById('tb-save-as').addEventListener('click', () => window.FileOps.saveAs());
    document.getElementById('tb-save').addEventListener('click', () => window.FileOps.save());

    document.getElementById('tb-theme').addEventListener('click', () => ES.toggleTheme());
  }

  function wireTabs() {
    document.querySelectorAll('.sidebar-tabs').forEach(group => {
      group.addEventListener('click', (e) => {
        const tab = e.target.closest('.tab');
        if (!tab) return;
        const sidebar = group.closest('.sidebar');
        sidebar.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        sidebar.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        sidebar.querySelector(`.tab-panel[data-panel="${tab.dataset.tab}"]`).classList.add('active');
      });
    });
  }

  function wireModeToggle() {
    const toggle = document.getElementById('mode-toggle');
    toggle.addEventListener('click', async (e) => {
      const btn = e.target.closest('.mode-btn');
      if (!btn) return;
      const target = btn.dataset.mode;
      if (target === ES.state.mode) return;
      await window.ModeSwitch.setMode(target);
    });

    ES.on((evt, payload) => {
      if (evt === 'mode-changed') {
        const mode = payload || ES.state.mode;
        document.querySelectorAll('.mode-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.mode === mode);
        });
        const canvasWrap = document.getElementById('canvas-wrap');
        const sourceWrap = document.getElementById('source-wrap');
        const leftSidebar = document.querySelector('.left-sidebar');
        const rightSidebar = document.querySelector('.right-sidebar');
        if (mode === 'source') {
          canvasWrap.hidden = true;
          sourceWrap.hidden = false;
          // Hide DOM-centric panels in source mode
          leftSidebar.hidden = true;
          rightSidebar.hidden = true;
        } else {
          canvasWrap.hidden = false;
          sourceWrap.hidden = true;
          leftSidebar.hidden = false;
          rightSidebar.hidden = false;
        }
        if (window.__heSidebarLayoutSync) window.__heSidebarLayoutSync();
      }
    });
  }

  function wireLanguageToggle() {
    const btn = document.getElementById('tb-lang');
    if (!btn || !I18N) return;
    btn.addEventListener('click', () => I18N.toggle());
  }

  function wireSidebarLayout() {
    const workspace = document.querySelector('.workspace');
    const leftSidebar = document.querySelector('.left-sidebar');
    const rightSidebar = document.querySelector('.right-sidebar');
    const leftGutter = document.querySelector('.left-gutter');
    const rightGutter = document.querySelector('.right-gutter');
    const leftToggle = document.getElementById('left-sidebar-toggle');
    const rightToggle = document.getElementById('right-sidebar-toggle');
    if (!workspace || !leftSidebar || !rightSidebar || !leftGutter || !rightGutter || !leftToggle || !rightToggle) return;

    const storageKey = (side, kind) => `html-editor.sidebar.${side}.${kind}`;
    const defaults = { left: 280, right: 320 };
    const limits = { left: [180, 520], right: [220, 520] };
    const state = {
      leftWidth: readWidth('left'),
      rightWidth: readWidth('right'),
      leftCollapsed: readBool('leftCollapsed', false),
      rightCollapsed: readBool('rightCollapsed', false),
    };
    let activeResize = null;

    function readWidth(side) {
      const value = parseInt(localStorage.getItem(storageKey(side, 'width')) || '', 10);
      if (Number.isFinite(value)) return clamp(value, limits[side][0], limits[side][1]);
      return defaults[side];
    }

    function readBool(key, fallback) {
      const value = localStorage.getItem(`html-editor.sidebar.${key}`);
      if (value == null) return fallback;
      return value === 'true';
    }

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function apply() {
      workspace.style.setProperty('--sidebar-w', state.leftCollapsed ? '0px' : `${state.leftWidth}px`);
      workspace.style.setProperty('--sidebar-r-w', state.rightCollapsed ? '0px' : `${state.rightWidth}px`);
      leftSidebar.dataset.collapsed = state.leftCollapsed ? 'true' : 'false';
      rightSidebar.dataset.collapsed = state.rightCollapsed ? 'true' : 'false';
      leftToggle.setAttribute('aria-expanded', String(!state.leftCollapsed));
      rightToggle.setAttribute('aria-expanded', String(!state.rightCollapsed));
      leftToggle.innerHTML = state.leftCollapsed
        ? '<i data-lucide="chevron-right"></i>'
        : '<i data-lucide="chevron-left"></i>';
      rightToggle.innerHTML = state.rightCollapsed
        ? '<i data-lucide="chevron-left"></i>'
        : '<i data-lucide="chevron-right"></i>';
      const lang = I18N ? I18N.getLang() : 'en';
      leftToggle.title = state.leftCollapsed
        ? (lang === 'pt-BR' ? 'Expandir barra lateral esquerda' : 'Expand left sidebar')
        : (lang === 'pt-BR' ? 'Colapsar barra lateral esquerda' : 'Collapse left sidebar');
      rightToggle.title = state.rightCollapsed
        ? (lang === 'pt-BR' ? 'Expandir barra lateral direita' : 'Expand right sidebar')
        : (lang === 'pt-BR' ? 'Colapsar barra lateral direita' : 'Collapse right sidebar');
      leftToggle.setAttribute('aria-label', leftToggle.title);
      rightToggle.setAttribute('aria-label', rightToggle.title);
      if (window.renderIcons) window.renderIcons();
    }

    function persist() {
      localStorage.setItem(storageKey('left', 'width'), String(state.leftWidth));
      localStorage.setItem(storageKey('right', 'width'), String(state.rightWidth));
      localStorage.setItem('html-editor.sidebar.leftCollapsed', String(state.leftCollapsed));
      localStorage.setItem('html-editor.sidebar.rightCollapsed', String(state.rightCollapsed));
    }

    function setCollapsed(side, collapsed) {
      const widthKey = `${side}Width`;
      state[`${side}Collapsed`] = collapsed;
      if (!collapsed) {
        state[widthKey] = clamp(state[widthKey] || defaults[side], limits[side][0], limits[side][1]);
      }
      apply();
      persist();
    }

    function toggle(side) {
      setCollapsed(side, !state[`${side}Collapsed`]);
    }

    function startResize(side, startX) {
      if (state[`${side}Collapsed`]) setCollapsed(side, false);
      activeResize = { side, startX, startWidth: state[`${side}Width`] };
      document.body.classList.add('is-resizing-sidebars');
    }

    function moveResize(clientX) {
      if (!activeResize) return;
      const { side, startX, startWidth } = activeResize;
      const delta = side === 'left' ? clientX - startX : startX - clientX;
      state[`${side}Width`] = clamp(startWidth + delta, limits[side][0], limits[side][1]);
      state[`${side}Collapsed`] = false;
      apply();
    }

    function endResize() {
      if (!activeResize) return;
      activeResize = null;
      document.body.classList.remove('is-resizing-sidebars');
      persist();
    }

    leftToggle.addEventListener('click', () => toggle('left'));
    rightToggle.addEventListener('click', () => toggle('right'));

    [leftGutter, rightGutter].forEach((gutter) => {
      gutter.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        e.preventDefault();
        gutter.setPointerCapture(e.pointerId);
        startResize(gutter.dataset.side, e.clientX);
      });
      gutter.addEventListener('pointermove', (e) => moveResize(e.clientX));
      gutter.addEventListener('pointerup', endResize);
      gutter.addEventListener('pointercancel', endResize);
      gutter.addEventListener('lostpointercapture', endResize);
    });

    window.__heSidebarLayoutSync = apply;
    apply();
  }

  function wireI18nRefresh() {
    if (!I18N) return;
    window.addEventListener('i18n:changed', () => {
      if (window.__heSidebarLayoutSync) window.__heSidebarLayoutSync();
      if (!document.getElementById('empty-state').hidden && ES.state.doc == null) {
        const existing = document.getElementById('empty-restore');
        if (existing) existing.remove();
        const autoRestore = ES.loadAutosave();
        if (autoRestore && autoRestore.html) {
          const minutes = Math.round((Date.now() - autoRestore.at) / 60000);
          const age = I18N.formatRelativeFromMinutes(minutes);
          const restore = document.createElement('button');
          restore.className = 'btn';
          restore.id = 'empty-restore';
          restore.style.marginTop = '12px';
          restore.innerHTML = `<kbd class="btn-shortcut">R</kbd><i data-lucide="history" class="icon"></i><span>${I18N.t('ui.empty.restore')}</span><small>${I18N.t('ui.empty.age', { age, name: escapeHtml(autoRestore.name) })}</small>`;
          restore.addEventListener('click', async () => {
            ES.setFile(null, autoRestore.name);
            ES.state.sourceHtml = autoRestore.html;
            showEditor();
            await window.ModeSwitch.loadIntoInitialMode(autoRestore.html);
          });
          const empty = document.querySelector('.empty-inner');
          const hint = document.querySelector('.empty-drop-hint');
          hint.parentNode.insertBefore(restore, hint);
          window.renderIcons();
        }
      }
    });
  }

  function wireStatusUpdates() {
    const fileName = document.getElementById('file-name');
    const saveStatus = document.getElementById('save-status');
    const autosaveTime = document.getElementById('autosave-time');
    const encodingChip = document.getElementById('encoding-chip');

    // The encoding chip is the only place the user can see (and correct)
    // which charset the file will be written in. It matters here because
    // the documents this editor targets are Windows-1252, not UTF-8.
    function refreshEncodingChip() {
      if (!encodingChip) return;
      const open = !!(ES.state.doc || ES.state.sourceHtml);
      encodingChip.hidden = !open;
      if (!open) return;
      const name = window.Encoding.label(ES.state.encoding, ES.state.declaredCharset);
      encodingChip.textContent = name;
      encodingChip.dataset.legacy = window.Encoding.isLatin1Family(ES.state.encoding) ? 'true' : 'false';
      encodingChip.title = I18N.t('ui.encoding.chipHint', { encoding: name });
    }

    if (encodingChip) {
      encodingChip.addEventListener('click', () => window.FileOps.changeEncoding());
      refreshEncodingChip();
    }

    ES.on((evt) => {
      if (evt === 'encoding-changed' || evt === 'file-changed') refreshEncodingChip();
      if (evt === 'file-changed') {
        fileName.textContent = ES.state.fileHandle
          ? I18N.t('ui.toolbar.fileLinked', { name: ES.state.fileName })
          : I18N.t('ui.toolbar.fileReadonly', { name: ES.state.fileName });
        fileName.title = ES.state.fileHandle ? I18N.t('ui.toolbar.linkedHint') : I18N.t('ui.toolbar.readonlyHint');
      }
      if (evt === 'dirty-changed') {
        if (ES.state.dirty) {
          saveStatus.dataset.state = 'dirty';
          saveStatus.textContent = I18N.t('ui.toolbar.unsaved');
          document.body.dataset.dirty = 'true';
        } else {
          saveStatus.dataset.state = 'saved';
          saveStatus.textContent = I18N.t('ui.toolbar.saved');
          document.body.dataset.dirty = 'false';
        }
      }
      if (evt === 'history') {
        document.getElementById('tb-undo').disabled = ES.state.undoStack.length < 2;
        document.getElementById('tb-redo').disabled = ES.state.redoStack.length === 0;
      }
      if (evt === 'autosaved') {
        autosaveTime.textContent = new Date(ES.state.lastAutosave).toLocaleTimeString();
      }
    });

    // Block accidental close when dirty — including linked files, since
    // closing the tab abandons unsaved edits regardless of where they
    // would have been written.
    window.addEventListener('beforeunload', (e) => {
      if (ES.state.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }
})();