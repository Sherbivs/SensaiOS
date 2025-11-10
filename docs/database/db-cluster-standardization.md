# Database Cluster Standardization Project

**Status**: PLANNING  
**Created**: 2025-11-07  
**Owner**: Infrastructure Team  
**Priority**: HIGH

## Executive Summary

Standardize and normalize the current 2-node database cluster architecture to create a consistent, scalable foundation for future expansion to multi-node clusters, read replicas, and specialized database nodes.

## Current State Assessment

### Architecture Overview
```
DEV (Master) ─────────────> PROD (Local)
Render PostgreSQL          Render Node (/Store/db/)
External Access            127.0.0.1:55433
```

### Inconsistencies Identified

1. **Environment Variable Naming**
   - Mix of `PROD_DATABASE_URL`, `DEV_DATABASE_URL`, `DATABASE_URL`
   - Legacy variables: `RENDER_DB_EXTERNAL_URL`, `RENDER_DB_INTERNAL_URL`, `DATABASE_LOCAL_URL`
   - No clear naming convention for future nodes

2. **URL Selection Logic**
   - Complex candidate system with 8+ fallbacks in `src/shared/config.ts`
   - Different logic for production vs development
   - Preference system stored in `~/.infinity-gauntlet/db-connection.json`

3. **Prisma Client Initialization**
   - Single client (`prisma`) in `src/shared/prisma.ts`
   - No multi-client support for simultaneous connections
   - Hard-coded to use `DATABASE_URL` environment variable

4. **Replication Architecture**
   - Manual sync via `scripts/dev_prod_auto_sync.ts`
   - No automatic failover
   - No health monitoring or automatic recovery

5. **Migration Strategy**
   - Migrations run against DEV (master) only
   - Manual replication to PROD via auto-sync
   - No rollback strategy for failed migrations

6. **Connection Pooling**
   - No centralized pool management
   - Each service creates independent connections
   - No connection limits or backpressure handling

## Target State

### Standardized Architecture

```
                    ┌─────────────────────────────────────┐
                    │   DATABASE CLUSTER COORDINATOR      │
                    │   (src/services/db-coordinator/)    │
                    └─────────────┬───────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
┌───────▼────────┐       ┌───────▼────────┐       ┌───────▼────────┐
│  MASTER (M1)   │       │  PROD (P1)     │       │  REPLICA (R1)  │
│  Render PG     │───────>  Render Node   │───────>  (Future)      │
│  Write/Read    │       │  Read Primary  │       │  Read Only     │
└────────────────┘       └────────────────┘       └────────────────┘
```

### Naming Convention Standard

**Format**: `{ROLE}_{INSTANCE}_{PURPOSE}_URL`

**Roles**:
- `MASTER` - Source of truth, accepts writes
- `PROD` - Production runtime, read-heavy
- `REPLICA` - Read replica, read-only
- `WORKER` - Background job processor
- `ANALYTICS` - Analytics/reporting database
- `STAGING` - Staging environment

**Instances**: `1`, `2`, `3`, etc. (for horizontal scaling)

**Purpose**: `DATABASE` (default), `DIRECT`, `POOL`, `INTERNAL`, `EXTERNAL`

**Examples**:
```bash
# Master database (current DEV_DATABASE_URL)
MASTER_1_DATABASE_URL=postgresql://...@dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com/infinity_gauntlet_db
MASTER_1_INTERNAL_URL=postgresql://...@dpg-d3vd8h7diees73et3i3g-a/infinity_gauntlet_db

# Production database (current PROD_DATABASE_URL)
PROD_1_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db

# Future expansion
REPLICA_1_DATABASE_URL=postgresql://...@replica-1.virginia-postgres.render.com/infinity_gauntlet_db
WORKER_1_DATABASE_URL=postgresql://...@worker-1.virginia-postgres.render.com/infinity_gauntlet_db
ANALYTICS_1_DATABASE_URL=postgresql://...@analytics.virginia-postgres.render.com/infinity_gauntlet_db
```

### Configuration Schema

**New file**: `src/config/db-cluster.config.ts`

