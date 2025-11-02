# DEX v2 — High-Availability, Fast Pokédex Model and Day-One Database Blueprint

This document combines the high-availability, high-performance Pokédex model (DEX v2) with a pragmatic day-one database plan that can scale with the game. It captures the design, rollout strategy, and the operational safeguards required for a zero-downtime migration.

---

## 1. North-Star Principles
- **Immutable facts, mutable links.** Core reference data (Pokédex, moves, type chart) is read-only and versioned; player state references a specific pack version.
- **Tenant-first keys.** Every gameplay row includes `tenant_id` (Discord guild/app id) to enable partitioning, access control, and future sharding.
- **Time-sortable IDs.** Prefer ULIDs for chronology and simpler debugging.
- **Short, observable write paths.** Append-only where possible; hot reads stay in memory.
- **Migrations are code.** Every schema change is reversible, reviewed, and tested.

---

## 2. Goals and Non-Goals
### Goals
- Instant lookups (no blocking I/O or ad-hoc parsing on the hot path).
- Deterministic packs: content-addressed, signed, verified at boot.
- Side-by-side rollout using feature flags; zero-downtime cutover with fast rollback.
- Operational simplicity: a single artifact with explicit invariants.

### Non-Goals
- Rewriting the battle engine logic.
- Changing persistent trainer data semantics.
- Allowing runtime editing of Pokédex content.

---

## 3. Architecture Overview (DEX v2)
### Build Time
1. Aggregate sources → normalize → validate invariants.
2. Generate a **binary slab** `dexpack.v2.<SHA256>.bin` plus a minimal perfect hash (MPH) map for name/alias → id resolution.
3. Emit **TypeScript accessors** (codegen) with fixed offsets and integer tables (types, learnset bitsets).
4. Produce a **manifest** `dexpack.v2.json` (hash, upstream SHAs, schema version).
5. Sign the artifact using Ed25519.

### Runtime
- Map the read-only binary slab and expose typed-array views.
- Verify hash and signature; on failure, refuse v2 and automatically fall back to v1.
- Command handlers route through a feature flag `DEX_V2_ENABLED` (supports per-guild canaries).

---

## 4. Data Layout (Binary Slab, Structure-Of-Arrays)
```
Header {
  magic "DEX2", schemaVersion u16, gen u8,
  sections: offsets & lengths
}
Sections:
- species.soA: baseStats[u16][N][6], types[u8][N][2], abilities[u16][N][3], catchRate[u8][N], …
- learnsets.bitset: bitset[N][ceil(M/8)] where M = total moves
- moves.tuples: [power u16, accuracy u8, type u8, priority i8, flags u16, …] x M
- types.table: 19x19 u8 multipliers encoded {0,5,10,20}
- names.aliases: utf8Blob + offsets[u32] + ids[u16]
- mph: arrays required for minimal perfect hash lookup
- text.offsets: flavorUtf8Blob + start/end[u32] per species
```

---

## 5. Generated Accessor API
```ts
export function idByNameOrAlias(q: string): number | -1;     // MPH → id
export function baseHP(id: number): number;                   // u16
export function typesOf(id: number): [number, number];        // u8, u8
export function hasMove(id: number, moveId: number): boolean; // bit test
export function moveInfo(moveId: number): MoveTuple;
export function typeMultiplier(attacking: number, defending: number): number; // 0|5|10|20
export function flavorText(id: number): string;               // slice from blob
export const META: { schema: 2; gen: number; hash: string };
```

---

## 6. Scaling, Availability, Security
### Scaling and Availability
- Nodes share the same mapped file (leveraging the OS page cache). Warm restarts are near-zero cost.
- Canary routing via `DEX_V2_ENABLED`; ramp 1% → 100% in controlled stages.
- SLO for DEX calls: p50 ≤ 50 µs, p95 ≤ 200 µs, p99 ≤ 500 µs on c5.large-class nodes.
- Observability: lookup counters, MPH misses, fallback counts, latency histograms, boot-time pack hash logs.

