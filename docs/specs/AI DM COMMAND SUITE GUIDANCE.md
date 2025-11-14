# DM Admin: `!ops stats` Command Implementation

This document describes how to wire a Discord bot so it can respond to **DM admin commands** like `!ops stats`, using:

- **Node.js + TypeScript**
- **discord.js v14**
- **Prisma** for database access

The focus is the `stats` DM command, but the pattern is reusable for other `!ops` admin commands.

---

## 1. Discord Client Setup for DMs

To receive **DM messages**, the bot must:

1. Enable the proper **gateway intents**.
2. Enable **partials** for DMs.

```ts
// src/bot/client.ts
import {
  Client,
  GatewayIntentBits,
  Partials,
} from 'discord.js';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent, // required to read message.content
  ],
  partials: [Partials.Channel, Partials.Message],
});
```

Also ensure in the Discord Developer Portal:

* **Message Content Intent** is enabled
* Users allow DMs from server members (otherwise the bot can't DM them)

---

## 2. DM Admin Router Overview

The DM admin flow looks like this:

1. User DMs the bot: `!ops stats --limit 20`.
2. Bot checks:
   * Is it a DM?
   * Is the author allowed to use admin commands?
   * Are they under the rate limit?
3. Parse the DM into `{command, args, flags}`.
4. Dispatch `stats` to a handler that queries Prisma and replies with an embed.

### 2.1 Env Configuration

```ts
// src/config/env.ts
export const DM_ADMIN_ENABLED =
  process.env.DM_ADMIN_ENABLED === 'true';

export const DM_ADMIN_PREFIX =
  process.env.DM_ADMIN_PREFIX || '!ops';

export const DM_ADMIN_RATE_LIMIT =
  parseInt(process.env.DM_ADMIN_RATE_LIMIT || '10', 10);

export const DRIP_ALERT_RECIPIENT =
  process.env.DRIP_ALERT_RECIPIENT ?? ''; // your Discord user ID
```

### 2.2 DM Auth Helpers

```ts
// src/utils/dm-auth.ts
import { Message, ChannelType } from 'discord.js';
import { DRIP_ALERT_RECIPIENT } from '../config/env.js';

export function isAuthorizedDmAdmin(userId: string): boolean {
  const authorizedIds = [DRIP_ALERT_RECIPIENT].filter(Boolean);
  return authorizedIds.includes(userId);
}

export function isDmCommand(message: Message): boolean {
  return message.channel.type === ChannelType.DM;
}
```

---

## 3. Rate Limiting for DM Admin

Simple in-memory **per-user rate limit**: N commands per minute.

```ts
// src/utils/dm-rate-limiter.ts
import { DM_ADMIN_RATE_LIMIT } from '../config/env.js';

const commandCounts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  userId: string,
  limit: number = DM_ADMIN_RATE_LIMIT,
): boolean {
  const now = Date.now();
  const windowMs = 60_000; // 1 minute

  const userData = commandCounts.get(userId);

  if (!userData || now >= userData.resetAt) {
    commandCounts.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (userData.count >= limit) {
    return false;
  }

  userData.count++;
  return true;
}
```

---

## 4. DM Command Parsing

Commands follow this pattern:

```text
!ops <command> [args...] [--flag value] [--flag2]
```

Example:

* `!ops stats`
* `!ops stats --limit 20`
* `!ops stats --participant 123456789012345678 --after 2025-01-01T00:00:00.000Z`

```ts
// src/bot/dm-admin.ts
import type { Message } from 'discord.js';
import { DM_ADMIN_PREFIX } from '../config/env.js';

export type ParsedDmCommand = {
  command: string;
  args: string[];
  flags: Record<string, string>;
};

export function parseDmCommand(content: string): ParsedDmCommand | null {
  if (!content.startsWith(DM_ADMIN_PREFIX)) return null;

  const parts = content.slice(DM_ADMIN_PREFIX.length).trim().split(/\s+/);
  const command = parts[0]?.toLowerCase();
  if (!command) return null;

  const args: string[] = [];
  const flags: Record<string, string> = {};

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith('--')) {
      const key = part.slice(2);
      const value =
        parts[i + 1] && !parts[i + 1].startsWith('--')
          ? parts[i + 1]
          : 'true';
      flags[key] = value;
      if (value !== 'true') i++;
    } else {
      args.push(part);
    }
  }

  return { command, args, flags };
}
```

---

## 5. DM Router + Dispatcher

This is the central DM admin handler. It:

* Filters non-DMs and bot messages
* Authenticates admin user
* Checks rate limit
* Parses and dispatches to the appropriate command handler

```ts
// src/bot/dm-admin-router.ts
import type { Message } from 'discord.js';
import { isAuthorizedDmAdmin, isDmCommand } from '../utils/dm-auth.js';
import { checkRateLimit } from '../utils/dm-rate-limiter.js';
import { parseDmCommand, ParsedDmCommand } from './dm-admin.js';
import { handleStatsCommand } from './dm-commands/stats.js';
import { handleMemoryCommand } from './dm-commands/memory.js';
// ... import other command handlers

async function executeDmCommand(message: Message, parsed: ParsedDmCommand) {
  const { command, flags, args } = parsed;

  switch (command) {
    case 'stats':
      return handleStatsCommand(message, flags);
    case 'memory':
      return handleMemoryCommand(message, flags);
    // case 'state': ...
    // case 'ping': ...
    default:
      return message.reply(`❓ Unknown command: \`${command}\`. Try \`!ops help\`.`);
  }
}

