# ARCHITECTURE BIBLE
**Centralized System Architecture Documentation** | **Created: 2025-11-16** | **Status: TEMPLATE (Phase 1 Week 3)**

## Purpose
Single source of truth for Infinity Gauntlet architectural design, component relationships, safety guarantees, and technical decisions. Consolidates 37 source documents into unified reference.

---

## Table of Contents

### 1. System Overview
- High-level architecture snapshot
- Technology stack
- Service topology
- Design principles

### 2. Database Architecture
- **2.1 Overview** — Database system design
- **2.2 Replication** — Master-replica cascade (Phase 16)
- **2.3 URL Selection** — Connection string logic (CRITICAL)
- **2.4 Multi-Client Runtime** — `prisma`, `onPremiseDevPrisma`, `experimentPrisma`

### 3. Worker Architecture
- **3.1 Core Design** — Worker topology, scaling roadmap
- **3.2 State Visibility** — Cross-worker state management

### 4. Event Bus
- Pub-sub event system (Phase 2.4)
- Correlation tracking
- Backpressure management

### 5. Logging Architecture
- **5.1 Core Design** — Intelligent logging system
- **5.2 Buffer Design** — Log buffering strategy
- **5.3 AI Integration** — AI-readable logs
- **5.4 Scaling** — Log scaling techniques

### 6. Error System
- **6.1 Detection Architecture** — Error detection design
- **6.2 Guarantees** — Error detection guarantees
- **6.3 Tracker Integration** — ErrorTracker integration
- **6.4 Logger Integration** — Logger-error bridge
- **6.5 Logging Integration** — Error-logging pipeline

### 7. Security Bot
- **7.1 State Persistence** — 7-day state history, restart continuity
- **7.2 Restart DMs** — Restart notification format

### 8. Router System
- Meta-router design
- Router-of-routers architecture
- Routing discipline

### 9. Game Engine
- **9.1 PBSL Manifesto** — Deterministic battle system
- **9.2 Battle DM Flow** — Battle interaction patterns
- **9.3 Cache Safety** — Engine cache guarantees
- **9.4 DB Replication** — Engine DB architecture (Phases 17-22)
- **9.5 DB Persistence Roadmap** — sql.js → better-sqlite3 migration
- **9.6 Event Tracking** — Event schema design
- **9.7 Dex V2** — Dexpack v2 architecture

### 10. Discord Bot
- **10.1 Command Suite** — Discord command overview
- **10.2 AI DM Commands** — AI DM guidance
- **10.3 Admin Command Spec** — Admin command specification
- **10.4 Admin Docs Index** — Admin documentation navigation

### 11. Safety Guarantees
- Memory safety
- Error isolation
- State persistence
- Disaster recovery

### 12. Observability
- **12.1 Metrics** — Metrics transparency design
- **12.2 Calculation Methods** — Metrics calculation

### 13. Performance
- **13.1 Optimization Roadmap** — System-wide optimization plan
- **13.2 Centralization** — Centralized architecture analysis

### 14. Future Roadmap
- System evolution vision
- Planned improvements
- Research areas

---

## Navigation

### Referenced By
*(To be populated during Phase 1 consolidation)*

### Cross-References
- **OPERATIONS-BIBLE.md** § Database Operations — Operational procedures
- **DEVELOPMENT-BIBLE.md** § Local Setup — Development environment
- **Agents.md** — Operations guide
- **README.md** — Getting started

---

## Section 1: System Overview

*(Content to be consolidated from `architecture/architecture.md` in Phase 1 Week 3)*

**Placeholder**: High-level architecture snapshot, technology stack, service topology, design principles.

---

## Section 2: Database Architecture

### 2.1 Overview

*(Content to be consolidated from `database/database-systems.md` in Phase 1 Week 3)*

**Placeholder**: Database system design, schema architecture, migration strategy.

### 2.2 Replication

*(Content to be consolidated from `database/db-replication-architecture.md` in Phase 1 Week 3)*

**Placeholder**: Master-replica cascade (PROD → DEV → Local), version tracking, sync orchestration.

