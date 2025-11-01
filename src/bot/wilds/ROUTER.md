# ROUTER
Title: Wild Encounter Controls
Purpose: Handles walk/encounter flows, catch prompts, and encounter state transitions.
Owned Globs: src/bot/wilds/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- Walk handlers roll encounter odds, spawn wild encounters, and surface DM messaging to the trainer.
- Control handlers manage encounter buttons (catch, run) and coordinate state changes in the encounter engine.
- Keep messaging synced with `src/core/encounter/**` so encounter results remain deterministic between layers.

Key Files:
- walk.ts — Walk command implementation triggering encounter rolls and DM updates.
- controls.ts — Button handlers for catch/run actions and catch result messaging.

Linked Routers:
- src/bot/ROUTER.md — Discord domain overview.
- src/core/encounter/ROUTER.md — Encounter engine powering the walk/catch logic.
- src/models/ROUTER.md — Data access for encounter persistence and rewards.
