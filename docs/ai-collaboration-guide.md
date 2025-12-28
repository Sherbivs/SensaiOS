# AI Collaboration Guide — Pokémon Infinity Gauntlet

**Purpose:** Comprehensive guide for AI assistants working on this project. Learn patterns, workflows, and best practices for making effective, safe contributions.

**Audience:** GitHub Copilot, Claude, ChatGPT, and other AI coding assistants helping with this codebase.

**Last Updated:** 2025-12-28

---

## 🎯 Quick Start

### Before Any Work
1. **Read** `.github/copilot-instructions.md` — Project-specific rules and conventions
2. **Read** `Agents.md` — Operational guide and capabilities
3. **Check** `Tasklist.md` — Current backlog and priorities
4. **Review** `Prompt.md` — Recent changes and context
5. **Verify** `ops/NEXT.yaml` — Active task queue

### First Principles
- **Safety First:** Never break production, always validate changes
- **Incremental Progress:** Small, tested, committed changes
- **Documentation:** Update routers, docs, and tests
- **Quality Standards:** Zero build errors, zero new ESLint warnings
- **Systematic Approach:** Follow established patterns, don't reinvent

---

## 📁 Project Structure Understanding

### Key Directories

```
Infinity-Gauntlet/
├── src/                    # TypeScript application source
│   ├── bot/               # Discord bot layer (commands, handlers)
│   ├── core/              # Game engines (battle, encounter, PBSL)
│   ├── services/          # Business logic services
│   ├── workers/           # Background workers
│   ├── shared/            # Shared utilities, config, Prisma
│   ├── utils/             # Helper functions, logging
│   └── observability/     # Monitoring, metrics, logging
│
├── scripts/               # Automation and utilities
│   ├── security/          # Security-related scripts
│   ├── dex/              # Pokémon data scripts
│   ├── ops/              # Operations utilities
│   ├── lib/              # Script library primitives
│   └── archive/          # Legacy one-time scripts
│
├── tests/                 # Vitest test suite
├── prisma/               # Database schema and migrations
├── docs/                 # Architecture and operations docs
├── ops/                  # Governance (tasks, routers, metadata)
└── Store/                # Persistent on-disk cache
```

### Critical Files (Never Delete/Rename)

- **`Patch.md`** — AI Project Manager Contract (workflow rules)
- **`Tasklist.md`** — Task backlog and tracking
- **`Prompt.md`** — Current state and recent changes
- **`ops/NEXT.yaml`** — Active task queue
- **`masterroutetable.md`** — Human-readable router index
- **Any `ROUTER.md`** — Directory documentation

---

## 🔄 Standard Workflows

### Making Code Changes

#### 1. Pre-Flight Checklist
```typescript
// ✅ DO:
- Read related ROUTER.md files to understand context
- Check for existing patterns in similar files
- Verify TypeScript builds: npm run build
- Run relevant tests: npm test
- Update documentation as you go

// ❌ DON'T:
- Make changes without understanding the system
- Skip testing your changes
- Leave TODO comments without creating tasks
- Break existing patterns for "style" preferences
```

#### 2. Standard Change Process
```bash
# 1. Make your changes following existing patterns
# 2. Validate TypeScript
npm run build

# 3. Run tests
npm test

# 4. Update routers if structure changed
npm run docs:update-routers

# 5. Stage and commit
git add <files>
git commit -m "[Task TXX.X] Brief description

Why: Reason for change
Changes: What was modified
Testing: Commands run and results"

# 6. Push to main
git push origin main
```

#### 3. Update Documentation
```markdown
When you change code, also update:
- Parent ROUTER.md (add/remove file listings)
- Child ROUTER.md (if creating new directory)
- Relevant docs/ files (if behavior changed)
- Tasklist.md (mark task DONE, add outcomes)
- Prompt.md (add to Last Repo Changes)
```

### Working with TypeScript

#### Import Patterns
```typescript
// ✅ CORRECT: Use .js extensions for TypeScript imports
import { prisma } from '../shared/prisma.js';
import { logger } from '../utils/logger.js';
import { formatSectionHeader } from '../utils/output-formatter.js';

// ❌ WRONG: Don't use .ts extensions
import { prisma } from '../shared/prisma.ts';
```

#### Error Handling
```typescript
// ✅ GOOD: Structured error handling
try {
  const result = await riskyOperation();
  return { success: true, data: result };
} catch (error) {
  logger.error('Operation failed', { error: error.message });
  return { success: false, error: error.message };
}

// ❌ BAD: Swallowing errors
try {
  await riskyOperation();
} catch {}
```

