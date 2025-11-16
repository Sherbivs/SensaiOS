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
