// Global keyboard shortcuts
window.Keyboard = (function() {
  const ES = window.EditorState;

  function init() {
    document.addEventListener('keydown', handle, true);
  }

  function handle(e) {
    const mod = e.metaKey || e.ctrlKey;
    const inField = isInField(e.target);

    // Escape: exit preview takes priority over field focus, since the field
    // is most likely an iframe input that doesn't matter once chrome is back.
    if (e.key === 'Escape' && window.__heExitPreview && window.__heExitPreview()) {
      return;
    }

    // Save: cmd+S even if in field
    if (mod && e.key === 's' && e.shiftKey) {
      e.preventDefault();
      window.FileOps.saveAs();
      return;
    }
    if (mod && e.key === 's') {
      e.preventDefault();
      window.FileOps.save();
      return;
    }
    // Undo/redo
    if (mod && e.key === 'z' && !e.shiftKey) {
      if (inField) return;
      e.preventDefault();
      ES.undo();
      return;
    }
    if (mod && (e.key === 'Z' || (e.key === 'z' && e.shiftKey)) ) {
      if (inField) return;
      e.preventDefault();
      ES.redo();
      return;
    }
    if (mod && e.key === 'y') {
      if (inField) return;
      e.preventDefault();
      ES.redo();
      return;
    }

    // Insert link, and paste-from-Word. Both are act-authoring shortcuts and
    // are mirrored in canvas.js, because iframe keydowns never reach here —
    // whichever frame has focus, the same key must do the same thing.
    if (mod && (e.key === 'k' || e.key === 'K') && window.LinkTool) {
      if (inField) return;
      e.preventDefault();
      window.LinkTool.open();
      return;
    }
    if (mod && e.shiftKey && (e.key === 'v' || e.key === 'V') && window.PasteWord) {
      if (inField) return;
      e.preventDefault();
      window.PasteWord.openColdPaste();
      return;
    }

    if (inField) return;

    // Act formatting roles (Ctrl+Alt+1..9, F4 palette). Ctrl+1..9 is not
    // available: browsers reserve it for tab switching and the keydown never
    // reaches the page.
    if (window.ActShortcuts && window.ActShortcuts.handle(e)) return;

    // Duplicate
    if (mod && e.key === 'd') {
      e.preventDefault();
      window.Canvas.duplicateSelected();
      return;
    }
    // Delete. Also fires with only a text range selected in the canvas — the
    // focus can be in the parent chrome (e.g. the DOM tree panel) while the
    // canvas still holds a selection. Keydowns *inside* the iframe never reach
    // this handler; canvas.js has its own listener for those.
    if ((e.key === 'Delete' || e.key === 'Backspace')
        && (ES.state.selected || (window.Canvas.hasTextSelection && window.Canvas.hasTextSelection()))) {
      e.preventDefault();
      window.Canvas.deleteSelected();
      return;
    }
    // Escape: deselect (preview-exit handled above, before inField guard)
    if (e.key === 'Escape') {
      ES.deselect();
      return;
    }
    // Arrow up/down: move selected
    if (e.key === 'ArrowUp' && mod) {
      e.preventDefault();
      window.Canvas.moveSelected(-1);
      return;
    }
    if (e.key === 'ArrowDown' && mod) {
      e.preventDefault();
      window.Canvas.moveSelected(1);
      return;
    }
    // Preview toggle
    if (e.key === 'p' || e.key === 'P') {
      if (!mod) {
        document.getElementById('tb-preview').click();
      }
    }
  }

  function isInField(t) {
    if (!t) return false;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
    if (t.isContentEditable) return true;
    return false;
  }

  return { init };
})();
