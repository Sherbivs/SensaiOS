import { config } from "./shared/config.js";
import { log } from "./shared/log.js";
import cliStatus from "./utils/cliStatus.js";
import { Events, type Client } from "discord.js";
import { Prisma } from "@prisma/client";
import { initPrisma, prisma } from "./models/index.js";
import {
  onPrismaHeartbeat,
  startPrismaHeartbeat,
  type PrismaHeartbeatEvent,
  getPrismaTransport,
} from "./shared/prisma.js";
import { getCacheBudget, getCacheSnapshot } from "./services/cache.js";
import { bootDiscord } from "./bot/index.js";
import { ENABLE_SECURITY_BOT } from "./config/env.js";

const CLI_MONITOR_DISABLED =
  process.env.DISABLE_CLI_MONITOR === "true" || process.env.NODE_ENV === "test";

type ShutdownTrigger = NodeJS.Signals | "uncaughtException";

type CacheSnapshot = {
  timestamp: number;
  sizeBytes: number;
  entryCount: number;
  oldestEntryMs: number | null;
  newestEntryMs: number | null;
};

const MONITOR_REFRESH_INTERVAL_MS = 5_000;

let monitorActive = false;
let shuttingDown = false;
let signalsInstalled = false;
let activeClient: Client | null = null;
let securityClient: Client | null = null;
let stopPrismaHeartbeatTask: (() => void) | null = null;
let detachPrismaHeartbeatListener: (() => void) | null = null;
let monitorRefreshTimer: NodeJS.Timeout | null = null;
let lastCacheSnapshot: CacheSnapshot | null = null;
let lastPrismaSample: { timestamp: number; latencyMs: number | null } | null = null;
let prismaConnectDurationMs: number | null = null;

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
    setSection("database", { title: "Database", status: "checking", metrics: [] });
    setSection("discord", { title: "Discord Bot", status: "initializing", metrics: [] });
    const securitySection = ENABLE_SECURITY_BOT
      ? { title: "Security Bot", status: "initializing", metrics: [] }
      : { title: "Security Bot", status: "disabled", metrics: [["note", "disabled via ENABLE_SECURITY_BOT"]] };
    setSection("security", securitySection);
    setSection("cache", { title: "Cache", status: "checking", metrics: [] });
    refreshMonitorMetrics();
    monitorRefreshTimer = setInterval(refreshMonitorMetrics, MONITOR_REFRESH_INTERVAL_MS);
    monitorRefreshTimer.unref?.();
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
  if (monitorRefreshTimer) {
    clearInterval(monitorRefreshTimer);
    monitorRefreshTimer = null;
  }
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

function setSection(sectionId: string, payload: SectionPayload): void {
  withMonitor((monitor) => {
    monitor.setSection(sectionId, payload);
  });
}

function normalizeCacheSnapshot(raw: unknown): CacheSnapshot {
  const fallback: CacheSnapshot = {
    timestamp: Date.now(),
    sizeBytes: 0,
    entryCount: 0,
    oldestEntryMs: null,
    newestEntryMs: null,
  };
  if (!raw || typeof raw !== "object") {
    return fallback;
  }
  const candidate = raw as Partial<CacheSnapshot>;
  return {
    timestamp: typeof candidate.timestamp === "number" ? candidate.timestamp : fallback.timestamp,
    sizeBytes: typeof candidate.sizeBytes === "number" ? candidate.sizeBytes : 0,
    entryCount: typeof candidate.entryCount === "number" ? candidate.entryCount : 0,
    oldestEntryMs: typeof candidate.oldestEntryMs === "number" ? candidate.oldestEntryMs : null,
    newestEntryMs: typeof candidate.newestEntryMs === "number" ? candidate.newestEntryMs : null,
  };
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) {
    return "0 B";
  }
  const absolute = Math.abs(bytes);
  if (absolute < 1024) {
    return `${bytes >= 0 ? Math.round(absolute) : -Math.round(absolute)} B`;
  }
  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = absolute / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1);
  const prefix = bytes < 0 ? "-" : "";
  return `${prefix}${rounded} ${units[unitIndex]}`;
}

