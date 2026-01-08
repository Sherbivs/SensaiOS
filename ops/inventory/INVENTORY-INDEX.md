# Repository Inventory — Master Index

**Created:** 2026-01-06T14:00:00Z  
**Updated:** 2026-01-06T14:35:00Z  
**Purpose:** Complete workspace inventory with cross-referencing across all file categories  
**Status:** ✅ COMPLETE — 5 inventory files, ~2,806+ files tracked

---

## 📊 Inventory Summary

| Category | File | Count | Status |
|----------|------|-------|--------|
| **Source Code** | [INVENTORY-CODE.md](INVENTORY-CODE.md) | 412 files | ✅ Complete |
| **Tests** | [INVENTORY-TESTS.md](INVENTORY-TESTS.md) | 134 files | ✅ Complete |
| **Configuration** | [INVENTORY-CONFIG.md](INVENTORY-CONFIG.md) | 71 files | ✅ Complete |
| **Runtime Data** | [INVENTORY-RUNTIME.md](INVENTORY-RUNTIME.md) | ~2,162 files | ✅ Complete (clusters) |
| **Backups** | [INVENTORY-BACKUPS.md](INVENTORY-BACKUPS.md) | 27 files | ✅ Complete |
| **TOTAL** | — | **~2,806 files** | ✅ |

> **Note:** Documentation inventory integrated into existing ROUTER.md files and ops/CODEBASE-INVENTORY.md (353 files). Runtime data uses cluster declarations for ephemeral files (error reports, logs, PostgreSQL).

> **Note:** Runtime data uses cluster declarations for ephemeral files (error reports, logs). See [INVENTORY-RUNTIME.md](INVENTORY-RUNTIME.md) for cluster rules.

---

## 📁 Directory Structure Overview

```
Infinity-Gauntlet/
├── src/                    → INVENTORY-CODE.md (472 files)
├── tests/                  → INVENTORY-TESTS.md (134 files)
├── scripts/                → INVENTORY-CODE.md § Scripts (151 files)
├── docs/                   → INVENTORY-DOCS.md (353 files)
├── ops/                    → INVENTORY-CONFIG.md § Operations (41 files)
├── prisma/                 → INVENTORY-CODE.md § Database (44 files)
├── .github/                → INVENTORY-CONFIG.md § GitHub (35 files)
├── Store/                  → INVENTORY-RUNTIME.md (2,162 files)
├── backups/                → INVENTORY-BACKUPS.md (28 files)
├── assets/                 → INVENTORY-CODE.md § Assets (5 files)
├── data/                   → INVENTORY-CODE.md § Data (12 files)
├── tools/                  → INVENTORY-CONFIG.md § Tools (3 files)
├── manifests/              → INVENTORY-CONFIG.md § Manifests (3 files)
├── playbooks/              → INVENTORY-DOCS.md § Playbooks (6 files)
├── router/                 → INVENTORY-CODE.md § Router (3 files)
└── [root files]            → INVENTORY-CONFIG.md § Root (18 files)
```

---

## 🔗 Cross-Reference Matrix

### Code ↔ Documentation Alignment

