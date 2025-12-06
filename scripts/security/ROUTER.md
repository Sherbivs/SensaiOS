# ROUTER
Title: Security Migration Scripts
Purpose: Database migration and rollback automation for security bot state
Owned Globs: scripts/security/**
Last Updated (UTC): 2025-06-15T12:00:00Z

## Overview

This directory contains scripts for migrating security bot state from JSON files to PostgreSQL database, as part of the Security Bot Database Transformation project (SECDB-2025-12).

## Migration Pipeline

```
JSON Source                         PostgreSQL Target
─────────────────────────────────────────────────────────────────────
Store/security-bot-state/
├── role-archive/
│   └── role-changes.json    ──►    RoleChangeAudit table
├── baselines.json           ──►    SecurityBaseline table
└── snapshots/*.json         ──►    SecurityEvent table
```

## Scripts

### migrate-security-state.ts
**Purpose:** Migrates JSON state files to PostgreSQL database
**Task:** P0-003 (Migration + Rollback Automation)
**Status:** ✅ Complete

**Features:**
- Multi-phase migration with progress tracking
- Batch inserts for performance (configurable batch size)
- Hash chain integrity for role changes (SOC 2 compliant)
- HMAC verification for baselines
- Dry-run mode for preview
- Rollback data generation
- Verbose logging option

**Usage:**
```bash
# Preview migration (no changes)
npx tsx scripts/security/migrate-security-state.ts --dry-run

# Migrate to local development database
npx tsx scripts/security/migrate-security-state.ts --target onpremise-dev

# Migrate to production database
npx tsx scripts/security/migrate-security-state.ts --target cloud-prod

# Verbose migration with verification
npx tsx scripts/security/migrate-security-state.ts --target onpremise-dev --verify --verbose
```

**Options:**
| Option | Default | Description |
|--------|---------|-------------|
| `--dry-run` | false | Preview migration without writing |
| `--target` | `onpremise-dev` | Target: `cloud-prod` or `onpremise-dev` |
| `--batch-size` | 100 | Records per database batch |
| `--verify` | false | Verify integrity after migration |
| `--verbose` | false | Enable detailed logging |

### rollback-security-migration.ts
**Purpose:** Rolls back database migration to restore pre-migration state
**Task:** P0-003 (Migration + Rollback Automation)
**Status:** ✅ Complete

**Features:**
- Reads rollback data from `.rollback-data.json`
- Deletes migrated records by migration marker
- Removes migration marker files
- Confirmation prompt (skip with `--force`)
- Dry-run mode for preview

**Usage:**
```bash
# Preview rollback (no changes)
npx tsx scripts/security/rollback-security-migration.ts --dry-run

# Rollback with confirmation
npx tsx scripts/security/rollback-security-migration.ts --target onpremise-dev

# Force rollback (no confirmation)
npx tsx scripts/security/rollback-security-migration.ts --target onpremise-dev --force
```

**Options:**
| Option | Default | Description |
|--------|---------|-------------|
| `--dry-run` | false | Preview rollback without changes |
| `--target` | `onpremise-dev` | Target: `cloud-prod` or `onpremise-dev` |
| `--force` | false | Skip confirmation prompt |
| `--verbose` | false | Enable detailed logging |

## Generated Files

Migration creates marker files in `Store/security-bot-state/`:

| File | Purpose |
|------|---------|
| `.migration-complete` | Indicates successful migration |
| `.rollback-data.json` | Data for rollback operation |
| `.rollback-complete` | Indicates successful rollback |

## Data Transformations

### Role Changes (JSON → RoleChangeAudit)

```typescript
// JSON Source
{
  "id": "uuid-string",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "memberId": "123456789",
  "memberTag": "user#1234",
  "guildId": "987654321",
  "guildName": "Test Guild",
  "type": "addition",
  "roleId": "111222333",
  "roleName": "Member",
  "origin": "security-bot-sweep",
  "metadata": {}
}

// Database Record
{
  guildId: BigInt("987654321"),
  memberId: BigInt("123456789"),
  roleId: BigInt("111222333"),
  roleName: "Member",
  changeType: "ADDED",
  executorId: null,
  origin: "security-bot-sweep",
  previousHash: "...",
  currentHash: "sha256:...",
  authReason: "Legacy migration - pre-database",
  timestamp: Date,
}
```

### Baselines (JSON → SecurityBaseline)

```typescript
// JSON Source
{
  "baselines": {
    "averageChangesPerHour": 5.2,
    "peakActivityHours": [10, 14, 18],
    "confidenceLevel": 0.85,
    "dataPointCount": 1000,
    "computedAt": "2025-01-15T00:00:00.000Z"
  },
  "metadata": {
    "savedAt": "2025-01-15T00:05:00.000Z",
    "schemaVersion": "1.0"
  },
  "signature": "hmac-sha256:..."
}

// Database Record
{
  guildId: BigInt("987654321"),
  averageChangesPerHour: 5.2,
  peakActivityHours: [10, 14, 18],
  confidenceLevel: 0.85,
  dataPointCount: 1000,
  computedAt: Date,
  signatureHmac: "hmac-sha256:...",
  refreshIntervalMs: 3600000,
  lastHealthCheck: Date,
  isStale: false,
}
```

## Dependencies

### Runtime
- Node.js 20+
- tsx (TypeScript execution)
- Prisma client (auto-generated)

### Source Data
- `Store/security-bot-state/role-archive/role-changes.json`
- `Store/security-bot-state/baselines.json`
- `Store/security-bot-state/snapshots/*.json`

## Cross-References

- **Project:** `docs/projects/security-db-transformation/`
- **Sprint Tracker:** `docs/projects/security-db-transformation/SPRINT-TRACKER.md`
- **Schema:** `prisma/schema.prisma` (security models)
- **Services:** `src/bot/security/services/`
- **Types:** `src/bot/security/types/database-models.ts`
- **Tests:** `tests/security/services/`

## Notes

- Scripts use `eslint-disable no-console` for CLI output (expected)
- Migration is idempotent (checks for existing records)
- Hash chain uses SHA-256 for SOC 2 compliance
- HMAC uses SHA-256 with configurable secret key
- Rollback only deletes records marked with migration authReason
