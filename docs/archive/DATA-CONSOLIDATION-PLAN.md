# Data Consolidation Plan
**Status:** DRAFT - Awaiting Approval  
**Created:** 2025-12-01  
**Team:** Data Architect, Database Specialist, Data Analyst, Backend Dev, DevOps, Documentation Specialist

---

## Executive Summary

**Goal:** Consolidate fragmented data (logs, events, metrics) into queryable databases for analytics, monitoring, and business intelligence.

**Current State:**
- ✅ **PostgreSQL:** 590-line Prisma schema (20+ tables) - game + player data
- ✅ **File Logs:** 83 MB in `/Store/logs/` (JSON Lines format)
- ✅ **Event Bus:** In-memory real-time routing (100-event replay buffer)
- ✅ **Security State:** 8.2 MB JSON snapshots (7-day retention)
- ✅ **Engine DB:** 56 KB SQLite battle logs

**Problem:** Can't easily answer questions like:
- "Which Pokemon won the most battles this month?"
- "What errors spiked between 2-4 PM yesterday?"
- "Which users are most active by hour of day?"

---

## Phase 1: Assessment (Week 1-2)

### Data Architect Tasks
- [ ] Upgrade to Prisma 7 before we begin
- [ ] Audit all 15+ data sources (see Data Sources Inventory below)
- [ ] Design unified schema (logs + events + metrics → queryable tables)
- [ ] Choose technology: **TimescaleDB (PostgreSQL extension)** [RECOMMENDED]
- [ ] Define data flow: Event Bus → PostgreSQL batch insert every 5 min

### Database Specialist Tasks
- [ ] Evaluate current Prisma schema health ✅ (Already excellent)
- [ ] Design `log_entries` hypertable (timestamp, level, category, message, metadata JSONB)
- [ ] Design `event_history` hypertable (correlation_id, topic, payload, timestamp)
- [ ] Plan indexes for common analytics queries
- [ ] Define retention policies (30d logs, 90d events, infinite audit logs)

### Data Analyst Tasks
- [ ] Interview stakeholders (What questions need answering?)
- [ ] Define 10 key business metrics:
  1. Daily Active Users (DAU)
  2. Battle win rate by Pokemon species
  3. Most popular moves/abilities
  4. User retention (7d, 30d)
  5. Error rates by category
  6. Average battle duration
  7. Peak usage hours
  8. Encounter catch rates
  9. Security alert frequency
  10. System performance (latency, uptime)
- [ ] Create sample queries for validation
- [ ] Design dashboard mockups (Grafana/Metabase)

---

## Phase 2: Proof of Concept (Week 3)

### Backend Developer Tasks
- [ ] Install TimescaleDB extension on PostgreSQL
  ```sql
  CREATE EXTENSION IF NOT EXISTS timescaledb;
  ```
- [ ] Create `log_entries` hypertable
  ```sql
  CREATE TABLE log_entries (
    id BIGSERIAL,
    timestamp TIMESTAMPTZ NOT NULL,
    level TEXT NOT NULL,
    category TEXT NOT NULL,
    message TEXT,
    metadata JSONB,
    correlation_id UUID,
    service_name TEXT,
    PRIMARY KEY (id, timestamp)
  );
  
  SELECT create_hypertable('log_entries', 'timestamp');
  SELECT add_retention_policy('log_entries', INTERVAL '30 days');
  ```
- [ ] Create Event Bus → Database pipeline
  ```typescript
  // src/services/log-ingestion-worker.ts
  import { EventBus } from '../shared/event-bus.js';
  import { prisma } from '../shared/prisma.js';
  
  const bus = EventBus.getInstance();
  const logBuffer: LogEntry[] = [];
  
  bus.subscribe('log.**', async (event) => {
    logBuffer.push({
      timestamp: event.timestamp,
      level: event.topic.split('.')[1],
      category: event.payload.category,
      message: event.payload.message,
      metadata: event.payload.data,
      correlationId: event.correlationId,
      serviceName: event.emitter
    });
    
    // Batch insert every 100 logs or 5 minutes
    if (logBuffer.length >= 100) {
      await flushLogsToDatabase();
    }
  });
  
  setInterval(flushLogsToDatabase, 5 * 60 * 1000); // 5 min
  ```
- [ ] Test with 1 week of historical logs (migrate from `/Store/logs/`)

### DevOps Tasks
- [ ] Backup current PostgreSQL database before adding TimescaleDB
- [ ] Monitor disk space impact (estimate: +50 MB/week for logs)
- [ ] Set up automated retention policy execution
- [ ] Create Grafana dashboard for log volume monitoring

---

## Phase 3: Migration (Week 4-5)

