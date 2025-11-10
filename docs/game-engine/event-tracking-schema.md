# Event Tracking Schema Documentation

_Created: 2025-11-06T16:30:00Z (UTC) — Status: FINAL_

## Overview

This document defines the complete event tracking schema for Infinity Gauntlet. Every user interaction, system event, and gameplay action is tracked through the `UserEvent` table with typed JSON payloads.

## Event Categories

Events are organized into six high-level categories:

| Category | Description | Example Types | Retention |
| --- | --- | --- | --- |
| **gameplay** | Core game actions | battle.won, pokemon.caught, evolution.triggered | Indefinite |
| **engagement** | User engagement metrics | login, daily_quest.completed, achievement.unlocked | 90 days |
| **economy** | Virtual currency transactions | coins.earned, coins.spent, item.purchased | 1 year |
| **social** | Social interactions | friend.added, profile.updated, message.sent | 90 days |
| **system** | System events & errors | error.occurred, performance.slow_query | 30 days (info), 1 year (error/critical) |
| **admin** | Administrative actions | user.banned, content.moderated | Indefinite |

## Event Severity Levels

| Severity | Use Case | Retention | Examples |
| --- | --- | --- | --- |
| **info** | Normal operations | 30 days | login, pokemon.caught |
| **warning** | Noteworthy but not errors | 90 days | rate_limit.approached, cache.miss |
| **error** | Recoverable errors | 1 year | battle.timeout, api.error |
| **critical** | System failures | Indefinite | database.connection_lost, payment.failed |

## Event Schema by Type

### Gameplay Events

#### battle.started
```typescript
{
  category: "gameplay",
  eventType: "battle.started",
  severity: "info",
  data: {
    battleId: string,
    opponentId: string,
    ruleset: string,
    arenaThreadId?: string
  },
  relatedEntityType: "Battle",
  relatedEntityId: string
}
```

#### battle.won / battle.lost
```typescript
{
  category: "gameplay",
  eventType: "battle.won" | "battle.lost",
  severity: "info",
  data: {
    battleId: string,
    opponentId: string,
    opponentName: string,
    turns: number,
    duration_ms: number,
    pokemon_fainted: number,
    experience_gained: number,
    coins_earned?: number
  },
  relatedEntityType: "Battle",
  relatedEntityId: string
}
```

#### pokemon.caught
```typescript
{
  category: "gameplay",
  eventType: "pokemon.caught",
  severity: "info",
  data: {
    pokemonId: string,
    speciesId: number,
    speciesName: string,
    level: number,
    isShiny: boolean,
    encounterId: string,
    catchMethod: "pokeball" | "greatball" | "ultraball",
    attempts: number
  },
  relatedEntityType: "PokemonInstance",
  relatedEntityId: string
}
```

#### pokemon.evolved
```typescript
{
  category: "gameplay",
  eventType: "pokemon.evolved",
  severity: "info",
  data: {
    pokemonId: string,
    fromSpeciesId: number,
    fromSpeciesName: string,
    toSpeciesId: number,
    toSpeciesName: string,
    level: number,
    trigger: "level" | "item" | "trade"
  },
  relatedEntityType: "PokemonInstance",
  relatedEntityId: string
}
```

#### encounter.spawned
```typescript
{
  category: "gameplay",
  eventType: "encounter.spawned",
  severity: "info",
  data: {
    encounterId: string,
    speciesId: number,
    speciesName: string,
    level: number,
    isShiny: boolean,
    spawnLocation?: string,
    expiresAt: string
  },
  relatedEntityType: "Encounter",
  relatedEntityId: string
}
```

#### encounter.fled / encounter.fainted / encounter.expired
```typescript
{
  category: "gameplay",
  eventType: "encounter.fled" | "encounter.fainted" | "encounter.expired",
  severity: "info",
  data: {
    encounterId: string,
    speciesId: number,
    speciesName: string,
    level: number,
    attempts: number,
    duration_ms: number
  },
  relatedEntityType: "Encounter",
  relatedEntityId: string
}
```

### Engagement Events

