# Codebase Overhaul Plan - Accelerate Elimination & Legacy Cleanup

**Date:** 2025-11-07  
**Objective:** Complete elimination of Prisma Accelerate residue and legacy/obsolete code from the Infinity Gauntlet codebase  
**Severity:** CRITICAL - Production is DOWN due to Accelerate client cached on Render

---

## IMMEDIATE PRODUCTION FIX (Phase 0 - URGENT)

### Root Cause Analysis
The P6001 error persists because:
1. **Render cached `node_modules` contains Prisma client generated in Accelerate mode**
2. Setting `DATABASE_URL` in `render.yaml` only affects NEW builds
3. The cached `@prisma/client` package has data-proxy/Accelerate engine compiled in
4. Even though runtime code sets `DATABASE_URL` correctly, the client LIBRARY expects Accelerate URLs

### Immediate Actions (Next 15 minutes)

#### 1. Force Render Cache Clear
**Options:**
- **Option A:** Modify `package.json` version to force cache bust
- **Option B:** Add a dummy dependency to force reinstall
- **Option C:** Manually clear cache via Render dashboard
- **Option D:** Change build command to explicitly clear cache

**Recommended:** Option D - Most reliable

```yaml
# In render.yaml, update buildCommand for ALL services:
buildCommand: "rm -rf node_modules .npm && npm install --include=dev && npm run prebuild && bash scripts/bootstrap_prod_node.sh"
```

#### 2. Verify Prisma Client Generation
Add explicit logging to build process:

```json
// package.json
"generate": "echo 'DATABASE_URL for generation:' $DATABASE_URL && prisma generate --no-engine && echo 'Client generated successfully'",
```

#### 3. Emergency Rollback Plan
If cache clear doesn't work, we need to:
1. Temporarily restore Accelerate URLs in Render environment
2. Roll back to last known working commit
3. Plan proper migration strategy

---

## COMPREHENSIVE CLEANUP (Phases 1-6)

### Phase 1: Accelerate Residue Elimination (CRITICAL)

#### 1.1 Search and Destroy - Code References
**Target:** Zero mentions of Accelerate in active code

**Files to Audit:**
- `src/shared/prisma.ts` - Client initialization logic
- `src/shared/config.ts` - Environment configuration
- `scripts/shared/database-url.ts` - URL selection logic
- `src/env/ensure-db-url.ts` - URL validation
- All test files referencing Prisma

**Actions:**
- Remove `isOptimizeCompatibleUrl()` function (line 64 in prisma.ts)
- Remove `OPTIMIZE_SCHEME` regex pattern
- Remove all `prisma://` and `prisma+postgres://` string references
- Remove data-proxy engine type logic
- Grep for: `accelerate|Accelerate|ACCELERATE|prisma://|prisma\+postgres|data-proxy|dataproxy`

#### 1.2 Environment & Configuration
**Target:** Clean environment variable model

**Files:**
- `render.yaml` - All 8 services
- `secrets/env.template`
- `secrets/prisma-dev.env.example`
- `.env` (if exists locally)

**Actions:**
- Ensure all services have explicit `DATABASE_URL` set
- Remove any Accelerate URL examples
- Add validation that URLs start with `postgresql://`
- Document 2-node cluster architecture clearly

#### 1.3 Documentation Cleanup
**Target:** Remove misleading documentation

**Files to Update:**
- `docs/database-systems.md`
- `docs/db-control-suite.md`
- `ops/DB_BOOTSTRAP.md`
- `README.md`
- Any migration guides

**Actions:**
- Remove Accelerate migration docs (move to ARCHIVE)
- Update architecture diagrams
- Clarify 2-node cluster model (DEV master + PROD local node)
- Add "Why We Don't Use Accelerate" section

---

### Phase 2: Obsolete File Purge

#### 2.1 Identify Obsolete Files
Run comprehensive search:

```bash
# Find files not modified in 90+ days
find . -type f -mtime +90 ! -path "./node_modules/*" ! -path "./.git/*"

# Find files with "deprecated", "obsolete", "legacy" in name
find . -type f \( -name "*deprecated*" -o -name "*obsolete*" -o -name "*legacy*" -o -name "*old*" -o -name "*backup*" \) ! -path "./node_modules/*"

# Find empty directories
find . -type d -empty ! -path "./node_modules/*" ! -path "./.git/*"
```

