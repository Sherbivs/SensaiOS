# Infinity‑Gauntlet Project — Prisma ORM v7 Bible

**Edition:** AI Agent Playbook (VS Code + Claude Opus 4.5)
**Backend:** Node.js + TypeScript
**DB:** PostgreSQL (Render)
**ORM:** Prisma ORM v7 + Prisma Client v7
**Game:** Discord-based, server-authoritative, deterministic RNG, audit-friendly

---

## 1) Agent Contract (Claude Opus 4.5 Operating Rules)

### 1.1 Your role (what you are)

You are a **code migration + backend implementation agent**. You must produce:

* Correct Prisma v7 configuration and schema design
* Safe migrations and seeds
* Render-friendly deployment flows
* Deterministic state transitions for game mechanics

### 1.2 Your constraints (what you must not do)

* **Do not "guess" Prisma v7 behavior.** If unsure, search docs or reproduce via CLI errors and fix. (This doc includes the key v7 breaking points.)
* **Do not put DB connection URLs in `schema.prisma`.** Prisma v7 moved that responsibility to `prisma.config.ts`.
* **Do not run `prisma migrate dev` in Docker/Render/CI** (non-interactive environments). Use `prisma migrate deploy`.
* **Do not treat seeds as player state.** Seeds are for static catalog/reference data only (moves, items, encounter tables).

### 1.3 "Small diffs" workflow (the way Claude should operate in VS Code)

When implementing changes:

1. Identify the smallest set of files to edit.
2. Apply changes in **reviewable steps**.
3. After each step, ensure the repo still builds or at least typechecks.
4. When Prisma schema changes:

   * run `prisma format`
   * run `prisma migrate dev` locally (interactive)
   * run `prisma generate`
   * update any seed script + tests

This matches the "changeset-oriented" approach Prisma itself promotes in its migration prompt guidance.

---

## 2) Prisma v7 Facts You Must Internalize

### 2.1 Version alignment is mandatory

Always upgrade these together:

* `prisma`
* `@prisma/client`
  Prisma's upgrade guide explicitly says to keep them on the **same version**.

### 2.2 Prisma v7 introduces a new default configuration model

Starting Prisma ORM v7:

* Running `prisma init` creates `prisma.config.ts`
* The **DB connection URL is configured in `prisma.config.ts`**, not `schema.prisma`

### 2.3 Prisma Client generation changed: new generator + mandatory output

For Prisma v7's newer client generator, your `generator client` block must use:

* `provider = "prisma-client"`
* `output = "..."` (**required**)
  The Prisma generator reference states `output` is required and shows the `prisma-client` generator pattern.

### 2.4 Postgres connectivity in v7: driver adapter pattern

Prisma's PostgreSQL connector docs show instantiating Prisma Client by:

* installing `@prisma/adapter-pg`
* creating a `PrismaPg` adapter with your connection string
* passing `{ adapter }` into `new PrismaClient({ adapter })`

---

## 3) Repo Layout (Prisma v7 + Discord Bot Friendly)

Recommended structure:

```
prisma/
  schema.prisma
  seed.ts
  migrations/
prisma.config.ts
src/
  generated/prisma/          # generated client output (gitignore)
  db/
    prisma.ts                # Prisma client factory/singleton
    tx.ts                    # transaction helper (recommended)
  domain/
    ...
  discord/
    ...
docs/
  prisma-7-bible.md
```

Why this layout:

* Prisma v7 wants an explicit generated client output directory.
* Keeping generated client under `src/generated/...` makes TS imports explicit and avoids "where did Prisma generate to?" confusion.

---

## 4) Canonical Prisma v7 Configuration (Copy/Paste Templates)

### 4.1 `prisma/schema.prisma` (Prisma v7 style)

**Rules:**

* Keep `datasource db { provider = "postgresql" }`
* **Do not put `url = env("DATABASE_URL")` here**
* Use `generator client { provider = "prisma-client"; output = ... }`

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

This follows Prisma's v7 generator guidance (`prisma-client` + required `output`).

### 4.2 `prisma.config.ts` (required in v7)

