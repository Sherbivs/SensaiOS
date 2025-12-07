# Prisma Import Standardization Project

**Project Status:** 🚨 BLOCKING PRODUCTION  
**Priority:** CRITICAL — Render deploy failing  
**Created:** 2025-12-07  
**Team Lead:** Architecture Specialist

---

## 🎯 Executive Summary

The Render production build is failing because **15 files** are importing from `@prisma/client` instead of our custom-generated client at `../generated/prisma/client.js`.

This is a **systemic architectural issue** that requires:
1. Immediate fix to restore production
2. Long-term prevention mechanisms
3. Documentation of the correct pattern

---

## 👥 AI Specialist Team Assembly

### Team Composition

| Specialist | Role | Focus Area |
|------------|------|------------|
| **Architecture Specialist** (Lead) | System design, import patterns | Standardization strategy |
| **Database Specialist** | Prisma configuration, schema | Generator output paths |
| **AI Coding Specialist** | Implementation | Code migration |
| **DevOps Specialist** | CI/CD | Build-time validation |

### Team Findings

#### Architecture Specialist Analysis

**Root Cause:** The project uses a custom Prisma output path configured in `prisma.config.ts`:

```typescript
// prisma.config.ts
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma"  // <-- Custom output path
}
```

This means `@prisma/client` is **NOT the correct import path**. The correct imports are:

```typescript
// ✅ CORRECT: Import from generated path
import { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type { User, Battle } from '../generated/prisma/client.js';

// ✅ CORRECT: Import prisma instance from shared
import { prisma } from '../shared/prisma.js';

// ❌ WRONG: Import from @prisma/client
import { PrismaClient } from '@prisma/client';  // FAILS ON RENDER
```

#### Database Specialist Analysis

**Why this happens:**
1. Developers copy patterns from Prisma docs (which assume default output)
2. IDE autocomplete suggests `@prisma/client` 
3. Local builds may work if stale `node_modules/@prisma/client` exists
4. Render does fresh `npm install` → `prisma generate` → custom path only

**Why custom output path:**
- Keeps generated code in `src/` for TypeScript compilation
- Allows version control of generated types (optional)
- Isolates Prisma from `node_modules` churn

---

## 📊 Impact Assessment

### Affected Files (15 total)

#### src/services/ (10 files)
| File | Line | Import Type | Models Needed |
|------|------|-------------|---------------|
| `audit-service.ts` | 19 | value + types | PrismaClient, Prisma, AuditLog |
| `base-repository.ts` | 12 | type only | PrismaClient |
| `battle-repository.ts` | 16 | mixed | PrismaClient, Prisma, Battle, User |
| `homestead-verification.ts` | 30 | type only | User, HomesteadChannel |
| `pokemon-repository.ts` | 19 | type only | PrismaClient, PokemonInstance, Species, Prisma |
| `query-profiler.ts` | 21 | value | PrismaClient |
| `rls-context.ts` | 12 | type only | PrismaClient |
| `trainer-repository.ts` | 19-20 | type only | PrismaClient, Trainer, Party, PartySlot, PokemonInstance, User, Prisma |
| `write-coalescer.ts` | 22 | value | PrismaClient |

#### src/bot/security/services/ (5 files)
| File | Line | Import Type | Models Needed |
|------|------|-------------|---------------|
| `cross-reference-validation-service.ts` | 14 | type only | PrismaClient |
| `input-sanitization-service.ts` | 15 | type only | PrismaClient |
| `integrity-sweep-scheduler.ts` | 16 | type only | PrismaClient |
| `retention-policy-service.ts` | 28 | type only | PrismaClient |
| `test-isolation-service.ts` | 26 | type only | PrismaClient |

### Files Using CORRECT Pattern (18 references)
These files already use the correct import pattern and serve as examples:
- `src/shared/prisma.ts` — Canonical source
- `src/models/index.ts` — Model re-exports
- `src/shared/console-renderer.ts`
- `src/shared/log-aggregator.ts`
- `src/shared/system-health-monitor.ts`
- `src/shared/observability.ts`
- `src/types/db-models.ts`
- `src/services/homestead-manager.ts`
- `src/services/homestead-player-monitor.ts`
- `src/services/player-checkpoint.ts`
- `src/workers/homestead-integrity.ts`

---

## 🏗️ Proposed Architecture

### Import Pattern Standard

```typescript
// =============================================================================
// PRISMA IMPORT STANDARDS — Infinity Gauntlet Project
// =============================================================================

// PATTERN 1: Need PrismaClient type only (most common for services)
import type { PrismaClient } from '../generated/prisma/client.js';

// PATTERN 2: Need PrismaClient value (rare - usually use shared instance)
import { PrismaClient } from '../generated/prisma/client.js';

// PATTERN 3: Need model types only (User, Battle, etc.)
import type { User, Battle, Trainer } from '../generated/prisma/client.js';

// PATTERN 4: Need Prisma namespace (for Prisma.UserCreateInput, etc.)
import { Prisma } from '../generated/prisma/client.js';
import type { Prisma } from '../generated/prisma/client.js';  // if type-only

// PATTERN 5: Need the shared prisma instance (MOST COMMON)
import { prisma } from '../shared/prisma.js';

// PATTERN 6: Combined - types + instance
import { prisma } from '../shared/prisma.js';
import type { User, Battle } from '../generated/prisma/client.js';
```

