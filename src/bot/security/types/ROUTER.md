# ROUTER — Security Bot Types

**Path:** `src/bot/security/types/`  
**Purpose:** Type definitions for Security Bot Database Transformation  
**Specialist:** Database, Architecture  
**Last Updated:** 2025-12-05T19:30:00Z

---

## Overview

Central repository for TypeScript type definitions supporting the Security Bot Database Transformation project. Provides compile-time safety for all security operations.

## Files

| File | Lines | Description |
|------|-------|-------------|
| `database-models.ts` | ~480 | Prisma schema type mirrors |
| `index.ts` | ~60 | Public API exports |

## Type Categories

### Database Models (P0-001)

Types matching Prisma schema for Security Bot:

| Type | Prisma Model | Purpose |
|------|--------------|---------|
| `SecurityEvent` | `security_events` | Immutable audit trail |
| `RoleChangeAudit` | `role_change_audit` | Role modification tracking |
| `ThreatDetection` | `threat_detections` | Threat forensics |
| `SecurityBaseline` | `security_baselines` | Behavioral patterns |
| `PermissionSnapshot` | `permission_snapshots` | Permission cross-reference |
| `AdminRoleRequest` | `admin_role_requests` | Workflow management |
| `IntegrityCheck` | `integrity_checks` | Validation logs |

### Enums

| Enum | Values | Usage |
|------|--------|-------|
| `SecuritySeverity` | CRITICAL, HIGH, MEDIUM, LOW, INFO | Event severity |
| `ThreatType` | RAPID_ROLE_CHANGES, UNUSUAL_ORIGIN, ... | Threat classification |
| `AdminRequestStatus` | PENDING, APPROVED, REJECTED, ... | Workflow status |

### Plugin Types (Sprint 0)

Re-exported from `../plugins/types.js`:
- `SecurityPlugin` — Plugin interface
- `PluginMetadata` — Plugin identification
- `SecurityContext` — Execution context
- `PluginAction` — Plugin action requests

## Usage

```typescript
import {
  SecurityEvent,
  SecuritySeverity,
  ThreatType,
  RoleChangeAudit,
} from './security/types';

const event: SecurityEvent = {
  eventType: 'role-change',
  severity: SecuritySeverity.HIGH,
  guildId: '123456789',
  guildName: 'My Server',
  origin: 'security-bot-sweep',
  checksum: 'sha256:...',
};
```

## Input Types

Each model has a corresponding `Input` type for creation:

```typescript
import type { 
  SecurityEventInput,
  RoleChangeAuditInput 
} from './security/types';

// Input types exclude auto-generated fields (id, createdAt)
const eventInput: SecurityEventInput = {
  eventType: 'threat-detected',
  severity: SecuritySeverity.CRITICAL,
  // ...
};
```

## Research References

- **P0-001:** Database Foundation (Prisma Schema)
- **R6:** SOC 2 Compliance (Immutable Audit Log)
- **S6:** Timing-Safe Crypto (Checksum validation)

## Cross-References

- **Prisma Schema:** `prisma/schema.prisma` (Security Bot models section)
- **Plugin Types:** `src/bot/security/plugins/types.ts`
- **Crypto Module:** `src/shared/crypto/timing-safe.ts`

---

*Type definitions created as part of Sprint 1 P0-001 (Database Foundation)*
