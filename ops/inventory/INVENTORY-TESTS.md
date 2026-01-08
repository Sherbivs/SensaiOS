# Tests Inventory

**Created:** 2026-01-06T14:00:00Z  
**Purpose:** Complete inventory of all test files in `tests/`  
**Status:** ✅ COMPLETE — 134 files inventoried  
**Cross-Reference:** [INVENTORY-INDEX.md](INVENTORY-INDEX.md)

---

## 📊 Summary

| Category | Files | Coverage Target |
|----------|-------|-----------------|
| SensaiOS Security | 14 | `src/sensaios/` |
| SensaiOS Security Attacks | 5 | Security boundaries |
| Security Services | 27 | `src/services/` security |
| Security Core | 4 | Archive/permission tests |
| PBSL Engine | 5 | `src/core/pbsl/` |
| PBSL Fixtures | 3 | Test fixtures |
| Battle System | 6 | `src/bot/battle/`, `src/core/battle/` |
| Homestead | 3 | `src/bot/homestead/` |
| Services | 5 | `src/services/` |
| Shared Utilities | 7 | Test helpers |
| Workers | 4 | Worker documentation |
| State Management | 3 | `src/bot/state/` |
| Observability | 1 | `src/observability/` |
| Kernel | 1 | `src/kernel/` |
| Reporting | 3 | Startup/database reporting |
| Core | 1 | `src/core/` |
| Integration | 3 | E2E tests |
| Monitoring | 1 | `src/services/monitoring/` |
| Root Tests | 26 | Misc specs |
| **TOTAL** | **134** | — |

---

## SensaiOS Tests (`tests/sensaios/`) — 14 files

**Code Coverage:** `src/sensaios/`

| File | Tag | Description |
|------|-----|-------------|
| `boot-logger.spec.ts` | #core | Boot logger tests |
| `canonical-error.spec.ts` | #core | Canonical error tests |
| `capabilities.spec.ts` | #security | Capability system tests |
| `component-context.spec.ts` | #core | ComponentContext tests |
| `component-registry.spec.ts` | #core | Component registry tests |
| `context-factory.spec.ts` | #core | Context factory tests |
| `dispatchers.spec.ts` | #core | Dispatcher tests |
| `error-routing.spec.ts` | #core | Error routing tests |
| `error-tracker.spec.ts` | #obs | Error tracker tests |
| `export-envelope.spec.ts` | #core | Export envelope tests |
| `kernel-boot.spec.ts` | #core | Kernel boot tests |
| `ring-security.spec.ts` | #security | Ring security model tests |
| `run-guarded.spec.ts` | #core | runGuarded() tests |
| `tenant-scope.spec.ts` | #core | TenantScope tests |

### SensaiOS GameServer (`tests/sensaios/gameserver/`) — 1 file

| File | Tag | Description |
|------|-----|-------------|
| `client.test.ts` | #api | GameServer client tests |

### SensaiOS Loader (`tests/sensaios/loader/`) — 1 file

| File | Tag | Description |
|------|-----|-------------|
| `module-hook.spec.ts` | #security | Module hook tests |

### SensaiOS Security Attacks (`tests/sensaios/security/`) — 5 files

| File | Tag | Description |
|------|-----|-------------|
| `boundary-tests.spec.ts` | #security | Ring boundary violation tests |
| `capability-denial.spec.ts` | #security | Capability denial tests |
| `installation-attack.spec.ts` | #security | Installation attack tests |
| `secure-import.test.ts` | #security | Secure import tests |
| `visibility-violation.spec.ts` | #security | Visibility violation tests |

---

## Security Services Tests (`tests/security/`) — 31 files

**Code Coverage:** Security services and utilities

### Root Security (4 files)

| File | Tag | Description |
|------|-----|-------------|
| `archive-integrity.spec.js` | #security | Archive integrity tests |
| `archive-intelligence.spec.js` | #security | Archive intelligence tests |
| `dos-protection.spec.js` | #security | DoS protection tests |
| `strict-permission-enforcement.spec.js` | #security | Permission enforcement tests |

### Security Errors (`tests/security/errors/`) — 1 file

| File | Tag | Description |
|------|-----|-------------|
| `security-errors.test.ts` | #security | Security error handling tests |

### Security Services (`tests/security/services/`) — 27 files

