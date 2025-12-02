import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import type { Pool } from "pg";
import type { PrismaClient, Prisma } from "@prisma/client";
import type { BusStatus } from "../../types/db-models.js";
import { toEasternString } from "../../shared/datetime.js";
import { formatBytes, formatBytesShort, formatDurationCompact, formatTimestamp } from "../../shared/utils/format-utils.js";
import { getErrorMessage } from "../../shared/utils/error-utils.js";

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
import { getLogBuffer } from "../../shared/logBuffer.js";
import { EventBus } from "../../shared/event-bus.js";
import { getProdDb } from "../../shared/pg-connection.js";
import { 
  measureLogBufferMemory, 
  measureEventBusMemory, 
  measureDiscordCacheMemory,
  getConfidenceEmoji
} from "../../utils/memory-measurement.js";

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

// Engine DB modules (Phase 17-22)
import { engineCache, engineWriteBuffer } from '../../services/cache/index.js';
import * as engineReadDb from '../../services/database/engine-read-db.js';
import * as engineWriteDb from '../../services/database/engine-write-db.js';
import { getEngineWorkersStatus } from "../../workers/engine-workers.js";

// Database worker modules (Task 11)
import {
  getProdPostgresWorker,
  getTimescaleDBWorker,
  getEngineReadWorker,
  getEngineWriteWorker,
} from '../../workers/database/index.js';

// Error Detection modules (Phase 9-12)
import { errorTracker, type ErrorSeverity, type ErrorCategory } from '../../services/monitoring/index.js';

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

