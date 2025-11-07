# Environment Variable Standardization - Grep Report
**Generated**: 2025-01-XX
**Purpose**: Document all remaining references to old environment variable schema for systematic batch update

## Executive Summary

**Total Matches**: 173 references across ~40 files
**Old Variables**: DATABASE_POOL_URL, DATABASE_DIRECT_URL, DATABASE_EXTERNAL_URL, DEV_DATABASE_DIRECT_URL, PROD_DATABASE_DIRECT_URL

**New Variable Mapping**:
- `DATABASE_POOL_URL` → `DATABASE_URL` (Accelerate consolidated)
- `DATABASE_DIRECT_URL` → `RENDER_DB_INTERNAL_URL` (Render services) or `RENDER_DB_EXTERNAL_URL` (laptop)
- `DATABASE_EXTERNAL_URL` → `RENDER_DB_EXTERNAL_URL` (renamed for clarity)
- `DEV_DATABASE_DIRECT_URL` → `DEV_RENDER_DB_INTERNAL_URL` or `DEV_RENDER_DB_EXTERNAL_URL`
- `PROD_DATABASE_DIRECT_URL` → `PROD_RENDER_DB_INTERNAL_URL` or `PROD_RENDER_DB_EXTERNAL_URL`

## Priority Categorization

### CRITICAL (Must Fix Before Deployment) - 7 files

1. **scripts/db_admin.ts** (6 references)
   - Line 127: `const directUrl = process.env.DATABASE_DIRECT_URL ?? "";`
   - Line 151: Error message references DATABASE_DIRECT_URL
   - Line 208: `const directUrl = process.env.DATABASE_DIRECT_URL ?? "";`
   - Line 209: `const poolUrl = process.env.DATABASE_POOL_URL ?? "";`
   - Line 228: Status display for DATABASE_DIRECT_URL
   - Line 229: Status display for DATABASE_POOL_URL
   - **Impact**: DB CLI tool (`npm run db:cli`) will read wrong variables
   - **Fix**: Update to RENDER_DB_INTERNAL_URL, RENDER_DB_EXTERNAL_URL, DATABASE_URL

2. **scripts/db_mirror_checks.ts** (5 references)
   - Line 120: `looksLikeProxy(envVars.DATABASE_POOL_URL) ? envVars.DATABASE_POOL_URL : undefined,` (2x)
   - Line 124: `envVars.DATABASE_DIRECT_URL,`
   - Line 127: `looksLikeDirect(envVars.DATABASE_POOL_URL) ? envVars.DATABASE_POOL_URL : undefined,` (2x)
   - Line 131: `envVars.DATABASE_POOL_URL,`
   - **Impact**: Mirror verification will check wrong variables
   - **Fix**: Update to new schema, likely RENDER_DB_INTERNAL_URL/RENDER_DB_EXTERNAL_URL priority

3. **scripts/check_db_redundancy.ts** (1 reference)
   - Line 245: `standbyOverride ?? process.env.STANDBY_DATABASE_URL ?? process.env.DATABASE_DIRECT_URL`
   - **Impact**: Standby database fallback broken
   - **Fix**: Change to RENDER_DB_EXTERNAL_URL || RENDER_DB_INTERNAL_URL

4. **scripts/db_bootstrap_backfill.ts** (3 references)
   - Line 77: `process.env.DATABASE_DIRECT_URL ?? ""`
   - Line 80: `process.env.DATABASE_POOL_URL ?? ""`
   - Line 89: Error message "DATABASE_DIRECT_URL (or a postgres:// DATABASE_URL) must be set"
   - **Impact**: Backfill script won't find database URLs
   - **Fix**: Update to new schema with fallback chain

5. **scripts/ops/dex_v2_backup.ts** (2 references)
   - Line 83: `const directUrl = process.env.DATABASE_DIRECT_URL;`
   - Line 86: Error message "DATABASE_DIRECT_URL is required"
   - **Impact**: Dex v2 backup operations broken
   - **Fix**: Change to RENDER_DB_EXTERNAL_URL || RENDER_DB_INTERNAL_URL

6. **scripts/ops/bootstrap_local_fallback.ts** (2 references)
   - Line 352: `const explicit = process.env.DATABASE_DIRECT_URL?.trim();`
   - Line 363: Error message references DATABASE_DIRECT_URL
   - **Impact**: Local fallback bootstrap won't detect source URL
   - **Fix**: Update to RENDER_DB_EXTERNAL_URL || RENDER_DB_INTERNAL_URL