Prisma v7 moved connection URL config into this file.

Also: Prisma's own migration prompt for v6→v7 explicitly recommends:

* `import 'dotenv/config'`
* `defineConfig`
* `migrations.seed`
* `datasource.url = env('DATABASE_URL')`

```ts
// prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Use a DIRECT Postgres URL (not PgBouncer) for migrations.
    url: env("DATABASE_URL"),

    // Optional: if you use a shadow DB for dev workflows
    // shadowDatabaseUrl: env("SHADOW_DATABASE_URL"),
  },
});
```

Seeding in Prisma expects a command under `migrations.seed` in `prisma.config.ts`; `prisma db seed` executes it.

---

## 5) Prisma Client Setup (Postgres + Render)

### 5.1 Install packages (typical)

* `prisma`
* `@prisma/client`
* `@prisma/adapter-pg`
* `pg`
* `dotenv` (if you want local `.env` loading)

The adapter approach is documented for Postgres.

### 5.2 `src/db/prisma.ts` (server runtime client)

**Goal:** one Prisma client per Node process, shared everywhere.

```ts
// src/db/prisma.ts
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Use pooled DB URL for runtime if available (PgBouncer),
 * otherwise fall back to direct DB URL.
 */
const connectionString =
  process.env.DATABASE_POOL_URL ?? process.env.DATABASE_URL ?? "";

if (!connectionString) {
  throw new Error("Missing DATABASE_URL (and DATABASE_POOL_URL).");
}

const adapter = new PrismaPg({ connectionString });

export const prisma = new PrismaClient({
  adapter,
  // Optional: configure logs in dev
  // log: ["warn", "error"],
});
```

Prisma's Postgres connector docs show creating `PrismaPg` with `connectionString` and passing `{ adapter }` to `PrismaClient`.

---

## 6) Render Deployment Rules (Prisma + Postgres)

### 6.1 Render runs migrations via "Pre-Deploy Command"

Render's Prisma ORM tutorial explicitly includes setting a **Pre‑Deploy Command** to run Prisma migrations before deploy completes.

**Production migration command** should be:

* ✅ `prisma migrate deploy`
* ❌ not `prisma migrate dev`

Prisma Migrate notes `migrate dev` is not supported in non-interactive environments (Docker/CI).
And Prisma's deployment docs say you can run `prisma migrate deploy` in CI/CD to apply pending migrations.

**Recommended package.json scripts:**

```json
{
  "scripts": {
    "prisma:generate": "prisma generate",
    "prisma:migrate:deploy": "prisma migrate deploy",
    "prisma:seed": "prisma db seed",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js"
  }
}
```

**Render Pre-Deploy Command:**

* `npm run prisma:migrate:deploy`

### 6.2 Render Postgres has connection limits → you may need pooling

Render's official docs state:

* Render Postgres supports a limited number of simultaneous direct connections
* If approaching the limit, set up connection pooling using PgBouncer

### 6.3 The "two URLs" pattern (direct for migrations, pooled for runtime)

**Reality of the universe:** PgBouncer is great for app traffic, but schema/migration tooling often wants a direct connection.

Prisma docs issue discussion states Prisma Migrate should connect directly and does not use/support connection pooling in that context.

Render community practice also commonly uses:

* one connection string for direct Postgres
* one connection string for PgBouncer

**Recommended env vars on Render:**

* `DATABASE_URL` = direct internal Postgres URL (migrations + admin)
* `DATABASE_POOL_URL` = PgBouncer URL (runtime queries)

In runtime code (see `src/db/prisma.ts`), use `DATABASE_POOL_URL ?? DATABASE_URL`.

### 6.4 PgBouncer configuration notes (Render)

Render's pooling guide recommends PgBouncer in **transaction** mode and shows common env vars (`POOL_MODE=transaction`, `SERVER_RESET_QUERY=DISCARD ALL`, etc.).

Prisma also maintains a PgBouncer setup page that covers when/why to use special PgBouncer settings and mentions Prisma Migrate workarounds.

---

