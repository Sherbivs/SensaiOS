````markdown
# Security Bot Database Transformation — Master Plan (Part 2)

> **Continuation of:** MASTER-PLAN.md  
> **Document Version:** 1.0  
> **Created:** 2025-12-04  
> **Status:** 🚧 PLANNING PHASE  

---

## Agile Review & Refinement

Following the database-centric project's proven methodology, each specialist reviews the plan to identify flaws, risks, and propose improvements.

---

## Security Specialist Review

### Identified Flaws & Risks

| # | Category | Issue | Severity | Impact |
|---|----------|-------|----------|--------|
| S1 | **HMAC Key Management** | No key rotation mechanism defined | HIGH | Single key compromise = full breach |
| S2 | **Checksum Algorithm** | SHA-256 truncated to 16 chars may have collisions | MEDIUM | False negatives possible |
| S3 | **Permission Escalation** | Server Admin could create bot account to bypass hierarchy | HIGH | Privilege escalation vector |
| S4 | **Rate Limiting** | No rate limit on audit queries | LOW | DoS via expensive queries |
| S5 | **Replay Attacks** | Requests lack nonce/timestamp validation | MEDIUM | Stale requests could be replayed |
| S6 | **Cross-Reference Gap** | 1-hour validation window allows undetected changes | MEDIUM | Unauthorized changes persist |

### Proposed Improvements

#### S1 Fix: HMAC Key Rotation
```typescript
// src/services/security/key-rotation-service.ts
export class KeyRotationService {
  private readonly KEY_VERSION_PREFIX = 'hmac_key_v';
  
  async rotateKey(): Promise<void> {
    const currentVersion = await this.getCurrentKeyVersion();
    const newVersion = currentVersion + 1;
    
    // Generate new key
    const newKey = crypto.randomBytes(32).toString('hex');
    await this.storeKey(newVersion, newKey);
    
    // Re-sign recent entries with new key (keep old signatures too)
    await this.resignRecentEntries(newVersion, newKey);
    
    // Mark old key as deprecated (don't delete yet)
    await this.deprecateKey(currentVersion);
    
    // Alert DRIPTVDD
    await dripAlertService.sendKeyRotationAlert(newVersion);
  }
  
  async verifySignature(entry: SignedEntry): Promise<boolean> {
    // Try current key first, then deprecated keys
    const keys = await this.getActiveKeys();
    for (const key of keys) {
      if (this.verify(entry, key)) return true;
    }
    return false;
  }
}
```

**Story Points:** 5  
**Priority:** P0

#### S3 Fix: Bot Account Detection
```typescript
// src/services/security/permission-resolver.ts
async canManageMember(executor: GuildMember, target: GuildMember): Promise<boolean> {
  // CRITICAL: Block bot account manipulation
  if (target.user.bot) {
    await this.logSecurityEvent({
      eventType: 'bot-manipulation-attempt',
      severity: 'HIGH',
      executorId: executor.id,
      targetId: target.id
    });
    return false;
  }
  
  // Existing hierarchy checks...
}
```

**Story Points:** 2  
**Priority:** P1

#### S5 Fix: Request Nonce + Timestamp
```typescript
// src/services/security/request-validator.ts
interface ValidatedRequest {
  nonce: string;      // UUID v4
  timestamp: number;  // Unix timestamp
  signature: string;  // HMAC of nonce + timestamp + payload
}

async validateRequest(request: ValidatedRequest): Promise<boolean> {
  // Check timestamp freshness (5 minute window)
  const now = Date.now();
  if (Math.abs(now - request.timestamp) > 5 * 60 * 1000) {
    throw new SecurityError('REQUEST_EXPIRED', 'Request timestamp outside valid window');
  }
  
  // Check nonce hasn't been used (prevent replay)
  const nonceUsed = await redis.get(`nonce:${request.nonce}`);
  if (nonceUsed) {
    throw new SecurityError('NONCE_REUSED', 'Request nonce already consumed');
  }
  
  // Mark nonce as used (TTL = 10 minutes)
  await redis.set(`nonce:${request.nonce}`, '1', 'EX', 600);
  
  return true;
}
```

