// Conferência final do ato — the checklist a drafter would otherwise run in
// their head before publishing.
//
// Deliberately READ-ONLY, except for single, unambiguous per-item fixes. A
// "corrigir tudo" button would be a whole-document normalizer wearing a hat,
// and rewriting untouched regions is exactly what the byte-preservation
// guarantee in file.js exists to prevent.
window.ActCheck = (function() {
  const ES = window.EditorState;
  const MAX_ITEMS = 200;

  // I18N.t is (path, vars, fallback) and its formatter blanks every {k} when
  // vars is missing — so the vars must go through it, not be substituted after.
  function t(path, fallback, vars) {
    try { return window.I18N.t(path, vars || null, fallback); }
    catch (_) { return fallback; }
  }

  function run(doc) {
    doc = doc || ES.state.doc;
    const groups = [];
    if (!doc) return groups;

    const rows = window.ActFormat.outline(doc);
    const audit = window.LinkTool.audit(doc);

    // 1. Articles that nothing can ever link to.
    const semAncora = rows.filter(r => (r.kind === 'artigo' || r.kind === 'anexo') && !r.hasAnchor);
    push(groups, 'sem-ancora', 'erro',
      t('ui.check.noAnchor', 'Dispositivos sem âncora'),
      t('ui.check.noAnchorWhy', 'Outros atos apontam para artigos por #artN. Sem âncora, essa remissão é impossível.'),
      semAncora.map(r => ({ el: r.el, text: r.label + ' — ' + r.text.slice(0, 60),
        fix: { label: t('ui.check.createAnchor', 'Criar #{s}', { s: r.suggestion }), run: () => addAnchor(r) } })));

    // 2. Bookmarks that a § stripped by the old sanitizer could have collided.
    const suspeitos = [];
    doc.querySelectorAll('a[name]').forEach((a) => {
      const n = a.getAttribute('name') || '';
      if (!/^art\d+$/.test(n)) return;
      const p = a.closest('p, div, td');
      const d = p ? window.ActFormat.detectDispositivo(p.textContent) : null;
      // A bookmark that says "art31" sitting on a paragraph that reads "§ 1º"
      // is what the old § stripping produced.
      if (d && (d.kind === 'paragrafo' || d.kind === 'paragrafoUnico')) {
        suspeitos.push({ el: a, text: '#' + n + ' — ' + window.ActFormat.normText(p.textContent).slice(0, 60) });
      }
    });
    push(groups, 'ancora-suspeita', 'erro',
      t('ui.check.badAnchor', 'Âncoras possivelmente colididos'),
      t('ui.check.badAnchorWhy', 'Uma âncora chamada artN num parágrafo (§) costuma vir de uma versão anterior que apagava o §.'),
      suspeitos);

    // 3. Links.
    push(groups, 'link-quebrado', 'erro',
      t('ui.check.brokenLinks', 'Links para âncoras que não existem'),
      t('ui.check.brokenLinksWhy', 'O leitor clica e não sai do lugar.'),
      audit.broken.map(x => ({ el: x.el, text: x.href + ' — ' + txt(x.el) })));

    push(groups, 'link-self', 'aviso',
      t('ui.check.selfLinks', 'Links para o próprio ato pelo endereço completo'),
      t('ui.check.selfLinksWhy', 'Renomear uma âncora quebra estes links em silêncio; um destino curto (#nome) acompanha a mudança.'),
      audit.selfAbsolute.map(x => ({ el: x.el, text: x.href,
        fix: { label: t('ui.check.toFragment', 'Usar #{n}', { n: x.name }),
               run: () => { x.el.setAttribute('href', '#' + window.PageTools.encodeFragment(x.name)); ES.snapshot('link'); } } })));

    push(groups, 'link-http', 'aviso',
      t('ui.check.httpLinks', 'Links em http://'),
      t('ui.check.httpLinksWhy', 'O portal serve em https://.'),
      audit.insecure.map(x => ({ el: x.el, text: x.href,
        fix: { label: t('ui.check.toHttps', 'Trocar para https'),
               run: () => { x.el.setAttribute('href', x.href.replace(/^http:/i, 'https:')); ES.snapshot('link'); } } })));

    push(groups, 'link-vazio', 'aviso', t('ui.check.emptyLinks', 'Links sem destino'), '',
      audit.empty.map(x => ({ el: x.el, text: txt(x.el) })));

    // 4. Required pieces of an act.
    const faltando = [];
    if (!rows.some(r => r.kind === 'notaDou')) {
      faltando.push({ el: null, text: t('ui.check.missingDou', 'Falta a nota "Este texto não substitui o publicado no DOU…"') });
    }
    if (!rows.some(r => r.kind === 'epigrafe')) {
      faltando.push({ el: null, text: t('ui.check.missingEpigrafe', 'Não encontrei a epígrafe (DECRETO Nº …, DE … DE … DE …).') });
    }
    const epi = doc.querySelector('a[href*="Viw_Identificacao"]');
    if (rows.some(r => r.kind === 'epigrafe') && !epi) {
      faltando.push({ el: null, text: t('ui.check.epigrafeNoLink', 'A epígrafe não tem o link de identificação do ato (Viw_Identificacao).') });
    }
    push(groups, 'faltando', 'aviso', t('ui.check.missing', 'Partes do ato que não encontrei'), '', faltando);

    // 5. Page title. The sample act's <title> is literally "d12990" — the
    //    filename, which is what a browser tab and a search result will show.
    const titleEl = doc.querySelector('head > title');
    const titulo = titleEl ? titleEl.textContent.trim() : '';
    const base = (ES.state.fileName || '').replace(/\.html?$/i, '');
    const tituloItens = [];
    if (!titleEl || !titulo) {
      tituloItens.push({ el: null, text: t('ui.check.noTitle', 'A página não tem título.'),
        fix: { label: t('ui.check.setTitle', 'Definir'), run: () => window.PageTools.openPageTitleDialog() } });
    } else if (base && titulo.toLowerCase() === base.toLowerCase()) {
      tituloItens.push({ el: null,
        text: t('ui.check.titleIsFilename', 'O título da página é "{t}" — o nome do arquivo, não o nome do ato.', { t: titulo }),
        fix: { label: t('ui.check.setTitle', 'Definir'), run: () => window.PageTools.openPageTitleDialog() } });
    }
    push(groups, 'titulo', 'aviso', t('ui.check.title', 'Título da página'), '', tituloItens);

    // 6. Word leftovers.
    const html = doc.body ? doc.body.innerHTML : '';
    const residuos = [];
    countIn(html, /mso-[a-z-]+/gi, 'mso-', residuos);
    countIn(html, /<o:p/gi, '<o:p>', residuos);
    countIn(html, /WordSection\d+/g, 'WordSection', residuos);
    countIn(html, /class="Mso(?!Normal(?:Table)?")[A-Za-z]*"/g, 'class="Mso…"', residuos);
    push(groups, 'word', 'dica', t('ui.check.word', 'Resíduos de marcação do Word'),
      t('ui.check.wordWhy', 'Não quebram nada, mas engordam o arquivo. Reformatar o parágrafo pela barra do ato remove.'),
      residuos);

    // 7. Characters the document's charset cannot hold.
    push(groups, 'charset', 'aviso', t('ui.check.charset', 'Caracteres fora da codificação do arquivo'),
      t('ui.check.charsetWhy', 'Serão adaptados ao salvar. Confira se a adaptação é aceitável.'),
      unencodable(doc));

    return groups.filter(g => g.items.length);
  }

  function txt(el) {
    return window.ActFormat.normText(el.textContent).slice(0, 60) || '(sem texto)';
  }

  function countIn(html, re, label, out) {
    const m = html.match(re);
    if (m && m.length) out.push({ el: null, text: label + ' — ' + m.length + '×' });
  }

  function unencodable(doc) {
    const enc = window.Encoding;
    const charset = ES.state.encoding || 'utf-8';
    if (!enc || typeof enc.canEncode !== 'function' || /utf-?8/i.test(charset)) return [];
    const seen = new Map();
    const text = doc.body ? doc.body.textContent : '';
    for (const ch of text) {
      if (ch.codePointAt(0) < 128 || seen.has(ch)) continue;
      let ok = true;
      try { ok = enc.canEncode(ch, charset); } catch (_) { ok = true; }
      if (!ok) seen.set(ch, true);
    }
    return Array.from(seen.keys()).map(ch => ({ el: null,
      text: '“' + ch + '” (U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') + ')' }));
  }

  function addAnchor(r) {
    const doc = ES.state.doc;
    if (!r.el || !r.el.isConnected || !r.suggestion) return;
    const name = window.PageTools.uniqueId(doc, window.PageTools.sanitizeAnchorName(r.suggestion));
    const a = doc.createElement('a');
    a.setAttribute('name', name);
    const target = r.el.querySelector('span, font, b') || r.el;
    target.insertBefore(a, target.firstChild);
    ES.snapshot('âncora');
    window.ActFormat.invalidate();
  }

  function push(groups, id, severity, label, why, items) {
    groups.push({ id, severity, label, why, items: items || [] });
  }

  // Count of blocking-severity findings — drives the badge on the toolbar.
  function errorCount(doc) {
    return run(doc).filter(g => g.severity === 'erro').reduce((a, g) => a + g.items.length, 0);
  }

  async function show() {
    const doc = ES.state.doc;
    if (!doc) return;
    const groups = run(doc);
    await window.Dialog.custom({
      title: t('ui.check.dialogTitle', 'Conferência final do ato'),
      icon: 'list-checks',
      wide: true,
      hideConfirm: true,
      cancelLabel: t('ui.check.close', 'Fechar'),
      message: groups.length
        ? t('ui.check.found', '{n} ponto(s) para conferir.',
            { n: groups.reduce((a, g) => a + g.items.length, 0) })
        : t('ui.check.clean', 'Nada a apontar.'),
      build(body, ctx) {
        if (!groups.length) {
          const ok = document.createElement('div');
          ok.className = 'check-clean';
          ok.textContent = t('ui.check.allGood', 'O ato passou em todas as conferências.');
          body.appendChild(ok);
          return;
        }
        groups.forEach((g) => {
          const sec = document.createElement('div');
          sec.className = 'check-group sev-' + g.severity;
          const h = document.createElement('div');
          h.className = 'check-head';
          h.innerHTML = '<span class="check-sev"></span><span class="check-title"></span>';
          h.querySelector('.check-sev').textContent = t('ui.check.sev.' + g.severity, g.severity);
          h.querySelector('.check-title').textContent = g.label + ' (' + g.items.length + ')';
          sec.appendChild(h);
          if (g.why) {
            const why = document.createElement('div');
            why.className = 'check-why';
            why.textContent = g.why;
            sec.appendChild(why);
          }
          g.items.slice(0, MAX_ITEMS).forEach((it) => {
            const row = document.createElement('div');
            row.className = 'check-row';
            const label = document.createElement('span');
            label.className = 'check-text';
            label.textContent = it.text;
            row.appendChild(label);
            if (it.el) {
              const go = document.createElement('button');
              go.type = 'button';
              go.className = 'check-go';
              go.textContent = t('ui.check.goto', 'Ir até');
              go.addEventListener('click', () => {
                try { it.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
                ES.select(it.el);
              });
              row.appendChild(go);
            }
            if (it.fix) {
              const fix = document.createElement('button');
              fix.type = 'button';
              fix.className = 'check-fix';
              fix.textContent = it.fix.label;
              fix.addEventListener('click', () => { it.fix.run(); fix.disabled = true; fix.textContent = t('ui.check.done', 'feito'); });
              row.appendChild(fix);
            }
            sec.appendChild(row);
          });
          if (g.items.length > MAX_ITEMS) {
            const more = document.createElement('div');
            more.className = 'check-why';
            more.textContent = t('ui.check.more', 'e mais {n}…', { n: g.items.length - MAX_ITEMS });
            sec.appendChild(more);
          }
          body.appendChild(sec);
        });
      },
    });
  }

  return { run, show, errorCount };
})();
