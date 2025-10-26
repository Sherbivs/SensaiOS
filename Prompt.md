# Prompt.md
Timestamp (UTC): 2025-10-26T11:30:00Z
Revision: 0.73

## Last Repo Changes (since previous Prompt.md revision)
> **AI MUST UPDATE THIS BLOCK ON EVERY PATCHSET**  
> Summarize the *effective* repository changes applied in the current commit in human-readable bullets:
> - Files/dirs added/modified/removed (paths relative to repo root)
> - Purpose of each change (one line)
> - Any schema/contract impacts to consumers (brief)
>
> Changes in this revision:
> - `prisma/schema.prisma` — Added daily quest streak fields on `User`.
> - `src/models/index.ts` — Implemented quest streak evaluation, freshness guard, and completion projection helpers.
> - `src/commands/home.js` — Surfaced daily quest streak messaging in DM Home, refreshing streak state and embed output.
> - `tests/dm_home.spec.ts`, `tests/log.spec.ts` — Added coverage for streak display plus increment/reset projection logic.
> - `tasklist.md`, `ops/NEXT.yaml`, `ops/TOUCHMAP.yaml` — Marked T8.2 DONE, queued T8.3 (daily quest claim flow), and updated routing hints.

<!-- PATCHSET:ECHO BEGIN -->
HEAD: pending-local
PATCHSET:

*** End Patch
+
+  return evaluateDailyQuestStreak({
+    streak: updated.dailyQuestStreak ?? 0,
+    lastCompleted: updated.dailyQuestLastCompleted ?? null,
+    lastReset: updated.dailyQuestLastReset ?? null,
+    now: safeCompletedAt,
+  });
+}
```

# FILE: src/commands/home.js

```diff
@@
 const { createRequire } = require('node:module');
 const { getSpriteUrl } = require('../lib/assets.js');

 const requireESM = createRequire(__filename);
 const DEFAULT_STARTER_COINS = 500;
 const BATTLE_HISTORY_LIMIT = 3;

+const HISTORY_SYMBOL = { WIN: "✅", LOSS: "❌" };
+
+let questModuleCache = null;
+
+function loadQuestModule() {
+  if (questModuleCache) return questModuleCache;
+  try {
+    const mod = requireESM('../models/index.js');
+    questModuleCache = mod || {};
+  } catch {
+    questModuleCache = {};
+  }
+  return questModuleCache;
+}
+
+function toDate(value) {
+  if (value instanceof Date) {
+    return Number.isNaN(value.valueOf()) ? null : value;
+  }
+  if (typeof value === "string" || typeof value === "number") {
+    const parsed = new Date(value);
+    return Number.isNaN(parsed.valueOf()) ? null : parsed;
+  }
+  return null;
+}
+
+function startOfUtcDay(date) {
+  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
+}
+
+function diffInUtcDays(a, b) {
+  const startA = startOfUtcDay(a).getTime();
+  const startB = startOfUtcDay(b).getTime();
+  return Math.floor((startA - startB) / (24 * 60 * 60 * 1000));
+}
+
+function formatRelativeTimestamp(value, now = new Date()) {
+  const date = toDate(value);
+  if (!date) return null;
+  const unix = Math.floor(date.getTime() / 1000);
+  if (!Number.isFinite(unix)) return null;
+  return `<t:${unix}:R>`;
+}
+
+function fallbackEvaluateDailyQuestStreak(input = {}, now = new Date()) {
+  const streak = Number.isFinite(input.streak) ? Math.max(0, Math.floor(input.streak)) : 0;
+  const lastCompleted = toDate(input.lastCompleted ?? null);
+  const lastReset = toDate(input.lastReset ?? null);
+
+  if (!lastCompleted || streak === 0) {
+    return {
+      streak: 0,
+      status: lastReset ? 'reset' : 'fresh',
+      atRisk: false,
+      lost: Boolean(lastReset),
+      lastCompleted: null,
+      lastReset,
+      nextDue: null,
+      daysSinceCompletion: null,
+      message: lastReset
+        ? "Your streak reset. Complete today's quest to start a new run."
+        : "Complete today's quest to begin your streak.",
+    };
+  }
+
+  const gap = diffInUtcDays(now, lastCompleted);
+
+  if (gap <= 0) {
+    const nextDue = new Date(lastCompleted.getTime() + 24 * 60 * 60 * 1000);
+    return {
+      streak,
+      status: 'locked',
+      atRisk: false,
+      lost: false,
+      lastCompleted,
+      lastReset,
+      nextDue,
+      daysSinceCompletion: 0,
+      message: `On a ${streak}-day streak! Next quest unlocks ${formatRelativeTimestamp(nextDue, now) ?? 'soon'}.`,
+    };
+  }
+
+  if (gap === 1) {
+    return {
+      streak,
+      status: 'due',
+      atRisk: true,
+      lost: false,
+      lastCompleted,
+      lastReset,
+      nextDue: null,
+      daysSinceCompletion: 1,
+      message: `Maintain your ${streak}-day streak by completing today's quest.`,
+    };
+  }
+
+  return {
+    streak: 0,
+    status: 'reset',
+    atRisk: false,
+    lost: true,
+    lastCompleted,
+    lastReset: now,
+    nextDue: null,
+    daysSinceCompletion: gap,
+    message: "Your streak reset after missing a day. Complete today's quest to start over.",
+  };
+}
+
+function evaluateDailyQuestStreakForView(input = {}, now = new Date()) {
+  const mod = loadQuestModule();
+  if (mod && typeof mod.evaluateDailyQuestStreak === 'function') {
+    try {
+      return mod.evaluateDailyQuestStreak({ ...input, now });
+    } catch {}
+  }
+  return fallbackEvaluateDailyQuestStreak(input, now);
+}
+
+function buildDailyQuestFieldValue(state, now = new Date()) {
+  if (!state || typeof state !== 'object') {
+    return "Complete today's quest to begin your streak.";
+  }
+
+  const lines = [];
+  if (state.status === 'locked') {
+    lines.push(`On a ${state.streak}-day streak!`);
+    if (state.nextDue) {
+      lines.push(`Next quest unlocks ${formatRelativeTimestamp(state.nextDue, now) ?? 'soon'}.`);
+    }
+    if (state.lastCompleted) {
+      lines.push(`Last completed ${formatRelativeTimestamp(state.lastCompleted, now) ?? 'recently'}.`);
+    }
+  } else if (state.status === 'due') {
+    lines.push(`Maintain your ${state.streak}-day streak by completing today's quest.`);
+    if (state.lastCompleted) {
+      lines.push(`Last completion ${formatRelativeTimestamp(state.lastCompleted, now) ?? 'recently'}.`);
+    }
+  } else if (state.status === 'reset') {
+    lines.push("Your streak reset. Complete today's quest to start a new run.");
+    if (state.lastCompleted) {
+      lines.push(`Last streak ended ${formatRelativeTimestamp(state.lastCompleted, now) ?? 'recently'}.`);
+    }
+  } else {
+    lines.push("Complete today's quest to begin your streak.");
+  }
+
+  return lines.join('\n');
+}
+
+function computeDailyQuestState(trainer, now = new Date(), providedState) {
+  const baseState = providedState && typeof providedState === 'object' && providedState.status
+    ? providedState
+    : evaluateDailyQuestStreakForView(
+        {
+          streak: trainer?.dailyQuestStreak ?? 0,
+          lastCompleted: trainer?.dailyQuestLastCompleted ?? null,
+          lastReset: trainer?.dailyQuestLastReset ?? null,
+        },
+        now,
+      );
+
+  return {
+    ...baseState,
+    fieldValue: buildDailyQuestFieldValue(baseState, now),
+  };
+}