| File | Tag | Description |
|------|-----|-------------|
| `baseline-service.test.ts` | #security | Baseline service tests |
| `checksum-service.test.ts` | #security | Checksum validation tests |
| `column-encryption-service.test.ts` | #security | Column encryption tests |
| `continuous-aggregates-service.test.ts` | #db | TimescaleDB aggregates tests |
| `cross-reference-validation-service.test.ts` | #security | Cross-reference validation |
| `di-container.test.ts` | #core | Dependency injection tests |
| `e2e-commands.test.ts` | #cli | E2E command tests |
| `executable-docs.test.ts` | #doc | Executable documentation tests |
| `immutable-audit-service.test.ts` | #security | Audit immutability tests |
| `input-sanitization-service.test.ts` | #security | Input sanitization tests |
| `integrity-sweep-scheduler.test.ts` | #security | Integrity sweep scheduler |
| `key-rotation-service.test.ts` | #security | Key rotation tests |
| `migration-automation-service.test.ts` | #db | Migration automation tests |
| `pagerduty-service.test.ts` | #ops | PagerDuty integration tests |
| `prometheus-metrics-service.test.ts` | #obs | Prometheus metrics tests |
| `property-based.test.ts` | #test | Property-based tests |
| `retention-policy-service.test.ts` | #db | Data retention tests |
| `role-audit-service.test.ts` | #security | Role audit tests |
| `row-level-security-service.test.ts` | #security | RLS tests |
| `security-event-bus.test.ts` | #security | Security event bus tests |
| `security-event-service.test.ts` | #security | Security event service |
| `security-logger.test.ts` | #security | Security logger tests |
| `security-testing.test.ts` | #test | Security testing utilities |
| `snapshot-tests.test.ts` | #test | Snapshot comparison tests |
| `test-isolation-service.test.ts` | #test | Test isolation tests |
| `threat-detection-service.test.ts` | #security | Threat detection tests |
| `ROUTER.md` | #doc | Module documentation |

---

## PBSL Tests (`tests/pbsl/`) — 5 files

**Code Coverage:** `src/core/pbsl/`

| File | Tag | Description |
|------|-----|-------------|
| `engine.spec.ts` | #core | PBSL battle engine tests |
| `oracle.spec.ts` | #core | PBSL oracle tests |
| `provenance.spec.ts` | #core | Provenance record tests |
| `rng.spec.ts` | #core | Deterministic RNG tests |
| `ROUTER.md` | #doc | Module documentation |

### PBSL Fixtures (`tests/pbsl/fixtures/`) — 3 files

| File | Tag | Description |
|------|-----|-------------|
| `basic-turn.json` | #fixture | Basic turn fixture |
| `README.md` | #doc | Fixtures documentation |
| `ROUTER.md` | #doc | Module documentation |

### PBSL Reports (`tests/pbsl/reports/`) — 1 file

| File | Tag | Description |
|------|-----|-------------|
| `pbsl-oracle-report-2025-12-01.json` | #report | Oracle test report |

---

## Battle Tests (`tests/battle/`) — 2 files

**Code Coverage:** `src/bot/battle/`, `src/core/battle/`

| File | Tag | Description |
|------|-----|-------------|
| `actions.interaction.spec.ts` | #ui | Battle action interaction tests |
| `ROUTER.md` | #doc | Module documentation |

---

## Services Tests (`tests/services/`) — 5 files

**Code Coverage:** `src/services/`

| File | Tag | Description |
|------|-----|-------------|
| `cache.facade.spec.ts` | #core | Cache facade tests |
| `cache.recipes.spec.ts` | #core | Cache recipes tests |
| `prometheus-metrics.spec.js` | #obs | Prometheus metrics tests |
| `role-assignment.spec.js` | #security | Role assignment tests |
| `ROUTER.md` | #doc | Module documentation |

### Error Brain (`tests/services/error-brain/`) — 1 file

| File | Tag | Description |
|------|-----|-------------|
| `db-verify.spec.ts` | #db | Error brain DB verification |

---

## Shared Test Utilities (`tests/shared/`) — 7 files

**Purpose:** Reusable test helpers and mocks

| File | Tag | Description |
|------|-----|-------------|
| `assertions.ts` | #test | Custom assertions |
| `error-tracker-mocks.ts` | #test | ErrorTracker mocks |
| `fixtures.ts` | #test | Test fixtures |
| `index.ts` | #test | Barrel exports |
| `pool-mocks.ts` | #test | Connection pool mocks |
| `prisma-mocks.ts` | #test | Prisma client mocks |
| `ROUTER.md` | #doc | Module documentation |

---

## State Tests (`tests/state/`) — 3 files

**Code Coverage:** `src/bot/state/`

| File | Tag | Description |
|------|-----|-------------|
| `context.spec.ts` | #core | State context tests |
| `persistence.spec.ts` | #db | State persistence tests |
| `stats.spec.ts` | #obs | State statistics tests |

---

## Workers Tests (`tests/workers/`) — 4 files

**Purpose:** Worker test documentation

| File | Tag | Description |
|------|-----|-------------|
| `TEST-RESULTS-FINAL.md` | #doc | Final test results |
| `TEST-RESULTS-UPDATED.md` | #doc | Updated results |
| `TEST-RESULTS.md` | #doc | Base test results |
| `TEST-SESSION-COMPLETE.md` | #doc | Session completion |

---

## Reporting Tests (`tests/reporting/`) — 3 files

