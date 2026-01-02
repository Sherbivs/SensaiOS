# Distributed Systems Engineer — Expert Review
**Focus:** Failure Modes, Idempotency, Consistency  
**Date:** December 30, 2025

---

## Core Recommendations

### 1. Write Down the Consistency Model First
"Your next step isn't more diagrams; it's a consistency model. Write it down and enforce it with interfaces."

**Required Documentation:**
Create a formal consistency contract document that specifies:
- Which operations are ACID (strong consistency)
- Which operations are BASE (eventual consistency)
- Exactly how each eventual operation reaches consistency
- Timeout/retry/backoff parameters for each operation

### 2. Enumerate All Failure Modes
"List the failure modes: crash after DB write before outbox send, duplicate delivery, reordering, partial progress, poison messages. Then show how each is handled (idempotency keys, dedupe tables, lease/ack protocol)."

**Critical Failure Modes:**

#### **Failure Mode 1: Crash After DB Write, Before Outbox Send**
- **Scenario:** Transaction commits, process crashes before emitting export
- **Solution:** Transactional outbox (DB + outbox in same transaction)
- **Validation:** No correctness-critical events bypass outbox

#### **Failure Mode 2: Duplicate Delivery**
- **Scenario:** Network retry causes same message delivered twice
- **Solution:** Idempotency keys + dedupe table
- **Validation:** All handlers check dedupe table before processing

#### **Failure Mode 3: Message Reordering**
- **Scenario:** Messages arrive out of order (battle.started after battle.completed)
- **Solution:** Sequence numbers + order enforcement
- **Validation:** Consumers reject out-of-order messages

#### **Failure Mode 4: Partial Progress**
- **Scenario:** Multi-step operation fails halfway (battle created, but team not locked)
- **Solution:** Sagas with compensating transactions OR single atomic transaction
- **Validation:** Either one transaction or explicit saga with rollback

#### **Failure Mode 5: Poison Messages**
- **Scenario:** Malformed message crashes consumer repeatedly
- **Solution:** Dead-letter queue + error budget (max 3 retries)
- **Validation:** All consumers have DLQ + alerting

### 3. Everything Must Be Idempotent
"Everything that can retry must be idempotent. If it can't be idempotent, it must be guarded by a lock/unique constraint and produce a deterministic outcome."

**Idempotency Patterns:**

#### **Pattern 1: Idempotency Key (Recommended)**
```typescript
await prisma.$transaction(async (tx) => {
  // Check if already processed
  const existing = await tx.processedEvents.findUnique({
    where: { idempotencyKey: event.idempotencyKey }
  });
  if (existing) return existing.result;

  // Process once
  const result = await processEvent(tx, event);

  // Record completion
  await tx.processedEvents.create({
    data: {
      idempotencyKey: event.idempotencyKey,
      result,
      processedAt: new Date()
    }
  });

  return result;
});
```

#### **Pattern 2: Natural Idempotency**
```typescript
// SET operations are naturally idempotent
await prisma.user.update({
  where: { id: userId },
  data: { status: 'ACTIVE' } // Setting to ACTIVE is idempotent
});
```

#### **Pattern 3: Unique Constraint**
```typescript
// Database enforces idempotency via constraint
await prisma.battleResult.create({
  data: {
    battleId: battle.id,  // UNIQUE constraint
    winnerId: winner.id,
    timestamp: new Date()
  }
});
// Second attempt throws unique constraint violation (expected)
```

### 4. Pick a Delivery Guarantee and Enforce It
"Pick one: at-least-once delivery + idempotent consumers (recommended), or exactly-once (usually too expensive). Don't 'accidentally' drift into neither."

**Recommended: At-Least-Once + Idempotency**

```typescript
// Producer: Transactional outbox ensures at-least-once
await prisma.$transaction(async (tx) => {
  await tx.battle.update({ where: { id }, data: { status: 'complete' } });
  await tx.outbox.create({ data: { type: 'battle.completed', payload: { battleId: id } } });
});

// Consumer: Idempotency key ensures safe retries
async function handleBattleCompleted(event: BattleCompletedEvent) {
  const key = `battle-completed-${event.battleId}`;
  
  await prisma.$transaction(async (tx) => {
    // Check if already processed
    const processed = await tx.processedEvents.findUnique({ where: { idempotencyKey: key } });
    if (processed) return; // Already handled, skip

    // Process
    await updatePlayerStats(tx, event);
    await grantRewards(tx, event);

    // Mark processed
    await tx.processedEvents.create({ data: { idempotencyKey: key } });
  });
}
```

---

## Validation Checklist

- [ ] Consistency model documented (strong vs eventual, per domain)
- [ ] All 5 critical failure modes enumerated with solutions
- [ ] All retryable operations are idempotent
- [ ] Idempotency keys used throughout
- [ ] Dedupe table implemented and queried
- [ ] Dead-letter queue configured for poison messages
- [ ] Delivery guarantee chosen and enforced (at-least-once recommended)
- [ ] Transactional outbox implemented for correctness paths
- [ ] Sagas or single-transaction pattern for multi-step operations

---

## Failure Mode Testing

**Required Test Cases:**
1. Crash after DB commit, before outbox send → Verify outbox still contains event
2. Duplicate message delivery → Verify second delivery is no-op
3. Out-of-order delivery → Verify consumer rejects or reorders
4. Poison message → Verify DLQ + alerting, no infinite retry
5. Partial progress → Verify rollback or compensating transaction

---

**Reference:** [SENSAIOS-SYSTEM-OVERVIEW.md](./SENSAIOS-SYSTEM-OVERVIEW.md)