@@
 function mapTrainerToView(trainer, now = new Date(), options = {}) {
	 const battleHistory = normalizeBattleHistory(options?.battleHistory ?? []);
+  const dailyQuest = computeDailyQuestState(trainer, now, options?.questState);
	 if (!trainer) {
		 return {
			 coins: 0,
			 nextDaily: 'Ready now',
			 party: [],
			 showStarters: true,
			 battleHistory,
+      dailyQuest,
		 };
	 }
	return {
	  coins: typeof trainer.coins === 'number' ? trainer.coins : 0,
	  nextDaily,
	  party,
	  showStarters,
	  battleHistory,
+    dailyQuest,
	};
 }

@@
-function buildHomeEmbed({ coins = 0, nextDaily = 'Ready now', party = [], battleHistory = [] }) {
+function buildHomeEmbed({ coins = 0, nextDaily = 'Ready now', party = [], battleHistory = [], dailyQuest = null }) {
	const embed = new EmbedBuilder()
	 const questValue = dailyQuest?.fieldValue && dailyQuest.fieldValue.trim().length > 0
		 ? dailyQuest.fieldValue
		 : "Complete today's quest to begin your streak.";
	 embed.addFields({ name: 'Daily Quest', value: questValue });

	 const historyEntries = normalizeBattleHistory(battleHistory);
		 let view = {
			 coins: 0,
			 nextDaily: 'Ready now',
			 party: [],
			 showStarters: true,
			 battleHistory: [],
+      dailyQuest: computeDailyQuestState(null),
		 };
				 let questState = null;
				 let trainerForView = trainer;
				 const mod = loadQuestModule();
				 if (mod && typeof mod.ensureDailyQuestStreakFreshness === 'function') {
					 try {
						 const freshness = await mod.ensureDailyQuestStreakFreshness({ trainer, prisma, now });
						 trainerForView = freshness?.trainer ?? trainer;
						 questState = freshness?.state ?? null;
					 } catch (err) {
						 console.warn('[home] Failed to refresh quest streak state:', err?.message || err);
					 }
				 }

				 view = mapTrainerToView(trainerForView, now, { battleHistory, questState });
		 computeDailyQuestState,
		 buildDailyQuestFieldValue,
		 formatRelativeTimestamp,
	 },
 };
```


+  test("daily quest streak field shows active streak details", () => {
+    const now = new Date("2025-10-26T12:00:00Z");
+    const trainer = {
+      coins: 0,
+      cooldowns: [],
+      parties: [{ slots: [] }],
+      dailyQuestStreak: 3,
+      dailyQuestLastCompleted: new Date("2025-10-26T08:00:00Z"),
+    };
+    const view = mapTrainerToView(trainer, now, { battleHistory: [] });
+    expect(view.dailyQuest.status).toBe("locked");
+    expect(view.dailyQuest.fieldValue).toContain("3-day streak");
+    const embed = buildHomeEmbed(view).toJSON();
+    const questField = embed.fields?.find((field) => field.name === "Daily Quest");
+    expect(questField?.value).toContain("3-day streak");
+  });
+
+  test("daily quest streak field guides recovery after reset", () => {
+    const now = new Date("2025-10-30T09:00:00Z");
+    const trainer = {
+      coins: 0,
+      cooldowns: [],
+      parties: [{ slots: [] }],
+      dailyQuestStreak: 0,
+      dailyQuestLastCompleted: new Date("2025-10-27T07:00:00Z"),
+      dailyQuestLastReset: new Date("2025-10-29T09:00:00Z"),
+    };
+    const view = mapTrainerToView(trainer, now, { battleHistory: [] });
+    expect(view.dailyQuest.status).toBe("reset");
+    expect(view.dailyQuest.fieldValue).toContain("streak reset");
+  });
```

## Revision History

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


