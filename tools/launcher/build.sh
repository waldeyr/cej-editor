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

# Everything the browser needs, and nothing else — no .git, no tooling.
rm -rf "$SITE"
mkdir -p "$SITE"
cp "$ROOT/index.html" "$SITE/"
cp -R "$ROOT/css" "$ROOT/js" "$ROOT/vendor" "$SITE/"

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