// Import security metrics modules (Phase 4 - Security Intelligence)
let securityMetricsModule: any = null;
async function getSecurityMetricsModule() {
  if (securityMetricsModule) return securityMetricsModule;
  try {
    securityMetricsModule = await import("../state/securityMetrics.js");
    return securityMetricsModule;
  } catch (err) {
    log.debug("Security metrics module not available", { err });
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

type PrismaFactory = () => Promise<PrismaClient | null> | PrismaClient | null;

export type OpsCommandDeps = {
  poolFactory?: () => Pool | null;
  prismaFactory?: PrismaFactory;
  disconnectPrisma?: boolean;
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
    if (!pool) return null;
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

function buildFinishedBattlesWhere(filters: { after?: Date; participant?: string | null }): Prisma.BattleWhereInput {
  const where: Prisma.BattleWhereInput = { state: "Finished" };

  if (filters.after) {
    where.endedAt = { gt: filters.after };
  }

  if (filters.participant) {
    where.OR = [
      { p1: { discordId: filters.participant } },
      { p2: { discordId: filters.participant } },
    ];
  }

  return where;
}

function sanitizeRecentLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_RECENT_LIMIT;
  return Math.max(1, Math.min(limit, MAX_RECENT_LIMIT));
}

async function collectOpsStatsFromPrisma(prisma: PrismaClient, window: StatsWindow): Promise<OpsStatsReport> {
  const filters = {
    after: window.after ?? undefined,
    participant: window.participant ?? undefined,
  };
  const finishedWhere = buildFinishedBattlesWhere(filters);
  const recentLimit = sanitizeRecentLimit(window.limit);

  const [
    users,
    encountersSpawned,
    encountersIdle,
    battlesPending,
    battlesActiveCount,
    cooldowns,
    totalFinishedBattles,
    busPending,
    lastProcessed,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.encounter.count({ where: { state: "Spawned" } }),
    prisma.encounter.count({ where: { state: "Idle" } }),
    prisma.battle.count({ where: { state: "Pending" } }),
    prisma.battle.count({ where: { state: "Active" } }),
    prisma.cooldown.count(),
    prisma.battle.count({ where: finishedWhere }),
    prisma.busMessage.count({ where: { status: "pending" } }),
    prisma.busMessage.findFirst({
      where: { status: { in: ["done", "error"] }, processedAt: { not: null } },
      orderBy: { processedAt: "desc" },
      select: { processedAt: true },
    }),
  ]);

  const recent = await prisma.battle.findMany({
    where: finishedWhere,
    orderBy: { endedAt: "desc" },
    take: recentLimit,
    select: {
      id: true,
      endedAt: true,
      resultJson: true,
      p1: { select: { discordId: true } },
      p2: { select: { discordId: true } },
    },
  });

  const recentBattles: BattleSummary[] = recent.map((battle) => {
    const parsed = parseBattleResult(battle.resultJson);
    return {
      id: battle.id,
      endedAt: battle.endedAt ?? null,
      winnerDiscordId: parsed?.winnerDiscordId ?? battle.p1?.discordId ?? null,
      loserDiscordId: parsed?.loserDiscordId ?? battle.p2?.discordId ?? null,
      rewards: parsed?.rewards ?? null,
      reason: parsed?.reason ?? null,
      turnCount: parsed?.turnCount ?? null,
    };
  });

  const encountersActive = encountersSpawned + encountersIdle;
  const battlesActive = battlesPending + battlesActiveCount;

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

async function resolvePrismaFactory(factory: PrismaFactory): Promise<PrismaClient | null> {
  return await Promise.resolve(factory());
}

function formatBattleSummary(summary: BattleSummary) {
  const timestamp = summary.endedAt ? toEasternString(summary.endedAt) : "time unknown";
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


// formatBytesShort now imported from shared/utils/format-utils.js (centralized)

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

  // Runtime memory footprint
  const memory = process.memoryUsage();
  const arrayBuffers = (memory as any).arrayBuffers ?? 0;
  lines.push("");
  lines.push("Runtime Memory:");
  lines.push(`- RSS: ${formatBytesShort(memory.rss)}`);
  lines.push(`- Heap Used/Total: ${formatBytesShort(memory.heapUsed)} / ${formatBytesShort(memory.heapTotal)}`);
  lines.push(`- External: ${formatBytesShort(memory.external)} | ArrayBuffers: ${formatBytesShort(arrayBuffers)}`);
  lines.push(`- Uptime: ${formatDurationShort(process.uptime() * 1000)}`);

  // Log buffer observability
  const logBuffer = getLogBuffer();
  lines.push("");
  lines.push("Log Buffer:");
  if (logBuffer) {
    const bufferStats = logBuffer.getStats();
    lines.push(`- Buffered Entries: ${logBuffer.size()} (max 200)`);
    lines.push(`- Aggregated Messages: ${bufferStats.totalMessages}`);
    lines.push(`- Pending Flush Groups: ${bufferStats.buffered}`);
  } else {
    lines.push("- Disabled (LOG_BUFFER_ENABLED=false)");
  }

  // Event Bus telemetry
  const eventBus = EventBus.getInstance();
  const busStats = eventBus.getStats();
  lines.push("");
  lines.push("Event Bus:");
  lines.push(`- Subscriptions: ${busStats.subscriptionsActive}`);
  lines.push(`- Replay Buffer: ${busStats.replayBufferSize} events`);
  lines.push(`- Events Emitted: ${busStats.eventsEmitted}`);
  lines.push(`- Handler Invocations: ${busStats.totalHandlerInvocations} (failures ${busStats.failedHandlerInvocations})`);
  lines.push(`- Avg Handler Latency: ${busStats.averageHandlerLatency.toFixed(2)} ms`);

  const topSubscribers = eventBus
    .getSubscribers()
    .sort((a, b) => b.queueSize - a.queueSize)
    .slice(0, 3);
  if (topSubscribers.length) {
    lines.push(
      `- Top Queues: ${topSubscribers
        .map((sub) => `${sub.pattern} (${sub.queueSize}/${sub.maxQueueSize}, dropped ${sub.droppedEvents})`)
        .join(" | ")}`,
    );
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
  const afterText = window.after ? toEasternString(window.after) : "none";
  const participantText = window.participant ? `<@${window.participant}>` : "all";
  const totalFinished = report?.totalFinishedBattles ?? null;
  const shown = report?.recentBattles?.length ?? 0;
  const busPending = report?.busPending ?? diagnostics.busPending;
  const busLastProcessedIso =
    report?.busLastProcessedAt ? report.busLastProcessedAt.toISOString() : diagnostics.busLastProcessedIso;

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

// ============================================================================
// ENGINE DB STATS (Phase 17-22)
// ============================================================================

// formatBytes now imported from shared/utils/format-utils.js (centralized)
// formatDuration → formatDurationCompact imported from format-utils.js (centralized)
// formatTimestamp now imported from shared/utils/format-utils.js (centralized)

function formatEngineDbStats(): string {
  const lines: string[] = [];
  
  // Header
  lines.push("**ENGINE DB OPERATIONAL DASHBOARD**");
  lines.push("");
  
  // Engine Ready Status
  const engineInitialized = Boolean(global.engineReady);
  const ready = engineInitialized ? "✅ READY" : "⚠️ NOT READY";
  lines.push(`**Status:** ${ready}`);
  lines.push("");
  
  if (!engineInitialized) {
    lines.push("Engine DB not initialized. Check startup logs for errors.");
    lines.push("");
  } else {
    try {
      // L1 Cache Stats
      const cacheStats = engineCache.getStats();
      const hitRate = cacheStats.hitCount + cacheStats.missCount > 0
        ? ((cacheStats.hitCount / (cacheStats.hitCount + cacheStats.missCount)) * 100).toFixed(1)
        : "0.0";
      
      lines.push("**L1 CACHE**");
      lines.push(`• Hit Rate: ${hitRate}% (${cacheStats.hitCount} hits, ${cacheStats.missCount} misses)`);
      lines.push(`• Memory: ${cacheStats.memorySizeMb.toFixed(1)} MB`);
      lines.push(`• Entries: ${cacheStats.pokemonCount} Pokemon, ${cacheStats.moveCount} Moves, ${cacheStats.typeEffectivenessCount} Type Chart`);
      lines.push(`• Avg Latency: ${cacheStats.avgLatencyUs.toFixed(2)} μs`);
      lines.push(`• Last Refresh: ${formatTimestamp(cacheStats.lastRefreshTime)}`);
      lines.push(`• Status: ${cacheStats.isInitialized ? "initialized" : "not initialized"}`);
      lines.push("");
      
      // Write Buffer Stats
      const bufferStats = engineWriteBuffer.getStats();
      const utilizationPct = (bufferStats.utilizationPercent * 100).toFixed(1);
      const backpressureIcon = bufferStats.isBackpressureActive ? "🔴" : "🟢";
      
      lines.push("**WRITE BUFFER**");
      lines.push(`• Utilization: ${utilizationPct}% ${backpressureIcon}`);
      lines.push(`• Queues: ${bufferStats.battleLogQueueSize} battles, ${bufferStats.moveUsageQueueSize} moves, ${bufferStats.anomalyQueueSize} anomalies`);
      lines.push(`• Total Pending: ${bufferStats.totalQueueSize} entries`);
      lines.push(`• Backpressure: ${bufferStats.isBackpressureActive ? "ACTIVE (rejecting writes)" : "inactive"}`);
      lines.push(`• Flush Count: ${bufferStats.flushCount}`);
      lines.push(`• Last Flush: ${formatTimestamp(bufferStats.lastFlushTime)}`);
      lines.push("");
      
      // Worker Status
      const workerStatus = getEngineWorkersStatus();
      
      lines.push("**WORKERS**");
      lines.push(`• Cache Refresh: ${formatWorkerStatus(workerStatus.cacheRefresh)}`);
      lines.push(`• Buffer Flush: ${formatWorkerStatus(workerStatus.bufferFlush)}`);
      lines.push(`• Read-DB Sync: ${formatWorkerStatus(workerStatus.readDbSync)}`);
      lines.push(`• Write-DB Validator: ${formatWorkerStatus(workerStatus.writeDbValidator)}`);
      lines.push(`• Maintenance: ${formatWorkerStatus(workerStatus.maintenance)}`);
      lines.push("");
      
      // Read-DB Stats
      const readDbStats = engineReadDb.getStats();
      
      lines.push("**READ-DB (SQLite)**");
      lines.push(`• Pokemon: ${readDbStats.pokemonCount}`);
      lines.push(`• Moves: ${readDbStats.moveCount}`);
      lines.push(`• Type Effectiveness: ${readDbStats.typeEffectivenessCount}`);
      lines.push(`• Size: ${formatBytes(readDbStats.sizeBytes)}`);
      lines.push(`• Status: ${readDbStats.isInitialized ? "initialized" : "not initialized"}`);
      lines.push("");
      
      // Write-DB Stats
      const writeDbStats = engineWriteDb.getStats();
      
      lines.push("**WRITE-DB (SQLite)**");
      lines.push(`• Battle Logs: ${writeDbStats.battleLogCount}`);
      lines.push(`• Move Usage: ${writeDbStats.moveUsageCount}`);
      lines.push(`• Anomalies: ${writeDbStats.anomalyCount}`);
      lines.push(`• WAL Entries: ${writeDbStats.walEntryCount}`);
      lines.push(`• Size: ${formatBytes(writeDbStats.sizeBytes)}`);
      lines.push(`• Oldest Entry: ${formatDurationCompact(writeDbStats.oldestEntryAge)}`);
      lines.push(`• Status: ${writeDbStats.isInitialized ? "initialized" : "not initialized"}`);
      lines.push("");
    } catch (error) {
      lines.push(`⚠️ Error collecting stats: ${getErrorMessage(error)}`);
      lines.push("");
    }
  }

  // Runtime memory regardless of engine readiness
  const memory = process.memoryUsage();
  const arrayBuffers = (memory as any).arrayBuffers ?? 0;
  lines.push("**RUNTIME MEMORY**");
  lines.push(`• RSS: ${formatBytes(memory.rss)}`);
  lines.push(`• Heap Used/Total: ${formatBytes(memory.heapUsed)} / ${formatBytes(memory.heapTotal)}`);
  lines.push(`• External: ${formatBytes(memory.external)} | ArrayBuffers: ${formatBytes(arrayBuffers)}`);
  lines.push(`• Uptime: ${formatDurationCompact(process.uptime() * 1000)}`);
  lines.push("");

  // Log buffer telemetry
  lines.push("**LOG BUFFER**");
  const logBuffer = getLogBuffer();
  if (logBuffer) {
    const bufferStats = logBuffer.getStats();
    lines.push(`• Buffered Entries: ${logBuffer.size()} (max 200)`);
    lines.push(`• Aggregated Messages: ${bufferStats.totalMessages}`);
    lines.push(`• Pending Flush Groups: ${bufferStats.buffered}`);
  } else {
    lines.push("• Buffer disabled (LOG_BUFFER_ENABLED=false).");
  }
  lines.push("");

  // Event bus telemetry
  const eventBus = EventBus.getInstance();
  const busStats = eventBus.getStats();
  lines.push("**EVENT BUS**");
  lines.push(`• Subscriptions: ${busStats.subscriptionsActive}`);
  lines.push(`• Replay Buffer: ${busStats.replayBufferSize} events`);
  lines.push(`• Events Emitted: ${busStats.eventsEmitted}`);
  lines.push(`• Handler Invocations: ${busStats.totalHandlerInvocations} (failures ${busStats.failedHandlerInvocations})`);
  lines.push(`• Avg Handler Latency: ${busStats.averageHandlerLatency.toFixed(2)} ms`);
  lines.push(`• Backpressure Drops: ${busStats.backpressureEvents}`);
  const topSubscribers = eventBus
    .getSubscribers()
    .sort((a, b) => b.queueSize - a.queueSize)
    .slice(0, 3);
  if (topSubscribers.length) {
    const summary = topSubscribers
      .map((sub) => `${sub.pattern} (${sub.queueSize}/${sub.maxQueueSize}, dropped ${sub.droppedEvents})`)
      .join(" | ");
    lines.push(`• Top Queues: ${summary}`);
  }
  
  return lines.join("\n");
}

function formatWorkerStatus(worker: { name: string; isRunning: boolean; lastRunTime: Date | null; successCount: number; errorCount: number }): string {
  const statusIcon = worker.isRunning ? "🔄" : "⏸️";
  const errorIcon = worker.errorCount > 0 ? " ⚠️" : "";
  return `${statusIcon} ${worker.successCount} runs, ${worker.errorCount} errors${errorIcon}, last: ${formatTimestamp(worker.lastRunTime)}`;
}

// ============================================================================
// SECURITY METRICS FORMATTERS (Phase 4 - Security Intelligence)
// ============================================================================

/**
 * Format security score dashboard report
 */
function formatSecurityScoreReport(metrics: any): string {
  const lines: string[] = [];
  const { score, trends } = metrics;

  lines.push("🛡️ **Security Score Dashboard**");
  lines.push(`Generated: ${toEasternString(new Date())}`);
  lines.push("");

  // Overall Score
  const gradeEmoji = score.grade === 'A+' ? '🟢' : score.grade === 'B+' ? '🟡' : score.grade === 'C+' ? '🟠' : '🔴';
  lines.push(`**Overall Security Score: ${score.overall}/100 ${gradeEmoji}**`);
  lines.push(`**Grade: ${score.grade}**`);
  lines.push("");

  // Component Breakdown
  lines.push("**Component Scores:**");
  if (score.components.baselineQuality !== undefined) {
    lines.push(`• Baseline Quality: ${score.components.baselineQuality}/100`);
  }
  if (score.components.threatActivity !== undefined) {
    lines.push(`• Threat Activity: ${score.components.threatActivity}/100`);
  }
  if (score.components.archiveHealth !== undefined) {
    lines.push(`• Archive Health: ${score.components.archiveHealth}/100`);
  }
  if (score.components.responseEffectiveness !== undefined) {
    lines.push(`• Response Effectiveness: ${score.components.responseEffectiveness}/100`);
  }
  if (score.components.uptime !== undefined) {
    lines.push(`• Uptime: ${score.components.uptime}/100`);
  }
  lines.push("");

  // Threat Trend Summary
  lines.push("**Threat Trends:**");
  const trendEmoji = trends.trend === 'improving' ? '📉' : trends.trend === 'degrading' ? '📈' : '➡️';
  lines.push(`• Trend: ${trends.trend} ${trendEmoji}`);
  if (trends.windows['24h']) {
    lines.push(`• Last 24h: ${trends.windows['24h'].count} threats (weighted: ${trends.windows['24h'].weightedCount})`);
  }
  if (trends.windows['7d']) {
    lines.push(`• Last 7d: ${trends.windows['7d'].count} threats (weighted: ${trends.windows['7d'].weightedCount})`);
  }
  lines.push("");

  lines.push("*Use `/ops security report:threats` for detailed threat analysis*");
  lines.push("*Use `/ops security report:recommendations` for action items*");

  return lines.join("\n");
}

/**
 * Format threat trends report
 */
function formatThreatTrendsReport(trends: any, window: string): string {
  const lines: string[] = [];

  lines.push("⚠️ **Threat Trend Analysis**");
  lines.push(`Generated: ${toEasternString(new Date())}`);
  lines.push("");

  // Overall Trend
  const trendEmoji = trends.trend === 'improving' ? '📉' : trends.trend === 'degrading' ? '📈' : '➡️';
  lines.push(`**Overall Trend: ${trends.trend} ${trendEmoji}**`);
  lines.push("");

  // Window-specific data
  const validWindows = ['24h', '7d', '30d'];
  const targetWindow = validWindows.includes(window) ? window : '24h';
  
  if (trends.windows[targetWindow]) {
    const windowData = trends.windows[targetWindow];
    lines.push(`**${targetWindow.toUpperCase()} Threat Summary:**`);
    lines.push(`• Total Threats: ${windowData.count}`);
    lines.push(`• Weighted Count: ${windowData.weightedCount}`);
    lines.push("");

    lines.push("**Severity Distribution:**");
    lines.push(`• 🔴 CRITICAL: ${windowData.severity.CRITICAL || 0}`);
    lines.push(`• 🟠 HIGH: ${windowData.severity.HIGH || 0}`);
    lines.push(`• 🟡 MEDIUM: ${windowData.severity.MEDIUM || 0}`);
    lines.push(`• 🟢 LOW: ${windowData.severity.LOW || 0}`);
    lines.push("");
  }

  // All Windows Comparison
  lines.push("**All Time Windows:**");
  for (const [label, duration] of [['24h', trends.windows['24h']], ['7d', trends.windows['7d']], ['30d', trends.windows['30d']]]) {
    if (duration) {
      lines.push(`• ${label}: ${duration.count} threats (weighted: ${duration.weightedCount})`);
    }
  }
  lines.push("");

  lines.push("*Weighted count uses severity multipliers: CRITICAL ×10, HIGH ×5, MEDIUM ×2, LOW ×1*");
  lines.push("*Use `/ops security report:score` for overall security posture*");

  return lines.join("\n");
}

/**
 * Format recommendations report
 */
function formatRecommendationsReport(recommendations: any[], score: any): string {
  const lines: string[] = [];

  lines.push("📋 **Security Recommendations**");
  lines.push(`Generated: ${toEasternString(new Date())}`);
  lines.push(`Current Score: ${score.overall}/100 (${score.grade})`);
  lines.push("");

  if (recommendations.length === 0) {
    lines.push("✅ **No recommendations at this time.**");
    lines.push("Your security posture is healthy. Continue monitoring.");
    return lines.join("\n");
  }

  // Group by priority
  const critical = recommendations.filter(r => r.priority === 'critical');
  const high = recommendations.filter(r => r.priority === 'high');
  const medium = recommendations.filter(r => r.priority === 'medium');
  const low = recommendations.filter(r => r.priority === 'low');

  if (critical.length > 0) {
    lines.push(`**🔴 CRITICAL (${critical.length})**`);
    critical.forEach((rec, i) => {
      lines.push(`${i + 1}. **${rec.title}**`);
      lines.push(`   ${rec.description}`);
      lines.push(`   *Action:* ${rec.action}`);
      lines.push("");
    });
  }

  if (high.length > 0) {
    lines.push(`**🟠 HIGH (${high.length})**`);
    high.slice(0, 3).forEach((rec, i) => {
      lines.push(`${i + 1}. **${rec.title}**`);
      lines.push(`   ${rec.description}`);
      lines.push(`   *Action:* ${rec.action}`);
      lines.push("");
    });
    if (high.length > 3) {
      lines.push(`*...and ${high.length - 3} more high priority items*`);
      lines.push("");
    }
  }

  if (medium.length > 0) {
    lines.push(`**🟡 MEDIUM (${medium.length})**`);
    medium.slice(0, 2).forEach((rec, i) => {
      lines.push(`${i + 1}. **${rec.title}** - ${rec.description}`);
    });
    if (medium.length > 2) {
      lines.push(`*...and ${medium.length - 2} more medium priority items*`);
    }
    lines.push("");
  }

  if (low.length > 0) {
    lines.push(`**🟢 LOW (${low.length})** - See full report for details`);
    lines.push("");
  }

  lines.push("*Recommendations are generated based on baseline quality, threat activity, and archive health*");

  // Truncate if too long
  const message = lines.join("\n");
  if (message.length > 1900) {
    return message.substring(0, 1897) + "...";
  }
  return message;
}

/**
 * Format baseline details report
 */
function formatBaselineReport(baselines: any): string {
  const lines: string[] = [];

  lines.push("📊 **Security Baselines**");
  lines.push(`Generated: ${toEasternString(new Date())}`);
  lines.push("");

  // Confidence
  const confidencePercent = Math.round((baselines.confidence || 0) * 100);
  const confidenceEmoji = confidencePercent >= 75 ? '🟢' : confidencePercent >= 50 ? '🟡' : '🔴';
  lines.push(`**Confidence: ${confidencePercent}% ${confidenceEmoji}**`);
  lines.push(`Data Points: ${baselines.dataPoints || 0} archive entries`);
  lines.push("");

  // Peak Hours
  if (baselines.peakHours && baselines.peakHours.length > 0) {
    lines.push("**Peak Activity Hours (UTC):**");
    lines.push(`• ${baselines.peakHours.join(', ')}`);
    lines.push("");
  }

  // Change Thresholds
  if (baselines.rapidChangeThreshold) {
    lines.push("**Rapid Change Threshold:**");
    lines.push(`• ${baselines.rapidChangeThreshold} changes/hour (95th percentile)`);
    lines.push("");
  }

  // Expected Origins
  if (baselines.expectedOrigins && baselines.expectedOrigins.length > 0) {
    lines.push("**Expected Origins (Whitelist):**");
    baselines.expectedOrigins.slice(0, 5).forEach((origin: string) => {
      lines.push(`• ${origin}`);
    });
    if (baselines.expectedOrigins.length > 5) {
      lines.push(`• ...and ${baselines.expectedOrigins.length - 5} more`);
    }
    lines.push("");
  }

  // Average Activity
  if (baselines.avgChangesPerHour !== undefined) {
    lines.push(`**Average Activity:** ${baselines.avgChangesPerHour.toFixed(2)} changes/hour`);
    lines.push("");
  }

  lines.push("*Baselines are generated from role change archive and used for threat detection*");
  lines.push("*Higher confidence = more accurate threat detection*");

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
      await errorTracker.captureError(err instanceof Error ? err : new Error(String(err)), {
        category: 'CACHE',
        userId: interaction.user.id,
        guildId: interaction.guildId || undefined,
        commandName: '/ops cache',
        operation: 'collectCacheMetrics',
      });
      const message = getErrorMessage(err);
      await interaction.editReply({ content: `Cache metrics unavailable: ${message}` });
    }
    return;
  }

  if (sub === "engine") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const report = formatEngineDbStats();
      await interaction.editReply({ content: report });
    } catch (err) {
      await errorTracker.captureError(err instanceof Error ? err : new Error(String(err)), {
        category: 'ENGINE',
        userId: interaction.user.id,
        guildId: interaction.guildId || undefined,
        commandName: '/ops engine',
        operation: 'formatEngineDbStats',
      });
      const message = getErrorMessage(err);
      await interaction.editReply({ content: `Engine DB stats unavailable: ${message}` });
    }
    return;
  }

  if (sub === "database") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const workerName = interaction.options?.getString?.("worker") ?? null;
      const report = await formatDatabaseWorkerStats(workerName);
      await interaction.editReply({ content: report });
    } catch (err) {
      await errorTracker.captureError(err instanceof Error ? err : new Error(String(err)), {
        category: 'WORKER',
        userId: interaction.user.id,
        guildId: interaction.guildId || undefined,
        commandName: '/ops database',
        operation: 'formatDatabaseWorkerStats',
      });
      const message = getErrorMessage(err);
      await interaction.editReply({ content: `Database worker stats unavailable: ${message}` });
    }
    return;
  }

  if (sub === "workers") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const detailed = Boolean(interaction.options?.getBoolean?.("detailed"));
      const report = await formatAllWorkersStatus(detailed);
      await interaction.editReply({ content: report });
    } catch (err) {
      await errorTracker.captureError(err instanceof Error ? err : new Error(String(err)), {
        category: 'WORKER',
        userId: interaction.user.id,
        guildId: interaction.guildId || undefined,
        commandName: '/ops workers',
        operation: 'formatAllWorkersStatus',
      });
      const message = getErrorMessage(err);
      await interaction.editReply({ content: `Worker status unavailable: ${message}` });
    }
    return;
  }

  if (sub === "logs") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const level = interaction.options?.getString?.("level") ?? null;
      const category = interaction.options?.getString?.("category") ?? null;
      const limit = interaction.options?.getInteger?.("limit") ?? 20;
      const since = interaction.options?.getString?.("since") ?? '1h';
      
      const report = await formatLogEntries({ level, category, limit, since });
      await interaction.editReply({ content: report });
    } catch (err) {
      await errorTracker.captureError(err instanceof Error ? err : new Error(String(err)), {
        category: 'DATABASE',
        userId: interaction.user.id,
        guildId: interaction.guildId || undefined,
        commandName: '/ops logs',
        operation: 'formatLogEntries',
      });
      const message = getErrorMessage(err);
      await interaction.editReply({ content: `Log query failed: ${message}` });
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

    let prismaClient: PrismaClient | null = null;
    let dataSource: "prisma" | "pool" | null = null;
    let report: OpsStatsReport | null = null;
    const shouldDisconnect = deps.disconnectPrisma ?? true;

    try {
      if (deps.prismaFactory) {
        prismaClient = await resolvePrismaFactory(deps.prismaFactory);
        if (prismaClient) {
          dataSource = "prisma";
          report = await collectOpsStatsFromPrisma(prismaClient, window);
        }
      } else {
        const pool = deps.poolFactory ? deps.poolFactory() : getProdDb();
        if (pool) {
          dataSource = "pool";
          report = await collectOpsStatsFromDb(pool, window);
        }
      }
    } catch (err) {
      await errorTracker.captureError(err instanceof Error ? err : new Error(String(err)), {
        category: 'DATABASE',
        userId: interaction.user.id,
        guildId: interaction.guildId || undefined,
        commandName: '/ops stats',
        operation: dataSource === "pool" ? 'collectOpsStatsFromDb' : 'collectOpsStatsFromPrisma',
      });
      log.warn("Stats query failed", { err, dataSource });
      await interaction.editReply({ content: "Failed to load stats (check logs)." });
      return;
    } finally {
      if (prismaClient && shouldDisconnect && typeof prismaClient.$disconnect === "function") {
        try {
          await prismaClient.$disconnect();
        } catch (disconnectErr) {
          log.warn("Failed to disconnect ops Prisma client", { err: disconnectErr });
        }
      }
    }

    if (report) {
      diagnostics.dbStatus = report.prismaStatus;
      diagnostics.busPending = report.busPending;
      diagnostics.busLastProcessedIso =
        report.busLastProcessedAt ? report.busLastProcessedAt.toISOString() : diagnostics.busLastProcessedIso;
    }

    const message = formatOpsStatsReport(report, diagnostics, window);
    await interaction.editReply({ content: message });
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
      lines.push(`Generated: ${toEasternString(new Date())}`);
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
              ? toEasternString(new Date(guild.lastSweep))
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
      await errorTracker.captureError(err instanceof Error ? err : new Error(String(err)), {
        category: 'WORKER',
        userId: interaction.user.id,
        guildId: interaction.guildId || undefined,
        commandName: '/ops state',
        operation: 'getSecurityBotState',
      });
      log.warn("State command failed", { err });
      const message = getErrorMessage(err);
      await interaction.editReply({ content: `State unavailable: ${message}` });
    }
    return;
  }

  if (sub === "errors") {
    await interaction.deferReply({ ephemeral: true });
    
    // Parse filters from options
    const severityFilter = interaction.options?.getString?.("severity") as ErrorSeverity | null;
    const categoryFilter = interaction.options?.getString?.("category") as ErrorCategory | null;
    const sinceRaw = interaction.options?.getString?.("since") ?? "24h";
    
    // Parse "since" duration
    const durationMatch = sinceRaw.match(/^(\d+)(h|d)$/);
    if (!durationMatch) {
      await interaction.editReply({ 
        content: "Invalid 'since' format. Use: 1h, 6h, 24h, 7d, 30d" 
      });
      return;
    }
    
    const value = parseInt(durationMatch[1], 10);
    const unit = durationMatch[2];
    const hoursAgo = unit === 'h' ? value : value * 24;
    const sinceDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    
    try {
      // Collect error statistics
      const stats = await errorTracker.getErrorStats(sinceDate);
      const recentErrors = await errorTracker.getRecentErrors(100);
      
      // Apply filters
      let filteredErrors = recentErrors.filter((err: any) => err.lastSeen >= sinceDate);
      if (severityFilter) {
        filteredErrors = filteredErrors.filter((err: any) => err.severity === severityFilter);
      }
      if (categoryFilter) {
        filteredErrors = filteredErrors.filter((err: any) => err.category === categoryFilter);
      }
      
      // Calculate trends (compare to previous period)
      const previousPeriodStart = new Date(sinceDate.getTime() - hoursAgo * 60 * 60 * 1000);
      const previousStats = await errorTracker.getErrorStats(previousPeriodStart);
      const currentCount = stats.totalOccurrences;
      const previousCount = previousStats.totalOccurrences - stats.totalOccurrences;
      const trendPercent = previousCount > 0 
        ? Math.round(((currentCount - previousCount) / previousCount) * 100)
        : 0;
      const trendIndicator = trendPercent > 0 ? `📈 +${trendPercent}%` : trendPercent < 0 ? `📉 ${trendPercent}%` : `➡️ ${trendPercent}%`;
      
      // Get top 10 most frequent errors
      const errorFrequency = new Map<string, { name: string; count: number; lastSeen: Date }>();
      for (const err of filteredErrors) {
        const existing = errorFrequency.get(err.fingerprint);
        if (existing) {
          existing.count++;
          if (err.lastSeen > existing.lastSeen) {
            existing.lastSeen = err.lastSeen;
          }
        } else {
          errorFrequency.set(err.fingerprint, {
            name: err.errorName,
            count: 1,
            lastSeen: err.lastSeen,
          });
        }
      }
      
      const topErrors = Array.from(errorFrequency.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10);
      
      // Get critical errors (last 24h, CRITICAL + HIGH)
      const criticalErrors = filteredErrors
        .filter((err: any) => err.severity === 'CRITICAL' || err.severity === 'HIGH')
        .sort((a: any, b: any) => b.lastSeen.getTime() - a.lastSeen.getTime())
        .slice(0, 5);
      
      // Calculate recovery success rates
      const errorsWithRecovery = filteredErrors.filter((err: any) => err.recoveryAttempted > 0);
      const overallRecoveryRate = errorsWithRecovery.length > 0
        ? Math.round((errorsWithRecovery.filter((e: any) => e.recoverySuccess > 0).length / errorsWithRecovery.length) * 100)
        : 0;
      
      // Calculate error rate per hour
      const errorRate = Math.round(currentCount / hoursAgo);
      
      // Build response
      const lines: string[] = [];
      lines.push("🚨 **Error Detection System Dashboard**");
      lines.push(`Period: Last ${sinceRaw} (since ${toEasternString(sinceDate)})`);
      if (severityFilter) lines.push(`Filter: Severity = ${severityFilter}`);
      if (categoryFilter) lines.push(`Filter: Category = ${categoryFilter}`);
      lines.push("");
      
      // Section 1: Summary Stats
      lines.push("**📊 Summary Statistics**");
      lines.push(`• Total unique errors: ${stats.totalUnique}`);
      lines.push(`• Total occurrences: ${currentCount}`);
      lines.push(`• Error rate: ~${errorRate}/hour`);
      lines.push(`• Trend: ${trendIndicator} vs previous ${sinceRaw}`);
      lines.push("");
      
      lines.push("**By Severity:**");
      lines.push(`• CRITICAL: ${stats.bySeverity.CRITICAL || 0}`);
      lines.push(`• HIGH: ${stats.bySeverity.HIGH || 0}`);
      lines.push(`• MEDIUM: ${stats.bySeverity.MEDIUM || 0}`);
      lines.push(`• LOW: ${stats.bySeverity.LOW || 0}`);
      lines.push("");
      
      lines.push("**By Category:**");
      Object.entries(stats.byCategory).forEach(([cat, count]) => {
        lines.push(`• ${cat}: ${count}`);
      });
      lines.push("");
      
      // Section 2: Top 10 Errors
      lines.push("**🔥 Top 10 Most Frequent Errors**");
      if (topErrors.length === 0) {
        lines.push("• No errors in period");
      } else {
        topErrors.forEach(([fp, data], idx) => {
          const fpShort = fp.substring(0, 8);
          const lastSeenAgo = formatTimeSince(data.lastSeen);
          lines.push(`${idx + 1}. \`${fpShort}\` ${data.name} • Count: ${data.count} • Last: ${lastSeenAgo}`);
        });
      }
      lines.push("");
      
      // Section 3: Recent Critical Errors
      lines.push("**⚠️ Recent Critical/High Errors**");
      if (criticalErrors.length === 0) {
        lines.push("• No critical errors in period 🎉");
      } else {
        criticalErrors.forEach((err: any, idx: number) => {
          const fpShort = err.fingerprint.substring(0, 8);
          const ago = formatTimeSince(err.lastSeen);
          lines.push(`${idx + 1}. [${err.severity}] \`${fpShort}\` ${err.errorName} • ${ago}`);
          if (err.errorMessage) {
            const msgTrunc = err.errorMessage.length > 60 ? err.errorMessage.substring(0, 57) + "..." : err.errorMessage;
            lines.push(`   └─ ${msgTrunc}`);
          }
        });
      }
      lines.push("");
      
      // Section 4: Recovery Success Rates
      lines.push("**🔧 Recovery Success Rates**");
      lines.push(`• Overall: ${overallRecoveryRate}% (${errorsWithRecovery.filter((e: any) => e.recoverySuccess > 0).length}/${errorsWithRecovery.length} attempts)`);
      lines.push("");
      
      // Section 5: Learning Insights (if available)
      const errorWithLearning = filteredErrors.find((err: any) => err.learningMetadata);
      if (errorWithLearning?.learningMetadata) {
        lines.push("**🧠 Learning Insights**");
        const learning = errorWithLearning.learningMetadata as any;
        if (learning.timePatterns?.length > 0) {
          const pattern = learning.timePatterns[0];
          lines.push(`• Time pattern detected: Peak at hour ${pattern.hour} (~${pattern.errorRate.toFixed(1)} errors/hour)`);
        }
        if (learning.correlations?.length > 0) {
          const corr = learning.correlations[0];
          lines.push(`• Correlation found: \`${corr.error2Fingerprint.substring(0, 8)}\` follows within ${corr.timeDeltaMs}ms`);
        }
        if (learning.recoveryStrategies?.length > 0) {
          const strat = learning.recoveryStrategies[0];
          lines.push(`• Best recovery: "${strat.strategy}" (${strat.effectiveness} effectiveness)`);
        }
      } else {
        lines.push("**🧠 Learning Insights**");
        lines.push("• Waiting for hourly analysis...");
      }
      lines.push("");
      
      lines.push("*Use filters: `--severity critical`, `--category database`, `--since 7d`*");
      
      const message = lines.join("\n");
      if (message.length > 2000) {
        // Split message if too long
        await interaction.editReply({ content: message.substring(0, 1997) + "..." });
      } else {
        await interaction.editReply({ content: message });
      }
    } catch (err) {
      log.warn("Error dashboard command failed", { err });
      const message = getErrorMessage(err);
      await interaction.editReply({ content: `Error dashboard unavailable: ${message}` });
    }
    return;
  }

  // /ops memory - Real-time memory profiling and startup progression
  if (sub === "memory") {
    await interaction.deferReply({ ephemeral: true });

    try {
      // Get STARTUP_MEMORY from global context (populated in index.ts)
      const startupMemory = (global as any).STARTUP_MEMORY;
      const current = process.memoryUsage();
      
      const formatMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
      const formatPercent = (value: number, limit: number) => ((value / limit) * 100).toFixed(1);
      
      const lines: string[] = [];
      lines.push("📊 **Memory Profiling Report**");
      lines.push("");
      
      // Section 1: Startup Progression (if available)
      if (startupMemory && typeof startupMemory === 'object') {
        lines.push("**🚀 Startup Memory Progression**");
        
        if (startupMemory.initial) {
          const initialRss = formatMB(startupMemory.initial.rss);
          lines.push(`• Initial: ${initialRss} MB RSS`);
        }
        
        if (startupMemory.post_database) {
          const dbRss = formatMB(startupMemory.post_database.rss);
          const delta = startupMemory.initial ? formatMB(startupMemory.post_database.rss - startupMemory.initial.rss) : '?';
          lines.push(`• Post-Database: ${dbRss} MB RSS (+${delta} MB)`);
        }
        
        if (startupMemory.post_engine_and_bots) {
          const engineRss = formatMB(startupMemory.post_engine_and_bots.rss);
          const delta = startupMemory.post_database ? formatMB(startupMemory.post_engine_and_bots.rss - startupMemory.post_database.rss) : '?';
          lines.push(`• Post-Engine: ${engineRss} MB RSS (+${delta} MB)`);
        }
        
        if (startupMemory.steady_state) {
          const steadyRss = formatMB(startupMemory.steady_state.rss);
          const delta = startupMemory.post_engine_and_bots ? formatMB(startupMemory.steady_state.rss - startupMemory.post_engine_and_bots.rss) : '?';
          lines.push(`• Steady State: ${steadyRss} MB RSS (+${delta} MB)`);
        }
        
        lines.push("");
      }
      
      // Section 2: Current Memory State
      lines.push("**📈 Current Memory State**");
      lines.push(`• RSS: ${formatMB(current.rss)} MB (total process memory)`);
      lines.push(`• Heap Used: ${formatMB(current.heapUsed)} MB / ${formatMB(current.heapTotal)} MB`);
      lines.push(`• External: ${formatMB(current.external)} MB (C++ objects)`);
      lines.push(`• Array Buffers: ${formatMB(current.arrayBuffers)} MB`);
      
      // Calculate delta from steady state
      if (startupMemory?.steady_state) {
        const deltaRss = current.rss - startupMemory.steady_state.rss;
        const deltaHeap = current.heapUsed - startupMemory.steady_state.heapUsed;
        lines.push("");
        lines.push("**Δ from Steady State:**");
        lines.push(`• RSS: ${deltaRss >= 0 ? '+' : ''}${formatMB(deltaRss)} MB`);
        lines.push(`• Heap: ${deltaHeap >= 0 ? '+' : ''}${formatMB(deltaHeap)} MB`);
      }
      
      lines.push("");
      
      // Section 3: Resource Limits (Render Standard = 2 GB RAM, 1 GB disk)
      const renderLimitMB = 2048;  // 2 GB RAM Standard plan (NOT disk)
      const warningLimitMB = 1536;  // 75%
      const criticalLimitMB = 1741; // 85%
      const emergencyLimitMB = 1843; // 90%
      
      const rssPercent = formatPercent(current.rss, renderLimitMB * 1024 * 1024);
      const status = 
        current.rss >= emergencyLimitMB * 1024 * 1024 ? '💀 EMERGENCY' :
        current.rss >= criticalLimitMB * 1024 * 1024 ? '🚨 CRITICAL' :
        current.rss >= warningLimitMB * 1024 * 1024 ? '⚠️ WARNING' :
        '✅ HEALTHY';
      
      lines.push("**🎯 Resource Limits**");
      lines.push(`• Status: ${status}`);
      lines.push(`• Usage: ${formatMB(current.rss)} MB / ${renderLimitMB} MB (${rssPercent}%)`);
      lines.push(`• Warning: ${warningLimitMB} MB (${formatPercent(current.rss, warningLimitMB * 1024 * 1024)}%)`);
      lines.push(`• Critical: ${criticalLimitMB} MB (${formatPercent(current.rss, criticalLimitMB * 1024 * 1024)}%)`);
      lines.push(`• Emergency: ${emergencyLimitMB} MB (${formatPercent(current.rss, emergencyLimitMB * 1024 * 1024)}%)`);
      lines.push("");
      
      // Section 4: Component Memory (estimates)
      lines.push("**🧩 Component Memory Estimates**");
      
      // Get Engine Cache stats
      try {
        const cacheStats = engineCache.getStats();
        lines.push(`• Engine L1 Cache: ~${cacheStats.memorySizeMb.toFixed(1)} MB`);
      } catch {
        lines.push("• Engine L1 Cache: n/a");
      }
      
      // Get Write Buffer stats
      try {
        const bufferStats = engineWriteBuffer.getStats();
        const bufferMB = ((bufferStats.battleLogQueueSize + bufferStats.moveUsageQueueSize + bufferStats.anomalyQueueSize) * 0.5 / 1024).toFixed(1);
        lines.push(`• Write Buffer: ~${bufferMB} MB (${bufferStats.totalQueueSize} entries)`);
      } catch {
        lines.push("• Write Buffer: n/a");
      }
      
      // Get Read-DB stats
      try {
        const readDbStats = engineReadDb.getStats();
        const readDbMB = (readDbStats.sizeBytes / 1024 / 1024).toFixed(1);
        lines.push(`• Engine Read-DB: ~${readDbMB} MB (SQLite)`);
      } catch {
        lines.push("• Engine Read-DB: n/a");
      }
      
      // Get Write-DB stats
      try {
        const writeDbStats = engineWriteDb.getStats();
        const writeDbMB = (writeDbStats.sizeBytes / 1024 / 1024).toFixed(1);
        lines.push(`• Engine Write-DB: ~${writeDbMB} MB (SQLite)`);
      } catch {
        lines.push("• Engine Write-DB: n/a");
      }
      
      // Get Log Buffer stats
      try {
        const logBuffer = getLogBuffer();
        if (logBuffer) {
          const bufferStats = logBuffer.getStats();
          const bufferMemory = measureLogBufferMemory(bufferStats);
          const bufferMB = formatMB(bufferMemory.estimatedBytes);
          const confidenceEmoji = getConfidenceEmoji(bufferMemory.confidence);
          lines.push(`• Log Buffer: ${bufferMB} MB (${bufferStats.buffered}/200 entries) ${confidenceEmoji}`);
          lines.push(`  └─ Measured via ${bufferMemory.measurementMethod}, ${Math.round(bufferMemory.averageBytesPerEntry)} bytes/entry avg`);
        } else {
          lines.push("• Log Buffer: n/a (not initialized)");
        }
      } catch {
        lines.push("• Log Buffer: n/a");
      }
      
      // Get Event Bus stats
      try {
        const eventBus = EventBus.getInstance();
        const busStats = eventBus.getStats();
        const patternCacheStats = eventBus.getPatternCacheStats();
        const busMemory = measureEventBusMemory(busStats);
        const busMB = formatMB(busMemory.estimatedBytes);
        const confidenceEmoji = getConfidenceEmoji(busMemory.confidence);
        lines.push(`• Event Bus: ${busMB} MB (${busStats.subscriptionsActive} subs, ${busStats.replayBufferSize} replay) ${confidenceEmoji}`);
        lines.push(`  └─ Pattern Cache: ${patternCacheStats.size}/500, measured via ${busMemory.measurementMethod}`);
      } catch {
        lines.push("• Event Bus: n/a");
      }
      
      // Get Discord.js cache stats (if client available)
      try {
        const client = (global as any).discordClient;
        if (client && client.guilds) {
          const discordMemory = measureDiscordCacheMemory(client);
          const discordMB = formatMB(discordMemory.estimatedBytes);
          const confidenceEmoji = getConfidenceEmoji(discordMemory.confidence);
          const meta = discordMemory.metadata as Record<string, any> | undefined;
          lines.push(`• Discord Cache: ${discordMB} MB (${discordMemory.entryCount} total entries) ${confidenceEmoji}`);
          if (meta) {
            lines.push(`  └─ ${meta.messageCount || 0} msg (${meta.avgMessageBytes || 0}B avg), ${meta.memberCount || 0} members (${meta.avgMemberBytes || 0}B avg), ${meta.threadCount || 0} threads`);
            lines.push(`  └─ Measured via ${discordMemory.measurementMethod} (${meta.sampleSizes?.messages || 0} msg samples, ${meta.sampleSizes?.members || 0} member samples)`);
          }
        } else {
          lines.push("• Discord Cache: n/a (client not initialized)");
        }
      } catch (err) {
        lines.push(`• Discord Cache: n/a (error: ${err instanceof Error ? err.message : 'unknown'})`);
      }
      
      lines.push("");
      
      // Section 5: Heap Statistics (simplified - v8 module not imported)
      const heapUsedPercent = ((current.heapUsed / current.heapTotal) * 100).toFixed(1);
      lines.push("**� Heap Statistics**");
      lines.push(`• Heap Usage: ${heapUsedPercent}% of allocated`);
      lines.push(`• Available: ${formatMB(current.heapTotal - current.heapUsed)} MB`);
      lines.push("");
      
      // Section 6: Recommendations
      lines.push("**💡 Recommendations**");
      if (current.rss >= emergencyLimitMB * 1024 * 1024) {
        lines.push("• 💀 EMERGENCY: Restart service immediately");
        lines.push("• Memory guardian should trigger aggressive cleanup");
      } else if (current.rss >= criticalLimitMB * 1024 * 1024) {
        lines.push("• 🚨 CRITICAL: Monitor closely, cleanup recommended");
        lines.push("• Consider restarting service soon");
      } else if (current.rss >= warningLimitMB * 1024 * 1024) {
        lines.push("• ⚠️ WARNING: Memory usage elevated");
        lines.push("• Review component growth patterns");
      } else {
        lines.push("• ✅ Memory usage within normal range");
      }
      
      lines.push("");
      lines.push("*See `docs/memory-profiling-report.md` for optimization opportunities*");
      
      const message = lines.join("\n");
      if (message.length > 2000) {
        await interaction.editReply({ content: message.substring(0, 1997) + "..." });
      } else {
        await interaction.editReply({ content: message });
      }
    } catch (err) {
      log.warn("Memory profiling command failed", { err });
      const message = getErrorMessage(err);
      await interaction.editReply({ content: `Memory profiling unavailable: ${message}` });
    }
    return;
  }

  if (sub === "snapshot") {
    await interaction.deferReply({ ephemeral: true });
    const detailed = Boolean(interaction.options?.getBoolean?.("detailed"));
    
    try {
      const v8 = await import('node:v8');
      const fs = await import('node:fs');
      const path = await import('node:path');
      
      // Helper function for formatting bytes
      const formatSnapshotBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
      };
      
      // Get process memory
      const mem = process.memoryUsage();
      const heapStats = v8.getHeapStatistics();
      
      const lines: string[] = [];
      lines.push("📸 **Memory Heap Snapshot**");
      lines.push(`Timestamp: ${new Date().toISOString()}`);
      lines.push("");
      
      // Process Memory
      lines.push("**💾 Process Memory Usage (RAM)**");
      lines.push("");
      lines.push("**⚠️ RESOURCE TYPE:** RAM (2 GB volatile process memory), NOT persistent disk (1 GB /Store)");
      lines.push("");
      lines.push(`• RSS (Resident Set): ${formatSnapshotBytes(mem.rss)}`);
      lines.push(`• Heap Total: ${formatSnapshotBytes(mem.heapTotal)}`);
      lines.push(`• Heap Used: ${formatSnapshotBytes(mem.heapUsed)}`);
      lines.push(`• External: ${formatSnapshotBytes(mem.external)}`);
      lines.push(`• Array Buffers: ${formatSnapshotBytes(mem.arrayBuffers)}`);
      
      const accountedFor = mem.heapTotal + mem.external;
      const mystery = mem.rss - accountedFor;
      lines.push("");
      lines.push(`**Accounted for:** ${formatSnapshotBytes(accountedFor)}`);
      lines.push(`**Mystery allocation:** ${formatSnapshotBytes(mystery)} (${((mystery / mem.rss) * 100).toFixed(1)}% of RSS)`);
      
      // V8 Heap Statistics
      lines.push("");
      lines.push("**📊 V8 Heap Statistics**");
      lines.push(`• Total Heap Size: ${formatSnapshotBytes(heapStats.total_heap_size)}`);
      lines.push(`• Heap Size Limit: ${formatSnapshotBytes(heapStats.heap_size_limit)}`);
      lines.push(`• Used Heap Size: ${formatSnapshotBytes(heapStats.used_heap_size)}`);
      lines.push(`• Malloced Memory: ${formatSnapshotBytes(heapStats.malloced_memory)}`);
      lines.push(`• External Memory: ${formatSnapshotBytes(heapStats.external_memory)}`);
      
      // Detailed heap spaces breakdown (if requested)
      if (detailed) {
        const heapSpaces = v8.getHeapSpaceStatistics();
        lines.push("");
        lines.push("**🗺️ Heap Spaces Breakdown**");
        for (const space of heapSpaces) {
          if (space.space_size === 0) continue; // Skip empty spaces
          const utilization = ((space.space_used_size / space.space_size) * 100).toFixed(1);
          lines.push(`• ${space.space_name}: ${formatSnapshotBytes(space.space_used_size)} / ${formatSnapshotBytes(space.space_size)} (${utilization}%)`);
        }
      }
      
      // Capture heap snapshot to disk
      lines.push("");
      lines.push("**📁 Heap Snapshot File**");
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `heap-snapshot-${timestamp}.heapsnapshot`;
      const storeDir = process.env.RENDER ? '/Store' : path.join(process.cwd(), 'Store');
      const filepath = path.join(storeDir, filename);
      
      try {
        fs.mkdirSync(storeDir, { recursive: true });
        const snapshotPath = v8.writeHeapSnapshot(filepath);
        const snapshotSize = fs.statSync(snapshotPath).size;
        
        lines.push(`✅ Snapshot captured: ${formatSnapshotBytes(snapshotSize)}`);
        lines.push(`📂 Location: \`${filename}\``);
        lines.push("");
        lines.push("**💡 Analysis Instructions:**");
        lines.push("1. Download snapshot file from Render dashboard");
        lines.push("2. Open Chrome DevTools (F12) → Memory tab");
        lines.push("3. Click 'Load' and select the .heapsnapshot file");
        lines.push("4. Analyze memory allocations by constructor");
      } catch (fsErr) {
        lines.push(`❌ Failed to write snapshot: ${getErrorMessage(fsErr)}`);
      }
      
      const message = lines.join("\n");
      if (message.length > 2000) {
        await interaction.editReply({ content: message.substring(0, 1997) + "..." });
      } else {
        await interaction.editReply({ content: message });
      }
    } catch (err) {
      log.warn("Snapshot command failed", { err });
      const message = getErrorMessage(err);
      await interaction.editReply({ content: `Heap snapshot unavailable: ${message}` });
    }
    return;
  }

  if (sub === "restarts") {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const { getMetricsSummary } = await import("../../services/restart-metrics.js");
      const summary = getMetricsSummary();
      
      const lines: string[] = [];
      lines.push("🔄 **Restart Metrics Dashboard**");
      lines.push(`Generated: ${toEasternString(new Date())}`);
      lines.push("");
      lines.push(summary);
      lines.push("");
      lines.push("*Tracking restart history, crash counts, and uptime metrics*");
      lines.push("*Data persisted to `/Store/restart-metrics.json`*");
      
      const message = lines.join("\n");
      if (message.length > 2000) {
        await interaction.editReply({ content: message.substring(0, 1997) + "..." });
      } else {
        await interaction.editReply({ content: message });
      }
    } catch (err) {
      log.warn("Restart metrics command failed", { err });
      const message = getErrorMessage(err);
      await interaction.editReply({ content: `Restart metrics unavailable: ${message}` });
    }
    return;
  }

  if (sub === "security") {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const securityMetrics = await getSecurityMetricsModule();
      if (!securityMetrics) {
        await interaction.editReply({ content: "Security metrics module not available." });
        return;
      }

      // Get security bot state from global context
      const securityBotState = (global as any).securityBotState;
      if (!securityBotState) {
        await interaction.editReply({ 
          content: "⚠️ Security bot state not available. Security bot may not be running or not yet initialized." 
        });
        return;
      }

      // Determine which security report to show
      const reportType = interaction.options?.getString?.("report") ?? "score";

      if (reportType === "score") {
        // Show security score dashboard
        const metrics = securityMetrics.getSecurityMetrics(securityBotState);
        const report = formatSecurityScoreReport(metrics);
        await interaction.editReply({ content: report });
      } else if (reportType === "threats") {
        // Show threat trend analysis
        const window = interaction.options?.getString?.("window") ?? "24h";
        const trends = securityMetrics.analyzeThreatTrends(securityBotState);
        const report = formatThreatTrendsReport(trends, window);
        await interaction.editReply({ content: report });
      } else if (reportType === "recommendations") {
        // Show actionable recommendations
        const score = securityMetrics.calculateSecurityScore(securityBotState);
        const trends = securityMetrics.analyzeThreatTrends(securityBotState);
        const recommendations = securityMetrics.generateRecommendations(securityBotState, score, trends);
        const report = formatRecommendationsReport(recommendations, score);
        await interaction.editReply({ content: report });
      } else if (reportType === "baseline") {
        // Show baseline details
        if (!securityBotState.security?.baselines) {
          await interaction.editReply({ content: "❌ No security baselines available. Wait for bot startup or accumulate ≥50 archive entries." });
          return;
        }
        const report = formatBaselineReport(securityBotState.security.baselines);
        await interaction.editReply({ content: report });
      } else {
        await interaction.editReply({ content: `Unknown report type: ${reportType}` });
      }
    } catch (err) {
      await errorTracker.captureError(err instanceof Error ? err : new Error(String(err)), {
        category: 'WORKER', // Security bot is a worker service
        userId: interaction.user.id,
        guildId: interaction.guildId || undefined,
        commandName: '/ops security',
        operation: 'handleSecurityCommand',
      });
      const message = getErrorMessage(err);
      await interaction.editReply({ content: `Security metrics unavailable: ${message}` });
    }
    return;
  }

  await interaction.reply({ content: "Unknown /ops command.", ephemeral: true });
}

