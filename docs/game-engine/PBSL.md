# Pokémon Buddy System Logics (PBSL)

## Official Statement

Pokémon Buddy System Logics (PBSL) is an open, testable, and source-attributed framework for deterministic buddy, encounter, and battle mechanics tailored to Discord-first experiences. PBSL aligns with the public manifesto shared in the project briefing and binds this repository to the following pillars:

- **Determinism & Auditability** — Every calculation is reproducible given an explicit seed, and each decision emits structured audit events with provenance metadata.
- **Truth Hierarchy** — Upstream sources are cited in priority order: executable engines (Pokémon Showdown, `pkmn/engine`), game decomp/data projects (`pret`, `veekun`), then encyclopedic summaries (Bulbapedia, Smogon, Serebii).
- **Adaptable Interfaces** — Core mechanics ship as thin TypeScript adapters that integrate with Discord bots, workers, or web front-ends without bundling proprietary assets.
- **Continuous Validation** — CI runs reproducibility tests and oracle comparisons against upstream simulators/decompilations.
- **Provenance First** — Formulas and datasets store their upstream repository, commit SHA, and license in metadata that downstream consumers can inspect.

PBSL is community-driven and unaffiliated with Nintendo, Game Freak, Creatures Inc., or The Pokémon Company. “Pokémon” and related marks belong to their respective owners. We respect upstream licenses, paraphrase reference logic, and attach citations for every imported behavior.

## Module Layout

The scaffolding under `src/core/pbsl/` organizes battle mechanics into testable modules:

| Module | Purpose |
| --- | --- |
| `rng.ts` | Seeded Mulberry32 RNG factory with state snapshots and divergence detection. |
| `audit.ts` | Audit trail contracts and in-memory implementation with provenance awareness. |
| `phases.ts` | Canonical battle phase ordering with validation helpers. |
| `battle/engine.ts` | Deterministic turn runner that consumes scripted actions and emits audit events. |
| `encounter/generator.ts` | Encounter helper that yields deterministic buddy encounters from seeded RNG. |
| `data/provenance.ts` | Shared provenance descriptors for upstream source metadata. |

A barrel file `index.ts` re-exports the primitives so downstream adapters can import from `src/core/pbsl` without deep relative paths.

## Oracle Fixtures & Reports

The oracle diff suite lives under `tests/pbsl/oracle.spec.ts` and consumes curated fixtures in `tests/pbsl/fixtures/`. Each fixture stores the upstream provenance (repository, commit, license), scripted battle inputs, and a sanitized snapshot of the expected turn results. When Vitest runs the oracle suite it emits `pbsl-oracle-report.json` at the repository root so CI can publish the comparison data when a scenario fails.

## Launch Blockers & How to Fix Them

This launch checklist bakes in PBSL’s deterministic guarantees with the operational plumbing required for a stable Discord rollout.

### 1) User Management & Data Storage

- **IDs & auth** — Primary key is `discord_user_id`. Store `guild_id` for multi-server isolation.
- **Database** — Managed Postgres (Prisma ORM) plus Redis for locks, rate limits, and queues. Enable PgBouncer.
- **Core tables (minimal)**
	- `User(id, guildId, username, joinedAt, onboardingState, starterPickedAt, settingsJSON, createdAt)`
	- `Pokemon(id, speciesId, ownerId, isInParty, nickname, level, nature, ivJSON, movesJSON, acquiredVia, createdAt)`
	- `PartySlot(ownerId, slot, pokemonId)`
	- `Battle(id, guildId, challengerId, opponentId, state, seed, logRef, createdAt, resolvedAt)`
	- `ArenaChannel(guildId, channelId, lastHealthcheckAt)`
	- `Audit(id, actorId, type, payloadJSON, createdAt)`
- **Backups & migrations** — Nightly backups, migration gate in CI, seed script for eligible starters.

### 2) Game Initialization Trigger

