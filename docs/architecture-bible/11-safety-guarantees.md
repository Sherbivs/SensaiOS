# Section 11: Safety Guarantees

**Last Updated**: 2025-12-27 | **Status**: Production

[← Back to INDEX](INDEX.md) | [← Previous: Discord Bot](10-discord-bot.md) | [Next: Observability →](12-observability.md)

---

**Philosophy**: "Safety is not a feature—it's a requirement. Every layer must fail gracefully."

**Purpose**: Comprehensive safety mechanisms ensuring data integrity, security, and operational continuity.

## 11.1 Core Guarantees

**Secret Protection**:
- ✅ Never commit secrets to Git (all secrets in external `secrets/` directory)
- ✅ Production ignores repo `.env` unless explicitly enabled (`IG_ALLOW_REPO_ENV=1`)
- ✅ Secrets loaded from single consolidated environment file (`IG_ENV_FILE`)
- ✅ Sensitive data redacted from logs (passwords, tokens, API keys)

**Database Safety**:
- ✅ Three Prisma clients: `prisma` (production), `onPremiseDevPrisma` (workstation), `onPremiseExperimentPrisma` (testing)
- ✅ Connection validation on startup (fail-fast if database unreachable)
- ✅ Heartbeat monitoring (30s intervals, configurable via `PRISMA_HEARTBEAT_INTERVAL_MS`)
- ✅ Write buffering prevents database overload (10k entry cap, 75% backpressure)
- ✅ Graceful degradation (read-only mode if write operations fail)

**Memory Safety**:
- ✅ Bounded data structures (all caches/queues have size limits)
- ✅ Discord.js cache sweeping (prevents 100+ MB leaks)
- ✅ L1 Cache bounded at 20 MB (lazy loading + feature flags)
- ✅ Write buffer bounded at 5 MB (10k entries max)
- ✅ Logger buffer bounded at 1 MB (200 entry cap)
- ✅ Peak RAM target: 300-600 MB per service (15-30% of 2 GB limit, Standard plan)

**Error Isolation**:
- ✅ Five-layer error detection (try-catch, wrappers, global handlers, Discord, Prisma)
- ✅ 100% error capture rate (zero false negatives policy)
- ✅ Domain-specific error handlers (bot, core, worker layers)
- ✅ ErrorTracker integrates with all layers
- ✅ Errors persisted to disk before propagation

**State Persistence**:
- ✅ Security bot state survives restarts (7-day rolling history)
- ✅ AI logs retained with 48h minimum (200 file buffer = 16+ days)
- ✅ Event tracking persisted across deployments
- ✅ Cache snapshots for point-in-time recovery
- ✅ Write buffer flushes before shutdown (graceful SIGTERM/SIGINT handling)

**Disaster Recovery**:
- ✅ State backups (`current.json`, `previous.json`, hourly snapshots)
- ✅ Corrupted state fallback (previous.json → snapshots → fresh init)
- ✅ Database migration checkpoints (rollback capability)
- ✅ Router system (AI agent recovery from stuckness)
- ✅ PBSL oracle testing (regression detection)

**Operational Safeguards**:
- ✅ Rate limiting (Discord API: 1s delay between DMs)
- ✅ Backpressure (write queues: 75% warn, 95% reject)
- ✅ Timeouts (database queries: 30s max, configurable)
- ✅ Circuit breakers (service health monitoring, auto-restart on failure)
- ✅ Startup validation (logger auto-refresh delayed until Service Registry init)

---

[← Back to INDEX](INDEX.md) | [← Previous: Discord Bot](10-discord-bot.md) | [Next: Observability →](12-observability.md)