export async function onDmMessage(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!isDmCommand(message)) return;

  const parsed = parseDmCommand(message.content);
  if (!parsed) return; // not an !ops command

  if (!isAuthorizedDmAdmin(message.author.id)) {
    await message.reply('⛔ Unauthorized. Admin commands are restricted.');
    return;
  }

  if (!checkRateLimit(message.author.id)) {
    await message.reply('⏱️ Rate limit: too many commands, slow down a bit.');
    return;
  }

  await executeDmCommand(message, parsed);
}
```

Wire this into your client:

```ts
// src/bot/main.ts
import { client } from './client.js';
import { onDmMessage } from './dm-admin-router.js';

client.on('messageCreate', (message) => {
  onDmMessage(message).catch((err) => {
    console.error('DM admin error', err);
  });
});
```

---

## 6. Stats Models in Prisma

A minimal example of the models used for `!ops stats`:

```prisma
// prisma/schema.prisma

model User {
  id          String   @id @default(cuid())
  discordId   String   @unique
  createdAt   DateTime @default(now())
  lastSeenAt  DateTime @default(now())
  // ...
}

model Encounter {
  id        String   @id @default(cuid())
  userId    String
  createdAt DateTime @default(now())
  // ...
}

model Battle {
  id          String   @id @default(cuid())
  createdAt   DateTime @default(now())
  status      String   // 'IN_PROGRESS' | 'COMPLETED' | ...
  participants BattleParticipant[]
}

model BattleParticipant {
  id       String @id @default(cuid())
  battleId String
  userId   String
  // ...
}
```

---

## 7. Stats Query Helpers

These helpers encapsulate the actual stats queries:

```ts
// src/ops/stats.ts
import { prisma } from '../db/client.js';
import { subHours } from 'date-fns';

export type OpsStats = {
  totalUsers: number;
  activeUsers24h: number;
  totalEncounters: number;
  totalBattles: number;
  openBattles: number;
};

export async function getOpsStats(): Promise<OpsStats> {
  const [totalUsers, activeUsers24h, totalEncounters, totalBattles, openBattles] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: { lastSeenAt: { gte: subHours(new Date(), 24) } },
      }),
      prisma.encounter.count(),
      prisma.battle.count(),
      prisma.battle.count({ where: { status: 'IN_PROGRESS' } }),
    ]);

  return {
    totalUsers,
    activeUsers24h,
    totalEncounters,
    totalBattles,
    openBattles,
  };
}

