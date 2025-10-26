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

IS_HOTFIX="0"
if [[ -f ops/HOTFIX_PLAN.yaml ]]; then
  IS_HOTFIX="1"
fi
if git log -1 --pretty=%s 2>/dev/null | grep -qE '^\[Hotfix [^]]+\]'; then
  IS_HOTFIX="1"
fi

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

if [[ "${IS_HOTFIX}" == "0" ]]; then
  if ! grep -q "<!-- PATCHSET:ECHO BEGIN -->" Prompt.md; then
    fail "Prompt.md must contain PATCHSET:ECHO markers for regular patches."
  fi
fi

echo "✅ Meta update policy satisfied."

# Advisory: Encourage Tasklist header bumps when detected by heuristic (non-fatal)
if ${CODE_CHANGED} && git diff "${BASE_SHA}" "${HEAD_SHA}" -- Tasklist.md | grep -vq 'Last Updated (UTC)'; then
  echo "::warning::Tasklist.md changed but Last Updated header not detected; ensure headers stay current."
fi

# Advisory: PATCHSET Echo block should contain content
if [[ "${IS_HOTFIX}" == "0" ]]; then
  if awk '/<!-- PATCHSET:ECHO BEGIN -->/{flag=1;next}/<!-- PATCHSET:ECHO END -->/{flag=0}flag' Prompt.md | grep -q '.'; then
    echo "✅ Advisory: PATCHSET Echo block has content."
  else
    echo "⚠️ Advisory: PATCHSET Echo block is empty. It must be populated after the next PATCHSET (or include NO-ECHO-REASON)."
  fi
else
  echo "✅ Hotfix mode detected: PATCHSET Echo advisory skipped."
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

# Emit explicit guidance when the READY queue is empty so humans seed a task before merge.
if [[ -f Tasklist.md ]]; then
  mapfile -t _task_rows < <(awk '
    /^- id:/ {
      if (id != "") {
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", deps)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", status)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", id)
        print status "|" id "|" deps
      }
      id=$0
      sub(/^- id: /, "", id)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", id)
      status="UNKNOWN"
      deps=""
    }
    /^\s*status:/ {
      status=$0
      sub(/^\s*status: /, "", status)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", status)
    }
    /^\s*depends_on:/ {
      deps=$0
      sub(/^\s*depends_on: /, "", deps)
      gsub(/[\[\],]/, " ", deps)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", deps)
    }
    END {
      if (id != "") {
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", deps)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", status)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", id)
        print status "|" id "|" deps
      }
    }
  ' Tasklist.md)

  declare -A TASK_STATUS TASK_DEPS
  ready_without_seed_count=0
  ready_seed_present="false"

  for row in "${_task_rows[@]}"; do
    IFS='|' read -r status id deps <<< "$row"
    TASK_STATUS["$id"]="$status"
    TASK_DEPS["$id"]="$deps"
    if [[ "$status" == "READY" ]]; then
      if [[ "$id" == "META.UNBLOCK.READY_SEED" ]]; then
        ready_seed_present="true"
      else
        ready_without_seed_count=$((ready_without_seed_count + 1))
      fi
    fi
  done

  eligible_proposed=""
  for row in "${_task_rows[@]}"; do
    IFS='|' read -r status id deps <<< "$row"
    if [[ "$status" == "PROPOSED" ]]; then
      eligible="true"
      for dep in $deps; do
        [[ -z "$dep" ]] && continue
        if [[ "${TASK_STATUS[$dep]:-}" != "DONE" ]]; then
          eligible="false"
          break
        fi
      done
      if [[ "$eligible" == "true" ]]; then
        eligible_proposed="$id"
        break
      fi
    fi
  done

  if [[ -n "$eligible_proposed" ]]; then
    echo "::notice::Oldest eligible PROPOSED task awaiting promotion: ${eligible_proposed}."
    if [[ -f ops/NEXT.yaml ]]; then
      current_next=$(awk 'match($0, /^next_task_id:\s*(.*)$/, arr) {print arr[1]; exit}' ops/NEXT.yaml | tr -d '"')
      current_next=${current_next:-NONE}
      if [[ "$current_next" != "$eligible_proposed" ]]; then
        echo "::notice::When promoting ${eligible_proposed} to READY, update ops/NEXT.yaml next_task_id (currently ${current_next})."
      fi
    fi
  fi

  if [[ "${ready_without_seed_count}" -eq 0 ]]; then
    if [[ "$ready_seed_present" == "true" ]]; then
      echo "::error::Tasklist.md only lists META.UNBLOCK.READY_SEED as READY. Promote another task before merging."
    else
      echo "::error::Tasklist.md lists zero READY tasks. Promote a PROPOSED task or add META.UNBLOCK.READY_SEED before merging."
    fi
    if [[ -n "$eligible_proposed" ]]; then
      echo "::error::Suggested promotion candidate: ${eligible_proposed} (all dependencies DONE)."
    fi
    fail "READY queue empty (excluding META.UNBLOCK.READY_SEED)."
  fi
fi