#### login
```typescript
{
  category: "engagement",
  eventType: "login",
  severity: "info",
  data: {
    platform: "discord" | "web" | "mobile",
    time_since_last_login_hours?: number,
    daily_streak_continued: boolean
  },
  sessionId: string,
  ipAddress: string, // Hashed
  userAgent: string
}
```

#### daily_quest.completed
```typescript
{
  category: "engagement",
  eventType: "daily_quest.completed",
  severity: "info",
  data: {
    questType: string,
    streakDays: number,
    rewardCoins: number,
    rewardItems?: Array<{itemId: number, quantity: number}>,
    completionTime_ms: number
  }
}
```

#### achievement.unlocked
```typescript
{
  category: "engagement",
  eventType: "achievement.unlocked",
  severity: "info",
  data: {
    achievementId: number,
    achievementSlug: string,
    achievementName: string,
    category: string,
    rarity: "common" | "rare" | "epic" | "legendary",
    rewardCoins: number,
    progress: number,
    timeToUnlock_hours: number
  },
  relatedEntityType: "Achievement",
  relatedEntityId: string
}
```

### Economy Events

#### coins.earned
```typescript
{
  category: "economy",
  eventType: "coins.earned",
  severity: "info",
  data: {
    amount: number,
    source: "battle" | "daily_quest" | "achievement" | "sale" | "admin_grant",
    sourceId?: string,
    balanceBefore: number,
    balanceAfter: number
  }
}
```

#### coins.spent
```typescript
{
  category: "economy",
  eventType: "coins.spent",
  severity: "info",
  data: {
    amount: number,
    purpose: "item_purchase" | "evolution_item" | "name_change" | "other",
    itemId?: number,
    itemName?: string,
    balanceBefore: number,
    balanceAfter: number
  }
}
```

#### item.purchased
```typescript
{
  category: "economy",
  eventType: "item.purchased",
  severity: "info",
  data: {
    itemId: number,
    itemName: string,
    quantity: number,
    pricePerUnit: number,
    totalCost: number,
    currency: "coins" | "premium_coins"
  }
}
```

#### item.used
```typescript
{
  category: "economy",
  eventType: "item.used",
  severity: "info",
  data: {
    itemId: number,
    itemName: string,
    quantity: number,
    targetPokemonId?: string,
    effect?: string,
    success: boolean
  },
  relatedEntityType?: "PokemonInstance",
  relatedEntityId?: string
}
```

### Social Events

#### profile.updated
```typescript
{
  category: "social",
  eventType: "profile.updated",
  severity: "info",
  data: {
    fields: string[], // ["nickname", "bio", "avatar_url"]
    previousValues?: Record<string, any>,
    newValues?: Record<string, any>
  }
}
```

#### friend.added
```typescript
{
  category: "social",
  eventType: "friend.added",
  severity: "info",
  data: {
    friendId: string,
    friendNickname: string,
    method: "friend_code" | "discord" | "battle"
  }
}
```

### System Events

#### error.occurred
```typescript
{
  category: "system",
  eventType: "error.occurred",
  severity: "error" | "critical",
  data: {
    errorType: string,
    errorMessage: string,
    stackTrace?: string, // Truncated to 500 chars
    context?: Record<string, any>,
    endpoint?: string,
    duration_ms?: number
  }
}
```

#### performance.slow_query
```typescript
{
  category: "system",
  eventType: "performance.slow_query",
  severity: "warning",
  data: {
    queryType: string,
    duration_ms: number,
    threshold_ms: number,
    table?: string,
    endpoint?: string
  }
}
```

#### cache.miss
```typescript
{
  category: "system",
  eventType: "cache.miss",
  severity: "info",
  data: {
    cacheKey: string,
    namespace: string,
    fallbackUsed: boolean,
    fetchDuration_ms: number
  }
}
```

### Admin Events

#### user.moderated
```typescript
{
  category: "admin",
  eventType: "user.moderated",
  severity: "warning",
  data: {
    moderatorId: string,
    moderatorName: string,
    action: "warn" | "mute" | "ban" | "unban",
    reason: string,
    duration_hours?: number,
    previousOffenses: number
  }
}
```

