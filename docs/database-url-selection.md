# Database URL Selection Guide

**Last Updated (UTC):** 2025-11-06T22:00:00Z  
**Importance:** CRITICAL  
**Contract Status:** Absolute Requirement (see Patch.md)

## Overview

This document defines the **canonical URL selection logic** for all database operations across the Infinity Gauntlet project. Non-compliance with these rules causes production failures.

## The Problem

Prisma Client can operate in two modes:
1. **Accelerate Mode** (driver adapter): Requires `prisma://` or `prisma+postgres://` URLs
2. **Direct Mode** (native driver): Requires `postgresql://` URLs

**In production (Render)**, Prisma Client is generated for Accelerate mode. Passing direct PostgreSQL URLs causes validation errors:
```
PrismaClientKnownRequestError: P6001
Error validating datasource `db`: the URL must start with the protocol `prisma://` or `prisma+postgres://`
```

## Environment Variables

### Core Variables
```
DATABASE_URL               ← Prisma Accelerate (production queries)
RENDER_DB_INTERNAL_URL     ← DEV database direct (Render Node internal network)
RENDER_DB_EXTERNAL_URL     ← DEV database direct (developer laptop external access)
DATABASE_LOCAL_URL         ← Render Node local PostgreSQL (Store/db/ persistent disk)
PRISMA_CLIENT_URL          ← Prisma direct connection (non-query operations)
```

### Variable Purposes

| Variable | Protocol | Purpose | Access Point |
| --- | --- | --- | --- |
| `DATABASE_URL` | `prisma+postgres://` | Prisma Accelerate proxy | Production queries (Render Node) |
| `RENDER_DB_INTERNAL_URL` | `postgresql://` | DEV database direct | Render Node (internal network) |
| `RENDER_DB_EXTERNAL_URL` | `postgresql://` | DEV database direct | Developer laptop (migrations) |
| `DATABASE_LOCAL_URL` | `postgresql://` | Render Node local disk | Render Node (`Store/db/` persistent) |
| `PRISMA_CLIENT_URL` | `postgres://` | Prisma proxy direct | Prisma Client fallback |

### Architecture Diagram

```
Developer Laptop          Render Node (Production)        Databases
---------------          ------------------------        ---------
                         
RENDER_DB_EXTERNAL_URL ──────────────────────────────────> DEV DB (Render PostgreSQL)
(migrations only)                                          
                         RENDER_DB_INTERNAL_URL ────────> DEV DB (Render PostgreSQL)
                         (dev queries)
                         
                         DATABASE_URL ──────────────────> Accelerate ──> PROD DB
                         (prod queries)                   (proxy)
                         
                         DATABASE_LOCAL_URL
                         ↓
                         [Render Node Disk]
                         /opt/render/project/src/Store/db/
```

## Canonical Selection Logic

### For Runtime Queries (seed, counts, CRUD)

```typescript
/**
 * Select database URL for Prisma Client operations (queries, writes, counts)
 * 
 * PRODUCTION (on Render Node): Uses DATABASE_URL (Accelerate)
 * DEVELOPMENT (on Render Node): Uses RENDER_DB_INTERNAL_URL (DEV db direct)
 * DEVELOPMENT (from laptop): Uses RENDER_DB_EXTERNAL_URL (DEV db external)
 */
function selectQueryUrl(envVars: Record<string, string>): string {
  const isProd = process.env.NODE_ENV === "production";
  
  if (isProd) {
    // Production on Render Node: Use Accelerate
    return envVars.DATABASE_URL ?? "";
  } else {
    // Development: Prefer internal (Render Node) or external (laptop)
    return (
      envVars.RENDER_DB_INTERNAL_URL ?? 
      envVars.RENDER_DB_EXTERNAL_URL ?? 
      envVars.DATABASE_LOCAL_URL ??
      envVars.DATABASE_URL ?? 
      ""
    );
  }
}
```

