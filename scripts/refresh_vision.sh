#!/usr/bin/env bash
set -euo pipefail
# Refreshes AI worker "vision":
# 1) Recompute router-of-routers index
# 2) Optionally regenerate the change ledger (last 200) in Prompt.md
# 3) Stamp/update ops/RECOVERY.yaml heartbeat and resume hints

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"
cd "$ROOT"

if [[ -x "scripts/update_router_index.sh" ]]; then
  bash scripts/update_router_index.sh
else
  echo "[refresh] Skipping router index — scripts/update_router_index.sh missing or not executable"
fi

# Update ledger if script exists; ignore failures for portability
if [[ -f "scripts/update_change_ledger.sh" ]]; then
  bash scripts/update_change_ledger.sh || echo "[refresh] ledger generation skipped"
fi

RECOVERY="ops/RECOVERY.yaml"
mkdir -p "$(dirname "$RECOVERY")"

NOW="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
HEAD_SHA="$(git rev-parse --short HEAD || echo "UNKNOWN")"

# Read NEXT pointer if present
NEXT_FILE="ops/NEXT.yaml"
NEXT_TASK=""
if [[ -f "$NEXT_FILE" ]]; then
  NEXT_TASK="$(grep -m1 '^next_task_id:' "$NEXT_FILE" | awk '{print $2}')"
fi

# Allow manual override when the worker knows the active task (e.g., via env var)
CURRENT_TASK_ID=""
ATTEMPT_SOURCE="unspecified"

if [[ -n "${AI_CURRENT_TASK_ID:-}" ]]; then
  CURRENT_TASK_ID="${AI_CURRENT_TASK_ID}"
  ATTEMPT_SOURCE="env:AI_CURRENT_TASK_ID"
elif [[ -n "${RECOVERY_TASK_ID:-}" ]]; then
  CURRENT_TASK_ID="${RECOVERY_TASK_ID}"
  ATTEMPT_SOURCE="env:RECOVERY_TASK_ID"
else
  CURRENT_TASK_ID="$NEXT_TASK"
  if [[ -n "$CURRENT_TASK_ID" ]]; then
    ATTEMPT_SOURCE="ops/NEXT.yaml"
  else
    CURRENT_TASK_ID="NONE"
  fi
fi

ATTEMPT_TS="$NOW"

cat > "$RECOVERY" <<YML
version: 2
heartbeat_utc: "$NOW"
head_short_sha: "$HEAD_SHA"
last_attempted_task_id: "${CURRENT_TASK_ID:-NONE}"
last_attempted_ts: "$ATTEMPT_TS"
last_attempted_source: "$ATTEMPT_SOURCE"
next_task_id_snapshot: "${NEXT_TASK:-NONE}"
notes: "AI should resume from last_attempted_task_id when activation trigger is used (ensure it is still READY)."
YML

echo "[refresh] Updated $RECOVERY; attempt=$CURRENT_TASK_ID (source=$ATTEMPT_SOURCE); NEXT=$NEXT_TASK; HEAD=$HEAD_SHA"
