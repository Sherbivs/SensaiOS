# ROUTER
Title: Architecture Documentation
Purpose: System architecture, operations, roadmap, and meta-routing guides.
Owned Globs: docs/architecture/**
Last Updated (UTC): 2025-11-10T00:00:00Z

Notes:
- Core architectural documentation including system design, operations procedures, safety protocols
- Meta-routing philosophy and agent guidance documentation
- Long-range roadmap and optimization strategies
- Observability and metrics documentation

Key Documents:
- **meta-router.md** - Routing philosophy, recovery loop, budget heuristics for agent runs
- **architecture.md** - High-level system architecture overview
- **OPERATIONS.md** - Day-to-day operational procedures and runbooks
- **safety.md** - Security posture, incident response, safe operations
- **dex-v2-design.md** - High-availability Pokédex upgrade blueprint
- **perfect-system-roadmap.md** - Long-range governance/automation roadmap
- **OPTIMIZATION-BIBLE.md** - Comprehensive system optimization strategies
- **log-buffer.md** - Intelligent log buffering and deduplication (10s intervals, aggregation)
- **security-bot-state.md** - Security bot operational state persistence (Store/security-bot-state/)
- **metrics-transparency.md** - System metrics and observability standards
- **restart-dm-format.md** - Restart notification formatting and content
- **cache-lru-optimization-summary.md** - LRU cache optimization implementation report (60% memory reduction)

**Centralized Architecture (Phase 1-2):**
- **centralized-architecture-analysis.md** - Comprehensive analysis of service/event/worker fragmentation (1,200+ lines) identifying 15 issues across 4 categories with detailed recommendations
- **phase1-service-registry-complete.md** - Service Registry implementation completion report (Layer 1, 680 lines implementation + 627 lines tests, 29/29 tests passing)
- **phase1-migration-complete.md** - Service factories migration completion report (4 services migrated: ResourceManager, ErrorTracker, EngineCache, EngineWriteBuffer)
- **phase2-event-bus-design.md** - Event Bus design document (Layer 2, 858 lines) defining unified event routing with correlation IDs, pattern subscriptions, replay buffers, backpressure control
- **phase2.1-event-bus-foundation-complete.md** - Event Bus foundation implementation completion report (574 lines implementation + 626 lines tests, 40/40 tests passing, 100% coverage)
- **phase2.2-errortracker-migration-plan.md** - ErrorTracker Event Bus migration implementation plan (468 lines) documenting 3-phase incremental rollout strategy
- **phase2.2-errortracker-migration-complete.md** - ErrorTracker Event Bus migration completion report (555 lines) documenting technical achievements (correlation tracking, event replay, backpressure, pattern subscriptions), performance metrics (<1ms emit latency), and zero-regression migration strategy

Cross-References:
- See docs/database/ for database architecture and replication
- See docs/error-system/ for error detection architecture
- See docs/game-engine/ for engine architecture
- See docs/deployment/ for infrastructure and worker architecture
