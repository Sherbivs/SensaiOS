# SensaiOS App Migration Guide

**Version:** 1.0.0  
**Status:** IN PROGRESS  
**Task:** SENSAI.GAMESERVER.MIGRATION  
**Last Updated:** 2026-01-03

---

## Overview

This guide documents the migration of Ring 3 applications (Discord bot, CLI tools) from direct database/kernel access to using the GameServerAPI. This is a critical step in the SensaiOS security model that enforces app isolation.

### Goals

1. **Isolation**: Apps cannot directly access database or kernel primitives
2. **Security**: All game operations go through capability-checked, rate-limited API
3. **Auditability**: Every API call is logged for compliance and debugging
4. **Encryption**: Sensitive data (Discord IDs) is encrypted before passing to apps

### Architecture Before Migration

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Ring 3 (Discord Bot)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ homestead/   │  │ battle/      │  │ wilds/                   │  │
│  │ explore.ts   │  │ actions.ts   │  │ controls.ts              │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬──────────────┘  │
│         │                 │                      │                  │
│         ▼                 ▼                      ▼                  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │               Direct Imports (VIOLATION)                      │  │
│  │  import { prisma } from '../shared/prisma.js'                │  │
│  │  import { spawnEncounter } from '../core/encounter/spawn.js' │  │
│  │  import { BattleRepo } from '../models/index.js'             │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│            Ring 0/1 (Kernel / Shared / Models)                      │
│  • Prisma client (database)                                         │
│  • Battle engine (core/battle)                                      │
│  • Encounter system (core/encounter)                                │
│  • Model repositories (models/index.js)                             │
└─────────────────────────────────────────────────────────────────────┘
```

### Architecture After Migration

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Ring 3 (Discord Bot)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ homestead/   │  │ battle/      │  │ wilds/                   │  │
│  │ explore.ts   │  │ actions.ts   │  │ controls.ts              │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬──────────────┘  │
│         │                 │                      │                  │
│         ▼                 ▼                      ▼                  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  GameServerAPI (AUTHORIZED)                   │  │
│  │  const gameServer = createGameServerClient(ctx, manifest);   │  │
│  │  await gameServer.trainers.get(encryptedDiscordId);          │  │
│  │  await gameServer.encounters.spawn({ channelId: encrypted }); │  │
│  │  await gameServer.battles.create({ ... });                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 SensaiOS GameServer Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Capability   │  │ Rate         │  │ Audit                    │  │
│  │ Checking     │  │ Limiting     │  │ Logging                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Internal Implementation                          │  │
│  │  • Decrypts Discord IDs                                       │  │
│  │  • Calls database/engine functions                            │  │
│  │  • Encrypts sensitive results                                 │  │
│  │  • Appends audit exports                                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│            Ring 0/1 (Kernel / Shared / Models)                      │
│  • Prisma client (database) ← Only accessed by GameServerAPI       │
│  • Battle engine (core/battle) ← Only accessed by GameServerAPI    │
│  • Encounter system (core/encounter) ← Only accessed by GameServerAPI│
└─────────────────────────────────────────────────────────────────────┘
```

---

## Migration Checklist

### Phase 1: GameServerAPI Internal Implementation ✅

Fill in stub implementations in `src/sensaios/gameserver/api.ts`:

- [x] Encryption layer (`encryption.ts`) — AES-256-GCM with per-app keys
- [x] Rate limiter (`rate-limiter.ts`) — Sliding window algorithm
- [x] Type definitions (`types.ts`) — Full type system
- [ ] `getTrainerInternal()` — Call `getUserBasic()` or Prisma
- [ ] `getPartyInternal()` — Call `getPartyWithSlots()`
- [ ] `updateMoneyInternal()` — Call Prisma `user.update()`
- [ ] `spawnEncounterInternal()` — Call `spawnEncounterForUser()`
- [ ] `catchInternal()` — Call catch flow
- [ ] `fleeInternal()` — Call flee flow
- [ ] `createBattleInternal()` — Call `BattleRepo.create()`
- [ ] `getBattleInternal()` — Call battle cache/db
- [ ] `submitMoveInternal()` — Call turn manager
- [ ] `forfeitInternal()` — Call conclude battle

### Phase 2: Bot Layer Migration

Replace direct imports with GameServerAPI calls:

- [ ] `src/bot/homestead/*.ts` — All homestead modules
- [ ] `src/bot/battle/*.ts` — Battle actions, challenge, conclude
- [ ] `src/bot/wilds/*.ts` — Encounter controls, walk
- [ ] `src/bot/daily/*.ts` — Daily quests

### Phase 3: Verification

- [ ] All tests pass: `npm test`
- [ ] ESLint passes (ring boundaries): `npm run lint`
- [ ] No direct prisma imports in Ring 3
- [ ] No kernel imports in Ring 3

---

## Migration Patterns

### Pattern 1: Trainer Data Access

**Before:**
```typescript
import { prisma } from '../../shared/prisma.js';

async function getTrainer(discordId: string) {
  return prisma.user.findUnique({
    where: { discordId },
    select: { id: true, coins: true, discordId: true }
  });
}
```