## 7) Game Persistence Design: "Catalog vs Player State"

### 7.1 The split

For a Discord-based Pokémon-like game, you want two categories:

**Catalog (mostly static):**

* Species (your own canon-inspired "dex")
* Moves
* Items
* Encounter tables / rarity weights
* Biomes, weather types, etc.

**Player State (high-churn):**

* Users
* Monsters (caught creatures)
* Parties + storage
* Inventory
* Encounters (in-progress catch flows, cooldowns)
* Battles (in-progress turn-based state)
* Logs / audits

### 7.2 Why this matters for Prisma

* Catalog changes: migrate + seed (safe, deterministic)
* Player state: transactional writes, strict validation, audit trails

---

## 8) Canonical Prisma Schema (Infinity‑Gauntlet Baseline)

This schema is intentionally:

* strongly typed for core relations
* uses JSON for "engine-defined effects/state" so the battle engine can evolve
* indexes high-frequency queries (by discordId, by ownerId, by battle status)

> Note: This is **Pokémon‑like**, not Pokémon. Use your own species keys, move keys, item keys, and flavor text.

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum ElementType {
  NORMAL
  FIRE
  WATER
  GRASS
  ELECTRIC
  ICE
  FIGHTING
  POISON
  GROUND
  FLYING
  PSYCHIC
  BUG
  ROCK
  GHOST
  DRAGON
  DARK
  STEEL
  FAIRY
}

enum BattleStatus {
  PENDING
  ACTIVE
  COMPLETE
  ABORTED
}

enum LogLevel {
  DEBUG
  INFO
  WARN
  ERROR
  AUDIT
}

model User {
  id        String   @id @default(uuid())
  discordId String   @unique
  username  String?

  // Deterministic RNG (per-user stream)
  rngSeed    BigInt
  rngCounter BigInt   @default(0)

  // UI/session-ish state (DM menu navigation, etc.)
  uiState Json?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  monsters   Monster[]
  parties    Party[]
  storage    StorageBox[]
  inventory  InventoryItem[]
  encounters Encounter[]
  battles    BattleParticipant[]
  logs       Log[]

  @@index([discordId])
}

//
// --- Catalog tables ---
//

