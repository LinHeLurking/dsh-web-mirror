#!/bin/sh
# Generate cordis.patch.local.yml — a dsh --patch overlay that loads the
# web-mirror plugin from THIS checkout by absolute path, so no symlinks or
# installs into ~/.dsh are needed.
#
# Usage:
#   ./scripts/gen-local-patch.sh                 # write ./cordis.patch.local.yml
#   ./scripts/gen-local-patch.sh -               # print to stdout
#   PORT=4280 ./scripts/gen-local-patch.sh       # override port
#   HOST=0.0.0.0 ID=my-mirror ./scripts/gen-local-patch.sh
#
# Then boot with:
#   dsh --profile web --patch "$(pwd)/cordis.patch.local.yml"

set -eu

ROOT="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
ENTRY="$ROOT/lib/index.js"

ID="${ID:-web-mirror}"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3180}"
OUT="${1:-$ROOT/cordis.patch.local.yml}"

if [ ! -f "$ENTRY" ]; then
  echo "gen-local-patch: missing $ENTRY — run 'pnpm build' (or npm run build) first" >&2
  exit 1
fi

yaml() {
  printf -- '- insert:\n    - id: %s\n      name: %s\n      config:\n        host: %s\n        port: %s\n' \
    "$ID" "$ENTRY" "$HOST" "$PORT"
}

if [ "$OUT" = '-' ]; then
  yaml
else
  yaml > "$OUT"
  echo "wrote $OUT"
  echo "boot with: dsh --profile web --patch \"$OUT\""
fi
