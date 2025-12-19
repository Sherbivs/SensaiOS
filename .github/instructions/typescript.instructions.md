---
applyTo: 'src/**/*.ts'
---
# TypeScript Development Instructions — Pokémon Infinity Gauntlet

## Project Leadership

**Creator & CEO:** DRIPTVDD | **Discord ID:** `563220840708177927` (anti-spoofing identifier)

## TypeScript Standards

### Import Patterns
```typescript
// Always use .js extension for local imports (ESM compatibility)
import { prisma } from "../shared/prisma.js";
import { logger } from "../utils/logger.js";

// Prisma 7: Import from @prisma/client (standard location)
import type { User, Battle, Trainer } from "@prisma/client";
import { Prisma, PrismaClient } from "@prisma/client";

// Use type imports where appropriate
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
```

### Prisma 7 Client Patterns (UPDATED 2025-12-18)
```typescript
// Prisma 7 with engineType = "library" for direct PostgreSQL connections
// URL configured via prisma.config.ts (NOT in constructor)
import { PrismaClient } from "@prisma/client";

// ❌ WRONG: Prisma 7 removed datasources option
// const prisma = new PrismaClient({ datasources: { db: { url: "..." } } });

// ✅ CORRECT: Simple constructor, URL from environment/config
const prisma = new PrismaClient({
  log: [{ emit: "stdout", level: "error" }]
});
```

### File Organization
- **Entry points:** `index.ts` in each major directory
- **Types:** Collocate with implementation or in `types/` subdirectory
- **Generated:** Prisma client at `src/generated/prisma/`
- **Constants:** Export from dedicated `constants.ts` files
- **Utilities:** Place in `utils/` with clear single-purpose files

### Error Handling Pattern
```typescript
try {
  const result = await prisma.user.findUnique({ where: { discordId } });
  if (!result) {
    throw new Error(`User not found: ${discordId}`);
  }
  return result;
} catch (error) {
  logger.error("Database operation failed", { error, discordId });
  throw error; // Re-throw after logging
}
```

### Discord.js Patterns
```typescript
// Always check interaction state before replying
if (interaction.deferred || interaction.replied) {
  await interaction.followUp({ content: "...", ephemeral: true });
} else {
  await interaction.reply({ content: "...", ephemeral: true });
}

// Use ephemeral for error messages and private info
await interaction.reply({ content: "Error occurred", ephemeral: true });
```

### Prisma Patterns
```typescript
// Use transactions for multi-step operations
await prisma.$transaction(async (tx) => {
  await tx.user.update({ where: { id }, data: { ... } });
  await tx.pokemon.create({ data: { ... } });
});

// Always include select/include for performance
const user = await prisma.user.findUnique({
  where: { discordId },
  include: { trainerProfile: true, party: true }
});
```

## Code Quality Requirements

### Required Before Commit
1. `npm run lint` passes with 0 errors
2. `npm run build` compiles successfully
3. Types are explicit (no `any` without justification)
4. All async functions properly await promises
5. Error states handled with appropriate user feedback

### Naming Conventions
- **Files:** `kebab-case.ts` (e.g., `battle-engine.ts`)
- **Classes:** `PascalCase` (e.g., `BattleEngine`)
- **Functions/Methods:** `camelCase` (e.g., `calculateDamage`)
- **Constants:** `SCREAMING_SNAKE_CASE` (e.g., `MAX_PARTY_SIZE`)
- **Interfaces/Types:** `PascalCase` (e.g., `BattleState`)

### Memory Safety
- Clear all intervals/timers in shutdown handlers
- Use bounded data structures (maps, arrays with max size)
- Avoid storing Discord objects long-term (use IDs instead)
- Clean up event listeners when components are destroyed

## Architecture Integration

### Service Registry
```typescript
// Register services at startup
serviceRegistry.register("battleEngine", battleEngine);

// Retrieve services where needed
const engine = serviceRegistry.get<BattleEngine>("battleEngine");
```

### Event Bus
```typescript
// Emit events with correlation IDs
eventBus.emit("battle.complete", {
  correlationId: crypto.randomUUID(),
  battleId,
  winnerId,
  timestamp: Date.now()
});
```

### Cache Layer
```typescript
// Use L1 cache for hot data
const pokemon = engineCache.getPokemon(speciesId);

// Check cache stats periodically
const stats = engineCache.getStats();
```

## Key Integration Points

