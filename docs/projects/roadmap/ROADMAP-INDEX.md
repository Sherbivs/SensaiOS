# 🗺️ Pokémon Infinity Gauntlet — Master Roadmap

**Created:** 2026-02-10  
**Authority:** DRIPTVDD / Expert Panel Audit  
**Status:** ACTIVE  
**Scope:** Complete path from current state → public launch

---

## Executive Summary

### The State of the Game (2026-02-10 Audit)

The audit assembled 8 expert specialists to evaluate every game-facing file in the codebase. **The findings were surprising:**

| Metric | Value |
|--------|-------|
| Game-facing files audited | 62 |
| **Fully functional** | **56 (90%)** |
| Partial (GameServerAPI) | 1 |
| Stubs (slash commands) | 5 |
| Total game logic lines | ~22,850 |
| Infrastructure lines | ~228,000+ |
| Test cases | 3,169 (98.4% pass) |
| Prisma models | 60 |
| Production services running | 7 |

### The Key Insight

**The game already works.** The button-driven homestead path is fully functional:
- ✅ Walk → Encounter → Catch/Flee → Party
- ✅ Challenge → Arena Thread → Battle Turns → Conclusion
- ✅ Healing, Storage, Shop, Bag, Trading, Achievements, Leaderboards, Daily, Pokédex, Settings
- ✅ Starter selection and new player onboarding

What's **not** working:
- � `/walk` and `/battle` slash commands are stubs → **intentional** per Button-First policy; need redirect messages (Phase 1.6)
- 🔴 GameServerAPI has **15 TODO stubs** (bypassed by the direct path)
- 🔴 SensaiOS kernel boot is **not connected** to main startup
- 🟡 3 placeholder HP formulas
- 🟡 79 raw `console.*` calls (envelope migration incomplete)
- 🟡 48 ESLint warnings

### Two Parallel Paths

The codebase has two independent pathways to every game action:

```
PATH 1 (DIRECT — FUNCTIONAL ✅):
  Discord Button → bot/homestead/*.ts → services/*.ts → core/*.ts → engine/*.ts
                                       → shared/models/*-queries-pg.ts → Prisma

PATH 2 (SENSAIOS — PARTIAL ⚠️):
  Component → GameServerAPI → *Internal() → Prisma
  (capability-gated, encrypted, rate-limited, audited)
```

**The roadmap focuses on:** polishing Path 1, completing Path 2, expanding gameplay, and launching.

---

## Phase Map

| Phase | Name | Priority | Effort | Status |
|-------|------|----------|--------|--------|
| **0** | [Correctness & Quick Wins](PHASE-0-QUICK-WINS.md) | 🔴 CRITICAL | 1–2 days | NOT STARTED |
| **1** | [Button-First UI Polish](PHASE-1-SLASH-COMMANDS.md) | 🟡 HIGH | 2–3 days | NOT STARTED |
| **2** | [GameServerAPI Completion](PHASE-2-GAMESERVER-API.md) | 🟡 HIGH | 1–2 weeks | NOT STARTED |
| **3** | [Gameplay Depth & Content](PHASE-3-GAMEPLAY-DEPTH.md) | 🟢 MEDIUM | 3–4 weeks | NOT STARTED |
| **4** | [SensaiOS Architecture Completion](PHASE-4-SENSAIOS-COMPLETION.md) | 🟢 MEDIUM | 2–3 weeks | NOT STARTED |
| **5** | [Launch Readiness & Go-Live](PHASE-5-LAUNCH-READINESS.md) | 🔴 CRITICAL | 2–3 weeks | NOT STARTED |

**Total estimated timeline:** 10–15 weeks to public launch

---

## Dependency Graph

```
Phase 0 ─────────────────────────────────────────┐
  │                                                │
  ├──→ Phase 1 (Button-First UI)                   │
  │       │                                        │
  │       └──→ Phase 3 (Gameplay Depth) ──┐        │
  │                                        │        │
  ├──→ Phase 2 (GameServerAPI) ────────────┤        │
  │                                        │        │
  └──→ Phase 4 (SensaiOS Architecture) ────┤        │
                                           │        │
                                           └──→ Phase 5 (Launch)
```

- **Phase 0** is prerequisite for all others
- **Phases 1, 2, 4** can run **in parallel** after Phase 0
- **Phase 3** depends on Phase 1 (button UI polished) but can overlap with Phase 2
- **Phase 5** depends on all others being substantially complete

---

## File Index

| Document | Purpose | Lines |
|----------|---------|-------|
| [ROADMAP-INDEX.md](ROADMAP-INDEX.md) | This file — master plan overview | ~200 |
| [PHASE-0-QUICK-WINS.md](PHASE-0-QUICK-WINS.md) | Correctness fixes, placeholder formulas, test fixes, linting | ~300 |
| [PHASE-1-SLASH-COMMANDS.md](PHASE-1-SLASH-COMMANDS.md) | Button-First UI polish: message update patterns, disabled states, navigation map, screen consistency | ~350 |
| [PHASE-2-GAMESERVER-API.md](PHASE-2-GAMESERVER-API.md) | Complete 15 TODO stubs, bridge to internal implementations | ~500 |
| [PHASE-3-GAMEPLAY-DEPTH.md](PHASE-3-GAMEPLAY-DEPTH.md) | Evolution, weather, abilities, held items, multi-gen, events | ~600 |
| [PHASE-4-SENSAIOS-COMPLETION.md](PHASE-4-SENSAIOS-COMPLETION.md) | Kernel boot, component model, envelope migration, cleanup | ~400 |
| [PHASE-5-LAUNCH-READINESS.md](PHASE-5-LAUNCH-READINESS.md) | Integration tests, load testing, monitoring, launch plan | ~500 |