### Backend Developer Tasks
- [ ] Migrate all log sources to database ingestion:
  - [x] Intelligent Logger → Event Bus (DONE)
  - [ ] Event Bus → PostgreSQL (NEW)
  - [ ] Security Bot State → `security_events` table
  - [ ] Engine Write DB → `battle_analytics` table
  - [ ] Error Tracker → `error_logs` table
- [ ] Create Prisma schema extensions:
  ```prisma
  model LogEntry {
    id            BigInt   @id @default(autoincrement())
    timestamp     DateTime
    level         String
    category      String
    message       String?
    metadata      Json?
    correlationId String?  @db.Uuid
    serviceName   String?
    
    @@index([timestamp])
    @@index([level])
    @@index([category])
    @@index([correlationId])
  }
  
  model EventHistory {
    id                  BigInt   @id @default(autoincrement())
    timestamp           DateTime
    topic               String
    payload             Json
    correlationId       String   @db.Uuid
    parentCorrelationId String?  @db.Uuid
    emitter             String?
    
    @@index([timestamp])
    @@index([topic])
    @@index([correlationId])
  }
  ```
- [ ] Build data backfill script for historical logs (last 30 days)
- [ ] Validate data integrity (compare file counts vs database counts)

### Database Specialist Tasks
- [ ] Optimize indexes based on actual query patterns
- [ ] Set up continuous aggregates (hourly/daily rollups):
  ```sql
  CREATE MATERIALIZED VIEW logs_hourly
  WITH (timescaledb.continuous) AS
  SELECT 
    time_bucket('1 hour', timestamp) AS hour,
    level,
    category,
    COUNT(*) as count,
    COUNT(DISTINCT correlation_id) as unique_requests
  FROM log_entries
  GROUP BY hour, level, category;
  ```
- [ ] Monitor query performance (add indexes as needed)
- [ ] Document common query patterns

---

## Phase 4: Analytics & Dashboards (Week 6)

### Data Analyst Tasks
- [ ] Build Grafana dashboards:
  1. **System Health:** Error rates, latency, uptime
  2. **User Activity:** DAU, peak hours, retention
  3. **Game Metrics:** Battle stats, Pokemon popularity, catch rates
  4. **Security:** Alert frequency, permission changes, anomalies
- [ ] Create SQL query library:
  ```sql
  -- Top 10 most used Pokemon in battles (last 30 days)
  SELECT 
    pi."speciesId",
    s.name,
    COUNT(*) as battle_count
  FROM "Battle" b
  JOIN "PokemonInstance" pi ON pi."trainerId" = b."trainer1Id"
  JOIN "Species" s ON s.id = pi."speciesId"
  WHERE b."createdAt" >= NOW() - INTERVAL '30 days'
  GROUP BY pi."speciesId", s.name
  ORDER BY battle_count DESC
  LIMIT 10;
  
  -- Error rate by hour of day
  SELECT 
    EXTRACT(HOUR FROM timestamp) as hour_of_day,
    COUNT(*) as error_count,
    COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentage
  FROM log_entries
  WHERE level = 'error'
    AND timestamp >= NOW() - INTERVAL '7 days'
  GROUP BY hour_of_day
  ORDER BY hour_of_day;
  ```
- [ ] Train team on dashboard usage
- [ ] Document insights and anomalies discovered

### Documentation Specialist Tasks
- [ ] Update `docs/operations-bible/database-operations-runbook-comprehensive.md` § 4 (Schema Architecture) with new tables (25 pages total)
- [ ] Create `operations-bible/12-analytics-queries.md` with query cookbook
- [ ] Document dashboard usage in runbooks
- [ ] Update architecture diagrams with data flow

---

## Phase 5: Production Rollout (Week 7-8)

### DevOps Tasks
- [ ] Deploy log ingestion worker to Render
  ```yaml
  # render.yaml
  - type: worker
    name: infinity-gauntlet-log-ingestion
    env: node
    buildCommand: npm run build
    startCommand: node dist/workers/log-ingestion.js
    envVars:
      - key: PROD_DATABASE_URL
        fromDatabase: infinity-gauntlet-db
  ```
- [ ] Monitor CPU/RAM impact (<5% increase expected)
- [ ] Set up alerts for pipeline failures
- [ ] Schedule weekly database VACUUM (TimescaleDB maintenance)

### Backend Developer Tasks
- [ ] Graceful degradation: If database down, fall back to file logs
- [ ] Implement circuit breaker for database writes
- [ ] Add metrics: logs_ingested_total, ingestion_errors_total
- [ ] Performance tuning (batch size, flush interval)

