#!/bin/sh
# Start the dsh web profile with the local web-mirror patch AND hot reload.
#
# HMR requires the dsh process to run with node --expose-internals (the hmr
# plugin reads the internal ESM loader to map the module graph). That flag
# is rejected in NODE_OPTIONS, so we invoke node on the resolved dsh entry
# directly instead of the `dsh` shim.
#
# Pair with `pnpm dev` (tsc --watch) in another terminal: editing src/
# recompiles lib/, hmr sees the change and reloads the plugin in place.
#
# Usage:
#   ./scripts/start-hmr.sh                 # patch: ./cordis.patch.local.yml
#   PATCH=./cordis.patch.yml ./scripts/start-hmr.sh
#   PROFILE=web ./scripts/start-hmr.sh     # default profile is web

set -eu

ROOT="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
PROFILE="${PROFILE:-web}"
PATCH="${PATCH:-$ROOT/cordis.patch.local.yml}"

# Regenerate the local patch so it always matches this checkout's path.
if [ "$PATCH" = "$ROOT/cordis.patch.local.yml" ]; then
  "$ROOT/scripts/gen-local-patch.sh" >/dev/null
fi

# Resolve the real dsh entry (the `dsh` shim is #!/usr/bin/env node; we need
# to pass node flags, so call the underlying bin.js with node ourselves).
DSH_BIN="$(command -v dsh || true)"
if [ -z "$DSH_BIN" ]; then
  echo "start-hmr: 'dsh' not found on PATH" >&2
  exit 1
fi
DSH_ENTRY="$(readlink -f "$DSH_BIN" 2>/dev/null || realpath "$DSH_BIN")"

echo "start-hmr: profile=$PROFILE patch=$PATCH"
echo "start-hmr: entry=$DSH_ENTRY"
echo "start-hmr: run 'pnpm dev' in another terminal for auto-recompile"
exec node --expose-internals "$DSH_ENTRY" --profile "$PROFILE" --patch "$PATCH"
