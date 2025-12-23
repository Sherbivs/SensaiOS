# Architecture Blueprint — Specialist Panel Meeting #2

**Date:** 2025-12-23 (Accelerated from 2025-12-30)  
**Format:** Technical Deep-Dive Session  
**Chair:** Blake (Documentation Lead)  
**Scribe:** GitHub Copilot (Claude Opus 4.5)  
**Status:** IN PROGRESS

---

## Attendance

| Specialist | Role | Status |
|------------|------|--------|
| 🏗️ **Aria** | Backend Architect | ✅ Present |
| ⚙️ **Devon** | DevOps Engineer | ✅ Present |
| 🎮 **Kai** | Game Engine Developer | ✅ Present |
| 🤖 **Morgan** | Discord Bot Specialist | ✅ Present |
| 🗄️ **River** | Database Specialist | ✅ Present |
| 🧪 **Quinn** | Testing Specialist | ✅ Present |
| 📚 **Blake** | Documentation Lead | ✅ Present (Chair) |

---

## Agenda

1. ✅ Review RNG Module Specification (Kai)
2. ✅ Finalize BattleContext Pattern (Kai + Aria)
3. ✅ Approve Health Check Implementation (Devon)
4. ✅ ADR Template Review (Blake)
5. 🆕 Discord Interaction Patterns (Morgan)
6. 🆕 Database Migration Safety Checklist (River)
7. 🆕 Test Infrastructure Proposal (Quinn)

---

## Item 1: RNG Module Specification

**Presenter:** 🎮 Kai (Game Engine Developer)

### Specification Document

```typescript
/**
 * @module core/rng
 * @description Deterministic pseudo-random number generation for PBSL compatibility
 * 
 * Requirements:
 * 1. Reproducible sequences from seed
 * 2. State can be serialized/deserialized
 * 3. Thread-safe (no global state)
 * 4. Fast (sub-microsecond per call)
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Immutable RNG state using xorshift128+ algorithm
 * Chosen for: speed, statistical quality, simple state
 */
export interface RNGState {
  readonly s0: bigint;  // 64-bit state part 1
  readonly s1: bigint;  // 64-bit state part 2
}

/**
 * Seed can be number, string, or explicit state
 */
export type RNGSeed = number | string | RNGState;

// ============================================================================
// CORE FUNCTIONS (PURE)
// ============================================================================

/**
 * Create initial state from seed
 * @param seed - Number, string, or explicit state
 * @returns Initial RNG state
 * 
 * @example
 * const state = createRNG(12345);
 * const state2 = createRNG('battle-abc-123');
 * const state3 = createRNG({ s0: 1n, s1: 2n });
 */
export function createRNG(seed: RNGSeed): RNGState;

/**
 * Generate next random value and state
 * @param state - Current RNG state
 * @returns [value 0-1, next state]
 * 
 * @example
 * const [value, next] = nextRandom(state);
 * // value is in [0, 1)
 * // next is new state for subsequent calls
 */
export function nextRandom(state: RNGState): [number, RNGState];

/**
 * Generate random integer in range [min, max] inclusive
 * @param state - Current RNG state
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @returns [value, next state]
 * 
 * @example
 * const [roll, next] = randomInt(state, 1, 100);
 * // roll is integer from 1 to 100
 */
export function randomInt(state: RNGState, min: number, max: number): [number, RNGState];

/**
 * Generate boolean with given probability
 * @param state - Current RNG state  
 * @param probability - Chance of true (0-1)
 * @returns [result, next state]
 * 
 * @example
 * // Critical hit: 1/16 chance (6.25%)
 * const [isCrit, next] = randomChance(state, 1/16);
 */
export function randomChance(state: RNGState, probability: number): [boolean, RNGState];

/**
 * Select random element from array
 * @param state - Current RNG state
 * @param array - Non-empty array
 * @returns [selected element, next state]
 * 
 * @example
 * const [move, next] = randomChoice(state, pokemon.moves);
 */
export function randomChoice<T>(state: RNGState, array: readonly T[]): [T, RNGState];

/**
 * Shuffle array (Fisher-Yates)
 * @param state - Current RNG state
 * @param array - Array to shuffle
 * @returns [shuffled copy, next state]
 * 
 * @example
 * const [turnOrder, next] = randomShuffle(state, participants);
 */
export function randomShuffle<T>(state: RNGState, array: readonly T[]): [T[], RNGState];

// ============================================================================
// SERIALIZATION
// ============================================================================

/**
 * Serialize state to string (for database storage)
 * @param state - RNG state
 * @returns Base64-encoded state
 */
export function serializeRNG(state: RNGState): string;

/**
 * Deserialize state from string
 * @param serialized - Base64-encoded state
 * @returns RNG state
 */
export function deserializeRNG(serialized: string): RNGState;

// ============================================================================
// POKEMON-SPECIFIC HELPERS
// ============================================================================

/**
 * Pokemon damage roll (0.85-1.00 multiplier)
 * @param state - Current RNG state
 * @returns [multiplier, next state]
 */
export function damageRoll(state: RNGState): [number, RNGState];

/**
 * Accuracy check with Pokemon formula
 * @param state - Current RNG state
 * @param accuracy - Move accuracy (0-100)
 * @param evasionStage - Target evasion stage (-6 to +6)
 * @param accuracyStage - Attacker accuracy stage (-6 to +6)
 * @returns [hits, next state]
 */
export function accuracyCheck(
  state: RNGState,
  accuracy: number,
  evasionStage: number,
  accuracyStage: number
): [boolean, RNGState];

/**
 * Critical hit check
 * @param state - Current RNG state
 * @param critStage - Critical hit stage (0-4)
 * @returns [isCrit, next state]
 */
export function criticalCheck(state: RNGState, critStage: number): [boolean, RNGState];

/**
 * Secondary effect proc check
 * @param state - Current RNG state
 * @param chance - Effect chance (0-100)
 * @returns [procs, next state]
 */
export function secondaryEffectCheck(state: RNGState, chance: number): [boolean, RNGState];
```

