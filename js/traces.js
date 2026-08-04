// Editor traces — the single source of truth for the markup the editor injects
// into the user's document but must NEVER write to disk.
//
// Why this file exists: the same strip logic used to live in three places
// (file.js, mode-switch.js and an inline copy in editor.js's external-preview
// handler) and the injected stylesheet ids were spelled out in five more. Every
// new editor-only marker had to be added to all of them, and the first one
// forgotten is a marker that silently reaches a published act.
//
// Two rules keep this safe by construction:
//   1. Every editor-only stylesheet id is listed in STYLE_IDS below.
//   2. Every editor-only attribute is named `data-he-*`. The strip pattern is
//      generic, so a new attribute is covered the moment it is named correctly.
window.EditorTraces = (function() {
  // Stylesheets the editor injects into the canvas document.
  //   __he_styles__ — selection/editing affordances (canvas.js)
  //   __he_marks__  — the revision marks: bookmarks, paragraphs, links, roles
  // The legacy id is kept in the list so a document held in an autosave or an
  // undo snapshot written by an older build is still cleaned on save.
  const STYLE_IDS = ['__he_styles__', '__he_marks__', '__he_anchor_styles__'];

  // Attributes the editor sets on the user's elements. `data-he-*` is the
  // catch-all; contenteditable is listed because the browser adds it when we
  // open a text-edit session and it is not ours to leave behind.
  const ATTR_PATTERNS = [
    /\s+contenteditable="[^"]*"/g,
    /\s+data-he-[\w-]+="[^"]*"/g,
  ];

  function styleTagPattern(id) {
    // Attribute order and quoting are the serializer's, not the source's, so
    // match on the id rather than on an exact tag spelling.
    return new RegExp('<style[^>]*\\bid="' + id + '"[^>]*>[\\s\\S]*?<\\/style>', 'g');
  }

  const STYLE_PATTERNS = STYLE_IDS.map(styleTagPattern);

  // Remove every editor trace from a serialized HTML string.
  function strip(html) {
    let out = String(html == null ? '' : html);
    for (const re of STYLE_PATTERNS) out = out.replace(re, '');
    for (const re of ATTR_PATTERNS) out = out.replace(re, '');
    return out;
  }

  // True for one of the editor's own injected <style> elements, or a node
  // inside one. Used to keep our own DOM writes out of the dirty/autosave path.
  function isEditorNode(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    return !!(el && el.id && STYLE_IDS.includes(el.id));
  }

  // True for an id that belongs to the editor rather than to the document —
  // so the bookmark manager and the anchor markers don't list our stylesheets.
  function isEditorId(id) {
    return !!id && STYLE_IDS.includes(id);
  }

  return { STYLE_IDS, strip, isEditorNode, isEditorId };
})();
