# Prompt.md
Timestamp (UTC): 2025-10-26T12:20:00Z
Revision: 0.74

## Last Repo Changes (since previous Prompt.md revision)
> **AI MUST UPDATE THIS BLOCK ON EVERY PATCHSET**  
> Summarize the *effective* repository changes applied in the current commit in human-readable bullets:
> - Files/dirs added/modified/removed (paths relative to repo root)
> - Purpose of each change (one line)
> - Any schema/contract impacts to consumers (brief)
>
> Changes in this revision:
> - `src/commands/daily.js` — Added `/daily claim` slash command surface.
> - `src/bot/daily/claim.ts` — Implemented handler to award coins, refresh streaks, and enforce 24h cooldown using Prisma.
> - `src/bot/index.ts` — Routed the new command to `handleDailyClaim` with graceful subcommand messaging.
> - `tests/daily.spec.ts` — Covered claim success and cooldown-block responses via mocked Prisma.
> - `tasklist.md`, `ops/NEXT.yaml`, `ops/TOUCHMAP.yaml`, router docs — Marked T8.3 DONE, queued T8.4 (DM Home button), and refreshed routing metadata.


<!-- PATCHSET:ECHO BEGIN -->
HEAD: pending-local
Completed T8.3 by adding the `/daily claim` command, wiring `handleDailyClaim` for streak + cooldown enforcement, shipping tests, and reseeding NEXT with T8.4.
TasklistDiff: true
Tests: Not run (Vitest unavailable in this environment).
Read [](vscode-vfs://github/Sherbivs/Infinity-Gauntlet/src/commands)

Read [](vscode-vfs://github/Sherbivs/Infinity-Gauntlet/src/bot)

Read [](vscode-vfs://github/Sherbivs/Infinity-Gauntlet/src/ROUTER.md)

Read [](vscode-vfs://github/Sherbivs/Infinity-Gauntlet/src/bot/ROUTER.md)

Read [](vscode-vfs://github/Sherbivs/Infinity-Gauntlet/tests/ROUTER.md)

Searched text for `status: PROPOSED` (`**/tasklist.md`), no results

Read [](vscode-vfs://github/Sherbivs/Infinity-Gauntlet/src/commands/heal.js)

Read [](vscode-vfs://github/Sherbivs/Infinity-Gauntlet/src/commands/walk.js)

Read [](vscode-vfs://github/Sherbivs/Infinity-Gauntlet/src/bot/dm/heal.ts)

Searched text for `DAILY_QUEST` (`**/src/**`), no results

Created [](file:///workspaces/default/src/commands/daily.js)

Read [](file:///workspaces/default/src/commands/daily.js)

Created [](file:///workspaces/default/src/bot/daily/claim.ts)

Read [](vscode-vfs://github/Sherbivs/Infinity-Gauntlet/tsconfig.json)

Using "Apply Patch"


```

```


Read [](vscode-vfs://github/Sherbivs/Infinity-Gauntlet/src/commands/daily.js)

Created [](vscode-vfs://github/Sherbivs/Infinity-Gauntlet/src/bot/daily)

Using "Apply Patch"


```

```


Using "Apply Patch"


```

```


Using "Apply Patch"


```

```


Using "Apply Patch"


```

```


Using "Apply Patch"


```

```


Using "Apply Patch"


```

```


Using "Apply Patch"


```

```


Read [](vscode-vfs://github/Sherbivs/Infinity-Gauntlet/ops/ROUTER_INDEX.yaml)

Using "Apply Patch"


```

```


Read [](vscode-vfs://github/Sherbivs/Infinity-Gauntlet/ops/TOUCHMAP.yaml#200-200), lines 200 to 287

Searched text for `T8.3` (`**/ops/TOUCHMAP.yaml`), 2 results

Read [](vscode-vfs://github/Sherbivs/Infinity-Gauntlet/ops/TOUCHMAP.yaml#140-140), lines 140 to 180

Using "Apply Patch"


```

```


Using "Apply Patch"

Read [](vscode-vfs://github/Sherbivs/Infinity-Gauntlet/ops/NEXT.yaml)

Using "Apply Patch"


```

```


Using "Apply Patch"


```

```


Read [](vscode-vfs://github/Sherbivs/Infinity-Gauntlet/Prompt.md)

Using "Apply Patch"


```

```


Read [](vscode-vfs://github/Sherbivs/Infinity-Gauntlet/src/bot/daily/claim.ts)

Read [](vscode-vfs://github/Sherbivs/Infinity-Gauntlet/tests/daily.spec.ts)

Read [](vscode-vfs://github/Sherbivs/Infinity-Gauntlet/tasklist.md#340-340), lines 340 to 460

Read [](vscode-vfs://github/Sherbivs/Infinity-Gauntlet/tasklist.md#640-640), lines 640 to 680

Searched text for `T8.3` (`**/tasklist.md`), 4 results

Read [](vscode-vfs://github/Sherbivs/Infinity-Gauntlet/tasklist.md#220-220), lines 220 to 280

Searched text for `id: T0.FP` (`**/tasklist.md`), no results

Searched text for `Fast-path created` (`**/tasklist.md`), 2 results

Read [](vscode-vfs://github/Sherbivs/Infinity-Gauntlet/tasklist.md#280-280), lines 280 to 320

Using "Apply Patch"


```

```
- `/daily claim` now ships as a registered slash command with a new handler that creates trainers when needed, bumps streaks via `recordDailyQuestCompletion`, enforces a 24 h cooldown, and returns streak/balance messaging (src/commands/daily.js, src/bot/daily/claim.ts, src/bot/index.ts).
- Added Vitest coverage for the claim success path and cooldown blocking while updating routers, touchmap, NEXT pointer, and Prompt metadata so T8.4 (DM Home button) is queued next (tests/daily.spec.ts, ops/ROUTER_INDEX.yaml, ops/TOUCHMAP.yaml, ops/NEXT.yaml, Prompt.md).

<<<PATCHSET START>>>

# [T8.3]: Add daily quest claim flow and rewards

# FILE: daily.js

```full
'use strict';
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Daily quest utilities')
    .addSubcommand((sub) => sub.setName('claim').setDescription('Claim your daily quest reward')),
  cooldownMs: 1000,
  async execute(interaction) {
    await interaction.reply({ content: 'Use `/daily claim` to claim your daily reward.', ephemeral: true });
  },
};
```

# FILE: claim.ts

```full
import { ChatInputCommandInteraction, TimestampStyles, time } from "discord.js";
import { prisma as prismaClient, recordDailyQuestCompletion } from "../../models/index.js";

type PrismaLike = typeof prismaClient;

const DAILY_REWARD_COINS = 100;
const DAILY_COOLDOWN_KIND = "daily-quest";
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STARTER_COINS = 500;

type HandleDailyClaimOptions = {
  prisma?: PrismaLike;
  rewardCoins?: number;
  now?: Date;
  recordCompletion?: typeof recordDailyQuestCompletion;
};

async function ensureTrainer(prisma: PrismaLike, discordId: string) {
  const existing = await prisma.user.findUnique({ where: { discordId }, select: { id: true, coins: true } });
  if (existing) {
    return existing;
  }

  return prisma.user.create({
    data: { discordId, coins: DEFAULT_STARTER_COINS },
    select: { id: true, coins: true },
  });
}

function formatRetryMessage(readyAt: Date) {
  const stamp = time(readyAt, TimestampStyles.RelativeTime);
  return `Daily quest already claimed. Try again ${stamp}.`;
}

type CooldownRecord = { id: string; readyAt: Date } | null;

async function getCooldown(prisma: PrismaLike, userId: string): Promise<CooldownRecord> {
  return prisma.cooldown.findFirst({
    where: { ownerId: userId, kind: DAILY_COOLDOWN_KIND },
    select: { id: true, readyAt: true },
  });
}

async function saveCooldown(prisma: PrismaLike, userId: string, cooldown: CooldownRecord, readyAt: Date) {
  if (cooldown) {
    await prisma.cooldown.update({ where: { id: cooldown.id }, data: { readyAt } });
    return;
  }

  await prisma.cooldown.create({ data: { ownerId: userId, kind: DAILY_COOLDOWN_KIND, readyAt } });
}

export async function handleDailyClaim(
  interaction: ChatInputCommandInteraction,
  options: HandleDailyClaimOptions = {}
) {
  const prisma = options.prisma ?? prismaClient;
  const rewardCoins = typeof options.rewardCoins === "number" && options.rewardCoins > 0 ? options.rewardCoins : DAILY_REWARD_COINS;
  const now = options.now instanceof Date ? options.now : new Date();
  const recordCompletion = options.recordCompletion ?? recordDailyQuestCompletion;

  try {
    const trainer = await ensureTrainer(prisma, interaction.user.id);
    const cooldown = await getCooldown(prisma, trainer.id);

    if (cooldown?.readyAt && cooldown.readyAt.getTime() > now.getTime()) {
      await interaction.reply({ content: formatRetryMessage(cooldown.readyAt), ephemeral: true });
      return;
    }

    const nextReadyAt = new Date(now.getTime() + DAILY_COOLDOWN_MS);

    const streakState = await recordCompletion({ userId: trainer.id, prisma, completedAt: now });
    const updated = await prisma.user.update({
      where: { id: trainer.id },
      data: { coins: { increment: rewardCoins } },
      select: { coins: true },
    });

    await saveCooldown(prisma, trainer.id, cooldown, nextReadyAt);

    const streakLine = streakState?.streak != null ? `Streak: **${streakState.streak}** day${streakState.streak === 1 ? "" : "s"}.` : "Streak updated.";
    const balanceLine = updated?.coins != null ? `New balance: **${updated.coins}** coins.` : "Balance updated.";
    const nextStamp = time(nextReadyAt, TimestampStyles.RelativeTime);

    await interaction.reply({
      ephemeral: true,
      content: `Daily quest claimed! You received **${rewardCoins}** coins. ${streakLine} ${balanceLine} Next quest available ${nextStamp}.`,
    });
  } catch (err) {
    console.error("[daily] Failed to process daily claim:", err);
    await interaction.reply({ content: "Daily quest claim failed. Please try again later.", ephemeral: true }).catch(() => undefined);
  }
}
```

# FILE: index.ts

```diff
@@
 					if (interaction.commandName === "starter") {
 						await openStartersDM(interaction.user);
 						await interaction.reply({ content: "I opened your Starters in DMs.", ephemeral: true });
 						return;
 					}
 					if (interaction.commandName === "heal") {
 						await handleHeal(interaction);
 						return;
 					}
+					if (interaction.commandName === "daily") {
+						const sub = interaction.options?.getSubcommand?.(false);
+						if (sub === "claim") {
+							const { handleDailyClaim } = await import("./daily/claim.js");
+							await handleDailyClaim(interaction, { prisma });
+						} else {
+							await interaction.reply({ content: "Unknown daily subcommand. Try `/daily claim`.", ephemeral: true });
+						}
+						return;
+					}
 					if (interaction.commandName === "walk") {
 						await handleWalk(interaction);
 						return;
 					}
```

# FILE: daily.spec.ts

```full
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChatInputCommandInteraction } from "discord.js";
import { handleDailyClaim } from "../src/bot/daily/claim.js";

type MockPrisma = {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  cooldown: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

function makeInteraction(): ChatInputCommandInteraction {
  return {
    user: { id: "discord-1" },
    reply: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatInputCommandInteraction;
}

describe("handleDailyClaim", () => {
  let prisma: MockPrisma;
  let now: Date;

  beforeEach(() => {
    now = new Date("2025-10-26T12:00:00Z");
    prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: "user-1", coins: 200 }),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({ coins: 300 }),
      },
      cooldown: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(undefined),
        create: vi.fn().mockResolvedValue(undefined),
      },
    };
  });

  it("claims daily reward, updates streak, and sets cooldown", async () => {
    const interaction = makeInteraction();
    const completion = vi.fn().mockResolvedValue({ streak: 5 });

    await handleDailyClaim(interaction, {
      prisma: prisma as any,
      rewardCoins: 75,
      now,
      recordCompletion: completion,
    });

    expect(prisma.cooldown.create).toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: { coins: { increment: 75 } },
      })
    );
    expect(completion).toHaveBeenCalledWith({ userId: "user-1", prisma: prisma as any, completedAt: now });
    expect((interaction.reply as any).mock.calls[0][0].content).toContain("Daily quest claimed!");
  });

  it("blocks when cooldown is active", async () => {
    const interaction = makeInteraction();
    prisma.cooldown.findFirst.mockResolvedValue({ id: "cd-1", readyAt: new Date(now.getTime() + 60 * 60 * 1000) });

    await handleDailyClaim(interaction, { prisma: prisma as any, now });

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect((interaction.reply as any).mock.calls[0][0].content).toMatch(/Try again/);
  });
});
```

# FILE: ROUTER.md

```diff
@@
-Owned Globs: src/**
-Last Updated (UTC): 2025-10-26T00:45:00Z
-
-Notes:
-- Battle persistence now centralizes result storage + arena/winner messaging.
-- Updated shared config to fall back to Render-provided database env mappings.
+Owned Globs: src**
+Last Updated (UTC): 2025-10-26T12:20:00Z
+
+Notes:
+- Battle persistence now centralizes result storage + arena/winner messaging.
+- Updated shared config to fall back to Render-provided database env mappings.
+- Daily quest claim flow adds handler, cooldown wiring, and tests under src/bot and src/commands.
```

# FILE: ROUTER.md

```diff
@@
-Owned Globs: src/bot/**
-Last Updated (UTC): 2025-10-26T06:45:00Z
+Owned Globs: src/bot**
+Last Updated (UTC): 2025-10-26T12:20:00Z
@@
-- Admin `/ops stats` adds a participant filter (Discord ID or mention) to isolate specific competitor history.
+- Admin `/ops stats` adds a participant filter (Discord ID or mention) to isolate specific competitor history.
+- Daily quest claim handler awards coins, bumps streaks, and enforces cooldowns via `handleDailyClaim`.
```

# FILE: ROUTER.md

```diff
@@
-Owned Globs: tests/**
-Last Updated (UTC): 2025-10-26T06:45:00Z
+Owned Globs: tests**
+Last Updated (UTC): 2025-10-26T12:20:00Z
@@
-- Ops stats spec validates participant filtering, invalid-input messaging, and scoped empty results.
-- Keep tests hermetic and deterministic; seed RNG where applicable.
+- Ops stats spec validates participant filtering, invalid-input messaging, and scoped empty results.
+- Keep tests hermetic and deterministic; seed RNG where applicable.
+- `tests/daily.spec.ts` covers daily quest claim success and cooldown blocking scenarios.
```

# FILE: ROUTER_INDEX.yaml

```diff
@@
-version: 1
-generated_utc: "2025-10-26T06:45:00Z"
+version: 1
+generated_utc: "2025-10-26T12:20:00Z"
@@
-  - path: "src/"
+  - path: "src/"
@@
-    last_updated_utc: "2025-10-26T00:45:00Z"
+    last_updated_utc: "2025-10-26T12:20:00Z"
@@
-  - path: "src/bot/"
+  - path: "src/bot/"
@@
-    last_updated_utc: "2025-10-26T06:45:00Z"
+    last_updated_utc: "2025-10-26T12:20:00Z"
@@
-  - path: "tests/"
+  - path: "tests/"
@@
-    last_updated_utc: "2025-10-26T06:45:00Z"
+    last_updated_utc: "2025-10-26T12:20:00Z"
```

# FILE: TOUCHMAP.yaml

```diff
@@
-T8.3:
-  - "src/commands/home.js"
-  - "src/commands/**"
-  - "src/models/**"
-  - "prisma/schema.prisma"
-  - "tests/dm_home.spec.ts"
-  - "tests/log.spec.ts"
+T8.3:
+  - "src/commands/daily.js"
+  - "src/bot/daily/claim.ts"
+  - "src/bot/index.ts"
+  - "src/commands/home.js"
+  - "src/models/**"
+  - "tests/daily.spec.ts"
+
+T8.4:
+  - "src/commands/home.js"
+  - "src/bot/dm/home.tsx"
+  - "src/bot/index.ts"
+  - "src/bot/daily/claim.ts"
+  - "tests/dm_home.spec.ts"
```

# FILE: NEXT.yaml

```diff
@@
-next_task_id:
-reason:
-
-
-files_hint:
-
-
-timestamp_utc: 
-router_version: 
-last_notes_read_utc:
-note:
+next_task_id: T8.4
+reason: >
+  Add a DM Home control that claims the daily quest, wiring to the new handler and
+  surfacing streak and cooldown feedback inline.
+
+files_hint:
+  - "src/commands/home.js"
+  - "src/bot/dm/home.tsx"
+  - "src/bot/daily/claim.ts"
+  - "src/bot/index.ts"
+  - "tests/dm_home.spec.ts"
+
+timestamp_utc: 2025-10-26T12:20:00Z
+router_version: 1
+last_notes_read_utc: 2025-10-26T10:25:00Z
+note: "Daily quest command ships with cooldown and streak updates; NEXT targets DM Home button wiring to trigger the flow."
```

# FILE: Prompt.md

```diff
@@
-Timestamp (UTC): 2025-10-26T11:30:00Z
-Revision: 0.73
+Timestamp (UTC): 2025-10-26T12:20:00Z
+Revision: 0.74
@@
-> Changes in this revision:
+> Changes in this revision:
+> - `src/commands/daily.js` — Added `/daily claim` slash command surface.
+> - `src/bot/daily/claim.ts` — Implemented handler to award coins, refresh streaks, and enforce 24h cooldown using Prisma.
+> - `src/bot/index.ts` — Routed the new command to `handleDailyClaim` with graceful subcommand messaging.
+> - `tests/daily.spec.ts` — Covered claim success and cooldown-block responses via mocked Prisma.
+> - `tasklist.md`, `ops/NEXT.yaml`, `ops/TOUCHMAP.yaml`, router docs — Marked T8.3 DONE, queued T8.4 (DM Home button), and refreshed routing metadata.
@@
-<!-- PATCHSET:ECHO BEGIN -->
-
-<!-- PATCHSET:ECHO END -->
+<!-- PATCHSET:ECHO BEGIN -->
+HEAD: pending-local
+Completed T8.3 by adding the `/daily claim` command, wiring `handleDailyClaim` for streak + cooldown enforcement, shipping tests, and reseeding NEXT with T8.4.
+TasklistDiff: true
+Tests: Not run (Vitest unavailable in this environment).
+<!-- PATCHSET:ECHO END -->
@@
-| 2025-10-26 | META.PROMPT.PATCHSET_TEMPLATE enforced the plain-text PATCHSET echo template. | Patch.md now carries the verbatim template, Tasklist logs the policy, and Prompt highlights the no-objects rule for PATCHSET echoes. |
+| 2025-10-26 | T8.3 shipped the daily quest claim command. | `/daily claim` now awards coins, bumps streaks, enforces cooldowns, and Tasklist/NEXT/Touchmap target the DM Home button follow-up. |
+| 2025-10-26 | META.PROMPT.PATCHSET_TEMPLATE enforced the plain-text PATCHSET echo template. | Patch.md now carries the verbatim template, Tasklist logs the policy, and Prompt highlights the no-objects rule for PATCHSET echoes. |
```

# TASKLIST UPDATE

```diff
@@
-Last Updated (UTC): 2025-10-26T11:30:00Z
-Revision: 1.58
+Last Updated (UTC): 2025-10-26T12:20:00Z
+Revision: 1.59
@@
-- id: T8.3
-  title: Add daily quest claim flow and rewards
-  status: READY
+- id: T8.3
+  title: Add daily quest claim flow and rewards
+  status: DONE
@@
-  notes: Extends the progression loop by letting trainers claim their daily quest reward while leveraging the new streak infrastructure.
+  notes: Outcome — `/daily claim` registers via slash, routes to `handleDailyClaim`, grants coins, bumps streaks, and enforces a 24h cooldown with coverage for success + cooldown blocks.
+
+- id: T8.4
+  title: Add DM Home button to claim daily quest
+  status: READY
+  depends_on: [T8.3]
+  acceptance_criteria:
+    - DM Home embed includes a “Claim Daily” button that calls the new handler without leaving DMs.
+    - Button reflects cooldown state (disabled or messaging) after pressing, surfacing streak/cooldown feedback inline.
+    - Tests cover button wiring, cooldown-block messaging, and streak display updates.
+  notes: Extends the progression loop so trainers can claim the daily reward from Home without slash commands, piggybacking on the new handler.
```

<<<PATCHSET END>>>

Tests: Not run (Vitest unavailable in this environment).

Next steps:
1. Run `npx vitest run tests/daily.spec.ts` (or full suite) to validate the new handler logic.
2. Re-run `node scripts/register-commands.js` in the deployment environment so Discord picks up the `/daily` command.

Made changes.
<!-- PATCHSET:ECHO END -->

## Revision History

| Date (UTC) | Change | Impact |
| --- | --- | --- |
| 2025-10-26 | T8.3 shipped the daily quest claim command. | `/daily claim` now awards coins, bumps streaks, enforces cooldowns, and Tasklist/NEXT/Touchmap target the DM Home button follow-up. |
| 2025-10-26 | META.PROMPT.PATCHSET_TEMPLATE enforced the plain-text PATCHSET echo template. | Patch.md now carries the verbatim template, Tasklist logs the policy, and Prompt highlights the no-objects rule for PATCHSET echoes. |
| 2025-10-26 | META.REFRESH.RETIRE replaced the Refresh Vision requirement with a meta visibility check. | Patch/Prompt/CRITICAL now prioritize verifying Patch/Tasklist/Prompt readability before planning while leaving Refresh Vision as an optional human-run script. |
| 2025-10-26 | META.READY_QUEUE.NEXT_TASK promoted battle history work to READY. | T8.1 now READY with NEXT/Touchmap hints, T8.2 remains PROPOSED to extend progression, and guard guidance keeps the queue healthy. |
| 2025-10-26 | META.NO_READY.SAFETY_NET hardened the ≥1 READY invariant. | guard_meta.sh fails when only the seed is READY, suggests the oldest eligible PROPOSED, Tasklist adds READY/PROPOSED follow-ups, and NEXT targets the promotion task. |
| 2025-10-26 | META.UNBLOCK.READY_SEED seeded a READY task and added guard guidance for empty queues. | guard_meta.sh now flags zero READY tasks, Tasklist logs the completion, and NEXT targets the safety-net follow-up. |
| 2025-10-26 | HF.20251026.MASTER_ROUTE_TABLE expanded the master router reference. | masterroutetable.md now maps router-of-routers and router-owned files so hotfix navigation works without automation. |
| 2025-10-26 | META.README.REFRESH2 refreshed README status, workflow, and roadmap. | README now reflects current status/goals, architecture snapshot, updated dev/deploy guidance, and roadmap priorities. |
| 2025-10-26 | HF.20251026.ECHO_DIALOG_PLAIN expanded the PATCHSET echo narration. | Prompt echo now delivers detailed plain-text sentences while avoiding embedded file objects; Tasklist and hotfix metadata track the update. |
| 2025-10-26 | T7.7 added participant filtering to admin battle summaries. | `/ops stats` now accepts optional participant mentions/IDs, updates report headers, and tests cover mention filtering + no-result messaging. |
| 2025-10-26 | HF.20251026.PLAIN_ECHO_TEXT required plain text formatting in PATCHSET echo. | Patch.md now directs workers to avoid Markdown bullets in the echo; Prompt/Tasklist/Recovery updated via hotfix. |
| 2025-10-26 | HF.20251026.AUTO_HOTFIX_DEFAULT defaulted triggerless requests to Hotfix Engine. | Contract instructs workers to run hotfix loop when humans omit activation phrases; meta files updated accordingly. |
| 2025-10-26 | HF.20251026.PATCH_ECHO_MD enforced Markdown formatting in PATCHSET echo. | Patch.md now requires list markers and Prompt.md implements the guidance for quick audits. |
| 2025-10-26 | HF.BROKEN.TASKFLOW documented hotfix bootstrap template. | Hotfix engine can seed READY tasks via ops/HOTFIX_PLAN.yaml; NEXT/RECOVERY reflect the new guidance. |
| 2025-10-26 | T7.6 added filters to admin battle summaries. | `/ops stats` now supports limit/after filters, reports total finished battles, and validates inputs with expanded Vitest coverage. |
| 2025-10-26 | T7.5 surfaced recent battle results to admins. | `/ops stats` now reports counts and the latest finished battles (winner/loser, rewards) using persisted results with Vitest coverage. |
| 2025-10-26 | HOTFIX.ROUTER.DOC referenced the Standardized game-logic doc in router metadata. | Hotfix added router stub + master router table for readiness; meta files stamped for traceability. |
| 2025-10-26 | T7.4 persisted standard battle victories via BattleRepo. | Added concludeBattleWithVictory, new Vitest coverage, and advanced NEXT to the admin reporting follow-up. |
| 2025-10-26 | META.HOTFIX.SYSTEM introduced the no-PATCHSET Hotfix Engine and guard updates. | Hotfix contract documented (`ops/HOTFIX.md`), pointer staged, guard/meta/scripts updated, and Tasklist recorded follow-up hotfix bootstrap task. |
| 2025-10-26 | META.BACKLOG.T7.NEXT queued victory persistence + reporting follow-ups. | Tasklist now includes T7.4 (READY) and T7.5 (PROPOSED); NEXT/Touchmap/NEXT pointer aimed at victory persistence. |
| 2025-10-26 | T7.3 persisted battle outcomes with shared announcer + tests. | BattleRepo writes rewards, DM/thread summaries reuse stored results, and Vitest covers persistence/forfeit flow. |
| 2025-10-25 | META.BACKLOG.T7.3 promoted battle persistence follow-up. | Tasklist + NEXT point at T7.3 (battle results persistence) with router timestamps updated for ops guidance. |
| 2025-10-25 | Deployment wiring: Render database provisioning + env fallbacks. | render.yaml provisions managed Postgres, config reads Render env aliases, README documents the setup. |
| 2025-10-25 | META.ROUTER.NAME_GUARD added canonical-name guard & CI. | Canonical manifest and router-case guard script prevent spelling drift; CI blocks mismatched router/index paths. |
| 2025-10-25 | T7.2 persisted wild encounter captures and surfaced stored IDs. | Encounter success now creates Pokémon via Prisma, stamps encounter metadata, echoes IDs in DM/thread messaging, and adds tests covering the flow. |
| 2025-10-25 | T7.1 wired DM Home to Prisma persistence and added tests. | `/home` surfaces real trainer coins/party data, bootstraps missing records, and ships unit coverage for persisted Pokémon embeds. |
| 2025-10-25 | META.NEXT.SEED staged Phase 7 persistence backlog and set NEXT to T7.1. | Persistence tasks queued (DM Home wiring READY; capture/battle follow-ups PROPOSED) so work can resume with clear priorities. |
| 2025-10-25 | META.README.REFRESH modernized the README to match the Infinity Gauntlet architecture. | README now reflects DM/Wilds/Arena flows, scripts, and deployment guidance. |
| 2025-10-25 | META.TASK.HOUSEKEEP introduced Tasklist archival script/policy and cleared READY queue. | `npm run tasks:archive` keeps only the latest 100 DONE tasks; NEXT now NONE until new work is staged. |
| 2025-10-25 | META.RECOVERY.REPLAY captured resume metadata and advanced NEXT to META.TASK.HOUSEKEEP. | Refresh Vision now persists last_attempted tasks so workers resume safely before selecting new work. |
| 2025-10-25 | META.NEXT.BOOTSTRAP added bootstrap guidance for NONE pointers and advanced NEXT to META.RECOVERY.REPLAY. | NEXT.yaml documents recovery steps and guards point to the first READY task when the pointer is empty. |
| 2025-10-25 | META.TASKLIST.COUPLING_FIX hardened guard-meta coupling and documented Tasklist requirements. | CI now fails when code patches omit Tasklist updates; NEXT/Tasklist prepared for follow-up META tasks. |