#### 2.2 Categorize for Deletion
**Candidates:**
- `secrets/migrate.env` - DELETED (obsolete Accelerate config)
- `secrets/Infinity-Gauntlet.env.new` - DELETED (duplicate)
- `secrets/Infinity-Gauntlet.env.backup*` - DELETED (backups)
- `docs/ARCHIVE/db-accelerate-workflow.md` - ARCHIVE (historical)
- Any `*.backup`, `*.old`, `*.deprecated` files

#### 2.3 Archive vs Delete Decision Matrix
**Archive** (move to `docs/ARCHIVE/` or `ops/ARCHIVE/`):
- Documentation explaining past decisions
- Migration guides for historical context
- Performance benchmarks

**Delete** (remove entirely):
- Backup files (`.backup`, `.bak`)
- Temporary files (`.tmp`, `.temp`)
- Duplicate configurations
- Empty placeholder files

---

### Phase 3: Dead Code Elimination

#### 3.1 Unused Exports
Run analysis:

```bash
# Find exports that are never imported
npx ts-prune --project tsconfig.json

# Check for unused dependencies
npx depcheck
```

#### 3.2 Commented Code Cleanup
**Policy:** Remove commented code blocks older than 30 days

**Exceptions:**
- TODO comments with Tasklist references
- Copyright/license headers
- Explanatory comments for complex logic

**Search Pattern:**
```bash
# Find large commented blocks
grep -rn "^[[:space:]]*//.*" src/ | wc -l
grep -rn "^[[:space:]]*/\*" src/ | wc -l
```

#### 3.3 Deprecated Functions
**Audit List:**
- `isAccelerateUrl()` in `scripts/shared/database-url.ts` - Mark for removal
- `isOptimizeCompatibleUrl()` in `src/shared/prisma.ts` - Remove
- Any functions with `@deprecated` JSDoc tags

---

### Phase 4: Test Coverage Audit

#### 4.1 Identify Missing Tests
**Current:** 294/294 passing (100% pass rate)

**Gaps:**
- Accelerate removal validation tests
- Database URL selection edge cases
- 2-node cluster failover scenarios
- Build process validation

#### 4.2 Remove Obsolete Tests
**Candidates:**
- Tests for Accelerate URL detection
- Tests for data-proxy engine logic
- Tests for removed features

#### 4.3 Update Test Fixtures
**Action Items:**
- Remove Accelerate URL examples from test fixtures
- Update mock environment variables
- Ensure all tests use direct PostgreSQL URLs

---

### Phase 5: Build & Deployment Hardening

#### 5.1 Build Process Validation
**Add Pre-Build Checks:**

```json
// package.json
"scripts": {
  "prebuild": "npm run validate:urls && npm run generate && npm run build:ts",
  "validate:urls": "node scripts/validate_database_urls.js"
}
```

**New Script:** `scripts/validate_database_urls.js`
```javascript
// Fail build if Accelerate URLs detected in environment
const env = process.env;
const acceleratePattern = /prisma(\+|:\/\/)/i;

for (const [key, value] of Object.entries(env)) {
  if (key.includes('DATABASE') && value && acceleratePattern.test(value)) {
    console.error(`ERROR: Accelerate URL detected in ${key}`);
    console.error(`Value: ${value}`);
    process.exit(1);
  }
}
console.log('✓ All database URLs validated (direct PostgreSQL)');
```

#### 5.2 Render Build Optimization
**Current Issues:**
- Build takes 15+ seconds
- Cache invalidation unclear
- No build artifact verification

**Improvements:**
- Add build timestamp to output
- Verify Prisma client engine type
- Add post-build smoke test

#### 5.3 Deployment Rollback Safety
**Add Rollback Script:**

```bash
# scripts/rollback_render.sh
#!/bin/bash
# Quick rollback to last successful deployment
# Usage: ./scripts/rollback_render.sh <service-name>
```

---

### Phase 6: Documentation & Knowledge Transfer

#### 6.1 Update Architecture Docs
**Files to Update:**
- `docs/architecture.md` - Add 2-node cluster section
- `docs/database-systems.md` - Remove Accelerate references
- `OPERATIONS.md` - Update database operations
- `README.md` - Update getting started guide

#### 6.2 Create Migration Postmortem
**New Doc:** `docs/ACCELERATE-REMOVAL-POSTMORTEM.md`

