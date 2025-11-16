# OPERATIONS BIBLE
**Centralized Operational Procedures Documentation** | **Created: 2025-11-16** | **Status: TEMPLATE (Phase 2 Week 5)**

## Purpose
Single source of truth for Infinity Gauntlet operational procedures, deployment workflows, database operations, environment management, and monitoring. Consolidates 30 source documents into unified runbook.

---

## Table of Contents

### 1. Service Matrix
- Render service topology
- Worker responsibilities
- Service dependencies
- Scaling roadmap

### 2. Database Operations (CRITICAL)
- **2.1 URL Selection** — **[ABSOLUTE]** Connection string logic
- **2.2 Connections** — Connection reference guide
- **2.3 Naming Schema** — Canonical database naming
- **2.4 Quick Start** — Cluster quick start guide
- **2.5 Standardization** — Cluster standards
- **2.6 Control Suite** — Database CLI tools
- **2.7 Cluster Automation** — 2-node automation
- **2.8 On-Premise Setup** — Local database setup
- **2.9 Query Optimization** — Query tuning techniques
- **2.10 Memory Monitoring** — Memory metrics tracking

### 3. Deployment Procedures
- **3.1 Path Structure** — Render path mapping (CRITICAL)
- **3.2 Service Naming** — Service naming conventions
- **3.3 API Integration** — Render API usage
- **3.4 Disk Mount Troubleshooting** — Mount path debugging
- **3.5 Mount Verification** — Mount checklist
- **3.6 One-Off Jobs** — One-off job patterns
- **3.7 SSH Automation** — SSH automation guide
- **3.8 SSH Logging** — SSH logging playbook
- **3.9 SSH Protocol** — SSH protocol documentation
- **3.10 Disk Resources** — Disk resource integration
- **3.11 Resource Standards** — Resource monitoring standards
- **3.12 Resource Optimization** — Resource optimization techniques

### 4. Environment Management
- **4.1 Render Access** — Render access configuration
- **4.2 Credentials Reference** — Credentials guide

### 5. Monitoring
- **5.1 Error Dashboard** — `/ops error` command documentation
- **5.2 Service Health** — Health check procedures
- **5.3 Performance Metrics** — Performance monitoring
- **5.4 Alerting** — Alert configuration

---

## Navigation

### Referenced By
*(To be populated during Phase 2 consolidation)*

### Cross-References
- **ARCHITECTURE-BIBLE.md** § Database Architecture — Database design
- **ARCHITECTURE-BIBLE.md** § Worker Architecture — Worker design
- **DEVELOPMENT-BIBLE.md** § Local Setup — Development environment
- **Agents.md** — Agent operations guide
- **README.md** — Getting started

---

## Section 1: Service Matrix

*(Content to be consolidated from `architecture/OPERATIONS.md` in Phase 2 Week 5)*

**Placeholder**: Render service topology, worker responsibilities (bot, outbox, cache, data-pipeline, security, pokedex-cache-worker), cron jobs (pokedex-cache-failsafe), service dependencies, scaling roadmap.

---

## Section 2: Database Operations

### 2.1 URL Selection [ABSOLUTE - CRITICAL]

*(Content to be consolidated from `database/database-url-selection.md` in Phase 2 Week 5)*

**Placeholder**: **CRITICAL** connection string selection logic. Unified architecture: `PROD_DATABASE_URL` → Render-managed PostgreSQL (PRIMARY for all operations). Optional: `DATABASE_ONPREMISE_DEV_PRIMARY` → Workstation mirror (offline fallback). NO separate DEV database in production. This is an **Absolute** requirement — violations cause production failures.

**Selection Logic**:
```typescript
// Production: Single Render-managed database
PROD_DATABASE_URL → infinity-gauntlet-db (PRIMARY)
RENDER_DB_EXTERNAL_URL → Direct PostgreSQL access (same DB)

// Local Development (OPTIONAL)
DATABASE_ONPREMISE_DEV_PRIMARY → Workstation mirror (offline only)
```

**Priority Order**:
1. `PROD_DATABASE_URL` (PRIMARY - all operations)
2. `RENDER_DB_EXTERNAL_URL` (direct access - same DB)
3. `DATABASE_ONPREMISE_DEV_PRIMARY` (local fallback - workstation only)

**See Also**: ARCHITECTURE-BIBLE.md § Database Architecture → URL Selection (architectural context)

