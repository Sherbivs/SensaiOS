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

Cross-References:
- See docs/database/ for database architecture and replication
- See docs/error-system/ for error detection architecture
- See docs/game-engine/ for engine architecture
- See docs/deployment/ for infrastructure and worker architecture
