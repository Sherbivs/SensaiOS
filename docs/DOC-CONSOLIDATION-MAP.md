# Documentation Consolidation Map
**Phase 0 Deliverable** | **Week 2** | **Created: 2025-11-16**

## Overview
Detailed source→target mappings for consolidating **74 CONSOLIDATE files** into **3 Operational Bibles**. This map guides Phase 1-3 execution with precise content placement, merge strategies, and cross-reference migration.

## Consolidation Strategy

### Three-Bible Architecture

```
ARCHITECTURE-BIBLE.md (18 sources)
├── System Architecture
├── Database Architecture  
├── Worker Architecture
├── Event Bus
├── Logging Architecture
├── Error System
├── Security Bot
├── Router System
├── Game Engine
├── Safety Guarantees
├── Observability
├── Performance
└── Future Roadmap

OPERATIONS-BIBLE.md (28 sources)
├── Service Matrix
├── Database Operations (11 sources)
├── Deployment Procedures (16 sources)
├── Environment Management (2 sources)
├── Monitoring (4 sources)
└── Troubleshooting

DEVELOPMENT-BIBLE.md (28 sources)
├── Local Setup (5 sources)
├── Testing Patterns
├── Debugging Guides
├── Performance (3 sources)
├── Error Handling (6 sources)
├── Console Tooling (2 sources)
└── Utilities (4 sources)
```

---

## ARCHITECTURE-BIBLE.md (18 Files → 1 Bible)

### Section 1: System Overview
**Target**: ARCHITECTURE-BIBLE.md § System Overview  
**Sources**: 1 file

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `architecture/architecture.md` | Core system architecture overview | Extract as base content for section, update references |

### Section 2: Database Architecture
**Target**: ARCHITECTURE-BIBLE.md § Database Architecture  
**Sources**: 2 files

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `database/database-systems.md` | Database system overview | Merge as § Database Architecture → Overview |
| `database/db-replication-architecture.md` | Replication design (Phase 16) | Merge as § Database Architecture → Replication |

### Section 3: Worker Architecture
**Target**: ARCHITECTURE-BIBLE.md § Worker Architecture  
**Sources**: 2 files

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `deployment/workers.md` | Worker architecture + Phase 10+ roadmap | Merge as § Worker Architecture → Core Design |
| `architecture/cross-worker-state-visibility.md` | Cross-worker state design | Merge as § Worker Architecture → State Visibility |

### Section 4: Event Bus
**Target**: ARCHITECTURE-BIBLE.md § Event Bus  
**Sources**: 1 file

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `architecture/phase2-event-bus-design.md` | Event bus architecture (Phase 2.4) | Extract as § Event Bus |

### Section 5: Logging Architecture
**Target**: ARCHITECTURE-BIBLE.md § Logging Architecture  
**Sources**: 4 files

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `architecture/intelligent-logging-system.md` | Intelligent logging system design | Merge as § Logging Architecture → Core Design |
| `architecture/log-buffer.md` | Log buffer implementation | Merge as § Logging Architecture → Buffer Design |
| `architecture/AI-LOG-SYSTEM.md` | AI log system integration | Merge as § Logging Architecture → AI Integration |
| `architecture/AI-LOG-SCALING.md` | Log scaling strategy | Merge as § Logging Architecture → Scaling |

### Section 6: Error System
**Target**: ARCHITECTURE-BIBLE.md § Error System  
**Sources**: 5 files

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `error-system/error-detection-system.md` | Error detection system design | Merge as § Error System → Detection Architecture |
| `error-system/error-detection-guarantees.md` | Error detection guarantees | Merge as § Error System → Guarantees |
| `error-system/error-tracker-integration.md` | Error tracker integration | Merge as § Error System → Tracker Integration |
| `error-system/error-monitoring-logger-integration.md` | Logger-error integration | Merge as § Error System → Logger Integration |
| `architecture/error-logging-integration.md` | Error-logging bridge | Merge as § Error System → Logging Integration |

