# OPERATIONS BIBLE — INDEX

**Centralized Operational Procedures Documentation**  
**Created**: 2025-11-16 | **Status**: Production Ready | **Prisma**: 7.1.0

---

## Purpose

Single source of truth for Infinity Gauntlet operational procedures, deployment workflows, database operations, environment management, and monitoring. Consolidates 30+ source documents into unified runbook.

---

## Core Sections (01-13)

1. **[Service Matrix](01-service-matrix.md)** — Render service topology, worker responsibilities, service dependencies, scaling roadmap
2. **[Database Operations](02-database-operations.md)** — **[CRITICAL]** URL selection, connections, naming, CLI tools, on-premise setup, optimization, **Prisma 7 configuration**
3. **[Deployment Procedures](03-deployment-procedures.md)** — **[CRITICAL]** Path structure, service naming, API integration, SSH automation, disk resources
4. **[Environment Management](04-environment-management.md)** — Render access configuration, credentials reference, secret management
5. **[Monitoring](05-monitoring.md)** — Error dashboard, service health, performance metrics, alerting
6. **[Optimization History](06-optimization-history.md)** — Repository modernization, Phase 9 optimization, database naming migration, Accelerate elimination
7. **[Scheduled Restart](07-scheduled-restart.md)** — GitHub Actions workflow, graceful shutdown, memory hygiene automation
8. **[Recovery Runbook](08-recovery-runbook.md)** — Incident response procedures, rollback workflows, emergency protocols
9. **[Discord Cache](09-discord-cache.md)** — Cache configuration, sweep intervals, memory management for Discord.js
10. **[Database Audit](10-database-audit.md)** — Schema auditing procedures, database health checks, replication monitoring
11. **[Logging Storage](11-logging-storage.md)** — Log buffer configuration, storage limits, rotation policies
12. **[Analytics Queries](12-analytics-queries.md)** — Common database queries, performance analytics, monitoring queries
13. **[Memory Management](13-memory-management.md)** — **[CRITICAL]** Memory safety audit, bounded data structures, resource limits

---

## Comprehensive Guides (AUTHORITATIVE)

These guides provide in-depth coverage of complex topics:

- **[Worker Troubleshooting](worker-troubleshooting-comprehensive.md)** — 22 pages, ALL failure scenarios, recovery procedures
- **[Database Operations Runbook](database-operations-runbook-comprehensive.md)** — 25 pages, master-mirror-staging pipeline, live game requirements
- **[/ops Commands Reference](ops-commands-reference-comprehensive.md)** — 28 pages, complete reference for all 9 administrative commands
- **[Loki Query Suite](loki-query-suite.md)** — 📊 Comprehensive LogQL queries for production monitoring
- **[Incident Response Playbook](incident-response-playbook.md)** — Emergency protocols, escalation procedures
- **[Query Optimization Guide](query-optimization-guide.md)** — Database query tuning, index optimization
- **[Connection Troubleshooting](connection-troubleshooting.md)** — Database connection diagnostics

---

## Homestead Operations

Homestead channel deployment and troubleshooting guides:

- **[Homestead Deployment Checklist](homestead-deployment-checklist.md)** — Pre-deployment validation, channel creation, permission setup
- **[Homestead Troubleshooting](homestead-troubleshooting.md)** — Common issues, permission debugging, channel recovery
- **[Homestead Verification Flow](homestead-verification-flow.md)** — Post-deployment validation, health checks

---

## Quick Navigation

### 🚨 NO-RESTART POLICY (ABSOLUTE)
**NEVER restart, stop, redeploy, or take any service offline without EXPLICIT operator permission.**
- Always ASK FIRST before any service disruption
- Wait for manual verification from the operator
- The operator needs time to manually check service state before anything goes offline

### Production Log Observability (Loki)
**Canonical method to check production logs:** Local Loki service (localhost:3100)

**Quick Access via CLI:**
```powershell
.\scripts\loki-query.ps1 stats        # Log statistics by level
.\scripts\loki-query.ps1 errors       # All errors
.\scripts\loki-query.ps1 sweeps       # Security bot activity
.\scripts\loki-query.ps1 labels       # Available labels
.\scripts\loki-query.ps1 help         # Full command reference
```

**Complete Query Suite:** [docs/operations-bible/loki-query-suite.md](loki-query-suite.md)

**Grafana UI:** http://localhost:3000/explore → Query: `{service="stats-logger"}`
**Architecture:** Render → ngrok tunnel → localhost:3100 (Loki) → Grafana

**CRITICAL Operations (Read First)**:
- **§ 2.1 Database URL Selection** — [ABSOLUTE] Connection string logic (production failures if violated)
- **§ 2.7 Prisma 7 Configuration** — [CRITICAL] `engineType = "library"` required for direct PostgreSQL
- **§ 3.1 Render Path Structure** — [CRITICAL] Nested `/opt/render/project/src/src/` architecture
- **§ 13 Memory Management** — [CRITICAL] Bounded data structures, resource limits

**Common Tasks**:
- Database CLI: § 2.6 (Control Suite)
- Deployment: § 3.2 (Service Naming), § 3.3 (API Integration)
- SSH Operations: § 3.7 (Automation), § 3.9 (Protocol)
- Error Monitoring: § 5.1 (Error Dashboard)
- Memory Issues: § 13 (Memory Management), Discord Cache (§ 9)

**Cross-References**:
- **[ARCHITECTURE-BIBLE](../architecture-bible/INDEX.md)** — System design, database architecture, worker architecture
- **[DEVELOPMENT-BIBLE](../development-bible/INDEX.md)** — Local setup, testing, debugging
- **[Agents.md](../../Agents.md)** — Agent operations guide
- **[README.md](../../README.md)** — Getting started

---

## Estimated Reading Time

- **Full Read**: ~45 minutes (all 13 sections + comprehensive guides)
- **CRITICAL Sections Only** (§ 2.1, § 2.7, § 3.1, § 13): 10 minutes
- **Quick Reference** (CLI commands, deployment): 15 minutes
- **Comprehensive Guides**: ~2 hours (worker troubleshooting, database runbook, ops commands)

---

**Last Updated**: 2025-12-20  
**Revision**: 2.1 (December 2025 — Added NO-RESTART policy and Loki observability)  
**Total Sections**: 13 core + 9 specialized guides  
**Estimated Size**: ~5,000 lines consolidated from 30+ source documents