### Security
- Ed25519 signature verified at boot; public key lives in the repo, private key in CI secrets.
- Loader refuses unsigned or mismatched packs; only CI may publish artifacts.

---

## 7. Migration Path and Risks
### Migration Path
1. Land v2 alongside v1.
2. Compatibility layer keeps old accessor signatures and dispatches to v2 under the flag.
3. Enable 100% in DEV; run regression plus perf verification.
4. Canary in PROD; ramp in stages if green.
5. Remove v1 code in a later, separate PR.

### Risks and Mitigations
- Pack verification failure → auto-fallback to v1 plus alert.
- Performance regressions → CI perf gate and canary SLO checks.
- Alias coverage gaps → CI invariant ensuring 100% of v1 aliases resolve in v2.

---

## 8. Test Plan
- **Unit:** golden samples for 50 species and 200 moves; v1 ≡ v2.
- **Property:** random species×moves type/STAB correctness.
- **Performance:** microbench in CI; gate on p95 ≤ 200 µs.
- **Smoke:** bot E2E across `/pokedex`, capture, and battle prechecks in a seeded test guild.

---

## 9. Repository Impact (New Paths)
```
/scripts/build-dexpack.ts            # ETL + codegen + pack/sign
/src/dex/v2/loader.ts                # mmap + views + verifier
/src/dex/v2/accessors.ts             # generated (git-ignored, CI-built)
/src/flags/featureFlags.ts           # add DEX_V2_ENABLED
/src/router/commands/pokedex.ts      # use compatibility layer
/config/observability/dex.metrics.ts # counters and histograms
```

---

## 10. High-Availability Rollout Plan
### Windows (America/New_York)
- DEV enable: Tue, Nov 4, 2025, 11:00–11:30 ET.
- PROD canary and ramp: Wed, Nov 5, 2025, 02:00–03:00 ET.
- Reserved maintenance: Thu, Nov 6, 2025, 02:00–02:15 ET.

### Backups and Rollback
- Pre-cutover: `pg_dump -Fc` for DEV/PROD; retain for 14 days.
- Artifact: copy current v1 pack and container image tag to the LKG channel.
- Config: export current feature-flag state JSON.

**Rollback (≤ 10 minutes)**
1. Flip `DEX_V2_ENABLED=false` globally.
2. If necessary, redeploy the last-known-good image.
3. Restore previous flag snapshot (DB restore not required for DEX).
4. Attach logs with pack hash and verifier status to release notes.

---

