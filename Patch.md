# AI PROJECT MANAGER CONTRACT
Last Updated (UTC): 2025-10-26T16:05:00Z
Revision: 1.33

This repository uses **Patch.md** as the working agreement between humans and automation.
Read this file completely before beginning any task. Follow it literally.

## Marker Switch
- The marker string `<<<PATCHSET START>>>` toggles **Contract Mode**. When present, every contract rule and CI guard applies.
- When the marker is absent, the run enters **Markerless Mode**. Contracts are suspended for that single run, but the Absolutes remain enforced.
- Markerless Mode is a deliberate human override. The next marked run must reconcile any drift and restore Contract Mode.

## Absolutes (apply in every mode)
- Never rename or delete canonical meta/routing files (`Patch.md`, `Tasklist.md`, `Prompt.md`, `ops/PATCH_POLICY_BACKUP.md`, `ops/ROUTER.yaml`, `ops/ROUTER_INDEX.yaml`, `masterroutetable.md`, and any `ROUTER.md`).
- Never delete or rename router manifests (`ROUTER.md`, `ROUTER.yaml`).
- Always exit with `ops/NEXT.yaml:next_task_id` pointing to a READY task.
- Always emit a commit message that includes Why / Changes / Testing.

## Prime Directive
1. Read `ops/NEXT.yaml` (respect Marker Switch guidance) to learn the queued task and `files_hint`.
2. Read `Tasklist.md` and execute **only** tasks marked `status: READY` with dependencies satisfied.
3. Read `ops/TOUCHMAP.yaml` to scope edits to the listed paths.
4. Keep every change reversible and minimal.

## Preflight
- If Tasklist.md has no READY tasks (ignoring `META.UNBLOCK.READY_SEED`), promote the oldest eligible PROPOSED whose dependencies are DONE. If none exist, add `META.UNBLOCK.READY_SEED` as READY.
- Ensure `ops/NEXT.yaml:next_task_id` points to a READY task and `files_hint` only lists files you expect to touch.
- Confirm `Patch.md`, `Prompt.md`, and `Tasklist.md` are readable. If any are missing or corrupt, stop and request refreshed copies.

## Operating Loop (Contract Mode)
1. **Plan & Execute**
   - Select the first READY task (respect dependency order) and plan tightly scoped edits. Honor `ops/TOUCHMAP.yaml`.
   - Implement the change using a single PATCHSET from the clipboard (see “Legacy Layout Bridge”).
   - Run targeted tests whenever tooling is available; if not, state why in the echo and commit message.
2. **Update State**
   - Mark the task `DONE` in `Tasklist.md` with a concise outcome note. Promote newly unblocked tasks to `READY`.
   - Update `ops/NEXT.yaml` to point to the next READY task with an updated timestamp, rationale, and trimmed `files_hint`.
   - Extend `ops/TOUCHMAP.yaml` if you touched new paths.
   - Refresh `Prompt.md` (Timestamp, Revision, “Last Repo Changes”, PATCHSET Echo, and any relevant tables).

## Postflight
- Refuse to exit if Tasklist.md lists no READY tasks besides the seed; auto-promote as needed.
- Refuse to exit if `ops/NEXT.yaml:next_task_id` is `NONE` or not READY; retarget before finishing.
- Record the final READY pointer and contract state (Contracts ON/OFF) inside the PATCHSET Echo.

## Prompt Echo Template
- Keep the PATCHSET Echo between the markers in `Prompt.md`.
- Include: HEAD (or `pending-local`), a concise summary sentence, `TasklistDiff true|false`, test results, `Contracts: ON|OFF (reason)`, and the READY pointer rationale.
- Use plain sentences only (no code fences, tables, or embedded objects).

## Legacy Layout Bridge
- Follow the section order used by `Patch-Template.md`: header, FILE entries, TASKLIST UPDATE, Commit Message.
- Describe file edits with inline `-`/`+` markers or prose; do not embed fenced code or attach file objects.
- Keep the clipboard and emitted PATCHSET synchronized.

## Patchset Format (final reply)
- Emit exactly one PATCHSET block and one Commit Message block per run.
- New files must appear in full inside the PATCHSET description (plain text).
- Modified files must be summarized with inline context (no fenced diffs) and kept deterministic.
- Avoid binary/large assets unless explicitly required.