7. **scripts/ops/run_dex_migrations.ps1** (8 references)
   - Line 3: Parameter default `$RenderUrl = $Env:DATABASE_DIRECT_URL`
   - Line 75: `$accelerateDirect = $accelerateVars['DATABASE_DIRECT_URL']`
   - Line 76: `Assert-DirectUrl -url $accelerateDirect -name 'DATABASE_DIRECT_URL (Accelerate)'`
   - Line 79: Error message "DATABASE_DIRECT_URL must be set"
   - Line 82: `Assert-DirectUrl -url $RenderUrl -name 'DATABASE_DIRECT_URL (Render)'`
   - Line 85: `DATABASE_URL = $accelerateDirect; DATABASE_DIRECT_URL = $accelerateDirect;`
   - Line 98: `DATABASE_URL = $RenderUrl; DATABASE_DIRECT_URL = $RenderUrl;`
   - **Impact**: Dex migration PowerShell script broken
   - **Fix**: Change to RENDER_DB_EXTERNAL_URL || RENDER_DB_INTERNAL_URL

### HIGH (Breaks Tests) - 2 files

1. **tests/db-replication/cli.test.ts** (4 references)
   - Line 256: Test name "should check for DATABASE_DIRECT_URL"
   - Line 257: `const directUrl = process.env.DATABASE_DIRECT_URL;`
   - Line 263: Test name "should check for DATABASE_POOL_URL"
   - Line 264: `const poolUrl = process.env.DATABASE_POOL_URL;`
   - **Impact**: Replication CLI tests will fail
   - **Fix**: Update test expectations to new variable names

2. **tests/db-replication/end-to-end.test.ts** (1 reference)
   - Line 214: Comment "Verify DATABASE_DIRECT_URL used (not Accelerate)"
   - **Impact**: Comment misleading
   - **Fix**: Update comment to reference new variables

### MEDIUM (Documentation - User-Facing) - 12 files

1. **README.md** (6 references)
   - Line 61: "should set `DATABASE_POOL_URL` (connection string through the pooler) and `DATABASE_DIRECT_URL`" (2x)
   - Line 79: "DATABASE_POOL_URL (Prisma Accelerate), DATABASE_EXTERNAL_URL (Accelerate)" (2x)
   - Line 152: "`DATABASE_POOL_URL` (Render connectionString) and `DATABASE_DIRECT_URL` (Render directConnectionString)" (2x)
   - Line 153: "automatically populated from `DATABASE_POOL_URL`"
   - **Impact**: Primary user documentation incorrect
   - **Fix**: Critical user-facing doc - update all references

2. **docs/database-configuration.md** (22 references)
   - Multiple sections documenting old schema
   - **Impact**: Comprehensive database config guide outdated
   - **Fix**: Full documentation rewrite needed

3. **docs/DATABASE-CONFIG-REFERENCE.md** (15 references)
   - Configuration reference table and examples
   - **Impact**: Reference documentation incorrect
   - **Fix**: Update all examples and tables

4. **docs/database-systems.md** (11 references)
   - Architecture documentation
   - **Impact**: System architecture docs outdated
   - **Fix**: Update architecture diagrams and descriptions

5. **docs/ai-env-setup.md** (8 references)
   - AI environment setup guide
   - **Impact**: Agent onboarding incorrect
   - **Fix**: Update all setup instructions

6. **src/env/ROUTER.md** (2 references)
   - Line 11: Router documentation for ensure-db-url.ts
   - **Impact**: Router metadata outdated
   - **Fix**: Update router descriptions

7. **OPERATIONS.md** (4 references)
   - Operations guide for services
   - **Impact**: Operational runbook incorrect
   - **Fix**: Update service environment requirements

8. **masterroutetable.md** (2 references)
   - Line 254: Documentation of prisma.ts database connections
   - **Impact**: Master routing metadata outdated
   - **Fix**: Update connection descriptions

9. **docs/db-replication-architecture.md** (2 references)
   - Line 39: DEV connection diagram
   - Line 80: PROD connection diagram
   - **Impact**: Architecture diagrams incorrect
   - **Fix**: Update connection strings in diagrams

10. **docs/db-replication-runbook.md** (2 references)
    - Line 395-396: Environment variable list
    - **Impact**: Runbook environment section outdated
    - **Fix**: Update variable names

11. **docs/db-accelerate-workflow.md** (1 reference)
    - Line 61: IG_ENV_FILE requirements
    - **Impact**: Workflow documentation incorrect
    - **Fix**: Update environment variable references

12. **docs/db-control-suite.md** (1 reference)
    - Line 10: DATABASE_DIRECT_URL requirements
    - **Impact**: Control suite documentation outdated
    - **Fix**: Update to new variable names

### MEDIUM (Operational Runbooks) - 6 files