### Implementation Notes

**Kai:** I've chosen **xorshift128+** for several reasons:

1. **Speed:** ~1.5ns per call (faster than Mersenne Twister)
2. **Quality:** Passes BigCrush statistical tests
3. **State size:** Only 128 bits (easy to serialize)
4. **Simplicity:** Can implement in ~20 lines

```typescript
// Reference implementation
function xorshift128plus(state: RNGState): [bigint, RNGState] {
  let s1 = state.s0;
  const s0 = state.s1;
  
  s1 ^= s1 << 23n;
  s1 ^= s1 >> 17n;
  s1 ^= s0;
  s1 ^= s0 >> 26n;
  
  return [
    (state.s0 + state.s1) & ((1n << 64n) - 1n),
    { s0, s1 }
  ];
}
```

### Discussion

> **🏗️ Aria:** How do we ensure the RNG state is always passed through correctly? One missed propagation breaks determinism.

> **🎮 Kai:** That's why I'm proposing it be part of BattleContext (next item). The context is immutable and returned from every function:
> ```typescript
> function applyMove(ctx: BattleContext, ...): [Result, BattleContext] {
>   const [hits, ctx2] = accuracyCheck(ctx.rng, move.accuracy, ...);
>   // ctx2 has updated RNG state
>   return [result, { ...ctx, rng: ctx2.rng }];
> }
> ```

> **🧪 Quinn:** For PBSL tests, can we create "canned" RNG sequences?

> **🎮 Kai:** Absolutely. We can create a `fixedRNG` helper:
> ```typescript
> function createFixedRNG(values: number[]): RNGState {
>   // Returns a mock state that yields predetermined values
>   // For testing specific scenarios
> }
> ```

### Vote

| Specialist | Vote |
|------------|------|
| 🏗️ Aria | ✅ Approve |
| ⚙️ Devon | ✅ Approve |
| 🎮 Kai | ✅ Approve |
| 🤖 Morgan | ✅ Approve |
| 🗄️ River | ✅ Approve |
| 🧪 Quinn | ✅ Approve |
| 📚 Blake | ✅ Approve |

**Result:** ✅ **APPROVED** (7/7)

---

## Item 2: BattleContext Pattern

**Presenters:** 🎮 Kai + 🏗️ Aria

### Specification

```typescript
/**
 * @module core/battle/context
 * @description Immutable context carrying battle-scoped state
 * 
 * Design Principles:
 * 1. Immutable - every function returns new context
 * 2. Complete - all battle state in one place
 * 3. Serializable - can save/restore battles
 * 4. Traceable - correlation IDs for debugging
 */

// ============================================================================
// CONTEXT TYPE
// ============================================================================

export interface BattleContext {
  /** Battle identifier (UUID) */
  readonly battleId: string;
  
  /** Correlation ID for tracing (from Discord interaction) */
  readonly correlationId: string;
  
  /** Parent correlation ID (if this is a sub-operation) */
  readonly parentCorrelationId?: string;
  
  /** Current RNG state */
  readonly rng: RNGState;
  
  /** Battle start timestamp */
  readonly startedAt: Date;
  
  /** Current turn number (1-indexed) */
  readonly turn: number;
  
  /** Current phase within turn */
  readonly phase: BattlePhase;
  
  /** Accumulated events this turn (for replay) */
  readonly events: readonly BattleEvent[];
  
  /** Feature flags active for this battle */
  readonly features: BattleFeatureFlags;
}

export type BattlePhase =
  | 'AWAITING_ACTIONS'
  | 'PRIORITY_RESOLUTION'
  | 'MOVE_EXECUTION'
  | 'DAMAGE_APPLICATION'
  | 'EFFECT_APPLICATION'
  | 'FAINT_CHECK'
  | 'SWITCH_REQUIRED'
  | 'TURN_END'
  | 'BATTLE_END';

export interface BattleFeatureFlags {
  readonly enableCrits: boolean;
  readonly enableMisses: boolean;
  readonly enableSecondaryEffects: boolean;
  readonly enableWeather: boolean;
  readonly maxTurns: number;
}

// ============================================================================
// CONTEXT CREATION
// ============================================================================

export interface CreateBattleContextOptions {
  battleId?: string;
  correlationId: string;
  seed?: RNGSeed;
  features?: Partial<BattleFeatureFlags>;
}

/**
 * Create new battle context
 */
export function createBattleContext(options: CreateBattleContextOptions): BattleContext;

/**
 * Create child context (for sub-operations)
 */
export function createChildContext(
  parent: BattleContext,
  operation: string
): BattleContext;

// ============================================================================
// CONTEXT UPDATES (IMMUTABLE)
// ============================================================================

/**
 * Advance RNG state
 */
export function advanceRNG(ctx: BattleContext): [number, BattleContext];

/**
 * Record event
 */
export function recordEvent(ctx: BattleContext, event: BattleEvent): BattleContext;

/**
 * Advance to next phase
 */
export function advancePhase(ctx: BattleContext, phase: BattlePhase): BattleContext;

/**
 * Advance to next turn
 */
export function advanceTurn(ctx: BattleContext): BattleContext;

// ============================================================================
// SERIALIZATION
// ============================================================================

/**
 * Serialize context for database storage
 */
export function serializeContext(ctx: BattleContext): string;

/**
 * Deserialize context from storage
 */
export function deserializeContext(data: string): BattleContext;
```

