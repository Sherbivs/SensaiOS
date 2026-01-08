#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

echo "[Hotfix] Engine Entry"
echo "Reading ops/HOTFIX_PLAN.yaml ..."

if [[ ! -f ops/HOTFIX_PLAN.yaml ]]; then
  echo "[HALT] Missing ops/HOTFIX_PLAN.yaml. Aborting."
  exit 1
fi

echo "Recommended hotfix targets (files_hint):"
grep -A999 '^files_hint:' ops/HOTFIX_PLAN.yaml | sed '1d' | sed 's/^- /  - /'

echo
echo "Rules:"
echo " - Edit only files listed above, plus Prompt.md, Tasklist.md, ops/RECOVERY.yaml, and ROUTER.md in touched dirs."
echo " - Do not edit Patch.md unless explicitly directed."
echo " - After edits, bump Prompt.md timestamp/revision and add a concise Last Repo Changes entry."
echo " - Commit message must start with: [Hotfix <ID>] ..."

exit 0
