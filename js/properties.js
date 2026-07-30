// Properties panel (Style, Attributes, HTML tabs)
window.Properties = (function() {
  const ES = window.EditorState;
  const I18N = window.I18N;
  let styleEl, attrsEl, htmlEl;

  function init() {
    styleEl = document.getElementById('props-style');
    attrsEl = document.getElementById('props-attrs');
    htmlEl = document.getElementById('props-html');

    ES.on((evt) => {
      if (evt === 'selection-changed' || evt === 'history' || evt === 'doc-replaced') render();
    });
    window.addEventListener('i18n:changed', render);
    render();
  }

  function render() {
    const sel = ES.state.selected;
    if (!sel) {
      styleEl.className = 'props empty';
      styleEl.innerHTML = I18N.t('ui.props.emptyStyle');
      attrsEl.className = 'props empty';
      attrsEl.innerHTML = I18N.t('ui.props.emptyAttrs');
      htmlEl.className = 'props empty';
      htmlEl.innerHTML = I18N.t('ui.props.emptyHtml');
      return;
    }
    styleEl.className = 'props';
    attrsEl.className = 'props';
    htmlEl.className = 'props';
    renderStyle(sel);
    renderAttrs(sel);
    renderHtml(sel);
  }

  // ---- Style tab ----
  function renderStyle(el) {
    const cs = el.ownerDocument.defaultView.getComputedStyle(el);
    styleEl.innerHTML = '';

    styleEl.appendChild(group(I18N.t('ui.props.typography'), [
      selectRow(I18N.t('ui.props.row.font'), cs.fontFamily.split(',')[0].replace(/['"]/g, ''), [
        'inherit','system-ui','-apple-system, sans-serif','Helvetica, Arial, sans-serif',
        'Georgia, serif','Times New Roman, serif','ui-monospace, monospace',
        'Inter, sans-serif','Roboto, sans-serif'
      ], v => setStyle(el, 'font-family', v === 'inherit' ? '' : v)),
      lengthRow(I18N.t('ui.props.row.size'), cs.fontSize, v => setStyle(el, 'font-size', v)),
      selectRow(I18N.t('ui.props.row.weight'), cs.fontWeight, ['300','400','500','600','700','800','900'], v => setStyle(el, 'font-weight', v)),
      selectRow(I18N.t('ui.props.row.align'), cs.textAlign, ['left','center','right','justify'], v => setStyle(el, 'text-align', v)),
      colorRow(I18N.t('ui.props.row.color'), rgbToHex(cs.color), v => setStyle(el, 'color', v)),
      lengthRow(I18N.t('ui.props.row.lineHeight'), cs.lineHeight === 'normal' ? '' : cs.lineHeight, v => setStyle(el, 'line-height', v)),
      lengthRow(I18N.t('ui.props.row.tracking'), cs.letterSpacing === 'normal' ? '' : cs.letterSpacing, v => setStyle(el, 'letter-spacing', v)),
    ]));

    styleEl.appendChild(group(I18N.t('ui.props.layout'), [
      selectRow(I18N.t('ui.props.row.display'), cs.display, ['block','inline','inline-block','flex','inline-flex','grid','inline-grid','none'], v => setStyle(el, 'display', v)),
      isFlexOrGrid(cs.display) ? selectRow(I18N.t('ui.props.row.direction'), cs.flexDirection, ['row','column','row-reverse','column-reverse'], v => setStyle(el, 'flex-direction', v)) : null,
      isFlexOrGrid(cs.display) ? selectRow(I18N.t('ui.props.row.justify'), cs.justifyContent, ['flex-start','center','flex-end','space-between','space-around','space-evenly'], v => setStyle(el, 'justify-content', v)) : null,
      isFlexOrGrid(cs.display) ? selectRow(I18N.t('ui.props.row.alignItems'), cs.alignItems, ['stretch','flex-start','center','flex-end','baseline'], v => setStyle(el, 'align-items', v)) : null,
      isFlexOrGrid(cs.display) ? lengthRow(I18N.t('ui.props.row.gap'), cs.gap === 'normal' ? '' : cs.gap, v => setStyle(el, 'gap', v)) : null,
      selectRow(I18N.t('ui.props.row.position'), cs.position, ['static','relative','absolute','fixed','sticky'], v => setStyle(el, 'position', v)),
      lengthRow(I18N.t('ui.props.row.width'), cs.width, v => setStyle(el, 'width', v)),
      lengthRow(I18N.t('ui.props.row.height'), cs.height, v => setStyle(el, 'height', v)),
      lengthRow(I18N.t('ui.props.row.maxWidth'), cs.maxWidth === 'none' ? '' : cs.maxWidth, v => setStyle(el, 'max-width', v)),
    ].filter(Boolean)));

    styleEl.appendChild(spacingGroup(el, cs));

    styleEl.appendChild(group(I18N.t('ui.props.background'), [
      colorRow(I18N.t('ui.props.row.color'), rgbToHex(cs.backgroundColor), v => setStyle(el, 'background-color', v)),
      textRow(I18N.t('ui.props.row.image'), extractUrl(cs.backgroundImage), v => setStyle(el, 'background-image', v ? `url("${v}")` : '')),
      selectRow(I18N.t('ui.props.row.size'), cs.backgroundSize, ['auto','cover','contain'], v => setStyle(el, 'background-size', v)),
      selectRow(I18N.t('ui.props.row.position'), cs.backgroundPosition, ['left top','center','right top','center bottom'], v => setStyle(el, 'background-position', v)),
    ]));

    styleEl.appendChild(group(I18N.t('ui.props.border'), [
      lengthRow(I18N.t('ui.props.row.radius'), cs.borderRadius, v => setStyle(el, 'border-radius', v)),
      lengthRow(I18N.t('ui.props.row.width'), cs.borderTopWidth, v => setStyle(el, 'border-width', v)),
      selectRow(I18N.t('ui.props.row.style'), cs.borderTopStyle, ['none','solid','dashed','dotted','double'], v => setStyle(el, 'border-style', v)),
      colorRow(I18N.t('ui.props.row.color'), rgbToHex(cs.borderTopColor), v => setStyle(el, 'border-color', v)),
    ]));

    styleEl.appendChild(group(I18N.t('ui.props.effects'), [
      sliderRow(I18N.t('ui.props.row.opacity'), parseFloat(cs.opacity), 0, 1, 0.01, v => setStyle(el, 'opacity', v)),
      textRow(I18N.t('ui.props.row.shadow'), el.style.boxShadow || '', v => setStyle(el, 'box-shadow', v)),
      textRow(I18N.t('ui.props.row.transform'), el.style.transform || '', v => setStyle(el, 'transform', v)),
      textRow(I18N.t('ui.props.row.cursor'), cs.cursor, v => setStyle(el, 'cursor', v)),
    ]));
  }

  function isFlexOrGrid(d) { return /(flex|grid)/.test(d); }

  function group(title, rows) {
    const g = document.createElement('div');
    g.className = 'prop-group';
    const h = document.createElement('h4');
    h.textContent = title;
    g.appendChild(h);
    rows.forEach(r => g.appendChild(r));
    return g;
  }

  function row(label, input) {
    const r = document.createElement('div');
    r.className = 'prop-row';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    r.appendChild(lbl);
    r.appendChild(input);
    return r;
  }

  function textRow(label, value, onChange) {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = value || '';
    inp.addEventListener('change', () => onChange(inp.value));
    return row(label, inp);
  }
  function lengthRow(label, value, onChange) {
    return textRow(label, value || '', onChange);
  }
  function selectRow(label, value, options, onChange) {
    const sel = document.createElement('select');
    options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      if (o === value) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => onChange(sel.value));
    return row(label, sel);
  }
  function colorRow(label, value, onChange) {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.gap = '4px';
    wrap.style.minWidth = '0';
    const cInp = document.createElement('input');
    cInp.type = 'color';
    cInp.value = value || '#000000';
    cInp.style.width = '40px';
    cInp.style.flexShrink = '0';
    const tInp = document.createElement('input');
    tInp.type = 'text';
    tInp.value = value || '';
    tInp.style.minWidth = '0';
    tInp.style.flex = '1';
    cInp.addEventListener('input', () => { tInp.value = cInp.value; onChange(cInp.value); });
    tInp.addEventListener('change', () => { onChange(tInp.value); if (/^#[0-9a-f]{6}$/i.test(tInp.value)) cInp.value = tInp.value; });
    wrap.appendChild(cInp);
    wrap.appendChild(tInp);
    return row(label, wrap);
  }
  function sliderRow(label, value, min, max, step, onChange) {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.gap = '6px';
    wrap.style.alignItems = 'center';
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = min; inp.max = max; inp.step = step; inp.value = value;
    inp.style.flex = '1';
    const num = document.createElement('span');
    num.textContent = value;
    num.style.fontFamily = 'var(--mono)';
    num.style.fontSize = '11px';
    num.style.minWidth = '32px';
    inp.addEventListener('input', () => { num.textContent = inp.value; onChange(inp.value); });
    wrap.appendChild(inp);
    wrap.appendChild(num);
    return row(label, wrap);
  }

  function spacingGroup(el, cs) {
    const g = document.createElement('div');
    g.className = 'prop-group';
    const h = document.createElement('h4');
    h.textContent = I18N.t('ui.props.spacing');
    g.appendChild(h);

    // Margin outer box, padding inner box
    const outer = document.createElement('div');
    outer.className = 'spacing-box';
    outer.innerHTML = '<span class="sb-label">MARGIN</span>';

    const inner = document.createElement('div');
    inner.className = 'inner-box';
    inner.innerHTML = '<span class="sb-label" style="color:var(--accent);">PADDING</span>content';

    ['Top','Right','Bottom','Left'].forEach((side, i) => {
      const m = document.createElement('input');
      m.value = numFromStyle(cs['margin' + side]);
      m.className = 'sb-' + side[0].toLowerCase();
      m.title = 'margin-' + side.toLowerCase();
      m.addEventListener('change', () => setStyle(el, 'margin-' + side.toLowerCase(), addUnit(m.value)));
      outer.appendChild(m);

      const p = document.createElement('input');
      p.value = numFromStyle(cs['padding' + side]);
      p.className = 'sb-' + side[0].toLowerCase();
      p.title = 'padding-' + side.toLowerCase();
      p.addEventListener('change', () => setStyle(el, 'padding-' + side.toLowerCase(), addUnit(p.value)));
      inner.appendChild(p);
    });

    outer.appendChild(inner);
    g.appendChild(outer);
    return g;
  }

  // ---- Attributes tab ----
  function renderAttrs(el) {
    attrsEl.innerHTML = '';

    // Tag
    attrsEl.appendChild(group(I18N.t('ui.props.element'), [
      textRow(I18N.t('ui.props.row.tag'), el.tagName.toLowerCase(), v => changeTag(el, v)),
      textRow(I18N.t('ui.props.row.id'), el.id || '', v => { if (v) el.id = v; else el.removeAttribute('id'); ES.snapshot('id'); }),
    ]));

    // Classes
    const classesGroup = document.createElement('div');
    classesGroup.className = 'prop-group';
    const ch = document.createElement('h4');
    ch.textContent = I18N.t('ui.props.classes');
    classesGroup.appendChild(ch);

    const chipsBox = document.createElement('div');
    chipsBox.className = 'chips';
    Array.from(el.classList).forEach(cls => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = cls;
      const x = document.createElement('button');
      x.textContent = '×';
      x.addEventListener('click', () => { el.classList.remove(cls); ES.snapshot('class'); render(); });
      chip.appendChild(x);
      chipsBox.appendChild(chip);
    });
    const chipInp = document.createElement('input');
    chipInp.className = 'chip-input';
    chipInp.placeholder = I18N.getLang() === 'pt-BR' ? '+ classe' : '+ class';
    chipInp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && chipInp.value.trim()) {
        const cls = chipInp.value.trim().replace(/\./g, '');
        cls.split(/\s+/).forEach(c => { if (c) el.classList.add(c); });
        chipInp.value = '';
        ES.snapshot('class');
        render();
      }
    });
    chipsBox.appendChild(chipInp);
    classesGroup.appendChild(chipsBox);
    attrsEl.appendChild(classesGroup);

    // Generic attribute editor
    const attrsGroup = document.createElement('div');
    attrsGroup.className = 'prop-group';
    const ah = document.createElement('h4');
    ah.textContent = I18N.t('ui.props.attributes');
    const addBtn = document.createElement('button');
    addBtn.className = 'tool-btn';
    addBtn.style.padding = '2px 8px';
    addBtn.textContent = I18N.t('ui.props.add');
    addBtn.addEventListener('click', async () => {
      const name = await window.Dialog.prompt({
        title: I18N.t('ui.props.addAttrTitle'),
        message: I18N.t('ui.props.addAttrMsg'),
        placeholder: I18N.t('ui.props.addAttrPlaceholder'),
        confirmLabel: I18N.t('ui.props.add'),
      });
      if (name) { el.setAttribute(name, ''); ES.snapshot('attr'); render(); }
    });
    ah.appendChild(addBtn);
    attrsGroup.appendChild(ah);

    Array.from(el.attributes).forEach(attr => {
      if (attr.name === 'class' || attr.name === 'id' || attr.name === 'style' || attr.name === 'data-he-editing') return;
      const r = document.createElement('div');
      r.className = 'prop-row';
      r.style.gridTemplateColumns = '90px 1fr 24px';
      const lbl = document.createElement('label');
      lbl.textContent = attr.name;
      lbl.title = attr.name;
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = attr.value;
      inp.addEventListener('change', () => { el.setAttribute(attr.name, inp.value); ES.snapshot('attr'); });
      const rm = document.createElement('button');
      rm.className = 'tool-btn';
      rm.style.padding = '2px 6px';
      rm.textContent = '×';
      rm.addEventListener('click', () => { el.removeAttribute(attr.name); ES.snapshot('attr'); render(); });
      r.appendChild(lbl);
      r.appendChild(inp);
      r.appendChild(rm);
      attrsGroup.appendChild(r);
    });

    // Common shortcuts
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') {
      attrsGroup.appendChild(quickAttr(el, 'href', I18N.t('ui.props.quick.linkUrl')));
      attrsGroup.appendChild(quickAttr(el, 'target', I18N.t('ui.props.quick.target')));
    }
    if (tag === 'img') {
      attrsGroup.appendChild(quickAttr(el, 'src', I18N.t('ui.props.quick.imageUrl')));
      attrsGroup.appendChild(quickAttr(el, 'alt', I18N.t('ui.props.quick.altText')));
    }
    if (['input','textarea','select'].includes(tag)) {
      attrsGroup.appendChild(quickAttr(el, 'placeholder', I18N.t('ui.props.quick.placeholder')));
      attrsGroup.appendChild(quickAttr(el, 'name', I18N.t('ui.props.quick.name')));
    }
    attrsEl.appendChild(attrsGroup);
  }

  function quickAttr(el, name, label) {
    return textRow(label, el.getAttribute(name) || '', v => {
      if (v) el.setAttribute(name, v); else el.removeAttribute(name);
      ES.snapshot('attr');
    });
  }

  function changeTag(el, newTag) {
    if (!newTag || newTag === el.tagName.toLowerCase()) return;
    if (!/^[a-z][a-z0-9-]*$/i.test(newTag)) return;
    const doc = el.ownerDocument;
    const replacement = doc.createElement(newTag);
    Array.from(el.attributes).forEach(a => replacement.setAttribute(a.name, a.value));
    while (el.firstChild) replacement.appendChild(el.firstChild);
    el.replaceWith(replacement);
    ES.snapshot('change tag');
    ES.select(replacement);
  }

  // ---- HTML tab ----
  function renderHtml(el) {
    htmlEl.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'prop-group';
    const h = document.createElement('h4');
    h.textContent = I18N.t('ui.props.rawOuter');
    wrap.appendChild(h);
    const ta = document.createElement('textarea');
    ta.className = 'html-textarea';
    ta.value = formatHtml(el.outerHTML);
    ta.spellcheck = false;
    const btnRow = document.createElement('div');
    btnRow.className = 'btn-row';
    btnRow.style.marginTop = '8px';
    const apply = document.createElement('button');
    apply.className = 'btn-block';
    apply.textContent = I18N.t('ui.props.apply');
    const reset = document.createElement('button');
    reset.className = 'btn-block';
    reset.textContent = I18N.t('ui.props.reset');
    apply.addEventListener('click', () => {
      try {
        const tpl = el.ownerDocument.createElement('template');
        tpl.innerHTML = ta.value.trim();
        const repl = tpl.content.firstElementChild;
        if (!repl) return;
        el.replaceWith(repl);
        ES.snapshot('edit html');
        ES.select(repl);
      } catch (e) {
        window.Dialog.alert({
          title: I18N.t('ui.props.invalidHtmlTitle'),
          message: I18N.t('ui.props.invalidHtmlMsg'),
          danger: true,
        });
      }
    });
    reset.addEventListener('click', () => { ta.value = formatHtml(el.outerHTML); });
    btnRow.appendChild(apply);
    btnRow.appendChild(reset);
    wrap.appendChild(ta);
    wrap.appendChild(btnRow);

    // Inner HTML editor
    const wrap2 = document.createElement('div');
    wrap2.className = 'prop-group';
    const h2 = document.createElement('h4');
    h2.textContent = I18N.t('ui.props.innerHtml');
    wrap2.appendChild(h2);
    const ta2 = document.createElement('textarea');
    ta2.className = 'html-textarea';
    ta2.value = el.innerHTML;
    ta2.spellcheck = false;
    const btnRow2 = document.createElement('div');
    btnRow2.className = 'btn-row';
    btnRow2.style.marginTop = '8px';
    const apply2 = document.createElement('button');
    apply2.className = 'btn-block';
    apply2.textContent = I18N.t('ui.props.apply');
    apply2.addEventListener('click', () => {
      el.innerHTML = ta2.value;
      ES.snapshot('inner html');
    });
    btnRow2.appendChild(apply2);
    wrap2.appendChild(ta2);
    wrap2.appendChild(btnRow2);

    htmlEl.appendChild(wrap);
    htmlEl.appendChild(wrap2);
  }

  // ---- Style writer ----
  // Re-rendering the panel mid-interaction destroys focused inputs (closes
  // native color pickers, drops caret in text fields). So we only re-render
  // for properties that change WHICH controls should be visible (display,
  // position). For everything else (color/size/padding/...), we mutate in
  // place — the user's typed value already reflects what they want.
  const STRUCTURAL_PROPS = new Set(['display', 'position', 'flex-direction']);
  let snapTimer = null;
  function setStyle(el, prop, value) {
    if (value == null || value === '') {
      el.style.removeProperty(prop);
    } else {
      el.style.setProperty(prop, value);
    }
    if (el.getAttribute('style') === '') el.removeAttribute('style');
    if (snapTimer) clearTimeout(snapTimer);
    snapTimer = setTimeout(() => ES.snapshot('style ' + prop), 200);
    ES.setDirty(true);
    if (STRUCTURAL_PROPS.has(prop)) {
      if (window.__heRenderTimer) clearTimeout(window.__heRenderTimer);
      window.__heRenderTimer = setTimeout(render, 200);
    }
  }

  // ---- Helpers ----
  function rgbToHex(rgb) {
    if (!rgb) return '#000000';
    if (rgb.startsWith('#')) return rgb;
    const m = rgb.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (!m) return '#000000';
    return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
  }
  function numFromStyle(v) {
    if (!v || v === 'normal' || v === 'auto') return '';
    const m = v.match(/^(-?[\d.]+)/);
    return m ? m[1] : '';
  }
  function addUnit(v) {
    if (!v) return '';
    if (/^-?[\d.]+$/.test(v)) return v + 'px';
    return v;
  }
  function extractUrl(bg) {
    if (!bg || bg === 'none') return '';
    const m = bg.match(/url\(['"]?([^'")]+)/);
    return m ? m[1] : '';
  }
  function formatHtml(html) {
    // Quick & dirty pretty print
    let out = '';
    let depth = 0;
    const tokens = html.replace(/>\s*</g, '>\n<').split('\n');
    tokens.forEach(line => {
      const opening = /^<[^\/!]/.test(line) && !/\/>$/.test(line);
      const closing = /^<\//.test(line);
      if (closing) depth = Math.max(0, depth - 1);
      out += '  '.repeat(depth) + line + '\n';
      if (opening && !/<(img|br|hr|input|meta|link|source|area|base|col|embed|param|track|wbr)/i.test(line)) {
        // self-contained tag pair on one line? skip indent
        if (!/<\/[a-z]/i.test(line)) depth++;
      }
    });
    return out.trim();
  }

  return { init };
})();
