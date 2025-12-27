# Section 10: Discord Bot

**Last Updated**: 2025-12-27 | **Status**: Production | **Homestead Migration**: ✅ Complete (2025-11-21)

[← Back to INDEX](INDEX.md) | [← Previous: Game Engine](09-game-engine.md) | [Next: Safety Guarantees →](11-safety-guarantees.md)

---

**Philosophy**: "The Discord bot is the player interface—responsive, intuitive, and delightful."

**Purpose**: Complete Discord interaction layer with slash commands, homestead channel flows, and button/modal interactions.

**ARCHITECTURE CHANGE (2025-11-21):** All gameplay now uses **private guild channels (homestead-{username})** instead of DMs. Each user has a dedicated private channel within the Discord guild for all gameplay interactions. See Section 14: Private Channel Architecture for complete specification.

## 10.1 Command Suite

**Slash Commands** — Comprehensive command interface for both admin and regular users.

**Admin Commands** (`/ops`):
- `/ops status` — Service health matrix
- `/ops deploy [service]` — Trigger deployment
- `/ops restart [service]` — Restart worker
- `/ops logs [service] [--tail]` — View service logs
- `/ops db [command]` — Database operations (status, counts, query)
- `/ops cache [command]` — Cache operations (status, refresh, clear)
- `/ops error [--since] [--limit]` — Error tracker queries

**Player Commands**:
- `/home` — Open homestead channel home screen (starter selection, party, profile, heal)
- `/walk` — Encounter wild Pokémon in homestead channel
- `/battle [user]` — Challenge another player (notifications sent to homestead channels)
- `/pokemon [name]` — View Pokémon details
- `/party` — View/manage party in homestead channel
- `/profile` — View player profile with pagination in homestead channel
- `/heal` — Heal party at Pokémon Center in homestead channel
- `/trade [user]` — Initiate trade (Phase 10+)
- `/dex` — View Pokédex progress (Phase 10+)

**Note:** All player commands now interact via private homestead channels (homestead-{username}) instead of Discord DMs. Migration from DM-based system in progress (Phase 18).

**Command Registration**:

```typescript
// src/bot/commands/index.ts
import { REST, Routes } from "discord.js";

const commands = [
  homeCommand,
  walkCommand,
  battleCommand,
  pokemonCommand,
  partyCommand,
  profileCommand,
  healCommand,
  opsCommand,
];

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

await rest.put(
  Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
  { body: commands.map(cmd => cmd.toJSON()) }
);
```

**Command Handler**:

```typescript
// src/bot/index.ts
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  const command = commands.get(interaction.commandName);
  if (!command) return;
  
  try {
    await command.execute(interaction);
  } catch (error) {
    ErrorTracker.track(error, {
      component: "discord",
      action: "execute-command",
      userId: interaction.user.id,
      guildId: interaction.guildId,
      commandName: interaction.commandName
    });
    
    await interaction.reply({
      content: "An error occurred while executing this command.",
      ephemeral: true
    });
  }
});
```

## 10.2 Discord Bot Initialization (bootDiscord)

**Purpose**: Initialize Discord.js client with memory optimizations, lazy command loading, and proper error handling.

**Source**: `src/bot/index.ts` (`bootDiscord` function)

**Called From**: `src/index.ts` Phase 3 (Engine DB + Discord Bots) — parallel initialization with Engine DB

### 10.2.1 Token Resolution

**Token Priority** (first available wins):

1. `opts.token` — Function parameter (testing override)
2. `DISCORD_BOT_TOKEN` — Primary production token
3. `POKEMON_BOT_TOKEN` — Legacy fallback
4. `DISCORD_TOKEN` — Alternative name
5. `BOT_TOKEN` — Generic fallback

**Graceful Degradation**: If no token provided, returns stub client (empty intents) to keep app running without hard failure.

```typescript
const token = opts.token || process.env.DISCORD_BOT_TOKEN || 
              process.env.POKEMON_BOT_TOKEN || process.env.DISCORD_TOKEN || 
              process.env.BOT_TOKEN;

if (!token) {
  log.warn("Discord bot token not provided; skipping bot startup");
  return new Client({ intents: [] }); // Stub client
}
```

### 10.2.2 Client Configuration

**Intents** (minimal surface — no Message Content intent required):

```typescript
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,        // Guild metadata (required for slash commands)
    GatewayIntentBits.DirectMessages // DM flows (home, starters, heal)
  ],
  partials: [
    Partials.Channel  // Required for DM channel access
  ],
  // ... cache configuration below
});
```

**Why No Message Content Intent?**
- Bot uses **slash commands only** (no prefix commands, no message parsing)
- Reduces permissions surface area
- Complies with Discord's Privileged Intents policy

### 10.2.3 Memory Optimization: Cache Limits + Sweeping

**RUNTIME BEHAVIOR DOCUMENTATION** — Comprehensive cache management across main bot and security bot implementations.

---

#### 10.2.3.1 Problem Statement

**Default Discord.js Behavior**:
- Caches **everything** indefinitely (messages, members, users, reactions, voice states, threads, etc.)
- **No automatic cleanup** — caches grow unbounded over time
- Idle bot with **zero gameplay** activity grows **50-200 MB/day** from Discord API events alone
- Production symptoms observed 2025-11-17:
  - Bot starts at **200 MB baseline**
  - After 24h idle: **350-400 MB** (0 commands executed)
  - After 7 days: **600-800 MB** → triggers Resource Monitor WARNING state
  - Without intervention: eventual CRITICAL/EMERGENCY memory pressure

**Why This Happens**:
- Discord.js listens to **all gateway events** even when bot is idle
- Member join/leave, presence updates, message creates/deletes — all cached by default
- Even with **minimal intents** (Guilds + DirectMessages only), unavoidable events still accumulate
- Each cached entity holds references to related objects → compounding growth

**Memory Leak Characteristics**:
- Growth rate: **~2-8 MB/hour** idle, **10-30 MB/hour** active
- Most problematic caches:
  1. **MessageManager**: 200-500 KB per 100 messages × N channels = **100-200 MB**
  2. **GuildMemberManager**: 1-2 KB per member × 1000s members = **50-100 MB**
  3. **UserManager**: 500 bytes per user × 10000s users = **20-50 MB**
  4. **PresenceManager**, **ReactionManager**: Unused but still accumulating

---

#### 10.2.3.2 Solution Architecture

**Two-Tier Cache Strategy** (implemented 2025-11-17):

1. **Cache Size Limits** (`makeCache` configuration)
   - Cap maximum entries per cache type
   - Prevent unbounded collection growth
   - Automatically evict oldest entries when limit reached (FIFO eviction)

2. **Automatic Sweepers** (`sweepers` configuration)
   - Periodic cleanup of expired entries (interval-based)
   - Time-based eviction (lifetime thresholds)
   - Custom filtering logic (smart retention rules)

**Result**: Memory growth **eliminated** — bot stays at **200-250 MB** indefinitely regardless of uptime.

---

#### 10.2.3.3 Main Bot Implementation (src/bot/index.ts)

**Profile**: Moderate cache limits + hourly sweeping for DM-focused gameplay bot.

**Cache Limits** (via `Options.cacheWithLimits`):

```typescript
makeCache: Options.cacheWithLimits({
  MessageManager: 200,              // Last 200 messages per channel (DM interactions)
  GuildMemberManager: 200,          // 200 members per guild (battle challenges)
  PresenceManager: 0,               // DISABLE - not used
  ReactionManager: 0,               // DISABLE - not used
  VoiceStateManager: 0,             // DISABLE - not used
  ApplicationCommandManager: 0,     // DISABLE - commands loaded separately
  BaseGuildEmojiManager: 0,         // DISABLE - not used
  GuildEmojiManager: 0,             // DISABLE - not used
  GuildBanManager: 0,               // DISABLE - not used
  GuildInviteManager: 0,            // DISABLE - not used
  StageInstanceManager: 0,          // DISABLE - not used
  ThreadManager: 0,                 // DISABLE - not used
  ThreadMemberManager: 0,           // DISABLE - not used
}),
```

**Cache Limit Rationale**:

| Cache Type | Limit | Purpose | Memory Impact |
|------------|-------|---------|---------------|
| **MessageManager** | 200 | DM interactions (button clicks, slash commands) | ~1-2 MB per channel |
| **GuildMemberManager** | 200 | Battle challenges, /ops command access | ~200-400 KB per guild |
| **Disabled (0)** | 0 | Unused features, eliminate overhead | **~50-150 MB saved** |

**Why 200 Messages?**
- DM flows require message history for button interactions (pagination, battle moves)
- 200 messages = ~2-5 minutes of conversation history
- Sufficient for typical interaction patterns (user clicks button → bot responds → user clicks again)
- Edge case: Long pagination sessions may lose context, but users can `/home` to restart

**Why 200 Members?**
- Battle challenges require member lookup (`/battle challenge @user`)
- `/ops` command needs member permission checks
- 200 members covers typical guild sizes (most servers <100 active members)
- Large servers (1000+ members): Cache evicts least-recently-used, refetches from API on-demand

**Automatic Sweepers**:

```typescript
sweepers: {
  messages: {
    interval: 3600,  // Every 1 hour (in seconds)
    lifetime: 1800,  // Keep 30 minutes (in seconds)
  },
},
```

**Sweeper Behavior**:
- Every **1 hour**, scan all cached messages
- Evict messages older than **30 minutes**
- **Why 30 minutes?** DM interactions timeout after 15 minutes (Discord limitation), 30 minutes provides safety buffer

**Performance Impact**:
- Sweep operation: **10-50ms** per 1000 messages
- Memory freed per sweep: **5-20 MB** (typical)
- CPU usage: **<0.1%** during sweep (async, non-blocking)

---

#### 10.2.3.4 Security Bot Implementation (src/bot/main.js)

**Profile**: Aggressive cache limits + 15-minute sweeping for monitoring-focused bot.

**Cache Limits** (via `makeCache` custom logic):

```javascript
makeCache: (manager) => {
  // Aggressive limits for memory-critical security bot
  if (manager.name === 'MessageManager') {
    return new LimitedCollection({ maxSize: 50 });  // Only 50 messages
  }
  if (manager.name === 'GuildMemberManager') {
    return new LimitedCollection({ maxSize: 1000 }); // 1000 members (large servers)
  }
  if (manager.name === 'ThreadManager') {
    return new LimitedCollection({ maxSize: 50 });   // 50 threads
  }
  // Default Collection (unbounded) for other managers
  return new Collection();
},
```

**Why More Aggressive Limits?**
- Security bot **doesn't need message history** (role monitoring only)
- 50 messages sufficient for immediate context if needed
- 1000 members handles even large servers (10k+ members) via LRU eviction
- Minimizes memory footprint: **~100-150 MB baseline** vs 200 MB for main bot

**Automatic Sweepers** (5 sweeper types):

```javascript
sweepers: {
  // 1. Message Sweeper
  messages: {
    interval: 900,   // Every 15 minutes
    lifetime: 1800,  // Keep 30 minutes
  },
  
  // 2. Guild Member Sweeper (SMART FILTERING)
  guildMembers: {
    interval: 900,   // Every 15 minutes
    filter: () => (member) => {
      // KEEP: Bot owner (DripTVDD)
      if (member.id === '1049161859555643433') return false;
      
      // KEEP: Members with roles beyond @everyone (elevated permissions)
      if (member.roles.cache.size > 1) return false;
      
      // KEEP: Recently joined (last 2 hours) — grace period
      if (Date.now() - (member.joinedTimestamp || 0) < 2 * 60 * 60 * 1000) return false;
      
      // SWEEP: Inactive members with no roles
      return true;
    },
  },
  
  // 3. User Sweeper (OWNER PROTECTION)
  users: {
    interval: 900,   // Every 15 minutes
    filter: () => (user) => {
      // KEEP: Bot owner (DripTVDD)
      if (user.id === '1049161859555643433') return false;
      
      // SWEEP: All other users
      return true;
    },
  },
  
  // 4. Thread Sweeper
  threads: {
    interval: 900,   // Every 15 minutes
    lifetime: 1800,  // Keep 30 minutes
  },
  
  // 5. Voice State Sweeper
  voiceStates: {
    interval: 900,   // Every 15 minutes
    filter: () => (state) => !state.channel, // Remove disconnected voice states
  },
},
```

**Sweeper Strategy Comparison**:

| Feature | Main Bot (index.ts) | Security Bot (main.js) | Reason for Difference |
|---------|---------------------|------------------------|------------------------|
| **Interval** | 1 hour (3600s) | 15 minutes (900s) | Security bot prioritizes low memory over latency |
| **Message Lifetime** | 30 minutes | 30 minutes | Same (both need recent context) |
| **Member Filtering** | None (limit-based) | Smart filtering | Security bot keeps important members (owner, roles) |
| **User Filtering** | None | Owner protection | Security bot needs owner for DM alerts |
| **Thread Sweeping** | Disabled | Enabled | Security bot cleans up thread clutter |
| **Voice Sweeping** | Disabled | Enabled | Security bot removes disconnected states |

**Smart Filtering Benefits**:

1. **Owner Protection** (`member.id === '1049161859555643433'`):
   - Ensures DripTVDD always cached for instant DM alerts
   - Prevents re-fetch overhead when sending critical notifications
   - **Latency savings**: ~50-100ms per alert (no API roundtrip)

2. **Role-Based Retention** (`member.roles.cache.size > 1`):
   - Keeps members with elevated permissions (admins, moderators)
   - Security bot monitors **role changes** — needs stable cache
   - **Prevents false alerts**: Avoids "role added" spam from cache eviction/re-fetch cycles

3. **Grace Period** (`joinedTimestamp < 2 hours ago`):
   - New members often trigger rapid role assignments (onboarding flows)
   - 2-hour window prevents cache thrashing during high-activity periods
   - **Reduces API load**: ~10-50 API calls/hour saved during member surges

4. **Disconnected Voice Cleanup** (`!state.channel`):
   - Voice states linger after users disconnect (Discord.js bug)
   - Explicit cleanup prevents ghost entries
   - **Memory savings**: ~100-500 KB per 100 disconnected users

**Performance Metrics**:

| Metric | Main Bot (1h interval) | Security Bot (15min interval) |
|--------|------------------------|-------------------------------|
| **Sweep Frequency** | Every 60 minutes | Every 15 minutes |
| **Sweep Duration** | 10-50ms | 15-75ms (more sweepers) |
| **Memory Freed** | 5-20 MB per sweep | 10-30 MB per sweep |
| **CPU Impact** | <0.1% | <0.2% |
| **Memory Baseline** | 200-250 MB | 100-150 MB |

**Why 15-Minute Interval for Security Bot?**
- Security bot handles **role monitoring** with 10-minute sweep cadence
- Cache sweeping **aligns** with role sweep schedule (minimal overhead)
- More frequent cleanup compensates for aggressive LimitedCollection evictions
- **Trade-off**: Slightly higher CPU (0.2% vs 0.1%) for lower memory (150 MB vs 250 MB)

---

#### 10.2.3.5 LimitedCollection vs Collection

**Collection** (Discord.js default):
- **Unbounded** Map-based storage
- FIFO eviction when `maxSize` reached
- **Memory**: O(n) where n = cache size
- **Performance**: O(1) get/set, O(n) iteration

**LimitedCollection** (Discord.js utility):
- **Bounded** Map with explicit `maxSize`
- Automatic eviction on insert when full
- **Memory**: O(maxSize) — guaranteed bounded
- **Performance**: O(1) get/set/evict, O(n) iteration

**Usage Pattern** (Security Bot):

```javascript
new LimitedCollection({ maxSize: 50 })  // Messages
new LimitedCollection({ maxSize: 1000 }) // Members
new LimitedCollection({ maxSize: 50 })   // Threads
```

**Why Not LimitedCollection for Main Bot?**
- `Options.cacheWithLimits` provides **type-safe** configuration
- Integrates with Discord.js internal cache manager
- **Automatic** limit enforcement across all cache types
- Security bot uses manual `makeCache` for **custom filtering** per cache type

---

#### 10.2.3.6 Memory Impact Analysis

**Before Cache Management** (pre-2025-11-17):

```
Bot Startup:           200 MB baseline
After 24h idle:        400 MB (+200 MB leak)
After 7 days idle:     800 MB (+600 MB leak)
After 30 days:         1400 MB (+1200 MB leak) → Resource Monitor WARNING
```

**After Cache Management** (post-2025-11-17):

```
Bot Startup:           200 MB baseline (main) / 100 MB (security)
After 24h idle:        220 MB (+20 MB usage) / 110 MB (+10 MB usage)
After 7 days idle:     240 MB (+40 MB usage) / 120 MB (+20 MB usage)
After 30 days:         250 MB (+50 MB usage) / 130 MB (+30 MB usage) → STABLE
```

**Memory Growth Rate**:

| Phase | Before | After | Improvement |
|-------|--------|-------|-------------|
| **Daily** | +50-100 MB | +5-10 MB | **90% reduction** |
| **Weekly** | +200-400 MB | +20-40 MB | **90% reduction** |
| **Monthly** | +600-1200 MB | +50-100 MB | **92% reduction** |

**Why Residual Growth?**
- **Legitimate usage**: Gameplay activity creates database entries, battle logs
- **Engine DB**: Write Buffer accumulates battle data (~10-20 MB/week)
- **Logger buffers**: Stats history, error logs (~5-10 MB/week)
- **Not a leak**: Bounded by configured limits, plateaus after 60 days

**12-Hour Auto-Restart Interaction**:
- Main bot restarts every **12 hours** (see Section 16.5 Auto-Restart Timer)
- Cache growth: **200 MB → 220 MB** over 12h, then **reset to 200 MB**
- **Net effect**: Cache management + auto-restart = **zero long-term growth**
- Redundancy: If auto-restart fails, cache limits prevent runaway growth

---

#### 10.2.3.7 Observability & Monitoring

**Logger Auto-Refresh Integration** (see Section 5.5):

```
┌─────────────── Performance Snapshot ───────────────┐
│ Uptime: 6h 24m                                     │
│ Memory: 215.3 MB / 2048 MB (10.5%)                 │
│                                                     │
│ Discord Cache:                                      │
│   Messages: 142/200 (71% full)                     │
│   Members: 87/200 (44% full)                       │
│   Users: 234 (unbounded)                           │
│   Guilds: 3                                         │
│                                                     │
│ Cache Sweeps:                                       │
│   Last Sweep: 14 minutes ago                       │
│   Next Sweep: in 46 minutes                        │
│   Freed This Sweep: 8.2 MB                         │
│   Total Freed (24h): 142.7 MB                      │
└─────────────────────────────────────────────────────┘
```

**Resource Monitor Integration** (see Section 13.3.5):

```javascript
// Cache registration for emergency pruning
ResourceMonitor.registerCache({
  name: "Discord Messages",
  getCurrentSize: () => client.channels.cache.reduce((acc, ch) => 
    acc + (ch.messages?.cache.size || 0), 0
  ),
  prune: async (targetSize) => {
    // Emergency: Sweep all messages older than 5 minutes
    for (const [id, channel] of client.channels.cache) {
      if (channel.messages) {
        const cutoff = Date.now() - 5 * 60 * 1000; // 5 minutes
        const swept = channel.messages.cache.sweep(msg => msg.createdTimestamp < cutoff);
        log.warn("Emergency message sweep", { channel: id, swept });
      }
    }
  }
});
```

**Emergency Pruning Flow**:
1. Resource Monitor detects **CRITICAL memory pressure** (>1741 MB)
2. Calls `prune()` on Discord cache
3. **Aggressive sweep**: All messages older than **5 minutes** (vs 30 minutes normal)
4. Members/users also pruned with shortened grace periods
5. **Memory freed**: Typically **50-100 MB** in emergency mode
6. System returns to NORMAL state (**<1536 MB**)

**Performance Telemetry**:

```javascript
// Discord.js internal metrics (exposed via client)
client.ws.ping              // WebSocket latency (ms)
client.channels.cache.size  // Cached channels count
client.guilds.cache.size    // Cached guilds count
client.users.cache.size     // Cached users count

// Per-channel message cache size
channel.messages.cache.size // Messages in this channel

// Sweep statistics (custom tracking)
lastSweepTime               // Timestamp of last sweep
lastSweepFreed              // MB freed in last sweep
totalSweepsToday            // Sweep count (24h rolling)
```

---

#### 10.2.3.8 Configuration Trade-offs

**Cache Limit vs API Latency**:

| Cache Limit | Memory Savings | API Refetch Penalty | Best For |
|-------------|----------------|---------------------|----------|
| **50 messages** | 75% (security bot) | ~100-200ms per miss | Monitoring bots (no message history needed) |
| **200 messages** | 50% (main bot) | ~50-100ms per miss | Gameplay bots (moderate interaction history) |
| **500 messages** | 25% | ~20-50ms per miss | High-interaction bots (chat-heavy) |
| **Unbounded** | 0% | 0ms (always cached) | Memory-rich environments (4+ GB) |

**Sweep Interval vs Memory Stability**:

| Interval | Memory Stability | CPU Usage | Best For |
|----------|------------------|-----------|----------|
| **15 minutes** | Excellent (±10 MB) | 0.2% | Memory-critical (512 MB-1 GB) |
| **1 hour** | Good (±20 MB) | 0.1% | Balanced (2 GB) |
| **6 hours** | Fair (±50 MB) | <0.1% | Memory-rich (4+ GB) |
| **Disabled** | Poor (unbounded) | 0% | Not recommended |

**Recommendations**:

1. **Memory-Constrained (<1 GB)**:
   - Security bot profile: 15-minute sweeps, aggressive limits (50 messages, 1000 members)
   - Disable all unused cache types (reactions, voice, threads)
   - Emergency pruning enabled

2. **Balanced (1-2 GB)**:
   - Main bot profile: 1-hour sweeps, moderate limits (200 messages, 200 members)
   - Keep essential cache types, disable unused
   - Auto-restart timer for periodic cleanup

3. **Memory-Rich (4+ GB)**:
   - Relaxed limits (500 messages, 1000 members)
   - 6-hour sweeps or longer
   - Focus on gameplay responsiveness over memory

---

#### 10.2.3.9 Known Limitations

**1. Member Cache Refetch Overhead**:
- **Symptom**: `/battle challenge @user` fails if user not cached
- **Cause**: LimitedCollection evicted user, Discord API roundtrip required
- **Workaround**: Main bot uses 200-member limit (sufficient for typical guilds)
- **Fix (future)**: Lazy loading with automatic retry on cache miss

**2. Message Context Loss**:
- **Symptom**: Button interactions fail with "Unknown Message" after 30+ minutes
- **Cause**: Message swept before user clicked button
- **Workaround**: Users can `/home` to restart DM flow
- **Fix (future)**: Extend lifetime to 60 minutes for pagination-heavy flows

**3. Large Server Performance**:
- **Symptom**: First `/ops` command slow (500-1000ms) on 10k+ member servers
- **Cause**: Member cache populated on-demand, API fetch required
- **Workaround**: Security bot uses 1000-member limit with smart filtering
- **Fix (future)**: Preload important members on bot startup

**4. Sweep Timing Non-Deterministic**:
- **Symptom**: Memory spikes slightly before scheduled sweep
- **Cause**: Discord.js uses `setInterval`, not precise scheduling
- **Impact**: ±5-10 MB variance, not critical
- **Fix (future)**: Use deterministic scheduler (cron-like)

**5. Cache Warming Latency**:
- **Symptom**: First interaction after bot restart slower (~200-500ms)
- **Cause**: Empty cache requires API roundtrips
- **Impact**: Only affects first few interactions, then caches warm
- **Workaround**: Acceptable for 12-hour restart cadence

---

#### 10.2.3.10 Testing & Validation

**Manual Testing**:

```bash
# Monitor cache sizes over time
npm run dev
# Wait 1 hour, check logger output:
# "Messages: X/200", "Members: Y/200"

# Verify sweep execution
# Logger should show: "Cache sweep completed" every 60 minutes (main bot)
```

**Automated Tests** (Vitest):

```typescript
// tests/cache/discord-cache.test.ts
describe("Discord Cache Limits", () => {
  it("should enforce message cache limit of 200", async () => {
    const client = createTestClient();
    const channel = client.channels.cache.first();
    
    // Fill cache beyond limit
    for (let i = 0; i < 250; i++) {
      channel.messages.cache.set(`${i}`, createMockMessage());
    }
    
    // Verify FIFO eviction
    expect(channel.messages.cache.size).toBe(200);
    expect(channel.messages.cache.has("0")).toBe(false); // Oldest evicted
    expect(channel.messages.cache.has("249")).toBe(true); // Newest kept
  });
  
  it("should sweep messages older than 30 minutes", async () => {
    const client = createTestClient();
    const channel = client.channels.cache.first();
    
    // Add old and new messages
    const oldMsg = createMockMessage({ timestamp: Date.now() - 40 * 60 * 1000 }); // 40min old
    const newMsg = createMockMessage({ timestamp: Date.now() - 20 * 60 * 1000 }); // 20min old
    channel.messages.cache.set("old", oldMsg);
    channel.messages.cache.set("new", newMsg);
    
    // Trigger sweep
    await client.sweepers.messages.sweep();
    
    // Verify lifetime enforcement
    expect(channel.messages.cache.has("old")).toBe(false); // Swept (>30min)
    expect(channel.messages.cache.has("new")).toBe(true);  // Kept (<30min)
  });
});
```