```typescript
export type NodeRole = 'MASTER' | 'PROD' | 'REPLICA' | 'WORKER' | 'ANALYTICS' | 'STAGING';
export type NodePurpose = 'READ_WRITE' | 'READ_ONLY' | 'WRITE_ONLY' | 'ANALYTICS';
export type NodeHealth = 'HEALTHY' | 'DEGRADED' | 'OFFLINE';

export interface DatabaseNode {
  id: string;                    // e.g., "MASTER_1", "PROD_1"
  role: NodeRole;
  instance: number;
  url: string;
  purpose: NodePurpose;
  priority: number;              // Lower = higher priority
  healthCheckInterval: number;   // ms
  maxRetries: number;
  timeout: number;               // ms
  poolSize: {
    min: number;
    max: number;
  };
  capabilities: {
    canWrite: boolean;
    canRead: boolean;
    canMigrate: boolean;
    canReplicate: boolean;
  };
}

export interface ClusterConfig {
  nodes: DatabaseNode[];
  replication: {
    strategy: 'MASTER_SLAVE' | 'MULTI_MASTER' | 'PEER_TO_PEER';
    interval: number;            // ms
    batchSize: number;
    enabled: boolean;
  };
  failover: {
    enabled: boolean;
    automatic: boolean;
    healthCheckInterval: number;  // ms
    failureThreshold: number;
    recoveryWaitTime: number;     // ms
  };
  loadBalancing: {
    strategy: 'ROUND_ROBIN' | 'LEAST_CONNECTIONS' | 'WEIGHTED';
    enabled: boolean;
  };
}
```

### Migration to Standardized Names

**Phase 1: Backwards Compatibility Layer** (Week 1)
- Create alias mapping in `src/shared/config.ts`
- Map old names to new names transparently
- Log deprecation warnings for legacy variables

```typescript
const LEGACY_MAPPINGS = {
  'DEV_DATABASE_URL': 'MASTER_1_DATABASE_URL',
  'PROD_DATABASE_URL': 'PROD_1_DATABASE_URL',
  'RENDER_DB_EXTERNAL_URL': 'MASTER_1_EXTERNAL_URL',
  'RENDER_DB_INTERNAL_URL': 'MASTER_1_INTERNAL_URL',
  'DATABASE_LOCAL_URL': 'PROD_1_DATABASE_URL',
};
```

**Phase 2: Parallel Running** (Week 2-3)
- Set both old and new environment variables
- Update all scripts to use new names
- Update documentation
- Keep legacy mappings active

**Phase 3: Deprecation** (Week 4)
- Remove legacy mappings
- Fail startup if old variables detected
- Provide migration guide

**Phase 4: Cleanup** (Week 5)
- Remove all legacy code paths
- Archive old documentation

## Project Phases

### Phase 1: Foundation (Week 1-2)

#### Task 1.1: Create Database Cluster Coordinator
**File**: `src/services/db-coordinator/coordinator.ts`
- Centralized connection management
- Health monitoring
- Automatic failover
- Load balancing

**File**: `src/services/db-coordinator/node-manager.ts`
- Node registration
- Connection pooling per node
- Health checks
- Metrics collection

**File**: `src/services/db-coordinator/replication-manager.ts`
- Replication orchestration
- Sync status tracking
- Conflict resolution
- Delta sync optimization

#### Task 1.2: Standardize Environment Variables
**Update**: `secrets/Infinity-Gauntlet.env`
- Add all new standardized variable names
- Keep legacy variables during transition
- Add comments explaining mapping

**Update**: `render.yaml`
- Update all 5 services to use new variable names
- Add new variables to envVars sections
- Keep legacy variables for backwards compatibility

#### Task 1.3: Create Configuration Schema
**File**: `src/config/db-cluster.config.ts`
- Define TypeScript interfaces
- Create default configurations
- Environment-specific overrides (dev, staging, prod)

**File**: `src/config/db-cluster.validator.ts`
- Validate configuration at startup
- Check for required variables
- Verify URL formats
- Test connectivity before boot

### Phase 2: Migration Layer (Week 2-3)

#### Task 2.1: Backwards Compatibility Adapter
**File**: `src/shared/legacy-db-adapter.ts`
- Map old variable names to new names
- Log deprecation warnings
- Provide migration hints

**Update**: `src/shared/config.ts`
- Integrate legacy adapter
- Maintain existing behavior
- Add deprecation timeline

