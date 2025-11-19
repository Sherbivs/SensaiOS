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

---

[← Back to INDEX](INDEX.md) | [← Previous: Game Engine](09-game-engine.md) | [Next: Safety Guarantees →](11-safety-guarantees.md)