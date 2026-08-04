// Canvas: iframe management, selection, hover, drag-drop inside the canvas
window.Canvas = (function() {
  const ES = window.EditorState;
  let iframe, overlay, selBox, selLabel, selToolbar, hoverBox, dropIndicator;
  let canvasFrame;
  let isPreview = false;
  let dragData = null; // { type: 'block'|'move', payload, ghostEl? }
  let iframeMutationObserver = null; // disconnected before re-attach on doc-replaced
  let iframeListeners = null;        // AbortController for the iframe's listeners

  // Inject styles into the iframe so editor selection works
  const IFRAME_STYLES = `
    [data-he-editing] { outline: 2px solid #6c8cff !important; outline-offset: -2px !important; }
    html { cursor: default; }
    body { min-height: 100vh; }
  `;

  function init() {
    iframe = document.getElementById('canvas');
    overlay = document.getElementById('selection-overlay');
    selBox = document.getElementById('sel-box');
    selLabel = document.getElementById('sel-label');
    selToolbar = document.getElementById('sel-toolbar');
    hoverBox = document.getElementById('hover-box');
    dropIndicator = document.getElementById('drop-indicator');
    canvasFrame = document.querySelector('.canvas-frame');

    // Selection toolbar buttons
    selToolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const action = btn.dataset.action;
      handleToolbarAction(action);
    });

    // Canvas resize observer to keep overlay aligned
    const ro = new ResizeObserver(() => updateOverlay());
    ro.observe(canvasFrame);

    // Listen to selection / doc state
    ES.on((evt, payload) => {
      if (evt === 'selection-changed') updateOverlay();
      if (evt === 'history') updateAnchorMarkers(); // a new bookmark must show up
      if (evt === 'doc-replaced' || evt === 'doc-changed') {
        // After doc replacement we need to re-wire events
        wireIframeEvents();
        updateOverlay();
        updateAnchorMarkers();
      }
    });

    // Window resize / scroll
    window.addEventListener('resize', updateOverlay);

    // Listen for drops on canvas wrap from external block drags
    const canvasWrap = document.querySelector('.canvas-wrap');
    canvasWrap.addEventListener('dragover', (e) => {
      if (!dragData) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      updateDropTarget(e.clientX, e.clientY);
    });
    canvasWrap.addEventListener('drop', (e) => {
      if (!dragData) return;
      e.preventDefault();
      handleDrop(e.clientX, e.clientY);
    });
    canvasWrap.addEventListener('dragleave', (e) => {
      // Use the relatedTarget heuristic — only hide when leaving the
      // wrap entirely, not when crossing between descendant elements
      if (!canvasWrap.contains(e.relatedTarget)) hideDropIndicator();
    });
    // Safety net: if a drag is aborted anywhere (Esc, drop outside the
    // window, etc.), clear the indicator and any stale drag state.
    document.addEventListener('dragend', () => {
      hideDropIndicator();
      lastDropTarget = null;
    }, true);
  }

  function setDragData(d) { dragData = d; }
  function clearDragData() { dragData = null; hideDropIndicator(); }
  function getDragData() { return dragData; }

  function loadHtml(html) {
    if (!html || !html.trim()) {
      html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Untitled</title></head><body></body></html>';
    }
    iframe.srcdoc = html;
    iframe.onload = async () => {
      const doc = iframe.contentDocument;
      injectEditorStyles(doc);
      await applyPreviewAssets(doc);
      ES.setDoc(doc);
      wireIframeEvents();
      updateAnchorMarkers();
    };
  }

  async function applyPreviewAssets(doc) {
    if (!window.AssetResolver || typeof window.AssetResolver.applyToDocument !== 'function') return;
    const result = await window.AssetResolver.applyToDocument(doc);
    if (!result || result.unresolved <= 0) return;
    if (window.FileOps && typeof window.FileOps.notifyAssetsUnresolved === 'function') {
      window.FileOps.notifyAssetsUnresolved(result);
    }
  }

  function injectEditorStyles(doc) {
    const style = doc.createElement('style');
    style.id = '__he_styles__';
    style.textContent = IFRAME_STYLES;
    doc.head.appendChild(style);
  }

  // ---- Anchor markers ----
  // Show the user where the page's bookmarks are — FrontPage drew a little
  // flag at each one. Everything here is a stylesheet injected into the
  // iframe: no attribute is ever written to the user's document, so nothing
  // can leak into the saved file and nothing marks the document dirty.
  const ANCHOR_STYLE_ID = '__he_marks__';
  const ANCHOR_PREF_KEY = 'html-editor.showAnchors';
  const MARKS_KEY = 'html-editor.marks';

  // Which revision marks are on. Everything here is a CSS rule in one injected
  // stylesheet: no attribute is written to the user's document, nothing marks
  // it dirty, and nothing can leak into the saved file.
  const MARK_DEFAULTS = { anchors: true, paragrafos: false, papeis: false, links: true };
  let marks = loadMarks();

  function loadMarks() {
    let out = Object.assign({}, MARK_DEFAULTS);
    try {
      const raw = localStorage.getItem(MARKS_KEY);
      if (raw) return Object.assign(out, JSON.parse(raw));
      // Migrate the older single anchors-on/off preference once.
      const legacy = localStorage.getItem(ANCHOR_PREF_KEY);
      if (legacy !== null) out.anchors = legacy !== '0';
    } catch (_) {}
    return out;
  }
  function saveMarks() {
    try { localStorage.setItem(MARKS_KEY, JSON.stringify(marks)); } catch (_) {}
  }
  function getMarks() { return Object.assign({}, marks); }
  function setMark(key, on) {
    marks[key] = !!on;
    saveMarks();
    updateAnchorMarkers();
  }


  function cssStr(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  // True for our injected <style> elements and the text nodes inside them.
  const isEditorNode = window.EditorTraces.isEditorNode;

  function updateAnchorMarkers() {
    const doc = ES.state.doc;
    if (!doc || !doc.head) return;
    let style = doc.getElementById(ANCHOR_STYLE_ID);

    const anyMark = marks.anchors || marks.paragrafos || marks.papeis || marks.links;
    if (!anyMark || isPreview) {
      if (style) style.remove();
      return;
    }
    if (!style) {
      style = doc.createElement('style');
      style.id = ANCHOR_STYLE_ID;
      doc.head.appendChild(style);
    }

    const rules = [];

    if (marks.anchors) {
      // Anything an in-page link can target: classic <a name> bookmarks and
      // every element carrying an id — the same set the bookmark manager lists.
      const idSelectors = [];
      doc.querySelectorAll('[id]').forEach((el) => {
        if (!el.id || window.EditorTraces.isEditorId(el.id)) return;
        if (el.matches('a[name]')) return; // covered by the a[name] rules below
        idSelectors.push(`[id="${cssStr(el.id)}"]`);
      });

      // `outline` is used deliberately: unlike a border it takes no space, so
      // the canvas keeps showing the page's real layout. An *empty* <a name>
      // has no box to outline, so that one gets a visible badge instead — which
      // is the whole point, since it is invisible in the page otherwise.
      rules.push(
        'a[name]:empty::after {' +
          ' content: "\\2693"; font-size: 10px; line-height: 1; opacity: 0.9;' +
          ' color: #b45309; background: #fef3c7; border: 1px solid #f59e0b;' +
          ' border-radius: 3px; padding: 0 2px; vertical-align: super;' +
          ' font-family: sans-serif; font-weight: normal; }',
        'a[name]:not(:empty) { outline: 1px dashed rgba(245,158,11,0.95); outline-offset: 1px; }');
      if (idSelectors.length) {
        rules.push(idSelectors.join(',\n') +
          ' { outline: 1px dashed rgba(245,158,11,0.55); outline-offset: 1px; }');
      }
    }

    if (marks.paragrafos) {
      // Pilcrow at the end of each paragraph — FrontPage's "show formatting
      // marks". Excluded inside tables, or the annexes fill with them.
      rules.push(
        'p:not(td p):not(th p)::after {' +
          ' content: "\\00B6"; color: rgba(59,130,246,0.55); font-size: 0.85em;' +
          ' font-family: sans-serif; margin-left: 2px; }');
    }

    if (marks.links) {
      rules.push(
        'a[href] { background: rgba(59,130,246,0.10); }',
        'a[href^="#"]::after { content: "\\2317"; font-size: 9px; vertical-align: super;' +
          ' color: #2563eb; margin-left: 1px; font-family: sans-serif; }',
        'a[href^="http"]:not([href*="planalto.gov.br"])::after {' +
          ' content: "\\2197"; font-size: 9px; vertical-align: super;' +
          ' color: #7c3aed; margin-left: 1px; font-family: sans-serif; }');
    }

    if (marks.papeis) {
      // A colour rail in the margin, keyed off attribute substrings. This is
      // what makes the feature free: no DOM walk, no attribute written, and
      // box-shadow takes no layout space, so the page keeps its real geometry.
      // (A textual badge per paragraph would need position:relative on the
      // user's <p> or an overlay recomputed on every scroll across 6800
      // paragraphs — the role NAME lives in the structure panel instead.)
      rules.push(
        'p[style*="text-indent: 38px"], p[style*="text-indent:38px"] { box-shadow: -6px 0 0 -3px #3b82f6; }',
        'p[style*="margin-right: 0cm"], p[style*="margin-right:0cm"] { box-shadow: -6px 0 0 -3px #64748b; }',
        'p:has(> span[style*="#800000"]) { box-shadow: -6px 0 0 -3px #800000; }',
        'p:has(font[color="#FF0000"]) { box-shadow: -6px 0 0 -3px #ef4444; }',
        'p:has(font[color="#000080"]) { box-shadow: -6px 0 0 -3px #000080; }',
        'p:has(> span[style*="italic"]) { box-shadow: -6px 0 0 -3px #a855f7; }');
    }

    const next = rules.join('\n');
    if (style.textContent !== next) style.textContent = next;
  }

  // Kept because the toolbar button, the README and keyboard.js all still
  // speak of "anchors"; it is now one mark among four.
  function setShowAnchors(on) { setMark('anchors', on); }
  function getShowAnchors() { return marks.anchors; }

  async function wireIframeEvents() {
    const doc = ES.state.doc;
    if (!doc) return;
    // Re-inject styles if they were lost (e.g., after undo via doc.write)
    if (!doc.getElementById('__he_styles__') && doc.head) injectEditorStyles(doc);
    try {
      await applyPreviewAssets(doc);
    } catch (_) { /* preview asset resolution is best-effort */ }
    const body = doc.body;
    if (!body) return;

    // Drop the previous document's listeners before installing this set.
    // This function runs both from loadHtml() and from the doc-replaced /
    // doc-changed handler, so without this the same document accumulates
    // duplicate listeners and every handler fires twice — harmless for
    // "select this element", destructive for Delete.
    if (iframeListeners) { try { iframeListeners.abort(); } catch (_) {} }
    iframeListeners = new AbortController();
    const signal = iframeListeners.signal;

    // Click to select. Also intercepts ALL link clicks defensively, in both
    // edit and preview mode, so the iframe content can't escape to the
    // parent frame (e.g. via <base target="_top"> in the source).
    body.addEventListener('click', (e) => {
      const link = e.target && e.target.closest && e.target.closest('a');
      if (link) {
        e.preventDefault();
        e.stopPropagation();
        if (isPreview) handlePreviewLinkClick(link);
        else ES.select(link);
        return;
      }
      if (isPreview) return;
      e.preventDefault();
      e.stopPropagation();
      const target = e.target;
      if (target && target.nodeType === 1 && target !== doc.documentElement && target !== body.parentNode) {
        ES.select(target);
      }
    }, { capture: true, signal });

    // Also catch any other navigation attempts (form submit, etc.)
    body.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, { capture: true, signal });

    // Double click to edit text. If the target is already in an editable
    // context, let the browser handle native word-selection — don't intercept.
    body.addEventListener('dblclick', (e) => {
      if (isPreview) return;
      const target = e.target;
      if (!target || target.nodeType !== 1) return;
      if (target.isContentEditable) return; // already editing — native word-select handles it
      e.preventDefault();
      e.stopPropagation();
      enterTextEdit(target, e);
    }, { capture: true, signal });

    // Hover highlight.
    // - Skip if same target as last move (no need to redraw)
    // - Skip body/html (would paint a giant box over everything)
    // - Skip elements >70% of the viewport (huge sections feel like the
    //   box is "following the mouse" as it crosses padding)
    // - Always hide the drop indicator when not in a drag (defensive
    //   against a stuck indicator from an aborted drag)
    let lastHoverTarget = null;
    body.addEventListener('mousemove', (e) => {
      if (isPreview) return;
      if (!dragData && !dropIndicator.hidden) hideDropIndicator();
      if (dragData) return;
      const target = e.target;
      if (target === lastHoverTarget) return;
      lastHoverTarget = target;
      if (target && target.nodeType === 1
          && target !== ES.state.selected
          && target !== doc.body
          && target !== doc.documentElement
          && !isOversized(target)) {
        showHoverBox(target);
      } else {
        hideHoverBox();
      }
    }, { signal });
    body.addEventListener('mouseleave', () => { hideHoverBox(); lastHoverTarget = null; }, { signal });

    // Internal drag-drop: drag elements to reorder
    body.addEventListener('mousedown', (e) => {
      if (isPreview) return;
      if (!e.altKey && !e.shiftKey) return; // require modifier to start drag inside canvas
    }, { signal });

    // Iframe keydowns don't bubble up to the parent document, so the global
    // handler in keyboard.js never fires when focus is inside the canvas.
    // Everything that must work while the user is clicking around the page
    // has to be handled here — and re-registered on every doc-replaced,
    // because undo rewrites the document via doc.write() and wipes listeners.
    doc.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && window.__heExitPreview) {
        if (window.__heExitPreview()) e.preventDefault();
        return;
      }
      if (isPreview) return;

      const mod = e.metaKey || e.ctrlKey;
      const active = doc.activeElement;
      const inEdit = !!(active && active.isContentEditable);

      // Undo/redo. Without this the editor's own history is unreachable from
      // inside the canvas — which is where the user actually is.
      if (mod && /^[zyZY]$/.test(e.key)) {
        // While a text-edit session is open the browser's native undo owns the
        // caret, and ES.undo() would doc.write() the whole document out from
        // under it mid-sentence. Let the native one run; the session's own
        // snapshot is taken on blur.
        if (inEdit) return;
        e.preventDefault();
        if (e.key === 'y' || e.key === 'Y' || e.shiftKey) ES.redo(); else ES.undo();
        return;
      }

      // Insert link — same shortcut as every word processor.
      if (mod && (e.key === 'k' || e.key === 'K')) {
        if (window.LinkTool) { e.preventDefault(); window.LinkTool.open(); }
        return;
      }
      // Paste from Word, explicit form: works even with nothing in edit mode,
      // where the browser fires no paste event at all.
      if (mod && e.shiftKey && (e.key === 'v' || e.key === 'V')) {
        if (window.PasteWord) { e.preventDefault(); window.PasteWord.openColdPaste(); }
        return;
      }
      if (window.ActShortcuts && window.ActShortcuts.handle(e)) return;

      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      // Inside a form field or a contenteditable element the browser's own
      // editing behaviour is the right one — never hijack it.
      if (active && (inEdit
          || active.tagName === 'INPUT'
          || active.tagName === 'TEXTAREA'
          || active.tagName === 'SELECT')) return;
      if (!getTextRange() && !ES.state.selected) return;
      e.preventDefault(); // also stops legacy Backspace-navigates-back
      deleteSelected();
    }, { capture: true, signal });

    // Scroll: re-sync the selection overlay, and CLEAR the hover box
    // (otherwise it sits stale at the old position while the underlying
    // element has scrolled out from under it — looks like the box is
    // "moving" while the mouse is still).
    doc.addEventListener('scroll', () => {
      updateOverlay();
      hideHoverBox();
      lastHoverTarget = null;
    }, { capture: true, signal });

    // Where is the caret? The act formatting bar, the "Este trecho" panel and
    // the marks legend all need "which block is the user in", and the answer
    // changes on plain clicks and arrow keys that emit no other event.
    // `selectionchange` fires on the *document*, never on body — hence `doc`.
    // Coalesced into one rAF, or a drag-select would emit per mousemove.
    let caretPending = false;
    doc.addEventListener('selectionchange', () => {
      if (caretPending || isPreview) return;
      caretPending = true;
      requestAnimationFrame(() => {
        caretPending = false;
        ES.emit('caret-changed');
      });
    }, { signal });

    // Paste. Capture phase so we run before contenteditable's default, which
    // would otherwise drop Word's markup straight into the document.
    doc.addEventListener('paste', (e) => {
      if (isPreview || !window.PasteWord) return;
      window.PasteWord.onPaste(e);
    }, { capture: true, signal });

    // Typing granularity. enterTextEdit only snapshots on blur, so rewriting a
    // whole paragraph used to be a single undo step. Gated on document size:
    // a snapshot is the entire outerHTML, and on a 3 MB act each one is ~7 MB
    // against an 8 MB history budget (state.js) — there, blur-only is the only
    // affordable granularity and the status bar says so.
    let typingTimer = null;
    doc.addEventListener('input', (e) => {
      const el = e.target;
      if (!el || !el.isContentEditable || !snapshotsAreCheap()) return;
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => ES.snapshot('digitar'), 1200);
    }, { signal });

    // dragover/drop inside iframe for blocks coming from sidebar
    doc.addEventListener('dragover', (e) => {
      if (!dragData) return;
      e.preventDefault();
      const rect = iframe.getBoundingClientRect();
      updateDropTarget(rect.left + e.clientX, rect.top + e.clientY);
    }, { signal });
    doc.addEventListener('drop', (e) => {
      if (!dragData) return;
      e.preventDefault();
      const rect = iframe.getBoundingClientRect();
      handleDrop(rect.left + e.clientX, rect.top + e.clientY);
    }, { signal });

    // Track any DOM mutations for autosave (excluding our editor-style
    // injections). The observer can fire many times per frame for big
    // changes (drops, undo restoring a tree, large style edits); coalesce
    // the overlay/autosave work into a single rAF callback per frame.
    // Disconnect any prior observer before installing a fresh one.
    // wireIframeEvents fires on every doc-replaced (undo via doc.write
    // reinstalls listeners). Without this, observers from prior
    // documents stayed alive watching detached trees — slow leak.
    if (iframeMutationObserver) {
      try { iframeMutationObserver.disconnect(); } catch (_) {}
    }
    let moPending = false;
    iframeMutationObserver = new MutationObserver((mutations) => {
      // Our own injected stylesheets mutate as the user works (anchor markers
      // are rebuilt on every snapshot); those must never look like a document
      // edit, or every bookmark would trigger an autosave of editor chrome.
      const meaningful = mutations.some(m => !isEditorNode(m.target));
      if (!meaningful || moPending) return;
      moPending = true;
      requestAnimationFrame(() => {
        moPending = false;
        ES.scheduleAutosave();
        updateOverlay();
      });
    });
    iframeMutationObserver.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
  }

  function handlePreviewLinkClick(link) {
    const href = link.getAttribute('href') || '';
    if (!href) return;
    if (href.startsWith('#')) {
      // In-document anchor — scroll within the iframe
      const doc = ES.state.doc;
      const target = doc.getElementById(href.slice(1)) || doc.querySelector(`a[name="${href.slice(1)}"]`);
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    if (/^(https?:)?\/\//i.test(href) || href.startsWith('mailto:') || href.startsWith('tel:')) {
      // External — open in a new tab so the editor isn't replaced
      window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }
    // Relative URLs (./other.html, /path/, etc.) — ignored in preview;
    // they'd otherwise resolve against about:srcdoc which is meaningless.
  }

  // A snapshot is the whole documentElement.outerHTML. On a real consolidated
  // act that is megabytes per entry against an 8 MB history budget, so the
  // extra convenience snapshots (per-keystroke undo) are only taken when the
  // document is small enough for them to actually fit in the history.
  const CHEAP_SNAPSHOT_BYTES = 500 * 1024;
  function snapshotsAreCheap() {
    const top = ES.state.undoStack[ES.state.undoStack.length - 1];
    if (top && typeof top.bytes === 'number') return top.bytes < CHEAP_SNAPSHOT_BYTES;
    const doc = ES.state.doc;
    if (!doc || !doc.body) return true;
    return doc.body.innerHTML.length < CHEAP_SNAPSHOT_BYTES;
  }
  function historyIsLimited() { return !snapshotsAreCheap(); }

  // The element currently open for text editing, if any. Tracked at module
  // level so a tool can close the session deterministically instead of hoping
  // for a blur that may never come (a click on a toolbar button in the parent
  // frame does not always blur the iframe's active element).
  let editingEl = null;

  // Close any open text-edit session and record it in the history. Every tool
  // that mutates the document must call this first: mutating around an open
  // contenteditable produces a state the user cannot undo back out of.
  function commitTextEdit() {
    const el = editingEl;
    if (!el) return false;
    editingEl = null;
    el.removeAttribute('contenteditable');
    delete el.dataset.heEditing;
    try { el.blur(); } catch (_) {}
    ES.snapshot('editar texto');
    return true;
  }

  function enterTextEdit(el, mouseEvent) {
    if (!hasTextContentOnly(el)) {
      ES.select(el);
      return;
    }
    if (editingEl && editingEl !== el) commitTextEdit();
    editingEl = el;
    el.setAttribute('contenteditable', 'true');
    el.dataset.heEditing = 'true';
    el.focus();
    const onBlur = () => {
      el.removeEventListener('blur', onBlur);
      if (editingEl !== el) return; // already committed by commitTextEdit()
      editingEl = null;
      el.removeAttribute('contenteditable');
      delete el.dataset.heEditing;
      ES.snapshot('editar texto');
    };
    el.addEventListener('blur', onBlur);

    const doc = el.ownerDocument;
    const win = doc.defaultView;
    const sel = win.getSelection();
    sel.removeAllRanges();

    // Try to place the caret at the click point and expand to the surrounding
    // word (mimics native double-click-to-select behavior).
    let placedAtClick = false;
    if (mouseEvent) {
      const x = mouseEvent.clientX, y = mouseEvent.clientY;
      let range = null;
      if (typeof doc.caretRangeFromPoint === 'function') {
        range = doc.caretRangeFromPoint(x, y);
      } else if (typeof doc.caretPositionFromPoint === 'function') {
        const pos = doc.caretPositionFromPoint(x, y);
        if (pos) {
          range = doc.createRange();
          range.setStart(pos.offsetNode, pos.offset);
          range.collapse(true);
        }
      }
      if (range && el.contains(range.startContainer)) {
        sel.addRange(range);
        try {
          sel.modify('move', 'backward', 'word');
          sel.modify('extend', 'forward', 'word');
        } catch (_) { /* Firefox/Safari may not support modify; caret stays where it is */ }
        placedAtClick = true;
      }
    }
    if (!placedAtClick) {
      const range = doc.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.addRange(range);
    }
  }

  // An element is text-editable if it has no element children, OR if all of
  // its element children are inline (a, strong, em, span, br, code, …).
  // This is the practical definition of "the user can type into this": a
  // <p>Hello <strong>world</strong>!</p> should still enter edit mode.
  const INLINE_TAGS = new Set([
    'a','abbr','b','bdi','bdo','br','cite','code','data','dfn','em','i',
    'img','input','kbd','label','mark','q','s','samp','small','span',
    'strong','sub','sup','time','u','var','wbr'
  ]);
  // Tags that themselves are not meaningful text-edit surfaces even if
  // empty (containers/structural). Click selects them; never enter
  // contenteditable on them.
  const NON_EDITABLE_TAGS = new Set([
    'html','head','body','script','style','meta','link','title','base',
    'iframe','video','audio','canvas','svg','source','track'
  ]);
  function hasTextContentOnly(el) {
    if (!el) return false;
    const tag = el.tagName && el.tagName.toLowerCase();
    if (NON_EDITABLE_TAGS.has(tag)) return false;
    for (const child of el.children) {
      const childTag = child.tagName.toLowerCase();
      if (!INLINE_TAGS.has(childTag)) return false;
    }
    return true;
  }

  function showHoverBox(el) {
    const rect = relRect(el);
    if (!rect) { hideHoverBox(); return; }
    hoverBox.hidden = false;
    Object.assign(hoverBox.style, {
      left: rect.left + 'px',
      top: rect.top + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
    });
  }
  function hideHoverBox() { hoverBox.hidden = true; }

  function isOversized(el) {
    const r = el.getBoundingClientRect();
    const view = el.ownerDocument.defaultView;
    const area = r.width * r.height;
    const vw = view.innerWidth, vh = view.innerHeight;
    return area > (vw * vh * 0.7);
  }

  function relRect(el) {
    if (!el || !el.getBoundingClientRect) return null;
    const r = el.getBoundingClientRect();          // iframe-local
    const ifr = iframe.getBoundingClientRect();    // iframe in parent
    const cf = canvasFrame.getBoundingClientRect();// canvas-frame in parent
    return {
      left: (ifr.left - cf.left) + r.left,
      top: (ifr.top - cf.top) + r.top,
      width: r.width,
      height: r.height,
    };
  }

  function updateOverlay() {
    const sel = ES.state.selected;
    if (!sel || isPreview) {
      overlay.hidden = true;
      return;
    }
    overlay.hidden = false;
    const rect = relRect(sel);
    if (!rect) {
      overlay.hidden = true;
      return;
    }
    Object.assign(selBox.style, {
      left: rect.left + 'px',
      top: rect.top + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
    });
    const label = describe(sel);
    selLabel.textContent = label;
    selLabel.style.left = rect.left + 'px';
    selLabel.style.top = (rect.top - 22) + 'px';
    if (rect.top - 22 < 0) {
      selLabel.style.top = rect.top + 'px';
    }

    // Context class — adds table/list helper buttons to the toolbar
    const ctx = selectionContext(sel);
    selToolbar.classList.toggle('ctx-table', ctx === 'table');
    selToolbar.classList.toggle('ctx-list', ctx === 'list');

    // Toolbar above selection (or below if near top); clamp horizontally
    requestAnimationFrame(() => {
      const tbRect = selToolbar.getBoundingClientRect();
      const tbW = tbRect.width || 200;
      const tbH = tbRect.height || 32;
      const frameRect = canvasFrame.getBoundingClientRect();
      const tbTop = rect.top - tbH - 8;
      const useBelow = tbTop < 0;
      const left = Math.max(4, Math.min(rect.left + rect.width - tbW, frameRect.width - tbW - 4));
      selToolbar.style.left = left + 'px';
      selToolbar.style.top = (useBelow ? rect.top + rect.height + 6 : tbTop) + 'px';
    });
  }

  function describe(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.classList && el.classList.length) s += '.' + Array.from(el.classList).slice(0, 2).join('.');
    return s;
  }

  function handleToolbarAction(action) {
    // Delete comes first: with only a text range selected there may be no
    // element selection at all, and the guard below would swallow the action.
    if (action === 'delete') { deleteSelected(); return; }
    const sel = ES.state.selected;
    if (!sel) return;
    if (action === 'duplicate') duplicateSelected();
    else if (action === 'parent') {
      if (sel.parentElement && sel.parentElement !== ES.state.doc.documentElement) ES.select(sel.parentElement);
    }
    else if (action === 'move-up') moveSelected(-1);
    else if (action === 'move-down') moveSelected(1);
    else if (action === 'row-before') tableAddRow(sel, false);
    else if (action === 'row-after')  tableAddRow(sel, true);
    else if (action === 'col-before') tableAddCol(sel, false);
    else if (action === 'col-after')  tableAddCol(sel, true);
    else if (action === 'row-delete') tableDeleteRow(sel);
    else if (action === 'col-delete') tableDeleteCol(sel);
    else if (action === 'li-before')  listAddItem(sel, false);
    else if (action === 'li-after')   listAddItem(sel, true);
  }

  // ---- Table helpers ----
  function findRow(el) { return el && el.closest && el.closest('tr'); }
  function findTable(el) { return el && el.closest && el.closest('table'); }
  function cellIndex(td) {
    // td.cellIndex exists for table cells; fall back to childIndex
    if (typeof td.cellIndex === 'number' && td.cellIndex >= 0) return td.cellIndex;
    return Array.prototype.indexOf.call(td.parentElement.children, td);
  }
  function tableAddRow(el, after) {
    const tr = findRow(el) || (findTable(el) && findTable(el).querySelector('tr'));
    if (!tr) return;
    const newRow = tr.cloneNode(true);
    Array.from(newRow.children).forEach(c => { c.textContent = ''; });
    if (after) tr.parentNode.insertBefore(newRow, tr.nextSibling);
    else tr.parentNode.insertBefore(newRow, tr);
    ES.snapshot('add row');
    ES.select(newRow.children[0] || newRow);
  }
  function tableAddCol(el, after) {
    const table = findTable(el);
    if (!table) return;
    let idx = 0;
    if (el.tagName === 'TD' || el.tagName === 'TH') idx = cellIndex(el);
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
      const ref = row.children[idx];
      if (!ref) {
        const cell = ES.state.doc.createElement(row.parentElement && row.parentElement.tagName === 'THEAD' ? 'th' : 'td');
        row.appendChild(cell);
        return;
      }
      const cell = ref.cloneNode(false);
      cell.textContent = '';
      if (after) row.insertBefore(cell, ref.nextSibling);
      else row.insertBefore(cell, ref);
    });
    ES.snapshot('add column');
  }
  function tableDeleteRow(el) {
    const tr = findRow(el);
    if (!tr) return;
    const next = tr.nextElementSibling || tr.previousElementSibling;
    tr.remove();
    ES.snapshot('delete row');
    if (next && next.children[0]) ES.select(next.children[0]);
    else ES.deselect();
  }
  function tableDeleteCol(el) {
    const table = findTable(el);
    if (!table || (el.tagName !== 'TD' && el.tagName !== 'TH')) return;
    const idx = cellIndex(el);
    table.querySelectorAll('tr').forEach(row => {
      if (row.children[idx]) row.children[idx].remove();
    });
    ES.snapshot('delete column');
    ES.deselect();
  }

  // ---- List helpers ----
  function listAddItem(el, after) {
    const li = el.closest && el.closest('li');
    if (!li) return;
    const newLi = li.cloneNode(true);
    newLi.textContent = 'Item';
    if (after) li.parentNode.insertBefore(newLi, li.nextSibling);
    else li.parentNode.insertBefore(newLi, li);
    ES.snapshot('add list item');
    ES.select(newLi);
  }

  function selectionContext(el) {
    if (!el || !el.matches) return null;
    // Only show structural helpers when the selection IS a table/list
    // element — not for arbitrary descendants (e.g. a <p> inside a <td>),
    // which is too noisy and triggers on layout-tables.
    if (el.matches('table, thead, tbody, tfoot, tr, td, th, caption, colgroup, col')) return 'table';
    if (el.matches('ul, ol, li')) return 'list';
    return null;
  }

  // ---- Text-range delete ----
  // FrontPage habit: drag-select some text, press Delete (or hit the trash
  // button) and only that text goes away. Without this, Delete always removed
  // the whole selected element, which felt destructive to people migrating.

  // The live text selection inside the canvas, or null when there isn't a
  // usable one. `preventDefault()` on the capture-phase click handler above
  // does NOT collapse a drag-selection, so the range survives the click that
  // also selects the element under the cursor.
  function getTextRange() {
    const doc = ES.state.doc;
    if (!doc || isPreview) return null;
    const view = doc.defaultView;
    if (!view) return null;
    const sel = view.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (range.collapsed || !String(sel).length) return null;
    // Keep the deletion inside <body>. A stray document-level selection
    // (Ctrl+A can produce one) would otherwise let deleteContents() take out
    // <head>, <title> and our injected <style id="__he_styles__">.
    const cac = range.commonAncestorContainer;
    if (!doc.body || (cac !== doc.body && !doc.body.contains(cac))) return null;
    // Inside a contenteditable element the browser's native editing wins.
    const cacEl = cac.nodeType === 1 ? cac : cac.parentElement;
    if (cacEl && cacEl.isContentEditable) return null;
    return range;
  }

  // Nearest ancestor that isn't an inline element — the "paragraph" the text
  // lives in. Stops at <body>.
  function blockAncestor(node) {
    const doc = ES.state.doc;
    let el = node && node.nodeType === 1 ? node : (node && node.parentElement);
    while (el && el !== doc.body) {
      const tag = el.tagName.toLowerCase();
      if (!INLINE_TAGS.has(tag)) return el;
      el = el.parentElement;
    }
    return el || null;
  }

  const NEVER_MERGE = 'table, thead, tbody, tfoot, tr, td, th, caption, colgroup, col';

  function deleteTextRange(range) {
    const doc = ES.state.doc;
    const startBlock = blockAncestor(range.startContainer);
    const endBlock = blockAncestor(range.endContainer);

    range.deleteContents();

    // Nodes fully inside the range are already gone; only the two partially
    // covered boundary blocks survive. Merge them the way a browser would —
    // but only when it's unambiguously safe. Anything else keeps both blocks
    // (possibly empty), which is visible, harmless and undoable.
    if (startBlock && endBlock && startBlock !== endBlock
        && startBlock.isConnected && endBlock.isConnected
        && startBlock.parentNode === endBlock.parentNode
        && startBlock !== doc.body && endBlock !== doc.body
        && !startBlock.matches(NEVER_MERGE) && !endBlock.matches(NEVER_MERGE)) {
      while (endBlock.firstChild) startBlock.appendChild(endBlock.firstChild);
      endBlock.remove();
    }

    // Firefox can be left holding a range that points at removed nodes.
    try { doc.defaultView.getSelection().removeAllRanges(); } catch (_) {}

    ES.snapshot('delete text');
    if (startBlock && startBlock.isConnected && startBlock !== doc.body) ES.select(startBlock);
    else ES.deselect();
    updateOverlay();
  }

  function deleteSelected() {
    // A text selection always wins over the element selection.
    const range = getTextRange();
    if (range) { deleteTextRange(range); return; }
    const sel = ES.state.selected;
    if (!sel || !sel.parentElement) return;
    if (sel === ES.state.doc.body || sel === ES.state.doc.documentElement) return;
    const next = sel.nextElementSibling || sel.previousElementSibling || sel.parentElement;
    sel.remove();
    ES.snapshot('delete');
    if (next) ES.select(next);
    else ES.deselect();
  }

  function duplicateSelected() {
    const sel = ES.state.selected;
    if (!sel || !sel.parentElement) return;
    if (sel === ES.state.doc.body || sel === ES.state.doc.documentElement) return;
    const clone = sel.cloneNode(true);
    sel.parentElement.insertBefore(clone, sel.nextSibling);
    ES.snapshot('duplicate');
    ES.select(clone);
  }

  function moveSelected(dir) {
    const sel = ES.state.selected;
    if (!sel || !sel.parentElement) return;
    if (dir < 0) {
      const prev = sel.previousElementSibling;
      if (prev) sel.parentElement.insertBefore(sel, prev);
    } else {
      const next = sel.nextElementSibling;
      if (next) sel.parentElement.insertBefore(next, sel);
    }
    ES.snapshot('move');
    updateOverlay();
  }

  // ---- Drop handling ----
  let lastDropTarget = null; // { el, position: 'before'|'after'|'inside' }

  function updateDropTarget(clientX, clientY) {
    const doc = ES.state.doc;
    if (!doc) return;
    const fr = iframe.getBoundingClientRect();
    const iframeX = clientX - fr.left;
    const iframeY = clientY - fr.top;
    if (iframeX < 0 || iframeY < 0 || iframeX > fr.width || iframeY > fr.height) {
      // Outside iframe — try body
      lastDropTarget = { el: doc.body, position: 'inside' };
      showDropIndicator(doc.body, 'inside');
      return;
    }
    const target = doc.elementFromPoint(iframeX, iframeY);
    if (!target || target === doc.documentElement) {
      lastDropTarget = { el: doc.body, position: 'inside' };
      showDropIndicator(doc.body, 'inside');
      return;
    }
    // Don't drop on the moving element itself
    if (dragData && dragData.type === 'move' && dragData.element &&
        (dragData.element === target || dragData.element.contains(target))) {
      hideDropIndicator();
      lastDropTarget = null;
      return;
    }
    const rect = target.getBoundingClientRect();
    const localY = iframeY - rect.top;
    const localX = iframeX - rect.left;
    let position;
    if (canContain(target)) {
      // Use thirds: top third = before, middle = inside, bottom = after
      if (localY < rect.height / 3) position = 'before';
      else if (localY > rect.height * 2 / 3) position = 'after';
      else position = 'inside';
    } else {
      // Inline-ish — left or right half
      position = localY < rect.height / 2 ? 'before' : 'after';
    }
    lastDropTarget = { el: target, position };
    showDropIndicator(target, position);
  }

  function canContain(el) {
    const tag = el.tagName.toLowerCase();
    const voidTags = ['img','input','br','hr','meta','link','source','area','base','col','embed','param','track','wbr'];
    if (voidTags.includes(tag)) return false;
    return true;
  }

  function showDropIndicator(el, position) {
    const rect = relRect(el);
    if (!rect) { hideDropIndicator(); return; }
    dropIndicator.hidden = false;
    dropIndicator.classList.remove('vertical', 'inside');
    if (position === 'inside') {
      dropIndicator.classList.add('inside');
      Object.assign(dropIndicator.style, {
        left: rect.left + 'px',
        top: rect.top + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
      });
    } else if (position === 'before') {
      Object.assign(dropIndicator.style, {
        left: rect.left + 'px',
        top: rect.top + 'px',
        width: rect.width + 'px',
        height: '2px',
      });
    } else {
      Object.assign(dropIndicator.style, {
        left: rect.left + 'px',
        top: (rect.top + rect.height - 2) + 'px',
        width: rect.width + 'px',
        height: '2px',
      });
    }
  }

  function hideDropIndicator() { dropIndicator.hidden = true; }

  function handleDrop(clientX, clientY) {
    if (!dragData || !lastDropTarget) { clearDragData(); return; }
    const doc = ES.state.doc;
    const { el, position } = lastDropTarget;

    let inserted = null;
    if (dragData.type === 'block') {
      const tpl = doc.createElement('template');
      tpl.innerHTML = dragData.html.trim();
      const frag = tpl.content;
      inserted = frag.firstElementChild;
      if (!inserted) { clearDragData(); return; }
      insertElement(inserted, el, position);
    } else if (dragData.type === 'move' && dragData.element) {
      const moving = dragData.element;
      if (moving === el || moving.contains(el)) { clearDragData(); return; }
      insertElement(moving, el, position);
      inserted = moving;
    } else if (dragData.type === 'snippet') {
      const tpl = doc.createElement('template');
      tpl.innerHTML = dragData.html.trim();
      const frag = tpl.content;
      inserted = frag.firstElementChild;
      if (!inserted) { clearDragData(); return; }
      insertElement(inserted, el, position);
    }
    ES.snapshot('insert');
    clearDragData();
    if (inserted) ES.select(inserted);
  }

  function insertElement(node, target, position) {
    if (position === 'before') {
      target.parentElement.insertBefore(node, target);
    } else if (position === 'after') {
      target.parentElement.insertBefore(node, target.nextSibling);
    } else {
      target.appendChild(node);
    }
  }

  function setPreview(p) {
    isPreview = p;
    if (p) {
      hideHoverBox();
      overlay.hidden = true;
    } else {
      updateOverlay();
    }
    updateAnchorMarkers(); // markers are editor chrome — hide them in preview
  }

  function setDevice(d) {
    canvasFrame.dataset.device = d;
    requestAnimationFrame(updateOverlay);
  }

  return {
    init, loadHtml, setDragData, clearDragData, getDragData, updateOverlay,
    deleteSelected, duplicateSelected, moveSelected, setPreview, setDevice,
    insertElement,
    // The live text selection inside the canvas (a Range) or null. Used by
    // keyboard.js and page-tools.js.
    getTextRange,
    hasTextSelection: () => getTextRange(),
    updateAnchorMarkers, setShowAnchors, getShowAnchors,
    // Revision marks: anchors (as before), paragraph pilcrows, link
    // highlighting and the role colour rail. All CSS-only, all stripped.
    getMarks, setMark,
    updateMarks: updateAnchorMarkers,
    // Close an open text-edit session before mutating the document. Every
    // tool that writes to the canvas must call this first.
    commitTextEdit,
    isEditing: () => !!editingEl,
    // True when the document is large enough that whole-document snapshots
    // don't fit the history budget — the status bar tells the user.
    historyIsLimited,
  };
})();
