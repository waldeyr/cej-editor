// Custom alert / confirm / prompt — Promise-based, themed to match the
// editor, animated, keyboard-friendly (Enter confirms, Esc cancels).
// Replaces the ugly native dialogs.
window.Dialog = (function() {
  const I18N = window.I18N;

  // Open dialogs, oldest first. Only the topmost one reacts to Enter/Escape,
  // so a prompt opened *from* a dialog (rename inside the bookmark manager)
  // doesn't close its parent too.
  const stack = [];

  function ensureHost() {
    let host = document.getElementById('dialog-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'dialog-host';
      document.body.appendChild(host);
    }
    return host;
  }

  function open(opts) {
    return new Promise((resolve) => {
      const host = ensureHost();

      const overlay = document.createElement('div');
      overlay.className = 'dialog-overlay';
      const panel = document.createElement('div');
      panel.className = 'dialog-panel' + (opts.danger ? ' danger' : '') + (opts.wide ? ' wide' : '');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');

      const icon = opts.icon || (opts.kind === 'prompt' ? 'pencil-line' :
                                  opts.danger ? 'triangle-alert' :
                                  opts.kind === 'confirm' ? 'circle-help' : 'info');

      panel.innerHTML = `
        <div class="dialog-head">
          <div class="dialog-icon"><i data-lucide="${icon}"></i></div>
          <div class="dialog-titles">
            ${opts.title ? `<h3 class="dialog-title"></h3>` : ''}
            ${opts.message ? `<p class="dialog-message"></p>` : ''}
          </div>
        </div>
        ${opts.kind === 'prompt' ? `
          <div class="dialog-body">
            <input type="text" class="dialog-input" placeholder="${escapeAttr(opts.placeholder || '')}" />
          </div>` : ''}
        ${opts.kind === 'custom' ? `<div class="dialog-body dialog-custom"></div>` : ''}
        <div class="dialog-actions">
          ${opts.kind !== 'alert' ? `<button class="dialog-btn dialog-btn-secondary" data-act="cancel">${escapeHtml(opts.cancelLabel || I18N.t('ui.file.cancel'))}</button>` : ''}
          ${opts.hideConfirm ? '' : `<button class="dialog-btn dialog-btn-primary${opts.danger ? ' danger' : ''}" data-act="confirm">${escapeHtml(opts.confirmLabel || (opts.kind === 'alert' ? 'OK' : (I18N.getLang() === 'pt-BR' ? 'Confirmar' : 'Confirm')))}</button>`}
        </div>
      `;
      if (opts.title) panel.querySelector('.dialog-title').textContent = opts.title;
      if (opts.message) panel.querySelector('.dialog-message').textContent = opts.message;

      overlay.appendChild(panel);
      host.appendChild(overlay);
      stack.push(overlay);

      let resolved = false;
      function finish(value) {
        if (resolved) return;
        resolved = true;
        document.removeEventListener('keydown', onKey, true);
        const i = stack.indexOf(overlay);
        if (i !== -1) stack.splice(i, 1);
        overlay.classList.add('closing');
        setTimeout(() => overlay.remove(), 140);
        resolve(value);
      }

      const confirmBtn = panel.querySelector('[data-act="confirm"]');
      const customBody = panel.querySelector('.dialog-custom');
      if (customBody && typeof opts.build === 'function') {
        opts.build(customBody, { close: finish, panel });
      }

      // Only a prompt owns the built-in input. A custom body may style its own
      // fields with .dialog-input, and those must not be reset to defaultValue.
      const input = opts.kind === 'prompt' ? panel.querySelector('.dialog-input') : null;
      if (input) {
        input.value = opts.defaultValue || '';
        setTimeout(() => { input.focus(); input.select(); }, 30);
      } else {
        const first = (customBody && customBody.querySelector('input, button, [tabindex]')) || confirmBtn;
        if (first) setTimeout(() => first.focus(), 30);
      }

      function onKey(e) {
        if (stack[stack.length - 1] !== overlay) return; // only the topmost dialog reacts
        if (e.key === 'Escape') {
          e.preventDefault();
          finish(opts.kind === 'prompt' ? null : false);
        } else if (e.key === 'Enter' && !e.shiftKey) {
          // Enter from input or anywhere in dialog confirms — except inside a
          // custom body, where Enter belongs to whatever the body built.
          if (e.target.closest('.dialog-custom')) return;
          if (e.target.closest('.dialog-panel')) {
            e.preventDefault();
            doConfirm();
          }
        }
      }
      document.addEventListener('keydown', onKey, true);

      function doConfirm() {
        if (opts.kind === 'prompt') {
          finish(input ? input.value : '');
        } else if (opts.kind === 'alert') {
          finish();
        } else {
          finish(true);
        }
      }
      function doCancel() {
        finish(opts.kind === 'prompt' ? null : false);
      }

      if (confirmBtn) confirmBtn.addEventListener('click', doConfirm);
      const cancelBtn = panel.querySelector('[data-act="cancel"]');
      if (cancelBtn) cancelBtn.addEventListener('click', doCancel);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) doCancel();
      });

      if (window.renderIcons) window.renderIcons();
    });
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
  function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }

  return {
    alert(opts)   { return open({ ...(typeof opts === 'string' ? { message: opts } : opts), kind: 'alert' }); },
    confirm(opts) { return open({ ...(typeof opts === 'string' ? { message: opts } : opts), kind: 'confirm' }); },
    prompt(opts)  { return open({ ...(typeof opts === 'string' ? { message: opts } : opts), kind: 'prompt' }); },
    // Same chrome, but the body is built by the caller:
    //   Dialog.custom({ title, message, build(bodyEl, { close, panel }) })
    // Resolves true on confirm, false on cancel/Esc/backdrop.
    custom(opts)  { return open({ ...opts, kind: 'custom' }); },
  };
})();
