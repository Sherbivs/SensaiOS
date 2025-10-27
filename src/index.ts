import { config } from "./shared/config.js";
import { log } from "./shared/log.js";
import cliStatus from "./utils/cliStatus.js";
import { Events, type Client, type Guild, type Role } from "discord.js";
import { Prisma } from "@prisma/client";
import { initPrisma, prisma } from "./models/index.js";
import {
  onPrismaHeartbeat,
  startPrismaHeartbeat,
  type PrismaHeartbeatEvent,
} from "./shared/prisma.js";
import { bootDiscord } from "./bot/index.js";
import { getCacheSize, getCacheBudget } from "./services/cache.js";
import { ROLE_ID, ROLE_NAME } from "./config/env.js";
import activityTracker from "./utils/activityTracker.js";

const CLI_MONITOR_DISABLED =
  process.env.DISABLE_CLI_MONITOR === "true" || process.env.NODE_ENV === "test";

type ShutdownTrigger = NodeJS.Signals | "uncaughtException";

const MONITOR_REFRESH_INTERVAL_MS = 5_000;

let monitorActive = false;
let shuttingDown = false;
let signalsInstalled = false;
let activeClient: Client | null = null;
let securityClient: Client | null = null;
let stopPrismaHeartbeatTask: (() => void) | null = null;
let detachPrismaHeartbeatListener: (() => void) | null = null;
let monitoringInterval: NodeJS.Timeout | null = null;

type BotStatusState = {
  status: string;
  lastActivity: { summary: string; timestamp: number } | null;
  lastError: string | null;
};

const discordStatusState: BotStatusState = {
  status: "initializing",
  lastActivity: null,
  lastError: null,
};

const securityStatusState: BotStatusState = {
  status: "initializing",
  lastActivity: null,
  lastError: null,
};

let lastCacheSizeBytes: number | null = null;
let lastCacheCheckAt: number | null = null;
let lastCacheErrorMessage: string | null = null;

let lastDbConnectLatencyMs: number | null = null;
let lastDbHeartbeatEvent: PrismaHeartbeatEvent | null = null;
let previousDbLatencyMs: number | null = null;
let lastDbLatencyDeltaMs: number | null = null;
let lastDbErrorMessage: string | null = null;
let lastDbErrorAt: number | null = null;

let lastMembershipSnapshot:
  | { timestamp: number; totalMembers: number; roleMembers: number }
  | null = null;
let lastMembershipErrorMessage: string | null = null;
let lastActivityStatsErrorMessage: string | null = null;

