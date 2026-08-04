// "Este trecho" — what the caret is sitting in, said in plain Portuguese.
//
// The right sidebar used to open on Attributes: a tag name field, an id field,
// class chips and a generic attribute table. That is the correct panel for
// someone who knows HTML, and the wrong first thing to show someone whose
// expertise is legislative drafting. It is still there, one tab over, under
// "Avançado".
window.PiecePanel = (function() {
  const ES = window.EditorState;
  let host, pending = false;

  // I18N.t is (path, vars, fallback) and its formatter blanks every {k} when
  // vars is missing — so the vars must go through it, not be substituted after.
  function t(path, fallback, vars) {
    try { return window.I18N.t(path, vars || null, fallback); }
    catch (_) { return fallback; }
  }

  function init() {
    host = document.getElementById('piece-panel');
    if (!host) return;
    ES.on((evt) => {
      if (evt === 'caret-changed' || evt === 'selection-changed' ||
          evt === 'history' || evt === 'doc-replaced' || evt === 'doc-changed') schedule();
    });
    window.addEventListener('i18n:changed', render);
    render();
  }

  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; render(); });
  }

  function render() {
    if (!host) return;
    host.innerHTML = '';
    const ctx = window.ActFormat.context();
    const block = ctx.block;
    if (!block) {
      note(t('ui.piece.nothing', 'Clique num parágrafo do ato para ver o que ele é e o que dá para fazer com ele.'));
      return;
    }

    const info = window.ActFormat.inspect(block);
    host.appendChild(identity(info, block));
    host.appendChild(actions(info, block, ctx));
    const links = linksSection(block);
    if (links) host.appendChild(links);
    host.appendChild(anchorSection(info, block));
    host.appendChild(textSection(block));
    if (window.renderIcons) window.renderIcons();
  }

  // ---- What is this? ----
  function identity(info, block) {
    const g = group(t('ui.piece.whatIs', 'O que é este trecho'));

    const big = document.createElement('div');
    big.className = 'piece-identity';
    const nome = info.dispositivo ? info.dispositivo.label
      : (info.formato.roleId ? window.ActFormat.label(info.formato.roleId)
                             : t('ui.piece.unknown', 'Trecho sem papel reconhecido'));
    big.textContent = nome;
    g.appendChild(big);

    const fmt = document.createElement('div');
    fmt.className = 'piece-format';
    if (!info.formato.roleId) {
      fmt.classList.add('warn');
      fmt.textContent = t('ui.piece.noFormat',
        'A formatação não corresponde a nenhum padrão do ato. Escolha um na barra acima.');
    } else if (info.formato.confidence === 'exata') {
      fmt.textContent = t('ui.piece.exact', 'Formatado como {role}, exatamente no padrão.',
        { role: window.ActFormat.label(info.formato.roleId) });
    } else {
      fmt.classList.add('near');
      fmt.textContent = t('ui.piece.near', 'Parecido com {role}, mas com {n} diferença(s).',
        { role: window.ActFormat.label(info.formato.roleId), n: info.formato.diffs.length });
      const det = document.createElement('details');
      det.className = 'piece-diffs';
      const sum = document.createElement('summary');
      sum.textContent = t('ui.piece.seeDiffs', 'Ver as diferenças');
      det.appendChild(sum);
      info.formato.diffs.forEach((d) => {
        const li = document.createElement('div');
        li.className = 'piece-diff';
        li.textContent = d.prop + ': ' + (d.got === null
          ? t('ui.piece.diffMissing', 'ausente') : d.got) + ' → ' + d.want;
        det.appendChild(li);
      });
      fmt.appendChild(det);
      const fix = button(t('ui.piece.fixFormat', 'Ajustar para o padrão'), 'wand-2', () => {
        window.ActFormat.applyRole(info.formato.roleId, block, { force: true, noText: true });
      });
      fmt.appendChild(fix);
    }
    g.appendChild(fmt);
    return g;
  }

  // ---- Big obvious buttons ----
  function actions(info, block, ctx) {
    const g = group(t('ui.piece.actions', 'Ações'));

    g.appendChild(button(t('ui.piece.makeLink', 'Transformar em link'), 'link', () => {
      window.LinkTool.open();
    }, !ctx.range));

    g.appendChild(button(t('ui.piece.addAnchor', 'Criar âncora aqui'), 'bookmark', () => {
      ES.select(block);
      window.PageTools.openAnchorDialog();
    }));

    if (info.agreement === 'sem-ancora' && info.dispositivo && info.dispositivo.anchorSuggestion) {
      // The one-click version of the most common real defect.
      const s = info.dispositivo.anchorSuggestion;
      const quick = button(t('ui.piece.quickAnchor', 'Criar a âncora #{s}', { s }), 'zap', () => {
        addAnchorNamed(block, s);
      });
      quick.classList.add('piece-suggest');
      g.appendChild(quick);
    }

    g.appendChild(button(t('ui.piece.pasteWord', 'Colar texto do Word'), 'clipboard-paste', () => {
      window.PasteWord.openColdPaste();
    }));
    return g;
  }

  function addAnchorNamed(block, base) {
    const doc = ES.state.doc;
    const name = window.PageTools.uniqueId(doc, window.PageTools.sanitizeAnchorName(base));
    const a = doc.createElement('a');
    a.setAttribute('name', name);
    const target = block.querySelector('span, font, b') || block;
    target.insertBefore(a, target.firstChild);
    ES.snapshot('âncora');
    window.ActFormat.invalidate();
    toast(t('ui.piece.anchorCreated', 'Âncora #{name} criado.', { name }), 'success');
    render();
  }

  // ---- Links inside this paragraph ----
  function linksSection(block) {
    const links = block.querySelectorAll ? Array.from(block.querySelectorAll('a[href]')) : [];
    if (!links.length) return null;
    const g = group(t('ui.piece.links', 'Links neste trecho') + ' (' + links.length + ')');
    links.slice(0, 40).forEach((a) => {
      const href = a.getAttribute('href') || '';
      const row = document.createElement('div');
      row.className = 'piece-link';
      const txt = document.createElement('span');
      txt.className = 'piece-link-text';
      txt.textContent = window.ActFormat.normText(a.textContent).slice(0, 40) || '(sem texto)';
      const desc = document.createElement('span');
      desc.className = 'piece-link-desc';
      const d = window.LinkTool.describeUrl(href);
      if (d) desc.textContent = d.text;
      else if (href.startsWith('#')) {
        const name = window.PageTools.decodeFragment(href.slice(1));
        const found = window.LinkTool.resolveFragment(ES.state.doc, name);
        desc.textContent = found
          ? t('ui.piece.linkInPage', 'nesta página: {n}', { n: name })
          : t('ui.piece.linkBroken', 'destino inexistente: {n}', { n: name });
        if (!found) desc.classList.add('broken');
      } else desc.textContent = href;
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'piece-link-edit';
      edit.textContent = t('ui.piece.editLink', 'Editar');
      edit.addEventListener('click', () => { ES.select(a); window.LinkTool.open(); });
      row.appendChild(txt); row.appendChild(desc); row.appendChild(edit);
      g.appendChild(row);
    });
    return g;
  }

  // ---- Bookmark ----
  function anchorSection(info, block) {
    const g = group(t('ui.piece.anchor', 'Âncora'));
    if (!info.ancora) {
      const p = document.createElement('div');
      p.className = 'piece-note';
      p.textContent = t('ui.piece.noAnchor', 'Este trecho não tem âncora.');
      g.appendChild(p);
      return g;
    }
    const row = document.createElement('div');
    row.className = 'piece-anchor-row';
    const name = document.createElement('code');
    name.className = 'piece-anchor-name';
    name.textContent = '#' + info.ancora.name;
    row.appendChild(name);

    const item = { el: info.ancora.el, key: info.ancora.name,
                   kind: info.ancora.el.matches && info.ancora.el.matches('a[name]') ? 'anchor' : 'id' };
    row.appendChild(smallBtn(t('ui.piece.copy', 'Copiar'), () => {
      const frag = '#' + window.PageTools.encodeFragment(info.ancora.name);
      if (navigator.clipboard) navigator.clipboard.writeText(frag);
      toast(t('ui.piece.copied', 'Copiado: {f}', { f: frag }), 'success');
    }));
    row.appendChild(smallBtn(t('ui.piece.rename', 'Renomear'), async () => {
      await window.PageTools.renameAnchor(item, null);
      render();
    }));
    row.appendChild(smallBtn(t('ui.piece.remove', 'Remover'), async () => {
      await window.PageTools.removeAnchor(item, null);
      render();
    }));
    g.appendChild(row);
    return g;
  }

  // ---- The words ----
  function textSection(block) {
    const g = group(t('ui.piece.text', 'Texto'));
    const txt = window.ActFormat.normText(block.textContent);
    const box = document.createElement('div');
    box.className = 'piece-text';
    box.textContent = txt || t('ui.piece.emptyText', '(vazio)');
    g.appendChild(box);
    const count = document.createElement('div');
    count.className = 'piece-note';
    count.textContent = t('ui.piece.chars', '{n} caracteres', { n: txt.length });
    g.appendChild(count);
    return g;
  }

  // ---- Small builders ----
  function group(titleText) {
    const g = document.createElement('div');
    g.className = 'prop-group piece-group';
    const h = document.createElement('h4');
    h.textContent = titleText;
    g.appendChild(h);
    return g;
  }

  function button(labelText, icon, onClick, disabled) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-block piece-btn';
    b.innerHTML = '<i data-lucide="' + icon + '"></i><span></span>';
    b.querySelector('span').textContent = labelText;
    if (disabled) b.disabled = true;
    b.addEventListener('click', onClick);
    return b;
  }

  function smallBtn(labelText, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'piece-small';
    b.textContent = labelText;
    b.addEventListener('click', onClick);
    return b;
  }

  function note(msg) {
    const d = document.createElement('div');
    d.className = 'piece-note';
    d.textContent = msg;
    host.appendChild(d);
  }

  function toast(msg, type) {
    const h = document.getElementById('toasts');
    if (!h) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    h.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  return { init, render };
})();
