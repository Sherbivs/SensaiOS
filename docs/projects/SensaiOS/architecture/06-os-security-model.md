# 06 — OS Security Model (Ring Architecture & Installation Primitives)

**Version:** 1.0.0  
**Status:** PROPOSED — Design Specification  
**Created:** January 1, 2026  
**Purpose:** Define the security architecture for SensaiOS as a true OS-within-a-container

---

## Executive Summary

This document defines how SensaiOS becomes a **true operating system** with:
- **Ring security model** (Kernel = Ring 0, SensaiOS = Ring 1, Apps = Ring 3)
- **Installation primitives** (install/remove apps like `apt install`)
- **One-way visibility enforcement** (Kernel sees everything, Apps see nothing)
- **Container nesting** (Node → DB Kernel → SensaiOS → Apps)
- **Encrypted game server boundary** (secure interface between SensaiOS and Apps)

---

## Table of Contents

1. [Container Nesting Model](#1-container-nesting-model)
2. [Ring Security Architecture](#2-ring-security-architecture)
3. [Visibility & Access Control](#3-visibility--access-control)
4. [Installation Primitives](#4-installation-primitives)
5. [Runtime Enforcement](#5-runtime-enforcement)
6. [Game Server Boundary](#6-game-server-boundary)
7. [Implementation Roadmap](#7-implementation-roadmap)
8. [Non-Negotiables](#8-non-negotiables)

---

## 1. Container Nesting Model

### The Complete Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                     Node.js Container (Host)                      │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              DB Kernel (Ring 0)                              │ │
│  │  • PostgreSQL substrate                                      │ │
│  │  • Observability primitives                                  │ │
│  │  • Error detection & routing                                 │ │
│  │  • Storage primitives                                        │ │
│  │                                                               │ │
│  │  ┌───────────────────────────────────────────────────────┐  │ │
│  │  │         SensaiOS (Ring 1)                              │  │ │
│  │  │  • Component supervisor                                │  │ │
│  │  │  • Dependency injection                                │  │ │
│  │  │  • Lifecycle management                                │  │ │
│  │  │  • Capability enforcement                              │  │ │
│  │  │  • Installation primitives                             │  │ │
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
 */
export interface Capability {
  /** Component requesting the capability */
  component: string;
  
  /** Capability type */
  type: 'db.read' | 'db.write' | 'db.migrate' |
        'discord.read' | 'discord.send' | 'discord.moderate' |
        'network.http-egress' | 'storage.read' | 'storage.write' |
        'kernel.observe' | 'kernel.metrics' | 'kernel.error-route';
  
  /** Optional scope restriction */
  scope?: {
    tables?: string[];      // DB tables allowed
    channels?: string[];    // Discord channels allowed
    domains?: string[];     // HTTP domains allowed
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
 */
export async function assertCapability(
  caller: string,
  capability: Capability['type'],
  ctx: ComponentContext
): Promise<void> {
  // Step 1: Determine caller ring
  const ring = getComponentRing(caller);
  
  // Step 2: Check capability table
  const granted = await ctx.db.capability.findFirst({
    where: {
      component: caller,
      type: capability,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ],
      revokedAt: null,
    }
  });
  
  if (!granted) {
    throw new SecurityError({
      code: 'CAPABILITY_DENIED',
      message: `Component ${caller} lacks capability ${capability}`,
      ring,
      capability,
    });
  }
  
  // Step 3: Audit the access
  await ctx.exports.append({
    source: 'kernel.security',
    type: 'capability.asserted',
    scope: ctx.scope,
    idempotencyKey: `cap-${caller}-${capability}-${Date.now()}`,
    payload: { caller, capability, granted: granted.id },
    occurredAt: new Date(),
    correlationId: ctx.obs.correlationId,
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
 */
const VISIBILITY_MATRIX = {
  // Ring 0 (Kernel) can see:
  0: ['kernel', 'sensai', 'app', 'bot', 'observability'],
  
  // Ring 1 (SensaiOS) can see:
  1: ['kernel', 'sensai'],
  
  // Ring 3 (Apps) can see:
  3: ['app', 'bot', 'observability'], // NOT kernel or sensai
} as const;

/**
 * Check if import is allowed based on caller ring
 */
export function assertImportAllowed(
  caller: string,
  target: string
): void {
  const callerRing = getComponentRing(caller);
  const targetPrefix = target.split('/')[0];
  
  const allowed = VISIBILITY_MATRIX[callerRing];
  
  if (!allowed.includes(targetPrefix as any)) {
    throw new SecurityError({
      code: 'VISIBILITY_VIOLATION',
      message: `Ring ${callerRing} component ${caller} cannot import from ${target}`,
      caller,
      target,
      allowedPrefixes: allowed,
    });
  }
}
```

### ESLint Enforcement (Compile-Time)

```javascript
// eslint.config.js
export default [
  {
    files: ['src/app/**/*.ts', 'src/bot/**/*.ts', 'src/observability/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/kernel/**'], message: 'Apps cannot import Kernel (use SensaiOS primitives)' },
          { group: ['**/sensaios/**'], message: 'Apps cannot import SensaiOS directly (use @sensai/* paths)' },
        ]
      }]
    }
  },
  {
    files: ['src/sensaios/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/app/**', '**/bot/**', '**/observability/**'], message: 'SensaiOS cannot import Apps (layering violation)' },
        ]
      }]
    }
  },
  {
    files: ['src/kernel/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/sensaios/**', '**/app/**', '**/bot/**'], message: 'Kernel cannot import upper layers' },
        ]
      }]
    }
  }
];
```

### Runtime Enforcement (Dynamic Imports)

```typescript
/**
 * Secure dynamic import wrapper
 */
