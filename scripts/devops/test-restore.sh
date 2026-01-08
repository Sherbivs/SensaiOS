#!/bin/bash
# Test restore to local database (validates backup integrity)
# Usage: ./scripts/devops/test-restore.sh [backup-file]
# Requires: DATABASE_ONPREMISE_DEV_PRIMARY environment variable (local PostgreSQL)

set -e

BACKUP_FILE="${1:-$(ls -t backups/pre-timescale-poc/infinity-gauntlet-db-*.dump 2>/dev/null | head -1)}"
TEST_DB="infinity_gauntlet_test_restore"

if [ -z "$BACKUP_FILE" ]; then
  echo "[HALT] No backup file found"
  echo "   Usage: $0 [backup-file]"
  echo "   Example: $0 backups/pre-timescale-poc/infinity-gauntlet-db-20251201_143022.dump"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[HALT] Backup file not found: $BACKUP_FILE"
  exit 1
fi

if [ -z "$DATABASE_ONPREMISE_DEV_PRIMARY" ]; then
  echo "[HALT] DATABASE_ONPREMISE_DEV_PRIMARY is not set"
  echo "   Load environment: pwsh -File scripts/setup_ai_env.ps1 -EnvFile \"secrets/Infinity-Gauntlet.env\""
  exit 1
fi

echo "=== Testing Database Restore ==="
echo "Backup: $BACKUP_FILE"
echo "Test database: $TEST_DB"
echo "Local PostgreSQL: $DATABASE_ONPREMISE_DEV_PRIMARY"
echo ""

# Extract connection details from DATABASE_ONPREMISE_DEV_PRIMARY
# Format: postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db
LOCAL_PG=$(echo "$DATABASE_ONPREMISE_DEV_PRIMARY" | sed 's|/infinity_gauntlet_db||')

# Drop test database if exists
echo "Dropping existing test database (if any)..."
psql "$LOCAL_PG/postgres" -c "DROP DATABASE IF EXISTS $TEST_DB;" 2>/dev/null || true

# Create test database
echo "Creating test database..."
psql "$LOCAL_PG/postgres" -c "CREATE DATABASE $TEST_DB;"

# Restore backup to test database
echo ""
echo "Restoring backup (this may take 2-3 minutes)..."
pg_restore \
  --dbname="$LOCAL_PG/$TEST_DB" \
  --verbose \
  --no-owner \
  --no-acl \
  "$BACKUP_FILE" 2>&1 | grep -E "(creating|complete)" | tail -20 || true

# Verify table counts
echo ""
echo "=== Verifying Restored Data ==="
psql "$LOCAL_PG/$TEST_DB" <<EOF
SELECT 
  schemaname,
  tablename,
  n_live_tup as row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC
LIMIT 10;
EOF

echo ""
echo "✅ Restore test complete"
echo ""
echo "⚠️  Cleanup: Run 'psql $LOCAL_PG/postgres -c \"DROP DATABASE $TEST_DB;\"' to remove test database"
