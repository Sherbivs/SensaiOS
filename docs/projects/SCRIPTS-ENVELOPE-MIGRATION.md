# 🚀 Scripts Envelope Migration — Phase 2

**Prompt this to any AI agent to begin work:**

---

## Mission

Migrate appropriate `console.*` calls in the `scripts/` directory to the unified envelope logging system. Scripts are CLI tools where console output is often **intentional**, so this migration requires careful judgment.

## Context

- **Phase 1 COMPLETE:** All `src/` files migrated (~82 files, ~1,083 calls)
- **Phase 2:** Scripts directory (~75 files, ~1,200+ calls)
- **Key Insight:** Many script console calls are **user-facing CLI output** and should NOT be migrated

---

## 📊 COMPLETE FILE INVENTORY

### Tier 1: CLI Framework (DO NOT MIGRATE)
These are **output infrastructure** — the console calls ARE the feature:

| File | Calls | Purpose | Action |
|------|-------|---------|--------|
| `scripts/lib/output.ts` | 20 | ANSI color output, formatting | ❌ SKIP |
| `scripts/lib/cli.ts` | 7 | CLI framework, help generation | ❌ SKIP |
| `scripts/lib/progress.ts` | 8 | Spinners, progress bars | ❌ SKIP |
| `scripts/lib/errors.ts` | 1 | Error formatting | ❌ SKIP |
| `scripts/lib/exec.ts` | 1 | Command execution | ❌ SKIP |

**Why skip:** These modules define `printSuccess()`, `printError()`, `spinner()`, etc. — they ARE the console abstraction for scripts.

### Tier 2: CLI Tools Using lib/ (DO NOT MIGRATE)
These use `scripts/lib/output.ts` properly:

| File | Calls | Purpose | Action |
|------|-------|---------|--------|
| `scripts/db/cli.ts` | 23 | Database CLI | ❌ SKIP |
| `scripts/ops/cli.ts` | 19 | Operations CLI | ❌ SKIP |
| `scripts/render/cli.ts` | 20 | Render CLI | ❌ SKIP |
| `scripts/docker/cli.ts` | 23 | Docker CLI | ❌ SKIP |
| `scripts/guard/cli.ts` | 15 | Guard CLI | ❌ SKIP |
| `scripts/diagnose/cli.ts` | 14 | Diagnostics CLI | ❌ SKIP |
| `scripts/data/cli.ts` | 15 | Data CLI | ❌ SKIP |
| `scripts/observe/logs.ts` | 15 | Log viewer | ❌ SKIP |
| `scripts/logq.ts` | 17 | Log query tool | ❌ SKIP |

**Why skip:** User-facing CLI output is intentional.

### Tier 3: Large Admin Scripts (EVALUATE CASE-BY-CASE)
These have mixed usage — some debug, some user output:

| File | Calls | Purpose | Recommendation |
|------|-------|---------|----------------|
| `scripts/db-admin.ts` | 121 | Database admin | 🔍 Review — uses output-formatter |
| `scripts/measure-memory.mjs` | 66 | Memory profiling | 🔍 Review — metrics output |
| `scripts/measure-startup-time.mjs` | 63 | Startup benchmarks | 🔍 Review — metrics output |
| `scripts/security/migrate-security-state.ts` | 51 | State migration | ⚠️ MIGRATE debug/errors |
| `scripts/security/rollback-security-migration.ts` | 45 | Rollback tool | ⚠️ MIGRATE debug/errors |
| `scripts/ops/bootstrap-onpremise-experiment.ts` | 56 | DB bootstrap | ⚠️ MIGRATE debug/errors |
| `scripts/memory-snapshot.mjs` | 41 | Heap analysis | 🔍 Review — diagnostic output |
| `scripts/check-dead-code.ts` | 35 | Dead code finder | 🔍 Review — analysis output |
| `scripts/validate-database-urls.ts` | 32 | URL validation | ❌ SKIP — validation output |
| `scripts/demo-infinity-console.ts` | 31 | Demo script | ❌ SKIP — demo output |
| `scripts/guard-db-migrations.mjs` | 31 | Migration guard | 🔍 Review |
| `scripts/test-pool-behavior.ts` | 30 | Pool testing | 🔍 Review — test output |

### Tier 4: Archive Scripts (LOW PRIORITY)
Old/one-time scripts — migrate only if actively used:

| Directory | Files | Total Calls | Action |
|-----------|-------|-------------|--------|
| `scripts/archive/one-time-migrations/` | 8 | ~258 | ⏸️ DEFER |
| `scripts/archive/logging-migration/` | 2 | ~47 | ⏸️ DEFER |
| `scripts/archive/guards-legacy/` | 1 | 2 | ⏸️ DEFER |

### Tier 5: Smaller Scripts (QUICK WINS)
These have few calls and clear migrate/skip decisions:

| File | Calls | Decision |
|------|-------|----------|
| `scripts/preflight.ts` | 5 | ⚠️ MIGRATE |
| `scripts/register-commands.ts` | 12 | 🔍 Review |
| `scripts/ensure-data.ts` | 6 | ⚠️ MIGRATE |
| `scripts/build-dexpack.ts` | 6 | 🔍 Review |
| `scripts/build-data.ts` | 2 | ⚠️ MIGRATE |
| `scripts/dev-prod-auto-sync.ts` | 2 | ⚠️ MIGRATE |
| `scripts/generate-dependency-graph.ts` | 3 | ❌ SKIP — output |
| `scripts/build-assets-manifest.ts` | 1 | ⚠️ MIGRATE |

### Tier 6: Seed/Data Scripts
| File | Calls | Decision |
|------|-------|----------|
| `scripts/seed-dex.ts` | 25 | 🔍 Review |
| `scripts/dex/seed-reference.ts` | 11 | 🔍 Review |
| `scripts/dex/backfill-species.ts` | 10 | 🔍 Review |
| `scripts/dex/warm-cache.ts` | 9 | 🔍 Review |
| `scripts/ops/dex-v2-backup.ts` | 6 | 🔍 Review |

---

## Decision Framework

### ❌ DO NOT MIGRATE These Patterns:

```typescript
// 1. User-facing status output
console.log('✅ Build complete');
console.log(`Found ${count} items`);

// 2. Data output for piping
console.log(JSON.stringify(result, null, 2));
process.stdout.write(data);

// 3. Progress indicators
console.log(`Processing ${i}/${total}...`);

// 4. Help text / usage
console.log('Usage: script [options]');

// 5. Validation results
console.log('✅ DATABASE_URL: Valid');
console.error('❌ Missing required field');

// 6. Using scripts/lib/output.ts
printSuccess('Operation complete');
printError('Failed');
```

### ⚠️ DO MIGRATE These Patterns:

```typescript
// 1. Debug output with [Tag]
console.log('[ScriptName] Debug info:', data);

// 2. Internal error logging
console.error('[ScriptName] Internal error:', err);

// 3. Status that's not user-facing
console.log('[ScriptName] Starting phase 2...');

// 4. Verbose mode debug
if (verbose) console.log('Details:', info);
```

### Migration Pattern:

```typescript
// BEFORE
/* eslint-disable no-console */
console.log('[MyScript] Starting migration...');
console.error('[MyScript] Failed:', err.message);

// AFTER
import { scopedLogger } from '../src/observability/envelope/console.js';
const log = scopedLogger('my-script');

log.info('migrate', 'Starting migration...');
log.error('migrate', 'Failed', { error: err.message });

// Keep user-facing output as raw console or use lib/output.ts
console.log('✅ Migration complete');
```

---

## Import Paths

```typescript
// From scripts/*.ts
import { scopedLogger } from '../src/observability/envelope/console.js';

// From scripts/lib/*.ts
import { scopedLogger } from '../../src/observability/envelope/console.js';

// From scripts/ops/*.ts or scripts/security/*.ts
import { scopedLogger } from '../../src/observability/envelope/console.js';

// From scripts/archive/one-time-migrations/*.ts
import { scopedLogger } from '../../../src/observability/envelope/console.js';
```

---

## Recommended Migration Order

### Phase 2.1: Quick Wins (5 files, ~16 calls)
1. `scripts/build-data.ts` — 2 calls
2. `scripts/build-assets-manifest.ts` — 1 call
3. `scripts/preflight.ts` — 5 calls
4. `scripts/ensure-data.ts` — 6 calls
5. `scripts/dev-prod-auto-sync.ts` — 2 calls

Status: COMPLETE (2025-12-27) — build-data, build-assets-manifest, preflight, ensure-data, dev-prod-auto-sync migrated.

