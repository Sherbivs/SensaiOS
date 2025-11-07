# Documentation Archive

This directory contains historical documentation that is no longer accurate for the current system architecture but is preserved for reference.

**Archive Date**: 2025-11-07 (Phase 9.6: Documentation Accuracy Audit)

## Archived Files

### Prisma Accelerate Migration Documentation (Obsolete)

The system migrated from Prisma Accelerate to a 2-node direct PostgreSQL cluster during Phases 1-8. These documents describe the obsolete Accelerate-based architecture:

- **db-accelerate-workflow.md** - Accelerate connection workflow (obsolete)
- **database-configuration.md** - Accelerate configuration guide (replaced by `database-systems.md`)
- **db-replication-architecture.md** - Accelerate-based replication design (replaced by `2-node-cluster-automation.md`)
- **db-replication-runbook.md** - Accelerate operational runbook (obsolete)
- **db-control-suite.md** - CLI tools with Accelerate references (updated version needed)
- **northstar-phase1-completion.md** - Historical Northstar Phase 1 report (pre-migration)

## Current Documentation

For up-to-date information, refer to:

- **`database-systems.md`** - Current 2-node cluster architecture (DEV master + PROD local node)
- **`database-url-selection.md`** - Database URL selection logic for 2-node cluster
- **`2-node-cluster-migration.md`** - Migration summary from Accelerate to direct PostgreSQL
- **`2-node-cluster-automation.md`** - Automation and synchronization design
- **`WORKSTATION-GAMEPLAY-SETUP.md`** - Local database setup for <50ms latency gameplay
- **`README.md`** - Current setup instructions and deployment guide

## Why These Were Archived

1. **Accelerate Removal**: Prisma Accelerate was removed during Phases 1-8 (commits e50f31b through 2ae4bfe)
2. **Architecture Change**: System now uses direct PostgreSQL connections (no proxy/pooling layer)
3. **Simplification**: 2-node cluster (DEV master + PROD local node) replaces complex Accelerate cascade
4. **Performance**: <50ms latency achieved with local PostgreSQL vs. ~200ms with Accelerate proxy

## Recovery Instructions

If you need to reference Accelerate-specific workflows:
1. Check git history for these files before 2025-11-07
2. Review `docs/ACCELERATE-MIGRATION-ARCHIVE.md` for detailed migration notes
3. Consult `docs/2-node-cluster-migration.md` for architecture comparison
