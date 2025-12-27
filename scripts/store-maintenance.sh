#!/usr/bin/env bash
# /Store Maintenance Script
# Automated cleanup for /Store directory following DB-Only Policy
# Reference: docs/architecture-bible/27-store-db-only-policy.md

set -euo pipefail

STORE_DIR="${STORE_DIR:-/Store}"
HEAP_KEEP="${HEAP_KEEP:-2}"
LOG_KEEP="${LOG_KEEP:-2}"
SNAPSHOT_DAYS="${SNAPSHOT_DAYS:-7}"

echo "🧹 /Store Maintenance"
echo "Directory: $STORE_DIR"
echo "Policy: Keep $HEAP_KEEP heaps, $LOG_KEEP logs, ${SNAPSHOT_DAYS}d snapshots"
echo ""

INITIAL_SIZE=$(du -sh "$STORE_DIR" | cut -f1)
echo "Current size: $INITIAL_SIZE"
echo ""

# ========================================
# 1. Heap Snapshot Cleanup
# ========================================
echo "📊 Heap Snapshots"
cd "$STORE_DIR"

HEAP_COUNT=$(ls -1 startup-heap-*.heapsnapshot 2>/dev/null | wc -l || echo 0)
echo "  Found: $HEAP_COUNT files"

if [ "$HEAP_COUNT" -gt "$HEAP_KEEP" ]; then
  DELETE_HEAP=$((HEAP_COUNT - HEAP_KEEP))
  echo "  Action: Delete $DELETE_HEAP oldest"
  ls -1t startup-heap-*.heapsnapshot | tail -n "$DELETE_HEAP" | xargs rm -v | sed 's/^/    /'
  echo "  ✅ Kept $HEAP_KEEP most recent"
else
  echo "  ✅ No cleanup needed"
fi
echo ""

# ========================================
# 2. Kernel Log Cleanup
# ========================================
echo "📝 Kernel Logs"
cd "$STORE_DIR/kernel-logs" 2>/dev/null || { echo "  ⚠️  Directory not found"; echo ""; }

if [ -d "$STORE_DIR/kernel-logs" ]; then
  LOG_COUNT=$(ls -1 kernel-*.log 2>/dev/null | wc -l || echo 0)
  echo "  Found: $LOG_COUNT files"
  
  if [ "$LOG_COUNT" -gt "$LOG_KEEP" ]; then
    DELETE_LOG=$((LOG_COUNT - LOG_KEEP))
    echo "  Action: Delete $DELETE_LOG oldest"
    ls -1t kernel-*.log | tail -n "$DELETE_LOG" | xargs rm -v | sed 's/^/    /'
    echo "  ✅ Kept $LOG_KEEP most recent"
  else
    echo "  ✅ No cleanup needed"
  fi
fi
echo ""

# ========================================
# 3. Security Bot Snapshots Cleanup
# ========================================
echo "🔒 Security Bot Snapshots"
SNAPSHOT_DIR="$STORE_DIR/security-bot-state/snapshots"

if [ -d "$SNAPSHOT_DIR" ]; then
  cd "$SNAPSHOT_DIR"
  SNAPSHOT_COUNT=$(ls -1 *.json 2>/dev/null | wc -l || echo 0)
  echo "  Found: $SNAPSHOT_COUNT files"
  
  # Delete snapshots older than N days
  CUTOFF_DATE=$(date -d "$SNAPSHOT_DAYS days ago" +%Y-%m-%d)
  OLD_COUNT=$(find . -name "*.json" -type f ! -newermt "$CUTOFF_DATE" | wc -l || echo 0)
  
  if [ "$OLD_COUNT" -gt 0 ]; then
    echo "  Action: Delete $OLD_COUNT files older than $CUTOFF_DATE"
    find . -name "*.json" -type f ! -newermt "$CUTOFF_DATE" -delete
    echo "  ✅ Kept snapshots from last ${SNAPSHOT_DAYS} days"
  else
    echo "  ✅ No cleanup needed"
  fi
else
  echo "  ⚠️  Directory not found"
fi
echo ""

# ========================================
# 4. Summary
# ========================================
FINAL_SIZE=$(du -sh "$STORE_DIR" | cut -f1)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Maintenance Complete"
echo "   Before: $INITIAL_SIZE"
echo "   After:  $FINAL_SIZE"
echo ""
echo "Current breakdown:"
cd "$STORE_DIR"
du -sh * 2>/dev/null | sort -h | sed 's/^/   /'
echo ""
echo "📖 Policy: docs/architecture-bible/27-store-db-only-policy.md"
