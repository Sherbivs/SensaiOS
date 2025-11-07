# Tools Directory

This directory contains local development tools that are **not tracked in git**.

## PostgreSQL 17 (Local Development)

**Location:** `tools/pgsql17/`  
**Status:** Not tracked (excluded via `.gitignore`)

### Installation

Download and extract PostgreSQL 17 portable for local development:

```bash
# Windows: Download from PostgreSQL official site
# Extract to: tools/pgsql17/pgsql/

# The directory structure should be:
# tools/pgsql17/pgsql/bin/    (postgres.exe, psql.exe, etc.)
# tools/pgsql17/pgsql/lib/
# tools/pgsql17/pgsql/share/
```

### Why Not Tracked?

- **Size:** PostgreSQL binaries are ~100MB+ (too large for git)
- **Platform-specific:** Windows binaries won't work on Linux/Mac
- **Unnecessary:** Developers can download directly from PostgreSQL
- **Security:** No need to store binaries in version control

### Local Database

The local PostgreSQL cluster data is stored in `Store/db/local-cluster/` (also not tracked).

For local database setup, see:
- `scripts/bootstrap_staging_db.ps1`
- `docs/ai-env-setup.md`
- `secrets/README.md`
