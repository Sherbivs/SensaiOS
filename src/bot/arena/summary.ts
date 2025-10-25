// Arena summary helpers for compact public messages and detailed DM logs

import type { BattleResultRecord } from "../../models/index.js";

export function buildArenaTurnSummary(log: string[]): string {
  // Keep high-signal lines, trim numbers to keep it compact
  const key = log
    .filter(Boolean)
    .map((l) => String(l))
    .filter((l) => /uses|missed|flinched|fainted|restored|hurt by recoil/i.test(l))
    .map((l) => l.replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim());
  const uniq: string[] = [];
  for (const s of key) if (!uniq.includes(s)) uniq.push(s);
  return uniq.join(" · ");
}

export function buildDMDetailedLog(log: string[]): string {
  return log.filter(Boolean).map((l) => String(l)).join("\n");
}

function describeReason(reason: BattleResultRecord["reason"]) {
  return reason === "forfeit" ? "by forfeit" : "after a decisive battle";
}

function formatTurnCount(turnCount: number) {
  if (turnCount <= 0) return "before the first turn";
  if (turnCount === 1) return "in 1 turn";
  return `in ${turnCount} turns`;
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