## Tasklist Discipline
- Update headers (`Last Updated`, `Revision`) whenever Tasklist.md changes.
- Add acceptance criteria for new tasks; include outcome notes when marking DONE.
- Never delete tasks with active dependencies. Archive long DONE history via `npm run tasks:archive` if needed.

## Prompt.md Requirements
- Bump Timestamp and Revision on every change.
- “Last Repo Changes” must summarize the effective modifications in plain text bullets.
- Maintain a populated PATCHSET Echo between the markers following the template above.
- Preserve the section titled **“AI Worker Prompt (copy/paste for Copilot/GPT)”** exactly.

## Tests & Evidence
- Run available tests relevant to the touched code. Capture command outputs for the final report.
- If tests cannot run (tooling unavailable, dependency missing), explain the limitation in both the PATCHSET Echo and Commit Message.

## Commit Message Guidelines
- Use the format `[Task <ID>] Concise summary` when closing a Tasklist item.
- Include a short “Why / Changes / Testing” body when additional context helps reviewers.
- Even for meta-only changes, state why the work matters.

## Hotfix Loop (no PATCHSET)
- Trigger with `ACTIVATE: HOTFIX ENGINE`, optionally appending `: <short note>` for human routing; the prefix before the second colon must match exactly.
- Hotfix ignores the marker switch unless the human also omits the marker; overrides stack only when explicitly invoked.
- Restrict edits to `ops/HOTFIX_PLAN.yaml`, `ops/NEXT.yaml`, `Tasklist.md`, and files listed in the hotfix request.
- Restore `ops/NEXT.yaml` to a READY task before exiting; leave a note documenting the state.

Stay disciplined. The repository must always exit a run with a READY pointer, a clean PATCHSET echo, and accurate history.

## Patch Clipboard
- Paste the exact patchset (matching `Patch-Template.md`) below this heading before you begin editing so humans can audit the plan.
- After the run, clear or archive the clipboard if humans do not need the scratchpad.
- Marker detection reads this section; keep `<<<PATCHSET START>>>` intact when Contract Mode is required.

_Patch Clipboard Scratch Area (leave empty when not in use)_

<<<PATCHSET START>>>

[META.RENDER.DB_URL_FIX]: Make Prisma always use Render’s internal DB URL and make workers boot reliably

WHY:
Render background workers often receive only the database’s private-network connection (“internal connection string”). If Prisma doesn’t see DATABASE_URL at process start, it silently falls back to localhost:5432 and the app dies during boot. We must:

set DATABASE_URL from any sanctioned “internal” env var before Prisma loads,

ensure render.yaml explicitly injects the database’s internal connection string as DATABASE_URL for ALL services (web + worker),

replace the raw boot probe with a first-class Prisma $connect() check and better failure messaging,

add guards/docs so this never regresses.

CHANGES:

FILE: src/env/ensure-db-url.ts (NEW)
ADD

A tiny preloader that executes as early as possible.

Fallback order (first hit wins): DATABASE_URL → DATABASE_INTERNAL_URL → DATABASE_URL_INTERNAL.

If DATABASE_URL is unset and an internal candidate is found, set process.env.DATABASE_URL to that value at runtime and log a single structured line showing which env key was used (the URL is redacted).

If none are present, emit a single structured ERROR explaining the expected Render setup and that Prisma will fail without DATABASE_URL.

FILE: src/models/index.ts (MODIFY)

Import “../env/ensure-db-url.js” at the very top (before any Prisma imports).

Export a singleton PrismaClient instance.

Add prisma.$connect() in an exported async initPrisma() that the app calls at boot; on failure, log a structured fatal that includes which env key supplied the URL (never log secrets).

FILE: src/index.ts (MODIFY)

Replace any $queryRawUnsafe boot probe with:

await initPrisma(); then

await prisma.$queryRawSELECT 1; (safe, parameterized form)

Wrap in try/catch; on error, print a concise remediation:

“On Render, ensure render.yaml sets envVars.DATABASE_URL fromDatabase.connectionString (internal).”

“For workers, confirm service type is ‘Background Worker’ and it references the same DB.”

FILE: render.yaml (MODIFY)

For every service (web and worker):

Under envVars, add:
key: DATABASE_URL
fromDatabase:
name: <your-db-name>
property: connectionString

Ensure service type for the background job is “worker” (Render’s Background Workers).

Optional: remove any hand-rolled DATABASE_INTERNAL_URL unless you deliberately use it as a second source; DATABASE_URL should be authoritative after this patch.