export async function secureImport<T>(
  caller: string,
  target: string
): Promise<T> {
  // Check visibility rules
  assertImportAllowed(caller, target);
  
  // Check if target is in allowed capability scope
  const capability = await getCapability(caller, 'kernel.observe');
  if (!capability) {
    throw new SecurityError({
      code: 'DYNAMIC_IMPORT_DENIED',
      message: `Component ${caller} lacks dynamic import capability`,
    });
  }
  
  // Audit the import
  await auditEvent({
    type: 'dynamic-import',
    caller,
    target,
    timestamp: Date.now(),
  });
  
  // Perform the import
  return await import(target) as T;
}
```

---

## 4. Installation Primitives

### App Manifest Format

Apps must provide a manifest defining their requirements:

```typescript
/**
 * Application manifest — like package.json for SensaiOS apps
 */
export interface AppManifest {
  /** Unique app identifier */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Semantic version */
  version: string;
  
  /** App description */
  description: string;
  
  /** Required capabilities */
  capabilities: Capability['type'][];
  
  /** Data ownership declarations */
  owns?: {
    tables?: string[];      // DB tables this app owns
    collections?: string[]; // MongoDB collections (future)
  };
  
  /** Dependencies on other apps */
  dependencies?: {
    [appId: string]: string; // semver range
  };
  
  /** Lifecycle hooks */
  lifecycle: {
    install?: (ctx: ComponentContext) => Promise<void>;
    enable?: (ctx: ComponentContext) => Promise<void>;
    disable?: (ctx: ComponentContext) => Promise<void>;
    uninstall?: (ctx: ComponentContext) => Promise<void>;
  };
  
  /** Handler exports */
  handlers?: {
    discord?: Record<string, DiscordHandler>;
    exports?: Record<string, ExportHandler>;
    jobs?: Record<string, JobHandler>;
    http?: Record<string, HttpHandler>;
    cli?: Record<string, CliHandler>;
  };
  
  /** Configuration schema */
  config?: {
    [key: string]: {
      type: 'string' | 'number' | 'boolean' | 'json';
      default?: unknown;
      required?: boolean;
      description?: string;
    };
  };
}
```

### Installation API

```typescript
/**
 * Install an app into SensaiOS
 */
