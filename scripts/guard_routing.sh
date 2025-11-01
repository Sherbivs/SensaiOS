#!/usr/bin/env bash
set -euo pipefail

BASE="$(git rev-parse HEAD~1 2>/dev/null || echo '')"
if [[ -z "$BASE" ]]; then
  echo "First commit; skipping routing guard."
  exit 0
fi

CHANGED_COMMIT=$(git diff --name-only "$BASE"...HEAD | tr -d '\r')
CHANGED_WORKTREE=$(git diff --name-only | tr -d '\r')
CHANGED_UNTRACKED=$(git ls-files --others --exclude-standard | tr -d '\r')
CHANGED=$(printf "%s\n%s\n%s" "$CHANGED_COMMIT" "$CHANGED_WORKTREE" "$CHANGED_UNTRACKED" | sed '/^$/d' | sort -u)
if [[ -z "$CHANGED" ]]; then
  echo "🔎 Routing guard — no file changes detected."
  echo "✅ Routing guard passed."
  exit 0
fi
echo "🔎 Routing guard — changed files:"
echo "$CHANGED" | sed 's/^/ - /'

# Allowlist for meta/doc files always ok
ALWAYS_OK_REGEX='^(Patch\.md|Prompt\.md|Tasklist\.md|ops/ROUTER\.yaml|ops/NEXT\.yaml|ops/TOUCHMAP\.yaml|ops/CRITICAL\.md|ops/PATCH_POLICY_BACKUP\.md|\.github/workflows/.*|scripts/guard_.*\.sh)$'

FAILS=0

if echo "$CHANGED" | grep -Ev "$ALWAYS_OK_REGEX" >/dev/null 2>&1; then
  # Try to read NEXT task id
  NEXT_TASK=$(grep -E '^next_task_id:' ops/NEXT.yaml 2>/dev/null | awk '{print $2}' || true)
  [[ -z "${NEXT_TASK:-}" ]] && NEXT_TASK=""

  # Collect touch patterns for NEXT_TASK
  MAP_LINES=$(awk -v id="$NEXT_TASK" '
    $0 ~ "^"id":" {inblk=1; next}
    inblk && $0 ~ "^[^[:space:]].*:" {inblk=0}
    inblk && $0 ~ "^[[:space:]]*- " {print $2}
  ' ops/TOUCHMAP.yaml 2>/dev/null || true)

  if [[ -z "$NEXT_TASK" || -z "$MAP_LINES" ]]; then
    echo "⚠️ Routing guard: could not resolve NEXT or TOUCHMAP; soft-pass."
    exit 0
  fi

  # Check each changed file matches some mapped prefix (/** treated as prefix)
  while IFS= read -r file; do
    echo "$file" | grep -Eq "$ALWAYS_OK_REGEX" && continue
    MATCHED=0
    if [[ "$NEXT_TASK" =~ ^META\.ROUTER\. ]]; then
      if [[ "$file" =~ (^|/)ROUTER\.(md|yaml)$ ]]; then
        MATCHED=1
      fi
    fi
    while IFS= read -r pat; do
      p="${pat%\"}"; p="${p#\"}"
      p="${p%/**}"
      if [[ "$file" == "$p"* ]]; then MATCHED=1; break; fi
    done <<<"$MAP_LINES"
    if [[ $MATCHED -eq 0 ]]; then
      echo "❌ File not permitted by TOUCHMAP for task $NEXT_TASK: $file"
      FAILS=$((FAILS+1))
    fi
  done <<<"$CHANGED"

  if [[ $FAILS -gt 0 ]]; then
    echo "❌ Routing guard failed: update ops/TOUCHMAP.yaml for task $NEXT_TASK or retarget NEXT." >&2
    exit 1
  fi
fi

echo "✅ Routing guard passed."
