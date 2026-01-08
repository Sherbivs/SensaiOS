# Sensai OS — Quick Reference Card

**Version:** 1.2.0 | **Status:** REFERENCE | **Last Updated:** January 8, 2026

---

## 🎯 The Golden Invariant

```
CLIENTS APPEND EXPORTS.
WORKERS TRANSFORM EXPORTS.
POSTGRES IS THE TRUTH.
EVERYTHING ELSE IS A VIEW.
```

---

## 📐 Architecture Layers (v1.2.0)

```
L5: v1.2.0 SUBSYSTEMS — Storage, Locks, Visualization, Delegation
L4: SYSTEM SERVICES   — RBAC, Audit, Quotas, Config
L3: WORKER RUNTIME    — INGEST → PROJECT → DELIVER → GC
L2: EXPORT LOG        — Append-only events with monotonic seq
L1: OBJECT STORE      — Blobs in DB (SHA-256 content-addressable)
L0: STORAGE           — PostgreSQL + SQLite buffer
```

**v1.2.0 Subsystems:**
- **Storage:** Content-addressable SHA-256 blob storage with deduplication
- **Concurrency:** Advisory lock manager with deadlock prevention  
- **Visualization:** Multi-format dependency graph output (ASCII/Mermaid/JSON)
- **Delegation:** Time-bounded capability grants (max 1h TTL, max 3 chain depth)

---

## 🧱 Kernel Primitives

| Primitive | Purpose | Example |
|-----------|---------|---------|
| `ctx.db` | Database access | `ctx.db.prisma.trainer.findMany()` |
| `ctx.exports` | Append-only event log | `ctx.exports.append({ type: '...' })` |
| `ctx.jobs` | Background job queue | `ctx.jobs.enqueue({ kind: '...' })` |
| `ctx.outbox` | External message delivery | `ctx.outbox.send({ destination: 'discord' })` |
| `ctx.config` | Configuration access | `ctx.config.get('maxBattles')` |
| `ctx.rbac` | Permission checking | `ctx.rbac.assert('battle.start')` |
| `ctx.obs` | Logging & metrics | `ctx.obs.log.info('op', 'msg', data)` |
| `ctx.rng` | Deterministic RNG | `ctx.rng.derive(['battle', id]).next()` |
| `ctx.storage` | Object storage | `ctx.storage.putBlob(buffer)` |

---

## 🧩 Component Manifest (Required Fields)

```typescript
const component: SensaiComponent = {
  name: 'game.battles',           // Scoped name
  version: '1.0.0',               // Semver
  hosts: ['bot', 'worker'],       // Where it runs
  capabilities: {
    db: ['read', 'write'],        // Permissions needed
  },
  owns: {
    canonical: ['Battle'],        // Tables it writes to
  },
  handlers: {
    discord: { /* ... */ },
    exports: { /* ... */ },
    jobs: { /* ... */ },
  },
};
```

---

## 🔐 Multi-Tenant Scope (v1.1.2)

```typescript
interface TenantScope {
  tenantId: string;  // "prod", "staging", "dev"
  guildId: string;   // Discord guild ID or "dm"/"system"
}

// MANDATORY in all envelopes
await ctx.exports.append({
  type: 'battle.started',
  payload: { ... },
  scope: ctx.scope,  // ← REQUIRED
  correlationId: ctx.obs.correlationId,
});
```

---

## 🛡️ Guarded Execution (v1.1.2)

```typescript
// ALL handlers must be wrapped
async function handleCommand(ctx, interaction) {
  return runGuarded(ctx, 'command.battle', async () => {
    // Handler logic here
  });
}
```

---

## ⚠️ Error Taxonomy (v1.1.2)

```typescript
// Use typed errors
throw new SensaiError(
  'BATTLE_NOT_YOUR_TURN',      // Error code
  "It's not your turn",        // Message
  { battleId, currentPlayer }  // Context
);

// Error code categories:
// 1xxx - Kernel errors
// 2xxx - Component errors
// 3xxx - Data errors
// 4xxx - Discord errors
// 5xxx - Business logic errors
// 6xxx - External errors
```