- **New members** — On `guildMemberAdd`, auto-create `User`, DM a 30-second onboarding, and pre-grant a starter token.
- **Existing members** — On the first bot interaction (slash, reaction, or trigger message), create `User` when missing and initiate onboarding.
- **Idempotency** — All init endpoints must tolerate repeats by checking `onboardingState`.

### 3) Player Options (First-Run Setup)

- **Required** — Language, DM notifications on/off, arena broadcast opt-out, time zone, text speed, party privacy.
- **Nice-to-have** — Message style, nickname, “allow challenges” toggle.
- **UX** — `/settings` command plus DM wizard; persist as `settingsJSON`.

### 4) Starter Selection Method

- **Rule** — Permit any non-legendary (including pseudo-legendary lines) and exclude the curated legendary/mythical/ultra-beast list pinned to a source commit.
- **Flow** — `/starter` opens a paginated select (searchable) with a “Random” option and explicit confirmation.
- **Data** — `EligibleStarter(speciesId, formId?)` precomputed at build time and cached in Redis.
- **Anti-abuse** — One starter per user per guild; enforce with `starterPickedAt`.

### 5) Catching/Obtaining & Storage (Pokébox)

- **Pokébox** — Default capacity 30, party size 6; `/pokebox` surfaces pagination with filters.
- **Acquisition**
	- Wild spawns triggered by activity windows in the arena, weighted by server activity.
	- Item-gated capture with simple catch math (Poké Ball tiers).
	- Quest rewards and trades (post-MVP).
- **Dupes & overflow** — Overflow heads to the box; when full, block captures and prompt for release or capacity upgrades.
- **Audit** — Log `acquiredVia` and RNG seed for every acquisition.

### 6) Battle Event Triggers (Emoji-Based)

- **Challenge creation** — Messages starting with `👀 @Opponent` (`^👀\s*<@!?(\d+)>`) or reactions adding `👀` within two minutes of an arena post create a challenge.
- **Accept/decline** — Reply or react with `👀` to accept, `🚶` to decline within 60 seconds.
- **Timeouts & spam guards** — One pending challenge per user, 60-second expiry, max three challenges per five minutes.
- **Locks** — Redis key `battle:challenge:<guildId>:<challengerId>:<opponentId>` with 65-second TTL prevents double starts.
- **Seeding** — Battle seed = `sha256(guildId|challengerId|opponentId|timestamp)`.

### 7) Battle Log Delivery (DM + Arena Broadcast)

- **DMs** — Send full turn-by-turn logs to both trainers.
- **Arena** — Post compact live thread (or edited message) with start banner, participants, seed hash (first eight chars), per-turn summaries, and final result.
- **Privacy** — Respect “DM-only summaries”; arena shows minimal updates, DMs show full transcripts.

### 8) Arena Channel Safety & Moderation

- **Creation** — Provision `#pokemon-arena` with strict permissions (bot manages messages/threads; members send only).
- **Hardening** — Hourly watchdog recreates or resets the channel if missing or misconfigured; log corrections to `Audit`.
- **Pinned rules** — Maintain a pinned “Rules & Triggers” post; recreate when missing.
- **History** — Persist battle logs server-side so arena deletion never erases history.
- **Abuse controls** — `/challenge block @user`, `/challenge allow`, plus global rate limits and flood control for spawn/battle posts.

### 9) Commands & Events (Discord)

- **Slash** — `/start`, `/settings`, `/starter`, `/challenge`, `/accept`, `/decline`, `/pokebox`, `/party`, `/release`, `/catch`, `/arena`, `/help`.
- **Events** — `guildMemberAdd`, `messageCreate` (👀 regex), `messageReactionAdd` (👀/🚶), `interactionCreate`.
- **Permissions** — `MESSAGE_CONTENT`, `GUILD_MEMBERS`, `MANAGE_MESSAGES`, `MANAGE_CHANNELS` (arena only).

### 10) Observability & Ops