function formatSignedBytes(delta: number): string {
  if (!Number.isFinite(delta) || delta === 0) {
    return "0 B";
  }
  const prefix = delta > 0 ? "+" : "-";
  return `${prefix}${formatBytes(Math.abs(delta))}`;
}

function formatLatency(value: number): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  const absolute = Math.abs(value);
  if (absolute < 1000) {
    return `${Math.round(absolute)}ms`;
  }
  if (absolute < 60_000) {
    const seconds = absolute / 1000;
    return `${seconds >= 10 ? seconds.toFixed(0) : seconds.toFixed(1)}s`;
  }
  const minutes = absolute / 60_000;
  return `${minutes >= 10 ? minutes.toFixed(0) : minutes.toFixed(1)}m`;
}

function formatSignedLatency(delta: number): string {
  if (!Number.isFinite(delta) || delta === 0) {
    return "0ms";
  }
  const prefix = delta > 0 ? "+" : "-";
  return `${prefix}${formatLatency(Math.abs(delta))}`;
}

function formatDurationMs(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return "0s";
  }
  const totalSeconds = Math.floor(durationMs / 1000);
  if (totalSeconds < 1) {
    return "<1s";
  }
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60) % 24;
  const days = Math.floor(totalMinutes / 60 / 24);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

function formatRelativeTime(timestampMs: number | null): string {
  if (!Number.isFinite(timestampMs)) {
    return "unknown";
  }
  const diff = Date.now() - (timestampMs as number);
  const absolute = Math.abs(diff);
  if (absolute < 1000) {
    return diff >= 0 ? "just now" : "soon";
  }
  if (absolute < 60_000) {
    return `${Math.round(absolute / 1000)}s ${diff >= 0 ? "ago" : "from now"}`;
  }
  if (absolute < 3_600_000) {
    return `${Math.round(absolute / 60_000)}m ${diff >= 0 ? "ago" : "from now"}`;
  }
  if (absolute < 86_400_000) {
    return `${Math.round(absolute / 3_600_000)}h ${diff >= 0 ? "ago" : "from now"}`;
  }
  return `${Math.round(absolute / 86_400_000)}d ${diff >= 0 ? "ago" : "from now"}`;
}

function refreshCacheSection(): void {
  if (!monitorActive) {
    return;
  }
  try {
    const rawSnapshot = getCacheSnapshot();
    const snapshot = normalizeCacheSnapshot(rawSnapshot);
    const budget = getCacheBudget();
    const metrics: SectionPayload["metrics"] = [];
    metrics.push(["size", formatBytes(snapshot.sizeBytes)]);
    metrics.push(["files", snapshot.entryCount]);

    const usageRatio =
      budget && typeof budget.maxAllowedBytes === "number" && budget.maxAllowedBytes > 0
        ? snapshot.sizeBytes / budget.maxAllowedBytes
        : null;
    if (usageRatio !== null && Number.isFinite(usageRatio)) {
      const usagePercent = Math.min(usageRatio * 100, 999);
      metrics.push([
        "budget used",
        `${usagePercent.toFixed(usagePercent >= 10 ? 0 : 1)}% of ${formatBytes(budget.maxAllowedBytes)}`,
      ]);
    }

    if (lastCacheSnapshot) {
      const sizeDelta = snapshot.sizeBytes - lastCacheSnapshot.sizeBytes;
      const fileDelta = snapshot.entryCount - lastCacheSnapshot.entryCount;
      const elapsed = snapshot.timestamp - lastCacheSnapshot.timestamp;
      metrics.push(["Δ size", `${formatSignedBytes(sizeDelta)} in ${formatDurationMs(elapsed)}`]);
      if (fileDelta !== 0) {
        metrics.push(["Δ files", fileDelta > 0 ? `+${fileDelta}` : String(fileDelta)]);
      }
    }

    if (snapshot.newestEntryMs) {
      metrics.push(["last write", formatRelativeTime(snapshot.newestEntryMs)]);
    }
    if (snapshot.oldestEntryMs) {
      metrics.push(["oldest entry", formatRelativeTime(snapshot.oldestEntryMs)]);
    }

    const status = (() => {
      if (usageRatio !== null && Number.isFinite(usageRatio)) {
        if (usageRatio >= 1) {
          return "error";
        }
        if (usageRatio >= 0.9) {
          return "degraded";
        }
      }
      return "online";
    })();

    setSection("cache", { title: "Cache", status, metrics });
    lastCacheSnapshot = snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("Cache telemetry update failed", error);
    setSection("cache", {
      title: "Cache",
      status: "error",
      metrics: [["error", message]],
    });
  }
}

