# 25 — Trading System Design

**Title:** Player-to-Player Pokémon Trading  
**Purpose:** Complete design specification for the trading mechanic  
**Last Updated (UTC):** 2025-12-26T00:00:00Z  
**Status:** 🟡 DESIGN COMPLETE — Ready for implementation  
**Revision:** 1.0 — Initial design panel discussion

---

## 📋 Table of Contents

1. [Design Overview](#1-design-overview)
2. [User Experience Flow](#2-user-experience-flow)
3. [Screen Layouts](#3-screen-layouts)
4. [Trade Mechanics](#4-trade-mechanics)
5. [Data Requirements](#5-data-requirements)
6. [Button IDs & States](#6-button-ids--states)
7. [Security & Anti-Abuse](#7-security--anti-abuse)
8. [Implementation Plan](#8-implementation-plan)
9. [Testing Strategy](#9-testing-strategy)

---

## 1. Design Overview

### The 30-Second Pitch

> **Trading** allows players to exchange Pokémon with each other in a safe, scam-proof system. Both players must confirm their trade before it executes, creating a social experience built on trust and reciprocity.

### Design Goals

| Goal | Description |
|------|-------------|
| **Social Bonding** | Trading creates connections between players |
| **Collection Completion** | Trade to fill Pokédex gaps |
| **Scam-Proof** | Double-confirmation prevents fraud |
| **Simple UX** | Clear what you're giving vs receiving |
| **Fair Trades** | No pay-to-win, players trade what they caught |

### Psychology of Trading

> **DR. CHEN'S NOTES:**
> 
> Trading activates powerful social psychology:
> - **Reciprocity**: "They gave me their Charmander, I should help them too"
> - **Endowment Effect**: Pokémon we caught ourselves feel MORE valuable
> - **Social Proof**: "Everyone is trading, I should participate"
> - **Trust Building**: Successful trades create friendship
> - **FOMO**: "I need to trade for that rare Pokémon before it's gone"

---

## 2. User Experience Flow

### Happy Path: Initiating a Trade

```
Player A in their homestead channel
        ↓
Types: /trade @PlayerB
        ↓
┌─────────────────────────────────────────┐
│  🔄 TRADE REQUEST                        │
│                                          │
│  You're inviting @PlayerB to trade!      │
│                                          │
│  They'll be notified and can accept      │
│  or decline within 5 minutes.            │
│                                          │
│  [📤 Send Request]  [❌ Cancel]          │
└─────────────────────────────────────────┘
        ↓
Player A clicks [📤 Send Request]
        ↓
Bot DMs Player B:
┌─────────────────────────────────────────┐
│  🔔 TRADE INVITATION                     │
│                                          │
│  @PlayerA wants to trade Pokémon!        │
│                                          │
│  Would you like to trade?                │
│                                          │
│  [✅ Accept]  [❌ Decline]               │
│                                          │
│  ⏱️ Expires in 5 minutes                 │
└─────────────────────────────────────────┘
        ↓
Player B clicks [✅ Accept]
        ↓
Both players see Trade Room (see section 3)
```

### Happy Path: Completing a Trade

```
Trade Room is open for both players
        ↓
Player A selects Pokémon to offer
        ↓
Player B selects Pokémon to offer
        ↓
Both see updated Trade Summary
        ↓
┌─────────────────────────────────────────┐
│  🔄 TRADE SUMMARY                        │
│                                          │
│  YOU OFFER:          YOU RECEIVE:        │
│  ├─ Charmander ★     ├─ Squirtle        │
│  │  Lvl 15           │  Lvl 12          │
│  └─ Fire type        └─ Water type      │
│                                          │
│  [✅ Confirm Trade]  [❌ Cancel]         │
│                                          │
│  Waiting for @PlayerB to confirm...      │
└─────────────────────────────────────────┘
        ↓
BOTH players click [✅ Confirm Trade]
        ↓
┌─────────────────────────────────────────┐
│  ✅ TRADE COMPLETE!                      │
│                                          │
│  You received Squirtle from @PlayerB!    │
│                                          │
│  Take good care of it!                   │
│                                          │
│  [🏠 Back to Home]                       │
└─────────────────────────────────────────┘
```

### Cancellation Paths

**One Player Cancels:**
```
Either player clicks [❌ Cancel]
        ↓
Both players see:
┌─────────────────────────────────────────┐
│  ❌ TRADE CANCELLED                      │
│                                          │
│  @PlayerX cancelled the trade.           │
│                                          │
│  No Pokémon were exchanged.              │
│                                          │
│  [🏠 Back to Home]                       │
└─────────────────────────────────────────┘
```

**Trade Expires (No Activity):**
```
5 minutes of inactivity
        ↓
Both players see:
┌─────────────────────────────────────────┐
│  ⏱️ TRADE EXPIRED                        │
│                                          │
│  The trade session has timed out.        │
│                                          │
│  No Pokémon were exchanged.              │
│                                          │
│  [🏠 Back to Home]                       │
└─────────────────────────────────────────┘
```

---

## 3. Screen Layouts

### 3.1 Trade Room — Selection Phase

```
┌──────────────────────────────────────────────────────────────────────┐
│  🔄 TRADE ROOM — Trading with @PlayerB                               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  YOUR OFFER:                    THEIR OFFER:                         │
│  ┌─────────────────┐           ┌─────────────────┐                   │
│  │ (empty)         │           │ (empty)         │                   │
│  │ Select a        │           │ Waiting for     │                   │
│  │ Pokémon below   │           │ @PlayerB...     │                   │
│  └─────────────────┘           └─────────────────┘                   │
│                                                                       │
│  ─────────────────────────────────────────────────                   │
│  YOUR POKÉMON:                                                        │
│                                                                       │
│  [🔥 Charmander ★ Lv15]  [💧 Squirtle Lv12]  [🌿 Bulbasaur Lv10]    │
│  [⚡ Pikachu Lv20]       [🌙 Eevee Lv8]      [📦 More...]            │
│                                                                       │
│  ─────────────────────────────────────────────────                   │
│  [❌ Cancel Trade]                                                    │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 Trade Room — Pokémon Selected

```
┌──────────────────────────────────────────────────────────────────────┐
│  🔄 TRADE ROOM — Trading with @PlayerB                               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  YOUR OFFER:                    THEIR OFFER:                         │
│  ┌─────────────────┐           ┌─────────────────┐                   │
│  │ 🔥 Charmander ★ │           │ 💧 Squirtle     │                   │
│  │ Level: 15       │           │ Level: 12       │                   │
│  │ HP: 45/45       │           │ HP: 38/38       │                   │
│  │ OT: You         │           │ OT: @PlayerB    │                   │
│  └─────────────────┘           └─────────────────┘                   │
│                                                                       │
│  ─────────────────────────────────────────────────                   │
│  TRADE STATUS:                                                        │
│  • You: Ready to trade ✅                                            │
│  • @PlayerB: Ready to trade ✅                                       │
│                                                                       │
│  ─────────────────────────────────────────────────                   │
│  [✅ CONFIRM TRADE]  [🔄 Change Pokémon]  [❌ Cancel]                 │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.3 Waiting for Partner Confirmation

```
┌──────────────────────────────────────────────────────────────────────┐
│  🔄 TRADE ROOM — Finalizing...                                       │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  YOUR OFFER:                    THEIR OFFER:                         │
│  ┌─────────────────┐           ┌─────────────────┐                   │
│  │ 🔥 Charmander ★ │           │ 💧 Squirtle     │                   │
│  │ Level: 15       │           │ Level: 12       │                   │
│  │ ✅ CONFIRMED    │           │ ⏳ PENDING...   │                   │
│  └─────────────────┘           └─────────────────┘                   │
│                                                                       │
│  ─────────────────────────────────────────────────                   │
│  You have confirmed the trade.                                        │
│                                                                       │
│  Waiting for @PlayerB to confirm...                                   │
│                                                                       │
│  [❌ Cancel Trade]                                                    │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.4 Trade Complete Screen

```
┌──────────────────────────────────────────────────────────────────────┐
│  ✅ TRADE SUCCESSFUL!                                                │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  🎉 Congratulations!                                                 │
│                                                                       │
│  You traded away:              You received:                         │
│  ├─ 🔥 Charmander ★            ├─ 💧 Squirtle                       │
│  │  Lvl 15                     │  Lvl 12                            │
│  └─ → Now with @PlayerB        └─ From @PlayerB                     │
│                                                                       │
│  ─────────────────────────────────────────────────                   │
│  📊 Trade Stats:                                                      │
│  • Your total trades: 7                                              │
│  • Traded with @PlayerB: 2 times                                     │
│                                                                       │
│  [🏠 Back to Home]                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. Trade Mechanics

### 4.1 What Can Be Traded

| Tradeable | Not Tradeable |
|-----------|---------------|
| ✅ Regular Pokémon | ❌ Eggs (can't verify contents) |
| ✅ Shiny Pokémon | ❌ Pokémon in active battle |
| ✅ High-level Pokémon | ❌ Fainted Pokémon (heal first) |
| ✅ Pokémon with items | ❌ Your last remaining Pokémon |

### 4.2 Trade Restrictions

```typescript
const TRADE_RESTRICTIONS = {
  // Cooldown between trades with same person
  SAME_PERSON_COOLDOWN_MS: 60 * 60 * 1000, // 1 hour
  
  // Maximum trades per day
  MAX_TRADES_PER_DAY: 10,
  
  // Trade session timeout
  SESSION_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes
  
  // Invitation expiry
  INVITE_EXPIRY_MS: 5 * 60 * 1000, // 5 minutes
  
  // Minimum account age to trade
  MIN_ACCOUNT_AGE_DAYS: 1,
  
  // Minimum Pokémon caught to trade
  MIN_POKEMON_CAUGHT: 5,
};
```

### 4.3 Trade Evolution Support

Some Pokémon evolve when traded:

| Pokémon | Evolution | Condition |
|---------|-----------|-----------|
| Kadabra | → Alakazam | Trade |
| Machoke | → Machamp | Trade |
| Graveler | → Golem | Trade |
| Haunter | → Gengar | Trade |
| Boldore | → Gigalith | Trade |
| Gurdurr | → Conkeldurr | Trade |
| Phantump | → Trevenant | Trade |
| Pumpkaboo | → Gourgeist | Trade |

```typescript
// Trade evolution check runs after successful trade
async function checkTradeEvolution(pokemon: Monster): Promise<Monster | null> {
  const tradeEvolutions: Record<number, number> = {
    64: 65,   // Kadabra → Alakazam
    67: 68,   // Machoke → Machamp
    75: 76,   // Graveler → Golem
    93: 94,   // Haunter → Gengar
    // ... etc
  };
  
  if (tradeEvolutions[pokemon.speciesId]) {
    return evolve(pokemon, tradeEvolutions[pokemon.speciesId]);
  }
  return null;
}
```

### 4.4 Original Trainer (OT) System

```typescript
interface TradedPokemon {
  id: string;
  speciesId: number;
  level: number;
  
  // OT fields update on trade
  originalTrainerId: string;   // First person to catch it
  originalTrainerName: string; // Their display name
  currentOwnerId: string;      // Current owner
  
  // Trade history
  tradeCount: number;          // How many times traded
  lastTradedAt: Date | null;   // When last traded
}
```

---

## 5. Data Requirements

### 5.1 Database Schema

```prisma
// Trade session tracking
model TradeSession {
  id            String   @id @default(cuid())
  
  // Participants
  initiatorId   String
  recipientId   String
  
  // State
  status        String   // PENDING, ACTIVE, CONFIRMING, COMPLETED, CANCELLED, EXPIRED
  
  // Offers (null until selected)
  initiatorMonsterId  String?
  recipientMonsterId  String?
  
  // Confirmation flags
  initiatorConfirmed  Boolean @default(false)
  recipientConfirmed  Boolean @default(false)
  
  // Timestamps
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  completedAt   DateTime?
  expiresAt     DateTime
  
  @@index([initiatorId])
  @@index([recipientId])
  @@index([status])
}

// Trade history log
model TradeLog {
  id              String   @id @default(cuid())
  sessionId       String
  
  // Who traded what
  senderId        String
  receiverId      String
  senderMonsterId String
  receiverMonsterId String
  
  // Pokémon details at time of trade
  senderSpeciesId   Int
  receiverSpeciesId Int
  senderLevel       Int
  receiverLevel     Int
  senderShiny       Boolean
  receiverShiny     Boolean
  
  // Evolution triggered?
  senderEvolved     Boolean @default(false)
  receiverEvolved   Boolean @default(false)
  
  createdAt       DateTime @default(now())
  
  @@index([senderId])
  @@index([receiverId])
}

// Extend Monster model
model Monster {
  // ... existing fields ...
  
  // OT tracking
  originalTrainerId   String?
  originalTrainerName String?
  tradeCount          Int      @default(0)
  lastTradedAt        DateTime?
}
```

### 5.2 Trade Session State Machine

```
PENDING ─────► ACTIVE ─────► CONFIRMING ─────► COMPLETED
   │             │               │
   │             │               │
   └─► EXPIRED   └─► CANCELLED   └─► CANCELLED
```

---

## 6. Button IDs & States

### 6.1 Button ID Schema

| Button ID | Screen | Action |
|-----------|--------|--------|
| `TRADE_SEND_REQUEST` | Invite screen | Send trade invite |
| `TRADE_CANCEL_INVITE` | Invite screen | Cancel invite |
| `TRADE_ACCEPT` | Received invite | Accept trade |
| `TRADE_DECLINE` | Received invite | Decline trade |
| `TRADE_SELECT_<monsterId>` | Trade room | Select Pokémon to offer |
| `TRADE_CHANGE` | Trade room | Change selection |
| `TRADE_CONFIRM` | Trade room | Confirm final trade |
| `TRADE_CANCEL` | Trade room | Cancel trade |
| `TRADE_MORE` | Trade room | Show more Pokémon |
| `TRADE_BACK_HOME` | Complete/Cancel | Return to homestead |

### 6.2 Button States by Screen

| Screen | Buttons | Notes |
|--------|---------|-------|
| Invite | [Send] [Cancel] | |
| Received Invite | [Accept] [Decline] | Expires in 5 min |
| Trade Room (empty) | [Pokémon list] [Cancel] | Select your offer |
| Trade Room (selected) | [Confirm] [Change] [Cancel] | Both must confirm |
| Waiting Confirmation | [Cancel] only | Partner hasn't confirmed |
| Complete | [Back Home] | Trade done! |
| Cancelled/Expired | [Back Home] | No trade occurred |

---

## 7. Security & Anti-Abuse

### 7.1 Scam Prevention

```typescript
// Both must confirm = no scams possible
interface TradeConfirmation {
  // Player sees EXACTLY what they're getting
  showDetails: {
    species: string;
    level: number;
    shiny: boolean;
    stats: Stats;
    moves: Move[];
  };
  
  // Both must click confirm
  requiresBothConfirm: true;
  
  // Can cancel anytime before both confirm
  allowCancelBeforeConfirm: true;
}
```

### 7.2 Rate Limiting

```typescript
const TRADE_RATE_LIMITS = {
  // Per-user limits
  maxTradesPerDay: 10,
  maxPendingInvites: 3,
  cooldownBetweenInvites: 30 * 1000, // 30 seconds
  
  // Per-pair limits  
  samePairCooldown: 60 * 60 * 1000, // 1 hour between same pair
  
  // Account requirements
  minAccountAge: 24 * 60 * 60 * 1000, // 1 day old
  minPokemonCaught: 5,
};
```

### 7.3 Audit Trail

```typescript
// Every trade action is logged
interface TradeAuditLog {
  timestamp: Date;
  sessionId: string;
  action: "INVITE" | "ACCEPT" | "DECLINE" | "SELECT" | "CONFIRM" | "CANCEL" | "COMPLETE" | "EXPIRE";
  userId: string;
  details: Record<string, unknown>;
}
```

### 7.4 Rollback Support

```typescript
// In case of errors, trades can be reversed
async function rollbackTrade(tradeLogId: string): Promise<void> {
  const log = await getTradeLog(tradeLogId);
  
  // Swap Pokémon back
  await transferPokemon(log.senderMonsterId, log.senderId);
  await transferPokemon(log.receiverMonsterId, log.receiverId);
  
  // Mark as rolled back
  await markTradeRolledBack(tradeLogId, "Admin rollback");
}
```

---

## 8. Implementation Plan

### Phase 1: Foundation (Day 1-2)
- [ ] Create Prisma schema migrations
- [ ] Create `src/services/trading.ts` with core logic
- [ ] Implement trade session state machine
- [ ] Add rate limiting utilities

### Phase 2: Trade Command (Day 3)
- [ ] Create `/trade @user` slash command
- [ ] Implement invite sending flow
- [ ] Create notification system for invites
- [ ] Handle accept/decline responses

### Phase 3: Trade Room UI (Day 4-5)
- [ ] Create `src/bot/homestead/trade.ts` module
- [ ] Implement Pokémon selection interface
- [ ] Build trade summary display
- [ ] Add confirmation flow

### Phase 4: Trade Execution (Day 6)
- [ ] Implement atomic trade transaction
- [ ] Add OT transfer logic
- [ ] Implement trade evolution checks
- [ ] Create trade completion notifications

### Phase 5: Polish & Analytics (Day 7)
- [ ] Add trade statistics tracking
- [ ] Implement trade history command
- [ ] Add partner trading stats
- [ ] Test all edge cases

### File Structure

```
src/
├── services/
│   └── trading.ts           # Core trading logic
├── bot/
│   ├── commands/
│   │   └── trade.ts         # /trade slash command
│   └── homestead/
│       └── trade.ts         # Trade room UI
└── shared/
    └── trade-state.ts       # In-memory session tracking
```

---

## 9. Testing Strategy

### 9.1 Unit Tests

```typescript
// tests/trading.spec.ts
describe("Trading Service", () => {
  describe("canTrade", () => {
    it("blocks trades with self");
    it("blocks trades without minimum pokemon");
    it("blocks trades within cooldown");
    it("allows valid trade requests");
  });
  
  describe("createTradeSession", () => {
    it("creates session with correct status");
    it("sets expiry time correctly");
  });
  
  describe("selectPokemon", () => {
    it("updates session with selection");
    it("blocks selecting fainted pokemon");
    it("blocks selecting last pokemon");
  });
  
  describe("confirmTrade", () => {
    it("requires both confirmations");
    it("executes trade when both confirm");
    it("triggers trade evolution");
  });
});
```

### 9.2 Integration Tests

```typescript
// tests/trading.integration.spec.ts
describe("Trading Flow", () => {
  it("complete happy path: invite → accept → select → confirm → complete");
  it("handles decline: invite → decline → cancelled");
  it("handles timeout: invite → expire");
  it("handles cancel during selection");
  it("handles cancel during confirmation");
  it("trade evolution triggers correctly");
});
```

### 9.3 Manual Test Checklist

- [ ] Send trade invite to another player
- [ ] Receive and accept trade invite
- [ ] Receive and decline trade invite
- [ ] Select Pokémon in trade room
- [ ] Change selected Pokémon
- [ ] Both confirm → trade completes
- [ ] One cancels → trade cancelled
- [ ] Session timeout → trade expired
- [ ] Trade Kadabra → evolves to Alakazam
- [ ] OT updates correctly after trade
- [ ] Rate limits enforced correctly

---

## 📎 Related Documents

- [23-game-design-bible.md](23-game-design-bible.md) — Core design principles
- [24-fishing-system.md](24-fishing-system.md) — Similar button-flow design
- [22-starter-selection-flow.md](22-starter-selection-flow.md) — Selection UI patterns

---

## 👥 Design Panel Contributors

**Design Meeting #9 (2025-12-26):**
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

*This document serves as the complete specification for the Trading System. Implementation should follow this design exactly.*
