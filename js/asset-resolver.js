// Preview asset resolver: maps local relative image paths to blob: URLs
// for iframe/srcdoc rendering, without changing the original HTML source.
window.AssetResolver = (function() {
  let assetDirHandle = null;
  let assetDirName = '';
  let currentFileBase = '';
  let objectUrls = [];

  function setCurrentFileName(name) {
    const n = String(name || '').trim();
    const dot = n.lastIndexOf('.');
    currentFileBase = dot > 0 ? n.slice(0, dot) : n;
  }

  function setAssetDirectory(handle, name) {
    assetDirHandle = handle || null;
    assetDirName = String(name || (handle && handle.name) || '');
  }

  function clearAssetDirectory() {
    assetDirHandle = null;
    assetDirName = '';
    revokeAllObjectUrls();
  }

  function hasAssetDirectory() {
    return !!assetDirHandle;
  }

  function getAssetDirectoryName() {
    return assetDirName;
  }

  async function applyToDocument(doc) {
    if (!doc || !doc.querySelectorAll) return { total: 0, applied: 0, unresolved: 0, needsDirectory: false };
    revokeAllObjectUrls();

    const refs = collectImageRefs(doc);
    if (refs.length === 0) return { total: 0, applied: 0, unresolved: 0, needsDirectory: false };
    if (!assetDirHandle) return { total: refs.length, applied: 0, unresolved: refs.length, needsDirectory: true };

    let applied = 0;
    let unresolved = 0;

    for (const ref of refs) {
      try {
        if (ref.kind === 'srcset') {
          const rewritten = await resolveSrcset(ref.value);
          if (rewritten.changed) {
            writeResolvedAttr(ref.el, ref.attr, ref.value, rewritten.value);
            applied++;
          } else {
            unresolved++;
          }
          continue;
        }

        const resolved = await resolvePathToObjectUrl(ref.value);
        if (!resolved) {
          unresolved++;
          continue;
        }
        writeResolvedAttr(ref.el, ref.attr, ref.value, resolved);
        applied++;
      } catch (_) {
        unresolved++;
      }
    }

    return { total: refs.length, applied, unresolved, needsDirectory: false };
  }

  function collectImageRefs(doc) {
    const out = [];

    doc.querySelectorAll('img[src],source[src],video[poster],link[rel~="icon"][href]').forEach((el) => {
      if (el.hasAttribute('src')) {
        const v = (el.getAttribute('src') || '').trim();
        if (isRelativeAsset(v)) out.push({ el, attr: 'src', value: v, kind: 'single' });
      }
      if (el.hasAttribute('poster')) {
        const v = (el.getAttribute('poster') || '').trim();
        if (isRelativeAsset(v)) out.push({ el, attr: 'poster', value: v, kind: 'single' });
      }
      if (el.hasAttribute('href')) {
        const v = (el.getAttribute('href') || '').trim();
        if (isRelativeAsset(v)) out.push({ el, attr: 'href', value: v, kind: 'single' });
      }
    });

    doc.querySelectorAll('img[srcset],source[srcset]').forEach((el) => {
      const v = (el.getAttribute('srcset') || '').trim();
      if (!v) return;
      out.push({ el, attr: 'srcset', value: v, kind: 'srcset' });
    });

    return out;
  }

  function isRelativeAsset(v) {
    if (!v) return false;
    if (v.startsWith('#')) return false;
    if (/^(data:|blob:|https?:|file:|mailto:|tel:|javascript:)/i.test(v)) return false;
    if (v.startsWith('//')) return false;
    return true;
  }

  async function resolveSrcset(srcset) {
    const parts = srcset.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return { changed: false, value: srcset };

    let changed = false;
    const rewritten = [];

    for (const item of parts) {
      const m = item.match(/^(\S+)(\s+.+)?$/);
      if (!m) {
        rewritten.push(item);
        continue;
      }
      const url = m[1];
      const descriptor = m[2] || '';
      if (!isRelativeAsset(url)) {
        rewritten.push(item);
        continue;
      }
      const resolved = await resolvePathToObjectUrl(url);
      if (resolved) {
        changed = true;
        rewritten.push(resolved + descriptor);
      } else {
        rewritten.push(item);
      }
    }

    return { changed, value: rewritten.join(', ') };
  }

  async function resolvePathToObjectUrl(rawPath) {
    const path = normalizePath(rawPath);
    if (!path) return null;

    const candidates = buildCandidates(path);
    for (const candidate of candidates) {
      const file = await getFileFromDir(assetDirHandle, candidate);
      if (!file) continue;
      const url = URL.createObjectURL(file);
      objectUrls.push(url);
      return url;
    }
    return null;
  }

  function buildCandidates(path) {
    const set = new Set();
    const noDot = path.replace(/^\.\//, '');
    const filesPrefix = currentFileBase ? (currentFileBase + '_files/') : '';

    set.add(path);
    set.add(noDot);
    set.add('./' + noDot);

    if (filesPrefix) {
      if (!noDot.startsWith(filesPrefix)) set.add(filesPrefix + noDot);
      if (path.startsWith(filesPrefix)) set.add(path.slice(filesPrefix.length));
      if (noDot.startsWith(filesPrefix)) set.add(noDot.slice(filesPrefix.length));
    }

    const firstSlash = noDot.indexOf('/');
    if (firstSlash > 0) {
      const tail = noDot.slice(firstSlash + 1);
      set.add(tail);
      if (filesPrefix && !tail.startsWith(filesPrefix)) set.add(filesPrefix + tail);
    }

    if (assetDirName) {
      const dirPrefix = assetDirName.replace(/\\/g, '/').replace(/\/$/, '') + '/';
      if (noDot.startsWith(dirPrefix)) set.add(noDot.slice(dirPrefix.length));
      if (path.startsWith('./' + dirPrefix)) set.add(path.slice(2 + dirPrefix.length));
    }

    return Array.from(set)
      .map(s => s.replace(/^\/+/, ''))
      .map(s => s.replace(/\/+/g, '/'))
      .filter(Boolean);
  }

  function normalizePath(v) {
    if (!v) return '';
    let s = String(v).trim();
    const hash = s.indexOf('#');
    if (hash >= 0) s = s.slice(0, hash);
    const q = s.indexOf('?');
    if (q >= 0) s = s.slice(0, q);
    s = s.replace(/\\/g, '/');
    return s;
  }

  async function getFileFromDir(root, relativePath) {
    if (!root || !relativePath) return null;
    const parts = relativePath.split('/').filter(Boolean);
    if (parts.length === 0) return null;

    let dir = root;
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await getDirectoryHandleLoose(dir, parts[i]);
      if (!dir) return null;
    }
    return await getFileHandleLoose(dir, parts[parts.length - 1]);
  }

  async function getDirectoryHandleLoose(dir, name) {
    try {
      return await dir.getDirectoryHandle(name);
    } catch (_) {
      const wanted = name.toLowerCase();
      for await (const [entryName, entry] of dir.entries()) {
        if (entry.kind === 'directory' && entryName.toLowerCase() === wanted) return entry;
      }
      return null;
    }
  }

  async function getFileHandleLoose(dir, name) {
    try {
      const handle = await dir.getFileHandle(name);
      return await handle.getFile();
    } catch (_) {
      const wanted = name.toLowerCase();
      for await (const [entryName, entry] of dir.entries()) {
        if (entry.kind !== 'file' || entryName.toLowerCase() !== wanted) continue;
        return await entry.getFile();
      }
      return null;
    }
  }

  function writeResolvedAttr(el, attr, originalValue, resolvedValue) {
    const marker = 'data-he-original-' + attr;
    if (!el.hasAttribute(marker)) el.setAttribute(marker, originalValue);
    el.setAttribute(attr, resolvedValue);
    el.setAttribute('data-he-preview-asset', '1');
  }

  function restoreOriginalAttrs(doc) {
    if (!doc || !doc.querySelectorAll) return;
    doc.querySelectorAll('[data-he-original-src], [data-he-original-srcset], [data-he-original-poster], [data-he-original-href]').forEach((el) => {
      restoreAttr(el, 'src');
      restoreAttr(el, 'srcset');
      restoreAttr(el, 'poster');
      restoreAttr(el, 'href');
      el.removeAttribute('data-he-preview-asset');
    });
  }

  function restoreAttr(el, attr) {
    const marker = 'data-he-original-' + attr;
    if (!el.hasAttribute(marker)) return;
    el.setAttribute(attr, el.getAttribute(marker) || '');
    el.removeAttribute(marker);
  }

  function revokeAllObjectUrls() {
    for (const url of objectUrls) {
      try { URL.revokeObjectURL(url); } catch (_) {}
    }
    objectUrls = [];
  }

  return {
    setCurrentFileName,
    setAssetDirectory,
    clearAssetDirectory,
    hasAssetDirectory,
    getAssetDirectoryName,
    applyToDocument,
    restoreOriginalAttrs,
    revokeAllObjectUrls,
  };
})();
