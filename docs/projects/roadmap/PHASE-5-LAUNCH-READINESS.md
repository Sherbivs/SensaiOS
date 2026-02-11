# Phase 5 — Launch Readiness

**Priority:** 🔴 CRITICAL (final gate before public launch)  
**Effort:** 2–3 weeks  
**Depends On:** Phase 0 + Phase 1 + Phase 3 (evolution at minimum)  
**Unlocks:** Public launch of Pokémon Infinity on Discord  

---

## Objective

Validate that the game is ready for real players through comprehensive integration testing, load testing, monitoring dashboards, guild beta testing, and a structured launch plan. This is the quality gate between "works for developers" and "works for 100+ concurrent players."

---

## 5.1 — End-to-End Integration Test Suite

### Current State

- **3,118 passing unit tests** across 116 test files
- 49 skipped tests, 2 failing (memory-metrics thresholds)
- Tests cover engines, services, and some Discord interaction mocks
- **Missing:** Full player journey integration tests

### Investigation Steps

1. **Read `tests/` directory structure** — What integration tests exist?
2. **Check for Discord interaction mocks** — Can we simulate full button flows?
3. **Read `tests/battle/actions.interaction.spec.ts`** — Existing battle integration test pattern

### Test Scenarios to Create

#### Player Onboarding Journey
```
New User Flow:
1. User joins guild → bot sends welcome DM → user clicks "Start"
2. User arrives in homestead channel
3. User selects starter Pokémon (Bulbasaur/Charmander/Squirtle)
4. Starter appears in party with correct:
   - Species data (stats, types, abilities)
   - Level 5
   - Canonical HP (not placeholder)
   - Species-appropriate moves (not just Tackle)
   - Random IVs with minimum floor
5. User sees home screen with all buttons working
```

#### Encounter → Catch Journey
```
Wild Encounter Flow:
1. User presses "Explore" (or /walk)
2. Encounter spawns with correct:
   - Species from area's encounter table
   - Level range appropriate to area
   - Rarity tier (common/uncommon/rare/ultra-rare)
   - Time/weather modifiers (if Phase 3.2 complete)
3. User presses "Catch" 
4. Catch formula executes with correct:
   - Ball bonus (Poké Ball, Great Ball, Ultra Ball)
   - HP percentage factor
   - Status condition bonus
   - Species catch rate
5. On success: Pokémon added to party/storage with:
   - Random IVs (0-31 per stat)
   - Level-appropriate moves
   - Canonical HP
6. On failure: Can retry or flee
7. Cooldown prevents immediate re-encounter
```

#### Battle Journey
```
PvP Battle Flow:
1. Trainer A challenges Trainer B
2. Trainer B accepts → Arena thread created
3. Both trainers see battle state embed
4. Trainer A selects move → submitted
5. Trainer B selects move → submitted
6. Turn resolves with:
   - Speed priority ordering
   - Damage calculation (type chart, STAB, crits)
   - Status effect application
   - HP updates
7. Battle log posted to arena thread
8. Repeat until one side KO'd
9. Winner gets XP, money rewards
10. Loser's Pokémon retain damage (must heal)
11. If Phase 3.1: Check for evolution after XP gain
```

#### Inventory & Healing Journey
```
Resource Management Flow:
1. User opens Bag → sees items with quantities
2. User uses Potion on damaged Pokémon → HP restored
3. User visits Pokémon Center (Heal button) → all Pokémon healed
4. User buys items from Shop → money deducted, items added
5. User equips held item on Pokémon (if Phase 3.4 complete)
```

#### Trading Journey
```
Trade Flow:
1. Trainer A initiates trade with Trainer B
2. Both see trade window
3. Trainer A offers Pokémon → shown to Trainer B
4. Trainer B offers Pokémon → shown to Trainer A
5. Both confirm → trade executes atomically
6. Pokémon swap ownership
7. Daily trade limit decremented
8. Pokédex updates for newly seen species
```

### Test File Structure

```
tests/integration/
├── player-onboarding.integration.spec.ts
├── encounter-catch.integration.spec.ts
├── pvp-battle.integration.spec.ts
├── inventory-healing.integration.spec.ts
├── trading.integration.spec.ts
├── daily-rewards.integration.spec.ts
├── pokedex-progress.integration.spec.ts
├── storage-management.integration.spec.ts
└── helpers/
    ├── mock-discord.ts          — Discord interaction mocks
    ├── test-trainer.ts          — Factory for test trainer profiles
    ├── test-pokemon.ts          — Factory for test Pokémon
    └── test-database.ts         — Test DB setup/teardown
```

### Acceptance Criteria

- [ ] 7+ integration test files covering all major player journeys
- [ ] All integration tests pass on CI
- [ ] Test execution < 30 seconds (parallel where possible)
- [ ] No flaky tests (deterministic via seeded RNG)
- [ ] Coverage report shows ≥80% of game-facing code paths

