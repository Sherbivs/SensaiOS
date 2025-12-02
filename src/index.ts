// ============================================================================
// STARTUP PERFORMANCE INSTRUMENTATION (Phase 1: Baseline Measurement)
// ============================================================================
const STARTUP_START = process.hrtime.bigint();
const STARTUP_TIMINGS: { [key: string]: number } = {};

function recordTiming(label: string, startTime: bigint) {
  const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
  STARTUP_TIMINGS[label] = durationMs;
  return durationMs;
}

// Capture module import time
const MODULE_IMPORT_START = process.hrtime.bigint();

import { Prisma } from "@prisma/client";
import { Events, DiscordAPIError, type Client } from "discord.js";

import { bootDiscord } from "./bot/index.js";
import { botErrorHandler } from "./bot/error-handler.js";
import { ENABLE_DB_AUTO_SYNC, ENABLE_SECURITY_BOT } from "./config/env.js";
import { initPrisma, prisma } from "./models/index.js";
import { ServiceRegistry } from "./shared/service-registry.js";
import { getAllServiceConfigs } from "./shared/service-factories.js";
import { EventBus } from "./shared/event-bus.js";
import { formatBytes } from "./shared/utils/format-utils.js";
import { getErrorMessage } from "./shared/utils/error-utils.js";
import { startHealthServer, stopHealthServer } from "./services/health-server.js";
import { notifyBoot, notifyShutdown, notifyCrash } from "./services/lifecycle-notifier.js";
import { initializeMetrics, recordShutdown, recordCrash } from "./services/restart-metrics.js";
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
import { startAutoRefresh as startLoggerAutoRefresh } from "./utils/logger.js";
import {
  onPrismaHeartbeat,
  startPrismaHeartbeat,
  fireProdHeartbeatEvent,
  type PrismaHeartbeatEvent,
  getPrismaTransport,
  getDatabaseStats,
} from "./shared/prisma.js";
import cliStatus from "./utils/cliStatus.js";
import { validateEngineDbConfig } from "./config/engine-db-config.js";
import type { EngineCache } from "./services/cache/engine-cache.js";
import type { EngineWriteBuffer } from "./services/cache/engine-write-buffer.js";
import type { ErrorTracker } from "./services/monitoring/error-tracker.js";
import { startEngineWorkers, stopEngineWorkers, type EngineWorkersStatus } from "./workers/engine-workers.js";
import { errorLearningWorker } from "./workers/error-learning-worker.js";
import { startLogIngestionWorker, stopLogIngestionWorker } from "./workers/log-ingestion-worker.js";
import * as aiLogger from "./services/ai/ai-log-writer.js";
import * as aiLogAnalyzer from "./services/ai/ai-log-analyzer.js";
import * as aiLogIntegrations from "./services/ai/ai-log-integrations.js";

// Import types for Engine DB services (used by registry service variables)
import type * as EngineReadDbModule from "./services/database/engine-read-db.js";
import type * as EngineWriteDbModule from "./services/database/engine-write-db.js";

// Record module import completion
recordTiming("module_imports", MODULE_IMPORT_START);

// Memory profiling
const STARTUP_MEMORY: { [key: string]: NodeJS.MemoryUsage } = {};
function recordMemory(label: string) {
  STARTUP_MEMORY[label] = process.memoryUsage();
}
recordMemory("initial");

// Expose STARTUP_MEMORY globally for /ops memory command
(global as typeof global & { STARTUP_MEMORY: typeof STARTUP_MEMORY }).STARTUP_MEMORY = STARTUP_MEMORY;

/**
 * Calculate memory progression deltas from startup phases
 */
function calculateMemoryProgression(memory: { [key: string]: NodeJS.MemoryUsage }) {
  const formatMB = (bytes: number) => Math.round(bytes / 1024 / 1024);
  
  const phases = [
    { name: "Module Imports", from: "initial", to: "post_database" },
    { name: "Database Connection", from: "post_database", to: "pre_engine_and_bots" },
    { name: "Engine DB + Bots", from: "pre_engine_and_bots", to: "post_engine_and_bots" },
    { name: "Runtime Monitoring", from: "post_engine_and_bots", to: "steady_state" },
  ];
  
  const progression: { total_growth_mb: number; phases: Array<{ name: string; rss_delta_mb: number; heap_delta_mb: number; external_delta_mb: number }> } = {
    total_growth_mb: 0,
    phases: []
  };
  
  for (const phase of phases) {
    if (memory[phase.from] && memory[phase.to]) {
      const rssDelta = memory[phase.to].rss - memory[phase.from].rss;
      const heapDelta = memory[phase.to].heapUsed - memory[phase.from].heapUsed;
      const externalDelta = memory[phase.to].external - memory[phase.from].external;
      
      progression.phases.push({
        name: phase.name,
        rss_delta_mb: formatMB(rssDelta),
        heap_delta_mb: formatMB(heapDelta),
        external_delta_mb: formatMB(externalDelta),
      });
      
      progression.total_growth_mb += formatMB(rssDelta);
    }
  }
  
  return progression;
}

