import { ChatInputCommandInteraction, TimestampStyles, time } from "discord.js";
import { prisma as prismaClient, recordDailyQuestCompletion } from "../../models/index.js";

type PrismaLike = typeof prismaClient;

const DAILY_REWARD_COINS = 100;
const DAILY_COOLDOWN_KIND = "daily-quest";
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STARTER_COINS = 500;

type HandleDailyClaimOptions = {
  prisma?: PrismaLike;
  rewardCoins?: number;
  now?: Date;
  recordCompletion?: typeof recordDailyQuestCompletion;
};

async function ensureTrainer(prisma: PrismaLike, discordId: string) {
  const existing = await prisma.user.findUnique({ where: { discordId }, select: { id: true, coins: true } });
  if (existing) {
    return existing;
  }

  return prisma.user.create({
    data: { discordId, coins: DEFAULT_STARTER_COINS },
    select: { id: true, coins: true },
  });
}

function formatRetryMessage(readyAt: Date) {
  const stamp = time(readyAt, TimestampStyles.RelativeTime);
  return `Daily quest already claimed. Try again ${stamp}.`;
}

type CooldownRecord = { id: string; readyAt: Date } | null;

async function getCooldown(prisma: PrismaLike, userId: string): Promise<CooldownRecord> {
  return prisma.cooldown.findFirst({
    where: { ownerId: userId, kind: DAILY_COOLDOWN_KIND },
    select: { id: true, readyAt: true },
  });
}

async function saveCooldown(prisma: PrismaLike, userId: string, cooldown: CooldownRecord, readyAt: Date) {
  if (cooldown) {
    await prisma.cooldown.update({ where: { id: cooldown.id }, data: { readyAt } });
    return;
  }

  await prisma.cooldown.create({ data: { ownerId: userId, kind: DAILY_COOLDOWN_KIND, readyAt } });
}

export async function handleDailyClaim(
  interaction: ChatInputCommandInteraction,
  options: HandleDailyClaimOptions = {}
) {
  const prisma = options.prisma ?? prismaClient;
  const rewardCoins = typeof options.rewardCoins === "number" && options.rewardCoins > 0 ? options.rewardCoins : DAILY_REWARD_COINS;
  const now = options.now instanceof Date ? options.now : new Date();
  const recordCompletion = options.recordCompletion ?? recordDailyQuestCompletion;

  try {
    const trainer = await ensureTrainer(prisma, interaction.user.id);
    const cooldown = await getCooldown(prisma, trainer.id);

    if (cooldown?.readyAt && cooldown.readyAt.getTime() > now.getTime()) {
      await interaction.reply({ content: formatRetryMessage(cooldown.readyAt), ephemeral: true });
      return;
    }

    const nextReadyAt = new Date(now.getTime() + DAILY_COOLDOWN_MS);

    const streakState = await recordCompletion({ userId: trainer.id, prisma, completedAt: now });
    const updated = await prisma.user.update({
      where: { id: trainer.id },
      data: { coins: { increment: rewardCoins } },
      select: { coins: true },
    });

    await saveCooldown(prisma, trainer.id, cooldown, nextReadyAt);

    const streakLine = streakState?.streak != null ? `Streak: **${streakState.streak}** day${streakState.streak === 1 ? "" : "s"}.` : "Streak updated.";
    const balanceLine = updated?.coins != null ? `New balance: **${updated.coins}** coins.` : "Balance updated.";
    const nextStamp = time(nextReadyAt, TimestampStyles.RelativeTime);

    await interaction.reply({
      ephemeral: true,
      content: `Daily quest claimed! You received **${rewardCoins}** coins. ${streakLine} ${balanceLine} Next quest available ${nextStamp}.`,
    });
  } catch (err) {
    console.error("[daily] Failed to process daily claim:", err);
    await interaction.reply({ content: "Daily quest claim failed. Please try again later.", ephemeral: true }).catch(() => undefined);
  }
}