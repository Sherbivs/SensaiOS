// Arena summary helpers for compact public messages and detailed DM logs

import type { BattleResultRecord } from "../../models/index.js";

function describeReason(reason: BattleResultRecord["reason"]) {
  return reason === "forfeit" ? "by forfeit" : "after a decisive battle";
}

function formatTurnCount(turnCount: number) {
  if (turnCount <= 0) return "before the first turn";
  if (turnCount === 1) return "in 1 turn";
  return `in ${turnCount} turns`;
}

/**
 * Build a concise summary of a turn log for the arena thread.
 * Compacts multiple log lines into a single summary string.
 */
export function buildArenaTurnSummary(log: string[]): string {
  return log.join(" | ");
}

/**
 * Build a detailed log message for DM delivery.
 * Preserves full log detail with line breaks.
 */
export function buildDMDetailedLog(log: string[]): string {
  return log.join("\n");
}

export function buildBattleResultThreadMessage(summary: BattleResultRecord) {
  const winnerMention = `<@${summary.winner.discordId}>`;
  const loserMention = `<@${summary.loser.discordId}>`;
  const reasonText = describeReason(summary.reason);
  const turnText = formatTurnCount(summary.turnCount);
  return `🏆 Battle ${summary.battleId} concluded ${reasonText}: ${winnerMention} defeats ${loserMention} ${turnText}. Rewards → Winner +${summary.rewards.winner} coins, Loser +${summary.rewards.loser} coins.`;
}

export function buildBattleResultDMMessages(summary: BattleResultRecord) {
  const winnerMention = `<@${summary.winner.discordId}>`;
  const loserMention = `<@${summary.loser.discordId}>`;
  const reasonText = describeReason(summary.reason);
  const turnText = formatTurnCount(summary.turnCount);
  return {
    winner: `Victory! You won battle ${summary.battleId} ${reasonText} ${turnText}. You earned +${summary.rewards.winner} coins. ${loserMention} receives +${summary.rewards.loser} coins as consolation.`,
    loser: `Battle ${summary.battleId} ended ${reasonText}. ${winnerMention} claims victory ${turnText}. You still receive +${summary.rewards.loser} coins while they earn +${summary.rewards.winner}.`,
  };
}
