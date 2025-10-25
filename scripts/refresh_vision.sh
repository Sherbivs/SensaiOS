#!/usr/bin/env bash
set -euo pipefail
# Refreshes AI worker "vision":
# 1) Recompute router-of-routers index
# 2) Optionally regenerate the change ledger (last 200) in Prompt.md
# 3) Stamp/update ops/RECOVERY.yaml heartbeat and last-known pointers

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"
cd "$ROOT"

bash scripts/update_router_index.sh

# Update ledger if script exists; ignore failures for portability
if [[ -f "scripts/update_change_ledger.sh" ]]; then
  bash scripts/update_change_ledger.sh || echo "[refresh] ledger generation skipped"
fi

RECOVERY="ops/RECOVERY.yaml"
NOW="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
HEAD_SHA="$(git rev-parse --short HEAD || echo "UNKNOWN")"

# Read NEXT pointer if present
NEXT_FILE="ops/NEXT.yaml"
if [[ -f "$NEXT_FILE" ]]; then
  NEXT_TASK="$(grep -m1 '^next_task_id:' "$NEXT_FILE" | awk '{print $2}')"
else
  NEXT_TASK=""
fi

cat > "$RECOVERY" <<YML
version: 1
heartbeat_utc: "$NOW"
head_short_sha: "$HEAD_SHA"
last_task_id: "${NEXT_TASK:-UNKNOWN}"
notes: "AI should resume from last_task_id if activation trigger is used."
YML

echo "[refresh] Updated $RECOVERY; NEXT=$NEXT_TASK; HEAD=$HEAD_SHA"
