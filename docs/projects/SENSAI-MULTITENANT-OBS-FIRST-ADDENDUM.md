# Sensai Addendum — Multi‑Tenant + "Observability-First" Default Pattern
**Date:** 2025‑12‑28  
**Applies to:** Sensai Kernel + All Components (Security bot, CLI tools, Observability, Game, Pipelines)  
**Status:** Proposed spec delta (v1.0.0 → v1.1.x)  
**Version:** v1.1.2

This addendum tightens two requirements:

1) **Multi‑tenant by default** (multiple guilds + multiple customer projects + pipeline inputs)  
2) **Log + error detection loads first and is enforced everywhere by default** (including future components)

It is designed to fit the existing Sensai v1.0.0 plan: kernel primitives, component model, host model, and "no file I/O" discipline.  

---

## 1) Multi‑Tenancy: the missing "spine" across all primitives

### 1.1 Define the tenant model (minimal + scalable)
Use **two identifiers**:

- **tenantId**: customer/project boundary (e.g., "Infinity Gauntlet" as a client project)
- **guildId**: Discord guild boundary (one tenant may have one or many guilds)

For MVP simplicity you may set `tenantId == guildId` for single‑guild projects, but the schema should support both.

#### New kernel concept
Every command/event/work item has a **scope**:

```ts
type TenantScope =
  | { tenantId: string; guildId: string }     // Discord tenant (most gameplay/security)
  | { tenantId: string; guildId?: undefined } // Non-discord pipelines / backoffice
```

### 1.2 Make tenant scope required in **every envelope**
Add `scope` to **ExportEnvelope**, **JobEnvelope**, **OutboxEnvelope**, **AuditEvent**:

```ts
interface ScopedEnvelope {
  scope: TenantScope;
}

interface ExportEnvelope extends ScopedEnvelope {
  scope: TenantScope;
  source: string;
  type: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  correlationId: string;
  parentCorrelationId?: string;
  signature?: string;
}
```

**Rule:** If a handler can't determine a scope, it must fail fast with a typed error (see §3).

### 1.3 Put tenant scope into the database tables (not just JSON payloads)
Add columns (or add now as placeholders) to kernel tables:

- `exports.tenant_id`, `exports.guild_id`
- `jobs.tenant_id`, `jobs.guild_id`
- `outbox_messages.tenant_id`, `outbox_messages.guild_id`
- `audit_events.tenant_id`, `audit_events.guild_id`
- `component_health.guild_id` (optional but valuable)

And index by tenant/guild for routing and isolation.

### 1.4 Update canonical game/security tables for multi‑guild
In the current single‑guild design, `Trainer` is effectively per-user. For multi‑guild:

- `Trainer` becomes unique on `(guildId, userId)`  
- `Cooldown`, `Encounter`, `Battle`, `Party`, `Monster` are scoped to guild via FK path

This prevents cross‑guild state bleed (a user can be in multiple guilds with separate progress).

### 1.5 Tenant provisioning placeholders (for "more customers")
Add small control-plane tables:

- `tenants(id, name, plan, status, created_at)`
- `tenant_guilds(tenant_id, guild_id, status, created_at)`
- `tenant_sources(id, tenant_id, kind, name, secret_ref, status)` (pipeline inputs)

Pipeline ingestion then becomes: **append exports with a verified source → scoped to tenant**.

---

## 2) Observability-First: it loads before anything else

### 2.1 Split Observability into two layers
To satisfy "loads first" and "cannot be bypassed":

**A) Kernel Early Observability (mandatory)**
- Starts at process boot (before DB connection)
- Captures:
  - startup diagnostics
  - DB connection failures
  - uncaught exceptions / unhandled rejections
  - event-loop stalls / OOM warnings (best-effort)
- Emits structured logs to stdout and keeps a small in-memory ring buffer.

**B) Observability Component (feature layer)**
- Exposes `/healthz`, `/readyz`, `/metrics`
- Writes component health rows
- Optional dashboard integration / alert routing logic

This preserves your component system while ensuring the OS can't "boot silent."

### 2.2 Update the host boot sequence (hard order)
New boot order (strict):