---

## 5.2 — Load Testing

### Objective

Verify the system handles 100+ concurrent players without degradation.

### Investigation Steps

1. **Check Render service limits** — 2 GB RAM, 0.5 vCPU (standard plan)
2. **Check database connection limits** — How many concurrent connections?
3. **Check Discord rate limits** — Messages per second, interactions per second
4. **Read `docs/operations-bible/`** — Existing performance documentation

### Load Test Scenarios

| Scenario | Concurrent Users | Actions/Second | Target Latency |
|----------|-----------------|----------------|----------------|
| Idle homestead | 100 users connected | 1 interaction/s | <200ms |
| Peak encounters | 50 users exploring | 10 spawns/s | <500ms |
| Battle surge | 20 simultaneous battles | 40 moves/s | <300ms |
| Shop rush | 30 users buying | 30 transactions/s | <200ms |
| Combined load | 100 users mixed actions | 50 actions/s | <500ms |

### Implementation Plan

```
1. Create: scripts/load-test/
   - simulate-encounters.ts — Spawn N encounters in parallel
   - simulate-battles.ts — Run N battles with auto-move selection
   - simulate-mixed.ts — Realistic mix of all action types
   
2. Metrics to capture:
   - Response latency (p50, p95, p99)
   - Database query time
   - Memory usage under load
   - Error rate
   - Discord rate limit hits

3. Run against staging environment (or local with ONPREMISE-DEV-PRIMARY)

4. Document results in: docs/operations-bible/load-test-results.md
```

### Performance Targets

| Metric | Target | Acceptable | Unacceptable |
|--------|--------|-----------|--------------|
| P50 latency | <100ms | <200ms | >500ms |
| P95 latency | <300ms | <500ms | >1000ms |
| P99 latency | <500ms | <1000ms | >2000ms |
| Error rate | <0.1% | <1% | >5% |
| Memory growth | <50MB/hr | <100MB/hr | >200MB/hr |
| DB connections | <20 | <30 | >50 |

### Acceptance Criteria

- [ ] Load test scripts created and documented
- [ ] System handles 100 concurrent users without degradation
- [ ] P95 latency < 500ms under combined load
- [ ] No OOM kills during 1-hour sustained load
- [ ] Error rate < 1% under peak load
- [ ] Results documented with graphs

---

## 5.3 — Monitoring & Alerting Dashboards

### Current State

Grafana dashboards exist (`ops/grafana-*.json`) and Loki is configured for log aggregation. But game-specific monitoring is limited.

### Investigation Steps

1. **Read `ops/grafana-dashboard.json`** — What's currently monitored?
2. **Read `ops/grafana-battle-engine.json`** — Battle-specific metrics
3. **Read `ops/ALERTING-GUIDE.md`** — Existing alert rules
4. **Check Prometheus metrics** — What metrics are emitted?

### Required Dashboards

#### Game Health Dashboard
```
Panels:
├── Active Players (last 5 min, 1 hour, 24 hours)
├── Encounters/min (with time-of-day overlay)
├── Battles/min (active + completed)
├── Catch Rate (successful catches / total attempts)
├── Average Battle Duration
├── Daily Active Users (DAU)
├── New Player Registrations
└── Pokédex Completion Distribution
```

#### Economy Dashboard
```
Panels:
├── PokéDollars in circulation (total)
├── PokéDollars earned/spent per hour
├── Item transactions per hour
├── Trade volume per hour
├── Shop revenue by item
├── Top spenders (last 24h)
└── Economy inflation/deflation trend
```

#### Error & Performance Dashboard
```
Panels:
├── Error rate by component (battle, encounter, trade)
├── P95 latency by endpoint
├── Database query latency distribution
├── Discord rate limit hits
├── Memory usage trend
├── Cache hit rate
└── Worker queue depth
```

### Alert Rules

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| High error rate | >5% errors in 5 min | CRITICAL | Page operator |
| Memory spike | RSS >1.5 GB | WARNING | Investigate |
| OOM approaching | RSS >1.8 GB | CRITICAL | Restart worker |
| Battle stuck | Battle >10 min no action | WARNING | Auto-forfeit |
| DB connection pool | >40 connections | WARNING | Check leaks |
| Encounter flood | >100 spawns/min | WARNING | Check cooldown |

### Acceptance Criteria

- [ ] Game health dashboard with real-time player metrics
- [ ] Economy dashboard tracking currency and trades
- [ ] Error/performance dashboard with latency tracking
- [ ] Alert rules configured for critical game metrics
- [ ] Alerts tested (trigger manually, verify notification)

---

## 5.4 — Guild Beta Test Plan

### Objective

Before public launch, run a structured beta test with a small group of real players to identify issues that automated tests can't catch.

### Beta Test Structure

