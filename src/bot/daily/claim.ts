import { ChatInputCommandInteraction, TimestampStyles, time } from "discord.js";
import { log } from '../../utils/logger.js';

import { prisma as prismaClient, recordDailyQuestCompletion } from "../../models/index.js";
import { claimDailyQuestReward } from "../../services/cache/recipes.js";

type PrismaLike = typeof prismaClient;

type HandleDailyClaimOptions = {
  prisma?: PrismaLike;
  rewardCoins?: number;
  now?: Date;
  recordCompletion?: typeof recordDailyQuestCompletion;
};

export async function handleDailyClaim(
  interaction: ChatInputCommandInteraction,
  options: HandleDailyClaimOptions = {}
) {
  const prisma = options.prisma ?? prismaClient;
  const rewardCoins = typeof options.rewardCoins === "number" && options.rewardCoins > 0 ? options.rewardCoins : 100;
  const now = options.now instanceof Date ? options.now : new Date();
  const recordCompletion = options.recordCompletion ?? recordDailyQuestCompletion;

  try {
    const result = await claimDailyQuestReward({
      discordId: interaction.user.id,
      prisma,
      rewardCoins,
      now,
      recordCompletion,
    });

    const readyAt = new Date(result.readyAt);
    const nextStamp = time(readyAt, TimestampStyles.RelativeTime);

    if (result.kind === "awarded") {
      const streak = result.streak;
      const streakLine = streak?.streak != null ? `Streak: **${streak.streak}** day${streak.streak === 1 ? "" : "s"}.` : "Streak updated.";
      const balanceLine = `New balance: **${result.balance}** coins.`;

      await interaction.reply({
        ephemeral: true,
        content: `Daily quest claimed! You received **${result.rewardCoins}** coins. ${streakLine} ${balanceLine} Next quest available ${nextStamp}.`,
      });
      return;
    }

    await interaction.reply({
      content: `Daily quest already claimed. Try again ${nextStamp}.`,
      ephemeral: true,
    });
  } catch (err) {
    log.error("[daily] Failed to process daily claim:", err);
    await interaction.reply({ content: "Daily quest claim failed. Please try again later.", ephemeral: true }).catch(() => undefined);
  }
}