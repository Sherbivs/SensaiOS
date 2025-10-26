import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import type { PrismaClient } from "@prisma/client";
import { log } from "../../shared/log.js";

type BasicStats = {
  users?: number | null;
  encountersActive?: number | null;
  battlesActive?: number | null;
  cooldowns?: number | null;
};

type BattleSummary = {
  id: string;
  endedAt: Date | null;
  winnerDiscordId: string | null;
  loserDiscordId: string | null;
  rewards: { winner: number; loser: number } | null;
  reason: string | null;
  turnCount: number | null;
};

type OpsStatsReport = {
  counts: BasicStats;
  recentBattles: BattleSummary[];
};

type PrismaLike = PrismaClient;

const MAX_RECENT_BATTLES = 5;

async function getPrismaSafe(): Promise<PrismaLike | null> {
  try {
    // Dynamic import to avoid hard dependency if prisma/client isn't installed/configured
    const mod = await import("@prisma/client");
    const PrismaClient = (mod as any).PrismaClient;
    if (!PrismaClient) return null;
    const prisma = new PrismaClient();
    return prisma as PrismaLike;
  } catch (err) {
    log.debug("Prisma unavailable, running in no-DB mode", { err });
    return null;
  }
}

export type OpsCommandDeps = {
  prismaFactory?: () => Promise<PrismaLike | null>;
};

async function acquirePrisma(deps: OpsCommandDeps) {
  const factory = deps.prismaFactory ?? getPrismaSafe;
  const prisma = await factory();
  const shouldRelease = !deps.prismaFactory;
  const release = async () => {
    if (shouldRelease && prisma) {
      try {
        await prisma.$disconnect?.();
      } catch {}
    }
  };
  return { prisma, release } as const;
}

