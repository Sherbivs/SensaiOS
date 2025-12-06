# Implementation Notes

**Purpose:** Gotchas, workarounds, and lessons learned during implementation.

---

## Contents

*(Add implementation notes as work progresses)*

### Sprint 2 Notes

**P1-001 RLS Policies:**
- Created comprehensive testing plan: `P1-001-RLS-TESTING-PLAN.md`
- Migration protects 10 tables with 44 policies
- TypeScript context module uses session variables (`app.current_user_id`, `app.admin_bypass`)
- Testing requires deployment to experiment database before staging/production

**P1-002 Audit Service:**
- Used existing `AuditLog` model — no migration required
- Created `AuditUserContext` to extend `RlsUserContext` with `tenantId`/`userId`
- RlsUserContext only has `discordId`/`isAdmin`, resolved IDs come from caller

**P1-003 Repository Pattern:**
- Schema verified before implementation:
  - Trainer is lightweight (id, tenantId, userId, nickname, createdAt) — no stats
  - User has `coins` not `money`
  - PartySlot uses `slot` (integer) not `position`
  - PokemonInstance uses `ownerId` (User), optional `trainerId`
- `setUserContext(prisma, context)` argument order matters — prisma first
- All map callbacks need explicit type annotations: `(e: AuditLog) => ...`

### Sprint 1 Notes

**P0-001 Connection Pooling:**
- PgBouncer not required on Render — Prisma's built-in pooling with `connection_limit` is sufficient
- Pool URL building extracts host/credentials and appends `?connection_limit=N&pool_timeout=Ms`

**P0-002-004 Verification:**
- 4 of 7 P0 tasks were already implemented — always verify before implementing
- Schema has 17+ indexes, engine-cache.ts has 1658 lines, slow query logging exists

**P0-007 Metrics Integration:**
- Existing `prometheus-metrics.js` exposes `/metrics` on port 9090
- New `database-metrics.ts` registers with same prom-client registry
- EngineCache exports singleton as `engineCache` (not getInstance())

---

## Testing Plans

- **P1-001-RLS-TESTING-PLAN.md** — Comprehensive RLS testing scenarios and deployment steps

---

## When to Add Notes

Add implementation notes when:
- Discovering unexpected behavior
- Finding workarounds for issues
- Making non-obvious implementation choices
- Encountering "gotchas" others should know

---

**Naming Convention:** `{topic}-notes.md` or `sprint{N}-{topic}.md`