### Database Operations

#### Prisma Usage
```typescript
// ✅ CORRECT: Use the right Prisma client
import { prisma } from '../shared/prisma.js';  // Production database

// All gameplay operations use prisma client
const users = await prisma.user.findMany();

// ❌ WRONG: Don't hardcode connection strings
const client = new PrismaClient({
  datasources: { db: { url: 'postgresql://...' } }
});
```

#### Migration Workflow
```bash
# 1. Make schema changes in prisma/schema.prisma
# 2. Create migration
npx prisma migrate dev --name descriptive_name

# 3. Apply to production (via Render)
npx prisma migrate deploy

# 4. Update Tasklist.md with migration details
```

---

## 🎨 Code Patterns and Standards

### Output Formatting (CRITICAL PATTERN)

**Context:** We standardized on `output-formatter.ts` for all CLI output. This provides consistent, operator-friendly formatting.

#### The Pattern
```typescript
// ✅ CORRECT: Use output-formatter functions
import {
  formatSectionHeader,
  formatKeyValueList,
  formatList,
  printSuccess,
  printError,
  printWarning,
  printInfo
} from '../utils/output-formatter.js';

// Headers
console.log(formatSectionHeader('Database Migration'));

// Key-value data
console.log(formatKeyValueList({
  'Status': 'Complete',
  'Records': '1,234',
  'Duration': '5.2s'
}));

// Lists
console.log(formatList(['File 1', 'File 2', 'File 3']));

// Status messages
printSuccess('Migration completed successfully');
printError('Failed to connect to database');
printWarning('Deprecated API usage detected');
printInfo('Starting backup process...');

// ❌ WRONG: Raw console with emoji
console.log('✅ Success message');
console.error('❌ Error message');
console.log('====================');
console.log('=  Section Header  =');
console.log('====================');
```

#### When NOT to Use output-formatter
```typescript
// Library primitives (scripts/lib/*.ts)
// - These are the building blocks that output-formatter uses
// - Must use raw console.log/error/warn

// Envelope system (src/observability/envelope/*.ts)
// - The logging layer itself
// - Must use globalThis.console.* directly

// Valid formatted patterns (ALREADY using output-formatter)
console.log(formatSectionHeader('Title'));  // ✅ This is correct!
```

### Logging Standards

#### Application Logging (src/)
```typescript
// ✅ CORRECT: Use scopedLogger from envelope system
import { scopedLogger } from '../observability/envelope/console.js';

const log = scopedLogger('component-name');

log.info('operation', 'Message', { metadata });
log.warn('operation', 'Warning', { details });
log.error('operation', 'Error occurred', { error: err.message });
```

#### Logger-First Import Order (CRITICAL)
Logger imports must come before other imports in any file that initializes logging (entrypoints, scripts, workers).

```typescript
// ✅ CORRECT
import { scopedLogger } from '../observability/envelope/console.js';
import fs from 'node:fs';

// ❌ WRONG
import fs from 'node:fs';
import { scopedLogger } from '../observability/envelope/console.js';
```

#### Script Logging (scripts/)
```typescript
// ✅ CORRECT: Use output-formatter for user-facing output
import { printInfo, printSuccess, printError } from '../src/utils/output-formatter.js';

printInfo('Starting process...');
// ... do work ...
printSuccess('Process completed');
```

### Testing Patterns

#### Unit Tests
```typescript
import { describe, it, expect, vi } from 'vitest';

describe('ComponentName', () => {
  it('should do expected behavior', async () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = await functionUnderTest(input);
    
    // Assert
    expect(result).toBe('expected');
  });
});
```

#### Mocking Prisma
```typescript
// Mock at top of test file
vi.mock('../shared/prisma.js', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      create: vi.fn(),
    }
  }
}));

// In test
import { prisma } from '../shared/prisma.js';

it('should query database', async () => {
  vi.mocked(prisma.user.findMany).mockResolvedValue([
    { id: '1', username: 'test' }
  ]);
  
  const result = await getUsers();
  
  expect(prisma.user.findMany).toHaveBeenCalled();
  expect(result).toHaveLength(1);
});
```

---

## 🔍 Finding Work to Do