#### Task 2.2: Multi-Client Support
**Update**: `src/shared/prisma.ts`
- Support multiple Prisma clients
- Named client registry (master, prod, replica1, etc.)
- Automatic client creation from cluster config
- Health monitoring per client

**Example Usage**:
```typescript
import { getClient, getAllClients } from '../shared/prisma.js';

// Get specific client
const masterClient = await getClient('MASTER_1');
const prodClient = await getClient('PROD_1');

// Write to master
await masterClient.user.create({ data: { ... } });

// Read from prod (low latency)
const users = await prodClient.user.findMany();

// Get all healthy clients for load balancing
const readClients = await getAllClients({ capability: 'READ', healthyOnly: true });
```

#### Task 2.3: Update All Scripts
**Files to Update**:
- `scripts/dev_prod_auto_sync.ts` → Use coordinator for replication
- `scripts/db_admin.ts` → Support multi-node operations
- `scripts/db_smoke.ts` → Test all nodes
- `scripts/db_mirror_checks.ts` → Monitor all nodes
- `scripts/bootstrap_prod_node.sh` → Register with coordinator

### Phase 3: Advanced Features (Week 3-4)

#### Task 3.1: Health Monitoring System
**File**: `src/services/db-coordinator/health-monitor.ts`
- Periodic health checks (every 30s)
- Latency tracking
- Connection pool metrics
- Automatic node marking (HEALTHY/DEGRADED/OFFLINE)

**File**: `src/services/db-coordinator/metrics-collector.ts`
- Query latency by node
- Connection pool utilization
- Replication lag
- Error rates

#### Task 3.2: Automatic Failover
**File**: `src/services/db-coordinator/failover-manager.ts`
- Detect node failures (3 consecutive health check failures)
- Automatic promotion of replicas
- Connection rerouting
- Recovery monitoring

**File**: `src/services/db-coordinator/recovery-manager.ts`
- Automatic node recovery attempts
- Backoff strategy for retries
- Health verification before reintegration

#### Task 3.3: Load Balancing
**File**: `src/services/db-coordinator/load-balancer.ts`
- Round-robin for read queries
- Weighted routing based on health
- Sticky sessions for transactions
- Circuit breaker for failing nodes

### Phase 4: Future Expansion Ready (Week 4-5)

#### Task 4.1: Read Replica Support
**Configuration**:
```typescript
// Add to cluster config
{
  id: 'REPLICA_1',
  role: 'REPLICA',
  instance: 1,
  url: process.env.REPLICA_1_DATABASE_URL,
  purpose: 'READ_ONLY',
  priority: 10,
  capabilities: {
    canWrite: false,
    canRead: true,
    canMigrate: false,
    canReplicate: false,
  }
}
```

**Automatic Setup**:
- Coordinator detects `REPLICA_N_DATABASE_URL` variables
- Registers replica automatically
- Adds to read query pool
- Monitors replication lag

#### Task 4.2: Analytics Database
**Purpose**: Separate database for heavy analytics queries
**Configuration**:
```typescript
{
  id: 'ANALYTICS_1',
  role: 'ANALYTICS',
  purpose: 'READ_ONLY',
  // Longer timeout for heavy queries
  timeout: 300000, // 5 minutes
}
```

**Usage**:
```typescript
import { getClient } from '../shared/prisma.js';

// Heavy analytics query on dedicated node
const analyticsClient = await getClient('ANALYTICS_1');
const report = await analyticsClient.$queryRaw`
  SELECT ... FROM ... -- Complex aggregation
`;
```

#### Task 4.3: Worker Database
**Purpose**: Dedicated database for background workers
**Benefits**:
- Isolate heavy background jobs
- Prevent impacting user-facing queries
- Independent scaling

**Configuration**:
```typescript
{
  id: 'WORKER_1',
  role: 'WORKER',
  purpose: 'READ_WRITE',
  poolSize: { min: 2, max: 10 }, // Higher pool for parallel jobs
}
```

#### Task 4.4: Staging Environment
**Configuration**:
```typescript
{
  id: 'STAGING_1',
  role: 'STAGING',
  purpose: 'READ_WRITE',
  // Staging-specific settings
}
```

