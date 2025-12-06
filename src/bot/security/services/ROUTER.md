# ROUTER

**Title:** Security Services  
**Purpose:** Database service layer for security operations extracted from main.js  
**Owned Globs:** `src/bot/security/services/**`  
**Last Updated (UTC):** 2025-06-18T00:00:00Z

---

## Overview

This directory contains service classes that encapsulate database operations for the security bot. These services were extracted from the monolithic `main.js` (3,893 lines) as part of **P0-002 Service Extraction** task.

Each service provides:
- Type-safe database operations via Prisma
- HMAC signature generation and verification (CWE-208 compliant)
- Hash chain linking for SOC 2 compliance (R6)
- Efficient querying with pagination
- Batch integrity verification

---

## Areas

| File | Purpose | Status |
|------|---------|--------|
| `index.ts` | Public API exports for all services | ✅ Complete |
| `security-event-service.ts` | SecurityEvent CRUD with integrity | ✅ Complete (~740 lines) |
| `role-audit-service.ts` | RoleChangeAudit operations | ✅ Complete (~680 lines) |
| `threat-detection-service.ts` | ThreatDetection with MITRE ATT&CK | ✅ Complete (~720 lines) |
| `baseline-service.ts` | SecurityBaseline operations | ✅ Complete (~630 lines) |
| `ROUTER.md` | This documentation | ✅ Complete |

**P0-002 STATUS: ✅ COMPLETE** — All 4 core services extracted and typed.

---

## Service Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Security Services                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │ SecurityEventService│    │ RoleAuditService    │            │
│  │ ─────────────────── │    │ ─────────────────── │            │
│  │ • recordEvent()     │    │ • recordChange()    │            │
│  │ • queryEvents()     │    │ • getMemberHistory()│            │
│  │ • verifyIntegrity() │    │ • detectAnomalies() │            │
│  │ • verifyHashChain() │    │ • verifyIntegrity() │            │
│  └─────────┬───────────┘    └─────────┬───────────┘            │
│            │                          │                        │
│  ┌─────────▼───────────┐    ┌─────────▼───────────┐            │
│  │ Timing-Safe Crypto  │    │ ThreatDetectionSvc  │            │
│  │ ─────────────────── │    │ ─────────────────── │            │
│  │ • generateHmac()    │    │ • recordThreat()    │            │
│  │ • sha256()          │    │ • resolveThreat()   │            │
│  │ • timingSafeCompare │    │ • markFalsePositive │            │
│  └─────────────────────┘    └─────────────────────┘            │
│                                                                 │
│  ┌─────────────────────┐                                       │
│  │ BaselineService     │                                       │
│  │ ─────────────────── │                                       │
│  │ • getOrCreate()     │                                       │
│  │ • computeBaseline() │                                       │
│  │ • updateActivity()  │                                       │
│  │ • shouldRefresh()   │                                       │
│  └─────────────────────┘                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Prisma Client                              │
│  • PrismaClientWith* (type assertions until prisma generate)    │
│  • After migration, uses native Prisma types                    │
└─────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PostgreSQL                                 │
│  • SecurityEvent, RoleChangeAudit, ThreatDetection tables       │
│  • SecurityBaseline, PermissionSnapshot, AdminRoleRequest       │
└─────────────────────────────────────────────────────────────────┘
```

---

## SecurityEventService API

### Constructor

```typescript
constructor(prisma: PrismaClient, hmacSecret?: string)
```

### Core Methods

| Method | Description |
|--------|-------------|
| `recordEvent(input)` | Record a new event with HMAC + hash chain |
| `recordEventsBatch(inputs)` | Record multiple events atomically |
| `getEvent(id)` | Get event by ID |
| `queryEvents(options)` | Query with filtering/pagination |
| `countEvents(options)` | Count matching events |

### Integrity Methods

| Method | Description |
|--------|-------------|
| `verifyEventIntegrity(event)` | Verify single event HMAC/checksum |
| `verifyHashChain(guildId?, limit?)` | Verify chain continuity |
| `batchVerifyIntegrity(eventIds)` | Batch verify multiple events |

### Statistics

| Method | Description |
|--------|-------------|
| `getStats(guildId?)` | Get event statistics |

---

## RoleAuditService API

### Constructor

```typescript
constructor(prisma: PrismaClient, hmacSecret?: string)
```

### Core Methods

| Method | Description |
|--------|-------------|
| `recordChange(input)` | Record role change with HMAC + hash chain |
| `recordChangeBatch(inputs)` | Record multiple changes atomically |
| `getAudit(id)` | Get audit by ID |
| `queryAudits(options)` | Query with filtering/pagination |

### History Queries

| Method | Description |
|--------|-------------|
| `getMemberHistory(memberId, options)` | Get role changes for a member |
| `getRoleHistory(roleId, options)` | Get changes for a role |
| `getExecutorHistory(executorId, options)` | Get changes by an executor |

### Anomaly Detection

| Method | Description |
|--------|-------------|
| `detectAnomalies(guildId, windowMinutes)` | Detect rapid changes in time window |

### Statistics & Integrity

| Method | Description |
|--------|-------------|
| `getStats(guildId?)` | Get role change statistics |
| `verifyAuditIntegrity(audit)` | Verify HMAC + checksum |

---

## ThreatDetectionService API

### Constructor

```typescript
constructor(prisma: PrismaClient, hmacSecret?: string)
```

### Core Methods

| Method | Description |
|--------|-------------|
| `recordThreat(input)` | Record threat with MITRE ATT&CK mapping |
| `recordThreatsBatch(inputs)` | Batch record threats |
| `getThreat(id)` | Get threat by ID |
| `queryThreats(options)` | Query with filtering/pagination |

### Resolution Methods

| Method | Description |
|--------|-------------|
| `resolveThreat(id, resolution)` | Mark threat as resolved |
| `markFalsePositive(id, reason)` | Mark as false positive |
| `getUnresolvedThreats(guildId?)` | Get pending threats |

### Analysis Methods

| Method | Description |
|--------|-------------|
| `getByMitreAttackId(techniqueId)` | Get threats by MITRE ATT&CK ID |
| `getActiveThreatsByGuild(guildId)` | Get active threats for guild |
| `getStats(guildId?)` | Get threat statistics |

### MITRE ATT&CK Mapping

| Threat Type | Technique ID | Description |
|-------------|--------------|-------------|
| `RAPID_ROLE_CHANGE` | T1098 | Account Manipulation |
| `UNUSUAL_ORIGIN` | T1078 | Valid Accounts |
| `MASS_ROLE_REMOVAL` | T1531 | Account Access Removal |
| `OFF_HOURS_ACTIVITY` | T1078.004 | Cloud Accounts |
| `SINGLE_MEMBER_ANOMALY` | T1098.001 | Additional Cloud Credentials |

---

## BaselineService API

### Constructor

```typescript
constructor(prisma: PrismaClient, hmacSecret?: string)
```

### Core Methods

| Method | Description |
|--------|-------------|
| `getOrCreateBaseline(guildId)` | Get or create guild baseline |
| `computeBaseline(guildId, auditService)` | Compute from historical data |
| `updateFromActivity(guildId, activityData)` | Update with new activity |
| `getAllBaselines(options)` | List all baselines |

### Health & Freshness

| Method | Description |
|--------|-------------|
| `shouldRefresh(guildId, config?)` | Check if baseline needs refresh |
| `getBaselineHealth(guildId)` | Get health status |
| `batchComputeBaselines(guildIds, auditService)` | Batch compute baselines |

### Statistics

| Method | Description |
|--------|-------------|
| `getStats()` | Get baseline statistics |

### Default Baseline Values

```typescript
{
  avgRoleChangesPerDay: 5,
  peakHour: 14,
  commonExecutors: [],
  commonTargetRoles: [],
  lastMajorIncident: null,
  confidence: 0.3,  // Low initial confidence
}
```

---

## Usage Example

```typescript
import { PrismaClient } from '../../../generated/prisma/client.js';
import {
  SecurityEventService,
  RoleAuditService,
  ThreatDetectionService,
  BaselineService,
  SecuritySeverity,
  ThreatType,
} from './security/services';

