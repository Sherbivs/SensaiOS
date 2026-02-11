# Phase 1 — Button-First UI Polish

**Priority:** 🟡 HIGH (player experience quality)  
**Effort:** 2–3 days  
**Depends On:** Phase 0 (correctness fixes)  
**Unlocks:** Phase 3 (gameplay depth), Phase 5 (launch readiness)  
**Authority:** Game Design Bible ([Section 23](../../architecture-bible/23-game-design-bible.md))

---

## ⚠️ GOVERNING POLICY: Button-First, No Slash Commands

The **Game Design Bible (Architecture Bible § 23)** is unambiguous:

> | **Button-First** | Gameplay happens through button clicks, not text commands |

> **What We're NOT Building:**
> ❌ A command-line bot ("type `/walk` to explore")
> ❌ A tutorial-heavy experience ("read the rules first")
> ❌ A complex menu system ("go to channel X, then type Y")

> **Slash Commands (Recovery Only) — Section 4:**
> | `/start` | Reload & Heal | Game seems stuck, buttons missing, returning after long break |
> **That's it. One command.**

### What This Means for Development

1. **`/start` is the ONLY player-facing slash command** — it exists for recovery, not gameplay
2. **All gameplay happens through buttons** — Explore, Heal, Party, Bag, Pokédex, etc.
3. **The homestead channel IS the game window** — a persistent message with buttons that transforms as you play
4. **Message update, not message spam** — `interaction.update()` replaces the current embed, never `channel.send()` for new messages
5. **Every screen shows what you can do** — zero memorization required, visual options presented

### Code Enforcement (Already Active)

