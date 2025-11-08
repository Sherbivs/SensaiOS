# Database URL Selection Guide

**Last Updated (UTC):** 2025-11-07T20:30:00Z  
**Importance:** CRITICAL  
**Contract Status:** Absolute Requirement (see Patch.md)

## Overview

This document defines the **canonical URL selection logic** for all database operations across the Infinity Gauntlet project. Non-compliance with these rules causes production failures.

## The Architecture

**As of 2025-11-07**, the system uses a **2-node direct PostgreSQL cluster** with zero proxy layers:

- **DEV (Master)**: Source of truth for migrations and schema changes
- **PROD (Local Node)**: Primary node for live gameplay with <50ms latency

All connections use direct `postgresql://` URLs. No Prisma Accelerate, no connection pooling proxies.

## Environment Variables

### Core Variables (Production)

```bash
DEV_DATABASE_URL       # DEV master (migrations, schema changes)
PROD_DATABASE_URL      # PROD local node (gameplay, <50ms latency)
DATABASE_LOCAL_URL     # Local workstation mirror (offline development, replication testing)
DATABASE_EXPERIMENT_URL # Local experimental database (migrations, experiments, NO auto-sync)
```

### Legacy Variables (Still Supported for DEV Access)

```bash
RENDER_DB_EXTERNAL_URL # DEV master external access (same as DEV_DATABASE_URL)
RENDER_DB_INTERNAL_URL # DEV master internal network (Render services)
```

### Variable Purposes

| Variable | Protocol | Purpose | Access Point | Port |
| --- | --- | --- | --- | --- |
| `DEV_DATABASE_URL` | `postgresql://` | DEV master database | Migrations, schema changes | Render |
| `PROD_DATABASE_URL` | `postgresql://` | PROD local node | Live gameplay (<50ms) | Workstation |
| `DATABASE_LOCAL_URL` | `postgresql://` | Workstation mirror | Offline dev, replication testing | 55433 |
| `DATABASE_EXPERIMENT_URL` | `postgresql://` | Experimental clone | Migrations, destructive testing | 55434 |
| `RENDER_DB_EXTERNAL_URL` | `postgresql://` | DEV master (legacy) | External access | Render |
| `RENDER_DB_INTERNAL_URL` | `postgresql://` | DEV master (legacy) | Render internal | Render |

## Dual Local Database Architecture

**As of 2025-11-08**, the workstation maintains **two independent PostgreSQL clusters**:

- **PRIMARY LOCAL DB** (`DATABASE_LOCAL_URL`, port 55433) — Participates in DEV→LOCAL replication cascade, auto-syncs every 5 minutes, used for production-like testing
- **EXPERIMENTAL DB** (`DATABASE_EXPERIMENT_URL`, port 55434) — Independent clone for development/experiments, **NO auto-sync** (manual only), used for testing migrations before applying to LOCAL/DEV

See `docs/dual-local-database-guide.md` for comprehensive architecture, workflows, and best practices.

## Canonical URL Selection Logic

### For Runtime Queries (Seed, Counts, CRUD)

```typescript
function selectQueryUrl(envVars: Record<string, string>): string {
  const isProd = process.env.NODE_ENV === "production";
  
  if (isProd) {
    // Production uses PROD local node for <50ms latency
    return envVars.PROD_DATABASE_URL ?? "";
  } else {
    // Development uses DEV master or local node
    return (
      envVars.DEV_DATABASE_URL ?? 
      envVars.RENDER_DB_EXTERNAL_URL ?? 
      envVars.DATABASE_LOCAL_URL ??
      ""
    );
  }
}
```

### For Migrations (ALL Environments Use Master)

```typescript
function selectMigrationUrl(envVars: Record<string, string>): string {
  // ALL migrations target DEV master database
  return (
    envVars.DEV_DATABASE_URL ?? 
    envVars.RENDER_DB_EXTERNAL_URL ?? 
    envVars.RENDER_DB_INTERNAL_URL ?? 
    ""
  );
}
```

## Quick Reference

| Operation | Environment | URL Variable | Database Node | Port |
| --- | --- | --- | --- | --- |
| **Live gameplay** | Production | `PROD_DATABASE_URL` | PROD local node (<50ms) | Workstation |
| **Runtime queries** | Development | `DEV_DATABASE_URL` | DEV master | Render |
| **Migrations** | ALL | `DEV_DATABASE_URL` | DEV master (always) | Render |
| **Offline dev** | Local | `DATABASE_LOCAL_URL` | Workstation mirror | 55433 |
| **Experiments** | Local | `DATABASE_EXPERIMENT_URL` | Workstation clone | 55434 |

## Architecture Diagram (Updated 2025-11-08)

```
Developer Laptop          Production Workstation          Databases
---------------          ------------------------        ---------

DEV_DATABASE_URL ────────────────────────────────────> DEV Master (Render)
(migrations)                                           (Source of truth)
                                                              |
                                                              | Replication
                                                              v
                         PROD_DATABASE_URL ───────────> PROD Local Node
                         (gameplay queries)             (<50ms latency)
                         
DATABASE_LOCAL_URL ──────────────────────────────────> Primary Local DB
(offline dev, replication)                             Port: 55433
                                                       Auto-sync: Every 5min
                                                              |
                                                              | Manual Clone
                                                              v
DATABASE_EXPERIMENT_URL ─────────────────────────────> Experimental DB
(migrations, experiments)                              Port: 55434
                                                       Auto-sync: DISABLED
```

## Critical Rules

### ✅ DO