```
Beta Phases:
├── Alpha (Week 1): 5–10 trusted testers
│   ├── Focus: Core flows (encounter, catch, battle, heal)
│   ├── Feedback: Google Form + Discord feedback channel
│   └── Fix: Critical bugs only
│
├── Closed Beta (Week 2): 20–30 invited players
│   ├── Focus: Balance, UX, edge cases
│   ├── Feedback: Bug reports + feature requests
│   └── Fix: High-priority bugs + balance adjustments
│
└── Open Beta (Week 3): Guild-wide access
    ├── Focus: Scale, performance, community dynamics
    ├── Feedback: In-game feedback command
    └── Fix: Final polish + performance tuning
```

### Beta Checklist

```
Pre-Beta:
- [ ] All Phase 0 fixes deployed
- [ ] Slash commands wired (Phase 1)
- [ ] Evolution working (Phase 3.1)
- [ ] Integration tests passing
- [ ] Monitoring dashboards live
- [ ] Feedback collection system ready
- [ ] Beta tester onboarding guide written

Alpha Testing (5-10 players):
- [ ] New player onboarding flow smooth
- [ ] Starter selection works correctly
- [ ] Encounters spawn with correct data
- [ ] Catching works with correct formulas
- [ ] Battles complete without errors
- [ ] Healing restores all Pokémon
- [ ] Storage/party management works
- [ ] No data loss or corruption

Closed Beta (20-30 players):
- [ ] Concurrent battles don't interfere
- [ ] Trading between players works
- [ ] Leaderboards update correctly
- [ ] Daily rewards track properly
- [ ] Achievements trigger correctly
- [ ] No duplicate Pokémon from bugs
- [ ] Economy feels balanced

Open Beta (guild-wide):
- [ ] System handles full guild load
- [ ] No Discord rate limit issues
- [ ] Memory stays stable over 24h+
- [ ] Players report positive experience
- [ ] Critical bug count < 3
```

### Feedback Collection

```
Bug Report Template:
- What were you doing?
- What did you expect?
- What happened instead?
- Screenshots/video?
- Timestamp (for log correlation)

Feature Request Template:
- What feature do you want?
- Why is it important?
- How would you use it?
```

### Acceptance Criteria

- [ ] Alpha test completed (5+ testers, critical bugs fixed)
- [ ] Closed beta completed (20+ testers, high-priority bugs fixed)
- [ ] Open beta completed (guild-wide, performance validated)
- [ ] Bug count below acceptable threshold (<3 critical, <10 major)
- [ ] Player satisfaction >80% (survey)

---

## 5.5 — Player Onboarding Documentation

### Objective

Create player-facing documentation so new players can start playing immediately.

### Documents to Create

#### Quick Start Guide (In-game)
```
/help command response:
1. 🏠 Your homestead channel is your home base
2. 🌿 Select a starter Pokémon to begin
3. 🚶 Press "Explore" to find wild Pokémon
4. ⚾ Catch Pokémon to build your team
5. ⚔️ Challenge other trainers to battles
6. 💊 Heal your team at the Pokémon Center
7. 🎒 Manage items in your Bag
8. 📊 Check your Pokédex progress
```

#### Welcome Message (Auto-sent on join)
```
Welcome to Pokémon Infinity! 🎮

Your personal homestead channel has been created: #homestead-{username}

Head there to:
- Choose your first Pokémon
- Explore the wilds
- Battle other trainers
- And much more!

Type /help for a quick start guide.
```

#### Commands Reference (Embed)
```
Homestead Commands:
  🏠 Home — Return to home screen
  🌿 Explore — Find wild Pokémon
  🎣 Fish — Try fishing for water types
  ⚔️ Battle — Challenge a trainer
  💊 Heal — Pokémon Center
  🎒 Bag — Manage items
  📦 Storage — PC box system
  🔄 Trade — Trade with other trainers
  📊 Pokédex — Track your discoveries
  🏆 Leaderboards — See top trainers
  ⭐ Achievements — View accomplishments
  🎁 Daily — Claim daily rewards
  ⚙️ Settings — Customize your experience
```

### Acceptance Criteria

- [ ] /help command returns quick start guide
- [ ] Welcome message auto-sent on guild join
- [ ] Commands reference accessible in-game
- [ ] Documentation is concise and visually appealing
- [ ] No spoilers for rare Pokémon or secret features

---

## 5.6 — Launch Checklist

### Pre-Launch (24 hours before)