1. **ops/DB_BOOTSTRAP.md** (8 references)
   - Lines 32-38: Environment variable examples
   - Lines 59, 64, 96, 226: Instructions and troubleshooting
   - **Impact**: Primary database bootstrap runbook incorrect
   - **Fix**: Critical for database operations - update comprehensively

2. **ops/DB_BOOTSTRAP-Sensai.md** (4 references)
   - Backup copy of bootstrap runbook
   - **Impact**: Backup documentation outdated
   - **Fix**: Update to match main runbook

3. **ops/DB_IMPORT_PRISMA_POSTGRES.md** (1 reference)
   - Line 135: Import runbook
   - **Impact**: Import instructions incorrect
   - **Fix**: Update connection string references

4. **ops/ARCHIVE/db-bootstrap/2025-11-05-backup-dr-evidence.md** (1 reference)
   - Line 7: Historical evidence document
   - **Impact**: Low - archived documentation
   - **Fix**: Optional - could update for historical accuracy

5. **docs/northstar-phase1-completion.md** (2 references)
   - Lines 81-82: Phase 1 completion documentation
   - **Impact**: Historical milestone documentation
   - **Fix**: Optional - consider updating for accuracy

6. **console.sql** (1 reference)
   - Line 12: SQL console setup instructions
   - **Impact**: Developer SQL console setup broken
   - **Fix**: Update to RENDER_DB_EXTERNAL_URL

### LOW (Examples & Templates) - 8 files

1. **secrets/migrate.env** (4 references)
   - Line 2: Comment about direct database URL
   - Line 9: DATABASE_DIRECT_URL assignment
   - Line 10: DATABASE_EXTERNAL_URL assignment
   - Line 12: DATABASE_POOL_URL assignment
   - **Impact**: Migration environment template incorrect
   - **Fix**: Update to show new schema

2. **secrets/prisma-dev.env.example** (7 references)
   - Lines 6-7: Comments explaining variables
   - Lines 21-22: Example values
   - Lines 30-31: Commented local examples
   - **Impact**: Development environment template incorrect
   - **Fix**: Update all examples to new schema

3. **secrets/prisma-accelerate.env.example** (1 reference)
   - Line 6: DATABASE_DIRECT_URL example
   - **Impact**: Accelerate template incorrect
   - **Fix**: Update to RENDER_DB_INTERNAL_URL

4. **secrets/README.md** (2 references)
   - Line 9: DATABASE_POOL_URL description
   - Line 10: DATABASE_EXTERNAL_URL description
   - **Impact**: Secrets documentation outdated
   - **Fix**: Update variable descriptions

5. **.env.example** (5 references)
   - Lines 7-8: Comments
   - Lines 16, 20-21: Example values and comments
   - **Impact**: Primary .env template incorrect
   - **Fix**: Update to show new schema for new developers

6. **prisma/schema-Sensai.prisma** (1 reference)
   - Line 9: directUrl configuration
   - **Impact**: Backup schema file outdated
   - **Fix**: Update to RENDER_DB_INTERNAL_URL

7. **prisma/schema-northstar.prisma** (1 reference)
   - Line 12: directUrl configuration
   - **Impact**: Northstar schema outdated
   - **Fix**: Update to RENDER_DB_INTERNAL_URL

8. **docs/WORKSTATION-GAMEPLAY-SETUP.md** (2 references)
   - Lines 70-71: Example environment configuration
   - **Impact**: Workstation setup guide incorrect
   - **Fix**: Update examples to new schema

### LOWEST (Historical Context) - 4 files

1. **tasklist.md** (4 references)
   - Line 1093: Historical task context
   - Lines 1339-1340: Historical troubleshooting notes
   - Line 1643: Test coverage description (2x)
   - **Impact**: Historical task tracking
   - **Fix**: Optional - could add notes about schema change

2. **Tasklist-Sensai.md** (1 reference)
   - Line 1080: Historical task context
   - **Impact**: Backup tasklist
   - **Fix**: Optional

3. **Prompt.md** (5 references)
   - Line 164: Historical implementation notes (2x)
   - Line 169: Test coverage description (2x)
   - Line 258: Database architecture description (2x)
   - Line 286: Migration guidance
   - **Impact**: Operational prompt context
   - **Fix**: Update for current accuracy

4. **Prompt-Sensai.md** (1 reference)
   - Line 54: Migration guidance
   - **Impact**: Backup prompt
   - **Fix**: Optional

## File Count by Priority

- **CRITICAL**: 7 files (22 references) - Scripts that will break in production
- **HIGH**: 2 files (5 references) - Tests that will fail
- **MEDIUM (Docs)**: 12 files (72 references) - User-facing documentation
- **MEDIUM (Ops)**: 6 files (16 references) - Operational runbooks
- **LOW**: 8 files (22 references) - Templates and examples
- **LOWEST**: 4 files (11 references) - Historical context

