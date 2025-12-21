import "../config/env.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeString } from "./utils/index.js";
let cachedConfig = null;
/**
 * Reset the cached config for tests.
 * ONLY use in test files to ensure clean state between tests.
 */
export function resetConfigCacheForTests() {
    cachedConfig = null;
}
function coerceNumber(value, fallback) {
    if (!value)
        return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function coerceBoolean(value, fallback) {
    if (typeof value !== "string") {
        return fallback;
    }
    const normalized = normalizeString(value);
    if (["1", "true", "yes", "on"].includes(normalized)) {
        return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
        return false;
    }
    return fallback;
}
function resolveLocalFallbackUrl() {
    // CANONICAL: DATABASE_ONPREMISE_DEV_PRIMARY (workstation development database)
    const envOverride = process.env.DATABASE_ONPREMISE_DEV_PRIMARY?.trim();
    if (envOverride) {
        return envOverride;
    }
    const fileOverride = process.env.DATABASE_LOCAL_URL_FILE?.trim();
    const storeRoot = process.env.IG_STORE_ROOT?.trim() || path.join(process.cwd(), "Store");
    const candidates = [fileOverride, path.join(storeRoot, "onpremise-dev-primary", "local-url.txt"), path.join(storeRoot, "db", "local-url.txt"), path.join(storeRoot, "db", "local", "url.txt")]
        .filter((candidate) => Boolean(candidate));
    for (const candidate of candidates) {
        try {
            const value = fs.readFileSync(candidate, "utf8").trim();
            if (value) {
                return value;
            }
        }
        catch {
            // Ignore read issues; runtime will fall back to remote candidates instead.
        }
    }
    return "";
}
function preferenceDirectory() {
    const override = process.env.DATABASE_CONNECTION_STATE_DIR?.trim();
    if (override) {
        return override;
    }
    return path.join(os.homedir(), ".infinity-gauntlet");
}
function preferenceFilePath() {
    return path.join(preferenceDirectory(), "db-connection.json");
}
function readConnectionPreference() {
    try {
        const payload = fs.readFileSync(preferenceFilePath(), "utf8");
        const parsed = JSON.parse(payload);
        const source = parsed?.lastSource;
        if (typeof source === "string" &&
            ["external", "pool", "internal", "direct", "env", "local"].includes(source)) {
            return source;
        }
    }
    catch {
        // Ignore read issues; runtime will probe available candidates instead.
    }
    return null;
}
function writeConnectionPreference(source) {
    try {
        const targetDir = preferenceDirectory();
        fs.mkdirSync(targetDir, { recursive: true });
        const data = {
            lastSource: source,
            updatedAt: new Date().toISOString(),
        };
        fs.writeFileSync(preferenceFilePath(), JSON.stringify(data));
    }
    catch {
        // Ignore write issues; connection mode falls back to auto detection.
    }
}
function normalizeMode(raw) {
    const candidate = raw ? normalizeString(raw) : undefined;
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
function resolveDatabaseUrl(nodeEnv) {
    const mode = normalizeMode(process.env.DATABASE_CONNECTION_MODE);
    // UNIFIED ARCHITECTURE: Single production database (Render-managed PostgreSQL)
    const prodUrl = process.env.PROD_DATABASE_URL?.trim() ?? "";
    // Fallback URLs for compatibility
    const renderInternalUrl = process.env.RENDER_DB_INTERNAL_URL?.trim() ?? "";
    const renderExternalUrl = process.env.RENDER_DB_EXTERNAL_URL?.trim() ?? "";
    // ONPREMISE-DEV-PRIMARY: Workstation development database (optional offline fallback)
    const onPremiseDevUrl = process.env.DATABASE_ONPREMISE_DEV_PRIMARY?.trim() ?? "";
    const _preferExternal = mode === "external" || (mode === "auto" && nodeEnv !== "production");
    const isPostgresUrl = (value) => /^postgres(?:ql)?:\/\//i.test(value);
    const seen = new Set();
    const directCandidates = [];
    const makeKey = (value, source) => `${source}::${value}`;
    const addDirectCandidate = (value, source, fallback = false) => {
        if (!value) {
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
    // UNIFIED ARCHITECTURE: All environments use PROD_DATABASE_URL (Render-managed PostgreSQL)
    // Priority: PROD_DATABASE_URL → RENDER_DB_EXTERNAL_URL → RENDER_DB_INTERNAL_URL → LOCAL
    // Build direct PostgreSQL candidates in priority order
    addDirectCandidate(prodUrl, "env");
    addDirectCandidate(renderExternalUrl, "external");
    addDirectCandidate(renderInternalUrl, "internal");
    addDirectCandidate(onPremiseDevUrl, "local");
    const localFallbackUrl = resolveLocalFallbackUrl();
    if (localFallbackUrl) {
        addDirectCandidate(localFallbackUrl, "local", true);
    }
    // UNIFIED ARCHITECTURE: All candidates are direct PostgreSQL
    const orderedCandidates = [...directCandidates];
    if (!orderedCandidates.length) {
        throw new Error("No database URL found. Provide a direct PostgreSQL connection string via PROD_DATABASE_URL, RENDER_DB_INTERNAL_URL, RENDER_DB_EXTERNAL_URL, or DATABASE_ONPREMISE_DEV_PRIMARY (workstation).");
    }
    const preference = readConnectionPreference();
    if (preference) {
        const index = orderedCandidates.findIndex((candidate) => candidate.source === preference && candidate.value);
        if (index > 0) {
            const [preferred] = orderedCandidates.splice(index, 1);
            orderedCandidates.unshift(preferred);
        }
    }
    const databaseCandidates = orderedCandidates
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
function assertDatabaseUrl(nodeEnv, url) {
    if (!url) {
        if (nodeEnv === "production") {
            throw new Error("Database URL is required in production. Set PROD_DATABASE_URL (CLOUD-PROD-RUNTIME) or RENDER_DB_INTERNAL_URL.");
        }
        return;
    }
    if (nodeEnv === "production") {
        try {
            const host = new URL(url).hostname.toLowerCase();
            const isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "::1";
            // IMPORTANT: Allow localhost for on-premise development (DATABASE_ONPREMISE_DEV_PRIMARY)
            // Production uses Render-managed PostgreSQL (no localhost)
            const prodUrl = process.env.PROD_DATABASE_URL?.trim();
            const isUsingProdLocalDatabase = prodUrl && url === prodUrl && isLocalhost;
            if (isLocalhost && !isUsingProdLocalDatabase) {
                throw new Error("Database URL cannot point to localhost in production (unless using PROD_DATABASE_URL for CLOUD-PROD-RUNTIME local node).");
            }
        }
        catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error("Database URL must be a valid URL in production.");
        }
    }
}
export function loadConfig() {
    if (cachedConfig) {
        return cachedConfig;
    }
    const nodeEnv = process.env.NODE_ENV?.trim() || "development";
    const { url: databaseUrl, source: databaseUrlSource, mode: databaseConnectionMode, candidates: databaseCandidates, preference: databasePreferenceSource, } = resolveDatabaseUrl(nodeEnv);
    assertDatabaseUrl(nodeEnv, databaseUrl);
    const serviceName = process.env.SERVICE_NAME?.trim() || os.hostname();
    const redisUrl = process.env.REDIS_URL?.trim() || null;
    const cacheTtlMs = coerceNumber(process.env.CACHE_TTL_MS, 60_000);
    const backupProviderRaw = process.env.BACKUP_STORAGE_PROVIDER ? normalizeString(process.env.BACKUP_STORAGE_PROVIDER) : undefined;
    const backupProvider = backupProviderRaw === "s3"
        ? "s3"
        : backupProviderRaw === "local"
            ? "local"
            : "none";
    const backupPrefix = (process.env.BACKUP_STORAGE_PREFIX?.trim() || "outbox").replace(/^[\s/]+|[\s/]+$/g, "");
    const backupStorage = {
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
export function recordDatabaseConnectionSuccess(source) {
    writeConnectionPreference(source);
    process.env.DATABASE_CONNECTION_LAST_SOURCE = source;
    process.env.DATABASE_CONNECTION_PREFERENCE_SOURCE = source;
    if (source === "internal" || source === "pool" || source === "direct" || source === "local") {
        process.env.DATABASE_CONNECTION_MODE = "internal";
    }
    else if (source === "external" || source === "env") {
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