**Key Points:**
- Production queries on Render Node: `DATABASE_URL` (Accelerate)
- Development queries on Render Node: `RENDER_DB_INTERNAL_URL` (DEV database direct)
- Development queries from laptop: `RENDER_DB_EXTERNAL_URL` (DEV database external)
- Low-latency gameplay: `DATABASE_LOCAL_URL` (Render Node's `Store/db/` PostgreSQL)
- `DATABASE_URL` as last resort

### For Migrations (DDL operations)

```typescript
/**
 * Select database URL for Prisma migrations (CREATE TABLE, ALTER TABLE, etc.)
 * 
 * CRITICAL: Prisma Accelerate does NOT support DDL operations.
 * - On Render Node: Use RENDER_DB_INTERNAL_URL (DEV database)
 * - From laptop: Use RENDER_DB_EXTERNAL_URL (DEV database)
 * Always use direct PostgreSQL URLs for migrations.
 */
function selectMigrationUrl(envVars: Record<string, string>): string {
  const url = (
    envVars.RENDER_DB_INTERNAL_URL ??  // Prefer internal (Render Node)
    envVars.RENDER_DB_EXTERNAL_URL ??  // Fallback to external (laptop)
    ""
  );
  
  // Validate: Never use Accelerate for migrations
  if (url.startsWith("prisma://") || url.startsWith("prisma+postgres://")) {
    throw new Error(
      "MIGRATION_URL_VALIDATION_ERROR: Cannot use Accelerate URLs for migrations. " +
      "Prisma Accelerate does NOT support DDL operations (CREATE TABLE, ALTER TABLE, etc.). " +
      "Set RENDER_DB_INTERNAL_URL (Render Node) or RENDER_DB_EXTERNAL_URL (laptop) to a direct postgresql:// connection."
    );
  }
  
  return url;
}
```

**Key Points:**
- **NEVER** use `DATABASE_URL` (Accelerate) for migrations
- Migrations require direct PostgreSQL access (`postgresql://` protocol)
- **On Render Node**: Use `RENDER_DB_INTERNAL_URL` (faster, internal network)
- **From laptop**: Use `RENDER_DB_EXTERNAL_URL` (external access to DEV database)
- Validation prevents accidental Accelerate usage

## Quick Reference

### Production Queries (Render Node)
```bash
# Use DATABASE_URL (Prisma Accelerate)
export DATABASE_URL="prisma+postgres://accelerate.prisma-data.net/?api_key=..."
npx tsx scripts/seed_dex.ts
```

### Development Queries (Render Node)
```bash
# Use RENDER_DB_INTERNAL_URL to access DEV database
export RENDER_DB_INTERNAL_URL="postgresql://user:pass@dpg-xxxxxxxxxx/infinity_gauntlet_db"
npx tsx scripts/seed_dex.ts
```

### Development Queries (Laptop)
```bash
# Use RENDER_DB_EXTERNAL_URL to access DEV database from laptop
export RENDER_DB_EXTERNAL_URL="postgresql://user:pass@dpg-xxx.virginia-postgres.render.com/infinity_gauntlet_db"
npx tsx scripts/seed_dex.ts
```

### Migrations (Render Node)
```bash
# Use RENDER_DB_INTERNAL_URL (internal network, no region hostname)
export RENDER_DB_INTERNAL_URL="postgresql://user:pass@dpg-xxxxxxxxxx/infinity_gauntlet_db"
npx prisma migrate deploy
```

### Migrations (Laptop → DEV database)
```bash
# Use RENDER_DB_EXTERNAL_URL to reach DEV database
export RENDER_DB_EXTERNAL_URL="postgresql://user:pass@dpg-xxx.virginia-postgres.render.com/infinity_gauntlet_db"
npx prisma migrate deploy
```

### Low-Latency Gameplay (Render Node Local DB)
```bash
# Use DATABASE_LOCAL_URL for Render Node's Store/db/ PostgreSQL
export DATABASE_LOCAL_URL="postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db"
npm run dev
```

## Common Errors and Fixes

### Error: P6001 - URL must start with prisma://

**Symptom:**
```
PrismaClientKnownRequestError: P6001
the URL must start with the protocol `prisma://` or `prisma+postgres://`
```

**Cause:** Passing direct PostgreSQL URL (`postgresql://`) when Prisma Client expects Accelerate URL in production.

**Fix:**
```bash
# Set DATABASE_URL to Accelerate, not direct PostgreSQL
export DATABASE_URL="prisma+postgres://accelerate.prisma-data.net/?api_key=..."
```

### Error: DDL operations silently fail with Accelerate

**Symptom:** Migrations appear successful but schema changes don't apply.

**Cause:** Prisma Accelerate silently ignores DDL statements (CREATE TABLE, ALTER TABLE, etc.).

**Fix:**
```bash
# On Render Node: Use RENDER_DB_INTERNAL_URL
export RENDER_DB_INTERNAL_URL="postgresql://user:pass@dpg-xxxxxxxxxx/infinity_gauntlet_db"
npx prisma migrate deploy

# From laptop: Use RENDER_DB_EXTERNAL_URL  
export RENDER_DB_EXTERNAL_URL="postgresql://user:pass@dpg-xxx.virginia-postgres.render.com/infinity_gauntlet_db"
npx prisma migrate deploy
```

### Error: Connection timeout from laptop

**Symptom:** `P1001 - Can't reach database server`

**Cause:** Using `RENDER_DB_INTERNAL_URL` (internal-only hostname) from laptop.

**Fix:**
```bash
# From laptop: Use RENDER_DB_EXTERNAL_URL with full region hostname
export RENDER_DB_EXTERNAL_URL="postgresql://user:pass@dpg-xxx.virginia-postgres.render.com/infinity_gauntlet_db"
```

## Implementation Checklist

When adding new database operations:

- [ ] Determine operation type (query vs migration)
- [ ] Select appropriate URL using canonical logic
- [ ] Add environment-aware selection (check `NODE_ENV`)
- [ ] Validate URL protocol matches Prisma Client mode
- [ ] Log selected URL (redacted) for debugging
- [ ] Add error handling for missing URLs
- [ ] Document URL requirements in function JSDoc

## Testing Patterns

### Test Query URL Selection

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("selectQueryUrl", () => {
  const originalEnv = process.env.NODE_ENV;
  
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("should use DATABASE_URL in production", () => {
    process.env.NODE_ENV = "production";
    const envVars = {
      DATABASE_URL: "prisma+postgres://accelerate.example/db",
      RENDER_DB_EXTERNAL_URL: "postgresql://render.example/db",
    };
    
    const url = selectQueryUrl(envVars);
    expect(url).toBe(envVars.DATABASE_URL);
  });

  it("should use RENDER_DB_EXTERNAL_URL in development", () => {
    process.env.NODE_ENV = "development";
    const envVars = {
      DATABASE_URL: "prisma+postgres://accelerate.example/db",
      RENDER_DB_EXTERNAL_URL: "postgresql://render.example/db",
    };
    
    const url = selectQueryUrl(envVars);
    expect(url).toBe(envVars.RENDER_DB_EXTERNAL_URL);
  });
});
```

### Test Migration URL Validation

```typescript
describe("selectMigrationUrl", () => {
  it("should reject Accelerate URLs", () => {
    const envVars = {
      RENDER_DB_EXTERNAL_URL: "prisma+postgres://accelerate.example/db",
    };
    
    expect(() => selectMigrationUrl(envVars)).toThrow(
      "Cannot use Accelerate URLs for migrations"
    );
  });

  it("should accept direct PostgreSQL URLs", () => {
    const envVars = {
      RENDER_DB_EXTERNAL_URL: "postgresql://render.example/db",
    };
    
    const url = selectMigrationUrl(envVars);
    expect(url).toBe(envVars.RENDER_DB_EXTERNAL_URL);
  });
});
```

## Contract Status

This URL selection logic is an **Absolute Requirement** in `Patch.md`. All database operations MUST comply with:

1. **Production queries** use `DATABASE_URL` (Accelerate)
2. **Migrations within Render** use `RENDER_DB_INTERNAL_URL` (direct PostgreSQL, internal network)
3. **Dev environment access** uses `RENDER_DB_EXTERNAL_URL` (DEV database from workstation)
4. **Never** use Accelerate for DDL operations (CREATE/ALTER/DROP TABLE)

Violations cause production failures and must be fixed immediately.

## See Also

- `AGENTS.md` - Database URL Selection section with inline examples
- `Patch.md` - Contract Absolutes for database operations
- `scripts/shared/database-url.ts` - Reusable URL selection utilities
- `src/shared/prisma.ts` - Triple-client architecture (PROD/DEV/LOCAL)
- `ops/DB_BOOTSTRAP.md` - Migration workflow and URL requirements