### Usage Example

```typescript
// In battle service
async function processTurn(
  battle: Battle,
  playerAction: BattleAction,
  opponentAction: BattleAction
): Promise<TurnResult> {
  // Get or create context
  let ctx = battle.context ?? createBattleContext({
    correlationId: interaction.id,
    seed: battle.id, // Deterministic from battle ID
  });
  
  // Resolve priority
  ctx = advancePhase(ctx, 'PRIORITY_RESOLUTION');
  const [first, ctx2] = determinePriority(ctx, playerAction, opponentAction);
  ctx = ctx2;
  
  // Execute first action
  ctx = advancePhase(ctx, 'MOVE_EXECUTION');
  const [result1, ctx3] = executeAction(ctx, battle, first);
  ctx = ctx3;
  battle = applyResult(battle, result1);
  
  // Check for faint
  ctx = advancePhase(ctx, 'FAINT_CHECK');
  if (isFainted(battle.defender)) {
    ctx = advancePhase(ctx, 'BATTLE_END');
    return { battle, ctx, winner: first.owner };
  }
  
  // Execute second action
  const [result2, ctx4] = executeAction(ctx, battle, second);
  ctx = ctx4;
  battle = applyResult(battle, result2);
  
  // Advance turn
  ctx = advanceTurn(ctx);
  
  return { battle, ctx, winner: null };
}
```

### Discussion

> **🗄️ River:** Should we store the full context in the database, or just the RNG state?

> **🎮 Kai:** Full context. It's only ~500 bytes serialized and gives us:
> - Battle replay capability
> - Debugging audit trail
> - State recovery if crash occurs mid-battle

> **🏗️ Aria:** I want to emphasize the **immutable return pattern**. Every function that touches context MUST return new context:
> ```typescript
> // ❌ WRONG - mutates context
> function badFunction(ctx: BattleContext) {
>   ctx.turn++;  // TypeScript won't allow, but principle matters
> }
> 
> // ✅ CORRECT - returns new context
> function goodFunction(ctx: BattleContext): BattleContext {
>   return { ...ctx, turn: ctx.turn + 1 };
> }
> ```

> **🤖 Morgan:** How does the context flow from Discord interactions?

> **🏗️ Aria:** The correlation ID comes from Discord:
> ```typescript
> async function handleBattleButton(interaction: ButtonInteraction) {
>   const battle = await getBattle(interaction.customId);
>   const ctx = deserializeContext(battle.contextData) ?? 
>     createBattleContext({ correlationId: interaction.id });
>   
>   // Process with context
>   const result = await processTurn(battle, action, ctx);
>   
>   // Save updated context
>   await saveBattle(battle.id, { 
>     contextData: serializeContext(result.ctx) 
>   });
> }
> ```

### Vote

| Specialist | Vote |
|------------|------|
| 🏗️ Aria | ✅ Approve |
| ⚙️ Devon | ✅ Approve |
| 🎮 Kai | ✅ Approve |
| 🤖 Morgan | ✅ Approve |
| 🗄️ River | ✅ Approve |
| 🧪 Quinn | ✅ Approve |
| 📚 Blake | ✅ Approve |

**Result:** ✅ **APPROVED** (7/7)

---

## Item 3: Health Check Implementation

**Presenter:** ⚙️ Devon (DevOps Engineer)

### Specification

