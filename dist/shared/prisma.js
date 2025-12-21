// Prisma 7: Uses driver adapters (no Rust engine)
import { PrismaClient, Prisma } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { loadConfig, recordDatabaseConnectionSuccess } from "./config.js";
import { log } from "./log.js";
import { delayWithJitter, getErrorMessage, ensureError } from "./utils/index.js";
const HEARTBEAT_DEFAULTS = {
    intervalMs: Math.max(Number(process.env.PRISMA_HEARTBEAT_INTERVAL_MS ?? 30_000) || 30_000, 5_000),
    warnThresholdMs: Math.max(Number(process.env.PRISMA_HEARTBEAT_WARN_THRESHOLD_MS ?? 1_000) || 1_000, 100),
    errorThreshold: Math.max(Number(process.env.PRISMA_HEARTBEAT_ERROR_THRESHOLD ?? 3) || 3, 1),
};
const globalPrisma = globalThis;
const heartbeatListeners = globalPrisma.prismaHeartbeatListeners ?? new Set();
globalPrisma.prismaHeartbeatListeners = heartbeatListeners;
// 2-NODE CLUSTER: Direct PostgreSQL only
// UNIFIED ARCHITECTURE: Single production database (Render-managed PostgreSQL)
// - prisma: PRIMARY client connected to PROD_DATABASE_URL (unified Render database)
// - onPremiseDevPrisma: OPTIONAL client for offline workstation development (DATABASE_ONPREMISE_DEV_PRIMARY)
// - onPremiseExperimentPrisma: OPTIONAL client for migration testing (DATABASE_ONPREMISE_DEV_EXPERIMENT)
let prodPrismaClient = null;
let onPremiseDevPrismaClient = null;
let onPremiseExperimentPrismaClient = null;
let prismaClient; // Legacy reference - points to PROD (unified database)
export let prisma; // PRIMARY client - unified Render database
export let onPremiseDevPrisma = null; // OPTIONAL: Workstation development (offline)
export let onPremiseExperimentPrisma = null; // OPTIONAL: Migration testing (offline)
let activeCandidate = null;
let lastPrismaTransport = "direct";
let prodTransport = "unknown";
let onPremiseDevTransport = "unknown";
let onPremiseExperimentTransport = "unknown";
function emitHeartbeat(event) {
    for (const listener of heartbeatListeners) {
        try {
            listener(event);
        }
        catch (error) {
            log.warn("Prisma heartbeat listener threw", {
                listenerError: getErrorMessage(error),
            });
        }
    }
}
export function onPrismaHeartbeat(listener) {
    heartbeatListeners.add(listener);
    return () => {
        heartbeatListeners.delete(listener);
    };
}
function coerceOptions(options) {
    if (!options) {
        return HEARTBEAT_DEFAULTS;
    }
    return {
        intervalMs: Math.max(Number(options.intervalMs ?? HEARTBEAT_DEFAULTS.intervalMs) || HEARTBEAT_DEFAULTS.intervalMs, 5_000),
        warnThresholdMs: Math.max(Number(options.warnThresholdMs ?? HEARTBEAT_DEFAULTS.warnThresholdMs) || HEARTBEAT_DEFAULTS.warnThresholdMs, 100),
        errorThreshold: Math.max(Number(options.errorThreshold ?? HEARTBEAT_DEFAULTS.errorThreshold) || HEARTBEAT_DEFAULTS.errorThreshold, 1),
    };
}
async function performHeartbeat(state, options) {
    const start = process.hrtime.bigint();
    try {
        await prisma.$queryRaw(Prisma.sql `SELECT 1`);
        const latencyMs = Number(process.hrtime.bigint() - start) / 1_000_000;
        const slow = latencyMs >= options.warnThresholdMs;
        if (slow) {
            log.warn("Prisma heartbeat slow", {
                latencyMs: Number(latencyMs.toFixed(2)),
                thresholdMs: options.warnThresholdMs,
            });
        }
        else {
            log.debug("Prisma heartbeat ok", {
                latencyMs: Number(latencyMs.toFixed(2)),
            });
        }
        state.consecutiveFailures = 0;
        const event = {
            ok: true,
            timestamp: new Date(),
            latencyMs,
            slow,
            consecutiveFailures: state.consecutiveFailures,
            source: "heartbeat",
        };
        emitHeartbeat(event);
    }
    catch (rawError) {
        state.consecutiveFailures += 1;
        const error = ensureError(rawError);
        const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
        const meta = {
            consecutiveFailures: state.consecutiveFailures,
            durationMs: Number.isFinite(durationMs) ? Number(durationMs.toFixed(2)) : undefined,
        };
        if (state.consecutiveFailures >= options.errorThreshold) {
            log.error("Prisma heartbeat failed", error, meta);
        }
        else {
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
function scheduleHeartbeat(state) {
    if (state.stopped) {
        return;
    }
    state.timer = setTimeout(async () => {
        try {
            await performHeartbeat(state, state.options);
        }
        finally {
            scheduleHeartbeat(state);
        }
    }, state.options.intervalMs);
    state.timer.unref?.();
}
export function startPrismaHeartbeat(options) {
    if (process.env.DISABLE_PRISMA_HEARTBEAT === "true") {
        log.info("Prisma heartbeat disabled via environment variable");
        return () => { };
    }
    const existing = globalPrisma.prismaHeartbeatState;
    if (existing && !existing.stopped) {
        return () => stopPrismaHeartbeat();
    }
    const resolved = coerceOptions(options);
    const state = {
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
export function stopPrismaHeartbeat() {
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
function validateDatabaseUrl(url) {
    if (!url) {
        throw new Error("DATABASE_URL must be configured before Prisma initializes.");
    }
    try {
        new URL(url);
    }
    catch {
        throw new Error("DATABASE_URL is not a valid URL.");
    }
}
function createClient(candidate, nodeEnv) {
    validateDatabaseUrl(candidate.url);
    process.env.DATABASE_URL = candidate.url;
    process.env.DATABASE_CONNECTION_SOURCE = candidate.source;
    // PRISMA 7: Create pg Pool and use driver adapter
    const pool = new pg.Pool({ connectionString: candidate.url });
    const adapter = new PrismaPg(pool);
    const logLevels = nodeEnv === "development" ? ["warn", "error"] : ["error"];
    // OPTIMIZATION: Query performance monitoring (Phase 5.1)
    // Enable query event logging to detect slow queries (>100ms) and N+1 patterns
    const baseOptions = {
        adapter,
        log: [
            ...logLevels.map(level => ({ emit: "stdout", level: level })),
            { emit: "event", level: "query" }, // Query performance instrumentation
        ],
    };
    const baseClient = new PrismaClient(baseOptions);
    const client = baseClient;
    // Attach query performance monitoring handler
    // Logs warnings for slow queries (>100ms) to help identify N+1 patterns and optimization targets
    // Also tracks metrics for Prometheus
    baseClient.$on('query', (e) => {
        const duration = e.duration; // Duration in milliseconds
        // Extract operation and table from query (best effort)
        const query = (e.query || '').toLowerCase();
        let operation = 'unknown';
        let table = 'unknown';
        if (query.startsWith('select'))
            operation = 'select';
        else if (query.startsWith('insert'))
            operation = 'insert';
        else if (query.startsWith('update'))
            operation = 'update';
        else if (query.startsWith('delete'))
            operation = 'delete';
        else if (query.includes('begin') || query.includes('commit'))
            operation = 'transaction';
        // Extract table name (simple regex for common patterns)
        const tableMatch = query.match(/(?:from|into|update|join)\s+["`]?(\w+)["`]?/i);
        if (tableMatch) {
            table = tableMatch[1].toLowerCase();
        }
        // Emit db.query event for metrics instrumentation
        try {
            const { EventBus } = require('./event-bus.js');
            const eventBus = EventBus.getInstance();
            eventBus.emit({
                type: 'db.query',
                timestamp: new Date(),
                source: 'prisma',
                data: {
                    operation,
                    table,
                    status: 'success',
                    durationMs: duration,
                },
            });
        }
        catch {
            // Graceful degradation - EventBus not ready
        }
        if (duration > 100) {
            // Slow query detected
            log.warn('Slow query detected', {
                duration,
                query: e.query,
                params: e.params,
                target: e.target,
                timestamp: e.timestamp
            });
        }
    });
    globalPrisma.prisma = client;
    lastPrismaTransport = "direct";
    return client;
}
function coerceRetryValue(raw, fallback, minimum) {
    if (!raw)
        return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.max(parsed, minimum);
}
async function attemptCandidateConnection(candidate, attempt) {
    const warnThreshold = HEARTBEAT_DEFAULTS.warnThresholdMs;
    const start = process.hrtime.bigint();
    // 2-NODE CLUSTER: Direct PostgreSQL connection
    await prismaClient.$connect();
    const latencyMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const slow = latencyMs >= warnThreshold;
    const runtimeConfig = loadConfig();
    const meta = {
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
    }
    else {
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
async function disconnectPrismaClient() {
    if (prismaClient) {
        try {
            await prismaClient.$disconnect();
        }
        catch (error) {
            log.warn("Ignoring Prisma disconnect error during datasource switch", {
                error: getErrorMessage(error),
            });
        }
    }
}
async function connectAcrossCandidates() {
    const runtimeConfig = loadConfig();
    const candidates = runtimeConfig.databaseCandidates.length
        ? runtimeConfig.databaseCandidates
        : [{ url: runtimeConfig.databaseUrl, source: runtimeConfig.databaseUrlSource }];
    if (!candidates.length) {
        throw new Error("No database candidates available for Prisma connection.");
    }
    const baseDelayMs = coerceRetryValue(process.env.PRISMA_CONNECT_RETRY_DELAY_MS, 500, 50);
    const maxDelayMs = coerceRetryValue(process.env.PRISMA_CONNECT_MAX_DELAY_MS, 5_000, baseDelayMs);
    const maxAttemptsEnv = coerceRetryValue(process.env.PRISMA_CONNECT_MAX_ATTEMPTS, Math.max(candidates.length * 4, 4), candidates.length);
    const maxAttempts = Math.max(Math.trunc(maxAttemptsEnv), candidates.length);
    let attempt = 0;
    let lastError = null;
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
        }
        catch (error) {
            const err = ensureError(error);
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
const initialCandidate = bootstrapConfig.databaseCandidates[0] ?? {
    url: bootstrapConfig.databaseUrl,
    source: bootstrapConfig.databaseUrlSource,
};
validateDatabaseUrl(initialCandidate.url);
// Initialize primary client using candidate-based approach
prismaClient = createClient(initialCandidate, bootstrapConfig.nodeEnv);
prisma = prismaClient;
activeCandidate = initialCandidate;
export async function ensurePrisma() {
    await globalPrisma.prismaConnectPromise;
    return prisma;
}
export function getPrismaTransport() {
    return lastPrismaTransport;
}
// Heartbeat event tracking (prefixed with _ to indicate reserved for future monitoring)
let _lastHeartbeatEvent = null;
let lastProdHeartbeatEvent = null;
let lastOnPremiseDevHeartbeatEvent = null;
let lastOnPremiseExperimentHeartbeatEvent = null;
onPrismaHeartbeat((event) => {
    _lastHeartbeatEvent = event;
    // Main heartbeat goes to prod (unified database)
    lastProdHeartbeatEvent = event;
});
// Helper to manually fire heartbeat event (for startup initialization)
export function fireProdHeartbeatEvent(event) {
    lastProdHeartbeatEvent = event;
}
function computeStatus(heartbeat) {
    if (!heartbeat)
        return "unknown";
    if (heartbeat.ok) {
        return heartbeat.slow ? "degraded" : "healthy";
    }
    return heartbeat.consecutiveFailures >= HEARTBEAT_DEFAULTS.errorThreshold ? "error" : "reconnecting";
}
export function getDatabaseStats() {
    // UNIFIED ARCHITECTURE: Single production database (Render-managed PostgreSQL)
    const prodCandidate = activeCandidate;
    const prodSource = prodCandidate?.source ?? "unknown";
    const prodLatency = lastProdHeartbeatEvent?.latencyMs ?? null;
    const prodStatus = prodPrismaClient
        ? (lastProdHeartbeatEvent ? computeStatus(lastProdHeartbeatEvent) : "initializing")
        : "offline";
    // ONPREMISE-DEV-PRIMARY stats (optional - workstation development)
    const onPremiseDevSource = process.env.DATABASE_ONPREMISE_DEV_PRIMARY ? "onpremise-dev" : "unknown";
    const onPremiseDevLatency = lastOnPremiseDevHeartbeatEvent?.latencyMs ?? null;
    const onPremiseDevStatus = onPremiseDevPrismaClient
        ? (lastOnPremiseDevHeartbeatEvent ? computeStatus(lastOnPremiseDevHeartbeatEvent) : "initializing")
        : "disabled";
    // ONPREMISE-DEV-EXPERIMENT stats (optional - migration testing)
    const onPremiseExperimentSource = process.env.DATABASE_ONPREMISE_DEV_EXPERIMENT ? "onpremise-experiment" : "unknown";
    const onPremiseExperimentLatency = lastOnPremiseExperimentHeartbeatEvent?.latencyMs ?? null;
    const onPremiseExperimentStatus = onPremiseExperimentPrismaClient
        ? (lastOnPremiseExperimentHeartbeatEvent ? computeStatus(lastOnPremiseExperimentHeartbeatEvent) : "initializing")
        : "disabled";
    return {
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
// Initialize ONPREMISE-DEV-PRIMARY client (workstation development database - OPTIONAL)
async function initializeOnPremiseDevClient() {
    const onPremiseDevUrl = process.env.DATABASE_ONPREMISE_DEV_PRIMARY?.trim();
    if (!onPremiseDevUrl) {
        log.info("LOCAL database connection skipped", { reason: "no DATABASE_ONPREMISE_DEV_PRIMARY" });
        return;
    }
    try {
        // PRISMA 7: Create pg Pool and use driver adapter
        onPremiseDevTransport = "direct";
        const pool = new pg.Pool({ connectionString: onPremiseDevUrl });
        const adapter = new PrismaPg(pool);
        const baseOptions = {
            adapter,
            log: [{ emit: "stdout", level: "error" }],
        };
        onPremiseDevPrismaClient = new PrismaClient(baseOptions);
        onPremiseDevPrisma = onPremiseDevPrismaClient;
        // Connect and probe
        await onPremiseDevPrismaClient.$connect();
        const start = process.hrtime.bigint();
        await onPremiseDevPrismaClient.$queryRaw(Prisma.sql `SELECT 1`);
        const latencyMs = Number(process.hrtime.bigint() - start) / 1_000_000;
        lastOnPremiseDevHeartbeatEvent = {
            ok: true,
            timestamp: new Date(),
            latencyMs,
            slow: latencyMs >= HEARTBEAT_DEFAULTS.warnThresholdMs,
            consecutiveFailures: 0,
            source: "startup",
        };
        log.info("LOCAL Prisma client connected (workstation development)", {
            latencyMs: Number(latencyMs.toFixed(2)),
            transport: onPremiseDevTransport,
        });
        // Start LOCAL heartbeat
        setInterval(async () => {
            if (!onPremiseDevPrismaClient)
                return;
            const probeStart = process.hrtime.bigint();
            try {
                await onPremiseDevPrismaClient.$queryRaw(Prisma.sql `SELECT 1`);
                const probeLatency = Number(process.hrtime.bigint() - probeStart) / 1_000_000;
                lastOnPremiseDevHeartbeatEvent = {
                    ok: true,
                    timestamp: new Date(),
                    latencyMs: probeLatency,
                    slow: probeLatency >= HEARTBEAT_DEFAULTS.warnThresholdMs,
                    consecutiveFailures: 0,
                    source: "heartbeat",
                };
            }
            catch (error) {
                const failures = (lastOnPremiseDevHeartbeatEvent?.consecutiveFailures ?? 0) + 1;
                lastOnPremiseDevHeartbeatEvent = {
                    ok: false,
                    timestamp: new Date(),
                    latencyMs: null,
                    slow: false,
                    consecutiveFailures: failures,
                    error: ensureError(error),
                    source: "heartbeat",
                };
            }
        }, HEARTBEAT_DEFAULTS.intervalMs).unref();
    }
    catch (error) {
        log.warn("LOCAL Prisma client connection failed", {
            error: getErrorMessage(error),
        });
        lastOnPremiseDevHeartbeatEvent = {
            ok: false,
            timestamp: new Date(),
            latencyMs: null,
            slow: false,
            consecutiveFailures: 1,
            error: ensureError(error),
            source: "startup",
        };
    }
}
// Initialize ONPREMISE-DEV-EXPERIMENT client (workstation migration testing database)
async function initializeOnPremiseExperimentClient() {
    const onPremiseExperimentUrl = process.env.DATABASE_ONPREMISE_DEV_EXPERIMENT?.trim();
    if (!onPremiseExperimentUrl) {
        log.info("ONPREMISE-DEV-EXPERIMENT database connection skipped", { reason: "no DATABASE_ONPREMISE_DEV_EXPERIMENT" });
        return;
    }
    try {
        // PRISMA 7: Create pg Pool and use driver adapter
        onPremiseExperimentTransport = "direct";
        const pool = new pg.Pool({ connectionString: onPremiseExperimentUrl });
        const adapter = new PrismaPg(pool);
        const baseOptions = {
            adapter,
            log: [{ emit: "stdout", level: "error" }],
        };
        onPremiseExperimentPrismaClient = new PrismaClient(baseOptions);
        onPremiseExperimentPrisma = onPremiseExperimentPrismaClient;
        // Connect and probe
        await onPremiseExperimentPrismaClient.$connect();
        const start = process.hrtime.bigint();
        await onPremiseExperimentPrismaClient.$queryRaw(Prisma.sql `SELECT 1`);
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
            if (!onPremiseExperimentPrismaClient)
                return;
            const probeStart = process.hrtime.bigint();
            try {
                await onPremiseExperimentPrismaClient.$queryRaw(Prisma.sql `SELECT 1`);
                const probeLatency = Number(process.hrtime.bigint() - probeStart) / 1_000_000;
                lastOnPremiseExperimentHeartbeatEvent = {
                    ok: true,
                    timestamp: new Date(),
                    latencyMs: probeLatency,
                    slow: probeLatency >= HEARTBEAT_DEFAULTS.warnThresholdMs,
                    consecutiveFailures: 0,
                    source: "heartbeat",
                };
            }
            catch (error) {
                const failures = (lastOnPremiseExperimentHeartbeatEvent?.consecutiveFailures ?? 0) + 1;
                lastOnPremiseExperimentHeartbeatEvent = {
                    ok: false,
                    timestamp: new Date(),
                    latencyMs: null,
                    slow: false,
                    consecutiveFailures: failures,
                    error: ensureError(error),
                    source: "heartbeat",
                };
            }
        }, HEARTBEAT_DEFAULTS.intervalMs).unref();
    }
    catch (error) {
        log.warn("ONPREMISE-DEV-EXPERIMENT Prisma client connection failed", {
            error: getErrorMessage(error),
        });
        lastOnPremiseExperimentHeartbeatEvent = {
            ok: false,
            timestamp: new Date(),
            latencyMs: null,
            slow: false,
            consecutiveFailures: 1,
            error: ensureError(error),
            source: "startup",
        };
    }
}
// Initialize all clients (PROD + optional LOCAL clients)
if (!globalPrisma.prismaConnectPromise) {
    const skipInitialConnect = process.env.PRISMA_SKIP_INITIAL_CONNECT === "true";
    if (skipInitialConnect) {
        log.info("Skipping Prisma initial connection", {
            reason: "PRISMA_SKIP_INITIAL_CONNECT",
        });
        globalPrisma.prismaConnectPromise = Promise.resolve();
    }
    else {
        globalPrisma.prismaConnectPromise = Promise.all([
            connectAcrossCandidates().catch((error) => {
                globalPrisma.prisma = undefined;
                throw error;
            }),
            initializeOnPremiseDevClient(), // LOCAL client (optional)
            initializeOnPremiseExperimentClient(), // EXPERIMENT client (optional)
        ]).then(async () => {
            prodPrismaClient = prismaClient;
            prodTransport = lastPrismaTransport;
            // Wait for heartbeat listeners to process initial events
            // This ensures getDatabaseStats() returns populated stats immediately after ensurePrisma() resolves
            await new Promise((resolve) => setTimeout(resolve, 50));
        });
    }
}
