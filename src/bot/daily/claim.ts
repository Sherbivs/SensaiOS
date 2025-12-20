import { ChatInputCommandInteraction, TimestampStyles, time } from "discord.js";
import { log } from "../../shared/logger.js";

import { prisma as prismaClient, recordDailyQuestCompletion } from "../../models/index.js";
import { replySuccess, replyInfo, replyError } from "../shared/response-helpers.js";
import { claimDailyQuestReward } from "../../services/cache/recipes.js";
import { errorTracker } from '../../services/monitoring/index.js';
import { ensureError } from "../../shared/utils/error-utils.js";

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

      await replySuccess(interaction, `Daily quest claimed! You received **${result.rewardCoins}** coins. ${streakLine} ${balanceLine} Next quest available ${nextStamp}.`);
      return;
    }

    await replyInfo(interaction, `Daily quest already claimed. Try again ${nextStamp}.`);
  } catch (err) {
    log('error', "[daily] Failed to process daily claim", { error: err });
    
    // Track error with context
    await errorTracker.captureError(ensureError(err), {
      category: 'DISCORD',
      userId: interaction.user.id,
      guildId: interaction.guildId || undefined,
      commandName: 'daily claim',
      operation: 'claimDailyQuestReward',
    });
    
    await replyError(interaction, "Daily quest claim failed. Please try again later.").catch(() => undefined);
  }
}

