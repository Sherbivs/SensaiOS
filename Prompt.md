# Prompt.md
Timestamp (UTC): 2025-10-27T08:45:00Z
Revision: 0.87

## Last Repo Changes (since previous Prompt.md revision)
> **AI MUST UPDATE THIS BLOCK ON EVERY PATCHSET**
> Summarize the *effective* repository changes applied in the current commit in human-readable bullets:
> - Files/dirs added/modified/removed (paths relative to repo root)
> - Purpose of each change (one line)
> - Any schema/contract impacts to consumers (brief)
>
> Changes in this revision:
> - `src/shared/config.ts`, `src/shared/prisma.ts`, `src/shared/cache/memory.ts`, `src/shared/outbox.ts` — unified runtime loader, Prisma singleton, TTL cache, and outbox helpers for shared services.
> - `src/worker/backup.ts`, `render.yaml`, `scripts/guard_runtime.sh`, `.github/workflows/runtime.yml` — added Render app worker draining the Prisma outbox with CI/runtime guards.
> - `src/bot/ops/admin.ts`, `README.md`, `tests/runtime_config.spec.ts`, `tests/outbox.spec.ts`, `tests/ops_stats.spec.ts` — extended `/ops stats` diagnostics, documented the runtime blueprint, and added coverage.
> - `prisma/schema.prisma`, `ops/ROUTER_INDEX.yaml`, `masterroutetable.md`, `tasklist.md`, `ops/NEXT.yaml`, `ops/TOUCHMAP.yaml`, `Prompt.md` — added `OutboxMessage` schema and synchronized routers/meta/tasklist for META.RUNTIME.BLUEPRINT_APPLY.

<!-- PATCHSET:ECHO BEGIN -->
HEAD: pending-local
Summary: Unified runtime config + Prisma bootstrap, wired a Render backup worker + outbox, extended `/ops stats`, and added runtime guards/tests.
TasklistDiff: true
Tests: Pending (vitest runtime suites to run before commit).
Contracts: ON (marker present; Contract Mode enforced).
NEXT: T8.4 remains queued after runtime hardening.
<!-- PATCHSET:ECHO END -->

<<<PATCHSET START>>>
[Task META.RUNTIME.BLUEPRINT_APPLY] Runtime blueprint and outbox worker

FILE: src/shared/config.ts
Change: Replaced the config singleton with `loadConfig()` that promotes Render internal URLs, forbids localhost in production, and surfaces cache/runtime metadata.

FILE: src/shared/prisma.ts & prisma/schema.prisma
Change: Centralized Prisma client initialization (early `$connect`, URL validation) and added the `OutboxMessage` model.

FILE: src/shared/cache/memory.ts, src/shared/outbox.ts
Change: Added TTL memory cache and durable outbox helpers shared by the bot and worker.

FILE: src/worker/backup.ts, render.yaml
Change: Introduced a Render app worker that drains the Prisma outbox and logs health diagnostics; blueprint adds the new service.

FILE: src/bot/ops/admin.ts
Change: `/ops stats` now reports runtime, database, cache, and outbox information alongside battle summaries.

FILE: tests/runtime_config.spec.ts, tests/outbox.spec.ts, tests/ops_stats.spec.ts
Change: Added Vitest coverage for config fallback/guards, outbox helpers, and the enhanced ops stats command.

FILE: scripts/guard_runtime.sh, .github/workflows/runtime.yml
Change: CI guard ensures Render worker wiring and blocks localhost DATABASE_URL; workflow runs the guard and new tests.

FILE: README.md, ops/ROUTER_INDEX.yaml, masterroutetable.md, ops/TOUCHMAP.yaml, ops/NEXT.yaml, tasklist.md, Prompt.md
Change: Documented the runtime blueprint, synced routers/touchmap/NEXT, and logged Tasklist status + follow-up sink task.

TASKLIST UPDATE
Change: Closed META.RUNTIME.BLUEPRINT_APPLY, queued META.RUNTIME.BACKUP_SINK, refreshed NEXT note.
<<<PATCHSET END>>>

Logs & References:
- Read `src/shared/config.ts`, `src/shared/prisma.ts`, and `prisma/schema.prisma` to verify runtime and schema updates.
- Reviewed `src/bot/ops/admin.ts` and `/tests/ops_stats.spec.ts` to ensure diagnostics align with the new sections.
- Inspected `render.yaml`, `scripts/guard_runtime.sh`, and `.github/workflows/runtime.yml` for Render/CI guard alignment.
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