**Production Validation** (2025-11-17 deployment):

```
Before Cache Management:
- Startup: 200 MB
- 24h idle: 380 MB → +180 MB leak confirmed
- Auto-restart triggered by Resource Monitor WARNING (>1536 MB after 4 days)

After Cache Management:
- Startup: 200 MB
- 24h idle: 218 MB → +18 MB (legitimate usage)
- 7 days idle: 241 MB → Stable, no WARNING triggers
- Validation: SUCCESS ✅
```

---

#### 10.2.3.11 Future Enhancements

**1. Dynamic Cache Sizing**:
- Adjust limits based on available memory (Resource Monitor feedback)
- LOW memory → shrink to security bot profile (50 messages)
- HIGH memory → expand to gameplay profile (500 messages)

**2. Priority-Based Eviction**:
- Keep "hot" channels (active DM conversations) longer
- Evict "cold" channels (inactive guilds) sooner
- Weighted LRU: frequency + recency scoring

**3. Predictive Preloading**:
- Preload likely-needed members before `/ops` command
- Cache warming on bot startup (top 100 active users)
- Reduces first-interaction latency

**4. Sweep Scheduling Improvements**:
- Use `cron` library for precise timing (not `setInterval`)
- Align sweeps with auto-restart schedule (minimize disruption)
- Off-peak sweeping (3 AM UTC) for large servers

**5. Telemetry Dashboard**:
- Real-time cache size graphs (Grafana integration)
- Sweep effectiveness metrics (MB freed per sweep)
- API refetch rate (cache miss tracking)

---

#### 10.2.3.12 Cross-References

**Related Documentation**:
- **Section 5.5**: Logger Auto-Refresh (cache stats display)
- **Section 13.3.5**: Resource Monitor (emergency cache pruning)
- **Section 16.5**: Auto-Restart Timer (periodic cache reset)
- **docs/DISCORD-CACHE-MANAGEMENT.md**: Comprehensive monitoring guide

**Related Code**:
- `src/bot/index.ts` lines 62-88: Main bot cache configuration
- `src/bot/main.js` lines 213-266: Security bot cache configuration
- `src/services/monitoring/resource-monitor.ts`: Cache registration API
- `src/utils/logger.js`: Cache stats telemetry

**Related Metrics**:
- Memory baseline: 200 MB (main bot), 100 MB (security bot)
- Cache limits: 200 messages (main), 50 messages (security)
- Sweep intervals: 1 hour (main), 15 minutes (security)
- Memory freed per sweep: 5-20 MB (main), 10-30 MB (security)

---

**Last Updated**: 2025-11-19 (Bible Update 13/∞)  
**Runtime Version**: Discord.js v14.14.1  
**Production Status**: ✅ Active (2025-11-17 deployment)  
**Memory Impact**: -90% growth rate vs pre-optimization baseline

### 10.2.4 Lazy Command Loading

**Optimization**: Commands load on-demand when first interaction arrives, not during bot startup.

**Before** (blocking startup):
```typescript
const commands = await loadCommands(); // ~500-1000ms upfront
```

**After** (non-blocking startup):
```typescript
let commands: CommandCollection | null = null;

async function ensureCommandsLoaded(): Promise<CommandCollection> {
  if (!commands) {
    const loadStart = process.hrtime.bigint();
    commands = await loadCommands();
    const loadDurationMs = Number(process.hrtime.bigint() - loadStart) / 1_000_000;
    log.info("Commands loaded lazily", { count: commands.size, durationMs: loadDurationMs });
  }
  return commands;
}
```

**Benefits**:
- **Startup time**: Saves ~500-1000ms on boot
- **Memory**: Commands only loaded if bot actually used
- **Observability**: Logs load time + command count when triggered

**Trade-off**: First interaction has slight delay (~500ms), but all subsequent interactions instant.

### 10.2.5 Login + Ready Wait

**Pattern**: Parallel login + ready event wait using `Promise.all`.

```typescript
const readyPromise = once(client, Events.ClientReady);

client.once(Events.ClientReady, () => {
  log.info("Discord bot is ready", {
    user: client.user?.tag,
    lazyCommands: true,
  });
});

await Promise.all([
  client.login(token),
  readyPromise
]);
```

**Why `Promise.all`?**
- Ensures both login completes AND ready event fires before returning
- Prevents race conditions where caller tries to use client before ready
- Matches pattern used in Phase 3 parallel initialization

### 10.2.6 Cache Hygiene Monitoring

**Purpose**: Verify automatic sweepers are working, warn if caches grow beyond limits.

```typescript
const cacheMonitorInterval = setInterval(() => {
  const messageCount = client.channels.cache.reduce((total, channel) => {
    if ("messages" in channel && channel.messages?.cache) {
      return total + channel.messages.cache.size;
    }
    return total;
  }, 0);
  
  const memberCount = client.guilds.cache.reduce((total, guild) => {
    return total + guild.members.cache.size;
  }, 0);
  
  // Only log if caches are growing beyond expected limits
  if (messageCount > 500 || memberCount > 500) {
    log.warn("Discord cache above threshold", { 
      messages: messageCount, 
      members: memberCount,
      note: "Sweepers should be reducing this - check configuration"
    });
  }
}, 3600_000); // 1 hour
```

**Thresholds**:
- **Messages**: 500 max (200 per channel × ~2 channels = safe)
- **Members**: 500 max (200 per guild × ~2 guilds = safe)

**Cleanup**: Monitor interval cleared on SIGTERM/SIGINT.

### 10.2.7 Interaction Router

**Architecture**: Single `interactionCreate` handler routes all interaction types.

**Routing Logic**:

```
Interaction Event
├── isChatInputCommand() → Command Router
│   ├── /starter → openStartersDM()
│   ├── /heal → handleHeal()
│   ├── /daily → handleDailyClaim()
│   ├── /walk → handleWalk()
│   ├── /battle → handleBattleChallengeCommand()
│   ├── /ops → handleOpsCommand()
│   └── [other] → cmd.execute()
│
└── isButton() → Button Router
    ├── BATTLE_ACCEPT_* → handleBattleChallengeButton()
    ├── BATTLE_DECLINE_* → handleBattleChallengeButton()
    ├── MOVE_* → handleBattleActionButton()
    ├── SWITCH_* → handleBattleActionButton()
    ├── FORFEIT_* → handleBattleActionButton()
    ├── HOME_HEAL → handleHeal()
    ├── HOME_PARTY → openPartyView()
    ├── HOME_BOX → openBoxView()
    ├── HOME_PROFILE → openProfileView()
    ├── HOME_STARTERS → openStartersDM()
    ├── BOX_PAGE_* → openBoxView() with pagination
    ├── STARTER_PICK_* → handleStarterPick()
    └── ENCOUNTER_* → handleEncounterButton()
```

**Error Handling**: All interaction handlers wrapped in try-catch with graceful degradation.

```typescript
try {
  // ... handle interaction
} catch (err: any) {
  log.error("Interaction handler error", { err: err?.message || String(err) });
  
  if (interaction.isRepliable()) {
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: "Something went wrong." });
      } else {
        await interaction.reply({ content: "Something went wrong.", ephemeral: true });
      }
    } catch {
      // Ignore secondary reply errors; the primary failure is already logged.
    }
  }
}
```

**Safety**: Double try-catch prevents error reply failures from crashing handler.

### 10.2.8 Performance Metrics

**Typical Boot Time**: ~800ms (parallel with Engine DB in Phase 3)

**Breakdown**:
- Token resolution: <1ms
- Client initialization: ~50ms
- Login + ready wait: ~700ms
- Cache monitor setup: <1ms

**Memory Footprint**:
- Client initialization: ~20 MB
- Message cache (200 limit): ~5-10 MB
- Member cache (200 limit): ~5-10 MB
- **Total**: ~30-40 MB stable (no growth with sweepers)

**See Also**: [Section 16: Boot Sequence](16-boot-sequence.md) § Phase 3 for parallel initialization with Engine DB.

## 10.3 DM Implementation Guide

**Purpose**: Patterns for building interactive DM flows with buttons, modals, and pagination.

**Router Architecture**:

```
Interaction Event → Route by Type → [Command | Button | Modal | SelectMenu] → Handler
```

**Button Interaction Example**:

```typescript
// src/bot/dm/home.ts
export async function showHome(interaction: Interaction) {
  const buttons = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId("home:starters")
        .setLabel("Choose Starter")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("home:party")
        .setLabel("View Party")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("home:heal")
        .setLabel("Heal")
        .setStyle(ButtonStyle.Success),
    );
  
  await interaction.reply({
    content: "🏠 **Trainer Home**\n\nWhat would you like to do?",
    components: [buttons],
    ephemeral: true
  });
}

// Button handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  
  const [screen, action] = interaction.customId.split(":");
  
  if (screen === "home") {
    switch (action) {
      case "starters":
        await showStarters(interaction);
        break;
      case "party":
        await showParty(interaction);
        break;
      case "heal":
        await healParty(interaction);
        break;
    }
  }
});
```

**Modal Interaction Example**:

```typescript
// src/bot/dm/nickname.ts
export async function showNicknameModal(interaction: ButtonInteraction, pokemonId: string) {
  const modal = new ModalBuilder()
    .setCustomId(`nickname:${pokemonId}`)
    .setTitle("Nickname Your Pokémon");
  
  const nicknameInput = new TextInputBuilder()
    .setCustomId("nickname")
    .setLabel("Enter nickname (max 12 characters)")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(12)
    .setRequired(true);
  
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(nicknameInput));
  
  await interaction.showModal(modal);
}

// Modal handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  
  const [action, pokemonId] = interaction.customId.split(":");
  
  if (action === "nickname") {
    const nickname = interaction.fields.getTextInputValue("nickname");
    
    await prisma.pokemon.update({
      where: { id: pokemonId },
      data: { nickname }
    });
    
    await interaction.reply({
      content: `✅ Nickname updated to **${nickname}**!`,
      ephemeral: true
    });
  }
});
```

## 10.4 DM Admin Specification

**Admin-Specific Features** — Advanced operations accessible only to authorized admins.

**Permission Check**:

```typescript
// src/bot/utils/permissions.ts
export function isAdmin(userId: string): boolean {
  const adminIds = process.env.DISCORD_ADMIN_IDS?.split(",") ?? [];
  return adminIds.includes(userId);
}

export function requireAdmin(interaction: Interaction): boolean {
  if (!isAdmin(interaction.user.id)) {
    interaction.reply({
      content: "❌ This command requires admin permissions.",
      ephemeral: true
    });
    return false;
  }
  return true;
}
```

**Admin Command Categories**:

1. **System Operations** (`/ops status`, `/ops restart`):
   - View service health matrix
   - Restart workers
   - View deployment history

2. **Database Operations** (`/ops db`):
   - View connection status
   - Query table counts
   - Execute raw SQL (with confirmation)

3. **Cache Operations** (`/ops cache`):
   - View cache statistics
   - Refresh cache layers (L1/L2)
   - Clear cache entries

4. **Error Tracking** (`/ops error`):
   - View recent errors
   - Query by component/fingerprint
   - Export error reports

5. **Logging** (`/ops logs`):
   - View real-time logs
   - Query AI logs
   - Generate log reports

**Example Admin Command**:

```typescript
// src/bot/ops/admin.ts
export const opsCommand = new SlashCommandBuilder()
  .setName("ops")
  .setDescription("Admin operations")
  .addSubcommand(sub =>
    sub
      .setName("status")
      .setDescription("View service health matrix")
  )
  .addSubcommand(sub =>
    sub
      .setName("db")
      .setDescription("Database operations")
      .addStringOption(opt =>
        opt
          .setName("command")
          .setDescription("Command to execute")
          .setRequired(true)
          .addChoices(
            { name: "status", value: "status" },
            { name: "counts", value: "counts" },
            { name: "query", value: "query" }
          )
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!requireAdmin(interaction)) return;
  
  const subcommand = interaction.options.getSubcommand();
  
  switch (subcommand) {
    case "status":
      await showServiceStatus(interaction);
      break;
    case "db":
      await executeDatabaseCommand(interaction);
      break;
    // ...
  }
}
```

## 10.5 DM Documentation Index

**Document Relationships** — How DM flow documentation connects to codebase.

**Documentation Structure**:

