# Security Bot Database Transformation — Commencement Plan

**Status:** 🚧 ACTIVE — Planning Complete  
**Project Code:** SECDB-2024-12  
**Start Date:** December 5, 2025  
**Target Completion:** January 16, 2026 (6 weeks)  

---

## 📊 Final Project Metrics (Post-3 Reviews)

| Metric | Original | Final | Growth |
|--------|----------|-------|--------|
| **Total Hours** | 62h | **223h** | +260% |
| **Total Tasks** | 14 | **46** | +229% |
| **Sprints** | 4 | **5** | +1 |
| **Duration** | 2 weeks | **6 weeks** | +4 weeks |
| **Research Citations** | 0 | **14** | — |

---

## 🎯 Mission Statement

Transform the Security Bot from file-based state persistence to a **hardened database-centric architecture** with:
- Multi-touchpoint integrity validation
- Server Admin role management with DRIP alerts
- Enterprise-grade SQL injection prevention
- Historical threat analysis capabilities

---

## 👥 Team Assembly

### Specialist Roster (Final)

| Specialist | Role | Primary Focus | Hours |
|------------|------|---------------|-------|
| **Security Specialist** | Lead (Final Review) | Vulnerability analysis, timing attacks, rate limiting | **45h** |
| **Database Architect** | Lead | Schema design, encryption, immutable audit | **53h** |
| **Architecture Specialist** | Support | Event sourcing, saga pattern, plugin system | **54h** |
| **Testing Specialist** | Support | Property-based testing, security regression | **38h** |
| **DevOps Specialist** | Support | Structured logging, health checks, metrics | **27h** |
| **Documentation Specialist** | Support | Executable docs, Mermaid diagrams, ADRs | **24h** |

### RACI Matrix

| Task | Security | Database | Backend | QA |
|------|----------|----------|---------|-----|
| Schema Design | C | R/A | C | I |
| Migration Strategy | C | R/A | C | I |
| Security Hardening | R/A | C | C | C |
| Admin Role Management | R | C | R/A | C |
| DRIP Alert Integration | C | I | R/A | C |
| Integrity Validation | R/A | R | C | C |
| Testing | C | C | C | R/A |

*R=Responsible, A=Accountable, C=Consulted, I=Informed*

---

## 📋 Phase 1: Foundation (Days 1-3)

### 1.1 Database Schema Implementation

**Owner:** Database Architect  
**Duration:** 1 day  

**Tasks:**
1. Create Prisma schema additions in `prisma/schema.prisma`
2. Add 6 new models: SecurityEvent, RoleChangeAudit, ThreatDetection, SecurityBaseline, PermissionSnapshot, AdminRoleRequest
3. Create migration: `npx prisma migrate dev --name security_bot_tables`
4. Validate foreign keys and indexes

**Acceptance Criteria:**
- [ ] All 6 models defined with proper types
- [ ] Indexes created for query optimization
- [ ] Migration runs without errors
- [ ] Schema validates against existing data

### 1.2 Security Service Extraction

**Owner:** Backend Engineer  
**Duration:** 1 day  

**Tasks:**
1. Create `src/services/security/` directory
2. Extract security logic from `main.js` into modular services:
   - `security-event-service.ts` — Event tracking
   - `role-audit-service.ts` — Role change auditing
   - `threat-service.ts` — Threat detection + storage
   - `baseline-service.ts` — Baseline management
   - `integrity-service.ts` — Multi-layer validation
3. Create service interfaces and types

**Acceptance Criteria:**
- [ ] Services follow repository pattern
- [ ] All services use Prisma client
- [ ] Type safety with TypeScript
- [ ] Unit tests for each service

### 1.3 Migration Strategy

**Owner:** Database Architect  
**Duration:** 1 day  

**Tasks:**
1. Create migration script: `scripts/migrate-security-state.ts`
2. Read existing JSON files from `/Store/security-bot-state/`
3. Transform to database format with validation
4. Implement rollback capability
5. Test on ONPREMISE-DEV-EXPERIMENT first

**Migration Flow:**
```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  JSON Files      │ ──► │  Transformer     │ ──► │  Database        │
│  /Store/...      │     │  (validation)    │     │  security_events │
└──────────────────┘     └──────────────────┘     └──────────────────┘
         │                                                │
         └──────────────── Rollback ◄────────────────────┘
```

**Acceptance Criteria:**
- [ ] All 500 archive entries migrated
- [ ] Baselines converted to per-guild records
- [ ] Threat history preserved
- [ ] Rollback tested and working

---

## 📋 Phase 2: Admin Role Management (Days 4-7)

### 2.1 Permission System Design

**Owner:** Security Specialist  
**Duration:** 1 day  

**Tasks:**
1. Define permission hierarchy (Super Admin > Server Admin > Moderator)
2. Create permission resolver: `src/services/security/permission-resolver.ts`
3. Implement role hierarchy validation
4. Add Discord permission mapping