### Data Architect Tasks
- [ ] Final validation: Compare file-based vs database metrics
- [ ] Sign-off on production readiness
- [ ] Plan future enhancements (ML anomaly detection, predictive analytics)

---

## Data Sources Inventory

### Currently Active (To Be Migrated)
1. **Intelligent Logger** (`src/utils/intelligent-logger.ts`)
   - Format: JSON Lines
   - Volume: ~1000/day
   - Path: `/Store/logs/hourly/*.jsonl`
   - Retention: 7 days

2. **Security Bot State** (`Store/security-bot-state/`)
   - Format: JSON snapshots
   - Volume: 8.2 MB
   - Includes: Role changes, sweeps, alerts
   - Retention: 7 days

3. **Engine Write DB** (`Store/engine-write.db`)
   - Format: SQLite
   - Size: 56 KB
   - Tables: battle_logs, move_usage, anomalies
   - Retention: 24 hours after upload

4. **Event Bus** (In-Memory)
   - Format: JavaScript objects
   - Buffer: 100 most recent events
   - Ephemeral (lost on restart)

5. **Error Tracker** (`src/services/error-tracker.ts`)
   - Format: In-memory queue → periodic flush
   - Volume: ~100/day
   - Retention: Until flushed

6. **Discord Cache** (`Store/discord-cache/`)
   - Format: JSON files
   - Purpose: Guild/role/member caching
   - Retention: 1 hour TTL

7. **Heap Snapshots** (`Store/*.heapsnapshot`)
   - Format: V8 heap dump
   - Size: 75 MB (3 files)
   - Purpose: Memory profiling (not logs)

### PostgreSQL Tables (Already In Database)
8. **BusMessage** (Event bus persistence)
9. **AuditLog** (Database change tracking)
10. **Battle** (Game battles)
11. **Encounter** (Wild Pokemon encounters)
12. **User** (Player accounts)
13. **Trainer** (Player profiles)
14. **PokemonInstance** (Individual Pokemon)

---

## Success Metrics

### Technical Metrics
- [ ] **Ingestion Latency:** <5 seconds from event → database
- [ ] **Query Performance:** <1 second for common analytics queries
- [ ] **Data Completeness:** 99.9% of logs successfully ingested
- [ ] **Retention Compliance:** Automated cleanup working (no manual intervention)
- [ ] **Disk Usage:** <500 MB additional space for 90 days of data

### Business Metrics
- [ ] **Insight Generation:** 10+ actionable insights from dashboards (first month)
- [ ] **Query Adoption:** Team runs 50+ analytics queries/week
- [ ] **Incident Response:** 50% faster debugging with log correlation
- [ ] **Data-Driven Decisions:** 3+ product changes based on analytics

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **PostgreSQL disk full** | High | Automated retention policies + monitoring alerts at 80% |
| **Ingestion worker crashes** | Medium | Graceful fallback to file logs, automatic restart on Render |
| **Query performance degradation** | Medium | Continuous aggregates for hourly/daily rollups, proper indexing |
| **Data loss during migration** | High | Full backup before changes, parallel run (files + DB) for 1 week |
| **Team unfamiliar with TimescaleDB** | Low | Training session, comprehensive documentation, example queries |

---

## Budget Estimate (Time)

| Phase | Duration | Team Size | Total Hours |
|-------|----------|-----------|-------------|
| Assessment | 2 weeks | 3 specialists | 240 hours |
| Proof of Concept | 1 week | 2 developers | 80 hours |
| Migration | 2 weeks | 2 developers | 160 hours |
| Analytics & Dashboards | 1 week | 2 analysts | 80 hours |
| Production Rollout | 2 weeks | 2 devops | 160 hours |
| **TOTAL** | **8 weeks** | **6 specialists** | **720 hours** |

**Cost Estimate:** $50-150k depending on team seniority and location.

---

## Next Steps

1. **Stakeholder Approval:** Present this plan to decision-makers
2. **Team Assembly:** Hire/assign the 6 specialists
3. **Kickoff Meeting:** Week of Dec 9, 2025
4. **Proof of Concept:** Complete by Dec 20, 2025
5. **Full Rollout:** Target Jan 31, 2026

---

## References

- [Existing Database Schema](../prisma/schema.prisma)
- [Operations Bible - Database Operations](docs/operations-bible/database-operations-runbook-comprehensive.md) — 25 pages comprehensive guide
- [Architecture Bible - Event Bus](architecture-bible/04-event-bus.md)
- [Logging Storage Audit](operations-bible/11-logging-storage.md)
- [TimescaleDB Documentation](https://docs.timescale.com/)

---

**Status:** DRAFT - Pending Team Review  
**Next Review:** 2025-12-08  
**Owner:** Data Architect (TBD)
