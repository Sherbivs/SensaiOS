# ROUTER
Title: Battle Engine Core
Purpose: Deterministic battle calculations, damage formulas, and turn management consumed by bot flows.
Owned Globs: src/core/battle/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- Turn manager queues player actions, applies move effects, and coordinates switch handling for both players.
- Damage and status modules encapsulate battle math; keep RULESET.md in sync when updating formulas.
- Exported helpers are pure and reused by Discord surfaces, workers, and PBSL validation suites.

Key Files:
- engine.ts — Main battle engine entry that resolves queued actions.
- turn-manager.ts — Queues actions, validates move eligibility, and advances turns.
- damage.ts — Damage formula utilities aligned with game balance rules.
- status.ts — Status effect application and resolution helpers.
- index.ts — Barrel exports for downstream consumers.

Linked Routers:
- src/core/ROUTER.md — Core engine umbrella.
- src/bot/battle/ROUTER.md — Discord handlers invoking engine functions.
- tests/battle/ROUTER.md — Interaction tests validating the battle UI contract.
