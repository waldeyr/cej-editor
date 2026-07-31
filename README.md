# CEJ-PAGE

Editor visual de HTML que roda no navegador. Abra um arquivo `.html` do seu
computador, edite clicando e arrastando, e salve de volta no disco — sem
cadastro, sem upload, sem servidor.

Feito para editar documentos legados em **ISO-8859-1 / Windows-1252**
(atos normativos publicados pelo Planalto e afins): a codificação do arquivo
é detectada na abertura e reproduzida byte a byte ao salvar.

## Como executar no Windows

Baixe o `CEJ-PAGE.exe` mais recente em
[Releases](https://github.com/waldeyr/cej-page/releases) e dê **duplo clique**.

O programa abre uma janela preta com a mensagem *"CEJ-PAGE está em execução"* e
o editor aparece no seu navegador. **Para encerrar, feche a janela preta.**

Não precisa instalar nada, não precisa de senha de administrador e não precisa
de internet — o programa é um arquivo único e funciona offline.

> **Na primeira execução o Windows pode exibir "O Windows protegeu o seu
> computador".** Isso acontece porque o arquivo não tem assinatura digital paga,
> não porque haja algo errado com ele. Clique em **Mais informações** e depois em
> **Executar assim mesmo**.

## Codificação de caracteres

Este é o motivo de o projeto existir, então vale detalhar.

Ao abrir um arquivo, o editor determina a codificação a partir do BOM, da
`<meta charset>` do próprio documento ou — se não houver declaração — dos bytes.
Essa codificação passa a ser uma propriedade do documento e é usada em **Salvar**,
**Salvar como** e **Exportar**. Um decreto em Windows-1252 continua em
Windows-1252, com as aspas curvas e travessões nos mesmos bytes de origem.

A codificação atual aparece num selo ao lado do nome do arquivo, destacado em
laranja quando é uma codificação legada. Clicar no selo converte o documento
entre UTF-8 e ISO-8859-1 — reescrevendo os bytes **e** a `<meta charset>` juntos.

Se você digitar um caractere que a codificação de destino não comporta, ele é
adaptado automaticamente e um aviso informa o que mudou:

| Digitado | Gravado | Como |
| --- | --- | --- |
| `—` `–` `“ ”` `…` `•` | os mesmos caracteres | existem em Windows-1252 |
| `→` `≤` `✓` | `->` `<=` `OK` | transliteração |
| 🙂 👍 | `:-)` `(+1)` | transliteração |
| `ș` `ă` | `s` `a` | remoção de diacrítico |
| `漢` 🚀 | `&#28450;` `&#128640;` | referência numérica |

## Atalhos de teclado

| Atalho | Ação |
| --- | --- |
| `Ctrl+S` | Salvar no arquivo vinculado (ou exportar) |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Desfazer / refazer |
| `Ctrl+D` | Duplicar seleção |
| `Delete` / `Backspace` | Excluir seleção |
| `Esc` | Desselecionar |
| `Ctrl+↑` / `Ctrl+↓` | Mover seleção para cima / baixo |
| `P` | Alternar modo de visualização |
| Clique duplo | Editar texto no lugar |

Na tela inicial, `A` abre um arquivo local, `B` importa, `C` começa em branco e
`R` restaura a última sessão.

## Como funciona

O HTML do usuário é carregado num iframe de mesma origem. O editor observa
cliques, acompanha mudanças com um `MutationObserver` e aplica alterações de
estilo, atributos e marcação. Uma camada de sobreposição no documento pai desenha
o contorno de seleção, o destaque de hover e os indicadores de arraste.

A gravação em disco usa a
[File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API):
ao escolher um arquivo, o navegador entrega ao editor uma referência persistente
de escrita. Salvar codifica o documento e grava os bytes de volta. Nada é enviado
para lugar nenhum.

Safari e Firefox não implementam essa API — neles o editor funciona com
importar / exportar.

Ao salvar, o `<head>` do documento é preservado literalmente sempre que não foi
editado, para que o diff mostre apenas o que você realmente mudou.

## Desenvolvimento

É um site estático, sem etapa de build. Qualquer servidor local serve:

```sh
python3 -m http.server 8000
# abra http://localhost:8000
```

`localhost` conta como contexto seguro, então a gravação em disco funciona
normalmente em desenvolvimento.

Verificação de sintaxe:

```sh
for f in js/*.js; do node --check "$f"; done
```

## Arquitetura

```
index.html              — casca do editor (barra + 3 painéis + rodapé)
css/editor.css          — estilos, temas claro/escuro
js/i18n.js              — textos pt-BR / en (pt-BR é o padrão)
js/encoding.js          — detecção e gravação de codificação
js/state.js             — estado global, desfazer/refazer, autosave, snippets
js/blocks.js            — biblioteca de componentes
js/canvas.js            — iframe, seleção, arrastar-e-soltar
js/tree.js              — painel da árvore DOM + breadcrumbs
js/properties.js        — abas de estilo / atributos / HTML
js/blocks-panel.js      — barra lateral de blocos e snippets
js/asset-resolver.js    — resolução de imagens locais no preview
js/file.js              — abrir, salvar, exportar
js/diff.js              — comparação com o disco e com o git
js/git.js               — leitura do HEAD via isomorphic-git
js/keyboard.js          — atalhos globais
js/editor.js            — inicialização e ligação da interface
vendor/                 — bibliotecas embutidas (funcionamento offline)
tools/launcher/         — programa Go que gera o CEJ-PAGE.exe
```

## Licença

[MIT](LICENSE).

Derivado de [mncoleman/html-editor](https://github.com/mncoleman/html-editor),
também sob licença MIT.
