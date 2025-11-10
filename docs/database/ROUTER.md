# ROUTER
Title: Database Documentation
Purpose: Database architecture, replication, clustering, migration, and optimization.
Owned Globs: docs/database/**
Last Updated (UTC): 2025-11-10T00:00:00Z

Notes:
- Canonical reference for database architecture (unified Render-managed PostgreSQL)
- Database replication, clustering, and migration strategies
- Query optimization and performance tuning
- On-premise development database setup

Key Documents:
- **database-systems.md** - Canonical reference for database architecture
- **database-url-selection.md** - CRITICAL database URL selection logic (Absolute requirement)
- **db-control-suite.md** - Database tooling and CLI commands
- **db-replication-architecture.md** - Master-replica cascade with version control (Phase 16)
- **dual-onpremise-database-guide.md** - Dual on-premise database setup for migration testing
- **2-node-cluster-automation.md** - Database cluster automation scripts
- **2-node-cluster-migration.md** - Cluster migration procedures
- **db-cluster-quick-start.md** - Quick start guide for database clusters
- **db-cluster-standardization.md** - Cluster configuration standards
- **database-naming-schema.md** - Database naming conventions
- **prisma-to-pg-migration.md** - Prisma to PostgreSQL migration guide
- **query-optimization-guide.md** - Database query optimization strategies

Architecture Notes:
- **Production**: Unified Render-managed PostgreSQL (infinity-gauntlet-db)
- **Development**: Same Render database (no separate DEV database)
- **Local**: Optional on-premise database (DATABASE_ONPREMISE_DEV_PRIMARY) for offline work
- All services connect to PROD_DATABASE_URL (Render managed database)

Cross-References:
- See docs/architecture/database-systems.md for complete architecture
- See Agents.md for database URL selection contract
- See ops/DB_BOOTSTRAP.md for bootstrap procedures
