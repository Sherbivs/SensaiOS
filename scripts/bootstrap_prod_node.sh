#!/bin/bash
# bootstrap_prod_node.sh - FOR LOCAL/ON-PREMISE DEVELOPMENT ONLY
#
# ⚠️  IMPORTANT: Render deployments use MANAGED PostgreSQL and do NOT need this script.
# ⚠️  This script is only for setting up local workstation PostgreSQL clusters.
#
# PURPOSE:
#   Set up PostgreSQL on local workstation persistent disk for on-premise development.
#   Creates a local PostgreSQL cluster for testing without cloud database dependencies.
#
# ARCHITECTURE (Local Development Only):
#   DATABASE_ONPREMISE_DEV_PRIMARY → postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db
#   Location: Store/onpremise-dev-primary/ (workstation persistent disk)
#
# RENDER DEPLOYMENTS:
#   - Use Render-managed PostgreSQL (infinity-gauntlet-db)
#   - All DATABASE_URL/PROD_DATABASE_URL/DEV_DATABASE_URL → fromDatabase connection strings
#   - Automatic migrations via databaseRecovery.ts (no bootstrap needed)
#
# USAGE:
#   ./scripts/bootstrap_prod_node.sh [--dry-run] [--force]
#
# OPTIONS:
#   --dry-run    Show what would be done without making changes
#   --force      Recreate database even if it already exists
#
# ENVIRONMENT VARIABLES REQUIRED:
#   DEV_DATABASE_URL - Source database for replication (optional)
#   DATABASE_ONPREMISE_DEV_PRIMARY - Local database connection string (127.0.0.1:55433)

set -euo pipefail