### Section 7: Security Bot
**Target**: ARCHITECTURE-BIBLE.md § Security Bot  
**Sources**: 2 files

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `architecture/security-bot-state.md` | Security bot state persistence | Merge as § Security Bot → State Persistence |
| `architecture/restart-dm-format.md` | Restart DM format spec | Merge as § Security Bot → Restart DMs |

### Section 8: Router System
**Target**: ARCHITECTURE-BIBLE.md § Router System  
**Sources**: 1 file

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `architecture/meta-router.md` | Meta-router design | Extract as § Router System |

### Section 9: Game Engine
**Target**: ARCHITECTURE-BIBLE.md § Game Engine  
**Sources**: 6 files

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `game-engine/PBSL.md` | PBSL deterministic battle system | Merge as § Game Engine → PBSL Manifesto |
| `game-engine/battle-dm-flow.md` | Battle DM interaction design | Merge as § Game Engine → Battle DM Flow |
| `game-engine/engine-cache-safety.md` | Engine cache safety guarantees | Merge as § Game Engine → Cache Safety |
| `game-engine/engine-db-replication.md` | Engine DB replication architecture | Merge as § Game Engine → DB Replication |
| `game-engine/engine-db-persistence-opportunities.md` | sql.js → better-sqlite3 migration roadmap | Merge as § Game Engine → DB Persistence Roadmap |
| `game-engine/event-tracking-schema.md` | Event tracking schema design | Merge as § Game Engine → Event Tracking |
| `architecture/dex-v2-design.md` | Dexpack v2 architecture | Merge as § Game Engine → Dex V2 |

### Section 10: Discord Bot
**Target**: ARCHITECTURE-BIBLE.md § Discord Bot  
**Sources**: 4 files

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `DISCORD-COMMAND-SUITE.md` | Discord command suite overview | Merge as § Discord Bot → Command Suite |
| `specs/AI DM COMMAND SUITE GUIDANCE.md` | AI DM command guidance | Merge as § Discord Bot → AI DM Commands |
| `specs/DM-ADMIN-COMMAND-SUITE-SPEC.md` | DM admin command spec | Merge as § Discord Bot → Admin Command Spec |
| `specs/DM-ADMIN-DOCS-INDEX.md` | Admin docs navigation | Merge as § Discord Bot → Admin Docs Index |

### Section 11: Safety Guarantees
**Target**: ARCHITECTURE-BIBLE.md § Safety Guarantees  
**Sources**: 1 file

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `architecture/safety.md` | Safety system design | Extract as § Safety Guarantees |

### Section 12: Observability
**Target**: ARCHITECTURE-BIBLE.md § Observability  
**Sources**: 2 files

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `architecture/metrics-transparency.md` | Metrics transparency design | Merge as § Observability → Metrics |
| `metrics-calculation.md` | Metrics calculation methods | Merge as § Observability → Calculation Methods |

### Section 13: Performance
**Target**: ARCHITECTURE-BIBLE.md § Performance  
**Sources**: 2 files

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `architecture/OPTIMIZATION-BIBLE.md` | System optimization roadmap | Merge as § Performance → Optimization Roadmap |
| `architecture/centralized-architecture-analysis.md` | Centralized architecture analysis | Merge as § Performance → Centralization |

### Section 14: Future Roadmap
**Target**: ARCHITECTURE-BIBLE.md § Future Roadmap  
**Sources**: 1 file

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `architecture/perfect-system-roadmap.md` | System evolution roadmap | Extract as § Future Roadmap |

**Total ARCHITECTURE-BIBLE.md Sources**: 37 files

---

## OPERATIONS-BIBLE.md (28 Files → 1 Bible)

### Section 1: Service Matrix
**Target**: OPERATIONS-BIBLE.md § Service Matrix  
**Sources**: 1 file

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `architecture/OPERATIONS.md` | Worker operations guide | Extract as § Service Matrix |

