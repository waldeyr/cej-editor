# CEJ-EDITOR

Editor de Atos Normativos desenvolvido para elaboração, importação, edição, validação e exportação de textos legislativos no padrão do Centro de Estudo Jurídicos da Secretaria Especial para Assuntos Jurídicos da Casa Civil da Presidência da República (CEJ/SAJ/PR).

## Descrição do Projeto

O CEJ-EDITOR é uma aplicação Web e Desktop (Electron) destinada ao suporte à redação técnica legislativa. O sistema realiza a importação de arquivos RTF e DOCX, a estrutura de artigos, parágrafos, incisos e alíneas, a validação de regras formais de sequenciamento e a exportação em HTML conforme as diretrizes oficiais. Arquivos `.doc` que contenham RTF são aceitos; documentos Word binários legados devem ser convertidos para DOCX ou RTF antes da importação.

### Funcionalidades

- **Gerenciamento de Codificação de Caracteres**: Padrão de gravação definido como **ISO-8859-1 (Windows-1252)**, com opção de alteração para UTF-8 e UTF-16LE, garantindo a preservação de acentuação em sistemas legados.
- **Estruturação Sagitário**: Botões que aplicam ao texto selecionado o tipo de agrupador ou dispositivo da estrutura legislativa (Parte, Livro, Título, Subtítulo, Capítulo, Seção, Subseção, Artigo, Parágrafo, Inciso, Alínea, Item, Alteração/Aspas e Omissis), com numeração deduzida da posição do dispositivo no ato — ou respeitando o número que o redator tenha escrito junto com o texto. A seleção pode atravessar vários dispositivos, e todos os que ela alcança são convertidos na ordem em que estão no ato. A criação de conteúdo novo cabe ao botão "Novo conteúdo".
- **Formatar não escreve**: Nenhum botão de formatação insere texto no ato. A conversão muda o tipo e a numeração do dispositivo, e o texto na folha continua sendo palavra por palavra o que o redator escreveu; o dispositivo criado por um clique nasce vazio, com a frase de espera desenhada pela interface — que não faz parte do documento e some ao primeiro caractere.
- **Renumeração**: Botão que refaz a numeração dos dispositivos pela ordem em que eles estão no ato — de todo o texto, ou apenas do trecho selecionado. Rótulos escritos à mão, como o `Art. 5º-A` de uma inclusão ou o `Parágrafo único.`, são preservados e não deslocam a série.
- **Alinhamento e Formatação de Texto**: Botões para alinhamento (à esquerda, centralizado, à direita e justificado), negrito, itálico, sublinhado, sobrescrito, subscrito e limpeza de formatação, além da inserção de links externos e âncoras internas. Todos agem sobre o trecho selecionado, ainda que ele atravesse mais de um dispositivo.
- **Remissões Visíveis**: O destino de cada remissão da folha aparece em etiqueta ao passar o ponteiro sobre ela — a URL, no caso de link externo; o nome da âncora e o dispositivo a que ela leva, no caso de remissão interna ao ato.
- **Edição Avançada de Tabelas**: Importação RTF de tabelas com mesclagem horizontal/vertical (`colspan`/`rowspan`), adição de células completando a coluna (à esquerda e à direita), mesclagem e separação (split) aplicadas à célula selecionada e redimensionamento individual.
- **Importação de Word**: Conversão local de documentos DOCX para HTML antes da classificação legislativa, preservando parágrafos e tabelas compatíveis.
- **Controle de Histórico**: Pilha de histórico para desfazer e refazer alterações (até 50 estados) via interface e atalhos de teclado (`Ctrl+Z` e `Ctrl+Y`).
- **Validação Normativa**: Verificação de consistência e sequenciamento numérico dos dispositivos em tempo real.

## Interface do Usuário

![CEJ-EDITOR - Interface Principal](./public/screenshot.png)

## Tecnologias e Versões