0. **BOOT LOGGER + PANIC TRAP** (no DB required)
1. Kernel init: load env + build info + host identity
2. Attempt DB connect (retry with backoff)
3. Initialize kernel primitives
4. Load **observability system component** (or built-in wrapper)
5. Component discovery + dependency sort
6. Load other components
7. Ready

### 2.3 Observability as a "system component" (cannot be disabled)
Add one of:

- Manifest flag: `system: true` + `required: true`
- Control plane guard: registry refuses disable/uninstall of system components

---

## 3) The system-wide default pattern: "Guarded Execution"
This is the mechanism that makes logs + error detection apply to **every** future feature automatically.

### 3.1 Kernel-level wrapper for all handlers
All handler invocation routes through a kernel function:

```ts
async function runGuarded<T>(
  ctx: ComponentContext,
  meta: {
    hook: "discord" | "exports" | "jobs" | "http" | "cli";
    handler: string;
    scope?: TenantScope;
  },
  fn: () => Promise<T>
): Promise<T> {
  const correlationId = ctx.obs.correlationId ?? generateCorrelationId();
  const startTime = performance.now();
  
  ctx.obs.log.debug('handler_start', `Starting ${meta.handler}`, {
    hook: meta.hook,
    scope: meta.scope,
  });
  
  try {
    const result = await fn();
    const duration = performance.now() - startTime;
    
    ctx.obs.log.info('handler_success', `Completed ${meta.handler}`, {
      hook: meta.hook,
      scope: meta.scope,
      durationMs: duration,
    });
    
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    const sensaiError = normalizeSensaiError(error, meta, ctx);
    
    ctx.obs.log.error('handler_error', sensaiError.message, {
      hook: meta.hook,
      scope: meta.scope,
      durationMs: duration,
      errorCode: sensaiError.code,
      errorKind: sensaiError.kind,
      severity: sensaiError.severity,
    });
    
    // Record to component_health
    await recordComponentError(ctx, meta, sensaiError);
    
    // Optional: append error export for sentinel
    if (sensaiError.severity === 'critical' || sensaiError.severity === 'error') {
      await ctx.exports.append({
        scope: meta.scope ?? { tenantId: 'system' },
        source: meta.handler,
        type: 'sensai.error.detected',
        idempotencyKey: `${correlationId}-error`,
        payload: {
          code: sensaiError.code,
          kind: sensaiError.kind,
          severity: sensaiError.severity,
          message: sensaiError.message,
          stack: sensaiError.stack,
        },
        occurredAt: new Date(),
        correlationId,
      });
    }
    
    throw sensaiError;
  }
}
```

**runGuarded does, always:**
- Ensure a correlationId exists (create if missing)
- Attach scope (tenantId/guildId) to log fields
- Log start/end + duration
- Catch errors and convert to a typed SensaiError
- Record the error signal:
  - increment component_health error_count
  - append an `exports` record like `sensai.error.detected` (optional)
  - enqueue an alert job if severity warrants
- Apply circuit breaker rules if needed

### 3.2 Typed error taxonomy (so detection is not "string matching")
Define:

```ts
type ErrorSeverity = "debug" | "info" | "warn" | "error" | "critical";
type ErrorKind = "USER" | "TRANSIENT" | "BUG" | "SECURITY" | "DEPENDENCY";

class SensaiError extends Error {
  code: string;          // stable identifier (e.g., "BATTLE_INVALID_MOVE")
  kind: ErrorKind;       // classification for routing
  severity: ErrorSeverity;
  retryable: boolean;
  scope?: TenantScope;
  component?: string;
  correlationId?: string;
  meta?: Record<string, unknown>;
  
  constructor(options: {
    code: string;
    message: string;
    kind: ErrorKind;
    severity?: ErrorSeverity;
    retryable?: boolean;
    scope?: TenantScope;
    component?: string;
    correlationId?: string;
    meta?: Record<string, unknown>;
    cause?: Error;
  }) {
    super(options.message, { cause: options.cause });
    this.code = options.code;
    this.kind = options.kind;
    this.severity = options.severity ?? 'error';
    this.retryable = options.retryable ?? (options.kind === 'TRANSIENT');
    this.scope = options.scope;
    this.component = options.component;
    this.correlationId = options.correlationId;
    this.meta = options.meta;
  }
}
```