```
architecture-bible/10-discord-bot.md → Discord bot architecture and command reference
architecture-bible/09-game-engine.md → Game engine architecture
src/bot/ROUTER.md                   → Code navigation for Discord bot layer
```

**Workflow**:

1. **User requests feature**: "Add trade command"
2. **Consult documentation**: Read architecture-bible/10-discord-bot.md (this file) for existing patterns
3. **Locate code**: Use `src/bot/ROUTER.md` to find command handlers
4. **Implement**: Follow established patterns (command builder + execute function)
5. **Update docs**: Add trade command to this Bible section
6. **Update router**: Reflect new files in `src/bot/ROUTER.md`
7. **Test**: Write integration test (button flows, error cases)
8. **Commit**: Include code + docs + router updates

**Key Integration Points**:
- `src/bot/commands/` — Slash command definitions
- `src/bot/dm/` — DM flow handlers (home, heal, starters, profile)
- `src/bot/battle/` — Battle interaction handlers (move, switch, forfeit)
- `src/bot/wilds/` — Wild encounter handlers (catch, throw, escape)
- `src/bot/ops/` — Admin command handlers

## 10.6 Cooldown System Runtime

**Cooldown System** (`src/lib/cooldown.js`) — Per-user command rate limiting with persistent state, automatic cleanup, and exploit prevention.

**Purpose**: Prevent command spam, rate-limit abuse, and API overload by enforcing minimum delays between command executions on a per-user, per-command basis. Cooldowns persist across restarts to prevent exploit abuse (e.g., spam commands → restart bot → spam again).

### 10.6.1 Core Architecture

**In-Memory Store** — Map-based cooldown tracking with `userId:commandName` composite keys.

**Data Structure**:

```javascript
// src/lib/cooldown.js lines 5-6
const store = new Map(); // key -> timestamp (ms)

// Example entries:
// "123456789:catch" -> 1699876543210 (Unix timestamp in ms)
// "987654321:battle" -> 1699876545000
// "123456789:heal" -> 1699876550123
```

**Key Format**: `${userId}:${commandName}` (e.g., `"123456789:catch"`)  
**Value**: Unix timestamp in milliseconds (when cooldown expires)  
**Scope**: Single running instance (not distributed across multiple bot processes)

**Why Map**:
- O(1) read/write operations
- Native JavaScript collection (no dependencies)
- Memory-efficient (8-24 bytes per entry)
- Built-in iteration for cleanup/persistence

**Single Instance Design**:
- Suitable for single-bot architecture (current Render deployment)
- Future multi-instance: Migrate to Redis or PostgreSQL-backed cooldowns (Phase 10+)
- No synchronization needed between processes currently

### 10.6.2 Configuration

**Cooldown Parameters** — Tunable intervals and storage configuration.

```javascript
// src/lib/cooldown.js lines 8-12
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;    // 10 minutes (expired entry removal)
const PERSIST_INTERVAL_MS = 1 * 60 * 1000;     // 1 minute (disk save frequency)
const MAX_COOLDOWN_AGE_MS = 60 * 60 * 1000;    // 1 hour TTL (maximum cooldown duration)
const STORAGE_DIR = process.env.RENDER ? '/Store/cooldowns' : path.join(process.cwd(), 'Store', 'cooldowns');
const STORAGE_FILE = path.join(STORAGE_DIR, 'cooldowns.json');
```

**Configuration Details**:

| Parameter | Value | Purpose | Rationale |
| --- | --- | --- | --- |
| **CLEANUP_INTERVAL_MS** | 10 minutes | Expired entry removal frequency | Balance between memory usage and cleanup overhead |
| **PERSIST_INTERVAL_MS** | 1 minute | Disk save frequency | Reduced from 5min in Phase 1 optimization, minimizes data loss on crash |
| **MAX_COOLDOWN_AGE_MS** | 1 hour | Maximum cooldown duration (TTL) | No command should have cooldown >1h, automatic cleanup prevents stale entries |
| **STORAGE_DIR** | `/Store/cooldowns` (Render) or `Store/cooldowns` (local) | Persistent disk location | Render persistent disk mount at `/Store`, local uses workspace-relative path |
| **STORAGE_FILE** | `cooldowns.json` | JSON snapshot filename | Human-readable format for debugging, contains version + savedAt + entries + count |

**Why 1 Minute Persist**:
- Previous: 5 minutes (5x more data loss risk on crash)
- Current: 1 minute (20% overhead increase, 80% data loss risk reduction)
- Trade-off: Acceptable I/O cost (~10-50ms/min) for exploit prevention

**Why 1 Hour TTL**:
- Typical command cooldowns: 2s (catch), 5s (battle), 30s (heal)
- MAX_COOLDOWN_AGE_MS = 1h ensures all entries expire even if cleanup fails
- Prevents unbounded memory growth (worst case: 1h of commands in memory)

### 10.6.3 Check-and-Set Flow

**Command Execution Gating** — Atomic cooldown check + set operation.

**API**:

```javascript
import { checkAndSet } from "./lib/cooldown.js";

// Returns: { ok: boolean, waitMs: number }
const result = checkAndSet(userId, commandName, cooldownMs = 2000);

if (!result.ok) {
  // User on cooldown
  return interaction.reply({
    content: `⏳ Please wait ${(result.waitMs / 1000).toFixed(1)}s before using this command again.`,
    ephemeral: true,
  });
}

// Cooldown passed, execute command
await executeCommand(interaction);
```

**Implementation** (`checkAndSet()` function):

```javascript
// src/lib/cooldown.js lines 21-29
function checkAndSet(userId, commandName, cooldownMs = 2000) {
  const now = Date.now();
  const key = keyFor(userId, commandName); // "${userId}:${commandName}"
  const until = store.get(key) || 0;
  
  if (now < until) {
    // Still on cooldown
    return { ok: false, waitMs: until - now };
  }
  
  // Cooldown expired or not set
  store.set(key, now + cooldownMs);
  return { ok: true, waitMs: 0 };
}
```

**Flow Breakdown**:

1. **Get Current Time**: `now = Date.now()` (Unix timestamp in ms)
2. **Build Key**: `key = "${userId}:${commandName}"` (composite key)
3. **Check Existing**: `until = store.get(key) || 0` (0 if no entry)
4. **Compare**: `if (now < until)` → User still on cooldown
   - **Return**: `{ ok: false, waitMs: until - now }` (remaining cooldown time)
5. **Set New Cooldown**: `store.set(key, now + cooldownMs)` (set expiry timestamp)
6. **Return Success**: `{ ok: true, waitMs: 0 }` (command allowed)

**Atomicity**: Single-threaded JavaScript ensures no race conditions (no locks needed)

**Performance**: O(1) Map operations, <1μs typical latency

**Example**:

```javascript
// User 123456789 uses /catch command at 10:00:00 with 2s cooldown
checkAndSet("123456789", "catch", 2000);
// → { ok: true, waitMs: 0 }
// → store.set("123456789:catch", 10:00:02)

// User tries again at 10:00:01 (1 second later)
checkAndSet("123456789", "catch", 2000);
// → { ok: false, waitMs: 1000 } (1 second remaining)

// User tries again at 10:00:03 (3 seconds later, cooldown expired)
checkAndSet("123456789", "catch", 2000);
// → { ok: true, waitMs: 0 }
// → store.set("123456789:catch", 10:00:05) (new cooldown)
```

### 10.6.4 Automatic Cleanup

**Expired Entry Removal** — Periodic cleanup prevents unbounded memory growth.

**Cleanup Flow** (`cleanup()` function):

```javascript
// src/lib/cooldown.js lines 34-48
function cleanup() {
  const now = Date.now();
  const threshold = now - MAX_COOLDOWN_AGE_MS; // 1 hour ago
  let removed = 0;
  
  for (const [key, until] of store.entries()) {
    if (until < threshold) {
      store.delete(key);
      removed++;
    }
  }
  
  if (removed > 0) {
    log('info', `cooldown: Cleanup removed ${removed} expired entries (${store.size} remaining)`);
  }
}
```

**How It Works**:

1. **Calculate Threshold**: `threshold = now - MAX_COOLDOWN_AGE_MS` (1 hour ago)
2. **Iterate All Entries**: Loop through `store.entries()` (Map iterator)
3. **Check Expiry**: `if (until < threshold)` → Entry older than 1 hour
4. **Delete Expired**: `store.delete(key)` (O(1) removal)
5. **Log Results**: `log('info', ...)` if any entries removed

**Why 1 Hour TTL**:
- Typical cooldowns: 2s-30s (99% expire within 1 minute)
- 1 hour threshold ensures ALL commands expire even if unused
- Prevents memory leak from abandoned cooldowns (e.g., user stops playing)

**Cleanup Schedule**:
- **Interval**: Every 10 minutes (`CLEANUP_INTERVAL_MS`)
- **Trigger**: `setInterval(cleanup, CLEANUP_INTERVAL_MS)` on startup
- **Performance**: O(n) iteration, ~1ms per 1000 entries (negligible overhead)

**Memory Impact**:
- **Without Cleanup**: Unbounded growth (100 MB+ after 30 days of high activity)
- **With Cleanup**: Bounded to active users (typically <1 MB, ~10k entries max)

**Example**:

```
Initial state: 10,000 entries
Current time: 10:00:00
Threshold: 09:00:00 (1 hour ago)

Entries:
  "user1:catch" -> 08:30:00 (expired, 1.5h old) ❌ DELETE
  "user2:battle" -> 09:55:00 (valid, 5min old)  ✅ KEEP
  "user3:heal" -> 09:30:00 (expired, 30min old but <1h) ✅ KEEP
  "user4:walk" -> 07:00:00 (expired, 3h old)    ❌ DELETE

After cleanup: 9,998 entries (2 removed)
```

### 10.6.5 Persistence

**Disk Snapshots** — Periodic JSON snapshots enable cooldown recovery after restarts.

**Persistence Flow** (`persist()` function):

```javascript
// src/lib/cooldown.js lines 53-81
async function persist() {
  try {
    const now = Date.now();
    const threshold = now - MAX_COOLDOWN_AGE_MS;
    const validEntries = {};
    
    // Filter out expired entries before saving
    for (const [key, until] of store.entries()) {
      if (until >= threshold) {
        validEntries[key] = until;
      }
    }
    
    // Ensure directory exists
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
    
    const snapshot = {
      version: 1,
      savedAt: now,
      entries: validEntries,
      count: Object.keys(validEntries).length,
    };
    
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(snapshot, null, 2), 'utf8');
    log('info', `cooldown: Persisted ${snapshot.count} entries to disk`);
  } catch (err) {
    log('warn', `cooldown: Persist failed: ${err.message}`);
  }
}
```

**Snapshot Schema**:

```json
{
  "version": 1,
  "savedAt": 1699876543210,
  "entries": {
    "123456789:catch": 1699876545210,
    "987654321:battle": 1699876548000,
    "123456789:heal": 1699876550123
  },
  "count": 3
}
```

**Schema Fields**:

| Field | Type | Purpose |
| --- | --- | --- |
| **version** | number | Schema version (1), enables future migrations |
| **savedAt** | number | Unix timestamp (ms) when snapshot created |
| **entries** | object | Map of `userId:commandName` → expiry timestamp |
| **count** | number | Entry count (redundant, but useful for quick stats) |

**Persistence Schedule**:
- **Interval**: Every 1 minute (`PERSIST_INTERVAL_MS`)
- **Trigger**: `setInterval(persist, PERSIST_INTERVAL_MS)` on startup
- **Final Save**: On graceful shutdown (`SIGTERM`, `SIGINT`)

**Why Filter Expired Entries**:
- Avoids saving stale data (no point persisting cooldowns that already expired)
- Reduces snapshot size (typically 30-50% smaller)
- Faster load on startup (skip expired entry filtering during load)

**Performance Impact**:
- **Snapshot Size**: ~50 bytes per entry (JSON overhead)
- **Typical Size**: 10k entries × 50 bytes = 500 KB
- **Write Time**: 10-50ms (depends on disk I/O, file size)
- **Frequency**: Every 1 minute = ~50ms/min overhead (0.083% CPU time)

**Storage Location**:
- **Render**: `/Store/cooldowns/cooldowns.json` (persistent disk mount)
- **Local**: `Store/cooldowns/cooldowns.json` (workspace-relative)

### 10.6.6 Load on Startup

**State Recovery** — Load persisted cooldowns on bot startup.

**Load Flow** (`load()` function):