- **Health** — `/healthz` HTTP endpoint and Discord `/status` command.
- **Logging** — Structured logs for triggers, RNG seeds, and outcomes; persist per-battle `logRef` (S3 or DB).
- **Metrics** — Challenges per hour, accepts/declines, average battle length, spawn conversions, DM delivery failures.
- **Monitoring** — Alerts for DB connection errors, Discord rate-limit spikes, arena watchdog actions.
- **CI/CD** — Lint, test, migrate, seed, canary deploy; load test a 200-concurrent battle scenario.

### 11) Minimal Data Schemas (Prisma-ish)

```prisma
model User {
  id              String   @id // discord_user_id
  guildId         String
  username        String
  onboardingState String   @default("not_started") // not_started|in_progress|done
  starterPickedAt DateTime?
  settingsJSON    Json     @default("{}")
  createdAt       DateTime @default(now())
  @@index([guildId, id])
}

model Pokemon {
  id          String   @id @default(cuid())
  ownerId     String
  speciesId   Int
  nickname    String?
  level       Int      @default(5)
  nature      String?
  ivJSON      Json     @default("{}")
  movesJSON   Json     @default("[]")
  isInParty   Boolean  @default(false)
  acquiredVia String
  createdAt   DateTime @default(now())
  @@index([ownerId, isInParty])
}

model Battle {
  id           String   @id @default(cuid())
  guildId      String
  challengerId String
  opponentId   String
  state        String   @default("pending") // pending|active|finished|cancelled|declined|expired
  seed         String
  logRef       String?
  createdAt    DateTime @default(now())
  resolvedAt   DateTime?
  @@index([guildId, challengerId, opponentId])
}
```

### 12) Acceptance Criteria for “Launchable”

- New or existing members auto-onboard, pick a starter, and view their Pokébox.
- `👀 @Opponent` creates a challenge; the opponent accepts with `👀` or declines with `🚶`; timeouts behave correctly.
- Full battle transcripts reach both DMs; compact summaries land in the arena channel.
- The arena channel is present, hardened, and automatically repaired.
- Duplicate challenges are blocked, double starts prevented, and DB locks avoided under concurrent load.
- Backups, logs, metrics, and deterministic replays (seeded integration test) are all live.

## Compliance Checklist

| Requirement | Status | Notes |
| --- | --- | --- |
| Deterministic RNG with seeds | ✅ Implemented via `createSeededRng` and covered by unit tests. |
| Battle phase ordering & orchestration | ✅ `BattleEngine` enforces turn ordering and audit trails. |
| Encounter generator | ✅ `generateEncounter` returns deterministic outcomes with provenance. |
| Audit trail storage | ✅ `MemoryAuditTrail` collects structured events and exposes immutable snapshots. |
| Provenance metadata | ✅ `makeProvenanceRecord` validates repository/project metadata. |
| Oracle comparison CI | ✅ Oracle fixtures validate battle snapshots via `tests/pbsl/oracle.spec.ts` and the `pbsl-oracle` workflow. |
| Upstream citations ledger | 🔄 Planned — extend provenance records with auto-generated NOTICE entries. |
| Adapter integration | 🔄 Planned — future work wires PBSL modules into Discord flows. |

## Governance & Contributions

- Proposed gameplay changes must document **why** a new source is required, **how** automated tests consume it, and **which** checklist items move.
- New mechanics require corresponding Vitest fixtures and, where feasible, oracle comparisons against upstream simulators.
- Provenance metadata must include repository URL, commit SHA, and short license notice. Use `makeProvenanceRecord` to enforce the schema.
- Update this file and `Prompt.md`’s Last Repo Changes whenever PBSL scope expands or checklist status changes.

## Next Steps

1. Wire PBSL RNG and audit helpers into the legacy battle/daily flows to ensure consistent telemetry across bots.
2. Extend provenance metadata to feed into the existing ops dashboards so humans can audit upstream sources in production.
3. Document adapter patterns for Discord slash commands, cron workers, and web dashboards referencing PBSL.
4. Grow the oracle fixture catalog beyond single-turn cases (status conditions, multi-target moves) while keeping runtimes lean.