| File | Tag | Description |
|------|-----|-------------|
| `database.test.ts` | #db | Database reporting tests |
| `startup.test.ts` | #core | Startup reporting tests |
| `summary.test.ts` | #core | Summary generation tests |

---

## Integration Tests (`tests/integration/`) — 3 files

| File | Tag | Description |
|------|-----|-------------|
| `prometheus-e2e.spec.js` | #obs | Prometheus E2E tests |
| `prometheus.yml` | #config | Prometheus config for tests |
| `SETUP-GUIDE.md` | #doc | Integration test setup |

---

## Monitoring Tests (`tests/monitoring/`) — 1 file

| File | Tag | Description |
|------|-----|-------------|
| `resilient-write-buffer.spec.ts` | #db | Resilient write buffer tests |

---

## Observability Tests (`tests/observability/`) — 1 file

| File | Tag | Description |
|------|-----|-------------|
| `envelope.spec.ts` | #obs | Envelope system tests |

---

## Kernel Tests (`tests/kernel/`) — 1 file

| File | Tag | Description |
|------|-----|-------------|
| `kernel-test-utils.spec.ts` | #core | Kernel test utilities |

---

## Core Tests (`tests/core/`) — 1 file

| File | Tag | Description |
|------|-----|-------------|
| `starter-validation.spec.ts` | #core | Starter validation tests |

---

## Utils Tests (`tests/utils/`) — 1 file

| File | Tag | Description |
|------|-----|-------------|
| `output-formatter.test.ts` | #ui | Output formatter tests |

---

## Root Tests (`tests/`) — 26 files

| File | Tag | Description |
|------|-----|-------------|
| `battle_engine.spec.ts` | #core | Battle engine tests |
| `battle_flow.spec.ts` | #core | Battle flow tests |
| `battle_results.spec.ts` | #core | Battle results tests |
| `battle_ui.spec.ts` | #ui | Battle UI tests |
| `catch.spec.ts` | #core | Catch mechanics tests |
| `config.database.spec.ts` | #config | Database config tests |
| `daily.spec.ts` | #core | Daily system tests |
| `data_pipeline.spec.ts` | #core | Data pipeline tests |
| `data_schema.spec.ts` | #core | Data schema tests |
| `db.smoke.spec.ts` | #db | Database smoke tests |
| `dexpack.fast.spec.ts` | #core | Fast dexpack tests |
| `dexpack.microbench.ts` | #perf | Dexpack microbenchmarks |
| `dexpack.parity.spec.ts` | #core | Dexpack parity tests |
| `dexpack.v2.spec.ts` | #core | Dexpack v2 tests |
| `dm_home_views.spec.ts` | #ui | DM home views tests |
| `dm_home.spec.ts` | #core | DM home tests |
| `dripalert-bus-phase*.test.ts` | #core | DripAlert bus tests (3 files) |
| `encounter_walk.spec.ts` | #core | Encounter walk tests |
| `error-learning.test.ts` | #obs | Error learning tests |
| `error-tracker-bus-integration.test.ts` | #obs | Error tracker bus tests |
| `error-tracker.test.ts` | #obs | Error tracker tests |
| `event-bus.test.ts` | #core | Event bus tests |
| `homestead-security.spec.ts` | #security | Homestead security tests |
| `kernel-test-utils.ts` | #test | Kernel test utilities |
| `limits.spec.ts` | #core | Resource limits tests |
| `log.spec.ts` | #obs | Logging tests |
| `memory-measurement.test.ts` | #obs | Memory measurement tests |
| `ops_stats.spec.ts` | #cli | Ops stats tests |
| `ops.spec.ts` | #cli | Ops command tests |
| `outbox.spec.ts` | #core | Outbox tests |
| `profile_embed.spec.ts` | #ui | Profile embed tests |
| `ROUTER.md` | #doc | Module documentation |
| `runtime_config.spec.ts` | #config | Runtime config tests |
| `sample.spec.ts` | #test | Sample/template test |
| `service-registry.test.ts` | #core | Service registry tests |
| `setup-database.ts` | #test | Database setup utility |
| `setup-env.ts` | #test | Environment setup utility |

---

## Test Configuration Files

| File | Location | Description |
|------|----------|-------------|
| `vitest.config.ts` | Root | Main Vitest configuration |
| `vitest.database.config.ts` | Root | Database-specific test config |

---

## Tag Reference

| Tag | Description | Count |
|-----|-------------|-------|
| `#core` | Core functionality tests | ~40 |
| `#security` | Security feature tests | ~35 |
| `#obs` | Observability tests | ~15 |
| `#db` | Database tests | ~10 |
| `#ui` | UI/interaction tests | ~8 |
| `#test` | Test utilities | ~10 |
| `#doc` | Documentation | ~12 |
| `#cli` | CLI tests | ~5 |
| `#config` | Configuration tests | ~3 |

---

**Last Updated:** 2026-01-06T14:00:00Z