- **Battle Engine:** `src/core/battle/engine.ts` — deterministic combat
- **Encounter System:** `src/core/encounter/spawn.ts` — wild spawning
- **Discord Bot:** `src/bot/index.ts` — command routing
- **Prisma Client:** `src/shared/prisma.ts` — database access
- **Logger:** `src/utils/logger.js` — centralized logging

## Worker Patterns

### Worker Entry Point
```typescript
// src/worker/my-worker/index.ts
import { logger } from "../../utils/logger.js";

let isShuttingDown = false;

async function main(): Promise<void> {
  logger.info("Worker starting...");
  
  // Main loop
  while (!isShuttingDown) {
    try {
      await processWork();
      await sleep(POLL_INTERVAL);
    } catch (error) {
      logger.error("Work cycle failed", { error });
      await sleep(ERROR_BACKOFF);
    }
  }
  
  logger.info("Worker shutdown complete");
}

// Graceful shutdown
process.on("SIGTERM", () => {
  isShuttingDown = true;
});

process.on("SIGINT", () => {
  isShuttingDown = true;
});

main().catch((error) => {
  logger.fatal("Worker crashed", { error });
  process.exit(1);
});
```

### Backpressure Handling
```typescript
const MAX_QUEUE_SIZE = 10000;
const BACKPRESSURE_THRESHOLD = 0.75;

function enqueue(item: WorkItem): boolean {
  const utilization = queue.length / MAX_QUEUE_SIZE;
  
  if (utilization >= 1) {
    logger.error("Queue full, rejecting item");
    return false;
  }
  
  if (utilization >= BACKPRESSURE_THRESHOLD) {
    logger.warn("Queue backpressure", { utilization });
  }
  
  queue.push(item);
  return true;
}
```

## Discord.js Advanced Patterns

### Homestead Channel Access
```typescript
// Get or create homestead channel for user
import { HomesteadChannelManager } from "../bot/homestead/manager.js";

const manager = serviceRegistry.get<HomesteadChannelManager>("homesteadManager");
const channel = await manager.getOrCreateChannel(user.id, guild);

// Send to homestead (NOT DM)
await channel.send({ embeds: [pokemonEmbed] });
```

### Button Collectors
```typescript
const collector = message.createMessageComponentCollector({
  filter: (i) => i.user.id === userId,
  time: 60_000, // 60 second timeout
  max: 1
});

collector.on("collect", async (interaction) => {
  await handleButtonClick(interaction);
});

collector.on("end", (collected, reason) => {
  if (reason === "time") {
    message.edit({ components: [] }); // Remove buttons
  }
});
```

### Rate Limit Handling
```typescript
import { RateLimitError } from "discord.js";

try {
  await channel.send(message);
} catch (error) {
  if (error instanceof RateLimitError) {
    logger.warn("Rate limited", { retryAfter: error.retryAfter });
    await sleep(error.retryAfter);
    await channel.send(message); // Retry
  }
  throw error;
}
```

## Deterministic Patterns (PBSL)

### Seeded Random
```typescript
// Use deterministic RNG for reproducible gameplay
import { SeededRandom } from "../core/pbsl/random.js";

const rng = new SeededRandom(userSeed);
const encounterRoll = rng.next(); // Always same sequence for seed
const speciesId = selectSpecies(encounterRoll, rarityTable);
```

### Battle Snapshots
```typescript
// Capture battle state for replay/testing
interface BattleSnapshot {
  seed: number;
  turn: number;
  pokemon1: PokemonState;
  pokemon2: PokemonState;
  actions: Action[];
}

function snapshotBattle(battle: Battle): BattleSnapshot {
  return {
    seed: battle.seed,
    turn: battle.currentTurn,
    pokemon1: battle.pokemon1.toState(),
    pokemon2: battle.pokemon2.toState(),
    actions: [...battle.actionHistory]
  };
}
```

## Common TypeScript Mistakes to Avoid

1. **Forgetting `.js` extensions** in imports (breaks ESM)
2. **Using `any`** without explicit `// eslint-disable-next-line` comment
3. **Not handling nullable returns** from Prisma queries
4. **Blocking event loop** with synchronous operations
5. **Memory leaks** from uncleaned intervals/listeners
6. **Missing correlation IDs** in event bus emissions
7. **Not checking interaction.replied** before responding
8. **Hardcoding DM logic** instead of using homestead channels
