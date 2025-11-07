import { createRequire } from "node:module";

import { Prisma, PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

import { loadConfig, recordDatabaseConnectionSuccess, type DatabaseCandidate } from "./config.js";
import { log } from "./log.js";

export type PrismaHeartbeatEvent = {
  ok: boolean;
  /** Timestamp when the heartbeat finished. */
  timestamp: Date;
  /** Latency of the probe in milliseconds, if available. */
  latencyMs: number | null;
  /** True when the heartbeat completed but exceeded the warning threshold. */
  slow: boolean;
  /** Number of consecutive failures encountered so far. */
  consecutiveFailures: number;
  /** Populated when the heartbeat failed. */
  error?: Error;
  /** Origin of the heartbeat sample. */
  source?: "heartbeat" | "startup";
};

type HeartbeatListener = (event: PrismaHeartbeatEvent) => void;

type HeartbeatState = {
  timer: NodeJS.Timeout | null;
  stopped: boolean;
  consecutiveFailures: number;
  options: Required<HeartbeatOptions>;
};

type HeartbeatOptions = {
  intervalMs?: number;
  warnThresholdMs?: number;
  errorThreshold?: number;
};

const HEARTBEAT_DEFAULTS: Required<HeartbeatOptions> = {
  intervalMs: Math.max(Number(process.env.PRISMA_HEARTBEAT_INTERVAL_MS ?? 30_000) || 30_000, 5_000),
  warnThresholdMs: Math.max(Number(process.env.PRISMA_HEARTBEAT_WARN_THRESHOLD_MS ?? 1_000) || 1_000, 100),
  errorThreshold: Math.max(Number(process.env.PRISMA_HEARTBEAT_ERROR_THRESHOLD ?? 3) || 3, 1),
};

const globalPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaConnectPromise?: Promise<void>;
  prismaHeartbeatState?: HeartbeatState;
  prismaHeartbeatListeners?: Set<HeartbeatListener>;
};

const heartbeatListeners: Set<HeartbeatListener> =
  globalPrisma.prismaHeartbeatListeners ?? new Set<HeartbeatListener>();

globalPrisma.prismaHeartbeatListeners = heartbeatListeners;

const ACCELERATE_SCHEME = /^prisma\+/i;
const OPTIMIZE_SCHEME = /^prisma(\+|:\/\/)/i;

function isAccelerateUrl(url: string): boolean {
  return ACCELERATE_SCHEME.test(url);
}

function isOptimizeCompatibleUrl(url: string): boolean {
  return OPTIMIZE_SCHEME.test(url);
}

function resolveAccelerateRuntime(): "node" | "serverless" {
  const hint = (process.env.PRISMA_ACCELERATE_RUNTIME ?? process.env.PRISMA_ACCELERATE_CLIENT ?? "")
    .trim()
    .toLowerCase();
  if (hint === "serverless" || hint === "node") {
    return hint;
  }
  if (hint === "edge") {
    log.warn("PRISMA_ACCELERATE_RUNTIME=edge is deprecated; defaulting to serverless runtime.");
    return "serverless";
  }
  if (hint === "auto") {
    if (
      process.env.PRISMA_ACCELERATE_SERVERLESS === "true" ||
      process.env.PRISMA_ACCELERATE_EDGE === "true" ||
      (process.env.RUNTIME ?? "").toLowerCase().includes("edge") ||
      process.env.VERCEL_EDGE_FUNCTIONS === "1"
    ) {
      return "serverless";
    }
    return "node";
  }
  if (process.env.PRISMA_ACCELERATE_SERVERLESS === "true" || process.env.PRISMA_ACCELERATE_EDGE === "true") {
    return "serverless";
  }
  return "node";
}
function describeTransport(usesAccelerate: boolean, runtime: "node" | "serverless"): string {
  return usesAccelerate ? `accelerate-${runtime}` : "direct";
}

