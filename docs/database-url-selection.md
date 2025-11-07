# Database URL Selection Guide

**Last Updated (UTC):** 2025-11-07T01:30:00Z  
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

## Environment Variables (Priority Order)

### Production (NODE_ENV=production)
```
1. DATABASE_POOL_URL         ← REQUIRED (Prisma Accelerate connection pool)
2. DATABASE_ACCELERATE_URL   ← Alternative Accelerate URL
3. DATABASE_URL              ← Fallback (must be Accelerate URL in prod)
```

### Development (NODE_ENV=development)
```
1. DATABASE_EXTERNAL_URL     ← PREFERRED (WSL/remote access)
2. DATABASE_DIRECT_URL       ← Direct PostgreSQL (local/staging)
3. DATABASE_URL              ← Generic fallback
```

### Migrations (ALL environments)
```
1. DATABASE_EXTERNAL_URL     ← DDL operations require direct PostgreSQL
2. DATABASE_DIRECT_URL       ← Never use Accelerate for migrations
3. DATABASE_URL              ← Last resort (verify it's direct)
```

## Canonical Selection Logic

### For Runtime Queries (seed, counts, CRUD)

```typescript
/**
 * Select database URL for Prisma Client operations (queries, writes, counts)
 * 
 * PRODUCTION: Uses Accelerate URLs to match generated Prisma Client mode
 * DEVELOPMENT: Uses direct PostgreSQL URLs for faster iteration
 */
function selectQueryUrl(envVars: Record<string, string>): string {
  const isProd = process.env.NODE_ENV === "production";
  
  if (isProd) {
    // Production MUST use Accelerate URLs
    return (
      envVars.DATABASE_POOL_URL ?? 
      envVars.DATABASE_ACCELERATE_URL ?? 
      envVars.DATABASE_URL ?? 
      ""
    );
  } else {
    // Development SHOULD use direct URLs
    return (
      envVars.DATABASE_EXTERNAL_URL ?? 
      envVars.DATABASE_DIRECT_URL ?? 
      envVars.DATABASE_URL ?? 
      ""
    );
  }
}
```

### For Migrations (prisma migrate deploy)

```typescript
/**
 * Select database URL for migrations
 * 
 * ALL ENVIRONMENTS: MUST use direct PostgreSQL URLs
 * Accelerate does NOT support DDL operations (CREATE TABLE, etc.)
 */
function selectMigrationUrl(envVars: Record<string, string>): string {
  // ALWAYS prefer direct URLs for migrations
  return (
    envVars.DATABASE_EXTERNAL_URL ?? 
    envVars.DATABASE_DIRECT_URL ?? 
    envVars.DATABASE_URL ?? 
    ""
  );
}
```

## Implementation Checklist

### ✅ Scripts Must Use Environment-Aware Selection

**Do NOT hardcode URL selection**. Use the canonical logic:

```typescript
// ❌ WRONG - ignores environment
const url = envVars.DATABASE_DIRECT_URL || envVars.DATABASE_URL;

// ✅ CORRECT - environment-aware
const isProd = process.env.NODE_ENV === "production";
const url = isProd
  ? (envVars.DATABASE_POOL_URL ?? envVars.DATABASE_URL)
  : (envVars.DATABASE_DIRECT_URL ?? envVars.DATABASE_URL);
```

### ✅ Detect Accelerate vs Direct URLs

```typescript
const isAccelerateUrl = (url: string): boolean => {
  return url.startsWith("prisma://") || url.startsWith("prisma+");
};
```

### ✅ Set PRISMA_CLIENT_ENGINE_TYPE for Accelerate

```typescript
if (isAccelerateUrl(selectedUrl)) {
  process.env.PRISMA_CLIENT_ENGINE_TYPE = "dataproxy";
}
```

### ✅ Log URL Selection Decisions