model Species {
  id   String @id @default(uuid())
  key  String @unique // stable internal key, e.g. "ember_fox"
  name String

  // base stats + growth rules (flexible)
  baseJson Json

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Move {
  id   String @id @default(uuid())
  key  String @unique
  name String

  type     ElementType
  power    Int?
  accuracy Int?
  pp       Int?
  priority Int @default(0)

  // Engine-defined move logic
  effectJson Json

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([type])
}

model Item {
  id   String @id @default(uuid())
  key  String @unique
  name String

  effectJson Json

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

//
// --- Player-owned state ---
//

model Monster {
  id      String @id @default(uuid())
  ownerId String
  owner   User   @relation(fields: [ownerId], references: [id], onDelete: Cascade)

  nickname   String?
  speciesKey String
  species    Species @relation(fields: [speciesKey], references: [key], onDelete: Restrict)

  level Int @default(1)
  exp   Int @default(0)

  // IV/EV/ability/status payloads (simplified system)
  buildJson Json

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  moves       MonsterMove[]
  partySlots  PartySlot[]
  storageSlot StorageSlot[]

  @@index([ownerId])
  @@index([speciesKey])
}

model MonsterMove {
  monsterId String
  slot      Int
  moveId    String

  monster Monster @relation(fields: [monsterId], references: [id], onDelete: Cascade)
  move    Move    @relation(fields: [moveId], references: [id], onDelete: Restrict)

  @@id([monsterId, slot])
  @@index([moveId])
}

model Party {
  id      String @id @default(uuid())
  ownerId String
  owner   User   @relation(fields: [ownerId], references: [id], onDelete: Cascade)

  name String @default("Main Party")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  slots PartySlot[]

  @@index([ownerId])
}

model PartySlot {
  partyId   String
  slot      Int
  monsterId String?

  party   Party    @relation(fields: [partyId], references: [id], onDelete: Cascade)
  monster Monster? @relation(fields: [monsterId], references: [id], onDelete: SetNull)

  @@id([partyId, slot])
  @@index([monsterId])
}

model StorageBox {
  id      String @id @default(uuid())
  ownerId String
  owner   User   @relation(fields: [ownerId], references: [id], onDelete: Cascade)

  name String

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  slots StorageSlot[]

  @@index([ownerId])
}

model StorageSlot {
  boxId     String
  slot      Int
  monsterId String?

  box     StorageBox @relation(fields: [boxId], references: [id], onDelete: Cascade)
  monster Monster?   @relation(fields: [monsterId], references: [id], onDelete: SetNull)

  @@id([boxId, slot])
  @@index([monsterId])
}

model InventoryItem {
  userId String
  itemId String
  qty    Int @default(0)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  item Item @relation(fields: [itemId], references: [id], onDelete: Restrict)

  @@id([userId, itemId])
  @@index([itemId])
}

//
// --- Encounters & battles ---
//

model Encounter {
  id     String @id @default(uuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  channelId String
  kind      String // "walk" | "search" | "fish" etc

  seed       BigInt
  createdAt  DateTime @default(now())
  resolvedAt DateTime?

  // rolled species, rarity, weather/time modifiers, etc.
  resultJson Json

  @@index([userId, createdAt])
  @@index([channelId, createdAt])
}

model Battle {
  id     String       @id @default(uuid())
  status BattleStatus @default(PENDING)

  serverId String
  threadId String?

  seed BigInt
  turn Int @default(0)

  // authoritative battle state blob
  stateJson Json

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  participants BattleParticipant[]
  logs         Log[]

  @@index([serverId, createdAt])
  @@index([status, updatedAt])
}

model BattleParticipant {
  battleId String
  userId   String
  team     Int

  battle Battle @relation(fields: [battleId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([battleId, userId])
  @@index([userId])
}

model Event {
  id       String @id @default(uuid())
  serverId String

  key  String
  name String

  startsAt DateTime
  endsAt   DateTime

  modifiersJson Json

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([serverId, key])
  @@index([serverId, startsAt, endsAt])
}

model Log {
  id      String   @id @default(uuid())
  level   LogLevel @default(INFO)
  message String

  userId   String?
  battleId String?
  meta     Json

  createdAt DateTime @default(now())

  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)
  battle Battle? @relation(fields: [battleId], references: [id], onDelete: Cascade)

  @@index([level, createdAt])
  @@index([userId, createdAt])
  @@index([battleId, createdAt])
}
```

---

## 9) Transactions & Determinism (Non‑Negotiable for a Discord Game)

### 9.1 Rule: one command = one DB transaction

Every game command that changes state must be atomic:

* catch attempt
* party swap
* inventory consume
* battle turn submission + resolution

Recommended pattern:

```ts
import { prisma } from "./prisma";

export async function runCommandTx<T>(fn: Parameters<typeof prisma.$transaction>[0]) {
  return prisma.$transaction(fn);
}
```

### 9.2 RNG determinism rule

All RNG outcomes must be reproducible:

* Store `rngSeed` + `rngCounter`
* Increment `rngCounter` inside the same transaction that consumes RNG
* Log enough metadata to replay outcomes

---

## 10) Migrations & Seeds: What to Run Where

### 10.1 Local dev (interactive)

* `prisma migrate dev` (interactive local workflows)
* `prisma generate`
* `prisma db seed`

### 10.2 Render/CI/Prod (non-interactive)

* `prisma migrate deploy`
  Prisma docs explicitly position `migrate deploy` for CI/CD production application.
  Prisma docs also warn `migrate dev` is not supported in non-interactive environments like Docker/CI shells.

### 10.3 Seeding (v7 approach)

Integrated seeding expects the seed command in `migrations.seed` inside `prisma.config.ts`.

---

## 11) Render + Prisma + PgBouncer: Safe Defaults

### 11.1 Why pooling matters

Render warns of limited direct Postgres connections and recommends PgBouncer pooling to avoid hitting limits under load.

### 11.2 How to apply pooling safely

* App runtime uses PgBouncer (`DATABASE_POOL_URL`)
* Migrations use direct DB (`DATABASE_URL`)
* Use separate env vars and avoid running migrations through pooling where possible (Prisma Migrate expectation).

---

## 12) Claude Task Templates (Use These as "Macros")

### 12.1 Add a new model/table

1. Edit `prisma/schema.prisma`
2. Run locally:

   * `prisma format`
   * `prisma migrate dev --name <short_name>`
   * `prisma generate`
3. Update:

   * seed script if it's catalog data
   * API layer (DTOs, validators)
   * tests (integration sim)
4. Confirm Render flow will run:

   * Pre-deploy `prisma migrate deploy`

### 12.2 Add a new "catalog" concept (Move/Item/Species)

* Prefer stable `key` fields
* Seed via `prisma/seed.ts`
* Use idempotent `upsert` (by `key`) so seed can run repeatedly

### 12.3 Add a new "stateful" concept (Battle/Encounter/Cooldowns)

* Every write inside a transaction
* Add audit logs
* Add indexes for your query shapes
* Add optimistic concurrency if multiple processes/commands might race

---

## 13) Appendix: Prisma v7 + Render References You Should Keep Open

* Prisma v7 config file behavior (`prisma.config.ts`, moved DB URL)
* Prisma generator config (`provider="prisma-client"`, required `output`)
* Prisma Postgres adapter instantiation example
* Prisma seeding workflow (`migrations.seed` in `prisma.config.ts`)
* Prisma Migrate non-interactive limitation (`migrate dev` not supported)
* `migrate deploy` recommended for CI/CD production
* Render Prisma + Postgres tutorial mentioning Pre-Deploy migration command
* Render Postgres connection pooling guidance

---

If you keep this Bible in-repo and feed it to Claude Opus 4.5 as "project context," the agent will have enough guardrails to not brick Prisma v7 setup, not melt Render Postgres connections, and not lose determinism/auditability in your game loop.

---

## 14) Infinity-Gauntlet Project Specifics

### 14.1 Current Schema Approach (Library Engine)

**CRITICAL:** This project uses `engineType = "library"` for direct PostgreSQL connections, NOT the new `prisma-client` generator with adapters. This is because:

1. We use Render-managed PostgreSQL with direct connections
2. We don't use Prisma Accelerate or driver adapters
3. The library engine is proven stable for our use case

**Current generator block:**
```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
  engineType    = "library"
}
```

### 14.2 Database URL Architecture

| Environment Variable | Purpose | Used By |
|---------------------|---------|---------|
| `PROD_DATABASE_URL` | Primary production database (Render-managed) | Runtime + Migrations |
| `RENDER_DB_EXTERNAL_URL` | Direct external access | Migrations from local |
| `RENDER_DB_INTERNAL_URL` | Internal Render network | Runtime on Render |
| `DATABASE_ONPREMISE_DEV_PRIMARY` | Local workstation development | Offline development |
| `DATABASE_ONPREMISE_DEV_EXPERIMENT` | Migration testing | Schema experiments |

### 14.3 Breaking Change Alert: Prisma 7 Engine Types

**The production failure on 2025-12-19 was caused by:**

Prisma 7 changed the default `engineType` from `"library"` to `"client"`. The `"client"` engine requires either:
- An `adapter` (like `@prisma/adapter-pg`)
- An `accelerateUrl` for Prisma Accelerate

**Fix:** Explicitly set `engineType = "library"` in schema.prisma for direct PostgreSQL connections.

### 14.4 Prisma Client Instantiation (Our Pattern)

```typescript
// src/shared/prisma.ts - Simplified view
const baseOptions = {
  log: [
    { emit: "stdout", level: "error" },
    { emit: "event", level: "query" }, // Performance monitoring
  ],
};

// Library engine uses direct connection, no adapter needed
const client = new PrismaClient(baseOptions);
```

---

**Last Updated:** 2025-12-19
**Revision:** 1.0 — Initial Bible with production failure learnings