### Phase 2.2: Security Scripts (2 files, ~96 calls)
1. `scripts/security/migrate-security-state.ts` — 51 calls
2. `scripts/security/rollback-security-migration.ts` — 45 calls

Status: COMPLETE (2025-12-27) — security migration + rollback scripts migrated.

### Phase 2.3: Ops Scripts (3 files, ~88 calls)
1. `scripts/ops/bootstrap-onpremise-experiment.ts` — 56 calls
2. `scripts/ops/sync-onpremise-experiment.ts` — 23 calls
3. `scripts/ops/bootstrap-onpremise-dev.ts` — 13 calls

Status: COMPLETE (2025-12-27) — All 3 ops scripts migrated with envelope audit logging + improved emoji user output.
- sync-onpremise-experiment.ts: 6 envelope audit points (config, sync phases, completion, errors)
- bootstrap-onpremise-dev.ts: 5 envelope audit points (bootstrap start, cluster, completion, errors)
- bootstrap-onpremise-experiment.ts: 4 envelope audit points (bootstrap start, completion, errors)
- User-facing console output preserved with consistent emoji styling

### Phase 2.4: Evaluation & Completion (5 migrated, 10 skipped)

**Migrated (audit logging added, user output preserved):**
- `scripts/seed-dex.ts`
- `scripts/dex/seed-reference.ts`
- `scripts/dex/backfill-species.ts`
- `scripts/register-commands.ts`
- `scripts/build-dexpack.ts`

**Skipped (user-facing output preserved):**
- `scripts/dex/warm-cache.ts`
- `scripts/ops/dex-v2-backup.ts`
- `scripts/check-dead-code.ts`
- `scripts/guard-db-migrations.mjs`
- `scripts/test-pool-behavior.ts`
- `scripts/db-admin.ts`
- `scripts/generate-dependency-graph.ts`
- `scripts/measure-memory.mjs`
- `scripts/measure-startup-time.mjs`
- `scripts/memory-snapshot.mjs`

Status: COMPLETE (2025-12-27) — audit logging added to 5 scripts; 10 scripts intentionally skipped.

---

## Commands

```powershell
# Count console calls per file
Get-ChildItem -Path scripts -Recurse -Include "*.ts","*.mjs" | 
  Select-String -Pattern "console\." | 
  Group-Object Path | 
  Select-Object @{N='File';E={$_.Name -replace '.*\\scripts\\',''}}, Count |
  Sort-Object Count -Descending

# Find eslint-disable comments
findstr /s /c:"eslint-disable no-console" scripts\*.ts

# Test a specific script after migration
npx tsx scripts/preflight.ts

# Verify build
npm run build
```

---

## Success Criteria

- [ ] Tier 1 & 2 (CLI framework) — Confirmed as DO NOT MIGRATE
- [x] Phase 2.1 quick wins — Migrated (build-data.ts, build-assets-manifest.ts, preflight.ts, ensure-data.ts, dev-prod-auto-sync.ts)
- [x] Phase 2.2 security scripts — Migrated (debug/error calls only)
- [x] Phase 2.3 ops scripts — Migrated (15 envelope audit points across 3 files)
- [x] Phase 2.4 evaluation complete (5 migrated, 10 skipped)
- [ ] All migrated scripts still function correctly
- [ ] Build passes
- [x] `Prompt.md` updated with completion status

---

## Summary Statistics

| Category | Files | Calls | Action |
|----------|-------|-------|--------|
| CLI Framework (Tier 1) | 5 | ~37 | ❌ SKIP |
| CLI Tools (Tier 2) | 9 | ~161 | ❌ SKIP |
| Admin Scripts (Tier 3) | 12 | ~600 | 🔍 EVALUATE |
| Archive (Tier 4) | 11 | ~307 | ⏸️ DEFER |
| Quick Wins (Tier 5) | 8 | ~37 | ⚠️ MIGRATE |
| Seed/Data (Tier 6) | 5 | ~61 | 🔍 EVALUATE |
| **TOTAL** | **~75** | **~1,200** | Mixed |

**Realistic migration target:** ~150-200 calls across ~15-20 files (the rest are intentional CLI output)

---

**Next:** Scripts envelope migration complete; optional follow-up is test verification in local env.
