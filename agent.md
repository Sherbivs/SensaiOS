# Infinity Gauntlet Agent Handbook

Welcome! This workspace expects autonomous agents to follow a contract-first workflow. Use this handbook as the one-stop navigation guide before touching any code or metadata.

## Core Control Documents
- `Patch.md` — AI Project Manager Contract. Defines marker modes, clipboard expectations, hotfix loop, and Absolutes. Never edit outside the rules described here.
- `Prompt.md` — Operational prompt. Holds the current timestamp, revision, Last Repo Changes, PATCHSET echo, and NEXT pointer context.
- `Tasklist.md` — Task ledger. Tracks backlog, in-flight efforts, and outcomes. When tasks close, record status changes here.
- `masterroutetable.md` — Human-readable router index. Pairs with `ops/ROUTER.yaml` for canonical routing metadata.
- `README.md` (Router & Meta Index section) — Cross-links routers, contract files, and meta tooling for external automation.

## Contract Workflow Quickstart
1. Open `Patch.md` and populate the clipboard (between `<<<PATCHSET START>>>` markers) with the planned file operations.
2. Execute edits exactly as described. Maintain ASCII output, respect existing formatting, and keep comments succinct.
3. Update `Prompt.md` Last Repo Changes and PATCHSET echo before finishing. Ensure `ops/NEXT.yaml` points to a READY task.
4. Clear or archive the clipboard after work. Leave the repository in a consistent state (router docs valid, tests noted, metadata synced).
5. For hotfixes, follow `ops/HOTFIX.md`, `ops/HOTFIX_PLAN.yaml`, and `HOTFIX.md` instructions. Restrict edits to the approved file list unless the plan expands it.

## Router Navigation
- Start with `ops/ROUTER.yaml` (router-of-routers) or `masterroutetable.md` for a textual overview.
- Key downstream routers:
	- `src/ROUTER.md` — Application source tree pivoting into domain routers.
	- `src/bot/ROUTER.md` — Discord bot layer, including security bot entry (`main.js`) and drip alert pipeline.
	- `scripts/ROUTER.md` — Guard scripts, router refresh tooling, change ledger automation.
	- `tests/ROUTER.md` — Vitest coverage map for major systems.
- When in doubt, consult `ops/TOUCHMAP.yaml` for file ownership and escalation paths.

## Operational Playbook
- **Guard Scripts**: `scripts/guard_meta.sh`, `scripts/guard_doc_names.sh`, and `scripts/guard_routing.sh` enforce invariants (READY pointer, canonical spellings, router consistency).
- **Hotfix Loop**: Trigger naming, suffix rules, and recovery steps live in `ops/HOTFIX.md` and `ops/RECOVERY.yaml`. Update both when issuing or closing hotfixes.
- **Clipboard Discipline**: Contract Mode ON requires markers, clipboard, and Prompt updates. Markerless Mode (no markers) relaxes the flow but still enforces Absolutes (routers intact, NEXT READY, canonical docs preserved).
- **Logging**: `Prompt.md` PATCHSET echo should contain a concise summary, tasklist diff flag, test statement, contract mode, and NEXT pointer status.

## Production & Render Notes
- `render.yaml` defines services:
	- `infinity-gauntlet-bot` (web) and `infinity-gauntlet` (worker) run the TypeScript entry (`npm start` -> `tsx src/index.ts`).
	- `infinity-gauntlet` worker now launches both the Discord bot (`src/bot/index.ts`) and the legacy security bot (`src/bot/main.js`) so DripTVDD DM alerts stay online.
	- `pokedex-cache-worker` handles reference data refresh with persistent disks.
- The environment expects managed database URLs. See `src/env/ensure-db-url.ts` and `README.md` for override logic.
- Security bot alert routing lives in `src/bot/main.js` and `src/bot/dripAlerts.js`. DM alert recipients/timezones resolve via `src/config/env.js`.

## Testing & Tooling
- `npm test` — Vitest suite (battle engine, DM flows, ops commands, etc.).
- `npm run lint` — ESLint across `src` and `tests` (TypeScript only).
- `npm run docs:update-routers` — Rebuild router indexes after structural changes.
- `npm run docs:update-ledger` — Refresh Prompt change ledger.
- `npm run refresh:vision` — Runs the full metadata refresh pipeline (routers, recovery, NEXT validation).

## Data & Cache Pipelines
- Pokémon data bootstrap lives under `scripts/build-data.js`, `scripts/fetch_pokemon.mjs`, and `data/bootstrap/*`.
- The security bot uses filesystem caching via `src/services/cache.js` (`/Store/discord-cache`). No database-backed cache exists yet.
- Render cron (`pokedex-cache-failsafe`) calls `scripts/refresh_cache_gh_only.mjs` for a GitHub-only fallback.

## Key Directories Snapshot
- `src/bot/` — Discord bot logic, DM flows, battles, security bot (legacy JS) integration.
- `src/core/` — Deterministic game engines (battle, encounter, math helpers).
- `src/data_pipeline/` — Data ingestion/validation logic.
- `src/shared/` — Logging, config, and utilities used across services.
- `scripts/` — Automation entrypoints (guards, refreshers, build tools).
- `ops/` — Operational metadata, hotfix plans, NEXT pointers, recovery docs.
- `tests/` — Vitest specs across engines, data pipeline, DM flow, and ops surfaces.

## Checklist Before Exit
- Patch clipboard cleared, markers intact.
- `Prompt.md` updated with accurate summary, tests note, NEXT pointer status.
- `ops/NEXT.yaml` points at READY task (typically T8.x unless reprioritized).
- Routers synchronized if structural docs changed.
- Commit message (when applicable) references task ID and change summary.

Following this handbook ensures automation, human operators, and downstream agents see a consistent system snapshot and can continue work without rediscovery.