let devPrismaClient: PrismaClient | null = null;
let prodPrismaClient: PrismaClient | null = null;
let localPrismaClient: PrismaClient | null = null;
let prismaClient: PrismaClient; // Legacy reference - points to prod
export let prisma: PrismaClient; // Points to PROD client
export let devPrisma: PrismaClient | null = null; // DEV client
export let localPrisma: PrismaClient | null = null; // LOCAL client (workstation mirror)
let activeCandidate: DatabaseCandidate | null = null;
let lastClientUsesAccelerate = false;
let lastPrismaTransport = "direct";
let devTransport = "unknown";
let prodTransport = "unknown";
let localTransport = "unknown";

type OptimizeExtender = (client: PrismaClient) => PrismaClient;
let optimizeExtender: OptimizeExtender | null = null;

const optimizeApiKey = process.env.OPTIMIZE_API_KEY?.trim();

type OptimizeModule = typeof import("@prisma/extension-optimize");

if (optimizeApiKey) {
  const apiKey = optimizeApiKey;
  const optimizeEndpointRaw = (
    process.env.OPTIMIZE_API_URL ?? process.env.OPTIMIZE_API_ENDPOINT ?? ""
  ).trim();
  let optimizeEndpoint: string | null = null;

  if (optimizeEndpointRaw) {
    try {
      const parsedEndpoint = new URL(optimizeEndpointRaw);
      if (parsedEndpoint.protocol !== "https:") {
        log.warn("Prisma Optimize endpoint must use HTTPS; ignoring override", {
          endpoint: `${parsedEndpoint.protocol}//${parsedEndpoint.host}`,
        });
      } else {
        parsedEndpoint.hash = "";
        const normalized = parsedEndpoint.toString().replace(/\/?$/, "");
        optimizeEndpoint = normalized;
      }
    } catch (error) {
      log.warn("Invalid Prisma Optimize endpoint override; ignoring value", {
        endpoint: optimizeEndpointRaw,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const attachOptimizeModule = (module: Partial<OptimizeModule> | null | undefined): boolean => {
    if (!module) {
      return false;
    }
    const withOptimize = module.withOptimize;
    if (typeof withOptimize !== "function") {
      return false;
    }
    const optimizeOptions: Record<string, unknown> = { apiKey };
    if (optimizeEndpoint) {
      optimizeOptions.endpoint = optimizeEndpoint;
    }
    optimizeExtender = (client: PrismaClient) =>
      client.$extends(withOptimize(optimizeOptions as Parameters<typeof withOptimize>[0])) as unknown as PrismaClient;
    return true;
  };

  let loadError: unknown = null;

  const tryDynamicImport = async (): Promise<boolean> => {
    try {
      const module = await import("@prisma/extension-optimize");
      if (attachOptimizeModule(module)) {
        loadError = null;
        return true;
      }
      loadError = new Error("withOptimize export is unavailable");
    } catch (error) {
      loadError = error;
    }
    return false;
  };

  const tryRequire = (): boolean => {
    try {
      const require = createRequire(import.meta.url);
      const module = require("@prisma/extension-optimize") as OptimizeModule;
      if (attachOptimizeModule(module)) {
        loadError = null;
        return true;
      }
      loadError = new Error("withOptimize export is unavailable");
    } catch (error) {
      loadError = error;
    }
    return false;
  };

  const loaded = (await tryDynamicImport()) || tryRequire();

  if (!loaded && loadError) {
    const message = loadError instanceof Error ? loadError.message : String(loadError);
    log.warn("Prisma Optimize disabled; failed to load extension", { error: message });
    optimizeExtender = null;
  }
}

function emitHeartbeat(event: PrismaHeartbeatEvent): void {
  for (const listener of heartbeatListeners) {
    try {
      listener(event);
    } catch (error) {
      log.warn("Prisma heartbeat listener threw", {
        listenerError: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export function onPrismaHeartbeat(listener: HeartbeatListener): () => void {
  heartbeatListeners.add(listener);
  return () => {
    heartbeatListeners.delete(listener);
  };
}

function coerceOptions(options?: HeartbeatOptions): Required<HeartbeatOptions> {
  if (!options) {
    return HEARTBEAT_DEFAULTS;
  }
  return {
    intervalMs:
      Math.max(Number(options.intervalMs ?? HEARTBEAT_DEFAULTS.intervalMs) || HEARTBEAT_DEFAULTS.intervalMs, 5_000),
    warnThresholdMs:
      Math.max(Number(options.warnThresholdMs ?? HEARTBEAT_DEFAULTS.warnThresholdMs) || HEARTBEAT_DEFAULTS.warnThresholdMs, 100),
    errorThreshold:
      Math.max(Number(options.errorThreshold ?? HEARTBEAT_DEFAULTS.errorThreshold) || HEARTBEAT_DEFAULTS.errorThreshold, 1),
  };
}

async function performHeartbeat(state: HeartbeatState, options: Required<HeartbeatOptions>): Promise<void> {
  const start = process.hrtime.bigint();
  try {
    await prisma.$queryRaw(Prisma.sql`SELECT 1`);
    const latencyMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const slow = latencyMs >= options.warnThresholdMs;
    if (slow) {
      log.warn("Prisma heartbeat slow", {
        latencyMs: Number(latencyMs.toFixed(2)),
        thresholdMs: options.warnThresholdMs,
      });
    } else {
      log.debug("Prisma heartbeat ok", {
        latencyMs: Number(latencyMs.toFixed(2)),
      });
    }

    state.consecutiveFailures = 0;
    const event: PrismaHeartbeatEvent = {
      ok: true,
      timestamp: new Date(),
      latencyMs,
      slow,
      consecutiveFailures: state.consecutiveFailures,
      source: "heartbeat",
    };
    emitHeartbeat(event);
  } catch (rawError) {
    state.consecutiveFailures += 1;
    const error = rawError instanceof Error ? rawError : new Error(String(rawError));
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const meta = {
      consecutiveFailures: state.consecutiveFailures,
      durationMs: Number.isFinite(durationMs) ? Number(durationMs.toFixed(2)) : undefined,
    };

    if (state.consecutiveFailures >= options.errorThreshold) {
      log.error("Prisma heartbeat failed", error, meta);
    } else {
      log.warn("Prisma heartbeat failed", {
        ...meta,
        error: error.message,
      });
    }

    emitHeartbeat({
      ok: false,
      timestamp: new Date(),
      latencyMs: Number.isFinite(durationMs) ? durationMs : null,
      slow: false,
      consecutiveFailures: state.consecutiveFailures,
      error,
      source: "heartbeat",
    });
  }
}

function scheduleHeartbeat(state: HeartbeatState): void {
  if (state.stopped) {
    return;
  }
  state.timer = setTimeout(async () => {
    try {
      await performHeartbeat(state, state.options);
    } finally {
      scheduleHeartbeat(state);
    }
  }, state.options.intervalMs);
  state.timer.unref?.();
}

export function startPrismaHeartbeat(options?: HeartbeatOptions): () => void {
  if (process.env.DISABLE_PRISMA_HEARTBEAT === "true") {
    log.info("Prisma heartbeat disabled via environment variable");
    return () => {};
  }

  const existing = globalPrisma.prismaHeartbeatState;
  if (existing && !existing.stopped) {
    return () => stopPrismaHeartbeat();
  }

  const resolved = coerceOptions(options);
  const state: HeartbeatState = {
    timer: null,
    stopped: false,
    consecutiveFailures: existing?.consecutiveFailures ?? 0,
    options: resolved,
  };

  globalPrisma.prismaHeartbeatState = state;

  // Kick off the first heartbeat immediately for quicker feedback.
  void performHeartbeat(state, state.options).finally(() => {
    if (!state.stopped) {
      scheduleHeartbeat(state);
    }
  });

  return () => stopPrismaHeartbeat();
}

export function stopPrismaHeartbeat(): void {
  const state = globalPrisma.prismaHeartbeatState;
  if (!state || state.stopped) {
    return;
  }
  state.stopped = true;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
}

function validateDatabaseUrl(url: string): void {
  if (!url) {
    throw new Error("DATABASE_URL must be configured before Prisma initializes.");
  }

  try {
    new URL(url);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
}

function createClient(candidate: DatabaseCandidate, nodeEnv: string): PrismaClient {
  validateDatabaseUrl(candidate.url);
  process.env.DATABASE_URL = candidate.url;
  process.env.DATABASE_CONNECTION_SOURCE = candidate.source;

  const usesAccelerate = isAccelerateUrl(candidate.url);
  const runtime = usesAccelerate ? resolveAccelerateRuntime() : "node";
  const PrismaCtor = PrismaClient;
  const logLevels = nodeEnv === "development" ? ["warn", "error"] : ["error"];

  const baseOptions = usesAccelerate
    ? { log: logLevels, datasourceUrl: candidate.url }
    : {
        log: logLevels,
        datasources: {
          db: {
            url: candidate.url,
          },
        },
      };

  const baseClient = new PrismaCtor(baseOptions as Prisma.PrismaClientOptions) as PrismaClient;
  let client = baseClient;

  if (optimizeExtender && isOptimizeCompatibleUrl(candidate.url)) {
    try {
      client = optimizeExtender(client);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn("Prisma Optimize extension attach failed", { error: message });
    }
  } else if (optimizeExtender) {
    const meta: Record<string, unknown> = {
      reason: "incompatible-url",
      source: candidate.source,
    };
    if (candidate.isFallback) {
      meta.fallback = true;
    }
    log.debug("Prisma Optimize skipped for datasource", meta);
  }

  if (usesAccelerate) {
    // Attach Accelerate so downstream calls can opt into cacheStrategy TTLs when hitting the data proxy.
    client = client.$extends(withAccelerate()) as unknown as PrismaClient;
  }

  if (usesAccelerate) {
    process.env.PRISMA_CLIENT_ENGINE_TYPE = "dataproxy";
  } else {
    delete process.env.PRISMA_CLIENT_ENGINE_TYPE;
  }

  globalPrisma.prisma = client;
  lastClientUsesAccelerate = usesAccelerate;
  lastPrismaTransport = describeTransport(usesAccelerate, runtime);
  return client;
}

function coerceRetryValue(raw: string | undefined, fallback: number, minimum: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(parsed, minimum);
}

function delayWithJitter(baseMs: number): Promise<void> {
  const jitter = baseMs * 0.25 * Math.random();
  const total = baseMs + jitter;
  return new Promise((resolve) => {
    setTimeout(resolve, total);
  });
}

async function attemptCandidateConnection(candidate: DatabaseCandidate, attempt: number): Promise<void> {
  const warnThreshold = HEARTBEAT_DEFAULTS.warnThresholdMs;
  const start = process.hrtime.bigint();
  let latencyMs: number | null = null;
  let connectError: unknown = null;

  try {
    await prismaClient.$connect();
    latencyMs = Number(process.hrtime.bigint() - start) / 1_000_000;
  } catch (error) {
    if (!lastClientUsesAccelerate) {
      throw error;
    }
    connectError = error;
  }

  if (latencyMs === null) {
    const probeStart = process.hrtime.bigint();
    try {
      await prismaClient.$queryRaw(Prisma.sql`SELECT 1`);
    } catch (probeError) {
      if (connectError instanceof Error) {
        log.warn("Accelerate connect warning", {
          warning: connectError.message,
        });
      }
      throw probeError;
    }
    latencyMs = Number(process.hrtime.bigint() - probeStart) / 1_000_000;
  }

  const slow = latencyMs >= warnThreshold;
  const runtimeConfig = loadConfig();
  const meta: Record<string, unknown> = {
    attempt,
    latencyMs: Number(latencyMs.toFixed(2)),
    directUrlConfigured: Boolean(process.env.RENDER_DB_INTERNAL_URL?.trim() || process.env.RENDER_DB_EXTERNAL_URL?.trim()),
    databaseSource: candidate.source,
    connectionMode: runtimeConfig.databaseConnectionMode,
    transport: lastPrismaTransport,
  };

  if (candidate.isFallback) {
    meta.fallback = true;
  }

  if (connectError instanceof Error && lastClientUsesAccelerate) {
    meta.connectionWarning = connectError.message;
  }

  if (attempt > 0) {
    log.info("Prisma connected after retry", meta);
  } else {
    log.info("Prisma connected", meta);
  }

  emitHeartbeat({
    ok: true,
    timestamp: new Date(),
    latencyMs,
    slow,
    consecutiveFailures: attempt,
    source: "startup",
  });

  recordDatabaseConnectionSuccess(candidate.source);
}

async function disconnectPrismaClient(): Promise<void> {
  if (prismaClient) {
    try {
      await prismaClient.$disconnect();
    } catch (error) {
      log.warn("Ignoring Prisma disconnect error during datasource switch", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function connectAcrossCandidates(): Promise<void> {
  const runtimeConfig = loadConfig();
  const candidates = runtimeConfig.databaseCandidates.length
    ? runtimeConfig.databaseCandidates
    : [{ url: runtimeConfig.databaseUrl, source: runtimeConfig.databaseUrlSource }];

  if (!candidates.length) {
    throw new Error("No database candidates available for Prisma connection.");
  }

  const baseDelayMs = coerceRetryValue(process.env.PRISMA_CONNECT_RETRY_DELAY_MS, 500, 50);
  const maxDelayMs = coerceRetryValue(process.env.PRISMA_CONNECT_MAX_DELAY_MS, 5_000, baseDelayMs);
  const maxAttemptsEnv = coerceRetryValue(
    process.env.PRISMA_CONNECT_MAX_ATTEMPTS,
    Math.max(candidates.length * 4, 4),
    candidates.length
  );
  const maxAttempts = Math.max(Math.trunc(maxAttemptsEnv), candidates.length);

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxAttempts) {
    const candidate = candidates[attempt % candidates.length];
    if (!candidate?.url) {
      attempt += 1;
      continue;
    }

    if (!activeCandidate || activeCandidate.url !== candidate.url) {
      await disconnectPrismaClient();
      prismaClient = createClient(candidate, runtimeConfig.nodeEnv);
      prisma = prismaClient;
      globalPrisma.prisma = prismaClient;
      activeCandidate = candidate;
    }

    runtimeConfig.databaseUrl = candidate.url;
    runtimeConfig.databaseUrlSource = candidate.source;
    runtimeConfig.databasePreferenceSource = candidate.source;

    try {
      await attemptCandidateConnection(candidate, attempt);
      return;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;
      const nextCandidate = candidates[(attempt + 1) % candidates.length]?.source ?? "none";
      log.warn("Prisma connection attempt failed; switching candidate", {
        attempt,
        candidateSource: candidate.source,
        candidateFallback: Boolean(candidate.isFallback),
        error: err.message,
        nextCandidate,
      });

      attempt += 1;
      if (attempt >= maxAttempts) {
        break;
      }

      const roundsCompleted = Math.floor(attempt / candidates.length);
      const backoffBase = Math.min(baseDelayMs * Math.max(1, roundsCompleted), maxDelayMs);
      if (backoffBase > 0) {
        await delayWithJitter(backoffBase);
      }
    }
  }

  log.error("Prisma connection failed after alternating candidates", lastError ?? new Error("No candidates attempted"), {
    attempts: attempt,
    candidates: candidates.map((candidate) => ({ source: candidate.source, fallback: Boolean(candidate.isFallback) })),
  });

  if (lastError) {
    throw lastError;
  }
  throw new Error("Prisma connection failed and no error detail was captured.");
}

const bootstrapConfig = loadConfig();
const initialCandidate: DatabaseCandidate = bootstrapConfig.databaseCandidates[0] ?? {
  url: bootstrapConfig.databaseUrl,
  source: bootstrapConfig.databaseUrlSource,
};

validateDatabaseUrl(initialCandidate.url);

prismaClient = createClient(initialCandidate, bootstrapConfig.nodeEnv);
prisma = prismaClient;
activeCandidate = initialCandidate;

export async function ensurePrisma(): Promise<PrismaClient> {
  await globalPrisma.prismaConnectPromise;
  return prisma;
}

export function getPrismaTransport(): string {
  return lastPrismaTransport;
}

/**
 * Check LOCAL database health and version.
 * Returns connection status and version fingerprint if available.
 */
export async function checkLocalHealth(): Promise<{
  connected: boolean;
  version: string | null;
  error?: Error;
}> {
  if (!localPrismaClient) {
    return { connected: false, version: null };
  }
  
  try {
    // Test connection with simple query
    await localPrismaClient.$queryRaw(Prisma.sql`SELECT 1`);
    
    // Try to get version from db_version table if it exists
    try {
      const versionRecord = await localPrismaClient.$queryRaw<Array<{ fingerprint: string }>>(
        Prisma.sql`SELECT fingerprint FROM db_version WHERE environment = 'LOCAL' ORDER BY updated_at DESC LIMIT 1`
      );
      const version = versionRecord?.[0]?.fingerprint ?? null;
      return { connected: true, version };
    } catch {
      // db_version table might not exist yet
      return { connected: true, version: null };
    }
  } catch (error) {
    return {
      connected: false,
      version: null,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Validate LOCAL database version against required minimum.
 * Returns true if LOCAL version >= required, false otherwise.
 * Used for failover logic to ensure Local mirror is sufficiently up-to-date.
 */
export async function validateLocalVersion(requiredVersion: string | null): Promise<boolean> {
  if (!requiredVersion) {
    // No version requirement - allow failover
    return true;
  }
  
  const health = await checkLocalHealth();
  if (!health.connected || !health.version) {
    // Cannot validate version if not connected or version unknown
    return false;
  }
  
  // Version validation: exact match or LOCAL is ahead
  // In practice, use compareVersions from db-replication/version.ts
  // For now, simple equality check
  return health.version === requiredVersion;
}

export type DatabaseStats = {
  source: string;
  transport: string;
  latency: number | null;
  status: string;
  version?: string; // Version fingerprint for replication monitoring
};

export type TripleDatabaseStats = {
  dev: DatabaseStats;
  prod: DatabaseStats;
  local: DatabaseStats;
};

// Legacy type for backward compatibility
export type DualDatabaseStats = TripleDatabaseStats;

let lastHeartbeatEvent: PrismaHeartbeatEvent | null = null;
let lastDevHeartbeatEvent: PrismaHeartbeatEvent | null = null;
let lastProdHeartbeatEvent: PrismaHeartbeatEvent | null = null;
let lastLocalHeartbeatEvent: PrismaHeartbeatEvent | null = null;

onPrismaHeartbeat((event) => {
  lastHeartbeatEvent = event;
  // Route heartbeats based on which client triggered them
  // For now, assume main heartbeat goes to prod
  lastProdHeartbeatEvent = event;
});

function computeStatus(heartbeat: PrismaHeartbeatEvent | null): string {
  if (!heartbeat) return "unknown";
  if (heartbeat.ok) {
    return heartbeat.slow ? "degraded" : "healthy";
  }
  return heartbeat.consecutiveFailures >= HEARTBEAT_DEFAULTS.errorThreshold ? "error" : "reconnecting";
}

export function getDatabaseStats(): TripleDatabaseStats {
  // PROD stats (main connection)
  const prodCandidate = activeCandidate;
  const prodSource = prodCandidate?.source ?? "unknown";
  const prodLatency = lastProdHeartbeatEvent?.latencyMs ?? null;
  const prodStatus = prodPrismaClient 
    ? (lastProdHeartbeatEvent ? computeStatus(lastProdHeartbeatEvent) : "initializing")
    : "offline";
  
  // DEV stats (secondary connection)
  const devSource = process.env.RENDER_DB_INTERNAL_URL ? "internal" : process.env.RENDER_DB_EXTERNAL_URL ? "external" : "unknown";
  const devLatency = lastDevHeartbeatEvent?.latencyMs ?? null;
  const devStatus = devPrismaClient 
    ? (lastDevHeartbeatEvent ? computeStatus(lastDevHeartbeatEvent) : "initializing")
    : "offline";
  
  // LOCAL stats (tertiary connection - workstation mirror)
  const localSource = process.env.DATABASE_LOCAL_URL ? "local" : "unknown";
  const localLatency = lastLocalHeartbeatEvent?.latencyMs ?? null;
  const localStatus = localPrismaClient
    ? (lastLocalHeartbeatEvent ? computeStatus(lastLocalHeartbeatEvent) : "initializing")
    : "offline";
  
  return {
    dev: {
      source: devSource,
      transport: devTransport,
      latency: devLatency,
      status: devStatus,
    },
    prod: {
      source: prodSource,
      transport: prodTransport,
      latency: prodLatency,
      status: prodStatus,
    },
    local: {
      source: localSource,
      transport: localTransport,
      latency: localLatency,
      status: localStatus,
    },
  };
}

// Initialize DEV client separately
async function initializeDevClient(): Promise<void> {
  const devUrl = process.env.RENDER_DB_INTERNAL_URL?.trim() || process.env.RENDER_DB_EXTERNAL_URL?.trim();
  if (!devUrl) {
    log.info("DEV database connection skipped", { reason: "no RENDER_DB_INTERNAL_URL or RENDER_DB_EXTERNAL_URL" });
    return;
  }
  
  try {
    const usesAccelerate = /^prisma\+/i.test(devUrl);
    devTransport = usesAccelerate ? "accelerate-node" : "direct";
    
    // For direct PostgreSQL URLs, we need to configure differently
    if (usesAccelerate) {
      const baseOptions = {
        log: ["error"] as any,
        datasourceUrl: devUrl,
      };
      devPrismaClient = new PrismaClient(baseOptions);
      devPrismaClient = devPrismaClient.$extends(withAccelerate()) as unknown as PrismaClient;
    } else {
      // Direct connection - set DATABASE_URL temporarily for this client
      const originalDatabaseUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = devUrl;
      
      const baseOptions = {
        log: ["error"] as any,
      };
      
      devPrismaClient = new PrismaClient(baseOptions);
      
      // Restore original DATABASE_URL
      if (originalDatabaseUrl) {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
    }
    
    devPrisma = devPrismaClient;
    
    // Connect and probe
    await devPrismaClient.$connect();
    const start = process.hrtime.bigint();
    await devPrismaClient.$queryRaw(Prisma.sql`SELECT 1`);
    const latencyMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    
    lastDevHeartbeatEvent = {
      ok: true,
      timestamp: new Date(),
      latencyMs,
      slow: latencyMs >= HEARTBEAT_DEFAULTS.warnThresholdMs,
      consecutiveFailures: 0,
      source: "startup",
    };
    
    log.info("DEV Prisma client connected", {
      latencyMs: Number(latencyMs.toFixed(2)),
      transport: devTransport,
    });
    
    // Start DEV heartbeat
    setInterval(async () => {
      if (!devPrismaClient) return;
      const probeStart = process.hrtime.bigint();
      try {
        await devPrismaClient.$queryRaw(Prisma.sql`SELECT 1`);
        const probeLatency = Number(process.hrtime.bigint() - probeStart) / 1_000_000;
        lastDevHeartbeatEvent = {
          ok: true,
          timestamp: new Date(),
          latencyMs: probeLatency,
          slow: probeLatency >= HEARTBEAT_DEFAULTS.warnThresholdMs,
          consecutiveFailures: 0,
          source: "heartbeat",
        };
      } catch (error) {
        const failures = (lastDevHeartbeatEvent?.consecutiveFailures ?? 0) + 1;
        lastDevHeartbeatEvent = {
          ok: false,
          timestamp: new Date(),
          latencyMs: null,
          slow: false,
          consecutiveFailures: failures,
          error: error instanceof Error ? error : new Error(String(error)),
          source: "heartbeat",
        };
      }
    }, HEARTBEAT_DEFAULTS.intervalMs).unref();
    
  } catch (error) {
    log.warn("DEV Prisma client connection failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    lastDevHeartbeatEvent = {
      ok: false,
      timestamp: new Date(),
      latencyMs: null,
      slow: false,
      consecutiveFailures: 1,
      error: error instanceof Error ? error : new Error(String(error)),
      source: "startup",
    };
  }
}

// Initialize LOCAL client (workstation mirror)
async function initializeLocalClient(): Promise<void> {
  const localUrl = process.env.DATABASE_LOCAL_URL?.trim();
  if (!localUrl) {
    log.info("LOCAL database connection skipped", { reason: "no DATABASE_LOCAL_URL" });
    return;
  }
  
  try {
    const usesAccelerate = /^prisma\+/i.test(localUrl);
    localTransport = usesAccelerate ? "accelerate-node" : "direct";
    
    // For direct PostgreSQL URLs, configure client with temporary DATABASE_URL override
    if (usesAccelerate) {
      const baseOptions = {
        log: ["error"] as any,
        datasourceUrl: localUrl,
      };
      localPrismaClient = new PrismaClient(baseOptions);
      localPrismaClient = localPrismaClient.$extends(withAccelerate()) as unknown as PrismaClient;
    } else {
      // Direct connection - set DATABASE_URL temporarily for this client
      const originalDatabaseUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = localUrl;
      
      const baseOptions = {
        log: ["error"] as any,
      };
      
      localPrismaClient = new PrismaClient(baseOptions);
      
      // Restore original DATABASE_URL
      if (originalDatabaseUrl) {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
    }
    
    localPrisma = localPrismaClient;
    
    // Connect and probe
    await localPrismaClient.$connect();
    const start = process.hrtime.bigint();
    await localPrismaClient.$queryRaw(Prisma.sql`SELECT 1`);
    const latencyMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    
    lastLocalHeartbeatEvent = {
      ok: true,
      timestamp: new Date(),
      latencyMs,
      slow: latencyMs >= HEARTBEAT_DEFAULTS.warnThresholdMs,
      consecutiveFailures: 0,
      source: "startup",
    };
    
    log.info("LOCAL Prisma client connected", {
      latencyMs: Number(latencyMs.toFixed(2)),
      transport: localTransport,
    });
    
    // Start LOCAL heartbeat
    setInterval(async () => {
      if (!localPrismaClient) return;
      const probeStart = process.hrtime.bigint();
      try {
        await localPrismaClient.$queryRaw(Prisma.sql`SELECT 1`);
        const probeLatency = Number(process.hrtime.bigint() - probeStart) / 1_000_000;
        lastLocalHeartbeatEvent = {
          ok: true,
          timestamp: new Date(),
          latencyMs: probeLatency,
          slow: probeLatency >= HEARTBEAT_DEFAULTS.warnThresholdMs,
          consecutiveFailures: 0,
          source: "heartbeat",
        };
      } catch (error) {
        const failures = (lastLocalHeartbeatEvent?.consecutiveFailures ?? 0) + 1;
        lastLocalHeartbeatEvent = {
          ok: false,
          timestamp: new Date(),
          latencyMs: null,
          slow: false,
          consecutiveFailures: failures,
          error: error instanceof Error ? error : new Error(String(error)),
          source: "heartbeat",
        };
      }
    }, HEARTBEAT_DEFAULTS.intervalMs).unref();
    
  } catch (error) {
    log.warn("LOCAL Prisma client connection failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    lastLocalHeartbeatEvent = {
      ok: false,
      timestamp: new Date(),
      latencyMs: null,
      slow: false,
      consecutiveFailures: 1,
      error: error instanceof Error ? error : new Error(String(error)),
      source: "startup",
    };
  }
}

// Initialize all three clients
if (!globalPrisma.prismaConnectPromise) {
  const skipInitialConnect = process.env.PRISMA_SKIP_INITIAL_CONNECT === "true";
  if (skipInitialConnect) {
    log.info("Skipping Prisma initial connection", {
      reason: "PRISMA_SKIP_INITIAL_CONNECT",
    });
    globalPrisma.prismaConnectPromise = Promise.resolve();
  } else {
    globalPrisma.prismaConnectPromise = Promise.all([
      connectAcrossCandidates().catch((error) => {
        globalPrisma.prisma = undefined;
        throw error;
      }),
      initializeDevClient(),
      initializeLocalClient(),
    ]).then(async () => {
      prodPrismaClient = prismaClient;
      prodTransport = lastPrismaTransport;
      
      // Wait for heartbeat listeners to process initial events
      // This ensures getDatabaseStats() returns populated stats immediately after ensurePrisma() resolves
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }
}