### Priority Order
1. **Check `ops/NEXT.yaml`** — Multi-task queue (3 main + 1 quick task)
2. **Review `Tasklist.md`** — Look for READY status tasks
3. **Check `Prompt.md`** — Recent changes might reveal needs
4. **Search for TODO comments** — `grep -r "TODO" src/ scripts/`
5. **Check test failures** — `npm test` and fix failing tests

### Common Improvement Patterns

#### 1. Console Output Conversion
```bash
# Find files still using raw console calls
grep -r "console\." scripts/ --include="*.ts" | grep -v "formatSection" | grep -v "output-formatter"

# Convert them to output-formatter patterns
# See "Output Formatting" section above
```

#### 2. Missing Tests
```bash
# Find source files without corresponding tests
find src/ -name "*.ts" ! -name "*.spec.ts" ! -name "*.test.ts"

# Create tests in tests/ directory with .spec.ts suffix
```

#### 3. Documentation Gaps
```bash
# Find directories without ROUTER.md
find src/ -type d ! -path "*/node_modules/*" -exec test ! -e "{}/ROUTER.md" \; -print

# Create ROUTER.md following the template
```

#### 4. ESLint Issues
```bash
# Find remaining eslint-disable comments
grep -r "eslint-disable" src/ scripts/ --include="*.ts"

# Fix the underlying issues instead of disabling rules
```

---

## 📋 Quality Checklists

### Before Committing

- [ ] TypeScript builds: `npm run build` (zero errors)
- [ ] Tests pass: `npm test` (no new failures)
- [ ] ESLint clean: `npm run lint` (zero new warnings)
- [ ] Routers updated: `npm run docs:update-routers`
- [ ] Documentation reflects changes
- [ ] Commit message follows template
- [ ] No secrets or credentials in code
- [ ] No commented-out code (use git history)

### Before Pushing

- [ ] All commits have meaningful messages
- [ ] No "WIP" or "temp" commits
- [ ] Tests still pass after all commits
- [ ] Prompt.md updated with changes
- [ ] Tasklist.md reflects current state

### After Pushing

- [ ] Verify GitHub push succeeded
- [ ] Check GitHub Actions (if applicable)
- [ ] Update relevant issue/PR links
- [ ] Notify user of completion

---

## 🚨 Common Pitfalls

### 1. Breaking Changes
```typescript
// ❌ BAD: Changing function signatures without updating callers
export function oldFunction(param1: string) { }
// Changed to:
export function oldFunction(param1: string, param2: number) { }
// Now all callers are broken!

// ✅ GOOD: Add optional parameters or create new function
export function oldFunction(param1: string, param2?: number) { }
// Or:
export function newFunction(param1: string, param2: number) { }
export function oldFunction(param1: string) {
  return newFunction(param1, 0); // Default value
}
```

### 2. Database URL Confusion
```typescript
// ❌ BAD: Using wrong environment variable names
const dbUrl = process.env.DEV_DATABASE_URL;  // WRONG - deprecated
const dbUrl = process.env.LOCAL_DATABASE_URL; // WRONG - doesn't exist

// ✅ GOOD: Use canonical names
const dbUrl = process.env.PROD_DATABASE_URL;  // Production database
const dbUrl = process.env.DATABASE_ONPREMISE_DEV_PRIMARY;  // Workstation dev
```

### 3. Import Path Issues
```typescript
// ❌ BAD: Wrong relative paths
import { logger } from '../../utils/logger.js';  // Too many ../
import { logger } from 'utils/logger.js';        // Missing ../

// ✅ GOOD: Count directory levels correctly
import { logger } from '../utils/logger.js';
```

### 4. Async/Await Mistakes
```typescript
// ❌ BAD: Not awaiting promises
async function loadData() {
  prisma.user.findMany();  // Forgot await!
  return;
}

// ✅ GOOD: Always await async operations
async function loadData() {
  const users = await prisma.user.findMany();
  return users;
}
```

### 5. Test Isolation Issues
```typescript
// ❌ BAD: Tests affecting each other
let globalState = [];

it('test 1', () => {
  globalState.push('data');
  expect(globalState).toHaveLength(1);
});

it('test 2', () => {
  // globalState still has 'data' from test 1!
  expect(globalState).toHaveLength(0); // FAILS
});

// ✅ GOOD: Reset state between tests
let globalState: string[];

beforeEach(() => {
  globalState = [];
});

it('test 1', () => {
  globalState.push('data');
  expect(globalState).toHaveLength(1);
});

it('test 2', () => {
  expect(globalState).toHaveLength(0); // PASSES
});
```