**Story Points:** 3  
**Priority:** P2

### Story Point Summary
| Task | Original | Security Review | Delta |
|------|----------|-----------------|-------|
| P0-004 Checksum | 4h | 6h (+key rotation) | +2h |
| P1-001 Permission | 4h | 6h (+bot detection) | +2h |
| P2-001 Sanitization | 4h | 5h (+nonce validation) | +1h |
| **New: Key Rotation** | - | 8h | +8h |

**Total Security Additions:** +13 hours

---

## Database Specialist Review

### Identified Flaws & Risks

| # | Category | Issue | Severity | Impact |
|---|----------|-------|----------|--------|
| D1 | **Index Strategy** | Missing composite index on (guildId, memberId, createdAt) | MEDIUM | Slow member history queries |
| D2 | **Partition Strategy** | No partitioning for security_events (will grow unbounded) | HIGH | Query degradation over time |
| D3 | **Foreign Keys** | No FK to existing Trainer/Guild tables | LOW | Referential integrity gap |
| D4 | **Retention Policy** | No automatic cleanup of old events | HIGH | Storage growth unbounded |
| D5 | **Bulk Operations** | No batch insert for migration | MEDIUM | Slow migration (500 individual inserts) |
| D6 | **Transaction Scope** | Multi-table operations not wrapped in transactions | HIGH | Partial failures leave inconsistent state |

### Proposed Improvements

#### D1 Fix: Additional Composite Indexes
```sql
-- Add to migration
CREATE INDEX CONCURRENTLY idx_role_audit_guild_member_time 
ON role_change_audit (guild_id, member_id, created_at DESC);

CREATE INDEX CONCURRENTLY idx_security_events_guild_type_time
ON security_events (guild_id, event_type, created_at DESC);

CREATE INDEX CONCURRENTLY idx_threats_guild_resolved
ON threat_detections (guild_id, resolved, created_at DESC);
```

**Story Points:** 2  
**Priority:** P0

#### D2 Fix: TimescaleDB Hypertable for Events
```sql
-- Convert security_events to hypertable (if TimescaleDB available)
SELECT create_hypertable('security_events', 'created_at', 
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE
);

-- Add retention policy (90 days for events)
SELECT add_retention_policy('security_events', INTERVAL '90 days');

-- Add compression for chunks older than 7 days
ALTER TABLE security_events SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'guild_id, event_type'
);
SELECT add_compression_policy('security_events', INTERVAL '7 days');
```

**Story Points:** 5  
**Priority:** P1

#### D4 Fix: Retention Policies
```typescript
// src/services/security/retention-service.ts
export const RETENTION_POLICIES = {
  security_events: {
    defaultRetention: 90,      // days
    criticalRetention: 365,    // days for CRITICAL severity
    compressionAge: 7          // days before compression
  },
  role_change_audit: {
    defaultRetention: 180,     // days
    unauthorizedRetention: 365 // days for unauthorized changes
  },
  threat_detections: {
    defaultRetention: 365,     // keep threats longer
    resolvedRetention: 180
  }
};

async function applyRetentionPolicy(table: string): Promise<number> {
  const policy = RETENTION_POLICIES[table];
  const cutoff = new Date(Date.now() - policy.defaultRetention * 24 * 60 * 60 * 1000);
  
  const result = await prisma[table].deleteMany({
    where: {
      createdAt: { lt: cutoff },
      severity: { not: 'CRITICAL' }  // Keep critical events longer
    }
  });
  
  return result.count;
}
```

**Story Points:** 3  
**Priority:** P1

#### D6 Fix: Transaction Wrapper
```typescript
// src/services/security/role-audit-service.ts
async recordRoleChange(data: RoleChangeData): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // 1. Create audit record
    const audit = await tx.roleChangeAudit.create({
      data: { ...data, checksum: computeChecksum(data) }
    });
    
    // 2. Create security event
    await tx.securityEvent.create({
      data: {
        eventType: 'role-change',
        severity: data.authorized ? 'INFO' : 'HIGH',
        guildId: data.guildId,
        memberId: data.memberId,
        metadata: { auditId: audit.id }
      }
    });
    
    // 3. Update baseline if needed
    await tx.securityBaseline.update({
      where: { guildId: data.guildId },
      data: { dataPointCount: { increment: 1 } }
    });
  });
}
```

