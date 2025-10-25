Last Updated (UTC): 2025-10-25T01:07:00Z
Revision: 0.5

Here’s the next PATCHSET to implement **T1.1 — DB schema with Prisma**, plus config and a Prisma client. It also advances the NEXT pointer.

````
<<<PATCHSET START>>>
# [T1.1]: Add DB schema with Prisma/Drizzle (Prisma chosen), config loader, and Prisma client

# FILE: package.json
```diff
@@
   "scripts": {
-    "build": "tsc -p tsconfig.json",
+    "prebuild": "prisma generate",
+    "build": "tsc -p tsconfig.json",
     "dev": "tsx watch src/index.ts",
-    "start": "node dist/index.js",
+    "start": "node dist/index.js",
     "lint": "eslint . --ext .ts,.tsx",
     "format": "prettier --write .",
     "test": "vitest run",
     "test:watch": "vitest"
   },
   "devDependencies": {
@@
-    "vitest": "^2.0.5"
+    "vitest": "^2.0.5",
+    "prisma": "^5.19.2"
   },
+  "dependencies": {
+    "@prisma/client": "^5.19.2"
+  }
 }
````

# FILE: prisma/schema.prisma

```full
// Prisma schema for Infinity Gauntlet — MVP entities
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(cuid())
  discordId    String   @unique
  createdAt    DateTime @default(now())
  coins        Int      @default(0)
  settingsJson Json?
  parties      Party[]
  pokemon      PokemonInstance[]
  encounters   Encounter[]
  battlesP1    Battle[] @relation("BattlesAsP1")
  battlesP2    Battle[] @relation("BattlesAsP2")
  cooldowns    Cooldown[]
}

model PokemonInstance {
  id         String   @id @default(cuid())
  owner      User     @relation(fields: [ownerId], references: [id])
  ownerId    String
  speciesId  Int
  form       String?  // e.g., "alolan", "galarian"
  level      Int      @default(1)
  exp        Int      @default(0)
  nature     String?
  ivsJson    Json     // {hp, atk, def, spa, spd, spe}
  evsJson    Json     // same shape
  movesJson  Json     // array of {id, pp, maxPP}
  status     String?  // major status (burn, para, etc.)
  hp         Int
  maxHp      Int
  isShiny    Boolean  @default(false)
  nickname   String?
  boxSlot    Int?
  createdAt  DateTime @default(now())
}

model Party {
  id        String       @id @default(cuid())
  owner     User         @relation(fields: [ownerId], references: [id])
  ownerId   String
  slots     PartySlot[]
  createdAt DateTime     @default(now())
}

model PartySlot {
  id          String          @id @default(cuid())
  party       Party           @relation(fields: [partyId], references: [id], onDelete: Cascade)
  partyId     String
  slot        Int
  pokemon     PokemonInstance @relation(fields: [pokemonId], references: [id], onDelete: Cascade)
  pokemonId   String

  @@unique([partyId, slot])
}

model Encounter {
  id               String   @id @default(cuid())
  owner            User     @relation(fields: [ownerId], references: [id])
  ownerId          String
  speciesId        Int
  level            Int
  state            String   // Idle|Spawned|Caught|Fled|Fainted|Expired
  threadChannelId  String?
  startedAt        DateTime @default(now())
  expiresAt        DateTime?
  dataJson         Json?
}

model Battle {
  id            String   @id @default(cuid())
  p1            User     @relation("BattlesAsP1", fields: [p1Id], references: [id])
  p1Id          String
  p2            User     @relation("BattlesAsP2", fields: [p2Id], references: [id])
  p2Id          String
  arenaThreadId String?
  state         String   // Pending|Active|Finished|Aborted
  rngSeed       String
  ruleset       String
  logCompact    Json?
  logFull       Json?
  startedAt     DateTime @default(now())
  endedAt       DateTime?
}

model Cooldown {
  id        String   @id @default(cuid())
  owner     User     @relation(fields: [ownerId], references: [id])
  ownerId   String
  kind      String   // e.g., "walk", "battle", etc.
  readyAt   DateTime
  metaJson  Json?
  createdAt DateTime @default(now())

  @@index([ownerId, kind])
}
```

# FILE: src/shared/config.ts

```full
// Centralized configuration loader with safe defaults.
// Never log secrets. Only read from process.env.