## Privacy & PII Handling

### PII Fields

The following event data fields are considered PII and must be handled carefully:

- `ipAddress` — Always hashed before storage
- `userAgent` — Stored in full, but considered semi-sensitive
- `email` — Never store in events; use userId only
- `discord username` — Avoid if possible; use nickname instead

### Hashing IP Addresses

IP addresses are hashed using SHA-256 with a daily rotating salt:

```typescript
function hashIpAddress(ip: string): string {
  const salt = getDailySalt(); // Rotates at midnight UTC
  return crypto
    .createHash('sha256')
    .update(ip + salt)
    .digest('hex')
    .substring(0, 16); // First 16 chars sufficient for uniqueness
}
```

### Data Retention by Category

Events automatically expire based on category and severity:

```typescript
const RETENTION_POLICIES = {
  gameplay: {
    info: null, // Indefinite
    warning: 365, // 1 year
    error: 365,
    critical: null
  },
  engagement: {
    info: 90, // 90 days
    warning: 180,
    error: 365,
    critical: null
  },
  economy: {
    info: 365, // 1 year for audit trail
    warning: 365,
    error: 365,
    critical: null
  },
  social: {
    info: 90,
    warning: 180,
    error: 365,
    critical: null
  },
  system: {
    info: 30, // Short retention for high volume
    warning: 90,
    error: 365,
    critical: null // Keep critical system errors indefinitely
  },
  admin: {
    info: null, // Audit trail - keep indefinitely
    warning: null,
    error: null,
    critical: null
  }
};
```

### Cleanup Job

A scheduled job runs daily to purge expired events:

```sql
DELETE FROM "UserEvent"
WHERE retain_until IS NOT NULL 
  AND retain_until < NOW()
RETURNING category, COUNT(*) as deleted_count;
```

## Event Batching Strategy

To reduce database load, events are batched before persistence:

### Batch Configuration

```typescript
const BATCH_CONFIG = {
  maxBatchSize: 100, // Max events per batch
  maxBatchDelay_ms: 5000, // Max time to wait before flushing
  criticalFlushImmediate: true, // Critical events bypass batching
};
```

### In-Memory Buffer

Events are held in memory before batch insert:

```typescript
interface EventBatch {
  events: UserEvent[];
  firstEventTime: Date;
  size: number;
}

class EventBuffer {
  private batches: Map<string, EventBatch> = new Map();
  
  add(event: UserEvent): void {
    if (event.severity === 'critical') {
      this.flushImmediate(event);
      return;
    }
    
    const key = `${event.userId}-${event.category}`;
    const batch = this.batches.get(key) || this.createBatch();
    
    batch.events.push(event);
    batch.size++;
    
    if (batch.size >= BATCH_CONFIG.maxBatchSize) {
      this.flush(key);
    }
  }
  
  private async flush(key: string): Promise<void> {
    const batch = this.batches.get(key);
    if (!batch || batch.size === 0) return;
    
    await prisma.userEvent.createMany({
      data: batch.events,
      skipDuplicates: true
    });
    
    this.batches.delete(key);
  }
}
```

## Usage Examples

### Tracking a Battle Victory

```typescript
import { EventTracker } from '../services/events';

async function recordBattleVictory(battle: Battle, winner: User): Promise<void> {
  await EventTracker.track({
    userId: winner.id,
    category: 'gameplay',
    eventType: 'battle.won',
    severity: 'info',
    data: {
      battleId: battle.id,
      opponentId: battle.p1Id === winner.id ? battle.p2Id : battle.p1Id,
      opponentName: '...', // Fetched from User
      turns: battle.resultJson.turns,
      duration_ms: battle.resultJson.duration_ms,
      pokemon_fainted: battle.resultJson.pokemon_fainted,
      experience_gained: battle.resultJson.exp_gained,
      coins_earned: battle.resultJson.coins_earned
    },
    relatedEntityType: 'Battle',
    relatedEntityId: battle.id,
    sessionId: getCurrentSessionId()
  });
}
```

### Tracking Achievement Unlock