### Section 2: Database Operations
**Target**: OPERATIONS-BIBLE.md § Database Operations  
**Sources**: 11 files

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `database/database-url-selection.md` | **CRITICAL** URL selection logic | Merge as § Database → URL Selection (**HIGH PRIORITY**) |
| `database/database-connections-reference.md` | Connection reference guide | Merge as § Database → Connections |
| `database/database-naming-schema.md` | Naming conventions | Merge as § Database → Naming Schema |
| `database/db-cluster-quick-start.md` | Cluster quick start | Merge as § Database → Quick Start |
| `database/db-cluster-standardization.md` | Cluster standards | Merge as § Database → Standardization |
| `database/db-control-suite.md` | Database CLI tools | Merge as § Database → Control Suite |
| `database/2-node-cluster-automation.md` | 2-node cluster automation | Merge as § Database → Cluster Automation |
| `database/dual-onpremise-database-guide.md` | Local DB setup guide | Merge as § Database → On-Premise Setup |
| `database/query-optimization-guide.md` | Query optimization techniques | Merge as § Database → Query Optimization |
| `historical/memory-investigations/MEMORY-MONITORING-QUICK-REF.md` | Memory metrics monitoring | Merge as § Database → Memory Monitoring |

### Section 3: Deployment Procedures
**Target**: OPERATIONS-BIBLE.md § Deployment  
**Sources**: 16 files

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `deployment/comprehensive-mount-path-audit.md` | Render path structure | Merge as § Deployment → Path Structure |
| `deployment/RENDER-PATH-MAPPING-2025-11-14.md` | Render path behavior | Merge as § Deployment → Path Mapping |
| `deployment/RENDER-SERVICE-NAMING.md` | Service naming conventions | Merge as § Deployment → Service Naming |
| `deployment/render-api-logging-summary.md` | Render API integration | Merge as § Deployment → API Integration |
| `deployment/render-disk-mount-fix.md` | Disk mount troubleshooting | Merge as § Deployment → Disk Mount Troubleshooting |
| `deployment/render-mount-verification.md` | Mount verification checklist | Merge as § Deployment → Mount Verification |
| `deployment/render-one-off-jobs.md` | One-off job patterns | Merge as § Deployment → One-Off Jobs |
| `deployment/render-ssh-automation.md` | SSH automation guide | Merge as § Deployment → SSH Automation |
| `deployment/ssh-logging-playbook.md` | SSH logging playbook | Merge as § Deployment → SSH Logging |
| `deployment/ssh-protocol.md` | SSH protocol documentation | Merge as § Deployment → SSH Protocol |
| `deployment/DISK-RESOURCE-INTEGRATION.md` | Disk resource integration | Merge as § Deployment → Disk Resources |
| `deployment/DISK-RESOURCE-QUICK-REF.md` | Disk resources quick ref | Merge as § Deployment → Disk Resources Quick Ref |
| `deployment/RESOURCE-REQUEST-QUICK-REF.md` | Resource request quick ref | Merge as § Deployment → Resource Requests |
| `deployment/RESOURCE-MONITOR-STANDARDS.md` | Resource monitoring standards | Merge as § Deployment → Resource Standards |
| `deployment/RESOURCE-OPTIMIZATION-QUICK-REF.md` | Resource optimization | Merge as § Deployment → Resource Optimization |

### Section 4: Environment Management
**Target**: OPERATIONS-BIBLE.md § Environment  
**Sources**: 2 files

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `environment/render-access-configuration.md` | Render access config | Merge as § Environment → Render Access |
| `environment/render-credentials-reference.md` | Credentials reference | Merge as § Environment → Credentials Reference |

### Section 5: Monitoring
**Target**: OPERATIONS-BIBLE.md § Monitoring  
**Sources**: 2 files

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `error-system/error-dashboard-command.md` | `/ops error` command docs | Merge as § Monitoring → Error Dashboard |

**Total OPERATIONS-BIBLE.md Sources**: 30 files

---

## DEVELOPMENT-BIBLE.md (28 Files → 1 Bible)

