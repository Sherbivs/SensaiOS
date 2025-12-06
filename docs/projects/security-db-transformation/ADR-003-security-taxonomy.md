# ADR-003: Security Event Taxonomy and Classification

## Status
**Accepted** — 2025-06-15

## Context

The security system generates diverse events that require consistent classification for:

1. **Routing**: Events need to reach appropriate handlers
2. **Priority**: Critical events require immediate attention
3. **Aggregation**: Similar events should be grouped for analytics
4. **Filtering**: Users need to filter events by category
5. **Retention**: Different event types have different retention requirements
6. **Compliance**: Audit requirements vary by event category

### Problem Statement

Without a standardized taxonomy:
- Events are inconsistently named across modules
- Priority handling is ad-hoc
- Analytics queries are fragile
- New event types lack clear placement
- Documentation becomes outdated quickly

### Requirements

| Requirement | Priority | Description |
|-------------|----------|-------------|
| Consistent naming | P0 | All events follow naming convention |
| Hierarchical categories | P0 | Events organized in logical hierarchy |
| Priority classification | P0 | Severity levels for all events |
| Extensibility | P1 | Easy to add new event types |
| Documentation | P1 | Self-documenting event definitions |
| Type safety | P0 | TypeScript enforcement of taxonomy |

## Decision

**We adopt a hierarchical security event taxonomy** with four levels:

```
Domain → Category → Subcategory → Action
```

### Taxonomy Structure

```
security
├── authentication
│   ├── login
│   │   ├── attempted
│   │   ├── succeeded
│   │   ├── failed
│   │   └── blocked
│   ├── logout
│   │   └── completed
│   ├── session
│   │   ├── created
│   │   ├── refreshed
│   │   ├── expired
│   │   └── terminated
│   └── token
│       ├── issued
│       ├── refreshed
│       ├── revoked
│       └── expired
│
├── authorization
│   ├── permission
│   │   ├── granted
│   │   ├── revoked
│   │   ├── checked
│   │   └── denied
│   ├── role
│   │   ├── created
│   │   ├── modified
│   │   ├── deleted
│   │   ├── assigned
│   │   └── unassigned
│   └── access
│       ├── allowed
│       ├── denied
│       └── challenged
│
├── monitoring
│   ├── alert
│   │   ├── created
│   │   ├── acknowledged
│   │   ├── escalated
│   │   ├── resolved
│   │   └── snoozed
│   ├── metric
│   │   ├── recorded
│   │   ├── threshold_exceeded
│   │   └── anomaly_detected
│   └── health
│       ├── check_passed
│       ├── check_failed
│       └── degraded
│
├── configuration
│   ├── policy
│   │   ├── created
│   │   ├── modified
│   │   ├── deleted
│   │   └── applied
│   ├── setting
│   │   ├── changed
│   │   └── reset
│   └── migration
│       ├── started
│       ├── completed
│       ├── failed
│       └── rolled_back
│
└── incident
    ├── threat
    │   ├── detected
    │   ├── blocked
    │   └── mitigated
    ├── violation
    │   ├── detected
    │   ├── reported
    │   └── resolved
    └── breach
        ├── suspected
        ├── confirmed
        └── contained
```

### Event Type Naming Convention

**Format**: `{domain}.{category}.{subcategory}.{action}`

**Examples**:
- `security.authentication.login.succeeded`
- `security.authorization.permission.granted`
- `security.monitoring.alert.escalated`
- `security.incident.threat.detected`

### TypeScript Implementation

```typescript
// Event domains
export const SecurityDomain = {
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  MONITORING: 'monitoring',
  CONFIGURATION: 'configuration',
  INCIDENT: 'incident',
} as const;

// Event categories (per domain)
export const AuthenticationCategory = {
  LOGIN: 'login',
  LOGOUT: 'logout',
  SESSION: 'session',
  TOKEN: 'token',
} as const;

export const AuthorizationCategory = {
  PERMISSION: 'permission',
  ROLE: 'role',
  ACCESS: 'access',
} as const;

// ... additional categories

// Event actions
export const LoginAction = {
  ATTEMPTED: 'attempted',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  BLOCKED: 'blocked',
} as const;

// Type-safe event type builder
export function buildEventType(
  domain: keyof typeof SecurityDomain,
  category: string,
  subcategory: string,
  action: string
): string {
  return `security.${domain}.${category}.${action}`;
}

// Common event types (exported for use)
export const SecurityEventTypes = {
  // Authentication
  LOGIN_ATTEMPTED: 'security.authentication.login.attempted',
  LOGIN_SUCCEEDED: 'security.authentication.login.succeeded',
  LOGIN_FAILED: 'security.authentication.login.failed',
  LOGIN_BLOCKED: 'security.authentication.login.blocked',
  
  // Authorization
  PERMISSION_GRANTED: 'security.authorization.permission.granted',
  PERMISSION_REVOKED: 'security.authorization.permission.revoked',
  PERMISSION_DENIED: 'security.authorization.permission.denied',
  
  // Monitoring
  ALERT_CREATED: 'security.monitoring.alert.created',
  ALERT_ESCALATED: 'security.monitoring.alert.escalated',
  ALERT_RESOLVED: 'security.monitoring.alert.resolved',
  
  // Configuration
  POLICY_MODIFIED: 'security.configuration.policy.modified',
  MIGRATION_COMPLETED: 'security.configuration.migration.completed',
  
  // Incidents
  THREAT_DETECTED: 'security.incident.threat.detected',
  BREACH_SUSPECTED: 'security.incident.breach.suspected',
} as const;

export type SecurityEventType = typeof SecurityEventTypes[keyof typeof SecurityEventTypes];
```

