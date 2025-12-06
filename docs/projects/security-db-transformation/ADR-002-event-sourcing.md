# ADR-002: Event Sourcing Pattern for Security Audit Trail

## Status
**Accepted** — 2025-06-15

## Context

The security system requires a complete, immutable audit trail of all security-related actions. This includes:

1. **Permission Changes**: Role assignments, permission grants/revocations
2. **Authentication Events**: Login attempts, session management, token refresh
3. **Configuration Changes**: Security settings, policy modifications
4. **Alert Lifecycle**: Alert creation, acknowledgment, resolution
5. **Rollback History**: Migration rollbacks, configuration reverts

### Requirements

| Requirement | Priority | Description |
|-------------|----------|-------------|
| Immutability | P0 | Events cannot be modified after creation |
| Complete history | P0 | Full audit trail from system inception |
| Temporal queries | P0 | Reconstruct state at any point in time |
| Event replay | P1 | Ability to replay events for debugging |
| Compliance | P0 | Meet audit requirements for security systems |
| Performance | P1 | Write-heavy workload with eventual consistency |

### Problem Statement

Traditional CRUD-based state management:
- Loses history when records are updated/deleted
- Cannot answer "what was the state at time X?"
- Makes debugging difficult (no trail of changes)
- Compliance audits require manual logging

### Options Considered

#### Option 1: Traditional CRUD with Audit Logs

**Approach**: Store current state + separate audit log table

**Pros:**
- Simple implementation
- Familiar pattern
- Lower storage requirements

**Cons:**
- Audit log can diverge from actual state
- Cannot reconstruct historical state reliably
- Manual correlation between state and audit
- Update/delete operations lose context

#### Option 2: Soft Deletes with Version History

**Approach**: Never delete, add version columns

**Pros:**
- Preserves all versions
- Simpler than full event sourcing

**Cons:**
- Complex queries for current state
- No clear event semantics
- Difficult to replay history
- Mixed concerns in data model

#### Option 3: Event Sourcing

**Approach**: Store events as source of truth, derive state

**Pros:**
- Complete, immutable audit trail
- Can reconstruct any historical state
- Natural fit for time-series with TimescaleDB
- Event replay for debugging and testing
- Clear separation of facts (events) and interpretation (projections)
- Built-in compliance support

**Cons:**
- More complex implementation
- Eventual consistency for projections
- Storage grows over time
- Learning curve for team

## Decision

**We adopt Event Sourcing** for the security audit trail.

### Core Concepts

```
Events (Immutable Facts)       →  Projections (Derived State)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━       ━━━━━━━━━━━━━━━━━━━━━━━━━━
PermissionGranted              →  CurrentPermissions
PermissionRevoked              →  CurrentPermissions  
RoleAssigned                   →  UserRoles
AlertCreated                   →  ActiveAlerts
AlertResolved                  →  AlertHistory
```

### Event Schema

```typescript
interface SecurityEvent {
  // Identity
  id: string;                    // Unique event ID
  aggregateId: string;           // Entity this event belongs to
  aggregateType: string;         // 'User', 'Role', 'Alert', etc.
  
  // Event metadata
  eventType: string;             // 'PermissionGranted', 'RoleAssigned', etc.
  version: number;               // Aggregate version (for optimistic concurrency)
  timestamp: Date;               // When event occurred
  
  // Event data
  payload: Record<string, unknown>;  // Event-specific data
  metadata: {
    correlationId: string;       // Links related events
    causationId: string;         // Event that caused this event
    userId: string;              // Who triggered the event
    source: string;              // System component
  };
  
  // Audit
  checksum: string;              // SHA-256 of payload
  immutable: true;               // Events are never modified
}
```

### Implementation Strategy

#### 1. Event Store

```typescript
// Using TimescaleDB hypertable for efficient time-range queries
class EventStore {
  async append(event: SecurityEvent): Promise<void>;
  async getEvents(aggregateId: string, fromVersion?: number): Promise<SecurityEvent[]>;
  async getEventsByType(type: string, since: Date): Promise<SecurityEvent[]>;
  async getEventStream(types: string[], since: Date): AsyncIterator<SecurityEvent>;
}
```

#### 2. Projections