## Migration Checklist

### Pre-Migration
- [ ] Review current architecture documentation
- [ ] Audit all database connection code
- [ ] Document all environment variables currently in use
- [ ] Create backup of current configuration
- [ ] Set up monitoring for migration process

### Phase 1: Foundation
- [ ] Create `src/services/db-coordinator/` directory structure
- [ ] Implement `coordinator.ts` with basic node management
- [ ] Implement `node-manager.ts` with connection pooling
- [ ] Implement `replication-manager.ts` with sync orchestration
- [ ] Create `src/config/db-cluster.config.ts` schema
- [ ] Create `src/config/db-cluster.validator.ts` validation
- [ ] Add new standardized variables to `secrets/Infinity-Gauntlet.env`
- [ ] Test coordinator locally with 2-node cluster
- [ ] Write unit tests for coordinator components

### Phase 2: Migration Layer
- [ ] Create `src/shared/legacy-db-adapter.ts` compatibility layer
- [ ] Update `src/shared/config.ts` to use adapter
- [ ] Update `src/shared/prisma.ts` for multi-client support
- [ ] Update `scripts/dev_prod_auto_sync.ts` to use coordinator
- [ ] Update `scripts/db_admin.ts` for multi-node operations
- [ ] Update `scripts/db_smoke.ts` to test all nodes
- [ ] Update `scripts/db_mirror_checks.ts` for all nodes
- [ ] Update `scripts/bootstrap_prod_node.sh` to register with coordinator
- [ ] Test all scripts with new coordinator
- [ ] Verify backwards compatibility with legacy variables

### Phase 3: Advanced Features
- [ ] Implement `health-monitor.ts` with periodic checks
- [ ] Implement `metrics-collector.ts` for observability
- [ ] Implement `failover-manager.ts` for automatic recovery
- [ ] Implement `recovery-manager.ts` for node healing
- [ ] Implement `load-balancer.ts` for read distribution
- [ ] Add health metrics to `/ops stats` command
- [ ] Create dashboard for cluster monitoring (optional)
- [ ] Test failover scenarios (simulated node failures)
- [ ] Test recovery scenarios (node restart)
- [ ] Test load balancing (multiple read clients)

### Phase 4: Deployment
- [ ] Update `render.yaml` with new environment variables
- [ ] Update all documentation with new architecture
- [ ] Create migration guide for future node additions
- [ ] Deploy to staging environment
- [ ] Verify staging deployment health
- [ ] Run integration tests on staging
- [ ] Deploy to production (with rollback plan ready)
- [ ] Monitor production for 48 hours
- [ ] Verify all metrics are healthy

### Post-Migration
- [ ] Schedule deprecation of legacy variables (30 days)
- [ ] Update all documentation references
- [ ] Archive old architecture docs
- [ ] Create runbook for adding new nodes
- [ ] Create runbook for node failures
- [ ] Train team on new architecture

## Documentation Updates Required

### New Documentation
- [ ] `docs/db-cluster-architecture.md` - Complete architecture guide
- [ ] `docs/db-cluster-operations.md` - Operations runbook
- [ ] `docs/db-cluster-expansion.md` - Guide for adding nodes
- [ ] `docs/db-cluster-failover.md` - Failover procedures
- [ ] `docs/db-cluster-monitoring.md` - Monitoring guide

### Update Existing
- [ ] `docs/2-node-cluster-automation.md` - Reference new coordinator
- [ ] `ops/DB_BOOTSTRAP.md` - Update for multi-node setup
- [ ] `README.md` - Update architecture section
- [ ] `Agents.md` - Update database sections
- [ ] All router manifests with new paths

## Testing Strategy

### Unit Tests
- [ ] Coordinator node registration/deregistration
- [ ] Health check logic
- [ ] Failover decision making
- [ ] Load balancer routing
- [ ] Replication manager sync logic

### Integration Tests
- [ ] Multi-client Prisma connections
- [ ] Failover scenarios (primary down)
- [ ] Recovery scenarios (primary back up)
- [ ] Load distribution across replicas
- [ ] Replication lag monitoring

### End-to-End Tests
- [ ] Full cluster boot sequence
- [ ] User query routing (read vs write)
- [ ] Background job execution on worker node
- [ ] Analytics query on analytics node
- [ ] Migration execution and replication