### 2.2 Connections

*(Content to be consolidated from `database/database-connections-reference.md` in Phase 2 Week 5)*

**Placeholder**: Connection reference guide, runtime client configuration (`prisma`, `onPremiseDevPrisma`, `experimentPrisma`), heartbeat monitoring, connection pooling (disabled - direct mode).

### 2.3 Naming Schema

*(Content to be consolidated from `database/database-naming-schema.md` in Phase 2 Week 5)*

**Placeholder**: Canonical database naming conventions:
- **CLOUD-PROD-MASTER** (`PROD_DATABASE_URL`) — Production database
- **ONPREMISE-DEV-PRIMARY** (`DATABASE_ONPREMISE_DEV_PRIMARY`) — Workstation development
- **ONPREMISE-DEV-EXPERIMENT** (`DATABASE_ONPREMISE_DEV_EXPERIMENT`) — Migration testing

**NEVER use**: "local", "LOCAL", "PRIMARY LOCAL", "EXPERIMENTAL", "DEV_DATABASE_URL" (deprecated)

### 2.4 Quick Start

*(Content to be consolidated from `database/db-cluster-quick-start.md` in Phase 2 Week 5)*

**Placeholder**: Database quick start guide, initial setup, verification steps.

### 2.5 Standardization

*(Content to be consolidated from `database/db-cluster-standardization.md` in Phase 2 Week 5)*

**Placeholder**: Cluster standardization procedures, naming conventions, configuration standards.

### 2.6 Control Suite

*(Content to be consolidated from `database/db-control-suite.md` in Phase 2 Week 5)*

**Placeholder**: Database CLI tools (`npm run db:cli`), commands: `status`, `counts`, `count <table>`, `query "<SQL>"`, target selection (`--target prod|dev|experiment`).

### 2.7 Cluster Automation

*(Content to be consolidated from `database/2-node-cluster-automation.md` in Phase 2 Week 5)*

**Placeholder**: 2-node cluster automation, bootstrap scripts, sync procedures.

### 2.8 On-Premise Setup

*(Content to be consolidated from `database/dual-onpremise-database-guide.md` in Phase 2 Week 5)*

**Placeholder**: Local database setup guide, ONPREMISE-DEV-PRIMARY (port 55433) and ONPREMISE-DEV-EXPERIMENT (port 55434) configuration, bootstrap procedures (`npm run ops:bootstrap-onpremise-dev`, `npm run ops:bootstrap-onpremise-experiment`).

**Architecture**:
```
Production (Render)          Workstation (OFFLINE - Local Dev Only)
-------------------          ----------------------------------------
Infinity-Gauntlet-DB         ONPREMISE-DEV-PRIMARY (55433)
(Render managed)                     ↓ Manual Clone
All services connect         ONPREMISE-DEV-EXPERIMENT (55434)
                                     ↓ EXPLICIT PUSH (when ready)
                             Upload to Render DB (migrations)
```

**CRITICAL**: Both on-premise databases are **completely offline**. Changes reach production only via **explicit push to Render database**.

### 2.9 Query Optimization

*(Content to be consolidated from `database/query-optimization-guide.md` in Phase 2 Week 5)*

**Placeholder**: Query optimization techniques, indexing strategies, performance tuning, execution plan analysis.

### 2.10 Memory Monitoring

*(Content to be consolidated from `historical/memory-investigations/MEMORY-MONITORING-QUICK-REF.md` in Phase 2 Week 5)*

**Placeholder**: Memory metrics monitoring, Prisma client telemetry, connection tracking, leak detection.

---

## Section 3: Deployment Procedures

### 3.1 Path Structure [CRITICAL]

*(Content to be consolidated from `deployment/comprehensive-mount-path-audit.md` and `deployment/RENDER-PATH-MAPPING-2025-11-14.md` in Phase 2 Week 5)*

**Placeholder**: **CRITICAL** Render path mapping. Repository clones to `/opt/render/project/src/` (NOT `/opt/render/project/`), creating nested structure: `src/` appears at `/opt/render/project/src/src/`. Working directory: `/opt/render/project/src/` for all commands. Compiled output: `/opt/render/project/src/dist/`. **This is expected Render platform behavior**.

### 3.2 Service Naming

*(Content to be consolidated from `deployment/RENDER-SERVICE-NAMING.md` in Phase 2 Week 5)*