1. **Production gameplay** → Use `PROD_DATABASE_URL` (PROD local node)
2. **All migrations** → Use `DEV_DATABASE_URL` (DEV master)
3. **Development queries** → Use `DEV_DATABASE_URL` (DEV master)
4. **Offline development** → Use `DATABASE_LOCAL_URL` (primary local mirror, port 55433)
5. **Migration testing** → Use `DATABASE_EXPERIMENT_URL` (experimental clone, port 55434)
6. **Destructive experiments** → Use `DATABASE_EXPERIMENT_URL` (safe, won't affect replication)

### ❌ DON'T

1. **Never** run migrations against `PROD_DATABASE_URL` (local node is a replica)
2. **Never** mix protocol types (all connections are `postgresql://`)
3. **Never** use pooled/proxy URLs (direct connections only)
4. **Never** use `localhost` in production (explicit `PROD_DATABASE_URL` required)
5. **Never** run DROP TABLE on `DATABASE_LOCAL_URL` without testing on `DATABASE_EXPERIMENT_URL` first
6. **Never** disable auto-sync on `DATABASE_LOCAL_URL` (breaks replication testing)

## Implementation Examples

### Runtime Configuration (src/shared/config.ts)

```typescript
import { PrismaClient } from "@prisma/client";

// PROD client - PRIMARY for live gameplay
export const prisma = new PrismaClient({
  datasources: {
    db: { 
      url: process.env.PROD_DATABASE_URL || 
           process.env.DATABASE_LOCAL_URL 
    }
  }
});

// DEV client - for migrations and development
export const devPrisma = new PrismaClient({
  datasources: {
    db: { 
      url: process.env.DEV_DATABASE_URL || 
           process.env.RENDER_DB_EXTERNAL_URL 
    }
  }
});

// LOCAL client - for offline development (optional)
export const localPrisma = process.env.DATABASE_LOCAL_URL 
  ? new PrismaClient({
      datasources: {
        db: { url: process.env.DATABASE_LOCAL_URL }
      }
    })
  : null;
```

### Migration Workflows

```bash
# ALL migrations target DEV master
export DEV_DATABASE_URL="postgresql://user:pass@render-host/infinity_gauntlet_db"
npx prisma migrate deploy

# Verify migration applied to master
npm run db:cli -- status
```

### Production Gameplay Queries

```bash
# Production uses PROD local node
export PROD_DATABASE_URL="postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db"
export NODE_ENV="production"
npm start
```

### Development Queries

```bash
# Development uses DEV master
export DEV_DATABASE_URL="postgresql://user:pass@render-host/infinity_gauntlet_db"
npm run db:cli -- counts
```

## Troubleshooting

### Error: Connection Refused (Production)

**Cause:** `PROD_DATABASE_URL` not configured or PostgreSQL not running.

**Solution:**

```bash
# Bootstrap local PostgreSQL cluster
npm run ops:bootstrap-local-db

# Verify PROD_DATABASE_URL in consolidated env file
grep PROD_DATABASE_URL secrets/Infinity-Gauntlet.env
```

### Error: Migration Applied to Wrong Database

**Cause:** `DATABASE_URL` environment variable pointing to PROD local node.

**Solution:**

```bash
# Ensure migrations use DEV master
unset DATABASE_URL
export DEV_DATABASE_URL="postgresql://user:pass@render-host/infinity_gauntlet_db"
npx prisma migrate deploy
```

### Error: High Latency in Production

**Cause:** Using `DEV_DATABASE_URL` (Render) instead of `PROD_DATABASE_URL` (local node).

**Solution:**

```bash
# Switch to local node for production
export PROD_DATABASE_URL="postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db"
export NODE_ENV="production"
npm start
```

## Testing URL Selection

### Unit Test Example

```typescript
import { describe, it, expect } from "vitest";

describe("Database URL Selection", () => {
  it("should use PROD_DATABASE_URL in production", () => {
    const envVars = {
      NODE_ENV: "production",
      PROD_DATABASE_URL: "postgresql://prod-local/db",
      DEV_DATABASE_URL: "postgresql://dev-master/db"
    };
    
    const url = selectQueryUrl(envVars);
    expect(url).toBe(envVars.PROD_DATABASE_URL);
  });

  it("should use DEV_DATABASE_URL in development", () => {
    const envVars = {
      NODE_ENV: "development",
      DEV_DATABASE_URL: "postgresql://dev-master/db",
      PROD_DATABASE_URL: "postgresql://prod-local/db"
    };
    
    const url = selectQueryUrl(envVars);
    expect(url).toBe(envVars.DEV_DATABASE_URL);
  });

  it("should always use DEV_DATABASE_URL for migrations", () => {
    const envVars = {
      DEV_DATABASE_URL: "postgresql://dev-master/db",
      PROD_DATABASE_URL: "postgresql://prod-local/db"
    };
    
    const url = selectMigrationUrl(envVars);
    expect(url).toBe(envVars.DEV_DATABASE_URL);
  });
});
```

## Summary

1. **Production gameplay** uses `PROD_DATABASE_URL` (PROD local node) for <50ms latency
2. **All migrations** use `DEV_DATABASE_URL` (DEV master) - source of truth for schema
3. **Development queries** use `DEV_DATABASE_URL` (DEV master)
4. **Offline development** uses `DATABASE_LOCAL_URL` (workstation mirror)
5. **Zero proxy layers** - all connections are direct `postgresql://` URLs

**Contract Status:** This is an **Absolute** requirement in `Patch.md`. Violations cause production failures and must be fixed immediately.

## See Also

- `AGENTS.md` - Database URL Selection section (quick reference)
- `docs/database-systems.md` - Complete 2-node cluster architecture
- `ops/DB_BOOTSTRAP.md` - Migration and bootstrap procedures
- `docs/WORKSTATION-GAMEPLAY-SETUP.md` - Local node setup guide
