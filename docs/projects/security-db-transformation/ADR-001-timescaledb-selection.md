# ADR-001: TimescaleDB Selection for Time-Series Security Data

## Status
**Accepted** — 2025-06-15

## Context

The Security-DB Transformation project requires a database solution optimized for:

1. **High-Volume Time-Series Data**: Security events (login attempts, permission changes, role modifications) generate thousands of records daily
2. **Real-Time Analytics**: Dashboard queries need sub-second response times for trend analysis
3. **Data Retention**: Automatic archival of old data with configurable retention policies
4. **Query Performance**: Complex aggregations over time ranges (hourly/daily/weekly metrics)
5. **PostgreSQL Compatibility**: Existing infrastructure uses PostgreSQL; migration should be seamless

### Requirements

| Requirement | Priority | Description |
|-------------|----------|-------------|
| Time-series optimization | P0 | Native support for time-based partitioning |
| Continuous aggregates | P0 | Pre-computed materialized views for dashboards |
| Compression | P1 | Reduce storage costs for historical data |
| PostgreSQL compatibility | P0 | Work with existing Prisma + PostgreSQL stack |
| Data retention | P1 | Automatic data expiration policies |
| Query performance | P0 | Sub-100ms for dashboard queries |

### Options Considered

#### Option 1: Pure PostgreSQL with Table Partitioning

**Pros:**
- No additional dependencies
- Full PostgreSQL feature set
- Native Prisma support

**Cons:**
- Manual partition management
- No built-in continuous aggregates
- Complex retention policy implementation
- Higher query latency for time-range scans

#### Option 2: InfluxDB

**Pros:**
- Purpose-built for time-series
- Excellent write performance
- Built-in retention policies

**Cons:**
- Requires separate database infrastructure
- No PostgreSQL compatibility
- Prisma doesn't support InfluxDB
- Additional operational complexity

#### Option 3: TimescaleDB Extension

**Pros:**
- PostgreSQL extension (no separate infrastructure)
- Full Prisma compatibility
- Continuous aggregates for pre-computed metrics
- Native compression (90%+ space savings)
- Automatic chunk management
- Built-in retention policies
- Sub-second queries for time-range data

**Cons:**
- Additional extension to manage
- Some advanced features require enterprise license
- Learning curve for hypertable concepts

## Decision

**We choose TimescaleDB** as the time-series solution for the Security-DB transformation.

### Rationale

1. **PostgreSQL Compatibility**: TimescaleDB is a PostgreSQL extension, meaning:
   - Existing Prisma schema works unchanged
   - All PostgreSQL tools and monitoring continue to work
   - No data migration between database systems

2. **Continuous Aggregates**: Critical for dashboard performance:
   ```sql
   -- Pre-computed hourly security event metrics
   CREATE MATERIALIZED VIEW security_metrics_hourly
   WITH (timescaledb.continuous) AS
   SELECT 
     time_bucket('1 hour', timestamp) AS bucket,
     event_type,
     COUNT(*) as event_count,
     COUNT(DISTINCT user_id) as unique_users
   FROM security_events
   GROUP BY bucket, event_type;
   ```

3. **Compression**: Reduces storage by 90%+ for historical data:
   ```sql
   ALTER TABLE security_events SET (
     timescaledb.compress,
     timescaledb.compress_segmentby = 'event_type'
   );
   ```

4. **Retention Policies**: Automatic data expiration:
   ```sql
   SELECT add_retention_policy('security_events', INTERVAL '90 days');
   ```

5. **Query Performance**: Benchmark results show 10-100x improvement for time-range queries compared to standard PostgreSQL tables.

## Consequences

### Positive

- **Performance**: Dashboard queries drop from seconds to milliseconds
- **Storage**: 90%+ compression for historical security data
- **Automation**: Built-in retention and compression policies
- **Compatibility**: Seamless integration with existing PostgreSQL infrastructure
- **Analytics**: Continuous aggregates enable real-time dashboards

### Negative

- **Complexity**: Team needs to learn hypertable concepts
- **Extension Management**: TimescaleDB extension must be installed and updated
- **Migration**: Existing tables need conversion to hypertables
- **Testing**: Test environment needs TimescaleDB extension

### Mitigation

| Risk | Mitigation |
|------|------------|
| Learning curve | Create comprehensive documentation and examples |
| Extension management | Use Render's managed PostgreSQL with TimescaleDB |
| Migration complexity | Create migration automation service (D11) |
| Testing gaps | Mock TimescaleDB functions in unit tests |

## Implementation Plan

1. **Phase 1**: Enable TimescaleDB extension on Render PostgreSQL
2. **Phase 2**: Convert security event tables to hypertables
3. **Phase 3**: Create continuous aggregates for dashboards
4. **Phase 4**: Enable compression for historical chunks
5. **Phase 5**: Configure retention policies

## References

- [TimescaleDB Documentation](https://docs.timescale.com/)
- [Continuous Aggregates Guide](https://docs.timescale.com/use-timescale/latest/continuous-aggregates/)
- [Compression Best Practices](https://docs.timescale.com/use-timescale/latest/compression/)
- [Render PostgreSQL + TimescaleDB](https://render.com/docs/databases)

## Related Documents

- `MASTER-PLAN.md` — Project scope and objectives
- `ADR-002-event-sourcing.md` — Event sourcing pattern decision
- `ADR-003-security-taxonomy.md` — Security event classification

---

**Author**: Architecture Specialist  
**Reviewers**: Database Specialist, AI Coding Specialist  
**Last Updated**: 2025-06-15