**Contents:**
- Why we moved away from Accelerate
- What went wrong during removal
- Lessons learned
- How to avoid similar issues

#### 6.3 Runbook Updates
**Files:**
- `ops/DB_BOOTSTRAP.md` - Clarify bootstrap process
- `playbooks/escalate.md` - Add P6001 error recovery
- `playbooks/db-recovery.md` - Update for 2-node cluster

---

## Execution Timeline

### Week 1: Emergency Fix & Critical Cleanup
**Days 1-2:** Phase 0 (Production Fix)
- Clear Render cache
- Force rebuild with correct client
- Validate production stability

**Days 3-5:** Phase 1 (Accelerate Residue)
- Code cleanup
- Environment standardization
- Test validation

### Week 2: Deep Cleanup
**Days 6-8:** Phase 2 & 3 (Files & Dead Code)
- Obsolete file purge
- Dead code elimination
- Archive organization

**Days 9-10:** Phase 4 (Tests)
- Test coverage audit
- Remove obsolete tests
- Add missing coverage

### Week 3: Hardening & Documentation
**Days 11-13:** Phase 5 (Build & Deployment)
- Build validation
- Deployment hardening
- Rollback procedures

**Days 14-15:** Phase 6 (Documentation)
- Architecture updates
- Postmortem creation
- Knowledge transfer

---

## Success Criteria

### Phase 0 (URGENT)
- [ ] Production deployment succeeds without P6001 errors
- [ ] All Render services online
- [ ] Database connections stable (<50ms latency)

### Phase 1-6 (Comprehensive)
- [ ] Zero `grep -r "accelerate" src/` matches (except comments)
- [ ] Zero `grep -r "prisma://" .` matches (code + configs)
- [ ] All tests passing (294+)
- [ ] Build time < 20 seconds
- [ ] No obsolete files in repository
- [ ] 100% documentation accuracy
- [ ] Rollback procedure tested and validated

---

## Risk Mitigation

### High-Risk Changes
1. **Prisma Client Regeneration** - Test locally first
2. **Render Cache Clear** - May cause extended downtime
3. **File Deletion** - Backup to ARCHIVE first

### Rollback Triggers
- Production downtime > 5 minutes
- Database connection failures
- Build failures after 3 attempts

### Monitoring During Execution
- [ ] Render deployment logs
- [ ] Database connection metrics
- [ ] Error tracking (Sentry/logs)
- [ ] Performance metrics (latency, memory)

---

## Post-Cleanup Validation

### Automated Checks
```bash
# Run full validation suite
npm run validate:codebase

# Check for Accelerate residue
./scripts/guard_accelerate.sh

# Verify build reproducibility
npm run clean && npm run build && npm test
```

### Manual Verification
- [ ] Review git diff for unintended changes
- [ ] Spot-check critical files
- [ ] Verify production deployment logs
- [ ] Test core user flows (battle, encounter, party management)

---

## Appendix A: Search Patterns

### Accelerate Detection
```bash
# Code references
grep -rn "accelerate" --include="*.ts" --include="*.js" src/

# URL patterns
grep -rn "prisma://" .
grep -rn "prisma\+postgres://" .

# Environment variables
grep -rn "PRISMA_CLIENT_ENGINE_TYPE" .
grep -rn "ACCELERATE" .
```

### Obsolete File Detection
```bash
# Backup files
find . -name "*.backup" -o -name "*.bak" -o -name "*.old"

# Empty files
find . -type f -empty

# Large files (>10MB) not in git
find . -type f -size +10M ! -path "./.git/*" ! -path "./node_modules/*"
```

---

## Appendix B: Critical Files Checklist

### Must Review Before Any Change
- [ ] `prisma/schema.prisma`
- [ ] `src/shared/prisma.ts`
- [ ] `src/shared/config.ts`
- [ ] `render.yaml`
- [ ] `package.json`

### Must Backup Before Deletion
- [ ] `secrets/` directory
- [ ] `docs/` files
- [ ] `ops/` configuration

### Never Touch
- [ ] `.git/` directory
- [ ] `node_modules/` (managed by npm)
- [ ] `dist/` (build output)

---

**Next Steps:** Execute Phase 0 immediately to restore production, then proceed with comprehensive cleanup phases.

**Owner:** Development Team  
**Reviewer:** Required before each phase execution  
**Last Updated:** 2025-11-07