```typescript
/**
 * @module infrastructure/health
 * @description Health check endpoints for Render and monitoring
 */

// ============================================================================
// TYPES
// ============================================================================

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: Record<string, ComponentHealth>;
}

export interface ComponentHealth {
  status: 'up' | 'down' | 'degraded';
  latency?: number;
  message?: string;
  lastCheck: string;
}

// ============================================================================
// HEALTH CHECKS
// ============================================================================

/**
 * Kubernetes-style liveness probe
 * Returns 200 if process is running
 * Used by: Render to detect hung processes
 */
export async function livenessCheck(): Promise<{ alive: boolean }>;

/**
 * Kubernetes-style readiness probe
 * Returns 200 only if ready to accept traffic
 * Used by: Render during deploy, load balancer
 */
export async function readinessCheck(): Promise<HealthStatus>;

/**
 * Detailed health for monitoring dashboards
 * Returns full component breakdown
 * Used by: Grafana, alerting
 */
export async function detailedHealth(): Promise<HealthStatus>;

// ============================================================================
// COMPONENT CHECKS
// ============================================================================

export async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'up',
      latency: Date.now() - start,
      lastCheck: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'down',
      message: error.message,
      lastCheck: new Date().toISOString(),
    };
  }
}

export async function checkDiscord(): Promise<ComponentHealth> {
  const client = getDiscordClient();
  if (!client.isReady()) {
    return { status: 'down', message: 'Not connected', lastCheck: new Date().toISOString() };
  }
  
  const latency = client.ws.ping;
  return {
    status: latency < 500 ? 'up' : 'degraded',
    latency,
    lastCheck: new Date().toISOString(),
  };
}

export async function checkCache(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const testKey = `health-check-${Date.now()}`;
    await cache.set(testKey, 'test', 1000);
    const value = await cache.get(testKey);
    await cache.delete(testKey);
    
    return {
      status: value === 'test' ? 'up' : 'degraded',
      latency: Date.now() - start,
      lastCheck: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'down',
      message: error.message,
      lastCheck: new Date().toISOString(),
    };
  }
}

export async function checkEventBus(): Promise<ComponentHealth> {
  // Check queue depths and processing rates
  const stats = eventBus.getStats();
  
  if (stats.deadLetterCount > 100) {
    return {
      status: 'degraded',
      message: `${stats.deadLetterCount} dead letters`,
      lastCheck: new Date().toISOString(),
    };
  }
  
  return {
    status: 'up',
    latency: stats.avgProcessingTime,
    lastCheck: new Date().toISOString(),
  };
}

// ============================================================================
// HTTP ENDPOINTS
// ============================================================================

/**
 * Express/Fastify route handlers
 */
export const healthRoutes = {
  // Render checks this every 30 seconds
  '/health': async (req, res) => {
    const health = await readinessCheck();
    const status = health.status === 'healthy' ? 200 : 
                   health.status === 'degraded' ? 200 : 503;
    res.status(status).json(health);
  },
  
  // Simple liveness (always 200 if process running)
  '/health/live': (req, res) => {
    res.json({ alive: true, timestamp: new Date().toISOString() });
  },
  
  // Readiness (200 only if ready for traffic)
  '/health/ready': async (req, res) => {
    const health = await readinessCheck();
    res.status(health.status === 'healthy' ? 200 : 503).json(health);
  },
  
  // Detailed (for dashboards)
  '/health/detailed': async (req, res) => {
    const health = await detailedHealth();
    res.json(health);
  },
};
```

### Render Configuration

```yaml
# infrastructure/render/render.yaml
services:
  - type: worker
    name: infinity-gauntlet-bot
    healthCheckPath: /health
    # Render will:
    # - Check /health every 30s
    # - Mark unhealthy after 3 consecutive failures
    # - Restart unhealthy instances
```

### Grafana Integration

```typescript
// Prometheus metrics for Grafana
export const healthMetrics = {
  // Gauge: current health status (0=down, 1=degraded, 2=up)
  componentHealth: new Gauge({
    name: 'component_health_status',
    help: 'Health status of each component',
    labelNames: ['component'],
  }),
  
  // Histogram: health check latency
  checkLatency: new Histogram({
    name: 'health_check_latency_seconds',
    help: 'Time to complete health check',
    labelNames: ['component'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  }),
};
```

### Discussion

> **🗄️ River:** Should database health check use a simple `SELECT 1` or actually query a table?

> **⚙️ Devon:** `SELECT 1` is sufficient for connection health. If we need to verify data integrity, that's a separate monitoring concern:
> ```typescript
> // Health check: Is database reachable?
> await prisma.$queryRaw`SELECT 1`;
> 
> // Integrity check (separate, less frequent):
> await prisma.$queryRaw`SELECT COUNT(*) FROM "User"`;
> ```

> **🤖 Morgan:** What's the Discord "degraded" threshold of 500ms based on?

> **⚙️ Devon:** Discord's API SLA. Above 500ms ping usually indicates:
> - Network issues
> - API rate limiting
> - Discord outage
> 
> We want to surface this in monitoring but not mark ourselves "unhealthy" for Discord's problems.

> **🏗️ Aria:** I notice there's no circuit breaker. Should health checks fail-fast if a component is known-down?

> **⚙️ Devon:** Good point. We should cache negative results:
> ```typescript
> const healthCache = new Map<string, { result: ComponentHealth; expires: number }>();
> 
> async function cachedCheck(name: string, check: () => Promise<ComponentHealth>) {
>   const cached = healthCache.get(name);
>   if (cached && Date.now() < cached.expires) {
>     return cached.result;
>   }
>   
>   const result = await check();
>   // Cache failures longer to avoid hammering failing services
>   const ttl = result.status === 'up' ? 5000 : 30000;
>   healthCache.set(name, { result, expires: Date.now() + ttl });
>   return result;
> }
> ```

### Vote

| Specialist | Vote |
|------------|------|
| 🏗️ Aria | ✅ Approve |
| ⚙️ Devon | ✅ Approve |
| 🎮 Kai | ✅ Approve |
| 🤖 Morgan | ✅ Approve |
| 🗄️ River | ✅ Approve |
| 🧪 Quinn | ✅ Approve |
| 📚 Blake | ✅ Approve |

