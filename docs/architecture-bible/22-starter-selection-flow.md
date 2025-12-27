# Section 22: Starter Selection & Onboarding Flow

**Last Updated**: 2025-12-27 | **Status**: ✅ Implemented (2025-12-XX)

**Location:** `src/bot/homestead/open-starter-selection.ts`, `src/core/starter-validation.ts`

---

## Overview

Pokémon Infinite Gauntlet uses an **open starter selection** system where players can choose almost any Pokémon as their starter (with some restrictions). This differs from traditional games that offer only 3 regional starters.

## Starter Selection Rules

### Allowed ✅
- Any regular Pokémon not in the forbidden categories
- Earlier evolutions of pseudo-legendaries (Pupitar, Dratini, etc.)
- Baby Pokémon (Riolu, Happiny, etc.)
- Common Pokémon (Pikachu, Eevee, Growlithe, etc.)

### Forbidden ❌
| Category | Examples | Reason |
|----------|----------|--------|
| Regional Starters | Bulbasaur, Charmander, Squirtle, etc. | Preserve traditional starter uniqueness |
| Legendary | Mewtwo, Articuno, Rayquaza, etc. | Too powerful for starters |
| Mythical | Mew, Celebi, Arceus, etc. | Event-exclusive, too rare |
| Pseudo-Legendary Finals | Dragonite, Tyranitar, Garchomp, etc. | Overpowered final forms |

## Flow Diagram

```mermaid
flowchart TD

    %% ENTRY %%

    A[Player DMs bot / uses /start] --> B{Does player<br/>already have a starter?}

    B -- Yes --> M[Show DM Home / Main Menu]
    B -- No --> C[Send Welcome + Starter Rules<br/>Prompt for Pokémon name]

    %% STARTER SELECTION LOOP %%

    C --> D[Player enters desired Pokémon name]

    D --> E{Is Pokémon<br/>a valid species?}
    E -- No --> E1[Error: Unknown Pokémon<br/>Ask again] --> C

    E -- Yes --> F{Is Pokémon a starter,<br/>legendary, mythical,<br/>or pseudo-legendary final?}

    F -- Yes --> F1[Error: This Pokémon can't<br/>be used as a starter<br/>Ask again] --> C

    F -- No --> G[Create starter record<br/>user_id, species, level,<br/>moveset, timestamps]

    G --> H[Confirm starter choice<br/>e.g. You chose Pikachu!]

    H --> I[Explain rules & how to play<br/>short tutorial in DM]

    I --> M[Show DM Home / Main Menu]

    %% MAIN MENU STATE %%

    M --> M1[Player chooses menu option<br/>Heal / Party / Storage / Inventory / Pokedex / Settings]
    M1 --> M   %% After handling any action, return to main menu
```

## Implementation Details

### Files & Modules

| File | Purpose |
|------|---------|
| `src/core/starter-validation.ts` | Validation logic, forbidden lists, helper functions |
| `src/bot/homestead/open-starter-selection.ts` | Message flow, embeds, collector logic |
| `src/bot/homestead/home.ts` | Main menu, party/box views |
| `src/bot/homestead/heal.ts` | Pokémon Center healing |

### Validation Pipeline

```typescript
// 1. Normalize input
const input = message.content.trim().toLowerCase();

// 2. Look up species
const species = getPokemon(input);
if (!species) → "Unknown Pokémon" error

// 3. Check forbidden categories
if (isRegionalStarter(species.id)) → "Regional starter" error
if (isLegendary(species.id)) → "Legendary" error
if (isMythical(species.id)) → "Mythical" error
if (isPseudoLegendaryFinal(species.id)) → "Pseudo-legendary final" error

// 4. Create starter
const pokemon = await createOpenStarter(userId, species.id);
```

### Message Templates

#### Welcome Embed
- Title: "🎮 Welcome to Pokémon Infinite Gauntlet!"
- Description: Explains the open starter system
- Fields: Rules, Examples, Instructions
- Footer: Timeout warning

#### Error Embed
- Title: "❌ Invalid Selection"
- Description: Specific reason (unknown, legendary, etc.)
- Color: Red (#FF5252)

#### Confirmation Embed
- Title: "🎉 You chose {Pokémon}!"
- Thumbnail: Official artwork sprite
- Fields: Stats, Next steps

#### Rules Embed
- Title: "📖 How to Play"
- Fields: Homestead features, Field channels, Battles

### Main Menu Buttons

```
Row 1: [🏥 Pokémon Center] [🎒 Party] [📦 Storage]
Row 2: [🎒 Inventory] [📘 Pokédex] [⚙️ Settings]
```

## Database Schema

### User Flow State

The starter selection doesn't persist state between messages — it uses a `MessageCollector` that listens for 5 minutes. If the user times out, they can restart with `/start`.

### Created Records

When a starter is successfully selected:

1. **User** — Ensured via `ensureUser(discordId)`
2. **PokemonInstance** — Created with:
   - Level 5
   - Perfect IVs (31 all)
   - Zero EVs
   - Basic moves (Tackle, Growl)
   - Not shiny
3. **Party** — Created if doesn't exist
4. **PartySlot** — Pokemon assigned to slot 1

## Error Messages

| Rejection Reason | User-Facing Message |
|-----------------|---------------------|
| `unknown_pokemon` | "That doesn't match any known Pokémon. Try again with a valid name." |
| `regional_starter` | "Regional starters can't be used as your Infinite Gauntlet starter. Choose a different Pokémon!" |
| `legendary` | "Legendary Pokémon can't be used as starters. Choose a regular Pokémon to begin your journey!" |
| `mythical` | "Mythical Pokémon can't be used as starters. Choose a regular Pokémon to begin your journey!" |
| `pseudo_legendary_final` | "Pseudo-legendary final evolutions (like Tyranitar or Dragonite) can't be chosen as starters. You can choose their earlier forms like Pupitar or Dratini instead!" |

## Testing

### Unit Tests
- `tests/core/starter-validation.spec.ts` — Validation logic
- `tests/bot/homestead/open-starter-selection.spec.ts` — Flow logic

### Manual Testing
1. DM bot or use `/start` in guild
2. Try invalid names → Should show error
3. Try "Mewtwo" → Should reject (legendary)
4. Try "Charmander" → Should reject (regional starter)
5. Try "Pikachu" → Should succeed
6. Try again → Should show "already has starter"

## Future Enhancements

- [ ] Starter learnset based on species (not just Tackle/Growl)
- [ ] Shiny chance during starter selection (1/4096)
- [ ] Hidden ability chance
- [ ] Regional form selection for applicable species
- [ ] Nickname prompt after selection

---

*Last Updated: December 2025*
