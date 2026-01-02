# Expert Recommendations Index
**Date:** December 30, 2025  
**Context:** 3-Layer Architecture Review (Kernel → SensaiOS → User Space)

---

## Overview

This directory contains expert recommendations from industry specialists reviewing the SensaiOS 3-layer architecture. Each expert provided targeted guidance based on their domain expertise.

---

## Experts

### [Database Systems Architect](./EXPERT-DATABASE-ARCHITECT.md)
**Focus:** Postgres / Transactional Design

**Key Recommendations:**
- Enforce single atomic commit boundary (DB transaction)
- Define hard consistency contract (strong vs eventual)
- Adopt transactional outbox pattern
- Treat kernel ring buffer as telemetry transport only

**Priority:** 🔴 HIGH — Correctness-critical

---

### [Operating Systems / Runtime Architect](./EXPERT-OS-ARCHITECT.md)
**Focus:** Kernel/OS Boundary, Lifecycle, "No Layers In Between"

**Key Recommendations:**
- Enforce 3-layer model as a rule (no middle layers)
- Make boot chain non-negotiable
- Define Kernel API like syscalls (small, stable, boring)
- Document lifecycle state machine (INIT → READY → ENABLED → DRAINING → STOPPED)

**Priority:** 🔴 HIGH — Architectural foundation

---

### [Distributed Systems Engineer](./EXPERT-DISTRIBUTED-SYSTEMS.md)
**Focus:** Failure Modes, Idempotency, Consistency

**Key Recommendations:**
- Write down consistency model first
- Enumerate all failure modes with solutions
- Everything must be idempotent
- Pick delivery guarantee (at-least-once + idempotent consumers recommended)

**Priority:** 🟡 MEDIUM — Correctness under failure

---

### [Observability / SRE Lead](./EXPERT-OBSERVABILITY-SRE.md)
**Focus:** Metrics/Logs, Operational Clarity

**Key Recommendations:**
- Standardize event taxonomy (stable source/operation/type)
- Define sampling strategy (ERROR/WARN 100%, INFO 10%, DEBUG 1%)
- Define backpressure behavior (drop priority)
- Make "what is happening now?" easy to answer

**Priority:** 🟡 MEDIUM — Operational excellence

---

### [Security / Controls Engineer](./EXPERT-SECURITY-CONTROLS.md)
**Focus:** Guardrails, Least Privilege

**Key Recommendations:**
- Capabilities enforcement at OS layer (manifest + runtime checks)
- Audit all privileged actions
- Data ownership enforcement (components cannot write to others' tables)
- Correlation IDs as security boundary (mandatory scope in all envelopes)

**Priority:** 🟡 MEDIUM — Security posture

---

## Implementation Priority

### Phase 1: Foundation (Must Do First)
1. **Transactional Outbox** — Database Architect recommendation
2. **Boot/Shutdown Chain** — OS Architect recommendation
3. **Lifecycle State Machine** — OS Architect recommendation

### Phase 2: Correctness
4. **Consistency Model** — Database + Distributed Systems recommendation
5. **Failure Mode Documentation** — Distributed Systems recommendation
6. **Idempotency Enforcement** — Distributed Systems recommendation

### Phase 3: Observability & Security
7. **Event Taxonomy** — Observability recommendation
8. **Sampling Strategy** — Observability recommendation
9. **Capabilities Enforcement** — Security recommendation
10. **Audit System** — Security recommendation

---

## Cross-Cutting Themes

### Theme 1: Atomicity & Consistency
**Experts:** Database Architect, Distributed Systems Engineer  
**Core Principle:** DB + outbox in single transaction; explicit consistency model

### Theme 2: Boundaries & Isolation
**Experts:** OS Architect, Security Engineer  
**Core Principle:** Clear layer boundaries; capabilities enforcement; no cross-component writes

### Theme 3: Observability Independence
**Experts:** OS Architect, Observability Lead  
**Core Principle:** Logs/metrics can fail without breaking correctness

---

## Validation Checklist

### Database & Transactions
- [ ] Transactional outbox implemented
- [ ] Consistency matrix documented
- [ ] Dual-write code paths eliminated

### Architecture & Lifecycle
- [ ] 3-layer model enforced (import rules)
- [ ] Boot sequence gated
- [ ] Shutdown sequence with flush policies
- [ ] Lifecycle state machine documented

### Distributed Systems
- [ ] Failure modes enumerated (5+ scenarios)
- [ ] Idempotency keys throughout
- [ ] Dead-letter queue configured

### Observability
- [ ] Event taxonomy standardized
- [ ] Sampling strategy implemented
- [ ] Health endpoint independent of observability backends

### Security
- [ ] Component manifests declare capabilities
- [ ] Runtime capability checks enforced
- [ ] Privileged actions audited
- [ ] Tenant scope mandatory in all envelopes

---

## Next Steps

1. **Read:** [Database Architect](./EXPERT-DATABASE-ARCHITECT.md) recommendations (highest priority)
2. **Read:** [OS Architect](./EXPERT-OS-ARCHITECT.md) recommendations (foundational)
3. **Implement:** Transactional outbox pattern
4. **Implement:** Boot/shutdown sequence with lifecycle gates
5. **Document:** Consistency model (strong vs eventual per domain)

---

**See Also:**
- [SENSAIOS-SYSTEM-OVERVIEW.md](./SENSAIOS-SYSTEM-OVERVIEW.md) — Current architecture
- [SENSAIOS-KERNEL-DETAIL.md](./SENSAIOS-KERNEL-DETAIL.md) — Kernel layer detail
- [SENSAIOS-SENSAIOS-COMPONENTS.md](./SENSAIOS-SENSAIOS-COMPONENTS.md) — SensaiOS component model
