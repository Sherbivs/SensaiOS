# Prompt.md
Timestamp (UTC): 2025-10-28T05:07:00Z
Revision: 1.03

## Last Repo Changes (since previous Prompt.md revision)
> **AI MUST UPDATE THIS BLOCK ON EVERY PATCHSET**
> Summarize the *effective* repository changes applied in the current commit in human-readable bullets:
> - Files/dirs added/modified/removed (paths relative to repo root)
> - Purpose of each change (one line)
> - Any schema/contract impacts to consumers (brief)
>
> Changes in this revision:
> - `prisma/schema.prisma`, `prisma/migrations/202510280500_scaling_indexes/migration.sql` — Added growth-focused indexes for encounters, battles, parties, Pokémon ownership, and enforced unique cooldown keys.
> - `DATA-SCHEMA.md` — Logged the new index coverage and maintenance plan (vacuum cadence, REINDEX triggers).
> - `tasklist.md` — Marked `T10.SCALE.DATA_INDEX` DONE with outcome notes.

<!-- PATCHSET:ECHO BEGIN -->
HEAD: pending-local
Summary: Landed Phase 10 indexing work—new Prisma indexes + migration + docs—and recorded the task completion.
TasklistDiff: true
Tests: Not run (Prisma/index migration only).
Contracts: ON (marker present; Contract Mode enforced).
NEXT: T8.4 remains READY; scaling backlog proceeds to worker separation next.
<!-- PATCHSET:ECHO END -->

<<<PATCHSET START>>>
[Task T10.SCALE.DATA_INDEX] Harden data indexing for growth

FILE: prisma/schema.prisma
Change: Added indexes for Pokémon ownership, party owners, encounter state timelines, battle state history, and promoted cooldown owner/kind to a compound unique key for safe upserts.
Insert/Replace/Remove: Inserted new @@index/@@unique declarations on the relevant models.

FILE: prisma/migrations/202510280500_scaling_indexes/migration.sql
Change: Created forward-only SQL to apply the new indexes (and replace the cooldown index with a unique key) in production.
Insert/Replace/Remove: Added migration statements creating the indexes and dropping the redundant non-unique index.

FILE: DATA-SCHEMA.md
Change: Updated metadata and documented the scaling index plan with operational maintenance notes (vacuum/REINDEX guidance).
Insert/Replace/Remove: Bumped revision stamp and added a Performance Indexes section referencing the new migration.

FILE: tasklist.md
Change: Marked T10.SCALE.DATA_INDEX as DONE with outcome notes and refreshed headers.
Insert/Replace/Remove: Updated header timestamps/revision and noted the completed indexing work.

TASKLIST UPDATE
Change: Marked T10.SCALE.DATA_INDEX DONE.
<<<PATCHSET END>>>

Logs & References:
- Cleared Patch.md clipboard entries and verified no pending patchsets remain.
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
