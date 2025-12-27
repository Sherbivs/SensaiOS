#!/usr/bin/env bash
# Cleanup Script: /Store Heap Snapshot Retention
# Policy: Keep only the 2 most recent heap snapshots
# Impact: Saves ~150+ MB per run

set -euo pipefail

STORE_DIR="${STORE_DIR:-/Store}"
KEEP_COUNT="${KEEP_COUNT:-2}"

echo "🧹 /Store Heap Snapshot Cleanup"
echo "Directory: $STORE_DIR"
echo "Retention: Keep $KEEP_COUNT most recent"
echo ""

cd "$STORE_DIR"

# Count total heap snapshots
TOTAL=$(ls -1 startup-heap-*.heapsnapshot 2>/dev/null | wc -l)
echo "Found: $TOTAL heap snapshots"

if [ "$TOTAL" -le "$KEEP_COUNT" ]; then
  echo "✅ No cleanup needed (≤ $KEEP_COUNT files)"
  exit 0
fi

# Calculate how many to delete
DELETE_COUNT=$((TOTAL - KEEP_COUNT))
echo "Action: Delete $DELETE_COUNT oldest snapshots"
echo ""

# Get oldest files to delete
TO_DELETE=$(ls -1t startup-heap-*.heapsnapshot | tail -n "$DELETE_COUNT")

# Show what will be deleted
echo "Files to delete:"
echo "$TO_DELETE" | while read -r file; do
  SIZE=$(du -h "$file" | cut -f1)
  echo "  - $file ($SIZE)"
done
echo ""

# Delete files
echo "$TO_DELETE" | xargs rm -v
echo ""

# Show final state
REMAINING=$(ls -1 startup-heap-*.heapsnapshot 2>/dev/null | wc -l)
TOTAL_SIZE=$(du -sh "$STORE_DIR" | cut -f1)
echo "✅ Cleanup complete"
echo "Remaining: $REMAINING heap snapshots"
echo "Total /Store size: $TOTAL_SIZE"
