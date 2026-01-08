# Backups Inventory

**Created:** 2026-01-06T14:30:00Z  
**Purpose:** Complete inventory of backup and checkpoint files in `backups/`  
**Status:** ✅ COMPLETE — 27 files inventoried  
**Cross-Reference:** [INVENTORY-INDEX.md](INVENTORY-INDEX.md)

---

## 📊 Summary

| Category | Files | Purpose |
|----------|-------|---------|
| Migration Checkpoints | 21 | Schema/code migration backups |
| Pre-TimescaleDB POC | 6 | Database snapshots |
| **TOTAL** | **27** | — |

---

## Root (`backups/`) — 1 file

| File | Tag | Description |
|------|-----|-------------|
| `.gitignore` | #meta | Git ignore for backups |

---

## Migration Checkpoints (`backups/migration-checkpoints/`) — 20 files

**Purpose:** Backup files created during database migrations and schema changes

### Query Migration Files (8 files)

| File | Tag | Description |
|------|-----|-------------|
| `battle-queries-pg.ts` | #db | Battle query PostgreSQL migration |
| `bus-queries-pg.ts` | #db | Event bus query migration |
| `cooldown-queries-pg.ts` | #db | Cooldown query migration |
| `dex-queries-pg.ts` | #db | Dexpack query migration |
| `encounter-queries-pg.ts` | #db | Encounter query migration |
| `party-queries-pg.ts` | #db | Party query migration |
| `user-queries-pg.ts` | #db | User query migration |
| `seed_dex_2025-11-08_092713.ts` | #db | Dex seeding backup |

### Service Migration Files (5 files)

| File | Tag | Description |
|------|-----|-------------|
| `integrity.ts` | #service | Integrity service backup |
| `monitoring.ts` | #service | Monitoring service backup |
| `rollback.ts` | #service | Rollback handler backup |
| `sync.ts` | #service | Sync service backup |
| `version.ts` | #service | Version tracking backup |

### Documentation (2 files)

| File | Tag | Description |
|------|-----|-------------|
| `prisma-to-pg-migration_2025-11-08_092713.md` | #doc | Prisma→PostgreSQL migration report |
| `TASK12-COMPLETION-REPORT.md` | #doc | Task 12 completion report |

### Database Dumps (1 file)

| File | Tag | Description |
|------|-----|-------------|
| `prod-pre-pg18-2025-11-28-174712.dump` | #dump | Pre-PG18 production backup |

### Task 15 Checkpoint (`task15_20251108_103613/`) — 5 files

| File | Tag | Description |
|------|-----|-------------|
| `integrity.test.ts.backup` | #test | Integrity test backup |
| `monitoring.test.ts.backup` | #test | Monitoring test backup |
| `sync.test.ts.backup` | #test | Sync test backup |
| `version.test.ts.backup` | #test | Version test backup |
| `TASK15-PROGRESS-REPORT.md` | #doc | Task 15 progress report |

---

## Pre-TimescaleDB POC (`backups/pre-timescale-poc/`) — 6 files

**Purpose:** Database snapshots taken before TimescaleDB proof-of-concept

### Database Dumps (3 files)

| File | Tag | Description |
|------|-----|-------------|
| `infinity-gauntlet-db-20251201_225111.dump` | #dump | Full DB dump (timestamp 1) |
| `infinity-gauntlet-db-20251201_225511.dump` | #dump | Full DB dump (timestamp 2) |
| `infinity-gauntlet-db-20251201_230300.dump` | #dump | Full DB dump (timestamp 3) |

### Metadata Files (3 files)

| File | Tag | Description |
|------|-----|-------------|
| `backup-20251201_225111-metadata.json` | #meta | Backup metadata (timestamp 1) |
| `backup-20251201_225511-metadata.json` | #meta | Backup metadata (timestamp 2) |
| `backup-20251201_230300-metadata.json` | #meta | Backup metadata (timestamp 3) |

---

## Backup Timeline

| Date | Event | Files Created |
|------|-------|---------------|
| 2025-11-08 | Prisma→PG Migration | 8 query files, migration report |
| 2025-11-08 | Task 15 Checkpoint | 5 test backups, progress report |
| 2025-11-28 | Pre-PG18 Backup | 1 production dump |
| 2025-12-01 | Pre-TimescaleDB POC | 3 dumps + 3 metadata |

---

## Retention Policy

| Category | Retention | Reason |
|----------|-----------|--------|
| Migration Checkpoints | Permanent | Historical reference |
| Pre-TimescaleDB POC | Permanent | Safety net for rollback |
| Task Progress Reports | Permanent | Documentation |
| Database Dumps | Permanent | Disaster recovery |

---

## Tag Reference

| Tag | Description | Count |
|-----|-------------|-------|
| `#db` | Database migration files | 8 |
| `#service` | Service backup files | 5 |
| `#test` | Test file backups | 4 |
| `#dump` | Database dumps | 4 |
| `#doc` | Documentation | 3 |
| `#meta` | Metadata files | 4 |

---

**Last Updated:** 2026-01-06T14:30:00Z