| Code Layer | Doc Reference | Inventory Link |
|------------|---------------|----------------|
| `src/sensaios/` | Architecture Bible §28, Development Bible §11 | [INVENTORY-CODE.md § SensaiOS](INVENTORY-CODE.md#1-sensaios-ring-security) |
| `src/kernel/` | Architecture Bible §16, §5 | [INVENTORY-CODE.md § Kernel](INVENTORY-CODE.md#2-kernel) |
| `src/bot/` | Architecture Bible §10, §18, §7 | [INVENTORY-CODE.md § Discord Bot](INVENTORY-CODE.md#3-discord-bot) |
| `src/core/` | Architecture Bible §9 | [INVENTORY-CODE.md § Core Engines](INVENTORY-CODE.md#4-core-game-engines) |
| `src/services/` | Operations Bible §1, §2 | [INVENTORY-CODE.md § Services](INVENTORY-CODE.md#5-services) |
| `src/observability/` | Architecture Bible §5 | [INVENTORY-CODE.md § Observability](INVENTORY-CODE.md#6-observability) |
| `src/workers/` | Architecture Bible §3 | [INVENTORY-CODE.md § Workers](INVENTORY-CODE.md#7-workers) |

### Tests ↔ Code Coverage

| Test Category | Code Coverage | Test File |
|---------------|---------------|-----------|
| SensaiOS Security | `src/sensaios/` | [INVENTORY-TESTS.md § SensaiOS](INVENTORY-TESTS.md#sensaios-tests) |
| Security Services | `src/services/` | [INVENTORY-TESTS.md § Security](INVENTORY-TESTS.md#security-tests) |
| PBSL Engine | `src/core/pbsl/` | [INVENTORY-TESTS.md § PBSL](INVENTORY-TESTS.md#pbsl-tests) |
| Shared Utilities | `src/shared/` | [INVENTORY-TESTS.md § Shared](INVENTORY-TESTS.md#shared-tests) |

### Config ↔ Deployment

| Config Type | Deployment Target | Config File |
|-------------|-------------------|-------------|
| Render Services | Production | [INVENTORY-CONFIG.md § Render](INVENTORY-CONFIG.md#render-configuration) |
| GitHub Actions | CI/CD | [INVENTORY-CONFIG.md § Workflows](INVENTORY-CONFIG.md#github-workflows) |
| Docker | Local Dev | [INVENTORY-CONFIG.md § Docker](INVENTORY-CONFIG.md#docker-configuration) |
| Grafana | Observability | [INVENTORY-CONFIG.md § Ops](INVENTORY-CONFIG.md#operations-config) |

---

## 📋 Inventory File Responsibilities

### INVENTORY-CODE.md (412 files)
- All TypeScript/JavaScript source files in `src/` (382 files)
- Script files in `scripts/` (30 files)  
- Organized by 16 layers (SensaiOS, Kernel, Bot, Services, etc.)

### INVENTORY-TESTS.md (134 files)
- All Vitest spec files (`*.spec.ts`, `*.test.ts`)
- Test fixtures and reports
- Security attack tests
- SensaiOS tests

### INVENTORY-CONFIG.md (71 files)
- Root configuration files (tsconfig, eslint, package.json, etc.)
- GitHub configuration (workflows, instructions, agents, prompts)
- Docker and Render deployment configuration
- Ops observability configs (Grafana, Loki, Prometheus)
- Tool configurations

### INVENTORY-RUNTIME.md (~2,162 files)
- Store/ runtime data directories
- **Cluster declarations** for ephemeral files:
  - PostgreSQL cluster (~1,521 files)
  - Error reports cluster (~420 files)
  - Emergency logs cluster (~174 files)
  - Kernel logs cluster (~30 files)
- State persistence files (17 individual)
- Cache directories

### INVENTORY-BACKUPS.md (27 files)
- Migration checkpoints (21 files)
- Pre-TimescaleDB POC backups (6 files)
- Database dumps and metadata

---

## 🏷️ Cluster Declaration Policy

Files declared as **clusters** (not individually named) when:

1. **Ephemeral by nature** — Generated at runtime, auto-cleaned
2. **Timestamped naming** — Pattern-based (e.g., `error-YYYY-MM-DD-*.json`)
3. **Retention policies apply** — Subject to automatic cleanup
4. **Count varies** — File count changes frequently
5. **Binary/system files** — PostgreSQL data clusters

**Cluster Summary:**
| Cluster | Location | Pattern | Retention | Count |
|---------|----------|---------|-----------|-------|
| PostgreSQL | `Store/onpremise-dev-primary/` | Database cluster | Persistent | ~1,521 |
| Error Reports | `Store/error-reports/` | `error-report-*.json` | 7 days | ~420 |
| Emergency Logs | `Store/emergency-error-logs/` | `emergency-*.log` | 14 days | ~174 |
| Kernel Logs | `Store/kernel-logs/` | `kernel-*.log` | 30 days | ~30 |

---

## 📈 Version History

| Date | Revision | Changes |
|------|----------|---------|
| 2026-01-06 | 1.0 | Initial multi-file inventory system created |
| 2026-01-06 | 1.1 | All 5 inventory files completed |

---

**Previous Inventory:** [../CODEBASE-INVENTORY.md](../CODEBASE-INVENTORY.md) (486 files, code + docs only)  
**New System:** 5 specialized inventory files with cluster declarations  
**Migration Note:** The previous single-file inventory has been expanded into this multi-file system for better organization and cross-referencing.
