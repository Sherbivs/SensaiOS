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

SCRIPT_V1_PATH="${ROOT_DIR}/scripts/build_dexpack.ts"
SCRIPT_V2_PATH="${ROOT_DIR}/scripts/build-dexpack.ts"
if command -v wslpath >/dev/null 2>&1; then
  SCRIPT_V1_PATH="$(wslpath -w "${SCRIPT_V1_PATH}")"
  SCRIPT_V2_PATH="$(wslpath -w "${SCRIPT_V2_PATH}")"
fi

echo "Verifying committed dexpack v1 artifacts (json/gzip/module)..."
"${NODE_BIN}" --no-warnings --import tsx "${SCRIPT_V1_PATH}" --check
echo "Dexpack v1 artifacts are up to date."

echo "Verifying committed dexpack v2 artifacts (binary/manifest/accessors)..."
"${NODE_BIN}" --no-warnings --import tsx "${SCRIPT_V2_PATH}" --check
echo "Dexpack v2 artifacts are up to date."
