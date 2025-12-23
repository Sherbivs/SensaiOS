# Architecture Meeting #2: Redundancy Resistance & Future-Proofing

**Lead Architect:** Senior Architecture Specialist  
**Team:** Systems Architect, Developer Experience Lead, Technical Debt Analyst  
**Date:** 2025-12-22  
**Session:** 2 of N  
**Status:** ACTIONABLE RECOMMENDATIONS

---

## Meeting Objectives

1. **Analyze** current codebase structure patterns vs anti-patterns
2. **Design** redundancy/duplication resistant architecture
3. **Future-proof** the scripts ecosystem for scalable growth
4. **Expand** on Phase 3 migration plan with architectural guardrails

---

## Executive Summary

| Finding | Severity | Impact |
|---------|----------|--------|
| **Output formatter duplication** | 🔴 HIGH | 2 implementations: `scripts/lib/output.ts` AND `src/utils/output-formatter.ts` |
| **Import pattern inconsistency** | 🔴 HIGH | 8 domain CLIs use `lib/`, 18+ root scripts use raw imports |
| **Missing architectural enforcement** | 🟡 MEDIUM | No linter rules prevent bad patterns |
| **No script generation templates** | 🟡 MEDIUM | New scripts can diverge from standard |
| **Naming convention drift** | 🟡 MEDIUM | Mix of `snake_case`, `kebab-case`, `camelCase` |

---

## Part 1: Pattern Analysis

### ✅ GOLDEN PATTERN: Domain CLI Structure

**Files demonstrating correct pattern:**
- [scripts/db/cli.ts](../../scripts/db/cli.ts)
- [scripts/data/cli.ts](../../scripts/data/cli.ts)
- [scripts/render/cli.ts](../../scripts/render/cli.ts)

```typescript
// CORRECT: All domain CLIs follow this import pattern
import {
  c,
  printSection,
  printKeyValue,
  printSuccess,
  printError,
  handleError,
  exec,
  requireEnv,
  loadEnv,
  readJson,
  createCLI,
  createSpinner,
  ScriptError,
  CLIError,
} from '../lib/index.js';
```

**Benefits:**
- Single source of truth for utilities
- Consistent error handling across all CLIs
- Unified output formatting
- Easy to test and mock

### ❌ ANTI-PATTERN: Root Script Imports

**Files demonstrating incorrect pattern:**
- [scripts/db_admin.ts](../../scripts/db_admin.ts) (980 lines)
- [scripts/build-data.ts](../../scripts/build-data.ts) (316 lines)
- [scripts/build_dexpack.ts](../../scripts/build_dexpack.ts) (753 lines)

```typescript
// INCORRECT: Raw node imports instead of lib utilities
import fs from "node:fs";
import path from "node:path";
import * as dotenv from "dotenv";
import { formatStatus } from "../src/utils/output-formatter.js";  // WRONG SOURCE!
```

**Problems:**
- Bypasses `scripts/lib/` utility layer
- Creates dependency on `src/utils/` (application code)
- Inconsistent error handling
- No spinner/progress support
- Duplicated boilerplate in each file

---

## Part 2: Critical Duplication Analysis

### 2.1 Output Formatter Duplication

**TWO implementations exist:**

| File | Lines | Purpose | Users |
|------|-------|---------|-------|
| `scripts/lib/output.ts` | 259 | Scripts-specific formatting | Domain CLIs (8) |
| `src/utils/output-formatter.ts` | 474 | Application + scripts formatting | 4 root scripts + all application code |

**Current state:**
```
Root Scripts (18+)
    └── import from 'src/utils/output-formatter.js'  ❌ WRONG
    
Domain CLIs (8)
    └── import from 'scripts/lib/output.ts' via index.ts  ✅ CORRECT
```

**Problem:** Root scripts reach INTO application code (`src/`) for utilities, creating:
- Circular dependency risk
- Coupling between scripts and application runtime
- Two sets of formatting functions to maintain

### 2.2 Recommended Resolution

**Option A: Consolidate to `src/utils/output-formatter.ts` (REJECTED)**
- Would couple scripts to application code
- Application changes could break scripts
- Application bundles would include script-only utilities

