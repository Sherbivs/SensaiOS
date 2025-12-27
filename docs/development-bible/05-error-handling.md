# Section 5: Error Handling

**Last Updated**: 2025-12-27 | **Status**: Production

[← Back to INDEX](INDEX.md) | [← Previous: Performance](04-performance.md) | [Next: Console Tooling →](06-console-tooling.md)

---

**Philosophy**: "Errors are data—capture them, categorize them, learn from them."

**Purpose**: Error boundaries, domain-specific handlers, recovery workflows.

## 5.1 Error Boundaries

### Multi-Tier Error Detection

**Three-Layer Architecture:**

1. **Discord Bot Layer** (`src/bot/bot-error-handler.ts`)
   - Catches: Discord API errors, rate limits, timeouts, permission failures
   - Action: User-facing error messages, graceful degradation, retry logic

2. **Engine Layer** (`src/core/engine-error-handler.ts`)
   - Catches: Battle engine errors, encounter spawning failures, data validation
   - Action: Safe state rollback, error logging, telemetry

3. **Worker Layer** (`src/workers/worker-error-handler.ts`)
   - Catches: Background job failures, async message delivery errors
   - Action: Job retry with exponential backoff, DLQ for permanent failures

**Integration:** All handlers feed into `ErrorTracker` (`src/services/monitoring/error-tracker.ts`) for centralized aggregation.

### Discord Bot Error Handler

**Implementation:**
```typescript
// src/bot/bot-error-handler.ts
import { ErrorTracker } from '../services/error-tracker.js';

export class DiscordBotErrorHandler {
  static async handleInteractionError(error: Error, interaction: Interaction) {
    // Record error for observability
    ErrorTracker.getInstance().recordError({
      service: 'discord-bot',
      severity: 'error',
      message: error.message,
      stack: error.stack,
      context: {
        commandName: interaction.commandName,
        userId: interaction.user.id,
        guildId: interaction.guildId
      }
    });

    // User-facing error message
    if (error instanceof DiscordAPIError) {
      if (error.code === 50013) { // Missing Permissions
        await interaction.reply({
          content: "❌ I don't have permission to do that.",
          ephemeral: true
        });
      } else if (error.code === 10062) { // Unknown Interaction
        // Interaction expired, log but don't reply
        log.warn("Interaction expired", { interactionId: interaction.id });
      }
    } else {
      // Generic error fallback
      await interaction.reply({
        content: "❌ Something went wrong. Try again later.",
        ephemeral: true
      });
    }
  }

  static async handleRateLimit(rateLimitInfo: RateLimitData) {
    log.warn("Rate limit hit", {
      timeout: rateLimitInfo.timeout,
      limit: rateLimitInfo.limit,
      route: rateLimitInfo.route
    });

    // Pause operations until rate limit expires
    await sleep(rateLimitInfo.timeout);
  }
}
```

### Engine Error Handler

**Implementation:**
```typescript
// src/core/engine-error-handler.ts
export class EngineErrorHandler {
  static handleBattleError(error: Error, battleState: BattleState) {
    ErrorTracker.getInstance().recordError({
      service: 'battle-engine',
      severity: 'error',
      message: error.message,
      stack: error.stack,
      context: {
        battleId: battleState.id,
        turn: battleState.turn,
        attacker: battleState.attacker.species,
        defender: battleState.defender.species
      }
    });

    // Rollback to last safe state
    const lastSafeState = battleState.history[battleState.history.length - 1];
    return lastSafeState;
  }

  static handleEncounterError(error: Error, trainerId: string) {
    ErrorTracker.getInstance().recordError({
      service: 'encounter-system',
      severity: 'error',
      message: error.message,
      stack: error.stack,
      context: { trainerId }
    });

    // Return safe default (no encounter)
    return null;
  }
}
```

### Worker Error Handler

**Implementation:**
```typescript
// src/workers/worker-error-handler.ts
export class WorkerErrorHandler {
  static async handleJobError(error: Error, job: Job, attempt: number) {
    ErrorTracker.getInstance().recordError({
      service: 'outbox-worker',
      severity: 'error',
      message: error.message,
      stack: error.stack,
      context: {
        jobId: job.id,
        attempt,
        maxAttempts: job.maxAttempts
      }
    });

    // Retry with exponential backoff
    if (attempt < job.maxAttempts) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 60000); // Max 60s
      await sleep(delay);
      return { retry: true, delay };
    } else {
      // Move to dead letter queue
      await moveToDLQ(job);
      return { retry: false };
    }
  }
}
```

## 5.2 Stuckness Detection

**Agent considered stuck if:**
- No artifact/state change in 3 consecutive steps
- Same error string seen ≥2 times in 10 minutes
- Budget exceeded (time > 15m or tokens > threshold)

**Recovery Steps (In Order):**

1. **Shrink the Step** — Narrow scope, reduce toolset
2. **Swap Strategy** — Change search terms, alternate tool, or prompt template
3. **Reset Context** — Clear ephemeral memory, keep breadcrumb log
4. **Escalate** — Use `playbooks/escalate.md`, open Issue, summarize state

### Stuckness Detector Implementation

```typescript
// src/services/stuckness-detector.ts
export class StucknessDetector {
  private history: StepOutcome[] = [];
  private errorCounts = new Map<string, number>();

  recordStep(outcome: StepOutcome) {
    this.history.push(outcome);

    // Limit history to last 10 steps
    if (this.history.length > 10) {
      this.history.shift();
    }

    // Track error frequencies
    if (outcome.error) {
      const count = this.errorCounts.get(outcome.error) || 0;
      this.errorCounts.set(outcome.error, count + 1);
    }
  }

  isStuck(): boolean {
    // No state change in 3 consecutive steps
    const lastThree = this.history.slice(-3);
    if (lastThree.every(s => !s.stateChanged)) {
      return true;
    }

    // Same error ≥2 times in last 10 minutes
    for (const [error, count] of this.errorCounts) {
      if (count >= 2) {
        const firstOccurrence = this.history.find(s => s.error === error);
        const lastOccurrence = this.history.findLast(s => s.error === error);
        const timeDiff = lastOccurrence.timestamp - firstOccurrence.timestamp;
        
        if (timeDiff < 10 * 60 * 1000) { // 10 minutes
          return true;
        }
      }
    }

    return false;
  }

  getRecoveryStrategy(): RecoveryAction {
    const recentErrors = this.history.filter(s => s.error).slice(-3);

    if (recentErrors.length === 0) {
      return { type: 'shrink-scope', reason: 'No progress made' };
    }

    const uniqueErrors = new Set(recentErrors.map(s => s.error));
    if (uniqueErrors.size === 1) {
      return { type: 'swap-strategy', reason: 'Same error repeated' };
    }

    return { type: 'reset-context', reason: 'Multiple different errors' };
  }
}
```

---

[← Back to INDEX](INDEX.md) | [← Previous: Performance](04-performance.md) | [Next: Console Tooling →](06-console-tooling.md)