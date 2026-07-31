#!/usr/bin/env bash
# Assemble tools/launcher/site/ from the editor sources and compile the
# launcher. Run from anywhere; paths are resolved against the repo root.
#
#   ./tools/launcher/build.sh          -> dist/CEJ-PAGE.exe   (Windows amd64)
#   ./tools/launcher/build.sh host     -> dist/cej-page       (this machine)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LAUNCHER="$ROOT/tools/launcher"
SITE="$LAUNCHER/site"

# Go is the only build dependency, and it isn't needed at all for the normal
# release path. Say so plainly rather than dying on "go: command not found".
if ! command -v go > /dev/null 2>&1; then
  # A manually extracted toolchain is common on machines without Homebrew.
  for candidate in /usr/local/go/bin /opt/homebrew/opt/go/libexec/bin "$HOME/go/bin" "$HOME/sdk/go/bin"; do
    if [ -x "$candidate/go" ]; then PATH="$candidate:$PATH"; break; fi
  done
fi

if ! command -v go > /dev/null 2>&1; then
  cat >&2 <<'MSG'

  Go não encontrado — é a única dependência para compilar o executável.

  Você provavelmente não precisa dele. O caminho normal é o GitHub Actions:

      aba Actions -> "Build Windows executable" -> "Run workflow"

  e o CEJ-PAGE.exe fica anexado ao resultado, sem instalar nada.

  Se quiser mesmo compilar aqui, instale o Go 1.24 ou superior:

      brew install go                      # macOS com Homebrew
      https://go.dev/dl/                   # instalador oficial

  (Versões anteriores à 1.24 geram binários macOS sem LC_UUID, que o
  dyld recusa a carregar. O alvo Windows não é afetado.)

MSG
  exit 1
fi

# Everything the browser needs, and nothing else — no .git, no tooling.
rm -rf "$SITE"
mkdir -p "$SITE"
cp "$ROOT/index.html" "$SITE/"
cp -R "$ROOT/css" "$ROOT/js" "$ROOT/vendor" "$SITE/"

# The version chip fetches this. Without it every launch logs a 404, and a
# user reporting a problem has no way to say which build they are running.
SHA="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
REF="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
cat > "$SITE/version.json" <<JSON
{
  "sha": "$SHA",
  "short": "$(printf '%.7s' "$SHA")",
  "ref": "$REF",
  "built_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON

mkdir -p "$ROOT/dist"
cd "$LAUNCHER"

if [ "${1:-windows}" = "host" ]; then
  # Unstripped: -s -w drops LC_UUID, which macOS dyld refuses to load. This
  # build is only for local testing, so size doesn't matter.
  go build -trimpath -o "$ROOT/dist/cej-page" .
  echo "built dist/cej-page"
else
  GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o "$ROOT/dist/CEJ-PAGE.exe" .
  echo "built dist/CEJ-PAGE.exe"
fi

du -h "$ROOT/dist/"* | sed 's/^/  /'
