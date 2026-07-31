# Launcher

Gera o `CEJ-PAGE.exe`: um executável único que embute o site inteiro, sobe um
servidor em `127.0.0.1` e abre o navegador padrão.

O diretório `site/` **não é versionado** — ele é montado no momento da
compilação copiando os arquivos do editor (veja
`.github/workflows/windows-exe.yml`). Sem ele, `go build` falha em `//go:embed`.

## Compilar

O caminho normal é o GitHub Actions: aba **Actions** → **Build Windows
executable** → **Run workflow**. O `.exe` fica anexado ao resultado, e não é
preciso instalar nada na sua máquina.

Para compilar localmente (requer Go 1.24+ — versões anteriores geram binários
macOS sem `LC_UUID`, que o dyld recusa), a partir da raiz do repositório:

```sh
./tools/launcher/build.sh          # gera dist/CEJ-PAGE.exe
./tools/launcher/build.sh host     # gera um binário para a máquina atual
```

## Por que um servidor local, e não abrir o index.html direto

A gravação em disco usa a File System Access API, que exige um contexto seguro
com origem real — `file://` não serve. O importmap dos módulos ESM também não
resolve em `file://`. `http://127.0.0.1` conta como contexto seguro, então tudo
funciona sem HTTPS nem certificado.
