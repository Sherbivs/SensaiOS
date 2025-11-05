# ROUTER
Title: Trainer Profile Embeds
Purpose: Shared embed builders for trainer profile surfaces (Option C hybrid plan).
Owned Globs: src/bot/profile/**
Last Updated (UTC): 2025-11-03T07:45:00Z

Notes:
- `embed.ts` renders trainer profile summaries for the `/profile` slash command using cached Option C data.
- Reuse this builder when adding future profile surfaces (e.g., DM home cards or admin dashboards) to keep messaging aligned.

Key Files:
- embed.ts — Constructs the trainer profile embed with stats, quest state, and customization fields.

Linked Routers:
- src/bot/ROUTER.md — Parent Discord bot router.
- src/commands/ROUTER.md — Slash command handlers consuming the embed.
