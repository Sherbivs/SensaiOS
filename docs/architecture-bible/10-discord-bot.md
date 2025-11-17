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

## 10.2 DM Implementation Guide

**Discord Client Setup** — Bootstrap Discord.js client with proper intents and event handlers.

**Client Initialization**:

```typescript
// src/bot/index.ts
import { Client, GatewayIntentBits, Partials } from "discord.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [
    Partials.Channel,  // Required for DMs
    Partials.Message,
  ],
});

client.once(Events.ClientReady, () => {
  log.info("Discord bot ready", { username: client.user.tag });
});

await client.login(process.env.DISCORD_TOKEN);
```

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

## 10.3 DM Admin Specification

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

## 10.4 DM Documentation Index

**Document Relationships** — How DM flow documentation connects to codebase.

**Documentation Structure**:

```
docs/discord-command-suite.md       → Complete command reference
docs/game-engine/battle-dm-flow.md  → Battle interaction flows
docs/game-engine/encounter-dm-flow.md → Wild encounter flows
src/bot/ROUTER.md                   → Code navigation for Discord bot layer
```

**Workflow**:

1. **User requests feature**: "Add trade command"
2. **Consult documentation**: Read `discord-command-suite.md` for existing patterns
3. **Locate code**: Use `src/bot/ROUTER.md` to find command handlers
4. **Implement**: Follow established patterns (command builder + execute function)
5. **Update docs**: Add trade command to documentation
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