**After:**
```typescript
import { createGameServerClient } from '../../sensaios/gameserver/api.js';
import type { GameServerAPI } from '../../sensaios/gameserver/api.js';

// In component initialization:
const gameServer = createGameServerClient(ctx, manifest);

// In handler:
async function getTrainer(gameServer: GameServerAPI, encryptedDiscordId: EncryptedToken) {
  const trainer = await gameServer.trainers.get(encryptedDiscordId);
  return trainer; // Already has encrypted fields
}
```

### Pattern 2: Party Access

**Before:**
```typescript
import { getPartyWithSlots } from '../../shared/models/party-queries-pg.js';

async function getParty(discordId: string) {
  return getPartyWithSlots(discordId);
}
```

**After:**
```typescript
async function getParty(gameServer: GameServerAPI, encryptedDiscordId: EncryptedToken) {
  return gameServer.trainers.getParty(encryptedDiscordId);
}
```

### Pattern 3: Encounter Spawning

**Before:**
```typescript
import { spawnEncounterForUser } from '../../core/encounter/spawn.js';

async function spawnEncounter(userId: string) {
  return spawnEncounterForUser(userId);
}
```

**After:**
```typescript
async function spawnEncounter(gameServer: GameServerAPI, params: SpawnEncounterParams) {
  return gameServer.encounters.spawn(params);
}
```

### Pattern 4: Battle Operations

**Before:**
```typescript
import { BattleRepo, prisma } from '../../models/index.js';

async function createBattle(p1Id: string, p2Id: string) {
  return BattleRepo.create({ p1Id, p2Id });
}
```

**After:**
```typescript
async function createBattle(
  gameServer: GameServerAPI, 
  challengerId: EncryptedToken, 
  opponentId: EncryptedToken
) {
  return gameServer.battles.create({
    challengerId,
    opponentId,
    format: 'singles',
    idempotencyKey: `battle-${Date.now()}`,
  });
}
```

---

## Security Considerations

### 1. Capability Declaration

Apps must declare required capabilities in their manifest:

```typescript
// manifests/discord-bot.manifest.json
{
  "name": "discord-bot",
  "capabilities": {
    "game": [
      "game.trainer.read",
      "game.trainer.write",
      "game.battle.create",
      "game.battle.read",
      "game.battle.write",
      "game.encounter.spawn",
      "game.encounter.catch",
      "game.encounter.write"
    ]
  }
}
```

### 2. Rate Limiting

All API methods have rate limits (see `types.ts`):

| Method | Limit | Window |
|--------|-------|--------|
| `battles.create` | 1/min | per user |
| `battles.get` | 30/min | per user |
| `encounters.spawn` | 10/min | per channel |
| `encounters.catch` | 30/min | per user |
| `trainers.get` | 60/min | per user |
| `trainers.updateMoney` | 100/min | per user |

### 3. Encryption

Sensitive fields are encrypted before returning to apps:

- `discord_id` — Discord user/channel IDs
- `battle_seed` — RNG seeds (prevent manipulation)
- `encounter_seed` — Encounter seeds

Apps receive `EncryptedToken` objects and must use them opaquely.

---

## Testing Migration

### Unit Tests

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createGameServerClient } from '../../../src/sensaios/gameserver/api.js';
import { initializeDevelopmentEncryption } from '../../../src/sensaios/gameserver/encryption.js';

describe('GameServerAPI Integration', () => {
  let gameServer: GameServerAPI;
  
  beforeEach(() => {
    initializeDevelopmentEncryption();
    const mockCtx = createMockComponentContext();
    const manifest = { name: 'test-app', capabilities: { game: ['game.trainer.read'] } };
    gameServer = createGameServerClient(mockCtx, manifest);
  });
  
  it('should get trainer with encrypted fields', async () => {
    const token = createEncryptedToken('test-app', '123456789', 'discord_id');
    const trainer = await gameServer.trainers.get(token);
    expect(trainer).toBeDefined();
    expect(trainer?.discordId.token).toMatch(/^enc_v1_/);
  });
});
```

### ESLint Verification

Run ESLint to verify no Ring 3 → Ring 0/1 imports:

```bash
npm run lint

# Should pass with no ring boundary violations
```

---

## Rollback Plan

If migration causes issues:

1. **Revert commits**: All changes are in single feature branch
2. **Disable capability checks**: Set `SKIP_CAPABILITY_CHECKS=true` env var
3. **Fallback to direct access**: GameServerAPI has `bypassSecurity` option (dev only)

---

## Progress Tracking

| Module | Files | Status | Notes |
|--------|-------|--------|-------|
| GameServerAPI internals | 1 | 🔄 In Progress | Filling in stub implementations |
| homestead/ | 17 | ⏳ Pending | Waiting for API internals |
| battle/ | 4 | ⏳ Pending | Waiting for API internals |
| wilds/ | 3 | ⏳ Pending | Waiting for API internals |
| daily/ | 1 | ⏳ Pending | Waiting for API internals |

---

**Document Created:** 2026-01-03  
**Author:** AI Development Agent  
**Task Reference:** SENSAI.GAMESERVER.MIGRATION in Tasklist.md