**Result:** ✅ **APPROVED** (7/7)

---

## Item 4: ADR Template

**Presenter:** 📚 Blake (Documentation Lead)

### Template

```markdown
# ADR-{NUMBER}: {TITLE}

**Status:** PROPOSED | ACCEPTED | DEPRECATED | SUPERSEDED  
**Date:** YYYY-MM-DD  
**Authors:** {names}  
**Reviewers:** {names}  
**Supersedes:** ADR-{NUMBER} (if applicable)  
**Superseded by:** ADR-{NUMBER} (if applicable)

---

## Context

{What is the issue that we're seeing that is motivating this decision or change?}

### Current State
{Describe the existing situation}

### Problem Statement
{What specific problem are we solving?}

### Constraints
{What limitations or requirements must we work within?}

---

## Decision

{What is the change that we're proposing and/or doing?}

### Solution Overview
{High-level description of the chosen approach}

### Technical Details
{Code examples, diagrams, specifications}

---

## Alternatives Considered

### Alternative 1: {Name}
**Description:** {Brief description}  
**Pros:**
- {Pro 1}
- {Pro 2}

**Cons:**
- {Con 1}
- {Con 2}

**Why rejected:** {Reason}

### Alternative 2: {Name}
{Same structure}

---

## Consequences

### Positive
- {Benefit 1}
- {Benefit 2}

### Negative
- {Tradeoff 1}
- {Tradeoff 2}

### Risks
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| {Risk 1} | Low/Med/High | Low/Med/High | {Strategy} |

---

## Implementation

### Migration Path
{How do we get from current state to new state?}

### Timeline
| Phase | Duration | Tasks |
|-------|----------|-------|
| Phase 1 | X weeks | {Tasks} |

### Success Metrics
- [ ] {Measurable outcome 1}
- [ ] {Measurable outcome 2}

---

## References

- {Link to related ADRs}
- {Link to external resources}
- {Link to relevant code}
```

### Example: ADR-001

```markdown
# ADR-001: Feature-First Module Organization

**Status:** ACCEPTED  
**Date:** 2025-12-23  
**Authors:** Aria (Backend Architect), Blake (Documentation Lead)  
**Reviewers:** Full Specialist Panel

---

## Context

### Current State
The codebase has 84 files in `src/bot/` scattered across 8+ subdirectories. Understanding a complete feature (e.g., "homestead") requires navigating:
- `src/bot/homestead/` (3 files)
- `src/commands/homestead.ts`
- `src/services/homestead/` (if exists)
- `src/core/trainer/` (domain logic)

### Problem Statement
New developers spend 2+ hours understanding where feature code lives. Code reviews require checking multiple directories. Feature deletion is risky.

### Constraints
- Must maintain backward compatibility during migration
- Cannot break existing functionality
- Must preserve test coverage

---

## Decision

Adopt feature-first organization where each user-facing feature is a self-contained module:

```
features/{name}/
├── {name}.command.ts      # Slash command definition
├── {name}.service.ts      # Business logic
├── {name}.embeds.ts       # Discord embed builders
├── {name}.buttons.ts      # Button handlers
├── {name}.types.ts        # Feature-specific types
└── ROUTER.md              # Feature documentation
```

---

## Alternatives Considered

### Alternative 1: Keep Current Structure
**Why rejected:** Pain points continue to grow with codebase size.

### Alternative 2: Domain-Driven Design
**Why rejected:** Overkill for a Discord bot. DDD adds concepts (aggregates, bounded contexts) that don't map well to our use case.

---

## Consequences

### Positive
- Feature deletion = delete directory
- New developers understand features faster
- Code reviews are localized

### Negative
- Initial migration effort (~4 weeks)
- Some code duplication between features

---

## Implementation

### Timeline
| Phase | Duration | Tasks |
|-------|----------|-------|
| Phase 1 | 1 week | Migrate homestead feature (pilot) |
| Phase 2 | 1 week | Migrate battle feature |
| Phase 3 | 1 week | Migrate wilds, daily, dex |
| Phase 4 | 1 week | Cleanup old structure |

### Success Metrics
- [ ] All features in `features/` directory
- [ ] No cross-feature imports except through services
- [ ] Test coverage maintained at 80%+
```

### ADR Index

```markdown
# Architecture Decision Records

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [001](./001-feature-first-organization.md) | Feature-First Module Organization | ACCEPTED | 2025-12-23 |
| [002](./002-pure-core-domain.md) | Pure Core Domain Pattern | ACCEPTED | 2025-12-23 |
| [003](./003-rng-determinism.md) | RNG Determinism Module | ACCEPTED | 2025-12-23 |
| [004](./004-battle-context-pattern.md) | BattleContext Pattern | ACCEPTED | 2025-12-23 |
| [005](./005-health-check-endpoints.md) | Health Check Endpoints | ACCEPTED | 2025-12-23 |
```

### Vote

| Specialist | Vote |
|------------|------|
| 🏗️ Aria | ✅ Approve |
| ⚙️ Devon | ✅ Approve |
| 🎮 Kai | ✅ Approve |
| 🤖 Morgan | ✅ Approve |
| 🗄️ River | ✅ Approve |
| 🧪 Quinn | ✅ Approve |
| 📚 Blake | ✅ Approve |

