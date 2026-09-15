#!/bin/sh
# Point git at the repo-tracked githooks/ directory so hooks are shared
# across clones. Safe to re-run; idempotent.
set -eu
ROOT="$(git rev-parse --show-toplevel)"
git config core.hooksPath githooks
echo "core.hooksPath set to githooks (in $ROOT)"