```typescript
async function unlockAchievement(
  user: User,
  achievement: Achievement,
  progress: number
): Promise<void> {
  await EventTracker.track({
    userId: user.id,
    category: 'engagement',
    eventType: 'achievement.unlocked',
    severity: 'info',
    data: {
      achievementId: achievement.id,
      achievementSlug: achievement.slug,
      achievementName: achievement.name,
      category: achievement.category,
      rarity: achievement.rarity,
      rewardCoins: achievement.coinReward,
      progress: progress,
      timeToUnlock_hours: calculateTimeToUnlock(user.id, achievement.id)
    },
    relatedEntityType: 'Achievement',
    relatedEntityId: achievement.id.toString()
  });
}
```

### Tracking System Errors

```typescript
async function handleError(error: Error, context: any, user?: User): Promise<void> {
  await EventTracker.track({
    userId: user?.id || 'system',
    category: 'system',
    eventType: 'error.occurred',
    severity: error.name === 'CriticalError' ? 'critical' : 'error',
    data: {
      errorType: error.name,
      errorMessage: error.message,
      stackTrace: error.stack?.substring(0, 500),
      context: sanitizeContext(context),
      endpoint: context.endpoint,
      duration_ms: context.duration_ms
    }
  });
}
```

## Query Patterns

### User Activity Timeline

```sql
SELECT 
  event_type,
  occurred_at,
  data,
  severity
FROM "UserEvent"
WHERE user_id = $1
  AND category = 'gameplay'
  AND occurred_at > NOW() - INTERVAL '7 days'
ORDER BY occurred_at DESC
LIMIT 50;
```

### Achievement Progress Tracking

```sql
SELECT 
  data->>'achievementId' as achievement_id,
  data->>'achievementName' as achievement_name,
  data->>'progress' as progress,
  occurred_at
FROM "UserEvent"
WHERE user_id = $1
  AND event_type = 'achievement.unlocked'
ORDER BY occurred_at DESC;
```

### Error Rate Monitoring

```sql
SELECT 
  DATE_TRUNC('hour', occurred_at) as hour,
  COUNT(*) as error_count,
  COUNT(DISTINCT user_id) as affected_users,
  array_agg(DISTINCT data->>'errorType') as error_types
FROM "UserEvent"
WHERE category = 'system'
  AND severity IN ('error', 'critical')
  AND occurred_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', occurred_at)
ORDER BY hour DESC;
```

### Top Active Users (Last 24 Hours)

```sql
SELECT 
  user_id,
  COUNT(*) as event_count,
  COUNT(DISTINCT session_id) as sessions,
  MIN(occurred_at) as first_activity,
  MAX(occurred_at) as last_activity
FROM "UserEvent"
WHERE occurred_at > NOW() - INTERVAL '24 hours'
  AND category IN ('gameplay', 'engagement')
GROUP BY user_id
ORDER BY event_count DESC
LIMIT 100;
```

## TypeScript Type Definitions

```typescript
// Event payload types
export type GameplayEventData = 
  | BattleStartedData
  | BattleWonData
  | BattleLostData
  | PokemonCaughtData
  | PokemonEvolvedData
  | EncounterSpawnedData
  | EncounterFledData;

export type EngagementEventData =
  | LoginData
  | DailyQuestCompletedData
  | AchievementUnlockedData;

export type EconomyEventData =
  | CoinsEarnedData
  | CoinsSpentData
  | ItemPurchasedData
  | ItemUsedData;

export type EventData = 
  | GameplayEventData
  | EngagementEventData
  | EconomyEventData
  | SocialEventData
  | SystemEventData
  | AdminEventData;

export interface CreateEventInput {
  userId: string;
  category: EventCategory;
  eventType: string;
  severity?: EventSeverity;
  data?: EventData;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}
```

---

**Related Documents:**
- `prisma/schema-northstar.prisma` — Database schema with UserEvent table
- `docs/schema-northstar-optimization.md` — Overall optimization plan
- `src/services/events/` — Event tracking service implementation
- `src/services/events/schemas/` — JSON schema validators

**Revision History:**
- 2025-11-06T16:30:00Z — Initial version (Rev 1.0)