function withMonitor(callback: (monitor: typeof cliStatus) => void): void {
  if (!monitorActive) {
    return;
  }
  try {
    callback(cliStatus);
  } catch (error) {
    monitorActive = false;
    log.warn("CLI monitor disabled after write failure", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function startMonitor(): void {
  if (CLI_MONITOR_DISABLED || monitorActive) {
    return;
  }
  try {
    cliStatus.startStatusDisplay();
    monitorActive = true;
    setPhase("Booting");
    discordStatusState.status = "initializing";
    securityStatusState.status = "initializing";
    markBotActivity(discordStatusState, "Boot sequence");
    markBotActivity(securityStatusState, "Boot sequence");
    setSection("database", { title: "Database", status: "checking", metrics: [] });
    setSection("discord", { title: "Discord Bot", status: "initializing", metrics: [] });
    setSection("security", { title: "Security Bot", status: "initializing", metrics: [] });
    setSection("cache", { title: "Cache", status: "initializing", metrics: [] });
    setSection("membership", { title: "Membership", status: "pending", metrics: [] });
    startMonitoringLoop();
  } catch (error) {
    monitorActive = false;
    log.warn("CLI monitor unavailable; continuing without interactive dashboard", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function stopMonitor(): void {
  if (!monitorActive) {
    return;
  }
  try {
    cliStatus.stopStatusDisplay();
  } catch {}
  stopMonitoringLoop();
  monitorActive = false;
}

function setPhase(phase: string): void {
  withMonitor((monitor) => {
    monitor.setPhase(phase);
  });
}

function setGuildCount(count: number): void {
  withMonitor((monitor) => {
    monitor.setGuildCount(count);
  });
}

type SectionPayload = Parameters<typeof cliStatus.setSection>[1];

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

function formatBytes(value: number | null | undefined): string {
  if (!Number.isFinite(value) || value === null || value === undefined) {
    return "0 B";
  }
  const absolute = Math.abs(value);
  if (absolute === 0) {
    return "0 B";
  }
  const unitIndex = Math.min(Math.floor(Math.log(absolute) / Math.log(1024)), BYTE_UNITS.length - 1);
  const scaled = absolute / 1024 ** unitIndex;
  const rounded = unitIndex === 0 ? Math.round(scaled).toString() : scaled.toFixed(scaled >= 10 ? 0 : 1);
  return `${value < 0 ? "-" : ""}${rounded} ${BYTE_UNITS[unitIndex]}`;
}

function formatSignedBytes(delta: number | null | undefined): string {
  if (!Number.isFinite(delta) || delta === null || delta === undefined || delta === 0) {
    return "0 B";
  }
  const sign = delta > 0 ? "+" : "-";
  return `${sign}${formatBytes(Math.abs(delta))}`;
}

function formatMilliseconds(value: number | null | undefined): string {
  if (!Number.isFinite(value) || value === null || value === undefined) {
    return "n/a";
  }
  const absolute = Math.abs(value);
  if (absolute >= 1000) {
    const seconds = absolute / 1000;
    const rounded = seconds >= 10 ? seconds.toFixed(1) : seconds.toFixed(2);
    return `${rounded.replace(/\.0+$/, "")}s`;
  }
  return `${Math.round(absolute)}ms`;
}

function formatSignedMilliseconds(delta: number | null | undefined): string {
  if (!Number.isFinite(delta) || delta === null || delta === undefined || delta === 0) {
    return "0ms";
  }
  const sign = delta > 0 ? "+" : "-";
  return `${sign}${formatMilliseconds(Math.abs(delta))}`;
}

function formatDurationMs(value: number | null | undefined): string {
  if (!Number.isFinite(value) || value === null || value === undefined) {
    return "0s";
  }
  const absolute = Math.abs(value);
  const totalSeconds = Math.floor(absolute / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60) % 24;
  const days = Math.floor(totalMinutes / 60 / 24);
  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0 || days > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 || hours > 0 || days > 0) {
    parts.push(`${minutes}m`);
  }
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

function formatRelative(value: Date | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "never";
  }
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp)) {
    return "unknown";
  }
  const diff = Date.now() - timestamp;
  if (Math.abs(diff) < 1000) {
    return "just now";
  }
  const suffix = diff >= 0 ? "ago" : "from now";
  return `${formatDurationMs(diff)} ${suffix}`;
}

function formatNumber(value: number | null | undefined): string {
  if (!Number.isFinite(value) || value === null || value === undefined) {
    return "0";
  }
  return Math.round(value).toLocaleString("en-US");
}

function formatSignedNumber(value: number | null | undefined): string {
  if (!Number.isFinite(value) || value === null || value === undefined || value === 0) {
    return "0";
  }
  const rounded = Math.round(Math.abs(value)).toLocaleString("en-US");
  return value > 0 ? `+${rounded}` : `-${rounded}`;
}

function setSection(sectionId: string, payload: SectionPayload): void {
  withMonitor((monitor) => {
    monitor.setSection(sectionId, payload);
  });
}

function markBotActivity(state: BotStatusState, summary: string): void {
  state.lastActivity = { summary, timestamp: Date.now() };
}

function resolveTargetRole(guild: Guild): Role | null {
  const roles = guild.roles?.cache;
  if (!roles) {
    return null;
  }
  if (ROLE_ID) {
    const byId = roles.get(ROLE_ID);
    if (byId) {
      return byId;
    }
  }
  const targetName = ROLE_NAME?.toLowerCase?.() ?? "";
  if (!targetName) {
    return null;
  }
  return roles.find((role) => role.name.toLowerCase() === targetName) ?? null;
}

type MembershipDetail = {
  guildName: string;
  totalMembers: number;
  roleMembers: number;
  roleName: string;
};

type MembershipStats = {
  perGuild: MembershipDetail[];
  totalMembers: number;
  roleMembers: number;
  missingRoleGuilds: string[];
};

function collectMembershipStats(client: Client): MembershipStats {
  const perGuild: MembershipDetail[] = [];
  const missingRoleGuilds: string[] = [];
  let totalMembers = 0;
  let totalRoleMembers = 0;

  for (const guild of client.guilds.cache.values()) {
    const guildName = guild.name ?? guild.id;
    const total = Number.isFinite(guild.memberCount)
      ? guild.memberCount
      : guild.members?.cache?.size ?? 0;
    totalMembers += total;

    const targetRole = resolveTargetRole(guild);
    let roleMembers = 0;
    let roleDisplayName = ROLE_NAME;

    if (targetRole) {
      roleDisplayName = targetRole.name;
      roleMembers = targetRole.members?.size ?? 0;
      if (roleMembers === 0 && guild.members?.cache) {
        roleMembers = guild.members.cache.filter((member) => member.roles.cache.has(targetRole.id)).size;
      }
      totalRoleMembers += roleMembers;
    } else {
      missingRoleGuilds.push(guildName);
    }

    perGuild.push({
      guildName,
      totalMembers: total,
      roleMembers,
      roleName: roleDisplayName,
    });
  }

  perGuild.sort((a, b) => b.totalMembers - a.totalMembers);

  return {
    perGuild,
    totalMembers,
    roleMembers: totalRoleMembers,
    missingRoleGuilds,
  };
}

function refreshDatabaseSection(): void {
  if (!monitorActive) {
    return;
  }

  const metrics: SectionPayload["metrics"] = [];

  if (typeof lastDbConnectLatencyMs === "number" && Number.isFinite(lastDbConnectLatencyMs)) {
    metrics.push(["connect", formatMilliseconds(lastDbConnectLatencyMs)]);
  }

  if (lastDbHeartbeatEvent) {
    if (typeof lastDbHeartbeatEvent.latencyMs === "number" && Number.isFinite(lastDbHeartbeatEvent.latencyMs)) {
      metrics.push(["heartbeat", formatMilliseconds(lastDbHeartbeatEvent.latencyMs)]);
    }
    if (typeof lastDbLatencyDeltaMs === "number" && lastDbLatencyDeltaMs !== 0) {
      metrics.push(["delta", formatSignedMilliseconds(lastDbLatencyDeltaMs)]);
    }
    metrics.push(["last beat", formatRelative(lastDbHeartbeatEvent.timestamp)]);
    if (lastDbHeartbeatEvent.consecutiveFailures > 0) {
      metrics.push(["failures", lastDbHeartbeatEvent.consecutiveFailures]);
    }
    if (!lastDbHeartbeatEvent.ok && lastDbHeartbeatEvent.error) {
      metrics.push(["error", lastDbHeartbeatEvent.error.message]);
    }
  } else if (lastDbErrorMessage) {
    metrics.push(["error", lastDbErrorMessage]);
  }

  if (lastDbErrorAt) {
    metrics.push(["last error", formatRelative(lastDbErrorAt)]);
  }

  const status = lastDbHeartbeatEvent
    ? lastDbHeartbeatEvent.ok
      ? lastDbHeartbeatEvent.slow
        ? "degraded"
        : "online"
      : "error"
    : lastDbConnectLatencyMs !== null
    ? "online"
    : lastDbErrorMessage
    ? "error"
    : "checking";

  setSection("database", { title: "Database", status, metrics });
}

function refreshCacheSection(): void {
  if (!monitorActive) {
    return;
  }

  const now = Date.now();
  const metrics: SectionPayload["metrics"] = [];
  let status = "online";

  try {
    const sizeBytes = getCacheSize();
    const budget = getCacheBudget();
    const previousSize = lastCacheSizeBytes;
    const previousCheckedAt = lastCacheCheckAt;

    if (previousSize !== null && previousCheckedAt !== null) {
      const deltaBytes = sizeBytes - previousSize;
      const elapsedMs = now - previousCheckedAt;
      metrics.push(["delta", `${formatSignedBytes(deltaBytes)} in ${formatDurationMs(elapsedMs)}`]);
    } else {
      metrics.push(["delta", "n/a"]);
    }

    metrics.unshift(["size", formatBytes(sizeBytes)]);

    if (budget && Number.isFinite(budget.maxAllowedBytes) && budget.maxAllowedBytes > 0) {
      const utilization = Math.min(100, (sizeBytes / budget.maxAllowedBytes) * 100);
      metrics.push([
        "budget",
        `${formatBytes(sizeBytes)} / ${formatBytes(budget.maxAllowedBytes)} (${utilization.toFixed(1)}%)`,
      ]);
      metrics.push(["disk free", formatBytes(budget.diskFreeBytes)]);
      metrics.push(["workspace limit", formatBytes(budget.workspaceLimitBytes)]);
    }

    lastCacheSizeBytes = sizeBytes;
    lastCacheCheckAt = now;
    lastCacheErrorMessage = null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    status = "error";
    metrics.splice(0, metrics.length, ["error", message]);
    if (lastCacheErrorMessage !== message) {
      log.error("Cache metrics collection failed", error);
    }
    lastCacheErrorMessage = message;
  }

  setSection("cache", { title: "Cache", status, metrics });
}

function refreshMembershipSection(): void {
  if (!monitorActive) {
    return;
  }

  if (!securityClient) {
    setSection("membership", {
      title: "Membership",
      status: "offline",
      metrics: [["note", "security bot offline"]],
    });
    lastMembershipSnapshot = null;
    return;
  }

  try {
    const stats = collectMembershipStats(securityClient);
    const now = Date.now();
    const metrics: SectionPayload["metrics"] = [];
    metrics.push(["guilds", stats.perGuild.length]);

    if (lastMembershipSnapshot) {
      const elapsedMs = now - lastMembershipSnapshot.timestamp;
      const totalDelta = stats.totalMembers - lastMembershipSnapshot.totalMembers;
      const roleDelta = stats.roleMembers - lastMembershipSnapshot.roleMembers;
      metrics.push([
        "total members",
        `${formatNumber(stats.totalMembers)} (${formatSignedNumber(totalDelta)} in ${formatDurationMs(elapsedMs)})`,
      ]);
      metrics.push([
        `members with ${ROLE_NAME || "target role"}`,
        `${formatNumber(stats.roleMembers)} (${formatSignedNumber(roleDelta)} in ${formatDurationMs(elapsedMs)})`,
      ]);
    } else {
      metrics.push(["total members", formatNumber(stats.totalMembers)]);
      metrics.push([`members with ${ROLE_NAME || "target role"}`, formatNumber(stats.roleMembers)]);
    }

    const topGuilds = stats.perGuild.slice(0, 3);
    for (const detail of topGuilds) {
      metrics.push([
        detail.guildName,
        `${formatNumber(detail.roleMembers)} / ${formatNumber(detail.totalMembers)} (${detail.roleName})`,
      ]);
    }

    if (stats.perGuild.length > topGuilds.length) {
      metrics.push(["additional guilds", stats.perGuild.length - topGuilds.length]);
    }

    if (stats.missingRoleGuilds.length > 0) {
      metrics.push([
        "missing role",
        stats.missingRoleGuilds.slice(0, 3).join(", ") + (stats.missingRoleGuilds.length > 3 ? "…" : ""),
      ]);
    }

    if (typeof activityTracker?.getStats === "function") {
      try {
        const activityStats = activityTracker.getStats();
        if (activityStats?.lastActivityAt) {
          const description = activityStats.lastActivitySummary
            ? `${activityStats.lastActivitySummary} (${formatRelative(activityStats.lastActivityAt)})`
            : formatRelative(activityStats.lastActivityAt);
          metrics.push(["last activity", description]);
        }
        lastActivityStatsErrorMessage = null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (lastActivityStatsErrorMessage !== message) {
          log.warn("Activity stats unavailable", { error: message });
        }
        lastActivityStatsErrorMessage = message;
      }
    }

    lastMembershipSnapshot = {
      timestamp: now,
      totalMembers: stats.totalMembers,
      roleMembers: stats.roleMembers,
    };
    lastMembershipErrorMessage = null;

    const status = stats.missingRoleGuilds.length > 0 ? "degraded" : "online";
    setSection("membership", { title: "Membership", status, metrics });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (lastMembershipErrorMessage !== message) {
      log.error("Membership metrics collection failed", error);
    }
    lastMembershipErrorMessage = message;
    setSection("membership", {
      title: "Membership",
      status: "error",
      metrics: [["error", message]],
    });
  }
}

function refreshDiscordSection(client: Client | null = activeClient): void {
  if (!monitorActive) {
    return;
  }
  const metrics: SectionPayload["metrics"] = [];
  if (client) {
    const guildCount = client.guilds?.cache?.size ?? 0;
    metrics.push(["identity", client.user?.tag ?? "unknown"]);
    metrics.push(["guilds", guildCount]);
    const ping = (client as { ws?: { ping?: number } }).ws?.ping;
    if (typeof ping === "number" && Number.isFinite(ping)) {
      metrics.push(["ping", `${Math.round(ping)}ms`]);
    }
    setGuildCount(guildCount);
  } else {
    metrics.push(["note", "client offline"]);
    setGuildCount(0);
  }

  if (discordStatusState.lastActivity) {
    metrics.push([
      "last event",
      `${discordStatusState.lastActivity.summary} (${formatRelative(discordStatusState.lastActivity.timestamp)})`,
    ]);
  }

  if (discordStatusState.lastError) {
    const label = discordStatusState.status === "error" ? "error" : "note";
    metrics.push([label, discordStatusState.lastError]);
  }

  setSection("discord", { title: "Discord Bot", status: discordStatusState.status, metrics });
}

function refreshSecuritySection(client: Client | null = securityClient): void {
  if (!monitorActive) {
    return;
  }
  const metrics: SectionPayload["metrics"] = [];
  if (client) {
    const guildCount = client.guilds?.cache?.size ?? 0;
    metrics.push(["identity", client.user?.tag ?? "unknown"]);
    metrics.push(["guilds", guildCount]);
  } else {
    metrics.push(["note", "client offline"]);
  }

  if (securityStatusState.lastActivity) {
    metrics.push([
      "last event",
      `${securityStatusState.lastActivity.summary} (${formatRelative(securityStatusState.lastActivity.timestamp)})`,
    ]);
  }

  if (securityStatusState.lastError) {
    const label = securityStatusState.status === "error" ? "error" : "note";
    metrics.push([label, securityStatusState.lastError]);
  }

  setSection("security", { title: "Security Bot", status: securityStatusState.status, metrics });
}

function updateMonitoringMetrics(): void {
  refreshDatabaseSection();
  refreshCacheSection();
  refreshMembershipSection();
  refreshDiscordSection();
  refreshSecuritySection();
}

function startMonitoringLoop(): void {
  if (monitoringInterval) {
    return;
  }
  monitoringInterval = setInterval(() => {
    updateMonitoringMetrics();
  }, MONITOR_REFRESH_INTERVAL_MS);
  monitoringInterval.unref?.();
  updateMonitoringMetrics();
}

function stopMonitoringLoop(): void {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
}

function handlePrismaHeartbeat(event: PrismaHeartbeatEvent): void {
  lastDbHeartbeatEvent = event;
  if (typeof event.latencyMs === "number" && Number.isFinite(event.latencyMs)) {
    if (typeof previousDbLatencyMs === "number" && Number.isFinite(previousDbLatencyMs)) {
      lastDbLatencyDeltaMs = event.latencyMs - previousDbLatencyMs;
    } else {
      lastDbLatencyDeltaMs = null;
    }
    previousDbLatencyMs = event.latencyMs;
  }

  if (!event.ok && event.error) {
    lastDbErrorMessage = event.error.message;
    lastDbErrorAt = Date.now();
  } else if (event.ok) {
    lastDbErrorMessage = null;
  }

  refreshDatabaseSection();
}

function isClientReady(client: Client): boolean {
  if (typeof client.isReady === "function") {
    return client.isReady();
  }
  return Boolean((client as { readyAt?: Date }).readyAt);
}

function updateDiscordSection(
  client: Client | null,
  status: string,
  activitySummary?: string,
  errorMessage?: string,
): void {
  discordStatusState.status = status;
  if (status === "error") {
    discordStatusState.lastError = errorMessage ?? activitySummary ?? discordStatusState.lastError;
  } else if (errorMessage) {
    discordStatusState.lastError = errorMessage;
  } else if (discordStatusState.lastError && status !== "error") {
    discordStatusState.lastError = null;
  }
  if (activitySummary) {
    markBotActivity(discordStatusState, activitySummary);
  }
  refreshDiscordSection(client ?? activeClient);
}

function bindDiscordLifecycle(client: Client): void {
  client.on("guildCreate", (guild) => {
    discordStatusState.status = "online";
    markBotActivity(discordStatusState, `joined ${guild.name ?? guild.id}`);
    refreshDiscordSection(client);
  });
  client.on("guildDelete", (guild) => {
    discordStatusState.status = "online";
    markBotActivity(discordStatusState, `left ${guild.name ?? guild.id}`);
    refreshDiscordSection(client);
  });
  client.on("shardDisconnect", (_closeEvent, shardId) => {
    discordStatusState.status = "reconnecting";
    markBotActivity(discordStatusState, `shard ${shardId ?? "?"} disconnected`);
    refreshDiscordSection(client);
  });
  client.on("shardResume", (shardId) => {
    discordStatusState.status = "online";
    markBotActivity(discordStatusState, `shard ${shardId ?? "?"} resumed`);
    refreshDiscordSection(client);
  });
}

function updateSecuritySection(
  client: Client | null,
  status: string,
  activitySummary?: string,
  errorMessage?: string,
): void {
  securityStatusState.status = status;
  if (status === "error") {
    securityStatusState.lastError = errorMessage ?? activitySummary ?? securityStatusState.lastError;
  } else if (errorMessage) {
    securityStatusState.lastError = errorMessage;
  } else if (securityStatusState.lastError && status !== "error") {
    securityStatusState.lastError = null;
  }
  if (activitySummary) {
    markBotActivity(securityStatusState, activitySummary);
  }
  refreshSecuritySection(client ?? securityClient);
}

function bindSecurityLifecycle(client: Client): void {
  client.on("guildCreate", (guild) => {
    securityStatusState.status = "online";
    markBotActivity(securityStatusState, `joined ${guild.name ?? guild.id}`);
    refreshSecuritySection(client);
  });
  client.on("guildDelete", (guild) => {
    securityStatusState.status = "online";
    markBotActivity(securityStatusState, `left ${guild.name ?? guild.id}`);
    refreshSecuritySection(client);
  });
  client.on("shardDisconnect", (_closeEvent, shardId) => {
    securityStatusState.status = "reconnecting";
    markBotActivity(securityStatusState, `shard ${shardId ?? "?"} disconnected`);
    refreshSecuritySection(client);
  });
  client.on("shardResume", (shardId) => {
    securityStatusState.status = "online";
    markBotActivity(securityStatusState, `shard ${shardId ?? "?"} resumed`);
    refreshSecuritySection(client);
  });
}

type SecurityBotModule = {
  startSecurityBot?: (options?: { token?: string }) => Promise<unknown>;
  client?: Client;
};

async function bootSecurityBot(): Promise<Client | null> {
  updateSecuritySection(null, "connecting", "starting security bot");
  let candidateClient: Client | null = null;
  try {
    const securityModule = (await import("./bot/main.js")) as SecurityBotModule;
    const startSecurityBot = securityModule.startSecurityBot;
    if (typeof startSecurityBot !== "function") {
      throw new Error("startSecurityBot export missing in ./bot/main.js");
    }

    candidateClient = securityModule.client ?? null;
    if (candidateClient) {
      candidateClient.once(Events.ClientReady, () => {
        updateSecuritySection(candidateClient, "online", "ready");
      });
      bindSecurityLifecycle(candidateClient);
    }

    await startSecurityBot();

    securityClient = candidateClient;
    updateSecuritySection(candidateClient, candidateClient ? "online" : "offline", "connected");

    return candidateClient;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateSecuritySection(candidateClient ?? securityClient, "error", "startup failed", message);
    log.error("Security bot startup failed", error);
    throw error;
  }
}

async function gracefulShutdown(signal: ShutdownTrigger): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  setPhase(`Shutting down (${signal})`);
  log.warn("Shutdown requested", { signal });

  try {
    detachPrismaHeartbeatListener?.();
    detachPrismaHeartbeatListener = null;
    stopPrismaHeartbeatTask?.();
    stopPrismaHeartbeatTask = null;
    await prisma.$disconnect();
  } catch (error) {
    log.error("Error during Prisma disconnect", error);
  }

  if (activeClient) {
    try {
      await activeClient.destroy();
    } catch (error) {
      log.error("Error during Discord client destroy", error);
    }
    activeClient = null;
  }

  if (securityClient) {
    try {
      await securityClient.destroy();
    } catch (error) {
      log.error("Error during security client destroy", error);
    }
    securityClient = null;
  }

  stopMonitor();

  if (signal === "uncaughtException") {
    process.exit(1);
    return;
  }
  process.exit(0);
}

function installSignalHandlers(): void {
  if (signalsInstalled) {
    return;
  }
  signalsInstalled = true;

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void gracefulShutdown(signal);
    });
  }

  process.on("unhandledRejection", (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    log.error("Unhandled promise rejection", error);
  });

  process.on("uncaughtException", (error) => {
    log.error("Uncaught exception", error);
    void gracefulShutdown("uncaughtException");
  });
}

