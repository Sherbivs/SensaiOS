import { Prisma } from "@prisma/client";
import { Events, type Client } from "discord.js";

import { bootDiscord } from "./bot/index.js";
import { ENABLE_DB_AUTO_SYNC, ENABLE_SECURITY_BOT } from "./config/env.js";
import { initPrisma, prisma } from "./models/index.js";
// Lazy-loaded auto-sync supervisor (only if ENABLE_DB_AUTO_SYNC=true)
// import { startAutoSyncSupervisor } from "./runtime/autoSync.js";
// Lazy-loaded database recovery (only needed when connection fails)
// import { runDatabaseRecovery } from "./runtime/databaseRecovery.js";
// Lazy-loaded cache monitoring imports (not needed on critical startup path)
// import { getCacheBudget, getCacheSnapshot } from "./services/cache.js";
// import { getCacheMetadata } from "./services/pokemonService.js";
import { config } from "./shared/config.js";
import { log } from "./shared/log.js";
import { setupLogBuffer } from "./shared/logBufferInit.js";
import { destroyLogBuffer } from "./shared/logBuffer.js";
import {
  onPrismaHeartbeat,
  startPrismaHeartbeat,
  fireProdHeartbeatEvent,
  type PrismaHeartbeatEvent,
  getPrismaTransport,
} from "./shared/prisma.js";
import cliStatus from "./utils/cliStatus.js";
import { validateEngineDbConfig } from "./config/engine-db-config.js";
import * as engineReadDb from "./services/engine-read-db.js";
import * as engineWriteDb from "./services/engine-write-db.js";
import { engineCache } from "./services/engine-cache.js";
import { engineWriteBuffer } from "./services/engine-write-buffer.js";
import { startEngineWorkers, stopEngineWorkers, type EngineWorkersStatus } from "./workers/engine-workers.js";

// Initialize log buffer early (before most logging occurs)
setupLogBuffer();

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

const MONITOR_REFRESH_INTERVAL_MS = 5 * 60 * 1_000;

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
let stopAutoSyncSupervisor: (() => void) | null = null;
let engineWorkersRunning = false;

// Declare global.engineReady for battle engine readiness check
declare global {
  // eslint-disable-next-line no-var
  var engineReady: boolean;
}
global.engineReady = false;

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
    setSection("engine", { title: "Engine DB", status: "initializing", metrics: [] });
    setSection("discord", { title: "Discord Bot", status: "initializing", metrics: [] });
    const securitySection = ENABLE_SECURITY_BOT
      ? { title: "Security Bot", status: "initializing", metrics: [] }
      : { title: "Security Bot", status: "disabled", metrics: [metric("note", "disabled via ENABLE_SECURITY_BOT")] };
    setSection("security", securitySection);
    setSection("cache", { title: "Runtime Cache", status: "checking", metrics: [] });
    setSection("pokedex", { title: "PokéAPI Cache", status: "checking", metrics: [] });
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
  } catch {
    // Monitor shutdown is best effort; stale terminal state is acceptable during exit.
  }
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

type MetricsEntry = [string, unknown];
type MetricsList = MetricsEntry[];

function metric(label: string, value: unknown): MetricsEntry {
  return [label, value];
}

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
  
  // Lazy-load cache monitoring functions (not needed on critical startup path)
  import("./services/cache.js")
    .then(({ getCacheSnapshot, getCacheBudget }) => {
      try {
        const rawSnapshot = getCacheSnapshot();
        const snapshot = normalizeCacheSnapshot(rawSnapshot);
        const budget = getCacheBudget();
        const metrics: MetricsList = [];
        metrics.push(metric("size", formatBytes(snapshot.sizeBytes)));
        metrics.push(metric("files", snapshot.entryCount));

        const usageRatio =
          budget && typeof budget.maxAllowedBytes === "number" && budget.maxAllowedBytes > 0
            ? snapshot.sizeBytes / budget.maxAllowedBytes
            : null;
        if (usageRatio !== null && Number.isFinite(usageRatio)) {
          const usagePercent = Math.min(usageRatio * 100, 999);
          metrics.push(
            metric(
              "budget used",
              `${usagePercent.toFixed(usagePercent >= 10 ? 0 : 1)}% of ${formatBytes(budget.maxAllowedBytes)}`,
            ),
          );
        }

        if (lastCacheSnapshot) {
          const sizeDelta = snapshot.sizeBytes - lastCacheSnapshot.sizeBytes;
          const fileDelta = snapshot.entryCount - lastCacheSnapshot.entryCount;
          const elapsed = snapshot.timestamp - lastCacheSnapshot.timestamp;
          metrics.push(metric("Δ size", `${formatSignedBytes(sizeDelta)} in ${formatDurationMs(elapsed)}`));
          if (fileDelta !== 0) {
            metrics.push(metric("Δ files", fileDelta > 0 ? `+${fileDelta}` : String(fileDelta)));
          }
        }

        if (snapshot.newestEntryMs) {
          metrics.push(metric("last write", formatRelativeTime(snapshot.newestEntryMs)));
        }
        if (snapshot.oldestEntryMs) {
          metrics.push(metric("oldest entry", formatRelativeTime(snapshot.oldestEntryMs)));
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

        setSection("cache", { title: "Runtime Cache", status, metrics });
        lastCacheSnapshot = snapshot;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error("Cache telemetry update failed", error);
        setSection("cache", {
          title: "Runtime Cache",
          status: "error",
          metrics: [metric("error", message)],
        });
      }
    })
    .catch((importError) => {
      log.error("Failed to load cache monitoring module", importError);
      setSection("cache", {
        title: "Runtime Cache",
        status: "error",
        metrics: [metric("error", "Module load failed")],
      });
    });
}