The dev-only gate in [src/bot/index.ts](../../../src/bot/index.ts#L155-L161) already blocks all slash commands except `/start` for regular players:

```typescript
// DEV-ONLY GATE: Only /start is available to regular players
// All other slash commands require dev/admin privileges
// Per Game Design Bible: Button-first gameplay, minimal slash commands
const isDevCommand = interaction.commandName !== "start";
if (isDevCommand && !isAdmin(interaction)) {
    await replyError(interaction, "🚫 This command is for developers only.\n\n🎮 **Players:** Use `/start` to begin your adventure!");
    return;
}
```

**Other slash commands (`/walk`, `/battle`, `/daily`, `/trade`, `/heal`, `/dex`, `/starter`) are ADMIN/DEV TOOLS ONLY.** They are NOT part of the player experience.

---

## Objective

Polish the button-driven graphical interface so every screen follows the Game Design Bible patterns:
- **Single game window** (one active message per player, updated in-place)
- **Consistent navigation** (every screen has a Back button, layout follows § 6)
- **Context-aware buttons** (disabled when action isn't possible, per § 2 Button States)
- **Seamless transitions** (`interaction.update()` not `channel.send()`)

### The Key Insight

The homestead button system is **already 90% functional** (16 screens working). But there are UI consistency issues that break the "game window" illusion:
- Some screens post **new messages** instead of updating the current one
- Some buttons use `interaction.reply()` instead of `interaction.update()`
- Button disabled states aren't consistently enforced
- The "active message" tracking pattern from the Bible isn't fully implemented

---

## 1.1 — Audit: Message Update vs Message Spam

### Problem

The Game Design Bible § 2 says:

> **CRITICAL:** We update the existing message, not send new ones.
>
> ```typescript
> // ✅ CORRECT: Update the same message
> await interaction.update({ embeds: [newScreenEmbed], components: [newButtonRows] });
>
> // ❌ WRONG: Send a new message  
> await interaction.reply({ embeds: [...], components: [...] });
> ```

Currently, the homestead screens use **mixed patterns:**

| Pattern | Usage | Bible Compliance |
|---------|-------|-----------------|
| `interaction.update()` | home.ts, daily.ts, settings.ts, pokedex.ts, storage.ts | ✅ Correct |
| `channel.send()` | heal.ts, shop.ts, party.ts, bag.ts, explore.ts, storage.ts (open) | ❌ Posts new message |
| `interaction.reply()` | settings.ts (some paths), storage.ts (error paths) | ❌ Posts new message |
| `interaction.editReply()` | leaderboards.ts | ⚠️ Only valid after defer |

### Investigation Steps

1. **Map every button handler** in `src/bot/index.ts` (lines 230-430) to its response pattern
2. **For each `channel.send()` call in homestead modules** — determine if it's:
   - An initial screen open (from `/start` or first button press) — `channel.send()` is OK here
   - A screen transition (button to button) — should be `interaction.update()`
3. **For each `interaction.reply()`** — determine if it should be `interaction.update()` instead
4. **Document the "openXxxScreen" vs "handleXxxButton" distinction:**
   - `openXxxScreen()` = First-time entry from `/start` → `channel.send()` is correct
   - `handleXxxButton()` = Screen-to-screen transition → must use `interaction.update()`

### Implementation Plan

Convert all button-to-button transitions to `interaction.update()`:

```typescript
// Pattern for ALL button handlers (screen transitions)
export async function handleXxxButton(interaction: ButtonInteraction): Promise<void> {
  const data = await loadScreenData(interaction.user.id);
  const embed = buildXxxEmbed(data);
  const buttons = buildXxxButtons(data);
  
  // ✅ Update the SAME message — "game window" stays in place
  await interaction.update({
    embeds: [embed],
    components: [...buttons],
  });
}

// Pattern for INITIAL screen open (from /start or first entry only)
export async function openXxxScreen(
  client: Client, guildId: string, user: DiscordUser
): Promise<void> {
  const manager = new HomesteadChannelManager(client, guildId);
  const { channel } = await manager.getOrCreateChannel(user);
  
  // ✅ channel.send() is OK here — this IS the initial game window creation
  await channel.send({ embeds: [embed], components: [...buttons] });
}
```

### Files to Audit & Fix

| File | `channel.send()` Count | Fix Needed |
|------|------------------------|------------|
| `src/bot/homestead/heal.ts` | 1 (openHealScreen) | Keep for initial open; add `handleHealButton()` using `update()` |
| `src/bot/homestead/shop.ts` | 1 (openShopScreen) | Keep for initial open; ensure category buttons use `update()` |
| `src/bot/homestead/party.ts` | 2 (openPartyScreen + channel.send) | Convert button transitions to `update()` |
| `src/bot/homestead/bag.ts` | 1 (openBagScreen) | Keep for initial open; ensure item buttons use `update()` |
| `src/bot/homestead/explore.ts` | 1 (openExploreScreen) | Keep for initial open; encounter result uses correct pattern |
| `src/bot/homestead/storage.ts` | 2 (openStorageScreen + paginate) | Convert pagination to `update()` |
| `src/bot/homestead/settings.ts` | 2 (openSettingsScreen + fallback) | Convert toggle to `update()` only |
| `src/bot/homestead/pokedex.ts` | 1 (openPokedexScreen) | Keep for initial open; pagination already uses `update()` ✅ |

### Acceptance Criteria

- [ ] Every button-to-button transition uses `interaction.update()`
- [ ] Only initial screen opens (from `/start`) use `channel.send()`
- [ ] No screen transition posts a new message in the channel
- [ ] Player sees ONE message that transforms — the "game window" effect

---

## 1.2 — Active Message Tracking

### Problem

The Game Design Bible § 3 describes an **active message** pattern:

> ```typescript
> interface TrainerGameState {
>   activeMessageId: string; // Current game message with buttons
>   currentScreen: Screen;   // What they're looking at
> }
> ```

When a player has an active game window, new button presses should update **that message**. If the message is deleted, the bot should detect this and post a new one.

### Investigation Steps

1. **Check if `activeMessageId` exists in the Prisma schema** — Does the `User` or `Trainer` model track this?
2. **Check the HomesteadChannelManager** — Does it track the "last active message"?
3. **Determine the current "message lifecycle":**
   - When `/start` is used, is the old active message cleaned up?
   - When buttons are pressed, does the bot verify the message still exists?
   - What happens if a player deletes their game message?

### Implementation Plan

```
Phase 1: Track active message ID
  1. Add activeMessageId field to User/Trainer model (or HomesteadChannel)
  2. When /start posts a new game window → store message ID
  3. When interaction.update() succeeds → message ID unchanged
  4. When interaction.update() fails ("Unknown Message") → post new, store new ID

Phase 2: Cleanup on /start
  1. On /start, check for existing activeMessageId
  2. Try to delete old message (graceful failure OK)
  3. Post fresh game window
  4. Store new message ID

Phase 3: Resurrection on button press
  1. On any button click, if interaction fails with "Unknown Message"
  2. Post new message → store new ID
  3. Reply ephemeral: "Your game window was refreshed!"
```

### Acceptance Criteria

- [ ] Active message ID tracked per player in database
- [ ] `/start` cleans up old game window before posting new one
- [ ] Deleted game messages detected and new one posted automatically
- [ ] Player always has exactly ONE active game message in their homestead

---

## 1.3 — Button Disabled States

### Problem

The Game Design Bible § 2 defines when buttons should be **disabled (greyed out)**:

| Context | Button | Disabled When |
|---------|--------|---------------|
| Battle | [Fight] | All moves have 0 PP |
| Battle | [Run] | Trainer battle (can't flee) |
| Battle | [Switch] | Only 1 Pokémon alive in party |
| Encounter | [Catch] | No Poké Balls in bag |
| Home | [Explore] | All party Pokémon fainted |
| Party | [Set Lead] | Already the lead Pokémon |

### Investigation Steps

1. **For each homestead screen**, check if buttons are dynamically disabled based on game state
2. **Check the button-utils.ts builder** — Does it support `.setDisabled(true)` based on data?
3. **List all buttons that should conditionally disable** vs current implementation
4. **Check encounter screen** — Are catch buttons disabled when out of Poké Balls?

### Implementation Plan

```typescript
// Example: Home screen with contextual button states
function buildActionRow(partyData: PartyData): ActionRowBuilder<ButtonBuilder> {
  const allFainted = partyData.members.every(m => m.currentHp <= 0);
  
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("HOME_EXPLORE")
      .setLabel("🚶 Explore")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(allFainted),  // ← Can't explore with fainted party
    primaryButton("HOME_HEAL", "💊 Heal"),
    primaryButton("HOME_DAILY", "🎁 Daily"),
  );
}
```

### Files to Update

| File | Buttons | Disable Condition |
|------|---------|-------------------|
| `src/bot/homestead/home.ts` | Explore | All party fainted |
| `src/bot/homestead/explore.ts` | Walk/Fish | All party fainted |
| `src/bot/homestead/party.ts` | Set Lead | Already lead |
| `src/bot/wilds/controls.ts` | Catch | No Poké Balls |
| `src/bot/battle/actions.ts` | Fight | All moves 0 PP |
| `src/bot/battle/actions.ts` | Switch | Only 1 alive |
| `src/bot/battle/actions.ts` | Run | Trainer battle |

### Acceptance Criteria

- [ ] All buttons in the Bible § 2 table have disabled states implemented
- [ ] Disabled buttons show greyed-out visual with tooltip explaining why
- [ ] No "error after clicking" scenarios — prevent bad actions BEFORE the click
- [ ] Button state recalculated on every screen render

---

## 1.4 — Navigation Map Completeness Audit

### Problem

The Game Design Bible § 6 defines a **complete navigation map** — every screen, every button, every transition. Need to verify the current implementation matches.

### Bible Navigation Map (§ 6)

```
HOME SCREEN
├── [🚶 Explore]    → EXPLORE SCREEN
├── [📋 Party]      → PARTY SCREEN → [Pokémon] → POKEMON DETAIL
├── [🎒 Bag]        → BAG SCREEN → [Category] → ITEM LIST → [Item] → USE/GIVE
├── [📖 Pokédex]    → POKEDEX SCREEN → [Entry] → POKEDEX DETAIL
├── [💊 Heal]       → HEAL CONFIRMATION → [Heal All] → HOME
├── [🎁 Daily]      → DAILY SCREEN → [Claim] → HOME
├── [🛒 Shop]       → SHOP SCREEN → [Category] → ITEMS → [Buy]
├── [📦 Box/Storage]→ STORAGE SCREEN → [Pokémon] → DETAIL → [To Party]
├── [⚙️ Settings]   → SETTINGS SCREEN → [Toggle] → SETTINGS (updated)
├── [🏆 Achievements] → ACHIEVEMENTS HUB → [Category] → LIST
├── [📊 Leaderboard] → LEADERBOARD HUB → [Category] → RANKINGS
├── [🤝 Trade]      → TRADE SCREEN (if implemented via button)
└── [🎣 Fish]       → FISHING SCREEN (from Explore)

ENCOUNTER SCREEN (from Explore)
├── [⚔️ Fight]    → BATTLE SCREEN
├── [🎒 Bag]      → CATCH ITEMS (Poké Balls only)
├── [🔄 Switch]   → PARTY SELECT
└── [🏃 Run]      → ESCAPE ATTEMPT → HOME or ENCOUNTER

BATTLE SCREEN (Wild/Trainer)
├── [⚔️ Fight]    → MOVE SELECT → [Move 1-4] → EXECUTE TURN
├── [🎒 Bag]      → BATTLE ITEMS
├── [🔄 Pokémon]  → PARTY SELECT → [Switch]
└── [🏃 Run]      → ESCAPE (wild) / FORFEIT (trainer)
```

### Investigation Steps

1. **Walk the button handler switch/case** in `src/bot/index.ts` (lines 230-430)
2. **For each screen in the Bible map**, verify:
   - Button ID exists in the handler
   - Handler calls the correct screen function
   - Screen has a "Back" button to parent
3. **Document gaps** — screens in the Bible but not implemented
4. **Document extras** — screens implemented but not in the Bible

### Expected Gaps to Find

| Bible Screen | Current Status | Gap |
|--------------|---------------|-----|
| HOME → Explore | ✅ HOME_EXPLORE → openExploreScreen | — |
| HOME → Party | ✅ HOME_PARTY → openPartyView | — |
| HOME → Bag | ✅ HOME_BAG → handleShopButton | ⚠️ Routes to Shop? |
| HOME → Pokédex | ✅ HOME_POKEDEX → openPokedexScreen | — |
| HOME → Heal | ✅ HOME_HEAL → openHealScreen | — |
| HOME → Daily | ✅ HOME_DAILY → handleDailyButton | — |
| HOME → Shop | ✅ HOME_SHOP → openShopScreen | — |
| HOME → Storage | ✅ HOME_STORAGE → openStorageScreen | — |
| HOME → Settings | ✅ HOME_SETTINGS → openSettingsScreen | — |
| Encounter → Fight | ✅ via ENCOUNTER_ prefix → handleEncounterButton | — |
| Battle → Move Select | ✅ via MOVE_ prefix → handleBattleActionButton | — |
| POKEMON DETAIL | ? from party slot | Verify depth |
| BAG → USE/GIVE | ? from item selection | Verify item usage flow |

### Acceptance Criteria

- [ ] Every screen in Bible § 6 navigation map has a working button path
- [ ] Every screen has a [🏠 Back] or [🔙 Back] button to its parent
- [ ] No dead-end screens (player can always navigate away)
- [ ] Home screen accessible from every other screen via Back chain

---

## 1.5 — Screen Layout Consistency

### Problem

The Bible defines standard layouts per screen type. Need to verify all screens follow the same visual pattern:

```
┌─────────────────────────────────────────────┐
│  [SCREEN TITLE / HEADER]                    │
│                                             │
│  [Contextual information / game state]      │
│  [Visual elements: HP bars, Pokémon, etc.]  │
│                                             │
│  [Action Button 1] [Action Button 2]        │
│  [Action Button 3] [Action Button 4]        │
└─────────────────────────────────────────────┘
```

### Investigation Steps

1. **Check embed structure** for each screen:
   - Title format consistent? (emoji + name)
   - Color scheme consistent? (EMBED_COLORS usage)
   - Field layout clean? (no walls of text)
2. **Check button rows** per screen:
   - Max 5 buttons per row?
   - Max 5 rows?
   - Primary actions use `ButtonStyle.Primary`?
   - Navigation uses `ButtonStyle.Secondary`?
   - Destructive actions use `ButtonStyle.Danger`?
3. **Check the button-utils.ts helper functions:**
   - `primaryButton()`, `secondaryButton()`, `dangerButton()`, `navButton()` — consistent use?

### Key Layout Rules (Bible § 2)

| Screen | Rows | Buttons |
|--------|------|---------|
| Home | 3 | Nav (Party/Box/Profile) + Action (Explore/Heal/Daily) + Secondary (Bag/Shop/Dex/Settings) |
| Battle | 2 | 5 (Fight, Bag, Switch, Run + Back) |
| Move Select | 2 | 5 (Move×4 + Back) |
| Party | 2 | 7 (Pokémon×6 + Back) |
| Encounter | 1 | 4 (Fight, Bag, Switch, Run) |

### Files to Audit

All 16 homestead modules in `src/bot/homestead/`:
- `home.ts`, `explore.ts`, `heal.ts`, `party.ts`, `storage.ts`
- `bag.ts`, `shop.ts`, `pokedex.ts`, `settings.ts`, `daily.ts`
- `achievements.ts`, `leaderboards.ts`, `trade.ts`, `fish.ts`
- `starters.ts`, `open-starter-selection.ts`

Plus battle/encounter screens:
- `src/bot/battle/actions.ts`, `src/bot/wilds/controls.ts`

### Acceptance Criteria

- [ ] All screens follow the Bible embed + button layout pattern
- [ ] Color coding consistent (EMBED_COLORS enum used everywhere)
- [ ] Button styles follow: Primary = actions, Secondary = navigation, Danger = destructive
- [ ] No screen exceeds Discord's 5×5 button limit
- [ ] HP bars, level display, and stat formatting consistent across screens

---

## 1.6 — Decommission Stub Slash Commands

### Problem

Several slash command files exist that just say "coming soon" or redirect to homestead. Per the Button-First policy, these should either:
- **Be removed entirely** (if the button equivalent works), OR
- **Redirect gracefully** to the homestead channel with a helpful message

### Current Stub Commands

| File | Command | Current Behavior | Action |
|------|---------|-----------------|--------|
| `src/commands/walk.ts` | `/walk` | "Encounter system coming soon!" | Redirect to homestead |
| `src/commands/battle.ts` | `/battle` | "Battle system coming soon!" | Redirect to homestead |
| `src/commands/heal.ts` | `/heal` | "Use your homestead channel" | ✅ Already redirects |
| `src/commands/starter.ts` | `/starter` | "Use /home to access it" | ✅ Already redirects |
| `src/commands/daily.ts` | `/daily` | Check behavior | Redirect or remove |
| `src/commands/trade.ts` | `/trade` | Check behavior | Redirect or remove |
| `src/commands/dex.ts` | `/dex` | Check behavior | Redirect or remove |

### Implementation Plan

**Recommended: Helpful Redirect with Button-First Teaching**

Keep the commands registered but redirect players to the button-first homestead experience:

```typescript
// Standard redirect pattern for all non-/start slash commands
async execute(interaction) {
  await interaction.reply({
    content: '🎮 **This action is available in your homestead channel!**\n\n'
           + '👉 Use `/start` to open your homestead, then click the buttons to play.\n\n'
           + '💡 *Pokémon Infinity Gauntlet is a button-first game — '
           + 'no commands to memorize, just click and play!*',
    ephemeral: true,
  });
}
```

This approach is better than removing commands entirely because:
- Players who try slash commands get a helpful redirect instead of "Unknown command"
- The message teaches the button-first philosophy
- It funnels players into the correct UX pattern

### Acceptance Criteria

- [ ] No slash command returns "coming soon" or "not implemented" messages
- [ ] All gameplay slash commands redirect to homestead with helpful message
- [ ] `/start` remains the ONLY functional player-facing slash command
- [ ] Dev/admin commands (`/ops`, `/battle-turn`) remain functional behind gate
- [ ] The redirect message teaches players the button-first design philosophy

---

## 1.7 — `/start` Recovery Flow Polish

### Problem

`/start` is the **one command players need** (Bible § 4). It must work flawlessly as the recovery mechanism:

1. New player → Welcome → Starter Selection → First Game Window
2. Returning player → Check state → Heal corruption → Show correct screen
3. Stuck player → Clear stuck state → Fresh game window

### Investigation Steps

1. **Read the `/start` handler** in `src/bot/index.ts` (lines 166-175) — What does it currently do?
2. **Check `openStartersHomestead()`** — Does it handle both new and returning players?
3. **Check if state corruption detection exists** — Does `/start` verify party, battles, encounters?
4. **Verify the flow matches Bible § 4:**
   - Step 1: Acknowledgment (ephemeral, <100ms)
   - Step 2: Database check (new vs returning)
   - Step 3A: New player → Welcome → Starter
   - Step 3B: Returning player → Heal issues → Correct screen
   - Step 4: Post message, store active message ID

### Implementation Plan

```
1. Audit current /start handler completeness
2. Add returning player state check:
   - Active battle? → Show battle screen
   - Active encounter? → Show encounter screen  
   - Neither? → Show home screen
3. Add corruption healing:
   - Orphan battle records → Clean up
   - Invalid party state → Fix
   - Missing homestead channel → Create
4. Add active message cleanup:
   - Delete previous game window message
   - Post fresh one
   - Store new message ID
5. Performance target: < 2 seconds for returning players
```

### Acceptance Criteria

- [ ] New players see welcome → starter selection → home screen
- [ ] Returning players see their correct current screen
- [ ] Stuck states (orphan battles, missing channels) auto-heal
- [ ] `/start` is SAFE — never destroys player data
- [ ] Response time < 2 seconds for returning players
- [ ] Active message tracking updated after `/start`

---

## Phase 1 Checklist

| # | Task | Effort | Risk | Key Focus |
|---|------|--------|------|-----------|
| 1.1 | Message update vs spam audit | 4–5 hours | Medium | Fix mixed `channel.send()` / `interaction.update()` patterns |
| 1.2 | Active message tracking | 3–4 hours | Medium | One game window per player — the Bible's core UX contract |
| 1.3 | Button disabled states | 3–4 hours | Low | Bible § 2 defines exact disabled conditions |
| 1.4 | Navigation map completeness | 2–3 hours | Low | Verify all Bible § 6 paths are wired |
| 1.5 | Screen layout consistency | 3–4 hours | Low | Visual polish — embeds, colors, button styles |
| 1.6 | Decommission stub commands | 1–2 hours | Low | Replace "coming soon" with button-first redirects |
| 1.7 | `/start` recovery polish | 3–4 hours | Medium | State detection, corruption healing, message cleanup |

**Total Phase 1 effort:** 2–3 days

### Key Principle

> This phase is about making the **existing button-driven game** feel like a polished graphical interface.
> 
> The gameplay logic works. The buttons are wired. We're making it feel like a **real game window** 
> that players pick up and play — not a bot they issue commands to.

---

## Reference: Game Design Bible Quick Reference

### The 5 Commandments of Button-First Design

1. **Gameplay happens through button clicks** — not text commands
2. **One game window per player** — one message that transforms as you play
3. **`interaction.update()` for transitions** — never `channel.send()` for screen changes
4. **Visual options presented** — player never has to remember or type anything
5. **`/start` is the only recovery tool** — everything else is buttons

### Screen Types (Bible § 6)

```typescript
type Screen = 
  | 'welcome'        // New player - intro
  | 'starter_select' // Choosing first Pokémon
  | 'home'           // Main homestead menu
  | 'explore'        // Walking in wild
  | 'encounter'      // Wild Pokémon appeared
  | 'battle'         // In battle
  | 'battle_moves'   // Selecting a move
  | 'party'          // Viewing party
  | 'party_detail'   // Single Pokémon details
  | 'bag'            // Inventory
  | 'bag_category'   // Items in category
  | 'pokedex'        // Collection
  | 'pokedex_entry'  // Single Pokédex entry
  | 'heal_confirm'   // Heal confirmation
```

### Button Style Rules

| Style | Usage | Discord Visual |
|-------|-------|---------------|
| `ButtonStyle.Primary` | Main actions (Explore, Fight, Heal) | Blue |
| `ButtonStyle.Secondary` | Navigation (Bag, Shop, Settings) | Grey |
| `ButtonStyle.Success` | Positive confirmation (Claim, Confirm) | Green |
| `ButtonStyle.Danger` | Destructive/cancel (Run, Forfeit, Cancel) | Red |

---

*Parent: [ROADMAP-INDEX.md](ROADMAP-INDEX.md) | Prev: [Phase 0 — Quick Wins](PHASE-0-QUICK-WINS.md) | Next: [Phase 2 — GameServer API](PHASE-2-GAMESERVER-API.md)*
