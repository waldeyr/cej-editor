// File operations: File System Access API, import/export, drag-drop on page
window.FileOps = (function() {
  const ES = window.EditorState;
  const I18N = window.I18N;
  const hasFSA = 'showOpenFilePicker' in window;
  const hasDirPicker = 'showDirectoryPicker' in window;
  const isSecure = window.isSecureContext;
  const supportsFSA = hasFSA && isSecure;
  const supportsDirPicker = hasDirPicker && isSecure;
  // mtime of the on-disk file the last time we read or wrote it. Used to
  // detect external modifications when the editor regains focus.
  let lastKnownMtime = null;
  let externalChangePending = false;
  let lastAssetsWarnKey = '';
  let assetsPromptInFlight = false;
  let lastAssetsPromptFile = '';

  function init() {
    const warn = document.getElementById('browser-warning');
    if (warn && !supportsFSA) {
      if (!isSecure && location.protocol === 'http:') {
        warn.innerHTML = `${I18N.t('ui.file.browserWarnHttps')} <a href="${location.href.replace(/^http:/, 'https:')}" style="color:inherit;text-decoration:underline;">HTTPS</a>`;
      } else if (!hasFSA) {
        warn.textContent = I18N.t('ui.file.browserWarnFallback');
      }
      warn.hidden = false;
    }

    // Drop on page (empty state)
    const drop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.body.classList.remove('drag-over');
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file && (file.name.endsWith('.html') || file.name.endsWith('.htm') || file.type === 'text/html')) {
        importFile(file);
      }
    };
    document.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
        e.preventDefault();
        document.body.classList.add('drag-over');
      }
    });
    document.addEventListener('dragleave', (e) => {
      if (e.clientX === 0 && e.clientY === 0) document.body.classList.remove('drag-over');
    });
    document.addEventListener('drop', drop);

    // File input fallback
    const fileInput = document.getElementById('file-input');
    fileInput.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importFile(f);
      fileInput.value = '';
    });

    const assetsBtn = document.getElementById('tb-assets-dir');
    if (assetsBtn) {
      assetsBtn.disabled = !supportsDirPicker;
      if (!supportsDirPicker) {
        assetsBtn.title = I18N.t('ui.file.assetsDirUnsupported');
      }
    }
  }

  async function openLocalFile() {
    if (!supportsFSA) {
      toast(I18N.t('ui.file.fsaRequired'), 'warn');
      promptImport();
      return;
    }
    try {
      // No `types` filter: Chrome's first-invocation behavior with
      // accept-maps can grey out matching files until the picker is
      // dismissed and reopened. Simpler to let the user pick any file.
      const [handle] = await window.showOpenFilePicker({ multiple: false });
      const file = await handle.getFile();
      const info = await window.Encoding.decode(file);
      const text = info.text;
      if (window.AssetResolver) {
        window.AssetResolver.revokeAllObjectUrls();
        window.AssetResolver.setCurrentFileName(file.name);
      }
      ES.setFile(handle, file.name);
      ES.setEncoding(info);
      warnIfEncodingSuspect(info);
      ES.state.sourceHtml = text;
      lastKnownMtime = file.lastModified;
      clearExternalChange();
      await window.ModeSwitch.loadIntoInitialMode(text);
      ES.addRecent(file.name);
      toast(I18N.t('ui.file.opened', { name: file.name }), 'success');
      ES.setDirty(false);
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error(e);
        toast(I18N.t('ui.file.openError', { message: e.message }), 'error');
      }
    }
  }

  function promptImport() {
    document.getElementById('file-input').click();
  }

  async function promptImportUrl() {
    const url = await window.Dialog.prompt({
      title: I18N.t('ui.file.importUrlTitle'),
      message: I18N.t('ui.file.importUrlMsg'),
      placeholder: 'https://exemplo.gov.br/pagina.html',
      confirmLabel: I18N.t('ui.file.importUrlConfirm'),
    });
    if (url === null) return;
    await importUrl(url.trim());
  }

  async function importUrl(rawUrl) {
    let url;
    try {
      url = new URL(rawUrl);
      if (!/^https?:$/.test(url.protocol)) throw new Error('URL deve começar com http:// ou https://');
    } catch (e) {
      toast(I18N.t('ui.file.importUrlError', { message: e.message }), 'error');
      return;
    }

    try {
      const response = await fetchWithLocalFallback(url.href);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      const name = decodeURIComponent(url.pathname.split('/').pop() || 'pagina.html').replace(/[\\/:*?"<>|]/g, '_');
      const file = new File([buffer], name.toLowerCase().endsWith('.html') || name.toLowerCase().endsWith('.htm') ? name : `${name}.html`, {
        type: response.headers.get('content-type') || 'text/html',
      });
      await importFile(file, { sourceUrl: response.url || url.href });
    } catch (e) {
      console.error(e);
      const corsHint = e instanceof TypeError ? I18N.t('ui.file.importUrlCors') : e.message;
      toast(I18N.t('ui.file.importUrlError', { message: corsHint }), 'error');
    }
  }

  async function fetchWithLocalFallback(url) {
    try {
      return await fetch(url, { redirect: 'follow' });
    } catch (directError) {
      // A static deployment cannot bypass CORS. The Windows launcher exposes
      // a loopback-only endpoint that can fetch the same URL server-side.
      // If that endpoint is unavailable (e.g. GitHub Pages), preserve the
      // original CORS guidance below.
      if (!/^https?:$/.test(location.protocol)) throw directError;
      const proxyUrl = `${location.origin}/__fetch?url=${encodeURIComponent(url)}`;
      try {
        const response = await fetch(proxyUrl, { redirect: 'follow' });
        if (response.status === 404) throw directError;
        return response;
      } catch (_) {
        throw directError;
      }
    }
  }

  async function importFile(file, opts = {}) {
    try {
      const info = await window.Encoding.decode(file);
      const text = info.text;
      if (window.AssetResolver) {
        window.AssetResolver.revokeAllObjectUrls();
        window.AssetResolver.setCurrentFileName(file.name);
      }
      ES.setFile(null, file.name);
      ES.setEncoding(info);
      warnIfEncodingSuspect(info);
      ES.state.sourceHtml = text;
      await window.ModeSwitch.loadIntoInitialMode(text);
      ES.addRecent(file.name);
      toast(I18N.t(opts.sourceUrl ? 'ui.file.importedUrl' : 'ui.file.imported', { name: file.name }), '');
      ES.setDirty(false);
    } catch (e) {
      toast(I18N.t('ui.file.importError', { message: e.message }), 'error');
    }
  }

  // Get the canonical bytes to write, depending on which mode is active.
  // - Source mode: the CodeMirror buffer, byte-for-byte.
  // - Visual mode (clean): the user hasn't edited anything since load,
  //   so return the original source string verbatim.
  // - Visual mode (dirty): serialize the iframe DOM, then re-encode
  //   characters back to whichever entities the original source used
  //   (`—` → `&mdash;` if the source had `&mdash;`). This kills the
  //   widespread entity-normalization noise that otherwise touches
  //   every line containing a special character.
  function currentHtml() {
    if (ES.state.mode === 'source' && window.Source) {
      return window.Source.getContent();
    }
    if (!ES.state.doc) return ES.state.sourceHtml || '';
    if (!ES.state.dirty && ES.state.sourceHtml) return ES.state.sourceHtml;
    let serialized = serializeForSave(ES.state.doc);
    if (ES.state.sourceHtml) {
      // Splice the user's edit back into the original source so untouched
      // regions stay byte-identical (preserves doctype casing, original
      // whitespace, entity encoding, and avoids implicit <tbody> showing up
      // as a diff).
      //
      // Splice against the *raw* serialization — NOT an entity-re-encoded
      // copy. The splice aligns curNorm char-for-char against a fresh reparse
      // of the source (origNorm), and origNorm is itself not re-encoded. If we
      // re-encoded here first, the two would desync at the very first entity
      // (e.g. a `&copy;`/`&mdash;` in <head>): the prefix scan would stop
      // there and bleed normalized markup from that point all the way down to
      // the user's actual edit — rewriting the head even when only the body
      // changed. Entity re-encoding is applied only to the spliced-in edit
      // region (inside spliceEditIntoSource), or to the whole document when
      // the splice can't confidently align (fallback below).
      const spliced = spliceEditIntoSource(serialized, ES.state.sourceHtml);
      serialized = spliced !== null ? spliced : reEncodeEntities(serialized, ES.state.sourceHtml);
    }
    return serialized;
  }

  function serializeForSave(doc) {
    const raw = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
    const parsed = new DOMParser().parseFromString(raw, 'text/html');
    if (window.AssetResolver && typeof window.AssetResolver.restoreOriginalAttrs === 'function') {
      window.AssetResolver.restoreOriginalAttrs(parsed);
    }
    return stripEditorTraces('<!DOCTYPE html>\n' + parsed.documentElement.outerHTML);
  }

  // Reduce the serialized-edited HTML back to (original source) + (just the
  // user's edit). Returns null if we can't confidently align — caller falls
  // back to the full serialization.
  function spliceEditIntoSource(curNorm, sourceHtml) {
    // `curNorm` MUST be the raw `outerHTML` serialization (entities left as the
    // literal characters the parser decoded them to) — NOT entity-re-encoded.
    // It has to match `origNorm` below char-for-char in untouched regions, and
    // origNorm is produced by the same raw outerHTML path. Re-encoding is done
    // afterwards, on the spliced middle only.
    //
    // Re-parse the source the same way the editor parsed it on load. The
    // result's outerHTML form is the "normalized" view that curNorm is
    // expressed in — so the diff between origNorm and curNorm is purely
    // the user's edit, with no normalization noise.
    let origDoc;
    try { origDoc = new DOMParser().parseFromString(sourceHtml, 'text/html'); }
    catch (_) { return null; }
    if (!origDoc || !origDoc.documentElement) return null;
    const origNorm = stripEditorTraces('<!DOCTYPE html>\n' + origDoc.documentElement.outerHTML);

    if (origNorm === curNorm) return sourceHtml;

    // Find common prefix and suffix (in normalized space).
    const maxPrefix = Math.min(origNorm.length, curNorm.length);
    let P = 0;
    while (P < maxPrefix && origNorm.charCodeAt(P) === curNorm.charCodeAt(P)) P++;
    const maxSuffix = Math.min(origNorm.length - P, curNorm.length - P);
    let S = 0;
    while (
      S < maxSuffix &&
      origNorm.charCodeAt(origNorm.length - 1 - S) === curNorm.charCodeAt(curNorm.length - 1 - S)
    ) S++;

    // Map P (end of unchanged prefix in normalized) and origNorm.length - S
    // (start of unchanged suffix in normalized) into source coordinates.
    const sP = mapNormToSource(P, origNorm, sourceHtml);
    if (sP < 0) return null;
    const sQ = mapNormToSource(origNorm.length - S, origNorm, sourceHtml);
    if (sQ < 0) return null;

    // The surrounding slices are verbatim original source (already in the
    // source's own entity style); only the changed middle comes from the
    // normalized DOM serialization, so only it needs entities re-encoded back
    // to match (`—` → `&mdash;` if the source used `&mdash;`).
    const middle = reEncodeEntities(curNorm.slice(P, curNorm.length - S), sourceHtml);
    return sourceHtml.slice(0, sP) + middle + sourceHtml.slice(sQ);
  }

  // Walk `norm` and `source` in lockstep, tolerating the specific
  // differences a DOMParser+outerHTML round-trip can introduce, and return
  // the source position corresponding to position `targetNormPos` in norm.
  // Tolerated differences:
  //   - <!DOCTYPE html> casing (and the whitespace between doctype and <html>)
  //   - any run of whitespace between tags can differ in both amount and kind
  //   - implicit <tbody>/</tbody> tags that the parser inserts where missing
  //   - HTML comments (skipped wholesale; '>' inside them is not a tag end)
  //   - attribute reordering/quoting on the same opening tag (quote-aware, so
  //     a '>' inside an attribute value doesn't read as the tag end)
  function mapNormToSource(targetNormPos, norm, source) {
    let n = 0, s = 0;
    const isWS = (ch) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';

    while (n < targetNormPos) {
      if (n < norm.length && s < source.length && norm.charCodeAt(n) === source.charCodeAt(s)) {
        n++; s++; continue;
      }

      // Character-reference divergence: the source kept an entity (&eacute;,
      // &mdash;, &copy;, &#169;) where the parser decoded it to the literal
      // character in norm. (amp/lt/gt/quot/nbsp survive serialization as
      // entities on both sides, so they match char-for-char above and never
      // reach here.) Decode the source entity and, if it matches the upcoming
      // norm char(s), step over the entity in source and the char(s) in norm.
      if (source[s] === '&') {
        const m = /^&(?:#\d+|#x[\da-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/.exec(source.slice(s, s + 40));
        if (m) {
          const decoded = decodeEntity(m[0]);
          if (decoded && norm.startsWith(decoded, n)) {
            if (n + decoded.length > targetNormPos) return s; // target inside the entity — anchor at it
            n += decoded.length; s += m[0].length;
            continue;
          }
        }
      }

      // Whitespace divergence: skip whitespace on whichever side has it
      // (we re-converge on the next non-ws char). This handles <html>\n\t<head>
      // ↔ <html><head>, </body>\n</html> ↔ </body></html>, and similar.
      let advanced = false;
      while (n < norm.length && isWS(norm[n]) && n < targetNormPos) { n++; advanced = true; }
      while (s < source.length && isWS(source[s])) { s++; advanced = true; }
      if (advanced) continue;

      // Doctype case difference: <!doctype html> vs <!DOCTYPE html>
      if (matchCI(norm, n, '<!doctype') && matchCI(source, s, '<!doctype')) {
        // Advance past the doctype declaration in both, up to and
        // including the '>'.
        const ne = findGt(norm, n);
        const se = findGt(source, s);
        if (ne < 0 || se < 0) return -1;
        if (n + (ne - n + 1) > targetNormPos) {
          // The target falls inside the doctype — clamp to start of doctype
          // in source so we don't split it mid-token.
          return s;
        }
        n = ne + 1; s = se + 1;
        continue;
      }

      // HTML comments are preserved verbatim by the parser, so they normally
      // match char-for-char and never reach here. But if a whitespace-only
      // divergence parks us right at a '<!--', skip the whole comment on both
      // sides — otherwise the tag-skip below would treat a '>' *inside* the
      // comment as a tag end and lose alignment.
      if (matchCI(norm, n, '<!--') && matchCI(source, s, '<!--')) {
        const ne = norm.indexOf('-->', n);
        const se = source.indexOf('-->', s);
        if (ne < 0 || se < 0) return -1;
        if (ne + 3 > targetNormPos) return s; // target falls inside the comment
        n = ne + 3; s = se + 3;
        continue;
      }

      // Implicit <tbody>/</tbody> only present on the normalized side.
      if (matchCI(norm, n, '<tbody>')) { n += '<tbody>'.length; continue; }
      if (matchCI(norm, n, '</tbody>')) { n += '</tbody>'.length; continue; }
      // (Defensive — shouldn't happen, but mirror for the source side)
      if (matchCI(source, s, '<tbody>')) { s += '<tbody>'.length; continue; }
      if (matchCI(source, s, '</tbody>')) { s += '</tbody>'.length; continue; }

      // Attribute reordering / quoting differences on the same opening tag.
      // If both sides are sitting at '<' and the tag name matches, skip to
      // the matching '>' on each side. Inside-attr quoting differences are
      // not the user's edit; we just have to keep alignment.
      if (norm[n] === '<' && source[s] === '<') {
        const ne = findGt(norm, n);
        const se = findGt(source, s);
        if (ne > n && se > s) {
          const nTag = norm.slice(n + 1, ne).split(/[\s/>]/)[0].toLowerCase();
          const sTag = source.slice(s + 1, se).split(/[\s/>]/)[0].toLowerCase();
          if (nTag && nTag === sTag) {
            if (ne + 1 > targetNormPos) return s; // target inside this tag — anchor at tag start
            n = ne + 1; s = se + 1;
            continue;
          }
        }
      }

      // Tag-internal serialization difference: the divergence is *inside* an
      // element's start tag rather than at its '<'. Covers self-closing void
      // elements (`<meta …/>` → `<meta …>`), boolean attrs (`disabled` →
      // `disabled=""`), and attribute reorder/quoting where the first differing
      // char lands mid-tag (so char-matching already stepped past the '<').
      // Only fire when BOTH sides are inside a tag, then re-converge just past
      // each tag's closing '>'. origNorm is a faithful reparse of source, so
      // the k-th tag corresponds on both sides — skipping to '>' stays aligned.
      if (insideTag(norm, n) && insideTag(source, s)) {
        const ne = findGt(norm, n);
        const se = findGt(source, s);
        if (ne >= n && se >= s) {
          if (ne + 1 > targetNormPos) return source.lastIndexOf('<', s); // target inside this tag — anchor at tag start
          n = ne + 1; s = se + 1;
          continue;
        }
      }

      // Unknown divergence — bail out.
      return -1;
    }
    return s;
  }

  // True if `pos` sits inside an element start/end tag — i.e. scanning back we
  // hit '<' before '>'. Used to tell a tag-internal divergence (attr/self-close
  // differences) apart from a text divergence.
  function insideTag(str, pos) {
    for (let i = pos - 1; i >= 0; i--) {
      const ch = str[i];
      if (ch === '<') return true;
      if (ch === '>') return false;
    }
    return false;
  }

  // Decode a single HTML entity string (e.g. "&mdash;") to its character.
  // Cached because mapNormToSource may hit the same entity many times.
  const _entCache = new Map();
  const _entDiv = document.createElement('div');
  function decodeEntity(ent) {
    if (_entCache.has(ent)) return _entCache.get(ent);
    _entDiv.innerHTML = ent;
    const v = _entDiv.textContent;
    _entCache.set(ent, v);
    return v;
  }

  // Index of the '>' that closes the tag/declaration starting at `pos` (which
  // points at '<'), skipping any '>' that sits inside a quoted attribute
  // value. Returns -1 if unterminated. `indexOf('>')` is wrong here because
  // values like title="a > b" contain a literal '>' that isn't the tag end.
  function findGt(str, pos) {
    let quote = null;
    for (let i = pos; i < str.length; i++) {
      const ch = str[i];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        return i;
      }
    }
    return -1;
  }

  function matchCI(str, pos, needle) {
    if (pos + needle.length > str.length) return false;
    for (let i = 0; i < needle.length; i++) {
      const a = str.charCodeAt(pos + i);
      const b = needle.charCodeAt(i);
      if (a === b) continue;
      // ASCII case-insensitive
      if (a >= 65 && a <= 90 && a + 32 === b) continue;
      if (a >= 97 && a <= 122 && a - 32 === b) continue;
      return false;
    }
    return true;
  }

  // Cache: keyed by sourceHtml reference, value is the unicode→entity map
  // derived from it. Building the map is cheap (~one regex pass), but the
  // cache means a save + immediate diff doesn't repeat the work.
  let entityMapCache = { src: null, map: null };
  function buildEntityMap(sourceHtml) {
    if (entityMapCache.src === sourceHtml) return entityMapCache.map;
    const map = new Map();
    // Match named, decimal, and hex entities. Ignore the ones that
    // outerHTML always emits as entities (amp, lt, gt, quot, apos) so we
    // don't try to "preserve" e.g. &lt; — it stays &lt; on serialize
    // anyway.
    const ALWAYS_ESCAPED = new Set(['&amp;', '&lt;', '&gt;', '&quot;', '&apos;']);
    const re = /&(?:#\d+|#x[\da-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g;
    const decoder = document.createElement('div');
    let m;
    while ((m = re.exec(sourceHtml)) !== null) {
      const entity = m[0];
      if (ALWAYS_ESCAPED.has(entity)) continue;
      decoder.innerHTML = entity;
      const ch = decoder.textContent;
      // Only useful if the entity actually decoded to something different
      // (e.g. an unknown entity stays literal) and we don't already have
      // a mapping for this char.
      if (ch && ch !== entity && !map.has(ch)) map.set(ch, entity);
    }
    entityMapCache = { src: sourceHtml, map };
    return map;
  }

  function reEncodeEntities(html, sourceHtml) {
    const map = buildEntityMap(sourceHtml);
    if (map.size === 0) return html;
    const escaped = Array.from(map.keys())
      .map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    const re = new RegExp('(' + escaped + ')', 'g');
    return html.replace(re, (_, ch) => map.get(ch));
  }

  async function save() {
    const html = currentHtml();
    if (!html) return;
    if (ES.state.fileHandle) {
      try {
        // Pre-write conflict check: if the on-disk mtime is newer than
        // the last time we read or wrote, an external edit happened
        // since the editor last synced. Confirm before clobbering.
        try {
          const pre = await ES.state.fileHandle.getFile();
          if (lastKnownMtime != null && pre.lastModified > lastKnownMtime) {
            const overwrite = await window.Dialog.confirm({
              title: I18N.t('ui.file.overwriteTitle'),
              message: I18N.t('ui.file.overwriteMsg'),
              confirmLabel: I18N.t('ui.file.overwriteConfirm'),
              cancelLabel: I18N.t('ui.file.cancel'),
              danger: true,
            });
            if (!overwrite) {
              markExternalChange();
              const s = document.getElementById('save-status');
              s.dataset.state = 'dirty';
              s.textContent = I18N.t('ui.toolbar.unsaved');
              return;
            }
          }
        } catch (_) { /* fall through to write; the write itself will surface real errors */ }

        const status = document.getElementById('save-status');
        status.dataset.state = 'saving';
        status.textContent = I18N.t('ui.file.saving');
        const bytes = encodeForWrite(html);
        await writeWithPermissionRecovery(ES.state.fileHandle, bytes);
        ES.state.sourceHtml = html;
        ES.state.originalBytes = bytes.slice();
        ES.setDirty(false);
        // Refresh our mtime so the next external check doesn't fire on
        // the write we just performed.
        try { const f = await ES.state.fileHandle.getFile(); lastKnownMtime = f.lastModified; } catch (_) {}
        clearExternalChange();
        status.dataset.state = 'saved';
        status.textContent = I18N.t('ui.file.saved');
        toast(I18N.t('ui.file.saved'), 'success');
      } catch (e) {
        const status = document.getElementById('save-status');
        status.dataset.state = 'error';
        status.textContent = I18N.getLang() === 'pt-BR' ? 'Erro' : 'Error';
        toast(I18N.t('ui.file.saveFailed', { message: e.message }), 'error');
      }
    } else {
      // Imported documents have no disk handle yet. Ctrl+S should offer the
      // same local-file workflow as the visible Save as button; browsers
      // without File System Access fall back to a download inside saveAs().
      return saveAs();
    }
  }

  async function saveAs() {
    const html = currentHtml();
    if (!html) return;
    if (!supportsFSA || typeof window.showSaveFilePicker !== 'function') {
      exportFile();
      return;
    }

    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: ES.state.fileName || 'untitled.html',
        types: [
          {
            description: 'HTML',
            accept: { 'text/html': ['.html', '.htm'] },
          },
        ],
      });

      const status = document.getElementById('save-status');
      status.dataset.state = 'saving';
      status.textContent = I18N.t('ui.file.saving');
      // Note: no ES.setEncoding() here — "save as" deliberately keeps the
      // document's encoding, so a copy of a Latin-1 file is Latin-1 too.
      const bytes = encodeForWrite(html);
      await writeWithPermissionRecovery(handle, bytes);
      ES.setFile(handle, handle.name || 'untitled.html');
      ES.state.sourceHtml = html;
      ES.state.originalBytes = bytes.slice();
      ES.setDirty(false);
      try { const f = await handle.getFile(); lastKnownMtime = f.lastModified; } catch (_) {}
      clearExternalChange();
      status.dataset.state = 'saved';
      status.textContent = I18N.t('ui.file.saved');
      toast(I18N.t('ui.file.savedAs', { name: handle.name || 'untitled.html' }), 'success');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      const status = document.getElementById('save-status');
      status.dataset.state = 'error';
      status.textContent = I18N.getLang() === 'pt-BR' ? 'Erro' : 'Error';
      toast(I18N.t('ui.file.saveFailed', { message: e.message }), 'error');
    }
  }

  function exportFile() {
    const html = currentHtml();
    if (!html) return;
    const charset = window.Encoding.label(ES.state.encoding, ES.state.declaredCharset);
    const bytes = encodeForWrite(html);
    const blob = new Blob([bytes], { type: `text/html;charset=${charset}` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = ES.state.fileName || 'untitled.html';
    a.click();
    URL.revokeObjectURL(url);
    ES.state.sourceHtml = html;
    ES.state.originalBytes = bytes.slice();
    ES.setDirty(false);
    toast(I18N.t('ui.file.exported', { name: a.download }), 'success');
  }

  // Tell the user when the document's declared charset didn't match its
  // bytes, or when we had to guess. Informational — the editor already
  // resolved it; the point is that the <meta> may need fixing.
  function warnIfEncodingSuspect(info) {
    if (!info) return;
    if (info.mismatch === 'declared-latin1-but-utf8') {
      toast(I18N.t('ui.encoding.mismatch'), 'warn');
    } else if (info.source === 'sniff') {
      toast(I18N.t('ui.encoding.guessed', {
        encoding: window.Encoding.label(info.encoding, info.declared),
      }), '');
    }
  }

  // Serialize to the bytes we actually write. The document's own encoding
  // governs — this is what keeps a Windows-1252 decree from being written
  // back as UTF-8 under a <meta charset> that still declares 1252.
  function encodeForWrite(html) {
    // A clean legacy document must not make a Unicode round trip merely
    // because the destination is "Save as". Returning the exact bytes read
    // from disk preserves FrontPage's encoding and source-level details.
    // Once the text changes, the normal encoder below is used and its result
    // becomes the new snapshot after writing.
    if (html === ES.state.sourceHtml && ES.state.originalBytes) {
      return ES.state.originalBytes.slice();
    }

    const { encoding, hasBom, declaredCharset } = ES.state;
    const result = window.Encoding.encode(html, encoding, hasBom);

    // Characters the target charset can't hold were rewritten (an arrow
    // became ->, an emoji became :-) ). Say so — the text on disk is no
    // longer exactly what's on screen.
    if (result.adapted.length) {
      const shown = [...new Set(result.adapted.map(a => `${a.from} → ${a.to}`))].slice(0, 5);
      toast(I18N.t('ui.encoding.adapted', {
        count: result.adapted.length,
        encoding: window.Encoding.label(encoding, declaredCharset),
        sample: shown.join(', '),
      }), 'warn');
    }
    return result.bytes;
  }

  // Rewrite whichever charset declaration the document uses. Legacy Word
  // exports declare it via http-equiv, modern files via <meta charset>;
  // if it has neither, insert one right after <head>.
  function rewriteMetaCharset(html, charset) {
    const direct = /(<meta\s[^>]*?\bcharset\s*=\s*["']?)([a-z0-9][a-z0-9._:-]*)/i;
    if (direct.test(html)) return html.replace(direct, `$1${charset}`);

    const httpEquiv = /(<meta\s[^>]*?\bhttp-equiv\s*=\s*["']?content-type["']?[^>]*?\bcontent\s*=\s*["'][^"']*?charset\s*=\s*)([a-z0-9][a-z0-9._:-]*)/i;
    if (httpEquiv.test(html)) return html.replace(httpEquiv, `$1${charset}`);

    if (/<head[^>]*>/i.test(html)) {
      return html.replace(/(<head[^>]*>)/i, `$1\n<meta charset="${charset}">`);
    }
    return `<meta charset="${charset}">\n` + html;
  }

  // Let the user override a wrong guess (a file with no declaration at all),
  // or deliberately convert a document between UTF-8 and the legacy charset.
  // Both the bytes and the <meta> move together — the two disagreeing is the
  // exact failure this whole layer exists to prevent.
  async function changeEncoding() {
    if (!ES.state.doc && !ES.state.sourceHtml) return;

    const current = window.Encoding.normalize(ES.state.encoding);
    const isLegacy = window.Encoding.isLatin1Family(current);
    const target = isLegacy ? 'utf-8' : 'windows-1252';
    const targetCharset = isLegacy ? 'UTF-8' : 'ISO-8859-1';

    const ok = await window.Dialog.confirm({
      title: I18N.t('ui.encoding.changeTitle'),
      message: I18N.t('ui.encoding.changeMsg', {
        from: window.Encoding.label(current, ES.state.declaredCharset),
        to: targetCharset,
      }),
      confirmLabel: I18N.t('ui.encoding.changeConfirm', { to: targetCharset }),
      cancelLabel: I18N.t('ui.file.cancel'),
    });
    if (!ok) return;

    const updated = rewriteMetaCharset(currentHtml(), targetCharset);
    ES.state.sourceHtml = updated;
    ES.setEncoding({ encoding: target, declared: targetCharset, hasBom: false });

    // Reload so the live DOM's <meta> matches the source; otherwise the
    // save-time splice would see the head diverge and fall back to a full
    // re-serialization of the document.
    await window.ModeSwitch.loadIntoInitialMode(updated);
    ES.setDirty(true);
    toast(I18N.t('ui.encoding.changed', { encoding: targetCharset }), 'success');
  }

  // Write through the FSA handle. If the browser denies writes
  // (NotAllowedError / SecurityError — typically because the user
  // revoked permission via the page-info menu mid-session), re-request
  // permission and retry once. Surface a clear error if they deny.
  //
  // `bytes` is a Uint8Array, never a string: writing a string through the
  // File System Access API always encodes it as UTF-8, which is precisely
  // the bug this layer exists to prevent.
  async function writeWithPermissionRecovery(handle, bytes) {
    try {
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      return;
    } catch (e) {
      const isPermission =
        e && (e.name === 'NotAllowedError' || e.name === 'SecurityError'
          || (typeof e.message === 'string' && /permission|not allowed/i.test(e.message)));
      if (!isPermission || typeof handle.requestPermission !== 'function') throw e;

      const granted = await handle.requestPermission({ mode: 'readwrite' });
      if (granted !== 'granted') {
        const err = new Error(I18N.t('ui.file.permissionDenied'));
        err.cause = e;
        throw err;
      }
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
    }
  }

  function stripEditorTraces(html) {
    // Remove the injected editor styles and any contenteditable attrs/data flags
    return html
      .replace(/<style id="__he_styles__">[\s\S]*?<\/style>/g, '')
      .replace(/\s+contenteditable="[^"]*"/g, '')
      .replace(/\s+data-he-editing="[^"]*"/g, '')
      .replace(/\s+data-he-preview-asset="[^"]*"/g, '')
      .replace(/\s+data-he-original-(?:src|srcset|poster|href)="[^"]*"/g, '');
  }

  async function newBlank() {
    const blank = `<!DOCTYPE html>
  <html lang="${I18N.getLang()}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${I18N.t('ui.file.blankTitle')}</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #1a1f2c; line-height: 1.6; }
h1 { font-size: 32px; }
</style>
</head>
<body>
<h1>${I18N.t('ui.file.blankHeading')}</h1>
<p>${I18N.t('ui.file.blankBody')}</p>
</body>
</html>`;
    ES.setFile(null, 'untitled.html');
    // A brand-new document is UTF-8; it doesn't inherit legacy encoding
    // from whatever was open before.
    ES.setEncoding(null);
    if (window.AssetResolver) {
      window.AssetResolver.revokeAllObjectUrls();
      window.AssetResolver.setCurrentFileName('untitled.html');
    }
    ES.state.sourceHtml = blank;
    await window.ModeSwitch.loadIntoInitialMode(blank);
    ES.setDirty(false);
  }

  async function linkAssetsDirectory() {
    if (!supportsDirPicker) {
      toast(I18N.t('ui.file.assetsDirUnsupported'), 'warn');
      return;
    }
    if (!window.AssetResolver) return;
    try {
      const dir = await window.showDirectoryPicker();
      window.AssetResolver.setAssetDirectory(dir, dir.name);
      toast(I18N.t('ui.file.assetsDirLinked', { name: dir.name }), 'success');
      lastAssetsWarnKey = '';
      if (ES.state.mode === 'visual' && ES.state.doc) {
        window.Canvas.loadHtml(currentHtml());
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      toast(I18N.t('ui.file.assetsDirError', { message: e.message }), 'error');
    }
  }

  function notifyAssetsUnresolved(result) {
    if (!result || result.unresolved <= 0) return;
    const key = [ES.state.fileName || '', result.unresolved, !!(window.AssetResolver && window.AssetResolver.hasAssetDirectory && window.AssetResolver.hasAssetDirectory())].join('|');
    if (key === lastAssetsWarnKey) return;
    lastAssetsWarnKey = key;
    const hasDir = window.AssetResolver && window.AssetResolver.hasAssetDirectory && window.AssetResolver.hasAssetDirectory();
    if (!hasDir) {
      toast(I18N.t('ui.file.assetsDirNeeded', { count: result.unresolved }), 'warn');
      promptAssetsDirectoryIfNeeded(result.unresolved);
      return;
    }
    toast(I18N.t('ui.file.assetsStillMissing', { count: result.unresolved }), 'warn');
  }

  async function promptAssetsDirectoryIfNeeded(unresolvedCount) {
    if (!supportsDirPicker || assetsPromptInFlight) return;
    const fileKey = ES.state.fileName || '';
    if (fileKey && fileKey === lastAssetsPromptFile) return;

    assetsPromptInFlight = true;
    try {
      const ok = await window.Dialog.confirm({
        title: I18N.t('ui.file.assetsPromptTitle'),
        message: I18N.t('ui.file.assetsPromptMsg', { count: unresolvedCount }),
        confirmLabel: I18N.t('ui.file.assetsPromptConfirm'),
        cancelLabel: I18N.t('ui.file.cancel'),
      });
      if (!ok) {
        lastAssetsPromptFile = fileKey;
        return;
      }
      await linkAssetsDirectory();
      lastAssetsPromptFile = fileKey;
    } catch (_) {
      // Best-effort prompt only.
    } finally {
      assetsPromptInFlight = false;
    }
  }

  function toast(msg, type = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    document.getElementById('toasts').appendChild(t);
    setTimeout(() => t.remove(), 2800);
  }

  // Re-read the file from disk and load it into the editor. Used by the
  // refresh button and the focus-based external-change detector.
  async function reloadFromDisk(opts = {}) {
    if (!ES.state.fileHandle) {
      toast(I18N.t('ui.file.noLinkedFile'), 'warn');
      return false;
    }
    try {
      const file = await ES.state.fileHandle.getFile();
      const info = await window.Encoding.decode(file);
      const text = info.text;
      ES.setEncoding(info);
      lastKnownMtime = file.lastModified;
      if (window.AssetResolver) window.AssetResolver.setCurrentFileName(file.name);

      if (text === ES.state.sourceHtml) {
        if (!opts.silent) toast(I18N.t('ui.file.upToDate'), '');
        clearExternalChange();
        return false;
      }

      if (ES.state.dirty && !opts.force) {
        const ok = await window.Dialog.confirm({
          title: I18N.t('ui.file.reloadDiscardTitle'),
          message: I18N.t('ui.file.reloadDiscardMsg'),
          confirmLabel: I18N.t('ui.file.reloadDiscardConfirm'),
          cancelLabel: I18N.t('ui.file.keepChanges'),
          danger: true,
        });
        if (!ok) return false;
      }

      ES.state.sourceHtml = text;
      if (ES.state.mode === 'source' && window.Source) {
        window.Source.setContent(text);
      } else {
        window.Canvas.loadHtml(text);
      }
      ES.setDirty(false);
      clearExternalChange();
      toast(I18N.t('ui.file.reloaded'), 'success');
      return true;
    } catch (e) {
      toast(I18N.t('ui.file.reloadFailed', { message: e.message }), 'error');
      return false;
    }
  }

  // Cheap mtime poll — runs when the window regains focus / becomes
  // visible. If disk-mtime > our last known mtime, mark the refresh
  // button as having a pending update.
  async function checkExternalChanges() {
    if (!ES.state.fileHandle || lastKnownMtime == null) return;
    try {
      const file = await ES.state.fileHandle.getFile();
      if (file.lastModified > lastKnownMtime) markExternalChange();
    } catch (_) { /* permission may have been revoked */ }
  }

  function markExternalChange() {
    if (externalChangePending) return;
    externalChangePending = true;
    const btn = document.getElementById('tb-refresh');
    if (btn) {
      btn.classList.add('has-update');
      btn.title = I18N.t('ui.file.changedOnDiskBtn');
    }
    toast(I18N.t('ui.file.changedOnDiskToast'), 'warn');
  }
  function clearExternalChange() {
    externalChangePending = false;
    const btn = document.getElementById('tb-refresh');
    if (btn) {
      btn.classList.remove('has-update');
      btn.title = I18N.t('ui.file.refreshDiskBtn');
    }
  }

  // Wire up focus / visibility listeners
  window.addEventListener('focus', () => checkExternalChanges());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkExternalChanges();
  });

  // Keep refresh / diff button enabled state in sync with whether we have a handle
  ES.on((evt) => {
    if (evt === 'file-changed') {
      const hasHandle = !!ES.state.fileHandle;
      ['tb-refresh', 'tb-diff', 'tb-git-diff'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = !hasHandle;
      });
    }
  });

  return {
    init,
    openLocalFile,
    promptImport,
    promptImportUrl,
    importUrl,
    importFile,
    save,
    saveAs,
    exportFile,
    newBlank,
    reloadFromDisk,
    checkExternalChanges,
    changeEncoding,
    currentHtml,
    supportsFSA,
    linkAssetsDirectory,
    notifyAssetsUnresolved,
  };
})();