export async function getRecentBattles(options: {
  limit: number;
  after?: Date;
  participantId?: string;
}) {
  const { limit, after, participantId } = options;

  return prisma.battle.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    where: {
      ...(after && { createdAt: { gte: after } }),
      ...(participantId && {
        participants: { some: { userId: participantId } },
      }),
    },
    include: {
      participants: true,
    },
  });
}
```

---

## 8. Stats Embed Formatter

Formats the stats into a Discord embed:

```ts
// src/utils/dm-stats-formatter.ts
import { EmbedBuilder } from 'discord.js';
import type { OpsStats } from '../ops/stats.js';

export function formatStatsEmbed(
  stats: OpsStats,
  recentBattles: {
    id: string;
    createdAt: Date;
    status: string;
    participants: { userId: string }[];
  }[],
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📊 System Stats')
    .setTimestamp();

  embed.addFields(
    {
      name: 'Users',
      value:
        `Total: **${stats.totalUsers}**\n` +
        `Active (24h): **${stats.activeUsers24h}**`,
      inline: true,
    },
    {
      name: 'Battles',
      value:
        `Total: **${stats.totalBattles}**\n` +
        `In Progress: **${stats.openBattles}**`,
      inline: true,
    },
    {
      name: 'Encounters',
      value: `Total: **${stats.totalEncounters}**`,
      inline: true,
    },
  );

  if (recentBattles.length > 0) {
    const lines = recentBattles.map((b) => {
      const shortId = b.id.slice(0, 8);
      const status = b.status.toLowerCase();
      const participantCount = b.participants.length;
      return `\`${shortId}\` • ${status} • ${participantCount} participant(s)`;
    });

    embed.addFields({
      name: `Recent Battles (${recentBattles.length})`,
      value: lines.join('\n').slice(0, 1024),
    });
  }

  return embed;
}
```

---

## 9. DM Command Handler: `!ops stats`

Implements the actual command logic and replies:

```ts
// src/bot/dm-commands/stats.ts
import type { Message } from 'discord.js';
import { getOpsStats, getRecentBattles } from '../../ops/stats.js';
import { formatStatsEmbed } from '../../utils/dm-stats-formatter.js';

type Flags = {
  limit?: string;
  after?: string;
  participant?: string;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export async function handleStatsCommand(
  message: Message,
  rawFlags: Record<string, string>,
): Promise<void> {
  const flags = rawFlags as Flags;

  const limitRaw = flags.limit ? parseInt(flags.limit, 10) : 10;
  const limit = clamp(Number.isFinite(limitRaw) ? limitRaw : 10, 1, 50);

  const after = flags.after ? new Date(flags.after) : undefined;
  const participantId = flags.participant;

  const [stats, recentBattles] = await Promise.all([
    getOpsStats(),
    getRecentBattles({ limit, after, participantId }),
  ]);

  const embed = formatStatsEmbed(stats, recentBattles);
  await message.reply({ embeds: [embed] });
}
```

---

## 10. Example Usage

From your admin Discord account (matching `DRIP_ALERT_RECIPIENT`):

```text
!ops stats
!ops stats --limit 20
!ops stats --participant 123456789012345678
!ops stats --after 2025-11-14T00:00:00.000Z
```

The bot responds in DM with:

* Total users (and active users in last 24h)
* Total encounters
* Total battles and in-progress battles
* Recent battles, up to `--limit`, optionally filtered by `--after` and `--participant`

This same pattern can be extended to other commands:

* `!ops memory`
* `!ops state`
* `!ops cache`
* `!ops engine`
* `!ops errors`

All using: **DM → auth → rate limit → parse → dispatch → Prisma → embed → reply**.

---

## Document Metadata

**Created:** 2025-11-14  
**Purpose:** AI-generated reference implementation for DM admin command architecture  
**Integration:** See `DM-ADMIN-IMPLEMENTATION-GUIDE.md` for complete Phase 1-6 implementation  
**Cross-Reference:** See `DM-ADMIN-DOCS-INDEX.md` for navigation hub