function refreshMonitorMetrics(): void {
  if (!monitorActive) {
    return;
  }
  refreshCacheSection();
}

function renderPrismaHeartbeat(event: PrismaHeartbeatEvent): void {
  if (!monitorActive) {
    return;
  }

  const metrics: SectionPayload["metrics"] = [];
  const latency = typeof event.latencyMs === "number" && Number.isFinite(event.latencyMs)
    ? event.latencyMs
    : null;
  if (latency !== null) {
    metrics.push(["latency", formatLatency(latency)]);
    if (lastPrismaSample?.latencyMs !== null && lastPrismaSample?.latencyMs !== undefined) {
      const delta = latency - (lastPrismaSample.latencyMs ?? 0);
      if (Number.isFinite(delta) && delta !== 0) {
        metrics.push(["Δ latency", formatSignedLatency(delta)]);
      }
    }
  }

  if (lastPrismaSample && event.timestamp instanceof Date) {
    const elapsed = event.timestamp.getTime() - lastPrismaSample.timestamp;
    if (Number.isFinite(elapsed)) {
      metrics.push(["since last", formatDurationMs(Math.max(elapsed, 0))]);
    }
  }

  if (prismaConnectDurationMs !== null) {
    metrics.push(["connect", formatLatency(prismaConnectDurationMs)]);
  }
  if (event.source) {
    metrics.push(["sample", event.source]);
  }
  if (config.databaseUrlSource) {
    metrics.push(["route", config.databaseUrlSource]);
  }
  if (config.databasePreferenceSource) {
    metrics.push(["preference", config.databasePreferenceSource]);
  }
  if (config.databaseConnectionMode) {
    metrics.push(["mode", config.databaseConnectionMode]);
  }
  const transport = getPrismaTransport();
  if (transport) {
    metrics.push(["transport", transport]);
  }
  if (event.slow) {
    metrics.push(["status", "slow"]);
  }
  if (event.consecutiveFailures > 0) {
    metrics.push(["failures", event.consecutiveFailures]);
  }
  if (!event.ok && event.error) {
    metrics.push(["error", event.error.message]);
  }

  const status = event.ok ? (event.slow ? "degraded" : "online") : "error";
  setSection("database", { title: "Database", status, metrics });
  if (event.timestamp instanceof Date) {
    lastPrismaSample = {
      timestamp: event.timestamp.getTime(),
      latencyMs: latency,
    };
  } else {
    lastPrismaSample = {
      timestamp: Date.now(),
      latencyMs: latency,
    };
  }
}

function isClientReady(client: Client): boolean {
  if (typeof client.isReady === "function") {
    return client.isReady();
  }
  return Boolean((client as { readyAt?: Date }).readyAt);
}

function updateDiscordSection(client: Client, status: string): void {
  if (!monitorActive) {
    return;
  }
  const guildCount = client.guilds?.cache?.size ?? 0;
  const metrics: SectionPayload["metrics"] = [
    ["identity", client.user?.tag ?? "unknown"],
    ["guilds", guildCount],
  ];
  const ping = (client as { ws?: { ping?: number } }).ws?.ping;
  if (typeof ping === "number" && Number.isFinite(ping)) {
    metrics.push(["ping", `${Math.round(ping)}ms`]);
  }
  setSection("discord", { title: "Discord Bot", status, metrics });
  setGuildCount(guildCount);
}