function refreshPokedexSection(): void {
  if (!monitorActive) {
    return;
  }

  // Lazy-load Pokédex cache metadata (not needed on critical startup path)
  import("./services/pokemonService.js")
    .then(({ getCacheMetadata }) => {
      try {
        const meta = getCacheMetadata();
        const metrics: MetricsList = [];
        const total = typeof meta?.total === "number" ? meta.total : 0;
        const lastFetchedAt = meta?.lastFetchedAt instanceof Date ? meta.lastFetchedAt : null;
        const lastAttemptAt = meta?.lastFetchAttemptAt instanceof Date ? meta.lastFetchAttemptAt : null;
        const now = Date.now();

        metrics.push(metric("entries", total));
        metrics.push(
          metric(
            "last fetch",
            lastFetchedAt ? formatRelativeTime(lastFetchedAt.getTime()) : "never",
          ),
        );
        metrics.push(
          metric(
            "last attempt",
            lastAttemptAt ? formatRelativeTime(lastAttemptAt.getTime()) : "never",
          ),
        );

        if (meta?.cron) {
          const schedule = meta.timezone ? `${meta.cron} (${meta.timezone})` : meta.cron;
          metrics.push(metric("schedule", schedule));
        }
        if (meta?.cacheFile) {
          metrics.push(metric("cache file", meta.cacheFile));
        }

        let status: string = "online";
        const notes: string[] = [];

        if (!lastFetchedAt) {
          status = "warming";
          notes.push("cache has not completed an initial sync");
        } else {
          const ageMs = now - lastFetchedAt.getTime();
          if (Number.isFinite(ageMs) && ageMs > 6 * 60 * 60 * 1_000) {
            status = "degraded";
            notes.push("data older than 6h");
          }
        }

        if (total === 0) {
          status = status === "online" ? "degraded" : status;
          notes.push("no Pokémon cached");
        }

        if (lastAttemptAt) {
          const attemptAgeMs = now - lastAttemptAt.getTime();
          if (Number.isFinite(attemptAgeMs) && attemptAgeMs > 24 * 60 * 60 * 1_000) {
            status = "degraded";
            notes.push("refresh job idle >24h");
          }
        }

        if (notes.length > 0) {
          metrics.push(metric("note", notes.join("; ")));
        }

        setSection("pokedex", { title: "PokéAPI Cache", status, metrics });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error("PokéAPI telemetry update failed", error);
        setSection("pokedex", {
          title: "PokéAPI Cache",
          status: "error",
          metrics: [metric("error", message)],
        });
      }
    })
    .catch((importError) => {
      log.error("Failed to load pokemonService module", importError);
      setSection("pokedex", {
        title: "PokéAPI Cache",
        status: "error",
        metrics: [metric("error", "Module load failed")],
      });
    });
}

function refreshMonitorMetrics(): void {
  if (!monitorActive) {
    return;
  }
  refreshCacheSection();
  refreshPokedexSection();
}

