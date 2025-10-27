import { Prisma, PrismaClient } from "@prisma/client";
import { loadConfig } from "./config.js";
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

function createClient(): PrismaClient {
  if (globalPrisma.prisma) {
    return globalPrisma.prisma;
  }

  const config = loadConfig();
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL must be configured before Prisma initializes.");
  }

  try {
    // eslint-disable-next-line no-new
    new URL(config.databaseUrl);
  } catch (error) {
    throw new Error("DATABASE_URL is not a valid URL.");
  }

  const client = new PrismaClient({
    datasources: { db: { url: config.databaseUrl } },
    log: config.nodeEnv === "development" ? ["warn", "error"] : ["error"],
  });

  globalPrisma.prisma = client;
  return client;
}

const prismaClient = createClient();

if (!globalPrisma.prismaConnectPromise) {
  globalPrisma.prismaConnectPromise = prismaClient.$connect().catch((error) => {
    globalPrisma.prisma = undefined;
    throw error;
  });
}

export const prisma = prismaClient;

export async function ensurePrisma(): Promise<PrismaClient> {
  await globalPrisma.prismaConnectPromise;
  return prismaClient;
}