## Metrics & Monitoring

### Key Metrics to Track
- **Node Health**: Status of each node (HEALTHY/DEGRADED/OFFLINE)
- **Query Latency**: p50, p95, p99 per node
- **Connection Pool**: Active/idle connections per node
- **Replication Lag**: Seconds behind master per replica
- **Failover Events**: Count and duration
- **Error Rates**: Errors per node per minute

### Alerting Thresholds
- Node offline for >60 seconds → CRITICAL
- Replication lag >10 seconds → WARNING
- Query latency p95 >500ms → WARNING
- Connection pool >80% full → WARNING
- 3+ failover events in 1 hour → CRITICAL

## Rollback Plan

### If Migration Fails
1. **Immediate**: Revert `src/shared/prisma.ts` to single client
2. **Immediate**: Restore legacy variable mappings in `src/shared/config.ts`
3. **Within 5 min**: Redeploy previous version from git tag
4. **Within 10 min**: Verify all services restored
5. **Within 30 min**: Postmortem analysis

### Rollback Testing
- [ ] Test rollback procedure in staging
- [ ] Verify rollback completes in <10 minutes
- [ ] Document rollback steps in runbook

## Success Criteria

### Phase 1 Complete When:
- [ ] Coordinator successfully manages 2-node cluster
- [ ] All environment variables follow new naming convention
- [ ] Configuration validation catches errors at startup
- [ ] Unit tests pass for all coordinator components

### Phase 2 Complete When:
- [ ] All scripts use coordinator for database operations
- [ ] Multi-client Prisma support working
- [ ] Backwards compatibility adapter tested
- [ ] Integration tests pass

### Phase 3 Complete When:
- [ ] Health monitoring reports accurate status
- [ ] Automatic failover tested successfully
- [ ] Load balancing distributes reads evenly
- [ ] Metrics dashboard shows all nodes

### Phase 4 Complete When:
- [ ] Can add new replica in <15 minutes
- [ ] Analytics node handles heavy queries without impact
- [ ] Worker node isolates background jobs
- [ ] Documentation complete for future expansion

## Budget & Timeline

### Time Estimate
- **Phase 1**: 2 weeks (Foundation)
- **Phase 2**: 1-2 weeks (Migration)
- **Phase 3**: 1-2 weeks (Advanced Features)
- **Phase 4**: 1 week (Expansion Ready)
- **Total**: 5-7 weeks

### Resource Requirements
- **Developer Time**: 1 FTE for 5-7 weeks
- **Testing Time**: 0.5 FTE for 2 weeks
- **DevOps Time**: 0.25 FTE for deployment support

### Infrastructure Costs
- **Current**: 2 nodes (DEV + PROD)
- **Future Expansion**: +$25/month per replica
- **Analytics Node**: +$50/month (larger instance)
- **Worker Node**: +$25/month

## Risk Assessment

### High Risk
- **Database connection interruption during migration** → Mitigation: Blue/green deployment
- **Replication lag causing data inconsistency** → Mitigation: Strict replication monitoring
- **Failover causing brief outage** → Mitigation: Health check tuning

### Medium Risk
- **Performance regression from coordinator overhead** → Mitigation: Performance testing
- **Complex debugging with multiple nodes** → Mitigation: Comprehensive logging

### Low Risk
- **Configuration errors** → Mitigation: Validation at startup
- **Legacy code breaking** → Mitigation: Backwards compatibility layer

## Dependencies

### Internal
- Current 2-node cluster must be stable
- Render PostgreSQL must support replication
- All services must support environment variable updates

### External
- Prisma client supports multiple instances
- PostgreSQL replication features available
- Render persistent disks stable

## Approval Required

- [ ] Architecture review (Tech Lead)
- [ ] Security review (InfoSec)
- [ ] Budget approval (Finance)
- [ ] Timeline approval (PM)

## Notes

- Keep MASTER_1 as single source of truth during entire migration
- Never run migrations on PROD nodes (read-only for safety)
- Monitor replication lag closely during expansion
- Document every node addition/removal for audit trail

---

**Next Action**: Review this plan and get stakeholder approval before starting Phase 1.
