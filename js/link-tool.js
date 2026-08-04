// Link tool — turn selected text into a link to another act, or to a
// bookmark in this one.
//
// Before this there was no way at all to link a run of text: the only routes
// were dragging a placeholder "Link" block in and editing its href by hand, or
// typing into the href field of the Attributes panel once an <a> already
// existed. Linking to prior acts is half of what these users do all day.
//
// The address grammar is read back to the user in plain Portuguese, because
// "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d12846.htm#art11-2f"
// is not something anyone should have to proofread character by character.
window.LinkTool = (function() {
  const ES = window.EditorState;
  const RECENT_KEY = 'html-editor.recentLinks';
  const MAX_RECENT = 20;
  const MAX_ROWS = 300;

  // I18N.t is (path, vars, fallback) and its formatter blanks every {k} when
  // vars is missing — so the vars must go through it, not be substituted after.
  function t(path, fallback, vars) {
    try { return window.I18N.t(path, vars || null, fallback); }
    catch (_) { return fallback; }
  }

  // ---- Reading a Planalto address ----

  const TIPOS = {
    decreto: 'Decreto', lei: 'Lei', mpv: 'Medida Provisória',
    lcp: 'Lei Complementar', del: 'Decreto-Lei', emc: 'Emenda Constitucional',
  };

  // Returns a plain-language reading of an address, or null when it is not a
  // Planalto act. Never blocks — an unrecognised address is still a link.
  function describeUrl(raw) {
    const url = String(raw || '').trim();
    if (!url) return null;
    let path = url, frag = '';
    const h = url.indexOf('#');
    if (h >= 0) { path = url.slice(0, h); frag = url.slice(h + 1); }

    let ato = null;
    let m;
    if ((m = path.match(/\/ccivil_03\/leis\/lcp\/lcp(\d+)\.html?/i))) {
      ato = { tipo: 'lcp', numero: m[1] };
    } else if ((m = path.match(/\/anexo\/anexo-([a-z]+)(\d+)\.html?/i))) {
      ato = { tipo: siglaToTipo(m[1]), numero: m[2], anexo: true };
    } else if ((m = path.match(/\/ccivil_03\/_ato(\d{4})-(\d{4})\/(\d{4})\/([a-z]+)\/([a-z]+)(\d+)\.html?/i))) {
      ato = { tipo: m[4].toLowerCase(), numero: m[6], ano: m[3] };
    } else if ((m = path.match(/\/ccivil_03\/[^/]*\/([a-z]+)(\d+)(?:cons)?\.html?/i))) {
      ato = { tipo: siglaToTipo(m[1]), numero: m[2] };
    }
    if (!ato) return null;

    const nome = (TIPOS[ato.tipo] || ato.tipo) + ' nº ' + formatNumero(ato.numero) +
                 (ato.ano ? ', de ' + ato.ano : '');
    const partes = [nome];
    if (ato.anexo) partes.push(t('ui.link.annexFile', 'arquivo de anexos'));
    const alvo = describeFragment(frag);
    if (alvo) partes.push(alvo);
    return { text: partes.join(' — '), ato, fragment: frag };
  }

  function siglaToTipo(s) {
    const map = { l: 'lei', d: 'decreto', lcp: 'lcp', mpv: 'mpv', del: 'del', emc: 'emc' };
    return map[String(s).toLowerCase()] || String(s).toLowerCase();
  }

  function formatNumero(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // #art11-2f → "art. 11, inciso II, alínea f". #art3%C2%A71 → "art. 3º, § 1º".
  function describeFragment(frag) {
    if (!frag) return '';
    const f = window.PageTools.decodeFragment(frag);
    let m;
    if ((m = f.match(/^anexo(\d+)([a-z])?$/i))) {
      return 'Anexo ' + intToRoman(+m[1]) + (m[2] ? '.' + m[2].toUpperCase() : '');
    }
    if ((m = f.match(/^art(\d+)§(\d+)$/i))) return artLabel(m[1]) + ', § ' + m[2] + 'º';
    if ((m = f.match(/^art(\d+)p([ivxlcdm]*)\.?\d*$/i))) {
      return artLabel(m[1]) + ', ' + t('ui.act.disp.paragrafoUnico', 'parágrafo único') +
             (m[2] ? ', inciso ' + m[2].toUpperCase() : '');
    }
    if ((m = f.match(/^art(\d+)-(\d+)?\.?([a-z])?\.?\d*$/i))) {
      const bits = [artLabel(m[1])];
      if (m[2]) bits.push('inciso ' + intToRoman(+m[2]));
      if (m[3]) bits.push('alínea ' + m[3]);
      return bits.join(', ');
    }
    if ((m = f.match(/^art(\d+)/i))) return artLabel(m[1]);
    return f;
  }

  // Articles up to 9 take the ordinal ("art. 3º"); from 10 on they are read as
  // cardinals ("art. 11") — the drafting convention, and what the acts print.
  function artLabel(n) {
    return 'art. ' + n + (+n < 10 ? 'º' : '');
  }

  function intToRoman(n) {
    const table = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
      [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let out = '';
    for (const [v, s] of table) while (n >= v) { out += s; n -= v; }
    return out || String(n);
  }

  // ---- The dialog ----

  async function open() {
    const doc = ES.state.doc;
    if (!doc) return;

    // Snapshot the selection before the dialog steals focus.
    const live = window.Canvas.getTextRange ? window.Canvas.getTextRange() : null;
    const savedRange = live ? live.cloneRange() : null;
    const sel = ES.state.selected;
    const existing = findExistingLink(sel, savedRange);

    if (!savedRange && !existing) {
      toast(t('ui.link.selectFirst', 'Selecione primeiro o texto que deve virar link.'), 'warn');
      return;
    }

    let href = existing ? (existing.getAttribute('href') || '') : '';
    let urlInput = null, readout = null;

    const ok = await window.Dialog.custom({
      title: existing ? t('ui.link.titleEdit', 'Editar link') : t('ui.link.title', 'Inserir link'),
      message: existing
        ? t('ui.link.messageEdit', 'Altere o endereço de destino deste link.')
        : t('ui.link.message', 'Cole o endereço do ato ou escolha um destino desta página.'),
      icon: 'link',
      wide: true,
      confirmLabel: existing ? t('ui.link.save', 'Salvar') : t('ui.link.create', 'Inserir link'),
      build(body, ctx) {
        body.innerHTML =
          '<label class="link-field"><span class="link-label"></span>' +
          '<input type="text" class="dialog-input" id="link-url" spellcheck="false"></label>' +
          '<div class="link-readout" id="link-readout"></div>' +
          '<div class="link-sections"></div>';

        body.querySelector('.link-label').textContent = t('ui.link.addressLabel', 'Endereço');
        urlInput = body.querySelector('#link-url');
        urlInput.placeholder = 'https://www.planalto.gov.br/ccivil_03/…';
        urlInput.value = href;
        readout = body.querySelector('#link-readout');
        urlInput.addEventListener('input', () => { href = urlInput.value; renderReadout(); });
        urlInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); ctx.close(true); }
        });
        setTimeout(() => { urlInput.focus(); urlInput.select(); }, 40);
        renderReadout();

        const secs = body.querySelector('.link-sections');
        secs.appendChild(sectionDispositivos(doc, (frag) => setHref('#' + frag)));
        secs.appendChild(sectionAnchors(doc, (frag) => setHref('#' + frag)));
        secs.appendChild(sectionRecent((u) => setHref(u)));

        if (existing) {
          const rm = document.createElement('button');
          rm.type = 'button';
          rm.className = 'link-remove';
          rm.textContent = t('ui.link.remove', 'Remover link (manter o texto)');
          rm.addEventListener('click', () => { unlink(existing); ctx.close(false); });
          body.appendChild(rm);
        }

        function setHref(v) { href = v; urlInput.value = v; renderReadout(); urlInput.focus(); }
      },
    });

    if (!ok) return;
    const value = String(href || '').trim();
    if (!value) { toast(t('ui.link.empty', 'Informe um endereço.'), 'warn'); return; }
    if (existing) applyToExisting(existing, value);
    else applyToRange(savedRange, value);

    function renderReadout() {
      if (!readout) return;
      const d = describeUrl(href);
      readout.className = 'link-readout' + (d ? ' known' : (href ? ' unknown' : ''));
      if (!href) { readout.textContent = ''; return; }
      if (d) { readout.textContent = d.text; return; }
      if (href.startsWith('#')) {
        const name = window.PageTools.decodeFragment(href.slice(1));
        const found = resolveFragment(ES.state.doc, name);
        readout.textContent = found
          ? t('ui.link.inThisPage', 'Nesta página: {alvo}', { alvo: describeFragment(href.slice(1)) })
          : t('ui.link.missingAnchor', 'Atenção: esta página não tem a âncora “{name}”.', { name });
        if (!found) readout.className = 'link-readout unknown';
        return;
      }
      readout.textContent = t('ui.link.external', 'Endereço externo (fora do Planalto).');
    }
  }

  function findExistingLink(sel, range) {
    const from = (range && range.commonAncestorContainer) || sel;
    if (!from) return null;
    const el = from.nodeType === 1 ? from : from.parentElement;
    return el && el.closest ? el.closest('a[href]') : null;
  }

  // ---- Sections ----

  function section(titleText) {
    const wrap = document.createElement('div');
    wrap.className = 'link-section';
    const h = document.createElement('div');
    h.className = 'link-section-head';
    h.textContent = titleText;
    wrap.appendChild(h);
    const list = document.createElement('div');
    list.className = 'link-section-list';
    wrap.appendChild(list);
    wrap._list = list;
    return wrap;
  }

  function sectionDispositivos(doc, pick) {
    const wrap = section(t('ui.link.sectionDisp', 'Dispositivo deste ato'));
    const rows = window.ActFormat.outline(doc).filter(r => r.anchor || r.suggestion);
    if (!rows.length) return empty(wrap, t('ui.link.noDisp', 'Nenhum artigo ou anexo reconhecido nesta página.'));
    rows.slice(0, MAX_ROWS).forEach((r) => {
      const frag = r.anchor || r.suggestion;
      wrap._list.appendChild(pickRow(r.label, '#' + window.PageTools.encodeFragment(frag),
        r.text.slice(0, 50), () => pick(window.PageTools.encodeFragment(frag))));
    });
    return wrap;
  }

  function sectionAnchors(doc, pick) {
    const wrap = section(t('ui.link.sectionAnchors', 'Âncoras existentes'));
    const items = window.PageTools.collectAnchors(doc);
    if (!items.length) return empty(wrap, t('ui.link.noAnchors', 'Esta página ainda não tem âncoras.'));
    items.slice(0, MAX_ROWS).forEach((it) => {
      // The bookmark name alone ("art11-2f") tells nobody anything; show the
      // start of the paragraph it sits in.
      const ctxEl = it.el.closest ? it.el.closest('p, td, h1, h2, h3, div') : null;
      const ctxText = ctxEl ? window.ActFormat.normText(ctxEl.textContent).slice(0, 60) : '';
      wrap._list.appendChild(pickRow('#' + it.key, describeFragment(it.key), ctxText,
        () => pick(window.PageTools.encodeFragment(it.key))));
    });
    return wrap;
  }

  function sectionRecent(pick) {
    const wrap = section(t('ui.link.sectionRecent', 'Usados recentemente'));
    const items = loadRecent();
    if (!items.length) return empty(wrap, t('ui.link.noRecent', 'Nada ainda.'));
    items.forEach((r) => {
      wrap._list.appendChild(pickRow(r.label || r.href, '', r.href, () => pick(r.href)));
    });
    return wrap;
  }

  function empty(wrap, msg) {
    const d = document.createElement('div');
    d.className = 'link-empty';
    d.textContent = msg;
    wrap._list.appendChild(d);
    return wrap;
  }

  function pickRow(main, mid, sub, onPick) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'link-row';
    row.innerHTML = '<span class="link-row-main"></span><span class="link-row-mid"></span><span class="link-row-sub"></span>';
    row.querySelector('.link-row-main').textContent = main;
    row.querySelector('.link-row-mid').textContent = mid || '';
    row.querySelector('.link-row-sub').textContent = sub || '';
    row.addEventListener('click', onPick);
    return row;
  }

  // ---- Applying ----

  function applyToRange(range, href) {
    const doc = ES.state.doc;
    if (window.Canvas.commitTextEdit) window.Canvas.commitTextEdit();
    const usable = window.PageTools.liveRange(range);
    if (!usable) { toast(t('ui.link.lostSelection', 'A seleção se perdeu. Selecione o texto de novo.'), 'warn'); return; }

    const startBlock = window.ActFormat.blockOf(usable.startContainer);
    const endBlock = window.ActFormat.blockOf(usable.endContainer);
    if (startBlock !== endBlock) {
      toast(t('ui.link.crossBlocks', 'A seleção atravessa mais de um parágrafo. Selecione dentro de um só.'), 'warn');
      return;
    }

    const a = doc.createElement('a');
    // href only. Not one of the 144 links in the sample act carries a class,
    // style, target or rel, and adding any would stand out in the diff.
    a.setAttribute('href', href);
    try {
      usable.surroundContents(a);
    } catch (_) {
      a.appendChild(usable.extractContents());
      usable.insertNode(a);
    }
    try { doc.defaultView.getSelection().removeAllRanges(); } catch (_) {}
    ES.snapshot('link');
    ES.select(a);
    rememberLink(href);
    toast(t('ui.link.created', 'Link criado.'), 'success');
  }

  function applyToExisting(a, href) {
    a.setAttribute('href', href);
    ES.snapshot('editar link');
    ES.select(a);
    rememberLink(href);
    toast(t('ui.link.updated', 'Link atualizado.'), 'success');
  }

  function unlink(a) {
    const parent = a.parentNode;
    while (a.firstChild) parent.insertBefore(a.firstChild, a);
    a.remove();
    ES.snapshot('remover link');
    toast(t('ui.link.removed', 'Link removido; o texto foi mantido.'), 'success');
  }

  // ---- Recent ----

  function loadRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (_) { return []; }
  }
  function rememberLink(href) {
    if (!href || href.startsWith('#')) return; // in-page targets aren't worth a history
    const d = describeUrl(href);
    const list = loadRecent().filter(x => x.href !== href);
    list.unshift({ href, label: d ? d.text : href });
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT))); } catch (_) {}
  }

  // ---- Link audit ----

  function resolveFragment(doc, name) {
    if (!doc || !name) return null;
    const esc = window.CSS && CSS.escape ? CSS.escape(name) : String(name).replace(/["\\]/g, '\\$&');
    try { return doc.querySelector('a[name="' + esc + '"]') || doc.getElementById(name); }
    catch (_) { return doc.getElementById(name); }
  }

  // What is wrong with the links on this page. Read-only: it reports, it does
  // not rewrite. A bulk "fix everything" pass would be a whole-document
  // normalizer, which is exactly what the byte-preservation guarantee forbids.
  function audit(doc) {
    doc = doc || ES.state.doc;
    const out = { broken: [], selfAbsolute: [], insecure: [], empty: [], external: [], total: 0 };
    if (!doc) return out;

    // The act's own future published address — it links to its own annexes by
    // absolute URL, so renaming a bookmark silently breaks them.
    const selfNames = new Set();
    doc.querySelectorAll('a[name]').forEach(a => selfNames.add(a.getAttribute('name')));

    doc.querySelectorAll('a[href]').forEach((a) => {
      const href = (a.getAttribute('href') || '').trim();
      out.total++;
      if (!href || href === '#') { out.empty.push({ el: a, href }); return; }

      if (href.startsWith('#')) {
        // Decode BEFORE resolving: `#art3%C2%A71` targets the bookmark named
        // `art3§1`, and comparing the raw strings reports every § link as
        // broken — 39 of them in the sample act alone.
        const name = window.PageTools.decodeFragment(href.slice(1));
        if (!resolveFragment(doc, name)) out.broken.push({ el: a, href, name });
        return;
      }
      if (/^http:\/\//i.test(href)) out.insecure.push({ el: a, href });
      const hash = href.indexOf('#');
      if (hash > 0 && /planalto\.gov\.br/i.test(href)) {
        const frag = window.PageTools.decodeFragment(href.slice(hash + 1));
        if (selfNames.has(frag)) out.selfAbsolute.push({ el: a, href, name: frag });
      }
      if (!/planalto\.gov\.br/i.test(href) && /^https?:/i.test(href)) out.external.push({ el: a, href });
    });
    return out;
  }

  async function showAudit() {
    const doc = ES.state.doc;
    if (!doc) return;
    const r = audit(doc);
    await window.Dialog.custom({
      title: t('ui.link.auditTitle', 'Conferir links'),
      message: t('ui.link.auditMsg', '{n} links nesta página.', { n: r.total }),
      icon: 'link-2',
      wide: true,
      hideConfirm: true,
      cancelLabel: t('ui.link.close', 'Fechar'),
      build(body) {
        const groups = [
          ['broken', t('ui.link.gBroken', 'Apontam para uma âncora que não existe'), 'erro'],
          ['empty', t('ui.link.gEmpty', 'Sem destino'), 'aviso'],
          ['selfAbsolute', t('ui.link.gSelf', 'Apontam para o próprio ato pelo endereço completo'), 'aviso'],
          ['insecure', t('ui.link.gHttp', 'Usam http:// em vez de https://'), 'aviso'],
          ['external', t('ui.link.gExternal', 'Fora do Planalto'), 'info'],
        ];
        let any = false;
        groups.forEach(([key, titleText, sev]) => {
          const items = r[key];
          if (!items.length) return;
          any = true;
          const sec = section(titleText + ' (' + items.length + ')');
          sec.classList.add('sev-' + sev);
          items.slice(0, MAX_ROWS).forEach((it) => {
            const row = document.createElement('div');
            row.className = 'link-audit-row';
            row.innerHTML = '<span class="link-audit-text"></span><span class="link-audit-href"></span>' +
                            '<button type="button" class="link-audit-go"></button>';
            row.querySelector('.link-audit-text').textContent =
              window.ActFormat.normText(it.el.textContent).slice(0, 52) || '(sem texto)';
            row.querySelector('.link-audit-href').textContent = it.href;
            const go = row.querySelector('.link-audit-go');
            go.textContent = t('ui.link.goto', 'Ir até');
            go.addEventListener('click', () => {
              it.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              ES.select(it.el);
            });
            sec._list.appendChild(row);
          });
          if (items.length > MAX_ROWS) {
            const more = document.createElement('div');
            more.className = 'link-empty';
            more.textContent = t('ui.link.more', 'e mais {n}…', { n: items.length - MAX_ROWS });
            sec._list.appendChild(more);
          }
          body.appendChild(sec);
        });
        if (!any) {
          const okDiv = document.createElement('div');
          okDiv.className = 'link-empty ok';
          okDiv.textContent = t('ui.link.allGood', 'Nenhum problema encontrado nos links.');
          body.appendChild(okDiv);
        }
      },
    });
  }

  function toast(msg, type) {
    const host = document.getElementById('toasts');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  return { open, describeUrl, describeFragment, audit, showAudit, resolveFragment, intToRoman };
})();
