import os from "node:os";

export type RuntimeConfig = {
  nodeEnv: string;
  serviceName: string;
  databaseUrl: string;
  redisUrl: string | null;
  cacheTtlMs: number;
};

let cachedConfig: RuntimeConfig | null = null;

function coerceNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveDatabaseUrl(): string {
  const direct = process.env.DATABASE_URL?.trim();
  if (direct) {
    return direct;
  }

  const internal = process.env.DATABASE_INTERNAL_URL?.trim();
  if (internal) {
    process.env.DATABASE_URL = internal;
    return internal;
  }

  return "";
}

function assertDatabaseUrl(nodeEnv: string, url: string): void {
  if (!url) {
    if (nodeEnv === "production") {
      throw new Error("DATABASE_URL is required in production.");
    }
    return;
  }

  if (nodeEnv === "production") {
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
        throw new Error("DATABASE_URL cannot point to localhost in production.");
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("DATABASE_URL must be a valid URL in production.");
    }
  }
}

export function loadConfig(): RuntimeConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const nodeEnv = process.env.NODE_ENV?.trim() || "development";
  const databaseUrl = resolveDatabaseUrl();
  assertDatabaseUrl(nodeEnv, databaseUrl);

  const serviceName = process.env.SERVICE_NAME?.trim() || os.hostname();
  const redisUrl = process.env.REDIS_URL?.trim() || null;
  const cacheTtlMs = coerceNumber(process.env.CACHE_TTL_MS, 60_000);

  cachedConfig = {
    nodeEnv,
    serviceName,
    databaseUrl,
    redisUrl,
    cacheTtlMs,
  };

  return cachedConfig;
}

export const config = loadConfig();
