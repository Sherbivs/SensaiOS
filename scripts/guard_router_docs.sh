#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null)"
if [[ -z "$ROOT_DIR" ]]; then
  echo "Unable to resolve git root. Run from inside the repository." >&2
  exit 1
fi

cd "$ROOT_DIR"

TARGET_FILES=("ops/ROUTER_INDEX.yaml" "masterroutetable.md")

cleanup() {
  git checkout --quiet -- "${TARGET_FILES[@]}" 2>/dev/null || true
  rm -f /tmp/router-docs-guard.log 2>/dev/null || true
}
trap cleanup EXIT

for file in "${TARGET_FILES[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing router artifact: $file" >&2
    exit 1
  fi
  if git status --porcelain -- "$file" | grep -q .; then
    echo "Router docs guard: $file has uncommitted changes before regeneration. Reset or commit before running the guard." >&2
    exit 1
  fi
done

echo "🚦 Running router docs regeneration check"

npm run --silent docs:update-routers >/tmp/router-docs-guard.log 2>&1 || {
  cat /tmp/router-docs-guard.log >&2
  echo "Router docs guard: docs:update-routers failed." >&2
  exit 1
}

if git diff --quiet -- "${TARGET_FILES[@]}"; then
  echo "✅ Router docs are up to date (docs:update-routers produced no diff)."
  exit 0
fi

echo "❌ Router docs guard detected drift after running docs:update-routers."
git status --short -- "${TARGET_FILES[@]}"
cat /tmp/router-docs-guard.log
exit 1