**Result:** ✅ **APPROVED** (7/7)

---

## Item 5: Discord Interaction Patterns

**Presenter:** 🤖 Morgan (Discord Bot Specialist)

### Custom ID Strategy

```typescript
/**
 * @module discord/custom-ids
 * @description Structured custom ID system for Discord components
 * 
 * Format: {domain}:{entityId}:{action}:{param}
 * Max length: 100 characters (Discord limit)
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ParsedCustomId {
  domain: string;
  entityId: string;
  action: string;
  param?: string;
  raw: string;
}

// ============================================================================
// BUILDERS
// ============================================================================

export const customId = {
  // Battle interactions
  battle: {
    move: (battleId: string, moveIndex: number) =>
      `battle:${battleId}:move:${moveIndex}`,
    switch: (battleId: string, pokemonIndex: number) =>
      `battle:${battleId}:switch:${pokemonIndex}`,
    forfeit: (battleId: string) =>
      `battle:${battleId}:forfeit`,
    info: (battleId: string) =>
      `battle:${battleId}:info`,
  },
  
  // Homestead interactions
  homestead: {
    heal: (channelId: string) =>
      `home:${channelId}:heal`,
    walk: (channelId: string) =>
      `home:${channelId}:walk`,
    party: (channelId: string) =>
      `home:${channelId}:party`,
    storage: (channelId: string, page: number) =>
      `home:${channelId}:storage:${page}`,
  },
  
  // Wild encounter interactions
  wilds: {
    catch: (encounterId: string, ballType: string) =>
      `wild:${encounterId}:catch:${ballType}`,
    run: (encounterId: string) =>
      `wild:${encounterId}:run`,
    fight: (encounterId: string) =>
      `wild:${encounterId}:fight`,
  },
  
  // Generic pagination
  page: (domain: string, entityId: string, page: number) =>
    `${domain}:${entityId}:page:${page}`,
  
  // Confirmations
  confirm: (domain: string, action: string, entityId: string) =>
    `confirm:${entityId}:${domain}:${action}`,
  cancel: (domain: string, entityId: string) =>
    `cancel:${entityId}:${domain}`,
};

// ============================================================================
// PARSER
// ============================================================================

export function parseCustomId(customId: string): ParsedCustomId {
  const parts = customId.split(':');
  
  if (parts.length < 3) {
    throw new Error(`Invalid custom ID format: ${customId}`);
  }
  
  return {
    domain: parts[0],
    entityId: parts[1],
    action: parts[2],
    param: parts[3],
    raw: customId,
  };
}

// ============================================================================
// ROUTER
// ============================================================================

type InteractionHandler = (
  interaction: ButtonInteraction | SelectMenuInteraction,
  parsed: ParsedCustomId
) => Promise<void>;

const handlers: Record<string, Record<string, InteractionHandler>> = {};

export function registerHandler(
  domain: string,
  action: string,
  handler: InteractionHandler
) {
  handlers[domain] ??= {};
  handlers[domain][action] = handler;
}

export async function routeInteraction(
  interaction: ButtonInteraction | SelectMenuInteraction
) {
  const parsed = parseCustomId(interaction.customId);
  const handler = handlers[parsed.domain]?.[parsed.action];
  
  if (!handler) {
    console.warn(`No handler for ${parsed.domain}:${parsed.action}`);
    await interaction.reply({
      content: 'This button is no longer valid.',
      ephemeral: true,
    });
    return;
  }
  
  await handler(interaction, parsed);
}
```

### Paginated Embed Component

```typescript
/**
 * @module discord/components/paginator
 * @description Reusable paginated embed component
 */

export interface PaginatorOptions<T> {
  items: T[];
  itemsPerPage: number;
  embedBuilder: (items: T[], page: number, total: number) => EmbedBuilder;
  domain: string;
  entityId: string;
}

export function createPaginator<T>(options: PaginatorOptions<T>) {
  const { items, itemsPerPage, embedBuilder, domain, entityId } = options;
  const totalPages = Math.ceil(items.length / itemsPerPage);
  
  return {
    getPage(page: number) {
      const start = page * itemsPerPage;
      const pageItems = items.slice(start, start + itemsPerPage);
      const embed = embedBuilder(pageItems, page, totalPages);
      
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(customId.page(domain, entityId, page - 1))
          .setEmoji('◀️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId(`${domain}:${entityId}:pageinfo`)
          .setLabel(`${page + 1}/${totalPages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(customId.page(domain, entityId, page + 1))
          .setEmoji('▶️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages - 1),
      );
      
      return { embeds: [embed], components: [row] };
    },
    
    totalPages,
  };
}

// Usage example
const pokemonList = createPaginator({
  items: trainer.pokemon,
  itemsPerPage: 10,
  domain: 'pokemon',
  entityId: trainerId,
  embedBuilder: (pokemon, page, total) => new EmbedBuilder()
    .setTitle(`Your Pokémon (Page ${page + 1}/${total})`)
    .setDescription(pokemon.map(p => `• ${p.nickname ?? p.species.name}`).join('\n')),
});

