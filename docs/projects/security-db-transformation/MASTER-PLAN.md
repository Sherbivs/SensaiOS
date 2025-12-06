````markdown
# Security Bot Database Transformation — Master Plan

> **Document Version:** 1.0  
> **Created:** 2025-12-04  
> **Status:** 🚧 PLANNING PHASE  
> **Project Code:** SECDB-2025-12  
> **Estimated Effort:** 120+ hours across 7 specialist domains  
> **Target Completion:** 2-3 weeks from commencement

---

## Table of Contents

1. [Executive Vision](#executive-vision)
2. [Current Architecture Analysis](#current-architecture-analysis)
3. [Security Assessment](#security-assessment)
4. [Proposed Database Schema](#proposed-database-schema)
5. [Admin Role Management System](#admin-role-management-system)
6. [Multi-Touchpoint Integrity Validation](#multi-touchpoint-integrity-validation)
7. [Phase 1: Database Foundation Tasks](#phase-1-database-foundation)
8. [Phase 2: Admin Role Management Tasks](#phase-2-admin-role-management)
9. [Phase 3: Security Hardening Tasks](#phase-3-security-hardening)
10. [Phase 4: Integrity & Monitoring Tasks](#phase-4-integrity-monitoring)
11. [Agile Review & Refinement](#agile-review-refinement)
12. [Risk Register](#risk-register)
13. [Success Metrics](#success-metrics)

---

## Executive Vision

### Mission Statement

Transform the Security Bot from **file-based state persistence** to a **hardened database-centric architecture** with enterprise-grade security, multi-touchpoint integrity validation, and administrative role management capabilities — while preserving the battle-tested security features already implemented.

### Strategic Goals

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SECURITY BOT TRANSFORMATION VISION                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CURRENT STATE                      FUTURE STATE                            │
│  ═════════════                      ════════════                            │
│                                                                             │
│  ┌─────────────────┐               ┌─────────────────┐                     │
│  │   JSON Files    │               │   PostgreSQL    │                     │
│  │   /Store/...    │      ──►      │   + Prisma ORM  │                     │
│  │   (Ephemeral)   │               │   (Persistent)  │                     │
│  └─────────────────┘               └─────────────────┘                     │
│                                                                             │
│  ┌─────────────────┐               ┌─────────────────┐                     │
│  │  HMAC Signatures│               │  HMAC + DB      │                     │
│  │  (Single Layer) │      ──►      │  Checksums +    │                     │
│  │                 │               │  Cross-Ref (4x) │                     │
│  └─────────────────┘               └─────────────────┘                     │
│                                                                             │
│  ┌─────────────────┐               ┌─────────────────┐                     │
│  │  Owner-Only     │               │  Tiered Admins  │                     │
│  │  Role Mgmt      │      ──►      │  + DRIP Alerts  │                     │
│  │                 │               │  + Audit Trail  │                     │
│  └─────────────────┘               └─────────────────┘                     │
│                                                                             │
│  ┌─────────────────┐               ┌─────────────────┐                     │
│  │  In-Memory      │               │  Historical DB  │                     │
│  │  Threat Data    │      ──►      │  + Forensics    │                     │
│  │                 │               │  + Analytics    │                     │
│  └─────────────────┘               └─────────────────┘                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Deliverables

1. **Database Persistence Layer** — 6 new Prisma models for security data
2. **Admin Role Management** — Server Admin/Super Admin tiered permissions
3. **DRIP Alert System** — Real-time notifications to DRIPTVDD for all role changes
4. **4-Layer Integrity Validation** — HMAC + DB Checksums + Cross-Reference + Sweeps
5. **Migration Tooling** — Zero-downtime migration from JSON files
6. **Security Hardening** — Input sanitization, injection prevention, privilege escalation blocking

---

## Current Architecture Analysis

### Component Inventory

The Security Bot consists of **7 major components** totaling approximately **5,500+ lines of code**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SECURITY BOT COMPONENT MAP                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ENTRY POINTS                                                               │
│  ─────────────                                                              │
│  security-bot.js (15 lines) ─────► src/bot/main.js (3,893 lines)           │
│                                    └── Discord Client Bootstrap             │
│                                    └── Event Handlers (40+)                 │
│                                    └── Sweep Orchestration                  │
│                                    └── Permission Enforcement               │
│                                                                             │
│  STATE MANAGEMENT                                                           │
│  ────────────────                                                           │
│  src/bot/state/                                                             │
│  ├── persistence.js (350 lines)     File I/O + Auto-save + Snapshots       │
│  ├── roleArchive.js (500 lines)     HMAC-signed role change tracking       │
│  ├── threatDetector.js (280 lines)  5 MITRE ATT&CK patterns                │
│  ├── securityBaselines.js (371 lines) Behavioral baseline generation       │
│  ├── stats.js (~150 lines)          Cumulative statistics                  │
│  ├── timeline.js (~100 lines)       Activity timeline formatting           │
│  └── context.js (~100 lines)        Guild monitoring context               │
│                                                                             │
│  ALERT SYSTEM                                                               │
│  ────────────                                                               │
│  src/bot/dripAlerts.js (400+ lines)                                        │
│  └── Event Bus integration (Phase 2.4.3)                                   │
│  └── Severity levels: critical, security, warning, notice                  │
│  └── DM delivery to DRIPTVDD                                               │
│                                                                             │
│  PERSISTENCE                                                                │
│  ───────────                                                                │
│  /Store/security-bot-state/                                                │
│  ├── current.json           Active runtime state                           │
│  ├── previous.json          Backup from last restart                       │
│  └── snapshots/*.json       Hourly backups (7-day retention)               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Detailed Component Analysis

#### 1. Main Bot Logic (`src/bot/main.js` — 3,893 lines)

**Purpose:** Central Discord client with all security enforcement logic.

**Key Functions:**
| Function | Lines | Purpose |
|----------|-------|---------|
| `sweepRoles()` | ~200 | Periodic role validation sweep |
| `handleRoleAdd()` | ~150 | Role addition event handler |
| `handleRoleRemove()` | ~150 | Role removal event handler |
| `enforcePermissions()` | ~100 | Permission hierarchy enforcement |
| `healRole()` | ~80 | Revert unauthorized changes |
| `initializeState()` | ~60 | State loading on startup |

**Security Features Present:**
- ✅ Distributed locks (Redis with in-memory fallback)
- ✅ DoS protection (100 candidates/sweep cap)
- ✅ Permission hierarchy enforcement
- ✅ Owner/Admin-only role modifications
- ✅ Automatic revert of unauthorized changes

**Technical Debt:**
- ⚠️ Monolithic file (3,893 lines) — needs service extraction
- ⚠️ Mixed concerns (Discord events + business logic + persistence)
- ⚠️ No dependency injection (global state)

---

#### 2. Role Archive (`src/bot/state/roleArchive.js` — 500 lines)

**Purpose:** Tracks role changes with cryptographic signatures for tamper detection.

**Data Structure:**
```javascript
const archiveEntry = {
  timestamp: '2025-12-04T10:30:00Z',
  guildId: '123456789',
  guildName: 'Test Server',
  memberId: '987654321',
  memberTag: 'User#1234',
  changeType: 'addition',  // or 'removal'
  roleId: '111222333',
  roleName: 'Trainer',
  executorId: '555666777',
  executorTag: 'Admin#5678',
  origin: 'member-join',   // security-bot-sweep, admin-manual, etc.
  authorized: true,
  signature: 'hmac-sha256-signature'
};
```

**Security Features:**
- ✅ HMAC-SHA256 signatures per entry
- ✅ Signature verification on read
- ✅ 500-entry cold storage limit
- ✅ Automatic pruning of old entries
- ✅ Threat detector integration

**Current Flow:**
```
Role Change Event
       │
       ▼
┌─────────────────┐
│ Generate Entry  │
│ + HMAC Sign     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Add to Archive  │
│ (In-Memory)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Persist to JSON │
│ /Store/...      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Threat Detector │
│ Analysis        │
└─────────────────┘
```

---

#### 3. Threat Detector (`src/bot/state/threatDetector.js` — 280 lines)

**Purpose:** Identifies suspicious patterns using behavioral baselines.

**Detection Patterns (MITRE ATT&CK Mapped):**

| Pattern | MITRE ID | Description | Threshold |
|---------|----------|-------------|-----------|
| `rapid_role_changes` | T1098.003 | Many changes in short period | >10/minute |
| `unusual_origin` | T1078 | Unexpected change source | Not in whitelist |
| `mass_role_removal` | T1531 | Bulk removal attack | >5 removals/5min |
| `off_hours_activity` | T1078 | Activity outside normal hours | Non-peak hours |
| `single_member_anomaly` | T1098 | One member gets many roles | >3 roles/hour |

**Threat Response Flow:**
```
Archive Entry
      │
      ▼
┌───────────────────┐
│ Load Baseline     │
│ for Guild         │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Run 5 Detectors   │
│ Against Entry     │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐      ┌───────────────────┐
│ Threat Detected?  │──YES─►│ Generate Alert    │
│                   │      │ + DRIP Notify     │
└─────────┬─────────┘      └───────────────────┘
          │
          NO
          │
          ▼
┌───────────────────┐
│ Update Baseline   │
│ Statistics        │
└───────────────────┘
```

---

#### 4. Security Baselines (`src/bot/state/securityBaselines.js` — 371 lines)

**Purpose:** Generates behavioral baselines from historical archive data.

**Baseline Metrics:**
```typescript
interface SecurityBaseline {
  guildId: string;
  guildName: string;
  averageChangesPerHour: number;    // Rolling average
  averageChangesPerDay: number;     // Rolling average
  peakActivityHours: number[];      // Array of hours (0-23)
  rapidChangeThreshold: number;     // Calculated from stddev
  expectedOrigins: string[];        // Whitelist of normal sources
  maxChangesPerMember: number;      // Per-member limit
  confidenceLevel: number;          // 0-1 based on data points
  dataPointCount: number;           // Number of entries analyzed
  computedAt: Date;                 // Last computation time
}
```

**Baseline Generation Algorithm:**
1. Load last 500 archive entries for guild
2. Calculate time-based statistics (hourly, daily averages)
3. Identify peak activity hours (>1 stddev above mean)
4. Compute per-member change limits
5. Build origin whitelist from observed sources
6. Set confidence based on data point count

---

#### 5. DRIP Alert System (`src/bot/dripAlerts.js` — 400+ lines)

**Purpose:** Event Bus-based alert system with DM delivery to DRIPTVDD.

**Alert Severity Levels:**
| Level | Use Case | Delivery |
|-------|----------|----------|
| `critical` | System failures, security breaches | Immediate DM |
| `security` | Threat detections, unauthorized access | Immediate DM |
| `warning` | Anomalies, threshold violations | Batched (5min) |
| `notice` | Informational, status updates | Batched (15min) |

**Event Bus Integration:**
```javascript
// Publishing an alert
eventBus.publish({
  type: 'security.alert',
  severity: 'security',
  data: {
    title: 'Rapid Role Changes Detected',
    guildId: '123456789',
    details: '15 role changes in 2 minutes',
    recommendedAction: 'Review recent activity'
  }
});

// DRIP handler subscribes to security.* events
eventBus.subscribe('security.*', async (event) => {
  await sendDripAlert(DRIPTVDD_ID, formatAlert(event));
});
```

---

#### 6. State Persistence (`src/bot/state/persistence.js` — 350 lines)

**Purpose:** JSON file-based state persistence with auto-save and snapshots.

**State Structure:**
```
/Store/security-bot-state/
├── current.json          ← Active runtime state
│   ├── restartCount
│   ├── totalUptime
│   ├── lastRestartTime
│   ├── guilds: { [guildId]: GuildContext }
│   ├── archive: RoleChangeEntry[]
│   ├── baselines: { [guildId]: Baseline }
│   └── stats: CumulativeStats
│
├── previous.json         ← Backup from last restart
│
└── snapshots/
    ├── 2025-12-04T10-00-00Z.json
    ├── 2025-12-04T11-00-00Z.json
    └── ... (7-day retention)
```

**Persistence Lifecycle:**
```
┌─────────────────────────────────────────────────────────────────┐
│                    STATE PERSISTENCE LIFECYCLE                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  STARTUP                                                        │
│  ───────                                                        │
│  1. Load current.json (or previous.json if corrupt)             │
│  2. Validate state structure                                    │
│  3. Restore archive, baselines, stats                           │
│  4. Increment restartCount                                      │
│                                                                 │
│  RUNTIME                                                        │
│  ───────                                                        │
│  • Auto-save every 5 minutes                                    │
│  • Hourly snapshot to snapshots/                                │
│  • State updates on every role change                           │
│                                                                 │
│  SHUTDOWN                                                       │
│  ────────                                                       │
│  1. Save current state to current.json                          │
│  2. Copy current.json to previous.json                          │
│  3. Create final snapshot                                       │
│  4. Log shutdown statistics                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### Existing Security Features (Week 1-5 Hardening Complete)

The Security Bot already has significant hardening from a 5-week security project:

| Feature | Status | Implementation |
|---------|--------|----------------|
| HMAC-SHA256 Archive | ✅ Complete | `roleArchive.js` |
| Distributed Locks | ✅ Complete | Redis + in-memory fallback |
| DoS Protection | ✅ Complete | 100/sweep cap |
| Permission Hierarchy | ✅ Complete | Owner > Admin > Moderator |
| Threat Detection | ✅ Complete | 5 MITRE patterns |
| Event Bus Alerts | ✅ Complete | Phase 2.4.3 |
| Prometheus Metrics | ✅ Complete | 11 metric types |
| 7-Day State Persistence | ✅ Complete | Hourly snapshots |

**Source:** `docs/security/SECURITY-HARDENING-PROJECT.md`

---

## Security Assessment

### Current Security Posture

**Strengths:**
1. ✅ Cryptographic integrity (HMAC-SHA256)
2. ✅ Race condition protection (distributed locks)
3. ✅ Rate limiting (DoS prevention)
4. ✅ Permission enforcement (strict hierarchy)
5. ✅ Real-time threat detection
6. ✅ Event-driven alerting

**Gaps Identified:**

| Gap | Risk Level | Impact | Proposed Solution |
|-----|------------|--------|-------------------|
| File-based persistence | HIGH | Data loss if /Store corrupted | PostgreSQL migration |
| Single integrity layer | MEDIUM | HMAC key compromise = full breach | 4-layer validation |
| No admin self-service | LOW | Bottleneck on role management | Admin commands |
| No historical queries | MEDIUM | Cannot analyze past incidents | Database storage |
| No cross-reference validation | MEDIUM | Archive drift from reality | Discord API sync |
| Monolithic codebase | LOW | Hard to test/maintain | Service extraction |

### Threat Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SECURITY THREAT MODEL                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  THREAT ACTORS                                                              │
│  ─────────────                                                              │
│  • Malicious Server Members (privilege escalation)                          │
│  • Compromised Admin Accounts (credential theft)                            │
│  • External Attackers (injection, API abuse)                                │
│  • Insider Threats (authorized misuse)                                      │
│                                                                             │
│  ATTACK VECTORS                                                             │
│  ──────────────                                                             │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐                │
│  │ SQL Injection  │  │ File Tampering │  │ Privilege      │                │
│  │ (Mitigated by  │  │ (Mitigated by  │  │ Escalation     │                │
│  │  Prisma ORM)   │  │  HMAC + DB)    │  │ (Needs work)   │                │
│  └────────────────┘  └────────────────┘  └────────────────┘                │
│                                                                             │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐                │
│  │ Archive Drift  │  │ Replay Attacks │  │ DoS via Flood  │                │
│  │ (Needs cross-  │  │ (Timestamps +  │  │ (Rate limited) │                │
│  │  reference)    │  │  nonces)       │  │                │                │
│  └────────────────┘  └────────────────┘  └────────────────┘                │
│                                                                             │
│  ASSETS AT RISK                                                             │
│  ──────────────                                                             │
│  • Role assignments (integrity)                                             │
│  • Permission hierarchy (confidentiality)                                   │
│  • Audit trail (availability)                                               │
│  • Guild configuration (integrity)                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Proposed Database Schema

### Schema Design Philosophy

1. **Immutable Audit Trail** — Events are INSERT-only, never updated
2. **Checksums at Rest** — Every row has integrity validation
3. **Normalized References** — Guild/Role/Member IDs as foreign keys where applicable
4. **Time-Series Ready** — Timestamps on all tables for TimescaleDB potential
5. **Query Optimized** — Indexes for common access patterns

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SECURITY DATABASE SCHEMA                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────┐         ┌───────────────────┐                       │
│  │  SecurityEvent    │         │  RoleChangeAudit  │                       │
│  ├───────────────────┤         ├───────────────────┤                       │
│  │ id (PK)           │         │ id (PK)           │                       │
│  │ eventType         │         │ guildId           │                       │
│  │ severity          │◄────────│ memberId          │                       │
│  │ guildId           │  logs   │ changeType        │                       │
│  │ memberId          │         │ roleId            │                       │
│  │ roleId            │         │ executorId        │                       │
│  │ executorId        │         │ authorized        │                       │
│  │ origin            │         │ reverted          │                       │
│  │ metadata (JSON)   │         │ origin            │                       │
│  │ signature         │         │ checksum          │                       │
│  │ checksum          │         │ createdAt         │                       │
│  │ createdAt         │         └───────────────────┘                       │
│  └───────────────────┘                  │                                  │
│           │                             │ triggers                          │
│           │                             ▼                                  │
│           │                   ┌───────────────────┐                       │
│           │                   │  ThreatDetection  │                       │
│           │                   ├───────────────────┤                       │
│           │                   │ id (PK)           │                       │
│           │  detects          │ threatType        │                       │
│           └──────────────────►│ severity          │                       │
│                               │ confidence        │                       │
│                               │ guildId           │                       │
│                               │ evidence (JSON)   │                       │
│                               │ mitreAttack       │                       │
│                               │ resolved          │                       │
│                               │ createdAt         │                       │
│                               └───────────────────┘                       │
│                                                                             │
│  ┌───────────────────┐         ┌───────────────────┐                       │
│  │ SecurityBaseline  │         │ PermissionSnapshot│                       │
│  ├───────────────────┤         ├───────────────────┤                       │
│  │ id (PK)           │         │ id (PK)           │                       │
│  │ guildId (UNIQUE)  │         │ guildId           │                       │
│  │ avgChangesPerHour │         │ roleId            │                       │
│  │ avgChangesPerDay  │         │ permissions[]     │                       │
│  │ peakActivityHours │         │ position          │                       │
│  │ rapidThreshold    │         │ signature         │                       │
│  │ expectedOrigins[] │         │ capturedAt        │                       │
│  │ confidenceLevel   │         └───────────────────┘                       │
│  │ computedAt        │                                                     │
│  └───────────────────┘                                                     │
│                                                                             │
│  ┌───────────────────┐                                                     │
│  │ AdminRoleRequest  │                                                     │
│  ├───────────────────┤                                                     │
│  │ id (PK)           │                                                     │
│  │ guildId           │                                                     │
│  │ requesterId       │                                                     │
│  │ targetMemberId    │                                                     │
│  │ roleId            │                                                     │
│  │ action            │                                                     │
│  │ status            │                                                     │
│  │ approvedBy        │                                                     │
│  │ dripAlertSent     │                                                     │
│  │ createdAt         │                                                     │
│  └───────────────────┘                                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Prisma Schema Definition

```prisma
// ============================================================================
// SECURITY BOT DATABASE MODELS
// ============================================================================

/// Core security event tracking — immutable audit trail
model SecurityEvent {
  id            BigInt   @id @default(autoincrement())
  
  // Event classification
  eventType     String   // role-change, threat-detected, permission-violation, sweep, startup, shutdown
  severity      String   // CRITICAL, HIGH, MEDIUM, LOW, INFO
  
  // Context
  guildId       String
  guildName     String
  memberId      String?
  memberTag     String?
  roleId        String?
  roleName      String?
  executorId    String?
  executorTag   String?
  origin        String   // security-bot-sweep, admin-manual, member-join, role-reaction, api-direct
  
  // Payload
  metadata      Json?    // Additional event-specific data
  
  // Integrity
  signature     String?  // HMAC-SHA256 signature
  checksum      String   // Row checksum for tampering detection
  
  // Timestamps
  createdAt     DateTime @default(now())

  @@index([eventType, createdAt(sort: Desc)])
  @@index([guildId, createdAt(sort: Desc)])
  @@index([severity, createdAt(sort: Desc)])
  @@index([memberId, createdAt(sort: Desc)])
  @@map("security_events")
}

/// Role change audit trail — detailed tracking of every role modification
model RoleChangeAudit {
  id              BigInt   @id @default(autoincrement())
  
  // Guild context
  guildId         String
  guildName       String
  
  // Target member
  memberId        String
  memberTag       String
  
  // Change details
  changeType      String   // addition, removal
  roleId          String
  roleName        String
  rolePosition    Int?     // Role hierarchy position at time of change
  
  // Executor context
  executorId      String
  executorTag     String
  executorRoles   String[] // Executor's roles at time of action
  
  // Authorization
  authorized      Boolean  // Was this change authorized?
  authReason      String?  // Why authorized/unauthorized
  
  // Reversion tracking
  reverted        Boolean  @default(false)
  revertedAt      DateTime?
  revertedBy      String?
  revertReason    String?
  
  // Source tracking
  origin          String   // sweep, member-join, admin-manual, security-bot-revert, role-reaction
  
  // Integrity
  checksum        String   // Row checksum
  
  // Metadata
  metadata        Json?    // Additional context
  createdAt       DateTime @default(now())

  @@index([guildId, createdAt(sort: Desc)])
  @@index([memberId, createdAt(sort: Desc)])
  @@index([executorId, createdAt(sort: Desc)])
  @@index([authorized, createdAt(sort: Desc)])
  @@index([reverted])
  @@map("role_change_audit")
}

/// Threat detection history — forensics and incident response
model ThreatDetection {
  id                BigInt   @id @default(autoincrement())
  
  // Threat classification
  threatType        String   // rapid_role_changes, unusual_origin, mass_role_removal, off_hours_activity, single_member_anomaly
  severity          String   // CRITICAL, HIGH, MEDIUM
  confidence        Float    // 0.0 - 1.0 confidence score
  
  // Context
  guildId           String
  guildName         String
  
  // Details
  description       String   // Human-readable description
  evidence          Json     // Detailed evidence for forensics
  triggeringEntryId BigInt?  // ID of RoleChangeAudit that triggered detection
  
  // MITRE ATT&CK mapping
  mitreAttack       String?  // T1098.003, T1078, T1531, etc.
  mitreTactic       String?  // Persistence, Privilege Escalation, etc.
  
  // Recommended response
  recommendedAction String
  autoMitigated     Boolean  @default(false)
  mitigationAction  String?  // What automatic action was taken
  
  // Resolution tracking
  resolved          Boolean  @default(false)
  resolvedBy        String?
  resolvedAt        DateTime?
  resolutionNotes   String?
  falsePositive     Boolean  @default(false)
  
  // Timestamps
  createdAt         DateTime @default(now())

  @@index([threatType, createdAt(sort: Desc)])
  @@index([guildId, createdAt(sort: Desc)])
  @@index([severity, createdAt(sort: Desc)])
  @@index([resolved])
  @@index([falsePositive])
  @@map("threat_detections")
}

/// Security baselines — per-guild behavioral patterns
model SecurityBaseline {
  id                      BigInt   @id @default(autoincrement())
  
  // Guild identification
  guildId                 String   @unique
  guildName               String
  
  // Activity metrics
  averageChangesPerHour   Float
  averageChangesPerDay    Float
  peakActivityHours       Int[]    // Array of hours (0-23) with high activity
  
  // Thresholds
  rapidChangeThreshold    Int      // Changes/minute that triggers alert
  maxChangesPerMember     Int      // Per-member limit per hour
  
  // Expected patterns
  expectedOrigins         String[] // Whitelist of normal change origins
  
  // Confidence
  confidenceLevel         Float    // 0.0 - 1.0 based on data quantity
  dataPointCount          Int      // Number of entries used for computation
  
  // Timestamps
  computedAt              DateTime // When baseline was last computed
  updatedAt               DateTime @updatedAt

  @@index([guildId])
  @@map("security_baselines")
}

/// Permission snapshots — point-in-time role permission capture
model PermissionSnapshot {
  id            BigInt   @id @default(autoincrement())
  
  // Role identification
  guildId       String
  guildName     String
  roleId        String
  roleName      String
  
  // Permission state
  permissions   String[] // Array of Discord permission flags
  position      Int      // Role hierarchy position
  color         Int?     // Role color (for display)
  hoist         Boolean  // Whether role is displayed separately
  mentionable   Boolean  // Whether role can be mentioned
  
  // Integrity
  signature     String   // HMAC signature of permissions array
  
  // Timestamp
  capturedAt    DateTime @default(now())

  @@index([guildId, roleId])
  @@index([capturedAt(sort: Desc)])
  @@unique([guildId, roleId, capturedAt])
  @@map("permission_snapshots")
}

/// Admin role management requests — workflow tracking
model AdminRoleRequest {
  id               BigInt   @id @default(autoincrement())
  
  // Guild context
  guildId          String
  guildName        String
  
  // Requester (Admin making the request)
  requesterId      String
  requesterTag     String
  requesterRoles   String[] // Roles at time of request
  
  // Target member
  targetMemberId   String
  targetMemberTag  String
  
  // Role being modified
  roleId           String
  roleName         String
  rolePosition     Int      // Role hierarchy position
  
  // Request details
  action           String   // add, remove
  reason           String?  // Optional reason provided
  
  // Workflow status
  status           String   // pending, approved, rejected, executed, failed, cancelled
  
  // Approval tracking (for Super Admin approval workflow)
  requiresApproval Boolean  @default(false)
  approvedBy       String?
  approvedAt       DateTime?
  rejectedBy       String?
  rejectedAt       DateTime?
  rejectionReason  String?
  
  // Execution tracking
  executedAt       DateTime?
  executionResult  String?  // success, failed, partial
  executionError   String?  // Error message if failed
  
  // DRIP alert tracking
  dripAlertSent    Boolean  @default(false)
  dripAlertId      String?  // Message ID of sent alert
  dripAlertSentAt  DateTime?
  
  // Metadata
  metadata         Json?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([guildId, createdAt(sort: Desc)])
  @@index([requesterId, createdAt(sort: Desc)])
  @@index([status])
  @@index([targetMemberId])
  @@map("admin_role_requests")
}
```

### Index Strategy

| Table | Index | Purpose | Expected Query Pattern |
|-------|-------|---------|------------------------|
| `security_events` | `(eventType, createdAt DESC)` | Filter by type, recent first | "Show all role-change events" |
| `security_events` | `(guildId, createdAt DESC)` | Guild-specific history | "Show events for this guild" |
| `security_events` | `(severity, createdAt DESC)` | Severity filtering | "Show all CRITICAL events" |
| `role_change_audit` | `(memberId, createdAt DESC)` | Member history | "Show role changes for user X" |
| `role_change_audit` | `(executorId, createdAt DESC)` | Executor history | "Show changes made by admin Y" |
| `role_change_audit` | `(authorized, createdAt DESC)` | Authorization audit | "Show unauthorized changes" |
| `threat_detections` | `(resolved)` | Open threats | "Show unresolved threats" |
| `threat_detections` | `(falsePositive)` | Tuning queries | "Show false positives for tuning" |

---

## Admin Role Management System

### Permission Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ADMIN PERMISSION HIERARCHY                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         SUPER ADMIN                                  │   │
│  │  Discord User ID: 1049161859555643433 (DRIPTVDD)                    │   │
│  │                                                                      │   │
│  │  Permissions:                                                        │   │
│  │  ✅ Manage ALL roles regardless of hierarchy                         │   │
│  │  ✅ Approve/reject Server Admin requests                             │   │
│  │  ✅ Configure security policies                                      │   │
│  │  ✅ View complete audit trail                                        │   │
│  │  ✅ Mark threats as resolved/false-positive                          │   │
│  │  ✅ Override security bot actions                                    │   │
│  │                                                                      │   │
│  │  Alerts Received: ALL role changes, ALL threats, system events      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        SERVER ADMIN                                  │   │
│  │  Discord Permission: Administrator OR ManageRoles                   │   │
│  │                                                                      │   │
│  │  Permissions:                                                        │   │
│  │  ✅ Manage roles BELOW their highest role position                   │   │
│  │  ✅ View audit trail for their guild                                 │   │
│  │  ✅ Trigger manual sweeps                                            │   │
│  │  ❌ Cannot self-assign higher roles                                  │   │
│  │  ❌ Cannot modify roles above their position                         │   │
│  │  ❌ Some actions require Super Admin approval                        │   │
│  │                                                                      │   │
│  │  Triggers DRIP Alert: Every role change action                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         MODERATOR                                    │   │
│  │  Discord Permission: ModerateMembers                                │   │
│  │                                                                      │   │
│  │  Permissions:                                                        │   │
│  │  ✅ View audit trail for their guild (read-only)                     │   │
│  │  ❌ Cannot modify roles                                              │   │
│  │  ❌ Cannot trigger sweeps                                            │   │
│  │  ❌ Cannot approve requests                                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                          MEMBER                                      │   │
│  │  Default Discord member                                             │   │
│  │                                                                      │   │
│  │  Permissions:                                                        │   │
│  │  ❌ No security bot access                                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Command Interface

```
/ops security roles add @user @role [reason]
/ops security roles remove @user @role [reason]
/ops security audit [user] [limit]
/ops security threats [status] [severity]
/ops security baseline [guild]
/ops security sweep [force]
```

### DRIP Alert Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DRIP ALERT FLOW FOR ROLE CHANGES                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Server Admin executes: /ops security roles add @NewUser @Trainer           │
│                                                                             │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  STEP 1: Permission Validation                                       │   │
│  │  ├── Is executor Server Admin or higher? ✓                          │   │
│  │  ├── Is Trainer role below executor's highest role? ✓               │   │
│  │  ├── Is NewUser a valid, non-bot member? ✓                          │   │
│  │  └── Does action require Super Admin approval? (check rules)        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  STEP 2: Create AdminRoleRequest                                     │   │
│  │  {                                                                   │   │
│  │    status: 'pending',                                                │   │
│  │    requesterId: '555666777',                                         │   │
│  │    targetMemberId: '987654321',                                      │   │
│  │    roleId: '111222333',                                              │   │
│  │    action: 'add'                                                     │   │
│  │  }                                                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  STEP 3: Execute Role Assignment                                     │   │
│  │  await member.roles.add(roleId, reason);                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  STEP 4: Create Audit Records                                        │   │
│  │  ├── AdminRoleRequest → status: 'executed'                          │   │
│  │  ├── RoleChangeAudit → authorized: true, origin: 'admin-manual'     │   │
│  │  └── SecurityEvent → eventType: 'role-change', severity: 'INFO'     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  STEP 5: Send DRIP Alert to DRIPTVDD                                 │   │
│  │                                                                      │   │
│  │  🛡️ **Role Management Alert**                                        │   │
│  │  **Action:** Added role `Trainer`                                    │   │
│  │  **Target:** NewUser#5678 (987654321)                                │   │
│  │  **Executor:** AdminUser#1234 (555666777)                            │   │
│  │  **Guild:** Test Server                                              │   │
│  │  **Time:** Dec 4, 2025 @ 2:30 PM EST                                 │   │
│  │                                                                      │   │
│  │  [View Full Audit] [Revert Change]                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  STEP 6: Update Request with Alert Status                            │   │
│  │  AdminRoleRequest → dripAlertSent: true, dripAlertId: '...'         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Multi-Touchpoint Integrity Validation

### 4-Layer Integrity Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    4-LAYER INTEGRITY VALIDATION                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  LAYER 1: CRYPTOGRAPHIC SIGNATURES (Existing)                              │
│  ═════════════════════════════════════════════                              │
│  • HMAC-SHA256 on archive entries                                          │
│  • HMAC-SHA256 on permission snapshots                                     │
│  • Signature verification on every read                                    │
│  • Key rotation support                                                    │
│                                                                             │
│  Implementation: roleArchive.js generateSignature() / verifySignature()    │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  entry.signature = HMAC-SHA256(                                      │  │
│  │    JSON.stringify({ timestamp, guildId, memberId, changeType, ... }),│  │
│  │    SECRET_KEY                                                        │  │
│  │  )                                                                   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  LAYER 2: DATABASE CHECKSUMS (New)                                         │
│  ═════════════════════════════════                                         │
│  • SHA-256 checksum column on every row                                    │
│  • Computed on INSERT, validated on SELECT                                 │
│  • Covers all data columns (excludes id, timestamps)                       │
│  • Detects unauthorized direct database modifications                      │
│                                                                             │
│  Implementation: Prisma middleware + computed column                       │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  row.checksum = SHA256(                                              │  │
│  │    eventType + guildId + memberId + roleId + JSON.stringify(metadata)│  │
│  │  ).slice(0, 16)  // First 16 chars                                   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  LAYER 3: CROSS-REFERENCE VALIDATION (New)                                 │
│  ═════════════════════════════════════════                                 │
│  • Compare database records against Discord API                            │
│  • Detect drift between stored state and reality                           │
│  • Identify missing events (changes that bypassed bot)                     │
│  • Reconcile discrepancies with audit trail                                │
│                                                                             │
│  Implementation: Scheduled validation job (hourly)                         │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Discord API                    Database                             │  │
│  │  ────────────                    ────────                             │  │
│  │  member.roles = [A, B, C]   vs   lastKnownRoles = [A, B]             │  │
│  │                                                                      │  │
│  │  → Detected: Role C added without database record                    │  │
│  │  → Action: Create SecurityEvent (drift-detected), alert DRIPTVDD    │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  LAYER 4: PERIODIC INTEGRITY SWEEPS (New)                                  │
│  ════════════════════════════════════════                                  │
│  • Hourly: Spot-check 100 random rows for checksum validity               │
│  • Daily: Full table checksum validation                                  │
│  • Weekly: Complete cross-reference audit with report                     │
│  • Monthly: Signature key rotation verification                           │
│                                                                             │
│  Implementation: Cron jobs + sweep service                                 │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  SWEEP SCHEDULE:                                                     │  │
│  │  ├── Hourly:  SELECT * FROM security_events ORDER BY RANDOM()        │  │
│  │  │            LIMIT 100; → Validate checksums                        │  │
│  │  ├── Daily:   Full scan of role_change_audit → Validate all          │  │
│  │  ├── Weekly:  Cross-ref all guilds → Discord API comparison          │  │
│  │  └── Monthly: Verify HMAC keys still valid                           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Integrity Violation Response

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    INTEGRITY VIOLATION RESPONSE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  VIOLATION DETECTED                                                        │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  1. Classify Violation                                               │   │
│  │     ├── CHECKSUM_MISMATCH: Row tampered in database                 │   │
│  │     ├── SIGNATURE_INVALID: HMAC verification failed                 │   │
│  │     ├── CROSS_REF_DRIFT: Database/Discord mismatch                  │   │
│  │     └── MISSING_RECORD: Change occurred without logging             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  2. Create ThreatDetection Record                                    │   │
│  │     threatType: 'integrity_violation'                               │   │
│  │     severity: 'CRITICAL'                                            │   │
│  │     evidence: { violationType, affectedRows, discrepancies }        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  3. Send CRITICAL Alert to DRIPTVDD                                  │   │
│  │     🚨 **INTEGRITY VIOLATION DETECTED**                              │   │
│  │     Type: Database row checksum mismatch                            │   │
│  │     Table: role_change_audit                                        │   │
│  │     Affected Rows: 3                                                │   │
│  │     Action Required: Immediate investigation                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  4. Automatic Mitigation (if enabled)                                │   │
│  │     ├── Quarantine affected records (soft flag)                     │   │
│  │     ├── Pause role operations for affected guild                    │   │
│  │     └── Await manual resolution                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Database Foundation

### P0-001: Prisma Schema Implementation
| Field | Value |
|-------|-------|
| **Specialist** | Database Architect (lead) |
| **Effort** | 4 hours |
| **Priority** | P0 - Critical |
| **Dependencies** | None |

**Tasks:**
1. [ ] Add 6 security models to `prisma/schema.prisma`
2. [ ] Create migration: `npx prisma migrate dev --name security_bot_tables`
3. [ ] Validate indexes created correctly
4. [ ] Test migration on ONPREMISE-DEV-EXPERIMENT

**Acceptance Criteria:**
- [ ] All 6 models created with proper types
- [ ] 15+ indexes for query optimization
- [ ] Migration runs without errors
- [ ] Prisma Client generates successfully

---

### P0-002: Security Service Extraction
| Field | Value |
|-------|-------|
| **Specialist** | Backend Engineer (lead), Architecture |
| **Effort** | 8 hours |
| **Priority** | P0 - Critical |
| **Dependencies** | P0-001 |

**Tasks:**
1. [ ] Create `src/services/security/` directory structure
2. [ ] Extract `SecurityEventService` from main.js
3. [ ] Extract `RoleAuditService` from roleArchive.js
4. [ ] Extract `ThreatService` from threatDetector.js
5. [ ] Extract `BaselineService` from securityBaselines.js
6. [ ] Create `IntegrityService` (new)
7. [ ] Create service interfaces and factory

**File Structure:**
```
src/services/security/
├── index.ts                    # Service exports
├── security-event-service.ts   # Event tracking
├── role-audit-service.ts       # Role change auditing
├── threat-service.ts           # Threat detection
├── baseline-service.ts         # Baseline management
├── integrity-service.ts        # 4-layer validation
├── types.ts                    # Shared types
└── constants.ts                # Security constants
```

**Acceptance Criteria:**
- [ ] All services use Prisma client
- [ ] Type-safe with TypeScript
- [ ] No direct file I/O in services
- [ ] Unit testable (dependency injection)

---

### P0-003: JSON to Database Migration
| Field | Value |
|-------|-------|
| **Specialist** | Database Architect (lead) |
| **Effort** | 6 hours |
| **Priority** | P0 - Critical |
| **Dependencies** | P0-001, P0-002 |

**Tasks:**
1. [ ] Create `scripts/migrate-security-state.ts`
2. [ ] Read existing JSON from `/Store/security-bot-state/`
3. [ ] Transform archive entries to RoleChangeAudit records
4. [ ] Transform baselines to SecurityBaseline records
5. [ ] Generate initial SecurityEvents from archive
6. [ ] Implement rollback capability
7. [ ] Test on ONPREMISE-DEV-EXPERIMENT first

**Migration Script Outline:**
```typescript
// scripts/migrate-security-state.ts
async function migrateSecurityState() {
  // 1. Load existing JSON files
  const currentState = await loadJSON('Store/security-bot-state/current.json');
  
  // 2. Migrate archive entries (500 max)
  for (const entry of currentState.archive) {
    await prisma.roleChangeAudit.create({
      data: transformArchiveEntry(entry)
    });
  }
  
  // 3. Migrate baselines
  for (const [guildId, baseline] of Object.entries(currentState.baselines)) {
    await prisma.securityBaseline.create({
      data: transformBaseline(guildId, baseline)
    });
  }
  
  // 4. Create migration event
  await prisma.securityEvent.create({
    data: {
      eventType: 'migration-complete',
      severity: 'INFO',
      metadata: { entriesMigrated: currentState.archive.length }
    }
  });
}
```

**Acceptance Criteria:**
- [ ] All 500 archive entries migrated
- [ ] Baselines converted to per-guild records
- [ ] Checksums computed for all records
- [ ] Rollback tested and working

---

### P0-004: Database Checksum Implementation
| Field | Value |
|-------|-------|
| **Specialist** | Security Specialist (lead), Database |
| **Effort** | 4 hours |
| **Priority** | P0 - Critical |
| **Dependencies** | P0-001 |

**Tasks:**
1. [ ] Create `src/services/security/checksum-service.ts`
2. [ ] Implement row checksum computation
3. [ ] Create Prisma middleware for auto-checksum on INSERT
4. [ ] Create validation function for SELECT
5. [ ] Add checksum verification to all read operations

**Implementation:**
```typescript
// src/services/security/checksum-service.ts
import crypto from 'crypto';

export function computeRowChecksum(data: Record<string, unknown>): string {
  const normalized = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

export function verifyRowChecksum(row: { checksum: string }, data: Record<string, unknown>): boolean {
  const computed = computeRowChecksum(data);
  return row.checksum === computed;
}

// Prisma middleware
prisma.$use(async (params, next) => {
  if (params.action === 'create' && CHECKSUMMED_MODELS.includes(params.model)) {
    params.args.data.checksum = computeRowChecksum(params.args.data);
  }
  return next(params);
});
```

**Acceptance Criteria:**
- [ ] Checksums auto-computed on INSERT
- [ ] Verification on every SELECT
- [ ] Tamper detection working (modify row → checksum fails)

---

## Phase 2: Admin Role Management

### P1-001: Permission Resolver Service
| Field | Value |
|-------|-------|
| **Specialist** | Security Specialist (lead) |
| **Effort** | 4 hours |
| **Priority** | P1 - High |
| **Dependencies** | P0-002 |

**Tasks:**
1. [ ] Create `src/services/security/permission-resolver.ts`
2. [ ] Define permission hierarchy constants
3. [ ] Implement `resolvePermissionLevel()` function
4. [ ] Implement `canManageRole()` validation
5. [ ] Implement `canManageMember()` validation
6. [ ] Add Super Admin override logic

**Permission Configuration:**
```typescript
export const SECURITY_PERMISSIONS = {
  SUPER_ADMIN: {
    userIds: ['1049161859555643433'], // DRIPTVDD
    level: 100,
    permissions: ['*']
  },
  SERVER_ADMIN: {
    discordPermissions: [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageRoles],
    level: 50,
    permissions: ['manage-roles', 'view-audit', 'trigger-sweep']
  },
  MODERATOR: {
    discordPermissions: [PermissionFlagsBits.ModerateMembers],
    level: 25,
    permissions: ['view-audit']
  }
};
```

**Acceptance Criteria:**
- [ ] DRIPTVDD always has Super Admin
- [ ] Server Admins can only manage lower roles
- [ ] Permission checks are fast (<5ms)

---

### P1-002: Role Management Commands
| Field | Value |
|-------|-------|
| **Specialist** | Backend Engineer (lead) |
| **Effort** | 8 hours |
| **Priority** | P1 - High |
| **Dependencies** | P1-001 |

**Tasks:**
1. [ ] Create `/ops security roles add` command
2. [ ] Create `/ops security roles remove` command
3. [ ] Create `/ops security audit` command
4. [ ] Integrate with permission resolver
5. [ ] Create AdminRoleRequest workflow
6. [ ] Add Discord interaction responses

**Command Implementation:**
```typescript
// src/bot/commands/security-roles.ts
export const securityRolesCommand = {
  name: 'security',
  subcommands: {
    roles: {
      add: async (interaction, targetUser, role, reason) => {
        // 1. Check permissions
        const canManage = await permissionResolver.canManageRole(
          interaction.member, role
        );
        if (!canManage) {
          return interaction.reply({ content: '❌ Insufficient permissions', ephemeral: true });
        }
        
        // 2. Create request record
        const request = await roleAuditService.createRequest({
          guildId: interaction.guildId,
          requesterId: interaction.user.id,
          targetMemberId: targetUser.id,
          roleId: role.id,
          action: 'add',
          reason
        });
        
        // 3. Execute role change
        await targetUser.roles.add(role, reason);
        
        // 4. Update records + send DRIP alert
        await roleAuditService.completeRequest(request.id, 'executed');
        await dripAlertService.sendRoleChangeAlert(request);
        
        return interaction.reply({ content: `✅ Added ${role.name} to ${targetUser.tag}` });
      }
    }
  }
};
```

**Acceptance Criteria:**
- [ ] Commands respond within 3 seconds
- [ ] All actions create audit records
- [ ] Permission denials logged
- [ ] Error handling with user-friendly messages

---

### P1-003: DRIP Alert Integration
| Field | Value |
|-------|-------|
| **Specialist** | Backend Engineer (lead) |
| **Effort** | 4 hours |
| **Priority** | P1 - High |
| **Dependencies** | P1-002 |

**Tasks:**
1. [ ] Create `src/services/security/role-alert-service.ts`
2. [ ] Define alert templates for role changes
3. [ ] Integrate with existing Event Bus
4. [ ] Add rate limiting for alert batching
5. [ ] Track alert delivery in AdminRoleRequest

**Alert Templates:**
```typescript
export const ROLE_ALERT_TEMPLATES = {
  ROLE_ADDED: {
    emoji: '🛡️',
    title: 'Role Management Alert',
    template: (data: RoleAlertData) => `
**Action:** Added role \`${data.roleName}\`
**Target:** ${data.targetTag} (${data.targetId})
**Executor:** ${data.executorTag}
**Guild:** ${data.guildName}
**Reason:** ${data.reason || 'No reason provided'}
**Time:** ${formatTimestamp(data.timestamp)}
    `.trim()
  },
  ROLE_REMOVED: { /* similar */ },
  UNAUTHORIZED_ATTEMPT: { /* similar with warning styling */ }
};
```

**Acceptance Criteria:**
- [ ] All role changes trigger DRIP alert
- [ ] Alerts delivered within 5 seconds
- [ ] Alert IDs tracked in database
- [ ] Rate limiting prevents spam (max 10/minute)

---

## Phase 3: Security Hardening

### P2-001: Input Sanitization Layer
| Field | Value |
|-------|-------|
| **Specialist** | Security Specialist (lead) |
| **Effort** | 4 hours |
| **Priority** | P2 - Medium |
| **Dependencies** | P0-002 |

**Tasks:**
1. [ ] Create `src/services/security/input-sanitizer.ts`
2. [ ] Implement Discord ID validator
3. [ ] Implement role name sanitizer
4. [ ] Implement reason field sanitizer
5. [ ] Add XSS prevention for all string inputs
6. [ ] Create sanitization middleware

**Acceptance Criteria:**
- [ ] Invalid Discord IDs rejected
- [ ] XSS attempts blocked
- [ ] All inputs sanitized before database
- [ ] Unit tests for edge cases

---

### P2-002: Cross-Reference Validation
| Field | Value |
|-------|-------|
| **Specialist** | Security Specialist (lead), Backend |
| **Effort** | 6 hours |
| **Priority** | P2 - Medium |
| **Dependencies** | P0-002, P0-003 |

**Tasks:**
1. [ ] Create `src/services/security/cross-reference-validator.ts`
2. [ ] Implement Discord API role fetching
3. [ ] Compare database state vs Discord reality
4. [ ] Detect and report drift
5. [ ] Create reconciliation logic
6. [ ] Schedule hourly validation job

**Acceptance Criteria:**
- [ ] Drift detected within 1 hour
- [ ] All discrepancies logged as SecurityEvents
- [ ] DRIP alert on critical drift
- [ ] Reconciliation creates audit trail

---

### P2-003: Integrity Sweep Scheduler
| Field | Value |
|-------|-------|
| **Specialist** | DevOps (lead), Security |
| **Effort** | 4 hours |
| **Priority** | P2 - Medium |
| **Dependencies** | P0-004, P2-002 |

**Tasks:**
1. [ ] Create `src/services/security/integrity-sweep-service.ts`
2. [ ] Implement hourly checksum spot-check (100 rows)
3. [ ] Implement daily full-table validation
4. [ ] Implement weekly cross-reference audit
5. [ ] Generate sweep reports
6. [ ] Alert on violations

**Sweep Schedule:**
```typescript
export const SWEEP_SCHEDULE = {
  HOURLY_SPOT_CHECK: {
    cron: '0 * * * *',  // Every hour
    sampleSize: 100,
    tables: ['security_events', 'role_change_audit']
  },
  DAILY_FULL_SCAN: {
    cron: '0 3 * * *',  // 3 AM daily
    tables: ['role_change_audit', 'threat_detections']
  },
  WEEKLY_CROSS_REF: {
    cron: '0 4 * * 0',  // 4 AM Sunday
    scope: 'all_guilds'
  }
};
```

**Acceptance Criteria:**
- [ ] Sweeps run on schedule
- [ ] Violations create ThreatDetection records
- [ ] Weekly report generated
- [ ] Performance impact <5% CPU

---

## Phase 4: Testing & Documentation

### P3-001: Unit Test Suite
| Field | Value |
|-------|-------|
| **Specialist** | QA Engineer (lead) |
| **Effort** | 8 hours |
| **Priority** | P3 |
| **Dependencies** | All P0-P2 tasks |

**Tasks:**
1. [ ] Create tests for SecurityEventService (15+ tests)
2. [ ] Create tests for RoleAuditService (20+ tests)
3. [ ] Create tests for PermissionResolver (15+ tests)
4. [ ] Create tests for ChecksumService (10+ tests)
5. [ ] Create tests for InputSanitizer (15+ tests)
6. [ ] Achieve 85%+ coverage

**Acceptance Criteria:**
- [ ] 75+ unit tests passing
- [ ] 85%+ code coverage
- [ ] All edge cases covered
- [ ] CI pipeline integration

---

### P3-002: Security Testing
| Field | Value |
|-------|-------|
| **Specialist** | Security Specialist (lead), QA |
| **Effort** | 4 hours |
| **Priority** | P3 |
| **Dependencies** | P3-001 |

**Tasks:**
1. [ ] SQL injection attempt tests
2. [ ] XSS injection attempt tests
3. [ ] Permission bypass attempt tests
4. [ ] Checksum tampering tests
5. [ ] Rate limiting tests
6. [ ] Document findings

**Acceptance Criteria:**
- [ ] All injection attempts blocked
- [ ] All bypass attempts denied
- [ ] Tampering detection working
- [ ] Security report generated

---

### P3-003: Documentation Updates
| Field | Value |
|-------|-------|
| **Specialist** | Documentation (lead) |
| **Effort** | 4 hours |
| **Priority** | P3 |
| **Dependencies** | All previous tasks |

**Tasks:**
1. [ ] Update Architecture Bible with security database design
2. [ ] Create `docs/operations-bible/security-admin-guide.md`
3. [ ] Update Development Bible with new service patterns
4. [ ] Create incident response runbook

**Acceptance Criteria:**
- [ ] All new services documented
- [ ] Admin guide complete with examples
- [ ] Runbook covers all alert types
- [ ] Bible integration validated

---

*Document continues in MASTER-PLAN-PART2.md with Agile Review & Refinement sections...*

````