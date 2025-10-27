# Prompt.md
Timestamp (UTC): 2025-10-27T10:05:00Z
Revision: 0.91

## Last Repo Changes (since previous Prompt.md revision)
> **AI MUST UPDATE THIS BLOCK ON EVERY PATCHSET**
> Summarize the *effective* repository changes applied in the current commit in human-readable bullets:
> - Files/dirs added/modified/removed (paths relative to repo root)
> - Purpose of each change (one line)
> - Any schema/contract impacts to consumers (brief)
>
> Changes in this revision:
> - `docs/PBSL.md`, `.github/workflows/pbsl-oracle.yml`, `package.json` — Added the PBSL manifesto, dedicated CI workflow, and focused test script.
> - `src/core/pbsl/**`, `tests/pbsl/**` — Introduced deterministic RNG, audit trail, battle/encounter scaffolds, and Vitest coverage.
> - `README.md`, `src/ROUTER.md`, `src/core/ROUTER.md`, `tests/ROUTER.md`, `ops/TOUCHMAP.yaml` — Wired the PBSL surface into docs, routers, and touch maps.
> - `tasklist.md`, `Prompt.md` — Logged the PBSL scaffolding task and refreshed metadata.

<!-- PATCHSET:ECHO BEGIN -->
HEAD: pending-local
Summary: Scaffolded PBSL deterministic core modules, coverage, and CI wiring.
TasklistDiff: true
Tests: Not run (PBSL scaffold only; shell lacks direct workspace path).
Contracts: ON (marker present; Contract Mode enforced).
NEXT: T8.4 remains queued after the continuous sweep rollout.
<!-- PATCHSET:ECHO END -->

<<<PATCHSET START>>>
[Task PBSL.SKELETON] Scaffold PBSL deterministic core and governance

FILE: docs/PBSL.md
Change: Added the PBSL manifesto, compliance checklist, and governance workflow.
Insert/Replace/Remove: New documentation describing truth hierarchy, provenance expectations, and next steps.

FILE: src/core/pbsl/**
Change: Introduced seeded RNG, audit trails, battle phase orchestrator, encounter generator, provenance helpers, and barrel exports.
Insert/Replace/Remove: Added new PBSL module tree with deterministic primitives and re-export index.

FILE: tests/pbsl/**
Change: Created Vitest suites for RNG determinism, battle snapshots, and provenance normalization.
Insert/Replace/Remove: New specs verifying seeded behavior and audit outputs.

FILE: package.json
Change: Added a dedicated `test:pbsl` script for oracle/determinism runs.
Insert/Replace/Remove: Appended the script to npm scripts.

FILE: .github/workflows/pbsl-oracle.yml
Change: Added CI workflow to lint and run PBSL-focused tests.
Insert/Replace/Remove: New GitHub Action triggering on PBSL surface changes.

FILE: README.md
Change: Documented the PBSL scaffold and linked to the manifesto.
Insert/Replace/Remove: Added a PBSL section highlighting new modules and workflow.

FILE: src/ROUTER.md, src/core/ROUTER.md, tests/ROUTER.md
Change: Updated routers to reference the PBSL namespace and tests.
Insert/Replace/Remove: Added notes/areas pointing to the new modules.

FILE: ops/TOUCHMAP.yaml
Change: Mapped PBSL tasks to the new modules, docs, and workflow files.
Insert/Replace/Remove: Added entries for PBSL.SKELETON and PBSL.ORACLE_DIFF.

FILE: tasklist.md
Change: Logged PBSL scaffolding outcome and staged oracle follow-up work.
Insert/Replace/Remove: Added DONE/PROPOSED PBSL tasks with acceptance criteria.

FILE: Prompt.md
Change: Refreshed metadata, summaries, and PATCHSET echo for the PBSL work.
Insert/Replace/Remove: Updated Last Repo Changes, echo, and patchset block.

TASKLIST UPDATE
Change: Added PBSL.SKELETON (DONE) and PBSL.ORACLE_DIFF (PROPOSED) under Phase 9.
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