function bindDiscordLifecycle(client: Client): void {
  const updateOnline = () => updateDiscordSection(client, "online");
  client.on("guildCreate", updateOnline);
  client.on("guildDelete", updateOnline);
  client.on("shardDisconnect", () => updateDiscordSection(client, "reconnecting"));
  client.on("shardResume", updateOnline);
}

function updateSecuritySection(client: Client | null, status: string): void {
  if (!monitorActive) {
    return;
  }
  const metrics: SectionPayload["metrics"] = [];
  if (client) {
    const guildCount = client.guilds?.cache?.size ?? 0;
    metrics.push(["identity", client.user?.tag ?? "unknown"]);
    metrics.push(["guilds", guildCount]);
  }
  setSection("security", { title: "Security Bot", status, metrics });
}

function bindSecurityLifecycle(client: Client): void {
  const updateOnline = () => updateSecuritySection(client, "online");
  client.on("guildCreate", updateOnline);
  client.on("guildDelete", updateOnline);
  client.on("shardDisconnect", () => updateSecuritySection(client, "reconnecting"));
  client.on("shardResume", updateOnline);
}

type SecurityBotModule = {
  startSecurityBot?: (options?: { token?: string }) => Promise<unknown>;
  client?: Client;
};

async function bootSecurityBot(): Promise<Client | null> {
  updateSecuritySection(null, "connecting");
  try {
    const securityModule = (await import("./bot/main.js")) as SecurityBotModule;
    const startSecurityBot = securityModule.startSecurityBot;
    if (typeof startSecurityBot !== "function") {
      throw new Error("startSecurityBot export missing in ./bot/main.js");
    }

    const candidateClient = securityModule.client ?? null;
    if (candidateClient) {
      candidateClient.once(Events.ClientReady, () => {
        updateSecuritySection(candidateClient, "online");
      });
      bindSecurityLifecycle(candidateClient);
    }

    await startSecurityBot();

    securityClient = candidateClient;
    updateSecuritySection(candidateClient, "online");

    return candidateClient;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setSection("security", {
      title: "Security Bot",
      status: "error",
      metrics: [["error", message]],
    });
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
    prismaConnectDurationMs = dbDurationMs;
    renderPrismaHeartbeat({
      ok: true,
      timestamp: new Date(),
      latencyMs: dbDurationMs,
      slow: false,
      consecutiveFailures: 0,
      source: "startup",
    });
    log.info("Database connectivity OK");
    detachPrismaHeartbeatListener = onPrismaHeartbeat(renderPrismaHeartbeat);
    stopPrismaHeartbeatTask = startPrismaHeartbeat();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setSection("database", {
      title: "Database",
      status: "error",
      metrics: [["error", message]],
    });
    setPhase("Startup failed");
    log.error("Database connectivity failed", error, {
      remediation: [
        "On Render, ensure render.yaml sets envVars.DATABASE_URL fromDatabase.connectionString (internal).",
        "For workers, confirm service type is 'Background Worker' and it references the same DB.",
      ],
    });
    throw error;
  }

  if (ENABLE_SECURITY_BOT) {
    setPhase("Starting security bot");
    try {
      await bootSecurityBot();
    } catch (error) {
      setPhase("Startup failed");
      throw error;
    }
  } else {
    setSection("security", {
      title: "Security Bot",
      status: "disabled",
      metrics: [["note", "Security bot disabled via ENABLE_SECURITY_BOT=false"]],
    });
  }

  setPhase("Connecting to Discord");
  setSection("discord", { title: "Discord Bot", status: "connecting", metrics: [] });

  try {
    const client = await bootDiscord();
    if (!isClientReady(client)) {
      setSection("discord", {
        title: "Discord Bot",
        status: "disabled",
        metrics: [["note", "Token missing or bot disabled"]],
      });
      setPhase("Idle");
      return;
    }

    activeClient = client;
    updateDiscordSection(client, "online");
    bindDiscordLifecycle(client);
    setPhase("Online");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setSection("discord", {
      title: "Discord Bot",
      status: "error",
      metrics: [["error", message]],
    });
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
