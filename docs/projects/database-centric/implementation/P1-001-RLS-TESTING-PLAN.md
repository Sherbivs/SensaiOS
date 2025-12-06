# P1-001 RLS Integration Testing Plan

**Task:** P1-001 Row-Level Security Policies  
**Status:** Code complete, testing pending  
**Date:** 2025-12-04

---

## Overview

The RLS migration (`20251204040000_row_level_security`) is ready but requires integration testing before production deployment.

## Migration Summary

**Tables Protected (10):**
1. User
2. Trainer
3. TrainerSettings
4. PokemonInstance
5. Party
6. PartySlot
7. Inventory
8. Encounter
9. Battle
10. HomesteadChannel

**PostgreSQL Functions:**
- `set_user_context(discord_id, is_admin)` — Set session variables
- `clear_user_context()` — Clear session variables
- `current_user_discord_id()` — Get Discord ID from session
- `current_internal_user_id()` — Get User.id from Discord ID
- `is_admin_bypass()` — Check admin bypass flag

---

## Testing Requirements

### Pre-Deployment Checklist

- [ ] Deploy migration to ONPREMISE-DEV-EXPERIMENT database
- [ ] Verify all 10 tables have RLS enabled
- [ ] Verify all 44 policies created (4 per table + 4 special)

### Test Scenarios

#### 1. Basic Isolation Tests

```sql
-- Setup: Create two test users
-- User A: discord_id = 'test_user_a_123'
-- User B: discord_id = 'test_user_b_456'

-- Test 1.1: User A cannot see User B's trainer
SELECT set_user_context('test_user_a_123', false);
SELECT * FROM "Trainer" WHERE id = '<user_b_trainer_id>';
-- Expected: 0 rows

-- Test 1.2: User A can see own trainer
SELECT * FROM "Trainer" WHERE id = '<user_a_trainer_id>';
-- Expected: 1 row

-- Clear context
SELECT clear_user_context();
```

#### 2. Pokemon Isolation Tests

```sql
-- Test 2.1: User A cannot see User B's Pokemon
SELECT set_user_context('test_user_a_123', false);
SELECT COUNT(*) FROM "PokemonInstance" WHERE "ownerId" = '<user_b_id>';
-- Expected: 0

-- Test 2.2: User A can see own Pokemon
SELECT COUNT(*) FROM "PokemonInstance" WHERE "ownerId" = '<user_a_id>';
-- Expected: > 0 (user's Pokemon count)
```

#### 3. Party/PartySlot Nested Tests

```sql
-- Test 3.1: User A cannot see User B's party slots
SELECT set_user_context('test_user_a_123', false);
SELECT COUNT(*) FROM "PartySlot" ps
JOIN "Party" p ON ps."partyId" = p.id
WHERE p."ownerId" = '<user_b_id>';
-- Expected: 0

-- Test 3.2: User A can see own party slots
SELECT COUNT(*) FROM "PartySlot" ps
JOIN "Party" p ON ps."partyId" = p.id
WHERE p."ownerId" = '<user_a_id>';
-- Expected: > 0
```

#### 4. Battle Participant Tests

```sql
-- Test 4.1: User A can see battles they're in
SELECT set_user_context('test_user_a_123', false);
SELECT COUNT(*) FROM "Battle" b
WHERE EXISTS (
  SELECT 1 FROM "Trainer" t
  WHERE (t.id = b."trainerId1" OR t.id = b."trainerId2")
  AND t."userId" = current_internal_user_id()
);
-- Expected: User A's battle count

-- Test 4.2: User A cannot see battles between other users
-- (If User A not in battle, should return 0)
```

#### 5. Admin Bypass Tests

```sql
-- Test 5.1: Admin can see all trainers
SELECT set_user_context('admin_user_123', true);
SELECT COUNT(*) FROM "Trainer";
-- Expected: Total trainer count (all users)

-- Test 5.2: Admin can see all Pokemon
SELECT COUNT(*) FROM "PokemonInstance";
-- Expected: Total Pokemon count

-- Test 5.3: Admin bypass allows UPDATE
UPDATE "Trainer" SET "nickname" = 'Admin Edit' WHERE id = '<any_trainer_id>';
-- Expected: Success
```

#### 6. INSERT/DELETE Tests

```sql
-- Test 6.1: User can INSERT own Pokemon
SELECT set_user_context('test_user_a_123', false);
INSERT INTO "PokemonInstance" ("ownerId", "speciesId", ...) 
VALUES (current_internal_user_id(), 'bulbasaur', ...);
-- Expected: Success

-- Test 6.2: User cannot INSERT Pokemon for others
INSERT INTO "PokemonInstance" ("ownerId", "speciesId", ...) 
VALUES ('<user_b_id>', 'bulbasaur', ...);
-- Expected: RLS policy violation error

-- Test 6.3: User can DELETE own Pokemon
DELETE FROM "PokemonInstance" WHERE id = '<user_a_pokemon_id>';
-- Expected: Success

-- Test 6.4: User cannot DELETE others' Pokemon
DELETE FROM "PokemonInstance" WHERE id = '<user_b_pokemon_id>';
-- Expected: 0 rows affected (RLS filters)
```

