import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { log } from "../../shared/log.js";

type BasicStats = {
  users?: number | null;
  encountersActive?: number | null;
  battlesActive?: number | null;
  cooldowns?: number | null;
};

async function getPrismaSafe(): Promise<any | null> {
  try {
    // Dynamic import to avoid hard dependency if prisma/client isn't installed/configured
    const mod = await import("@prisma/client");
    const PrismaClient = (mod as any).PrismaClient;
    if (!PrismaClient) return null;
    const prisma = new PrismaClient();
    return prisma;
  } catch (err) {
    log.debug("Prisma unavailable, running in no-DB mode", { err });
    return null;
  }
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

async function resetCooldownsForDiscordId(discordId: string): Promise<number | null> {
  const prisma = await getPrismaSafe();
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
    try { await prisma.$disconnect?.(); } catch {}
  }
}

async function getBasicStats(): Promise<BasicStats> {
  const prisma = await getPrismaSafe();
  if (!prisma) return { users: null, encountersActive: null, battlesActive: null, cooldowns: null };
  try {
    const [users, encountersActive, battlesActive, cooldowns] = await Promise.all([
      prisma.user.count(),
      prisma.encounter.count({ where: { state: { in: ["Spawned", "Idle"] } } }),
      prisma.battle.count({ where: { state: { in: ["Pending", "Active"] } } }),
      prisma.cooldown.count(),
    ]);
    return { users, encountersActive, battlesActive, cooldowns };
  } catch (err) {
    log.warn("Stats query failed", { err });
    return { users: null, encountersActive: null, battlesActive: null, cooldowns: null };
  } finally {
    try { await prisma.$disconnect?.(); } catch {}
  }
}

export async function handleOpsCommand(interaction: ChatInputCommandInteraction) {
  if (!isAdmin(interaction)) {
    await interaction.reply({ content: "Admin only.", ephemeral: true });
    return;
  }

  const sub = interaction.options?.getSubcommand?.(false);
  const group = (interaction.options as any)?.getSubcommandGroup?.(false);

  if (group === "cooldown" && sub === "reset") {
    const user = interaction.options.getUser("user", true);
    await interaction.deferReply({ ephemeral: true });
    const count = await resetCooldownsForDiscordId(user.id);
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
    const s = await getBasicStats();
    const n = (v: number | null | undefined) => (v === null || v === undefined ? "n/a" : String(v));
    const lines = [
      `Users: ${n(s.users)}`,
      `Active Encounters: ${n(s.encountersActive)}`,
      `Pending/Active Battles: ${n(s.battlesActive)}`,
      `Cooldown rows: ${n(s.cooldowns)}`,
    ];
    await interaction.editReply({ content: lines.join("\n") });
    return;
  }

  await interaction.reply({ content: "Unknown /ops command.", ephemeral: true });
}
