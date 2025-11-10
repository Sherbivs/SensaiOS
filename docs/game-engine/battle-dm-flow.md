# Battle DM Turn Flow

The battle DM experience now drives every turn through ephemeral component menus so both trainers can submit their next action without leaving the conversation. This flow is intentionally lightweight while the full arena automation matures and mirrors the public Discord UX we target for Render deployments.

## Turn Prompts

When a battle enters the `Active` state we DM both participants a "Your Move" embed with **Move**, **Switch**, and **Forfeit** buttons. Selecting **Move** now opens a follow-up select menu that lists the active Pokémon's legal moves, including PP callouts when available. The trainer chooses an option and the handler immediately queues that move in the turn manager. The ephemeral prompt updates to confirm the choice and waits for the opponent if they have not acted yet.

Choosing **Switch** works the same way: a select menu lists only healthy, non-active party members. Picking a target queues the swap with the battle engine API, updates cached battle state, and confirms the pending switch.

## Turn Resolution

Both move and switch submissions land in the turn queue managed by `src/core/battle/turn-manager.ts`. Once each trainer has a pending action the queue resolves the turn, swaps active combatants when required, and immediately sends the next "Your Move" DM to both players. This ensures that ongoing battles keep moving without manual pinging in the arena thread.

Failures to deliver DMs are still treated as best-effort and logged for future observability work; the handler will not block turn resolution if the Discord API rejects delivery.