export function isAdmin(interaction: ChatInputCommandInteraction): boolean {
  try {
    // 1) Guild permission bit: Administrator
    const member = interaction.member as GuildMember | null;
    if (member && member.permissions?.has?.("Administrator" as any)) return true;

    // 2) Fallback: ADMIN_USER_IDS comma-separated env var
    const allowList = (process.env.ADMIN_USER_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (allowList.length && allowList.includes(interaction.user.id)) return true;
  } catch {}
  return false;
}

async function resetCooldownsForDiscordId(discordId: string, deps: OpsCommandDeps): Promise<number | null> {
  const { prisma, release } = await acquirePrisma(deps);
  if (!prisma) return null;
  try {
    const user = await prisma.user.findUnique({ where: { discordId } });
    if (!user) return 0;
    const res = await prisma.cooldown.deleteMany({ where: { ownerId: user.id } });
    return res.count ?? 0;
  } catch (err) {
    log.warn("Cooldown reset failed", { err });
    return null;
  } finally {
    await release();
  }
}

function coerceNumber(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBattleResult(raw: unknown) {
  if (!raw) return null;
  let data = raw;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (typeof data !== "object" || data === null) return null;
  const obj = data as any;
  const winnerDiscordId = typeof obj?.winner?.discordId === "string"
    ? obj.winner.discordId
    : typeof obj?.winnerDiscordId === "string"
    ? obj.winnerDiscordId
    : null;
  const loserDiscordId = typeof obj?.loser?.discordId === "string"
    ? obj.loser.discordId
    : typeof obj?.loserDiscordId === "string"
    ? obj.loserDiscordId
    : null;
  const reason = typeof obj?.reason === "string" ? obj.reason : null;
  const turnCount = coerceNumber(obj?.turnCount);
  const rewardWinner = coerceNumber(obj?.rewards?.winner);
  const rewardLoser = coerceNumber(obj?.rewards?.loser);
  const rewards =
    rewardWinner !== null && rewardLoser !== null
      ? { winner: rewardWinner, loser: rewardLoser }
      : null;

  return { winnerDiscordId, loserDiscordId, rewards, reason, turnCount };
}

async function collectOpsStatsFromPrisma(prisma: PrismaLike): Promise<OpsStatsReport> {
  const [users, encountersActive, battlesActive, cooldowns, recent] = await Promise.all([
    prisma.user.count(),
    prisma.encounter.count({ where: { state: { in: ["Spawned", "Idle"] } } }),
    prisma.battle.count({ where: { state: { in: ["Pending", "Active"] } } }),
    prisma.cooldown.count(),
    prisma.battle.findMany({
      where: { state: "Finished" },
      orderBy: { endedAt: "desc" },
      take: MAX_RECENT_BATTLES,
      select: {
        id: true,
        endedAt: true,
        resultJson: true,
      },
    }),
  ]);

  const recentBattles: BattleSummary[] = recent.map((row) => {
    const parsed = parseBattleResult(row.resultJson);
    return {
      id: row.id,
      endedAt: row.endedAt ?? null,
      winnerDiscordId: parsed?.winnerDiscordId ?? null,
      loserDiscordId: parsed?.loserDiscordId ?? null,
      rewards: parsed?.rewards ?? null,
      reason: parsed?.reason ?? null,
      turnCount: parsed?.turnCount ?? null,
    };
  });

  return {
    counts: { users, encountersActive, battlesActive, cooldowns },
    recentBattles,
  };
}

function formatBattleSummary(summary: BattleSummary) {
  const timestamp = summary.endedAt ? summary.endedAt.toISOString() : "time unknown";
  const winner = summary.winnerDiscordId ? `<@${summary.winnerDiscordId}>` : "winner n/a";
  const loser = summary.loserDiscordId ? `<@${summary.loserDiscordId}>` : "loser n/a";
  const reason = summary.reason ?? "result n/a";
  const turnText = summary.turnCount !== null && summary.turnCount !== undefined
    ? `${summary.turnCount} turn${summary.turnCount === 1 ? "" : "s"}`
    : "turns n/a";
  const rewardText = summary.rewards
    ? `+${summary.rewards.winner}/+${summary.rewards.loser}`
    : "rewards n/a";
  return `- ${timestamp} • ${summary.id} • ${winner} over ${loser} (${reason}, ${turnText}) • rewards ${rewardText}`;
}

function formatOpsStatsReport(report: OpsStatsReport | null): string {
  const counts = report?.counts ?? {};
  const n = (value: number | null | undefined) => (value === null || value === undefined ? "n/a" : String(value));
  const lines = [
    `Users: ${n(counts.users)}`,
    `Active Encounters: ${n(counts.encountersActive)}`,
    `Pending/Active Battles: ${n(counts.battlesActive)}`,
    `Cooldown rows: ${n(counts.cooldowns)}`,
    "",
    "Recent Battles:",
  ];

  if (!report) {
    lines.push("- unavailable (database not configured).");
  } else if (!report.recentBattles.length) {
    lines.push("- none recorded yet.");
  } else {
    lines.push(...report.recentBattles.map(formatBattleSummary));
  }

  return lines.join("\n");
}

export async function handleOpsCommand(
  interaction: ChatInputCommandInteraction,
  deps: OpsCommandDeps = {}
) {
  if (!isAdmin(interaction)) {
    await interaction.reply({ content: "Admin only.", ephemeral: true });
    return;
  }

  const sub = interaction.options?.getSubcommand?.(false);
  const group = (interaction.options as any)?.getSubcommandGroup?.(false);

  if (group === "cooldown" && sub === "reset") {
    const user = interaction.options.getUser("user", true);
    await interaction.deferReply({ ephemeral: true });
    const count = await resetCooldownsForDiscordId(user.id, deps);
    if (count === null) {
      await interaction.editReply(
        `Cooldown reset simulated for <@${user.id}> (no DB configured).`
      );
    } else {
      await interaction.editReply(
        `Deleted ${count} cooldown entr${count === 1 ? "y" : "ies"} for <@${user.id}>.`
      );
    }
    return;
  }

  if (sub === "stats") {
    await interaction.deferReply({ ephemeral: true });
    const { prisma, release } = await acquirePrisma(deps);
    if (!prisma) {
      const message = formatOpsStatsReport(null);
      await interaction.editReply({ content: message });
      return;
    }

    try {
      const report = await collectOpsStatsFromPrisma(prisma);
      const message = formatOpsStatsReport(report);
      await interaction.editReply({ content: message });
    } catch (err) {
      log.warn("Stats query failed", { err });
      await interaction.editReply({ content: "Failed to load stats (check logs)." });
    } finally {
      await release();
    }
    return;
  }

  await interaction.reply({ content: "Unknown /ops command.", ephemeral: true });
}
