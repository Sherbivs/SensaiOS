import "../config/env.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type DatabaseConnectionMode = "auto" | "external" | "internal";

export type DatabaseUrlSource =
  | "external"
  | "pool"
  | "internal"
  | "direct"
  | "env"
  | "accelerate"
  | "local"
  | "unset";

export type DatabaseCandidate = {
  url: string;
  source: DatabaseUrlSource;
  isFallback?: boolean;
};

export type BackupStorageProvider = "none" | "s3" | "local";

export type BackupStorageConfig = {
  provider: BackupStorageProvider;
  prefix: string;
  bucket?: string;
  region?: string;
  endpoint?: string;
  forcePathStyle: boolean;
  localDir?: string;
};

export type RuntimeConfig = {
  nodeEnv: string;
  serviceName: string;
  databaseUrl: string;
  databaseConnectionMode: DatabaseConnectionMode;
  databaseUrlSource: DatabaseUrlSource;
  databaseCandidates: DatabaseCandidate[];
  databasePreferenceSource: DatabaseUrlSource | null;
  redisUrl: string | null;
  cacheTtlMs: number;
  backupStorage: BackupStorageConfig;
};

let cachedConfig: RuntimeConfig | null = null;

function coerceNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function coerceBoolean(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function resolveLocalFallbackUrl(): string {
  const envOverride = process.env.DATABASE_LOCAL_URL?.trim();
  if (envOverride) {
    return envOverride;
  }

  const fileOverride = process.env.DATABASE_LOCAL_URL_FILE?.trim();
  const storeRoot = process.env.IG_STORE_ROOT?.trim() || path.join(process.cwd(), "Store");
  const candidates = [fileOverride, path.join(storeRoot, "db", "local-url.txt"), path.join(storeRoot, "db", "local", "url.txt")]
    .filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      const value = fs.readFileSync(candidate, "utf8").trim();
      if (value) {
        return value;
      }
    } catch {
      // Ignore read issues; runtime will fall back to remote candidates instead.
    }
  }

  return "";
}

type ResolvedDatabaseUrl = {
  url: string;
  source: DatabaseUrlSource;
  mode: DatabaseConnectionMode;
  candidates: DatabaseCandidate[];
  preference: DatabaseUrlSource | null;
};

function preferenceDirectory(): string {
  const override = process.env.DATABASE_CONNECTION_STATE_DIR?.trim();
  if (override) {
    return override;
  }
  return path.join(os.homedir(), ".infinity-gauntlet");
}

function preferenceFilePath(): string {
  return path.join(preferenceDirectory(), "db-connection.json");
}

function readConnectionPreference(): DatabaseUrlSource | null {
  try {
    const payload = fs.readFileSync(preferenceFilePath(), "utf8");
    const parsed = JSON.parse(payload);
    const source = parsed?.lastSource;
    if (
      typeof source === "string" &&
      ["external", "pool", "internal", "direct", "env", "accelerate", "local"].includes(source)
    ) {
      return source as DatabaseUrlSource;
    }
  } catch {
    // Ignore read issues; runtime will probe available candidates instead.
  }
  return null;
}