export async function installApp(
  manifest: AppManifest,
  ctx: ComponentContext
): Promise<InstallResult> {
  // Step 1: Validate manifest
  validateManifest(manifest);
  
  // Step 2: Check dependencies
  const unmetDeps = await checkDependencies(manifest.dependencies);
  if (unmetDeps.length > 0) {
    throw new InstallError({
      code: 'UNMET_DEPENDENCIES',
      dependencies: unmetDeps,
    });
  }
  
  // Step 3: Grant capabilities (requires operator approval)
  const approvalRequired = manifest.capabilities.filter(cap => 
    DANGEROUS_CAPABILITIES.includes(cap)
  );
  
  if (approvalRequired.length > 0) {
    // Emit approval request event
    await ctx.exports.append({
      source: 'sensai.install',
      type: 'capability.approval-required',
      scope: ctx.scope,
      idempotencyKey: `install-${manifest.id}-${Date.now()}`,
      payload: {
        app: manifest.id,
        capabilities: approvalRequired,
      },
      occurredAt: new Date(),
      correlationId: ctx.obs.correlationId,
    });
    
    // Wait for approval (operator responds via CLI or dashboard)
    await waitForApproval(manifest.id, approvalRequired);
  }
  
  // Step 4: Grant capabilities
  for (const cap of manifest.capabilities) {
    await ctx.db.capability.create({
      data: {
        component: manifest.id,
        type: cap,
        reason: `Granted during app installation`,
        grantedAt: new Date(),
      }
    });
  }
  
  // Step 5: Run install hook
  if (manifest.lifecycle.install) {
    await manifest.lifecycle.install(ctx);
  }
  
  // Step 6: Register in app registry
  await ctx.db.installedApp.create({
    data: {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      manifest: JSON.stringify(manifest),
      installedAt: new Date(),
      status: 'installed',
    }
  });
  
  // Step 7: Register component with supervisor
  const supervisor = getComponentSupervisor();
  supervisor.register({
    name: manifest.id,
    version: manifest.version,
    description: manifest.description,
    hosts: ['bot'], // TODO: extract from manifest
    capabilities: manifestToComponentCapabilities(manifest),
    owns: manifest.owns,
    handlers: manifest.handlers,
  });
  
  return {
    success: true,
    app: manifest.id,
    version: manifest.version,
    grantedCapabilities: manifest.capabilities,
  };
}

/**
 * Uninstall an app from SensaiOS
 */
export async function uninstallApp(
  appId: string,
  ctx: ComponentContext
): Promise<UninstallResult> {
  // Step 1: Check if app exists
  const app = await ctx.db.installedApp.findUnique({ where: { id: appId } });
  if (!app) {
    throw new UninstallError({
      code: 'APP_NOT_FOUND',
      app: appId,
    });
  }
  
  // Step 2: Check dependents
  const dependents = await findDependentApps(appId);
  if (dependents.length > 0) {
    throw new UninstallError({
      code: 'HAS_DEPENDENTS',
      app: appId,
      dependents,
    });
  }
  
  // Step 3: Disable component
  const supervisor = getComponentSupervisor();
  await supervisor.disable(appId);
  
  // Step 4: Run uninstall hook
  const manifest = JSON.parse(app.manifest) as AppManifest;
  if (manifest.lifecycle.uninstall) {
    await manifest.lifecycle.uninstall(ctx);
  }
  
  // Step 5: Revoke capabilities
  await ctx.db.capability.updateMany({
    where: { component: appId },
    data: { revokedAt: new Date() }
  });
  
  // Step 6: Remove from registry
  await ctx.db.installedApp.delete({ where: { id: appId } });
  
  // Step 7: Unregister component
  supervisor.unregister(appId);
  
  return {
    success: true,
    app: appId,
  };
}
```

### CLI Commands

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

Every kernel primitive must check capabilities before executing:

```typescript
// Example: Database primitive with capability check
export class DbPrimitive {
  constructor(private prisma: PrismaClient, private caller: string) {}
  
  async transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    // Assert write capability
    await assertCapability(this.caller, 'db.write', this.ctx);
    
