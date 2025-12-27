# Section 24: Fishing System Design

**Last Updated**: 2025-12-27 | **Design Date**: 2025-12-26 | **Status**: 🟡 DESIGN COMPLETE

**Purpose:** Complete design specification for the fishing mini-game  
**Revision:** 1.0 — Initial design panel discussion

---

## 📋 Table of Contents

1. [Design Overview](#1-design-overview)
2. [User Experience Flow](#2-user-experience-flow)
3. [Screen Layouts](#3-screen-layouts)
4. [Game Mechanics](#4-game-mechanics)
5. [Data Requirements](#5-data-requirements)
6. [Button IDs & States](#6-button-ids--states)
7. [Implementation Plan](#7-implementation-plan)
8. [Testing Strategy](#8-testing-strategy)

---

## 1. Design Overview

### The 30-Second Pitch

> **Fishing** lets players catch Water-type Pokémon using a simple cast-wait-reel mini-game. It's an alternative to walking that provides access to exclusive water Pokémon with a different gameplay feel.

### Design Goals

| Goal | Description |
|------|-------------|
| **Alternative Gameplay** | Different feel from walking — more patient, focused |
| **Exclusive Catches** | Water Pokémon ONLY available through fishing |
| **Simple Mechanics** | Cast → Wait → Bite! → Reel → Encounter |
| **Rod Progression** | Old Rod → Good Rod → Super Rod unlock rarer fish |
| **Satisfying Loop** | Anticipation → Action → Reward |

### What Makes Fishing Different From Walking

| Aspect | Walking | Fishing |
|--------|---------|---------|
| **Feel** | Exploration, wandering | Patience, anticipation |
| **Timing** | Instant encounter | Wait for bite (2-8 seconds) |
| **Pokémon** | Land/Flying types | Water types exclusively |
| **Skill Element** | None | Reaction timing (optional) |
| **Equipment** | None required | Fishing Rod (key item) |

---

## 2. User Experience Flow

### Happy Path Flow

```
Player at EXPLORE screen
        ↓
Clicks [🎣 Fish]
        ↓
┌─────────────────────────────────────────┐
│  🎣 FISHING                              │
│                                          │
│  You cast your line into the water...   │
│                                          │
│  [🎣 Cast Line]  [🏠 Back]               │
└─────────────────────────────────────────┘
        ↓
Clicks [🎣 Cast Line]
        ↓
┌─────────────────────────────────────────┐
│  🎣 FISHING                              │
│                                          │
│  Your line is in the water...           │
│  . . .                                   │
│                                          │
│  (Waiting for a bite)                    │
│                                          │
│  [❌ Reel In] (cancel)                   │
└─────────────────────────────────────────┘
        ↓
(2-8 seconds pass, random)
        ↓
┌─────────────────────────────────────────┐
│  🎣 FISHING                              │
│                                          │
│  ❗ Something's biting!                  │
│                                          │
│  [⚡ REEL IT IN!]                        │
│                                          │
│  (React within 3 seconds!)              │
└─────────────────────────────────────────┘
        ↓
Player clicks [⚡ REEL IT IN!] in time
        ↓
ENCOUNTER starts (Water-type Pokémon)
```

### Failure Paths

**Too Slow (Missed the Bite):**
```
Player doesn't click within 3 seconds
        ↓
┌─────────────────────────────────────────┐
│  🎣 FISHING                              │
│                                          │
│  💨 The Pokémon got away!                │
│                                          │
│  You weren't fast enough...              │
│                                          │
│  [🎣 Try Again]  [🏠 Back]               │
└─────────────────────────────────────────┘
```

**No Rod (Missing Equipment):**
```
Player clicks [🎣 Fish] without a rod
        ↓
┌─────────────────────────────────────────┐
│  🎣 FISHING                              │
│                                          │
│  ❌ You don't have a Fishing Rod!        │
│                                          │
│  Visit the Shop to buy an Old Rod.       │
│                                          │
│  [🏠 Back]                               │
└─────────────────────────────────────────┘
```

**Nothing Biting (Bad Luck):**
```
(15% chance per cast)
        ↓
┌─────────────────────────────────────────┐
│  🎣 FISHING                              │
│                                          │
│  🌊 Nothing seems to be biting...        │
│                                          │
│  Try a different spot?                   │
│                                          │
│  [🎣 Cast Again]  [🏠 Back]              │
└─────────────────────────────────────────┘
```

---

## 3. Screen Layouts

### 3.1 Fishing Idle Screen

```
┌─────────────────────────────────────────────────────────────┐
│  🎣 FISHING SPOT                                            │
│                                                              │
│  Your Rod: 🎣 Old Rod                                       │
│  Catch Rate: ★☆☆ (Common fish only)                        │
│                                                              │
│  🌊 The water looks calm...                                 │
│                                                              │
│  Cast your line to start fishing!                           │
│                                                              │
│  [🎣 Cast Line]  [🏠 Back]                                  │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Waiting for Bite Screen

```
┌─────────────────────────────────────────────────────────────┐
│  🎣 FISHING...                                              │
│                                                              │
│  Your line is in the water                                  │
│                                                              │
│  🌊~~~~~~~~~~~~🎣                                           │
│                                                              │
│  Watch for movement!                                         │
│                                                              │
│  [❌ Reel In Early]                                         │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Bite Alert Screen (URGENT)

```
┌─────────────────────────────────────────────────────────────┐
│  🎣 ❗❗❗ SOMETHING'S BITING! ❗❗❗                         │
│                                                              │
│  🌊💥~~~~~~~~🎣                                             │
│                                                              │
│  QUICK! Reel it in before it escapes!                       │
│                                                              │
│  [⚡ REEL IT IN!]                                           │
│                                                              │
│  ⏱️ React within 3 seconds!                                 │
└─────────────────────────────────────────────────────────────┘
```

### 3.4 Success Transition

```
┌─────────────────────────────────────────────────────────────┐
│  🎣 HOOKED!                                                 │
│                                                              │
│  You reeled in something!                                   │
│                                                              │
│  A wild Pokémon emerged from the water!                     │
│                                                              │
│  (Transitioning to encounter...)                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Game Mechanics

### 4.1 Fishing Rods (Key Items)

| Rod | Shop Price | Unlock Condition | Available Pokémon |
|-----|-----------|-----------------|-------------------|
| **Old Rod** | 500₽ | Available from start | Common water types |
| **Good Rod** | 2,500₽ | After 10 catches | Common + Uncommon |
| **Super Rod** | 10,000₽ | After 50 catches | All water types |

### 4.2 Water Pokémon Pool

**Old Rod (Common Only):**
| Pokémon | Rarity | Rate |
|---------|--------|------|
| Magikarp | Common | 60% |
| Tentacool | Common | 25% |
| Goldeen | Common | 15% |

**Good Rod (Common + Uncommon):**
| Pokémon | Rarity | Rate |
|---------|--------|------|
| Magikarp | Common | 30% |
| Tentacool | Common | 20% |
| Goldeen | Common | 15% |
| Poliwag | Uncommon | 15% |
| Horsea | Uncommon | 10% |
| Staryu | Uncommon | 10% |

**Super Rod (All Rarities):**
| Pokémon | Rarity | Rate |
|---------|--------|------|
| Common pool | Common | 30% |
| Uncommon pool | Uncommon | 35% |
| Gyarados | Rare | 15% |
| Lapras | Rare | 10% |
| Dratini | Ultra-Rare | 5% |
| Feebas | Ultra-Rare | 3% |
| Milotic | Ultra-Rare | 2% |

### 4.3 Timing Mechanics

```typescript
// Fishing timing configuration
const FISHING_CONFIG = {
  // Time before bite (random within range)
  MIN_WAIT_MS: 2000,   // 2 seconds minimum
  MAX_WAIT_MS: 8000,   // 8 seconds maximum
  
  // Reaction window
  BITE_WINDOW_MS: 3000, // 3 seconds to react
  
  // Chance of nothing biting
  NO_BITE_CHANCE: 0.15, // 15% chance
  
  // Cooldown between casts
  CAST_COOLDOWN_MS: 5000, // 5 seconds
};
```

### 4.4 Encounter Generation

When a fish is hooked successfully:

```typescript
interface FishingEncounter {
  speciesId: number;      // From rod's pool
  level: number;          // Based on rod quality
  isShiny: boolean;       // Same 1/1000 chance
  fromFishing: true;      // Flag for analytics
  rodUsed: RodType;       // Track which rod caught it
}

// Level ranges by rod
const LEVEL_RANGES = {
  OLD_ROD:   { min: 5, max: 15 },
  GOOD_ROD:  { min: 10, max: 25 },
  SUPER_ROD: { min: 15, max: 40 },
};
```

### 4.5 Shiny Fishing Bonus

Players who fish patiently get a slight shiny bonus:

| Consecutive Casts | Shiny Rate |
|-------------------|------------|
| 1-10 | 1/1000 (base) |
| 11-25 | 1/900 |
| 26-50 | 1/800 |
| 51-100 | 1/700 |
| 100+ | 1/512 (chain bonus cap) |

Chain breaks if:
- Player leaves fishing screen
- Player catches a Pokémon (chain fulfilled)
- Player runs from encounter

---

## 5. Data Requirements

### 5.1 Database Schema Additions

```prisma
// Add to Item model - new key item category
model Item {
  // ... existing fields ...
  kind     String // Add: "rod" as new kind
}

// Fishing encounter tracking (optional analytics)
model FishingLog {
  id          String   @id @default(cuid())
  discordId   String
  rodUsed     String   // OLD_ROD, GOOD_ROD, SUPER_ROD
  speciesId   Int?     // NULL if nothing bit
  caught      Boolean  // Did they catch it?
  reactionMs  Int?     // How fast they reacted
  chainCount  Int      // Consecutive casts
  createdAt   DateTime @default(now())
  
  @@index([discordId])
}
```

### 5.2 New Item Records

```sql
-- Add fishing rods to Item table
INSERT INTO "Item" (id, name, kind, meta) VALUES
  (100, 'Old Rod', 'rod', '{"tier": "old", "description": "A basic fishing rod. Can catch common water Pokémon."}'),
  (101, 'Good Rod', 'rod', '{"tier": "good", "description": "A decent fishing rod. Can catch uncommon water Pokémon."}'),
  (102, 'Super Rod', 'rod', '{"tier": "super", "description": "A high-quality rod. Can catch rare water Pokémon."}');
```

### 5.3 User State Tracking

```typescript
// Fishing session state (in-memory, per user)
interface FishingSession {
  odiscordId: string;
  rodType: "OLD_ROD" | "GOOD_ROD" | "SUPER_ROD";
  state: "idle" | "waiting" | "bite" | "reeling";
  castTime?: number;        // When line was cast
  biteTime?: number;        // When bite occurred
  chainCount: number;       // Consecutive casts
  lastCastTime?: number;    // For cooldown
}
```

---

## 6. Button IDs & States

### 6.1 Button ID Schema

| Button ID | Screen | Action |
|-----------|--------|--------|
| `FISH_CAST` | Fishing idle | Cast the line |
| `FISH_REEL_EARLY` | Waiting | Cancel and reel in |
| `FISH_REEL_BITE` | Bite alert | Reel in the fish! |
| `FISH_TRY_AGAIN` | Failed/Nothing | Cast again |
| `FISH_BACK` | Any | Return to explore |

### 6.2 State Machine

```
┌─────────┐
│  IDLE   │ ←──────────────────────┐
└────┬────┘                        │
     │ [FISH_CAST]                 │
     ▼                             │
┌─────────┐                        │
│ WAITING │ ──[FISH_REEL_EARLY]───►│
└────┬────┘                        │
     │ (timer: 2-8s)               │
     ▼                             │
┌─────────┐                        │
│  BITE   │ ──(timeout 3s)────────►│ (fish escaped)
└────┬────┘                        │
     │ [FISH_REEL_BITE]            │
     ▼                             │
┌─────────┐                        │
│ENCOUNTER│ ──(catch/run)─────────►│
└─────────┘                        │
```

### 6.3 Button States

| State | Buttons Shown | Disabled? |
|-------|---------------|-----------|
| No rod | [Back] | Fish disabled |
| Idle | [Cast] [Back] | None |
| Waiting | [Reel Early] | Cast disabled |
| Bite | [REEL IT IN!] | Urgency styling |
| Nothing | [Try Again] [Back] | None |
| Escaped | [Try Again] [Back] | None |

---

## 7. Implementation Plan

### Phase 1: Foundation (Day 1)
- [ ] Add fishing rod items to database seed
- [ ] Create `src/services/fishing.ts` with core logic
- [ ] Add rod checking utility functions
- [ ] Create fishing pool configurations

### Phase 2: UI Screens (Day 2)
- [ ] Create `src/bot/homestead/fish.ts` module
- [ ] Implement idle screen with rod display
- [ ] Implement waiting screen with timer
- [ ] Implement bite alert screen

### Phase 3: Game Loop (Day 3)
- [ ] Implement cast → wait → bite timer
- [ ] Implement reaction window detection
- [ ] Connect to encounter system
- [ ] Handle success/failure paths

### Phase 4: Shop Integration (Day 4)
- [ ] Add rods to shop inventory
- [ ] Add unlock requirements check
- [ ] Implement rod upgrade notifications

### Phase 5: Polish & Analytics (Day 5)
- [ ] Add chain bonus tracking
- [ ] Implement FishingLog analytics
- [ ] Add rod-specific catch messages
- [ ] Test all edge cases

### File Structure

```
src/
├── services/
│   └── fishing.ts          # Core fishing logic
├── bot/
│   └── homestead/
│       └── fish.ts         # Fishing UI screens
└── core/
    └── encounter/
        └── fishing-pools.ts # Water Pokémon pools
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

```typescript
// tests/fishing.spec.ts
describe("Fishing Service", () => {
  describe("hasRod", () => {
    it("returns false when user has no rod");
    it("returns rod tier when user has rod");
    it("returns best rod when user has multiple");
  });
  
  describe("rollFishingEncounter", () => {
    it("returns common pokemon for OLD_ROD");
    it("returns uncommon pokemon for GOOD_ROD");
    it("can return rare pokemon for SUPER_ROD");
    it("respects shiny chain bonus");
    it("returns null for NO_BITE roll");
  });
  
  describe("checkReactionTime", () => {
    it("returns success within 3 seconds");
    it("returns escaped after 3 seconds");
  });
});
```

### 8.2 Integration Tests

```typescript
// tests/fishing.integration.spec.ts
describe("Fishing Flow", () => {
  it("complete happy path: cast → bite → reel → encounter");
  it("handles timeout: cast → bite → missed → try again");
  it("handles no bite: cast → nothing → try again");
  it("enforces cooldown between casts");
  it("blocks fishing without rod");
});
```

### 8.3 Manual Test Checklist

- [ ] Cast with Old Rod → get common fish
- [ ] Cast with Good Rod → get uncommon fish  
- [ ] Cast with Super Rod → get rare fish
- [ ] Miss reaction window → fish escapes
- [ ] Reel early → no encounter
- [ ] No rod → blocked with message
- [ ] Chain 25+ casts → verify shiny bonus
- [ ] Catch Magikarp → verify it goes to party/storage

---

## 📎 Related Documents

- [23-game-design-bible.md](23-game-design-bible.md) — Core design principles
- [09-game-engine.md](09-game-engine.md) — Encounter and battle systems
- [22-starter-selection-flow.md](22-starter-selection-flow.md) — Similar button-flow design

---

## 👥 Design Panel Contributors

**Design Meeting #8 (2025-12-26):**
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

*This document serves as the complete specification for the Fishing System. Implementation should follow this design exactly.*
