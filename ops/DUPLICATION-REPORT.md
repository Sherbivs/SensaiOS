# Code Duplication Analysis Report

**Generated:** 2025-06-15  
**Analysis Type:** Heuristic Pattern Scanning  
**Scope:** `src/**/*.ts`

---

## Executive Summary

| Category | Count | Severity | Refactoring Effort |
|----------|-------|----------|-------------------|
| Error Handling | 50+ instances | Medium | Low |
| Embed Builders | 15 instances | Low | Medium |
| Prisma Queries | 50+ instances | Medium | Medium |
| Environment Access | 30+ instances | Medium | Low |
| Discord Button Builders | 9 instances | Low | Low |
| Signal Handlers | 6 instances | Low | Low |
| Date.now() calculations | 50+ instances | Low | Low |
| Dual Query Implementations | 6 file pairs | **High** | **High** |

---

## 1. Error Handling Patterns (50+ instances)

### Pattern A: `error instanceof Error ? error.message : String(error)`

**Files Affected:**
- `src/services/homestead-manager.ts` (5 instances)
- `src/services/homestead-player-monitor.ts` (5 instances)
- `src/shared/prisma.ts` (6 instances)
- `src/workers/database/timescaledb-worker.ts`
- `src/workers/homestead-integrity.ts` (4 instances)
- `src/bot/security/plugins/base-plugin.ts` (3 instances)
- `src/bot/security/plugins/registry.ts` (3 instances)
- `src/shared/metrics-collector.ts` (3 instances)
- `src/shared/observability.ts`
- `src/shared/system-health-monitor.ts` (3 instances)

### Existing Utility (Underutilized)

```typescript
// src/shared/utils/error-utils.ts - Line 115
export function getErrorMessage(error: unknown): string {
  // Already exists but only used in ~15 files
}
```

**Files Using `getErrorMessage` Correctly:**
- `src/shared/prisma.ts` ✅ (4 uses)
- `src/shared/service-registry.ts` ✅
- `src/shared/pg-connection.ts` ✅
- `src/shared/event-bus.ts` ✅
- `src/services/monitoring/os-error-interceptor.ts` ✅
- `src/services/monitoring/resource-manager.ts` ✅

### Recommendation
**LOW EFFORT:** Replace 35+ inline `error instanceof Error ? ...` patterns with `getErrorMessage()` import.

---

## 2. Dual Query Implementation (HIGH PRIORITY)

### Critical Duplication Pattern

The codebase maintains **parallel implementations** of the same queries in both Prisma and raw PostgreSQL:

| Prisma Version | Raw PG Version | Lines |
|---------------|----------------|-------|
| `user-queries.ts` | `user-queries-pg.ts` | ~200 + ~630 |
| `party-queries.ts` | `party-queries-pg.ts` | ~150 + ~500 |
| N/A | `battle-queries-pg.ts` | ~500 |
| N/A | `bus-queries-pg.ts` | ~100 |
| N/A | `encounter-queries-pg.ts` | ~150 |
| N/A | `cooldown-queries-pg.ts` | ~100 |

**Total Duplicated Query Logic:** ~2,000+ lines

### Example Duplication

```typescript
// user-queries.ts (Prisma)
export async function getUserBasic(
  prisma: PrismaClient,
  discordId: string
): Promise<UserBasic | null> {
  return prisma.user.findUnique({
    where: { discordId },
    select: { id: true, discordId: true, coins: true },
  });
}

// user-queries-pg.ts (Raw SQL)
export async function getUserBasic(
  discordId: string,
  pool?: Pool
): Promise<UserBasic | null> {
  const db = getPool(pool);
  const { text, values } = buildSelect("User", ["id", "discordId", "coins"], { discordId });
  const result = await db.query<UserBasic>(text, values);
  return result.rows[0] || null;
}
```

### Recommendation
**HIGH EFFORT:** Consolidate to single query layer. Options:
1. **Keep Prisma only** - Remove `-pg.ts` variants (simpler)
2. **Keep Raw PG only** - Better performance but lose Prisma benefits
3. **Unified facade** - Single API that delegates to implementation

---

## 3. Discord Embed Builder Patterns (15 instances)

### Files with `new EmbedBuilder()`:
- `src/bot/wilds/controls.ts` (line 70)
- `src/bot/profile/embed.ts` (line 52)
- `src/services/player-checkpoint.ts` (line 848)
- `src/services/monitoring/error-alerting-service.ts` (lines 257, 301)
- `src/bot/homestead/open-starter-selection.ts` (lines 62, 102, 123, 158)
- `src/bot/homestead/starters.ts` (line 34)
- `src/bot/homestead/home.ts` (lines 122, 179, 220)
- `src/bot/battle/challenge.ts` (line 44)
- `src/bot/battle/actions.ts` (line 39)

### Color Code Duplication

```typescript
// Scattered across files:
.setColor(0x4caf50)  // Green - wilds/controls.ts, homestead/home.ts
.setColor(0x00C853)  // Green variant - homestead/open-starter-selection.ts
.setColor(0x00c853)  // Green variant - homestead/starters.ts
.setColor(0xffb74d)  // Orange - profile/embed.ts, homestead/home.ts
.setColor(0xff9800)  // Orange variant - battle/challenge.ts
.setColor(0xFF0000)  // Red - error-alerting-service.ts
.setColor(0xFF5252)  // Red variant - open-starter-selection.ts
.setColor(0x2196F3)  // Blue - open-starter-selection.ts
.setColor(0x2196f3)  // Blue - battle/actions.ts
```