const prisma = new PrismaClient();

// Initialize all services
const eventService = new SecurityEventService(prisma);
const auditService = new RoleAuditService(prisma);
const threatService = new ThreatDetectionService(prisma);
const baselineService = new BaselineService(prisma);

// Record a security event
const event = await eventService.recordEvent({
  eventType: 'role-permission-change',
  severity: SecuritySeverity.HIGH,
  guildId: '123456789',
  guildName: 'My Server',
  memberId: '987654321',
  memberTag: 'User#1234',
  roleId: '555555555',
  roleName: 'Admin',
  executorId: '111111111',
  executorTag: 'Moderator#5678',
  origin: 'security-bot-sweep',
  metadata: { permissionsBefore: [], permissionsAfter: ['ADMINISTRATOR'] },
});

// Record a threat detection
const threat = await threatService.recordThreat({
  guildId: '123456789',
  guildName: 'My Server',
  threatType: ThreatType.RAPID_ROLE_CHANGE,
  severity: SecuritySeverity.HIGH,
  memberId: '987654321',
  memberTag: 'User#1234',
  mitreAttackId: 'T1098',
  indicators: ['5 role changes in 60 seconds'],
  suggestedActions: ['Review recent role changes', 'Check audit log'],
  rawData: { changeCount: 5, windowSeconds: 60 },
});

// Compute guild baseline
const baseline = await baselineService.computeBaseline('123456789', auditService);
console.log(`Baseline confidence: ${baseline.confidence}`);

// Verify integrity
const isValid = eventService.verifyEventIntegrity(event);
console.log(`Event integrity: ${isValid ? 'VALID' : 'TAMPERED'}`);
```

---

## Integration Points

### Dependencies

- `../types/database-models.js` — Type definitions for security models
- `../../../shared/crypto/timing-safe.js` — HMAC and hash functions
- `../../../generated/prisma/client.js` — Prisma client

### Consumers

- `src/bot/main.js` — Will import services after migration
- `src/bot/ops/admin.ts` — `/ops security` command stats
- `src/workers/security-worker.ts` — Background sweep operations
- `src/bot/state/*.js` — Legacy modules being replaced

### Migration Path

1. **Phase 1 (P0-002):** Services created ✅
2. **Phase 2 (P0-003):** Migration scripts + rollback
3. **Phase 3:** Gradual main.js integration via feature flags (F5)
4. **Phase 4:** Legacy module deprecation

---

## Research References

- **P0-002:** Service Extraction from main.js ✅ COMPLETE
- **R6:** Immutable Audit Log (SOC 2)
- **S6:** Timing-Safe Crypto (CWE-208)
- **MASTER-PLAN.md:** Security model definitions

---

## Notes

- Type assertion (`PrismaClientWith*`) used until `prisma generate` is run
- HMAC secret defaults to `SECURITY_HMAC_SECRET` environment variable
- Hash chain links events chronologically for tamper detection
- All integrity checks use timing-safe comparison (CWE-208)
- MITRE ATT&CK IDs enable threat intelligence correlation
