# 28 — SensaiOS Security Model

**Version:** 1.2.0  
**Status:** AUTHORITATIVE — Production Architecture  
**Created:** January 1, 2026  
**Updated:** January 8, 2026  
**Promoted:** January 5, 2026  
**Purpose:** Define the security architecture for SensaiOS as a true OS-within-a-container

---

## Executive Summary

This document defines how SensaiOS becomes a **true operating system** with:
- **Ring security model** (Kernel = Ring 0, SensaiOS = Ring 1, Apps = Ring 3)
- **Installation primitives** (install/remove apps like `apt install`)
- **One-way visibility enforcement** (Kernel sees everything, Apps see nothing)
- **Container nesting** (Node → DB Kernel → SensaiOS → Apps)
- **Encrypted game server boundary** (secure interface between SensaiOS and Apps)

**Implementation Status:** All 4 phases COMPLETE + 4 Advanced Subsystems (v1.2.0, January 2026)
- Phase 1: Ring Security Foundation ✅
- Phase 2: Installation Primitives ✅
- Phase 3: Game Server Boundary ✅
- Phase 4: Visibility Enforcement ✅ (202 security tests)
- **v1.2.0 Advanced Subsystems:** Content-Addressable Storage, Lock Manager, Dependency Visualization, Capability Delegation ✅

---

## Table of Contents

