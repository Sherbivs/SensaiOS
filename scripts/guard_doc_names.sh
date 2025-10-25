#!/usr/bin/env bash
set -euo pipefail

echo "🔎 Guarding canonical doc filenames…"

# Required files with exact case
required=(
  "Patch.md"
  "Tasklist.md"
  "Prompt.md"
  "ops/PATCH_POLICY_BACKUP.md"
)

status=0

for f in "${required[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: Missing required file with exact case: $f"
    status=1
  fi
done

# Forbidden lower-case variants at repo root
forbidden=(
  "patch.md"
  "tasklist.md"
  "prompt.md"
)

for f in "${forbidden[@]}"; do
  if [[ -f "$f" ]]; then
    echo "ERROR: Forbidden filename present: $f (must use capitalized canonical name)"
    status=1
  fi
done

# For ops backup, reject any case variant that isn't the canonical one
# Find any file in ops/ named PATCH_POLICY_BACKUP.md ignoring case
found="$(find ops -maxdepth 1 -type f -iname 'patch_policy_backup.md' 2>/dev/null || true)"
if [[ -n "$found" ]]; then
  while IFS= read -r path; do
    [[ "$path" == "ops/PATCH_POLICY_BACKUP.md" ]] || {
      echo "ERROR: Forbidden backup filename variant: $path (must be ops/PATCH_POLICY_BACKUP.md)"
      status=1
    }
  done <<< "$found"
fi

if [[ $status -eq 0 ]]; then
  echo "✅ Canonical filenames intact."
else
  echo "❌ Canonical filename guard failed."
fi

exit "$status"
