import { createRequire } from "node:module";

import { Prisma, PrismaClient } from "@prisma/client";

import { loadConfig, recordDatabaseConnectionSuccess, type DatabaseCandidate } from "./config.js";
import { log } from "./log.js";
import { delayWithJitter } from "./utils/async-utils.js";

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

// 2-NODE CLUSTER: Direct PostgreSQL only
let devPrismaClient: PrismaClient | null = null;
let prodPrismaClient: PrismaClient | null = null;
let onPremiseDevPrismaClient: PrismaClient | null = null;
let onPremiseExperimentPrismaClient: PrismaClient | null = null;
let prismaClient: PrismaClient; // Legacy reference - points to CLOUD-PROD-RUNTIME
export let prisma: PrismaClient; // Points to CLOUD-PROD-RUNTIME client
export let devPrisma: PrismaClient | null = null; // CLOUD-DEV-MASTER client
export let onPremiseDevPrisma: PrismaClient | null = null; // ONPREMISE-DEV-PRIMARY client (workstation development)
export let onPremiseExperimentPrisma: PrismaClient | null = null; // ONPREMISE-DEV-EXPERIMENT client (migration testing)
let activeCandidate: DatabaseCandidate | null = null;
let lastPrismaTransport = "direct";
let devTransport = "unknown";
let prodTransport = "unknown";
let onPremiseDevTransport = "unknown";
let onPremiseExperimentTransport = "unknown";

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

  // 2-NODE CLUSTER: Direct PostgreSQL connections only
  const PrismaCtor = PrismaClient;
  const logLevels = nodeEnv === "development" ? ["warn", "error"] : ["error"];

  const baseOptions = {
    log: logLevels,
    datasources: {
      db: {
        url: candidate.url,
      },
    },
  };

  const baseClient = new PrismaCtor(baseOptions as Prisma.PrismaClientOptions) as PrismaClient;
  let client = baseClient;

  // 2-NODE CLUSTER: Always use library engine for direct connections
  delete process.env.PRISMA_CLIENT_ENGINE_TYPE;

  globalPrisma.prisma = client;
  lastPrismaTransport = "direct";
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

