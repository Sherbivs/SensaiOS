#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "${ROOT_DIR}" >/dev/null

if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
elif command -v node.exe >/dev/null 2>&1; then
  NODE_BIN="$(command -v node.exe)"
else
  echo "::error::Node.js is not available on PATH" >&2
  exit 1
fi

SCRIPT_PATH="${ROOT_DIR}/scripts/build_dexpack.ts"
if command -v wslpath >/dev/null 2>&1; then
  SCRIPT_PATH="$(wslpath -w "${SCRIPT_PATH}")"
fi

echo "Verifying committed dexpack artifacts (json/gzip/module)..."
"${NODE_BIN}" --no-warnings --import tsx "${SCRIPT_PATH}" --check

echo "Dexpack artifacts are up to date (json/gzip/module)."