### Section 1: Local Setup
**Target**: DEVELOPMENT-BIBLE.md § Local Setup  
**Sources**: 5 files

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `environment/ai-env-setup.md` | AI env configuration | Merge as § Local Setup → AI Environment |
| `environment/WORKSTATION-GAMEPLAY-SETUP.md` | Local gameplay setup | Merge as § Local Setup → Workstation Gameplay |
| `deployment/vscode-render-integration.md` | VS Code task integration | Merge as § Local Setup → VS Code Integration |

### Section 2: Testing Patterns
**Target**: DEVELOPMENT-BIBLE.md § Testing  
**Sources**: TBD (not in consolidation list)

### Section 3: Debugging Guides
**Target**: DEVELOPMENT-BIBLE.md § Debugging  
**Sources**: TBD (not in consolidation list)

### Section 4: Performance
**Target**: DEVELOPMENT-BIBLE.md § Performance  
**Sources**: 3 files

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `historical/memory-investigations/memory-analysis-summary.md` | Memory analysis methods | Merge as § Performance → Memory Analysis |
| `historical/memory-investigations/memory-profiling-report.md` | Profiling techniques | Merge as § Performance → Profiling |

### Section 5: Error Handling
**Target**: DEVELOPMENT-BIBLE.md § Error Handling  
**Sources**: 1 file

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `error-system/error-boundaries-implementation.md` | Error boundary implementation | Merge as § Error Handling → Error Boundaries |

### Section 6: Console Tooling
**Target**: DEVELOPMENT-BIBLE.md § Console Tooling  
**Sources**: 2 files

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `console-output/console-output-standards.md` | Console output standardization | Merge as § Console Tooling → Output Standards |
| `console-output/console-output-quick-reference.md` | Console output quick ref | Merge as § Console Tooling → Quick Reference |

### Section 7: Utilities
**Target**: DEVELOPMENT-BIBLE.md § Utilities  
**Sources**: 4 files

| Source File | Content Summary | Integration Strategy |
|-------------|-----------------|---------------------|
| `datetime-utilities.md` | DateTime utility docs | Merge as § Utilities → DateTime Helpers |
| `timezone-standardization-guide.md` | Timezone standardization | Merge as § Utilities → Timezone Standardization |
| `specs/DM-ADMIN-IMPLEMENTATION-GUIDE.md` | Admin implementation guide | Merge as § Utilities → Implementation Guides |

**Total DEVELOPMENT-BIBLE.md Sources**: 12 files

---

## Consolidation Statistics

| Bible | Source Files | Target Sections | Estimated Size |
|-------|-------------|-----------------|----------------|
| **ARCHITECTURE-BIBLE.md** | 37 | 14 | ~3000 lines |
| **OPERATIONS-BIBLE.md** | 30 | 5 | ~2500 lines |
| **DEVELOPMENT-BIBLE.md** | 12 | 7 | ~1500 lines |
| **TOTAL** | **79** | **26** | **~7000 lines** |

**Note**: 79 sources > 74 CONSOLIDATE count because some files (like `architecture/OPERATIONS.md`) appear in classification but serve dual roles.

---

## Merge Strategy

### Phase 1: Architecture Bible (Weeks 3-4)
1. Create ARCHITECTURE-BIBLE.md skeleton with 14 sections
2. Extract System Overview from `architecture.md`
3. Consolidate Database Architecture (2 sources)
4. Consolidate Worker Architecture (2 sources)
5. Consolidate Event Bus (1 source)
6. Consolidate Logging Architecture (4 sources) — **LARGEST SECTION**
7. Consolidate Error System (5 sources) — **SECOND LARGEST**
8. Consolidate Security Bot (2 sources)
9. Consolidate Router System (1 source)
10. Consolidate Game Engine (7 sources) — **THIRD LARGEST**
11. Consolidate Discord Bot (4 sources)
12. Consolidate Safety Guarantees (1 source)
13. Consolidate Observability (2 sources)
14. Consolidate Performance (2 sources)
15. Consolidate Future Roadmap (1 source)
16. Add cross-references to OPERATIONS-BIBLE.md and DEVELOPMENT-BIBLE.md
17. Delete all 37 source files