### TypeScript Integration Tests

Create `tests/services/rls-context.integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/shared/prisma.js';
import { setUserContext, clearUserContext, withRlsContext } from '../../src/services/rls-context.js';

describe('RLS Context Integration', () => {
  let testUserA: { id: string; discordId: string };
  let testUserB: { id: string; discordId: string };

  beforeAll(async () => {
    // Create test users
    testUserA = await prisma.user.create({
      data: { discordId: 'rls_test_user_a_' + Date.now() }
    });
    testUserB = await prisma.user.create({
      data: { discordId: 'rls_test_user_b_' + Date.now() }
    });
  });

  afterAll(async () => {
    // Cleanup test users
    await prisma.user.deleteMany({
      where: { id: { in: [testUserA.id, testUserB.id] } }
    });
  });

  it('should isolate user data with RLS', async () => {
    // User A context
    await setUserContext(prisma, { discordId: testUserA.discordId });
    
    // User A should not see User B
    const visibleUsers = await prisma.user.findMany();
    expect(visibleUsers.find(u => u.id === testUserB.id)).toBeUndefined();
    
    await clearUserContext(prisma);
  });

  it('should allow admin bypass', async () => {
    await setUserContext(prisma, { discordId: 'admin', isAdmin: true });
    
    // Admin should see all users
    const allUsers = await prisma.user.findMany();
    expect(allUsers.length).toBeGreaterThan(0);
    
    await clearUserContext(prisma);
  });

  it('should work with withRlsContext wrapper', async () => {
    const result = await withRlsContext(
      prisma,
      { discordId: testUserA.discordId },
      async (ctx) => {
        const user = await ctx.user.findFirst();
        return user?.id;
      }
    );
    
    expect(result).toBe(testUserA.id);
  });
});
```

---

## Deployment Steps

### Step 1: Deploy to ONPREMISE-DEV-EXPERIMENT

```bash
# Set environment to experiment database
export DATABASE_URL=$DATABASE_ONPREMISE_DEV_EXPERIMENT

# Deploy migration
npx prisma migrate deploy
```

### Step 2: Run Manual SQL Tests

```bash
# Connect to experiment database
psql $DATABASE_ONPREMISE_DEV_EXPERIMENT

# Run test scenarios above
```

### Step 3: Run Integration Tests

```bash
# Run RLS integration tests
npm test -- tests/services/rls-context.integration.test.ts
```

### Step 4: Deploy to ONPREMISE-DEV-PRIMARY

```bash
export DATABASE_URL=$DATABASE_ONPREMISE_DEV_PRIMARY
npx prisma migrate deploy
```

### Step 5: Deploy to CLOUD-PROD-MASTER

```bash
export DATABASE_URL=$PROD_DATABASE_URL
npx prisma migrate deploy
```

---

## Rollback Plan

If issues discovered, rollback migration:

```sql
-- Disable RLS on all tables
ALTER TABLE "User" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Trainer" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "TrainerSettings" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "PokemonInstance" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Party" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "PartySlot" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Inventory" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Encounter" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Battle" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "HomesteadChannel" DISABLE ROW LEVEL SECURITY;

-- Drop all policies (use pg_policies to get names)
DROP POLICY IF EXISTS trainer_select_own ON "Trainer";
DROP POLICY IF EXISTS trainer_update_own ON "Trainer";
DROP POLICY IF EXISTS trainer_insert_own ON "Trainer";
DROP POLICY IF EXISTS trainer_delete_own ON "Trainer";
-- ... (repeat for all tables)

-- Drop functions
DROP FUNCTION IF EXISTS set_user_context(TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS clear_user_context();
DROP FUNCTION IF EXISTS current_user_discord_id();
DROP FUNCTION IF EXISTS current_internal_user_id();
DROP FUNCTION IF EXISTS is_admin_bypass();

-- Drop view
DROP VIEW IF EXISTS rls_policy_summary;
```

---

## Sign-off Requirements

Before marking P1-001 as DONE:

- [ ] All 10 tables have RLS enabled (verified)
- [ ] All 44 policies created (verified)
- [ ] User isolation tests pass
- [ ] Admin bypass tests pass
- [ ] TypeScript integration tests pass
- [ ] Migration deployed to staging
- [ ] Production deployment approved

---

**Created:** 2025-12-04T06:00:00Z  
**Author:** Security Specialist
