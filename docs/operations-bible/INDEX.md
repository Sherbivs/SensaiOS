# OPERATIONS BIBLE — INDEX

**Centralized Operational Procedures Documentation**  
**Created**: 2025-11-16 | **Status**: Phase 1 Complete

---

## Purpose

Single source of truth for Infinity Gauntlet operational procedures, deployment workflows, database operations, environment management, and monitoring. Consolidates 30 source documents into unified runbook.

---

## Sections

1. **[Service Matrix](01-service-matrix.md)** — Render service topology, worker responsibilities, service dependencies, scaling roadmap
2. **[Database Operations](02-database-operations.md)** — **[CRITICAL]** URL selection, connections, naming, CLI tools, on-premise setup, optimization
3. **[Deployment Procedures](03-deployment-procedures.md)** — **[CRITICAL]** Path structure, service naming, API integration, SSH automation, disk resources
4. **[Environment Management](04-environment-management.md)** — Render access configuration, credentials reference, secret management
5. **[Monitoring](05-monitoring.md)** — Error dashboard, service health, performance metrics, alerting

---

## Quick Navigation

**CRITICAL Operations (Read First)**:
- **§ 2.1 Database URL Selection** — [ABSOLUTE] Connection string logic (production failures if violated)
- **§ 3.1 Render Path Structure** — [CRITICAL] Nested `/opt/render/project/src/src/` architecture

**Common Tasks**:
- Database CLI: § 2.6 (Control Suite)
- Deployment: § 3.2 (Service Naming), § 3.3 (API Integration)
- SSH Operations: § 3.7 (Automation), § 3.9 (Protocol)
- Error Monitoring: § 5.1 (Error Dashboard)

**Cross-References**:
- **[ARCHITECTURE-BIBLE](../architecture-bible/INDEX.md)** — System design, database architecture, worker architecture
- **[DEVELOPMENT-BIBLE](../DEVELOPMENT-BIBLE.md)** — Local setup, testing, debugging
- **[Agents.md](../../Agents.md)** — Agent operations guide
- **[README.md](../../README.md)** — Getting started

---

## Estimated Reading Time

- **Full Read**: ~25 minutes
- **CRITICAL Sections Only** (§ 2.1, § 3.1): 5 minutes
- **Quick Reference** (CLI commands, deployment): 10 minutes

---

**Last Updated**: 2025-11-16  
**Revision**: 1.0  
**Total Sections**: 5  
**Estimated Size**: ~2,500 lines consolidated from 30 source documents