async function attemptCandidateConnection(candidate: DatabaseCandidate, attempt: number): Promise<void> {
  const warnThreshold = HEARTBEAT_DEFAULTS.warnThresholdMs;
  const start = process.hrtime.bigint();

  // 2-NODE CLUSTER: Direct PostgreSQL connection
  await prismaClient.$connect();
  const latencyMs = Number(process.hrtime.bigint() - start) / 1_000_000;

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
 * Check ONPREMISE-DEV-PRIMARY database health and version.
 * Returns connection status and version fingerprint if available.
 */
export async function checkOnPremiseDevHealth(): Promise<{
  connected: boolean;
  version: string | null;
  error?: Error;
}> {
  if (!onPremiseDevPrismaClient) {
    return { connected: false, version: null };
  }
  
  try {
    // Test connection with simple query
    await onPremiseDevPrismaClient.$queryRaw(Prisma.sql`SELECT 1`);
    
    // Try to get version from db_version table if it exists
    try {
      const versionRecord = await onPremiseDevPrismaClient.$queryRaw<Array<{ fingerprint: string }>>(
        Prisma.sql`SELECT fingerprint FROM db_version WHERE environment = 'ONPREMISE_DEV' ORDER BY updated_at DESC LIMIT 1`
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
 * Validate ONPREMISE-DEV-PRIMARY database version against required minimum.
 * Returns true if ONPREMISE version >= required, false otherwise.
 * Used for failover logic to ensure workstation mirror is sufficiently up-to-date.
 */
export async function validateOnPremiseDevVersion(requiredVersion: string | null): Promise<boolean> {
  if (!requiredVersion) {
    // No version requirement - allow failover
    return true;
  }
  
  const health = await checkOnPremiseDevHealth();
  if (!health.connected || !health.version) {
    // Cannot validate version if not connected or version unknown
    return false;
  }
  
  // Version validation: exact match or ONPREMISE is ahead
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
  onPremiseDev: DatabaseStats;
};

export type QuadDatabaseStats = {
  dev: DatabaseStats;
  prod: DatabaseStats;
  onPremiseDev: DatabaseStats;
  onPremiseExperiment: DatabaseStats;
};

export type QuintupleDatabaseStats = QuadDatabaseStats; // Alias for future expansion

// Heartbeat event tracking (prefixed with _ to indicate reserved for future monitoring)
let _lastHeartbeatEvent: PrismaHeartbeatEvent | null = null;
let lastDevHeartbeatEvent: PrismaHeartbeatEvent | null = null;
let lastProdHeartbeatEvent: PrismaHeartbeatEvent | null = null;
let lastOnPremiseDevHeartbeatEvent: PrismaHeartbeatEvent | null = null;
let lastOnPremiseExperimentHeartbeatEvent: PrismaHeartbeatEvent | null = null;

onPrismaHeartbeat((event) => {
  _lastHeartbeatEvent = event;
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

export function getDatabaseStats(): QuadDatabaseStats {
  // CLOUD-PROD-RUNTIME stats (main connection)
  const prodCandidate = activeCandidate;
  const prodSource = prodCandidate?.source ?? "unknown";
  const prodLatency = lastProdHeartbeatEvent?.latencyMs ?? null;
  const prodStatus = prodPrismaClient 
    ? (lastProdHeartbeatEvent ? computeStatus(lastProdHeartbeatEvent) : "initializing")
    : "offline";
  
  // CLOUD-DEV-MASTER stats (secondary connection - schema source of truth)
  const devSource = process.env.RENDER_DB_INTERNAL_URL ? "internal" : process.env.RENDER_DB_EXTERNAL_URL ? "external" : "unknown";
  const devLatency = lastDevHeartbeatEvent?.latencyMs ?? null;
  const devStatus = devPrismaClient 
    ? (lastDevHeartbeatEvent ? computeStatus(lastDevHeartbeatEvent) : "initializing")
    : "offline";
  
  // ONPREMISE-DEV-PRIMARY stats (tertiary connection - workstation development)
  const onPremiseDevSource = process.env.DATABASE_ONPREMISE_DEV_PRIMARY ? "onpremise-dev" : "unknown";
  const onPremiseDevLatency = lastOnPremiseDevHeartbeatEvent?.latencyMs ?? null;
  const onPremiseDevStatus = onPremiseDevPrismaClient
    ? (lastOnPremiseDevHeartbeatEvent ? computeStatus(lastOnPremiseDevHeartbeatEvent) : "initializing")
    : "offline";
  
  // ONPREMISE-DEV-EXPERIMENT stats (quaternary connection - migration testing)
  const onPremiseExperimentSource = process.env.DATABASE_ONPREMISE_DEV_EXPERIMENT ? "onpremise-experiment" : "unknown";
  const onPremiseExperimentLatency = lastOnPremiseExperimentHeartbeatEvent?.latencyMs ?? null;
  const onPremiseExperimentStatus = onPremiseExperimentPrismaClient
    ? (lastOnPremiseExperimentHeartbeatEvent ? computeStatus(lastOnPremiseExperimentHeartbeatEvent) : "initializing")
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
    onPremiseDev: {
      source: onPremiseDevSource,
      transport: onPremiseDevTransport,
      latency: onPremiseDevLatency,
      status: onPremiseDevStatus,
    },
    onPremiseExperiment: {
      source: onPremiseExperimentSource,
      transport: onPremiseExperimentTransport,
      latency: onPremiseExperimentLatency,
      status: onPremiseExperimentStatus,
    },
  };
}

// Initialize CLOUD-DEV-MASTER client (MASTER database - source of truth for migrations)
async function initializeDevClient(): Promise<void> {
  const devUrl = process.env.DEV_DATABASE_URL?.trim() || 
                 process.env.RENDER_DB_EXTERNAL_URL?.trim() || 
                 process.env.RENDER_DB_INTERNAL_URL?.trim();
  if (!devUrl) {
    log.info("DEV database connection skipped", { reason: "no DEV_DATABASE_URL, RENDER_DB_EXTERNAL_URL, or RENDER_DB_INTERNAL_URL" });
    return;
  }
  
  try {
    // 2-NODE CLUSTER: Always use direct PostgreSQL connections
    devTransport = "direct";
    
    // PRISMA INTERNAL REQUIREMENT: Temporarily set DATABASE_URL for PrismaClient constructor
    // Prisma requires process.env.DATABASE_URL at instantiation time, even though we use direct URLs
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = devUrl;
    
    const baseOptions = {
      log: ["error"] as any,
    };
    
    devPrismaClient = new PrismaClient(baseOptions);
    
    // Restore original DATABASE_URL after Prisma client creation
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
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
    
    log.info("DEV Prisma client connected (MASTER)", {
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

// Initialize ONPREMISE-DEV-PRIMARY client (workstation development database)
async function initializeOnPremiseDevClient(): Promise<void> {
  const onPremiseDevUrl = process.env.PROD_DATABASE_URL?.trim() || process.env.DATABASE_ONPREMISE_DEV_PRIMARY?.trim();
  if (!onPremiseDevUrl) {
    log.info("ONPREMISE-DEV-PRIMARY database connection skipped", { reason: "no PROD_DATABASE_URL or DATABASE_ONPREMISE_DEV_PRIMARY" });
    return;
  }
  
  try {
    // 2-NODE CLUSTER: Always use direct PostgreSQL connections
    prodTransport = "direct";
    
    // PRISMA INTERNAL REQUIREMENT: Temporarily set DATABASE_URL for PrismaClient constructor
    // Prisma requires process.env.DATABASE_URL at instantiation time, even though we use direct URLs
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = onPremiseDevUrl;
    
    const baseOptions = {
      log: ["error"] as any,
    };
    
    prodPrismaClient = new PrismaClient(baseOptions);
    
    // Restore original DATABASE_URL after Prisma client creation
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    
    prisma = prodPrismaClient;
    
    // Connect and probe
    await prodPrismaClient.$connect();
    const start = process.hrtime.bigint();
    await prodPrismaClient.$queryRaw(Prisma.sql`SELECT 1`);
    const latencyMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    
    lastOnPremiseDevHeartbeatEvent = {
      ok: true,
      timestamp: new Date(),
      latencyMs,
      slow: latencyMs >= HEARTBEAT_DEFAULTS.warnThresholdMs,
      consecutiveFailures: 0,
      source: "startup",
    };
    
    log.info("ONPREMISE-DEV-PRIMARY Prisma client connected", {
      latencyMs: Number(latencyMs.toFixed(2)),
      transport: onPremiseDevTransport,
    });
    
    // Start ONPREMISE-DEV-PRIMARY heartbeat
    setInterval(async () => {
      if (!onPremiseDevPrismaClient) return;
      const probeStart = process.hrtime.bigint();
      try {
        await onPremiseDevPrismaClient.$queryRaw(Prisma.sql`SELECT 1`);
        const probeLatency = Number(process.hrtime.bigint() - probeStart) / 1_000_000;
        lastOnPremiseDevHeartbeatEvent = {
          ok: true,
          timestamp: new Date(),
          latencyMs: probeLatency,
          slow: probeLatency >= HEARTBEAT_DEFAULTS.warnThresholdMs,
          consecutiveFailures: 0,
          source: "heartbeat",
        };
      } catch (error) {
        const failures = (lastOnPremiseDevHeartbeatEvent?.consecutiveFailures ?? 0) + 1;
        lastOnPremiseDevHeartbeatEvent = {
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
    log.warn("ONPREMISE-DEV-PRIMARY Prisma client connection failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    lastOnPremiseDevHeartbeatEvent = {
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

// Initialize ONPREMISE-DEV-EXPERIMENT client (workstation migration testing database)
async function initializeOnPremiseExperimentClient(): Promise<void> {
  const onPremiseExperimentUrl = process.env.DATABASE_ONPREMISE_DEV_EXPERIMENT?.trim();
  if (!onPremiseExperimentUrl) {
    log.info("ONPREMISE-DEV-EXPERIMENT database connection skipped", { reason: "no DATABASE_ONPREMISE_DEV_EXPERIMENT" });
    return;
  }
  
  try {
    // 2-NODE CLUSTER: Always use direct PostgreSQL connections
    onPremiseExperimentTransport = "direct";
    
    // PRISMA INTERNAL REQUIREMENT: Temporarily set DATABASE_URL for PrismaClient constructor
    // Prisma requires process.env.DATABASE_URL at instantiation time, even though we use direct URLs
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = onPremiseExperimentUrl;
    
    const baseOptions = {
      log: ["error"] as any,
    };
    
    onPremiseExperimentPrismaClient = new PrismaClient(baseOptions);
    
    // Restore original DATABASE_URL after Prisma client creation
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    
    onPremiseExperimentPrisma = onPremiseExperimentPrismaClient;
    
    // Connect and probe
    await onPremiseExperimentPrismaClient.$connect();
    const start = process.hrtime.bigint();
    await onPremiseExperimentPrismaClient.$queryRaw(Prisma.sql`SELECT 1`);
    const latencyMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    
    lastOnPremiseExperimentHeartbeatEvent = {
      ok: true,
      timestamp: new Date(),
      latencyMs,
      slow: latencyMs >= HEARTBEAT_DEFAULTS.warnThresholdMs,
      consecutiveFailures: 0,
      source: "startup",
    };
    
    log.info("ONPREMISE-DEV-EXPERIMENT Prisma client connected", {
      latencyMs: Number(latencyMs.toFixed(2)),
      transport: onPremiseExperimentTransport,
    });
    
    // Start ONPREMISE-DEV-EXPERIMENT heartbeat
    setInterval(async () => {
      if (!onPremiseExperimentPrismaClient) return;
      const probeStart = process.hrtime.bigint();
      try {
        await onPremiseExperimentPrismaClient.$queryRaw(Prisma.sql`SELECT 1`);
        const probeLatency = Number(process.hrtime.bigint() - probeStart) / 1_000_000;
        lastOnPremiseExperimentHeartbeatEvent = {
          ok: true,
          timestamp: new Date(),
          latencyMs: probeLatency,
          slow: probeLatency >= HEARTBEAT_DEFAULTS.warnThresholdMs,
          consecutiveFailures: 0,
          source: "heartbeat",
        };
      } catch (error) {
        const failures = (lastOnPremiseExperimentHeartbeatEvent?.consecutiveFailures ?? 0) + 1;
        lastOnPremiseExperimentHeartbeatEvent = {
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
    log.warn("ONPREMISE-DEV-EXPERIMENT Prisma client connection failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    lastOnPremiseExperimentHeartbeatEvent = {
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

// Initialize all four clients
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
      initializeOnPremiseDevClient(),
      initializeOnPremiseExperimentClient(),
    ]).then(async () => {
      prodPrismaClient = prismaClient;
      prodTransport = lastPrismaTransport;
      
      // Wait for heartbeat listeners to process initial events
      // This ensures getDatabaseStats() returns populated stats immediately after ensurePrisma() resolves
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }
}