**Permission Configuration:**
```typescript
export const SECURITY_PERMISSIONS = {
  SUPER_ADMIN: {
    users: ['1049161859555643433'], // DRIPTVDD
    permissions: ['*']
  },
  SERVER_ADMIN: {
    discordPermissions: ['Administrator', 'ManageRoles'],
    permissions: ['manage-roles', 'view-audit', 'manage-sweeps']
  },
  MODERATOR: {
    discordPermissions: ['ModerateMembers'],
    permissions: ['view-audit']
  }
};
```

### 2.2 Role Management Commands

**Owner:** Backend Engineer  
**Duration:** 2 days  

**Tasks:**
1. Create `/ops security roles` command group
2. Implement subcommands:
   - `add @user @role [reason]` — Add role with audit
   - `remove @user @role [reason]` — Remove role with audit
   - `audit [@user]` — View role change history
   - `pending` — View pending requests (Super Admin)
3. Add permission checks at command level
4. Integrate with DRIP alerts

**Command Flow:**
```
User: /ops security roles add @NewUser @Trainer reason:"New member onboarding"

┌─────────────────────────────────────────────────────────────┐
│ 1. Permission Check                                         │
│    ├── Is executor Server Admin or higher?                  │
│    ├── Is role within executor's hierarchy?                 │
│    └── Is target valid (not bot, not higher)?               │
│                                                             │
│ 2. Create Request Record                                    │
│    AdminRoleRequest { status: 'pending' }                   │
│                                                             │
│ 3. Execute Role Assignment                                  │
│    member.roles.add(roleId)                                 │
│                                                             │
│ 4. Update Records                                           │
│    ├── AdminRoleRequest { status: 'executed' }              │
│    ├── RoleChangeAudit { authorized: true }                 │
│    └── SecurityEvent { eventType: 'role-change' }           │
│                                                             │
│ 5. DRIP Alert to DRIPTVDD                                   │
│    "Server Admin added role Trainer to NewUser"             │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 DRIP Alert Integration

**Owner:** Backend Engineer  
**Duration:** 1 day  

**Tasks:**
1. Create `src/services/security/role-alert-service.ts`
2. Integrate with existing `dripAlerts.js` Event Bus
3. Define alert templates for role management
4. Add alert configuration (which events trigger DMs)

**Alert Template:**
```typescript
const ROLE_MANAGEMENT_ALERT = {
  severity: DRIP_ALERT_SEVERITY.notice,
  title: '🛡️ Role Management Alert',
  template: (data: RoleAlertData) => `
**Action:** ${data.action} role \`${data.roleName}\`
**Target:** ${data.targetTag} (${data.targetId})
**Executor:** ${data.executorTag}
**Guild:** ${data.guildName}
**Reason:** ${data.reason || 'No reason provided'}
**Time:** ${formatInTimeZone(data.timestamp, 'America/New_York', 'PPpp')}
  `
};
```

---

## 📋 Phase 3: Security Hardening (Days 8-11)

### 3.1 Input Sanitization Layer

**Owner:** Security Specialist  
**Duration:** 1 day  

**Tasks:**
1. Create `src/services/security/input-sanitizer.ts`
2. Implement validation for:
   - Discord IDs (17-19 digit strings)
   - Role names (max length, allowed characters)
   - Reason fields (XSS prevention)
   - JSON metadata (schema validation)
3. Add sanitization middleware for all security commands

**Sanitizers:**
```typescript
export const sanitizers = {
  discordId: (id: string) => {
    if (!/^\d{17,19}$/.test(id)) {
      throw new SecurityError('INVALID_DISCORD_ID', id);
    }
    return id;
  },
  roleName: (name: string) => {
    const sanitized = name.trim().slice(0, 100);
    if (/<script|javascript:|on\w+=/i.test(sanitized)) {
      throw new SecurityError('XSS_ATTEMPT', name);
    }
    return sanitized;
  },
  reason: (reason: string) => {
    return reason
      .trim()
      .slice(0, 500)
      .replace(/[<>]/g, ''); // Strip HTML tags
  }
};
```

### 3.2 Multi-Touchpoint Integrity

**Owner:** Security Specialist + Database Architect  
**Duration:** 2 days  

**Tasks:**
1. Implement Layer 2: Database checksums
   - Add `checksum` column to SecurityEvent, RoleChangeAudit
   - Compute on insert, validate on read
2. Implement Layer 3: Cross-reference validation
   - Archive ↔ Discord API sync check
   - Baseline ↔ Actual activity comparison
3. Implement Layer 4: Periodic integrity sweeps
   - Hourly: Row checksum spot-check
   - Daily: Full table validation
   - Weekly: Cross-system audit report

**Checksum Implementation:**
```typescript
function computeRowChecksum(row: SecurityEvent): string {
  const data = JSON.stringify({
    eventType: row.eventType,
    guildId: row.guildId,
    memberId: row.memberId,
    roleId: row.roleId,
    createdAt: row.createdAt.toISOString()
  });
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}
```

### 3.3 Vulnerability Assessment

**Owner:** Security Specialist  
**Duration:** 1 day  

**Tasks:**
1. Review all database queries for injection risks
2. Audit file path operations for traversal
3. Check permission checks for bypass vulnerabilities
4. Document findings in security report

**Checklist:**
- [ ] No raw SQL queries (Prisma only)
- [ ] All file paths sanitized
- [ ] Permission checks before every operation
- [ ] Rate limiting on admin commands
- [ ] Audit logging cannot be disabled
- [ ] HMAC secrets rotated periodically

---

## 📋 Phase 4: Validation & Documentation (Days 12-14)

### 4.1 Comprehensive Testing

**Owner:** QA Engineer  
**Duration:** 2 days  

**Test Categories:**
1. **Unit Tests** — Service layer (50+ tests)
2. **Integration Tests** — Database operations (20+ tests)
3. **Security Tests** — Injection attempts, bypass attempts (15+ tests)
4. **E2E Tests** — Full command flows (10+ tests)

**Test Scenarios:**
```typescript
describe('RoleAuditService', () => {
  it('should record authorized role addition', async () => { ... });
  it('should record unauthorized role change with revert', async () => { ... });
  it('should prevent SQL injection in reason field', async () => { ... });
  it('should validate Discord ID format', async () => { ... });
  it('should send DRIP alert on role change', async () => { ... });
});