```
Infrastructure:
- [ ] Render services scaled appropriately (2 GB RAM minimum)
- [ ] Database backed up
- [ ] Monitoring dashboards live and alerting
- [ ] Loki log pipeline confirmed working
- [ ] Discord bot permissions verified in target guild
- [ ] Rate limit configurations verified

Code:
- [ ] All critical tests passing (0 failures)
- [ ] Build succeeds with 0 errors
- [ ] ESLint clean (0 errors, <10 warnings)
- [ ] No TODO/FIXME in game-facing code paths
- [ ] Memory leak patch validated (Phase 0.4)
- [ ] Gateway rate limit hotfix deployed (Phase 0.5)

Data:
- [ ] Species data complete (Gen 1 minimum)
- [ ] Move data verified (damage, accuracy, PP)
- [ ] Type chart correct (18×18 matrix)
- [ ] Encounter tables balanced
- [ ] Item effects tested
- [ ] Shop prices balanced

Content:
- [ ] Starter Pokémon configured correctly
- [ ] Welcome message finalized
- [ ] /help guide ready
- [ ] Feedback collection ready
- [ ] Moderation tools available (/ops commands)
```

### Launch Day

```
T-1 hour:
- [ ] Final database backup
- [ ] All services healthy (check dashboard)
- [ ] Alert rules armed
- [ ] Operator available for monitoring

T-0 (Launch):
- [ ] Enable bot in target guild
- [ ] Send launch announcement
- [ ] Monitor real-time metrics
- [ ] Watch for error spikes

T+1 hour:
- [ ] Check error rate (<1%)
- [ ] Check memory stability
- [ ] Check player onboarding completion rate
- [ ] Address any critical bugs

T+24 hours:
- [ ] Compile Day 1 metrics report
- [ ] DAU, encounters, battles, catches
- [ ] Bug list prioritized
- [ ] Player feedback summary
```

### Post-Launch (Week 1)

```
Daily:
- [ ] Check error rate and fix critical bugs
- [ ] Monitor memory and performance
- [ ] Read player feedback
- [ ] Deploy hotfixes as needed

Weekly:
- [ ] Compile weekly metrics report
- [ ] Prioritize feature requests
- [ ] Plan Gen 2 expansion timeline
- [ ] Community engagement post
```

---

## 5.7 — Success Criteria (Overall Project)

The project is ready for public launch when ALL of the following are true:

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | New player can select starter and see it in party | Integration test |
| 2 | Wild encounters spawn with correct species/levels | Integration test |
| 3 | Catch formula produces reasonable rates (20-80%) | Statistical test |
| 4 | PvP battles resolve correctly with type chart | Battle oracle tests |
| 5 | No "coming soon" messages in player-facing commands | Manual audit |
| 6 | All Pokémon use canonical HP formula | Grep for placeholder |
| 7 | Healing restores all Pokémon to full HP | Integration test |
| 8 | Trading works without duplication bugs | Integration test |
| 9 | System handles 100 concurrent users | Load test |
| 10 | Memory stable over 24-hour period | Monitoring |

---

## Phase 5 Checklist

| # | Task | Effort | Risk | Priority |
|---|------|--------|------|----------|
| 5.1 | Integration test suite | 3–4 days | Medium | HIGH |
| 5.2 | Load testing | 2–3 days | Medium | HIGH |
| 5.3 | Monitoring dashboards | 2–3 days | Low | HIGH |
| 5.4 | Guild beta test | 2–3 weeks | Medium | HIGH |
| 5.5 | Player documentation | 1–2 days | Low | MEDIUM |
| 5.6 | Launch checklist | 1 day | Low | HIGH |
| 5.7 | Success criteria validation | 1 day | Low | HIGH |

**Total Phase 5 effort:** 2–3 weeks (including beta testing)

**Key Insight:** The beta test is the most important part of this phase. Automated tests catch logic bugs, but only real players catch UX problems, balance issues, and "feel" problems. Plan for at least 2 weeks of beta testing with iterative fixes.

---

*Parent: [ROADMAP-INDEX.md](ROADMAP-INDEX.md) | Prev: [Phase 4 — SensaiOS Completion](PHASE-4-SENSAIOS-COMPLETION.md)*

---

## Appendix: Timeline Summary

```
Week  1–2:  Phase 0 (Quick Wins) + Phase 0.4 (Memory Leak)
Week  2–3:  Phase 1 (Slash Commands) ║ Phase 2 starts
Week  3–5:  Phase 2 (GameServer API) ║ Phase 4 starts
Week  5–8:  Phase 3 (Gameplay Depth — Evolution first)
Week  6–8:  Phase 4 (SensaiOS Completion) — parallel with Phase 3
Week  9–10: Phase 5.1-5.3 (Testing, Load, Monitoring)
Week 10–12: Phase 5.4 (Beta Testing)
Week 12–13: Phase 5.5-5.7 (Documentation, Launch Checklist, Go/No-Go)
Week 13:    🚀 PUBLIC LAUNCH

Total: ~13 weeks (3 months) from start to launch
```

---

**Document Version:** 1.0  
**Created:** 2026-02-11  
**Purpose:** Launch readiness criteria and structured beta test plan for Pokémon Infinity  