```typescript
log("database.url.selected", {
  environment: process.env.NODE_ENV,
  operation: "seed|migration|query",
  hasPoolUrl: !!envVars.DATABASE_POOL_URL,
  hasDirectUrl: !!envVars.DATABASE_DIRECT_URL,
  selectedUrl: selectedUrl.substring(0, 30) + "...",
  isAccelerate: isAccelerateUrl(selectedUrl),
});
```

## Known Implementations

### Compliant Files
- ✅ `scripts/dev_prod_auto_sync.ts` - `cliEnvForSeed()` (fixed 2025-11-07)
- ✅ `scripts/dev_prod_auto_sync.ts` - `withPrismaClient()` (fixed 2025-11-07)
- ✅ `src/shared/config.ts` - `resolveDatabaseUrl()` (canonical implementation)
- ✅ `src/shared/prisma.ts` - Triple-client initialization

### Files Requiring Audit
- 🔍 `scripts/seed_dex.ts` - Creates own PrismaClient
- 🔍 `scripts/db_admin.ts` - CLI database operations
- 🔍 `scripts/db_smoke.ts` - Smoke tests
- 🔍 Any other script with `new PrismaClient()`

## Common Errors

### Error 1: Wrong URL in Production
```
❌ Dex seeding failed: PrismaClientKnownRequestError
Invalid `prisma.type.findMany()` invocation
Error: the URL must start with the protocol `prisma://`
```

**Fix**: Use `DATABASE_POOL_URL` in production, not `DATABASE_DIRECT_URL`.

### Error 2: Accelerate URL for Migrations
```
❌ Migration failed: Prisma Accelerate does not support DDL operations
```

**Fix**: Always use `DATABASE_DIRECT_URL` or `DATABASE_EXTERNAL_URL` for migrations.

### Error 3: Missing Engine Type
```
❌ PrismaClientInitializationError: Invalid runtime
```

**Fix**: Set `PRISMA_CLIENT_ENGINE_TYPE="dataproxy"` when using Accelerate URLs.

## Testing Validation

### Unit Test Pattern
```typescript
describe("database URL selection", () => {
  it("uses POOL_URL in production", () => {
    process.env.NODE_ENV = "production";
    const url = selectQueryUrl({
      DATABASE_POOL_URL: "prisma://prod.example/db",
      DATABASE_DIRECT_URL: "postgresql://direct.example/db",
    });
    expect(url).toBe("prisma://prod.example/db");
  });

  it("uses DIRECT_URL in development", () => {
    process.env.NODE_ENV = "development";
    const url = selectQueryUrl({
      DATABASE_POOL_URL: "prisma://prod.example/db",
      DATABASE_DIRECT_URL: "postgresql://direct.example/db",
    });
    expect(url).toBe("postgresql://direct.example/db");
  });
});
```

## Contract Enforcement

**As of 2025-11-07**, database URL selection is an **Absolute** requirement in `Patch.md`:

> All database operations must use environment-aware URL selection:
> - Production: DATABASE_POOL_URL (Accelerate)
> - Development: DATABASE_DIRECT_URL (Direct PostgreSQL)
> - Migrations: DATABASE_DIRECT_URL (all environments)

Violations of this rule will cause production failures and must be fixed immediately.

## Migration Checklist

When adding new database operations:

1. ☑ Determine operation type (query vs migration)
2. ☑ Use appropriate URL selection function
3. ☑ Detect Accelerate vs direct URL
4. ☑ Set `PRISMA_CLIENT_ENGINE_TYPE` if Accelerate
5. ☑ Log selection decision with context
6. ☑ Test in both production and development modes
7. ☑ Document in this file under "Known Implementations"

## References

- Architecture: `docs/database-systems.md`
- Triple-client system: `docs/database-configuration.md`
- Shared config: `src/shared/config.ts` (`resolveDatabaseUrl()`)
- Auto-sync implementation: `scripts/dev_prod_auto_sync.ts`
- Agent guidance: `Agents.md` (Database Replication Architecture section)