**Rule:** All kernel primitives throw or return SensaiErrors (or are wrapped into them).

### 3.3 Error detection pipeline (minimal)
Create an **Error Sentinel** worker job kind (or component):

- Consumes:
  - job failures
  - outbox failures
  - `sensai.error.detected` exports (if enabled)
  - component health degradations
- Dedupes by `(code, component, tenantId, guildId, fingerprint)` over a time window
- Routes to:
  - operator channel (global)
  - tenant-specific channel (per customer/guild config)

This prevents alert spam and makes multi-customer operations manageable.

---

## 4) Enforcement so future features can't "opt out"
This is how you make "by default" real.

### 4.1 Runtime enforcement (hard)
- Kernel refuses to register a handler unless:
  - it is wrapped via `runGuarded`
  - it declares scope derivation rules
- Kernel ensures `ctx.obs` exists for every handler and is non-null.

```ts
// In kernel/supervisor.ts
function registerHandler(
  component: SensaiComponent,
  hookType: string,
  handlerName: string,
  handler: Function
): void {
  // Wrap handler automatically
  const guarded = async (input: any, ctx: ComponentContext) => {
    return runGuarded(ctx, {
      hook: hookType as any,
      handler: `${component.name}.${handlerName}`,
      scope: extractScope(input, hookType),
    }, () => handler(input, ctx));
  };
  
  handlerRegistry.set(`${component.name}.${hookType}.${handlerName}`, guarded);
}
```

### 4.2 Build-time enforcement (CI)
Add lint rules:
- Ban `console.*` outside `observability/*`
- Ban `process.on('uncaughtException'|...)` outside kernel bootstrap
- Ban direct `fetch`/HTTP egress outside outbox delivery components
- Ban `Math.random()` in gameplay/security components

Add "component contract tests":
- Every component must be invokable through kernel wrapper in tests.
- Every handler must produce at least one structured log line on success and error.

### 4.3 Scaffolding enforcement
Provide a generator:
- `sensai new component <name>`
- It generates:
  - manifest with `dependencies: ['observability']`
  - handler skeleton already calling `runGuarded`
  - default budgets and config schema stub
  - test stub that asserts wrapper behavior

```typescript
// Generated component template
export const NewComponent: SensaiComponent = {
  name: 'domain.new-feature',
  version: '1.0.0',
  hosts: ['bot'],
  
  // ✅ Observability dependency ensures logging available
  dependencies: ['observability'],
  
  capabilities: {
    db: ['read'],
    discord: ['send'],
  },
  
  owns: {
    canonical: [],
    projections: [],
  },
  
  resources: {
    maxCacheMb: 10,
    maxQueueSize: 1000,
    maxConcurrency: 5,
  },
  
  handlers: {
    discord: {
      'command.example': async (interaction, ctx) => {
        // ✅ Already wrapped by kernel - logging automatic
        // ✅ Scope derived from interaction.guildId
        return { content: 'Hello!' };
      },
    },
  },
};
```

---

## 5) Practical SQL deltas (placeholders you can add now)

### 5.1 Exports: add monotonic sequence + tenant scope
```sql
-- Add tenant scope columns to exports table
ALTER TABLE exports
  ADD COLUMN IF NOT EXISTS seq BIGSERIAL,
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS guild_id TEXT;

-- Index for efficient tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_exports_scope_seq
  ON exports(tenant_id, guild_id, seq);

-- Index for type-based consumption within tenant
CREATE INDEX IF NOT EXISTS idx_exports_type_scope_seq
  ON exports(type, tenant_id, guild_id, seq);
```

### 5.2 Jobs/outbox/audit: add scope columns + indexes
```sql
-- Jobs table
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS guild_id TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_scope_status
  ON jobs(tenant_id, guild_id, status);

-- Outbox messages table
ALTER TABLE outbox_messages
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS guild_id TEXT;

CREATE INDEX IF NOT EXISTS idx_outbox_scope_status
  ON outbox_messages(tenant_id, guild_id, status);

-- Audit events table
ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS guild_id TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_scope_timestamp
  ON audit_events(tenant_id, guild_id, timestamp);
```