**Story Points:** 3  
**Priority:** P0

### Story Point Summary
| Task | Original | Database Review | Delta |
|------|----------|-----------------|-------|
| P0-001 Schema | 4h | 6h (+indexes, partitioning) | +2h |
| P0-003 Migration | 6h | 8h (+batch, transactions) | +2h |
| **New: Retention Service** | - | 4h | +4h |
| **New: TimescaleDB Config** | - | 3h | +3h |

**Total Database Additions:** +11 hours

---

## Architecture Specialist Review

### Identified Flaws & Risks

| # | Category | Issue | Severity | Impact |
|---|----------|-------|----------|--------|
| A1 | **Service Coupling** | Services directly call each other (tight coupling) | MEDIUM | Hard to test, modify |
| A2 | **Event Sourcing** | No event replay capability | LOW | Cannot reconstruct state |
| A3 | **Circuit Breaker** | No circuit breaker for Discord API calls | HIGH | Cascade failures possible |
| A4 | **Dependency Injection** | Services use global Prisma client | MEDIUM | Testing requires mocks |
| A5 | **Command Pattern** | Role commands not following CQRS | LOW | Mixed concerns |
| A6 | **Error Handling** | No standardized error types | MEDIUM | Inconsistent error responses |

### Proposed Improvements

#### A1 Fix: Event-Driven Service Communication
```typescript
// src/services/security/events.ts
export const SECURITY_EVENTS = {
  ROLE_CHANGE_RECORDED: 'security.role.recorded',
  THREAT_DETECTED: 'security.threat.detected',
  INTEGRITY_VIOLATION: 'security.integrity.violation',
  BASELINE_UPDATED: 'security.baseline.updated'
};

// Services publish events instead of calling each other
class RoleAuditService {
  async recordChange(data: RoleChangeData): Promise<void> {
    const audit = await this.repository.create(data);
    
    // Publish event instead of calling ThreatService directly
    await eventBus.publish({
      type: SECURITY_EVENTS.ROLE_CHANGE_RECORDED,
      data: { auditId: audit.id, ...data }
    });
  }
}

// ThreatService subscribes to events
class ThreatService {
  constructor() {
    eventBus.subscribe(SECURITY_EVENTS.ROLE_CHANGE_RECORDED, 
      this.analyzeForThreats.bind(this)
    );
  }
}
```

**Story Points:** 5  
**Priority:** P2

#### A3 Fix: Circuit Breaker for Discord API
```typescript
// src/services/security/discord-circuit-breaker.ts
import CircuitBreaker from 'opossum';

const discordApiBreaker = new CircuitBreaker(
  async (guildId: string) => {
    const guild = await client.guilds.fetch(guildId);
    return guild.members.fetch();
  },
  {
    timeout: 10000,        // 10 second timeout
    errorThresholdPercentage: 50,
    resetTimeout: 30000,   // 30 seconds before retry
    volumeThreshold: 5     // Minimum calls before tripping
  }
);

discordApiBreaker.on('open', () => {
  logger.warn('Discord API circuit breaker OPEN - requests will fail fast');
  dripAlertService.sendAlert({
    severity: 'warning',
    title: 'Discord API Degraded',
    message: 'Circuit breaker opened due to API failures'
  });
});

export async function fetchGuildMembers(guildId: string): Promise<GuildMember[]> {
  return discordApiBreaker.fire(guildId);
}
```

**Story Points:** 3  
**Priority:** P1