---

## Codebase Quick Reference

### Game Flow Architecture (Current Working State)

```
┌──────────────────────────────────────────────────────────────────┐
│                        DISCORD CLIENT                            │
│                                                                  │
│  Slash Commands (RECOVERY)    Homestead Buttons (16 FUNCTIONAL)  │
│  /start → bootstrap trainer   🚶 Explore → spawn encounter       │
│  (all others → redirect)      ⚔️ Challenge → arena thread        │
│                                💊 Heal → restore party            │
│  Dev/Admin Commands (GATED)    📦 Storage → PC box               │
│  /battle-turn → engine test    🎒 Bag → item usage               │
│  /ops → admin dashboard        🛒 Shop → buy items               │
│  /dex → pokemon lookup         🔄 Trade → P2P trading            │
│  /trade → create trade         🏆 Achievements → unlock/claim    │
│                                📊 Leaderboard → rankings          │
│                                🎁 Daily → quest rewards           │
│                                📖 Pokédex → collection            │
│                                ⚙️ Settings → preferences          │
│                                🎣 Fish → fishing encounter        │
│                                📋 Party → team management         │
└────────────────┬──────────────┬───────────────────────────────────┘
                 │              │
    ┌────────────┘              └────────────┐
    ▼                                        ▼
┌─────────────────────┐          ┌──────────────────────┐
│   SERVICES (8/8 ✅)  │          │   MODELS (8/8 ✅)     │
│   trading.ts         │          │   user-queries-pg     │
│   achievements.ts    │          │   party-queries-pg    │
│   leaderboards.ts    │          │   encounter-queries   │
│   leveling.ts        │          │   battle-queries      │
│   item-effects.ts    │          │   dex-queries         │
│   inventory.ts       │          │   cooldown-queries    │
│   fishing.ts         │          │   bus-queries         │
│   player-stats.ts    │          │   index.ts (repos)    │
└─────────┬───────────┘          └───────────┬──────────┘
          │                                  │
          ▼                                  ▼
┌──────────────────────────────────────────────────────┐
│   CORE GAME LOGIC (5/5 ✅) + ENGINE (8/8 ✅)         │
│                                                       │
│   encounter/spawn.ts — rarity, shiny, species pools   │
│   encounter/catch.ts — catch formula, party insert     │
│   battle/engine.ts  — SeededRNG, build runtime         │
│   battle/turn-manager.ts — legal moves, action queue   │
│   engine/*.ts — damage calc, type chart, status FX     │
└──────────────────────────────┬───────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────┐
│   DATABASE (60 models, 23 migrations, Prisma 7.1.0)  │
│                                                       │
│   Trainer, PokemonInstance, Party, PartySlot,         │
│   Encounter, Battle, Inventory, Species, Move,        │
│   TypeChart, Ability, HomesteadChannel, ...            │
└──────────────────────────────────────────────────────┘
```

### Key File Locations

| System | Entry Point | Lines | Status |
|--------|------------|-------|--------|
| Homestead Home | `src/bot/homestead/home.ts` | 433 | ✅ |
| Encounter Explore | `src/bot/homestead/explore.ts` | 372 | ✅ |
| Battle Challenge | `src/bot/battle/challenge.ts` | 262 | ✅ |
| Battle Actions | `src/bot/battle/actions.ts` | 480 | ✅ |
| Catch/Flee | `src/bot/wilds/controls.ts` | 318 | ✅ |
| Turn Engine | `src/engine/turn.ts` | 150 | ✅ |
| GameServerAPI | `src/sensaios/gameserver/api.ts` | 2,752 | ⚠️ 15 TODOs |
| Kernel Boot | `src/sensaios/kernel-boot.ts` | ~450 | ⚠️ Not integrated |
| Component Context | `src/sensaios/component-context.ts` | 863 | ✅ |
| Run Guarded | `src/sensaios/run-guarded.ts` | 455 | ✅ |

---

## Success Criteria

The game is **ready for public launch** when:

1. ✅ All 6 phases complete (or Phase 3/4 at "minimum viable" stage)
2. ✅ A new player can join, pick a starter, explore, catch, battle, and trade
3. ✅ Battle system works end-to-end with spectator broadcasting
4. ✅ Button-First UI complete — all screens use `interaction.update()`, one game window per player
5. ✅ 0 TypeScript errors, 0 ESLint errors, <10 warnings
6. ✅ Test pass rate >99% with game flow integration tests
7. ✅ Memory stable under load (<500 MB RSS after 24h)
8. ✅ Monitoring dashboards operational (Grafana + Loki)
9. ✅ At least 1 full guild beta test completed
10. ✅ Player onboarding documented and tested

---

**Next Step:** Begin with [Phase 0 — Quick Wins](PHASE-0-QUICK-WINS.md)

---

*Last Updated: 2026-02-10 | Expert Panel Audit*
