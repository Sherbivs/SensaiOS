#!/usr/bin/env bash
set -euo pipefail

echo "🔎 Guarding canonical doc filenames…"

# Grab tracked/untracked paths once so we can reason about case-sensitive names even on Windows.
tracked_paths="$(git ls-files)"
untracked_paths="$(git ls-files --others --exclude-standard)"

# Required files with exact case
required=(
  "Patch.md"
  "Tasklist.md"
  "Prompt.md"
  "ops/PATCH_POLICY_BACKUP.md"
)

status=0

for f in "${required[@]}"; do
  if ! printf '%s\n' "$tracked_paths" "$untracked_paths" | grep -Fx "$f" >/dev/null; then
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
  if printf '%s\n' "$tracked_paths" "$untracked_paths" | grep -Fx "$f" >/dev/null; then
    echo "ERROR: Forbidden filename present: $f (must use capitalized canonical name)"
    status=1
  fi
done

# For ops backup, reject any case variant that isn't the canonical one
if printf '%s\n' "$tracked_paths" "$untracked_paths" | grep -Fi 'ops/patch_policy_backup.md' >/dev/null; then
  printf '%s\n' "$tracked_paths" "$untracked_paths" | grep -Fi 'ops/patch_policy_backup.md' | while IFS= read -r path; do
    if [[ "$path" != "ops/PATCH_POLICY_BACKUP.md" ]]; then
      echo "ERROR: Forbidden backup filename variant: $path (must be ops/PATCH_POLICY_BACKUP.md)"
      status=1
    fi
  done
fi

if [[ $status -eq 0 ]]; then
  echo "✅ Canonical filenames intact."
else
  echo "❌ Canonical filename guard failed."
fi

exit "$status"
