#!/usr/bin/env bash
set -euo pipefail

echo "🔎 Guarding meta update policy…"

# Get changed files against previous commit
BASE="$(git rev-parse HEAD~1 2>/dev/null || echo '')"
if [[ -z "$BASE" ]]; then
  echo "First commit or shallow history; skipping guard."
  exit 0
fi

CHANGED=$(git diff --name-only "$BASE"...HEAD | tr -d '\r')
echo "Changed files:"
echo "$CHANGED" | sed 's/^/ - /'

# Normalize match helpers
has_changed() { echo "$CHANGED" | grep -qE "^$1$"; }
any_changed()  { echo "$CHANGED" | grep -qE "$1"; }

# Which files changed?
PROMPT_CHANGED=false
PATCH_CHANGED=false
TASKLIST_CHANGED=false

has_changed "Prompt.md" && PROMPT_CHANGED=true
has_changed "Patch.md" && PATCH_CHANGED=true
has_changed "Tasklist.md" && TASKLIST_CHANGED=true

# Non-doc changes? (anything outside markdown at root/ops or these three)
NON_DOC_CHANGED=false
if echo "$CHANGED" | grep -vqE '^(Prompt\.md|Patch\.md|Tasklist\.md|ops/[^/]+\.md)$'; then
  NON_DOC_CHANGED=true
fi

fail() { echo "❌ $*"; exit 1; }

# Rule 1: If non-doc files changed, Prompt.md must be in the commit.
if $NON_DOC_CHANGED && ! $PROMPT_CHANGED; then
  fail "Non-doc files changed but Prompt.md was not updated (Timestamp/Revision + Last Repo Changes required)."
fi

# Rule 2: If Patch.md changed, Tasklist.md must change too (and vice versa).
if $PATCH_CHANGED && ! $TASKLIST_CHANGED; then
  fail "Patch.md changed but Tasklist.md did not. Both must be updated together (headers bumped)."
fi
if $TASKLIST_CHANGED && ! $PATCH_CHANGED; then
  fail "Tasklist.md changed but Patch.md did not. Both must be updated together (headers bumped)."
fi

# Rule 3: If a meta file changed, its header lines must be modified in the diff.
check_header_bumped () {
  local file="$1"
  if git diff "$BASE"...HEAD -- "$file" | grep -qE '^\+.*(Timestamp \(UTC\)|Last Updated \(UTC\)|Revision:)'; then
    return 0
  else
    fail "$file changed but header Timestamp/Revision not updated."
  fi
}

$PROMPT_CHANGED && check_header_bumped "Prompt.md"
$PATCH_CHANGED && check_header_bumped "Patch.md"
$TASKLIST_CHANGED && check_header_bumped "Tasklist.md"

# Rule 4: When non-doc changes occur, require either an Evidence Matrix row or a Revision History row in Prompt.md.
if $NON_DOC_CHANGED; then
  PROMPT_DIFF="$(git diff "$BASE"...HEAD -- Prompt.md || true)"
  HAS_EVIDENCE=$(echo "$PROMPT_DIFF" | grep -qE '^\+\| .* \| .* \| .* \|'; echo $?)
  HAS_REVHIST=$(echo "$PROMPT_DIFF" | grep -qE '^\+\| [0-9]{4}-[0-9]{2}-[0-9]{2} \|'; echo $?)
  if [[ "$HAS_EVIDENCE" -ne 0 && "$HAS_REVHIST" -ne 0 ]]; then
    fail "Non-doc changes detected: add either an Evidence Matrix row or a Revision History row in Prompt.md."
  fi
fi

# Rule 5: Prompt.md must include the AI Worker Prompt section header.
if ! grep -q "^## AI Worker Prompt (copy/paste for Copilot/GPT)" Prompt.md; then
  fail "Prompt.md is missing the required 'AI Worker Prompt (copy/paste for Copilot/GPT)' section."
fi

echo "✅ Meta update policy satisfied."

# Advisory: PATCHSET Echo block should contain content
if awk '/<!-- PATCHSET:ECHO BEGIN -->/{flag=1;next}/<!-- PATCHSET:ECHO END -->/{flag=0}flag' Prompt.md | grep -q '.'; then
  echo "✅ Advisory: PATCHSET Echo block has content."
else
  echo "⚠️ Advisory: PATCHSET Echo block is empty. It must be populated after the next PATCHSET (or include NO-ECHO-REASON)."
fi
