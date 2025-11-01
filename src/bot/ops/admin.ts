import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import type { PrismaClient } from "@prisma/client";
import { log } from "../../shared/log.js";
import { config } from "../../shared/config.js";
import { cache } from "../../shared/cache/memory.js";
import { ensurePrisma, prisma } from "../../shared/prisma.js";
import {
  collectCacheMetrics,
  runCacheMaintenanceNow,
  startCacheMaintenanceScheduler,
} from "../../services/cache/facade.js";
import type {
  CacheMetricsSnapshot,
  CacheNamespaceMetricsSnapshot,
} from "../../services/cache/facade.js";

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

type StatsWindow = {
  limit: number;
  after: Date | null;
  participant: string | null;
};

type OpsStatsReport = {
  counts: BasicStats;
  totalFinishedBattles: number;
  recentBattles: BattleSummary[];
  window: StatsWindow;
  busPending: number;
  busLastProcessedAt: Date | null;
  prismaStatus: "connected";
};

type OpsDiagnostics = {
  nodeVersion: string;
  serviceName: string;
  environment: string;
  databaseHost: string | null;
  cacheSize: number;
  cacheTtlMs: number;
  prismaStatus: "connected" | "unavailable";
  busPending: number | null;
  busLastProcessedIso: string | null;
};

type PrismaLike = PrismaClient;

const DEFAULT_RECENT_LIMIT = 5;
const MAX_RECENT_LIMIT = 20;
const DISCORD_ID_PATTERN = /^<@!?(\d+)>$/;