function writeConnectionPreference(source: DatabaseUrlSource): void {
  try {
    const targetDir = preferenceDirectory();
    fs.mkdirSync(targetDir, { recursive: true });
    const data = {
      lastSource: source,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(preferenceFilePath(), JSON.stringify(data));
  } catch {
    // Ignore write issues; connection mode falls back to auto detection.
  }
}

function normalizeMode(raw: string | undefined): DatabaseConnectionMode {
  const candidate = raw?.trim().toLowerCase();
  if (!candidate) {
    return "auto";
  }
  if (["external", "public", "dev"].includes(candidate)) {
    return "external";
  }
  if (["internal", "private", "pool", "prod"].includes(candidate)) {
    return "internal";
  }
  return "auto";
}

function resolveDatabaseUrl(nodeEnv: string): ResolvedDatabaseUrl {
  const mode = normalizeMode(process.env.DATABASE_CONNECTION_MODE);
  
  // 2-NODE CLUSTER: PROD_DATABASE_URL (local) and DEV_DATABASE_URL (master)
  const prodUrl = process.env.PROD_DATABASE_URL?.trim() ?? "";
  const devUrl = process.env.DEV_DATABASE_URL?.trim() ?? "";
  
  // Legacy references (backwards compatibility)
  const renderInternalUrl = process.env.RENDER_DB_INTERNAL_URL?.trim() ?? "";
  const renderExternalUrl = process.env.RENDER_DB_EXTERNAL_URL?.trim() ?? "";
  const localUrl = process.env.DATABASE_LOCAL_URL?.trim() ?? "";
  const envUrl = process.env.DATABASE_URL?.trim() ?? "";
  const internalUrlPrimary = process.env.DATABASE_INTERNAL_URL?.trim() ?? "";
  const internalUrlLegacy = process.env.DATABASE_URL_INTERNAL?.trim() ?? "";

  const preferExternal = mode === "external" || (mode === "auto" && nodeEnv !== "production");

  const isAccelerateUrl = (value: string): boolean => /^prisma\+/i.test(value);
  const isPostgresUrl = (value: string): boolean => /^postgres(?:ql)?:\/\//i.test(value);

  const seen = new Set<string>();
  type CandidateBucket = Array<{ value: string; source: DatabaseUrlSource; fallback: boolean }>;
  const accelerateCandidates: CandidateBucket = [];
  const directCandidates: CandidateBucket = [];

  const makeKey = (value: string, source: DatabaseUrlSource): string => `${source}::${value}`;

  const addAccelerateCandidate = (value: string, source: DatabaseUrlSource): void => {
    if (!value) {
      return;
    }
    if (!isAccelerateUrl(value)) {
      return;
    }
    const key = makeKey(value, source);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    accelerateCandidates.push({ value, source, fallback: false });
  };

  const addDirectCandidate = (value: string, source: DatabaseUrlSource, fallback = false): void => {
    if (!value) {
      return;
    }
    if (isAccelerateUrl(value)) {
      return;
    }
    if (!isPostgresUrl(value)) {
      return;
    }
    const key = makeKey(value, source);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    directCandidates.push({ value, source, fallback });
  };

  // 2-NODE CLUSTER: Production uses PROD_DATABASE_URL (local), fallback to legacy/external
  // No Accelerate candidates - removed from architecture
  
  // Build direct PostgreSQL candidates in priority order
  if (preferExternal) {
    // Development/external mode: prefer DEV (master) database
    addDirectCandidate(devUrl, "external");
    addDirectCandidate(renderExternalUrl, "external");
    addDirectCandidate(renderInternalUrl, "internal");
    addDirectCandidate(prodUrl, "env");
    addDirectCandidate(localUrl, "local");
    addDirectCandidate(envUrl, "env");
    addDirectCandidate(internalUrlPrimary, "internal");
    addDirectCandidate(internalUrlLegacy, "internal");
  } else {
    // Production/internal mode: prefer PROD (local) database
    addDirectCandidate(prodUrl, "env");
    addDirectCandidate(localUrl, "local");
    addDirectCandidate(renderInternalUrl, "internal");
    addDirectCandidate(internalUrlPrimary, "internal");
    addDirectCandidate(internalUrlLegacy, "internal");
    addDirectCandidate(devUrl, "external");
    addDirectCandidate(envUrl, "env");
    addDirectCandidate(renderExternalUrl, "external");
  }

  const localFallbackUrl = resolveLocalFallbackUrl();
  if (localFallbackUrl) {
    addDirectCandidate(localFallbackUrl, "local", true);
  }

  let orderedCandidates: CandidateBucket = [];

  // No Accelerate candidates in 2-node cluster
  orderedCandidates = [...directCandidates];

  if (!orderedCandidates.length) {
    throw new Error(
      "No database URL found. Provide a direct PostgreSQL connection string via PROD_DATABASE_URL, DEV_DATABASE_URL, RENDER_DB_INTERNAL_URL, RENDER_DB_EXTERNAL_URL, or DATABASE_LOCAL_URL."
    );
  }

  const preference = readConnectionPreference();

  if (preference) {
    const index = orderedCandidates.findIndex((candidate) => candidate.source === preference && candidate.value);
    if (index > 0) {
      const [preferred] = orderedCandidates.splice(index, 1);
      orderedCandidates.unshift(preferred);
    }
  }

  const databaseCandidates: DatabaseCandidate[] = orderedCandidates
    .filter((candidate) => Boolean(candidate.value))
    .map((candidate) => ({ url: candidate.value, source: candidate.source, isFallback: candidate.fallback }));

  const resolved = databaseCandidates[0];
  if (resolved) {
    process.env.DATABASE_URL = resolved.url;
    process.env.DATABASE_CONNECTION_MODE = mode;
    process.env.DATABASE_CONNECTION_SOURCE = resolved.source;
    if (preference) {
      process.env.DATABASE_CONNECTION_PREFERENCE_SOURCE = preference;
    }
    return { url: resolved.url, source: resolved.source, mode, candidates: databaseCandidates, preference };
  }

  process.env.DATABASE_CONNECTION_MODE = mode;
  process.env.DATABASE_CONNECTION_SOURCE = "unset";
  return { url: "", source: "unset", mode, candidates: databaseCandidates, preference };
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
      const isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "::1";
      
      // CRITICAL: Allow localhost for PROD_DATABASE_URL (2-node cluster architecture)
      // PROD_DATABASE_URL intentionally uses 127.0.0.1:55433 (local Render Node PostgreSQL)
      const prodUrl = process.env.PROD_DATABASE_URL?.trim();
      const isUsingProdLocalDatabase = prodUrl && url === prodUrl && isLocalhost;
      
      if (isLocalhost && !isUsingProdLocalDatabase) {
        throw new Error("DATABASE_URL cannot point to localhost in production (unless using PROD_DATABASE_URL for local node).");
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
  const {
    url: databaseUrl,
    source: databaseUrlSource,
    mode: databaseConnectionMode,
    candidates: databaseCandidates,
    preference: databasePreferenceSource,
  } = resolveDatabaseUrl(nodeEnv);
  assertDatabaseUrl(nodeEnv, databaseUrl);

  const serviceName = process.env.SERVICE_NAME?.trim() || os.hostname();
  const redisUrl = process.env.REDIS_URL?.trim() || null;
  const cacheTtlMs = coerceNumber(process.env.CACHE_TTL_MS, 60_000);

  const backupProviderRaw = process.env.BACKUP_STORAGE_PROVIDER?.trim().toLowerCase();
  const backupProvider: BackupStorageProvider = backupProviderRaw === "s3"
    ? "s3"
    : backupProviderRaw === "local"
      ? "local"
      : "none";
  const backupPrefix = (process.env.BACKUP_STORAGE_PREFIX?.trim() || "outbox").replace(/^[\s/]+|[\s/]+$/g, "");
  const backupStorage: BackupStorageConfig = {
    provider: backupProvider,
    prefix: backupPrefix || "outbox",
    bucket: process.env.BACKUP_STORAGE_S3_BUCKET?.trim() || undefined,
    region: process.env.BACKUP_STORAGE_S3_REGION?.trim() || undefined,
    endpoint: process.env.BACKUP_STORAGE_S3_ENDPOINT?.trim() || undefined,
    forcePathStyle: coerceBoolean(process.env.BACKUP_STORAGE_S3_FORCE_PATH_STYLE, false),
    localDir: process.env.BACKUP_STORAGE_LOCAL_DIR?.trim() || undefined,
  };

  cachedConfig = {
    nodeEnv,
    serviceName,
    databaseUrl,
    databaseConnectionMode,
    databaseUrlSource,
    databaseCandidates,
    databasePreferenceSource,
    redisUrl,
    cacheTtlMs,
    backupStorage,
  };

  return cachedConfig;
}

export const config = loadConfig();

export function recordDatabaseConnectionSuccess(source: DatabaseUrlSource): void {
  writeConnectionPreference(source);
  process.env.DATABASE_CONNECTION_LAST_SOURCE = source;
  process.env.DATABASE_CONNECTION_PREFERENCE_SOURCE = source;
  if (source === "internal" || source === "pool" || source === "direct" || source === "local") {
    process.env.DATABASE_CONNECTION_MODE = "internal";
  } else if (source === "accelerate" || source === "external" || source === "env") {
    process.env.DATABASE_CONNECTION_MODE = "external";
  }
  if (cachedConfig) {
    const candidates = [...cachedConfig.databaseCandidates];
    const index = candidates.findIndex((candidate) => candidate.source === source);
    if (index > 0) {
      const [preferred] = candidates.splice(index, 1);
      candidates.unshift(preferred);
    }
    cachedConfig = {
      ...cachedConfig,
      databaseUrlSource: source,
      databasePreferenceSource: source,
      databaseCandidates: candidates,
    };
  }
}

export function resetConfigCacheForTests(): void {
  cachedConfig = null;
}