#### A4 Fix: Dependency Injection Container
```typescript
// src/services/security/container.ts
import { Container } from 'inversify';

const container = new Container();

// Bind interfaces to implementations
container.bind<PrismaClient>(TYPES.Database).toConstantValue(prisma);
container.bind<SecurityEventService>(TYPES.SecurityEvents).to(SecurityEventService);
container.bind<RoleAuditService>(TYPES.RoleAudit).to(RoleAuditService);
container.bind<ThreatService>(TYPES.Threats).to(ThreatService);

// Services receive dependencies via constructor
@injectable()
class RoleAuditService {
  constructor(
    @inject(TYPES.Database) private db: PrismaClient,
    @inject(TYPES.SecurityEvents) private events: SecurityEventService
  ) {}
}

export { container };
```

**Story Points:** 5  
**Priority:** P2

#### A6 Fix: Standardized Security Errors
```typescript
// src/services/security/errors.ts
export class SecurityError extends Error {
  constructor(
    public code: SecurityErrorCode,
    message: string,
    public metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SecurityError';
  }
}

export enum SecurityErrorCode {
  // Permission errors
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  ROLE_HIERARCHY_VIOLATION = 'ROLE_HIERARCHY_VIOLATION',
  BOT_MANIPULATION_BLOCKED = 'BOT_MANIPULATION_BLOCKED',
  
  // Integrity errors
  CHECKSUM_MISMATCH = 'CHECKSUM_MISMATCH',
  SIGNATURE_INVALID = 'SIGNATURE_INVALID',
  CROSS_REF_DRIFT = 'CROSS_REF_DRIFT',
  
  // Validation errors
  INVALID_DISCORD_ID = 'INVALID_DISCORD_ID',
  XSS_ATTEMPT_BLOCKED = 'XSS_ATTEMPT_BLOCKED',
  REQUEST_EXPIRED = 'REQUEST_EXPIRED',
  NONCE_REUSED = 'NONCE_REUSED'
}
```

**Story Points:** 2  
**Priority:** P1

### Story Point Summary
| Task | Original | Architecture Review | Delta |
|------|----------|---------------------|-------|
| P0-002 Service Extraction | 8h | 12h (+DI, events) | +4h |
| P1-002 Commands | 8h | 10h (+error handling) | +2h |
| **New: Circuit Breaker** | - | 4h | +4h |
| **New: Error Types** | - | 2h | +2h |

**Total Architecture Additions:** +12 hours

---

## Testing Specialist Review

### Identified Flaws & Risks

| # | Category | Issue | Severity | Impact |
|---|----------|-------|----------|--------|
| T1 | **Test Isolation** | No database isolation strategy | HIGH | Tests interfere with each other |
| T2 | **Mock Strategy** | Discord.js not easily mockable | MEDIUM | Integration tests fragile |
| T3 | **Security Tests** | No fuzzing for input sanitizers | MEDIUM | Edge cases missed |
| T4 | **Performance Tests** | No load testing for audit queries | LOW | Unknown scaling behavior |
| T5 | **E2E Coverage** | No end-to-end command tests | MEDIUM | Integration gaps |

### Proposed Improvements

#### T1 Fix: Test Database Isolation
```typescript
// tests/helpers/security-test-factory.ts
import { PrismaClient } from '@prisma/client';

export class SecurityTestFactory {
  private testSchema: string;
  private prisma: PrismaClient;
  
  async setup(): Promise<PrismaClient> {
    // Create isolated schema for this test run
    this.testSchema = `test_security_${Date.now()}`;
    await this.prisma.$executeRawUnsafe(
      `CREATE SCHEMA IF NOT EXISTS "${this.testSchema}"`
    );
    
    // Run migrations in test schema
    await this.runMigrations(this.testSchema);
    
    // Return client configured for test schema
    return new PrismaClient({
      datasources: { db: { url: `${baseUrl}?schema=${this.testSchema}` } }
    });
  }
  
  async teardown(): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `DROP SCHEMA IF EXISTS "${this.testSchema}" CASCADE`
    );
  }
}
```

**Story Points:** 4  
**Priority:** P1