await interaction.reply(pokemonList.getPage(0));
```

### Discussion

> **🏗️ Aria:** The custom ID format looks clean. What about versioning? If we change the format, old buttons break.

> **🤖 Morgan:** Good point. We should include a version prefix:
> ```typescript
> // v1:battle:abc123:move:0
> const VERSION = 'v1';
> 
> battle: {
>   move: (battleId: string, moveIndex: number) =>
>     `${VERSION}:battle:${battleId}:move:${moveIndex}`,
> }
> ```
> 
> Old buttons gracefully fail to "no longer valid" message.

> **🧪 Quinn:** How do we test interaction handlers?

> **🤖 Morgan:** Mock the interaction object:
> ```typescript
> const mockInteraction = {
>   customId: customId.battle.move('test-battle', 0),
>   deferUpdate: vi.fn(),
>   editReply: vi.fn(),
>   user: { id: 'user-123' },
> };
> 
> await routeInteraction(mockInteraction as any);
> expect(mockInteraction.editReply).toHaveBeenCalled();
> ```

### Vote

| Specialist | Vote |
|------------|------|
| 🏗️ Aria | ✅ Approve |
| ⚙️ Devon | ✅ Approve |
| 🎮 Kai | ✅ Approve |
| 🤖 Morgan | ✅ Approve |
| 🗄️ River | ✅ Approve |
| 🧪 Quinn | ✅ Approve |
| 📚 Blake | ✅ Approve |

**Result:** ✅ **APPROVED** (7/7)

---

## Item 6: Database Migration Safety Checklist

**Presenter:** 🗄️ River (Database Specialist)

### Checklist

```markdown
# Database Migration Safety Checklist

## Pre-Migration

- [ ] **Backup verified**: Fresh backup exists and tested for restore
- [ ] **Schema reviewed**: Migration SQL reviewed by second pair of eyes
- [ ] **Rollback prepared**: Rollback migration written and tested locally
- [ ] **Downtime estimated**: If required, communicated to users
- [ ] **Feature flags ready**: New code behind feature flag if applicable

## Migration Classification

### Class A: Safe (No Downtime)
- [ ] Adding nullable column
- [ ] Adding table
- [ ] Adding index CONCURRENTLY
- [ ] Adding constraint as NOT VALID

### Class B: Careful (Brief Lock)
- [ ] Adding NOT NULL column with default
- [ ] Renaming column (requires code change)
- [ ] Adding unique constraint

### Class C: Dangerous (Potential Downtime)
- [ ] Dropping column
- [ ] Dropping table
- [ ] Adding index without CONCURRENTLY
- [ ] Modifying column type
- [ ] Backfill on large table

## Execution Steps

### For Class A/B:
1. [ ] Run migration on staging
2. [ ] Verify staging functionality
3. [ ] Run migration on production (off-peak)
4. [ ] Verify production functionality
5. [ ] Update ROUTER.md with migration note

### For Class C:
1. [ ] Create ADR documenting decision
2. [ ] Implement expand-contract pattern:
   - [ ] Expand: Add new structure
   - [ ] Migrate: Deploy app using both
   - [ ] Backfill: Copy data
   - [ ] Contract: Remove old structure
3. [ ] Schedule maintenance window if needed
4. [ ] Communicate to users
5. [ ] Execute with monitoring active
6. [ ] Verify and close maintenance window

## Post-Migration

- [ ] **Verify data**: Spot-check affected data
- [ ] **Monitor errors**: Watch logs for 30 minutes
- [ ] **Performance check**: Query performance acceptable
- [ ] **Document**: Update schema documentation
- [ ] **Cleanup**: Remove feature flags if applicable
```

### Expand-Contract Example

```sql
-- Step 1: Expand (add new column)
-- Migration: 001_add_display_name.sql
ALTER TABLE "User" ADD COLUMN "displayName" VARCHAR(255);

-- Step 2: Backfill (separate script, can be slow)
-- Script: backfill_display_name.sql
UPDATE "User" SET "displayName" = "username" WHERE "displayName" IS NULL;
-- Run in batches of 1000 to avoid long locks

-- Step 3: Contract (after app deployed using new column)
-- Migration: 002_make_display_name_required.sql  
ALTER TABLE "User" ALTER COLUMN "displayName" SET NOT NULL;

-- Step 4: Optional cleanup (drop old column)
-- Migration: 003_drop_username.sql
-- Only after all code uses displayName
ALTER TABLE "User" DROP COLUMN "username";
```

### Vote

**Result:** ✅ **APPROVED** (7/7)

---

## Item 7: Test Infrastructure Proposal

**Presenter:** 🧪 Quinn (Testing Specialist)

### Specification

```typescript
/**
 * @module tests/infrastructure
 * @description Test utilities and patterns
 */

// ============================================================================
// TEST DATABASE
// ============================================================================

/**
 * Create isolated test database
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const dbName = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const url = `postgresql://localhost/${dbName}`;
  
  // Create database
  await execAsync(`createdb ${dbName}`);
  
  // Run migrations
  await execAsync(`DATABASE_URL=${url} npx prisma migrate deploy`);
  
  // Create client
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  
  return {
    prisma,
    url,
    async cleanup() {
      await prisma.$disconnect();
      await execAsync(`dropdb ${dbName}`);
    },
  };
}

// ============================================================================
// MOCK FACTORIES
// ============================================================================

/**
 * Factory for creating test entities
 */