---

## 🎯 Project-Specific Knowledge

### Homestead Channels (CRITICAL)
**As of 2025-06-15, all gameplay uses private guild channels, NOT Discord DMs.**

```typescript
// ❌ WRONG: DM-based gameplay (REMOVED)
await user.send('Welcome to the game!');

// ✅ CORRECT: Homestead channel gameplay
const homesteadChannel = await getOrCreateHomesteadChannel(guild, user);
await homesteadChannel.send('Welcome to your homestead!');
```

**Key Files:**
- `src/bot/homestead/` — Homestead channel handlers
- `docs/architecture-bible/18-private-channel-architecture.md` — Complete spec

### Database Architecture
**Production uses unified Render-managed PostgreSQL.**

```typescript
// THREE Prisma clients:
import { 
  prisma,                    // PROD_DATABASE_URL - PRIMARY for all operations
  onPremiseDevPrisma,       // DATABASE_ONPREMISE_DEV_PRIMARY - Workstation dev
  onPremiseExperimentPrisma // DATABASE_ONPREMISE_DEV_EXPERIMENT - Migration testing
} from '../shared/prisma.js';

// Always use prisma for production operations
const users = await prisma.user.findMany();
```

### Worker Architecture
**6 workers + 1 cron job run on Render.**

```typescript
// Workers run as separate services:
// 1. Infinity-Gauntlet (main bot)
// 2. infinity-gauntlet-outbox (message delivery)
// 3. infinity-gauntlet-cache (cache maintenance)
// 4. infinity-gauntlet-data-pipeline (reference data)
// 5. infinity-gauntlet-security (permission guardrails)
// 6. pokedex-cache-worker (external data sync)
// 7. pokedex-cache-failsafe (weekly cron)
```

### State Persistence
**Security bot state uses PostgreSQL CacheEntry table (migrated from file storage 2025-12-27).**

```typescript
// ✅ CORRECT: Database-first persistence
import { saveState, loadState } from './state/persistence.js';

const state = await loadState();
// ... modify state ...
await saveState(state);

// ❌ WRONG: File-based persistence (DEPRECATED)
fs.writeFileSync('Store/security-bot-state/state.json', JSON.stringify(state));
```

### Memory Management
**All runtime structures are bounded to prevent leaks.**

```typescript
// ✅ GOOD: Bounded data structures
const cache = new Map(); // With max size check
if (cache.size > MAX_SIZE) {
  const firstKey = cache.keys().next().value;
  cache.delete(firstKey);
}

// ❌ BAD: Unbounded growth
const cache = new Map();
cache.set(key, value); // No size limit!
```

---

## 🚀 Advanced Patterns

### Batch Operations
```typescript
// When making multiple independent edits, use multi_replace_string_in_file
// ✅ EFFICIENT: Parallel edits
await multiReplaceStringInFile({
  replacements: [
    { file: 'a.ts', oldString: '...', newString: '...' },
    { file: 'b.ts', oldString: '...', newString: '...' },
    { file: 'c.ts', oldString: '...', newString: '...' }
  ]
});

// ❌ SLOW: Sequential edits
await replaceStringInFile('a.ts', '...', '...');
await replaceStringInFile('b.ts', '...', '...');
await replaceStringInFile('c.ts', '...', '...');
```

### Router Navigation
```typescript
// Start with ops/ROUTER.yaml (router-of-routers)
// Navigate to specific subsystem routers
// Example: Finding bot command handlers
// 1. ops/ROUTER.yaml → src/ROUTER.md
// 2. src/ROUTER.md → src/bot/ROUTER.md
// 3. src/bot/ROUTER.md → src/bot/homestead/ROUTER.md
```

### Error Recovery
```typescript
// ✅ GOOD: Graceful degradation
try {
  const data = await fetchFromAPI();
  return { success: true, data };
} catch (error) {
  logger.error('API fetch failed', { error: error.message });
  const cached = await fetchFromCache();
  if (cached) {
    logger.info('Using cached data as fallback');
    return { success: true, data: cached, fromCache: true };
  }
  return { success: false, error: 'No data available' };
}
```

---

## 📚 Essential Reading

### Must Read First
1. **`.github/copilot-instructions.md`** — Project-specific conventions
2. **`Agents.md`** — Operational guide and capabilities
3. **`README.md`** — Getting started and architecture overview