    // Perform transaction
    return this.prisma.$transaction(fn);
  }
  
  async query<T>(sql: string): Promise<T[]> {
    // Assert read capability
    await assertCapability(this.caller, 'db.read', this.ctx);
    
    // Check table scope
    const tables = extractTablesFromSql(sql);
    await assertTableAccess(this.caller, tables, this.ctx);
    
    // Perform query
    return this.prisma.$queryRaw(sql) as Promise<T[]>;
  }
}
```

### Supervisor Enforcement

```typescript
/**
 * Enhanced supervisor with capability enforcement
 */
export class SecureSupervisor extends ComponentSupervisor {
  /**
   * Enable component — checks capabilities first
   */
  async enable(componentId: string): Promise<void> {
    // Step 1: Verify all required capabilities are granted
    const manifest = this.registry.get(componentId);
    if (!manifest) {
      throw new Error(`Component ${componentId} not registered`);
    }
    
    const missingCaps = await checkMissingCapabilities(
      componentId,
      manifest.capabilities
    );
    
    if (missingCaps.length > 0) {
      throw new SecurityError({
        code: 'MISSING_CAPABILITIES',
        component: componentId,
        missing: missingCaps,
      });
    }
    
    // Step 2: Create sandboxed context
    const ctx = createSandboxedContext(componentId, manifest.capabilities);
    
    // Step 3: Call lifecycle hook
    if (manifest.onEnable) {
      await manifest.onEnable(ctx);
    }
    
    // Step 4: Register handlers (with capability checks)
    if (manifest.handlers) {
      await this.registerHandlersSecure(componentId, manifest.handlers, ctx);
    }
  }
  
  /**
   * Register handlers with capability wrapper
   */
  private async registerHandlersSecure(
    componentId: string,
    handlers: SensaiComponent['handlers'],
    ctx: ComponentContext
  ): Promise<void> {
    // Wrap each handler with capability check
    if (handlers.discord) {
      for (const [name, handler] of Object.entries(handlers.discord)) {
        const wrapped = async (...args: Parameters<DiscordHandler>) => {
          await assertCapability(componentId, 'discord.send', ctx);
          return handler(...args);
        };
        this.registerDiscordHandler(name, wrapped, componentId);
      }
    }
    
    // Similar wrapping for other handler types...
  }
}
```

---

## 6. Game Server Boundary

### Encrypted API Surface

Apps should NOT see raw database or kernel. They see a **Game Server API** with:
- Type-safe methods
- Encrypted payloads (optional for sensitive data)
- Rate limiting
- Audit logging

```typescript
/**
 * Game Server API — the ONLY interface apps see
 */
export interface GameServerAPI {
  /**
   * Battle operations
   */
  battles: {
    create(params: CreateBattleParams): Promise<Battle>;
    execute(battleId: string, action: BattleAction): Promise<BattleResult>;
    forfeit(battleId: string): Promise<void>;
  };
  
  /**
   * Encounter operations
   */
  encounters: {
    spawn(channelId: string): Promise<Encounter>;
    catch(encounterId: string, pokeball: string): Promise<CatchResult>;
  };
  
  /**
   * Trainer operations
   */
  trainers: {
    get(discordId: string): Promise<Trainer>;
    updateMoney(discordId: string, delta: number): Promise<void>;
  };
  
  /**
   * Observability (limited)
   */
  logs: {
    info(message: string, data?: Record<string, unknown>): void;
    error(message: string, error: Error): void;
  };
}

/**
 * Create encrypted API client for an app
 */
export function createGameServerClient(
  appId: string,
  ctx: ComponentContext
): GameServerAPI {
  return {
    battles: {
      async create(params) {
        // Check capability
        await assertCapability(appId, 'game.battle.create', ctx);
        
        // Route through SensaiOS (not direct DB access)
        return await ctx.exports.append({
          source: appId,
          type: 'battle.create-request',
          scope: ctx.scope,
          idempotencyKey: `battle-create-${Date.now()}`,
          payload: encryptIfSensitive(params),
          occurredAt: new Date(),
          correlationId: ctx.obs.correlationId,
        });
      },
      // ... other methods
    },
    // ... other namespaces
  };
}
```

### Why Encryption Matters

If battles contain user data (Discord IDs, guild IDs), apps should never see them in plaintext. SensaiOS encrypts sensitive fields before passing to apps:

```typescript
/**
 * Encrypt sensitive battle data before passing to apps
 */
