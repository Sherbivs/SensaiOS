# Database Systems Architect — Expert Review
**Focus:** Postgres / Transactional Design  
**Date:** December 30, 2025

---

## Core Recommendations

### 1. Enforce Single Atomic Commit Boundary
"Your 3-layer doc model is good. Now make the runtime model match it by enforcing ONE atomic commit boundary: the database transaction."

**Action Items:**
- Any operation that combines 'write to DB' + 'emit export/job/outbox' must be a single transaction
- If you can't make it one transaction, you must declare it eventual and handle retries/idempotency explicitly
- **Risk:** Without this, you'll eventually ship heisenbugs

### 2. Define Hard Consistency Contract
"Define a hard contract: which writes are strong-consistency (battle outcomes, inventory, money), and which are eventual (metrics, logs, analytics). Put that in the docs as a table."

**Required Documentation:**
Create a consistency matrix:

| Domain | Consistency Model | Rationale |
|--------|------------------|-----------|
| Battle outcomes | Strong (ACID) | Correctness-critical |
| Inventory | Strong (ACID) | Money/items must be exact |
| Player money | Strong (ACID) | Financial correctness |
| Metrics | Eventual | Can tolerate loss |
| Logs | Eventual | Observability, not correctness |
| Analytics | Eventual | Aggregates, not transactions |

### 3. Adopt Transactional Outbox Pattern
"Adopt a transactional outbox pattern: write the domain change + an outbox row in the same transaction; a worker drains it. Do not 'fire and forget' from in-process code paths."

**Implementation:**
```typescript
// ❌ WRONG: Dual write (not atomic)
await prisma.battle.update({ where: { id }, data: { status: 'complete' } });
await exports.append({ type: 'battle.completed', payload: { battleId: id } });

// ✅ CORRECT: Single transaction with outbox
await prisma.$transaction(async (tx) => {
  await tx.battle.update({ where: { id }, data: { status: 'complete' } });
  await tx.outbox.create({
    data: {
      type: 'battle.completed',
      payload: { battleId: id },
      status: 'pending'
    }
  });
});
// Worker drains outbox separately
```

### 4. Treat Kernel Ring Buffer as Telemetry Transport
"Your kernel ring buffer should be treated as *telemetry transport*, not correctness transport. If it drops, correctness must still hold."

**Design Rule:**
- Ring buffer drops are acceptable for observability
- Ring buffer drops are **never** acceptable for correctness paths
- DB transactions + outbox = correctness
- Ring buffer = visibility

---

## Validation Checklist

- [ ] All DB + export/job/outbox combinations are single transactions
- [ ] Consistency matrix documented and enforced
- [ ] Transactional outbox implemented for all correctness-critical events
- [ ] Ring buffer documented as telemetry-only (not correctness)
- [ ] Dual-write code paths eliminated
- [ ] Retry/idempotency logic in place for eventual consistency paths

---

**Reference:** [SENSAIOS-SYSTEM-OVERVIEW.md](./SENSAIOS-SYSTEM-OVERVIEW.md)