# Configuration
STORE_DIR="${IG_STORE_ROOT:-Store}"
DB_DIR="${STORE_DIR}/onpremise-dev-primary"
PG_PORT="${ONPREMISE_PG_PORT:-55433}"
PG_USER="${ONPREMISE_PG_USER:-postgres}"
PG_DATABASE="${ONPREMISE_PG_DATABASE:-infinity_gauntlet_db}"
LOG_FILE="${DB_DIR}/bootstrap.log"
```</output>


DRY_RUN=false
FORCE=false

# Parse arguments
for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      ;;
    --force)
      FORCE=true
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: $0 [--dry-run] [--force]"
      exit 1
      ;;
  esac
done

# Logging helper
log() {
  local level="$1"
  shift
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [$level] $*" | tee -a "$LOG_FILE"
}

# Check if running on Render
is_render() {
  [[ "${RENDER:-}" == "true" ]]
}

# Check if PostgreSQL is installed
check_postgres_installed() {
  if command -v pg_ctl >/dev/null 2>&1; then
    log "INFO" "PostgreSQL found: $(pg_ctl --version)"
    return 0
  else
    log "ERROR" "PostgreSQL not found. Install postgresql before running this script."
    return 1
  fi
}

# Install PostgreSQL (Debian/Ubuntu - Render uses Ubuntu)
install_postgres() {
  if [[ "$DRY_RUN" == true ]]; then
    log "DRY-RUN" "Would install PostgreSQL via apt-get"
    return 0
  fi

  log "INFO" "Installing PostgreSQL..."
  sudo apt-get update -qq
  sudo apt-get install -y postgresql postgresql-contrib
  log "INFO" "PostgreSQL installed: $(pg_ctl --version)"
}

# Initialize PostgreSQL cluster at /Store/db/
initialize_cluster() {
  if [[ -d "$DB_DIR/pgdata" ]] && [[ "$FORCE" != true ]]; then
    log "INFO" "PostgreSQL cluster already exists at $DB_DIR/pgdata (use --force to recreate)"
    return 0
  fi

  if [[ "$DRY_RUN" == true ]]; then
    log "DRY-RUN" "Would initialize PostgreSQL cluster at $DB_DIR/pgdata"
    return 0
  fi

  log "INFO" "Creating directory structure: $DB_DIR"
  mkdir -p "$DB_DIR"

  if [[ "$FORCE" == true ]] && [[ -d "$DB_DIR/pgdata" ]]; then
    log "WARN" "Removing existing cluster (--force enabled)"
    rm -rf "$DB_DIR/pgdata"
  fi

  log "INFO" "Initializing PostgreSQL cluster at $DB_DIR/pgdata"
  initdb -D "$DB_DIR/pgdata" --username="$PG_USER" --encoding=UTF8 --locale=en_US.UTF-8
  
  # Configure PostgreSQL to listen on 127.0.0.1:55433
  log "INFO" "Configuring PostgreSQL (port=$PG_PORT, listen=127.0.0.1)"
  cat >> "$DB_DIR/pgdata/postgresql.conf" <<EOF

# Infinity Gauntlet PROD Node Configuration
listen_addresses = '127.0.0.1'
port = $PG_PORT
max_connections = 100
shared_buffers = 128MB
EOF

  # Allow local connections without password (trusted local)
  cat > "$DB_DIR/pgdata/pg_hba.conf" <<EOF
# Infinity Gauntlet PROD Node Access Control
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
EOF

  log "INFO" "PostgreSQL cluster initialized successfully"
}

# Start PostgreSQL server
start_postgres() {
  if [[ "$DRY_RUN" == true ]]; then
    log "DRY-RUN" "Would start PostgreSQL on 127.0.0.1:$PG_PORT"
    return 0
  fi

  # Check if already running
  if pg_ctl status -D "$DB_DIR/pgdata" >/dev/null 2>&1; then
    log "INFO" "PostgreSQL already running"
    return 0
  fi

  log "INFO" "Starting PostgreSQL on 127.0.0.1:$PG_PORT"
  pg_ctl start -D "$DB_DIR/pgdata" -l "$DB_DIR/postgres.log" -o "-p $PG_PORT"
  
  # Wait for startup (max 30 seconds)
  for i in {1..30}; do
    if pg_isready -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" >/dev/null 2>&1; then
      log "INFO" "PostgreSQL started successfully"
      return 0
    fi
    sleep 1
  done

  log "ERROR" "PostgreSQL failed to start within 30 seconds"
  return 1
}

# Create database
create_database() {
  if [[ "$DRY_RUN" == true ]]; then
    log "DRY-RUN" "Would create database: $PG_DATABASE"
    return 0
  fi

  # Check if database exists
  if psql -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" -lqt | cut -d \| -f 1 | grep -qw "$PG_DATABASE"; then
    log "INFO" "Database $PG_DATABASE already exists"
    return 0
  fi

  log "INFO" "Creating database: $PG_DATABASE"
  createdb -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" "$PG_DATABASE"
  log "INFO" "Database created successfully"
}

# Run migrations from DEV (master)
run_migrations() {
  if [[ -z "${DEV_DATABASE_URL:-}" ]]; then
    log "ERROR" "DEV_DATABASE_URL not set - cannot run migrations"
    return 1
  fi

  if [[ "$DRY_RUN" == true ]]; then
    log "DRY-RUN" "Would run 'npx prisma migrate deploy' against DEV_DATABASE_URL"
    return 0
  fi

  log "INFO" "Running migrations from DEV (master) database"
  
  # Set DATABASE_URL to PROD for migration target
  export DATABASE_URL="postgresql://$PG_USER@127.0.0.1:$PG_PORT/$PG_DATABASE"
  
  # Use DEV_DATABASE_URL as directUrl source
  npx prisma migrate deploy
  
  log "INFO" "Migrations completed successfully"
}

# Create startup script for automatic restart
create_startup_script() {
  if [[ "$DRY_RUN" == true ]]; then
    log "DRY-RUN" "Would create startup script at $DB_DIR/start.sh"
    return 0
  fi

  log "INFO" "Creating startup script: $DB_DIR/start.sh"
  cat > "$DB_DIR/start.sh" <<'SCRIPT'
#!/bin/bash
# Auto-start PROD PostgreSQL on boot
DB_DIR="$(dirname "$0")"
pg_ctl start -D "$DB_DIR/pgdata" -l "$DB_DIR/postgres.log" -o "-p 55433"
SCRIPT

  chmod +x "$DB_DIR/start.sh"
  log "INFO" "Startup script created (run manually: $DB_DIR/start.sh)"
}

# Main execution
main() {
  log "INFO" "=== PROD Node Bootstrap Started ==="
  log "INFO" "Store directory: $STORE_DIR"
  log "INFO" "Database directory: $DB_DIR"
  log "INFO" "PostgreSQL port: $PG_PORT"
  log "INFO" "PostgreSQL user: $PG_USER"
  log "INFO" "Database name: $PG_DATABASE"
  log "INFO" "Dry run: $DRY_RUN"
  log "INFO" "Force: $FORCE"

  # Create log directory
  mkdir -p "$DB_DIR"

  # Step 1: Check/install PostgreSQL
  if ! check_postgres_installed; then
    if is_render; then
      install_postgres
    else
      log "ERROR" "PostgreSQL not installed and not running on Render (cannot auto-install)"
      exit 1
    fi
  fi

  # Step 2: Initialize cluster
  initialize_cluster

  # Step 3: Start PostgreSQL
  start_postgres

  # Step 4: Create database
  create_database

  # Step 5: Run migrations
  run_migrations

  # Step 6: Create startup script
  create_startup_script

  log "INFO" "=== PROD Node Bootstrap Complete ==="
  log "INFO" "PROD_DATABASE_URL: postgresql://$PG_USER@127.0.0.1:$PG_PORT/$PG_DATABASE"
  log "INFO" "To start manually: $DB_DIR/start.sh"
  log "INFO" "Logs: $LOG_FILE"
}

# Run main
main