**Total**: 39 files, 173 references

## Recommended Update Strategy

### Phase 1: CRITICAL Scripts (Immediate - Blocks Production)
1. scripts/db_admin.ts
2. scripts/db_mirror_checks.ts
3. scripts/check_db_redundancy.ts
4. scripts/db_bootstrap_backfill.ts
5. scripts/ops/dex_v2_backup.ts
6. scripts/ops/bootstrap_local_fallback.ts
7. scripts/ops/run_dex_migrations.ps1

**Action**: Create single commit with all 7 critical scripts
**Validation**: Run `npm run db:cli -- status` and mirror verification after update

### Phase 2: HIGH Test Files (Prevents CI Failure)
1. tests/db-replication/cli.test.ts
2. tests/db-replication/end-to-end.test.ts

**Action**: Create single commit for test updates
**Validation**: Run `npm test tests/db-replication/` to verify

### Phase 3: MEDIUM User Documentation (User-Facing)
1. README.md (PRIMARY)
2. docs/database-configuration.md
3. docs/DATABASE-CONFIG-REFERENCE.md
4. docs/database-systems.md
5. docs/ai-env-setup.md
6. src/env/ROUTER.md
7. OPERATIONS.md
8. masterroutetable.md
9. docs/db-replication-architecture.md
10. docs/db-replication-runbook.md
11. docs/db-accelerate-workflow.md
12. docs/db-control-suite.md

**Action**: Create single comprehensive documentation commit
**Validation**: Review README.md rendering, check all cross-references

### Phase 4: MEDIUM Operational Runbooks
1. ops/DB_BOOTSTRAP.md (CRITICAL for ops)
2. ops/DB_BOOTSTRAP-Sensai.md
3. ops/DB_IMPORT_PRISMA_POSTGRES.md
4. console.sql
5. docs/northstar-phase1-completion.md
6. ops/ARCHIVE/db-bootstrap/2025-11-05-backup-dr-evidence.md

**Action**: Create single runbook update commit
**Validation**: Test bootstrap runbook against staging

### Phase 5: LOW Templates & Examples
1. secrets/migrate.env
2. secrets/prisma-dev.env.example
3. secrets/prisma-accelerate.env.example
4. secrets/README.md
5. .env.example
6. prisma/schema-Sensai.prisma
7. prisma/schema-northstar.prisma
8. docs/WORKSTATION-GAMEPLAY-SETUP.md

**Action**: Create single templates commit
**Validation**: Verify .env.example is valid for new developers

### Phase 6: LOWEST Historical Context (Optional)
1. tasklist.md
2. Tasklist-Sensai.md
3. Prompt.md
4. Prompt-Sensai.md

**Action**: Add migration notes or update for accuracy
**Validation**: Ensure Prompt.md reflects current schema

## Migration Validation Checklist

After completing all phases:

- [ ] **Scripts**: Run `npm run db:cli -- status` successfully
- [ ] **Tests**: Run `npm test` with 100% pass rate
- [ ] **Documentation**: README.md renders correctly on GitHub
- [ ] **Runbooks**: Bootstrap runbook works for staging deployment
- [ ] **Templates**: New developer can use .env.example to get started
- [ ] **Grep Verification**: Re-run grep search to confirm zero old variable references:
  ```powershell
  # Should return ZERO matches (only historical context in tasklists/prompts acceptable)
  grep -r "DATABASE_POOL_URL\|DATABASE_DIRECT_URL\|DATABASE_EXTERNAL_URL" --exclude-dir=node_modules --exclude-dir=.git
  ```

## Estimated Timeline

- **Phase 1 (CRITICAL)**: 30-45 minutes (7 scripts, careful testing)
- **Phase 2 (HIGH)**: 15 minutes (2 test files)
- **Phase 3 (MEDIUM Docs)**: 60-90 minutes (12 documentation files, comprehensive)
- **Phase 4 (MEDIUM Ops)**: 30 minutes (6 runbook files)
- **Phase 5 (LOW)**: 20 minutes (8 template files)
- **Phase 6 (LOWEST)**: 15 minutes (4 historical files, optional)

**Total Estimated Time**: 2.5-3.5 hours for complete migration

## Notes

- **Backup strategy**: All changes are in git, can revert per-phase if issues arise
- **Testing between phases**: Validate critical paths after Phase 1 and Phase 2 before continuing
- **Documentation priority**: README.md is highest priority in Phase 3 (most visible to users)
- **Historical files**: Can skip Phase 6 if time-constrained; historical context doesn't affect runtime

---

**Report Status**: COMPLETE
**Next Action**: Begin Phase 1 (CRITICAL Scripts) after user approval