#### T3 Fix: Fuzzing Tests for Sanitizers
```typescript
// tests/services/security/input-sanitizer.fuzz.spec.ts
import { fc } from 'fast-check';

describe('InputSanitizer Fuzzing', () => {
  describe('discordId', () => {
    it('should accept valid Discord IDs', () => {
      fc.assert(
        fc.property(
          fc.stringOf(fc.constantFrom('0','1','2','3','4','5','6','7','8','9'), 
            { minLength: 17, maxLength: 19 }),
          (id) => {
            expect(() => sanitizers.discordId(id)).not.toThrow();
          }
        )
      );
    });
    
    it('should reject all non-numeric strings', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !/^\d{17,19}$/.test(s)),
          (id) => {
            expect(() => sanitizers.discordId(id)).toThrow(SecurityError);
          }
        )
      );
    });
  });
  
  describe('reason field XSS', () => {
    it('should sanitize all XSS attempts', () => {
      const xssPayloads = [
        '<script>alert(1)</script>',
        '"><img src=x onerror=alert(1)>',
        "javascript:alert('XSS')",
        '<svg onload=alert(1)>',
        '{{constructor.constructor("alert(1)")()}}'
      ];
      
      xssPayloads.forEach(payload => {
        const sanitized = sanitizers.reason(payload);
        expect(sanitized).not.toMatch(/<script|javascript:|on\w+=/i);
      });
    });
  });
});
```

**Story Points:** 3  
**Priority:** P2

#### T5 Fix: E2E Command Tests
```typescript
// tests/e2e/security-commands.e2e.spec.ts
describe('Security Commands E2E', () => {
  let testGuild: Guild;
  let adminMember: GuildMember;
  let targetMember: GuildMember;
  let testRole: Role;
  
  beforeAll(async () => {
    // Setup test guild with fixtures
    testGuild = await testFactory.createGuild();
    adminMember = await testFactory.createMember(testGuild, { admin: true });
    targetMember = await testFactory.createMember(testGuild);
    testRole = await testFactory.createRole(testGuild, { position: 5 });
  });
  
  describe('/ops security roles add', () => {
    it('should add role and create audit trail', async () => {
      // Execute command
      const response = await executeCommand(
        'ops security roles add',
        { user: targetMember.id, role: testRole.id, reason: 'E2E test' },
        { executor: adminMember }
      );
      
      // Verify response
      expect(response.content).toContain('✅');
      
      // Verify role added
      await targetMember.fetch();
      expect(targetMember.roles.cache.has(testRole.id)).toBe(true);
      
      // Verify audit record created
      const audit = await prisma.roleChangeAudit.findFirst({
        where: { targetMemberId: targetMember.id, roleId: testRole.id }
      });
      expect(audit).toBeDefined();
      expect(audit.authorized).toBe(true);
      
      // Verify DRIP alert sent
      const alert = await prisma.adminRoleRequest.findFirst({
        where: { targetMemberId: targetMember.id }
      });
      expect(alert.dripAlertSent).toBe(true);
    });
  });
});
```

**Story Points:** 8  
**Priority:** P2

### Story Point Summary
| Task | Original | Testing Review | Delta |
|------|----------|----------------|-------|
| P3-001 Unit Tests | 8h | 10h (+isolation) | +2h |
| P3-002 Security Tests | 4h | 6h (+fuzzing) | +2h |
| **New: E2E Tests** | - | 8h | +8h |

**Total Testing Additions:** +12 hours

---

## DevOps Specialist Review

### Identified Flaws & Risks

| # | Category | Issue | Severity | Impact |
|---|----------|-------|----------|--------|
| O1 | **Migration Rollback** | No automated rollback on failure | HIGH | Manual intervention required |
| O2 | **Monitoring** | No Prometheus metrics for security services | MEDIUM | Blind spots in monitoring |
| O3 | **Alerting** | No PagerDuty integration for CRITICAL | HIGH | Delayed incident response |
| O4 | **Deployment** | No blue-green strategy for schema changes | MEDIUM | Downtime during migration |
| O5 | **Backup Validation** | Security tables not in backup verification | HIGH | Data loss risk |

### Proposed Improvements