As versões abaixo são as declaradas no `package.json`. A integração contínua compila e testa o projeto com **Node.js 20**.

| Tecnologia | Versão | Função |
| :--- | :--- | :--- |
| **Node.js** | `>= 18.0.0` | Ambiente de execução JavaScript/TypeScript |
| **React** | `^18.2.0` | Biblioteca para construção de interfaces gráficas |
| **TypeScript** | `^5.3.3` | Linguagem para tipagem estática de código |
| **Vite** | `^5.1.4` | Ferramenta de build e servidor de desenvolvimento |
| **Electron** | `^29.1.0` | Framework para execução em ambiente desktop |
| **TailwindCSS** | `^4.0.0` | Framework utilitário para estilização CSS |
| **Lucide React** | `^0.344.0` | Conjunto de ícones para interface |
| **Mammoth** | `^1.12.1` | Conversão de DOCX para HTML na importação |
| **Vitest** | `^1.3.1` | Framework para testes unitários |
| **Esbuild** | `^0.20.1` | Bundler para scripts da camada Electron |

## Instalação e Execução

### Requisitos

Possuir o **Node.js** (versão 18 ou superior) e o **npm** instalados.

```bash
node -v
npm -v
```

### Instalação

```bash
# Clonar o repositório
git clone https://github.com/waldeyr/cej-editor.git

# Acessar o diretório
cd cej-editor

# Instalar dependências
npm install
```

### Execução em Desenvolvimento (Web)

```bash
npm run dev
```

A aplicação estará acessível em `http://localhost:3000` (porta definida em `vite.config.ts`).

### Execução dos Testes Unitários

```bash
npm test
```

### Compilação para Produção

```bash
npm run build
```

### Empacotamento Desktop (Electron)

```bash
npm run build:desktop
```

Os artefatos gerados serão salvos no diretório `dist-desktop/`, com a versão no nome
de cada arquivo — `CEJ-EDITOR-0.2.0.dmg`, `CEJ-EDITOR Setup 0.2.0.exe`,
`CEJ-EDITOR-0.2.0.AppImage` e assim por diante.

## Versão e Publicação

A versão corrente é a **v0.2**, declarada como `0.2.0` no `package.json`. A numeração
foi reiniciada abaixo de 1.0 para refletir a maturidade real do editor: a marca 1.0
fica reservada para quando o ciclo completo — importar, redigir, validar e exportar —
estiver homologado pela área técnica.

Uma versão é publicada empurrando uma tag `vX.Y.Z` igual à versão do `package.json`:

```bash
# 1. Ajustar a versão no package.json (por exemplo, 0.2.0)
# 2. Registrar o commit da versão
git commit -am "v0.2"

# 3. Criar e empurrar a tag
git tag -a v0.2.0 -m "CEJ-EDITOR v0.2"
git push origin main
git push origin v0.2.0
```

A tag dispara o fluxo `.github/workflows/release.yml`, que compila em Windows, Linux e
macOS e produz:

| Sistema | Artefatos |
| :--- | :--- |
| **Windows** | Instalador NSIS (`.exe`) e executável portátil |
| **Linux** | `.AppImage` e pacote `.deb` |
| **macOS** | Imagem de disco `.dmg` e arquivo `.zip` |

Os instaláveis são anexados ao *release* do GitHub correspondente à tag e também ficam
disponíveis como artefatos da execução do fluxo, nomeados
`cej-editor-<tag>-<sistema-operacional>`.

A tag e a versão do `package.json` precisam coincidir: o nome do *release* é montado a
partir do `package.json`, e não da tag. Divergir entre as duas faz o fluxo publicar num
*release* diferente daquele que a tag criou.

O disparo manual do fluxo (*workflow_dispatch*) compila os três sistemas sem publicar
nada — serve para conferir que o empacotamento continua de pé fora de uma versão.

## Licença

Este projeto está licenciado sob a licença [Apache 2.0](LICENSE).