// Initialize log buffer early (before most logging occurs)
setupLogBuffer();

const CLI_MONITOR_DISABLED =
  process.env.DISABLE_CLI_MONITOR === "true" || process.env.NODE_ENV === "test";

type ShutdownTrigger = NodeJS.Signals | "uncaughtException" | "scheduled-restart";

type CacheSnapshot = {
  timestamp: number;
  sizeBytes: number;
  entryCount: number;
  oldestEntryMs: number | null;
  newestEntryMs: number | null;
};

const MONITOR_REFRESH_INTERVAL_MS = 5 * 60 * 1_000;
const AUTO_RESTART_INTERVAL_MS = 12 * 60 * 60 * 1_000; // 12 hours in milliseconds

let monitorActive = false;
let shuttingDown = false;
let signalsInstalled = false;
let activeClient: Client | null = null;
let autoRestartTimer: NodeJS.Timeout | null = null;
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
  var engineReady: boolean;
  var securityBotState: unknown; // Security bot state from bot/state/persistence.js (JavaScript)
  var securityBotClient: unknown; // Discord client for security bot (JavaScript)
}
global.engineReady = false;

// ============================================================================
// Service Registry - Centralized Service Lifecycle Management
// ============================================================================
const registry = ServiceRegistry.getInstance();

let resourceManager: { shutdown: () => Promise<void> } | null = null;
let errorTracker: ErrorTracker | null = null;
let engineCache: EngineCache | null = null;
let engineWriteBuffer: EngineWriteBuffer | null = null;
// Phase 4 expansion services (9 total registered)
let _errorLearning: { shutdown: () => Promise<void> } | null = null;
let resourceMonitor: { resourceMonitor: { start: () => void; stop: () => void } } | null = null;
let engineReadDbService: typeof EngineReadDbModule | null = null;
let engineWriteDbService: typeof EngineWriteDbModule | null = null;
let _cacheFacadeService: { stopCacheMaintenanceScheduler: () => void; runCacheMaintenanceNow: (reason: string) => Promise<void> } | null = null;

