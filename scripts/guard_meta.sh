#!/usr/bin/env bash
set -euo pipefail

BASE_SHA="${1:-}"
HEAD_SHA="${2:-}"

if [[ -z "${BASE_SHA}" || "${BASE_SHA}" == "0000000000000000000000000000000000000000" ]]; then
  BASE_SHA="$(git rev-parse HEAD~1 2>/dev/null || true)"
fi

if [[ -z "${HEAD_SHA}" ]]; then
  HEAD_SHA="$(git rev-parse HEAD)"
fi

if [[ -z "${BASE_SHA}" ]]; then
  echo "::warning::Unable to determine base revision; skipping guard."
  exit 0
fi

echo "Comparing range: ${BASE_SHA}..${HEAD_SHA}"

changed_files="$(git diff --name-only "${BASE_SHA}" "${HEAD_SHA}" | tr -d '\r')"

if [[ -z "${changed_files}" ]]; then
  echo "No file changes detected in diff range."
  exit 0
fi

echo "Changed files:"
echo "${changed_files}" | sed 's/^/ - /'

has_changed() { echo "${changed_files}" | grep -Fxq "$1"; }
any_changed()  { echo "${changed_files}" | grep -Eq "$1"; }

PROMPT_CHANGED=false
PATCH_CHANGED=false
TASKLIST_CHANGED=false

has_changed "Prompt.md" && PROMPT_CHANGED=true
has_changed "Patch.md" && PATCH_CHANGED=true
has_changed "Tasklist.md" && TASKLIST_CHANGED=true

# Non-doc (code) change detection
CODE_REGEX='^(src/|tests/|scripts/.+|discord-pokemon-bot/|prisma/|data/|package\.json|tsconfig\.json|render\.yaml|index\.js|security-bot\.js)'
CODE_CHANGED=false
if any_changed "${CODE_REGEX}"; then
  CODE_CHANGED=true
fi

NON_DOC_CHANGED=false
if echo "${changed_files}" | grep -vqE '^(Prompt\.md|Patch\.md|Tasklist\.md|ops/[^/]+\.md|ops/[^/]+\.yaml|ops/INBOX/notes\.md)$'; then
  NON_DOC_CHANGED=true
fi

fail() { echo "❌ $*"; exit 1; }

# Enforce Tasklist coupling when code paths change.
if ${CODE_CHANGED} && ! ${TASKLIST_CHANGED}; then
  fail "Code paths changed (src/tests/build-critical paths) but Tasklist.md was not updated. Include a # TASKLIST UPDATE diff."
fi

# Rule 1: If non-doc files changed, Prompt.md must be updated.
if ${NON_DOC_CHANGED} && ! ${PROMPT_CHANGED}; then
  fail "Non-doc files changed but Prompt.md was not updated (Timestamp/Revision + Last Repo Changes required)."
fi

# Rule 2: Patch.md and Tasklist.md must continue to move in lockstep when either changes.
if ${PATCH_CHANGED} && ! ${TASKLIST_CHANGED}; then
  fail "Patch.md changed but Tasklist.md did not. Update both headers together."
fi
if ${TASKLIST_CHANGED} && ! ${PATCH_CHANGED}; then
  fail "Tasklist.md changed but Patch.md did not. Patch.md headers must be bumped alongside Tasklist."
fi

# Rule 3: Header stamps must bump when meta files change.
check_header_bumped() {
  local file="$1"
  if git diff "${BASE_SHA}" "${HEAD_SHA}" -- "$file" | grep -qE '^\+.*(Timestamp \(UTC\)|Last Updated \(UTC\)|Revision:)'; then
    return 0
  fi
  fail "$file changed but header Timestamp/Revision was not updated."
}

${PROMPT_CHANGED} && check_header_bumped "Prompt.md"
${PATCH_CHANGED} && check_header_bumped "Patch.md"
${TASKLIST_CHANGED} && check_header_bumped "Tasklist.md"

# Rule 4: When non-doc changes occur, Prompt.md must capture Evidence/Revision history.
if ${NON_DOC_CHANGED}; then
  PROMPT_DIFF="$(git diff "${BASE_SHA}" "${HEAD_SHA}" -- Prompt.md || true)"
  HAS_EVIDENCE=$(echo "${PROMPT_DIFF}" | grep -qE '^\+\| .* \| .* \| .* \|' && echo "yes" || echo "no")
  HAS_REVHIST=$(echo "${PROMPT_DIFF}" | grep -qE '^\+\| [0-9]{4}-[0-9]{2}-[0-9]{2} \|' && echo "yes" || echo "no")
  if [[ "${HAS_EVIDENCE}" == "no" && "${HAS_REVHIST}" == "no" ]]; then
    fail "Non-doc changes detected: add either an Evidence Matrix row or a Revision History row in Prompt.md."
  fi
fi

# Rule 5: Prompt.md must include the AI Worker Prompt section header.
if ! grep -q "^## AI Worker Prompt (copy/paste for Copilot/GPT)" Prompt.md; then
  fail "Prompt.md is missing the required 'AI Worker Prompt (copy/paste for Copilot/GPT)' section."
fi

echo "✅ Meta update policy satisfied."

# Advisory: Encourage Tasklist header bumps when detected by heuristic (non-fatal)
if ${CODE_CHANGED} && git diff "${BASE_SHA}" "${HEAD_SHA}" -- Tasklist.md | grep -vq 'Last Updated (UTC)'; then
  echo "::warning::Tasklist.md changed but Last Updated header not detected; ensure headers stay current."
fi

# Advisory: PATCHSET Echo block should contain content
if awk '/<!-- PATCHSET:ECHO BEGIN -->/{flag=1;next}/<!-- PATCHSET:ECHO END -->/{flag=0}flag' Prompt.md | grep -q '.'; then
  echo "✅ Advisory: PATCHSET Echo block has content."
else
  echo "⚠️ Advisory: PATCHSET Echo block is empty. It must be populated after the next PATCHSET (or include NO-ECHO-REASON)."
fi

# Advisory: highlight when NEXT pointer is NONE but READY tasks exist
if [[ -f ops/NEXT.yaml ]]; then
  auto_flag="false"
  if grep -Eq '^auto_requeue_if_none:\s*true\b' ops/NEXT.yaml; then
    auto_flag="true"
  fi

  if grep -Eq '^next_task_id:\s*NONE\b' ops/NEXT.yaml; then
    ready_count=$(grep -Ec '^\s*status:\s*READY\b' Tasklist.md || echo 0)
    if [[ "${ready_count}" -gt 0 ]]; then
      first_ready_id=$(awk '
        /^- id:/ { line=$0; sub(/^- id: /, "", line); id=line; next }
        /^\s*status:\s*READY\b/ { if (first=="" && id!="") first=id }
        END { if (first!="") print first }
      ' Tasklist.md)

      suggestion="Consider updating next_task_id."
      if [[ -n "${first_ready_id}" ]]; then
        suggestion="Set next_task_id to ${first_ready_id} (first READY task)."
      fi

      if [[ "${auto_flag}" == "true" ]]; then
        echo "::notice::ops/NEXT.yaml points to NONE but ${ready_count} READY task(s) exist. ${suggestion}"
      else
        echo "::notice::ops/NEXT.yaml points to NONE but ${ready_count} READY task(s) exist. ${suggestion} Add 'auto_requeue_if_none: true' to ops/NEXT.yaml to enable guard hints."
      fi
    fi
  fi
fi