export const factories = {
  user: (overrides: Partial<User> = {}): User => ({
    id: `user-${Date.now()}`,
    discordId: `discord-${Date.now()}`,
    username: 'TestUser',
    createdAt: new Date(),
    ...overrides,
  }),
  
  pokemon: (overrides: Partial<Pokemon> = {}): Pokemon => ({
    id: `pokemon-${Date.now()}`,
    speciesId: 25, // Pikachu
    level: 50,
    hp: 100,
    maxHp: 100,
    ...overrides,
  }),
  
  battle: (overrides: Partial<Battle> = {}): Battle => ({
    id: `battle-${Date.now()}`,
    status: 'active',
    turn: 1,
    ...overrides,
  }),
};

// ============================================================================
// MOCK DISCORD
// ============================================================================

export function createMockInteraction(
  overrides: Partial<ButtonInteraction> = {}
): MockInteraction {
  return {
    id: `interaction-${Date.now()}`,
    customId: 'test:123:action',
    user: { id: 'user-123', username: 'TestUser' },
    guild: { id: 'guild-123', name: 'TestGuild' },
    channel: { id: 'channel-123', send: vi.fn() },
    deferReply: vi.fn().mockResolvedValue(undefined),
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as MockInteraction;
}

// ============================================================================
// PBSL FIXTURES
// ============================================================================

/**
 * Load PBSL fixture
 */
export function loadPBSLFixture(name: string): PBSLFixture {
  const path = join(__dirname, `../fixtures/pbsl/${name}.json`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/**
 * Verify battle against PBSL fixture
 */
export function verifyPBSLBattle(
  fixture: PBSLFixture,
  options: { verbose?: boolean } = {}
): void {
  const ctx = createBattleContext({
    correlationId: 'pbsl-test',
    seed: fixture.seed,
  });
  
  let battle = createBattleFromFixture(fixture.initial);
  
  for (const turn of fixture.turns) {
    const result = processTurn(battle, turn.playerAction, turn.opponentAction, ctx);
    
    if (options.verbose) {
      console.log(`Turn ${turn.number}:`, result);
    }
    
    // Verify expected outcome
    expect(result.battle.player.active.hp).toBe(turn.expected.playerHp);
    expect(result.battle.opponent.active.hp).toBe(turn.expected.opponentHp);
    
    battle = result.battle;
    ctx = result.ctx;
  }
  
  expect(battle.winner).toBe(fixture.expected.winner);
}

// ============================================================================
// PROPERTY-BASED TESTING
// ============================================================================

import { fc } from '@fast-check/vitest';

/**
 * Arbitrary generators for property-based tests
 */
export const arbitraries = {
  pokemon: fc.record({
    speciesId: fc.integer({ min: 1, max: 898 }),
    level: fc.integer({ min: 1, max: 100 }),
    hp: fc.integer({ min: 1, max: 999 }),
  }),
  
  move: fc.record({
    power: fc.integer({ min: 0, max: 250 }),
    accuracy: fc.integer({ min: 30, max: 100 }),
    type: fc.constantFrom(...POKEMON_TYPES),
  }),
  
  battleState: fc.record({
    turn: fc.integer({ min: 1, max: 100 }),
    playerHp: fc.integer({ min: 0, max: 999 }),
    opponentHp: fc.integer({ min: 0, max: 999 }),
  }),
  
  rngState: fc.record({
    s0: fc.bigInt({ min: 0n, max: (1n << 64n) - 1n }),
    s1: fc.bigInt({ min: 0n, max: (1n << 64n) - 1n }),
  }),
};
```

### Vote

**Result:** ✅ **APPROVED** (7/7)

---

## Meeting Summary

### Decisions Made

| Item | Decision | Vote |
|------|----------|------|
| RNG Module | Adopt xorshift128+ with immutable state | 7/7 ✅ |
| BattleContext | Implement context pattern | 7/7 ✅ |
| Health Checks | Three-tier health endpoints | 7/7 ✅ |
| ADR Template | Adopt proposed template | 7/7 ✅ |
| Custom IDs | Versioned domain:entity:action format | 7/7 ✅ |
| Migration Safety | Adopt checklist + expand-contract | 7/7 ✅ |
| Test Infrastructure | Adopt factories + PBSL + property tests | 7/7 ✅ |

### Action Items

| Item | Owner | Deadline |
|------|-------|----------|
| Implement RNG module | Kai | Week 1 |
| Implement BattleContext | Kai + Aria | Week 1 |
| Add health endpoints | Devon | Week 1 |
| Create ADR directory | Blake | This week |
| Implement custom ID system | Morgan | Week 1 |
| Document migration checklist | River | This week |
| Create test factory utilities | Quinn | Week 1 |
| Write ADR-001 through ADR-005 | Blake | Week 2 |

### Next Meeting

**Date:** 2025-12-30 (or as needed)  
**Agenda:**
- Implementation progress review
- Integration testing plan
- Migration pilot: homestead feature

---

**Meeting Adjourned:** 2025-12-23  
**Minutes Approved By:** All Specialists  
**Distribution:** Project Lead (DRIPTVDD) + Development Team
