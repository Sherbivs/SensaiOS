#!/usr/bin/env bash
# Verification Script: /Store DB-Only Policy Compliance
# Policy: Only .db and .db.* files allowed in /Store root
# Reference: docs/architecture-bible/27-store-db-only-policy.md

set -euo pipefail

STORE_DIR="${STORE_DIR:-/Store}"

echo "🔍 /Store DB-Only Policy Compliance Check"
echo "Policy: Only .db and .db.backup files allowed"
echo "Directory: $STORE_DIR"
echo ""

cd "$STORE_DIR"

# Find non-compliant files in root
NON_COMPLIANT=$(find . -maxdepth 1 -type f ! -name "*.db" ! -name "*.db.bak" ! -name "*.db.backup" | wc -l)

if [ "$NON_COMPLIANT" -eq 0 ]; then
  echo "✅ COMPLIANT: No policy violations detected"
  du -sh "$STORE_DIR"
  exit 0
fi

echo "❌ NON-COMPLIANT: $NON_COMPLIANT violations detected"
echo ""

# Show violations by type
echo "Policy Violations:"
find . -maxdepth 1 -type f ! -name "*.db" ! -name "*.db.bak" ! -name "*.db.backup" -exec ls -lh {} \; | \
  awk '{print $9, "("$5")"}'
echo ""

# Count JSON files
JSON_COUNT=$(find . -type f -name "*.json" | wc -l)
echo "JSON files: $JSON_COUNT (should be 0 after migration)"

# Count heap snapshots
HEAP_COUNT=$(find . -maxdepth 1 -type f -name "*.heapsnapshot" | wc -l)
echo "Heap snapshots: $HEAP_COUNT (should be ≤2)"

# Count log files
LOG_COUNT=$(find . -type f -name "*.log" | wc -l)
echo "Log files: $LOG_COUNT (should be 0 after migration)"

echo ""
echo "📖 See: docs/architecture-bible/27-store-db-only-policy.md"
echo "🔧 Run migration tasks: STORE.HEAP_MIGRATION, STORE.SECURITY_STATE"

exit 1
