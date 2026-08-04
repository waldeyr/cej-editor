// "Novo ato a partir de um ato existente" — the way these users have always
// worked: open a published act, keep the skeleton, replace the content.
//
// The models come from the portal rather than from files bundled here. A
// bundled copy would go stale the moment the standard shifts, and the portal
// is the authority on what a current act looks like.
window.ActTemplate = (function() {
  const ES = window.EditorState;

  // Starting points, by act type. Only addresses — the content is fetched.
  const SUGESTOES = [
    { tipo: 'Decreto', url: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/D12846.htm' },
    { tipo: 'Lei', url: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15321.htm' },
    { tipo: 'Lei Complementar', url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp179.htm' },
    { tipo: 'Medida Provisória', url: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/mpv/mpv1306.htm' },
  ];

  // I18N.t is (path, vars, fallback) and its formatter blanks every {k} when
  // vars is missing — so the vars must go through it, not be substituted after.
  function t(path, fallback, vars) {
    try { return window.I18N.t(path, vars || null, fallback); }
    catch (_) { return fallback; }
  }

  // ---- Step 1: pick a starting act ----
  async function start() {
    let url = '';
    let input = null;
    const ok = await window.Dialog.custom({
      title: t('ui.template.title', 'Novo ato a partir de um ato existente'),
      message: t('ui.template.message',
        'Cole o endereço de um ato publicado no portal. O editor abre esse ato para você transformá-lo no novo.'),
      icon: 'file-plus-2',
      wide: true,
      confirmLabel: t('ui.template.open', 'Abrir'),
      build(body, ctx) {
        body.innerHTML = '<label class="link-field"><span class="link-label"></span>' +
          '<input type="text" class="dialog-input" id="tpl-url" spellcheck="false"></label>' +
          '<div class="link-readout" id="tpl-readout"></div>' +
          '<div class="link-section"><div class="link-section-head"></div><div class="link-section-list" id="tpl-list"></div></div>';
        body.querySelector('.link-label').textContent = t('ui.template.addressLabel', 'Endereço do ato');
        body.querySelector('.link-section-head').textContent = t('ui.template.suggestions', 'Ou comece por um destes');
        input = body.querySelector('#tpl-url');
        input.placeholder = 'https://www.planalto.gov.br/ccivil_03/…';
        const readout = body.querySelector('#tpl-readout');
        const sync = () => {
          url = input.value.trim();
          const d = window.LinkTool.describeUrl(url);
          readout.textContent = url ? (d ? d.text : t('ui.template.unknown', 'Endereço fora do padrão do portal.')) : '';
          readout.className = 'link-readout' + (url ? (d ? ' known' : ' unknown') : '');
        };
        input.addEventListener('input', sync);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ctx.close(true); } });
        const list = body.querySelector('#tpl-list');
        SUGESTOES.forEach((s) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'link-row';
          b.innerHTML = '<span class="link-row-main"></span><span class="link-row-sub"></span>';
          b.querySelector('.link-row-main').textContent = s.tipo;
          b.querySelector('.link-row-sub').textContent = s.url;
          b.addEventListener('click', () => { input.value = s.url; sync(); input.focus(); });
          list.appendChild(b);
        });
        setTimeout(() => input.focus(), 40);
      },
    });
    if (!ok || !url) return;

    await window.FileOps.importUrl(url);
    // importUrl loads asynchronously into the canvas; wait for the document.
    await waitForDoc();
    await offerGut();
  }

  function waitForDoc() {
    return new Promise((resolve) => {
      if (ES.state.doc && ES.state.doc.body && ES.state.doc.body.children.length) return resolve();
      let done = false;
      const off = ES.on((evt) => {
        if (done) return;
        if (evt === 'doc-replaced' || evt === 'doc-changed') {
          done = true; off(); setTimeout(resolve, 60);
        }
      });
      setTimeout(() => { if (!done) { done = true; off(); resolve(); } }, 8000);
    });
  }

  // ---- Step 2: keep the skeleton, drop the content ----
  async function offerGut() {
    const doc = ES.state.doc;
    if (!doc) return;
    const rows = window.ActFormat.outline(doc);

    const escolhas = { corpo: true, anexos: true, ementa: false, epigrafe: false, dou: false };
    const contagem = {
      corpo: rows.filter(r => ['artigo', 'paragrafo', 'paragrafoUnico', 'inciso', 'alinea'].includes(r.kind)).length,
      anexos: rows.filter(r => r.kind === 'anexo').length,
    };

    const ok = await window.Dialog.custom({
      title: t('ui.template.gutTitle', 'Manter só a estrutura?'),
      message: t('ui.template.gutMessage',
        'Marque o que deve ser apagado. O cabeçalho com o brasão, o preâmbulo e as assinaturas são mantidos como modelo.'),
      icon: 'eraser',
      wide: true,
      confirmLabel: t('ui.template.gutConfirm', 'Preparar o ato novo'),
      build(body) {
        const opts = [
          ['corpo', t('ui.template.gutCorpo', 'Apagar os artigos ({n} dispositivos)', { n: contagem.corpo })],
          ['anexos', t('ui.template.gutAnexos', 'Apagar os anexos ({n})', { n: contagem.anexos })],
          ['ementa', t('ui.template.gutEmenta', 'Limpar a ementa')],
          ['epigrafe', t('ui.template.gutEpigrafe', 'Limpar a epígrafe (número e data)')],
          ['dou', t('ui.template.gutDou', 'Apagar a nota do DOU')],
        ];
        const wrap = document.createElement('div');
        wrap.className = 'tpl-opts';
        opts.forEach(([k, labelText]) => {
          const row = document.createElement('label');
          row.className = 'tpl-opt';
          row.innerHTML = '<input type="checkbox"><span></span>';
          const cb = row.querySelector('input');
          cb.checked = escolhas[k];
          cb.addEventListener('change', () => { escolhas[k] = cb.checked; });
          row.querySelector('span').textContent = labelText;
          wrap.appendChild(row);
        });
        body.appendChild(wrap);
      },
    });
    if (!ok) return;

    gut(doc, escolhas, rows);
    await rebaseline();
  }

  function gut(doc, escolhas, rows) {
    const remover = [];
    if (escolhas.corpo) {
      rows.filter(r => ['artigo', 'paragrafo', 'paragrafoUnico', 'inciso', 'alinea', 'item'].includes(r.kind))
        .forEach(r => remover.push(r.el));
    }
    if (escolhas.dou) rows.filter(r => r.kind === 'notaDou').forEach(r => remover.push(r.el));

    if (escolhas.anexos) {
      // An annex is its title plus everything up to the next annex title —
      // in practice the tables and centred paragraphs that follow it.
      const titulos = rows.filter(r => r.kind === 'anexo').map(r => r.el);
      titulos.forEach((titulo) => {
        remover.push(titulo);
        let n = titulo.nextElementSibling;
        while (n && !titulos.includes(n)) {
          const next = n.nextElementSibling;
          remover.push(n);
          n = next;
        }
      });
      doc.querySelectorAll('table.MsoNormalTable').forEach(tb => {
        const holder = tb.closest('div[align="center"]') || tb;
        remover.push(holder);
      });
    }

    remover.forEach((el) => { if (el && el.isConnected) el.remove(); });

    if (escolhas.ementa) clearText(rows.find(r => r.kind === 'ementa'));
    if (escolhas.epigrafe) clearText(rows.find(r => r.kind === 'epigrafe'));

    // Leave one empty body paragraph so the user has somewhere to start.
    if (escolhas.corpo) {
      const p = doc.createElement('div');
      p.innerHTML = window.ActFormat.sampleHtml('artigo');
      const ancora = rows.find(r => r.kind === 'decreta');
      const alvo = ancora && ancora.el && ancora.el.isConnected ? ancora.el : null;
      const novo = p.firstElementChild;
      if (alvo && alvo.parentNode) alvo.parentNode.insertBefore(novo, alvo.nextSibling);
      else doc.body.appendChild(novo);
    }
  }

  function clearText(row) {
    if (!row || !row.el || !row.el.isConnected) return;
    // Keep the wrapper markup (it carries the recipe); empty only the words.
    const walker = row.el.ownerDocument.createTreeWalker(row.el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach((tn, i) => { tn.nodeValue = i === 0 ? '' : ''; });
  }

  // ---- Step 3: the step everyone gets wrong ----
  async function rebaseline() {
    // Ask file.js to splice the gutting into the portal's source ONE time,
    // then make that the new baseline. Without this every later save asks
    // spliceEditIntoSource to align a gutted body against the original 3.4 MB
    // document: the common prefix/suffix collapses, the "changed middle"
    // becomes the whole file, and each save rewrites megabytes.
    ES.setDirty(true);
    const gutted = window.FileOps.currentHtml();

    // Drop the file handle: Ctrl+S must never overwrite the act we borrowed.
    ES.setFile(null, 'novo-ato.html');
    ES.state.sourceHtml = gutted;
    ES.state.originalBytes = null;
    await window.ModeSwitch.loadIntoInitialMode(gutted);
    ES.setDirty(true);
    window.ActFormat.invalidate();

    toast(t('ui.template.ready',
      'Ato preparado. Ele ainda não tem arquivo — use "Salvar como" para gravar o ato novo.'), 'success');
  }

  function toast(msg, type) {
    const host = document.getElementById('toasts');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => el.remove(), 6000);
  }

  return { start };
})();