// =============================================================================
// Task 11: Database Worker Stats Formatters (Option A - Simple & Type-Safe)
// =============================================================================

/**
 * Format database worker statistics for /ops database command.
 * Simple implementation using correct WorkerMetrics/WorkerHealth types.
 * 
 * @param workerName - Optional specific worker to show ("prod", "timescale", "engine-read", "engine-write")
 * @returns Formatted Discord message string
 */
async function formatDatabaseWorkerStats(workerName: string | null): Promise<string> {
  const lines: string[] = [];
  lines.push("📊 **Database Workers Status**");
  lines.push(`Generated: ${toEasternString(new Date())}`);
  lines.push("");
  
  // Define workers with correct types
  const workers = [
    { id: 'prod', name: 'PROD PostgreSQL', instance: getProdPostgresWorker() },
    { id: 'timescale', name: 'TimescaleDB', instance: getTimescaleDBWorker() },
    { id: 'engine-read', name: 'Engine Read-DB', instance: getEngineReadWorker() },
    { id: 'engine-write', name: 'Engine Write-DB', instance: getEngineWriteWorker() },
  ];
  
  // Filter to specific worker if requested
  const filteredWorkers = workerName 
    ? workers.filter(w => w.id === workerName)
    : workers;
  
  if (filteredWorkers.length === 0) {
    return `❌ Unknown worker: ${workerName}. Valid options: prod, timescale, engine-read, engine-write`;
  }
  
  // Format each worker
  for (const worker of filteredWorkers) {
    const health = await worker.instance.healthCheck();
    const metrics = worker.instance.getMetrics();
    
    // Status icon based on WorkerHealthStatus
    const statusIcon = health.status === 'healthy' ? '🟢' 
      : health.status === 'degraded' ? '🟡' 
      : '🔴';
    
    lines.push(`${statusIcon} **${worker.name}** — ${health.status.toUpperCase()}`);
    lines.push(`├─ Operations: ${metrics.operationCount} total`);
    lines.push(`├─ Success: ${metrics.successCount} (${((metrics.successCount / metrics.operationCount) * 100 || 0).toFixed(1)}%)`);
    lines.push(`├─ Failures: ${metrics.failureCount}`);
    lines.push(`├─ Avg Latency: ${metrics.avgLatencyMs.toFixed(1)}ms`);
    lines.push(`├─ Peak Latency: ${metrics.peakLatencyMs.toFixed(1)}ms`);
    lines.push(`├─ Error Rate: ${(metrics.errorRate * 100).toFixed(2)}%`);
    
    if (health.lastError) {
      lines.push(`└─ ⚠️ Last Error: ${health.lastError}`);
    } else {
      lines.push(`└─ ✅ No recent errors`);
    }
    
    lines.push("");
  }
  
  return lines.join("\n");
}