```typescript
// Derive current state from events
class PermissionProjection {
  async apply(event: SecurityEvent): Promise<void> {
    switch (event.eventType) {
      case 'PermissionGranted':
        await this.addPermission(event.aggregateId, event.payload);
        break;
      case 'PermissionRevoked':
        await this.removePermission(event.aggregateId, event.payload);
        break;
    }
  }
}
```

#### 3. Temporal Queries

```typescript
// Reconstruct state at any point in time
async function getPermissionsAt(userId: string, asOf: Date): Promise<Permission[]> {
  const events = await eventStore.getEvents(userId);
  const relevantEvents = events.filter(e => e.timestamp <= asOf);
  return PermissionProjection.rebuild(relevantEvents);
}
```

### Integration with TimescaleDB

Event sourcing pairs naturally with TimescaleDB:

1. **Hypertable for Events**: Automatic partitioning by timestamp
2. **Continuous Aggregates**: Real-time event statistics
3. **Compression**: Historical events compressed automatically
4. **Retention**: Old events archived after projection

```sql
-- Event store as hypertable
SELECT create_hypertable('security_events', 'timestamp');

-- Continuous aggregate for event metrics
CREATE MATERIALIZED VIEW event_metrics_hourly
WITH (timescaledb.continuous) AS
SELECT 
  time_bucket('1 hour', timestamp) AS bucket,
  event_type,
  aggregate_type,
  COUNT(*) as event_count
FROM security_events
GROUP BY bucket, event_type, aggregate_type;
```

## Consequences

### Positive

- **Complete Audit Trail**: Every change is recorded as an immutable event
- **Temporal Queries**: "Show me permissions as of last Tuesday"
- **Event Replay**: Debug issues by replaying event sequences
- **Compliance**: Built-in audit support for security requirements
- **Testing**: Test projections by replaying known event sequences
- **Analytics**: Rich event data for security insights

### Negative

- **Complexity**: More sophisticated than CRUD
- **Eventual Consistency**: Projections may lag behind events
- **Storage Growth**: Events accumulate over time
- **Schema Evolution**: Event versioning requires careful planning

### Mitigation

| Risk | Mitigation |
|------|------------|
| Complexity | Provide clear abstractions and examples |
| Eventual consistency | Document consistency guarantees clearly |
| Storage growth | Use TimescaleDB compression and retention |
| Schema evolution | Version events, use upcasters for old formats |

## Event Types (Initial Set)

### Permission Events
- `PermissionGranted` — User granted a permission
- `PermissionRevoked` — User's permission revoked
- `PermissionBulkUpdated` — Multiple permissions changed

### Role Events
- `RoleCreated` — New role defined
- `RoleModified` — Role configuration changed
- `RoleDeleted` — Role removed from system
- `RoleAssigned` — User assigned to role
- `RoleUnassigned` — User removed from role

### Authentication Events
- `LoginAttempted` — Login attempt (success/failure)
- `LoginSucceeded` — Successful authentication
- `LoginFailed` — Failed authentication
- `SessionCreated` — New session started
- `SessionEnded` — Session terminated
- `TokenRefreshed` — Auth token refreshed

### Alert Events
- `AlertCreated` — New security alert raised
- `AlertAcknowledged` — Alert acknowledged by user
- `AlertEscalated` — Alert escalated to higher priority
- `AlertResolved` — Alert marked as resolved
- `AlertSnoozed` — Alert temporarily suppressed

### Configuration Events
- `ConfigurationChanged` — Security configuration modified
- `PolicyUpdated` — Security policy changed
- `ThresholdModified` — Alert threshold adjusted

## Related Services

- **SecurityEventChannel** (P2-001): Event bus for publishing security events
- **SecurityEventRouter** (P2-003): Routes events to appropriate handlers
- **MigrationAutomationService** (D11): Event-based migration tracking

## References

- [Event Sourcing Pattern](https://martinfowler.com/eaaDev/EventSourcing.html)
- [CQRS and Event Sourcing](https://docs.microsoft.com/en-us/azure/architecture/patterns/cqrs)
- [ADR-001-timescaledb-selection.md](./ADR-001-timescaledb-selection.md)

---

**Author**: Architecture Specialist  
**Reviewers**: Database Specialist, Security Specialist  
**Last Updated**: 2025-06-15