**Placeholder**: Service naming conventions, `Infinity-Gauntlet` (worker) vs `infinity-gauntlet-bot` (web service), API name requirements (capital letters).

### 3.3 API Integration

*(Content to be consolidated from `deployment/render-api-logging-summary.md` in Phase 2 Week 5)*

**Placeholder**: Render API integration, deployment automation (`scripts/render_deploy.ps1`), service management, log streaming.

### 3.4 Disk Mount Troubleshooting

*(Content to be consolidated from `deployment/render-disk-mount-fix.md` in Phase 2 Week 5)*

**Placeholder**: Disk mount troubleshooting, path resolution issues, permission problems, mount verification.

### 3.5 Mount Verification

*(Content to be consolidated from `deployment/render-mount-verification.md` in Phase 2 Week 5)*

**Placeholder**: Mount verification checklist, test procedures, validation commands.

### 3.6 One-Off Jobs

*(Content to be consolidated from `deployment/render-one-off-jobs.md` in Phase 2 Week 5)*

**Placeholder**: One-off job patterns, manual triggers, maintenance tasks, data migrations.

### 3.7 SSH Automation

*(Content to be consolidated from `deployment/render-ssh-automation.md` in Phase 2 Week 5)*

**Placeholder**: SSH automation guide, `scripts/render_ssh_exec.ps1`, remote command execution, error handling.

### 3.8 SSH Logging

*(Content to be consolidated from `deployment/ssh-logging-playbook.md` in Phase 2 Week 5)*

**Placeholder**: SSH logging playbook, command logging, output capture, audit trail.

### 3.9 SSH Protocol

*(Content to be consolidated from `deployment/ssh-protocol.md` in Phase 2 Week 5)*

**Placeholder**: SSH protocol documentation, key management, connection procedures, security.

### 3.10 Disk Resources

*(Content to be consolidated from `deployment/DISK-RESOURCE-INTEGRATION.md` and `deployment/DISK-RESOURCE-QUICK-REF.md` in Phase 2 Week 5)*

**Placeholder**: Disk resource integration, persistent storage configuration, mount paths (`/Store`), retention policies.

### 3.11 Resource Standards

*(Content to be consolidated from `deployment/RESOURCE-MONITOR-STANDARDS.md` and `deployment/RESOURCE-REQUEST-QUICK-REF.md` in Phase 2 Week 5)*

**Placeholder**: Resource monitoring standards, memory limits (512 MB per service), CPU allocation, resource request best practices.

### 3.12 Resource Optimization

*(Content to be consolidated from `deployment/RESOURCE-OPTIMIZATION-QUICK-REF.md` in Phase 2 Week 5)*

**Placeholder**: Resource optimization techniques, memory profiling, GC tuning, worker scaling.

---

## Section 4: Environment Management

### 4.1 Render Access

*(Content to be consolidated from `environment/render-access-configuration.md` in Phase 2 Week 5)*

**Placeholder**: Render access configuration, API key management, service discovery, environment variable setup.

### 4.2 Credentials Reference

*(Content to be consolidated from `environment/render-credentials-reference.md` in Phase 2 Week 5)*

**Placeholder**: Credentials reference guide, secret management, rotation procedures, security best practices.

---

## Section 5: Monitoring

### 5.1 Error Dashboard

*(Content to be consolidated from `error-system/error-dashboard-command.md` in Phase 2 Week 5)*

**Placeholder**: `/ops error` command documentation, error filtering, drill-down, reporting.

### 5.2 Service Health

**Placeholder**: Health check procedures, endpoint monitoring, uptime tracking, service dependencies.

*(To be created during Phase 2 consolidation — not in source file list)*

### 5.3 Performance Metrics

**Placeholder**: Performance monitoring, latency tracking, throughput measurement, bottleneck identification.

*(To be created during Phase 2 consolidation — not in source file list)*

### 5.4 Alerting

**Placeholder**: Alert configuration, notification channels (DripAlert system), escalation procedures, incident response.

*(To be created during Phase 2 consolidation — not in source file list)*

---

**Estimated Size**: ~2500 lines (after Phase 2 consolidation)  
**Source Files**: 30 documents consolidated  
**Last Updated**: 2025-11-16 (template created)  
**Status**: Template ready for Phase 2 Week 5 consolidation
