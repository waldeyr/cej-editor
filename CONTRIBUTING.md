# Contribuindo

Projeto pequeno e de escopo fechado — leia este guia curto antes de abrir um PR.

## Preparação

É um site estático. Não há etapa de build, e toda dependência de execução está
embutida em `vendor/`.

```sh
git clone https://github.com/waldeyr/cej-editor.git
cd cej-editor
python3 -m http.server 8000        # ou: npx serve . / php -S localhost:8000
```

Abra `http://localhost:8000`.

> A File System Access API exige contexto seguro. `localhost` conta como
> seguro, então a gravação direta em disco funciona em desenvolvimento.
> Abrir o `index.html` em `file://` **não** funciona.

## Duas regras que não podem ser quebradas

**1. Nenhuma referência a CDN.** O editor precisa funcionar com a rede
desconectada, e o executável do Windows embute exatamente este diretório. O
workflow de release falha a compilação se encontrar uma.

**2. Nunca grave uma string em disco.** Não passe texto para
`FileSystemWritableFileStream.write()` nem para um `Blob` destinado ao disco:
por especificação isso produz UTF-8, o que corrompe silenciosamente os
documentos Windows-1252 que este editor existe para editar. Use sempre
`Encoding.encode()`.

## Estrutura do projeto

```
index.html              casca do editor
css/editor.css          estilos (tokens de tema no topo)
js/state.js             estado central, desfazer/refazer, autosave
js/encoding.js          detecção de codificação e gravação byte a byte
js/i18n.js              textos pt-BR / en (pt-BR é o padrão)
js/blocks.js            dados da biblioteca de componentes
js/canvas.js            iframe, seleção, arrastar e soltar
js/tree.js              árvore DOM e breadcrumbs
js/properties.js        abas de estilo / atributos / HTML
js/blocks-panel.js      barra lateral de blocos e snippets
js/file.js              abrir, salvar, exportar
js/keyboard.js          atalhos globais
js/editor.js            inicialização e ligação da barra
vendor/                 dependências embutidas (sem CDN em execução)
tools/launcher/         programa Go que gera o CEJ-PAGE.exe
```

Os módulos são JavaScript puro, sem empacotador. Cada um expõe um objeto único
em `window` (`window.Canvas`, `window.EditorState`). As mudanças de estado
circulam por `EditorState.emit/on`.

## Estilo de código

- JavaScript puro, sem frameworks, sem build, sem dependências npm.
- Navegadores de referência: Chrome, Edge, Safari e Firefox atuais. A File
  System Access API só existe em Chromium — proteja com
  `'showOpenFilePicker' in window` e `window.isSecureContext`.
- Indentação de dois espaços, aspas simples, ponto e vírgula. Siga o estilo do
  arquivo em que estiver mexendo.
- Módulos pequenos e focados. Estado compartilhado passa por `EditorState`.

## Tarefas comuns

### Adicionar um bloco de componente

Acrescente em `js/blocks.js`:

```js
{ cat: 'Components', name: 'Pricing card', icon: '💵', html: '<div>…</div>' }
```

Categorias em uso: `Typography`, `Layout`, `Components`, `Media`, `Lists`,
`Forms`, `Navigation`, `Tables`, `Raw`. Um `cat` novo cria automaticamente sua
própria seção.

A string `html` é o que vai para o documento. Mantenha-a autocontida (estilos
inline tudo bem; dependências externas, não).

### Adicionar um controle ao painel de propriedades

Edite `renderStyle()` em `js/properties.js`, usando os auxiliares existentes:

- `textRow(label, value, onChange)` — texto livre
- `lengthRow(label, value, onChange)` — medida CSS
- `selectRow(label, value, options, onChange)` — lista suspensa
- `colorRow(label, value, onChange)` — seletor de cor + hex
- `sliderRow(label, value, min, max, step, onChange)` — controle deslizante

Chame `setStyle(el, 'propriedade-css', valor)` no `onChange` — ele cuida do
agrupamento de snapshots.

### Adicionar um atalho de teclado

Edite `js/keyboard.js`. `isInField()` descarta eventos disparados enquanto se
digita num campo.

### Adicionar ou alterar textos da interface

Edite `js/i18n.js`. Todo texto visível precisa existir nas **duas** árvores
(`pt-BR` e `en`).

### Mudar uma cor do tema

Edite as variáveis CSS no topo de `css/editor.css` (`:root` para o escuro,
`html[data-theme="light"]` para o claro).

## Pull requests

1. Faça fork, crie um branch e trabalhe nele.
2. Mantenha o PR pequeno — uma funcionalidade ou uma correção por PR.
3. Descreva brevemente o *porquê*, com captura de tela ou GIF se mexer na
   interface.
4. Teste no Chrome (caminho da File System Access API) e em pelo menos um
   navegador não-Chromium (caminho de importar/exportar).
5. Se tocar em codificação, teste com um arquivo Windows-1252 real: abrir e
   salvar sem editar deve produzir bytes idênticos.
6. Rode a verificação de sintaxe:
   `for f in js/*.js; do node --check "$f"; done`

