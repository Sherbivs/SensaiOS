# RULESET

_Last initialized: 2025-11-01T19:37:16Z (UTC) — Rev: 0.1_

This document defines the game rules and mechanics versioning for the Discord Pokémon fan server bot.

## Scope (MVP)
- Classic core: types, STAB, crits, accuracy, stat stages, major statuses.
- No Z/Max/Tera initially.
- Minimal moveset for early tests (T5.2 acceptance criteria).

## Versioning
- Ruleset versions are tied to code releases.
- Breaking changes must include migration notes and test updates.

## Status & Turn Order (MVP)

- Moves resolve by comparing move priority first, then effective Speed (after status and stage modifiers), and finally a deterministic name tiebreaker (alphabetical by combatant name) when values match.
- Paralysis currently only halves the affected Pokémon's Speed; there is no "fully paralyzed" turn skip yet.
- Flinch flags are applied after damage is dealt and are consumed at the start of the next turn, causing the flinched Pokémon to forfeit that action before order is decided.
- Sleep and freeze are tracked on the status field but do not yet inhibit acting; this will be expanded in later revisions.

## Early Battle Item Pool

- Offensive held items enabled for playtest battles: Choice Band (+50% Attack), Choice Specs (+50% Special Attack), and Life Orb (+30% damage with 10% max HP recoil on hit).
- No other held items are enabled in the MVP ruleset; unspecified items are ignored by the engine.
