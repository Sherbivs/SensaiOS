export type BattlePhase =
  | "PREPARE"
  | "TURN_START"
  | "SELECT_ACTIONS"
  | "RESOLVE_ACTIONS"
  | "APPLY_STATUS"
  | "TURN_END"
  | "BATTLE_END";

export const BATTLE_PHASES: readonly BattlePhase[] = Object.freeze([
  "PREPARE",
  "TURN_START",
  "SELECT_ACTIONS",
  "RESOLVE_ACTIONS",
  "APPLY_STATUS",
  "TURN_END",
  "BATTLE_END",
]);

export function isBattlePhase(value: string): value is BattlePhase {
  return (BATTLE_PHASES as readonly string[]).includes(value);
}

export function assertBattlePhase(value: string): asserts value is BattlePhase {
  if (!isBattlePhase(value)) {
    throw new Error(`Unknown battle phase: ${value}`);
  }
}