## 11. Day-One Database Blueprint (v0.1)
### Tables
```sql
CREATE TABLE tenants (
  id            TEXT PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  platform_id   TEXT UNIQUE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE trainers (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  user_id       TEXT NOT NULL REFERENCES users(id),
  nickname      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE dex_packs (
  pack_hash     TEXT PRIMARY KEY,
  schema_ver    SMALLINT NOT NULL,
  gen           SMALLINT NOT NULL,
  signed_at     TIMESTAMPTZ NOT NULL,
  meta_json     JSONB NOT NULL
);

CREATE TABLE trainer_settings (
  trainer_id    TEXT PRIMARY KEY REFERENCES trainers(id),
  active_pack   TEXT NOT NULL REFERENCES dex_packs(pack_hash),
  prefs_json    JSONB NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE mons (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  trainer_id    TEXT NOT NULL REFERENCES trainers(id),
  species_id    INTEGER NOT NULL,
  pack_hash     TEXT NOT NULL REFERENCES dex_packs(pack_hash),
  level         SMALLINT NOT NULL DEFAULT 1,
  ivs           JSONB NOT NULL,
  evs           JSONB NOT NULL,
  ability_key   SMALLINT,
  moveset       SMALLINT[] NOT NULL,
  status_key    SMALLINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (level BETWEEN 1 AND 100)
);

CREATE TABLE parties (
  trainer_id    TEXT NOT NULL REFERENCES trainers(id),
  slot          SMALLINT NOT NULL CHECK (slot BETWEEN 1 AND 6),
  mon_id        TEXT NOT NULL REFERENCES mons(id),
  PRIMARY KEY (trainer_id, slot)
);

CREATE TABLE encounters (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  trainer_id    TEXT NOT NULL REFERENCES trainers(id),
  seed          TEXT NOT NULL,
  species_id    INTEGER NOT NULL,
  pack_hash     TEXT NOT NULL REFERENCES dex_packs(pack_hash),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome       TEXT
);

CREATE TABLE battles (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  pack_hash     TEXT NOT NULL REFERENCES dex_packs(pack_hash),
  state_json    JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);

CREATE TABLE items (
  id            INTEGER PRIMARY KEY,
  pack_hash     TEXT NOT NULL REFERENCES dex_packs(pack_hash),
  name          TEXT NOT NULL
);

CREATE TABLE inventories (
  trainer_id    TEXT NOT NULL REFERENCES trainers(id),
  item_id       INTEGER NOT NULL REFERENCES items(id),
  qty           INTEGER NOT NULL CHECK (qty >= 0),
  PRIMARY KEY (trainer_id, item_id)
);

CREATE TABLE audit_log (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     TEXT,
  actor_user_id TEXT,
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT,
  before_json   JSONB,
  after_json    JSONB,
  at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Immediate Indexes
```sql
CREATE INDEX ON mons (tenant_id, trainer_id);
CREATE INDEX ON parties (trainer_id);
CREATE INDEX ON encounters (tenant_id, started_at DESC);
CREATE INDEX ON audit_log (tenant_id, at DESC);
```

### Versioning, Seeds, Safety
- Maintain a repository `schema_ver` integer; every migration bumps it.
- Repeatable seeds: commit a golden tenant/trainer/party dataset for smoke tests.
- ETL contract: packs are CI-built; the DB stores only hashes and minimal mirrors.
- Backups: nightly PITR to object storage; monthly restore rehearsal (target RPO 15 min, RTO 30 min).
- Constraints: FKs, CHECKs, and UNIQUEs keep bad states unrepresentable.
- Roles: `app_rw`, `migrate`, `ro` with least privilege.
- Retention: audit rows hot for 30 days, then archive; store only Discord IDs.
- Observability: DB op metrics, latency histograms, error rates by constraint, spans tagged with `tenant_id`, `pack_hash`, and `schema_ver`.

---

## 12. Tasklist Entries (Ready to Paste)
Refer to Tasklist.md for full YAML-style task records. Suggested tasks:

1. **DEX v2 Design and Sign-Off** — add this document, set SLOs, wire signing keys, capture approvals.
2. **DEV Rebuild — DEX v2 Side-by-Side** — build the pack pipeline, loaders, and enable in DEV.
3. **PROD Canary and Cutover — DEX v2** — ship v2 to production via staged flag rollout.
4. **Day-One DB Bootstrap Set** — bootstrap schema v0.1, populate pack registry, seed smoke data, and validate backups/disaster recovery.

Each task includes acceptance criteria, guard steps, and rollback commitments derived from this blueprint.

---

## 13. Approvals to Capture
- Design approvals: Engineering Lead, Operations, Security.
- Confirmed windows: DEV enable, PROD canary, maintenance.
- Backup confirmations: DEV/PROD snapshots retained for 14 days.

---

## 14. Sign-Off Checklist
- Design approvals recorded.
- Windows calendared.
- Backups verified.
- Tasklist entries opened with owners and dates.
- Feature flag registered in config service.
- Rollback playbook linked in the runbook.

---

*Prepared for inclusion in the Infinity Gauntlet repository to guide the DEX v2 rollout and database evolution.*