### Recommendation
**MEDIUM EFFORT:** Create shared embed utilities:

```typescript
// Proposed: src/bot/shared/embed-colors.ts
export const EMBED_COLORS = {
  SUCCESS: 0x4caf50,
  WARNING: 0xffb74d,
  ERROR: 0xFF0000,
  INFO: 0x2196F3,
  BATTLE: 0xff9800,
} as const;
```

---

## 4. Prisma Query Patterns (50+ instances)

### Repeated `findFirst` patterns:

**homesteadChannel lookups (10+ instances):**
- `src/services/homestead-manager.ts` - Lines 79, 340, 356, 509
- `src/services/homestead-player-monitor.ts` - Lines 205, 350, 469
- `src/workers/homestead-integrity.ts` - Line 169
- `src/services/homestead-verification.ts` - Line 133

### Recommendation
**MEDIUM EFFORT:** Create repository pattern:

```typescript
// Proposed: src/services/homestead-repository.ts
export class HomesteadRepository {
  async findByUserId(userId: string, guildId: string): Promise<HomesteadChannel | null>;
  async findByChannelId(channelId: string): Promise<HomesteadChannel | null>;
  async findActive(guildId: string): Promise<HomesteadChannel[]>;
}
```

---

## 5. Environment Variable Access (30+ instances)

### Pattern: `process.env.X || defaultValue`

**Files with scattered env access:**
- `src/bot/index.ts` (3 instances)
- `src/services/homestead-manager.ts` (2 instances)
- `src/services/homestead-player-monitor.ts` (2 instances)
- `src/services/lifecycle-notifier.ts` (4 instances)
- `src/services/monitoring/resource-monitor.ts` (1 instance)
- `src/services/homestead-verification.ts` (2 instances)
- `src/utils/intelligent-logger.ts` (1 instance)
- `src/bot/ops/admin.ts` (1 instance)
- `src/shared/log.ts` (2 instances)
- `src/shared/console-interceptor.ts` (1 instance)
- `src/runtime/databaseRecovery.ts` (1 instance)

### Recommendation
**LOW EFFORT:** Centralize in `src/shared/config.ts`:

```typescript
// Already exists but underutilized
export const config = {
  homestead: {
    categoryName: process.env.HOMESTEAD_CATEGORY_NAME || 'Homesteads',
    cleanupDays: parseInt(process.env.HOMESTEAD_CLEANUP_DAYS || '90', 10),
    checkIntervalMs: parseInt(process.env.HOMESTEAD_CHECK_INTERVAL_MS || '1000', 10),
  },
  // ... etc
};
```

---

## 6. Signal Handler Duplication (6 instances)

### SIGTERM/SIGINT handlers in multiple files:

| File | Lines |
|------|-------|
| `src/utils/intelligent-logger.ts` | 981, 985 |
| `src/shared/service-registry.ts` | 554, 555 |
| `src/shared/pg-connection.ts` | 325, 332 |

### Issue
Multiple shutdown handlers can cause race conditions or incomplete cleanup.

### Recommendation
**LOW EFFORT:** Consolidate into `service-registry.ts` shutdown sequence only.

---

## 7. Date Calculation Patterns (50+ instances)

### Repeated time window calculations:

```typescript
// Scattered pattern:
new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)   // 7 days ago
new Date(Date.now() - 24 * 60 * 60 * 1000)       // 1 day ago
new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)  // 30 days ago
```

### Files Affected:
- `src/services/homestead-manager.ts` (5 instances)
- `src/services/homestead-player-monitor.ts` (2 instances)
- `src/services/player-checkpoint.ts` (3 instances)
- `src/services/homestead-verification.ts` (1 instance)

### Recommendation
**LOW EFFORT:** Create date utility:

```typescript
// Proposed: src/shared/utils/date-utils.ts
export const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
export const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);
```

---

## Priority Refactoring Roadmap

### Phase 1: Quick Wins (1-2 hours)
1. Replace `error instanceof Error ? ...` with `getErrorMessage()` (35+ sites)
2. Create `EMBED_COLORS` constant
3. Create date utility functions

### Phase 2: Medium Effort (4-8 hours)
1. Centralize environment config
2. Consolidate signal handlers
3. Create HomesteadRepository

### Phase 3: Major Refactoring (16+ hours)
1. **CRITICAL:** Resolve dual query implementation (Prisma vs raw PG)
2. Extract common embed builder patterns
3. Create unified Discord message factory

---

## Metrics Summary

| Metric | Value |
|--------|-------|
| Total duplicate patterns found | 200+ |
| Files with 3+ duplications | 25 |
| Estimated lines of duplication | 2,500+ |
| Already-existing utilities underused | 3 (`getErrorMessage`, `delay`, config) |
| High-priority consolidation targets | 2 (query layer, error handling) |

---

**Report End**

*This analysis used grep pattern matching and heuristic file scanning. Some patterns may have false positives or additional instances not captured.*
