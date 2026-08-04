# Verificação

Harnesses que rodam os módulos reais contra o ato real
(`d12990.html`, 3,4 MB, windows-1252). Não há dependências: são páginas HTML
que carregam os mesmos `js/*.js` que o editor carrega.

| Arquivo | O que verifica |
| --- | --- |
| `harness.html` | Reconhecimento: `detectDispositivo`, `matchFormat`, `outline`, `inspect`, e que `applyRole` preserva texto, links e indicadores enquanto remove a marcação do Word |
| `harness-bytes.html` | **A garantia que não pode falhar**: abrir e salvar sem editar produz o arquivo idêntico byte a byte; editar um parágrafo reescreve só aquele trecho; nenhum rastro do editor sobrevive ao salvamento |
| `harness-ui.html` | O editor montado: módulos carregados, barra do ato, abas, peças, busca, leitura de endereços, marcas, limpeza da colagem e interpolação dos textos |
| `harness-open.html` | A diferença entre *Abrir e editar* e *Abrir uma cópia*: os rótulos nos dois idiomas, e que arrastar um arquivo pede o handle real e mantém o vínculo com o disco |
| `harness-shot.html` | Carrega o ato real no editor para inspeção visual / captura de tela |

## Como rodar

```sh
python3 -m http.server 8777
```

Depois abra `http://localhost:8777/tests/harness.html` (e os demais) no
navegador. O resultado aparece na própria página, no formato
`N ok, M falhas`.

Sem interface, com o Chrome:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --virtual-time-budget=40000 \
  --dump-dom http://localhost:8777/tests/harness.html
```

## Por que estes números aparecem nas asserções

Medidos no `d12990.html`, e é o que os torna úteis como regressão:

- 6.798 parágrafos, 31 tabelas, 27 âncoras `<a name>`
- 4 artigos e 23 anexos — se a varredura entrasse nas tabelas dos anexos, o
  outline teria milhares de linhas em vez de 36
- 6.640 parágrafos estão dentro de tabelas de anexo e **nenhum** pode ser lido
  como dispositivo do ato
- 7 parágrafos carregam a receita exata do corpo do ato
