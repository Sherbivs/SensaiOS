# Pokémon Infinity Gauntlet

**A Discord-First Pokémon Adventure with Live-Service Architecture**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.19-blueviolet)](https://www.prisma.io/)
[![Discord.js](https://img.shields.io/badge/Discord.js-14.14-5865F2)](https://discord.js.org/)
[![Render](https://img.shields.io/badge/Deployed%20on-Render-46E3B7)](https://render.com/)

---

## 🎮 Overview

Pokémon Infinity Gauntlet is a **live game** running on Discord with **private guild channel-based gameplay** (homestead channels), public arena battles, and real-time data pipelines. Production infrastructure runs on Render with **6 workers + 1 cron job** orchestrating encounters, battles, cache refresh, and security monitoring.

**Key Features:**
- 🏠 **Homestead Channels** — Private guild channels for personal gameplay (migration from DMs in progress)
- ⚔️ **Real-Time Battles** — Deterministic battle engine with <1μs cache lookups, <50μs writes
- 🌍 **Wild Encounters** — Dynamic spawning system with catch mechanics
- 📊 **Live Analytics** — TimescaleDB-powered metrics and leaderboards
- 🔒 **Security Bot** — Automated role sweeps, DRIP alerts, state persistence
- 📦 **Event Bus** — Unified pub-sub system with correlation tracking
- 🛡️ **Zero-Downtime Deployments** — Git push → auto-deploy with rollback capabilities

---

## 📚 Documentation — Start Here

### 🔥 **Comprehensive Operational Guides (Task 12 Series — AUTHORITATIVE)**

**READ THESE FIRST** before implementing any operational features:

1. **[Worker Troubleshooting Guide](docs/operations-bible/worker-troubleshooting-comprehensive.md)** (22 pages)  
   - ALL worker failure scenarios, recovery procedures, health check diagnostics
   - Covers: Main bot, Security, Outbox, Cache, Data Pipeline, Pokedex Cache workers

2. **[Database Operations Runbook](docs/operations-bible/database-operations-runbook-comprehensive.md)** (25 pages)  
   - Complete database ops, live game architecture, master-mirror-staging pipeline
   - <1μs cache lookups, <50μs writes, <50ms SQLite reads, async PROD uploads

3. **[/ops Commands Reference](docs/operations-bible/ops-commands-reference-comprehensive.md)** (28 pages)  
   - ALL /ops commands documented with examples, error codes, troubleshooting

4. **[Complete System Architecture](docs/architecture-bible/complete-system-architecture.md)** (30 pages)  
   - Service topology, dependency graphs, data flows, performance SLA
   - 10+ detailed diagrams (workers, database, state machines, deployment)

### 📖 Bible System (Authoritative Documentation)

- **[Architecture Bible](docs/architecture-bible/INDEX.md)** — 15 sections (system design, database, workers, game engine, etc.)
- **[Operations Bible](docs/operations-bible/INDEX.md)** — 6 sections (service matrix, deployment, monitoring, database operations)
- **[Development Bible](docs/development-bible/INDEX.md)** — 7 sections (local setup, testing, debugging, utilities)
- **[Projects Staging Area](docs/projects/README.md)** — **NEW** Work-in-progress documentation with AI integrity validation (100% accuracy before Bible integration)

### 🚀 Quick Links

- **[OPERATIONS.md](OPERATIONS.md)** — Service matrix, rollout checklist, observability, incident recovery
- **[Agents.md](Agents.md)** — Agent operations guide, router navigation, orientation flow
- **[Patch.md](Patch.md)** — AI project manager contract, workflow discipline
- **[Tasklist.md](tasklist.md)** — Active backlog, dependencies, acceptance criteria

---

## 🏗️ Architecture Snapshot

### Live Game Performance SLA

| Operation | Target Latency | Source | Notes |
|-----------|---------------|--------|-------|
| Cache read | **<1μs** | L1 in-memory | 98.5% hit rate, 20 MB max |
| Simultaneous write | **<50μs** | Buffer + Write-DB | `Promise.all([buffer, writeDb])` |
| SQLite read (fallback) | **<50ms** | Read-DB mirror | Local workstation offline mode |
| PROD upload | **Async** | Background validation | Non-blocking for players |

### Database Architecture (Master-Mirror-Staging)

```
CLOUD-PROD-MASTER (Render PostgreSQL)
    ↑ uploads after validation (async, non-blocking)
    |
Write-DB (SQLite, local)
    ↑ simultaneous writes (<50μs)
    |
Write Buffer (in-memory)
    ↑ instant write (<1μs)
    |
L1 Cache (20 MB, in-memory) ← Read-DB (SQLite mirror)
    ↑ <1μs cache lookups
    |
Player Actions (gameplay, battles, encounters)
```

**Security Checkpoints:**
- 🔒 **Check #1** (Buffer → Write-DB): Corruption detection, integrity validation, format validation
- 🔒 **Check #2** (Write-DB → PROD): Anomaly detection, checksum verification, cross-reference validation

### Render Service Matrix

| Service | Purpose | RAM | Entry Command |
|---------|---------|-----|---------------|
| `infinity-gauntlet` | Main Discord bot + gameplay | 2 GB | `npm start` |
| `infinity-gauntlet-security` | Security bot (role sweeps, DRIP alerts) | 2 GB | `node security-bot.js` |
| `infinity-gauntlet-outbox` | Event bus message delivery | 2 GB | `node dist/worker/outbox.js` |
| `infinity-gauntlet-cache` | Pokédex cache refresh (hourly) | 2 GB | `node dist/worker/cache-refresh.js` |
| `infinity-gauntlet-data-pipeline` | Reference data rebuilds | 2 GB | `node dist/worker/data-pipeline.js` |
| `pokedex-cache-worker` | Git-backed cache sync | 2 GB | `node scripts/worker.mjs` |
| `pokedex-cache-failsafe` (cron) | Weekly fallback refresh | — | Scheduled job |

**Total Resources:** 5.5 GB RAM, 2.5 vCPU across 6 workers + 1 cron

---

## 🛠️ Getting Started

### Prerequisites

- Node.js 18+ (LTS recommended)
- PostgreSQL 17 (for local development)
- Discord Bot Token (from Discord Developer Portal)
- Render account (for production deployment)

### Quick Start (Local Development)

```powershell
# 1. Clone repository
git clone https://github.com/Sherbivs/Infinity-Gauntlet.git
cd Infinity-Gauntlet

# 2. Install dependencies
npm install

# 3. Set up environment
$env:IG_ENV_FILE = "secrets/Infinity-Gauntlet.env"
pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env" -Persist

# 4. Database setup (local workstation)
npm run db:cli -- status  # Verify connectivity
npm run db:cli -- counts  # Check table counts

# 5. Build TypeScript
npm run build

# 6. Run in development mode
npm run dev  # Watch mode with hot reload
```

### Environment Configuration

Create `secrets/Infinity-Gauntlet.env` with:

```bash
# Discord Configuration
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_GUILD_ID=your_guild_id_here

# Database (Render Production)
PROD_DATABASE_URL=postgres://user:pass@host/db

# Database (Local Development - Optional)
DATABASE_ONPREMISE_DEV_PRIMARY=postgresql://localhost:5432/infinity_gauntlet

# Worker Configuration
ENABLE_SECURITY_BOT=false  # true only for security worker
ENABLE_POKEMON_BOT=true    # true only for main bot worker
```

**⚠️ CRITICAL:** Use canonical database terminology (see [Patch.md](Patch.md) Absolutes):
- **CLOUD-PROD-MASTER** → `PROD_DATABASE_URL`
- **ONPREMISE-DEV-PRIMARY** → `DATABASE_ONPREMISE_DEV_PRIMARY`
- **ONPREMISE-DEV-EXPERIMENT** → `DATABASE_ONPREMISE_DEV_EXPERIMENT`

**NEVER use:** "local", "LOCAL", "PRIMARY LOCAL", "EXPERIMENTAL", "DEV_DATABASE_URL" (deprecated)

---

## 🧪 Testing

```powershell
# Run full test suite (293/294 passing)
npm test

# Run specific test suites
npm run test:pbsl      # PBSL oracle tests (deterministic battle snapshots)
npm run test:battle    # Battle engine integration tests
npm run test:ops       # /ops commands tests

# Run with coverage
npm run test:coverage

# Benchmarks
npm run bench:dex      # Dexpack lookup performance
```

---

## 📦 Data Pipeline

```powershell
# Refresh Pokémon reference data (fetches from PokéAPI)
npm run data:build

# Rebuild dexpack v1 + v2 assets
npm run data:dexpack

# Database operations
npm run db:cli -- query "SELECT COUNT(*) FROM \"Species\";"
npm run db:cli -- counts  # Table counts (Species, BusMessage, etc.)
```

---

## 🚀 Deployment

### Render Production

```powershell
# Deploy main bot to production
pwsh -File "scripts/render_deploy.ps1" -Service "Infinity-Gauntlet"

# Or use VS Code task: "Render: Deploy Main Bot"
```

**Service Details:**
- Name: `Infinity-Gauntlet`
- ID: `srv-d3snk2ndiees73cn709g`
- Region: Virginia (US East)
- Dashboard: https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g

### Monitoring Commands

```powershell
npm run render:status        # Service status matrix
npm run render:deploys       # Deployment history
npm run render:restart       # Restart service
npm run render:logs          # Tail logs (use VS Code task)
```

---

## 🔒 Security & Safety

### Memory Management (Bounded Data Structures)

All runtime structures bounded per 2025-11-06 audit:
- **Discord.js cache sweeping** — Prevents 100+ MB leaks
- **Write queues** — 10k entry cap, 75% backpressure
- **Ops error queue** — 200 entry rolling buffer
- **L1 Cache** — 20 MB max via lazy loading + feature flags
- **Peak RAM:** ~300-600 MB per service (15-30% of 2 GB limit)

### State Persistence (Security Bot)

Security bot maintains 7-day state history in `Store/security-bot-state/`:
- `current.json` — Active runtime state
- `previous.json` — Backup from last restart
- `snapshots/*.json` — Hourly backups (7-day retention)

Cumulative statistics (sweeps, alerts, permission changes) survive restarts. Auto-saves every 5 minutes + final save on SIGTERM/SIGINT.

### Error Handling

Domain-specific handlers in every layer:
- `src/bot/bot-error-handler.ts` — Discord API errors, rate limits, timeouts
- `src/core/engine-error-handler.ts` — Battle/encounter engine errors
- `src/workers/worker-error-handler.ts` — Background job failures
- All handlers integrate with ErrorTracker (`src/services/error-tracker.ts`)

---

## 📂 Project Structure

```
Infinity-Gauntlet/
├── src/
│   ├── bot/              # Discord bot layer (commands, homestead channels)
│   ├── core/             # Game engines (battle, encounter, PBSL)
│   ├── workers/          # Background workers (outbox, cache, security)
│   ├── services/         # Core services (Service Registry, ErrorTracker)
│   ├── shared/           # Shared utilities (event bus, prisma, logging)
│   └── data_pipeline/    # PokéAPI data fetching & normalization
├── docs/
│   ├── architecture-bible/    # 15 sections (system design, database, workers)
│   ├── operations-bible/      # 6 sections (service matrix, deployment, monitoring)
│   ├── development-bible/     # 7 sections (local setup, testing, debugging)
│   └── projects/              # NEW: WIP documentation staging (AI validation before Bible)
├── tests/                # Vitest test suites (293/294 passing)
├── scripts/              # Automation (deployment, database, guards)
├── prisma/               # Database schema & migrations
├── assets/               # Dexpack data (committed for runtime)
├── ops/                  # Governance (routers, tasklists, NEXT.yaml)
└── playbooks/            # Incident response, escalation procedures
```

---

## 🤝 Contributing

This is a personal project, but contributions are welcome!

1. Read [Agents.md](Agents.md) for orientation (router navigation, database terminology)
2. Review [Patch.md](Patch.md) for workflow discipline (task management, commit format)
3. Consult Task 12 comprehensive guides before implementing operational features
4. **CRITICAL:** Update Bible sections in SAME commit when changing architecture/operations
5. **NEW:** Document WIP projects in [docs/projects/](docs/projects/) → validate 100% accuracy → integrate to Bible
6. Run `npm run docs:update-routers` after structural changes
7. Ensure tests pass: `npm test`

---

## 📜 License

See [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **PokéAPI** — Comprehensive Pokémon data API (https://pokeapi.co/)
- **Discord.js** — Powerful Discord bot framework
- **Prisma** — Next-generation ORM for Node.js & TypeScript
- **Render** — Cloud platform with zero-downtime deployments
- **Vitest** — Blazing fast unit test framework

---

## 📞 Getting Help

1. Check `ops/NEXT.yaml` for current task context
2. Review [Tasklist.md](tasklist.md) for related work and dependencies
3. Search `docs/` for relevant architecture documentation
4. Use `ops/ROUTER.yaml` to locate subsystem documentation
5. Escalate via `playbooks/escalate.md` if blocked

---

## 🔗 Quick Reference

- **Health Check:** https://infinity-gauntlet-bot.onrender.com/health
- **Render Dashboard:** https://dashboard.render.com/
- **Repository:** https://github.com/Sherbivs/Infinity-Gauntlet
- **Discord Developer Portal:** https://discord.com/developers/applications

---

**Last Updated:** 2025-12-02  
**Revision:** 2.0 (Expanded from minimal Render CLI documentation)  
**Modernization Project:** 1-year systematic cleanup (Q4 2025 → Q4 2026)

**🔥 DOCUMENTATION MAINTENANCE:** When changing architecture/operations, UPDATE corresponding Bible sections in SAME commit. Documentation drift causes production failures.
