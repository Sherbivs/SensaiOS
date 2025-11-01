# ROUTER
Title: Daily Quest Flow
Purpose: Handles the daily quest claim interaction, streak tracking, and reward messaging.
Owned Globs: src/bot/daily/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- Daily quest command handlers enforce the 24-hour cooldown and surface the next available claim time.
- Reward logic updates the trainer streak, coins, and associated audit notes through Prisma models.
- Messaging utilities integrate with DM and slash command surfaces to keep responses consistent.

Key Files:
- claim.ts — Slash command resolver that validates cooldowns, awards rewards, and formats confirmation responses.

Linked Routers:
- src/bot/ROUTER.md — Discord bot layer overview.
- src/models/ROUTER.md — Prisma models used to persist streaks and rewards.
