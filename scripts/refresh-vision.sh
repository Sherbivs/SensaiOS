#!/usr/bin/env bash
set -euo pipefail

# refresh_vision.sh
# Purpose:
#  - Verify repo visibility & HEAD against remote (github.com/Sherbivs/Infinity-Gauntlet)
#  - Regenerate router index and (optionally) the Prompt ledger
#  - Stamp ops/RECOVERY.yaml with refresh metadata to support resume
#
# Notes:
#  - Safe to run on CI and locally; if git is unavailable or no network, we still stamp RECOVERY
#  - Idempotent: re-running yields same state (except fresh timestamps)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RECOVERY="ops/RECOVERY.yaml"
ROUTER_INDEX="ops/ROUTER_INDEX.yaml"
EXPECTED_REMOTE_SSH="git@github.com:Sherbivs/Infinity-Gauntlet.git"
EXPECTED_REMOTE_HTTPS="https://github.com/Sherbivs/Infinity-Gauntlet.git"

timestamp_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

git_safe() {
  if command -v git >/dev/null 2>&1; then
    git "$@"
  else
    return 127
  fi
}

NOW="$(timestamp_utc)"
HEAD_SHA="unknown"
REMOTE_URL="unknown"
REMOTE_HEAD_SHA="unknown"
REMOTE_REACHABLE="false"
REMOTE_OK="false"

# 1) Git / remote visibility checks (best-effort)
if git_safe rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  HEAD_SHA="$(git_safe rev-parse --short HEAD 2>/dev/null || echo unknown)"

  if git_safe remote get-url origin >/dev/null 2>&1; then
    REMOTE_URL="$(git_safe remote get-url origin 2>/dev/null || echo unknown)"
  else
    REMOTE_URL="$(git_safe remote -v | awk 'NR==1{print $2}' || true)"
    [[ -z "$REMOTE_URL" ]] && REMOTE_URL="unknown"
  fi

  if [[ "$REMOTE_URL" != "unknown" ]]; then
    if git_safe ls-remote "$REMOTE_URL" >/dev/null 2>&1; then
      REMOTE_REACHABLE="true"
      REMOTE_HEAD_SHA="$(git_safe ls-remote "$REMOTE_URL" HEAD 2>/dev/null | awk '{print $1}' || true)"
      [[ -z "$REMOTE_HEAD_SHA" ]] && REMOTE_HEAD_SHA="unknown"
    fi
  fi

  if [[ "$REMOTE_URL" == "$EXPECTED_REMOTE_SSH" || "$REMOTE_URL" == "$EXPECTED_REMOTE_HTTPS" ]]; then
    if [[ "$REMOTE_REACHABLE" == "true" ]]; then
      REMOTE_OK="true"
    fi
  fi
fi

# 2) Regenerate router-of-routers index (best-effort)
if [[ -x "scripts/update_router_index.sh" ]]; then
  scripts/update_router_index.sh || true
fi
mkdir -p ops
[[ -f "$ROUTER_INDEX" ]] || echo "# Generated router index (placeholder)" > "$ROUTER_INDEX"

# 2.5) Validate .gitignore preserves meta documentation (best-effort)
if [[ -x "scripts/guard_gitignore.sh" ]]; then
  scripts/guard_gitignore.sh || echo "::warning::.gitignore validation skipped or failed"
fi

# 3) Update Prompt ledger (best-effort)
if [[ -x "scripts/update_change_ledger.sh" ]]; then
  scripts/update_change_ledger.sh || true
fi

# 4) Determine current task + snapshot pointers
NEXT_FILE="ops/NEXT.yaml"
NEXT_TASK="NONE"
if [[ -f "$NEXT_FILE" ]]; then
  NEXT_TASK="$(grep -m1 '^next_task_id:' "$NEXT_FILE" | awk '{print $2}')"
  [[ -z "$NEXT_TASK" ]] && NEXT_TASK="NONE"
fi

PREV_RECOVERY_TASK="NONE"
if [[ -f "$RECOVERY" ]]; then
  PREV_RECOVERY_TASK="$(grep -m1 '^last_attempted_task_id:' "$RECOVERY" | awk '{print $2}')"
  [[ -z "$PREV_RECOVERY_TASK" ]] && PREV_RECOVERY_TASK="NONE"
fi

CURRENT_TASK_ID="${AI_CURRENT_TASK_ID:-}"
ATTEMPT_SOURCE="env:AI_CURRENT_TASK_ID"

if [[ -z "$CURRENT_TASK_ID" && -n "${RECOVERY_TASK_ID:-}" ]]; then
  CURRENT_TASK_ID="${RECOVERY_TASK_ID}"
  ATTEMPT_SOURCE="env:RECOVERY_TASK_ID"
fi

if [[ -z "$CURRENT_TASK_ID" ]]; then
  if [[ "$NEXT_TASK" != "NONE" ]]; then
    CURRENT_TASK_ID="$NEXT_TASK"
    ATTEMPT_SOURCE="ops/NEXT.yaml"
  elif [[ "$PREV_RECOVERY_TASK" != "NONE" ]]; then
    CURRENT_TASK_ID="$PREV_RECOVERY_TASK"
    ATTEMPT_SOURCE="ops/RECOVERY.yaml"
  else
    CURRENT_TASK_ID="NONE"
    ATTEMPT_SOURCE="guidance_when_none"
  fi
fi

# 5) Stamp ops/RECOVERY.yaml with refresh metadata
cat > "$RECOVERY" <<YAML
# RECOVERY — used by activation trigger to resume safely
last_refresh_utc: "$NOW"
last_remote_ok: $REMOTE_OK
last_remote_url: "$REMOTE_URL"
last_remote_head_sha: "$REMOTE_HEAD_SHA"
last_local_head_sha: "$HEAD_SHA"
last_attempted_task_id: "$CURRENT_TASK_ID"
last_attempted_ts: "$NOW"
last_attempted_source: "$ATTEMPT_SOURCE"
next_task_id_snapshot: "$NEXT_TASK"
note: "Refresh Vision completed. If running in a restricted IDE with no git/network, remote checks may be partial."
YAML

echo "[refresh_vision] stamped $RECOVERY (remote_ok=$REMOTE_OK, remote=$REMOTE_URL, head_local=$HEAD_SHA, head_remote=$REMOTE_HEAD_SHA, attempt=$CURRENT_TASK_ID, next=$NEXT_TASK)"
