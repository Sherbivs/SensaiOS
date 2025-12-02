#!/bin/bash
# Backup production database before TimescaleDB POC
# Usage: ./scripts/devops/backup-database.sh
# Requires: RENDER_DB_EXTERNAL_URL or PROD_DATABASE_URL environment variable

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups/pre-timescale-poc"
BACKUP_FILE="$BACKUP_DIR/infinity-gauntlet-db-$TIMESTAMP.dump"

# Use RENDER_DB_EXTERNAL_URL if available, otherwise PROD_DATABASE_URL
DATABASE_URL="${RENDER_DB_EXTERNAL_URL:-$PROD_DATABASE_URL}"

if [ -z "$DATABASE_URL" ]; then
  echo "❌ Error: Neither RENDER_DB_EXTERNAL_URL nor PROD_DATABASE_URL is set"
  echo "   Load environment: pwsh -File scripts/setup_ai_env.ps1 -EnvFile \"secrets/Infinity-Gauntlet.env\""
  exit 1
fi

echo "=== Database Backup (Pre-TimescaleDB POC) ==="
echo "Timestamp: $TIMESTAMP"
echo "Backup file: $BACKUP_FILE"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup using custom format (compressed, faster restore)
echo "Starting pg_dump (this may take 1-2 minutes)..."
pg_dump "$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --verbose \
  --file="$BACKUP_FILE" 2>&1 | grep -E "(dumping|complete)" || true

# Calculate backup size
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo ""
echo "✅ Backup complete: $BACKUP_SIZE"

# Verify backup integrity
echo ""
echo "=== Verifying Backup Integrity ==="
pg_restore --list "$BACKUP_FILE" | head -20

# Create metadata file
cat > "$BACKUP_DIR/backup-$TIMESTAMP-metadata.json" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "backup_file": "$BACKUP_FILE",
  "backup_size": "$BACKUP_SIZE",
  "database_url": "RENDER_DB_EXTERNAL_URL",
  "purpose": "Pre-TimescaleDB POC deployment",
  "restore_tested": false,
  "retention_days": 90
}
EOF

echo ""
echo "✅ Backup metadata saved"
echo ""
echo "=== Backup Summary ==="
echo "File: $BACKUP_FILE"
echo "Size: $BACKUP_SIZE"
echo "Retention: 90 days"
echo ""
echo "⚠️  IMPORTANT: Test restore before proceeding with POC deployment"
echo "   Run: ./scripts/devops/test-restore.sh $BACKUP_FILE"