### 5.3 Tenant provisioning tables (placeholders)
```sql
-- Tenant registry
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT DEFAULT 'free',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenant to guild mapping
CREATE TABLE IF NOT EXISTS tenant_guilds (
  tenant_id TEXT REFERENCES tenants(id),
  guild_id TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, guild_id)
);

-- Pipeline input sources per tenant
CREATE TABLE IF NOT EXISTS tenant_sources (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  kind TEXT NOT NULL,  -- 'discord', 'webhook', 'api', etc.
  name TEXT NOT NULL,
  secret_ref TEXT,     -- Reference to secrets manager
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 6) Infinity Gauntlet as a customer project (how it fits)
Infinity Gauntlet already maps naturally to:
- `tenantId = "infinity-gauntlet"` (or the guildId)
- `guildId = <discord guild id>`

All members are "encoded to their guild" by ensuring:
- every gameplay/security write is scoped to guild
- every export/job/outbox message carries the same scope

This enables:
- one shared platform serving multiple guilds
- multiple projects/customers sharing the same kernel + components
- pipeline inputs per tenant without risking cross-tenant leakage

### Practical mapping
```typescript
// In Discord handler
async function handleBattleCommand(interaction: ChatInputCommandInteraction, ctx: ComponentContext) {
  const scope: TenantScope = {
    tenantId: ctx.config.get('tenantId') ?? interaction.guildId!,
    guildId: interaction.guildId!,
  };
  
  // All operations now carry scope
  await ctx.exports.append({
    scope,
    source: 'game.battles',
    type: 'battle.started',
    // ...
  });
}
```

---

## 7) Implementation order (low regret)

### Phase 1: Foundation (Week 1-2)
1) Add `tenantId/guildId` to envelope interfaces
2) Add `scope` to `ComponentContext` (derived from input)
3) Update existing handlers to populate scope

### Phase 2: Guarded Execution (Week 2-3)
4) Implement `runGuarded` wrapper in kernel
5) Enforce handler registration through wrapper
6) Add `SensaiError` class and normalization

### Phase 3: Early Boot (Week 3)
7) Implement boot logger (before DB connect)
8) Add panic trap for uncaught exceptions
9) Create in-memory ring buffer for early logs

### Phase 4: Database Schema (Week 4)
10) Add scope columns to kernel tables (exports/jobs/outbox/audit)
11) Create indexes for tenant-scoped queries
12) Add tenant provisioning tables (placeholders)

### Phase 5: Reference Implementation (Week 4-5)
13) Convert security component to fully scoped + guarded
14) Add Error Sentinel worker for alert routing
15) Document patterns and update instructions

### Phase 6: Enforcement (Ongoing)
16) Add ESLint rules for banned patterns
17) Add component contract tests
18) Create scaffolding generator

---

## 8) Summary: What You Get

| Before | After |
|--------|-------|
| Single-guild implicit | Multi-tenant explicit (scope required) |
| Logging optional | Logging mandatory (kernel-enforced) |
| Error handling varies | Error taxonomy + detection pipeline |
| Components can boot silent | Early boot logger + panic trap |
| "Best practices" documentation | Runtime + CI enforcement |

**The key insight:** Sensai becomes a **platform** instead of a single game that happens to have workers. New features get logging/scoping automatically because the kernel refuses to run them otherwise.

---

## References

- **SENSAI-FINAL-ARCHITECTURE.md** — Base v1.0.0 specification
- **SENSAI-ARCHITECTURE-ADDENDUM.md** — v1.1.0 clarifications
- **sensai.instructions.md** — AI agent development guide
- **docs/architecture-bible/** — Production architecture documentation

---

**Document Version:** v1.1.2  
**Created:** December 28, 2025  
**Purpose:** Spec delta for multi-tenant + observability-first patterns  
**Status:** Proposed — Ready for implementation planning
