# Prompt.md
Timestamp (UTC): 2025-10-26T17:05:00Z
Revision: 0.80

## Last Repo Changes (since previous Prompt.md revision)
> **AI MUST UPDATE THIS BLOCK ON EVERY PATCHSET**  
> Summarize the *effective* repository changes applied in the current commit in human-readable bullets:
> - Files/dirs added/modified/removed (paths relative to repo root)
> - Purpose of each change (one line)
> - Any schema/contract impacts to consumers (brief)
>
> Changes in this revision:
> - `src/env/ensure-db-url.ts` — Hotfix now skips localhost DATABASE_URL values and overrides them with the managed Render connection string, logging overrides for auditors.
> - `tasklist.md`, `ops/HOTFIX_PLAN.yaml`, `ops/RECOVERY.yaml` — Recorded HF.20251026.DB_URL_HOST_OVERRIDE completion and refreshed hotfix metadata.
> - `Prompt.md` — Captured the hotfix outcome and readiness notes for post-deploy verification.

<!-- PATCHSET:ECHO BEGIN -->
HEAD: pending-local
Summary: Hotfix HF.20251026.DB_URL_HOST_OVERRIDE forces Render services to drop localhost DATABASE_URL fallbacks in favor of the managed connection string.
TasklistDiff: true
Tests: Not run (Prisma connectivity cannot be validated from this environment).
Contracts: ON (marker present; Contract Mode enforced).
NEXT: T8.4 stays queued to ship the DM Home daily button once the hotfix is verified in production.
<!-- PATCHSET:ECHO END -->

<<<PATCHSET START>>>
[Hotfix HF.20251026.DB_URL_HOST_OVERRIDE] Replace localhost DATABASE_URL fallbacks with Render connection string

FILE: src/env/ensure-db-url.ts
Change: Prefer non-local candidates, override existing localhost DATABASE_URL values (even when already set), and emit structured warnings when production services still resolve to localhost.

FILE: tasklist.md
Change: Logged HF.20251026.DB_URL_HOST_OVERRIDE with acceptance criteria, marked it DONE, and bumped metadata headers.

FILE: ops/HOTFIX_PLAN.yaml
Change: Recorded the hotfix completion with a refreshed timestamp and guidance note.

FILE: ops/RECOVERY.yaml
Change: Stamped the latest hotfix identifiers and captured the NEXT snapshot for resuming feature work.

FILE: Prompt.md
Change: Updated metadata, Last Repo Changes, and the hotfix echo summary so operators know the override shipped.

<<<PATCHSET END>>>

Tests: Not run (Prisma connectivity cannot be validated from this environment).

Next steps:
1. Verify Render logs now show the managed connection string host instead of localhost after redeploying the services.
2. When tooling is available, run `npm run guard:meta` (or CI equivalent) to confirm no guard regressions.

Made changes.
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
            <<<PATCHSET START>>>
            [Task META.CONTRACTS.SWITCH] Marker switch contract and guard updates

            FILE: Patch.md
            Change: Added the Patch Clipboard scratch area, marker switch toggle, Absolutes, updated pre/postflight guidance, and plain-text PATCHSET rules.

            FILE: Patch-Template.md
            Change: Converted the template to plain text, aligned section order, and documented the marker reminder.

            FILE: ops/CRITICAL.md
            Change: Documented marker switch behaviour and Absolutes in the fast-path guidance.

            FILE: ops/HOTFIX.md
            Change: Clarified how the marker switch interacts with explicit Hotfix activation.

            FILE: Prompt.md
            Change: Refreshed metadata, Last Repo Changes, PATCHSET Echo requirements, and worker guidance for Markerless Mode.

            FILE: Tasklist.md
            Change: Recorded META.CONTRACTS.SWITCH as DONE with acceptance criteria and updated headers.

            FILE: ops/NEXT.yaml
            Change: Added Markerless Mode reminder, refreshed timestamp, and updated note.

            FILE: ops/TOUCHMAP.yaml
            Change: Mapped META.CONTRACTS.SWITCH to the touched meta files.

            FILE: masterroutetable.md
            Change: Prioritized ops/ROUTER.yaml and noted markerless expectations.

            FILE: ops/ROUTER.md
            Change: Logged the marker switch contract update and refreshed the timestamp.

            FILE: scripts/ROUTER.md
            Change: Documented guard_meta marker detection behaviour and refreshed the timestamp.

            FILE: scripts/guard_meta.sh
            Change: Detected the clipboard marker, relaxed contract checks in Markerless Mode, and enforced Absolutes (canonical files, routers, NEXT pointer).

            FILE: ops/RECOVERY.yaml
            Change: Logged last_run_contracts and last_run_reason guidance for reconciliation.

            # TASKLIST UPDATE
            Change: Added META.CONTRACTS.SWITCH outcome notes while leaving META.READY_QUEUE.NEXT_TASK READY.

            <<<PATCHSET END>>>
# FILE: NEXT.yaml



```diff