### 2.3 URL Selection

**See**: OPERATIONS-BIBLE.md § Database Operations → URL Selection (CRITICAL operational procedures)

### 2.4 Multi-Client Runtime

**See**: OPERATIONS-BIBLE.md § Database Operations → Connections (runtime client configuration)

---

## Section 3: Worker Architecture

### 3.1 Core Design

*(Content to be consolidated from `deployment/workers.md` in Phase 1 Week 3)*

**Placeholder**: Worker topology, Render service matrix, Phase 10+ scaling roadmap, cost optimization.

### 3.2 State Visibility

*(Content to be consolidated from `architecture/cross-worker-state-visibility.md` in Phase 1 Week 3)*

**Placeholder**: Cross-worker state management, shared cache, coordination patterns.

---

## Section 4: Event Bus

*(Content to be consolidated from `architecture/phase2-event-bus-design.md` in Phase 1 Week 3)*

**Placeholder**: Pub-sub event system (Phase 2.4), correlation tracking, pattern matching, backpressure management.

---

## Section 5: Logging Architecture

### 5.1 Core Design

*(Content to be consolidated from `architecture/intelligent-logging-system.md` in Phase 1 Week 3)*

**Placeholder**: Intelligent logging system design, log levels, categorization, output formatting.

### 5.2 Buffer Design

*(Content to be consolidated from `architecture/log-buffer.md` in Phase 1 Week 3)*

**Placeholder**: Log buffering strategy, deduplication, aggregation, flush intervals.

### 5.3 AI Integration

*(Content to be consolidated from `architecture/AI-LOG-SYSTEM.md` in Phase 1 Week 3)*

**Placeholder**: AI-readable log format, context preservation, debugging assistance.

### 5.4 Scaling

*(Content to be consolidated from `architecture/AI-LOG-SCALING.md` in Phase 1 Week 3)*

**Placeholder**: Log scaling techniques, memory management, retention policies.

---

## Section 6: Error System

### 6.1 Detection Architecture

*(Content to be consolidated from `error-system/error-detection-system.md` in Phase 1 Week 3)*

**Placeholder**: Error detection system design, classification, routing, telemetry.

### 6.2 Guarantees

*(Content to be consolidated from `error-system/error-detection-guarantees.md` in Phase 1 Week 3)*

**Placeholder**: Error detection guarantees, coverage, response times, recovery procedures.

### 6.3 Tracker Integration

*(Content to be consolidated from `error-system/error-tracker-integration.md` in Phase 1 Week 3)*

**Placeholder**: ErrorTracker integration, error aggregation, reporting.

### 6.4 Logger Integration

*(Content to be consolidated from `error-system/error-monitoring-logger-integration.md` in Phase 1 Week 3)*

**Placeholder**: Logger-error bridge, automatic error capture, context enrichment.

### 6.5 Logging Integration

*(Content to be consolidated from `architecture/error-logging-integration.md` in Phase 1 Week 3)*

**Placeholder**: Error-logging pipeline, structured error logs, correlation.

---

## Section 7: Security Bot

### 7.1 State Persistence

*(Content to be consolidated from `architecture/security-bot-state.md` in Phase 1 Week 3)*

**Placeholder**: 7-day state history, hourly snapshots, restart continuity, cumulative statistics.

### 7.2 Restart DMs

*(Content to be consolidated from `architecture/restart-dm-format.md` in Phase 1 Week 3)*

**Placeholder**: Restart notification format, operational summary, activity timeline.

---

## Section 8: Router System

*(Content to be consolidated from `architecture/meta-router.md` in Phase 1 Week 3)*

**Placeholder**: Meta-router design, router-of-routers architecture, routing discipline, navigation patterns.

---

## Section 9: Game Engine

### 9.1 PBSL Manifesto

*(Content to be consolidated from `game-engine/PBSL.md` in Phase 1 Week 3)*

**Placeholder**: Deterministic battle system, fixture generation, oracle testing, guarantees.

### 9.2 Battle DM Flow