### Priority Classification

| Level | Name | Description | Response Time | Retention |
|-------|------|-------------|---------------|-----------|
| P0 | Critical | Immediate security threat | < 5 minutes | 7 years |
| P1 | High | Potential security issue | < 1 hour | 2 years |
| P2 | Medium | Notable security event | < 24 hours | 1 year |
| P3 | Low | Informational event | Best effort | 90 days |
| P4 | Debug | Development/debugging | N/A | 7 days |

### Priority Mapping

```typescript
export const EventPriority: Record<SecurityEventType, Priority> = {
  // Critical (P0)
  [SecurityEventTypes.BREACH_SUSPECTED]: Priority.CRITICAL,
  [SecurityEventTypes.THREAT_DETECTED]: Priority.CRITICAL,
  
  // High (P1)
  [SecurityEventTypes.LOGIN_BLOCKED]: Priority.HIGH,
  [SecurityEventTypes.PERMISSION_DENIED]: Priority.HIGH,
  [SecurityEventTypes.ALERT_ESCALATED]: Priority.HIGH,
  
  // Medium (P2)
  [SecurityEventTypes.LOGIN_FAILED]: Priority.MEDIUM,
  [SecurityEventTypes.ALERT_CREATED]: Priority.MEDIUM,
  [SecurityEventTypes.POLICY_MODIFIED]: Priority.MEDIUM,
  
  // Low (P3)
  [SecurityEventTypes.LOGIN_SUCCEEDED]: Priority.LOW,
  [SecurityEventTypes.PERMISSION_GRANTED]: Priority.LOW,
  [SecurityEventTypes.ALERT_RESOLVED]: Priority.LOW,
  
  // Debug (P4)
  [SecurityEventTypes.MIGRATION_COMPLETED]: Priority.DEBUG,
};
```

### Event Schema by Category

#### Authentication Events

```typescript
interface LoginEvent {
  userId: string;
  method: 'password' | 'oauth' | 'token' | 'mfa';
  ipAddress: string;
  userAgent: string;
  geoLocation?: GeoLocation;
  mfaUsed: boolean;
  failureReason?: string;
}

interface SessionEvent {
  sessionId: string;
  userId: string;
  expiresAt: Date;
  deviceFingerprint?: string;
}
```

#### Authorization Events

```typescript
interface PermissionEvent {
  userId: string;
  permission: string;
  resource?: string;
  grantedBy?: string;
  revokedBy?: string;
  reason?: string;
}

interface RoleEvent {
  roleId: string;
  roleName: string;
  permissions?: string[];
  userId?: string;
  modifiedBy: string;
}
```

#### Alert Events

```typescript
interface AlertEvent {
  alertId: string;
  alertType: string;
  severity: Priority;
  title: string;
  description: string;
  affectedResources: string[];
  acknowledgedBy?: string;
  resolvedBy?: string;
  resolution?: string;
}
```

## Consequences

### Positive

- **Consistency**: All events follow predictable naming
- **Discoverability**: Hierarchical structure aids navigation
- **Type Safety**: TypeScript prevents invalid event types
- **Analytics**: Reliable aggregation by category/domain
- **Filtering**: Easy to filter events at any hierarchy level
- **Documentation**: Self-documenting event definitions

### Negative

- **Rigidity**: Adding new categories requires schema updates
- **Verbosity**: Long event type strings
- **Learning Curve**: Team must understand taxonomy

### Mitigation

| Risk | Mitigation |
|------|------------|
| Adding categories | Version taxonomy, document change process |
| Verbosity | Provide constants and builders |
| Learning curve | Create taxonomy reference documentation |

## Integration Points

### Event Channel (P2-001)

```typescript
// EventChannel uses taxonomy for routing
channel.subscribe('security.authentication.*', authHandler);
channel.subscribe('security.incident.**', incidentHandler);
```

### Event Router (P2-003)

```typescript
// Router uses taxonomy for pattern matching
router.addRoute('security.authentication.login.failed', loginFailureHandler);
router.addRoute('security.monitoring.alert.*', alertHandler);
```

### Continuous Aggregates (R4)

```sql
-- Aggregate by category
SELECT 
  time_bucket('1 hour', timestamp) AS bucket,
  split_part(event_type, '.', 2) AS domain,
  split_part(event_type, '.', 3) AS category,
  COUNT(*) as event_count
FROM security_events
GROUP BY bucket, domain, category;
```

## Extension Guidelines

### Adding New Event Types

1. Identify the appropriate domain and category
2. Add action to existing subcategory OR create new subcategory
3. Add TypeScript constant to `SecurityEventTypes`
4. Assign priority in `EventPriority`
5. Document in this ADR
6. Update event schema if new payload fields needed

### Adding New Categories

1. Propose change in Tasklist.md
2. Update taxonomy diagram in this ADR
3. Add TypeScript constants and types
4. Update routing patterns in EventRouter
5. Add continuous aggregate views if needed
6. Update retention policies

## Related Documents

- `ADR-001-timescaledb-selection.md` — Storage architecture
- `ADR-002-event-sourcing.md` — Event sourcing pattern
- `src/bot/security/types/events.ts` — TypeScript definitions
- `src/bot/security/services/event-router.ts` — Event routing implementation

---

**Author**: Security Specialist  
**Reviewers**: Architecture Specialist, Documentation Specialist  
**Last Updated**: 2025-06-15