### Path Calculation Guide

| From Directory | To generated/prisma | To shared/prisma |
|----------------|---------------------|------------------|
| `src/services/` | `../generated/prisma/client.js` | `../shared/prisma.js` |
| `src/bot/` | `../../generated/prisma/client.js` | `../../shared/prisma.js` |
| `src/bot/security/services/` | `../../../../generated/prisma/client.js` | `../../../../shared/prisma.js` |
| `src/shared/` | `../generated/prisma/client.js` | N/A (is the source) |
| `src/workers/` | `../generated/prisma/client.js` | `../shared/prisma.js` |

---

## 📋 Implementation Plan

### Phase 1: Immediate Fix (Restore Production)
**Goal:** Fix all 15 files to unblock Render deploy  
**Time:** ~30 minutes  
**Risk:** Low (import path change only)

1. Fix each file's import statement
2. Verify local build: `npm run build`
3. Run type check: `npx tsc --noEmit`
4. Commit and push
5. Monitor Render deploy

### Phase 2: Prevention Mechanisms
**Goal:** Prevent future occurrences  
**Time:** 1-2 hours

#### Option A: ESLint Rule (Recommended)
```javascript
// eslint.config.js addition
{
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['@prisma/client'],
        message: 'Import from "../generated/prisma/client.js" instead. See docs/projects/prisma-import-standardization/'
      }]
    }]
  }
}
```

#### Option B: TypeScript Path Alias
```jsonc
// tsconfig.json addition
{
  "compilerOptions": {
    "paths": {
      "@prisma/client": ["./src/generated/prisma/client.js"]
    }
  }
}
```
**Note:** Path aliases can cause issues with Node.js resolution. ESLint rule is safer.

#### Option C: Pre-commit Hook
```bash
# .husky/pre-commit addition
grep -r "from '@prisma/client'" src/ && echo "ERROR: Use '../generated/prisma/client.js'" && exit 1
```

### Phase 3: Documentation & Training
**Goal:** Educate all contributors  
**Time:** 1 hour

1. Add to `.github/instructions/database.instructions.md`
2. Add to `Agents.md` under Database Architecture section
3. Add example in each ROUTER.md for services directory
4. Create VSCode snippets for correct patterns

---

## 🔧 Technical Details

### Why Local Builds May Work

```
Local Development:
┌─────────────────────────────────────────────────────────────┐
│ npm install (cached node_modules with @prisma/client)       │
│ prisma generate → src/generated/prisma/                     │
│ Both paths may resolve (stale + fresh)                      │
│ Build: ✅ PASSES                                            │
└─────────────────────────────────────────────────────────────┘

Render Production:
┌─────────────────────────────────────────────────────────────┐
│ npm install (fresh, minimal node_modules)                   │
│ prisma generate → src/generated/prisma/                     │
│ @prisma/client → EMPTY (no default output configured)       │
│ Build: ❌ FAILS                                             │
└─────────────────────────────────────────────────────────────┘
```

### Generated Client Structure

```
src/generated/prisma/
├── client.ts          # Main entry (PrismaClient, Prisma namespace)
├── browser.ts         # Browser-safe types
├── models.ts          # All model types (User, Battle, etc.)
├── enums.ts           # Enum definitions
├── commonInputTypes.ts
└── internal/
    ├── class.ts
    └── prismaNamespace.ts
```

---

## ✅ Success Criteria

### Phase 1 Complete When:
- [ ] All 15 files updated with correct imports
- [ ] `npm run build` passes locally
- [ ] `npx tsc --noEmit` passes
- [ ] Render deploy succeeds
- [ ] Bot comes online in production

### Phase 2 Complete When:
- [ ] ESLint rule added and verified
- [ ] Pre-commit hook catches violations
- [ ] CI fails on wrong import pattern

### Phase 3 Complete When:
- [ ] Documentation updated in 3+ locations
- [ ] Agents.md includes canonical pattern
- [ ] VSCode snippets available

---

## 📝 Decision Log

| Date | Decision | Rationale | Made By |
|------|----------|-----------|---------|
| 2025-12-07 | Fix imports immediately | Production blocking | Architecture Lead |
| 2025-12-07 | Use ESLint rule for prevention | Non-invasive, clear errors | Team consensus |
| 2025-12-07 | Keep custom output path | Already in use, benefits outweigh costs | Database Specialist |

---

## 🔗 References

- `prisma.config.ts` — Generator configuration
- `src/shared/prisma.ts` — Canonical prisma instance export
- `src/generated/prisma/` — Generated client location
- Prisma Docs: [Custom Output](https://www.prisma.io/docs/concepts/components/prisma-client/working-with-prismaclient/generating-prisma-client#using-a-custom-output-path)

---

**Next Action:** Proceed with Phase 1 implementation to restore production, then return for Phase 2-3 work.