### Architecture References
- **`docs/architecture-bible/INDEX.md`** — 27 sections covering system design
- **`docs/operations-bible/INDEX.md`** — 13 sections on operations
- **`docs/development-bible/INDEX.md`** — 10 sections on development

### Specific Topics
- **Database:** `operations-bible/02-database-operations.md`
- **Workers:** `architecture-bible/03-worker-architecture.md`
- **Homesteads:** `architecture-bible/18-private-channel-architecture.md`
- **Testing:** `development-bible/04-testing-guide.md`
- **Prisma 7:** `docs/prisma-7-bible.md` (1000+ lines comprehensive guide)

---

## 🎓 Learning from Completed Work

### Case Study: Output Formatter Migration

**Context:** Phase 2 of UX/Visual Simplification project converted 20+ operational scripts from raw console calls to standardized output-formatter patterns.

**What Was Done:**
```typescript
// Before (Phase 1 state):
console.log('✅ Success!');
console.error('❌ Error!');
console.log('============================');
console.log('=    Database Migration    =');
console.log('============================');

// After (Phase 2 completion):
import { printSuccess, printError, formatSectionHeader } from '../utils/output-formatter.js';

printSuccess('Success!');
printError('Error!');
console.log(formatSectionHeader('Database Migration'));
```

**Key Lessons:**
1. **Pattern Recognition:** Found 200+ console calls to convert
2. **Systematic Approach:** Converted in batches (5-10 files each)
3. **Testing Each Batch:** `npm run build` after each commit
4. **Documentation:** Updated routers and removed obsolete eslint-disable comments
5. **Metrics:** Tracked progress (70+ eslint-disable → 8)

**How to Apply This Pattern:**
- Identify a repetitive improvement needed
- Create a clear "before/after" example
- Work systematically through the codebase
- Validate each batch before moving forward
- Track progress with metrics
- Document the pattern for future reference

---

## 🔧 Tools and Commands

### Development
```bash
npm install              # Install dependencies
npm run dev             # Watch mode development
npm test                # Run test suite
npm run lint            # ESLint check
npm run build           # TypeScript compilation
```

### Database
```bash
npm run db:cli -- status           # Connection info
npm run db:cli -- counts           # Table counts
npm run db:cli -- query "SELECT..."  # Run query
npx prisma migrate dev --name NAME # Create migration
npx prisma migrate deploy          # Apply migrations
npx prisma studio                  # Visual DB editor
```

### Documentation
```bash
npm run docs:update-routers  # Rebuild router indexes
npm run refresh:vision       # Full metadata refresh
```

### Testing
```bash
npm test                     # All tests
npm test -- tests/battle/    # Specific directory
npm test -- --watch          # Watch mode
npm run test:pbsl            # PBSL-specific suite
```

---

## ✅ Success Criteria

You've done a good job when:

- [ ] Code builds without errors
- [ ] Tests pass (no new failures)
- [ ] ESLint has zero new warnings
- [ ] Documentation is updated
- [ ] Routers reflect structural changes
- [ ] Commit messages are clear and detailed
- [ ] Changes follow existing patterns
- [ ] Work is pushed to GitHub
- [ ] Tasklist.md is updated
- [ ] User is happy with the progress

---

## 🆘 When You're Stuck

1. **Read the routers** — Navigate from `ops/ROUTER.yaml` to find context
2. **Search for similar code** — Use grep/find to locate patterns
3. **Check git history** — `git log --oneline` to see recent changes
4. **Review documentation** — `docs/` has comprehensive guides
5. **Look at tests** — Tests show how code should be used
6. **Ask for clarification** — Better to ask than make wrong assumptions

---

## 🎉 You're Ready!

You now have:
- ✅ Understanding of project structure
- ✅ Knowledge of key patterns (output-formatter, logging, database)
- ✅ Workflows for making changes safely
- ✅ Quality checklists to follow
- ✅ Common pitfalls to avoid
- ✅ Essential reading list
- ✅ Tools and commands reference

**Next Steps:**
1. Read `.github/copilot-instructions.md` thoroughly
2. Review `Tasklist.md` for current priorities
3. Pick a task and start contributing!

**Remember:** 
- Small, tested, incremental changes
- Follow existing patterns
- Document as you go
- Quality over speed

Good luck! 🚀

---

**Document Version:** 1.0  
**Created:** 2025-12-28  
**Purpose:** Comprehensive AI collaboration guide for effective contributions