FILE: scripts/guard_render.mjs (NEW)
ADD

CI-side check that fails if:

render.yaml defines a service without an envVars entry that supplies DATABASE_URL,

the database reference uses a property other than “connectionString”.

Print a friendly hint that Render’s “connectionString” property is the private-network URL intended for internal traffic between Render services.

FILE: .github/workflows/guard-render.yml (NEW)
ADD

Node 20 job that runs:

node scripts/guard_render.mjs

node scripts/guards/require-ensure-db-preload.mjs (see below)

FILE: scripts/guards/require-ensure-db-preload.mjs (NEW)
ADD

Static check that fails CI if:

any source file imports “@prisma/client” before an import of “env/ensure-db-url” in the same module OR

the prisma singleton module doesn’t import “env/ensure-db-url” first.

Prints the first offending file so it is trivial to fix.

FILE: README.md (MODIFY)
ADD “Deploying on Render (Web + Background Worker)”:

“Use Background Worker” service type for the bot runner.

In render.yaml (or dashboard), attach your managed Postgres and set envVars:

DATABASE_URL ← fromDatabase.connectionString (internal network)

Re-deploy after setting env; no further code changes required thanks to env/ensure-db-url.

Troubleshooting snippet that shows where to find the single structured log line reporting the chosen DB env key.

FILE: ops/TOUCHMAP.yaml (MODIFY)

Map META.RENDER.DB_URL_FIX to:

render.yaml

src/env/ensure-db-url.ts

src/models/index.ts

src/index.ts

scripts/guard_render.mjs

.github/workflows/guard-render.yml

scripts/guards/require-ensure-db-preload.mjs

README.md

FILE: tasklist.md (MODIFY)

Append:
id: META.RENDER.DB_URL_FIX
title: Make Prisma use Render’s internal DB URL and harden worker boot
status: DONE
depends_on: []
acceptance_criteria:

render.yaml sets DATABASE_URL fromDatabase.connectionString for all services (web + worker).

Prisma always receives a nonempty DATABASE_URL at boot; $connect() succeeds when the DB is reachable.

No use of $queryRawUnsafe for liveness checks.

CI guard fails when DATABASE_URL mapping is missing or when Prisma is imported before env/ensure-db-url.
notes: Eliminates localhost fallback and standardizes private-network connections on Render.

FILE: ops/NEXT.yaml (MODIFY)

Set next_task_id to the oldest READY non-meta task (unchanged if already set); keep the queue primed.

FILE: Prompt.md (MODIFY)

Last Repo Changes: list the new env preloader, Prisma boot fix, render.yaml mapping, and CI guard additions.

PATCHSET Echo: short plain-text recap: “Fixed Render DB URL resolution; Prisma now connects using internal connection. Added CI guards so this never regresses.”

FILE: ops/RECOVERY.yaml (MODIFY)

Stamp last_attempted_task_id with META.RENDER.DB_URL_FIX and add a short note: “Render internal DB URL mapping + Prisma preload landed.”

ACCEPTANCE:

Boot on Render background worker prints one INFO line “db.url.source=DATABASE_URL|DATABASE_INTERNAL_URL|DATABASE_URL_INTERNAL” and succeeds.

Deleting DATABASE_URL from a service causes guard_render.mjs to fail CI with a clear message before merge.

Reordering imports to use “@prisma/client” before env/ensure-db-url causes require-ensure-db-preload.mjs to fail CI and point to the exact module.

The CLI error “Can’t reach database server at localhost:5432” no longer appears on Render.

<<<PATCHSET END>>>

REFERENCES (why this works):

Render “Service Types” describes Background Workers as long-running processes appropriate for bots and jobs; we rely on that service type here. 
Render

Render “Environment Variables & Secrets” shows how Node apps read variables via process.env at runtime. That’s exactly what our preloader sets before Prisma initializes. 
Render

Render “YAML Specification → envVars.fromDatabase.property: connectionString” is the private-network URL meant for service-to-service connections; mapping this to DATABASE_URL avoids public networking and fixes the localhost fallback. 
Render

Prisma’s own docs show the datasource url uses env("DATABASE_URL"); supplying that value is the canonical method to configure the client. 
Prisma

Node’s API docs confirm process.env is the runtime interface for environment variables; setting it before imports ensures dependent modules read the intended values. 
Node.js