describe('IntegrityService', () => {
  it('should detect tampered row via checksum', async () => { ... });
  it('should detect archive/Discord drift', async () => { ... });
  it('should heal corrupted baselines', async () => { ... });
});
```

### 4.2 Documentation

**Owner:** All Specialists  
**Duration:** 1 day  

**Deliverables:**
1. Update `docs/architecture-bible/` with security database design
2. Create `docs/operations-bible/security-admin-guide.md`
3. Update `docs/development-bible/` with new service patterns
4. Create runbook for security incident response

### 4.3 Staged Rollout

**Owner:** Database Architect + QA Engineer  
**Duration:** 1 day  

**Rollout Plan:**
1. **ONPREMISE-DEV-EXPERIMENT** — Full testing
2. **ONPREMISE-DEV-PRIMARY** — Staging validation
3. **CLOUD-PROD-MASTER** — Production deployment

**Rollback Plan:**
1. Keep JSON files for 7 days post-migration
2. Feature flag for database vs file persistence
3. Automated rollback on error threshold

---

## 📊 Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Migration Success | 100% | All 500 archive entries migrated |
| Test Coverage | 90%+ | Unit + integration tests |
| Security Vulnerabilities | 0 Critical | Security assessment |
| DRIP Alert Delivery | 100% | All role changes trigger alert |
| Query Performance | <100ms | P95 latency |
| Integrity Validation | 100% | All checksums valid |

---

## ⚠️ Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data loss during migration | Low | Critical | Backup + rollback capability |
| Permission bypass | Low | Critical | Security review + testing |
| Performance degradation | Medium | High | Index optimization + caching |
| DRIP alert spam | Medium | Medium | Rate limiting + aggregation |
| Checksum computation overhead | Low | Medium | Async computation + sampling |

---

## 🔗 Dependencies

### Internal Dependencies
- `src/shared/prisma.ts` — Database client
- `src/services/audit-service.ts` — Audit logging
- `src/bot/dripAlerts.js` — Alert system
- `src/shared/event-bus.ts` — Event publishing

### External Dependencies
- PostgreSQL 15+ (CLOUD-PROD-MASTER)
- Prisma 7.x with driver adapters
- Discord.js 14.x

---

## 📅 Timeline Summary (Final — 6 Weeks)

```
Sprint 0: Foundation Enhancement (12h)
├── Days 1-2: Plugin System Architecture
└── Days 2-3: Feature Flags System

Sprint 1: Database Foundation (66h)
├── Days 3-5: Schema + Service Extraction
├── Days 5-7: Migration + Checksums
├── Days 7-8: Key Rotation + Crypto Agility
├── Days 8-9: Column Encryption + Immutable Audit
└── Days 9-10: Structured Logging + Security Regression

Sprint 2: Admin Role Management (73h)
├── Days 11-13: Permission Resolver + Role Commands
├── Days 13-15: DRIP Integration + Circuit Breaker
├── Days 15-16: RLS + Token Bucket Rate Limit
├── Days 16-17: Event Sourcing
└── Days 17-18: Saga Pattern + Health Checks

Sprint 3: Security Hardening (48h)
├── Days 19-20: Input Sanitization + Embed Security
├── Days 20-22: Cross-Reference + Integrity Sweeps
├── Days 22-23: DI Container + Event-Driven
└── Days 23-24: Continuous Aggregates + ADRs

Sprint 4: Testing & Documentation (54h)
├── Days 25-27: Unit Tests + Property-Based + Snapshots
├── Days 27-28: Security Testing + E2E
├── Days 28-29: Documentation + Mermaid Diagrams
└── Days 29-30: Incident Playbook + Executable Docs
```

---

**Approved By:** All 6 Specialists ✅  
**Planning Sessions:** 3 Complete  
**Last Updated:** December 5, 2025  
**Revision:** 3.0 (Final)