#### O1 Fix: Migration Rollback Automation
```typescript
// scripts/migrate-security-state.ts
async function migrateWithRollback(): Promise<void> {
  const checkpoint = await createCheckpoint();
  
  try {
    // Step 1: Migrate data
    await migrateArchiveEntries();
    await migrateBaselines();
    
    // Step 2: Verify migration
    const verification = await verifyMigration();
    if (!verification.success) {
      throw new Error(`Migration verification failed: ${verification.errors}`);
    }
    
    // Step 3: Mark complete
    await markMigrationComplete();
    
  } catch (error) {
    logger.error('Migration failed, initiating rollback', error);
    
    // Automatic rollback
    await rollbackToCheckpoint(checkpoint);
    
    // Alert DRIPTVDD
    await dripAlertService.sendAlert({
      severity: 'critical',
      title: 'Security Migration Failed',
      message: `Rollback completed to checkpoint ${checkpoint.id}`
    });
    
    throw error;
  }
}
```

**Story Points:** 4  
**Priority:** P0

#### O2 Fix: Security Service Metrics
```typescript
// src/services/security/metrics.ts
import { Counter, Histogram, Gauge } from 'prom-client';

export const securityMetrics = {
  // Event tracking
  eventsRecorded: new Counter({
    name: 'security_events_total',
    help: 'Total security events recorded',
    labelNames: ['event_type', 'severity', 'guild_id']
  }),
  
  // Threat detection
  threatsDetected: new Counter({
    name: 'security_threats_detected_total',
    help: 'Total threats detected',
    labelNames: ['threat_type', 'severity']
  }),
  
  // Integrity validation
  checksumValidations: new Counter({
    name: 'security_checksum_validations_total',
    help: 'Total checksum validations',
    labelNames: ['result', 'table']
  }),
  
  // Performance
  queryLatency: new Histogram({
    name: 'security_query_duration_ms',
    help: 'Security query latency in milliseconds',
    labelNames: ['operation'],
    buckets: [5, 10, 25, 50, 100, 250, 500]
  }),
  
  // State
  activeThreats: new Gauge({
    name: 'security_active_threats',
    help: 'Number of unresolved threats',
    labelNames: ['severity']
  })
};
```

**Story Points:** 3  
**Priority:** P1

#### O3 Fix: Critical Alert Escalation
```typescript
// src/services/security/alert-escalation.ts
export async function escalateCriticalAlert(threat: ThreatDetection): Promise<void> {
  // 1. Immediate DRIP alert
  await dripAlertService.sendAlert({
    severity: 'critical',
    title: `🚨 CRITICAL: ${threat.threatType}`,
    message: formatThreatAlert(threat)
  });
  
  // 2. PagerDuty if configured
  if (process.env.PAGERDUTY_KEY) {
    await pagerduty.trigger({
      routing_key: process.env.PAGERDUTY_KEY,
      event_action: 'trigger',
      payload: {
        summary: `Security Bot: ${threat.threatType}`,
        severity: 'critical',
        source: 'security-bot',
        custom_details: {
          guildId: threat.guildId,
          evidence: threat.evidence,
          recommendedAction: threat.recommendedAction
        }
      }
    });
  }
  
  // 3. Log to ops channel
  await logToOpsChannel(threat);
}
```

**Story Points:** 3  
**Priority:** P1

### Story Point Summary
| Task | Original | DevOps Review | Delta |
|------|----------|---------------|-------|
| P0-003 Migration | 6h | 10h (+rollback) | +4h |
| P2-003 Integrity Sweeps | 4h | 6h (+metrics) | +2h |
| **New: Prometheus Metrics** | - | 3h | +3h |
| **New: PagerDuty Integration** | - | 3h | +3h |

**Total DevOps Additions:** +12 hours

---

## Documentation Specialist Review

### Identified Flaws & Risks

| # | Category | Issue | Severity | Impact |
|---|----------|-------|----------|--------|
| D1 | **Admin Guide** | No troubleshooting section | MEDIUM | Support burden |
| D2 | **API Docs** | Service interfaces not documented | LOW | Developer confusion |
| D3 | **Runbooks** | No incident response playbook | HIGH | Slow incident resolution |
| D4 | **Architecture** | No sequence diagrams for flows | LOW | Understanding gap |

### Proposed Improvements

