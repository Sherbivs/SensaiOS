import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import type { Pool } from "pg";
import type { BusStatus } from "../../types/db-models.js";

import {
  collectCacheMetrics,
  runCacheMaintenanceNow,
  startCacheMaintenanceScheduler,
} from "../../services/cache/facade.js";
import type {
  CacheMetricsSnapshot,
  CacheNamespaceMetricsSnapshot,
} from "../../services/cache/facade.js";
import { cache } from "../../shared/cache/memory.js";
import { config } from "../../shared/config.js";
import { log } from "../../shared/log.js";
import { getProdDb } from "../../shared/pg-connection.js";

// Query modules
import { getUserBasic, countUsers } from "../../shared/models/user-queries-pg.js";
import { countAllEncountersByState } from "../../shared/models/encounter-queries-pg.js";
import { 
  countBattlesByState, 
  countFinishedBattles, 
  findRecentFinishedBattles,
  findLastProcessedBusMessage,
  type BattleHistoryRow 
} from "../../shared/models/battle-queries-pg.js";
import { countAllCooldowns, deleteUserCooldowns } from "../../shared/models/cooldown-queries-pg.js";
import { countMessagesByStatus } from "../../shared/models/bus-queries-pg.js";

// Import state persistence modules (optional - bot/state may be in JS)
let stateModules: any = null;
async function getStateModules() {
  if (stateModules) return stateModules;
  try {
    const [persistence, stats, timeline, context] = await Promise.all([
      import("../state/persistence.js"),
      import("../state/stats.js"),
      import("../state/timeline.js"),
      import("../state/context.js"),
    ]);
    stateModules = { persistence, stats, timeline, context };
    return stateModules;
  } catch (err) {
    log.debug("State persistence modules not available", { err });
    return null;
  }
}

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
  dbStatus: "connected" | "unavailable";
  busPending: number | null;
  busLastProcessedIso: string | null;
};

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

export type OpsCommandDeps = {
  poolFactory?: () => Pool;
};

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
  } catch {
    // Permission lookup failed; default to non-admin.
  }
  return false;
}

