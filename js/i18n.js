// Lightweight i18n layer: default pt-BR with optional English toggle.
window.I18N = (function() {
  const STORAGE_KEY = 'html-editor.lang';
  const SUPPORTED = ['pt-BR', 'en'];

  const STRINGS = {
    'pt-BR': {
      ui: {
        appName: 'CEJ-PAGE',
        toolbar: {
          open: 'Abrir',
          import: 'Importar',
          importUrl: 'Importar URL',
          importUrlHint: 'Importar HTML de uma URL',
          assetsDir: 'Pasta de assets',
          assetsDirHint: 'Vincular pasta de assets',
          export: 'Exportar',
          saveAs: 'Salvar como',
          save: 'Salvar',
          visual: 'Visual',
          source: 'Código',
          fileLinked: '{name} (vinculado)',
          fileReadonly: '{name} (somente leitura)',
          linkedHint: 'Vinculado ao arquivo local em tempo real',
          readonlyHint: 'Importado - edite e use Salvar como para criar um arquivo local',
          saved: 'Salvo',
          unsaved: '● Não salvo',
        },
        empty: {
          restore: 'Restaurar última sessão',
          age: 'há {age} · {name}',
          openEdit: 'Abrir e editar',
          openEditHint: 'Ctrl+S grava no próprio arquivo',
          openCopy: 'Abrir uma cópia',
          openCopyHint: 'Sem vínculo — salvar pergunta onde',
          openCopyTitle: 'Abre sem vínculo com o arquivo; salvar vai perguntar onde gravar',
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
          stylePicker: 'Estilos do documento',
          stylePickerHint: 'Aplicar um dos {count} estilos já definidos na página...',
          styleForTag: 'Definidos para <{tag}>',
          styleForAny: 'Para qualquer elemento',
          styleForOther: 'Definidos para outras tags',
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
          actionHint: '{name} — clique para abrir',
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
          imported: 'Importado {name} (edite e use Salvar como para gravar)',
          importedUrl: 'Importado {name} da web (edite e use Salvar como para gravar)',
          importError: 'Não foi possível importar: {message}',
          importUrlTitle: 'Importar HTML de uma URL',
          importUrlMsg: 'Cole o endereço de uma página web que permita leitura pelo navegador (CORS). A página será copiada para o editor; edite e use Salvar como para gravar.',
          importUrlConfirm: 'Importar',
          importUrlError: 'Não foi possível importar a URL: {message}',
          importUrlCors: 'o site bloqueou a leitura direta pelo navegador (CORS). Baixe o HTML e use Importar HTML',
          saving: 'Salvando...',
          saveFailed: 'Falha ao salvar: {message}',
          saveAsPromptTitle: 'Salvar como',
          saveAsPromptMsg: 'Digite o nome do arquivo. Ele será baixado pelo navegador — se a opção "Sempre perguntar onde salvar arquivos" estiver ligada, o Windows perguntará em qual pasta gravar.',
          saveAsPromptConfirm: 'Salvar',
          saveAsPlaceholder: 'pagina.html',
          saveAsHintTitle: 'Escolher a pasta ao salvar',
          saveAsHintFirefox: 'O Firefox não permite que a página abra a janela "Salvar em" do Windows. Para escolher a pasta a cada salvamento, ligue uma vez:\n\nMenu ≡ → Configurações → Geral → Downloads → marcar "Sempre perguntar onde salvar arquivos".\n\nDepois disso, todo Salvar como abrirá a janela do Windows normalmente.',
          saveAsHintGeneric: 'Este navegador não permite que a página abra a janela "Salvar em" do Windows. Ligue a opção de perguntar onde salvar nas configurações de downloads do navegador, ou use o Chrome/Edge para gravar direto no arquivo.',
          saveAsHintDismiss: 'Entendi, não mostrar de novo',
          saveAsHintLater: 'Lembrar depois',
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
        act: {
          groups: { ato: 'Peças do ato', avancado: 'Avançado (páginas comuns)' },
          disp: { paragrafoUnico: 'Parágrafo único', inciso: 'inciso', alinea: 'alínea',
                  item: 'item', preambulo: 'Preâmbulo', decreta: 'Fecho de decretação',
                  notaDou: 'Nota do DOU', artigo: 'Artigo', paragrafo: 'Parágrafo', anexo: 'Anexo' },
          roles: {
            epigrafe: { label: 'Epígrafe', hint: 'A linha com o tipo, o número e a data do ato, centralizada e em azul-marinho.' },
            ementa: { label: 'Ementa', hint: 'O resumo do que o ato dispõe, alinhado à direita e em vinho.' },
            preambulo: { label: 'Preâmbulo', hint: 'O "O PRESIDENTE DA REPÚBLICA, no uso das atribuições…".' },
            decreta: { label: 'DECRETA:', hint: 'O fecho de decretação, logo antes do primeiro artigo.' },
            corpo: { label: 'Corpo do ato', hint: 'A formatação padrão dos parágrafos do ato, sem alterar o texto.' },
            artigo: { label: 'Artigo', hint: 'Formata como artigo e, se faltar, numera e cria a âncora (#artN).' },
            paragrafo: { label: 'Parágrafo (§)', hint: 'Formata como parágrafo numerado.' },
            paragrafoUnico: { label: 'Parágrafo único', hint: 'Formata como parágrafo único.' },
            inciso: { label: 'Inciso', hint: 'Formata como inciso (I, II, III…).' },
            alinea: { label: 'Alínea', hint: 'Formata como alínea (a, b, c…).' },
            item: { label: 'Item', hint: 'Formata como item numerado.' },
            citacao: { label: 'Citação de outro ato', hint: 'O trecho alterado de outro ato, recuado e entre aspas, terminando em (NR).' },
            dataLocal: { label: 'Data e local', hint: 'O "Brasília, … ; 205º da Independência e 138º da República."' },
            assinaturaPresidente: { label: 'Assinatura do Presidente', hint: 'Nome em caixa alta, sem recuo de primeira linha.' },
            assinaturaMinistro: { label: 'Assinatura de Ministro', hint: 'Igual à do Presidente, porém em itálico.' },
            notaDou: { label: 'Nota do DOU', hint: 'O "Este texto não substitui o publicado no DOU de …", em vermelho.' },
            anexoTitulo: { label: 'Título de anexo', hint: 'ANEXO I, centralizado e em negrito.' },
            cabecalhoBrasao: { label: 'Cabeçalho com brasão', hint: 'O bloco do brasão com Presidência da República / Casa Civil.' },
          },
          sample: {
            default: 'Digite o texto aqui.',
            epigrafe: 'DECRETO Nº 0.000, DE 0 DE MÊS DE 0000',
            ementa: 'Dispõe sobre … e dá outras providências.',
            preambulo: 'O PRESIDENTE DA REPÚBLICA, no uso da atribuição que lhe confere o art. 84, caput, inciso IV, da Constituição, DECRETA:',
            dataLocal: 'Brasília, 0 de mês de 0000; 000º da Independência e 000º da República.',
            assinaturaPresidente: 'NOME DO PRESIDENTE',
            assinaturaMinistro: 'Nome do Ministro',
            notaDou: 'Este texto não substitui o publicado no DOU de 0.0.0000',
            anexoTitulo: 'ANEXO I',
            citacao: '“Art. 0º  …………………………………………………” (NR)',
          },
          apply: {
            done: 'Formatado como {role}.',
            doneMany: '{count} trechos formatados como {role}.',
            nothing: 'Selecione um trecho do texto primeiro.',
            insideTable: 'Este trecho está dentro de uma tabela — a formatação do corpo do ato não se aplica aqui.',
            hasStructure: 'Este trecho tem estrutura dentro (tabela ou lista). Formate os parágrafos internos, um a um.',
          },
          now: { noAnchor: 'sem âncora', near: 'formatação aproximada', unformatted: 'ainda sem a formatação do ato' },
          pieces: {
            cabecalho: 'Cabeçalho com brasão', tabelaAnexo: 'Tabela de anexo',
            ancora: 'Âncora', link: 'Link', colar: 'Colar do Word',
            titulo: 'Título da página', conferir: 'Conferir o ato',
          },
        },
        marks: {
          anchors: 'Âncoras', links: 'Links',
          paragraphs: 'Fim de parágrafo (¶)', roles: 'Papéis do ato (faixa colorida)',
          note: 'As marcas aparecem só no editor. Nunca são gravadas no arquivo.',
        },
        outline: {
          noDoc: 'Abra um ato para ver sua estrutura.',
          none: 'Nenhuma estrutura de ato reconhecida nesta página. Use a aba Árvore.',
          missingAnchors: '{n} artigo(s) sem âncora — outros atos não conseguirão apontar para eles.',
          hasAnchor: 'Âncora: #{name}', noAnchorShort: 'sem âncora',
          noAnchorHelp: 'Este dispositivo não tem âncora. Sugestão: #{s}',
        },
        piece: {
          nothing: 'Clique num parágrafo do ato para ver o que ele é e o que dá para fazer com ele.',
          whatIs: 'O que é este trecho', unknown: 'Trecho sem papel reconhecido',
          noFormat: 'A formatação não corresponde a nenhum padrão do ato. Escolha um na barra acima.',
          exact: 'Formatado como {role}, exatamente no padrão.',
          near: 'Parecido com {role}, mas com {n} diferença(s).',
          seeDiffs: 'Ver as diferenças', diffMissing: 'ausente', fixFormat: 'Ajustar para o padrão',
          actions: 'Ações', makeLink: 'Transformar em link', addAnchor: 'Criar âncora aqui',
          quickAnchor: 'Criar a âncora #{s}', pasteWord: 'Colar texto do Word',
          anchorCreated: 'Âncora #{name} criado.',
          links: 'Links neste trecho', editLink: 'Editar',
          linkInPage: 'nesta página: {n}', linkBroken: 'destino inexistente: {n}',
          anchor: 'Âncora', noAnchor: 'Este trecho não tem âncora.',
          copy: 'Copiar', copied: 'Copiado: {f}', rename: 'Renomear', remove: 'Remover',
          text: 'Texto', emptyText: '(vazio)', chars: '{n} caracteres',
        },
        paste: {
          coldTitle: 'Colar texto do Word',
          coldMessage: 'Cole aqui o texto copiado do Word (Ctrl+V). Ele será formatado conforme o padrão do ato.',
          coldConfirm: 'Continuar',
          title: 'Como colar este texto?', subtitle: '{count} parágrafo(s) na área de transferência.',
          confirm: 'Colar',
          modeAto: 'Como texto do ato', modeAtoDesc: 'Aplica a formatação padrão do ato a cada parágrafo.',
          modeTexto: 'Só o texto, sem formatação', modeTextoDesc: 'Mantém apenas as palavras.',
          modeOriginal: 'Manter a formatação original', modeOriginalDesc: 'O código do Word será gravado no arquivo.',
          previewHead: 'Prévia dos primeiros parágrafos', plainRole: 'texto',
          remember: 'Não perguntar de novo nesta sessão',
          hugeTitle: 'Colagem muito grande', hugeMsg: 'São {count} parágrafos. Pode demorar. Continuar?',
          hugeConfirm: 'Continuar',
          done: 'Colado: ', doneOriginal: 'Colado com a formatação original do Word.',
          rPara: '{n} parágrafos', rWord: '{n} marcas do Word removidas',
          rLinks: '{n} links mantidos', rImages: '{n} imagens descartadas',
          rChars: '{n} caracteres serão adaptados ao salvar',
        },
        link: {
          title: 'Inserir link', titleEdit: 'Editar link',
          message: 'Cole o endereço do ato ou escolha um destino desta página.',
          messageEdit: 'Altere o endereço de destino deste link.',
          create: 'Inserir link', save: 'Salvar', addressLabel: 'Endereço',
          selectFirst: 'Selecione primeiro o texto que deve virar link.',
          empty: 'Informe um endereço.',
          sectionDisp: 'Dispositivo deste ato', sectionAnchors: 'Âncoras existentes',
          sectionRecent: 'Usados recentemente',
          noDisp: 'Nenhum artigo ou anexo reconhecido nesta página.',
          noAnchors: 'Esta página ainda não tem âncoras.', noRecent: 'Nada ainda.',
          annexFile: 'arquivo de anexos',
          inThisPage: 'Nesta página: {alvo}',
          missingAnchor: 'Atenção: esta página não tem a âncora “{name}”.',
          external: 'Endereço externo (fora do Planalto).',
          crossBlocks: 'A seleção atravessa mais de um parágrafo. Selecione dentro de um só.',
          lostSelection: 'A seleção se perdeu. Selecione o texto de novo.',
          created: 'Link criado.', updated: 'Link atualizado.',
          remove: 'Remover link (manter o texto)', removed: 'Link removido; o texto foi mantido.',
          auditTitle: 'Conferir links', auditMsg: '{n} links nesta página.',
          gBroken: 'Apontam para uma âncora que não existe', gEmpty: 'Sem destino',
          gSelf: 'Apontam para o próprio ato pelo endereço completo',
          gHttp: 'Usam http:// em vez de https://', gExternal: 'Fora do Planalto',
          goto: 'Ir até', more: 'e mais {n}…', close: 'Fechar',
          allGood: 'Nenhum problema encontrado nos links.',
        },
        check: {
          dialogTitle: 'Conferência final do ato', close: 'Fechar',
          found: '{n} ponto(s) para conferir.', clean: 'Nada a apontar.',
          allGood: 'O ato passou em todas as conferências.',
          sev: { erro: 'erro', aviso: 'aviso', dica: 'dica' },
          goto: 'Ir até', done: 'feito', more: 'e mais {n}…',
          noAnchor: 'Dispositivos sem âncora',
          noAnchorWhy: 'Outros atos apontam para artigos por #artN. Sem âncora, essa remissão é impossível.',
          createAnchor: 'Criar #{s}',
          badAnchor: 'Âncoras possivelmente colididos',
          badAnchorWhy: 'Uma âncora chamada artN num parágrafo (§) costuma vir de uma versão anterior que apagava o §.',
          brokenLinks: 'Links para âncoras que não existem',
          brokenLinksWhy: 'O leitor clica e não sai do lugar.',
          selfLinks: 'Links para o próprio ato pelo endereço completo',
          selfLinksWhy: 'Renomear uma âncora quebra estes links em silêncio; um destino curto (#nome) acompanha a mudança.',
          toFragment: 'Usar #{n}', httpLinks: 'Links em http://',
          httpLinksWhy: 'O portal serve em https://.', toHttps: 'Trocar para https',
          emptyLinks: 'Links sem destino', missing: 'Partes do ato que não encontrei',
          missingDou: 'Falta a nota "Este texto não substitui o publicado no DOU…"',
          missingEpigrafe: 'Não encontrei a epígrafe (DECRETO Nº …, DE … DE … DE …).',
          epigrafeNoLink: 'A epígrafe não tem o link de identificação do ato (Viw_Identificacao).',
          title: 'Título da página', noTitle: 'A página não tem título.',
          titleIsFilename: 'O título da página é "{t}" — o nome do arquivo, não o nome do ato.',
          setTitle: 'Definir',
          word: 'Resíduos de marcação do Word',
          wordWhy: 'Não quebram nada, mas engordam o arquivo. Reformatar o parágrafo pela barra do ato remove.',
          charset: 'Caracteres fora da codificação do arquivo',
          charsetWhy: 'Serão adaptados ao salvar. Confira se a adaptação é aceitável.',
          saveNudge: 'Salvo. A conferência aponta {n} ponto(s) que merecem atenção.',
          seeReport: 'Ver relatório',
        },
        template: {
          title: 'Novo ato a partir de um ato existente',
          message: 'Cole o endereço de um ato publicado no portal. O editor abre esse ato para você transformá-lo no novo.',
          open: 'Abrir', addressLabel: 'Endereço do ato',
          suggestions: 'Ou comece por um destes',
          unknown: 'Endereço fora do padrão do portal.',
          gutTitle: 'Manter só a estrutura?',
          gutMessage: 'Marque o que deve ser apagado. O cabeçalho com o brasão, o preâmbulo e as assinaturas são mantidos como modelo.',
          gutConfirm: 'Preparar o ato novo',
          gutCorpo: 'Apagar os artigos ({n} dispositivos)', gutAnexos: 'Apagar os anexos ({n})',
          gutEmenta: 'Limpar a ementa', gutEpigrafe: 'Limpar a epígrafe (número e data)',
          gutDou: 'Apagar a nota do DOU',
          ready: 'Ato preparado. Ele ainda não tem arquivo — use "Salvar como" para gravar o ato novo.',
          emptyHint: 'Abre um ato do portal e mantém a estrutura',
        },
        styleBar: {
          label: 'Estilo',
          placeholder: 'Estilo ({count})',
          empty: 'Sem estilos na página',
          hint: 'Selecione um trecho de texto e escolha um dos estilos que a própria página define no <style>',
          appliedToText: 'Estilo "{cls}" aplicado ao texto selecionado',
          appliedToBlocks: 'Estilo "{cls}" aplicado a {count} bloco(s)',
          appliedToElement: 'Estilo "{cls}" aplicado a {element}',
          nothingSelected: 'Selecione um texto ou um elemento antes de escolher o estilo.',
        },
        anchor: {
          title: 'Âncora',
          message: 'Uma âncora marca um trecho da página para que um link possa apontar direto para ele: endereco.gov.br/pagina.html#nome-da-ancora',
          nameLabel: 'Nome da âncora',
          namePlaceholder: 'ex.: consideracoes-finais',
          create: 'Criar âncora',
          close: 'Fechar',
          scopeText: 'Texto selecionado: "{text}"',
          scopeElement: 'Elemento selecionado: {element}',
          scopeNone: 'Selecione um texto ou um elemento na página antes de criar a âncora.',
          markerOnly: 'A seleção passa por mais de um parágrafo — foi inserida apenas uma marca de âncora no início.',
          invalidName: 'Dê um nome aa âncora.',
          listTitle: 'Âncoras desta página',
          empty: 'Esta página ainda não tem âncoras.',
          truncated: 'Mostrando {shown} de {total} âncoras.',
          chipAnchor: 'âncora',
          chipId: 'id',
          goto: 'Ir até',
          rename: 'Renomear',
          remove: 'Remover',
          created: 'Âncora criada — "#{id}" copiado para a área de transferência',
          renameTitle: 'Renomear âncora',
          renameMsg: 'Acentos e espaços são convertidos automaticamente.',
          renamed: 'Âncora renomeada para #{id}',
          renamedWithLinks: 'Âncora renomeada para #{id} — {count} link(s) da página atualizado(s)',
          removeTitle: 'Remover âncora',
          removeMsg: 'Remover a âncora "#{id}"? O texto da página é preservado; apenas a marca é apagada. Links que apontam para ele deixarão de funcionar.',
          removeConfirm: 'Remover âncora',
          removedUnwrapped: 'Âncora #{id} removido (texto preservado)',
          removedId: 'Âncora #{id} removido',
        },
        pageTitle: {
          title: 'Título da página',
          message: 'É o texto que aparece na aba do navegador, nos favoritos e nos resultados de busca. Fica em <head><title> e não aparece dentro da página.',
          placeholder: 'ex.: Centro de Estudos Jurídicos — Presidência da República',
          confirm: 'Definir título',
          updated: 'Título da página definido: {title}',
          noDoc: 'Abra ou importe uma página antes.',
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
          'Page & links': 'Página e links',
          Typography: 'Tipografia', Layout: 'Layout', Components: 'Componentes', Media: 'Mídia', Lists: 'Listas',
          Forms: 'Formulários', Navigation: 'Navegação', Tables: 'Tabelas', Raw: 'Bruto',
        },
        names: {
          Bookmark: 'Âncora', 'Page title': 'Título da página', 'E-mail link': 'Link de e-mail', 'Back to top': 'Voltar ao topo',
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
        appName: 'CEJ-PAGE',
        toolbar: {
          open: 'Open', import: 'Import', export: 'Export', save: 'Save', visual: 'Visual', source: 'Source',
          saveAs: 'Save as',
          importUrl: 'Import URL', importUrlHint: 'Import HTML from a URL',
          assetsDir: 'Assets folder', assetsDirHint: 'Link assets folder',
          fileLinked: '{name} (linked)', fileReadonly: '{name} (imported)',
          linkedHint: 'Live-linked to local file', readonlyHint: 'Imported - edit and use Save as to create a local file',
          saved: 'Saved', unsaved: '● Unsaved',
        },
        empty: {
          restore: 'Restore last session', age: '{age} ago · {name}',
          openEdit: 'Open and edit',
          openEditHint: 'Ctrl+S writes to the file itself',
          openCopy: 'Open a copy',
          openCopyHint: 'No link — saving asks where',
          openCopyTitle: 'Opens with no link to the file; saving will ask where to write',
        },
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
          addAttrPlaceholder: 'attribute name',
          stylePicker: 'Document styles',
          stylePickerHint: 'Apply one of the {count} styles the page already defines...',
          styleForTag: 'Defined for <{tag}>',
          styleForAny: 'For any element',
          styleForOther: 'Defined for other tags', invalidHtmlTitle: 'Invalid HTML',
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
          searchPlaceholder: 'Search blocks...', actionHint: '{name} — click to open',
          saveSelection: 'Save selection as snippet', saveSnippetTitle: 'Save selection as snippet',
          saveSnippetMsg: 'Give your snippet a name. It will appear in the Assets tab.', saveSnippetPlaceholder: 'snippet name',
          saveLabel: 'Save', snippetSaved: 'Snippet saved', deleteSnippet: 'Delete snippet',
          deleteSnippetTitle: 'Delete snippet "{name}"?', deleteSnippetMsg: 'This cannot be undone.', delete: 'Delete',
        },
        file: {
          fsaRequired: 'Live local editing requires Chrome/Edge. Use Import instead.',
          opened: 'Opened {name} - changes will save to disk', openError: 'Could not open file: {message}',
          imported: 'Imported {name} (edit and use Save as to write a file)', importError: 'Could not import: {message}',
          importedUrl: 'Imported {name} from the web (edit and use Save as to write a file)',
          importUrlTitle: 'Import HTML from URL',
          importUrlMsg: 'Paste a web page address that allows browser reads (CORS). The page will be copied into the editor; edit it and use Save as to write a file.',
          importUrlConfirm: 'Import',
          importUrlError: 'Could not import the URL: {message}',
          importUrlCors: 'the site blocked direct browser reading (CORS). Download the HTML and use Import HTML',
          saving: 'Saving...', saveFailed: 'Save failed: {message}', exported: 'Exported {name}', saved: 'Saved',
          savedAs: 'Saved as {name}',
          saveAsPromptTitle: 'Save as',
          saveAsPromptMsg: 'Type the file name. The browser will download it — if "Always ask you where to save files" is on, it will ask which folder to write to.',
          saveAsPromptConfirm: 'Save',
          saveAsPlaceholder: 'page.html',
          saveAsHintTitle: 'Choosing the folder when saving',
          saveAsHintFirefox: 'Firefox does not let a page open the system "Save in" window. To pick the folder on every save, turn this on once:\n\nMenu ≡ → Settings → General → Downloads → check "Always ask you where to save files".\n\nAfter that, every Save as will open the system window as usual.',
          saveAsHintGeneric: 'This browser does not let a page open the system "Save in" window. Turn on the ask-where-to-save option in your browser download settings, or use Chrome/Edge to write straight to the file.',
          saveAsHintDismiss: 'Got it, do not show again',
          saveAsHintLater: 'Remind me later',
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
        act: {
          groups: { ato: 'Act pieces', avancado: 'Advanced (ordinary pages)' },
          disp: { paragrafoUnico: 'Sole paragraph', inciso: 'item', alinea: 'sub-item',
                  item: 'point', preambulo: 'Preamble', decreta: 'Enacting clause',
                  notaDou: 'Official gazette note', artigo: 'Article', paragrafo: 'Paragraph', anexo: 'Annex' },
          roles: {
            epigrafe: { label: 'Heading', hint: 'The line with the act type, number and date — centred, navy blue.' },
            ementa: { label: 'Summary', hint: 'What the act provides for; right-aligned, maroon.' },
            preambulo: { label: 'Preamble', hint: 'The "THE PRESIDENT OF THE REPUBLIC, exercising the powers…" line.' },
            decreta: { label: 'Enacting clause', hint: 'Sits just before the first article.' },
            corpo: { label: 'Act body', hint: 'The standard paragraph formatting, leaving the text alone.' },
            artigo: { label: 'Article', hint: 'Formats as an article and, if missing, numbers it and creates the bookmark (#artN).' },
            paragrafo: { label: 'Paragraph (§)', hint: 'Formats as a numbered paragraph.' },
            paragrafoUnico: { label: 'Sole paragraph', hint: 'Formats as the sole paragraph.' },
            inciso: { label: 'Item', hint: 'Formats as a roman-numbered item (I, II, III…).' },
            alinea: { label: 'Sub-item', hint: 'Formats as a lettered sub-item (a, b, c…).' },
            item: { label: 'Point', hint: 'Formats as a numbered point.' },
            citacao: { label: 'Quote from another act', hint: 'Amended text, indented and quoted, ending in (NR).' },
            dataLocal: { label: 'Date and place', hint: 'The "Brasília, … ; 205th of Independence…" line.' },
            assinaturaPresidente: { label: "President's signature", hint: 'Name in caps, no first-line indent.' },
            assinaturaMinistro: { label: "Minister's signature", hint: 'As the President\'s, but italic.' },
            notaDou: { label: 'Official gazette note', hint: 'The "this text does not replace the one published in the DOU" line, in red.' },
            anexoTitulo: { label: 'Annex title', hint: 'ANNEX I, centred and bold.' },
            cabecalhoBrasao: { label: 'Coat-of-arms header', hint: 'The header block with the national coat of arms.' },
          },
          sample: {
            default: 'Type the text here.',
            epigrafe: 'DECREE No. 0,000, OF 0 MONTH 0000',
            ementa: 'Provides for … and takes other measures.',
            preambulo: 'THE PRESIDENT OF THE REPUBLIC, exercising the power conferred by article 84 of the Constitution, DECREES:',
            dataLocal: 'Brasília, 0 month 0000; 000th of Independence and 000th of the Republic.',
            assinaturaPresidente: 'NAME OF THE PRESIDENT',
            assinaturaMinistro: 'Name of the Minister',
            notaDou: 'This text does not replace the one published in the DOU of 0.0.0000',
            anexoTitulo: 'ANNEX I',
            citacao: '“Art. 0  …………………………………………………” (NR)',
          },
          apply: {
            done: 'Formatted as {role}.',
            doneMany: '{count} passages formatted as {role}.',
            nothing: 'Select a passage of text first.',
            insideTable: 'This passage is inside a table — act body formatting does not apply here.',
            hasStructure: 'This passage has structure inside it (a table or list). Format the inner paragraphs one by one.',
          },
          now: { noAnchor: 'no bookmark', near: 'approximate formatting', unformatted: 'not yet in the act format' },
          pieces: {
            cabecalho: 'Coat-of-arms header', tabelaAnexo: 'Annex table',
            ancora: 'Anchor', link: 'Link', colar: 'Paste from Word',
            titulo: 'Page title', conferir: 'Check the act',
          },
        },
        marks: {
          anchors: 'Bookmarks', links: 'Links',
          paragraphs: 'Paragraph ends (¶)', roles: 'Act roles (colour rail)',
          note: 'Marks show only in the editor. They are never written to the file.',
        },
        outline: {
          noDoc: 'Open an act to see its structure.',
          none: 'No act structure recognised on this page. Use the Tree tab.',
          missingAnchors: '{n} article(s) without a bookmark — other acts will not be able to point at them.',
          hasAnchor: 'Bookmark: #{name}', noAnchorShort: 'no bookmark',
          noAnchorHelp: 'This provision has no bookmark. Suggested: #{s}',
        },
        piece: {
          nothing: 'Click a paragraph of the act to see what it is and what you can do with it.',
          whatIs: 'What this passage is', unknown: 'Passage with no recognised role',
          noFormat: 'The formatting matches no act pattern. Pick one in the bar above.',
          exact: 'Formatted as {role}, exactly to the pattern.',
          near: 'Close to {role}, but with {n} difference(s).',
          seeDiffs: 'See the differences', diffMissing: 'missing', fixFormat: 'Adjust to the pattern',
          actions: 'Actions', makeLink: 'Turn into a link', addAnchor: 'Create a bookmark here',
          quickAnchor: 'Create bookmark #{s}', pasteWord: 'Paste text from Word',
          anchorCreated: 'Bookmark #{name} created.',
          links: 'Links in this passage', editLink: 'Edit',
          linkInPage: 'in this page: {n}', linkBroken: 'target does not exist: {n}',
          anchor: 'Bookmark', noAnchor: 'This passage has no bookmark.',
          copy: 'Copy', copied: 'Copied: {f}', rename: 'Rename', remove: 'Remove',
          text: 'Text', emptyText: '(empty)', chars: '{n} characters',
        },
        paste: {
          coldTitle: 'Paste text from Word',
          coldMessage: 'Paste the text copied from Word here (Ctrl+V). It will be formatted to the act pattern.',
          coldConfirm: 'Continue',
          title: 'How should this text be pasted?', subtitle: '{count} paragraph(s) on the clipboard.',
          confirm: 'Paste',
          modeAto: 'As act text', modeAtoDesc: 'Applies the act\'s standard formatting to each paragraph.',
          modeTexto: 'Text only, no formatting', modeTextoDesc: 'Keeps just the words.',
          modeOriginal: 'Keep the original formatting', modeOriginalDesc: 'Word\'s markup will be written to the file.',
          previewHead: 'Preview of the first paragraphs', plainRole: 'text',
          remember: 'Do not ask again this session',
          hugeTitle: 'Very large paste', hugeMsg: 'That is {count} paragraphs. It may take a while. Continue?',
          hugeConfirm: 'Continue',
          done: 'Pasted: ', doneOriginal: 'Pasted with Word\'s original formatting.',
          rPara: '{n} paragraphs', rWord: '{n} Word marks removed',
          rLinks: '{n} links kept', rImages: '{n} images dropped',
          rChars: '{n} characters will be adapted on save',
        },
        link: {
          title: 'Insert link', titleEdit: 'Edit link',
          message: 'Paste the act\'s address or pick a target in this page.',
          messageEdit: 'Change this link\'s target address.',
          create: 'Insert link', save: 'Save', addressLabel: 'Address',
          selectFirst: 'Select the text that should become a link first.',
          empty: 'Enter an address.',
          sectionDisp: 'Provision of this act', sectionAnchors: 'Existing bookmarks',
          sectionRecent: 'Recently used',
          noDisp: 'No article or annex recognised on this page.',
          noAnchors: 'This page has no bookmarks yet.', noRecent: 'Nothing yet.',
          annexFile: 'annex file',
          inThisPage: 'In this page: {alvo}',
          missingAnchor: 'Careful: this page has no bookmark named “{name}”.',
          external: 'External address (outside planalto.gov.br).',
          crossBlocks: 'The selection spans more than one paragraph. Select within a single one.',
          lostSelection: 'The selection was lost. Select the text again.',
          created: 'Link created.', updated: 'Link updated.',
          remove: 'Remove link (keep the text)', removed: 'Link removed; the text was kept.',
          auditTitle: 'Check links', auditMsg: '{n} links on this page.',
          gBroken: 'Point at a bookmark that does not exist', gEmpty: 'No target',
          gSelf: 'Point at this act by its full address',
          gHttp: 'Use http:// instead of https://', gExternal: 'Outside planalto.gov.br',
          goto: 'Go to', more: 'and {n} more…', close: 'Close',
          allGood: 'No problems found in the links.',
        },
        check: {
          dialogTitle: 'Final check of the act', close: 'Close',
          found: '{n} point(s) to review.', clean: 'Nothing to report.',
          allGood: 'The act passed every check.',
          sev: { erro: 'error', aviso: 'warning', dica: 'tip' },
          goto: 'Go to', done: 'done', more: 'and {n} more…',
          noAnchor: 'Provisions without a bookmark',
          noAnchorWhy: 'Other acts point at articles via #artN. Without a bookmark that cross-reference is impossible.',
          createAnchor: 'Create #{s}',
          badAnchor: 'Possibly collided bookmarks',
          badAnchorWhy: 'A bookmark named artN on a paragraph (§) usually comes from an earlier version that stripped the §.',
          brokenLinks: 'Links to bookmarks that do not exist',
          brokenLinksWhy: 'The reader clicks and nothing happens.',
          selfLinks: 'Links to this act by its full address',
          selfLinksWhy: 'Renaming a bookmark breaks these silently; a short target (#name) follows the change.',
          toFragment: 'Use #{n}', httpLinks: 'Links using http://',
          httpLinksWhy: 'The portal serves over https://.', toHttps: 'Switch to https',
          emptyLinks: 'Links with no target', missing: 'Parts of the act I could not find',
          missingDou: 'The "this text does not replace the one published in the DOU…" note is missing.',
          missingEpigrafe: 'I could not find the heading (DECREE No. …, OF … … …).',
          epigrafeNoLink: 'The heading has no act identification link (Viw_Identificacao).',
          title: 'Page title', noTitle: 'The page has no title.',
          titleIsFilename: 'The page title is "{t}" — the file name, not the act\'s name.',
          setTitle: 'Set',
          word: 'Leftover Word markup',
          wordWhy: 'Harmless, but it bloats the file. Reformatting the paragraph from the act bar removes it.',
          charset: 'Characters outside the file\'s encoding',
          charsetWhy: 'They will be adapted on save. Check that the adaptation is acceptable.',
          saveNudge: 'Saved. The check flags {n} point(s) worth a look.',
          seeReport: 'See report',
        },
        template: {
          title: 'New act from an existing act',
          message: 'Paste the address of an act published on the portal. The editor opens it so you can turn it into the new one.',
          open: 'Open', addressLabel: 'Act address',
          suggestions: 'Or start from one of these',
          unknown: 'Address outside the portal\'s pattern.',
          gutTitle: 'Keep only the structure?',
          gutMessage: 'Tick what should be deleted. The coat-of-arms header, preamble and signatures are kept as a model.',
          gutConfirm: 'Prepare the new act',
          gutCorpo: 'Delete the articles ({n} provisions)', gutAnexos: 'Delete the annexes ({n})',
          gutEmenta: 'Clear the summary', gutEpigrafe: 'Clear the heading (number and date)',
          gutDou: 'Delete the official gazette note',
          ready: 'Act prepared. It has no file yet — use "Save as" to write the new act.',
          emptyHint: 'Opens an act from the portal and keeps its skeleton',
        },
        styleBar: {
          label: 'Style',
          placeholder: 'Style ({count})',
          empty: 'No styles on this page',
          hint: "Select some text and pick one of the styles the page itself defines in its <style>",
          appliedToText: 'Style "{cls}" applied to the selected text',
          appliedToBlocks: 'Style "{cls}" applied to {count} block(s)',
          appliedToElement: 'Style "{cls}" applied to {element}',
          nothingSelected: 'Select some text or an element before picking a style.',
        },
        anchor: {
          title: 'Bookmark (anchor)',
          message: 'A bookmark marks a spot on the page so a link can point straight at it: example.gov.br/page.html#bookmark-name',
          nameLabel: 'Bookmark name',
          namePlaceholder: 'e.g. closing-remarks',
          create: 'Create bookmark',
          close: 'Close',
          scopeText: 'Selected text: "{text}"',
          scopeElement: 'Selected element: {element}',
          scopeNone: 'Select some text or an element on the page before creating the bookmark.',
          markerOnly: 'The selection spans more than one paragraph — only a bookmark marker was inserted at the start.',
          invalidName: 'Give the bookmark a name.',
          listTitle: 'Bookmarks on this page',
          empty: 'This page has no bookmarks yet.',
          truncated: 'Showing {shown} of {total} bookmarks.',
          chipAnchor: 'anchor',
          chipId: 'id',
          goto: 'Go to',
          rename: 'Rename',
          remove: 'Remove',
          created: 'Bookmark created — "#{id}" copied to the clipboard',
          renameTitle: 'Rename bookmark',
          renameMsg: 'Accents and spaces are converted automatically.',
          renamed: 'Bookmark renamed to #{id}',
          renamedWithLinks: 'Bookmark renamed to #{id} — {count} in-page link(s) updated',
          removeTitle: 'Remove bookmark',
          removeMsg: 'Remove the bookmark "#{id}"? The page text is kept; only the marker is dropped. Links pointing at it will stop working.',
          removeConfirm: 'Remove bookmark',
          removedUnwrapped: 'Bookmark #{id} removed (text kept)',
          removedId: 'Bookmark #{id} removed',
        },
        pageTitle: {
          title: 'Page title',
          message: 'The text shown in the browser tab, in bookmarks and in search results. It lives in <head><title> and never appears inside the page.',
          placeholder: 'e.g. Legal Studies Centre — Presidency of the Republic',
          confirm: 'Set title',
          updated: 'Page title set: {title}',
          noDoc: 'Open or import a page first.',
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

    // The product name is the same in every language; the empty screen
    // carries nothing else but the three ways in.
    setText('.empty-inner h1', 'CEJ-PAGE');
    // The two buttons are named after the CONSEQUENCE, not the mechanism.
    // "Abrir arquivo local" vs "Importar HTML" described how the browser gets
    // the bytes — a distinction nobody can act on. What actually differs is
    // what Ctrl+S does afterwards, so that is what the labels say.
    setText('#empty-open-local span', t('ui.empty.openEdit'));
    setText('#empty-open-local small', t('ui.empty.openEditHint'));
    setAttr('#empty-open-local', 'title', t('ui.empty.openEditHint'));
    setText('#empty-import span', t('ui.empty.openCopy'));
    setText('#empty-import small', t('ui.empty.openCopyHint'));
    setAttr('#empty-import', 'title', t('ui.empty.openCopyTitle'));
    setText('#empty-import-url span', t('ui.toolbar.importUrl'));
    setText('#empty-import-url small', current === 'pt-BR' ? 'Edite e use Salvar como' : 'Edit and save as a local file');
    setAttr('#empty-import-url', 'title', t('ui.toolbar.importUrlHint'));
    setText('#empty-new span', current === 'pt-BR' ? 'Começar em branco' : 'Start Blank');
    setText('#empty-new small', current === 'pt-BR' ? 'Página vazia' : 'Empty page');
    setText('#browser-warning', t('ui.file.browserWarnFallback'));

    const autosave = document.querySelector('.autosave');
    if (autosave) {
      const time = document.getElementById('autosave-time');
      autosave.textContent = current === 'pt-BR' ? 'Auto-salvo ' : 'Autosaved ';
      if (time) autosave.appendChild(time);
    }

    setText('#tb-open span', t('ui.toolbar.open'));
    setText('#tb-import span', t('ui.toolbar.import'));
    setText('#tb-import-url span', t('ui.toolbar.importUrl'));
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

    // The act bar's own buttons. The role chips translate themselves via
    // ActBar, which rebuilds on i18n:changed.
    setText('#act-bar-paste span', t('ui.act.pieces.colar'));
    setText('#act-bar-link span', t('ui.act.pieces.link'));
    setAttr('#act-bar-links', 'title', t('ui.link.auditTitle'));
    setAttr('#act-bar-check', 'title', t('ui.check.dialogTitle'));
    setAttr('#act-bar-paste', 'title', t('ui.paste.coldTitle') + ' (Ctrl+Shift+V)');
    setAttr('#act-bar-link', 'title', t('ui.link.title') + ' (Ctrl+K)');
    setText('#empty-from-act span', t('ui.template.title'));
    setText('#empty-from-act small', t('ui.template.emptyHint'));

    setText('.left-sidebar .sidebar-tabs .tab[data-tab="outline"]', current === 'pt-BR' ? 'Estrutura' : 'Structure');
    setText('.left-sidebar .sidebar-tabs .tab[data-tab="blocks"]', current === 'pt-BR' ? 'Peças' : 'Pieces');
    setText('.left-sidebar .sidebar-tabs .tab[data-tab="tree"]', current === 'pt-BR' ? 'Árvore' : 'Tree');
    setText('.left-sidebar .sidebar-tabs .tab[data-tab="assets"]', current === 'pt-BR' ? 'Arquivos' : 'Files');

    setText('.right-sidebar .sidebar-tabs .tab[data-tab="piece"]', current === 'pt-BR' ? 'Este trecho' : 'This passage');
    setText('.right-sidebar .sidebar-tabs .tab[data-tab="advanced"]', current === 'pt-BR' ? 'Avançado' : 'Advanced');
    setText('.right-sidebar .sidebar-tabs .tab[data-tab="style"]', current === 'pt-BR' ? 'Estilo' : 'Style');
    setText('.right-sidebar .sidebar-tabs .tab[data-tab="attrs"]', current === 'pt-BR' ? 'Atributos' : 'Attributes');
    setText('.right-sidebar .sidebar-tabs .tab[data-tab="html"]', 'HTML');

    setText('.assets-section:nth-of-type(1) h3', current === 'pt-BR' ? 'Snippets' : 'Snippets');
    setText('.assets-section:nth-of-type(1) .hint', current === 'pt-BR' ? 'Blocos salvos por você' : 'Saved blocks of your own');
    setText('.assets-section:nth-of-type(2) h3', current === 'pt-BR' ? 'Arquivos recentes' : 'Recent files');

    // Same distinction as the two empty-state buttons: what Ctrl+S will do.
    setAttr('#tb-open', 'title', t('ui.empty.openEditHint'));
    setAttr('#tb-import', 'title', t('ui.empty.openCopyTitle'));
    setAttr('#tb-import-url', 'title', t('ui.toolbar.importUrlHint'));
    // Icon-only button: the tooltip is its only label. When the browser has no
    // directory picker (Firefox) FileOps disables it and explains why — keep
    // that explanation instead of overwriting it on every language switch.
    const assetsBtn = document.getElementById('tb-assets-dir');
    if (assetsBtn) {
      assetsBtn.title = assetsBtn.disabled
        ? t('ui.file.assetsDirUnsupported')
        : (current === 'pt-BR' ? 'Pasta de assets - vincular pasta para imagens/assets locais' : 'Assets folder - link folder for local images/assets');
    }
    setAttr('#tb-export', 'title', current === 'pt-BR' ? 'Exportar HTML' : 'Export HTML');
    setAttr('#tb-save-as', 'title', current === 'pt-BR' ? 'Salvar como (Ctrl+Shift+S)' : 'Save as (Ctrl+Shift+S)');
    setAttr('#tb-save', 'title', current === 'pt-BR' ? 'Salvar (Ctrl+S)' : 'Save (Ctrl+S)');

    setAttr('#tb-refresh', 'title', t('ui.file.refreshDiskBtn'));
    setAttr('#tb-diff', 'title', current === 'pt-BR' ? 'Mostrar diff vs. arquivo no disco' : 'Show diff vs. file on disk');
    setAttr('#tb-git-diff', 'title', current === 'pt-BR' ? 'Mostrar diff vs. git HEAD (pede diretório do repo)' : 'Show diff vs. git HEAD (asks for repo directory)');
    // The toolbar's class dropdown is gone — the act formatting bar replaced
    // it. The class picker itself lives on, under Avançado → Atributos, and
    // still uses the ui.styleBar.* strings for its toasts.
    setAttr('#tb-anchors', 'title', current === 'pt-BR'
      ? 'Marcas de revisão: âncoras, links, fim de parágrafo, papéis do ato - só no editor, nunca salvas'
      : 'Revision marks: bookmarks, links, paragraph ends, act roles - editor-only, never saved');
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
