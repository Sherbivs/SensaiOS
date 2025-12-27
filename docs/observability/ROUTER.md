# ROUTER

**Title:** Observability Documentation  
**Purpose:** Professional observability infrastructure documentation for production game monitoring  
**Owned Globs:** `docs/observability/**`  
**Last Updated (UTC):** 2025-12-28T00:00:00Z

## Notes

- Contains LogQL query library for troubleshooting and analysis
- Documents dashboard inventory and usage patterns
- Provides alert response procedures and runbooks
- Part of the comprehensive Bible documentation system

## Key Files

| File | Purpose |
|------|---------|
| INDEX.md | Master index with architecture overview, dashboard inventory, alert tiers |
| logql-queries.md | Comprehensive LogQL query library (100+ queries) |

## Integration Points

- **Dashboard Files:** `ops/grafana-*.json` — Grafana dashboard definitions
- **Alert Rules:** `ops/grafana-alert-rules-v2.yml` — Professional alert configuration
- **Datasources:** `ops/grafana-datasources.yml` — Loki + Prometheus configuration
- **Docker Stack:** `docker-compose.loki.yml` — Local observability infrastructure

## Cross-References

- **Operations Bible:** `docs/operations-bible/INDEX.md` — Service matrix, deployment
- **Architecture Bible:** `docs/architecture-bible/INDEX.md` — System design
- **Envelope System:** `src/observability/envelope/` — Logging infrastructure

## Query Categories

1. **Quick Reference** — Basic filters, time-based queries
2. **Error Investigation** — Error patterns, stack traces, aggregations
3. **Correlation Tracing** — Request tracing, duration analysis
4. **Performance Analysis** — Slow operations, cache performance, memory
5. **Service Health** — Heartbeats, status, circuit breakers
6. **Game Engine** — Battles, moves, encounters, homestead
7. **Security & Audit** — Permissions, admin commands, sweeps
8. **Aggregation Patterns** — Volume, distribution, percentiles
9. **Alert Templates** — Ready-to-use alert queries

## Dashboard Suite

| Dashboard | UID | Purpose |
|-----------|-----|---------|
| Main Operations | `infinity-gauntlet-main` | Primary system monitoring |
| Battle Engine | `infinity-gauntlet-battle` | Pokemon battle system |
| Cache Performance | `infinity-gauntlet-cache` | Cache and database metrics |
| Security Intelligence | `security-intelligence` | Security bot monitoring |
