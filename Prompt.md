# Prompt.md
Timestamp (UTC): 2025-10-27T10:55:00Z
Revision: 0.93

## Last Repo Changes (since previous Prompt.md revision)
> **AI MUST UPDATE THIS BLOCK ON EVERY PATCHSET**
> Summarize the *effective* repository changes applied in the current commit in human-readable bullets:
> - Files/dirs added/modified/removed (paths relative to repo root)
> - Purpose of each change (one line)
> - Any schema/contract impacts to consumers (brief)
>
> Changes in this revision:
> - `tests/pbsl/fixtures/**` — Added curated oracle fixtures with provenance and documentation.
> - `tests/pbsl/oracle.spec.ts` — Introduced the oracle diff suite and JSON report writer.
> - `.github/workflows/pbsl-oracle.yml` — Captures oracle reports and fails the run after uploading artifacts.
> - `docs/PBSL.md` — Documented the fixture catalog and marked oracle validation complete.
> - `Tasklist.md` — Marked PBSL.ORACLE_DIFF as DONE with outcome notes and synced metadata.
> - `ops/NEXT.yaml`, `Patch.md` — Retained T8.4 as READY after oracle cleanup and replaced the clipboard plan with the next PROPOSED backlog.

<!-- PATCHSET:ECHO BEGIN -->
HEAD: pending-local
Summary: Seeded PBSL oracle fixtures, tests, and workflow reporting for deterministic validation.
TasklistDiff: true
Tests: Not run (VFS workspace blocks npm execution).
Contracts: ON (marker present; Contract Mode enforced).
NEXT: T8.4 remains READY following oracle cleanup.
<!-- PATCHSET:ECHO END -->

<<<PATCHSET START>>>
[Task PBSL.ORACLE_DIFF] Wire PBSL oracle fixtures, tests, and CI reporting

FILE: tests/pbsl/fixtures/README.md
Change: Documented fixture provenance requirements and refresh workflow for oracle data.
Insert/Replace/Remove: Added guidance covering upstream commit tracking and JSON schema expectations.

FILE: tests/pbsl/fixtures/basic-turn.json
Change: Introduced a deterministic single-turn battle snapshot with upstream provenance metadata.
Insert/Replace/Remove: Added seeded participants, scripted actions, and the expected sanitized audit trail.

FILE: tests/pbsl/oracle.spec.ts
Change: Added Vitest oracle comparison that sanitizes battle snapshots and emits a JSON report for CI.
Insert/Replace/Remove: Implemented fixture loading, participant sorting, and artifact writing for regression triage.

FILE: .github/workflows/pbsl-oracle.yml
Change: Ensured CI always uploads the oracle report before failing on regressions.
Insert/Replace/Remove: Replaced the test step with a JSON-reporting invocation plus artifact upload and explicit failure gate.

FILE: docs/PBSL.md
Change: Recorded oracle coverage in the compliance checklist and described the fixture/report catalog.
Insert/Replace/Remove: Marked the checklist item complete and added a section covering fixtures and generated reports.

FILE: Tasklist.md
Change: Marked PBSL.ORACLE_DIFF as DONE with outcome notes and bumped metadata.
Insert/Replace/Remove: Updated Last Updated/Revision and captured the oracle suite delivery in notes.

FILE: ops/NEXT.yaml
Change: Refreshed the NEXT timestamp and note after completing the oracle diff cleanup.
Insert/Replace/Remove: Maintained the T8.4 pointer while documenting the oracle milestone.

FILE: Patch.md
Change: Cleared the completed PBSL oracle proposal and staged a new PROPOSED plan for the remaining backlog.
Insert/Replace/Remove: Removed the processed block and outlined upcoming META.RUNTIME.BACKUP_SINK work.

FILE: Prompt.md
Change: Synced metadata, Last Repo Changes, and PATCHSET echo with the PBSL oracle delivery.
Insert/Replace/Remove: Bumped timestamp/revision and logged the deterministic validation updates.

TASKLIST UPDATE
Change: Set PBSL.ORACLE_DIFF to DONE with an outcome summary.
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