/**
 * Format all workers status for /ops workers command.
 * 
 * @param detailed - Show detailed metrics for each worker
 * @returns Formatted Discord message string
 */
async function formatAllWorkersStatus(detailed: boolean): Promise<string> {
  const lines: string[] = [];
  lines.push("⚙️ **All Workers Status**");
  lines.push(`Generated: ${toEasternString(new Date())}`);
  lines.push("");
  
  lines.push("**Database Workers (4):**");
  
  const workers = [
    { name: 'PROD PostgreSQL', instance: getProdPostgresWorker() },
    { name: 'TimescaleDB', instance: getTimescaleDBWorker() },
    { name: 'Engine Read-DB', instance: getEngineReadWorker() },
    { name: 'Engine Write-DB', instance: getEngineWriteWorker() },
  ];
  
  for (const worker of workers) {
    const health = await worker.instance.healthCheck();
    const metrics = worker.instance.getMetrics();
    
    const icon = health.status === 'healthy' ? '🟢' 
      : health.status === 'degraded' ? '🟡' 
      : '🔴';
    
    lines.push(`${icon} **${worker.name}**`);
    
    if (detailed) {
      lines.push(`   ├─ Status: ${health.status}`);
      lines.push(`   ├─ Operations: ${metrics.operationCount} (${metrics.successCount} success)`);
      lines.push(`   ├─ Latency: ${metrics.avgLatencyMs.toFixed(1)}ms avg, ${metrics.peakLatencyMs.toFixed(1)}ms peak`);
      lines.push(`   └─ Error Rate: ${(metrics.errorRate * 100).toFixed(2)}%`);
    } else {
      lines.push(`   └─ ${metrics.operationCount} ops, ${metrics.successCount} success, ${(metrics.errorRate * 100).toFixed(1)}% errors`);
    }
  }
  
  lines.push("");
  lines.push("*Use `/ops database` for detailed worker metrics*");
  
  return lines.join("\n");
}