export async function boot(): Promise<void> {
  installSignalHandlers();
  startMonitor();

  log.info("Infinity Gauntlet: toolchain online", { env: config.env });

  const dbStart = process.hrtime.bigint();
  setSection("database", { title: "Database", status: "connecting", metrics: [] });
  try {
    await initPrisma();
    await prisma.$queryRaw(Prisma.sql`SELECT 1`);
    const dbDurationMs = Number(process.hrtime.bigint() - dbStart) / 1_000_000;
    lastDbConnectLatencyMs = dbDurationMs;
    lastDbErrorMessage = null;
    lastDbHeartbeatEvent = null;
    previousDbLatencyMs = null;
    lastDbLatencyDeltaMs = null;
    refreshDatabaseSection();
    log.info("Database connectivity OK");
    detachPrismaHeartbeatListener = onPrismaHeartbeat(handlePrismaHeartbeat);
    stopPrismaHeartbeatTask = startPrismaHeartbeat();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    lastDbConnectLatencyMs = null;
    lastDbHeartbeatEvent = null;
    previousDbLatencyMs = null;
    lastDbLatencyDeltaMs = null;
    lastDbErrorMessage = message;
    lastDbErrorAt = Date.now();
    refreshDatabaseSection();
    setPhase("Startup failed");
    log.error("Database connectivity failed", error, {
      remediation: [
        "On Render, ensure render.yaml sets envVars.DATABASE_URL fromDatabase.connectionString (internal).",
        "For workers, confirm service type is 'Background Worker' and it references the same DB.",
      ],
    });
    throw error;
  }

  setPhase("Starting security bot");
  try {
    await bootSecurityBot();
  } catch (error) {
    setPhase("Startup failed");
    throw error;
  }

  setPhase("Connecting to Discord");
  updateDiscordSection(null, "connecting", "connecting to Discord");

  try {
    const client = await bootDiscord();
    if (!isClientReady(client)) {
      activeClient = client;
      updateDiscordSection(client, "disabled", "token missing or bot disabled", "Token missing or bot disabled");
      setPhase("Idle");
      return;
    }

    activeClient = client;
    updateDiscordSection(client, "online", "ready");
    bindDiscordLifecycle(client);
    setPhase("Online");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateDiscordSection(activeClient, "error", "startup failed", message);
    setPhase("Startup failed");
    log.error("Discord bot startup failed", error);
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  boot().catch((err) => {
    log.error("Fatal during boot", err);
    process.exit(1);
  });
}