```javascript
// src/lib/cooldown.js lines 86-113
function load() {
  try {
    if (!fs.existsSync(STORAGE_FILE)) {
      log('info', 'cooldown: No persisted state found (first startup)');
      return;
    }
    
    const content = fs.readFileSync(STORAGE_FILE, 'utf8');
    const snapshot = JSON.parse(content);
    const now = Date.now();
    const threshold = now - MAX_COOLDOWN_AGE_MS;
    let loaded = 0;
    let skipped = 0;
    
    for (const [key, until] of Object.entries(snapshot.entries || {})) {
      // Only load entries that are:
      // 1. Not expired (until >= threshold)
      // 2. Still in the future (until > now)
      if (until >= threshold && until > now) {
        store.set(key, until);
        loaded++;
      } else {
        skipped++;
      }
    }
    
    log('info', `cooldown: Loaded ${loaded} entries from disk (${skipped} expired, skipped)`);
  } catch (err) {
    log('warn', `cooldown: Load failed: ${err.message}`);
  }
}
```

**Load Logic**:

1. **Check File Existence**: `if (!fs.existsSync(STORAGE_FILE))` → First startup, skip load
2. **Read Snapshot**: `fs.readFileSync()` + `JSON.parse()` (synchronous, blocks startup briefly)
3. **Calculate Threshold**: `threshold = now - MAX_COOLDOWN_AGE_MS` (1 hour ago)
4. **Filter Entries**: Only load entries where `until >= threshold && until > now`
   - **Why `until >= threshold`**: Entry not too old (within 1h TTL)
   - **Why `until > now`**: Cooldown still active (not expired yet)
5. **Restore to Store**: `store.set(key, until)` (reconstruct in-memory Map)
6. **Log Results**: `log('info', ...)` with loaded/skipped counts

**Why Filter on Load**:
- Avoids loading stale cooldowns (no point restoring expired entries)
- Prevents immediate cleanup work (no expired entries in store after load)
- Faster startup (skip unnecessary Map insertions)

**Startup Timing**:
- **Execution**: Module load (top-level, line 159)
- **Order**: Before `startMaintenance()` (timers start after load)
- **Performance**: 1-10ms typical (depends on snapshot size, disk I/O)

**Example**:

```
Snapshot (saved at 10:00:00):
{
  "savedAt": 1699876800000,
  "entries": {
    "user1:catch": 1699876802000,  // expires at 10:00:02
    "user2:battle": 1699876805000, // expires at 10:00:05
    "user3:heal": 1699876400000    // expired 6min ago (saved before cleanup)
  }
}

Bot restarts at 10:00:03 (3 seconds later):
Current time: 10:00:03 (1699876803000)
Threshold: 09:00:03 (1 hour ago)

Entry 1: user1:catch (10:00:02)
  - until >= threshold? ✅ Yes (10:00:02 > 09:00:03)
  - until > now? ❌ No (10:00:02 < 10:00:03, already expired)
  - SKIPPED (expired since snapshot)

Entry 2: user2:battle (10:00:05)
  - until >= threshold? ✅ Yes (10:00:05 > 09:00:03)
  - until > now? ✅ Yes (10:00:05 > 10:00:03, still active)
  - LOADED (2s remaining on cooldown)

Entry 3: user3:heal (09:54:00)
  - until >= threshold? ✅ Yes (09:54:00 > 09:00:03)
  - until > now? ❌ No (09:54:00 < 10:00:03, expired)
  - SKIPPED (expired)

Result: Loaded 1 entry (user2:battle), skipped 2 expired
```

### 10.6.7 Maintenance Timers

**Background Workers** — Periodic cleanup and persistence timers.

**Maintenance Initialization** (`startMaintenance()` function):

```javascript
// src/lib/cooldown.js lines 118-129
function startMaintenance() {
  if (cleanupTimer || persistTimer) {
    log('warn', 'cooldown: Maintenance already running');
    return;
  }
  
  cleanupTimer = setInterval(cleanup, CLEANUP_INTERVAL_MS);   // 10 minutes
  persistTimer = setInterval(persist, PERSIST_INTERVAL_MS);   // 1 minute
  log('info', 'cooldown: Started maintenance (cleanup: 10m, persist: 5m)');
}
```

**Timers**:

| Timer | Interval | Function | Purpose |
| --- | --- | --- | --- |
| **cleanupTimer** | 10 minutes | `cleanup()` | Remove expired entries from in-memory store |
| **persistTimer** | 1 minute | `persist()` | Save current state to disk (crash recovery) |

