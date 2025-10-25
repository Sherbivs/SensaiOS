# Infinity Gauntlet Pokémon Suite

Infinity Gauntlet is a Discord-first Pokémon adventure for Dripcord. Players live in
DMs, explore the Wilds together, battle in public arenas, and progress through a
live-service economy powered by workers and data pipelines.

## Key Capabilities

- **DM-as-Home:** `/home`, heal, starter selection, party + box management, player
   profile, and drip alerts are coordinated by `src/bot/dm/**`.
- **Wild Encounters:** `/walk` creates public threads in `#wilds`, while DM controls let
   trainers throw balls, swap leads, or run. Logic lives in `src/bot/wilds/**` and
   `src/core/encounter/**`.
- **Arena Battles:** `/battle challenge` spins up public arena threads and private DM
   action menus. Engine code is in `src/core/battle/**` and front-of-house interactions in
   `src/bot/battle/**`.
- **Persistent Data:** Prisma models (`prisma/schema.prisma`) back a Postgres database;
   cached reference data ships from the worker via `scripts/fetch_pokemon.mjs` and
   `scripts/build-data.js`.
- **Operational Automation:** Render workers run the cache refresh pipeline
   (`scripts/worker.mjs` + Render Jobs client) and guard scripts keep the repo’s task
   graph + contract in sync.

## Repository Layout

```
├─ src/                    # TypeScript source (bot, core engine, data pipeline)
│  ├─ bot/                 # Discord interactions (DM, wilds, arena, ops)
│  ├─ core/                # Battle + encounter logic
│  ├─ data_pipeline/       # Fetch + normalize PokéAPI payloads
│  ├─ shared/              # Config, logging, utilities, Prisma client
│  └─ index.ts             # Main boot entry (ensures DB + Discord bootstrap)
├─ scripts/                # Operational tooling (refresh vision, cache jobs, guards)
├─ tests/                  # Vitest suites for battle engine, encounters, ops, etc.
├─ prisma/schema.prisma    # Database schema for persistent state
├─ ops/                    # Meta governance (NEXT pointer, Tasklist, routers)
├─ data/                   # Cached reference data shards checked into the repo
├─ discord-pokemon-bot/    # Legacy standalone bot (kept for reference)
└─ README.md               # You are here — high-level project overview
```

Legacy JavaScript code paths (`src/bot/main.js`, `security-bot.js`, the
`discord-pokemon-bot/` folder) remain for backward compatibility but are considered
historical. New work should target the TypeScript app in `src/`.

## Requirements

- Node.js 20+
- npm 9+ (or pnpm/yarn if you wire equivalent scripts)
- Postgres 14+ reachable via `DATABASE_URL`
- Discord bot token with **applications.commands** and **guilds** intents

Optional services:

- Render Jobs API token (for automated data refresh)
- GitHub token with `contents:write` if you mirror data snapshots to another repo

## Quick Start (Development)

1. Install dependencies:
    ```powershell
    npm install
    ```
2. Copy `.env.example` (if available) or set env vars in your shell. Minimum:
    ```powershell
    $env:DATABASE_URL="postgresql://user:pass@localhost:5432/gauntlet"
    $env:DISCORD_BOT_TOKEN="your_discord_token"
    ```
3. Apply Prisma migrations / generate client:
    ```powershell
    npx prisma migrate deploy
    npm run build:ci  # or npm run build
    ```
4. Launch the bot in watch mode:
    ```powershell
    npm run dev
    ```

The TypeScript entry point (`src/index.ts`) checks database connectivity, then boots the
Discord bot. Interactions are slash-first; Message Content intent is not required.

### Testing & Tooling

- Run unit/integration tests: `npm test`
- Lint the project: `npm run lint`
- Build for production: `npm run build`
- Generate cached Pokémon data: `npm run data:build`
- Refresh routers + meta state before selecting tasks: `npm run refresh:vision`
- Trim historical Tasklist entries (keeps latest 100 DONE): `npm run tasks:archive`

## Data Pipeline & Workers

Reference data is mirrored into `/data` by the worker scripts:

- `scripts/fetch_pokemon.mjs` pulls fresh PokéAPI payloads.
- `scripts/build-data.js` normalizes and shards JSON for the bot.
- `scripts/worker.mjs` orchestrates refresh jobs when running inside Render.
- `scripts/render_job_client.mjs` + `worker_trigger_job.mjs` dispatch and monitor Render
   Jobs invocations.

Configure Render with `render.yaml`. By default the worker queues a refresh job on boot
and also honors `POKE_REFRESH_CRON` / `POKE_REFRESH_TZ`.

## Deployment Notes

1. Ensure build steps include:
    ```bash
    npm ci
    npm run build
    npm run data:build
    ```
2. Required env vars in production:
    - `DATABASE_URL`
    - `DISCORD_BOT_TOKEN` (or `POKEMON_BOT_TOKEN` fallback)
    - Render-specific variables if using the job dispatcher (`POKE_RENDER_SERVICE_ID`,
       `POKE_REFRESH_CRON`, etc.)
3. Optional governance flags (see `src/config/env.js`) let you tune rate limits, alerts,
    and remediation behaviors.

## Operational Playbook

- `scripts/refresh_vision.sh` — regenerate router index, stamp recovery metadata, and
   keep Prompt.md’s ledger fresh.
- `scripts/guard_meta.sh` — CI hook enforcing Tasklist + Prompt coupling.
- `scripts/archive_task_history.mjs` — archive old Tasklist DONE entries to
   `ops/ARCHIVE/`.
- `ops/RECOVERY.yaml` — tracks the last attempted task so the activation trigger can
   resume safely.

## Legacy Bots (Reference Only)

- `security-bot.js` / `src/bot/main.js` retain the original security role-healing logic.
- `discord-pokemon-bot/` holds the message-based prototype that triggered battles off 👀
   reactions.

They are not part of the TypeScript production path but remain for historical context
and potential future migrations.