function normalizeParticipant(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const mention = trimmed.match(DISCORD_ID_PATTERN);
  if (mention) {
    return mention[1];
  }
  if (/^\d{5,}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function getDatabaseHost(): string | null {
  if (!config.databaseUrl) {
    return null;
  }

  try {
    return new URL(config.databaseUrl).host;
  } catch {
    return null;
  }
}

async function getPrismaSafe(): Promise<PrismaLike | null> {
  try {
    await ensurePrisma();
    return prisma;
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
  const shouldRelease = Boolean(deps.prismaFactory);
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

async function collectOpsStatsFromPrisma(prisma: PrismaLike, window: StatsWindow): Promise<OpsStatsReport> {
  const finishedWhere: Record<string, unknown> = { state: "Finished" };
  if (window.after) {
    finishedWhere.endedAt = { gt: window.after };
  }
  if (window.participant) {
    finishedWhere.OR = [
      { p1: { discordId: window.participant } },
      { p2: { discordId: window.participant } },
    ];
  }

  const [
    users,
    encountersActive,
    battlesActive,
    cooldowns,
    totalFinishedBattles,
    recent,
    busPending,
    lastProcessed,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.encounter.count({ where: { state: { in: ["Spawned", "Idle"] } } }),
    prisma.battle.count({ where: { state: { in: ["Pending", "Active"] } } }),
    prisma.cooldown.count(),
    prisma.battle.count({ where: finishedWhere }),
    prisma.battle.findMany({
      where: finishedWhere,
      orderBy: { endedAt: "desc" },
      take: window.limit,
      select: {
        id: true,
        endedAt: true,
        resultJson: true,
        p1: { select: { discordId: true } },
        p2: { select: { discordId: true } },
      },
    }),
    prisma.busMessage.count({ where: { status: "pending" } }),
    prisma.busMessage.findFirst({
      where: { status: { in: ["done", "error"] }, processedAt: { not: null } },
      orderBy: { processedAt: "desc" },
      select: { processedAt: true },
    }),
  ]);

  const recentBattles: BattleSummary[] = recent.map((row) => {
    const parsed = parseBattleResult(row.resultJson);
    return {
      id: row.id,
      endedAt: row.endedAt ?? null,
      winnerDiscordId: parsed?.winnerDiscordId ?? row.p1?.discordId ?? null,
      loserDiscordId: parsed?.loserDiscordId ?? row.p2?.discordId ?? null,
      rewards: parsed?.rewards ?? null,
      reason: parsed?.reason ?? null,
      turnCount: parsed?.turnCount ?? null,
    };
  });

  return {
    counts: { users, encountersActive, battlesActive, cooldowns },
    totalFinishedBattles,
    recentBattles,
    window,
    busPending,
    busLastProcessedAt: lastProcessed?.processedAt ?? null,
    prismaStatus: "connected",
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

function formatBytesShort(bytes: number): string {
  if (!Number.isFinite(bytes)) return "n/a";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let value = Math.abs(bytes);
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
  const prefix = bytes < 0 ? "-" : "";
  return `${prefix}${rounded} ${units[unitIndex]}`;
}

function formatDurationShort(duration: number | null): string {
  if (!Number.isFinite(duration) || duration === null) return "n/a";
  const ms = Math.max(0, duration);
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) {
    const seconds = ms / 1_000;
    return `${seconds >= 10 ? seconds.toFixed(0) : seconds.toFixed(1)}s`;
  }
  if (ms < 3_600_000) {
    const minutes = ms / 60_000;
    return `${minutes >= 10 ? minutes.toFixed(0) : minutes.toFixed(1)}m`;
  }
  if (ms < 86_400_000) {
    const hours = ms / 3_600_000;
    return `${hours >= 10 ? hours.toFixed(0) : hours.toFixed(1)}h`;
  }
  const days = ms / 86_400_000;
  return `${days >= 10 ? days.toFixed(0) : days.toFixed(1)}d`;
}

function describeInstant(iso: string | null): string {
  if (!iso) return "n/a";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.valueOf())) {
    return iso;
  }
  const diff = Date.now() - parsed.getTime();
  const absolute = Math.abs(diff);
  const direction = diff >= 0 ? "ago" : "from now";
  if (absolute < 1_000) return `${iso} (just now)`;
  if (absolute < 60_000) {
    return `${iso} (${Math.round(absolute / 1_000)}s ${direction})`;
  }
  if (absolute < 3_600_000) {
    return `${iso} (${Math.round(absolute / 60_000)}m ${direction})`;
  }
  if (absolute < 86_400_000) {
    return `${iso} (${Math.round(absolute / 3_600_000)}h ${direction})`;
  }
  return `${iso} (${Math.round(absolute / 86_400_000)}d ${direction})`;
}

function formatNamespaceMetricsLine(ns: CacheNamespaceMetricsSnapshot): string {
  const sections = [
    `mem/disk hits ${ns.memoryHits}/${ns.diskHits}`,
    `misses ${ns.misses}`,
    `hydrations ${ns.hydrations}`,
    `files ${ns.diskEntries} (${formatBytesShort(ns.diskBytes)})`,
  ];
  if (ns.inflightWaits) sections.push(`waits ${ns.inflightWaits}`);
  if (ns.touches) sections.push(`touches ${ns.touches}`);
  if (ns.evictions) sections.push(`evictions ${ns.evictions}`);
  if (ns.diskPrunes || ns.diskCleanups) {
    sections.push(`prune ${ns.diskPrunes}/${ns.diskCleanups}`);
  }
  if (ns.lastWriteIso) {
    sections.push(`last write ${describeInstant(ns.lastWriteIso)}`);
  }
  if (ns.lastCleanupIso) {
    sections.push(`cleanup ${describeInstant(ns.lastCleanupIso)}`);
  }
  return `- ${ns.namespace} • ${sections.join(" | ")}`;
}

function formatCacheReport(snapshot: CacheMetricsSnapshot, cleanupRan: boolean): string {
  const lines: string[] = [];
  lines.push(cleanupRan ? "Cache metrics snapshot (cleanup triggered)." : "Cache metrics snapshot.");
  lines.push(`Generated at: ${snapshot.generatedAtIso}`);
  lines.push("");
  lines.push("Memory:");
  lines.push(`- Items: ${snapshot.memory.items}/${snapshot.memory.maxItems}`);
  lines.push(`- Bytes: ${formatBytesShort(snapshot.memory.bytes)} of ${formatBytesShort(snapshot.memory.maxBytes)}`);
  lines.push("");
  lines.push("Disk:");
  lines.push(`- Entries: ${snapshot.disk.entries}`);
  lines.push(`- Size: ${formatBytesShort(snapshot.disk.bytes)}`);
  lines.push(
    `- Budget: ${formatBytesShort(snapshot.disk.maxAllowedBytes)} (approx free ${formatBytesShort(
      snapshot.disk.approxFreeBytes,
    )})`,
  );
  lines.push(`- Root: ${snapshot.disk.rootDir}`);
  lines.push(`- Oldest entry: ${describeInstant(snapshot.disk.oldestEntryIso)}`);
  lines.push(`- Newest entry: ${describeInstant(snapshot.disk.newestEntryIso)}`);
  lines.push("");
  lines.push("Maintenance:");
  lines.push(`- Runs: ${snapshot.maintenance.runs}`);
  lines.push(`- Trigger: ${snapshot.maintenance.origin ?? "snapshot"}`);
  lines.push(
    `- Last run: ${snapshot.maintenance.lastRunIso ? describeInstant(snapshot.maintenance.lastRunIso) : "never"}`,
  );
  lines.push(`- Duration: ${formatDurationShort(snapshot.maintenance.lastDurationMs)}`);
  lines.push(`- Pending: ${snapshot.maintenance.pending ? "yes" : "no"}`);
  if (snapshot.maintenance.lastError) {
    lines.push(`- Last error: ${snapshot.maintenance.lastError.message}`);
  }

  if (!snapshot.namespaces.length) {
    lines.push("");
    lines.push("Namespaces:");
    lines.push("- none yet.");
  } else {
    const limit = Math.min(snapshot.namespaces.length, 10);
    lines.push("");
    lines.push(
      `Namespaces (top ${limit}${snapshot.namespaces.length > limit ? ` of ${snapshot.namespaces.length}` : ""}):`,
    );
    for (const ns of snapshot.namespaces.slice(0, limit)) {
      lines.push(formatNamespaceMetricsLine(ns));
    }
  }

  return lines.join("\n");
}

function formatOpsStatsReport(
  report: OpsStatsReport | null,
  diagnostics: OpsDiagnostics,
  windowOverride?: StatsWindow,
): string {
  const counts = report?.counts ?? {};
  const n = (value: number | null | undefined) => (value === null || value === undefined ? "n/a" : String(value));
  const window = report?.window ?? windowOverride ?? { limit: DEFAULT_RECENT_LIMIT, after: null, participant: null };
  const limitText = window.limit ? String(window.limit) : "n/a";
  const afterText = window.after ? window.after.toISOString() : "none";
  const participantText = window.participant ? `<@${window.participant}>` : "all";
  const totalFinished = report?.totalFinishedBattles ?? null;
  const shown = report?.recentBattles?.length ?? 0;
  const busPending = report?.busPending ?? diagnostics.busPending;
  const busLastProcessedIso =
    report?.busLastProcessedAt?.toISOString() ?? diagnostics.busLastProcessedIso;

  const lines = [
    "Runtime:",
    `- Service: ${diagnostics.serviceName}`,
    `- Environment: ${diagnostics.environment}`,
    `- Node: ${diagnostics.nodeVersion}`,
    "",
    "Database:",
    `- Host: ${diagnostics.databaseHost ?? "unknown"}`,
    `- Prisma: ${report ? report.prismaStatus : diagnostics.prismaStatus}`,
    "",
    "Cache:",
    "- Backend: memory",
    `- Default TTL: ${diagnostics.cacheTtlMs}ms`,
    `- Entries: ${diagnostics.cacheSize}`,
    "",
    "Event Bus:",
    `- Pending: ${n(busPending)}`,
    `- Last processed: ${busLastProcessedIso ?? "never"}`,
    "",
    "Game Stats:",
    `Users: ${n(counts.users)}`,
    `Active Encounters: ${n(counts.encountersActive)}`,
    `Pending/Active Battles: ${n(counts.battlesActive)}`,
    `Cooldown rows: ${n(counts.cooldowns)}`,
    `Finished Battles: total ${n(totalFinished)} | showing ${shown}/${limitText} | after ${afterText} | participant ${participantText}`,
    "",
    "Recent Battles:",
  ];

  if (!report) {
    lines.push("- unavailable (database not configured).");
  } else if (!report.recentBattles.length) {
    if (window.participant) {
      const scope = window.after ? " in the selected window." : ".";
      lines.push(`- none recorded for <@${window.participant}>${scope}`);
    } else {
      lines.push(window.after ? "- none recorded in the selected window." : "- none recorded yet.");
    }
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

  if (sub === "cache") {
    await interaction.deferReply({ ephemeral: true });
    const cleanupRequested = Boolean(interaction.options?.getBoolean?.("cleanup"));
    startCacheMaintenanceScheduler();
    try {
      if (cleanupRequested) {
        await runCacheMaintenanceNow("manual");
      }
      const snapshot = await collectCacheMetrics({
        maintenanceReason: cleanupRequested ? "manual" : "snapshot",
      });
      const report = formatCacheReport(snapshot, cleanupRequested);
      await interaction.editReply({ content: report });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await interaction.editReply({ content: `Cache metrics unavailable: ${message}` });
    }
    return;
  }

  if (sub === "stats") {
    await interaction.deferReply({ ephemeral: true });
    const rawLimit = interaction.options?.getInteger?.("limit") ?? null;
    if (rawLimit !== null && (rawLimit < 1 || rawLimit > MAX_RECENT_LIMIT)) {
      await interaction.editReply({ content: `Limit must be between 1 and ${MAX_RECENT_LIMIT}.` });
      return;
    }

    const limit = rawLimit ?? DEFAULT_RECENT_LIMIT;
    const afterRaw = interaction.options?.getString?.("after") ?? null;
    let after: Date | null = null;
    if (afterRaw) {
      const parsed = new Date(afterRaw);
      if (Number.isNaN(parsed.getTime())) {
        await interaction.editReply({ content: "Invalid 'after' timestamp. Use ISO 8601, e.g. 2025-10-26T00:00:00Z." });
        return;
      }
      after = parsed;
    }

    const participantRaw = interaction.options?.getString?.("participant") ?? null;
    const participant = normalizeParticipant(participantRaw);
    if (participantRaw && !participant) {
      await interaction.editReply({
        content: "Invalid 'participant' value. Provide a Discord ID or mention, e.g. 123456789012345678 or <@123456789012345678>.",
      });
      return;
    }

    const window: StatsWindow = { limit, after, participant };
    const diagnostics: OpsDiagnostics = {
      nodeVersion: process.version,
      serviceName: config.serviceName,
      environment: config.nodeEnv,
      databaseHost: getDatabaseHost(),
      cacheSize: cache.size,
      cacheTtlMs: config.cacheTtlMs,
      prismaStatus: "unavailable",
      busPending: null,
      busLastProcessedIso: cache.get<string>("outbox:last-processed") ?? null,
    };
    const { prisma, release } = await acquirePrisma(deps);

    try {
      if (!prisma) {
        const message = formatOpsStatsReport(null, diagnostics, window);
        await interaction.editReply({ content: message });
        return;
      }

      const report = await collectOpsStatsFromPrisma(prisma, window);
      diagnostics.prismaStatus = report.prismaStatus;
      diagnostics.busPending = report.busPending;
      diagnostics.busLastProcessedIso =
        report.busLastProcessedAt?.toISOString() ?? diagnostics.busLastProcessedIso;
      const message = formatOpsStatsReport(report, diagnostics);
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