#### D3 Fix: Incident Response Playbook Structure
```markdown
# Security Bot Incident Response Playbook

## Incident Classification

| Severity | Response Time | Examples |
|----------|---------------|----------|
| CRITICAL | <15 minutes | Integrity violation, mass unauthorized changes |
| HIGH | <1 hour | Threat detected, permission bypass attempt |
| MEDIUM | <4 hours | Anomaly detected, elevated activity |
| LOW | <24 hours | False positive, minor drift |

## Response Procedures

### CRITICAL: Integrity Violation
1. **Acknowledge** — Respond to DRIP alert within 15 minutes
2. **Isolate** — Pause security bot operations for affected guild
3. **Investigate** — Run `/ops security audit` to review recent changes
4. **Remediate** — Revert unauthorized changes, heal corrupted records
5. **Document** — Update ThreatDetection record with resolution
6. **Review** — Post-incident review within 24 hours

### HIGH: Threat Detected
1. **Acknowledge** — Respond within 1 hour
2. **Assess** — Review threat evidence in database
3. **Decide** — False positive? Mark and tune. Real threat? Escalate.
4. **Action** — Execute recommended action or custom response
5. **Document** — Update resolution notes
```

**Story Points:** 4  
**Priority:** P2

### Story Point Summary
| Task | Original | Docs Review | Delta |
|------|----------|-------------|-------|
| P3-003 Documentation | 4h | 8h (+runbook, diagrams) | +4h |

**Total Documentation Additions:** +4 hours

---

## Consolidated Story Point Summary

### By Specialist Team

| Team | Original Hours | Review Additions | Final Hours |
|------|----------------|------------------|-------------|
| Database | 14h | +11h | 25h |
| Security | 12h | +13h | 25h |
| Architecture | 16h | +12h | 28h |
| Testing | 12h | +12h | 24h |
| DevOps | 4h | +12h | 16h |
| Documentation | 4h | +4h | 8h |
| **TOTAL** | **62h** | **+64h** | **126h** |

### By Priority

| Priority | Tasks | Hours | Sprint |
|----------|-------|-------|--------|
| P0 (Critical) | 6 | 42h | Sprint 1 |
| P1 (High) | 8 | 44h | Sprint 2 |
| P2 (Medium) | 7 | 32h | Sprint 3 |
| P3 (Future) | 3 | 8h | Sprint 4 |

---

## Risk Register

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|----|------|------------|--------|------------|-------|
| R1 | Data loss during migration | Low | Critical | Checkpoint + rollback automation | Database |
| R2 | HMAC key compromise | Low | Critical | Key rotation, multi-key support | Security |
| R3 | Permission bypass vulnerability | Low | Critical | Bot detection, hierarchy enforcement | Security |
| R4 | Query performance degradation | Medium | High | Indexes, partitioning, retention | Database |
| R5 | DRIP alert spam | Medium | Medium | Rate limiting, batching | Backend |
| R6 | Discord API rate limits | Medium | Medium | Circuit breaker, caching | Architecture |
| R7 | Test database interference | High | Medium | Schema isolation per test | Testing |
| R8 | Monitoring blind spots | Medium | Medium | Prometheus metrics, dashboards | DevOps |

---

## Definition of Done

### For Each Task
- [ ] Code implemented and passing lint
- [ ] Unit tests written (>80% coverage)
- [ ] Integration tests where applicable
- [ ] Documentation updated
- [ ] Code reviewed by specialist
- [ ] Merged to main branch

### For Each Sprint
- [ ] All tasks meet Definition of Done
- [ ] Sprint demo completed
- [ ] Retrospective notes captured
- [ ] Next sprint planned

### For Project Completion
- [ ] All 4 sprints complete
- [ ] 90%+ test coverage achieved
- [ ] Security assessment passed
- [ ] Documentation complete
- [ ] Bible integration validated
- [ ] Production deployment successful

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Prioritize** based on risk and dependencies
3. **Create Sprint 1 tasks** in SPRINT-TRACKER.md
4. **Begin implementation** with P0-001 (Schema)

---

**Last Updated:** 2025-12-04  
**Revision:** 1.0  
**Approved By:** Pending specialist review

````