function encryptBattleForApp(battle: Battle): EncryptedBattle {
  return {
    id: battle.id,
    status: battle.status,
    // Encrypted fields (apps can't read these)
    participant1: encrypt(battle.participant1DiscordId),
    participant2: encrypt(battle.participant2DiscordId),
    // Public fields
    turnNumber: battle.turnNumber,
    moves: battle.moves,
  };
}
```

Apps can use encrypted tokens for operations without seeing underlying data.

---

## 7. Implementation Roadmap

### Phase 1: Ring Security Foundation (Week 1-2)

**Goal:** Enforce ring boundaries at compile-time and runtime.

**Tasks:**
1. Add ring level to component manifests
2. Implement `assertCapability()` function
3. Add capability checks to all kernel primitives
4. Create capability grant/revoke CLI commands
5. Add ESLint rules for cross-ring imports
6. Add runtime dynamic import checks

**Acceptance Criteria:**
- [ ] All components have ring level assigned
- [ ] Capability checks in db/exports/jobs/outbox primitives
- [ ] ESLint blocks invalid imports
- [ ] Tests verify capability denial

### Phase 2: Installation Primitives (Week 3-4)

**Goal:** Support installing/uninstalling apps.

**Tasks:**
1. Define AppManifest schema
2. Implement `installApp()` function
3. Implement `uninstallApp()` function
4. Add dependency resolution
5. Create approval workflow for dangerous capabilities
6. Add `sensaios` CLI tool

**Acceptance Criteria:**
- [ ] Can install a test app via CLI
- [ ] Can uninstall without breaking system
- [ ] Dependency checks prevent invalid installs
- [ ] Approval workflow blocks dangerous capabilities

### Phase 3: Game Server Boundary (Week 5-6)

**Goal:** Encrypt the boundary between SensaiOS and Apps.

**Tasks:**
1. Define GameServerAPI interface
2. Implement encrypted client factory
3. Add encryption for sensitive fields
4. Refactor existing apps to use GameServerAPI
5. Add rate limiting to API methods
6. Add audit logging for all API calls

**Acceptance Criteria:**
- [ ] Apps use GameServerAPI, not raw primitives
- [ ] Sensitive data encrypted in payloads
- [ ] Rate limits prevent abuse
- [ ] All API calls audited in exports

### Phase 4: Visibility Enforcement (Week 7-8)

**Goal:** Lock down all layer boundaries.

**Tasks:**
1. Add import assertion to module loader
2. Implement `secureImport()` wrapper
3. Add runtime visibility checks
4. Create security audit dashboard
5. Add automated security tests
6. Document security model in architecture-bible

**Acceptance Criteria:**
- [ ] Apps cannot dynamically import kernel/sensai
- [ ] Security violations logged and alerted
- [ ] Dashboard shows capability usage
- [ ] 100+ tests verify boundaries

---

## 8. Non-Negotiables

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

## Conclusion

This security model transforms SensaiOS from a "component framework" into a **true operating system** with:
- Hard boundaries enforced at multiple layers
- Installation/removal primitives for app lifecycle
- Capability-based security preventing unauthorized access
- One-way visibility (higher rings see down, not up)
- Encrypted boundaries for sensitive data

The implementation roadmap is aggressive (8 weeks) but achievable by breaking it into 4 focused phases. Each phase delivers value independently while building toward the complete vision.

**Next Step:** Create tasks in Tasklist.md for Phase 1 (Ring Security Foundation) and begin implementation.

---

**Document Version:** 1.0.0  
**Created:** January 1, 2026  
**Purpose:** Define OS-grade security for SensaiOS  
**Authority:** Supersedes all previous security guidance
