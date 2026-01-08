# Configuration Inventory

**Created:** 2026-01-06T14:10:00Z  
**Purpose:** Complete inventory of configuration, tooling, and workflow files  
**Status:** ✅ COMPLETE — 71 files inventoried  
**Cross-Reference:** [INVENTORY-INDEX.md](INVENTORY-INDEX.md)

---

## 📊 Summary

| Category | Files | Purpose |
|----------|-------|---------|
| Root Config | 32 | Build, lint, deploy, env |
| GitHub Workflows | 18 | CI/CD automation |
| GitHub Instructions | 9 | AI/Copilot guidance |
| GitHub Agents | 2 | AI agent definitions |
| GitHub Prompts | 2 | Prompt templates |
| Ops Configs | 6 | Grafana/Loki/Prometheus |
| Tools | 3 | Helper utilities |
| **TOTAL** | **71** | — |

---

## Root Configuration Files (`/`) — 32 files

### Build & TypeScript

| File | Tag | Description |
|------|-----|-------------|
| `tsconfig.json` | #build | Main TypeScript configuration |
| `tsconfig.build.json` | #build | Build-specific TS config |
| `tsconfig.tsbuildinfo` | #build | TS incremental build info |
| `tsconfig.build.tsbuildinfo` | #build | Build incremental info |

### Package Management

| File | Tag | Description |
|------|-----|-------------|
| `package.json` | #npm | Dependencies and scripts |
| `package-lock.json` | #npm | Locked dependency versions |
| `.node-version` | #npm | Node.js version specification |

### Linting & Formatting

| File | Tag | Description |
|------|-----|-------------|
| `eslint.config.js` | #lint | ESLint flat config |
| `.prettierrc` | #lint | Prettier formatting rules |

### Test Configuration

| File | Tag | Description |
|------|-----|-------------|
| `vitest.config.ts` | #test | Main Vitest configuration |
| `vitest.database.config.ts` | #test | Database test configuration |

### Deployment

| File | Tag | Description |
|------|-----|-------------|
| `render.yaml` | #deploy | Render.com service definitions |
| `Dockerfile` | #deploy | Container build definition |
| `docker-compose.yml` | #deploy | Local Docker orchestration |
| `docker-compose.loki.yml` | #deploy | Loki stack orchestration |

### Database

| File | Tag | Description |
|------|-----|-------------|
| `prisma.config.ts` | #db | Prisma 7 configuration |

### Environment

| File | Tag | Description |
|------|-----|-------------|
| `.env` | #env | Local environment (empty in repo) |
| `.env.example` | #env | Environment variable template |
| `.env.docker` | #env | Docker environment config |
| `.gitignore` | #env | Git ignore patterns |
| `.dockerignore` | #env | Docker ignore patterns |

### Documentation Files (Root)

| File | Tag | Description |
|------|-----|-------------|
| `README.md` | #doc | Project overview |
| `AGENTS.md` | #doc | AI agent operations guide |
| `OPERATIONS.md` | #doc | Service operations guide |
| `Patch.md` | #doc | AI project manager contract |
| `Prompt.md` | #doc | Operational prompt state |
| `Tasklist.md` | #doc | Task tracking ledger |
| `RULESET.md` | #doc | Game rules specification |
| `masterroutetable.md` | #doc | Router index table |
| `LICENSE` | #doc | MIT license |

### Entry Points

| File | Tag | Description |
|------|-----|-------------|
| `security-bot.ts` | #code | Security bot entry point |
| `pbsl-oracle-report.json` | #data | PBSL oracle report |

---

## GitHub Workflows (`.github/workflows/`) — 18 files

### CI/CD Workflows

| File | Tag | Description |
|------|-----|-------------|
| `database-ci.yml` | #ci | Database CI pipeline |
| `runtime.yml` | #ci | Runtime checks |
| `security-tests.yml` | #ci | Security test suite |

### Guard Workflows (Quality Gates)

| File | Tag | Description |
|------|-----|-------------|
| `guard-db-docs.yml` | #guard | Database documentation guard |
| `guard-dexpack.yml` | #guard | Dexpack integrity guard |
| `guard-docs.yml` | #guard | Documentation guard |
| `guard-meta.yml` | #guard | Meta files guard |
| `guard-render.yml` | #guard | Render config guard |
| `guard-router.yml` | #guard | Router consistency guard |
| `guard-routing.yml` | #guard | Routing system guard |

### Health & Monitoring Workflows

| File | Tag | Description |
|------|-----|-------------|
| `agent-health.yml` | #health | Agent health check |
| `data-health.yml` | #health | Data integrity check |
| `dead-code-check.yml` | #health | Dead code detection |
| `health-check-watchdog.yml` | #health | Health check watchdog |

### Operational Workflows

| File | Tag | Description |
|------|-----|-------------|
| `pbsl-oracle.yml` | #ops | PBSL oracle runner |
| `refresh-cache.yml` | #ops | Cache refresh workflow |
| `retrieve-store-logs.yml` | #ops | Store log retrieval |
| `ROUTER.md` | #doc | Workflow documentation |

---

## GitHub Instructions (`.github/instructions/`) — 9 files

**Purpose:** AI coding assistant guidance per file type