1. [Container Nesting Model](#1-container-nesting-model)
2. [Ring Security Architecture](#2-ring-security-architecture)
3. [Visibility & Access Control](#3-visibility--access-control)
4. [Installation Primitives](#4-installation-primitives)
5. [Runtime Enforcement](#5-runtime-enforcement)
6. [Game Server Boundary](#6-game-server-boundary)
7. [Security Testing](#7-security-testing)
8. [Advanced Subsystems (v1.2.0)](#8-advanced-subsystems-v120)
9. [Non-Negotiables](#9-non-negotiables)

---

## 1. Container Nesting Model

### The Complete Stack (v1.2.0)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Node.js Container (Host)                      │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              DB Kernel (Ring 0)                              │ │
│  │  • PostgreSQL substrate                                      │ │
│  │  • Observability primitives                                  │ │
│  │  • Error detection & routing                                 │ │
│  │  • Storage primitives (SHA-256 CAS)                         │ │
│  │                                                               │ │
│  │  ┌───────────────────────────────────────────────────────┐  │ │
│  │  │         SensaiOS (Ring 1) — v1.2.0                     │  │ │
│  │  │  • Component supervisor                                │  │ │
│  │  │  • Dependency injection                                │  │ │
│  │  │  • Lifecycle management                                │  │ │
│  │  │  • Capability enforcement + delegation (v1.2.0)        │  │ │
│  │  │  • Installation primitives                             │  │ │
│  │  │  • Lock manager (deadlock prevention) (v1.2.0)         │  │ │
│  │  │  • Dependency visualization (v1.2.0)                   │  │ │
│  │  │                                                         │  │ │
│  │  │  ┌─────────────────────────────────────────────────┐  │  │ │
│  │  │  │   Applications (Ring 3)                         │  │  │ │
│  │  │  │  • Discord bot (installed app)                  │  │  │ │
│  │  │  │  • Battle engine (installed app)                │  │  │ │
│  │  │  │  • Encounter system (installed app)             │  │  │ │
│  │  │  │  • Observability dashboards (installed app)     │  │  │ │
│  │  │  │                                                   │  │  │ │
│  │  │  │  ↓ Can only see ↓                                │  │  │ │
│  │  │  │  Game Server API (encrypted boundary)            │  │  │ │
│  │  │  └─────────────────────────────────────────────────┘  │  │ │
│  │  └───────────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Visibility Rules

| Layer | Can See | Cannot See |
|-------|---------|------------|
| **Node Container** | Everything (host environment) | N/A |
| **DB Kernel (Ring 0)** | All layers below + SensaiOS metadata | N/A |
| **SensaiOS (Ring 1)** | Kernel primitives + App manifests | App internal state |
| **Applications (Ring 3)** | Only Game Server API | Kernel, SensaiOS, other apps |

### Power Structure Analogy

```
CEO (Node Container)
  └─ CTO (DB Kernel) — sees all systems, reports up
      └─ Engineering Manager (SensaiOS) — orchestrates teams, reports up
          └─ Individual Engineers (Apps) — only see their assigned work
```

---

## 2. Ring Security Architecture

### Ring Model (x86-inspired)

```
Ring 0 (Kernel)     — Unrestricted access to all resources
  ↓
Ring 1 (SensaiOS)   — Can manage components, enforce policies
  ↓
Ring 2 (Reserved)   — Future use (trusted services)
  ↓
Ring 3 (Apps)       — Restricted to granted capabilities only
```

### Capability-Based Security

Every operation requires an explicit capability grant:

```typescript
/**
 * Capability — A specific permission granted to a component
 * Implementation: src/sensaios/capabilities/assert-capability.ts
 */
export interface Capability {
  /** Component requesting the capability */
  component: string;
  
  /** Capability type — ALL implemented types as of January 2026 */
  type: 
    // Database capabilities
    | 'db.read' | 'db.write' | 'db.migrate'
    // Discord capabilities
    | 'discord.read' | 'discord.send' | 'discord.moderate'
    // Network capabilities
    | 'network.http-egress'
    // Storage capabilities
    | 'storage.read' | 'storage.write'
    // Kernel capabilities
    | 'kernel.observe' | 'kernel.metrics' | 'kernel.error-route'
    // Event system capabilities (NEW in v1.1.2)
    | 'exports.append' | 'exports.query'
    // Job system capabilities (NEW in v1.1.2)
    | 'jobs.enqueue' | 'jobs.lease'
    // Outbox capability (NEW in v1.1.2)
    | 'outbox.send';
  
  /** Optional scope restriction */
  scope?: {
    tables?: string[];      // DB tables allowed
    channels?: string[];    // Discord channels allowed
    domains?: string[];     // HTTP domains allowed
    tenant?: string;        // Tenant restriction (v1.1.2)
  };
  
  /** Grant reason (auditable) */
  reason: string;
  
  /** Expiry time (optional, for temporary grants) */
  expiresAt?: Date;
}
```

### Ring Enforcement at Runtime

```typescript
/**
 * Check if caller is allowed to perform an operation
 * Implementation: src/sensaios/capabilities/assert-capability.ts
 * 
 * Note: Actual function signature uses explicit parameters for better testing
 */
export async function assertCapability(
  prisma: PrismaClient,
  component: string,
  capability: CapabilityType,
  scope: TenantScope,
  correlationId?: string
): Promise<void> {
  // Step 1: Query capability grant from database
  const granted = await prisma.componentCapability.findFirst({
    where: {
      component,
      type: capability,
      revokedAt: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ],
    }
  });
  
  if (!granted) {
    throw new SensaiError({
      code: 4001, // CAPABILITY_DENIED
      message: `Component ${component} lacks capability ${capability}`,
      context: { component, capability },
    });
  }
  
  // Step 2: Validate scope (tenant isolation)
  if (granted.scope?.tenant && granted.scope.tenant !== scope.tenantId) {
    throw new SensaiError({
      code: 4002, // SCOPE_MISMATCH
      message: `Capability grant does not cover tenant ${scope.tenantId}`,
      context: { component, capability, tenant: scope.tenantId },
    });
  }
  
  // Step 3: Audit the access (via logger, not exports to avoid circular)
  const log = scopedLogger('capability.audit');
  log.info('capability-asserted', `${component} used ${capability}`, {
    component,
    capability,
    grantId: granted.id,
    correlationId,
  });
}

/**
 * Get component ring level
 */
function getComponentRing(component: string): 0 | 1 | 3 {
  if (component.startsWith('kernel.')) return 0;
  if (component.startsWith('sensai.')) return 1;
  return 3; // All apps default to Ring 3
}
```

---

## 3. Visibility & Access Control

### One-Way Visibility Enforcement

**Principle:** Higher rings can observe lower rings, but not vice versa.

```typescript
/**
 * Visibility matrix — enforced at import time and runtime
 * Implementation: src/sensaios/kernel/secure-import.ts
 */
const VISIBILITY_MATRIX = {
  // Ring 0 (Kernel) can see:
  0: ['kernel', 'sensai', 'app', 'bot', 'observability'],
  
  // Ring 1 (SensaiOS) can see:
  1: ['kernel', 'sensai'],
  
  // Ring 3 (Apps) can see:
  3: ['app', 'bot', 'observability'], // NOT kernel or sensai
} as const;
```

### ESLint Enforcement (Compile-Time)

Ring boundary violations are caught at compile-time via ESLint `import/no-restricted-paths` rules.

**Configuration:** `eslint.config.js`

```javascript
// Ring 0 (Kernel): CANNOT import from any upper rings
// Ring 1 (SensaiOS): CANNOT import from Ring 3 (Apps)
// Ring 3 (Apps): CANNOT import from Ring 0 or Ring 1 directly
```

### Runtime Import Verification

**Implementation:** `src/sensaios/loader/module-hook.ts`

```typescript
/**
 * ESM loader hook that enforces ring security at module load time
 * Enabled via: npm run start:secure (--import flag)
 */
export async function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: Function
): Promise<ResolveResult> {
  // Determine calling ring and target ring
  // Block if visibility rules violated
  // Log all security-relevant resolutions
}
```

### Ring Boundary Violation Examples

#### ❌ BLOCKED: App Importing Kernel Directly

```typescript
// src/bot/commands/battle-turn.ts
import { DbPrimitive } from '../../kernel/primitives/db'; // ❌ RING VIOLATION

// ESLint error:
// 🚫 Ring 3 (Apps/Bot) MUST use ComponentContext from SensaiOS, 
//    not Ring 0 (Kernel) directly. Use ctx provided to handlers.

// ✅ CORRECT: Use ComponentContext
export const handleBattleCommand = runGuarded(
  'discord.battle.command',
  async (ctx: ComponentContext, interaction: CommandInteraction) => {
    await ctx.db.transaction(async (tx) => {
      // ...
    });
  }
);
```

#### ❌ BLOCKED: App Importing SensaiOS Internals

```typescript
// src/bot/homestead/heal.ts
import { createDbPrimitive } from '../../sensaios/context-factory'; // ❌ RING VIOLATION

// ESLint error:
// 🚫 Ring 3 (Apps/Bot) MUST use ComponentContext interface, 
//    not Ring 1 (SensaiOS) internals directly.

// ✅ CORRECT: Use ComponentContext provided by handler wrapper
export const handleHealCommand = runGuarded(
  'homestead.heal.command',
  async (ctx: ComponentContext, interaction: CommandInteraction) => {
    // ctx already has all primitives ready to use
  }
);
```

---

## 4. Installation Primitives

### App Manifest Schema

**Implementation:** `src/sensaios/install/manifest-schema.ts`

```typescript
export interface AppManifest {
  /** Unique identifier (e.g., "game.battles", "discord.bot") */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Semantic version */
  version: string;
  
  /** Description */
  description?: string;
  
  /** Which hosts the app can run on */
  hosts: ('bot' | 'worker' | 'cron' | 'cli')[];
  
  /** Required capabilities */
  capabilities: {
    db?: ('read' | 'write' | 'migrate')[];
    discord?: ('read' | 'send' | 'moderate')[];
    network?: ('http-egress')[];
    storage?: ('read' | 'write')[];
    kernel?: ('observe' | 'metrics' | 'error-route' | 'modify')[];
  };
  
  /** Data ownership declarations */
  owns?: {
    canonical?: string[];    // Tables this app writes
    projections?: string[];  // Derived views maintained
  };
  
  /** Dependencies (must be installed first) */
  dependencies?: string[];
  
  /** Resource budgets */
  resources?: {
    maxCacheMb?: number;
    maxQueueSize?: number;
    maxConcurrency?: number;
  };
}
```

### Installation Workflow

**Implementation:** `src/sensaios/install/install-app.ts`

```typescript
export async function installApp(
  manifest: AppManifest,
  ctx: ComponentContext
): Promise<InstallResult> {
  // Step 1: Validate manifest
  validateManifest(manifest);
  
  // Step 2: Check dependencies
  await checkDependencies(manifest.dependencies, ctx);
  
  // Step 3: Detect circular dependencies
  const cycles = detectCircularDependency(manifest.id, manifest.dependencies);
  if (cycles) throw new InstallError({ code: 'CIRCULAR_DEPENDENCY', cycles });
  
  // Step 4: Grant safe capabilities
  await grantCapabilities(manifest.id, manifest.capabilities, ctx);
  
  // Step 5: Queue dangerous capabilities for approval
  const dangerous = getDangerousCapabilities(manifest);
  if (dangerous.length > 0) {
    await emitApprovalRequired(manifest.id, dangerous, ctx);
  }
  
  // Step 6: Run onLoad lifecycle hook
  if (manifest.lifecycle?.onLoad) {
    await manifest.lifecycle.onLoad(ctx);
  }
  
  // Step 7: Register in database
  await ctx.db.installedApp.create({
    data: {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      manifest: manifest,
      status: 'installed',
    }
  });
  
  return { success: true, pendingApprovals: dangerous };
}
```

### Uninstallation Workflow

**Implementation:** `src/sensaios/install/uninstall-app.ts`

```typescript
export async function uninstallApp(
  appId: string,
  ctx: ComponentContext
): Promise<UninstallResult> {
  // Step 1: Check if app exists
  // Step 2: Check for dependent apps (block if any)
  // Step 3: Call onUnload lifecycle hook
  // Step 4: Revoke all capabilities
  // Step 5: Update database status
  // Step 6: Emit uninstall event
}
```

### CLI Commands

**Implementation:** `src/sensaios/cli/` (sensaios CLI)

```bash
# Install an app
sensaios install ./apps/battle-engine

# List installed apps
sensaios list

# Enable/disable an app
sensaios enable battle-engine
sensaios disable battle-engine

# Uninstall an app
sensaios uninstall battle-engine

# Grant additional capability
sensaios grant battle-engine db.write --tables=battles

# Revoke capability
sensaios revoke battle-engine network.http-egress
```

---

## 5. Runtime Enforcement

### Capability Checks in Primitives

Every kernel primitive checks capabilities before executing:

```typescript
export class DbPrimitive {
  async transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    // Assert write capability
    await assertCapability(this.caller, 'db.write', this.ctx);
    return this.prisma.$transaction(fn);
  }
  
  async query<T>(sql: string): Promise<T[]> {
    // Assert read capability
    await assertCapability(this.caller, 'db.read', this.ctx);
    // Check table scope
    await assertTableAccess(this.caller, extractTablesFromSql(sql), this.ctx);
    return this.prisma.$queryRaw(sql);
  }
}
```

### runGuarded() Wrapper

All handlers MUST be wrapped with `runGuarded()` for:
- Automatic correlation ID propagation
- Structured error capture with SensaiError
- Timing metrics emission
- Graceful error responses

```typescript
export const handleBattleCommand = runGuarded(
  'discord.battle.command',
  async (ctx: ComponentContext, interaction: CommandInteraction) => {
    // All operations use ctx primitives
    // Automatic capability checks enforced
  }
);
```

---

## 6. Game Server Boundary

### Encrypted API Surface

Apps communicate with the game engine through an encrypted API boundary.

**Implementation:** `src/sensaios/gameserver/api.ts`

```typescript
export interface GameServerAPI {
  /** Battle operations */
  battles: {
    create(params: CreateBattleParams): Promise<Battle>;
    execute(battleId: string, action: BattleAction): Promise<BattleResult>;
    forfeit(battleId: string): Promise<void>;
  };
  
  /** Encounter operations */
  encounters: {
    spawn(channelId: string): Promise<Encounter>;
    catch(encounterId: string, pokeball: string): Promise<CatchResult>;
  };
  
  /** Trainer operations */
  trainers: {
    get(discordId: string): Promise<Trainer>;
    updateMoney(discordId: string, delta: number): Promise<void>;
  };
  
  /** Observability (limited) */
  logs: {
    info(message: string, data?: Record<string, unknown>): void;
    error(message: string, error: Error): void;
  };
}
```

### Encryption Layer

**Implementation:** `src/sensaios/gameserver/encryption.ts`

```typescript
// Per-app key derivation using HKDF-like SHA-256
export function deriveAppKey(appId: string): Buffer;

// AES-256-GCM encryption with auth tag
export function encryptForApp(appId: string, value: string): string;
export function decryptFromApp(appId: string, token: string): string;

// Token format: enc_v1_<base64url-combined-data>
```

Apps receive encrypted tokens for sensitive data (Discord IDs, guild IDs) and can use them in operations without seeing underlying values.

---

## 7. Security Testing

### Test Coverage

**Total:** 202 security tests across 4 test files

| File | Tests | Coverage |
|------|-------|----------|
| `capability-denial.spec.ts` | 40 | Type denial, expired, revoked, scope mismatch, missing, edge cases |
| `visibility-violation.spec.ts` | 55 | App→Kernel, App→SensaiOS, SensaiOS→App, dynamic import, require(), ring detection |
| `installation-attack.spec.ts` | 39 | Malicious manifest, circular dependency, missing dependency, dangerous capability, privilege escalation, injection |
| `boundary-tests.spec.ts` | 40 | Encryption, rate limiting, audit logging, data leakage prevention, cross-ring boundaries |

### CI Enforcement

**Workflow:** `.github/workflows/security-tests.yml`

```yaml
# Runs on PR/push when security-relevant paths change
# Requires: All tests pass, 100+ test minimum
```

### Key Test Scenarios

1. **Capability Denial** — Apps denied access to ungranted capabilities
2. **Visibility Violation** — Ring boundary imports blocked
3. **Installation Attack** — Malicious manifests rejected
4. **Boundary Tests** — Encryption, rate limiting, audit logging work correctly

---

## 8. Advanced Subsystems (v1.2.0)

**Added:** January 2026  
**Status:** PRODUCTION READY

SensaiOS v1.2.0 introduces four advanced subsystems that enhance the OS with enterprise-grade capabilities:

### 8.1 Content-Addressable Storage

**Implementation:** `src/sensaios/storage/content-addressable.ts` (340 lines)

SHA-256 based blob storage with automatic deduplication and integrity verification.

**Key Features:**
- Content-addressable IDs (SHA-256 hash)
- Automatic deduplication (same content = same ID)
- Reference counting for lifecycle management
- Integrity verification (`verifyIntegrity()`, `verifyAll()`)
- Statistics tracking (deduplication savings, integrity failures)

**Use Cases:**
- Immutable Pokemon sprite storage
- Cache optimization with deduplication
- Integrity verification for critical assets
- Content-based versioning

### 8.2 Lock Manager with Deadlock Prevention

**Implementation:** `src/sensaios/concurrency/lock-manager.ts` (410 lines)

Advisory lock management using PostgreSQL with timeout-based deadlock prevention.

**Key Features:**
- Advisory locks via `pg_advisory_xact_lock()` / `pg_advisory_lock()`
- 5 lock domains: battle, encounter, trainer, guild, component
- Transaction vs session scope
- Configurable timeouts (default 5s, max 60s)
- Deadlock detection via `statement_timeout`
- Active lock monitoring and stale lock detection

**Lock Key Generation:**
- Namespace (high 32 bits) + FNV-1a hash(resourceId) (low 32 bits) = 64-bit key
- Ensures collision-free locking across domains

**Use Cases:**
- Battle state synchronization (prevent concurrent turn processing)
- Encounter catch flow (prevent duplicate captures)
- Trainer inventory operations (prevent item duplication)
- Guild configuration updates (prevent race conditions)

### 8.3 Dependency Graph Visualization

**Implementation:** `src/sensaios/visualization/dependency-graph.ts` (370 lines)

Multi-format component dependency graph generation with cycle detection.

**Output Formats:**
1. **Mermaid** — GitHub/Markdown compatible diagrams
2. **Graphviz DOT** — Professional graph layouts
3. **ASCII Tree** — Terminal-friendly output
4. **JSON** — Programmatic access

**Key Features:**
- Circular dependency detection
- Max depth calculation (longest chain)
- State visualization (enabled/installed/uninstalled indicators)
- Component relationship mapping

**Use Cases:**
- Component topology documentation
- Installation order planning
- Circular dependency debugging
- Architecture visualization

### 8.4 Capability Delegation

**Implementation:** `src/sensaios/capabilities/delegation.ts` (490 lines)

Time-bounded capability grants with automatic expiration and chain limits.

**Key Features:**
- Delegation tokens (crypto.randomBytes(16) for secure IDs)
- Time-bounded grants (max 3600s / 1 hour TTL)
- Use limits (maxUses tracking)
- Chain depth limit (max 3 levels)
- Automatic cleanup every 5 minutes
- Verification (delegatee, scope, expiration, use count)
- Audit trail (all delegations logged)

**Security Properties:**
- **Time-bounded:** All tokens expire (max 1 hour)
- **Chain limits:** Max 3 delegation levels
- **Use limits:** Optional maxUses prevents abuse
- **Automatic cleanup:** Expired tokens removed every 5 minutes
- **Audit trail:** All delegations logged with correlation IDs

**Use Cases:**
- Temporary elevated privileges (Ring 3 → Ring 1 access)
- Short-lived API tokens (webhook verification)
- Cross-component collaboration (time-bounded data sharing)
- Emergency access grants (incident response)

### 8.5 Integration with Kernel Primitives

All v1.2.0 subsystems integrate seamlessly with existing kernel primitives:

**Content-Addressable Storage:**
- Extends `ctx.storage` primitive
- Uses `ctx.db` for blob metadata
- Emits metrics via `ctx.obs`

**Lock Manager:**
- Uses `ctx.db` for advisory locks
- Integrates with transaction scope
- Emits lock metrics via `ctx.obs`

**Dependency Visualization:**
- Reads from ComponentRegistry
- Outputs to `ctx.obs` logs
- Used by installation validation

**Capability Delegation:**
- Extends `ctx.rbac` primitive
- Uses `ctx.db` for token storage
- Audits via `ctx.exports`

---

## 9. Non-Negotiables

### Immutable Security Rules

1. **Ring 3 apps NEVER import from kernel or sensaios directly**
   - Enforced at compile-time (ESLint) and runtime (import wrapper)
   
2. **Every privileged operation requires a capability**
   - Database writes, Discord API calls, HTTP egress, etc.
   
3. **Capabilities are granted explicitly, never implicitly**
   - Approval workflow for dangerous capabilities
   
4. **Apps communicate with SensaiOS via GameServerAPI only**
   - No raw database access
   - No direct kernel primitive access
   
5. **All capability assertions are audited**
   - Append to exports log
   - Queryable for security analysis
   
6. **Uninstalling an app leaves data intact**
   - Tables owned by app are preserved
   - Can be garbage collected separately

---

## Implementation Reference

| Component | File | Purpose |
|-----------|------|---------|
| **Core Security** |
| Capability checks | `src/sensaios/kernel/assert-capability.ts` | Runtime capability enforcement |
| Import security | `src/sensaios/kernel/secure-import.ts` | Ring boundary validation |
| Module loader | `src/sensaios/loader/module-hook.ts` | ESM loader hook |
| Manifest schema | `src/sensaios/install/manifest-schema.ts` | App manifest validation |
| Install workflow | `src/sensaios/install/install-app.ts` | App installation |
| Uninstall workflow | `src/sensaios/install/uninstall-app.ts` | App removal |
| Game Server API | `src/sensaios/gameserver/api.ts` | Encrypted API boundary |
| Encryption | `src/sensaios/gameserver/encryption.ts` | AES-256-GCM encryption |
| Security tests | `tests/sensaios/security/*.spec.ts` | 202 security tests |
| **v1.2.0 Advanced Subsystems** |
| Content-Addressable Storage | `src/sensaios/storage/content-addressable.ts` | SHA-256 blob storage (340 lines) |
| Lock Manager | `src/sensaios/concurrency/lock-manager.ts` | Advisory locks (410 lines) |
| Dependency Visualization | `src/sensaios/visualization/dependency-graph.ts` | Multi-format graphs (370 lines) |
| Capability Delegation | `src/sensaios/capabilities/delegation.ts` | Time-bounded grants (490 lines) |

---

## Cross-References

- **Development Guide:** [11-sensaios-development.md](../development-bible/11-sensaios-development.md)
- **Operations Guide:** [14-sensaios-operations.md](../operations-bible/14-sensaios-operations.md)
- **SensaiOS Overview:** [.github/instructions/sensai.instructions.md](../../.github/instructions/sensai.instructions.md)
- **Original Spec:** [docs/projects/SensaiOS/architecture/06-os-security-model.md](../projects/SensaiOS/architecture/06-os-security-model.md)
- **Final Architecture:** [docs/projects/SensaiOS/SENSAI-FINAL-ARCHITECTURE.md](../projects/SensaiOS/SENSAI-FINAL-ARCHITECTURE.md) — v1.2.0 complete specification

---

**Document Version:** 1.2.0  
**Status:** AUTHORITATIVE  
**Created:** January 1, 2026  
**Updated:** January 8, 2026  
**Promoted:** January 5, 2026  
**Authority:** Canonical security architecture for SensaiOS
