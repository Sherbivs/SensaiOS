# ROUTER — Security Bot Module

**Path:** `src/bot/security/`  
**Purpose:** Security Bot Database Transformation — Core Security Infrastructure  
**Specialist Team:** Security, Database, Architecture  
**Last Updated:** 2025-12-05T19:30:00Z

---

## Overview

Security Bot module providing enterprise-grade Discord server protection with database persistence, plugin architecture, and multi-touchpoint integrity validation.

## Project Status

**Project:** Security Bot Database Transformation  
**Sprint:** 1 (Database Foundation)  
**Completion:** 35% (~78h of 223h)

## Directory Structure

```
src/bot/security/
├── ROUTER.md                      # This file
├── plugins/                       # Plugin system (Sprint 0)
│   ├── ROUTER.md
│   ├── types.ts                   # Plugin interfaces
│   ├── registry.ts                # Plugin registry
│   ├── base-plugin.ts             # Abstract base class
│   ├── index.ts                   # Public API
│   └── builtin/                   # Built-in plugins
│       ├── role-monitor-plugin.ts
│       └── index.ts
└── types/                         # TypeScript types (Sprint 1)
    ├── ROUTER.md
    ├── database-models.ts         # Prisma schema mirrors
    └── index.ts                   # Type exports
```

## Completed Components

### Sprint 0: Foundation (12h) ✅

| Component | File | Lines | Status |
|-----------|------|-------|--------|
| Plugin Types | `plugins/types.ts` | ~530 | ✅ Complete |
| Plugin Registry | `plugins/registry.ts` | ~800 | ✅ Complete |
| Base Plugin | `plugins/base-plugin.ts` | ~390 | ✅ Complete |
| Role Monitor Plugin | `plugins/builtin/role-monitor-plugin.ts` | ~280 | ✅ Complete |

### Sprint 1: Database Foundation (In Progress)

| Component | File | Lines | Status |
|-----------|------|-------|--------|
| Database Types | `types/database-models.ts` | ~480 | ✅ Complete |
| Prisma Schema | `prisma/schema.prisma` | +280 | ✅ Complete |
| Timing-Safe Crypto | `src/shared/crypto/timing-safe.ts` | ~530 | ✅ Complete |
| Rate Limiter | `src/shared/rate-limiter.ts` | ~620 | ✅ Complete |

## Database Models

Security Bot uses 7 Prisma models for persistence:

| Model | Table | Purpose |
|-------|-------|---------|
| `SecurityEvent` | `security_events` | Immutable audit trail with hash chain |
| `RoleChangeAudit` | `role_change_audit` | Role modification tracking |
| `ThreatDetection` | `threat_detections` | Threat forensics with MITRE mapping |
| `SecurityBaseline` | `security_baselines` | Per-guild behavioral patterns |
| `PermissionSnapshot` | `permission_snapshots` | Cross-reference validation |
| `AdminRoleRequest` | `admin_role_requests` | Workflow management |
| `IntegrityCheck` | `integrity_checks` | Validation run logs |

## Plugin Architecture

The plugin system provides:

1. **Dynamic Loading** — Register/unregister at runtime
2. **Hot Reload** — Development-mode configuration refresh
3. **Priority Ordering** — CRITICAL (100) to BACKGROUND (0)
4. **State Lifecycle** — registered → initialized → active → stopped

### Built-in Plugins

| Plugin | Purpose | Priority |
|--------|---------|----------|
| `RoleMonitorPlugin` | Monitor role changes | HIGH (70) |
| *(planned)* `ThreatDetectionPlugin` | Detect anomalies | HIGH (80) |
| *(planned)* `IntegrityPlugin` | Validate checksums | NORMAL (50) |

## Security Features

### Implemented (Sprint 0-1)

- **Timing-Safe HMAC** — CWE-208 prevention via constant-time comparison
- **Token Bucket Rate Limiting** — RFC 6585 compliant rate limits
- **Plugin Isolation** — Error boundaries per plugin
- **Feature Flags** — Runtime capability toggling

### Planned (Sprint 2-4)

- **4-Layer Integrity** — HMAC + DB Checksums + Cross-Reference + Sweeps
- **DRIP Alerts** — Real-time notifications to DRIPTVDD
- **Event Sourcing** — Complete audit trail reconstruction
- **Column Encryption** — GDPR Article 32 compliance

## Usage

```typescript
import { PluginRegistry } from './security/plugins';
import { SecurityEvent, SecuritySeverity } from './security/types';

// Plugin registration
const registry = new PluginRegistry();
await registry.registerBuiltinPlugins();

// Type-safe event creation
const event: SecurityEvent = {
  eventType: 'role-change',
  severity: SecuritySeverity.HIGH,
  guildId: '123',
  guildName: 'Test',
  origin: 'security-bot-sweep',
  checksum: await computeChecksum(eventData),
};
```

## Cross-References

- **Prisma Schema:** `prisma/schema.prisma` (Security Bot section)
- **Crypto Module:** `src/shared/crypto/`
- **Rate Limiter:** `src/shared/rate-limiter.ts`
- **Feature Flags:** `src/shared/feature-flags.ts`
- **Project Docs:** `docs/projects/security-db-transformation/`

## Research References

| ID | Enhancement | Compliance |
|----|-------------|------------|
| R1 | Timing-Safe HMAC | CWE-208 |
| R2 | Token Bucket Rate Limit | RFC 6585 |
| R5 | Column Encryption | GDPR Art. 32 |
| R6 | Immutable Audit Log | SOC 2 |

---

*Part of Security Bot Database Transformation Project (223h across 6 sprints)*