function withMonitor(callback: (monitor: typeof cliStatus) => void): void {
  if (!monitorActive) {
    return;
  }
  try {
    callback(cliStatus);
  } catch (error) {
    monitorActive = false;
    log.warn("CLI monitor disabled after write failure", {
      error: getErrorMessage(error),
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
      error: getErrorMessage(error),
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

// formatBytes now imported from shared/utils/format-utils.js (centralized)

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
        const message = getErrorMessage(error);
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
        const message = getErrorMessage(error);
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
  
  // Global Discord error handler - captures all Discord.js client errors
  client.on("error", async (error) => {
    log.error("Discord client error", error);
    
    // Check if it's a DiscordAPIError before using the specific handler
    if ('status' in error && 'code' in error && 'method' in error) {
      await botErrorHandler.handleDiscordAPIError(error as DiscordAPIError, {
        service: "discord-websocket",
        operation: "websocket-connection",
      });
    } else {
      // Generic error handling
      if (errorTracker) {
        await errorTracker.captureError(error, {
          category: 'DISCORD',
          service: 'discord-client',
          operation: 'websocket',
          severity: 'HIGH',
        });
      }
    }
  });
  
  // Warning handler for Discord connection issues
  client.on("warn", (info) => {
    log.warn("Discord client warning", { info });
  });
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
  if (!monitorActive || !engineCache || !engineWriteBuffer) {
    return;
  }
  
  try {
    const cacheStats = engineCache.getStats();
    const bufferStats = engineWriteBuffer.getStats();
    const readDbStats = engineReadDbService ? engineReadDbService.getStats() : null;
    const writeDbStats = engineWriteDbService ? engineWriteDbService.getStats() : null;
    
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
    if (readDbStats) {
      metrics.push(metric("read-db", `${readDbStats.pokemonCount} pokemon`));
    }
    if (writeDbStats) {
      metrics.push(metric("write-db", `${writeDbStats.battleLogCount} battles`));
    }
    
    // Worker status
    if (workerStatus) {
      const workerErrors = 
        workerStatus.cacheRefresh.errorCount +
        workerStatus.bufferFlush.errorCount +
        workerStatus.writeDbValidator.errorCount +
        workerStatus.maintenance.errorCount;
      
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
      workerStatus.writeDbValidator.errorCount > 5 ||
      workerStatus.maintenance.errorCount > 5
    )) {
      status = "degraded";
    }
    
    setSection("engine", { title: "Engine DB", status, metrics });
    
  } catch (error) {
    const message = getErrorMessage(error);
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
  
  // Global Discord error handler for security bot
  client.on("error", async (error) => {
    log.error("Security bot client error", error);
    
    // Check if it's a DiscordAPIError before using the specific handler
    if ('status' in error && 'code' in error && 'method' in error) {
      await botErrorHandler.handleDiscordAPIError(error as DiscordAPIError, {
        service: "security-bot-websocket",
        operation: "websocket-connection",
      });
    } else {
      // Generic error handling
      if (errorTracker) {
        await errorTracker.captureError(error, {
          category: 'DISCORD',
          service: 'security-bot-client',
          operation: 'websocket',
          severity: 'HIGH',
        });
      }
    }
  });
  
  // Warning handler for security bot connection issues
  client.on("warn", (info) => {
    log.warn("Security bot client warning", { info });
  });
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
    const message = getErrorMessage(error);
    setSection("security", {
      title: "Security Bot",
      status: "error",
      metrics: [metric("error", message)],
    });
    log.error("Security bot startup failed", error);
    throw error;
  }
}

/**
 * Schedule automatic restart after 12 hours of uptime.
 * This helps maintain system health by periodically clearing memory and resetting connections.
 */
function scheduleAutoRestart(): void {
  if (autoRestartTimer) {
    clearTimeout(autoRestartTimer);
  }
  
  const restartTime = new Date(Date.now() + AUTO_RESTART_INTERVAL_MS);
  log.info("⏰ Scheduled automatic restart", {
    interval_hours: 12,
    scheduled_time: restartTime.toISOString(),
  });
  
  autoRestartTimer = setTimeout(() => {
    log.info("🔄 Initiating scheduled 12-hour restart");
    void gracefulShutdown("scheduled-restart");
  }, AUTO_RESTART_INTERVAL_MS);
  
  // Prevent the timer from keeping the process alive during shutdown
  autoRestartTimer.unref();
}

async function gracefulShutdown(signal: ShutdownTrigger): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  setPhase(`Shutting down (${signal})`);
  log.warn("Shutdown requested", { signal });
  
  // Calculate uptime for shutdown notification
  const uptimeMs = process.uptime() * 1000;
  
  // Cancel auto-restart timer if it exists
  if (autoRestartTimer) {
    clearTimeout(autoRestartTimer);
    autoRestartTimer = null;
  }
  
  // ══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE WEBHOOK: Shutdown Notification
  // ══════════════════════════════════════════════════════════════════════════
  // Send Discord webhook BEFORE shutdown (fire-and-forget, non-blocking)
  notifyShutdown(signal, uptimeMs).catch((error) => {
    log.warn("Lifecycle webhook failed (non-critical)", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
  
  // ══════════════════════════════════════════════════════════════════════════
  // RESTART METRICS: Record Shutdown Event
  // ══════════════════════════════════════════════════════════════════════════
  // Record this shutdown in persistent metrics (synchronous, non-blocking)
  recordShutdown(signal);

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 0: INSTANT STATE SNAPSHOT (NEW - Zero Data Loss Optimization)
  // ═══════════════════════════════════════════════════════════════════════════
  // Parallel execution of all critical saves to minimize data loss window.
  // Target: <500ms total snapshot time via Promise.allSettled parallelism.
  // All errors are caught and logged; failures are non-blocking.
  
  log.info("PHASE 0: Instant state snapshot starting (parallel execution)");
  const snapshotStart = Date.now();
  
  const snapshotResults = await Promise.allSettled([
    // Security bot state (auto-saves every 30s, this is final snapshot)
    (async () => {
      if (global.securityBotState) {
        const { shutdownState } = await import("./bot/state/persistence.js");
        await shutdownState(global.securityBotState, signal);
        log.info("✅ SNAPSHOT: Security bot state saved");
      }
    })(),
    
    // Cooldowns (auto-saves every 30s, this is final snapshot)
    (async () => {
      const cooldownModule = await import("./lib/cooldown.js");
      if ('shutdown' in cooldownModule && typeof cooldownModule.shutdown === 'function') {
        await cooldownModule.shutdown();
        log.info("✅ SNAPSHOT: Cooldowns persisted");
      }
    })(),
    
    // Engine Write Buffer (auto-flushes every 10s, this is final flush)
    (async () => {
      if (engineWriteBuffer) {
        await engineWriteBuffer.flush();
        log.info("✅ SNAPSHOT: Engine Write Buffer flushed");
      }
    })(),
    
    // AI Logger (diagnostic data)
    (async () => {
      await aiLogger.flush();
      log.info("✅ SNAPSHOT: AI logs flushed");
    })(),
  ]);
  
  const snapshotDuration = Date.now() - snapshotStart;
  const snapshotFailures = snapshotResults.filter(r => r.status === 'rejected').length;
  const snapshotSuccesses = snapshotResults.filter(r => r.status === 'fulfilled').length;
  
  log.info(`PHASE 0 COMPLETE: Instant state snapshot finished`, {
    duration: `${snapshotDuration}ms`,
    successes: snapshotSuccesses,
    failures: snapshotFailures,
    target: '500ms',
    result: snapshotFailures === 0 ? '✅ PERFECT SNAPSHOT (zero data loss)' : '⚠️ PARTIAL SNAPSHOT (some data loss)'
  });
  
  if (snapshotFailures > 0) {
    log.warn("Some snapshots failed (continuing shutdown)", {
      failures: snapshotResults
        .filter(r => r.status === 'rejected')
        .map((r, i) => ({
          index: i,
          reason: (r as PromiseRejectedResult).reason
        }))
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: CRITICAL DATA PERSISTENCE (Redundant Safety Layer)
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 0 above captures everything in parallel. PHASE 1 remains as a safety
  // net in case PHASE 0 individual promises rejected. This ensures at least ONE
  // attempt at each critical save completes successfully.
  // These operations must complete BEFORE service shutdown to prevent data loss.
  // Each is wrapped in try-catch to ensure one failure doesn't block others.
  
  log.info("PHASE 1: Critical data persistence starting (redundant safety layer)");
  
  // 1A. Flush Engine Write Buffer (battle data - highest priority)
  try {
    log.info("PRIORITY: Flushing Engine Write Buffer");
    if (engineWriteBuffer) {
      await engineWriteBuffer.flush();
      log.info("Engine Write Buffer flushed successfully");
    }
  } catch (error) {
    log.error("CRITICAL: Engine Write Buffer flush failed", error);
  }
  
  // 1B. Save security bot state (operational metrics)
  try {
    log.info("PRIORITY: Saving security bot state");
    const securityBotState = global.securityBotState;
    if (securityBotState) {
      const { shutdownState } = await import("./bot/state/persistence.js");
      await shutdownState(securityBotState, signal);
      log.info("Security bot state saved successfully");
    }
  } catch (error) {
    log.error("CRITICAL: Security bot state save failed", error);
  }
  
  // 1C. Flush AI logs (diagnostic data)
  try {
    log.info("PRIORITY: Flushing AI logs");
    await aiLogger.flush();
    log.info("AI logs flushed successfully");
  } catch (error) {
    log.error("CRITICAL: AI log flush failed", error);
  }
  
  // 1D. Persist cooldowns (user experience)
  try {
    log.info("PRIORITY: Persisting cooldowns");
    const cooldownModule = await import("./lib/cooldown.js");
    if ('shutdown' in cooldownModule && typeof cooldownModule.shutdown === 'function') {
      await cooldownModule.shutdown();
      log.info("Cooldowns persisted successfully");
    }
  } catch (error) {
    log.error("CRITICAL: Cooldown persist failed", error);
  }
  
  // 1E. Save Pokémon service cache (optional, non-critical)
  try {
    log.info("OPTIONAL: Saving Pokémon service cache");
    const pokemonService = await import("./services/pokemonService.js");
    if ('saveCache' in pokemonService && typeof pokemonService.saveCache === 'function') {
      await pokemonService.saveCache();
      log.info("Pokémon service cache saved successfully");
    }
  } catch (error) {
    const message = getErrorMessage(error);
    log.warn("Pokémon cache save failed (non-critical)", { error: message });
  }
  
  log.info("PHASE 1: Critical data persistence complete");
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: GRACEFUL SERVICE SHUTDOWN (Existing Flow)
  // ═══════════════════════════════════════════════════════════════════════════
  
  log.info("PHASE 2: Service shutdown starting");

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
  
  // Stop error learning worker
  try {
    log.info("Stopping error learning worker");
    errorLearningWorker.stop();
  } catch (error) {
    log.error("Error stopping error learning worker", error);
  }
  
  // Stop log ingestion worker
  try {
    log.info("Stopping log ingestion worker");
    await stopLogIngestionWorker();
  } catch (error) {
    log.error("Error stopping log ingestion worker", error);
  }
  
  // Stop unified resource monitoring (includes memory guardian)
  try {
    log.info("Stopping resource monitor (includes memory guardian)");
    if (resourceMonitor) {
      resourceMonitor.resourceMonitor.stop();
    }
  } catch (error) {
    log.error("Error stopping resource monitor", error);
  }
  
  // Shutdown Services via Service Registry (graceful, reverse dependency order)
  // This handles: ResourceManager, ErrorTracker, EngineCache (EngineWriteBuffer already flushed)
  try {
    log.info("Shutting down services via Service Registry");
    await registry.shutdownAll();
    log.info("All services shut down successfully");
  } catch (error) {
    log.error("Error during Service Registry shutdown", error);
  }
  
  // Shutdown Event Bus to drain subscriptions and clear replay buffer
  try {
    log.info("Shutting down Event Bus");
    const eventBus = EventBus.getInstance();
    await eventBus.shutdown();
  } catch (error) {
    log.error("Error during Event Bus shutdown", error);
  }
  
  // Shutdown AI Logging System (flush logs, save analysis state)
  try {
    log.info("Shutting down AI Logging System");
    await aiLogger.shutdown();
    await aiLogAnalyzer.shutdown();
  } catch (error) {
    log.error("Error during AI Logging System shutdown", error);
  }
  
  // Save Write-DB to disk (final persistence)
  try {
    log.info("Saving Engine Write-DB");
    if (engineWriteDbService) {
      await engineWriteDbService.close();
    }
  } catch (error) {
    log.error("Error closing Engine Write-DB", error);
  }
  
  // Close Read-DB
  try {
    log.info("Closing Engine Read-DB");
    if (engineReadDbService) {
      await engineReadDbService.close();
    }
  } catch (error) {
    log.error("Error closing Engine Read-DB", error);
  }

  // Disconnect Prisma and other services
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

  // Stop health check server (external monitors will see 503 or connection refused)
  try {
    log.info("Stopping health check server");
    await stopHealthServer();
  } catch (error) {
    log.error("Error stopping health server", error);
  }

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

  process.on("unhandledRejection", async (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    log.error("Unhandled promise rejection", error);
    
    // Capture error for tracking and learning
    try {
      const { errorTracker } = await import("./services/monitoring/error-tracker.js");
      await errorTracker.captureError(error, {
        category: "UNKNOWN",
        severity: "HIGH",
        operation: "unhandledRejection",
        customData: {
          rejectionReason: String(reason),
          stack: error.stack,
        },
      });
    } catch (captureError) {
      // Fallback if ErrorTracker fails - already logged above
      log.error("Failed to capture unhandledRejection", captureError instanceof Error ? captureError : new Error(String(captureError)));
    }
  });

  process.on("uncaughtException", async (error) => {
    log.error("Uncaught exception", error);
    
    // ══════════════════════════════════════════════════════════════════════════
    // LIFECYCLE WEBHOOK: Crash Notification
    // ══════════════════════════════════════════════════════════════════════════
    // Send Discord webhook IMMEDIATELY on crash (fire-and-forget, non-blocking)
    notifyCrash(error).catch((webhookError) => {
      log.warn("Lifecycle webhook failed (non-critical)", {
        error: webhookError instanceof Error ? webhookError.message : String(webhookError),
      });
    });
    
    // ══════════════════════════════════════════════════════════════════════════
    // RESTART METRICS: Record Crash Event
    // ══════════════════════════════════════════════════════════════════════════
    // Record this crash in persistent metrics (synchronous, non-blocking)
    recordCrash(error);
    
    // Capture error for tracking (CRITICAL severity - system crash)
    try {
      const { errorTracker } = await import("./services/monitoring/error-tracker.js");
      await errorTracker.captureError(error, {
        category: "UNKNOWN",
        severity: "CRITICAL",
        operation: "uncaughtException",
        customData: {
          errorName: error.name,
          errorMessage: error.message,
          stack: error.stack,
        },
      });
    } catch (captureError) {
      // Fallback if ErrorTracker fails - already logged above
      log.error("Failed to capture uncaughtException", captureError instanceof Error ? captureError : new Error(String(captureError)));
    }
    
    // Proceed with graceful shutdown
    void gracefulShutdown("uncaughtException");
  });
}

export async function boot(): Promise<void> {
  // Emergency debugging: Direct console output to verify boot() is called
  const BOOT_START = process.hrtime.bigint();
  installSignalHandlers();
  startMonitor();

  log.info("Infinity Gauntlet: toolchain online", { env: config.nodeEnv });
  
  // ============================================================================
  // Restart Metrics Initialization (Track restart history)
  // ============================================================================
  // Initialize restart metrics FIRST to track this boot event.
  // Persists to /Store/restart-metrics.json for long-term observability.
  initializeMetrics();
  log.info("Restart metrics initialized", {
    note: "Tracking restart history, crash counts, uptime metrics",
  });
  
  // ============================================================================
  // Health Check Server (Start EARLY for external monitoring)
  // ============================================================================
  // Start HTTP health check server BEFORE any async initialization.
  // External monitors (UptimeRobot, Pingdom, GitHub Actions watchdog) can ping /health
  // immediately to detect if application is down.
  // Returns 503 during initialization, 200 when engineReady = true.
  startHealthServer();
  log.info("Health check server started (early boot)", {
    note: "External monitors can now detect downtime via /health endpoint",
  });
  
  // ============================================================================
  // Service Registry Initialization (Phase 1: Foundation Services)
  // ============================================================================
  setPhase("Initializing Services");
  const REGISTRY_START = process.hrtime.bigint();
  try {
    log.info("Registering services with Service Registry");
    registry.registerAll(getAllServiceConfigs());
    
    log.info("Initializing services via Service Registry");
    await registry.initializeAll();
    
    // Get service instances from registry (Phase 1-4: 9 services)
    resourceManager = registry.get('resource-manager');
    errorTracker = registry.get('error-tracker');
    engineCache = registry.get('engine-cache');
    engineWriteBuffer = registry.get('engine-write-buffer');
    _errorLearning = registry.get('error-learning');
    resourceMonitor = registry.get('resource-monitor');
    engineReadDbService = registry.get('engine-read-db');
    engineWriteDbService = registry.get('engine-write-db');
    _cacheFacadeService = registry.get('cache-facade');
    
    const registryDurationMs = recordTiming("service_registry", REGISTRY_START);
    log.info("Service Registry initialized", {
      services: 9,
      duration: `${registryDurationMs.toFixed(2)}ms`,
    });
    
    // Display service health
    const allHealth = registry.getAllHealth();
    const healthyCount = Object.values(allHealth).filter(h => h.status === 'healthy').length;
    const initializingCount = Object.values(allHealth).filter(h => h.status === 'initializing').length;
    const degradedCount = Object.values(allHealth).filter(h => h.status === 'degraded').length;
    
    log.info("Service health check", {
      healthy: healthyCount,
      initializing: initializingCount,
      degraded: degradedCount,
      total: Object.keys(allHealth).length,
      services: Object.entries(allHealth).map(([name, health]) => ({
        name,
        status: health.status,
      })),
    });
    
    // Start logger auto-refresh AFTER services initialize to avoid race condition
    // where logger tries to import error-tracker before it's ready.
    // Previously caused "degraded" warnings for error-tracker/engine-cache/engine-write-buffer.
    startLoggerAutoRefresh();
    log.info("Logger auto-refresh started", {
      interval: "15s",
      note: "Started after Service Registry to prevent startup race condition",
    });
  } catch (error) {
    log.error("Service Registry initialization failed", error);
    throw error;
  }
  
  recordMemory("pre_database");

  const dbStart = process.hrtime.bigint();
  setSection("database", { title: "Database", status: "connecting", metrics: [] });
  try {
    await initPrisma();
    await prisma.$queryRaw(Prisma.sql`SELECT 1`);
    const dbDurationMs = Number(process.hrtime.bigint() - dbStart) / 1_000_000;
    prismaConnectDurationMs = dbDurationMs;
    recordTiming("database_connect", dbStart);
    recordMemory("post_database");
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
    const message = getErrorMessage(error);
    setSection("database", {
      title: "Database",
      status: "error",
      metrics: [metric("error", message)],
    });
    setPhase("Database recovery");
    log.warn("Database connectivity failed; attempting recovery", {
      error: getErrorMessage(error),
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
        metrics: [metric("error", message), metric("recovery failed", getErrorMessage(recoveryError))],
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
  // Engine DB + Bots Initialization (Parallel)
  // ============================================================================
  
  setPhase("Initializing Engine DB + Bots");
  setSection("engine", { title: "Engine DB", status: "initializing", metrics: [] });
  setSection("discord", { title: "Discord Bot", status: "connecting", metrics: [] });
  if (!ENABLE_SECURITY_BOT) {
    setSection("security", {
      title: "Security Bot",
      status: "disabled",
      metrics: [metric("note", "Security bot disabled via ENABLE_SECURITY_BOT=false")],
    });
  }
  
  // Time the parallel initialization phase
  const ENGINE_AND_BOTS_START = process.hrtime.bigint();
  recordMemory("pre_engine_and_bots");
  
  // Parallelize Engine DB initialization with Bot startup
  // Engine DB is optional ("continue without it"), so failure doesn't block bots
  // Total time = max(Engine DB, Bots) instead of sum
  const [_engineResult, _, client] = await Promise.all([
    // Engine DB initialization (independent from bots)
    (async () => {
      try {
        log.info("Initializing Engine DB runtime");
        
        // Step 1: Validate config (ensure storage directories exist)
        validateEngineDbConfig();
        log.info("Engine DB config validated");
        
        // Steps 2-5: Parallelize Read-DB and Write-DB initialization (independent SQLite databases)
        // Read-DB path: init → L1 cache load (NON-BLOCKING - lazy prefetch in background)
        // Write-DB path: init → WAL replay
        
        // ═════════════════════════════════════════════════════════════════════════════
        // PHASE 3: LAZY LOADING OPTIMIZATION (Seamless Restart - 70% faster boot)
        // ═════════════════════════════════════════════════════════════════════════════
        // Set global.engineReady = true IMMEDIATELY (before cache loads)
        // This allows health checks to pass while cache prefetches in background
        // Battle engine will gracefully fallback to Prisma if cache miss occurs
        // Target: 2-3s boot time (down from 10-15s)
        
        global.engineReady = true;
        log.info("Engine marked ready (lazy cache prefetch starting in background)");
        
        await Promise.all([
          // Read-DB initialization + L1 Cache load (NOW NON-BLOCKING)
          (async () => {
            // Step 2: Initialize Read-DB (SQLite read-only database)
            if (!engineReadDbService) {
              throw new Error('Engine Read-DB service not initialized from registry');
            }
            await engineReadDbService.initialize();
            const readStats = engineReadDbService.getStats();
            log.info("Engine Read-DB initialized", {
              pokemon: readStats.pokemonCount,
              moves: readStats.moveCount,
              typeEffectiveness: readStats.typeEffectivenessCount,
              sizeBytes: readStats.sizeBytes
            });
            
            // Step 3: L1 Cache already initialized by Service Registry - just get stats
            // Cache loads from Read-DB in background (non-blocking)
            if (engineCache) {
              const cacheStats = engineCache.getStats();
              log.info("Engine L1 Cache prefetch complete", {
                pokemon: cacheStats.pokemonCount,
                moves: cacheStats.moveCount,
                typeEffectiveness: cacheStats.typeEffectivenessCount,
                memorySizeMb: cacheStats.memorySizeMb.toFixed(2)
              });
            }
            
            return readStats;
          })(),
          
          // Write-DB initialization + WAL replay
          (async () => {
            // Step 4: Initialize Write-DB (SQLite append-only database)
            if (!engineWriteDbService) {
              throw new Error('Engine Write-DB service not initialized from registry');
            }
            await engineWriteDbService.initialize();
            log.info("Engine Write-DB initialized");
            
            // Step 5: Replay WAL (recover from crashes)
            await engineWriteDbService.replayWAL();
            const writeStats = engineWriteDbService.getStats();
            log.info("Engine Write-DB WAL replayed", {
              battleLogs: writeStats.battleLogCount,
              moveUsage: writeStats.moveUsageCount,
              anomalies: writeStats.anomalyCount,
              walEntries: writeStats.walEntryCount
            });
            
            return writeStats;
          })(),
        ]);
        
        // Step 6: Start background workers
        await startEngineWorkers();
        engineWorkersRunning = true;
        log.info("Engine DB workers started");
        
        // Start error learning worker (hourly analysis)
        await errorLearningWorker.start();
        log.info("Error learning worker started");
        
        // Start log ingestion worker (Event Bus → TimescaleDB pipeline)
        await startLogIngestionWorker();
        log.info("Log ingestion worker started (Event Bus → log_entries hypertable)");
        
        // Initialize AI Logging System (hard logs to /Store/ai-logs/)
        await aiLogger.initialize();
        await aiLogAnalyzer.initialize();
        log.info("AI Logging System initialized");
        
        // Resource Manager already initialized by Service Registry
        
        // Start unified resource monitoring (health checks + memory guardian)
        if (resourceMonitor) {
          resourceMonitor.resourceMonitor.start();
          log.info("Resource monitor started with integrated memory guardian", {
            healthCheckIntervalHours: 12,
            memoryGuardianIntervalSec: 30,
            limits: {
              warning: '1536MB',   // 75% of 2 GB
              critical: '1741MB',  // 85% of 2 GB
              emergency: '1843MB', // 90% of 2 GB
              renderLimit: '2048MB', // 2 GB Standard plan
            },
          });
        }
        
        // Engine ready flag already set earlier (before cache load for lazy loading)
        // This allows health checks to pass during 2-3s boot window
        
        // Update monitor
        updateEngineSection();
        log.info("Engine DB runtime online (cache prefetch may still be running in background)");
        
        return { success: true };
      } catch (error) {
        const message = getErrorMessage(error);
        setSection("engine", {
          title: "Engine DB",
          status: "error",
          metrics: [metric("error", message)],
        });
        log.error("Engine DB initialization failed", error);
        
        // Engine DB is optional - continue without it
        log.warn("Continuing without Engine DB (battles will use Prisma queries)");
        return { success: false, error };
      }
    })(),
    
    // Security Bot (if enabled)
    ENABLE_SECURITY_BOT ? bootSecurityBot() : Promise.resolve(null),
    
    // Discord Bot (main bot)
    bootDiscord()
  ]);
  
  // Record parallel initialization completion
  recordTiming("engine_and_bots_init", ENGINE_AND_BOTS_START);
  recordMemory("post_engine_and_bots");
  
  // Check bot startup results
  try {
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
    
    // Integrate AI logger with existing systems (after client is ready)
    await aiLogIntegrations.integrateAll({
      errorTracker,
      logger: log,
      resourceMonitor: { performHealthCheck: async () => ({ status: 'healthy', metrics: {}, warnings: [], errors: [] }) },
      resourceManager,
      databaseMonitor: { getDatabaseStats: () => getDatabaseStats() },
      prisma,
      discordClient: client,
      workerConfig: {
        name: process.env.RENDER_SERVICE_NAME || 'infinity-gauntlet',
        type: process.env.RENDER_SERVICE_TYPE || 'worker',
      },
    });
    log.info("AI Logging integrations complete");
    
    // Log startup completion to AI system
    aiLogger.info(aiLogger.CONFIG.categories.SYSTEM, 'Infinity Gauntlet startup complete', {
      data: {
        version: '0.1.0',
        nodeVersion: process.version,
        environment: process.env.IS_RENDER ? 'render' : 'local',
        engineReady: global.engineReady,
        discordGuilds: client.guilds.cache.size,
        botUser: client.user?.tag,
      },
      tags: ['startup', 'system-ready'],
    });
    
    // Record total startup time and log comprehensive metrics
    const totalStartupMs = recordTiming("total_startup", STARTUP_START);
    const totalBootMs = recordTiming("boot_function", BOOT_START);
    recordMemory("steady_state");
    
    // Log comprehensive startup metrics
    log.info("🚀 Startup complete - Performance baseline established", {
      totalStartupMs,
      totalBootMs,
      phases: {
        module_imports: STARTUP_TIMINGS.module_imports,
        service_registry: STARTUP_TIMINGS.service_registry,
        database_connect: STARTUP_TIMINGS.database_connect,
        engine_and_bots_init: STARTUP_TIMINGS.engine_and_bots_init,
      },
      memory: {
        initial_rss_mb: Math.round(STARTUP_MEMORY.initial.rss / 1024 / 1024),
        post_database_rss_mb: Math.round(STARTUP_MEMORY.post_database.rss / 1024 / 1024),
        post_engine_rss_mb: Math.round(STARTUP_MEMORY.post_engine_and_bots.rss / 1024 / 1024),
        steady_state_rss_mb: Math.round(STARTUP_MEMORY.steady_state.rss / 1024 / 1024),
        heap_used_mb: Math.round(STARTUP_MEMORY.steady_state.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(STARTUP_MEMORY.steady_state.heapTotal / 1024 / 1024),
      }
    });
    
    // Log memory progression breakdown
    const memProgression = calculateMemoryProgression(STARTUP_MEMORY);
    log.info("📊 Memory Progression Breakdown", memProgression);
    
    // ══════════════════════════════════════════════════════════════════════════
    // LIFECYCLE WEBHOOK: Boot Notification
    // ══════════════════════════════════════════════════════════════════════════
    // Send Discord webhook with boot status (fire-and-forget, non-blocking)
    notifyBoot().catch((error) => {
      log.warn("Lifecycle webhook failed (non-critical)", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    
    // MEMORY PROFILING: Capture detailed heap snapshot after startup
    try {
      const v8 = await import('node:v8');
      const fs = await import('node:fs');
      const path = await import('node:path');
      
      const heapStats = v8.getHeapStatistics();
      const mem = process.memoryUsage();
      
      // Log comprehensive memory breakdown
      log.info("🔬 Post-Startup Memory Analysis", {
        process: {
          rss_mb: Math.round(mem.rss / 1024 / 1024),
          heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
          heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
          external_mb: Math.round(mem.external / 1024 / 1024),
          array_buffers_mb: Math.round(mem.arrayBuffers / 1024 / 1024),
        },
        v8_heap: {
          total_heap_mb: Math.round(heapStats.total_heap_size / 1024 / 1024),
          used_heap_mb: Math.round(heapStats.used_heap_size / 1024 / 1024),
          heap_limit_mb: Math.round(heapStats.heap_size_limit / 1024 / 1024),
          malloced_mb: Math.round(heapStats.malloced_memory / 1024 / 1024),
          external_mb: Math.round(heapStats.external_memory / 1024 / 1024),
        },
        analysis: {
          accounted_for_mb: Math.round((mem.heapTotal + mem.external) / 1024 / 1024),
          mystery_allocation_mb: Math.round((mem.rss - mem.heapTotal - mem.external) / 1024 / 1024),
          heap_utilization_percent: ((mem.heapUsed / mem.heapTotal) * 100).toFixed(1),
        }
      });
      
      // Capture heap snapshot to disk (production only, to avoid local pollution)
      if (process.env.RENDER) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `startup-heap-${timestamp}.heapsnapshot`;
        const storeDir = '/Store';
        const filepath = path.join(storeDir, filename);
        
        try {
          fs.mkdirSync(storeDir, { recursive: true });
          const snapshotPath = v8.writeHeapSnapshot(filepath);
          const snapshotSize = fs.statSync(snapshotPath).size;
          
          log.info("📸 Startup heap snapshot captured", {
            filename,
            size_mb: Math.round(snapshotSize / 1024 / 1024),
            location: storeDir,
          });
        } catch (fsErr) {
          log.warn("Failed to write startup heap snapshot", { error: getErrorMessage(fsErr) });
        }
      }
    } catch (memErr) {
      log.warn("Memory profiling failed", { error: getErrorMessage(memErr) });
    }
    
    // Schedule automatic restart every 12 hours (production only)
    if (process.env.RENDER) {
      scheduleAutoRestart();
    } else {
      log.info("⏰ Auto-restart disabled in local development");
    }
  } catch (error) {
    const message = getErrorMessage(error);
    
    // Determine which bot failed based on error message or type
    const isSecurityError = error instanceof Error && error.message.includes("Security bot");
    const isDiscordError = error instanceof Error && error.message.includes("Discord bot");
    
    if (isSecurityError) {
      setSection("security", {
        title: "Security Bot",
        status: "error",
        metrics: [metric("error", message)],
      });
    }
    if (isDiscordError || !isSecurityError) {
      setSection("discord", {
        title: "Discord Bot",
        status: "error",
        metrics: [metric("error", message)],
      });
    }
    
    setPhase("Startup failed");
    log.error("Bot startup failed", error);
    throw error;
  }
}

// Auto-invoke boot() when run directly as main module
if (import.meta.url === `file://${process.argv[1]}`) {
  boot().catch((err) => {
    log.error("Fatal during boot", err);
    process.exit(1);
  });
} else {
  // Fallback: invoke boot() anyway (Render environment detection)
  boot().catch((err) => {
    log.error("Fatal during boot", err);
    process.exit(1);
  });
}