## Relatar problemas

Abra uma issue com:

- Navegador e sistema operacional
- Passos para reproduzir
- O que você esperava e o que aconteceu
- Saída do console, se houver erros
- Em problemas de codificação: qual `charset` o arquivo declara, e o resultado
  de `file -I arquivo.html`

## Licença

Ao contribuir, você concorda que sua contribuição é licenciada sob a
[Licença MIT](LICENSE) deste projeto.

---

<details>
<summary><b>&nbsp;🇬🇧&nbsp; English version</b> &nbsp;— click to expand</summary>

<br>

Small, focused project — please read this short guide before opening a PR.

## Setup

It's a static site. No build step, and every runtime dependency is vendored
under `vendor/`.

```sh
git clone https://github.com/waldeyr/cej-editor.git
cd cej-editor
python3 -m http.server 8000        # or: npx serve . / php -S localhost:8000
```

Open `http://localhost:8000`.

> The File System Access API needs a secure context. `localhost` counts as
> secure, so live-link editing works in development. Opening `index.html` over
> `file://` does **not** work.

## Two rules that can't be broken

**1. No CDN references.** The editor has to work with the network unplugged, and
the Windows executable embeds exactly this directory. The release workflow fails
the build if it finds one.

**2. Never write a string to disk.** Don't pass text to
`FileSystemWritableFileStream.write()` or into a `Blob` destined for disk: by
spec that produces UTF-8, which silently corrupts the Windows-1252 documents
this editor exists to edit. Always go through `Encoding.encode()`.

## Project layout

```
index.html              editor shell
css/editor.css          styles (theme tokens at the top)
js/state.js             central state, undo/redo, autosave
js/encoding.js          charset detection and byte-exact writing
js/i18n.js              pt-BR / en strings (pt-BR is the default)
js/blocks.js            component-library data
js/canvas.js            iframe, selection, drag-drop
js/tree.js              DOM tree panel and breadcrumbs
js/properties.js        style / attrs / HTML tabs
js/blocks-panel.js      blocks sidebar and snippets
js/file.js              open, save, export
js/keyboard.js          global shortcuts
js/editor.js            bootstrap and toolbar wiring
vendor/                 embedded dependencies (no CDN at runtime)
tools/launcher/         Go program that produces CEJ-PAGE.exe
```

Modules are vanilla JS with no bundler. Each exposes a singleton on `window`
(`window.Canvas`, `window.EditorState`). State changes flow through
`EditorState.emit/on`.

## Code style

- Vanilla JS, no frameworks, no build step, no npm dependencies.
- Browser baseline: current Chrome, Edge, Safari, Firefox. File System Access is
  Chromium-only — guard with `'showOpenFilePicker' in window` and
  `window.isSecureContext`.
- Two-space indent, single quotes, semicolons. Match the surrounding style.
- Keep modules small and focused. Cross-module state goes through
  `EditorState`.

## Common tasks

### Add a component block

Append to `js/blocks.js`:

```js
{ cat: 'Components', name: 'Pricing card', icon: '💵', html: '<div>…</div>' }
```

Categories in use: `Typography`, `Layout`, `Components`, `Media`, `Lists`,
`Forms`, `Navigation`, `Tables`, `Raw`. A new `cat` automatically gets its own
section header.

The `html` string is what lands in the document. Keep it self-contained (inline
styles are fine, external dependencies are not).

### Add a control to the Properties panel

Edit `renderStyle()` in `js/properties.js`, using the existing helpers:

- `textRow(label, value, onChange)` — free text
- `lengthRow(label, value, onChange)` — CSS length
- `selectRow(label, value, options, onChange)` — dropdown
- `colorRow(label, value, onChange)` — color picker + hex
- `sliderRow(label, value, min, max, step, onChange)` — range slider

Call `setStyle(el, 'css-property', value)` from `onChange` — it handles snapshot
debouncing.

### Add a keyboard shortcut

Edit `js/keyboard.js`. `isInField()` filters out events fired while typing in an
input.

### Add or change interface text

Edit `js/i18n.js`. Every visible string must exist in **both** trees (`pt-BR`
and `en`).

### Change a theme colour

Edit the CSS custom properties at the top of `css/editor.css` (`:root` for dark,
`html[data-theme="light"]` for light).

## Pull requests

1. Fork, branch, and work there.
2. Keep PRs small — one feature or one fix per PR.
3. Describe *why*, with a screenshot or GIF if it's UI-facing.
4. Test in Chrome (the File System Access path) and at least one non-Chromium
   browser (the import/export path).
5. If you touch encoding, test with a real Windows-1252 file: opening and saving
   without editing must produce identical bytes.
6. Run the syntax check:
   `for f in js/*.js; do node --check "$f"; done`

## Reporting bugs

Open an issue with:

- Browser and OS
- Steps to reproduce
- What you expected vs. what happened
- Console output if there are errors
- For encoding problems: what `charset` the file declares, and the output of
  `file -I file.html`

## License

By contributing, you agree your contributions are licensed under the
[MIT License](LICENSE) of this project.

</details>
