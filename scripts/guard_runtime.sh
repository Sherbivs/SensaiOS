#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

fail=0

error() {
  echo "::error::$1"
  fail=1
}

if [[ "${NODE_ENV:-}" == "production" ]]; then
  if [[ -z "${DATABASE_URL:-}" ]]; then
    error "DATABASE_URL must be set when NODE_ENV=production."
  fi

  if [[ "${DATABASE_URL:-}" =~ localhost || "${DATABASE_URL:-}" =~ 127\.0\.0\.1 || "${DATABASE_URL:-}" =~ ::1 ]]; then
    error "DATABASE_URL must not point to localhost when NODE_ENV=production."
  fi
fi

for doc in Patch.md Prompt.md tasklist.md; do
  if [[ ! -r "$doc" ]]; then
    error "Required contract document $doc is not readable."
  fi
done

if ! rg -q "name:\s*infinity-gauntlet-app-worker" render.yaml; then
  error "render.yaml is missing the infinity-gauntlet-app-worker service."
fi

if ! rg -q "name:\s*infinity-gauntlet-app-worker[\s\S]*property:\s*connectionString" render.yaml; then
  error "render.yaml worker must source DATABASE_URL from the database connectionString."
fi

exit $fail