| File | ApplyTo | Description |
|------|---------|-------------|
| `cleanup.instructions.md` | `**` | Cleanup patterns |
| `copilot-instructions.instructions.md` | `**` | General Copilot rules |
| `database.instructions.md` | `prisma/**` | Database/Prisma rules |
| `documentation.instructions.md` | `docs/**,ops/**` | Documentation rules |
| `envelope-migration.instructions.md` | `**` | Envelope migration guide |
| `scripts.instructions.md` | `scripts/**` | Script conventions |
| `sensai.instructions.md` | `**` | SensaiOS patterns |
| `testing.instructions.md` | `tests/**` | Testing conventions |
| `typescript.instructions.md` | `src/**/*.ts` | TypeScript rules |

---

## GitHub Agents (`.github/agents/`) — 2 files

**Purpose:** Specialized AI agent definitions

| File | Tag | Description |
|------|-----|-------------|
| `cleanup-agent.agent.md` | #agent | Dead code cleanup agent |
| `research-gpt.agent.md` | #agent | Research GPT agent |

---

## GitHub Prompts (`.github/prompts/`) — 2 files

**Purpose:** Prompt templates for AI operations

| File | Tag | Description |
|------|-----|-------------|
| `cleanup-meeting.prompt.md` | #prompt | Cleanup meeting template |
| `IG.prompt.md` | #prompt | Infinity Gauntlet prompt |

---

## GitHub Root (`.github/`) — 4 files

| File | Tag | Description |
|------|-----|-------------|
| `copilot-instructions.md` | #doc | Root Copilot instructions |
| `copilot-instructions-Sensai.md` | #doc | SensaiOS Copilot instructions |
| `ROUTER.md` | #doc | GitHub directory router |
| `ROUTER-Sensai.md` | #doc | SensaiOS router |

---

## Ops Configuration Files (`ops/`) — 6 files

### Observability Stack

| File | Tag | Description |
|------|-----|-------------|
| `loki-config.yaml` | #obs | Loki log aggregation config |
| `promtail-config.yaml` | #obs | Promtail log shipper config |
| `prometheus-alerts.yml` | #obs | Prometheus alerting rules |

### Grafana Dashboards & Datasources

| File | Tag | Description |
|------|-----|-------------|
| `grafana-datasources.yml` | #obs | Grafana data source config |
| `grafana-dashboards.yml` | #obs | Dashboard provisioning |
| `grafana-alert-rules-v2.yml` | #obs | Grafana alert rules |

### Grafana Dashboard JSON (6 files)

| File | Tag | Description |
|------|-----|-------------|
| `grafana-dashboard.json` | #obs | Main dashboard |
| `grafana-battle-engine.json` | #obs | Battle engine metrics |
| `grafana-cache-performance.json` | #obs | Cache metrics |
| `grafana-infinity-gauntlet-main.json` | #obs | Main app dashboard |
| `grafana-timescaledb-dashboard.json` | #obs | TimescaleDB metrics |
| `grafana-unified-system-health.json` | #obs | System health unified |
| `grafana-loki-alert-rules.yml` | #obs | Loki-based alerts |

---

## Tools (`tools/`) — 3 files

| File | Tag | Description |
|------|-----|-------------|
| `log-rotation.ts` | #tool | Log rotation utility |
| `README.md` | #doc | Tools documentation |
| `ROUTER.md` | #doc | Tools router |

---

## Ops Meta Files (`ops/`) — 12 files

### Task & State Management

| File | Tag | Description |
|------|-----|-------------|
| `NEXT.yaml` | #state | Active task pointer |
| `HOTFIX_PLAN.yaml` | #state | Hotfix plan state |
| `ROUTER.yaml` | #state | Router-of-routers |
| `ROUTER_INDEX.yaml` | #state | Router index |

### Documentation

| File | Tag | Description |
|------|-----|-------------|
| `ALERTING-GUIDE.md` | #doc | Alerting setup guide |
| `CLI-VISUAL-AUDIT.md` | #doc | CLI visual audit |
| `CODEBASE-INVENTORY.md` | #doc | Original inventory |
| `GRAFANA-DASHBOARDS.md` | #doc | Dashboard guide |
| `OBSERVABILITY-AI-PROMPTS.md` | #doc | AI prompt templates |
| `RENDER-CREDENTIALS.md` | #doc | Render credentials guide |
| `ROUTER.md` | #doc | Ops router |
| `staging-validation-results.json` | #data | Staging validation |

---

## Tag Reference

| Tag | Description | Count |
|-----|-------------|-------|
| `#build` | Build configuration | 4 |
| `#npm` | Package management | 3 |
| `#lint` | Linting/formatting | 2 |
| `#test` | Test configuration | 2 |
| `#deploy` | Deployment config | 4 |
| `#db` | Database config | 1 |
| `#env` | Environment config | 5 |
| `#ci` | CI/CD workflows | 3 |
| `#guard` | Quality gate workflows | 7 |
| `#health` | Health check workflows | 4 |
| `#ops` | Operational workflows | 3 |
| `#obs` | Observability config | 13 |
| `#doc` | Documentation | 20+ |
| `#agent` | AI agent definitions | 2 |
| `#prompt` | Prompt templates | 2 |
| `#tool` | Helper tools | 1 |
| `#state` | State management | 4 |

---

**Last Updated:** 2026-01-06T14:10:00Z
