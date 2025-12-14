// Arena summary helpers for compact public messages and detailed DM logs
function describeReason(reason) {
    return reason === "forfeit" ? "by forfeit" : "after a decisive battle";
}
function formatTurnCount(turnCount) {
    if (turnCount <= 0)
        return "before the first turn";
    if (turnCount === 1)
        return "in 1 turn";
    return `in ${turnCount} turns`;
}
export function buildBattleResultThreadMessage(summary) {
    const winnerMention = `<@${summary.winner.discordId}>`;
    const loserMention = `<@${summary.loser.discordId}>`;
    const reasonText = describeReason(summary.reason);
    const turnText = formatTurnCount(summary.turnCount);
    return `🏆 Battle ${summary.battleId} concluded ${reasonText}: ${winnerMention} defeats ${loserMention} ${turnText}. Rewards → Winner +${summary.rewards.winner} coins, Loser +${summary.rewards.loser} coins.`;
}
export function buildBattleResultDMMessages(summary) {
    const winnerMention = `<@${summary.winner.discordId}>`;
    const loserMention = `<@${summary.loser.discordId}>`;
    const reasonText = describeReason(summary.reason);
    const turnText = formatTurnCount(summary.turnCount);
    return {
        winner: `Victory! You won battle ${summary.battleId} ${reasonText} ${turnText}. You earned +${summary.rewards.winner} coins. ${loserMention} receives +${summary.rewards.loser} coins as consolation.`,
        loser: `Battle ${summary.battleId} ended ${reasonText}. ${winnerMention} claims victory ${turnText}. You still receive +${summary.rewards.loser} coins while they earn +${summary.rewards.winner}.`,
    };
}
