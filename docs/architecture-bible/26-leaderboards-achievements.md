# Section 26: Leaderboards & Achievements System Design

**Last Updated**: 2025-12-27 | **Design Date**: 2025-12-26 | **Status**: 🟡 DESIGN COMPLETE

**Purpose:** Complete design specification for leaderboards and achievements  
**Revision:** 1.0 — Initial design panel discussion

---

## 📋 Table of Contents

1. [Design Overview](#1-design-overview)
2. [Leaderboard Categories](#2-leaderboard-categories)
3. [Achievement System](#3-achievement-system)
4. [Screen Layouts](#4-screen-layouts)
5. [Data Requirements](#5-data-requirements)
6. [Button IDs & States](#6-button-ids--states)
7. [Implementation Plan](#7-implementation-plan)
8. [Testing Strategy](#8-testing-strategy)

---

## 1. Design Overview

### The 30-Second Pitch

> **Leaderboards** show who's the best at various aspects of the game. **Achievements** reward players for specific accomplishments. Together, they drive friendly competition and give players goals to chase.

### Design Goals

| Goal | Description |
|------|-------------|
| **Social Proof** | "Others are succeeding, I can too!" |
| **Goal Scaffolding** | Clear milestones to work toward |
| **Variety of Wins** | Multiple ways to be "the best" |
| **Fresh Competition** | Weekly/seasonal resets keep it exciting |
| **Non-Toxic** | Celebrate achievement, not shame failure |

### Psychology of Competition

> **DR. CHEN'S NOTES:**
> 
> Leaderboards are powerful motivators BUT dangerous if misused:
> 
> **Good Design:**
> - ✅ Multiple boards (everyone can excel at something)
> - ✅ Show "nearby" ranks (you're #847, not just "top 10")
> - ✅ Weekly resets (fresh starts for everyone)
> - ✅ Achievements for effort, not just results
> 
> **Bad Design (Avoid):**
> - ❌ Single "overall best" ranking (most will give up)
> - ❌ Only showing top 10 (everyone else feels irrelevant)
> - ❌ Permanent rankings (newcomers can't compete)
> - ❌ Pay-to-win advantages on leaderboards

---

## 2. Leaderboard Categories

### 2.1 Core Leaderboards

| Board | Metric | Reset | Description |
|-------|--------|-------|-------------|
| **Total Catches** | Lifetime catches | Never | All-time collection masters |
| **Weekly Catches** | Week's catches | Weekly | Most active this week |
| **Pokédex Progress** | % completed | Never | Completionists |
| **Shiny Hunters** | Total shinies | Never | Lucky (or dedicated) hunters |
| **Battle Champions** | PvP wins | Season | Competitive battlers |
| **Fishing Masters** | Fish caught | Weekly | Water-type specialists |
| **Traders** | Trades completed | Never | Social butterflies |

### 2.2 Leaderboard Display Format

```
┌─────────────────────────────────────────┐
│  🏆 WEEKLY CATCHES                       │
│  Resets in: 3d 14h                       │
├─────────────────────────────────────────┤
│  🥇 #1  @PlayerA      847 catches       │
│  🥈 #2  @PlayerB      612 catches       │
│  🥉 #3  @PlayerC      589 catches       │
│  #4  @PlayerD         501 catches       │
│  #5  @PlayerE         498 catches       │
│  ...                                     │
│  #143 @YOU            127 catches       │
│  #144 @PlayerX        125 catches       │
│  #145 @PlayerY        122 catches       │
└─────────────────────────────────────────┘
```

### 2.3 Personal Rank Card

```
┌─────────────────────────────────────────┐
│  📊 YOUR RANKINGS                        │
├─────────────────────────────────────────┤
│  Total Catches:    #247  (1,234 total)  │
│  Weekly Catches:   #143  (127 / week)   │
│  Pokédex:          #89   (67%)          │
│  Shinies:          #412  (3 found)      │
│  Battle Wins:      #56   (23 wins)      │
│  Fish Caught:      #892  (15 fish)      │
│  Trades:           #1,234 (2 trades)    │
└─────────────────────────────────────────┘
```

### 2.4 Leaderboard Rewards

| Placement | Weekly Catches | Season Battles |
|-----------|---------------|----------------|
| 🥇 #1 | 5,000₽ + Crown Badge | Champion Title |
| 🥈 #2 | 3,000₽ | Elite Title |
| 🥉 #3 | 1,500₽ | Ace Title |
| Top 10 | 500₽ | Top 10 Badge |
| Top 100 | 100₽ | Participant Badge |

---

## 3. Achievement System

### 3.1 Achievement Categories

| Category | Icon | Description |
|----------|------|-------------|
| **Collection** | 📚 | Catching and collecting Pokémon |
| **Battle** | ⚔️ | Combat achievements |
| **Social** | 🤝 | Trading and community |
| **Exploration** | 🌍 | Discovering and fishing |
| **Mastery** | ⭐ | Expert-level accomplishments |
| **Special** | 🎉 | Events and rare achievements |

### 3.2 Collection Achievements

| Achievement | Requirement | Reward |
|-------------|-------------|--------|
| **First Catch!** | Catch your first Pokémon | 100₽ |
| **Bug Catcher** | Catch 10 Bug-types | Bug Badge |
| **Water Warrior** | Catch 10 Water-types | Water Badge |
| **Type Collector** | Catch 1 of each type | 1,000₽ |
| **Century Club** | Catch 100 Pokémon | 500₽ |
| **Pokémon Master** | Catch 500 Pokémon | Master Badge |
| **Shiny Found!** | Find your first shiny | Shiny Badge |
| **Shiny Hunter** | Find 10 shinies | Hunter Badge |
| **Gotta Catch 'Em All** | Complete Pokédex | Completion Badge |

### 3.3 Battle Achievements

| Achievement | Requirement | Reward |
|-------------|-------------|--------|
| **First Victory** | Win your first battle | 100₽ |
| **Win Streak 3** | Win 3 battles in a row | 200₽ |
| **Win Streak 10** | Win 10 battles in a row | 1,000₽ |
| **Type Expert** | Win using only one type | Type Badge |
| **Underdog Victory** | Beat someone 10+ levels higher | 500₽ |
| **Perfect Match** | Win without taking damage | 300₽ |
| **Battle Legend** | Win 100 battles | Legend Badge |

### 3.4 Social Achievements

| Achievement | Requirement | Reward |
|-------------|-------------|--------|
| **First Trade** | Complete your first trade | 100₽ |
| **Trade Partner** | Trade 10 times | 300₽ |
| **Trade Master** | Trade 50 times | Trade Badge |
| **Social Butterfly** | Trade with 10 different players | 500₽ |
| **Daily Player** | Claim daily rewards 7 days in a row | 200₽ |
| **Dedicated** | Claim daily rewards 30 days in a row | 1,000₽ |

### 3.5 Exploration Achievements

| Achievement | Requirement | Reward |
|-------------|-------------|--------|
| **First Steps** | Walk 100 times | 100₽ |
| **Explorer** | Walk 1,000 times | 500₽ |
| **Marathoner** | Walk 10,000 times | Explorer Badge |
| **First Fish** | Catch a fish | 100₽ |
| **Fishing Hobbyist** | Catch 50 fish | 300₽ |
| **Fishing Pro** | Catch 500 fish | Fish Badge |
| **Rod Collector** | Own all fishing rods | 1,000₽ |

### 3.6 Mastery Achievements

| Achievement | Requirement | Reward |
|-------------|-------------|--------|
| **Evolution Expert** | Evolve 10 Pokémon | 500₽ |
| **Stone Master** | Use 5 evolution stones | 300₽ |
| **Level 100 Club** | Raise a Pokémon to level 100 | Max Badge |
| **Team Builder** | Have a full party of 6 | 200₽ |
| **Rich Trainer** | Accumulate 100,000₽ | Rich Badge |

### 3.7 Achievement Rarity Tiers

| Tier | Color | Rarity | Examples |
|------|-------|--------|----------|
| 🟫 **Bronze** | Brown | Common (50%+ have) | First Catch, First Trade |
| 🥈 **Silver** | Gray | Uncommon (20-50%) | Century Club, Win Streak 3 |
| 🥇 **Gold** | Yellow | Rare (5-20%) | Pokémon Master, Battle Legend |
| 💎 **Diamond** | Blue | Epic (1-5%) | Gotta Catch 'Em All, Level 100 Club |
| ✨ **Legendary** | Purple | Legendary (<1%) | All Shinies, Perfect Season |

---

## 4. Screen Layouts

### 4.1 Leaderboard Hub

```
┌──────────────────────────────────────────────────────────────────────┐
│  🏆 LEADERBOARDS                                                     │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Choose a category:                                                   │
│                                                                       │
│  [📊 Total Catches]  [📈 Weekly Catches]  [📚 Pokédex]              │
│  [✨ Shinies]        [⚔️ Battles]         [🎣 Fishing]              │
│  [🤝 Trading]        [👤 My Rankings]                                │
│                                                                       │
│  ─────────────────────────────────────────────────                   │
│  💡 Tip: Weekly boards reset every Monday at midnight UTC            │
│                                                                       │
│  [🏠 Back]                                                           │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.2 Specific Leaderboard View

```
┌──────────────────────────────────────────────────────────────────────┐
│  🏆 WEEKLY CATCHES LEADERBOARD                                       │
│  Resets in: 3d 14h 22m                                               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  🥇 #1   @DragonMaster2024      847 catches                         │
│  🥈 #2   @PokeFanatic           612 catches                         │
│  🥉 #3   @ShinyHunterPro        589 catches                         │
│      #4   @CasualPlayer         501 catches                         │
│      #5   @NightOwlTrainer      498 catches                         │
│      ...                                                             │
│      #143 @YOU ◀────            127 catches                         │
│      #144 @NearbyPlayer1        125 catches                         │
│      #145 @NearbyPlayer2        122 catches                         │
│                                                                       │
│  ─────────────────────────────────────────────────                   │
│  Your best: 203 catches (Week of Dec 9)                              │
│                                                                       │
│  [⬅️ Prev]  Page 15 of 89  [➡️ Next]  [🔙 Back]                     │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.3 Achievement Hub

```
┌──────────────────────────────────────────────────────────────────────┐
│  🎖️ ACHIEVEMENTS                                                     │
│  Progress: 24/87 unlocked (28%)                                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Categories:                                                          │
│                                                                       │
│  [📚 Collection 8/15]  [⚔️ Battle 5/12]  [🤝 Social 3/10]          │
│  [🌍 Exploration 6/18] [⭐ Mastery 2/20] [🎉 Special 0/12]          │
│                                                                       │
│  ─────────────────────────────────────────────────                   │
│  🔔 RECENT UNLOCK:                                                    │
│  ⭐ "Century Club" — Catch 100 Pokémon — 2 hours ago                │
│                                                                       │
│  [👀 View All]  [🏠 Back]                                            │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.4 Achievement Category View

```
┌──────────────────────────────────────────────────────────────────────┐
│  📚 COLLECTION ACHIEVEMENTS                                          │
│  Progress: 8/15 unlocked                                             │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ✅ First Catch! — Catch your first Pokémon              🟫 Bronze   │
│  ✅ Bug Catcher — Catch 10 Bug-types                     🟫 Bronze   │
│  ✅ Water Warrior — Catch 10 Water-types                 🟫 Bronze   │
│  ✅ Century Club — Catch 100 Pokémon                     🥈 Silver   │
│  🔒 Type Collector — 14/18 types caught                  🥈 Silver   │
│  🔒 Pokémon Master — 124/500 Pokémon                     🥇 Gold     │
│  ✅ Shiny Found! — Find your first shiny                 🟫 Bronze   │
│  🔒 Shiny Hunter — 1/10 shinies                          🥇 Gold     │
│  🔒 Gotta Catch 'Em All — 67% Pokédex                   💎 Diamond  │
│                                                                       │
│  [⬅️ Prev Page]  [➡️ Next Page]  [🔙 Back]                          │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.5 Achievement Detail Modal

```
┌──────────────────────────────────────────────────────────────────────┐
│  🥈 CENTURY CLUB                                                     │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ✅ UNLOCKED!                                                        │
│                                                                       │
│  "Catch 100 Pokémon"                                                 │
│                                                                       │
│  Your Progress: 124/100 ██████████████████████ 124%                  │
│                                                                       │
│  Reward: 500₽ (Claimed!)                                             │
│  Rarity: Silver (32% of players have this)                           │
│  Unlocked: December 25, 2025 at 3:42 PM                              │
│                                                                       │
│  [🔙 Back]                                                           │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 5. Data Requirements

### 5.1 Database Schema

```prisma
// Player statistics tracking
model PlayerStats {
  id                String   @id @default(cuid())
  discordId         String   @unique
  
  // Lifetime stats
  totalCatches      Int      @default(0)
  totalBattleWins   Int      @default(0)
  totalBattleLosses Int      @default(0)
  totalTrades       Int      @default(0)
  totalFishCaught   Int      @default(0)
  totalWalks        Int      @default(0)
  totalShinies      Int      @default(0)
  totalEvolutions   Int      @default(0)
  pokedexPercent    Float    @default(0)
  
  // Current streaks
  currentWinStreak  Int      @default(0)
  bestWinStreak     Int      @default(0)
  dailyStreak       Int      @default(0)
  bestDailyStreak   Int      @default(0)
  
  // Weekly stats (reset each week)
  weeklyCatches     Int      @default(0)
  weeklyFish        Int      @default(0)
  weeklyBattles     Int      @default(0)
  weekStartedAt     DateTime @default(now())
  
  // Season stats
  seasonWins        Int      @default(0)
  seasonNumber      Int      @default(1)
  
  updatedAt         DateTime @updatedAt
  
  @@index([totalCatches])
  @@index([weeklyCatches])
  @@index([totalShinies])
  @@index([seasonWins])
}

// Achievement definitions
model AchievementDef {
  id          String   @id @default(cuid())
  code        String   @unique // "FIRST_CATCH", "CENTURY_CLUB", etc.
  name        String
  description String
  category    String   // collection, battle, social, exploration, mastery, special
  rarity      String   // bronze, silver, gold, diamond, legendary
  requirement Int      // Target number
  rewardMoney Int      @default(0)
  rewardBadge String?  // Badge code if applicable
  
  // Order for display
  sortOrder   Int      @default(0)
  
  unlocks     AchievementUnlock[]
}

// Player achievement unlocks
model AchievementUnlock {
  id            String   @id @default(cuid())
  discordId     String
  achievementId String
  unlockedAt    DateTime @default(now())
  rewardClaimed Boolean  @default(false)
  
  achievement   AchievementDef @relation(fields: [achievementId], references: [id])
  
  @@unique([discordId, achievementId])
  @@index([discordId])
}

// Weekly leaderboard snapshots (for history)
model LeaderboardSnapshot {
  id          String   @id @default(cuid())
  boardType   String   // weekly_catches, weekly_fish, etc.
  weekOf      DateTime
  rankings    Json     // Array of {rank, discordId, value}
  
  @@unique([boardType, weekOf])
}
```

### 5.2 Achievement Code Constants

```typescript
export const ACHIEVEMENT_CODES = {
  // Collection
  FIRST_CATCH: "FIRST_CATCH",
  BUG_CATCHER: "BUG_CATCHER",
  WATER_WARRIOR: "WATER_WARRIOR",
  TYPE_COLLECTOR: "TYPE_COLLECTOR",
  CENTURY_CLUB: "CENTURY_CLUB",
  POKEMON_MASTER: "POKEMON_MASTER",
  SHINY_FOUND: "SHINY_FOUND",
  SHINY_HUNTER: "SHINY_HUNTER",
  COMPLETE_DEX: "COMPLETE_DEX",
  
  // Battle
  FIRST_VICTORY: "FIRST_VICTORY",
  WIN_STREAK_3: "WIN_STREAK_3",
  WIN_STREAK_10: "WIN_STREAK_10",
  TYPE_EXPERT: "TYPE_EXPERT",
  UNDERDOG: "UNDERDOG",
  PERFECT_MATCH: "PERFECT_MATCH",
  BATTLE_LEGEND: "BATTLE_LEGEND",
  
  // Social
  FIRST_TRADE: "FIRST_TRADE",
  TRADE_PARTNER: "TRADE_PARTNER",
  TRADE_MASTER: "TRADE_MASTER",
  SOCIAL_BUTTERFLY: "SOCIAL_BUTTERFLY",
  DAILY_7: "DAILY_7",
  DAILY_30: "DAILY_30",
  
  // Exploration
  FIRST_STEPS: "FIRST_STEPS",
  EXPLORER: "EXPLORER",
  MARATHONER: "MARATHONER",
  FIRST_FISH: "FIRST_FISH",
  FISHING_HOBBYIST: "FISHING_HOBBYIST",
  FISHING_PRO: "FISHING_PRO",
  ROD_COLLECTOR: "ROD_COLLECTOR",
  
  // Mastery
  EVOLUTION_EXPERT: "EVOLUTION_EXPERT",
  STONE_MASTER: "STONE_MASTER",
  LEVEL_100: "LEVEL_100",
  TEAM_BUILDER: "TEAM_BUILDER",
  RICH_TRAINER: "RICH_TRAINER",
} as const;
```

---

## 6. Button IDs & States

### 6.1 Button ID Schema

| Button ID | Screen | Action |
|-----------|--------|--------|
| `LB_HUB` | Homestead | Open leaderboards |
| `LB_TOTAL` | Hub | Total catches board |
| `LB_WEEKLY` | Hub | Weekly catches board |
| `LB_DEX` | Hub | Pokédex board |
| `LB_SHINY` | Hub | Shinies board |
| `LB_BATTLE` | Hub | Battle wins board |
| `LB_FISH` | Hub | Fishing board |
| `LB_TRADE` | Hub | Trading board |
| `LB_MY_RANKS` | Hub | Personal rankings |
| `LB_PREV` | Board view | Previous page |
| `LB_NEXT` | Board view | Next page |
| `LB_BACK` | Any | Go back |
| `ACH_HUB` | Homestead | Open achievements |
| `ACH_CAT_<cat>` | Hub | View category |
| `ACH_VIEW_<code>` | Category | View achievement detail |
| `ACH_CLAIM_<code>` | Detail | Claim reward |
| `ACH_PREV` | Category | Previous page |
| `ACH_NEXT` | Category | Next page |
| `ACH_BACK` | Any | Go back |

---

## 7. Implementation Plan

### Phase 1: Stats Foundation (Day 1)
- [ ] Create Prisma schema migrations
- [ ] Create `src/services/player-stats.ts`
- [ ] Add stat increment hooks to existing flows
- [ ] Implement weekly reset cron job

### Phase 2: Leaderboard Service (Day 2)
- [ ] Create `src/services/leaderboards.ts`
- [ ] Implement ranking queries (with nearby ranks)
- [ ] Add pagination support
- [ ] Implement weekly snapshot saving

### Phase 3: Leaderboard UI (Day 3)
- [ ] Create `src/bot/homestead/leaderboards.ts`
- [ ] Implement hub screen
- [ ] Implement board view with pagination
- [ ] Implement personal rankings view

### Phase 4: Achievement Service (Day 4)
- [ ] Create `src/services/achievements.ts`
- [ ] Seed achievement definitions
- [ ] Implement unlock checking logic
- [ ] Add achievement hooks to game flows

### Phase 5: Achievement UI (Day 5)
- [ ] Create `src/bot/homestead/achievements.ts`
- [ ] Implement hub screen
- [ ] Implement category view
- [ ] Implement detail view with claim

### Phase 6: Polish & Rewards (Day 6)
- [ ] Implement weekly rewards distribution
- [ ] Add achievement unlock notifications
- [ ] Add badge display to profile
- [ ] Test all edge cases

### File Structure

```
src/
├── services/
│   ├── player-stats.ts      # Stat tracking
│   ├── leaderboards.ts      # Ranking logic
│   └── achievements.ts      # Achievement logic
├── bot/
│   └── homestead/
│       ├── leaderboards.ts  # Leaderboard UI
│       └── achievements.ts  # Achievement UI
└── workers/
    └── weekly-reset.ts      # Cron job for weekly reset
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

```typescript
// tests/leaderboards.spec.ts
describe("Leaderboards Service", () => {
  describe("getRankings", () => {
    it("returns top N players");
    it("includes nearby ranks for user");
    it("handles pagination correctly");
  });
  
  describe("updateStat", () => {
    it("increments lifetime stat");
    it("increments weekly stat");
    it("triggers achievement check");
  });
  
  describe("weeklyReset", () => {
    it("saves snapshot before reset");
    it("distributes rewards to top players");
    it("resets weekly counters");
  });
});

// tests/achievements.spec.ts
describe("Achievements Service", () => {
  describe("checkAchievements", () => {
    it("unlocks achievement when requirement met");
    it("does not re-unlock already unlocked");
    it("returns newly unlocked achievements");
  });
  
  describe("claimReward", () => {
    it("grants money reward");
    it("grants badge reward");
    it("marks as claimed");
    it("prevents double claim");
  });
});
```

### 8.2 Integration Tests

```typescript
describe("Achievement Flow", () => {
  it("unlocks FIRST_CATCH after catching pokemon");
  it("unlocks CENTURY_CLUB at 100 catches");
  it("unlocks SHINY_FOUND when catching shiny");
  it("shows notification on unlock");
  it("claim grants reward correctly");
});

describe("Leaderboard Flow", () => {
  it("updates ranking after catch");
  it("shows correct nearby ranks");
  it("weekly reset distributes rewards");
});
```

### 8.3 Manual Test Checklist

- [ ] View leaderboard hub
- [ ] Navigate through different boards
- [ ] Pagination works correctly
- [ ] Personal rankings show accurate data
- [ ] Weekly reset runs correctly (test with mock time)
- [ ] Achievement unlocks trigger notification
- [ ] Claim achievement reward grants money
- [ ] Badge appears in profile after unlock
- [ ] Top 3 rewards distributed on weekly reset

---

## 📎 Related Documents

- [23-game-design-bible.md](23-game-design-bible.md) — Core design principles
- [24-fishing-system.md](24-fishing-system.md) — Fishing achievements
- [25-trading-system.md](25-trading-system.md) — Trading achievements

---

## 👥 Design Panel Contributors

**Design Meeting #10 (2025-12-26):**
- 🎮 **MAYA** — Pokémon Game Designer
- 📱 **ALEX** — Discord UX Specialist  
- 🧠 **DR. CHEN** — Player Psychology Expert
- 🏗️ **JORDAN** — Systems Architect
- 🤖 **COPILOT** — Implementation Lead

---

## 📝 Changelog

| Date | Revision | Change |
|------|----------|--------|
| 2025-12-26 | 1.0 | Initial design specification |

---

*This document serves as the complete specification for Leaderboards & Achievements. Implementation should follow this design exactly.*