/**
 * Format log entries from TimescaleDB for /ops logs command.
 * 
 * @param options - Query options (level, category, limit, since)
 * @returns Formatted Discord message string
 */
async function formatLogEntries(options: {
  level: string | null;
  category: string | null;
  limit: number;
  since: string;
}): Promise<string> {
  const lines: string[] = [];
  lines.push("📜 **TimescaleDB Logs**");
  lines.push(`Generated: ${toEasternString(new Date())}`);
  lines.push("");
  
  // Parse duration
  const durationMs = parseDuration(options.since);
  const sinceDate = new Date(Date.now() - durationMs);
  
  // Build query filters
  const filters: string[] = ['timestamp >= $1'];
  const params: any[] = [sinceDate];
  let paramIndex = 2;
  
  if (options.level) {
    filters.push(`level = $${paramIndex++}`);
    params.push(options.level);
  }
  
  if (options.category) {
    filters.push(`category = $${paramIndex++}`);
    params.push(options.category);
  }
  
  const whereClause = `WHERE ${filters.join(' AND ')}`;
  
  // Build query
  const query = `
    SELECT timestamp, level, category, message, correlation_id
    FROM log_entries
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT $${paramIndex}
  `;
  params.push(options.limit);
  
  // Execute query
  const timescaleWorker = getTimescaleDBWorker();
  const rows = await timescaleWorker.query<{
    timestamp: string;
    level: string;
    category: string;
    message: string;
    correlation_id: string | null;
  }>(query, params);
  
  // Format filters
  const filterParts: string[] = [];
  if (options.level) filterParts.push(`Level: ${options.level.toUpperCase()}`);
  if (options.category) filterParts.push(`Category: ${options.category}`);
  filterParts.push(`Since: ${options.since}`);
  
  lines.push(`**Filters:** ${filterParts.join(" | ")} | Limit: ${options.limit}`);
  lines.push(`**Results:** ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}`);
  lines.push("");
  
  if (rows.length === 0) {
    lines.push("*No log entries found matching filters*");
    return lines.join("\n");
  }
  
  // Format each log entry (max 10 for Discord message limits)
  const displayRows = rows.slice(0, 10);
  for (const row of displayRows) {
    const timestamp = new Date(row.timestamp);
    const levelIcon = getLevelIcon(row.level);
    const timeAgo = formatTimeSince(timestamp);
    
    lines.push(`${levelIcon} **[${row.category}]** ${timeAgo}`);
    const message = row.message.substring(0, 100);
    lines.push(`   ${message}${row.message.length > 100 ? '...' : ''}`);
  }
  
  if (rows.length > 10) {
    lines.push("");
    lines.push(`*Showing first 10 of ${rows.length} entries*`);
  }
  
  const message = lines.join("\n");
  return message.length > 2000 ? message.substring(0, 1997) + "..." : message;
}

/**
 * Parse time duration string (e.g., "1h", "24h", "7d") to milliseconds.
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}. Use format like "1h", "24h", "7d"`);
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: throw new Error(`Unknown duration unit: ${unit}`);
  }
}

/**
 * Get emoji icon for log level.
 */
function getLevelIcon(level: string): string {
  switch (level.toLowerCase()) {
    case 'error': return '🔴';
    case 'warn': return '🟡';
    case 'info': return '🔵';
    case 'debug': return '⚪';
    default: return '⚫';
  }
}

// Helper function to format time since
function formatTimeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