**Option B: Consolidate to `scripts/lib/output.ts` (RECOMMENDED)**
- Scripts remain independent
- `src/utils/output-formatter.ts` can import from scripts OR be deprecated
- Clear boundary: scripts are self-contained

**Option C: Create shared package (OVER-ENGINEERING)**
- Unnecessary complexity for this codebase size

### 2.3 Implementation Plan

```typescript
// Step 1: Enhance scripts/lib/output.ts with missing functions from src/utils
// Already has: printSection, printKeyValue, printSuccess, printError, c (colors)
// Missing: formatBorder, formatSectionHeader, formatKeyValueList, formatStatus, formatList

// Step 2: Create compatibility layer in src/utils/output-formatter.ts
export {
  formatBorder,
  formatSectionHeader,
  formatKeyValueList,
  formatStatus,
  formatList,
} from '../../scripts/lib/output.js';  // Re-export from canonical source

// OR deprecate and direct imports to scripts/lib
```

---

## Part 3: Architectural Guardrails

### 3.1 ESLint Rules for Import Enforcement

**Add to `eslint.config.js`:**

```javascript
// New rule: Prevent scripts from importing application code
{
  files: ['scripts/**/*.ts', 'scripts/**/*.mjs'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['../src/*', '../../src/*'],
          message: 'Scripts must use scripts/lib/ utilities, not src/ imports'
        }
      ],
      paths: [
        {
          name: 'dotenv',
          message: 'Use loadEnv from scripts/lib/env.js instead'
        }
      ]
    }]
  }
}
```

### 3.2 Script Template Generator

**Create `scripts/lib/templates/new-script.ts.template`:**

```typescript
#!/usr/bin/env tsx
/**
 * {{SCRIPT_NAME}} - {{DESCRIPTION}}
 *
 * PURPOSE:
 *   {{PURPOSE}}
 *
 * USAGE:
 *   npx tsx scripts/{{DOMAIN}}/{{FILENAME}}.ts [options]
 *
 * EXIT CODES:
 *   0 - Success
 *   1 - Error
 *
 * @module scripts/{{DOMAIN}}/{{FILENAME}}
 * @since {{DATE}}
 */

import {
  c,
  printSection,
  printSuccess,
  printError,
  handleError,
  loadEnv,
} from '../lib/index.js';

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  printSection('{{SCRIPT_NAME}}');
  
  // TODO: Implement
  
  printSuccess('Done');
}

main().catch(handleError);
```

**Generator script `scripts/lib/generate-script.ts`:**

```typescript
#!/usr/bin/env tsx
import { c, printSection, printSuccess } from './index.js';
import fs from 'node:fs';
import path from 'node:path';

const DOMAINS = ['bot', 'data', 'db', 'dev', 'diagnose', 'docker', 'guard', 'monitor', 'observe', 'ops', 'render', 'security'];

async function main() {
  const [,, domain, name, description] = process.argv;
  
  if (!domain || !name) {
    console.log(`Usage: npx tsx scripts/lib/generate-script.ts <domain> <name> [description]`);
    console.log(`Domains: ${DOMAINS.join(', ')}`);
    process.exit(1);
  }
  
  if (!DOMAINS.includes(domain)) {
    console.error(c.red(`Invalid domain: ${domain}`));
    process.exit(1);
  }
  
  const template = fs.readFileSync(
    path.join(__dirname, 'templates', 'new-script.ts.template'),
    'utf-8'
  );
  
  const output = template
    .replace(/\{\{SCRIPT_NAME\}\}/g, name)
    .replace(/\{\{DESCRIPTION\}\}/g, description ?? 'TODO')
    .replace(/\{\{PURPOSE\}\}/g, description ?? 'TODO')
    .replace(/\{\{DOMAIN\}\}/g, domain)
    .replace(/\{\{FILENAME\}\}/g, name.toLowerCase().replace(/\s+/g, '-'))
    .replace(/\{\{DATE\}\}/g, new Date().toISOString().split('T')[0]);
  
  const outputPath = path.join('scripts', domain, `${name.toLowerCase().replace(/\s+/g, '-')}.ts`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);
  
  printSuccess(`Created ${outputPath}`);
}

main();
```

### 3.3 Naming Convention Standard

**DECISION: `kebab-case` for all script files**