### Phase 2: Operations Bible (Weeks 5-6)
1. Create OPERATIONS-BIBLE.md skeleton with 5 sections
2. Extract Service Matrix from `OPERATIONS.md`
3. Consolidate Database Operations (11 sources) — **LARGEST SECTION**, includes **CRITICAL** URL selection
4. Consolidate Deployment Procedures (16 sources) — **SECOND LARGEST**
5. Consolidate Environment Management (2 sources)
6. Consolidate Monitoring (2 sources)
7. Add cross-references to ARCHITECTURE-BIBLE.md and DEVELOPMENT-BIBLE.md
8. Delete all 30 source files

### Phase 3: Development Bible (Weeks 7-8)
1. Create DEVELOPMENT-BIBLE.md skeleton with 7 sections
2. Consolidate Local Setup (5 sources)
3. Add Testing Patterns placeholder (no sources yet)
4. Add Debugging Guides placeholder (no sources yet)
5. Consolidate Performance (3 sources)
6. Consolidate Error Handling (1 source)
7. Consolidate Console Tooling (2 sources)
8. Consolidate Utilities (4 sources)
9. Add cross-references to ARCHITECTURE-BIBLE.md and OPERATIONS-BIBLE.md
10. Delete all 12 source files

---

## Cross-Reference Migration Plan

### Preserve Existing References
Each source file contains "Referenced By" and "Cross-References" sections. During consolidation:

1. **Extract all cross-references** from source files
2. **Map to new Bible sections** (e.g., `architecture/phase2-event-bus-design.md` → `ARCHITECTURE-BIBLE.md § Event Bus`)
3. **Update all referencing files** to point to Bible sections instead of individual files
4. **Add "Referenced By"** sections to Bible chapters listing all incoming references
5. **Add "Cross-References"** sections to Bible chapters listing related content

### Example Migration

**Before** (in `database/db-replication-architecture.md`):
```markdown
Referenced By:
- `docs/database/database-systems.md` — Database system overview
- `AGENTS.md` — Operations guide
```

**After** (in `ARCHITECTURE-BIBLE.md § Database Architecture → Replication`):
```markdown
Referenced By:
- ARCHITECTURE-BIBLE.md § Database Architecture → Overview
- AGENTS.md — Operations guide

Cross-References:
- OPERATIONS-BIBLE.md § Database → URL Selection (CRITICAL)
- ARCHITECTURE-BIBLE.md § Worker Architecture → State Visibility
```

---

## Validation Checklist

### Pre-Consolidation
- [ ] All 79 source files exist and are readable
- [ ] Classification matrix matches source file list
- [ ] No duplicate source files in map

### During Consolidation (Per Bible)
- [ ] All sections have target content
- [ ] Cross-references extracted and mapped
- [ ] Code examples tested
- [ ] Configuration snippets validated
- [ ] No broken internal links

### Post-Consolidation (Per Bible)
- [ ] Table of contents accurate
- [ ] All source files deleted
- [ ] Cross-references updated in referencing files
- [ ] ROUTER.md manifests updated to reference Bible sections
- [ ] masterroutetable.md updated with Bible links
- [ ] Link validation passes 100%

---

## Risk Mitigation

### Content Loss Prevention
1. **Git snapshots** before each phase deletion
2. **Content diff review** after consolidation
3. **Cross-reference validation** before source deletion
4. **Rollback procedure** documented in master plan

### Quality Assurance
1. **Peer review** of consolidated Bible sections
2. **Developer testing** of operational procedures
3. **Link validation** automation (Phase 7)
4. **Freshness monitoring** (Phase 7)

---

**Last Updated**: 2025-11-16 23:45 UTC  
**Status**: Week 2 deliverable — Ready for Phase 1-3 execution  
**Next Action**: Begin Phase 1 (Architecture Bible) in Week 3 (December 1, 2025)