**Why Two Timers**:
- **Cleanup**: Less frequent (10m), more expensive operation (O(n) iteration)
- **Persistence**: More frequent (1m), cheaper operation (O(n) filtering + JSON write)
- **Independence**: Timers run independently (cleanup failure doesn't block persistence)

**Startup Behavior**:
- **Execution**: Module load (top-level, line 162)
- **Order**: After `load()` (restore state before starting timers)
- **Check**: `if (cleanupTimer || persistTimer)` prevents duplicate timers (idempotent)

**Timer Management**:
- **unref()**: NOT called (timers keep process alive intentionally)
- **Shutdown**: Timers cleared on `SIGTERM`/`SIGINT` via `stopMaintenance()`

### 10.6.8 Graceful Shutdown

**Shutdown Cleanup** — Stop timers and save final state before process exit.

**Shutdown Flow** (`stopMaintenance()` function):

```javascript
// src/lib/cooldown.js lines 134-149
async function stopMaintenance() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  if (persistTimer) {
    clearInterval(persistTimer);
    persistTimer = null;
  }
  
  // Final persist on shutdown
  await persist();
  log('info', 'cooldown: Stopped maintenance, final state saved');
}
```

**Shutdown Steps**:

1. **Stop Cleanup Timer**: `clearInterval(cleanupTimer)` → No more cleanup runs
2. **Stop Persist Timer**: `clearInterval(persistTimer)` → No more scheduled persists
3. **Null Handles**: `cleanupTimer = null`, `persistTimer = null` (allow restart if needed)
4. **Final Persist**: `await persist()` → Save latest state before exit
5. **Log Completion**: `log('info', ...)` → Confirm shutdown complete

**Why Final Persist**:
- Ensures zero data loss on graceful shutdown (up to 1 minute of cooldowns saved)
- Previous: 5-minute persist interval = up to 5 minutes of cooldown loss
- Current: 1-minute persist interval + final persist = <1 minute of cooldown loss

**Integration with Graceful Shutdown** (see Section 16):

```typescript
// src/index.ts lines 911-914 (Phase 1, Step 1E)
const cooldownModule = await import("./lib/cooldown.js");
if ('shutdown' in cooldownModule && typeof cooldownModule.shutdown === 'function') {
  await cooldownModule.shutdown();
}
```

**Shutdown Timing**:
- **Phase**: Phase 1 (Critical Saves), Step 1E
- **Order**: After battles (1A), security bot (1B), engine write buffer (1C), AI logger (1D)
- **Timing**: 10-30ms typical (depends on cooldown count, disk I/O)

**Signal Handlers** (module-level):

```javascript
// src/lib/cooldown.js lines 166-173
process.on('SIGTERM', async () => {
  await stopMaintenance();
});

process.on('SIGINT', async () => {
  await stopMaintenance();
});
```

**Why Module-Level Handlers**:
- Cooldown system operates independently (not part of Service Registry)
- Ensures shutdown even if main process doesn't call `shutdown()`
- Redundant safety (called both from main process and signal handlers)

**Export Alias**:

```javascript
export { stopMaintenance as shutdown };
```

**Why Alias**: Main process expects `shutdown()` function (convention), `stopMaintenance()` is internal name.

### 10.6.9 Statistics API

**Observability** — Runtime statistics for monitoring and debugging.

**Stats API** (`getStats()` function):

```javascript
// src/lib/cooldown.js lines 154-175
function getStats() {
  const now = Date.now();
  const threshold = now - MAX_COOLDOWN_AGE_MS;
  let active = 0;
  let expired = 0;
  
  for (const [, until] of store.entries()) {
    // Entry is active if:
    // 1. Not too old (until >= threshold)
    // 2. Still in the future (until > now)
    if (until >= threshold && until > now) {
      active++;
    } else {
      expired++;
    }
  }
  
  return {
    total: store.size,
    active,
    expired,
    maxAgeSec: MAX_COOLDOWN_AGE_MS / 1000,
    cleanupIntervalSec: CLEANUP_INTERVAL_MS / 1000,
    persistIntervalSec: PERSIST_INTERVAL_MS / 1000,
  };
}
```

**Stats Schema**:

```javascript
{
  total: 10000,           // Total entries in store (active + expired)
  active: 8500,           // Active cooldowns (still in the future)
  expired: 1500,          // Expired cooldowns (awaiting cleanup)
  maxAgeSec: 3600,        // Maximum cooldown age in seconds (1 hour)
  cleanupIntervalSec: 600,// Cleanup interval in seconds (10 minutes)
  persistIntervalSec: 60  // Persist interval in seconds (1 minute)
}
```

**Usage**:

```javascript
import { getStats } from "./lib/cooldown.js";

const stats = getStats();
console.log(`Cooldowns: ${stats.active} active, ${stats.expired} expired (${stats.total} total)`);
```

**Performance**: O(n) iteration (same as cleanup), ~1ms per 1000 entries

**Why Track Expired Separately**:
- Indicates cleanup effectiveness (high expired count = cleanup not running or overloaded)
- Memory leak detection (expired count growing = cleanup failing)
- Tuning guidance (large expired count = reduce cleanup interval)

### 10.6.10 Integration Points

**Command Integration** — How commands use cooldown system.

**Example Integration** (`/catch` command):

```javascript
// src/bot/commands/catch.ts
import { checkAndSet } from "../../lib/cooldown.js";

export async function execute(interaction: ChatInputCommandInteraction) {
  // Check cooldown (2s for catch command)
  const result = checkAndSet(interaction.user.id, "catch", 2000);
  
  if (!result.ok) {
    return interaction.reply({
      content: `⏳ You must wait ${(result.waitMs / 1000).toFixed(1)}s before catching again!`,
      ephemeral: true,
    });
  }
  
  // Cooldown passed, execute command
  await executeCatchLogic(interaction);
}
```

**Common Cooldown Durations**:

| Command | Cooldown | Reason |
| --- | --- | --- |
| `/catch` | 2s | Prevent API spam, balance gameplay pacing |
| `/walk` | 3s | Encounter rate limiting, prevent abuse |
| `/battle` | 5s | Give time to read battle results |
| `/heal` | 30s | Prevent instant-heal exploit (should cost something) |
| `/trade` | 60s | Prevent trade spam (Phase 10+) |

**Why Per-User Per-Command**:
- **Fairness**: User A's cooldown doesn't block User B
- **Flexibility**: Different commands have different cooldown durations
- **Isolation**: `/catch` cooldown doesn't block `/walk` for same user

**Admin Bypass** (future enhancement):

```javascript
// Admin users can bypass cooldowns
if (isAdmin(interaction.user.id)) {
  return executeCommand(interaction);
}

const result = checkAndSet(interaction.user.id, commandName, cooldownMs);
// ...
```

### 10.6.11 Performance Characteristics

**Runtime Performance** — Cooldown system performance impact.

| Metric | Value | Notes |
| --- | --- | --- |
| **checkAndSet() Latency** | <1μs | O(1) Map operations, no I/O |
| **Memory per Entry** | 8-24 bytes | Map entry overhead (key + value) |
| **Typical Memory Usage** | <1 MB | 10k active entries × 20 bytes ≈ 200 KB |
| **Worst-Case Memory** | ~2 MB | 100k entries (extreme, unlikely in practice) |
| **Cleanup Time** | ~1ms/1000 entries | O(n) iteration, negligible overhead |
| **Persist Time** | 10-50ms | Depends on entry count, disk I/O speed |
| **Load Time** | 1-10ms | Depends on snapshot size, disk I/O speed |
| **CPU Impact** | <0.1% | Cleanup (10m interval) + Persist (1m interval) |

**Scaling Analysis**:

```
Assumptions:
- 1000 concurrent players
- 10 commands per player per hour
- Average cooldown: 5s
- Peak load: 100 commands/second

Active cooldowns at any moment:
- 100 commands/second × 5s cooldown = 500 entries
- Memory: 500 entries × 20 bytes = 10 KB

Daily cooldown count:
- 1000 players × 10 commands/hour × 24 hours = 240k commands
- Memory: 240k entries × 20 bytes = 4.8 MB (unrealistic, cleanup removes expired)
- Actual memory (with cleanup): ~1 MB (only active cooldowns + recent expired)

Persist overhead:
- 10k entries × 50 bytes/entry = 500 KB JSON
- Write time: ~30ms per persist
- Frequency: 1 minute = 30ms/min = 0.05% CPU time
```

**Bottlenecks**:
- **None Currently**: Map operations are O(1), cleanup/persist are O(n) but infrequent
- **Future**: Multi-instance deployment requires distributed cooldown store (Redis/PostgreSQL)

### 10.6.12 Exploit Prevention

**Security Features** — How cooldowns prevent abuse.

**Exploit Scenarios Prevented**:

1. **Command Spam** (pre-cooldown):
   - Attack: User spams `/catch` 100x/second
   - Impact: API overload, server crash, database lock contention
   - Prevention: 2s cooldown → Max 0.5 commands/second per user

2. **Restart Exploit** (pre-persistence):
   - Attack: User spams commands → Restart bot → Cooldowns reset → Spam again
   - Impact: Cooldown system bypassed, abuse continues
   - Prevention: Persistence + Load → Cooldowns survive restarts

3. **Multi-Account Spam** (partial mitigation):
   - Attack: User creates 100 accounts, spams commands
   - Impact: 100× command rate even with cooldowns
   - Mitigation: Per-user cooldowns reduce impact, but multiple accounts still work
   - Future: IP-based rate limiting, account verification (Phase 10+)

4. **Race Condition Abuse** (not applicable):
   - Attack: User sends multiple commands simultaneously (before cooldown set)
   - Impact: Multiple commands execute before cooldown activates
   - Prevention: JavaScript single-threaded execution (no race conditions possible)

**Why Persistence Matters**:

```
Without Persistence:
10:00:00 → User spams /catch 20x (2s cooldown blocks 19)
10:00:30 → Bot crashes
10:00:35 → Bot restarts (cooldowns cleared)
10:00:35 → User spams /catch 20x again (no cooldown, all succeed) ❌

With Persistence:
10:00:00 → User spams /catch 20x (2s cooldown blocks 19)
10:00:30 → Bot crashes (last persist at 10:00:00)
10:00:35 → Bot restarts (loads cooldowns from disk)
10:00:35 → User tries /catch (cooldown still active from 10:00:02) ✅
```

**Data Loss Window**:
- **Without Persistence**: 100% data loss on crash (all cooldowns reset)
- **With Persistence (1m interval)**: <1 minute of cooldowns lost (worst case)
- **With Final Persist**: 0 data loss on graceful shutdown (SIGTERM, SIGINT)

### 10.6.13 Future Enhancements

**Phase 10+ Roadmap** — Planned improvements to cooldown system.

**Distributed Cooldowns (Phase 10)**:
- **Problem**: Current Map-based system doesn't scale to multiple bot instances
- **Solution**: Migrate to Redis or PostgreSQL-backed cooldowns
- **Benefits**: Shared cooldown state across instances, consistent behavior
- **Implementation**: Replace `store` Map with Redis/PostgreSQL adapter

**Dynamic Cooldowns (Phase 11)**:
- **Problem**: Fixed cooldowns don't adapt to user behavior or server load
- **Solution**: Adjust cooldowns based on user reputation, command success rate, server load
- **Examples**:
  - Verified users: 50% cooldown reduction
  - High success rate: 25% cooldown reduction
  - Server overload: 2× cooldown increase (temporary)

**Per-Guild Cooldowns (Phase 12)**:
- **Problem**: Per-user cooldowns don't prevent guild-wide spam
- **Solution**: Add guild-level cooldowns (e.g., max 10 /catch per minute per guild)
- **Benefits**: Prevents coordinated abuse, reduces guild-wide API load

**Admin Dashboard (Phase 13)**:
- **Problem**: No visibility into cooldown state (requires code access)
- **Solution**: `/ops cooldowns` command showing stats, top users, recent resets
- **Features**: getStats() output, top 10 users by cooldown count, manual reset capability

**Audit Logging (Phase 14)**:
- **Problem**: No record of cooldown violations (can't detect exploit attempts)
- **Solution**: Log all cooldown violations to error tracker with user/command/timestamp
- **Benefits**: Detect abuse patterns, ban repeat offenders, analyze command usage

### 10.6.14 Cross-References

**Related Architecture Bible Sections**:
- **Section 2** (Database Architecture) — Future: PostgreSQL-backed cooldowns for distributed deployment
- **Section 5** (Logging Architecture) — Cooldown violations logged via intelligent logger
- **Section 6** (Error System) — Future: Cooldown exploits tracked as security events
- **Section 16** (Boot Sequence) — Cooldown shutdown integration (Phase 1, Step 1E)

**Related Operations Bible Sections**:
- **operations-bible/03-monitoring.md** — Cooldown stats observability via `/ops cooldowns` (future)
- **operations-bible/04-deployment.md** — Cooldown persistence ensures zero data loss on deploy

**Related Development Bible Sections**:
- **development-bible/02-local-development.md** — Cooldown storage location (`Store/cooldowns/` vs `/Store/cooldowns/`)
- **development-bible/04-testing.md** — Cooldown mocking in tests, time manipulation patterns

**Related Source Files**:
- `src/lib/cooldown.js` (186 lines) — Complete cooldown system implementation
- `src/index.ts` (lines 911-914) — Cooldown shutdown integration (Phase 1, Step 1E)
- `src/bot/commands/*.ts` — Command-level cooldown integration (checkAndSet() calls)

## 10.7 Battle Turn Command Runtime

**Purpose**: In-memory session management for turn-by-turn battle simulation via `/battle-turn` Discord slash command.

**Why This Matters**: The battle-turn command provides a testing/debugging interface for the battle engine. Unlike production battles (which use persistent state), this command maintains ephemeral in-memory sessions keyed by Discord user ID. When users restart the bot, all sessions are lost—this is intentional for development/testing workflows.

**As of 2025-11-20**, the system maintains a single `SESSIONS` Map for all battle-turn invocations. Each Discord user gets one session (one active battle), with lazy initialization on first `/battle-turn` use. Sessions are deleted automatically when either Pokémon faints.

### 10.7.1 SESSIONS Map Architecture

**Data Structure** (src/commands/battle-turn.js, line 35):

```javascript
const SESSIONS = new Map();
// Map<userId: string, session: { state: BattleState }>
```

**Key Characteristics**:
- **In-Memory Only**: No persistence (lost on restart/deploy)
- **Per-User Keyed**: Map key is Discord user ID (string)
- **Single Battle Per User**: One session = one active battle
- **Lazy Initialization**: Session created on first `/battle-turn` invocation
- **Automatic Cleanup**: Session deleted when either Pokémon faints (KO detection)

**Session Structure**:

```typescript
interface BattleSession {
  state: BattleState; // From src/core/battle/engine.ts
}

// BattleState includes:
// - pokemon1: PokemonState (active HP, status, stat stages, etc.)
// - pokemon2: PokemonState
// - turn: number
// - weather: WeatherType | null
// - terrain: TerrainType | null
// - ended: boolean
// - winner: 1 | 2 | null
```

**Memory Footprint** (per session):
- **Session Overhead**: ~50 bytes (Map entry)
- **BattleState**: ~2-5 KB (two Pokémon with stats, status, moves)
- **Total per User**: ~5 KB
- **100 concurrent users**: ~500 KB total

**Lifecycle**:
1. **Creation**: `ensureBattleState(userId)` called on first `/battle-turn`
2. **Active**: Persists across multiple turn invocations by same user
3. **Termination**: Deleted when either Pokémon HP reaches 0
4. **Implicit Cleanup**: Lost on bot restart (no persistence layer)

### 10.7.2 Session Lifecycle

**Phase 1: Lazy Initialization** (ensureBattleState function, lines 37-52):

```javascript
function ensureBattleState(userId) {
  if (!SESSIONS.has(userId)) {
    const charizard = dexApi.getSpecies(6);   // Charizard (Pokédex #6)
    const venusaur = dexApi.getSpecies(3);    // Venusaur (Pokédex #3)
    
    const initialState = initBattle(
      charizard, 
      venusaur, 
      50,        // Level 50
      50
    );
    
    SESSIONS.set(userId, { state: initialState });
    logger.info(`[battle-turn] Created new session for user ${userId}`);
  }
  return SESSIONS.get(userId);
}
```

**Default Matchup**:
- **Player 1**: Charizard (Pokédex #6) at Level 50
- **Player 2**: Venusaur (Pokédex #3) at Level 50
- **Why These Two?**: Gen 1 starters with type advantage dynamic (Fire vs Grass)
- **Future Enhancement**: Allow users to specify Pokémon/level via command options

**Initialization Triggers**:
- First `/battle-turn` invocation by a user
- After previous session deleted due to KO

**Initialization Dependencies**:
- **dexApi.getSpecies()**: Fetches Pokémon data from Dexpack cache (see Section 9.10)
- **initBattle()**: From `src/core/battle/engine.ts` (deterministic battle initialization)

**Performance**:
- **Dexpack Lookup**: <1μs (L1 cache hit) or 0.3-1ms (cache miss + Dexpack fallback)
- **initBattle()**: ~5-10ms (stat calculation, move parsing, state allocation)
- **Total Initialization**: ~5-11ms per new session

**Phase 2: Active Session** (execute handler, lines 71-223):

Each `/battle-turn` invocation:
1. **Retrieve Session**: `ensureBattleState(userId)` (creates if missing)
2. **Parse Actions**: `parseActions(interaction.options)` (move/switch/item/forfeit)
3. **Resolve Turn**: `resolveTurn(state, actions, context)` (battle engine)
4. **Update Session**: Mutate `session.state` with new HP/status/turn
5. **Check KO**: If either Pokémon HP = 0, delete session + declare winner
6. **Format Response**: Embed with HP bars, status effects, move outcomes

**Session Persistence**:
- **Between Turns**: Session remains in SESSIONS Map
- **Across Minutes/Hours**: No timeout (session persists until KO or restart)
- **Not Persistent**: Lost on bot restart/deploy (intentional design)

**Phase 3: Termination** (lines 195-198):

```javascript
if (koPokemon) {
  SESSIONS.delete(interaction.user.id);
  logger.info(`[battle-turn] Session ended for ${interaction.user.id} - ${koPokemon.name} fainted`);
}
```

**KO Detection Logic**:
- Check `state.pokemon1.hp === 0` → Player 2 wins
- Check `state.pokemon2.hp === 0` → Player 1 wins
- Delete session immediately (free memory)
- Display winner in embed

**Manual Termination** (not yet implemented):
- `/battle-forfeit` command (future enhancement)
- Session timeout after 30 minutes inactivity (future enhancement)

**Implicit Termination**:
- Bot restart → All sessions lost (SESSIONS Map cleared)
- Bot deploy → All sessions lost (new process)

### 10.7.3 Turn Resolution Flow

**Step 1: Parse Discord Actions** (parseActions function, lines 54-58):

```javascript
function parseActions(options) {
  return {
    action1: { type: "move", moveSlot: options.getInteger("p1_move") - 1 },
    action2: { type: "move", moveSlot: options.getInteger("p2_move") - 1 }
  };
}
```

**Input**: Discord slash command options
- `p1_move`: Integer 1-4 (Player 1 move slot)
- `p2_move`: Integer 1-4 (Player 2 move slot)

**Output**: Engine-compatible action objects
- `moveSlot`: 0-indexed (Discord 1-4 → Engine 0-3)
- `type: "move"`: Only move actions currently supported (no switch/item/forfeit yet)

**Future Enhancements**:
- Switch actions (`p1_switch`, `p2_switch`)
- Item actions (`p1_item`, `p2_item`)
- Forfeit action (one-sided KO)

**Step 2: Resolve Turn** (execute handler, lines 89-95):

```javascript
const context = {
  rng,                     // RNG instance for damage rolls
  publicLog,               // Array to collect turn events
  allowFlinchSkip: true,   // Enable flinch mechanics
  movesIndex               // Dexpack moves cache
};

const { state: newState } = resolveTurn(session.state, actions, context);
```

**Context Parameters**:
- **rng**: Random Number Generator (for damage rolls, critical hits, accuracy)
- **publicLog**: Array collecting turn events (damage, status, faint, etc.)
- **allowFlinchSkip**: Boolean (enable flinch mechanics)
- **movesIndex**: Dexpack moves cache (for move data lookup)

**Engine Behavior**:
- **Speed Calculation**: Determines which Pokémon moves first
- **Accuracy Check**: Roll for move hit/miss
- **Damage Calculation**: Type effectiveness, STAB, stat modifiers, random variance
- **Status Effects**: Apply burn/poison/paralysis/etc.
- **Flinch/Priority**: Handle priority moves, flinch interruption
- **KO Detection**: Check HP = 0 after each action

**Performance**:
- **resolveTurn()**: ~1-3ms per turn (engine is pure JS, no async)
- **publicLog**: ~10-50 events per turn (damage, status, weather, etc.)
- **Memory**: newState replaces old state (~5 KB mutation)

**Step 3: Engine Write Buffer Integration** (lines 97-175):

```javascript
// Phase 17-22: Battle logging for analytics
if (engineWriteBuffer) {
  // Log move usage for both Pokémon
  const p1Move = session.state.pokemon1.moves[actions.action1.moveSlot];
  engineWriteBuffer.logMoveUsage({
    pokemonId: session.state.pokemon1.species.id,
    moveId: p1Move.id,
    outcome: publicLog[0]?.type, // "damage" | "miss" | "faint"
    timestamp: Date.now()
  });
  
  // Log battle completion on KO
  if (session.state.ended) {
    engineWriteBuffer.logBattle({
      winner: session.state.winner,
      turns: session.state.turn,
      duration: Date.now() - sessionStartTime,
      p1_species: session.state.pokemon1.species.id,
      p2_species: session.state.pokemon2.species.id
    });
  }
}
```

**Integration Points**:
- **engineWriteBuffer.logMoveUsage()**: Records every move used in battle
- **engineWriteBuffer.logBattle()**: Records battle completion (winner, duration, turns)
- **Purpose**: Analytics for move effectiveness, battle balance, species win rates

**Write Buffer Behavior** (see Section 9.9.2):
- **Performance**: <10μs per log call (non-blocking)
- **Backpressure**: 75% warn, 95% reject (graceful degradation)
- **Flush**: Every 30s → Write-DB → Upload to PROD (daily)

**Graceful Degradation**:
```javascript
if (!engineWriteBuffer) {
  logger.warn("[battle-turn] Engine Write Buffer not available - skipping analytics");
}
```

**Step 4: Format Embed Response** (lines 177-217):

```javascript
const embed = new EmbedBuilder()
  .setTitle(`⚔️ Battle Turn ${newState.turn}`)
  .setDescription(publicLog.map(formatLogEvent).join("\n"))
  .addFields(
    {
      name: `${typeEmoji(p1.species.types[0])} ${p1.species.name}`,
      value: formatSummaryLine(p1),
      inline: true
    },
    {
      name: `${typeEmoji(p2.species.types[0])} ${p2.species.name}`,
      value: formatSummaryLine(p2),
      inline: true
    }
  );

if (koPokemon) {
  embed.setColor(0xFF0000); // Red for KO
  embed.setFooter({ text: `${winner} wins! Session ended.` });
  SESSIONS.delete(interaction.user.id);
}
```

**Embed Components**:
- **Title**: Turn number (e.g., "⚔️ Battle Turn 5")
- **Description**: Turn events from publicLog (damage, status, faint)
- **Fields**: HP/status summaries for both Pokémon
- **Color**: Green (ongoing) or Red (KO)
- **Footer**: Winner declaration on KO

**HP Bar Formatting** (formatSummaryLine function, lines 20-32):

```javascript
function formatSummaryLine(p) {
  const pct = Math.floor((p.hp / p.maxHp) * 100);
  const bar = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));
  return `HP: ${bar} ${p.hp}/${p.maxHp} (${pct}%)\n${statusEmoji(p.status)}`;
}
```

**Visual Representation**:
```
HP: ████████░░ 156/200 (78%)
🔥 Burned
```

**Type Emojis** (lines 12-18):
- Fire: 🔥
- Water: 💧
- Grass: 🌿
- Electric: ⚡
- Ice: ❄️
- Fighting: 🥊
- Poison: ☠️
- Ground: 🏔️
- Flying: 🦅
- Psychic: 🔮
- Bug: 🐛
- Rock: 🪨
- Ghost: 👻
- Dragon: 🐉
- Dark: 🌑
- Steel: ⚙️
- Fairy: ✨

### 10.7.4 Performance Characteristics

**Turn Resolution Latency**:

| Phase | Duration | Notes |
|-------|----------|-------|
| Parse Actions | <1ms | Simple option extraction |
| Dexpack Lookup | <1μs - 1ms | L1 cache hit → fallback |
| Engine resolveTurn | 1-3ms | Pure JS, deterministic |
| Write Buffer Log | <10μs | Non-blocking, queued |
| Embed Formatting | 1-2ms | String manipulation |
| Discord API | 50-200ms | Network round-trip |
| **Total User-Facing** | **52-206ms** | Dominated by Discord API |

**Cooldown Protection** (line 68):

```javascript
const data = {
  name: "battle-turn",
  description: "Execute a turn in your ongoing battle",
  cooldown: 2000, // 2 seconds per user
  // ...
};
```

**Cooldown Behavior** (see Section 10.6):
- **Per-User**: Each user has independent 2-second cooldown
- **Purpose**: Prevent accidental double-submission, reduce API spam
- **Bypass**: None (admin/owner subject to same cooldown)

**Why 2 Seconds?**:
- **User Experience**: Enough time to read previous turn results
- **API Protection**: Prevents rapid-fire command spam
- **Not Too Restrictive**: Fast-paced battles still feel responsive

**Memory Consumption**:

| Component | Size per Session | 100 Users | 1000 Users |
|-----------|------------------|-----------|------------|
| SESSIONS Map | 50 bytes | 5 KB | 50 KB |
| BattleState | 2-5 KB | 200-500 KB | 2-5 MB |
| publicLog | 1-3 KB | 100-300 KB | 1-3 MB |
| **Total** | **3-8 KB** | **305-805 KB** | **3-8 MB** |

**Memory Safety**:
- **Bounded**: One session per user (can't create multiple)
- **Auto-Cleanup**: Sessions deleted on KO
- **No Timeout**: Long-running sessions persist (future enhancement: 30-minute timeout)
- **Restart Cleanup**: All sessions lost on restart (intentional)

### 10.7.5 Persistence Limitations

**Not Persistent** (Intentional Design):

The battle-turn command maintains **zero persistence**. Sessions exist only in the SESSIONS Map (JavaScript heap memory). When the bot restarts or deploys, all sessions are lost.

**Why No Persistence?**:

1. **Testing/Debugging Tool**: Not intended for production gameplay
2. **Ephemeral Workflows**: Developers/testers restart battles frequently
3. **Complexity Avoidance**: No database schema, migration, or sync logic
4. **Performance Priority**: In-memory operations (<1μs lookup vs 50-100ms PostgreSQL)
5. **Memory Safety**: Auto-cleanup on restart prevents unbounded growth

**User Experience Impact**:

```
User starts battle → Bot restarts → User runs /battle-turn again
→ New session created (Charizard vs Venusaur) → Previous progress lost
```

**Mitigation**:
- **Documentation**: Help text warns "Sessions reset on bot restart"
- **Quick Recovery**: New session initializes in <11ms
- **Default Matchup**: Charizard vs Venusaur always available (no configuration needed)

**When Persistence Would Be Needed**:

If battle-turn becomes a production feature (not just testing), implement:
1. **Database Schema**: `BattleSessions` table with userId, state (JSONB), created_at, updated_at
2. **Save on Each Turn**: `await prisma.battleSessions.upsert({ where: { userId }, data: { state: newState } })`
3. **Load on Command**: `const session = await prisma.battleSessions.findUnique({ where: { userId } })`
4. **Timeout Cleanup**: Cron job deletes sessions >30 minutes old

**Current Status**: Persistence is **not planned** (battle-turn remains testing tool).

**Related Documentation**:

The limitation is documented in `docs/architecture-bible/16-boot-sequence.md` (SEAMLESS-RESTART-ARCHITECTURE.md):

> "Battle sessions are ephemeral (in-memory only). On restart, users must begin new battles. This is acceptable for a testing/debugging interface."

### 10.7.6 Usage Patterns

**Typical Workflow**:

```
Step 1: User runs /battle-turn p1_move:1 p2_move:2
  → New session created (Charizard vs Venusaur)
  → Turn 1 resolves
  → Embed shows HP/status + turn events

Step 2: User runs /battle-turn p1_move:3 p2_move:1
  → Session retrieved from SESSIONS Map
  → Turn 2 resolves
  → Embed shows updated HP/status

Step 3: Charizard faints
  → Winner declared (Venusaur wins!)
  → Session deleted from SESSIONS Map
  → User must start new battle
```

**Command Options**:

```javascript
{
  name: "p1_move",
  description: "Player 1 move (1-4)",
  type: ApplicationCommandOptionType.Integer,
  required: true,
  choices: [
    { name: "Move 1", value: 1 },
    { name: "Move 2", value: 2 },
    { name: "Move 3", value: 3 },
    { name: "Move 4", value: 4 }
  ]
},
{
  name: "p2_move",
  description: "Player 2 move (1-4)",
  type: ApplicationCommandOptionType.Integer,
  required: true,
  choices: [
    { name: "Move 1", value: 1 },
    { name: "Move 2", value: 2 },
    { name: "Move 3", value: 3 },
    { name: "Move 4", value: 4 }
  ]
}
```

**User Experience**:
- **Simple**: Only 2 parameters (p1_move, p2_move)
- **Clear**: Move slots labeled 1-4 (matches Pokémon game UI)
- **Fast**: Response within 50-200ms (Discord API latency)
- **Visual**: HP bars, type emojis, status effects in embed

**Limitations**:

1. **Fixed Matchup**: Always Charizard vs Venusaur (no customization yet)
2. **Move-Only**: Can't switch Pokémon, use items, or forfeit
3. **Two-Player Simulation**: Both sides controlled by same user (no PvP)
4. **No Spectators**: Sessions are private (only the user can see their battle)
5. **No History**: Can't review past turns (only current turn shown)

**Future Enhancements** (not yet implemented):

```javascript
// Custom Pokémon selection
{
  name: "p1_species",
  type: ApplicationCommandOptionType.String,
  required: false,
  autocomplete: true // Search Pokédex
}

// Switch actions
{
  name: "p1_action",
  type: ApplicationCommandOptionType.String,
  choices: [
    { name: "Use Move", value: "move" },
    { name: "Switch Pokémon", value: "switch" },
    { name: "Use Item", value: "item" },
    { name: "Forfeit", value: "forfeit" }
  ]
}

// Battle history command
/battle-history → Shows last 10 turns with HP deltas, move names, outcomes
```

### 10.7.7 Observability & Monitoring

**Logger Integration** (lines 52, 96, 198):

```javascript
logger.info(`[battle-turn] Created new session for user ${userId}`);
logger.info(`[battle-turn] Turn ${newState.turn} resolved for ${userId}`);
logger.info(`[battle-turn] Session ended for ${userId} - ${koPokemon.name} fainted`);
```

**Log Events**:
- **Session Creation**: When new user first runs /battle-turn
- **Turn Resolution**: After each turn (includes turn number)
- **Session Termination**: When battle ends (includes winner)

**Metrics Available** (via Write Buffer):

```javascript
// Move Usage Analytics
{
  pokemonId: 6,        // Charizard
  moveId: 126,         // Fire Blast
  outcome: "damage",   // or "miss", "faint"
  timestamp: 1700000000
}

// Battle Completion Analytics
{
  winner: 1,           // Player 1 (Charizard)
  turns: 8,            // Battle lasted 8 turns
  duration: 45000,     // 45 seconds total
  p1_species: 6,       // Charizard
  p2_species: 3        // Venusaur
}
```

**Analytics Queries** (future, when Write-DB uploads to PROD):

```sql
-- Top 10 most-used moves in battle-turn command
SELECT moveId, COUNT(*) as uses 
FROM move_usage 
WHERE source = 'battle-turn-command'
GROUP BY moveId 
ORDER BY uses DESC 
LIMIT 10;

-- Average battle duration by Pokémon matchup
SELECT p1_species, p2_species, AVG(turns) as avg_turns, AVG(duration) as avg_duration
FROM battle_logs
WHERE source = 'battle-turn-command'
GROUP BY p1_species, p2_species;

-- Win rates for Charizard vs Venusaur
SELECT winner, COUNT(*) as wins
FROM battle_logs
WHERE (p1_species = 6 AND p2_species = 3) OR (p1_species = 3 AND p2_species = 6)
GROUP BY winner;
```

**Session Count Telemetry** (proposed, not yet implemented):

```javascript
// Add to logger auto-refresh (src/utils/logger.js)
const sessionCount = SESSIONS.size;
console.log(`[Sessions] Active battles: ${sessionCount}`);

// Add to /ops stats command
/ops stats → Shows:
- Active battle-turn sessions: 5
- Total turns resolved today: 127
- Average turns per battle: 6.3
```

### 10.7.8 Error Handling

**Graceful Degradation**:

```javascript
// Write Buffer unavailable
if (!engineWriteBuffer) {
  logger.warn("[battle-turn] Engine Write Buffer not available - skipping analytics");
  // Battle continues normally (analytics optional)
}

// Dexpack lookup failure
try {
  const charizard = dexApi.getSpecies(6);
  const venusaur = dexApi.getSpecies(3);
} catch (err) {
  logger.error("[battle-turn] Failed to load default Pokémon", err);
  await interaction.reply({
    content: "❌ Battle system unavailable (Pokémon data missing)",
    ephemeral: true
  });
  return;
}

// Engine crash
try {
  const { state: newState } = resolveTurn(session.state, actions, context);
} catch (err) {
  logger.error("[battle-turn] Turn resolution failed", err);
  SESSIONS.delete(userId); // Clean up corrupted session
  await interaction.reply({
    content: "❌ Battle engine error - session reset. Try again.",
    ephemeral: true
  });
  return;
}
```

**Error Categories**:

| Error | Cause | Recovery | User Impact |
|-------|-------|----------|-------------|
| Dexpack Missing | L1 cache + Dexpack both unavailable | Reject command, show error message | Can't start battles |
| Engine Crash | Bug in resolveTurn() (divide by zero, null reference, etc.) | Delete session, log error, allow retry | Lose current battle progress |
| Write Buffer Full | Backpressure threshold exceeded (95%+ utilization) | Skip analytics, continue battle | No analytics (battle works) |
| Discord API Timeout | Network issue, rate limit, Discord outage | Retry with exponential backoff | Delayed response (30-60s) |

**Testing Error Paths**:

```javascript
// Mock Dexpack failure
vi.mock("../data/dexpack.js", () => ({
  dexApi: {
    getSpecies: vi.fn(() => { throw new Error("Dexpack unavailable"); })
  }
}));

// Expect graceful error message
const reply = await executeCommand(interaction);
expect(reply.content).toContain("Pokémon data missing");
expect(SESSIONS.size).toBe(0); // No session created
```

### 10.7.9 Testing & Validation

**Unit Tests** (tests/commands/battle-turn.spec.ts, not yet created):

```typescript
describe("battle-turn command", () => {
  beforeEach(() => {
    SESSIONS.clear(); // Reset sessions before each test
  });

  it("creates new session on first invocation", async () => {
    const interaction = mockInteraction({ userId: "user123" });
    await executeCommand(interaction);
    
    expect(SESSIONS.size).toBe(1);
    expect(SESSIONS.has("user123")).toBe(true);
  });

  it("reuses session on subsequent invocations", async () => {
    const interaction = mockInteraction({ userId: "user123" });
    
    await executeCommand(interaction); // Turn 1
    const session1 = SESSIONS.get("user123");
    
    await executeCommand(interaction); // Turn 2
    const session2 = SESSIONS.get("user123");
    
    expect(session1).toBe(session2); // Same object reference
    expect(session2.state.turn).toBe(2); // Turn incremented
  });

  it("deletes session when Pokémon faints", async () => {
    const interaction = mockInteraction({ userId: "user123" });
    
    // Mock battle state where Charizard faints this turn
    SESSIONS.set("user123", {
      state: mockBattleState({ pokemon1: { hp: 5 }, pokemon2: { hp: 150 } })
    });
    
    await executeCommand(interaction); // Charizard takes fatal damage
    
    expect(SESSIONS.has("user123")).toBe(false); // Session deleted
  });

  it("handles Dexpack unavailable error", async () => {
    vi.mock("../data/dexpack.js", () => ({
      dexApi: { getSpecies: vi.fn(() => { throw new Error("Dexpack unavailable"); }) }
    }));
    
    const interaction = mockInteraction({ userId: "user123" });
    await executeCommand(interaction);
    
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("data missing") })
    );
    expect(SESSIONS.size).toBe(0); // No session created
  });

  it("logs move usage to Write Buffer", async () => {
    const mockLogMoveUsage = vi.fn();
    vi.mock("../services/engine-write-buffer.js", () => ({
      engineWriteBuffer: { logMoveUsage: mockLogMoveUsage }
    }));
    
    const interaction = mockInteraction({ userId: "user123", p1_move: 1, p2_move: 2 });
    await executeCommand(interaction);
    
    expect(mockLogMoveUsage).toHaveBeenCalledTimes(2); // Both Pokémon
    expect(mockLogMoveUsage).toHaveBeenCalledWith(
      expect.objectContaining({ pokemonId: 6, moveId: expect.any(Number) })
    );
  });
});
```

**Integration Tests** (tests/integration/battle-turn.spec.ts, not yet created):

```typescript
describe("battle-turn integration", () => {
  it("resolves full battle from start to KO", async () => {
    const interaction = mockInteraction({ userId: "user123" });
    
    // Turn 1-5: Normal damage
    for (let i = 0; i < 5; i++) {
      const reply = await executeCommand(interaction);
      expect(reply.embeds[0].title).toContain(`Turn ${i + 1}`);
    }
    
    // Turn 6: Venusaur faints
    const finalReply = await executeCommand(interaction);
    expect(finalReply.embeds[0].footer.text).toContain("wins");
    expect(SESSIONS.has("user123")).toBe(false); // Session deleted
  });

  it("handles concurrent battles (different users)", async () => {
    const user1 = mockInteraction({ userId: "user123" });
    const user2 = mockInteraction({ userId: "user456" });
    
    await executeCommand(user1); // User 1 starts battle
    await executeCommand(user2); // User 2 starts battle
    
    expect(SESSIONS.size).toBe(2);
    expect(SESSIONS.get("user123")).not.toBe(SESSIONS.get("user456")); // Independent sessions
  });

  it("respects cooldown between invocations", async () => {
    const interaction = mockInteraction({ userId: "user123" });
    
    await executeCommand(interaction); // Turn 1
    const reply2 = await executeCommand(interaction); // Immediate retry (within 2s)
    
    expect(reply2.content).toContain("cooldown"); // Rejected
    
    await sleep(2000); // Wait for cooldown
    const reply3 = await executeCommand(interaction); // Turn 2 (after cooldown)
    expect(reply3.embeds[0].title).toContain("Turn 2"); // Success
  });
});
```

**Manual Testing Checklist**:

```
✅ Start new battle → Session created, Charizard vs Venusaur displayed
✅ Execute multiple turns → HP decreases, status effects apply
✅ Battle to completion → Winner declared, session deleted
✅ Start new battle after KO → Fresh session (HP reset to max)
✅ Bot restart → All sessions lost, new battles start fresh
✅ Concurrent users → Independent sessions (no cross-contamination)
✅ Cooldown enforcement → 2-second delay between commands
✅ Write Buffer integration → Move usage logged (verify in /ops engine)
✅ Error handling → Graceful error messages when Dexpack/engine unavailable
✅ Embed formatting → HP bars, type emojis, status icons display correctly
```

### 10.7.10 Integration Points

**Dexpack Integration** (see Section 9.10):

```javascript
const charizard = dexApi.getSpecies(6);   // L1 cache → Dexpack fallback
const venusaur = dexApi.getSpecies(3);    // <1μs (cache hit) or 0.3-1ms (miss)
```

**Battle Engine Integration** (see Section 9.1-9.3):

```javascript
const initialState = initBattle(charizard, venusaur, 50, 50);
const { state: newState } = resolveTurn(session.state, actions, context);
```

**Engine Write Buffer Integration** (see Section 9.9.2):

```javascript
engineWriteBuffer.logMoveUsage({ pokemonId, moveId, outcome, timestamp });
engineWriteBuffer.logBattle({ winner, turns, duration, p1_species, p2_species });
```

**Cooldown System Integration** (see Section 10.6):

```javascript
const data = {
  name: "battle-turn",
  cooldown: 2000, // 2 seconds per user
  // ...
};
```

**Logger Integration** (see Section 5.5):

```javascript
logger.info(`[battle-turn] Created new session for user ${userId}`);
logger.error("[battle-turn] Turn resolution failed", err);
```

**Discord.js Embed Integration** (see Section 10.2):

```javascript
const embed = new EmbedBuilder()
  .setTitle(`⚔️ Battle Turn ${newState.turn}`)
  .addFields({ name: p1.species.name, value: formatSummaryLine(p1) })
  .setColor(0xFF0000);
```

### 10.7.11 Known Limitations

**Persistence** (Intentional):
- Sessions lost on restart (no database backing)
- No battle history (can't review past turns)
- No recovery after bot crash (must start new battle)

**Customization** (Not Yet Implemented):
- Fixed matchup (Charizard vs Venusaur only)
- Fixed level (50 only)
- No Pokémon selection (can't choose species)
- No level selection (can't set custom levels)

**Action Types** (Partial Implementation):
- Move actions only (can't switch, use items, forfeit)
- No multi-turn moves (Future Sight, etc. not supported)
- No form changes (Mega Evolution, Dynamax not implemented)

**Multiplayer** (Single-Player Only):
- Both sides controlled by same user (no PvP)
- No spectators (sessions are private)
- No team-based battles (singles only, no doubles/triples)

**Session Management** (No Timeout):
- Sessions persist indefinitely until KO or restart
- No 30-minute inactivity timeout (future enhancement)
- No manual session reset command (must finish battle or restart bot)

**User Experience**:
- No autocomplete for move names (only slots 1-4)
- No move descriptions (must know move effects)
- No damage preview (can't see type effectiveness before moving)
- No AI opponent (both sides user-controlled)

### 10.7.12 Future Enhancements

**Phase 1: Customization** (Priority: HIGH):
- Add `p1_species` and `p2_species` options (autocomplete Pokédex search)
- Add `p1_level` and `p2_level` options (1-100 range)
- Add `battle_format` option (singles/doubles/triples)
- Add `/battle-reset` command (force-delete session)

**Phase 2: Action Expansion** (Priority: MEDIUM):
- Implement switch actions (p1_switch, p2_switch)
- Implement item actions (p1_item, p2_item)
- Implement forfeit action (one-sided KO)
- Implement AI opponent mode (user vs bot)

**Phase 3: Persistence** (Priority: LOW):
- Add database schema (BattleSessions table)
- Save sessions on each turn (upsert to PostgreSQL)
- Load sessions on command invocation
- Add 30-minute inactivity timeout (cron cleanup)

**Phase 4: Multiplayer** (Priority: LOW):
- Implement PvP mode (two users, one battle)
- Add spectator mode (view-only access)
- Add battle invites (challenge another user)
- Add ranked ladder (win/loss tracking)

**Phase 5: UX Improvements** (Priority: MEDIUM):
- Add move autocomplete (search by name)
- Add move descriptions (show effect text)
- Add damage preview (calculate type effectiveness)
- Add battle history command (/battle-history)
- Add replay system (download battle log as JSON)

**Phase 6: Analytics Dashboard** (Priority: LOW):
- Add `/battle-stats` command (personal win/loss, favorite Pokémon)
- Add global leaderboard (most battles, highest win rate)
- Add move usage heatmap (which moves used most often)
- Add species matchup matrix (win rates by type)

### 10.7.13 Cross-References

**Related Architecture Bible Sections**:
- **Section 9.1-9.3** (Battle Engine) — Core battle logic, turn resolution, damage calculation
- **Section 9.9** (Engine Workers) — Write Buffer integration for battle analytics
- **Section 9.10** (Dexpack → Engine Cache) — Pokémon/move data lookup for default matchup
- **Section 10.2** (Discord Bot Initialization) — Command loading, interaction routing
- **Section 10.6** (Cooldown System) — Per-user 2-second cooldown enforcement
- **Section 5.5** (Logger Auto-Refresh) — Session creation/termination logging

**Related Operations Bible Sections**:
- **operations-bible/03-monitoring.md** — Session count telemetry (future)
- **operations-bible/06-runbooks.md** — Battle-turn troubleshooting (sessions stuck, KO not detecting)

**Related Development Bible Sections**:
- **development-bible/04-testing.md** — Battle-turn unit/integration test patterns
- **development-bible/02-local-development.md** — Testing battles locally (Dexpack must be loaded)

**Related Source Files**:
- `src/commands/battle-turn.js` (223 lines) — Complete command implementation
- `src/core/battle/engine.ts` (lines 1-500) — Battle engine (initBattle, resolveTurn)
- `src/data/dexpack.js` (lines 1-100) — Dexpack cache (getSpecies for Charizard/Venusaur)
- `src/services/engine-write-buffer.ts` (lines 100-150) — Battle/move logging integration
- `src/lib/cooldown.js` (lines 50-75) — Cooldown enforcement for battle-turn command
- `src/utils/logger.js` (lines 200-250) — Session lifecycle logging

---

[← Back to INDEX](INDEX.md) | [← Previous: Game Engine](09-game-engine.md) | [Next: Safety Guarantees →](11-safety-guarantees.md)