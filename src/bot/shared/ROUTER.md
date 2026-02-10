# ROUTER
Title: Bot Shared Utilities
Purpose: Centralized Discord bot utilities for UI components, response helpers, and common patterns.
Owned Globs: src/bot/shared/**
Last Updated (UTC): 2026-02-10T16:40:00Z

## Contents

| File | Purpose | Lines | Sprint |
|------|---------|-------|--------|
| `button-utils.ts` | ButtonBuilder factories, navigation buttons, pagination | ~200 | Pre-existing |
| `embed-builders.ts` | EmbedBuilder factories for all UI views | ~530 | Sprint 1 |
| `embed-colors.ts` | Centralized color constants | ~50 | Pre-existing |
| `response-helpers.ts` | Interaction reply helpers with state handling | ~450 | Sprint 3 |

## Module Overview

### button-utils.ts
Canonical ButtonBuilder utilities:
- `navButton()` - Navigation buttons (home, party, box, profile)
- `primaryButton()` - Primary action buttons
- `paginationRow()` - Page navigation rows
- `starterChoiceButtons()` - Starter selection buttons

### embed-builders.ts (Sprint 1 - Singularity)
Canonical EmbedBuilder factories:
- `errorEmbed()` - Error state embeds
- `successEmbed()` - Success state embeds
- `infoEmbed()` - Informational embeds
- `partyEmbed()` - Party display
- `boxEmbed()` - Box display with pagination
- `profileEmbed()` - Player profile
- `starterSelectEmbed()` - Starter selection
- `battleChallengeEmbed()` - Challenge UI
- `battleStatusEmbed()` - Battle state
- `encounterEmbed()` - Wild encounter
- `healEmbed()` - Heal confirmation

### embed-colors.ts
Named color constants for embed consistency:
- `EMBED_COLORS.SUCCESS` - Green (0x00ff00)
- `EMBED_COLORS.ERROR` - Red (0xff0000)
- `EMBED_COLORS.INFO` - Blue (0x0099ff)
- `EMBED_COLORS.WARNING` - Yellow (0xffff00)
- etc.

### response-helpers.ts (Sprint 3 - Singularity)
Canonical interaction reply helpers:
- `replyError()` - Ephemeral error messages
- `replySuccess()` - Ephemeral success messages
- `replyInfo()` - Ephemeral info messages
- `replyWithEmbed()` - Embed with optional components
- `replyWithEmbeds()` - Multiple embeds
- `editReply()` - Edit deferred reply (text)
- `editReplyWithEmbed()` - Edit deferred reply (embed)
- `followUpEphemeral()` - Ephemeral follow-up
- `safeReply()` - Handles replied/deferred state
- `safeReplyWithEmbed()` - Safe embed reply
- `safeReplyWithPayload()` - Full payload with complex options
- `deferReply()` - Defer for long operations
- `deferAndReply()` - Defer then edit with result

## Dependencies

- `discord.js` - Discord API types and builders
- `../../utils/logger.js` - Logging (optional)

## Usage Pattern

```typescript
import { errorEmbed, successEmbed } from "../shared/embed-builders.js";
import { navButton, paginationRow } from "../shared/button-utils.js";
import { replyError, safeReplyWithEmbed } from "../shared/response-helpers.js";
import { EMBED_COLORS } from "../shared/embed-colors.js";

// Error handling
if (!user) {
  await replyError(interaction, "User not found.");
  return;
}

// Success with embed
const embed = successEmbed("Caught!", `You caught a wild ${pokemon.name}!`);
await safeReplyWithEmbed(interaction, embed, [navButton("home")]);
```

## Singularity Status

| Category | Status | File |
|----------|--------|------|
| ButtonBuilder | ✅ SINGULARITY | button-utils.ts |
| EmbedBuilder | ✅ SINGULARITY | embed-builders.ts |
| Response Patterns | ✅ SINGULARITY | response-helpers.ts |
| Colors | ✅ SINGULARITY | embed-colors.ts |

---
*Part of Singularity Consolidation Initiative (December 2025)*