| Current | Proposed | Reason |
|---------|----------|--------|
| `db_admin.ts` | `db-admin.ts` | Consistency |
| `build_dexpack.ts` | `build-dexpack.ts` | Consistency |
| `seed_dex.ts` | `seed-dex.ts` | Consistency |
| `generate_pg_types.ts` | `generate-pg-types.ts` | Consistency |

**Exception:** `cli.ts` remains as-is (standard convention for domain entry points)

---

## Part 4: Future-Proofing Architecture

### 4.1 Directory Ownership Model

```yaml
# scripts/OWNERSHIP.yaml (NEW)
domains:
  lib:
    owner: "@architecture-team"
    purpose: "Shared utilities - changes require architectural review"
    stability: STABLE
    
  bot:
    owner: "@discord-team"
    purpose: "Discord bot operations"
    stability: ACTIVE
    
  data:
    owner: "@data-team"
    purpose: "Data pipeline and dex operations"
    stability: ACTIVE
    
  db:
    owner: "@database-team"
    purpose: "Database administration and migrations"
    stability: ACTIVE
    
  guard:
    owner: "@ci-team"
    purpose: "CI/CD guards and pre-commit hooks"
    stability: STABLE
    
  ops:
    owner: "@operations-team"
    purpose: "Operational tasks and automation"
    stability: ACTIVE
```

### 4.2 Dependency Flow Rules

```
                    ┌─────────────────┐
                    │  scripts/lib/   │  ← FOUNDATION (no external deps)
                    │  (9 modules)    │
                    └────────┬────────┘
                             │
                             │ imports
                             ▼
    ┌────────────────────────┼────────────────────────┐
    │                        │                        │
    ▼                        ▼                        ▼
┌────────┐            ┌────────────┐            ┌─────────┐
│ guard/ │            │   data/    │            │   db/   │
│ (cli)  │            │   (cli)    │            │  (cli)  │
└────────┘            └────────────┘            └─────────┘
                             │
                             │ imports (allowed)
                             ▼
                      ┌────────────┐
                      │ data/dex/  │  ← Subdomain can import parent
                      └────────────┘

FORBIDDEN:
- scripts/* importing from src/* (use lib/ instead)
- Domain CLIs importing from other domains (use lib/ shared utilities)
- lib/ importing from any domain
```

### 4.3 Growth Pattern: New Domain Checklist

When creating a new domain (e.g., `scripts/analytics/`):

```markdown
## New Domain Checklist

- [ ] Create directory: `scripts/analytics/`
- [ ] Create CLI entry: `scripts/analytics/cli.ts`
- [ ] Create ROUTER.md: `scripts/analytics/ROUTER.md`
- [ ] Use template: `npx tsx scripts/lib/generate-script.ts analytics ...`
- [ ] Add to OWNERSHIP.yaml
- [ ] Update parent ROUTER.md
- [ ] Add to package.json scripts section
- [ ] Import ONLY from `../lib/index.js`
```

---

## Part 5: Expanded Phase 3 Plan

### 5.1 Pre-Migration: Output Formatter Consolidation

**BEFORE moving any files, fix the duplication:**

```bash
# Step 1: Audit all formatStatus/formatBorder imports
grep -r "from.*output-formatter" scripts/

# Step 2: Add missing functions to scripts/lib/output.ts
# (formatBorder, formatSectionHeader, formatKeyValueList, formatStatus, formatList)

# Step 3: Update all root scripts to import from lib/
# Change: import { formatStatus } from '../src/utils/output-formatter.js';
# To:     import { formatStatus } from './lib/index.js';

# Step 4: Remove output functions from src/utils/output-formatter.ts
# OR re-export from scripts/lib/output.ts
```

### 5.2 Migration Order (Dependency-Safe)