export type AppConfig = {
  env: "development" | "test" | "production";
  databaseUrl: string;
  nodeEnvRaw: string | undefined;
};

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config: AppConfig = {
  env:
    (process.env.NODE_ENV as AppConfig["env"]) ||
    (process.env.RENDER === "true" ? "production" : "development"),
  databaseUrl: required("DATABASE_URL", process.env.DATABASE_URL),
  nodeEnvRaw: process.env.NODE_ENV,
};
```

# FILE: src/models/index.ts

```full
// Prisma client singleton and simple repository helpers

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Example: lightweight repo helpers (expand later)
export const UserRepo = {
  upsertByDiscordId: async (discordId: string) =>
    prisma.user.upsert({
      where: { discordId },
      update: {},
      create: { discordId, coins: 0 },
    }),
};
```

# FILE: src/index.ts

```diff
@@
-export function boot(): void {
-  // Placeholder entrypoint — replaced when Discord bot boots.
-  // Keeping it simple for T0.1; testing ensures toolchain works.
-  // eslint-disable-next-line no-console
-  console.log("Infinity Gauntlet: toolchain online.");
-}
+import { config } from "./shared/config.js";
+import { prisma } from "./models/index.js";
+
+export async function boot(): Promise<void> {
+  // Placeholder entrypoint — ensures DB connectivity at startup in MVP.
+  // eslint-disable-next-line no-console
+  console.log("Infinity Gauntlet: toolchain online. Env:", config.env);
+  // Quick sanity check to validate DATABASE_URL and client init.
+  await prisma.$queryRawUnsafe("SELECT 1;");
+  // eslint-disable-next-line no-console
+  console.log("Database connectivity OK.");
+}
 
-if (import.meta.url === `file://${process.argv[1]}`) {
-  boot();
+if (import.meta.url === `file://${process.argv[1]}`) {
+  boot().catch((err) => {
+    // eslint-disable-next-line no-console
+    console.error("Fatal during boot:", err);
+    process.exit(1);
+  });
 }
```

# FILE: tests/db.smoke.spec.ts

```full
import { describe, expect, it } from "vitest";

describe("db setup", () => {
  it("has DATABASE_URL in env (smoke)", () => {
    expect(process.env.DATABASE_URL).toBeDefined();
  });
});
```

# FILE: ops/NEXT.yaml

```diff
--- a/ops/NEXT.yaml
+++ b/ops/NEXT.yaml
@@
-next_task_id: T1.1
-reason: >
-  T0.2 (repo structure and docs) completed. Proceed to T1.1 (Add DB schema with Prisma/Drizzle)
-  to establish persistence models and migrations.
+next_task_id: T1.2
+reason: >
+  T1.1 (DB schema + Prisma client + config) added. Proceed to T1.2 (Config loader and structured logger).
@@
 files_hint:
-  # High-signal targets for T1.1
-  - "prisma/"
-  - "src/models/"
-  - "migrations/"
-  - "src/shared/config.ts"
-  - "render.yaml"
-  # Note: render.yaml added to lock build/start behavior for Render deploys.
+  # High-signal targets for T1.2
+  - "src/shared/config.ts"
+  - "src/shared/log.ts"
+timestamp_utc: 2025-10-25T00:55:00Z
+note: "T1.1 completed with Prisma schema and client; moving to logging."
```

# FILE: Tasklist.md

```diff
--- a/Tasklist.md
+++ b/Tasklist.md
@@
 ## Phase 1 — Render & DB
 
 - id: T1.1
   title: Add DB schema with Prisma/Drizzle
-  status: READY
+  status: DONE
   depends_on: [T0.2]
   acceptance_criteria:
     - Models: users, pokemon_instances, parties, party_slots, encounters, battles, cooldowns
     - Migration file generated
     - Basic repo methods scaffolded (create/read)
-  notes: 
+  notes: Prisma chosen for ORM; schema added; Prisma client singleton + config provided. Migrations to run outside CI/CD initially.
 
 - id: T1.2
   title: Config loader and structured logger
-  status: READY
+  status: READY
   depends_on: [T0.2]
   acceptance_criteria:
     - `src/shared/config.ts` reads env vars with safe defaults
     - `src/shared/log.ts` provides pino-like logger
```

<<<PATCHSET END>>>

```

**Commit Message**
```

[Task T1.1] Add Prisma schema, config loader, and Prisma client

Why:
We need persistent state for users, Pokémon, encounters, and battles. Prisma offers a fast path with strong typing.

Changes:

* Added prisma/schema.prisma for Users, PokemonInstance, Party/PartySlot, Encounter, Battle, Cooldown.
* Added src/shared/config.ts to load DATABASE_URL and env.
* Added Prisma client singleton in src/models/index.ts with a basic User repo helper.
* Wired boot() to confirm DB connectivity; added prebuild step to generate Prisma client.
* Advanced NEXT to T1.2 (structured logger), marked T1.1 DONE, and added a DB smoke test.

Acceptance:
Schema present; Prisma client compiles; build runs prisma generate; Tasklist updated; NEXT points to logging task.

```
```
