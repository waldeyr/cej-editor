// Lightweight i18n layer: default pt-BR with optional English toggle.
window.I18N = (function() {
  const STORAGE_KEY = 'html-editor.lang';
  const SUPPORTED = ['pt-BR', 'en'];

  const STRINGS = {
    'pt-BR': {
      ui: {
        appName: 'Editor HTML',
        toolbar: {
          open: 'Abrir',
          import: 'Importar',
          export: 'Exportar',
          saveAs: 'Salvar como',
          save: 'Salvar',
          visual: 'Visual',
          source: 'Código',
          fileLinked: '{name} (vinculado)',
          fileReadonly: '{name} (somente leitura)',
          linkedHint: 'Vinculado ao arquivo local em tempo real',
          readonlyHint: 'Importado - use Exportar ou Salvar (download)',
          saved: 'Salvo',
          unsaved: '● Não salvo',
        },
        empty: {
          restore: 'Restaurar última sessão',
          age: 'há {age} · {name}',
        },
        assets: {
          noSnippets: 'Ainda não há snippets salvos',
          noRecent: 'Sem arquivos recentes',
        },
        tree: {
          noDocument: 'Sem documento',
          noSelection: 'Sem seleção',
          copyHtml: 'Copiar HTML',
          copyPath: 'Copiar caminho',
          line: 'Linha',
          lineWithNumber: 'Linha {line}',
          copiedTag: 'Copiado {tag} ({size} chars)',
          copiedPath: 'Caminho copiado: {path}',
          copyFailedPath: 'Não foi possível montar o caminho',
          noSource: 'Sem código-fonte disponível',
          unresolvedPath: 'Não foi possível resolver o caminho do elemento',
          unresolvedSource: 'Não foi possível localizar o elemento no código-fonte',
          copiedLine: 'Linha {line} copiada{suffix}',
          staleSuffix: ' (fonte pode estar desatualizada - há edições não salvas)',
          copyBlocked: 'Cópia falhou - clipboard bloqueado',
          copyFailed: 'Falha ao copiar',
        },
        props: {
          emptyStyle: 'Selecione um elemento para editar o estilo.',
          emptyAttrs: 'Selecione um elemento para editar atributos.',
          emptyHtml: 'Selecione um elemento para editar HTML bruto.',
          typography: 'Tipografia',
          layout: 'Layout',
          spacing: 'Espaçamento',
          background: 'Fundo',
          border: 'Borda',
          effects: 'Efeitos',
          element: 'Elemento',
          classes: 'Classes',
          attributes: 'Atributos',
          rawOuter: 'HTML bruto (externo)',
          innerHtml: 'HTML interno',
          add: '+ Adicionar',
          apply: 'Aplicar',
          reset: 'Redefinir',
          addAttrTitle: 'Adicionar atributo',
          addAttrMsg: 'Nome do atributo HTML (ex.: data-id, aria-label, role).',
          addAttrPlaceholder: 'nome do atributo',
          invalidHtmlTitle: 'HTML inválido',
          invalidHtmlMsg: 'Não foi possível analisar a marcação. Verifique tags desbalanceadas ou caracteres soltos.',
          quick: {
            linkUrl: 'URL do link',
            target: 'Destino (_blank)',
            imageUrl: 'URL da imagem',
            altText: 'Texto alternativo',
            placeholder: 'Placeholder',
            name: 'Nome',
          },
          row: {
            font: 'Fonte',
            size: 'Tamanho',
            weight: 'Peso',
            align: 'Alinhar',
            color: 'Cor',
            lineHeight: 'Altura linha',
            tracking: 'Espaçamento letras',
            display: 'Exibição',
            direction: 'Direção',
            justify: 'Justificar',
            alignItems: 'Alinhar itens',
            gap: 'Espaço',
            position: 'Posição',
            width: 'Largura',
            height: 'Altura',
            maxWidth: 'Larg. máx.',
            image: 'Imagem',
            radius: 'Raio',
            style: 'Estilo',
            opacity: 'Opacidade',
            shadow: 'Sombra',
            transform: 'Transformação',
            cursor: 'Cursor',
            tag: 'Tag',
            id: 'ID',
          },
        },
        blocks: {
          searchPlaceholder: 'Buscar blocos...',
          saveSelection: 'Salvar seleção como snippet',
          saveSnippetTitle: 'Salvar seleção como snippet',
          saveSnippetMsg: 'Dê um nome ao snippet. Ele aparecerá na aba Assets.',
          saveSnippetPlaceholder: 'nome do snippet',
          saveLabel: 'Salvar',
          snippetSaved: 'Snippet salvo',
          deleteSnippet: 'Excluir snippet',
          deleteSnippetTitle: 'Excluir snippet "{name}"?',
          deleteSnippetMsg: 'Essa ação não pode ser desfeita.',
          delete: 'Excluir',
        },
        file: {
          fsaRequired: 'Edição local em tempo real exige Chrome/Edge. Use Importar.',
          opened: 'Aberto {name} - alterações serão salvas no disco',
          openError: 'Não foi possível abrir o arquivo: {message}',
          imported: 'Importado {name} (somente leitura - use Exportar para salvar)',
          importError: 'Não foi possível importar: {message}',
          saving: 'Salvando...',
          saveFailed: 'Falha ao salvar: {message}',
          exported: 'Exportado {name}',
          savedAs: 'Salvo como {name}',
          saved: 'Salvo',
          overwriteTitle: 'Arquivo alterado no disco',
          overwriteMsg: 'Outro processo alterou este arquivo desde a última leitura. Salvar agora sobrescreverá essas alterações externas.\n\nSobrescrever mesmo assim, ou cancelar e usar Recarregar primeiro?',
          overwriteConfirm: 'Sobrescrever disco',
          cancel: 'Cancelar',
          noLinkedFile: 'Nenhum arquivo vinculado - abra um com "Abrir arquivo local" antes',
          upToDate: 'Já está atualizado',
          reloadDiscardTitle: 'Arquivo alterado no disco',
          reloadDiscardMsg: 'Você possui alterações não salvas no editor. Recarregar do disco e descartá-las?',
          reloadDiscardConfirm: 'Descartar e recarregar',
          keepChanges: 'Manter minhas alterações',
          reloaded: 'Recarregado do disco',
          reloadFailed: 'Falha ao recarregar: {message}',
          changedOnDiskBtn: 'Arquivo alterado no disco - clique para recarregar',
          refreshDiskBtn: 'Recarregar do disco - trazer mudanças externas',
          changedOnDiskToast: 'Arquivo alterado no disco - clique em ↻ para recarregar',
          permissionDenied: 'Permissão de escrita negada - conceda acesso novamente no ícone de informações da barra de endereço',
          browserWarnFallback: 'Seu navegador não suporta edição local em tempo real (Safari/Firefox). Importar/Exportar continua funcionando.',
          browserWarnHttps: 'A edição de arquivos locais em tempo real exige HTTPS. Alterne para HTTPS ->',
          assetsDirUnsupported: 'Seu navegador não suporta seleção de pasta para resolver assets locais.',
          assetsDirLinked: 'Pasta de assets vinculada: {name}',
          assetsDirNeeded: '{count} imagem(ns) local(is) não carregaram. Clique em "Pasta de assets" para vincular a pasta.',
          assetsStillMissing: '{count} imagem(ns) local(is) ainda não foram encontradas na pasta vinculada.',
          assetsDirError: 'Não foi possível vincular pasta de assets: {message}',
          assetsPromptTitle: 'Imagens locais não encontradas',
          assetsPromptMsg: '{count} imagem(ns) não carregaram no preview. Deseja escolher agora a pasta que contém os assets?',
          assetsPromptConfirm: 'Escolher pasta',
          blankTitle: 'Sem título',
          blankHeading: 'Nova página',
          blankBody: 'Comece a editar - clique em qualquer elemento para selecionar, clique duplo para editar texto e arraste blocos da barra lateral.',
        },
        encoding: {
          chipHint: 'O arquivo será salvo em {encoding}. Clique para alterar.',
          guessed: 'O arquivo não declara codificação; detectado {encoding} pelos bytes',
          mismatch: 'Atenção: o arquivo declara ISO-8859-1 mas o conteúdo é UTF-8. Foi lido como UTF-8.',
          adapted: '{count} caractere(s) adaptado(s) ao {encoding}: {sample}',
          changeTitle: 'Alterar a codificação do arquivo',
          changeMsg: 'Converter de {from} para {to}. Os bytes e a meta charset do documento serão reescritos ao salvar.',
          changeConfirm: 'Converter para {to}',
          changed: 'Codificação alterada para {encoding} - salve para gravar no disco',
        },
        diff: {
          noLinkedFile: 'Nenhum arquivo vinculado - abra um com "Abrir arquivo local" antes',
          readError: 'Não foi possível ler o arquivo: {message}',
          noDifferences: 'Sem diferenças - editor igual ao disco',
          diffViewerAria: 'Visualizador de diff',
          unifiedTitle: 'Visão unificada',
          splitTitle: 'Visão lado a lado',
          collapseTitle: 'Mostrar apenas regiões alteradas ({lines} linhas de contexto)',
          collapse: 'Colapsar',
          expandAll: 'Expandir tudo',
          collapseToggleShowAll: 'Clique para mostrar todas as linhas',
          collapseToggleHide: 'Clique para ocultar regiões inalteradas ({lines} linhas de contexto)',
          copyTitle: 'Copiar diff para a área de transferência',
          copied: 'Diff copiado para a área de transferência',
          copyFailed: 'Falha ao copiar',
          useDiskTitle: 'Descartar alterações do editor - carregar versão do disco',
          useDisk: 'Usar disco',
          saveDiskTitle: 'Salvar editor -> disco',
          saveDisk: 'Salvar no disco',
          close: 'Fechar',
          discardTitle: 'Descartar alterações do editor?',
          discardMsg: 'A versão em disco substituirá o que está no editor.',
          discardConfirm: 'Descartar e carregar disco',
          showHiddenTitle: 'Mostrar todas as {count} linhas ocultas',
          hiddenLines: '{count} linhas inalteradas ocultas',
          hiddenLine: '1 linha inalterada oculta',
        },
        git: {
          openFirst: 'Abra um arquivo primeiro',
          title: 'Diff vs. git HEAD',
          message: 'Escolha o diretório raiz do repositório no próximo seletor. O vínculo fica em cache por arquivo nesta sessão - sem upload de rede, todo processamento ocorre no navegador.',
          pickDirectory: 'Escolher diretório',
          scanning: 'Buscando arquivo no repositório...',
          fileOutside: 'O arquivo aberto não está dentro desse diretório',
          noGit: 'Diretório .git não encontrado - não é raiz de repositório git',
          openDirError: 'Não foi possível abrir diretório: {message}',
          readingHead: 'Lendo HEAD...',
          readFailed: 'Leitura do git falhou: {message}',
          matchesHead: 'Editor igual ao HEAD - sem diff',
          locateTitle: 'Não foi possível localizar o arquivo no repositório',
          locateMsg: 'Foram escaneados mais de {max} arquivos nesse diretório sem encontrar o arquivo aberto. Escolha o subdiretório imediato que contém o arquivo, ou mova o arquivo para uma subárvore menor.',
        },
        version: {
          justNow: 'agora',
          minutesAgo: 'há {m}m',
          hoursAgo: 'há {h}h',
          daysAgo: 'há {d}d',
          commit: 'commit: {sha}',
          branch: 'branch: {ref}',
          built: 'build: {at}',
        },
      },
      blocks: {
        categories: {
          Typography: 'Tipografia', Layout: 'Layout', Components: 'Componentes', Media: 'Mídia', Lists: 'Listas',
          Forms: 'Formulários', Navigation: 'Navegação', Tables: 'Tabelas', Raw: 'Bruto',
        },
        names: {
          'Heading 1': 'Título 1', 'Heading 2': 'Título 2', 'Heading 3': 'Título 3', Paragraph: 'Parágrafo', Blockquote: 'Citação',
          Code: 'Código', 'Inline code': 'Código inline', Divider: 'Divisor', Container: 'Container', Section: 'Seção',
          '2 columns': '2 colunas', '3 columns': '3 colunas', 'Flex row': 'Linha flex', 'Flex column': 'Coluna flex', Spacer: 'Espaçador',
          Button: 'Botão', Link: 'Link', Card: 'Card', Hero: 'Hero', 'CTA banner': 'Banner CTA', 'Feature row': 'Linha de recursos',
          Stat: 'Estatística', Badge: 'Badge', Alert: 'Alerta', Image: 'Imagem', Video: 'Vídeo', YouTube: 'YouTube', Audio: 'Áudio',
          Figure: 'Figura', 'Bullet list': 'Lista com marcadores', 'Numbered list': 'Lista numerada', 'Definition list': 'Lista de definição',
          Form: 'Formulário', 'Text input': 'Campo de texto', Textarea: 'Textarea', Select: 'Select', Checkbox: 'Checkbox', Radio: 'Radio',
          Navbar: 'Barra de navegação', Footer: 'Rodapé', Breadcrumbs: 'Breadcrumbs', Table: 'Tabela',
          'Empty div': 'Div vazia', 'Empty span': 'Span vazio', 'Custom HTML': 'HTML customizado'
        }
      }
    },
    en: {
      ui: {
        appName: 'HTML Editor',
        toolbar: {
          open: 'Open', import: 'Import', export: 'Export', save: 'Save', visual: 'Visual', source: 'Source',
          saveAs: 'Save as',
          fileLinked: '{name} (linked)', fileReadonly: '{name} (read-only)',
          linkedHint: 'Live-linked to local file', readonlyHint: 'Imported - use Export or Save (download)',
          saved: 'Saved', unsaved: '● Unsaved',
        },
        empty: { restore: 'Restore last session', age: '{age} ago · {name}' },
        assets: { noSnippets: 'No saved snippets yet', noRecent: 'No recent files' },
        tree: {
          noDocument: 'No document', noSelection: 'No selection', copyHtml: 'Copy HTML', copyPath: 'Copy Path', line: 'Line',
          lineWithNumber: 'Line {line}', copiedTag: 'Copied {tag} ({size} chars)', copiedPath: 'Copied path: {path}',
          copyFailedPath: 'Could not build path', noSource: 'No source available', unresolvedPath: 'Could not resolve element path',
          unresolvedSource: 'Could not locate element in source', copiedLine: 'Copied line {line}{suffix}',
          staleSuffix: ' (source may be stale - unsaved edits)', copyBlocked: 'Copy failed - clipboard blocked', copyFailed: 'Copy failed',
        },
        props: {
          emptyStyle: 'Select an element to edit its style.', emptyAttrs: 'Select an element to edit attributes.',
          emptyHtml: 'Select an element to edit raw HTML.', typography: 'Typography', layout: 'Layout', spacing: 'Spacing',
          background: 'Background', border: 'Border', effects: 'Effects', element: 'Element', classes: 'Classes',
          attributes: 'Attributes', rawOuter: 'Raw HTML (outer)', innerHtml: 'Inner HTML', add: '+ Add', apply: 'Apply', reset: 'Reset',
          addAttrTitle: 'Add attribute', addAttrMsg: 'Name of the HTML attribute (e.g. data-id, aria-label, role).',
          addAttrPlaceholder: 'attribute name', invalidHtmlTitle: 'Invalid HTML',
          invalidHtmlMsg: 'The markup could not be parsed. Check for unbalanced tags or stray characters.',
          quick: { linkUrl: 'Link URL', target: 'Target (_blank)', imageUrl: 'Image URL', altText: 'Alt text', placeholder: 'Placeholder', name: 'Name' },
          row: {
            font: 'Font', size: 'Size', weight: 'Weight', align: 'Align', color: 'Color', lineHeight: 'Line-h', tracking: 'Tracking',
            display: 'Display', direction: 'Direction', justify: 'Justify', alignItems: 'Align', gap: 'Gap', position: 'Position',
            width: 'Width', height: 'Height', maxWidth: 'Max-w', image: 'Image', radius: 'Radius', style: 'Style', opacity: 'Opacity',
            shadow: 'Shadow', transform: 'Transform', cursor: 'Cursor', tag: 'Tag', id: 'ID',
          }
        },
        blocks: {
          searchPlaceholder: 'Search blocks...', saveSelection: 'Save selection as snippet', saveSnippetTitle: 'Save selection as snippet',
          saveSnippetMsg: 'Give your snippet a name. It will appear in the Assets tab.', saveSnippetPlaceholder: 'snippet name',
          saveLabel: 'Save', snippetSaved: 'Snippet saved', deleteSnippet: 'Delete snippet',
          deleteSnippetTitle: 'Delete snippet "{name}"?', deleteSnippetMsg: 'This cannot be undone.', delete: 'Delete',
        },
        file: {
          fsaRequired: 'Live local editing requires Chrome/Edge. Use Import instead.',
          opened: 'Opened {name} - changes will save to disk', openError: 'Could not open file: {message}',
          imported: 'Imported {name} (read-only - use Export to save)', importError: 'Could not import: {message}',
          saving: 'Saving...', saveFailed: 'Save failed: {message}', exported: 'Exported {name}', saved: 'Saved',
          savedAs: 'Saved as {name}',
          overwriteTitle: 'File changed on disk',
          overwriteMsg: 'Someone (or something) modified this file since you last read it. Saving now will overwrite those external changes.\n\nOverwrite anyway, or cancel and use Refresh first?',
          overwriteConfirm: 'Overwrite disk', cancel: 'Cancel',
          noLinkedFile: 'No linked file - open one with "Open Local File" first', upToDate: 'Already up to date',
          reloadDiscardTitle: 'File changed on disk', reloadDiscardMsg: 'You have unsaved changes in the editor. Reload from disk and discard them?',
          reloadDiscardConfirm: 'Discard and reload', keepChanges: 'Keep my changes', reloaded: 'Reloaded from disk',
          reloadFailed: 'Reload failed: {message}', changedOnDiskBtn: 'File changed on disk - click to reload',
          refreshDiskBtn: 'Refresh from disk - pull in external changes', changedOnDiskToast: 'File changed on disk - click ↻ to reload',
          permissionDenied: 'Write permission denied - re-grant access via the page-info icon in the address bar',
          browserWarnFallback: 'Your browser does not support live local file editing (Safari/Firefox). Import/Export still works.',
          browserWarnHttps: 'Live local-file editing requires HTTPS. Switch to HTTPS ->',
          assetsDirUnsupported: 'Your browser does not support folder picking for local asset resolution.',
          assetsDirLinked: 'Assets folder linked: {name}',
          assetsDirNeeded: '{count} local image(s) did not load. Click "Assets folder" to link the folder.',
          assetsStillMissing: '{count} local image(s) still were not found in the linked folder.',
          assetsDirError: 'Could not link assets folder: {message}',
          assetsPromptTitle: 'Local images not found',
          assetsPromptMsg: '{count} image(s) did not load in preview. Choose the assets folder now?',
          assetsPromptConfirm: 'Choose folder',
          blankTitle: 'Untitled', blankHeading: 'New page',
          blankBody: 'Start editing - click anything to select, double-click to edit text, drag blocks from the sidebar.',
        },
        encoding: {
          chipHint: 'The file will be saved as {encoding}. Click to change.',
          guessed: 'File declares no encoding; detected {encoding} from its bytes',
          mismatch: 'Warning: the file declares ISO-8859-1 but holds UTF-8. Read as UTF-8.',
          adapted: '{count} character(s) adapted to {encoding}: {sample}',
          changeTitle: 'Change the file encoding',
          changeMsg: 'Convert from {from} to {to}. The document bytes and its meta charset are both rewritten on save.',
          changeConfirm: 'Convert to {to}',
          changed: 'Encoding changed to {encoding} - save to write it to disk',
        },
        diff: {
          noLinkedFile: 'No linked file - open one with "Open Local File" first', readError: 'Could not read file: {message}',
          noDifferences: 'No differences - editor matches disk', diffViewerAria: 'Diff viewer', unifiedTitle: 'Unified view',
          splitTitle: 'Side-by-side view', collapseTitle: 'Show only changed regions ({lines} lines of context)', collapse: 'Collapse',
          expandAll: 'Expand all', collapseToggleShowAll: 'Click to show every line',
          collapseToggleHide: 'Click to hide unchanged regions ({lines} lines of context)', copyTitle: 'Copy diff to clipboard',
          copied: 'Diff copied to clipboard', copyFailed: 'Copy failed',
          useDiskTitle: 'Discard editor changes - load disk version', useDisk: 'Use disk', saveDiskTitle: 'Save editor -> disk',
          saveDisk: 'Save to disk', close: 'Close', discardTitle: 'Discard editor changes?',
          discardMsg: 'The on-disk version will replace what you have in the editor.', discardConfirm: 'Discard and load disk',
          showHiddenTitle: 'Show all {count} hidden lines', hiddenLines: '{count} unchanged lines hidden', hiddenLine: '1 unchanged line hidden',
        },
        git: {
          openFirst: 'Open a file first', title: 'Diff vs. git HEAD',
          message: 'Pick your repo root directory in the next picker. Cached per file for this session - no network upload, all parsing happens in your browser.',
          pickDirectory: 'Pick directory', scanning: 'Scanning for file in repo...',
          fileOutside: 'The open file is not inside that directory', noGit: 'No .git directory found - not a git repo root',
          openDirError: 'Could not open directory: {message}', readingHead: 'Reading HEAD...',
          readFailed: 'Git read failed: {message}', matchesHead: 'Editor matches HEAD - no diff',
          locateTitle: 'Could not locate file in repo',
          locateMsg: 'Scanned more than {max} files in this directory without finding the open file. Pick the immediate sub-directory containing the file instead, or move the file into a smaller subtree.',
        },
        version: {
          justNow: 'just now', minutesAgo: '{m}m ago', hoursAgo: '{h}h ago', daysAgo: '{d}d ago',
          commit: 'commit: {sha}', branch: 'branch: {ref}', built: 'built: {at}',
        }
      },
      blocks: { categories: {}, names: {} }
    }
  };

  let current = normalize(localStorage.getItem(STORAGE_KEY)) || 'pt-BR';

  function normalize(lang) {
    if (!lang) return null;
    const lower = String(lang).toLowerCase();
    if (lower.startsWith('pt')) return 'pt-BR';
    if (lower.startsWith('en')) return 'en';
    return null;
  }

  function get(path, fallback) {
    const root = STRINGS[current] || STRINGS.en;
    const parts = String(path).split('.');
    let node = root;
    for (const p of parts) {
      if (!node || typeof node !== 'object' || !(p in node)) {
        node = null;
        break;
      }
      node = node[p];
    }
    if (node == null) {
      if (current !== 'en') {
        let enNode = STRINGS.en;
        for (const p of parts) {
          if (!enNode || typeof enNode !== 'object' || !(p in enNode)) {
            enNode = null;
            break;
          }
          enNode = enNode[p];
        }
        if (enNode != null) node = enNode;
      }
    }
    return node == null ? (fallback == null ? path : fallback) : node;
  }

  function format(str, vars) {
    return String(str).replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? String(vars[k]) : ''));
  }

  function t(path, vars, fallback) {
    return format(get(path, fallback), vars);
  }

  function translateBlockCategory(value) {
    if (current === 'en') return value;
    return STRINGS['pt-BR'].blocks.categories[value] || value;
  }

  function translateBlockName(value) {
    if (current === 'en') return value;
    return STRINGS['pt-BR'].blocks.names[value] || value;
  }

  function formatRelativeFromMinutes(minutes) {
    if (current === 'pt-BR') {
      if (minutes < 60) return minutes + 'min';
      return Math.round(minutes / 60) + 'h';
    }
    if (minutes < 60) return minutes + 'm';
    return Math.round(minutes / 60) + 'h';
  }

  function setLang(lang) {
    const normalized = normalize(lang);
    if (!normalized || !SUPPORTED.includes(normalized)) return;
    current = normalized;
    localStorage.setItem(STORAGE_KEY, current);
    document.documentElement.lang = current;
    applyStaticDom();
    updateToggleButton();
    window.dispatchEvent(new CustomEvent('i18n:changed', { detail: { lang: current } }));
  }

  function toggle() {
    setLang(current === 'pt-BR' ? 'en' : 'pt-BR');
  }

  function updateToggleButton() {
    const btn = document.getElementById('tb-lang');
    if (!btn) return;
    const toEnglish = current === 'pt-BR';
    btn.textContent = toEnglish ? 'EN' : 'PT';
    const title = toEnglish ? 'Switch language to English' : 'Trocar idioma para português-BR';
    btn.title = title;
    btn.setAttribute('aria-label', title);
  }

  function applyStaticDom() {
    const brand = document.querySelector('.brand-text');
    if (brand) brand.textContent = t('ui.appName');

    setHTML('.empty-inner h1', current === 'pt-BR'
      ? '<strong>CEJ-PAGE</strong>'
      : '<strong>Interactive HTML Editor</strong> &amp; Renderer');
    setText('.empty-tagline', current === 'pt-BR'
      ? 'Um editor visual de HTML gratuito no navegador. Solte um arquivo .html, edite como um designer e salve as mudanças no disco local em tempo real. Sem cadastro. Sem upload. Sem servidor.'
      : 'A free visual HTML editor that runs in your browser. Drop in any .html file, edit it like a designer, and save changes back to your local disk live. No signup. No upload. No server.');
    setText('#empty-open-local span', current === 'pt-BR' ? 'Abrir arquivo local' : 'Open Local File');
    setText('#empty-open-local small', current === 'pt-BR' ? 'Vínculo ao vivo - salva no disco' : 'Live link - saves to disk');
    setText('#empty-import span', current === 'pt-BR' ? 'Importar HTML' : 'Import HTML');
    setText('#empty-import small', current === 'pt-BR' ? 'Seletor somente leitura' : 'Read-only file picker');
    setText('#empty-new span', current === 'pt-BR' ? 'Começar em branco' : 'Start Blank');
    setText('#empty-new small', current === 'pt-BR' ? 'Página vazia' : 'Empty page');
    setHTML('.empty-drop-hint', current === 'pt-BR'
      ? '<i data-lucide="mouse-pointer-2" class="hint-icon"></i> ou solte um arquivo .html em qualquer lugar'
      : '<i data-lucide="mouse-pointer-2" class="hint-icon"></i> or drop an .html file anywhere');
    setHTML('.empty-shortcuts', current === 'pt-BR'
      ? '<kbd>Ctrl+S</kbd> salvar · <kbd>Ctrl+Z</kbd> desfazer · <kbd>Ctrl+D</kbd> duplicar · <kbd>Delete</kbd> remover · <kbd>Esc</kbd> desselecionar'
      : '<kbd>Ctrl+S</kbd> save · <kbd>Ctrl+Z</kbd> undo · <kbd>Ctrl+D</kbd> duplicate · <kbd>Delete</kbd> remove · <kbd>Esc</kbd> deselect');
    setText('#browser-warning', t('ui.file.browserWarnFallback'));

    const autosave = document.querySelector('.autosave');
    if (autosave) {
      const time = document.getElementById('autosave-time');
      autosave.textContent = current === 'pt-BR' ? 'Auto-salvo ' : 'Autosaved ';
      if (time) autosave.appendChild(time);
    }

    setText('#tb-open span', t('ui.toolbar.open'));
    setText('#tb-import span', t('ui.toolbar.import'));
    setText('#tb-assets-dir span', current === 'pt-BR' ? 'Pasta de assets' : 'Assets folder');
    setText('#tb-export span', t('ui.toolbar.export'));
    setText('#tb-save-as span', t('ui.toolbar.saveAs'));
    setText('#tb-save span', t('ui.toolbar.save'));
    setText('#mode-toggle .mode-btn[data-mode="visual"] span', t('ui.toolbar.visual'));
    setText('#mode-toggle .mode-btn[data-mode="source"] span', t('ui.toolbar.source'));
    setAttr('#mode-toggle', 'aria-label', current === 'pt-BR' ? 'Modo do editor' : 'Editor mode');
    setAttr('#mode-toggle .mode-btn[data-mode="visual"]', 'title', current === 'pt-BR' ? 'Edição visual (pode normalizar a formatação ao salvar)' : 'Visual editing (may normalize source formatting on save)');
    setAttr('#mode-toggle .mode-btn[data-mode="source"]', 'title', current === 'pt-BR' ? 'Edição de código (byte a byte; preserva formatação)' : 'Source editing (byte-for-byte; preserves formatting)');
    setAttr('#blocks-search', 'placeholder', t('ui.blocks.searchPlaceholder'));
    setText('#save-snippet', t('ui.blocks.saveSelection'));

    setText('.left-sidebar .sidebar-tabs .tab[data-tab="blocks"]', current === 'pt-BR' ? 'Blocos' : 'Blocks');
    setText('.left-sidebar .sidebar-tabs .tab[data-tab="tree"]', current === 'pt-BR' ? 'Árvore' : 'Tree');
    setText('.left-sidebar .sidebar-tabs .tab[data-tab="assets"]', 'Assets');

    setText('.right-sidebar .sidebar-tabs .tab[data-tab="style"]', current === 'pt-BR' ? 'Estilo' : 'Style');
    setText('.right-sidebar .sidebar-tabs .tab[data-tab="attrs"]', current === 'pt-BR' ? 'Atributos' : 'Attributes');
    setText('.right-sidebar .sidebar-tabs .tab[data-tab="html"]', 'HTML');

    setText('.assets-section:nth-of-type(1) h3', current === 'pt-BR' ? 'Snippets' : 'Snippets');
    setText('.assets-section:nth-of-type(1) .hint', current === 'pt-BR' ? 'Blocos salvos por você' : 'Saved blocks of your own');
    setText('.assets-section:nth-of-type(2) h3', current === 'pt-BR' ? 'Arquivos recentes' : 'Recent files');

    setAttr('#tb-open', 'title', current === 'pt-BR' ? 'Abrir arquivo local' : 'Open local file');
    setAttr('#tb-import', 'title', current === 'pt-BR' ? 'Importar HTML' : 'Import HTML');
    setAttr('#tb-assets-dir', 'title', current === 'pt-BR' ? 'Vincular pasta para imagens/assets locais' : 'Link folder for local images/assets');
    setAttr('#tb-export', 'title', current === 'pt-BR' ? 'Exportar HTML' : 'Export HTML');
    setAttr('#tb-save-as', 'title', current === 'pt-BR' ? 'Salvar como (Ctrl+Shift+S)' : 'Save as (Ctrl+Shift+S)');
    setAttr('#tb-save', 'title', current === 'pt-BR' ? 'Salvar (Ctrl+S)' : 'Save (Ctrl+S)');

    setAttr('#tb-refresh', 'title', t('ui.file.refreshDiskBtn'));
    setAttr('#tb-diff', 'title', current === 'pt-BR' ? 'Mostrar diff vs. arquivo no disco' : 'Show diff vs. file on disk');
    setAttr('#tb-git-diff', 'title', current === 'pt-BR' ? 'Mostrar diff vs. git HEAD (pede diretório do repo)' : 'Show diff vs. git HEAD (asks for repo directory)');
    setAttr('#tb-preview', 'title', current === 'pt-BR' ? 'Alternar modo de prévia (P) - oculta a interface do editor.' : 'Toggle preview mode (P) - hides editor chrome.');
    setAttr('#tb-external-preview', 'title', current === 'pt-BR' ? 'Abrir o documento atual em nova aba (scripts executam)' : 'Open current document in a new tab (scripts run)');
    setAttr('#tb-theme', 'title', current === 'pt-BR' ? 'Alternar tema' : 'Toggle theme');

    setText('#exit-preview-btn', current === 'pt-BR' ? '<- Sair da prévia (P ou Esc)' : '<- Exit preview (P or Esc)');
    setAttr('#canvas', 'title', current === 'pt-BR' ? 'Área de edição' : 'Canvas');

    const saveEl = document.getElementById('save-status');
    if (saveEl) {
      const dirty = window.EditorState && window.EditorState.state && window.EditorState.state.dirty;
      saveEl.textContent = dirty ? t('ui.toolbar.unsaved') : t('ui.toolbar.saved');
    }
    updateToggleButton();
    if (window.renderIcons) window.renderIcons();
  }

  function setText(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.textContent = value;
  }

  function setHTML(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.innerHTML = value;
  }

  function setAttr(selector, attr, value) {
    const el = document.querySelector(selector);
    if (el) el.setAttribute(attr, value);
  }

  function init() {
    document.documentElement.lang = current;
    applyStaticDom();
    updateToggleButton();
  }

  return {
    init,
    t,
    getLang: () => current,
    setLang,
    toggle,
    translateBlockCategory,
    translateBlockName,
    formatRelativeFromMinutes,
  };
})();