*(Content to be consolidated from `game-engine/battle-dm-flow.md` in Phase 1 Week 3)*

**Placeholder**: Battle DM interaction patterns, button handlers, state transitions.

### 9.3 Cache Safety

*(Content to be consolidated from `game-engine/engine-cache-safety.md` in Phase 1 Week 3)*

**Placeholder**: Engine cache safety guarantees, defensive copies, corruption detection, integrity checks.

### 9.4 DB Replication

*(Content to be consolidated from `game-engine/engine-db-replication.md` in Phase 1 Week 3)*

**Placeholder**: Engine DB architecture (Phases 17-22), 3-tier caching (L1 → Read-DB → PROD), write buffering, background workers.

### 9.5 DB Persistence Roadmap

*(Content to be consolidated from `game-engine/engine-db-persistence-opportunities.md` in Phase 1 Week 3)*

**Placeholder**: sql.js → better-sqlite3 migration roadmap, 78% memory reduction, persistence benefits.

### 9.6 Event Tracking

*(Content to be consolidated from `game-engine/event-tracking-schema.md` in Phase 1 Week 3)*

**Placeholder**: Event tracking schema design, battle logs, move usage, anomaly detection.

### 9.7 Dex V2

*(Content to be consolidated from `architecture/dex-v2-design.md` in Phase 1 Week 3)*

**Placeholder**: Dexpack v2 architecture, performance optimizations, lookup patterns.

---

## Section 10: Discord Bot

### 10.1 Command Suite

*(Content to be consolidated from `DISCORD-COMMAND-SUITE.md` in Phase 1 Week 3)*

**Placeholder**: Discord command suite overview, command categories, usage patterns.

### 10.2 AI DM Commands

*(Content to be consolidated from `specs/AI DM COMMAND SUITE GUIDANCE.md` in Phase 1 Week 3)*

**Placeholder**: AI DM command guidance, automation patterns, error handling.

### 10.3 Admin Command Spec

*(Content to be consolidated from `specs/DM-ADMIN-COMMAND-SUITE-SPEC.md` in Phase 1 Week 3)*

**Placeholder**: Admin command specification, access control, validation.

### 10.4 Admin Docs Index

*(Content to be consolidated from `specs/DM-ADMIN-DOCS-INDEX.md` in Phase 1 Week 3)*

**Placeholder**: Admin documentation navigation, quick reference, troubleshooting.

---

## Section 11: Safety Guarantees

*(Content to be consolidated from `architecture/safety.md` in Phase 1 Week 3)*

**Placeholder**: Memory safety, error isolation, state persistence, disaster recovery, operational safeguards.

---

## Section 12: Observability

### 12.1 Metrics

*(Content to be consolidated from `architecture/metrics-transparency.md` in Phase 1 Week 3)*

**Placeholder**: Metrics transparency design, visibility principles, telemetry architecture.

### 12.2 Calculation Methods

*(Content to be consolidated from `metrics-calculation.md` in Phase 1 Week 3)*

**Placeholder**: Metrics calculation methods, formulas, aggregation strategies.

---

## Section 13: Performance

### 13.1 Optimization Roadmap

*(Content to be consolidated from `architecture/OPTIMIZATION-BIBLE.md` in Phase 1 Week 3)*

**Placeholder**: System-wide optimization plan, startup time, console logging, runtime weight, queries, cache.

### 13.2 Centralization

*(Content to be consolidated from `architecture/centralized-architecture-analysis.md` in Phase 1 Week 3)*

**Placeholder**: Centralized architecture analysis, code duplication elimination, shared utilities.

---

## Section 14: Future Roadmap

*(Content to be consolidated from `architecture/perfect-system-roadmap.md` in Phase 1 Week 3)*

**Placeholder**: System evolution vision, planned improvements, research areas, scalability targets.

---

**Estimated Size**: ~3000 lines (after Phase 1 consolidation)  
**Source Files**: 37 documents consolidated  
**Last Updated**: 2025-11-16 (template created)  
**Status**: Template ready for Phase 1 Week 3 consolidation