```
Phase 3.0: Foundation (BEFORE file moves)
├── Consolidate output formatter
├── Add ESLint import restrictions
├── Create script generator template
└── Establish naming conventions

Phase 3.1: Guard Consolidation (LOW RISK)
├── guards/ → guard/
└── Update package.json

Phase 3.2: Create New Domains (NO RISK)
├── mkdir bot/, monitor/, dev/
├── Create ROUTER.md for each
└── Add to parent ROUTER.md

Phase 3.3: Move Root Scripts (MEDIUM RISK)
├── Move guard scripts → guard/
├── Move data scripts → data/
├── Move db scripts → db/
├── Move ops scripts → ops/
├── Move bot scripts → bot/
├── Move monitor scripts → monitor/
└── Move dev scripts → dev/

Phase 3.4: Merge Small Directories (LOW RISK)
├── shared/ → lib/
├── sql/ → db/sql/
├── dex/ → data/dex/
└── devops/ → db/

Phase 3.5: Update All Imports (MEDIUM RISK)
├── Fix import paths in moved files
├── Update lib/ to export new modules
└── Run full test suite

Phase 3.6: Archive & Cleanup (LOW RISK)
├── Move migration scripts → archive/
├── Delete empty directories
└── Final ROUTER.md updates
```

### 5.3 Rollback Plan

```bash
# If any phase fails, rollback using git:
git checkout HEAD~N -- scripts/

# Re-run package.json verification:
npm run lint
npm test
```

---

## Part 6: Implementation Artifacts

### 6.1 Files to Create

| File | Purpose | Priority |
|------|---------|----------|
| `scripts/lib/templates/new-script.ts.template` | Script generation template | HIGH |
| `scripts/lib/generate-script.ts` | Script generator | HIGH |
| `scripts/OWNERSHIP.yaml` | Domain ownership tracking | MEDIUM |
| `.github/CODEOWNERS` additions | Auto-assign reviewers | LOW |

### 6.2 Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `scripts/lib/output.ts` | Add missing format functions | HIGH |
| `eslint.config.js` | Add import restriction rules | HIGH |
| `scripts/ROUTER.md` | Update with final structure | MEDIUM |
| `package.json` | Update all script paths | MEDIUM |

### 6.3 Files to Delete (After Migration)

| Directory | Condition |
|-----------|-----------|
| `scripts/guards/` | After merging to `guard/` |
| `scripts/devops/` | After merging to `db/` |
| `scripts/dex/` | After merging to `data/dex/` |
| `scripts/shared/` | After merging to `lib/` |
| `scripts/sql/` | After merging to `db/sql/` |

---

## Part 7: Success Metrics

### 7.1 Quantitative Goals

| Metric | Current | Target |
|--------|---------|--------|
| Root-level scripts | 47+ | ≤2 (build_typescript.sh, db_admin.ts) |
| Scripts using `lib/` | 8 | ALL (100%) |
| Scripts importing `src/` | 4+ | 0 |
| Directories without ROUTER.md | 4 | 0 |
| Duplicate implementations | 1 (output formatter) | 0 |

### 7.2 Qualitative Goals

- [ ] Any developer can add a new script in <5 minutes using generator
- [ ] Import pattern is obvious and enforced by linter
- [ ] No confusion about where to put new functionality
- [ ] Clear ownership for code review routing

---

## Part 8: Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking npm scripts | MEDIUM | HIGH | Test each phase, use `npm run` checks |
| Import path confusion during migration | MEDIUM | MEDIUM | Document mapping table |
| Incomplete ROUTER.md updates | LOW | MEDIUM | Use checklist, automated verification |
| ESLint rule too restrictive | LOW | LOW | Add escape hatch for legitimate cases |

---

## Meeting Conclusions

### Immediate Actions (This Week)

1. **Consolidate output formatter** - Single implementation in `scripts/lib/output.ts`
2. **Add ESLint import rules** - Prevent future `src/` imports in scripts
3. **Create script generator** - Standardize new script creation

### Short-Term Actions (Next 2 Weeks)

4. **Execute Phase 3 migration** - Follow dependency-safe order
5. **Update all ROUTER.md files** - Reflect new structure
6. **Add OWNERSHIP.yaml** - Clear domain responsibility

### Long-Term Actions (Ongoing)

7. **Enforce naming conventions** - `kebab-case` for all scripts
8. **Maintain architectural guardrails** - Code review + linting
9. **Document growth patterns** - New domain checklist

---

**Next Meeting:** Phase 3 execution retrospective  
**Attendees Required:** Lead Architect, CI/CD Engineer, All domain owners

---

*Document Version: 1.0*  
*Last Updated: 2025-12-22*  
*Review Status: APPROVED FOR IMPLEMENTATION*