---

## 🚀 Boot Sequence (v1.1.2)

```
1. Create boot logger (NO dependencies)
2. Load configuration
3. Connect to database
4. Initialize kernel
5. Load components
6. Initialize full observability hub
```

**Key:** Logging works BEFORE database connects.

---

## 📊 Data Ownership Rules

| Rule | Example |
|------|---------|
| Each table has ONE owner | `game.core` owns `Trainer` |
| Only owner writes | Other components use exports |
| Anyone can read | Queries allowed across components |
| Projections are derived | Rebuilt from export log |

```typescript
// ❌ WRONG: Writing to unowned table
await ctx.db.prisma.trainer.update({ ... });

// ✅ CORRECT: Request via export
await ctx.exports.append({
  type: 'trainer.update.request',
  payload: { trainerId, updates },
});
```

---

## 📨 Discord I/O Tiers

| Tier | When | Allowed |
|------|------|---------|
| **IMMEDIATE** | First response | `deferReply()`, error messages |
| **DEFERRED** | After defer | `editReply()`, `followUp()` |
| **OUTBOX** | State changes | Battle results, DMs, notifications |

---

## 🔒 Concurrency Model

| Domain | Lock Type | Key Pattern |
|--------|-----------|-------------|
| Battles | Advisory | `battle:{id}` |
| Encounters | Advisory | `encounter:{id}` |
| Inventory | Row lock | Per-row |
| Config | Optimistic | `version` column |

---

## 📁 File Structure

```
src/sensai/
├── kernel/
│   ├── index.ts           # Bootstrap
│   ├── boot-logger.ts     # Pre-DB logging
│   ├── primitives/        # All primitives
│   ├── supervisor.ts      # Component lifecycle
│   └── guarded.ts         # runGuarded()
├── components/
│   ├── game/              # Game components
│   ├── security/          # Security components
│   └── observability/     # Obs components
├── errors/
│   ├── sensai-error.ts    # Error class
│   └── codes.ts           # Error codes
└── types/
    ├── component.ts       # Component types
    ├── scope.ts           # TenantScope
    └── envelopes.ts       # Envelope types
```

---

## ✅ Implementation Checklist

### Component
- [ ] Manifest has all required fields
- [ ] Data ownership declared
- [ ] Resource budgets specified

### Handler
- [ ] Wrapped with `runGuarded()`
- [ ] Uses idempotency keys
- [ ] Propagates correlation ID

### Data
- [ ] Queries filtered by scope
- [ ] Uses `ctx.rng`, not `Math.random()`
- [ ] Uses `ctx.storage`, not `fs`

### Multi-Tenant (v1.1.2)
- [ ] Scope in all envelopes
- [ ] Scope in all queries
- [ ] Scope in all logs

### Errors (v1.1.2)
- [ ] Uses `SensaiError`
- [ ] Appropriate error code
- [ ] Context attached

---

## 🚫 Non-Negotiables

| ❌ Never | ✅ Instead |
|----------|-----------|
| Multiple table writers | Single owner via exports |
| Direct handler calls | Exports/Jobs/Outbox |
| `Math.random()` | `ctx.rng.derive()` |
| `fs.writeFile()` | `ctx.storage.putBlob()` |
| Unbounded caches | LRU with hard limits |
| Hardcoded admin checks | `ctx.rbac.assert()` |

---

## 📚 Documentation Index

| Document | Purpose |
|----------|---------|
| `SENSAI-FINAL-ARCHITECTURE.md` | Canonical specification |
| `SENSAI-COMPONENT-OS-BLUEPRINT.md` | Component model details |
| `SENSAI-ARCHITECTURE-ADDENDUM.md` | Future-proofing patterns |
| `SENSAI-MULTITENANT-OBS-FIRST-ADDENDUM.md` | v1.1.2 patterns |
| `sensai.instructions.md` | AI agent guidance |

---

**Quick Reference Version:** 1.1.2 | **Print-Friendly:** Yes
