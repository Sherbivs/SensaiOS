# 23 — Game Design Bible

**Title:** Game Design Philosophy & Player Experience  
**Purpose:** Core gameplay decisions, UX patterns, and design principles  
**Last Updated (UTC):** 2025-12-24T03:00:00Z  
**Status:** 🟢 ACTIVE — Foundational design document  
**Revision:** 2.0 — Panel review expansion (ported from V2)

---

## 📋 Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Button-First UI](#2-button-first-ui)
3. [The Living Game Model](#3-the-living-game-model)
4. [Slash Commands (Recovery Only)](#4-slash-commands-recovery-only)
5. [Starter Selection System](#5-starter-selection-system)
6. [Screen Architecture](#6-screen-architecture)
7. [Core Gameplay Loop](#7-core-gameplay-loop)
8. [Engagement Systems](#8-engagement-systems)

---

## 1. Design Philosophy

### The 30-Second Pitch

> **Pokémon Infinity Gauntlet** is a Discord-native Pokémon game where you pick up your controller (buttons) and play — no commands to memorize, no tutorials required.

### Core Principles

| Principle | Description |
|-----------|-------------|
| **Button-First** | Gameplay happens through button clicks, not text commands |
| **Living Game** | Your homestead channel IS your game — always shows current state |
| **Zero Learning Curve** | New players see options, click, and play immediately |
| **Pick Up & Play** | Return to Discord, your game is where you left it |
| **Recovery, Not Commands** | `/start` exists only to fix broken states |

### Emotional Design Goals

Every interaction should evoke one of these core feelings:

| Feeling | Trigger | Example |
|---------|---------|---------|
| **Wonder** | Discovery, mystery | "What's in that tall grass?" |
| **Ownership** | Personal connection | "This is MY Absol, I chose it" |
| **Mastery** | Learning, improvement | "I learned the type chart!" |
| **Collection** | Completion, progress | "Gotta catch 'em all" |
| **Excitement** | Rare events, close calls | "A SHINY appeared!" |

### What We're NOT Building

❌ A command-line bot ("type `/walk` to explore")  
❌ A tutorial-heavy experience ("read the rules first")  
❌ A complex menu system ("go to channel X, then type Y")  
❌ A chat-based RPG ("type 'attack' to fight")

### What We ARE Building

✅ A game you play with buttons, like a console game  
✅ An experience that just works when you open Discord  
✅ A persistent world that remembers where you left off  
✅ An interface that shows you what you can do

---

## 2. Button-First UI

### Why Buttons > Commands

| Slash Commands | Buttons |
|----------------|---------|
| Player must remember command names | Visual options presented |
| Typing required | One tap/click |
| Easy to mistype | No errors possible |
| Feels like "using a tool" | Feels like "playing a game" |
| Cold, technical | Warm, interactive |

### Button ID Convention

Discord gives us 100 characters for `custom_id`. Our schema:

```
{screen}_{action}_{data}
```

**Examples:**
| Button ID | Meaning |
|-----------|---------|
| `home_explore` | Go to explore from home |
| `explore_walk` | Walk action in explore |
| `battle_move_1` | Select move slot 1 |
| `battle_move_2` | Select move slot 2 |
| `encounter_catch_pokeball` | Throw a Poké Ball |
| `encounter_catch_greatball` | Throw a Great Ball |
| `starter_select_25` | Select Pikachu (dex #25) |
| `party_view_0` | View party slot 0 (lead) |
| `pokedex_page_next` | Next Pokédex page |

### Button States

**When are buttons disabled (greyed out)?**

| Context | Button | Disabled When |
|---------|--------|---------------|
| Battle | [Fight] | All moves have 0 PP |
| Battle | [Run] | Trainer battle (can't flee) |
| Battle | [Switch] | Only 1 Pokémon alive in party |
| Encounter | [Catch] | No Poké Balls in bag |
| Home | [Explore] | All party Pokémon fainted |
| Party | [Set Lead] | Already the lead Pokémon |

### Button Limits

Discord constraints:
- **Max 5 buttons per row**
- **Max 5 rows per message**
- **Total: 25 buttons maximum**

**Our layouts:**
| Screen | Rows | Buttons |
|--------|------|---------|
| Home | 2 | 5 (Explore, Party, Bag, Dex, Heal) |
| Battle | 2 | 5 (Fight, Bag, Switch, Run + Back) |
| Move Select | 2 | 5 (Move×4 + Back) |
| Party | 2 | 7 (Pokémon×6 + Back) |

### The Interface Pattern

Every game screen follows this pattern:

```
┌─────────────────────────────────────────────┐
│  [SCREEN TITLE / HEADER]                    │
│                                             │
│  [Contextual information / game state]      │
│  [Visual elements: HP bars, Pokemon, etc.]  │
│                                             │
│  [Action Button 1] [Action Button 2]        │
│  [Action Button 3] [Action Button 4]        │
└─────────────────────────────────────────────┘
```

### Button Interaction Flow

```
Player clicks button
    ↓
Bot processes action (updates database)
    ↓
Bot updates THE SAME MESSAGE with new embed + buttons
    ↓
Player sees new state, clicks next button
    ↓
(Repeat — seamless game loop)
```

### Message Update, Not Message Spam

**CRITICAL:** We update the existing message, not send new ones.

```typescript
// ✅ CORRECT: Update the same message
await interaction.update({
  embeds: [newScreenEmbed],
  components: [newButtonRows]
});

// ❌ WRONG: Send a new message
await interaction.reply({ embeds: [...], components: [...] });
```

This creates a "game window" experience — one message that transforms as you play.

---

## 3. The Living Game Model

### Homestead Channel = Game Window

Each player has a private **homestead channel** (`homestead-{username}`) that serves as their persistent game window.

```
┌─────────────────────────────────────────────────────────────┐
│                     HOMESTEAD CHANNEL                        │
│                   (Player's Game Window)                     │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  ACTIVE MESSAGE (Always exists, always has buttons) │    │
│  │                                                      │    │
│  │  Current screen: Home / Battle / Encounter / etc    │    │
│  │                                                      │    │
│  │  [Button] [Button] [Button]                         │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  (Historical messages above - old states, for context)      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Why "Living Game" Works (Psychology)

| Principle | Effect | Player Feeling |
|-----------|--------|----------------|
| **Zeigarnik Effect** | Unfinished tasks stay in memory | "I need to go back and finish that battle" |
| **Ownership Effect** | Your name is on the channel | "This is MY space" |
| **Reduced Friction** | No loading, no commands | "I can just... play" |
| **Social Proof** | Others see your homestead exists | "I'm part of this" |

### State Persistence

The **database is the source of truth**. The embed/message is just a view.

```typescript
interface TrainerGameState {
  odiscordId: string;      // User's Discord ID
  homesteadChannelId: string; // Their homestead channel
  activeMessageId: string; // Current game message with buttons
  currentScreen: Screen;   // What they're looking at
  screenData: object;      // Screen-specific state (battle id, etc.)
}
```

### Game State Machine

```
                        ┌──────────┐
                        │  START   │
                        └────┬─────┘
                             │
                    ┌────────▼────────┐
                    │  HAS_TRAINER?   │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │ NO                          │ YES
              ▼                             ▼
      ┌───────────────┐           ┌─────────────────┐
      │  WELCOME      │           │  LOADING_STATE  │
      │  (new player) │           │  (check DB)     │
      └───────┬───────┘           └────────┬────────┘
              │                            │
              ▼                            │
      ┌───────────────┐                    │
      │ STARTER_SELECT│                    │
      └───────┬───────┘                    │
              │                            │
              └──────────────┬─────────────┘
                             ▼
                     ┌───────────────┐
                     │     HOME      │◄────────────────┐
                     └───────┬───────┘                 │
                             │                         │
         ┌─────────┬─────────┼─────────┬─────────┐    │
         ▼         ▼         ▼         ▼         ▼    │
    ┌─────────┐ ┌─────┐ ┌─────────┐ ┌─────┐ ┌──────┐ │
    │ EXPLORE │ │PARTY│ │   BAG   │ │ DEX │ │ HEAL │─┘
    └────┬────┘ └──┬──┘ └────┬────┘ └──┬──┘ └──────┘
         │        │         │         │
         ▼        │         │         │
    ┌─────────┐   │         │         │
    │ENCOUNTER│   │         │         │
    └────┬────┘   │         │         │
         │        │         │         │
    ┌────▼────┐   │         │         │
    │ BATTLE  │   │         │         │
    └────┬────┘   │         │         │
         │        │         │         │
         └────────┴─────────┴─────────┴───────► HOME
```

### Edge Case Handling

**Message Deleted (by user or Discord):**
```
Next button click → "Message not found" error
    │
    └── Catch error → Post new message → Update DB with new message ID
```

**Bot Restarted:**
```
On startup: Load all active trainers
    │
    └── Check each trainer's activeMessageId
        ├── Message exists → Do nothing
        └── Message deleted → Mark as "needs_resurrection"
            └── On next interaction → Post new message
```

### Player Experience Flow

```
┌──────────────────────────────────────────────────────────────┐
│                 RETURNING PLAYER                              │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Opens Discord                                                │
│       ↓                                                       │
│  Goes to homestead channel                                    │
│       ↓                                                       │
│  ┌─ Active message exists? ─┐                                │
│  │                          │                                │
│  ▼ YES                      ▼ NO (rare - bot restart, etc)   │
│  Click buttons              Type /start                       │
│  Continue playing           Bot reloads state                │
│       │                          │                            │
│       └──────────┬───────────────┘                            │
│                  ▼                                            │
│           BACK TO PLAYING                                     │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. Slash Commands (Recovery Only)

### The Only Command Players Need

| Command | Purpose | When Used |
|---------|---------|-----------|
| `/start` | **Reload & Heal** | Game seems stuck, buttons missing, returning after long break |

**That's it. One command.**

### What `/start` Does — Step by Step

```
PLAYER TYPES: /start

STEP 1: ACKNOWLEDGMENT (immediate, <100ms)
┌─────────────────────────────────────────┐
│  🔄 Loading your adventure...           │
│                                         │
│  (ephemeral - only player sees this)    │
└─────────────────────────────────────────┘

STEP 2: DATABASE CHECK
- Load trainer by Discord ID
- If no trainer → NEW PLAYER flow
- If trainer exists → RETURNING PLAYER flow

STEP 3A: NEW PLAYER
┌─────────────────────────────────────────┐
│  🌟 WELCOME TO POKÉMON INFINITY GAUNTLET│
│                                         │
│  Your adventure begins now!             │
│                                         │
│  Before we start, you'll need           │
│  to choose your first Pokémon...        │
│                                         │
│  [🎮 Begin Journey]                     │
└─────────────────────────────────────────┘

STEP 3B: RETURNING PLAYER
- Check for corruption (orphan battles, invalid party, etc.)
- Heal any issues found
- Determine correct screen based on state

┌─────────────────────────────────────────┐
│  ✨ WELCOME BACK, [TRAINER]!            │
│                                         │
│  ✓ Party restored (3 Pokémon)           │
│  ✓ No issues detected                   │
│                                         │
│  Ready to continue your adventure?      │
│                                         │
│  [▶️ Continue]                          │
└─────────────────────────────────────────┘

STEP 4: POST MESSAGE
- Delete old active message (if exists)
- Post new message with correct screen
- Store new message ID in database
```

### What `/start` Does NOT Do

| Action | Does It? | Why |
|--------|----------|-----|
| Reset progress | ❌ NO | Would destroy player data |
| Heal Pokémon HP | ❌ NO | That's what the Heal button is for |
| Cancel active battles | ❌ NO | Would be exploitable |
| Wipe inventory | ❌ NO | Would destroy player data |
| Give free items | ❌ NO | Would be exploitable |

**`/start` is SAFE** — players should never fear using it.

### Technical Implementation

```typescript
async function handleStartCommand(userId: string, channel: TextChannel) {
  // 1. Load trainer from database (source of truth)
  const trainer = await db.trainer.findUnique({
    where: { odiscordId: odiscordId },
    include: { party: true, pokemon: true }
  });
  
  // 2. Check for corruption/inconsistencies
  const healed = await healTrainerState(trainer);
  if (healed.issuesFixed > 0) {
    log.info(`Healed ${healed.issuesFixed} issues for ${odiscordId}`);
  }
  
  // 3. Determine correct screen based on state
  const screen = determineCurrentScreen(trainer);
  // - If in active battle → show battle screen
  // - If in active encounter → show encounter screen  
  // - Otherwise → show home screen
  
  // 4. Post fresh message with correct buttons
  const message = await channel.send({
    embeds: [buildScreenEmbed(screen, trainer)],
    components: [buildScreenButtons(screen)]
  });
  
  // 5. Store message ID for future updates
  await db.trainer.update({
    where: { odiscordId: odiscordId },
    data: { activeMessageId: message.id }
  });
}
```

### Hidden Admin Commands (Not for Players)

| Command | Purpose | Access |
|---------|---------|--------|
| `/debug` | Show internal state | Admin only |
| `/reset` | Full account reset | Admin only, requires confirmation |

---

## 5. Starter Selection System

### The "Infinity Gauntlet" Philosophy

Unlike traditional Pokémon games with 3 preset starters, Infinity Gauntlet uses an **OPEN SELECTION** system:

```
┌─────────────────────────────────────────────────────────────┐
│                 INFINITY GAUNTLET RULES                      │
│                                                              │
│  ✅ ALLOWED: Almost ANY Pokémon! (800+ options)             │
│     • Pikachu, Eevee, Growlithe, Scyther, Riolu...          │
│     • Dratini, Larvitar, Gible (pre-evolutions OK)          │
│                                                              │
│  ❌ FORBIDDEN:                                               │
│     • Regional Starters (Bulbasaur, Charmander, etc.)       │
│     • Legendaries (Mewtwo, Lugia, Rayquaza, etc.)           │
│     • Mythicals (Mew, Celebi, Jirachi, etc.)                │
│     • Pseudo-Legendary FINALS (Dragonite, Tyranitar, etc.)  │
│       (But Dratini and Larvitar ARE allowed!)               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Why This Design

| Classic Games | Infinity Gauntlet |
|---------------|-------------------|
| Choose 1 of 3 | Choose from 800+ |
| Everyone has same options | YOUR journey is unique |
| Nostalgia-driven | Player agency-driven |
| "Charmander gang" | "I started with Absol!" |

**The fantasy:** "What if YOU could pick your own starter?"

### Forbidden Categories (Technical)

```typescript
// From src/core/starter-validation.ts

// Regional starters - all generations (base + evolutions)
const REGIONAL_STARTERS: Set<number>; // 54 species

// Legendary Pokemon (box legendaries, trios)
const LEGENDARY_POKEMON: Set<number>; // 60+ species

// Mythical Pokemon (event-exclusive)
const MYTHICAL_POKEMON: Set<number>; // 25+ species

// Pseudo-legendary FINAL forms only
const PSEUDO_LEGENDARY_FINALS: Set<number>; // 10 species
// (Earlier forms like Larvitar, Dratini ARE allowed)

function isForbiddenStarter(speciesId: number): boolean {
  return (
    isRegionalStarter(speciesId) ||
    isLegendary(speciesId) ||
    isMythical(speciesId) ||
    isPseudoLegendaryFinal(speciesId)
  );
}
```

### Starter Selection UX — Full Flow

**Approach: Hybrid** (Featured picks + Random + Search + Browse)

```
SCREEN 1: FEATURED PICKS
┌─────────────────────────────────────────────────────────────┐
│  👨‍🔬 PROFESSOR OAK                                          │
│                                                              │
│  "Welcome, young Trainer! The world of Pokémon awaits!"     │
│                                                              │
│  "Unlike other regions, here in the Infinity Gauntlet,      │
│   you can choose almost ANY Pokémon as your partner!"       │
│                                                              │
│  "Here are some popular choices, or search for your own..." │
│                                                              │
│  🌟 Popular Picks:                                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                        │
│  │⚡Pikachu│ │🦊 Eevee │ │🔥Growlith│                        │
│  └─────────┘ └─────────┘ └─────────┘                        │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                        │
│  │💧Psyduck│ │👻 Gastly│ │💚 Ralts │                        │
│  └─────────┘ └─────────┘ └─────────┘                        │
│                                                              │
│  [🎲 Random 6] [🔍 Search] [📖 Browse by Type]              │
└─────────────────────────────────────────────────────────────┘
```

**Player Type Handling:**

| Player Type | Behavior | How Served |
|-------------|----------|------------|
| **Decisive** | Knows what they want | Search immediately |
| **Casual** | Wants easy pick | Featured row (one click) |
| **Explorer** | Wants to discover | Random / Browse |
| **Nostalgic** | Wants childhood fave | Search by name |

```
SCREEN 2: SEARCH MODAL (after clicking [🔍 Search])
┌─────────────────────────────────────────────────────────────┐
│  🔍 Search for a Pokémon                                    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Type a name... (e.g., "Absol", "Riolu", "Dratini")  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  [Cancel] [Search]                                          │
└─────────────────────────────────────────────────────────────┘

SCREEN 3: SEARCH RESULTS (after typing "Absol")
┌─────────────────────────────────────────────────────────────┐
│  🔍 Results for "Absol"                                     │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  #359 ABSOL                                          │    │
│  │  Type: Dark                                          │    │
│  │  "It senses disasters and appears before people      │    │
│  │   to warn them of impending danger."                 │    │
│  │                                                      │    │
│  │  Base Stats:                                         │    │
│  │  HP: 65 | ATK: 130 | DEF: 60                         │    │
│  │  SP.ATK: 75 | SP.DEF: 60 | SPD: 75                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  [✅ Choose Absol!] [🔙 Back to Search]                     │
└─────────────────────────────────────────────────────────────┘

SCREEN 4: CONFIRMATION
┌─────────────────────────────────────────────────────────────┐
│  ⭐ CONFIRM YOUR CHOICE                                     │
│                                                              │
│  You've chosen ABSOL as your partner!                       │
│                                                              │
│  ⚠️ This choice is permanent for this adventure.            │
│                                                              │
│  Are you sure?                                              │
│                                                              │
│  [✅ Yes, I choose Absol!] [🔙 Let me reconsider...]        │
└─────────────────────────────────────────────────────────────┘

SCREEN 5: CELEBRATION
┌─────────────────────────────────────────────────────────────┐
│  🎉 CONGRATULATIONS!                                        │
│                                                              │
│     ✨ You received ABSOL! ✨                                │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         [ABSOL SPRITE/IMAGE]                         │    │
│  │                                                      │    │
│  │  Absol joined your party!                            │    │
│  │  Level: 5                                            │    │
│  │  Nature: [Random] (affects stats)                    │    │
│  │                                                      │    │
│  │  Moves:                                              │    │
│  │  • Scratch                                           │    │
│  │  • Leer                                              │    │
│  │  • Quick Attack                                      │    │
│  │  • Pursuit                                           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  [🏠 Go to Homestead!]                                      │
└─────────────────────────────────────────────────────────────┘
```

### Rejection Messages

When a forbidden Pokémon is selected:

```
FORBIDDEN STARTER SCREEN
┌─────────────────────────────────────────────────────────────┐
│  ❌ CHARMANDER CAN'T BE CHOSEN                              │
│                                                              │
│  Regional starters (Charmander, Squirtle, Bulbasaur, etc.)  │
│  can't be chosen as Infinity Gauntlet starters.             │
│                                                              │
│  💡 Why? These are reserved for special events!             │
│                                                              │
│  But don't worry — you can still choose from 800+ other     │
│  amazing Pokémon! Try one of these instead:                 │
│                                                              │
│  🔥 Fire Types: Growlithe, Vulpix, Ponyta, Magby            │
│                                                              │
│  [🔍 Search Again] [🔙 Back to Featured]                    │
└─────────────────────────────────────────────────────────────┘
```

| Reason | Alternative Suggestion |
|--------|------------------------|
| Regional Starter | Same-type alternatives (Fire: Growlithe, etc.) |
| Legendary | "These appear in special events!" |
| Mythical | "These appear in special events!" |
| Pseudo-Legendary Final | "You can choose [pre-evo] instead!" |

---

## 6. Screen Architecture

### Screen Types

```typescript
type Screen = 
  | 'welcome'        // New player - intro
  | 'starter_select' // Choosing first Pokemon
  | 'home'           // Main homestead menu
  | 'explore'        // Walking in wild
  | 'encounter'      // Wild Pokemon appeared
  | 'battle'         // In battle
  | 'battle_moves'   // Selecting a move
  | 'party'          // Viewing party
  | 'party_detail'   // Single Pokemon details
  | 'bag'            // Inventory
  | 'bag_category'   // Items in category
  | 'pokedex'        // Collection
  | 'pokedex_entry'  // Single Pokedex entry
  | 'heal_confirm'   // Heal confirmation
```

### Complete Navigation Map

```
HOME SCREEN
├── [🚶 Explore] ──────────► EXPLORE SCREEN
│                             ├── [👟 Walk] ──────► ENCOUNTER (or "Nothing found")
│                             ├── [🎣 Fish] ──────► ENCOUNTER (if water area)
│                             └── [🏠 Back] ──────► HOME
│
├── [📋 Party] ────────────► PARTY SCREEN
│                             ├── [Pokémon 1-6] ──► POKEMON DETAIL
│                             │                     ├── [📊 Stats] (toggle view)
│                             │                     ├── [🔄 Set Lead] (if not lead)
│                             │                     └── [🔙 Back] ──► PARTY
│                             └── [🔙 Back] ──────► HOME
│
├── [🎒 Bag] ──────────────► BAG SCREEN
│                             ├── [Category] ─────► ITEM LIST
│                             │                     ├── [Item] ──► USE/GIVE menu
│                             │                     └── [🔙 Back] ──► BAG
│                             └── [🔙 Back] ──────► HOME
│
├── [📖 Pokédex] ──────────► POKEDEX SCREEN
│                             ├── [◀️ Prev] / [▶️ Next]
│                             ├── [Pokémon Entry] ─► POKEDEX DETAIL
│                             │                      └── [🔙 Back] ──► POKEDEX
│                             └── [🔙 Back] ──────► HOME
│
└── [💊 Heal] ─────────────► HEAL CONFIRMATION
                              ├── [✅ Heal All] ──► HOME (with healed message)
                              └── [❌ Cancel] ────► HOME


ENCOUNTER SCREEN
├── [⚔️ Fight] ────────────► BATTLE SCREEN (wild battle initiated)
├── [🎒 Bag] ──────────────► CATCH ITEMS (Poké Balls only)
│                             ├── [Poké Ball] ────► CATCH ATTEMPT
│                             │                     ├── Success ──► HOME + celebration
│                             │                     └── Fail ─────► ENCOUNTER (continue)
│                             └── [🔙 Back] ──────► ENCOUNTER
├── [🔄 Switch] ───────────► PARTY SELECT (for switch)
│                             ├── [Pokémon] ──────► ENCOUNTER (new lead)
│                             └── [🔙 Cancel] ────► ENCOUNTER
└── [🏃 Run] ──────────────► ESCAPE ATTEMPT
                              ├── Success ────────► HOME
                              └── Fail ───────────► WILD ATTACKS + ENCOUNTER


BATTLE SCREEN (Wild/Trainer)
├── [⚔️ Fight] ────────────► MOVE SELECT
│                             ├── [Move 1-4] ─────► EXECUTE TURN
│                             │                     └── Battle continues or ends
│                             └── [🔙 Back] ──────► BATTLE
├── [🎒 Bag] ──────────────► BATTLE ITEMS
│                             ├── [Poké Ball] ────► CATCH (wild only)
│                             ├── [Potion] ───────► USE ON PARTY MEMBER
│                             └── [🔙 Back] ──────► BATTLE
├── [🔄 Pokémon] ──────────► PARTY SELECT
│                             ├── [Pokémon] ──────► SWITCH (costs turn)
│                             └── [🔙 Cancel] ────► BATTLE
└── [🏃 Run] ──────────────► ESCAPE (wild only) / FORFEIT (trainer)
```

### Screen Data Requirements

| Screen | Required Data | Queries | Cache Strategy |
|--------|---------------|---------|----------------|
| HOME | trainer, lead Pokémon, money, dex count | 1 | Refresh on mutation |
| EXPLORE | location, encounter types, lead HP | 0 | Use cached trainer |
| ENCOUNTER | wild Pokémon, lead, Poké Ball count | 1 | Duration of encounter |
| BATTLE | full battle state, moves with PP | 1 | Refresh after turn |
| PARTY | party[0-5] summary | 1 | Party array |
| POKEMON DETAIL | full Pokémon stats, moves, item | 1 | Pokémon object |
| BAG | inventory by category | 1 | Inventory object |
| POKEDEX | paginated entries | 1 | Page (expire on catch) |

### Home Screen Layout

```
┌─────────────────────────────────────────────┐
│  🏠 [TRAINER NAME]'s HOMESTEAD              │
│                                             │
│  Lead: 🔥 Charizard (Lv. 36)                │
│  HP: ██████████████████ 98/98               │
│                                             │
│  💰 1,250 PokéDollars                       │
│  📊 Pokédex: 47/151                         │
│                                             │
│  [🚶 Explore] [📋 Party] [💊 Heal]          │
│  [🎒 Bag] [📖 Pokédex]                      │
└─────────────────────────────────────────────┘
```

### Encounter Screen Layout

```
┌─────────────────────────────────────────────┐
│  ⚡ WILD ENCOUNTER!                         │
│                                             │
│  A wild Pidgey appeared!                    │
│  Pidgey (Lv. 3)                             │
│  HP: ██████████████████ 15/15               │
│                                             │
│  Your Pokémon:                              │
│  🔥 Charmander (Lv. 5)                      │
│  HP: ████████████████░░ 18/20               │
│                                             │
│  [⚔️ Fight] [🎒 Bag] [🔄 Switch] [🏃 Run]   │
└─────────────────────────────────────────────┘
```

### Battle Move Select Layout

```
┌─────────────────────────────────────────────┐
│  ⚔️ CHOOSE A MOVE                           │
│                                             │
│  🔥 Charmander's Moves:                     │
│                                             │
│  [Scratch]     [Growl]                      │
│  Normal · 40   Normal · —                   │
│  PP: 35/35     PP: 40/40                    │
│                                             │
│  [Ember]       [—]                          │
│  Fire · 40     —                            │
│  PP: 25/25                                  │
│                                             │
│  [🔙 Back]                                  │
└─────────────────────────────────────────────┘
```

---

## 7. Core Gameplay Loop

### Primary Loop (Every Session)

```
┌─────────────────────────────────────────┐
│              PRIMARY LOOP                │
├─────────────────────────────────────────┤
│                                         │
│   Open Homestead                        │
│        ↓                                │
│   [🚶 Explore]                          │
│        ↓                                │
│   [👟 Walk] (may trigger encounter)     │
│        ↓                                │
│   ┌─ Encounter? ─┐                      │
│   │              │                      │
│   ▼ YES          ▼ NO                   │
│   Battle/Catch   Keep walking           │
│        ↓              ↓                 │
│   Rewards        Loop back              │
│        ↓                                │
│   Return home                           │
│        ↓                                │
│   [💊 Heal] if needed                   │
│        ↓                                │
│   REPEAT                                │
│                                         │
└─────────────────────────────────────────┘
```

### Encounter Rate

Each [Walk] action has:

| Outcome | Probability | Result |
|---------|-------------|--------|
| **Encounter** | 60% | Wild Pokémon appears |
| **Nothing** | 30% | "Nothing found..." |
| **Item** | 10% | Found a Berry, etc. |

**Why 60%?** High enough to feel rewarding, low enough to create tension.

### Session Timing Analysis

**QUICK SESSION (2-3 minutes) — "Coffee Break"**
```
0:00  Open homestead
0:05  Click [Explore]
0:10  Click [Walk]
0:12  Encounter! Wild Pidgey
0:15  Click [Fight] → Select move
0:20  Battle turn resolves
0:25  Click [Fight] → Pidgey faints
0:30  Victory! XP gained
0:35  Click [Walk] again
0:40  "Nothing found" (RNG)
0:45  Click [Walk]
0:50  Encounter! Wild Rattata
1:00  Throw Poké Ball → Caught!
1:10  Return home
1:15  Check party (optional)
1:30  Close Discord

RESULT: 1 battle, 1 catch, ~2 minutes
```

**MEDIUM SESSION (10-15 minutes) — "Lunch Break"**
- 4-6 encounters
- 2-3 catches
- 1 heal cycle
- Maybe 1 evolution
- Check Pokédex progress

**LONG SESSION (30+ minutes) — "Evening Play"**
- 10-15 encounters
- 5-8 catches
- Multiple heal cycles
- Party reorganization
- Work toward specific Pokédex goal
- PvP battles with friends

### What Makes It Fun

| Element | Implementation | Feeling |
|---------|----------------|---------|
| **Discovery** | Random encounters, new Pokémon | Wonder |
| **Collection** | Pokédex progress, rare finds | Accomplishment |
| **Progression** | Leveling, evolution, stronger team | Mastery |
| **Risk/Reward** | Low HP = danger, but more catches | Tension |
| **Quick Sessions** | 2-3 encounters in 5 minutes | Accessibility |

---

## 8. Engagement Systems

### Daily Loop

```
┌─────────────────────────────────────────┐
│              DAILY LOOP                  │
├─────────────────────────────────────────┤
│                                         │
│   Login                                 │
│        ↓                                │
│   [Daily Reward] (streak bonus)         │
│        ↓                                │
│   Check Pokemon (HP, happiness?)        │
│        ↓                                │
│   Do activities (walk, battle)          │
│        ↓                                │
│   Make progress (Pokedex, levels)       │
│        ↓                                │
│   Log off                               │
│                                         │
└─────────────────────────────────────────┘
```

### Hook 1: Daily Rewards (Variable Ratio Reinforcement)

**Why It Works:**
Slot machines use variable rewards because unpredictability is more engaging than predictable rewards. We ADD a streak to create loss aversion — missing a day "costs" your streak.

```
┌─────────────────────────────────────────────────────────────┐
│  🎁 DAILY REWARD — Day 7 Streak! 🔥                         │
│                                                              │
│  Today's Reward:                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  💰 500 PokéDollars                                  │    │
│  │  🔮 3x Great Balls                                   │    │
│  │  ⭐ STREAK BONUS: 1x Rare Candy!                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Come back tomorrow for Day 8!                               │
│  (Streak resets if you miss a day)                          │
│                                                              │
│  [✅ Claim!]                                                 │
└─────────────────────────────────────────────────────────────┘
```

**Streak Rewards:**
| Day | Reward |
|-----|--------|
| 1 | 100 PokéDollars |
| 2 | 200 PokéDollars |
| 3 | 300 PokéDollars + 1 Poké Ball |
| 4 | 400 PokéDollars + 2 Poké Balls |
| 5 | 500 PokéDollars + 3 Great Balls |
| 6 | 600 PokéDollars + Ether |
| 7 | 700 PokéDollars + **Rare Candy** ← MILESTONE |

### Hook 2: Pokédex Progress (Goal Gradient Effect)

**Why It Works:**
People accelerate toward goals. "3 more to complete Kanto" is more motivating than "You have 148 Pokémon."

```
┌─────────────────────────────────────────────────────────────┐
│  📖 POKÉDEX PROGRESS                                        │
│                                                              │
│  Kanto: ████████████████████████████░░░ 148/151 (98%)       │
│                                                              │
│  🔥 SO CLOSE! Just 3 more to complete Kanto!                │
│                                                              │
│  Missing:                                                    │
│  • #144 Articuno (Legendary — Special Event)                │
│  • #145 Zapdos (Legendary — Special Event)                  │
│  • #146 Moltres (Legendary — Special Event)                 │
│                                                              │
│  💡 Hint: Legendary birds appear during special events!     │
└─────────────────────────────────────────────────────────────┘
```

### Hook 3: Evolution Anticipation (Near-Miss Effect)

**Why It Works:**
Being CLOSE to something creates anticipation. "10 more XP" is exciting. The player imagines the payoff.

```
┌─────────────────────────────────────────────────────────────┐
│  ⚔️ VICTORY!                                                │
│                                                              │
│  Charmander gained 45 XP!                                   │
│                                                              │
│  ✨ ALMOST THERE! ✨                                        │
│  Charmander needs just 12 more XP to evolve!                │
│                                                              │
│  [Continue]                                                  │
└─────────────────────────────────────────────────────────────┘
```

### Hook 4: Rare Encounters (Dopamine Spikes)

**Why It Works:**
Unexpected rare rewards create massive dopamine spikes. The POSSIBILITY of rare encounters makes every Walk exciting.

**Rarity Tiers:**
| Tier | Probability | Visual Treatment |
|------|-------------|------------------|
| Common | 60% | Normal embed |
| Uncommon | 25% | Blue border |
| Rare | 12% | Purple border + sparkle emoji |
| Ultra Rare | 2.9% | Gold border + animation |
| **Shiny** | 0.1% | Rainbow + special fanfare |

**Shiny Encounter:**
```
┌─────────────────────────────────────────────────────────────┐
│  ⭐✨🌟 INCREDIBLE! 🌟✨⭐                                  │
│                                                              │
│  A SHINY PONYTA appeared!                                   │
│                                                              │
│  [SHINY SPRITE with sparkle effect]                         │
│                                                              │
│  This is extremely rare! (1 in 1000)                        │
│  Other trainers will be jealous!                            │
│                                                              │
│  [⚔️ FIGHT!] [🔮 THROW ULTRA BALL!]                        │
└─────────────────────────────────────────────────────────────┘
```

### Hook 5: Social Comparison (Opt-In Leaderboards)

**Why It Works:**
Seeing others' progress creates motivation (and FOMO). But we must be careful — too competitive can feel toxic.

**Design:** Opt-in leaderboards, focus on COLLECTION not combat:

```
┌─────────────────────────────────────────────────────────────┐
│  🏆 SERVER POKÉDEX LEADERBOARD                              │
│                                                              │
│  1. 🥇 DragonMaster42 — 412 caught                          │
│  2. 🥈 PikachuFan99 — 389 caught                            │
│  3. 🥉 ShinyHunter — 356 caught                             │
│  ...                                                         │
│  47. You — 148 caught (+3 today!)                           │
│                                                              │
│  💡 Catch 5 more to pass GymLeaderBob!                      │
└─────────────────────────────────────────────────────────────┘
```

### Retention Hooks Summary

| Hook | Psychology Principle | Priority |
|------|---------------------|----------|
| **Daily Rewards** | Variable ratio + loss aversion | 🔴 HIGH |
| **Pokédex Progress** | Goal gradient effect | 🔴 HIGH |
| **Evolution Near-Miss** | Near-miss effect | 🟡 MEDIUM |
| **Rare Encounters** | Dopamine spikes | 🟡 MEDIUM |
| **Leaderboards** | Social comparison | 🟢 LOW (future) |
| **Trading** | Social reciprocity | 🟢 LOW (future) |
| **PvP Battles** | Competition | 🟢 LOW (future) |

---

## 📎 Related Documents

- [01-system-overview.md](01-system-overview.md) — Technical architecture
- [09-game-engine.md](09-game-engine.md) — Battle engine and mechanics
- [10-discord-bot.md](10-discord-bot.md) — Discord.js integration
- [18-private-channel-architecture.md](18-private-channel-architecture.md) — Homestead channel system
- [22-starter-selection-flow.md](22-starter-selection-flow.md) — Starter selection implementation

---

## 📝 Changelog

| Date | Revision | Change |
|------|----------|--------|
| 2025-12-24 | 1.0 | Initial creation from Design Meeting #1 |
| 2025-12-24 | 2.0 | Panel review expansion — added button ID conventions, state machine, psychological hooks, session timing, complete navigation map, screen data requirements, encounter rates, rarity tiers |
| 2025-12-24 | 2.1 | Ported to V1 as section 23 |

---

## 👥 Contributors

**Design Panel (Meeting #7):**
- 🎮 **MAYA** — Pokémon Game Designer
- 📱 **ALEX** — Discord UX Specialist
- 🧠 **DR. CHEN** — Player Psychology Expert
- 🏗️ **JORDAN** — Systems Architect

---

*This document is the source of truth for game design decisions in Pokémon Infinity Gauntlet.*