function renderPrismaHeartbeat(event: PrismaHeartbeatEvent): void {
  if (!monitorActive) {
    return;
  }

  const metrics: MetricsList = [];
  const latency = typeof event.latencyMs === "number" && Number.isFinite(event.latencyMs)
    ? event.latencyMs
    : null;
  if (latency !== null) {
    metrics.push(metric("latency", formatLatency(latency)));
    if (lastPrismaSample?.latencyMs !== null && lastPrismaSample?.latencyMs !== undefined) {
      const delta = latency - (lastPrismaSample.latencyMs ?? 0);
      if (Number.isFinite(delta) && delta !== 0) {
        metrics.push(metric("Δ latency", formatSignedLatency(delta)));
      }
    }
  }

  if (lastPrismaSample && event.timestamp instanceof Date) {
    const elapsed = event.timestamp.getTime() - lastPrismaSample.timestamp;
    if (Number.isFinite(elapsed)) {
      metrics.push(metric("since last", formatDurationMs(Math.max(elapsed, 0))));
    }
  }

  if (prismaConnectDurationMs !== null) {
    metrics.push(metric("connect", formatLatency(prismaConnectDurationMs)));
  }
  if (event.source) {
    metrics.push(metric("sample", event.source));
  }
  if (config.databaseUrlSource) {
    metrics.push(metric("route", config.databaseUrlSource));
  }
  if (config.databasePreferenceSource) {
    metrics.push(metric("preference", config.databasePreferenceSource));
  }
  if (config.databaseConnectionMode) {
    metrics.push(metric("mode", config.databaseConnectionMode));
  }
  const transport = getPrismaTransport();
  if (transport) {
    metrics.push(metric("transport", transport));
  }
  if (event.slow) {
    metrics.push(metric("status", "slow"));
  }
  if (event.consecutiveFailures > 0) {
    metrics.push(metric("failures", event.consecutiveFailures));
  }
  if (!event.ok && event.error) {
    metrics.push(metric("error", event.error.message));
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
  const metrics: MetricsList = [
    metric("identity", client.user?.tag ?? "unknown"),
    metric("guilds", guildCount),
  ];
  const ping = (client as { ws?: { ping?: number } }).ws?.ping;
  if (typeof ping === "number" && Number.isFinite(ping)) {
    metrics.push(metric("ping", `${Math.round(ping)}ms`));
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
  const metrics: MetricsList = [];
  if (client) {
    const guildCount = client.guilds?.cache?.size ?? 0;
    metrics.push(metric("identity", client.user?.tag ?? "unknown"));
    metrics.push(metric("guilds", guildCount));
  }
  setSection("security", { title: "Security Bot", status, metrics });
}

function updateEngineSection(workerStatus?: EngineWorkersStatus): void {
  if (!monitorActive) {
    return;
  }
  
  try {
    const cacheStats = engineCache.getStats();
    const bufferStats = engineWriteBuffer.getStats();
    const readDbStats = engineReadDb.getStats();
    const writeDbStats = engineWriteDb.getStats();
    
    const metrics: MetricsList = [];
    
    // Cache metrics
    const hitRate = cacheStats.hitCount + cacheStats.missCount > 0
      ? (cacheStats.hitCount / (cacheStats.hitCount + cacheStats.missCount)) * 100
      : 0;
    metrics.push(metric("cache hit rate", `${hitRate.toFixed(1)}%`));
    metrics.push(metric("cache memory", `${cacheStats.memorySizeMb.toFixed(1)} MB`));
    
    // Buffer metrics
    const utilizationPct = (bufferStats.utilizationPercent * 100).toFixed(1);
    metrics.push(metric("buffer util", `${utilizationPct}%`));
    
    if (bufferStats.isBackpressureActive) {
      metrics.push(metric("⚠️ backpressure", "active"));
    }
    
    // Database metrics
    metrics.push(metric("read-db", `${readDbStats.pokemonCount} pokemon`));
    metrics.push(metric("write-db", `${writeDbStats.battleLogCount} battles`));
    
    // Worker status
    if (workerStatus) {
      const workerErrors = 
        workerStatus.cacheRefresh.errorCount +
        workerStatus.bufferFlush.errorCount +
        workerStatus.writeDbValidator.errorCount;
      
      if (workerErrors > 0) {
        metrics.push(metric("worker errors", workerErrors));
      }
    }
    
    // Determine status
    let status: string = "online";
    if (!global.engineReady) {
      status = "initializing";
    } else if (bufferStats.isBackpressureActive) {
      status = "degraded";
    } else if (workerStatus && (
      workerStatus.cacheRefresh.errorCount > 5 ||
      workerStatus.bufferFlush.errorCount > 5 ||
      workerStatus.writeDbValidator.errorCount > 5
    )) {
      status = "degraded";
    }
    
    setSection("engine", { title: "Engine DB", status, metrics });
    
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('Engine DB telemetry update failed', error);
    setSection("engine", {
      title: "Engine DB",
      status: "error",
      metrics: [metric("error", message)],
    });
  }
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
      metrics: [metric("error", message)],
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

  // Step 1: Mark engine as not ready (stop accepting new battles)
  global.engineReady = false;
  
  // Step 2: Stop Engine DB workers
  if (engineWorkersRunning) {
    try {
      log.info("Stopping Engine DB workers");
      stopEngineWorkers();
      engineWorkersRunning = false;
    } catch (error) {
      log.error("Error stopping Engine DB workers", error);
    }
  }
  
  // Step 3: Flush write buffer (best-effort, emergency mode)
  try {
    log.info("Flushing Engine write buffer");
    await engineWriteBuffer.emergencyShutdown();
  } catch (error) {
    log.error("Error during write buffer emergency shutdown", error);
  }
  
  // Step 4: Save Write-DB to disk (final persistence)
  try {
    log.info("Saving Engine Write-DB");
    await engineWriteDb.close();
  } catch (error) {
    log.error("Error closing Engine Write-DB", error);
  }
  
  // Step 5: Close Read-DB
  try {
    log.info("Closing Engine Read-DB");
    await engineReadDb.close();
  } catch (error) {
    log.error("Error closing Engine Read-DB", error);
  }
  
  // Step 6: Cleanup Engine cache
  try {
    log.info("Shutting down Engine cache");
    engineCache.shutdown();
  } catch (error) {
    log.error("Error during Engine cache shutdown", error);
  }

  // Step 7: Disconnect Prisma and other services
  try {
    detachPrismaHeartbeatListener?.();
    detachPrismaHeartbeatListener = null;
    stopPrismaHeartbeatTask?.();
    stopPrismaHeartbeatTask = null;
    stopAutoSyncSupervisor?.();
    stopAutoSyncSupervisor = null;
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

  // Flush and destroy log buffer before exit
  destroyLogBuffer();

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

  log.info("Infinity Gauntlet: toolchain online", { env: config.nodeEnv });

  const dbStart = process.hrtime.bigint();
  setSection("database", { title: "Database", status: "connecting", metrics: [] });
  try {
    await initPrisma();
    await prisma.$queryRaw(Prisma.sql`SELECT 1`);
    const dbDurationMs = Number(process.hrtime.bigint() - dbStart) / 1_000_000;
    prismaConnectDurationMs = dbDurationMs;
    const startupEvent: PrismaHeartbeatEvent = {
      ok: true,
      timestamp: new Date(),
      latencyMs: dbDurationMs,
      slow: false,
      consecutiveFailures: 0,
      source: "startup" as const,
    };
    renderPrismaHeartbeat(startupEvent);
    // Fire the event to update lastProdHeartbeatEvent so stats show immediately
    fireProdHeartbeatEvent(startupEvent);
    log.info("Database connectivity OK");
    detachPrismaHeartbeatListener = onPrismaHeartbeat(renderPrismaHeartbeat);
    stopPrismaHeartbeatTask = startPrismaHeartbeat();
    if (ENABLE_DB_AUTO_SYNC && !stopAutoSyncSupervisor) {
      // Lazy-load auto-sync supervisor (only used when enabled)
      import("./runtime/autoSync.js")
        .then(({ startAutoSyncSupervisor }) => {
          stopAutoSyncSupervisor = startAutoSyncSupervisor();
        })
        .catch((error) => {
          log.error("Failed to load auto-sync supervisor", error);
        });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setSection("database", {
      title: "Database",
      status: "error",
      metrics: [metric("error", message)],
    });
    setPhase("Database recovery");
    log.warn("Database connectivity failed; attempting recovery", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // Attempt automatic database recovery
    try {
      // Lazy-load database recovery (only needed when connection fails)
      const { runDatabaseRecovery } = await import("./runtime/databaseRecovery.js");
      await runDatabaseRecovery();
      
      // Retry connection after recovery
      await initPrisma();
      await prisma.$queryRaw(Prisma.sql`SELECT 1`);
      const dbDurationMs = Number(process.hrtime.bigint() - dbStart) / 1_000_000;
      prismaConnectDurationMs = dbDurationMs;
      const recoveryEvent: PrismaHeartbeatEvent = {
        ok: true,
        timestamp: new Date(),
        latencyMs: dbDurationMs,
        slow: false,
        consecutiveFailures: 0,
        source: "startup" as const,
      };
      renderPrismaHeartbeat(recoveryEvent);
      // Fire the event to update lastProdHeartbeatEvent so stats show immediately
      fireProdHeartbeatEvent(recoveryEvent);
      log.info("Database connectivity restored after recovery");
      detachPrismaHeartbeatListener = onPrismaHeartbeat(renderPrismaHeartbeat);
      stopPrismaHeartbeatTask = startPrismaHeartbeat();
      if (ENABLE_DB_AUTO_SYNC && !stopAutoSyncSupervisor) {
        // Lazy-load auto-sync supervisor (only used when enabled)
        import("./runtime/autoSync.js")
          .then(({ startAutoSyncSupervisor }) => {
            stopAutoSyncSupervisor = startAutoSyncSupervisor();
          })
          .catch((error) => {
            log.error("Failed to load auto-sync supervisor", error);
          });
      }
    } catch (recoveryError) {
      setSection("database", {
        title: "Database",
        status: "error",
        metrics: [metric("error", message), metric("recovery failed", recoveryError instanceof Error ? recoveryError.message : String(recoveryError))],
      });
      setPhase("Startup failed");
      log.error("Database connectivity failed after recovery attempt", error, {
        recoveryError,
        remediation: [
          "Ensure PROD_DATABASE_URL is set correctly (points to Render-managed PostgreSQL).",
          "For workers, confirm service type is 'Background Worker' and it references the same DB.",
          "Check that PostgreSQL is installed and running on the target server.",
          "Review logs at Store/db/bootstrap.log for bootstrap script errors.",
        ],
      });
      throw error;
    }
  }

  // ============================================================================
  // Engine DB Initialization
  // ============================================================================
  
  setPhase("Initializing Engine DB");
  setSection("engine", { title: "Engine DB", status: "initializing", metrics: [] });
  
  try {
    log.info("Initializing Engine DB runtime");
    
    // Step 1: Validate config (ensure storage directories exist)
    validateEngineDbConfig();
    log.info("Engine DB config validated");
    
    // Step 2: Initialize Read-DB (SQLite read-only database)
    await engineReadDb.initialize();
    const readDbStats = engineReadDb.getStats();
    log.info("Engine Read-DB initialized", {
      pokemon: readDbStats.pokemonCount,
      moves: readDbStats.moveCount,
      typeEffectiveness: readDbStats.typeEffectivenessCount,
      sizeBytes: readDbStats.sizeBytes
    });
    
    // Step 3: Initialize L1 Cache (BLOCKING - load Pokemon/Moves/Types into memory)
    await engineCache.initialize();
    const cacheStats = engineCache.getStats();
    log.info("Engine L1 Cache initialized", {
      pokemon: cacheStats.pokemonCount,
      moves: cacheStats.moveCount,
      typeEffectiveness: cacheStats.typeEffectivenessCount,
      memorySizeMb: cacheStats.memorySizeMb.toFixed(2)
    });
    
    // Step 4: Initialize Write-DB (SQLite append-only database)
    await engineWriteDb.initialize();
    log.info("Engine Write-DB initialized");
    
    // Step 5: Replay WAL (recover from crashes)
    await engineWriteDb.replayWAL();
    const writeDbStats = engineWriteDb.getStats();
    log.info("Engine Write-DB WAL replayed", {
      battleLogs: writeDbStats.battleLogCount,
      moveUsage: writeDbStats.moveUsageCount,
      anomalies: writeDbStats.anomalyCount,
      walEntries: writeDbStats.walEntryCount
    });
    
    // Step 6: Start background workers
    await startEngineWorkers();
    engineWorkersRunning = true;
    log.info("Engine DB workers started");
    
    // Step 7: Mark engine as ready for battles
    global.engineReady = true;
    
    // Update monitor
    updateEngineSection();
    log.info("Engine DB runtime online");
    
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setSection("engine", {
      title: "Engine DB",
      status: "error",
      metrics: [metric("error", message)],
    });
    log.error("Engine DB initialization failed", error);
    
    // Engine DB is optional - continue without it
    log.warn("Continuing without Engine DB (battles will use Prisma queries)");
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
      metrics: [metric("note", "Security bot disabled via ENABLE_SECURITY_BOT=false")],
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
        metrics: [metric("note", "Token missing or bot disabled")],
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
      metrics: [metric("error", message)],
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
