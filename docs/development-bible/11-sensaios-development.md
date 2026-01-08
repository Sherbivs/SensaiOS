# 11 — SensaiOS Development Guide

**Status:** AUTHORITATIVE  
**Created:** January 5, 2026  
**Purpose:** Guide developers on creating SensaiOS applications, requesting capabilities, and using the GameServerAPI

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Creating an App](#2-creating-an-app)
3. [Requesting Capabilities](#3-requesting-capabilities)
4. [Using the GameServerAPI](#4-using-the-gameserverapi)
5. [Handler Development](#5-handler-development)
6. [Testing Your App](#6-testing-your-app)
7. [Common Patterns](#7-common-patterns)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Quick Start

### Prerequisites

- Node.js 20+
- TypeScript 5.5+
- Familiarity with ComponentContext pattern
- Understanding of ring security model (see [28-sensaios-security-model.md](../architecture-bible/28-sensaios-security-model.md))

### Development Setup

```bash
# Install dependencies
npm install

# Start in secure mode (ring enforcement enabled)
npm run dev:secure

# Run security tests
npm test -- tests/sensaios/security/
```

### Ring Hierarchy (Know Your Level)

| Ring | Components | Access |
|------|-----------|--------|
| Ring 0 (Kernel) | `kernel.*` | Unrestricted |
| Ring 1 (SensaiOS) | `sensai.*` | Kernel + SensaiOS |
| Ring 3 (Apps) | All others | GameServerAPI only |

**Your app is Ring 3.** You CANNOT import from `kernel/` or `sensaios/` directories.

---

## 2. Creating an App

### Step 1: Create the Manifest

**File:** `manifests/my-app.manifest.json`

```json
{
  "id": "game.myapp",
  "name": "My Application",
  "version": "1.0.0",
  "description": "A sample SensaiOS application",
  "hosts": ["bot"],
  "capabilities": {
    "db": ["read"],
    "discord": ["read", "send"]
  },
  "dependencies": ["discord.bot"],
  "resources": {
    "maxCacheMb": 20,
    "maxQueueSize": 500
  }
}
```

> **Note:** Capabilities use a nested object format grouped by category (db, discord, network, kernel). The system flattens these to strings like `"db.read"` at runtime.

### Step 2: Create the Component

**File:** `src/apps/my-app/index.ts`

```typescript
import { ComponentContext, runGuarded, SensaiComponent } from '../../sensaios/types.js';

export const MyAppComponent: SensaiComponent = {
  name: 'game.myapp',
  version: '1.0.0',
  ringLevel: 3,  // Ring 3 = Apps
  hosts: ['bot'],
  
  // Required capabilities (nested object format)
  capabilities: {
    db: ['read'],
    discord: ['read', 'send'],
  },
  
  // Lifecycle hooks
  async onLoad(ctx: ComponentContext) {
    ctx.obs.log.info('MyApp loading');
  },
  
  async onEnable(ctx: ComponentContext) {
    ctx.obs.log.info('MyApp enabled');
  },
  
  async onDisable(ctx: ComponentContext) {
    ctx.obs.log.info('MyApp disabled');
  },
  
  // Handlers
  handlers: {
    discord: {
      'myapp-command': handleMyAppCommand,
    },
  },
};

// Handler implementation
const handleMyAppCommand = runGuarded(
  'game.myapp.command',
  async (ctx: ComponentContext, interaction: CommandInteraction) => {
    // Your logic here using ctx primitives
    await interaction.reply('Hello from MyApp!');
  }
);
```

### Step 3: Install the App

```bash
# Via CLI
sensaios install ./manifests/my-app.manifest.json

# Verify installation
sensaios list
```

---

## 3. Requesting Capabilities

### Safe Capabilities (Auto-Approved)

These are granted automatically during installation:

| Capability | Permission |
|------------|------------|
| `db.read` | SELECT queries on any table |
| `db.write` | INSERT/UPDATE/DELETE on owned tables |
| `discord.read` | Fetch guild, channel, user data |
| `discord.send` | Send messages, embeds, reactions |
| `network.http-egress` | Outbound HTTP requests |
| `storage.read` | Read from object store |
| `storage.write` | Write to object store |

### Dangerous Capabilities (Require Approval)

These require operator approval via CLI:

| Capability | Permission | Approval Required |
|------------|------------|------------------|
| `db.migrate` | CREATE/ALTER/DROP tables | Yes |
| `discord.moderate` | Kick, ban, timeout, manage roles | Yes |
| `kernel.observe` | Read kernel state | Yes |
| `kernel.modify` | Change kernel configuration | Yes |

### Capability Check Workflow

```typescript
// In your handler, capabilities are checked automatically
const handleCommand = runGuarded(
  'game.myapp.command',
  async (ctx: ComponentContext, interaction: CommandInteraction) => {
    // ctx.db.query() will check 'db.read' capability
    const data = await ctx.db.query('SELECT * FROM trainers LIMIT 10');
    
    // If you lack capability, a SecurityError (code 4xxx) is thrown
  }
);
```

### Checking Capability Status

```typescript
// Check if you have a capability
const hasWrite = await ctx.capabilities.check('db.write');

if (hasWrite) {
  await ctx.db.transaction(async (tx) => {
    // Safe to write
  });
} else {
  ctx.obs.log.warn('Missing db.write capability');
}
```

---

## 4. Using the GameServerAPI

### Getting a Client

```typescript
import { getGameServerClient } from '../../sensaios/gameserver/index.js';

const handleCommand = runGuarded(
  'game.myapp.command',
  async (ctx: ComponentContext, interaction: CommandInteraction) => {
    // Get encrypted client for your app
    const api = getGameServerClient('game.myapp', ctx);
    
    // Use API methods
    const trainer = await api.trainers.get(interaction.user.id);
  }
);
```

### API Namespaces

#### Battles

```typescript
// Create a battle
const battle = await api.battles.create({
  challengerId: challengerToken,  // Encrypted Discord ID
  opponentId: opponentToken,      // Encrypted Discord ID
  format: 'singles',
  idempotencyKey: `battle-${Date.now()}`,
});

// Submit battle action (NOT execute - method was renamed)
const result = await api.battles.submitMove(battleId, participantToken, {
  type: 'move',
  move: 'thunderbolt',
  target: 'opponent',
});

// Forfeit battle
await api.battles.forfeit(battleId, participantToken);
```

#### Encounters

```typescript
// Spawn wild encounter
const encounter = await api.encounters.spawn(channelToken);

// Attempt catch
const result = await api.encounters.catch(encounterId, 'pokeball');
// result.success, result.pokemon, result.caught
```

#### Trainers

```typescript
// Get trainer data (encrypted tokens returned)
const trainer = await api.trainers.get(discordIdToken);
// trainer contains encrypted party, inventory, money

// Update money
await api.trainers.updateMoney({
  discordId: discordIdToken,
  delta: -500,
  reason: 'Item purchase',
  idempotencyKey: `purchase-${Date.now()}`,
});

// Get party (active team)
const party = await api.trainers.getParty(discordIdToken);

// Get detailed party (includes IVs, EVs, base stats)
const detailedParty = await api.trainers.getDetailedParty(discordIdToken);

// Swap party positions
await api.trainers.swapPartySlots({
  discordId: discordIdToken,
  slotA: 0,
  slotB: 1,
});

// Get storage (PC boxes)
const storage = await api.trainers.getStorage(discordIdToken);

// Move Pokemon between party and storage
await api.trainers.movePokemon({
  discordId: discordIdToken,
  pokemonId: 'pokemon-uuid',
  destination: 'storage', // or 'party'
  slot: 0,
});

// Inventory operations
const inventory = await api.trainers.getInventory(discordIdToken);
await api.trainers.useItem({
  discordId: discordIdToken,
  itemId: 'potion',
  targetPokemonId: 'pokemon-uuid',
});

// Settings
const settings = await api.trainers.getSettings(discordIdToken);
await api.trainers.updateSettings({
  discordId: discordIdToken,
  setting: 'battleAnimations',
  value: false,
});

// Daily features
const dailyData = await api.trainers.getDailyData(discordIdToken);
await api.trainers.claimDailyReward({
  discordId: discordIdToken,
  idempotencyKey: `daily-${Date.now()}`,
});

// Pokedex progress
const pokedex = await api.trainers.getPokedexProgress(discordIdToken);
```

#### Logging

```typescript
// App-safe logging
api.logs.info('Battle started', { battleId });
api.logs.error('Catch failed', new Error('Ball broke'));
```

### Encrypted Tokens

The GameServerAPI uses encrypted tokens for sensitive data:

```typescript
// You receive encrypted tokens
const trainer = await api.trainers.get(discordIdToken);
// trainer.discordId is an encrypted token like: enc_v1_...

// You pass tokens to other methods
await api.battles.create({
  challenger: trainer.discordId,  // Pass token, not raw ID
  challenged: otherTrainer.discordId,
});

// You CANNOT decrypt tokens - they're opaque to your app
```

### Rate Limiting

All API calls are rate-limited (values from actual implementation):

| Method | Limit | Notes |
|--------|-------|-------|
| `battles.create` | 1/min per user | |
| `battles.get` | 30/min per user | |
| `battles.submitMove` | 10/min per user | |
| `battles.forfeit` | 5/min per user | |
| `encounters.spawn` | 10/min per channel | |
| `encounters.get` | 30/min per user | Shares limit with `catch` |
| `encounters.catch` | 30/min per user | |
| `encounters.flee` | 30/min per user | |
| `trainers.get` | 60/min per user | |
| `trainers.updateMoney` | 100/min per user | |
| `trainers.getParty` | 60/min per user | |
| `trainers.getDetailedParty` | 60/min per user | |
| `trainers.swapPartySlots` | 30/min per user | |
| `trainers.getDailyData` | 30/min per user | |
| `trainers.claimDailyReward` | 5/min per user | |
| `trainers.getInventory` | 30/min per user | |
| `trainers.useItem` | 30/min per user | |
| `trainers.getStorage` | 30/min per user | |
| `trainers.movePokemon` | 30/min per user | |
| `trainers.getSettings` | 30/min per user | |
| `trainers.updateSettings` | 30/min per user | |
| `trainers.getPokedexProgress` | 30/min per user | |
| `logs.info` | 100/min global | Per app |
| `logs.error` | 50/min global | Per app |

Exceeding limits throws `RateLimitError` (code 5001).

---

## 5. Handler Development

### Discord Command Handler

```typescript
import { CommandInteraction } from 'discord.js';
import { ComponentContext, runGuarded } from '../../sensaios/types.js';

export const handleMyCommand = runGuarded(
  'game.myapp.my-command',  // Unique handler name
  async (ctx: ComponentContext, interaction: CommandInteraction) => {
    // Acknowledge immediately
    await interaction.deferReply();
    
    // Get game client
    const api = getGameServerClient('game.myapp', ctx);
    
    // Perform operation
    const trainer = await api.trainers.get(interaction.user.id);
    
    // Respond
    await interaction.editReply(`Welcome back, ${trainer.name}!`);
  }
);
```

### Export Event Handler

```typescript
export const handleBattleCompleted = runGuarded(
  'game.myapp.battle-completed',
  async (ctx: ComponentContext, event: ExportEvent) => {
    // React to battle.completed exports
    const { battleId, winnerId, loserId } = event.payload;
    
    // Update leaderboard
    await ctx.db.transaction(async (tx) => {
      await tx.leaderboard.upsert({
        where: { trainerId: winnerId },
        update: { wins: { increment: 1 } },
        create: { trainerId: winnerId, wins: 1, losses: 0 },
      });
    });
  }
);
```

### Job Handler

```typescript
export const handleDailyReward = runGuarded(
  'game.myapp.daily-reward',
  async (ctx: ComponentContext, job: JobPayload) => {
    const { trainerId, reward } = job;
    
    const api = getGameServerClient('game.myapp', ctx);
    await api.trainers.updateMoney(trainerId, reward);
    
    ctx.obs.log.info('Daily reward granted', { trainerId, reward });
  }
);
```

---

## 6. Testing Your App

### Unit Testing

```typescript
// tests/apps/my-app/my-app.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { createMockContext } from '../../helpers/mock-context.js';

describe('MyApp', () => {
  it('should respond to command', async () => {
    const ctx = createMockContext({
      capabilities: ['db.read', 'discord.send'],
    });
    
    const interaction = createMockInteraction();
    
    await handleMyCommand(ctx, interaction);
    
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('Welcome back')
    );
  });
  
  it('should throw without capability', async () => {
    const ctx = createMockContext({
      capabilities: [], // No capabilities
    });
    
    const interaction = createMockInteraction();
    
    await expect(handleMyCommand(ctx, interaction))
      .rejects.toThrow(/lacks capability/);
  });
});
```

### Security Testing

```typescript
describe('MyApp Security', () => {
  it('should not leak sensitive data', async () => {
    const ctx = createMockContext();
    const api = getGameServerClient('game.myapp', ctx);
    
    const trainer = await api.trainers.get('encrypted_id');
    
    // Verify Discord ID is encrypted
    expect(trainer.discordId).toMatch(/^enc_v1_/);
  });
  
  it('should be rate limited', async () => {
    const ctx = createMockContext();
    const api = getGameServerClient('game.myapp', ctx);
    
    // Exhaust rate limit
    for (let i = 0; i < 120; i++) {
      try {
        await api.trainers.get('encrypted_id');
      } catch (e) {
        expect(e.code).toBe(5001); // RateLimitError
        break;
      }
    }
  });
});
```

---

## 7. Common Patterns

### Caching with Context

```typescript
const handleCommand = runGuarded(
  'game.myapp.command',
  async (ctx: ComponentContext, interaction: CommandInteraction) => {
    // Use ctx.cache for app-specific caching
    const cacheKey = `trainer:${interaction.user.id}`;
    
    let trainer = await ctx.cache.get(cacheKey);
    if (!trainer) {
      const api = getGameServerClient('game.myapp', ctx);
      trainer = await api.trainers.get(interaction.user.id);
      await ctx.cache.set(cacheKey, trainer, { ttl: 60_000 });
    }
    
    return trainer;
  }
);
```

### Transaction Safety

```typescript
const handlePurchase = runGuarded(
  'game.myapp.purchase',
  async (ctx: ComponentContext, interaction: CommandInteraction) => {
    const itemId = interaction.options.getString('item');
    
    // Wrap in transaction for atomicity
    await ctx.db.transaction(async (tx) => {
      // Deduct money
      const trainer = await tx.trainer.update({
        where: { discordId: interaction.user.id },
        data: { money: { decrement: itemCost } },
      });
      
      if (trainer.money < 0) {
        throw new Error('Insufficient funds');
      }
      
      // Add item
      await tx.inventory.create({
        data: {
          trainerId: trainer.id,
          itemId,
          quantity: 1,
        },
      });
    });
  }
);
```

### Audit Logging

```typescript
const handleAdminAction = runGuarded(
  'game.myapp.admin',
  async (ctx: ComponentContext, interaction: CommandInteraction) => {
    // Emit audit event for any privileged action
    await ctx.exports.append({
      source: 'game.myapp',
      type: 'admin.action',
      scope: ctx.scope,
      idempotencyKey: `admin-${interaction.id}`,
      payload: {
        adminId: interaction.user.id,
        action: 'grant_item',
        target: targetUserId,
        item: itemId,
      },
      occurredAt: new Date(),
      correlationId: ctx.obs.correlationId,
    });
  }
);
```

---

## 8. Troubleshooting

### SecurityError (4xxx)

```
SecurityError: Component game.myapp lacks capability db.write
```

**Cause:** Your app tried to use a capability it doesn't have.

**Fix:** 
1. Add capability to manifest
2. Reinstall app: `sensaios reinstall game.myapp`
3. For dangerous capabilities, run: `sensaios approve game.myapp db.migrate`

### RateLimitError (5001)

```
RateLimitError: Rate limit exceeded for trainers.get
```

**Cause:** Too many API calls in short period.

**Fix:**
1. Implement caching (see Common Patterns)
2. Batch operations where possible
3. Add rate limit handling: `if (e.code === 5001) await delay(60000)`

### ImportError (3xxx)

```
SecurityError: Ring 3 component cannot import from sensaios/
```

**Cause:** Direct import from kernel or sensaios directory.

**Fix:** Use ComponentContext primitives instead:
- ❌ `import { db } from '../../kernel/db'`
- ✅ `ctx.db` from handler context

### Visibility Violation

```
ESLint: Ring 3 (Apps) cannot import Ring 1 (SensaiOS) internals
```

**Cause:** Import path violates ring boundaries.

**Fix:** Use public API exports only:
- ❌ `import { internal } from '../../sensaios/internal'`
- ✅ `import { getGameServerClient } from '../../sensaios/gameserver'`

---

## Cross-References

- **Security Model:** [28-sensaios-security-model.md](../architecture-bible/28-sensaios-security-model.md)
- **Operations Guide:** [14-sensaios-operations.md](../operations-bible/14-sensaios-operations.md)
- **Instruction File:** [.github/instructions/sensai.instructions.md](../../.github/instructions/sensai.instructions.md)
- **Security Tests:** `tests/sensaios/security/*.spec.ts`

---

**Document Version:** 1.0.0  
**Status:** AUTHORITATIVE  
**Created:** January 5, 2026  
**Authority:** Canonical development guide for SensaiOS applications
