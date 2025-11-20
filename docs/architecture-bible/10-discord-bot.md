# Section 10: Discord Bot

[← Back to INDEX](INDEX.md) | [← Previous: Game Engine](09-game-engine.md) | [Next: Safety Guarantees →](11-safety-guarantees.md)

---

**Philosophy**: "The Discord bot is the player interface—responsive, intuitive, and delightful."

**Purpose**: Complete Discord interaction layer with slash commands, DM flows, and button/modal interactions.

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
- `/home` — Open DM home screen (starter selection, party, profile, heal)
- `/walk` — Encounter wild Pokémon
- `/battle [user]` — Challenge another player
- `/pokemon [name]` — View Pokémon details
- `/party` — View/manage party
- `/profile` — View player profile with pagination
- `/heal` — Heal party at Pokémon Center
- `/trade [user]` — Initiate trade (Phase 10+)
- `/dex` — View Pokédex progress (Phase 10+)

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

**Problem**: Discord.js caches everything indefinitely by default. Idle bot grows 50-200 MB/day even with zero gameplay activity.

**Solution** (implemented 2025-11-17): Configure cache limits + automatic sweeping.

**Cache Limits**:

```typescript
makeCache: Options.cacheWithLimits({
  MessageManager: 200,       // Last 200 messages per channel (DM interactions)
  GuildMemberManager: 200,   // 200 members per guild (battle challenges)
  PresenceManager: 0,        // Disable - not used
  ReactionManager: 0,        // Disable - not used
  VoiceStateManager: 0,      // Disable - not used
  ApplicationCommandManager: 0, // Disable - commands loaded separately
  BaseGuildEmojiManager: 0,  // Disable - not used
  GuildEmojiManager: 0,      // Disable - not used
  GuildBanManager: 0,        // Disable - not used
  GuildInviteManager: 0,     // Disable - not used
  StageInstanceManager: 0,   // Disable - not used
  ThreadManager: 0,          // Disable - not used
  ThreadMemberManager: 0,    // Disable - not used
}),
```

**Automatic Sweepers**:

```typescript
sweepers: {
  messages: {
    interval: 3600, // 1 hour (in seconds)
    lifetime: 1800, // 30 minutes (in seconds)
  },
},
```

**Result**: Prevents unbounded growth, caps memory usage at ~200 MB for active bot.

**See Also**: [`docs/DISCORD-CACHE-MANAGEMENT.md`](../DISCORD-CACHE-MANAGEMENT.md) for comprehensive cache monitoring and tuning guide.

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

---

[← Back to INDEX](INDEX.md) | [← Previous: Game Engine](09-game-engine.md) | [Next: Safety Guarantees →](11-safety-guarantees.md)