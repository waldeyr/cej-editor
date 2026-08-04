// Component library — categorized draggable blocks. `icon` is a Lucide icon name.
//
// A block carries ONE of:
//   `role`   — a part of a normative act; the markup comes from the recipe
//              catalogue in js/act-format.js, resolved lazily at drag time so
//              a recipe change propagates without touching this file.
//   `action` — a tile that runs a PageTools/tool command (js/page-tools.js).
//   `html`   — literal markup (the generic web blocks).
//
// `group` decides which collapsible section the tile lands in: 'ato' is what
// these users need every day and is open; 'avancado' holds the generic web
// page blocks and starts collapsed.
window.Blocks = (function() {
  const blocks = [
    // ================= PEÇAS DO ATO =================
    // ---- Abertura ----
    { group: 'ato', cat: 'Abertura', labelKey: 'ui.act.pieces.cabecalho', name: 'Cabeçalho com brasão', icon: 'landmark', action: 'cabecalho' },
    { group: 'ato', cat: 'Abertura', labelKey: 'ui.act.roles.epigrafe.label', name: 'Epígrafe', icon: 'file-signature', role: 'epigrafe' },
    { group: 'ato', cat: 'Abertura', labelKey: 'ui.act.roles.ementa.label', name: 'Ementa', icon: 'align-right', role: 'ementa' },
    { group: 'ato', cat: 'Abertura', labelKey: 'ui.act.roles.preambulo.label', name: 'Preâmbulo', icon: 'text-quote', role: 'preambulo' },

    // ---- Corpo ----
    { group: 'ato', cat: 'Corpo', labelKey: 'ui.act.roles.artigo.label', name: 'Artigo', icon: 'file-text', role: 'artigo' },
    { group: 'ato', cat: 'Corpo', labelKey: 'ui.act.roles.paragrafo.label', name: 'Parágrafo', icon: 'section', role: 'paragrafo' },
    { group: 'ato', cat: 'Corpo', labelKey: 'ui.act.roles.paragrafoUnico.label', name: 'Parágrafo único', icon: 'section', role: 'paragrafoUnico' },
    { group: 'ato', cat: 'Corpo', labelKey: 'ui.act.roles.inciso.label', name: 'Inciso', icon: 'list', role: 'inciso' },
    { group: 'ato', cat: 'Corpo', labelKey: 'ui.act.roles.alinea.label', name: 'Alínea', icon: 'list-ordered', role: 'alinea' },
    { group: 'ato', cat: 'Corpo', labelKey: 'ui.act.roles.item.label', name: 'Item', icon: 'list-tree', role: 'item' },
    { group: 'ato', cat: 'Corpo', labelKey: 'ui.act.roles.citacao.label', name: 'Citação de outro ato', icon: 'quote', role: 'citacao' },

    // ---- Fecho ----
    { group: 'ato', cat: 'Fecho', labelKey: 'ui.act.roles.dataLocal.label', name: 'Data e local', icon: 'calendar', role: 'dataLocal' },
    { group: 'ato', cat: 'Fecho', labelKey: 'ui.act.roles.assinaturaPresidente.label', name: 'Assinatura do Presidente', icon: 'pen-line', role: 'assinaturaPresidente' },
    { group: 'ato', cat: 'Fecho', labelKey: 'ui.act.roles.assinaturaMinistro.label', name: 'Assinatura de Ministro', icon: 'pen-tool', role: 'assinaturaMinistro' },
    { group: 'ato', cat: 'Fecho', labelKey: 'ui.act.roles.notaDou.label', name: 'Nota do DOU', icon: 'newspaper', role: 'notaDou' },

    // ---- Anexos ----
    { group: 'ato', cat: 'Anexos', labelKey: 'ui.act.roles.anexoTitulo.label', name: 'Título de anexo', icon: 'paperclip', role: 'anexoTitulo' },
    { group: 'ato', cat: 'Anexos', labelKey: 'ui.act.pieces.tabelaAnexo', name: 'Tabela de anexo', icon: 'table', action: 'tabela-anexo' },

    // ---- Ferramentas ----
    { group: 'ato', cat: 'Ferramentas', labelKey: 'ui.act.pieces.ancora', name: 'Bookmark', icon: 'bookmark', action: 'anchor' },
    { group: 'ato', cat: 'Ferramentas', labelKey: 'ui.act.pieces.link', name: 'Link', icon: 'link', action: 'link' },
    { group: 'ato', cat: 'Ferramentas', labelKey: 'ui.act.pieces.colar', name: 'Colar do Word', icon: 'clipboard-paste', action: 'paste-word' },
    { group: 'ato', cat: 'Ferramentas', labelKey: 'ui.act.pieces.titulo', name: 'Page title', icon: 'file-type', action: 'page-title' },
    { group: 'ato', cat: 'Ferramentas', labelKey: 'ui.act.pieces.conferir', name: 'Conferir', icon: 'list-checks', action: 'check' },

    // ================= AVANÇADO (páginas web comuns) =================
    // ---- Page & links ---- (FrontPage's Insert > Bookmark / Page properties)
    { group: 'avancado', cat: 'Page & links', name: 'E-mail link', icon: 'mail', html: '<a href="mailto:nome@exemplo.gov.br">nome@exemplo.gov.br</a>' },
    { group: 'avancado', cat: 'Page & links', name: 'Back to top', icon: 'arrow-up-to-line', html: '<p><a href="#top">Back to top</a></p>' },

    // ---- Typography ----
    { group: 'avancado', cat: 'Typography', name: 'Heading 1', icon: 'heading-1', html: '<h1>Heading 1</h1>' },
    { group: 'avancado', cat: 'Typography', name: 'Heading 2', icon: 'heading-2', html: '<h2>Heading 2</h2>' },
    { group: 'avancado', cat: 'Typography', name: 'Heading 3', icon: 'heading-3', html: '<h3>Heading 3</h3>' },
    { group: 'avancado', cat: 'Typography', name: 'Paragraph', icon: 'pilcrow', html: '<p>Write something thoughtful here. Click to edit.</p>' },
    { group: 'avancado', cat: 'Typography', name: 'Blockquote', icon: 'quote', html: '<blockquote style="border-left:4px solid currentColor;padding:8px 16px;margin:16px 0;opacity:0.75;">A meaningful quote.</blockquote>' },
    { group: 'avancado', cat: 'Typography', name: 'Code', icon: 'code', html: '<pre style="background:#0a0a0a;color:#fafafa;padding:14px;border-radius:8px;overflow:auto;font-family:ui-monospace,monospace;"><code>console.log("hello");</code></pre>' },
    { group: 'avancado', cat: 'Typography', name: 'Inline code', icon: 'code-xml', html: '<code style="background:#f4f4f5;padding:2px 6px;border-radius:4px;font-family:ui-monospace,monospace;">code</code>' },
    { group: 'avancado', cat: 'Typography', name: 'Divider', icon: 'minus', html: '<hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;">' },

    // ---- Layout ----
    { group: 'avancado', cat: 'Layout', name: 'Container', icon: 'square', html: '<div style="max-width:1100px;margin:0 auto;padding:24px;">Container</div>' },
    { group: 'avancado', cat: 'Layout', name: 'Section', icon: 'rectangle-horizontal', html: '<section style="padding:48px 24px;"><div style="max-width:1100px;margin:0 auto;"><h2>Section title</h2><p>Section content goes here.</p></div></section>' },
    { group: 'avancado', cat: 'Layout', name: '2 columns', icon: 'columns-2', html: '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:24px;"><div>Column one</div><div>Column two</div></div>' },
    { group: 'avancado', cat: 'Layout', name: '3 columns', icon: 'columns-3', html: '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;padding:24px;"><div>Col 1</div><div>Col 2</div><div>Col 3</div></div>' },
    { group: 'avancado', cat: 'Layout', name: 'Flex row', icon: 'move-horizontal', html: '<div style="display:flex;gap:16px;align-items:center;padding:16px;"><div>Item 1</div><div>Item 2</div><div>Item 3</div></div>' },
    { group: 'avancado', cat: 'Layout', name: 'Flex column', icon: 'move-vertical', html: '<div style="display:flex;flex-direction:column;gap:16px;padding:16px;"><div>Stack 1</div><div>Stack 2</div></div>' },
    { group: 'avancado', cat: 'Layout', name: 'Spacer', icon: 'arrow-down-up', html: '<div style="height:48px;"></div>' },

    // ---- Components ----
    { group: 'avancado', cat: 'Components', name: 'Button', icon: 'square-mouse-pointer', html: '<button style="padding:10px 20px;background:#0a0a0a;color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;">Click me</button>' },
    { group: 'avancado', cat: 'Components', name: 'Card', icon: 'credit-card', html: '<div style="background:white;border:1px solid #e5e5e5;border-radius:12px;padding:24px;box-shadow:0 2px 10px rgba(0,0,0,0.04);max-width:360px;"><h3 style="margin:0 0 8px;">Card title</h3><p style="margin:0;color:#525252;">A short description of what this card contains.</p></div>' },
    { group: 'avancado', cat: 'Components', name: 'Hero', icon: 'sparkles', html: '<section style="padding:96px 24px;text-align:center;background:#0a0a0a;color:white;"><h1 style="font-size:48px;margin:0 0 16px;font-weight:700;letter-spacing:-0.02em;">Big idea</h1><p style="font-size:18px;margin:0 0 24px;opacity:0.7;">A supporting sentence that explains the big idea.</p><button style="padding:12px 24px;background:white;color:#0a0a0a;border:none;border-radius:8px;font-weight:600;cursor:pointer;">Get started</button></section>' },
    { group: 'avancado', cat: 'Components', name: 'CTA banner', icon: 'megaphone', html: '<div style="background:#0a0a0a;color:white;padding:32px 24px;border-radius:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;"><div><h3 style="margin:0 0 4px;">Ready to ship?</h3><p style="margin:0;opacity:0.7;">Try it free for 14 days.</p></div><button style="padding:10px 20px;background:white;color:#0a0a0a;border:none;border-radius:8px;font-weight:600;cursor:pointer;">Start trial</button></div>' },
    { group: 'avancado', cat: 'Components', name: 'Feature row', icon: 'star', html: '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:32px;padding:48px 24px;"><div><h3 style="margin:0 0 8px;">Fast</h3><p style="margin:0;color:#525252;">Built for speed.</p></div><div><h3 style="margin:0 0 8px;">Secure</h3><p style="margin:0;color:#525252;">Encrypted end-to-end.</p></div><div><h3 style="margin:0 0 8px;">Focused</h3><p style="margin:0;color:#525252;">No bloat.</p></div></div>' },
    { group: 'avancado', cat: 'Components', name: 'Stat', icon: 'bar-chart-3', html: '<div style="text-align:center;padding:16px;"><div style="font-size:42px;font-weight:700;letter-spacing:-0.02em;">99%</div><div style="color:#525252;font-size:13px;">Uptime</div></div>' },
    { group: 'avancado', cat: 'Components', name: 'Badge', icon: 'tag', html: '<span style="display:inline-block;padding:3px 10px;background:#f4f4f5;color:#0a0a0a;border-radius:12px;font-size:12px;font-weight:600;">New</span>' },
    { group: 'avancado', cat: 'Components', name: 'Alert', icon: 'triangle-alert', html: '<div style="padding:12px 16px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:6px;color:#7a4f00;">Heads up — important info goes here.</div>' },

    // ---- Media ----
    { group: 'avancado', cat: 'Media', name: 'Image', icon: 'image', html: '<img src="https://picsum.photos/600/400" alt="Placeholder" style="max-width:100%;height:auto;display:block;border-radius:8px;">' },
    { group: 'avancado', cat: 'Media', name: 'Video', icon: 'video', html: '<video controls style="max-width:100%;border-radius:8px;"><source src="" type="video/mp4">Your browser does not support video.</video>' },
    { group: 'avancado', cat: 'Media', name: 'YouTube', icon: 'monitor-play', html: '<div style="position:relative;padding-bottom:56.25%;height:0;border-radius:8px;overflow:hidden;"><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" style="position:absolute;inset:0;width:100%;height:100%;border:0;" allowfullscreen></iframe></div>' },
    { group: 'avancado', cat: 'Media', name: 'Audio', icon: 'music', html: '<audio controls style="width:100%;"><source src="" type="audio/mpeg">Your browser does not support audio.</audio>' },
    { group: 'avancado', cat: 'Media', name: 'Figure', icon: 'image-plus', html: '<figure style="margin:24px 0;"><img src="https://picsum.photos/700/400" alt="" style="max-width:100%;height:auto;display:block;border-radius:8px;"><figcaption style="margin-top:8px;color:#525252;font-size:13px;text-align:center;">Image caption</figcaption></figure>' },

    // ---- Lists ----
    { group: 'avancado', cat: 'Lists', name: 'Bullet list', icon: 'list', html: '<ul style="padding-left:24px;line-height:1.7;"><li>First item</li><li>Second item</li><li>Third item</li></ul>' },
    { group: 'avancado', cat: 'Lists', name: 'Numbered list', icon: 'list-ordered', html: '<ol style="padding-left:24px;line-height:1.7;"><li>Step one</li><li>Step two</li><li>Step three</li></ol>' },
    { group: 'avancado', cat: 'Lists', name: 'Definition list', icon: 'list-tree', html: '<dl><dt style="font-weight:600;">Term</dt><dd style="margin:0 0 12px 16px;color:#525252;">Definition of the term.</dd></dl>' },

    // ---- Forms ----
    { group: 'avancado', cat: 'Forms', name: 'Form', icon: 'file-text', html: '<form style="display:flex;flex-direction:column;gap:12px;max-width:400px;"><input type="text" placeholder="Your name" style="padding:10px 12px;border:1px solid #e5e5e5;border-radius:6px;font-size:14px;"><input type="email" placeholder="Email" style="padding:10px 12px;border:1px solid #e5e5e5;border-radius:6px;font-size:14px;"><textarea placeholder="Message" rows="4" style="padding:10px 12px;border:1px solid #e5e5e5;border-radius:6px;font-size:14px;resize:vertical;"></textarea><button type="submit" style="padding:10px 16px;background:#0a0a0a;color:white;border:none;border-radius:6px;font-weight:600;cursor:pointer;">Submit</button></form>' },
    { group: 'avancado', cat: 'Forms', name: 'Text input', icon: 'text-cursor-input', html: '<input type="text" placeholder="Type here…" style="padding:10px 12px;border:1px solid #e5e5e5;border-radius:6px;font-size:14px;width:240px;">' },
    { group: 'avancado', cat: 'Forms', name: 'Textarea', icon: 'align-left', html: '<textarea placeholder="Multi-line…" rows="4" style="padding:10px 12px;border:1px solid #e5e5e5;border-radius:6px;font-size:14px;width:100%;max-width:400px;resize:vertical;"></textarea>' },
    { group: 'avancado', cat: 'Forms', name: 'Select', icon: 'chevron-down', html: '<select style="padding:10px 12px;border:1px solid #e5e5e5;border-radius:6px;font-size:14px;background:white;"><option>Option 1</option><option>Option 2</option><option>Option 3</option></select>' },
    { group: 'avancado', cat: 'Forms', name: 'Checkbox', icon: 'square-check-big', html: '<label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox"> Check me</label>' },
    { group: 'avancado', cat: 'Forms', name: 'Radio', icon: 'circle-dot', html: '<div style="display:flex;flex-direction:column;gap:6px;"><label style="display:inline-flex;align-items:center;gap:8px;"><input type="radio" name="r"> One</label><label style="display:inline-flex;align-items:center;gap:8px;"><input type="radio" name="r"> Two</label></div>' },

    // ---- Navigation ----
    { group: 'avancado', cat: 'Navigation', name: 'Navbar', icon: 'menu', html: '<nav style="display:flex;justify-content:space-between;align-items:center;padding:16px 24px;background:white;border-bottom:1px solid #e5e5e5;"><div style="font-weight:700;font-size:18px;">Brand</div><div style="display:flex;gap:24px;"><a href="#" style="color:#0a0a0a;text-decoration:none;">Home</a><a href="#" style="color:#0a0a0a;text-decoration:none;">About</a><a href="#" style="color:#0a0a0a;text-decoration:none;">Contact</a></div></nav>' },
    { group: 'avancado', cat: 'Navigation', name: 'Footer', icon: 'panel-bottom', html: '<footer style="padding:32px 24px;background:#0a0a0a;color:#a3a3a3;text-align:center;font-size:13px;">© 2026 Your company · <a href="#" style="color:inherit;">Privacy</a> · <a href="#" style="color:inherit;">Terms</a></footer>' },
    { group: 'avancado', cat: 'Navigation', name: 'Breadcrumbs', icon: 'chevron-right', html: '<nav style="display:flex;gap:6px;font-size:13px;color:#525252;"><a href="#" style="color:inherit;">Home</a><span>›</span><a href="#" style="color:inherit;">Category</a><span>›</span><span>Current</span></nav>' },

    // ---- Tables ----
    { group: 'avancado', cat: 'Tables', name: 'Table', icon: 'table', html: '<table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#fafafa;"><th style="padding:10px;text-align:left;border-bottom:1px solid #e5e5e5;">Name</th><th style="padding:10px;text-align:left;border-bottom:1px solid #e5e5e5;">Value</th></tr></thead><tbody><tr><td style="padding:10px;border-bottom:1px solid #f4f4f5;">Item A</td><td style="padding:10px;border-bottom:1px solid #f4f4f5;">42</td></tr><tr><td style="padding:10px;border-bottom:1px solid #f4f4f5;">Item B</td><td style="padding:10px;border-bottom:1px solid #f4f4f5;">7</td></tr></tbody></table>' },

    // ---- Raw ----
    { group: 'avancado', cat: 'Raw', name: 'Empty div', icon: 'square-dashed', html: '<div></div>' },
    { group: 'avancado', cat: 'Raw', name: 'Empty span', icon: 'mouse-pointer-2', html: '<span></span>' },
    { group: 'avancado', cat: 'Raw', name: 'Custom HTML', icon: 'code-xml', html: '<div>Custom content — edit the HTML directly</div>' },
  ];

  return blocks;
})();