async function resetCooldownsForDiscordId(discordId: string, deps: OpsCommandDeps): Promise<number | null> {
  try {
    const pool = deps.poolFactory ? deps.poolFactory() : getProdDb();
    const user = await getUserBasic(discordId, pool);
    if (!user) return 0;
    const count = await deleteUserCooldowns(user.id, pool);
    return count;
  } catch (err) {
    log.warn("Cooldown reset failed", { err });
    return null;
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

async function collectOpsStatsFromDb(pool: Pool, window: StatsWindow): Promise<OpsStatsReport> {
  const filters = {
    after: window.after ?? undefined,
    participant: window.participant ?? undefined,
    limit: window.limit,
  };

  const [
    users,
    encountersSpawned,
    encountersIdle,
    battlesPending,
    battlesActiveCount,
    cooldowns,
    totalFinishedBattles,
    recent,
    busPending,
    lastProcessed,
  ] = await Promise.all([
    countUsers(pool),
    countAllEncountersByState("Spawned", pool),
    countAllEncountersByState("Idle", pool),
    countBattlesByState("Pending", pool),
    countBattlesByState("Active", pool),
    countAllCooldowns(pool),
    countFinishedBattles(filters, pool),
    findRecentFinishedBattles(filters, pool),
    countMessagesByStatus("pending" as BusStatus, pool),
    findLastProcessedBusMessage(pool),
  ]);

  const encountersActive = encountersSpawned + encountersIdle;
  const battlesActive = battlesPending + battlesActiveCount;

  const recentBattles: BattleSummary[] = recent.map((row: BattleHistoryRow) => {
    const parsed = parseBattleResult(row.resultJson);
    return {
      id: row.id,
      endedAt: row.endedAt ?? null,
      winnerDiscordId: parsed?.winnerDiscordId ?? row.p1DiscordId ?? null,
      loserDiscordId: parsed?.loserDiscordId ?? row.p2DiscordId ?? null,
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
    busLastProcessedAt: lastProcessed ?? null,
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
    `- Status: ${report ? report.prismaStatus : diagnostics.dbStatus}`,
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
      dbStatus: "unavailable",
      busPending: null,
      busLastProcessedIso: cache.get<string>("outbox:last-processed") ?? null,
    };

    try {
      const pool = deps.poolFactory ? deps.poolFactory() : getProdDb();
      const report = await collectOpsStatsFromDb(pool, window);
      diagnostics.dbStatus = report.prismaStatus;
      diagnostics.busPending = report.busPending;
      diagnostics.busLastProcessedIso =
        report.busLastProcessedAt?.toISOString() ?? diagnostics.busLastProcessedIso;
      const message = formatOpsStatsReport(report, diagnostics);
      await interaction.editReply({ content: message });
    } catch (err) {
      log.warn("Stats query failed", { err });
      await interaction.editReply({ content: "Failed to load stats (check logs)." });
    }
    return;
  }

  if (sub === "state") {
    await interaction.deferReply({ ephemeral: true });
    const showTimeline = Boolean(interaction.options?.getBoolean?.("timeline"));
    const showGuilds = Boolean(interaction.options?.getBoolean?.("guilds"));
    
    try {
      const modules = await getStateModules();
      if (!modules) {
        await interaction.editReply({ content: "State persistence not initialized." });
        return;
      }
      
      // Access bot state from main.js (exported via global or passed through)
      const mainModule = await import("../main.js");
      const botState = (mainModule as any).botState || null;
      
      if (!botState) {
        await interaction.editReply({ content: "Bot state not available (may not be initialized yet)." });
        return;
      }
      
      const lines: string[] = [];
      lines.push("🛡️ **Security Bot Operational State**");
      lines.push(`Generated: ${new Date().toISOString()}`);
      lines.push("");
      
      // Cumulative stats
      const summary = modules.stats.getStatsSummary(botState);
      lines.push("**Cumulative Statistics**");
      lines.push(`• Restart #${summary.restartCount}`);
      lines.push(`• Total uptime: ${summary.totalUptime}`);
      lines.push(`• Current uptime: ${summary.currentUptime}`);
      lines.push(`• Time since restart: ${summary.timeSinceRestart}`);
      lines.push(`• Total sweeps: ${summary.sweepCount}`);
      lines.push(`• Total alerts: ${summary.alertCount}`);
      lines.push(`• Permission changes detected: ${summary.permissionChangesDetected}`);
      lines.push(`• Successful reverts: ${summary.permissionChangesReverted}`);
      if (summary.revertFailures > 0) {
        lines.push(`• ⚠️ Failed reverts: ${summary.revertFailures}`);
      }
      lines.push(`• Guilds monitored: ${summary.guildCount}`);
      lines.push("");
      
      // Database status
      lines.push("**Database Status**");
      lines.push(`• DEV: ${summary.databaseStatus.dev}`);
      lines.push(`• PROD: ${summary.databaseStatus.prod}`);
      lines.push("");
      
      // Recent timeline
      if (showTimeline) {
        const events = modules.timeline.getFormattedTimeline(botState, 20);
        lines.push("**Activity Timeline (Recent 20)**");
        lines.push(...events);
        lines.push("");
      } else {
        const recentSummary = modules.timeline.getRecentActivitySummary(botState, 5);
        lines.push("**Recent Activity (Last 5)**");
        lines.push(recentSummary);
        lines.push("");
        lines.push("*Use `/ops state timeline:true` for full timeline*");
        lines.push("");
      }
      
      // Guild monitoring status
      if (showGuilds) {
        const guildStatus = modules.context.getMonitoringStatus(botState);
        lines.push("**Guild Monitoring Status**");
        if (guildStatus.length === 0) {
          lines.push("• No guilds monitored yet");
        } else {
          for (const guild of guildStatus.slice(0, 10)) {
            const status = guild.monitoring ? "✅" : "⏸️";
            const lastSweep = guild.lastSweep 
              ? new Date(guild.lastSweep).toLocaleString()
              : "never";
            const timeoutInfo = (botState.guilds[guild.id]?.memberFetchTimeouts || 0) > 0
              ? ` ⏱️${botState.guilds[guild.id].memberFetchTimeouts}`
              : '';
            lines.push(`${status} ${guild.name} • Sweeps: ${guild.sweepCount} • Last: ${lastSweep}${timeoutInfo}`);
          }
          if (guildStatus.length > 10) {
            lines.push(`... and ${guildStatus.length - 10} more`);
          }
        }
        lines.push("");
        lines.push("*⏱️ = member fetch timeouts encountered*");
        lines.push("");
      } else {
        lines.push("*Use `/ops state guilds:true` for guild details*");
        lines.push("");
      }
      
      // State metadata
      lines.push("**State Persistence Metadata**");
      lines.push(`• Schema version: ${botState.schemaVersion}`);
      lines.push(`• Last saved: ${botState.metadata.lastSaved}`);
      lines.push(`• Process start: ${botState.metadata.processStartTime}`);
      lines.push(`• Hostname: ${botState.metadata.hostname}`);
      lines.push(`• First ever start: ${botState.cumulative.firstStartTime}`);
      
      const message = lines.join("\n");
      if (message.length > 2000) {
        // Discord message limit - split or truncate
        await interaction.editReply({ content: message.substring(0, 1997) + "..." });
      } else {
        await interaction.editReply({ content: message });
      }
    } catch (err) {
      log.warn("State command failed", { err });
      const message = err instanceof Error ? err.message : String(err);
      await interaction.editReply({ content: `State unavailable: ${message}` });
    }
    return;
  }

  await interaction.reply({ content: "Unknown /ops command.", ephemeral: true });
}
